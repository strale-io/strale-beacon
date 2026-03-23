"use client";

import { useEffect, useState } from "react";
import type { Tier } from "@/lib/checks/types";

interface CategoryScore {
  label: string;
  tier: Tier;
}

interface RadarChartProps {
  categories: CategoryScore[];
  size?: "sm" | "md" | "lg";
  animate?: boolean;
}

const TIER_VALUES: Record<Tier, number> = {
  green: 1.0,
  yellow: 0.5,
  red: 0.15,
};

const TIER_FILL: Record<Tier, string> = {
  green: "var(--tier-green)",
  yellow: "var(--tier-yellow)",
  red: "var(--tier-red)",
};

const SIZE_MAP = {
  sm: 80,
  md: 200,
  lg: 400,
};

const LABEL_OFFSET = {
  sm: 12,
  md: 48,
  lg: 64,
};

export default function RadarChart({
  categories,
  size = "lg",
  animate = true,
}: RadarChartProps) {
  const [visible, setVisible] = useState(!animate);

  useEffect(() => {
    if (animate) {
      const timer = setTimeout(() => setVisible(true), 50);
      return () => clearTimeout(timer);
    }
  }, [animate]);

  const chartSize = SIZE_MAP[size];
  const labelOffset = LABEL_OFFSET[size];
  const viewSize = chartSize + labelOffset * 2;
  const center = viewSize / 2;
  const radius = chartSize / 2;

  const n = categories.length;
  const angleStep = (2 * Math.PI) / n;
  const startAngle = -Math.PI / 2; // Start from top

  // Calculate point positions for a given value (0-1)
  const getPoint = (index: number, value: number): [number, number] => {
    const angle = startAngle + index * angleStep;
    const r = radius * value;
    return [center + r * Math.cos(angle), center + r * Math.sin(angle)];
  };

  // Build the data polygon points
  const dataPoints = categories.map((cat, i) =>
    getPoint(i, TIER_VALUES[cat.tier])
  );

  const dataPath = dataPoints
    .map((p, i) => (i === 0 ? `M ${p[0]},${p[1]}` : `L ${p[0]},${p[1]}`))
    .join(" ") + " Z";

  // Grid rings at 33%, 66%, 100%
  const ringLevels = [0.33, 0.66, 1.0];

  // Determine dominant tier for fill color
  const tierCounts = { green: 0, yellow: 0, red: 0 };
  categories.forEach((c) => tierCounts[c.tier]++);
  const dominant: Tier = tierCounts.green >= tierCounts.yellow && tierCounts.green >= tierCounts.red
    ? "green"
    : tierCounts.yellow >= tierCounts.red
      ? "yellow"
      : "red";

  const fillColor = TIER_FILL[dominant];
  const showLabels = size !== "sm";
  const fontSize = size === "lg" ? 13 : size === "md" ? 10 : 8;

  return (
    <svg
      viewBox={`0 0 ${viewSize} ${viewSize}`}
      width="100%"
      height="100%"
      style={{ maxWidth: viewSize, maxHeight: viewSize }}
      overflow="visible"
      className="block mx-auto"
      role="img"
      aria-label={`Radar chart showing agent readiness: ${categories.map((c) => `${c.label}: ${c.tier}`).join(", ")}`}
    >
      {/* Grid rings */}
      {ringLevels.map((level) => {
        const ringPoints = Array.from({ length: n }, (_, i) => getPoint(i, level));
        const ringPath = ringPoints
          .map((p, i) => (i === 0 ? `M ${p[0]},${p[1]}` : `L ${p[0]},${p[1]}`))
          .join(" ") + " Z";
        return (
          <path
            key={level}
            d={ringPath}
            fill="none"
            stroke="var(--border-default)"
            strokeWidth={level === 1.0 ? 1.5 : 0.75}
            opacity={level === 1.0 ? 0.6 : 0.3}
          />
        );
      })}

      {/* Axis lines */}
      {categories.map((_, i) => {
        const [x, y] = getPoint(i, 1.0);
        return (
          <line
            key={i}
            x1={center}
            y1={center}
            x2={x}
            y2={y}
            stroke="var(--border-default)"
            strokeWidth={0.75}
            opacity={0.4}
          />
        );
      })}

      {/* Data shape */}
      <g
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? "scale(1)" : "scale(0.3)",
          transformOrigin: `${center}px ${center}px`,
          transition: "opacity 0.5s ease-out, transform 0.5s ease-out",
        }}
      >
        {/* Fill */}
        <path
          d={dataPath}
          fill={fillColor}
          fillOpacity={0.15}
          stroke={fillColor}
          strokeWidth={2}
          strokeLinejoin="round"
        />

        {/* Tier-colored dots at each vertex */}
        {dataPoints.map((p, i) => (
          <circle
            key={i}
            cx={p[0]}
            cy={p[1]}
            r={size === "sm" ? 2.5 : size === "md" ? 4 : 5}
            fill={TIER_FILL[categories[i].tier]}
            stroke="#fff"
            strokeWidth={size === "sm" ? 1 : 1.5}
          />
        ))}
      </g>

      {/* Labels */}
      {showLabels &&
        categories.map((cat, i) => {
          const angle = startAngle + i * angleStep;
          const labelR = radius + labelOffset * 0.7;
          const x = center + labelR * Math.cos(angle);
          const y = center + labelR * Math.sin(angle);

          // Text anchor based on position
          const isLeft = Math.cos(angle) < -0.1;
          const isRight = Math.cos(angle) > 0.1;
          const anchor = isLeft ? "end" : isRight ? "start" : "middle";

          return (
            <text
              key={i}
              x={x}
              y={y}
              textAnchor={anchor}
              dominantBaseline="central"
              fontSize={fontSize}
              fontFamily="var(--font-sans)"
              fontWeight={500}
              fill="var(--text-secondary)"
            >
              {cat.label}
            </text>
          );
        })}
    </svg>
  );
}
