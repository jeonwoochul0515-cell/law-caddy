import { forwardRef, type SelectHTMLAttributes } from "react";

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: SelectOption[];
}

const selectBase =
  "w-full appearance-none rounded-xl border border-border bg-navy-light px-4 py-2.5 pr-10 text-sm text-text-primary transition-colors duration-200 focus:border-gold focus:outline-none disabled:cursor-not-allowed disabled:opacity-50";

/** 다크 테마 셀렉트 드롭다운 */
const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, className = "", id, ...rest }, ref) => {
    const selectId = id ?? label?.replace(/\s+/g, "-").toLowerCase();

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={selectId}
            className="text-sm font-medium text-text-primary"
          >
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            className={`${selectBase} ${error ? "border-error" : ""} ${className}`}
            {...rest}
          >
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {/* 커스텀 화살표 아이콘 */}
          <svg
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-dim"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
        {error && <p className="text-xs text-error">{error}</p>}
      </div>
    );
  },
);

Select.displayName = "Select";
export default Select;
