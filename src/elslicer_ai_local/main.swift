// elai-local: Apple's on-device model picks which of Elslicer's own answers fits an Elai question. Free, offline,
// nothing leaves the Mac. The model only chooses among the ids it is given, so it can't invent settings or values;
// the answer the user sees is Elslicer's written one.
//
// Reads one JSON request on stdin and writes one JSON reply on stdout.
//   {"cmd": "status"}  ->  {"ok": true} or {"ok": false, "reason": "..."}
//   {"cmd": "pick", "instructions": "...", "prompt": "...", "choices": ["id", ...]}
//       ->  {"ok": true, "pick": "id" or "none"}  or  {"ok": false, "reason": "..."}
// The caller builds the prompt, including the conversation so far and the reference Elai looked up.
import Foundation
import FoundationModels

func write(_ object: [String: Any]) {
    let data = (try? JSONSerialization.data(withJSONObject: object)) ?? Data("{\"ok\":false,\"reason\":\"internal\"}".utf8)
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data("\n".utf8))
}

func unavailableReason() -> String? {
    switch SystemLanguageModel.default.availability {
    case .available:
        return nil
    case .unavailable(.appleIntelligenceNotEnabled):
        return "Apple Intelligence is off. Turn it on in System Settings › Apple Intelligence & Siri."
    case .unavailable(.deviceNotEligible):
        return "This Mac can't run Apple's on-device model."
    case .unavailable(.modelNotReady):
        return "Apple's on-device model is still downloading. Try again later."
    case .unavailable(let other):
        return "Apple's on-device model isn't available (\(other))."
    }
}

@main
struct Main {
    static func main() async {
        let input = FileHandle.standardInput.readDataToEndOfFile()
        guard let request = (try? JSONSerialization.jsonObject(with: input)) as? [String: Any] else {
            write(["ok": false, "reason": "Elai sent a request the on-device model couldn't read."])
            return
        }
        if let reason = unavailableReason() {
            write(["ok": false, "reason": reason])
            return
        }
        if (request["cmd"] as? String) == "status" {
            write(["ok": true])
            return
        }
        let instructions = request["instructions"] as? String ?? ""
        let prompt = request["prompt"] as? String ?? ""
        let choices = (request["choices"] as? [String] ?? []).filter { $0 != "none" } + ["none"]
        do {
            let choice = DynamicGenerationSchema(name: "Choice", description: "The id that answers the latest message, or none", anyOf: choices)
            let root = DynamicGenerationSchema(name: "Pick", properties: [.init(name: "best", schema: choice)])
            let schema = try GenerationSchema(root: root, dependencies: [])
            let session = LanguageModelSession(instructions: instructions)
            let reply = try await session.respond(to: prompt, schema: schema, options: GenerationOptions(samplingMode: .greedy))
            write(["ok": true, "pick": try reply.content.value(String.self, forProperty: "best")])
        } catch let error as LanguageModelError {
            switch error {
            case .contextSizeExceeded:
                write(["ok": false, "reason": "The question and what Elai looked up were too long for the on-device model."])
            case .guardrailViolation:
                write(["ok": false, "declined": true, "reason": "Apple's model declined to answer this."])
            default:
                write(["ok": false, "reason": "The on-device model failed: \(error.localizedDescription)"])
            }
        } catch {
            write(["ok": false, "reason": "The on-device model failed: \(error.localizedDescription)"])
        }
    }
}
