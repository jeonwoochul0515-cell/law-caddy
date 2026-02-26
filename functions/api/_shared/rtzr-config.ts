// RTZR STT 전사 설정 (LAW-CADDY 전용)

export const RTZR_TRANSCRIBE_CONFIG = {
  model_name: "sommers",
  language: "ko",
  use_diarization: true,
  diarization: { spk_count: 2 },
  use_itn: true,
  use_disfluency_filter: true,
  use_profanity_filter: false,
  use_paragraph_splitter: true,
  paragraph_splitter: { max: 80 },
  domain: "GENERAL",
  keywords: [
    "내용증명", "소장", "답변서", "준비서면", "지급명령",
    "채권", "채무", "손해배상", "부당이득", "불법행위",
    "소멸시효", "제척기간", "가처분", "가압류", "강제집행",
    "고소장", "고발장", "피의자", "피해자", "공소시효",
    "이혼", "양육권", "위자료", "재산분할", "친권",
    "퇴직금", "해고", "부당해고", "산업재해", "근로기준법",
    "임대차", "전세", "보증금", "등기", "매매계약",
    "변호사", "의뢰인", "원고", "피고", "증거",
    "판결", "판례", "법원", "검찰", "경찰",
  ],
};
