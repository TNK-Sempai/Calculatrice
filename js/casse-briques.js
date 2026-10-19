// =====================================================================
//  KAWARA - la refonte du casse-briques
//  Les briques sont des tuiles de toit (kawara). Un niveau sur deux
//  ecrit un mot, comme le casse-briques d'origine ; les autres dessinent
//  un monument : torii, mont Fuji, pagode a cinq etages, lanterne. Tous
//  les cinq niveaux, le nurikabe, le yokai-mur, bloque le passage.
//
//  - tuiles grises (1 coup), laquees vermillon (2), en platre (3) : elles
//    se fissurent a chaque coup ; tuiles d'or indestructibles ;
//  - tuiles lime : elles lachent toujours un omamori ;
//  - omamori : multi-balle, raquette large, balle de feu qui traverse,
//    tir de feuilles, ralenti, vie ; et deux malus : raquette courte,
//    balle rapide ;
//  - combo : chaque tuile enchainee sans toucher la raquette fait monter
//    le multiplicateur, la raquette le remet a zero.
//  La progression (niveau, vies, score) est sauvegardee.
// =====================================================================

import { enregistrerJeu, finDePartie, quitterJeu, majScoreCourant } from "./arcade.js";
import { creerBoucle } from "./noyau/boucle.js";
import { surTouche, jeuAuPremierPlan } from "./noyau/clavier.js";
import { abscisseLogique } from "./noyau/pointeur.js";
import { creerStockage } from "./noyau/stockage.js";
import { creerEffets } from "./noyau/effets.js";
import { jouer, basculerSon, sonActif } from "./noyau/son.js";

const ID = "casse-briques";

// ---------------------------------------------------------------------
// La section est reconstruite ici : en-tete, canvas, aide
// ---------------------------------------------------------------------

const zone = document.getElementById("jeuCasseBriques");
zone.innerHTML = `
  <div class="jeu-entete entete-briques">
    <span class="jeu-score score-principal">Score <strong class="valeur-score" id="scoreBriques">0</strong></span>
    <span class="jeu-score combo-briques">Combo <strong id="comboBriques">x1</strong></span>
    <span class="jeu-score">Niveau <strong id="niveauBriques">1</strong></span>
    <span class="jeu-score">Vies <strong id="viesBriques">3</strong></span>
    <span class="entete-boutons">
      <button class="jeu-quitter" id="sonBriques" type="button" aria-pressed="false">Son</button>
      <button class="jeu-quitter" id="recommencerBriques" type="button">Rejouer</button>
      <button class="jeu-quitter" id="quitterBriques" type="button">Retour</button>
    </span>
  </div>
  <p class="jeu-message message-briques" id="messageBriques"></p>
  <canvas id="canvasBriques" width="480" height="640"></canvas>
  <p class="jeu-aide">Fl&egrave;ches ou Q D, souris ou doigt pour bouger la raquette. Espace pour lancer la balle et tirer des feuilles. Ramasse les omamori, &eacute;vite les noirs. P pause, M son, N rejouer, &Eacute;chap quitter.</p>
`;

const canvas = document.getElementById("canvasBriques");
const contexte = canvas.getContext("2d");
const zoneScore = document.getElementById("scoreBriques");
const zoneCombo = document.getElementById("comboBriques");
const zoneNiveau = document.getElementById("niveauBriques");
const zoneVies = document.getElementById("viesBriques");
const zoneMessage = document.getElementById("messageBriques");
const boutonSon = document.getElementById("sonBriques");
const boutonRecommencer = document.getElementById("recommencerBriques");
const boutonQuitter = document.getElementById("quitterBriques");

// ---------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------

const LARGEUR = 480;
const HAUTEUR = 640;
const COLONNES = 15;
const RANGEES = 8;
const L_TUILE = LARGEUR / COLONNES;   // 32
const H_TUILE = 22;
const MARGE_HAUTE = 76;
const Y_RAQUETTE = HAUTEUR - 44;
const H_RAQUETTE = 12;
const RAYON = 6;
const VIES_DEPART = 3;
const DUREE_POUVOIR = 12;

// Les mots du casse-briques d'origine, gardes tels quels
const MOTS = ["TANUKI", "ARCADE", "BRUXELLES", "WU TANG", "CF2M", "2048", "GAME ON"];

// Police de 3 sur 5 pour ecrire les mots en tuiles : chaque lettre
// reste lisible, ce qu'un rendu de police systeme ne garantissait pas.
const POLICE = {
  A: ["010", "101", "111", "101", "101"], B: ["110", "101", "110", "101", "110"],
  C: ["011", "100", "100", "100", "011"], D: ["110", "101", "101", "101", "110"],
  E: ["111", "100", "110", "100", "111"], F: ["111", "100", "110", "100", "100"],
  G: ["011", "100", "101", "101", "011"], H: ["101", "101", "111", "101", "101"],
  I: ["111", "010", "010", "010", "111"], J: ["001", "001", "001", "101", "010"],
  K: ["101", "101", "110", "101", "101"], L: ["100", "100", "100", "100", "111"],
  M: ["101", "111", "111", "101", "101"], N: ["110", "101", "101", "101", "101"],
  O: ["010", "101", "101", "101", "010"], P: ["110", "101", "110", "100", "100"],
  Q: ["010", "101", "101", "111", "011"], R: ["110", "101", "110", "101", "101"],
  S: ["011", "100", "010", "001", "110"], T: ["111", "010", "010", "010", "010"],
  U: ["101", "101", "101", "101", "111"], V: ["101", "101", "101", "101", "010"],
  W: ["101", "101", "111", "111", "101"], X: ["101", "101", "010", "101", "101"],
  Y: ["101", "101", "010", "010", "010"], Z: ["111", "001", "010", "100", "111"],
  0: ["111", "101", "101", "101", "111"], 1: ["010", "110", "010", "010", "111"],
  2: ["110", "001", "010", "100", "111"], 3: ["110", "001", "010", "001", "110"],
  4: ["101", "101", "111", "001", "001"], 5: ["111", "100", "110", "001", "110"],
  6: ["011", "100", "110", "101", "010"], 7: ["111", "001", "010", "010", "010"],
  8: ["111", "101", "111", "101", "111"], 9: ["010", "101", "011", "001", "110"]
};
const L_PETITE = 16;
const H_PETITE = 14;
const COLONNES_MOT = LARGEUR / L_PETITE;   // 30

// Les monuments : . vide, 1 2 3 resistance, G or, B tuile a omamori
const MONUMENTS = [
  {
    nom: "Torii", jp: "鳥居",
    plan: [
      "...............",
      "222222222222222",
      ".2222222222222.",
      "...1.......1...",
      "..11111B11111..",
      "...1.......1...",
      "...1.......1...",
      "..G1.......1G.."
    ]
  },
  {
    nom: "Mont Fuji", jp: "富士",
    plan: [
      ".......3.......",
      "......333......",
      ".....33333.....",
      "....1111111....",
      "...1111B1111...",
      "..11111111111..",
      ".1111111111111.",
      "111111111111111"
    ]
  },
  {
    nom: "Pagode", jp: "五重塔",
    plan: [
      ".......G.......",
      "....2222222....",
      "......111......",
      "..22222222222..",
      "......111......",
      ".2222222222222.",
      "......1B1......",
      "222222222222222"
    ]
  },
  {
    nom: "Lanterne", jp: "灯籠",
    plan: [
      "......222......",
      "....2222222....",
      "..22222222222..",
      ".....11111.....",
      ".....1BBB1.....",
      ".....11111.....",
      "....3333333....",
      "...333333333..."
    ]
  }
];

const PLAN_BOSS = [
  "...............",
  "...............",
  "...............",
  "...............",
  "..1.1.1.1.1.1..",
  "...............",
  "...............",
  "..............."
];

// Couleurs des tuiles : corps, reflet, ombre
const TEINTES = {
  1: ["#63707c", "#8592a0", "#3d464f"],
  2: ["#c8372d", "#e0574b", "#8f2620"],
  3: ["#ede8df", "#ffffff", "#b3ab9c"],
  G: ["#e8c547", "#f6e08a", "#a88a2a"],
  B: ["#9fc43f", "#c8f060", "#5e7626"]
};

// Omamori : bonus et malus
const OMAMORI = {
  multi: { couleur: "#e8c547", sombre: "#a88a2a", lettre: "M", nom: "Trois balles", bonus: true },
  large: { couleur: "#9fc43f", sombre: "#5e7626", lettre: "L", nom: "Raquette large", bonus: true },
  feu: { couleur: "#c8372d", sombre: "#8f2620", lettre: "F", nom: "Balle de feu", bonus: true },
  feuilles: { couleur: "#7fa32f", sombre: "#4a6b1c", lettre: "T", nom: "Tir de feuilles", bonus: true },
  lent: { couleur: "#8a6ac0", sombre: "#5a4290", lettre: "S", nom: "Ralenti", bonus: true },
  vie: { couleur: "#ede8df", sombre: "#b3ab9c", lettre: "+", nom: "Vie", bonus: true },
  court: { couleur: "#2a2a33", sombre: "#141418", lettre: "C", nom: "Raquette courte", bonus: false },
  rapide: { couleur: "#2a2a33", sombre: "#141418", lettre: "R", nom: "Balle rapide", bonus: false }
};
const TIRAGE_OMAMORI = ["multi", "multi", "large", "large", "feu", "feuilles", "feuilles", "lent", "vie", "court", "rapide"];

// ---------------------------------------------------------------------
// Etat et sauvegarde
// ---------------------------------------------------------------------

const effets = creerEffets();
const stockage = creerStockage("tanuki-arcade-briques");
const commandes = { gauche: false, droite: false, tir: false };
let pointeurX = null;
let etat = null;

function nouvelEtat() {
  return {
    niveau: 1,
    score: 0,
    vies: VIES_DEPART,
    tuiles: [],
    balles: [],
    chutes: [],
    feuilles: [],
    pierres: [],
    raquette: { x: LARGEUR / 2 - 45, largeur: 90, gele: 0 },
    pouvoirs: { large: 0, feu: 0, feuilles: 0, lent: 0, court: 0 },
    combo: 0,
    multiplicateur: 1,
    boss: null,
    enAttente: true,
    recharge: 0,
    banniere: null,
    pause: false,
    termine: false,
    temps: 0
  };
}

function sauver() {
  if (etat === null || etat.termine) {
    return;
  }
  stockage.ecrire({ niveau: etat.niveau, score: etat.score, vies: etat.vies });
}

function charger() {
  const donnees = stockage.lire();
  if (donnees === null || typeof donnees.niveau !== "number" || donnees.niveau < 1) {
    return false;
  }
  etat.niveau = donnees.niveau;
  etat.score = donnees.score || 0;
  etat.vies = donnees.vies || VIES_DEPART;
  return true;
}

// ---------------------------------------------------------------------
// Niveaux
// Cycle de dix : mot, monument, mot, monument, boss, et ainsi de suite.
// Chaque cycle complet durcit les tuiles et accelere la balle.
// ---------------------------------------------------------------------

function descriptionNiveau(niveau) {
  const position = (niveau - 1) % 10;
  const cycle = Math.floor((niveau - 1) / 10);
  if (position === 4 || position === 9) {
    return { type: "boss", cycle, rang: Math.floor((niveau - 1) / 5) + 1 };
  }
  const indexDansCycle = position > 4 ? position - 1 : position;   // 0..7
  if (indexDansCycle % 2 === 0) {
    const numeroMot = cycle * 4 + indexDansCycle / 2;
    return { type: "mot", cycle, mot: MOTS[numeroMot % MOTS.length] };
  }
  const numeroMonument = cycle * 4 + (indexDansCycle - 1) / 2;
  // Au-dela du premier tour, un tableau sur deux est invente pour le niveau
  if (cycle >= 1 && numeroMonument % 2 === 1) {
    return { type: "monument", cycle, monument: tableauGenere(niveau) };
  }
  return { type: "monument", cycle, monument: MONUMENTS[numeroMonument % MONUMENTS.length] };
}

// ---------------------------------------------------------------------
// Tableaux generes : symetriques, toujours un peu differents, sans fin
// ---------------------------------------------------------------------

function hasard(graine) {
  let a = graine >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NOMS_TABLEAUX = [
  ["Jardin sec", "庭"], ["Vague", "波"], ["Lune", "月"], ["Pont", "橋"], ["Nuage", "雲"],
  ["Montagne", "山"], ["Fleur", "花"], ["Pluie", "雨"], ["Forêt", "森"], ["Étoile", "星"]
];

function tableauGenere(niveau) {
  const alea = hasard(niveau * 9973 + 17);
  const moitie = 8;
  let grille = [];
  // Une forme de depart, puis un lissage qui donne des masses organiques
  const forme = Math.floor(alea() * 4);
  for (let r = 0; r < RANGEES; r++) {
    grille.push([]);
    for (let c = 0; c < moitie; c++) {
      let p = 0.5;
      if (forme === 0) {
        p = Math.abs(Math.sin((c + r * 1.3) * 0.7)) > 0.45 ? 0.85 : 0.15;
      } else if (forme === 1) {
        p = Math.abs(7 - c) + Math.abs(3.5 - r) < 6.5 ? 0.85 : 0.2;
      } else if (forme === 2) {
        p = r % 3 === 1 ? 0.15 : 0.8;
      }
      grille[r].push(alea() < p);
    }
  }
  for (let passe = 0; passe < 2; passe++) {
    grille = grille.map((ligne, r) => ligne.map((plein, c) => {
      let voisins = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if ((dr || dc) && grille[r + dr] && grille[r + dr][c + dc]) {
            voisins++;
          }
        }
      }
      return voisins >= 5 || (plein && voisins >= 3);
    }));
  }
  // Resistance : plus dure en haut ; quelques tuiles a omamori et un peu d'or
  const lignes = grille.map((ligne, r) => {
    const gauche = ligne.map((plein, c) => {
      if (!plein) {
        return ".";
      }
      const tirage = alea();
      if (tirage < 0.05 && r > 1) {
        return "B";
      }
      if (tirage < 0.08 && r >= 3 && c < 6) {
        return "G";
      }
      return String(r < 2 ? 3 : r < 4 ? 2 : 1);
    });
    return gauche.join("") + gauche.slice(0, 7).reverse().join("");
  });
  // Toujours de quoi jouer : au moins une trentaine de tuiles cassables
  const cassables = lignes.join("").replace(/[.G]/g, "").length;
  if (cassables < 30) {
    lignes[RANGEES - 1] = "111111111111111";
    lignes[RANGEES - 2] = ".1111111111111.";
  }
  const [nom, jp] = NOMS_TABLEAUX[niveau % NOMS_TABLEAUX.length];
  return { nom, jp, plan: lignes };
}

// Ecrit un mot avec la police pixel. Un mot trop long pour une ligne
// passe sur deux, coupe a l'espace s'il y en a un.
function ligneDeTexte(texte) {
  const lignes = ["", "", "", "", ""];
  [...texte].forEach((lettre, i) => {
    const glyphe = lettre === " " ? ["00", "00", "00", "00", "00"] : (POLICE[lettre] || ["111", "111", "111", "111", "111"]);
    for (let r = 0; r < 5; r++) {
      lignes[r] += (i > 0 ? "0" : "") + glyphe[r];
    }
  });
  return lignes;
}

function grilleDepuisMot(mot) {
  let morceaux = [mot];
  if (ligneDeTexte(mot)[0].length > COLONNES_MOT) {
    const espace = mot.indexOf(" ");
    const coupure = espace > 0 ? espace : Math.ceil(mot.length / 2);
    morceaux = [mot.slice(0, coupure).trim(), mot.slice(coupure).trim()];
  }
  const grille = [];
  morceaux.forEach((morceau, i) => {
    if (i > 0) {
      grille.push(".".repeat(COLONNES_MOT));
    }
    ligneDeTexte(morceau).forEach(ligne => {
      const marge = Math.max(0, Math.floor((COLONNES_MOT - ligne.length) / 2));
      const centree = (".".repeat(marge) + ligne.replace(/0/g, ".").replace(/1/g, "1")).padEnd(COLONNES_MOT, ".").slice(0, COLONNES_MOT);
      grille.push(centree);
    });
  });
  // Une ligne vide en haut si le mot tient sur une ligne, pour l'aerer
  return grille.length <= 5 ? [".".repeat(COLONNES_MOT), ".".repeat(COLONNES_MOT)].concat(grille) : grille;
}

function construireNiveau() {
  const desc = descriptionNiveau(etat.niveau);
  let plan;
  let lTuile = L_TUILE;
  let hTuile = H_TUILE;
  if (desc.type === "mot") {
    lTuile = L_PETITE;
    hTuile = H_PETITE;
    // Le mot du casse-briques d'origine : les rangees hautes resistent
    // davantage a mesure qu'on avance, et une tuile lime par mot
    plan = grilleDepuisMot(desc.mot).map((ligne, r) => ligne.replace(/1/g, () => {
      let resistance = 1;
      if (etat.niveau >= 3 && r < 3) {
        resistance = 2;
      }
      if (etat.niveau >= 6 && r < 2) {
        resistance = 3;
      }
      return String(Math.min(3, resistance + desc.cycle));
    }));
    const pleines = [];
    plan.forEach((ligne, r) => [...ligne].forEach((c, col) => { if (c !== ".") { pleines.push([r, col]); } }));
    for (let i = 0; i < 2 && pleines.length; i++) {
      const [r, col] = pleines.splice(Math.floor(Math.random() * pleines.length), 1)[0];
      plan[r] = plan[r].slice(0, col) + "B" + plan[r].slice(col + 1);
    }
  } else if (desc.type === "monument") {
    plan = desc.monument.plan.map(ligne => ligne.replace(/[123]/g, c => String(Math.min(3, Number(c) + desc.cycle))));
  } else {
    plan = PLAN_BOSS;
  }

  etat.tuiles = [];
  plan.forEach((ligne, r) => {
    [...ligne].forEach((caractere, c) => {
      if (caractere === ".") {
        return;
      }
      const sorte = caractere === "G" || caractere === "B" ? caractere : "1";
      const resistance = sorte === "1" ? Number(caractere) : sorte === "B" ? 1 : Infinity;
      etat.tuiles.push({ x: c * lTuile, y: MARGE_HAUTE + r * hTuile, l: lTuile, h: hTuile, sorte, resistance, max: resistance, eclat: 0 });
    });
  });

  etat.boss = null;
  if (desc.type === "boss") {
    const pv = 24 + desc.rang * 10 + desc.cycle * 10;
    etat.boss = { x: LARGEUR / 2 - 48, y: 0, dir: 1, pv, pvMax: pv, rang: desc.rang, tir: 2.4, renfort: 6, eclat: 0 };
    banniere("Nurikabe", "塗壁");
    jouer("boss");
  } else if (desc.type === "monument") {
    banniere(desc.monument.nom, desc.monument.jp);
  } else {
    banniere(desc.mot, null);
  }
  afficherMessage(desc.type === "boss"
    ? "Niveau " + etat.niveau + " : le nurikabe bloque le passage"
    : desc.type === "monument" ? "Niveau " + etat.niveau + " : " + desc.monument.nom
      : "Niveau " + etat.niveau + " : " + desc.mot);
}

function banniere(texte, jp) {
  etat.banniere = { texte, jp, age: 0, duree: 1.8 };
}

function afficherMessage(texte) {
  zoneMessage.textContent = texte;
}

function vitesseNiveau() {
  return Math.min(560, 255 + (etat.niveau - 1) * 16);
}

function largeurNiveau() {
  return Math.max(60, 100 - (etat.niveau - 1) * 3);
}

function nouvelleBalle() {
  const v = vitesseNiveau();
  return { x: LARGEUR / 2, y: Y_RAQUETTE - RAYON, dx: v * 0.42, dy: -v * 0.9, traine: [] };
}

function preparerLancement() {
  etat.balles = [nouvelleBalle()];
  etat.chutes = [];
  etat.feuilles = [];
  etat.pierres = [];
  etat.pouvoirs = { large: 0, feu: 0, feuilles: 0, lent: 0, court: 0 };
  etat.raquette.largeur = largeurNiveau();
  etat.raquette.gele = 0;
  etat.raquette.x = LARGEUR / 2 - etat.raquette.largeur / 2;
  etat.enAttente = true;
  etat.combo = 0;
  etat.multiplicateur = 1;
  majHud();
}

// ---------------------------------------------------------------------
// Score, combo
// ---------------------------------------------------------------------

function gagner(points, x, y) {
  const total = points * etat.multiplicateur;
  etat.score += total;
  if (x !== undefined) {
    effets.flotter(x, y, "+" + total, etat.multiplicateur > 1 ? "#c8f060" : "#ede8df", 10);
  }
  majScoreCourant(ID, etat.score);
  majHud();
}

function enchainer() {
  etat.combo++;
  const nouveau = Math.min(6, 1 + Math.floor(etat.combo / 4));
  if (nouveau > etat.multiplicateur) {
    etat.multiplicateur = nouveau;
    const raquette = etat.raquette;
    effets.flotter(raquette.x + raquette.largeur / 2, Y_RAQUETTE - 24, "Combo x" + nouveau, "#c8f060", 13);
    jouer("combo", nouveau);
  }
}

function casserCombo() {
  if (etat.combo === 0) {
    return;
  }
  etat.combo = 0;
  etat.multiplicateur = 1;
  majHud();
}

// ---------------------------------------------------------------------
// Tuiles
// ---------------------------------------------------------------------

function toucherTuile(tuile, parFeu) {
  if (tuile.sorte === "G") {
    tuile.eclat = 0.08;
    jouer("clic");
    return false;
  }
  tuile.resistance = parFeu ? 0 : tuile.resistance - 1;
  tuile.eclat = 0.08;
  enchainer();
  if (tuile.resistance > 0) {
    gagner(5 * etat.niveau);
    jouer("impact");
    return false;
  }
  // La tuile se brise en eclats de sa couleur
  const teinte = TEINTES[tuile.sorte === "1" ? tuile.max : tuile.sorte];
  effets.eclater(tuile.x + tuile.l / 2, tuile.y + tuile.h / 2, teinte, 6, 110);
  briserTuile(tuile);
  etat.tuiles.splice(etat.tuiles.indexOf(tuile), 1);
  gagner(10 * etat.niveau * (tuile.sorte === "1" ? tuile.max : 1), tuile.x + tuile.l / 2, tuile.y);
  jouer("explosion");
  if (tuile.sorte === "B" || Math.random() < 0.11) {
    lacherOmamori(tuile.x + tuile.l / 2, tuile.y + tuile.h / 2, tuile.sorte === "B");
  }
  return true;
}

function lacherOmamori(x, y, bonusSeulement) {
  let type = TIRAGE_OMAMORI[Math.floor(Math.random() * TIRAGE_OMAMORI.length)];
  if (bonusSeulement) {
    while (!OMAMORI[type].bonus) {
      type = TIRAGE_OMAMORI[Math.floor(Math.random() * TIRAGE_OMAMORI.length)];
    }
  }
  etat.chutes.push({ type, x: x - 8, y });
}

function ramasser(type) {
  const p = etat.pouvoirs;
  const r = etat.raquette;
  const def = OMAMORI[type];
  if (type === "multi") {
    const nouvelles = [];
    etat.balles.slice(0, 3).forEach(b => {
      [-0.5, 0.5].forEach(angle => {
        const v = Math.hypot(b.dx, b.dy);
        const a = Math.atan2(b.dy, b.dx) + angle;
        nouvelles.push({ x: b.x, y: b.y, dx: Math.cos(a) * v, dy: Math.sin(a) * v, traine: [] });
      });
    });
    etat.balles = etat.balles.concat(nouvelles).slice(0, 9);
  } else if (type === "large") {
    p.large = DUREE_POUVOIR;
    p.court = 0;
  } else if (type === "feu") {
    p.feu = DUREE_POUVOIR * 0.7;
  } else if (type === "feuilles") {
    p.feuilles = DUREE_POUVOIR;
  } else if (type === "lent") {
    p.lent = DUREE_POUVOIR * 0.8;
  } else if (type === "vie") {
    etat.vies++;
    majHud();
  } else if (type === "court") {
    p.large = 0;
    p.court = DUREE_POUVOIR * 0.6;
  } else if (type === "rapide") {
    etat.balles.forEach(b => { b.dx *= 1.25; b.dy *= 1.25; });
  }
  effets.flotter(r.x + r.largeur / 2, Y_RAQUETTE - 14, def.nom, def.bonus ? def.couleur : "#8f8a82", 10);
  jouer(type === "vie" ? "vie" : def.bonus ? "pouvoir" : "mort");
}

// ---------------------------------------------------------------------
// Physique
// ---------------------------------------------------------------------

function largeurCible() {
  const base = largeurNiveau();
  if (etat.pouvoirs.court > 0) {
    return Math.max(44, base * 0.65);
  }
  return etat.pouvoirs.large > 0 ? Math.min(180, base * 1.6) : base;
}

function majRaquette(delta) {
  const r = etat.raquette;
  // La largeur rejoint sa cible en douceur : on voit le pouvoir agir
  const cible = largeurCible();
  const ancienCentre = r.x + r.largeur / 2;
  r.largeur += (cible - r.largeur) * Math.min(1, delta * 10);
  r.x = ancienCentre - r.largeur / 2;
  if (r.gele > 0) {
    r.gele -= delta;
    return;
  }
  if (pointeurX !== null) {
    r.x = pointeurX - r.largeur / 2;
  } else {
    const v = 470 * delta;
    if (commandes.gauche) {
      r.x -= v;
    }
    if (commandes.droite) {
      r.x += v;
    }
  }
  r.x = Math.max(0, Math.min(LARGEUR - r.largeur, r.x));
}

function rebondirSurRect(balle, x, y, l, h) {
  const cx = x + l / 2;
  const cy = y + h / 2;
  const recouvrementX = l / 2 + RAYON - Math.abs(balle.x - cx);
  const recouvrementY = h / 2 + RAYON - Math.abs(balle.y - cy);
  if (recouvrementX < recouvrementY) {
    balle.dx = Math.sign(balle.x - cx || 1) * Math.abs(balle.dx);
    balle.x += Math.sign(balle.x - cx || 1) * recouvrementX;
  } else {
    balle.dy = Math.sign(balle.y - cy || 1) * Math.abs(balle.dy);
    balle.y += Math.sign(balle.y - cy || 1) * recouvrementY;
  }
}

function chevauche(balle, x, y, l, h) {
  return balle.x + RAYON > x && balle.x - RAYON < x + l && balle.y + RAYON > y && balle.y - RAYON < y + h;
}

// Un pas de deplacement, assez court pour ne jamais traverser une tuile
function pasBalle(balle, d) {
  balle.x += balle.dx * d;
  balle.y += balle.dy * d;

  if (balle.x - RAYON < 0) {
    balle.x = RAYON;
    balle.dx = Math.abs(balle.dx);
  } else if (balle.x + RAYON > LARGEUR) {
    balle.x = LARGEUR - RAYON;
    balle.dx = -Math.abs(balle.dx);
  }
  if (balle.y - RAYON < 0) {
    balle.y = RAYON;
    balle.dy = Math.abs(balle.dy);
  }

  // Raquette : l'angle depend du point d'impact
  const r = etat.raquette;
  if (balle.dy > 0 && chevauche(balle, r.x, Y_RAQUETTE, r.largeur, H_RAQUETTE)) {
    const position = (balle.x - r.x) / r.largeur - 0.5;
    const v = Math.hypot(balle.dx, balle.dy);
    const angle = position * 2.1;
    balle.dx = Math.sin(angle) * v;
    balle.dy = -Math.abs(Math.cos(angle) * v);
    balle.y = Y_RAQUETTE - RAYON;
    casserCombo();
    jouer("clic");
  }

  // Boss
  const b = etat.boss;
  if (b !== null && chevauche(balle, b.x + 4, b.y + 4, 88, 56)) {
    rebondirSurRect(balle, b.x + 4, b.y + 4, 88, 56);
    b.pv--;
    b.eclat = 0.07;
    enchainer();
    gagner(20 * b.rang);
    effets.eclater(balle.x, balle.y, ["#82827a", "#5a5a54"], 5, 90);
    jouer("impact");
    if (b.pv <= 0) {
      vaincreBoss();
    }
    return;
  }

  // Tuiles
  const feu = etat.pouvoirs.feu > 0;
  for (const tuile of etat.tuiles) {
    if (chevauche(balle, tuile.x, tuile.y, tuile.l, tuile.h)) {
      const brisee = toucherTuile(tuile, feu);
      // La balle de feu traverse ce qu'elle brise, rebondit sur l'or
      if (!(feu && brisee)) {
        rebondirSurRect(balle, tuile.x, tuile.y, tuile.l, tuile.h);
      }
      break;
    }
  }
}

function majBalles(delta) {
  const facteur = etat.pouvoirs.lent > 0 ? 0.62 : 1;
  etat.balles.forEach(balle => {
    const distance = Math.hypot(balle.dx, balle.dy) * delta * facteur;
    const pas = Math.max(1, Math.ceil(distance / 5));
    for (let i = 0; i < pas; i++) {
      pasBalle(balle, (delta * facteur) / pas);
    }
    // Une balle trop horizontale tournerait en rond : on la redresse
    if (Math.abs(balle.dy) < Math.hypot(balle.dx, balle.dy) * 0.22) {
      balle.dy = (balle.dy < 0 ? -1 : 1) * Math.hypot(balle.dx, balle.dy) * 0.25;
    }
    balle.traine.unshift({ x: balle.x, y: balle.y });
    balle.traine.length = Math.min(balle.traine.length, 6);
  });
  etat.balles = etat.balles.filter(b => b.y - RAYON < HAUTEUR);
}

function majBoss(delta) {
  const b = etat.boss;
  if (b === null) {
    return;
  }
  b.eclat = Math.max(0, b.eclat - delta);
  if (b.y < 6) {
    b.y = Math.min(6, b.y + 40 * delta);
  }
  const furieux = b.pv < b.pvMax / 2;
  b.x += b.dir * (50 + b.rang * 8) * (furieux ? 1.5 : 1) * delta;
  if (b.x < 4 || b.x > LARGEUR - 100) {
    b.dir = -b.dir;
    b.x = Math.max(4, Math.min(LARGEUR - 100, b.x));
  }
  // Il lance des pierres vers la raquette : touchee, elle est gelee
  b.tir -= delta;
  if (b.tir <= 0) {
    b.tir = Math.max(0.9, 2.4 - b.rang * 0.2) * (furieux ? 0.7 : 1);
    const cx = b.x + 48;
    const cible = etat.raquette.x + etat.raquette.largeur / 2;
    const vx = (cible - cx) * 0.35;
    etat.pierres.push({ x: cx, y: b.y + 64, vx: Math.max(-90, Math.min(90, vx)), vy: 190 + b.rang * 10 });
  }
  // Et il rebouche les trous de sa rangee de tuiles
  b.renfort -= delta;
  if (b.renfort <= 0) {
    b.renfort = furieux ? 4 : 6;
    const places = [2, 4, 6, 8, 10, 12].filter(c => !etat.tuiles.some(t => t.y === MARGE_HAUTE + 4 * H_TUILE && t.x === c * L_TUILE));
    if (places.length) {
      const c = places[Math.floor(Math.random() * places.length)];
      etat.tuiles.push({ x: c * L_TUILE, y: MARGE_HAUTE + 4 * H_TUILE, l: L_TUILE, h: H_TUILE, sorte: "1", resistance: 2, max: 2, eclat: 0.15 });
    }
  }
}

function vaincreBoss() {
  const b = etat.boss;
  const cx = b.x + 48;
  const cy = b.y + 32;
  for (let i = 0; i < 4; i++) {
    effets.eclater(cx + (Math.random() - 0.5) * 70, cy + (Math.random() - 0.5) * 40, ["#82827a", "#5a5a54", "#ede8df", "#c8372d"], 22, 220);
  }
  effets.secouer(9, 0.7);
  jouer("grosseExplosion");
  gagner(1500 * b.rang, cx, cy);
  etat.boss = null;
  // Le mur tombe avec son maitre : on vide les tuiles restantes
  etat.tuiles = etat.tuiles.filter(t => t.sorte === "G");
}

function majProjectiles(delta) {
  const r = etat.raquette;
  // Feuilles tirees par la raquette
  etat.recharge = Math.max(0, etat.recharge - delta);
  if (etat.pouvoirs.feuilles > 0 && commandes.tir && etat.recharge <= 0 && !etat.enAttente) {
    etat.recharge = 0.28;
    etat.feuilles.push({ x: r.x + 6, y: Y_RAQUETTE - 4 }, { x: r.x + r.largeur - 6, y: Y_RAQUETTE - 4 });
    jouer("tir");
  }
  etat.feuilles = etat.feuilles.filter(f => {
    f.y -= 520 * delta;
    if (f.y < 0) {
      return false;
    }
    const b = etat.boss;
    if (b !== null && f.x > b.x + 4 && f.x < b.x + 92 && f.y < b.y + 60) {
      b.pv--;
      b.eclat = 0.06;
      gagner(10 * b.rang);
      if (b.pv <= 0) {
        vaincreBoss();
      }
      return false;
    }
    for (const tuile of etat.tuiles) {
      if (f.x >= tuile.x && f.x <= tuile.x + tuile.l && f.y >= tuile.y && f.y <= tuile.y + tuile.h) {
        toucherTuile(tuile, false);
        return false;
      }
    }
    return true;
  });

  // Pierres du nurikabe
  etat.pierres = etat.pierres.filter(p => {
    p.x += p.vx * delta;
    p.y += p.vy * delta;
    if (p.y > HAUTEUR) {
      return false;
    }
    if (p.y + 6 > Y_RAQUETTE && p.y < Y_RAQUETTE + H_RAQUETTE && p.x > r.x - 4 && p.x < r.x + r.largeur + 4) {
      r.gele = 1.1;
      effets.eclater(p.x, Y_RAQUETTE, ["#82827a", "#5a5a54"], 10, 110);
      effets.secouer(4, 0.25);
      jouer("impact");
      return false;
    }
    return true;
  });

  // Omamori qui tombent
  etat.chutes = etat.chutes.filter(c => {
    c.y += 130 * delta;
    if (c.y > HAUTEUR) {
      return false;
    }
    if (c.y + 20 > Y_RAQUETTE && c.y < Y_RAQUETTE + H_RAQUETTE && c.x + 16 > r.x && c.x < r.x + r.largeur) {
      ramasser(c.type);
      return false;
    }
    return true;
  });
}

function perdreUneVie() {
  etat.vies--;
  effets.secouer(6, 0.4);
  jouer("mort");
  majHud();
  if (etat.vies <= 0) {
    etat.termine = true;
    stockage.effacer();
    afficherMessage("Partie terminée");
    setTimeout(() => {
      if (etat !== null && etat.termine && !zone.hidden) {
        finDePartie(ID, etat.score);
      }
    }, 1200);
    return;
  }
  sauver();
  preparerLancement();
}

function niveauTermine() {
  return etat.boss === null && etat.tuiles.every(t => t.sorte === "G");
}

function niveauSuivant() {
  gagner(100 * etat.niveau, LARGEUR / 2, HAUTEUR / 2);
  jouer("vague");
  etat.niveau++;
  sauver();
  construireNiveau();
  preparerLancement();
}

// ---------------------------------------------------------------------
// Boucle
// ---------------------------------------------------------------------

function maj(delta) {
  if (etat === null || etat.pause) {
    return;
  }
  etat.temps += delta;
  effets.maj(delta);
  majMorceaux(delta);
  etat.tuiles.forEach(t => { t.eclat = Math.max(0, t.eclat - delta); });
  if (etat.banniere !== null) {
    etat.banniere.age += delta;
    if (etat.banniere.age > etat.banniere.duree) {
      etat.banniere = null;
    }
  }
  if (etat.termine) {
    return;
  }

  const p = etat.pouvoirs;
  ["large", "feu", "feuilles", "lent", "court"].forEach(nom => { p[nom] = Math.max(0, p[nom] - delta); });

  majRaquette(delta);
  majBoss(delta);
  if (etat.enAttente) {
    const r = etat.raquette;
    etat.balles[0].x = r.x + r.largeur / 2;
    etat.balles[0].y = Y_RAQUETTE - RAYON - 1;
    etat.balles[0].traine = [];
    if (commandes.tir) {
      lancer();
    }
  } else {
    majBalles(delta);
  }
  majProjectiles(delta);

  if (!etat.enAttente && etat.balles.length === 0) {
    perdreUneVie();
  } else if (niveauTermine()) {
    niveauSuivant();
  }
}

function lancer() {
  if (etat === null || etat.termine || !etat.enAttente) {
    return;
  }
  etat.enAttente = false;
  jouer("tir");
}

// ---------------------------------------------------------------------
// Dessin : net a toute resolution, decor peint une fois
// ---------------------------------------------------------------------

const HUD = 46;
const VW = LARGEUR;
const VH = HAUTEUR + HUD;
let echelle = 1;
let decor = null;
let morceaux = [];     // eclats de tuiles qui tombent en tournant

function texteContour(t, x, y, taille, couleur, alignement, police) {
  const ctx = contexte;
  ctx.font = police || ("800 " + taille + "px 'Anybody', sans-serif");
  ctx.textAlign = alignement || "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(3, taille * 0.18);
  ctx.strokeStyle = "#0b0b10";
  ctx.strokeText(t, x, y);
  ctx.fillStyle = couleur;
  ctx.fillText(t, x, y);
}

function peindreDecor() {
  const off = document.createElement("canvas");
  off.width = Math.round(VW * echelle);
  off.height = Math.round(HAUTEUR * echelle);
  const c = off.getContext("2d");
  c.setTransform(echelle, 0, 0, echelle, 0, 0);
  // Ciel du soir derriere le toit
  const ciel = c.createLinearGradient(0, 0, 0, HAUTEUR);
  ciel.addColorStop(0, "#1b1638");
  ciel.addColorStop(0.55, "#3a2350");
  ciel.addColorStop(1, "#6a3048");
  c.fillStyle = ciel;
  c.fillRect(0, 0, VW, HAUTEUR);
  // Lune et montagnes au loin
  c.fillStyle = "#efe3c4";
  c.beginPath();
  c.arc(380, 420, 34, 0, Math.PI * 2);
  c.fill();
  [["#2c1f45", 470, 60], ["#221836", 520, 44]].forEach(([coul, base, amp], k) => {
    c.fillStyle = coul;
    c.beginPath();
    c.moveTo(0, HAUTEUR);
    for (let x = 0; x <= VW; x += 16) {
      c.lineTo(x, base - Math.abs(Math.sin(x * 0.012 + k * 2)) * amp);
    }
    c.lineTo(VW, HAUTEUR);
    c.fill();
  });
  // Le sol de la cour, ou glisse la raquette
  c.fillStyle = "#1a1220";
  c.fillRect(0, Y_RAQUETTE + H_RAQUETTE + 8, VW, HAUTEUR);
  c.fillStyle = "#3a2a30";
  c.fillRect(0, Y_RAQUETTE + H_RAQUETTE + 8, VW, 2);
  // La poutre du toit, en haut
  const poutre = c.createLinearGradient(0, 0, 0, 10);
  poutre.addColorStop(0, "#5a3a22");
  poutre.addColorStop(1, "#2e1e12");
  c.fillStyle = poutre;
  c.fillRect(0, 0, VW, 8);
  c.fillStyle = "#8a5a32";
  c.fillRect(0, 0, VW, 2);
  return off;
}

// Une tuile kawara : un demi-cylindre vernisse, avec sa levre en bas
function dessinerTuile(t) {
  const ctx = contexte;
  const teinte = TEINTES[t.sorte === "1" ? Math.min(3, t.max) : t.sorte];
  const x = t.x + 1;
  const y = t.y + 1;
  const l = t.l - 2;
  const h = t.h - 2;
  if (t.eclat > 0) {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.roundRect(x, y, l, h, 4);
    ctx.fill();
    return;
  }
  // Ombre portee sur le ciel
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.roundRect(x + 1.5, y + 2.5, l, h, 4);
  ctx.fill();
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, teinte[1]);
  g.addColorStop(0.35, teinte[0]);
  g.addColorStop(1, teinte[2]);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(x, y, l, h, 4);
  ctx.fill();
  // Les cannelures du toit : deux bosses verticales
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  const n = l > 20 ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const cx = x + l * ((i + 0.5) / n) - l * 0.12;
    ctx.fillRect(cx, y + 2, Math.max(2, l * 0.1), h - 6);
  }
  // Levre de la tuile
  ctx.fillStyle = teinte[2];
  ctx.fillRect(x, y + h - 3, l, 3);
  if (t.sorte === "G") {
    // Tuile d'or : un mon en relief, elle ne se casse pas
    ctx.strokeStyle = "#7a5a10";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(x + l / 2, y + h / 2 - 1, Math.min(l, h) * 0.28, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#7a5a10";
    ctx.fillRect(x + l / 2 - 1, y + h / 2 - 3, 2, 4);
  } else if (t.sorte === "B") {
    // Tuile a omamori : une petite feuille peinte
    ctx.fillStyle = "#3f6a1c";
    ctx.beginPath();
    ctx.ellipse(x + l / 2, y + h / 2 - 1, Math.min(l, h) * 0.18, Math.min(l, h) * 0.3, -0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  // Fissures, plus profondes a chaque coup encaisse
  if (t.sorte === "1" && t.resistance < t.max) {
    const degats = t.max - t.resistance;
    ctx.strokeStyle = "rgba(10,10,14,0.85)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + l * 0.2, y + 2);
    ctx.lineTo(x + l * 0.3, y + h * 0.45);
    ctx.lineTo(x + l * 0.22, y + h * 0.7);
    ctx.lineTo(x + l * 0.34, y + h - 3);
    if (degats > 1) {
      ctx.moveTo(x + l * 0.75, y + 2);
      ctx.lineTo(x + l * 0.66, y + h * 0.5);
      ctx.lineTo(x + l * 0.8, y + h - 3);
      ctx.moveTo(x + l * 0.3, y + h * 0.45);
      ctx.lineTo(x + l * 0.48, y + h * 0.4);
    }
    ctx.stroke();
  }
}

// Quand une tuile casse, elle part en quatre morceaux qui tombent en tournant
function briserTuile(tuile) {
  const teinte = TEINTES[tuile.sorte === "1" ? tuile.max : tuile.sorte];
  for (let i = 0; i < 4; i++) {
    morceaux.push({
      x: tuile.x + tuile.l * (i % 2 ? 0.75 : 0.25),
      y: tuile.y + tuile.h * (i < 2 ? 0.3 : 0.7),
      vx: (i % 2 ? 1 : -1) * (40 + Math.random() * 70),
      vy: -60 - Math.random() * 80,
      rot: Math.random() * 6,
      vr: (Math.random() - 0.5) * 12,
      l: tuile.l * 0.45,
      h: tuile.h * 0.45,
      couleur: teinte[i % 3],
      vie: 1.1
    });
  }
}

function majMorceaux(delta) {
  morceaux = morceaux.filter(m => {
    m.vie -= delta;
    m.x += m.vx * delta;
    m.y += m.vy * delta;
    m.vy += 700 * delta;
    m.rot += m.vr * delta;
    return m.vie > 0 && m.y < HAUTEUR + 20;
  });
}

function dessinerOmamori(type, x, y, taille) {
  const ctx = contexte;
  const def = OMAMORI[type];
  const k = taille / 20;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.roundRect(-7, -8, 16, 21, 4);
  ctx.fill();
  const g = ctx.createLinearGradient(-8, 0, 8, 0);
  g.addColorStop(0, def.sombre);
  g.addColorStop(0.4, def.couleur);
  g.addColorStop(1, def.sombre);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(-8, -10, 16, 21, 4);
  ctx.fill();
  // Noeud et cordon
  ctx.fillStyle = "#ede8df";
  ctx.beginPath();
  ctx.ellipse(0, -11, 4, 2.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = def.bonus ? "#141418" : "#e0574b";
  ctx.font = "800 11px 'Anybody', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(def.lettre, 0, 1.5);
  ctx.restore();
}

function dessinerNurikabe(b) {
  const ctx = contexte;
  const x = b.x;
  const y = b.y;
  const blanc = b.eclat > 0;
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.roundRect(x + 6, y + 10, 92, 60, 12);
  ctx.fill();
  const g = ctx.createLinearGradient(0, y, 0, y + 64);
  g.addColorStop(0, blanc ? "#ffffff" : "#a5a59b");
  g.addColorStop(1, blanc ? "#e8e8e8" : "#5d5d55");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(x + 2, y + 2, 92, 60, 12);
  ctx.fill();
  // Joints de pierre
  ctx.strokeStyle = "rgba(40,40,36,0.45)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 8, y + 22);
  ctx.lineTo(x + 88, y + 22);
  ctx.moveTo(x + 8, y + 44);
  ctx.lineTo(x + 88, y + 44);
  ctx.moveTo(x + 40, y + 4);
  ctx.lineTo(x + 40, y + 22);
  ctx.moveTo(x + 62, y + 22);
  ctx.lineTo(x + 62, y + 44);
  ctx.stroke();
  // Visage : yeux et bouche qui grondent
  const furieux = b.pv < b.pvMax / 2;
  [30, 66].forEach(ex => {
    ctx.fillStyle = "#ede8df";
    ctx.beginPath();
    ctx.ellipse(x + ex, y + 26, 8, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = furieux ? "#c8372d" : "#141414";
    ctx.beginPath();
    ctx.arc(x + ex + Math.sign(etat.raquette.x + etat.raquette.largeur / 2 - (x + ex)) * 2, y + 27, 3, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = "#3a1414";
  ctx.beginPath();
  ctx.roundRect(x + 30, y + 42, 36, 8, 3);
  ctx.fill();
  ctx.fillStyle = "#ede8df";
  for (let i = 0; i < 5; i++) {
    ctx.fillRect(x + 33 + i * 7, y + 42, 4, 3);
  }
  // Petits pieds
  ctx.fillStyle = "#4a4a44";
  ctx.beginPath();
  ctx.roundRect(x + 16, y + 60, 14, 8, 3);
  ctx.roundRect(x + 66, y + 60, 14, 8, 3);
  ctx.fill();
}

function dessinerRaquette() {
  const ctx = contexte;
  const r = etat.raquette;
  const x = r.x;
  const l = r.largeur;
  const y = Y_RAQUETTE;
  const pierre = r.gele > 0;
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.roundRect(x + 2, y + 4, l, H_RAQUETTE, 6);
  ctx.fill();
  const g = ctx.createLinearGradient(0, y, 0, y + H_RAQUETTE);
  g.addColorStop(0, pierre ? "#b3b3ab" : "#d2a66a");
  g.addColorStop(0.5, pierre ? "#82827a" : "#9a6c3a");
  g.addColorStop(1, pierre ? "#5a5a54" : "#5e3e1e");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(x, y, l, H_RAQUETTE, 6);
  ctx.fill();
  // Fil du bois
  if (!pierre) {
    ctx.strokeStyle = "rgba(60,36,14,0.35)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x + 10, y + 4);
    ctx.quadraticCurveTo(x + l / 2, y + 2, x + l - 10, y + 5);
    ctx.moveTo(x + 14, y + 8);
    ctx.quadraticCurveTo(x + l / 2, y + 10, x + l - 14, y + 7);
    ctx.stroke();
  }
  // Embouts laques : lime pendant le tir de feuilles
  ctx.fillStyle = etat.pouvoirs.feuilles > 0 ? "#9fd04a" : "#c8372d";
  ctx.beginPath();
  ctx.roundRect(x, y, 9, H_RAQUETTE, [6, 0, 0, 6]);
  ctx.roundRect(x + l - 9, y, 9, H_RAQUETTE, [0, 6, 6, 0]);
  ctx.fill();
}

function dessinerBalle(balle, feu) {
  const ctx = contexte;
  if (feu) {
    // Flammes en aplats derriere la balle, de plus en plus petites
    balle.traine.forEach((p, i) => {
      if (i === 0) {
        return;
      }
      const taille = RAYON * (1 - i / 7);
      ctx.fillStyle = i % 2 ? "#f0b93a" : "#e0574b";
      ctx.beginPath();
      ctx.arc(p.x, p.y, taille, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.arc(balle.x + 2, balle.y + 3, RAYON, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createRadialGradient(balle.x - 2, balle.y - 2, 1, balle.x, balle.y, RAYON);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.5, feu ? "#ffd27a" : "#e8e2d4");
  g.addColorStop(1, feu ? "#d84a1e" : "#9a9488");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(balle.x, balle.y, RAYON, 0, Math.PI * 2);
  ctx.fill();
}

function dessinerHud() {
  const ctx = contexte;
  ctx.fillStyle = "#0e0e15";
  ctx.fillRect(0, 0, VW, HUD);
  ctx.font = "600 8px 'Martian Mono', monospace";
  ctx.fillStyle = "#8f8a82";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("SCORE", 12, 13);
  ctx.textAlign = "center";
  ctx.fillText("COMBO", 230, 13);
  ctx.fillText("NIVEAU", 316, 13);
  ctx.textAlign = "right";
  ctx.fillText("VIES", VW - 12, 13);
  texteContour(etat.score.toLocaleString("fr-BE"), 12, 31, 20, "#c8f060", "left");
  texteContour("x" + etat.multiplicateur, 230, 31, 18, etat.multiplicateur > 1 ? "#c8f060" : "#ede8df");
  texteContour(String(etat.niveau), 316, 31, 18, "#ede8df");
  for (let i = 0; i < Math.min(6, etat.vies); i++) {
    const cx = VW - 18 - i * 16;
    const g = ctx.createRadialGradient(cx - 2, 29, 1, cx, 31, 6);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(1, "#9a9488");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, 31, 5.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function dessiner() {
  if (etat === null) {
    return;
  }
  const ctx = contexte;
  ctx.setTransform(echelle, 0, 0, echelle, 0, 0);
  ctx.fillStyle = "#0b0b10";
  ctx.fillRect(0, 0, VW, VH);
  dessinerHud();
  if (decor === null) {
    decor = peindreDecor();
  }
  const d = effets.decalage();
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, HUD, VW, HAUTEUR);
  ctx.clip();
  ctx.translate(d.x, HUD + d.y);
  ctx.drawImage(decor, 0, 0, VW, HAUTEUR);
  if (etat.pouvoirs.lent > 0) {
    ctx.fillStyle = "rgba(138, 106, 192, 0.12)";
    ctx.fillRect(0, 0, VW, HAUTEUR);
  }

  etat.tuiles.forEach(dessinerTuile);

  morceaux.forEach(m => {
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(m.rot);
    ctx.globalAlpha = Math.min(1, m.vie * 2);
    ctx.fillStyle = m.couleur;
    ctx.beginPath();
    ctx.moveTo(-m.l / 2, -m.h / 2);
    ctx.lineTo(m.l / 2, -m.h / 3);
    ctx.lineTo(m.l / 3, m.h / 2);
    ctx.lineTo(-m.l / 2, m.h / 3);
    ctx.fill();
    ctx.restore();
  });

  const b = etat.boss;
  if (b !== null) {
    dessinerNurikabe(b);
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(60, HAUTEUR - 16, VW - 120, 6);
    ctx.fillStyle = "#c8372d";
    ctx.fillRect(60, HAUTEUR - 16, (VW - 120) * Math.max(0, b.pv) / b.pvMax, 6);
  }

  etat.pierres.forEach(p => {
    ctx.fillStyle = "#6e6e66";
    ctx.beginPath();
    ctx.moveTo(p.x - 6, p.y);
    ctx.lineTo(p.x - 2, p.y - 6);
    ctx.lineTo(p.x + 5, p.y - 4);
    ctx.lineTo(p.x + 6, p.y + 3);
    ctx.lineTo(p.x, p.y + 6);
    ctx.fill();
    ctx.fillStyle = "#9a9a92";
    ctx.fillRect(p.x - 2, p.y - 4, 4, 2);
  });

  etat.chutes.forEach(c => {
    dessinerOmamori(c.type, c.x + 8, c.y + 10 + Math.sin(etat.temps * 6 + c.x) * 1.5, 20);
  });

  etat.feuilles.forEach(f => {
    ctx.fillStyle = "#9fd04a";
    ctx.beginPath();
    ctx.ellipse(f.x, f.y + 4, 2.4, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#3f6a1c";
    ctx.fillRect(f.x - 0.5, f.y, 1, 9);
  });

  dessinerRaquette();
  const feu = etat.pouvoirs.feu > 0;
  etat.balles.forEach(balle => dessinerBalle(balle, feu));

  effets.dessiner(ctx, "'Martian Mono', monospace");
  ctx.restore();

  dessinerPouvoirs();

  if (etat.enAttente && !etat.termine && etat.banniere === null) {
    ctx.font = "600 11px 'Martian Mono', monospace";
    ctx.fillStyle = "#ede8df";
    ctx.textAlign = "center";
    ctx.fillText("Espace, A ou une tape pour lancer", VW / 2, HUD + HAUTEUR - 110);
  }

  if (etat.banniere !== null) {
    const bn = etat.banniere;
    ctx.globalAlpha = Math.max(0, Math.min(1, bn.age * 6, (bn.duree - bn.age) * 3));
    if (bn.jp) {
      texteContour(bn.jp, VW / 2, HUD + HAUTEUR / 2 + 30, 30, "#e0574b", "center", "700 30px 'Shippori Mincho B1', serif");
    }
    texteContour(bn.texte.toUpperCase(), VW / 2, HUD + HAUTEUR / 2 + 76, bn.texte.length > 9 ? 36 : 48, "#ede8df");
    ctx.globalAlpha = 1;
  }

  if (etat.pause) {
    voile("PAUSE", "P pour reprendre");
  } else if (etat.termine) {
    voile("PARTIE FINIE", etat.score.toLocaleString("fr-BE") + " points");
  }
}

function dessinerPouvoirs() {
  const ctx = contexte;
  const p = etat.pouvoirs;
  const actifs = [["large", DUREE_POUVOIR], ["feu", DUREE_POUVOIR * 0.7], ["feuilles", DUREE_POUVOIR], ["lent", DUREE_POUVOIR * 0.8]]
    .filter(([nom]) => p[nom] > 0);
  actifs.forEach(([nom, duree], i) => {
    const x = 18 + i * 30;
    const y = HUD + HAUTEUR - 28;
    dessinerOmamori(nom, x, y, 18);
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(x - 9, y + 13, 18, 3);
    ctx.fillStyle = OMAMORI[nom].couleur;
    ctx.fillRect(x - 9, y + 13, 18 * p[nom] / duree, 3);
  });
}

function voile(titre, sousTitre) {
  const ctx = contexte;
  ctx.fillStyle = "rgba(8, 8, 12, 0.8)";
  ctx.fillRect(0, HUD, VW, HAUTEUR);
  texteContour(titre, VW / 2, HUD + HAUTEUR / 2 - 10, 52, "#c8f060");
  ctx.font = "600 13px 'Martian Mono', monospace";
  ctx.fillStyle = "#ede8df";
  ctx.textAlign = "center";
  ctx.fillText(sousTitre, VW / 2, HUD + HAUTEUR / 2 + 36);
}

function ajuster() {
  const marge = window.innerWidth >= 1100 ? 500 : 0;
  const largeur = Math.min(window.innerWidth * 0.96 - marge, 620);
  const entete = zone.querySelector(".jeu-entete").getBoundingClientRect().height || 40;
  const manette = document.querySelector(".manette:not([hidden])");
  const hauteurManette = manette ? manette.getBoundingClientRect().height : 0;
  const hauteur = Math.max(260, window.innerHeight - entete - hauteurManette - 44);
  const taille = Math.min(largeur / VW, hauteur / VH);
  canvas.style.width = Math.floor(VW * taille) + "px";
  canvas.style.height = Math.floor(VH * taille) + "px";
  const nouvelle = Math.min(3, Math.max(1, taille * (window.devicePixelRatio || 1)));
  if (Math.abs(nouvelle - echelle) > 0.02 || canvas.width !== Math.round(VW * nouvelle)) {
    echelle = nouvelle;
    canvas.width = Math.round(VW * echelle);
    canvas.height = Math.round(VH * echelle);
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
}, { plafond: 0.05 });

// ---------------------------------------------------------------------
// En-tete
// ---------------------------------------------------------------------

function majHud() {
  if (etat === null) {
    return;
  }
  zoneScore.textContent = etat.score.toLocaleString("fr-BE");
  zoneCombo.textContent = "x" + etat.multiplicateur;
  zoneCombo.parentElement.classList.toggle("chaud", etat.multiplicateur > 1);
  zoneNiveau.textContent = String(etat.niveau);
  zoneVies.textContent = String(Math.max(0, etat.vies));
}

function majBoutonSon() {
  boutonSon.textContent = sonActif() ? "Son" : "Muet";
  boutonSon.setAttribute("aria-pressed", String(!sonActif()));
}

// ---------------------------------------------------------------------
// Demarrage et commandes
// ---------------------------------------------------------------------

function demarrer() {
  effets.vider();
  morceaux = [];
  ajuster();
  requestAnimationFrame(ajuster);
  etat = nouvelEtat();
  charger();
  commandes.gauche = commandes.droite = commandes.tir = false;
  pointeurX = null;
  construireNiveau();
  preparerLancement();
  majScoreCourant(ID, etat.score);
  majBoutonSon();
  boucle.lancer();
}

function recommencer() {
  stockage.effacer();
  effets.vider();
  etat = nouvelEtat();
  construireNiveau();
  preparerLancement();
  majScoreCourant(ID, 0);
}

function basculerPause() {
  if (etat === null || etat.termine) {
    return;
  }
  etat.pause = !etat.pause;
  if (!etat.pause) {
    boucle.remettreALHeure();
  }
}

surTouche(ID, function (evenement) {
  const touche = evenement.key.toLowerCase();
  if (touche === "arrowleft" || touche === "q" || touche === "a") {
    commandes.gauche = true;
    pointeurX = null;
  } else if (touche === "arrowright" || touche === "d") {
    commandes.droite = true;
    pointeurX = null;
  } else if (touche === " " || touche === "x" || touche === "arrowup" || touche === "z" || touche === "w") {
    commandes.tir = true;
    lancer();
  } else if (touche === "p") {
    basculerPause();
  } else if (touche === "m") {
    basculerSon();
    majBoutonSon();
  } else if (touche === "n") {
    recommencer();
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
  if (touche === "arrowleft" || touche === "q" || touche === "a") {
    commandes.gauche = false;
  } else if (touche === "arrowright" || touche === "d") {
    commandes.droite = false;
  } else if (touche === " " || touche === "x" || touche === "arrowup" || touche === "z" || touche === "w") {
    commandes.tir = false;
  }
});

// Souris et doigt : la raquette suit le pointeur, un appui lance ou tire
function suivre(clientX) {
  pointeurX = abscisseLogique(canvas, clientX, LARGEUR);
}

canvas.addEventListener("pointermove", function (evenement) {
  if (jeuAuPremierPlan(ID) && (evenement.pointerType === "mouse" || evenement.buttons > 0)) {
    suivre(evenement.clientX);
  }
});

canvas.addEventListener("pointerdown", function (evenement) {
  if (!jeuAuPremierPlan(ID)) {
    return;
  }
  canvas.setPointerCapture(evenement.pointerId);
  suivre(evenement.clientX);
  commandes.tir = true;
  lancer();
});

function lacher() {
  commandes.tir = false;
}
canvas.addEventListener("pointerup", lacher);
canvas.addEventListener("pointercancel", lacher);

document.addEventListener("visibilitychange", function () {
  if (document.hidden && etat !== null && !etat.pause && !etat.termine && !zone.hidden) {
    basculerPause();
  }
});

boutonSon.addEventListener("click", function () {
  basculerSon();
  majBoutonSon();
});
boutonRecommencer.addEventListener("click", recommencer);
boutonQuitter.addEventListener("click", quitterJeu);

// ===== Inscription dans l'arcade =====
enregistrerJeu({
  id: ID,
  nom: "Casse-briques",
  code: "1976",
  section: zone,
  demarrer,
  arreter: () => {
    boucle.arreter();
    sauver();
    commandes.gauche = commandes.droite = commandes.tir = false;
    pointeurX = null;
  },
  manette: { a: " ", b: "x", start: "p", libelles: { a: "Lancer", b: "Tir" }, repetition: false }
});

// Acces pour les tests automatiques
export const _test = {
  get etat() { return etat; },
  aller(niveau) { etat.niveau = niveau; construireNiveau(); },
  tableauGenere
};
