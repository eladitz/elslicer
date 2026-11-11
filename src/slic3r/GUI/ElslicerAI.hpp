#pragma once

// The AI services Elslicer's assistants can use, and one way to ask any of them.
//
// Requests and replies are written the way Anthropic's Messages API writes them (system, messages with text,
// image, tool_use and tool_result blocks, tools with input_schema). For an OpenAI-compatible service the request
// is converted to chat completions and the reply back, so callers don't care which service answers.
// Apple's on-device model is reached through the elai-local helper next to the app, and only answers Elai.

#include <functional>
#include <string>
#include <vector>

#include <nlohmann/json.hpp>

namespace Slic3r { namespace GUI { namespace AI {

using json = nlohmann::json;

enum class Kind { Apple, Anthropic, OpenAI };

struct Provider
{
    std::string id;
    std::string label;
    Kind        kind;
    std::string base_url;      // OpenAI-compatible: where /chat/completions and /models are
    bool        needs_key;
    bool        local;         // runs on this Mac: free, and nothing leaves it
    std::string note;          // what it costs, shown under the picker
};

const std::vector<Provider> &providers();
const Provider *find_provider(const std::string &id);

// What one assistant uses. task is "elai", or "setup" for AI setup and photo review.
struct Choice
{
    std::string provider;
    std::string model;
    std::string base_url;      // only for the custom provider
};
Choice choice(const std::string &task);
void   set_choice(const std::string &task, const Choice &choice);
// A choice that can be used now: a known provider, a key if it needs one, a model.
bool   usable(const std::string &task);
std::string provider_label(const std::string &task);

std::string load_key(const std::string &provider);
bool        save_key(const std::string &provider, const std::string &key);
void        forget_key(const std::string &provider);

struct Request
{
    std::string system;
    json        messages = json::array();
    json        tools    = json::array();
    int         max_tokens{16000};
    std::string effort;        // Claude only
    int         timeout_s{300};
};

struct Reply
{
    bool        ok{false};
    std::string error;         // for the user, when !ok
    bool        bad_key{false};
    json        content = json::array();  // Anthropic-shaped blocks: text and tool_use
    std::string stop;          // end_turn, tool_use, max_tokens, refusal
    double      cost{0.};
    bool        cost_known{false};
};

// Calls done on the main thread. The caller checks its own liveness there.
void chat(const Choice &choice, const Request &request, std::function<void(const Reply &)> done);

// Apple's on-device model, for Elai, through the elai-local helper; done gets the helper's reply.
void ask_apple(const json &request, std::function<void(const json &)> done);

// One Elai question with whichever service Elai uses: the AI picks which of the offered answers fits.
// request is {"instructions", "prompt", "choices": [ids]}; done gets {"ok": true, "pick": id or "none"} or {"ok": false, "reason"}.
void ask_elai(const json &request, std::function<void(const json &)> done);

// Pages share one settings panel (ai_provider.js). Returns true if cmd was one of its messages.
// send may be called later, after a network reply, so it must check that its page still exists.
bool handle_settings_message(const std::string &task, const std::string &cmd, const json &data, std::function<void(const json &)> send);
json settings_message(const std::string &task);

// Converters, public so they can be tested without a network.
json to_openai(const Request &request, const std::string &model);
Reply from_openai(const json &response);

}}} // namespace Slic3r::GUI::AI
