// Firestore 보안 규칙 권한 테스트
//
// 규칙 테스트가 0건이었다. 변호사 사건 자료의 접근 통제가 전부 이 파일 하나에
// 걸려 있는데, 고칠 때 무엇이 깨지는지 알 길이 없었다.
//
// 여기서 지키는 것은 두 가지다.
//  1. 남의 사건 자료는 못 읽는다.
//  2. 관리자라고 다 읽히지 않는다 — users와 bug_reports뿐이다.
//
// 실행: npm run test:rules (Firestore 에뮬레이터가 필요하다)
import { describe, it, beforeAll, afterAll, beforeEach } from "vitest";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, getDoc, setDoc, deleteDoc, Timestamp } from "firebase/firestore";

const PROJECT_ID = "law-caddy-rules-test";
const 나 = "lawyer-me";
const 남 = "lawyer-other";
const 관리자 = "admin-1";

let env: RulesTestEnvironment;

/** 소유자만 읽고 쓰는 컬렉션들 — 규칙이 같으므로 한 번에 돈다 */
const OWNER_COLLECTIONS = [
  "recordings",
  "documents",
  "opponentDocs",
  "case_records",
  "deadlines",
  "case_expenses",
  "transactions",
  "office_expenses",
  "deposits",
  "monthly_summary",
];

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  // 역할 문서와 남의 자료를 규칙 밖에서 미리 심는다
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "users", 나), { role: "lawyer", status: "approved" });
    await setDoc(doc(db, "users", 남), { role: "lawyer", status: "approved" });
    await setDoc(doc(db, "users", 관리자), { role: "admin", status: "approved" });
    await setDoc(doc(db, "cases", "case-of-other"), {
      ownerId: 남,
      status: "진행중",
      clientName: "남의 의뢰인",
    });
    for (const col of OWNER_COLLECTIONS) {
      await setDoc(doc(db, col, `${col}-of-other`), { ownerId: 남, secret: "남의 자료" });
    }
    await setDoc(doc(db, "fees", "fee-of-other"), { ownerId: 남, amount: 5_000_000 });
    await setDoc(doc(db, "signing_requests", "sign-of-other"), {
      ownerId: 남,
      status: "pending",
    });
    await setDoc(doc(db, "payments", "order-of-other"), { uid: 남, amount: 89000 });
    await setDoc(doc(db, "bug_reports", "bug-1"), { reporterUid: 남, status: "open" });
  });
});

describe("남의 자료", () => {
  it("다른 변호사의 사건을 읽을 수 없다", async () => {
    const db = env.authenticatedContext(나).firestore();
    await assertFails(getDoc(doc(db, "cases", "case-of-other")));
  });

  it.each(OWNER_COLLECTIONS)("다른 변호사의 %s를 읽을 수 없다", async (col) => {
    const db = env.authenticatedContext(나).firestore();
    await assertFails(getDoc(doc(db, col, `${col}-of-other`)));
  });

  it("다른 변호사의 수임료를 읽을 수 없다", async () => {
    const db = env.authenticatedContext(나).firestore();
    await assertFails(getDoc(doc(db, "fees", "fee-of-other")));
  });

  it("다른 변호사의 서명 요청을 읽을 수 없다 — 수임계약서 전문이 들어 있다", async () => {
    const db = env.authenticatedContext(나).firestore();
    await assertFails(getDoc(doc(db, "signing_requests", "sign-of-other")));
  });

  it("다른 변호사의 결제 기록을 읽을 수 없다", async () => {
    const db = env.authenticatedContext(나).firestore();
    await assertFails(getDoc(doc(db, "payments", "order-of-other")));
  });

  it("다른 변호사의 사건을 지울 수 없다", async () => {
    const db = env.authenticatedContext(나).firestore();
    await assertFails(deleteDoc(doc(db, "cases", "case-of-other")));
  });

  it("남의 이름으로 문서를 만들 수 없다", async () => {
    const db = env.authenticatedContext(나).firestore();
    await assertFails(
      setDoc(doc(db, "cases", "new-case"), { ownerId: 남, status: "진행중" }),
    );
  });

  it("로그인하지 않으면 아무것도 못 읽는다", async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "cases", "case-of-other")));
    await assertFails(getDoc(doc(db, "users", 남)));
  });
});

describe("관리자 권한 범위", () => {
  it("회원 문서는 읽는다 — 가입 심사에 필요하다", async () => {
    const db = env.authenticatedContext(관리자).firestore();
    await assertSucceeds(getDoc(doc(db, "users", 남)));
  });

  it("불편 신고는 읽는다", async () => {
    const db = env.authenticatedContext(관리자).firestore();
    await assertSucceeds(getDoc(doc(db, "bug_reports", "bug-1")));
  });

  it("사건은 읽을 수 없다 — 관리자 화면이 쓰지 않는 권한이다", async () => {
    const db = env.authenticatedContext(관리자).firestore();
    await assertFails(getDoc(doc(db, "cases", "case-of-other")));
  });

  it.each(OWNER_COLLECTIONS)("%s를 읽을 수 없다", async (col) => {
    const db = env.authenticatedContext(관리자).firestore();
    await assertFails(getDoc(doc(db, col, `${col}-of-other`)));
  });

  it("수임료·서명요청·결제기록을 읽을 수 없다", async () => {
    const db = env.authenticatedContext(관리자).firestore();
    await assertFails(getDoc(doc(db, "fees", "fee-of-other")));
    await assertFails(getDoc(doc(db, "signing_requests", "sign-of-other")));
    await assertFails(getDoc(doc(db, "payments", "order-of-other")));
  });
});

describe("본인 자료", () => {
  it("자기 사건은 만들고 읽는다", async () => {
    const db = env.authenticatedContext(나).firestore();
    await assertSucceeds(
      setDoc(doc(db, "cases", "my-case"), { ownerId: 나, status: "진행중" }),
    );
    await assertSucceeds(getDoc(doc(db, "cases", "my-case")));
  });

  it("사건 상태는 정해진 값만 쓸 수 있다", async () => {
    const db = env.authenticatedContext(나).firestore();
    await assertFails(
      setDoc(doc(db, "cases", "bad-status"), { ownerId: 나, status: "아무거나" }),
    );
  });

  it("소유자를 남에게 넘기는 수정은 막는다", async () => {
    const db = env.authenticatedContext(나).firestore();
    await setDoc(doc(db, "cases", "my-case"), { ownerId: 나, status: "진행중" });
    await assertFails(
      setDoc(doc(db, "cases", "my-case"), { ownerId: 남, status: "진행중" }),
    );
  });
});

describe("회원 문서 자기 수정", () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", 나), {
        role: "lawyer",
        status: "pending",
        plan: "free",
        profileCompleted: true,
        name: "나변호사",
      });
    });
  });

  it("스스로 승인 상태로 바꿀 수 없다", async () => {
    const db = env.authenticatedContext(나).firestore();
    await assertFails(
      setDoc(doc(db, "users", 나), {
        role: "lawyer",
        status: "approved",
        plan: "free",
        profileCompleted: true,
        name: "나변호사",
      }),
    );
  });

  it("스스로 요금제를 올릴 수 없다 — 결제 우회 차단", async () => {
    const db = env.authenticatedContext(나).firestore();
    await assertFails(
      setDoc(doc(db, "users", 나), {
        role: "lawyer",
        status: "pending",
        plan: "pro",
        profileCompleted: true,
        name: "나변호사",
      }),
    );
  });

  it("스스로 관리자가 될 수 없다", async () => {
    const db = env.authenticatedContext(나).firestore();
    await assertFails(
      setDoc(doc(db, "users", 나), {
        role: "admin",
        status: "pending",
        plan: "free",
        profileCompleted: true,
        name: "나변호사",
      }),
    );
  });

  it("이름·연락처는 고칠 수 있다", async () => {
    const db = env.authenticatedContext(나).firestore();
    await assertSucceeds(
      setDoc(doc(db, "users", 나), {
        role: "lawyer",
        status: "pending",
        plan: "free",
        profileCompleted: true,
        name: "고친이름",
        phone: "01011112222",
      }),
    );
  });

  it("거절당한 회원은 서류를 다시 내 pending으로 돌아갈 수 있다", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", 나), {
        role: "lawyer",
        status: "rejected",
        plan: "free",
        profileCompleted: true,
        name: "나변호사",
        rejectedReason: "사업자등록증 불명확",
      });
    });
    const db = env.authenticatedContext(나).firestore();
    await assertSucceeds(
      setDoc(doc(db, "users", 나), {
        role: "lawyer",
        status: "pending",
        plan: "free",
        profileCompleted: true,
        name: "나변호사",
      }),
    );
  });
});

describe("관리자 회원 관리", () => {
  it("승인할 수 있다", async () => {
    const db = env.authenticatedContext(관리자).firestore();
    await assertSucceeds(
      setDoc(doc(db, "users", 남), {
        role: "lawyer",
        status: "approved",
        plan: "free",
        approvedBy: 관리자,
        approvedAt: Timestamp.now(),
      }),
    );
  });

  it("만료일을 문자열로 넣을 수 없다 — 서버가 영구 유료로 읽는다", async () => {
    const db = env.authenticatedContext(관리자).firestore();
    await assertFails(
      setDoc(doc(db, "users", 남), {
        role: "lawyer",
        status: "approved",
        plan: "pro",
        planExpiresAt: "2027-01-01",
      }),
    );
  });

  it("회원 문서를 지울 수 없다", async () => {
    const db = env.authenticatedContext(관리자).firestore();
    await assertFails(deleteDoc(doc(db, "users", 남)));
  });
});

describe("사용량 기록", () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "usage_monthly", `${나}_2026-09`), {
        uid: 나,
        documents: 3,
      });
    });
  });

  it("본인 것은 읽는다", async () => {
    const db = env.authenticatedContext(나).firestore();
    await assertSucceeds(getDoc(doc(db, "usage_monthly", `${나}_2026-09`)));
  });

  it("남의 것은 못 읽는다", async () => {
    const db = env.authenticatedContext(남).firestore();
    await assertFails(getDoc(doc(db, "usage_monthly", `${나}_2026-09`)));
  });

  it("카운터를 되돌려 무료 한도를 우회할 수 없다", async () => {
    const db = env.authenticatedContext(나).firestore();
    await assertFails(
      setDoc(doc(db, "usage_monthly", `${나}_2026-09`), { uid: 나, documents: 0 }),
    );
  });
});

describe("불편 신고", () => {
  it("제보는 본인 uid로만 할 수 있다", async () => {
    const db = env.authenticatedContext(나).firestore();
    await assertFails(
      setDoc(doc(db, "bug_reports", "spoofed"), { reporterUid: 남, status: "open" }),
    );
    await assertSucceeds(
      setDoc(doc(db, "bug_reports", "mine"), { reporterUid: 나, status: "open" }),
    );
  });

  it("제보자는 남의 신고를 읽을 수 없다", async () => {
    const db = env.authenticatedContext(나).firestore();
    await assertFails(getDoc(doc(db, "bug_reports", "bug-1")));
  });
});

describe("의뢰인 케어 메시지 (사건 서브컬렉션)", () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, "cases", "my-case"), { ownerId: 나, status: "진행중" });
      await setDoc(doc(db, "cases", "my-case", "clientCareMessages", "m1"), {
        content: "안내 문자",
      });
      await setDoc(doc(db, "cases", "case-of-other", "clientCareMessages", "m2"), {
        content: "남의 안내 문자",
      });
    });
  });

  it("사건 소유자는 읽는다", async () => {
    const db = env.authenticatedContext(나).firestore();
    await assertSucceeds(getDoc(doc(db, "cases", "my-case", "clientCareMessages", "m1")));
  });

  it("남의 사건 메시지는 못 읽는다 — 의뢰인 이름과 사건 내용이 들어 있다", async () => {
    const db = env.authenticatedContext(나).firestore();
    await assertFails(
      getDoc(doc(db, "cases", "case-of-other", "clientCareMessages", "m2")),
    );
  });

  it("관리자도 못 읽는다", async () => {
    const db = env.authenticatedContext(관리자).firestore();
    await assertFails(
      getDoc(doc(db, "cases", "case-of-other", "clientCareMessages", "m2")),
    );
  });
});
