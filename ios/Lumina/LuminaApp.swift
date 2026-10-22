import SwiftUI
import UserNotifications

@main
struct LuminaApp: App {
    @StateObject private var lumina = Lumina()

    init() {
        let serif = { (style: UIFont.TextStyle) in UIFont(descriptor: UIFontDescriptor.preferredFontDescriptor(withTextStyle: style).withDesign(.serif)!, size: 0) }
        UINavigationBar.appearance().largeTitleTextAttributes = [.font: serif(.largeTitle), .foregroundColor: UIColor(Color.ink)]
        UINavigationBar.appearance().titleTextAttributes = [.font: serif(.headline), .foregroundColor: UIColor(Color.ink)]
        let tabs = UITabBarAppearance()
        tabs.configureWithDefaultBackground()
        for item in [tabs.stackedLayoutAppearance, tabs.inlineLayoutAppearance, tabs.compactInlineLayoutAppearance] {
            item.normal.iconColor = UIColor(Color.inkSoft)
            item.normal.titleTextAttributes = [.foregroundColor: UIColor(Color.inkSoft)]
        }
        UITabBar.appearance().standardAppearance = tabs
        UITabBar.appearance().scrollEdgeAppearance = tabs
        UNUserNotificationCenter.current().delegate = Banner.shared
    }

    var body: some Scene {
        WindowGroup {
            Group {
                if lumina.session == nil || lumina.me?.account.onboarded == false {
                    Onboarding()
                } else if lumina.me == nil {
                    Waiting()
                } else if lumina.personId.isEmpty {
                    PeopleList()
                } else {
                    PersonHome()
                }
            }
            .fullScreenCover(isPresented: $lumina.adding) { Onboarding(adding: true).environmentObject(lumina) }
            .task(id: lumina.session) { if lumina.session != nil { await lumina.loadMe() } }
            .environmentObject(lumina)
            .tint(.navy)
            .preferredColorScheme(.light)
        }
    }
}

struct Waiting: View {
    @EnvironmentObject var lumina: Lumina
    @State private var settings = false

    var body: some View {
        VStack(spacing: 16) {
            if lumina.offline {
                ContentUnavailableView("Can't reach Lumina", systemImage: "wifi.slash", description: Text("Check your internet connection, then try again."))
                Button("Try again") { Task { await lumina.loadMe() } }.buttonStyle(.borderedProminent)
                Button("Settings") { settings = true }
            } else {
                ProgressView()
            }
        }
        .sheet(isPresented: $settings) { Settings() }
    }
}

struct PersonHome: View {
    @EnvironmentObject var lumina: Lumina
    @AppStorage("tab") private var tab = 0
    @State private var settings = false

    var body: some View {
        TabView(selection: $tab) {
            screen("Updates", InboxView()).tabItem { Label("Updates", systemImage: "bell").environment(\.symbolVariants, .none) }.badge(lumina.open).tag(0)
            screen("Questions", QuestionsView()).tabItem { Label("Questions", systemImage: "quote.bubble").environment(\.symbolVariants, .none) }.tag(1)
            screen("Patterns", PatternsView()).tabItem { Label("Patterns", systemImage: "chart.bar").environment(\.symbolVariants, .none) }.tag(2)
            screen("About \(lumina.calls)", AboutView()).tabItem { Label("About", systemImage: "heart").environment(\.symbolVariants, .none) }.tag(3)
            screen("Memories", MemoriesView()).tabItem { Label("Memories", systemImage: "photo.on.rectangle").environment(\.symbolVariants, .none) }.tag(4)
        }
        .task(id: lumina.personId) { await lumina.poll() }
        .sheet(isPresented: $settings) { Settings() }
    }

    func screen(_ title: String, _ content: some View) -> some View {
        NavigationStack {
            content
                .scrollContentBackground(.hidden)
                .background(Color.paper)
                .navigationTitle(title)
                .toolbar {
                    if (lumina.me?.people.count ?? 0) > 1 || lumina.me?.account.scope == "many" {
                        ToolbarItem(placement: .topBarLeading) { Button("People", systemImage: "person.2") { lumina.show("") } }
                    }
                    ToolbarItem { Button("Settings", systemImage: "gearshape") { settings = true } }
                }
        }
        .safeAreaInset(edge: .bottom) {
            if lumina.offline {
                Text("Can't reach Lumina. Check the address in Settings.")
                    .font(.footnote).frame(maxWidth: .infinity).padding(8).background(Color.rose.opacity(0.15))
            }
        }
    }
}

struct PeopleList: View {
    @EnvironmentObject var lumina: Lumina
    @State private var settings = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    ForEach(lumina.me?.people ?? []) { p in
                        Button { lumina.show(p.id) } label: { PersonCard(person: p) }.buttonStyle(.plain)
                    }
                    Button { lumina.adding = true } label: {
                        Label("Add someone", systemImage: "plus")
                            .font(.headline).frame(maxWidth: .infinity, minHeight: 56)
                            .background(RoundedRectangle(cornerRadius: 18).strokeBorder(Color.aqua.opacity(0.5), style: StrokeStyle(lineWidth: 1.5, dash: [6, 5])))
                    }
                }
                .padding()
            }
            .background(Color.paper)
            .navigationTitle("The people you care for")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { Button("Settings", systemImage: "gearshape") { settings = true } }
            .refreshable { await lumina.loadMe() }
            .sheet(isPresented: $settings) { Settings() }
        }
    }
}

struct PersonCard: View {
    let person: Me.Person

    var body: some View {
        HStack(spacing: 16) {
            Text(String(person.name.prefix(1)))
                .font(.title2.weight(.semibold)).foregroundStyle(Color.ink)
                .frame(width: 56, height: 56)
                .background(Circle().fill(RadialGradient(colors: [.gold, .gold.opacity(0.35)], center: .center, startRadius: 4, endRadius: 34)))
            VStack(alignment: .leading, spacing: 4) {
                Text(person.name).font(.title3.weight(.semibold))
                Text([person.calls, person.age.map { "\($0)" }, person.condition].compactMap { $0 }.joined(separator: " · "))
                    .font(.subheadline).foregroundStyle(.secondary)
                (Text("\(person.asksToday ?? 0) asks today") + Text((person.open ?? 0) > 0 ? " · \(person.open ?? 0) waiting for you" : "").foregroundStyle(Color.rose))
                    .font(.footnote).foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right").foregroundStyle(.tertiary)
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 18).fill(Color(.secondarySystemGroupedBackground)))
        .accessibilityElement(children: .combine)
    }
}

struct Settings: View {
    @EnvironmentObject var lumina: Lumina
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                if lumina.session != nil {
                    Section {
                        if lumina.me?.account.onboarded == true {
                            Button("Add someone") { dismiss(); lumina.adding = true }
                        }
                        Button("Sign out", role: .destructive) { dismiss(); lumina.signOut() }
                    } footer: {
                        if let name = lumina.me?.account.name { Text("Signed in as \(name).") }
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Color.paper)
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
        }
        .presentationDetents([.medium])
    }
}

final class Banner: NSObject, UNUserNotificationCenterDelegate {
    static let shared = Banner()
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions { [.banner, .sound] }
}
