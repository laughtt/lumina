import SwiftUI
import UserNotifications

struct AboutView: View {
    @EnvironmentObject var lumina: Lumina
    @State private var facts: [Fact] = []
    @State private var text = ""
    @State private var busy = false

    var kinds: [(String, String)] {
        [("routine", "Routine"), ("likes", "Likes"), ("calms", "What calms \(lumina.calls)"), ("upsets", "What upsets \(lumina.calls)"),
         ("people", "People"), ("health", "Health"), ("other", "Other")]
    }

    var body: some View {
        List {
            if let family = lumina.family, let settings = family.ai {
                Section("Lumina AI") {
                    aiToggle(settings, \.notify, "bell", "Notify me", "When something needs you")
                    aiToggle(settings, \.tv, "tv", "Act on the TV by itself", "Off: Lumina asks you first")
                    aiToggle(settings, \.memories, "photo.on.rectangle", "Show memories by itself", "A slideshow at 10 am and 4 pm")
                    aiToggle(settings, \.learn, "text.bubble", "Learn new ways of asking", "New words, same answer")
                    aiToggle(settings, \.analysis, "moon.stars", "Evening analysis", "A short note each night")
                    NavigationLink("TV steps Lumina can take") { Playbook() }
                }
            }

            Section("What Lumina knows about \(lumina.calls)") {
                HStack(alignment: .top) {
                    TextField("Habits, likes, what calms \(lumina.calls)…", text: $text, axis: .vertical).lineLimit(1...4)
                    if text.trimmingCharacters(in: .whitespaces).isEmpty {
                        MicButton(text: $text)
                    } else {
                        Button(busy ? "…" : "Add") { Task { await tell() } }.font(.headline).disabled(busy)
                    }
                }
                ForEach(facts) { fact in
                    VStack(alignment: .leading, spacing: 2) {
                        Caps(text: kinds.first { $0.0 == fact.kind }?.1 ?? fact.kind)
                        Text(fact.text).foregroundStyle(Color.ink)
                    }
                }
                .onDelete { rows in rows.map { facts[$0] }.forEach(forget) }
            }

            if let reminders = lumina.family?.reminders, !reminders.isEmpty {
                Section("Reminders") {
                    ForEach(reminders) { r in
                        LabeledContent("\(r.label.capitalized), \(r.time)", value: r.doneToday ? "Done" : "Not yet")
                    }
                }
            }

            Section {
                NavigationLink("TV and Alexa") { List { PairTV(); AlexaKey() }.scrollContentBackground(.hidden).background(Color.paper).navigationTitle("TV and Alexa") }
            }
        }
        .task(id: lumina.personId) { facts = ((try? await lumina.call("/api/about")) as About?)?.facts ?? [] }
    }

    func aiToggle(_ settings: Family.Ai, _ key: WritableKeyPath<Family.Ai, Bool>, _ icon: String, _ title: String, _ detail: String) -> some View {
        Toggle(isOn: Binding(get: { settings[keyPath: key] }, set: { on in
            var next = settings
            next[keyPath: key] = on
            if key == \.notify && on { Task { _ = try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) } }
            Task { let _: Family.Ai? = try? await lumina.call("/api/ai", next, method: "PUT"); await lumina.refresh() }
        })) {
            HStack(alignment: .top, spacing: 14) {
                Image(systemName: icon).font(.body).foregroundStyle(Color.navy).frame(width: 24).padding(.top, 2)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).foregroundStyle(Color.ink)
                    Text(detail).font(.footnote).foregroundStyle(Color.inkSoft)
                }
            }
        }
        .tint(.aqua)
    }

    func tell() async {
        busy = true
        if let added: About = try? await lumina.call("/api/about", ["text": text]) {
            withAnimation { facts += added.facts }
            text = ""
        }
        busy = false
    }

    func forget(_ fact: Fact) {
        facts.removeAll { $0.id == fact.id }
        Task { let _: Ok? = try? await lumina.call("/api/about/\(fact.id)", nil as String?, method: "DELETE") }
    }
}

struct PairTV: View {
    @EnvironmentObject var lumina: Lumina
    @State private var code = ""
    @State private var paired = false
    @State private var failed = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if paired || lumina.person?.tvPaired == true {
                Label("A TV is paired. It shows \(lumina.calls)'s answers.", systemImage: "checkmark.circle.fill").foregroundStyle(Color.aqua)
            }
            Text("Open Lumina on the TV and type the code it shows.").font(.subheadline).foregroundStyle(.secondary)
            HStack {
                TextField("ABC123", text: $code)
                    .font(.title2.monospaced().weight(.semibold))
                    .textInputAutocapitalization(.characters).autocorrectionDisabled()
                    .onChange(of: code) { code = String(code.uppercased().filter { $0.isLetter || $0.isNumber }.prefix(6)) }
                Button("Pair TV") {
                    Task {
                        do {
                            let _: Ok = try await lumina.call("/api/tv/claim", ["code": code])
                            withAnimation { paired = true; failed = false }
                            code = ""
                        } catch {
                            failed = true
                        }
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(code.count != 6)
            }
            if failed {
                Text("That code didn't work. Codes last 10 minutes, so check the TV for a fresh one.").font(.footnote).foregroundStyle(Color.rose)
            }
        }
        .padding(.vertical, 4)
    }
}

struct AlexaKey: View {
    @EnvironmentObject var lumina: Lumina
    @State private var code: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Connect Alexa").font(.headline).foregroundStyle(Color.ink)
            if let code {
                Text("Say to \(lumina.calls)'s Alexa:").font(.subheadline).foregroundStyle(Color.inkSoft)
                Text("“Alexa, ask my Lumina, my code is \(code)”").font(.system(.title3, design: .serif)).foregroundStyle(Color.ink)
                Text("The code works for 10 minutes. Then \(lumina.calls) can ask “Alexa, ask my Lumina where's \(lumina.family?.profile?.ana ?? "Ana")?”")
                    .font(.footnote).foregroundStyle(Color.inkSoft)
            } else {
                Text("Get a 4-digit code, then say it to Alexa once.").font(.subheadline).foregroundStyle(Color.inkSoft)
                Button("Get a code") {
                    Task {
                        struct Out: Decodable { let code: String }
                        let out: Out? = try? await lumina.call("/api/alexa/code", [String: String]())
                        withAnimation { code = out?.code }
                    }
                }
                .buttonStyle(.borderedProminent).buttonBorderShape(.capsule)
            }
        }
        .padding(.vertical, 4)
    }
}

struct Playbook: View {
    @EnvironmentObject var lumina: Lumina

    var body: some View {
        List {
            Section {
                ForEach(lumina.family?.playbook ?? []) { step in
                    Toggle(step.label, isOn: Binding(get: { step.enabled }, set: { on in
                        Task { await lumina.send("/api/playbook/\(step.id)", ["enabled": on], method: "PUT") }
                    }))
                    .tint(.aqua)
                }
            } footer: {
                Text("Lumina only picks steps that are on. Calling family always waits for your OK.")
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.paper)
        .navigationTitle("TV steps")
    }
}
