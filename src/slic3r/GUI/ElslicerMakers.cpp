#include "ElslicerMakers.hpp"

#include "GUI_App.hpp"
#include "libslic3r/Utils.hpp"
#include "libslic3r/miniz_extension.hpp"
#include "slic3r/Utils/Http.hpp"

#include <algorithm>
#include <cstdio>
#include <regex>
#include <sstream>

#include <boost/filesystem.hpp>
#include <boost/log/trivial.hpp>
#include <boost/nowide/fstream.hpp>
#include <openssl/evp.h>

namespace Slic3r { namespace GUI { namespace Makers {

namespace fs = boost::filesystem;
using json   = nlohmann::json;

const char *CATALOG_URL = "https://ai.itzkin.com/makers/catalog.json";
static const char *CATALOG_BASE = "https://ai.itzkin.com/makers/";
// Limits on what a package may hold.
static const size_t MOST_BYTES = 20u << 20, MOST_FILES = 400, MOST_STORE = 1u << 20;

bool Maker::may(const std::string &permission) const { return std::find(permissions.begin(), permissions.end(), permission) != permissions.end(); }

fs::path folder() { return fs::path(data_dir()) / "makers"; }

static std::string read_file(const fs::path &path)
{
    boost::nowide::ifstream in(path.string(), std::ios::binary);
    std::ostringstream      out;
    out << in.rdbuf();
    return out.str();
}
static bool write_file(const fs::path &path, const std::string &text)
{
    boost::nowide::ofstream out(path.string(), std::ios::binary);
    out << text;
    return bool(out);
}
static json read_json(const fs::path &path, json fallback)
{
    boost::nowide::ifstream in(path.string());
    if (!in)
        return fallback;
    json j = json::parse(in, nullptr, false);
    return j.is_discarded() || j.type() != fallback.type() ? fallback : j;
}

static std::string sha256_hex(const std::string &bytes)
{
    unsigned char digest[EVP_MAX_MD_SIZE];
    unsigned int  length = 0;
    EVP_Digest(bytes.data(), bytes.size(), digest, &length, EVP_sha256(), nullptr);
    std::string hex;
    char        two[3];
    for (unsigned int k = 0; k < length; ++k) {
        std::snprintf(two, sizeof two, "%02x", digest[k]);
        hex += two;
    }
    return hex;
}

int compare_versions(const std::string &a, const std::string &b)
{
    std::istringstream sa(a), sb(b);
    std::string        pa, pb;
    for (int k = 0; k < 4; ++k) {
        const bool ha = bool(std::getline(sa, pa, '.')), hb = bool(std::getline(sb, pb, '.'));
        if (!ha && !hb)
            return 0;
        const long va = ha ? std::atol(pa.c_str()) : 0, vb = hb ? std::atol(pb.c_str()) : 0;
        if (va != vb)
            return va < vb ? -1 : 1;
    }
    return 0;
}

// What a manifest must hold to be installed; the error, or empty.
static std::string check_manifest(const json &m)
{
    static const std::regex id_ok("^[a-z0-9][a-z0-9-]{1,47}$"), version_ok("^[0-9]+(\\.[0-9]+){0,3}$");
    if (!m.is_object())
        return "maker.json is not a JSON object";
    const std::string id = m.value("id", ""), name = m.value("name", ""), version = m.value("version", "");
    if (!std::regex_match(id, id_ok))
        return "maker.json: the id must be 2 to 48 lowercase letters, digits or dashes";
    if (name.empty() || name.size() > 60)
        return "maker.json: the name must be 1 to 60 characters";
    if (!std::regex_match(version, version_ok))
        return "maker.json: the version must look like 1.0.0";
    if (m.value("api", 0) < 1 || m.value("api", 0) > API)
        return "This maker needs a newer Elslicer";
    const std::string entry = m.value("entry", "index.html");
    if (entry.empty() || entry.find("..") != std::string::npos || entry.front() == '/')
        return "maker.json: the entry page must be a file inside the package";
    return {};
}

// The installed list keeps makers the user removed out of the bundled seeding.
static fs::path removed_path() { return folder() / "removed.json"; }
static json     removed() { return read_json(removed_path(), json::array()); }
static void     set_removed(const std::string &id, bool on)
{
    json list = json::array();
    for (const json &r : removed())
        if (r.is_string() && r.get<std::string>() != id)
            list.push_back(r);
    if (on)
        list.push_back(id);
    write_file(removed_path(), list.dump());
}

// Moves a finished folder into place as the maker's, so a failed install never leaves a broken one behind.
static std::string swap_in(const fs::path &fresh, const std::string &id)
{
    boost::system::error_code ec;
    const fs::path            target = folder() / id, old = folder() / ("." + id + ".old");
    fs::remove_all(old, ec);
    if (fs::exists(target))
        fs::rename(target, old, ec);
    if (ec)
        return "Couldn't replace the installed copy: " + ec.message();
    fs::rename(fresh, target, ec);
    if (ec) {
        fs::rename(old, target);
        return "Couldn't install: " + ec.message();
    }
    fs::remove_all(old, ec);
    set_removed(id, false);
    return {};
}

static std::string zip_manifest(const std::string &path, json &manifest)
{
    mz_zip_archive zip;
    mz_zip_zero_struct(&zip);
    if (!open_zip_reader(&zip, path))
        return "That isn't a maker package (not a zip file)";
    std::string error;
    const mz_uint count = mz_zip_reader_get_num_files(&zip);
    size_t        total = 0;
    int           at    = -1;
    for (mz_uint k = 0; k < count; ++k) {
        mz_zip_archive_file_stat stat;
        if (!mz_zip_reader_file_stat(&zip, k, &stat))
            continue;
        total += size_t(stat.m_uncomp_size);
        if (std::string(stat.m_filename) == "maker.json")
            at = int(k);
    }
    if (count > MOST_FILES || total > MOST_BYTES)
        error = "The package is too big";
    else if (at < 0)
        error = "The package has no maker.json";
    else {
        size_t size = 0;
        void  *data = mz_zip_reader_extract_to_heap(&zip, mz_uint(at), &size, 0);
        manifest    = data ? json::parse(std::string(static_cast<char *>(data), size), nullptr, false) : json();
        mz_free(data);
        error = check_manifest(manifest);
        if (error.empty() && mz_zip_reader_locate_file(&zip, manifest.value("entry", "index.html").c_str(), nullptr, 0) < 0)
            error = "The package has no " + manifest.value("entry", std::string("index.html"));
    }
    close_zip_reader(&zip);
    return error;
}

std::string install_file(const std::string &path, const std::string &source, const std::string &sha256)
{
    if (!sha256.empty() && sha256_hex(read_file(path)) != sha256)
        return "The download is damaged (its checksum doesn't match); try again";
    json              manifest;
    const std::string error = zip_manifest(path, manifest);
    if (!error.empty())
        return error;
    const std::string         id    = manifest.value("id", "");
    const fs::path            fresh = folder() / ("." + id + ".new");
    boost::system::error_code ec;
    fs::create_directories(folder(), ec);
    fs::remove_all(fresh, ec);
    fs::create_directories(fresh, ec);
    // Nothing is written if any file would land outside the maker's folder.
    if (!extract_archive_confined(path, fresh.string())) {
        fs::remove_all(fresh, ec);
        return "The package couldn't be unpacked";
    }
    write_file(fresh / ".source", source);
    return swap_in(fresh, id);
}

std::string install_bytes(const std::string &bytes, const std::string &source, const std::string &sha256)
{
    boost::system::error_code ec;
    fs::create_directories(folder(), ec);
    const fs::path temp = folder() / (".download-" + fs::unique_path().string() + ".elmaker");
    if (!write_file(temp, bytes))
        return "Couldn't save the download";
    const std::string error = install_file(temp.string(), source, sha256);
    fs::remove(temp, ec);
    return error;
}

std::string install_page(const std::string &path)
{
    const std::string page = read_file(path);
    if (page.empty())
        return "That page is empty or couldn't be read";
    std::smatch       title;
    const std::string stem = fs::path(path).stem().string();
    std::string name = std::regex_search(page, title, std::regex("<title>\\s*([^<]{1,60}?)\\s*</title>", std::regex::icase)) ? title[1].str() : stem;
    std::string id;
    for (char c : stem) {
        c = char(std::tolower(static_cast<unsigned char>(c)));
        id += std::isalnum(static_cast<unsigned char>(c)) ? c : '-';
    }
    id = "local-" + id.substr(0, 40);
    const json manifest = {{"id", id}, {"name", name}, {"description", "Installed from " + fs::path(path).filename().string()},
                           {"version", "0.0.0"}, {"author", ""}, {"api", API}, {"entry", "index.html"}, {"permissions", json::array({"ai"})}};
    const std::string         error = check_manifest(manifest);
    if (!error.empty())
        return error;
    const fs::path            fresh = folder() / ("." + id + ".new");
    boost::system::error_code ec;
    fs::remove_all(fresh, ec);
    fs::create_directories(fresh, ec);
    write_file(fresh / "index.html", page);
    write_file(fresh / "maker.json", manifest.dump(1));
    write_file(fresh / ".source", "local");
    return swap_in(fresh, id);
}

void remove(const std::string &id)
{
    boost::system::error_code ec;
    if (id.empty() || id.find_first_of("./\\") != std::string::npos)
        return;
    fs::remove_all(folder() / id, ec);
    set_removed(id, true);
}

// The makers shipped with the app: installed the first time, and again whenever the app brings a newer one, unless
// the user removed it or installed their own copy from a file.
static void seed()
{
    const fs::path bundled = fs::path(resources_dir()) / "makers";
    if (!fs::is_directory(bundled))
        return;
    const json gone = removed();
    for (const auto &entry : fs::directory_iterator(bundled)) {
        if (entry.path().extension() != ".elmaker")
            continue;
        json manifest;
        if (!zip_manifest(entry.path().string(), manifest).empty())
            continue;
        const std::string id = manifest.value("id", "");
        if (std::find(gone.begin(), gone.end(), json(id)) != gone.end())
            continue;
        const fs::path dir  = folder() / id;
        const json     have = read_json(dir / "maker.json", json::object());
        const std::string from = read_file(dir / ".source");
        if (have.empty() || (from != "local" && compare_versions(manifest.value("version", ""), have.value("version", "")) > 0)) {
            const std::string error = install_file(entry.path().string(), "bundled");
            if (!error.empty())
                BOOST_LOG_TRIVIAL(error) << "Maker " << id << ": " << error;
        }
    }
}

std::vector<Maker> installed()
{
    static bool seeded = false;
    if (!seeded) {
        seeded = true;
        seed();
    }
    std::vector<Maker> out;
    if (!fs::is_directory(folder()))
        return out;
    for (const auto &entry : fs::directory_iterator(folder())) {
        const std::string name = entry.path().filename().string();
        if (!fs::is_directory(entry.path()) || name.empty() || name.front() == '.')
            continue;
        const json m = read_json(entry.path() / "maker.json", json::object());
        if (!check_manifest(m).empty() || m.value("id", "") != name)
            continue;
        Maker maker;
        maker.id          = name;
        maker.name        = m.value("name", name);
        maker.description = m.value("description", "");
        maker.version     = m.value("version", "");
        maker.author      = m.value("author", "");
        maker.entry       = m.value("entry", "index.html");
        for (const json &p : m.value("permissions", json::array()))
            if (p.is_string())
                maker.permissions.push_back(p.get<std::string>());
        maker.dir    = entry.path();
        maker.source = read_file(entry.path() / ".source");
        if (fs::exists(maker.page()))
            out.push_back(std::move(maker));
    }
    std::sort(out.begin(), out.end(), [](const Maker &a, const Maker &b) { return a.name < b.name; });
    return out;
}

const Maker *find(const std::vector<Maker> &makers, const std::string &id)
{
    for (const Maker &m : makers)
        if (m.id == id)
            return &m;
    return nullptr;
}

// ---------------------------------------------------------------------------------------------------------------
static fs::path catalog_path() { return folder() / "catalog.json"; }
json            cached_catalog() { return read_json(catalog_path(), json::object()); }

void fetch_catalog(std::function<void(const json &, const std::string &)> done)
{
    Http::get(CATALOG_URL)
        .size_limit(2u << 20)
        .timeout_max(30)
        .on_complete([done](std::string body, unsigned) {
            wxGetApp().CallAfter([done, body] {
                const json catalog = json::parse(body, nullptr, false);
                if (!catalog.is_object() || !catalog.contains("makers")) {
                    done(json(), "The catalogue couldn't be read");
                    return;
                }
                boost::system::error_code ec;
                fs::create_directories(folder(), ec);
                write_file(catalog_path(), catalog.dump());
                done(catalog, {});
            });
        })
        .on_error([done](std::string, std::string error, unsigned status) {
            wxGetApp().CallAfter([done, error, status] { done(json(), status ? "The catalogue answered " + std::to_string(status) : error); });
        })
        .perform();
}

void download(const json &entry, std::function<void(const std::string &)> done)
{
    std::string url = entry.value("url", "");
    if (url.rfind("https://", 0) != 0)
        url = CATALOG_BASE + url;
    const std::string sha = entry.value("sha256", "");
    if (sha.size() != 64) {
        done("The catalogue gives no checksum for this maker");
        return;
    }
    Http::get(url)
        .size_limit(MOST_BYTES)
        .timeout_max(120)
        .on_complete([done, sha](std::string body, unsigned) {
            wxGetApp().CallAfter([done, sha, body] { done(install_bytes(body, "catalog", sha)); });
        })
        .on_error([done](std::string, std::string error, unsigned status) {
            wxGetApp().CallAfter([done, error, status] { done(status ? "The download answered " + std::to_string(status) : error); });
        })
        .perform();
}

int updates_available()
{
    const json catalog = cached_catalog();
    if (!catalog.is_object())
        return 0;
    const std::vector<Maker> have = installed();
    int                      n    = 0;
    for (const json &e : catalog.value("makers", json::array()))
        if (const Maker *m = find(have, e.value("id", "")); m && e.value("min_api", 1) <= API &&
                                                             compare_versions(e.value("version", ""), m->version) > 0)
            ++n;
    return n;
}

// ---------------------------------------------------------------------------------------------------------------
static fs::path store_path(const std::string &id) { return folder() / (id + ".data.json"); }

json store(const std::string &id)
{
    json data = read_json(store_path(id), json::object());
    // The phone case kept its looked-up phones on their own before makers had saved values.
    if (id == "phone-case" && !data.contains("phones")) {
        const json phones = read_json(fs::path(data_dir()) / "phone_case_phones.json", json::array());
        if (!phones.empty())
            data["phones"] = phones;
    }
    return data;
}

bool store_set(const std::string &id, const std::string &key, const json &value)
{
    if (key.empty() || id.empty())
        return false;
    json data = store(id);
    if (value.is_null())
        data.erase(key);
    else
        data[key] = value;
    const std::string text = data.dump();
    if (text.size() > MOST_STORE)
        return false;
    boost::system::error_code ec;
    fs::create_directories(folder(), ec);
    return write_file(store_path(id), text);
}

}}} // namespace Slic3r::GUI::Makers
