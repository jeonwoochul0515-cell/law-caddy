// iCal 캘린더 구독 엔드포인트 (공개, 토큰 기반)
//
// GET /api/ical/{token}
// 응답: text/calendar; charset=utf-8 (RFC 5545)
//
// 캘린더 클라이언트(Google/Apple/Outlook)가 이 URL을 구독하면
// 변호사의 진행중 사건에서 감지된 "기일·변론·심리·선고" 이벤트를
// 자동으로 캘린더에 반영합니다.
//
// 인증: URL path의 token으로 Firestore users 컬렉션 검색.
//       Firebase JWT 불가(캘린더 클라이언트가 Authorization 헤더 전송 못 함).

import type { Env } from "../_shared/types";
import {
  firestoreQueryByField,
  firestoreQueryByFields,
  firestoreDocumentId,
  readString,
  readArray,
  readMap,
  type FirestoreValue,
} from "../_shared/firestore";
import {
  buildVCalendar,
  extractTimeFromContent,
  isHearingType,
  type VEventInput,
} from "../_shared/ical";

/** CourtEvent 필드 추출 헬퍼 */
interface CourtEventRecord {
  id: string;
  date: string;
  type: string;
  content: string;
}

function extractCourtEvents(value: FirestoreValue | undefined): CourtEventRecord[] {
  const items = readArray(value);
  const events: CourtEventRecord[] = [];
  for (const item of items) {
    const m = readMap(item);
    const id = readString(m.id) ?? "";
    const date = readString(m.date) ?? "";
    const type = readString(m.type) ?? "";
    const content = readString(m.content) ?? "";
    if (id && date && type) {
      events.push({ id, date, type, content });
    }
  }
  return events;
}

/** 사건 요약 텍스트 생성 — 개인정보 최소화 (의뢰인 실명 대신 caseNumber 또는 description 앞 20자) */
function buildSummary(
  courtName: string,
  caseNumber: string,
  description: string,
  eventType: string,
): string {
  const titlePart = caseNumber
    ? caseNumber
    : description.slice(0, 20).trim() || "사건";
  const prefix = courtName ? `[${courtName}]` : "[법원]";
  return `${prefix} ${titlePart} ${eventType}`;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const token = context.params.token;
  const tokenStr = Array.isArray(token) ? token[0] : token;

  if (!tokenStr || typeof tokenStr !== "string" || tokenStr.length < 32) {
    return new Response("Invalid subscription token", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  try {
    // 1) 토큰으로 사용자 조회
    const userDocs = await firestoreQueryByField(
      context.env,
      "users",
      "icalToken",
      { stringValue: tokenStr },
      1,
    );

    if (userDocs.length === 0) {
      return new Response("Subscription not found", {
        status: 404,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    const ownerId = firestoreDocumentId(userDocs[0]);

    // 2) 해당 사용자의 진행중 사건 조회
    const caseDocs = await firestoreQueryByFields(
      context.env,
      "cases",
      [
        { field: "ownerId", value: { stringValue: ownerId } },
        { field: "status", value: { stringValue: "진행중" } },
      ],
      200,
    );

    // 3) 각 case의 courtEvents에서 기일/변론/심리/선고 이벤트만 추출하여 VEVENT 변환
    const vevents: VEventInput[] = [];

    for (const caseDoc of caseDocs) {
      const caseId = firestoreDocumentId(caseDoc);
      const fields = caseDoc.fields ?? {};

      const caseNumber = readString(fields.caseNumber) ?? "";
      const courtName = readString(fields.courtName) ?? "";
      const description = readString(fields.description) ?? "";

      const events = extractCourtEvents(fields.courtEvents);

      for (const ev of events) {
        if (!isHearingType(ev.type)) continue;
        if (!ev.date) continue;

        const time = extractTimeFromContent(ev.content);
        const summary = buildSummary(courtName, caseNumber, description, ev.type);

        vevents.push({
          uid: `${caseId}-${ev.id}@law-caddy.com`,
          summary,
          description: ev.content,
          location: courtName || undefined,
          date: ev.date,
          time,
        });
      }
    }

    // 4) iCal 문서 생성
    const ical = buildVCalendar(vevents);

    return new Response(ical, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Cache-Control": "private, max-age=600",
        "Content-Disposition": 'inline; filename="law-caddy.ics"',
      },
    });
  } catch (error) {
    // 캘린더 클라이언트 호환성 — 에러도 text/plain으로 응답
    const detail = error instanceof Error ? error.message : String(error);
    return new Response(`iCal 생성 오류: ${detail}`, {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
};
