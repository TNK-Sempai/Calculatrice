// =====================================================================
//  GO - Web Worker de l'IA
//  La recherche Monte-Carlo dure jusqu'a 1,5 s : elle tourne ici pour
//  que la page reste fluide pendant que l'IA reflechit.
// =====================================================================

import { choisirCoup, pierresMortes, creerAleatoire } from "./moteur.js";

self.onmessage = function (evenement) {
  const demande = evenement.data;
  const position = { plateau: Uint8Array.from(demande.plateau), ko: demande.ko, captures: demande.captures.slice() };
  if (demande.type === "coup") {
    const resultat = choisirCoup(position, demande.couleur, demande.niveau, demande.graine, demande.adversaireAPasse);
    self.postMessage({ type: "coup", id: demande.id, coup: resultat.coup, taux: resultat.taux });
  } else if (demande.type === "fin") {
    const { mortes, possession } = pierresMortes(position, creerAleatoire(demande.graine));
    self.postMessage({ type: "fin", id: demande.id, mortes, possession: Array.from(possession) });
  }
};
