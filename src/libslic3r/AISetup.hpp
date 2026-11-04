#pragma once

#include <string>
#include <vector>

// Elslicer: the only settings AI setup may change, and the limits it must respect.
namespace Slic3r { namespace AISetup {

struct CheckedChange
{
    bool        accepted{false};
    std::string key;
    std::string value; // what will be applied, after any limit
    std::string note;  // why it was refused or limited; empty if unchanged
};

const std::vector<std::string> &allowed_keys();

// Refuses keys outside the list and values the setting can't hold. Limits numbers
// to the setting's range, layer height to the nozzle, and speeds to the printer.
// A max_speed of 0 means the printer's limit is unknown.
CheckedChange check_change(const std::string &key, const std::string &value, double nozzle_diameter, double max_speed);

}} // namespace Slic3r::AISetup
