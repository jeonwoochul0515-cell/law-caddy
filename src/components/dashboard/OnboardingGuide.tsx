// 신규 사용자 시작 가이드 — 대시보드 상단 체크리스트
//
// 왜 팝업 투어가 아닌가:
//   단계별 오버레이 투어는 한 번 닫으면 끝이고, 실제로 해봤는지와 무관하게 "봤음"으로 처리된다.
//   여기서는 실제 데이터(녹음·사건·문서·수임료 수)로 완료를 판정한다. 거짓 완료가 없고,
//   중간에 나갔다 와도 이어서 진행할 수 있다.
//
// 골프 컨셉과 맞춰 "첫 라운드"의 홀 진행으로 표현한다(히어로 스코어카드와 같은 언어).
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ChevronRight, X, Flag } from "lucide-react";

export interface OnboardingProgress {
  recordings: number;
  cases: number;
  documents: number;
  fees: number;
}

interface OnboardingGuideProps {
  progress: OnboardingProgress;
  /** 가이드를 접는다 (users.onboardingDismissedAt 저장) */
  onDismiss: () => void;
}

export default function OnboardingGuide({ progress, onDismiss }: OnboardingGuideProps) {
  const navigate = useNavigate();

  const holes = useMemo(
    () => [
      {
        no: 1,
        title: "상담 기록하기",
        desc: "녹음 버튼을 누르거나, 상담 메모를 붙여넣기만 하면 됩니다.",
        done: progress.recordings > 0,
        to: "/record",
        cta: "새 상담 시작",
      },
      {
        no: 2,
        title: "사건 파일 만들기",
        desc: "분석이 끝나면 사건이 자동으로 만들어집니다. 진행 중인 사건은 직접 등록할 수도 있습니다.",
        done: progress.cases > 0,
        to: "/cases",
        cta: "사건 등록",
      },
      {
        no: 3,
        title: "첫 서면 초안 받기",
        desc: "확인 질문 몇 개에 답하면 소장·내용증명 등 28종 서식으로 초안이 나옵니다.",
        done: progress.documents > 0,
        to: "/record",
        cta: "초안 만들기",
      },
      {
        no: 4,
        title: "수임료 기록하기",
        desc: "착수금과 성공보수를 사건에 걸어두면 미수금과 월별 손익이 자동으로 집계됩니다.",
        done: progress.fees > 0,
        to: "/cases",
        cta: "사건에서 등록",
      },
    ],
    [progress],
  );

  const doneCount = holes.filter((h) => h.done).length;
  const allDone = doneCount === holes.length;
  // 다음에 해야 할 하나만 펼쳐 보여준다 — 네 개를 동시에 들이밀면 부담스럽다
  const nextHole = holes.find((h) => !h.done);

  return (
    <section
      aria-label="시작 가이드"
      className="mb-8 rounded-2xl border border-gold/25 bg-gold-dim/40 overflow-hidden"
    >
      <div className="flex items-start justify-between gap-4 px-5 sm:px-6 pt-5">
        <div className="flex items-center gap-2.5">
          <Flag className="w-4 h-4 text-gold" />
          <h2 className="text-base font-semibold text-text-primary">
            {allDone ? "첫 라운드를 마쳤습니다" : "첫 라운드 시작하기"}
          </h2>
          <span className="text-sm text-text-dim tabular-nums">
            {doneCount}/{holes.length}
          </span>
        </div>
        <button
          onClick={onDismiss}
          aria-label="시작 가이드 닫기"
          className="p-1.5 -mr-1.5 text-text-dim hover:text-text-primary rounded-lg transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <p className="px-5 sm:px-6 mt-1.5 text-sm text-text-dim">
        {allDone
          ? "이제 모든 기능을 쓰실 수 있습니다. 이 안내는 닫아도 됩니다."
          : "네 단계만 거치면 Law-Caddy의 전체 흐름을 한 번 경험하게 됩니다."}
      </p>

      {/* 진행 막대 */}
      <div className="mx-5 sm:mx-6 mt-4 h-1.5 rounded-full bg-navy-light overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-gold to-gold-bright transition-all duration-500"
          style={{ width: `${(doneCount / holes.length) * 100}%` }}
        />
      </div>

      <ol className="mt-4 divide-y divide-border/70">
        {holes.map((hole) => {
          const isNext = !hole.done && hole.no === nextHole?.no;
          return (
            <li
              key={hole.no}
              className={`flex items-start gap-3.5 px-5 sm:px-6 py-3.5 ${isNext ? "bg-surface/60" : ""}`}
            >
              <span
                className={`mt-0.5 flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold shrink-0 ${
                  hole.done
                    ? "bg-success/15 text-success"
                    : isNext
                      ? "bg-gold text-navy"
                      : "bg-navy-light text-text-dim"
                }`}
              >
                {hole.done ? <Check className="w-3.5 h-3.5" /> : hole.no}
              </span>

              <div className="flex-1 min-w-0">
                <p
                  className={`text-sm font-medium ${
                    hole.done ? "text-text-dim line-through" : "text-text-primary"
                  }`}
                >
                  {hole.title}
                </p>
                {isNext && (
                  <p className="mt-1 text-xs text-text-dim leading-relaxed">{hole.desc}</p>
                )}
              </div>

              {isNext && (
                <button
                  onClick={() => navigate(hole.to)}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-gradient-to-r from-gold to-gold-bright text-navy rounded-lg hover:shadow-lg hover:shadow-gold/20 active:scale-[0.98] transition-all shrink-0"
                >
                  {hole.cta}
                  <ChevronRight className="w-3 h-3" />
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
