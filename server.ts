import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize Gemini API client if key exists
let ai: GoogleGenAI | null = null;
try {
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey && apiKey !== "MY_GEMINI_API_KEY") {
    ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
    console.log("Gemini API initialized successfully!");
  } else {
    console.warn("GEMINI_API_KEY environment variable is not configured or uses placeholder.");
  }
} catch (error) {
  console.error("Failed to initialize GoogleGenAI:", error);
}

// Senior macOS Developer system instruction
const SYSTEM_INSTRUCTION = `Bạn là một Chuyên gia Lập trình macOS (Senior macOS Developer) với kiến thức sâu rộng về SwiftUI, kiến trúc MVVM, Swift Concurrency (async/await, Actor, MainActor), và cách tương tác với hệ điều hành macOS thông qua tiến trình ngoại vi (Process), đường ống Pipe, FileHandle, & Xcode project settings.

Hãy trả lời người dùng bằng tiếng Việt, cung cấp hướng dẫn rõ ràng, chi tiết, chuyên nghiệp và chuẩn mực cao về lập trình Swift/SwiftUI trên macOS. Hãy chú ý các khía cạnh đặc thù của macOS như:
1. App Sandbox & Entitlements: Cần com.apple.security.network.client để gọi mạng tải video, hoặc com.apple.security.files.user-selected.read-write để lưu tệp.
2. Binary Execution: Quyền thực thi Gatekeeper, cách dùng Bundle.main.url(forResource:withExtension:) tìm yt-dlp, và xử lý chmod +x nếu cần.
3. Pipe concurrency & Thread Safety: Tại sao phải đọc Pipe không đồng bộ (Task hoặc DispatchWorkItem) để tránh block main thread, và dùng @MainActor để cập nhật UI SwiftUI.
4. Swift 5.7+ Regex literals: ví dụ dùng /\\s*(\\d+(\\.\\d+)?)%/ để bóc tách tiến trình.

Hãy chia sẻ code mẫu chính hãng Apple API, phong cách sạch sẽ và giải thích thấu đáo.`;

// API endpoint for chatbot
app.post("/api/chat", async (req, res) => {
  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Messages array is required." });
  }

  if (!ai) {
    // If Gemini is not set up, respond with a helpful mock assistant response
    const lastMessage = messages[messages.length - 1]?.content || "";
    const lower = lastMessage.toLowerCase();
    let responseText = "Chào bạn! Tôi là trợ lý macOS Senior Developer. Vì API Key chưa được cấu hình hoàn chỉnh ở môi trường này, tôi tạm thời phản hồi tự động.\n\n";

    if (lower.includes("sandbox") || lower.includes("entitlement")) {
      responseText += "Để phân phối app lên App Store hoặc chạy an toàn, bạn cần bật **App Sandbox** trong Tab Signing & Capabilities của Xcode và thêm:\n" +
        "- `Incoming Connections (Server)` hoặc `Outgoing Connections (Client)` (để tải mạng).\n" +
        "- `User Selected Files` thành `Read/Write` để ghi video đã tải ra mục chứa tệp của NSD.";
    } else if (lower.includes("pipe") || lower.includes("process")) {
      responseText += "Khi tạo `Process` để chạy `yt-dlp`, bạn bắt buộc phải gán `process.standardOutput = pipe`. Sử dụng `fileHandle.readabilityHandler = { handle in ... }` hoặc Swift Concurrency `for try await line in fileHandle.bytes.lines` (Swift 5.5+) để lấy dữ liệu liên tục không làm đơ UI.";
    } else if (lower.includes("regex")) {
      responseText += "Đoạn Regex lý tưởng để parse `%` từ yt-dlp là `\\[download\\]\\s+(\\d+(?:\\.\\d+)?)\\%`. Trong Swift 5.7, bạn có thể viết kiểu Regex Literal: `let progressRegex = /\\[download\\]\\s+(?<percent>\\d+(?:\\.\\d+)?)\\%/` để bóc tách thông qua capture group `percent`.";
    } else {
      responseText += "Dự án boilerplate này bao gồm toàn bộ cơ chế của `Process`, `Pipe` đọc bất đồng bộ và Regex bắt phần trăm. Bạn có thể xem các file code Xcode giả lập phía trên hoặc dùng các nút điều khiển để chạy thử trực tiếp quá trình quét & tải video simulated!";
    }

    return res.json({ text: responseText });
  }

  try {
    // Format message history for chat
    const geminiHistory = messages.slice(0, -1).map((msg: any) => {
      return {
        role: msg.role === "user" ? "user" : "model",
        parts: [{ text: msg.content }]
      };
    });

    const userMessageContent = messages[messages.length - 1].content;

    // Use Gemini chats API or generateContent
    // Since it's a multi-turn conversation, using the chat system is great.
    const chat = ai.chats.create({
      model: "gemini-3.5-flash",
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.7,
      },
      history: geminiHistory
    });

    const result = await chat.sendMessage({
      message: userMessageContent
    });

    res.json({ text: result.text });
  } catch (err: any) {
    console.error("Gemini API Error:", err);
    res.status(500).json({ error: "Failed to communicate with AI: " + err.message });
  }
});

// Serve Vite files
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
