#include "PrinterWebViewHandler.hpp"

#include "ElslicerDialogs.hpp"
#include "Http.hpp"
#include "I18N.hpp"
#include "MainFrame.hpp"
#include "PhysicalPrinterDialog.hpp"
#include "PrinterWebView.hpp"
#include "slic3r/GUI/GUI_App.hpp"
#include "slic3r/GUI/Widgets/WebView.hpp"
#include "slic3r/Utils/Flashforge.hpp"
#include "slic3r/Utils/PrintHost.hpp"
#include "libslic3r/Preset.hpp"

#include <algorithm>
#include <memory>
#include <cstdint>
#include "libslic3r/Config.hpp"
#include "libslic3r/PrintConfig.hpp"
#include <nlohmann/json.hpp>
#include <atomic>
#include <boost/filesystem/path.hpp>
#include <string>
#include <thread>
#include <utility>
#include <vector>
#include <wx/filedlg.h>
#include <wx/string.h>
#include <wx/webview.h>
#include <wx/utils.h>
#include <wx/buffer.h>
#include <wx/evtloop.h>
#include <wx/frame.h>
#include <wx/sizer.h>
#include "libslic3r/Utils.hpp"
#include <wx/timer.h>
#include <boost/beast/core/detail/base64.hpp>
#include <boost/nowide/fstream.hpp>
#include <chrono>
#include <condition_variable>
#include <functional>
#include <mutex>
#include <set>

using json = nlohmann::json;

namespace Slic3r {
namespace GUI {

static void send_flashforge_control(const std::string& print_host, const std::string& serial, const std::string& code, const std::string& command, const json& args,
                                    std::function<void(bool, const std::string&, const std::string&)> done);

PrinterWebViewHandler::PrinterWebViewHandler(PrinterWebView& owner)
    : m_owner(owner)
{
}

PrinterWebViewHandler::~PrinterWebViewHandler() = default;

void PrinterWebViewHandler::on_loaded(wxWebViewEvent &evt)
{
}

void PrinterWebViewHandler::on_script_message(wxWebViewEvent &evt)
{
}

PrinterWebView& PrinterWebViewHandler::owner() const
{
    return m_owner;
}

wxWebView* PrinterWebViewHandler::browser() const
{
    return m_owner.m_browser;
}

namespace {

DynamicPrintConfig* get_active_printer_config()
{
    if (wxGetApp().preset_bundle == nullptr)
        return nullptr;

    return &wxGetApp().preset_bundle->printers.get_edited_preset().config;
}

std::string json_string(const json& node, const char* key)
{
    auto it = node.find(key);
    return (it != node.end() && it->is_string()) ? it->get<std::string>() : std::string();
}

std::string dump_json(const json& node)
{
    return node.dump(-1, ' ', false, json::error_handler_t::replace);
}

boost::filesystem::path path_from_utf8(const std::string& utf8_path)
{
#ifdef _WIN32
    const wxString wide_path = wxString::FromUTF8(utf8_path.c_str());
    return boost::filesystem::path(wide_path.ToStdWstring());
#else
    return boost::filesystem::path(utf8_path);
#endif
}

std::string filename_to_utf8(const boost::filesystem::path& path)
{
#ifdef _WIN32
    const wxString wx_filename(path.filename().c_str());
    const wxScopedCharBuffer utf8 = wx_filename.ToUTF8();
    return utf8.data() != nullptr ? std::string(utf8.data()) : std::string();
#else
    return path.filename().string();
#endif
}

class ElegooPrinterWebViewHandler final : public PrinterWebViewHandler {
public:
    explicit ElegooPrinterWebViewHandler(PrinterWebView& owner)
        : PrinterWebViewHandler(owner)
    {
    }

    ~ElegooPrinterWebViewHandler() override
    {
        stop_upload = true;
        if (upload_thread.joinable())
            upload_thread.join();
    }

    void on_script_message(wxWebViewEvent &evt) override
    {
        const wxString message = evt.GetString();
        if (message.empty())
            return;

        json root = json::parse(message.ToUTF8().data(), nullptr, false);
        if (root.is_discarded() || !root.is_object())
            return;

        std::string request_id = json_string(root, "id");
        std::string method     = json_string(root, "method");
        json        params     = root.contains("params") && root["params"].is_object() ? root["params"] : json::object();

        if (method.empty()) {
            method = json_string(root, "command");
            if (params.empty() && root.contains("data") && root["data"].is_object())
                params = root["data"];
        }

        if (method == "open" || method == "common_openurl") {
            const std::string url = json_string(params, "url").empty() ? json_string(root, "url") : json_string(params, "url");
            if (!url.empty())
                wxLaunchDefaultBrowser(url);
            if (!request_id.empty())
                send_ipc_message("response", request_id, method, 0, "success");
            return;
        }

        if (method == "upload_file") {
            handle_upload_request(request_id, method, dump_json(params));
            return;
        }

        if (method == "open_file_dialog") {
            handle_open_file_dialog_request(request_id, method, dump_json(params));
            return;
        }

        if (method == "get_sn") {
            handle_get_sn_request(request_id, method);
            return;
        }
    }

private:
    void send_ipc_message(const char* type, const std::string& request_id, const std::string& method, int code,
                          const std::string& message, const std::string& data_json = "{}")
    {
        if (browser() == nullptr)
            return;

        json body = json::object();
        body["type"] = type;
        if (!request_id.empty())
            body["id"] = request_id;
        if (!method.empty())
            body["method"] = method;

        json data = json::parse(data_json, nullptr, false);
        if (data.is_discarded())
            data = json::object();
        body["data"] = std::move(data);

        if (std::string(type) == "response") {
            body["code"] = code;
            body["message"] = message;
        }

        const wxString payload = wxString::FromUTF8(dump_json(body));
        const wxString script = "if (typeof HandleStudio === 'function') { HandleStudio(" + payload + "); } else { window.postMessage(" + payload + ", '*'); }";
        wxGetApp().CallAfter([this, script]() {
            if (browser() != nullptr)
                WebView::RunScript(browser(), script);
        });
    }

    void handle_upload_request(const std::string& request_id, const std::string& method, const std::string& params_json)
    {
        if (upload_in_progress.exchange(true)) {
            send_ipc_message("response", request_id, method, 1, "Upload already in progress");
            return;
        }

        if (upload_thread.joinable())
            upload_thread.join();

        json params = json::parse(params_json, nullptr, false);
        if (params.is_discarded())
            params = json::object();

        std::string file_path = json_string(params, "filePath");
        std::string file_name = json_string(params, "fileName");

        if (file_path.empty()) {
            upload_in_progress = false;
            send_ipc_message("response", request_id, method, 1, "Missing filePath");
            return;
        }

        // HTML IPC passes UTF-8 strings; decode explicitly to avoid Windows codepage issues.
        boost::filesystem::path source_path = path_from_utf8(file_path);
        if (file_name.empty())
            file_name = filename_to_utf8(source_path);

        DynamicPrintConfig* config = get_active_printer_config();
        std::unique_ptr<PrintHost> print_host(config == nullptr ? nullptr : PrintHost::get_print_host(config));
        if (print_host == nullptr) {
            upload_in_progress = false;
            send_ipc_message("response", request_id, method, 1, "Could not get a valid Printer Host reference");
            return;
        }

        stop_upload = false;
        upload_thread = std::thread([this, request_id, method, file_path, file_name, source_path, print_host = std::move(print_host)]() mutable {
            std::string error_message;

            PrintHostUpload upload_data;
            upload_data.use_3mf      = false;
            upload_data.post_action  = PrintHostPostUploadAction::None;
            upload_data.source_path  = source_path;
            upload_data.upload_path  = path_from_utf8(file_name);

            const bool success = print_host->upload(
                std::move(upload_data),
                [this, request_id](Http::Progress progress, bool& cancel) {
                    cancel = stop_upload.load();
                    json data = {
                        {"uploadedBytes", static_cast<uint64_t>(progress.ulnow)},
                        {"totalBytes", static_cast<uint64_t>(progress.ultotal)}
                    };
                    send_ipc_message("event", request_id, "upload_progress", 0, "", dump_json(data));
                },
                [&error_message](wxString error) {
                    error_message = error.ToUTF8().data();
                },
                [this, request_id](wxString tag, wxString status) {
                    json data = {
                        {"tag", tag.ToUTF8().data()},
                        {"status", status.ToUTF8().data()}
                    };
                    send_ipc_message("event", request_id, "upload_info", 0, "", dump_json(data));
                });

            upload_in_progress = false;

            if (success) {
                json data = {
                    {"success", true},
                    {"filePath", file_path},
                    {"fileName", file_name}
                };
                send_ipc_message("response", request_id, method, 0, "success", dump_json(data));
            } else {
                if (error_message.empty())
                    error_message = "Upload failed";
                send_ipc_message("response", request_id, method, 1, error_message);
            }
        });
    }

    void handle_open_file_dialog_request(const std::string& request_id, const std::string& method, const std::string& params_json)
    {
        json params = json::parse(params_json, nullptr, false);
        if (params.is_discarded())
            params = json::object();

        const std::string filter = json_string(params, "filter").empty() ? _u8L("All files (*.*)|*.*") : json_string(params, "filter");

        wxWindow* parent = owner().GetParent();
        if (parent == nullptr)
            parent = wxGetApp().GetTopWindow();

        wxFileDialog open_file_dialog(parent, _L("Open File"), "", "", wxString::FromUTF8(filter), wxFD_OPEN | wxFD_FILE_MUST_EXIST);

        json data = json::object();
        data["files"] = json::array();
        if (open_file_dialog.ShowModal() != wxID_CANCEL)
            data["files"].push_back(open_file_dialog.GetPath().ToUTF8().data());

        send_ipc_message("response", request_id, method, 0, "success", dump_json(data));
    }

    void handle_get_sn_request(const std::string& request_id, const std::string& method)
    {
        // Panel always calls get_sn with a 10s IPC timeout. Answer immediately from
        // dev_sn / cache — do not spawn a thread or perform HTTP (panel uses URL sn on miss).
        std::string sn;
        if (DynamicPrintConfig* config = get_active_printer_config()) {
            const std::unique_ptr<PrintHost> host(PrintHost::get_print_host(config));
            if (host)
                sn = host->get_sn();
        }
        json data = { { "sn", sn } };
        send_ipc_message("response", request_id, method, 0, "success", dump_json(data));
    }

    std::atomic<bool> upload_in_progress { false };
    std::atomic<bool> stop_upload { false };
    std::thread       upload_thread;
};

// Elslicer: a hidden web view sitting on the printer's API address, so its requests are same-origin.
class FlashforgeWebBridge
{
public:
    using Done = std::function<void(bool, const std::string&, const std::string&)>;

    explicit FlashforgeWebBridge(std::string path) : m_path(std::move(path)) {}

    void request(const std::string& host, const std::string& body, Done done)
    {
        m_pending.push_back(std::move(done));
        m_body = body;
        if (m_busy)
            return;
        m_busy = true;
        if (m_view == nullptr)
            create();
        if (m_ready && host == m_host) {
            send_request();
            return;
        }
        m_host  = host;
        m_ready = false;
        m_view->LoadURL(wxString::FromUTF8("http://" + host + ":8898/"));
    }

private:
    void create()
    {
        m_view = WebView::CreateWebView(wxGetApp().mainframe, "");
        m_view->Hide();
        m_view->Bind(wxEVT_WEBVIEW_LOADED, [this](wxWebViewEvent& evt) {
            if (evt.GetURL().IsEmpty() || evt.GetURL() == "about:blank" || !m_busy)
                return;
            m_ready = true;
            send_request();
        });
        m_view->Bind(wxEVT_WEBVIEW_ERROR, [this](wxWebViewEvent& evt) {
            if (!m_ready && m_busy)
                finish(false, "", "the printer didn't answer");
        });
        m_view->Bind(wxEVT_WEBVIEW_SCRIPT_MESSAGE_RECEIVED, [this](wxWebViewEvent& evt) {
            const json reply = json::parse(evt.GetString().ToUTF8().data(), nullptr, false);
            if (reply.is_discarded() || !m_busy)
                return;
            if (!reply.value("ok", false)) {
                // The view may have lost its page, so load it again next time.
                m_ready = false;
                finish(false, "", "the printer didn't answer");
                return;
            }
            const std::string body   = reply.value("body", "");
            const json        parsed = json::parse(body, nullptr, false);
            if (parsed.is_object() && parsed.value("code", 0) != 0)
                finish(false, "", parsed.value("message", "the printer refused the request"));
            else
                finish(true, body, "");
        });
    }

    void send_request()
    {
        const std::string script = "fetch('" + m_path + "',{method:'POST',headers:{'Content-Type':'application/json'},body:" + json(m_body).dump() +
                                   ",signal:AbortSignal.timeout(6000)}).then(r=>r.text())"
                                   ".then(body=>window.wx.postMessage(JSON.stringify({ok:true,body})))"
                                   ".catch(()=>window.wx.postMessage(JSON.stringify({ok:false})));";
        WebView::RunScript(m_view, wxString::FromUTF8(script));
    }

    void finish(bool ok, const std::string& body, const std::string& error)
    {
        m_busy = false;
        std::vector<Done> pending;
        pending.swap(m_pending);
        for (const Done& done : pending)
            done(ok, body, error);
    }

    wxWebView*        m_view{nullptr};
    std::string       m_path;
    std::string       m_host;
    std::string       m_body;
    bool              m_ready{false};
    bool              m_busy{false};
    std::vector<Done> m_pending;
};

// Elslicer: the printer's camera in a window of its own, which can go full screen.
class FlashforgeCameraWindow : public wxFrame
{
public:
    static bool is_open() { return s_open != nullptr; }

    // Runs when the user asks to go back to the app's own view.
    static inline std::function<void()> s_on_back;

    // Returns the address to show again afterwards, or nothing if no window was open.
    static std::string close_for_photo()
    {
        if (s_open == nullptr)
            return {};
        const std::string url = s_open->m_url;
        s_open->Close();
        return url;
    }

    static void show(const std::string& url)
    {
        if (s_open == nullptr)
            s_open = new FlashforgeCameraWindow(url);
        s_open->Show();
        s_open->Raise();
    }

private:
    explicit FlashforgeCameraWindow(const std::string& url)
        // No title bar, so its only controls are the page's own. It also means Elmenu, which only
        // joins standard windows, leaves this one alone.
        : wxFrame(wxGetApp().mainframe, wxID_ANY, _L("Printer camera"), wxDefaultPosition, wxGetApp().mainframe->FromDIP(wxSize(960, 640)),
                  wxBORDER_NONE | wxRESIZE_BORDER)
        , m_url(url)
    {
        SetBackgroundColour(*wxBLACK);
        const std::string page = (boost::filesystem::path(resources_dir()) / "web/elslicer/camera.html").make_preferred().string();
        m_view = WebView::CreateWebView(this, wxString::FromUTF8("file://" + page));
        auto* sizer = new wxBoxSizer(wxVERTICAL);
        sizer->Add(m_view, 1, wxEXPAND);
        SetSizer(sizer);
        CenterOnParent();

        m_view->Bind(wxEVT_WEBVIEW_SCRIPT_MESSAGE_RECEIVED, [this](wxWebViewEvent& evt) {
            const json message = json::parse(evt.GetString().ToUTF8().data(), nullptr, false);
            const std::string cmd = message.is_discarded() ? std::string() : message.value("cmd", "");
            if (cmd == "ready")
                send({{"url", m_url}, {"full", IsFullScreen()}});
            else if (cmd == "toggle" || (cmd == "exit" && IsFullScreen())) {
                ShowFullScreen(!IsFullScreen());
                send({{"full", IsFullScreen()}});
            } else if (cmd == "back") {
                Close();
                if (s_on_back)
                    s_on_back();
            } else if (cmd == "grab") {
                m_grab_position = GetPosition();
                m_grab_size     = GetSize();
            } else if (!IsFullScreen() && (cmd == "move" || cmd == "resize")) {
                const wxPoint by(message.value("x", 0), message.value("y", 0));
                if (cmd == "move")
                    Move(m_grab_position + by);
                else
                    SetSize(std::max(m_grab_size.x + by.x, FromDIP(320)), std::max(m_grab_size.y + by.y, FromDIP(200)));
            }
        });
        // Closing the window ends the stream, which frees the camera.
        Bind(wxEVT_CLOSE_WINDOW, [this](wxCloseEvent& evt) {
            if (IsFullScreen())
                ShowFullScreen(false); // otherwise the menu bar and Dock stay hidden
            s_open = nullptr;
            evt.Skip();
        });
    }

    void send(const json& message)
    {
        WebView::RunScript(m_view, wxString::FromUTF8("window.fromApp(" + message.dump(-1, ' ', true, json::error_handler_t::replace) + ")"));
    }

    static inline FlashforgeCameraWindow* s_open{nullptr};
    wxWebView*                            m_view{nullptr};
    std::string                           m_url;
    wxPoint                               m_grab_position;
    wxSize                                m_grab_size;
};

// Elslicer: feeds resources/web/elslicer/device.html, which polls with "refresh".
class FlashforgeDeviceHandler : public PrinterWebViewHandler
{
public:
    using PrinterWebViewHandler::PrinterWebViewHandler;
    ~FlashforgeDeviceHandler() override
    {
        *m_alive = false;
        if (s_shown == this)
            s_shown = nullptr;
    }

    // Plays the camera on this page again, once its own window has let go of it.
    static void resume_camera()
    {
        wxGetApp().mainframe->request_select_tab(TAB_ID_MONITOR);
        if (s_shown != nullptr)
            s_shown->send({{"type", "resume_camera"}});
    }

    // The camera takes one viewer at a time, so a photo needs this page to let go of it.
    static void stop_camera()
    {
        if (s_shown != nullptr)
            s_shown->send({{"type", "stop_camera"}});
    }

    void on_script_message(wxWebViewEvent& evt) override
    {
        const json message = json::parse(evt.GetString().ToUTF8().data(), nullptr, false);
        if (message.is_discarded())
            return;
        const std::string cmd = json_string(message, "cmd");
        if (cmd == "refresh")
            refresh();
        else if (cmd == "connection")
            wxGetApp().CallAfter([] {
                PhysicalPrinterDialog dlg(wxGetApp().mainframe);
                dlg.ShowModal();
            });
        else if (cmd == "camera_window")
        {
            FlashforgeCameraWindow::s_on_back = &FlashforgeDeviceHandler::resume_camera;
            FlashforgeCameraWindow::show(json_string(message, "url"));
        }
        else if (cmd == "control")
            control(message);
    }

private:
    // One at a time, since the bridge would answer a second request with the first one's reply.
    // The page holds its buttons until it hears back.
    void control(const json& message)
    {
        // What the Creator 5 acts on. It also says Success to commands it ignores, such as moving an axis.
        static const std::set<std::string> commands = {"lightControl_cmd", "jobCtl_cmd",   "printerCtl_cmd",  "temperatureCtl_cmd", "stateCtrl_cmd",
                                                       "msConfig_cmd",     "reName_cmd",   "delayClose_cmd",  "calibration_cmd"};
        const std::string                  command  = json_string(message, "command");
        DynamicPrintConfig*                config   = get_active_printer_config();
        const auto answer = [this](bool ok, const std::string& error) { send({{"type", "control"}, {"ok", ok}, {"error", error}}); };
        if (config == nullptr || commands.count(command) == 0 || !message.contains("args")) {
            answer(false, "the app can't send that");
            return;
        }
        if (command == "jobCtl_cmd" && message["args"].value("action", "") == "pause")
            journal_expect_pause();
        send_flashforge_control(config->opt_string("print_host"), config->opt_string("flashforge_serial_number"), config->opt_string("printhost_apikey"), command,
                                message["args"], [answer, alive = m_alive](bool ok, const std::string&, const std::string& error) {
                                    if (*alive)
                                        answer(ok, error);
                                });
    }

    void send(const json& message)
    {
        WebView::RunScript(browser(), wxString::FromUTF8("window.fromApp(" + message.dump(-1, ' ', true, json::error_handler_t::replace) + ")"));
    }

    void refresh()
    {
        s_shown = this;
        DynamicPrintConfig* config = get_active_printer_config();
        if (config == nullptr)
            return;

        const bool shown    = owner().IsShownOnScreen();
        const bool has_code = !config->opt_string("printhost_apikey").empty() && !config->opt_string("flashforge_serial_number").empty();
        send({{"type", "state"}, {"shown", shown}, {"host", config->opt_string("print_host")}, {"has_code", has_code}, {"camera_window", FlashforgeCameraWindow::is_open()}});
        if (!shown || !has_code || m_busy)
            return;

        m_busy = true;
        read_flashforge_details(config->opt_string("print_host"), config->opt_string("flashforge_serial_number"), config->opt_string("printhost_apikey"),
                                [this, alive = m_alive](bool ok, const std::string& body, const std::string& error) {
                                    if (!*alive)
                                        return;
                                    m_busy = false;
                                    json reply = {{"type", "detail"}, {"ok", ok}, {"error", error}};
                                    if (ok) {
                                        const json parsed = json::parse(body, nullptr, false);
                                        reply["detail"]   = parsed.is_object() && parsed.contains("detail") ? parsed["detail"] : parsed;
                                    }
                                    send(reply);
                                });
    }

    static inline FlashforgeDeviceHandler* s_shown{nullptr};
    bool                  m_busy{false};
    std::shared_ptr<bool> m_alive{std::make_shared<bool>(true)};
};

// Elslicer: takes one picture from the camera's stream in a hidden web view. The camera has no
// single-picture address, but it allows other origins, so a canvas may read a frame of the stream.
// Anyone watching is stopped first, and a camera window comes back afterwards.
class FlashforgePhoto
{
public:
    using Done = std::function<void(bool, const std::string&, const std::string&)>;

    void take(const std::string& host, Done done)
    {
        if (m_done) {
            done(false, "", "a photo is already being taken");
            return;
        }
        m_done     = std::move(done);
        m_host     = host;
        m_attempt  = 0;
        m_reopen   = FlashforgeCameraWindow::close_for_photo();
        FlashforgeDeviceHandler::stop_camera();
        if (m_view == nullptr) {
            m_view = WebView::CreateWebView(wxGetApp().mainframe, "about:blank");
            m_view->Hide();
            m_view->Bind(wxEVT_WEBVIEW_SCRIPT_MESSAGE_RECEIVED, [this](wxWebViewEvent& evt) { on_message(evt.GetString().ToUTF8().data()); });
            m_timer.Bind(wxEVT_TIMER, [this](wxTimerEvent&) { on_timer(); });
        }
        // The camera refuses for a moment after a viewer leaves.
        m_timer.StartOnce(3000);
    }

private:
    static constexpr int ATTEMPTS = 6;

    void on_timer()
    {
        const std::string script = R"JS(
            (() => {
              const reply = message => (window.wx || webkit.messageHandlers.wx).postMessage(JSON.stringify(message));
              const image = new Image();
              image.crossOrigin = 'anonymous';
              image.onerror = () => reply({ok: false});
              let tries = 0;
              const grab = () => {
                if (!image.naturalWidth) {
                  if (++tries < 16) setTimeout(grab, 500); else reply({ok: false});
                  return;
                }
                const canvas = document.createElement('canvas');
                canvas.width = image.naturalWidth;
                canvas.height = image.naturalHeight;
                canvas.getContext('2d').drawImage(image, 0, 0);
                image.src = '';
                reply({ok: true, jpeg: canvas.toDataURL('image/jpeg', 0.92).split(',')[1]});
              };
              image.src = )JS" + json("http://" + m_host + ":8080/?action=stream").dump() + R"JS(;
              grab();
            })();
        )JS";
        WebView::RunScript(m_view, wxString::FromUTF8(script));
    }

    void on_message(const std::string& text)
    {
        if (!m_done)
            return;
        const json reply = json::parse(text, nullptr, false);
        if (reply.is_object() && reply.value("ok", false)) {
            finish(true, reply.value("jpeg", ""), "");
        } else if (++m_attempt < ATTEMPTS) {
            m_view->LoadURL("about:blank");
            m_timer.StartOnce(10000);
        } else {
            finish(false, "", "the camera didn't give a picture");
        }
    }

    void finish(bool ok, const std::string& jpeg, const std::string& error)
    {
        m_view->LoadURL("about:blank"); // frees the camera
        Done done = std::move(m_done);
        m_done    = nullptr;
        if (!m_reopen.empty()) {
            const std::string url = m_reopen;
            wxGetApp().CallAfter([url] { FlashforgeCameraWindow::show(url); });
        }
        done(ok, jpeg, error);
    }

    wxWebView*  m_view{nullptr};
    wxTimer     m_timer;
    int         m_attempt{0};
    std::string m_host;
    std::string m_reopen;
    Done        m_done;
};

} // namespace

std::unique_ptr<PrinterWebViewHandler> create_printer_webview_handler(PrinterWebView& owner)
{
    auto     cfg = get_active_printer_config();
    if(cfg == nullptr) return nullptr;
    
    const auto host_type = cfg->option<ConfigOptionEnum<PrintHostType>>("host_type")->value;
    switch (host_type)
    {
        case PrintHostType::htElegooLink:
            return std::make_unique<ElegooPrinterWebViewHandler>(owner);
        case PrintHostType::htFlashforge:
            return std::make_unique<FlashforgeDeviceHandler>(owner);
        default:
            return nullptr;
    }
}

static std::string flashforge_host_name(std::string host)
{
    if (const auto scheme = host.find("://"); scheme != std::string::npos)
        host = host.substr(scheme + 3);
    return host.substr(0, host.find_first_of(":/"));
}

static void send_flashforge_control(const std::string& print_host, const std::string& serial, const std::string& code, const std::string& command, const json& args,
                                    std::function<void(bool, const std::string&, const std::string&)> done)
{
    static FlashforgeWebBridge bridge("/control");
    bridge.request(flashforge_host_name(print_host), json{{"serialNumber", serial}, {"checkCode", code}, {"payload", {{"cmd", command}, {"args", args}}}}.dump(),
                   std::move(done));
}

void read_flashforge_details(const std::string& print_host, const std::string& serial, const std::string& code,
                             std::function<void(bool, const std::string&, const std::string&)> done)
{
    static FlashforgeWebBridge bridge("/detail");
    bridge.request(flashforge_host_name(print_host), json{{"serialNumber", serial}, {"checkCode", code}}.dump(), std::move(done));
}

void capture_flashforge_photo(const std::string& print_host, std::function<void(bool ok, const std::string& jpeg_base64, const std::string& error)> done)
{
    static auto* photo = new FlashforgePhoto();
    photo->take(flashforge_host_name(print_host), std::move(done));
}

// Runs a request that answers on the main thread, and waits up to 15 seconds for it.
static bool wait_for_flashforge(std::function<void(std::function<void(bool, const std::string&, const std::string&)>)> request,
                                std::string& body, std::string& error)
{
    struct State
    {
        std::mutex              mutex;
        std::condition_variable changed;
        bool                    finished{false};
        bool                    ok{false};
        std::string             body;
        std::string             error;
        wxEventLoopBase*        loop{nullptr};
    };
    auto state = std::make_shared<State>();
    auto start = [=] {
        request([state](bool ok, const std::string& reply, const std::string& problem) {
            std::lock_guard<std::mutex> lock(state->mutex);
            state->finished = true;
            state->ok       = ok;
            state->body     = reply;
            state->error    = problem;
            state->changed.notify_all();
            if (state->loop != nullptr && state->loop->IsRunning())
                state->loop->Exit();
        });
    };

    bool answered = false;
    if (wxIsMainThread()) {
        wxGUIEventLoop loop;
        state->loop = &loop;
        start();
        if (!state->finished) {
            wxTimer timer;
            timer.Bind(wxEVT_TIMER, [&loop](wxTimerEvent&) {
                if (loop.IsRunning())
                    loop.Exit();
            });
            timer.StartOnce(15000);
            loop.Run();
        }
        std::lock_guard<std::mutex> lock(state->mutex);
        state->loop = nullptr;
        answered    = state->finished;
    } else {
        wxGetApp().CallAfter(start);
        std::unique_lock<std::mutex> lock(state->mutex);
        answered = state->changed.wait_for(lock, std::chrono::seconds(15), [&state] { return state->finished; });
    }

    std::lock_guard<std::mutex> lock(state->mutex);
    if (!answered) {
        error = "the printer didn't answer";
        return false;
    }
    body  = state->body;
    error = state->error;
    return state->ok;
}

bool read_flashforge_details_sync(const std::string& print_host, const std::string& serial, const std::string& code,
                                  std::string& body, std::string& error)
{
    return wait_for_flashforge([=](auto done) { read_flashforge_details(print_host, serial, code, std::move(done)); }, body, error);
}

bool send_flashforge_control_sync(const std::string& print_host, const std::string& serial, const std::string& code,
                                  const std::string& command, const nlohmann::json& args, std::string& body, std::string& error)
{
    return wait_for_flashforge([=](auto done) { send_flashforge_control(print_host, serial, code, command, args, std::move(done)); }, body, error);
}

namespace {

struct FlashforgeUploadState
{
    std::mutex              mutex;
    std::condition_variable changed;
    bool                    finished{false};
    bool                    ok{false};
    std::string             body;
    std::string             error;
    size_t                  sent{0};
    size_t                  total{0};
};

// Lives on the main thread. Loads the file into a hidden page on the printer's own address piece
// by piece, then lets that page post it. Deletes itself when it's done.
class FlashforgeWebUpload
{
public:
    FlashforgeWebUpload(std::string host, std::vector<std::pair<std::string, std::string>> headers, const std::string& path, std::string filename,
                        std::shared_ptr<FlashforgeUploadState> state)
        : m_headers(std::move(headers)), m_file(path, std::ios::binary), m_filename(std::move(filename)), m_state(std::move(state))
    {
        m_view = WebView::CreateWebView(wxGetApp().mainframe, "");
        m_view->Hide();
        m_view->Bind(wxEVT_WEBVIEW_LOADED, [this](wxWebViewEvent& evt) {
            if (m_started || evt.GetURL().IsEmpty() || evt.GetURL() == "about:blank")
                return;
            m_started = true;
            run("window.ffParts=[];window.wx.postMessage(JSON.stringify({a:'next'}));");
        });
        m_view->Bind(wxEVT_WEBVIEW_ERROR, [this](wxWebViewEvent&) {
            if (!m_started)
                finish(false, "", "the printer didn't answer");
        });
        m_view->Bind(wxEVT_WEBVIEW_SCRIPT_MESSAGE_RECEIVED, [this](wxWebViewEvent& evt) { on_message(evt.GetString().ToUTF8().data()); });
        if (!m_file)
            wxGetApp().CallAfter([this] { finish(false, "", "the sliced file couldn't be read"); });
        else
            m_view->LoadURL(wxString::FromUTF8("http://" + host + ":8898/"));
    }

    void cancel()
    {
        m_cancelled = true;
        run("if(window.ffXhr)window.ffXhr.abort();");
    }

private:
    void run(const std::string& script) { WebView::RunScript(m_view, wxString::FromUTF8(script)); }

    void on_message(const std::string& text)
    {
        const json message = json::parse(text, nullptr, false);
        if (message.is_discarded() || m_finished)
            return;
        const std::string action = message.value("a", "");
        if (m_cancelled && action == "next")
            finish(false, "", "cancelled");
        else if (action == "next")
            next_piece();
        else if (action == "progress") {
            std::lock_guard<std::mutex> lock(m_state->mutex);
            m_state->sent  = message.value("sent", size_t(0));
            m_state->total = message.value("total", size_t(0));
        } else if (action == "done")
            finish(true, message.value("body", ""), "");
        else if (action == "failed")
            finish(false, "", m_cancelled ? "cancelled" : "the printer stopped answering while the file was being sent");
    }

    void next_piece()
    {
        std::string piece(1 << 20, '\0');
        m_file.read(piece.data(), std::streamsize(piece.size()));
        piece.resize(size_t(m_file.gcount()));
        if (piece.empty()) {
            post_file();
            return;
        }
        std::string encoded(boost::beast::detail::base64::encoded_size(piece.size()), '\0');
        encoded.resize(boost::beast::detail::base64::encode(encoded.data(), piece.data(), piece.size()));
        run("window.ffParts.push(Uint8Array.from(atob('" + encoded + "'),c=>c.charCodeAt(0)));window.wx.postMessage(JSON.stringify({a:'next'}));");
    }

    void post_file()
    {
        std::string set_headers;
        for (const auto& [name, value] : m_headers)
            set_headers += "x.setRequestHeader(" + json(name).dump() + "," + json(value).dump() + ");";
        run("const post=m=>window.wx.postMessage(JSON.stringify(m));"
            "const x=new XMLHttpRequest();window.ffXhr=x;x.open('POST','/uploadGcode');x.timeout=1800000;" + set_headers +
            "x.upload.onprogress=e=>post({a:'progress',sent:e.loaded,total:e.total});"
            "x.onload=()=>post({a:'done',body:x.responseText});"
            "x.onerror=x.onabort=x.ontimeout=()=>post({a:'failed'});"
            "const f=new FormData();f.append('gcodeFile',new Blob(window.ffParts)," + json(m_filename).dump() + ");x.send(f);");
    }

    void finish(bool ok, const std::string& body, const std::string& error)
    {
        m_finished = true;
        {
            std::lock_guard<std::mutex> lock(m_state->mutex);
            m_state->finished = true;
            m_state->ok       = ok;
            m_state->body     = body;
            m_state->error    = error;
        }
        m_state->changed.notify_all();
        wxGetApp().CallAfter([this] {
            m_view->Destroy();
            delete this;
        });
    }

    wxWebView*                                       m_view{nullptr};
    std::vector<std::pair<std::string, std::string>> m_headers;
    boost::nowide::ifstream                          m_file;
    std::string                                      m_filename;
    std::shared_ptr<FlashforgeUploadState>           m_state;
    bool                                             m_started{false};
    bool                                             m_finished{false};
    bool                                             m_cancelled{false};
};

} // namespace

bool upload_flashforge_file(const std::string& print_host, const std::vector<std::pair<std::string, std::string>>& headers,
                            const std::string& path, const std::string& filename, std::function<bool(size_t, size_t)> progress,
                            std::string& body, std::string& error)
{
    auto state = std::make_shared<FlashforgeUploadState>();
    auto holder = std::make_shared<FlashforgeWebUpload*>(nullptr);
    wxGetApp().CallAfter([=] { *holder = new FlashforgeWebUpload(flashforge_host_name(print_host), headers, path, filename, state); });

    std::unique_lock<std::mutex> lock(state->mutex);
    bool cancel_sent = false;
    while (!state->changed.wait_for(lock, std::chrono::milliseconds(200), [&state] { return state->finished; })) {
        const size_t sent = state->sent, total = state->total;
        lock.unlock();
        const bool cancel = progress(sent, total);
        if (cancel && !cancel_sent) {
            cancel_sent = true;
            wxGetApp().CallAfter([=] {
                std::lock_guard<std::mutex> guard(state->mutex);
                if (!state->finished && *holder != nullptr)
                    (*holder)->cancel();
            });
        }
        lock.lock();
    }
    body  = state->body;
    error = state->error;
    return state->ok;
}

} // GUI
} // Slic3r