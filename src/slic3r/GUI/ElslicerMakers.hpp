#pragma once

// Maker plugins: pages that design a model from a few choices and add it to the plate, installed as .elmaker
// packages (a zip holding maker.json and the page) into data_dir()/makers/<id>/, so they install and update without
// a new Elslicer. The ones shipped with the app are seeded from resources/makers on start; more come from the
// catalogue on ai.itzkin.com. See docs/HLSD/maker-plugins.md.

#include <functional>
#include <string>
#include <vector>

#include <boost/filesystem/path.hpp>
#include <nlohmann/json.hpp>

namespace Slic3r { namespace GUI { namespace Makers {

// The plugin API this Elslicer speaks; a maker asking for more is refused.
constexpr int API = 1;
extern const char *CATALOG_URL;

struct Maker
{
    std::string              id, name, description, version, author, entry;
    std::vector<std::string> permissions;
    boost::filesystem::path  dir;    // where it is installed
    std::string              source; // "bundled", "catalog" or "local" (installed from a file)
    bool                     may(const std::string &permission) const;
    boost::filesystem::path  page() const { return dir / entry; }
};

boost::filesystem::path folder();
// The installed makers, by name. The first call in a run installs or updates the bundled ones.
std::vector<Maker> installed();
const Maker       *find(const std::vector<Maker> &makers, const std::string &id);

// Installs a package, replacing any older copy; the error, or empty when it worked. sha256 (hex) is checked when given.
std::string install_file(const std::string &path, const std::string &source, const std::string &sha256 = {});
std::string install_bytes(const std::string &bytes, const std::string &source, const std::string &sha256 = {});
// A page on its own becomes a maker of that one file, named after it.
std::string install_page(const std::string &path);
void        remove(const std::string &id);

// -1, 0 or 1 as a is older than, the same as or newer than b ("1.2.10" is newer than "1.2.9").
int compare_versions(const std::string &a, const std::string &b);

// The catalogue, as last fetched (null if never).
nlohmann::json cached_catalog();
// Fetches the catalogue; done(catalog or null, error) runs on the main thread.
void fetch_catalog(std::function<void(const nlohmann::json &, const std::string &)> done);
// Downloads a maker from the catalogue entry and installs it; done(error) on the main thread.
void download(const nlohmann::json &entry, std::function<void(const std::string &)> done);
// How many installed makers the cached catalogue has newer versions of.
int updates_available();

// A maker's own saved values (data_dir()/makers/<id>.data.json).
nlohmann::json store(const std::string &id);
bool           store_set(const std::string &id, const std::string &key, const nlohmann::json &value);

}}} // namespace Slic3r::GUI::Makers
