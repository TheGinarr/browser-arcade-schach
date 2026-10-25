/* figuren.js · eigene Staunton-Figuren als SVG (viewBox 0 0 100 100)
   Weiß: Elfenbein mit dunklem Umriss · Schwarz: Ebenholz mit hellen Lichtkanten.
   Beide Farben haben einen kräftigen Rand, damit sie auf hellen UND dunklen
   Feldern klar zu erkennen sind. */

const SOCKEL = "M22 79h56q5 0 5 5v6H17v-6q0-5 5-5z";
const FORM = {
  p: `<circle cx="50" cy="29" r="13"/><path d="M36 48q14-6 28 0q2 3-4 4q1 14 12 25H28q11-11 12-25q-6-1-4-4z"/>`,
  r: `<path d="M27 13h11v8h6v-8h12v8h6v-8h11v20H27z"/><path d="M33 33h34l3 42H30z"/><path d="M25 73h50v6H25z"/>`,
  b: `<circle cx="50" cy="11" r="6"/><path d="M50 17C35 27 33 42 39 51h22c6-9 4-24-11-34z"/><path d="M36 51h28q2 4-5 5q1 12 11 21H30q10-9 11-21q-7-1-5-5z"/>`,
  n: `<path d="M31 78c-1-12 4-19 13-25-6 1-12 4-18 8-6 3-11-3-8-9 5-9 15-18 19-27 3-6 7-10 13-11l2-7 7 8c13 4 20 18 19 35-1 13-6 20-6 28z"/>`,
  q: `<circle cx="20" cy="22" r="6"/><circle cx="35" cy="14" r="6"/><circle cx="50" cy="11" r="6"/><circle cx="65" cy="14" r="6"/><circle cx="80" cy="22" r="6"/><path d="M22 27l10 30h36l10-30-14 17 1-25-9 22-6-25-6 25-9-22 1 25z"/><path d="M31 57h38q2 5-5 6q1 8 9 14H27q8-6 9-14q-7-1-5-6z"/>`,
  k: `<path d="M46 3h8v7h7v8h-7v8h-8v-8h-7v-8h7z"/><path d="M50 32c-6-10-24-10-24 2 0 10 9 18 9 24h30c0-6 9-14 9-24 0-12-18-12-24-2z"/><path d="M31 58h38q2 5-5 6q1 8 9 13H27q8-5 9-13q-7-1-5-6z"/>`,
};
// Zierlinien (in der Gegenfarbe): machen die Figuren lesbar, auch klein
const ZIER = {
  p: `<path d="M38 49h24"/>`,
  r: `<path d="M33 33h34M31 66h38"/>`,
  b: `<path d="M54 29l-9 13M38 52h24"/>`,
  n: `<circle cx="47" cy="28" r="3" class="voll"/><path d="M57 19c9 7 12 20 10 38M24 56l3-1"/>`,
  q: `<path d="M32 57h36M30 66h40"/>`,
  k: `<path d="M50 32v24M32 58h36"/>`,
};

const STIL = {
  w: { fill: "url(#sch-gw)", rand: "#1d140b", zier: "#5a4126" },
  b: { fill: "url(#sch-gb)", rand: "#0a0706", zier: "#e7d3a6" },
};

/** Liefert das SVG einer Figur, z.B. figur("N") = weißer Springer. */
export function figur(x) {
  const t = x.toLowerCase();
  const s = STIL[x === t ? "b" : "w"];
  return `<svg class="fig" viewBox="0 0 100 100" aria-hidden="true"><g fill="${s.fill}" stroke="${s.rand}" stroke-width="4" stroke-linejoin="round">${FORM[t]}<path d="${SOCKEL}"/></g><g fill="none" stroke="${s.zier}" stroke-width="2.6" stroke-linecap="round" style="--z:${s.zier}">${ZIER[t]}</g></svg>`;
}

/** Einmal pro Seite: Verläufe für Elfenbein und Ebenholz. */
export const VERLAEUFE = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
<linearGradient id="sch-gw" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fffbef"/><stop offset=".55" stop-color="#f1e3c4"/><stop offset="1" stop-color="#cdb68b"/></linearGradient>
<linearGradient id="sch-gb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5b4c40"/><stop offset=".45" stop-color="#2b231d"/><stop offset="1" stop-color="#120e0b"/></linearGradient>
</defs></svg>`;

export const NAME = { p: "Bauer", n: "Springer", b: "Läufer", r: "Turm", q: "Dame", k: "König" };
