// 사업자등록증 OCR + 진위확인 서비스
// CLOVA OCR로 텍스트 추출 → 구조화 파싱 → 국세청 진위확인

import { callClovaOcr, extractClovaText } from "./clova-ocr";

/** OCR 추출 결과 */
export interface BusinessOcrResult {
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

/** 진위확인 결과 */
export interface BusinessVerifyResult {
  verified: boolean;
  data?: {
    businessNumber: string;
    status: string;
    statusCode?: string;
    taxType?: string;
    source?: string;
  };
  reason?: string;
}

/**
 * 사업자등록증 이미지에서 정보를 CLOVA OCR로 추출합니다.
 */
export async function ocrBusinessLicense(file: File): Promise<BusinessOcrResult> {
  const base64 = await fileToBase64(file);
  const ext = file.name.lastIndexOf(".") >= 0
    ? file.name.slice(file.name.lastIndexOf(".") + 1).toLowerCase()
    : "";
  const format = ext === "png" ? "png" : ext === "pdf" ? "pdf" : "jpg";

  // CLOVA OCR로 텍스트 추출
  const response = await callClovaOcr(base64, format, file.name);
  const rawText = extractClovaText(response);

  if (!rawText.trim()) {
    throw new Error("사업자등록증에서 텍스트를 추출할 수 없습니다.");
  }

  // 추출된 텍스트에서 사업자등록증 정보 파싱
  return parseBusinessLicenseText(rawText);
}

/**
 * 사업자등록번호 진위를 국세청 API로 확인합니다.
 */
export async function verifyBusinessNumber(
  businessNumber: string,
  startDate?: string,
  representativeName?: string,
): Promise<BusinessVerifyResult> {
  const response = await fetch("/api/verify-business", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "verify",
      businessNumber: businessNumber.replace(/\D/g, ""),
      startDate: startDate || "",
      representativeName: representativeName || "",
    }),
  });

  if (!response.ok) {
    throw new Error("국세청 진위확인 실패");
  }

  return (await response.json()) as BusinessVerifyResult;
}

/**
 * CLOVA OCR 추출 텍스트에서 사업자등록증 필드를 파싱합니다.
 */
function parseBusinessLicenseText(text: string): BusinessOcrResult {
  const result: BusinessOcrResult = {
    businessNumber: "",
    companyName: "",
    representativeName: "",
    address: "",
    startDate: "",
    businessType: "",
    businessCategory: "",
    confidence: "medium",
  };

  // 사업자등록번호 (XXX-XX-XXXXX 또는 연속 10자리)
  const bizNumMatch = text.match(/(\d{3})-?(\d{2})-?(\d{5})/);
  if (bizNumMatch) {
    result.businessNumber = `${bizNumMatch[1]}${bizNumMatch[2]}${bizNumMatch[3]}`;
  }

  // 법인등록번호 (XXXXXX-XXXXXXX 13자리)
  const corpNumMatch = text.match(/(\d{6})-?(\d{7})/);
  if (corpNumMatch && corpNumMatch[0] !== bizNumMatch?.[0]) {
    result.corporateNumber = `${corpNumMatch[1]}${corpNumMatch[2]}`;
  }

  // 상호(법인명) — "상호" 또는 "법인명" 뒤의 텍스트
  const companyMatch = text.match(/(?:상\s*호|법\s*인\s*명)[^\S\n]*[:(]?\s*([^\n]{2,30})/);
  if (companyMatch) {
    result.companyName = companyMatch[1].replace(/[()[\]]/g, "").trim();
  }

  // 대표자 — "성명" 또는 "대표자" 뒤의 텍스트
  const nameMatch = text.match(/(?:대\s*표\s*자|성\s*명)[^\S\n]*[:(]?\s*([가-힣]{2,5})/);
  if (nameMatch) {
    result.representativeName = nameMatch[1].trim();
  }

  // 사업장 소재지
  const addrMatch = text.match(/(?:사\s*업\s*장\s*소\s*재\s*지|소\s*재\s*지)[^\S\n]*[:(]?\s*([^\n]{5,80})/);
  if (addrMatch) {
    result.address = addrMatch[1].trim();
  }

  // 개업연월일
  const dateMatch = text.match(/(?:개\s*업\s*연\s*월\s*일|개\s*업\s*일)[^\S\n]*[:(]?\s*(\d{4})\s*[년./-]?\s*(\d{1,2})\s*[월./-]?\s*(\d{1,2})/);
  if (dateMatch) {
    result.startDate = `${dateMatch[1]}${dateMatch[2].padStart(2, "0")}${dateMatch[3].padStart(2, "0")}`;
  }

  // 업태
  const typeMatch = text.match(/업\s*태[^\S\n]*[:(]?\s*([^\n]{1,30})/);
  if (typeMatch) {
    result.businessType = typeMatch[1].replace(/종\s*목.*/, "").trim();
  }

  // 종목
  const catMatch = text.match(/종\s*목[^\S\n]*[:(]?\s*([^\n]{1,30})/);
  if (catMatch) {
    result.businessCategory = catMatch[1].trim();
  }

  // 관할세무서
  const taxOfficeMatch = text.match(/([가-힣]+세무서)/);
  if (taxOfficeMatch) {
    result.taxOffice = taxOfficeMatch[1];
  }

  // 과세유형
  if (text.includes("일반과세자")) result.taxType = "일반과세자";
  else if (text.includes("간이과세자")) result.taxType = "간이과세자";
  else if (text.includes("면세")) result.taxType = "면세사업자";

  // 전화번호
  const phoneMatch = text.match(/(?:전\s*화)[^\S\n]*[:(]?\s*([\d-]{7,15})/);
  if (phoneMatch) {
    result.officePhone = phoneMatch[1].trim();
  }

  // 신뢰도 판단
  const filledFields = [
    result.businessNumber,
    result.companyName,
    result.representativeName,
    result.address,
    result.startDate,
  ].filter(Boolean).length;

  if (filledFields >= 4) result.confidence = "high";
  else if (filledFields >= 2) result.confidence = "medium";
  else result.confidence = "low";

  return result;
}

/** File → base64 문자열 변환 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
