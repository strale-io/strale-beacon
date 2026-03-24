/**
 * Static radar chart for PDF rendering using @react-pdf/renderer primitives.
 * Generates the same five-axis shape as the web RadarChart but as react-pdf Svg elements.
 */

import { Svg, Circle, Line, Path, G, Text as SvgText } from "@react-pdf/renderer";
import type { Tier } from "../checks/types";

interface PdfRadarChartProps {
  categories: Array<{ label: string; tier: Tier }>;
}

const TIER_VALUES: Record<Tier, number> = {
  green: 1.0,
  yellow: 0.5,
  red: 0.15,
};

const TIER_COLORS: Record<Tier, string> = {
  green: "#15803D",
  yellow: "#B45309",
  red: "#B91C1C",
};

const CHART_SIZE = 220;
const LABEL_OFFSET = 40;
const VIEW_SIZE = CHART_SIZE + LABEL_OFFSET * 2;
const CENTER = VIEW_SIZE / 2;
const RADIUS = CHART_SIZE / 2;

export default function PdfRadarChart({ categories }: PdfRadarChartProps) {
  const n = categories.length;
  const angleStep = (2 * Math.PI) / n;
  const startAngle = -Math.PI / 2;

  const getPoint = (index: number, value: number): [number, number] => {
    const angle = startAngle + index * angleStep;
    const r = RADIUS * value;
    return [CENTER + r * Math.cos(angle), CENTER + r * Math.sin(angle)];
  };

  // Grid rings
  const ringLevels = [0.33, 0.66, 1.0];
  const ringPaths = ringLevels.map((level) => {
    const points = Array.from({ length: n }, (_, i) => getPoint(i, level));
    return (
      points.map((p, i) => (i === 0 ? `M ${p[0]},${p[1]}` : `L ${p[0]},${p[1]}`)).join(" ") +
      " Z"
    );
  });

  // Data polygon
  const dataPoints = categories.map((cat, i) => getPoint(i, TIER_VALUES[cat.tier]));
  const dataPath =
    dataPoints.map((p, i) => (i === 0 ? `M ${p[0]},${p[1]}` : `L ${p[0]},${p[1]}`)).join(" ") +
    " Z";

  // Dominant tier for fill
  const tierCounts = { green: 0, yellow: 0, red: 0 };
  categories.forEach((c) => tierCounts[c.tier]++);
  const dominant: Tier =
    tierCounts.green >= tierCounts.yellow && tierCounts.green >= tierCounts.red
      ? "green"
      : tierCounts.yellow >= tierCounts.red
        ? "yellow"
        : "red";
  const fillColor = TIER_COLORS[dominant];

  return (
    <Svg viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`} style={{ width: 260, height: 260 }}>
      {/* Grid rings */}
      {ringPaths.map((d, i) => (
        <Path
          key={`ring-${i}`}
          d={d}
          fill="none"
          stroke="#E5E7EB"
          strokeWidth={ringLevels[i] === 1.0 ? 1.2 : 0.6}
          opacity={ringLevels[i] === 1.0 ? 0.7 : 0.35}
        />
      ))}

      {/* Axis lines */}
      {categories.map((_, i) => {
        const [x, y] = getPoint(i, 1.0);
        return (
          <Line
            key={`axis-${i}`}
            x1={CENTER}
            y1={CENTER}
            x2={x}
            y2={y}
            stroke="#E5E7EB"
            strokeWidth={0.6}
            opacity={0.4}
          />
        );
      })}

      {/* Data shape — fill */}
      <Path d={dataPath} fill={fillColor} fillOpacity={0.15} stroke={fillColor} strokeWidth={1.5} />

      {/* Vertex dots */}
      {dataPoints.map((p, i) => (
        <G key={`dot-${i}`}>
          <Circle cx={p[0]} cy={p[1]} r={4} fill={TIER_COLORS[categories[i].tier]} />
          <Circle cx={p[0]} cy={p[1]} r={4} fill="none" stroke="#FFFFFF" strokeWidth={1.2} />
        </G>
      ))}

      {/* Labels */}
      {categories.map((cat, i) => {
        const angle = startAngle + i * angleStep;
        const labelR = RADIUS + LABEL_OFFSET * 0.65;
        const x = CENTER + labelR * Math.cos(angle);
        const y = CENTER + labelR * Math.sin(angle);

        const isLeft = Math.cos(angle) < -0.1;
        const isRight = Math.cos(angle) > 0.1;
        const anchor = isLeft ? "end" : isRight ? "start" : "middle";

        return (
          <SvgText
            key={`label-${i}`}
            x={x}
            y={y + 3}
            textAnchor={anchor}
            style={{ fontSize: 9, fontFamily: "Helvetica", fontWeight: 500, fill: "#6B7280" }}
          >
            {cat.label}
          </SvgText>
        );
      })}
    </Svg>
  );
}
