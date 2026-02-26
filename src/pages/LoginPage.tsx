import { useState } from "react";
import { useNavigate } from "react-router-dom";
import LoginForm from "../components/auth/LoginForm";
import useAuth from "../hooks/useAuth";

export default function LoginPage() {
  const navigate = useNavigate();
  const login = useAuth((s) => s.login);
  const [error, setError] = useState("");

  const handleLogin = async (email: string, password: string) => {
    setError("");
    try {
      const user = await login(email, password);
      if (user.status === "pending") {
        navigate("/pending");
      } else if (user.status === "approved") {
        navigate("/dashboard");
      } else {
        navigate("/pending");
      }
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("로그인에 실패했습니다.");
      }
    }
  };

  return <LoginForm onSubmit={handleLogin} error={error} />;
}
