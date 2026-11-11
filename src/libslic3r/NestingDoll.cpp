#include "NestingDoll.hpp"

#include <algorithm>
#include <cmath>
#include <optional>
#include <random>

#include "AABBMesh.hpp"
#include "BoundingBox.hpp"
#include "Geometry.hpp"

namespace Slic3r { namespace NestingDoll {

namespace {

// Off the axes, so a ray doesn't run exactly along an edge of an axis-aligned box.
Vec3d tilted(const Vec3d &axis) { return (axis + Vec3d(0.0123, 0.0217, 0.0071)).normalized(); }

// Points spread over the surface, close enough that a copy can't pass through a wall between two of them.
std::vector<Vec3d> surface_points(const indexed_triangle_set &mesh, double spacing)
{
    std::vector<Vec3d> points;
    const size_t stride = std::max<size_t>(1, mesh.vertices.size() / 40000);
    for (size_t i = 0; i < mesh.vertices.size(); i += stride)
        points.emplace_back(mesh.vertices[i].cast<double>());
    for (const stl_triangle_vertex_indices &face : mesh.indices) {
        const Vec3d  a = mesh.vertices[face[0]].cast<double>(), b = mesh.vertices[face[1]].cast<double>(), c = mesh.vertices[face[2]].cast<double>();
        const double longest = std::max({(b - a).norm(), (c - b).norm(), (a - c).norm()});
        const int    n       = std::clamp(int(std::ceil(longest / spacing)), 1, 8);
        for (int i = 0; i <= n; ++i)
            for (int j = 0; i + j <= n; ++j)
                if (n == 1 ? i == 0 && j == 0 : (i > 0 && j > 0 && i + j < n))
                    points.emplace_back(n == 1 ? Vec3d((a + b + c) / 3.) : Vec3d(a + (b - a) * double(i) / n + (c - a) * double(j) / n));
    }
    // Checked in a mixed order, so a copy that doesn't fit is usually found out early.
    std::shuffle(points.begin(), points.end(), std::mt19937(7));
    return points;
}

} // namespace

Fit fit_inside(const indexed_triangle_set &mesh, double gap)
{
    Fit fit;
    fit.problem = Problem::NotHollow;
    if (mesh.indices.empty())
        return fit;
    gap = std::max(gap, 0.05);
    const AABBMesh tree(mesh);
    BoundingBoxf3  box;
    for (const Vec3f &v : mesh.vertices)
        box.merge(v.cast<double>());

    const Vec3d up = tilted(Vec3d::UnitZ());
    // Inside the solid if the first surface a ray meets faces the same way as the ray.
    const auto in_solid = [&](const Vec3d &p) {
        const AABBMesh::hit_result hit = tree.query_ray_hit(p, up);
        return hit.is_hit() && hit.normal().dot(up) > 0.;
    };
    // How far an inside wall is from p along dir, or nothing if the ray leaves or p is in the solid.
    const auto wall = [&](const Vec3d &p, const Vec3d &axis) -> std::optional<Vec3d> {
        const Vec3d                dir = tilted(axis);
        const AABBMesh::hit_result hit = tree.query_ray_hit(p, dir);
        if (!hit.is_hit() || hit.normal().dot(dir) > 0.)
            return std::nullopt;
        return hit.position();
    };

    // The cavity: the lowest empty point up the middle with walls all round, and a floor under it, or else a roof
    // over it, as in a lid or the top of an egg printed opening down.
    std::optional<Vec3d> target;
    bool                 hanging = false;
    for (int i = 1; i < 40 && !target; ++i) {
        const Vec3d p(box.center().x(), box.center().y(), box.min.z() + box.size().z() * i / 40.);
        if (in_solid(p))
            continue;
        const auto xp = wall(p, Vec3d::UnitX()), xm = wall(p, -Vec3d::UnitX()), yp = wall(p, Vec3d::UnitY()), ym = wall(p, -Vec3d::UnitY());
        if (!xp || !xm || !yp || !ym)
            continue;
        const Vec2d middle(0.5 * (xp->x() + xm->x()), 0.5 * (yp->y() + ym->y()));
        if (const auto floor = wall(p, -Vec3d::UnitZ()))
            target = Vec3d(middle.x(), middle.y(), floor->z() + gap);
        else if (const auto roof = wall(p, Vec3d::UnitZ())) {
            target  = Vec3d(middle.x(), middle.y(), roof->z() - gap);
            hanging = true;
        }
    }
    if (!target)
        return fit;

    // The copy's bottom middle goes to the floor, or its top middle to the roof, and it stays within the object's
    // height on the open side.
    const Vec3d              base(box.center().x(), box.center().y(), hanging ? box.max.z() : box.min.z());
    const std::vector<Vec3d> points = surface_points(mesh, std::max(0.5, box.size().norm() / 200.));
    const double             gap2   = (gap - 1e-4) * (gap - 1e-4);
    const auto fits = [&](double scale) {
        return std::none_of(points.begin(), points.end(), [&](const Vec3d &p) {
            const Vec3d q = *target + scale * (p - base);
            return q.z() > box.max.z() || q.z() < box.min.z() || tree.squared_distance(q) < gap2 || in_solid(q);
        });
    };

    fit.problem = Problem::NoRoom;
    double low = 0.02, high = 1.;
    if (!fits(low))
        return fit;
    for (int i = 0; i < 18; ++i) {
        const double mid = 0.5 * (low + high);
        (fits(mid) ? low : high) = mid;
    }
    fit.problem = Problem::None;
    fit.from    = base;
    fit.to      = *target;
    fit.scale   = low;
    fit.transform = at_scale(fit, low);
    return fit;
}

Transform3d at_scale(const Fit &fit, double scale)
{
    return Geometry::translation_transform(fit.to) * Geometry::scale_transform(scale) * Geometry::translation_transform(-fit.from);
}

std::vector<std::vector<Fit>> nest_together(const std::vector<indexed_triangle_set> &meshes, double gap, int count)
{
    std::vector<std::vector<Fit>>     out(meshes.size());
    std::vector<indexed_triangle_set> current = meshes;
    std::vector<Transform3d>          total(meshes.size(), Transform3d::Identity());
    double                            scale = 1.;
    for (int level = 0; level < count; ++level) {
        std::vector<Fit> fits;
        double           common = 1.;
        for (const indexed_triangle_set &mesh : current) {
            fits.push_back(fit_inside(mesh, gap));
            common = std::min(common, fits.back().scale);
        }
        const auto failed = std::find_if(fits.begin(), fits.end(), [](const Fit &f) { return f.problem != Problem::None; });
        if (failed != fits.end()) {
            if (level == 0)
                for (size_t i = 0; i < meshes.size(); ++i)
                    out[i].push_back(fits[i]);
            break;
        }
        // The same scale for every piece, so pieces made to go together still go together.
        scale *= common;
        for (size_t i = 0; i < meshes.size(); ++i) {
            const Transform3d step = at_scale(fits[i], common);
            total[i]               = step * total[i];
            Fit fit                = fits[i];
            fit.scale              = scale;
            fit.transform          = total[i];
            out[i].push_back(fit);
            for (Vec3f &v : current[i].vertices)
                v = (step * v.cast<double>()).cast<float>();
        }
    }
    return out;
}

std::vector<Fit> nest(const indexed_triangle_set &mesh, double gap, int count)
{
    return nest_together({mesh}, gap, count).front();
}

}} // namespace Slic3r::NestingDoll
