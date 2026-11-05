#pragma once

#include "admesh/stl.h"

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

// A bar the user moves after Claude has answered. Each setting belongs to one bar at most, so
// the bars can't fight over a value. Settings on no bar are the same at every position.
struct Bar
{
    std::string              id;
    std::string              title;
    std::string              left;
    std::string              right;
    std::vector<std::string> keys;
};
const std::vector<Bar> &bars();
std::vector<std::string> keys_outside_bars();

// Refuses keys outside the list and values the setting can't hold. Limits numbers
// to the setting's range, layer height to the nozzle, and speeds to the printer.
// Support heads must exist on the printer. A max_speed or heads of 0 means that limit is unknown.
CheckedChange check_change(const std::string &key, const std::string &value, double nozzle_diameter, double max_speed, int heads = 0);

// How many heights the mesh has a low point with nothing under it, so that it can't print there without support.
int mid_air_starts(const indexed_triangle_set &its);

}} // namespace Slic3r::AISetup
