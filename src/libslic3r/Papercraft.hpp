#pragma once

// Low-poly shapes printed flat as thin sheets with their fold lines grooved in, and folded up by hand: animal masks
// to wear, whole animals made of parts glued together, or any model cut down to a few flat faces.
//
// A shape is unfolded into nets: flat faces joined along the fold lines, each net small enough for the plate. The
// print's bed side is the outside of the shape, so the grooves are on the inside and a convex fold closes its groove,
// which is made just wide enough to close at that fold's angle. Where the shape is cut open to lie flat, one side of
// the cut gets a glue tab and both sides the same number, engraved into the inside.
//
// Coordinates are in mm.

#include <vector>

#include "FoldBox.hpp"
#include "Point.hpp"
#include "admesh/stl.h"

namespace Slic3r { namespace Papercraft {

enum class Animal
{
    Fox,
    Wolf,
    Cat,
    Bear,
    Rabbit,
};

struct Shape
{
    indexed_triangle_set mesh;  // outward facing; a mask is open at the back and at the eyes
    std::vector<Vec3d>   holes; // centres of holes for a strap, on the surface
};

// A mask to wear, x across the face, y up and z forward, centred between the eyes. head_width is the width it wraps
// around, temple to temple.
Shape mask(Animal animal, double head_width);
// mesh cut down to about faces triangles.
indexed_triangle_set simplify(const indexed_triangle_set &mesh, int faces);

struct Params
{
    double sheet{0.6};  // full thickness of the sheet
    double hinge{0.2};  // what is left under a groove
    double tab{7.};     // glue tab width
    bool   tabs{true};
    bool   numbers{true}; // engrave matching numbers on the two sides of every cut
    Vec2d  bed{256., 256.};
    double hole_radius{1.6};
    int    first_number{1}; // the number of the first cut, so the parts of one thing don't repeat numbers
};

enum class Problem
{
    None,
    Empty,         // no faces
    HingeTooThick, // the hinge is at least as thick as the sheet
    TooThin,       // the sheet or hinge is thinner than can be printed
    FaceTooBig,    // a face alone doesn't fit on the plate
};

struct Net
{
    Problem                      problem{Problem::None};
    std::vector<FoldBox::Piece>  pieces;
    indexed_triangle_set         mesh;       // the shape as unfolded
    std::vector<int>             face_piece; // for each triangle of mesh, the piece it is on
    int                          folds{0};
    int                          joins{0};   // cuts to glue back together
};

Net unfold(const indexed_triangle_set &mesh, const std::vector<Vec3d> &holes, const Params &params);

// Where a piece goes on a plate: its index, and where its lower left corner goes.
struct Placement
{
    int   piece;
    Vec2d at;
};
// Pieces put together on as few plates as will hold them, gap apart and from the plate's edge.
std::vector<std::vector<Placement>> pack(const std::vector<FoldBox::Piece> &pieces, const Vec2d &bed, double gap);

}} // namespace Slic3r::Papercraft
