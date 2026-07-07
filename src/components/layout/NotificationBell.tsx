// 헤더 알림 벨 — 기한·연체·서명·플랜 만료를 실시간 집계해 드롭다운으로 표시
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCircle2, Loader2 } from "lucide-react";
import useAuth from "../../hooks/useAuth";
import { isDemoMode } from "../../config/demo";
import {
  getNotifications,
  type NotificationItem,
  type NotificationSeverity,
} from "../../services/notifications";

const SEVERITY_DOT: Record<NotificationSeverity, string> = {
  urgent: "bg-red-500",
  warning: "bg-amber-500",
  info: "bg-emerald-500",
};

export default function NotificationBell() {
  const user = useAuth((s) => s.user);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 마운트 시 1회 집계 (뱃지 표시용), 드롭다운 열 때마다 갱신
  useEffect(() => {
    if (!user || isDemoMode) return;
    let canceled = false;

    Promise.resolve().then(() => {
      if (!canceled) setLoading(true);
    });
    getNotifications(user)
      .then((result) => {
        if (!canceled) setItems(result);
      })
      .catch(() => {
        // 집계 실패 시 뱃지 없이 조용히 넘어감
      })
      .finally(() => {
        if (!canceled) setLoading(false);
      });

    return () => {
      canceled = true;
    };
  }, [user, open]);

  // 바깥 클릭 시 닫기
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const urgentCount = items.filter((i) => i.severity === "urgent").length;
  const count = items.length;

  const handleItemClick = (item: NotificationItem) => {
    setOpen(false);
    navigate(item.link);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-lg p-2 text-text-dim transition-colors duration-200 hover:bg-surface-hover hover:text-text-primary"
        aria-label={count > 0 ? `알림 ${count}건` : "알림"}
        aria-expanded={open}
      >
        <Bell size={20} />
        {count > 0 && (
          <span
            className={`absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center ${
              urgentCount > 0 ? "bg-red-500" : "bg-amber-500"
            }`}
          >
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-h-[420px] overflow-y-auto rounded-xl border border-border bg-[#0f1729] shadow-2xl z-50">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-sm font-semibold text-text-primary">알림</p>
            <p className="text-xs text-text-dim mt-0.5">지금 주의가 필요한 항목</p>
          </div>

          {loading && items.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-text-dim">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-text-dim">
              <CheckCircle2 className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-sm">새 알림이 없습니다</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleItemClick(item)}
                  className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors"
                >
                  <span
                    className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${SEVERITY_DOT[item.severity]}`}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm text-text-primary truncate">
                      {item.title}
                    </span>
                    <span className="block text-xs text-text-dim mt-0.5">{item.detail}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
