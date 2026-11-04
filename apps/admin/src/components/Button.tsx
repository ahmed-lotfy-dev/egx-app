import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
  fullWidth?: boolean;
  leftIcon?: React.ReactNode;
  children: React.ReactNode;
}

const container: Record<Variant, string> = {
  primary: "bg-amber-600 hover:bg-amber-700 text-white",
  secondary: "border border-gray-300 bg-white hover:bg-gray-50 text-gray-900",
  ghost: "bg-transparent hover:bg-gray-100 text-gray-700",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = "primary",
      loading = false,
      fullWidth = false,
      leftIcon,
      disabled,
      className = "",
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        type="button"
        disabled={isDisabled}
        className={`min-h-12 flex-row items-center justify-center gap-2 rounded-2xl px-5 font-title text-[15px] active:opacity-80 transition-colors ${
          container[variant]
        } ${isDisabled ? "opacity-50 cursor-not-allowed" : ""} ${fullWidth ? "w-full" : ""} ${className}`}
        {...props}
      >
        {loading ? (
          <svg
            className="animate-spin h-5 w-5"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        ) : (
          <>
            {leftIcon && <span className="flex-shrink-0">{leftIcon}</span>}
            {children}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = "Button";