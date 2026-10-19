// =====================================================================
//  NOYAU - clavier
//  Evite de repeter dans chaque jeu la garde qui ignore les touches
//  quand le jeu n'est pas a l'ecran ou qu'une surcouche est ouverte.
// =====================================================================

import { jeuActif, overlayOuvert } from "../arcade.js";

// Vrai quand le jeu donne est bien celui qui a la main
export function jeuAuPremierPlan(idJeu) {
  return jeuActif === idJeu && !overlayOuvert;
}

// Une touche tapee dans un champ (pseudo, code de partie) n'est pas un coup
export function champDeSaisie(cible) {
  return !!cible && (cible.tagName === "INPUT" || cible.tagName === "TEXTAREA" || cible.isContentEditable);
}

// Gestionnaire d'appui, filtre pour le jeu donne
export function surTouche(idJeu, gestionnaire) {
  document.addEventListener("keydown", function (evenement) {
    if (!jeuAuPremierPlan(idJeu) || champDeSaisie(evenement.target)) {
      return;
    }
    gestionnaire(evenement);
  });
}

// Gestionnaire de relachement, sans filtre : certains jeux doivent oublier
// une touche maintenue meme si le joueur a quitte entre-temps.
export function surRelachement(gestionnaire) {
  document.addEventListener("keyup", gestionnaire);
}
