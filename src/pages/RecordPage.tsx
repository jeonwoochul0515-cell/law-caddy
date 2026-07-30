import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Mic, Upload, Square, ChevronRight, ChevronLeft, Camera, FileText, Image, Music, Film, X, Plus, Save, Loader2, FolderOpen, AlertCircle, Sparkles, ArrowRight } from "lucide-react";
import AppLayout from "../components/layout/AppLayout";
import useAuth from "../hooks/useAuth";
import useRecording from "../hooks/useRecording";
import useDropZone from "../hooks/useDropZone";
import { uploadRecordingFile } from "../services/firebase/storage";
import { createRecording, updateRecording, addTimelineEvent } from "../services/firebase/firestore";
import { transcribeFile, pollTranscription, formatTranscript } from "../services/rtzr";
import { getRecordings, getDocuments } from "../services/firebase/firestore";
import { getSavedSession, buildSavedFile, clearSession, type RecordingSessionMeta } from "../services/recordingStore";

// (2026-07-31) 녹음과 자료 첨부를 분리했다.
// 상담 중에는 녹음 화면만 보이고, 상담이 끝난 뒤 서류를 챙겨 넣는 것이 실제 순서다.
type Step = "info" | "record" | "attach" | "agents";

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
  const { isRecording, duration, startRecording, stopRecording, interrupted, clearInterrupted } = useRecording();

  // 사건 상세에서 넘어온 경우 프리필
  const prefilled = location.state as {
    caseId?: string;
    clientName?: string;
    caseDesc?: string;
  } | null;

  const [step, setStep] = useState<Step>("info");
  const [files, setFiles] = useState<File[]>([]);
  /** 이 화면에서 직접 녹음한 파일 이름들 — 첨부 목록에서 "상담 녹음"으로 구분해 보여준다 */
  const [recordedNames, setRecordedNames] = useState<string[]>([]);
  /** 브라우저가 죽기 전에 저장된 녹음 조각 — 있으면 복구 배너를 띄운다 */
  const [savedSession, setSavedSession] = useState<RecordingSessionMeta | null>(null);
  const [restoring, setRestoring] = useState(false);
  /** 녹음 시작 전 방해금지 안내를 이미 봤는지 (세션당 한 번) */
  const [tipDismissed, setTipDismissed] = useState(false);
  const [typedNotes, setTypedNotes] = useState("");

  const [uploading, setUploading] = useState(false);
  const [savingOnly, setSavingOnly] = useState(false);
  const [saveProgress, setSaveProgress] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const recordingInProgress = useRef(false);

  // 드래그 앤 드롭
  const { isDragging, dropZoneProps } = useDropZone(
    useCallback((droppedFiles: File[]) => {
      setFiles((prev) => [...prev, ...droppedFiles]);
    }, []),
  );

  // 사건 정보 (프리필 값으로 초기화)
  const [clientName, setClientName] = useState(prefilled?.clientName ?? "");
  const [caseDesc] = useState(prefilled?.caseDesc ?? "");

  // 기존 사건에서 온 경우 바로 녹음 단계로 이동
  useEffect(() => {
    if (prefilled?.caseId && step === "info") {
      setStep("record");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 지난번 녹음이 끊긴 채 남아 있는지 확인 (전화·앱 종료 등)
  useEffect(() => {
    let alive = true;
    getSavedSession().then((meta) => {
      if (alive && meta && meta.duration > 3) setSavedSession(meta);
    });
    return () => {
      alive = false;
    };
  }, []);

  /** 저장돼 있던 녹음을 파일로 되살려 첨부 목록에 넣는다 */
  const handleRestore = async () => {
    setRestoring(true);
    try {
      const file = await buildSavedFile();
      if (file) {
        setFiles((prev) => [...prev, file]);
        setRecordedNames((prev) => [...prev, file.name]);
      }
      await clearSession();
      setSavedSession(null);
    } finally {
      setRestoring(false);
    }
  };

  /** 저장된 녹음을 버린다 */
  const handleDiscardSaved = async () => {
    await clearSession();
    setSavedSession(null);
  };


  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const [hwpWarning, setHwpWarning] = useState("");

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (selected && selected.length > 0) {
      const fileArr = Array.from(selected);
      // DOCX/HWPX는 자동 텍스트 추출 지원 → 허용
      // HWP 바이너리는 ZIP 시도 후 HWPX인지 확인 → 허용 (내부에서 폴백 처리)
      const legacyDocFiles = fileArr.filter((f) => /\.doc$/i.test(f.name) && !/\.docx$/i.test(f.name));
      const legacyPptFiles = fileArr.filter((f) => /\.ppt$/i.test(f.name) && !/\.pptx$/i.test(f.name));
      const blockedFiles = [...legacyDocFiles, ...legacyPptFiles];
      const otherFiles = fileArr.filter((f) => !blockedFiles.includes(f));

      const warnings: string[] = [];
      if (legacyDocFiles.length > 0) {
        const names = legacyDocFiles.map((f) => f.name).join(", ");
        warnings.push(`"${names}" 파일은 레거시 DOC 형식입니다. 워드에서 .docx 형식으로 다시 저장 후 업로드해 주세요.`);
      }
      if (legacyPptFiles.length > 0) {
        const names = legacyPptFiles.map((f) => f.name).join(", ");
        warnings.push(`"${names}" 파일은 레거시 PPT 형식입니다. PowerPoint에서 .pptx 형식으로 다시 저장 후 업로드해 주세요.`);
      }
      if (warnings.length > 0) setHwpWarning(warnings.join("\n"));

      if (otherFiles.length > 0) {
        setFiles((prev) => [...prev, ...otherFiles]);
      }
    }
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

  const [recordError, setRecordError] = useState<string | null>(null);

  const handleRecord = useCallback(async () => {
    if (recordingInProgress.current) return;
    recordingInProgress.current = true;
    setRecordError(null);
    try {
      if (isRecording) {
        const blob = await stopRecording();
        if (blob) {
          const audioFile = new File([blob], `recording_${Date.now()}.webm`, { type: "audio/webm" });
          setFiles((prev) => [...prev, audioFile]);
          setRecordedNames((prev) => [...prev, audioFile.name]);
          // 정상적으로 파일을 확보했으므로 임시 조각은 비운다
          // (남겨두면 다음 진입 때 복구 배너가 잘못 뜬다)
          void clearSession();
          setSavedSession(null);
        }
      } else {
        await startRecording();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "녹음을 시작할 수 없습니다.";
      setRecordError(msg);
    } finally {
      recordingInProgress.current = false;
    }
  }, [isRecording, startRecording, stopRecording]);

  const handleNext = async () => {
    if (step === "info") {
      if (!clientName) return;
      setStep("record");
    } else if (step === "record") {
      // 녹음이 없어도 넘어갈 수 있다 — 녹음 파일을 따로 갖고 있거나 메모만 쓰는 경우가 있다
      setStep("attach");
    } else if (step === "attach") {
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
            // 이전에 생성된 법률 서면 (최종 문서)
            const prevDocuments = documents
              .filter((d) => d.finalDocument && d.status === "completed")
              .sort((a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0))
              .map((d) => `[이전 작성 서면 - ${d.docType}]\n${d.finalDocument}`)
              .join("\n\n---\n\n");
            previousTranscripts = [transcripts, prevAnalysis, prevDocuments].filter(Boolean).join("\n\n===\n\n");
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

  // 음성 변환 후 저장 (AI 분석 없이 파일 저장 + 오디오는 STT 실행)
  const handleSaveOnly = async () => {
    if (!user || !prefilled?.caseId) return;
    if (files.length === 0 && !typedNotes.trim()) return;

    setSavingOnly(true);
    setSaveError(null);
    const caseId = prefilled.caseId;

    try {
      const audioFiles = files.filter((f) => f.type.startsWith("audio/"));
      const nonAudioFiles = files.filter((f) => !f.type.startsWith("audio/"));

      // 1) 비-오디오 파일 업로드 (PDF, 이미지, 문서 등)
      for (const file of nonAudioFiles) {
        setSaveProgress(`"${file.name}" 업로드 중...`);
        const fileUrl = await uploadRecordingFile(file, user.uid, caseId);
        await createRecording({
          caseId,
          ownerId: user.uid,
          fileName: file.name,
          fileUrl,
          fileSizeMB: parseFloat((file.size / (1024 * 1024)).toFixed(2)),
          durationSeconds: 0,
          sttStatus: "completed",
        });
      }

      // 2) 오디오 파일 업로드 + STT
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

      // 3) 타임라인 이벤트 추가
      setSaveProgress("타임라인 업데이트 중...");
      await addTimelineEvent(caseId, {
        type: "consult",
        label: "추가 자료 등록",
        detail: `${files.length}개 파일 업로드${typedNotes.trim() ? " + 메모" : ""}`,
      });

      // 4) 사건 상세로 이동
      navigate(`/cases/${caseId}`);
    } catch (err) {
      console.error("저장 실패:", err);
      setSaveError("저장 중 오류가 발생했습니다.");
    } finally {
      setSavingOnly(false);
    }
  };

  const steps: Step[] = ["info", "record", "attach", "agents"];
  const stepLabels: Record<Step, string> = {
    info: "사건 정보",
    record: "상담 녹음",
    attach: "자료 첨부",
    agents: "AI 분석",
  };

  return (
    <AppLayout title={prefilled?.caseId ? "추가 상담" : "새 상담"} subtitle={prefilled?.caseId ? `${clientName} · 기존 사건에 추가` : "상담 녹음 → 자료 첨부 → AI 분석"}>
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
        <div className="max-w-2xl space-y-4">
          {/* 자유 지시 빠른 경로 (강조 CTA) */}
          {!prefilled?.caseId && (
            <button
              onClick={() => navigate("/freeform")}
              className="group w-full relative overflow-hidden bg-gradient-to-r from-gold via-gold-bright to-gold text-navy rounded-2xl p-5 shadow-lg shadow-gold/20 hover:shadow-gold/40 transition-all text-left"
            >
              <div className="absolute -right-4 -top-4 w-28 h-28 bg-white/10 rounded-full blur-2xl" />
              <div className="relative flex items-center gap-4">
                <div className="w-12 h-12 bg-navy/15 rounded-full flex items-center justify-center shrink-0">
                  <Sparkles className="w-6 h-6 text-navy" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="font-bold text-base">자유 지시로 바로 생성</p>
                    <span className="text-[10px] font-semibold px-2 py-0.5 bg-navy text-gold rounded-full">NEW</span>
                  </div>
                  <p className="text-sm text-navy/80">
                    양식 없이 AI에게 직접 시키기 · 20~30초
                  </p>
                </div>
                <ArrowRight className="w-5 h-5 text-navy shrink-0 group-hover:translate-x-1 transition-transform" />
              </div>
            </button>
          )}

          <div className="bg-surface border border-border rounded-2xl p-6 backdrop-blur-sm space-y-5">
            <h3 className="text-lg font-semibold text-text-primary">사건 정보 입력</h3>

            <div>
              <label className="block text-sm text-text-dim mb-1.5">의뢰인 이름</label>
              <input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                readOnly={!!prefilled?.caseId}
                className={`w-full px-4 py-3 bg-navy-light border border-border rounded-lg text-text-primary focus:border-gold focus:outline-none transition-colors ${prefilled?.caseId ? "opacity-60 cursor-not-allowed" : ""}`}
                placeholder="의뢰인 성명"
              />
              {prefilled?.caseId && (
                <p className="text-xs text-text-dim mt-1">기존 사건의 의뢰인 정보입니다.</p>
              )}
            </div>

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
                다음: 자료 입력
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: 상담 녹음 */}
      {step === "record" && (
        <div className="max-w-2xl space-y-6">
          {/* 중단된 녹음 복구 — 전화·앱 종료로 끊긴 경우 */}
          {savedSession && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-4 bg-warning/10 border border-warning/30 rounded-xl">
              <AlertCircle className="w-5 h-5 text-warning shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-text-primary">
                  저장된 녹음이 있습니다 ({formatDuration(savedSession.duration)})
                </p>
                <p className="text-xs text-text-dim mt-0.5">
                  지난번 녹음이 정상적으로 마무리되지 않았습니다. 그때까지 녹음된 내용은 남아 있습니다.
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={handleDiscardSaved}
                  disabled={restoring}
                  className="px-3 py-2 text-xs text-text-dim border border-border rounded-lg hover:text-text-primary transition-colors disabled:opacity-50"
                >
                  버리기
                </button>
                <button
                  onClick={handleRestore}
                  disabled={restoring}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-warning/20 text-warning rounded-lg hover:bg-warning/30 transition-colors disabled:opacity-50"
                >
                  {restoring ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  불러오기
                </button>
              </div>
            </div>
          )}

          {/* 녹음이 강제로 끊겼을 때 */}
          {interrupted && (
            <div className="flex items-start gap-3 px-4 py-4 bg-error/10 border border-error/30 rounded-xl">
              <AlertCircle className="w-5 h-5 text-error shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-text-primary">녹음이 중단되었습니다</p>
                <p className="text-xs text-text-dim mt-0.5 leading-relaxed">
                  전화가 오거나 다른 앱이 마이크를 사용하면 녹음이 멈춥니다.
                  중단 직전까지의 내용은 저장되었습니다. 아래 버튼으로 이어서 녹음하세요.
                </p>
              </div>
              <button
                onClick={clearInterrupted}
                aria-label="알림 닫기"
                className="p-1 text-text-dim hover:text-text-primary shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* 녹음 전 안내 — 전화 차단이 가장 확실한 예방책이다 */}
          {!tipDismissed && !isRecording && recordedNames.length === 0 && (
            <div className="flex items-start gap-3 px-4 py-3.5 bg-info/8 border border-info/20 rounded-xl">
              <Sparkles className="w-4 h-4 text-info shrink-0 mt-0.5" />
              <p className="flex-1 text-xs text-text-dim leading-relaxed">
                <strong className="text-text-primary">녹음 전에 방해금지 모드를 켜주세요.</strong>{" "}
                상담 중 전화가 오면 녹음이 멈춥니다. 아이폰은 제어센터의 초승달 아이콘,
                안드로이드는 방해금지를 켜면 됩니다. 5초마다 자동 저장되므로 끊겨도 그때까지는 남습니다.
              </p>
              <button
                onClick={() => setTipDismissed(true)}
                aria-label="안내 닫기"
                className="p-1 text-text-dim hover:text-text-primary shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

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
                aria-label={isRecording ? "녹음 정지" : "녹음 시작"}
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
              {recordError && (
                <p className="text-xs text-error mt-2 text-center">
                  {recordError.includes("not found")
                    ? "마이크를 찾을 수 없습니다. 파일 첨부로 녹음 파일을 업로드하세요."
                    : recordError}
                </p>
              )}
            </div>

            {/* 녹음된 파일 목록 — 이 단계에서 확보한 결과 */}
            {recordedNames.length > 0 && (
              <div className="mt-5 pt-5 border-t border-border space-y-2">
                <h4 className="text-sm font-medium text-text-primary">
                  녹음 완료 ({recordedNames.length}건)
                </h4>
                {files
                  .map((f, i) => ({ f, i }))
                  .filter(({ f }) => recordedNames.includes(f.name))
                  .map(({ f, i }) => (
                    <div key={`${f.name}-${i}`} className="flex items-center gap-3 bg-navy-light rounded-lg px-4 py-3">
                      <Music className="w-5 h-5 text-gold shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-text-primary truncate">상담 녹음</p>
                        <p className="text-xs text-text-dim">{(f.size / 1024 / 1024).toFixed(1)} MB</p>
                      </div>
                      <button
                        onClick={() => {
                          removeFile(i);
                          setRecordedNames((prev) => prev.filter((n) => n !== f.name));
                        }}
                        aria-label="녹음 삭제"
                        className="p-1.5 text-text-dim hover:text-error rounded-lg hover:bg-error/10 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* 녹음 단계 하단 버튼 */}
          <div className="flex gap-3">
            <button
              onClick={() => setStep("info")}
              className="flex items-center gap-1.5 px-4 py-3 border border-border rounded-lg text-text-dim hover:border-border-hover hover:text-text-primary transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              이전
            </button>
            <button
              onClick={handleNext}
              disabled={isRecording}
              title={isRecording ? "녹음을 정지한 뒤 넘어갈 수 있습니다" : undefined}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-gold to-gold-bright text-navy font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {recordedNames.length > 0 ? "저장하고 자료 첨부" : "녹음 없이 자료 첨부"}
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: 자료 첨부 */}
      {step === "attach" && (
        <div className="max-w-2xl space-y-6">
          {/* 앞 단계에서 녹음한 결과 요약 */}
          {recordedNames.length > 0 && (
            <div className="flex items-center gap-3 px-4 py-3 bg-success/10 border border-success/20 rounded-xl">
              <Music className="w-4 h-4 text-success shrink-0" />
              <span className="text-sm text-text-primary">
                상담 녹음 {recordedNames.length}건이 저장되었습니다. 관련 서류를 함께 첨부하세요.
              </span>
            </div>
          )}

          {/* 파일 업로드 + 카메라 + 직접 입력 */}
          <div
            className={`bg-surface border rounded-2xl p-6 backdrop-blur-sm transition-colors ${
              isDragging ? "border-gold bg-gold/5" : "border-border"
            }`}
            {...dropZoneProps}
          >
            <h3 className="text-lg font-semibold text-text-primary mb-1">자료 첨부</h3>
            <p className="text-sm text-text-dim mb-4">계약서·내용증명·상대방 서면 등 사건 관련 서류를 넣어 주세요. 없으면 건너뛰어도 됩니다.</p>

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
                <label className="relative flex flex-col items-center gap-3 border-2 border-dashed border-border rounded-xl p-6 cursor-pointer hover:border-gold/30 transition-colors">
                  <Upload className="w-8 h-8 text-text-dim" />
                  <span className="text-sm text-text-dim text-center">파일 선택</span>
                  <span className="text-xs text-text-dim">오디오, 이미지, 문서 등</span>
                  <input type="file" multiple onChange={handleFileSelect} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                </label>

                {/* 폴더 업로드 */}
                <label className="relative flex flex-col items-center gap-3 border-2 border-dashed border-border rounded-xl p-6 cursor-pointer hover:border-gold/30 transition-colors">
                  <FolderOpen className="w-8 h-8 text-text-dim" />
                  <span className="text-sm text-text-dim text-center">폴더 선택</span>
                  <span className="text-xs text-text-dim">폴더 내 파일 일괄 첨부</span>
                  <input type="file" multiple onChange={handleFileSelect} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" {...({ webkitdirectory: "" } as React.InputHTMLAttributes<HTMLInputElement>)} />
                </label>

                {/* 카메라 촬영 */}
                <label className="relative flex flex-col items-center gap-3 border-2 border-dashed border-border rounded-xl p-6 cursor-pointer hover:border-gold/30 transition-colors">
                  <Camera className="w-8 h-8 text-text-dim" />
                  <span className="text-sm text-text-dim text-center">카메라 촬영</span>
                  <span className="text-xs text-text-dim">사진 직접 촬영</span>
                  <input type="file" accept="image/*" capture="environment" onChange={handleCameraCapture} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                </label>

              </div>
            )}

            {/* HWP/DOCX 변환 안내 */}
            {hwpWarning && (
              <div className="mt-3 flex items-start gap-2 bg-warning/8 border border-warning/20 rounded-lg px-4 py-3">
                <AlertCircle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-xs text-text-primary">{hwpWarning}</p>
                  <button onClick={() => setHwpWarning("")} className="text-xs text-gold mt-1 hover:underline">닫기</button>
                </div>
              </div>
            )}

            {/* 첨부된 파일 목록 */}
            {files.length > 0 && (
              <div className="mt-5 pt-5 border-t border-border space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-text-primary">
                    첨부 파일 ({files.length}개)
                  </h4>
                  <label className="relative flex items-center gap-1.5 text-xs text-gold cursor-pointer hover:text-gold-bright transition-colors">
                    <Plus className="w-3.5 h-3.5" />
                    추가
                    <input type="file" multiple onChange={handleFileSelect} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                  </label>
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

          {/* 하단 버튼 */}
          <div className="flex flex-col gap-3">
            {savingOnly && saveProgress && (
              <div className="flex items-center gap-2 px-4 py-3 bg-info/10 border border-info/20 rounded-lg">
                <Loader2 className="w-4 h-4 text-info animate-spin shrink-0" />
                <span className="text-sm text-info">{saveProgress}</span>
              </div>
            )}
            {saveError && !savingOnly && (
              <div className="flex items-center gap-2 px-4 py-3 bg-error/10 border border-error/20 rounded-lg">
                <AlertCircle className="w-4 h-4 text-error shrink-0" />
                <span className="text-sm text-error">{saveError}</span>
              </div>
            )}
            {files.length === 0 && !typedNotes.trim() && (
              <p className="text-sm text-text-dim">
                첨부할 서류가 없으면 아래에 상담 메모만 적어도 분석을 시작할 수 있습니다.
              </p>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setStep("record")}
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
                        <><Save className="w-4 h-4" /> 저장 (분석 없이)</>
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
