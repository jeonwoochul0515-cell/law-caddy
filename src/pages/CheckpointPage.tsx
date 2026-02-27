import { useEffect, useState, useRef, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ChevronRight,
  Loader2,
  Paperclip,
  Mic,
  MicOff,
  Camera,
  X,
  FileText,
  ImageIcon,
  File,
  Lightbulb,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import AppLayout from "../components/layout/AppLayout";
import useDocument from "../hooks/useDocument";
import type { CheckQuestion, CheckpointAnswer } from "../types/document";
import type { CaseType, DocType } from "../types/agent";

/** 녹음 상태 관리 (질문별 독립 녹음) */
interface RecordingState {
  questionId: number | null;
  isRecording: boolean;
  duration: number;
  mediaRecorder: MediaRecorder | null;
  chunks: Blob[];
  stream: MediaStream | null;
  timerInterval: ReturnType<typeof setInterval> | null;
}

/** 파일 타입에 따른 아이콘 */
function FileIcon({ name }: { name: string }) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["jpg", "jpeg", "png", "gif", "webp", "heic", "bmp"].includes(ext)) {
    return <ImageIcon className="w-3.5 h-3.5 text-blue" />;
  }
  if (["pdf", "doc", "docx", "hwp", "txt", "rtf"].includes(ext)) {
    return <FileText className="w-3.5 h-3.5 text-gold" />;
  }
  return <File className="w-3.5 h-3.5 text-text-dim" />;
}

/** 녹음 시간 포맷팅 */
function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

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
    typedNotes?: string;
    agentResults: Record<string, string>;
  } | null;

  const { checkQuestions, generateCheckQuestions, status } = useDocument();

  // 각 질문별 답변 상태
  const [answers, setAnswers] = useState<Map<number, CheckpointAnswer>>(new Map());
  const [initialized, setInitialized] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // 파일 입력 ref (질문별)
  const fileInputRefs = useRef<Map<number, HTMLInputElement>>(new Map());
  const cameraInputRefs = useRef<Map<number, HTMLInputElement>>(new Map());

  // 녹음 상태
  const [recording, setRecording] = useState<RecordingState>({
    questionId: null,
    isRecording: false,
    duration: 0,
    mediaRecorder: null,
    chunks: [],
    stream: null,
    timerInterval: null,
  });

  // 질문 생성
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

  // 질문이 로드되면 첫 번째 질문 확장
  useEffect(() => {
    if (checkQuestions.length > 0 && expandedId === null) {
      setExpandedId(checkQuestions[0].id);
    }
  }, [checkQuestions, expandedId]);

  /** 질문에 대한 현재 답변 가져오기 (없으면 초기값) */
  const getAnswer = useCallback(
    (questionId: number): CheckpointAnswer => {
      return (
        answers.get(questionId) ?? {
          questionId,
          text: "",
          files: [],
          audioBlob: null,
        }
      );
    },
    [answers],
  );

  /** 답변 업데이트 */
  const updateAnswer = useCallback(
    (questionId: number, partial: Partial<CheckpointAnswer>) => {
      setAnswers((prev) => {
        const next = new Map(prev);
        const current = next.get(questionId) ?? {
          questionId,
          text: "",
          files: [],
          audioBlob: null,
        };
        next.set(questionId, { ...current, ...partial });
        return next;
      });
    },
    [],
  );

  /** 텍스트 입력 핸들러 */
  const handleTextChange = useCallback(
    (questionId: number, text: string) => {
      updateAnswer(questionId, { text });
    },
    [updateAnswer],
  );

  /** 파일 첨부 핸들러 */
  const handleFileAdd = useCallback(
    (questionId: number, newFiles: FileList | null) => {
      if (!newFiles || newFiles.length === 0) return;
      const current = getAnswer(questionId);
      const combined = [...current.files, ...Array.from(newFiles)];
      updateAnswer(questionId, { files: combined });
    },
    [getAnswer, updateAnswer],
  );

  /** 파일 삭제 핸들러 */
  const handleFileRemove = useCallback(
    (questionId: number, fileIndex: number) => {
      const current = getAnswer(questionId);
      const updated = current.files.filter((_, i) => i !== fileIndex);
      updateAnswer(questionId, { files: updated });
    },
    [getAnswer, updateAnswer],
  );

  /** 녹음 시작 */
  const startRecording = useCallback(
    async (questionId: number) => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: "audio/webm;codecs=opus",
        });
        const chunks: Blob[] = [];

        mediaRecorder.ondataavailable = (e: BlobEvent) => {
          if (e.data.size > 0) chunks.push(e.data);
        };

        mediaRecorder.onstop = () => {
          const blob = new Blob(chunks, { type: "audio/webm" });
          updateAnswer(questionId, { audioBlob: blob });
          stream.getTracks().forEach((t) => t.stop());
          setRecording((prev) => {
            if (prev.timerInterval) clearInterval(prev.timerInterval);
            return {
              questionId: null,
              isRecording: false,
              duration: 0,
              mediaRecorder: null,
              chunks: [],
              stream: null,
              timerInterval: null,
            };
          });
        };

        mediaRecorder.start(1000);

        const timerInterval = setInterval(() => {
          setRecording((prev) => ({ ...prev, duration: prev.duration + 1 }));
        }, 1000);

        setRecording({
          questionId,
          isRecording: true,
          duration: 0,
          mediaRecorder,
          chunks,
          stream,
          timerInterval,
        });
      } catch {
        // 마이크 접근 실패
      }
    },
    [updateAnswer],
  );

  /** 녹음 중지 */
  const stopRecording = useCallback(() => {
    if (recording.mediaRecorder && recording.mediaRecorder.state !== "inactive") {
      recording.mediaRecorder.stop();
    }
  }, [recording.mediaRecorder]);

  /** 녹음 삭제 */
  const removeAudio = useCallback(
    (questionId: number) => {
      updateAnswer(questionId, { audioBlob: null });
    },
    [updateAnswer],
  );

  // 답변된 질문 수
  const answeredCount = checkQuestions.filter((q) => {
    const a = answers.get(q.id);
    return a && (a.text.trim() || a.files.length > 0 || a.audioBlob);
  }).length;

  const canProceed = checkQuestions.length > 0;

  /** 다음 단계로 이동 */
  const handleNext = () => {
    if (!state) return;
    const checkpointAnswers: CheckpointAnswer[] = checkQuestions.map((q) =>
      getAnswer(q.id),
    );
    navigate("/record/document", {
      state: {
        ...state,
        checkQuestions,
        checkpointAnswers,
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

  return (
    <AppLayout title="체크포인트" subtitle={`${state.clientName} - ${state.docType}`}>
      <div className="max-w-3xl">
        {/* 안내 배너 */}
        <div className="bg-gold-dim border border-gold/20 rounded-xl p-4 mb-6">
          <p className="text-sm text-gold font-medium mb-1">
            선배 변호사의 체크리스트
          </p>
          <p className="text-xs text-gold/70">
            추가 정보가 있으면 입력하세요. 답변 없이도 기존 상담 내용만으로 문서를 생성할 수 있습니다.
          </p>
        </div>

        {/* 진행률 */}
        {checkQuestions.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-text-dim">답변 진행률</span>
              <span className="text-sm text-gold font-medium">
                {answeredCount}/{checkQuestions.length}
              </span>
            </div>
            <div className="h-2 bg-surface rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-gold to-gold-bright rounded-full transition-all duration-500"
                style={{ width: `${(answeredCount / checkQuestions.length) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* 질문 목록 */}
        {status === "generating_questions" ? (
          <div className="flex items-center gap-3 justify-center py-16 text-text-dim">
            <Loader2 className="w-5 h-5 animate-spin" />
            선배 변호사가 체크리스트를 준비 중...
          </div>
        ) : (
          <div className="space-y-3">
            {checkQuestions.map((q: CheckQuestion) => {
              const answer = getAnswer(q.id);
              const isExpanded = expandedId === q.id;
              const hasAnswer = answer.text.trim() || answer.files.length > 0 || answer.audioBlob;
              const isRecordingThis = recording.questionId === q.id && recording.isRecording;

              return (
                <div
                  key={q.id}
                  className={`bg-surface border rounded-2xl backdrop-blur-sm transition-all ${
                    isExpanded
                      ? "border-gold/30"
                      : hasAnswer
                        ? "border-success/20"
                        : "border-border"
                  }`}
                >
                  {/* 헤더 (접기/펼치기) */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : q.id)}
                    className="w-full p-4 flex items-start gap-3 text-left"
                  >
                    <span
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-medium shrink-0 ${
                        hasAnswer
                          ? "bg-success/15 text-success"
                          : "bg-gold-dim text-gold"
                      }`}
                    >
                      {hasAnswer ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : (
                        q.id
                      )}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                            categoryColors[q.category] ?? "bg-surface text-text-dim"
                          }`}
                        >
                          {q.category}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-text-primary">{q.question}</p>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-text-dim shrink-0 mt-1" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-text-dim shrink-0 mt-1" />
                    )}
                  </button>

                  {/* 확장 영역 */}
                  {isExpanded && (
                    <div className="px-4 pb-4 space-y-3">
                      {/* 이유 */}
                      <p className="text-xs text-text-dim ml-10">{q.why}</p>

                      {/* 힌트 */}
                      {q.hints && q.hints.length > 0 && (
                        <div className="ml-10 bg-navy-light/50 rounded-lg p-3 space-y-1">
                          {q.hints.map((hint, i) => (
                            <div key={i} className="flex items-start gap-1.5">
                              <Lightbulb className="w-3 h-3 text-gold/60 shrink-0 mt-0.5" />
                              <span className="text-xs text-text-dim">{hint}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* 텍스트 입력 */}
                      <div className="ml-10">
                        <textarea
                          value={answer.text}
                          onChange={(e) => handleTextChange(q.id, e.target.value)}
                          placeholder="답변을 입력하세요..."
                          rows={3}
                          className="w-full bg-navy-light border border-border rounded-lg p-3 text-sm text-text-primary placeholder:text-text-dim/50 focus:border-gold/40 focus:outline-none resize-none transition-colors"
                        />
                      </div>

                      {/* 액션 버튼 */}
                      <div className="ml-10 flex items-center gap-2">
                        {/* 파일 첨부 */}
                        <button
                          onClick={() => fileInputRefs.current.get(q.id)?.click()}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-border text-text-dim hover:border-gold/30 hover:text-gold transition-colors"
                        >
                          <Paperclip className="w-3.5 h-3.5" />
                          파일 첨부
                        </button>
                        <input
                          ref={(el) => {
                            if (el) fileInputRefs.current.set(q.id, el);
                          }}
                          type="file"
                          multiple
                          className="hidden"
                          onChange={(e) => handleFileAdd(q.id, e.target.files)}
                        />

                        {/* 카메라 */}
                        <button
                          onClick={() => cameraInputRefs.current.get(q.id)?.click()}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-border text-text-dim hover:border-gold/30 hover:text-gold transition-colors"
                        >
                          <Camera className="w-3.5 h-3.5" />
                          촬영
                        </button>
                        <input
                          ref={(el) => {
                            if (el) cameraInputRefs.current.set(q.id, el);
                          }}
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          onChange={(e) => handleFileAdd(q.id, e.target.files)}
                        />

                        {/* 녹음 */}
                        {isRecordingThis ? (
                          <button
                            onClick={stopRecording}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-error/30 text-error bg-error/10 animate-pulse"
                          >
                            <MicOff className="w-3.5 h-3.5" />
                            녹음 중지 ({formatDuration(recording.duration)})
                          </button>
                        ) : (
                          <button
                            onClick={() => startRecording(q.id)}
                            disabled={recording.isRecording}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-border text-text-dim hover:border-gold/30 hover:text-gold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <Mic className="w-3.5 h-3.5" />
                            녹음
                          </button>
                        )}
                      </div>

                      {/* 첨부 파일 목록 */}
                      {answer.files.length > 0 && (
                        <div className="ml-10 space-y-1">
                          {answer.files.map((file, i) => (
                            <div
                              key={i}
                              className="flex items-center gap-2 px-2.5 py-1.5 bg-navy-light rounded-lg text-xs"
                            >
                              <FileIcon name={file.name} />
                              <span className="text-text-primary truncate flex-1">
                                {file.name}
                              </span>
                              <span className="text-text-dim shrink-0">
                                {(file.size / 1024).toFixed(0)}KB
                              </span>
                              <button
                                onClick={() => handleFileRemove(q.id, i)}
                                className="text-text-dim hover:text-error shrink-0"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* 녹음 파일 */}
                      {answer.audioBlob && (
                        <div className="ml-10 flex items-center gap-2 px-2.5 py-1.5 bg-navy-light rounded-lg text-xs">
                          <Mic className="w-3.5 h-3.5 text-gold" />
                          <span className="text-text-primary flex-1">
                            음성 답변 ({(answer.audioBlob.size / 1024).toFixed(0)}KB)
                          </span>
                          <button
                            onClick={() => removeAudio(q.id)}
                            className="text-text-dim hover:text-error shrink-0"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* 하단 안내 + 진행 버튼 */}
        {checkQuestions.length > 0 && (
          <div className="mt-6">
            <div className="flex justify-end">
              <button
                disabled={!canProceed}
                onClick={handleNext}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-gold to-gold-bright text-navy font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              >
                문서 생성
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
