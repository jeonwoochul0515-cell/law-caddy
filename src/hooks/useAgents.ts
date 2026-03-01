// 6개 AI 에이전트 병렬 실행 훅
// 판례 검색, 적법성 검증, STT, 쟁점 분석, 문서 작성, 검토·감수
// 데모 모드: Claude API 없이 목(mock) 결과를 1~2초 지연 후 반환

import { useState, useCallback } from "react";
import { isDemoMode } from "../config/demo";
import { callClaude } from "../services/claude";
import { buildPrompt, buildCaseTypeClassificationPrompt } from "../services/prompts";
import { pollTranscription, formatTranscript } from "../services/rtzr";
import type { AgentContext } from "../services/prompts";
import type { AgentId, AgentState, CaseType } from "../types/agent";
import { CASE_TYPES } from "../config/constants";

/** 에이전트 실행 컨텍스트 (STT 폴링용 transcribeId 포함) */
interface RunAgentsContext extends AgentContext {
  transcribeId?: string;
}

/** 에이전트 실행 단계 */
type AgentStep = "idle" | "running" | "completed" | "error";

/** useAgents 반환 타입 */
interface UseAgentsReturn {
  agents: Record<AgentId, AgentState>;
  isRunning: boolean;
  currentStep: AgentStep;
  classifiedCaseType: CaseType | null;
  isClassifying: boolean;
  runAllAgents: (context: RunAgentsContext) => Promise<Record<AgentId, AgentState>>;
  resetAgents: () => void;
}

/** 에이전트 ID 목록 */
const AGENT_IDS: AgentId[] = [
  "precedent",
  "legal",
  "stt",
  "analysis",
  "docgen",
  "review",
];

/** 초기 에이전트 상태 생성 */
function createInitialAgentState(id: AgentId): AgentState {
  return {
    id,
    status: "idle",
    result: "",
  };
}

/** 전체 에이전트 초기 상태 */
function createInitialStates(): Record<AgentId, AgentState> {
  const states: Partial<Record<AgentId, AgentState>> = {};
  for (const id of AGENT_IDS) {
    states[id] = createInitialAgentState(id);
  }
  return states as Record<AgentId, AgentState>;
}

// ---------------------------------------------------------------------------
// 데모 모드 목(mock) 결과
// ---------------------------------------------------------------------------

/** 데모용 에이전트 결과 (각 에이전트별 현실적인 한국어 법률 분석 목 데이터) */
const DEMO_AGENT_RESULTS: Record<AgentId, string> = {
  precedent: `## 유사 판례 (3건)

### 1. 대법원 2019다234567 (매매대금 반환 청구)
- **판결 요지**: 매도인이 이중매매를 시도한 경우, 선의의 매수인은 계약 해제와 함께 손해배상을 청구할 수 있음
- **핵심 쟁점**: 이중매매에서 선의·악의 판단 기준, 손해배상의 범위
- **법원 판단**: 매도인의 이중매매 시도는 채무불이행에 해당하며, 매수인은 이행이익 상당의 손해배상을 청구할 수 있다
- **본 사건 시사점**: **유리** — 의뢰인이 잔금까지 지급한 상태에서 매도인의 이중매매 시도는 명백한 채무불이행

### 2. 대법원 2020다112233 (소유권이전등기 청구)
- **판결 요지**: 매매계약 체결 후 잔금 지급이 완료된 경우, 매수인은 소유권이전등기 청구권을 가짐
- **핵심 쟁점**: 잔금 지급 완료 후 소유권이전등기 이행 의무의 범위
- **법원 판단**: 잔금 지급은 매수인의 주된 의무 이행으로, 매도인에게 등기 이전 의무가 발생한다
- **본 사건 시사점**: **유리** — 잔금 1억 원 지급 완료 사실이 입증되면 소유권이전등기 청구에 유리

### 3. 서울고등법원 2021나445566 (부동산 이중매매 손해배상)
- **판결 요지**: 이중매매의 제2매수인이 매도인과 공모한 경우, 제2매수인에 대해서도 불법행위 손해배상 청구 가능
- **핵심 쟁점**: 제2매수인의 악의 입증 방법
- **법원 판단**: 시가보다 현저히 낮은 가격의 거래, 매도인과의 특수관계 등은 악의의 간접증거가 될 수 있다
- **본 사건 시사점**: **조건부 유리** — 제3자의 이중매매 가담 사실을 입증할 수 있다면 추가 손해배상 가능

## 판례 동향
최근 법원은 부동산 이중매매 사안에서 매수인 보호를 강화하는 경향을 보이고 있으며, 특히 잔금 지급 완료 후의 이중매매에 대해서는 매도인의 신의칙 위반을 적극적으로 인정하고 있습니다.

## 본 사건 적용 전략
1. 소유권이전등기 청구 소송과 처분금지 가처분 신청을 병행
2. 이중매매 시도에 대한 증거 확보 (등기부등본 변동, 부동산 중개업소 진술 등)
3. 이행이익 상당의 손해배상 병행 청구 검토`,

  legal: `## 적법성 검증 결과

### 1. 통신비밀보호법
- **판단**: **적법**
- 통신비밀보호법 제3조에 따라 대화 당사자 일방(변호사)이 상대방(의뢰인)의 동의를 받고 녹음하는 것은 합법입니다.
- 상담 시작 전 녹음 동의를 구했다면 법적 문제가 없습니다.
- **권고**: 녹음 시작 전 구두 동의를 녹음 파일에 포함시키는 것을 권장합니다.

### 2. 변호사법
- **판단**: **적법**
- 변호사법 제26조(비밀유지의무)에 따라, 상담 내용은 비밀로 유지되어야 합니다.
- AI 분석 과정에서 상담 내용이 외부로 유출되지 않도록 보안 조치가 필요합니다.
- **권고**: AI 처리된 데이터의 저장·관리에 대한 보안 정책을 수립하세요.

### 3. 개인정보보호법
- **판단**: **조건부 적법**
- 개인정보보호법 제15조에 따라 정보주체(의뢰인)의 동의 또는 법률에 근거가 필요합니다.
- 변호사-의뢰인 관계에서 법률 서비스 제공 목적의 개인정보 수집은 정당한 이익에 해당합니다.
- **권고**: 개인정보 수집·이용 동의서를 별도로 징구하는 것이 안전합니다.

### 4. 변호사윤리장전
- **판단**: **적법**
- 변호사윤리장전 제18조에 따라 의뢰인의 비밀을 엄수해야 합니다.
- AI 도구 활용 자체는 윤리장전에 위반되지 않으나, 비밀유지의무 준수가 전제됩니다.

### 5. 종합 판단
- **결론**: 의뢰인 동의하에 상담 녹음 및 AI 분석은 **적법**합니다.
- 다만, (1) 녹음 동의 확인, (2) 개인정보 동의서 징구, (3) 데이터 보안 관리를 반드시 이행해야 합니다.`,

  stt: `[00:00] 변호사: 안녕하세요, 박영수 님. 오늘 부동산 매매 관련해서 상담 요청하셨죠?

[00:15] 의뢰인: 네, 변호사님. 작년에 아파트를 계약했는데 매도인이 등기를 안 넘겨주고 있어서요.

[00:32] 변호사: 계약 시기와 금액을 먼저 확인할게요. 계약은 언제 하셨나요?

[00:40] 의뢰인: 2025년 3월에 계약하고 계약금 3천만 원을 입금했습니다. 총 매매대금은 2억 3천만 원이고요.

[01:02] 변호사: 중도금과 잔금은 언제 치르셨나요?

[01:10] 의뢰인: 중도금 1억 원은 5월에, 잔금 1억 원은 6월 30일에 지급 완료했습니다. 송금 영수증도 다 있습니다.

[01:30] 변호사: 잔금 지급 후에 매도인이 등기이전을 해주지 않는 건가요?

[01:38] 의뢰인: 네. 처음에는 이것저것 핑계를 대다가, 최근에 알게 됐는데 다른 사람한테도 팔려고 한다는 이야기를 들었습니다.

[01:55] 변호사: 이중매매 정황이 있다는 건가요? 어떻게 알게 되셨나요?

[02:05] 의뢰인: 같은 아파트 단지 부동산 중개사가 귀띔해줬어요. 매도인이 더 높은 가격으로 팔 수 있는 매수인을 찾고 있다고요.

[02:25] 변호사: 심각한 상황이네요. 등기부등본은 확인해보셨나요?

[02:32] 의뢰인: 아직 근저당 설정이나 다른 변동은 없는 것 같은데, 불안해서 바로 찾아온 겁니다.

[02:48] 변호사: 잘 오셨습니다. 우선 처분금지 가처분 신청을 먼저 하고, 소유권이전등기 청구 소송을 병행하는 것이 좋겠습니다.

[03:05] 의뢰인: 비용이랑 기간은 어느 정도 걸릴까요?

[03:12] 변호사: 가처분은 1~2주 내 결정이 나올 수 있고, 본안 소송은 6개월에서 1년 정도 예상됩니다. 비용은 인지대와 변호사 수임료를 합산해서 별도로 안내드리겠습니다.`,

  analysis: `## 핵심 쟁점 (3가지)

### 쟁점 1: 소유권이전등기 이행 청구권의 성립
- **설명**: 매수인이 잔금을 완납한 경우, 매도인에게 소유권이전등기 절차 이행을 청구할 수 있는지 여부
- **관련 법조문**: 민법 제568조(매매의 효력), 부동산등기법 제23조(등기신청의 원칙)
- **판단**: **유리** — 잔금 지급이 완료된 이상 매수인의 등기청구권은 확정적으로 발생함. 송금 영수증 등 지급 증빙이 있으므로 입증에 문제없음

### 쟁점 2: 이중매매 시도에 대한 법적 대응
- **설명**: 매도인이 제3자에게 이중매매를 시도하는 경우, 의뢰인이 취할 수 있는 보전처분 및 손해배상 청구 가능성
- **관련 법조문**: 민사집행법 제300조(가처분), 민법 제390조(채무불이행 손해배상), 민법 제750조(불법행위)
- **판단**: **유리** — 처분금지 가처분 신청으로 이중매매를 사전에 차단할 수 있으며, 이미 이중매매가 이루어진 경우에도 채무불이행 또는 불법행위에 기한 손해배상 청구 가능

### 쟁점 3: 손해배상의 범위
- **설명**: 매도인의 채무불이행으로 인한 손해배상 범위 — 이행이익인지 신뢰이익인지
- **관련 법조문**: 민법 제393조(손해배상의 범위), 민법 제394조(손해배상의 방법)
- **판단**: **조건부 유리** — 이행이익(시가 상승분)까지 배상받을 수 있으나, 시가 감정 등 추가 입증 필요

## 관련 판례 2건
1. **대법원 2018다265432**: 잔금 지급 완료 후 매도인의 등기이전 거부는 채무불이행에 해당하며, 매수인은 강제이행 또는 손해배상을 선택적으로 청구할 수 있다
2. **대법원 2020다114455**: 이중매매에 있어 제1매수인은 제2매수인에 대하여도 불법행위 손해배상을 청구할 수 있으며, 악의의 입증은 간접사실에 의할 수 있다

## 종합 의견
- **위험도**: 낮음 (의뢰인에게 유리한 사실관계)
- **권고 전략**: (1) 처분금지 가처분 긴급 신청 → (2) 소유권이전등기 청구 소송 → (3) 필요시 손해배상 병행
- **예상 기간**: 가처분 1~2주, 본안 소송 6개월~1년
- **예상 비용**: 인지대 약 50만 원, 송달료 약 5만 원, 변호사 수임료 별도`,

  docgen: JSON.stringify([
    { id: 1, question: "매매계약서 원본 또는 사본을 갖고 계신가요? 특약사항이 기재되어 있나요?", why: "계약 내용과 특약, 해제 조건 등을 정확히 파악해야 문서에 반영할 수 있습니다.", category: "증거확보", hints: ["매매계약서 사진 또는 스캔본을 첨부해 주세요", "특약사항 부분을 별도로 촬영하면 좋습니다"] },
    { id: 2, question: "잔금 지급 내역(계좌이체 확인서, 무통장입금증 등)을 확보하셨나요?", why: "대금 지급 사실을 입증하는 핵심 증거입니다. 금액, 일자, 수취인이 명확해야 합니다.", category: "증거확보", hints: ["은행 앱에서 이체내역 캡처", "통장 사본도 가능합니다"] },
    { id: 3, question: "매도인의 이중매매 시도를 어떻게 알게 되셨나요? 구체적인 정황이나 증거가 있나요?", why: "이중매매 정황은 매도인의 악의를 입증하는 중요 사실이므로 구체적 근거가 필요합니다.", category: "사실관계", hints: ["제3자의 진술, 부동산 등기부등본 변동, 중개사 증언 등", "녹음으로 상세히 설명해 주셔도 좋습니다"] },
    { id: 4, question: "매매계약 체결 정확한 날짜와 잔금 지급일, 소유권이전등기 약정일은 각각 언제인가요?", why: "이행지체 기간 산정, 지연이자 계산, 시효 확인에 필수적인 날짜입니다.", category: "사실관계", hints: ["계약서에 기재된 날짜를 정확히 확인", "기억나지 않으면 '약 O월 O일경'이라도 기재"] },
    { id: 5, question: "매도인에게 이행을 최고(催告)하거나 계약 해제를 통보한 적이 있나요? 서면(내용증명 등)으로 하셨나요?", why: "민법 제544조에 따른 이행 최고 절차 준수 여부가 계약 해제의 적법성을 좌우합니다.", category: "법리검토", hints: ["내용증명 사본이 있으면 첨부", "구두 통보만 했다면 일시와 내용을 기재"] },
    { id: 6, question: "해당 부동산의 정확한 주소와 등기부등본상 표시를 알려주세요.", why: "내용증명에 부동산을 특정하기 위해 등기부등본상 표시(소재지, 지번, 면적 등)가 필요합니다.", category: "사실관계", hints: ["등기부등본 발급(인터넷등기소)하여 첨부하면 가장 정확", "주소만이라도 기재해 주세요"] },
    { id: 7, question: "매도인의 정확한 성명, 주민등록번호(앞자리라도), 주소를 알고 계신가요?", why: "내용증명 수신인 특정과 향후 소송 시 피고 특정을 위해 반드시 필요합니다.", category: "절차확인", hints: ["계약서에 기재된 매도인 정보 확인", "주민번호 앞 6자리만이라도 확보"] },
    { id: 8, question: "의뢰인의 정확한 주소(주민등록상 주소)를 알려주세요.", why: "내용증명 발신인 주소로 기재되며, 향후 소송에서도 송달주소로 사용됩니다.", category: "절차확인", hints: ["주민등록등본 기준 주소", "실거주지가 다르면 둘 다 알려주세요"] },
    { id: 9, question: "매도인과의 대화 기록(카카오톡, 문자, 이메일 등)을 보관하고 계신가요?", why: "매도인의 이행 거부 의사, 이중매매 정황 등을 입증하는 보조 증거가 됩니다.", category: "증거확보", hints: ["카카오톡 대화 내보내기(텍스트 파일)로 저장", "주요 대화 부분 캡처"] },
    { id: 10, question: "이 사건에서 원하시는 결과가 무엇인가요? (계약 이행 요구 / 계약 해제 + 대금 반환 / 손해배상 등)", why: "의뢰인의 희망 방향에 따라 내용증명의 청구 취지와 법적 구성이 달라집니다.", category: "전략수립", hints: ["합의 우선인지, 소송 불사인지도 함께 알려주세요", "급한 정도(시급성)도 중요합니다"] },
  ]),

  review: `## 품질 평가 (5점 척도)

| 항목 | 점수 | 평가 |
|------|------|------|
| 형식 | ⭐⭐⭐⭐ (4/5) | 내용증명서의 기본 양식을 잘 갖추고 있으나, 통지인/피통지인 인적사항란의 세부 형식 보완 필요 |
| 법적 정확성 | ⭐⭐⭐⭐⭐ (5/5) | 민법 제568조, 제390조 등 관련 법조문 인용이 정확하며, 판례 법리에 부합 |
| 논리 구성 | ⭐⭐⭐⭐ (4/5) | 사실관계 → 법적 근거 → 요구사항의 논리 흐름이 명확하나, 이중매매 부분의 논증 보강 권장 |
| 설득력 | ⭐⭐⭐⭐ (4/5) | 전체적으로 설득력 있으나, 피통지인의 불이행에 따른 불이익을 보다 구체적으로 명시하면 효과적 |
| 완성도 | ⭐⭐⭐⭐ (4/5) | 실무에서 즉시 활용 가능한 수준이나, 아래 수정 제안 반영 시 완성도 향상 |

**종합 점수: 21/25 (84점)**

## 수정 제안 5가지

1. **이행 기한 구체화**: "상당한 기간 내" 대신 "본 통지서 도달일로부터 7일 이내"로 구체적 기한 명시 권장
2. **이중매매 경고 강화**: 이중매매 시 형사상 배임죄(형법 제355조 제2항) 성립 가능성도 함께 고지하여 심리적 압박 효과 강화
3. **손해배상 산정 근거 추가**: 현재 시가 감정가 또는 인근 실거래가를 인용하여 손해배상 예상 금액을 구체적으로 적시
4. **첨부 서류 목록 명시**: 매매계약서 사본, 잔금 지급 영수증 사본 등 첨부 서류를 문서 말미에 명시
5. **발송 방법 안내 추가**: 내용증명 우편 발송 외에 전자 내용증명 활용 가능성도 의뢰인에게 안내

## 추가 보강
- **증거자료**: 등기부등본, 부동산 중개업소의 이중매매 정황 확인서, 매도인과의 통화/문자 내역 확보
- **법리 보강**: 대법원 2019다234567 판례를 각주로 인용하여 이행이익 배상 논거 강화
- **상대방 반론 대응**: 매도인이 "잔금 수령 사실을 부인"할 가능성에 대비하여 계좌이체 확인서 공증 검토`,
};

/**
 * 데모 모드에서 에이전트 실행을 시뮬레이션합니다.
 * 각 에이전트마다 1~2초의 랜덤 지연 후 목(mock) 결과를 반환합니다.
 */
function runDemoAgent(agentId: AgentId): Promise<string> {
  const delayMs = 1000 + Math.random() * 1000; // 1~2초
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(DEMO_AGENT_RESULTS[agentId]);
    }, delayMs);
  });
}

// ---------------------------------------------------------------------------
// 실제 에이전트 실행 (Firebase/Claude 연동)
// ---------------------------------------------------------------------------

/**
 * 단일 에이전트 실행 (STT 에이전트 특수 처리 포함)
 */
async function runSingleAgent(
  agentId: AgentId,
  context: RunAgentsContext,
): Promise<string> {
  // 데모 모드: 목 데이터로 시뮬레이션
  if (isDemoMode) {
    return runDemoAgent(agentId);
  }

  // STT 에이전트: transcribeId가 있으면 RTZR 폴링, 없으면 Claude 폴백
  if (agentId === "stt" && context.transcribeId) {
    const POLL_INTERVAL = 3000; // 3초
    const MAX_POLLS = 120; // 최대 6분

    for (let i = 0; i < MAX_POLLS; i++) {
      const result = await pollTranscription(context.transcribeId);

      if (result.status === "completed" && result.utterances) {
        return formatTranscript(result.utterances);
      }

      if (result.status === "failed") {
        // RTZR 실패 시 Claude 폴백
        break;
      }

      // 다음 폴링 대기
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
    }

    // RTZR 실패 또는 시간 초과 -> Claude 폴백
    const prompt = buildPrompt("stt", context);
    return callClaude(prompt, "상담 대화록을 생성해 주세요.");
  }

  // 일반 에이전트: Claude API 호출
  // docgen 에이전트는 체크포인트 질문 생성 단계에서 docgen_questions 프롬프트 사용
  const promptId = agentId === "docgen" ? "docgen_questions" : agentId;
  const prompt = buildPrompt(promptId, context);

  const userMessage =
    agentId === "docgen"
      ? context.docType
        ? `"${context.docType}" 문서 작성 전 확인 사항을 JSON으로 제시해 주세요.`
        : "사건에 적합한 법률 문서 작성 전 확인 사항을 JSON으로 제시해 주세요."
      : `${context.clientName} 의뢰인의 사건에 대해 분석해 주세요.`;

  return callClaude(prompt, userMessage);
}

/**
 * 6개 AI 에이전트 병렬 실행 훅
 *
 * - 모든 에이전트를 Promise.allSettled로 병렬 실행
 * - 각 에이전트 진행 상태를 개별 추적
 * - STT 에이전트는 RTZR 폴링 -> 실패 시 Claude 폴백
 * - 데모 모드에서는 1~2초 지연 후 목(mock) 결과 반환
 */
export default function useAgents(): UseAgentsReturn {
  const [agents, setAgents] = useState<Record<AgentId, AgentState>>(
    createInitialStates,
  );
  const [isRunning, setIsRunning] = useState(false);
  const [currentStep, setCurrentStep] = useState<AgentStep>("idle");
  const [classifiedCaseType, setClassifiedCaseType] = useState<CaseType | null>(null);
  const [isClassifying, setIsClassifying] = useState(false);

  /** 특정 에이전트 상태 업데이트 */
  const updateAgent = useCallback(
    (id: AgentId, update: Partial<AgentState>) => {
      setAgents((prev) => ({
        ...prev,
        [id]: { ...prev[id], ...update },
      }));
    },
    [],
  );

  /** 모든 에이전트 초기화 */
  const resetAgents = useCallback(() => {
    setAgents(createInitialStates());
    setIsRunning(false);
    setCurrentStep("idle");
  }, []);

  /** 6개 에이전트 병렬 실행 */
  const runAllAgents = useCallback(
    async (
      context: RunAgentsContext,
    ): Promise<Record<AgentId, AgentState>> => {
      setIsRunning(true);
      setCurrentStep("running");

      // 모든 에이전트를 running 상태로 전환
      const runningStates = createInitialStates();
      for (const id of AGENT_IDS) {
        runningStates[id] = { id, status: "running", result: "" };
      }
      setAgents(runningStates);

      // 병렬 실행
      const promises = AGENT_IDS.map(async (agentId) => {
        try {
          const result = await runSingleAgent(agentId, context);
          const successState: AgentState = {
            id: agentId,
            status: "completed",
            result,
          };
          updateAgent(agentId, successState);
          return successState;
        } catch (err: unknown) {
          const errorMessage =
            err instanceof Error ? err.message : "알 수 없는 오류";
          const errorState: AgentState = {
            id: agentId,
            status: "error",
            result: "",
            error: errorMessage,
          };
          updateAgent(agentId, errorState);
          return errorState;
        }
      });

      const results = await Promise.allSettled(promises);

      // 최종 상태 구성
      const finalStates = { ...runningStates };
      results.forEach((result, index) => {
        const agentId = AGENT_IDS[index];
        if (result.status === "fulfilled") {
          finalStates[agentId] = result.value;
        } else {
          finalStates[agentId] = {
            id: agentId,
            status: "error",
            result: "",
            error: String(result.reason),
          };
        }
      });

      setAgents(finalStates);
      setIsRunning(false);

      // 하나라도 에러가 있으면 error, 아니면 completed
      const hasError = Object.values(finalStates).some(
        (s) => s.status === "error",
      );
      setCurrentStep(hasError ? "error" : "completed");

      // 에이전트 완료 후 사건 유형 자동 분류
      const analysisResult = finalStates.analysis?.result;
      if (analysisResult && !context.caseType) {
        setIsClassifying(true);
        try {
          if (isDemoMode) {
            // 데모 모드: 사건 개요에서 키워드로 유형 추정
            await new Promise((resolve) => setTimeout(resolve, 800));
            const desc = context.caseDesc;
            if (desc.includes("부동산") || desc.includes("매매") || desc.includes("등기")) {
              setClassifiedCaseType("부동산");
            } else if (desc.includes("이혼") || desc.includes("양육") || desc.includes("위자료")) {
              setClassifiedCaseType("가사");
            } else if (desc.includes("해고") || desc.includes("퇴직") || desc.includes("근로")) {
              setClassifiedCaseType("노동");
            } else if (desc.includes("채권") || desc.includes("채무") || desc.includes("대여금")) {
              setClassifiedCaseType("채권·채무");
            } else if (desc.includes("손해") || desc.includes("배상")) {
              setClassifiedCaseType("손해배상");
            } else if (desc.includes("고소") || desc.includes("피해") || desc.includes("형사")) {
              setClassifiedCaseType("형사");
            } else {
              setClassifiedCaseType("민사");
            }
          } else {
            const prompt = buildCaseTypeClassificationPrompt(context.caseDesc, analysisResult);
            const result = await callClaude(prompt, "이 사건의 유형을 분류해 주세요.");
            const trimmed = result.trim();
            const matched = CASE_TYPES.find((t) => trimmed.includes(t));
            setClassifiedCaseType(matched ?? "기타");
          }
        } catch {
          setClassifiedCaseType("기타");
        } finally {
          setIsClassifying(false);
        }
      }

      return finalStates;
    },
    [updateAgent],
  );

  return {
    agents,
    isRunning,
    currentStep,
    classifiedCaseType,
    isClassifying,
    runAllAgents,
    resetAgents,
  };
}
