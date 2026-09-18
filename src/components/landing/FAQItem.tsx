// 랜딩페이지와 /faq 페이지가 공유하는 FAQ 아코디언 항목
// (2026-09-11) 옛 골드(#C8A961) 강조를 랜딩의 잔디빛(#2E6242)으로 맞추고, 답변 상자 높이를 늘렸다.
import { useState } from "react";
import { Plus } from "lucide-react";

export default function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b" style={{ borderColor: "rgba(20,57,43,0.12)" }}>
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-4 min-h-14 py-4 text-left group focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2E6242]"
      >
        <h3
          className="pr-2 font-semibold text-[15px] transition-colors group-hover:text-[#2E6242]"
          style={{
            fontFamily: '"Noto Serif KR", "Nanum Myeongjo", Batang, serif',
            color: "#22252E",
          }}
        >
          {q}
        </h3>
        <Plus
          className={`w-4 h-4 flex-shrink-0 transition-transform duration-300 ${
            open ? "rotate-45" : ""
          }`}
          style={{ color: open ? "#2E6242" : "rgba(20,57,43,0.45)" }}
          aria-hidden="true"
        />
      </button>
      <div
        className={`overflow-hidden transition-all duration-300 ${
          open ? "max-h-96 pb-5" : "max-h-0"
        }`}
      >
        <p className="leading-relaxed text-sm max-w-2xl" style={{ color: "rgba(20,57,43,0.72)" }}>
          {a}
        </p>
      </div>
    </div>
  );
}
