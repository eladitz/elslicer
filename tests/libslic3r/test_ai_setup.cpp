#include <catch2/catch_all.hpp>

#include <algorithm>

#include "libslic3r/AISetup.hpp"
#include "libslic3r/TriangleMesh.hpp"

using namespace Slic3r::AISetup;
using Slic3r::its_make_cube;
using Slic3r::its_merge;

TEST_CASE("AI setup only changes listed settings", "[AISetup]")
{
    CHECK_FALSE(check_change("machine_start_gcode", "G28", 0.4, 300.).accepted);
    CHECK_FALSE(check_change("nozzle_temperature", "300", 0.4, 300.).accepted);
    CHECK_FALSE(check_change("not_a_setting", "1", 0.4, 300.).accepted);
    CHECK(check_change("wall_loops", "3", 0.4, 300.).accepted);
}

TEST_CASE("AI setup keeps values within limits", "[AISetup]")
{
    SECTION("Layer height follows the nozzle")
    {
        const CheckedChange high = check_change("layer_height", "0.6", 0.4, 300.);
        REQUIRE(high.accepted);
        CHECK(high.value == "0.3");
        CHECK_FALSE(high.note.empty());

        const CheckedChange fine = check_change("layer_height", "0.2", 0.4, 300.);
        REQUIRE(fine.accepted);
        CHECK(fine.value == "0.2");
        CHECK(fine.note.empty());
    }
    SECTION("Speeds follow the printer")
    {
        const CheckedChange fast = check_change("outer_wall_speed", "900", 0.4, 300.);
        REQUIRE(fast.accepted);
        CHECK(fast.value == "300");
    }
    SECTION("Infill stays a percentage")
    {
        const CheckedChange over = check_change("sparse_infill_density", "150%", 0.4, 300.);
        REQUIRE(over.accepted);
        CHECK(over.value == "100%");
    }
    SECTION("Invalid choices are refused")
    {
        CHECK_FALSE(check_change("sparse_infill_pattern", "not_a_pattern", 0.4, 300.).accepted);
        CHECK(check_change("sparse_infill_pattern", "gyroid", 0.4, 300.).accepted);
    }
}

TEST_CASE("AI setup can choose supports and hide seams", "[AISetup]")
{
    SECTION("Support material must be on a head the printer has")
    {
        CHECK(check_change("support_filament", "4", 0.4, 300., 4).accepted);
        CHECK(check_change("support_interface_filament", "0", 0.4, 300., 4).accepted);
        CHECK_FALSE(check_change("support_filament", "5", 0.4, 300., 4).accepted);
    }
    SECTION("A support gap can't be wider than the nozzle")
    {
        const CheckedChange gap = check_change("support_top_z_distance", "2", 0.4, 300.);
        REQUIRE(gap.accepted);
        CHECK(gap.value == "0.4");
    }
    SECTION("Support choices are checked")
    {
        CHECK(check_change("support_style", "organic", 0.4, 300.).accepted);
        CHECK_FALSE(check_change("support_style", "not_a_style", 0.4, 300.).accepted);
    }
    SECTION("Seam settings work")
    {
        CHECK(check_change("seam_slope_type", "external", 0.4, 300.).accepted);
        const CheckedChange percent = check_change("seam_gap", "5%", 0.4, 300.);
        REQUIRE(percent.accepted);
        CHECK(percent.value == "5%");
        const CheckedChange negative = check_change("seam_gap", "-1", 0.4, 300.);
        REQUIRE(negative.accepted);
        CHECK(negative.value == "0");
    }
}

TEST_CASE("AI setup bars never share a setting", "[AISetup]")
{
    std::vector<std::string> seen = keys_outside_bars();
    for (const Bar &bar : bars())
        for (const std::string &key : bar.keys) {
            CAPTURE(key);
            CHECK(std::find(allowed_keys().begin(), allowed_keys().end(), key) != allowed_keys().end());
            CHECK(std::find(seen.begin(), seen.end(), key) == seen.end());
            seen.push_back(key);
        }
    CHECK(seen.size() == allowed_keys().size());
}

TEST_CASE("AI setup finds parts that start in mid air", "[AISetup]")
{
    indexed_triangle_set cube = its_make_cube(10., 10., 10.);
    SECTION("A cube on the bed needs nothing") { CHECK(mid_air_starts(cube) == 0); }
    SECTION("A second cube higher up starts in mid air")
    {
        indexed_triangle_set floating = its_make_cube(10., 10., 10.);
        for (stl_vertex &vertex : floating.vertices)
            vertex += stl_vertex(20.f, 0.f, 15.f);
        its_merge(cube, floating);
        CHECK(mid_air_starts(cube) == 1);
    }

    // Four triangles meeting at a point 5 mm below their rim, and a flat triangle at the bed.
    indexed_triangle_set cone;
    cone.vertices = {{0.f, 0.f, 10.f}, {10.f, 0.f, 10.f}, {10.f, 10.f, 10.f}, {0.f, 10.f, 10.f}, {5.f, 5.f, 5.f}, {50.f, 0.f, 0.f}, {60.f, 0.f, 0.f}, {50.f, 10.f, 0.f}};
    cone.indices  = {{5, 6, 7}};
    SECTION("The floor of a pit has the part under it")
    {
        cone.indices.insert(cone.indices.end(), {{0, 1, 4}, {1, 2, 4}, {2, 3, 4}, {3, 0, 4}});
        CHECK(mid_air_starts(cone) == 0);
    }
    SECTION("A tip pointing down starts in mid air")
    {
        cone.indices.insert(cone.indices.end(), {{1, 0, 4}, {2, 1, 4}, {3, 2, 4}, {0, 3, 4}});
        CHECK(mid_air_starts(cone) == 1);
    }
}
