#pragma once

#include <nlohmann/json.hpp>

#include <map>
#include <string>
#include <vector>

namespace Slic3r {

class DynamicPrintConfig;

// Elslicer: what happened to past prints and what to do differently, kept as one JSON file per
// print beside its photos. Nothing here touches the GUI or the network.
namespace PrintJournal {

using Settings = std::map<std::string, std::string>;

// Every setting that can change how a print comes out. Names, colours, addresses and G-code
// are left out, so giving a filament another colour still counts as the same settings.
Settings settings_from(const DynamicPrintConfig &config);

// Newest first.
nlohmann::json load_all(const std::string &folder);
void           save(const std::string &folder, const nlohmann::json &record);
void           remove(const std::string &folder, const nlohmann::json &record);

// True if the setting already holds this value on every head.
// Whether a print is still under way, whatever state it's in. Status is the printer's word, lower case.
bool still_going(const std::string &status);
// What the printer wants the user to know: "error", "paused", or nothing. Flashforge says "pause" as well as "paused".
std::string alert_kind(const std::string &status, const std::string &error_code);

bool has_value(const Settings &settings, const std::string &key, const std::string &value);

// What past prints with this printer and these materials suggest, most relevant first.
// A tip whose changes are already in place is left out, because that advice has been followed.
// Each has: record, when, file, same_settings, times, name, severity, evidence, prevention, changes.
nlohmann::json tips_for(const nlohmann::json &records, const std::string &printer, const std::vector<std::string> &materials, const Settings &current);

// A short history for Claude: at most 'limit' analysed prints on this printer, each with the
// settings from 'keys' that differ from 'current', so it can see what was tried and what happened.
nlohmann::json lessons_for(const nlohmann::json &records, const std::string &printer, const std::vector<std::string> &materials, const Settings &current,
                           const std::vector<std::string> &keys, size_t limit = 8);

} // namespace PrintJournal
} // namespace Slic3r
