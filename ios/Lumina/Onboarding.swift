import AuthenticationServices
import SwiftUI

struct Onboarding: View {
    var adding = false
    @EnvironmentObject var lumina: Lumina
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.webAuthenticationSession) private var webAuth
    @AppStorage("onboardingStep") private var step = 0
    @AppStorage("onb.role") private var role = ""
    @AppStorage("onb.scope") private var scope = ""
    @AppStorage("onb.name") private var name = ""
    @AppStorage("onb.calls") private var calls = ""
    @AppStorage("onb.age") private var age = ""
    @AppStorage("onb.condition") private var condition = "Early Alzheimer's"
    @AppStorage("onb.you") private var you = ""
    @AppStorage("onb.firetv") private var firetv = false
    @AppStorage("onb.alexa") private var alexa = false
    @State private var forward = true
    @State private var busy = false
    @State private var problem: String?
    @State private var picked: [Suggestion] = []
    @State private var custom: [Suggestion] = []
    @State private var newQuestion = ""
    @State private var newWays = ""
    @State private var card = 0
    @State private var checked = false
    private let mock = UserDefaults.standard.bool(forKey: "mock")

    static let mockAnswers = ["Where's Ana?": "Ana is at work, Mom. She's home at six.",
                              "When do I eat?": "Lunch is at one. It's in the fridge, on the top shelf.",
                              "What's happening today?": "A quiet day at home, Mom. Luis calls at seven."]
    static let conditions = ["Early Alzheimer's", "Middle-stage Alzheimer's", "Other dementia", "Memory loss", "Other"]

    var them: String { calls.isEmpty ? (name.isEmpty ? "them" : name) : calls }
    var first: Int { adding ? 3 : 1 }
    var spring: Animation { reduceMotion ? .easeInOut(duration: 0.2) : .spring(duration: 0.55, bounce: 0.12) }

    var body: some View {
        ZStack {
            Color.paper.ignoresSafeArea()
            if step == 0 {
                welcome.transition(.opacity)
            } else {
                VStack(spacing: 0) {
                    header
                    ZStack { page.id(step).transition(transition) }
                        .frame(maxHeight: .infinity)
                    bar
                }
                .transition(.opacity)
            }
        }
        .animation(spring, value: step)
        .preferredColorScheme(.light)
        .onAppear {
            if adding { step = 3; name = ""; calls = ""; age = ""; firetv = false; alexa = false }
            else if mock && step == 0 {
                name = "Rosa"; calls = "Mom"; age = "76"; you = "Ana"; condition = "Early Alzheimer's"; firetv = true; alexa = true
                role = "family"; scope = "one"; picked = Array(suggestions.prefix(3))
            }
        }
    }

    var canGoBack: Bool { ![1, 5, 8].contains(step) && !(adding && step == first) }

    var transition: AnyTransition {
        reduceMotion ? .opacity : .asymmetric(insertion: .offset(x: forward ? 70 : -70).combined(with: .opacity),
                                              removal: .offset(x: forward ? -70 : 70).combined(with: .opacity))
    }

    func go(_ n: Int) {
        forward = n > step
        problem = nil
        DispatchQueue.main.async { step = n }
    }

    var section: String {
        switch step {
        case 1, 2: "About you"
        case 3: "About \(them)"
        case 4: "At home"
        case 5: "Questions"
        case 6: "Answers"
        case 7: "Devices"
        default: "Ready"
        }
    }

    var header: some View {
        VStack(spacing: 0) {
            ZStack {
                Text(section.uppercased()).font(.footnote.weight(.semibold)).tracking(1.6).foregroundStyle(Color.ink)
                    .id(section).transition(.opacity)
                HStack {
                    if canGoBack {
                        Button("Back", systemImage: "chevron.left") { go(step - 1) }
                            .transition(.opacity.combined(with: .move(edge: .leading)))
                    }
                    Spacer()
                    if adding { Button("Close", systemImage: "xmark") { lumina.adding = false } }
                }
                .labelStyle(.iconOnly).font(.title3.weight(.medium)).foregroundStyle(Color.ink)
                .buttonStyle(Press())
                .frame(minHeight: 44)
                .animation(spring, value: canGoBack)
            }
            .frame(height: 48)
            .padding(.horizontal, 12)
            ProgressLine(value: Double(step - first + 1) / Double(9 - first))
        }
    }

    var spec: (label: String, enabled: Bool, action: () async -> Void) {
        switch step {
        case 1: ("Continue", !role.isEmpty, { await save(["role": role]) { go(2) } })
        case 2: ("Continue", !scope.isEmpty, { await save(["scope": scope]) { go(3) } })
        case 3: ("Continue", !name.isEmpty && !you.isEmpty, { await save(["name": you]) { go(4) } })
        case 4: (firetv || alexa ? "Continue" : "Skip for now", true, createPerson)
        case 5: (picked.isEmpty ? "Pick at least one" : "Continue with \(picked.count)", !picked.isEmpty, saveTopics)
        case 6: (card < lumina.topics.count ? "Skip this one" : "Continue", true, { if card < lumina.topics.count { withAnimation(spring) { card += 1 } } else { go(7) } })
        case 7: ("Continue", true, { go(8) })
        default: (adding ? "Go to \(them)" : "Open Lumina", true, finish)
        }
    }

    var bar: some View {
        let s = spec
        return VStack(spacing: 8) {
            if let problem { Text(problem).font(.footnote).foregroundStyle(Color.rose).transition(.opacity) }
            HStack {
                Button {
                    Task { busy = true; await s.action(); busy = false }
                } label: {
                    HStack(spacing: 8) {
                        if busy { ProgressView().tint(.white) }
                        Text(s.label).contentTransition(.opacity)
                    }
                    .font(.headline).foregroundStyle(.white)
                    .frame(maxWidth: .infinity, minHeight: 52)
                    .background(Capsule().fill(s.enabled ? Color.navy : Color.navy.opacity(0.3)))
                }
                .buttonStyle(Press())
                .disabled(!s.enabled || busy)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 12)
        .padding(.bottom, 6)
        .animation(spring, value: s.label)
    }

    @ViewBuilder var page: some View {
        switch step {
        case 1: rolePage
        case 2: scopePage
        case 3: about
        case 4: devices
        case 5: questions
        case 6: answers
        case 7: connect
        default: done
        }
    }

    func form<C: View>(_ title: String, _ subtitle: String? = nil, @ViewBuilder content: () -> C) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Text(title).font(.system(.largeTitle, design: .serif)).foregroundStyle(Color.ink)
                    .fixedSize(horizontal: false, vertical: true).rise(1)
                if let subtitle { Text(subtitle).foregroundStyle(Color.inkSoft).padding(.top, 8).rise(2) }
                VStack(alignment: .leading, spacing: 12) { content() }.padding(.top, 28)
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 28)
        }
        .scrollDismissesKeyboard(.interactively)
    }

    var welcome: some View {
        VStack(spacing: 0) {
            Spacer()
            ZStack {
                Glow().frame(width: 340, height: 340)
                Image("Emblem").resizable().scaledToFit().frame(width: 200, height: 200).accessibilityHidden(true)
            }
            .frame(height: 260)
            Image("Wordmark").resizable().scaledToFit().frame(width: 220).padding(.top, 8).accessibilityLabel("Lumina").rise(1)
            Text("CARE · CONNECT · REMEMBER").font(.footnote.weight(.medium)).tracking(2.4).foregroundStyle(Color.inkSoft).padding(.top, 12).rise(2)
            Spacer()
            VStack(spacing: 12) {
                SignInWithAppleButton(.continue) { $0.requestedScopes = [.fullName] } onCompletion: { apple($0) }
                    .signInWithAppleButtonStyle(.black)
                    .frame(height: 54)
                    .clipShape(Capsule())
                Button { Task { await google() } } label: {
                    HStack(spacing: 10) {
                        Text("G").font(.system(size: 20, weight: .bold)).foregroundStyle(Color(red: 0.26, green: 0.52, blue: 0.96))
                        Text("Continue with Google").font(.system(size: 19, weight: .medium)).foregroundStyle(.black)
                    }
                    .frame(maxWidth: .infinity, minHeight: 54)
                    .background(Capsule().fill(.white))
                    .overlay(Capsule().strokeBorder(Color.line))
                }
                .buttonStyle(Press())
                Button { Task { await signIn("/api/auth/guest", ["demo": "1"]) } } label: {
                    Group { if busy { ProgressView() } else { Text("Try the demo") } }
                        .font(.headline).foregroundStyle(Color.navy).frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(Press())
                .disabled(busy)
                if let problem { Text(problem).font(.footnote).foregroundStyle(Color.rose) }
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 8)
            .rise(3)
        }
    }

    func apple(_ result: Result<ASAuthorization, Error>) {
        guard case .success(let auth) = result, let cred = auth.credential as? ASAuthorizationAppleIDCredential,
              let token = cred.identityToken.flatMap({ String(data: $0, encoding: .utf8) }) else { return }
        let given = cred.fullName?.givenName ?? ""
        if !given.isEmpty { you = given }
        Task { await signIn("/api/auth/apple", ["identityToken": token, "name": given]) }
    }

    func google() async {
        guard !Google.clientID.isEmpty else { return await signIn("/api/auth/guest", [:]) }
        guard let token = try? await Google.idToken(webAuth) else { return }
        await signIn("/api/auth/google", ["idToken": token])
    }

    func signIn(_ path: String, _ body: [String: String]) async {
        busy = true
        do {
            try await lumina.signIn(path, body)
            if lumina.me?.account.onboarded != true { go(1) }
        } catch {
            problem = "Couldn't sign in. Check your internet connection and try again."
        }
        busy = false
    }

    var rolePage: some View {
        form("First, who are you?", "So Lumina can speak to you the right way.") {
            Choice(on: role == "family", icon: "house", title: "I'm family", detail: "Someone I love: a parent, a partner, a friend.") { role = "family" }.rise(3)
            Choice(on: role == "caregiver", icon: "cross.case", title: "I'm a caregiver", detail: "Caring for people is my work.") { role = "caregiver" }.rise(4)
        }
    }

    var scopePage: some View {
        form("Who is this for?", "You can add more people later.") {
            Choice(on: scope == "one", icon: "person", title: "Just one person", detail: role == "caregiver" ? "One client." : "Mom, Dad, or someone close.") { scope = "one" }.rise(3)
            Choice(on: scope == "many", icon: "person.3", title: "Several people", detail: "I look after more than one person.") { scope = "many" }.rise(4)
        }
    }

    func save(_ body: [String: String], then next: () -> Void) async {
        do {
            let _: Ok = try await lumina.call("/api/me", body, method: "PUT")
            next()
        } catch {
            problem = "Couldn't reach Lumina. Try again."
        }
    }

    var about: some View {
        form("Tell us about them", "Lumina uses these words when it talks with them.") {
            Group {
                Field(label: "Their name", hint: "Rosa", text: $name)
                Field(label: "What do you call them?", hint: "Mom", text: $calls)
            }
            .rise(3)
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .firstTextBaseline) {
                    Caps(text: "Age")
                    Spacer()
                    Text(age.isEmpty ? "—" : age).font(.system(.title2, design: .serif)).foregroundStyle(Color.ink).contentTransition(.numericText())
                }
                Slider(value: Binding(get: { Double(age) ?? 75 }, set: { age = String(Int($0)) }), in: 50...100, step: 1)
                HStack {
                    ForEach([50, 60, 70, 80, 90, 100], id: \.self) { n in
                        Text("\(n)")
                        if n < 100 { Spacer() }
                    }
                }
                .font(.caption).foregroundStyle(Color.inkSoft)
            }
            .padding(.top, 8)
            .rise(4)
            VStack(alignment: .leading, spacing: 10) {
                Caps(text: "Condition")
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                    ForEach(Self.conditions, id: \.self) { c in Tile(on: condition == c, title: c) { condition = c } }
                }
            }
            .padding(.top, 8)
            .rise(5)
            VStack(alignment: .leading, spacing: 8) {
                Field(label: "Your name", hint: "Ana", text: $you)
                Text("\(them) will hear it, as in “Where's \(you.isEmpty ? "Ana" : you)?”").font(.footnote).foregroundStyle(Color.inkSoft)
            }
            .padding(.top, 8)
            .rise(6)
        }
    }

    var devices: some View {
        form("What does \(them) have at home?", "Lumina answers through Alexa and keeps the answer on the TV.") {
            Choice(on: firetv, icon: "tv", title: "Fire TV", detail: "The answer stays on screen, big and calm.") { firetv.toggle() }.rise(3)
            Choice(on: alexa, icon: "homepod", title: "Alexa", detail: "\(them) asks out loud. Alexa answers in your words.") { alexa.toggle() }.rise(4)
            Choice(on: !firetv && !alexa, icon: "clock", title: "Not yet", detail: "You can add them any time.") { firetv = false; alexa = false }.rise(5)
        }
    }

    func createPerson() async {
        struct Body: Encodable { let name, calls: String; let age: Int?; let condition, caregiver: String; let devices: [String]; let demo: Bool }
        struct Created: Decodable { let id: String }
        do {
            let body = Body(name: name, calls: calls.isEmpty ? name : calls, age: Int(age), condition: condition, caregiver: you,
                            devices: (firetv ? ["firetv"] : []) + (alexa ? ["alexa"] : []), demo: true)
            let created: Created = try await lumina.call("/api/people", body)
            lumina.show(created.id)
            await lumina.loadMe()
            go(5)
        } catch {
            problem = "Couldn't reach Lumina. Try again."
        }
    }

    var suggestions: [Suggestion] {
        let y = you.isEmpty ? "Ana" : you
        return [
            Suggestion(id: "where_is_ana", question: "Where's \(y)?", phrasings: ["Where is \(y)?", "Where did \(y) go?", "Is \(y) at work?"]),
            Suggestion(id: "meals", question: "When do I eat?", phrasings: ["Is it lunch time?", "Did I eat?", "When is dinner?"]),
            Suggestion(id: "today", question: "What's happening today?", phrasings: ["What day is it?", "Is it Sunday?", "What's the date?"]),
            Suggestion(id: "next", question: "What's next?", phrasings: ["What do I do now?", "What happens next?"]),
            Suggestion(question: "Did I take my pills?", phrasings: ["Did I take my medicine?", "Do I need my pills?"]),
            Suggestion(question: "When is \(y) coming?", phrasings: ["Is \(y) coming today?", "When will I see \(y)?"]),
        ] + custom
    }

    var questions: some View {
        form("What does \(them) ask again and again?", "Pick the ones you hear most. You'll answer each one next.") {
            if !picked.isEmpty {
                Caps(text: "Selected")
                ScrollView(.horizontal) {
                    HStack(spacing: 8) {
                        ForEach(picked, id: \.question) { s in
                            Button { withAnimation(spring) { picked.removeAll { $0 == s } } } label: {
                                HStack(spacing: 6) {
                                    Text(s.question).lineLimit(1)
                                    Image(systemName: "xmark").font(.caption2.weight(.bold))
                                }
                                .font(.subheadline).foregroundStyle(Color.navy)
                                .padding(.horizontal, 14).frame(height: 36)
                                .background(Capsule().fill(.white))
                                .overlay(Capsule().strokeBorder(Color.navy))
                            }
                            .buttonStyle(Press())
                            .transition(.scale(scale: 0.8).combined(with: .opacity))
                        }
                    }
                    .padding(.vertical, 2)
                }
                .scrollIndicators(.hidden)
                Color.line.frame(height: 1).padding(.vertical, 12)
            }
            Caps(text: "Common questions").rise(3)
            ForEach(Array(suggestions.enumerated()), id: \.element.question) { i, s in
                let on = picked.contains(s)
                Choice(on: on, title: s.question, detail: s.phrasings.map { "“\($0)”" }.joined(separator: " · ")) {
                    withAnimation(spring) { if on { picked.removeAll { $0 == s } } else { picked.append(s) } }
                }
                .rise(Double(i) * 0.6 + 3.5)
            }
            VStack(alignment: .leading, spacing: 12) {
                Caps(text: "Something else they ask")
                Boxed { TextField("e.g. Where's my cat?", text: $newQuestion); MicButton(text: $newQuestion) }
                if !newQuestion.isEmpty {
                    Boxed { TextField("Other ways they say it, with commas", text: $newWays); MicButton(text: $newWays, separator: ", ") }
                        .transition(.opacity.combined(with: .move(edge: .top)))
                    Button("Add this question", systemImage: "plus") {
                        let s = Suggestion(question: newQuestion.trimmingCharacters(in: .whitespaces),
                                           phrasings: newWays.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty })
                        withAnimation(spring) { custom.append(s); picked.append(s) }
                        newQuestion = ""; newWays = ""
                    }
                    .font(.subheadline.weight(.semibold)).foregroundStyle(Color.navy)
                    .padding(.horizontal, 16).frame(height: 40)
                    .overlay(Capsule().strokeBorder(Color.navy))
                    .buttonStyle(Press())
                    .transition(.opacity)
                }
            }
            .padding(.top, 16)
            .animation(spring, value: newQuestion.isEmpty)
        }
    }

    func saveTopics() async {
        struct Body: Encodable { let question: String; let phrasings: [String]; let pin: Bool }
        do {
            for (i, s) in picked.enumerated() {
                let _: Ok = try await lumina.call("/api/topics/\(s.id ?? slug(s.question))", Body(question: s.question, phrasings: s.phrasings, pin: i < 2), method: "PUT")
            }
            await lumina.refresh()
            card = 0
            go(6)
        } catch {
            problem = "Couldn't save the questions. Try again."
        }
    }

    var answers: some View {
        let topics = lumina.topics
        return form("Answer once", "Say it the way you would. \(them) hears these words every time.") {
            ZStack {
                if card < topics.count {
                    let t = topics[card]
                    VStack(alignment: .leading, spacing: 14) {
                        Caps(text: "Question \(card + 1) of \(topics.count)")
                        Text("“\(t.question)”").font(.system(.title2, design: .serif)).foregroundStyle(Color.ink)
                        AnswerEditor(topic: t.id, text: t.answer?.text ?? (mock ? Self.mockAnswers[t.question] ?? "" : "")) { withAnimation(spring) { card += 1 } }
                    }
                    .padding(20)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(RoundedRectangle(cornerRadius: 12).fill(.white))
                    .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color.line))
                    .id(t.id)
                    .transition(reduceMotion ? .opacity : .asymmetric(insertion: .offset(x: 60).combined(with: .opacity),
                                                                     removal: .offset(x: -60).combined(with: .opacity)))
                } else {
                    Label(topics.isEmpty ? "No questions yet. You can add them later." : "All set. You can change any answer later, in Questions.",
                          systemImage: "checkmark.circle.fill")
                        .font(.headline).foregroundStyle(Color.aqua)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .transition(.opacity)
                }
            }
            .rise(3)
            if topics.count > 1 {
                HStack(spacing: 6) {
                    ForEach(topics.indices, id: \.self) { i in
                        Capsule().fill(i == card ? Color.navy : i < card ? Color.aqua : Color.line).frame(width: i == card ? 20 : 7, height: 7)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.top, 8)
                .animation(spring, value: card)
            }
        }
        .task {
            if lumina.topics.isEmpty { await lumina.refresh() }
            card = lumina.topics.firstIndex { $0.answer == nil } ?? lumina.topics.count
        }
    }

    var connect: some View {
        form("Connect \(them)'s devices", "Both can wait. You'll find them later, in About.") {
            if firetv {
                Card {
                    Caps(text: "Fire TV")
                    PairTV()
                }
                .rise(3)
            }
            if alexa {
                Card {
                    Caps(text: "Alexa")
                    AlexaKey()
                }
                .rise(4)
            }
            if !firetv && !alexa {
                Text("No devices yet. When \(them) has a Fire TV or Alexa, pair it from About.").foregroundStyle(Color.inkSoft).rise(3)
            }
        }
    }

    var done: some View {
        let line = (lumina.topics.first { $0.pin == true && $0.answer != nil } ?? lumina.topics.first { $0.answer != nil })?.answer?.tv_line
        return ScrollView {
            VStack(spacing: 20) {
                ZStack {
                    Circle().stroke(Color.aqua.opacity(0.15), lineWidth: 5)
                    Circle().trim(from: 0, to: checked ? 1 : 0).stroke(Color.aqua, style: StrokeStyle(lineWidth: 5, lineCap: .round)).rotationEffect(.degrees(-90))
                    Image(systemName: "checkmark").font(.system(size: 42, weight: .semibold)).foregroundStyle(Color.aqua)
                        .scaleEffect(checked ? 1 : 0.4).opacity(checked ? 1 : 0)
                }
                .frame(width: 104, height: 104)
                .padding(.top, 32)
                Text("You're all set").font(.system(.largeTitle, design: .serif)).foregroundStyle(Color.ink).rise(2)
                Text(line == nil ? "\(them)'s TV is ready for your answers." : "\(them)'s TV now shows").foregroundStyle(Color.inkSoft).rise(3)
                if let line {
                    VStack(spacing: 14) {
                        Circle().fill(Color.gold).frame(width: 26, height: 26).shadow(color: .gold.opacity(0.7), radius: 14)
                        Text(line).font(.system(.title3, design: .serif)).foregroundStyle(.white).multilineTextAlignment(.center)
                    }
                    .padding(24)
                    .frame(maxWidth: .infinity, minHeight: 190)
                    .background(RoundedRectangle(cornerRadius: 14).fill(Color.ink))
                    .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(.black.opacity(0.7), lineWidth: 6))
                    .accessibilityElement(children: .combine)
                    .rise(4)
                }
                Text("When \(them) asks, Lumina answers in your words. Each ask shows up in Patterns.")
                    .font(.subheadline).foregroundStyle(Color.inkSoft).multilineTextAlignment(.center).rise(5)
            }
            .padding(.horizontal, 20)
            .frame(maxWidth: .infinity)
        }
        .task { if lumina.topics.isEmpty { await lumina.refresh() } }
        .onAppear {
            if reduceMotion { checked = true } else { withAnimation(.easeOut(duration: 0.9).delay(0.3)) { checked = true } }
        }
    }

    func finish() async {
        if adding {
            lumina.adding = false
        } else {
            let _: Ok? = try? await lumina.call("/api/me", ["onboarded": true], method: "PUT")
        }
        step = 0
        await lumina.loadMe()
    }
}

struct Suggestion: Hashable {
    var id: String?
    let question: String
    let phrasings: [String]
}

struct Caps: View {
    let text: String
    var body: some View { Text(text.uppercased()).font(.caption.weight(.semibold)).tracking(1.4).foregroundStyle(Color.inkSoft) }
}

struct Card<Content: View>: View {
    @ViewBuilder let content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: 10) { content }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 12).fill(.white))
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color.line))
    }
}

struct Boxed<Content: View>: View {
    @ViewBuilder let content: Content
    var body: some View {
        HStack { content }
            .padding(.leading, 14).padding(.trailing, 4).frame(minHeight: 50)
            .background(RoundedRectangle(cornerRadius: 8).fill(.white))
            .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Color.line))
    }
}

struct Choice: View {
    let on: Bool
    var icon: String?
    let title: String
    let detail: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 14) {
                if let icon {
                    Image(systemName: icon).font(.title3).foregroundStyle(on ? Color.navy : Color.inkSoft).frame(width: 30)
                }
                VStack(alignment: .leading, spacing: 3) {
                    Text(title).font(.body.weight(.semibold)).foregroundStyle(Color.ink)
                    Text(detail).font(.subheadline).foregroundStyle(Color.inkSoft).multilineTextAlignment(.leading)
                }
                Spacer(minLength: 8)
                Tick(on: on)
            }
            .padding(16)
            .frame(maxWidth: .infinity, minHeight: 68, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 10).fill(on ? Color.mist : .white))
            .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(on ? Color.navy : Color.line, lineWidth: on ? 1.5 : 1))
            .animation(.spring(response: 0.3, dampingFraction: 0.75), value: on)
        }
        .buttonStyle(Press())
        .sensoryFeedback(.selection, trigger: on)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

struct Tile: View {
    let on: Bool
    let title: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title).font(.subheadline.weight(on ? .semibold : .regular)).foregroundStyle(on ? Color.navy : Color.ink)
                .multilineTextAlignment(.leading)
                .padding(.horizontal, 14)
                .frame(maxWidth: .infinity, minHeight: 50, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: 8).fill(on ? Color.mist : .white))
                .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(on ? Color.navy : Color.line, lineWidth: on ? 1.5 : 1))
                .animation(.spring(response: 0.3, dampingFraction: 0.75), value: on)
        }
        .buttonStyle(Press())
        .sensoryFeedback(.selection, trigger: on)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

struct Tick: View {
    let on: Bool
    var body: some View {
        ZStack {
            Circle().strokeBorder(Color.line, lineWidth: 1.5).opacity(on ? 0 : 1)
            Circle().fill(Color.aqua).scaleEffect(on ? 1 : 0.3).opacity(on ? 1 : 0)
            Image(systemName: "checkmark").font(.system(size: 12, weight: .bold)).foregroundStyle(.white).scaleEffect(on ? 1 : 0.3).opacity(on ? 1 : 0)
        }
        .frame(width: 24, height: 24)
    }
}

struct Field: View {
    let label: String
    let hint: String
    @Binding var text: String
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Caps(text: label)
            TextField(hint, text: $text)
                .focused($focused)
                .padding(.horizontal, 14).frame(height: 50)
                .background(RoundedRectangle(cornerRadius: 8).fill(.white))
                .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(focused ? Color.navy : Color.line, lineWidth: focused ? 1.5 : 1))
                .animation(.easeOut(duration: 0.15), value: focused)
        }
    }
}

struct Press: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .opacity(configuration.isPressed ? 0.85 : 1)
            .animation(.spring(response: 0.25, dampingFraction: 0.7), value: configuration.isPressed)
    }
}

struct ProgressLine: View {
    let value: Double

    var body: some View {
        GeometryReader { g in
            ZStack(alignment: .leading) {
                Color.line
                LinearGradient(colors: [.aqua, .navy], startPoint: .leading, endPoint: .trailing)
                    .frame(width: g.size.width * min(max(value, 0), 1))
            }
        }
        .frame(height: 3)
        .animation(.spring(duration: 0.7, bounce: 0.1), value: value)
        .accessibilityElement()
        .accessibilityLabel("Progress")
        .accessibilityValue("\(Int(value * 100)) percent")
    }
}

struct Rise: ViewModifier {
    let order: Double
    @State private var shown = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content
            .opacity(shown ? 1 : 0)
            .offset(y: shown || reduceMotion ? 0 : 18)
            .onAppear { withAnimation(.spring(duration: 0.6, bounce: 0.1).delay(0.05 + order * 0.06)) { shown = true } }
    }
}

extension View {
    func rise(_ order: Double) -> some View { modifier(Rise(order: order)) }
}

struct Glow: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var breathe = false

    var body: some View {
        Circle()
            .fill(RadialGradient(colors: [.gold.opacity(0.32), .aqua.opacity(0.14), .clear], center: .center, startRadius: 40, endRadius: 170))
            .scaleEffect(breathe ? 1.08 : 0.9)
            .opacity(breathe ? 1 : 0.6)
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(.easeInOut(duration: 4).repeatForever(autoreverses: true)) { breathe = true }
            }
            .accessibilityHidden(true)
    }
}
