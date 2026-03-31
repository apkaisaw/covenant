/**
 * Animated SVG logo: three concentric hexagonal rings with breaches.
 * Outer ring: solid bone-gold glyphs. Middle: gap with orange glitch.
 * Inner: large breach with drifting ember particles.
 * Runic orbital text between rings. CRT scanlines. Ambient stars.
 */
export function CovenantLogo({ size = 280 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 400 400"
      width={size}
      height={size}
      xmlns="http://www.w3.org/2000/svg"
      style={{ overflow: "visible" }}
    >
      <defs>
        {/* Glow filters */}
        <filter id="glow-gold" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="glow-orange" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feColorMatrix in="blur" type="matrix" values="1.5 0 0 0 0  0.4 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="colored" />
          <feMerge><feMergeNode in="colored" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="glow-ember" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feColorMatrix in="blur" type="matrix" values="1.2 0 0 0 0  0.3 0 0 0 0  0 0 0 0 0  0 0 0 0.8 0" result="colored" />
          <feMerge><feMergeNode in="colored" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>

        {/* CRT scanline pattern */}
        <pattern id="scanlines" width="4" height="4" patternUnits="userSpaceOnUse">
          <rect width="4" height="2" fill="transparent" />
          <rect y="2" width="4" height="2" fill="rgba(0,0,0,0.06)" />
        </pattern>
      </defs>

      {/* Background stars */}
      <g opacity="0.4">
        {[[62, 45], [340, 78], [55, 320], [350, 290], [180, 30], [90, 180], [320, 200], [150, 360], [280, 50], [40, 250], [370, 160], [200, 370]].map(([cx, cy], i) => (
          <circle key={`s${i}`} cx={cx} cy={cy} r={i % 3 === 0 ? 1.2 : 0.7} fill={i % 4 === 0 ? "#b8943e" : "#e8dcc8"} opacity={0.3 + (i % 3) * 0.2}>
            <animate attributeName="opacity" values={`${0.1 + (i % 3) * 0.15};${0.4 + (i % 2) * 0.2};${0.1 + (i % 3) * 0.15}`} dur={`${3 + i % 4}s`} repeatCount="indefinite" />
          </circle>
        ))}
      </g>

      {/* Center group */}
      <g transform="translate(200, 200)">

        {/* === OUTER RING (r=90) — solid, bone-gold glyphs === */}
        <g filter="url(#glow-gold)">
          <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="120s" repeatCount="indefinite" />
          {hexRingGlyphs(90, 24, "#e8dcc8", 0.85, "{ } / \\ | - = + [ ] < >".split(" "), 0, 360)}
        </g>

        {/* Runic orbit between outer and middle */}
        <g opacity="0.15">
          <animateTransform attributeName="transform" type="rotate" from="360" to="0" dur="90s" repeatCount="indefinite" />
          {runicOrbit(75, "᛭ ᚱ ᛟ ᚲ ᛏ ᚢ ᛗ ᚨ ᛞ ᚺ ᛈ ᚷ".split(" "), "#b8943e")}
        </g>

        {/* === MIDDLE RING (r=60) — gap from 30° to 70° === */}
        <g filter="url(#glow-gold)">
          <animateTransform attributeName="transform" type="rotate" from="0" to="-360" dur="100s" repeatCount="indefinite" />
          {hexRingGlyphs(60, 18, "#d4c8a0", 0.7, "- = | / \\ + { }".split(" "), 70, 330)}
          {/* Orange glitch in the gap */}
          {breachGlitch(60, 30, 70, "#e85d26")}
        </g>

        {/* Runic orbit between middle and inner */}
        <g opacity="0.12">
          <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="70s" repeatCount="indefinite" />
          {runicOrbit(45, "ᚦ ᛊ ᚹ ᛃ ᛉ ᚠ".split(" "), "#8b6b2e")}
        </g>

        {/* === INNER RING (r=30) — large breach from 300° to 60° (120° missing) === */}
        <g filter="url(#glow-gold)">
          <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="80s" repeatCount="indefinite" />
          {hexRingGlyphs(30, 10, "#c8b888", 0.6, "/ \\ | { }".split(" "), 60, 240)}
          {/* Deep rust breach with embers */}
          {breachGlitch(30, 300, 60, "#8b2500")}
        </g>

        {/* Drifting ember particles from inner breach */}
        <g filter="url(#glow-ember)">
          {emberParticles()}
        </g>

        {/* Center core glow */}
        <circle r="6" fill="none" stroke="#b8943e" strokeWidth="0.5" opacity="0.3">
          <animate attributeName="r" values="4;7;4" dur="4s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.2;0.4;0.2" dur="4s" repeatCount="indefinite" />
        </circle>

      </g>

      {/* CRT scanlines overlay */}
      <rect width="400" height="400" fill="url(#scanlines)" opacity="0.5" />
    </svg>
  );
}

/** Generate glyph characters along a hex-ish ring arc */
function hexRingGlyphs(
  r: number, count: number, color: string, opacity: number,
  chars: string[], gapStart: number, gapEnd: number
) {
  const elements = [];
  for (let i = 0; i < count; i++) {
    const angle = (360 / count) * i;
    // Skip gap region
    const normAngle = ((angle % 360) + 360) % 360;
    if (gapStart < gapEnd) {
      if (normAngle >= gapStart && normAngle <= gapEnd) continue;
    } else {
      if (normAngle >= gapStart || normAngle <= gapEnd) continue;
    }
    const rad = (angle * Math.PI) / 180;
    const x = Math.cos(rad) * r;
    const y = Math.sin(rad) * r;
    const char = chars[i % chars.length];
    elements.push(
      <text
        key={`g${r}-${i}`}
        x={x} y={y}
        fill={color}
        opacity={opacity}
        fontSize={r > 70 ? 10 : r > 50 ? 8 : 6}
        fontFamily="'JetBrains Mono', monospace"
        fontWeight="700"
        textAnchor="middle"
        dominantBaseline="central"
        transform={`rotate(${angle}, ${x}, ${y})`}
      >
        {char}
      </text>
    );
  }
  return elements;
}

/** Glitch effect at breach point */
function breachGlitch(r: number, startDeg: number, endDeg: number, color: string) {
  const elements = [];
  const midDeg = (startDeg + endDeg) / 2 + (startDeg > endDeg ? 180 : 0);
  for (let i = 0; i < 5; i++) {
    const angle = midDeg + (Math.random() - 0.5) * 30;
    const rad = (angle * Math.PI) / 180;
    const dist = r + (Math.random() - 0.5) * 8;
    const x = Math.cos(rad) * dist;
    const y = Math.sin(rad) * dist;
    elements.push(
      <text
        key={`br${r}-${i}`}
        x={x} y={y}
        fill={color}
        fontSize={r > 50 ? 9 : 7}
        fontFamily="'JetBrains Mono', monospace"
        fontWeight="700"
        textAnchor="middle"
        dominantBaseline="central"
        opacity="0.8"
        filter="url(#glow-orange)"
      >
        <animate attributeName="opacity" values="0.3;0.9;0.3" dur={`${0.8 + i * 0.3}s`} repeatCount="indefinite" />
        <animate attributeName="dx" values="-2;2;-2" dur={`${0.5 + i * 0.2}s`} repeatCount="indefinite" />
        {"#@!?%"[i]}
      </text>
    );
  }
  // Breach glow arc
  const startRad = (startDeg * Math.PI) / 180;
  const endRad = ((endDeg < startDeg ? endDeg + 360 : endDeg) * Math.PI) / 180;
  const midRad = (startRad + endRad) / 2;
  elements.push(
    <circle
      key={`bg${r}`}
      cx={Math.cos(midRad) * r}
      cy={Math.sin(midRad) * r}
      r={12}
      fill="none"
      stroke={color}
      strokeWidth="0.5"
      opacity="0.4"
      filter="url(#glow-orange)"
    >
      <animate attributeName="opacity" values="0.2;0.5;0.2" dur="2s" repeatCount="indefinite" />
    </circle>
  );
  return elements;
}

/** Drifting ember particles from the inner ring breach */
function emberParticles() {
  const particles = [];
  for (let i = 0; i < 12; i++) {
    const angle = 340 + Math.random() * 40; // Around the breach area
    const rad = (angle * Math.PI) / 180;
    const startR = 30 + Math.random() * 5;
    const endR = 45 + Math.random() * 20;
    const startX = Math.cos(rad) * startR;
    const startY = Math.sin(rad) * startR;
    const endX = Math.cos(rad + (Math.random() - 0.5) * 0.3) * endR;
    const endY = Math.sin(rad + (Math.random() - 0.5) * 0.3) * endR;
    const dur = 3 + Math.random() * 4;
    const size = 1 + Math.random() * 1.5;
    const color = i % 3 === 0 ? "#e85d26" : i % 3 === 1 ? "#8b2500" : "#b8943e";

    particles.push(
      <circle key={`em${i}`} r={size} fill={color}>
        <animate attributeName="cx" values={`${startX};${endX};${startX}`} dur={`${dur}s`} repeatCount="indefinite" />
        <animate attributeName="cy" values={`${startY};${endY};${startY}`} dur={`${dur}s`} repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.8;0.1;0.8" dur={`${dur}s`} repeatCount="indefinite" />
      </circle>
    );
  }
  return particles;
}

/** Faint runic characters orbiting between rings */
function runicOrbit(r: number, runes: string[], color: string) {
  return runes.map((rune, i) => {
    const angle = (360 / runes.length) * i;
    const rad = (angle * Math.PI) / 180;
    const x = Math.cos(rad) * r;
    const y = Math.sin(rad) * r;
    return (
      <text
        key={`rn${r}-${i}`}
        x={x} y={y}
        fill={color}
        fontSize={7}
        textAnchor="middle"
        dominantBaseline="central"
        transform={`rotate(${angle + 90}, ${x}, ${y})`}
      >
        {rune}
      </text>
    );
  });
}
