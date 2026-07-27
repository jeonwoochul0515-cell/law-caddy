// 랜딩페이지와 /faq 페이지가 공유하는 FAQ 아코디언 항목
import { useState } from "react";
import { Plus } from "lucide-react";

export default function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b" style={{ borderColor: "rgba(20,24,35,0.1)" }}>
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="w-full flex items-center justify-between py-5 text-left group focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C8A961]"
      >
        <h3
          className="pr-4 font-semibold text-[15px] transition-colors group-hover:text-[#8F7434]"
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
          style={{ color: open ? "#8F7434" : "#9A9CA3" }}
        />
      </button>
      <div
        className={`overflow-hidden transition-all duration-300 ${
          open ? "max-h-60 pb-5" : "max-h-0"
        }`}
      >
        <p className="leading-relaxed text-sm max-w-2xl" style={{ color: "#676A72" }}>
          {a}
        </p>
      </div>
    </div>
  );
}
