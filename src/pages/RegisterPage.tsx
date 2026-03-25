// 구글 로그인으로 전환됨 — 기존 URL 호환용 리다이렉트
import { Navigate } from "react-router-dom";

export default function RegisterPage() {
  return <Navigate to="/login" replace />;
}
