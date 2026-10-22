import Charts
import SwiftUI

struct PatternsView: View {
    @EnvironmentObject var lumina: Lumina
    @State private var adding: Patterns.Unanswered?

    var body: some View {
        if let p = lumina.patterns {
            let byHour = (0..<24).map { h in p.topics.reduce(0) { $0 + ($1.byHour[safe: h] ?? 0) } }
            let week = Int(p.topics.reduce(0) { $0 + $1.week }.rounded())
            let peak = byHour.firstIndex(of: byHour.max() ?? 0) ?? 0
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    if let learning = p.learning {
                        Card {
                            Caps(text: "Learning day \(learning.day) of \(learning.of)")
                            Text("Lumina is learning \(lumina.calls)'s rhythm. It compares them with no one else, only their own last 14 days.").font(.subheadline).foregroundStyle(Color.inkSoft)
                            ProgressLine(value: Double(learning.day) / Double(learning.of))
                        }
                    }

                    VStack(alignment: .leading, spacing: 4) {
                        Text("\(week)").font(.system(size: 64, weight: .regular, design: .serif)).foregroundStyle(Color.ink).contentTransition(.numericText())
                        Text("questions this week").foregroundStyle(Color.inkSoft)
                        HStack(spacing: 18) {
                            stat("\(p.topics.reduce(0) { $0 + $1.today })", "today")
                            stat(span(peak), "busiest")
                            stat("\(p.unanswered.count)", "need you")
                        }
                        .padding(.top, 14)
                    }
                    .rise(0)

                    section("When \(lumina.calls) asks") {
                        Chart {
                            ForEach(6..<24, id: \.self) { h in
                                BarMark(x: .value("Hour", h), y: .value("Asks", byHour[h]), width: .fixed(9))
                                    .foregroundStyle(h == peak ? Color.navy : Color.aqua.opacity(0.45))
                                    .clipShape(Capsule())
                            }
                            if let now = lumina.family?.clock.hour, now >= 6 {
                                RuleMark(x: .value("Now", now)).foregroundStyle(Color.gold).lineStyle(StrokeStyle(lineWidth: 1.5, dash: [3, 3]))
                            }
                        }
                        .chartYAxis(.hidden)
                        .chartXAxis {
                            AxisMarks(values: [6, 9, 12, 15, 18, 21]) { v in
                                AxisValueLabel { if let h = v.as(Int.self) { Text(hour(h)).font(.caption2).foregroundStyle(Color.inkSoft) } }
                            }
                        }
                        .frame(height: 150)
                        .accessibilityLabel("Questions by hour over the last 7 days. Busiest \(span(peak)).")
                    }
                    .rise(1)

                    section("What \(lumina.calls) asks") {
                        let top = max(p.topics.map(\.week).max() ?? 1, 1)
                        ForEach(p.topics) { t in
                            VStack(alignment: .leading, spacing: 8) {
                                HStack(alignment: .firstTextBaseline) {
                                    Text(t.question).font(.body.weight(.semibold)).foregroundStyle(Color.ink)
                                    Spacer()
                                    Text("\(Int(t.week.rounded()))").font(.subheadline.monospacedDigit()).foregroundStyle(Color.inkSoft)
                                }
                                GeometryReader { g in
                                    Capsule().fill(Color.line).overlay(alignment: .leading) {
                                        Capsule().fill(Color.aqua).frame(width: max(6, g.size.width * t.week / top))
                                    }
                                }
                                .frame(height: 5)
                            }
                            .padding(.vertical, 6)
                        }
                    }
                    .rise(2)

                    if !p.unanswered.isEmpty {
                        section("Needs an answer") {
                            ForEach(p.unanswered) { item in
                                UnansweredRow(item: item) { adding = item }
                                if item.id != p.unanswered.last?.id { Color.line.frame(height: 1) }
                            }
                        }
                        .rise(3)
                    }

                }
                .padding(.horizontal, 20)
                .padding(.bottom, 24)
            }
            .refreshable { await lumina.refresh() }
            .sheet(item: $adding) { item in
                TopicEditor(topic: Topic(id: "", question: item.text, phrasings: [], pin: nil, answer: nil)) {
                    Task { await lumina.send("/api/patterns/resolve", ["id": item.id]) }
                }
            }
        } else {
            ContentUnavailableView("No patterns yet", systemImage: "chart.bar",
                                   description: Text("They show up here once \(lumina.calls) starts asking."))
        }
    }

    func section<C: View>(_ title: String, @ViewBuilder content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Caps(text: title)
            Card { content() }
        }
    }

    func stat(_ value: String, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value).font(.headline.monospacedDigit()).foregroundStyle(Color.ink)
            Text(label).font(.caption).foregroundStyle(Color.inkSoft)
        }
    }

    func hour(_ h: Int) -> String { "\(h % 12 == 0 ? 12 : h % 12)\(h < 12 ? "a" : "p")" }
    func span(_ h: Int) -> String { "\(hour(h))–\(hour((h + 1) % 24))" }

    func question(_ id: String) -> String {
        lumina.topics.first { $0.id == id }?.question ?? lumina.patterns?.topics.first { $0.id == id }?.question ?? id
    }
}

extension Array {
    subscript(safe i: Int) -> Element? { indices.contains(i) ? self[i] : nil }
}

struct UnansweredRow: View {
    @EnvironmentObject var lumina: Lumina
    let item: Patterns.Unanswered
    let newQuestion: () -> Void
    @State private var match: Topic?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("“\(item.text)”").font(.body.weight(.semibold)).foregroundStyle(Color.ink)
            Text(lumina.time(item.at)).font(.caption).foregroundStyle(Color.inkSoft)
            ViewThatFits {
                HStack { buttons }
                VStack(alignment: .leading) { buttons }
            }
        }
        .padding(.vertical, 4)
        .controlSize(.small)
        .buttonBorderShape(.capsule)
        .task {
            struct Match: Decodable { let topic: String? }
            let m: Match? = try? await lumina.call("/api/topics/match", ["text": item.text])
            match = lumina.topics.first { $0.id == m?.topic }
        }
    }

    @ViewBuilder var buttons: some View {
        if let match {
            Button("Same as “\(match.question)”") { resolve(match.id) }.buttonStyle(.borderedProminent)
        } else {
            Menu("Same as…") { ForEach(lumina.topics) { t in Button(t.question) { resolve(t.id) } } }.buttonStyle(.bordered)
        }
        Button("New question", action: newQuestion).buttonStyle(.bordered)
    }

    func resolve(_ topic: String) {
        Task { await lumina.send("/api/patterns/resolve", ["id": item.id, "topic": topic]) }
    }
}
