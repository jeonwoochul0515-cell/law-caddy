// 사이드바 접기/펼치기 상태 관리 훅
// localStorage에 저장하고, 커스텀 이벤트로 컴포넌트 간 동기화

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "sidebar-collapsed";
const SYNC_EVENT = "sidebar-collapse-change";

export default function useSidebarCollapse() {
  const [isCollapsed, setIsCollapsed] = useState(() => {
    return localStorage.getItem(STORAGE_KEY) === "true";
  });

  const toggleSidebar = useCallback(() => {
    const next = !isCollapsed;
    setIsCollapsed(next);
    localStorage.setItem(STORAGE_KEY, String(next));
    // 다른 컴포넌트에 알림
    window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: next }));
  }, [isCollapsed]);

  // 다른 컴포넌트에서 보낸 이벤트 수신
  useEffect(() => {
    const handler = (e: Event) => {
      const custom = e as CustomEvent<boolean>;
      setIsCollapsed(custom.detail);
    };
    window.addEventListener(SYNC_EVENT, handler);
    return () => window.removeEventListener(SYNC_EVENT, handler);
  }, []);

  return { isCollapsed, toggleSidebar } as const;
}
