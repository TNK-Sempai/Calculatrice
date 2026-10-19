// =====================================================================
//  SHOGI - Web Worker de l'IA
//  La recherche alpha-beta peut durer jusqu'a deux secondes : elle
//  tourne ici pour que la page reste fluide pendant que l'IA reflechit.
// =====================================================================

import { choisirCoup } from "./moteur.js";

self.onmessage = function (evenement) {
  const d = evenement.data;
  const pos = { plateau: Int8Array.from(d.plateau), mains: [d.mains[0].slice(), d.mains[1].slice()], trait: d.trait };
  const coup = choisirCoup(pos, d.niveau, d.graine);
  self.postMessage({ id: d.id, coup });
};
