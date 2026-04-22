// 법원 사건 진행 자동 추적 카드
// 사건 상세 페이지의 OverviewTab 상단에 표시되며,
// 사건번호 미등록 상태에서는 입력 폼을, 등록 상태에서는 최근 진행상황을 보여줍니다.
// CODEF "대법원 나의사건검색" API를 경유해 공개 정보를 조회합니다.

import { useState } from "react";
import { Timestamp } from "firebase/firestore";
import {
  Landmark,
  Loader2,
  RefreshCw,
  AlertCircle,
  Search,
} from "lucide-react";
import type { Case, CourtEvent } from "../../types/case";
import { lookupCourtCase } from "../../services/codefApi";
import { updateCaseCourtInfo } from "../../services/firebase/firestore";

interface CourtTrackingCardProps {
  caseData: Case;
  onUpdated: () => void; // 부모가 사건 리로드하도록 콜백
}

/**
 * djb2 해시 — (date|type|content) 문자열을 안정적인 id로 변환.
 * CourtEvent 중복 감지 용도이므로 충돌 저항성은 넉넉. 길이 8 base36.
 */
function djb2Hash(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
  }
  // 부호 제거 후 base36 — 최대 7자. 안정된 길이를 위해 앞에 prefix.
  return `ev_${(hash >>> 0).toString(36)}`;
}

/** 상대시간 포맷 ("방금 전", "3분 전", "2시간 전", "어제", "3일 전", YYYY-MM-DD) */
function formatRelativeTime(ts: Timestamp | undefined): string {
  if (!ts?.toDate) return "아직 조회 없음";
  const date = ts.toDate();
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 30) return "방금 전";
  if (diffSec < 60) return `${diffSec}초 전`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay === 1) return "어제";
  if (diffDay < 7) return `${diffDay}일 전`;
  return date.toLocaleDateString("ko-KR");
}

/** 이벤트 타입 문자열에 따라 뱃지 색상을 매핑 */
function getEventBadgeClass(type: string): string {
  if (type.includes("판결") || type.includes("선고")) {
    return "bg-success/15 text-success";
  }
  if (type.includes("기일") || type.includes("변론") || type.includes("심리")) {
    return "bg-gold/15 text-gold";
  }
  if (type.includes("접수") || type.includes("송달") || type.includes("제출")) {
    return "bg-info/15 text-info";
  }
  return "bg-surface text-text-dim";
}

export default function CourtTrackingCard({
  caseData,
  onUpdated,
}: CourtTrackingCardProps) {
  const [caseNumberInput, setCaseNumberInput] = useState("");
  const [courtNameInput, setCourtNameInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasCaseNumber = Boolean(caseData.caseNumber);
  const courtEvents = caseData.courtEvents ?? [];
  const recentEvents = [...courtEvents]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, 3);
  const remainingCount = Math.max(0, courtEvents.length - 3);

  /**
   * lookupCourtCase 호출 → 결과를 CourtEvent[]로 변환 → updateCaseCourtInfo 저장.
   * 등록 모드(hasCaseNumber=false)일 때는 입력값을, 새로고침 모드일 때는 기존 caseData 필드를 사용.
   */
  const runLookup = async (params: { caseNumber: string; courtName?: string }) => {
    setLoading(true);
    setError(null);
    try {
      const result = await lookupCourtCase(params.caseNumber, params.courtName);

      const now = Timestamp.now();
      const newEvents: CourtEvent[] = result.events.map((ev) => ({
        id: djb2Hash(`${ev.date}|${ev.type}|${ev.content}`),
        date: ev.date,
        type: ev.type,
        content: ev.content,
        discoveredAt: now,
      }));

      await updateCaseCourtInfo(caseData.id, {
        caseNumber: result.caseNumber,
        courtName: result.courtName,
        newEvents,
      });

      onUpdated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "조회 중 오류가 발생했습니다.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = () => {
    const trimmed = caseNumberInput.trim();
    if (!trimmed) {
      setError("사건번호를 입력해 주세요.");
      return;
    }
    const court = courtNameInput.trim();
    void runLookup({ caseNumber: trimmed, courtName: court || undefined });
  };

  const handleRefresh = () => {
    if (!caseData.caseNumber) return;
    void runLookup({
      caseNumber: caseData.caseNumber,
      courtName: caseData.courtName,
    });
  };

  return (
    <div className="bg-surface border border-border rounded-2xl p-5 backdrop-blur-sm">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 bg-gold/10 rounded-xl flex items-center justify-center shrink-0">
            <Landmark className="w-5 h-5 text-gold" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-text-primary">
              법원 사건 진행 자동 추적
            </h3>
            {hasCaseNumber ? (
              <p className="text-xs text-text-dim truncate">
                {caseData.courtName ?? "법원 미지정"} · {caseData.caseNumber}
              </p>
            ) : (
              <p className="text-xs text-text-dim">
                사건번호를 등록하면 진행상황이 자동 추적됩니다
              </p>
            )}
          </div>
        </div>

        {hasCaseNumber && (
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs text-text-dim hover:border-gold/30 hover:text-gold transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            {loading ? "조회 중..." : "새로고침"}
          </button>
        )}
      </div>

      {/* 모드 A: 사건번호 미등록 */}
      {!hasCaseNumber && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-text-dim mb-1.5">
                사건번호 <span className="text-error">*</span>
              </label>
              <input
                type="text"
                value={caseNumberInput}
                onChange={(e) => setCaseNumberInput(e.target.value)}
                placeholder="예: 2024가단12345"
                className="w-full px-3 py-2 bg-navy-light border border-border rounded-lg text-sm text-text-primary placeholder:text-text-dim focus:outline-none focus:border-gold/50 transition-colors"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-[11px] text-text-dim mb-1.5">
                법원명 <span className="text-text-dim">(선택)</span>
              </label>
              <input
                type="text"
                value={courtNameInput}
                onChange={(e) => setCourtNameInput(e.target.value)}
                placeholder="예: 서울중앙지방법원"
                className="w-full px-3 py-2 bg-navy-light border border-border rounded-lg text-sm text-text-primary placeholder:text-text-dim focus:outline-none focus:border-gold/50 transition-colors"
                disabled={loading}
              />
            </div>
          </div>

          <button
            onClick={handleRegister}
            disabled={loading || !caseNumberInput.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-gold to-gold-bright text-navy font-semibold rounded-lg text-sm hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
            {loading ? "조회 중..." : "조회하고 연결"}
          </button>
        </div>
      )}

      {/* 모드 B: 사건번호 등록됨 */}
      {hasCaseNumber && (
        <div className="space-y-3">
          <p className="text-[11px] text-text-dim">
            마지막 조회: {formatRelativeTime(caseData.lastCourtPolledAt)}
          </p>

          {recentEvents.length === 0 ? (
            <p className="text-sm text-text-dim py-4 text-center">
              아직 수집된 진행 내역이 없습니다.
            </p>
          ) : (
            <div className="space-y-2">
              {recentEvents.map((ev) => (
                <div
                  key={ev.id}
                  className="flex items-start gap-3 p-3 bg-navy-light rounded-xl"
                >
                  <div className="text-[11px] text-text-dim font-mono shrink-0 w-20">
                    {ev.date}
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0 ${getEventBadgeClass(
                      ev.type,
                    )}`}
                  >
                    {ev.type}
                  </span>
                  <p className="text-sm text-text-primary min-w-0 flex-1">
                    {ev.content}
                  </p>
                </div>
              ))}
            </div>
          )}

          {remainingCount > 0 && (
            <p className="text-xs text-text-dim text-center pt-1">
              +{remainingCount}건 더 보기 (타임라인 탭에서 확인)
            </p>
          )}
        </div>
      )}

      {/* 에러 배너 */}
      {error && (
        <div className="mt-4 flex items-start gap-2 p-3 bg-error/10 border border-error/20 rounded-xl">
          <AlertCircle className="w-4 h-4 text-error shrink-0 mt-0.5" />
          <p className="text-xs text-error leading-relaxed">{error}</p>
        </div>
      )}
    </div>
  );
}
