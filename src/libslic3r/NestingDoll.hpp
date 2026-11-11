#pragma once

// A smaller copy of a hollow object (a cup, a bowl, a box, an egg shell) that fits inside it, like a nesting doll.
//
// The copy keeps the object's shape and is scaled the same way in every direction. It stands on the cavity's floor,
// centred in it, or for a cavity open at the bottom, such as an egg's top printed opening down, hangs from its roof.
// It is made as large as it can be while every point of it stays out of the object's walls by at least the gap and
// within the object's height.

#include <optional>
#include <vector>

#include "Point.hpp"
#include "admesh/stl.h"

namespace Slic3r { namespace NestingDoll {

enum class Problem
{
    None,
    NotHollow, // no closed-in space in the middle to put a copy in
    NoRoom,    // hollow, but not even a small copy fits
};

struct Fit
{
    Problem     problem{Problem::None};
    double      scale{1.};
    Transform3d transform{Transform3d::Identity()}; // from the object to the copy inside it, in the mesh's coordinates
    // The copy's bottom middle (or top middle, for a cavity open at the bottom) and where it goes. Any smaller scale
    // about these fits too.
    Vec3d from{Vec3d::Zero()}, to{Vec3d::Zero()};
};

// fit's placement at a smaller scale.
Transform3d at_scale(const Fit &fit, double scale);

// mesh: the object as it stands, z up. gap: the room left between the copy and the object, in mm.
Fit fit_inside(const indexed_triangle_set &mesh, double gap);

// count copies, each inside the one before, the first inside mesh. Stops early at the first that doesn't fit.
std::vector<Fit> nest(const indexed_triangle_set &mesh, double gap, int count);

// The same for pieces that go together, such as the two halves of an egg: each level is scaled the same for every
// piece, the most the tightest piece allows. Gives the fits for each mesh; all stop at the same level.
std::vector<std::vector<Fit>> nest_together(const std::vector<indexed_triangle_set> &meshes, double gap, int count);

}} // namespace Slic3r::NestingDoll
