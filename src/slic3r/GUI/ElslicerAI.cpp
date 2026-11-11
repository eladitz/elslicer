#include "ElslicerAI.hpp"

#include "GUI.hpp"
#include "GUI_App.hpp"
#include "libslic3r/AppConfig.hpp"
#include "libslic3r/Utils.hpp"
#include "slic3r/Utils/Http.hpp"

#include <boost/filesystem.hpp>
#include <boost/nowide/fstream.hpp>
#include <wx/secretstore.h>
#include <wx/stdpaths.h>

#include <algorithm>
#include <cstdio>
#include <memory>
#include <thread>

namespace Slic3r { namespace GUI { namespace AI {

namespace {

struct ClaudeModel
{
    const char *id;
    const char *label;
    double      input_per_million;
    double      output_per_million;
    bool        server_fallback;
};

const ClaudeModel CLAUDE_MODELS[] = {
    {"claude-opus-5-5", "Opus 5.5 (best)", 4., 20., true},
    {"claude-sonnet-5-5", "Sonnet 5.5 (cheaper)", 2., 10., true},
    {"claude-haiku-5-5", "Haiku 5.5 (cheapest)", 0.1, 0.5, false},
};

const ClaudeModel *claude_model(const std::string &id)
{
    for (const ClaudeModel &model : CLAUDE_MODELS)
        if (id == model.id)
            return &model;
    return nullptr;
}

const char *const CUSTOM = "custom";

// The Anthropic key keeps the name it had before other services were added, so a saved key still works.
std::string secret_service(const std::string &provider)
{
    return provider == "anthropic" ? std::string("Elslicer/AnthropicApiKey") : "Elslicer/" + provider + "ApiKey";
}

std::string section(const std::string &task) { return "elslicer_ai_" + task; }

std::string error_message(const json &parsed)
{
    // OpenAI and Anthropic write {"error": {"message"}}; Gemini writes a list of those.
    const json &first = parsed.is_array() && !parsed.empty() ? parsed[0] : parsed;
    if (first.is_object() && first.contains("error")) {
        const json &error = first["error"];
        if (error.is_object())
            return error.value("message", std::string());
        if (error.is_string())
            return error.get<std::string>();
    }
    return {};
}

Reply http_error(const Provider &provider, const std::string &response, const std::string &error, unsigned status)
{
    Reply reply;
    reply.error = "Couldn't reach " + provider.label + ": " + error;
    const json parsed = json::parse(response, nullptr, false);
    const std::string said = error_message(parsed);
    if (status == 401 || status == 403) {
        reply.error   = provider.label + " refused the API key. Check it and save it again.";
        reply.bad_key = true;
    } else if (status == 429) {
        reply.error = provider.label + " says too many requests, or the free allowance is used up. Wait and try again." + (said.empty() ? "" : " (" + said + ")");
    } else if (status == 400 && response.find("credit") != std::string::npos) {
        reply.error = "This " + provider.label + " API key has no credit left.";
    } else if (status == 404 && !said.empty()) {
        reply.error = provider.label + ": " + said + " Check the model name.";
    } else if (!said.empty()) {
        reply.error = provider.label + ": " + said;
    } else if (status == 0 && provider.local) {
        reply.error = provider.label + " isn't running. Start it and try again.";
    }
    return reply;
}

std::string helper_path()
{
    return (boost::filesystem::path(into_u8(wxStandardPaths::Get().GetExecutablePath())).parent_path() / "elai-local").string();
}

std::string shell_quote(const std::string &text)
{
    std::string out = "'";
    for (char c : text)
        out += c == '\'' ? std::string("'\\''") : std::string(1, c);
    return out + "'";
}

} // namespace

const std::vector<Provider> &providers()
{
    static const std::vector<Provider> list = {
        {"apple", "Apple, on this Mac", Kind::Apple, "", false, true, "Free and private: runs on this Mac, nothing is sent anywhere. Needs Apple Intelligence on."},
        {"anthropic", "Claude (Anthropic)", Kind::Anthropic, "https://api.anthropic.com/v1", true, false, "Billed to your Anthropic API key, separately from a Claude subscription."},
        {"openai", "OpenAI", Kind::OpenAI, "https://api.openai.com/v1", true, false, "Billed to your OpenAI API key."},
        {"gemini", "Google Gemini", Kind::OpenAI, "https://generativelanguage.googleapis.com/v1beta/openai", true, false, "Free tier with a daily limit, using a key from Google AI Studio."},
        {"groq", "Groq", Kind::OpenAI, "https://api.groq.com/openai/v1", true, false, "Free tier with a daily limit, using a key from console.groq.com."},
        {"openrouter", "OpenRouter", Kind::OpenAI, "https://openrouter.ai/api/v1", true, false, "Many models; those ending in :free cost nothing, with a daily limit."},
        {"mistral", "Mistral", Kind::OpenAI, "https://api.mistral.ai/v1", true, false, "Free tier with limits, using a key from console.mistral.ai."},
        {"ollama", "Ollama, on this Mac", Kind::OpenAI, "http://localhost:11434/v1", false, true, "Free and private: runs models you download with Ollama."},
        {"lmstudio", "LM Studio, on this Mac", Kind::OpenAI, "http://localhost:1234/v1", false, true, "Free and private: runs models you load in LM Studio."},
        {CUSTOM, "Other (OpenAI-compatible)", Kind::OpenAI, "", false, false, "Any service with an OpenAI-compatible chat completions API."},
    };
    return list;
}

const Provider *find_provider(const std::string &id)
{
    for (const Provider &provider : providers())
        if (provider.id == id)
            return &provider;
    return nullptr;
}

Choice choice(const std::string &task)
{
    const AppConfig *config = wxGetApp().app_config;
    Choice out{config->get(section(task), "provider"), config->get(section(task), "model"), config->get(section(task), "base_url")};
    if (out.provider.empty()) {
        // Elai starts on the free model; AI setup keeps using Claude, as before.
        out.provider = task == "elai" ? "apple" : "anthropic";
        out.model    = task == "elai" ? "on-device" : CLAUDE_MODELS[0].id;
    }
    return out;
}

void set_choice(const std::string &task, const Choice &value)
{
    AppConfig *config = wxGetApp().app_config;
    config->set(section(task), "provider", value.provider);
    config->set(section(task), "model", value.model);
    config->set(section(task), "base_url", value.base_url);
}

bool usable(const std::string &task)
{
    const Choice    now      = choice(task);
    const Provider *provider = find_provider(now.provider);
    if (provider == nullptr || (task != "elai" && provider->kind == Kind::Apple))
        return false;
    if (provider->kind == Kind::Apple)
        return true;
    if (now.model.empty() || (provider->id == CUSTOM && now.base_url.empty()))
        return false;
    return !provider->needs_key || !load_key(provider->id).empty();
}

std::string provider_label(const std::string &task)
{
    const Provider *provider = find_provider(choice(task).provider);
    return provider != nullptr ? provider->label : std::string("the AI");
}

std::string load_key(const std::string &provider)
{
    wxSecretStore store = wxSecretStore::GetDefault();
    wxString      user;
    wxSecretValue secret;
    if (store.IsOk() && store.Load(secret_service(provider), user, secret) && secret.IsOk())
        return std::string(static_cast<const char *>(secret.GetData()), secret.GetSize());
    return {};
}

bool save_key(const std::string &provider, const std::string &key)
{
    wxSecretStore store = wxSecretStore::GetDefault();
    return store.IsOk() && store.Save(secret_service(provider), "api-key", wxSecretValue(key.size(), key.data()));
}

void forget_key(const std::string &provider)
{
    wxSecretStore store = wxSecretStore::GetDefault();
    if (store.IsOk())
        store.Delete(secret_service(provider));
}

json to_openai(const Request &request, const std::string &model)
{
    json messages = json::array();
    if (!request.system.empty())
        messages.push_back({{"role", "system"}, {"content", request.system}});
    for (const json &message : request.messages) {
        const std::string role = message.value("role", "user");
        if (message["content"].is_string()) {
            messages.push_back({{"role", role}, {"content", message["content"]}});
            continue;
        }
        if (role == "assistant") {
            std::string text;
            json        calls = json::array();
            for (const json &block : message["content"]) {
                const std::string type = block.value("type", "");
                if (type == "text")
                    text += block.value("text", "");
                else if (type == "tool_use")
                    calls.push_back({{"id", block.value("id", "")}, {"type", "function"},
                                     {"function", {{"name", block.value("name", "")}, {"arguments", block.value("input", json::object()).dump()}}}});
                // Thinking blocks are Claude's own and mean nothing to another service.
            }
            json out = {{"role", "assistant"}, {"content", text}};
            if (!calls.empty())
                out["tool_calls"] = calls;
            messages.push_back(out);
            continue;
        }
        // A user turn: tool results become their own messages, before the rest of what the user said.
        json parts = json::array();
        for (const json &block : message["content"]) {
            const std::string type = block.value("type", "");
            if (type == "tool_result") {
                std::string text;
                if (block["content"].is_string())
                    text = block["content"].get<std::string>();
                else
                    for (const json &part : block.value("content", json::array()))
                        text += part.value("text", "");
                messages.push_back({{"role", "tool"}, {"tool_call_id", block.value("tool_use_id", "")}, {"content", text}});
            } else if (type == "text") {
                parts.push_back({{"type", "text"}, {"text", block.value("text", "")}});
            } else if (type == "image") {
                const json &source = block["source"];
                parts.push_back({{"type", "image_url"},
                                 {"image_url", {{"url", "data:" + source.value("media_type", "image/jpeg") + ";base64," + source.value("data", "")}}}});
            }
        }
        if (!parts.empty())
            messages.push_back({{"role", "user"}, {"content", parts}});
    }
    json body = {{"model", model}, {"messages", messages}};
    if (!request.tools.empty()) {
        json tools = json::array();
        for (const json &tool : request.tools)
            tools.push_back({{"type", "function"},
                             {"function", {{"name", tool.value("name", "")}, {"description", tool.value("description", "")},
                                           {"parameters", tool.value("input_schema", json::object())}}}});
        body["tools"] = tools;
    }
    return body;
}

Reply from_openai(const json &response)
{
    Reply reply;
    if (!response.is_object() || !response.contains("choices") || !response["choices"].is_array() || response["choices"].empty()) {
        reply.error = error_message(response);
        if (reply.error.empty())
            reply.error = "The AI sent a reply this version can't read.";
        return reply;
    }
    const json &first   = response["choices"][0];
    const json &message = first.contains("message") ? first["message"] : json::object();
    if (message.contains("content") && message["content"].is_string() && !message["content"].get<std::string>().empty())
        reply.content.push_back({{"type", "text"}, {"text", message["content"]}});
    for (const json &call : message.value("tool_calls", json::array())) {
        const json &function = call.contains("function") ? call["function"] : json::object();
        json input = json::object();
        if (function.contains("arguments")) {
            if (function["arguments"].is_string())
                input = json::parse(function["arguments"].get<std::string>(), nullptr, false);
            else
                input = function["arguments"];
        }
        if (input.is_discarded() || !input.is_object()) {
            reply.error = "The AI sent settings this version can't read.";
            return reply;
        }
        reply.content.push_back({{"type", "tool_use"}, {"id", call.value("id", "call")}, {"name", function.value("name", "")}, {"input", input}});
    }
    const std::string finish = first.value("finish_reason", "");
    reply.stop = finish == "length" ? "max_tokens" : finish == "content_filter" ? "refusal" : finish == "tool_calls" ? "tool_use" : "end_turn";
    reply.ok   = true;
    return reply;
}

void chat(const Choice &choice, const Request &request, std::function<void(const Reply &)> done)
{
    const Provider *found = find_provider(choice.provider);
    if (found == nullptr || found->kind == Kind::Apple) {
        Reply reply;
        reply.error = "Choose an AI service first.";
        done(reply);
        return;
    }
    const Provider provider = *found;
    const std::string key = load_key(provider.id);
    if (provider.needs_key && key.empty()) {
        Reply reply;
        reply.error   = "No API key saved for " + provider.label + ".";
        reply.bad_key = true;
        done(reply);
        return;
    }

    json body;
    std::string url;
    std::vector<std::pair<std::string, std::string>> headers;
    const ClaudeModel *claude = nullptr;
    if (provider.kind == Kind::Anthropic) {
        claude = claude_model(choice.model);
        body   = {{"model", choice.model}, {"max_tokens", request.max_tokens}, {"messages", request.messages}};
        if (!request.system.empty())
            body["system"] = request.system;
        if (!request.tools.empty()) {
            body["tools"]       = request.tools;
            body["tool_choice"] = {{"type", "auto"}, {"disable_parallel_tool_use", true}};
        }
        if (!request.effort.empty())
            body["output_config"] = {{"effort", request.effort}};
        url = provider.base_url + "/messages";
        headers = {{"x-api-key", key}, {"anthropic-version", "2026-10-21"}};
        if (claude != nullptr && claude->server_fallback) {
            body["fallbacks"] = "default";
            headers.emplace_back("anthropic-beta", "server-side-fallback-2026-07-01");
        }
    } else {
        std::string base = provider.id == CUSTOM ? choice.base_url : provider.base_url;
        while (!base.empty() && base.back() == '/')
            base.pop_back();
        body = to_openai(request, choice.model);
        url  = base + "/chat/completions";
        if (!key.empty())
            headers.emplace_back("Authorization", "Bearer " + key);
    }
    auto http = Http::post(url);
    for (const auto &[name, value] : headers)
        http.header(name, value);
    http.header("content-type", "application/json");
    http.set_post_body(body.dump(-1, ' ', false, json::error_handler_t::replace))
        .timeout_max(request.timeout_s)
        .on_complete([provider, claude, done](std::string response, unsigned) {
            wxGetApp().CallAfter([provider, claude, done, response] {
                const json parsed = json::parse(response, nullptr, false);
                if (provider.kind != Kind::Anthropic) {
                    done(from_openai(parsed));
                    return;
                }
                Reply reply;
                if (!parsed.is_object() || !parsed.contains("content")) {
                    reply.error = "Claude sent a reply this version can't read.";
                    done(reply);
                    return;
                }
                reply.ok      = true;
                // Kept exactly as received: the API requires its thinking blocks back unchanged.
                reply.content = parsed["content"];
                reply.stop    = parsed.value("stop_reason", "");
                if (claude != nullptr && parsed.contains("usage")) {
                    reply.cost = parsed["usage"].value("input_tokens", 0) * claude->input_per_million / 1e6 +
                                 parsed["usage"].value("output_tokens", 0) * claude->output_per_million / 1e6;
                    reply.cost_known = true;
                }
                done(reply);
            });
        })
        .on_error([provider, done](std::string response, std::string error, unsigned status) {
            wxGetApp().CallAfter([provider, done, response, error, status] { done(http_error(provider, response, error, status)); });
        })
        .perform();
}

void ask_apple(const json &request, std::function<void(const json &)> done)
{
#ifdef __APPLE__
    const std::string helper = helper_path();
    if (!boost::filesystem::exists(helper)) {
        done({{"ok", false}, {"reason", "This build doesn't include the on-device helper."}});
        return;
    }
    // The request goes in a file, so the helper's stdin isn't needed and nothing large passes through the shell.
    const boost::filesystem::path file = boost::filesystem::temp_directory_path() / boost::filesystem::unique_path("elai-%%%%%%%%.json");
    boost::nowide::ofstream(file.string()) << request.dump(-1, ' ', false, json::error_handler_t::replace);
    std::thread([helper, file, done]() {
        std::string output;
        if (FILE *pipe = popen((shell_quote(helper) + " < " + shell_quote(file.string())).c_str(), "r")) {
            char buffer[4096];
            size_t read = 0;
            while ((read = fread(buffer, 1, sizeof(buffer), pipe)) > 0)
                output.append(buffer, read);
            pclose(pipe);
        }
        boost::system::error_code ignored;
        boost::filesystem::remove(file, ignored);
        json reply = json::parse(output, nullptr, false);
        if (!reply.is_object())
            reply = {{"ok", false}, {"reason", "The on-device helper didn't answer."}};
        wxGetApp().CallAfter([done, reply] { done(reply); });
    }).detach();
#else
    done({{"ok", false}, {"reason", "Apple's on-device model is only on macOS."}});
#endif
}

void ask_elai(const json &request, std::function<void(const json &)> done)
{
    const Choice now = choice("elai");
    const Provider *provider = find_provider(now.provider);
    if (provider != nullptr && provider->kind == Kind::Apple) {
        json ask = request;
        ask["cmd"] = "pick";
        ask_apple(ask, done);
        return;
    }
    // The same choice Apple's model makes, asked for as a tool call limited to the offered ids.
    json choices = request.value("choices", json::array());
    choices.push_back("none");
    const json tool = {{"name", "pick"},
                       {"description", "Choose the reference item that answers the user's latest message."},
                       {"input_schema",
                        {{"type", "object"},
                         {"properties", {{"best", {{"type", "string"}, {"enum", choices}, {"description", "The id that answers the latest message, or none"}}}}},
                         {"required", {"best"}}}}};
    Request ask;
    ask.system     = request.value("instructions", "") + " Reply by calling the pick tool.";
    ask.messages   = json::array({{{"role", "user"}, {"content", request.value("prompt", "")}}});
    ask.tools      = json::array({tool});
    ask.max_tokens = 4000;
    ask.timeout_s  = 60;
    chat(now, ask, [done](const Reply &reply) {
        if (!reply.ok) {
            done({{"ok", false}, {"reason", reply.error}});
            return;
        }
        for (const json &block : reply.content)
            if (block.value("type", "") == "tool_use" && block.contains("input") && block["input"].is_object()) {
                done({{"ok", true}, {"pick", block["input"].value("best", "none")}});
                return;
            }
        done({{"ok", false}, {"reason", "The AI didn't choose an answer."}});
    });
}

json settings_message(const std::string &task)
{
    const Choice now = choice(task);
    json list = json::array();
    for (const Provider &provider : providers()) {
        if (task != "elai" && provider.kind == Kind::Apple)
            continue;
        json models = json::array();
        if (provider.kind == Kind::Anthropic)
            for (const ClaudeModel &model : CLAUDE_MODELS)
                models.push_back({{"id", model.id}, {"label", model.label}});
        list.push_back({{"id", provider.id},
                        {"label", provider.label},
                        {"kind", provider.kind == Kind::Apple ? "apple" : provider.kind == Kind::Anthropic ? "anthropic" : "openai"},
                        {"needs_key", provider.needs_key},
                        {"has_key", !load_key(provider.id).empty()},
                        {"local", provider.local},
                        {"custom_url", provider.id == CUSTOM},
                        {"models", models},
                        {"note", provider.note}});
    }
    return {{"type", "ai_settings"},
            {"task", task},
            {"providers", list},
            {"choice", {{"provider", now.provider}, {"model", now.model}, {"base_url", now.base_url}}},
            {"usable", usable(task)}};
}

bool handle_settings_message(const std::string &task, const std::string &cmd, const json &data, std::function<void(const json &)> send)
{
    if (cmd == "ai_settings") {
        send(settings_message(task));
    } else if (cmd == "ai_save") {
        const std::string provider = data.value("provider", "");
        if (find_provider(provider) == nullptr)
            return true;
        bool key_ok = true;
        if (const std::string key = data.value("key", ""); !key.empty())
            key_ok = save_key(provider, key);
        set_choice(task, {provider, data.value("model", ""), data.value("base_url", "")});
        json reply = settings_message(task);
        reply["saved"] = key_ok;
        if (!key_ok)
            reply["error"] = "The API key couldn't be saved to the Keychain.";
        send(reply);
    } else if (cmd == "ai_forget_key") {
        forget_key(data.value("provider", ""));
        send(settings_message(task));
    } else if (cmd == "ai_apple_status") {
        ask_apple({{"cmd", "status"}}, [send](const json &reply) { send({{"type", "ai_apple_status"}, {"ok", reply.value("ok", false)}, {"reason", reply.value("reason", "")}}); });
    } else if (cmd == "ai_models") {
        // The models a service offers, so nobody has to type a name it doesn't know.
        const Provider *found = find_provider(data.value("provider", ""));
        if (found == nullptr || found->kind != Kind::OpenAI)
            return true;
        const Provider provider = *found;
        std::string base = provider.id == CUSTOM ? data.value("base_url", "") : provider.base_url;
        while (!base.empty() && base.back() == '/')
            base.pop_back();
        std::string key = data.value("key", "");
        if (key.empty())
            key = load_key(provider.id);
        if (base.empty()) {
            send({{"type", "ai_models"}, {"provider", provider.id}, {"error", "Enter the service's address first."}});
            return true;
        }
        auto http = Http::get(base + "/models");
        if (!key.empty())
            http.header("Authorization", "Bearer " + key);
        http.timeout_max(30)
            .on_complete([provider, send](std::string response, unsigned) {
                wxGetApp().CallAfter([provider, send, response] {
                    const json parsed = json::parse(response, nullptr, false);
                    std::vector<std::string> ids;
                    if (parsed.is_object() && parsed.contains("data") && parsed["data"].is_array())
                        for (const json &model : parsed["data"])
                            if (model.is_object() && model.contains("id") && model["id"].is_string()) {
                                std::string id = model["id"].get<std::string>();
                                // Gemini lists its models as models/<name>.
                                if (id.rfind("models/", 0) == 0)
                                    id = id.substr(7);
                                ids.push_back(id);
                            }
                    std::sort(ids.begin(), ids.end());
                    if (ids.empty())
                        send({{"type", "ai_models"}, {"provider", provider.id}, {"error", "The service listed no models."}});
                    else
                        send({{"type", "ai_models"}, {"provider", provider.id}, {"models", ids}});
                });
            })
            .on_error([provider, send](std::string response, std::string error, unsigned status) {
                wxGetApp().CallAfter([provider, send, response, error, status] {
                    send({{"type", "ai_models"}, {"provider", provider.id}, {"error", http_error(provider, response, error, status).error}});
                });
            })
            .perform();
    } else {
        return false;
    }
    return true;
}

}}} // namespace Slic3r::GUI::AI
