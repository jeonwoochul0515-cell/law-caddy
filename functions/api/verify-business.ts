// 사업자등록증 국세청 진위확인 Cloudflare Function
// OCR은 프론트엔드에서 CLOVA OCR로 직접 처리 → 여기서는 진위확인만 담당

import type { Env } from "./_shared/types";

interface VerifyRequest {
  mode: "verify";
  businessNumber: string;
  startDate: string;
  representativeName: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = (await context.request.json()) as VerifyRequest;

    if (body.mode === "verify") {
      return await handleVerify(context, body);
    }

    return Response.json({ error: "mode는 'verify'여야 합니다." }, { status: 400 });
  } catch (error) {
    return Response.json(
      { error: "처리 중 오류 발생", detail: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
};

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
