import { useState } from "react";
import {
  User as UserIcon,
  CreditCard,
  Info,
  Save,
  Lock,
  Loader2,
  Check,
  AlertCircle,
  Building,
  MapPin,
  FileCheck,
  BadgeCheck,
  Calendar,
  Copy,
  RefreshCw,
} from "lucide-react";
import AppLayout from "../components/layout/AppLayout";
import useAuth from "../hooks/useAuth";
import usePlanLimits from "../hooks/usePlanLimits";
import { isDemoMode } from "../config/demo";
import { PLANS } from "../config/constants";
import UsageSummary from "../components/payment/UsageSummary";
import PlanSelector from "../components/payment/PlanSelector";
import PaymentModal from "../components/payment/PaymentModal";
import {
  getOrCreateIcalToken,
  rotateIcalToken,
  type ICalTokenResponse,
} from "../services/icalApi";

export default function SettingsPage() {
  const user = useAuth((s) => s.user);
  const { plan, recordingsUsed, recordingsLimit, docsUsed, docsLimit } = usePlanLimits();
  const [tab, setTab] = useState<"profile" | "plan" | "system">("profile");

  // 프로필 편집
  const [editName, setEditName] = useState(user?.name ?? "");
  const [editFirmName, setEditFirmName] = useState(user?.firmName ?? "");
  const [editPhone, setEditPhone] = useState(user?.phone ?? "");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // 요금제 모달
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<{ id: string; name: string; price: string } | null>(null);

  // 비밀번호 변경
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // 캘린더 구독 (iCal)
  const [icalData, setIcalData] = useState<ICalTokenResponse | null>(null);
  const [icalLoading, setIcalLoading] = useState(false);
  const [icalRotating, setIcalRotating] = useState(false);
  const [icalMsg, setIcalMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [icalGuideTab, setIcalGuideTab] = useState<"google" | "apple" | "outlook">("google");
  const [icalCopied, setIcalCopied] = useState(false);

  const handleIcalShow = async () => {
    setIcalMsg(null);
    setIcalLoading(true);
    try {
      const data = await getOrCreateIcalToken();
      setIcalData(data);
    } catch (err) {
      setIcalMsg({
        type: "error",
        text: err instanceof Error ? err.message : "구독 URL을 불러오지 못했습니다.",
      });
    } finally {
      setIcalLoading(false);
    }
  };

  const handleIcalRotate = async () => {
    const confirmed = window.confirm(
      "기존 구독 URL은 즉시 무효화됩니다. 연결된 모든 캘린더에서 새 URL로 다시 구독해야 합니다. 계속하시겠어요?",
    );
    if (!confirmed) return;

    setIcalMsg(null);
    setIcalRotating(true);
    try {
      const data = await rotateIcalToken();
      setIcalData(data);
      setIcalMsg({ type: "success", text: "새 URL이 발급되었습니다. 기존 URL은 더 이상 동작하지 않습니다." });
    } catch (err) {
      setIcalMsg({
        type: "error",
        text: err instanceof Error ? err.message : "URL 재발급에 실패했습니다.",
      });
    } finally {
      setIcalRotating(false);
    }
  };

  const handleIcalCopy = async () => {
    if (!icalData) return;
    try {
      await navigator.clipboard.writeText(icalData.subscribeUrl);
      setIcalCopied(true);
      window.setTimeout(() => setIcalCopied(false), 2000);
    } catch {
      setIcalMsg({ type: "error", text: "클립보드 복사에 실패했습니다. 수동으로 복사해 주세요." });
    }
  };

  const handleProfileSave = async () => {
    if (!user) return;
    if (!editName.trim() || !editFirmName.trim()) {
      setProfileMsg({ type: "error", text: "이름과 사무소명을 입력해 주세요." });
      return;
    }

    setProfileSaving(true);
    setProfileMsg(null);
    try {
      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 500));
      } else {
        const { updateUserProfile } = await import("../services/firebase/auth");
        await updateUserProfile(user.uid, {
          name: editName.trim(),
          firmName: editFirmName.trim(),
          phone: editPhone.trim() || undefined,
        });
      }
      setProfileMsg({ type: "success", text: "프로필이 저장되었습니다." });
    } catch (err: unknown) {
      setProfileMsg({
        type: "error",
        text: err instanceof Error ? err.message : "프로필 저장에 실패했습니다.",
      });
    } finally {
      setProfileSaving(false);
    }
  };

  const handlePasswordChange = async () => {
    setPwMsg(null);
    if (!currentPw || !newPw || !confirmPw) {
      setPwMsg({ type: "error", text: "모든 필드를 입력해 주세요." });
      return;
    }
    if (newPw.length < 6) {
      setPwMsg({ type: "error", text: "새 비밀번호는 6자 이상이어야 합니다." });
      return;
    }
    if (newPw !== confirmPw) {
      setPwMsg({ type: "error", text: "새 비밀번호가 일치하지 않습니다." });
      return;
    }

    setPwSaving(true);
    try {
      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 500));
      } else {
        const { changePassword } = await import("../services/firebase/auth");
        await changePassword(currentPw, newPw);
      }
      setPwMsg({ type: "success", text: "비밀번호가 변경되었습니다." });
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
    } catch (err: unknown) {
      setPwMsg({
        type: "error",
        text: err instanceof Error ? err.message : "비밀번호 변경에 실패했습니다.",
      });
    } finally {
      setPwSaving(false);
    }
  };

  const tabs = [
    { key: "profile" as const, label: "프로필", icon: UserIcon },
    { key: "plan" as const, label: "요금제", icon: CreditCard },
    { key: "system" as const, label: "시스템 정보", icon: Info },
  ];

  const inputClass =
    "w-full px-4 py-2.5 bg-navy-light border border-border rounded-lg text-sm text-text-primary placeholder:text-text-dim/50 focus:border-gold/40 focus:outline-none transition-colors";

  return (
    <AppLayout title="설정" subtitle="계정 및 시스템 관리">
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              tab === t.key
                ? "bg-gold-dim text-gold border border-gold/30"
                : "bg-surface text-text-dim border border-border hover:border-border-hover"
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* 프로필 */}
      {tab === "profile" && user && (
        <div className="max-w-2xl space-y-6">
          {/* 기본 정보 편집 */}
          <div className="bg-surface border border-border rounded-2xl p-6">
            <h3 className="font-semibold text-text-primary mb-4">기본 정보</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-text-dim mb-1.5">이름</label>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm text-text-dim mb-1.5">법률사무소</label>
                <div className="relative">
                  <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim/50" />
                  <input
                    value={editFirmName}
                    onChange={(e) => setEditFirmName(e.target.value)}
                    className={`${inputClass} pl-9`}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-text-dim mb-1.5">연락처</label>
                <input
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="010-0000-0000"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm text-text-dim mb-1.5">이메일</label>
                <p className="px-4 py-2.5 text-sm text-text-dim bg-navy-light/50 border border-border rounded-lg">{user.email}</p>
              </div>
              <div>
                <label className="block text-sm text-text-dim mb-1.5">변호사 등록번호</label>
                <p className="px-4 py-2.5 text-sm text-text-dim bg-navy-light/50 border border-border rounded-lg font-mono">{user.barLicenseNumber}</p>
              </div>
            </div>

            {profileMsg && (
              <div className={`flex items-center gap-2 mt-4 px-3 py-2 rounded-lg text-sm ${
                profileMsg.type === "success"
                  ? "bg-success/10 text-success"
                  : "bg-error/10 text-error"
              }`}>
                {profileMsg.type === "success" ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                {profileMsg.text}
              </div>
            )}

            <button
              onClick={handleProfileSave}
              disabled={profileSaving}
              className="flex items-center gap-2 mt-4 px-5 py-2.5 bg-gradient-to-r from-gold to-gold-bright text-navy font-semibold rounded-lg text-sm hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {profileSaving ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> 저장 중...</>
              ) : (
                <><Save className="w-4 h-4" /> 저장</>
              )}
            </button>
          </div>

          {/* 사업자 정보 */}
          {user.businessNumber && (
            <div className="bg-surface border border-border rounded-2xl p-6">
              <h3 className="font-semibold text-text-primary mb-4 flex items-center gap-2">
                <FileCheck className="w-4 h-4" />
                사업자 정보
                {user.businessVerified && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-xs font-medium rounded-full">
                    <BadgeCheck className="w-3 h-3" /> 인증완료
                  </span>
                )}
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-text-dim">사업자등록번호</span>
                  <span className="text-text-primary font-mono">
                    {formatBizNum(user.businessNumber)}
                  </span>
                </div>
                {user.businessAddress && (
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-text-dim flex items-center gap-1"><MapPin className="w-3 h-3" /> 사업장 주소</span>
                    <span className="text-text-primary text-right max-w-[60%]">{user.businessAddress}</span>
                  </div>
                )}
                {user.businessType && (
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-text-dim">업태</span>
                    <span className="text-text-primary">{user.businessType}</span>
                  </div>
                )}
                {user.businessCategory && (
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-text-dim">종목</span>
                    <span className="text-text-primary">{user.businessCategory}</span>
                  </div>
                )}
                {user.businessStartDate && (
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-text-dim">개업일</span>
                    <span className="text-text-primary">{formatBizDate(user.businessStartDate)}</span>
                  </div>
                )}
                {user.businessLicenseUrl && (
                  <div className="flex justify-between py-2">
                    <span className="text-text-dim">등록증 원본</span>
                    <a
                      href={user.businessLicenseUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gold hover:text-gold-bright text-sm transition-colors"
                    >
                      이미지 보기
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 캘린더 자동 연동 (iCal 구독) */}
          <div className="bg-surface border border-border rounded-2xl p-6">
            <h3 className="font-semibold text-text-primary mb-2 flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              캘린더 자동 연동
            </h3>
            <p className="text-sm text-text-dim mb-4 leading-relaxed">
              법원 기일이 감지되면 Google / Apple / Outlook 캘린더에 자동으로 꽂힙니다.
              아래 URL을 캘린더 앱에 "구독"하세요. 새 기일이 잡히면 자동으로 반영됩니다.
            </p>

            {!icalData && (
              <button
                onClick={handleIcalShow}
                disabled={icalLoading}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-gold to-gold-bright text-navy font-semibold rounded-lg text-sm hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {icalLoading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> 불러오는 중...</>
                ) : (
                  <><Calendar className="w-4 h-4" /> 구독 URL 보기/생성</>
                )}
              </button>
            )}

            {icalData && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-text-dim mb-1.5">구독 URL</label>
                  <div className="flex items-stretch gap-2">
                    <input
                      readOnly
                      value={icalData.subscribeUrl}
                      onFocus={(e) => e.currentTarget.select()}
                      className="flex-1 min-w-0 px-3 py-2.5 bg-navy-light border border-border rounded-lg text-xs font-mono text-text-primary focus:border-gold/40 focus:outline-none"
                    />
                    <button
                      onClick={handleIcalCopy}
                      className="flex items-center gap-1.5 px-3 py-2.5 border border-border text-text-dim rounded-lg text-xs hover:border-gold/30 hover:text-gold transition-colors whitespace-nowrap"
                    >
                      {icalCopied ? (
                        <><Check className="w-3.5 h-3.5 text-success" /> 복사됨</>
                      ) : (
                        <><Copy className="w-3.5 h-3.5" /> 복사</>
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleIcalRotate}
                    disabled={icalRotating}
                    className="flex items-center gap-2 px-4 py-2 border border-border text-text-dim rounded-lg text-xs hover:border-red-500/40 hover:text-red-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {icalRotating ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> 재발급 중...</>
                    ) : (
                      <><RefreshCw className="w-3.5 h-3.5" /> URL 재발급</>
                    )}
                  </button>
                </div>

                {/* 캘린더별 연결 방법 */}
                <div className="border border-border rounded-lg overflow-hidden">
                  <div className="flex border-b border-border">
                    {(
                      [
                        { key: "google" as const, label: "Google" },
                        { key: "apple" as const, label: "Apple (iCloud)" },
                        { key: "outlook" as const, label: "Outlook" },
                      ]
                    ).map((t) => (
                      <button
                        key={t.key}
                        onClick={() => setIcalGuideTab(t.key)}
                        className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                          icalGuideTab === t.key
                            ? "bg-gold-dim text-gold"
                            : "text-text-dim hover:text-text-primary"
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <div className="p-4 text-xs text-text-dim leading-relaxed space-y-1.5">
                    {icalGuideTab === "google" && (
                      <>
                        <p className="text-text-primary font-medium">Google Calendar 연결</p>
                        <ol className="list-decimal list-inside space-y-1">
                          <li>calendar.google.com 접속</li>
                          <li>왼쪽 사이드바의 "다른 캘린더" 옆 [+] 버튼 클릭</li>
                          <li>"URL로 추가" 선택</li>
                          <li>위 구독 URL 붙여넣기 후 "캘린더 추가" 클릭</li>
                        </ol>
                      </>
                    )}
                    {icalGuideTab === "apple" && (
                      <>
                        <p className="text-text-primary font-medium">Apple Calendar (iCloud) 연결</p>
                        <ol className="list-decimal list-inside space-y-1">
                          <li>iPhone · iPad: 설정 &gt; 캘린더 &gt; 계정 &gt; 계정 추가 &gt; 기타 &gt; "구독 캘린더 추가"</li>
                          <li>Mac: 캘린더 앱 &gt; 파일 &gt; 새로운 캘린더 구독</li>
                          <li>위 구독 URL 붙여넣기</li>
                          <li>자동 업데이트 주기: "매일" 또는 "매시간" 권장</li>
                        </ol>
                      </>
                    )}
                    {icalGuideTab === "outlook" && (
                      <>
                        <p className="text-text-primary font-medium">Outlook 연결</p>
                        <ol className="list-decimal list-inside space-y-1">
                          <li>outlook.live.com 또는 Outlook 데스크탑 앱에서 캘린더 열기</li>
                          <li>"캘린더 추가" &gt; "웹에서 구독" 선택</li>
                          <li>위 구독 URL 붙여넣기 후 "가져오기" 클릭</li>
                        </ol>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {icalMsg && (
              <div className={`flex items-center gap-2 mt-4 px-3 py-2 rounded-lg text-sm ${
                icalMsg.type === "success"
                  ? "bg-success/10 text-success"
                  : "bg-error/10 text-error"
              }`}>
                {icalMsg.type === "success" ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                {icalMsg.text}
              </div>
            )}
          </div>

          {/* 비밀번호 변경 */}
          <div className="bg-surface border border-border rounded-2xl p-6">
            <h3 className="font-semibold text-text-primary mb-4 flex items-center gap-2">
              <Lock className="w-4 h-4" />
              비밀번호 변경
            </h3>
            <div className="space-y-3 max-w-md">
              <div>
                <label className="block text-sm text-text-dim mb-1.5">현재 비밀번호</label>
                <input
                  type="password"
                  value={currentPw}
                  onChange={(e) => setCurrentPw(e.target.value)}
                  placeholder="현재 비밀번호 입력"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm text-text-dim mb-1.5">새 비밀번호</label>
                <input
                  type="password"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  placeholder="6자 이상"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm text-text-dim mb-1.5">새 비밀번호 확인</label>
                <input
                  type="password"
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  placeholder="새 비밀번호 다시 입력"
                  className={inputClass}
                />
              </div>
            </div>

            {pwMsg && (
              <div className={`flex items-center gap-2 mt-4 px-3 py-2 rounded-lg text-sm ${
                pwMsg.type === "success"
                  ? "bg-success/10 text-success"
                  : "bg-error/10 text-error"
              }`}>
                {pwMsg.type === "success" ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                {pwMsg.text}
              </div>
            )}

            <button
              onClick={handlePasswordChange}
              disabled={pwSaving}
              className="flex items-center gap-2 mt-4 px-5 py-2.5 border border-border text-text-dim rounded-lg text-sm hover:border-gold/30 hover:text-gold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {pwSaving ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> 변경 중...</>
              ) : (
                <><Lock className="w-4 h-4" /> 비밀번호 변경</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* 요금제 */}
      {tab === "plan" && (
        <div className="max-w-5xl space-y-6">
          <UsageSummary
            plan={plan}
            recordingsUsed={recordingsUsed}
            recordingsLimit={recordingsLimit}
            docsUsed={docsUsed}
            docsLimit={docsLimit}
          />
          <PlanSelector
            currentPlan={user?.plan ?? "free"}
            onSelectPlan={(planId) => {
              const found = PLANS.find((p) => p.id === planId);
              if (found) {
                setSelectedPlan({ id: found.id, name: found.name, price: found.price });
                setShowPaymentModal(true);
              }
            }}
          />
          <PaymentModal
            isOpen={showPaymentModal}
            onClose={() => {
              setShowPaymentModal(false);
              setSelectedPlan(null);
            }}
            planId={selectedPlan?.id ?? ""}
            planName={selectedPlan?.name ?? ""}
            planPrice={selectedPlan?.price ?? ""}
          />
        </div>
      )}

      {/* 시스템 정보 */}
      {tab === "system" && (
        <div className="max-w-2xl space-y-6">
          <div className="bg-surface border border-border rounded-2xl p-6">
            <h3 className="font-semibold text-text-primary mb-4">시스템 정보</h3>
            <div className="space-y-3 text-sm">
              {[
                ["서비스", "LAW-CADDY v1.0"],
                ["AI 모델", "Claude claude-sonnet-4-20250514"],
                ["STT 엔진", "RTZR Sommers (한국어)"],
                ["프레임워크", "React 18 + TypeScript + Vite"],
                ["백엔드", "Firebase (Auth + Firestore + Storage)"],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between py-2 border-b border-border last:border-0">
                  <span className="text-text-dim">{label}</span>
                  <span className="text-text-primary">{value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-surface border border-border rounded-2xl p-6">
            <h3 className="font-semibold text-text-primary mb-4">계정 정보</h3>
            <div className="space-y-3 text-sm">
              {[
                ["계정 상태", user?.status === "approved" ? "활성" : user?.status ?? "-"],
                ["역할", user?.role === "admin" ? "관리자" : "변호사"],
                ["요금제", PLANS.find((p) => p.id === user?.plan)?.name ?? user?.plan ?? "-"],
                ["가입일", user?.createdAt?.toDate?.() ? user.createdAt.toDate().toLocaleDateString("ko-KR") : "-"],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between py-2 border-b border-border last:border-0">
                  <span className="text-text-dim">{label}</span>
                  <span className="text-text-primary">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}

/** 사업자등록번호 포맷 (000-00-00000) */
function formatBizNum(num: string): string {
  const clean = num.replace(/\D/g, "");
  if (clean.length !== 10) return num;
  return `${clean.slice(0, 3)}-${clean.slice(3, 5)}-${clean.slice(5)}`;
}

/** 사업자 개업일 포맷 (YYYYMMDD → YYYY.MM.DD) */
function formatBizDate(date: string): string {
  const clean = date.replace(/\D/g, "");
  if (clean.length !== 8) return date;
  return `${clean.slice(0, 4)}.${clean.slice(4, 6)}.${clean.slice(6)}`;
}
