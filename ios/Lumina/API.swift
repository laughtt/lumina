import Foundation
import Security
import UserNotifications
import SwiftUI

struct FeedItem: Codable, Identifiable {
    let id: String
    let at: String
    let kind: String
    let title: String
    let body: String?
    let why: String?
    let result: String?
    let ref: String?
    let actions: String?
    let rating: String?
    let decision: String?
    let memory: String?

    var isOpen: Bool { (actions == "rate" && rating == nil) || (actions == "decide" && decision == nil) }
}

struct Family: Codable {
    struct Answer: Codable { let text: String; let rosa_text: String; let tv_line: String }
    struct Memory: Codable, Identifiable { let id: String; let title: String; let caption: String; let url: String; let story: String?; let year: Int?; let calming: Bool? }
    struct Reminder: Codable, Identifiable { let id: String; let label: String; let time: String; let doneToday: Bool; let doneAt: String? }
    struct Step: Codable, Identifiable { let id: String; let label: String; let enabled: Bool }
    struct Note: Codable { let text: String }
    struct Ai: Codable { var notify: Bool; var tv: Bool; var memories: Bool; var learn: Bool; var analysis: Bool }
    struct Clock: Codable { let time: String; let ampm: String; let hour: Int }
    struct Profile: Codable { let tz: String?; let ana: String? }
    struct Agent: Codable {
        struct Hour: Codable, Identifiable { let hour: Int; let usual: Double; let high: Double; let today: Int; var id: Int { hour } }
        struct Record: Codable { let key: String; let wins: Int; let tries: Int; let thumbs_up: Int; let thumbs_down: Int }
        struct StepRun: Codable { let ref: String; let chain: [String]? }
        struct LastRun: Codable { let time: String; let ampm: String }
        let rhythm: [Hour]?
        let playbook: [Record]?
        let steps: [StepRun]?
        let lastRun: LastRun?
        let events: Int?
    }

    let profile: Profile?
    let topics: [String: String]
    let answers: [String: Answer]
    let memories: [Memory]
    let reminders: [Reminder]
    let playbook: [Step]
    let agent: Agent?
    let note: Note?
    let ai: Ai?
    let clock: Clock
}

struct Me: Codable {
    struct Account: Codable { let id: String; let name: String?; let role: String?; let scope: String?; let onboarded: Bool? }
    struct Person: Codable, Identifiable {
        let id: String
        let name: String
        let calls: String?
        let age: Int?
        let condition: String?
        let devices: [String]?
        let tvPaired: Bool?
        let asksToday: Int?
        let open: Int?
    }
    let account: Account
    let people: [Person]
}

struct Topic: Codable, Identifiable {
    let id: String
    let question: String
    let phrasings: [String]
    let pin: Bool?
    let answer: Family.Answer?
}

struct Patterns: Codable {
    struct Asked: Codable, Identifiable { let id: String; let question: String; let week: Double; let today: Int; let byHour: [Int]; let answer: String? }
    struct Ask: Codable { let at: String; let topic: String?; let said: String?; let reply: String?; let answered: Bool }
    struct Unanswered: Codable, Identifiable { let id: String; let at: String; let text: String }
    struct Step: Codable { let at: String; let title: String; let body: String?; let result: String? }
    struct Learning: Codable { let day: Int; let of: Int }
    let topics: [Asked]
    let recent: [Ask]
    let unanswered: [Unanswered]
    let steps: [Step]
    let learning: Learning?
}

struct Fact: Codable, Identifiable { let id: String; let kind: String; let text: String; let at: String }
struct About: Codable { let facts: [Fact] }
struct Devices: Codable { let key: String; let mcpUrl: String; let tvPaired: Bool }
struct Session: Codable { let session: String }

struct Check: Codable { let rosa_text: String; let tv_line: String; let issues: [String]; let suggestion: String? }
struct Draft: Codable { var title: String; var caption: String; var story: String; var tags: [String] }
struct Photo: Codable { let data: String; let mediaType: String }

@MainActor
final class Lumina: ObservableObject {
    static let web = "https://d34mg9c3oavp9o.cloudfront.net"
    let base = UserDefaults.standard.string(forKey: "api") ?? "https://i6fya4jsl7snqhu6z6qkffmr7q0ubogx.lambda-url.us-east-1.on.aws"
    @Published var session = Keychain.session { didSet { Keychain.session = session } }
    @Published var personId = UserDefaults.standard.string(forKey: "person") ?? "" { didSet { UserDefaults.standard.set(personId, forKey: "person") } }
    @Published var me: Me?
    @Published var family: Family?
    @Published var feed: [FeedItem] = []
    @Published var topics: [Topic] = []
    @Published var patterns: Patterns?
    @Published var key: String?
    @Published var offline = false
    @Published var adding = false

    init() {
        #if DEBUG
        if let s = UserDefaults.standard.string(forKey: "debugSession") { session = s }
        if UserDefaults.standard.bool(forKey: "mock") { session = nil; UserDefaults.standard.set(0, forKey: "onboardingStep") }
        #endif
    }

    var open: Int { feed.filter(\.isOpen).count }
    private var seen: Set<String>?
    var person: Me.Person? { me?.people.first { $0.id == personId } }
    var calls: String { person?.calls ?? person?.name ?? "Mom" }

    func call<T: Decodable, B: Encodable>(_ path: String, _ body: B? = nil as String?, method: String? = nil, token: String? = nil) async throws -> T {
        var r = URLRequest(url: URL(string: base + path)!)
        r.httpMethod = method ?? (body == nil ? "GET" : "POST")
        r.setValue("application/json", forHTTPHeaderField: "content-type")
        if let t = token ?? session { r.setValue("Bearer \(t)", forHTTPHeaderField: "authorization") }
        if !personId.isEmpty { r.setValue(personId, forHTTPHeaderField: "x-lumina-person") }
        if let body { r.httpBody = try JSONEncoder().encode(body) }
        let (data, res) = try await URLSession.shared.data(for: r)
        let status = (res as? HTTPURLResponse)?.statusCode ?? 500
        if status == 401 { throw URLError(.userAuthenticationRequired) }
        guard status < 300 else { throw URLError(.badServerResponse) }
        return try JSONDecoder().decode(T.self, from: data)
    }

    func signIn(_ path: String, _ body: [String: String]) async throws {
        show("")
        let s: Session = try await call(path, body)
        me = try await call("/api/me", token: s.session)
        session = s.session
    }

    func loadMe() async {
        do {
            let m: Me = try await call("/api/me")
            me = m
            offline = false
            if m.people.count == 1 && m.account.scope != "many" { personId = m.people[0].id } else if person == nil { personId = "" }
        } catch URLError.userAuthenticationRequired {
            signOut()
        } catch {
            offline = true
        }
    }

    func show(_ id: String) {
        family = nil; feed = []; topics = []; patterns = nil; key = nil; seen = nil
        personId = id
    }

    func signOut() {
        session = nil; me = nil
        show("")
        UserDefaults.standard.set(0, forKey: "onboardingStep")
    }

    func send(_ path: String, _ body: some Encodable, method: String = "POST") async {
        let _: Ok? = try? await call(path, body, method: method)
        await refresh()
    }

    func refresh() async {
        async let f: Family = call("/api/family")
        async let items: [FeedItem] = call("/api/phone/feed")
        async let t: [Topic]? = try? call("/api/topics")
        async let p: Patterns? = try? call("/api/patterns")
        (topics, patterns) = await (t ?? topics, p ?? patterns)
        do {
            (family, feed) = try await (f, items)
            offline = false
            notifyNew()
        } catch {
            offline = true
        }
    }

    func notifyNew() {
        let ids = Set(feed.map(\.id))
        defer { seen = (seen ?? []).union(ids) }
        guard let seen, family?.ai?.notify == true else { return }
        for item in feed where !seen.contains(item.id) {
            let content = UNMutableNotificationContent()
            content.title = item.title
            content.body = item.body ?? ""
            content.sound = .default
            UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: item.id, content: content, trigger: nil))
        }
    }

    func poll() async {
        key = ((try? await call("/api/person/devices")) as Devices?)?.key
        while !Task.isCancelled {
            await refresh()
            try? await Task.sleep(for: .seconds(3))
        }
    }

    func media(_ url: String) -> URL? {
        URL(string: base + url + "?png=1" + (key.map { "&t=\($0)" } ?? ""))
    }

    func time(_ iso: String) -> String {
        guard let d = ISO8601DateFormatter.withFraction.date(from: iso) else { return "" }
        return d.formatted(Date.FormatStyle(date: .omitted, time: .shortened, timeZone: TimeZone(identifier: family?.profile?.tz ?? "") ?? .current))
    }
}

struct Ok: Decodable {}

enum Keychain {
    static let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrAccount as String: "session"]

    static var session: String? {
        get {
            var out: AnyObject?
            SecItemCopyMatching(query.merging([kSecReturnData as String: true]) { $1 } as CFDictionary, &out)
            return (out as? Data).flatMap { String(data: $0, encoding: .utf8) }
        }
        set {
            SecItemDelete(query as CFDictionary)
            if let newValue { SecItemAdd(query.merging([kSecValueData as String: Data(newValue.utf8)]) { $1 } as CFDictionary, nil) }
        }
    }
}

func slug(_ s: String) -> String {
    s.lowercased().components(separatedBy: CharacterSet.alphanumerics.inverted).filter { !$0.isEmpty }.joined(separator: "_")
}

extension ISO8601DateFormatter {
    static let withFraction: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
}

extension Color {
    static let ink = Color(red: 0x0F / 255, green: 0x3A / 255, blue: 0x5A / 255)
    static let navy = Color(red: 0x14 / 255, green: 0x50 / 255, blue: 0x79 / 255)
    static let inkSoft = Color(red: 0x5F / 255, green: 0x7A / 255, blue: 0x88 / 255)
    static let gold = Color(red: 0xE2 / 255, green: 0xB2 / 255, blue: 0x62 / 255)
    static let aqua = Color(red: 0x3C / 255, green: 0x9A / 255, blue: 0x9C / 255)
    static let sky = Color(red: 0x8D / 255, green: 0xAD / 255, blue: 0xC4 / 255)
    static let rose = Color(red: 0xC4 / 255, green: 0x50 / 255, blue: 0x6A / 255)
    static let mist = Color(red: 0xEC / 255, green: 0xF3 / 255, blue: 0xF8 / 255)
    static let paper = Color(red: 0xFA / 255, green: 0xF7 / 255, blue: 0xEC / 255)
    static let line = Color(red: 0x0F / 255, green: 0x3A / 255, blue: 0x5A / 255).opacity(0.14)
}
