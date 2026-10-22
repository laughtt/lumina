import AVFoundation
import Speech
import SwiftUI

struct MicButton: View {
    @Binding var text: String
    var separator = " "
    @StateObject private var dictation = Dictation()

    var body: some View {
        Button {
            let start = text
            dictation.toggle { words in text = start.isEmpty ? words : start + separator + words }
        } label: {
            Image(systemName: dictation.listening ? "waveform" : "mic")
                .font(.title3)
                .symbolEffect(.variableColor.iterative, isActive: dictation.listening)
                .frame(width: 44, height: 44)
                .foregroundStyle(dictation.listening ? .white : Color.aqua)
                .background(Circle().fill(dictation.listening ? Color.rose : Color.aqua.opacity(0.12)))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(dictation.listening ? "Stop dictation" : "Speak instead of typing")
        .onDisappear { dictation.stop() }
    }
}

@MainActor
final class Dictation: ObservableObject {
    @Published var listening = false
    private let engine = AVAudioEngine()
    private let recognizer = SFSpeechRecognizer()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?

    func toggle(_ heard: @escaping (String) -> Void) {
        if listening { return stop() }
        SFSpeechRecognizer.requestAuthorization { status in
            guard status == .authorized else { return }
            AVAudioApplication.requestRecordPermission { ok in
                guard ok else { return }
                Task { @MainActor in try? self.start(heard) }
            }
        }
    }

    private func start(_ heard: @escaping (String) -> Void) throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.record, mode: .measurement, options: .duckOthers)
        try session.setActive(true, options: .notifyOthersOnDeactivation)
        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        let input = engine.inputNode
        input.installTap(onBus: 0, bufferSize: 1024, format: input.outputFormat(forBus: 0)) { buffer, _ in request.append(buffer) }
        engine.prepare()
        try engine.start()
        self.request = request
        listening = true
        task = recognizer?.recognitionTask(with: request) { result, error in
            let words = result?.bestTranscription.formattedString
            let done = error != nil || result?.isFinal == true
            Task { @MainActor in
                if let words { heard(words) }
                if done { self.stop() }
            }
        }
    }

    func stop() {
        guard listening else { return }
        engine.stop()
        engine.inputNode.removeTap(onBus: 0)
        request?.endAudio()
        task?.finish()
        listening = false
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}
