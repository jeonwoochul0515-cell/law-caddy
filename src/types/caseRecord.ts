import type { Timestamp } from "firebase/firestore";

/**
 * 사건기록 문서 유형
 * 전자소송에서 내려받은 PDF를 업로드하면 파일명·헤더 휴리스틱 + LLM 보조로 자동 추정.
 * 추정 실패 시 "기타"로 저장되며 사용자가 UI에서 직접 변경 가능.
 */
export type RecordDocType =
  | "소장"
  | "답변서"
  | "준비서면"
  | "증거"
  | "결정문"
  | "판결문"
  | "기타";

/** 서면 제출 주체 */
export type RecordSubmittedBy = "원고" | "피고" | "법원" | "기타" | "미상";

/**
 * 사건기록 파싱·OCR 진행 상태
 * - pending: 업로드 직후 파싱 대기
 * - ocr_running: 이미지 PDF로 판정되어 Clova OCR 처리 중
 * - parsed: parsedText 저장 완료, RAG 인덱싱 가능
 * - failed: 파싱 실패(재시도 가능)
 * - drm_blocked: DRM·암호화 PDF로 텍스트 추출 불가, 사용자에게 해제 후 재업로드 안내
 */
export type OcrStatus = "pending" | "ocr_running" | "parsed" | "failed" | "drm_blocked";

/** 실제 텍스트 추출에 사용된 엔진 */
export type OcrEngine = "pdf-text" | "clova-ocr";

/**
 * 사건기록 문서
 * Firestore 컬렉션: `case_records`
 * 파일 원본: Firebase Storage `case-records/{ownerId}/{caseId}/` 경로
 * 보안 규칙: ownerId == request.auth.uid 인 경우만 read/write (변호사법 §26 비밀유지)
 *
 * 기존 OpponentDoc(src/types/case.ts)은 최소 필드만 가진 레거시 타입이며,
 * 이 CaseRecord 를 상위 모델로 점진 대체한다. (마이그레이션 계획은 docs/case-record-integration-plan.md)
 */
export interface CaseRecord {
  id: string;
  caseId: string;                        // cases/{caseId} FK
  ownerId: string;                       // 변호사 UID (격리 키)

  // 분류 메타
  docType: RecordDocType;
  submittedBy: RecordSubmittedBy;
  submittedAt?: string;                  // 기록상 제출일 (YYYY-MM-DD)

  // 파일 정보
  fileName: string;
  storageUrl: string;                    // gs://... (Firebase Storage)
  fileSizeMB: number;

  // 파싱 결과
  parsedText?: string;                   // 전체 텍스트 (길면 Storage로 오프로드 후 URL만 저장)
  parsedTextSummary?: string;            // 300자 요약
  ocrStatus: OcrStatus;
  ocrEngine?: OcrEngine;
  maskedPII: boolean;                    // 주민번호·계좌·상세주소·휴대번호 마스킹 완료 여부

  // 후속 처리
  ragIndexedAt?: Timestamp;
  analyzedAt?: Timestamp;
  /**
   * 분석 결과는 같은 문서에 임베드한다 (분량 몇 KB 수준이라 Firestore 1MB 한계 무관).
   * 향후 분량 커지면 case_record_analyses 컬렉션으로 분리하고 여기는 FK로 전환.
   */
  analysis?: CaseRecordEmbeddedAnalysis;

  // 타임스탬프
  uploadedAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * CaseRecord.analysis 임베드용 opponentBriefAnalyzer 결과 (MVP 단계).
 * 향후 별도 컬렉션으로 분리될 때를 대비해 CaseRecordAnalysis 와 필드를 정렬한다.
 */
export interface CaseRecordEmbeddedAnalysis {
  claims: AnalyzedClaim[];
  rebuttalOutline: string[];
  suggestedPrecedents: SuggestedPrecedent[];
  generatedAt: Timestamp;
  modelName?: string;
  tokensUsed?: number;
  lawyerReview?: "accepted" | "edited" | "discarded";
  lawyerReviewedAt?: Timestamp;
}

/**
 * opponentBriefAnalyzer 에이전트 분석 결과
 * Firestore 컬렉션: `case_record_analyses`
 * CaseRecord.analysisSummaryId 로 참조.
 *
 * 환각 방지 원칙: 모든 주장·근거·반박은 원문 인용 스팬(`citation`)을 반드시 포함한다.
 * 인용이 비어 있으면 UI에서 해당 항목을 렌더링하지 않는다.
 */
export interface CaseRecordAnalysis {
  id: string;
  caseRecordId: string;                  // case_records/{id} FK
  caseId: string;
  ownerId: string;

  // 분석 본문
  claims: AnalyzedClaim[];               // 상대방 주장 요지
  rebuttalOutline: string[];             // 반박 준비서면 골격 (h2 수준 목차)
  suggestedPrecedents: SuggestedPrecedent[];

  // 메타
  modelName: string;                     // 예: "claude-sonnet-4-20250514"
  tokensUsed?: number;
  generatedAt: Timestamp;
  /** 변호사가 "이 분석 신뢰함/수정함/폐기함" 으로 표시한 결과 */
  lawyerReview?: "accepted" | "edited" | "discarded";
  lawyerReviewedAt?: Timestamp;
}

/** 상대방 주장 1개 */
export interface AnalyzedClaim {
  index: number;                         // 1부터 시작
  summary: string;                       // 주장 요지
  citation: string;                      // 서면 원문 인용 (빈 문자열이면 UI 숨김)
  citationPage?: number;
  basis: string;                         // 주장별 근거
  weakness: string;                      // 논리·증거·법리상 약점
  rebuttalPoint: string;                 // 반박 포인트
}

/** 제안 판례·법조문 1개 */
export interface SuggestedPrecedent {
  caseNumber?: string;                   // 예: "대법원 2020다12345"
  statute?: string;                      // 예: "민법 §750"
  relevance: string;                     // 본 사건에 왜 적용 가능한지
}

/**
 * 업로드 요청 시 클라이언트가 서버로 전달하는 페이로드 (파일은 multipart로 별도 전송)
 * functions/api/cases/[caseId]/records/upload.ts 가 수신한다.
 */
export interface CaseRecordUploadInput {
  docType?: RecordDocType;               // 선택(비어있으면 서버에서 자동 추정)
  submittedBy?: RecordSubmittedBy;       // 선택
  submittedAt?: string;                  // YYYY-MM-DD, 선택
}
