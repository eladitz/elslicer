#pragma once

#include <vector>

#include "Point.hpp"

namespace Slic3r {

class ModelObject;

// Elslicer: a sideways colour gradient, painted as bands across an object. Layer mixing can only change colour
// from one layer to the next, so a gradient across a layer is made of bands, each painted with its own filament
// or mix.
namespace ColourBands {

// Paints every part of the object's first instance in equal bands along direction (in bed coordinates), the
// first band with filaments.front() and the last with filaments.back(). Filaments are 1-based. Paint already
// on the parts is replaced.
void paint(ModelObject &object, const Vec3d &direction, const std::vector<unsigned int> &filaments);

} // namespace ColourBands
} // namespace Slic3r
