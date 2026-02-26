import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CheckCircle2, XCircle, MinusCircle, ChevronRight, Loader2 } from "lucide-react";
import AppLayout from "../components/layout/AppLayout";
import useDocument from "../hooks/useDocument";
import type { CheckQuestion } from "../types/document";
import type { CaseType, DocType } from "../types/agent";

type Answer = "yes" | "no" | "partial";

export default function CheckpointPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as {
    clientName: string;
    caseType: CaseType;
    caseDesc: string;
    docType: DocType;
    ownerId: string;
    firmName: string;
    lawyerName: string;
    agentResults: Record<string, string>;
  } | null;

  const { checkQuestions, generateCheckQuestions, status } = useDocument();
  const [answers, setAnswers] = useState<Record<number, Answer>>({});
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!state || initialized) return;
    setInitialized(true);
    generateCheckQuestions({
      clientName: state.clientName,
      caseType: state.caseType,
      caseDesc: state.caseDesc,
      docType: state.docType,
      transcript: state.agentResults.stt ?? "",
    });
  }, [state, initialized, generateCheckQuestions]);

  const handleAnswer = (id: number, answer: Answer) => {
    setAnswers((prev) => ({ ...prev, [id]: answer }));
  };

  const allAnswered = checkQuestions.length > 0 && checkQuestions.every((q) => answers[q.id] !== undefined);

  const handleNext = () => {
    if (!state) return;
    navigate("/record/document", {
      state: {
        ...state,
        checkQuestions,
        answers,
      },
    });
  };

  if (!state) {
    return (
      <AppLayout title="체크포인트" subtitle="확인 질문">
        <div className="text-center py-16 text-text-dim">사건 정보가 없습니다.</div>
      </AppLayout>
    );
  }

  const categoryColors: Record<string, string> = {
    "증거확보": "bg-error/15 text-error",
    "사실관계": "bg-info/15 text-info",
    "법리검토": "bg-gold-dim text-gold",
    "전략수립": "bg-success/15 text-success",
    "절차확인": "bg-warning/15 text-warning",
  };

  const answerButtons: { value: Answer; icon: React.ElementType; label: string; color: string }[] = [
    { value: "yes", icon: CheckCircle2, label: "예", color: "text-success border-success/30 bg-success/10" },
    { value: "partial", icon: MinusCircle, label: "일부", color: "text-warning border-warning/30 bg-warning/10" },
    { value: "no", icon: XCircle, label: "아니오", color: "text-error border-error/30 bg-error/10" },
  ];

  return (
    <AppLayout title="체크포인트" subtitle={`${state.clientName} - ${state.docType}`}>
      <div className="max-w-3xl">
        <div className="bg-gold-dim border border-gold/20 rounded-xl p-4 mb-6">
          <p className="text-sm text-gold">
            문서 작성 전 아래 사항을 확인해 주세요. 정확한 문서 생성을 위해 모든 질문에 답변해 주세요.
          </p>
        </div>

        {status === "generating_questions" ? (
          <div className="flex items-center gap-3 justify-center py-16 text-text-dim">
            <Loader2 className="w-5 h-5 animate-spin" />
            체크포인트 질문 생성 중...
          </div>
        ) : (
          <div className="space-y-4">
            {checkQuestions.map((q: CheckQuestion) => (
              <div
                key={q.id}
                className="bg-surface border border-border rounded-2xl p-5 backdrop-blur-sm"
              >
                <div className="flex items-start gap-3 mb-3">
                  <span className="w-7 h-7 bg-gold-dim rounded-full flex items-center justify-center text-sm font-medium text-gold shrink-0">
                    {q.id}
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${categoryColors[q.category] ?? "bg-surface text-text-dim"}`}>
                        {q.category}
                      </span>
                    </div>
                    <p className="text-text-primary font-medium mb-1">{q.question}</p>
                    <p className="text-sm text-text-dim">{q.why}</p>
                  </div>
                </div>

                <div className="flex gap-2 ml-10">
                  {answerButtons.map((btn) => (
                    <button
                      key={btn.value}
                      onClick={() => handleAnswer(q.id, btn.value)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-all ${
                        answers[q.id] === btn.value
                          ? btn.color
                          : "border-border text-text-dim hover:border-border-hover"
                      }`}
                    >
                      <btn.icon className="w-4 h-4" />
                      {btn.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {allAnswered && (
          <div className="mt-6 flex justify-end">
            <button
              onClick={handleNext}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-gold to-gold-bright text-navy font-semibold rounded-lg hover:opacity-90 transition-opacity"
            >
              문서 생성
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
