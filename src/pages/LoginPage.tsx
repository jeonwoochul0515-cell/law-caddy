// 로그인 페이지 — 구글 로그인 결과에 따라 프로필 설정·승인 대기·대시보드로 보내고, 거절된 회원에게는 사유를 보여 준다
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import LoginForm from "../components/auth/LoginForm";
import useAuth from "../hooks/useAuth";

export default function LoginPage() {
  const navigate = useNavigate();
  const googleLogin = useAuth((s) => s.googleLogin);
  const logout = useAuth((s) => s.logout);
  const user = useAuth((s) => s.user);
  const [error, setError] = useState("");

  // 세션이 살아 있는 거절 회원 — 버튼을 다시 누르지 않아도 사유가 보인다
  const rejected =
    user?.profileCompleted && user.status === "rejected"
      ? { name: user.name, reason: user.rejectedReason }
      : null;

  const handleGoogleLogin = async () => {
    setError("");
    try {
      const result = await googleLogin();
      if (result.isNewUser) {
        navigate("/profile-setup");
      } else {
        const currentUser = useAuth.getState().user;
        // 프로필 미완성 → 프로필 설정으로
        if (!currentUser?.profileCompleted) {
          navigate("/profile-setup");
        } else if (currentUser?.status === "approved") {
          navigate("/dashboard");
        } else if (currentUser?.status === "pending") {
          navigate("/pending");
        }
        // rejected는 위 rejected 계산으로 화면이 바뀐다
      }
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("로그인에 실패했습니다. 잠시 뒤 다시 시도해 주세요.");
      }
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // 로그아웃 실패는 화면에 남을 이유가 없다 — 그대로 로그인 화면
    }
  };

  return (
    <LoginForm
      onGoogleLogin={handleGoogleLogin}
      error={error}
      rejected={rejected}
      onReapply={() => navigate("/profile-setup")}
      onLogout={handleLogout}
    />
  );
}
