/* ============================================================
   SCHACH · game.js
   ------------------------------------------------------------
   1. Regeln + Computer in engine.js (rein, Node-testbar), der
      Computer rechnet in ki-worker.js (Web Worker).
   2. Modi: Computer (Leicht/Mittel/Schwer, Farbe wechselt je
      Partie), zu zweit am Gerät, online (mehrspieler.js). Online
      führt der Host die Partie und prüft jeden Zug; der Gast
      schickt nur {t:"zug", v, n, p}.
   3. Topliste "schach" = Punkte gegen den Computer
      (Sieg Leicht 1 / Mittel 3 / Schwer 10, Remis 0 / 1 / 4).
      Wer einen Zug zurücknimmt, spielt die Partie ohne Wertung.
   ============================================================ */

import * as E from "./engine.js?v=20261024";
import { figur, VERLAEUFE, NAME } from "./figuren.js?v=20261024";
import { lade, speichere, spielZuruecksetzen } from "./assets/storage.js";
import { stillEintragen, toplisteAnzeigen, bewegungReduziert } from "./assets/ui.js";
import * as FS from "./assets/fortschritt.js";
import { raumEroeffnen, raumBeitreten, CODE_MUSTER } from "./assets/mehrspieler.js";

const SPIEL = "schach";
const $ = (id) => document.getElementById(id);
const el = {
  modi: $("modi"),
  stufen: $("stufen"),
  online: $("online"),
  beitritt: $("beitritt"),
  code: $("code"),
  raumkopf: $("raumkopf"),
  raumcode: $("raumcode"),
  status: $("status"),
  brett: $("brett"),
  ende: $("ende"),
  nochmal: $("nochmal"),
  punkte: $("punkte"),
  zurueck: $("zurueck"),
  aufgeben: $("aufgeben"),
  drehen: $("drehen"),
  oben: $("oben"),
  unten: $("unten"),
  zuege: $("zuege"),
  wahl: $("umwandlung"),
  l1: $("hud-l1"),
  w1: $("hud-1"),
  l2: $("hud-l2"),
  w2: $("hud-2"),
  topliste: $("topliste"),
};
document.body.insertAdjacentHTML("beforeend", VERLAEUFE);
const FARBE = { w: "Weiß", b: "Schwarz" };
const WERTUNG = { leicht: [1, 0], mittel: [3, 1], schwer: [10, 4] };
const ENDE_TEXT = {
  patt: "Patt",
  50: "50-Züge-Regel",
  wdh: "dreifache Wiederholung",
  material: "zu wenig Material",
  aufgabe: "Aufgabe",
};

/* ---------- Zustand ---------- */
let modus = "computer";
let stufe = lade(SPIEL, "stufe", "mittel");
if (!["leicht", "mittel", "schwer"].includes(stufe)) stufe = "mittel";
let st = E.neueStellung();
let verlauf = []; // [{st (vorher), z, san}]
let aus = null; // {ende, sieger}
let ich = "w";
let gedreht = false; // zu zweit: Brett von Hand gedreht
let auswahl = -1;
let cursor = E.feldAus("e2");
let rechnet = false;
let ungewertet = false;
let stat = lade(SPIEL, "stat", null) || { punkte: 0, siege: 0 };
let zielFarbeComputer = lade(SPIEL, "farbe", "w");
// online
let netz = null;
let gastDa = false;
let stand = { host: 0, gast: 0 };
let runde = 0;
let hostFarbe = "w";

/* ---------- Worker ---------- */
let worker = null;
let anfrage = 0;
try {
  worker = new Worker(new URL("./ki-worker.js?v=20261024", import.meta.url), { type: "module" });
} catch {
  worker = null;
}
function computerRechnen(s, stu) {
  const id = ++anfrage;
  return new Promise((fertig) => {
    if (!worker) return setTimeout(() => fertig(E.computerZug(s, stu)), 30);
    const an = (e) => {
      if (e.data.id !== id) return;
      worker.removeEventListener("message", an);
      fertig(e.data.zug);
    };
    worker.addEventListener("message", an);
    worker.postMessage({ id, st: s, stufe: stu });
  });
}

/* ---------- Brett aufbauen ---------- */
const felder = new Map(); // feld -> button
for (let i = 0; i < 64; i++) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "sch-feld";
  b.tabIndex = -1;
  b.addEventListener("click", () => klick(Number(b.dataset.q)));
  el.brett.append(b);
}

const unten = () => (modus === "zweit" ? (gedreht ? "b" : "w") : ich);

function ichDarf() {
  if (aus || rechnet) return false;
  if (modus === "zweit") return true;
  if (modus === "online") return !!netz && (netz.rolle === "gast" || gastDa) && st.w === ich;
  return st.w === ich;
}

/* ---------- Zeichnen ---------- */
let animiert = null; // {v, n} des zuletzt gezeigten Zugs
function zeichnen() {
  const schwarzUnten = unten() === "b";
  const legal = auswahl >= 0 ? E.zuege(st).filter((z) => z.v === auswahl) : [];
  const ziele = new Map(legal.map((z) => [z.n, z]));
  const letzter = verlauf.length ? verlauf[verlauf.length - 1].z : null;
  const schachK =
    !aus?.ende || aus.ende === "matt" ? (E.imSchach(st) ? st.k[st.w === "w" ? 0 : 1] : -1) : -1;
  const ruhig = bewegungReduziert();
  const neuAnim =
    letzter &&
    !ruhig &&
    (!animiert ||
      animiert.v !== letzter.v ||
      animiert.n !== letzter.n ||
      animiert.l !== verlauf.length);
  [...el.brett.children].forEach((b, i) => {
    const r = schwarzUnten ? i >> 3 : 7 - (i >> 3);
    const l = schwarzUnten ? 7 - (i & 7) : i & 7;
    const q = r * 16 + l;
    b.dataset.q = q;
    const x = st.b[q];
    const hell = (r + l) % 2 === 1;
    b.className = `sch-feld ${hell ? "hell" : "dunkel"}`;
    if (letzter && (q === letzter.v || q === letzter.n)) b.classList.add("letzt");
    if (q === auswahl) b.classList.add("gewaehlt");
    if (ziele.has(q)) b.classList.add(st.b[q] || ziele.get(q).art === "ep" ? "schlag" : "ziel");
    if (q === schachK) b.classList.add("schach");
    if (q === cursor && document.activeElement === el.brett) b.classList.add("cursor");
    // Koordinaten im Randfeld (wie auf echten Turnierbrettern)
    let koord = "";
    const randReihe = schwarzUnten ? 7 : 0;
    const randLinie = schwarzUnten ? 7 : 0;
    if (l === randLinie) koord += `<span class="k-reihe">${r + 1}</span>`;
    if (r === randReihe) koord += `<span class="k-linie">${"abcdefgh"[l]}</span>`;
    let fig = x ? figur(x) : "";
    b.innerHTML = koord + fig;
    const name = E.feldName(q);
    b.setAttribute(
      "aria-label",
      x ? `${name}: ${FARBE[x === x.toUpperCase() ? "w" : "b"]}er ${NAME[x.toLowerCase()]}` : name,
    );
    if (neuAnim && q === letzter.n && x) {
      const vr = letzter.v >> 4,
        vl = letzter.v & 7;
      const dx = (vl - l) * (schwarzUnten ? -1 : 1);
      const dy = (r - vr) * (schwarzUnten ? -1 : 1);
      const svg = b.querySelector(".fig");
      svg.style.setProperty("--dx", dx);
      svg.style.setProperty("--dy", dy);
      svg.classList.add("zieht");
    }
  });
  if (letzter) animiert = { v: letzter.v, n: letzter.n, l: verlauf.length };
  el.brett.classList.toggle("warten", !ichDarf());
  geschlageneZeigen();
  zugListe();
  statusSetzen();
  hud();
  el.ende.hidden = !aus || (modus === "online" && !netz);
  el.zurueck.hidden = modus === "online";
  el.zurueck.disabled = !verlauf.length || rechnet;
  el.aufgeben.hidden = !!aus || (modus === "online" && !netz);
  el.drehen.hidden = modus !== "zweit";
}

const START_ANZAHL = { p: 8, n: 2, b: 2, r: 2, q: 1 };
const WERT = { p: 1, n: 3, b: 3, r: 5, q: 9 };
function geschlageneZeigen() {
  const zahl = { w: {}, b: {} };
  for (let q = 0; q < 128; q++) {
    if (q & 0x88 || !st.b[q]) continue;
    const x = st.b[q];
    const f = x === x.toUpperCase() ? "w" : "b";
    zahl[f][x.toLowerCase()] = (zahl[f][x.toLowerCase()] || 0) + 1;
  }
  // Umwandlungen: mehr Figuren als am Anfang → so viele Bauern weniger zählen
  const weg = (f) => {
    const liste = [];
    let mat = 0;
    for (const t of ["q", "r", "b", "n", "p"]) {
      const n = Math.max(0, START_ANZAHL[t] - (zahl[f][t] || 0));
      for (let i = 0; i < n; i++) liste.push(t);
      mat += (zahl[f][t] || 0) * WERT[t];
    }
    return { liste, mat };
  };
  const ww = weg("w"),
    wb = weg("b");
  const zeile = (seite, gegner, eig) => {
    const geschl = gegner.liste.map((t) => figur(seite === "w" ? t : t.toUpperCase())).join("");
    const plus = eig.mat - gegner.mat;
    return `<span class="sch-name">${spielerName(seite)}</span><span class="sch-geschl">${geschl}</span>${plus > 0 ? `<span class="sch-plus">+${plus}</span>` : ""}`;
  };
  const u = unten();
  const o = u === "w" ? "b" : "w";
  el.unten.innerHTML = zeile(u, u === "w" ? wb : ww, u === "w" ? ww : wb);
  el.oben.innerHTML = zeile(o, o === "w" ? wb : ww, o === "w" ? ww : wb);
  el.oben.classList.toggle("dran", !aus && st.w === o);
  el.unten.classList.toggle("dran", !aus && st.w === u);
}

function spielerName(f) {
  if (modus === "zweit") return FARBE[f];
  if (f === ich) return `Du (${FARBE[f]})`;
  return `${modus === "online" ? "Gegenüber" : "Computer"} (${FARBE[f]})`;
}

function zugListe() {
  let h = "";
  verlauf.forEach((e, i) => {
    const nr = e.st.nr;
    if (e.st.w === "w") h += `<li><b>${nr}.</b> ${e.san}`;
    else if (i === 0) h += `<li><b>${nr}.</b> … ${e.san}`;
    else h += ` ${e.san}`;
    if (e.st.w === "b") h += "</li>";
  });
  el.zuege.innerHTML = h || "<li class='leer'>Noch keine Züge</li>";
  el.zuege.scrollTop = el.zuege.scrollHeight;
}

function statusSetzen(text, art) {
  el.status.dataset.art = art || "";
  if (text) {
    el.status.textContent = text;
    return;
  }
  let t;
  const schach = !aus && E.imSchach(st);
  if (modus === "online" && !netz) t = "Eröffne ein Spiel oder tritt mit Code bei.";
  else if (modus === "online" && netz.rolle === "host" && !gastDa) t = "Warte auf Mitspieler …";
  else if (aus?.sieger) {
    const wie = aus.ende === "matt" ? "Schachmatt" : aus.ende === "aufgabe" ? "Aufgegeben" : "Zeit";
    if (modus === "zweit") t = `${wie} – ${FARBE[aus.sieger]} gewinnt!`;
    else if (aus.sieger === ich) t = `${wie} – du gewinnst!`;
    else t = `${wie} – ${modus === "online" ? "dein Gegenüber gewinnt" : "der Computer gewinnt"}.`;
  } else if (aus) t = `Remis – ${ENDE_TEXT[aus.ende]}.`;
  else if (modus === "zweit") t = `${FARBE[st.w]} ist dran${schach ? " – Schach!" : ""}`;
  else if (st.w === ich) t = schach ? "Schach! Du bist dran" : "Du bist dran";
  else t = modus === "online" ? "Dein Gegenüber ist dran …" : "Der Computer überlegt …";
  el.status.dataset.art = schach && !art ? "schach" : art || "";
  el.status.innerHTML = "";
  if (!aus && (modus !== "online" || netz)) {
    const m = document.createElement("span");
    m.className = `mini m-${st.w}`;
    m.setAttribute("aria-hidden", "true");
    el.status.append(m);
  }
  el.status.append(t);
}

function hud() {
  if (modus === "computer") {
    el.l1.textContent = "Punkte";
    el.w1.textContent = String(stat.punkte);
    el.l2.textContent = "Siege";
    el.w2.textContent = String(stat.siege);
    const [s, r] = WERTUNG[stufe];
    el.punkte.textContent = ungewertet
      ? "Zug zurückgenommen – diese Partie zählt nicht."
      : `Sieg +${s}, Remis +${r} Punkte · Du spielst ${FARBE[ich]}.`;
  } else if (modus === "zweit") {
    el.l1.textContent = "Weiß";
    el.w1.textContent = String(stand.host);
    el.l2.textContent = "Schwarz";
    el.w2.textContent = String(stand.gast);
    el.punkte.textContent = "";
  } else {
    const ichHost = netz?.rolle === "host";
    el.l1.textContent = "Du";
    el.w1.textContent = String(ichHost ? stand.host : stand.gast);
    el.l2.textContent = "Gegenüber";
    el.w2.textContent = String(ichHost ? stand.gast : stand.host);
    el.punkte.textContent = netz ? `Du spielst ${FARBE[ich]}.` : "";
  }
}

/* ---------- Speichern (Computer + zu zweit: Partie überlebt Neuladen) ---------- */
function partieSichern() {
  if (modus === "online") return;
  speichere(
    SPIEL,
    `partie-${modus}`,
    aus
      ? null
      : {
          fen: E.zuFen(verlauf[0]?.st || st),
          zuege: verlauf.map((e) => [e.z.v, e.z.n, e.z.p]),
          ich,
          ungewertet,
          stufe,
        },
  );
}
function partieLaden() {
  const p = lade(SPIEL, `partie-${modus}`, null);
  if (!p || !Array.isArray(p.zuege)) return false;
  try {
    let s = E.ausFen(p.fen);
    s.hist = [E.schluessel(s)];
    const v = [];
    for (const [a, n, pr] of p.zuege) {
      const z = E.zuege(s).find((y) => y.v === a && y.n === n && y.p === (pr || ""));
      if (!z) return false;
      v.push({ st: s, z, san: E.notation(s, z) });
      s = E.ziehen(s, z);
    }
    st = s;
    verlauf = v;
    ich = p.ich === "b" ? "b" : "w";
    ungewertet = !!p.ungewertet;
    if (modus === "computer" && p.stufe && p.stufe !== stufe) ungewertet = true;
    aus = null;
    return true;
  } catch {
    return false;
  }
}

/* ---------- Spielablauf ---------- */
function neuePartie() {
  st = E.neueStellung();
  st.hist = [E.schluessel(st)];
  verlauf = [];
  aus = null;
  auswahl = -1;
  rechnet = false;
  ungewertet = false;
  animiert = null;
  anfrage++;
  if (modus === "computer") ich = zielFarbeComputer;
  zeichnen();
  partieSichern();
  if (modus === "computer" && st.w !== ich) computerZieht();
}

/** Zug ausführen (bereits legal). Gibt true zurück, wenn die Partie vorbei ist. */
function ausfuehren(z) {
  const san = E.notation(st, z);
  verlauf.push({ st, z, san });
  st = E.ziehen(st, z);
  auswahl = -1;
  const l = E.lage(st);
  if (l.ende) aus = { ende: l.ende, sieger: l.sieger };
  return !!aus;
}

function zugFinden(v, n, p) {
  return E.zuege(st).find((z) => z.v === v && z.n === n && (!z.p || z.p === (p || "q")));
}

let wartetUmwandlung = null;
function klick(q) {
  cursor = q;
  if (!ichDarf() || wartetUmwandlung) return;
  const x = st.b[q];
  const eigen = x && E.farbeVon(x) === st.w;
  if (auswahl >= 0) {
    const passend = E.zuege(st).filter((z) => z.v === auswahl && z.n === q);
    if (passend.length) {
      if (passend[0].p) return umwandlungFragen(passend[0]);
      return zugSpielen(passend[0]);
    }
    if (eigen && q !== auswahl) {
      auswahl = q;
      return zeichnen();
    }
    if (q !== auswahl && !eigen) {
      const f = st.b[auswahl];
      statusSetzen(
        `${NAME[f.toLowerCase()]} kann nicht nach ${E.feldName(q)}.${E.imSchach(st) ? " Dein König steht im Schach!" : ""}`,
        "fehler",
      );
      auswahl = -1;
      setTimeout(() => !aus && auswahl < 0 && zeichnen(), 1600);
      return zeichnenOhneStatus();
    }
    auswahl = -1;
    return zeichnen();
  }
  if (eigen) {
    if (!E.zuege(st).some((z) => z.v === q)) {
      zeichnen();
      return statusSetzen(
        E.imSchach(st)
          ? "Schach! Diese Figur kann den König nicht retten."
          : `Dieser ${NAME[x.toLowerCase()]} kann gerade nicht ziehen.`,
        "fehler",
      );
    }
    auswahl = q;
    return zeichnen();
  }
  if (x) statusSetzen(`Das ist eine Figur von ${FARBE[E.farbeVon(x)]}.`, "fehler");
}
function zeichnenOhneStatus() {
  const s = el.status.textContent,
    a = el.status.dataset.art;
  zeichnen();
  el.status.textContent = s;
  el.status.dataset.art = a;
}

function umwandlungFragen(z) {
  wartetUmwandlung = z;
  const f = st.w;
  el.wahl.innerHTML = `<p>Umwandeln in:</p>${["q", "r", "b", "n"].map((t) => `<button type="button" class="sch-wahl" data-p="${t}" aria-label="${NAME[t]}">${figur(f === "w" ? t.toUpperCase() : t)}</button>`).join("")}<button type="button" class="knopf" data-p="">Abbrechen</button>`;
  el.wahl.hidden = false;
  el.wahl.querySelector("button").focus();
}
el.wahl.addEventListener("click", (e) => {
  const k = e.target.closest("button[data-p]");
  if (!k || !wartetUmwandlung) return;
  const z = wartetUmwandlung;
  wartetUmwandlung = null;
  el.wahl.hidden = true;
  if (!k.dataset.p) {
    auswahl = -1;
    return zeichnen();
  }
  const echt = zugFinden(z.v, z.n, k.dataset.p);
  if (echt) zugSpielen(echt);
});

function zugSpielen(z) {
  if (modus === "online" && netz.rolle === "gast") {
    netz.raum.senden({ t: "zug", v: z.v, n: z.n, p: z.p });
    auswahl = -1;
    rechnet = true;
    return zeichnen();
  }
  const vorbei = ausfuehren(z);
  zeichnen();
  partieSichern();
  if (modus === "online") return vorbei ? hostPartieEnde() : hostStandSenden();
  if (vorbei) return partieEnde();
  if (modus === "computer") computerZieht();
}

async function computerZieht() {
  rechnet = true;
  zeichnen();
  const meine = anfrage + 1;
  const t0 = performance.now();
  const z = await computerRechnen({ ...st }, stufe);
  if (meine !== anfrage || modus !== "computer") return;
  const warte = Math.max(0, 450 - (performance.now() - t0));
  await new Promise((r) => setTimeout(r, warte));
  if (meine !== anfrage || modus !== "computer") return;
  rechnet = false;
  const echt = z && zugFinden(z.v, z.n, z.p);
  if (!echt) return zeichnen();
  const vorbei = ausfuehren(echt);
  zeichnen();
  partieSichern();
  if (vorbei) partieEnde();
}

function partieEnde() {
  partieSichern();
  if (modus === "computer") {
    const sieg = aus.sieger === ich;
    const remis = !aus.sieger;
    const [ps, pr] = WERTUNG[stufe];
    const plus = ungewertet ? 0 : sieg ? ps : remis ? pr : 0;
    if (plus) {
      stat.punkte += plus;
      if (sieg) stat.siege++;
      try {
        FS.runde(SPIEL, { punkte: stat.punkte });
      } catch {
        /* Zugabe */
      }
      stillEintragen(SPIEL, stat.punkte, "hoch");
      toplisteAnzeigen(el.topliste, SPIEL, punkteText);
      speichere(SPIEL, "stat", stat);
      el.punkte.textContent = `+${plus} ${plus === 1 ? "Punkt" : "Punkte"} · gesamt ${stat.punkte}`;
    } else epRunde(false);
    zielFarbeComputer = ich === "w" ? "b" : "w"; // nächste Partie andere Farbe
    speichere(SPIEL, "farbe", zielFarbeComputer);
    hud();
    if (plus)
      el.punkte.textContent = `+${plus} ${plus === 1 ? "Punkt" : "Punkte"} · gesamt ${stat.punkte}`;
  } else if (modus === "zweit") {
    if (aus.sieger === "w") stand.host++;
    else if (aus.sieger === "b") stand.gast++;
    epRunde(false);
    hud();
  }
}

function epRunde(sieg) {
  const pb = Number(lade("konto", `pb:${SPIEL}`, 0)) || 0;
  try {
    FS.runde(SPIEL, { punkte: sieg && pb >= 1 ? 1 : 0 });
  } catch {
    /* Fortschritt ist Zugabe */
  }
}

const punkteText = (p) => `${p} ${p === 1 ? "Punkt" : "Punkte"}`;

/* ---------- Bedienung ---------- */
el.brett.addEventListener("keydown", (e) => {
  const schwarzUnten = unten() === "b";
  const d = { ArrowUp: 16, ArrowDown: -16, ArrowLeft: -1, ArrowRight: 1 }[e.key];
  if (d !== undefined) {
    e.preventDefault();
    const z = cursor + (schwarzUnten ? -d : d);
    if (!(z & 0x88)) cursor = z;
    zeichnenOhneStatus();
  } else if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    klick(cursor);
  } else if (e.key === "Escape") {
    auswahl = -1;
    zeichnen();
  }
});
el.brett.addEventListener("focus", () => zeichnenOhneStatus());
el.brett.addEventListener("blur", () => zeichnenOhneStatus());

el.zurueck.addEventListener("click", () => {
  if (!verlauf.length || rechnet || modus === "online") return;
  anfrage++;
  let n = 1;
  if (modus === "computer") {
    // bis ich wieder dran bin
    n = verlauf[verlauf.length - 1].st.w === ich ? 1 : 2;
    if (verlauf.length < n) n = verlauf.length;
    ungewertet = true;
  }
  for (let i = 0; i < n; i++) st = verlauf.pop().st;
  aus = null;
  auswahl = -1;
  animiert = null;
  zeichnen();
  partieSichern();
  if (modus === "computer" && st.w !== ich) computerZieht();
});

el.aufgeben.addEventListener("click", () => {
  if (aus) return;
  if (modus === "online") {
    if (!netz) return;
    if (!confirm("Wirklich aufgeben?")) return;
    if (netz.rolle === "gast") return netz.raum.senden({ t: "aufgeben" });
    aus = { ende: "aufgabe", sieger: hostFarbe === "w" ? "b" : "w" };
    zeichnen();
    return hostPartieEnde();
  }
  if (!verlauf.length && modus === "computer") return neuePartie();
  if (!confirm("Wirklich aufgeben?")) return;
  anfrage++;
  rechnet = false;
  const verlierer = modus === "zweit" ? st.w : ich;
  aus = { ende: "aufgabe", sieger: verlierer === "w" ? "b" : "w" };
  zeichnen();
  partieEnde();
});

el.drehen.addEventListener("click", () => {
  gedreht = !gedreht;
  animiert = verlauf.length ? { ...animiert } : null;
  zeichnen();
});

function knopfWahl(gruppe, attr, wert) {
  for (const k of gruppe.querySelectorAll("button"))
    k.setAttribute("aria-pressed", String(k.dataset[attr] === wert));
}

function modusSetzen(m, laden = true) {
  if (netz) return;
  modus = m;
  knopfWahl(el.modi, "modus", m);
  el.stufen.hidden = m !== "computer";
  el.online.hidden = m !== "online";
  stand = { host: 0, gast: 0 };
  anfrage++;
  rechnet = false;
  auswahl = -1;
  animiert = null;
  if (m !== "online" && laden && partieLaden()) {
    animiert = verlauf.length
      ? { v: verlauf.at(-1).z.v, n: verlauf.at(-1).z.n, l: verlauf.length }
      : null;
    zeichnen();
    if (modus === "computer" && st.w !== ich) computerZieht();
    return;
  }
  ich = m === "computer" ? zielFarbeComputer : "w";
  neuePartie();
}
el.modi.addEventListener("click", (e) => {
  const k = e.target.closest("button[data-modus]");
  if (k && k.dataset.modus !== modus) modusSetzen(k.dataset.modus);
});
el.stufen.addEventListener("click", (e) => {
  const k = e.target.closest("button[data-stufe]");
  if (!k || k.dataset.stufe === stufe) return;
  stufe = k.dataset.stufe;
  speichere(SPIEL, "stufe", stufe);
  knopfWahl(el.stufen, "stufe", stufe);
  if (verlauf.length && !aus) {
    // laufende Partie geht weiter, zählt aber nicht mehr
    ungewertet = true;
    partieSichern();
    zeichnen();
    if (st.w !== ich && !rechnet) computerZieht();
  } else neuePartie();
});
el.nochmal.addEventListener("click", () => {
  if (modus === "online") {
    if (netz.rolle === "host") hostNeueRunde();
    else netz.raum.senden({ t: "revanche" });
    return;
  }
  neuePartie();
});

$("reset").addEventListener("click", () => {
  spielZuruecksetzen(SPIEL);
  stat = { punkte: 0, siege: 0 };
  hud();
  toplisteAnzeigen(el.topliste, SPIEL, punkteText);
});

/* ---------- Online ---------- */
function onlineStart(n) {
  netz = n;
  el.modi.classList.add("gesperrt");
  el.online.hidden = true;
  el.raumkopf.hidden = false;
  el.raumcode.textContent = n.code;
  stand = { host: 0, gast: 0 };
}
function onlineEnde(text) {
  try {
    netz?.rolle === "host" ? netz.raum.schliessen() : netz?.raum.verlassen();
  } catch {
    /* schon zu */
  }
  netz = null;
  gastDa = false;
  el.modi.classList.remove("gesperrt");
  el.raumkopf.hidden = true;
  el.online.hidden = modus !== "online";
  ich = "w";
  st = E.neueStellung();
  verlauf = [];
  aus = null;
  rechnet = false;
  zeichnen();
  if (text) statusSetzen(text, "fehler");
}

// Host: Platz 0 = Host, Platz 1 = Gast.
function hostStandSenden() {
  netz?.raum.senden(1, {
    t: "stand",
    fen: E.zuFen(verlauf[0]?.st || st),
    zuege: verlauf.map((e) => [e.z.v, e.z.n, e.z.p]),
    aus,
    farbe: hostFarbe === "w" ? "b" : "w",
    stand,
    runde,
  });
}
function hostNeueRunde() {
  runde++;
  hostFarbe = runde % 2 ? "w" : "b"; // Farben wechseln je Partie
  ich = hostFarbe;
  st = E.neueStellung();
  st.hist = [E.schluessel(st)];
  verlauf = [];
  aus = null;
  auswahl = -1;
  rechnet = false;
  animiert = null;
  zeichnen();
  hostStandSenden();
}
function hostPartieEnde() {
  if (aus.sieger === hostFarbe) stand.host++;
  else if (aus.sieger) stand.gast++;
  epRunde(aus.sieger === hostFarbe);
  hostStandSenden();
  hud();
}

/** Gast: Stand aus Startstellung + Zugliste nachspielen (klein und prüfbar). */
function gastStandUebernehmen(d) {
  let s = E.ausFen(d.fen);
  s.hist = [E.schluessel(s)];
  const v = [];
  for (const [a, n, p] of d.zuege || []) {
    const z = E.zuege(s).find((y) => y.v === a && y.n === n && y.p === (p || ""));
    if (!z) break;
    v.push({ st: s, z, san: E.notation(s, z) });
    s = E.ziehen(s, z);
  }
  st = s;
  verlauf = v;
  aus = d.aus || null;
  ich = d.farbe === "b" ? "b" : "w";
  stand = d.stand || stand;
  rechnet = false;
  auswahl = -1;
  zeichnen();
}

$("eroeffnen").addEventListener("click", async () => {
  statusSetzen("Eröffne Spiel …");
  try {
    const raum = await raumEroeffnen(SPIEL, {
      gast() {
        gastDa = true;
        if (!runde) hostNeueRunde();
        else hostStandSenden();
        zeichnen();
      },
      gastWeg() {
        gastDa = false;
        zeichnen();
        statusSetzen("Verbindung weg – warte auf Rückkehr …");
      },
      nachricht(platz, d) {
        if (platz !== 1 || !d) return;
        const gastFarbe = hostFarbe === "w" ? "b" : "w";
        if (d.t === "zug" && !aus && st.w === gastFarbe) {
          const z = zugFinden(d.v, d.n, d.p);
          if (z) {
            const vorbei = ausfuehren(z);
            zeichnen();
            return vorbei ? hostPartieEnde() : hostStandSenden();
          }
          return hostStandSenden();
        }
        if (d.t === "zug") return hostStandSenden(); // ungültig → Stand erneut
        if (d.t === "aufgeben" && !aus) {
          aus = { ende: "aufgabe", sieger: hostFarbe };
          zeichnen();
          return hostPartieEnde();
        }
        if (d.t === "revanche" && aus) hostNeueRunde();
      },
      status(text, art) {
        statusSetzen(text, art);
      },
    });
    runde = 0;
    onlineStart({ rolle: "host", raum, code: raum.code });
    zeichnen();
  } catch (err) {
    statusSetzen(err.message || "Eröffnen hat nicht geklappt.", "fehler");
  }
});

el.beitritt.addEventListener("submit", async (e) => {
  e.preventDefault();
  const code = el.code.value.toUpperCase().trim();
  if (!CODE_MUSTER.test(code)) return statusSetzen("Der Code hat 4 Zeichen (A–Z, 2–9).", "fehler");
  statusSetzen("Verbinde …");
  try {
    const raum = await raumBeitreten(SPIEL, code, {
      verbunden() {
        statusSetzen("Verbunden – gleich geht's los.");
      },
      nachricht(d) {
        if (d?.t === "stand") gastStandUebernehmen(d);
      },
      status(text, art) {
        statusSetzen(text, art);
      },
      ende(grund) {
        onlineEnde(grund || "Das Spiel ist beendet.");
      },
    });
    onlineStart({ rolle: "gast", raum, code });
    statusSetzen("Verbinde direkt …");
  } catch (err) {
    statusSetzen(err.message || "Beitreten hat nicht geklappt.", "fehler");
  }
});

$("aufstehen").addEventListener("click", () => onlineEnde("Du hast das Spiel verlassen."));
$("teilen").addEventListener("click", async () => {
  const code = netz?.code;
  if (!code) return;
  const url = `${location.origin}${location.pathname}?tisch=${code}`;
  try {
    if (navigator.share)
      await navigator.share({ title: "Schach", text: `Spiel Schach mit mir: ${code}`, url });
    else {
      await navigator.clipboard.writeText(url);
      statusSetzen("Link kopiert.");
    }
  } catch {
    statusSetzen(`Code: ${code}`);
  }
});
window.addEventListener("pagehide", () => {
  if (netz?.rolle === "host") netz.raum.schliessen();
});

/* ---------- Start ---------- */
knopfWahl(el.stufen, "stufe", stufe);
toplisteAnzeigen(el.topliste, SPIEL, punkteText);
const eingeladen = new URLSearchParams(location.search).get("tisch");
if (eingeladen) {
  modusSetzen("online");
  el.code.value = eingeladen.toUpperCase().slice(0, 4);
} else modusSetzen("computer");
