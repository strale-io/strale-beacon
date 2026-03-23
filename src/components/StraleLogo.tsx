/**
 * Canonical Strale logo component.
 *
 * The Strale logo is a text-only wordmark: the word "strale" in lowercase,
 * rendered in Inter 600 (semibold) with tight tracking. This matches the
 * logo as displayed on strale.dev.
 *
 * Use this component everywhere the Strale logo appears — Header, Footer,
 * PDF reports, OG images — to ensure consistency.
 */

interface StraleLogoProps {
  /** "dark" for light backgrounds (default), "light" for dark backgrounds */
  variant?: "dark" | "light";
  /** Size class — maps to Tailwind text sizes */
  size?: "sm" | "md" | "lg";
  /** Whether to show "Beacon" sub-brand text */
  showBeacon?: boolean;
  className?: string;
}

const SIZE_CLASSES = {
  sm: "text-base",
  md: "text-lg",
  lg: "text-3xl",
};

const BEACON_SIZE_CLASSES = {
  sm: "text-base",
  md: "text-lg",
  lg: "text-3xl",
};

export default function StraleLogo({
  variant = "dark",
  size = "md",
  showBeacon = false,
  className = "",
}: StraleLogoProps) {
  const color = variant === "dark" ? "text-foreground" : "text-white";
  const sizeClass = SIZE_CLASSES[size];
  const beaconSizeClass = BEACON_SIZE_CLASSES[size];

  return (
    <span className={`inline-flex items-baseline gap-1.5 ${className}`}>
      <span
        className={`${sizeClass} font-semibold tracking-tight leading-none ${color}`}
      >
        strale
      </span>
      {showBeacon && (
        <span
          className={`${beaconSizeClass} font-medium tracking-tight leading-none text-brand`}
        >
          Beacon
        </span>
      )}
    </span>
  );
}

/**
 * Returns the Strale logo as plain text properties for use in non-React contexts
 * (PDF generation, OG images via Satori).
 */
export function getStraleLogoStyles(variant: "dark" | "light" = "dark") {
  return {
    text: "strale",
    fontFamily: "'Inter', system-ui, sans-serif",
    fontWeight: 600,
    letterSpacing: "-0.025em",
    color: variant === "dark" ? "#111827" : "#FFFFFF",
  };
}
