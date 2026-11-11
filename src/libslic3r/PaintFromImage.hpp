#pragma once

#include "Point.hpp"
#include "AABBMesh.hpp"
#include "TriangleMesh.hpp"

#include <array>
#include <cstddef>
#include <vector>

namespace Slic3r {

// Elslicer: colour painting from a photo laid over the 3D view. The photo is sampled where each visible facet appears
// on screen, every part of the model (see TriangleSelector::segment_parts) takes the filament most of its visible area
// matches, and the main colours of the photo over the model are reported with the filament each one became.
namespace paint_from_image {

using RGB = std::array<std::size_t, 3>; // 0..255

// The photo as drawn over the 3D view, in the same screen pixels as the camera viewport (origin top left).
struct Photo
{
    const unsigned char *rgba   = nullptr; // width * height * 4 bytes, rows from the top
    int                  width  = 0;
    int                  height = 0;
    Vec2d                top_left{0., 0.};
    Vec2d                size{0., 0.};
};

struct View
{
    Matrix4d           projection_view;    // world to clip space
    std::array<int, 4> viewport{0, 0, 0, 0};
    Vec3d              camera_position;     // world
    Vec3d              camera_forward;      // world, used for orthographic views
    bool               perspective = true;
};

struct Sample
{
    int   facet;
    float weight; // visible area on screen, roughly
    RGB   rgb;
    Vec3f normal; // world, unit
};

// Samples the photo at every facet of the mesh that faces the camera, is not hidden behind other facets of the same
// mesh, and lands on the photo. `world` takes the mesh into world coordinates.
std::vector<Sample> sample_photo(const indexed_triangle_set &its, const AABBMesh &aabb, const Transform3d &world, const View &view,
                                 const Photo &photo);

struct PhotoColour
{
    RGB    rgb;
    double share;    // of the sampled area, 0..1
    int    filament; // index into the filaments it was matched against
    double distance; // CIEDE2000 between the photo colour and that filament
};

struct Result
{
    std::vector<int>         facet_filament; // per original facet, -1 where the photo said nothing
    std::vector<PhotoColour> photo_colours;  // most common first
};

// part_of_facet comes from TriangleSelector::segment_parts. A part takes the filament nearest in colour to most of its
// sampled area; parts with no samples are left alone. allowed (empty for all) limits the filaments the photo may use;
// brightness scales the photo's light before matching (1 = as it is).
Result assign_filaments(const std::vector<int> &part_of_facet, const std::vector<Sample> &samples, const std::vector<RGB> &filaments,
                        const std::vector<bool> &allowed, double brightness, std::size_t photo_colours_wanted);

} // namespace paint_from_image
} // namespace Slic3r
