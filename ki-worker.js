/* ki-worker.js · rechnet den Computerzug im Hintergrund (Seite ruckelt nicht) */
import { computerZug } from "./engine.js?v=20261024";

self.onmessage = (e) => {
  const { id, st, stufe } = e.data;
  const z = computerZug(st, stufe);
  self.postMessage({ id, zug: z && { v: z.v, n: z.n, p: z.p } });
};
