#include <catch2/catch_test_macros.hpp>
#include <catch2/generators/catch_generators.hpp>

#include "libslic3r/PrintConfig.hpp"
#include "libslic3r/PrintJournal.hpp"

#include <boost/filesystem.hpp>

#include <string>
#include <vector>

using namespace Slic3r;
using json = nlohmann::json;

namespace {

json defect(const std::string &name, const std::string &key = {}, const std::string &value = {})
{
    json changes = json::array();
    if (!key.empty())
        changes.push_back({{"key", key}, {"value", value}});
    return {{"name", name}, {"severity", "visible"}, {"evidence", "seen"}, {"prevention", "do this"}, {"changes", changes}};
}

json record(const std::string &id, const PrintJournal::Settings &settings, const std::vector<json> &defects)
{
    return {{"id", id}, {"printer", "P"}, {"materials", {"PLA"}}, {"settings", settings}, {"report", {{"overall", "bad"}, {"defects", defects}}}};
}

} // namespace

TEST_CASE("Print journal ignores what can't change a print", "[PrintJournal]")
{
    DynamicPrintConfig config;
    config.set_key_value("layer_height", new ConfigOptionFloat(0.2));
    config.set_key_value("filament_colour", new ConfigOptionStrings({"#ff0000"}));
    config.set_key_value("print_host", new ConfigOptionString("192.168.1.1"));
    config.set_key_value("machine_start_gcode", new ConfigOptionString("G28"));
    const PrintJournal::Settings settings = PrintJournal::settings_from(config);
    CHECK(settings.count("layer_height") == 1);
    CHECK(settings.size() == 1);
}

TEST_CASE("Print journal tips", "[PrintJournal]")
{
    const PrintJournal::Settings now = {{"layer_height", "0.2"}, {"brim_width", "0"}};

    SECTION("An exact match gives every tip, even without a setting to change")
    {
        const json tips = PrintJournal::tips_for(json::array({record("1", now, {defect("first layer"), defect("warping", "brim_width", "5")})}), "P", {"PLA"}, now);
        REQUIRE(tips.size() == 2);
        CHECK(tips[0].value("same_settings", false));
    }
    SECTION("Different settings keep only tips with a setting to change")
    {
        const PrintJournal::Settings then = {{"layer_height", "0.3"}, {"brim_width", "0"}};
        const json tips = PrintJournal::tips_for(json::array({record("1", then, {defect("first layer"), defect("warping", "brim_width", "5")})}), "P", {"PLA"}, now);
        REQUIRE(tips.size() == 1);
        CHECK(tips[0].value("name", "") == "warping");
        CHECK_FALSE(tips[0].value("same_settings", true));
    }
    SECTION("Advice already followed disappears, on every head")
    {
        const PrintJournal::Settings followed = {{"brim_width", "5.0,5"}};
        CHECK(PrintJournal::tips_for(json::array({record("1", now, {defect("warping", "brim_width", "5")})}), "P", {"PLA"}, followed).empty());
        const PrintJournal::Settings one_head = {{"brim_width", "5,0"}};
        CHECK(PrintJournal::tips_for(json::array({record("1", now, {defect("warping", "brim_width", "5")})}), "P", {"PLA"}, one_head).size() == 1);
    }
    SECTION("Another printer or other materials don't count")
    {
        const json records = json::array({record("1", now, {defect("warping", "brim_width", "5")})});
        CHECK(PrintJournal::tips_for(records, "Q", {"PLA"}, now).empty());
        CHECK(PrintJournal::tips_for(records, "P", {"PETG"}, now).empty());
    }
    SECTION("Material order doesn't matter")
    {
        json one = record("1", now, {defect("warping", "brim_width", "5")});
        one["materials"] = {"PLA", "TPU"};
        CHECK(PrintJournal::tips_for(json::array({one}), "P", {"TPU", "PLA"}, now).size() == 1);
    }
    SECTION("A defect marked wrong is dropped")
    {
        json bad = defect("warping", "brim_width", "5");
        bad["wrong"] = true;
        CHECK(PrintJournal::tips_for(json::array({record("1", now, {bad})}), "P", {"PLA"}, now).empty());
    }
    SECTION("A repeated problem counts up, and an exact match wins over a newer similar one")
    {
        const PrintJournal::Settings other = {{"layer_height", "0.3"}, {"brim_width", "0"}};
        const json records = json::array({record("2", other, {defect("warping", "brim_width", "8")}), record("1", now, {defect("warping", "brim_width", "5")})});
        const json tips = PrintJournal::tips_for(records, "P", {"PLA"}, now);
        REQUIRE(tips.size() == 1);
        CHECK(tips[0].value("record", "") == "1");
        CHECK(tips[0].value("times", 0) == 2);
    }
}

TEST_CASE("Print journal lessons say what differed", "[PrintJournal]")
{
    const PrintJournal::Settings now = {{"layer_height", "0.2"}, {"brim_width", "0"}};
    const PrintJournal::Settings then = {{"layer_height", "0.3"}, {"brim_width", "0"}};
    const json lessons = PrintJournal::lessons_for(json::array({record("1", then, {defect("warping")})}), "P", {"PLA"}, now, {"layer_height", "brim_width"});
    REQUIRE(lessons.size() == 1);
    CHECK(lessons[0]["settings_that_differed"].size() == 1);
    CHECK(lessons[0]["settings_that_differed"]["layer_height"]["then"] == "0.3");
    CHECK(PrintJournal::lessons_for(json::array({record("1", then, {})}), "Q", {"PLA"}, now, {"layer_height"}).empty());
}

TEST_CASE("A paused or failed print is an alert, not an ending", "[PrintJournal]")
{
    const auto word = GENERATE("pause", "paused", "pausing");
    CHECK(PrintJournal::still_going(word));
    CHECK(PrintJournal::alert_kind(word, "") == "paused");
    CHECK(PrintJournal::alert_kind(word, "E0100") == "error");

    CHECK_FALSE(PrintJournal::still_going("error"));
    CHECK(PrintJournal::alert_kind("error", "") == "error");
    CHECK(PrintJournal::alert_kind("printing", "E0100") == "error");

    CHECK(PrintJournal::still_going("printing"));
    CHECK(PrintJournal::alert_kind("printing", "").empty());
    CHECK_FALSE(PrintJournal::still_going("completed"));
    CHECK(PrintJournal::alert_kind("completed", "").empty());
    CHECK_FALSE(PrintJournal::still_going("cancel"));
}

TEST_CASE("Print journal files", "[PrintJournal]")
{
    const std::string folder = (boost::filesystem::temp_directory_path() / boost::filesystem::unique_path()).string();
    PrintJournal::save(folder, record("20261104-1", {}, {}));
    PrintJournal::save(folder, record("20261105-1", {}, {}));
    const json all = PrintJournal::load_all(folder);
    REQUIRE(all.size() == 2);
    CHECK(all[0].value("id", "") == "20261105-1");
    PrintJournal::remove(folder, all[0]);
    CHECK(PrintJournal::load_all(folder).size() == 1);
    CHECK(PrintJournal::load_all(folder + "-missing").empty());
    boost::filesystem::remove_all(folder);
}
