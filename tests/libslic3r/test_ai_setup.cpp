#include <catch2/catch_all.hpp>

#include "libslic3r/AISetup.hpp"

using namespace Slic3r::AISetup;

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
