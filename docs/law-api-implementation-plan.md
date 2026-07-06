# 법제처 API 최적화 + 허위 사건번호 검증 — 구현 플랜

> 리서치 결과를 기반으로, 문서 품질 향상 + 허위 판례 자동 검출을 구현하는 최종 플랜.

---

## Phase 1: 즉시 적용 (프론트엔드만 수정, 코드 변경 최소)

### 1-1. 판결요지 truncate 상향 (1,000→1,500자)

**파일**: `src/services/precedent-api.ts`  
**근거**: 판결요지 평균 3,305자에서 1,000자로 잘리면 [2] 이후 쟁점 논증이 소실됨.

```typescript
// 현재
parts.push(`   【판결요지】 ${truncate(p.summary, 1000)}`);
// 변경
parts.push(`   【판결요지】 ${truncate(p.summary, 1500)}`);
```

### 1-2. 판례내용 truncate 하향 (1,000→500자)

**파일**: `src/services/precedent-api.ts`  
**근거**: 판례내용 처음 1,000자는 당사자 표시/주문뿐. 토큰 낭비.

```typescript
// 현재
parts.push(`   【판례내용(발췌)】 ${truncate(p.content, 1000)}`);
// 변경
parts.push(`   【판례내용(발췌)】 ${truncate(p.content, 500)}`);
```

### 1-3. aiRltLs display 10→5 축소

**파일**: `src/hooks/useAgents.ts`  
**근거**: 5건 이후 노이즈 급증 (무관한 시행령 포함).

```typescript
// 현재
const relatedLaws = await searchRelatedLaws(keywords[0] ?? "손해배상", 10);
// 변경
const relatedLaws = await searchRelatedLaws(keywords[0] ?? "손해배상", 5);
```

---

## Phase 2: 허위 사건번호 검증 시스템

### 핵심 발견

- **대법원 포털 (portal.scourt.go.kr)**: WAF 차단으로 프로그래밍 접근 불가
- **법제처 API `nb` 파라미터**: 사건번호 검증에 매우 효과적

| 사건번호 | 결과 |
|---------|------|
| 2022다287284 (실제) | totalCnt=1, 정확 매칭 |
| 2099다999999 (가짜) | **totalCnt=0** |
| 1111다111111 (가짜) | **totalCnt=0** |

### 2-1. 검증 함수 구현

**파일**: `src/services/precedent-api.ts`에 추가

```typescript
/**
 * 사건번호가 실제 존재하는지 법제처 API로 검증합니다.
 * nb 파라미터로 검색 후 사건번호 정확 매칭 확인.
 */
export async function verifyCaseNumber(caseNumber: string): Promise<{
  verified: boolean;
  court?: string;
  caseName?: string;
  date?: string;
}> {
  if (!caseNumber.trim()) return { verified: false };
  try {
    const results = await searchLatestPrecedents(caseNumber, 5);
    // nb 대신 query로 검색 (프록시에 nb 파라미터 이미 지원)
    // 반환 결과에서 사건번호 정확 매칭 확인
    const match = results.find(r => 
      r.caseNumber.replace(/\s/g, "") === caseNumber.replace(/\s/g, "")
    );
    if (match) {
      return { verified: true, court: match.court, caseName: match.caseName, date: match.date };
    }
    return { verified: false };
  } catch {
    return { verified: false }; // 검증 실패해도 에러 아님
  }
}
```

### 2-2. 한판서 결과의 CaseRef 자동 검증

**파일**: `src/hooks/useAgents.ts` — CaseRef 파싱 후 검증 루프 추가

```typescript
// CaseRef 파싱 후
for (const ref of caseRefs) {
  try {
    const result = await verifyCaseNumber(ref.caseNumber);
    if (result.verified) {
      ref.source = "law.go.kr-verified";
      console.log(`[검증] ${ref.caseNumber}: ✅ 실존 확인 (${result.court})`);
    } else {
      ref.source = "unverified";
      console.warn(`[검증] ${ref.caseNumber}: ⚠️ 법제처 DB에서 미확인`);
    }
    await delay(300);
  } catch { /* continue */ }
}
```

### 2-3. 최감수 프롬프트에 검증 결과 전달

검증 결과를 최감수 프롬프트에 주입하여 가짜 판례를 명확히 제거:

```
[판례 검증 결과]
- 2022다287284: ✅ 실존 확인 (대법원, 2026.01.29)
- 2099다999999: ⛔ 법제처 DB 미확인 — 삭제 또는 "판례상 확립된 법리" 형태로 대체 권고
```

### 2-4. 한계 및 대응

| 한계 | 설명 | 대응 |
|------|------|------|
| 판례 DB만 검색 가능 | 일반 사건은 판례로 등록 안 됨 | "미확인"으로 표시 (가짜 단정 X) |
| nb가 부분 매칭 | "287284"만으로도 매칭됨 | 반환된 사건번호와 정확 비교 필수 |
| API 호출 추가 | CaseRef 건당 1회 API 호출 | 300ms 딜레이, 최대 5건 제한 |

---

## Phase 3: 법령해석례 상세 조회 추가

### 3-1. 윤율무에 법령해석례 상세 조회 추가

**현재 문제**: 검색(lawSearch)만 하고 상세 조회(lawService)를 안 해서 질의요지/회답/이유 미활용.

**파일**: `src/services/precedent-api.ts` + `src/hooks/useAgents.ts`

```typescript
// precedent-api.ts — 법령해석례 상세 조회 함수 추가
export async function getInterpretationDetail(serialNumber: string): Promise<{
  question: string;  // 질의요지
  answer: string;    // 회답
  reason: string;    // 이유
} | null>

// useAgents.ts — 윤율무 블록에 상세 조회 추가
if (interps.length > 0) {
  const detail = await getInterpretationDetail(interps[0].serialNumber);
  if (detail) {
    enrichedContext.legalInterpretations += `\n\n[상세 해석]\n질의: ${detail.question}\n회답: ${detail.answer}`;
  }
}
```

### 3-2. 윤율무에 aiSearch 추가

**현재**: law API는 법령 메타데이터만 반환 (조문 원문 없음).  
**개선**: aiSearch를 추가하여 관련 조문 원문 확보.

```typescript
// useAgents.ts — 윤율무 블록에 추가
const smartArticles = await searchSmartStatutes(keywords[0] ?? "법령", 3);
if (smartArticles.length > 0) {
  enrichedContext.statuteResults = (enrichedContext.statuteResults ?? "") + 
    `\n\n[관련 법조문 원문]\n${formatSmartArticlesForPrompt(smartArticles)}`;
}
```

---

## Phase 4: 참조판례 체인 추적 (Citation Chaining)

### 4-1. 한판서 상세 조회 후 참조판례 추적

**파일**: `src/hooks/useAgents.ts` — 한판서 블록

```typescript
// 상위 3건의 참조판례에서 사건번호 추출 → 추가 검색
for (const prec of top.slice(0, 2)) {
  if (!prec.refCases) continue;
  const refNumbers = extractCaseNumbers(prec.refCases); // 정규식 추출
  for (const refNum of refNumbers.slice(0, 2)) {
    if (seen.has(refNum)) continue;
    const refResults = await searchLatestPrecedents(refNum, 3);
    const match = refResults.find(r => r.caseNumber.includes(refNum));
    if (match && !seen.has(match.caseNumber)) {
      seen.add(match.caseNumber);
      allPrecedents.push(match);
      console.log(`[한판서] 참조판례 체인: ${refNum} 발견`);
    }
    await delay(300);
  }
}
```

### 4-2. extractCaseNumbers 유틸 함수

```typescript
// precedent-api.ts
export function extractCaseNumbers(refCasesHtml: string): string[] {
  const pattern = /(\d{2,4}[다도두부나마카타바사아자차파하]\d{1,8})/g;
  const matches = refCasesHtml.match(pattern) ?? [];
  return [...new Set(matches)];
}
```

---

## Phase 5: 검색 키워드 최적화

### 5-1. 2어절 키워드 보장

**근거**: 1어절=노이즈(2,842건), 2어절=정확(6건), 3어절=0건.

```typescript
// useAgents.ts — extractSearchKeywords 개선
// 기존: ["손해배상"]
// 개선: ["손해배상 불법행위", "손해배상 과실"]
// 2어절로 자동 조합
```

### 5-2. JO 파라미터 자동 활용

사건 유형에서 법률명을 추출하여 JO 파라미터로 전달:

```typescript
const CASE_TYPE_LAW_MAP: Record<string, string> = {
  "민사": "민법",
  "형사": "형법",
  "노동": "근로기준법",
  "가사": "민법",
  "행정": "행정소송법",
  "부동산": "주택임대차보호법",
};
```

---

## 파일별 수정 범위

| 파일 | Phase | 변경 내용 |
|------|-------|-----------|
| `src/services/precedent-api.ts` | 1,2,4 | truncate 조정 + verifyCaseNumber() + extractCaseNumbers() |
| `src/hooks/useAgents.ts` | 1,2,3,4,5 | aiRltLs 축소 + CaseRef 검증 + 법령해석 상세 + 체인 추적 + 키워드 |
| `src/services/prompts.ts` | 2 | 최감수에 검증 결과 주입 |
| `functions/api/precedent-search.ts` | - | 변경 없음 (이미 nb 지원) |

---

## 실행 순서

```
[Phase 1] truncate 조정 + aiRltLs 축소 (10분)
    ↓ 배포 & 테스트
[Phase 2] 허위 사건번호 검증 (30분)
    ↓ 배포 & 테스트
[Phase 3] 법령해석례 상세 + 윤율무 aiSearch (20분)
    ↓ 배포 & 테스트
[Phase 4] 참조판례 체인 추적 (20분)
    ↓ 배포 & 테스트
[Phase 5] 키워드 최적화 + JO 활용 (15분)
    ↓ 최종 테스트
```

---

## 검증 방법

### Phase 2 검증 (허위 사건번호)

콘솔에서 확인:
```
[검증] 2022다287284: ✅ 실존 확인 (대법원)
[검증] 2099다999999: ⚠️ 법제처 DB에서 미확인
```

### 전체 통합 테스트

| 체크 | 확인 방법 |
|------|----------|
| 판결요지 잘림 없음 | 한판서 결과에서 [2] 이후 쟁점도 포함되는지 |
| 가짜 판례 감지 | CaseRef에 source="unverified" 표시 |
| 법령해석례 활용 | 윤율무 결과에 질의요지/회답 포함 |
| 참조판례 체인 | 한판서 로그에 "참조판례 체인: XXXX 발견" |
| 연관법령 노이즈 감소 | 서혜안 로그에 5건 (이전 10건) |
