import type { ReactNode } from "react";

/**
 * One hand-built geometric pattern per filter card (100 x 100 canvas, cropped to the card). Only white and black at
 * very low opacity (kept subtle on purpose), so each takes the card's colour. No two filters share a design.
 */
const L = "rgba(255,255,255,0.12)";
const L2 = "rgba(255,255,255,0.06)";
const D = "rgba(0,0,0,0.09)";
const D2 = "rgba(0,0,0,0.16)";
const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const pts = (...p: number[]) => p.reduce<string[]>((a, v, i) => (i % 2 ? ((a[a.length - 1] += "," + v), a) : (a.push(String(v)), a)), []).join(" ");
const star = (cx: number, cy: number, R: number, r: number, rot = 0) =>
  pts(...range(10).flatMap((i) => { const a = ((i * 36 + rot - 90) * Math.PI) / 180, d = i % 2 ? r : R; return [+(cx + d * Math.cos(a)).toFixed(1), +(cy + d * Math.sin(a)).toFixed(1)]; }));
/** A wedge from (cx,cy) between two angles (degrees), long enough to leave the card. */
const wedge = (cx: number, cy: number, a1: number, a2: number) => {
  const p = (a: number) => [cx + 160 * Math.cos((a * Math.PI) / 180), cy + 160 * Math.sin((a * Math.PI) / 180)] as const;
  const [x1, y1] = p(a1), [x2, y2] = p(a2);
  return pts(cx, cy, x1, y1, x2, y2);
};

const P: Record<string, () => ReactNode> = {
  // Languages
  "language:en": () => ( // diamonds stepping inward
    <>{[58, 44, 30, 16].map((r, i) => <polygon key={r} points={pts(72, 30 - r, 72 + r, 30, 72, 30 + r, 72 - r, 30)} fill={i % 2 ? D : L} />)}</>
  ),
  "language:es": () => ( // a sun: rays from the bottom right
    <>{range(7).map((i) => <polygon key={i} points={wedge(88, 88, 180 + i * 13, 190 + i * 13)} fill={i % 2 ? D : L} />)}<circle cx="88" cy="88" r="16" fill={L} /></>
  ),

  // Genres
  "genre:country": () => ( // rows of scallops
    <>{range(7).flatMap((r) => range(6).map((c) => <circle key={r + "-" + c} cx={c * 24 + (r % 2) * 12 - 6} cy={r * 14} r="12" fill={(r + c) % 2 ? D : "none"} stroke={L} strokeWidth="2.5" />))}</>
  ),
  "genre:rnb": () => ( // three circles that overlap
    <><circle cx="62" cy="32" r="30" fill={L} /><circle cx="82" cy="52" r="30" fill={L} /><circle cx="48" cy="58" r="22" fill={D} /></>
  ),
  "genre:jazz": () => ( // piano keys
    <>{range(8).map((i) => <rect key={i} x={i * 14} y="0" width="14" height="100" fill={i % 2 ? L2 : L} />)}{[1, 2, 4, 5, 7].map((i) => <rect key={i} x={i * 14 - 4.5} y="0" width="9" height="56" rx="1.5" fill={D2} />)}</>
  ),
  "genre:electronic": () => ( // equaliser bars
    <>{[34, 58, 82, 46, 96, 62, 40, 72, 28].map((h, i) => <rect key={i} x={5 + i * 10.4} y="0" width="8" height={h} rx="2" fill={i % 2 ? D : L} />)}</>
  ),
  "genre:oldies": () => ( // a record
    <><circle cx="70" cy="36" r="52" fill={D} /><circle cx="70" cy="36" r="42" fill="none" stroke={L2} strokeWidth="2" /><circle cx="70" cy="36" r="33" fill="none" stroke={L2} strokeWidth="2" /><circle cx="70" cy="36" r="14" fill={L} /><circle cx="70" cy="36" r="3" fill={D2} /></>
  ),
  "genre:disney": () => ( // stars
    <>{([[74, 22, 20], [30, 14, 11], [52, 52, 9], [86, 66, 12], [18, 46, 8], [60, 84, 7]] as const).map(([x, y, R], i) => <polygon key={i} points={star(x, y, R, R * 0.42, i * 12)} fill={i % 2 ? D : L} />)}</>
  ),
  "genre:christmas": () => ( // a grid of little pine trees
    <>{range(6).flatMap((r) => range(6).map((c) => <polygon key={r + "-" + c} points={pts(c * 20 + (r % 2) * 10 - 10, r * 17 + 17, c * 20 + (r % 2) * 10, r * 17, c * 20 + (r % 2) * 10 + 10, r * 17 + 17)} fill={(r + c) % 3 === 0 ? L : (r + c) % 3 === 1 ? D : "none"} />))}</>
  ),
  "genre:gospel": () => ( // light beams fanning up
    <>{range(8).map((i) => <polygon key={i} points={wedge(50, 108, -165 + i * 18, -155 + i * 18)} fill={i % 2 ? L2 : L} />)}<circle cx="50" cy="108" r="26" fill={L2} /></>
  ),
  "genre:balada": () => ( // a flower
    <>{range(8).map((i) => <ellipse key={i} cx="68" cy="14" rx="9" ry="19" transform={`rotate(${i * 45} 68 34)`} fill={i % 2 ? D : L} />)}<circle cx="68" cy="34" r="8" fill={D2} /></>
  ),
  "genre:tropical": () => ( // diamond lattice with a dot in each
    <>{range(5).flatMap((r) => range(5).map((c) => { const x = c * 25 + (r % 2) * 12.5, y = r * 20; return <g key={r + "-" + c}><polygon points={pts(x, y - 12.5, x + 12.5, y, x, y + 12.5, x - 12.5, y)} fill={(r + c) % 2 ? D : L} /><circle cx={x} cy={y} r="2.5" fill={L} /></g>; }))}</>
  ),
  "genre:regional-mexican": () => ( // serape: bands with a row of triangles
    <><rect y="6" width="100" height="14" fill={L} /><rect y="26" width="100" height="5" fill={D} />{range(10).map((i) => <polygon key={i} points={pts(i * 10, 52, i * 10 + 5, 36, i * 10 + 10, 52)} fill={L} />)}<rect y="52" width="100" height="14" fill={D} /><rect y="72" width="100" height="5" fill={L} /><rect y="83" width="100" height="14" fill={L2} /></>
  ),
  "genre:reggaeton": () => ( // big chevrons
    <>{range(6).map((i) => { const y = i * 22 - 10; return <polygon key={i} points={pts(0, y + 22, 50, y, 100, y + 22, 100, y + 40, 50, y + 18, 0, y + 40)} fill={i % 2 ? D : L} />; })}</>
  ),
  "genre:punk": () => ( // lightning zigzags
    <>{range(6).map((i) => <polyline key={i} points={pts(...range(9).flatMap((k) => [k * 12.5, 8 + i * 17 + (k % 2) * 12]))} fill="none" stroke={i % 2 ? D2 : L} strokeWidth="5" strokeLinejoin="miter" />)}</>
  ),
  "genre:metal": () => ( // jagged teeth
    <>{range(5).map((i) => <polygon key={"a" + i} points={pts(i * 22 - 6, 0, i * 22 + 16, 0, i * 22 + 5, 52)} fill={L} />)}{range(5).map((i) => <polygon key={"b" + i} points={pts(i * 22 + 5, 0, i * 22 + 27, 0, i * 22 + 16, 34)} fill={D2} />)}<polygon points={pts(100, 100, 100, 46, 54, 100)} fill={L2} /></>
  ),
  "genre:alternative": () => ( // misaligned blocks, like a glitch
    <>{([[0, 30], [22, 40], [6, 22], [34, 34], [14, 46], [2, 28], [26, 38]] as const).map(([x, w], r) => <rect key={r} x={x + 30} y={r * 14.5} width={w} height="12" fill={r % 3 === 0 ? D : r % 3 === 1 ? L : L2} />)}{([[0, 18], [10, 24], [4, 14]] as const).map(([x, w], r) => <rect key={"x" + r} x={x} y={r * 29} width={w} height="12" fill={D} />)}</>
  ),
  "genre:new-wave": () => ( // a retro sun over a perspective grid
    <><circle cx="50" cy="48" r="32" fill={L} />{[52, 60, 69].map((y, i) => <rect key={y} x="0" y={y} width="100" height={2 + i * 2} fill={D2} />)}{range(9).map((i) => <line key={i} x1="50" y1="48" x2={-120 + i * 42} y2="130" stroke={L2} strokeWidth="1.6" />)}</>
  ),
  "genre:indie": () => ( // confetti
    <>{([[16, 18, 7], [48, 10, 4], [78, 22, 9], [30, 44, 5], [64, 52, 6], [90, 56, 4], [12, 72, 8], [52, 80, 5], [82, 86, 7]] as const).map(([x, y, r], i) => i % 3 === 2 ? <rect key={i} x={x - r} y={y - r} width={r * 2} height={r * 2} transform={`rotate(25 ${x} ${y})`} fill={D} /> : i % 3 === 1 ? <polygon key={i} points={pts(x, y - r, x + r, y + r, x - r, y + r)} fill={L} /> : <circle key={i} cx={x} cy={y} r={r} fill={L} />)}</>
  ),
  "genre:soul": () => ( // arches rising
    <>{[14, 28, 42, 56].map((r, i) => <path key={r} d={`M${72 - r} 72 A${r} ${r} 0 0 1 ${72 + r} 72`} fill="none" stroke={i % 2 ? D : L} strokeWidth="9" />)}</>
  ),
  "genre:funk": () => ( // fat waves
    <>{range(6).map((i) => <path key={i} d={`M-5 ${10 + i * 17} q12.5 -14 25 0 t25 0 t25 0 t25 0 t25 0`} fill="none" stroke={i % 2 ? D : L} strokeWidth="7" />)}</>
  ),
  "genre:disco": () => ( // a mirror ball with sparkles
    <><circle cx="62" cy="38" r="36" fill={L} />{[-22, -8, 6, 20].map((dy) => <ellipse key={dy} cx="62" cy={38 + dy} rx={Math.sqrt(36 * 36 - dy * dy)} ry="0.1" stroke={D2} strokeWidth="1.6" fill="none" />)}{[13, 25].map((rx) => <ellipse key={rx} cx="62" cy="38" rx={rx} ry="36" fill="none" stroke={D2} strokeWidth="1.6" />)}<line x1="62" y1="2" x2="62" y2="74" stroke={D2} strokeWidth="1.6" /><polygon points={star(16, 20, 9, 2.5)} fill={L} /><polygon points={star(14, 62, 6, 1.8)} fill={L} /><polygon points={star(92, 90, 8, 2.2)} fill={L} /></>
  ),
  "genre:folk": () => ( // mountain ridges
    <><polygon points={pts(0, 58, 24, 26, 44, 50, 70, 14, 100, 52, 100, 100, 0, 100)} fill={L2} /><polygon points={pts(0, 78, 30, 46, 52, 72, 78, 40, 100, 68, 100, 100, 0, 100)} fill={L} /><polygon points={pts(0, 96, 36, 68, 62, 90, 100, 62, 100, 100, 0, 100)} fill={D} /></>
  ),
  "genre:blues": () => ( // a staff with notes
    <>{[14, 27, 40, 53, 66].map((y) => <rect key={y} x="0" y={y} width="100" height="2.4" fill={L} />)}{([[26, 60], [52, 34], [78, 47]] as const).map(([x, y], i) => <g key={i}><circle cx={x} cy={y} r="6.5" fill={D2} /><rect x={x + 5} y={y - 26} width="2.4" height="26" fill={D2} /></g>)}</>
  ),
  "genre:reggae": () => ( // three bands and a sun
    <><rect y="6" width="100" height="24" fill={L} /><rect y="38" width="100" height="24" fill={D} /><rect y="70" width="100" height="24" fill={L} /><circle cx="68" cy="50" r="22" fill={L} /></>
  ),
  "genre:tango": () => ( // crossing diagonals
    <>{range(16).map((i) => <line key={"a" + i} x1={i * 14 - 40} y1="0" x2={i * 14 + 60} y2="100" stroke={L} strokeWidth="2.4" />)}{range(16).map((i) => <line key={"b" + i} x1={i * 14 + 60} y1="0" x2={i * 14 - 40} y2="100" stroke={D} strokeWidth="2.4" />)}<polygon points={pts(70, 8, 92, 30, 70, 52, 48, 30)} fill={L} /></>
  ),
  "genre:flamenco": () => ( // flames in rows
    <>{range(4).flatMap((r) => range(5).map((c) => { const x = c * 24 + (r % 2) * 12, y = r * 24 + 4; return <path key={r + "-" + c} d={`M${x} ${y + 26} C${x - 11} ${y + 12} ${x + 4} ${y + 8} ${x + 2} ${y - 8} C${x + 18} ${y + 4} ${x + 21} ${y + 16} ${x} ${y + 26}Z`} fill={(r + c) % 2 ? D : L} />; }))}</>
  ),
  "genre:bossa-nova": () => ( // dots shrinking and growing in rows
    <>{range(5).flatMap((j) => range(9).map((i) => <circle key={j + "-" + i} cx={i * 12.5 + (j % 2) * 6} cy={j * 20 + 8} r={1.6 + ((i + j * 2) % 5) * 1.7} fill={L} />))}</>
  ),
  "genre:sertanejo": () => ( // contour lines, like fields seen from above
    <>{range(8).map((i) => <ellipse key={i} cx="62" cy="34" rx={8 + i * 11} ry={5 + i * 7} transform="rotate(-28 62 34)" fill="none" stroke={i % 2 ? D : L} strokeWidth="4" />)}</>
  ),
  "genre:soundtrack": () => ( // film strip and a reel
    <>{range(8).flatMap((i) => [<rect key={"l" + i} x="4" y={i * 14 + 3} width="7" height="9" rx="1.5" fill={L} />, <rect key={"r" + i} x="89" y={i * 14 + 3} width="7" height="9" rx="1.5" fill={L} />])}<rect x="16" y="0" width="1.6" height="100" fill={L2} /><rect x="82.4" y="0" width="1.6" height="100" fill={L2} /><circle cx="50" cy="34" r="27" fill={L2} />{[[0, -13], [13, 0], [0, 13], [-13, 0]].map(([dx, dy], i) => <circle key={i} cx={50 + dx!} cy={34 + dy!} r="6" fill={D2} />)}</>
  ),
  "genre:tv-theme": () => ( // screens inside screens
    <>{([[88, 66], [68, 50], [48, 34], [28, 18]] as const).map(([w, h], i) => <rect key={w} x={58 - w / 2} y={36 - h / 2} width={w} height={h} rx="9" fill={i % 2 ? D : L} />)}</>
  ),
  "genre:kids": () => ( // toy blocks
    <><circle cx="24" cy="22" r="17" fill={L} /><rect x="50" y="8" width="28" height="28" rx="3" transform="rotate(14 64 22)" fill={D} /><polygon points={pts(86, 12, 100, 40, 72, 40)} fill={L} /><path d="M6 62 a20 20 0 0 1 40 0 Z" fill={D} /><rect x="56" y="52" width="38" height="16" rx="8" fill={L} /><circle cx="26" cy="86" r="8" fill={L} /><polygon points={pts(64, 74, 76, 96, 52, 96)} fill={D} /></>
  ),
  "genre:crossover": () => ( // columns under a pediment
    <><polygon points={pts(0, 18, 50, -4, 100, 18)} fill={L} />{range(5).map((i) => <g key={i}><rect x={8 + i * 18} y="20" width="12" height="80" fill={i % 2 ? D : L} /><rect x={6 + i * 18} y="20" width="16" height="5" fill={D2} /></g>)}</>
  ),
  "genre:chanson": () => ( // café tiles
    <>{range(6).flatMap((r) => range(6).map((c) => (r + c) % 2 ? <rect key={r + "-" + c} x={c * 16.67} y={r * 16.67} width="16.67" height="16.67" fill={L} /> : null))}</>
  ),
  "genre:italian": () => ( // pinwheel
    <>{range(4).map((i) => <polygon key={i} points={pts(60, 36, 60 + 46, 36, 60 + 46, 36 - 46)} transform={`rotate(${i * 90} 60 36)`} fill={i % 2 ? D : L} />)}<circle cx="60" cy="36" r="5" fill={L} /></>
  ),
  "genre:a-cappella": () => ( // voices rippling out
    <>{range(9).map((i) => <circle key={i} cx="28" cy="28" r={8 + i * 10} fill="none" stroke={i % 2 ? D : L} strokeWidth={2 + (i % 3)} />)}</>
  ),
  "genre:novelty": () => { // a spiral
    const pt = (t: number, o: number) => `${(66 + (1.6 * t + o) * Math.cos(t)).toFixed(1)},${(34 + (1.6 * t + o) * Math.sin(t)).toFixed(1)}`;
    const line = (o: number) => range(150).map((i) => pt(i * 0.2, o)).join(" ");
    return <><polyline points={line(0)} fill="none" stroke={L} strokeWidth="5" strokeLinecap="round" /><polyline points={line(5)} fill="none" stroke={D} strokeWidth="3" strokeLinecap="round" /></>;
  },

  // Tags
  "tag:explicit": () => ( // caution tape
    <>{range(10).map((i) => <polygon key={i} points={pts(i * 28 - 60, 0, i * 28 - 46, 0, i * 28 + 54, 100, i * 28 + 40, 100)} fill="rgba(255,200,0,0.28)" />)}</>
  ),
};

export const filterPattern = (kind: string, id: string): ReactNode | undefined => P[`${kind}:${id}`]?.();
