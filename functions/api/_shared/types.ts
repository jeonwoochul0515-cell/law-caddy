export interface Env {
  RTZR_CLIENT_ID: string;
  RTZR_CLIENT_SECRET: string;
  ANTHROPIC_API_KEY: string;
  FIREBASE_PROJECT_ID: string;
  CODEF_CLIENT_ID: string;
  CODEF_CLIENT_SECRET: string;
  CODEF_PUBLIC_KEY: string;
  DATA_GO_KR_API_KEY: string;
  CLOVA_OCR_INVOKE_URL: string;
  CLOVA_OCR_SECRET: string;
  // Firebase 서비스 계정 (서버에서 Firestore REST API 호출 시 사용)
  // iCal 구독 엔드포인트(/api/ical/*) 등 토큰 기반 공개 엔드포인트에서 사용
  FIREBASE_CLIENT_EMAIL?: string;
  FIREBASE_PRIVATE_KEY?: string;
}
