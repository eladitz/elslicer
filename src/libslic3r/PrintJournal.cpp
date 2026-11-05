#include "PrintJournal.hpp"

#include "PrintConfig.hpp"

#include <boost/algorithm/string/predicate.hpp>
#include <boost/filesystem.hpp>
#include <boost/log/trivial.hpp>
#include <boost/nowide/fstream.hpp>

#include <algorithm>
#include <cstdlib>
#include <set>
#include <sstream>

namespace fs = boost::filesystem;
using json   = nlohmann::json;

namespace Slic3r { namespace PrintJournal {

namespace {

bool leaves_print_unchanged(const std::string &key)
{
    using boost::algorithm::ends_with;
    using boost::algorithm::starts_with;
    for (const char *prefix : {"printhost_", "print_host", "flashforge_", "compatible_", "inherits", "thumbnails", "flush_volumes", "wipe_tower_x", "wipe_tower_y"})
        if (starts_with(key, prefix))
            return true;
    for (const char *suffix : {"_settings_id", "_gcode", "_notes", "_colour", "_ids", "_vendor"})
        if (ends_with(key, suffix))
            return true;
    return key == "notes" || key == "different_settings_to_system" || key == "filament_multi_colour" || key == "default_print_profile" ||
           key == "default_filament_profile";
}

bool same_number_or_text(const std::string &a, const std::string &b)
{
    if (a == b)
        return true;
    char *end_a = nullptr, *end_b = nullptr;
    const double number_a = std::strtod(a.c_str(), &end_a), number_b = std::strtod(b.c_str(), &end_b);
    return end_a != a.c_str() && *end_a == 0 && end_b != b.c_str() && *end_b == 0 && number_a == number_b;
}

Settings settings_of(const json &record)
{
    return record.value("settings", Settings{});
}

int severity_rank(const std::string &severity)
{
    return severity == "bad" ? 2 : severity == "visible" ? 1 : 0;
}

std::multiset<std::string> as_set(const std::vector<std::string> &items)
{
    return {items.begin(), items.end()};
}

bool same_materials(const json &record, const std::vector<std::string> &materials)
{
    return as_set(record.value("materials", std::vector<std::string>{})) == as_set(materials);
}

} // namespace

Settings settings_from(const DynamicPrintConfig &config)
{
    Settings settings;
    for (const std::string &key : config.keys())
        if (!leaves_print_unchanged(key))
            settings[key] = config.opt_serialize(key);
    return settings;
}

json load_all(const std::string &folder)
{
    json records = json::array();
    boost::system::error_code ignored;
    for (fs::directory_iterator it(folder, ignored), end; it != end; it.increment(ignored)) {
        if (it->path().extension() != ".json")
            continue;
        boost::nowide::ifstream file(it->path().string());
        std::stringstream       text;
        text << file.rdbuf();
        json record = json::parse(text.str(), nullptr, false);
        if (record.is_object() && record.contains("id"))
            records.push_back(std::move(record));
        else
            BOOST_LOG_TRIVIAL(warning) << "Print journal: can't read " << it->path().string();
    }
    std::sort(records.begin(), records.end(), [](const json &a, const json &b) { return a.value("id", "") > b.value("id", ""); });
    return records;
}

void save(const std::string &folder, const json &record)
{
    fs::create_directories(folder);
    const fs::path target = fs::path(folder) / (record.at("id").get<std::string>() + ".json");
    const fs::path temp   = fs::path(target).replace_extension(".tmp");
    {
        boost::nowide::ofstream file(temp.string());
        file << record.dump(1, ' ', false, json::error_handler_t::replace);
    }
    fs::rename(temp, target);
}

void remove(const std::string &folder, const json &record)
{
    boost::system::error_code ignored;
    fs::remove(fs::path(folder) / (record.at("id").get<std::string>() + ".json"), ignored);
    for (const std::string &photo : record.value("photos", std::vector<std::string>{}))
        fs::remove(fs::path(folder) / photo, ignored);
}

bool still_going(const std::string &status)
{
    for (const char *word : {"printing", "pause", "paused", "pausing", "busy", "heating", "calibrate_doing"})
        if (status == word)
            return true;
    return false;
}

std::string alert_kind(const std::string &status, const std::string &error_code)
{
    if (status == "error" || !error_code.empty())
        return "error";
    return status == "pause" || status == "paused" || status == "pausing" ? "paused" : "";
}

bool has_value(const Settings &settings, const std::string &key, const std::string &value)
{
    const auto found = settings.find(key);
    if (found == settings.end())
        return false;
    std::stringstream heads(found->second);
    std::string       head;
    while (std::getline(heads, head, ','))
        if (!same_number_or_text(head, value))
            return false;
    return true;
}

json tips_for(const json &records, const std::string &printer, const std::vector<std::string> &materials, const Settings &current)
{
    std::map<std::string, json> by_name;
    for (const json &record : records) {
        if (record.value("printer", "") != printer || !same_materials(record, materials) || !record.contains("report"))
            continue;
        const bool same_settings = settings_of(record) == current;
        for (const json &defect : record["report"].value("defects", json::array())) {
            if (defect.value("wrong", false))
                continue;
            const json changes = defect.value("changes", json::array());
            // Without a setting to change, advice from different settings says little about these.
            if (changes.empty() && !same_settings)
                continue;
            const bool followed = !changes.empty() && std::all_of(changes.begin(), changes.end(), [&current](const json &change) {
                return has_value(current, change.value("key", ""), change.value("value", ""));
            });
            if (followed)
                continue;

            const std::string name  = defect.value("name", "other");
            auto              known = by_name.find(name);
            if (known != by_name.end()) {
                // Records are newest first, so the first one seen stays unless this one is an exact match.
                const int times = known->second.value("times", 1) + 1;
                if (known->second.value("same_settings", false) || !same_settings) {
                    known->second["times"] = times;
                    continue;
                }
                by_name.erase(known);
                by_name[name]["times"] = times;
            }
            json tip = {{"record", record.value("id", "")},
                        {"when", record.value("when", "")},
                        {"file", record.value("file", "")},
                        {"same_settings", same_settings},
                        {"times", by_name.count(name) ? by_name[name].value("times", 1) : 1},
                        {"name", name},
                        {"severity", defect.value("severity", "minor")},
                        {"evidence", defect.value("evidence", "")},
                        {"prevention", defect.value("prevention", "")},
                        {"changes", changes}};
            by_name[name] = std::move(tip);
        }
    }

    json tips = json::array();
    for (auto &[name, tip] : by_name)
        tips.push_back(std::move(tip));
    std::stable_sort(tips.begin(), tips.end(), [](const json &a, const json &b) {
        if (a.value("same_settings", false) != b.value("same_settings", false))
            return a.value("same_settings", false);
        return severity_rank(a.value("severity", "")) > severity_rank(b.value("severity", ""));
    });
    return tips;
}

json lessons_for(const json &records, const std::string &printer, const std::vector<std::string> &materials, const Settings &current,
                 const std::vector<std::string> &keys, size_t limit)
{
    json lessons = json::array();
    for (const json &record : records) {
        if (lessons.size() >= limit)
            break;
        if (record.value("printer", "") != printer || !record.contains("report"))
            continue;
        const Settings then = settings_of(record);
        json differences = json::object();
        for (const std::string &key : keys) {
            const auto was = then.find(key), now = current.find(key);
            if (was != then.end() && now != current.end() && was->second != now->second)
                differences[key] = {{"then", was->second}, {"now", now->second}};
        }
        lessons.push_back({{"when", record.value("when", "")},
                           {"file", record.value("file", "")},
                           {"materials", record.value("materials", json::array())},
                           {"same_materials_as_now", same_materials(record, materials)},
                           {"same_settings_as_now", then == current},
                           {"printer_status", record.value("status", "")},
                           {"user_note", record.value("note", "")},
                           {"report", record["report"]},
                           {"settings_that_differed", differences}});
    }
    return lessons;
}

}} // namespace Slic3r::PrintJournal
