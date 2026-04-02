import { ReactNode } from "react";

interface KpiCardProps {
  icon?: ReactNode;
  label: string;
  value: string | number;
  trend?: { value: string; positive: boolean } | null;
  iconBg?: string;
  className?: string;
}

export function KpiCard({ icon, label, value, trend, iconBg = "bg-brand-surface text-brand-primary", className = "" }: KpiCardProps) {
  return (
    <div className={`bg-white rounded-lg border border-neutral-200 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.03)] transition-all duration-150 hover:-translate-y-0.5 hover:shadow-[0_2px_4px_rgba(0,0,0,0.06)] ${className}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[12px] font-medium text-neutral-500 mb-1">{label}</p>
          <p className="text-[24px] font-bold text-neutral-900 tracking-tight leading-tight">{value}</p>
          {trend && (
            <p className={`text-[12px] font-semibold mt-1 ${trend.positive ? "text-success-dark" : "text-error"}`}>
              {trend.positive ? "\u2191" : "\u2193"} {trend.value}
            </p>
          )}
        </div>
        {icon && (
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
