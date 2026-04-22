import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Sparkles,
  Upload,
  X,
  Loader2,
  Music,
  FileText,
  Image as ImageIcon,
  Save,
  Copy,
  ChevronLeft,
  AlertCircle,
} from "lucide-react";
import AppLayout from "../components/layout/AppLayout";
import useAuth from "../hooks/useAuth";
import useDropZone from "../hooks/useDropZone";
import useCases from "../hooks/useCases";
import { callClaude } from "../services/claude";
import { buildFreeformPrompt } from "../services/prompts";
import { transcribeAndWait } from "../services/rtzr";
import { extractAllPdfTexts } from "../services/pdf";
import { isImageFile, extractAllImageTexts } from "../services/ocr";
import { extractAllExcelTexts } from "../services/excel";
import { extractAllPptxTexts } from "../services/pptx";
import { isDocxFile, extractDocxText } from "../services/docx";
import {
  isHwpxFile,
  isHwpFile,
  extractHwpxText,
  extractHwpText,
} from "../services/hwpx";
import { isExcelFile, isPptxFile } from "../utils/fileType";
import { uploadRecordingFile } from "../services/firebase/storage";
import {
  createDocument,
  createRecording,
  addTimelineEvent,
} from "../services/firebase/firestore";

type Phase = "input" | "processing" | "result";

function getFileIcon(file: File) {
  if (file.type.startsWith("audio/"))
    return <Music className="w-5 h-5 text-gold" />;
  if (file.type.startsWith("image/"))
    return <ImageIcon className="w-5 h-5 text-blue" />;
  return <FileText className="w-5 h-5 text-amber" />;
}

export default function FreeformPage() {
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const { addCase } = useCases();

  const [clientName, setClientName] = useState("");
  const [caseDesc, setCaseDesc] = useState("");
  const [instruction, setInstruction] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  const [phase, setPhase] = useState<Phase>("input");
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const { isDragging, dropZoneProps } = useDropZone(
    useCallback((dropped: File[]) => {
      setFiles((prev) => [...prev, ...dropped]);
    }, []),
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (selected && selected.length > 0) {
      setFiles((prev) => [...prev, ...Array.from(selected)]);
    }
    e.target.value = "";
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const extractAllFiles = async (): Promise<string> => {
    if (files.length === 0) return "";

    const audioFiles = files.filter(
      (f) =>
        f.type?.startsWith("audio/") ||
        !!f.name?.match(/\.(webm|wav|mp3|m4a|ogg|flac|aac)$/i),
    );
    const pdfFiles = files.filter(
      (f) => f.type === "application/pdf" || !!f.name?.match(/\.pdf$/i),
    );
    const imgFiles = files.filter((f) => isImageFile(f));
    const xlsxFiles = files.filter((f) => isExcelFile(f));
    const pptFiles = files.filter((f) => isPptxFile(f));
    const docxFiles = files.filter((f) => isDocxFile(f));
    const hwpxFiles = files.filter((f) => isHwpxFile(f));
    const hwpFiles = files.filter((f) => isHwpFile(f));

    const parts: string[] = [];

    if (pdfFiles.length > 0) {
      setProgress(`PDF ${pdfFiles.length}개 추출 중...`);
      const r = await extractAllPdfTexts(pdfFiles).catch(() => ({
        text: "",
        ocrTexts: [],
      }));
      if (r.text) parts.push(`[PDF 추출]\n${r.text}`);
    }
    if (imgFiles.length > 0) {
      setProgress(`이미지 ${imgFiles.length}개 OCR 중...`);
      const t = await extractAllImageTexts(imgFiles).catch(() => "");
      if (t) parts.push(`[이미지 OCR]\n${t}`);
    }
    if (xlsxFiles.length > 0) {
      setProgress(`Excel ${xlsxFiles.length}개 추출 중...`);
      const r = await extractAllExcelTexts(xlsxFiles).catch(() => ({
        text: "",
      }));
      if (r.text) parts.push(`[Excel]\n${r.text}`);
    }
    if (pptFiles.length > 0) {
      setProgress(`PPT ${pptFiles.length}개 추출 중...`);
      const r = await extractAllPptxTexts(pptFiles).catch(() => ({ text: "" }));
      if (r.text) parts.push(`[PPTX]\n${r.text}`);
    }
    if (docxFiles.length > 0) {
      setProgress(`DOCX ${docxFiles.length}개 추출 중...`);
      const texts = await Promise.all(
        docxFiles.map((f) => extractDocxText(f).catch(() => "")),
      );
      const combined = texts.filter(Boolean).join("\n\n---\n\n");
      if (combined) parts.push(`[DOCX]\n${combined}`);
    }
    if (hwpxFiles.length > 0) {
      setProgress(`HWPX ${hwpxFiles.length}개 추출 중...`);
      const texts = await Promise.all(
        hwpxFiles.map((f) => extractHwpxText(f).catch(() => "")),
      );
      const combined = texts.filter(Boolean).join("\n\n---\n\n");
      if (combined) parts.push(`[HWPX]\n${combined}`);
    }
    if (hwpFiles.length > 0) {
      setProgress(`HWP ${hwpFiles.length}개 추출 중...`);
      const texts = await Promise.all(
        hwpFiles.map((f) => extractHwpText(f).catch(() => "")),
      );
      const combined = texts.filter(Boolean).join("\n\n---\n\n");
      if (combined) parts.push(`[HWP]\n${combined}`);
    }
    if (audioFiles.length > 0) {
      for (const af of audioFiles) {
        setProgress(`"${af.name}" 음성 변환 중...`);
        try {
          const t = await transcribeAndWait(af);
          if (t) parts.push(`[오디오 ${af.name}]\n${t}`);
        } catch (err) {
          console.error("STT 실패:", err);
        }
      }
    }

    return parts.join("\n\n===\n\n");
  };

  const handleSubmit = async () => {
    if (!user || !clientName.trim() || !instruction.trim()) return;

    setPhase("processing");
    setError(null);
    setResult("");

    try {
      const extracted = await extractAllFiles();

      setProgress("AI가 작성하고 있어요...");
      const system = buildFreeformPrompt({
        clientName: clientName.trim(),
        firmName: user.firmName,
        lawyerName: user.name,
        caseDesc: caseDesc.trim() || undefined,
      });
      const userMsg = `[변호사 지시]\n${instruction.trim()}${
        extracted ? `\n\n[첨부 자료]\n${extracted}` : ""
      }`;

      const output = await callClaude(system, userMsg);
      setResult(output);
      setPhase("result");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "처리 중 오류가 발생했습니다.";
      setError(msg);
      setPhase("input");
    }
  };

  const handleSave = async () => {
    if (!user || !result || saved) return;
    setSaving(true);
    setError(null);

    try {
      const caseId = await addCase({
        clientName: clientName.trim(),
        caseType: "기타",
        description: caseDesc.trim() || instruction.trim().slice(0, 200),
      });

      let recordingId = "";
      for (const f of files) {
        try {
          const isAudio =
            f.type?.startsWith("audio/") ||
            !!f.name?.match(/\.(webm|wav|mp3|m4a|ogg|flac|aac)$/i);
          const url = await uploadRecordingFile(f, user.uid, caseId);
          const rid = await createRecording({
            caseId,
            ownerId: user.uid,
            fileName: f.name,
            fileUrl: url,
            fileSizeMB: parseFloat((f.size / (1024 * 1024)).toFixed(2)),
            durationSeconds: 0,
            sttStatus: isAudio ? "pending" : "completed",
          });
          if (!recordingId) recordingId = rid;
        } catch (uploadErr) {
          console.error("첨부 업로드 실패:", uploadErr);
        }
      }

      await createDocument({
        caseId,
        recordingId: recordingId || "",
        ownerId: user.uid,
        docType: "자유지시",
        agentResults: {
          precedent: "",
          legal: "",
          rag_precedent: "",
          analysis: "",
          docgen: result,
          review: "",
        },
        checkQuestions: [],
        answeredChecks: {},
        finalDocument: result,
        status: "completed",
      });

      await addTimelineEvent(caseId, {
        type: "doc",
        label: "자유 지시 결과 생성",
        detail: instruction.trim().slice(0, 120),
      }).catch(console.error);

      setSaved(true);
      setTimeout(() => navigate(`/cases/${caseId}`), 800);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "저장 중 오류가 발생했습니다.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("복사 실패:", err);
    }
  };

  return (
    <AppLayout title="자유 지시" subtitle="양식 없이 AI에게 직접 시키기">
      <div className="max-w-3xl mx-auto">
        {phase === "input" && (
          <div className="space-y-5">
            <div className="bg-gradient-to-br from-gold/15 to-surface border border-gold/30 rounded-2xl p-5">
              <div className="flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-gold shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-text-primary mb-1">
                    자유 지시로 빠르게 생성
                  </h3>
                  <p className="text-sm text-text-dim leading-relaxed">
                    정해진 양식 없이 AI에게 직접 시키세요. 체크포인트·판례 검색
                    없이 20~30초 안에 결과를 받습니다. 첨부 자료(녹음, PDF,
                    이미지 등)도 함께 인식합니다.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-surface border border-border rounded-2xl p-6 space-y-5">
              <div>
                <label className="block text-sm text-text-dim mb-1.5">
                  의뢰인 이름 <span className="text-error">*</span>
                </label>
                <input
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="의뢰인 성명"
                  className="w-full px-4 py-3 bg-navy-light border border-border rounded-lg text-text-primary focus:border-gold focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm text-text-dim mb-1.5">
                  사건 개요 (선택)
                </label>
                <input
                  value={caseDesc}
                  onChange={(e) => setCaseDesc(e.target.value)}
                  placeholder="한 줄 요약. 예: 전세보증금 미반환 분쟁"
                  className="w-full px-4 py-3 bg-navy-light border border-border rounded-lg text-text-primary focus:border-gold focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm text-text-dim mb-1.5">
                  AI에게 시킬 지시 <span className="text-error">*</span>
                </label>
                <textarea
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  rows={6}
                  placeholder={
                    "예시:\n• 상담 녹음을 3문단 메모로 정리해줘\n• 의뢰인에게 보낼 친절한 답변 초안 작성\n• 첨부한 계약서에서 불리한 조항 정리"
                  }
                  className="w-full px-4 py-3 bg-navy-light border border-border rounded-lg text-text-primary placeholder:text-text-dim/50 focus:border-gold focus:outline-none resize-y transition-colors"
                />
              </div>

              <div
                className={`border-2 border-dashed rounded-xl p-6 transition-colors ${
                  isDragging ? "border-gold bg-gold/5" : "border-border"
                }`}
                {...dropZoneProps}
              >
                <label className="flex flex-col items-center gap-2 cursor-pointer">
                  <Upload className="w-8 h-8 text-text-dim" />
                  <span className="text-sm text-text-dim text-center">
                    파일 선택 또는 드래그
                  </span>
                  <span className="text-xs text-text-dim/60">
                    오디오, PDF, 이미지, DOCX, HWPX, Excel, PPT 등
                  </span>
                  <input
                    type="file"
                    multiple
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </label>

                {files.length > 0 && (
                  <div className="mt-4 space-y-2 pt-4 border-t border-border">
                    {files.map((f, i) => (
                      <div
                        key={`${f.name}-${i}`}
                        className="flex items-center gap-3 bg-navy-light rounded-lg px-3 py-2"
                      >
                        {getFileIcon(f)}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-text-primary truncate">
                            {f.name}
                          </p>
                          <p className="text-xs text-text-dim">
                            {(f.size / 1024 / 1024).toFixed(1)} MB
                          </p>
                        </div>
                        <button
                          onClick={() => removeFile(i)}
                          className="p-1 text-text-dim hover:text-error rounded hover:bg-error/10 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {error && (
                <div className="flex items-start gap-2 px-4 py-3 bg-error/10 border border-error/20 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-error shrink-0 mt-0.5" />
                  <span className="text-sm text-error">{error}</span>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => navigate("/dashboard")}
                  className="flex items-center gap-1.5 px-4 py-3 border border-border rounded-lg text-text-dim hover:border-border-hover hover:text-text-primary transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  뒤로
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!clientName.trim() || !instruction.trim()}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-gold to-gold-bright text-navy font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Sparkles className="w-4 h-4" />
                  AI에게 시키기
                </button>
              </div>
            </div>
          </div>
        )}

        {phase === "processing" && (
          <div className="bg-surface border border-border rounded-2xl p-12 text-center">
            <Loader2 className="w-10 h-10 text-gold animate-spin mx-auto mb-4" />
            <p className="text-text-primary font-medium mb-1">작업 중...</p>
            <p className="text-sm text-text-dim">
              {progress || "잠시만 기다려 주세요"}
            </p>
          </div>
        )}

        {phase === "result" && (
          <div className="space-y-4">
            <div className="bg-surface border border-border rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-text-primary flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-gold" />
                  AI 작성 결과
                </h3>
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-text-dim border border-border rounded-lg hover:border-border-hover transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {copied ? "복사됨" : "복사"}
                </button>
              </div>
              <div className="whitespace-pre-wrap text-sm text-text-primary leading-relaxed">
                {result}
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 px-4 py-3 bg-error/10 border border-error/20 rounded-lg">
                <AlertCircle className="w-4 h-4 text-error shrink-0 mt-0.5" />
                <span className="text-sm text-error">{error}</span>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setPhase("input");
                  setResult("");
                  setError(null);
                }}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-3 border border-border rounded-lg text-text-dim hover:border-border-hover hover:text-text-primary transition-colors disabled:opacity-50"
              >
                <ChevronLeft className="w-4 h-4" />
                다시 시도
              </button>
              <button
                onClick={handleSave}
                disabled={saving || saved}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-gold to-gold-bright text-navy font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> 저장 중...
                  </>
                ) : saved ? (
                  "저장됨 · 이동 중..."
                ) : (
                  <>
                    <Save className="w-4 h-4" /> 사건으로 저장
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
