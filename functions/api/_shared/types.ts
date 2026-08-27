export interface Env {
  RTZR_CLIENT_ID: string;
  RTZR_CLIENT_SECRET: string;
  ANTHROPIC_API_KEY: string;
  FIREBASE_PROJECT_ID: string;
  DATA_GO_KR_API_KEY: string;
  CLOVA_OCR_INVOKE_URL: string;
  CLOVA_OCR_SECRET: string;
  // Firebase 서비스 계정 (서버에서 Firestore REST API 호출 시 사용)
  // iCal 구독 엔드포인트(/api/ical/*) 등 토큰 기반 공개 엔드포인트에서 사용
  FIREBASE_CLIENT_EMAIL?: string;
  FIREBASE_PRIVATE_KEY?: string;
  // Toss Payments — /api/payment/confirm 에서 결제 승인 시 사용
  TOSS_SECRET_KEY: string;
  // SOLAPI — /api/notify/signup 에서 신규 가입 알림 문자 발송 시 사용
  SOLAPI_API_KEY: string;
  SOLAPI_API_SECRET: string;
  SOLAPI_SENDER_NUMBER: string;
  ADMIN_NOTIFY_PHONE: string;
  // 서비스 간 호출 토큰 — 법제처 자료 중계(/api/precedent-search)만 이 토큰으로 열린다.
  // 법제처 Open API는 도메인을 사전 등록해야 응답하므로 law-caddy가 유일한 창구다.
  INTERNAL_API_TOKEN?: string;
}
