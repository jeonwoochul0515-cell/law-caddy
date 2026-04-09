import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CheckCircle2, Loader2, AlertCircle, ChevronRight, ChevronLeft, Sparkles, FileText, AlertTriangle } from "lucide-react";
import AppLayout from "../components/layout/AppLayout";
import useAgents from "../hooks/useAgents";
import useCases from "../hooks/useCases";
import { AGENTS, DOC_TYPES } from "../config/constants";
import { createDocument, addTimelineEvent, createRecording } from "../services/firebase/firestore";
import { uploadRecordingFile } from "../services/firebase/storage";
import { transcribeAndWait } from "../services/rtzr";
import { callClaude } from "../services/claude";
import { buildCaseDescriptionPrompt } from "../services/prompts";
import { extractAllPdfTexts } from "../services/pdf";
import { isImageFile, extractAllImageTexts } from "../services/ocr";
import { extractAllExcelTexts } from "../services/excel";
import { extractAllPptxTexts } from "../services/pptx";
import { isDocxFile, extractDocxText } from "../services/docx";
import { isHwpxFile, isHwpFile, extractHwpxText, extractHwpText } from "../services/hwpx";
import { isExcelFile, isPptxFile } from "../utils/fileType";
import { saveExtractedText } from "../services/file-save";
import type { AgentId, CaseType, DocType } from "../types/agent";

const CASE_TYPE_COLORS: Record<string, string> = {
  "민사": "bg-info/15 text-info border-info/30",
  "형사": "bg-error/15 text-error border-error/30",
  "가사": "bg-success/15 text-success border-success/30",
  "행정": "bg-amber/15 text-amber border-amber/30",
  "노동": "bg-blue/15 text-blue border-blue/30",
  "부동산": "bg-gold/15 text-gold border-gold/30",
  "채권·채무": "bg-info/15 text-info border-info/30",
  "손해배상": "bg-error/15 text-error border-error/30",
  "기타": "bg-surface text-text-dim border-border",
};

const SESSION_KEY = "law-caddy-agents-state";

interface AgentsState {
  typedNotes?: string;
  clientName: string;
  caseDesc: string;
  caseId?: string;
  previousTranscripts?: string;
  ownerId: string;
  firmName: string;
  lawyerName: string;
}

export default function AgentsPage() {
  const location = useLocation();
  const navigate = useNavigate();

  // location.state 우선, 없으면 sessionStorage에서 복원
  const rawState = location.state as (AgentsState & { files?: File[] }) | null;
  const state: AgentsState | null = (() => {
    if (rawState) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { files: _files, ...serializable } = rawState;
      try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(serializable)); } catch { /* quota */ }
      return rawState;
    }
    try {
      const saved = sessionStorage.getItem(SESSION_KEY);
      return saved ? JSON.parse(saved) as AgentsState : null;
    } catch { return null; }
  })();

  const { agents, isRunning, classifiedCaseType, isClassifying, runAllAgents, restoreFromCache } = useAgents();
  const { addCase } = useCases();
  const [activeTab, setActiveTab] = useState<AgentId>("precedent");
  const [started, setStarted] = useState(false);
  const [restoredFromCache, setRestoredFromCache] = useState(false);
  const [selectedDocType, setSelectedDocType] = useState<DocType | null>(null);
  const [isCreatingCase, setIsCreatingCase] = useState(false);
  const [createdCaseId, setCreatedCaseId] = useState<string | null>(state?.caseId ?? null);
  const [caseError, setCaseError] = useState<string | null>(null);
  const [prepStatus, setPrepStatus] = useState<string>("");
  const hasExistingCase = Boolean(state?.caseId);

  useEffect(() => {
    if (!state || started) return;

    // 이전 분석 결과가 캐시에 있으면 복원 (다시 분석하지 않음)
    if (!rawState?.files?.length && restoreFromCache(state.clientName)) {
      setStarted(true);
      setRestoredFromCache(true);
      return;
    }

    setStarted(true);

    const fullDesc = state.typedNotes
      ? `${state.caseDesc}\n\n[추가 자료]\n${state.typedNotes}`
      : state.caseDesc;

    // 파일 분류: 오디오 / PDF
    const allFiles = rawState?.files ?? [];
    const audioFiles = allFiles.filter((f: File) => {
      const isAudio = f.type?.startsWith("audio/") || f.name?.match(/\.(webm|wav|mp3|m4a|ogg|flac|aac)$/i);
      return isAudio;
    });
    const pdfFiles = allFiles.filter((f: File) =>
      f.type === "application/pdf" || f.name?.match(/\.pdf$/i),
    );
    const imageFiles = allFiles.filter((f: File) => isImageFile(f));
    const excelFiles = allFiles.filter((f: File) => isExcelFile(f));
    const pptxFiles = allFiles.filter((f: File) => isPptxFile(f));
    const docxFiles = allFiles.filter((f: File) => isDocxFile(f));
    const hwpxFiles = allFiles.filter((f: File) => isHwpxFile(f));
    const hwpFiles = allFiles.filter((f: File) => isHwpFile(f));

    // PDF 텍스트 추출 + 이미지 OCR + Excel/PPT 추출 + STT 요청을 병렬로 진행
    const startAgents = async () => {
      // 상태 메시지 구성
      const statusParts: string[] = [];
      if (pdfFiles.length > 0) statusParts.push(`PDF ${pdfFiles.length}개 추출`);
      if (imageFiles.length > 0) statusParts.push(`이미지 ${imageFiles.length}개 OCR`);
      if (excelFiles.length > 0) statusParts.push(`Excel ${excelFiles.length}개 추출`);
      if (pptxFiles.length > 0) statusParts.push(`PPT ${pptxFiles.length}개 추출`);
      if (docxFiles.length > 0) statusParts.push(`DOCX ${docxFiles.length}개 추출`);
      if (hwpxFiles.length > 0) statusParts.push(`HWPX ${hwpxFiles.length}개 추출`);
      if (hwpFiles.length > 0) statusParts.push(`HWP ${hwpFiles.length}개 추출`);
      if (statusParts.length > 0) setPrepStatus(statusParts.join(" / ") + " 중...");

      const [pdfResult, imageContents, excelResult, pptxResult, docxResult, hwpxResult, hwpResult] = await Promise.all([
        pdfFiles.length > 0
          ? extractAllPdfTexts(pdfFiles).catch((err) => {
              console.error("[AgentsPage] PDF 텍스트 추출 실패:", err);
              return { text: "", ocrTexts: [] };
            })
          : Promise.resolve({ text: "", ocrTexts: [] }),
        imageFiles.length > 0
          ? extractAllImageTexts(imageFiles).catch((err) => {
              console.error("[AgentsPage] 이미지 OCR 실패:", err);
              return "";
            })
          : Promise.resolve(""),
        excelFiles.length > 0
          ? extractAllExcelTexts(excelFiles).catch((err) => {
              console.error("[AgentsPage] Excel 텍스트 추출 실패:", err);
              return { text: "" };
            })
          : Promise.resolve({ text: "" }),
        pptxFiles.length > 0
          ? extractAllPptxTexts(pptxFiles).catch((err) => {
              console.error("[AgentsPage] PPTX 텍스트 추출 실패:", err);
              return { text: "" };
            })
          : Promise.resolve({ text: "" }),
        // DOCX 텍스트 추출
        docxFiles.length > 0
          ? Promise.all(docxFiles.map((f) => extractDocxText(f).catch(() => ""))).then((texts) => texts.filter(Boolean).join("\n\n---\n\n")).catch(() => "")
          : Promise.resolve(""),
        // HWPX 텍스트 추출
        hwpxFiles.length > 0
          ? Promise.all(hwpxFiles.map((f) => extractHwpxText(f).catch(() => ""))).then((texts) => texts.filter(Boolean).join("\n\n---\n\n")).catch(() => "")
          : Promise.resolve(""),
        // HWP 바이너리 텍스트 추출
        hwpFiles.length > 0
          ? Promise.all(hwpFiles.map((f) => extractHwpText(f).catch(() => ""))).then((texts) => texts.filter(Boolean).join("\n\n---\n\n")).catch(() => "")
          : Promise.resolve(""),
      ]);

      const pdfContents = pdfResult.text;

      // PDF + 이미지 OCR + Excel + PPTX + DOCX + HWPX + HWP 결과 합산
      const allExtractions = [pdfContents, imageContents, excelResult.text, pptxResult.text, docxResult, hwpxResult, hwpResult].filter(Boolean);
      const fileContents = allExtractions.join("\n\n---\n\n");

      // OCR로 추출한 파일만 텍스트로 저장 (텍스트 레이어 추출은 저장 안 함)
      const ocrSaveTargets = [
        ...pdfResult.ocrTexts,
        ...(imageContents ? [{ fileName: "이미지_OCR", text: imageContents }] : []),
      ];
      if (ocrSaveTargets.length > 0) {
        setPrepStatus("OCR 텍스트 저장 중...");
        const ocrCombined = ocrSaveTargets
          .map((t) => `[${t.fileName}]\n${t.text}`)
          .join("\n\n---\n\n");
        saveExtractedText(ocrCombined, state.clientName, state.caseId).catch((err) =>
          console.warn("[AgentsPage] OCR 텍스트 저장 실패:", err),
        );
      }

      setPrepStatus("에이전트 분석 시작...");

      const baseContext = {
        clientName: state.clientName,
        caseDesc: fullDesc,
        transcript: "",
        previousTranscripts: state.previousTranscripts ?? "",
        ...(fileContents ? { fileContents } : {}),
      };

      // 오디오 파일이 있으면 사전 처리: STT 완료 대기
      let transcript: string | undefined;
      if (audioFiles.length > 0) {
        try {
          setPrepStatus("음성 파일 변환 중...");
          transcript = (await transcribeAndWait(audioFiles[0])) ?? undefined;
        } catch (err) {
          console.error("[AgentsPage] STT 변환 실패:", err);
        }
      }

      // 에이전트 실행 시 transcript 포함
      runAllAgents({ ...baseContext, transcript });
    };

    startAgents();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, started, runAllAgents]);

  const [isNavigating, setIsNavigating] = useState(false);
  const [generatedDesc, setGeneratedDesc] = useState<string | null>(null);

  const completedCount = Object.values(agents).filter((a) => a.status === "completed").length;
  const allCompleted = completedCount === 6 && !isRunning;

  // 에이전트 완료 후 사건 개요가 없으면 AI로 자동 생성
  useEffect(() => {
    if (!allCompleted || !state || generatedDesc !== null) return;
    // 캐시에서 복원된 경우 + 이미 사건이 있으면 AI 호출 불필요
    if (restoredFromCache && hasExistingCase) {
      setGeneratedDesc(state.caseDesc || `${state.clientName} 사건`);
      return;
    }
    if (state.caseDesc && state.caseDesc.trim().length > 10) {
      setGeneratedDesc(state.caseDesc);
      return;
    }
    const analysisResult = agents.analysis?.result ?? "";
    const prompt = buildCaseDescriptionPrompt(
      state.clientName,
      analysisResult,
      "",
      state.typedNotes ?? "",
    );
    callClaude(prompt, "사건 개요를 요약해 주세요.")
      .then((desc) => setGeneratedDesc(desc.trim()))
      .catch(() => setGeneratedDesc(state.caseDesc || `${state.clientName} 사건`));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allCompleted, state, agents, generatedDesc]);

  // 에이전트 완료 + 사건 개요 준비 → 자동으로 사건 파일 생성
  useEffect(() => {
    if (!allCompleted || !classifiedCaseType || !generatedDesc) return;
    if (hasExistingCase || createdCaseId || isCreatingCase) return;
    handleCreateCase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allCompleted, classifiedCaseType, generatedDesc, hasExistingCase, createdCaseId, isCreatingCase]);

  const handleCreateCase = async () => {
    if (!state || !classifiedCaseType || isCreatingCase || createdCaseId) return;
    setIsCreatingCase(true);
    setCaseError(null);

    try {
      const caseId = await addCase({
        clientName: state.clientName,
        caseType: classifiedCaseType as CaseType,
        description: generatedDesc || state.caseDesc || "",
      });
      setCreatedCaseId(caseId);

      // 파일이 있으면 Storage 업로드 + recordings 컬렉션 생성
      const files = rawState?.files;
      if (files && files.length > 0) {
        for (const file of files) {
          try {
            const isAudio = file.type?.startsWith("audio/") || !!file.name?.match(/\.(webm|wav|mp3|m4a|ogg|flac|aac)$/i);
            const fileUrl = await uploadRecordingFile(file, state.ownerId, caseId);
            await createRecording({
              caseId,
              ownerId: state.ownerId,
              fileName: file.name,
              fileUrl,
              fileSizeMB: parseFloat((file.size / (1024 * 1024)).toFixed(2)),
              durationSeconds: 0,
              sttStatus: isAudio ? "pending" : "completed",
            });
          } catch (uploadErr) {
            console.error("파일 업로드 실패:", uploadErr);
          }
        }
      }

      // 타임라인에 상담 기록 추가
      await addTimelineEvent(caseId, {
        type: "consult",
        label: "상담 접수",
        detail: `의뢰인 ${state.clientName}의 상담이 접수되었습니다.`,
      }).catch(console.error);
    } catch (err: unknown) {
      setCaseError(err instanceof Error ? err.message : "사건 파일 생성 중 오류가 발생했습니다.");
    } finally {
      setIsCreatingCase(false);
    }
  };

  if (!state) {
    return (
      <AppLayout title="AI 분석" subtitle="에이전트 실행">
        <div className="text-center py-16">
          <p className="text-text-dim mb-4">사건 정보가 없습니다.</p>
          <button
            onClick={() => navigate("/record")}
            className="px-4 py-2 bg-gold-dim text-gold rounded-lg hover:bg-gold/20 transition-colors"
          >
            새 상담 시작
          </button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="AI 분석" subtitle={state.clientName}>
      {/* 이전 단계 */}
      <button
        onClick={() => navigate("/record")}
        className="flex items-center gap-1.5 mb-4 text-sm text-text-dim hover:text-text-primary transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        이전 단계
      </button>

      {/* AI 분류 사건 유형 뱃지 */}
      <div className="mb-4 flex items-center gap-2">
        {isClassifying && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-surface text-text-dim border border-border animate-pulse">
            <Sparkles className="w-3 h-3" />
            사건 유형 분석 중...
          </span>
        )}
        {classifiedCaseType && (
          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${CASE_TYPE_COLORS[classifiedCaseType] ?? CASE_TYPE_COLORS["기타"]}`}>
            <Sparkles className="w-3 h-3" />
            AI 분류: {classifiedCaseType}
          </span>
        )}
      </div>

      {/* 진행률 */}
      <div className="mb-6" aria-live="polite" aria-atomic="true">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-text-dim">분석 진행률</span>
          <span className="text-sm text-gold font-medium" aria-label={`6개 중 ${completedCount}개 완료`}>{completedCount}/6</span>
        </div>
        <div className="h-2 bg-surface rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-gold to-gold-bright rounded-full transition-all duration-500"
            style={{ width: `${(completedCount / 6) * 100}%` }}
          />
        </div>
      </div>

      {/* 에이전트 상태 그리드 */}
      <div role="tablist" aria-label="에이전트 결과 탭" className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {AGENTS.map((agent) => {
          const agentState = agents[agent.id];
          const isActive = activeTab === agent.id;
          return (
            <button
              key={agent.id}
              role="tab"
              aria-selected={isActive}
              aria-label={`${agent.name} ${agentState?.status === "completed" ? "완료" : agentState?.status === "running" ? "진행 중" : agentState?.status === "error" ? "오류" : "대기"}`}
              onClick={() => setActiveTab(agent.id)}
              className={`p-3 rounded-xl border text-left transition-all ${
                isActive
                  ? "bg-gold-dim border-gold/30"
                  : "bg-surface border-border hover:border-border-hover"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-lg">{agent.icon}</span>
                {agentState?.status === "running" && (
                  <Loader2 className="w-4 h-4 text-gold animate-spin" />
                )}
                {agentState?.status === "completed" && (
                  <CheckCircle2 className="w-4 h-4 text-success" />
                )}
                {agentState?.status === "error" && (
                  <AlertCircle className="w-4 h-4 text-error" />
                )}
              </div>
              <p className="text-xs font-medium text-text-primary">{agent.nickname} <span className="text-text-dim">· {agent.name}</span></p>
              {!agentState?.status && prepStatus && (
                <p className="text-[10px] text-gold mt-1 truncate">{prepStatus}</p>
              )}
            </button>
          );
        })}
      </div>

      {/* 결과 탭 */}
      <div role="tabpanel" aria-label={`${AGENTS.find((a) => a.id === activeTab)?.name} 결과`} className="bg-surface border border-border rounded-2xl backdrop-blur-sm">
        <div className="p-5 border-b border-border">
          <h3 className="font-semibold text-text-primary">
            {AGENTS.find((a) => a.id === activeTab)?.icon}{" "}
            {AGENTS.find((a) => a.id === activeTab)?.name} 결과
          </h3>
        </div>
        <div className="p-5">
          {agents[activeTab]?.status === "running" ? (
            <div className="flex items-center gap-3 py-8 justify-center text-text-dim">
              <Loader2 className="w-5 h-5 animate-spin" />
              분석 중...
            </div>
          ) : agents[activeTab]?.status === "completed" ? (
            <div>
              {(activeTab === "precedent" || activeTab === "analysis") && (
                <div className="flex items-start gap-2 mb-3 bg-amber/5 border border-amber/20 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber shrink-0 mt-0.5" />
                  <p className="text-[11px] text-text-dim">
                    AI가 생성한 판례·법조문은 실제와 다를 수 있습니다. [확인 필요] 표시 부분을 포함하여 반드시 검증하세요.
                  </p>
                </div>
              )}
              {activeTab === "docgen" ? (
                <DocgenResultView result={agents[activeTab].result} />
              ) : (
                <div className="prose max-w-none whitespace-pre-wrap text-sm text-text-primary leading-relaxed">
                  {agents[activeTab].result}
                </div>
              )}
            </div>
          ) : agents[activeTab]?.status === "error" ? (
            <div className="text-error text-sm py-4">
              오류: {agents[activeTab].error ?? "알 수 없는 오류"}
            </div>
          ) : (
            <div className="text-text-dim text-sm py-8 text-center flex flex-col items-center gap-2">
              {prepStatus ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-gold" />
                  <span>{prepStatus}</span>
                </>
              ) : (
                "대기 중..."
              )}
            </div>
          )}
        </div>
      </div>

      {/* 사건 파일 자동 생성 상태 */}
      {allCompleted && !hasExistingCase && (
        <div className="mt-6">
          {isCreatingCase && (
            <div className="flex items-center gap-2 text-text-dim text-sm bg-surface border border-border rounded-2xl p-4">
              <Loader2 className="w-4 h-4 animate-spin text-gold" />
              사건 파일 생성 중...
            </div>
          )}
          {caseError && (
            <div className="flex items-center gap-2 text-error text-sm bg-surface border border-error/20 rounded-2xl p-4">
              <AlertCircle className="w-4 h-4" />
              {caseError}
              <button
                onClick={handleCreateCase}
                className="ml-auto text-gold hover:underline text-xs"
              >
                다시 시도
              </button>
            </div>
          )}
          {createdCaseId && (
            <div className="flex items-center justify-between bg-surface border border-success/20 rounded-2xl p-4">
              <div className="flex items-center gap-2 text-success text-sm">
                <CheckCircle2 className="w-4 h-4" />
                사건 파일이 자동 생성되었습니다.
              </div>
              <button
                onClick={() => navigate(`/cases/${createdCaseId}`)}
                className="flex items-center gap-1 text-gold text-sm hover:underline"
              >
                사건 파일 보기
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* 다음 단계: 문서 유형 선택 */}
      {allCompleted && classifiedCaseType && (
        <div className="mt-6 bg-surface border border-border rounded-2xl p-5 backdrop-blur-sm space-y-4">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-gold" />
            <h3 className="font-semibold text-text-primary">생성할 문서 유형</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {DOC_TYPES.map((dt) => (
              <button
                key={dt}
                onClick={() => setSelectedDocType(dt)}
                className={`px-3 py-2.5 rounded-lg text-sm font-medium border transition-all text-left ${
                  selectedDocType === dt
                    ? "bg-gold-dim border-gold/30 text-gold"
                    : "bg-navy-light border-border text-text-dim hover:border-border-hover hover:text-text-primary"
                }`}
              >
                {dt}
              </button>
            ))}
          </div>
          <div className="flex justify-end pt-1">
            <button
              disabled={!selectedDocType || isNavigating}
              onClick={async () => {
                if (!selectedDocType || !createdCaseId) return;
                setIsNavigating(true);

                const agentResults = Object.fromEntries(
                  Object.entries(agents).map(([k, v]) => [k, v.result])
                ) as Record<string, string>;

                try {
                  // Firestore documents 컬렉션에 에이전트 결과 저장
                  const docId = await createDocument({
                    caseId: createdCaseId,
                    recordingId: "",
                    ownerId: state.ownerId,
                    docType: selectedDocType,
                    agentResults: {
                      precedent: agentResults.precedent ?? "",
                      legal: agentResults.legal ?? "",
                      rag_precedent: agentResults.rag_precedent ?? "",
                      analysis: agentResults.analysis ?? "",
                      docgen: agentResults.docgen ?? "",
                      review: agentResults.review ?? "",
                    },
                    checkQuestions: [],
                    answeredChecks: {},
                    finalDocument: "",
                    status: "checkpoint",
                  });
                  // 타임라인 이벤트 추가
                  await addTimelineEvent(createdCaseId, {
                    type: "doc",
                    label: "AI 에이전트 분석 완료",
                    detail: `6개 에이전트 분석 완료. ${selectedDocType} 문서 유형 선택.`,
                  }).catch(console.error);

                  navigate("/record/checkpoint", {
                    state: {
                      ...state,
                      caseId: createdCaseId,
                      documentId: docId,
                      caseType: classifiedCaseType ?? "기타",
                      docType: selectedDocType,
                      agentResults,
                    },
                  });
                } catch (err) {
                  console.error("문서 저장 실패:", err);
                  setCaseError(err instanceof Error ? err.message : "문서 저장 중 오류가 발생했습니다.");
                  setIsNavigating(false);
                }
              }}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-gold to-gold-bright text-navy font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isNavigating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  저장 중...
                </>
              ) : (
                <>
                  체크포인트 확인
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </AppLayout>
  );
}

/** 문서 작성 에이전트 결과를 체크포인트 질문 형태로 렌더링 */
function DocgenResultView({ result }: { result: string }) {
  const categoryColors: Record<string, string> = {
    "증거확보": "bg-error/15 text-error",
    "사실관계": "bg-info/15 text-info",
    "법리검토": "bg-gold-dim text-gold",
    "전략수립": "bg-success/15 text-success",
    "절차확인": "bg-warning/15 text-warning",
  };

  let questions: Array<{
    id: number;
    question: string;
    why: string;
    category: string;
  }> = [];

  try {
    let cleaned = result.trim();
    const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      cleaned = codeBlockMatch[1].trim();
    }
    const jsonStart = cleaned.indexOf("[");
    const jsonEnd = cleaned.lastIndexOf("]");
    if (jsonStart !== -1 && jsonEnd !== -1) {
      questions = JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1)) as typeof questions;
    }
  } catch {
    // 파싱 실패 시 원시 텍스트 표시
  }

  if (questions.length === 0) {
    return (
      <div className="prose max-w-none whitespace-pre-wrap text-sm text-text-primary leading-relaxed">
        {result}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-text-dim mb-2">
        체크포인트 단계에서 확인할 {questions.length}개 질문이 생성되었습니다.
      </p>
      {questions.map((q) => (
        <div key={q.id} className="bg-navy-light rounded-lg p-3 border border-border">
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-gold-dim text-gold flex items-center justify-center text-xs font-medium shrink-0">
              {q.id}
            </span>
            <div className="flex-1 min-w-0">
              <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium mb-1 ${categoryColors[q.category] ?? "bg-surface text-text-dim"}`}>
                {q.category}
              </span>
              <p className="text-sm text-text-primary">{q.question}</p>
              <p className="text-xs text-text-dim mt-1">{q.why}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
