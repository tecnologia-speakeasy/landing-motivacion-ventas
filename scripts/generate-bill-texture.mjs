#!/usr/bin/env node
/**
 * Genera public/textures/bill.svg: ilustración estilizada de un billete de 100
 * dólares (diseño clásico) para la animación.
 *
 *   node scripts/generate-bill-texture.mjs
 *
 * Es un ATLAS: el frente ocupa la mitad superior y el reverso la inferior,
 * separados por una franja transparente. El shader del motor (engine.ts) elige
 * la mitad según la cara que mira a la cámara, así el billete muestra el
 * reverso real al girar en lugar del frente en espejo. Si cambias FACE_H o
 * GAP, actualiza BILL_ATLAS en app/lib/bills/engine.ts.
 *
 * Es una ilustración (no una reproducción): retrato en silueta, sellos y
 * número de serie ficticios.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const W = 1024;
const FACE_H = 436;
const GAP = 16;
const H = FACE_H * 2 + GAP;
const OUTPUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "textures", "bill.svg");

const INK = "#1f2a24"; // negro verdoso del frente
const GREEN = "#2e6b45"; // verde de sellos, series y reverso
const SERIF = "Georgia, 'Times New Roman', serif";

let seed = 100;
const random = () => {
  seed = (seed * 16_807) % 2_147_483_647;
  return seed / 2_147_483_647;
};
const f = (n) => Math.round(n * 10) / 10;
const gcd = (a, b) => (b ? gcd(b, a % b) : a);

/** Hipotrocoide (espirógrafo): las rosetas típicas de los billetes. */
function rosette(cx, cy, scale, R, r, d, steps = 1400) {
  const turns = r / gcd(R, r);
  let path = "";
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2 * turns;
    const x = (R - r) * Math.cos(t) + d * Math.cos(((R - r) / r) * t);
    const y = (R - r) * Math.sin(t) - d * Math.sin(((R - r) / r) * t);
    path += `${i ? "L" : "M"}${f(cx + x * scale)} ${f(cy + y * scale)}`;
  }
  return `${path}Z`;
}

/** Círculo dentado (borde de los sellos). */
function sawCircle(cx, cy, outer, inner, teeth) {
  let path = "";
  for (let i = 0; i < teeth * 2; i++) {
    const angle = (i / (teeth * 2)) * Math.PI * 2;
    const radius = i % 2 === 0 ? outer : inner;
    path += `${i ? "L" : "M"}${f(cx + radius * Math.cos(angle))} ${f(cy + radius * Math.sin(angle))}`;
  }
  return `${path}Z`;
}

/** Líneas onduladas desfasadas (guilloche lineal). */
function waveLines(x0, x1, y0, amplitude, frequency, lines) {
  let out = "";
  for (let k = 0; k < lines; k++) {
    let path = "";
    for (let x = x0, i = 0; x <= x1; x += 4, i++) {
      path += `${i ? "L" : "M"}${f(x)} ${f(y0 + amplitude * Math.sin(x * frequency + (k * Math.PI) / lines))}`;
    }
    out += `<path d="${path}"/>`;
  }
  return out;
}

/** Fibras rojas y azules del papel moneda. */
function fibers(count) {
  let out = "";
  for (let i = 0; i < count; i++) {
    const x = 30 + random() * (W - 60);
    const y = 30 + random() * (FACE_H - 60);
    const dx = (random() - 0.5) * 14;
    const dy = (random() - 0.5) * 14;
    const color = random() > 0.5 ? "#b8434a" : "#3d63b8";
    out += `<path d="M${f(x)} ${f(y)}q${f(dx)} ${f(dy)} ${f(dx * 1.6)} ${f(dy * 0.4)}" stroke="${color}" stroke-width=".8" fill="none" opacity=".45"/>`;
  }
  return out;
}

/** Papel con margen blanco, como el billete real, y marco con banda ornamental. */
function frame(color, id) {
  return `
  <rect x="2" y="2" width="1020" height="432" rx="6" fill="url(#paper)"/>
  <rect x="14" y="14" width="996" height="408" rx="8" fill="url(#band-${id})" stroke="${color}" stroke-width="3"/>
  <rect x="34" y="34" width="956" height="368" rx="4" fill="url(#paper)" stroke="${color}" stroke-width="1.6"/>`;
}

function defs(id, color) {
  return `
  <pattern id="band-${id}" width="14" height="14" patternUnits="userSpaceOnUse">
    <rect width="14" height="14" fill="#dfe3d2"/>
    <circle cx="7" cy="7" r="6" fill="none" stroke="${color}" stroke-width="1"/>
    <circle cx="0" cy="0" r="6" fill="none" stroke="${color}" stroke-width=".7" opacity=".7"/>
    <circle cx="14" cy="14" r="6" fill="none" stroke="${color}" stroke-width=".7" opacity=".7"/>
  </pattern>
  <pattern id="lines-${id}" width="4" height="4" patternUnits="userSpaceOnUse">
    <line x1="0" y1="2" x2="4" y2="2" stroke="${color}" stroke-width=".9" opacity=".45"/>
  </pattern>
  <pattern id="hatch-${id}" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(40)">
    <line x1="0" y1="0" x2="0" y2="3" stroke="${color}" stroke-width="1.1"/>
  </pattern>`;
}

/** "100" de esquina dentro de un cartucho. */
function corner(x, y, size, color, anchor = "start") {
  const width = size * 1.95;
  const left = anchor === "end" ? x - width : x;
  return `
  <rect x="${f(left - 8)}" y="${f(y - size * 0.82)}" width="${f(width + 16)}" height="${f(size * 1.02)}" rx="${f(size * 0.2)}" fill="#e3e7d6" stroke="${color}" stroke-width="2"/>
  <text x="${f(anchor === "end" ? x : x)}" y="${y}" text-anchor="${anchor}" font-family="${SERIF}" font-size="${size}" font-weight="700" fill="${color}">100</text>`;
}

// ---------------------------------------------------------------------------
// FRENTE: retrato en óvalo, sello negro a la izquierda, sello verde a la derecha.
// ---------------------------------------------------------------------------
const front = `
<g>
  ${frame(INK, "f")}
  <g clip-path="url(#inner)">
    ${fibers(70)}
    <g fill="none" stroke="${INK}" stroke-width=".7" opacity=".35">
      ${waveLines(34, 990, 56, 9, 0.05, 5)}
      ${waveLines(34, 990, 380, 9, 0.05, 5)}
      <path d="${rosette(512, 236, 15, 13, 6, 5)}"/>
      <path d="${rosette(250, 214, 7, 12, 5, 4.2)}"/>
      <path d="${rosette(774, 250, 6.5, 12, 5, 4.2)}"/>
    </g>
  </g>

  <text x="512" y="70" text-anchor="middle" font-family="${SERIF}" font-size="17" fill="${INK}" letter-spacing="6">FEDERAL RESERVE NOTE</text>
  <text x="512" y="104" text-anchor="middle" font-family="${SERIF}" font-size="30" font-weight="700" fill="${INK}" letter-spacing="3">THE UNITED STATES OF AMERICA</text>

  <!-- Retrato: silueta estilo grabado dentro del óvalo -->
  <ellipse cx="512" cy="236" rx="92" ry="112" fill="#eef0e6"/>
  <ellipse cx="512" cy="236" rx="92" ry="112" fill="url(#lines-f)"/>
  <clipPath id="oval-front"><ellipse cx="512" cy="236" rx="90" ry="110"/></clipPath>
  <g clip-path="url(#oval-front)">
    <path d="M430 352 C 436 300, 468 282, 492 276 L 532 276 C 556 282, 588 300, 594 352 Z" fill="${INK}"/>
    <path d="M430 352 C 436 300, 468 282, 492 276 L 532 276 C 556 282, 588 300, 594 352 Z" fill="url(#hatch-f)" opacity=".5"/>
    <path d="M494 276 L 512 326 L 530 276 Z" fill="#f4f5ee"/>
    <path d="M504 282 L 512 300 L 520 282 Z" fill="#c9cdc2"/>
    <!-- Pelo largo a los lados (queda como halo oscuro detrás de la cara) -->
    <ellipse cx="512" cy="226" rx="52" ry="58" fill="#3a443d"/>
    <ellipse cx="512" cy="226" rx="52" ry="58" fill="url(#hatch-f)" opacity=".6"/>
    <!-- Cara clara, más alta que el pelo: frente despejada -->
    <clipPath id="face"><ellipse cx="512" cy="206" rx="35" ry="50"/></clipPath>
    <ellipse cx="512" cy="206" rx="35" ry="50" fill="#d3d6cc"/>
    <g clip-path="url(#face)">
      <rect x="470" y="150" width="90" height="120" fill="url(#lines-f)"/>
      <ellipse cx="540" cy="212" rx="22" ry="56" fill="${INK}" opacity=".28"/>
    </g>
    <path d="M497 196 q5 -3 10 0 M517 196 q5 -3 10 0" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M512 200 q-3 13 1 18 q3 1 5 -1" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M503 232 q9 5 18 0" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>
  </g>
  <ellipse cx="512" cy="236" rx="92" ry="112" fill="none" stroke="${INK}" stroke-width="6"/>
  <ellipse cx="512" cy="236" rx="100" ry="120" fill="none" stroke="${INK}" stroke-width="1.5"/>
  <rect x="452" y="344" width="120" height="22" rx="4" fill="#e3e7d6" stroke="${INK}" stroke-width="1.5"/>
  <text x="512" y="360" text-anchor="middle" font-family="${SERIF}" font-size="13" font-weight="700" fill="${INK}" letter-spacing="3">FRANKLIN</text>

  <!-- Sello negro (Reserva Federal) -->
  <path d="${sawCircle(250, 200, 48, 43, 60)}" fill="${INK}"/>
  <circle cx="250" cy="200" r="36" fill="#eef0e6" stroke="${INK}" stroke-width="2"/>
  <text x="250" y="219" text-anchor="middle" font-family="${SERIF}" font-size="52" font-weight="700" fill="${INK}">E</text>
  <text x="250" y="284" text-anchor="middle" font-family="${SERIF}" font-size="10.5" fill="${INK}" letter-spacing="1">THIS NOTE IS LEGAL TENDER</text>
  <text x="250" y="298" text-anchor="middle" font-family="${SERIF}" font-size="10.5" fill="${INK}" letter-spacing="1">FOR ALL DEBTS, PUBLIC AND PRIVATE</text>

  <!-- Sello verde (Tesoro) -->
  <path d="${sawCircle(774, 250, 42, 37, 56)}" fill="${GREEN}"/>
  <circle cx="774" cy="250" r="31" fill="#eef0e6" stroke="${GREEN}" stroke-width="2"/>
  <path d="M756 232 H792 V252 C792 266 784 274 774 280 C764 274 756 266 756 252 Z" fill="none" stroke="${GREEN}" stroke-width="2.5"/>
  <path d="M756 246 L774 238 L792 246" fill="none" stroke="${GREEN}" stroke-width="2.5"/>
  <text x="774" y="312" text-anchor="middle" font-family="${SERIF}" font-size="12" fill="${INK}" letter-spacing="2">SERIES 2026</text>

  <!-- Números de serie (ficticios) -->
  <text x="800" y="160" text-anchor="middle" font-family="'Courier New', monospace" font-size="24" font-weight="700" fill="${GREEN}">SE 00000100 E</text>
  <text x="230" y="344" text-anchor="middle" font-family="'Courier New', monospace" font-size="24" font-weight="700" fill="${GREEN}">SE 00000100 E</text>

  ${corner(58, 116, 56, INK)}
  ${corner(966, 116, 56, INK, "end")}
  ${corner(58, 394, 48, INK)}
  ${corner(966, 394, 64, INK, "end")}

  <text x="512" y="394" text-anchor="middle" font-family="${SERIF}" font-size="26" font-weight="700" fill="${INK}" letter-spacing="5">ONE HUNDRED DOLLARS</text>
</g>`;

// ---------------------------------------------------------------------------
// REVERSO: tinta verde, Independence Hall al centro.
// ---------------------------------------------------------------------------
function windows(x0, y0, columns, rows, width, height, gapX, gapY) {
  let out = "";
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      out += `<rect x="${x0 + column * (width + gapX)}" y="${y0 + row * (height + gapY)}" width="${width}" height="${height}" fill="${GREEN}"/>`;
    }
  }
  return out;
}

function tree(cx, cy, radius) {
  return `<g fill="${GREEN}" opacity=".85">
    <circle cx="${cx}" cy="${cy}" r="${radius}"/>
    <circle cx="${cx - radius * 0.7}" cy="${cy + radius * 0.4}" r="${radius * 0.75}"/>
    <circle cx="${cx + radius * 0.7}" cy="${cy + radius * 0.35}" r="${radius * 0.8}"/>
  </g>`;
}

const back = `
<g>
  ${frame(GREEN, "b")}
  <g clip-path="url(#inner)">
    ${fibers(70)}
    <g fill="none" stroke="${GREEN}" stroke-width=".7" opacity=".4">
      ${waveLines(34, 990, 56, 9, 0.05, 5)}
      ${waveLines(34, 990, 380, 9, 0.05, 5)}
    </g>
  </g>

  <text x="512" y="80" text-anchor="middle" font-family="${SERIF}" font-size="30" font-weight="700" fill="${GREEN}" letter-spacing="3">THE UNITED STATES OF AMERICA</text>
  <text x="512" y="110" text-anchor="middle" font-family="${SERIF}" font-size="17" fill="${GREEN}" letter-spacing="5">IN GOD WE TRUST</text>

  <!-- Rosetas laterales con "100" -->
  <g fill="none" stroke="${GREEN}" stroke-width="1.1" opacity=".8">
    <path d="${rosette(190, 236, 7.5, 12, 5, 4.2)}"/>
    <path d="${rosette(834, 236, 7.5, 12, 5, 4.2)}"/>
  </g>
  <circle cx="190" cy="236" r="44" fill="#e3e7d6" stroke="${GREEN}" stroke-width="3"/>
  <circle cx="834" cy="236" r="44" fill="#e3e7d6" stroke="${GREEN}" stroke-width="3"/>
  <text x="190" y="252" text-anchor="middle" font-family="${SERIF}" font-size="44" font-weight="700" fill="${GREEN}">100</text>
  <text x="834" y="252" text-anchor="middle" font-family="${SERIF}" font-size="44" font-weight="700" fill="${GREEN}">100</text>

  <!-- Viñeta central: Independence Hall -->
  <rect x="302" y="126" width="420" height="212" rx="10" fill="#eef0e6"/>
  <rect x="302" y="126" width="420" height="212" rx="10" fill="url(#lines-b)"/>
  <clipPath id="vignette-back"><rect x="304" y="128" width="416" height="208" rx="9"/></clipPath>
  <g clip-path="url(#vignette-back)">
    ${tree(334, 262, 26)}
    ${tree(690, 258, 28)}
    <path d="M512 134 L520 168 L504 168 Z" fill="${GREEN}"/>
    <rect x="496" y="168" width="32" height="30" fill="#e3e7d6" stroke="${GREEN}" stroke-width="2.5"/>
    <circle cx="512" cy="184" r="8" fill="#eef0e6" stroke="${GREEN}" stroke-width="2"/>
    <path d="M512 184 V178 M512 184 H517" stroke="${GREEN}" stroke-width="1.5"/>
    <rect x="484" y="198" width="56" height="56" fill="#e3e7d6" stroke="${GREEN}" stroke-width="2.5"/>
    <rect x="504" y="222" width="16" height="32" fill="${GREEN}"/>
    <path d="M360 254 L378 232 H646 L664 254 Z" fill="${GREEN}"/>
    <rect x="362" y="254" width="300" height="56" fill="#e3e7d6" stroke="${GREEN}" stroke-width="2.5"/>
    <rect x="362" y="254" width="300" height="56" fill="url(#hatch-b)" opacity=".18"/>
    ${windows(374, 262, 5, 2, 12, 16, 12, 8)}
    ${windows(548, 262, 5, 2, 12, 16, 12, 8)}
    <rect x="498" y="274" width="28" height="36" fill="${GREEN}"/>
    <g stroke="${GREEN}" stroke-width="1.2" opacity=".7">
      <line x1="304" y1="316" x2="720" y2="316"/>
      <line x1="304" y1="322" x2="720" y2="322"/>
      <line x1="304" y1="328" x2="720" y2="328"/>
    </g>
  </g>
  <rect x="302" y="126" width="420" height="212" rx="10" fill="none" stroke="${GREEN}" stroke-width="5"/>
  <text x="512" y="360" text-anchor="middle" font-family="${SERIF}" font-size="13" font-weight="700" fill="${GREEN}" letter-spacing="4">INDEPENDENCE HALL</text>

  ${corner(58, 116, 56, GREEN)}
  ${corner(966, 116, 56, GREEN, "end")}
  ${corner(58, 394, 56, GREEN)}
  ${corner(966, 394, 56, GREEN, "end")}

  <text x="512" y="394" text-anchor="middle" font-family="${SERIF}" font-size="26" font-weight="700" fill="${GREEN}" letter-spacing="5">ONE HUNDRED DOLLARS</text>
</g>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<!-- Generado por scripts/generate-bill-texture.mjs. Atlas: frente arriba, reverso abajo. -->
<defs>
  <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#eceee2"/>
    <stop offset=".6" stop-color="#e0e4d3"/>
    <stop offset="1" stop-color="#d3d9c4"/>
  </linearGradient>
  <clipPath id="inner"><rect x="34" y="34" width="956" height="368" rx="4"/></clipPath>
  ${defs("f", INK)}
  ${defs("b", GREEN)}
</defs>
<g>${front}</g>
<g transform="translate(0 ${FACE_H + GAP})">${back}</g>
</svg>
`;

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, svg);
console.log(`Textura generada: ${OUTPUT} (${(Buffer.byteLength(svg) / 1024).toFixed(0)} KB, ${W}×${H})`);
