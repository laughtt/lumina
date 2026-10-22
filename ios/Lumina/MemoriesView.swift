import PhotosUI
import SwiftUI

struct MemoriesView: View {
    @EnvironmentObject var lumina: Lumina
    @State private var open: Family.Memory?
    @State private var adding = false
    @State private var inviting = false
    @Namespace private var zoom

    var memories: [Family.Memory] { (lumina.family?.memories ?? []).sorted { ($0.year ?? 9999) < ($1.year ?? 9999) } }
    var decades: [(Int, [Family.Memory])] { Dictionary(grouping: memories) { ($0.year ?? 0) / 10 * 10 }.sorted { $0.key < $1.key } }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                if let hero = memories.first(where: { $0.calming == true }) ?? memories.last {
                    Button { open = hero } label: { Featured(memory: hero) }
                        .buttonStyle(Press())
                        .matchedTransitionSource(id: hero.id, in: zoom)
                        .rise(0)
                }
                ForEach(Array(decades.enumerated()), id: \.element.0) { i, group in
                    VStack(alignment: .leading, spacing: 10) {
                        Caps(text: group.0 == 0 ? "Undated" : "\(String(group.0))s · \(group.1.count)")
                        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 3), spacing: 6) {
                            ForEach(group.1) { m in
                                Button { open = m } label: {
                                    Color.mist.aspectRatio(1, contentMode: .fit)
                                        .overlay { AlbumPhoto(memory: m, fill: true) }
                                        .clipShape(RoundedRectangle(cornerRadius: 8))
                                        .accessibilityLabel(m.title)
                                }
                                .buttonStyle(Press())
                                .matchedTransitionSource(id: m.id, in: zoom)
                            }
                        }
                    }
                    .rise(Double(i) + 1)
                }
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 24)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(Color.paper)
        .refreshable { await lumina.refresh() }
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Menu("Add", systemImage: "plus") {
                    Button("Add a photo", systemImage: "photo") { adding = true }
                    Button("Invite family", systemImage: "person.2") { inviting = true }
                }
            }
        }
        .sheet(isPresented: $adding) { AddMemory() }
        .sheet(isPresented: $inviting) { Invite().presentationDetents([.medium]) }
        .fullScreenCover(item: $open) { m in
            Album(memories: memories, current: m.id).navigationTransition(.zoom(sourceID: m.id, in: zoom))
        }
        .overlay {
            if lumina.family == nil {
                ProgressView()
            } else if memories.isEmpty {
                ContentUnavailableView("No photos yet", systemImage: "photo.on.rectangle", description: Text("Add an old photo and Lumina tells \(lumina.calls) its story."))
            }
        }
    }
}

struct AlbumPhoto: View {
    @EnvironmentObject var lumina: Lumina
    let memory: Family.Memory
    var fill = false

    var body: some View {
        AsyncImage(url: lumina.media(memory.url), transaction: Transaction(animation: .easeOut(duration: 0.35))) { phase in
            if let image = phase.image {
                if fill { image.resizable().scaledToFill() } else { image.resizable().scaledToFit() }
            } else {
                Color.mist.aspectRatio(4 / 5, contentMode: .fit)
            }
        }
    }
}

struct Featured: View {
    @EnvironmentObject var lumina: Lumina
    let memory: Family.Memory

    var body: some View {
        Color.mist
            .frame(height: 260)
            .overlay { AlbumPhoto(memory: memory, fill: true) }
            .overlay(alignment: .bottomLeading) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("\(lumina.calls.uppercased())'S FAVOURITE").font(.caption.weight(.semibold)).tracking(1.4).foregroundStyle(.white.opacity(0.85))
                    Text(memory.title).font(.system(.title, design: .serif)).foregroundStyle(.white)
                    Text(memory.caption).font(.subheadline).foregroundStyle(.white.opacity(0.9)).multilineTextAlignment(.leading)
                }
                .padding(20)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(LinearGradient(colors: [.clear, Color.ink.opacity(0.75)], startPoint: .top, endPoint: .bottom))
            }
            .clipShape(RoundedRectangle(cornerRadius: 18))
            .accessibilityElement(children: .combine)
    }
}

struct Album: View {
    @EnvironmentObject var lumina: Lumina
    let memories: [Family.Memory]
    @State var current: String
    @State private var shown: String?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        TabView(selection: $current) {
            ForEach(memories) { m in
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        AlbumPhoto(memory: m).clipShape(RoundedRectangle(cornerRadius: 14)).padding(.top, 64)
                        if let year = m.year { Caps(text: String(year)).padding(.top, 8) }
                        Text(m.title).font(.system(.largeTitle, design: .serif)).foregroundStyle(Color.ink)
                        Text(m.story ?? m.caption).font(.body).foregroundStyle(Color.inkSoft).lineSpacing(4)
                        Button {
                            Task {
                                let _: Ok? = try? await lumina.call("/api/tv/memory", ["id": m.id])
                                withAnimation(.spring(duration: 0.4)) { shown = m.id }
                            }
                        } label: {
                            Label(shown == m.id ? "On \(lumina.calls)'s TV now" : "Show on \(lumina.calls)'s TV", systemImage: shown == m.id ? "checkmark" : "tv")
                                .font(.headline).foregroundStyle(shown == m.id ? Color.aqua : .white)
                                .frame(maxWidth: .infinity, minHeight: 50)
                                .background(Capsule().fill(shown == m.id ? Color.aqua.opacity(0.12) : Color.navy))
                                .contentTransition(.symbolEffect(.replace))
                        }
                        .buttonStyle(Press())
                        .sensoryFeedback(.success, trigger: shown)
                        .padding(.top, 8)
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 48)
                }
                .tag(m.id)
            }
        }
        .tabViewStyle(.page(indexDisplayMode: .never))
        .background(Color.paper.ignoresSafeArea())
        .overlay(alignment: .topTrailing) {
            Button("Close", systemImage: "xmark") { dismiss() }
                .labelStyle(.iconOnly).font(.body.weight(.semibold)).foregroundStyle(Color.ink)
                .frame(width: 40, height: 40).background(Circle().fill(.ultraThinMaterial))
                .padding(.horizontal, 20).padding(.top, 8)
        }
        .overlay(alignment: .bottom) {
            HStack(spacing: 6) {
                ForEach(memories) { m in Capsule().fill(m.id == current ? Color.navy : Color.line).frame(width: m.id == current ? 18 : 6, height: 6) }
            }
            .animation(.spring(duration: 0.4), value: current)
            .padding(.bottom, 8)
        }
    }
}

struct Invite: View {
    @EnvironmentObject var lumina: Lumina
    @State private var link: URL?

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Invite family").font(.system(.title, design: .serif)).foregroundStyle(Color.ink)
            Text("Anyone with this link can send photos for \(lumina.calls), no app needed. You see each one in Updates first, and only the ones you approve reach \(lumina.calls)'s TV.")
                .foregroundStyle(Color.inkSoft)
            if let link {
                Text(link.absoluteString).font(.footnote.monospaced()).foregroundStyle(Color.inkSoft).lineLimit(1).truncationMode(.middle)
                    .padding(12).frame(maxWidth: .infinity, alignment: .leading)
                    .background(RoundedRectangle(cornerRadius: 8).fill(.white))
                    .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Color.line))
                ShareLink(item: link, message: Text("Send a photo for \(lumina.calls)'s album")) {
                    Label("Share the link", systemImage: "square.and.arrow.up").font(.headline).foregroundStyle(.white)
                        .frame(maxWidth: .infinity, minHeight: 52).background(Capsule().fill(Color.navy))
                }
                .buttonStyle(Press())
                Button("Make a new link (the old one stops working)") { Task { await load(fresh: true) } }
                    .font(.footnote).foregroundStyle(Color.inkSoft).frame(maxWidth: .infinity)
            } else {
                ProgressView().frame(maxWidth: .infinity)
            }
        }
        .padding(24)
        .frame(maxHeight: .infinity, alignment: .top)
        .background(Color.paper)
        .task { await load(fresh: false) }
    }

    func load(fresh: Bool) async {
        struct Out: Decodable { let path: String }
        let out: Out? = try? await lumina.call("/api/share", ["fresh": fresh])
        link = out.flatMap { URL(string: Lumina.web + $0.path) }
    }
}

struct AddMemory: View {
    @EnvironmentObject var lumina: Lumina
    @Environment(\.dismiss) private var dismiss
    @State private var pick: PhotosPickerItem?
    @State private var photo: UIImage?
    @State private var line = ""
    @State private var draft: Draft?
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Form {
                PhotosPicker(selection: $pick, matching: .images) {
                    if let photo {
                        Image(uiImage: photo).resizable().scaledToFit().frame(maxHeight: 240).clipShape(RoundedRectangle(cornerRadius: 10))
                    } else {
                        Label("Choose an old photo", systemImage: "photo")
                    }
                }
                TextField("One line, e.g. Dad's 40th, Porto, 1984", text: $line)
                if let draft = Binding($draft) {
                    TextField("Title", text: draft.title)
                    TextField("Caption", text: draft.caption, axis: .vertical)
                    TextField("Story Lumina tells", text: draft.story, axis: .vertical)
                    Text("\(lumina.calls) can find it by saying: \(draft.wrappedValue.tags.joined(separator: ", "))").font(.caption).foregroundStyle(.secondary)
                    Button("Add to \(lumina.calls)'s album") { Task { await save() } }
                } else {
                    Button(busy ? "Lumina is looking…" : "Draft the card") { Task { await makeDraft() } }
                        .disabled(photo == nil || line.trimmingCharacters(in: .whitespaces).isEmpty || busy)
                }
            }
            .scrollContentBackground(.hidden)
            .background(Color.paper)
            .navigationTitle("Add a memory")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { Button("Close", systemImage: "xmark") { dismiss() } }
        }
        .onChange(of: pick) {
            Task {
                guard let data = try? await pick?.loadTransferable(type: Data.self) else { return }
                photo = UIImage(data: data).map(shrink)
                draft = nil
            }
        }
    }

    var upload: Photo? {
        photo?.jpegData(compressionQuality: 0.6).map { Photo(data: $0.base64EncodedString(), mediaType: "image/jpeg") }
    }

    func makeDraft() async {
        busy = true
        struct Body: Encodable { let line: String; let image: Photo? }
        draft = try? await lumina.call("/api/memories/draft", Body(line: line, image: upload))
        busy = false
    }

    func save() async {
        guard let draft, let image = upload else { return }
        struct Body: Encodable { let title, caption, story: String; let tags: [String]; let image: Photo }
        await lumina.send("/api/memories", Body(title: draft.title, caption: draft.caption, story: draft.story, tags: draft.tags, image: image))
        dismiss()
    }

    func shrink(_ image: UIImage) -> UIImage {
        let k = min(1, 1024 / max(image.size.width, image.size.height))
        let size = CGSize(width: (image.size.width * k).rounded(), height: (image.size.height * k).rounded())
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        return UIGraphicsImageRenderer(size: size, format: format).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
    }
}
