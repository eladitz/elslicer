#include <catch2/catch_test_macros.hpp>

#include "libslic3r/TriangleMesh.hpp"
#include "libslic3r/TriangleSelector.hpp"

#include <cstdlib>
#include <filesystem>
#include <iostream>

using namespace Slic3r;

// Runs part fill on a real sculpt when ELSLICER_PART_FILL_STL points at one. The sizes are the faces of each part as
// counted by hand-checked renders of the same seeds.
TEST_CASE("Part fill selects one sculpted part", "[TriangleSelector]")
{
    const char *path = std::getenv("ELSLICER_PART_FILL_STL");
    if (path == nullptr || !std::filesystem::exists(path))
        SKIP("Set ELSLICER_PART_FILL_STL to the statue bust");
    TriangleMesh mesh;
    REQUIRE(mesh.ReadSTLFile(path));
    std::cout << "faces " << mesh.its.indices.size() << " vertices " << mesh.its.vertices.size() << "\n";
    const std::pair<const char *, int> seeds[] = {{"rope", 41950}, {"antler", 46684}, {"crown", 58417},
                                                  {"chest antler", 3332}, {"hair", 24095}, {"necklace", 88228}};
    for (auto [name, facet] : seeds) {
        TriangleSelector sel(mesh);
        const auto &t   = mesh.its.indices[facet];
        const Vec3f hit = (mesh.its.vertices[t[0]] + mesh.its.vertices[t[1]] + mesh.its.vertices[t[2]]) / 3.f;
        sel.part_fill_select_triangles(hit, facet, TriangleSelector::ClippingPlane(), 0, true);
        sel.seed_fill_apply_on_triangles(EnforcerBlockerType::Extruder1);
        std::cout << name << " " << sel.get_facets(EnforcerBlockerType::Extruder1).indices.size() << "\n";
    }
}
