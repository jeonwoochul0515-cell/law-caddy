# LAW-CADDY — 프로젝트 명세서 (Claude CLI용)

> 변호사 상담 녹음 → AI 분석 → 법률 문서 자동 생성 플랫폼
> 기술스택: React + Vite + TypeScript + Firebase + Anthropic Claude API + 리턴제로 RTZR STT API

---

## 1. 프로젝트 개요

### 1.1 서비스 정의
LAW-CADDY는 변호사가 의뢰인 상담을 녹음하면 AI가 자동으로 음성을 텍스트로 변환하고, 6개 병렬 AI 에이전트가 판례 검색·적법성 검증·쟁점 분석·문서 작성·검토까지 수행하는 B2B 법률 SaaS입니다.

### 1.2 핵심 워크플로우
```
녹음/업로드 → RTZR STT(화자분리) → 6개 에이전트 병렬 분석 → 체크포인트 확인 → 문서 생성 → 의뢰인 메시지 생성
```

### 1.3 타겟 사용자
- 1차: 1~5인 소규모 법률사무소 변호사 (15,000~20,000명)
- 2차: 지방 변호사 (7,000~8,000명)
- 3차: 신규 변호사 1~3년차 (연간 1,400~1,500명)

### 1.4 요금제 (확정)
| 플랜 | 가격 | 기능 |
|------|------|------|
| Starter | ₩49,000/월 | 5건 녹음/월, 3건 문서/월 |
| **Pro** ⭐ | **₩89,000/월** | 무제한 녹음, 6개 에이전트, 무제한 문서, 의뢰인 메시지, 케이스 관리 |
| Team | ₩69,000/인 | Pro + 팀 공유 + 관리자 (3인 이상) |

---

## 2. 기술 아키텍처

### 2.1 프론트엔드
```
React 18 + TypeScript + Vite
├── 상태관리: Zustand (또는 React Context)
├── 라우팅: React Router v6
├── UI: Tailwind CSS + 커스텀 디자인 시스템 (다크 네이비 + 골드 테마)
├── 폼: React Hook Form
└── 빌드: Vite + SWC
```

### 2.2 백엔드/인프라
```
Firebase
├── Authentication: 이메일/비밀번호 (관리자 승인 후 활성화)
├── Firestore: 사건, 녹음, 문서, 사용자 데이터
├── Storage: 녹음 파일, 생성된 문서 파일
├── Hosting: 프론트엔드 배포
└── Functions (선택): STT 프록시, 스케줄러

RTZR STT Backend (Node.js Express 프록시)
├── JWT 토큰 자동 관리
├── 법률용어 키워드 부스팅 (30개+)
└── 화자분리 결과 포맷팅
```

### 2.3 외부 API
```
1. Anthropic Claude API (claude-sonnet-5)
   - 6개 병렬 에이전트 처리
   - 체크포인트 질문 생성
   - 법률 문서 초안 작성
   - 의뢰인 카카오톡 메시지 생성

2. 리턴제로 RTZR STT API (https://openapi.vito.ai)
   - 모델: sommers (한국어 최고 정확도)
   - 화자분리(diarization): 변호사/의뢰인 자동 구분
   - 키워드 부스팅: 법률 전문용어 30개+
   - 배치 처리: POST /v1/transcribe → GET /v1/transcribe/{id} 폴링
```

### 2.4 디자인 시스템
```typescript
// 컬러 팔레트 (확정)
const theme = {
  bg: "#0B1120",                    // 다크 네이비 배경
  surface: "rgba(255,255,255,0.025)", // 글래스모피즘 카드
  border: "rgba(255,255,255,0.06)",
  gold: "#C8A961",                  // 프라이머리 골드
  goldDim: "rgba(200,169,97,0.15)",
  goldBright: "#E8D5A0",
  text: "#E8E0D0",                  // 밝은 텍스트
  textDim: "rgba(255,255,255,0.4)",
  green: "#4ADE80",                 // 성공
  red: "#EF4444",                   // 에러
  amber: "#F59E0B",                 // 경고
  blue: "#60A5FA",                  // 정보
};
```
- **스타일**: 다크 모드 기본, 글래스모피즘 카드, 골드 그라디언트 CTA 버튼
- **폰트**: system-ui (한국어 최적화)
- **아이콘**: 이모지 기반 (lucide-react 보조)
- **반응형**: 모바일 퍼스트 (향후 WebView 앱 전환 예정)

---

## 3. Firestore 데이터 스키마

### 3.1 users 컬렉션
```typescript
interface User {
  uid: string;                    // Firebase Auth UID
  email: string;
  name: string;                   // 변호사 이름
  firmName: string;               // 법률사무소 이름
  barLicenseNumber: string;       // 변호사 등록번호
  role: "lawyer" | "admin";
  status: "pending" | "approved" | "rejected";  // 관리자 승인 필요
  plan: "free" | "starter" | "pro" | "team";
  createdAt: Timestamp;
  approvedAt?: Timestamp;
  approvedBy?: string;            // 승인 관리자 UID
}
```

### 3.2 cases 컬렉션
```typescript
interface Case {
  id: string;                     // 자동 생성
  ownerId: string;                // 변호사 UID
  clientName: string;             // 의뢰인 이름
  caseType: CaseType;             // 민사|형사|가사|행정|노동|부동산|채권·채무|손해배상|기타
  description: string;            // 사건 개요
  status: "진행중" | "완료" | "보류";
  createdAt: Timestamp;
  updatedAt: Timestamp;
  timeline: TimelineEvent[];      // 사건 타임라인 (서브컬렉션 또는 배열)
}

type CaseType = "민사" | "형사" | "가사" | "행정" | "노동" | "부동산" | "채권·채무" | "손해배상" | "기타";
```

### 3.3 recordings 컬렉션
```typescript
interface Recording {
  id: string;
  caseId: string;                 // 연결된 사건
  ownerId: string;
  fileName: string;
  fileUrl: string;                // Firebase Storage URL
  fileSizeMB: number;
  durationSeconds: number;
  // RTZR STT
  rtzrTranscribeId?: string;      // RTZR 전사 요청 ID
  sttStatus: "pending" | "processing" | "completed" | "failed";
  transcript?: string;            // 포맷팅된 대화록
  utterances?: Utterance[];       // RTZR 원본 utterances
  speakers?: Record<number, string>; // 화자 매핑 {0: "변호사", 1: "의뢰인"}
  createdAt: Timestamp;
}

interface Utterance {
  startAt: number;                // ms
  duration: number;               // ms
  spk: number;                    // 화자 번호
  msg: string;                    // 인식 텍스트
}
```

### 3.4 documents 컬렉션
```typescript
interface LegalDocument {
  id: string;
  caseId: string;
  recordingId: string;
  ownerId: string;
  docType: DocType;
  // 에이전트 결과
  agentResults: {
    precedent: string;            // 판례 검색 결과
    legal: string;                // 적법성 검증
    stt: string;                  // STT 대화록
    analysis: string;             // 쟁점 분석
    docgen: string;               // 문서 초안
    review: string;               // 검토 의견
  };
  // 체크포인트
  checkQuestions: CheckQuestion[];
  answeredChecks: Record<number, "yes" | "no" | "partial">;
  // 최종 문서
  finalDocument: string;          // 마크다운 또는 텍스트
  fileUrl?: string;               // 내보낸 HWP/DOCX URL
  // 의뢰인 메시지
  clientMessage?: string;
  status: "processing" | "checkpoint" | "generating" | "completed";
  createdAt: Timestamp;
}

type DocType = "내용증명" | "소장" | "답변서" | "준비서면" | "의견서" | "합의서" | "고소장" | "지급명령신청서" | "상담 요약 리포트";

interface CheckQuestion {
  id: number;
  question: string;
  why: string;
  category: "증거확보" | "사실관계" | "법리검토" | "전략수립" | "절차확인";
}
```

### 3.5 timeline (cases 서브컬렉션)
```typescript
interface TimelineEvent {
  type: "consult" | "doc" | "filing" | "response" | "note";
  date: Timestamp;
  label: string;
  detail: string;
}
```

---

## 4. 페이지/라우트 구조

```
/                           → 랜딩 (미인증 시)
/login                      → 로그인
/register                   → 회원가입 (변호사 등록번호 입력)
/pending                    → 승인 대기 화면
/dashboard                  → 대시보드 (통계 + 최근 사건)
/record                     → 새 상담 녹음/업로드 + 에이전트 실행
/record/agents              → 에이전트 진행 상태 + 결과 탭
/record/checkpoint          → 체크포인트 확인
/record/document            → 최종 문서 생성
/cases                      → 사건 목록
/cases/:id                  → 사건 상세 (타임라인 + 서면 + 추가녹음)
/settings                   → 설정 (프로필, 요금제, 시스템 정보)
/admin                      → 관리자 페이지 (가입 승인/거부)
```

---

## 5. 6개 AI 에이전트 상세

### 5.1 에이전트 목록
| # | ID | 이름 | 아이콘 | 역할 |
|---|-----|------|--------|------|
| 1 | precedent | 판례 검색 | 📚 | 유사 판례 3~5건 검색 + 시사점 분석 |
| 2 | legal | 적법성 검증 | ⚖️ | 통비법·변호사법·개보법 준수 확인 |
| 3 | stt | 음성 변환 | 🎙️ | RTZR STT + 화자 구분 대화록 생성 |
| 4 | analysis | 쟁점 분석 | 🧠 | 핵심 쟁점 3가지 + 법조문 매칭 |
| 5 | docgen | 문서 작성 | 📄 | 체크포인트 확인 → 법률 문서 초안 |
| 6 | review | 검토·감수 | ✅ | 5점 척도 평가 + 수정 제안 5가지 |

### 5.2 실행 플로우
```
[녹음 완료] 
    ↓
[6개 에이전트 병렬 시작]
    ├── precedent → 완료 → 결과 탭에 표시
    ├── legal     → 완료 → 결과 탭에 표시
    ├── stt       → RTZR API 호출 → 폴링 → 완료 → 결과를 다른 에이전트에 공유
    ├── analysis  → 완료 → 결과 탭에 표시
    ├── docgen    → 체크포인트 질문 생성 → [대기: 변호사 응답 필요]
    └── review    → 완료 → 결과 탭에 표시
    ↓
[변호사가 체크포인트 응답 (yes/no/partial)]
    ↓
[docgen 에이전트: 최종 문서 생성]
    ↓
[의뢰인 카카오톡 메시지 자동 생성]
```

### 5.3 에이전트 프롬프트 (확정)

각 에이전트의 시스템 프롬프트는 다음 컨텍스트를 공통으로 받습니다:
```
의뢰인: {clientName}
사건 유형: {caseType}
사건 개요: {caseDesc}
문서 유형: {docType}
[실제 STT 대화록 (있으면)]
```

**precedent 프롬프트:**
```
당신은 한국 법률 판례 검색 전문가입니다.
{컨텍스트}
유사 판례를 검색하여 분석하세요:
## 유사 판례 (3~5건)
각 판례마다: 사건번호, 판결 요지, 핵심 쟁점 및 법원의 판단, 본 사건 시사점 (유리/불리)
## 판례 동향 - 최근 법원 판단 경향
## 본 사건 적용 전략
한국어로 체계적으로 작성하세요.
```

**legal 프롬프트:**
```
당신은 법적 적법성 검증 전문가입니다.
{컨텍스트}
변호사가 의뢰인 상담을 녹음·AI 분석·문서 작성하는 것의 적법성:
1. 통신비밀보호법  2. 변호사법  3. 개인정보보호법  4. 변호사윤리장전  5. 종합 판단
한국어로 작성하세요.
```

**stt 프롬프트 (RTZR 실패 시 폴백용):**
```
당신은 법률 전문 음성 변환 에이전트입니다.
{컨텍스트}
변호사-의뢰인 상담 대화록을 생성하세요:
- 10-12턴 대화, [변호사]/[의뢰인] 표시
- 사실관계, 날짜, 금액, 증거 포함
- 법적 쟁점이 드러나도록
한국어로 자연스럽게 작성하세요.
```

**analysis 프롬프트:**
```
당신은 법률 쟁점 분석 AI입니다.
{컨텍스트}
## 핵심 쟁점 (3가지) - 각각: 쟁점명, 설명, 관련 법조문, 유리/불리 판단
## 관련 판례 2건
## 종합 의견 - 위험도, 권고 전략, 예상 기간·비용
한국어로 작성하세요.
```

**docgen_questions 프롬프트:**
```
당신은 법률 문서 작성 전문가입니다.
{컨텍스트}
"{docType}" 문서를 작성하기 전에, 변호사가 반드시 확인해야 할 사항 3~5개를 질문 형태로 제시하세요.
반드시 아래 JSON 형식으로만 응답하세요:
[{"id":1,"question":"질문","why":"이유","category":"증거확보|사실관계|법리검토|전략수립|절차확인"}]
```

**docgen 프롬프트:**
```
당신은 법률 문서 작성 AI입니다.
{컨텍스트}
{체크포인트 응답 결과}
"{docType}" 초안을 작성하세요:
- 실제 한국 법률 문서 양식, 개인정보 ○○ 마스킹
- 법적 근거 명시, 구체적 수치 포함
- 마지막에 "※ AI 생성 초안, 변호사 최종 검토 필요" 추가
한국어로 작성하세요.
```

**review 프롬프트:**
```
당신은 법률 문서 검토·감수 AI입니다.
{컨텍스트}
## 품질 평가 (5점 척도) - 형식, 법적 정확성, 논리, 설득력, 완성도
## 수정 제안 5가지
## 추가 보강 - 증거자료, 법리 보강, 상대방 반론 대응
한국어로 작성하세요.
```

**의뢰인 카카오톡 메시지 프롬프트:**
```
당신은 친절한 법률 비서입니다. 변호사가 의뢰인에게 보낼 카카오톡 메시지를 작성하세요.
규칙:
1. 법률 용어를 일상 언어로 쉽게 설명
2. "{docType}"을 쉬운 비유로 설명
3. 현재 진행상황 + 다음 단계 안내
4. 이모지 적절히 사용 (과하지 않게)
5. 200~300자 이내
6. 존댓말 + 따뜻한 톤
7. "궁금하신 점 있으시면 편하게 연락 주세요 😊" 포함
8. {firmName} {lawyerName} 변호사 서명
```

---

## 6. RTZR STT 연동 상세

### 6.1 인증 플로우
```
POST https://openapi.vito.ai/v1/authenticate
Content-Type: application/x-www-form-urlencoded
Body: client_id={ID}&client_secret={SECRET}
→ { "access_token": "JWT...", "expire_at": 1690377931 }
```
- JWT 유효기간: 6시간
- 만료 5분 전 자동 갱신

### 6.2 전사 요청
```
POST https://openapi.vito.ai/v1/transcribe
Authorization: Bearer {JWT}
Content-Type: multipart/form-data
Body: file={음성파일} + config={JSON}
→ { "id": "transcribe_id" }
```

### 6.3 LAW-CADDY 전용 config
```json
{
  "model_name": "sommers",
  "language": "ko",
  "use_diarization": true,
  "diarization": { "spk_count": 2 },
  "use_itn": true,
  "use_disfluency_filter": true,
  "use_profanity_filter": false,
  "use_paragraph_splitter": true,
  "paragraph_splitter": { "max": 80 },
  "domain": "GENERAL",
  "keywords": [
    "내용증명", "소장", "답변서", "준비서면", "지급명령",
    "채권", "채무", "손해배상", "부당이득", "불법행위",
    "소멸시효", "제척기간", "가처분", "가압류", "강제집행",
    "고소장", "고발장", "피의자", "피해자", "공소시효",
    "이혼", "양육권", "위자료", "재산분할", "친권",
    "퇴직금", "해고", "부당해고", "산업재해", "근로기준법",
    "임대차", "전세", "보증금", "등기", "매매계약",
    "변호사", "의뢰인", "원고", "피고", "증거",
    "판결", "판례", "법원", "검찰", "경찰"
  ]
}
```

### 6.4 결과 조회 (폴링)
```
GET https://openapi.vito.ai/v1/transcribe/{transcribe_id}
→ { "status": "completed", "results": { "utterances": [...] } }
```
- 3초 간격 폴링
- 최대 6분 (120회) 대기
- utterance 구조: `{ start_at, duration, spk, msg }`

### 6.5 화자 매핑
```typescript
// spk 번호를 역할로 변환
const speakerLabels = ["변호사", "의뢰인", "참석자3", "참석자4"];
// 첫 번째 발화자를 변호사로 가정 (설정에서 변경 가능)
```

---

## 7. 인증/승인 플로우

### 7.1 회원가입
```
[가입 폼] → 이름, 이메일, 비밀번호, 변호사 등록번호, 사무소명
    ↓
[Firebase Auth 계정 생성] + [Firestore users 문서 생성 (status: "pending")]
    ↓
[승인 대기 화면 표시]
```

### 7.2 관리자 승인
```
[관리자 페이지] → 대기 목록 확인
    ↓
[대한변호사협회 검색으로 수동 검증]
  - https://m.koreanbar.or.kr/pages/search/search.asp
  - 이름 + 변호사 등록번호 일치 확인
    ↓
[승인 클릭] → status: "approved", approvedAt, approvedBy 업데이트
    ↓
[사용자 로그인 가능]
```

### 7.3 로그인 후 라우팅
```typescript
if (!user) → /login
else if (user.status === "pending") → /pending
else if (user.status === "rejected") → /rejected (재신청 안내)
else if (user.status === "approved") → /dashboard
```

---

## 8. 프로젝트 디렉토리 구조 (권장)

```
law-caddy/
├── .env                          # Firebase + Anthropic + RTZR 키
├── .env.example
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── package.json
├── index.html
├── public/
│   └── favicon.ico
├── src/
│   ├── main.tsx                  # React 진입점
│   ├── App.tsx                   # 라우터 설정
│   ├── vite-env.d.ts
│   │
│   ├── config/
│   │   ├── firebase.ts           # Firebase 초기화
│   │   ├── theme.ts              # 컬러 팔레트 + 디자인 토큰
│   │   └── constants.ts          # CASE_TYPES, DOC_TYPES, AGENTS 등
│   │
│   ├── types/
│   │   ├── user.ts
│   │   ├── case.ts
│   │   ├── recording.ts
│   │   ├── document.ts
│   │   └── agent.ts
│   │
│   ├── hooks/
│   │   ├── useAuth.ts            # Firebase Auth 훅
│   │   ├── useCases.ts           # Firestore CRUD
│   │   ├── useRecording.ts       # 녹음 + 파일 업로드
│   │   ├── useSTT.ts             # RTZR STT 연동
│   │   ├── useAgents.ts          # 6개 에이전트 병렬 실행
│   │   └── useDocument.ts        # 문서 생성 + 체크포인트
│   │
│   ├── services/
│   │   ├── claude.ts             # Claude API 호출 (프롬프트 빌더 포함)
│   │   ├── rtzr.ts               # RTZR STT 백엔드 통신
│   │   ├── firebase/
│   │   │   ├── auth.ts           # 가입, 로그인, 로그아웃
│   │   │   ├── firestore.ts      # 컬렉션 CRUD
│   │   │   └── storage.ts        # 파일 업로드/다운로드
│   │   └── prompts.ts            # 에이전트 프롬프트 빌더 (섹션 5.3 참고)
│   │
│   ├── components/
│   │   ├── ui/                   # 공통 UI 컴포넌트
│   │   │   ├── Glass.tsx         # 글래스모피즘 카드
│   │   │   ├── Badge.tsx
│   │   │   ├── Pill.tsx          # 필터 태그
│   │   │   ├── GoldButton.tsx    # 골드 그라디언트 CTA
│   │   │   ├── GhostButton.tsx
│   │   │   ├── Input.tsx
│   │   │   └── Waveform.tsx      # 녹음 시각화
│   │   │
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx       # 사이드바 네비게이션
│   │   │   ├── Header.tsx
│   │   │   └── AppLayout.tsx     # 인증된 사용자 레이아웃
│   │   │
│   │   ├── auth/
│   │   │   ├── LoginForm.tsx
│   │   │   ├── RegisterForm.tsx
│   │   │   └── PendingScreen.tsx
│   │   │
│   │   ├── recording/
│   │   │   ├── RecordingPanel.tsx # 녹음 + 업로드
│   │   │   ├── CaseInfoForm.tsx  # 의뢰인/사건 입력
│   │   │   └── FileUpload.tsx
│   │   │
│   │   ├── agents/
│   │   │   ├── AgentProgress.tsx # 6개 에이전트 진행바
│   │   │   ├── AgentResult.tsx   # 에이전트 결과 탭
│   │   │   └── AgentCard.tsx     # 개별 에이전트 상태
│   │   │
│   │   ├── document/
│   │   │   ├── Checkpoint.tsx    # 체크포인트 질문 UI
│   │   │   ├── DocumentViewer.tsx # 최종 문서 뷰어
│   │   │   ├── DocumentExport.tsx # HWP/DOCX 내보내기
│   │   │   └── ClientMessage.tsx # 의뢰인 메시지 생성
│   │   │
│   │   └── cases/
│   │       ├── CaseList.tsx
│   │       ├── CaseDetail.tsx
│   │       ├── Timeline.tsx
│   │       └── OpponentDocs.tsx  # 상대방 서면 업로드
│   │
│   └── pages/
│       ├── LoginPage.tsx
│       ├── RegisterPage.tsx
│       ├── PendingPage.tsx
│       ├── DashboardPage.tsx
│       ├── RecordPage.tsx
│       ├── CasesPage.tsx
│       ├── CaseDetailPage.tsx
│       ├── SettingsPage.tsx
│       └── AdminPage.tsx
│
└── stt-backend/                  # RTZR STT 프록시 서버
    ├── server.js
    ├── package.json
    └── .env
```

---

## 9. 환경변수 (.env)

```bash
# Firebase
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=

# Anthropic Claude API
VITE_ANTHROPIC_API_KEY=           # 프론트에서 직접 호출 (MVP 단계)

# RTZR STT Backend URL
VITE_STT_BACKEND_URL=http://localhost:3001

# STT Backend (.env — stt-backend/ 디렉토리)
RTZR_CLIENT_ID=
RTZR_CLIENT_SECRET=
```

---

## 10. MVP 기능 우선순위

### Phase 1: 핵심 (2주)
- [x] Firebase Auth + Firestore 연동
- [x] 로그인/가입/승인대기 3단계 플로우
- [x] 대시보드 (통계 + 최근 사건)
- [x] 녹음 + 파일 업로드
- [x] RTZR STT 배치 연동 (화자분리)
- [x] 6개 에이전트 병렬 실행
- [x] 체크포인트 → 문서 생성
- [x] 의뢰인 카카오톡 메시지

### Phase 2: 케이스 관리 (1주)
- [ ] 사건 목록/상세/검색
- [ ] 타임라인
- [ ] 상대방 서면 업로드
- [ ] 추가 상담 녹음

### Phase 3: 관리자 + 설정 (1주)
- [ ] 관리자 승인/거부 페이지
- [ ] 대한변협 검색 링크 통합
- [ ] 프로필/비밀번호 설정
- [ ] 시스템 정보

---

## 11. 기존 MVP 코드 참고

현재 `LAW_CADDY_MVP_v4.jsx` (1,051줄, 단일 파일 React 컴포넌트)에 모든 기능이 구현되어 있습니다. 이 파일을 TypeScript 멀티파일 구조로 분해하여 재구현해야 합니다.

기존 코드에서 가져올 것:
1. **디자인 시스템**: 컬러, 글래스모피즘, 골드 그라디언트 — 그대로 Tailwind로 변환
2. **에이전트 프롬프트**: buildPrompt() 함수의 모든 프롬프트 — services/prompts.ts로 이동
3. **RTZR 연동**: rtzrTranscribe(), rtzrPollResult(), formatRtzrToTranscript() — services/rtzr.ts로 이동
4. **Claude API 호출**: callClaude() — services/claude.ts로 이동
5. **UI 컴포넌트**: Glass, Badge, Pill, GoldBtn, Waveform — components/ui/로 분해
6. **비즈니스 로직**: runAllAgents, generateFinalDoc, generateClientMsg — hooks/로 분해

---

## 12. 핵심 개발 규칙

1. **언어**: 모든 UI 텍스트는 한국어. 코드 주석도 한국어 권장.
2. **타입 안전**: strict TypeScript. `any` 사용 금지.
3. **에러 처리**: 모든 API 호출에 try-catch + 사용자 친화적 에러 메시지.
4. **보안**: API 키는 반드시 환경변수. RTZR Secret은 백엔드에서만.
5. **모바일 퍼스트**: 반응형 디자인. 태블릿/모바일에서도 사용 가능.
6. **Firebase 보안 규칙**: 본인 데이터만 접근 가능하도록 Firestore rules 설정.
7. **상태 관리**: 전역 상태는 최소화. 가능하면 서버 상태(Firestore) 직접 사용.

---

## 13. 참고 문서

- RTZR STT API 공식 문서: https://developers.rtzr.ai/docs/
- RTZR 인증 가이드: https://developers.rtzr.ai/docs/authentications/
- RTZR 일반 STT: https://developers.rtzr.ai/docs/stt-file/
- Anthropic Claude API: https://docs.anthropic.com/
- Firebase 공식 문서: https://firebase.google.com/docs

---

*이 문서는 LAW-CADDY 프로젝트의 전체 명세서입니다. Claude CLI에서 이 문서를 CLAUDE.md로 저장하여 프로젝트 컨텍스트로 사용하세요.*
