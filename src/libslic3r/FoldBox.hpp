#pragma once

// A box printed flat as one thin sheet, with its fold lines grooved in, that folds up by hand and locks shut without
// glue.
//
// The sheet is full thickness except along the fold lines, where only a thin hinge layer is left. Every fold closes
// its groove: the grooved face is the inside of the box. The ends of each tray roll over: the end wall folds up, a
// narrow rim folds over the top and an inner panel comes down inside, trapping the corner ears of the side walls,
// and two tabs at its bottom go through slots in the floor.
//
// Coordinates are in mm, with the sheet on z = 0. A fold whose groove is g wide in a sheet t thick with a hinge h
// thick closes cleanly at 90 degrees when g = 2 (t - h), and then the inside faces of two panels meet at the edge
// of the full-thickness part of each, so a panel's full-thickness size is the inside size it makes.

#include <string>
#include <vector>

#include "ExPolygon.hpp"
#include "Point.hpp"
#include "admesh/stl.h"

namespace Slic3r { namespace FoldBox {

enum class Style
{
    Tray,       // an open tray
    TrayAndLid, // a tray, and a second, shallower tray that fits over it as a lid
    Mailer,     // a tray with a lid hinged on the back wall that tucks inside the front wall
};

struct Params
{
    Style  style{Style::Tray};
    // The box's length (x), width (y) and height, inside the box or outside it.
    double length{80.};
    double width{60.};
    double height{30.};
    bool   outside{false};
    double lid_depth{0.};  // tray and lid: how far the lid comes down; 0 picks one from the height
    double lid_fit{0.3};   // tray and lid: room between the tray and the lid, on each side
    bool   thumb_notch{true}; // a half-round notch to get a finger under the lid
    double sheet{0.6};     // full thickness of the sheet
    double hinge{0.2};     // what is left under a groove
    double groove{0.};     // groove width; 0 uses 2 (sheet - hinge), which folds to a square corner
    double clearance{0.15}; // room between layers that fold over each other
};

enum class Problem
{
    None,
    TooSmall,       // a side is too short for the ears and tabs
    HingeTooThick,  // the hinge is at least as thick as the sheet
    TooThin,        // the sheet or hinge is thinner than can be printed
};

struct Piece
{
    std::string name;      // "Box" or "Lid"
    ExPolygons  sheet;     // full thickness
    ExPolygons  hinges;    // hinge thickness only: the fold lines
    BoundingBoxf size() const;
};

struct Layout
{
    Problem            problem{Problem::None};
    std::vector<Piece> pieces;
    Vec3d              inside{Vec3d::Zero()};  // the room inside the box, for what goes in it
    Vec3d              outside{Vec3d::Zero()}; // the box closed, lid included
};

Layout make(const Params &params);

// shape extruded from z0 to z1, closed and outward facing.
indexed_triangle_set extrude(const ExPolygons &shape, double z0, double z1);

}} // namespace Slic3r::FoldBox
