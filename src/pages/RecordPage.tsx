import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Mic, Upload, Square, ChevronRight } from "lucide-react";
import AppLayout from "../components/layout/AppLayout";
import useAuth from "../hooks/useAuth";
import useRecording from "../hooks/useRecording";
import { CASE_TYPES, DOC_TYPES } from "../config/constants";
import type { CaseType } from "../types/agent";
import type { DocType } from "../types/document";

type Step = "info" | "record" | "agents";

export default function RecordPage() {
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const { isRecording, duration, startRecording, stopRecording } = useRecording();

  const [step, setStep] = useState<Step>("info");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // 사건 정보
  const [clientName, setClientName] = useState("");
  const [caseType, setCaseType] = useState<CaseType>("민사");
  const [caseDesc, setCaseDesc] = useState("");
  const [docType, setDocType] = useState<DocType>("상담 요약 리포트");

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
    }
  };

  const handleRecord = useCallback(async () => {
    if (isRecording) {
      const blob = await stopRecording();
      if (blob) {
        const audioFile = new File([blob], `recording_${Date.now()}.webm`, { type: "audio/webm" });
        setFile(audioFile);
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
      if (!file || !user) return;
      setUploading(true);
      try {
        // 에이전트 페이지로 이동하면서 데이터 전달
        navigate("/record/agents", {
          state: {
            file,
            clientName,
            caseType,
            caseDesc,
            docType,
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
              <label className="block text-sm text-text-dim mb-1.5">사건 유형</label>
              <select
                value={caseType}
                onChange={(e) => setCaseType(e.target.value as CaseType)}
                className="w-full px-4 py-3 bg-navy-light border border-border rounded-lg text-text-primary focus:border-gold focus:outline-none transition-colors appearance-none"
              >
                {CASE_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
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

            <div>
              <label className="block text-sm text-text-dim mb-1.5">생성할 문서 유형</label>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value as DocType)}
                className="w-full px-4 py-3 bg-navy-light border border-border rounded-lg text-text-primary focus:border-gold focus:outline-none transition-colors appearance-none"
              >
                {DOC_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <button
              onClick={handleNext}
              disabled={!clientName || !caseDesc}
              className="w-full py-3 bg-gradient-to-r from-gold to-gold-bright text-navy font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              다음: 녹음/업로드
            </button>
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

          {/* 파일 업로드 */}
          <div className="bg-surface border border-border rounded-2xl p-6 backdrop-blur-sm">
            <h3 className="text-lg font-semibold text-text-primary mb-4">또는 파일 업로드</h3>
            <label className="flex flex-col items-center gap-3 border-2 border-dashed border-border rounded-xl p-8 cursor-pointer hover:border-gold/30 transition-colors">
              <Upload className="w-8 h-8 text-text-dim" />
              <span className="text-sm text-text-dim">
                {file ? file.name : "오디오 파일을 선택하세요 (MP3, WAV, M4A, WebM)"}
              </span>
              <input
                type="file"
                accept="audio/*"
                onChange={handleFileSelect}
                className="hidden"
              />
            </label>
          </div>

          {/* 선택된 파일 정보 */}
          {file && (
            <div className="bg-gold-dim border border-gold/20 rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-text-primary font-medium">{file.name}</p>
                <p className="text-sm text-text-dim">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
              </div>
              <button
                onClick={handleNext}
                disabled={uploading}
                className="px-6 py-2.5 bg-gradient-to-r from-gold to-gold-bright text-navy font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {uploading ? "업로드 중..." : "AI 분석 시작"}
              </button>
            </div>
          )}
        </div>
      )}
    </AppLayout>
  );
}
