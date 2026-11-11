#include <catch2/catch_test_macros.hpp>

#include <algorithm>
#include <vector>

#include "libslic3r/ColourBands.hpp"
#include "libslic3r/Model.hpp"
#include "libslic3r/TriangleMesh.hpp"
#include "libslic3r/TriangleSelector.hpp"

using namespace Slic3r;

namespace {

// A 20 mm cube with its low corner at the origin.
ModelObject *add_cube(Model &model)
{
    ModelObject *object = model.add_object();
    object->add_volume(TriangleMesh(its_make_cube(20., 20., 20.)));
    object->add_instance();
    return object;
}

// The lowest and highest coordinate along axis of what is painted with filament (1-based).
std::pair<float, float> painted_range(const ModelObject &object, unsigned int filament, int axis)
{
    const ModelVolume         &volume = *object.volumes.front();
    const indexed_triangle_set facets =
        volume.mmu_segmentation_facets.get_facets(volume, EnforcerBlockerType(int(EnforcerBlockerType::Extruder1) + int(filament) - 1));
    std::pair<float, float> range{1e9f, -1e9f};
    for (const stl_vertex &vertex : facets.vertices) {
        const float at = (volume.get_matrix().cast<float>() * vertex)(axis);
        range.first    = std::min(range.first, at);
        range.second   = std::max(range.second, at);
    }
    return range;
}

} // namespace

TEST_CASE("Bands are painted in order along the direction, each a share of the object", "[ColourBands]")
{
    Model        model;
    ModelObject *cube = add_cube(model);
    ColourBands::paint(*cube, Vec3d::UnitX(), {1, 2, 3, 4});
    // 20 mm in four bands is 5 mm each.
    for (unsigned int band = 0; band < 4; ++band) {
        const auto [low, high] = painted_range(*cube, band + 1, 0);
        INFO("band " << band << ": " << low << " to " << high);
        CHECK(low >= 5.f * band - 0.2f);
        CHECK(high <= 5.f * (band + 1) + 0.2f);
        CHECK(high - low > 4.5f);
    }
}

TEST_CASE("Bands follow the direction they are given, not the axes", "[ColourBands]")
{
    Model        model;
    ModelObject *cube = add_cube(model);
    // Front to back: the first band is at the back, the larger Y.
    ColourBands::paint(*cube, -Vec3d::UnitY(), {1, 2});
    CHECK(painted_range(*cube, 1, 1).first >= 9.8f);
    CHECK(painted_range(*cube, 2, 1).second <= 10.2f);
}
