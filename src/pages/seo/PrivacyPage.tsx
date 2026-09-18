// 개인정보처리방침 — 개인정보 보호법 제30조에 따른 공개 의무 페이지
//
// 두 지위를 구분해 적는다. 이 구분이 이 문서의 뼈대다.
//  (1) Law-Caddy가 "개인정보처리자"인 대상 = 서비스에 가입한 변호사 회원의 정보
//  (2) Law-Caddy가 "수탁자"인 대상 = 변호사가 업무 처리를 위해 올린 의뢰인·사건 정보
// 의뢰인 정보의 처리자는 변호사 본인이며, Law-Caddy는 변호사의 지시 범위에서만 처리한다.
//
// 내용을 고칠 때는 ProfileSetupPage.tsx의 가입 동의문과 어긋나지 않게 같이 본다.
import SeoPageLayout from "../../components/landing/SeoPageLayout";
import { KAKAO_CHANNEL_CHAT } from "../../config/contact";

const INK = "#14392b";
const serif = { fontFamily: '"Noto Serif KR", "Nanum Myeongjo", Batang, serif' } as const;

/** 시행일 — 내용을 고치면 이 날짜도 함께 고친다 */
const EFFECTIVE_DATE = "2026년 9월 19일";

/** 처리위탁 현황. 코드에서 실제로 호출하는 업체만 적는다(functions/api 기준). */
const PROCESSORS: { name: string; purpose: string; country: string }[] = [
  { name: "Google LLC (Firebase)", purpose: "회원 인증, 데이터베이스·파일 저장", country: "미국" },
  { name: "Cloudflare, Inc.", purpose: "웹사이트 호스팅, 서버 기능 실행", country: "미국 등" },
  { name: "Anthropic PBC (Claude)", purpose: "상담 내용·사건 자료의 AI 분석 및 문서 초안 생성", country: "미국" },
  { name: "주식회사 리턴제로 (VITO)", purpose: "상담 녹음 파일의 음성 인식(텍스트 변환)", country: "대한민국" },
  { name: "주식회사 솔라피 (SOLAPI)", purpose: "승인 안내·의뢰인 안내 문자 발송", country: "대한민국" },
  { name: "토스페이먼츠 주식회사", purpose: "유료 요금제 결제 승인 및 결제 수단 확인", country: "대한민국" },
  { name: "Voyage AI", purpose: "판례 검색어의 벡터 변환 및 검색 결과 재정렬", country: "미국" },
  { name: "Supabase, Inc.", purpose: "판례·법령 검색 색인 운영", country: "미국" },
  { name: "Functional Software, Inc. (Sentry)", purpose: "서비스 오류 수집 및 원인 분석", country: "미국" },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-lg sm:text-xl font-bold mb-3" style={{ ...serif, color: INK }}>
        {title}
      </h2>
      <div className="space-y-2 text-[15px] leading-relaxed" style={{ color: "rgba(20,57,43,0.78)" }}>
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <SeoPageLayout>
      <h1 className="text-2xl sm:text-3xl font-bold" style={{ ...serif, color: INK }}>
        개인정보처리방침
      </h1>
      <p className="mt-3 text-sm" style={{ color: "rgba(20,57,43,0.6)" }}>
        시행일 {EFFECTIVE_DATE}
      </p>

      <p className="mt-6 text-[15px] leading-relaxed" style={{ color: "rgba(20,57,43,0.78)" }}>
        법률사무소 청송law(이하 &ldquo;회사&rdquo;)는 법률사무소 업무 관리 서비스 Law-Caddy(이하 &ldquo;서비스&rdquo;)를
        운영하면서 개인정보 보호법 등 관계 법령을 지키고 있습니다. 이 방침은 회사가 어떤 개인정보를
        어떤 목적으로 처리하며 얼마나 보관하는지, 이용자가 어떤 권리를 행사할 수 있는지를 알리기 위한 것입니다.
      </p>

      <Section title="1. 이 방침이 다루는 두 가지 정보">
        <p>
          <strong>가. 회원 정보.</strong> 서비스에 가입한 변호사의 정보입니다. 이 정보에 대해 회사는
          개인정보처리자이며, 아래 2항부터 9항까지가 그대로 적용됩니다.
        </p>
        <p>
          <strong>나. 의뢰인·사건 정보.</strong> 회원(변호사)이 업무를 처리하기 위해 서비스에 올린
          의뢰인 이름·연락처, 상담 녹음, 사건 기록 등입니다. 이 정보의 개인정보처리자는 해당 변호사이고,
          회사는 변호사의 위탁을 받아 저장·변환·분석만 수행하는 수탁자입니다. 회사는 이 정보를
          변호사의 지시 범위를 벗어나 이용하지 않으며, AI 모델 학습에 쓰지 않습니다. 의뢰인의 열람·삭제
          요구는 사건을 수임한 변호사에게 하시면 됩니다.
        </p>
      </Section>

      <Section title="2. 수집하는 회원 개인정보 항목">
        <p>
          <strong>가입 시 필수.</strong> 이름, 이메일 주소, 변호사 등록번호, 휴대전화번호.
        </p>
        <p>
          <strong>사업자등록증을 올린 경우.</strong> 사업자등록번호, 상호, 대표자명, 사업장 주소,
          개업일, 업태·종목, 법인등록번호, 관할세무서, 사업자 유형. 사업자등록증 이미지 파일.
        </p>
        <p>
          <strong>선택.</strong> 사무실 전화번호.
        </p>
        <p>
          <strong>유료 요금제 결제 시.</strong> 결제 승인 번호, 결제 수단 종류, 결제 금액, 결제 일시.
          카드번호 전체는 결제대행사가 처리하며 회사는 보관하지 않습니다.
        </p>
        <p>
          <strong>서비스 이용 과정에서 자동 생성.</strong> 접속 일시, 브라우저·기기 정보, 오류 발생 기록,
          기능별 사용량(분석 건수·문서 생성 건수).
        </p>
        <p>
          <strong>도입 상담을 신청한 경우(비회원 포함).</strong> 이름, 휴대전화번호, 문의 내용, 접수 일시.
          상담 회신 목적으로만 쓰며, 회사가 운영하는 통합 문의 접수 시스템과 관리자 안내 문자에 전달됩니다.
          접수로부터 <strong>1년</strong>이 지나면 파기하고, 그 전에도 삭제를 요청하시면 바로 지워 드립니다.
        </p>
      </Section>

      <Section title="3. 처리 목적">
        <p>- 변호사 본인 확인 및 가입 승인 심사</p>
        <p>- 서비스 제공(사건 관리, 상담 녹음 변환, 문서 생성, 일정·기한 관리, 의뢰인 관리)</p>
        <p>- 요금제 한도 관리, 이용료 청구 및 계산서 발행</p>
        <p>- 가입 승인·거절, 기한 임박 등 서비스 운영에 필요한 안내</p>
        <p>- 문의 응대, 오류 원인 파악 및 서비스 개선</p>
        <p>- 부정 이용 방지 및 관계 법령상 의무 이행</p>
      </Section>

      <Section title="4. 보유·이용 기간">
        <p>
          회원 정보는 <strong>회원 탈퇴 시까지</strong> 보유하며, 탈퇴 요청을 받으면 지체 없이 파기합니다.
          다만 아래 법령이 정한 자료는 그 기간 동안 보존합니다.
        </p>
        <p>- 계약·청약철회 기록: 5년 (전자상거래 등에서의 소비자보호에 관한 법률)</p>
        <p>- 대금 결제·재화 공급 기록: 5년 (같은 법)</p>
        <p>- 소비자 불만·분쟁 처리 기록: 3년 (같은 법)</p>
        <p>- 전자금융 거래 기록: 5년 (전자금융거래법)</p>
        <p>- 접속 기록: 3개월 (통신비밀보호법)</p>
        <p>
          회원이 올린 의뢰인·사건 정보는 회원이 해당 자료를 삭제하거나 탈퇴할 때까지 보관합니다.
        </p>
      </Section>

      <Section title="5. 처리위탁 현황">
        <p>
          회사는 서비스 제공을 위해 아래와 같이 개인정보 처리 업무를 위탁하고 있습니다. 위탁 업체가
          바뀌면 이 방침을 고쳐 알립니다.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr style={{ borderBottom: `1px solid ${INK}33` }}>
                <th className="text-left py-2 pr-4 font-semibold" style={{ color: INK }}>수탁 업체</th>
                <th className="text-left py-2 pr-4 font-semibold" style={{ color: INK }}>위탁 업무</th>
                <th className="text-left py-2 font-semibold" style={{ color: INK }}>처리 국가</th>
              </tr>
            </thead>
            <tbody>
              {PROCESSORS.map((p) => (
                <tr key={p.name} style={{ borderBottom: "1px solid rgba(20,57,43,0.1)" }}>
                  <td className="py-2 pr-4 align-top">{p.name}</td>
                  <td className="py-2 pr-4 align-top">{p.purpose}</td>
                  <td className="py-2 align-top whitespace-nowrap">{p.country}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3">
          위 업체 중 처리 국가가 국외인 곳은 개인정보를 국외로 이전하여 처리합니다. 이전 항목·시점·방법은
          해당 업무 수행 시 정보통신망을 통한 전송이며, 이전받는 자의 이용 기간은 위탁 계약 종료 시까지입니다.
          국외 이전을 원하지 않으시면 서비스 이용이 제한될 수 있습니다.
        </p>
      </Section>

      <Section title="6. 제3자 제공">
        <p>
          회사는 회원의 개인정보를 제3자에게 제공하지 않습니다. 다만 다음의 경우는 예외입니다.
        </p>
        <p>- 회원이 미리 동의한 경우</p>
        <p>- 법령에 특별한 규정이 있거나, 수사기관이 법령에 정한 절차와 방법에 따라 요구한 경우</p>
        <p>
          5항의 처리위탁은 회사의 업무를 대신 수행하는 것이므로 제3자 제공과 구분됩니다.
        </p>
      </Section>

      <Section title="7. 파기 절차와 방법">
        <p>
          보유 기간이 지나거나 처리 목적이 달성된 개인정보는 지체 없이 파기합니다. 전자적 파일은 복구할
          수 없는 방법으로 삭제하고, 출력물은 분쇄하거나 소각합니다. 다른 법령에 따라 보존해야 하는
          정보는 별도의 저장소로 옮겨 그 목적 외의 용도로 쓰지 않습니다.
        </p>
      </Section>

      <Section title="8. 정보주체의 권리와 행사 방법">
        <p>
          회원은 언제든지 자신의 개인정보에 대해 열람, 정정, 삭제, 처리정지를 요구할 수 있습니다.
          일부 항목은 서비스 내 설정 화면에서 직접 고칠 수 있고, 그 밖의 요구는 아래 연락처로 하시면
          본인 확인 후 10일 이내에 처리합니다. 법정대리인이나 위임받은 사람을 통해서도 행사할 수 있습니다.
        </p>
        <p>
          다만 다른 법령에서 보존을 요구하는 정보는 삭제 요구를 받아도 그 기간 동안 보존할 수 있습니다.
        </p>
      </Section>

      <Section title="9. 안전성 확보 조치">
        <p>- 접속·저장 구간 암호화(HTTPS) 및 저장 데이터의 서버 측 암호화</p>
        <p>- 회원별 접근 권한 분리 — 다른 회원의 사건 자료에는 접근할 수 없도록 데이터베이스 규칙으로 통제</p>
        <p>- AI 분석에 보내기 전 전화번호·주민등록번호 등 식별 정보의 가림 처리</p>
        <p>- 접근 기록 보관, 처리 담당자 최소화, 정기적인 취약점 점검</p>
      </Section>

      <Section title="10. 개인정보 보호책임자">
        <p>
          개인정보 처리에 관한 문의, 불만 처리, 피해 구제는 아래로 연락하시면 됩니다.
        </p>
        <p>- 책임자: 김창희 (법률사무소 청송law 대표)</p>
        <p>- 전화: 051-714-1515</p>
        <p>
          - 문의:{" "}
          <a
            href={KAKAO_CHANNEL_CHAT}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
            style={{ color: "#2e6242" }}
          >
            카카오톡 채널 1:1 문의
          </a>
        </p>
        <p>- 주소: 부산광역시 연제구 법원남로15번길 10, 2층 202호(거제동, 미르코아빌딩)</p>
        <p className="mt-3">
          개인정보 침해로 인한 신고·상담이 필요하면 개인정보분쟁조정위원회(1833-6972),
          개인정보침해신고센터(국번없이 118), 대검찰청 사이버수사과(1301), 경찰청 사이버수사국(182)에
          문의하실 수 있습니다.
        </p>
      </Section>

      <Section title="11. 방침의 변경">
        <p>
          이 방침의 내용이 바뀌면 변경 사항과 시행일을 이 페이지에 공개합니다. 회원에게 불리하게 바뀌는
          경우에는 시행 7일 전부터 알립니다.
        </p>
      </Section>
    </SeoPageLayout>
  );
}
