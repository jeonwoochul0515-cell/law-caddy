---
marp: true
theme: default
paginate: true
backgroundColor: #0B1120
color: #E8E0D0
style: |
  h1, h2, h3 { color: #C8A961; text-align: center; }
  h1 { font-size: 2.2em; margin-bottom: 0.5em; }
  h2 { font-size: 1.5em; margin-bottom: 0.8em; border-bottom: 2px solid rgba(200,169,97,0.3); padding-bottom: 0.5em; }
  p, li { font-size: 1.0em; line-height: 1.45; }
  .box { background: rgba(255,255,255,0.05); padding: 1.5em; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); margin-top: 1em; }
  img { border-radius: 8px; box-shadow: 0 10px 20px rgba(0,0,0,0.5); max-height: 340px; display: block; margin: 0 auto; object-fit: contain; }
  .flex-container { display: flex; gap: 20px; align-items: center; justify-content: space-between; }
  .col-text { flex: 1; }
  .col-img { flex: 1.2; text-align: center; }
  strong { color: #4ADE80; font-weight: bold; }
  em { color: #60A5FA; font-style: normal; font-weight: bold; }
---

# LAW-CADDY
## AI 기반 법률 문서 자동화 솔루션 활용 가이드

**법률 전문가를 위한 6개의 통합 AI 에이전트 시스템**
법률 상담 녹음 파일의 전사부터 판례 검색, 서면 초안 작성까지 통합 지원합니다.

---

## 1. 솔루션 개요: LAW-CADDY

LAW-CADDY는 법률 전문가의 업무 효율성 극대화를 위해 설계된 **B2B 법률 전문 SaaS**입니다. 단일 상담 녹음 파이프라인을 통해 소모적인 반복 업무 및 복잡한 분석 프로세스를 인공지능이 신속히 처리합니다.

<div class="box">
  <h3>🎙️ 녹음 및 업로드 → 🤖 병렬 분석 → 📄 서면 초안 자동 생성</h3>
  <ul>
    <li><strong>6개의 전문 AI 에이전트</strong>가 동시 투입되어 사실관계 및 법리적 쟁점을 분석합니다.</li>
    <li>담당 변호사는 <em>체크포인트(핵심 쟁점)</em> 검토만으로 완성도 높은 초안을 확보할 수 있습니다.</li>
    <li>진행 상황에 따른 <strong>의뢰인 안내용 결과 보고 메시지</strong>가 자동으로 생성됩니다.</li>
  </ul>
</div>

---

## 2. 서비스 접속 및 인증 (보안 로그인)

**인가된 법률 전문가를 위한 폐쇄형 보안 접속 시스템**
- 대한변호사협회 등록 변호사에 한해 가입 및 승인 대조 절차를 거친 후 서비스 이용이 가능합니다.

<div class="flex-container">
  <div class="col-text">
    <ul>
      <li>보안 강화를 위해 <strong>암호화된 이메일 계정 및 SSO(구글 로그인)</strong> 방식을 지원합니다.</li>
      <li>초회 로그인 시 변호사 등록번호 및 소속 법률 사무소 정보 기입이 요구됩니다.</li>
      <li>관리자의 교차 검증 및 승인 절차가 완료된 즉시 모든 기능을 활용하실 수 있습니다.</li>
    </ul>
  </div>
  <div class="col-img">
    <img src="docs/screenshots/landing.png" alt="랜딩 페이지" />
  </div>
</div>

---

## 3. 대시보드 (통합 업무 현황 모니터링)

**직관적인 업무 지표 및 수임 사건 통합 관리 뷰**

<div class="flex-container">
  <div class="col-text">
    <ul>
      <li>현재 <strong>진행 중인 사건 목록</strong>과 각 사건별 세부 진행 단계를 한눈에 파악할 수 있습니다.</li>
      <li>월별 누적 상담 건수, 문서 생성 지표 등 <em>핵심 성과 통계 대시보드</em>를 제공합니다.</li>
      <li>원클릭 퀵 액션을 통해 즉각적인 신규 상담 <strong>녹음 프로세스 개시</strong>가 가능합니다.</li>
    </ul>
  </div>
  <div class="col-img">
    <img src="docs/screenshots/dashboard.png" alt="대시보드 페이지" />
  </div>
</div>

---

## 4. 상담 녹음 파일 및 참고 문서 업로드

**음성 데이터 및 관련 문헌의 통합 섭취(Ingestion) 및 분석**

<div class="flex-container">
  <div class="col-text">
    <ul>
      <li><strong>실시간 녹음:</strong> 웹 환경에서 직접 상담 내용을 녹음 및 전송합니다.</li>
      <li><strong>음성 파일 업로드:</strong> 기 확보된 녹음 파일을 첨부하면, 고도화된 화자 분리 기술(RTZR STT) 기반으로 정밀한 대화록이 생성됩니다.</li>
      <li><strong>문서 첨부 (중요):</strong> 녹음 파일 외에도 의뢰인이 지참한 <em>기존 서면이나 반박 자료(소장, 준비서면 등)</em>를 병합 첨부하여 더욱 정교한 종합 법리 분석을 수행할 수 있습니다.</li>
    </ul>
  </div>
  <div class="col-img">
    <img src="docs/screenshots/record.png" alt="녹음 및 업로드" />
  </div>
</div>

---

## 5. 6개 AI 에이전트 병렬 분석 (자동화 센터)

**원클릭 동작으로 6개의 특화된 AI 에이전트가 병렬 프로세스를 개시합니다.**

<div class="flex-container">
  <div class="col-text">
    <ul style="font-size: 1.1em;">
      <li>1. 📚 <strong>판례 검색:</strong> 사안별 유사 판례 3건 도출 및 법적 시사점 분석</li>
      <li>2. ⚖️ <strong>적법성 검증:</strong> 통신비밀보호법, 변호사법 등 핵심 법령 준수 여부 사전 검토</li>
      <li>3. 🎙️ <strong>음성 변환:</strong> 고정밀 화자분리 기술이 적용된 대화 전사(Transcription)</li>
      <li>4. 🧠 <strong>쟁점 분석:</strong> 관련 규정 매핑 및 사건의 핵심 쟁점 3가지 도출</li>
      <li>5. 📄 <strong>초안 작성:</strong> 법리적 타당성을 갖춘 최종 법률 문서 초안 구축</li>
      <li>6. ✅ <strong>검토 감수:</strong> 기존 작성 방향의 논리성 및 완성도를 5점 척도로 정량화 평가</li>
    </ul>
  </div>
  <div class="col-img">
    <img src="docs/screenshots/agents.png" alt="에이전트 진행" />
  </div>
</div>

---

## 6. 체크포인트 (전문적 쟁점 확정)

**전문가의 법적 판단을 실시간으로 문서에 통합 반영하는 종단 절차**

<div class="flex-container">
  <div class="col-text">
    <ul>
      <li>AI가 서면을 본격적으로 생산하기 전, <em>결정적인 법적 쟁점 3~5가지</em>를 식별하여 질문 형태로 제시합니다.</li>
      <li>담당 변호사는 각 쟁점에 대하여 <strong>긍정(Yes), 부정(No), 부분적 수용(Partial)</strong>으로 확정 답변을 입력합니다.</li>
      <li>이러한 고도의 전문가 피드백을 기반으로, 의뢰인에게 가장 유리한 맞춤형 전략이 서면에 즉각 반영됩니다.</li>
    </ul>
  </div>
  <div class="col-img">
    <img src="docs/screenshots/checkpoint.png" alt="체크포인트 페이지" />
  </div>
</div>

---

## 7. 법률 문서 초안 자동 생성 방출

**업무 생산성 향상을 도모하는 원스톱 결과물 출력 및 관리**

<div class="flex-container">
  <div class="col-text">
    <ul>
      <li>확정된 논리를 바탕으로 생성된 문서 초안을 <strong>PDF 또는 Word(DOCX)</strong> 형식으로 즉시 다운로드할 수 있습니다.</li>
      <li><em>의뢰인 경과 보고 메시지:</em> 난해한 법률 용어를 일반인 시각에 맞춰 해설하고 진행 경과를 요약하는 메시지 텍스트가 자동 생성됩니다.</li>
      <li>내장된 웹 에디터를 활용하여 <strong>내부적인 추가 교정 및 보완 작업</strong>을 원활하게 수행할 수 있습니다.</li>
    </ul>
  </div>
  <div class="col-img">
    <img src="docs/screenshots/document.png" alt="문서 자동 페이지" />
  </div>
</div>

---

## 8. 맞춤형 계약서 자동 작성 (Contracts)

**다양한 실무 환경에 부합하는 민사/형사 표준 계약서 자동화 구성**

<div class="flex-container">
  <div class="col-text">
    <ul>
      <li>당사자 정보와 필수 계약 조건의 입력만으로 <strong>법률적 허점이 없는 표준 계약서 초안</strong>을 신속하게 생성합니다.</li>
      <li>민사(부동산, 금전소비대차 등) 및 형사(합의서 등) 영역 전반을 아우르는 <em>광범위한 템플릿</em>을 지원합니다.</li>
      <li>작성된 계약서는 플랫폼 내에서 즉각적인 수정 조율 및 다운로드가 가능하여 협상부터 종결까지의 리드타임을 단축합니다.</li>
    </ul>
  </div>
  <div class="col-img">
    <img src="docs/screenshots/document.png" alt="계약서 작성" />
  </div>
</div>

---

## 9. 사건 및 문서 수임 장부 (Cases)

**수임된 전체 사건 내역의 체계적인 DB 관리 및 이력 트래킹**

<div class="flex-container">
  <div class="col-text">
    <ul>
      <li>형사, 민사, 이혼 등 <em>송무 분야별 사건의 직관적인 아카이빙</em> 및 분류 검색 기능</li>
      <li>각 사건의 개시부터 종결까지 타임라인 기반의 히스토리 보존</li>
      <li>상대방 서면(소장, 준비서면 등)이 송달된 경우, 이를 업로드하여 <strong>AI가 논리를 분석하고 즉각적인 반박 서면을 작성</strong>하는 확장 모델을 제안합니다.</li>
    </ul>
  </div>
  <div class="col-img">
    <img src="docs/screenshots/cases.png" alt="사건 목록 관리" />
  </div>
</div>

---

## 10. 시스템 오류 및 통합 버그 리포트 창구 (Support)

**서비스 내 우측 하단 퀵 버튼을 통한 즉각적인 기술 지원 요청**

<div class="flex-container">
  <div class="col-text">
    <ul>
      <li>플랫폼 운용 중 버그가 확인되거나 기능 장애가 발생할 경우, 화면 우측 하단의 <strong>말풍선 아이콘(버그 리포트)</strong>을 클릭합니다.</li>
      <li>장애 상황을 간략히 기입하신 후 송신 버튼을 누르면, 오류 내용이 <em>개발팀 카카오톡 소통 채널로 즉각 접수</em>됩니다.</li>
      <li>이를 통해 실무 중단 지연을 최소화하고, 신속한 최우선 기술 지원을 확보하실 수 있습니다.</li>
    </ul>
  </div>
  <div class="col-img">
    <img src="image.png" alt="버그 리포트 사용법" />
  </div>
</div>
