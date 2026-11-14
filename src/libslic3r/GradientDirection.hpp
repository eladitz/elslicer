#pragma once

#include <optional>
#include <vector>

#include "ExPolygon.hpp"
#include "FilamentMixer.hpp"
#include "Point.hpp"

namespace Slic3r {

class ModelObject;
class ConfigBase;
class PrintObject;

// Elslicer: a gradient mixed filament running in any direction across an object, not only up its height.
//
// A gradient mix changes how much of each of its two filaments a layer gets, so on its own it can only change
// colour from layer to layer. To run sideways, each layer is cut in two along a line across the direction: one
// filament prints on one side, the other on the other. The cut moves from layer to layer, so over the layers
// each spot gets each filament in the share the gradient asks for there.
namespace GradientDirection {

// The object setting holding the direction, in bed coordinates, as three numbers.
extern const char *const KEY;

// The object setting holding where along the object the gradient starts and ends, as two shares of its length.
extern const char *const SPAN_KEY;

// Where the gradient runs along the object: from and to are shares of the object's length along the direction.
// Before from the object prints the gradient's first colour, after to its last.
struct Span
{
    double from{0.}, to{1.};
    bool   whole() const { return from <= 0. && to >= 1.; }
    bool   operator==(const Span &other) const { return from == other.from && to == other.to; }
};
// The shortest span, so a gradient never becomes a hard step.
constexpr double MIN_SPAN = 0.02;
Span span(const ModelObject &object);
// t along the object, 0 at one end and 1 at the other, as t along the gradient.
double within(const Span &span, double t);

// The direction set on an object, unless it is straight up over the whole object, which the mix does by itself.
std::optional<Vec3d> of(const ModelObject &object);
// The way the object's gradient runs: its direction, or straight up.
Vec3d direction_or_up(const ModelObject &object);

// A gradient mix of two filaments.
struct Slot
{
    unsigned int  slot{0};        // 1-based filament number of the mix
    unsigned int  first{0}, second{0}; // 1-based filaments it mixes
    double        start{0.1}, end{0.9}; // share of the first filament where the gradient starts and ends
    GradientCurve curve;          // when set, gives the first filament's share instead of start and end
};

// The gradient mixes of two filaments in this configuration.
std::vector<Slot> gradient_slots(const ConfigBase &config);

// The first filament's share at t, from 0 where the gradient starts to 1 where it ends.
double first_share(const Slot &slot, double t);

// Whether layer number layer prints the first filament at t. Over many layers that happens in the share
// first_share gives.
bool first_on_layer(const Slot &slot, double t, size_t layer);

// The first filament's share at t along the object, 0 at one end and 1 at the other: the gradient within the
// span, and the filament at that end alone outside it.
double share_along(const Slot &slot, const Span &span, double t);
// Whether layer number layer prints the first filament at t along the object.
bool first_along(const Slot &slot, const Span &span, double t, size_t layer);

// The 1-based filaments the object prints with, from its parts and its painting.
std::vector<unsigned int> used_filaments(const ModelObject &object);

// The filaments that the object's gradient mixes are split into, when it has a direction. They are painted
// regions of the object, like hand painting.
std::vector<unsigned int> split_filaments(const ModelObject &object, const ConfigBase &config);

// Moves what the object's gradient mixes print in each layer, painted or not, to their two filaments, cut as
// the direction asks. segmentation is per layer and 0-based filament, as painting gives it.
void split(const PrintObject &object, std::vector<std::vector<ExPolygons>> &segmentation);

} // namespace GradientDirection
} // namespace Slic3r
