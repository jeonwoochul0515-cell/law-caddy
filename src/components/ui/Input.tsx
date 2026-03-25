import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";

/* ─── Input ─── */

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const inputBase =
  "w-full rounded-xl border border-border bg-navy-light px-4 py-2.5 text-sm text-text-primary placeholder:text-text-dim transition-colors duration-200 focus:border-gold focus:outline-none disabled:cursor-not-allowed disabled:opacity-50";

/** 텍스트 입력 */
const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = "", id, ...rest }, ref) => {
    const inputId = id ?? label?.replace(/\s+/g, "-").toLowerCase();

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-text-primary"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`${inputBase} ${error ? "border-error" : ""} ${className}`}
          {...rest}
        />
        {error && <p className="text-xs text-error">{error}</p>}
      </div>
    );
  },
);

Input.displayName = "Input";
export default Input;

/* ─── Textarea ─── */

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

const textareaBase =
  "w-full rounded-xl border border-border bg-navy-light px-4 py-2.5 text-sm text-text-primary placeholder:text-text-dim transition-colors duration-200 focus:border-gold focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 resize-y min-h-[100px]";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className = "", id, ...rest }, ref) => {
    const textareaId = id ?? label?.replace(/\s+/g, "-").toLowerCase();

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={textareaId}
            className="text-sm font-medium text-text-primary"
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={`${textareaBase} ${error ? "border-error" : ""} ${className}`}
          {...rest}
        />
        {error && <p className="text-xs text-error">{error}</p>}
      </div>
    );
  },
);

Textarea.displayName = "Textarea";
