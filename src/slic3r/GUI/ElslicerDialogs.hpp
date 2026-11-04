#pragma once

namespace Slic3r { namespace GUI {

// layer: layer to preselect, or 0 for none.
void show_resume_dialog(int layer = 0);
void show_ai_setup_dialog();
// Asks which printer, print head and filament to use for a file that was just opened.
void show_open_chooser_dialog();

}} // namespace Slic3r::GUI
