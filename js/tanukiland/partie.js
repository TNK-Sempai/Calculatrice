// =====================================================================
//  TANUKILAND - etat de la partie
//  Vies, feuilles, score, chrono, progression et sauvegarde locale.
//  Rien de graphique ici : c'est la comptabilite du jeu, et elle se
//  verifie sans ouvrir de fenetre.
// =====================================================================

import { creerStockage } from "../noyau/stockage.js";

export const VIES_DEPART = 3;
export const DUREE_NIVEAU = 300;
export const FEUILLES_PAR_VIE = 100;

// Baremes. Le temps restant vaut cher : c'est ce qui fait qu'un niveau
// connu se rejoue vite plutot que de se visiter.
export const POINTS = {
  feuille: 10,
  yokai: 100,
  seconde: 10,
  torii: 200
};

const stockage = creerStockage("tanuki-arcade-tanukiland");

export function creerPartie() {
  const partie = {
    vies: VIES_DEPART,
    score: 0,
    feuilles: 0,
    monde: 0,
    niveau: 0,
    tempsRestant: DUREE_NIVEAU,

    // ----- progression -----

    // Le numero affiche, au format 1-1
    etiquette() {
      return (this.monde + 1) + "-" + (this.niveau + 1);
    },

    demarrerNiveau() {
      this.tempsRestant = DUREE_NIVEAU;
    },

    // ----- gains -----

    // Rend vrai quand la centieme feuille vient de donner une vie.
    ramasserFeuille() {
      this.feuilles++;
      this.score += POINTS.feuille;
      if (this.feuilles >= FEUILLES_PAR_VIE) {
        this.feuilles -= FEUILLES_PAR_VIE;
        this.vies++;
        return true;
      }
      return false;
    },

    eliminerYokai() {
      this.score += POINTS.yokai;
    },

    // Fin de niveau : le temps restant devient des points.
    terminerNiveau() {
      const reste = Math.max(0, Math.floor(this.tempsRestant));
      this.score += POINTS.torii + reste * POINTS.seconde;
      return reste * POINTS.seconde;
    },

    // ----- pertes -----

    // Rend vrai quand c'etait la derniere vie.
    perdreUneVie() {
      this.vies--;
      return this.vies <= 0;
    },

    // ----- sauvegarde -----

    // La sauvegarde ne sert qu'a reprendre une partie en cours quand on
    // quitte l'onglet. Elle ne debloque rien : un game over l'efface, et
    // la partie suivante repart du premier niveau. La position dans le
    // niveau ne s'y trouve pas, un point de controle ne survit pas a la
    // fermeture.
    sauvegarder() {
      stockage.ecrire({
        monde: this.monde,
        niveau: this.niveau,
        vies: this.vies,
        score: this.score,
        feuilles: this.feuilles
      });
    },

    charger() {
      const garde = stockage.lire();
      if (garde === null || typeof garde !== "object") {
        return false;
      }
      this.monde = entier(garde.monde, 0);
      this.niveau = entier(garde.niveau, 0);
      this.vies = Math.max(1, entier(garde.vies, VIES_DEPART));
      this.score = entier(garde.score, 0);
      this.feuilles = entier(garde.feuilles, 0);
      return true;
    },

    // Apres un game over : tout repart de zero, et la sauvegarde est
    // effacee. Reprendre au niveau le plus loin atteint reviendrait a
    // contourner la perte de la derniere vie.
    recommencer() {
      this.monde = 0;
      this.niveau = 0;
      this.vies = VIES_DEPART;
      this.score = 0;
      this.feuilles = 0;
      this.tempsRestant = DUREE_NIVEAU;
      effacerSauvegarde();
    }
  };
  return partie;
}

function entier(valeur, defaut) {
  return Number.isFinite(valeur) ? Math.floor(valeur) : defaut;
}

// Pour les tests et pour un eventuel effacement depuis la page
export function effacerSauvegarde() {
  stockage.effacer();
}
