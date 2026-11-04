#include "AISetup.hpp"

#include "PrintConfig.hpp"

#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <memory>

namespace Slic3r { namespace AISetup {

const std::vector<std::string> &allowed_keys()
{
    static const std::vector<std::string> keys = {
        "layer_height",        "initial_layer_print_height", "wall_loops",         "top_shell_layers",
        "bottom_shell_layers", "sparse_infill_density",      "sparse_infill_pattern", "enable_support",
        "support_type",        "support_threshold_angle",    "brim_type",          "brim_width",
        "seam_position",       "ironing_type",               "outer_wall_speed",   "inner_wall_speed",
        "sparse_infill_speed", "internal_solid_infill_speed", "top_surface_speed",
    };
    return keys;
}

CheckedChange check_change(const std::string &key, const std::string &value, double nozzle_diameter, double max_speed)
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
    if (type == coFloat || type == coInt || type == coPercent) {
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
        const double limited = std::min(std::max(requested, low), high);

        char buf[32];
        if (type == coInt)
            std::snprintf(buf, sizeof(buf), "%d", int(limited));
        else if (type == coPercent)
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

}} // namespace Slic3r::AISetup
