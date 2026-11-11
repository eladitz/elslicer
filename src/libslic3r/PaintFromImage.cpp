#include "PaintFromImage.hpp"

#include "TextureToColor/ColorUtils.hpp"

#include <tbb/blocked_range.h>
#include <tbb/parallel_for.h>

#include <algorithm>
#include <cmath>
#include <limits>
#include <map>

namespace Slic3r {
namespace paint_from_image {

namespace {

// Average of the photo over a few pixels around (x, y), so one stray pixel does not decide a facet.
bool photo_colour(const Photo &photo, double x, double y, RGB &out)
{
    const int cx = int(std::floor(x)), cy = int(std::floor(y));
    if (cx < 0 || cy < 0 || cx >= photo.width || cy >= photo.height)
        return false;
    std::size_t sum[3] = {0, 0, 0}, count = 0;
    for (int dy = -1; dy <= 1; ++dy)
        for (int dx = -1; dx <= 1; ++dx) {
            const int px = std::clamp(cx + dx, 0, photo.width - 1), py = std::clamp(cy + dy, 0, photo.height - 1);
            const unsigned char *p = photo.rgba + (std::size_t(py) * photo.width + px) * 4;
            if (p[3] < 128)
                continue; // transparent pixels of a cut-out photo
            sum[0] += p[0];
            sum[1] += p[1];
            sum[2] += p[2];
            ++count;
        }
    if (count == 0)
        return false;
    out = {sum[0] / count, sum[1] / count, sum[2] / count};
    return true;
}

// sRGB 0..255 to CIE Lab (D65).
Vec3d to_lab(const RGB &rgb)
{
    auto lin = [](std::size_t c) {
        const double v = double(c) / 255.;
        return v <= 0.04045 ? v / 12.92 : std::pow((v + 0.055) / 1.055, 2.4);
    };
    const double r = lin(rgb[0]), g = lin(rgb[1]), b = lin(rgb[2]);
    const double x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
    const double y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const double z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
    auto f = [](double t) { return t > 0.008856 ? std::cbrt(t) : 7.787 * t + 16. / 116.; };
    return {116. * f(y) - 16., 500. * (f(x) - f(y)), 200. * (f(y) - f(z))};
}

// Scales the light in the photo (in linear light, so colours keep their hue). 1 leaves it as it is.
RGB brighten(const RGB &rgb, double brightness)
{
    if (brightness == 1.)
        return rgb;
    RGB out;
    for (int i = 0; i < 3; ++i) {
        const double v   = double(rgb[i]) / 255.;
        double       lin = (v <= 0.04045 ? v / 12.92 : std::pow((v + 0.055) / 1.055, 2.4)) * brightness;
        lin              = std::min(1., lin);
        const double s   = lin <= 0.0031308 ? 12.92 * lin : 1.055 * std::pow(lin, 1. / 2.4) - 0.055;
        out[i]           = std::size_t(std::lround(s * 255.));
    }
    return out;
}

double to_linear(std::size_t c)
{
    const double v = double(c) / 255.;
    return v <= 0.04045 ? v / 12.92 : std::pow((v + 0.055) / 1.055, 2.4);
}

std::size_t to_srgb(double lin)
{
    lin            = std::clamp(lin, 0., 1.);
    const double s = lin <= 0.0031308 ? 12.92 * lin : 1.055 * std::pow(lin, 1. / 2.4) - 0.055;
    return std::size_t(std::lround(s * 255.));
}

bool to_screen(const View &view, const Vec3d &world, Vec2d &screen)
{
    const Vec4d clip = view.projection_view * Vec4d(world.x(), world.y(), world.z(), 1.);
    if (clip.w() <= 0.)
        return false;
    const double nx = clip.x() / clip.w(), ny = clip.y() / clip.w();
    screen = {view.viewport[0] + (0.5 + 0.5 * nx) * view.viewport[2], view.viewport[1] + (0.5 - 0.5 * ny) * view.viewport[3]};
    return true;
}

} // namespace

std::vector<Sample> sample_photo(const indexed_triangle_set &its, const AABBMesh &aabb, const Transform3d &world, const View &view,
                                 const Photo &photo)
{
    const std::size_t n = its.indices.size();
    if (photo.rgba == nullptr || photo.width <= 0 || photo.height <= 0 || photo.size.x() <= 0. || photo.size.y() <= 0.)
        return {};
    const Transform3d  to_mesh      = world.inverse();
    const Matrix3d     normal_world = world.linear().inverse().transpose();
    const Vec3d        camera_mesh  = to_mesh * view.camera_position;
    const Vec3d        forward_mesh = (to_mesh.linear() * view.camera_forward).normalized();
    std::vector<Sample> per_facet(n, Sample{-1, 0.f, {0, 0, 0}, Vec3f::Zero()});

    tbb::parallel_for(tbb::blocked_range<std::size_t>(0, n), [&](const tbb::blocked_range<std::size_t> &range) {
        for (std::size_t f = range.begin(); f < range.end(); ++f) {
            const auto  &t = its.indices[f];
            const Vec3d  a = its.vertices[t[0]].cast<double>(), b = its.vertices[t[1]].cast<double>(), c = its.vertices[t[2]].cast<double>();
            const Vec3d  centre_mesh = (a + b + c) / 3.;
            const Vec3d  cross       = (b - a).cross(c - a);
            if (cross.squaredNorm() <= 0.)
                continue;
            // Direction from the facet towards the camera, in mesh coordinates.
            const Vec3d to_camera = view.perspective ? Vec3d((camera_mesh - centre_mesh).normalized()) : Vec3d(-forward_mesh);
            if (cross.dot(to_camera) <= 0.)
                continue; // faces away
            const Vec3d centre_world = world * centre_mesh;
            Vec2d       screen;
            if (!to_screen(view, centre_world, screen))
                continue;
            const double u = (screen.x() - photo.top_left.x()) / photo.size.x() * photo.width;
            const double v = (screen.y() - photo.top_left.y()) / photo.size.y() * photo.height;
            RGB rgb;
            if (!photo_colour(photo, u, v, rgb))
                continue;
            // Hidden behind another facet of the mesh?
            const double eps = 1e-3 * std::sqrt(std::sqrt(cross.squaredNorm())) + 1e-4;
            const AABBMesh::hit_result hit = aabb.query_ray_hit(centre_mesh + to_camera * eps, to_camera);
            if (hit.is_hit() && (!view.perspective || hit.distance() < (camera_mesh - centre_mesh).norm()))
                continue;
            const Vec3d  n_world = (normal_world * cross).normalized();
            const double area    = 0.5 * (world.linear() * (b - a)).cross(world.linear() * (c - a)).norm();
            const Vec3d  to_cam_world = view.perspective ? Vec3d((view.camera_position - centre_world).normalized()) : Vec3d(-view.camera_forward.normalized());
            per_facet[f] = Sample{int(f), float(area * std::max(0., n_world.dot(to_cam_world))), rgb, n_world.cast<float>()};
        }
    });

    std::vector<Sample> out;
    for (const Sample &s : per_facet)
        if (s.facet >= 0 && s.weight > 0.f)
            out.push_back(s);
    return out;
}

Result assign_filaments(const std::vector<int> &part_of_facet, const std::vector<Sample> &samples, const std::vector<RGB> &filaments,
                        const std::vector<bool> &allowed, double brightness, std::size_t photo_colours_wanted)
{
    namespace cu = tex2color::color_utils;
    Result result;
    result.facet_filament.assign(part_of_facet.size(), -1);
    if (filaments.empty() || samples.empty())
        return result;

    int parts = 0;
    for (int p : part_of_facet)
        parts = std::max(parts, p + 1);

    // Nearest filament for each sample, by CIE76 in Lab after brightening the photo: a photo's shadows read darker than
    // the filament, and brightening keeps shadowed skin from becoming brown. Filaments not allowed are skipped.
    std::vector<Vec3d> filament_lab;
    for (const RGB &f : filaments)
        filament_lab.push_back(to_lab(f));
    std::map<RGB, int> nearest_cache;
    auto nearest = [&](const RGB &rgb) {
        auto it = nearest_cache.find(rgb);
        if (it != nearest_cache.end())
            return it->second;
        const Vec3d lab = to_lab(brighten(rgb, brightness));
        int    id   = 0;
        double best = std::numeric_limits<double>::max();
        for (std::size_t i = 0; i < filament_lab.size(); ++i) {
            if (!allowed.empty() && !allowed[i])
                continue;
            const double dist = (lab - filament_lab[i]).squaredNorm();
            if (dist < best) {
                best = dist;
                id   = int(i);
            }
        }
        nearest_cache.emplace(rgb, id);
        return id;
    };

    // A part's colour is judged from its lit side. Shadow only darkens, so the brighter samples show the colour of the
    // surface; the brightest tenth is left out as highlights and reflections.
    struct Lit { double luminance, weight; Vec3d linear; };
    std::vector<std::vector<Lit>> lit(parts);
    for (const Sample &s : samples)
        if (s.facet < int(part_of_facet.size()) && part_of_facet[s.facet] >= 0) {
            const Vec3d linear(to_linear(s.rgb[0]), to_linear(s.rgb[1]), to_linear(s.rgb[2]));
            lit[part_of_facet[s.facet]].push_back({0.2126 * linear.x() + 0.7152 * linear.y() + 0.0722 * linear.z(), s.weight, linear});
        }
    std::vector<int> part_filament(parts, -1);
    for (int p = 0; p < parts; ++p) {
        std::vector<Lit> &l = lit[p];
        if (l.empty())
            continue;
        std::sort(l.begin(), l.end(), [](const Lit &a, const Lit &b) { return a.luminance < b.luminance; });
        double total = 0.;
        for (const Lit &x : l)
            total += x.weight;
        Vec3d  sum = Vec3d::Zero();
        double w = 0., acc = 0.;
        for (const Lit &x : l) {
            const double from = acc / total, to = (acc + x.weight) / total;
            acc += x.weight;
            const double overlap = std::max(0., std::min(to, 0.9) - std::max(from, 0.5)) * total;
            if (overlap > 0.) {
                sum += overlap * x.linear;
                w += overlap;
            }
        }
        if (w <= 0.)
            continue;
        sum /= w;
        part_filament[p] = nearest({to_srgb(sum.x()), to_srgb(sum.y()), to_srgb(sum.z())});
    }
    for (std::size_t f = 0; f < part_of_facet.size(); ++f)
        if (part_of_facet[f] >= 0)
            result.facet_filament[f] = part_filament[part_of_facet[f]];

    // Main colours of the photo over the model: k-means on the samples, then their share of the sampled area.
    if (photo_colours_wanted > 0) {
        std::vector<cu::Color> colours;
        const std::size_t      stride = std::max<std::size_t>(1, samples.size() / 20000);
        for (std::size_t i = 0; i < samples.size(); i += stride)
            colours.push_back(samples[i].rgb);
        cu::ClusterParameters params;
        params.cluster_k = std::min(photo_colours_wanted, colours.size());
        std::vector<cu::Color> centres = cu::cluster_k_means(colours, params);
        std::vector<double>    share(centres.size(), 0.);
        double                 total = 0.;
        for (const Sample &s : samples) {
            std::size_t id = 0;
            if (!cu::calc_nearest_color_id(centres, s.rgb, id))
                continue;
            share[id] += s.weight;
            total += s.weight;
        }
        for (std::size_t i = 0; i < centres.size(); ++i) {
            PhotoColour pc;
            pc.rgb      = centres[i];
            pc.share    = total > 0. ? share[i] / total : 0.;
            pc.filament = nearest(centres[i]);
            pc.distance = cu::calc_rgb_color_difference_by_ciede2000(brighten(centres[i], brightness), filaments[pc.filament]);
            result.photo_colours.push_back(pc);
        }
        std::sort(result.photo_colours.begin(), result.photo_colours.end(),
                  [](const PhotoColour &a, const PhotoColour &b) { return a.share > b.share; });
    }
    return result;
}

} // namespace paint_from_image
} // namespace Slic3r
