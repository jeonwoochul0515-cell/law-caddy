// 사건유형별 의뢰인 정보 수집 체크리스트 (정적 데이터, API 호출 없음)

export interface IntakeItem {
  label: string;
  required: boolean;
}

export interface IntakeCategory {
  category: string;
  items: IntakeItem[];
}

export const INTAKE_CHECKLISTS: Record<string, IntakeCategory[]> = {
  "민사": [
    {
      category: "당사자 정보",
      items: [
        { label: "원고 성명/주민등록번호/주소", required: true },
        { label: "피고 성명/주소 (송달 가능한 주소)", required: true },
        { label: "대리인 위임장 징구 여부", required: true },
      ],
    },
    {
      category: "사실관계",
      items: [
        { label: "분쟁 발생일 및 경위", required: true },
        { label: "계약서/약정서 존재 여부", required: true },
        { label: "금전 거래 내역 (이체 기록, 영수증)", required: true },
        { label: "증인 존재 여부", required: false },
        { label: "내용증명 발송/수령 이력", required: false },
      ],
    },
    {
      category: "증거자료",
      items: [
        { label: "계약서 원본/사본", required: true },
        { label: "통장거래내역", required: true },
        { label: "카카오톡/문자 대화 캡처", required: false },
        { label: "사진/영상 자료", required: false },
      ],
    },
  ],
  "형사": [
    {
      category: "피의자/피해자 정보",
      items: [
        { label: "피의자 성명/주민등록번호", required: true },
        { label: "피해자 성명/연락처", required: true },
        { label: "사건 관할 경찰서/검찰청", required: true },
      ],
    },
    {
      category: "사실관계",
      items: [
        { label: "범행 일시/장소", required: true },
        { label: "범행 경위 상세", required: true },
        { label: "피해 내용 및 금액", required: true },
        { label: "목격자/증인 유무", required: false },
        { label: "전과 이력", required: true },
      ],
    },
    {
      category: "증거자료",
      items: [
        { label: "고소장/고발장 사본", required: false },
        { label: "진단서 (상해 사건)", required: false },
        { label: "CCTV/블랙박스 영상", required: false },
        { label: "진술서/탄원서", required: false },
      ],
    },
  ],
  "가사": [
    {
      category: "당사자 정보",
      items: [
        { label: "부부 성명/주민등록번호", required: true },
        { label: "혼인신고일", required: true },
        { label: "자녀 성명/나이", required: true },
        { label: "현재 별거 여부 및 기간", required: true },
      ],
    },
    {
      category: "이혼 사유",
      items: [
        { label: "이혼 사유 상세 (부정행위/폭력/유기 등)", required: true },
        { label: "혼인파탄 경위 타임라인", required: true },
        { label: "상대방 귀책사유 증거", required: true },
      ],
    },
    {
      category: "재산/양육",
      items: [
        { label: "부부 공동재산 목록 (부동산, 예금, 보험)", required: true },
        { label: "각자 특유재산", required: false },
        { label: "양육권/친권 희망사항", required: true },
        { label: "양육비/위자료 희망 금액", required: true },
      ],
    },
  ],
  "행정": [
    {
      category: "처분 정보",
      items: [
        { label: "처분청 (행정기관명)", required: true },
        { label: "처분일자 및 처분 내용", required: true },
        { label: "처분 통지서/결정서 사본", required: true },
        { label: "행정심판 전치 여부", required: true },
      ],
    },
    {
      category: "사실관계",
      items: [
        { label: "처분 사유", required: true },
        { label: "이의신청/행정심판 경과", required: false },
        { label: "제소기한 확인 (처분 안 날로부터 90일)", required: true },
      ],
    },
  ],
  "노동": [
    {
      category: "근로관계",
      items: [
        { label: "회사명/대표자", required: true },
        { label: "입사일/퇴사일", required: true },
        { label: "근로계약서 사본", required: true },
        { label: "급여명세서 (최근 3개월)", required: true },
      ],
    },
    {
      category: "분쟁 내용",
      items: [
        { label: "해고 사유/경위", required: true },
        { label: "해고 통보 방식 (구두/서면)", required: true },
        { label: "미지급 임금/퇴직금 금액", required: false },
        { label: "노동위원회 구제신청 여부", required: false },
      ],
    },
  ],
  "부동산": [
    {
      category: "물건 정보",
      items: [
        { label: "부동산 소재지", required: true },
        { label: "등기부등본", required: true },
        { label: "매매/임대차 계약서", required: true },
        { label: "계약금/중도금/잔금 지급 내역", required: true },
      ],
    },
    {
      category: "분쟁 내용",
      items: [
        { label: "분쟁 유형 (매매/임대차/하자 등)", required: true },
        { label: "보증금/매매대금 금액", required: true },
        { label: "임대차 기간/갱신 여부", required: false },
        { label: "전입신고일/확정일자", required: false },
      ],
    },
  ],
  "채권·채무": [
    {
      category: "채권/채무 관계",
      items: [
        { label: "채권자/채무자 성명", required: true },
        { label: "채권 발생 원인 (대여/매매/용역 등)", required: true },
        { label: "원금/이자/지연손해금", required: true },
        { label: "변제기/이행기", required: true },
        { label: "담보 설정 여부", required: false },
      ],
    },
    {
      category: "증거자료",
      items: [
        { label: "차용증/약정서", required: true },
        { label: "이체 확인증/영수증", required: true },
        { label: "독촉 내역 (내용증명 등)", required: false },
        { label: "소멸시효 확인 (채권 발생일 기준)", required: true },
      ],
    },
  ],
  "손해배상": [
    {
      category: "사고/불법행위",
      items: [
        { label: "사고 일시/장소", required: true },
        { label: "가해자/피해자 정보", required: true },
        { label: "사고 경위 상세", required: true },
        { label: "경찰 사고 보고서/접수증", required: false },
      ],
    },
    {
      category: "손해 내역",
      items: [
        { label: "치료비 영수증/진단서", required: true },
        { label: "휴업손해 (소득 증빙)", required: false },
        { label: "향후 치료비 감정서", required: false },
        { label: "위자료 산정 근거", required: true },
        { label: "보험 가입 여부/보상 내역", required: false },
      ],
    },
  ],
};
