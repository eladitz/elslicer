#pragma once

#include <cstddef>
#include <string>
#include <vector>

// Elslicer: turns a finished G-code file into one that continues a failed print
// from a chosen layer. Text only, with no UI or slicer dependencies.
namespace Slic3r { namespace ResumeFromLayer {

// How the file tells the printer its height without homing Z.
enum class ZMethod { None, Klipper, G92 };

struct Layer
{
    int         number{0};  // 1-based
    double      z{0.};      // top of this layer
    double      height{0.}; // thickness of this layer
    std::size_t line{0};    // 0-based line of its ;LAYER_CHANGE marker
};

struct Options
{
    std::string source;
    std::string target;
    int         layer{0}; // first layer to print
    ZMethod     method{ZMethod::None};
    double      bed_x{0.};
    double      bed_y{0.};
    double      clearance{5.};  // mm to lift before any XY move
    double      prime_mm{15.};  // filament extruded in the air before continuing
};

struct Result
{
    bool                     ok{false};
    std::string              error;
    std::vector<std::string> warnings;
    double                   declared_z{0.}; // height the nozzle must be at when the job starts
    int                      layers_left{0};
};

std::vector<Layer> scan_layers(const std::string &path);

// Layer to continue from, given the measured height of the failed part.
// Returns 0 when the height is outside the print.
int layer_after_measured_height(const std::vector<Layer> &layers, double height_mm);

// Picks the method for a printer. `verified` is false when nobody has confirmed
// that the firmware behaves this way.
ZMethod method_for_printer(const std::string &gcode_flavor, const std::string &printer_model, bool &verified);

// Default output name: <name>_resume_L<layer>.gcode
std::string default_target_name(const std::string &source, int layer);

// Never modifies the source. Writes the target only if every check passes.
Result write_resume_file(const Options &options);

}} // namespace Slic3r::ResumeFromLayer
