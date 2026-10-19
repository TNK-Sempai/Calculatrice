// =====================================================================
//  FAISABILITE DES NIVEAUX
//  On ne peut pas jouer chaque niveau a chaque modification pour savoir
//  s'il reste franchissable. Ce module calcule ce que le saut permet,
//  a partir des constantes reellement utilisees par le jeu, puis relit
//  le decor pour signaler toute marche trop haute ou tout trou trop
//  large, en nommant la colonne fautive.
//
//  Le calcul part des constantes et non de valeurs ecrites a la main :
//  regler le saut dans le panneau F2 et oublier de corriger le controle
//  donnerait un controle qui ment.
// =====================================================================

import { PROPRIETES } from "./format.js";
// La faisabilite doit savoir de quoi les creatures sont capables : c'est
// sa raison d'etre. Elle lit donc leurs reglages par defaut plutot que
// d'en garder une copie qui finirait par mentir.
import { reglagesDe } from "../tanukiland/yokai.js";

// Marge de securite. Un niveau qui demanderait exactement le saut
// maximal serait injouable en pratique : il faut arriver a pleine
// vitesse, sauter a l'image pres et atterrir au pixel pres.
export const MARGE = 0.8;

const PAS = 1 / 60;

// Hauteur et portee du saut, dans les memes conditions que le jeu.
//
// La hauteur continue, v carre sur deux g, est la valeur theorique. Le
// jeu integre a pas fini, ce qui en perd toujours un peu : c'est la
// hauteur simulee, plus basse, qui sert de reference au controle.
export function envelopeDuSaut(reglages) {
  const continue_ = reglages.impulsionSaut * reglages.impulsionSaut
    / (2 * reglages.graviteMontante);

  let y = 0;
  let vy = -reglages.impulsionSaut;
  let plusHaut = 0;
  let images = 0;
  while (vy < 0 && images < 1000) {
    vy += reglages.graviteMontante * PAS;
    y += vy * PAS;
    if (y < plusHaut) {
      plusHaut = y;
    }
    images++;
  }
  const hauteur = -plusHaut;

  // Temps de vol : la montee, puis la retombee a la gravite descendante
  // jusqu'au niveau de depart.
  const tMontee = images * PAS;
  const tDescente = Math.sqrt(2 * hauteur / reglages.graviteDescendante);
  const portee = reglages.vitesseMax * (tMontee + tDescente);

  return {
    hauteurContinue: continue_,
    hauteur,
    portee,
    tMontee,
    tDescente
  };
}

// ---------------------------------------------------------------------
// Temps de parcours
// ---------------------------------------------------------------------

// Un joueur moyen ne va pas tout droit a pleine vitesse : il explore,
// revient sur ses pas, s'arrete devant un yokai. Le modele majore donc
// la largeur du niveau d'un tiers et ne compte que la moitie de la
// vitesse maximale. Ce n'est pas une mesure, c'est une borne haute
// volontairement pessimiste : si le chrono tient avec elle, il tient.
export const DETOUR = 1.35;
export const PART_DE_VITESSE = 0.5;

export function tempsDeParcours(niveau, reglages) {
  const distance = niveau.largeur * DETOUR;
  return distance / (reglages.vitesseMax * PART_DE_VITESSE);
}

// ---------------------------------------------------------------------
// Relief du niveau
// ---------------------------------------------------------------------

// Le relief tel qu'un joueur le parcourt, de gauche a droite.
//
// Une colonne peut offrir plusieurs surfaces : le sol, et des planches
// au-dessus. On ne retient pas systematiquement la plus basse, sinon une
// planche facultative jetee par-dessus un trou serait lue comme une
// marche de cinq tuiles. On retient la plus basse de celles que le saut
// permet d'atteindre depuis la colonne precedente. Sans aucune, la
// colonne est un trou a franchir, ce qu'elle est bel et bien.
function surfacesDe(niveau, colonne) {
  const rangees = [];
  for (let rangee = niveau.rangees - 1; rangee >= 0; rangee--) {
    const ici = PROPRIETES[niveau.natureDorigine(colonne, rangee)] || {};
    if (!ici.solide && !ici.porte) {
      continue;
    }
    const dessus = PROPRIETES[niveau.natureDorigine(colonne, rangee - 1)] || {};
    if (dessus.solide) {
      continue;   // pas la place de se tenir debout
    }
    // Un pieu plante sur le sol, ou de l'eau : on ne s'y tient pas
    if (ici.mortel || dessus.mortel) {
      continue;
    }
    rangees.push(rangee);
  }
  return rangees;   // de la plus basse a la plus haute
}

function relief(niveau, monteeMaxTuiles) {
  const sols = [];
  // Une colonne qui offre des surfaces, mais aucune que le saut
  // atteigne, n'est pas un trou : c'est un mur. On le dit a part, sinon
  // un niveau qui finit sur une marche infranchissable passerait pour un
  // niveau qui finit sur du vide.
  const murs = [];
  let precedent = null;
  let bloquePrecedemment = false;

  for (let colonne = 0; colonne < niveau.colonnes; colonne++) {
    const rangees = surfacesDe(niveau, colonne);
    if (rangees.length === 0) {
      sols.push(null);
      bloquePrecedemment = false;
      continue;
    }
    if (precedent === null) {
      sols.push(rangees[0]);
      precedent = rangees[0];
      continue;
    }
    // La plus basse que le saut atteint depuis la colonne precedente.
    // Descendre est toujours possible.
    const atteignable = rangees.find(r => r >= precedent - monteeMaxTuiles);
    if (atteignable === undefined) {
      sols.push(null);
      // Mur ou trou ? On regarde ce qu'il y a a hauteur de corps. Plein,
      // on s'y cogne : c'est une marche trop haute. Vide, on tombe : la
      // colonne est un trou, et c'est la largeur du trou qui compte.
      const aHauteurDeCorps = [precedent, precedent - 1].some(rangee => {
        const nature = PROPRIETES[niveau.natureDorigine(colonne, rangee)] || {};
        return nature.solide === true || nature.porte === true;
      });
      if (aHauteurDeCorps && !bloquePrecedemment) {
        murs.push({ colonne, montee: (precedent - rangees[0]) * niveau.tuile });
      }
      bloquePrecedemment = aHauteurDeCorps;
    } else {
      sols.push(atteignable);
      precedent = atteignable;
      bloquePrecedemment = false;
    }
  }

  // Les planches mobiles ne sont pas dans la grille : sans elles, la
  // traversee d'une riviere passerait pour un trou infranchissable.
  niveau.entites.filter(e => e.type === "plateforme").forEach(planche => {
    const largeurTuiles = planche.largeurTuiles === undefined ? 3 : planche.largeurTuiles;
    // La planche part de sa colonne et va vers la droite : elle ne
    // balaie rien a sa gauche.
    const balayage = planche.axe === "x" ? Math.ceil(planche.amplitude) : 0;
    const premiere = planche.colonne;
    const derniere = planche.colonne + largeurTuiles - 1 + balayage;
    // Sur l'axe vertical la planche descend jusqu'en bas de sa course.
    const rangeeBasse = planche.axe === "y"
      ? planche.ligne + Math.ceil(planche.amplitude)
      : planche.ligne;
    for (let colonne = premiere; colonne <= derniere; colonne++) {
      if (colonne < 0 || colonne >= niveau.colonnes) {
        continue;
      }
      if (sols[colonne] === null || sols[colonne] < rangeeBasse) {
        sols[colonne] = rangeeBasse;
      }
    }
  });

  return { sols, murs };
}

// ---------------------------------------------------------------------
// Controle
// ---------------------------------------------------------------------

// Rend la liste des passages infranchissables. Liste vide : le niveau se
// traverse, au moins par le bas.
export function verifierFaisabilite(niveau, reglages, options) {
  const choix = options || {};
  const marge = choix.marge === undefined ? MARGE : choix.marge;
  const enveloppe = envelopeDuSaut(reglages);
  const tuile = niveau.tuile;
  const monteeMax = enveloppe.hauteur * marge;
  const trouMax = enveloppe.portee * marge;
  const releve = relief(niveau, monteeMax / tuile);
  const sols = releve.sols;
  const fautes = [];

  releve.murs.forEach(mur => {
    fautes.push("colonne " + mur.colonne + " : marche de " + Math.round(mur.montee)
      + " px, alors que le saut ne monte que de "
      + Math.round(monteeMax) + " px");
  });

  let colonne = 0;
  let precedente = null;     // derniere colonne avec un sol
  while (colonne < niveau.colonnes) {
    if (sols[colonne] === null) {
      // Un trou : on mesure sa largeur, puis on regarde la rive d'en face
      let fin = colonne;
      while (fin < niveau.colonnes && sols[fin] === null) {
        fin++;
      }
      const largeurTuiles = fin - colonne;
      const largeur = largeurTuiles * tuile;

      if (fin >= niveau.colonnes) {
        // Un trou qui va jusqu'au bout n'est pas un trou : c'est la fin
        break;
      }
      if (precedente === null) {
        colonne = fin;
        continue;   // le niveau commence par du vide, rien a franchir
      }
      if (largeur > trouMax) {
        fautes.push("colonne " + colonne + " : trou de " + largeurTuiles
          + " tuiles, soit " + Math.round(largeur) + " px, alors que le saut"
          + " ne porte que " + Math.round(trouMax) + " px");
      }
      const montee = (sols[precedente] - sols[fin]) * tuile;
      if (montee > monteeMax) {
        fautes.push("colonne " + fin + " : rive de " + Math.round(montee)
          + " px plus haute que la rive de depart, alors que le saut"
          + " ne monte que de " + Math.round(monteeMax) + " px");
      }
      precedente = fin;
      colonne = fin;
      continue;
    }

    if (precedente !== null && precedente === colonne - 1) {
      const montee = (sols[precedente] - sols[colonne]) * tuile;
      if (montee > monteeMax) {
        fautes.push("colonne " + colonne + " : marche de " + Math.round(montee)
          + " px, alors que le saut ne monte que de "
          + Math.round(monteeMax) + " px");
      }
    }
    precedente = colonne;
    colonne++;
  }

  // Un volant mal place sort du niveau par le haut ou par le bas : son
  // ondulation se verifie aussi, elle ne depend que de ses reglages.
  niveau.entites.filter(e => e.type === "yokai" && e.comportement === "volant")
    .forEach(volant => {
      const defauts = reglagesDe("volant");
      const amplitude = volant.amplitude === undefined ? defauts.amplitude : volant.amplitude;
      const hauteurCorps = volant.hauteur === undefined ? defauts.hauteur : volant.hauteur;
      const plusHaut = volant.ligne * tuile - amplitude;
      const plusBas = volant.ligne * tuile + amplitude + hauteurCorps;
      if (plusHaut < 0 || plusBas > niveau.hauteur) {
        fautes.push("colonne " + volant.colonne + " : un volant d'amplitude "
          + amplitude + " px place ligne " + volant.ligne
          + " sort du niveau, il ondulerait de " + Math.round(plusHaut)
          + " a " + Math.round(plusBas) + " px");
      }
    });

  return fautes;
}
