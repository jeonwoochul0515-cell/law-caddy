// 랜딩페이지와 /faq 페이지가 공유하는 FAQ 아코디언 항목
import { useState } from "react";
import { ChevronDown } from "lucide-react";

export default function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-[#efeeea]">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-5 text-left group"
      >
        <h3 className="text-[#1b1c1a] font-medium pr-4 group-hover:text-[#735c00] transition-colors">
          {q}
        </h3>
        <ChevronDown
          className={`w-5 h-5 text-[#414846] flex-shrink-0 transition-transform duration-300 ${
            open ? "rotate-180 text-[#735c00]" : ""
          }`}
        />
      </button>
      <div
        className={`overflow-hidden transition-all duration-300 ${
          open ? "max-h-60 pb-5" : "max-h-0"
        }`}
      >
        <p className="text-[#414846] leading-relaxed text-sm">{a}</p>
      </div>
    </div>
  );
}
