/**
 * Canonical Strale logo component.
 *
 * Matches strale.dev exactly: "strale" in lowercase, Inter 600, tracking-tight.
 * Beacon variant: "strale" in dark + "beacon" in grey (#9CA3AF), same weight.
 */

interface StraleLogoProps {
  variant?: "dark" | "light";
  showBeacon?: boolean;
  className?: string;
}

export default function StraleLogo({
  variant = "dark",
  showBeacon = false,
  className = "",
}: StraleLogoProps) {
  const color = variant === "dark" ? "text-foreground" : "text-white";

  return (
    <span className={`inline-flex items-baseline gap-1.5 ${className}`}>
      <span className={`text-[20px] font-semibold tracking-tight leading-none ${color}`}>
        strale
      </span>
      {showBeacon && (
        <span className="text-[20px] font-semibold tracking-tight leading-none text-text-muted">
          beacon
        </span>
      )}
    </span>
  );
}

/**
 * Logo styles for non-React contexts (PDF, OG images).
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
