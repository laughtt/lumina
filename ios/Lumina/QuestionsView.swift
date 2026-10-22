import SwiftUI

struct QuestionsView: View {
    @EnvironmentObject var lumina: Lumina
    @State private var editing: Topic?

    var body: some View {
        let todo = lumina.topics.filter { $0.answer == nil }, done = lumina.topics.filter { $0.answer != nil }
        List {
            if !todo.isEmpty {
                Section {
                    ForEach(todo) { topic in QuestionRow(topic: topic) { editing = topic } }
                } header: { Heading(title: "Needs an answer", count: todo.count) }
            }
            Section {
                ForEach(done) { topic in QuestionRow(topic: topic) { editing = topic } }
            } header: {
                Heading(title: "Answered")
            } footer: {
                Text("Answer once. \(lumina.calls) can ask as often as needed, and always hears your words.")
            }
            Section {
                Button("Add a question", systemImage: "plus") { editing = Topic(id: "", question: "", phrasings: [], pin: nil, answer: nil) }
            }
        }
        .sheet(item: $editing) { TopicEditor(topic: $0) }
    }
}

struct QuestionRow: View {
    @EnvironmentObject var lumina: Lumina
    let topic: Topic
    let edit: () -> Void
    @State private var answering = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text(topic.question).font(.system(.title3, design: .serif).weight(.semibold)).foregroundStyle(Color.ink)
                Spacer()
                if topic.pin == true { Image(systemName: "tv").foregroundStyle(Color.inkSoft).accessibilityLabel("On the TV") }
                Button("Edit", action: edit).font(.subheadline)
            }
            if answering {
                AnswerEditor(topic: topic.id, text: topic.answer?.text ?? "") { answering = false }
            } else {
                VStack(alignment: .leading, spacing: 4) {
                    Caps(text: "\(lumina.calls) hears")
                    Text(topic.answer?.rosa_text ?? "“I'm not sure, I'll let \(lumina.me?.account.name ?? "family") know.”")
                        .font(topic.answer == nil ? .subheadline : .body).foregroundStyle(topic.answer == nil ? Color.inkSoft : Color.ink)
                }
                .padding(.leading, 12)
                .overlay(alignment: .leading) { Capsule().fill(topic.answer == nil ? Color.line : Color.aqua).frame(width: 3) }
                if !topic.phrasings.isEmpty {
                    Text("Also asked as " + topic.phrasings.map { "“\($0)”" }.joined(separator: " · ")).font(.footnote).foregroundStyle(Color.inkSoft)
                }
                if topic.answer == nil {
                    Button("Answer it") { answering = true }.buttonStyle(.borderedProminent).buttonBorderShape(.capsule).controlSize(.small)
                } else {
                    Button("Change answer") { answering = true }.font(.subheadline)
                }
            }
        }
        .buttonStyle(.borderless)
        .padding(.vertical, 6)
    }
}

struct AnswerEditor: View {
    @EnvironmentObject var lumina: Lumina
    let topic: String
    @State var text: String
    var saved: () -> Void
    @State private var check: Check?
    @State private var busy = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                TextField("Say it the way you would", text: $text, axis: .vertical).lineLimit(2...5)
                    .padding(12)
                    .background(RoundedRectangle(cornerRadius: 8).fill(.white))
                    .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Color.line))
                MicButton(text: $text)
            }
            if let check {
                VStack(alignment: .leading, spacing: 6) {
                    Caps(text: "\(lumina.calls) hears")
                    Text("“\(check.rosa_text)”")
                    Caps(text: "TV shows").padding(.top, 4)
                    Text(check.tv_line).font(.headline).foregroundStyle(.white).padding(12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(RoundedRectangle(cornerRadius: 10).fill(Color.ink))
                    ForEach(check.issues, id: \.self) { Label($0, systemImage: "exclamationmark.circle").font(.subheadline).foregroundStyle(Color.rose) }
                    if let s = check.suggestion { Text("Lumina suggests: “\(s)”").font(.subheadline) }
                }
                .transition(.opacity.combined(with: .move(edge: .top)))
                HStack {
                    Button("Approve") { approve(check.rosa_text) }.buttonStyle(.borderedProminent)
                    if let s = check.suggestion { Button("Use suggestion") { approve(s) }.buttonStyle(.bordered) }
                    Button("Edit") { withAnimation { self.check = nil } }.buttonStyle(.bordered)
                }
            } else {
                Button(busy ? "Lumina is reading it…" : "Check with Lumina") {
                    busy = true
                    Task {
                        let c: Check? = try? await lumina.call("/api/answers/check", ["topic": topic, "text": text])
                        withAnimation { check = c }
                        busy = false
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(busy || text.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        .buttonBorderShape(.capsule)
    }

    func approve(_ rosaText: String) {
        guard let check else { return }
        Task {
            await lumina.send("/api/answers/\(topic)", ["text": text, "rosa_text": rosaText, "tv_line": check.tv_line], method: "PUT")
            saved()
        }
    }
}

struct TopicEditor: View {
    @EnvironmentObject var lumina: Lumina
    @Environment(\.dismiss) private var dismiss
    let topic: Topic
    var saved: () -> Void = {}
    @State private var question = ""
    @State private var ways = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("The question") {
                    HStack {
                        TextField("e.g. Where's my cat?", text: $question, axis: .vertical)
                        MicButton(text: $question)
                    }
                }
                Section {
                    HStack(alignment: .top) {
                        TextField("One per line", text: $ways, axis: .vertical).lineLimit(3...8)
                        MicButton(text: $ways, separator: "\n")
                    }
                } header: {
                    Text("Ways \(lumina.calls) says it")
                } footer: {
                    Text("Lumina and Alexa listen for these too.")
                }
                if !topic.id.isEmpty {
                    Button("Delete this question", role: .destructive) {
                        Task {
                            let _: Ok? = try? await lumina.call("/api/topics/\(topic.id)", nil as String?, method: "DELETE")
                            await lumina.refresh()
                            dismiss()
                        }
                    }
                }
            }
            .navigationTitle(topic.id.isEmpty ? "New question" : "Edit question")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }.disabled(slug(question).isEmpty)
                }
            }
            .onAppear { question = topic.question; ways = topic.phrasings.joined(separator: "\n") }
        }
    }

    func save() async {
        struct Body: Encodable { let question: String; let phrasings: [String]; let pin: Bool? }
        let phrasings = ways.components(separatedBy: .newlines).map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        await lumina.send("/api/topics/\(topic.id.isEmpty ? slug(question) : topic.id)",
                          Body(question: question.trimmingCharacters(in: .whitespaces), phrasings: phrasings, pin: topic.pin), method: "PUT")
        saved()
        dismiss()
    }
}
