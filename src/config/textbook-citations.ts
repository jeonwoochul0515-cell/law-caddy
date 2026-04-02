// 법률 교과서 서지정보 DB (정적 데이터, Claude API 호출 0회)
// 쟁점 키워드로 매칭하여 필묵에게 "참고문헌" 형식 안내
// 본문 없음 — 저작권 문제 없음 (서지정보만)

export interface TextbookEntry {
  author: string;
  title: string;
  edition: string;
  publisher: string;
  year: number;
  topics: string[];
}

export const TEXTBOOK_DB: TextbookEntry[] = [
  // ── 민법 ──
  { author: "송덕수", title: "채권법총론", edition: "제7판", publisher: "박영사", year: 2024,
    topics: ["채무불이행", "손해배상", "채권양도", "사해행위취소", "채권자대위권", "상계"] },
  { author: "송덕수", title: "채권법각론", edition: "제5판", publisher: "박영사", year: 2023,
    topics: ["매매", "임대차", "도급", "불법행위", "부당이득", "사무관리"] },
  { author: "김준호", title: "민법강의", edition: "제29판", publisher: "법문사", year: 2024,
    topics: ["민법총칙", "물권법", "채권법", "불법행위", "법률행위", "대리"] },
  { author: "지원림", title: "민법강의", edition: "제20판", publisher: "홍문사", year: 2024,
    topics: ["민법총칙", "물권법", "채권법", "담보물권"] },
  { author: "곽윤직/김재형", title: "민법총칙", edition: "제10판", publisher: "박영사", year: 2023,
    topics: ["민법총칙", "법률행위", "대리", "소멸시효", "제척기간"] },
  { author: "곽윤직/김재형", title: "물권법", edition: "제9판", publisher: "박영사", year: 2023,
    topics: ["물권법", "소유권", "점유권", "담보물권", "저당권", "유치권"] },

  // ── 민사소송법 ──
  { author: "이시윤", title: "신민사소송법", edition: "제15판", publisher: "박영사", year: 2023,
    topics: ["민사소송", "소장", "청구취지", "청구원인", "증거", "판결", "항소", "상고"] },
  { author: "호문혁", title: "민사소송법", edition: "제15판", publisher: "법문사", year: 2023,
    topics: ["민사소송", "관할", "당사자", "소송대리", "변론", "증거법"] },
  { author: "전원열", title: "민사집행법", edition: "제3판", publisher: "법문사", year: 2022,
    topics: ["강제집행", "가압류", "가처분", "채권집행", "부동산경매"] },

  // ── 형법 ──
  { author: "이재상/장영민/강동범", title: "형법총론", edition: "제11판", publisher: "박영사", year: 2023,
    topics: ["형법총칙", "범죄론", "형벌론", "미수", "공범", "정당방위"] },
  { author: "이재상/장영민/강동범", title: "형법각론", edition: "제13판", publisher: "박영사", year: 2023,
    topics: ["살인", "상해", "절도", "사기", "횡령", "배임", "명예훼손"] },

  // ── 상법 ──
  { author: "이철송", title: "상법총칙·상행위법", edition: "제15판", publisher: "박영사", year: 2023,
    topics: ["상법총칙", "상행위", "상인", "상업등기"] },
  { author: "이철송", title: "회사법강의", edition: "제32판", publisher: "박영사", year: 2024,
    topics: ["주식회사", "이사", "주주총회", "합병", "분할"] },

  // ── 가사법 ──
  { author: "김주수/김상용", title: "친족·상속법", edition: "제17판", publisher: "법문사", year: 2023,
    topics: ["이혼", "재산분할", "양육권", "친권", "상속", "유류분", "유언"] },

  // ── 노동법 ──
  { author: "임종률", title: "노동법", edition: "제21판", publisher: "박영사", year: 2023,
    topics: ["근로계약", "해고", "부당해고", "퇴직금", "임금", "산업재해", "노동조합"] },

  // ── 행정법 ──
  { author: "김동희/최계영", title: "행정법I", edition: "제29판", publisher: "박영사", year: 2024,
    topics: ["행정행위", "행정처분", "행정심판", "행정소송", "취소소송"] },
  { author: "박균성", title: "행정법론(상)", edition: "제22판", publisher: "박영사", year: 2023,
    topics: ["행정법총론", "행정작용", "행정절차", "행정강제"] },

  // ── 부동산/임대차 ──
  { author: "이은영", title: "부동산거래법", edition: "제4판", publisher: "박영사", year: 2022,
    topics: ["부동산매매", "임대차", "등기", "전세권", "보증금"] },

  // ── 공정거래법 ──
  { author: "신동권", title: "경제법I 독점규제법", edition: "제4판", publisher: "박영사", year: 2023,
    topics: ["공정거래", "부당공동행위", "시장지배적지위", "카르텔", "담합"] },

  // ── 지식재산권 ──
  { author: "정상조", title: "지식재산권법", edition: "제5판", publisher: "홍문사", year: 2023,
    topics: ["특허", "상표", "저작권", "디자인", "영업비밀"] },
];

/**
 * 쟁점 키워드 목록과 매칭되는 교과서를 찾습니다.
 */
export function findRelevantTextbooks(issueKeywords: string[]): TextbookEntry[] {
  const matched = new Set<TextbookEntry>();

  for (const keyword of issueKeywords) {
    for (const book of TEXTBOOK_DB) {
      if (book.topics.some((topic) => keyword.includes(topic) || topic.includes(keyword))) {
        matched.add(book);
      }
    }
  }

  return [...matched].slice(0, 5); // 최대 5권
}

/**
 * 매칭된 교과서를 필묵 프롬프트에 주입할 텍스트로 변환합니다.
 */
export function formatTextbooksForPrompt(books: TextbookEntry[]): string {
  if (books.length === 0) return "";

  const lines = [
    "[참고 문헌 (서지정보)]",
    "아래 학술 문헌은 본 사건 쟁점과 관련된 교과서입니다.",
    "법리 서술 시 인용 가능합니다. 인용 형식:",
    "\"~ (저자, 『서명[판차]』, 출판사(연도), 참조)\"",
    "",
  ];

  for (const book of books) {
    lines.push(`- ${book.author}, 『${book.title}[${book.edition}]』, ${book.publisher}(${book.year}) — ${book.topics.slice(0, 3).join(", ")}`);
  }

  return lines.join("\n");
}
