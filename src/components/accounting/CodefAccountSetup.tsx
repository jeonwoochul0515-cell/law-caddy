/**
 * CODEF 계좌 연동 모달
 *
 * 흐름:
 *   1. 은행 선택 + 본인 정보 입력 (이름/생년월일/전화번호)
 *   2. 간편인증 그리드에서 인증사 선택 (카카오/페이코/PASS/토스/네이버 등 10개)
 *   3. [인증 시작] 클릭 → 백엔드가 CODEF 1차 호출 → 외부 앱으로 인증 푸시
 *   4. 사용자가 외부 앱에서 동의 → LAW-CADDY 화면에서 [인증 완료] 클릭
 *   5. 백엔드가 CODEF 2차 호출 → connectedId 발급 → Firestore 저장
 *
 * 인증서(공동/금융) 모드는 다음 업데이트에서 추가됩니다.
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
  ArrowRight,
} from "lucide-react";
import { connectCodefAccount } from "../../services/codefApi";
import type { TwoWayInfo } from "../../services/codefApi";
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

/** CODEF 표준 금융기관 코드 — 시중·인터넷·지방·외국계·상호금융 */
const BANKS: BankOption[] = [
  // 시중은행
  { code: "0088", name: "신한은행" },
  { code: "0004", name: "국민은행" },
  { code: "0081", name: "하나은행" },
  { code: "0020", name: "우리은행" },
  { code: "0003", name: "기업은행" },
  { code: "0011", name: "농협은행" },
  { code: "0023", name: "SC제일은행" },
  // 인터넷전문은행
  { code: "0090", name: "카카오뱅크" },
  { code: "0089", name: "케이뱅크" },
  { code: "0092", name: "토스뱅크" },
  // 지방은행
  { code: "0031", name: "대구은행" },
  { code: "0032", name: "부산은행" },
  { code: "0034", name: "광주은행" },
  { code: "0035", name: "제주은행" },
  { code: "0037", name: "전북은행" },
  { code: "0039", name: "경남은행" },
  // 특수은행 / 외국계 / 상호금융
  { code: "0002", name: "산업은행" },
  { code: "0007", name: "수협은행" },
  { code: "0027", name: "한국씨티은행" },
  { code: "0045", name: "새마을금고" },
  { code: "0048", name: "신협" },
  { code: "0071", name: "우체국" },
];

interface SimpleAuthProvider {
  level: string;       // CODEF loginTypeLevel
  name: string;        // 표시명
  short: string;       // 짧은 이름 (그리드 라벨)
  brandColor: string;  // 브랜드 색상 (Tailwind class)
}

/** CODEF 간편인증 인증사 (loginTypeLevel) */
const SIMPLE_AUTH_PROVIDERS: SimpleAuthProvider[] = [
  { level: "1", name: "카카오톡",   short: "카카오",  brandColor: "bg-[#FEE500] text-black" },
  { level: "7", name: "토스",       short: "토스",    brandColor: "bg-[#0064FF] text-white" },
  { level: "5", name: "PASS",       short: "PASS",    brandColor: "bg-[#E60012] text-white" },
  { level: "8", name: "네이버",     short: "네이버",  brandColor: "bg-[#03C75A] text-white" },
  { level: "2", name: "페이코",     short: "페이코",  brandColor: "bg-[#FF1F43] text-white" },
  { level: "3", name: "삼성패스",   short: "삼성",    brandColor: "bg-[#1428A0] text-white" },
  { level: "4", name: "KB모바일",   short: "KB",      brandColor: "bg-[#FFCC00] text-black" },
  { level: "6", name: "신한인증서", short: "신한",    brandColor: "bg-[#0046FF] text-white" },
  { level: "9", name: "NH농협",     short: "NH",      brandColor: "bg-[#019B47] text-white" },
  { level: "10", name: "우리은행",  short: "우리",    brandColor: "bg-[#0067B2] text-white" },
];

type AuthMethod = "simple" | "cert";
type FlowState =
  | "idle"
  | "authenticating"  // 1차 호출 중
  | "pending2Way"     // 외부 앱 인증 대기
  | "confirming"      // 2차 호출 중
  | "success"
  | "error";

// ─── 컴포넌트 ────────────────────────────────

export default function CodefAccountSetup({
  ownerId,
  onClose,
  onSuccess,
}: CodefAccountSetupProps) {
  // 폼 상태
  const [selectedBankCode, setSelectedBankCode] = useState("");
  const [nickname, setNickname] = useState("");
  const [authMethod, setAuthMethod] = useState<AuthMethod>("simple");

  // 본인 정보 (간편인증 필수)
  const [userName, setUserName] = useState("");
  const [birthDate, setBirthDate] = useState("");  // YYYYMMDD
  const [phoneNo, setPhoneNo] = useState("");      // 01012345678

  // 선택된 간편인증 인증사
  const [selectedProvider, setSelectedProvider] = useState<SimpleAuthProvider | null>(null);

  // 플로우 상태
  const [flowState, setFlowState] = useState<FlowState>("idle");
  const [error, setError] = useState("");
  const [twoWayInfo, setTwoWayInfo] = useState<TwoWayInfo | null>(null);

  const selectedBank = BANKS.find((b) => b.code === selectedBankCode) ?? null;
  const isLoading = flowState === "authenticating" || flowState === "confirming";

  // 성공 후 자동 닫기
  useEffect(() => {
    if (flowState !== "success") return;
    const timer = setTimeout(() => {
      onSuccess();
    }, 1200);
    return () => clearTimeout(timer);
  }, [flowState, onSuccess]);

  // ── 검증 ──
  const isUserInfoValid =
    userName.trim().length > 0 &&
    /^\d{8}$/.test(birthDate.trim()) &&
    /^01\d{8,9}$/.test(phoneNo.replace(/[^\d]/g, ""));

  // 그리드 버튼은 "은행 선택 + 본인 정보 입력" 두 조건만 충족하면 클릭 가능.
  // selectedProvider는 클릭 시 설정되는 결과값이라 disabled 조건에 넣으면 안 됨.
  const canStartSimpleAuth =
    selectedBankCode.length > 0 && isUserInfoValid;

  /** 1차 호출 — CODEF가 외부 앱으로 인증 푸시 발송 */
  const startSimpleAuth = useCallback(
    async (provider: SimpleAuthProvider) => {
      if (!selectedBank) return;
      if (!isUserInfoValid) {
        setError("이름·생년월일·전화번호를 정확히 입력해 주세요.");
        setFlowState("error");
        return;
      }

      setFlowState("authenticating");
      setError("");
      setSelectedProvider(provider);

      try {
        const result = await connectCodefAccount({
          type: "bank",
          organization: selectedBank.code,
          loginType: "5",
          loginTypeLevel: provider.level,
          userName: userName.trim(),
          birthDate: birthDate.trim(),
          phoneNo: phoneNo.replace(/[^\d]/g, ""),
        });

        if (result.pending2Way && result.twoWayInfo) {
          // 외부 앱 인증 대기
          setTwoWayInfo(result.twoWayInfo);
          setFlowState("pending2Way");
        } else if (result.connectedId) {
          // 즉시 성공 (드물지만 가능)
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
        } else {
          throw new Error("CODEF 응답이 비정상입니다.");
        }
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : "인증 시작 중 오류가 발생했습니다.";
        setError(msg);
        setFlowState("error");
      }
    },
    [selectedBank, userName, birthDate, phoneNo, nickname, ownerId, isUserInfoValid],
  );

  /** 2차 호출 — 사용자가 외부 앱 동의 후 [인증 완료] 클릭 */
  const confirmSimpleAuth = useCallback(async () => {
    if (!selectedBank || !twoWayInfo || !selectedProvider) return;

    setFlowState("confirming");
    setError("");

    try {
      const result = await connectCodefAccount({
        type: "bank",
        organization: selectedBank.code,
        loginType: "5",
        loginTypeLevel: selectedProvider.level,
        userName: userName.trim(),
        birthDate: birthDate.trim(),
        phoneNo: phoneNo.replace(/[^\d]/g, ""),
        twoWayInfo,
      });

      if (result.connectedId) {
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
      } else {
        throw new Error("연결 결과를 받지 못했습니다.");
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "인증 확인 중 오류가 발생했습니다.";
      setError(msg);
      setFlowState("error");
    }
  }, [selectedBank, twoWayInfo, selectedProvider, userName, birthDate, phoneNo, nickname, ownerId]);

  /** 재시도 */
  const handleRetry = () => {
    setError("");
    setTwoWayInfo(null);
    setSelectedProvider(null);
    setFlowState("idle");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 배경 오버레이 */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={isLoading ? undefined : onClose}
      />

      {/* 모달 본체 */}
      <div className="relative w-full max-w-2xl bg-[#0B1120] border border-border rounded-2xl shadow-2xl overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-2.5">
            <Building2 className="w-5 h-5 text-gold" />
            <div>
              <h2 className="text-lg font-semibold text-white">계좌 연동</h2>
              <p className="text-xs text-white/70 mt-0.5">
                사업용 계좌를 간편인증으로 연동하세요
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-white hover:bg-surface transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ─── 성공 화면 ─── */}
        {flowState === "success" && (
          <div className="p-10 flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-green-400" />
            </div>
            <p className="text-white font-bold text-lg">계좌 연동 완료</p>
            <p className="text-white/80 text-sm">
              {selectedBank?.name} 계좌가 연동되었습니다
            </p>
          </div>
        )}

        {/* ─── 외부 앱 인증 대기 화면 ─── */}
        {flowState === "pending2Way" && (
          <div className="p-8 flex flex-col items-center gap-5">
            <div className="w-20 h-20 rounded-full bg-gold/15 flex items-center justify-center animate-pulse">
              <Smartphone className="w-10 h-10 text-gold" />
            </div>
            <div className="text-center">
              <p className="text-white font-bold text-lg mb-2">
                {selectedProvider?.name}에서 인증해 주세요
              </p>
              <p className="text-white/80 text-sm leading-relaxed">
                {phoneNo || "휴대폰"}으로 인증 요청이 발송되었습니다.<br />
                {selectedProvider?.name} 앱에서 인증을 완료한 후<br />
                아래 버튼을 눌러 주세요.
              </p>
            </div>
            <button
              onClick={confirmSimpleAuth}
              className="w-full max-w-xs flex items-center justify-center gap-2 px-5 py-3 text-sm font-bold rounded-xl bg-gradient-to-r from-gold to-gold-bright text-black hover:shadow-lg hover:shadow-gold/30 transition-shadow"
            >
              <CheckCircle2 className="w-4 h-4" />
              인증 완료, 다음 단계
            </button>
            <button
              onClick={handleRetry}
              className="text-xs text-white/60 hover:text-white transition-colors underline"
            >
              취소하고 처음부터
            </button>
          </div>
        )}

        {/* ─── 2차 호출 진행 중 ─── */}
        {flowState === "confirming" && (
          <div className="p-10 flex flex-col items-center gap-4">
            <Loader2 className="w-10 h-10 text-gold animate-spin" />
            <p className="text-white font-bold text-base">
              인증 결과 확인 중...
            </p>
            <p className="text-white/70 text-xs">
              계좌 정보를 가져오고 있습니다
            </p>
          </div>
        )}

        {/* ─── 에러 화면 ─── */}
        {flowState === "error" && (
          <div className="p-8 flex flex-col items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-red-500/15 flex items-center justify-center">
              <AlertCircle className="w-7 h-7 text-red-400" />
            </div>
            <p className="text-red-400 font-semibold text-base">연동 실패</p>
            <p className="text-white/85 text-sm text-center max-w-md leading-relaxed">
              {error}
            </p>
            <button
              onClick={handleRetry}
              className="px-5 py-2.5 text-sm font-medium rounded-xl border border-border bg-surface text-white hover:bg-white/5 transition-colors"
            >
              다시 시도
            </button>
          </div>
        )}

        {/* ─── 입력 폼 (idle / authenticating) ─── */}
        {(flowState === "idle" || flowState === "authenticating") && (
          <>
            <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
              {/* 인증 방법 탭 */}
              <div>
                <label className="block text-sm font-bold text-white mb-2">
                  인증 방법
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setAuthMethod("simple")}
                    disabled={isLoading}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border text-sm font-bold transition-colors ${
                      authMethod === "simple"
                        ? "border-gold/60 bg-gold-dim text-gold"
                        : "border-border bg-surface text-white hover:bg-white/5"
                    } disabled:opacity-50`}
                  >
                    <Smartphone className="w-4 h-4" />
                    간편인증
                  </button>
                  <button
                    onClick={() => setAuthMethod("cert")}
                    disabled={isLoading}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border text-sm font-bold transition-colors ${
                      authMethod === "cert"
                        ? "border-gold/60 bg-gold-dim text-gold"
                        : "border-border bg-surface text-white hover:bg-white/5"
                    } disabled:opacity-50`}
                  >
                    <KeyRound className="w-4 h-4" />
                    공동/금융인증서
                  </button>
                </div>
              </div>

              {/* ── 인증서 모드: 안내만 표시 ── */}
              {authMethod === "cert" && (
                <div className="p-5 bg-surface border border-border rounded-xl">
                  <div className="flex items-start gap-3">
                    <KeyRound className="w-5 h-5 text-gold shrink-0 mt-0.5" />
                    <div className="text-sm text-white leading-relaxed">
                      <p className="font-bold mb-1">공동/금융인증서 로그인</p>
                      <p className="text-white/80">
                        다음 업데이트에서 추가됩니다. 지금은 간편인증으로
                        연동해 주세요.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* ── 간편인증 모드 ── */}
              {authMethod === "simple" && (
                <>
                  {/* 1) 간편인증 인증사 그리드 — 가장 위 */}
                  <div>
                    <label className="block text-sm font-bold text-white mb-2">
                      간편인증 선택
                    </label>
                    <p className="text-xs text-white/70 mb-3">
                      평소 사용하시는 앱을 선택하면 해당 앱으로 인증 요청이
                      전송됩니다.
                    </p>
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                      {SIMPLE_AUTH_PROVIDERS.map((p) => (
                        <button
                          key={p.level}
                          onClick={() => startSimpleAuth(p)}
                          disabled={
                            !canStartSimpleAuth || isLoading || !selectedBankCode
                          }
                          className={`flex flex-col items-center justify-center gap-1 px-2 py-3 rounded-xl text-xs font-bold transition-all hover:scale-105 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100 ${p.brandColor}`}
                          title={p.name}
                        >
                          <span>{p.short}</span>
                        </button>
                      ))}
                    </div>
                    {!selectedBankCode && (
                      <p className="text-xs text-amber-400/80 mt-2 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        아래 은행과 본인 정보를 먼저 입력하세요
                      </p>
                    )}
                    {selectedBankCode && !isUserInfoValid && (
                      <p className="text-xs text-amber-400/80 mt-2 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        본인 정보를 모두 입력하세요
                      </p>
                    )}
                  </div>

                  {/* 2) 은행 선택 */}
                  <div>
                    <label className="block text-sm font-bold text-white mb-2">
                      은행 선택
                    </label>
                    <div className="relative">
                      <select
                        value={selectedBankCode}
                        onChange={(e) => setSelectedBankCode(e.target.value)}
                        disabled={isLoading}
                        className="w-full appearance-none bg-surface border border-border rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-gold/40 transition-colors disabled:opacity-50"
                      >
                        <option value="" style={{ color: "#000" }}>
                          선택해 주세요
                        </option>
                        {BANKS.map((bank) => (
                          <option
                            key={bank.code}
                            value={bank.code}
                            style={{ color: "#000" }}
                          >
                            {bank.name}
                          </option>
                        ))}
                      </select>
                      <ChevronIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white pointer-events-none" />
                    </div>
                  </div>

                  {/* 3) 별칭 */}
                  <div>
                    <label className="block text-sm font-bold text-white mb-2">
                      별칭 <span className="text-white/60 font-normal">(선택)</span>
                    </label>
                    <input
                      type="text"
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                      placeholder="예: 사업용 계좌"
                      disabled={isLoading}
                      className="w-full bg-surface border border-border rounded-xl px-4 py-3 text-white text-sm placeholder:text-white/40 focus:outline-none focus:border-gold/40 transition-colors disabled:opacity-50"
                    />
                  </div>

                  {/* 4) 본인 정보 입력 */}
                  <div className="space-y-3 p-4 bg-surface border border-border rounded-xl">
                    <p className="text-sm font-bold text-white">본인 정보</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-white/80 mb-1.5">
                          이름
                        </label>
                        <input
                          type="text"
                          value={userName}
                          onChange={(e) => setUserName(e.target.value)}
                          placeholder="홍길동"
                          disabled={isLoading}
                          className="w-full bg-[#0B1120] border border-border rounded-lg px-3 py-2.5 text-white text-sm placeholder:text-white/40 focus:outline-none focus:border-gold/40 transition-colors disabled:opacity-50"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-white/80 mb-1.5">
                          생년월일 (YYYYMMDD)
                        </label>
                        <input
                          type="text"
                          value={birthDate}
                          onChange={(e) =>
                            setBirthDate(e.target.value.replace(/[^\d]/g, "").slice(0, 8))
                          }
                          placeholder="19800101"
                          disabled={isLoading}
                          inputMode="numeric"
                          maxLength={8}
                          className="w-full bg-[#0B1120] border border-border rounded-lg px-3 py-2.5 text-white text-sm placeholder:text-white/40 focus:outline-none focus:border-gold/40 transition-colors disabled:opacity-50"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-white/80 mb-1.5">
                          휴대폰 번호 (- 없이)
                        </label>
                        <input
                          type="tel"
                          value={phoneNo}
                          onChange={(e) =>
                            setPhoneNo(e.target.value.replace(/[^\d]/g, "").slice(0, 11))
                          }
                          placeholder="01012345678"
                          disabled={isLoading}
                          inputMode="tel"
                          maxLength={11}
                          className="w-full bg-[#0B1120] border border-border rounded-lg px-3 py-2.5 text-white text-sm placeholder:text-white/40 focus:outline-none focus:border-gold/40 transition-colors disabled:opacity-50"
                        />
                      </div>
                    </div>
                    <div className="flex items-start gap-1.5 mt-1 text-xs text-white/70">
                      <Shield className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                      <span>
                        본인 정보는 CODEF 인증에만 사용되며 LAW-CADDY 서버에
                        저장되지 않습니다.
                      </span>
                    </div>
                  </div>
                </>
              )}

              {/* 1차 호출 진행 중 안내 */}
              {flowState === "authenticating" && (
                <div className="p-4 bg-surface border border-border rounded-xl flex items-center gap-3">
                  <Loader2 className="w-5 h-5 text-gold animate-spin shrink-0" />
                  <div className="text-sm text-white">
                    <p className="font-bold">인증 요청 전송 중...</p>
                    <p className="text-white/70 text-xs mt-0.5">
                      잠시만 기다려 주세요
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* 푸터 */}
            <div className="flex items-center justify-between gap-3 p-5 border-t border-border bg-[#0B1120]">
              <button
                onClick={onClose}
                disabled={isLoading}
                className="px-5 py-2.5 text-sm font-bold text-white hover:opacity-80 transition-opacity disabled:opacity-50"
              >
                취소
              </button>
              <p className="text-xs text-white/60 flex items-center gap-1">
                <ArrowRight className="w-3 h-3" />
                인증사 클릭 시 자동으로 인증이 시작됩니다
              </p>
            </div>
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
