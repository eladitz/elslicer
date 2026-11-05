#include "AISetup.hpp"

#include "PrintConfig.hpp"

#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <cmath>
#include <memory>
#include <numeric>
#include <set>

namespace Slic3r { namespace AISetup {

const std::vector<std::string> &allowed_keys()
{
    static const std::vector<std::string> keys = {
        "layer_height",        "initial_layer_print_height", "wall_loops",         "top_shell_layers",
        "bottom_shell_layers", "sparse_infill_density",      "sparse_infill_pattern", "enable_support",
        "support_type",        "support_threshold_angle",    "brim_type",          "brim_width",
        "seam_position",       "ironing_type",               "outer_wall_speed",   "inner_wall_speed",
        "sparse_infill_speed", "internal_solid_infill_speed", "top_surface_speed",
        // Supports: where they go, what they're made of, and how easily they come off.
        "support_style",               "support_on_build_plate_only",   "support_filament",
        "support_interface_filament",  "support_interface_not_for_body", "support_interface_top_layers",
        "support_interface_bottom_layers", "support_interface_spacing", "support_top_z_distance",
        "support_bottom_z_distance",   "support_object_xy_distance",    "support_base_pattern",
        "support_base_pattern_spacing", "support_speed",                "enable_prime_tower",
        // Hiding the seam.
        "seam_gap",                    "seam_slope_type",               "seam_slope_conditional",
        "wall_sequence",               "fuzzy_skin",
    };
    return keys;
}

const std::vector<Bar> &bars()
{
    static const std::vector<Bar> list = {
        {"quality", "Quality and speed", "Faster", "Better surface",
         {"layer_height", "initial_layer_print_height", "outer_wall_speed", "inner_wall_speed", "sparse_infill_speed",
          "internal_solid_infill_speed", "top_surface_speed", "ironing_type"}},
        {"strength", "Strength", "Lighter", "Stronger",
         {"wall_loops", "top_shell_layers", "bottom_shell_layers", "sparse_infill_density", "sparse_infill_pattern"}},
        {"supports", "Supports", "Easier to remove", "Cleaner underside",
         {"support_top_z_distance", "support_bottom_z_distance", "support_interface_top_layers", "support_interface_bottom_layers",
          "support_interface_spacing", "support_object_xy_distance", "support_base_pattern", "support_base_pattern_spacing"}},
        {"seam", "Seam", "Quickest", "Most hidden",
         {"seam_position", "seam_gap", "seam_slope_type", "seam_slope_conditional", "wall_sequence", "fuzzy_skin"}},
    };
    return list;
}

std::vector<std::string> keys_outside_bars()
{
    std::vector<std::string> keys;
    for (const std::string &key : allowed_keys()) {
        const bool on_bar = std::any_of(bars().begin(), bars().end(), [&key](const Bar &bar) {
            return std::find(bar.keys.begin(), bar.keys.end(), key) != bar.keys.end();
        });
        if (!on_bar)
            keys.push_back(key);
    }
    return keys;
}

CheckedChange check_change(const std::string &key, const std::string &value, double nozzle_diameter, double max_speed, int heads)
{
    CheckedChange out;
    out.key   = key;
    out.value = value;

    const auto &keys = allowed_keys();
    const ConfigOptionDef *def = print_config_def.get(key);
    if (def == nullptr || std::find(keys.begin(), keys.end(), key) == keys.end()) {
        out.note = "This setting isn't one AI setup may change.";
        return out;
    }

    std::unique_ptr<ConfigOption> opt(def->create_default_option());
    if (!opt->deserialize(value)) {
        out.note = "\"" + value + "\" isn't a valid value for this setting.";
        return out;
    }

    const ConfigOptionType type = def->type;
    if ((key == "support_filament" || key == "support_interface_filament") && heads > 0 && std::atoi(value.c_str()) > heads) {
        out.note = "This printer doesn't have head " + value + ".";
        return out;
    }
    const bool is_percent = type == coPercent || (type == coFloatOrPercent && value.find('%') != std::string::npos);
    // Speeds are lists with one value per nozzle. AI setup gives them one value, and
    // the app copies it to every nozzle when applying.
    if (type == coFloat || type == coFloats || type == coInt || type == coPercent || type == coFloatOrPercent) {
        const double requested = std::strtod(value.c_str(), nullptr);
        double low  = double(def->min);
        double high = double(def->max);
        const bool is_speed = key.size() > 6 && key.compare(key.size() - 6, 6, "_speed") == 0;
        if (is_speed && max_speed > 0.)
            high = std::min(high, max_speed);
        if ((key == "layer_height" || key == "initial_layer_print_height") && nozzle_diameter > 0.) {
            low  = std::max(low, 0.25 * nozzle_diameter);
            high = std::min(high, 0.75 * nozzle_diameter);
        }
        if ((key == "support_top_z_distance" || key == "support_bottom_z_distance") && nozzle_diameter > 0.)
            high = std::min(high, nozzle_diameter);
        const double limited = std::min(std::max(requested, low), high);

        char buf[32];
        if (type == coInt)
            std::snprintf(buf, sizeof(buf), "%d", int(limited));
        else if (is_percent)
            std::snprintf(buf, sizeof(buf), "%g%%", limited);
        else
            std::snprintf(buf, sizeof(buf), "%g", limited);
        if (!opt->deserialize(buf)) {
            out.note = "\"" + value + "\" isn't a valid value for this setting.";
            return out;
        }
        if (limited != requested)
            out.note = "Limited to " + std::string(buf) + " to stay within what this setup allows.";
    }

    out.value    = opt->serialize();
    out.accepted = true;
    return out;
}

int mid_air_starts(const indexed_triangle_set &its)
{
    if (its.vertices.empty())
        return 0;

    // Touching vertices at one height count as one flat area, and a low point has to face down:
    // the floor of a pit is a low point too, but it has the part under it.
    std::vector<int> area(its.vertices.size());
    std::iota(area.begin(), area.end(), 0);
    const auto find = [&area](int v) {
        while (area[v] != v)
            v = area[v] = area[area[v]];
        return v;
    };
    const auto z = [&its](int v) { return its.vertices[v].z(); };
    constexpr float flat = 1e-4f;
    for (const stl_triangle_vertex_indices &face : its.indices)
        for (int i = 0; i < 3; ++i)
            if (std::abs(z(face[i]) - z(face[(i + 1) % 3])) <= flat)
                area[find(face[i])] = find(face[(i + 1) % 3]);

    std::vector<char> has_lower(its.vertices.size(), 0), faces_down(its.vertices.size(), 0);
    float lowest = z(0);
    for (const stl_vertex &vertex : its.vertices)
        lowest = std::min(lowest, vertex.z());
    for (const stl_triangle_vertex_indices &face : its.indices) {
        const stl_vertex a = its.vertices[face[0]], b = its.vertices[face[1]], c = its.vertices[face[2]];
        const bool down = (b - a).cross(c - a).z() < 0.f;
        for (int i = 0; i < 3; ++i) {
            const int here = face[i], next = face[(i + 1) % 3];
            if (z(next) < z(here) - flat)
                has_lower[find(here)] = 1;
            else if (z(here) < z(next) - flat)
                has_lower[find(next)] = 1;
            if (down)
                faces_down[find(here)] = 1;
        }
    }

    std::set<int> heights;
    for (int v = 0; v < int(its.vertices.size()); ++v)
        if (const int root = find(v); root == v && !has_lower[root] && faces_down[root] && z(root) > lowest + 0.2f)
            heights.insert(int(std::round(z(root) * 10.f)));
    return int(heights.size());
}

}} // namespace Slic3r::AISetup
