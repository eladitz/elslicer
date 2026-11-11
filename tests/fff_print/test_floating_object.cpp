#include <catch2/catch_all.hpp>
#include <algorithm>
#include <regex>
#include <sstream>
#include <string>

#include "libslic3r/Model.hpp"
#include "libslic3r/Print.hpp"
#include "libslic3r/Exception.hpp"

#include "test_helpers.hpp"

using namespace Slic3r;

namespace {

// A 20 mm cube with its bottom 10 mm above the bed, kept there by turning off auto drop.
void floating_cube(Print &print, Model &model, bool support)
{
    Test::init_print({Test::cube(20)}, print, model,
                     {{"enable_support", support ? "1" : "0"}, {"support_type", "normal(auto)"}, {"layer_height", "0.2"},
                      {"initial_layer_print_height", "0.2"}});
    ModelObject *object = model.objects.front();
    object->auto_drop = false;
    object->translate_instances(Vec3d(0, 0, 10));
    print.apply(model, print.full_print_config());
}

// Heights of every layer that extrudes something, from the layer change comments.
std::vector<double> extruding_heights(const std::string &gcode)
{
    std::vector<double> heights;
    double z = 0;
    bool counted = false;
    std::istringstream lines(gcode);
    for (std::string line; std::getline(lines, line);) {
        if (std::smatch m; std::regex_search(line, m, std::regex("^;Z:([0-9.]+)"))) {
            z = std::stod(m[1]);
            counted = false;
        } else if (!counted && std::regex_search(line, std::regex("^G1 .*E[0-9.]+")) && z > 0) {
            heights.push_back(z);
            counted = true;
        }
    }
    return heights;
}

} // namespace

TEST_CASE("A floating object keeps its height", "[FloatingObject]")
{
    Print print;
    Model model;
    floating_cube(print, model, true);
    CHECK_THAT(model.objects.front()->min_z(), Catch::Matchers::WithinAbs(10, 1e-6));
}

TEST_CASE("Support fills the space under a floating object from the bed", "[FloatingObject]")
{
    Print print;
    Model model;
    floating_cube(print, model, true);
    print.process();
    const std::vector<double> heights = extruding_heights(Test::gcode(print));
    REQUIRE(!heights.empty());
    INFO("first " << heights.front() << ", last " << heights.back() << ", layers " << heights.size());
    CHECK_THAT(heights.front(), Catch::Matchers::WithinAbs(0.2, 1e-3));
    CHECK_THAT(heights.back(), Catch::Matchers::WithinAbs(30, 0.01));
    // Something prints all the way up from the bed, so nothing is left in mid-air.
    double widest_gap = 0;
    for (size_t i = 1; i < heights.size(); ++i)
        widest_gap = std::max(widest_gap, heights[i] - heights[i - 1]);
    CHECK(widest_gap < 0.5);
}

TEST_CASE("A floating object without support is refused instead of printed in mid-air", "[FloatingObject]")
{
    Print print;
    Model model;
    floating_cube(print, model, false);
    std::string message;
    try {
        print.process();
    } catch (const SlicingErrors &errors) {
        message = print.slicing_errors_message(errors);
    }
    INFO(message);
    CHECK(!message.empty());
}
