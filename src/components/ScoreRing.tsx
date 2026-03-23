interface ScoreRingProps {
  ready: number;
  total: number;
}

function getTier(ready: number): "green" | "yellow" | "red" {
  if (ready >= 5) return "green";
  if (ready >= 3) return "yellow";
  return "red";
}

const TIER_STYLES = {
  green: { border: "#16A34A", bg: "#F0FDF4", text: "#16A34A" },
  yellow: { border: "#CA8A04", bg: "#FEFCE8", text: "#CA8A04" },
  red: { border: "#DC2626", bg: "#FEF2F2", text: "#DC2626" },
};

export default function ScoreRing({ ready, total }: ScoreRingProps) {
  const tier = getTier(ready);
  const styles = TIER_STYLES[tier];

  return (
    <div
      className="flex items-center justify-center rounded-full"
      style={{
        width: 130,
        height: 130,
        border: `3px solid ${styles.border}`,
        backgroundColor: styles.bg,
      }}
    >
      <div className="text-center">
        <div
          className="font-semibold leading-none"
          style={{ fontSize: 44, color: styles.text }}
        >
          {ready}
        </div>
        <div
          className="mt-1 leading-none"
          style={{ fontSize: 13, color: styles.text }}
        >
          of {total} ready
        </div>
      </div>
    </div>
  );
}
