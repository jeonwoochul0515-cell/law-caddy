import { useState, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Mic, Upload, Square, ChevronRight, ChevronLeft, Camera, FileText, Image, Music, Film, X, Plus, Type } from "lucide-react";
import AppLayout from "../components/layout/AppLayout";
import useAuth from "../hooks/useAuth";
import useRecording from "../hooks/useRecording";



type Step = "info" | "record" | "agents";

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
  } | null;

  const [step, setStep] = useState<Step>("info");
  const [files, setFiles] = useState<File[]>([]);
  const [typedNotes, setTypedNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // 사건 정보 (프리필 값으로 초기화)
  const [clientName, setClientName] = useState(prefilled?.clientName ?? "");
  const [caseDesc, setCaseDesc] = useState(prefilled?.caseDesc ?? "");

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
      if (!clientName || !caseDesc) return;
      setStep("record");
    } else if (step === "record") {
      if ((files.length === 0 && !typedNotes.trim()) || !user) return;
      setUploading(true);
      try {
        // 에이전트 페이지로 이동하면서 데이터 전달
        navigate("/record/agents", {
          state: {
            files,
            typedNotes: typedNotes.trim(),
            clientName,
            caseDesc,
            caseId: prefilled?.caseId,
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

  return (
    <AppLayout title="새 상담" subtitle="녹음 또는 파일 업로드">
      {/* 단계 표시 */}
      <div className="flex items-center gap-3 mb-8">
        {(["info", "record", "agents"] as const).map((s, i) => (
          <div key={s} className="flex items-center gap-3">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step === s
                  ? "bg-gold text-navy"
                  : i < (["info", "record", "agents"] as const).indexOf(step)
                    ? "bg-gold-dim text-gold"
                    : "bg-surface text-text-dim border border-border"
              }`}
            >
              {i + 1}
            </div>
            <span className={`text-sm hidden sm:inline ${step === s ? "text-text-primary" : "text-text-dim"}`}>
              {s === "info" ? "사건 정보" : s === "record" ? "녹음/업로드" : "AI 분석"}
            </span>
            {i < 2 && <ChevronRight className="w-4 h-4 text-text-dim" />}
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

            <div>
              <label className="block text-sm text-text-dim mb-1.5">사건 개요</label>
              <textarea
                value={caseDesc}
                onChange={(e) => setCaseDesc(e.target.value)}
                rows={4}
                className="w-full px-4 py-3 bg-navy-light border border-border rounded-lg text-text-primary focus:border-gold focus:outline-none transition-colors resize-y"
                placeholder="사건의 주요 내용을 간략히 입력해주세요"
              />
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
                disabled={!clientName || !caseDesc}
                className="flex-1 py-3 bg-gradient-to-r from-gold to-gold-bright text-navy font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                다음: 녹음/업로드
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
          <div className="bg-surface border border-border rounded-2xl p-6 backdrop-blur-sm">
            <h3 className="text-lg font-semibold text-text-primary mb-4">자료 첨부</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* 파일 선택 */}
              <label className="flex flex-col items-center gap-3 border-2 border-dashed border-border rounded-xl p-6 cursor-pointer hover:border-gold/30 transition-colors">
                <Upload className="w-8 h-8 text-text-dim" />
                <span className="text-sm text-text-dim text-center">
                  파일 선택
                </span>
                <span className="text-xs text-text-dim">
                  오디오, 이미지, 문서 등
                </span>
                <input
                  type="file"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </label>

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
                <label className="flex items-center gap-1.5 text-xs text-gold cursor-pointer hover:text-gold-bright transition-colors">
                  <Plus className="w-3.5 h-3.5" />
                  추가
                  <input
                    type="file"
                    multiple
                    onChange={handleFileSelect}
                    className="hidden"
                  />
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

          {/* 하단 버튼 */}
          <div className="flex gap-3">
            <button
              onClick={() => setStep("info")}
              className="flex items-center gap-1.5 px-4 py-3 border border-border rounded-lg text-text-dim hover:border-border-hover hover:text-text-primary transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              이전
            </button>
            {(files.length > 0 || typedNotes.trim()) && (
              <button
                onClick={handleNext}
                disabled={uploading}
                className="flex-1 py-3 bg-gradient-to-r from-gold to-gold-bright text-navy font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {uploading ? "업로드 중..." : "AI 분석 시작"}
              </button>
            )}
          </div>
        </div>
      )}
    </AppLayout>
  );
}
