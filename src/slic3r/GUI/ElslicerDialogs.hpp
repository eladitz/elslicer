#pragma once

#include <functional>
#include <optional>
#include <string>
#include <utility>
#include <vector>

#include "libslic3r/Point.hpp"

namespace Slic3r { namespace GUI {

// What a printer reports for one of its filament slots, with the app's matching filament profile.
struct LoadedFilament
{
    int         slot{0}; // 1-based, and the same number as the print head.
    bool        has_filament{false};
    std::string material;
    std::string colour;
    std::string preset;
};

// Asks the connected printer what it has loaded. Calls done only if a printer answered.
void read_loaded_filaments(std::function<void(const std::vector<LoadedFilament>&)> done);


// layer: layer to preselect, or 0 for none.
void show_resume_dialog(int layer = 0);
void show_ai_setup_dialog();
// Opens Elai, which answers questions about the app's settings and common printing problems from what is built in.
void show_elai();
// Goes through one settings section a setting at a time, explaining each, then gives what was chosen to the tab.
void show_setting_guide(class Tab *tab, const std::string &page, const std::string &section, const std::vector<std::string> &keys);
// Adds the mixes between two filaments of the same material.
void show_palette_dialog();
// Paints the selected object in bands running from one filament to another, in a direction the user aims.
void show_gradient_dialog();
// A colour gradient painted on an object since the app started.
struct ObjectGradient
{
    std::vector<unsigned int> filaments; // 1-based, first band to last
    Vec3d                     direction{Vec3d::UnitX()};
    std::string               from_colour, to_colour;
};
// The gradient painted on an object, if any.
const ObjectGradient *object_gradient(int object_idx);
// Paints an object's gradient again, along a new direction in bed coordinates.
void repaint_gradient(int object_idx, const Vec3d &direction);
// How something on the sizing head is worn.
struct HeadWear
{
    std::string way;           // "tiara", "headband" or "mask"
    bool        flipped{false}; // a mask turned the other way up
    bool        keep_size{false}; // don't fit or resize it again when it's moved on the head
};
// Asks how something on the sizing head is worn, out of the ways it can be, showing each choice on it as it is
// picked. preview applies a choice and returns the scale it took, in percent, and whether it goes around the
// head (otherwise it was set on top at its own size). Gives what was kept, or nothing if cancelled.
std::optional<HeadWear> choose_head_wear(const std::string &name, const std::vector<std::string> &ways, const HeadWear &initial,
                                         std::function<std::pair<int, bool>(const HeadWear &)> preview);
// Makes a box that prints flat with grooved fold lines and folds up by hand, and adds it to the plate.
void show_fold_box_dialog();
// Adds smaller copies of the selected hollow object that each fit inside the one before, like nesting dolls.
void show_nesting_doll_dialog();
bool can_make_nesting_doll();
// Makes an animal mask or head, or the selected object, as flat sheets with fold lines to fold up by hand.
// from_selection opens it on the selected object.
void show_origami_dialog(bool from_selection = false);
// Asks which printer, print head and filament to use for a file that was just opened.
void show_open_chooser_dialog();

// The record of past prints, with a photo and Claude's reading of each.
void show_print_journal();
// Starts watching for a print to end, if one was under way when the app last closed.
void start_print_journal();
// The user just asked for a pause from this app, so the print journal needn't alert them to it.
void journal_expect_pause();
// A print was just sent to the printer with these settings.
void journal_print_sent(const std::string &file, const std::string &model_name);
// Shows what past prints suggest, if anything. False means the user changed settings or cancelled, so don't send.
bool journal_check_before_print();
// Warns when support is off for objects with overhangs that may need it. False means don't send.
bool support_check_before_print();
// Before a print is sent: if the printer is still showing the last print as finished, asks whether the bed is clear,
// and if so tells the printer so. False means don't send.
bool printer_ready_check_before_print();

}} // namespace Slic3r::GUI
