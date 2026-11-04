#include "ElslicerDialogs.hpp"

#include "GUI.hpp"
#include "GUI_App.hpp"
#include "GUI_Utils.hpp"
#include "I18N.hpp"
#include "MainFrame.hpp"
#include "PartPlate.hpp"
#include "Plater.hpp"
#include "Tab.hpp"
#include "Widgets/WebView.hpp"

#include "libslic3r/AISetup.hpp"
#include "libslic3r/GCode/ResumeFromLayer.hpp"
#include "libslic3r/Model.hpp"
#include "libslic3r/PresetBundle.hpp"
#include "libslic3r/PrintConfig.hpp"
#include "slic3r/Utils/Http.hpp"

#include <boost/filesystem.hpp>
#include <boost/log/trivial.hpp>
#include <nlohmann/json.hpp>

#include <wx/filedlg.h>
#include <wx/secretstore.h>
#include <wx/sizer.h>
#include <wx/webview.h>

#include <ctime>
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
            if (cmd == "close")
                EndModal(wxID_OK);
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
                           {"bed_contact_mm2", on_bed}});
    }
    return objects;
}

json tool_definitions()
{
    json keys = AISetup::allowed_keys();
    json ask = {
        {"name", "ask_question"},
        {"description", "Ask the user one short multiple-choice question about this print. They can also type their own answer."},
        {"strict", true},
        {"input_schema",
         {{"type", "object"},
          {"additionalProperties", false},
          {"required", {"question", "options"}},
          {"properties",
           {{"question", {{"type", "string"}}},
            {"options", {{"type", "array"}, {"items", {{"type", "string"}}}}}}}}}};
    json propose = {
        {"name", "propose_settings"},
        {"description", "Propose the final settings. Include only settings that should differ from the current values."},
        {"strict", true},
        {"input_schema",
         {{"type", "object"},
          {"additionalProperties", false},
          {"required", {"summary", "changes"}},
          {"properties",
           {{"summary", {{"type", "string"}}},
            {"changes",
             {{"type", "array"},
              {"items",
               {{"type", "object"},
                {"additionalProperties", false},
                {"required", {"key", "value", "reason"}},
                {"properties",
                 {{"key", {{"type", "string"}, {"enum", keys}}},
                  {"value", {{"type", "string"}}},
                  {"reason", {{"type", "string"}}}}}}}}}}}}}};
    return json::array({ask, propose});
}

const char *const SYSTEM_PROMPT =
    "You choose 3D print settings for someone who does not want to learn slicer settings. "
    "You are given the printer, filament, current settings and measurements of the model. "
    "Ask between 3 and 6 short questions with ask_question, one at a time, in plain language with no slicer jargon, "
    "and skip anything the measurements already answer. Typical topics: what the part is for, whether strength or looks matter more, "
    "how much waiting is acceptable, and whether support marks are acceptable. "
    "When you know enough, call propose_settings. Give each change a one-sentence reason a beginner understands. "
    "Values use the slicer's own format, for example \"0.2\", \"3\", \"15%\", \"gyroid\", \"1\" for on and \"0\" for off, and speeds in mm/s. "
    "If the user asks for changes after a proposal, call propose_settings again with the full updated list.";

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
                  {"models", models}});
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
            start(data.at("model").get<std::string>());
        } else if (cmd == "answer") {
            answer(data.at("text").get<std::string>());
        } else if (cmd == "apply") {
            apply();
        } else if (cmd == "undo") {
            undo();
        }
    }

private:
    void start(const std::string &model_id)
    {
        m_model = &MODELS[0];
        for (const ModelChoice &model : MODELS)
            if (model_id == model.id)
                m_model = &model;
        m_messages   = json::array();
        m_pending_id.clear();
        m_cost       = 0.;

        const PresetBundle &bundle = *wxGetApp().preset_bundle;
        const DynamicPrintConfig &print = bundle.prints.get_edited_preset().config;
        json current = json::object();
        for (const std::string &key : AISetup::allowed_keys())
            if (print.has(key))
                current[key] = print.opt_serialize(key);
        const DynamicPrintConfig &printer = bundle.printers.get_edited_preset().config;
        const auto *nozzle = printer.option<ConfigOptionFloats>("nozzle_diameter");

        const json context = {{"printer", bundle.printers.get_edited_preset().name},
                              {"nozzle_mm", nozzle != nullptr ? nozzle->get_at(0) : 0.4},
                              {"filament", bundle.filaments.get_edited_preset().name},
                              {"print_profile", bundle.prints.get_edited_preset().name},
                              {"current_settings", current},
                              {"objects", model_facts()}};
        m_messages.push_back({{"role", "user"}, {"content", "Help me set up this print.\n" + context.dump(1)}});
        request();
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

        std::string text;
        for (const json &block : reply["content"]) {
            const std::string type = block.value("type", "");
            if (type == "text") {
                text += block.value("text", "");
            } else if (type == "tool_use") {
                m_pending_id = block.value("id", "");
                const json &input = block["input"];
                if (block.value("name", "") == "ask_question") {
                    send({{"type", "question"}, {"question", input.value("question", "")}, {"options", input.value("options", json::array())}});
                } else {
                    proposal(input);
                }
                return;
            }
        }
        send({{"type", "question"}, {"question", text}, {"options", json::array()}});
    }

    void proposal(const json &input)
    {
        const PresetBundle &bundle = *wxGetApp().preset_bundle;
        const DynamicPrintConfig &print   = bundle.prints.get_edited_preset().config;
        const DynamicPrintConfig &printer = bundle.printers.get_edited_preset().config;
        const auto *nozzle    = printer.option<ConfigOptionFloats>("nozzle_diameter");
        const auto *max_speed = printer.option<ConfigOptionFloats>("machine_max_speed_x");

        m_changes.clear();
        json rows = json::array();
        for (const json &change : input.value("changes", json::array())) {
            const std::string key = change.value("key", "");
            const AISetup::CheckedChange checked = AISetup::check_change(key, change.value("value", ""), nozzle != nullptr ? nozzle->get_at(0) : 0.,
                                                                         max_speed != nullptr ? max_speed->get_at(0) : 0.);
            const ConfigOptionDef *def = print_config_def.get(key);
            rows.push_back({{"label", def != nullptr ? def->label : key},
                            {"before", print.has(key) ? print.opt_serialize(key) : ""},
                            {"after", checked.value},
                            {"accepted", checked.accepted},
                            {"reason", change.value("reason", "")},
                            {"note", checked.note}});
            if (checked.accepted)
                m_changes.emplace_back(key, checked.value);
        }
        send({{"type", "proposal"}, {"summary", input.value("summary", "")}, {"changes", rows}});
    }

    void apply()
    {
        Tab *tab = wxGetApp().get_tab(Preset::TYPE_PRINT);
        if (tab == nullptr || m_changes.empty()) {
            send({{"type", "error"}, {"message", "There are no settings to apply."}});
            return;
        }
        m_previous_preset = wxGetApp().preset_bundle->prints.get_selected_preset_name();

        DynamicPrintConfig config;
        for (const auto &[key, value] : m_changes)
            config.set_deserialize_strict(key, value);
        tab->load_config(config);

        char stamp[32];
        const std::time_t now = std::time(nullptr);
        std::strftime(stamp, sizeof(stamp), "%Y-%m-%d %H.%M.%S", std::localtime(&now));
        const std::string name = std::string("AI setup ") + stamp;
        tab->save_preset(name);
        send({{"type", "applied"}, {"preset", wxGetApp().preset_bundle->prints.get_selected_preset_name()}});
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
};

} // namespace

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
