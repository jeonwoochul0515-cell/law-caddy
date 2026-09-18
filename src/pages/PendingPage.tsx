// 승인 대기 페이지 — 사용자 문서를 다시 읽어 승인되면 대시보드로 보낸다 (버튼·탭 복귀 시)
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PendingScreen from "../components/auth/PendingScreen";
import useAuth from "../hooks/useAuth";

export default function PendingPage() {
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const refreshUser = useAuth((s) => s.refreshUser);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState("");

  const handleRefresh = useCallback(async (silent = false) => {
    setRefreshing(true);
    if (!silent) setRefreshMessage("");
    try {
      const fresh = await refreshUser();
      if (fresh?.status === "approved") {
        navigate("/dashboard", { replace: true });
        return;
      }
      if (fresh?.status === "rejected") {
        navigate("/login", { replace: true });
        return;
      }
      if (!silent) setRefreshMessage("아직 확인 중입니다. 확인이 끝나면 문자로도 알려 드립니다.");
    } catch {
      if (!silent) setRefreshMessage("상태를 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 다시 눌러 주세요.");
    } finally {
      setRefreshing(false);
    }
  }, [navigate, refreshUser]);

  // 다른 탭·앱에 갔다가 돌아오면 조용히 한 번 다시 읽는다 (승인 문자를 보고 돌아온 경우)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") handleRefresh(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [handleRefresh]);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <PendingScreen
      userName={user?.name ?? ""}
      noBusinessLicense={user?.noBusinessLicense}
      onLogout={handleLogout}
      onRefresh={() => handleRefresh(false)}
      refreshing={refreshing}
      refreshMessage={refreshMessage}
    />
  );
}
