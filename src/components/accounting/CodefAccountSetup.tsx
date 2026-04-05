/**
 * CODEF 계좌 연동 모달
 *
 * 간편인증(카카오) → 공동인증서 폴백 플로우를 통해
 * 은행 계정을 CODEF에 연결하고 Firestore에 저장합니다.
 */

import { useState, useCallback, useEffect } from "react";
import {
  X,
  Loader2,
  Building2,
  Shield,
  AlertCircle,
  CheckCircle2,
  Smartphone,
  KeyRound,
} from "lucide-react";
import { connectCodefAccount } from "../../services/codefApi";
import { createCodefAccount } from "../../services/firebase/codef";

// ─── Props ──────────────────────────────────

interface CodefAccountSetupProps {
  ownerId: string;
  onClose: () => void;
  onSuccess: () => void;
}

// ─── 상수 ───────────────────────────────────

interface BankOption {
  code: string;
  name: string;
}

const BANKS: BankOption[] = [
  { code: "0088", name: "신한은행" },
  { code: "0004", name: "국민은행" },
  { code: "0081", name: "하나은행" },
  { code: "0020", name: "우리은행" },
  { code: "0003", name: "기업은행" },
  { code: "0011", name: "농협은행" },
  { code: "0023", name: "SC제일은행" },
  { code: "0090", name: "카카오뱅크" },
  { code: "0089", name: "케이뱅크" },
  { code: "0092", name: "토스뱅크" },
];

type AuthMethod = "kakao" | "cert";
type FlowState = "idle" | "authenticating" | "success" | "error";

// ─── 컴포넌트 ────────────────────────────────

export default function CodefAccountSetup({
  ownerId,
  onClose,
  onSuccess,
}: CodefAccountSetupProps) {
  // 폼 상태
  const [selectedBankCode, setSelectedBankCode] = useState("");
  const [nickname, setNickname] = useState("");
  const [authMethod, setAuthMethod] = useState<AuthMethod>("kakao");

  // 공동인증서 필드
  const [certId, setCertId] = useState("");
  const [certPassword, setCertPassword] = useState("");

  // 플로우 상태
  const [flowState, setFlowState] = useState<FlowState>("idle");
  const [error, setError] = useState("");
  const [suggestCert, setSuggestCert] = useState(false);

  const selectedBank = BANKS.find((b) => b.code === selectedBankCode) ?? null;
  const isLoading = flowState === "authenticating";

  // 성공 후 자동 닫기
  useEffect(() => {
    if (flowState !== "success") return;
    const timer = setTimeout(() => {
      onSuccess();
    }, 1200);
    return () => clearTimeout(timer);
  }, [flowState, onSuccess]);

  /** 카카오 인증 검증 */
  const isKakaoValid = selectedBankCode.length > 0;

  /** 공동인증서 검증 */
  const isCertValid =
    selectedBankCode.length > 0 &&
    certId.trim().length > 0 &&
    certPassword.trim().length > 0;

  /** CODEF 연결 및 Firestore 저장 */
  const handleConnect = useCallback(
    async (method: AuthMethod) => {
      if (!selectedBank) return;

      setFlowState("authenticating");
      setError("");
      setSuggestCert(false);

      try {
        // CODEF API 호출
        const params =
          method === "kakao"
            ? {
                type: "bank" as const,
                organization: selectedBank.code,
                loginType: "5",
                id: "",
                password: "",
              }
            : {
                type: "bank" as const,
                organization: selectedBank.code,
                loginType: "0",
                id: certId.trim(),
                password: certPassword.trim(),
              };

        const result = await connectCodefAccount(params);

        // Firestore에 저장
        await createCodefAccount({
          ownerId,
          type: "bank",
          institutionCode: selectedBank.code,
          institutionName: selectedBank.name,
          connectedId: result.connectedId,
          alias: nickname.trim() || selectedBank.name,
          syncStatus: "idle",
        });

        setFlowState("success");
      } catch (err: unknown) {
        const msg =
          err instanceof Error
            ? err.message
            : "계좌 연동에 실패했습니다. 다시 시도해 주세요.";

        setError(msg);
        setFlowState("error");

        // 간편인증 실패 시 공동인증서 전환 제안
        if (method === "kakao") {
          setSuggestCert(true);
        }
      }
    },
    [selectedBank, certId, certPassword, nickname, ownerId],
  );

  /** 카카오 인증 시작 */
  const handleKakaoAuth = () => {
    if (!isKakaoValid) return;
    handleConnect("kakao");
  };

  /** 공동인증서 연동 */
  const handleCertAuth = () => {
    if (!isCertValid) return;
    handleConnect("cert");
  };

  /** 공동인증서로 전환 */
  const switchToCert = () => {
    setAuthMethod("cert");
    setError("");
    setSuggestCert(false);
    setFlowState("idle");
  };

  /** 재시도 */
  const handleRetry = () => {
    setError("");
    setSuggestCert(false);
    setFlowState("idle");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 배경 오버레이 */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={isLoading ? undefined : onClose}
      />

      {/* 모달 본체 */}
      <div className="relative w-full max-w-lg bg-[#0B1120] border border-border rounded-2xl shadow-2xl overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-2.5">
            <Building2 className="w-5 h-5 text-gold" />
            <div>
              <h2 className="text-lg font-semibold text-text-primary">
                계좌 연동
              </h2>
              <p className="text-xs text-text-dim mt-0.5">
                사업용 계좌를 연동하세요
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-text-dim hover:text-text-primary hover:bg-surface transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 성공 화면 */}
        {flowState === "success" ? (
          <div className="p-10 flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-green-400" />
            </div>
            <p className="text-text-primary font-medium text-lg">
              계좌 연동 완료
            </p>
            <p className="text-text-dim text-sm">
              {selectedBank?.name} 계좌가 연동되었습니다
            </p>
          </div>
        ) : (
          <>
            {/* 본문 */}
            <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
              {/* 은행 선택 */}
              <div>
                <label className="block text-sm font-medium text-text-dim mb-2">
                  은행 선택
                </label>
                <div className="relative">
                  <select
                    value={selectedBankCode}
                    onChange={(e) => setSelectedBankCode(e.target.value)}
                    disabled={isLoading}
                    className="w-full appearance-none bg-surface border border-border rounded-xl px-4 py-3 text-text-primary text-sm focus:outline-none focus:border-gold/40 transition-colors disabled:opacity-50"
                  >
                    <option value="">선택해 주세요</option>
                    {BANKS.map((bank) => (
                      <option key={bank.code} value={bank.code}>
                        {bank.name}
                      </option>
                    ))}
                  </select>
                  <ChevronIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim pointer-events-none" />
                </div>
              </div>

              {/* 별칭 */}
              <div>
                <label className="block text-sm font-medium text-text-dim mb-2">
                  별칭 <span className="text-text-dim/50">(선택)</span>
                </label>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="예: 사업용 계좌"
                  disabled={isLoading}
                  className="w-full bg-surface border border-border rounded-xl px-4 py-3 text-text-primary text-sm placeholder:text-text-dim/50 focus:outline-none focus:border-gold/40 transition-colors disabled:opacity-50"
                />
              </div>

              {/* 인증 방법 선택 */}
              <div>
                <label className="block text-sm font-medium text-text-dim mb-2">
                  인증 방법
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setAuthMethod("kakao");
                      setError("");
                      setSuggestCert(false);
                    }}
                    disabled={isLoading}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium transition-colors ${
                      authMethod === "kakao"
                        ? "border-gold/40 bg-gold-dim text-gold"
                        : "border-border bg-surface text-text-dim hover:text-text-primary hover:border-border"
                    } disabled:opacity-50`}
                  >
                    <Smartphone className="w-4 h-4" />
                    카카오 인증
                  </button>
                  <button
                    onClick={() => {
                      setAuthMethod("cert");
                      setError("");
                      setSuggestCert(false);
                    }}
                    disabled={isLoading}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium transition-colors ${
                      authMethod === "cert"
                        ? "border-gold/40 bg-gold-dim text-gold"
                        : "border-border bg-surface text-text-dim hover:text-text-primary hover:border-border"
                    } disabled:opacity-50`}
                  >
                    <KeyRound className="w-4 h-4" />
                    공동인증서
                  </button>
                </div>
              </div>

              {/* 카카오 인증 UI */}
              {authMethod === "kakao" && !isLoading && flowState !== "error" && (
                <div className="p-4 bg-surface border border-border rounded-xl space-y-3">
                  <div className="flex items-start gap-3">
                    <Smartphone className="w-5 h-5 text-gold shrink-0 mt-0.5" />
                    <div className="text-sm text-text-dim leading-relaxed">
                      <p className="text-text-primary font-medium mb-1">
                        카카오톡 간편인증
                      </p>
                      <p>
                        버튼을 누르면 카카오톡으로 인증 요청이 전송됩니다.
                        카카오톡에서 인증을 완료해 주세요.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleKakaoAuth}
                    disabled={!isKakaoValid}
                    className="w-full flex items-center justify-center gap-2 px-5 py-3 text-sm font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-[#FEE500] text-[#191919] hover:bg-[#FDD835]"
                  >
                    카카오 인증 시작
                  </button>
                </div>
              )}

              {/* 카카오 인증 진행 중 */}
              {authMethod === "kakao" && isLoading && (
                <div className="p-6 bg-surface border border-border rounded-xl flex flex-col items-center gap-4">
                  <Loader2 className="w-8 h-8 text-gold animate-spin" />
                  <div className="text-center">
                    <p className="text-text-primary font-medium text-sm">
                      카카오톡에서 인증을 진행해 주세요
                    </p>
                    <p className="text-text-dim text-xs mt-1">
                      카카오톡 알림을 확인하고 인증을 완료하세요
                    </p>
                  </div>
                </div>
              )}

              {/* 공동인증서 UI */}
              {authMethod === "cert" && !isLoading && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-text-dim mb-2">
                      아이디
                    </label>
                    <input
                      type="text"
                      value={certId}
                      onChange={(e) => setCertId(e.target.value)}
                      placeholder="인터넷뱅킹 아이디"
                      disabled={isLoading}
                      className="w-full bg-surface border border-border rounded-xl px-4 py-3 text-text-primary text-sm placeholder:text-text-dim/50 focus:outline-none focus:border-gold/40 transition-colors disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-dim mb-2">
                      비밀번호
                    </label>
                    <input
                      type="password"
                      value={certPassword}
                      onChange={(e) => setCertPassword(e.target.value)}
                      placeholder="인터넷뱅킹 비밀번호"
                      disabled={isLoading}
                      className="w-full bg-surface border border-border rounded-xl px-4 py-3 text-text-primary text-sm placeholder:text-text-dim/50 focus:outline-none focus:border-gold/40 transition-colors disabled:opacity-50"
                    />
                    <div className="flex items-center gap-1.5 mt-2 text-xs text-text-dim">
                      <Shield className="w-3.5 h-3.5 text-blue-400" />
                      <span>
                        비밀번호는 암호화되어 CODEF에 전송됩니다
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* 공동인증서 연동 중 */}
              {authMethod === "cert" && isLoading && (
                <div className="p-6 bg-surface border border-border rounded-xl flex flex-col items-center gap-4">
                  <Loader2 className="w-8 h-8 text-gold animate-spin" />
                  <p className="text-text-primary font-medium text-sm">
                    연동 중...
                  </p>
                </div>
              )}

              {/* 에러 메시지 */}
              {flowState === "error" && error && (
                <div className="space-y-3">
                  <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-400">{error}</p>
                  </div>

                  {/* 간편인증 실패 → 공동인증서 전환 제안 */}
                  {suggestCert && (
                    <button
                      onClick={switchToCert}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium rounded-xl border border-gold/30 bg-gold-dim text-gold hover:bg-gold/20 transition-colors"
                    >
                      <KeyRound className="w-4 h-4" />
                      공동인증서로 연동하기
                    </button>
                  )}

                  {/* 재시도 버튼 */}
                  {!suggestCert && (
                    <button
                      onClick={handleRetry}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium rounded-xl border border-border bg-surface text-text-dim hover:text-text-primary transition-colors"
                    >
                      다시 시도
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* 푸터 (공동인증서일 때만 연동하기 버튼 표시) */}
            {authMethod === "cert" && !isLoading && flowState !== "error" && (
              <div className="flex items-center justify-end gap-3 p-5 border-t border-border">
                <button
                  onClick={onClose}
                  disabled={isLoading}
                  className="px-5 py-2.5 text-sm font-medium text-text-dim hover:text-text-primary transition-colors disabled:opacity-50"
                >
                  취소
                </button>
                <button
                  onClick={handleCertAuth}
                  disabled={!isCertValid || isLoading}
                  className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-r from-gold to-gold-bright text-[#0B1120] hover:shadow-lg hover:shadow-gold/20"
                >
                  연동하기
                </button>
              </div>
            )}

            {/* 에러 시 하단 취소 버튼 */}
            {flowState === "error" && (
              <div className="flex items-center justify-end gap-3 p-5 border-t border-border">
                <button
                  onClick={onClose}
                  className="px-5 py-2.5 text-sm font-medium text-text-dim hover:text-text-primary transition-colors"
                >
                  닫기
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** 셀렉트 박스 화살표 아이콘 */
function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
