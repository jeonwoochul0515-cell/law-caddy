import { useState } from "react";
import { useNavigate } from "react-router-dom";
import LoginForm from "../components/auth/LoginForm";
import useAuth from "../hooks/useAuth";

export default function LoginPage() {
  const navigate = useNavigate();
  const googleLogin = useAuth((s) => s.googleLogin);
  const [error, setError] = useState("");

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
        } else if (currentUser?.status === "rejected") {
          setError("가입이 거부되었습니다. 관리자에게 문의하세요.");
        } else if (currentUser?.status === "pending") {
          navigate("/pending");
        }
      }
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("로그인에 실패했습니다.");
      }
    }
  };

  return <LoginForm onGoogleLogin={handleGoogleLogin} error={error} />;
}
