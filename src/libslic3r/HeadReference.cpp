#include "HeadReference.hpp"

#include <algorithm>
#include <cmath>
#include <limits>
#include <utility>

#include <Eigen/Eigenvalues>

#include "Geometry.hpp"
#include "Model.hpp"
#include "libslic3r.h"

namespace Slic3r {
namespace HeadReference {

const char *const PART_NAME = "Elslicer head reference";

namespace {

// An average adult head, in mm, at a band of about 57 cm: half its length front to back and half its width.
constexpr double HALF_LENGTH = 97.5;
constexpr double HALF_WIDTH  = 76.;
// Heights from the bottom of the neck: where the neck meets the jaw, the chin, the top and the forehead band.
constexpr double NECK_TOP = 50., CHIN = 80., TOP = 300., BAND = BAND_HEIGHT_SHARE * TOP;

// Ramanujan's approximation of an ellipse's perimeter.
double ellipse_perimeter(double a, double b) { return PI * (3. * (a + b) - std::sqrt((3. * a + b) * (a + 3. * b))); }

// Half width and half length of the head at height z.
std::pair<double, double> half_axes(double z)
{
    const double neck_x = 55., neck_y = 60.;
    const double chin_share = 0.7;
    if (z <= NECK_TOP)
        return {neck_x, neck_y};
    if (z <= CHIN) {
        const double t = (z - NECK_TOP) / (CHIN - NECK_TOP);
        return {neck_x + t * (chin_share * HALF_WIDTH - neck_x), neck_y + t * (chin_share * HALF_LENGTH - neck_y)};
    }
    double share;
    if (z <= BAND)
        share = chin_share + (1. - chin_share) * std::sin(0.5 * PI * (z - CHIN) / (BAND - CHIN));
    else
        share = std::sqrt(std::max(0., 1. - std::pow((z - BAND) / (TOP - BAND), 2)));
    return {share * HALF_WIDTH, share * HALF_LENGTH};
}

// Half width and half length of a head on the bed at bed height z, or nothing above or below it.
std::optional<std::pair<double, double>> half_axes_on_bed(const BoundingBoxf3 &head_box, double z)
{
    const double k = head_box.size().z() / TOP;
    if (k <= 0. || z < head_box.min.z() || z > head_box.max.z())
        return std::nullopt;
    const auto [half_x, half_y] = half_axes((z - head_box.min.z()) / k);
    return std::make_pair(k * half_x, k * half_y);
}

double band_height(const BoundingBoxf3 &head_box) { return head_box.min.z() + BAND_HEIGHT_SHARE * head_box.size().z(); }

} // namespace

TriangleMesh make_mesh(double circumference_mm)
{
    const double k     = circumference_mm / ellipse_perimeter(HALF_WIDTH, HALF_LENGTH);
    const int    sides = 96, rings = 120;
    indexed_triangle_set its;
    for (int ring = 0; ring < rings; ++ring) {
        // Rings closer together near the top, where the crown curves fastest.
        const double z            = TOP * std::sin(0.5 * PI * ring / rings);
        const auto [half_x, half_y] = half_axes(z);
        for (int side = 0; side < sides; ++side) {
            const double angle = 2. * PI * side / sides;
            its.vertices.emplace_back(float(k * half_x * std::cos(angle)), float(k * half_y * std::sin(angle)), float(k * z));
        }
    }
    const int bottom = int(its.vertices.size());
    its.vertices.emplace_back(0.f, 0.f, 0.f);
    const int top = int(its.vertices.size());
    its.vertices.emplace_back(0.f, 0.f, float(k * TOP));
    for (int side = 0; side < sides; ++side) {
        const int next = (side + 1) % sides;
        its.indices.emplace_back(bottom, next, side);
        for (int ring = 0; ring + 1 < rings; ++ring) {
            const int a = ring * sides + side, b = ring * sides + next;
            its.indices.emplace_back(a, b, b + sides);
            its.indices.emplace_back(a, b + sides, a + sides);
        }
        its.indices.emplace_back(top, (rings - 1) * sides + side, (rings - 1) * sides + next);
    }
    return TriangleMesh(std::move(its));
}

bool is_head(const ModelObject &object)
{
    return object.volumes.size() == 1 && object.volumes.front()->name == PART_NAME;
}

std::optional<Fit> fit_to_head(const std::vector<Vec3d> &points, const BoundingBoxf3 &head_box, double clearance_mm)
{
    if (points.empty() || !head_box.defined)
        return std::nullopt;
    double low = points.front().z(), high = low;
    for (const Vec3d &point : points) {
        low  = std::min(low, point.z());
        high = std::max(high, point.z());
    }
    // The band it rests on: its lowest few mm.
    const double band_top = low + std::max(2., 0.1 * (high - low));
    std::vector<Vec2d> band;
    for (const Vec3d &point : points)
        if (point.z() <= band_top)
            band.emplace_back(point.x(), point.y());

    // The middle of its opening, from a least squares circle through the band (Kasa's fit). That also finds
    // the middle of an arc open at the back.
    Vec2d centre = Vec2d::Zero();
    for (const Vec2d &p : band)
        centre += p;
    centre /= double(band.size());
    Eigen::Matrix3d a = Eigen::Matrix3d::Zero();
    Eigen::Vector3d b = Eigen::Vector3d::Zero();
    for (const Vec2d &p : band) {
        const Vec2d           q = p - centre;
        const Eigen::Vector3d row(q.x(), q.y(), 1.);
        a += row * row.transpose();
        b -= row * q.squaredNorm();
    }
    if (std::abs(a.determinant()) > 1e-9) {
        const Eigen::Vector3d solution = a.ldlt().solve(b);
        centre += Vec2d(-0.5 * solution.x(), -0.5 * solution.y());
    }

    // The head's band, with the clearance, measured from the opening's middle. The closest point decides.
    const Vec3d  head_size = head_box.size();
    const double half_x    = 0.5 * head_size.x() + clearance_mm;
    const double half_y    = 0.5 * head_size.y() + clearance_mm;
    double       closest   = std::numeric_limits<double>::max(), average = 0.;
    // Which way round from the middle the bottom reaches, in 10 degree steps.
    std::vector<bool> reached(36, false);
    for (const Vec2d &p : band) {
        const Vec2d  d = p - centre;
        const double r = std::hypot(d.x() / half_x, d.y() / half_y);
        closest        = std::min(closest, r);
        average += r;
        reached[std::min<size_t>(35, size_t((std::atan2(d.y(), d.x()) + PI) / (2. * PI) * 36.))] = true;
    }
    average /= double(band.size());
    const double scale = closest > 1e-6 ? 1. / closest : 0.;
    // A tiara's bottom curves at least a third of the way round a middle it leaves empty.
    const bool around = std::count(reached.begin(), reached.end(), true) >= 12 && closest > 0.5 * average &&
                        scale <= MAX_SCALE_CHANGE && scale >= 1. / MAX_SCALE_CHANGE;

    const Vec3d head_centre = head_box.center();
    if (!around) {
        // Set on top of the head at its own size, its middle over the head's.
        BoundingBoxf3 box;
        for (const Vec3d &point : points)
            box.merge(point);
        const Vec3d pivot(box.center().x(), box.center().y(), low);
        return Fit{Geometry::translation_transform(Vec3d(head_centre.x(), head_centre.y(), head_box.max.z()) - pivot), 1., false};
    }
    const Vec3d pivot(centre.x(), centre.y(), low);
    const Vec3d target(head_centre.x(), head_centre.y(), band_height(head_box));
    return Fit{Geometry::translation_transform(target) * Geometry::scale_transform(scale) * Geometry::translation_transform(-pivot), scale};
}

std::optional<Fit> fit_headband(const std::vector<Vec3d> &points, const BoundingBoxf3 &head_box, double clearance_mm)
{
    if (points.size() < 3 || !head_box.defined)
        return std::nullopt;
    // The arc's plane: its thinnest way across is the band's width, the normal of the plane.
    Vec3d mean = Vec3d::Zero();
    for (const Vec3d &point : points)
        mean += point;
    mean /= double(points.size());
    Eigen::Matrix3d spread = Eigen::Matrix3d::Zero();
    for (const Vec3d &point : points)
        spread += (point - mean) * (point - mean).transpose();
    const Eigen::SelfAdjointEigenSolver<Eigen::Matrix3d> solver(spread);
    // Eigenvalues come smallest first.
    Vec3d       normal = solver.eigenvectors().col(0);
    const Vec3d u = solver.eigenvectors().col(2), v = normal.cross(u);
    if (solver.eigenvalues()(1) <= 1e-9)
        return std::nullopt;

    // The middle of the arc in its plane (Kasa's fit, as in fit_to_head).
    Eigen::Matrix3d a = Eigen::Matrix3d::Zero();
    Eigen::Vector3d b = Eigen::Vector3d::Zero();
    for (const Vec3d &point : points) {
        const Vec2d           q((point - mean).dot(u), (point - mean).dot(v));
        const Eigen::Vector3d row(q.x(), q.y(), 1.);
        a += row * row.transpose();
        b -= row * q.squaredNorm();
    }
    Vec3d centre = mean;
    if (std::abs(a.determinant()) > 1e-9) {
        const Eigen::Vector3d solution = a.ldlt().solve(b);
        centre += -0.5 * solution.x() * u - 0.5 * solution.y() * v;
    }

    // Which way the arc's top faces: away from its opening. A closed ring has none, so it keeps its own up.
    Vec3d top = Vec3d::Zero();
    for (const Vec3d &point : points) {
        Vec3d d = point - centre;
        d -= d.dot(normal) * normal;
        if (d.squaredNorm() > 1e-12)
            top += d.normalized();
    }
    if (top.norm() < 0.1 * double(points.size())) {
        top = Vec3d::UnitZ() - normal.z() * normal;
        if (top.squaredNorm() < 1e-6)
            top = u;
    }
    top = (top - top.dot(normal) * normal).normalized();
    // Keep the side it faces, so it isn't flipped needlessly.
    if (normal.y() < 0.)
        normal = -normal;

    // Turns the plane's normal to +Y (across the head, front to back) and the arc's top to +Z.
    Eigen::Matrix3d turn;
    turn.row(0) = normal.cross(top).transpose();
    turn.row(1) = normal.transpose();
    turn.row(2) = top.transpose();
    Transform3d rotate = Transform3d::Identity();
    rotate.linear()    = turn;

    // Above the forehead band the head seen from the front is half an ellipse, centred at the band.
    const Vec3d  head_size = head_box.size();
    const double half_x    = 0.5 * head_size.x() + clearance_mm;
    const double half_z    = head_box.max.z() - band_height(head_box) + clearance_mm;
    double       closest   = std::numeric_limits<double>::max(), average = 0.;
    size_t       over      = 0;
    for (const Vec3d &point : points) {
        const Vec3d q = turn * (point - centre);
        // Only the part over the band rests on the head; the ends hang down by the ears.
        if (q.z() >= 0.) {
            const double r = std::hypot(q.x() / half_x, q.z() / half_z);
            closest        = std::min(closest, r);
            average += r;
            ++over;
        }
    }
    if (over == 0 || closest <= 1e-6)
        return std::nullopt;
    average /= double(over);
    const double scale = 1. / closest;
    // An arc leaves its middle empty.
    if (closest < 0.5 * average || scale > MAX_SCALE_CHANGE || scale < 1. / MAX_SCALE_CHANGE)
        return std::nullopt;

    const Vec3d  head_centre = head_box.center();
    const Vec3d  target(head_centre.x(), head_centre.y(), band_height(head_box));
    return Fit{Geometry::translation_transform(target) * Geometry::scale_transform(scale) * rotate * Geometry::translation_transform(-centre), scale};
}

std::optional<Fit> fit_mask(const std::vector<Vec3d> &points, const BoundingBoxf3 &head_box, bool flipped, double clearance_mm)
{
    if (points.size() < 3 || !head_box.defined)
        return std::nullopt;
    Vec3d mean = Vec3d::Zero();
    for (const Vec3d &point : points)
        mean += point;
    mean /= double(points.size());
    Eigen::Matrix3d spread = Eigen::Matrix3d::Zero();
    for (const Vec3d &point : points)
        spread += (point - mean) * (point - mean).transpose();
    const Eigen::SelfAdjointEigenSolver<Eigen::Matrix3d> solver(spread);
    if (solver.eigenvalues()(1) <= 1e-9)
        return std::nullopt;
    // A shell is thinnest through its face.
    const Vec3d normal = solver.eigenvectors().col(0);

    // It bulges the way its middle stands out from its rim.
    std::vector<double> radii;
    radii.reserve(points.size());
    for (const Vec3d &point : points) {
        const Vec3d d = point - mean;
        radii.push_back((d - d.dot(normal) * normal).norm());
    }
    std::vector<double> sorted = radii;
    std::nth_element(sorted.begin(), sorted.begin() + sorted.size() / 2, sorted.end());
    const double median = sorted[sorted.size() / 2];
    double middle = 0., rim = 0.;
    size_t middles = 0, rims = 0;
    for (size_t i = 0; i < points.size(); ++i) {
        const double d = (points[i] - mean).dot(normal);
        if (radii[i] < median) {
            middle += d;
            ++middles;
        } else {
            rim += d;
            ++rims;
        }
    }
    const Vec3d out = (middles == 0 || rims == 0 || middle / middles >= rim / rims) ? normal : Vec3d(-normal);

    Vec3d up = std::abs(normal.z()) > 0.7 ? Vec3d::UnitY() : Vec3d::UnitZ();
    up -= up.dot(normal) * normal;
    if (up.squaredNorm() < 1e-6)
        up = solver.eigenvectors().col(2);
    up.normalize();
    if (flipped)
        up = -up;

    // Turns its bulge to the front (-Y) and its top up (+Z).
    Eigen::Matrix3d turn;
    turn.row(0) = up.cross(out).transpose();
    turn.row(1) = (-out).transpose();
    turn.row(2) = up.transpose();

    BoundingBoxf3 turned;
    std::vector<Vec3d> q;
    q.reserve(points.size());
    for (const Vec3d &point : points) {
        q.push_back(turn * (point - mean));
        turned.merge(q.back());
    }
    const double width = turned.size().x();
    const double face_z = head_box.min.z() + MASK_HEIGHT_SHARE * head_box.size().z();
    const auto   face   = half_axes_on_bed(head_box, face_z);
    if (width <= 1e-6 || !face)
        return std::nullopt;
    const double scale = 2. * (face->first + clearance_mm) / width;
    if (scale > MAX_SCALE_CHANGE || scale < 1. / MAX_SCALE_CHANGE)
        return std::nullopt;
    const Vec3d  middle_of(0.5 * (turned.min.x() + turned.max.x()), 0., 0.5 * (turned.min.z() + turned.max.z()));

    // Moved back as far as the face lets it: each point must stay in front of the head where the head is.
    const Vec3d head_centre = head_box.center();
    double      back        = head_centre.y() - face->second - clearance_mm;
    bool        touches     = false;
    for (const Vec3d &point : q) {
        const Vec3d placed = scale * (point - middle_of);
        const auto  axes   = half_axes_on_bed(head_box, face_z + placed.z());
        if (!axes || std::abs(placed.x()) >= axes->first)
            continue;
        const double surface = head_centre.y() - axes->second * std::sqrt(1. - std::pow(placed.x() / axes->first, 2));
        const double allowed = surface - clearance_mm - placed.y();
        back                 = touches ? std::min(back, allowed) : allowed;
        touches              = true;
    }

    Transform3d rotate = Transform3d::Identity();
    rotate.linear()    = turn;
    return Fit{Geometry::translation_transform(Vec3d(head_centre.x(), back, face_z)) * Geometry::scale_transform(scale) *
                   Geometry::translation_transform(-middle_of) * rotate * Geometry::translation_transform(-mean),
               scale};
}

} // namespace HeadReference
} // namespace Slic3r
