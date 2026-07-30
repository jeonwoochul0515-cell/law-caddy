import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import useAuth from "../hooks/useAuth";

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

export default function ProfileSetupPage() {
  const navigate = useNavigate();
  const completeProfile = useAuth((s) => s.completeProfile);
  const newGoogleUser = useAuth((s) => s.newGoogleUser);
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);

  const displayEmail = newGoogleUser?.email || user?.email || "";

  const [form, setForm] = useState({
    name: "",
    firmName: "",
    barLicenseNumber: user?.barLicenseNumber || "",
    phone: user?.phone || "",
    officePhone: user?.officePhone || "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [privacyConsented, setPrivacyConsented] = useState(false);
  const [showPrivacyDetail, setShowPrivacyDetail] = useState(false);

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
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const processFile = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      setError("파일 크기는 10MB 이하여야 합니다.");
      return;
    }
    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      setError("이미지 파일(JPG, PNG) 또는 PDF만 업로드 가능합니다.");
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
    setVerifyMessage("AI가 사업자등록증을 분석 중입니다...");

    try {
      const { ocrBusinessLicense } = await import("../services/business-verify");
      const result = await ocrBusinessLicense(file);
      setOcrResult(result);

      // OCR 결과로 폼 자동 채움
      setForm((prev) => ({
        ...prev,
        name: result.representativeName || prev.name,
        firmName: result.companyName || prev.firmName,
        officePhone: result.officePhone || prev.officePhone,
      }));

      if (result.confidence === "low") {
        setVerifyStatus("failed");
        setVerifyMessage("사업자등록증을 인식할 수 없습니다. 더 선명한 이미지를 업로드해 주세요.");
        return;
      }

      await runVerify(result);
    } catch (err) {
      setVerifyStatus("failed");
      setVerifyMessage(err instanceof Error ? err.message : "OCR 처리 중 오류가 발생했습니다.");
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
      setVerifyMessage("변호사업 사업자등록 확인 완료 — 즉시 승인됩니다");

      try {
        const { verifyBusinessNumber } = await import("../services/business-verify");
        const result = await verifyBusinessNumber(ocr.businessNumber, ocr.startDate, ocr.representativeName);
        if (result.verified) {
          setVerifyMessage("변호사업 사업자등록 + 국세청 진위 확인 완료 — 즉시 승인됩니다");
        }
      } catch {
        // 국세청 확인 실패해도 OCR 기반 승인 유지
      }
      return;
    }

    setVerifyStatus("unverified");
    setBusinessVerified(false);
    setVerifyMessage("업태/종목에 변호사업이 확인되지 않습니다.");
  };

  const handleRetry = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setBusinessFile(null);
    setPreviewUrl(null);
    setOcrResult(null);
    setVerifyStatus("idle");
    setVerifyMessage("");
    setBusinessVerified(false);
    setForm((prev) => ({ ...prev, name: "", firmName: "", officePhone: "" }));
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!businessFile) {
      setError("사업자등록증을 업로드해 주세요.");
      return;
    }
    if (!businessVerified) {
      setError("변호사업이 등록된 사업자등록증만 승인됩니다.");
      return;
    }
    if (!form.barLicenseNumber.trim()) {
      setError("변호사 등록번호를 입력해 주세요.");
      return;
    }
    if (!form.phone.trim()) {
      setError("휴대폰 번호를 입력해 주세요.");
      return;
    }
    if (!privacyConsented) {
      setError("개인정보 수집·이용에 동의해 주세요.");
      return;
    }

    setLoading(true);
    try {
      await completeProfile({
        name: form.name,
        firmName: form.firmName,
        barLicenseNumber: form.barLicenseNumber.trim(),
        phone: form.phone.trim(),
        officePhone: form.officePhone.trim() || undefined,
        privacyConsented,
        businessNumber: ocrResult?.businessNumber,
        businessVerified,
        businessLicenseFile: businessFile,
        businessAddress: ocrResult?.address,
        businessType: ocrResult?.businessType,
        businessCategory: ocrResult?.businessCategory,
        businessStartDate: ocrResult?.startDate,
        businessCorporateNumber: ocrResult?.corporateNumber,
        businessTaxOffice: ocrResult?.taxOffice,
        businessTaxType: ocrResult?.taxType,
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
      setError(err instanceof Error ? err.message : "프로필 설정에 실패했습니다.");
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
    unverified: "text-[#2e6242]",
  };

  const inputClass =
    "w-full px-4 py-3 bg-white border border-[#14392b]/8 rounded-lg text-[#1e2a22] placeholder-[#414846]/50 focus:border-[#2e6242] focus:outline-none transition-colors";
  const readonlyClass =
    "w-full px-4 py-3 bg-[#ede7d8] border border-[#14392b]/8 rounded-lg text-[#414846] cursor-not-allowed";

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f7f5ec] px-4 py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-serif italic text-[#14392b] mb-2">Law-Caddy</h1>
          <p className="text-[#414846]">변호사 프로필 설정</p>
          {displayEmail && (
            <p className="text-xs text-[#414846] mt-1">{displayEmail}</p>
          )}
        </div>

        <div className="bg-[#ede7d8]/50 border border-[#14392b]/8 rounded-2xl p-8 backdrop-blur-sm">
          <h2 className="text-xl font-semibold text-[#1e2a22] mb-2">프로필 설정</h2>
          <p className="text-sm text-[#414846] mb-6">
            사업자등록증을 업로드하면 정보가 자동으로 채워집니다
          </p>

          {error && (
            <div className="bg-[#ba1a1a]/8 border border-[#ba1a1a]/20 rounded-lg p-3 mb-4 text-[#ba1a1a] text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* 사업자등록증 업로드 */}
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
                  <p className="text-sm text-[#414846] mb-1">사업자등록증을 드래그하여 놓거나</p>
                  <p className="text-xs text-[#414846]/60 mb-4">촬영 또는 파일을 선택하세요</p>
                  <div className="flex gap-3 justify-center">
                    <label className="cursor-pointer px-4 py-2.5 bg-[#ede7d8] border border-[#14392b]/8 rounded-lg text-sm text-[#1e2a22] hover:border-[#2e6242]/40 transition-colors flex items-center gap-2">
                      <span>📷</span> 촬영
                      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleFileSelect} className="hidden" />
                    </label>
                    <label className="cursor-pointer px-4 py-2.5 bg-gradient-to-r from-[#2e6242]/15 to-[#14392b]/15 border border-[#2e6242]/30 rounded-lg text-sm text-[#2e6242] hover:from-[#2e6242]/25 hover:to-[#14392b]/25 transition-colors flex items-center gap-2">
                      <span>📁</span> 파일 선택
                      <input ref={fileInputRef} type="file" accept="image/*,.pdf" onChange={handleFileSelect} className="hidden" />
                    </label>
                  </div>
                  <p className="text-xs text-[#414846] mt-3 opacity-60">JPG, PNG, PDF / 최대 10MB</p>
                </div>
              ) : (
                <div className="border border-[#14392b]/8 rounded-xl overflow-hidden">
                  {previewUrl && (
                    <div className="relative bg-black/20">
                      <img src={previewUrl} alt="사업자등록증" className="w-full max-h-48 object-contain" />
                      <button type="button" onClick={handleRetry} className="absolute top-2 right-2 w-7 h-7 bg-black/60 rounded-full flex items-center justify-center text-white text-sm hover:bg-black/80">
                        ✕
                      </button>
                    </div>
                  )}

                  <div className={`p-3 flex items-center gap-2 ${statusColor[verifyStatus]}`}>
                    {(verifyStatus === "ocr" || verifyStatus === "verifying" || verifyStatus === "uploading") && (
                      <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin inline-block" />
                    )}
                    {verifyStatus === "verified" && <span>✅</span>}
                    {verifyStatus === "failed" && <span>❌</span>}
                    {verifyStatus === "unverified" && <span>⚠️</span>}
                    <span className="text-sm">{verifyMessage}</span>
                  </div>

                  {/* OCR 추출 정보 전체 표시 */}
                  {ocrResult && verifyStatus !== "failed" && (
                    <div className="px-3 pb-3">
                      <div className="bg-[#ede7d8] rounded-lg p-3 text-xs space-y-1.5">
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
                    <div className="px-3 pb-3">
                      <button type="button" onClick={handleRetry} className="w-full text-xs text-[#414846] hover:text-[#2e6242] py-1.5 transition-colors">
                        다른 파일로 다시 업로드
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* OCR 자동 채움 필드 (읽기 전용) */}
            {ocrResult && verifyStatus === "verified" && (
              <>
                <div>
                  <label className="block text-sm text-[#414846] mb-1.5">변호사 이름 <span className="text-xs text-[#2e6242]">(사업자등록증)</span></label>
                  <input value={form.name} readOnly className={readonlyClass} />
                </div>
                <div>
                  <label className="block text-sm text-[#414846] mb-1.5">법률사무소 이름 <span className="text-xs text-[#2e6242]">(사업자등록증)</span></label>
                  <input value={form.firmName} readOnly className={readonlyClass} />
                </div>
              </>
            )}

            {/* 수기 입력 필드 */}
            <div>
              <label className="block text-sm text-[#414846] mb-1.5">
                변호사 등록번호 <span className="text-[#2e6242]">*</span>
              </label>
              <input name="barLicenseNumber" value={form.barLicenseNumber} onChange={handleChange} required className={inputClass} placeholder="변호사 등록번호 입력" />
            </div>

            <div>
              <label className="block text-sm text-[#414846] mb-1.5">
                휴대폰 번호 <span className="text-[#2e6242]">*</span>
              </label>
              <input name="phone" type="tel" value={form.phone} onChange={handleChange} required className={inputClass} placeholder="010-0000-0000" />
            </div>

            <div>
              <label className="block text-sm text-[#414846] mb-1.5">
                사무실 전화번호 <span className="text-xs text-[#414846]">(선택)</span>
              </label>
              <input name="officePhone" type="tel" value={form.officePhone} onChange={handleChange} className={inputClass} placeholder="02-000-0000" />
            </div>

            {/* 개인정보 동의 */}
            <div className="bg-[#ede7d8]/50 border border-[#14392b]/8 rounded-xl p-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={privacyConsented} onChange={(e) => setPrivacyConsented(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#2e6242] rounded" />
                <div>
                  <span className="text-sm text-[#1e2a22] font-medium">
                    개인정보 수집·이용 동의 <span className="text-[#2e6242]">*</span>
                  </span>
                  <button type="button" onClick={() => setShowPrivacyDetail(!showPrivacyDetail)} className="ml-2 text-xs text-[#2e6242] hover:text-[#14392b] transition-colors underline">
                    {showPrivacyDetail ? "접기" : "상세보기"}
                  </button>
                </div>
              </label>

              {showPrivacyDetail && (
                <div className="mt-3 p-3 bg-[#ede7d8]/50 rounded-lg text-xs text-[#414846] leading-relaxed space-y-2 max-h-48 overflow-y-auto">
                  <p className="font-medium text-[#1e2a22]">수집하는 개인정보 항목</p>
                  <p>- 필수: 이름, 이메일, 변호사 등록번호, 휴대폰 번호, 사업자등록증 전체 정보(사업자등록번호, 상호, 대표자명, 사업장 주소, 개업일, 업태/종목, 법인등록번호, 관할세무서, 사업자유형)</p>
                  <p>- 선택: 사무실 전화번호</p>
                  <p className="font-medium text-[#1e2a22] mt-2">수집·이용 목적</p>
                  <p>- 변호사 본인 확인 및 가입 승인</p>
                  <p>- 서비스 제공(사건 관리, 문서 생성, 의뢰인 관리)</p>
                  <p>- 이용료 청구 및 계산서 발행</p>
                  <p>- 서비스 관련 공지, 고객 문의 응대</p>
                  <p className="font-medium text-[#1e2a22] mt-2">보유·이용 기간</p>
                  <p>- 회원 탈퇴 시까지 (관계 법령에 따라 보존이 필요한 경우 해당 기간까지)</p>
                  <p className="font-medium text-[#1e2a22] mt-2">동의 거부 권리</p>
                  <p>- 위 개인정보 수집·이용에 동의하지 않을 수 있으나, 동의를 거부할 경우 서비스 이용이 제한됩니다.</p>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || !businessFile || !businessVerified || !privacyConsented || verifyStatus === "ocr" || verifyStatus === "verifying"}
              className="w-full py-3 bg-gradient-to-r from-[#14392b] to-[#24513c] text-[#f7f5ec] font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-[#f7f5ec]/30 border-t-[#f7f5ec] rounded-full animate-spin" />
                  프로필 설정 중...
                </span>
              ) : (
                "프로필 설정 완료"
              )}
            </button>

            {!businessVerified && verifyStatus === "unverified" && (
              <p className="text-xs text-[#2e6242] text-center">
                변호사업이 확인되지 않은 사업자등록증은 승인되지 않습니다.
              </p>
            )}
          </form>

          <div className="mt-6 pt-4 border-t border-[#14392b]/8">
            <button onClick={handleLogout} className="w-full text-sm text-[#414846] hover:text-[#2e6242] transition-colors">
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
