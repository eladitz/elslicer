#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_floating_point.hpp>

#include "libslic3r/FoldBox.hpp"
#include "libslic3r/NestingDoll.hpp"
#include "libslic3r/TriangleMesh.hpp"

using namespace Slic3r;
using Catch::Matchers::WithinAbs;

namespace {

// A closed shell: the outside, and the inside facing in.
indexed_triangle_set shell(indexed_triangle_set outer, indexed_triangle_set inner)
{
    its_flip_triangles(inner);
    its_merge(outer, inner);
    return outer;
}

indexed_triangle_set cube_at(double size, const Vec3d &corner)
{
    indexed_triangle_set cube = its_make_cube(size, size, size);
    for (Vec3f &v : cube.vertices)
        v += corner.cast<float>();
    return cube;
}

} // namespace

TEST_CASE("A copy of a closed box fills the room inside it less the gap", "[NestingDoll]")
{
    // 40 mm outside with 2 mm walls: 36 mm inside, from z = 2.
    const indexed_triangle_set box = shell(cube_at(40., Vec3d::Zero()), cube_at(36., Vec3d(2., 2., 2.)));
    const double               gap = 0.5;
    const NestingDoll::Fit     fit = NestingDoll::fit_inside(box, gap);
    REQUIRE(fit.problem == NestingDoll::Problem::None);
    CHECK_THAT(fit.scale, WithinAbs((36. - 2. * gap) / 40., 0.002));
    // Standing on the inside floor, the gap above it, in the middle.
    const Vec3d bottom = fit.transform * Vec3d(20., 20., 0.);
    CHECK_THAT(bottom.z(), WithinAbs(2. + gap, 1e-3));
    CHECK_THAT(bottom.x(), WithinAbs(20., 1e-6));
}

TEST_CASE("A copy of an egg shell sits at the bottom of it", "[NestingDoll]")
{
    const indexed_triangle_set egg = shell(its_make_sphere(20., PI / 60.), its_make_sphere(18., PI / 60.));
    const NestingDoll::Fit     fit = NestingDoll::fit_inside(egg, 0.5);
    REQUIRE(fit.problem == NestingDoll::Problem::None);
    // Faceting makes the spheres a little smaller than their radius.
    CHECK_THAT(fit.scale, WithinAbs(17.5 / 20., 0.02));
}

TEST_CASE("Copies nest each inside the one before", "[NestingDoll]")
{
    const indexed_triangle_set box  = shell(cube_at(40., Vec3d::Zero()), cube_at(36., Vec3d(2., 2., 2.)));
    const auto                 fits = NestingDoll::nest(box, 0.5, 3);
    REQUIRE(fits.size() == 3);
    CHECK(fits[1].scale < fits[0].scale);
    CHECK(fits[2].scale < fits[1].scale);
}

TEST_CASE("A solid object has no room for a copy", "[NestingDoll]")
{
    CHECK(NestingDoll::fit_inside(its_make_cube(30., 30., 30.), 0.5).problem == NestingDoll::Problem::NotHollow);
}

namespace {

// A box 40 mm across with 2 mm walls, open at the bottom, as a lid or an egg's top printed opening down.
indexed_triangle_set cap()
{
    const auto square = [](double from, double to) {
        return Polygon({Point::new_scale(from, from), Point::new_scale(to, from), Point::new_scale(to, to), Point::new_scale(from, to)});
    };
    ExPolygon ring(square(0., 40.));
    Polygon   hole = square(2., 38.);
    hole.reverse();
    ring.holes.push_back(hole);
    indexed_triangle_set walls = FoldBox::extrude({ring}, 0., 38.);
    its_merge(walls, FoldBox::extrude({ExPolygon(square(0., 40.))}, 38., 40.));
    return walls;
}

} // namespace

TEST_CASE("A copy of something open at the bottom hangs from its roof", "[NestingDoll]")
{
    const double           gap = 0.5;
    const NestingDoll::Fit fit = NestingDoll::fit_inside(cap(), gap);
    REQUIRE(fit.problem == NestingDoll::Problem::None);
    CHECK_THAT(fit.scale, WithinAbs((36. - 2. * gap) / 40., 0.002));
    // Its top middle just under the roof.
    const Vec3d top = fit.transform * Vec3d(20., 20., 40.);
    CHECK_THAT(top.z(), WithinAbs(38. - gap, 1e-3));
}

TEST_CASE("Pieces nested together get the same sizes", "[NestingDoll]")
{
    // A shallow tray and a deep cap of the same width: the cap allows less.
    const indexed_triangle_set box  = shell(cube_at(40., Vec3d::Zero()), cube_at(36., Vec3d(2., 2., 2.)));
    const auto                 fits = NestingDoll::nest_together({box, cap()}, 0.5, 2);
    REQUIRE(fits.size() == 2);
    REQUIRE(fits[0].size() == 2);
    REQUIRE(fits[1].size() == 2);
    for (size_t level = 0; level < 2; ++level)
        CHECK_THAT(fits[0][level].scale, WithinAbs(fits[1][level].scale, 1e-12));
}
