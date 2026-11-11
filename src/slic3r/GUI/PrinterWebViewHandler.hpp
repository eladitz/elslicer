#ifndef slic3r_PrinterWebViewHandler_hpp_
#define slic3r_PrinterWebViewHandler_hpp_

#include <functional>
#include <memory>
#include <string>
#include <wx/webview.h>
#include <wx/string.h>

#include <nlohmann/json.hpp>

class wxWebViewEvent;

class wxWebView;

namespace Slic3r {
namespace GUI {

class PrinterWebView;

class PrinterWebViewHandler {
public:
    explicit PrinterWebViewHandler(PrinterWebView& owner);
    virtual ~PrinterWebViewHandler();

    virtual void on_loaded(wxWebViewEvent &evt);
    virtual void on_script_message(wxWebViewEvent &evt);

protected:
    PrinterWebView& owner() const;
    wxWebView*      browser() const;

private:
    PrinterWebView& m_owner;
};

std::unique_ptr<PrinterWebViewHandler> create_printer_webview_handler(PrinterWebView& owner);

// Reads a Flashforge printer's details from a hidden web view and calls back on the main thread.
// macOS Local Network permission doesn't apply to web views, and it can drop when the app is
// replaced, so this keeps working without it (Apple TN3179).
void read_flashforge_details(const std::string& print_host, const std::string& serial, const std::string& code,
                             std::function<void(bool ok, const std::string& body, const std::string& error)> done);

// Takes one picture with the printer's camera, stopping anyone watching it for a moment.
void capture_flashforge_photo(const std::string& print_host, std::function<void(bool ok, const std::string& jpeg_base64, const std::string& error)> done);

// The same as read_flashforge_details, waiting for the answer. Runs other events meanwhile if called on the main thread.
bool read_flashforge_details_sync(const std::string& print_host, const std::string& serial, const std::string& code,
                                  std::string& body, std::string& error);

// Sends one /control command, such as stateCtrl_cmd, and waits for the answer, like read_flashforge_details_sync.
// The Creator 5 answers Success to some commands it ignores, so check the next details report for the effect.
bool send_flashforge_control_sync(const std::string& print_host, const std::string& serial, const std::string& code,
                                  const std::string& command, const nlohmann::json& args, std::string& body, std::string& error);

// Sends a file to the printer's /uploadGcode through a web view, which macOS's Local Network
// permission doesn't block, and waits for the answer. Call it from a worker thread.
// progress is called with bytes sent and bytes in all, and returns true to cancel.
bool upload_flashforge_file(const std::string& print_host, const std::vector<std::pair<std::string, std::string>>& headers,
                            const std::string& path, const std::string& filename, std::function<bool(size_t, size_t)> progress,
                            std::string& body, std::string& error);

} // GUI
} // Slic3r

#endif /* slic3r_PrinterWebViewHandler_hpp_ */