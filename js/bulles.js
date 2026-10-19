// =====================================================================
//  BUBBLE SHOOTER
//  Le tanuki du sanctuaire tire des bulles avec son canon de bambou.
//  Trois bulles de meme couleur se touchent : elles eclatent, et tout ce
//  qui ne tient plus au plafond tombe. Niveaux sans fin (vider le
//  plateau, decrocher des lanternes, faire un score) avec carte a
//  etoiles, et mode sans fin ou de nouvelles rangees arrivent par le haut.
//  Le classement en ligne retient le score du mode sans fin : une partie,
//  un score, comme sur une borne.
//  Les regles vivent dans bulles/moteur.js.
// =====================================================================

import { enregistrerJeu, finDePartie, quitterJeu, majScoreCourant } from "./arcade.js";
import { creerBoucle } from "./noyau/boucle.js";
import { surTouche, jeuAuPremierPlan } from "./noyau/clavier.js";
import { creerStockage } from "./noyau/stockage.js";
import { jouer as son, basculerSon, sonActif } from "./noyau/son.js";
import * as M from "./bulles/moteur.js";

const ID = "bulles";
const W = 480;
const H = 780;
const D = 46;                       // diametre d'une bulle a l'ecran
const PLATEAU = { x: (W - M.COLS * D) / 2, y: 118 };
const VITESSE_TIR = 24;             // bulles par seconde
const VITESSE_VISEE = 1.6;          // radians par seconde au clavier

const COULEURS = [
  { claire: "#ffb0a4", base: "#e0412f", sombre: "#7e1a10", nom: "rouge" },
  { claire: "#fff3a8", base: "#f2b919", sombre: "#8a5d06", nom: "jaune" },
  { claire: "#d9f78e", base: "#6fb52a", sombre: "#2f5a0c", nom: "vert" },
  { claire: "#b6e6ff", base: "#2f8fd8", sombre: "#123f6e", nom: "bleu" },
  { claire: "#e3ccff", base: "#8a55e0", sombre: "#3f1f78", nom: "violet" },
  { claire: "#ffd3e6", base: "#ee5f9f", sombre: "#842452", nom: "rose" }
];

// ---------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------

const zone = document.createElement("section");
zone.className = "jeu jeu-bulles";
zone.id = "jeuBulles";
zone.hidden = true;
zone.innerHTML = `
  <div class="jeu-entete entete-bulles">
    <span class="bulles-boutons">
      <button class="jeu-quitter" id="carteBulles" type="button">Carte</button>
      <button class="jeu-quitter" id="sansFinBulles" type="button">Sans fin</button>
      <button class="jeu-quitter" id="classementBulles" type="button">Classement</button>
      <button class="jeu-quitter" id="sonBulles" type="button">Son</button>
      <button class="jeu-quitter" id="quitterBulles" type="button">Retour</button>
    </span>
  </div>
  <canvas id="canvasBulles"></canvas>
  <p class="jeu-aide">Vise en glissant le doigt ou avec la souris, relâche ou clique pour tirer. Au clavier : Gauche et Droite pour viser, Espace pour tirer, Bas pour échanger avec la bulle suivante (ou touche-la). Trois bulles de la même couleur éclatent, tout ce qui ne tient plus au plafond tombe. Grosse chute : une bombe. Gros éclat : une bulle arc-en-ciel. M son, Échap quitter.</p>`;
document.body.appendChild(zone);

const canvas = zone.querySelector("#canvasBulles");
const ctx = canvas.getContext("2d");
const boutonCarte = zone.querySelector("#carteBulles");
const boutonSansFin = zone.querySelector("#sansFinBulles");
const boutonClassement = zone.querySelector("#classementBulles");
const boutonSon = zone.querySelector("#sonBulles");
const boutonQuitter = zone.querySelector("#quitterBulles");

// ---------------------------------------------------------------------
// Progression
// ---------------------------------------------------------------------

const stockage = creerStockage("tanuki-arcade-bulles");
let progres = lireProgres();

function lireProgres() {
  return Object.assign({ max: 1, etoiles: {}, meilleurs: {}, recordSansFin: 0 }, stockage.lire() || {});
}

function sauver() {
  stockage.ecrire(progres);
}

function totalEtoiles() {
  return Object.values(progres.etoiles).reduce((a, b) => a + b, 0);
}

// ---------------------------------------------------------------------
// Etat de l'ecran
// ---------------------------------------------------------------------

let echelle = 1;
let fond = null;
let cache = new Map();
let ecranActuel = "carte";          // carte | intro | jeu | resultat
let niveau = null;
let partie = null;
let angle = 0;
let visee = null;                   // trajectoire calculee pour l'angle courant
let vol = null;                     // bulle en vol
let instantane = null;              // le plateau tel qu'avant le tir, pendant le vol
let decalageGrille = 0;             // animation de descente du plateau (en pixels)
let plafondBouge = false;           // la poutre suit la descente (pas l'arrivee d'une rangee)
let eclats = [];
let chutes = [];
let textes = [];
let secousse = 0;
let resultat = null;
let carteDefil = 0;
let carteChoix = 1;
let boutonsFenetre = [];
let temps = 0;
let scoreAffiche = 0;
const touches = new Set();
let pointeurActif = null;

// ---------------------------------------------------------------------
// Bulles dessinees, mises en cache a la resolution de l'ecran
// ---------------------------------------------------------------------

function degradeBulle(c, r, couleur) {
  const g = c.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.08, 0, 0, r * 1.1);
  g.addColorStop(0, couleur.claire);
  g.addColorStop(0.5, couleur.base);
  g.addColorStop(1, couleur.sombre);
  return g;
}

function reflet(c, r) {
  c.fillStyle = "rgba(255,255,255,0.55)";
  c.beginPath();
  c.ellipse(-r * 0.32, -r * 0.42, r * 0.42, r * 0.24, -0.6, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "rgba(255,255,255,0.9)";
  c.beginPath();
  c.ellipse(-r * 0.42, -r * 0.5, r * 0.13, r * 0.08, -0.6, 0, Math.PI * 2);
  c.fill();
}

// Un petit embleme par couleur : on reconnait les bulles sans les couleurs
function embleme(c, i, r) {
  c.fillStyle = "rgba(255,255,255,0.32)";
  c.strokeStyle = "rgba(255,255,255,0.32)";
  c.lineWidth = r * 0.12;
  const s = r * 0.32;
  c.beginPath();
  if (i === 0) {
    c.arc(0, r * 0.12, s, 0, Math.PI * 2);
  } else if (i === 1) {
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + k * Math.PI / 5;
      const rr = k % 2 ? s * 0.45 : s;
      c.lineTo(Math.cos(a) * rr, r * 0.12 + Math.sin(a) * rr);
    }
    c.closePath();
  } else if (i === 2) {
    c.moveTo(0, r * 0.12 - s);
    c.lineTo(s, r * 0.12 + s * 0.8);
    c.lineTo(-s, r * 0.12 + s * 0.8);
    c.closePath();
  } else if (i === 3) {
    c.moveTo(0, r * 0.12 - s);
    c.lineTo(s, r * 0.12);
    c.lineTo(0, r * 0.12 + s);
    c.lineTo(-s, r * 0.12);
    c.closePath();
  } else if (i === 4) {
    c.rect(-s * 0.8, r * 0.12 - s * 0.8, s * 1.6, s * 1.6);
  } else {
    c.moveTo(0, r * 0.12 + s);
    c.bezierCurveTo(-s * 1.5, r * 0.12 - s * 0.2, -s * 0.6, r * 0.12 - s * 1.3, 0, r * 0.12 - s * 0.4);
    c.bezierCurveTo(s * 0.6, r * 0.12 - s * 1.3, s * 1.5, r * 0.12 - s * 0.2, 0, r * 0.12 + s);
  }
  c.fill();
}

function dessinerBulleBrute(c, type, couleur, r) {
  // Ombre sous la bulle
  c.fillStyle = "rgba(0,0,0,0.28)";
  c.beginPath();
  c.ellipse(r * 0.08, r * 0.14, r, r, 0, 0, Math.PI * 2);
  c.fill();
  if (type === M.PIERRE) {
    c.fillStyle = degradeBulle(c, r, { claire: "#d6d0c4", base: "#8d877b", sombre: "#47433c" });
    c.beginPath();
    c.moveTo(-r, r * 0.1);
    c.quadraticCurveTo(-r * 0.95, -r * 0.85, -r * 0.1, -r * 0.98);
    c.quadraticCurveTo(r * 0.95, -r * 0.9, r, r * 0.05);
    c.quadraticCurveTo(r * 0.92, r * 0.95, 0, r);
    c.quadraticCurveTo(-r * 0.9, r * 0.95, -r, r * 0.1);
    c.fill();
    c.fillStyle = "#6f9a3a";
    c.beginPath();
    c.ellipse(-r * 0.25, -r * 0.72, r * 0.5, r * 0.2, -0.2, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "rgba(40,36,30,0.6)";
    c.lineWidth = r * 0.07;
    c.beginPath();
    c.moveTo(-r * 0.1, -r * 0.3);
    c.lineTo(r * 0.15, r * 0.1);
    c.lineTo(-r * 0.05, r * 0.5);
    c.stroke();
    return;
  }
  if (type === M.LANTERNE) {
    c.fillStyle = degradeBulle(c, r, { claire: "#ffe0b0", base: "#f08a24", sombre: "#8e3e08" });
    c.beginPath();
    c.ellipse(0, 0, r * 0.86, r, 0, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "rgba(110,40,6,0.45)";
    c.lineWidth = 1;
    [0.3, 0.62].forEach(k => {
      c.beginPath();
      c.ellipse(0, 0, r * 0.86 * k, r, 0, 0, Math.PI * 2);
      c.stroke();
    });
    c.fillStyle = "#2a1a12";
    c.fillRect(-r * 0.5, -r * 1.02, r, r * 0.2);
    c.fillRect(-r * 0.5, r * 0.82, r, r * 0.2);
    c.fillStyle = "#c8261a";
    c.font = "700 " + Math.round(r * 0.9) + "px 'Shippori Mincho B1', serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("灯", 0, r * 0.05);
    reflet(c, r);
    return;
  }
  if (type === M.BOMBE) {
    c.fillStyle = degradeBulle(c, r, { claire: "#6b6f7e", base: "#2a2c36", sombre: "#0b0b10" });
    c.beginPath();
    c.arc(0, r * 0.08, r * 0.92, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#8a7a5a";
    c.fillRect(-r * 0.22, -r * 0.98, r * 0.44, r * 0.26);
    c.strokeStyle = "#c9a35a";
    c.lineWidth = r * 0.1;
    c.beginPath();
    c.moveTo(0, -r * 0.98);
    c.quadraticCurveTo(r * 0.3, -r * 1.3, r * 0.5, -r * 1.05);
    c.stroke();
    c.fillStyle = "#ffd23a";
    c.beginPath();
    c.arc(r * 0.52, -r * 1.05, r * 0.16, 0, Math.PI * 2);
    c.fill();
    reflet(c, r);
    return;
  }
  if (type === M.ARC) {
    COULEURS.forEach((col, i) => {
      c.fillStyle = col.base;
      c.beginPath();
      c.moveTo(0, 0);
      c.arc(0, 0, r, -Math.PI / 2 + i * Math.PI / 3, -Math.PI / 2 + (i + 1) * Math.PI / 3);
      c.closePath();
      c.fill();
    });
    c.fillStyle = "#fbf1de";
    c.beginPath();
    c.arc(0, 0, r * 0.38, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "rgba(0,0,0,0.3)";
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(0, 0, r, 0, Math.PI * 2);
    c.stroke();
    reflet(c, r);
    return;
  }
  const col = COULEURS[couleur] || COULEURS[0];
  c.fillStyle = degradeBulle(c, r, col);
  c.beginPath();
  c.arc(0, 0, r, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = col.sombre;
  c.lineWidth = 1.5;
  c.stroke();
  embleme(c, couleur, r);
  reflet(c, r);
}

function sprite(type, couleur) {
  const cle = type + "|" + couleur;
  if (cache.has(cle)) {
    return cache.get(cle);
  }
  const taille = Math.ceil(D * 1.4 * echelle);
  const off = document.createElement("canvas");
  off.width = off.height = taille;
  const c = off.getContext("2d");
  c.setTransform(echelle, 0, 0, echelle, taille / 2, taille / 2);
  dessinerBulleBrute(c, type, couleur, D / 2 - 1);
  cache.set(cle, off);
  return off;
}

function dessinerBulle(type, couleur, x, y, ech, alpha) {
  const img = sprite(type, couleur);
  const t = D * 1.4 * (ech || 1);
  ctx.globalAlpha = alpha === undefined ? 1 : alpha;
  ctx.drawImage(img, x - t / 2, y - t / 2, t, t);
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------
// Decor
// ---------------------------------------------------------------------

function peindreFond() {
  const off = document.createElement("canvas");
  off.width = Math.round(W * echelle);
  off.height = Math.round(H * echelle);
  const c = off.getContext("2d");
  c.setTransform(echelle, 0, 0, echelle, 0, 0);
  const ciel = c.createLinearGradient(0, 0, 0, H);
  ciel.addColorStop(0, "#1f2b5c");
  ciel.addColorStop(0.45, "#3d4c8a");
  ciel.addColorStop(0.75, "#7f8fc4");
  ciel.addColorStop(1, "#c6c7e4");
  c.fillStyle = ciel;
  c.fillRect(0, 0, W, H);
  // Montagnes
  [["#47548e", 0.62, 90], ["#35407a", 0.72, 60], ["#262f5f", 0.84, 40]].forEach(([coul, base, amp], k) => {
    c.fillStyle = coul;
    c.beginPath();
    c.moveTo(0, H);
    for (let x = 0; x <= W; x += 16) {
      c.lineTo(x, H * base - Math.abs(Math.sin(x * 0.012 + k * 2)) * amp);
    }
    c.lineTo(W, H);
    c.closePath();
    c.fill();
  });
  // Bambous de chaque cote, en silhouette
  [[18, 0], [40, 1], [452, 2], [470, 3]].forEach(([x, k]) => {
    c.fillStyle = k % 2 ? "#1b2a2a" : "#223535";
    c.fillRect(x - 5, 0, 10, H);
    c.fillStyle = "#162222";
    for (let y = 60 + k * 30; y < H; y += 110) {
      c.fillRect(x - 6, y, 12, 4);
    }
  });
  // Le plateau : un panneau sombre derriere les bulles
  c.fillStyle = "rgba(14,18,40,0.5)";
  c.beginPath();
  c.roundRect(PLATEAU.x - 6, PLATEAU.y - 6, M.COLS * D + 12, H - PLATEAU.y - 4, 16);
  c.fill();
  // Le sol du lanceur, en bois
  const sol = PLATEAU.y + (M.LANCEUR.y - 0.2) * D;
  c.fillStyle = "#5b3a22";
  c.fillRect(PLATEAU.x - 6, sol + 26, M.COLS * D + 12, H - sol);
  c.fillStyle = "#7a5030";
  c.fillRect(PLATEAU.x - 6, sol + 26, M.COLS * D + 12, 5);
  return off;
}

function yLigneMort() {
  // Juste sous la derniere rangee permise
  return PLATEAU.y + (1 + (M.LIGNE_MORT - 1) * M.PAS_Y) * D + 3;
}

function dessinerPlateau() {
  // Ligne a ne pas franchir : une corde shimenawa et ses papiers
  const y = yLigneMort();
  ctx.strokeStyle = "#d9c08a";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(PLATEAU.x, y);
  for (let x = PLATEAU.x; x <= PLATEAU.x + M.COLS * D; x += 23) {
    ctx.quadraticCurveTo(x + 6, y + 5, x + 11.5, y);
    ctx.quadraticCurveTo(x + 17, y - 5, x + 23, y);
  }
  ctx.stroke();
  ctx.fillStyle = "#f6ead0";
  for (let x = PLATEAU.x + 30; x < PLATEAU.x + M.COLS * D; x += 70) {
    ctx.beginPath();
    ctx.moveTo(x, y + 2);
    ctx.lineTo(x + 8, y + 2);
    ctx.lineTo(x + 3, y + 10);
    ctx.lineTo(x + 10, y + 10);
    ctx.lineTo(x + 5, y + 20);
    ctx.lineTo(x - 2, y + 11);
    ctx.lineTo(x + 3, y + 11);
    ctx.closePath();
    ctx.fill();
  }

  // Le plafond : une poutre qui descend, les planches au-dessus
  const etat = instantane || partie;
  const plafondY = PLATEAU.y + etat.plafond * M.PAS_Y * D + (plafondBouge ? decalageGrille : 0);
  if (plafondY > PLATEAU.y) {
    ctx.fillStyle = "#4a2f1c";
    ctx.fillRect(PLATEAU.x, PLATEAU.y - 4, M.COLS * D, plafondY - PLATEAU.y + 4);
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 1;
    for (let x = PLATEAU.x + 46; x < PLATEAU.x + M.COLS * D; x += 46) {
      ctx.beginPath();
      ctx.moveTo(x, PLATEAU.y - 4);
      ctx.lineTo(x, plafondY);
      ctx.stroke();
    }
  }
  ctx.fillStyle = "#8a5a33";
  ctx.fillRect(PLATEAU.x - 6, plafondY - 10, M.COLS * D + 12, 10);
  ctx.fillStyle = "#b07a48";
  ctx.fillRect(PLATEAU.x - 6, plafondY - 10, M.COLS * D + 12, 3);
}

function dessinerBulles() {
  const liste = instantane ? instantane.liste : M.bulles(partie);
  ctx.save();
  ctx.beginPath();
  ctx.rect(PLATEAU.x - 4, PLATEAU.y - 4, M.COLS * D + 8, H);
  ctx.clip();
  liste.forEach(b => {
    dessinerBulle(b.type, b.couleur, PLATEAU.x + b.x * D, PLATEAU.y + b.y * D + decalageGrille);
  });
  ctx.restore();
}

// ---------------------------------------------------------------------
// Lanceur, visee, bulle suivante
// ---------------------------------------------------------------------

function pointLanceur() {
  return { x: PLATEAU.x + M.LANCEUR.x * D, y: PLATEAU.y + M.LANCEUR.y * D };
}

const ZONE_SUIVANTE = { x: 92, y: 0, r: 30 };

function dessinerVisee() {
  if (!visee || vol || ecranActuel !== "jeu") {
    return;
  }
  // Traits de visee qui rebondissent sur les murs, jusqu'au contact
  ctx.strokeStyle = "rgba(255,255,255,0.75)";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.setLineDash([10, 9]);
  ctx.lineDashOffset = -temps * 40;
  ctx.beginPath();
  visee.points.forEach((p, i) => {
    const x = PLATEAU.x + p.x * D;
    const y = PLATEAU.y + p.y * D;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();
  ctx.setLineDash([]);
  // Le fantome de la bulle a l'arrivee
  const fin = visee.points[visee.points.length - 1];
  const munition = partie.file[0];
  if (munition) {
    dessinerBulle(munition.type, munition.couleur, PLATEAU.x + fin.x * D, PLATEAU.y + fin.y * D, 1, 0.35);
  }
}

function dessinerLanceur() {
  const p = pointLanceur();
  // Socle en pierre
  ctx.fillStyle = "#6e6a62";
  ctx.beginPath();
  ctx.roundRect(p.x - 34, p.y + 12, 68, 26, 6);
  ctx.fill();
  ctx.fillStyle = "#8d877b";
  ctx.fillRect(p.x - 34, p.y + 12, 68, 5);
  // Le canon de bambou, tourne selon la visee
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(angle);
  ctx.fillStyle = "#5e8a2a";
  ctx.beginPath();
  ctx.roundRect(-13, -62, 26, 62, 6);
  ctx.fill();
  ctx.fillStyle = "#86b544";
  ctx.fillRect(-13, -62, 7, 62);
  ctx.fillStyle = "#3f5f1a";
  ctx.fillRect(-14, -42, 28, 4);
  ctx.fillRect(-14, -20, 28, 4);
  ctx.fillStyle = "#2d4410";
  ctx.beginPath();
  ctx.ellipse(0, -62, 13, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // La bulle prete a partir, sur le canon
  const munition = partie.file[0];
  if (munition && !vol) {
    dessinerBulle(munition.type, munition.couleur, p.x, p.y);
  }
  // La suivante, dans son panier
  const s = { x: ZONE_SUIVANTE.x, y: p.y + 14 };
  ZONE_SUIVANTE.y = s.y;
  ctx.fillStyle = "#8a5a33";
  ctx.beginPath();
  ctx.ellipse(s.x, s.y + 14, 30, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  if (partie.file[1]) {
    dessinerBulle(partie.file[1].type, partie.file[1].couleur, s.x, s.y, 0.82);
  }
  ctx.fillStyle = "#a07040";
  ctx.beginPath();
  ctx.ellipse(s.x, s.y + 16, 28, 8, 0, 0, Math.PI);
  ctx.fill();
  ctx.fillStyle = "#e8e2f4";
  ctx.font = "600 9px 'Martian Mono', monospace";
  ctx.textAlign = "center";
  ctx.fillText("SUIVANTE", s.x, s.y + 38);
  // Le tanuki, qui suit la visee du regard
  dessinerTanuki(p.x + 110, p.y + 6);
}

function dessinerTanuki(x, y) {
  const regard = Math.sin(angle) * 3;
  ctx.fillStyle = "#6b4f33";
  ctx.beginPath();
  ctx.ellipse(x, y + 14, 22, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#e8d7b8";
  ctx.beginPath();
  ctx.ellipse(x, y + 18, 12, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  // Queue rayee
  ctx.fillStyle = "#6b4f33";
  ctx.beginPath();
  ctx.ellipse(x + 24, y + 20, 9, 14, 0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#3a2a1c";
  ctx.fillRect(x + 20, y + 14, 9, 3);
  ctx.fillRect(x + 22, y + 21, 9, 3);
  // Tete
  ctx.fillStyle = "#8a6a4a";
  ctx.beginPath();
  ctx.ellipse(x, y - 10, 17, 15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - 15, y - 16);
  ctx.lineTo(x - 11, y - 30);
  ctx.lineTo(x - 4, y - 22);
  ctx.moveTo(x + 15, y - 16);
  ctx.lineTo(x + 11, y - 30);
  ctx.lineTo(x + 4, y - 22);
  ctx.fill();
  ctx.fillStyle = "#3a2a1e";
  ctx.beginPath();
  ctx.ellipse(x - 7, y - 10, 6, 5, 0, 0, Math.PI * 2);
  ctx.ellipse(x + 7, y - 10, 6, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(x - 7 + regard, y - 11, 2, 0, Math.PI * 2);
  ctx.arc(x + 7 + regard, y - 11, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1a1018";
  ctx.beginPath();
  ctx.arc(x, y - 3, 2.4, 0, Math.PI * 2);
  ctx.fill();
  // Feuille sur la tete
  ctx.fillStyle = "#7fbf2a";
  ctx.beginPath();
  ctx.ellipse(x + 2, y - 26, 4, 8, 0.5, 0, Math.PI * 2);
  ctx.fill();
}

// ---------------------------------------------------------------------
// Tete de l'ecran : tirs, objectif, score
// ---------------------------------------------------------------------

function panneau(x, y, w, h) {
  ctx.fillStyle = "rgba(14,16,36,0.75)";
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 14);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,236,200,0.4)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function texteContour(t, x, y, taille, couleur, alignement, contour) {
  ctx.font = "800 " + taille + "px 'Anybody', sans-serif";
  ctx.textAlign = alignement || "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(3, taille * 0.18);
  ctx.strokeStyle = contour || "#141432";
  ctx.strokeText(t, x, y);
  ctx.fillStyle = couleur;
  ctx.fillText(t, x, y);
}

function petit(t, x, y, couleur, alignement) {
  ctx.font = "600 9px 'Martian Mono', monospace";
  ctx.textAlign = alignement || "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = couleur || "#d9dcf4";
  ctx.fillText(t, x, y);
}

function dessinerTete() {
  const sansFin = partie.mode === "sansfin";
  panneau(10, 10, 110, 96);
  petit(sansFin ? "MODE" : "NIVEAU", 65, 28);
  texteContour(sansFin ? "∞" : String(niveau.n), 65, 58, 34, "#ffffff");
  // Pastilles : combien de ratés avant que le plafond descende
  const total = sansFin ? Math.max(3, 7 - Math.floor(partie.score / 4000)) : niveau.ratesAvantDescente;
  const fait = sansFin ? partie.tirsDepuisAjout : partie.rates;
  for (let i = 0; i < total; i++) {
    ctx.fillStyle = i < fait ? "#ff8a7a" : "rgba(255,255,255,0.25)";
    ctx.beginPath();
    ctx.arc(65 - (total - 1) * 6 + i * 12, 90, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  panneau(128, 10, 196, 96);
  petit(sansFin ? "TIENS BON" : "OBJECTIF", 226, 28);
  if (sansFin) {
    petit("Rangée tous les " + total + " tirs", 226, 62, "#ffffff");
    petit("Record : " + progres.recordSansFin.toLocaleString("fr-BE"), 226, 82, "#ffe38a");
  } else if (niveau.type === "vider") {
    texteContour(String(M.bullesRestantes(partie)), 226, 60, 26, "#ffffff");
    petit("bulles à faire tomber", 226, 88);
  } else if (niveau.type === "lanternes") {
    dessinerBulle(M.LANTERNE, -1, 196, 62, 0.7);
    texteContour(partie.lanternesLibres + " / " + niveau.lanternes, 248, 62, 24, partie.lanternesLibres >= niveau.lanternes ? "#c6f35a" : "#ffffff");
    petit("lanternes à décrocher", 226, 90);
  } else {
    texteContour(niveau.cible.toLocaleString("fr-BE"), 226, 56, 24, "#ffe38a");
    petit("en " + niveau.tirsMax + " tirs, encore " + Math.max(0, niveau.tirsMax - partie.tirs), 226, 86);
  }

  panneau(332, 10, 138, 96);
  petit("SCORE", 401, 28);
  texteContour(Math.round(scoreAffiche).toLocaleString("fr-BE"), 401, 58, 24, "#c6f35a");
  petit(partie.tirs + " tirs", 401, 88);
}

// ---------------------------------------------------------------------
// Effets
// ---------------------------------------------------------------------

function eclater(b) {
  const x = PLATEAU.x + b.x * D;
  const y = PLATEAU.y + b.y * D;
  const col = b.couleur >= 0 ? COULEURS[b.couleur] : { base: "#c9c3b8", claire: "#ffffff" };
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.random() * 0.4;
    const v = 120 + Math.random() * 160;
    eclats.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, vie: 0.5 + Math.random() * 0.3, couleur: i % 2 ? col.base : col.claire, taille: 3 + Math.random() * 4 });
  }
  eclats.push({ anneau: true, x, y, vie: 0.25, age: 0 });
}

function texteVolant(t, x, y, couleur, taille) {
  textes.push({ t, x, y, couleur, taille: taille || 18, age: 0, duree: 0.9 });
}

function grandTexte(t, couleur) {
  textes.push({ t, x: W / 2, y: PLATEAU.y + 230, couleur, taille: 44, age: 0, duree: 1.3, grand: true });
}

function majEffets(dt) {
  eclats = eclats.filter(e => {
    e.vie -= dt;
    if (e.anneau) {
      e.age += dt;
      return e.vie > 0;
    }
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    e.vy += 700 * dt;
    return e.vie > 0;
  });
  chutes = chutes.filter(c => {
    c.vy += 1500 * dt;
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    if (c.y > H - 40 && !c.compte) {
      c.compte = true;
      texteVolant(c.points, c.x, H - 70, "#ffe38a", 14);
    }
    return c.y < H + 40;
  });
  textes = textes.filter(t => {
    t.age += dt;
    return t.age < t.duree;
  });
  secousse = Math.max(0, secousse - dt);
}

function dessinerEffets() {
  chutes.forEach(c => dessinerBulle(c.type, c.couleur, c.x, c.y));
  eclats.forEach(e => {
    if (e.anneau) {
      const k = e.age / 0.25;
      ctx.strokeStyle = "rgba(255,255,255," + (1 - k) + ")";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(e.x, e.y, D * 0.5 + k * 16, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }
    ctx.globalAlpha = Math.min(1, e.vie * 3);
    ctx.fillStyle = e.couleur;
    ctx.fillRect(e.x - e.taille / 2, e.y - e.taille / 2, e.taille, e.taille);
  });
  ctx.globalAlpha = 1;
  textes.forEach(t => {
    const k = t.age / t.duree;
    if (t.grand) {
      const s = k < 0.15 ? 0.5 + (k / 0.15) * 0.6 : 1.1 - Math.min(0.1, (k - 0.15));
      ctx.save();
      ctx.globalAlpha = k > 0.8 ? (1 - k) / 0.2 : 1;
      ctx.translate(t.x, t.y);
      ctx.scale(s, s);
      texteContour(t.t, 0, 0, t.taille, t.couleur);
      ctx.restore();
    } else {
      ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      texteContour(t.t, t.x, t.y - k * 26, t.taille, t.couleur);
    }
  });
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------
// Tir
// ---------------------------------------------------------------------

function majVisee() {
  if (partie && !vol) {
    visee = M.trajectoire(partie, angle);
  }
}

function tirer() {
  if (ecranActuel !== "jeu" || vol || !partie || partie.file.length === 0 || M.partieFinie(partie)) {
    return;
  }
  const munition = partie.file[0];
  instantane = { liste: M.bulles(partie), plafond: partie.plafond };
  const res = M.tirer(partie, angle);
  // Longueur du trajet, pour une vitesse constante
  let longueur = 0;
  for (let i = 1; i < res.trajet.length; i++) {
    longueur += Math.hypot(res.trajet[i].x - res.trajet[i - 1].x, res.trajet[i].y - res.trajet[i - 1].y);
  }
  vol = { munition, res, longueur, parcouru: 0 };
  son("tir");
}

function pointSurTrajet(trajet, distance) {
  let reste = distance;
  for (let i = 1; i < trajet.length; i++) {
    const a = trajet[i - 1];
    const b = trajet[i];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    if (reste <= l) {
      const k = l === 0 ? 0 : reste / l;
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }
    reste -= l;
  }
  return trajet[trajet.length - 1];
}

function finDuVol() {
  const res = vol.res;
  vol = null;
  instantane = null;
  if (res.case) {
    son("clic");
  }
  res.eclatees.forEach(eclater);
  if (res.eclatees.length) {
    son(res.special === "bombe" ? "explosion" : "croque");
  }
  const parChute = res.tombees.length ? Math.round(20 * (1 + res.tombees.length / 4)) : 0;
  res.tombees.concat(res.liberees).forEach((b, i) => {
    chutes.push({
      type: b.type, couleur: b.couleur,
      x: PLATEAU.x + b.x * D, y: PLATEAU.y + b.y * D,
      vx: (Math.random() - 0.5) * 120, vy: -120 - Math.random() * 120 - i * 4,
      points: b.type === M.LANTERNE ? "+500" : "+" + parChute
    });
  });
  if (res.tombees.length) {
    son("combo", Math.min(8, res.tombees.length));
  }
  if (res.liberees.length) {
    son("vie");
    grandTexte(res.liberees.length > 1 ? "Lanternes libres !" : "Lanterne libre !", "#ffd98a");
  } else if (res.tombees.length >= 10) {
    grandTexte("Avalanche !", "#c6f35a");
  } else if (res.tombees.length >= 6) {
    grandTexte("Superbe !", "#ffe38a");
  }
  if (res.points > 0 && res.case) {
    texteVolant("+" + res.points.toLocaleString("fr-BE"), PLATEAU.x + res.case.x * D, PLATEAU.y + res.case.y * D - 20, "#ffffff", 20);
  }
  if (partie.file[1] && partie.file[1].type === M.BOMBE && res.tombees.length >= 6) {
    texteVolant("Bombe gagnée", W / 2, PLATEAU.y + 300, "#ff8a7a", 16);
  }
  if (res.descente || res.ajout) {
    // Le plateau descend d'une rangee, en douceur
    decalageGrille = -M.PAS_Y * D;
    plafondBouge = res.descente;
    secousse = 0.25;
    son("impact");
  }
  majScoreCourant(ID, partie.score);
  majVisee();
  const fin = M.partieFinie(partie);
  if (fin) {
    setTimeout(() => terminer(fin), 700);
  }
}

function terminer(fin) {
  if (!partie || ecranActuel !== "jeu") {
    return;
  }
  if (partie.mode === "sansfin") {
    const record = partie.score > progres.recordSansFin;
    if (record) {
      progres.recordSansFin = partie.score;
      sauver();
    }
    son("mort");
    resultat = { sansFin: true, score: partie.score, record, age: 0 };
    ecranActuel = "resultat";
    // Le classement en ligne retient le mode sans fin
    setTimeout(() => {
      if (!zone.hidden && ecranActuel === "resultat" && partie.score > 0) {
        finDePartie(ID, partie.score, "Bubble Shooter");
      }
    }, 2200);
    return;
  }
  const gagne = fin === "gagne";
  let et = 0;
  let record = false;
  if (gagne) {
    // Les bulles qui restent tombent en bonus
    const reste = M.bulles(partie).filter(b => b.type !== M.PIERRE);
    reste.forEach(b => chutes.push({ type: b.type, couleur: b.couleur, x: PLATEAU.x + b.x * D, y: PLATEAU.y + b.y * D, vx: (Math.random() - 0.5) * 160, vy: -200, points: "+50" }));
    partie.score += reste.length * 50;
    et = M.etoiles(partie);
    progres.etoiles[niveau.n] = Math.max(progres.etoiles[niveau.n] || 0, et);
    if (partie.score > (progres.meilleurs[niveau.n] || 0)) {
      progres.meilleurs[niveau.n] = partie.score;
      record = true;
    }
    progres.max = Math.max(progres.max, niveau.n + 1);
    sauver();
    son("vie");
  } else {
    son("mort");
  }
  resultat = { gagne, etoiles: et, record, score: partie.score, age: 0 };
  ecranActuel = "resultat";
}

// ---------------------------------------------------------------------
// Carte des niveaux
// ---------------------------------------------------------------------

function positionCarte(n) {
  return [W / 2 + Math.sin(n * 1.1) * 140, H - 110 - (n - 1) * 96 + carteDefil];
}

function etoile(x, y, r, pleine) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = pleine ? "#ffd23a" : "rgba(0,0,0,0.4)";
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, r * 0.18);
  ctx.strokeStyle = pleine ? "#a8650a" : "rgba(255,226,170,0.5)";
  ctx.stroke();
}

function dessinerCarte() {
  ctx.drawImage(fond, 0, 0, W, H);
  ctx.fillStyle = "rgba(10,12,30,0.25)";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#f3ead2";
  ctx.beginPath();
  ctx.arc(392, 300, 38, 0, Math.PI * 2);
  ctx.fill();
  const premier = Math.max(1, Math.floor((carteDefil - 200) / 96));
  const dernier = premier + 12;
  ctx.strokeStyle = "rgba(255,236,200,0.6)";
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.setLineDash([3, 13]);
  ctx.beginPath();
  for (let n = premier; n <= dernier; n++) {
    const [x, y] = positionCarte(n);
    if (n === premier) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
  ctx.setLineDash([]);
  for (let n = premier; n <= dernier; n++) {
    const [x, y] = positionCarte(n);
    if (y < 80 || y > H + 50) {
      continue;
    }
    const ouvert = n <= progres.max;
    const niv = M.genererNiveau(n);
    // Chaque niveau est une grosse bulle, coloree selon son objectif
    const type = !ouvert ? null : niv.type === "lanternes" ? M.LANTERNE : "normale";
    if (type === M.LANTERNE) {
      dessinerBulle(M.LANTERNE, -1, x, y, 1.35);
    } else {
      dessinerBulle(ouvert ? "normale" : M.PIERRE, ouvert ? (niv.type === "score" ? 1 : 3) : -1, x, y, 1.35);
    }
    if (n === carteChoix) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, 34, 0, Math.PI * 2);
      ctx.stroke();
    }
    texteContour(String(n), x, y + 2, 22, "#ffffff");
    const e = progres.etoiles[n] || 0;
    if (ouvert && n < progres.max) {
      [-1, 0, 1].forEach((d, i) => etoile(x + d * 18, y - 42 + Math.abs(d) * 5, 8, i < e));
    }
    if (n === progres.max) {
      dessinerTanuki(x + 56, y + Math.sin(temps * 4) * 2);
    }
  }
  panneau(10, 10, W - 20, 74);
  texteContour("BUBBLE SHOOTER", 28, 38, 26, "#ffffff", "left");
  petit(totalEtoiles() + " étoiles   record sans fin " + progres.recordSansFin.toLocaleString("fr-BE"), 30, 66, "#d9dcf4", "left");
  const niv = M.genererNiveau(carteChoix);
  petit("Niveau " + carteChoix, W - 28, 34, "#ffffff", "right");
  petit(carteChoix <= progres.max ? (niv.type === "vider" ? "Vider le plateau" : niv.type === "lanternes" ? "Lanternes" : "Score") : "Pas encore ouvert", W - 28, 54, "#c6f35a", "right");
}

// ---------------------------------------------------------------------
// Fenetres
// ---------------------------------------------------------------------

function phraseObjectif(n) {
  if (n.type === "vider") {
    return "Fais tomber toutes les bulles";
  }
  if (n.type === "lanternes") {
    return "Décroche " + n.lanternes + " lanternes : elles doivent tomber";
  }
  return "Fais " + n.cible.toLocaleString("fr-BE") + " points en " + n.tirsMax + " tirs";
}

function fenetre(titre, contenu, boutons) {
  ctx.fillStyle = "rgba(10,10,24,0.6)";
  ctx.fillRect(0, 0, W, H);
  const w = 380;
  const h = 290;
  const x = (W - w) / 2;
  const y = 220;
  ctx.fillStyle = "#fbf1de";
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 22);
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = "#c8372d";
  ctx.stroke();
  ctx.fillStyle = "#c8372d";
  ctx.beginPath();
  ctx.roundRect(x + 60, y - 22, w - 120, 46, 14);
  ctx.fill();
  texteContour(titre, W / 2, y + 1, 22, "#ffffff", "center", "#7e211b");
  contenu(x, y, w, h);
  boutons.forEach((b, i) => {
    const bw = (w - 50 - (boutons.length - 1) * 12) / boutons.length;
    const bx = x + 25 + i * (bw + 12);
    const by = y + h - 68;
    b.zone = [bx, by, bw, 48];
    ctx.fillStyle = b.principal ? "#6fb52a" : "#ee5f9f";
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, 48, 14);
    ctx.fill();
    texteContour(b.texte, bx + bw / 2, by + 24, 17, "#ffffff", "center", b.principal ? "#2f5a0c" : "#842452");
  });
  boutonsFenetre = boutons;
}

function dessinerIntro() {
  fenetre("Niveau " + niveau.n, (x, y) => {
    ctx.fillStyle = "#3a2030";
    ctx.font = "700 16px 'Hanken Grotesk', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(phraseObjectif(niveau), W / 2, y + 70);
    ctx.font = "600 11px 'Martian Mono', monospace";
    ctx.fillStyle = "#7e5a6a";
    ctx.fillText(niveau.couleurs + " couleurs, plafond : " + niveau.ratesAvantDescente + " ratés", W / 2, y + 98);
    [-1, 0, 1].forEach((d, i) => etoile(W / 2 + d * 44, y + 150 - (d === 0 ? 8 : 0), d === 0 ? 22 : 18, i < (progres.etoiles[niveau.n] || 0)));
  }, [{ texte: "Carte", action: allerCarte }, { texte: "Jouer", principal: true, action: () => {
    ecranActuel = "jeu";
    son("pouvoir");
  } }]);
}

function dessinerResultat() {
  const r = resultat;
  if (r.sansFin) {
    fenetre("Partie finie", (x, y) => {
      texteContour(r.score.toLocaleString("fr-BE"), W / 2, y + 100, 36, "#ffffff", "center", "#7e211b");
      ctx.fillStyle = "#7e5a6a";
      ctx.font = "600 11px 'Martian Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText(r.record ? "Nouveau record !" : "Record : " + progres.recordSansFin.toLocaleString("fr-BE"), W / 2, y + 146);
    }, [{ texte: "Carte", action: allerCarte }, { texte: "Rejouer", principal: true, action: lancerSansFin }]);
    return;
  }
  fenetre(r.gagne ? "Bravo !" : "Raté…", (x, y) => {
    if (r.gagne) {
      [-1, 0, 1].forEach((d, i) => etoile(W / 2 + d * 56, y + 84 - (d === 0 ? 12 : 0), d === 0 ? 30 : 24, r.age > 0.3 + i * 0.35 && i < r.etoiles));
      texteContour(r.score.toLocaleString("fr-BE"), W / 2, y + 152, 30, "#ffffff", "center", "#7e211b");
      ctx.fillStyle = "#7e5a6a";
      ctx.font = "600 11px 'Martian Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText(r.record ? "Nouveau record pour ce niveau" : partie.tirs + " tirs", W / 2, y + 186);
    } else {
      ctx.fillStyle = "#3a2030";
      ctx.font = "700 16px 'Hanken Grotesk', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(partie.perdu ? "Les bulles ont passé la corde" : "Plus de tirs", W / 2, y + 90);
      texteContour(r.score.toLocaleString("fr-BE"), W / 2, y + 140, 26, "#ffffff", "center", "#7e211b");
    }
  }, r.gagne
    ? [{ texte: "Carte", action: allerCarte }, { texte: "Rejouer", action: () => lancerNiveau(niveau.n) }, { texte: "Suivant", principal: true, action: () => lancerNiveau(niveau.n + 1) }]
    : [{ texte: "Carte", action: allerCarte }, { texte: "Rejouer", principal: true, action: () => lancerNiveau(niveau.n) }]);
}

// ---------------------------------------------------------------------
// Image et boucle
// ---------------------------------------------------------------------

function dessiner() {
  ctx.setTransform(echelle, 0, 0, echelle, 0, 0);
  if (ecranActuel === "carte" || !partie) {
    dessinerCarte();
    return;
  }
  const dx = secousse > 0 ? (Math.random() - 0.5) * 6 : 0;
  ctx.drawImage(fond, 0, 0, W, H);
  ctx.save();
  ctx.translate(dx, 0);
  dessinerTete();
  dessinerPlateau();
  dessinerBulles();
  dessinerVisee();
  if (vol) {
    const p = pointSurTrajet(vol.res.trajet, vol.parcouru);
    dessinerBulle(vol.munition.type, vol.munition.couleur, PLATEAU.x + p.x * D, PLATEAU.y + p.y * D);
  }
  dessinerLanceur();
  dessinerEffets();
  ctx.restore();
  if (ecranActuel === "intro") {
    dessinerIntro();
  } else if (ecranActuel === "resultat") {
    dessinerResultat();
  }
}

function maj(dt) {
  temps += dt;
  majEffets(dt);
  if (resultat) {
    resultat.age += dt;
  }
  if (!partie) {
    return;
  }
  scoreAffiche += (partie.score - scoreAffiche) * Math.min(1, dt * 8);
  if (decalageGrille < 0) {
    decalageGrille = Math.min(0, decalageGrille + dt * 140);
  }
  if (ecranActuel === "jeu") {
    let tourne = 0;
    if (touches.has("arrowleft") || touches.has("q")) {
      tourne -= 1;
    }
    if (touches.has("arrowright") || touches.has("d")) {
      tourne += 1;
    }
    if (tourne) {
      angle = Math.max(-M.ANGLE_MAX, Math.min(M.ANGLE_MAX, angle + tourne * VITESSE_VISEE * dt));
      majVisee();
    }
  }
  if (vol) {
    vol.parcouru += VITESSE_TIR * dt;
    if (vol.parcouru >= vol.longueur) {
      finDuVol();
    }
  }
}

const boucle = creerBoucle(function (dt) {
  maj(dt);
  dessiner();
}, { plafond: 1 / 20 });

function ajuster() {
  const marge = window.innerWidth >= 1100 ? 500 : 0;
  const style = getComputedStyle(zone);
  const interieur = zone.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  const largeur = Math.min(window.innerWidth * 0.96 - marge, interieur || Infinity, 560);
  const entete = zone.querySelector(".entete-bulles").getBoundingClientRect().height || 40;
  const manette = document.querySelector(".manette:not([hidden])");
  const hauteurManette = manette ? manette.getBoundingClientRect().height : 0;
  const hauteur = Math.max(300, window.innerHeight - entete - hauteurManette - 40);
  const taille = Math.min(largeur / W, hauteur / H);
  canvas.style.width = Math.floor(W * taille) + "px";
  canvas.style.height = Math.floor(H * taille) + "px";
  const nouvelle = Math.min(3, Math.max(1, taille * (window.devicePixelRatio || 1)));
  if (Math.abs(nouvelle - echelle) > 0.02 || fond === null) {
    echelle = nouvelle;
    canvas.width = Math.round(W * echelle);
    canvas.height = Math.round(H * echelle);
    cache = new Map();
    fond = peindreFond();
  }
}

window.addEventListener("resize", function () {
  if (!zone.hidden) {
    ajuster();
  }
});

// ---------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------

function remettreAZero() {
  vol = null;
  instantane = null;
  eclats = [];
  chutes = [];
  textes = [];
  decalageGrille = 0;
  angle = 0;
  scoreAffiche = 0;
  resultat = null;
}

function lancerNiveau(n) {
  remettreAZero();
  niveau = M.genererNiveau(n);
  partie = M.creerPartie(niveau, "niveau");
  carteChoix = n;
  majVisee();
  ecranActuel = "intro";
  majScoreCourant(ID, 0);
}

function lancerSansFin() {
  remettreAZero();
  niveau = null;
  partie = M.creerPartie(null, "sansfin");
  majVisee();
  ecranActuel = "jeu";
  majScoreCourant(ID, 0);
  son("pouvoir");
}

function allerCarte() {
  ecranActuel = "carte";
  resultat = null;
  carteChoix = Math.min(Math.max(1, carteChoix), progres.max);
  centrerCarte(carteChoix);
}

function centrerCarte(n) {
  carteDefil = Math.max(0, (n - 1) * 96 - (H / 2 - 110));
}

// ---------------------------------------------------------------------
// Commandes
// ---------------------------------------------------------------------

function pointLogique(evenement) {
  const r = canvas.getBoundingClientRect();
  return [(evenement.clientX - r.left) / r.width * W, (evenement.clientY - r.top) / r.height * H];
}

function viserVers(x, y) {
  const p = pointLanceur();
  const a = Math.atan2(x - p.x, p.y - Math.min(y, p.y - 10));
  angle = Math.max(-M.ANGLE_MAX, Math.min(M.ANGLE_MAX, a));
  majVisee();
}

function cliquerFenetre(x, y) {
  const b = boutonsFenetre.find(bt => bt.zone && x >= bt.zone[0] && x <= bt.zone[0] + bt.zone[2] && y >= bt.zone[1] && y <= bt.zone[1] + bt.zone[3]);
  if (b) {
    son("clic");
    b.action();
  }
}

function surSuivante(x, y) {
  return Math.hypot(x - ZONE_SUIVANTE.x, y - ZONE_SUIVANTE.y) < ZONE_SUIVANTE.r + 8;
}

function echanger() {
  if (partie && !vol && ecranActuel === "jeu") {
    M.echanger(partie);
    majVisee();
    son("grain");
  }
}

canvas.addEventListener("pointerdown", function (evenement) {
  if (!jeuAuPremierPlan(ID)) {
    return;
  }
  evenement.preventDefault();
  const [x, y] = pointLogique(evenement);
  if (ecranActuel === "carte") {
    pointeurActif = { x, y, defil: carteDefil, bouge: false, id: evenement.pointerId };
    canvas.setPointerCapture(evenement.pointerId);
    return;
  }
  if (ecranActuel !== "jeu") {
    cliquerFenetre(x, y);
    return;
  }
  if (surSuivante(x, y)) {
    echanger();
    return;
  }
  canvas.setPointerCapture(evenement.pointerId);
  pointeurActif = { id: evenement.pointerId };
  viserVers(x, y);
});

canvas.addEventListener("pointermove", function (evenement) {
  const [x, y] = pointLogique(evenement);
  if (ecranActuel === "carte") {
    if (pointeurActif) {
      if (Math.abs(y - pointeurActif.y) > 6) {
        pointeurActif.bouge = true;
      }
      carteDefil = Math.max(0, pointeurActif.defil + (y - pointeurActif.y));
    }
    return;
  }
  // La souris vise en survol ; le doigt vise tant qu'il est pose
  if (ecranActuel === "jeu" && (pointeurActif || evenement.pointerType === "mouse")) {
    viserVers(x, y);
  }
});

canvas.addEventListener("pointerup", function (evenement) {
  const [x, y] = pointLogique(evenement);
  if (ecranActuel === "carte") {
    if (pointeurActif && !pointeurActif.bouge) {
      for (let n = 1; n <= progres.max + 6; n++) {
        const [nx, ny] = positionCarte(n);
        if (Math.hypot(x - nx, y - ny) < 34) {
          carteChoix = n;
          if (n <= progres.max) {
            son("clic");
            lancerNiveau(n);
          }
          break;
        }
      }
    }
    pointeurActif = null;
    return;
  }
  if (ecranActuel === "jeu" && pointeurActif) {
    viserVers(x, y);
    tirer();
  }
  pointeurActif = null;
});

canvas.addEventListener("pointercancel", () => {
  pointeurActif = null;
});
canvas.addEventListener("wheel", function (evenement) {
  if (ecranActuel === "carte") {
    evenement.preventDefault();
    carteDefil = Math.max(0, carteDefil - evenement.deltaY * 0.6);
  }
}, { passive: false });
canvas.addEventListener("contextmenu", evenement => evenement.preventDefault());

surTouche(ID, function (evenement) {
  const touche = evenement.key.toLowerCase();
  if (touche === "escape") {
    quitterJeu();
    return;
  }
  if (touche === "m") {
    basculerSon();
    majBoutonSon();
  } else if (ecranActuel === "carte") {
    if (touche === "arrowup" || touche === "arrowright") {
      carteChoix = Math.min(progres.max, carteChoix + 1);
      centrerCarte(carteChoix);
    } else if (touche === "arrowdown" || touche === "arrowleft") {
      carteChoix = Math.max(1, carteChoix - 1);
      centrerCarte(carteChoix);
    } else if (touche === " " || touche === "enter") {
      lancerNiveau(carteChoix);
    } else if (touche === "x" || touche === "p") {
      lancerSansFin();
    } else {
      return;
    }
  } else if (ecranActuel === "intro" || ecranActuel === "resultat") {
    if (touche === " " || touche === "enter" || touche === "p") {
      const principal = boutonsFenetre.find(b => b.principal);
      if (principal) {
        principal.action();
      }
    } else if (touche === "x" || touche === "backspace") {
      allerCarte();
    } else {
      return;
    }
  } else if (touche === "arrowleft" || touche === "arrowright" || touche === "q" || touche === "d") {
    touches.add(touche);
  } else if (touche === " " || touche === "arrowup" || touche === "z" || touche === "enter") {
    if (!evenement.repeat) {
      tirer();
    }
  } else if (touche === "arrowdown" || touche === "x" || touche === "s") {
    if (!evenement.repeat) {
      echanger();
    }
  } else if (touche === "p") {
    allerCarte();
  } else {
    return;
  }
  evenement.preventDefault();
});

document.addEventListener("keyup", function (evenement) {
  touches.delete(evenement.key.toLowerCase());
});

function majBoutonSon() {
  boutonSon.textContent = sonActif() ? "Son" : "Muet";
}

boutonSon.addEventListener("click", function () {
  basculerSon();
  majBoutonSon();
});
boutonCarte.addEventListener("click", allerCarte);
boutonSansFin.addEventListener("click", lancerSansFin);
boutonClassement.addEventListener("click", function () {
  finDePartie(ID, progres.recordSansFin, "Bubble Shooter");
});
boutonQuitter.addEventListener("click", quitterJeu);

function demarrer() {
  progres = lireProgres();
  fond = null;
  touches.clear();
  ajuster();
  requestAnimationFrame(ajuster);
  carteChoix = progres.max;
  partie = null;
  allerCarte();
  majScoreCourant(ID, progres.recordSansFin);
  majBoutonSon();
  boucle.lancer();
}

// Pour les tests automatiques
export const _test = {
  get partie() { return partie; },
  get ecran() { return ecranActuel; },
  get vol() { return vol; },
  lancerNiveau, lancerSansFin,
  viser(a) { angle = a; majVisee(); },
  tirer,
  jouer() { ecranActuel = "jeu"; }
};

enregistrerJeu({
  id: ID,
  nom: "Bubble Shooter",
  code: "1994",
  section: zone,
  demarrer,
  arreter: () => {
    boucle.arreter();
    touches.clear();
  },
  formaterScore: score => Number(score).toLocaleString("fr-BE"),
  manette: { a: " ", b: "x", start: "p", repetition: true, libelles: { a: "Tirer", b: "Échanger" } }
});
