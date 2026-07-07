/** Decorative cricket-pitch motifs for sports-academy niche hero sections. Pure SVG, no imagery. */
import type { CSSProperties } from "react";

/** Mowed-turf stripe texture — tiles across the hero as a subtle overlay above the brand gradient. */
export function PitchStripes({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      aria-hidden="true"
      preserveAspectRatio="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern
          id="pitch-mow-stripes"
          width="64"
          height="64"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(18)"
        >
          <rect width="32" height="64" fill="white" fillOpacity="0.05" />
          <rect x="32" width="32" height="64" fill="black" fillOpacity="0.04" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#pitch-mow-stripes)" />
    </svg>
  );
}

/**
 * Faint line-art watermark of a cricket pitch: batting/bowling creases at each end
 * of a 22-yard strip, plus a boundary arc. Deliberately abstract, not a mascot.
 */
export function PitchWatermark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 400 400"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g stroke="white" strokeOpacity="0.14" strokeWidth="2" fill="none">
        <path d="M60 380 A 340 340 0 0 1 380 60" />
        <rect x="150" y="20" width="60" height="360" rx="1" />
        {[70, 320].map((y) => (
          <g key={y}>
            <line x1="130" y1={y} x2="230" y2={y} />
            <line x1="140" y1={y - 14} x2="140" y2={y + 14} />
            <line x1="220" y1={y - 14} x2="220" y2={y + 14} />
          </g>
        ))}
      </g>
    </svg>
  );
}

/** Recurring seam-stitch section divider — small alternating ticks along a line, like a ball's seam. */
export function SeamDivider({ className, style }: { className?: string; style?: CSSProperties }) {
  const ticks = Array.from({ length: 40 }, (_, i) => i);
  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 800 12"
      preserveAspectRatio="none"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <line x1="0" y1="6" x2="800" y2="6" stroke="currentColor" strokeOpacity="0.25" />
      {ticks.map((i) => (
        <line
          key={i}
          x1={i * 20 + 4}
          y1="1"
          x2={i * 20 + 12}
          y2="11"
          stroke="currentColor"
          strokeOpacity="0.35"
          strokeWidth="1.5"
        />
      ))}
    </svg>
  );
}
