import { InputHTMLAttributes, forwardRef } from "react";

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "textContentType"> {
  label: string;
  error?: string;
  textContentType?: string;
  onSubmitEditing?: (e: React.FormEvent<HTMLInputElement>) => void;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  ({ label, error, className = "", id, textContentType, onSubmitEditing, ...props }, ref) => {
    const inputId = id || label;

    return (
      <div className="w-full">
        <label
          htmlFor={inputId}
          className="block font-label text-[13px] text-gray-700 mb-1.5"
        >
          {label}
        </label>
        <input
          ref={ref}
          id={inputId}
          className={`w-full min-h-12 px-4 rounded-xl border bg-white text-gray-900 placeholder:text-gray-400 transition-colors ${
            error ? "border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-200" : "border-gray-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
          } ${className}`}
          aria-invalid={error ? "true" : "false"}
          aria-describedby={error ? `${inputId}-error` : undefined}
          // @ts-expect-error - textContentType is valid for input but not in React types
          textContentType={textContentType}
          onKeyDown={onSubmitEditing ? (e) => { if (e.key === "Enter") onSubmitEditing(e as any); } : undefined}
          {...props}
        />
        {error && (
          <p id={`${inputId}-error`} className="mt-1.5 font-body text-[12px] text-red-600">
            {error}
          </p>
        )}
      </div>
    );
  }
);

TextField.displayName = "TextField";