// =====================================================================
//  SOLITAIRE - le solitaire a billes de verre (Ishitobi)
//  On saute une bille voisine vers un trou vide, la bille sautee quitte
//  le plateau et roule dans la gouttiere. Le but : n'en laisser qu'une,
//  et si possible dans le trou du depart (c'est le "Genie").
//
//  Quatre plateaux classes, chacun avec son classement :
//  - anglais, 33 trous, depart au centre (le classement historique) ;
//  - europeen, 37 trous, depart decale d'un cran vers le haut ;
//  - asymetrique, 39 trous, deux bras plus longs ;
//  - triangle, 15 trous, six directions de saut.
//  Et six defis sur le plateau anglais : une figure de depart (croix,
//  pyramide, fleche...) a reduire a une bille au centre. Chaque defi
//  est verifie au solveur avant d'etre propose.
//
//  Plateau en bois tourne, billes de verre en volume, rendu net a la
//  resolution reelle de l'ecran. Le score est le nombre de billes
//  restantes, plus bas = mieux.
// =====================================================================

import { enregistrerJeu, finDePartie, quitterJeu, majScoreCourant } from "./arcade.js";
import { surTouche, jeuAuPremierPlan } from "./noyau/clavier.js";
import { creerBoucle } from "./noyau/boucle.js";
import { creerEffets } from "./noyau/effets.js";
import { jouer, basculerSon, sonActif } from "./noyau/son.js";
import { creerStockage } from "./noyau/stockage.js";
import { creerBoutonsChoix, marquerChoixActif } from "./noyau/choix.js";
import { creerAfficheur } from "./noyau/message.js";
import { formaterMinutesSecondes } from "./noyau/outils.js";
import { abscisseLogique, ordonneeLogique } from "./noyau/pointeur.js";

const ID = "solitaire";
const NOM = "Solitaire";
const LARGEUR = 440;
const HAUTEUR = 440;
const CENTRE = 220;
const RAYON_PLATEAU = 186;
const RAYON_GOUTTIERE = 203;

// ---------------------------------------------------------------------
// La section est reconstruite ici : index.html ne garde que l'element
// ---------------------------------------------------------------------

const zone = document.getElementById("jeuSolitaire");
zone.innerHTML = `
  <div class="jeu-entete entete-solitaire">
    <span class="jeu-score score-principal">Billes <strong class="valeur-score" id="billesSolitaire">32</strong></span>
    <span class="jeu-score">Coups <strong id="coupsSolitaire">0</strong></span>
    <span class="jeu-score">Temps <strong id="tempsSolitaire">0:00</strong></span>
    <span class="boutons-solitaire">
      <button class="jeu-quitter" id="indiceSolitaire" type="button">Indice</button>
      <button class="jeu-quitter" id="annulerSolitaire" type="button">Annuler</button>
      <button class="jeu-quitter" id="sonSolitaire" type="button">Son</button>
      <button class="jeu-quitter" id="nouvelleSolitaire" type="button">Rejouer</button>
      <button class="jeu-quitter" id="quitterSolitaire" type="button">Retour</button>
    </span>
  </div>
  <div class="scores-ligne plateaux-solitaire" id="plateauxSolitaire" aria-label="Choix du plateau"></div>
  <div class="scores-ligne plateaux-solitaire defis-solitaire" id="defisSolitaire" aria-label="Choix du défi" hidden></div>
  <canvas id="canvasSolitaire" aria-label="Plateau de solitaire"></canvas>
  <p class="jeu-message" id="messageSolitaire"></p>
  <p class="jeu-aide">Touche une bille puis un trou marqué pour sauter. Si une seule bille peut atteindre un trou, touche directement le trou. Les défis partent d'une figure à réduire à une seule bille au centre. Clavier : fl&egrave;ches et Entr&eacute;e, Retour arri&egrave;re pour annuler, H indice, N rejouer, M son, &Eacute;chap quitter.</p>
`;

const canvas = document.getElementById("canvasSolitaire");
const contexte = canvas.getContext("2d");
const zonePierres = document.getElementById("billesSolitaire");
const zoneCoups = document.getElementById("coupsSolitaire");
const zoneTemps = document.getElementById("tempsSolitaire");
const zonePlateaux = document.getElementById("plateauxSolitaire");
const zoneDefis = document.getElementById("defisSolitaire");
const zoneMessage = document.getElementById("messageSolitaire");
const boutonIndice = document.getElementById("indiceSolitaire");
const boutonAnnuler = document.getElementById("annulerSolitaire");
const boutonSon = document.getElementById("sonSolitaire");
const boutonNouvelle = document.getElementById("nouvelleSolitaire");
const boutonQuitter = document.getElementById("quitterSolitaire");

const afficher = creerAfficheur(zoneMessage, { delai: 3200, peutEffacer: () => etat === null || !etat.termine });
const stockagePlateau = creerStockage("tanuki-arcade-solitaire-plateau");
const stockageDefi = creerStockage("tanuki-arcade-solitaire-defi");
const stockageEtoiles = creerStockage("tanuki-arcade-solitaire-defis");

// ---------------------------------------------------------------------
// Plateaux
// Chaque plateau devient une liste de trous (avec leur position a
// l'ecran) et une liste de sauts [depart, sautee, arrivee]. Le reste du
// jeu ne connait que ces deux listes, quelle que soit la geometrie.
// ---------------------------------------------------------------------

function plateauCarre(cote, valide, vide) {
  // Le plateau est rond : le pas tient compte du rayon disponible
  const taille = Math.min(50, Math.floor(330 / cote));
  const origine = (LARGEUR - taille * cote) / 2;
  const trous = [];
  const index = {};
  for (let y = 0; y < cote; y++) {
    for (let x = 0; x < cote; x++) {
      if (valide(x, y)) {
        index[x + "," + y] = trous.length;
        trous.push({ gx: x, gy: y, px: origine + x * taille + taille / 2, py: origine + y * taille + taille / 2 });
      }
    }
  }
  const sauts = [];
  trous.forEach((t, i) => {
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
      const sautee = index[(t.gx + dx) + "," + (t.gy + dy)];
      const arrivee = index[(t.gx + 2 * dx) + "," + (t.gy + 2 * dy)];
      if (sautee !== undefined && arrivee !== undefined) {
        sauts.push([i, sautee, arrivee]);
      }
    });
  });
  return { trous, sauts, taille, index, vide: index[vide[0] + "," + vide[1]] };
}

function plateauTriangle(rangees) {
  const taille = 60;
  const pas = Math.round(taille * 0.87);
  const haut = CENTRE - (pas * (rangees - 1)) / 2 + 8;
  const trous = [];
  const index = {};
  for (let r = 0; r < rangees; r++) {
    for (let c = 0; c <= r; c++) {
      index[r + "," + c] = trous.length;
      trous.push({ gx: c, gy: r, px: CENTRE + (c - r / 2) * taille, py: haut + r * pas });
    }
  }
  const sauts = [];
  trous.forEach((t, i) => {
    [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, -1]].forEach(([dr, dc]) => {
      const sautee = index[(t.gy + dr) + "," + (t.gx + dc)];
      const arrivee = index[(t.gy + 2 * dr) + "," + (t.gx + 2 * dc)];
      if (sautee !== undefined && arrivee !== undefined) {
        sauts.push([i, sautee, arrivee]);
      }
    });
  });
  return { trous, sauts, taille, index, vide: 0 };
}

const croix = (x, y) => (x >= 2 && x <= 4) || (y >= 2 && y <= 4);

const PLATEAUX = [
  { id: "anglais", nom: "Anglais", court: "Anglais", idClassement: "solitaire",
    creer: () => plateauCarre(7, croix, [3, 3]) },
  { id: "europeen", nom: "Européen", court: "Européen", idClassement: "solitaire-europeen",
    creer: () => plateauCarre(7, (x, y) => croix(x, y) || ((x === 1 || x === 5) && (y === 1 || y === 5)), [3, 1]) },
  { id: "asymetrique", nom: "Asymétrique", court: "Asymétrique", idClassement: "solitaire-asymetrique",
    creer: () => plateauCarre(8, (x, y) => (x >= 2 && x <= 4) || (y >= 2 && y <= 4), [3, 3]) },
  { id: "triangle", nom: "Triangle", court: "Triangle", idClassement: "solitaire-triangle",
    creer: () => plateauTriangle(5) },
  { id: "defis", nom: "Défis", court: "Défi", idClassement: null,
    creer: () => plateauCarre(7, croix, [3, 3]) }
];

// Les figures classiques du plateau anglais. But : une bille, au centre.
const DEFIS_PROPOSES = [
  { id: "croix", nom: "Croix", billes: [[3, 1], [2, 2], [3, 2], [4, 2], [3, 3], [3, 4]] },
  { id: "plus", nom: "Plus", billes: [[3, 1], [3, 2], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [3, 4], [3, 5]] },
  { id: "cheminee", nom: "Cheminée", billes: [[2, 0], [3, 0], [4, 0], [2, 1], [3, 1], [4, 1], [2, 2], [3, 2], [4, 2], [2, 3], [4, 3]] },
  { id: "pyramide", nom: "Pyramide", billes: [[3, 1], [2, 2], [3, 2], [4, 2], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [0, 4], [1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4]] },
  { id: "fleche", nom: "Flèche", billes: [[3, 0], [2, 1], [3, 1], [4, 1], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [3, 3], [3, 4], [2, 5], [3, 5], [4, 5], [2, 6], [3, 6], [4, 6]] },
  { id: "losange", nom: "Losange", billes: [[3, 0], [2, 1], [3, 1], [4, 1], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [0, 3], [1, 3], [2, 3], [4, 3], [5, 3], [6, 3], [1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [2, 5], [3, 5], [4, 5], [3, 6]] }
];
let DEFIS = DEFIS_PROPOSES;
let defiActif = DEFIS.find(d => d.id === stockageDefi.lireTexte()) || DEFIS[0];
let etoilesDefis = stockageEtoiles.lire() || {};

function plateauParId(id) {
  return PLATEAUX.find(p => p.id === id) || PLATEAUX[0];
}

// ---------------------------------------------------------------------
// Rendu : plateau de bois tourne, gouttiere, billes de verre en volume.
// Tout est peint a la resolution reelle de l'ecran (echelle).
// ---------------------------------------------------------------------

const VERRES = [
  { claire: "#ffd2c6", base: "#e0472f", sombre: "#6e160c" },
  { claire: "#dcf7b0", base: "#5fa82a", sombre: "#22480c" },
  { claire: "#fff0b8", base: "#e3a51e", sombre: "#704804" },
  { claire: "#cfe4ff", base: "#3d76d6", sombre: "#14306a" },
  { claire: "#ecdcff", base: "#8a55e0", sombre: "#3a1a70" },
  { claire: "#c9f2ea", base: "#2aa892", sombre: "#0c4a40" }
];

let echelle = 1;
let fondBois = null;
let spritesBilles = [];
let rayonBille = 18;
let rayonTrou = 12;

function peindreBille(c, x, y, r, verre) {
  // Ombre de contact sur le bois
  c.fillStyle = "rgba(40,20,6,0.4)";
  c.beginPath();
  c.ellipse(x + r * 0.16, y + r * 0.34, r * 0.92, r * 0.66, 0, 0, Math.PI * 2);
  c.fill();
  // Corps du verre : clair au coeur, sombre au bord
  const g = c.createRadialGradient(x - r * 0.25, y - r * 0.3, r * 0.08, x, y, r);
  g.addColorStop(0, verre.claire);
  g.addColorStop(0.5, verre.base);
  g.addColorStop(1, verre.sombre);
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
  // La lumiere traverse le verre et ressort en bas a droite
  c.fillStyle = "rgba(255,255,255,0.3)";
  c.beginPath();
  c.ellipse(x + r * 0.32, y + r * 0.44, r * 0.38, r * 0.18, -0.6, 0, Math.PI * 2);
  c.fill();
  // La torsade coloree prise dans le verre
  c.strokeStyle = "rgba(255,255,255,0.38)";
  c.lineWidth = Math.max(1, r * 0.1);
  c.beginPath();
  c.moveTo(x - r * 0.55, y + r * 0.12);
  c.bezierCurveTo(x - r * 0.2, y - r * 0.45, x + r * 0.2, y + r * 0.45, x + r * 0.55, y - r * 0.12);
  c.stroke();
  // Reflet net en haut a gauche
  c.fillStyle = "rgba(255,255,255,0.92)";
  c.beginPath();
  c.ellipse(x - r * 0.38, y - r * 0.42, r * 0.22, r * 0.13, -0.6, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = "rgba(0,0,0,0.3)";
  c.lineWidth = 1;
  c.beginPath();
  c.arc(x, y, r - 0.5, 0, Math.PI * 2);
  c.stroke();
}

function preparerSprites() {
  rayonBille = Math.round(geometrie.taille * 0.38);
  rayonTrou = Math.round(geometrie.taille * 0.26);
  spritesBilles = VERRES.map(verre => {
    const cote = Math.ceil((rayonBille * 2 + 12) * echelle);
    const toile = document.createElement("canvas");
    toile.width = cote;
    toile.height = cote;
    const c = toile.getContext("2d");
    c.setTransform(echelle, 0, 0, echelle, cote / 2, cote / 2);
    peindreBille(c, 0, 0, rayonBille, verre);
    return toile;
  });
}

// Le plateau rond, tourne dans un bois clair : quelques cernes espaces
// irregulierement, un biseau, puis la gouttiere creusee tout autour
function peindreBois() {
  const toile = document.createElement("canvas");
  toile.width = Math.round(LARGEUR * echelle);
  toile.height = Math.round(HAUTEUR * echelle);
  const c = toile.getContext("2d");
  c.setTransform(echelle, 0, 0, echelle, 0, 0);
  // Ombre portee du plateau sur la table
  c.fillStyle = "rgba(0,0,0,0.5)";
  c.beginPath();
  c.ellipse(CENTRE + 4, CENTRE + 9, RAYON_GOUTTIERE + 15, RAYON_GOUTTIERE + 13, 0, 0, Math.PI * 2);
  c.fill();
  // Rebord exterieur
  const bord = c.createLinearGradient(0, 0, 0, HAUTEUR);
  bord.addColorStop(0, "#cf955a");
  bord.addColorStop(1, "#7a4a22");
  c.fillStyle = bord;
  c.beginPath();
  c.arc(CENTRE, CENTRE, RAYON_GOUTTIERE + 15, 0, Math.PI * 2);
  c.fill();
  // Gouttiere : creuse, plus sombre au fond
  const creux = c.createRadialGradient(CENTRE, CENTRE - 6, RAYON_GOUTTIERE - 18, CENTRE, CENTRE, RAYON_GOUTTIERE + 12);
  creux.addColorStop(0, "#2e1a0c");
  creux.addColorStop(0.6, "#553218");
  creux.addColorStop(1, "#8a5a2c");
  c.fillStyle = creux;
  c.beginPath();
  c.arc(CENTRE, CENTRE, RAYON_GOUTTIERE + 11, 0, Math.PI * 2);
  c.fill();
  // Le plateau, en relief au-dessus de la gouttiere
  c.fillStyle = "#4e2c12";
  c.beginPath();
  c.arc(CENTRE + 2, CENTRE + 5, RAYON_PLATEAU, 0, Math.PI * 2);
  c.fill();
  const dessus = c.createRadialGradient(CENTRE - 60, CENTRE - 80, 20, CENTRE, CENTRE, RAYON_PLATEAU);
  dessus.addColorStop(0, "#e6bb82");
  dessus.addColorStop(0.7, "#c9955a");
  dessus.addColorStop(1, "#a6713c");
  c.fillStyle = dessus;
  c.beginPath();
  c.arc(CENTRE, CENTRE, RAYON_PLATEAU, 0, Math.PI * 2);
  c.fill();
  // Cernes du tournage : peu nombreux, espaces au hasard
  c.strokeStyle = "rgba(120,72,30,0.2)";
  c.lineWidth = 1.2;
  [36, 63, 79, 111, 133, 152, 172].forEach((r, i) => {
    c.beginPath();
    c.arc(CENTRE + (i % 2 ? 1 : -1), CENTRE + (i % 3) - 1, r, 0, Math.PI * 2);
    c.stroke();
  });
  // Biseau : clair en haut a gauche, sombre en bas a droite
  c.lineWidth = 3;
  c.strokeStyle = "rgba(255,236,200,0.55)";
  c.beginPath();
  c.arc(CENTRE, CENTRE, RAYON_PLATEAU - 2, Math.PI * 0.95, Math.PI * 1.75);
  c.stroke();
  c.strokeStyle = "rgba(60,30,10,0.45)";
  c.beginPath();
  c.arc(CENTRE, CENTRE, RAYON_PLATEAU - 2, Math.PI * 1.95, Math.PI * 0.75);
  c.stroke();
  // Les trous : ombre au fond, levre claire en bas
  geometrie.trous.forEach(t => {
    const g = c.createRadialGradient(t.px, t.py + rayonTrou * 0.35, rayonTrou * 0.2, t.px, t.py, rayonTrou);
    g.addColorStop(0, "#5a3618");
    g.addColorStop(1, "#22130a");
    c.fillStyle = g;
    c.beginPath();
    c.arc(t.px, t.py, rayonTrou, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "rgba(255,230,190,0.6)";
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(t.px, t.py, rayonTrou, Math.PI * 0.15, Math.PI * 0.85);
    c.stroke();
  });
  // Le trou du but, dans les defis : un liseré dore
  if (plateauActif.id === "defis") {
    const t = geometrie.trous[geometrie.vide];
    c.strokeStyle = "#e8c547";
    c.lineWidth = 2;
    c.beginPath();
    c.arc(t.px, t.py, rayonTrou + 4, 0, Math.PI * 2);
    c.stroke();
  }
  return toile;
}

// Place d'une bille tombee dans la gouttiere : elles s'alignent les
// unes derriere les autres, en partant du bas a gauche
function placeGouttiere(k) {
  const r = rayonBille * 0.8;
  const pas = (2 * r + 1) / RAYON_GOUTTIERE;
  const angle = Math.PI * 0.62 + k * pas;
  return { x: CENTRE + Math.cos(angle) * RAYON_GOUTTIERE, y: CENTRE + Math.sin(angle) * RAYON_GOUTTIERE };
}

// ---------------------------------------------------------------------
// Etat
// ---------------------------------------------------------------------

const effets = creerEffets();
let plateauActif = plateauParId(stockagePlateau.lireTexte() || "anglais");
let geometrie = null;
let sautsTries = [];
let etat = null;

function nouvelEtat() {
  const plein = new Uint8Array(geometrie.trous.length);
  if (plateauActif.id === "defis") {
    defiActif.billes.forEach(([x, y]) => {
      plein[geometrie.index[x + "," + y]] = 1;
    });
  } else {
    plein.fill(1);
    plein[geometrie.vide] = 0;
  }
  // Chaque bille garde sa couleur de verre en se deplacant
  const couleurs = new Uint8Array(geometrie.trous.length);
  for (let i = 0; i < couleurs.length; i++) {
    couleurs[i] = (i * 7 + (i >> 2)) % VERRES.length;
  }
  return {
    plein,
    couleurs,
    gouttiere: [],         // couleurs des billes tombees, dans l'ordre
    historique: [],
    selection: null,
    curseur: geometrie.vide,
    curseurVisible: false,
    indice: null,          // { coup, jusqua }
    indices: 0,
    anim: null,            // { coup, t, eclate, couleur }
    roule: [],             // billes qui roulent vers la gouttiere
    secondes: 0,
    chronoLance: false,
    termine: false,
    fin: null,
    temps: 0
  };
}

function preparerPlateau() {
  geometrie = plateauActif.creer();
  preparerSprites();
  fondBois = peindreBois();
  // Le solveur essaie d'abord les sauts qui ramenent vers le centre
  const cx = geometrie.trous.reduce((s, t) => s + t.px, 0) / geometrie.trous.length;
  const cy = geometrie.trous.reduce((s, t) => s + t.py, 0) / geometrie.trous.length;
  const ecart = i => Math.abs(geometrie.trous[i].px - cx) + Math.abs(geometrie.trous[i].py - cy);
  sautsTries = geometrie.sauts.slice().sort((a, b) => (ecart(a[2]) - ecart(a[0])) - (ecart(b[2]) - ecart(b[0])));
}

function pierresRestantes() {
  let n = 0;
  for (const v of etat.plein) {
    n += v;
  }
  return n;
}

function sautsDepuis(i) {
  if (!etat.plein[i]) {
    return [];
  }
  return geometrie.sauts.filter(s => s[0] === i && etat.plein[s[1]] && !etat.plein[s[2]]);
}

function sautsPossibles() {
  return geometrie.sauts.filter(s => etat.plein[s[0]] && etat.plein[s[1]] && !etat.plein[s[2]]);
}

// ---------------------------------------------------------------------
// Solveur pour les indices et la verification des defis
// Recherche en profondeur avec memoire des positions perdantes, bornee
// dans le temps : au-dela, on se contente d'un coup legal.
// Dans les defis, la derniere bille doit finir au centre.
// ---------------------------------------------------------------------

function chercherSolution(depart, limiteMs, butCentre) {
  const n = geometrie.trous.length;
  const plein = Uint8Array.from(depart);
  // Cle de position : un nombre, exact jusqu'a 53 trous
  const puissances = [];
  for (let i = 0; i < n; i++) {
    puissances.push(2 ** i);
  }
  let cle = 0;
  let compte = 0;
  for (let i = 0; i < n; i++) {
    if (plein[i]) {
      cle += puissances[i];
      compte++;
    }
  }
  const perdantes = new Set();
  const debut = performance.now();
  let noeuds = 0;
  let coupe = false;
  let premier = null;

  function explorer(profondeur) {
    if (compte === 1) {
      return !butCentre || plein[geometrie.vide] === 1;
    }
    if (perdantes.has(cle)) {
      return false;
    }
    if (++noeuds % 1500 === 0 && performance.now() - debut > limiteMs) {
      coupe = true;
      return false;
    }
    for (const s of sautsTries) {
      const [a, o, d] = s;
      if (plein[a] && plein[o] && !plein[d]) {
        plein[a] = 0;
        plein[o] = 0;
        plein[d] = 1;
        cle += puissances[d] - puissances[a] - puissances[o];
        compte--;
        if (explorer(profondeur + 1)) {
          if (profondeur === 0) {
            premier = s;
          }
          return true;
        }
        plein[a] = 1;
        plein[o] = 1;
        plein[d] = 0;
        cle -= puissances[d] - puissances[a] - puissances[o];
        compte++;
        if (coupe) {
          return false;
        }
      }
    }
    perdantes.add(cle);
    return false;
  }

  const trouve = explorer(0);
  return { trouve, coupe, coup: premier };
}

function donnerIndice() {
  if (etat === null || etat.termine || etat.anim !== null) {
    return;
  }
  const possibles = sautsPossibles();
  if (possibles.length === 0) {
    return;
  }
  etat.indices++;
  const resultat = chercherSolution(etat.plein, 450, plateauActif.id === "defis");
  let coup;
  if (resultat.trouve) {
    coup = resultat.coup;
    afficher("Indice : ce saut mène encore à une seule bille.");
  } else if (!resultat.coupe) {
    coup = possibles[0];
    afficher("Plus aucune solution à une bille d'ici. Annule quelques coups.", 4500);
  } else {
    coup = sautsTries.find(s => etat.plein[s[0]] && etat.plein[s[1]] && !etat.plein[s[2]]);
    afficher("Un saut possible. Pas de garantie, la position est trop ouverte.");
  }
  etat.indice = { coup, jusqua: etat.temps + 2.4 };
  etat.selection = null;
  jouer("clic");
}

// ---------------------------------------------------------------------
// Coups
// ---------------------------------------------------------------------

function lancerSaut(coup) {
  etat.anim = { coup, t: 0, eclate: false, couleur: etat.couleurs[coup[0]] };
  etat.selection = null;
  etat.indice = null;
  etat.chronoLance = true;
  jouer("clic");
}

function appliquerSaut(coup) {
  const [a, o, d] = coup;
  etat.plein[a] = 0;
  etat.plein[o] = 0;
  etat.plein[d] = 1;
  etat.couleurs[d] = etat.couleurs[a];
  etat.historique.push({ coup, couleurA: etat.couleurs[a], couleurO: etat.couleurs[o] });
  etat.curseur = d;
  majHud();
  verifierFin();
}

function annuler() {
  if (etat === null || etat.anim !== null || etat.historique.length === 0) {
    return;
  }
  if (etat.termine) {
    etat.termine = false;
    etat.fin = null;
  }
  const { coup, couleurA, couleurO } = etat.historique.pop();
  const [a, o, d] = coup;
  etat.plein[a] = 1;
  etat.plein[o] = 1;
  etat.plein[d] = 0;
  etat.couleurs[a] = couleurA;
  etat.couleurs[o] = couleurO;
  etat.gouttiere.pop();
  etat.roule = [];
  etat.selection = null;
  etat.indice = null;
  afficher("");
  jouer("clic");
  majHud();
}

function verifierFin() {
  if (sautsPossibles().length > 0) {
    return;
  }
  etat.termine = true;
  const restantes = pierresRestantes();
  const derniere = etat.plein.indexOf(1);
  const defi = plateauActif.id === "defis";
  let etoiles = 0;
  let titre = "Bloqué";
  if (restantes === 1 && derniere === geometrie.vide) {
    etoiles = 3;
    titre = defi ? "Réussi" : "Génie";
  } else if (restantes === 1) {
    etoiles = defi ? 2 : 3;
    titre = defi ? "Presque" : "Parfait";
  } else if (restantes === 2) {
    etoiles = defi ? 1 : 2;
    titre = "Presque";
  } else if (restantes <= 4 && !defi) {
    etoiles = 1;
    titre = "Bien joué";
  }
  const detail = restantes + (restantes > 1 ? " billes" : " bille") + "  ·  " + formaterMinutesSecondes(Math.floor(etat.secondes))
    + (etat.indices > 0 ? "  ·  " + etat.indices + (etat.indices > 1 ? " indices" : " indice") : "");
  etat.fin = { etoiles, titre, detail, depuis: etat.temps };
  if (restantes === 1) {
    jouer(titre === "Génie" || titre === "Réussi" ? "vague" : "vie");
    const t = geometrie.trous[derniere];
    effets.eclater(t.px, t.py, ["#e8c547", "#c8f060", "#ede8df"], 26, 150);
  } else {
    jouer("mort");
  }
  afficher(titre === "Génie" ? "Une seule bille, dans le trou du départ." : titre === "Bloqué" ? "Plus aucun saut possible." : "", 0);
  if (defi) {
    // Les defis n'ont pas de classement : on garde les etoiles
    if (etoiles > (etoilesDefis[defiActif.id] || 0)) {
      etoilesDefis[defiActif.id] = etoiles;
      stockageEtoiles.ecrire(etoilesDefis);
      majBoutonsDefis();
    }
    return;
  }
  setTimeout(() => {
    if (etat !== null && etat.termine && !zone.hidden) {
      finDePartie(plateauActif.idClassement, restantes, NOM + " " + plateauActif.court);
    }
  }, 1800);
}

// ---------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------

function choisir(i) {
  if (etat.termine || etat.anim !== null || i === null) {
    return;
  }
  if (etat.selection !== null) {
    const coup = sautsDepuis(etat.selection).find(s => s[2] === i);
    if (coup) {
      lancerSaut(coup);
      return;
    }
  }
  if (etat.plein[i]) {
    etat.selection = etat.selection === i ? null : i;
    if (etat.selection !== null && sautsDepuis(i).length === 0) {
      afficher("Cette bille ne peut pas sauter.", 1600);
    }
    jouer("clic");
    return;
  }
  // Un trou vide touche directement : si une seule bille peut y aller, elle y va
  const versCeTrou = sautsPossibles().filter(s => s[2] === i);
  if (versCeTrou.length === 1) {
    lancerSaut(versCeTrou[0]);
    return;
  }
  if (versCeTrou.length > 1) {
    afficher("Plusieurs billes peuvent y sauter : choisis d'abord la bille.", 2200);
  }
  etat.selection = null;
}

function trouSous(x, y) {
  let meilleur = null;
  let distanceMin = geometrie.taille * 0.55;
  geometrie.trous.forEach((t, i) => {
    const d = Math.hypot(t.px - x, t.py - y);
    if (d < distanceMin) {
      distanceMin = d;
      meilleur = i;
    }
  });
  return meilleur;
}

// Fleches : le trou le plus proche dans la direction demandee
function deplacerCurseur(dx, dy) {
  const depart = geometrie.trous[etat.curseur];
  let meilleur = etat.curseur;
  let score = Infinity;
  geometrie.trous.forEach((t, i) => {
    const vx = t.px - depart.px;
    const vy = t.py - depart.py;
    const avance = vx * dx + vy * dy;
    if (avance <= 1) {
      return;
    }
    const lateral = Math.abs(vx * dy - vy * dx);
    const s = avance + lateral * 2.2;
    if (s < score) {
      score = s;
      meilleur = i;
    }
  });
  etat.curseur = meilleur;
  etat.curseurVisible = true;
}

// ---------------------------------------------------------------------
// Boucle et dessin
// ---------------------------------------------------------------------

const DUREE_SAUT = 0.34;
const DUREE_ROULE = 0.6;

function maj(delta) {
  if (etat === null) {
    return;
  }
  etat.temps += delta;
  effets.maj(delta);
  if (etat.chronoLance && !etat.termine) {
    const avant = Math.floor(etat.secondes);
    etat.secondes += delta;
    if (Math.floor(etat.secondes) !== avant) {
      zoneTemps.textContent = formaterMinutesSecondes(Math.floor(etat.secondes));
    }
  }
  if (etat.anim !== null) {
    const a = etat.anim;
    a.t += delta / DUREE_SAUT;
    if (!a.eclate && a.t >= 0.5) {
      // La bille sautee est chassee : elle roule vers la gouttiere
      a.eclate = true;
      const t = geometrie.trous[a.coup[1]];
      const place = placeGouttiere(etat.gouttiere.length + etat.roule.length);
      etat.roule.push({ x0: t.px, y0: t.py, x1: place.x, y1: place.y, t: 0, couleur: etat.couleurs[a.coup[1]] });
      jouer("impact");
    }
    if (a.t >= 1) {
      etat.anim = null;
      appliquerSaut(a.coup);
      jouer("grain");
    }
  }
  etat.roule = etat.roule.filter(r => {
    r.t += delta / DUREE_ROULE;
    if (r.t >= 1) {
      etat.gouttiere.push(r.couleur);
      jouer("grain");
      return false;
    }
    return true;
  });
  if (etat.indice !== null && etat.temps > etat.indice.jusqua) {
    etat.indice = null;
  }
}

function dessinerBille(couleur, x, y, ech) {
  const img = spritesBilles[couleur % spritesBilles.length];
  const cote = img.width / echelle * (ech || 1);
  contexte.drawImage(img, x - cote / 2, y - cote / 2, cote, cote);
}

function anneau(x, y, rayon, couleur, epaisseur) {
  contexte.strokeStyle = couleur;
  contexte.lineWidth = epaisseur || 2;
  contexte.beginPath();
  contexte.arc(x, y, rayon, 0, Math.PI * 2);
  contexte.stroke();
}

function dessiner() {
  if (etat === null) {
    return;
  }
  contexte.setTransform(echelle, 0, 0, echelle, 0, 0);
  contexte.clearRect(0, 0, LARGEUR, HAUTEUR);
  contexte.drawImage(fondBois, 0, 0, LARGEUR, HAUTEUR);

  // Billes deja tombees, au repos dans la gouttiere
  etat.gouttiere.forEach((couleur, k) => {
    const p = placeGouttiere(k);
    dessinerBille(couleur, p.x, p.y, 0.8);
  });

  const a = etat.anim;
  const arrivees = etat.selection !== null ? sautsDepuis(etat.selection).map(s => s[2]) : [];
  const clignoteIndice = etat.indice !== null && Math.floor(etat.temps * 5) % 2 === 0;

  geometrie.trous.forEach((t, i) => {
    if (arrivees.includes(i)) {
      contexte.fillStyle = "#c8f060";
      contexte.beginPath();
      contexte.arc(t.px, t.py, 4, 0, Math.PI * 2);
      contexte.fill();
      anneau(t.px, t.py, rayonTrou + 4, "#c8f060", 2);
    }
    let visible = etat.plein[i] === 1;
    if (a !== null && (i === a.coup[0] || (i === a.coup[1] && a.eclate))) {
      visible = false;
    }
    if (visible) {
      const leve = etat.selection === i ? 5 : 0;
      dessinerBille(etat.couleurs[i], t.px, t.py - leve, leve ? 1.08 : 1);
      if (etat.selection === i) {
        anneau(t.px, t.py - leve, rayonBille + 4, "#c8f060", 2.5);
      }
    }
    if (clignoteIndice && (i === etat.indice.coup[0] || i === etat.indice.coup[2])) {
      anneau(t.px, t.py, rayonBille + 5, "#e0574b", 3);
    }
  });

  // Les billes chassees roulent jusqu'a la gouttiere, en ralentissant
  etat.roule.forEach(r => {
    const k = 1 - Math.pow(1 - r.t, 2.2);
    dessinerBille(r.couleur, r.x0 + (r.x1 - r.x0) * k, r.y0 + (r.y1 - r.y0) * k, 1 - 0.2 * k);
  });

  // La bille en vol : un arc, elle grossit un peu en montant
  if (a !== null) {
    const depart = geometrie.trous[a.coup[0]];
    const arrivee = geometrie.trous[a.coup[2]];
    const t = Math.min(1, a.t);
    const lisse = t * t * (3 - 2 * t);
    const x = depart.px + (arrivee.px - depart.px) * lisse;
    const y = depart.py + (arrivee.py - depart.py) * lisse;
    const hauteur = Math.sin(Math.PI * t) * geometrie.taille * 0.55;
    contexte.fillStyle = "rgba(40,20,6,0.3)";
    contexte.beginPath();
    contexte.ellipse(x + 3, y + 5, rayonBille * 0.9, rayonBille * 0.6, 0, 0, Math.PI * 2);
    contexte.fill();
    dessinerBille(a.couleur, x, y - hauteur, 1 + Math.sin(Math.PI * t) * 0.15);
  }

  // Curseur clavier : quatre coins ivoire
  if (etat.curseurVisible && !etat.termine) {
    const t = geometrie.trous[etat.curseur];
    const r = Math.round(geometrie.taille / 2) - 1;
    contexte.strokeStyle = "#ede8df";
    contexte.lineWidth = 2;
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy]) => {
      const cx = t.px + sx * r;
      const cy = t.py + sy * r;
      contexte.beginPath();
      contexte.moveTo(cx - sx * 8, cy);
      contexte.lineTo(cx, cy);
      contexte.lineTo(cx, cy - sy * 8);
      contexte.stroke();
    });
  }

  effets.dessiner(contexte);

  if (etat.fin !== null) {
    dessinerFin();
  }
}

function etoile(x, y, r, pleine) {
  contexte.beginPath();
  for (let i = 0; i < 10; i++) {
    const ang = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    const rr = i % 2 ? r * 0.45 : r;
    contexte.lineTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr);
  }
  contexte.closePath();
  contexte.fillStyle = pleine ? "#ffd23a" : "rgba(0,0,0,0.18)";
  contexte.fill();
  contexte.lineWidth = 2;
  contexte.strokeStyle = pleine ? "#a8650a" : "rgba(126,33,27,0.35)";
  contexte.stroke();
}

// Carton de fin, papier creme borde de rouge, comme les autres jeux
function dessinerFin() {
  const f = etat.fin;
  const age = etat.temps - f.depuis;
  if (age < 0.6) {
    return;
  }
  const apparition = Math.min(1, (age - 0.6) / 0.25);
  contexte.fillStyle = "rgba(14,6,24," + (0.55 * apparition) + ")";
  contexte.fillRect(0, 0, LARGEUR, HAUTEUR);
  const w = 300;
  const h = 200;
  const x = (LARGEUR - w) / 2;
  const y = (HAUTEUR - h) / 2 + (1 - apparition) * 30;
  contexte.globalAlpha = apparition;
  contexte.fillStyle = "#fbf1de";
  contexte.beginPath();
  contexte.roundRect(x, y, w, h, 20);
  contexte.fill();
  contexte.lineWidth = 5;
  contexte.strokeStyle = "#c8372d";
  contexte.stroke();
  contexte.fillStyle = "#c8372d";
  contexte.beginPath();
  contexte.roundRect(x + 50, y - 20, w - 100, 42, 13);
  contexte.fill();
  contexte.textAlign = "center";
  contexte.textBaseline = "middle";
  contexte.font = "800 22px 'Anybody', sans-serif";
  contexte.fillStyle = "#ffffff";
  contexte.fillText(f.titre.toUpperCase(), LARGEUR / 2, y + 1);
  for (let i = 0; i < 3; i++) {
    const pleine = i < f.etoiles && age > 0.9 + i * 0.25;
    etoile(LARGEUR / 2 + (i - 1) * 54, y + 74 - (i === 1 ? 8 : 0), i === 1 ? 26 : 21, pleine);
  }
  contexte.fillStyle = "#3a2030";
  contexte.font = "700 15px 'Hanken Grotesk', sans-serif";
  const nomPartie = plateauActif.id === "defis" ? "Défi " + defiActif.nom : plateauActif.nom;
  contexte.fillText(nomPartie, LARGEUR / 2, y + 128);
  contexte.fillStyle = "#7e5a6a";
  contexte.font = "600 11px 'Martian Mono', monospace";
  contexte.fillText(f.detail, LARGEUR / 2, y + 154);
  contexte.fillText("N ou Rejouer pour recommencer", LARGEUR / 2, y + 176);
  contexte.globalAlpha = 1;
}

const boucle = creerBoucle(function (delta) {
  maj(delta);
  dessiner();
}, { plafond: 0.05 });

// ---------------------------------------------------------------------
// Taille : le plateau prend toute la place laissee par l'en-tete, les
// classements lateraux et la manette, et reste net
// ---------------------------------------------------------------------

function ajuster() {
  const marge = window.innerWidth >= 1100 ? 500 : 0;
  const largeur = Math.min(window.innerWidth * 0.96 - marge, 600);
  let autres = 0;
  [...zone.children].forEach(el => {
    if (el !== canvas && !el.hidden && el.offsetParent !== null && !el.classList.contains("jeu-aide")) {
      autres += el.getBoundingClientRect().height + 8;
    }
  });
  const manette = document.querySelector(".manette:not([hidden])");
  const hauteurManette = manette ? manette.getBoundingClientRect().height : 0;
  const hauteur = Math.max(180, window.innerHeight - autres - hauteurManette - 24);
  const cote = Math.floor(Math.min(largeur, hauteur));
  canvas.style.width = cote + "px";
  canvas.style.height = cote + "px";
  const nouvelle = Math.min(3, Math.max(1, (cote / LARGEUR) * (window.devicePixelRatio || 1)));
  if (Math.abs(nouvelle - echelle) > 0.02 || fondBois === null) {
    echelle = nouvelle;
    canvas.width = Math.round(LARGEUR * echelle);
    canvas.height = Math.round(HAUTEUR * echelle);
    if (geometrie !== null) {
      preparerSprites();
      fondBois = peindreBois();
    }
  }
}

window.addEventListener("resize", function () {
  if (!zone.hidden) {
    ajuster();
  }
});

// ---------------------------------------------------------------------
// En-tete, plateaux, defis, demarrage
// ---------------------------------------------------------------------

function majHud() {
  const n = pierresRestantes();
  zonePierres.textContent = String(n);
  zoneCoups.textContent = String(etat.historique.length);
  boutonAnnuler.disabled = etat.historique.length === 0;
  if (plateauActif.idClassement) {
    majScoreCourant(plateauActif.idClassement, n);
  }
}

function majBoutonSon() {
  boutonSon.textContent = sonActif() ? "Son" : "Muet";
}

creerBoutonsChoix(zonePlateaux, PLATEAUX.map(p => ({ id: p.id, nom: p.nom })), function (entree) {
  if (entree.id === plateauActif.id && etat !== null && etat.historique.length === 0) {
    return;
  }
  plateauActif = plateauParId(entree.id);
  stockagePlateau.ecrireTexte(plateauActif.id);
  demarrer();
}, "plateau");

function majBoutonsDefis() {
  zoneDefis.innerHTML = "";
  creerBoutonsChoix(zoneDefis, DEFIS.map(d => {
    const e = etoilesDefis[d.id] || 0;
    return { id: d.id, nom: d.nom + (e ? " " + "★".repeat(e) : "") };
  }), function (entree) {
    defiActif = DEFIS.find(d => d.id === entree.id) || DEFIS[0];
    stockageDefi.ecrireTexte(defiActif.id);
    demarrer();
  }, "defi");
  marquerChoixActif(zoneDefis, defiActif.id, "defi");
}

// Au premier lancement, on ne garde que les defis que le solveur sait
// finir a une bille au centre
let defisVerifies = false;

function verifierDefis() {
  if (defisVerifies) {
    return;
  }
  defisVerifies = true;
  const memoire = plateauActif;
  plateauActif = PLATEAUX.find(p => p.id === "defis");
  geometrie = plateauActif.creer();
  sautsTries = geometrie.sauts.slice();
  DEFIS = DEFIS_PROPOSES.filter(d => {
    const depart = new Uint8Array(geometrie.trous.length);
    d.billes.forEach(([x, y]) => {
      depart[geometrie.index[x + "," + y]] = 1;
    });
    const r = chercherSolution(depart, 1500, true);
    return r.trouve;
  });
  if (!DEFIS.includes(defiActif)) {
    defiActif = DEFIS[0];
  }
  plateauActif = memoire;
  majBoutonsDefis();
}

function demarrer() {
  verifierDefis();
  zoneDefis.hidden = plateauActif.id !== "defis";
  zoneDefis.style.display = plateauActif.id === "defis" ? "" : "none";
  preparerPlateau();
  effets.vider();
  etat = nouvelEtat();
  marquerChoixActif(zonePlateaux, plateauActif.id, "plateau");
  marquerChoixActif(zoneDefis, defiActif.id, "defi");
  zoneTemps.textContent = "0:00";
  afficher(plateauActif.id === "defis" ? "Défi " + defiActif.nom + " : finis avec une seule bille, dans le trou doré." : "", plateauActif.id === "defis" ? 3500 : 0);
  majHud();
  majBoutonSon();
  ajuster();
  requestAnimationFrame(ajuster);
  boucle.lancer();
}

// ---------------------------------------------------------------------
// Commandes
// ---------------------------------------------------------------------

canvas.addEventListener("pointerdown", function (evenement) {
  if (!jeuAuPremierPlan(ID) || etat === null) {
    return;
  }
  evenement.preventDefault();
  const x = abscisseLogique(canvas, evenement.clientX, LARGEUR);
  const y = ordonneeLogique(canvas, evenement.clientY, HAUTEUR);
  etat.curseurVisible = false;
  const i = trouSous(x, y);
  if (i !== null) {
    etat.curseur = i;
    choisir(i);
  } else {
    etat.selection = null;
  }
});

canvas.addEventListener("contextmenu", evenement => evenement.preventDefault());

surTouche(ID, function (evenement) {
  const touche = evenement.key.toLowerCase();
  if (etat === null) {
    return;
  }
  if (touche === "arrowup") {
    deplacerCurseur(0, -1);
  } else if (touche === "arrowdown") {
    deplacerCurseur(0, 1);
  } else if (touche === "arrowleft") {
    deplacerCurseur(-1, 0);
  } else if (touche === "arrowright") {
    deplacerCurseur(1, 0);
  } else if (touche === "enter" || touche === " ") {
    etat.curseurVisible = true;
    choisir(etat.curseur);
  } else if (touche === "backspace" || (touche === "z" && (evenement.ctrlKey || evenement.metaKey))) {
    annuler();
  } else if (touche === "h") {
    donnerIndice();
  } else if (touche === "n") {
    demarrer();
  } else if (touche === "m") {
    basculerSon();
    majBoutonSon();
  } else if (touche === "escape") {
    quitterJeu();
    return;
  } else {
    return;
  }
  evenement.preventDefault();
});

boutonIndice.addEventListener("click", donnerIndice);
boutonAnnuler.addEventListener("click", annuler);
boutonSon.addEventListener("click", function () {
  basculerSon();
  majBoutonSon();
});
boutonNouvelle.addEventListener("click", demarrer);
boutonQuitter.addEventListener("click", quitterJeu);

enregistrerJeu({
  id: ID,
  nom: NOM,
  code: "33",
  section: zone,
  demarrer,
  arreter: () => boucle.arreter(),
  plusBasEstMieux: true,
  classement: () => plateauActif.idClassement || "solitaire",
  formaterScore: n => n + (n > 1 ? " billes" : " bille"),
  manette: { a: "Enter", b: "Backspace", start: "h", libelles: { a: "Sauter", b: "Annuler" } }
});

// Pour les tests automatiques
export const _test = {
  get etat() { return etat; },
  get geometrie() { return geometrie; },
  choisir: i => choisir(i),
  sauts: () => sautsPossibles(),
  resoudre: () => chercherSolution(etat.plein, 3000, plateauActif.id === "defis")
};
