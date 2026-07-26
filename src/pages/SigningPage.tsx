// 전자 계약서 서명 페이지 (공개 - 인증 불요)
// URL: /sign/:token

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { API_BASE } from "../services/apiBase";

// ──────────────────────────────────────────────
// 상태 타입
// ──────────────────────────────────────────────

type PageState =
  | "loading"
  | "not-found"
  | "expired"
  | "already-signed"
  | "ready"
  | "signing"
  | "complete";

// ──────────────────────────────────────────────
// 서명 요청 조회
//
// Firestore를 직접 읽지 않는다. 서버(/api/signing/{token})가 서비스 계정으로
// 토큰을 검증하고 화면에 필요한 필드만 내려준다. 규칙에서 미인증 접근을 전부
// 막았기 때문에, 링크를 모르는 사람은 계약서에 닿을 수 없다.
// ──────────────────────────────────────────────

/** 서버가 내려주는 서명 페이지 데이터 */
interface SigningView {
  state: PageState;
  clientName: string;
  contractText: string;
  /** ISO 8601 문자열 */
  signedAt: string | null;
  firmName: string;
  lawyerName: string;
}

async function fetchSigningRequest(token: string): Promise<SigningView> {
  const resp = await fetch(`${API_BASE}/api/signing/${encodeURIComponent(token)}`);
  const data = (await resp.json()) as Partial<SigningView> & { state?: string };

  // 서버는 "error"도 보낼 수 있다. 화면이 아는 상태만 통과시키고 나머지는 not-found로 접는다.
  const KNOWN: readonly string[] = ["ready", "already-signed", "expired", "not-found"];
  const raw = data.state ?? "not-found";
  const state = (KNOWN.includes(raw) ? raw : "not-found") as PageState;

  return {
    state,
    clientName: data.clientName ?? "",
    contractText: data.contractText ?? "",
    signedAt: data.signedAt ?? null,
    firmName: data.firmName ?? "",
    lawyerName: data.lawyerName ?? "",
  };
}

// ──────────────────────────────────────────────
// 컴포넌트
// ──────────────────────────────────────────────

export default function SigningPage() {
  const { token } = useParams<{ token: string }>();

  const [pageState, setPageState] = useState<PageState>("loading");
  const [request, setRequest] = useState<SigningView | null>(null);
  const [firmName, setFirmName] = useState("");
  const [lawyerName, setLawyerName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [error, setError] = useState("");

  // Canvas refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── 서명 요청 로드 ──
  const validToken = token ?? "";
  useEffect(() => {
    if (!validToken) return;

    let cancelled = false;

    (async () => {
      try {
        const view = await fetchSigningRequest(validToken);
        if (cancelled) return;

        setRequest(view);
        setPageState(view.state);
        setFirmName(view.firmName);
        setLawyerName(view.lawyerName);
      } catch {
        if (!cancelled) setPageState("not-found");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [validToken]);

  // ── Canvas 초기화 ──
  useEffect(() => {
    if (pageState !== "ready") return;

    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const setupCanvas = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.scale(dpr, dpr);
        ctx.strokeStyle = "#1a1a1a";
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
      }
    };

    setupCanvas();

    window.addEventListener("resize", setupCanvas);
    return () => window.removeEventListener("resize", setupCanvas);
  }, [pageState]);

  // ── 터치/마우스 이벤트 핸들러 ──
  const getPos = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      if ("touches" in e) {
        return {
          x: e.touches[0].clientX - rect.left,
          y: e.touches[0].clientY - rect.top,
        };
      }
      return {
        x: (e as React.MouseEvent).clientX - rect.left,
        y: (e as React.MouseEvent).clientY - rect.top,
      };
    },
    []
  );

  const startDraw = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      isDrawing.current = true;
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;
      const pos = getPos(e);
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
    },
    [getPos]
  );

  const draw = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      if (!isDrawing.current) return;
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;
      const pos = getPos(e);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      setHasDrawn(true);
    },
    [getPos]
  );

  const endDraw = useCallback(() => {
    isDrawing.current = false;
  }, []);

  // ── 서명 초기화 ──
  const clearSignature = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    setHasDrawn(false);
  }, []);

  // ── 서명 데이터 URL ──
  const getSignatureDataUrl = useCallback(() => {
    return canvasRef.current?.toDataURL("image/png") ?? "";
  }, []);

  // ── 서명 완료 ──
  const handleSubmit = async () => {
    if (!agreed) {
      setError("계약 내용에 동의해 주세요.");
      return;
    }
    if (!hasDrawn) {
      setError("서명을 해 주세요.");
      return;
    }
    if (!request) return;

    setError("");
    setPageState("signing");

    try {
      const signatureDataUrl = getSignatureDataUrl();

      // 서명자 IP는 서버가 CF-Connecting-IP로 직접 잡는다.
      // 클라이언트가 보낸 IP는 조작 가능하므로 감사 추적 자료로 쓸 수 없다.
      const resp = await fetch(
        `${API_BASE}/api/signing/${encodeURIComponent(validToken)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            signatureDataUrl,
            userAgent: navigator.userAgent,
          }),
        },
      );

      if (!resp.ok) {
        const body = (await resp.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "서명 처리 중 오류가 발생했습니다. 다시 시도해 주세요.");
        setPageState("ready");
        return;
      }

      setPageState("complete");
    } catch {
      setError("서명 처리 중 오류가 발생했습니다. 다시 시도해 주세요.");
      setPageState("ready");
    }
  };

  // ── 서명일 포맷 ──
  const formatSignedDate = (req: SigningView) => {
    if (!req.signedAt) return "";
    const d = new Date(req.signedAt);
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
  };

  // ──────────────────────────────────────────────
  // 렌더링
  // ──────────────────────────────────────────────

  // 토큰 없음
  if (!validToken) {
    return (
      <PageShell>
        <div className="text-center py-20">
          <p className="text-2xl mb-2">❌</p>
          <p className="text-gray-800 font-medium">유효하지 않은 서명 링크입니다.</p>
        </div>
      </PageShell>
    );
  }

  // 로딩
  if (pageState === "loading") {
    return (
      <PageShell>
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-800 rounded-full animate-spin mb-4" />
          <p className="text-gray-600 text-sm">계약서를 불러오는 중...</p>
        </div>
      </PageShell>
    );
  }

  // 만료
  if (pageState === "expired") {
    return (
      <PageShell>
        <StatusCard
          icon="⏰"
          title="서명 기한 만료"
          description="서명 기한이 만료되었습니다. 변호사에게 다시 요청해 주세요."
        />
      </PageShell>
    );
  }

  // 유효하지 않은 링크
  if (pageState === "not-found") {
    return (
      <PageShell>
        <StatusCard
          icon="🔗"
          title="유효하지 않은 링크"
          description="유효하지 않은 서명 링크입니다."
        />
      </PageShell>
    );
  }

  // 이미 서명 완료
  if (pageState === "already-signed" && request) {
    return (
      <PageShell>
        <StatusCard
          icon="✅"
          title="서명 완료"
          description={`이미 서명이 완료된 계약서입니다.\n서명일: ${formatSignedDate(request)}`}
        />
      </PageShell>
    );
  }

  // 서명 처리 중
  if (pageState === "signing") {
    return (
      <PageShell>
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-800 rounded-full animate-spin mb-4" />
          <p className="text-gray-600 text-sm">서명 처리 중...</p>
        </div>
      </PageShell>
    );
  }

  // 서명 완료
  if (pageState === "complete") {
    return (
      <PageShell>
        <StatusCard
          icon="✅"
          title="서명이 완료되었습니다!"
          description={`서명된 계약서는 ${firmName || "법률사무소"}에서 보관합니다.`}
        />
      </PageShell>
    );
  }

  // ── 서명 가능 (ready) ──
  return (
    <PageShell>
      <div className="space-y-6">
        {/* 헤더 */}
        <div className="text-center">
          <h1 className="text-xl font-bold text-gray-900 flex items-center justify-center gap-2">
            <span>📜</span> 사건위임계약서
          </h1>
          {(firmName || lawyerName) && (
            <p className="text-sm text-gray-500 mt-1">
              {firmName}
              {firmName && lawyerName && " | "}
              {lawyerName}
            </p>
          )}
        </div>

        {/* 계약서 전문 */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 max-h-[50vh] overflow-y-auto">
          <pre className="text-sm text-gray-800 whitespace-pre-wrap font-mono leading-relaxed">
            {request?.contractText}
          </pre>
        </div>

        {/* 개인정보 수집·이용 및 제공 동의서 */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">개인정보 수집·이용 및 제공 동의서</p>
          <div className="bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
            <img
              src="/privacy-consent.jpg"
              alt="개인정보 수집·이용 및 제공 동의서"
              className="w-full h-auto"
            />
          </div>
        </div>

        {/* 구분선 */}
        <hr className="border-gray-200" />

        {/* 동의 체크박스 */}
        <label className="flex items-start gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 w-5 h-5 rounded border-gray-300 text-[#0B1120] focus:ring-[#0B1120] cursor-pointer"
          />
          <span className="text-sm text-gray-700 leading-relaxed">
            위 계약 내용 및 개인정보 수집·이용·제공에 동의합니다
          </span>
        </label>

        {/* 서명 영역 */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">서명</p>
          <div
            ref={containerRef}
            className="relative w-full h-40 bg-white border-2 border-gray-200 rounded-lg overflow-hidden"
          >
            <canvas
              ref={canvasRef}
              style={{ touchAction: "none" }}
              className="absolute inset-0 w-full h-full cursor-crosshair"
              onMouseDown={startDraw}
              onMouseMove={draw}
              onMouseUp={endDraw}
              onMouseLeave={endDraw}
              onTouchStart={startDraw}
              onTouchMove={draw}
              onTouchEnd={endDraw}
            />
            {!hasDrawn && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-gray-400 text-sm">
                  ✍️ 여기에 서명하세요
                </span>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={clearSignature}
            className="mt-2 text-sm text-gray-500 hover:text-gray-700 underline"
          >
            지우기
          </button>
        </div>

        {/* 에러 메시지 */}
        {error && (
          <p className="text-sm text-red-600 text-center">{error}</p>
        )}

        {/* 서명 완료 버튼 */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!agreed || !hasDrawn}
          className="w-full py-3.5 rounded-lg text-white font-medium text-base transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            backgroundColor:
              agreed && hasDrawn ? "#0B1120" : "#0B1120",
          }}
        >
          ✅ 서명 완료
        </button>

        {/* 법적 안내 */}
        <p className="text-xs text-gray-400 text-center leading-relaxed pb-4">
          ⚖️ 본 전자서명은 전자서명법 제3조에 따라 법적 효력을 가집니다.
        </p>
      </div>
    </PageShell>
  );
}

// ──────────────────────────────────────────────
// 공통 레이아웃 (흰 배경, 모바일 최적화)
// ──────────────────────────────────────────────

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-lg mx-auto px-5 py-8">{children}</div>
    </div>
  );
}

// ──────────────────────────────────────────────
// 상태 카드 (에러, 완료, 만료 등)
// ──────────────────────────────────────────────

function StatusCard({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <span className="text-4xl mb-4">{icon}</span>
      <h2 className="text-lg font-bold text-gray-900 mb-2">{title}</h2>
      <p className="text-sm text-gray-600 whitespace-pre-line leading-relaxed">
        {description}
      </p>
    </div>
  );
}
