#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_floating_point.hpp>

#include <cmath>
#include <vector>

#include "libslic3r/Geometry.hpp"
#include "libslic3r/HeadReference.hpp"
#include "libslic3r/libslic3r.h"

using namespace Slic3r;
using Catch::Matchers::WithinAbs;

namespace {

double ellipse_perimeter(double a, double b) { return PI * (3. * (a + b) - std::sqrt((3. * a + b) * (a + 3. * b))); }

// Points of a flat band 3 mm tall between two radii around centre, covering the angles from `from` to `to`.
std::vector<Vec3d> band(const Vec2d &centre, double inner, double outer, double from, double to)
{
    std::vector<Vec3d> points;
    for (int i = 0; i <= 90; ++i) {
        const double angle = from + (to - from) * i / 90.;
        for (const double radius : {inner, outer})
            for (const double z : {0., 3.})
                points.emplace_back(centre.x() + radius * std::cos(angle), centre.y() + radius * std::sin(angle), z);
    }
    return points;
}

} // namespace

TEST_CASE("The head measures the asked circumference around its widest band", "[HeadReference]")
{
    const BoundingBoxf3 box = HeadReference::make_mesh(560.).bounding_box();
    CHECK_THAT(ellipse_perimeter(0.5 * box.size().x(), 0.5 * box.size().y()), WithinAbs(560., 1.));
    // Longer front to back than across, standing on the bed.
    CHECK(box.size().y() > box.size().x());
    CHECK_THAT(box.min.z(), WithinAbs(0., 1e-6));
}

TEST_CASE("A ring is scaled until its inside meets the head's band", "[HeadReference]")
{
    const BoundingBoxf3 head = HeadReference::make_mesh(560.).bounding_box();
    const auto          fit  = HeadReference::fit_to_head(band({30., 40.}, 50., 56., 0., 2. * PI), head);
    REQUIRE(fit.has_value());
    // A round ring touches the head front and back, the head's longer way.
    CHECK_THAT(fit->scale, WithinAbs((0.5 * head.size().y() + 0.5) / 50., 1e-3));
    // Its middle at the bottom goes to the head's middle at the forehead band.
    const Vec3d moved = fit->transform * Vec3d(30., 40., 0.);
    CHECK_THAT(moved.x(), WithinAbs(head.center().x(), 0.01));
    CHECK_THAT(moved.y(), WithinAbs(head.center().y(), 0.01));
    CHECK_THAT(moved.z(), WithinAbs(HeadReference::BAND_HEIGHT_SHARE * head.size().z(), 1e-6));
}

TEST_CASE("A tiara open at the back is centred on the middle of its arc", "[HeadReference]")
{
    const BoundingBoxf3 head = HeadReference::make_mesh(560.).bounding_box();
    // The front half only, facing -Y.
    const auto fit = HeadReference::fit_to_head(band({10., 20.}, 60., 64., PI, 2. * PI), head);
    REQUIRE(fit.has_value());
    const Vec3d moved = fit->transform * Vec3d(10., 20., 0.);
    CHECK_THAT(moved.x(), WithinAbs(head.center().x(), 0.5 * fit->scale));
    CHECK_THAT(moved.y(), WithinAbs(head.center().y(), 0.5 * fit->scale));
}

TEST_CASE("Nothing to fit gives no fit", "[HeadReference]")
{
    CHECK_FALSE(HeadReference::fit_to_head({}, HeadReference::make_mesh(560.).bounding_box()).has_value());
}

TEST_CASE("A headband lying flat stands up over the top of the head", "[HeadReference]")
{
    const BoundingBoxf3 head = HeadReference::make_mesh(560.).bounding_box();
    // As printed: flat on the bed, 10 mm wide, open towards -Y, about 260 degrees of arc.
    std::vector<Vec3d> points;
    const double from = Geometry::deg2rad(-40.), to = Geometry::deg2rad(220.);
    for (int i = 0; i <= 120; ++i) {
        const double angle = from + (to - from) * i / 120.;
        for (const double radius : {60., 63.})
            for (const double z : {0., 10.})
                points.emplace_back(100. + radius * std::cos(angle), 50. + radius * std::sin(angle), z);
    }
    const auto fit = HeadReference::fit_headband(points, head);
    REQUIRE(fit.has_value());

    // The inside of the arc's middle rests just over the top of the head, in the middle of the head.
    const Vec3d top = fit->transform * Vec3d(100., 50. + 60., 5.);
    CHECK_THAT(top.x(), WithinAbs(head.center().x(), 0.5));
    CHECK_THAT(top.y(), WithinAbs(head.center().y(), 0.5));
    CHECK_THAT(top.z(), WithinAbs(head.max.z() + 0.5, 1.));
    // Its ends hang down, either side of the head.
    const Vec3d left = fit->transform * Vec3d(100. + 60. * std::cos(to), 50. + 60. * std::sin(to), 5.);
    const Vec3d right = fit->transform * Vec3d(100. + 60. * std::cos(from), 50. + 60. * std::sin(from), 5.);
    CHECK(left.z() < top.z() - 50.);
    CHECK(right.z() < top.z() - 50.);
    CHECK((left.x() - head.center().x()) * (right.x() - head.center().x()) < 0.);
    // Its width runs front to back.
    const Vec3d across = fit->transform * Vec3d(100., 110., 10.) - fit->transform * Vec3d(100., 110., 0.);
    CHECK(std::abs(across.y()) > 0.99 * across.norm());
}

TEST_CASE("Nothing to fit gives no headband fit", "[HeadReference]")
{
    CHECK_FALSE(HeadReference::fit_headband({}, HeadReference::make_mesh(560.).bounding_box()).has_value());
}

TEST_CASE("A mask lying flat stands up over the face, bulging out", "[HeadReference]")
{
    const BoundingBoxf3 head = HeadReference::make_mesh(560.).bounding_box();
    // A cap of a sphere 2 mm thick, dome up on the bed, far from the head.
    std::vector<Vec3d> points;
    const double sphere = 120., reach = Geometry::deg2rad(35.);
    for (int i = 0; i <= 30; ++i)
        for (int j = 0; j < 48; ++j) {
            const double tilt = reach * i / 30., turn = 2. * PI * j / 48.;
            for (const double radius : {sphere, sphere + 2.})
                points.emplace_back(300. + radius * std::sin(tilt) * std::cos(turn), 300. + radius * std::sin(tilt) * std::sin(turn),
                                    radius * std::cos(tilt) - sphere * std::cos(reach));
        }
    const auto fit = HeadReference::fit_mask(points, head);
    REQUIRE(fit.has_value());

    BoundingBoxf3 placed;
    for (const Vec3d &point : points)
        placed.merge(fit->transform * point);
    // Centred across the face, at the middle of the face, in front of the head.
    CHECK_THAT(placed.center().x(), WithinAbs(head.center().x(), 0.5));
    CHECK_THAT(placed.center().z(), WithinAbs(head.min.z() + HeadReference::MASK_HEIGHT_SHARE * head.size().z(), 0.5));
    CHECK(placed.max.y() < head.center().y());
    // The dome's top bulges out to the front.
    const Vec3d apex = fit->transform * Vec3d(300., 300., sphere + 2. - sphere * std::cos(reach));
    CHECK_THAT(apex.y(), WithinAbs(placed.min.y(), 0.5));
    // Its inside rests on the face, with nothing inside the head.
    const Vec3d inside = fit->transform * Vec3d(300., 300., sphere - sphere * std::cos(reach));
    CHECK(inside.y() < head.min.y());
}

TEST_CASE("Nothing to fit gives no mask fit", "[HeadReference]")
{
    CHECK_FALSE(HeadReference::fit_mask({}, HeadReference::make_mesh(560.).bounding_box()).has_value());
}

TEST_CASE("Something without a ring at its bottom sits on top of the head at its own size", "[HeadReference]")
{
    const BoundingBoxf3 head = HeadReference::make_mesh(560.).bounding_box();
    // Like antlers on a small solid base: a block 20 mm across with tall arms well out to the sides.
    std::vector<Vec3d> points;
    for (const double x : {-10., 10.})
        for (const double y : {-10., 10.})
            for (const double z : {0., 20.})
                points.emplace_back(500. + x, 500. + y, z);
    for (const double side : {-1., 1.})
        for (const double z : {20., 150.})
            points.emplace_back(500. + side * 90., 500., z);
    const auto fit = HeadReference::fit_to_head(points, head);
    REQUIRE(fit.has_value());
    CHECK_FALSE(fit->around);
    CHECK(fit->scale == 1.);
    const Vec3d base = fit->transform * Vec3d(500., 500., 0.);
    CHECK_THAT(base.x(), WithinAbs(head.center().x(), 1e-6));
    CHECK_THAT(base.z(), WithinAbs(head.max.z(), 1e-6));
}

TEST_CASE("A ring far too small for the head isn't blown up to fit", "[HeadReference]")
{
    const BoundingBoxf3 head = HeadReference::make_mesh(560.).bounding_box();
    const auto fit = HeadReference::fit_to_head(band({0., 0.}, 10., 12., 0., 2. * PI), head);
    REQUIRE(fit.has_value());
    CHECK_FALSE(fit->around);
    CHECK(fit->scale == 1.);
}
