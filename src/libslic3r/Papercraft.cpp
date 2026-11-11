#include "Papercraft.hpp"

#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <functional>
#include <map>
#include <numeric>
#include <queue>
#include <random>
#include <string>

#include "BoundingBox.hpp"
#include "ClipperUtils.hpp"
#include "ExPolygon.hpp"
#include "Polygon.hpp"
#include "QuadricEdgeCollapse.hpp"
#include "TriangleMesh.hpp"

namespace Slic3r { namespace Papercraft {

namespace {

// ---------------------------------------------------------------------------
// Animal shapes
// ---------------------------------------------------------------------------

// What makes one animal's face, at a head 150 mm wide. Ears stand on the top edge between ear_in and ear_out
// (x, from the middle); the snout comes forward by snout and down by drop.
struct Look
{
    double ear_in, ear_out, ear_height, ear_tilt;
    bool   round_ears;
    double snout, snout_width, drop;
    bool   tufts; // cheek fur pointing out and down
};

Look look_of(Animal animal)
{
    switch (animal) {
    case Animal::Wolf: return {18., 50., 48., 4., false, 48., 1.0, 6., true};
    case Animal::Cat: return {14., 48., 38., 2., false, 16., 1.1, 0., false};
    case Animal::Bear: return {26., 50., 24., 0., true, 30., 1.25, 4., false};
    case Animal::Rabbit: return {10., 36., 110., 8., false, 14., 0.9, 0., false};
    default: return {16., 50., 58., 6., false, 40., 0.85, 4., true};
    }
}

// A shape symmetric about x = 0, built from its right half.
struct Builder
{
    std::vector<Vec3d>              vertices;
    std::vector<int>                mirror;
    std::vector<std::array<int, 3>> faces;

    // The vertex at x and, unless it is on the middle, its mirror image. Returns the one at x.
    int add(double x, double y, double z)
    {
        const int i = int(vertices.size());
        vertices.emplace_back(x, y, z);
        if (x == 0.) {
            mirror.push_back(i);
            return i;
        }
        vertices.emplace_back(-x, y, z);
        mirror.push_back(i + 1);
        mirror.push_back(i);
        return i;
    }
    // A face of the right half, counter-clockwise seen from outside, and its mirror image.
    void face(int a, int b, int c)
    {
        faces.push_back({a, b, c});
        faces.push_back({mirror[a], mirror[c], mirror[b]});
    }
};

// x across the face, y up, z forward, with the eyes at y = 0 and 32 mm apart, the face's surface at about z = 10
// there. Everything stays in front of an adult face: the snout covers the nose, the bottom edge stays above the
// mouth and the sides wrap back to the temples.
Shape build(Animal animal, double width)
{
    const Look l = look_of(animal);
    Builder    b;
    const auto y_top = [](double x) { return 70. - x * x / 220.; };
    const auto z_top = [](double x) { return 14. - 14. * (x / 56.) * (x / 56.); };
    const double s = l.snout, d = l.drop, w = l.snout_width;

    const int c_top    = b.add(0., 70., 14.);
    const int c_brow   = b.add(0., 22., 26.);
    const int c_bridge = b.add(0., -4., 28.);
    const int c_snout  = b.add(0., -16., 30. + 0.6 * s);
    const int c_nose   = b.add(0., -32. - d, 34. + s);
    const int c_chin   = b.add(0., -46. - d, 26. + 0.75 * s);

    const double mid      = (l.ear_in + l.ear_out) / 2.;
    const int    ear_in   = b.add(l.ear_in, y_top(l.ear_in), z_top(l.ear_in));
    const int    ear_mid  = b.add(mid, y_top(mid) + 1., z_top(mid) + 8.);
    const int    ear_out  = b.add(l.ear_out, y_top(l.ear_out), z_top(l.ear_out));
    const int    top_side = b.add(56., y_top(56.), 0.);
    const int    brow_out = b.add(40., 28., 14.);
    const int    temple   = b.add(68., 22., -16.);
    const int    e_in     = b.add(13., 2., 24.);
    const int    e_top    = b.add(32., 16., 20.);
    const int    e_out    = b.add(51., 4., 8.);
    const int    e_bot    = b.add(30., -10., 20.);
    const int    side_low = b.add(66., -22., -14.);
    const int    cheek    = b.add(42., -28., 16.);
    const int    jaw      = b.add(40., -44., 8.);
    const int    sn_top   = b.add(14. * w, -20., 26. + 0.55 * s);
    const int    sn_bot   = b.add(15. * w, -40. - d, 22. + 0.7 * s);
    const int    tuft     = l.tufts ? b.add(78., -40., -4.) : -1;

    // Forehead.
    b.face(c_top, c_brow, ear_in);
    b.face(ear_in, c_brow, brow_out);
    b.face(ear_in, brow_out, ear_mid);
    b.face(ear_mid, brow_out, ear_out);
    b.face(ear_out, brow_out, top_side);
    b.face(top_side, brow_out, temple);
    // Round the eye.
    b.face(c_brow, c_bridge, e_in);
    b.face(c_brow, e_in, e_top);
    b.face(c_brow, e_top, brow_out);
    b.face(brow_out, e_top, e_out);
    b.face(brow_out, e_out, temple);
    b.face(temple, e_out, side_low);
    b.face(e_out, e_bot, cheek);
    b.face(e_out, cheek, side_low);
    b.face(c_bridge, e_bot, e_in);
    // Snout and cheeks.
    b.face(c_bridge, c_snout, sn_top);
    b.face(c_bridge, sn_top, e_bot);
    b.face(e_bot, sn_top, cheek);
    b.face(c_snout, c_nose, sn_top);
    b.face(sn_top, c_nose, sn_bot);
    b.face(c_nose, c_chin, sn_bot);
    b.face(sn_top, sn_bot, cheek);
    b.face(sn_bot, jaw, cheek);
    if (tuft >= 0) {
        b.face(cheek, jaw, tuft);
        b.face(cheek, tuft, side_low);
    } else
        b.face(cheek, jaw, side_low);

    // Ears, with a ridge down the middle.
    const double tip_x = mid + l.ear_tilt, tip_y = y_top(mid) + l.ear_height, tip_z = z_top(mid) - 2.;
    if (l.round_ears) {
        const double half = 0.3 * (l.ear_out - l.ear_in);
        const int    ta = b.add(tip_x - half, tip_y, tip_z), tb = b.add(tip_x + half, tip_y - 3., tip_z);
        b.face(ear_in, ear_mid, ta);
        b.face(ear_mid, tb, ta);
        b.face(ear_mid, ear_out, tb);
    } else {
        const int tip = b.add(tip_x, tip_y, tip_z);
        b.face(ear_in, ear_mid, tip);
        b.face(ear_mid, ear_out, tip);
    }

    Shape shape;
    // Strap holes in the side pieces, at the temples.
    const Vec3d hole = 0.45 * b.vertices[temple] + 0.2 * b.vertices[side_low] + 0.35 * b.vertices[e_out];
    shape.holes      = {hole, Vec3d(-hole.x(), hole.y(), hole.z())};

    const double k = width / 150.;
    for (const Vec3d &v : b.vertices)
        shape.mesh.vertices.emplace_back((k * v).cast<float>());
    for (const auto &f : b.faces)
        shape.mesh.indices.emplace_back(f[0], f[1], f[2]);
    for (Vec3d &hole : shape.holes)
        hole *= k;
    return shape;
}

// ---------------------------------------------------------------------------
// Unfolding
// ---------------------------------------------------------------------------

Polygon polygon_of(std::initializer_list<Vec2d> points)
{
    Polygon polygon;
    for (const Vec2d &p : points)
        polygon.points.emplace_back(Point::new_scale(p.x(), p.y()));
    polygon.make_counter_clockwise();
    return polygon;
}

// A band half wide either side of a to b, longer by extend at each end.
Polygon band(const Vec2d &a, const Vec2d &b, double half, double extend = 0.)
{
    const Vec2d d = (b - a).normalized(), n(-d.y(), d.x());
    const Vec2d a1 = a - d * extend, b1 = b + d * extend;
    return polygon_of({a1 - n * half, b1 - n * half, b1 + n * half, a1 + n * half});
}

Polygon circle(const Vec2d &centre, double radius)
{
    Polygon polygon;
    for (int i = 0; i < 32; ++i)
        polygon.points.emplace_back(Point::new_scale(centre.x() + radius * std::cos(2. * PI * i / 32), centre.y() + radius * std::sin(2. * PI * i / 32)));
    return polygon;
}

// n in seven-segment digits height high, centred on centre, reading along up turned a right angle clockwise.
Polygons number_shape(int n, const Vec2d &centre, const Vec2d &up, double height, double stroke)
{
    static const char *segments[10] = {"abcdef", "bc", "abged", "abgcd", "fgbc", "afgcd", "afgedc", "abc", "abcdefg", "abcdfg"};
    const std::string digits = std::to_string(n);
    const double      w = 0.55 * height, gap = 0.35 * height;
    const double      total = digits.size() * w + (digits.size() - 1) * gap;
    const Vec2d       right(up.y(), -up.x());
    const Vec2d       origin = centre - right * (total / 2.) - up * (height / 2.);
    Polygons          out;
    for (size_t i = 0; i < digits.size(); ++i) {
        const Vec2d base = origin + right * (i * (w + gap));
        const auto  at = [&](double x, double y) { return Vec2d(base + right * (x * w) + up * (y * height / 2.)); };
        for (const char *seg = segments[digits[i] - '0']; *seg; ++seg) {
            switch (*seg) {
            case 'a': out.push_back(band(at(0, 2), at(1, 2), stroke / 2.)); break;
            case 'b': out.push_back(band(at(1, 2), at(1, 1), stroke / 2.)); break;
            case 'c': out.push_back(band(at(1, 1), at(1, 0), stroke / 2.)); break;
            case 'd': out.push_back(band(at(0, 0), at(1, 0), stroke / 2.)); break;
            case 'e': out.push_back(band(at(0, 0), at(0, 1), stroke / 2.)); break;
            case 'f': out.push_back(band(at(0, 1), at(0, 2), stroke / 2.)); break;
            case 'g': out.push_back(band(at(0, 1), at(1, 1), stroke / 2.)); break;
            }
        }
        // Square the corners.
        for (const auto &[x, y] : {std::pair{0., 0.}, {1., 0.}, {0., 1.}, {1., 1.}, {0., 2.}, {1., 2.}})
            for (const char *seg = segments[digits[i] - '0']; *seg; ++seg) {
                const bool uses = (*seg == 'a' && y == 2.) || (*seg == 'd' && y == 0.) || (*seg == 'g' && y == 1.) ||
                                  (*seg == 'b' && x == 1. && y >= 1.) || (*seg == 'c' && x == 1. && y <= 1.) ||
                                  (*seg == 'e' && x == 0. && y <= 1.) || (*seg == 'f' && x == 0. && y >= 1.);
                if (uses) {
                    const Vec2d c = at(x, y);
                    out.push_back(polygon_of({c + (-right - up) * stroke / 2., c + (right - up) * stroke / 2.,
                                              c + (right + up) * stroke / 2., c + (-right + up) * stroke / 2.}));
                    break;
                }
            }
    }
    return union_(out);
}

// A flat face of the shape: its triangles, its plane, and where it lies on its piece.
struct Facet
{
    std::vector<int> tris;
    Vec3d            normal{Vec3d::Zero()}, origin{Vec3d::Zero()}, u{Vec3d::UnitX()}, v{Vec3d::UnitY()};
    double           area{0.};
    int              piece{-1};
    double           c{1.}, s{0.};
    Vec2d            shift{Vec2d::Zero()};

    // In the face's plane, seen from inside: the net is printed outside down.
    Vec2d local(const Vec3d &p) const
    {
        const Vec3d d = p - origin;
        return {d.dot(u), d.dot(v)};
    }
    Vec2d at(const Vec3d &p) const
    {
        const Vec2d l = local(p);
        return Vec2d(c * l.x() - s * l.y(), s * l.x() + c * l.y()) + shift;
    }
};

// Two faces meeting along an edge, from va to vb as it runs round triangle ta of face a.
struct Link
{
    int    a, b, ta, tb, va, vb;
    double length;
};

double groove_for(double bend, double t, double h) { return std::clamp(2. * (t - h) * std::tan(bend / 2.), 0.6, 3.); }

bool touches(const Polygons &a, const Polygons &b)
{
    if (a.empty() || b.empty())
        return false;
    return area(intersection(a, b)) > sqr(scale_(0.1));
}

} // namespace

Shape mask(Animal animal, double head_width) { return build(animal, head_width); }

indexed_triangle_set simplify(const indexed_triangle_set &mesh, int faces)
{
    indexed_triangle_set out = mesh;
    its_merge_vertices(out);
    if (int(out.indices.size()) > faces)
        its_quadric_edge_collapse(out, uint32_t(std::max(faces, 4)));
    return out;
}

Net unfold(const indexed_triangle_set &input, const std::vector<Vec3d> &holes, const Params &params)
{
    Net          net;
    const double t = params.sheet, h = params.hinge;
    if (t < 0.2 || h < 0.08) {
        net.problem = Problem::TooThin;
        return net;
    }
    if (h >= t) {
        net.problem = Problem::HingeTooThick;
        return net;
    }

    // The mesh without its degenerate triangles.
    indexed_triangle_set &mesh = net.mesh;
    std::vector<Vec3d>              V, N;
    std::vector<double>             A;
    std::vector<std::array<int, 3>> T;
    {
        indexed_triangle_set merged = input;
        its_merge_vertices(merged, false);
        mesh.vertices = merged.vertices;
        for (const Vec3f &v : mesh.vertices)
            V.push_back(v.cast<double>());
        for (const auto &f : merged.indices) {
            const Vec3d n = (V[f[1]] - V[f[0]]).cross(V[f[2]] - V[f[0]]);
            if (n.norm() < 2e-4 || f[0] == f[1] || f[1] == f[2] || f[0] == f[2])
                continue;
            T.push_back({f[0], f[1], f[2]});
            N.push_back(n.normalized());
            A.push_back(n.norm() / 2.);
            mesh.indices.push_back(f);
        }
    }
    if (T.empty()) {
        net.problem = Problem::Empty;
        return net;
    }

    // Each undirected edge and the triangle corners it starts at.
    std::map<std::pair<int, int>, std::vector<std::pair<int, int>>> edges;
    for (int i = 0; i < int(T.size()); ++i)
        for (int k = 0; k < 3; ++k) {
            const int a = T[i][k], b = T[i][(k + 1) % 3];
            edges[{std::min(a, b), std::max(a, b)}].emplace_back(i, k);
        }
    // Edges between two triangles that run opposite ways round them, as a shape's surface does.
    const auto pair_of = [&](const std::vector<std::pair<int, int>> &uses, std::pair<int, int> &x, std::pair<int, int> &y) {
        if (uses.size() != 2)
            return false;
        x = uses[0];
        y = uses[1];
        return T[x.first][x.second] == T[y.first][(y.second + 1) % 3];
    };

    // Triangles in one plane make one face.
    std::vector<int> parent(T.size());
    std::iota(parent.begin(), parent.end(), 0);
    const std::function<int(int)> root = [&](int i) { return parent[i] == i ? i : parent[i] = root(parent[i]); };
    for (const auto &[key, uses] : edges) {
        std::pair<int, int> x, y;
        if (pair_of(uses, x, y) && N[x.first].dot(N[y.first]) > std::cos(PI / 180.))
            parent[root(x.first)] = root(y.first);
    }
    std::vector<Facet> F;
    std::vector<int>   facet_of(T.size());
    {
        std::map<int, int> index;
        for (int i = 0; i < int(T.size()); ++i) {
            const auto [it, added] = index.emplace(root(i), int(F.size()));
            if (added)
                F.emplace_back();
            facet_of[i] = it->second;
            F[it->second].tris.push_back(i);
            F[it->second].normal += N[i] * A[i];
            F[it->second].area += A[i];
        }
    }
    for (Facet &f : F) {
        f.normal.normalize();
        const auto &t0 = T[f.tris.front()];
        f.origin       = V[t0[0]];
        Vec3d u        = V[t0[1]] - V[t0[0]];
        f.u            = (u - f.normal * u.dot(f.normal)).normalized();
        f.v            = f.u.cross(f.normal);
    }

    std::vector<Link>             links;
    std::vector<std::vector<int>> links_of(F.size());
    for (const auto &[key, uses] : edges) {
        std::pair<int, int> x, y;
        if (!pair_of(uses, x, y) || facet_of[x.first] == facet_of[y.first])
            continue;
        const int va = T[x.first][x.second], vb = T[x.first][(x.second + 1) % 3];
        links.push_back({facet_of[x.first], facet_of[y.first], x.first, y.first, va, vb, (V[vb] - V[va]).norm()});
        links_of[links.back().a].push_back(int(links.size()) - 1);
        links_of[links.back().b].push_back(int(links.size()) - 1);
    }

    const auto facet_polygons = [&](const Facet &f) {
        Polygons out;
        for (int i : f.tris)
            out.push_back(polygon_of({f.at(V[T[i][0]]), f.at(V[T[i][1]]), f.at(V[T[i][2]])}));
        return out;
    };

    // Grow each piece from its largest face, longest edges first, as far as nothing overlaps and it fits the plate.
    const double margin = (params.tabs ? params.tab : 0.) + 3.;
    const Vec2d  room   = params.bed - Vec2d(2. * margin, 2. * margin);
    const auto   fits   = [&](const BoundingBox &box) {
        const Vec2d size = unscale(box.size());
        return (size.x() <= room.x() && size.y() <= room.y()) || (size.x() <= room.y() && size.y() <= room.x());
    };
    // One way to grow the pieces: from the largest face, longest edges first, or with both shuffled a little.
    // Gives the pieces' outlines, or nothing if a face alone is too big.
    const auto grow = [&](std::vector<Facet> &F, std::mt19937 *random) {
        std::uniform_real_distribution<double> jitter(0.3, 1.);
        const auto weight = [&](double value) { return random ? value * jitter(*random) : value; };
        std::vector<std::pair<double, int>> order;
        for (int i = 0; i < int(F.size()); ++i)
            order.emplace_back(weight(F[i].area), i);
        std::sort(order.rbegin(), order.rend());
        std::vector<Polygons> placed;
        for (const auto &[unused, start] : order) {
            if (F[start].piece >= 0)
                continue;
            const int piece = int(placed.size());
            Facet    &first = F[start];
            // Its longest edge along x.
            double longest = 0.;
            for (int i : first.tris)
                for (int k = 0; k < 3; ++k) {
                    const Vec2d e = first.local(V[T[i][(k + 1) % 3]]) - first.local(V[T[i][k]]);
                    if (e.norm() > longest) {
                        longest = e.norm();
                        first.c = std::cos(-std::atan2(e.y(), e.x()));
                        first.s = std::sin(-std::atan2(e.y(), e.x()));
                    }
                }
            first.piece = piece;
            placed.push_back(union_(facet_polygons(first)));
            if (!fits(get_extents(placed.back())))
                return std::vector<Polygons>();
            std::priority_queue<std::pair<double, int>> queue;
            for (int l : links_of[start])
                queue.emplace(weight(links[l].length), l);
            while (!queue.empty()) {
                const Link &l = links[queue.top().second];
                queue.pop();
                int from = l.a, to = l.b;
                if (F[from].piece != piece)
                    std::swap(from, to);
                if (F[from].piece != piece || F[to].piece >= 0)
                    continue;
                Facet       &f = F[to];
                const Vec2d  P = F[from].at(V[l.va]), Q = F[from].at(V[l.vb]);
                const Vec2d  p = f.local(V[l.va]), q = f.local(V[l.vb]);
                const double angle = std::atan2((Q - P).y(), (Q - P).x()) - std::atan2((q - p).y(), (q - p).x());
                f.c     = std::cos(angle);
                f.s     = std::sin(angle);
                f.shift = Vec2d::Zero();
                f.shift = P - f.at(V[l.va]);
                const Polygons here = union_(facet_polygons(f));
                BoundingBox    box  = get_extents(placed[piece]);
                box.merge(get_extents(here));
                if (!fits(box) || touches(offset(here, -float(scale_(0.05))), placed[piece]))
                    continue;
                f.piece       = piece;
                placed[piece] = union_(placed[piece], here);
                for (int next : links_of[to])
                    queue.emplace(weight(links[next].length), next);
            }
        }
        return placed;
    };
    // Keep the way with the fewest pieces, and of those the most compact.
    std::vector<Polygons> placed;
    {
        const auto score = [](const std::vector<Polygons> &pieces) {
            double spread = 0.;
            for (const Polygons &p : pieces)
                spread += unscale(get_extents(p).size()).prod();
            return std::pair(pieces.size(), spread);
        };
        std::mt19937    random(11);
        const int       tries = std::clamp(int(20000 / std::max<size_t>(F.size(), 1)), 8, 300);
        std::vector<Facet> best;
        const auto started = std::chrono::steady_clock::now();
        for (int k = 0; k < tries && (k < 8 || std::chrono::steady_clock::now() - started < std::chrono::milliseconds(1500)); ++k) {
            std::vector<Facet> trial = F;
            std::vector<Polygons> pieces = grow(trial, k == 0 ? nullptr : &random);
            if (pieces.empty()) {
                net.problem = Problem::FaceTooBig;
                return net;
            }
            if (best.empty() || score(pieces) < score(placed)) {
                best   = std::move(trial);
                placed = std::move(pieces);
            }
        }
        F = std::move(best);
    }

    // Folds where two faces of a piece meet as they do on the shape; every other link is a cut to glue.
    const size_t pieces = placed.size();
    std::vector<Polygons> faces(pieces), tabs(pieces), grooves(pieces), cuts(pieces), marks(pieces), hole_shapes(pieces);
    for (size_t p = 0; p < pieces; ++p)
        faces[p] = closing(placed[p], float(scale_(0.005)));
    std::vector<int> joins;
    for (int i = 0; i < int(links.size()); ++i) {
        const Link &l = links[i];
        const Facet &a = F[l.a], &b = F[l.b];
        const double bend = std::acos(std::clamp(a.normal.dot(b.normal), -1., 1.));
        if (a.piece == b.piece && (a.at(V[l.va]) - b.at(V[l.va])).norm() < 1e-3 && (a.at(V[l.vb]) - b.at(V[l.vb])).norm() < 1e-3) {
            grooves[a.piece].push_back(band(a.at(V[l.va]), a.at(V[l.vb]), groove_for(bend, t, h) / 2.));
            ++net.folds;
        } else
            joins.push_back(i);
    }
    std::sort(joins.begin(), joins.end(), [&](int i, int j) { return links[i].length > links[j].length; });

    const double stroke = 0.6;
    // Where an edge of a face lies on its piece, and which way is into the face.
    struct Side
    {
        int   facet, piece;
        Vec2d P, Q, in;
    };
    const auto side_of = [&](int facet, int tri, int va, int vb) {
        const Facet &f = F[facet];
        Side         side{facet, f.piece, f.at(V[va]), f.at(V[vb]), Vec2d::Zero()};
        const Vec2d  d = (side.Q - side.P).normalized();
        side.in        = Vec2d(-d.y(), d.x());
        const Vec2d centroid = (f.at(V[T[tri][0]]) + f.at(V[T[tri][1]]) + f.at(V[T[tri][2]])) / 3.;
        if (side.in.dot(centroid - side.P) < 0.)
            side.in = -side.in;
        return side;
    };
    // The number on a face beside its edge, if there is room for it.
    const auto mark_face = [&](int number, const Side &side, double from_edge) {
        const Polygons room_left = offset(union_(facet_polygons(F[side.facet])), -float(scale_(1.8)));
        const Vec2d    mid       = (side.P + side.Q) / 2.;
        for (double height : {4.5, 3.5, 2.6}) {
            const Polygons shape = number_shape(number, mid + side.in * (from_edge + 0.6 + height / 2.), side.in, height, stroke);
            if (area(diff(shape, room_left)) < sqr(scale_(0.1))) {
                append(marks[side.piece], shape);
                return;
            }
        }
    };
    int number = params.first_number - 1;
    for (int i : joins) {
        const Link  &l = links[i];
        const double bend = std::acos(std::clamp(F[l.a].normal.dot(F[l.b].normal), -1., 1.));
        const double g    = groove_for(bend, t, h);
        const Side   sides[2] = {side_of(l.a, l.ta, l.va, l.vb), side_of(l.b, l.tb, l.va, l.vb)};
        ++number;
        ++net.joins;
        int with_tab = -1;
        const double w = std::min(params.tab, 0.4 * l.length);
        if (params.tabs && w >= 3.)
            for (int k = 0; k < 2 && with_tab < 0; ++k) {
                const Side  &s = sides[k];
                const Vec2d  out = -s.in, d = (s.Q - s.P).normalized();
                const double inset = std::min(0.9 * w, 0.3 * l.length);
                Polygon tab = polygon_of({s.P - out * 0.2, s.Q - out * 0.2, s.Q + out * w - d * inset, s.P + out * w + d * inset});
                Polygon test = tab;
                test.translate(Point::new_scale(out.x() * 0.6, out.y() * 0.6));
                if (touches(offset(test, float(scale_(0.3))), union_(faces[s.piece], tabs[s.piece])))
                    continue;
                with_tab = k;
                tabs[s.piece].push_back(tab);
                grooves[s.piece].push_back(band(s.P, s.Q, g / 2.));
                if (params.numbers) {
                    const double height = std::min(4.5, w - g / 2. - 1.6);
                    if (height >= 2.5)
                        append(marks[s.piece], number_shape(number, (s.P + s.Q) / 2. + out * (g / 2. + 0.3 + (w - g / 2.) / 2.), out, height, stroke));
                }
            }
        for (int k = 0; k < 2; ++k) {
            if (k == with_tab)
                continue;
            cuts[sides[k].piece].push_back(band(sides[k].P, sides[k].Q, 0.2));
            if (params.numbers)
                mark_face(number, sides[k], 0.2);
        }
    }

    for (const Vec3d &hole : holes) {
        int    nearest = -1;
        double best    = 1e30;
        for (int i = 0; i < int(T.size()); ++i) {
            const double d = ((V[T[i][0]] + V[T[i][1]] + V[T[i][2]]) / 3. - hole).squaredNorm();
            if (d < best) {
                best    = d;
                nearest = i;
            }
        }
        const Facet &f = F[facet_of[nearest]];
        hole_shapes[f.piece].push_back(circle(f.at(hole), params.hole_radius));
    }

    for (size_t p = 0; p < pieces; ++p) {
        const Polygons solid = union_(faces[p], tabs[p]);
        const Polygons cut   = union_(cuts[p], hole_shapes[p]);
        const Polygons thin  = union_(grooves[p], marks[p]);
        FoldBox::Piece piece;
        piece.name   = std::to_string(p + 1);
        piece.sheet  = diff_ex(solid, union_(thin, cut));
        piece.hinges = diff_ex(intersection(thin, solid), cut);
        // Turned to fit the plate, with its corner at the origin.
        BoundingBox  box  = get_extents(solid);
        const Vec2d  size = unscale(box.size());
        if (!(size.x() <= params.bed.x() && size.y() <= params.bed.y()) && size.y() <= params.bed.x() && size.x() <= params.bed.y()) {
            for (ExPolygons *shape : {&piece.sheet, &piece.hinges})
                for (ExPolygon &e : *shape)
                    e.rotate(PI / 2.);
        }
        BoundingBox moved = get_extents(piece.sheet);
        moved.merge(get_extents(piece.hinges));
        for (ExPolygons *shape : {&piece.sheet, &piece.hinges})
            for (ExPolygon &e : *shape)
                e.translate(Point(-moved.min.x(), -moved.min.y()));
        net.pieces.push_back(std::move(piece));
    }
    for (int i = 0; i < int(T.size()); ++i)
        net.face_piece.push_back(F[facet_of[i]].piece);
    return net;
}

std::vector<std::vector<Placement>> pack(const std::vector<FoldBox::Piece> &pieces, const Vec2d &bed, double gap)
{
    std::vector<int> order(pieces.size());
    std::iota(order.begin(), order.end(), 0);
    std::vector<Vec2d> sizes;
    for (const FoldBox::Piece &piece : pieces)
        sizes.push_back(piece.size().size());
    std::sort(order.begin(), order.end(), [&](int i, int j) { return sizes[i].y() > sizes[j].y(); });
    // Rows across each plate, filled left to right, tallest pieces first.
    struct Row
    {
        double y, height, x;
    };
    std::vector<std::vector<Placement>> plates;
    std::vector<std::vector<Row>>       rows;
    const Vec2d room = bed - Vec2d(2. * gap, 2. * gap);
    for (int i : order) {
        const Vec2d size = sizes[i];
        bool        done = false;
        for (size_t p = 0; p < plates.size() && !done; ++p) {
            for (Row &row : rows[p])
                if (size.y() <= row.height + 1e-9 && row.x + size.x() <= room.x() + 1e-9) {
                    plates[p].push_back({i, Vec2d(gap + row.x, gap + row.y)});
                    row.x += size.x() + gap;
                    done = true;
                    break;
                }
            const double top = rows[p].empty() ? 0. : rows[p].back().y + rows[p].back().height + gap;
            if (!done && top + size.y() <= room.y() + 1e-9) {
                rows[p].push_back({top, size.y(), size.x() + gap});
                plates[p].push_back({i, Vec2d(gap, gap + top)});
                done = true;
            }
        }
        if (!done) {
            plates.push_back({{i, Vec2d(gap, gap)}});
            rows.push_back({{0., size.y(), size.x() + gap}});
        }
    }
    return plates;
}

}} // namespace Slic3r::Papercraft
