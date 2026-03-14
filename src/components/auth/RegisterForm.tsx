import { useState, useRef, useCallback } from "react";
import { Link } from "react-router-dom";

interface RegisterFormProps {
  onSubmit: (data: {
    email: string;
    password: string;
    name: string;
    firmName: string;
    barLicenseNumber: string;
    phone?: string;
    privacyConsented?: boolean;
    businessNumber?: string;
    businessVerified?: boolean;
    businessLicenseFile?: File;
    businessAddress?: string;
    businessType?: string;
    businessCategory?: string;
    businessStartDate?: string;
  }) => Promise<void>;
  error?: string;
}

interface OcrResult {
  businessNumber: string;
  companyName: string;
  representativeName: string;
  address: string;
  startDate: string;
  businessType: string;
  businessCategory: string;
  confidence: "high" | "medium" | "low";
}

type VerifyStatus = "idle" | "uploading" | "ocr" | "verifying" | "verified" | "failed" | "unverified";

export default function RegisterForm({ onSubmit, error }: RegisterFormProps) {
  const [form, setForm] = useState({
    email: "",
    password: "",
    passwordConfirm: "",
    name: "",
    firmName: "",
    barLicenseNumber: "",
    phone: "",
  });
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState("");
  const [privacyConsented, setPrivacyConsented] = useState(false);
  const [showPrivacyDetail, setShowPrivacyDetail] = useState(false);

  // 사업자등록증 관련 상태
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

  /** 파일 처리 공통 함수 */
  const processFile = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      setLocalError("파일 크기는 10MB 이하여야 합니다.");
      return;
    }
    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      setLocalError("이미지 파일(JPG, PNG) 또는 PDF만 업로드 가능합니다.");
      return;
    }

    setBusinessFile(file);
    setLocalError("");
    setVerifyStatus("uploading");

    // 이전 프리뷰 URL 해제 (메모리 누수 방지)
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }

    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    }

    await runOcr(file);
  };

  /** 사업자등록증 파일 선택/촬영 */
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processFile(file);
  };

  /** 드래그앤드롭 */
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

  /** Claude Vision OCR 실행 */
  const runOcr = async (file: File) => {
    setVerifyStatus("ocr");
    setVerifyMessage("AI가 사업자등록증을 분석 중입니다...");

    try {
      const { ocrBusinessLicense } = await import("../../services/business-verify");
      const result = await ocrBusinessLicense(file);
      setOcrResult(result);

      if (result.representativeName && !form.name) {
        setForm((prev) => ({ ...prev, name: result.representativeName }));
      }
      if (result.companyName && !form.firmName) {
        setForm((prev) => ({ ...prev, firmName: result.companyName }));
      }

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

  /** 업태/종목에 변호사업 관련 키워드가 포함되어 있는지 확인 */
  const isLawyerBusiness = (ocr: OcrResult): boolean => {
    const keywords = ["변호사", "법률", "법무"];
    const target = `${ocr.businessType || ""} ${ocr.businessCategory || ""}`.toLowerCase();
    return keywords.some((kw) => target.includes(kw));
  };

  /** 국세청 사업자등록 진위확인 */
  const runVerify = async (ocr: OcrResult) => {
    setVerifyStatus("verifying");
    setVerifyMessage("국세청에 사업자등록 진위를 확인 중입니다...");

    try {
      const { verifyBusinessNumber } = await import("../../services/business-verify");
      const result = await verifyBusinessNumber(
        ocr.businessNumber,
        ocr.startDate,
        ocr.representativeName,
      );

      if (result.verified) {
        if (isLawyerBusiness(ocr)) {
          setVerifyStatus("verified");
          setBusinessVerified(true);
          setVerifyMessage("변호사업 사업자등록 확인 완료 — 가입 즉시 승인됩니다");
        } else {
          setVerifyStatus("unverified");
          setBusinessVerified(false);
          setVerifyMessage(
            "사업자등록은 확인되었으나, 업태/종목에 변호사업이 확인되지 않습니다. 관리자가 수동 확인합니다.",
          );
        }
      } else {
        setVerifyStatus("unverified");
        setBusinessVerified(false);
        setVerifyMessage(
          result.reason || result.data?.status || "사업자등록 상태를 확인할 수 없습니다. 관리자가 수동 확인합니다.",
        );
      }
    } catch {
      setVerifyStatus("unverified");
      setBusinessVerified(false);
      setVerifyMessage("국세청 조회에 실패했습니다. 관리자가 수동 확인합니다.");
    }
  };

  /** 재업로드 */
  const handleRetry = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setBusinessFile(null);
    setPreviewUrl(null);
    setOcrResult(null);
    setVerifyStatus("idle");
    setVerifyMessage("");
    setBusinessVerified(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError("");

    if (!businessFile) {
      setLocalError("사업자등록증을 업로드해 주세요.");
      return;
    }

    if (!form.phone.trim()) {
      setLocalError("연락처(휴대폰)를 입력해 주세요.");
      return;
    }

    if (!privacyConsented) {
      setLocalError("개인정보 수집·이용에 동의해 주세요.");
      return;
    }

    if (form.password !== form.passwordConfirm) {
      setLocalError("비밀번호가 일치하지 않습니다.");
      return;
    }
    if (form.password.length < 6) {
      setLocalError("비밀번호는 6자 이상이어야 합니다.");
      return;
    }

    setLoading(true);
    try {
      await onSubmit({
        email: form.email,
        password: form.password,
        name: form.name,
        firmName: form.firmName,
        barLicenseNumber: form.barLicenseNumber,
        phone: form.phone.trim(),
        privacyConsented,
        businessNumber: ocrResult?.businessNumber,
        businessVerified,
        businessLicenseFile: businessFile,
        businessAddress: ocrResult?.address,
        businessType: ocrResult?.businessType,
        businessCategory: ocrResult?.businessCategory,
        businessStartDate: ocrResult?.startDate,
      });
    } finally {
      setLoading(false);
    }
  };

  const displayError = localError || error;

  const statusColor: Record<VerifyStatus, string> = {
    idle: "",
    uploading: "text-blue-400",
    ocr: "text-blue-400",
    verifying: "text-amber-400",
    verified: "text-emerald-400",
    failed: "text-red-400",
    unverified: "text-amber-400",
  };

  const inputClass =
    "w-full px-4 py-3 bg-navy-light border border-border rounded-lg text-text-primary placeholder-text-dim focus:border-gold focus:outline-none transition-colors";

  return (
    <div className="min-h-screen flex items-center justify-center bg-navy px-4 py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gold mb-2">LAW-CADDY</h1>
          <p className="text-text-dim">변호사 회원가입</p>
        </div>

        <div className="bg-surface border border-border rounded-2xl p-8 backdrop-blur-sm">
          <h2 className="text-xl font-semibold text-text-primary mb-6">회원가입</h2>

          {displayError && (
            <div className="bg-error/10 border border-error/30 rounded-lg p-3 mb-4 text-error text-sm">
              {displayError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* 사업자등록증 업로드 섹션 */}
            <div>
              <label className="block text-sm text-text-dim mb-2">
                사업자등록증 <span className="text-gold">*</span>
              </label>

              {!businessFile ? (
                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
                    dragOver
                      ? "border-gold bg-gold/5"
                      : "border-border hover:border-gold/40"
                  }`}
                >
                  <div className="text-3xl mb-3 opacity-60">📄</div>
                  <p className="text-sm text-text-dim mb-1">
                    사업자등록증을 드래그하여 놓거나
                  </p>
                  <p className="text-xs text-text-dim/60 mb-4">
                    촬영 또는 파일을 선택하세요
                  </p>
                  <div className="flex gap-3 justify-center">
                    <label className="cursor-pointer px-4 py-2.5 bg-navy-light border border-border rounded-lg text-sm text-text-primary hover:border-gold/40 transition-colors flex items-center gap-2">
                      <span>📷</span> 촬영
                      <input
                        ref={cameraInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handleFileSelect}
                        className="hidden"
                      />
                    </label>
                    <label className="cursor-pointer px-4 py-2.5 bg-gradient-to-r from-gold/20 to-gold-bright/20 border border-gold/30 rounded-lg text-sm text-gold hover:from-gold/30 hover:to-gold-bright/30 transition-colors flex items-center gap-2">
                      <span>📁</span> 파일 선택
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*,.pdf"
                        onChange={handleFileSelect}
                        className="hidden"
                      />
                    </label>
                  </div>
                  <p className="text-xs text-text-dim mt-3 opacity-60">
                    JPG, PNG, PDF / 최대 10MB
                  </p>
                </div>
              ) : (
                <div className="border border-border rounded-xl overflow-hidden">
                  {previewUrl && (
                    <div className="relative bg-black/20">
                      <img
                        src={previewUrl}
                        alt="사업자등록증"
                        className="w-full max-h-48 object-contain"
                      />
                      <button
                        type="button"
                        onClick={handleRetry}
                        className="absolute top-2 right-2 w-7 h-7 bg-black/60 rounded-full flex items-center justify-center text-white text-sm hover:bg-black/80"
                      >
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

                  {ocrResult && verifyStatus !== "failed" && (
                    <div className="px-3 pb-3 space-y-1">
                      <div className="bg-navy-light rounded-lg p-3 text-xs space-y-1">
                        <div className="flex justify-between">
                          <span className="text-text-dim">사업자번호</span>
                          <span className="text-text-primary font-mono">
                            {formatBusinessNumber(ocrResult.businessNumber)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-text-dim">상호</span>
                          <span className="text-text-primary">{ocrResult.companyName || "-"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-text-dim">대표자</span>
                          <span className="text-text-primary">{ocrResult.representativeName || "-"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-text-dim">업태/종목</span>
                          <span className="text-text-primary">
                            {ocrResult.businessType || "-"} / {ocrResult.businessCategory || "-"}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {(verifyStatus === "failed" || verifyStatus === "verified" || verifyStatus === "unverified") && (
                    <div className="px-3 pb-3">
                      <button
                        type="button"
                        onClick={handleRetry}
                        className="w-full text-xs text-text-dim hover:text-gold py-1.5 transition-colors"
                      >
                        다른 파일로 다시 업로드
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm text-text-dim mb-1.5">변호사 이름</label>
              <input
                name="name"
                value={form.name}
                onChange={handleChange}
                required
                className={inputClass}
                placeholder="홍길동"
              />
            </div>

            <div>
              <label className="block text-sm text-text-dim mb-1.5">법률사무소 이름</label>
              <input
                name="firmName"
                value={form.firmName}
                onChange={handleChange}
                required
                className={inputClass}
                placeholder="법무법인 OO"
              />
            </div>

            <div>
              <label className="block text-sm text-text-dim mb-1.5">변호사 등록번호</label>
              <input
                name="barLicenseNumber"
                value={form.barLicenseNumber}
                onChange={handleChange}
                required
                className={inputClass}
                placeholder="12345"
              />
            </div>

            {/* 연락처 */}
            <div>
              <label className="block text-sm text-text-dim mb-1.5">
                연락처 (휴대폰) <span className="text-gold">*</span>
              </label>
              <input
                name="phone"
                type="tel"
                value={form.phone}
                onChange={handleChange}
                required
                className={inputClass}
                placeholder="010-0000-0000"
              />
            </div>

            <div>
              <label className="block text-sm text-text-dim mb-1.5">이메일</label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                required
                className={inputClass}
                placeholder="email@lawfirm.com"
              />
            </div>

            <div>
              <label className="block text-sm text-text-dim mb-1.5">비밀번호</label>
              <input
                type="password"
                name="password"
                value={form.password}
                onChange={handleChange}
                required
                className={inputClass}
                placeholder="6자 이상"
              />
            </div>

            <div>
              <label className="block text-sm text-text-dim mb-1.5">비밀번호 확인</label>
              <input
                type="password"
                name="passwordConfirm"
                value={form.passwordConfirm}
                onChange={handleChange}
                required
                className={inputClass}
                placeholder="비밀번호 재입력"
              />
            </div>

            {/* 개인정보 수집·이용 동의 */}
            <div className="bg-navy-light/50 border border-border rounded-xl p-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={privacyConsented}
                  onChange={(e) => setPrivacyConsented(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-gold rounded"
                />
                <div>
                  <span className="text-sm text-text-primary font-medium">
                    개인정보 수집·이용 동의 <span className="text-gold">*</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowPrivacyDetail(!showPrivacyDetail)}
                    className="ml-2 text-xs text-gold hover:text-gold-bright transition-colors underline"
                  >
                    {showPrivacyDetail ? "접기" : "상세보기"}
                  </button>
                </div>
              </label>

              {showPrivacyDetail && (
                <div className="mt-3 p-3 bg-surface rounded-lg text-xs text-text-dim leading-relaxed space-y-2 max-h-48 overflow-y-auto">
                  <p className="font-medium text-text-primary">수집하는 개인정보 항목</p>
                  <p>- 필수: 이름, 이메일, 비밀번호, 변호사 등록번호, 연락처(휴대폰), 사업자등록증(사업자등록번호, 상호, 대표자명, 사업장 주소, 개업일, 업태/종목)</p>

                  <p className="font-medium text-text-primary mt-2">수집·이용 목적</p>
                  <p>- 변호사 본인 확인 및 가입 승인</p>
                  <p>- 서비스 제공(사건 관리, 문서 생성, 의뢰인 관리)</p>
                  <p>- 이용료 청구 및 계산서 발행</p>
                  <p>- 서비스 관련 공지, 고객 문의 응대</p>

                  <p className="font-medium text-text-primary mt-2">보유·이용 기간</p>
                  <p>- 회원 탈퇴 시까지 (관계 법령에 따라 보존이 필요한 경우 해당 기간까지)</p>

                  <p className="font-medium text-text-primary mt-2">동의 거부 권리</p>
                  <p>- 위 개인정보 수집·이용에 동의하지 않을 수 있으나, 동의를 거부할 경우 서비스 이용이 제한됩니다.</p>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || !businessFile || !privacyConsented || verifyStatus === "ocr" || verifyStatus === "verifying"}
              className="w-full py-3 bg-gradient-to-r from-gold to-gold-bright text-navy font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-navy/30 border-t-navy rounded-full animate-spin" />
                  가입 처리 중...
                </span>
              ) : (
                "회원가입"
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-text-dim">
            이미 계정이 있으신가요?{" "}
            <Link to="/login" className="text-gold hover:text-gold-bright transition-colors">
              로그인
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

/** 사업자등록번호 포맷팅 (000-00-00000) */
function formatBusinessNumber(num: string): string {
  const clean = num.replace(/\D/g, "");
  if (clean.length !== 10) return num;
  return `${clean.slice(0, 3)}-${clean.slice(3, 5)}-${clean.slice(5)}`;
}
