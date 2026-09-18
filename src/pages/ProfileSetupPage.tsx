// 프로필 설정 페이지 — 사업자등록증 OCR로 정보를 채우고, 변호사업이 안 읽혀도 승인 대기로 접수한다
import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import useAuth from "../hooks/useAuth";
import { KAKAO_CHANNEL_CHAT } from "../config/contact";
import { SupportLinks } from "../components/auth/LoginForm";

interface OcrResult {
  businessNumber: string;
  companyName: string;
  representativeName: string;
  address: string;
  startDate: string;
  businessType: string;
  businessCategory: string;
  corporateNumber?: string;
  taxOffice?: string;
  taxType?: string;
  officePhone?: string;
  confidence: "high" | "medium" | "low";
}

type VerifyStatus = "idle" | "uploading" | "ocr" | "verifying" | "verified" | "failed" | "unverified";

/** 휴대폰 번호 자동 하이픈 (010-1234-5678 / 011-123-4567) */
function formatMobile(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

/** 서버·OCR 오류 원문을 사람 말로 바꾼다 (CLOVA·HTTP 번호가 그대로 보이지 않게) */
function friendlyOcrError(message: string): string {
  if (/HTTP 401|토큰|인증 실패/.test(message)) {
    return "로그인이 풀렸습니다. 아래 '다른 계정으로 로그인'을 눌러 다시 로그인해 주세요.";
  }
  if (/HTTP 429/.test(message)) {
    return "잠시 요청이 몰렸습니다. 1분 뒤 '다시 읽기'를 눌러 주세요.";
  }
  if (/HTTP 5\d\d|설정이 되어있지|CLOVA/.test(message)) {
    return "글자를 읽는 서비스가 잠시 응답하지 않습니다. 잠시 뒤 '다시 읽기'를 누르거나, 그대로 제출하시면 담당자가 직접 확인합니다.";
  }
  if (/텍스트를 추출할 수 없|인식할 수 없/.test(message)) {
    return "사업자등록증 글자를 읽지 못했습니다. 더 선명한 사진으로 다시 올리거나, 그대로 제출하시면 담당자가 직접 확인합니다.";
  }
  if (/network|fetch|offline/i.test(message)) {
    return "인터넷 연결이 끊겨 읽지 못했습니다. 연결을 확인한 뒤 '다시 읽기'를 눌러 주세요.";
  }
  return "사업자등록증을 읽는 중 문제가 생겼습니다. '다시 읽기'를 누르거나, 그대로 제출하시면 담당자가 직접 확인합니다.";
}

/** 제출(저장) 오류 원문을 사람 말로 */
function friendlySubmitError(message: string): string {
  if (/permission|insufficient/i.test(message)) {
    return "저장 권한 문제로 접수되지 않았습니다. 새로고침 후 다시 시도하시고, 계속 안 되면 카카오톡으로 알려 주세요.";
  }
  if (/storage\/|upload/i.test(message)) {
    return "사업자등록증 파일을 올리지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.";
  }
  if (/network|offline|unavailable/i.test(message)) {
    return "인터넷 연결이 끊겼습니다. 연결을 확인한 뒤 다시 시도해 주세요.";
  }
  return message;
}

export default function ProfileSetupPage() {
  const navigate = useNavigate();
  const completeProfile = useAuth((s) => s.completeProfile);
  const newGoogleUser = useAuth((s) => s.newGoogleUser);
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);

  const displayEmail = newGoogleUser?.email || user?.email || "";
  const isReapply = user?.status === "rejected";

  const [form, setForm] = useState({
    name: user?.name || newGoogleUser?.displayName || "",
    firmName: user?.firmName || "",
    barLicenseNumber: user?.barLicenseNumber || "",
    phone: user?.phone ? formatMobile(user.phone) : "",
    officePhone: user?.officePhone || "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [privacyConsented, setPrivacyConsented] = useState(false);
  const [showPrivacyDetail, setShowPrivacyDetail] = useState(false);
  /** 법무법인·합동사무소 소속이라 본인 명의 사업자등록증이 없는 경우 */
  const [noBusinessLicense, setNoBusinessLicense] = useState(user?.noBusinessLicense ?? false);

  const [businessFile, setBusinessFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null);
  const [verifyStatus, setVerifyStatus] = useState<VerifyStatus>("idle");
  const [verifyMessage, setVerifyMessage] = useState("");
  const [businessVerified, setBusinessVerified] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === "phone") {
      setForm((prev) => ({ ...prev, phone: formatMobile(value) }));
      return;
    }
    if (name === "barLicenseNumber") {
      setForm((prev) => ({ ...prev, barLicenseNumber: value.replace(/\D/g, "").slice(0, 6) }));
      return;
    }
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const processFile = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      setError("파일 크기는 10MB 이하여야 합니다.");
      return;
    }
    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      setError("이미지 파일(JPG, PNG) 또는 PDF만 올릴 수 있습니다. 아이폰 사진(HEIC)은 설정에서 '호환성 우선'으로 바꾸거나 스크린샷으로 올려 주세요.");
      return;
    }

    setBusinessFile(file);
    setError("");
    setVerifyStatus("uploading");

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }

    if (file.type.startsWith("image/")) {
      setPreviewUrl(URL.createObjectURL(file));
    }

    await runOcr(file);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processFile(file);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) await processFile(file);
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const runOcr = async (file: File) => {
    setVerifyStatus("ocr");
    setVerifyMessage("사업자등록증을 읽는 중입니다…");

    try {
      const { ocrBusinessLicense } = await import("../services/business-verify");
      const result = await ocrBusinessLicense(file);
      setOcrResult(result);

      // OCR 결과로 폼 자동 채움 — 비어 있는 칸만 채운다(이미 적은 값은 지키고, 아래에서 고칠 수 있다)
      setForm((prev) => ({
        ...prev,
        name: prev.name || result.representativeName,
        firmName: prev.firmName || result.companyName,
        officePhone: prev.officePhone || result.officePhone || "",
      }));

      if (result.confidence === "low") {
        setVerifyStatus("failed");
        setBusinessVerified(false);
        setVerifyMessage("사업자등록증 글자가 거의 읽히지 않았습니다. 더 선명한 사진으로 다시 올리거나, 그대로 제출하시면 담당자가 직접 확인합니다.");
        return;
      }

      await runVerify(result);
    } catch (err) {
      setVerifyStatus("failed");
      setBusinessVerified(false);
      setVerifyMessage(friendlyOcrError(err instanceof Error ? err.message : ""));
    }
  };

  const isLawyerBusiness = (ocr: OcrResult): boolean => {
    const keywords = ["변호사", "법률", "법무"];
    const target = `${ocr.businessType || ""} ${ocr.businessCategory || ""}`.toLowerCase();
    return keywords.some((kw) => target.includes(kw));
  };

  const runVerify = async (ocr: OcrResult) => {
    if (isLawyerBusiness(ocr)) {
      setVerifyStatus("verified");
      setBusinessVerified(true);
      setVerifyMessage("변호사업 사업자등록이 확인되었습니다. 제출하면 바로 시작됩니다.");

      try {
        const { verifyBusinessNumber } = await import("../services/business-verify");
        const result = await verifyBusinessNumber(ocr.businessNumber, ocr.startDate, ocr.representativeName);
        if (result.verified) {
          setVerifyMessage("변호사업 사업자등록이 확인되었고, 국세청 조회에서도 영업 중으로 나옵니다. 제출하면 바로 시작됩니다.");
        }
      } catch {
        // 국세청 확인 실패해도 OCR 기반 승인 유지
      }
      return;
    }

    setVerifyStatus("unverified");
    setBusinessVerified(false);
    setVerifyMessage("업태·종목에서 변호사업이 읽히지 않았습니다. 그대로 제출하시면 담당자가 사업자등록증을 직접 보고 영업일 1일 안에 확인합니다.");
  };

  const handleRetry = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setBusinessFile(null);
    setPreviewUrl(null);
    setOcrResult(null);
    setVerifyStatus("idle");
    setVerifyMessage("");
    setBusinessVerified(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  /** 같은 파일로 글자 읽기만 다시 시도 */
  const handleReadAgain = async () => {
    if (!businessFile) return;
    setError("");
    await runOcr(businessFile);
  };

  const handleToggleNoLicense = (checked: boolean) => {
    setNoBusinessLicense(checked);
    setError("");
    if (checked) handleRetry();
  };

  const ocrInProgress = verifyStatus === "ocr" || verifyStatus === "verifying" || verifyStatus === "uploading";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!noBusinessLicense && !businessFile) {
      setError("사업자등록증을 올려 주세요. 본인 명의 사업자등록증이 없으면 아래 '사업자등록증이 없습니다'에 표시해 주세요.");
      return;
    }
    if (!form.name.trim()) {
      setError("변호사 이름을 적어 주세요.");
      return;
    }
    if (!form.firmName.trim()) {
      setError("사무소 이름을 적어 주세요. 소속 변호사는 소속 법무법인·사무소 이름을 적으시면 됩니다.");
      return;
    }
    const bar = form.barLicenseNumber.trim();
    if (!/^\d{3,6}$/.test(bar)) {
      setError("변호사 등록번호는 숫자 3~6자리입니다. 변호사 신분증(대한변호사협회)의 등록번호를 적어 주세요.");
      return;
    }
    const phoneDigits = form.phone.replace(/\D/g, "");
    if (!/^01[016789]\d{7,8}$/.test(phoneDigits)) {
      setError("휴대폰 번호는 010으로 시작하는 10~11자리 숫자로 적어 주세요. 승인 안내 문자가 이 번호로 갑니다.");
      return;
    }
    if (!privacyConsented) {
      setError("개인정보 수집·이용에 동의해 주세요.");
      return;
    }

    setLoading(true);
    try {
      await completeProfile({
        name: form.name.trim(),
        firmName: form.firmName.trim(),
        barLicenseNumber: bar,
        phone: form.phone.trim(),
        officePhone: form.officePhone.trim() || undefined,
        privacyConsented,
        businessNumber: ocrResult?.businessNumber,
        businessVerified: noBusinessLicense ? false : businessVerified,
        businessLicenseFile: noBusinessLicense ? undefined : businessFile ?? undefined,
        businessAddress: ocrResult?.address,
        businessType: ocrResult?.businessType,
        businessCategory: ocrResult?.businessCategory,
        businessStartDate: ocrResult?.startDate,
        businessCorporateNumber: ocrResult?.corporateNumber,
        businessTaxOffice: ocrResult?.taxOffice,
        businessTaxType: ocrResult?.taxType,
        noBusinessLicense,
      });

      // 상태 업데이트 후 라우트 가드가 자동으로 리다이렉트
      // RequireProfileSetup → /dashboard 또는 /pending
      // 가드 반영이 안 될 경우 대비 fallback
      setTimeout(() => {
        const currentUser = useAuth.getState().user;
        if (currentUser?.profileCompleted) {
          if (currentUser.status === "approved") {
            window.location.replace("/dashboard");
          } else {
            window.location.replace("/pending");
          }
        }
      }, 500);
    } catch (err) {
      setError(friendlySubmitError(err instanceof Error ? err.message : "프로필 설정에 실패했습니다."));
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const statusColor: Record<VerifyStatus, string> = {
    idle: "",
    uploading: "text-[#43655c]",
    ocr: "text-[#43655c]",
    verifying: "text-[#2e6242]",
    verified: "text-[#2d6a4f]",
    failed: "text-[#ba1a1a]",
    unverified: "text-[#735c00]",
  };

  // 16px 이상이어야 아이폰에서 입력칸을 눌러도 화면이 확대되지 않는다
  const inputClass =
    "w-full min-h-[48px] px-4 py-3 text-base bg-white border border-[#14392b]/8 rounded-lg text-[#1e2a22] placeholder-[#414846]/50 focus:border-[#2e6242] focus:outline-none transition-colors";

  // 제출은 언제나 열려 있다 — 단, 글자를 읽는 중이거나 동의 전에는 막는다
  const submitDisabled = loading || ocrInProgress || !privacyConsented || (!noBusinessLicense && !businessFile);

  const submitLabel = noBusinessLicense || (!businessVerified && businessFile)
    ? "신청하기 (담당자 확인 후 이용)"
    : "프로필 설정 완료";

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f7f5ec] px-4 py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-serif italic text-[#14392b] mb-2">Law-Caddy</h1>
          <p className="text-[#414846]">변호사 프로필 설정</p>
          {displayEmail && (
            <p className="text-sm text-[#414846] mt-1">{displayEmail}</p>
          )}
        </div>

        <div className="bg-[#ede7d8]/50 border border-[#14392b]/8 rounded-2xl p-6 sm:p-8 backdrop-blur-sm">
          <h2 className="text-xl font-semibold text-[#1e2a22] mb-2">
            {isReapply ? "다시 신청하기" : "프로필 설정"}
          </h2>
          <p className="text-sm text-[#414846] mb-3">
            사업자등록증을 올리면 정보가 자동으로 채워집니다. 잘못 읽힌 값은 아래에서 고칠 수 있습니다.
          </p>
          <p className="text-sm text-[#414846] bg-[#f7f5ec] border border-[#14392b]/8 rounded-lg px-3 py-2 mb-6 leading-relaxed">
            앞으로 <span className="font-medium text-[#1e2a22]">{displayEmail || "이 구글 계정"}</span>으로 로그인합니다.
            사무실 계정으로 바꾸려면 맨 아래 '다른 계정으로 로그인'을 먼저 눌러 주세요. 나중에는 바꿀 수 없습니다.
          </p>

          {isReapply && (
            <div className="bg-[#735c00]/8 border border-[#735c00]/25 rounded-lg p-3 mb-4 text-sm text-[#1e2a22] leading-relaxed">
              <p className="font-medium mb-1">이전 신청이 승인되지 않았습니다.</p>
              <p className="whitespace-pre-wrap">{user?.rejectedReason?.trim() || "사유는 카카오톡 문의로 안내드립니다."}</p>
              <p className="mt-1 text-[#414846]">아래 내용을 고쳐 다시 제출하면 담당자가 다시 확인합니다.</p>
            </div>
          )}

          {error && (
            <div role="alert" className="bg-[#ba1a1a]/8 border border-[#ba1a1a]/20 rounded-lg p-3 mb-4 text-[#ba1a1a] text-sm leading-relaxed">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* 사업자등록증 업로드 */}
            {!noBusinessLicense && (
            <div>
              <label className="block text-sm text-[#414846] mb-2">
                사업자등록증 <span className="text-[#2e6242]">*</span>
              </label>

              {!businessFile ? (
                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
                    dragOver ? "border-[#2e6242] bg-[#2e6242]/5" : "border-[#14392b]/8 hover:border-[#2e6242]/40"
                  }`}
                >
                  <div className="text-3xl mb-3 opacity-60">📄</div>
                  <p className="text-sm text-[#414846] mb-1">사업자등록증을 끌어다 놓거나</p>
                  <p className="text-sm text-[#414846]/70 mb-4">촬영 또는 파일을 선택하세요</p>
                  <div className="flex gap-3 justify-center">
                    <label className="cursor-pointer min-h-[44px] px-4 py-2.5 bg-[#ede7d8] border border-[#14392b]/8 rounded-lg text-sm text-[#1e2a22] hover:border-[#2e6242]/40 transition-colors flex items-center gap-2">
                      <span>📷</span> 촬영
                      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleFileSelect} className="hidden" />
                    </label>
                    <label className="cursor-pointer min-h-[44px] px-4 py-2.5 bg-gradient-to-r from-[#2e6242]/15 to-[#14392b]/15 border border-[#2e6242]/30 rounded-lg text-sm text-[#2e6242] hover:from-[#2e6242]/25 hover:to-[#14392b]/25 transition-colors flex items-center gap-2">
                      <span>📁</span> 파일 선택
                      <input ref={fileInputRef} type="file" accept="image/*,.pdf" onChange={handleFileSelect} className="hidden" />
                    </label>
                  </div>
                  <p className="text-sm text-[#414846] mt-3 opacity-70">JPG, PNG, PDF / 최대 10MB</p>
                </div>
              ) : (
                <div className="border border-[#14392b]/8 rounded-xl overflow-hidden">
                  {previewUrl && (
                    <div className="relative bg-black/20">
                      <img src={previewUrl} alt="사업자등록증 미리보기" className="w-full max-h-48 object-contain" />
                      <button
                        type="button"
                        onClick={handleRetry}
                        aria-label="이 파일 지우기"
                        className="absolute top-2 right-2 w-11 h-11 bg-black/60 rounded-full flex items-center justify-center text-white text-base hover:bg-black/80"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                  {!previewUrl && (
                    <p className="px-3 pt-3 text-sm text-[#414846]">📄 {businessFile.name}</p>
                  )}

                  <div className={`p-3 flex items-start gap-2 ${statusColor[verifyStatus]}`} role="status">
                    {ocrInProgress && (
                      <span className="w-4 h-4 mt-0.5 border-2 border-current border-t-transparent rounded-full animate-spin inline-block shrink-0" />
                    )}
                    {verifyStatus === "verified" && <span>✅</span>}
                    {verifyStatus === "failed" && <span>❌</span>}
                    {verifyStatus === "unverified" && <span>⚠️</span>}
                    <span className="text-sm leading-relaxed">{verifyMessage}</span>
                  </div>

                  {/* OCR 추출 정보 전체 표시 */}
                  {ocrResult && verifyStatus !== "failed" && (
                    <div className="px-3 pb-3">
                      <div className="bg-[#ede7d8] rounded-lg p-3 text-sm space-y-1.5">
                        <OcrRow label="사업자번호" value={formatBusinessNumber(ocrResult.businessNumber)} mono />
                        <OcrRow label="상호" value={ocrResult.companyName} />
                        <OcrRow label="대표자" value={ocrResult.representativeName} />
                        <OcrRow label="사업장 주소" value={ocrResult.address} />
                        <OcrRow label="개업일" value={formatDate(ocrResult.startDate)} />
                        <OcrRow label="업태/종목" value={`${ocrResult.businessType || "-"} / ${ocrResult.businessCategory || "-"}`} />
                        {ocrResult.corporateNumber && <OcrRow label="법인등록번호" value={ocrResult.corporateNumber} mono />}
                        {ocrResult.taxOffice && <OcrRow label="관할세무서" value={ocrResult.taxOffice} />}
                        {ocrResult.taxType && <OcrRow label="사업자 유형" value={ocrResult.taxType} />}
                        {ocrResult.officePhone && <OcrRow label="사업장 전화" value={ocrResult.officePhone} />}
                      </div>
                    </div>
                  )}

                  {(verifyStatus === "failed" || verifyStatus === "verified" || verifyStatus === "unverified") && (
                    <div className="px-3 pb-3 flex flex-col sm:flex-row gap-2">
                      {verifyStatus === "failed" && (
                        <button
                          type="button"
                          onClick={handleReadAgain}
                          className="flex-1 min-h-[44px] text-sm text-[#2e6242] border border-[#2e6242]/30 rounded-lg hover:bg-[#2e6242]/5 transition-colors"
                        >
                          다시 읽기
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleRetry}
                        className="flex-1 min-h-[44px] text-sm text-[#414846] border border-[#14392b]/8 rounded-lg hover:text-[#2e6242] transition-colors"
                      >
                        다른 파일로 다시 올리기
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
            )}

            {/* 사업자등록증 없는 소속 변호사 */}
            <div className="bg-[#ede7d8]/50 border border-[#14392b]/8 rounded-xl p-4">
              <label className="flex items-start gap-3 cursor-pointer min-h-[44px]">
                <input
                  type="checkbox"
                  checked={noBusinessLicense}
                  onChange={(e) => handleToggleNoLicense(e.target.checked)}
                  className="mt-0.5 w-5 h-5 accent-[#2e6242] rounded shrink-0"
                />
                <span className="text-sm text-[#1e2a22] leading-relaxed">
                  <span className="font-medium">본인 명의 사업자등록증이 없습니다</span>
                  <br />
                  <span className="text-[#414846]">
                    법무법인·합동사무소 소속 변호사는 여기에 표시하고 아래를 채워 주세요. 변호사 등록번호로 담당자가 확인한 뒤(영업일 1일 안) 열어 드립니다.
                  </span>
                </span>
              </label>
            </div>

            {/* 이름·사무소 — OCR 값을 기본으로 채우되 고칠 수 있다 */}
            <div>
              <label className="block text-sm text-[#414846] mb-1.5">
                변호사 이름 <span className="text-[#2e6242]">*</span>
                {ocrResult?.representativeName && <span className="ml-1 text-xs text-[#2e6242]">(사업자등록증에서 읽음 — 다르면 고쳐 주세요)</span>}
              </label>
              <input name="name" value={form.name} onChange={handleChange} required autoComplete="name" className={inputClass} placeholder="예: 김창희" />
            </div>
            <div>
              <label className="block text-sm text-[#414846] mb-1.5">
                사무소 이름 <span className="text-[#2e6242]">*</span>
                {ocrResult?.companyName && <span className="ml-1 text-xs text-[#2e6242]">(사업자등록증에서 읽음 — 다르면 고쳐 주세요)</span>}
              </label>
              <input name="firmName" value={form.firmName} onChange={handleChange} required autoComplete="organization" className={inputClass} placeholder="예: 법률사무소 청송law" />
            </div>

            {/* 수기 입력 필드 */}
            <div>
              <label className="block text-sm text-[#414846] mb-1.5">
                변호사 등록번호 <span className="text-[#2e6242]">*</span>
              </label>
              <input
                name="barLicenseNumber"
                value={form.barLicenseNumber}
                onChange={handleChange}
                required
                inputMode="numeric"
                pattern="[0-9]{3,6}"
                className={inputClass}
                placeholder="예: 12345"
              />
              <p className="text-xs text-[#414846] mt-1">변호사 신분증(대한변호사협회)에 적힌 숫자 3~6자리. 담당자가 협회 조회로 대조합니다.</p>
            </div>

            <div>
              <label className="block text-sm text-[#414846] mb-1.5">
                휴대폰 번호 <span className="text-[#2e6242]">*</span>
              </label>
              <input
                name="phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                value={form.phone}
                onChange={handleChange}
                required
                className={inputClass}
                placeholder="010-0000-0000"
              />
              <p className="text-xs text-[#414846] mt-1">승인 안내와 플랜 만료 안내 문자가 이 번호로 갑니다. 숫자만 치면 하이픈이 자동으로 붙습니다.</p>
            </div>

            <div>
              <label className="block text-sm text-[#414846] mb-1.5">
                사무실 전화번호 <span className="text-xs text-[#414846]">(선택)</span>
              </label>
              <input name="officePhone" type="tel" inputMode="tel" value={form.officePhone} onChange={handleChange} className={inputClass} placeholder="02-000-0000" />
            </div>

            {/* 개인정보 동의 */}
            <div className="bg-[#ede7d8]/50 border border-[#14392b]/8 rounded-xl p-4">
              <label className="flex items-start gap-3 cursor-pointer min-h-[44px]">
                <input type="checkbox" checked={privacyConsented} onChange={(e) => setPrivacyConsented(e.target.checked)} className="mt-0.5 w-5 h-5 accent-[#2e6242] rounded shrink-0" />
                <div>
                  <span className="text-sm text-[#1e2a22] font-medium">
                    개인정보 수집·이용 동의 <span className="text-[#2e6242]">*</span>
                  </span>
                  <button type="button" onClick={() => setShowPrivacyDetail(!showPrivacyDetail)} className="ml-2 min-h-[44px] text-sm text-[#2e6242] hover:text-[#14392b] transition-colors underline">
                    {showPrivacyDetail ? "접기" : "상세보기"}
                  </button>
                </div>
              </label>

              {showPrivacyDetail && (
                <div className="mt-3 p-3 bg-[#ede7d8]/50 rounded-lg text-sm text-[#414846] leading-relaxed space-y-2 max-h-48 overflow-y-auto">
                  <p className="font-medium text-[#1e2a22]">수집하는 개인정보 항목</p>
                  <p>- 필수: 이름, 이메일, 변호사 등록번호, 휴대폰 번호</p>
                  <p>- 사업자등록증을 올린 경우: 사업자등록증 전체 정보(사업자등록번호, 상호, 대표자명, 사업장 주소, 개업일, 업태/종목, 법인등록번호, 관할세무서, 사업자유형)</p>
                  <p>- 선택: 사무실 전화번호</p>
                  <p className="font-medium text-[#1e2a22] mt-2">수집·이용 목적</p>
                  <p>- 변호사 본인 확인 및 가입 승인</p>
                  <p>- 서비스 제공(사건 관리, 문서 생성, 의뢰인 관리)</p>
                  <p>- 이용료 청구 및 계산서 발행</p>
                  <p>- 서비스 관련 공지, 고객 문의 응대</p>
                  <p className="font-medium text-[#1e2a22] mt-2">보유·이용 기간</p>
                  <p>- 회원 탈퇴 시까지 (관계 법령에 따라 보존이 필요한 경우 해당 기간까지). 탈퇴는 카카오톡 문의로 요청하시면 확인 후 처리합니다.</p>
                  <p className="font-medium text-[#1e2a22] mt-2">동의 거부 권리</p>
                  <p>- 위 개인정보 수집·이용에 동의하지 않을 수 있으나, 동의를 거부할 경우 서비스 이용이 제한됩니다.</p>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={submitDisabled}
              className="w-full min-h-[48px] py-3 bg-gradient-to-r from-[#14392b] to-[#24513c] text-[#f7f5ec] font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-[#f7f5ec]/30 border-t-[#f7f5ec] rounded-full animate-spin" />
                  저장하는 중...
                </span>
              ) : (
                submitLabel
              )}
            </button>

            {(noBusinessLicense || verifyStatus === "unverified" || verifyStatus === "failed") && (
              <p className="text-sm text-[#414846] text-center leading-relaxed">
                제출하시면 승인 대기 화면으로 넘어가고, 담당자가 영업일 1일 안에 확인합니다. 급하시면{" "}
                <a href={KAKAO_CHANNEL_CHAT} target="_blank" rel="noopener noreferrer" className="underline text-[#2e6242]">
                  카카오톡 1:1 문의
                </a>
                로 알려 주세요.
              </p>
            )}
          </form>

          <div className="mt-6 pt-4 border-t border-[#14392b]/8 space-y-3">
            <SupportLinks className="text-center" />
            <button onClick={handleLogout} className="w-full min-h-[44px] text-sm text-[#414846] hover:text-[#2e6242] transition-colors">
              다른 계정으로 로그인
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** OCR 결과 한 줄 표시 */
function OcrRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  if (!value || value === "-") return null;
  return (
    <div className="flex justify-between gap-2">
      <span className="text-[#414846] shrink-0">{label}</span>
      <span className={`text-[#1e2a22] text-right ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

function formatBusinessNumber(num: string): string {
  const clean = num.replace(/\D/g, "");
  if (clean.length !== 10) return num;
  return `${clean.slice(0, 3)}-${clean.slice(3, 5)}-${clean.slice(5)}`;
}

function formatDate(dateStr: string): string {
  const clean = dateStr.replace(/\D/g, "");
  if (clean.length !== 8) return dateStr;
  return `${clean.slice(0, 4)}.${clean.slice(4, 6)}.${clean.slice(6)}`;
}
