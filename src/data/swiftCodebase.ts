export interface SwiftFile {
  name: string;
  path: string;
  icon: string;
  content: string;
  description: string;
}

export const SWIFT_FILES: SwiftFile[] = [
  {
    name: "VideoItem.swift",
    path: "Models/VideoItem.swift",
    icon: "swift",
    description: "Model định nghĩa đối tượng video cần tải. Chứa các trạng thái tải, thông tin cơ bản của video và tiến trình tải hiện thời.",
    content: `import Foundation

/// Định nghĩa các trạng thái của một tác vụ tải video.
enum VideoStatus: String, Codable {
    case idle         // Đang chờ hoặc mới thêm vào danh sách
    case fetching     // Đang quét lấy thông tin chi tiết (metadata)
    case downloading  // Đang tiến hành tải tệp video/audio
    case success      // Tải thành công và đã lưu file hoàn chỉnh
    case error        // Xảy ra lỗi trong quá trình quét hoặc tải
}

/// Model lưu trữ thông tin của từng video.
/// Tuân thủ Identifiable để dễ dàng hiển thị trong SwiftUI List.
struct VideoItem: Identifiable, Codable {
    let id: UUID
    let url: URL
    var title: String
    var thumbnailURL: URL?
    var duration: TimeInterval // Thời lượng video tính bằng giây
    var downloadProgress: Double // Giá trị từ 0.0 đến 1.0
    var status: VideoStatus
    var errorMessage: String?
    
    // Khởi tạo mặc định hỗ trợ tạo nhanh phần tử thủ công
    init(id: UUID = UUID(), url: URL, title: String = "Đang tải tiêu đề...", thumbnailURL: URL? = nil, duration: TimeInterval = 0, downloadProgress: Double = 0.0, status: VideoStatus = .idle, errorMessage: String? = nil) {
        self.id = id
        self.url = url
        self.title = title
        self.thumbnailURL = thumbnailURL
        self.duration = duration
        self.downloadProgress = downloadProgress
        self.status = status
        self.errorMessage = errorMessage
    }
}`
  },
  {
    name: "YTDLPService.swift",
    path: "Services/YTDLPService.swift",
    icon: "swift",
    description: "Bộ động cơ chính điều khiển lệnh dòng lệnh yt-dlp thông qua Process và Pipe. Sử dụng Regex của Swift 5.7+ để bóc tách luồng stdout liên tục bất đồng bộ.",
    content: `import Foundation

/// Delegate hoặc Callback hỗ trợ bắt tiến trình tải video
typealias ProgressHandler = (Double) -> Void

class YTDLPService {
    // Lưu trữ tham chiếu tới tiến triển chạy shell để có thể kết thúc hoặc hủy bỏ bất kỳ lúc nào.
    private var activeProcess: Process?
    private let queue = DispatchQueue(label: "com.macdownloader.service-queue", qos: .userInitiated)
    
    /// Tìm đường dẫn của file binary yt_dlp_macos được nhúng sẵn trong Resource Bundle của macOS Application.
    private var binaryURL: URL? {
        // Trong macOS App không sandbox hoặc sandbox có quyền Helper, bạn đưa file binary vào Target -> Copy Bundle Resources.
        if let url = Bundle.main.url(forResource: "yt-dlp_macos", withExtension: nil) {
            return url
        }
        // Fallback cho môi trường Simulator hoặc local testing nếu chưa nhúng
        let path = "/usr/local/bin/yt-dlp"
        if FileManager.default.fileExists(atPath: path) {
            return URL(fileURLWithPath: path)
        }
        return nil
    }
    
    /// LUỒNG 1: Fetch Metadata - Quét thông tin video dạng JSON
    /// Sử dụng async/await để không gây nghẽn main UI Thread.
    func fetchMetadata(for url: URL) async throws -> VideoItem {
        guard let exeURL = binaryURL else {
            throw NSError(domain: "YTDLPError", code: 404, userInfo: [NSLocalizedDescriptionKey: "Không tìm thấy file nhúng yt-dlp_macos trong Bundle của ứng dụng."])
        }
        
        return try await withCheckedThrowingContinuation { continuation in
            queue.async {
                let process = Process()
                let stdoutPipe = Pipe()
                let stderrPipe = Pipe()
                
                process.executableURL = exeURL
                // --dump-json: Ép yt-dlp chỉ xuất ra metadata cấu trúc JSON thay vì tải file
                // --no-playlist: Đảm bảo chỉ lấy 1 video đơn lẻ nếu liên kết nằm trong danh sách phát
                process.arguments = ["--dump-json", "--no-playlist", url.absoluteString]
                process.standardOutput = stdoutPipe
                process.standardError = stderrPipe
                
                do {
                    try process.run()
                    self.activeProcess = process
                    
                    // Đọc hết dữ liệu từ Pipe đồng bộ trong hàng đợi riêng (background queue)
                    let data = stdoutPipe.fileHandleForReading.readDataToEndOfFile()
                    let errorData = stderrPipe.fileHandleForReading.readDataToEndOfFile()
                    
                    process.waitUntilExit()
                    
                    if process.terminationStatus == 0 {
                        // Parse JSON nhận được từ yt-dlp
                        if let json = try? JSONSerialization.jsonObject(with: data, options: []) as? [String: Any] {
                            let title = json["title"] as? String ?? "Video không xác định"
                            let duration = json["duration"] as? TimeInterval ?? 0.0
                            let thumbnail = json["thumbnail"] as? String
                            
                            let item = VideoItem(
                                url: url,
                                title: title,
                                thumbnailURL: thumbnail != nil ? URL(string: thumbnail!) : nil,
                                duration: duration,
                                status: .idle
                            )
                            continuation.resume(returning: item)
                        } else {
                            continuation.resume(throwing: NSError(domain: "YTDLPError", code: 500, userInfo: [NSLocalizedDescriptionKey: "Dữ liệu trả về không đúng định dạng JSON."]))
                        }
                    } else {
                        let errStr = String(data: errorData, encoding: .utf8) ?? "Lỗi không xác định."
                        continuation.resume(throwing: NSError(domain: "YTDLPError", code: Int(process.terminationStatus), userInfo: [NSLocalizedDescriptionKey: errStr]))
                    }
                } catch {
                    continuation.resume(throwing: error)
                }
            }
        }
    }
    
    /// LUỒNG 2: Download Video - Tải video và bóc tách tiến trình tải liên tục
    /// Sử dụng AsyncStream để phát tín hiệu (yield) phần trăm tiến độ tải về ViewModel.
    func downloadVideo(item: VideoItem) -> AsyncStream<Double> {
        return AsyncStream { continuation in
            guard let exeURL = binaryURL else {
                continuation.finish()
                return
            }
            
            queue.async {
                let process = Process()
                let stdoutPipe = Pipe()
                
                process.executableURL = exeURL
                // --newline: Đảm bảo xuất đầu ra ở mỗi dòng mới, rất quan trọng để parse luồng tịnh tiến
                // -f best: Tải định dạng gộp tốt nhất
                // --progress: Ép hiển thị tiến độ trong Console
                process.arguments = ["--newline", "--progress", "-f", "best", "-o", "~/Downloads/%(title)s.%(ext)s", item.url.absoluteString]
                process.standardOutput = stdoutPipe
                
                // Trình bắt sự kiện kết thúc tiến trình để hoàn tất AsyncStream
                process.terminationHandler = { _ in
                    continuation.finish()
                }
                
                let fileHandle = stdoutPipe.fileHandleForReading
                
                // Sử dụng readabilityHandler để đọc không đồng bộ dòng ra stdout từ thiết bị ngoại vi
                fileHandle.readabilityHandler = { [weak self] handle in
                    let data = handle.availableData
                    guard !data.isEmpty else { return }
                    
                    if let outputLine = String(data: data, encoding: .utf8) {
                        // Phân tách đầu ra theo từng dòng rác hoặc dòng mới
                        let lines = outputLine.components(separatedBy: .newlines)
                        for line in lines {
                            if let progress = self?.parseProgress(from: line) {
                                // Gửi (yield) tiến độ về luồng AsyncStream tiêu thụ
                                continuation.yield(progress)
                            }
                        }
                    }
                }
                
                do {
                    try process.run()
                    self.activeProcess = process
                    process.waitUntilExit()
                } catch {
                    print("Lỗi khởi chạy thực thi: \\(error.localizedDescription)")
                    continuation.yield(-1.0) // Trả về giá trị âm báo hiệu lỗi hoặc kết thúc bất ngờ
                    continuation.finish()
                }
                
                // Dọn dẹp readabilityHandler sau khi quá trình tải kết thúc
                fileHandle.readabilityHandler = nil
            }
        }
    }
    
    /// Bóc tách phần trăm từ log ngõ ra của yt-dlp
    /// Định dạng mẫu: "[download]  12.5% of 45.33MiB at 4.21MiB/s ETA 00:08"
    private func parseProgress(from line: String) -> Double? {
        // Regex chuẩn bắt giữ dải chữ số phần trăm tải
        // Cách dùng Regex trong Swift 5.7+ rất sạch sẽ nhờ Regex Literals
        do {
            // Regex tìm kiểu: [download]  24.5% hoặc [download]  3.0%
            let regex = try Regex("\\[download\\]\\\\s+([0-9]+(?:\\\\.[0-9]+)?)\\\\%")
            if let match = try regex.firstMatch(in: line) {
                // match[1] chứa capture group đầu tiên (ví dụ: "12.5")
                if let percentStr = match.output[1].substring,
                   let percentVal = Double(percentStr) {
                    return percentVal / 100.0 // Chuyển đổi về khoảng 0.0 - 1.0 tương đương ProgressBar
                }
            }
        } catch {
            print("Regex compilation failed: \\(error)")
        }
        return nil
    }
    
    /// HỦY BỎ tiến trình hiện tại nếu người dùng ấn nút Cancel
    func cancelDownload() {
        if let process = activeProcess, process.isRunning {
            process.terminate() // Gọi hàm hệ thống macOS gửi tín hiệu SIGTERM dứt điểm tiến trình
            print("Đã phát tín hiệu Terminated tới tiến trình yt-dlp.")
        }
        activeProcess = nil
    }
}`
  },
  {
    name: "DownloaderViewModel.swift",
    path: "ViewModels/DownloaderViewModel.swift",
    icon: "swift",
    description: "ViewModel điều phối trung tâm dựa trên mô hình Swift Concurrency. Đảm bảo toàn bộ thao tác cập nhật biến trạng thái UI được thực hiện đồng quy trên Mainactor (@MainActor).",
    content: `import Foundation
import Combine

/// Sử dụng @MainActor để bảo vệ tất cả các cập nhật trạng thái UI được đẩy về Main Thread
@MainActor
class DownloaderViewModel: ObservableObject {
    // Array chứa danh sách các video đã và đang tải
    @Published var videoItems: [VideoItem] = []
    // Biến biểu thị đang bận thực hiện tác vụ (quét hoặc tải)
    @Published var isProcessing: Bool = false
    
    private let ytDLPService = YTDLPService()
    
    /// LUỒNG QUÉT (SCAN): Nhận URL từ người dùng nhập vào
    func addAndScanURL(_ urlString: String) async {
        guard let url = URL(string: urlString.trimmingCharacters(in: .whitespacesAndNewlines)) else {
            return
        }
        
        // Thêm một item tạm thời hiển thị trạng thái đang fetch thông tin
        let tempId = UUID()
        let placeholderItem = VideoItem(
            id: tempId,
            url: url,
            title: "Đang quét thông tin link: \\(url.host ?? "")...",
            status: .fetching
        )
        videoItems.append(placeholderItem)
        isProcessing = true
        
        do {
            // Gọi YTDLPService chạy bất đồng bộ ngoài background thread
            let metadata = try await ytDLPService.fetchMetadata(for: url)
            
            // Tìm và thay thế placeholder bằng metadata thật quét được
            if let index = videoItems.firstIndex(where: { $0.id == tempId }) {
                videoItems[index] = metadata
            }
        } catch {
            // Trường hợp quét lỗi, cập nhật trạng thái báo đỏ
            if let index = videoItems.firstIndex(where: { $0.id == tempId }) {
                videoItems[index].title = "Không thể quét: \\(url.lastPathComponent)"
                videoItems[index].status = .error
                videoItems[index].errorMessage = error.localizedDescription
            }
        }
        isProcessing = false
    }
    
    /// LUỒNG TẢI TRỰC TIẾP: Tải đồng loạt các phần tử đang có trạng thái idle/error
    func downloadAll() async {
        isProcessing = true
        
        // Duyệt qua tất cả các item có khả năng tải
        for index in 0..<videoItems.count {
            let item = videoItems[index]
            guard item.status == .idle || item.status == .error else { continue }
            
            // Cập nhật trạng thái bắt đầu tải
            videoItems[index].status = .downloading
            videoItems[index].downloadProgress = 0.0
            
            // Nhận luồng cập nhật tiến trình liên tục qua AsyncStream
            let progressStream = ytDLPService.downloadVideo(item: item)
            
            for try await progress in progressStream {
                // Nếu trả về -1.0 chứng tỏ tiến trình bị gián đoạn lỗi
                if progress < 0 {
                    videoItems[index].status = .error
                    videoItems[index].errorMessage = "Quá trình tải về bị ngắt quãng hoặc gặp lỗi."
                    break
                }
                
                // Cập nhật tiến độ trên Main Thread trực quan
                videoItems[index].downloadProgress = progress
            }
            
            // Hoàn tất tải một phần tử
            if videoItems[index].status == .downloading {
                videoItems[index].status = .success
                videoItems[index].downloadProgress = 1.0
            }
        }
        
        isProcessing = false
    }
    
    /// LUỒNG HỦY BỎ (CANCEL): Gửi tín hiệu dừng ngay tiến trình yt-dlp đang chạy
    func cancelAllDownloads() {
        ytDLPService.cancelDownload()
        
        // Reset trạng thái các đối tượng tải dở thành idle hoặc error tùy ý
        for index in 0..<videoItems.count {
            if videoItems[index].status == .downloading || videoItems[index].status == .fetching {
                videoItems[index].status = .idle
                videoItems[index].downloadProgress = 0.0
            }
        }
        isProcessing = false
    }
    
    /// Xóa phần tử khỏi danh sách chờ tải
    func removeItem(at indexSet: IndexSet) {
        videoItems.remove(atOffsets: indexSet)
    }
    
    /// Xây dựng lại danh sách rỗng
    func clearAll() {
        videoItems.removeAll()
    }
}`
  },
  {
    name: "ContentView.swift",
    path: "Views/ContentView.swift",
    icon: "swift",
    description: "Giao diện chính thiết kế theo ngôn ngữ thiết kế Apple macOS Native. Sử dụng Sidebar lồng ghép List hiển thị video tải, bao gói các nút điều khiển trực quan.",
    content: `import SwiftUI

struct ContentView: View {
    @StateObject private var viewModel = DownloaderViewModel()
    @State private var inputURL: String = ""
    
    var body: some View {
        NavigationSplitView {
            // Thanh Sidebar hiển thị hướng dẫn & tính năng phụ
            VStack(alignment: .leading, spacing: 14) {
                Text("Trình Tải Video")
                    .font(.title2)
                    .fontWeight(.bold)
                    .padding(.horizontal)
                
                Divider()
                
                // Thống kê nhanh danh sách tải
                VStack(alignment: .leading, spacing: 8) {
                    Label("Chờ tải: \\(viewModel.videoItems.filter({ $0.status == .idle }).count)", systemImage: "clock")
                    Label("Đang tải: \\(viewModel.videoItems.filter({ $0.status == .downloading }).count)", systemImage: "arrow.down.circle")
                    Label("Thành công: \\(viewModel.videoItems.filter({ $0.status == .success }).count)", systemImage: "checkmark.circle")
                    Label("Lỗi: \\(viewModel.videoItems.filter({ $0.status == .error }).count)", systemImage: "exclamationmark.triangle")
                }
                .font(.callout)
                .foregroundColor(.secondary)
                .padding(.horizontal)
                
                Spacer()
                
                // Panel trạng thái cơ bản hệ thống
                Text("Công cụ: yt-dlp_macos nhúng")
                    .font(.caption)
                    .foregroundColor(.gray)
                    .padding()
            }
            .navigationSplitViewColumnWidth(min: 200, ideal: 220)
        } detail: {
            // Khu vực giao diện làm việc chính (Detail View)
            VStack(spacing: 0) {
                // THANH NHẬP URL - TOP BAR
                HStack(spacing: 12) {
                    Image(systemName: "link")
                        .foregroundColor(.secondary)
                    
                    TextField("Dán link video YouTube, TikTok, Facebook vào đây...", text: $inputURL)
                        .textFieldStyle(.plain)
                        .padding(8)
                        .background(Color(NSColor.controlBackgroundColor))
                        .cornerRadius(6)
                    
                    Button {
                        guard !inputURL.isEmpty else { return }
                        Task {
                            await viewModel.addAndScanURL(inputURL)
                            inputURL = "" // Clear textbox sau khi quét
                        }
                    } label: {
                        HStack {
                            if viewModel.isProcessing && viewModel.videoItems.contains(where: { $0.status == .fetching }) {
                                ProgressView().controlSize(.small)
                            } else {
                                Image(systemName: "magnifyingglass")
                            }
                            Text("Quét Link")
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(inputURL.isEmpty)
                }
                .padding()
                .background(Color(NSColor.windowBackgroundColor))
                
                Divider()
                
                // DANH SÁCH VIDEO QUÉT ĐƯỢC
                if viewModel.videoItems.isEmpty {
                    VStack(spacing: 16) {
                        Image(systemName: "video.badge.plus")
                            .font(.system(size: 48))
                            .foregroundColor(.gray)
                        Text("Hãy nhập một đường dẫn video phía trên để bắt đầu bóc tách.")
                            .font(.body)
                            .foregroundColor(.secondary)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    List {
                        ForEach(viewModel.videoItems) { item in
                            VideoRowView(item: item)
                                .padding(.vertical, 4)
                        }
                        .onDelete(perform: viewModel.removeItem)
                    }
                    .listStyle(.inset)
                }
                
                Divider()
                
                // THANH ĐIỀU KHIỂN DƯỚI CÙNG - BOTTOM TOOLBAR
                HStack {
                    Button(role: .destructive) {
                        viewModel.clearAll()
                    } label: {
                        Text("Xóa hết danh sách")
                    }
                    .buttonStyle(.bordered)
                    .disabled(viewModel.videoItems.isEmpty)
                    
                    Spacer()
                    
                    // Nút hủy tiến trình đa nhiệm tải
                    Button {
                        viewModel.cancelAllDownloads()
                    } label: {
                        Label("Hủy Tải", systemImage: "xmark.circle")
                    }
                    .buttonStyle(.bordered)
                    .foregroundColor(.red)
                    .disabled(!viewModel.videoItems.contains(where: { $0.status == .downloading || $0.status == .fetching }))
                    
                    // Nút kích hoạt tải dồn dập
                    Button {
                        Task {
                            await viewModel.downloadAll()
                        }
                    } label: {
                        HStack {
                            Image(systemName: "arrow.down.to.line.compact")
                            Text("Tải xuống tất cả (\\(viewModel.videoItems.filter({ $0.status == .idle || $0.status == .error }).count))")
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(viewModel.videoItems.filter({ $0.status == .idle || $0.status == .error }).isEmpty)
                }
                .padding()
                .background(Color(NSColor.windowBackgroundColor))
            }
            .frame(minWidth: 550, minHeight: 400)
        }
        .navigationTitle("macOS yt-dlp Batch Downloader Boilerplate")
    }
}`
  },
  {
    name: "VideoRowView.swift",
    path: "Views/VideoRowView.swift",
    icon: "swift",
    description: "Thành phần hiển thị của từng dòng phần tử video. Bao gồm ảnh Thumbnail, thời lượng video, thanh ProgressView đo lường tiến độ chính xác và màu sắc thể chế trạng thái tải.",
    content: `import SwiftUI

struct VideoRowView: View {
    let item: VideoItem
    
    var body: some View {
        HStack(spacing: 12) {
            // KHU VỰC THUMBNAIL (Sử dụng AsyncImage tải từ URL)
            if let thumbURL = item.thumbnailURL {
                AsyncImage(url: thumbURL) { phase in
                    switch phase {
                    case .success(let image):
                        image.resizable()
                            .aspectRatio(contentMode: .fill)
                    default:
                        // Placeholder khi chưa tải xong thumb hoặc lỗi
                        Color.gray.overlay(
                            Image(systemName: "video.fill").foregroundColor(.white)
                        )
                    }
                }
                .frame(width: 80, height: 45)
                .cornerRadius(4)
                .clipped()
            } else {
                RoundedRectangle(cornerRadius: 4)
                    .fill(Color.gray.opacity(0.3))
                    .frame(width: 80, height: 45)
                    .overlay(
                        Image(systemName: "video.dash").foregroundColor(.secondary)
                    )
            }
            
            // THÔNG TIN CHI TIẾT
            VStack(alignment: .leading, spacing: 4) {
                Text(item.title)
                    .font(.headline)
                    .lineLimit(1)
                
                HStack(spacing: 12) {
                    Text("Thời lượng: \\(formatDuration(item.duration))")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    
                    Text("URL: \\(item.url.host ?? "Liên kết ngoài")")
                        .font(.caption)
                        .foregroundColor(.blue)
                }
                
                // THANH TIẾN TRÌNH TẢI (CHỈ HIỂN THỊ KHI ĐANG TẢI HOẶC BÁO LỖI)
                if item.status == .downloading {
                    HStack {
                        ProgressView(value: item.downloadProgress, total: 1.0)
                            .progressViewStyle(.linear)
                        
                        Text("\\(Int(item.downloadProgress * 100))%")
                            .font(.caption)
                            .fontWeight(.bold)
                            .foregroundColor(.accentColor)
                            .frame(width: 38, alignment: .trailing)
                    }
                } else if item.status == .error {
                    Text("Lỗi: \\(item.errorMessage ?? "Tiến trình con thoát đột ngột.")")
                        .font(.caption)
                        .foregroundColor(.red)
                        .lineLimit(1)
                }
            }
            
            Spacer()
            
            // TRẠNG THÁI BADGE MÀU
            statusBadge(for: item.status)
        }
    }
    
    /// Chuyển đổi giây sang m:ss hoặc h:mm:ss
    private func formatDuration(_ seconds: TimeInterval) -> String {
        let formatter = DateComponentsFormatter()
        formatter.allowedUnits = seconds >= 3600 ? [.hour, .minute, .second] : [.minute, .second]
        formatter.unitsStyle = .positional
        formatter.zeroFormattingBehavior = .pad
        return formatter.string(from: seconds) ?? "00:00"
    }
    
    /// Trả về badge trạng thái trực quan dạng SwiftUI View
    @ViewBuilder
    private func statusBadge(for status: VideoStatus) -> some View {
        switch status {
        case .idle:
            Text("Sẵn sàng")
                .font(.caption2)
                .padding(.horizontal, 6)
                .padding(.vertical, 3)
                .background(Color.gray.opacity(0.2))
                .cornerRadius(4)
        case .fetching:
            HStack(spacing: 4) {
                ProgressView().controlSize(.small)
                Text("Đang quét...")
                    .font(.caption2)
            }
            .padding(.horizontal, 6)
            .padding(.vertical, 3)
            .background(Color.blue.opacity(0.2))
            .cornerRadius(4)
        case .downloading:
            Text("Đang tải tệp")
                .font(.caption2)
                .foregroundColor(.white)
                .padding(.horizontal, 6)
                .padding(.vertical, 3)
                .background(Color.blue)
                .cornerRadius(4)
        case .success:
            Image(systemName: "checkmark.circle.fill")
                .foregroundColor(.green)
                .font(.body)
        case .error:
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundColor(.red)
                .font(.body)
        }
    }
}`
  },
  {
    name: "MacDownloaderApp.swift",
    path: "MacDownloaderApp.swift",
    icon: "swift",
    description: "File khai báo vòng đời ứng dụng Xcode chính (App entry point). Chứa thiết đặt WindowGroup để kích hoạt ContentView trên nền tảng macOS.",
    content: `import SwiftUI

@main
struct MacDownloaderApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
                // Gán kích cỡ cửa sổ mặc định khi ứng dụng khởi chạy
                .frame(minWidth: 800, minHeight: 500)
        }
        // Định nghĩa kiểu cửa sổ là tiêu chuẩn Cocoa, ẩn thanh tiêu đề mặc định nếu cần
        .windowStyle(.titleBar)
        // Bật nút Settings cho ứng dụng macOS tiêu chuẩn
        .commands {
            SidebarCommands() // Hỗ trợ phím tắt ẩn/hiện Sidebar nhanh (Cmd+Option+S)
        }
    }
}`
  }
];
