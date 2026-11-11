#pragma once

#include <optional>
#include <vector>

#include "BoundingBox.hpp"
#include "Point.hpp"
#include "TriangleMesh.hpp"

namespace Slic3r {

class ModelObject;

// Elslicer: a see-through head for sizing things worn on the head, such as tiaras and crowns. It is never
// printed. The face points to the front of the bed (-Y), and the head is widest at its forehead band.
namespace HeadReference {

// The name given to the head's part, which marks the object as a head reference.
extern const char *const PART_NAME;

// Height of the middle of the face, where a mask is centred, as a share of the head's height.
constexpr double MASK_HEIGHT_SHARE = 0.55;

// Height of the forehead band, the widest part of the head, as a share of the whole head's height from the
// bottom of its neck.
constexpr double BAND_HEIGHT_SHARE = 0.7;

// A head whose forehead band measures circumference_mm around, standing on the bed with its neck.
TriangleMesh make_mesh(double circumference_mm);

bool is_head(const ModelObject &object);

struct Fit
{
    // Applied in bed coordinates, after the object's own placement.
    Transform3d transform;
    // The uniform scale within transform.
    double scale;
    // False when it doesn't go around the head, so it was set on top at its own size.
    bool around{true};
};

// The most a fit may grow or shrink something. Anything further off isn't made for this head.
constexpr double MAX_SCALE_CHANGE = 4.;

// Where to put something worn around the head, like a tiara or crown, given its points in bed coordinates and
// the head's box on the bed, so its lowest band sits on the forehead band with its inside clearance_mm off the
// head. Its opening is centred on the head, and it keeps its own rotation. Something whose bottom doesn't go
// around a hollow middle, or would need more than MAX_SCALE_CHANGE, is set on top of the head at its own size.
// Nothing if there are no points.
std::optional<Fit> fit_to_head(const std::vector<Vec3d> &points, const BoundingBoxf3 &head_box, double clearance_mm = 0.5);

// Where to put a headband, an arc worn over the top of the head from ear to ear, given its points in bed
// coordinates however it lies (usually flat, as printed). It is turned so its arc stands across the head with
// its opening down, and scaled so its inside rests clearance_mm over the top of the head. Nothing if it isn't
// an arc or would need more than MAX_SCALE_CHANGE.
std::optional<Fit> fit_headband(const std::vector<Vec3d> &points, const BoundingBoxf3 &head_box, double clearance_mm = 0.5);

// Where to put a mask, a curved shell worn over the face, given its points in bed coordinates however it lies.
// It is turned so it bulges out to the front with its top up (the back of the bed is its top when it lies flat,
// otherwise its own up; flipped turns it the other way up), scaled as wide as the face, and moved back until its
// inside is clearance_mm off the face. Nothing if it would need more than MAX_SCALE_CHANGE.
std::optional<Fit> fit_mask(const std::vector<Vec3d> &points, const BoundingBoxf3 &head_box, bool flipped = false, double clearance_mm = 0.5);

} // namespace HeadReference
} // namespace Slic3r
