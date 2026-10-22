import SwiftUI

struct InboxView: View {
    @EnvironmentObject var lumina: Lumina

    var body: some View {
        let open = lumina.feed.filter(\.isOpen), rest = lumina.feed.filter { !$0.isOpen }
        List {
            if !open.isEmpty {
                Section {
                    ForEach(open) { row($0, open: true) }
                } header: { Heading(title: "Needs you", count: open.count) }
            }
            if !rest.isEmpty {
                Section {
                    ForEach(rest) { row($0, open: false) }
                } header: { Heading(title: open.isEmpty ? "Today" : "Earlier") }
            }
        }
        .listStyle(.plain)
        .refreshable { await lumina.refresh() }
        .overlay {
            if lumina.feed.isEmpty {
                ContentUnavailableView("Nothing yet today", systemImage: "sun.max",
                                       description: Text("When \(lumina.calls) asks something new, or Lumina takes a step, it shows up here."))
            }
        }
    }

    func row(_ item: FeedItem, open: Bool) -> some View {
        FeedRow(item: item, chain: lumina.family?.agent?.steps?.first { $0.ref == item.ref }?.chain)
            .padding(open ? 14 : 0)
            .background(open ? RoundedRectangle(cornerRadius: 12).fill(.white) : nil)
            .overlay(alignment: .leading) { if open { UnevenRoundedRectangle(topLeadingRadius: 12, bottomLeadingRadius: 12).fill(FeedRow.color(item.kind)).frame(width: 4) } }
            .listRowBackground(Color.clear)
            .listRowSeparator(open ? .hidden : .visible)
            .listRowSeparatorTint(Color.line)
    }
}

struct Heading: View {
    let title: String
    var count: Int?

    var body: some View {
        HStack(spacing: 10) {
            Text(title).font(.system(.title2, design: .serif).weight(.semibold)).foregroundStyle(Color.ink)
            if let count {
                Text("\(count)").font(.footnote.weight(.bold)).foregroundStyle(.white)
                    .padding(.horizontal, 8).padding(.vertical, 2).background(Capsule().fill(Color.navy))
            }
        }
        .textCase(nil)
        .padding(.top, 8)
        .padding(.bottom, 4)
    }
}

struct FeedRow: View {
    @EnvironmentObject var lumina: Lumina
    let item: FeedItem
    let chain: [String]?
    @State private var why = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Circle().fill(Self.color(item.kind)).frame(width: 7, height: 7)
                Caps(text: lumina.time(item.at))
            }
            Text(item.title).font(.system(.title3, design: .serif).weight(.semibold)).foregroundStyle(Color.ink)
            if let memory = item.memory {
                Color.mist.frame(height: 200)
                    .overlay { AsyncImage(url: lumina.media("/media/\(memory)")) { $0.resizable().scaledToFill() } placeholder: {} }
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .padding(.vertical, 4)
            }
            if let body = item.body { Text(body).font(.subheadline).foregroundStyle(Color.inkSoft) }
            if let result = item.result { Text(result).font(.subheadline).foregroundStyle(Color.aqua) }
            if let reason = item.why {
                DisclosureGroup("Why?", isExpanded: $why) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(reason)
                        if let chain { Text(chain.joined(separator: "\n")).font(.caption.monospaced()).foregroundStyle(.secondary) }
                    }
                }
                .font(.subheadline)
            }
            actions
        }
        .padding(.vertical, 10)
        .buttonBorderShape(.capsule)
    }

    @ViewBuilder var actions: some View {
        let path = "/api/phone/feed/\(item.id.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? item.id)"
        if item.actions == "rate" {
            HStack(spacing: 12) {
                ForEach([("up", "hand.thumbsup"), ("down", "hand.thumbsdown")], id: \.0) { value, icon in
                    Button {
                        Task { await lumina.send("\(path)/rate", ["rating": value]) }
                    } label: {
                        Image(systemName: item.rating == value ? "\(icon).fill" : icon)
                    }
                    .buttonStyle(.bordered)
                    .accessibilityLabel(value == "up" ? "Useful" : "Not useful")
                }
            }
        } else if item.actions == "decide" {
            if let decision = item.decision {
                Text(decision == "approve" ? "You approved this." : "You said not now.").font(.subheadline).foregroundStyle(.secondary)
            } else {
                HStack {
                    Button("Approve") { Task { await lumina.send("\(path)/decide", ["decision": "approve"]) } }.buttonStyle(.borderedProminent)
                    Button("Not now") { Task { await lumina.send("\(path)/decide", ["decision": "deny"]) } }.buttonStyle(.bordered)
                }
            }
        }
    }

    static func color(_ kind: String) -> Color {
        switch kind {
        case "escalation", "approval": .rose
        case "agent", "note": .gold
        default: .aqua
        }
    }
}
