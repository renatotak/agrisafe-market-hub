import { ReactNode, ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: "bg-brand-primary text-white hover:bg-brand-dark",
  secondary: "bg-transparent text-brand-primary border border-brand-light hover:bg-brand-surface",
  ghost: "text-neutral-600 hover:bg-[rgba(0,0,0,0.04)]",
  danger: "bg-error text-white hover:bg-error-dark",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-3 py-1 text-[12px]",
  md: "px-4 py-2 text-[14px]",
  lg: "px-6 py-3 text-[16px]",
};

export function Button({ children, variant = "primary", size = "md", className = "", ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-md font-medium transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
