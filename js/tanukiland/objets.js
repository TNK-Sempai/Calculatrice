// =====================================================================
//  TANUKILAND - obstacles et objets
//  Les planches mobiles, les tuiles de toit qui tombent et les boites
//  d'omikuji. Comme les yokai, rien ici ne connait le decor : le jeu
//  fournit ce qu'il faut et recupere des positions.
// =====================================================================

import { TUILE_TOIT, VIDE } from "../niveaux/format.js";

// Une planche fait six pixels d'epaisseur : assez pour se voir, assez
// fin pour qu'on saute dessus sans se cogner la tete au passage.
export const EPAISSEUR_PLANCHE = 6;

// Delai avant qu'une tuile de toit cede, puis avant qu'elle revienne.
// Le premier doit laisser le temps de repartir, le second le temps de
// recommencer sans attendre.
export const DELAI_TUILE = 0.45;
export const RETOUR_TUILE = 3;
const GRAVITE_TUILE = 700;

// ---------------------------------------------------------------------
// Planches mobiles
// ---------------------------------------------------------------------

// entite : { type: "plateforme", colonne, ligne, axe, amplitude, vitesse,
//            largeurTuiles? }
export function creerPlateforme(entite, tuile) {
  const largeurTuiles = entite.largeurTuiles === undefined ? 3 : entite.largeurTuiles;
  return {
    axe: entite.axe,
    amplitude: entite.amplitude * tuile,
    vitesse: entite.vitesse,
    x: entite.colonne * tuile,
    y: entite.ligne * tuile,
    xDepart: entite.colonne * tuile,
    yDepart: entite.ligne * tuile,
    largeur: largeurTuiles * tuile,
    hauteur: EPAISSEUR_PLANCHE,
    sens: 1,
    dx: 0,
    dy: 0
  };
}

// La course est triangulaire et non sinusoidale : a vitesse constante,
// le tanuki pose dessus garde la meme derive tout du long, ce qui se
// juge beaucoup mieux au saut qu'une planche qui ralentit aux bouts.
export function animerPlateforme(planche, delta) {
  const avance = planche.vitesse * planche.sens * delta;
  const avantX = planche.x;
  const avantY = planche.y;

  if (planche.axe === "x") {
    planche.x += avance;
    if (planche.x > planche.xDepart + planche.amplitude) {
      planche.x = planche.xDepart + planche.amplitude;
      planche.sens = -1;
    } else if (planche.x < planche.xDepart) {
      planche.x = planche.xDepart;
      planche.sens = 1;
    }
  } else {
    planche.y += avance;
    if (planche.y > planche.yDepart + planche.amplitude) {
      planche.y = planche.yDepart + planche.amplitude;
      planche.sens = -1;
    } else if (planche.y < planche.yDepart) {
      planche.y = planche.yDepart;
      planche.sens = 1;
    }
  }

  planche.dx = planche.x - avantX;
  planche.dy = planche.y - avantY;
}

// Vrai si le corps repose sur la planche : ses pieds a sa surface, et
// un recouvrement horizontal reel.
export function reposeSur(corps, planche) {
  const pieds = corps.y + corps.hauteur;
  return pieds >= planche.y - 2 && pieds <= planche.y + planche.hauteur
    && corps.x + corps.largeur > planche.x && corps.x < planche.x + planche.largeur;
}

// ---------------------------------------------------------------------
// Tuiles de toit
// ---------------------------------------------------------------------

// Les tuiles sont dans la grille, mais leur etat ne peut pas y tenir :
// on les en sort au chargement pour leur donner une minuterie, tout en
// laissant leur nature dans la grille tant qu'elles portent.
export function creerTuilesToit(niveau) {
  const tuiles = [];
  for (let rangee = 0; rangee < niveau.rangees; rangee++) {
    for (let colonne = 0; colonne < niveau.colonnes; colonne++) {
      if (niveau.natureDorigine(colonne, rangee) === TUILE_TOIT) {
        tuiles.push({
          colonne, rangee,
          x: colonne * niveau.tuile,
          y: rangee * niveau.tuile,
          etat: "stable",
          minuterie: 0,
          vy: 0
        });
      }
    }
  }
  return tuiles;
}

// charge() dit si le tanuki appuie dessus a cette image.
export function animerTuile(tuile, niveau, delta, charge) {
  if (tuile.etat === "stable") {
    if (charge) {
      tuile.etat = "minute";
      tuile.minuterie = 0;
    }
    return;
  }

  if (tuile.etat === "minute") {
    tuile.minuterie += delta;
    if (tuile.minuterie >= DELAI_TUILE) {
      tuile.etat = "tombe";
      tuile.vy = 0;
      // Elle cesse de porter a l'instant ou elle cede
      niveau.definirNature(tuile.colonne, tuile.rangee, VIDE);
    }
    return;
  }

  if (tuile.etat === "tombe") {
    tuile.vy += GRAVITE_TUILE * delta;
    tuile.y += tuile.vy * delta;
    if (tuile.y > niveau.hauteur + 32) {
      tuile.etat = "absente";
      tuile.minuterie = 0;
    }
    return;
  }

  // Absente : elle revient a sa place, pour qu'un echec se retente
  tuile.minuterie += delta;
  if (tuile.minuterie >= RETOUR_TUILE) {
    tuile.etat = "stable";
    tuile.y = tuile.rangee * niveau.tuile;
    tuile.vy = 0;
    niveau.definirNature(tuile.colonne, tuile.rangee, TUILE_TOIT);
  }
}

// Vrai si le corps se tient sur cette tuile.
export function appuieSurTuile(corps, tuile, taille) {
  if (tuile.etat !== "stable" && tuile.etat !== "minute") {
    return false;
  }
  const pieds = corps.y + corps.hauteur;
  return Math.abs(pieds - tuile.y) <= 2
    && corps.x + corps.largeur > tuile.x && corps.x < tuile.x + taille;
}

// ---------------------------------------------------------------------
// Boites d'omikuji
// ---------------------------------------------------------------------

// entite : { type: "omikuji", colonne, ligne, contenu }
export function creerOmikuji(entite, tuile) {
  return {
    colonne: entite.colonne,
    rangee: entite.ligne,
    contenu: entite.contenu,
    x: entite.colonne * tuile,
    y: entite.ligne * tuile,
    utilisee: false
  };
}

// Une boite frappee par en dessous rend son contenu, une seule fois.
// Rend null quand elle est deja vide : c'est le jeu qui decide ce que
// devient un contenu, pas la boite.
export function ouvrirOmikuji(boite) {
  if (boite.utilisee) {
    return null;
  }
  boite.utilisee = true;
  return boite.contenu;
}
