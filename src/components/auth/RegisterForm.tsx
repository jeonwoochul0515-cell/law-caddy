import { useState, useRef } from "react";
import { Link } from "react-router-dom";

interface RegisterFormProps {
  onSubmit: (data: {
    email: string;
    password: string;
    name: string;
    firmName: string;
    barLicenseNumber: string;
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
  });
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState("");

  // 사업자등록증 관련 상태
  const [businessFile, setBusinessFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null);
  const [verifyStatus, setVerifyStatus] = useState<VerifyStatus>("idle");
  const [verifyMessage, setVerifyMessage] = useState("");
  const [businessVerified, setBusinessVerified] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  /** 사업자등록증 파일 선택/촬영 */
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 파일 크기 제한 (10MB)
    if (file.size > 10 * 1024 * 1024) {
      setLocalError("파일 크기는 10MB 이하여야 합니다.");
      return;
    }

    // 이미지 파일 확인
    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      setLocalError("이미지 파일(JPG, PNG) 또는 PDF만 업로드 가능합니다.");
      return;
    }

    setBusinessFile(file);
    setLocalError("");
    setVerifyStatus("uploading");

    // 미리보기 생성
    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    }

    // OCR 실행
    await runOcr(file);
  };

  /** Claude Vision OCR 실행 */
  const runOcr = async (file: File) => {
    setVerifyStatus("ocr");
    setVerifyMessage("AI가 사업자등록증을 분석 중입니다...");

    try {
      const { ocrBusinessLicense } = await import("../../services/business-verify");
      const result = await ocrBusinessLicense(file);
      setOcrResult(result);

      // OCR 결과로 폼 자동입력
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

      // 국세청 진위확인 실행
      await runVerify(result);
    } catch (err) {
      setVerifyStatus("failed");
      setVerifyMessage(err instanceof Error ? err.message : "OCR 처리 중 오류가 발생했습니다.");
    }
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
        setVerifyStatus("verified");
        setBusinessVerified(true);
        setVerifyMessage(
          `사업자등록 확인 완료 (${result.data?.status || "계속사업자"})`,
        );
      } else {
        setVerifyStatus("unverified");
        setBusinessVerified(false);
        setVerifyMessage(
          result.reason || result.data?.status || "사업자등록 상태를 확인할 수 없습니다. 관리자가 수동 확인합니다.",
        );
      }
    } catch {
      // 진위확인 실패해도 가입은 가능 (관리자가 수동 확인)
      setVerifyStatus("unverified");
      setBusinessVerified(false);
      setVerifyMessage("국세청 조회에 실패했습니다. 관리자가 수동 확인합니다.");
    }
  };

  /** 재업로드 */
  const handleRetry = () => {
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

  const statusIcon: Record<VerifyStatus, string> = {
    idle: "",
    uploading: "",
    ocr: "",
    verifying: "",
    verified: "check_circle",
    failed: "error",
    unverified: "info",
  };

  const statusColor: Record<VerifyStatus, string> = {
    idle: "",
    uploading: "text-blue-400",
    ocr: "text-blue-400",
    verifying: "text-amber-400",
    verified: "text-emerald-400",
    failed: "text-red-400",
    unverified: "text-amber-400",
  };

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
                <div className="border-2 border-dashed border-border rounded-xl p-6 text-center hover:border-gold/40 transition-colors">
                  <div className="text-3xl mb-3 opacity-60">📄</div>
                  <p className="text-sm text-text-dim mb-4">
                    사업자등록증을 촬영하거나 파일을 업로드하세요
                  </p>
                  <div className="flex gap-3 justify-center">
                    {/* 카메라 촬영 */}
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
                    {/* 파일 업로드 */}
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
                  {/* 이미지 미리보기 */}
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

                  {/* 상태 표시 */}
                  <div className={`p-3 flex items-center gap-2 ${statusColor[verifyStatus]}`}>
                    {(verifyStatus === "ocr" || verifyStatus === "verifying" || verifyStatus === "uploading") && (
                      <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin inline-block" />
                    )}
                    {statusIcon[verifyStatus] === "check_circle" && <span>✅</span>}
                    {statusIcon[verifyStatus] === "error" && <span>❌</span>}
                    {statusIcon[verifyStatus] === "info" && <span>⚠️</span>}
                    <span className="text-sm">{verifyMessage}</span>
                  </div>

                  {/* OCR 추출 결과 */}
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

                  {/* 재업로드 버튼 */}
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
                className="w-full px-4 py-3 bg-navy-light border border-border rounded-lg text-text-primary placeholder-text-dim focus:border-gold focus:outline-none transition-colors"
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
                className="w-full px-4 py-3 bg-navy-light border border-border rounded-lg text-text-primary placeholder-text-dim focus:border-gold focus:outline-none transition-colors"
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
                className="w-full px-4 py-3 bg-navy-light border border-border rounded-lg text-text-primary placeholder-text-dim focus:border-gold focus:outline-none transition-colors"
                placeholder="12345"
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
                className="w-full px-4 py-3 bg-navy-light border border-border rounded-lg text-text-primary placeholder-text-dim focus:border-gold focus:outline-none transition-colors"
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
                className="w-full px-4 py-3 bg-navy-light border border-border rounded-lg text-text-primary placeholder-text-dim focus:border-gold focus:outline-none transition-colors"
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
                className="w-full px-4 py-3 bg-navy-light border border-border rounded-lg text-text-primary placeholder-text-dim focus:border-gold focus:outline-none transition-colors"
                placeholder="비밀번호 재입력"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !businessFile || verifyStatus === "ocr" || verifyStatus === "verifying"}
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
