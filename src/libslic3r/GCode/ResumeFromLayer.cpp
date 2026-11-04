#include "ResumeFromLayer.hpp"

#include <algorithm>
#include <cctype>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <limits>
#include <map>
#include <sstream>

namespace Slic3r { namespace ResumeFromLayer {

namespace {

const char *const LAYER_MARKER = ";LAYER_CHANGE";

std::string strip_comment(const std::string &line)
{
    std::string out = line.substr(0, line.find(';'));
    while (!out.empty() && std::isspace(static_cast<unsigned char>(out.back())))
        out.pop_back();
    std::size_t start = 0;
    while (start < out.size() && std::isspace(static_cast<unsigned char>(out[start])))
        ++start;
    return out.substr(start);
}

std::string command_of(const std::string &code)
{
    std::string cmd = code.substr(0, code.find_first_of(" \t"));
    std::transform(cmd.begin(), cmd.end(), cmd.begin(), [](unsigned char c) { return char(std::toupper(c)); });
    return cmd;
}

// Reads a letter parameter such as the 150 in "M104 S150".
bool param(const std::string &code, char letter, double &value)
{
    for (std::size_t i = code.find_first_of(" \t"); i != std::string::npos && i + 1 < code.size(); ++i) {
        if (std::toupper(static_cast<unsigned char>(code[i])) == letter && std::isspace(static_cast<unsigned char>(code[i - 1]))) {
            char *end = nullptr;
            value     = std::strtod(code.c_str() + i + 1, &end);
            return end != code.c_str() + i + 1;
        }
    }
    return false;
}

bool has_axis_word(const std::string &code, char letter)
{
    for (std::size_t i = code.find_first_of(" \t"); i != std::string::npos && i + 1 <= code.size() && i < code.size(); ++i)
        if (i > 0 && std::toupper(static_cast<unsigned char>(code[i])) == letter && std::isspace(static_cast<unsigned char>(code[i - 1])))
            return true;
    return false;
}

// Anything that would drive the nozzle into the part sitting on the bed.
bool is_unsafe(const std::string &code)
{
    const std::string cmd = command_of(code);
    if (cmd == "G28")
        return has_axis_word(code, 'Z') || !(has_axis_word(code, 'X') || has_axis_word(code, 'Y'));
    return cmd == "G29" || cmd == "G30" || cmd == "G34" || cmd == "BED_MESH_CALIBRATE" || cmd == "PROBE" || cmd == "PROBE_CALIBRATE" ||
           cmd == "Z_TILT_ADJUST" || cmd == "QUAD_GANTRY_LEVEL" || cmd == "AUTO_BED_LEVEL" || cmd == "CALIBRATE_Z";
}

// What the printer was doing when the chosen layer began.
struct State
{
    bool                       relative_e{false};
    double                     e{0.};
    double                     retracted{0.};
    double                     feed{0.};
    int                        tool{-1};
    double                     bed{-1.};
    double                     chamber{-1.};
    std::map<int, double>      tool_temp;
    std::map<std::string, std::string> sticky; // last line of each mode command

    bool   seen_layer{false};
    double min_x{std::numeric_limits<double>::max()}, min_y{std::numeric_limits<double>::max()};
    double max_x{std::numeric_limits<double>::lowest()}, max_y{std::numeric_limits<double>::lowest()};

    void apply(const std::string &code)
    {
        const std::string cmd = command_of(code);
        double            v   = 0.;
        if (cmd == "G0" || cmd == "G1") {
            double x = 0., y = 0., e_word = 0.;
            const bool has_x = param(code, 'X', x), has_y = param(code, 'Y', y), has_e = param(code, 'E', e_word);
            if (param(code, 'F', v))
                feed = v;
            if (seen_layer) {
                if (has_x) { min_x = std::min(min_x, x); max_x = std::max(max_x, x); }
                if (has_y) { min_y = std::min(min_y, y); max_y = std::max(max_y, y); }
            }
            if (has_e) {
                const double delta = relative_e ? e_word : e_word - e;
                if (!relative_e)
                    e = e_word;
                if (delta < 0.)
                    retracted = -delta;
                else if (delta > 0.)
                    retracted = 0.;
            }
        } else if (cmd == "M82") {
            relative_e = false;
        } else if (cmd == "M83") {
            relative_e = true;
        } else if (cmd == "G92") {
            if (param(code, 'E', v))
                e = v;
        } else if (cmd == "M104" || cmd == "M109") {
            if (param(code, 'S', v)) {
                double t = tool;
                param(code, 'T', t);
                tool_temp[int(t)] = v;
            }
        } else if (cmd == "M140" || cmd == "M190") {
            if (param(code, 'S', v))
                bed = v;
        } else if (cmd == "M141" || cmd == "M191") {
            if (param(code, 'S', v))
                chamber = v;
        } else if (cmd.size() > 1 && cmd[0] == 'T' && std::isdigit(static_cast<unsigned char>(cmd[1]))) {
            tool = std::atoi(cmd.c_str() + 1);
        } else if (cmd == "M106" || cmd == "M107") {
            double fan = -1.;
            param(code, 'P', fan);
            sticky["M106 P" + std::to_string(int(fan))] = cmd == "M107" ? (fan < 0. ? "M106 S0" : "M106 P" + std::to_string(int(fan)) + " S0") : code;
        } else if (cmd == "M201" || cmd == "M203" || cmd == "M204" || cmd == "M205" || cmd == "M220" || cmd == "M221" || cmd == "M900" ||
                   cmd == "SET_VELOCITY_LIMIT" || cmd == "SET_PRESSURE_ADVANCE") {
            sticky[cmd] = code;
        }
    }
};

std::string fmt(double value)
{
    char buf[32];
    std::snprintf(buf, sizeof(buf), "%.4f", value);
    std::string s(buf);
    s.erase(s.find_last_not_of('0') + 1);
    if (!s.empty() && s.back() == '.')
        s.pop_back();
    return s;
}

} // namespace

std::vector<Layer> scan_layers(const std::string &path)
{
    std::vector<Layer> layers;
    std::ifstream      in(path);
    std::string        line;
    std::size_t        number = 0;
    while (std::getline(in, line)) {
        if (!line.empty() && line.back() == '\r')
            line.pop_back();
        if (line == LAYER_MARKER) {
            Layer layer;
            layer.number = int(layers.size()) + 1;
            layer.line   = number;
            layers.push_back(layer);
        } else if (!layers.empty() && layers.back().line + 4 >= number) {
            // Orca writes ;Z: and ;HEIGHT: straight after the marker.
            if (line.rfind(";Z:", 0) == 0)
                layers.back().z = std::atof(line.c_str() + 3);
            else if (line.rfind("; Z_HEIGHT:", 0) == 0)
                layers.back().z = std::atof(line.c_str() + 11);
            else if (line.rfind(";HEIGHT:", 0) == 0)
                layers.back().height = std::atof(line.c_str() + 8);
        }
        ++number;
    }
    return layers;
}

int layer_after_measured_height(const std::vector<Layer> &layers, double height_mm)
{
    if (layers.empty() || height_mm <= 0.)
        return 0;
    std::size_t best = 0;
    for (std::size_t i = 1; i < layers.size(); ++i)
        if (std::abs(layers[i].z - height_mm) < std::abs(layers[best].z - height_mm))
            best = i;
    // Past the end of the print there is nothing left to do.
    return best + 1 < layers.size() ? layers[best + 1].number : 0;
}

ZMethod method_for_printer(const std::string &gcode_flavor, const std::string &printer_model, bool &verified)
{
    verified = true;
    if (printer_model.find("Bambu") != std::string::npos)
        return ZMethod::None;
    // Orca's profile says Klipper, but the stock firmware is reported as proprietary.
    // Until the printer tests confirm it, treat the method as unproven.
    if (printer_model.find("Flashforge Creator 5") != std::string::npos) {
        verified = false;
        return ZMethod::G92;
    }
    if (gcode_flavor == "klipper")
        return ZMethod::Klipper;
    if (gcode_flavor == "marlin" || gcode_flavor == "marlin2" || gcode_flavor == "reprapfirmware")
        return ZMethod::G92;
    return ZMethod::None;
}

std::string default_target_name(const std::string &source, int layer)
{
    const std::filesystem::path p(source);
    return p.stem().string() + "_resume_L" + std::to_string(layer) + ".gcode";
}

Result write_resume_file(const Options &o)
{
    Result r;
    const auto fail = [&r](const std::string &why) { r.ok = false; r.error = why; return r; };

    if (o.method == ZMethod::None)
        return fail("This printer's firmware has no known safe way to set the height without homing.");
    if (o.source == o.target)
        return fail("The output file must be different from the original.");

    const std::vector<Layer> layers = scan_layers(o.source);
    if (layers.empty())
        return fail("No layer markers found. Slice the model with Orca or Elslicer first.");
    if (o.layer < 2 || o.layer > int(layers.size()))
        return fail("Choose a layer between 2 and " + std::to_string(layers.size()) + ".");

    const Layer &first = layers[o.layer - 1];
    const Layer &prev  = layers[o.layer - 2];
    if (first.z <= 0. || prev.z <= 0.)
        return fail("The file doesn't record the height of this layer.");
    if (first.z <= prev.z)
        return fail("Layer heights go backwards here, which usually means objects are printed one at a time. Continuing isn't safe.");
    r.declared_z  = prev.z;
    r.layers_left = int(layers.size()) - o.layer + 1;

    // First pass: read the state up to the chosen layer, and check everything after it.
    State       state;
    std::vector<std::string> header;
    double      first_x = 0., first_y = 0.;
    bool        have_xy = false, in_header = true;
    {
        std::ifstream in(o.source);
        if (!in)
            return fail("Can't read the G-code file.");
        std::string line;
        std::size_t number = 0;
        while (std::getline(in, line)) {
            if (!line.empty() && line.back() == '\r')
                line.pop_back();
            const std::string code = strip_comment(line);
            if (in_header) {
                if (code.empty())
                    header.push_back(line);
                else
                    in_header = false;
            }
            if (number == layers.front().line)
                state.seen_layer = true;
            if (number < first.line) {
                if (!code.empty()) {
                    state.apply(code);
                    if (command_of(code) == "EXCLUDE_OBJECT_DEFINE")
                        header.push_back(line);
                }
            } else if (!code.empty()) {
                if (is_unsafe(code))
                    return fail("Line " + std::to_string(number + 1) + " (" + code + ") would home or probe into the part, so this file can't be continued safely.");
                if (!have_xy && (command_of(code) == "G0" || command_of(code) == "G1")) {
                    double x = 0., y = 0.;
                    if (param(code, 'X', x) && param(code, 'Y', y)) {
                        first_x = x;
                        first_y = y;
                        have_xy = true;
                    }
                }
            }
            ++number;
        }
    }
    if (!have_xy)
        return fail("Couldn't find where the chosen layer starts.");
    if (state.bed < 0.)
        return fail("The file doesn't set a bed temperature.");
    if (state.tool_temp.empty())
        return fail("The file doesn't set a nozzle temperature.");
    const auto active = state.tool_temp.find(state.tool);
    const double active_temp = active != state.tool_temp.end() ? active->second : state.tool_temp.begin()->second;
    if (active_temp < 100.)
        return fail("The active nozzle is cold at this layer, so it can't continue from here.");

    // Prime over the bed corner farthest from the part.
    const double margin = 5.;
    double prime_x = margin, prime_y = margin;
    if (o.bed_x > 0. && o.bed_y > 0. && state.max_x >= state.min_x) {
        const double cx = (state.min_x + state.max_x) / 2., cy = (state.min_y + state.max_y) / 2.;
        prime_x = cx > o.bed_x / 2. ? margin : o.bed_x - margin;
        prime_y = cy > o.bed_y / 2. ? margin : o.bed_y - margin;
        if (prime_x > state.min_x - margin && prime_x < state.max_x + margin && prime_y > state.min_y - margin && prime_y < state.max_y + margin)
            r.warnings.push_back("The part covers the priming corner. The nozzle primes in the air above it, so watch for a blob.");
    } else {
        r.warnings.push_back("Bed size unknown, so priming happens at the front-left corner.");
    }

    const std::filesystem::path tmp = o.target + ".part";
    {
        std::ofstream out(tmp);
        if (!out)
            return fail("Can't write the output file.");

        for (const std::string &line : header)
            out << line << '\n';
        out << "; Elslicer: continue from layer " << o.layer << " of " << layers.size() << " (Z=" << fmt(first.z) << ")\n";
        out << "; The nozzle must be at Z=" << fmt(prev.z) << " (touching the top of layer " << prev.number << ") when this job starts.\n";
        out << "; Bed first, so the part stays stuck\n";
        if (state.chamber > 0.)
            out << "M141 S" << fmt(state.chamber) << '\n';
        out << "M190 S" << fmt(state.bed) << '\n';
        out << "; Set the height without homing Z\n";
        out << (o.method == ZMethod::Klipper ? "SET_KINEMATIC_POSITION Z=" : "G92 Z") << fmt(prev.z) << '\n';
        out << "G91\nG1 Z" << fmt(o.clearance) << " F600\nG90\n";
        out << "G28 X Y\n";
        out << "; Nozzles\n";
        for (const auto &[tool, temp] : state.tool_temp)
            if (tool != state.tool && tool >= 0)
                out << "M104 S" << fmt(temp) << " T" << tool << '\n';
        if (state.tool >= 0)
            out << 'T' << state.tool << '\n';
        out << "G1 X" << fmt(prime_x) << " Y" << fmt(prime_y) << " F6000\n";
        out << "M109 S" << fmt(active_temp);
        if (state.tool >= 0)
            out << " T" << state.tool;
        out << "\n; Prime in the air\nM83\nG1 E" << fmt(o.prime_mm) << " F200\n";
        if (state.retracted > 0.)
            out << "G1 E" << fmt(-state.retracted) << " F1800\n";
        out << "; Restore the state at this layer\n";
        out << (state.relative_e ? "M83\n" : "M82\n");
        out << "G92 E" << (state.relative_e ? "0" : fmt(state.e)) << '\n';
        for (const auto &[key, code] : state.sticky)
            out << code << '\n';
        out << "G1 X" << fmt(first_x) << " Y" << fmt(first_y) << " F6000\n";
        out << "G1 Z" << fmt(first.z) << " F600\n";
        if (state.feed > 0.)
            out << "G1 F" << fmt(state.feed) << '\n';
        out << "; Original file continues\n";

        std::ifstream in(o.source);
        std::string   line;
        std::size_t   number = 0;
        while (std::getline(in, line)) {
            if (number >= first.line)
                out << line << '\n';
            ++number;
        }
        if (!out.good()) {
            out.close();
            std::error_code ec;
            std::filesystem::remove(tmp, ec);
            return fail("Writing the output file failed. The disk may be full.");
        }
    }
    std::error_code ec;
    std::filesystem::rename(tmp, o.target, ec);
    if (ec) {
        std::filesystem::remove(tmp, ec);
        return fail("Couldn't save the output file.");
    }
    r.ok = true;
    return r;
}

}} // namespace Slic3r::ResumeFromLayer
