#pragma once

#include <functional>
#include <string>
#include <vector>

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
// Asks which printer, print head and filament to use for a file that was just opened.
void show_open_chooser_dialog();

// The record of past prints, with a photo and Claude's reading of each.
void show_print_journal();
// Starts watching for a print to end, if one was under way when the app last closed.
void start_print_journal();
// A print was just sent to the printer with these settings.
// The user just asked for a pause from this app, so the print journal needn't alert them to it.
void journal_expect_pause();
void journal_print_sent(const std::string &file, const std::string &model_name);
// Shows what past prints suggest, if anything. False means the user changed settings or cancelled, so don't send.
bool journal_check_before_print();

}} // namespace Slic3r::GUI
