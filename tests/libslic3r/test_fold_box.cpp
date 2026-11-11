#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_floating_point.hpp>

#include "libslic3r/ClipperUtils.hpp"
#include "libslic3r/FoldBox.hpp"
#include "libslic3r/TriangleMesh.hpp"

using namespace Slic3r;
using Catch::Matchers::WithinAbs;

TEST_CASE("A tray is one sheet with fold lines between its panels", "[FoldBox]")
{
    FoldBox::Params params;
    const FoldBox::Layout layout = FoldBox::make(params);
    REQUIRE(layout.problem == FoldBox::Problem::None);
    REQUIRE(layout.pieces.size() == 1);
    const FoldBox::Piece &box = layout.pieces.front();
    // Floor, two side walls, four ears, and two ends of wall, rim and inner panel with its tabs.
    CHECK(box.sheet.size() == 1 + 2 + 4 + 2 * 3);
    CHECK(!box.hinges.empty());
    // Full thickness and hinge only don't overlap.
    CHECK(area(intersection_ex(box.sheet, box.hinges)) < 1e-3 * area(box.sheet));
    // The tabs' slots go through the floor.
    size_t holes = 0;
    for (const ExPolygon &e : box.sheet)
        holes += e.holes.size();
    CHECK(holes == 4);
    CHECK_THAT(layout.inside.x(), WithinAbs(80., 1e-9));
    CHECK_THAT(layout.outside.y(), WithinAbs(60. + 2. * 0.6, 1e-9));
}

TEST_CASE("An outside size is the box's size closed", "[FoldBox]")
{
    FoldBox::Params params;
    params.outside = true;
    const FoldBox::Layout layout = FoldBox::make(params);
    REQUIRE(layout.problem == FoldBox::Problem::None);
    CHECK_THAT(layout.outside.x(), WithinAbs(80., 1e-9));
    CHECK_THAT(layout.outside.y(), WithinAbs(60., 1e-9));
    CHECK_THAT(layout.outside.z(), WithinAbs(30., 1e-9));
}

TEST_CASE("A tray and lid makes a lid wider than the tray", "[FoldBox]")
{
    FoldBox::Params params;
    params.style = FoldBox::Style::TrayAndLid;
    const FoldBox::Layout layout = FoldBox::make(params);
    REQUIRE(layout.pieces.size() == 2);
    const BoundingBoxf tray = layout.pieces[0].size(), lid = layout.pieces[1].size();
    // The lid is shallower, so its flat sheet is shorter across even though its floor is bigger.
    CHECK(lid.size().y() < tray.size().y());
}

TEST_CASE("A mailer's lid and tuck flap come off the back wall", "[FoldBox]")
{
    FoldBox::Params params;
    params.style = FoldBox::Style::Mailer;
    const FoldBox::Layout layout = FoldBox::make(params);
    REQUIRE(layout.pieces.size() == 1);
    FoldBox::Params tray_params;
    const BoundingBoxf mailer = layout.pieces[0].size(), tray = FoldBox::make(tray_params).pieces[0].size();
    // The lid adds about the box's width, and the flap more.
    CHECK(mailer.size().y() > tray.size().y() + 60.);
}

TEST_CASE("Boxes too small, or hinges too thick, are refused", "[FoldBox]")
{
    FoldBox::Params params;
    params.height = 5.;
    CHECK(FoldBox::make(params).problem == FoldBox::Problem::TooSmall);
    params        = {};
    params.hinge  = 0.6;
    CHECK(FoldBox::make(params).problem == FoldBox::Problem::HingeTooThick);
}

TEST_CASE("The sheet extrudes to a closed solid of its area times its thickness", "[FoldBox]")
{
    const FoldBox::Layout layout = FoldBox::make({});
    const FoldBox::Piece &box    = layout.pieces.front();
    const indexed_triangle_set sheet = FoldBox::extrude(box.sheet, 0., 0.6);
    CHECK(its_num_open_edges(sheet) == 0);
    CHECK_THAT(its_volume(sheet), WithinAbs(area(box.sheet) * SCALING_FACTOR * SCALING_FACTOR * 0.6, 1.));
    const indexed_triangle_set hinges = FoldBox::extrude(box.hinges, 0., 0.2);
    CHECK(its_num_open_edges(hinges) == 0);
}
