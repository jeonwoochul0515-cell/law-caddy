/**
 * CODEF 계좌 연결 모달
 *
 * 은행/카드/홈택스 연결을 위한 설정 다이얼로그입니다.
 */

import { useState } from "react";
import {
  X,
  Loader2,
  Building2,
  CreditCard,
  FileText,
  Shield,
  AlertCircle,
} from "lucide-react";

// ─── Props ──────────────────────────────────

interface CodefAccountSetupProps {
  ownerId: string;
  onClose: () => void;
  onSuccess: () => void;
}

// ─── 상수 ───────────────────────────────────

type ConnectionType = "bank" | "card" | "hometax";

const CONNECTION_TYPES: {
  key: ConnectionType;
  label: string;
  icon: React.ElementType;
}[] = [
  { key: "bank", label: "은행", icon: Building2 },
  { key: "card", label: "카드", icon: CreditCard },
  { key: "hometax", label: "홈택스", icon: FileText },
];

const BANK_CODES: Record<string, string> = {
  "0004": "국민은행",
  "0088": "신한은행",
  "0020": "우리은행",
  "0081": "하나은행",
  "0003": "기업은행",
  "0011": "농협은행",
  "0023": "SC은행",
  "0090": "카카오뱅크",
  "0089": "케이뱅크",
  "0092": "토스뱅크",
};

const CARD_CODES: Record<string, string> = {
  "0301": "KB국민카드",
  "0302": "현대카드",
  "0303": "삼성카드",
  "0304": "NH농협카드",
  "0305": "BC카드",
  "0306": "신한카드",
  "0307": "하나카드",
  "0309": "롯데카드",
};

// ─── 컴포넌트 ────────────────────────────────

export default function CodefAccountSetup({
  ownerId,
  onClose,
  onSuccess,
}: CodefAccountSetupProps) {
  const [connectionType, setConnectionType] = useState<ConnectionType>("bank");
  const [institutionCode, setInstitutionCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // 현재 연결 유형에 따른 금융기관 목록
  const institutions =
    connectionType === "bank"
      ? BANK_CODES
      : connectionType === "card"
        ? CARD_CODES
        : {};

  const isHometax = connectionType === "hometax";

  /** 계좌/카드 번호 레이블 */
  const numberLabel =
    connectionType === "bank"
      ? "계좌번호"
      : connectionType === "card"
        ? "카드번호"
        : "";

  /** 비밀번호 레이블 */
  const passwordLabel = isHometax ? "홈택스 비밀번호" : "비밀번호";

  /** 폼 유효성 검사 */
  const isValid = (): boolean => {
    if (isHometax) {
      return password.trim().length > 0;
    }
    return (
      institutionCode.length > 0 &&
      accountNumber.trim().length > 0 &&
      password.trim().length > 0
    );
  };

  /** 계좌 연결 처리 */
  const handleConnect = async () => {
    if (!isValid()) return;

    setLoading(true);
    setError("");

    try {
      // CODEF API 연동 (실제 구현 시 서버 프록시 경유)
      // 현재는 Firestore에 계좌 정보 저장 시뮬레이션
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // TODO: 실제 CODEF API 호출
      // const result = await codefService.registerAccount({
      //   ownerId,
      //   type: connectionType,
      //   institutionCode,
      //   accountNumber,
      //   password,
      //   nickname,
      // });

      console.log("계좌 연결 요청:", {
        ownerId,
        type: connectionType,
        institutionCode,
        nickname,
      });

      onSuccess();
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "계좌 연결에 실패했습니다. 입력 정보를 확인 후 다시 시도해 주세요.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 배경 오버레이 */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* 모달 본체 */}
      <div className="relative w-full max-w-lg bg-[#0B1120] border border-border rounded-2xl shadow-2xl overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-lg font-semibold text-text-primary">
            계좌 연결
          </h2>
          <button
            onClick={onClose}
            disabled={loading}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-text-dim hover:text-text-primary hover:bg-surface transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 본문 */}
        <div className="p-5 space-y-5">
          {/* 연결 유형 선택 */}
          <div>
            <label className="block text-sm font-medium text-text-dim mb-2">
              연결 유형
            </label>
            <div className="flex gap-2">
              {CONNECTION_TYPES.map((ct) => {
                const isActive = connectionType === ct.key;
                return (
                  <button
                    key={ct.key}
                    onClick={() => {
                      setConnectionType(ct.key);
                      setInstitutionCode("");
                      setAccountNumber("");
                      setError("");
                    }}
                    disabled={loading}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium transition-colors ${
                      isActive
                        ? "border-gold/40 bg-gold-dim text-gold"
                        : "border-border bg-surface text-text-dim hover:text-text-primary hover:border-border"
                    } disabled:opacity-50`}
                  >
                    <ct.icon className="w-4 h-4" />
                    {ct.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 금융기관 선택 (은행/카드만) */}
          {!isHometax && (
            <div>
              <label className="block text-sm font-medium text-text-dim mb-2">
                금융기관
              </label>
              <div className="relative">
                <select
                  value={institutionCode}
                  onChange={(e) => setInstitutionCode(e.target.value)}
                  disabled={loading}
                  className="w-full appearance-none bg-surface border border-border rounded-xl px-4 py-3 text-text-primary text-sm focus:outline-none focus:border-gold/40 transition-colors disabled:opacity-50"
                >
                  <option value="">선택해 주세요</option>
                  {Object.entries(institutions).map(([code, name]) => (
                    <option key={code} value={code}>
                      {name}
                    </option>
                  ))}
                </select>
                <ChevronIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim pointer-events-none" />
              </div>
            </div>
          )}

          {/* 계좌/카드 번호 (은행/카드만) */}
          {!isHometax && (
            <div>
              <label className="block text-sm font-medium text-text-dim mb-2">
                {numberLabel}
              </label>
              <input
                type="text"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder={`${numberLabel}를 입력해 주세요`}
                disabled={loading}
                className="w-full bg-surface border border-border rounded-xl px-4 py-3 text-text-primary text-sm placeholder:text-text-dim/50 focus:outline-none focus:border-gold/40 transition-colors disabled:opacity-50"
              />
            </div>
          )}

          {/* 비밀번호 */}
          <div>
            <label className="block text-sm font-medium text-text-dim mb-2">
              {passwordLabel}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={`${passwordLabel}를 입력해 주세요`}
              disabled={loading}
              className="w-full bg-surface border border-border rounded-xl px-4 py-3 text-text-primary text-sm placeholder:text-text-dim/50 focus:outline-none focus:border-gold/40 transition-colors disabled:opacity-50"
            />
            <div className="flex items-center gap-1.5 mt-2 text-xs text-text-dim">
              <Shield className="w-3.5 h-3.5 text-info" />
              <span>비밀번호는 암호화되어 CODEF에 전송됩니다</span>
            </div>
          </div>

          {/* 별명 */}
          <div>
            <label className="block text-sm font-medium text-text-dim mb-2">
              별명 <span className="text-text-dim/50">(선택)</span>
            </label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="예: 사무소 운영 계좌"
              disabled={loading}
              className="w-full bg-surface border border-border rounded-xl px-4 py-3 text-text-primary text-sm placeholder:text-text-dim/50 focus:outline-none focus:border-gold/40 transition-colors disabled:opacity-50"
            />
          </div>

          {/* 에러 메시지 */}
          {error && (
            <div className="flex items-start gap-2 p-3 bg-error/10 border border-error/20 rounded-xl">
              <AlertCircle className="w-4 h-4 text-error shrink-0 mt-0.5" />
              <p className="text-sm text-error">{error}</p>
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="flex items-center justify-end gap-3 p-5 border-t border-border">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-5 py-2.5 text-sm font-medium text-text-dim hover:text-text-primary transition-colors disabled:opacity-50"
          >
            취소
          </button>
          <button
            onClick={handleConnect}
            disabled={!isValid() || loading}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-r from-gold to-gold-bright text-[#0B1120] hover:shadow-lg hover:shadow-gold/20"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? "연결 중..." : "연결하기"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 셀렉트 박스 화살표 아이콘 (lucide ChevronDown 인라인) */
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
