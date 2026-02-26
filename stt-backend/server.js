import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import { readFileSync } from "fs";

// ─── 환경변수 로드 ───
const PORT = process.env.PORT || 3001;
const RTZR_CLIENT_ID = process.env.RTZR_CLIENT_ID;
const RTZR_CLIENT_SECRET = process.env.RTZR_CLIENT_SECRET;
const RTZR_API_BASE = "https://openapi.vito.ai";

// ─── Express 앱 초기화 ───
const app = express();
const upload = multer({ dest: "uploads/" });

app.use(express.json());
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:3000",
      "http://127.0.0.1:5173",
    ],
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// ─── JWT 토큰 관리 ───
let cachedToken = null;
let tokenExpireAt = 0;

/**
 * RTZR JWT 토큰 가져오기
 * 만료 5분 전 자동 갱신
 */
async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const REFRESH_MARGIN_SECONDS = 300; // 5분

  if (cachedToken && tokenExpireAt - now > REFRESH_MARGIN_SECONDS) {
    return cachedToken;
  }

  if (!RTZR_CLIENT_ID || !RTZR_CLIENT_SECRET) {
    throw new Error(
      "RTZR_CLIENT_ID 또는 RTZR_CLIENT_SECRET 환경변수가 설정되지 않았습니다."
    );
  }

  console.log("[AUTH] RTZR JWT 토큰 요청 중...");

  const response = await fetch(`${RTZR_API_BASE}/v1/authenticate`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: RTZR_CLIENT_ID,
      client_secret: RTZR_CLIENT_SECRET,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`RTZR 인증 실패 (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  cachedToken = data.access_token;
  tokenExpireAt = data.expire_at;

  console.log(
    `[AUTH] RTZR JWT 토큰 발급 완료. 만료 시각: ${new Date(tokenExpireAt * 1000).toISOString()}`
  );

  return cachedToken;
}

// ─── RTZR STT 전사 설정 (LAW-CADDY 전용) ───
const RTZR_TRANSCRIBE_CONFIG = {
  model_name: "sommers",
  language: "ko",
  use_diarization: true,
  diarization: { spk_count: 2 },
  use_itn: true,
  use_disfluency_filter: true,
  use_profanity_filter: false,
  use_paragraph_splitter: true,
  paragraph_splitter: { max: 80 },
  domain: "GENERAL",
  keywords: [
    "내용증명", "소장", "답변서", "준비서면", "지급명령",
    "채권", "채무", "손해배상", "부당이득", "불법행위",
    "소멸시효", "제척기간", "가처분", "가압류", "강제집행",
    "고소장", "고발장", "피의자", "피해자", "공소시효",
    "이혼", "양육권", "위자료", "재산분할", "친권",
    "퇴직금", "해고", "부당해고", "산업재해", "근로기준법",
    "임대차", "전세", "보증금", "등기", "매매계약",
    "변호사", "의뢰인", "원고", "피고", "증거",
    "판결", "판례", "법원", "검찰", "경찰",
  ],
};

// ─── 라우트: 헬스체크 ───
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "law-caddy-stt-backend",
    timestamp: new Date().toISOString(),
    rtzrConfigured: Boolean(RTZR_CLIENT_ID && RTZR_CLIENT_SECRET),
  });
});

// ─── 라우트: 전사 요청 ───
app.post("/transcribe", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "음성 파일이 필요합니다." });
    }

    const token = await getAccessToken();
    const fileBuffer = readFileSync(req.file.path);

    // FormData 구성
    const formData = new FormData();
    formData.append(
      "file",
      new Blob([fileBuffer]),
      req.file.originalname || "audio.wav"
    );
    formData.append("config", JSON.stringify(RTZR_TRANSCRIBE_CONFIG));

    console.log(
      `[TRANSCRIBE] 전사 요청 시작 - 파일: ${req.file.originalname}, 크기: ${(req.file.size / 1024 / 1024).toFixed(2)}MB`
    );

    const response = await fetch(`${RTZR_API_BASE}/v1/transcribe`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[TRANSCRIBE] RTZR API 오류 (${response.status}):`, errorText);
      return res.status(response.status).json({
        error: "RTZR 전사 요청 실패",
        detail: errorText,
      });
    }

    const data = await response.json();
    console.log(`[TRANSCRIBE] 전사 요청 성공 - ID: ${data.id}`);

    res.json({ id: data.id });
  } catch (error) {
    console.error("[TRANSCRIBE] 오류:", error);
    res.status(500).json({
      error: "전사 요청 처리 중 오류가 발생했습니다.",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

// ─── 라우트: 전사 결과 조회 (폴링) ───
app.get("/transcribe/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const token = await getAccessToken();

    console.log(`[POLL] 전사 결과 조회 - ID: ${id}`);

    const response = await fetch(`${RTZR_API_BASE}/v1/transcribe/${id}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[POLL] RTZR API 오류 (${response.status}):`, errorText);
      return res.status(response.status).json({
        error: "전사 결과 조회 실패",
        detail: errorText,
      });
    }

    const data = await response.json();
    console.log(`[POLL] 전사 상태: ${data.status} - ID: ${id}`);

    res.json(data);
  } catch (error) {
    console.error("[POLL] 오류:", error);
    res.status(500).json({
      error: "전사 결과 조회 중 오류가 발생했습니다.",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

// ─── 서버 시작 ───
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║   LAW-CADDY STT Backend Server          ║
║   Port: ${String(PORT).padEnd(33)}║
║   RTZR: ${RTZR_CLIENT_ID ? "설정됨 ✓" : "미설정 ✗"}${" ".repeat(RTZR_CLIENT_ID ? 24 : 24)}║
╚══════════════════════════════════════════╝
  `);
});
