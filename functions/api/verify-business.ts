// 사업자등록증 OCR + 국세청 진위확인 Cloudflare Function
// 1. Claude Vision으로 사업자등록증 이미지에서 정보 추출
// 2. 국세청 사업자등록 상태조회 API로 진위 확인

import type { Env } from "./_shared/types";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";
const API_VERSION = "2023-06-01";

interface OcrRequest {
  mode: "ocr";
  imageBase64: string;
  mediaType: string;
}

interface VerifyRequest {
  mode: "verify";
  businessNumber: string;
  startDate: string;
  representativeName: string;
}

type RequestBody = OcrRequest | VerifyRequest;

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

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = (await context.request.json()) as RequestBody;

    if (body.mode === "ocr") {
      return await handleOcr(context, body);
    } else if (body.mode === "verify") {
      return await handleVerify(context, body);
    }

    return Response.json({ error: "mode는 'ocr' 또는 'verify'여야 합니다." }, { status: 400 });
  } catch (error) {
    return Response.json(
      { error: "처리 중 오류 발생", detail: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
};

/** Claude Vision으로 사업자등록증 OCR */
async function handleOcr(context: EventContext<Env, string, unknown>, body: OcrRequest) {
  const apiKey = context.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Anthropic API 키가 설정되지 않았습니다." }, { status: 503 });
  }

  if (!body.imageBase64 || !body.mediaType) {
    return Response.json({ error: "imageBase64와 mediaType이 필요합니다." }, { status: 400 });
  }

  const systemPrompt = `당신은 한국 사업자등록증 문서 판독 전문가입니다.
사업자등록증 이미지에서 다음 정보를 정확히 추출하세요.

반드시 아래 JSON 형식으로만 응답하세요 (다른 텍스트 없이):
{
  "businessNumber": "사업자등록번호 (숫자만, 하이픈 제거)",
  "companyName": "상호(법인명)",
  "representativeName": "대표자(성명)",
  "address": "사업장 소재지",
  "startDate": "개업연월일 (YYYYMMDD)",
  "businessType": "업태",
  "businessCategory": "종목",
  "confidence": "high|medium|low (이미지 품질/판독 확신도)"
}

주의사항:
- 사업자등록번호는 반드시 10자리 숫자로 추출 (하이픈 제거)
- 읽을 수 없는 필드는 빈 문자열 ""로
- 사업자등록증이 아닌 이미지면 confidence를 "low"로 설정하고 나머지 필드를 빈 문자열로`;

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": API_VERSION,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      temperature: 0,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: body.mediaType,
                data: body.imageBase64,
              },
            },
            {
              type: "text",
              text: "이 사업자등록증의 정보를 추출해주세요.",
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = (await response.json()) as { error?: { message?: string } };
    return Response.json(
      { error: "Claude Vision 호출 실패", detail: errorBody?.error?.message ?? `HTTP ${response.status}` },
      { status: response.status },
    );
  }

  const data = (await response.json()) as { content: Array<{ type: string; text: string }> };
  const text = data.content?.find((b) => b.type === "text")?.text ?? "";

  // JSON 추출
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return Response.json({ error: "OCR 결과를 파싱할 수 없습니다.", raw: text }, { status: 500 });
  }

  const ocrResult = JSON.parse(jsonMatch[0]) as OcrResult;
  return Response.json({ success: true, data: ocrResult });
}

/** 국세청 사업자등록 상태조회 */
async function handleVerify(_context: EventContext<Env, string, unknown>, body: VerifyRequest) {
  if (!body.businessNumber) {
    return Response.json({ error: "사업자등록번호가 필요합니다." }, { status: 400 });
  }

  // 숫자만 추출
  const bNo = body.businessNumber.replace(/\D/g, "");
  if (bNo.length !== 10) {
    return Response.json({ error: "사업자등록번호는 10자리여야 합니다." }, { status: 400 });
  }

  // 국세청 홈택스 사업자등록 상태조회 (공개 API, 키 불필요)
  const response = await fetch(
    "https://api.odcloud.kr/api/nts-businessman/v1/status?serviceKey=DEMO_KEY",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ b_no: [bNo] }),
    },
  );

  if (!response.ok) {
    // 공공데이터 API 실패 시 홈택스 직접 조회 폴백
    return await verifyViaHometax(bNo, body.startDate, body.representativeName);
  }

  const result = (await response.json()) as {
    data: Array<{
      b_no: string;
      b_stt: string;
      b_stt_cd: string;
      tax_type: string;
      tax_type_cd: string;
      end_dt: string;
      utcc_yn: string;
      tax_type_change_dt: string;
      invoice_apply_dt: string;
    }>;
  };

  if (!result.data || result.data.length === 0) {
    return Response.json({ success: true, verified: false, reason: "조회 결과 없음" });
  }

  const info = result.data[0];
  const isActive = info.b_stt_cd === "01"; // 01: 계속사업자

  return Response.json({
    success: true,
    verified: isActive,
    data: {
      businessNumber: info.b_no,
      status: info.b_stt || (isActive ? "계속사업자" : "휴폐업자"),
      statusCode: info.b_stt_cd,
      taxType: info.tax_type,
    },
  });
}

/** 홈택스 직접 조회 폴백 */
async function verifyViaHometax(bNo: string, startDate: string, name: string) {
  try {
    const response = await fetch("https://teht.hometax.go.kr/wqAction.do?actionId=ATTABZAA001R08&svcCd=05&pkcEncr=" + bNo, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `map=bodyMap&popupYn=false&realGb=5&pkcEncr=${bNo}&flbYr=${startDate?.substring(0, 4) || ""}&flbMm=${startDate?.substring(4, 6) || ""}&flbDd=${startDate?.substring(6, 8) || ""}&prcClCd=1&scrnId=UTXPPABA01&trtEndCd=Y&nbrOfrprFnm=${encodeURIComponent(name || "")}`,
    });

    const text = await response.text();

    // 결과 파싱
    const isRegistered = text.includes("등록되어 있는") || text.includes("부가가치세");
    const isClosed = text.includes("폐업") || text.includes("휴업");

    return Response.json({
      success: true,
      verified: isRegistered && !isClosed,
      data: {
        businessNumber: bNo,
        status: isClosed ? "휴폐업자" : isRegistered ? "계속사업자" : "미확인",
        source: "hometax",
      },
    });
  } catch {
    return Response.json({
      success: true,
      verified: false,
      reason: "국세청 조회 실패. 수동 확인이 필요합니다.",
      data: { businessNumber: bNo, status: "조회불가", source: "error" },
    });
  }
}
