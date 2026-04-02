/**
 * Watermark badge to indicate mocked/simulated data.
 * Use this on any section that is NOT displaying live data from its actual source.
 *
 * Usage:
 *   <MockBadge />                    — default "MOCKED DATA" label
 *   <MockBadge inline />             — smaller inline version
 *   <MockBadge label="SIMULADO" />   — custom label
 */

interface MockBadgeProps {
  label?: string;
  inline?: boolean;
}

export function MockBadge({ label = "MOCKED DATA", inline = false }: MockBadgeProps) {
  if (inline) {
    return (
      <span className="inline-flex items-center gap-1 text-[9px] font-bold text-warning-dark bg-warning-light border border-[#FFE0B2] px-1.5 py-0.5 rounded uppercase tracking-wider">
        {label}
      </span>
    );
  }

  return (
    <div className="inline-flex items-center gap-1.5 text-[10px] font-bold text-warning-dark bg-warning-light border border-[#FFE0B2] px-2.5 py-1 rounded-md uppercase tracking-wider">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="shrink-0">
        <path d="M6 1L11 10H1L6 1Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <circle cx="6" cy="8" r="0.5" fill="currentColor" />
        <line x1="6" y1="4.5" x2="6" y2="6.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      </svg>
      {label}
    </div>
  );
}
