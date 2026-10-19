// =====================================================================
//  MAHJONG SOLITAIRE - quatre dispositions, 112 a 144 tuiles
//  Une tuile est libre si rien ne la recouvre et si son cote gauche ou
//  son cote droit est degage. Chaque partie est generee a l'envers, en
//  posant des paires sur des emplacements libres : il existe donc
//  toujours une solution.
//
//  Ce qui change par rapport a la premiere version :
//  - les tuiles sont dessinees (cercles, bambous, caracteres, vents,
//    dragons, fleurs et saisons) avec une vraie epaisseur en pixels,
//    sans dependre d'une police du systeme pour leurs motifs ;
//  - quatre dispositions : la Tortue classique, la Pagode, le Pont et
//    le Dragon, chacune avec son classement ;
//  - les paires s'envolent, le compteur dit combien de paires sont
//    jouables, et enchainer vite les paires fait gagner des secondes ;
//  - une loupe sur telephone pour jouer les grandes dispositions.
//  Le score est le temps, donc plus il est bas, mieux c'est.
// =====================================================================

import { enregistrerJeu, finDePartie, quitterJeu, majScoreCourant } from "./arcade.js";
import { surTouche, jeuAuPremierPlan } from "./noyau/clavier.js";
import { creerAfficheur } from "./noyau/message.js";
import { creerStockage } from "./noyau/stockage.js";
import { creerChrono } from "./noyau/chrono.js";
import { melanger, formaterMinutesSecondes } from "./noyau/outils.js";
import { jouer, basculerSon, sonActif } from "./noyau/son.js";

const ID = "mahjong";
const CLE_MAHJONG = "tanuki-arcade-mahjong";
const PENALITE_INDICE = 30;
const PENALITE_MELANGE = 60;
const FENETRE_COMBO_MS = 3000;

// ---------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------

const zone = document.getElementById("jeuMahjong");
zone.innerHTML = `
  <div class="jeu-entete entete-mahjong">
    <span class="jeu-score score-principal">Temps <strong class="valeur-score" id="chronoMahjong">0:00</strong></span>
    <span class="jeu-score">Tuiles <strong id="restantesMahjong">144</strong></span>
    <span class="jeu-score">Jouables <strong id="jouablesMahjong">0</strong></span>
    <span class="jeu-score combo-mahjong">Combo <strong id="comboMahjong">x1</strong></span>
  </div>
  <div class="scores-ligne mahjong-outils">
    <button class="jeu-quitter" id="indiceMahjong" type="button">Indice</button>
    <button class="jeu-quitter" id="melangerMahjong" type="button">Mélanger</button>
    <button class="jeu-quitter" id="annulerMahjong" type="button">Annuler</button>
    <button class="jeu-quitter loupe-mahjong" id="loupeMahjong" type="button" aria-pressed="false">Loupe</button>
    <button class="jeu-quitter" id="sonMahjong" type="button" aria-pressed="false">Son</button>
    <button class="jeu-quitter" id="nouvelleMahjong" type="button">Nouvelle</button>
    <button class="jeu-quitter" id="quitterMahjong" type="button">Retour</button>
  </div>
  <div class="scores-ligne" id="dispositionsMahjong" role="group" aria-label="Disposition"></div>
  <div class="cadre-mahjong" id="cadreMahjong">
    <div class="plateau-mahjong" id="plateauMahjong"></div>
  </div>
  <p class="jeu-message" id="messageMahjong"></p>
  <p class="jeu-aide">Touche deux tuiles identiques et libres (rien dessus, un côté dégagé). Les fleurs vont entre elles, les saisons aussi. H indice, M mélanger, Retour arrière annuler, N nouvelle partie, Échap quitter.</p>
`;

const plateau = document.getElementById("plateauMahjong");
const cadre = document.getElementById("cadreMahjong");
const zoneChrono = document.getElementById("chronoMahjong");
const zoneRestantes = document.getElementById("restantesMahjong");
const zoneJouables = document.getElementById("jouablesMahjong");
const zoneCombo = document.getElementById("comboMahjong");
const zoneMessage = document.getElementById("messageMahjong");
const zoneDispositions = document.getElementById("dispositionsMahjong");
const boutonIndice = document.getElementById("indiceMahjong");
const boutonMelanger = document.getElementById("melangerMahjong");
const boutonAnnuler = document.getElementById("annulerMahjong");
const boutonLoupe = document.getElementById("loupeMahjong");
const boutonSon = document.getElementById("sonMahjong");
const boutonNouvelle = document.getElementById("nouvelleMahjong");
const boutonQuitter = document.getElementById("quitterMahjong");

// ---------------------------------------------------------------------
// Faces
// groupe : ce qui doit etre identique pour former une paire. Les quatre
// fleurs partagent un groupe, les quatre saisons aussi.
// ---------------------------------------------------------------------

const CHIFFRES_HAN = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];

const FAMILLES = [
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => ({ id: "cercle" + n, type: "cercle", n, groupe: "cercle" + n, nom: n + " cercle" + (n > 1 ? "s" : "") })),
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => ({ id: "bambou" + n, type: "bambou", n, groupe: "bambou" + n, nom: n + " bambou" + (n > 1 ? "s" : "") })),
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => ({ id: "carac" + n, type: "caractere", n, groupe: "carac" + n, nom: n + " caractère" + (n > 1 ? "s" : "") })),
  { id: "vent-e", type: "vent", signe: "東", groupe: "vent-e", nom: "vent d'est" },
  { id: "vent-s", type: "vent", signe: "南", groupe: "vent-s", nom: "vent du sud" },
  { id: "vent-o", type: "vent", signe: "西", groupe: "vent-o", nom: "vent d'ouest" },
  { id: "vent-n", type: "vent", signe: "北", groupe: "vent-n", nom: "vent du nord" },
  { id: "dragon-r", type: "dragon", signe: "中", couleur: "#c8372d", groupe: "dragon-r", nom: "dragon rouge" },
  { id: "dragon-v", type: "dragon", signe: "發", couleur: "#3f6a1a", groupe: "dragon-v", nom: "dragon vert" },
  { id: "dragon-b", type: "dragon-blanc", groupe: "dragon-b", nom: "dragon blanc" }
];
const FLEURS = [
  { id: "fleur-prunier", type: "fleur", n: 1, signe: "梅", groupe: "fleur", nom: "prunier" },
  { id: "fleur-orchidee", type: "fleur", n: 2, signe: "蘭", groupe: "fleur", nom: "orchidée" },
  { id: "fleur-chrysantheme", type: "fleur", n: 3, signe: "菊", groupe: "fleur", nom: "chrysanthème" },
  { id: "fleur-bambou", type: "fleur", n: 4, signe: "竹", groupe: "fleur", nom: "bambou" }
];
const SAISONS = [
  { id: "saison-printemps", type: "saison", n: 1, signe: "春", groupe: "saison", nom: "printemps" },
  { id: "saison-ete", type: "saison", n: 2, signe: "夏", groupe: "saison", nom: "été" },
  { id: "saison-automne", type: "saison", n: 3, signe: "秋", groupe: "saison", nom: "automne" },
  { id: "saison-hiver", type: "saison", n: 4, signe: "冬", groupe: "saison", nom: "hiver" }
];
const TOUTES_LES_FACES = FAMILLES.concat(FLEURS, SAISONS);

function faceParId(id) {
  return TOUTES_LES_FACES.find(face => face.id === id) || null;
}

// Les 72 paires du jeu complet. Une disposition plus petite en tire une partie.
function toutesLesPaires() {
  const paires = [];
  FAMILLES.forEach(face => {
    paires.push([face, face], [face, face]);
  });
  paires.push([FLEURS[0], FLEURS[1]], [FLEURS[2], FLEURS[3]]);
  paires.push([SAISONS[0], SAISONS[1]], [SAISONS[2], SAISONS[3]]);
  return paires;
}

// ---------------------------------------------------------------------
// Dessin des faces en SVG : net a toutes les tailles, et aucun motif ne
// depend d'une police (seuls les signes chinois utilisent Shippori).
// ---------------------------------------------------------------------

const BLEU = "#2f4f9e";
const VERT = "#3f6a1a";
const ROUGE = "#c8372d";
const ENCRE = "#1a1a20";

const POSITIONS_CERCLES = {
  1: [[15, 20]],
  2: [[15, 11], [15, 29]],
  3: [[8, 9], [15, 20], [22, 31]],
  4: [[9, 11], [21, 11], [9, 29], [21, 29]],
  5: [[9, 10], [21, 10], [15, 20], [9, 30], [21, 30]],
  6: [[9, 9], [21, 9], [9, 20], [21, 20], [9, 31], [21, 31]],
  7: [[7, 7], [15, 11], [23, 15], [9, 25], [21, 25], [9, 33], [21, 33]],
  8: [[9, 7], [21, 7], [9, 15], [21, 15], [9, 24], [21, 24], [9, 33], [21, 33]],
  9: [[7, 9], [15, 9], [23, 9], [7, 20], [15, 20], [23, 20], [7, 31], [15, 31], [23, 31]]
};

const POSITIONS_BAMBOUS = {
  2: [[15, 12], [15, 28]],
  3: [[15, 12], [9, 28], [21, 28]],
  4: [[9, 12], [21, 12], [9, 28], [21, 28]],
  5: [[8, 12], [22, 12], [15, 20], [8, 28], [22, 28]],
  6: [[7, 12], [15, 12], [23, 12], [7, 28], [15, 28], [23, 28]],
  7: [[15, 8], [7, 20], [15, 20], [23, 20], [7, 32], [15, 32], [23, 32]],
  8: [[6, 12], [12, 12], [18, 12], [24, 12], [6, 28], [12, 28], [18, 28], [24, 28]],
  9: [[7, 8], [15, 8], [23, 8], [7, 20], [15, 20], [23, 20], [7, 32], [15, 32], [23, 32]]
};

const IVOIRE = "#f6f0e2";

// Un rond de cercle : anneau colore, filet ivoire, coeur colore, point clair
function rond(x, y, r, couleur) {
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="${couleur}"/>`
    + `<circle cx="${x}" cy="${y}" r="${(r * 0.72).toFixed(2)}" fill="${IVOIRE}"/>`
    + `<circle cx="${x}" cy="${y}" r="${(r * 0.5).toFixed(2)}" fill="${couleur}"/>`
    + `<circle cx="${x}" cy="${y}" r="${(r * 0.17).toFixed(2)}" fill="${IVOIRE}"/>`;
}

function svgCercles(n) {
  if (n === 1) {
    // Le un de cercle : une grande rosace
    let petales = "";
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      petales += `<circle cx="${(15 + Math.cos(a) * 8).toFixed(2)}" cy="${(20 + Math.sin(a) * 8).toFixed(2)}" r="1.7" fill="${BLEU}"/>`;
    }
    return `<circle cx="15" cy="20" r="12" fill="${VERT}"/><circle cx="15" cy="20" r="10.4" fill="${IVOIRE}"/>` + petales
      + `<circle cx="15" cy="20" r="5.4" fill="${ROUGE}"/><circle cx="15" cy="20" r="3.4" fill="${IVOIRE}"/><circle cx="15" cy="20" r="1.8" fill="${ROUGE}"/>`;
  }
  const rayon = n === 2 ? 6 : n >= 7 ? 3.6 : n >= 5 ? 4.3 : 4.8;
  return POSITIONS_CERCLES[n].map(([x, y], i) => {
    let couleur = [BLEU, VERT, ROUGE][(i + n) % 3];
    if (n === 7) {
      couleur = i < 3 ? VERT : ROUGE;
    } else if (n === 5) {
      couleur = i === 2 ? ROUGE : i % 3 ? BLEU : VERT;
    }
    return rond(x, y, rayon, couleur);
  }).join("");
}

// Une tige de bambou : deux tons en aplat, noeuds marques
function baton(x, y, couleur, hauteur = 12.5) {
  const h = hauteur;
  const clair = couleur === ROUGE ? "#e0614f" : "#7aa53a";
  return `<rect x="${x - 1.8}" y="${y - h / 2}" width="3.6" height="${h}" rx="1.6" fill="${couleur}"/>`
    + `<rect x="${x - 1.8}" y="${y - h / 2 + 1}" width="1.4" height="${h - 2}" rx="0.7" fill="${clair}"/>`
    + `<rect x="${x - 2.3}" y="${y - 0.6}" width="4.6" height="1.2" rx="0.6" fill="${couleur}"/>`
    + `<rect x="${x - 2.3}" y="${y - h / 2}" width="4.6" height="1.1" rx="0.5" fill="${couleur}"/>`
    + `<rect x="${x - 2.3}" y="${y + h / 2 - 1.1}" width="4.6" height="1.1" rx="0.5" fill="${couleur}"/>`;
}

function svgBambous(n) {
  if (n === 1) {
    // Le un de bambou : l'oiseau sur sa branche, comme sur les jeux anciens
    return `<path d="M15 26q-8 6-10 12q5-2 8-7Z" fill="${BLEU}"/><path d="M15 26q8 6 10 12q-5-2-8-7Z" fill="${BLEU}"/>`
      + `<path d="M15 27q0 7 0 12q2-4 2-12Z" fill="${VERT}"/>`
      + `<circle cx="7.5" cy="35.5" r="1.3" fill="${ROUGE}"/><circle cx="22.5" cy="35.5" r="1.3" fill="${ROUGE}"/>`
      + `<ellipse cx="15" cy="21" rx="6.2" ry="7.5" fill="${VERT}"/>`
      + `<path d="M11 18q4 8 9 6q-2 4-6 3q-4-2-3-9Z" fill="#7aa53a"/>`
      + `<path d="M17 17q5 1 6 6q-4-1-6-3Z" fill="${ROUGE}"/>`
      + `<circle cx="14" cy="10.5" r="4.2" fill="${ROUGE}"/>`
      + `<path d="M9.9 10.3L6 12l4 .9Z" fill="#d9a520"/>`
      + `<circle cx="12.6" cy="9.7" r="1.1" fill="${IVOIRE}"/><circle cx="12.6" cy="9.7" r="0.5" fill="${ENCRE}"/>`
      + `<path d="M15 6.6l1.5-3l.8 3.4Z" fill="${BLEU}"/>`;
  }
  return POSITIONS_BAMBOUS[n].map(([x, y], i) => {
    const centre = (n === 5 && i === 2) || ((n === 7 || n === 9) && i === 4) || (n === 7 && i === 0);
    return baton(x, y, centre ? ROUGE : (n === 9 && i % 3 === 1 ? BLEU : (i % 2 ? VERT : "#4f7a24")));
  }).join("");
}

function texteHan(signe, x, y, taille, couleur) {
  return `<text x="${x}" y="${y}" font-size="${taille}" text-anchor="middle" dominant-baseline="central" fill="${couleur}" class="signe-han">${signe}</text>`;
}

const cacheFaces = new Map();

function svgFace(face) {
  if (cacheFaces.has(face.id)) {
    return cacheFaces.get(face.id);
  }
  let corps = "";
  if (face.type === "cercle") {
    corps = svgCercles(face.n);
  } else if (face.type === "bambou") {
    corps = svgBambous(face.n);
  } else if (face.type === "caractere") {
    corps = texteHan(CHIFFRES_HAN[face.n - 1], 15, 12, 13, ENCRE) + texteHan("萬", 15, 29, 14, ROUGE);
  } else if (face.type === "vent") {
    corps = texteHan(face.signe, 15, 20, 21, ENCRE);
  } else if (face.type === "dragon") {
    corps = texteHan(face.signe, 15, 20, 22, face.couleur);
  } else if (face.type === "dragon-blanc") {
    corps = `<rect x="6" y="7" width="18" height="26" rx="2" fill="none" stroke="${BLEU}" stroke-width="2"/><rect x="9.5" y="10.5" width="11" height="19" fill="none" stroke="${BLEU}" stroke-width="1"/>`;
  } else if (face.type === "fleur") {
    corps = `<g fill="${ROUGE}"><circle cx="24" cy="5.2" r="1.5"/><circle cx="26.2" cy="7" r="1.5"/><circle cx="25.4" cy="9.6" r="1.5"/><circle cx="22.6" cy="9.6" r="1.5"/><circle cx="21.8" cy="7" r="1.5"/></g><circle cx="24" cy="7.5" r="0.9" fill="#d9a520"/>`
      + `<text x="5" y="8" font-size="7" font-weight="700" fill="${VERT}" class="chiffre-tuile">${face.n}</text>`
      + texteHan(face.signe, 15, 24, 18, ROUGE);
  } else {
    corps = `<path d="M21.5 4.5h5v5h-5Z" fill="${BLEU}"/><path d="M22.7 5.7h2.6v2.6h-2.6Z" fill="${IVOIRE}"/>`
      + `<text x="5" y="8" font-size="7" font-weight="700" fill="${ROUGE}" class="chiffre-tuile">${face.n}</text>`
      + texteHan(face.signe, 15, 24, 18, BLEU);
  }
  const svg = `<svg viewBox="0 0 30 40" aria-hidden="true" focusable="false">${corps}</svg>`;
  cacheFaces.set(face.id, svg);
  return svg;
}

// ---------------------------------------------------------------------
// Dispositions
// ---------------------------------------------------------------------

// La tortue classique, avec ses tuiles decalees d'une demi-case
function placesTortue() {
  const places = [];
  const ajouter = (couche, x, y) => places.push({ couche, x, y });
  [
    { y: 0, debut: 1, fin: 12 }, { y: 1, debut: 3, fin: 10 }, { y: 2, debut: 2, fin: 11 }, { y: 3, debut: 1, fin: 12 },
    { y: 4, debut: 1, fin: 12 }, { y: 5, debut: 2, fin: 11 }, { y: 6, debut: 3, fin: 10 }, { y: 7, debut: 1, fin: 12 }
  ].forEach(r => {
    for (let x = r.debut; x <= r.fin; x++) {
      ajouter(0, x, r.y);
    }
  });
  ajouter(0, 0, 3.5);
  ajouter(0, 13, 3.5);
  ajouter(0, 14, 3.5);
  for (let y = 1; y <= 6; y++) {
    for (let x = 3; x <= 8; x++) {
      ajouter(1, x + 1, y);
    }
  }
  for (let y = 2; y <= 5; y++) {
    for (let x = 4; x <= 7; x++) {
      ajouter(2, x + 1, y);
    }
  }
  for (let y = 3; y <= 4; y++) {
    for (let x = 5; x <= 6; x++) {
      ajouter(3, x + 1, y);
    }
  }
  // La tuile du sommet, a cheval sur les quatre du dessous
  ajouter(4, 6.5, 3.5);
  return places;
}

// Les autres dispositions s'ecrivent en carte des hauteurs : chaque
// chiffre dit combien de tuiles sont empilees a cet endroit.
function placesDepuisCarte(carte) {
  const places = [];
  carte.forEach((ligne, y) => {
    [...ligne].forEach((caractere, x) => {
      const hauteur = caractere === "." ? 0 : Number(caractere);
      for (let couche = 0; couche < hauteur; couche++) {
        places.push({ couche, x, y });
      }
    });
  });
  return places;
}

const DISPOSITIONS = [
  { id: "tortue", nom: "Tortue", places: placesTortue },
  {
    id: "pagode", nom: "Pagode", places: () => placesDepuisCarte([
      "..111111..",
      ".12222221.",
      "1223333221",
      "1233443321",
      "1233443321",
      "1223333221",
      ".12222221.",
      "..111111.."
    ])
  },
  {
    id: "pont", nom: "Pont", places: () => placesDepuisCarte([
      "2221......1222",
      "2321......1232",
      "2221......1222",
      "11111111111111",
      "11222222222211",
      "2221......1222",
      "2321......1232",
      "2221......1222"
    ])
  },
  {
    id: "dragon", nom: "Dragon", places: () => placesDepuisCarte([
      "...1111.........",
      "..122221........",
      ".12333321.....11",
      ".12344321111.121",
      "112333211222221.",
      "12221111..1221..",
      ".111......111..."
    ])
  }
];

// Dispositions generees : une carte des hauteurs symetrique, tiree d'une
// graine. La graine suffit a la reconstruire (sauvegarde, partage).
const NOMS_GENERES = ["Éventail", "Lanterne", "Torii", "Nuage", "Rizière", "Château", "Volcan", "Îlot", "Jardin", "Cloche"];

function aleatoireGraine(graine) {
  let a = graine >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function carteGeneree(graine) {
  const hasard = aleatoireGraine(graine);
  const demi = 5 + Math.floor(hasard() * 3);
  const rangees = 6 + Math.floor(hasard() * 3);
  const sommet = 3 + Math.floor(hasard() * 2);
  const forme = hasard();
  const cy = (rangees - 1) / 2;
  const lignes = [];
  for (let y = 0; y < rangees; y++) {
    let moitie = "";
    for (let x = 0; x < demi; x++) {
      // Distance au centre : en losange, en ovale ou en croix selon la forme
      const dx = (demi - 0.5 - x) / demi;
      const dy = Math.abs(y - cy) / (cy + 0.5);
      const d = forme < 0.34 ? (dx + dy) * 0.75 : forme < 0.67 ? Math.hypot(dx, dy) : Math.min(dx, dy) * 1.6;
      let h = Math.round((sommet + 0.6) * (1 - d) + (hasard() - 0.5) * 1.2);
      if (hasard() < 0.08) {
        h = 0;
      }
      moitie += String(Math.max(0, Math.min(sommet, h)));
    }
    lignes.push(moitie + [...moitie].reverse().join(""));
  }
  return lignes;
}

function dispositionGeneree(graine) {
  return {
    id: "generee",
    generee: true,
    graine,
    nom: NOMS_GENERES[graine % NOMS_GENERES.length] + " " + String(graine % 1000).padStart(3, "0"),
    places: () => placesDepuisCarte(carteGeneree(graine))
  };
}

// Tire une graine dont la carte compte entre 84 et 144 tuiles et dont la
// distribution des paires reussit : la partie est alors forcement soluble.
function nouvelleGeneree() {
  for (;;) {
    const choix = dispositionGeneree(1 + Math.floor(Math.random() * 999999));
    const n = choix.places().length;
    if (n >= 84 && n <= 144 && distribuer(choix.places()) !== null) {
      return choix;
    }
  }
}

DISPOSITIONS.push({ id: "generee", nom: "Générée", generee: true });

// ---------------------------------------------------------------------
// Etat
// ---------------------------------------------------------------------

let disposition = DISPOSITIONS[0];
let tuiles = [];
let tuileChoisie = null;
let historique = [];
let secondes = 0;
let penalites = 0;
let bonus = 0;
let combo = 0;
let dernierePaire = 0;
let termine = true;
let loupe = false;
let elements = [];

// ---------------------------------------------------------------------
// Regles de liberte
// ---------------------------------------------------------------------

function memeZone(a, b) {
  return Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1;
}

function estRecouverte(tuile, presentes) {
  return presentes.some(autre => autre !== tuile && autre.couche > tuile.couche && memeZone(autre, tuile));
}

function estLibre(tuile, presentes) {
  if (estRecouverte(tuile, presentes)) {
    return false;
  }
  let gauche = false;
  let droite = false;
  for (const autre of presentes) {
    if (autre === tuile || autre.couche !== tuile.couche || Math.abs(autre.y - tuile.y) >= 1) {
      continue;
    }
    if (autre.x < tuile.x && tuile.x - autre.x <= 1.001) {
      gauche = true;
    }
    if (autre.x > tuile.x && autre.x - tuile.x <= 1.001) {
      droite = true;
    }
  }
  return !gauche || !droite;
}

function presentes() {
  return tuiles.filter(tuile => !tuile.retiree);
}

function libres() {
  const p = presentes();
  return p.filter(tuile => estLibre(tuile, p));
}

function formentUnePaire(a, b) {
  return a !== b && a.face.groupe === b.face.groupe;
}

// Le nombre de paires qu'on peut jouer tout de suite
function pairesJouables() {
  const parGroupe = new Map();
  libres().forEach(tuile => parGroupe.set(tuile.face.groupe, (parGroupe.get(tuile.face.groupe) || 0) + 1));
  let total = 0;
  parGroupe.forEach(nombre => { total += Math.floor(nombre / 2); });
  return total;
}

function paireDisponible() {
  const l = libres();
  for (let i = 0; i < l.length; i++) {
    for (let k = i + 1; k < l.length; k++) {
      if (formentUnePaire(l[i], l[k])) {
        return [l[i], l[k]];
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------
// Generation garantie soluble
// ---------------------------------------------------------------------

// Pose les paires a l'envers sur des emplacements libres. Renvoie null
// si la pose bloque 40 fois de suite (jamais vu sur les dispositions
// fixes ; les dispositions generees sont alors simplement retirees).
function distribuer(places) {
  for (let essai = 0; essai < 40; essai++) {
    const provisoires = places.map((place, index) => ({ index, couche: place.couche, x: place.x, y: place.y, face: null, retiree: false }));
    const paires = melanger(toutesLesPaires()).slice(0, places.length / 2);
    let restantes = provisoires.slice();
    let reussi = true;
    while (restantes.length > 0) {
      const l = melanger(restantes.filter(tuile => estLibre(tuile, restantes)));
      if (l.length < 2) {
        reussi = false;
        break;
      }
      const [faceA, faceB] = paires.pop();
      l[0].face = faceA;
      l[1].face = faceB;
      restantes = restantes.filter(tuile => tuile !== l[0] && tuile !== l[1]);
    }
    if (reussi) {
      return provisoires;
    }
  }
  return null;
}

function generer() {
  const places = disposition.places();
  const resultat = distribuer(places);
  if (resultat !== null) {
    return resultat;
  }
  const faces = melanger(toutesLesPaires().flat()).slice(0, places.length);
  return places.map((place, index) => ({ index, couche: place.couche, x: place.x, y: place.y, face: faces[index], retiree: false }));
}

// ---------------------------------------------------------------------
// Sauvegarde et classement
// ---------------------------------------------------------------------

const stockage = creerStockage(CLE_MAHJONG);

// Les dispositions generees n'ont pas de classement en ligne : on garde
// seulement le meilleur temps sur l'appareil.
function idClassement() {
  if (disposition.generee) {
    return null;
  }
  return disposition.id === "tortue" ? "mahjong" : "mahjong-" + disposition.id;
}

const stockageGenerees = creerStockage("tanuki-arcade-mahjong-generees");

function sauver() {
  if (termine) {
    return;
  }
  stockage.ecrire({
    disposition: disposition.id,
    graine: disposition.graine || 0,
    faces: tuiles.map(tuile => tuile.face.id),
    retirees: tuiles.map(tuile => (tuile.retiree ? 1 : 0)),
    secondes,
    penalites,
    bonus
  });
}

function charger() {
  const donnees = stockage.lire();
  if (donnees === null || !Array.isArray(donnees.faces)) {
    return false;
  }
  try {
    const choix = donnees.disposition === "generee" && donnees.graine ? dispositionGeneree(donnees.graine) : DISPOSITIONS.find(d => d.id === donnees.disposition);
    if (!choix || !choix.places) {
      return false;
    }
    const places = choix.places();
    if (places.length !== donnees.faces.length) {
      return false;
    }
    const restaurees = places.map((place, index) => ({
      index, couche: place.couche, x: place.x, y: place.y,
      face: faceParId(donnees.faces[index]),
      retiree: donnees.retirees[index] === 1
    }));
    if (restaurees.some(tuile => tuile.face === null)) {
      return false;
    }
    disposition = choix;
    tuiles = restaurees;
    secondes = donnees.secondes || 0;
    penalites = donnees.penalites || 0;
    bonus = donnees.bonus || 0;
    return true;
  } catch (erreur) {
    return false;
  }
}

// ---------------------------------------------------------------------
// Partie
// ---------------------------------------------------------------------

function nouvellePartie(choix) {
  if (choix) {
    disposition = choix;
  }
  if (disposition.generee) {
    disposition = nouvelleGeneree();
  }
  cacherFin();
  tuiles = generer();
  tuileChoisie = null;
  historique = [];
  secondes = 0;
  penalites = 0;
  bonus = 0;
  combo = 0;
  termine = false;
  stockage.effacer();
  construirePlateau();
  dessiner();
  chrono.lancer();
  afficherMessage(disposition.generee ? "Disposition " + disposition.nom + ", soluble à coup sûr." : "");
  ajuster();
  if (idClassement()) {
    majScoreCourant(idClassement(), tempsTotal());
  }
}

function demarrer() {
  majBoutonSon();
  ajuster();
  if (charger()) {
    tuileChoisie = null;
    historique = [];
    combo = 0;
    termine = false;
    cacherFin();
    construirePlateau();
    dessiner();
    ajuster();
    chrono.lancer();
  } else {
    nouvellePartie();
  }
}

const chrono = creerChrono(function () {
  secondes++;
  majChrono();
  if (secondes % 10 === 0) {
    sauver();
  }
}, () => !termine && jeuAuPremierPlan(ID));

function tempsTotal() {
  return Math.max(0, secondes + penalites - bonus);
}

const formaterTemps = formaterMinutesSecondes;

function majChrono() {
  zoneChrono.textContent = formaterTemps(tempsTotal());
  if (idClassement()) {
    majScoreCourant(idClassement(), tempsTotal());
  }
}

const afficherMessage = creerAfficheur(zoneMessage, {
  delai: 2400,
  peutEffacer: () => !termine
});

function choisirTuile(tuile) {
  if (termine || tuile.retiree) {
    return;
  }
  if (!estLibre(tuile, presentes())) {
    const element = elements[tuile.index];
    element.classList.remove("refus");
    void element.offsetWidth;
    element.classList.add("refus");
    afficherMessage("Cette tuile est bloquée : il faut un côté libre et rien dessus.");
    return;
  }
  if (tuileChoisie === null || tuileChoisie === tuile) {
    tuileChoisie = tuileChoisie === tuile ? null : tuile;
    jouer("clic");
    dessiner();
    return;
  }
  if (formentUnePaire(tuileChoisie, tuile)) {
    retirerPaire(tuileChoisie, tuile);
  } else {
    tuileChoisie = tuile;
    jouer("clic");
    dessiner();
  }
}

function retirerPaire(a, b) {
  const maintenant = performance.now();
  combo = maintenant - dernierePaire < FENETRE_COMBO_MS ? combo + 1 : 1;
  dernierePaire = maintenant;
  // A partir de la troisieme paire enchainee, une seconde de gagnee par
  // paire, deux au-dela de la sixieme
  const gain = combo >= 6 ? 2 : combo >= 3 ? 1 : 0;
  bonus += gain;
  a.retiree = true;
  b.retiree = true;
  historique.push({ paire: [a.index, b.index], gain });
  tuileChoisie = null;
  jouer(combo >= 2 ? "combo" : "bonus", combo);
  // Les deux tuiles se rejoignent a mi-chemin, puis disparaissent
  const ea = elements[a.index];
  const eb = elements[b.index];
  const mx = (ea.offsetLeft + eb.offsetLeft) / 2;
  const my = (ea.offsetTop + eb.offsetTop) / 2;
  [a, b].forEach(tuile => {
    const element = elements[tuile.index];
    element.style.setProperty("--vers-x", (mx - element.offsetLeft) + "px");
    element.style.setProperty("--vers-y", (my - element.offsetTop) + "px");
    element.style.zIndex = String(9000 + Number(element.style.zIndex) % 1000);
    element.classList.add("envol");
    setTimeout(() => {
      element.classList.remove("envol");
      element.style.zIndex = element.dataset.z;
      element.hidden = tuile.retiree;
    }, 480);
  });
  dessiner();
  if (gain > 0) {
    afficherMessage("Combo x" + combo + " : moins " + gain + " s", 1200);
  }
  sauver();
  if (presentes().length === 0) {
    terminer();
  } else if (paireDisponible() === null) {
    afficherMessage("Plus aucune paire jouable : mélange ou annule.", 4000);
  }
}

function annuler() {
  if (termine || historique.length === 0) {
    return;
  }
  const { paire, gain } = historique.pop();
  tuiles[paire[0]].retiree = false;
  tuiles[paire[1]].retiree = false;
  paire.forEach(index => {
    const element = elements[index];
    element.classList.remove("revient");
    void element.offsetWidth;
    element.classList.add("revient");
  });
  bonus -= gain;
  combo = 0;
  tuileChoisie = null;
  jouer("clic");
  dessiner();
  sauver();
}

function donnerIndice() {
  if (termine) {
    return;
  }
  const paire = paireDisponible();
  penalites += PENALITE_INDICE;
  majChrono();
  if (paire === null) {
    afficherMessage("Aucune paire jouable, plus " + PENALITE_INDICE + " s. Mélange.");
    return;
  }
  tuileChoisie = null;
  dessiner();
  paire.forEach(tuile => {
    const element = elements[tuile.index];
    element.classList.remove("indiquee");
    void element.offsetWidth;
    element.classList.add("indiquee");
  });
  afficherMessage("Paire indiquée, plus " + PENALITE_INDICE + " s.");
  sauver();
}

// Redistribue les faces des tuiles en place, en gardant une solution :
// on rejoue la generation a l'envers sur les seules tuiles restantes.
function melangerTuiles() {
  if (termine) {
    return;
  }
  const restantes = presentes();
  const paires = [];
  const parGroupe = new Map();
  restantes.forEach(tuile => {
    const liste = parGroupe.get(tuile.face.groupe) || [];
    liste.push(tuile.face);
    parGroupe.set(tuile.face.groupe, liste);
  });
  parGroupe.forEach(faces => {
    for (let i = 0; i + 1 < faces.length; i += 2) {
      paires.push([faces[i], faces[i + 1]]);
    }
  });
  let reussi = false;
  for (let essai = 0; essai < 30 && !reussi; essai++) {
    const reserve = melanger(paires);
    let reste = restantes.slice();
    reussi = true;
    const attribution = new Map();
    while (reste.length > 0) {
      const l = melanger(reste.filter(tuile => estLibre(tuile, reste)));
      if (l.length < 2) {
        reussi = false;
        break;
      }
      const [faceA, faceB] = reserve.pop();
      attribution.set(l[0], faceA);
      attribution.set(l[1], faceB);
      reste = reste.filter(tuile => tuile !== l[0] && tuile !== l[1]);
    }
    if (reussi) {
      attribution.forEach((face, tuile) => { tuile.face = face; });
    }
  }
  if (!reussi) {
    const faces = melanger(restantes.map(tuile => tuile.face));
    restantes.forEach((tuile, index) => { tuile.face = faces[index]; });
  }
  penalites += PENALITE_MELANGE;
  tuileChoisie = null;
  combo = 0;
  jouer("pouvoir");
  construirePlateau();
  plateau.classList.remove("melange");
  void plateau.offsetWidth;
  plateau.classList.add("melange");
  dessiner();
  afficherMessage("Tuiles mélangées, plus " + PENALITE_MELANGE + " s.");
  sauver();
}

function terminer() {
  termine = true;
  chrono.arreter();
  stockage.effacer();
  jouer("vague");
  afficherMessage("", 0);
  let record = "";
  if (disposition.generee) {
    const meilleurs = stockageGenerees.lire() || {};
    const ancien = meilleurs.temps;
    meilleurs.temps = ancien ? Math.min(ancien, tempsTotal()) : tempsTotal();
    meilleurs.parties = (meilleurs.parties || 0) + 1;
    stockageGenerees.ecrire(meilleurs);
    record = !ancien || tempsTotal() < ancien ? "Meilleur temps sur une disposition générée" : "Meilleur temps : " + formaterTemps(meilleurs.temps);
  }
  montrerFin(record);
  if (!disposition.generee) {
    setTimeout(() => {
      if (!zone.hidden) {
        finDePartie(idClassement(), tempsTotal(), "Mahjong " + disposition.nom);
      }
    }, 1800);
  }
}

// La carte de fin : papier creme, filet vermillon, le detail du temps
const carteFin = document.createElement("div");
carteFin.className = "fin-mahjong";
carteFin.hidden = true;
cadre.appendChild(carteFin);

function montrerFin(record) {
  const lignes = [
    ["Disposition", disposition.nom],
    ["Chrono", formaterTemps(secondes)],
    ["Combos", bonus ? "moins " + bonus + " s" : "aucun"],
    ["Aides", penalites ? "plus " + penalites + " s" : "aucune"]
  ];
  carteFin.innerHTML = '<p class="fin-mahjong-titre">Plateau vidé</p>'
    + '<p class="fin-mahjong-temps">' + formaterTemps(tempsTotal()) + "</p>"
    + "<dl>" + lignes.map(([t, v]) => "<dt>" + t + "</dt><dd>" + v + "</dd>").join("") + "</dl>"
    + (record ? '<p class="fin-mahjong-record">' + record + "</p>" : "")
    + (disposition.generee ? '<button class="jeu-quitter" type="button" data-action="nouvelle">Nouvelle disposition</button>' : "");
  carteFin.hidden = false;
}

function cacherFin() {
  carteFin.hidden = true;
}

carteFin.addEventListener("click", function (evenement) {
  if (evenement.target.closest("[data-action='nouvelle']")) {
    nouvellePartie();
  }
});

// ---------------------------------------------------------------------
// Affichage
// ---------------------------------------------------------------------

function construirePlateau() {
  plateau.innerHTML = "";
  const xs = tuiles.map(t => t.x);
  const ys = tuiles.map(t => t.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const largeur = Math.max(...xs) - minX + 1;
  const hauteur = Math.max(...ys) - minY + 1;
  zone.style.setProperty("--colonnes-plateau", String(largeur));
  zone.style.setProperty("--rangees-plateau", String(hauteur));
  elements = tuiles.map(tuile => {
    const element = document.createElement("button");
    element.type = "button";
    element.className = "tuile-mahjong";
    element.dataset.index = String(tuile.index);
    element.innerHTML = svgFace(tuile.face);
    element.dataset.face = tuile.face.id;
    element.setAttribute("aria-label", tuile.face.nom);
    element.style.left = "calc(" + (tuile.x - minX) + " * var(--largeur-tuile) + " + tuile.couche + " * var(--relief))";
    element.style.top = "calc(" + (tuile.y - minY) + " * var(--hauteur-tuile) - " + tuile.couche + " * var(--relief))";
    element.dataset.z = String(tuile.couche * 1000 + Math.round((tuile.y - minY) * 2) * 20 + Math.round((largeur - (tuile.x - minX)) * 2));
    element.style.zIndex = element.dataset.z;
    element.addEventListener("animationend", function (evenement) {
      if (evenement.animationName !== "mahjong-envol") {
        element.classList.remove("refus", "indiquee", "revient");
      }
    });
    plateau.appendChild(element);
    return element;
  });
}

function dessiner() {
  const p = presentes();
  tuiles.forEach(tuile => {
    const element = elements[tuile.index];
    if (element.dataset.face !== tuile.face.id) {
      element.innerHTML = svgFace(tuile.face);
      element.dataset.face = tuile.face.id;
      element.setAttribute("aria-label", tuile.face.nom);
    }
    element.classList.toggle("libre", !tuile.retiree && estLibre(tuile, p));
    element.classList.toggle("choisie", tuile === tuileChoisie);
    if (!element.classList.contains("envol")) {
      element.hidden = tuile.retiree;
    }
  });
  zoneRestantes.textContent = String(p.length);
  zoneJouables.textContent = String(pairesJouables());
  zoneJouables.parentElement.classList.toggle("alerte", pairesJouables() === 0 && p.length > 0);
  zoneCombo.textContent = "x" + Math.max(1, combo);
  zoneCombo.parentElement.classList.toggle("chaud", combo >= 2);
  boutonAnnuler.disabled = historique.length === 0 || termine;
  for (const bouton of zoneDispositions.children) {
    bouton.classList.toggle("active", bouton.dataset.disposition === disposition.id);
  }
  majChrono();
}

// La taille des tuiles se calcule ici : largeur disponible (moins les
// classements lateraux sur grand ecran) et hauteur au-dessus de la manette.
let colonnesPlateau = 15;
let rangeesPlateau = 8;

function ajuster() {
  if (zone.hidden) {
    return;
  }
  const xs = tuiles.map(t => t.x);
  const ys = tuiles.map(t => t.y);
  if (xs.length > 0) {
    colonnesPlateau = Math.max(...xs) - Math.min(...xs) + 1;
    rangeesPlateau = Math.max(...ys) - Math.min(...ys) + 1;
  }
  const marge = window.innerWidth >= 1100 ? 500 : 0;
  // La place reelle dans la section, ses marges interieures deduites
  const style = getComputedStyle(zone);
  const interieur = zone.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  const largeurDispo = Math.min(document.documentElement.clientWidth - 16 - marge, interieur || Infinity, 1100);
  let autres = 0;
  [...zone.children].forEach(el => {
    if (el !== cadre && !el.hidden && el.offsetParent !== null && !el.classList.contains("jeu-aide")) {
      autres += el.getBoundingClientRect().height + 10;
    }
  });
  const manette = document.querySelector(".manette:not([hidden])");
  const hauteurManette = manette ? manette.getBoundingClientRect().height : 0;
  const hauteurDispo = Math.max(160, window.innerHeight - autres - hauteurManette - 28);
  // Le cadre ajoute son bord de bois (2 x 8 px) et ses marges (2 x 8 px),
  // plus le relief des piles : 0.6 tuile a gauche et en haut
  const fixe = 34;
  const parLargeur = (largeurDispo - fixe) / (colonnesPlateau + 1.08);
  const parHauteur = (hauteurDispo - fixe) / (rangeesPlateau * 1.32 + 0.84);
  const tuile = Math.max(14, Math.floor(Math.min(parLargeur, parHauteur, 64) * 4) / 4);
  zone.style.setProperty("--tuile-base", tuile + "px");
  zone.style.setProperty("--colonnes-plateau", String(colonnesPlateau));
  zone.style.setProperty("--rangees-plateau", String(rangeesPlateau));
  cadre.style.maxWidth = Math.floor(largeurDispo) + "px";
}

window.addEventListener("resize", ajuster);

function majBoutonSon() {
  boutonSon.textContent = sonActif() ? "Son" : "Muet";
  boutonSon.setAttribute("aria-pressed", String(!sonActif()));
}

// ---------------------------------------------------------------------
// Commandes
// ---------------------------------------------------------------------

plateau.addEventListener("click", function (evenement) {
  if (!jeuAuPremierPlan(ID)) {
    return;
  }
  const element = evenement.target.closest(".tuile-mahjong");
  if (element) {
    choisirTuile(tuiles[Number(element.dataset.index)]);
  }
});
plateau.addEventListener("contextmenu", evenement => evenement.preventDefault());

surTouche(ID, function (evenement) {
  const touche = evenement.key.toLowerCase();
  if (touche === "h") {
    donnerIndice();
  } else if (touche === "m") {
    melangerTuiles();
  } else if (touche === "backspace" || touche === "u" || (touche === "z" && (evenement.ctrlKey || evenement.metaKey))) {
    annuler();
  } else if (touche === "n") {
    nouvellePartie();
  } else if (touche === "escape") {
    quitterJeu();
    return;
  } else {
    return;
  }
  evenement.preventDefault();
});

DISPOSITIONS.forEach(entree => {
  const bouton = document.createElement("button");
  bouton.type = "button";
  bouton.className = "jeu-quitter difficulte";
  bouton.dataset.disposition = entree.id;
  bouton.textContent = entree.nom;
  bouton.addEventListener("click", () => nouvellePartie(entree));
  zoneDispositions.appendChild(bouton);
});

boutonIndice.addEventListener("click", donnerIndice);
boutonMelanger.addEventListener("click", melangerTuiles);
boutonAnnuler.addEventListener("click", annuler);
boutonLoupe.addEventListener("click", function () {
  loupe = !loupe;
  zone.classList.toggle("loupe", loupe);
  boutonLoupe.classList.toggle("active", loupe);
  boutonLoupe.setAttribute("aria-pressed", String(loupe));
  // Au zoom, on centre la vue sur le haut du tas
  if (loupe) {
    cadre.scrollTop = 0;
    cadre.scrollLeft = (cadre.scrollWidth - cadre.clientWidth) / 2;
  }
});
boutonSon.addEventListener("click", function () {
  basculerSon();
  majBoutonSon();
});
boutonNouvelle.addEventListener("click", () => nouvellePartie());
boutonQuitter.addEventListener("click", quitterJeu);

enregistrerJeu({
  id: ID,
  nom: "Mahjong",
  code: "144",
  section: zone,
  demarrer,
  arreter: () => chrono.arreter(),
  plusBasEstMieux: true,
  formaterScore: formaterTemps,
  classement: () => idClassement() || "mahjong",
  manette: { a: "h", b: "u", start: "m", select: "n", libelles: { a: "Indice", b: "Annuler" } }
});

export const _test = { distribuer, carteGeneree, dispositionGeneree, placesDepuisCarte, svgFace, TOUTES_LES_FACES, etat: () => ({ tuiles, disposition }), choisirTuile, libres, paireDisponible };
