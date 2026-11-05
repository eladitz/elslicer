#include "ElslicerDialogs.hpp"

#include "GUI.hpp"
#include "GUI_App.hpp"
#include "GUI_ObjectList.hpp"
#include "GUI_Utils.hpp"
#include "I18N.hpp"
#include "MainFrame.hpp"
#include "PartPlate.hpp"
#include "Plater.hpp"
#include "PrinterWebViewHandler.hpp"
#include "Tab.hpp"
#include "Widgets/WebView.hpp"

#include "libslic3r/AISetup.hpp"
#include "libslic3r/GCode/ResumeFromLayer.hpp"
#include "libslic3r/Model.hpp"
#include "libslic3r/PresetBundle.hpp"
#include "libslic3r/PrintJournal.hpp"
#include "libslic3r/PrintConfig.hpp"
#include "slic3r/Utils/Http.hpp"

#include <boost/filesystem.hpp>
#include <boost/nowide/fstream.hpp>
#include <boost/log/trivial.hpp>
#include <nlohmann/json.hpp>

#include <wx/base64.h>
#include <wx/filedlg.h>
#include <wx/filename.h>
#include <wx/image.h>
#include <wx/utils.h>
#include <wx/secretstore.h>
#include <wx/sizer.h>
#include <wx/timer.h>
#include <wx/webview.h>

#include <algorithm>
#include <cstdint>
#include <ctime>
#include <map>
#include <memory>

using json = nlohmann::json;

namespace Slic3r { namespace GUI {

namespace {

// A dark window holding one page from resources/web/elslicer.
class WebPageDialog : public DPIDialog
{
public:
    WebPageDialog(const wxString &title, const std::string &page, const wxSize &size)
        : DPIDialog(wxGetApp().mainframe, wxID_ANY, title, wxDefaultPosition, wxDefaultSize, wxCAPTION | wxCLOSE_BOX | wxRESIZE_BORDER)
    {
        SetBackgroundColour(wxColour(24, 25, 28));
        const std::string path = (boost::filesystem::path(resources_dir()) / "web/elslicer" / page).make_preferred().string();
        m_browser = WebView::CreateWebView(this, "file://" + from_u8(path));
        auto *sizer = new wxBoxSizer(wxVERTICAL);
        if (m_browser != nullptr) {
            sizer->Add(m_browser, 1, wxEXPAND);
            Bind(wxEVT_WEBVIEW_SCRIPT_MESSAGE_RECEIVED, &WebPageDialog::on_script, this, m_browser->GetId());
        }
        SetSizer(sizer);
        SetSize(FromDIP(size));
        CenterOnParent();
    }

    void on_dpi_changed(const wxRect &) override {}

protected:
    virtual void on_message(const std::string &cmd, const json &data) = 0;

    void send(const json &message)
    {
        const std::string text = message.dump(-1, ' ', false, json::error_handler_t::replace);
        WebView::RunScript(m_browser, wxString::FromUTF8("window.fromApp(" + text + ")"));
    }

private:
    void on_script(wxWebViewEvent &evt)
    {
        try {
            const json message = json::parse(evt.GetString().utf8_string());
            const std::string cmd = message.at("cmd").get<std::string>();
            if (cmd == "close") {
                if (IsModal())
                    EndModal(wxID_OK);
                else
                    Close();
            }
            else
                on_message(cmd, message);
        } catch (const std::exception &e) {
            BOOST_LOG_TRIVIAL(error) << "Elslicer dialog: " << e.what();
        }
    }

    wxWebView *m_browser{nullptr};
};

// ---------------------------------------------------------------------------
// Continue from layer
// ---------------------------------------------------------------------------

class ResumeDialog : public WebPageDialog
{
public:
    explicit ResumeDialog(int layer) : WebPageDialog(_L("Continue Print From Layer"), "resume.html", wxSize(640, 720)), m_preselect(layer) {}

protected:
    void on_message(const std::string &cmd, const json &data) override
    {
        if (cmd == "ready") {
            PartPlate *plate = wxGetApp().plater()->get_partplate_list().get_curr_plate();
            if (plate != nullptr && plate->is_slice_result_valid() && boost::filesystem::exists(plate->get_tmp_gcode_path()))
                load(plate->get_tmp_gcode_path(), "Sliced plate", plate_output_name());
            else
                send_state();
        } else if (cmd == "choose_file") {
            wxFileDialog dialog(this, _L("Choose the G-code file of the failed print"), wxEmptyString, wxEmptyString,
                                "G-code (*.gcode)|*.gcode|All files (*.*)|*.*", wxFD_OPEN | wxFD_FILE_MUST_EXIST);
            if (dialog.ShowModal() == wxID_OK) {
                const std::string path = into_u8(dialog.GetPath());
                load(path, boost::filesystem::path(path).filename().string(), path);
            }
        } else if (cmd == "measured") {
            const int layer = ResumeFromLayer::layer_after_measured_height(m_layers, data.at("mm").get<double>());
            send({{"type", "measured"}, {"layer", layer}});
        } else if (cmd == "create") {
            create(data.at("layer").get<int>());
        } else if (cmd == "reveal") {
            desktop_open_any_folder(boost::filesystem::path(m_target).parent_path().string());
        }
    }

private:
    static std::string plate_output_name()
    {
        const std::string name = into_u8(wxGetApp().plater()->get_export_gcode_filename(".gcode", true));
        return name.empty() ? "print.gcode" : name;
    }

    void load(const std::string &path, const std::string &label, const std::string &name_source)
    {
        m_source      = path;
        m_label       = label;
        m_name_source = name_source;
        m_layers      = ResumeFromLayer::scan_layers(path);
        send_state();
    }

    void send_state()
    {
        const DynamicPrintConfig &printer = wxGetApp().preset_bundle->printers.get_edited_preset().config;
        const std::string flavor = printer.opt_serialize("gcode_flavor");
        const std::string model  = printer.opt_string("printer_model");
        m_method = ResumeFromLayer::method_for_printer(flavor, model, m_verified);

        json layers = json::array();
        for (const auto &layer : m_layers)
            layers.push_back(layer.z);

        send({{"type", "state"},
              {"source", m_label},
              {"layers", layers},
              {"preselect", m_preselect},
              {"printer", wxGetApp().preset_bundle->printers.get_edited_preset().name},
              {"method", m_method == ResumeFromLayer::ZMethod::None ? "none" : "ok"},
              {"verified", m_verified}});
    }

    void create(int layer)
    {
        const std::string suggested = ResumeFromLayer::default_target_name(m_name_source, layer);
        wxFileDialog dialog(this, _L("Save the continuation file"), wxEmptyString, from_u8(suggested), "G-code (*.gcode)|*.gcode",
                            wxFD_SAVE | wxFD_OVERWRITE_PROMPT);
        if (dialog.ShowModal() != wxID_OK)
            return;

        ResumeFromLayer::Options options;
        options.source = m_source;
        options.target = into_u8(dialog.GetPath());
        options.layer  = layer;
        options.method = m_method;
        const DynamicPrintConfig &printer = wxGetApp().preset_bundle->printers.get_edited_preset().config;
        if (const auto *area = printer.option<ConfigOptionPoints>("printable_area")) {
            for (const Vec2d &point : area->values) {
                options.bed_x = std::max(options.bed_x, point.x());
                options.bed_y = std::max(options.bed_y, point.y());
            }
        }

        const ResumeFromLayer::Result result = ResumeFromLayer::write_resume_file(options);
        m_target = options.target;
        send({{"type", "result"},
              {"ok", result.ok},
              {"error", result.error},
              {"warnings", result.warnings},
              {"declared_z", result.declared_z},
              {"layers_left", result.layers_left},
              {"file", boost::filesystem::path(m_target).filename().string()}});
    }

    int                                 m_preselect{0};
    std::string                         m_source, m_label, m_name_source, m_target;
    std::vector<ResumeFromLayer::Layer> m_layers;
    ResumeFromLayer::ZMethod            m_method{ResumeFromLayer::ZMethod::None};
    bool                                m_verified{true};
};

// ---------------------------------------------------------------------------
// AI setup
// ---------------------------------------------------------------------------

const char *const SECRET_SERVICE = "Elslicer/AnthropicApiKey";

struct ModelChoice
{
    const char *id;
    const char *label;
    double      input_per_million;
    double      output_per_million;
    bool        server_fallback;
};

const ModelChoice MODELS[] = {
    {"claude-opus-5-5", "Opus 5.5 (best)", 4., 20., true},
    {"claude-sonnet-5-5", "Sonnet 5.5 (cheaper)", 2., 10., true},
    {"claude-haiku-5-5", "Haiku 5.5 (cheapest)", 0.1, 0.5, false},
};

std::string load_api_key()
{
    wxSecretStore store = wxSecretStore::GetDefault();
    wxString      user;
    wxSecretValue secret;
    if (store.IsOk() && store.Load(SECRET_SERVICE, user, secret) && secret.IsOk())
        return std::string(static_cast<const char *>(secret.GetData()), secret.GetSize());
    return {};
}

// Puts a filament on a head, adding heads to the app if it doesn't have that many yet.
void set_head_filament(size_t head, const std::string &preset, const std::string &colour)
{
    PresetBundle &bundle = *wxGetApp().preset_bundle;
    Plater       *plater = wxGetApp().plater();
    if (bundle.filament_presets.size() <= head) {
        for (size_t count = bundle.filament_presets.size() + 1; count <= head + 1; ++count)
            bundle.set_num_filaments(unsigned(count), Plater::get_next_color_for_filament().GetAsString(wxC2S_HTML_SYNTAX).ToStdString());
        plater->on_filament_count_change(head + 1);
    }
    bundle.set_filament_preset(head, preset);
    plater->on_filament_change(head);
    if (wxColour(colour).IsOk())
        for (const char *key : {"filament_colour", "filament_multi_colour"})
            if (auto *list = bundle.project_config.option<ConfigOptionStrings>(key); list != nullptr && head < list->values.size())
                list->values[head] = colour;
}

void refresh_filaments()
{
    Plater *plater = wxGetApp().plater();
    plater->update_filament_colors_in_full_config();
    plater->sidebar().obj_list()->update_filament_colors();
    plater->sidebar().update_all_preset_comboboxes();
    plater->sidebar().update_dynamic_filament_list();
    plater->update_project_dirty_from_presets();
    wxGetApp().preset_bundle->export_selections(*wxGetApp().app_config);
    plater->update();
}

// What the local mesh says about the job. The mesh itself never leaves the Mac.
json model_facts()
{
    json   objects = json::array();
    const Model &model = wxGetApp().plater()->model();
    for (const ModelObject *object : model.objects) {
        if (object->instances.empty())
            continue;
        TriangleMesh mesh = object->raw_mesh();
        object->instances.front()->transform_mesh(&mesh);
        const indexed_triangle_set &its = mesh.its;
        if (its.indices.empty())
            continue;

        const BoundingBoxf3 box = mesh.bounding_box();
        const double        bed_level = box.min.z() + 0.1;
        double total = 0., overhang = 0., on_bed = 0.;
        for (const stl_triangle_vertex_indices &face : its.indices) {
            const Vec3d a = its.vertices[face[0]].cast<double>(), b = its.vertices[face[1]].cast<double>(), c = its.vertices[face[2]].cast<double>();
            const Vec3d cross = (b - a).cross(c - a);
            const double area = cross.norm() / 2.;
            if (area <= 0.)
                continue;
            total += area;
            const double down = -cross.z() / cross.norm();
            if (down > 0.7) { // facing down by more than 45 degrees
                if (a.z() < bed_level && b.z() < bed_level && c.z() < bed_level)
                    on_bed += area * down;
                else
                    overhang += area;
            }
        }
        const Vec3d size = box.size();
        objects.push_back({{"name", object->name},
                           {"size_mm", {size.x(), size.y(), size.z()}},
                           {"volume_cm3", its_volume(its) / 1000.},
                           {"triangles", its.indices.size()},
                           {"overhang_percent_of_surface", total > 0. ? 100. * overhang / total : 0.},
                           {"bed_contact_mm2", on_bed},
                           {"parts_starting_in_mid_air", AISetup::mid_air_starts(its)},
                           {"on_head", object->config.has("extruder") ? object->config.extruder() : 1}});
    }
    return objects;
}

std::string time_stamp(const char *format)
{
    char stamp[32];
    const std::time_t now = std::time(nullptr);
    std::strftime(stamp, sizeof(stamp), format, std::localtime(&now));
    return stamp;
}

// Puts settings into a new print preset named prefix + the time. Returns those the app overruled.
json load_print_changes(const std::vector<std::pair<std::string, std::string>> &changes, const std::string &prefix)
{
    Tab *tab = wxGetApp().get_tab(Preset::TYPE_PRINT);
    if (tab == nullptr)
        return json::array();
    const DynamicPrintConfig &current = wxGetApp().preset_bundle->prints.get_edited_preset().config;
    DynamicPrintConfig config;
    for (const auto &[key, value] : changes) {
        // List settings keep one value per nozzle, so every nozzle gets the new value.
        std::string text = value;
        if (const auto *list = dynamic_cast<const ConfigOptionVectorBase *>(current.option(key)))
            for (size_t i = 1; i < list->size(); ++i)
                text += "," + value;
        config.set_deserialize_strict(key, text);
    }
    tab->load_config(config);

    // The app can overrule a value while applying it, so say so if one didn't stay.
    json dropped = json::array();
    const DynamicPrintConfig &applied = wxGetApp().preset_bundle->prints.get_edited_preset().config;
    for (const std::string &key : config.keys())
        if (const ConfigOption *option = applied.option(key); option == nullptr || !(*option == *config.option(key))) {
            const ConfigOptionDef *def = print_config_def.get(key);
            dropped.push_back(def != nullptr ? def->label : key);
        }
    tab->save_preset(prefix + time_stamp("%Y-%m-%d %H.%M.%S"));
    return dropped;
}

std::string journal_folder()
{
    return (boost::filesystem::path(data_dir()) / "print_journal").string();
}

std::string current_printer()
{
    return wxGetApp().preset_bundle->printers.get_edited_preset().name;
}

std::vector<std::string> current_materials(const DynamicPrintConfig &full)
{
    const auto *types = full.option<ConfigOptionStrings>("filament_type");
    return types != nullptr ? types->values : std::vector<std::string>{};
}

// A new journal entry describing what the app is set to right now.
json new_journal_record(const std::string &file, const std::string &model_name)
{
    const DynamicPrintConfig full = wxGetApp().preset_bundle->full_config();
    return {{"id", time_stamp("%Y%m%d-%H%M%S")},
            {"when", time_stamp("%Y-%m-%d %H:%M")},
            {"created", std::int64_t(std::time(nullptr))},
            {"file", file},
            {"model", model_name},
            {"printer", current_printer()},
            {"materials", current_materials(full)},
            {"settings", PrintJournal::settings_from(full)},
            {"photos", json::array()}};
}

// Checks a suggested change against this printer and describes it for a page.
json describe_change(const std::string &key, const std::string &value, const PrintJournal::Settings &current, std::vector<std::pair<std::string, std::string>> *accepted)
{
    const DynamicPrintConfig &printer = wxGetApp().preset_bundle->printers.get_edited_preset().config;
    const auto *nozzle    = printer.option<ConfigOptionFloats>("nozzle_diameter");
    const auto *max_speed = printer.option<ConfigOptionFloats>("machine_max_speed_x");
    const AISetup::CheckedChange checked = AISetup::check_change(key, value, nozzle != nullptr ? nozzle->get_at(0) : 0.,
                                                                 max_speed != nullptr ? max_speed->get_at(0) : 0., nozzle != nullptr ? int(nozzle->size()) : 0);
    if (checked.accepted && accepted != nullptr)
        accepted->emplace_back(key, checked.value);
    const ConfigOptionDef *def  = print_config_def.get(key);
    const auto             now  = current.find(key);
    return {{"label", def != nullptr ? def->label : key},
            {"before", now != current.end() ? now->second : ""},
            {"after", checked.value},
            {"accepted", checked.accepted},
            {"note", checked.note}};
}

const char *const REVIEW_PROMPT =
    "You look at photos of a finished or stopped 3D print and say what went wrong and how to prevent it next time. Call report_print right away.\n\n"
    "photo_sources says where each photo came from, in order. The printer camera sees one side from a fixed spot at 640x480, with a strong blue tint and overexposed areas, so don't judge colour from it, and the print is usually still on the bed with its supports. "
    "Photos from the user are close-ups or other angles, and may show the print off the bed with supports removed. Judge each side from the best photo of it. So:\n"
    "- Report only what you can see, and say what you couldn't judge in not_visible. Don't guess about the far side, fine surface finish or strength.\n"
    "- Supports and purge towers are meant to be there. Rough support is not a defect.\n"
    "- If the print isn't visible in any photo, set overall to unknown and report no defects.\n"
    "- A printer status other than completed means it stopped early. Say what the photo suggests about why, if anything.\n"
    "- What the user wrote in user_note is first-hand and outranks what the photo seems to show.\n"
    "- past_prints lists earlier results on this printer. If a change was already tried and the same problem came back, say so and suggest something else. "
    "A defect marked wrong was a mistake in an earlier reading, so don't repeat it without clear evidence.\n\n"
    "For each defect, evidence says where in the photo you see it, cause is the most likely reason given the settings, and prevention says what to do next time in plain words a beginner understands. "
    "changes lists only settings from the allowed list that would help, in the slicer's own format such as \"0.2\", \"15%\", \"1\" for on. "
    "Leave changes empty when the fix isn't a setting, such as cleaning the bed or drying filament.";

json review_tool()
{
    const json text = {{"type", "string"}};
    const auto object_of = [](const json &properties) {
        json required = json::array();
        for (const auto &property : properties.items())
            required.push_back(property.key());
        return json{{"type", "object"}, {"additionalProperties", false}, {"required", required}, {"properties", properties}};
    };
    const json change = object_of({{"key", {{"type", "string"}, {"enum", AISetup::allowed_keys()}}}, {"value", text}});
    const json defect = object_of({{"name", {{"type", "string"},
                                             {"enum", {"detached from bed", "spaghetti", "layer shift", "warping", "stringing", "blobs", "under-extrusion", "over-extrusion",
                                                       "layer lines", "seam", "first layer", "overhang droop", "support failed", "support stuck to part", "colour mixing", "other"}}}},
                                   {"severity", {{"type", "string"}, {"enum", {"minor", "visible", "bad"}}}},
                                   {"evidence", text},
                                   {"cause", text},
                                   {"prevention", text},
                                   {"changes", {{"type", "array"}, {"items", change}}}});
    return {{"name", "report_print"},
            {"description", "Report what the photos show about this print."},
            {"strict", true},
            {"input_schema", object_of({{"overall", {{"type", "string"}, {"enum", {"good", "minor problems", "bad", "failed", "unknown"}}}},
                                        {"summary", text},
                                        {"not_visible", text},
                                        {"defects", {{"type", "array"}, {"items", defect}}}})}};
}

json find_record(const std::string &id)
{
    for (json &record : PrintJournal::load_all(journal_folder()))
        if (record.value("id", "") == id)
            return std::move(record);
    return nullptr;
}

const size_t MAX_OWN_PHOTOS = 3;

bool is_camera_photo(const std::string &name)
{
    return name.find("-camera") != std::string::npos;
}

// A file name not used by this record yet.
std::string new_photo_name(const json &record, const std::string &kind)
{
    const std::vector<std::string> photos = record.value("photos", std::vector<std::string>{});
    for (int number = 1;; ++number) {
        const std::string name = record.value("id", "") + "-" + kind + "-" + std::to_string(number) + ".jpg";
        if (std::find(photos.begin(), photos.end(), name) == photos.end())
            return name;
    }
}

// Copies a photo as a JPEG small enough to send. Phones often save HEIC, which only macOS's own tool reads here.
bool import_photo(const wxString &from, const boost::filesystem::path &to)
{
    const int longest_side = 1568; // the API scales anything larger down anyway
#ifdef __APPLE__
    const std::string source = into_u8(from), target = to.string(), side = std::to_string(longest_side);
    const char *const command[] = {"/usr/bin/sips", "-s", "format", "jpeg", "-s", "formatOptions", "85", "-Z", side.c_str(), source.c_str(), "--out", target.c_str(), nullptr};
    return wxExecute(command, wxEXEC_SYNC | wxEXEC_NODISABLE) == 0 && boost::filesystem::exists(to);
#else
    wxImage image;
    if (!image.LoadFile(from) || !image.IsOk())
        return false;
    const double scale = double(longest_side) / std::max(image.GetWidth(), image.GetHeight());
    if (scale < 1.)
        image.Rescale(int(image.GetWidth() * scale), int(image.GetHeight() * scale), wxIMAGE_QUALITY_HIGH);
    return image.SaveFile(wxString::FromUTF8(to.string()), wxBITMAP_TYPE_JPEG);
#endif
}

// Reads the record's photos with Claude in one request. Calls done on the main thread with an empty string if it worked.
void analyse_record(const std::string &id, std::function<void(const std::string &)> done)
{
    const std::string key = load_api_key();
    json record = find_record(id);
    if (key.empty() || record.is_null()) {
        done(key.empty() ? "No API key saved, so the photo wasn't analysed. Add one in AI Setup." : "This print is no longer in the journal.");
        return;
    }
    const std::vector<std::string> photos = record.value("photos", std::vector<std::string>{});
    if (photos.empty()) {
        done("There's no photo to analyse yet.");
        return;
    }

    json content = json::array();
    json photo_sources = json::array();
    for (size_t i = 0; i < photos.size(); ++i) {
        photo_sources.push_back(is_camera_photo(photos[i]) ? "printer camera" : "user");
        boost::nowide::ifstream file((boost::filesystem::path(journal_folder()) / photos[i]).string(), std::ios::binary);
        const std::string bytes((std::istreambuf_iterator<char>(file)), std::istreambuf_iterator<char>());
        content.push_back({{"type", "image"},
                           {"source", {{"type", "base64"}, {"media_type", "image/jpeg"}, {"data", wxBase64Encode(bytes.data(), bytes.size()).ToStdString()}}}});
    }

    const PrintJournal::Settings settings = record.value("settings", PrintJournal::Settings{});
    json relevant = json::object();
    for (const std::string &name : AISetup::allowed_keys())
        if (const auto found = settings.find(name); found != settings.end())
            relevant[name] = found->second;
    json others = PrintJournal::load_all(journal_folder());
    others.erase(std::remove_if(others.begin(), others.end(), [&id](const json &other) { return other.value("id", "") == id; }), others.end());
    const std::vector<std::string> materials = record.value("materials", std::vector<std::string>{});
    const json facts = {{"file", record.value("file", "")},
                        {"model", record.value("model", "")},
                        {"printer", record.value("printer", "")},
                        {"materials", materials},
                        {"printer_status", record.value("status", "")},
                        {"layer_reached", record.value("layer", 0)},
                        {"layers_in_all", record.value("layers", 0)},
                        {"user_note", record.value("note", "")},
                        {"photo_sources", photo_sources},
                        {"settings", relevant},
                        {"past_prints", PrintJournal::lessons_for(others, record.value("printer", ""), materials, settings, AISetup::allowed_keys())}};
    content.push_back({{"type", "text"}, {"text", "Review this print.\n" + facts.dump(1, ' ', false, json::error_handler_t::replace)}});

    const ModelChoice *model = &MODELS[0];
    json body = {{"model", model->id},
                 {"max_tokens", 4000},
                 {"system", REVIEW_PROMPT},
                 {"tools", json::array({review_tool()})},
                 {"tool_choice", {{"type", "tool"}, {"name", "report_print"}}},
                 {"messages", json::array({{{"role", "user"}, {"content", content}}})}};
    auto http = Http::post("https://api.anthropic.com/v1/messages");
    http.header("x-api-key", key).header("anthropic-version", "2026-10-21").header("content-type", "application/json");
    if (model->server_fallback) {
        body["fallbacks"] = "default";
        http.header("anthropic-beta", "server-side-fallback-2026-07-01");
    }
    http.set_post_body(body.dump())
        .timeout_max(180)
        .on_complete([id, done, model](std::string response, unsigned) {
            wxGetApp().CallAfter([id, done, response, model] {
                const json reply = json::parse(response, nullptr, false);
                json updated = find_record(id);
                if (updated.is_null())
                    return done("This print is no longer in the journal.");
                if (reply.is_object() && reply.contains("content"))
                    for (const json &block : reply["content"])
                        if (block.value("type", "") == "tool_use") {
                            updated["report"] = block["input"];
                            if (reply.contains("usage"))
                                updated["cost"] = updated.value("cost", 0.) + reply["usage"].value("input_tokens", 0) * model->input_per_million / 1e6 +
                                                  reply["usage"].value("output_tokens", 0) * model->output_per_million / 1e6;
                            PrintJournal::save(journal_folder(), updated);
                            return done("");
                        }
                done("Claude sent a reply this version can't read.");
            });
        })
        .on_error([done](std::string response, std::string error, unsigned status) {
            wxGetApp().CallAfter([done, response, error, status] {
                std::string message = "Couldn't reach Claude: " + error;
                if (status == 401)
                    message = "The API key was refused. Check it in AI Setup.";
                else if (const json parsed = json::parse(response, nullptr, false); parsed.is_object() && parsed.contains("error"))
                    message = parsed["error"].value("message", message);
                done(message);
            });
        })
        .perform();
}

const DynamicPrintConfig *flashforge_printer()
{
    const DynamicPrintConfig &printer = wxGetApp().preset_bundle->printers.get_edited_preset().config;
    const auto *host = printer.option<ConfigOptionEnum<PrintHostType>>("host_type");
    return host != nullptr && host->value == PrintHostType::htFlashforge && !printer.opt_string("print_host").empty() ? &printer : nullptr;
}

// Takes a photo for a record. Calls done with an empty string if it worked.
void take_record_photo(const std::string &id, std::function<void(const std::string &)> done)
{
    const DynamicPrintConfig *printer = flashforge_printer();
    if (printer == nullptr) {
        done("Taking a photo only works with a Flashforge printer connected. You can add your own photo instead.");
        return;
    }
    capture_flashforge_photo(printer->opt_string("print_host"), [id, done](bool ok, const std::string &jpeg, const std::string &error) {
        json record = find_record(id);
        if (!ok || record.is_null()) {
            done(ok ? "This print is no longer in the journal." : "No photo: " + error + ".");
            return;
        }
        const wxMemoryBuffer bytes = wxBase64Decode(jpeg.data(), jpeg.size());
        const std::string name = new_photo_name(record, "camera");
        boost::nowide::ofstream((boost::filesystem::path(journal_folder()) / name).string(), std::ios::binary)
            .write(static_cast<const char *>(bytes.GetData()), bytes.GetDataLen());
        // A new camera shot replaces the last one, and stays first in line.
        json photos = json::array({name});
        for (const std::string &old : record["photos"].get<std::vector<std::string>>()) {
            if (is_camera_photo(old))
                boost::filesystem::remove(boost::filesystem::path(journal_folder()) / old);
            else
                photos.push_back(old);
        }
        record["photos"] = photos;
        PrintJournal::save(journal_folder(), record);
        done("");
    });
}

json tool_definitions()
{
    const auto string_type = json{{"type", "string"}};
    const auto list_of = [](const json &item) { return json{{"type", "array"}, {"items", item}}; };
    const auto object_of = [](const json &properties) {
        json required = json::array();
        for (const auto &property : properties.items())
            required.push_back(property.key());
        return json{{"type", "object"}, {"additionalProperties", false}, {"required", required}, {"properties", properties}};
    };

    json properties = {{"summary", string_type},
                       {"fixed", list_of(object_of({{"key", {{"type", "string"}, {"enum", AISetup::keys_outside_bars()}}},
                                                    {"value", string_type},
                                                    {"reason", string_type}}))}};
    for (const AISetup::Bar &bar : AISetup::bars()) {
        const json level = object_of({{"label", string_type},
                                      {"changes", list_of(object_of({{"key", {{"type", "string"}, {"enum", bar.keys}}}, {"value", string_type}}))}});
        properties[bar.id] = object_of({{"recommended", {{"type", "integer"}}}, {"levels", list_of(level)}});
    }
    return json::array({{{"name", "propose_settings"},
                         {"description", "Give the settings for this print, including every position of every bar."},
                         {"strict", true},
                         {"input_schema", object_of(properties)}}});
}

const char *const SYSTEM_PROMPT =
    "You set up 3D prints for someone who cares about the result but does not want to learn slicer settings. "
    "You get one request, so don't ask questions: call propose_settings right away. You are given what the user chose, the printer, "
    "each print head with the filament on it, the current settings, the valid choices for list settings, and measurements of the model.\n\n"
    "The user then moves four bars themselves without coming back to you, so you decide every position now. "
    "For each bar give 3 levels in order from its left end to its right end, and set recommended to the 0-based level that suits this print:\n"
    "- quality: from faster to better surface.\n"
    "- strength: from lighter to stronger.\n"
    "- supports: from easiest to remove to cleanest underside, judged for the materials in use. Give no levels if this print will have no supports.\n"
    "- seam: from quickest to most hidden.\n"
    "Every level of a bar lists the same settings, each with its value at that level, including any that stay equal to the current value. "
    "A level's label says in a few plain words what the user gets. "
    "Put everything that doesn't depend on a bar in fixed, listing only values that differ from the current ones, with a one-sentence reason a beginner understands. "
    "Use the summary to say what you decided and anything the user should watch for.\n\n"
    "Rules for the settings:\n"
    "- Values use the slicer's own format, for example \"0.2\", \"3\", \"15%\", \"gyroid\", \"1\" for on and \"0\" for off, and speeds in mm/s. "
    "Settings listed in setting_choices take one of those values.\n"
    "- user_choices are decided and the app applies them whatever you say. Plan everything else around them, and warn in the summary if one carries a risk.\n"
    "- parts_starting_in_mid_air above 0 means the model can't print this way up without supports. overhang_percent_of_surface shows how much else may need them.\n"
    "- support_filament and support_interface_filament take a head number, and 0 means the part's own filament. Only use a head with filament on it. "
    "When you are the one choosing, prefer a material whose bed temperature is close to the part's.\n"
    "- A different material on the support interface needs support_interface_top_layers above 0. One that doesn't bond to the part can use a support_top_z_distance of 0. "
    "The part's own material needs a gap to come off.\n"
    "- Printing with more than one head may need enable_prime_tower. Say so in its reason if you change it.\n"
    "- past_prints lists how earlier prints on this printer turned out. Avoid what went wrong there, and if a change didn't help, don't repeat it. Mention it in the summary when a past print changed your choice.\n"
    "If the user then asks for changes, what they ask for comes first: call propose_settings again in full, with their request in it even if you would choose differently, "
    "and put any concern in the summary.";

class AISetupDialog : public WebPageDialog
{
public:
    AISetupDialog() : WebPageDialog(_L("AI Setup"), "ai_setup.html", wxSize(680, 760)), m_alive(std::make_shared<bool>(true)) {}
    ~AISetupDialog() override { *m_alive = false; }

protected:
    void on_message(const std::string &cmd, const json &data) override
    {
        if (cmd == "ready") {
            json models = json::array();
            for (const ModelChoice &model : MODELS)
                models.push_back({{"id", model.id}, {"label", model.label}});
            send({{"type", "init"},
                  {"has_key", !load_api_key().empty()},
                  {"has_model", !wxGetApp().plater()->model().objects.empty()},
                  {"models", models},
                  {"heads", head_facts()},
                  {"objects", m_objects = model_facts()}});
            read_loaded_filaments([this, alive = std::weak_ptr<bool>(m_alive)](const std::vector<LoadedFilament> &loaded) {
                if (alive.expired())
                    return;
                m_loaded = loaded;
                send({{"type", "heads"}, {"heads", head_facts()}});
            });
        } else if (cmd == "save_key") {
            wxSecretStore store = wxSecretStore::GetDefault();
            const std::string key = data.at("key").get<std::string>();
            const bool saved = store.IsOk() && store.Save(SECRET_SERVICE, "api-key", wxSecretValue(key.size(), key.data()));
            send({{"type", "key_saved"}, {"ok", saved}});
        } else if (cmd == "forget_key") {
            wxSecretStore store = wxSecretStore::GetDefault();
            if (store.IsOk())
                store.Delete(SECRET_SERVICE);
        } else if (cmd == "start") {
            start(data.at("model").get<std::string>(), data);
        } else if (cmd == "answer") {
            answer(data.at("text").get<std::string>());
        } else if (cmd == "apply") {
            apply(data.at("levels"));
        } else if (cmd == "undo") {
            undo();
        }
    }

private:
    void start(const std::string &model_id, const json &form)
    {
        m_model = &MODELS[0];
        for (const ModelChoice &model : MODELS)
            if (model_id == model.id)
                m_model = &model;
        m_messages   = json::array();
        m_pending_id.clear();
        m_cost       = 0.;

        // The app applies these itself, so they hold whatever Claude replies.
        m_chosen.clear();
        const std::string support = form.value("support", "auto"), style = form.value("style", "auto");
        if (support != "auto")
            m_chosen.emplace_back("enable_support", support == "on" ? "1" : "0");
        if (support != "off") {
            if (style != "auto")
                m_chosen.emplace_back("support_type", style == "tree" ? "tree(auto)" : "normal(auto)");
            if (const int body = form.value("body", -1); body >= 0)
                m_chosen.emplace_back("support_filament", std::to_string(body));
            if (const int interface = form.value("interface", -1); interface >= 0)
                m_chosen.emplace_back("support_interface_filament", std::to_string(interface));
        }
        json chosen = json::object();
        for (const auto &[key, value] : m_chosen)
            chosen[key] = value;

        const PresetBundle &bundle = *wxGetApp().preset_bundle;
        const DynamicPrintConfig &print = bundle.prints.get_edited_preset().config;
        json current = json::object();
        for (const std::string &key : AISetup::allowed_keys())
            if (print.has(key))
                current[key] = print.opt_serialize(key);
        const DynamicPrintConfig &printer = bundle.printers.get_edited_preset().config;
        const auto *nozzle = printer.option<ConfigOptionFloats>("nozzle_diameter");

        json choices = json::object();
        for (const std::string &key : AISetup::allowed_keys())
            if (const ConfigOptionDef *def = print_config_def.get(key); def != nullptr && def->type == coEnum)
                choices[key] = def->enum_values;

        const json context = {{"printer", bundle.printers.get_edited_preset().name},
                              {"nozzle_mm", nozzle != nullptr ? nozzle->get_at(0) : 0.4},
                              {"print_heads", head_facts()},
                              {"setting_choices", choices},
                              {"print_profile", bundle.prints.get_edited_preset().name},
                              {"current_settings", current},
                              {"objects", m_objects},
                              {"past_prints", past_prints()},
                              {"user_choices", chosen},
                              {"what_it_is_for", form.value("purpose", "")},
                              {"user_notes", form.value("notes", "")}};
        m_messages.push_back({{"role", "user"}, {"content", "Set up this print.\n" + context.dump(1)}});
        request();
    }

    static json past_prints()
    {
        const DynamicPrintConfig full = wxGetApp().preset_bundle->full_config();
        return PrintJournal::lessons_for(PrintJournal::load_all(journal_folder()), current_printer(), current_materials(full), PrintJournal::settings_from(full),
                                         AISetup::allowed_keys());
    }

    const LoadedFilament *loaded_on(size_t head) const
    {
        for (const LoadedFilament &item : m_loaded)
            if (item.slot == int(head))
                return &item;
        return nullptr;
    }

    size_t head_count() const { return std::max(wxGetApp().preset_bundle->filament_presets.size(), m_loaded.size()); }

    // What's on each head: the printer's word if it answered, otherwise what the app has set up.
    json head_facts() const
    {
        PresetBundle &bundle  = *wxGetApp().preset_bundle;
        const auto   *colours = bundle.project_config.option<ConfigOptionStrings>("filament_colour");
        json          heads   = json::array();
        for (size_t head = 1; head <= head_count(); ++head) {
            const LoadedFilament *loaded = loaded_on(head);
            json fact = {{"head", head}};
            if (loaded != nullptr && !loaded->has_filament) {
                fact["empty"] = true;
                heads.push_back(fact);
                continue;
            }
            std::string name = loaded != nullptr ? loaded->preset : std::string();
            if (name.empty() && head <= bundle.filament_presets.size())
                name = bundle.filament_presets[head - 1];
            fact["filament"] = name;
            fact["colour"]   = loaded != nullptr ? loaded->colour : (colours != nullptr && head <= colours->values.size() ? colours->values[head - 1] : std::string());
            if (loaded != nullptr)
                fact["printer_calls_it"] = loaded->material;
            if (const Preset *preset = bundle.filaments.find_preset(name))
                for (const char *key : {"filament_type", "nozzle_temperature", "hot_plate_temp", "filament_soluble", "filament_is_support"})
                    if (preset->config.has(key))
                        fact[key] = preset->config.opt_serialize(key);
            heads.push_back(fact);
        }
        return heads;
    }

    void answer(const std::string &text)
    {
        if (m_pending_id.empty()) {
            m_messages.push_back({{"role", "user"}, {"content", text}});
        } else {
            json result = {{"type", "tool_result"}, {"tool_use_id", m_pending_id}, {"content", text}};
            m_messages.push_back({{"role", "user"}, {"content", json::array({result})}});
            m_pending_id.clear();
        }
        request();
    }

    void request()
    {
        const std::string key = load_api_key();
        if (key.empty()) {
            send({{"type", "error"}, {"message", "No API key saved."}});
            return;
        }
        json body = {{"model", m_model->id},
                     {"max_tokens", 16000},
                     {"system", SYSTEM_PROMPT},
                     {"tools", tool_definitions()},
                     {"tool_choice", {{"type", "auto"}, {"disable_parallel_tool_use", true}}},
                     {"output_config", {{"effort", "medium"}}},
                     {"messages", m_messages}};
        auto http = Http::post("https://api.anthropic.com/v1/messages");
        http.header("x-api-key", key).header("anthropic-version", "2026-10-21").header("content-type", "application/json");
        if (m_model->server_fallback) {
            body["fallbacks"] = "default";
            http.header("anthropic-beta", "server-side-fallback-2026-07-01");
        }
        send({{"type", "thinking"}});
        std::weak_ptr<bool> alive = m_alive;
        http.set_post_body(body.dump())
            .timeout_max(300)
            .on_complete([this, alive](std::string response, unsigned) {
                wxGetApp().CallAfter([this, alive, response] {
                    if (!alive.expired())
                        on_response(response);
                });
            })
            .on_error([this, alive](std::string response, std::string error, unsigned status) {
                wxGetApp().CallAfter([this, alive, response, error, status] {
                    if (!alive.expired())
                        on_http_error(response, error, status);
                });
            })
            .perform();
    }

    void on_http_error(const std::string &response, const std::string &error, unsigned status)
    {
        std::string message = "Couldn't reach Claude: " + error;
        if (status == 401)
            message = "The API key was refused. Check it and save it again.";
        else if (status == 429)
            message = "Too many requests right now. Wait a moment and try again.";
        else if (status == 400 && response.find("credit") != std::string::npos)
            message = "This API key has no credit left.";
        else if (const json parsed = json::parse(response, nullptr, false); parsed.is_object() && parsed.contains("error"))
            message = parsed["error"].value("message", message);
        send({{"type", "error"}, {"message", message}, {"bad_key", status == 401}});
    }

    void on_response(const std::string &response)
    {
        const json reply = json::parse(response, nullptr, false);
        if (!reply.is_object() || !reply.contains("content")) {
            send({{"type", "error"}, {"message", "Claude sent a reply this version can't read."}});
            return;
        }
        if (reply.contains("usage")) {
            const json &usage = reply["usage"];
            m_cost += usage.value("input_tokens", 0) * m_model->input_per_million / 1e6;
            m_cost += usage.value("output_tokens", 0) * m_model->output_per_million / 1e6;
            send({{"type", "cost"}, {"dollars", m_cost}});
        }
        const std::string stop = reply.value("stop_reason", "");
        if (stop == "refusal") {
            send({{"type", "error"}, {"message", "Claude declined this request. Try describing the print differently."}});
            return;
        }
        if (stop == "max_tokens") {
            send({{"type", "error"}, {"message", "The reply was cut off. Please start again."}});
            return;
        }

        // Kept exactly as received: the API requires its thinking blocks back unchanged.
        m_messages.push_back({{"role", "assistant"}, {"content", reply["content"]}});
        // The last conversation stays on this Mac, so a wrong result can be traced. The key isn't in it.
        boost::nowide::ofstream((boost::filesystem::path(data_dir()) / "ai_setup_last.json").string()) << m_messages.dump(1, ' ', false, json::error_handler_t::replace);

        std::string text;
        for (const json &block : reply["content"]) {
            const std::string type = block.value("type", "");
            if (type == "text") {
                text += block.value("text", "");
            } else if (type == "tool_use") {
                m_pending_id = block.value("id", "");
                proposal(block["input"]);
                return;
            }
        }
        send({{"type", "error"}, {"message", "Claude replied without settings: " + text}});
    }

    static bool is_head_setting(const std::string &key) { return key == "support_filament" || key == "support_interface_filament"; }

    // Checks one change and adds it to the list if it may be applied. Returns what to show for it.
    json checked_row(const std::string &key, const std::string &value, const std::string &reason, std::vector<std::pair<std::string, std::string>> &out)
    {
        const PresetBundle &bundle = *wxGetApp().preset_bundle;
        const DynamicPrintConfig &print   = bundle.prints.get_edited_preset().config;
        const DynamicPrintConfig &printer = bundle.printers.get_edited_preset().config;
        const auto *nozzle    = printer.option<ConfigOptionFloats>("nozzle_diameter");
        const auto *max_speed = printer.option<ConfigOptionFloats>("machine_max_speed_x");
        const AISetup::CheckedChange checked = AISetup::check_change(key, value, nozzle != nullptr ? nozzle->get_at(0) : 0.,
                                                                     max_speed != nullptr ? max_speed->get_at(0) : 0., int(head_count()));
        std::string note     = checked.note;
        bool        accepted = checked.accepted;
        if (accepted && is_head_setting(key)) {
            const LoadedFilament *loaded = loaded_on(size_t(std::atoi(checked.value.c_str())));
            if (loaded != nullptr && !loaded->has_filament) {
                accepted = false;
                note     = "The printer says this head has no filament.";
            }
        }
        if (accepted)
            out.emplace_back(key, checked.value);
        const ConfigOptionDef *def = print_config_def.get(key);
        return {{"label", def != nullptr ? def->label : key},
                {"before", print.has(key) ? print.opt_serialize(key) : ""},
                {"after", checked.value},
                {"accepted", accepted},
                {"reason", reason},
                {"note", note}};
    }

    void proposal(const json &input)
    {
        m_fixed.clear();
        m_levels.clear();

        json fixed = json::array();
        for (const auto &[key, value] : m_chosen)
            fixed.push_back(checked_row(key, value, "You chose this.", m_fixed));
        for (const json &change : input.value("fixed", json::array())) {
            const std::string key = change.value("key", "");
            const bool chosen = std::any_of(m_chosen.begin(), m_chosen.end(), [&key](const auto &item) { return item.first == key; });
            if (!chosen)
                fixed.push_back(checked_row(key, change.value("value", ""), change.value("reason", ""), m_fixed));
        }

        json bars = json::array();
        for (const AISetup::Bar &bar : AISetup::bars()) {
            const json &answer = input.contains(bar.id) ? input[bar.id] : json::object();
            json levels = json::array();
            for (const json &level : answer.value("levels", json::array())) {
                std::vector<std::pair<std::string, std::string>> changes;
                json rows = json::array();
                for (const json &change : level.value("changes", json::array()))
                    rows.push_back(checked_row(change.value("key", ""), change.value("value", ""), "", changes));
                m_levels[bar.id].push_back(std::move(changes));
                levels.push_back({{"label", level.value("label", "")}, {"rows", rows}});
            }
            if (!levels.empty())
                bars.push_back({{"id", bar.id},
                                {"title", bar.title},
                                {"left", bar.left},
                                {"right", bar.right},
                                {"recommended", std::clamp(answer.value("recommended", 0), 0, int(levels.size()) - 1)},
                                {"levels", levels}});
        }
        send({{"type", "proposal"}, {"summary", input.value("summary", "")}, {"fixed", fixed}, {"bars", bars}});
    }

    // positions: where each bar was left, by bar id.
    void apply(const json &positions)
    {
        m_changes = m_fixed;
        for (const auto &[id, levels] : m_levels)
            if (const size_t position = positions.value(id, size_t(0)); position < levels.size())
                m_changes.insert(m_changes.end(), levels[position].begin(), levels[position].end());

        Tab *tab = wxGetApp().get_tab(Preset::TYPE_PRINT);
        if (tab == nullptr || m_changes.empty()) {
            send({{"type", "error"}, {"message", "There are no settings to apply."}});
            return;
        }
        m_previous_preset = wxGetApp().preset_bundle->prints.get_selected_preset_name();

        // Support may use a head the app hasn't been told about yet.
        size_t head_needed = 0;
        for (const auto &[key, value] : m_changes)
            if (is_head_setting(key))
                head_needed = std::max(head_needed, size_t(std::atoi(value.c_str())));
        if (const size_t heads = wxGetApp().preset_bundle->filament_presets.size(); head_needed > heads) {
            for (size_t head = heads + 1; head <= head_needed; ++head)
                if (const LoadedFilament *loaded = loaded_on(head); loaded != nullptr && !loaded->preset.empty())
                    set_head_filament(head - 1, loaded->preset, loaded->colour);
            refresh_filaments();
        }

        const json dropped = load_print_changes(m_changes, "AI setup ");
        send({{"type", "applied"}, {"preset", wxGetApp().preset_bundle->prints.get_selected_preset_name()}, {"dropped", dropped}});
    }

    void undo()
    {
        Tab *tab = wxGetApp().get_tab(Preset::TYPE_PRINT);
        if (tab != nullptr && !m_previous_preset.empty())
            tab->select_preset(m_previous_preset);
        send({{"type", "undone"}, {"preset", m_previous_preset}});
    }

    std::shared_ptr<bool>                            m_alive;
    const ModelChoice                               *m_model{&MODELS[0]};
    json                                             m_messages;
    std::string                                      m_pending_id;
    double                                           m_cost{0.};
    std::vector<std::pair<std::string, std::string>> m_changes;
    std::string                                      m_previous_preset;
    std::vector<LoadedFilament>                      m_loaded;
    json                                             m_objects;
    std::vector<std::pair<std::string, std::string>> m_chosen;
    std::vector<std::pair<std::string, std::string>> m_fixed;
    std::map<std::string, std::vector<std::vector<std::pair<std::string, std::string>>>> m_levels;
};

// ---------------------------------------------------------------------------
// Printer, print head and filament choice when a file opens
// ---------------------------------------------------------------------------

class OpenChooserDialog : public WebPageDialog
{
public:
    bool chosen() const { return m_chosen; }

    OpenChooserDialog() : WebPageDialog(_L("Set Up This Print"), "open_chooser.html", wxSize(560, 560)) {}
    ~OpenChooserDialog() override { *m_alive = false; }

protected:
    void on_message(const std::string &cmd, const json &data) override
    {
        if (cmd == "ready") {
            send_state();
            send_loaded();
        } else if (cmd == "select_printer") {
            if (Tab *tab = wxGetApp().get_tab(Preset::TYPE_PRINTER))
                tab->select_preset(data.at("name").get<std::string>());
            send_state();
        } else if (cmd == "apply") {
            apply(data.at("head").get<int>(), data.at("filaments").get<std::vector<std::string>>(), data.at("colours").get<std::vector<std::string>>());
            m_chosen = true;
            EndModal(wxID_OK);
        }
    }

private:
    void send_loaded()
    {
        read_loaded_filaments([this, alive = m_alive](const std::vector<LoadedFilament> &loaded) {
            if (!*alive)
                return;
            json slots = json::array();
            for (const LoadedFilament &item : loaded)
                slots.push_back({{"slot", item.slot}, {"has", item.has_filament}, {"material", item.material}, {"colour", item.colour}, {"preset", item.preset}});
            send({{"type", "loaded"}, {"slots", slots}});
        });
    }

    // How many filaments the loaded model is painted or assigned with.
    static int slots_used()
    {
        int used = 1;
        for (const ModelObject *object : wxGetApp().plater()->model().objects) {
            if (object->config.has("extruder"))
                used = std::max(used, object->config.extruder());
            for (const ModelVolume *volume : object->volumes) {
                if (volume->config.has("extruder"))
                    used = std::max(used, volume->config.extruder());
                for (int extruder : volume->get_extruders())
                    used = std::max(used, extruder);
            }
        }
        return used;
    }

    void send_state()
    {
        PresetBundle &bundle = *wxGetApp().preset_bundle;

        std::map<std::string, json> by_model;
        for (const Preset &preset : bundle.printers.get_presets()) {
            if (!preset.is_visible || preset.is_default || preset.printer_technology() != ptFFF)
                continue;
            std::string model = preset.config.opt_string("printer_model");
            if (model.empty())
                model = preset.name;
            std::string label = preset.config.opt_string("printer_variant");
            label = label.empty() ? preset.name : label + " mm";
            by_model[model].push_back({{"name", preset.name}, {"label", label}});
        }
        json printers = json::array();
        for (const auto &[model, variants] : by_model)
            printers.push_back({{"model", model}, {"variants", variants}});

        const Preset &printer = bundle.printers.get_edited_preset();
        std::string   model   = printer.config.opt_string("printer_model");
        if (model.empty())
            model = printer.name;
        const auto *nozzles = printer.config.option<ConfigOptionFloats>("nozzle_diameter");
        const int   heads   = nozzles != nullptr ? int(nozzles->size()) : 1;

        std::vector<std::pair<std::string, std::string>> names;
        for (const Preset &preset : bundle.filaments.get_presets()) {
            if (!preset.is_visible || !preset.is_compatible || preset.is_default)
                continue;
            names.emplace_back(preset.label(false), preset.name);
        }
        std::sort(names.begin(), names.end());
        json filaments = json::array();
        for (const auto &[label, name] : names)
            filaments.push_back({{"label", label}, {"value", name}});

        const int slots = slots_used();
        json      current = json::array();
        for (int slot = 0; slot < slots; ++slot) {
            const bool known = size_t(slot) < bundle.filament_presets.size();
            current.push_back(known ? bundle.filament_presets[slot] : bundle.filament_presets.front());
        }

        // What the app has set up for each head, until the printer says what's really loaded.
        const auto *colours   = bundle.project_config.option<ConfigOptionStrings>("filament_colour");
        json        head_info = json::array();
        for (size_t head = 0; head < size_t(heads); ++head) {
            const bool set = head < bundle.filament_presets.size();
            head_info.push_back({{"preset", set ? bundle.filament_presets[head] : std::string()},
                                 {"colour", set && colours != nullptr && head < colours->values.size() ? colours->values[head] : std::string()}});
        }

        send({{"type", "state"},
              {"printers", printers},
              {"model", model},
              {"printer", printer.name},
              {"heads", heads},
              {"slots", slots},
              {"head_info", head_info},
              {"filaments", filaments},
              {"current", current}});
    }

    void apply(int head, const std::vector<std::string> &filaments, const std::vector<std::string> &slot_colours)
    {
        Plater *plater = wxGetApp().plater();

        // One filament goes on the chosen head. Several keep their own slots, one per head.
        const size_t first = filaments.size() == 1 ? size_t(std::max(head, 1) - 1) : 0;
        for (size_t i = 0; i < filaments.size(); ++i)
            set_head_filament(first + i, filaments[i], i < slot_colours.size() ? slot_colours[i] : std::string());

        if (filaments.size() == 1) {
            for (ModelObject *object : plater->model().objects) {
                object->config.set_key_value("extruder", new ConfigOptionInt(head));
                for (ModelVolume *volume : object->volumes)
                    if (volume->config.has("extruder"))
                        volume->config.set_key_value("extruder", new ConfigOptionInt(head));
            }
            plater->sidebar().obj_list()->reload_all_plates();
        }

        refresh_filaments();
    }

    std::shared_ptr<bool> m_alive{std::make_shared<bool>(true)};
    bool                  m_chosen{false};
};

// ---------------------------------------------------------------------------
// Print journal
// ---------------------------------------------------------------------------

class JournalDialog : public WebPageDialog
{
public:
    static void open(const std::string &id = {}, const std::string &problem = {})
    {
        if (s_open == nullptr)
            s_open = new JournalDialog();
        s_open->m_show    = id;
        s_open->m_problem = problem;
        s_open->Show();
        s_open->Raise();
        if (s_open->m_ready)
            s_open->send_list();
    }

    // Something changed outside the window.
    static void refresh()
    {
        if (s_open != nullptr && s_open->m_ready)
            s_open->send_list();
    }

protected:
    void on_message(const std::string &cmd, const json &data) override
    {
        const std::string id = data.value("id", "");
        if (cmd == "ready") {
            m_ready = true;
            send_list();
        } else if (cmd == "open") {
            send_record(id);
        } else if (cmd == "review_now") {
            const Model &model = wxGetApp().plater()->model();
            const std::string name = model.objects.empty() ? std::string("Print") : model.objects.front()->name;
            json record = new_journal_record(name, name);
            record["status"] = "added by hand";
            record["state"]  = "done";
            PrintJournal::save(journal_folder(), record);
            m_show = record["id"].get<std::string>();
            send_list();
        } else if (cmd == "photo") {
            busy(id, "Taking a photo…");
            take_record_photo(id, [this, id, alive = std::weak_ptr<bool>(m_alive)](const std::string &problem) {
                if (!alive.expired())
                    finished(id, problem);
            });
        } else if (cmd == "add_photos") {
            add_photos(id);
        } else if (cmd == "remove_photo") {
            remove_photo(id, data.value("name", ""));
        } else if (cmd == "note") {
            json record = find_record(id);
            if (!record.is_null()) {
                record["note"] = data.value("text", "");
                PrintJournal::save(journal_folder(), record);
            }
        } else if (cmd == "analyse") {
            busy(id, "Claude is looking at the photo…");
            analyse_record(id, [this, id, alive = std::weak_ptr<bool>(m_alive)](const std::string &problem) {
                if (!alive.expired())
                    finished(id, problem);
            });
        } else if (cmd == "wrong") {
            json record = find_record(id);
            const size_t index = data.value("defect", size_t(0));
            if (!record.is_null() && record.contains("report") && index < record["report"]["defects"].size()) {
                record["report"]["defects"][index]["wrong"] = data.value("wrong", true);
                PrintJournal::save(journal_folder(), record);
                send_record(id);
            }
        } else if (cmd == "delete") {
            const json record = find_record(id);
            if (!record.is_null())
                PrintJournal::remove(journal_folder(), record);
            send_list();
        }
    }

private:
    JournalDialog() : WebPageDialog(_L("Print Journal"), "journal.html", wxSize(860, 720))
    {
        Bind(wxEVT_CLOSE_WINDOW, [](wxCloseEvent &) {
            JournalDialog *closing = s_open;
            s_open = nullptr;
            closing->Destroy();
        });
    }

    void busy(const std::string &id, const std::string &text) { send({{"type", "busy"}, {"id", id}, {"text", text}}); }

    void finished(const std::string &id, const std::string &problem)
    {
        // Last, as redrawing the list clears any message on the page.
        send_list();
        send_record(id);
        send({{"type", "done"}, {"id", id}, {"problem", problem}});
    }

    void send_list()
    {
        json rows = json::array();
        for (const json &record : PrintJournal::load_all(journal_folder()))
            rows.push_back({{"id", record.value("id", "")},
                            {"when", record.value("when", "")},
                            {"file", record.value("file", "")},
                            {"state", record.value("state", "")},
                            {"status", record.value("status", "")},
                            {"overall", record.contains("report") ? record["report"].value("overall", "") : std::string()}});
        send({{"type", "list"}, {"rows", rows}, {"show", m_show}, {"has_key", !load_api_key().empty()}, {"problem", m_problem}});
        m_show.clear();
        m_problem.clear();
    }

    void send_record(const std::string &id)
    {
        json record = find_record(id);
        if (record.is_null())
            return;
        const PrintJournal::Settings current = PrintJournal::settings_from(wxGetApp().preset_bundle->full_config());
        const PrintJournal::Settings settings = record.value("settings", PrintJournal::Settings{});
        if (record.contains("report"))
            for (json &defect : record["report"]["defects"]) {
                json rows = json::array();
                for (const json &change : defect.value("changes", json::array()))
                    rows.push_back(describe_change(change.value("key", ""), change.value("value", ""), settings, nullptr));
                defect["rows"] = rows;
            }
        json images = json::array();
        for (const std::string &photo : record.value("photos", std::vector<std::string>{})) {
            boost::nowide::ifstream file((boost::filesystem::path(journal_folder()) / photo).string(), std::ios::binary);
            const std::string bytes((std::istreambuf_iterator<char>(file)), std::istreambuf_iterator<char>());
            images.push_back({{"name", photo},
                              {"camera", is_camera_photo(photo)},
                              {"source", "data:image/jpeg;base64," + wxBase64Encode(bytes.data(), bytes.size()).ToStdString()}});
        }
        record.erase("settings");
        record["images"]        = images;
        record["same_settings"] = settings == current;
        send({{"type", "record"}, {"record", record}});
    }

    void add_photos(const std::string &id)
    {
        json record = find_record(id);
        if (record.is_null())
            return;
        wxFileDialog dialog(this, _L("Choose photos of this print"), wxEmptyString, wxEmptyString, "Photos (*.jpg;*.jpeg;*.heic;*.png)|*.jpg;*.jpeg;*.heic;*.png",
                            wxFD_OPEN | wxFD_FILE_MUST_EXIST | wxFD_MULTIPLE);
        if (dialog.ShowModal() != wxID_OK)
            return;
        wxArrayString chosen;
        dialog.GetPaths(chosen);

        std::string problem;
        for (const wxString &path : chosen) {
            const std::vector<std::string> photos = record["photos"].get<std::vector<std::string>>();
            const size_t own = std::count_if(photos.begin(), photos.end(), [](const std::string &photo) { return !is_camera_photo(photo); });
            if (own >= MAX_OWN_PHOTOS) {
                problem = "Only 3 photos of your own fit, so the rest weren't added.";
                break;
            }
            const std::string name = new_photo_name(record, "own");
            if (import_photo(path, boost::filesystem::path(journal_folder()) / name))
                record["photos"].push_back(name);
            else
                problem = "Couldn't read " + into_u8(wxFileName(path).GetFullName()) + ".";
        }
        PrintJournal::save(journal_folder(), record);
        finished(id, problem);
    }

    void remove_photo(const std::string &id, const std::string &name)
    {
        json record = find_record(id);
        if (record.is_null())
            return;
        json kept = json::array();
        for (const std::string &photo : record["photos"].get<std::vector<std::string>>()) {
            if (photo == name)
                boost::filesystem::remove(boost::filesystem::path(journal_folder()) / photo);
            else
                kept.push_back(photo);
        }
        record["photos"] = kept;
        PrintJournal::save(journal_folder(), record);
        send_record(id);
    }

    static inline JournalDialog *s_open{nullptr};
    std::shared_ptr<bool>        m_alive{std::make_shared<bool>(true)};
    bool                         m_ready{false};
    std::string                  m_show;
    std::string                  m_problem;
};

// Follows the print the app last sent, and when it ends takes a photo and has it read.
// Says the printer needs attention, without blocking the app. Only the latest one stays open.
class PrinterAlertDialog : public WebPageDialog
{
public:
    static void show(const json &alert)
    {
        if (s_open != nullptr)
            s_open->Destroy();
        s_open = new PrinterAlertDialog(alert);
        s_open->Show();
        s_open->Raise();
        wxGetApp().mainframe->RequestUserAttention(wxUSER_ATTENTION_ERROR);
        wxBell();
    }

    ~PrinterAlertDialog() override
    {
        // Destroying is deferred, so a newer alert may be showing by now.
        if (s_open == this)
            s_open = nullptr;
    }

protected:
    void on_message(const std::string &cmd, const json &) override
    {
        if (cmd == "ready")
            send(m_alert);
        else if (cmd == "device") {
            wxGetApp().mainframe->request_select_tab(TAB_ID_MONITOR);
            wxGetApp().mainframe->Raise();
            Close();
        }
    }

private:
    explicit PrinterAlertDialog(const json &alert) : WebPageDialog(_L("Printer needs attention"), "printer_alert.html", wxSize(460, 300)), m_alert(alert)
    {
        Bind(wxEVT_CLOSE_WINDOW, [this](wxCloseEvent &) { Destroy(); });
    }

    static inline PrinterAlertDialog *s_open{nullptr};
    json                              m_alert;
};

class JournalWatcher
{
public:
    static JournalWatcher &get()
    {
        static auto *watcher = new JournalWatcher(); // never destroyed, as its timer must not outlive wx
        return *watcher;
    }

    void wake()
    {
        if (!m_timer.IsRunning() && !active().is_null())
            m_timer.Start(POLL_MS);
    }

    // A pause the user asked for from this app isn't news to them.
    void expect_pause() { m_expected_pause_until = std::time(nullptr) + EXPECTED_PAUSE_SECONDS; }

private:
    static constexpr int POLL_MS = 15000;
    static constexpr int EXPECTED_PAUSE_SECONDS = 5 * 60;
    static constexpr int NEVER_STARTED_SECONDS = 30 * 60;

    JournalWatcher()
    {
        m_timer.Bind(wxEVT_TIMER, [this](wxTimerEvent &) { poll(); });
    }

    static json active()
    {
        for (json &record : PrintJournal::load_all(journal_folder()))
            if (record.value("state", "") == "waiting" || record.value("state", "") == "printing")
                return std::move(record);
        return nullptr;
    }

    void check_alert(const std::string &kind, const std::string &status, const std::string &error_code, const json &detail, const json &record)
    {
        const std::string key = kind + error_code;
        if (key == m_alerted)
            return;
        m_alerted = key;
        if (kind.empty())
            return;
        if (kind == "paused" && std::time(nullptr) < m_expected_pause_until) {
            m_expected_pause_until = 0;
            return;
        }
        const std::string file = detail.value("printFileName", "");
        BOOST_LOG_TRIVIAL(warning) << "Printer alert: " << kind << ", status " << status << ", code " << error_code;
        PrinterAlertDialog::show({{"kind", kind},
                                  {"code", error_code},
                                  {"file", file.empty() ? record.value("file", "") : file},
                                  {"layer", detail.value("printLayer", 0)},
                                  {"layers", detail.value("targetPrintLayer", 0)}});
    }

    void poll()
    {
        const json record = active();
        if (record.is_null()) {
            m_timer.Stop();
            return;
        }
        const DynamicPrintConfig *printer = flashforge_printer();
        if (printer == nullptr || m_busy)
            return;
        m_busy = true;
        read_flashforge_details(printer->opt_string("print_host"), printer->opt_string("flashforge_serial_number"), printer->opt_string("printhost_apikey"),
                                [this](bool ok, const std::string &body, const std::string &) {
                                    m_busy = false;
                                    if (ok)
                                        on_details(body);
                                });
    }

    void on_details(const std::string &body)
    {
        json record = active();
        const json parsed = json::parse(body, nullptr, false);
        if (record.is_null() || !parsed.is_object())
            return;
        const json       &detail = parsed.contains("detail") ? parsed["detail"] : parsed;
        std::string       status = detail.value("status", "");
        std::transform(status.begin(), status.end(), status.begin(), [](unsigned char c) { return char(std::tolower(c)); });
        const std::string file = detail.value("printFileName", "");
        const std::string error_code = detail.value("errorCode", "");
        check_alert(PrintJournal::alert_kind(status, error_code), status, error_code, detail, record);

        if (record.value("state", "") == "waiting") {
            if (PrintJournal::still_going(status)) {
                // The printer's name for the file is the one to follow.
                record["state"] = "printing";
                record["file"]  = file.empty() ? record.value("file", "") : file;
                PrintJournal::save(journal_folder(), record);
            } else if (std::int64_t(std::time(nullptr)) - record.value("created", std::int64_t(0)) > NEVER_STARTED_SECONDS) {
                PrintJournal::remove(journal_folder(), record); // the upload must have failed
            }
            return;
        }

        if (file == record.value("file", "") && PrintJournal::still_going(status)) {
            if (detail.value("printLayer", 0) != record.value("layer", 0)) {
                record["layer"]  = detail.value("printLayer", 0);
                record["layers"] = detail.value("targetPrintLayer", 0);
                PrintJournal::save(journal_folder(), record);
            }
            return;
        }

        // It ended. Only the end state of this same file means the part is what the camera sees.
        const bool on_bed = file == record.value("file", "") && (status == "completed" || status == "cancel" || status == "error");
        record["state"]  = "done";
        record["status"] = status;
        if (!error_code.empty())
            record["error_code"] = error_code;
        PrintJournal::save(journal_folder(), record);
        JournalDialog::refresh();
        if (!on_bed) {
            JournalDialog::open(record.value("id", ""));
            return;
        }
        const std::string id = record.value("id", "");
        const bool failed = status == "error";
        // The head needs time to move off the part before the picture.
        auto *pause = new wxTimer();
        pause->Bind(wxEVT_TIMER, [pause, id, failed](wxTimerEvent &) {
            pause->Stop();
            wxGetApp().CallAfter([pause] { delete pause; });
            // Claude reads it once the user has had their say, so that one paid request sees everything.
            // After an error the alert is what the user needs, and the journal keeps the photo for later.
            take_record_photo(id, [id, failed](const std::string &problem) {
                if (failed)
                    JournalDialog::refresh();
                else
                    JournalDialog::open(id, problem);
            });
        });
        pause->StartOnce(30000);
    }

    wxTimer     m_timer;
    bool        m_busy{false};
    std::string m_alerted;
    std::time_t m_expected_pause_until{0};
};

// ---------------------------------------------------------------------------
// What past prints say, before sending this one
// ---------------------------------------------------------------------------

class BeforePrintDialog : public WebPageDialog
{
public:
    BeforePrintDialog(const json &tips, const PrintJournal::Settings &current)
        : WebPageDialog(_L("Before You Print"), "before_print.html", wxSize(640, 640)), m_tips(tips), m_current(current) {}

    bool go_ahead() const { return m_go_ahead; }

protected:
    void on_message(const std::string &cmd, const json &data) override
    {
        if (cmd == "ready") {
            json tips = m_tips;
            for (json &tip : tips) {
                json rows = json::array();
                for (const json &change : tip.value("changes", json::array()))
                    rows.push_back(describe_change(change.value("key", ""), change.value("value", ""), m_current, nullptr));
                tip["rows"] = rows;
            }
            send({{"type", "tips"}, {"tips", tips}});
        } else if (cmd == "print") {
            m_go_ahead = true;
            EndModal(wxID_OK);
        } else if (cmd == "apply") {
            std::vector<std::pair<std::string, std::string>> changes;
            for (const size_t index : data.at("tips").get<std::vector<size_t>>())
                if (index < m_tips.size())
                    for (const json &change : m_tips[index].value("changes", json::array()))
                        describe_change(change.value("key", ""), change.value("value", ""), m_current, &changes);
            if (!changes.empty())
                load_print_changes(changes, "After journal ");
            EndModal(wxID_OK);
        }
    }

private:
    json                   m_tips;
    PrintJournal::Settings m_current;
    bool                   m_go_ahead{false};
};

} // namespace

void show_print_journal()
{
    JournalDialog::open();
}

void start_print_journal()
{
    JournalWatcher::get().wake();
}

void journal_expect_pause()
{
    JournalWatcher::get().expect_pause();
}

void journal_print_sent(const std::string &file, const std::string &model_name)
{
    if (flashforge_printer() == nullptr)
        return;
    // Only one print runs at a time, so an older one still marked as running is over.
    for (json &old : PrintJournal::load_all(journal_folder()))
        if (old.value("state", "") == "waiting" || old.value("state", "") == "printing") {
            old["state"]  = "done";
            old["status"] = "unknown";
            PrintJournal::save(journal_folder(), old);
        }
    json record = new_journal_record(file, model_name);
    record["state"] = "waiting";
    PrintJournal::save(journal_folder(), record);
    JournalWatcher::get().wake();
}

bool journal_check_before_print()
{
    const DynamicPrintConfig full = wxGetApp().preset_bundle->full_config();
    const PrintJournal::Settings current = PrintJournal::settings_from(full);
    const json tips = PrintJournal::tips_for(PrintJournal::load_all(journal_folder()), current_printer(), current_materials(full), current);
    if (tips.empty())
        return true;
    BeforePrintDialog dialog(tips, current);
    dialog.ShowModal();
    return dialog.go_ahead();
}

void show_open_chooser_dialog()
{
    OpenChooserDialog dialog;
    dialog.ShowModal();
    // Choosing what to print with leads straight on to how to print it.
    if (dialog.chosen())
        show_ai_setup_dialog();
}

void show_resume_dialog(int layer)
{
    ResumeDialog dialog(layer);
    dialog.ShowModal();
}

void show_ai_setup_dialog()
{
    AISetupDialog dialog;
    dialog.ShowModal();
}

}} // namespace Slic3r::GUI
