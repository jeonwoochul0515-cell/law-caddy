import { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Mic, Upload, Square, ChevronRight, ChevronLeft, Camera, FileText, Image, Music, Film, X, Plus, Type, Save, Loader2, Zap, FolderOpen } from "lucide-react";
import AppLayout from "../components/layout/AppLayout";
import useAuth from "../hooks/useAuth";
import useRecording from "../hooks/useRecording";
import useDropZone from "../hooks/useDropZone";
import { uploadRecordingFile } from "../services/firebase/storage";
import { createRecording, updateRecording, addTimelineEvent } from "../services/firebase/firestore";
import { transcribeFile, pollTranscription, formatTranscript } from "../services/rtzr";
import { getRecordings, getDocuments } from "../services/firebase/firestore";

type InputMode = "record" | "type" | "upload" | "quick";
type Step = "info" | "record" | "agents";

const INPUT_MODES: { mode: InputMode; label: string; desc: string; icon: React.ElementType; color: string }[] = [
  { mode: "record", label: "상담 녹음", desc: "대면 상담 녹음 + 자료 첨부", icon: Mic, color: "text-gold bg-gold-dim" },
  { mode: "type", label: "메모 입력", desc: "상담 내용을 직접 타이핑", icon: Type, color: "text-info bg-info/10" },
  { mode: "upload", label: "자료 첨부", desc: "서류/증거를 업로드하여 분석", icon: Upload, color: "text-success bg-success/10" },
  { mode: "quick", label: "빠른 분석", desc: "사건 개요만으로 바로 AI 분석", icon: Zap, color: "text-warning bg-warning/10" },
];

function getFileIcon(file: File) {
  const type = file.type;
  if (type.startsWith("audio/")) return <Music className="w-5 h-5 text-gold" />;
  if (type.startsWith("image/")) return <Image className="w-5 h-5 text-blue" />;
  if (type.startsWith("video/")) return <Film className="w-5 h-5 text-success" />;
  return <FileText className="w-5 h-5 text-amber" />;
}

function getFileCategory(file: File): string {
  const type = file.type;
  if (type.startsWith("audio/")) return "오디오";
  if (type.startsWith("image/")) return "이미지";
  if (type.startsWith("video/")) return "영상";
  if (type.includes("pdf")) return "PDF";
  if (type.includes("word") || type.includes("document")) return "문서";
  if (type.includes("sheet") || type.includes("excel")) return "스프레드시트";
  if (type.includes("presentation") || type.includes("powerpoint")) return "프레젠테이션";
  return "파일";
}

export default function RecordPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuth((s) => s.user);
  const { isRecording, duration, startRecording, stopRecording } = useRecording();

  // 사건 상세에서 넘어온 경우 프리필
  const prefilled = location.state as {
    caseId?: string;
    clientName?: string;
    caseDesc?: string;
    inputMode?: InputMode;
  } | null;

  const [inputMode, setInputMode] = useState<InputMode>(prefilled?.inputMode ?? "record");
  const [step, setStep] = useState<Step>("info");
  const [files, setFiles] = useState<File[]>([]);
  const [typedNotes, setTypedNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const [savingOnly, setSavingOnly] = useState(false);
  const [saveProgress, setSaveProgress] = useState("");
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // 드래그 앤 드롭
  const { isDragging, dropZoneProps } = useDropZone(
    useCallback((droppedFiles: File[]) => {
      setFiles((prev) => [...prev, ...droppedFiles]);
    }, []),
  );

  // 사건 정보 (프리필 값으로 초기화)
  const [clientName, setClientName] = useState(prefilled?.clientName ?? "");
  const [caseDesc] = useState(prefilled?.caseDesc ?? "");

  // 타이핑 모드: Step 2 진입 시 텍스트 영역 자동 포커스
  useEffect(() => {
    if (step === "record" && inputMode === "type") {
      setTimeout(() => document.getElementById("typed-notes-area")?.focus(), 100);
    }
  }, [step, inputMode]);

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (selected && selected.length > 0) {
      setFiles((prev) => [...prev, ...Array.from(selected)]);
    }
    // input value 초기화 (같은 파일 재선택 가능)
    e.target.value = "";
  };

  const handleCameraCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFiles((prev) => [...prev, selected]);
    }
    e.target.value = "";
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRecord = useCallback(async () => {
    if (isRecording) {
      const blob = await stopRecording();
      if (blob) {
        const audioFile = new File([blob], `recording_${Date.now()}.webm`, { type: "audio/webm" });
        setFiles((prev) => [...prev, audioFile]);
      }
    } else {
      await startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  const handleNext = async () => {
    if (step === "info") {
      if (!clientName) return;
      if (inputMode === "quick") {
        // 빠른 분석: Step 2 스킵, 바로 에이전트로
        if (!user) return;
        setUploading(true);
        try {
          navigate("/record/agents", {
            state: {
              files: [],
              typedNotes: "",
              clientName,
              caseDesc,
              caseId: prefilled?.caseId,
              previousTranscripts: "",
              ownerId: user.uid,
              firmName: user.firmName,
              lawyerName: user.name,
            },
          });
        } finally {
          setUploading(false);
        }
        return;
      }
      setStep("record");
    } else if (step === "record") {
      if ((files.length === 0 && !typedNotes.trim()) || !user) return;
      setUploading(true);
      try {
        // 기존 케이스에서 온 경우: 이전 녹음 대화록 + 분석 결과 가져오기
        let previousTranscripts = "";
        if (prefilled?.caseId) {
          try {
            const [recordings, documents] = await Promise.all([
              getRecordings(prefilled.caseId, user.uid),
              getDocuments(prefilled.caseId, user.uid),
            ]);
            // 이전 STT 대화록 합치기 (시간순)
            const transcripts = recordings
              .filter((r) => r.sttStatus === "completed" && r.transcript)
              .sort((a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0))
              .map((r, i) => `[상담 ${i + 1}] ${r.fileName}\n${r.transcript}`)
              .join("\n\n---\n\n");
            // 이전 분석 결과 요약
            const prevAnalysis = documents
              .filter((d) => d.agentResults?.analysis)
              .map((d) => `[이전 분석 - ${d.docType}]\n${d.agentResults.analysis}`)
              .join("\n\n");
            previousTranscripts = [transcripts, prevAnalysis].filter(Boolean).join("\n\n===\n\n");
          } catch (err) {
            console.error("이전 녹음 조회 실패:", err);
          }
        }

        navigate("/record/agents", {
          state: {
            files,
            typedNotes: typedNotes.trim(),
            clientName,
            caseDesc,
            caseId: prefilled?.caseId,
            previousTranscripts,
            ownerId: user.uid,
            firmName: user.firmName,
            lawyerName: user.name,
          },
        });
      } catch (err) {
        console.error("업로드 실패:", err);
      } finally {
        setUploading(false);
      }
    }
  };

  // 음성 변환 후 저장 (AI 분석 없이 STT만 실행하고 DB 저장)
  const handleSaveOnly = async () => {
    if (!user || !prefilled?.caseId) return;
    const audioFiles = files.filter((f) => f.type.startsWith("audio/"));
    if (audioFiles.length === 0 && !typedNotes.trim()) return;

    setSavingOnly(true);
    const caseId = prefilled.caseId;

    try {
      // 1) 오디오 파일 업로드 + STT
      for (const file of audioFiles) {
        setSaveProgress(`"${file.name}" 업로드 중...`);
        const fileUrl = await uploadRecordingFile(file, user.uid, caseId);

        // 녹음 레코드 생성 (sttStatus: processing)
        const recId = await createRecording({
          caseId,
          ownerId: user.uid,
          fileName: file.name,
          fileUrl,
          fileSizeMB: parseFloat((file.size / (1024 * 1024)).toFixed(2)),
          durationSeconds: 0,
          sttStatus: "processing",
        });

        // STT 전사 요청
        setSaveProgress(`"${file.name}" 음성 변환 중...`);
        try {
          const transcribeId = await transcribeFile(file);
          await updateRecording(recId, { rtzrTranscribeId: transcribeId });

          // 폴링 (최대 6분)
          const POLL_INTERVAL = 3000;
          const MAX_POLLS = 120;
          let completed = false;

          for (let i = 0; i < MAX_POLLS; i++) {
            const result = await pollTranscription(transcribeId);
            if (result.status === "completed" && result.utterances) {
              const transcript = formatTranscript(result.utterances);
              await updateRecording(recId, {
                sttStatus: "completed",
                transcript,
                utterances: result.utterances,
              });
              completed = true;
              break;
            }
            if (result.status === "failed") {
              await updateRecording(recId, { sttStatus: "failed" });
              completed = true;
              break;
            }
            await new Promise((r) => setTimeout(r, POLL_INTERVAL));
          }

          if (!completed) {
            await updateRecording(recId, { sttStatus: "failed" });
          }
        } catch {
          // STT 실패해도 녹음 파일은 저장됨
          await updateRecording(recId, { sttStatus: "failed" });
        }
      }

      // 2) 타임라인 이벤트 추가
      setSaveProgress("타임라인 업데이트 중...");
      await addTimelineEvent(caseId, {
        type: "consult",
        label: "추가 상담 녹음",
        detail: `${audioFiles.length}개 파일 업로드${typedNotes.trim() ? " + 메모" : ""}`,
      });

      // 3) 사건 상세로 이동
      navigate(`/cases/${caseId}`);
    } catch (err) {
      console.error("저장 실패:", err);
      setSaveProgress("저장 중 오류가 발생했습니다.");
    } finally {
      setSavingOnly(false);
    }
  };

  const steps: Step[] = inputMode === "quick" ? ["info", "agents"] : ["info", "record", "agents"];
  const stepLabels: Record<Step, string> = {
    info: "사건 정보",
    record: inputMode === "type" ? "메모 입력" : inputMode === "upload" ? "자료 첨부" : "녹음/업로드",
    agents: "AI 분석",
  };

  return (
    <AppLayout title="새 상담" subtitle={INPUT_MODES.find((m) => m.mode === inputMode)?.desc ?? ""}>
      {/* 단계 표시 */}
      <div className="flex items-center gap-3 mb-8">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center gap-3">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step === s
                  ? "bg-gold text-navy"
                  : i < steps.indexOf(step)
                    ? "bg-gold-dim text-gold"
                    : "bg-surface text-text-dim border border-border"
              }`}
            >
              {i + 1}
            </div>
            <span className={`text-sm hidden sm:inline ${step === s ? "text-text-primary" : "text-text-dim"}`}>
              {stepLabels[s]}
            </span>
            {i < steps.length - 1 && <ChevronRight className="w-4 h-4 text-text-dim" />}
          </div>
        ))}
      </div>

      {/* Step 1: 사건 정보 */}
      {step === "info" && (
        <div className="max-w-2xl">
          <div className="bg-surface border border-border rounded-2xl p-6 backdrop-blur-sm space-y-5">
            <h3 className="text-lg font-semibold text-text-primary">사건 정보 입력</h3>

            <div>
              <label className="block text-sm text-text-dim mb-1.5">의뢰인 이름</label>
              <input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className="w-full px-4 py-3 bg-navy-light border border-border rounded-lg text-text-primary focus:border-gold focus:outline-none transition-colors"
                placeholder="의뢰인 성명"
              />
            </div>

            {/* 입력 모드 선택 */}
            {!prefilled?.caseId && (
              <div>
                <label className="block text-sm text-text-dim mb-2">입력 방식</label>
                <div className="grid grid-cols-2 gap-2">
                  {INPUT_MODES.map((m) => (
                    <button
                      key={m.mode}
                      type="button"
                      onClick={() => setInputMode(m.mode)}
                      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-all text-sm ${
                        inputMode === m.mode
                          ? "bg-gold-dim border border-gold/30 text-gold"
                          : "bg-navy-light border border-border text-text-dim hover:border-border-hover"
                      }`}
                    >
                      <div className={`p-1.5 rounded-lg ${inputMode === m.mode ? "bg-gold/10" : m.color.split(" ")[1]}`}>
                        <m.icon className={`w-3.5 h-3.5 ${inputMode === m.mode ? "text-gold" : m.color.split(" ")[0]}`} />
                      </div>
                      <div>
                        <p className="font-medium">{m.label}</p>
                        <p className={`text-xs ${inputMode === m.mode ? "text-gold/60" : "text-text-dim/60"}`}>{m.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => navigate("/dashboard")}
                className="flex items-center gap-1.5 px-4 py-3 border border-border rounded-lg text-text-dim hover:border-border-hover hover:text-text-primary transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                뒤로
              </button>
              <button
                onClick={handleNext}
                disabled={!clientName}
                className="flex-1 py-3 bg-gradient-to-r from-gold to-gold-bright text-navy font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {inputMode === "quick" ? "AI 분석 시작" : `다음: ${stepLabels.record}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: 녹음/업로드 */}
      {step === "record" && (
        <div className="max-w-2xl space-y-6">
          {/* 녹음 */}
          <div className="bg-surface border border-border rounded-2xl p-6 backdrop-blur-sm">
            <h3 className="text-lg font-semibold text-text-primary mb-4">실시간 녹음</h3>
            <div className="flex flex-col items-center gap-4">
              {/* 파형 시각화 */}
              <div className="flex items-end justify-center gap-1 h-16">
                {[...Array(7)].map((_, i) => (
                  <div
                    key={i}
                    className={`w-1.5 rounded-full transition-all duration-300 ${
                      isRecording
                        ? "bg-gold animate-pulse"
                        : "bg-text-dim"
                    }`}
                    style={{
                      height: isRecording
                        ? `${20 + Math.sin(i * 0.8) * 20 + 20}px`
                        : "8px",
                      animationDelay: `${i * 100}ms`,
                    }}
                  />
                ))}
              </div>

              {isRecording && (
                <span className="text-2xl font-mono text-gold">{formatDuration(duration)}</span>
              )}

              <button
                onClick={handleRecord}
                className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${
                  isRecording
                    ? "bg-error hover:bg-error/80"
                    : "bg-gradient-to-r from-gold to-gold-bright hover:opacity-90"
                }`}
              >
                {isRecording ? (
                  <Square className="w-6 h-6 text-white" />
                ) : (
                  <Mic className="w-6 h-6 text-navy" />
                )}
              </button>
              <p className="text-sm text-text-dim">
                {isRecording ? "녹음 중... 클릭하여 정지" : "클릭하여 녹음 시작"}
              </p>
            </div>
          </div>

          {/* 파일 업로드 + 카메라 + 직접 입력 */}
          <div
            className={`bg-surface border rounded-2xl p-6 backdrop-blur-sm transition-colors ${
              isDragging ? "border-gold bg-gold/5" : "border-border"
            }`}
            {...dropZoneProps}
          >
            <h3 className="text-lg font-semibold text-text-primary mb-4">자료 첨부</h3>

            {/* 드래그 오버레이 */}
            {isDragging && (
              <div className="flex flex-col items-center gap-3 py-10 mb-4 border-2 border-dashed border-gold rounded-xl bg-gold/5">
                <Upload className="w-10 h-10 text-gold animate-bounce" />
                <p className="text-sm text-gold font-medium">여기에 파일을 놓으세요</p>
              </div>
            )}

            {!isDragging && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* 파일 선택 */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center gap-3 border-2 border-dashed border-border rounded-xl p-6 cursor-pointer hover:border-gold/30 transition-colors"
                >
                  <Upload className="w-8 h-8 text-text-dim" />
                  <span className="text-sm text-text-dim text-center">
                    파일 선택
                  </span>
                  <span className="text-xs text-text-dim">
                    오디오, 이미지, 문서 등
                  </span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                />

                {/* 폴더 업로드 */}
                <button
                  type="button"
                  onClick={() => folderInputRef.current?.click()}
                  className="flex flex-col items-center gap-3 border-2 border-dashed border-border rounded-xl p-6 cursor-pointer hover:border-gold/30 transition-colors"
                >
                  <FolderOpen className="w-8 h-8 text-text-dim" />
                  <span className="text-sm text-text-dim text-center">
                    폴더 선택
                  </span>
                  <span className="text-xs text-text-dim">
                    폴더 내 파일 일괄 첨부
                  </span>
                </button>
                {/* @ts-expect-error webkitdirectory는 표준 속성이 아님 */}
                <input
                  ref={folderInputRef}
                  type="file"
                  multiple
                  webkitdirectory=""
                  onChange={handleFileSelect}
                  className="hidden"
                />

                {/* 카메라 촬영 */}
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="flex flex-col items-center gap-3 border-2 border-dashed border-border rounded-xl p-6 cursor-pointer hover:border-gold/30 transition-colors"
                >
                  <Camera className="w-8 h-8 text-text-dim" />
                  <span className="text-sm text-text-dim text-center">
                    카메라 촬영
                  </span>
                  <span className="text-xs text-text-dim">
                    사진 직접 촬영
                  </span>
                </button>
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleCameraCapture}
                  className="hidden"
                />

                {/* 직접 입력 안내 */}
                <button
                  type="button"
                  onClick={() => {
                    document.getElementById("typed-notes-area")?.focus();
                  }}
                  className="flex flex-col items-center gap-3 border-2 border-dashed border-border rounded-xl p-6 cursor-pointer hover:border-gold/30 transition-colors"
                >
                  <Type className="w-8 h-8 text-text-dim" />
                  <span className="text-sm text-text-dim text-center">
                    직접 입력
                  </span>
                  <span className="text-xs text-text-dim">
                    상담 내용 타이핑
                  </span>
                </button>
              </div>
            )}

            {/* 직접 입력 텍스트 영역 */}
            <div className="mt-4">
              <textarea
                id="typed-notes-area"
                value={typedNotes}
                onChange={(e) => setTypedNotes(e.target.value)}
                rows={5}
                className="w-full px-4 py-3 bg-navy-light border border-border rounded-lg text-sm text-text-primary placeholder:text-text-dim/50 focus:border-gold/40 focus:outline-none resize-y transition-colors"
                placeholder="상담 내용이나 참고 자료를 직접 입력하세요. 예: 상담 메모, 사실관계 정리, 증거 목록 등"
              />
              {typedNotes.trim() && (
                <p className="text-xs text-text-dim mt-1.5">
                  {typedNotes.trim().length}자 입력됨
                </p>
              )}
            </div>
          </div>

          {/* 선택된 파일 목록 */}
          {files.length > 0 && (
            <div className="bg-surface border border-border rounded-2xl p-5 backdrop-blur-sm space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-text-primary">
                  첨부 파일 ({files.length}개)
                </h4>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 text-xs text-gold cursor-pointer hover:text-gold-bright transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  추가
                </button>
              </div>
              {files.map((f, i) => (
                <div
                  key={`${f.name}-${i}`}
                  className="flex items-center gap-3 bg-navy-light rounded-lg px-4 py-3"
                >
                  {getFileIcon(f)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text-primary truncate">{f.name}</p>
                    <p className="text-xs text-text-dim">
                      {getFileCategory(f)} · {(f.size / 1024 / 1024).toFixed(1)} MB
                    </p>
                  </div>
                  <button
                    onClick={() => removeFile(i)}
                    className="p-1.5 text-text-dim hover:text-error rounded-lg hover:bg-error/10 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 하단 버튼 */}
          <div className="flex flex-col gap-3">
            {savingOnly && saveProgress && (
              <div className="flex items-center gap-2 px-4 py-3 bg-info/10 border border-info/20 rounded-lg">
                <Loader2 className="w-4 h-4 text-info animate-spin shrink-0" />
                <span className="text-sm text-info">{saveProgress}</span>
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setStep("info")}
                disabled={savingOnly}
                className="flex items-center gap-1.5 px-4 py-3 border border-border rounded-lg text-text-dim hover:border-border-hover hover:text-text-primary transition-colors disabled:opacity-50"
              >
                <ChevronLeft className="w-4 h-4" />
                이전
              </button>
              {(files.length > 0 || typedNotes.trim()) && (
                <>
                  {prefilled?.caseId && (
                    <button
                      onClick={handleSaveOnly}
                      disabled={savingOnly || uploading}
                      className="flex-1 flex items-center justify-center gap-2 py-3 border border-gold/30 text-gold rounded-lg hover:bg-gold-dim transition-colors disabled:opacity-50 font-medium"
                    >
                      {savingOnly ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> 변환 중...</>
                      ) : (
                        <><Save className="w-4 h-4" /> 음성 변환 후 저장</>
                      )}
                    </button>
                  )}
                  <button
                    onClick={handleNext}
                    disabled={uploading || savingOnly}
                    className="flex-1 py-3 bg-gradient-to-r from-gold to-gold-bright text-navy font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {uploading ? "업로드 중..." : "AI 분석 시작"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
