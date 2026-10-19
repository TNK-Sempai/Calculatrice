// =====================================================================
//  DEMINEUR - les yokai sous les dalles
//  Des dalles de pierre a soulever une a une. Dessous, du papier, des
//  chiffres a l'encre, et parfois un yokai. Les omamori servent de
//  drapeaux : on les pose sur les dalles qu'on soupconne.
//
//  Ce qui change par rapport a la premiere version :
//  - mode sans hasard : la grille est retiree jusqu'a pouvoir etre
//    resolue par la seule logique depuis le premier coup ;
//  - l'ouverture se propage en onde depuis la case jouee ;
//  - la defaite fait eclater le yokai, puis reveille les autres ;
//  - la grille du jour : les memes yokai pour tout le monde, avec une
//    zone de depart deja ouverte, et son propre classement.
//  Le premier clic n'est jamais un yokai et ouvre toujours une zone.
//  Le score est le temps, donc plus il est bas, mieux c'est.
// =====================================================================

import { enregistrerJeu, finDePartie, quitterJeu, majScoreCourant } from "./arcade.js";
import { surTouche, jeuAuPremierPlan } from "./noyau/clavier.js";
import { creerAfficheur } from "./noyau/message.js";
import { creerStockage } from "./noyau/stockage.js";
import { creerChrono } from "./noyau/chrono.js";
import { formaterMinutesSecondes } from "./noyau/outils.js";
import { creerEffets } from "./noyau/effets.js";
import { jouer, basculerSon, sonActif } from "./noyau/son.js";
import { VERMILLON, PAPIER } from "./tanukiland/sprites.js";

const ID = "demineur";
const CLE_DEMINEUR = "tanuki-arcade-demineur";
const CLE_REGLAGES = "tanuki-arcade-demineur-reglages";
const CLE_JOUR_FAIT = "tanuki-arcade-demineur-jour-fait";
const APPUI_LONG_MS = 420;
const TOLERANCE_GLISSEMENT = 10;
const ESSAIS_SANS_HASARD = 400;
const BUDGET_SANS_HASARD_MS = 900;

const DIFFICULTES = [
  { id: "facile", nom: "Facile", lignes: 9, colonnes: 9, mines: 10 },
  { id: "moyen", nom: "Moyen", lignes: 16, colonnes: 16, mines: 40 },
  { id: "difficile", nom: "Difficile", lignes: 16, colonnes: 30, mines: 99 }
];
const JOUR = { id: "jour", nom: "Du jour", lignes: 16, colonnes: 16, mines: 40 };

const AUCUNE = 0;
const DRAPEAU = 1;
const DOUTE = 2;

// ---------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------

const zone = document.getElementById("jeuDemineur");
zone.innerHTML = `
  <div class="jeu-entete entete-demineur">
    <span class="jeu-score score-principal">Temps <strong class="valeur-score" id="chronoDemineur">0:00</strong></span>
    <span class="jeu-score">Yokai <strong id="minesDemineur">10</strong></span>
    <span class="entete-boutons">
      <button class="jeu-quitter" id="drapeauDemineur" type="button" aria-pressed="false">Omamori</button>
      <button class="jeu-quitter" id="hasardDemineur" type="button" aria-pressed="true">Sans hasard</button>
      <button class="jeu-quitter" id="sonDemineur" type="button" aria-pressed="false">Son</button>
      <button class="jeu-quitter" id="nouvelleDemineur" type="button">Nouvelle</button>
      <button class="jeu-quitter" id="quitterDemineur" type="button">Retour</button>
    </span>
  </div>
  <div class="scores-ligne" id="difficultesDemineur" role="group" aria-label="Difficulté"></div>
  <div class="cadre-demineur" id="cadreDemineur">
    <div class="grille-demineur" id="grilleDemineur"></div>
    <canvas class="eclats-demineur" id="eclatsDemineur" aria-hidden="true"></canvas>
    <div class="fin-demineur" id="finDemineur" hidden>
      <strong id="finTitreDemineur"></strong>
      <span id="finTexteDemineur"></span>
      <button class="jeu-quitter" id="finBoutonDemineur" type="button">Nouvelle grille</button>
    </div>
  </div>
  <p class="jeu-message" id="messageDemineur"></p>
  <p class="jeu-aide">Clic pour soulever une dalle, clic droit ou appui long pour poser un omamori, puis un point d'interrogation. Clic sur un chiffre entouré de ses omamori pour ouvrir le reste. Clavier : flèches, Espace, F. N nouvelle grille, Échap quitter.</p>
`;

const grilleHtml = document.getElementById("grilleDemineur");
const cadre = document.getElementById("cadreDemineur");
const canvasEclats = document.getElementById("eclatsDemineur");
const zoneDifficultes = document.getElementById("difficultesDemineur");
const zoneChrono = document.getElementById("chronoDemineur");
const zoneMines = document.getElementById("minesDemineur");
const zoneMessage = document.getElementById("messageDemineur");
const boutonDrapeau = document.getElementById("drapeauDemineur");
const boutonHasard = document.getElementById("hasardDemineur");
const boutonSon = document.getElementById("sonDemineur");
const boutonNouvelle = document.getElementById("nouvelleDemineur");
const boutonQuitter = document.getElementById("quitterDemineur");
const zoneFin = document.getElementById("finDemineur");
const zoneFinTitre = document.getElementById("finTitreDemineur");
const zoneFinTexte = document.getElementById("finTexteDemineur");
const boutonFin = document.getElementById("finBoutonDemineur");

// Bandeau de fin pose sur la grille : il arrive apres l'animation
let chronoFin = null;

function montrerFin(titre, texte, delai, gagne) {
  clearTimeout(chronoFin);
  chronoFin = setTimeout(function () {
    zoneFinTitre.textContent = titre;
    zoneFinTexte.textContent = texte;
    zoneFin.classList.toggle("gagne", gagne === true);
    zoneFin.hidden = false;
  }, delai);
}

function cacherFin() {
  clearTimeout(chronoFin);
  zoneFin.hidden = true;
}

// Taille des dalles : la place restante, manette et classements compris
function ajusterTaille() {
  if (zone.hidden) {
    return;
  }
  const marge = window.innerWidth >= 1100 ? 500 : 0;
  const largeur = Math.min(window.innerWidth * 0.96 - marge, 1000) - 28;
  const manette = document.querySelector(".manette:not([hidden])");
  const hManette = manette ? manette.getBoundingClientRect().height : 0;
  let autres = 0;
  [".entete-demineur", "#difficultesDemineur", "#messageDemineur", ".jeu-aide"].forEach(sel => {
    const el = zone.querySelector(sel);
    if (el && el.offsetParent !== null) {
      autres += el.getBoundingClientRect().height + 10;
    }
  });
  const hauteur = window.innerHeight - autres - hManette - 60;
  const pas = Math.floor(Math.min(largeur / mode.colonnes, hauteur / mode.lignes));
  const taille = Math.max(window.innerWidth < 560 ? 19 : 24, Math.min(48, pas - 2));
  zone.style.setProperty("--case-demineur", taille + "px");
}

window.addEventListener("resize", ajusterTaille);

// ---------------------------------------------------------------------
// Images : les yokai de Tanukiland et l'omamori, en pixels
// ---------------------------------------------------------------------


let images = null;

// Les images sont dessinees en vectoriel a 96 px : nettes a toute taille.
function dessinerImage(dessin) {
  const toile = document.createElement("canvas");
  toile.width = toile.height = 96;
  const c = toile.getContext("2d");
  c.translate(48, 48);
  dessin(c);
  return toile.toDataURL();
}

// Le yokai endormi : une bombe de fonte ronde, meche allumee, masque peint
const MASQUES = [
  // Oni rouge a cornes
  { fond: "#c8372d", sombre: "#7e1d14", trait: "#2a0d09", cornes: "#f3ead6", yeux: "#f2c63a" },
  // Kitsune blanc aux marques vermillon
  { fond: "#f3ead6", sombre: "#b9ae96", trait: "#c8372d", oreilles: true, yeux: "#c8372d" },
  // Kappa vert au bec jaune
  { fond: "#7fa32f", sombre: "#3f5a14", trait: "#1c2a0a", bec: "#e8c547", yeux: "#f3ead6" },
  // Tanuki brun au masque sombre
  { fond: "#9a7552", sombre: "#5a3e26", trait: "#2a1c12", masque: "#3a2a1e", yeux: "#f3ead6" }
];

function dessinerBombe(c, m) {
  c.scale(1.15, 1.15);
  // Ombre au sol
  c.fillStyle = "rgba(40,30,20,0.35)";
  c.beginPath();
  c.ellipse(4, 36, 30, 8, 0, 0, Math.PI * 2);
  c.fill();
  // Corps de fonte
  const g = c.createRadialGradient(-12, -8, 4, 0, 4, 34);
  g.addColorStop(0, "#5a5a66");
  g.addColorStop(1, "#14141a");
  c.fillStyle = g;
  c.beginPath();
  c.arc(0, 6, 30, 0, Math.PI * 2);
  c.fill();
  // Bouchon et meche
  c.fillStyle = "#2a2a32";
  c.fillRect(-7, -30, 14, 9);
  c.strokeStyle = "#8a6a3a";
  c.lineWidth = 3;
  c.lineCap = "round";
  c.beginPath();
  c.moveTo(0, -30);
  c.quadraticCurveTo(8, -42, 18, -38);
  c.stroke();
  // Etincelle : une etoile pleine
  c.fillStyle = "#f2c63a";
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const r = i % 2 ? 3 : 8;
    c.lineTo(20 + Math.cos(a) * r, -40 + Math.sin(a) * r);
  }
  c.closePath();
  c.fill();
  // Masque peint sur la bombe
  c.fillStyle = m.fond;
  c.beginPath();
  c.ellipse(0, 10, 19, 17, 0, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = m.sombre;
  c.lineWidth = 2;
  c.stroke();
  if (m.cornes) {
    c.fillStyle = m.cornes;
    c.beginPath();
    c.moveTo(-13, -2);
    c.lineTo(-10, -14);
    c.lineTo(-6, -4);
    c.moveTo(13, -2);
    c.lineTo(10, -14);
    c.lineTo(6, -4);
    c.fill();
  }
  if (m.oreilles) {
    c.fillStyle = m.fond;
    c.beginPath();
    c.moveTo(-16, 2);
    c.lineTo(-12, -14);
    c.lineTo(-5, -4);
    c.moveTo(16, 2);
    c.lineTo(12, -14);
    c.lineTo(5, -4);
    c.fill();
    c.fillStyle = m.trait;
    c.fillRect(-14, 8, 6, 2);
    c.fillRect(8, 8, 6, 2);
  }
  if (m.masque) {
    c.fillStyle = m.masque;
    c.beginPath();
    c.ellipse(-8, 7, 7, 5, 0.3, 0, Math.PI * 2);
    c.ellipse(8, 7, 7, 5, -0.3, 0, Math.PI * 2);
    c.fill();
  }
  // Yeux fermes : il dort (il se reveille quand on souleve sa dalle)
  c.strokeStyle = m.yeux;
  c.lineWidth = 2.6;
  c.beginPath();
  c.moveTo(-12, 7);
  c.quadraticCurveTo(-8, 10, -4, 7);
  c.moveTo(4, 7);
  c.quadraticCurveTo(8, 10, 12, 7);
  c.stroke();
  if (m.bec) {
    c.fillStyle = m.bec;
    c.beginPath();
    c.ellipse(0, 18, 7, 4, 0, 0, Math.PI * 2);
    c.fill();
  } else {
    c.strokeStyle = m.trait;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-5, 19);
    c.quadraticCurveTo(0, 22, 5, 19);
    c.stroke();
  }
  // Reflet sur la fonte
  c.fillStyle = "rgba(255,255,255,0.28)";
  c.beginPath();
  c.ellipse(-17, -10, 6, 3, -0.7, 0, Math.PI * 2);
  c.fill();
}

function dessinerOmamori(c) {
  c.scale(1.3, 1.3);
  c.fillStyle = "rgba(40,30,20,0.3)";
  c.beginPath();
  c.ellipse(3, 38, 22, 6, 0, 0, Math.PI * 2);
  c.fill();
  // Sachet de soie vermillon, arrondi en haut
  const g = c.createLinearGradient(-22, 0, 22, 0);
  g.addColorStop(0, "#a82b22");
  g.addColorStop(0.45, "#e0574b");
  g.addColorStop(1, "#8f2620");
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(-20, -18);
  c.quadraticCurveTo(-20, -30, -8, -30);
  c.lineTo(8, -30);
  c.quadraticCurveTo(20, -30, 20, -18);
  c.lineTo(22, 26);
  c.quadraticCurveTo(22, 34, 14, 34);
  c.lineTo(-14, 34);
  c.quadraticCurveTo(-22, 34, -22, 26);
  c.closePath();
  c.fill();
  c.strokeStyle = "#6e1a14";
  c.lineWidth = 2;
  c.stroke();
  // Etiquette blanche et sceau
  c.fillStyle = "#f6ead0";
  c.beginPath();
  c.roundRect(-10, -6, 20, 26, 3);
  c.fill();
  c.fillStyle = "#c8372d";
  c.fillRect(-4, 0, 8, 12);
  // Noeud dore
  c.fillStyle = "#e8c547";
  c.beginPath();
  c.ellipse(-7, -32, 8, 5, -0.4, 0, Math.PI * 2);
  c.ellipse(7, -32, 8, 5, 0.4, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#c99a1e";
  c.beginPath();
  c.arc(0, -31, 4, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "rgba(255,255,255,0.3)";
  c.fillRect(-15, -20, 4, 36);
}

function preparerImages() {
  if (images !== null) {
    return images;
  }
  images = {
    yokai: MASQUES.map(m => dessinerImage(c => dessinerBombe(c, m))),
    omamori: dessinerImage(dessinerOmamori)
  };
  zone.style.setProperty("--image-omamori", "url(" + images.omamori + ")");
  return images;
}

// ---------------------------------------------------------------------
// Etat
// ---------------------------------------------------------------------

let mode = DIFFICULTES[0];
let dateDuJour = "";
let mines = [];
let especes = [];           // quel yokai dort sous chaque mine
let voisines = [];
let ouvertes = [];
let marques = [];
let minesPosees = false;
let termine = true;
let perdu = false;
let mineExplosee = null;
let secondes = 0;
let cellules = [];
let curseur = null;
let modeDrapeau = false;
let horsClassement = false;
let depart = null;          // la case de depart de la grille du jour
const stockageReglages = creerStockage(CLE_REGLAGES);
let sansHasard = (stockageReglages.lire() || {}).sansHasard !== false;

// ---------------------------------------------------------------------
// Hasard a graine pour la grille du jour
// ---------------------------------------------------------------------

function creerAlea(graine) {
  let etatAlea = graine >>> 0;
  return function () {
    etatAlea = (etatAlea + 0x6D2B79F5) >>> 0;
    let t = etatAlea;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function graineDeTexte(texte) {
  let h = 2166136261;
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function aujourdhui() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function melangerAvec(liste, alea) {
  const copie = liste.slice();
  for (let i = copie.length - 1; i > 0; i--) {
    const k = Math.floor(alea() * (i + 1));
    [copie[i], copie[k]] = [copie[k], copie[i]];
  }
  return copie;
}

// ---------------------------------------------------------------------
// Grille
// ---------------------------------------------------------------------

function tableau(valeur) {
  return Array.from({ length: mode.lignes }, () => Array(mode.colonnes).fill(valeur));
}

function dansLaGrille(ligne, colonne) {
  return ligne >= 0 && ligne < mode.lignes && colonne >= 0 && colonne < mode.colonnes;
}

function voisinsDe(ligne, colonne) {
  const liste = [];
  for (let dl = -1; dl <= 1; dl++) {
    for (let dc = -1; dc <= 1; dc++) {
      if ((dl !== 0 || dc !== 0) && dansLaGrille(ligne + dl, colonne + dc)) {
        liste.push([ligne + dl, colonne + dc]);
      }
    }
  }
  return liste;
}

function compterVoisines(grilleMines) {
  return grilleMines.map((rangee, ligne) => rangee.map((mine, colonne) => (
    mine ? 0 : voisinsDe(ligne, colonne).filter(([l, c]) => grilleMines[l][c]).length
  )));
}

// Tire une disposition en epargnant la case sure et ses voisines
function tirerMines(ligneSure, colonneSure, alea) {
  const interdites = new Set([ligneSure * mode.colonnes + colonneSure]);
  voisinsDe(ligneSure, colonneSure).forEach(([l, c]) => interdites.add(l * mode.colonnes + c));
  const libres = [];
  for (let l = 0; l < mode.lignes; l++) {
    for (let c = 0; c < mode.colonnes; c++) {
      if (!interdites.has(l * mode.colonnes + c)) {
        libres.push([l, c]);
      }
    }
  }
  const grilleMines = tableau(false);
  melangerAvec(libres, alea).slice(0, mode.mines).forEach(([l, c]) => { grilleMines[l][c] = true; });
  return grilleMines;
}

// ---------------------------------------------------------------------
// Solveur logique : dit si la grille se resout sans jamais deviner.
// Deux regles suffisent pour la plupart des grilles :
// - un chiffre dont toutes les mines sont trouvees libere ses voisines,
//   un chiffre qui a autant de voisines fermees que de mines les marque ;
// - entre deux chiffres, si les voisines de l'un sont incluses dans
//   celles de l'autre, la difference porte la difference des chiffres.
// ---------------------------------------------------------------------

function resolubleSansDeviner(grilleMines, ligneDepart, colonneDepart) {
  const L = mode.lignes;
  const C = mode.colonnes;
  const nombres = compterVoisines(grilleMines);
  const etatCase = Array.from({ length: L }, () => Array(C).fill(0)); // 0 fermee, 1 ouverte, 2 mine connue
  let aOuvrir = 0;
  for (let l = 0; l < L; l++) {
    for (let c = 0; c < C; c++) {
      if (!grilleMines[l][c]) {
        aOuvrir++;
      }
    }
  }
  let ouvertesSolveur = 0;

  function ouvrir(l0, c0) {
    const file = [[l0, c0]];
    while (file.length) {
      const [l, c] = file.pop();
      if (etatCase[l][c] !== 0) {
        continue;
      }
      etatCase[l][c] = 1;
      ouvertesSolveur++;
      if (nombres[l][c] === 0) {
        voisinsDe(l, c).forEach(v => file.push(v));
      }
    }
  }

  ouvrir(ligneDepart, colonneDepart);
  let progres = true;
  while (progres && ouvertesSolveur < aOuvrir) {
    progres = false;
    const frontiere = [];
    for (let l = 0; l < L; l++) {
      for (let c = 0; c < C; c++) {
        if (etatCase[l][c] !== 1 || nombres[l][c] === 0) {
          continue;
        }
        const fermees = [];
        let connues = 0;
        voisinsDe(l, c).forEach(([vl, vc]) => {
          if (etatCase[vl][vc] === 0) {
            fermees.push(vl * C + vc);
          } else if (etatCase[vl][vc] === 2) {
            connues++;
          }
        });
        if (fermees.length === 0) {
          continue;
        }
        const reste = nombres[l][c] - connues;
        if (reste === 0) {
          fermees.forEach(k => ouvrir(Math.floor(k / C), k % C));
          progres = true;
        } else if (reste === fermees.length) {
          fermees.forEach(k => { etatCase[Math.floor(k / C)][k % C] = 2; });
          progres = true;
        } else {
          frontiere.push({ fermees: new Set(fermees), reste });
        }
      }
    }
    if (progres) {
      continue;
    }
    // Regle des sous-ensembles, entre chiffres voisins de la frontiere
    for (let i = 0; i < frontiere.length && !progres; i++) {
      for (let k = 0; k < frontiere.length && !progres; k++) {
        if (i === k) {
          continue;
        }
        const a = frontiere[i];
        const b = frontiere[k];
        if (a.fermees.size >= b.fermees.size) {
          continue;
        }
        let inclus = true;
        for (const x of a.fermees) {
          if (!b.fermees.has(x)) {
            inclus = false;
            break;
          }
        }
        if (!inclus) {
          continue;
        }
        const difference = [...b.fermees].filter(x => !a.fermees.has(x));
        const minesDifference = b.reste - a.reste;
        if (minesDifference === 0) {
          difference.forEach(x => ouvrir(Math.floor(x / C), x % C));
          progres = true;
        } else if (minesDifference === difference.length) {
          difference.forEach(x => { etatCase[Math.floor(x / C)][x % C] = 2; });
          progres = true;
        }
      }
    }
    // Dernier recours : le compte total de mines
    if (!progres) {
      let fermeesTotal = 0;
      let minesConnues = 0;
      for (let l = 0; l < L; l++) {
        for (let c = 0; c < C; c++) {
          if (etatCase[l][c] === 0) {
            fermeesTotal++;
          } else if (etatCase[l][c] === 2) {
            minesConnues++;
          }
        }
      }
      if (mode.mines - minesConnues === 0 && fermeesTotal > 0) {
        for (let l = 0; l < L; l++) {
          for (let c = 0; c < C; c++) {
            if (etatCase[l][c] === 0) {
              ouvrir(l, c);
            }
          }
        }
        progres = true;
      }
    }
  }
  return ouvertesSolveur >= aOuvrir;
}

// Pose les mines autour du premier coup. En mode sans hasard, on tire
// jusqu'a obtenir une grille que la logique seule permet de finir.
function poserMines(ligneSure, colonneSure, alea) {
  const tirage = alea || Math.random;
  let grilleMines = tirerMines(ligneSure, colonneSure, tirage);
  if (sansHasard || mode === JOUR) {
    const debut = performance.now();
    for (let essai = 0; essai < ESSAIS_SANS_HASARD; essai++) {
      if (resolubleSansDeviner(grilleMines, ligneSure, colonneSure)) {
        break;
      }
      if (performance.now() - debut > BUDGET_SANS_HASARD_MS && mode !== JOUR) {
        break;
      }
      grilleMines = tirerMines(ligneSure, colonneSure, tirage);
    }
  }
  mines = grilleMines;
  especes = mines.map(rangee => rangee.map(() => Math.floor(tirage() * 4)));
  voisines = compterVoisines(mines);
  minesPosees = true;
}

// ---------------------------------------------------------------------
// Sauvegarde
// ---------------------------------------------------------------------

const stockage = creerStockage(CLE_DEMINEUR);
const stockageJourFait = creerStockage(CLE_JOUR_FAIT);

function idClassement() {
  return mode === JOUR ? "demineur-jour-" + dateDuJour : "demineur-" + mode.id;
}

function nomClassement() {
  return mode === JOUR ? "Démineur du jour" : "Démineur " + mode.nom;
}

function sauver() {
  if (termine) {
    return;
  }
  stockage.ecrire({
    mode: mode.id,
    date: dateDuJour,
    mines: mines.map(rangee => rangee.map(v => (v ? 1 : 0))),
    especes,
    ouvertes: ouvertes.map(rangee => rangee.map(v => (v ? 1 : 0))),
    marques,
    minesPosees,
    secondes,
    depart
  });
}

function charger() {
  const donnees = stockage.lire();
  if (donnees === null) {
    return false;
  }
  try {
    let choix;
    if (donnees.mode === "jour") {
      if (donnees.date !== aujourdhui()) {
        return false;
      }
      choix = JOUR;
    } else {
      choix = DIFFICULTES.find(d => d.id === (donnees.mode || donnees.difficulte));
    }
    if (!choix) {
      return false;
    }
    const bonnes = t => Array.isArray(t) && t.length === choix.lignes
      && t.every(r => Array.isArray(r) && r.length === choix.colonnes);
    if (!bonnes(donnees.mines) || !bonnes(donnees.ouvertes) || !bonnes(donnees.marques)) {
      return false;
    }
    mode = choix;
    dateDuJour = donnees.date || "";
    mines = donnees.mines.map(r => r.map(v => v === 1));
    especes = bonnes(donnees.especes) ? donnees.especes : mines.map(r => r.map(() => 0));
    ouvertes = donnees.ouvertes.map(r => r.map(v => v === 1));
    marques = donnees.marques.map(r => r.slice());
    minesPosees = donnees.minesPosees === true;
    secondes = donnees.secondes || 0;
    depart = donnees.depart || null;
    voisines = compterVoisines(mines);
    horsClassement = mode === JOUR && stockageJourFait.lire() === dateDuJour;
    return true;
  } catch (erreur) {
    return false;
  }
}

// ---------------------------------------------------------------------
// Partie
// ---------------------------------------------------------------------

function nouvelleGrille(choix) {
  mode = choix;
  mines = tableau(false);
  especes = tableau(0);
  voisines = tableau(0);
  ouvertes = tableau(false);
  marques = tableau(AUCUNE);
  minesPosees = false;
  termine = false;
  perdu = false;
  mineExplosee = null;
  curseur = null;
  secondes = 0;
  depart = null;
  horsClassement = false;
  dateDuJour = "";
  chrono.arreter();
  stockage.effacer();
  arreterEclats();
  cacherFin();
  afficherMessage("");
  construireGrille();
  ajusterTaille();

  if (mode === JOUR) {
    // Grille du jour : les yokai et la zone de depart viennent de la date
    dateDuJour = aujourdhui();
    horsClassement = stockageJourFait.lire() === dateDuJour;
    const alea = creerAlea(graineDeTexte("tanuki-demineur-" + dateDuJour));
    depart = { ligne: Math.floor(alea() * (mode.lignes - 4)) + 2, colonne: Math.floor(alea() * (mode.colonnes - 4)) + 2 };
    afficherMessage("Les dalles du jour se préparent...", 0);
    setTimeout(function () {
      poserMines(depart.ligne, depart.colonne, alea);
      const ordre = ouvrirDepuis(depart.ligne, depart.colonne);
      dessiner();
      animerOnde(ordre);
      chrono.lancer();
      sauver();
      afficherMessage(horsClassement
        ? "Grille du jour déjà réussie : cette partie est hors classement."
        : "La zone de départ est ouverte, le chrono tourne.", 3500);
    }, 30);
  }
  dessiner();
}

function demarrer() {
  preparerImages();
  cacherFin();
  requestAnimationFrame(ajusterTaille);
  majBoutons();
  perdu = false;
  mineExplosee = null;
  curseur = null;
  if (charger()) {
    termine = false;
    afficherMessage("");
    construireGrille();
    ajusterTaille();
    dessiner();
    if (minesPosees) {
      chrono.lancer();
    }
  } else {
    nouvelleGrille(mode);
  }
}

const chrono = creerChrono(function () {
  secondes++;
  majChrono();
  if (secondes % 10 === 0) {
    sauver();
  }
}, () => !termine && jeuAuPremierPlan(ID));

const formaterTemps = formaterMinutesSecondes;

function drapeauxPoses() {
  return marques.flat().filter(m => m === DRAPEAU).length;
}

// ---------------------------------------------------------------------
// Ouverture
// ---------------------------------------------------------------------

// Ouverture en largeur : chaque case recoit sa distance a la case jouee,
// qui sert ensuite a l'onde d'animation.
function ouvrirDepuis(ligneDepart, colonneDepart) {
  const file = [[ligneDepart, colonneDepart, 0]];
  const ordre = [];
  let tete = 0;
  while (tete < file.length) {
    const [ligne, colonne, distance] = file[tete];
    tete++;
    if (ouvertes[ligne][colonne] || marques[ligne][colonne] !== AUCUNE) {
      continue;
    }
    ouvertes[ligne][colonne] = true;
    ordre.push([ligne, colonne, distance]);
    if (voisines[ligne][colonne] === 0) {
      voisinsDe(ligne, colonne).forEach(([l, c]) => {
        if (!ouvertes[l][c] && marques[l][c] === AUCUNE) {
          file.push([l, c, distance + 1]);
        }
      });
    }
  }
  return ordre;
}

// L'onde : chaque case se retourne avec un leger retard selon sa distance.
// Elle montre d'ou part la cascade, sans ralentir le jeu.
function animerOnde(ordre) {
  if (ordre.length < 2) {
    return;
  }
  const pas = Math.max(6, Math.min(22, 360 / Math.max(...ordre.map(o => o[2]), 1)));
  ordre.forEach(([l, c, distance]) => {
    const cellule = cellules[l][c];
    cellule.style.animationDelay = Math.round(distance * pas) + "ms";
    cellule.classList.remove("onde");
    void cellule.offsetWidth;
    cellule.classList.add("onde");
  });
}

function accorderCase(ligne, colonne) {
  const chiffre = voisines[ligne][colonne];
  if (chiffre === 0 || mines[ligne][colonne]) {
    return;
  }
  const voisins = voisinsDe(ligne, colonne);
  if (voisins.filter(([l, c]) => marques[l][c] === DRAPEAU).length !== chiffre) {
    return;
  }
  const aOuvrir = voisins.filter(([l, c]) => !ouvertes[l][c] && marques[l][c] === AUCUNE);
  if (aOuvrir.length === 0) {
    return;
  }
  const ratee = aOuvrir.find(([l, c]) => mines[l][c]);
  if (ratee !== undefined) {
    perdre(ratee[0], ratee[1]);
    return;
  }
  const ordre = [];
  aOuvrir.forEach(([l, c]) => ordre.push(...ouvrirDepuis(l, c)));
  jouer("grain");
  apresCoup(ordre);
}

function jouerCase(ligne, colonne) {
  if (termine) {
    return;
  }
  if (modeDrapeau && !ouvertes[ligne][colonne]) {
    marquerCase(ligne, colonne);
    return;
  }
  if (ouvertes[ligne][colonne]) {
    accorderCase(ligne, colonne);
    return;
  }
  if (marques[ligne][colonne] !== AUCUNE) {
    return;
  }
  if (!minesPosees) {
    poserMines(ligne, colonne);
    chrono.lancer();
  }
  if (mines[ligne][colonne]) {
    perdre(ligne, colonne);
    return;
  }
  const ordre = ouvrirDepuis(ligne, colonne);
  jouer(ordre.length > 1 ? "croque" : "grain");
  apresCoup(ordre);
}

function marquerCase(ligne, colonne) {
  if (termine || ouvertes[ligne][colonne]) {
    return;
  }
  marques[ligne][colonne] = (marques[ligne][colonne] + 1) % 3;
  jouer("clic");
  dessiner();
  const cellule = cellules[ligne][colonne];
  if (marques[ligne][colonne] === DRAPEAU) {
    cellule.classList.remove("pose");
    void cellule.offsetWidth;
    cellule.classList.add("pose");
  }
  sauver();
}

function toutesLesCasesSuresOuvertes() {
  for (let l = 0; l < mode.lignes; l++) {
    for (let c = 0; c < mode.colonnes; c++) {
      if (!mines[l][c] && !ouvertes[l][c]) {
        return false;
      }
    }
  }
  return true;
}

function apresCoup(ordre) {
  if (toutesLesCasesSuresOuvertes()) {
    dessiner();
    animerOnde(ordre || []);
    gagner();
    return;
  }
  dessiner();
  animerOnde(ordre || []);
  sauver();
}

function gagner() {
  termine = true;
  perdu = false;
  chrono.arreter();
  stockage.effacer();
  for (let l = 0; l < mode.lignes; l++) {
    for (let c = 0; c < mode.colonnes; c++) {
      if (mines[l][c]) {
        marques[l][c] = DRAPEAU;
      }
    }
  }
  jouer("vague");
  dessiner();
  // Chaque yokai recoit son omamori, en onde depuis le centre
  const centreL = (mode.lignes - 1) / 2;
  const centreC = (mode.colonnes - 1) / 2;
  for (let l = 0; l < mode.lignes; l++) {
    for (let c = 0; c < mode.colonnes; c++) {
      if (mines[l][c]) {
        const cellule = cellules[l][c];
        cellule.style.animationDelay = Math.round(Math.hypot(l - centreL, c - centreC) * 45) + "ms";
        cellule.classList.remove("pose");
        void cellule.offsetWidth;
        cellule.classList.add("pose");
      }
    }
  }
  afficherMessage("Tous les yokai sont scellés en " + formaterTemps(secondes) + (horsClassement ? ". Hors classement." : "."), 0);
  montrerFin("Jardin apaisé", mode.nom + " en " + formaterTemps(secondes) + (horsClassement ? ", hors classement" : ""), 650, true);
  if (horsClassement) {
    return;
  }
  if (mode === JOUR) {
    stockageJourFait.ecrire(dateDuJour);
  }
  setTimeout(() => {
    if (!zone.hidden) {
      finDePartie(idClassement(), secondes, nomClassement());
    }
  }, 2400);
}

// Une partie perdue n'entre pas au classement
function perdre(ligne, colonne) {
  termine = true;
  perdu = true;
  mineExplosee = { ligne, colonne };
  ouvertes[ligne][colonne] = true;
  chrono.arreter();
  stockage.effacer();
  dessiner();
  exploser(ligne, colonne);
  afficherMessage("Un yokai s'est réveillé. N pour une nouvelle grille.", 0);
  montrerFin("Un yōkai s'est réveillé", "Après " + formaterTemps(secondes) + ". Les autres dormaient ici.", 1400, false);
}

const afficherMessage = creerAfficheur(zoneMessage, {
  delai: 2600,
  peutEffacer: () => !termine
});

// ---------------------------------------------------------------------
// Eclats : un petit canvas pose sur la grille, actif le temps de l'effet
// ---------------------------------------------------------------------

const effets = creerEffets();
let boucleEclats = null;

function arreterEclats() {
  cancelAnimationFrame(boucleEclats);
  boucleEclats = null;
  effets.vider();
  const ctx = canvasEclats.getContext("2d");
  ctx.clearRect(0, 0, canvasEclats.width, canvasEclats.height);
  canvasEclats.style.display = "none";
}

function exploser(ligne, colonne) {
  const rectGrille = grilleHtml.getBoundingClientRect();
  canvasEclats.width = Math.ceil(rectGrille.width);
  canvasEclats.height = Math.ceil(rectGrille.height);
  canvasEclats.style.width = rectGrille.width + "px";
  canvasEclats.style.height = rectGrille.height + "px";
  canvasEclats.style.left = (grilleHtml.offsetLeft) + "px";
  canvasEclats.style.top = (grilleHtml.offsetTop) + "px";
  canvasEclats.style.display = "block";
  const rectCase = cellules[ligne][colonne].getBoundingClientRect();
  const x = rectCase.left - rectGrille.left + rectCase.width / 2;
  const y = rectCase.top - rectGrille.top + rectCase.height / 2;
  effets.eclater(x, y, [VERMILLON, "#8f2620", "#e8c547", PAPIER], 34, 220);
  effets.secouer(6, 0.45);
  jouer("grosseExplosion");

  // Les autres yokai se reveillent en onde depuis l'explosion
  for (let l = 0; l < mode.lignes; l++) {
    for (let c = 0; c < mode.colonnes; c++) {
      if (mines[l][c] && marques[l][c] !== DRAPEAU && (l !== ligne || c !== colonne)) {
        const cellule = cellules[l][c];
        const distance = Math.hypot(l - ligne, c - colonne);
        cellule.style.animationDelay = Math.round(180 + distance * 40) + "ms";
        cellule.classList.add("reveil");
      }
    }
  }

  const ctx = canvasEclats.getContext("2d");
  let precedent = performance.now();
  const debut = precedent;
  function image(maintenant) {
    const delta = Math.min(0.05, (maintenant - precedent) / 1000);
    precedent = maintenant;
    effets.maj(delta);
    const d = effets.decalage();
    cadre.style.transform = d.x || d.y ? "translate(" + d.x + "px," + d.y + "px)" : "";
    ctx.clearRect(0, 0, canvasEclats.width, canvasEclats.height);
    effets.dessiner(ctx);
    if (maintenant - debut < 1600) {
      boucleEclats = requestAnimationFrame(image);
    } else {
      cadre.style.transform = "";
      arreterEclats();
    }
  }
  boucleEclats = requestAnimationFrame(image);
}

// ---------------------------------------------------------------------
// Affichage
// ---------------------------------------------------------------------

function construireGrille() {
  grilleHtml.innerHTML = "";
  cellules = [];
  zone.style.setProperty("--colonnes", String(mode.colonnes));
  zone.style.setProperty("--lignes", String(mode.lignes));
  for (let ligne = 0; ligne < mode.lignes; ligne++) {
    const rangee = [];
    for (let colonne = 0; colonne < mode.colonnes; colonne++) {
      const cellule = document.createElement("div");
      cellule.className = "case-demineur";
      // Pierre plus chaude ou plus froide, tiree au hasard mais fixe par case
      const teinte = ((ligne * 73856093) ^ (colonne * 19349663)) >>> 0;
      cellule.dataset.pierre = String(teinte % 7 < 2 ? "chaude" : teinte % 7 === 2 ? "sombre" : "");
      cellule.dataset.ligne = String(ligne);
      cellule.dataset.colonne = String(colonne);
      cellule.addEventListener("animationend", function (evenement) {
        if (evenement.animationName === "demineur-onde" || evenement.animationName === "demineur-pose") {
          cellule.classList.remove("onde", "pose");
          cellule.style.animationDelay = "";
        }
      });
      grilleHtml.appendChild(cellule);
      rangee.push(cellule);
    }
    cellules.push(rangee);
  }
}

function dessiner() {
  const imgs = preparerImages();
  for (let ligne = 0; ligne < mode.lignes; ligne++) {
    for (let colonne = 0; colonne < mode.colonnes; colonne++) {
      const cellule = cellules[ligne][colonne];
      const marque = marques[ligne][colonne];
      const garder = ["onde", "pose", "reveil"].filter(c => cellule.classList.contains(c));
      cellule.className = "case-demineur " + garder.join(" ");
      cellule.textContent = "";
      cellule.style.backgroundImage = "";

      if (ouvertes[ligne][colonne]) {
        cellule.classList.add("ouverte");
        if (mines[ligne][colonne]) {
          cellule.classList.add("mine");
          cellule.style.backgroundImage = "url(" + imgs.yokai[especes[ligne][colonne] || 0] + ")";
          if (mineExplosee !== null && mineExplosee.ligne === ligne && mineExplosee.colonne === colonne) {
            cellule.classList.add("explosee");
          }
        } else if (voisines[ligne][colonne] > 0) {
          cellule.textContent = String(voisines[ligne][colonne]);
          cellule.classList.add("chiffre-" + voisines[ligne][colonne]);
        }
        if (depart !== null && depart.ligne === ligne && depart.colonne === colonne) {
          cellule.classList.add("depart");
        }
      } else if (perdu && mines[ligne][colonne] && marque !== DRAPEAU) {
        cellule.classList.add("ouverte", "mine");
        cellule.style.backgroundImage = "url(" + imgs.yokai[especes[ligne][colonne] || 0] + ")";
      } else if (marque === DRAPEAU) {
        cellule.classList.add("drapeau");
        if (perdu && !mines[ligne][colonne]) {
          cellule.classList.add("faux-drapeau");
        }
      } else if (marque === DOUTE) {
        cellule.classList.add("doute");
        cellule.textContent = "?";
      }
      if (curseur !== null && curseur.ligne === ligne && curseur.colonne === colonne) {
        cellule.classList.add("curseur");
      }
    }
  }
  zoneMines.textContent = String(mode.mines - drapeauxPoses());
  majChrono();
  for (const bouton of zoneDifficultes.children) {
    bouton.classList.toggle("active", bouton.dataset.mode === mode.id);
  }
  boutonDrapeau.classList.toggle("active", modeDrapeau);
  boutonDrapeau.setAttribute("aria-pressed", String(modeDrapeau));
}

function majChrono() {
  zoneChrono.textContent = formaterTemps(secondes);
  majScoreCourant(idClassement(), secondes);
}

function majBoutons() {
  boutonSon.textContent = sonActif() ? "Son" : "Muet";
  boutonSon.setAttribute("aria-pressed", String(!sonActif()));
  boutonHasard.textContent = sansHasard ? "Sans hasard" : "Avec hasard";
  boutonHasard.classList.toggle("active", sansHasard);
  boutonHasard.setAttribute("aria-pressed", String(sansHasard));
}

// ---------------------------------------------------------------------
// Commandes
// ---------------------------------------------------------------------

function caseVisee(evenement) {
  const cellule = evenement.target.closest(".case-demineur");
  if (!cellule) {
    return null;
  }
  return { ligne: Number(cellule.dataset.ligne), colonne: Number(cellule.dataset.colonne) };
}

function jouable() {
  return jeuAuPremierPlan(ID) && !termine;
}

grilleHtml.addEventListener("click", function (evenement) {
  if (appuiLongDeclenche) {
    appuiLongDeclenche = false;
    return;
  }
  if (!jouable()) {
    return;
  }
  const visee = caseVisee(evenement);
  if (visee !== null) {
    curseur = null;
    jouerCase(visee.ligne, visee.colonne);
  }
});

grilleHtml.addEventListener("contextmenu", function (evenement) {
  evenement.preventDefault();
  if (!jouable()) {
    return;
  }
  const visee = caseVisee(evenement);
  if (visee !== null) {
    marquerCase(visee.ligne, visee.colonne);
  }
});

// Tactile : un appui long pose un omamori, un glissement fait defiler
let chronoAppui = null;
let appuiLongDeclenche = false;
let departAppui = null;

grilleHtml.addEventListener("touchstart", function (evenement) {
  appuiLongDeclenche = false;
  if (!jouable()) {
    return;
  }
  const visee = caseVisee(evenement);
  if (visee === null) {
    return;
  }
  const contact = evenement.touches[0];
  departAppui = { x: contact.clientX, y: contact.clientY };
  clearTimeout(chronoAppui);
  chronoAppui = setTimeout(function () {
    appuiLongDeclenche = true;
    departAppui = null;
    marquerCase(visee.ligne, visee.colonne);
    if (navigator.vibrate) {
      navigator.vibrate(15);
    }
  }, APPUI_LONG_MS);
}, { passive: true });

grilleHtml.addEventListener("touchmove", function (evenement) {
  if (departAppui === null) {
    return;
  }
  const contact = evenement.touches[0];
  if (Math.abs(contact.clientX - departAppui.x) > TOLERANCE_GLISSEMENT
    || Math.abs(contact.clientY - departAppui.y) > TOLERANCE_GLISSEMENT) {
    clearTimeout(chronoAppui);
    departAppui = null;
  }
}, { passive: true });

grilleHtml.addEventListener("touchend", function () {
  clearTimeout(chronoAppui);
  departAppui = null;
}, { passive: true });

function deplacerCurseur(dl, dc) {
  if (curseur === null) {
    curseur = { ligne: Math.floor(mode.lignes / 2), colonne: Math.floor(mode.colonnes / 2) };
  } else {
    curseur = {
      ligne: (curseur.ligne + dl + mode.lignes) % mode.lignes,
      colonne: (curseur.colonne + dc + mode.colonnes) % mode.colonnes
    };
  }
  dessiner();
}

surTouche(ID, function (evenement) {
  const touche = evenement.key.toLowerCase();
  if (touche === "escape") {
    quitterJeu();
    return;
  }
  if (touche === "n") {
    nouvelleGrille(mode);
    evenement.preventDefault();
    return;
  }
  if (touche === "m") {
    basculerSon();
    majBoutons();
    evenement.preventDefault();
    return;
  }
  if (termine) {
    return;
  }
  if (touche === "arrowup" || touche === "z") {
    deplacerCurseur(-1, 0);
  } else if (touche === "arrowdown" || touche === "s") {
    deplacerCurseur(1, 0);
  } else if (touche === "arrowleft" || touche === "q") {
    deplacerCurseur(0, -1);
  } else if (touche === "arrowright" || touche === "d") {
    deplacerCurseur(0, 1);
  } else if (touche === " " || touche === "enter") {
    if (curseur !== null) {
      jouerCase(curseur.ligne, curseur.colonne);
    }
  } else if (touche === "f") {
    if (curseur !== null) {
      marquerCase(curseur.ligne, curseur.colonne);
    }
  } else {
    return;
  }
  evenement.preventDefault();
});

DIFFICULTES.concat([JOUR]).forEach(entree => {
  const bouton = document.createElement("button");
  bouton.type = "button";
  bouton.className = "jeu-quitter difficulte" + (entree === JOUR ? " mode-jour" : "");
  bouton.dataset.mode = entree.id;
  bouton.textContent = entree.nom;
  bouton.addEventListener("click", () => nouvelleGrille(entree));
  zoneDifficultes.appendChild(bouton);
});

boutonDrapeau.addEventListener("click", function () {
  modeDrapeau = !modeDrapeau;
  dessiner();
});
boutonHasard.addEventListener("click", function () {
  sansHasard = !sansHasard;
  stockageReglages.ecrire({ sansHasard });
  majBoutons();
  afficherMessage(sansHasard
    ? "Sans hasard : les prochaines grilles se résolvent par la logique seule."
    : "Avec hasard : il faudra parfois deviner, comme à l'origine.");
});
boutonSon.addEventListener("click", function () {
  basculerSon();
  majBoutons();
});
boutonNouvelle.addEventListener("click", () => nouvelleGrille(mode));
boutonFin.addEventListener("click", () => nouvelleGrille(mode));
boutonQuitter.addEventListener("click", quitterJeu);

enregistrerJeu({
  id: ID,
  nom: "Démineur",
  code: "1962",
  section: zone,
  demarrer,
  arreter: () => {
    chrono.arreter();
    arreterEclats();
    clearTimeout(chronoFin);
  },
  plusBasEstMieux: true,
  formaterScore: formaterTemps,
  classement: idClassement,
  manette: { a: " ", b: "f", start: "n", libelles: { a: "Ouvrir", b: "Omamori" } }
});
