// 사업자등록증 OCR + 진위확인 서비스

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

const isDev = import.meta.env.DEV;

/**
 * 사업자등록증 이미지에서 정보를 OCR로 추출합니다.
 */
export async function ocrBusinessLicense(file: File): Promise<BusinessOcrResult> {
  const base64 = await fileToBase64(file);
  const mediaType = file.type || "image/jpeg";

  // dev 환경: 직접 Claude Vision 호출
  if (isDev) {
    const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
    if (apiKey) {
      return await ocrDirect(base64, mediaType, apiKey);
    }
  }

  // 프록시 경유
  const response = await fetch("/api/verify-business", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "ocr", imageBase64: base64, mediaType }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: "OCR 실패" }));
    throw new Error((err as { error?: string }).error || `OCR 실패: HTTP ${response.status}`);
  }

  const result = (await response.json()) as { success: boolean; data: BusinessOcrResult };
  return result.data;
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

/** 개발 환경 직접 Claude Vision 호출 */
async function ocrDirect(base64: string, mediaType: string, apiKey: string): Promise<BusinessOcrResult> {
  const response = await fetch(
    "/api/anthropic/v1/messages",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        temperature: 0,
        system: `당신은 한국 사업자등록증 문서 판독 전문가입니다.
사업자등록증 이미지에서 모든 정보를 빠짐없이 정확히 추출하세요.

반드시 아래 JSON 형식으로만 응답하세요 (다른 텍스트 없이):
{
  "businessNumber": "사업자등록번호 (숫자만, 하이픈 제거)",
  "companyName": "상호(법인명)",
  "representativeName": "대표자(성명)",
  "address": "사업장 소재지 (전체 주소)",
  "startDate": "개업연월일 (YYYYMMDD)",
  "businessType": "업태",
  "businessCategory": "종목",
  "corporateNumber": "법인등록번호 (있으면, 없으면 빈 문자열)",
  "taxOffice": "관할세무서 (예: ○○세무서)",
  "taxType": "사업자 유형 (일반과세자, 간이과세자, 면세사업자 등)",
  "officePhone": "사업장 전화번호 (있으면, 없으면 빈 문자열)",
  "confidence": "high|medium|low"
}`,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
              { type: "text", text: "이 사업자등록증의 정보를 추출해주세요." },
            ],
          },
        ],
      }),
    },
  );

  if (!response.ok) {
    throw new Error("Claude Vision OCR 호출 실패");
  }

  const data = (await response.json()) as { content: Array<{ type: string; text: string }> };
  const text = data.content?.find((b) => b.type === "text")?.text ?? "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("OCR 결과 파싱 실패");
  return JSON.parse(jsonMatch[0]) as BusinessOcrResult;
}

/** File → base64 문자열 변환 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // data:image/jpeg;base64, 접두사 제거
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
