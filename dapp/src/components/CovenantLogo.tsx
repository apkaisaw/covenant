/**
 * Animated SVG logo: three concentric hexagonal rings.
 * Outer: complete. Middle: small breach. Inner: large breach with embers.
 * Clean, bold, visible.
 */
export function CovenantLogo({ size = 280 }: { size?: number }) {
  // Generate hexagon points at given radius
  const hex = (r: number) =>
    Array.from({ length: 7 }, (_, i) => {
      const a = (Math.PI / 3) * i - Math.PI / 2;
      return `${200 + r * Math.cos(a)},${200 + r * Math.sin(a)}`;
    }).join(" ");

  // Generate partial hexagon arc (skip segment between idx start and end)
  const hexArc = (r: number, skipStart: number, skipEnd: number) => {
    const points: string[] = [];
    for (let i = 0; i <= 6; i++) {
      const seg = i % 6;
      if (seg >= skipStart && seg < skipEnd) {
        if (points.length > 0) points.push("M"); // break the path
        continue;
      }
      const a = (Math.PI / 3) * i - Math.PI / 2;
      points.push(`${200 + r * Math.cos(a)},${200 + r * Math.sin(a)}`);
    }
    return points;
  };

  // Hex path as polyline points string, skipping segments
  const hexPath = (r: number, skip?: [number, number]) => {
    const pts: [number, number][] = [];
    for (let i = 0; i <= 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 2;
      pts.push([200 + r * Math.cos(a), 200 + r * Math.sin(a)]);
    }
    if (!skip) return pts.map((p) => p.join(",")).join(" ");

    // Build path with a gap
    let d = "";
    for (let i = 0; i < 6; i++) {
      if (i >= skip[0] && i < skip[1]) continue;
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[i + 1];
      d += `M${x1},${y1} L${x2},${y2} `;
    }
    return d;
  };

  return (
    <svg viewBox="0 0 400 400" width={size} height={size}>
      <defs>
        <filter id="g1" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="g2" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="5" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Outer ring — complete, solid gold */}
      <polyline
        points={hex(100)}
        fill="none"
        stroke="#b8943e"
        strokeWidth="2"
        opacity="0.9"
        filter="url(#g1)"
      >
        <animateTransform attributeName="transform" type="rotate" from="0 200 200" to="360 200 200" dur="120s" repeatCount="indefinite" />
      </polyline>

      {/* Middle ring — 1 segment missing (breach) */}
      <path
        d={hexPath(70, [2, 3])}
        fill="none"
        stroke="#d4c8a0"
        strokeWidth="1.8"
        opacity="0.8"
        filter="url(#g1)"
      >
        <animateTransform attributeName="transform" type="rotate" from="0 200 200" to="-360 200 200" dur="90s" repeatCount="indefinite" />
      </path>
      {/* Middle breach glow */}
      {(() => {
        const a1 = (Math.PI / 3) * 2 - Math.PI / 2;
        const a2 = (Math.PI / 3) * 3 - Math.PI / 2;
        const cx = 200 + 70 * Math.cos((a1 + a2) / 2);
        const cy = 200 + 70 * Math.sin((a1 + a2) / 2);
        return (
          <circle cx={cx} cy={cy} r="14" fill="none" stroke="#e85d26" strokeWidth="1" opacity="0.6" filter="url(#g2)">
            <animate attributeName="opacity" values="0.3;0.7;0.3" dur="2s" repeatCount="indefinite" />
            <animateTransform attributeName="transform" type="rotate" from="0 200 200" to="-360 200 200" dur="90s" repeatCount="indefinite" />
          </circle>
        );
      })()}

      {/* Inner ring — 2 segments missing (large breach) */}
      <path
        d={hexPath(40, [4, 6])}
        fill="none"
        stroke="#c8b888"
        strokeWidth="1.5"
        opacity="0.7"
        filter="url(#g1)"
      >
        <animateTransform attributeName="transform" type="rotate" from="0 200 200" to="360 200 200" dur="70s" repeatCount="indefinite" />
      </path>
      {/* Inner breach glow — larger, rust */}
      {(() => {
        const a1 = (Math.PI / 3) * 4 - Math.PI / 2;
        const a2 = (Math.PI / 3) * 6 - Math.PI / 2;
        const cx = 200 + 40 * Math.cos((a1 + a2) / 2);
        const cy = 200 + 40 * Math.sin((a1 + a2) / 2);
        return (
          <circle cx={cx} cy={cy} r="18" fill="none" stroke="#8b2500" strokeWidth="1.5" opacity="0.5" filter="url(#g2)">
            <animate attributeName="opacity" values="0.3;0.6;0.3" dur="1.8s" repeatCount="indefinite" />
            <animateTransform attributeName="transform" type="rotate" from="0 200 200" to="360 200 200" dur="70s" repeatCount="indefinite" />
          </circle>
        );
      })()}

      {/* Ember particles drifting from inner breach */}
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
        const baseAngle = (Math.PI / 3) * (4.5 + i * 0.25) - Math.PI / 2;
        const r1 = 35 + i * 2;
        const r2 = 55 + i * 5;
        const x1 = 200 + r1 * Math.cos(baseAngle);
        const y1 = 200 + r1 * Math.sin(baseAngle);
        const x2 = 200 + r2 * Math.cos(baseAngle + (i % 2 ? 0.1 : -0.1));
        const y2 = 200 + r2 * Math.sin(baseAngle + (i % 2 ? 0.1 : -0.1));
        const color = i % 3 === 0 ? "#e85d26" : i % 3 === 1 ? "#b8943e" : "#8b2500";
        return (
          <circle key={i} r={1.5 - i * 0.1} fill={color} filter="url(#g2)">
            <animate attributeName="cx" values={`${x1};${x2};${x1}`} dur={`${3 + i * 0.5}s`} repeatCount="indefinite" />
            <animate attributeName="cy" values={`${y1};${y2};${y1}`} dur={`${3 + i * 0.5}s`} repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.9;0.2;0.9" dur={`${3 + i * 0.5}s`} repeatCount="indefinite" />
          </circle>
        );
      })}

      {/* Faint runic orbit between outer and middle */}
      <g opacity="0.2">
        <animateTransform attributeName="transform" type="rotate" from="360 200 200" to="0 200 200" dur="100s" repeatCount="indefinite" />
        {"᛭ᚱᛟᚲᛏᚢᛗᚨ".split("").map((r, i) => {
          const a = (Math.PI / 4) * i - Math.PI / 2;
          return (
            <text key={i} x={200 + 85 * Math.cos(a)} y={200 + 85 * Math.sin(a)} fill="#b8943e" fontSize="8" textAnchor="middle" dominantBaseline="central">
              {r}
            </text>
          );
        })}
      </g>

      {/* Center dot */}
      <circle cx="200" cy="200" r="3" fill="#b8943e" opacity="0.6">
        <animate attributeName="opacity" values="0.3;0.7;0.3" dur="3s" repeatCount="indefinite" />
        <animate attributeName="r" values="2;4;2" dur="3s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}
