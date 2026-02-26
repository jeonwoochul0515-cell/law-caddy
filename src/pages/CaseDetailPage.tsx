import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Calendar, FileText, Mic, Clock } from "lucide-react";
import AppLayout from "../components/layout/AppLayout";
import { getCase } from "../services/firebase/firestore";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { db } from "../config/firebase";
import { isDemoMode, DEMO_CASES, DEMO_DOCUMENTS, DEMO_RECORDINGS } from "../config/demo";
import type { Case, TimelineEvent } from "../types/case";
import type { LegalDocument } from "../types/document";
import type { Recording } from "../types/recording";

export default function CaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [caseData, setCaseData] = useState<Case | null>(null);
  const [documents, setDocuments] = useState<LegalDocument[]>([]);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"timeline" | "documents" | "recordings">("timeline");

  useEffect(() => {
    if (!id) return;

    // 데모 모드: 목 데이터에서 찾기
    if (isDemoMode) {
      const found = DEMO_CASES.find((c) => c.id === id) ?? null;
      setCaseData(found);
      setDocuments(DEMO_DOCUMENTS.filter((d) => d.caseId === id));
      setRecordings(DEMO_RECORDINGS.filter((r) => r.caseId === id));
      setLoading(false);
      return;
    }

    const fetchAll = async () => {
      try {
        const c = await getCase(id);
        setCaseData(c);

        const docsQ = query(collection(db!, "documents"), where("caseId", "==", id), orderBy("createdAt", "desc"));
        const docsSnap = await getDocs(docsQ);
        setDocuments(docsSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as LegalDocument));

        const recsQ = query(collection(db!, "recordings"), where("caseId", "==", id), orderBy("createdAt", "desc"));
        const recsSnap = await getDocs(recsQ);
        setRecordings(recsSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Recording));
      } catch (err) {
        console.error("사건 상세 로딩 실패:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [id]);

  if (loading) {
    return (
      <AppLayout title="사건 상세" subtitle="">
        <div className="text-center py-16 text-text-dim">로딩 중...</div>
      </AppLayout>
    );
  }

  if (!caseData) {
    return (
      <AppLayout title="사건 상세" subtitle="">
        <div className="text-center py-16 text-text-dim">사건을 찾을 수 없습니다.</div>
      </AppLayout>
    );
  }

  const statusColors: Record<string, string> = {
    "진행중": "bg-success/15 text-success",
    "완료": "bg-text-dim/15 text-text-dim",
    "보류": "bg-warning/15 text-warning",
  };

  const timelineIcons: Record<TimelineEvent["type"], React.ElementType> = {
    consult: Mic,
    doc: FileText,
    filing: Calendar,
    response: FileText,
    note: Clock,
  };

  return (
    <AppLayout title={caseData.clientName} subtitle={caseData.caseType}>
      {/* 뒤로가기 */}
      <button
        onClick={() => navigate("/cases")}
        className="flex items-center gap-2 text-text-dim hover:text-gold transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        <span className="text-sm">사건 목록</span>
      </button>

      {/* 사건 헤더 */}
      <div className="bg-surface border border-border rounded-2xl p-6 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-text-primary">{caseData.clientName}</h2>
            <p className="text-text-dim mt-1">{caseData.caseType}</p>
          </div>
          <span className={`px-3 py-1 rounded-full text-sm ${statusColors[caseData.status] ?? ""}`}>
            {caseData.status}
          </span>
        </div>
        <p className="text-sm text-text-primary leading-relaxed">{caseData.description}</p>
      </div>

      {/* 탭 */}
      <div className="flex gap-2 mb-6">
        {([
          { key: "timeline" as const, label: "타임라인", count: caseData.timeline?.length ?? 0 },
          { key: "documents" as const, label: "문서", count: documents.length },
          { key: "recordings" as const, label: "녹음", count: recordings.length },
        ]).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key
                ? "bg-gold-dim text-gold border border-gold/30"
                : "bg-surface text-text-dim border border-border hover:border-border-hover"
            }`}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {/* 타임라인 */}
      {tab === "timeline" && (
        <div className="space-y-4">
          {(!caseData.timeline || caseData.timeline.length === 0) ? (
            <div className="text-center py-8 text-text-dim">아직 타임라인 이벤트가 없습니다.</div>
          ) : (
            caseData.timeline.map((event, i) => {
              const Icon = timelineIcons[event.type] ?? Clock;
              return (
                <div key={i} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-8 h-8 bg-gold-dim rounded-full flex items-center justify-center">
                      <Icon className="w-4 h-4 text-gold" />
                    </div>
                    {i < caseData.timeline.length - 1 && (
                      <div className="w-px h-full bg-border mt-2" />
                    )}
                  </div>
                  <div className="pb-6">
                    <p className="text-text-primary font-medium">{event.label}</p>
                    <p className="text-sm text-text-dim">{event.detail}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* 문서 */}
      {tab === "documents" && (
        <div className="space-y-3">
          {documents.length === 0 ? (
            <div className="text-center py-8 text-text-dim">생성된 문서가 없습니다.</div>
          ) : (
            documents.map((doc) => (
              <div key={doc.id} className="bg-surface border border-border rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-gold" />
                    <div>
                      <p className="text-text-primary font-medium">{doc.docType}</p>
                      <p className="text-sm text-text-dim">{doc.status}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* 녹음 */}
      {tab === "recordings" && (
        <div className="space-y-3">
          {recordings.length === 0 ? (
            <div className="text-center py-8 text-text-dim">녹음 파일이 없습니다.</div>
          ) : (
            recordings.map((rec) => (
              <div key={rec.id} className="bg-surface border border-border rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Mic className="w-5 h-5 text-gold" />
                    <div>
                      <p className="text-text-primary font-medium">{rec.fileName}</p>
                      <p className="text-sm text-text-dim">
                        {rec.fileSizeMB.toFixed(1)} MB · STT: {rec.sttStatus}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </AppLayout>
  );
}
