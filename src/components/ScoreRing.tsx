interface ScoreRingProps {
  ready: number;
  total: number;
  size?: number;
}

function getTier(ready: number, total: number): "green" | "yellow" | "red" {
  if (ready >= total) return "green";
  if (ready >= Math.ceil(total / 2)) return "yellow";
  return "red";
}

const TIER_STYLES = {
  green: { border: "#15803D", bg: "#F0FDF4", text: "#15803D" },
  yellow: { border: "#B45309", bg: "#FEFCE8", text: "#B45309" },
  red: { border: "#B91C1C", bg: "#FEF2F2", text: "#B91C1C" },
};

export default function ScoreRing({ ready, total, size = 130 }: ScoreRingProps) {
  const tier = getTier(ready, total);
  const styles = TIER_STYLES[tier];
  const numSize = size * 0.34;
  const labelSize = size * 0.1;

  return (
    <div
      className="flex items-center justify-center rounded-full flex-shrink-0"
      style={{
        width: size,
        height: size,
        border: `3px solid ${styles.border}`,
        backgroundColor: styles.bg,
      }}
    >
      <div className="text-center">
        <div
          className="font-semibold leading-none"
          style={{ fontSize: numSize, color: styles.text }}
        >
          {ready}
        </div>
        <div
          className="mt-1 leading-none"
          style={{ fontSize: labelSize, color: styles.text }}
        >
          of {total} ready
        </div>
      </div>
    </div>
  );
}
