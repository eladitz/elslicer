#include "FoldBox.hpp"

#include <algorithm>
#include <cmath>

#include "BoundingBox.hpp"
#include "ClipperUtils.hpp"
#include "Polygon.hpp"
#include "Tesselate.hpp"
#include "TriangleMesh.hpp"

namespace Slic3r { namespace FoldBox {

namespace {

// Sizes every tray shares.
struct Sheet
{
    double t, h, g, c; // sheet, hinge, groove, clearance
};

// One tray, by the room inside it.
struct TrayShape
{
    double L, W, H;
    double front_height, back_height; // the side walls, from the floor's top
    bool   notch_front{false}, notch_back{false};
    double notch_radius{0.};
    bool   lid{false}; // a mailer's lid on the back wall, tucking inside the front wall
};

struct Parts
{
    Polygons panels, grooves, holes;
};

Polygon make_polygon(const std::vector<Vec2d> &points)
{
    Polygon polygon;
    for (const Vec2d &p : points)
        polygon.points.emplace_back(Point::new_scale(p.x(), p.y()));
    polygon.make_counter_clockwise();
    return polygon;
}

// Points given in a panel's own frame, placed on the sheet by map.
template<class Map> void add(Polygons &to, const Map &map, std::vector<Vec2d> points)
{
    for (Vec2d &p : points)
        p = map(p.x(), p.y());
    to.push_back(make_polygon(points));
}

template<class Map> void add_rect(Polygons &to, const Map &map, double a0, double b0, double a1, double b1)
{
    add(to, map, {{a0, b0}, {a1, b0}, {a1, b1}, {a0, b1}});
}

void add_circle(Polygons &to, const Vec2d &centre, double radius)
{
    std::vector<Vec2d> points;
    for (int i = 0; i < 48; ++i)
        points.emplace_back(centre + radius * Vec2d(std::cos(2. * PI * i / 48), std::sin(2. * PI * i / 48)));
    to.push_back(make_polygon(points));
}

// The floor is [0, Lf] x [0, W]. The side walls fold up along y = 0 (front) and y = W (back), the end walls along
// x = 0 and x = Lf. The ends are thicker than the sides: an end wall, a side wall's ear and the inner panel, with
// clearance between, so the floor is longer than the room by four sheets and four clearances.
Piece tray(const std::string &name, const TrayShape &d, const Sheet &s)
{
    const double t = s.t, g = s.g, c = s.c;
    const double Lf = d.L + 4. * t + 4. * c, W = d.W, H = d.H;
    Parts parts;
    const auto plain = [](double x, double y) { return Vec2d(x, y); };
    add_rect(parts.panels, plain, 0., 0., Lf, W);

    // The side walls stop an ear's thickness short of the end walls, so the ears fold in inside them.
    const double x0 = t + c, x1 = Lf - t - c;
    const double ear = std::min(0.5 * W - 1., H);
    for (const bool back : {false, true}) {
        const double height = back ? d.back_height : d.front_height;
        const auto   map    = [back, W](double x, double v) { return back ? Vec2d(x, W + v) : Vec2d(x, -v); };
        add_rect(parts.grooves, map, x0, 0., x1, g);
        add_rect(parts.panels, map, x0, g, x1, g + height);
        // The ears clear the floor and stay under the end's rim, and taper at the free end to tuck in easily.
        const double v0 = g + c, v1 = g + H - c;
        const double k  = 0.35 * std::min(ear, v1 - v0), k0 = std::min(1., k);
        for (const bool right : {false, true}) {
            const auto emap = [&map, right, x0, x1](double u, double v) { return map(right ? x1 + u : x0 - u, v); };
            add_rect(parts.grooves, emap, 0., v0, g, v1);
            add(parts.panels, emap, {{g, v0}, {g, v1}, {g + ear - k, v1}, {g + ear, v1 - k}, {g + ear, v0 + k0}, {g + ear - k0, v0}});
        }
        if (d.notch_radius > 0. && (back ? d.notch_back : d.notch_front))
            add_circle(parts.holes, map(0.5 * Lf, g + height), std::min(d.notch_radius, 0.5 * height));
    }

    if (d.lid) {
        const auto   map   = [W](double x, double v) { return Vec2d(x, W + v); };
        const double hb    = d.back_height;
        // From the back wall's inside to the inside of the flap, which sits against the front wall.
        const double lid_w = W - t - c, v_lid = 2. * g + hb;
        add_rect(parts.grooves, map, x0, g + hb, x1, v_lid);
        // As long as the box outside, to cover the ends' rims.
        add_rect(parts.panels, map, -t, v_lid, Lf + t, v_lid + lid_w);
        // The flap goes between the inner end panels.
        const double fx0 = 2. * t + 3. * c, fx1 = Lf - fx0;
        const double flap = std::clamp(0.6 * H, 5., H), k = std::min(0.5 * flap, 5.);
        const double f0   = v_lid + lid_w + g;
        add_rect(parts.grooves, map, fx0, v_lid + lid_w, fx1, f0);
        add(parts.panels, map, {{fx0, f0}, {fx1, f0}, {fx1, f0 + flap - k}, {fx1 - k, f0 + flap}, {fx0 + k, f0 + flap}, {fx0, f0 + flap - k}});
    }

    // Each end: wall, rim, inner panel and tabs, outward from the floor. The rim is as wide as what it goes over:
    // an ear, with clearance on both sides.
    const double rim = t + 2. * c, tab = t + 0.3, tab_w = std::clamp(0.2 * W, 4., 20.);
    for (const bool right : {false, true}) {
        // u outward from the floor's edge; a negative u is on the floor.
        const auto   map = [right, Lf](double u, double y) { return Vec2d(right ? Lf + u : -u, y); };
        const double y0 = c, y1 = W - c;
        double       u  = 0.;
        const auto   strip = [&](Polygons &to, double width) { add_rect(to, map, u, y0, u + width, y1); u += width; };
        strip(parts.grooves, g);
        strip(parts.panels, H);
        strip(parts.grooves, g);
        strip(parts.panels, rim);
        strip(parts.grooves, g);
        strip(parts.panels, H);
        for (const double yc : {0.25 * W, 0.75 * W}) {
            const double a = yc - 0.5 * tab_w, b = yc + 0.5 * tab_w, k = std::min(0.5 * tab, 0.25 * tab_w);
            add(parts.panels, map, {{u, a}, {u + tab, a + k}, {u + tab, b - k}, {u, b}});
            // Down inside the ear, so through the floor just inside it.
            add_rect(parts.holes, map, -(2. * t + 3. * c), a - c, -(t + c), b + c);
        }
    }

    Piece piece;
    piece.name   = name;
    piece.sheet  = diff_ex(union_(parts.panels), parts.holes);
    piece.hinges = diff_ex(union_(parts.grooves), parts.holes);
    return piece;
}

} // namespace

BoundingBoxf Piece::size() const
{
    BoundingBox box = get_extents(sheet);
    box.merge(get_extents(hinges));
    return BoundingBoxf(unscale(box.min), unscale(box.max));
}

Layout make(const Params &params)
{
    Layout layout;
    const double t = params.sheet, h = params.hinge;
    if (t < 0.2 || h < 0.08) {
        layout.problem = Problem::TooThin;
        return layout;
    }
    if (h >= t) {
        layout.problem = Problem::HingeTooThick;
        return layout;
    }
    const Sheet s{t, h, params.groove > 0. ? params.groove : 2. * (t - h), std::max(0., params.clearance)};
    const double end = 6. * t + 4. * s.c; // how much longer a tray is outside than inside
    const double fit = std::max(0., params.lid_fit);

    // The box closed, by the room inside the tray.
    const auto outside = [&](const Vec3d &in) {
        switch (params.style) {
        case Style::Mailer: return Vec3d(in.x() + end, in.y() + 2. * t, in.z() + 3. * t + s.c);
        case Style::TrayAndLid: return Vec3d(in.x() + end + 2. * fit + end, in.y() + 4. * t + 2. * fit, in.z() + 3. * t);
        default: return Vec3d(in.x() + end, in.y() + 2. * t, in.z() + 2. * t);
        }
    };
    Vec3d in(params.length, params.width, params.height);
    if (params.outside)
        in -= outside(Vec3d::Zero());
    if (in.x() < 15. || in.y() < 15. || in.z() < 8.) {
        layout.problem = Problem::TooSmall;
        return layout;
    }
    layout.inside  = in;
    layout.outside = outside(in);

    const double notch = std::clamp(in.x() / 8., 5., 10.);
    switch (params.style) {
    case Style::Tray: layout.pieces.push_back(tray("Box", {in.x(), in.y(), in.z(), in.z(), in.z()}, s)); break;
    case Style::Mailer: {
        TrayShape shape{in.x(), in.y(), in.z(), in.z() + t, in.z() + t + s.c};
        shape.lid          = true;
        shape.notch_front  = params.thumb_notch;
        shape.notch_radius = notch;
        layout.pieces.push_back(tray("Box", shape, s));
        break;
    }
    case Style::TrayAndLid: {
        layout.pieces.push_back(tray("Box", {in.x(), in.y(), in.z(), in.z(), in.z()}, s));
        // Over the tray's outside, coming down at most to the bed.
        const Vec3d  tray_out(in.x() + end, in.y() + 2. * t, in.z() + 2. * t);
        const double depth = std::min(params.lid_depth > 0. ? params.lid_depth : std::clamp(in.z() / 3., 10., in.z()), tray_out.z());
        TrayShape    lid{tray_out.x() + 2. * fit, tray_out.y() + 2. * fit, depth, depth, depth};
        lid.notch_front = lid.notch_back = params.thumb_notch;
        lid.notch_radius = notch;
        layout.pieces.push_back(tray("Lid", lid, s));
        break;
    }
    }
    return layout;
}

indexed_triangle_set extrude(const ExPolygons &shape, double z0, double z1)
{
    indexed_triangle_set its;
    const auto triangle = [&its](const Vec3d &a, const Vec3d &b, const Vec3d &c) {
        const int n = int(its.vertices.size());
        its.vertices.emplace_back(a.cast<float>());
        its.vertices.emplace_back(b.cast<float>());
        its.vertices.emplace_back(c.cast<float>());
        its.indices.emplace_back(n, n + 1, n + 2);
    };
    for (const auto &[z, flip] : {std::pair{z1, NORMALS_UP}, std::pair{z0, NORMALS_DOWN}}) {
        const std::vector<Vec3d> cap = triangulate_expolygons_3d(shape, z, flip);
        for (size_t i = 0; i + 2 < cap.size(); i += 3)
            triangle(cap[i], cap[i + 1], cap[i + 2]);
    }
    // Contours run counter-clockwise and holes clockwise, so the solid is on the left of every edge.
    for (const ExPolygon &expolygon : shape)
        for (const Polygon &polygon : to_polygons(expolygon))
            for (size_t i = 0; i < polygon.size(); ++i) {
                const Vec2d a = unscale(polygon[i]), b = unscale(polygon[(i + 1) % polygon.size()]);
                const Vec3d a0(a.x(), a.y(), z0), b0(b.x(), b.y(), z0), a1(a.x(), a.y(), z1), b1(b.x(), b.y(), z1);
                triangle(a0, b0, b1);
                triangle(a0, b1, a1);
            }
    its_merge_vertices(its);
    return its;
}

}} // namespace Slic3r::FoldBox
