// =====================================================================
//  HANETSUKI - la refonte du Pong
//  Le hanetsuki se joue au Nouvel An avec une raquette de bois peinte,
//  le hagoita, et un volant leste d'une graine. La tradition veut que
//  celui qui rate le volant se fasse marquer le visage a l'encre : on
//  compte les points comme ca, sur les portraits.
//
//  - Le volant freine dans l'air entre deux coups et prend de l'effet :
//    une raquette en mouvement au moment du contact le fait tourner, et
//    sa trajectoire se courbe.
//  - Chaque renvoi remplit la jauge de ki. Pleine, Espace (ou A) arme
//    le coup special : le prochain renvoi part tres vite et deroute
//    l'adversaire.
//  - Mode tournoi : cinq yokai, chacun avec sa facon de jouer. Premier a
//    cinq points. Une defaite met fin au tournoi.
//  - Mode duel a deux sur le meme clavier.
// =====================================================================

import { enregistrerJeu, finDePartie, quitterJeu, jeuActif, overlayOuvert, majScoreCourant } from "./arcade.js";
import { creerBoucle } from "./noyau/boucle.js";
import { surTouche } from "./noyau/clavier.js";
import { ordonneeLogique } from "./noyau/pointeur.js";
import { creerBoutonsChoix, marquerChoixActif } from "./noyau/choix.js";
import { creerEffets } from "./noyau/effets.js";
import { jouer, basculerSon, sonActif } from "./noyau/son.js";
import { VERMILLON, PAPIER } from "./tanukiland/sprites.js";

const ID = "pong";

// ---------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------

const zone = document.getElementById("jeuPong");
zone.classList.add("jeu-hanetsuki");
zone.innerHTML = `
  <div class="jeu-entete entete-hanetsuki">
    <span class="jeu-score score-principal">Score <strong class="valeur-score" id="scorePong">0</strong></span>
    <span class="jeu-score echange-hanetsuki" id="echangeBloc">Échange <strong id="echangePong">0</strong></span>
    <span class="jeu-score">Tour <strong id="tourPong">1</strong></span>
    <span class="boutons-hanetsuki">
      <button class="jeu-quitter" id="sonPong" type="button" aria-pressed="false">Son</button>
      <button class="jeu-quitter" id="rejouerPong" type="button">Rejouer</button>
      <button class="jeu-quitter" id="quitterPong" type="button">Retour</button>
    </span>
  </div>
  <div class="scores-ligne modes-hanetsuki" id="modesPong"></div>
  <canvas id="canvasPong" width="720" height="440"></canvas>
  <p class="jeu-aide" id="aidePong"></p>
`;

const canvas = document.getElementById("canvasPong");
const contexte = canvas.getContext("2d");
const zoneScore = document.getElementById("scorePong");
const zoneEchange = document.getElementById("echangePong");
const zoneEchangeBloc = document.getElementById("echangeBloc");
const zoneTour = document.getElementById("tourPong");
const zoneModes = document.getElementById("modesPong");
const zoneAide = document.getElementById("aidePong");
const boutonSon = document.getElementById("sonPong");
const boutonRejouer = document.getElementById("rejouerPong");
const boutonQuitter = document.getElementById("quitterPong");

// ---------------------------------------------------------------------
// Terrain et physique
// ---------------------------------------------------------------------

const LARGEUR = 720;
const HAUTEUR = 440;
const HAUT_TERRAIN = 54;            // le bandeau des portraits au-dessus
const MARGE = 30;
const EPAISSEUR = 12;
const HAUTEUR_RAQUETTE = 84;
const RAYON = 5;
const POINTS_MATCH = 5;
const KI_MAX = 5;

const VITESSE_SERVICE = 460;
const VITESSE_MIN = 400;            // le volant ne descend jamais sous ce seuil
const VITESSE_MAX = 900;
const ACCELERATION = 1.07;
const FREIN = 0.12;                 // perte de vitesse par seconde, en part
const ANGLE_MAX = 0.85;
const EFFET_MAX = 0.9;              // radians par seconde
const VITESSE_RAQUETTE = 430;

// Les adversaires du tournoi et leur facon de jouer
const ADVERSAIRES = [
  {
    nom: "Kasa-obake", portrait: "kasaObake", couleur: "#6a4aa0", sombre: "#4a3270",
    vitesse: 190, reaction: 0.24, erreur: 70, effet: 0, special: 0, angle: 0.2,
    replique: "Le parapluie sautille, mais il est lent."
  },
  {
    nom: "Kappa", portrait: "kappa", couleur: "#7fa32f", sombre: "#4a6b1c",
    vitesse: 250, reaction: 0.17, erreur: 54, effet: 0.25, special: 0.25, angle: 0.3,
    replique: "Il renvoie tout au centre. Varie les angles."
  },
  {
    nom: "Kitsune", portrait: "kitsune", couleur: "#e8c547", sombre: "#a88a2a",
    vitesse: 290, reaction: 0.14, erreur: 42, effet: 0.85, special: 0.5, angle: 0.4,
    replique: "Le renard donne de l'effet. Lis la courbe."
  },
  {
    nom: "Karasu-tengu", portrait: "karasuTengu", couleur: VERMILLON, sombre: "#8f2620",
    vitesse: 390, reaction: 0.1, erreur: 32, effet: 0.4, special: 0.4, angle: 0.85,
    replique: "Rapide, il joue sur les angles extrêmes."
  },
  {
    nom: "Oni", portrait: "oni", couleur: "#c8372d", sombre: "#5a1a16",
    vitesse: 320, reaction: 0.12, erreur: 26, effet: 0.5, special: 1, angle: 0.5, force: 1.12,
    replique: "Chaque coup spécial de l'oni fait trembler le sol."
  }
];

// ---------------------------------------------------------------------
// Etat
// ---------------------------------------------------------------------

const effets = creerEffets();
let mode = "tournoi";
let etat = null;
const touches = { haut: false, bas: false, hautG: false, basG: false };
let pointeurY = null;

function nouvelleRaquette(cote) {
  return {
    cote,
    y: (HAUT_TERRAIN + HAUTEUR) / 2 - HAUTEUR_RAQUETTE / 2,
    v: 0,
    points: 0,
    ki: 0,
    arme: false
  };
}

function nouvelEtat() {
  return {
    score: 0,
    tour: 1,
    adversaire: 0,
    gauche: nouvelleRaquette("gauche"),
    droite: nouvelleRaquette("droite"),
    volant: null,
    echange: 0,
    meilleurEchange: 0,
    serveur: "droite",
    phase: "service",   // service, jeu, point, transition, fin
    minuteur: 0,
    banniere: null,
    ia: { cible: null, delai: 0, decalage: 0, versMoi: false },
    pause: false,
    temps: 0
  };
}

function adversaire() {
  return ADVERSAIRES[etat.adversaire];
}

// Le style de l'adversaire durcit a chaque tour
function styleIA() {
  const base = adversaire();
  const facteur = Math.pow(1.12, etat.tour - 1);
  return {
    ...base,
    vitesse: base.vitesse * facteur,
    reaction: base.reaction / facteur,
    erreur: base.erreur / facteur
  };
}

// ---------------------------------------------------------------------
// Service et volant
// ---------------------------------------------------------------------

function placerVolantAuService() {
  const r = etat[etat.serveur];
  const x = etat.serveur === "droite" ? LARGEUR - MARGE - EPAISSEUR - RAYON - 2 : MARGE + EPAISSEUR + RAYON + 2;
  etat.volant = { x, y: r.y + HAUTEUR_RAQUETTE / 2, vx: 0, vy: 0, effet: 0, special: false, trace: [] };
}

function servir() {
  if (etat.phase !== "service") {
    return;
  }
  const versLaDroite = etat.serveur === "gauche";
  const angle = (Math.random() * 0.5 - 0.25);
  etat.volant.vx = Math.cos(angle) * VITESSE_SERVICE * (versLaDroite ? 1 : -1);
  etat.volant.vy = Math.sin(angle) * VITESSE_SERVICE;
  etat.phase = "jeu";
  etat.echange = 0;
  etat.ia.versMoi = !versLaDroite;
  jouer("tir");
  majHud();
}

// Le volant freine entre deux coups, mais le plancher monte avec
// l'echange : un long echange finit toujours par s'emballer
function vitesseMinimale() {
  return etat === null ? VITESSE_MIN : Math.min(780, VITESSE_MIN + etat.echange * 18);
}

function vitesseDe(v) {
  return Math.hypot(v.vx, v.vy);
}

// Avance d'un pas : effet, freinage, rebonds sur les bords
function avancerVolant(v, delta) {
  // L'effet fait tourner le vecteur vitesse : la trajectoire se courbe
  if (v.effet !== 0) {
    const sens = Math.sign(v.vx) || 1;
    const a = v.effet * delta;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const vx = v.vx * cos - v.vy * sin;
    v.vy = v.vx * sin + v.vy * cos;
    v.vx = vx;
    v.effet *= Math.exp(-1.3 * delta);
    // Jamais au point de repartir en arriere : la courbe s'arrete a 65 degres
    const limite = 1.13;
    if (Math.sign(v.vx) !== sens || Math.abs(Math.atan2(v.vy, Math.abs(v.vx))) > limite) {
      const vitesse = Math.hypot(v.vx, v.vy);
      const angle = Math.sign(v.vy) * limite;
      v.vx = Math.cos(angle) * vitesse * sens;
      v.vy = Math.sin(angle) * vitesse;
      v.effet = 0;
    }
  }
  const vitesse = vitesseDe(v);
  const plancher = vitesseMinimale();
  if (vitesse > plancher && !v.special) {
    const nouvelle = Math.max(plancher, vitesse * (1 - FREIN * delta));
    v.vx *= nouvelle / vitesse;
    v.vy *= nouvelle / vitesse;
  }
  // Un volant ne doit jamais filer a la verticale
  const minVx = 120;
  if (Math.abs(v.vx) < minVx) {
    v.vx = Math.sign(v.vx || 1) * minVx;
  }
  v.x += v.vx * delta;
  v.y += v.vy * delta;
  if (v.y - RAYON < HAUT_TERRAIN) {
    v.y = HAUT_TERRAIN + RAYON;
    v.vy = Math.abs(v.vy);
    v.effet *= -0.6;
    return "bord";
  }
  if (v.y + RAYON > HAUTEUR) {
    v.y = HAUTEUR - RAYON;
    v.vy = -Math.abs(v.vy);
    v.effet *= -0.6;
    return "bord";
  }
  return null;
}

// Renvoi par une raquette : angle selon le point d'impact, effet selon
// le mouvement de la raquette, coup special si la raquette est armee
function renvoyer(raquette, effetImpose) {
  const v = etat.volant;
  const versLaDroite = raquette.cote === "gauche";
  const centre = raquette.y + HAUTEUR_RAQUETTE / 2;
  const position = Math.max(-1, Math.min(1, (v.y - centre) / (HAUTEUR_RAQUETTE / 2)));
  const angle = position * ANGLE_MAX;
  let vitesse = Math.min(VITESSE_MAX, Math.max(VITESSE_SERVICE, vitesseDe(v)) * ACCELERATION);
  if (raquette.cote === "gauche" && mode === "tournoi" && adversaire().force) {
    vitesse = Math.min(VITESSE_MAX, vitesse * adversaire().force);
  }

  v.special = false;
  if (raquette.arme) {
    raquette.arme = false;
    raquette.ki = 0;
    v.special = true;
    vitesse = Math.min(VITESSE_MAX * 1.25, vitesse * 1.65);
    effets.secouer(5, 0.3);
    jouer("grosseExplosion");
  } else {
    jouer("impact");
    raquette.ki = Math.min(KI_MAX, raquette.ki + 1);
  }

  v.vx = Math.cos(angle) * vitesse * (versLaDroite ? 1 : -1);
  v.vy = Math.sin(angle) * vitesse;
  const effet = effetImpose !== undefined ? effetImpose : raquette.v * 0.0021;
  v.effet = Math.max(-EFFET_MAX, Math.min(EFFET_MAX, effet * (versLaDroite ? -1 : 1)));

  etat.echange++;
  etat.meilleurEchange = Math.max(etat.meilleurEchange, etat.echange);
  effets.eclater(v.x, v.y, ["#c8a06a", "#8a6a3a", PAPIER], 6, 90);
  ajouterImpact(v.x, v.y, v.special ? VERMILLON : PAPIER, v.special);
  etat.ia.versMoi = !versLaDroite;
  etat.ia.cible = null;
  etat.ia.delai = 0;
  majHud();
}

function multiplicateur() {
  return Math.min(5, 1 + Math.floor(etat.echange / 4));
}

// ---------------------------------------------------------------------
// Points et matchs
// ---------------------------------------------------------------------

function pointPour(cote) {
  const gagnant = etat[cote];
  gagnant.points++;
  const perdant = cote === "droite" ? etat.gauche : etat.droite;
  perdant.arme = false;
  const v = etat.volant;

  if (mode === "tournoi" && cote === "droite") {
    const points = 100 * multiplicateur() * (v.special ? 2 : 1) * etat.tour;
    gagner(points);
    effets.flotter(LARGEUR / 2, HAUT_TERRAIN + 40, "+" + points + (multiplicateur() > 1 ? "  x" + multiplicateur() : ""), "#c8f060", 14);
    jouer("bonus");
  } else {
    jouer("mort");
  }
  // L'encre tombe sur le visage de celui qui a rate
  const xSortie = cote === "droite" ? 6 : LARGEUR - 6;
  effets.eclater(xSortie, v.y, ["#141414", "#2a2a33", PAPIER], 10, 80);
  ajouterImpact(xSortie, v.y, cote === "droite" ? "#c8f060" : VERMILLON, true);

  etat.serveur = cote === "droite" ? "gauche" : "droite";
  etat.phase = "point";
  etat.minuteur = 1;

  const fini = gagnant.points >= POINTS_MATCH;
  if (fini) {
    if (mode === "duel") {
      etat.phase = "fin";
      etat.banniere = { texte: cote === "droite" ? "Droite gagne" : "Gauche gagne", sous: "N pour rejouer", face: cote === "droite" ? "kappa" : "tanuki", encre: POINTS_MATCH, age: 0, duree: Infinity };
    } else if (cote === "droite") {
      victoireMatch();
    } else {
      etat.phase = "fin";
      etat.banniere = { texte: adversaire().nom + " gagne", sous: etat.score.toLocaleString("fr-BE") + " points, tour " + etat.tour, face: "tanuki", encre: POINTS_MATCH, parcours: { vaincus: etat.adversaire }, age: 0, duree: Infinity };
      setTimeout(() => {
        if (etat !== null && etat.phase === "fin" && !zone.hidden) {
          finDePartie(ID, etat.score);
        }
      }, 1500);
    }
  }
  majHud();
}

function victoireMatch() {
  const bonus = 500 * (etat.adversaire + 1) * etat.tour;
  gagner(bonus);
  jouer("vie");
  // Le vaincu reste a l'ecran, avec son encre, jusqu'au match suivant
  let suivant = etat.adversaire + 1;
  let tour = etat.tour;
  if (suivant >= ADVERSAIRES.length) {
    suivant = 0;
    tour++;
  }
  etat.prochain = { adversaire: suivant, tour };
  etat.phase = "transition";
  etat.minuteur = 2.6;
  etat.banniere = {
    texte: "Victoire  +" + bonus,
    sous: "Prochain : " + ADVERSAIRES[suivant].nom + (tour > 1 ? " (tour " + tour + ")" : ""),
    detail: ADVERSAIRES[suivant].replique,
    face: adversaire().portrait,
    encre: POINTS_MATCH,
    parcours: { vaincus: suivant === 0 ? ADVERSAIRES.length : suivant },
    age: 0,
    duree: 2.6
  };
}

function nouveauMatch() {
  if (etat.prochain) {
    etat.adversaire = etat.prochain.adversaire;
    etat.tour = etat.prochain.tour;
    etat.prochain = null;
  }
  etat.gauche = nouvelleRaquette("gauche");
  etat.droite = nouvelleRaquette("droite");
  etat.serveur = "droite";
  etat.phase = "service";
  etat.echange = 0;
  placerVolantAuService();
  majHud();
}

function gagner(points) {
  etat.score += points;
  majScoreCourant(ID, etat.score);
  majHud();
}

// ---------------------------------------------------------------------
// Intelligence des yokai
// Elle simule la trajectoire du volant, effet compris, pour savoir ou
// il passera, puis vise avec une erreur propre a chaque yokai.
// ---------------------------------------------------------------------

function predireY(xCible) {
  const v = etat.volant;
  const copie = { x: v.x, y: v.y, vx: v.vx, vy: v.vy, effet: v.effet, special: v.special };
  for (let i = 0; i < 360; i++) {
    avancerVolant(copie, 1 / 120);
    if ((copie.vx < 0 && copie.x <= xCible) || (copie.vx > 0 && copie.x >= xCible)) {
      return copie.y;
    }
  }
  return copie.y;
}

function majIA(delta) {
  const r = etat.gauche;
  const style = styleIA();
  const v = etat.volant;
  let cible = (HAUT_TERRAIN + HAUTEUR) / 2;

  if (etat.phase === "service" && etat.serveur === "gauche") {
    etat.minuteur -= delta;
    if (etat.minuteur <= 0) {
      if (r.ki >= KI_MAX && Math.random() < style.special) {
        r.arme = true;
      }
      servir();
    }
  } else if (etat.phase === "jeu" && v.vx < 0) {
    // Le temps de reaction : il ne voit le coup qu'apres un instant
    etat.ia.delai += delta * (v.special ? 0.5 : 1);
    if (etat.ia.delai >= style.reaction) {
      if (etat.ia.cible === null) {
        etat.ia.decalage = (Math.random() * 2 - 1) * style.erreur;
        etat.ia.impact = (Math.random() * 2 - 1) * style.angle;
      }
      const y = predireY(MARGE + EPAISSEUR);
      etat.ia.cible = y;
      cible = y + etat.ia.decalage - etat.ia.impact * HAUTEUR_RAQUETTE / 2;
      if (r.ki >= KI_MAX && !r.arme && Math.random() < style.special * delta * 2) {
        r.arme = true;
      }
    } else {
      cible = r.y + HAUTEUR_RAQUETTE / 2;
    }
  }

  const ecart = cible - (r.y + HAUTEUR_RAQUETTE / 2);
  const vitesse = style.vitesse * (v && v.special && v.vx < 0 ? 0.75 : 1);
  const pas = Math.sign(ecart) * Math.min(Math.abs(ecart), vitesse * delta);
  r.v = pas / Math.max(delta, 0.001);
  r.y = Math.max(HAUT_TERRAIN, Math.min(HAUTEUR - HAUTEUR_RAQUETTE, r.y + pas));
}

// ---------------------------------------------------------------------
// Raquettes du joueur
// ---------------------------------------------------------------------

function deplacerAuClavier(r, haut, bas, delta) {
  const voulue = ((bas ? 1 : 0) - (haut ? 1 : 0)) * VITESSE_RAQUETTE;
  // Une petite inertie : c'est elle qui donne de l'effet au volant
  r.v += (voulue - r.v) * Math.min(1, delta * 14);
  if (!haut && !bas && Math.abs(r.v) < 8) {
    r.v = 0;
  }
  r.y = Math.max(HAUT_TERRAIN, Math.min(HAUTEUR - HAUTEUR_RAQUETTE, r.y + r.v * delta));
  if (r.y === HAUT_TERRAIN || r.y === HAUTEUR - HAUTEUR_RAQUETTE) {
    r.v = 0;
  }
}

function majJoueurs(delta) {
  const d = etat.droite;
  if (pointeurY !== null) {
    const cible = Math.max(HAUT_TERRAIN, Math.min(HAUTEUR - HAUTEUR_RAQUETTE, pointeurY - HAUTEUR_RAQUETTE / 2));
    const ancien = d.y;
    d.y += (cible - d.y) * Math.min(1, delta * 18);
    d.v = (d.y - ancien) / Math.max(delta, 0.001);
  } else {
    deplacerAuClavier(d, touches.haut, touches.bas, delta);
  }
  if (mode === "duel") {
    deplacerAuClavier(etat.gauche, touches.hautG, touches.basG, delta);
  } else {
    majIA(delta);
  }
}

// ---------------------------------------------------------------------
// Boucle
// ---------------------------------------------------------------------

function contact(r) {
  const v = etat.volant;
  const x = r.cote === "gauche" ? MARGE + EPAISSEUR : LARGEUR - MARGE - EPAISSEUR;
  const dansLaHauteur = v.y >= r.y - RAYON && v.y <= r.y + HAUTEUR_RAQUETTE + RAYON;
  if (r.cote === "gauche") {
    return v.vx < 0 && v.x - RAYON <= x && v.x > MARGE - 8 && dansLaHauteur;
  }
  return v.vx > 0 && v.x + RAYON >= x && v.x < LARGEUR - MARGE + 8 && dansLaHauteur;
}

function maj(delta) {
  if (etat === null || etat.pause || jeuActif !== ID || overlayOuvert) {
    return;
  }
  etat.temps += delta;
  effets.maj(delta);
  if (etat.banniere !== null && etat.banniere.duree !== Infinity) {
    etat.banniere.age += delta;
    if (etat.banniere.age > etat.banniere.duree) {
      etat.banniere = null;
    }
  }
  if (etat.phase === "fin") {
    return;
  }
  if (etat.phase === "transition") {
    etat.minuteur -= delta;
    if (etat.minuteur <= 0) {
      nouveauMatch();
    }
    return;
  }

  majJoueurs(delta);

  if (etat.phase === "point") {
    etat.minuteur -= delta;
    if (etat.minuteur <= 0) {
      etat.phase = "service";
      etat.minuteur = 0.9;
      placerVolantAuService();
    }
    return;
  }
  if (etat.phase === "service") {
    // Le volant suit la raquette de celui qui sert
    const r = etat[etat.serveur];
    etat.volant.y = r.y + HAUTEUR_RAQUETTE / 2;
    return;
  }

  // En jeu : plusieurs sous-pas pour ne jamais traverser une raquette
  const v = etat.volant;
  const sousPas = Math.max(1, Math.ceil(vitesseDe(v) * delta / 6));
  for (let i = 0; i < sousPas; i++) {
    const d = delta / sousPas;
    const bord = avancerVolant(v, d);
    if (bord && v.special) {
      effets.eclater(v.x, v.y, [VERMILLON, "#e8c547"], 4, 60);
    }
    if (contact(etat.gauche)) {
      v.x = MARGE + EPAISSEUR + RAYON;
      const style = mode === "tournoi" ? styleIA() : null;
      renvoyer(etat.gauche, style ? (Math.random() * 2 - 1) * style.effet : undefined);
    } else if (contact(etat.droite)) {
      v.x = LARGEUR - MARGE - EPAISSEUR - RAYON;
      renvoyer(etat.droite);
    }
    if (v.x < -10) {
      pointPour("droite");
      return;
    }
    if (v.x > LARGEUR + 10) {
      pointPour("gauche");
      return;
    }
  }
  // La trainee montre l'effet : on voit la courbe avant qu'elle arrive
  v.trace.push({ x: v.x, y: v.y });
  if (v.trace.length > (v.special ? 14 : 8)) {
    v.trace.shift();
  }
  if (v.special && Math.random() < 0.6) {
    effets.eclater(v.x, v.y, [VERMILLON, "#e8c547"], 1, 30);
  }
}

// ---------------------------------------------------------------------
// Dessin : net a toute resolution, cour peinte une fois
// ---------------------------------------------------------------------

let echelle = 1;
let decor = null;
let impacts = [];      // anneaux d'impact, courts, en aplat

function texteContour(t, x, y, taille, couleur, alignement, police) {
  const ctx = contexte;
  ctx.font = police || ("800 " + taille + "px 'Anybody', Impact, sans-serif");
  ctx.textAlign = alignement || "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(3, taille * 0.18);
  ctx.strokeStyle = "#0b0b10";
  ctx.strokeText(t, x, y);
  ctx.fillStyle = couleur;
  ctx.fillText(t, x, y);
}

// La cour du sanctuaire, vue de dessus : dalles, bordure laquee,
// corde sacree au milieu en guise de filet
function peindreDecor() {
  const off = document.createElement("canvas");
  off.width = Math.round(LARGEUR * echelle);
  off.height = Math.round(HAUTEUR * echelle);
  const c = off.getContext("2d");
  c.setTransform(echelle, 0, 0, echelle, 0, 0);
  const h = HAUTEUR - HAUT_TERRAIN;
  c.translate(0, HAUT_TERRAIN);
  // Dalles de pierre, chacune avec sa teinte et un biseau
  c.fillStyle = "#1c1b22";
  c.fillRect(0, 0, LARGEUR, h);
  const alea = hasard(7);
  const cote = 64;
  for (let y = 0; y < h; y += cote / 2) {
    const decale = (Math.round(y / (cote / 2)) % 2) * cote / 2;
    for (let x = -decale; x < LARGEUR; x += cote) {
      const t = 38 + Math.floor(alea() * 8);
      c.fillStyle = "rgb(" + t + "," + (t - 2) + "," + (t + 6) + ")";
      c.fillRect(x + 1, y + 1, cote - 2, cote / 2 - 2);
      c.fillStyle = "rgba(255,255,255,0.05)";
      c.fillRect(x + 1, y + 1, cote - 2, 2);
      c.fillStyle = "rgba(0,0,0,0.25)";
      c.fillRect(x + 1, y + cote / 2 - 3, cote - 2, 2);
    }
  }
  // Lignes du terrain, peintes a la chaux
  c.strokeStyle = "rgba(237,232,223,0.55)";
  c.lineWidth = 2;
  c.strokeRect(MARGE - 8, 8, LARGEUR - 2 * (MARGE - 8), h - 16);
  c.beginPath();
  c.moveTo(MARGE + 120, 8);
  c.lineTo(MARGE + 120, h - 8);
  c.moveTo(LARGEUR - MARGE - 120, 8);
  c.lineTo(LARGEUR - MARGE - 120, h - 8);
  c.stroke();
  // Shimenawa : la corde torsadee qui sert de filet
  const xf = LARGEUR / 2;
  c.fillStyle = "rgba(0,0,0,0.35)";
  c.fillRect(xf - 3, 0, 9, h);
  for (let y = 0; y < h; y += 8) {
    c.fillStyle = "#c9a35a";
    c.beginPath();
    c.ellipse(xf, y + 4, 5, 4.6, 0.7, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#e6c987";
    c.beginPath();
    c.ellipse(xf - 1.5, y + 2.5, 2.4, 1.4, 0.7, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#8f7036";
    c.fillRect(xf - 5, y + 7, 10, 1);
  }
  // Deux poteaux de bois tiennent la corde
  [0, h - 12].forEach(y => {
    c.fillStyle = "#5a3a22";
    c.beginPath();
    c.roundRect(xf - 7, y, 14, 12, 3);
    c.fill();
    c.fillStyle = "#8a5a32";
    c.fillRect(xf - 7, y, 14, 3);
  });
  // Shide : papiers en zigzag accroches a la corde
  [0.18, 0.4, 0.62, 0.84].forEach((part, i) => {
    const y = h * part;
    const s = i % 2 ? 1 : -1;
    c.fillStyle = "rgba(0,0,0,0.3)";
    c.beginPath();
    c.moveTo(xf + 2 * s, y + 2);
    c.lineTo(xf + 16 * s, y + 3);
    c.lineTo(xf + 10 * s, y + 10);
    c.lineTo(xf + 22 * s, y + 13);
    c.lineTo(xf + 15 * s, y + 21);
    c.lineTo(xf + 4 * s, y + 18);
    c.fill();
    c.fillStyle = PAPIER;
    c.beginPath();
    c.moveTo(xf, y);
    c.lineTo(xf + 14 * s, y);
    c.lineTo(xf + 8 * s, y + 7);
    c.lineTo(xf + 20 * s, y + 10);
    c.lineTo(xf + 13 * s, y + 18);
    c.lineTo(xf + 3 * s, y + 15);
    c.closePath();
    c.fill();
  });
  return off;
}

function hasard(graine) {
  let s = graine >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------
// Visages des joueurs, en vecteur, avec l'encre des points perdus
// ---------------------------------------------------------------------

function rond(x, y, r, couleur) {
  contexte.fillStyle = couleur;
  contexte.beginPath();
  contexte.arc(x, y, r, 0, Math.PI * 2);
  contexte.fill();
}

function visage(nom, cx, cy, r, encre) {
  const ctx = contexte;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(r / 20, r / 20);
  // Disque de fond, comme un medaillon
  rond(0, 1.5, 21, "#0b0b10");
  if (nom === "tanuki") {
    rond(-13, -13, 6, "#6b4a2a");
    rond(13, -13, 6, "#6b4a2a");
    rond(-13, -13, 3, "#2a1e14");
    rond(13, -13, 3, "#2a1e14");
    rond(0, 0, 18, "#a87a4a");
    ctx.fillStyle = "#ede0c8";
    ctx.beginPath();
    ctx.ellipse(0, 8, 11, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#3a2618";
    ctx.beginPath();
    ctx.ellipse(-7, -1, 7, 5, -0.3, 0, Math.PI * 2);
    ctx.ellipse(7, -1, 7, 5, 0.3, 0, Math.PI * 2);
    ctx.fill();
    rond(-6, -1, 2.4, "#ffffff");
    rond(6, -1, 2.4, "#ffffff");
    rond(-6, -1, 1.2, "#141414");
    rond(6, -1, 1.2, "#141414");
    rond(0, 6, 2.6, "#141414");
  } else if (nom === "kasaObake") {
    ctx.fillStyle = "#8a6ac0";
    ctx.beginPath();
    ctx.moveTo(0, -20);
    ctx.lineTo(19, 14);
    ctx.lineTo(-19, 14);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#5a4290";
    ctx.beginPath();
    ctx.moveTo(0, -20);
    ctx.lineTo(19, 14);
    ctx.lineTo(6, 14);
    ctx.closePath();
    ctx.fill();
    rond(0, 0, 6, "#ffffff");
    rond(1, 1, 3, "#141414");
    ctx.fillStyle = "#e0574b";
    ctx.beginPath();
    ctx.roundRect(-3, 8, 6, 11, 3);
    ctx.fill();
  } else if (nom === "kappa") {
    rond(0, 0, 18, "#7fa32f");
    ctx.fillStyle = "#ede8df";
    ctx.beginPath();
    ctx.ellipse(0, -14, 11, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e8c547";
    ctx.beginPath();
    ctx.moveTo(-8, 6);
    ctx.lineTo(8, 6);
    ctx.lineTo(0, 15);
    ctx.closePath();
    ctx.fill();
    rond(-7, -2, 4, "#ffffff");
    rond(7, -2, 4, "#ffffff");
    rond(-6, -2, 2, "#141414");
    rond(8, -2, 2, "#141414");
  } else if (nom === "kitsune") {
    ctx.fillStyle = "#ede8df";
    ctx.beginPath();
    ctx.moveTo(-17, -20);
    ctx.lineTo(-4, -12);
    ctx.lineTo(4, -12);
    ctx.lineTo(17, -20);
    ctx.lineTo(15, 2);
    ctx.lineTo(0, 18);
    ctx.lineTo(-15, 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#e0574b";
    ctx.beginPath();
    ctx.moveTo(-14, -16);
    ctx.lineTo(-7, -11);
    ctx.lineTo(-12, -7);
    ctx.closePath();
    ctx.moveTo(14, -16);
    ctx.lineTo(7, -11);
    ctx.lineTo(12, -7);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#c8372d";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-11, -1);
    ctx.lineTo(-3, 1);
    ctx.moveTo(11, -1);
    ctx.lineTo(3, 1);
    ctx.stroke();
    rond(0, 15, 2.5, "#141414");
  } else if (nom === "karasuTengu") {
    rond(0, 0, 18, "#2a2a33");
    ctx.fillStyle = "#c8372d";
    ctx.beginPath();
    ctx.moveTo(-6, 2);
    ctx.lineTo(6, 2);
    ctx.lineTo(0, 19);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#e8c547";
    ctx.beginPath();
    ctx.moveTo(-14, -6);
    ctx.lineTo(-3, -3);
    ctx.lineTo(-12, 0);
    ctx.closePath();
    ctx.moveTo(14, -6);
    ctx.lineTo(3, -3);
    ctx.lineTo(12, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#141414";
    ctx.beginPath();
    ctx.roundRect(-9, -21, 18, 7, 2);
    ctx.fill();
  } else {
    // Oni
    ctx.fillStyle = "#ede8df";
    ctx.beginPath();
    ctx.moveTo(-14, -12);
    ctx.lineTo(-11, -24);
    ctx.lineTo(-6, -14);
    ctx.moveTo(14, -12);
    ctx.lineTo(11, -24);
    ctx.lineTo(6, -14);
    ctx.fill();
    rond(0, 0, 18, "#c8372d");
    ctx.fillStyle = "#2a2a33";
    ctx.beginPath();
    ctx.ellipse(0, -14, 14, 5, 0, Math.PI, 0);
    ctx.fill();
    rond(-7, -2, 4, "#e8c547");
    rond(7, -2, 4, "#e8c547");
    rond(-7, -2, 1.8, "#141414");
    rond(7, -2, 1.8, "#141414");
    ctx.fillStyle = "#3a1414";
    ctx.beginPath();
    ctx.roundRect(-9, 6, 18, 7, 3);
    ctx.fill();
    ctx.fillStyle = "#ede8df";
    ctx.beginPath();
    ctx.moveTo(-7, 6);
    ctx.lineTo(-4, 10);
    ctx.lineTo(-2, 6);
    ctx.moveTo(7, 6);
    ctx.lineTo(4, 10);
    ctx.lineTo(2, 6);
    ctx.fill();
  }
  // L'encre, dans l'ordre ou elle tombe
  ctx.strokeStyle = "#0b0b10";
  ctx.fillStyle = "#0b0b10";
  ctx.lineWidth = 2.6;
  ctx.lineCap = "round";
  const marques = [
    () => { ctx.beginPath(); ctx.arc(-7, -1, 7, 0, Math.PI * 2); ctx.stroke(); },
    () => { ctx.beginPath(); ctx.moveTo(-14, 7); ctx.lineTo(-6, 13); ctx.moveTo(-6, 7); ctx.lineTo(-14, 13); ctx.stroke(); },
    () => { ctx.beginPath(); ctx.moveTo(4, 9); ctx.lineTo(15, 7); ctx.moveTo(4, 13); ctx.lineTo(15, 13); ctx.stroke(); },
    () => { ctx.beginPath(); ctx.arc(7, -1, 7, 0, Math.PI * 2); ctx.stroke(); },
    () => { ctx.beginPath(); ctx.moveTo(-12, -11); ctx.lineTo(12, -11); ctx.stroke(); }
  ];
  for (let i = 0; i < Math.min(encre, marques.length); i++) {
    marques[i]();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------
// Hagoita, volant, impacts
// ---------------------------------------------------------------------

// Un hagoita vu de dessus : la palette en bois peint, le manche vers le mur
function dessinerHagoita(r, couleur, sombre) {
  const ctx = contexte;
  const gauche = r.cote === "gauche";
  const xFace = gauche ? MARGE + EPAISSEUR : LARGEUR - MARGE - EPAISSEUR;
  const ep = 16;
  const x = gauche ? xFace - ep : xFace;
  const y = r.y;
  const H = HAUTEUR_RAQUETTE;
  // Ombre
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.beginPath();
  ctx.roundRect(x + 3, y + 5, ep, H, [8, 8, 4, 4]);
  ctx.fill();
  // Manche, vers l'exterieur
  const xManche = gauche ? x - 14 : x + ep - 2;
  const gm = ctx.createLinearGradient(0, y + H / 2 - 4, 0, y + H / 2 + 4);
  gm.addColorStop(0, "#c89a5a");
  gm.addColorStop(1, "#6a4626");
  ctx.fillStyle = gm;
  ctx.beginPath();
  ctx.roundRect(xManche, y + H / 2 - 4, 16, 8, 3);
  ctx.fill();
  ctx.fillStyle = "#c8372d";
  ctx.fillRect(gauche ? xManche + 2 : xManche + 10, y + H / 2 - 4, 4, 8);
  // Palette : bois clair en volume
  const g = ctx.createLinearGradient(x, 0, x + ep, 0);
  g.addColorStop(0, gauche ? "#7a5430" : "#e2bd84");
  g.addColorStop(0.5, "#c8a06a");
  g.addColorStop(1, gauche ? "#e2bd84" : "#7a5430");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(x, y, ep, H, [8, 8, 4, 4]);
  ctx.fill();
  // Le tableau peint sur la face
  const peinture = r.arme ? VERMILLON : couleur;
  ctx.fillStyle = sombre;
  ctx.beginPath();
  ctx.roundRect(x + 3, y + 6, ep - 6, H - 12, 4);
  ctx.fill();
  ctx.fillStyle = peinture;
  ctx.beginPath();
  ctx.roundRect(x + 3, y + 6, ep - 6, H - 22, 4);
  ctx.fill();
  // Un motif de fleur au centre
  rond(x + ep / 2, y + H / 2 - 6, 3.4, PAPIER);
  rond(x + ep / 2, y + H / 2 - 6, 1.4, "#e8c547");
  // Arete claire cote terrain
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fillRect(gauche ? x + ep - 2 : x, y + 6, 2, H - 12);
  // Pret pour le coup special : un liseré vermillon net, sans halo
  if (r.ki >= KI_MAX) {
    ctx.strokeStyle = r.arme ? "#e8c547" : VERMILLON;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x - 2, y - 2, ep + 4, H + 4, [9, 9, 5, 5]);
    ctx.stroke();
  }
}

// Le volant : graine noire, plumes en eventail, dans le sens du vol
function dessinerVolant(v) {
  const ctx = contexte;
  const grossissement = compact() ? 2.2 : 1.3;
  // Traine en aplats : des disques pleins qui rapetissent, sans transparence
  const n = v.trace.length;
  v.trace.forEach((p, i) => {
    const k = (i + 1) / n;
    const couleur = v.special ? (i % 2 ? "#e8c547" : VERMILLON) : (i % 2 ? "#6a6878" : "#8f8a9a");
    rond(p.x, p.y, Math.max(0.8, RAYON * grossissement * 0.75 * k), couleur);
  });
  const angle = vitesseDe(v) > 1 ? Math.atan2(v.vy, v.vx) : (etat.serveur === "droite" ? Math.PI : 0);
  ctx.save();
  ctx.translate(v.x, v.y);
  ctx.rotate(angle);
  ctx.scale(grossissement, grossissement);
  // Ombre au sol
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(-5, 4, 11, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  // Plumes : trois pennes colorees en eventail
  [[-0.42, VERMILLON], [0, PAPIER], [0.42, "#9fd04a"]].forEach(([a, coul]) => {
    ctx.save();
    ctx.rotate(Math.PI + a);
    ctx.fillStyle = coul;
    ctx.beginPath();
    ctx.moveTo(3, 0);
    ctx.quadraticCurveTo(10, -3.6, 16, -1.2);
    ctx.lineTo(16, 1.2);
    ctx.quadraticCurveTo(10, 3.6, 3, 0);
    ctx.fill();
    ctx.restore();
  });
  // Graine de mukuroji, avec reflet
  const g = ctx.createRadialGradient(-1.6, -1.6, 0.5, 0, 0, RAYON);
  g.addColorStop(0, "#6a5040");
  g.addColorStop(1, "#141010");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, RAYON, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = PAPIER;
  ctx.lineWidth = 1;
  ctx.stroke();
  rond(-1.6, -1.8, 1.2, "#ede8df");
  ctx.restore();
}

function ajouterImpact(x, y, couleur, fort) {
  impacts.push({ x, y, couleur, age: 0, duree: fort ? 0.35 : 0.22, taille: fort ? 46 : 26 });
}

function dessinerImpacts(delta) {
  impacts = impacts.filter(im => {
    im.age += delta;
    if (im.age > im.duree) {
      return false;
    }
    const k = im.age / im.duree;
    const ctx = contexte;
    ctx.strokeStyle = im.couleur;
    ctx.lineWidth = 3 * (1 - k) + 1;
    ctx.beginPath();
    ctx.arc(im.x, im.y, 6 + im.taille * k, 0, Math.PI * 2);
    ctx.stroke();
    // Quatre eclats en croix, tout droits
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      const r1 = 8 + im.taille * k * 0.6;
      const r2 = r1 + 7 * (1 - k);
      ctx.beginPath();
      ctx.moveTo(im.x + Math.cos(a) * r1, im.y + Math.sin(a) * r1);
      ctx.lineTo(im.x + Math.cos(a) * r2, im.y + Math.sin(a) * r2);
      ctx.stroke();
    }
    return true;
  });
}

// ---------------------------------------------------------------------
// Bandeau du haut
// ---------------------------------------------------------------------

function jauge(r, x, aDroite, taille) {
  for (let i = 0; i < KI_MAX; i++) {
    const cx = aDroite ? x - (i + 1) * (taille + 3) : x + i * (taille + 3);
    contexte.fillStyle = i < r.ki ? (r.ki >= KI_MAX ? VERMILLON : "#c8f060") : "#2a2a36";
    contexte.beginPath();
    contexte.roundRect(cx, 0, taille, taille * 0.55, 2);
    contexte.fill();
  }
}

// Sur un petit ecran le terrain est affiche a moitie de sa taille : le
// bandeau garde alors l'essentiel, en plus gros
function compact() {
  return canvas.clientWidth > 0 && canvas.clientWidth < 520;
}

function dessinerBandeau() {
  const ctx = contexte;
  const g = etat.gauche;
  const d = etat.droite;
  const adv = mode === "tournoi" ? adversaire() : null;
  ctx.fillStyle = "#101017";
  ctx.fillRect(0, 0, LARGEUR, HAUT_TERRAIN);
  ctx.fillStyle = "#5a3a22";
  ctx.fillRect(0, HAUT_TERRAIN - 4, LARGEUR, 4);
  ctx.fillStyle = "#8a5a32";
  ctx.fillRect(0, HAUT_TERRAIN - 4, LARGEUR, 1);
  const petit = compact();
  const r = petit ? 23 : 20;
  // A gauche l'adversaire, a droite le tanuki ; l'encre est celle des points perdus
  visage(adv ? adv.portrait : "kappa", 8 + r, 26, r, d.points);
  visage("tanuki", LARGEUR - 8 - r, 26, r, g.points);
  const nomG = (adv ? adv.nom : "Joueur 2").toUpperCase();
  const nomD = mode === "duel" ? "JOUEUR 1" : "TANUKI";
  if (petit) {
    ctx.save();
    ctx.translate(16 + 2 * r, 34);
    jauge(g, 0, false, 22);
    ctx.restore();
    ctx.save();
    ctx.translate(LARGEUR - 16 - 2 * r, 34);
    jauge(d, 0, true, 22);
    ctx.restore();
    texteContour(nomG, 16 + 2 * r, 15, 22, PAPIER, "left");
    texteContour(mode === "tournoi" ? etat.score.toLocaleString("fr-BE") : nomD, LARGEUR - 16 - 2 * r, 15, 24, mode === "tournoi" ? "#c8f060" : PAPIER, "right");
    texteContour(g.points + " · " + d.points, LARGEUR / 2, 27, 46, d.arme ? VERMILLON : PAPIER);
    return;
  }
  texteContour(nomG, 16 + 2 * r, 16, 16, PAPIER, "left");
  texteContour(nomD, LARGEUR - 16 - 2 * r, 16, 16, PAPIER, "right");
  ctx.save();
  ctx.translate(16 + 2 * r, 32);
  jauge(g, 0, false, 12);
  ctx.restore();
  ctx.save();
  ctx.translate(LARGEUR - 16 - 2 * r, 32);
  jauge(d, 0, true, 12);
  ctx.restore();
  texteContour(g.points + "  ·  " + d.points, LARGEUR / 2, 22, 30, PAPIER);
  ctx.font = "600 8px 'Martian Mono', monospace";
  ctx.textAlign = "center";
  if (d.ki >= KI_MAX && !d.arme && etat.phase !== "fin") {
    ctx.fillStyle = VERMILLON;
    ctx.fillText("COUP SPÉCIAL PRÊT : ESPACE", LARGEUR / 2, 43);
  } else if (d.arme) {
    ctx.fillStyle = VERMILLON;
    ctx.fillText("COUP SPÉCIAL ARMÉ", LARGEUR / 2, 43);
  } else if (mode === "tournoi") {
    // Score, tour et echange, entre les deux jauges
    ctx.fillStyle = "#8f8a82";
    ctx.textAlign = "right";
    ctx.fillText("SCORE", 248, 16);
    ctx.textAlign = "left";
    ctx.fillText("TOUR " + etat.tour + "  ÉCHANGE", 472, 16);
    texteContour(etat.score.toLocaleString("fr-BE"), 248, 34, 16, "#c8f060", "right");
    const m = multiplicateur();
    texteContour(etat.echange + (m > 1 ? "  x" + m : ""), 472, 34, 16, m > 1 ? "#c8f060" : PAPIER, "left");
  }
}

// Ecran de banniere : titre du tournoi, victoire, defaite
function dessinerBanniere(b) {
  const ctx = contexte;
  const alpha = b.duree === Infinity ? 1 : Math.max(0, Math.min(1, b.age * 6, (b.duree - b.age) * 3));
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "rgba(11, 11, 16, 0.86)";
  ctx.fillRect(0, HAUT_TERRAIN, LARGEUR, HAUTEUR - HAUT_TERRAIN);
  const cy = (HAUT_TERRAIN + HAUTEUR) / 2;
  const petit = compact();
  // Le yokai concerne en grand, a gauche du texte
  const face = b.face || null;
  if (face) {
    visage(face, LARGEUR / 2, cy - 92, 30, b.encre || 0);
  }
  texteContour(b.texte.toUpperCase(), LARGEUR / 2, cy - 22, petit ? 52 : 44, "#c8f060");
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = PAPIER;
  ctx.font = "600 " + (petit ? 16 : 12) + "px 'Martian Mono', monospace";
  ctx.fillText(b.sous, LARGEUR / 2, cy + 22);
  if (b.detail) {
    ctx.fillStyle = "#b5afa6";
    ctx.font = (petit ? 20 : 14) + "px 'Hanken Grotesk', sans-serif";
    ctx.fillText(b.detail, LARGEUR / 2, cy + 52);
  }
  // Le parcours du tournoi : cinq medaillons, les vaincus barres
  if (mode === "tournoi" && b.parcours) {
    const pas = 54;
    const x0 = LARGEUR / 2 - pas * 2;
    ADVERSAIRES.forEach((a, i) => {
      const x = x0 + i * pas;
      const y = cy + 104;
      visage(a.portrait, x, y, 17, 0);
      if (i < b.parcours.vaincus) {
        ctx.strokeStyle = VERMILLON;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x - 14, y + 14);
        ctx.lineTo(x + 14, y - 14);
        ctx.stroke();
      } else if (i === b.parcours.vaincus) {
        ctx.strokeStyle = "#c8f060";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y + 1, 21, 0, Math.PI * 2);
        ctx.stroke();
      }
    });
  }
  ctx.globalAlpha = 1;
}

let dernierDessin = 0;

function dessiner() {
  if (etat === null) {
    return;
  }
  const ctx = contexte;
  const maintenant = performance.now();
  const delta = Math.min(0.05, (maintenant - (dernierDessin || maintenant)) / 1000);
  dernierDessin = maintenant;
  if (decor === null) {
    decor = peindreDecor();
  }
  const dc = effets.decalage();
  ctx.setTransform(echelle, 0, 0, echelle, 0, 0);
  ctx.fillStyle = "#0b0b10";
  ctx.fillRect(0, 0, LARGEUR, HAUTEUR);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, HAUT_TERRAIN, LARGEUR, HAUTEUR - HAUT_TERRAIN);
  ctx.clip();
  ctx.translate(dc.x, dc.y);
  ctx.drawImage(decor, 0, 0, LARGEUR, HAUTEUR);
  const adv = mode === "tournoi" ? adversaire() : { couleur: "#ede8df", sombre: "#8f8a82" };
  dessinerHagoita(etat.gauche, adv.couleur, adv.sombre);
  dessinerHagoita(etat.droite, "#9fc43f", "#5e7626");
  if (etat.volant !== null && etat.phase !== "transition") {
    dessinerVolant(etat.volant);
  }
  dessinerImpacts(etat.pause ? 0 : delta);
  effets.dessiner(ctx, "'Martian Mono', monospace");
  ctx.restore();
  dessinerBandeau();

  if (etat.phase === "service" && etat.serveur === "droite" && !etat.pause && etat.banniere === null) {
    const taille = compact() ? 20 : 12;
    texteContour("ESPACE, A OU APPUI POUR SERVIR", LARGEUR / 2, HAUTEUR - 26, taille, PAPIER, "center", "700 " + taille + "px 'Martian Mono', monospace");
  }
  if (etat.banniere !== null) {
    dessinerBanniere(etat.banniere);
  }
  if (etat.pause) {
    ctx.fillStyle = "rgba(11, 11, 16, 0.84)";
    ctx.fillRect(0, 0, LARGEUR, HAUTEUR);
    texteContour("PAUSE", LARGEUR / 2, HAUTEUR / 2 - 6, 52, "#c8f060");
    ctx.fillStyle = PAPIER;
    ctx.font = "600 12px 'Martian Mono', monospace";
    ctx.fillText("P pour reprendre", LARGEUR / 2, HAUTEUR / 2 + 32);
  }
}

function ajuster() {
  const marge = window.innerWidth >= 1100 ? 500 : 0;
  const largeur = Math.min(window.innerWidth * 0.96 - marge, 900);
  const entete = zone.querySelector(".jeu-entete").getBoundingClientRect().height || 40;
  const modes = zoneModes.getBoundingClientRect().height || 0;
  const manette = document.querySelector(".manette:not([hidden])");
  const hauteurManette = manette ? manette.getBoundingClientRect().height : 0;
  const hauteur = Math.max(180, window.innerHeight - entete - modes - hauteurManette - 70);
  const taille = Math.min(largeur / LARGEUR, hauteur / HAUTEUR);
  canvas.style.width = Math.floor(LARGEUR * taille) + "px";
  canvas.style.height = Math.floor(HAUTEUR * taille) + "px";
  const nouvelle = Math.min(3, Math.max(1, taille * (window.devicePixelRatio || 1)));
  if (Math.abs(nouvelle - echelle) > 0.02 || canvas.width !== Math.round(LARGEUR * nouvelle)) {
    echelle = nouvelle;
    canvas.width = Math.round(LARGEUR * echelle);
    canvas.height = Math.round(HAUTEUR * echelle);
    decor = null;
  }
}

window.addEventListener("resize", function () {
  if (!zone.hidden) {
    ajuster();
  }
});

const boucle = creerBoucle(function (delta) {
  maj(delta);
  dessiner();
}, { plafond: 0.04 });

// ---------------------------------------------------------------------
// En-tete, modes, commandes
// ---------------------------------------------------------------------

function majHud() {
  if (etat === null) {
    return;
  }
  zoneScore.textContent = mode === "tournoi"
    ? etat.score.toLocaleString("fr-BE")
    : etat.gauche.points + " - " + etat.droite.points;
  const m = multiplicateur();
  zoneEchange.textContent = etat.echange + (m > 1 ? " x" + m : "");
  zoneEchangeBloc.classList.toggle("chaud", m > 1);
  zoneTour.textContent = mode === "tournoi" ? String(etat.tour) : "-";
  marquerChoixActif(zoneModes, mode, "mode");
}

function majAide() {
  zoneAide.textContent = mode === "tournoi"
    ? "Flèches haut et bas, ou le doigt sur le terrain. Bouge la raquette au moment du contact pour donner de l'effet. Jauge de ki pleine : Espace arme le coup spécial. P pause, M son, N rejouer, Échap quitter."
    : "Droite : flèches et Espace. Gauche : Z et S, E pour le coup spécial. Premier à cinq points. P pause, M son, N rejouer, Échap quitter.";
}

function majBoutonSon() {
  boutonSon.textContent = sonActif() ? "Son" : "Muet";
  boutonSon.setAttribute("aria-pressed", String(!sonActif()));
}

function demarrer() {
  effets.vider();
  impacts = [];
  ajuster();
  requestAnimationFrame(ajuster);
  etat = nouvelEtat();
  touches.haut = touches.bas = touches.hautG = touches.basG = false;
  pointeurY = null;
  placerVolantAuService();
  if (mode === "tournoi") {
    etat.banniere = { texte: "Tournoi du Nouvel An", sous: "Premier adversaire : " + adversaire().nom, detail: adversaire().replique, face: adversaire().portrait, parcours: { vaincus: 0 }, age: 0, duree: 2.6 };
  }
  majHud();
  majAide();
  majScoreCourant(ID, 0);
  majBoutonSon();
  boucle.lancer();
}

function changerMode(nouveau) {
  mode = nouveau;
  demarrer();
}

// Espace : servir, ou armer le coup special quand la jauge est pleine
function actionDroite() {
  if (etat === null || etat.pause) {
    return;
  }
  if (etat.phase === "service" && etat.serveur === "droite") {
    if (etat.droite.ki >= KI_MAX) {
      etat.droite.arme = true;
    }
    servir();
  } else if (etat.droite.ki >= KI_MAX && !etat.droite.arme && etat.phase === "jeu") {
    etat.droite.arme = true;
    jouer("pouvoir");
  }
}

function actionGauche() {
  if (etat === null || mode !== "duel" || etat.pause) {
    return;
  }
  if (etat.phase === "service" && etat.serveur === "gauche") {
    servir();
  } else if (etat.gauche.ki >= KI_MAX && !etat.gauche.arme && etat.phase === "jeu") {
    etat.gauche.arme = true;
    jouer("pouvoir");
  }
}

function basculerPause() {
  if (etat === null || etat.phase === "fin") {
    return;
  }
  etat.pause = !etat.pause;
  if (!etat.pause) {
    boucle.remettreALHeure();
  }
}

surTouche(ID, function (evenement) {
  const touche = evenement.key.toLowerCase();
  if (touche === "arrowup") {
    touches.haut = true;
    pointeurY = null;
  } else if (touche === "arrowdown") {
    touches.bas = true;
    pointeurY = null;
  } else if (touche === "z" || touche === "w") {
    touches.hautG = true;
  } else if (touche === "s") {
    touches.basG = true;
  } else if (touche === " ") {
    actionDroite();
  } else if (touche === "e") {
    actionGauche();
  } else if (touche === "p") {
    basculerPause();
  } else if (touche === "m") {
    basculerSon();
    majBoutonSon();
  } else if (touche === "n") {
    demarrer();
  } else if (touche === "escape") {
    quitterJeu();
    return;
  } else {
    return;
  }
  evenement.preventDefault();
});

document.addEventListener("keyup", function (evenement) {
  const touche = evenement.key.toLowerCase();
  if (touche === "arrowup") {
    touches.haut = false;
  } else if (touche === "arrowdown") {
    touches.bas = false;
  } else if (touche === "z" || touche === "w") {
    touches.hautG = false;
  } else if (touche === "s") {
    touches.basG = false;
  }
});

// Doigt ou souris : la raquette du tanuki suit, un appui sert ou arme
canvas.addEventListener("pointerdown", function (evenement) {
  if (jeuActif !== ID || overlayOuvert) {
    return;
  }
  pointeurY = ordonneeLogique(canvas, evenement.clientY, HAUTEUR);
  actionDroite();
});

canvas.addEventListener("pointermove", function (evenement) {
  if (jeuActif !== ID || overlayOuvert) {
    return;
  }
  if (evenement.pointerType === "mouse" || evenement.buttons > 0 || evenement.pressure > 0) {
    pointeurY = ordonneeLogique(canvas, evenement.clientY, HAUTEUR);
  }
});

canvas.addEventListener("touchmove", function (evenement) {
  evenement.preventDefault();
}, { passive: false });

document.addEventListener("visibilitychange", function () {
  if (document.hidden && etat !== null && !etat.pause && etat.phase !== "fin" && !zone.hidden) {
    basculerPause();
  }
});

creerBoutonsChoix(zoneModes, [
  { id: "tournoi", nom: "Tournoi" },
  { id: "duel", nom: "Duel à deux" }
], choix => changerMode(choix.id), "mode");

boutonSon.addEventListener("click", function () {
  basculerSon();
  majBoutonSon();
});
boutonRejouer.addEventListener("click", demarrer);
boutonQuitter.addEventListener("click", quitterJeu);

// ===== Inscription dans l'arcade =====
enregistrerJeu({
  id: ID,
  nom: "Pong",
  code: "1972",
  section: zone,
  demarrer,
  arreter: () => {
    boucle.arreter();
    touches.haut = touches.bas = touches.hautG = touches.basG = false;
  },
  manette: { a: " ", b: "p", start: "p", libelles: { a: "Servir / spécial", b: "Pause" }, repetition: false }
});

// Acces pour les tests automatiques
export const _test = {
  get etat() { return etat; },
  servir,
  victoireMatch,
  pointPour
};
