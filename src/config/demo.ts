// 데모 모드 감지 및 목(mock) 데이터
// Firebase 환경변수가 없을 때 앱이 크래시 없이 동작하도록 지원

import type { User } from "../types/user";
import type { Case } from "../types/case";
import type { LegalDocument } from "../types/document";
import type { Recording } from "../types/recording";
import type { CheckQuestion } from "../types/document";

/**
 * 데모 모드 여부 (VITE_FIREBASE_API_KEY가 설정되지 않으면 true)
 */
export const isDemoMode: boolean = !import.meta.env.VITE_FIREBASE_API_KEY;

/**
 * Firestore Timestamp과 호환되는 목 타임스탬프를 생성합니다.
 * toDate() 메서드를 포함하여 기존 코드에서 Timestamp처럼 사용할 수 있습니다.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mockTimestamp(date: Date): any {
  return {
    seconds: Math.floor(date.getTime() / 1000),
    nanoseconds: 0,
    toDate: () => date,
    toMillis: () => date.getTime(),
    isEqual: () => false,
    toJSON: () => ({ seconds: Math.floor(date.getTime() / 1000), nanoseconds: 0 }),
  };
}

/**
 * 데모 사용자 (변호사 역할, 승인 완료 상태)
 */
export const DEMO_USER: User = {
  uid: "demo-user-001",
  email: "demo@lawcaddy.kr",
  name: "김변호",
  firmName: "법무법인 데모",
  barLicenseNumber: "12345",
  role: "lawyer",
  status: "approved",
  plan: "pro",
  createdAt: mockTimestamp(new Date("2025-01-15T09:00:00Z")),
};

/**
 * 데모 사건 목록 (3건)
 */
export const DEMO_CASES: Case[] = [
  {
    id: "demo-case-001",
    ownerId: "demo-user-001",
    clientName: "박영수",
    caseType: "민사",
    description:
      "의뢰인이 부동산 매매계약 체결 후 매도인이 잔금 수령 후에도 소유권 이전등기를 이행하지 않고 있는 사안. 매매대금 2억 3천만 원 중 잔금 1억 원을 2025년 6월에 지급 완료하였으나, 매도인이 제3자에게 이중매매를 시도한 정황이 확인됨.",
    status: "진행중",
    createdAt: mockTimestamp(new Date("2025-07-10T10:30:00Z")),
    updatedAt: mockTimestamp(new Date("2025-08-01T14:00:00Z")),
    timeline: [],
  },
  {
    id: "demo-case-002",
    ownerId: "demo-user-001",
    clientName: "이서연",
    caseType: "형사",
    description:
      "의뢰인이 온라인 중고거래 플랫폼에서 사기 피해를 당한 사안. 고가 전자제품(노트북) 구매 대금 180만 원을 송금하였으나 물건을 받지 못함. 판매자는 연락 두절 상태이며, 동일 수법으로 다수의 피해자가 있는 것으로 추정됨.",
    status: "진행중",
    createdAt: mockTimestamp(new Date("2025-08-05T11:00:00Z")),
    updatedAt: mockTimestamp(new Date("2025-08-20T09:30:00Z")),
    timeline: [],
  },
  {
    id: "demo-case-003",
    ownerId: "demo-user-001",
    clientName: "최민정",
    caseType: "가사",
    description:
      "혼인기간 12년, 미성년 자녀 2명(10세, 7세)이 있는 사안에서 의뢰인이 이혼 소송을 희망. 배우자의 지속적인 경제적 무책임(도박)으로 혼인 파탄이 발생하였으며, 양육권 및 재산분할에 대한 협의가 이루어지지 않는 상태.",
    status: "보류",
    createdAt: mockTimestamp(new Date("2025-06-20T14:00:00Z")),
    updatedAt: mockTimestamp(new Date("2025-07-15T16:00:00Z")),
    timeline: [],
  },
];

/**
 * 관리자 페이지 테스트용 승인 대기 사용자 목록
 */
export const DEMO_ADMIN_PENDING_USERS: User[] = [
  {
    uid: "pending-user-001",
    email: "hong@lawfirm.kr",
    name: "홍길동",
    firmName: "법률사무소 정의",
    barLicenseNumber: "67890",
    role: "lawyer",
    status: "pending",
    plan: "free",
    createdAt: mockTimestamp(new Date("2025-09-01T10:00:00Z")),
  },
  {
    uid: "pending-user-002",
    email: "shin@legalgroup.kr",
    name: "신사임당",
    firmName: "법무법인 혜율",
    barLicenseNumber: "11223",
    role: "lawyer",
    status: "pending",
    plan: "free",
    createdAt: mockTimestamp(new Date("2025-09-03T15:30:00Z")),
  },
];

/** 데모 문서 목록 (CaseDetailPage 용) */
export const DEMO_DOCUMENTS: LegalDocument[] = [
  {
    id: "demo-doc-001",
    caseId: "demo-case-001",
    recordingId: "demo-rec-001",
    ownerId: "demo-user-001",
    docType: "내용증명",
    agentResults: {
      precedent: "",
      legal: "",
      stt: "",
      analysis: "",
      docgen: "",
      review: "",
    },
    checkQuestions: [],
    answeredChecks: {},
    finalDocument: "",
    status: "completed",
    createdAt: mockTimestamp(new Date("2025-07-12T10:00:00Z")),
  },
  {
    id: "demo-doc-002",
    caseId: "demo-case-002",
    recordingId: "demo-rec-002",
    ownerId: "demo-user-001",
    docType: "고소장",
    agentResults: {
      precedent: "",
      legal: "",
      stt: "",
      analysis: "",
      docgen: "",
      review: "",
    },
    checkQuestions: [],
    answeredChecks: {},
    finalDocument: "",
    status: "processing",
    createdAt: mockTimestamp(new Date("2025-08-07T11:00:00Z")),
  },
];

/** 데모 녹음 목록 (CaseDetailPage 용) */
export const DEMO_RECORDINGS: Recording[] = [
  {
    id: "demo-rec-001",
    caseId: "demo-case-001",
    ownerId: "demo-user-001",
    fileName: "상담녹음_박영수_20250710.m4a",
    fileUrl: "",
    fileSizeMB: 12.4,
    durationSeconds: 1842,
    sttStatus: "completed",
    transcript:
      "[변호사] 안녕하세요, 사건 내용을 말씀해 주세요.\n[의뢰인] 부동산 매매 건으로 왔습니다.",
    createdAt: mockTimestamp(new Date("2025-07-10T10:30:00Z")),
  },
  {
    id: "demo-rec-002",
    caseId: "demo-case-002",
    ownerId: "demo-user-001",
    fileName: "상담녹음_이서연_20250805.m4a",
    fileUrl: "",
    fileSizeMB: 8.7,
    durationSeconds: 1205,
    sttStatus: "completed",
    createdAt: mockTimestamp(new Date("2025-08-05T11:00:00Z")),
  },
];

/** 데모 체크포인트 질문 (useDocument 용) */
export const DEMO_CHECK_QUESTIONS: CheckQuestion[] = [
  {
    id: 1,
    question: "매매계약서 원본 또는 사본을 보유하고 계신가요?",
    why: "계약 내용과 해제 사유를 입증하기 위해 원본 계약서가 필수적입니다.",
    category: "증거확보",
  },
  {
    id: 2,
    question: "계약 해제 통보를 서면(내용증명 등)으로 하셨나요?",
    why: "계약 해제의 의사표시가 상대방에게 적법하게 도달했는지 확인이 필요합니다.",
    category: "사실관계",
  },
  {
    id: 3,
    question: "상대방(매도인)의 이행 지체에 대한 최고(催告)를 하셨나요?",
    why: "민법 제544조에 따른 이행 최고 절차 준수 여부가 계약 해제의 적법성을 좌우합니다.",
    category: "법리검토",
  },
];

/** 데모 최종 문서 (useDocument 용) */
export const DEMO_FINAL_DOCUMENT = `내 용 증 명

수신인: ○○○ (매도인)
주  소: 서울특별시 ○○구 ○○동 ○○아파트 ○○○호

발신인: ○○○ (매수인, 의뢰인)
주  소: 서울특별시 ○○구 ○○동 ○○번지

제목: 매매계약 해제 및 계약금 반환 청구

1. 발신인은 수신인과 2025년 6월 15일 서울 ○○구 소재 아파트(이하 "본건 부동산")에 관하여 매매대금 2억 3천만 원에 매매계약(이하 "본건 계약")을 체결하고, 계약금 ○○○만 원을 지급하였습니다.

2. 본건 계약 제○조에 의하면 수신인은 잔금 수령과 동시에 소유권이전등기 절차를 이행할 의무가 있었습니다.

3. 그러나 수신인은 잔금 1억 원을 수령하였음에도 소유권이전등기 의무를 이행하지 아니하였고, 오히려 제3자에게 이중매매를 시도한 정황이 확인되었습니다.

4. 이에 발신인은 민법 제544조에 의거하여 본건 계약을 해제하며, 수신인에게 기 지급한 매매대금의 반환을 청구합니다.

5. 본 내용증명 수령일로부터 7일 이내에 위 금원을 반환하여 주시기 바라며, 불이행 시 민사소송 등 법적 절차를 진행할 예정임을 알려드립니다.

※ AI 생성 초안입니다. 반드시 변호사의 최종 검토 후 사용하세요.`;

/** 데모 의뢰인 카카오톡 메시지 (useDocument 용) */
export const DEMO_CLIENT_MESSAGE = `박영수 님, 안녕하세요 😊

담당 변호사 김변호입니다.

말씀하신 부동산 매매 건에 대해 내용증명서 초안 작성이 완료되었습니다.

내용증명이란 쉽게 말해 "공식적으로 이런 내용을 전달했다"는 증거가 되는 편지예요. 매도인 측에 소유권이전등기 이행을 정식으로 요청하는 첫 단계입니다.

현재 진행 상황:
- 내용증명서 초안 작성 완료
- 변호사 최종 검토 후 발송 예정

다음 단계:
- 내용증명 발송 (이번 주 내)
- 상대방 회신 대기 (7일)
- 회신 없을 시 민사소송 검토

궁금하신 점 있으시면 편하게 연락 주세요 😊

법무법인 데모 김변호 변호사`;
