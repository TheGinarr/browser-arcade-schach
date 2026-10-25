/* ============================================================
   SCHACH · engine.js  (rein, ohne DOM – läuft im Browser, im
   Worker und in Node)
   ------------------------------------------------------------
   Brett im 0x88-Format: Feld = reihe * 16 + linie, reihe 0 = 1. Reihe
   (weiße Seite). Ein Feld ist gültig, wenn (feld & 0x88) === 0.
   Figuren: "P N B R Q K" weiß, klein = schwarz, 0 = leer.
   Stellung: {b, w:"w"|"b", c:"KQkq", ep, halb, nr, k:[wK,sK], hist}
   Zug: {v, n, f, s, p, art}  v=von, n=nach, f=Figur, s=geschlagen,
        p=Umwandlung ("q" …), art = "ep" | "k" | "q" | ""
   ============================================================ */

export const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const SPRINGER = [33, 31, 18, 14, -33, -31, -18, -14];
const LAEUFER = [17, 15, -17, -15];
const TURM = [16, -16, 1, -1];
const ALLE = [...LAEUFER, ...TURM];
const weiss = (x) => x && x === x.toUpperCase();
const farbeVon = (x) => (x ? (weiss(x) ? "w" : "b") : "");
export const feldName = (q) => "abcdefgh"[q & 7] + ((q >> 4) + 1);
export const feldAus = (n) => (Number(n[1]) - 1) * 16 + "abcdefgh".indexOf(n[0]);

/* ---------- Stellung ---------- */
export function ausFen(fen) {
  const [teile, w, c, ep, halb, nr] = fen.trim().split(/\s+/);
  const b = new Array(128).fill(0);
  const k = [-1, -1];
  teile.split("/").forEach((zeile, i) => {
    let l = 0;
    for (const z of zeile) {
      if (/\d/.test(z)) l += Number(z);
      else {
        const q = (7 - i) * 16 + l++;
        b[q] = z;
        if (z === "K") k[0] = q;
        if (z === "k") k[1] = q;
      }
    }
  });
  return {
    b,
    w,
    c: c === "-" ? "" : c,
    ep: ep === "-" ? -1 : feldAus(ep),
    halb: Number(halb) || 0,
    nr: Number(nr) || 1,
    k,
    hist: [],
  };
}

export function neueStellung() {
  return ausFen(START);
}

/** Schlüssel für Stellungswiederholung (ohne Zugzähler). */
export function schluessel(st) {
  let s = "";
  for (let r = 7; r >= 0; r--) {
    let leer = 0;
    for (let l = 0; l < 8; l++) {
      const x = st.b[r * 16 + l];
      if (!x) leer++;
      else {
        if (leer) s += leer;
        leer = 0;
        s += x;
      }
    }
    if (leer) s += leer;
    if (r) s += "/";
  }
  return `${s} ${st.w} ${st.c || "-"} ${st.ep >= 0 ? feldName(st.ep) : "-"}`;
}
export const zuFen = (st) => `${schluessel(st)} ${st.halb} ${st.nr}`;

/* ---------- Angriffe ---------- */
/** Greift Farbe `von` das Feld q an? */
export function angegriffen(b, q, von) {
  const W = von === "w";
  // Bauern
  const pb = W ? "P" : "p";
  const d = W ? -1 : 1;
  for (const o of [15, 17]) {
    const z = q + d * o;
    if (!(z & 0x88) && b[z] === pb) return true;
  }
  const S = W ? "N" : "n",
    L = W ? "B" : "b",
    T = W ? "R" : "r",
    D = W ? "Q" : "q",
    K = W ? "K" : "k";
  for (const o of SPRINGER) {
    const z = q + o;
    if (!(z & 0x88) && b[z] === S) return true;
  }
  for (const o of ALLE) {
    const z = q + o;
    if (!(z & 0x88) && b[z] === K) return true;
  }
  for (const o of LAEUFER) {
    for (let z = q + o; !(z & 0x88); z += o) {
      const x = b[z];
      if (!x) continue;
      if (x === L || x === D) return true;
      break;
    }
  }
  for (const o of TURM) {
    for (let z = q + o; !(z & 0x88); z += o) {
      const x = b[z];
      if (!x) continue;
      if (x === T || x === D) return true;
      break;
    }
  }
  return false;
}

export const imSchach = (st) =>
  angegriffen(st.b, st.k[st.w === "w" ? 0 : 1], st.w === "w" ? "b" : "w");

/* ---------- Züge erzeugen ---------- */
/** Pseudo-legale Züge (König kann danach im Schach stehen). nurSchlag für die Ruhesuche. */
export function pseudoZuege(st, nurSchlag = false) {
  const { b, w } = st;
  const W = w === "w";
  const out = [];
  const add = (v, n, f, s, art = "") => {
    if ((f === "P" && n >> 4 === 7) || (f === "p" && n >> 4 === 0)) {
      for (const p of "qrbn") out.push({ v, n, f, s, p, art });
    } else out.push({ v, n, f, s, p: "", art });
  };
  for (let q = 0; q < 128; q++) {
    if (q & 0x88) {
      q += 7;
      continue;
    }
    const f = b[q];
    if (!f || weiss(f) !== W) continue;
    const typ = f.toLowerCase();
    if (typ === "p") {
      const vor = W ? 16 : -16;
      const startReihe = W ? 1 : 6;
      const z = q + vor;
      const umw = z >> 4 === (W ? 7 : 0);
      if (!(z & 0x88) && !b[z] && (!nurSchlag || umw)) {
        add(q, z, f, 0);
        const z2 = z + vor;
        if (!nurSchlag && q >> 4 === startReihe && !b[z2]) add(q, z2, f, 0);
      }
      for (const o of [vor - 1, vor + 1]) {
        const t = q + o;
        if (t & 0x88) continue;
        if (b[t] && weiss(b[t]) !== W) add(q, t, f, b[t]);
        else if (t === st.ep) add(q, t, f, W ? "p" : "P", "ep");
      }
      continue;
    }
    if (typ === "n" || typ === "k") {
      for (const o of typ === "n" ? SPRINGER : ALLE) {
        const t = q + o;
        if (t & 0x88) continue;
        const x = b[t];
        if (!x) {
          if (!nurSchlag) add(q, t, f, 0);
        } else if (weiss(x) !== W) add(q, t, f, x);
      }
      continue;
    }
    const richt = typ === "b" ? LAEUFER : typ === "r" ? TURM : ALLE;
    for (const o of richt) {
      for (let t = q + o; !(t & 0x88); t += o) {
        const x = b[t];
        if (!x) {
          if (!nurSchlag) add(q, t, f, 0);
          continue;
        }
        if (weiss(x) !== W) add(q, t, f, x);
        break;
      }
    }
  }
  // Rochade
  if (!nurSchlag && st.c) {
    const geg = W ? "b" : "w";
    const basis = W ? 0 : 112;
    const K = W ? "K" : "k";
    if (b[basis + 4] === K && !angegriffen(b, basis + 4, geg)) {
      if (
        st.c.includes(W ? "K" : "k") &&
        b[basis + 7] === (W ? "R" : "r") &&
        !b[basis + 5] &&
        !b[basis + 6] &&
        !angegriffen(b, basis + 5, geg) &&
        !angegriffen(b, basis + 6, geg)
      )
        out.push({ v: basis + 4, n: basis + 6, f: K, s: 0, p: "", art: "k" });
      if (
        st.c.includes(W ? "Q" : "q") &&
        b[basis] === (W ? "R" : "r") &&
        !b[basis + 1] &&
        !b[basis + 2] &&
        !b[basis + 3] &&
        !angegriffen(b, basis + 3, geg) &&
        !angegriffen(b, basis + 2, geg)
      )
        out.push({ v: basis + 4, n: basis + 2, f: K, s: 0, p: "", art: "q" });
    }
  }
  return out;
}

const ECKEN = { 0: "Q", 7: "K", 112: "q", 119: "k" };

/** Führt einen Zug aus und liefert die NEUE Stellung (die alte bleibt). mitHist=false spart Arbeit in der Suche. */
export function ziehen(st, z, mitHist = true) {
  const b = st.b.slice();
  const W = st.w === "w";
  let f = z.f;
  b[z.v] = 0;
  if (z.art === "ep") b[z.n + (W ? -16 : 16)] = 0;
  if (z.p) f = W ? z.p.toUpperCase() : z.p;
  b[z.n] = f;
  if (z.art === "k") {
    b[z.n - 1] = b[z.n + 1];
    b[z.n + 1] = 0;
  } else if (z.art === "q") {
    b[z.n + 1] = b[z.n - 2];
    b[z.n - 2] = 0;
  }
  const k = st.k.slice();
  let c = st.c;
  if (z.f === "K") {
    k[0] = z.n;
    c = c.replace("K", "").replace("Q", "");
  } else if (z.f === "k") {
    k[1] = z.n;
    c = c.replace("k", "").replace("q", "");
  }
  if (c) for (const q of [z.v, z.n]) if (ECKEN[q] !== undefined) c = c.replace(ECKEN[q], "");
  const lower = z.f.toLowerCase();
  const neu = {
    b,
    k,
    c,
    w: W ? "b" : "w",
    ep: lower === "p" && Math.abs(z.n - z.v) === 32 ? (z.n + z.v) >> 1 : -1,
    halb: lower === "p" || z.s ? 0 : st.halb + 1,
    nr: st.nr + (W ? 0 : 1),
    hist: null,
  };
  if (mitHist)
    neu.hist = lower === "p" || z.s ? [schluessel(neu)] : [...(st.hist || []), schluessel(neu)];
  return neu;
}

/** Ist der Zug legal (eigener König danach nicht im Schach)? */
function legalNach(st, neu) {
  return !angegriffen(neu.b, neu.k[st.w === "w" ? 0 : 1], neu.w);
}

export function zuege(st) {
  return pseudoZuege(st).filter((z) => legalNach(st, ziehen(st, z, false)));
}

/* ---------- Spielende ---------- */
function zuWenigMaterial(b) {
  const rest = [];
  for (let q = 0; q < 128; q++) {
    if (q & 0x88 || !b[q]) continue;
    const t = b[q].toLowerCase();
    if (t === "k") continue;
    if (t === "p" || t === "r" || t === "q") return false;
    rest.push({ t, farbeFeld: ((q >> 4) + (q & 7)) % 2 });
  }
  if (rest.length <= 1) return true; // K gegen K, K+L/S gegen K
  // nur Läufer, alle auf gleicher Feldfarbe
  return rest.every((x) => x.t === "b") && rest.every((x) => x.farbeFeld === rest[0].farbeFeld);
}

/** Lage: {schach, ende: "matt"|"patt"|"50"|"wdh"|"material"|"", sieger:"w"|"b"|""} */
export function lage(st) {
  const schach = imSchach(st);
  if (!zuege(st).length)
    return {
      schach,
      ende: schach ? "matt" : "patt",
      sieger: schach ? (st.w === "w" ? "b" : "w") : "",
    };
  if (st.halb >= 100) return { schach, ende: "50", sieger: "" };
  if (zuWenigMaterial(st.b)) return { schach, ende: "material", sieger: "" };
  const h = st.hist || [];
  if (h.length >= 5) {
    const jetzt = h[h.length - 1];
    if (h.filter((x) => x === jetzt).length >= 3) return { schach, ende: "wdh", sieger: "" };
  }
  return { schach, ende: "", sieger: "" };
}

/* ---------- Notation (deutsch: K D T L S) ---------- */
const DE = { k: "K", q: "D", r: "T", b: "L", n: "S" };
export function notation(st, z) {
  let s;
  if (z.art === "k") s = "O-O";
  else if (z.art === "q") s = "O-O-O";
  else {
    const t = z.f.toLowerCase();
    const ziel = feldName(z.n);
    if (t === "p") {
      s = z.s ? `${feldName(z.v)[0]}x${ziel}` : ziel;
      if (z.p) s += `=${DE[z.p]}`;
    } else {
      const andere = zuege(st).filter((y) => y.f === z.f && y.n === z.n && y.v !== z.v);
      let zusatz = "";
      if (andere.length) {
        if (andere.every((y) => (y.v & 7) !== (z.v & 7))) zusatz = feldName(z.v)[0];
        else if (andere.every((y) => y.v >> 4 !== z.v >> 4)) zusatz = feldName(z.v)[1];
        else zusatz = feldName(z.v);
      }
      s = DE[t] + zusatz + (z.s ? "x" : "") + ziel;
    }
  }
  const neu = ziehen(st, z);
  const l = lage(neu);
  if (l.ende === "matt") s += "#";
  else if (l.schach) s += "+";
  return s;
}

/* ---------- Bewertung ---------- */
const WERT = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
// Feldtabellen aus Sicht von Weiß, Zeile 0 = 8. Reihe
const PST = {
  p: [
    0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5,
    10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20,
    -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0,
  ],
  n: [
    -50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10,
    0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10,
    5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50,
  ],
  b: [
    -20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0,
    -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10,
    -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20,
  ],
  r: [
    0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0,
    0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0,
    5, 5, 0, 0, 0,
  ],
  q: [
    -20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10,
    -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0,
    0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20,
  ],
  k: [
    -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40,
    -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30,
    -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0,
    10, 30, 20,
  ],
  ke: [
    -50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30,
    30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30,
    -10, 20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30,
    -30, -50,
  ],
};

/** Bewertung aus Sicht der Partei am Zug (Zentibauern). */
export function bewerten(st) {
  const b = st.b;
  let figurenWert = 0;
  for (let q = 0; q < 128; q++) {
    if (q & 0x88 || !b[q]) continue;
    const t = b[q].toLowerCase();
    if (t !== "p" && t !== "k") figurenWert += WERT[t];
  }
  const endspiel = figurenWert <= 2600;
  let s = 0;
  for (let q = 0; q < 128; q++) {
    if (q & 0x88) continue;
    const x = b[q];
    if (!x) continue;
    const t = x.toLowerCase();
    const r = q >> 4,
      l = q & 7;
    const W = x !== t;
    const idx = W ? (7 - r) * 8 + l : r * 8 + l;
    const v = WERT[t] + PST[t === "k" && endspiel ? "ke" : t][idx];
    s += W ? v : -v;
  }
  return st.w === "w" ? s : -s;
}

/* ---------- Suche (Negamax mit Alpha-Beta + Ruhesuche) ---------- */
const MATT = 100000;
const mvvLva = (z) =>
  (z.s ? WERT[z.s.toLowerCase()] * 10 - WERT[z.f.toLowerCase()] / 100 : 0) + (z.p ? 800 : 0);

function sucher(grenzeKnoten, bisZeit) {
  let knoten = 0;
  let abbruch = false;
  const zeitUm = () => {
    if (++knoten > grenzeKnoten || ((knoten & 1023) === 0 && Date.now() > bisZeit)) abbruch = true;
    return abbruch;
  };
  function ruhe(st, a, be, tiefe) {
    if (zeitUm()) return 0;
    const steh = bewerten(st);
    if (steh >= be) return be;
    if (steh > a) a = steh;
    if (tiefe <= -8) return a;
    const liste = pseudoZuege(st, true).sort((x, y) => mvvLva(y) - mvvLva(x));
    for (const z of liste) {
      const neu = ziehen(st, z, false);
      if (!legalNach(st, neu)) continue;
      const w = -ruhe(neu, -be, -a, tiefe - 1);
      if (abbruch) return 0;
      if (w >= be) return be;
      if (w > a) a = w;
    }
    return a;
  }
  function nega(st, tiefe, a, be, ply) {
    if (zeitUm()) return 0;
    if (st.halb >= 100) return 0;
    const schach = imSchach(st);
    if (schach) tiefe++; // Schach verlängern
    if (tiefe <= 0) return ruhe(st, a, be, 0);
    const liste = pseudoZuege(st).sort((x, y) => mvvLva(y) - mvvLva(x));
    let legal = 0;
    for (const z of liste) {
      const neu = ziehen(st, z, false);
      if (!legalNach(st, neu)) continue;
      legal++;
      const w = -nega(neu, tiefe - 1, -be, -a, ply + 1);
      if (abbruch) return 0;
      if (w >= be) return be;
      if (w > a) a = w;
    }
    if (!legal) return schach ? -MATT + ply : 0;
    return a;
  }
  return {
    nega,
    get abbruch() {
      return abbruch;
    },
    get knoten() {
      return knoten;
    },
  };
}

const STUFEN = {
  leicht: { tiefe: 1, ms: 300, knoten: 20000, streu: 120, zufall: 0.25 },
  mittel: { tiefe: 3, ms: 1200, knoten: 250000, streu: 25, zufall: 0 },
  schwer: { tiefe: 6, ms: 2200, knoten: 3000000, streu: 0, zufall: 0 },
};

/**
 * Computerzug. Iterative Vertiefung bis zur Tiefe der Stufe oder bis die Zeit um ist.
 * Leicht/Mittel wählen zufällig unter fast gleich guten Zügen (wirkt menschlicher).
 */
export function computerZug(st, stufe = "mittel", zufall = Math.random) {
  const cfg = STUFEN[stufe] || STUFEN.mittel;
  const liste = zuege(st);
  if (!liste.length) return null;
  if (liste.length === 1) return liste[0];
  if (cfg.zufall && zufall() < cfg.zufall) {
    // Leicht: manchmal einfach irgendein Zug – aber eine Dame lässt er nicht gratis hängen
    const ok = liste.filter(
      (z) => !angegriffen(ziehen(st, z, false).b, z.n, st.w === "w" ? "b" : "w") || z.s,
    );
    const pool = ok.length ? ok : liste;
    return pool[Math.floor(zufall() * pool.length)];
  }
  const bis = Date.now() + cfg.ms;
  let bewertet = liste.map((z) => ({ z, w: 0 }));
  bewertet.sort((x, y) => mvvLva(y.z) - mvvLva(x.z));
  for (let tiefe = 1; tiefe <= cfg.tiefe; tiefe++) {
    const s = sucher(cfg.knoten, bis);
    const runde = [];
    let a = -MATT - 1;
    for (const e of bewertet) {
      const neu = ziehen(st, e.z, false);
      // Streuung braucht genaue Werte nahe am Besten → Fenster um streu erweitern
      const w = -s.nega(neu, tiefe - 1, -MATT - 1, -(a - cfg.streu - 1), 1);
      if (s.abbruch) break;
      runde.push({ z: e.z, w });
      if (w > a) a = w;
    }
    if (runde.length < bewertet.length) {
      // Abbruch mitten in der Tiefe: fertige Teile nutzen, wenn ein besserer Zug gefunden wurde
      if (runde.length && Math.max(...runde.map((x) => x.w)) > bewertet[0].w && tiefe > 1) {
        const rest = bewertet.filter((e) => !runde.some((r) => r.z === e.z));
        bewertet = [...runde.sort((x, y) => y.w - x.w), ...rest];
      }
      break;
    }
    bewertet = runde.sort((x, y) => y.w - x.w);
    if (bewertet[0].w > MATT - 100) break; // Matt gefunden
  }
  const best = bewertet[0].w;
  const kandidaten = bewertet.filter((e) => e.w >= best - cfg.streu);
  return kandidaten[Math.floor(zufall() * kandidaten.length)].z;
}

/** Zählt Blattknoten (Prüfung der Zuggenerierung). */
export function perft(st, tiefe) {
  if (tiefe === 0) return 1;
  let n = 0;
  for (const z of pseudoZuege(st)) {
    const neu = ziehen(st, z, false);
    if (!legalNach(st, neu)) continue;
    n += perft(neu, tiefe - 1);
  }
  return n;
}

export { farbeVon };
