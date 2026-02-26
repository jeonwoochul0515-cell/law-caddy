import { useNavigate } from "react-router-dom";
import PendingScreen from "../components/auth/PendingScreen";
import useAuth from "../hooks/useAuth";

export default function PendingPage() {
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <PendingScreen
      userName={user?.name ?? ""}
      onLogout={handleLogout}
    />
  );
}
