// =====================================================================
//  OMAMORI CRUSH
//  Le jeu d'alignements de trois, version porte-bonheur du sanctuaire.
//  Des niveaux sans fin, chacun avec un nombre de coups et un objectif :
//  atteindre un score, ramasser des porte-bonheur, briser les sceaux
//  de papier, ou faire descendre les lanternes jusqu'en bas.
//  Les regles vivent dans omamori/moteur.js ; ici, tout ce qui se voit,
//  s'entend et se touche.
// =====================================================================

import { enregistrerJeu, finDePartie, quitterJeu, majScoreCourant } from "./arcade.js";
import { creerBoucle } from "./noyau/boucle.js";
import { surTouche, jeuAuPremierPlan } from "./noyau/clavier.js";
import { creerStockage } from "./noyau/stockage.js";
import { jouer as son, basculerSon, sonActif } from "./noyau/son.js";
import * as M from "./omamori/moteur.js";

const ID = "omamori";
const W = 540;
const H = 668;
const CASE = 56;
const PLATEAU = { x: (W - CASE * M.C) / 2, y: 146 };

const NOMS = ["omamori", "feuille", "goutte", "pièce", "sakura", "magatama"];
const COULEURS = [
  { claire: "#ff8a7a", base: "#e0412f", sombre: "#8e1d14" },
  { claire: "#d6f57a", base: "#7fbf2a", sombre: "#3f6912" },
  { claire: "#a9e4ff", base: "#2f8fd8", sombre: "#14467a" },
  { claire: "#fff0a0", base: "#f2b919", sombre: "#8a5d06" },
  { claire: "#ffd0e4", base: "#f06aa6", sombre: "#8e2558" },
  { claire: "#d9c2ff", base: "#8a55e0", sombre: "#43237e" }
];

// ---------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------

const zone = document.createElement("section");
zone.className = "jeu jeu-omamori";
zone.id = "jeuOmamori";
zone.hidden = true;
zone.innerHTML = `
  <div class="jeu-entete entete-omamori">
    <span class="omamori-boutons">
      <button class="jeu-quitter" id="carteOmamori" type="button">Carte</button>
      <button class="jeu-quitter" id="classementOmamori" type="button">Classement</button>
      <button class="jeu-quitter" id="sonOmamori" type="button">Son</button>
      <button class="jeu-quitter" id="quitterOmamori" type="button">Retour</button>
    </span>
  </div>
  <canvas id="canvasOmamori"></canvas>
  <p class="jeu-aide">Fais glisser un porte-bonheur vers son voisin pour en aligner trois. Quatre alignés donnent une pièce rayée, un L ou un T une pièce emballée, cinq un daruma. Échange deux pièces spéciales pour les combiner. Au clavier : flèches, Espace pour saisir puis une flèche pour échanger. H indice, M son, Échap quitter.</p>`;
document.body.appendChild(zone);

const canvas = zone.querySelector("#canvasOmamori");
const ctx = canvas.getContext("2d");
const boutonCarte = zone.querySelector("#carteOmamori");
const boutonClassement = zone.querySelector("#classementOmamori");
const boutonSon = zone.querySelector("#sonOmamori");
const boutonQuitter = zone.querySelector("#quitterOmamori");

// ---------------------------------------------------------------------
// Progression sauvegardee
// ---------------------------------------------------------------------

const stockage = creerStockage("tanuki-arcade-omamori-crush");
let progres = Object.assign({ max: 1, etoiles: {}, meilleurs: {} }, stockage.lire() || {});

function sauver() {
  stockage.ecrire(progres);
}

function totalScores() {
  return Object.values(progres.meilleurs).reduce((a, b) => a + b, 0);
}

function totalEtoiles() {
  return Object.values(progres.etoiles).reduce((a, b) => a + b, 0);
}

// ---------------------------------------------------------------------
// Etat de l'ecran
// ---------------------------------------------------------------------

let echelle = 1;
let ecranActuel = "carte";       // "carte" | "intro" | "jeu" | "resultat"
let niveau = null;
let partie = null;
let vis = new Map();             // id -> piece affichee
let visCases = null;             // sceaux et pierres affiches
let animations = [];
let attentes = [];
let effetsVisuels = [];
let particules = [];
let textes = [];
let occupe = false;
let selection = null;
let curseur = { r: 4, c: 4 };
let inactif = 0;
let indice = null;
let scoreAffiche = 0;
let resultat = null;
let carteDefil = 0;
let carteChoix = 1;
let fond = null;
let cache = new Map();
let temps = 0;

// ---------------------------------------------------------------------
// Animations
// ---------------------------------------------------------------------

const adoucir = {
  lin: t => t,
  sortie: t => 1 - Math.pow(1 - t, 3),
  rebond: t => {
    if (t < 0.72) {
      const u = t / 0.72;
      return u * u;
    }
    const u = (t - 0.72) / 0.28;
    return 1 - Math.sin(u * Math.PI) * 0.06;
  },
  ressort: t => 1 + Math.sin(t * Math.PI) * 0.35 * (1 - t)
};

function animer(objet, cibles, duree, courbe) {
  const depart = {};
  Object.keys(cibles).forEach(k => {
    depart[k] = objet[k];
  });
  animations.push({ objet, depart, cibles, duree, t: 0, courbe: adoucir[courbe || "sortie"] });
}

function attendre(duree) {
  return new Promise(resolve => attentes.push({ reste: duree, resolve }));
}

function majAnimations(dt) {
  animations = animations.filter(a => {
    a.t = Math.min(1, a.t + dt / a.duree);
    const k = a.courbe(a.t);
    Object.keys(a.cibles).forEach(cle => {
      a.objet[cle] = a.depart[cle] + (a.cibles[cle] - a.depart[cle]) * k;
    });
    return a.t < 1;
  });
  attentes = attentes.filter(w => {
    w.reste -= dt;
    if (w.reste <= 0) {
      w.resolve();
      return false;
    }
    return true;
  });
  particules = particules.filter(p => {
    p.vie -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 900 * dt;
    p.rot += p.vr * dt;
    return p.vie > 0;
  });
  textes = textes.filter(t => {
    t.age += dt;
    return t.age < t.duree;
  });
  effetsVisuels = effetsVisuels.filter(e => {
    e.age += dt;
    return e.age < e.duree;
  });
}

// ---------------------------------------------------------------------
// Dessin des porte-bonheur, mis en cache a la resolution de l'ecran
// ---------------------------------------------------------------------

function brillant(c, x, y, r, couleur) {
  const g = c.createRadialGradient(x - r * 0.35, y - r * 0.45, r * 0.08, x, y, r * 1.15);
  g.addColorStop(0, couleur.claire);
  g.addColorStop(0.45, couleur.base);
  g.addColorStop(1, couleur.sombre);
  return g;
}

function reflet(c, chemin) {
  // Le reflet blanc en haut a gauche, celui qui fait "bonbon"
  c.save();
  chemin();
  c.clip();
  c.fillStyle = "rgba(255,255,255,0.55)";
  c.beginPath();
  c.ellipse(-6, -11, 11, 6, -0.5, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "rgba(255,255,255,0.9)";
  c.beginPath();
  c.ellipse(-9, -13, 3.5, 2, -0.5, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

// Chaque forme est dessinee centree sur (0, 0), dans un carre de 48
const FORMES = [
  // Omamori : sachet arrondi, noeud dore, cordon
  c => {
    c.beginPath();
    c.moveTo(-14, -12);
    c.quadraticCurveTo(-15, -19, -8, -19);
    c.lineTo(8, -19);
    c.quadraticCurveTo(15, -19, 14, -12);
    c.lineTo(15, 14);
    c.quadraticCurveTo(15, 20, 8, 20);
    c.lineTo(-8, 20);
    c.quadraticCurveTo(-15, 20, -15, 14);
    c.closePath();
  },
  // Feuille
  c => {
    c.beginPath();
    c.moveTo(-15, 15);
    c.bezierCurveTo(-20, -6, -4, -20, 16, -18);
    c.bezierCurveTo(18, 2, 6, 18, -15, 15);
    c.closePath();
  },
  // Goutte
  c => {
    c.beginPath();
    c.moveTo(0, -21);
    c.bezierCurveTo(6, -10, 16, 0, 16, 7);
    c.arc(0, 7, 16, 0, Math.PI);
    c.bezierCurveTo(-16, 0, -6, -10, 0, -21);
    c.closePath();
  },
  // Piece percee
  c => {
    c.beginPath();
    c.arc(0, 0, 19, 0, Math.PI * 2);
    c.closePath();
  },
  // Fleur de sakura, cinq petales echancres
  c => {
    c.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i / 5) * Math.PI * 2;
      const a1 = a - 0.62;
      const a2 = a + 0.62;
      if (i === 0) {
        c.moveTo(Math.cos(a1) * 6, Math.sin(a1) * 6);
      }
      c.quadraticCurveTo(Math.cos(a1) * 24, Math.sin(a1) * 24, Math.cos(a - 0.12) * 19, Math.sin(a - 0.12) * 19);
      c.lineTo(Math.cos(a) * 15, Math.sin(a) * 15);
      c.lineTo(Math.cos(a + 0.12) * 19, Math.sin(a + 0.12) * 19);
      c.quadraticCurveTo(Math.cos(a2) * 24, Math.sin(a2) * 24, Math.cos(a2) * 6, Math.sin(a2) * 6);
    }
    c.closePath();
  },
  // Magatama
  c => {
    c.beginPath();
    c.arc(-2, -5, 14, Math.PI * 0.9, Math.PI * 2.35);
    c.bezierCurveTo(14, 18, -2, 22, -12, 17);
    c.bezierCurveTo(-4, 10, -16, 2, -15.5, -1);
    c.closePath();
  }
];

function detailsDe(c, type) {
  c.save();
  if (type === 0) {
    // Noeud et cordon dores, etiquette blanche
    c.fillStyle = "#ffe08a";
    c.beginPath();
    c.ellipse(0, -18, 6, 3.5, 0, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "#ffe08a";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-3, -16);
    c.quadraticCurveTo(-8, -6, -5, 0);
    c.moveTo(3, -16);
    c.quadraticCurveTo(8, -6, 5, 0);
    c.stroke();
    c.fillStyle = "rgba(255,248,232,0.95)";
    c.beginPath();
    c.roundRect(-6, 3, 12, 12, 2);
    c.fill();
    c.fillStyle = "#b8291d";
    c.fillRect(-2, 6, 4, 6);
  } else if (type === 1) {
    c.strokeStyle = "rgba(40,70,10,0.6)";
    c.lineWidth = 1.6;
    c.beginPath();
    c.moveTo(-13, 13);
    c.quadraticCurveTo(0, 0, 13, -14);
    c.moveTo(-4, 4);
    c.lineTo(-4, -5);
    c.moveTo(3, -3);
    c.lineTo(5, -11);
    c.moveTo(-1, 1);
    c.lineTo(8, 2);
    c.stroke();
  } else if (type === 2) {
    c.fillStyle = "rgba(255,255,255,0.35)";
    c.beginPath();
    c.arc(5, 10, 4, 0, Math.PI * 2);
    c.fill();
  } else if (type === 3) {
    c.strokeStyle = "rgba(138,93,6,0.7)";
    c.lineWidth = 2;
    c.beginPath();
    c.arc(0, 0, 14.5, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = "#7a4c05";
    c.fillRect(-5, -5, 10, 10);
    c.fillStyle = "rgba(0,0,0,0.25)";
    c.fillRect(-5, 3, 10, 2);
  } else if (type === 4) {
    c.fillStyle = "#ffe38a";
    c.beginPath();
    c.arc(0, 0, 4.5, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#c2306f";
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i / 5) * Math.PI * 2 + Math.PI / 5;
      c.beginPath();
      c.arc(Math.cos(a) * 7.5, Math.sin(a) * 7.5, 1.4, 0, Math.PI * 2);
      c.fill();
    }
  } else if (type === 5) {
    c.fillStyle = "rgba(40,16,80,0.85)";
    c.beginPath();
    c.arc(-1, -5, 4.5, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "rgba(255,255,255,0.4)";
    c.beginPath();
    c.arc(-2.5, -6.5, 1.5, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

function dessinerForme(c, type) {
  const forme = FORMES[type];
  const couleur = COULEURS[type];
  // Ombre portee sous la piece
  c.save();
  c.translate(1.5, 3);
  forme(c);
  c.fillStyle = "rgba(0,0,0,0.35)";
  c.fill();
  c.restore();
  forme(c);
  c.fillStyle = brillant(c, 0, 0, 20, couleur);
  c.fill();
  c.lineWidth = 2;
  c.strokeStyle = couleur.sombre;
  c.stroke();
  detailsDe(c, type);
  reflet(c, () => forme(c));
}

function dessinerDaruma(c) {
  // Le daruma, rouge et dore, avec ses deux yeux et une couronne de couleurs
  c.save();
  c.translate(1.5, 3);
  c.beginPath();
  c.ellipse(0, 2, 19, 21, 0, 0, Math.PI * 2);
  c.fillStyle = "rgba(0,0,0,0.35)";
  c.fill();
  c.restore();
  c.beginPath();
  c.ellipse(0, 2, 19, 21, 0, 0, Math.PI * 2);
  c.fillStyle = brillant(c, 0, 0, 22, { claire: "#ff8f80", base: "#d42a1c", sombre: "#6e110a" });
  c.fill();
  c.strokeStyle = "#5e0d08";
  c.lineWidth = 2;
  c.stroke();
  c.fillStyle = "#fbefd8";
  c.beginPath();
  c.ellipse(0, -2, 12, 10, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#1a1018";
  c.beginPath();
  c.arc(-5, -3, 3, 0, Math.PI * 2);
  c.arc(5, -3, 3, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#fff";
  c.beginPath();
  c.arc(-5.8, -4, 1, 0, Math.PI * 2);
  c.arc(4.2, -4, 1, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = "#1a1018";
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(-9, -8);
  c.quadraticCurveTo(-5, -11, -2, -8);
  c.moveTo(9, -8);
  c.quadraticCurveTo(5, -11, 2, -8);
  c.stroke();
  c.fillStyle = "#e8b83a";
  c.fillRect(-7, 11, 14, 4);
  COULEURS.forEach((col, i) => {
    const a = -Math.PI * 0.9 + (i / 5) * Math.PI * 0.8 + Math.PI * 1.05;
    c.fillStyle = col.base;
    c.beginPath();
    c.arc(Math.cos(a) * 15, 4 + Math.sin(a) * 15, 2.4, 0, Math.PI * 2);
    c.fill();
  });
  reflet(c, () => {
    c.beginPath();
    c.ellipse(0, 2, 19, 21, 0, 0, Math.PI * 2);
  });
}

function dessinerLanterne(c) {
  c.save();
  c.translate(1.5, 3);
  c.beginPath();
  c.ellipse(0, 1, 15, 18, 0, 0, Math.PI * 2);
  c.fillStyle = "rgba(0,0,0,0.35)";
  c.fill();
  c.restore();
  c.fillStyle = "#2a1a12";
  c.fillRect(-1, -25, 2, 6);
  c.beginPath();
  c.ellipse(0, 1, 15, 18, 0, 0, Math.PI * 2);
  c.fillStyle = brillant(c, 0, 0, 20, { claire: "#ffd9a0", base: "#f08a24", sombre: "#8e3e08" });
  c.fill();
  c.strokeStyle = "rgba(110,40,6,0.55)";
  c.lineWidth = 1;
  [-9, -3, 3, 9].forEach(x => {
    c.beginPath();
    c.ellipse(0, 1, Math.abs(x) * 1.55 + 1, 18, 0, 0, Math.PI * 2);
    c.stroke();
  });
  c.fillStyle = "#2a1a12";
  c.beginPath();
  c.roundRect(-9, -20, 18, 5, 2);
  c.roundRect(-9, 17, 18, 5, 2);
  c.fill();
  c.fillStyle = "#c8261a";
  c.font = "700 12px 'Shippori Mincho B1', serif";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText("祭", 0, 2);
  reflet(c, () => {
    c.beginPath();
    c.ellipse(0, 1, 15, 18, 0, 0, Math.PI * 2);
  });
}

function rayures(c, type, dir) {
  c.save();
  FORMES[type](c);
  c.clip();
  c.fillStyle = "rgba(255,255,255,0.85)";
  for (let k = -2; k <= 2; k++) {
    if (dir === "h") {
      c.fillRect(-24, k * 8 - 1.8, 48, 3.6);
    } else {
      c.fillRect(k * 8 - 1.8, -24, 3.6, 48);
    }
  }
  c.restore();
  FORMES[type](c);
  c.lineWidth = 2;
  c.strokeStyle = COULEURS[type].sombre;
  c.stroke();
}

function emballage(c, type, arme) {
  // Un furoshiki transparent noue autour de la piece
  c.save();
  c.scale(0.8, 0.8);
  dessinerForme(c, type);
  c.restore();
  c.beginPath();
  c.roundRect(-22, -22, 44, 44, 11);
  c.fillStyle = arme ? "rgba(255,240,180,0.35)" : "rgba(255,255,255,0.16)";
  c.fill();
  c.lineWidth = 3;
  c.strokeStyle = COULEURS[type].base;
  c.stroke();
  c.lineWidth = 1.2;
  c.strokeStyle = "rgba(255,255,255,0.85)";
  c.stroke();
  // Noeud du furoshiki
  c.fillStyle = COULEURS[type].base;
  c.beginPath();
  c.ellipse(-6, -22, 6, 3.5, -0.5, 0, Math.PI * 2);
  c.ellipse(6, -22, 6, 3.5, 0.5, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = COULEURS[type].claire;
  c.beginPath();
  c.arc(0, -22, 3, 0, Math.PI * 2);
  c.fill();
}

function sprite(type, special) {
  const cle = type + "|" + (special || "");
  if (cache.has(cle)) {
    return cache.get(cle);
  }
  const taille = Math.ceil(CASE * echelle);
  const off = document.createElement("canvas");
  off.width = off.height = taille;
  const c = off.getContext("2d");
  c.setTransform(echelle * (CASE / 48), 0, 0, echelle * (CASE / 48), taille / 2, taille / 2);
  if (type === M.LANTERNE) {
    dessinerLanterne(c);
  } else if (special === "daruma" || type === M.DARUMA) {
    dessinerDaruma(c);
  } else if (special === "h" || special === "v") {
    dessinerForme(c, type);
    rayures(c, type, special);
  } else if (special === "emballe" || special === "arme") {
    emballage(c, type, special === "arme");
  } else {
    dessinerForme(c, type);
  }
  cache.set(cle, off);
  return off;
}

// ---------------------------------------------------------------------
// Decor : ciel du soir, montagnes, sanctuaire
// ---------------------------------------------------------------------

function peindreFond() {
  const off = document.createElement("canvas");
  off.width = Math.round(W * echelle);
  off.height = Math.round(H * echelle);
  const c = off.getContext("2d");
  c.setTransform(echelle, 0, 0, echelle, 0, 0);
  const ciel = c.createLinearGradient(0, 0, 0, H);
  ciel.addColorStop(0, "#2a1d52");
  ciel.addColorStop(0.35, "#6b2f6e");
  ciel.addColorStop(0.62, "#e0715a");
  ciel.addColorStop(1, "#f6b26b");
  c.fillStyle = ciel;
  c.fillRect(0, 0, W, H);
  // Soleil couchant
  c.fillStyle = "#ffd98a";
  c.beginPath();
  c.arc(W * 0.72, H * 0.6, 64, 0, Math.PI * 2);
  c.fill();
  // Montagnes en trois plans
  [["#7a3b6e", 0.58, 70], ["#542a5e", 0.68, 50], ["#331c45", 0.8, 34]].forEach(([coul, base, amp], k) => {
    c.fillStyle = coul;
    c.beginPath();
    c.moveTo(0, H);
    for (let x = 0; x <= W; x += 20) {
      const y = H * base - Math.abs(Math.sin(x * 0.011 + k * 1.7)) * amp - Math.sin(x * 0.031 + k) * 10;
      c.lineTo(x, y);
    }
    c.lineTo(W, H);
    c.closePath();
    c.fill();
  });
  // Torii au loin
  c.fillStyle = "#2a1530";
  c.fillRect(56, H * 0.69, 6, 60);
  c.fillRect(104, H * 0.69, 6, 60);
  c.fillRect(44, H * 0.68, 78, 6);
  c.fillRect(50, H * 0.7 + 6, 66, 4);
  // Petales de sakura poses au hasard, toujours au meme endroit
  const alea = M.hasard(42);
  for (let i = 0; i < 26; i++) {
    c.fillStyle = i % 3 ? "rgba(255,200,220,0.75)" : "rgba(255,235,240,0.85)";
    const x = alea() * W;
    const y = alea() * H;
    c.save();
    c.translate(x, y);
    c.rotate(alea() * 6);
    c.beginPath();
    c.ellipse(0, 0, 4, 2.2, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }
  return off;
}

// ---------------------------------------------------------------------
// Plateau
// ---------------------------------------------------------------------

function xCase(c) {
  return PLATEAU.x + c * CASE;
}

function yCase(r) {
  return PLATEAU.y + r * CASE;
}

function dessinerPlateau() {
  const n = niveau;
  // Cadre laque, sous les cases
  ctx.fillStyle = "rgba(20,10,30,0.55)";
  ctx.beginPath();
  ctx.roundRect(PLATEAU.x - 10, PLATEAU.y - 10, CASE * M.C + 20, CASE * M.R + 20, 18);
  ctx.fill();
  for (let r = 0; r < M.R; r++) {
    for (let c = 0; c < M.C; c++) {
      if (!n.masque[r][c]) {
        continue;
      }
      const x = xCase(c);
      const y = yCase(r);
      ctx.fillStyle = (r + c) % 2 ? "rgba(52,40,96,0.82)" : "rgba(64,50,114,0.82)";
      ctx.fillRect(x, y, CASE, CASE);
      const k = visCases ? visCases[r][c] : { sceau: 0, pierre: 0 };
      if (k.sceau > 0) {
        // Sceau de papier : un ofuda creme tamponne de rouge
        ctx.fillStyle = k.sceau > 1 ? "#f1d9a6" : "#f6ead0";
        ctx.beginPath();
        ctx.roundRect(x + 3, y + 3, CASE - 6, CASE - 6, 6);
        ctx.fill();
        ctx.strokeStyle = "#c8372d";
        ctx.lineWidth = k.sceau > 1 ? 3 : 1.5;
        ctx.stroke();
        if (k.sceau > 1) {
          ctx.strokeStyle = "rgba(200,55,45,0.45)";
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 9, y + 9, CASE - 18, CASE - 18);
        }
      }
    }
  }
  // Bord net autour des cases jouables
  ctx.strokeStyle = "rgba(255,226,170,0.55)";
  ctx.lineWidth = 2;
  for (let r = 0; r < M.R; r++) {
    for (let c = 0; c < M.C; c++) {
      if (!n.masque[r][c]) {
        continue;
      }
      const x = xCase(c);
      const y = yCase(r);
      const bord = (rr, cc) => !(rr >= 0 && rr < M.R && cc >= 0 && cc < M.C && n.masque[rr][cc]);
      ctx.beginPath();
      if (bord(r - 1, c)) {
        ctx.moveTo(x, y);
        ctx.lineTo(x + CASE, y);
      }
      if (bord(r + 1, c)) {
        ctx.moveTo(x, y + CASE);
        ctx.lineTo(x + CASE, y + CASE);
      }
      if (bord(r, c - 1)) {
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + CASE);
      }
      if (bord(r, c + 1)) {
        ctx.moveTo(x + CASE, y);
        ctx.lineTo(x + CASE, y + CASE);
      }
      ctx.stroke();
    }
  }
  // Sorties des lanternes
  if (n.objectif.type === "lanternes") {
    for (let c = 0; c < M.C; c++) {
      let bas = -1;
      for (let r = M.R - 1; r >= 0; r--) {
        if (n.masque[r][c]) {
          bas = r;
          break;
        }
      }
      if (bas >= 0) {
        const x = xCase(c) + CASE / 2;
        const y = yCase(bas) + CASE + 4;
        ctx.fillStyle = "#ffd98a";
        ctx.beginPath();
        ctx.moveTo(x - 7, y);
        ctx.lineTo(x + 7, y);
        ctx.lineTo(x, y + 8);
        ctx.closePath();
        ctx.fill();
      }
    }
  }
}

function dessinerPierres() {
  if (!visCases) {
    return;
  }
  for (let r = 0; r < M.R; r++) {
    for (let c = 0; c < M.C; c++) {
      const p = visCases[r][c].pierre;
      if (!p) {
        continue;
      }
      const x = xCase(c) + CASE / 2;
      const y = yCase(r) + CASE / 2;
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath();
      ctx.ellipse(x + 2, y + 4, 23, 20, 0, 0, Math.PI * 2);
      ctx.fill();
      const g = ctx.createRadialGradient(x - 8, y - 10, 3, x, y, 28);
      g.addColorStop(0, "#c9c3b8");
      g.addColorStop(0.6, "#8a8478");
      g.addColorStop(1, "#4a463f");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x - 22, y + 6);
      ctx.quadraticCurveTo(x - 24, y - 16, x - 4, y - 21);
      ctx.quadraticCurveTo(x + 22, y - 20, x + 23, y + 2);
      ctx.quadraticCurveTo(x + 22, y + 21, x, y + 20);
      ctx.quadraticCurveTo(x - 20, y + 21, x - 22, y + 6);
      ctx.fill();
      // Mousse
      ctx.fillStyle = "#6f9a3a";
      ctx.beginPath();
      ctx.ellipse(x - 6, y - 16, 12, 5, -0.2, 0, Math.PI * 2);
      ctx.ellipse(x + 10, y - 14, 7, 4, 0.3, 0, Math.PI * 2);
      ctx.fill();
      if (p === 1) {
        ctx.strokeStyle = "#2e2a25";
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(x - 3, y - 10);
        ctx.lineTo(x + 2, y - 1);
        ctx.lineTo(x - 4, y + 6);
        ctx.lineTo(x + 3, y + 15);
        ctx.moveTo(x + 2, y - 1);
        ctx.lineTo(x + 12, y + 3);
        ctx.stroke();
      } else {
        ctx.fillStyle = "rgba(0,0,0,0.25)";
        ctx.font = "700 12px 'Shippori Mincho B1', serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("石", x, y + 3);
      }
    }
  }
}

function dessinerPieces() {
  ctx.save();
  ctx.beginPath();
  ctx.rect(PLATEAU.x - 6, PLATEAU.y - 2, CASE * M.C + 12, CASE * M.R + 8);
  ctx.clip();
  const taille = CASE;
  vis.forEach(p => {
    const img = sprite(p.type, p.special);
    let ex = p.echelle;
    let dx = 0;
    if (indice && (indice[0] === p.id || indice[1] === p.id)) {
      dx = Math.sin(temps * 18) * 3;
    }
    if (selection && selection.id === p.id) {
      ex *= 1 + Math.sin(temps * 10) * 0.06;
    }
    const cx = xCase(p.x) + CASE / 2 + dx;
    const cy = yCase(p.y) + CASE / 2;
    ctx.globalAlpha = p.alpha;
    ctx.save();
    ctx.translate(cx, cy);
    if (p.special === "h" || p.special === "v" || p.special === "arme") {
      ex *= 1 + Math.sin(temps * 5 + p.id) * 0.03;
    }
    ctx.scale(ex, ex);
    ctx.drawImage(img, -taille / 2, -taille / 2, taille, taille);
    ctx.restore();
  });
  ctx.globalAlpha = 1;
  ctx.restore();
}

function dessinerSelection() {
  if (ecranActuel !== "jeu") {
    return;
  }
  const marque = (r, c, couleur) => {
    ctx.strokeStyle = couleur;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(xCase(c) + 3, yCase(r) + 3, CASE - 6, CASE - 6, 10);
    ctx.stroke();
  };
  if (selection) {
    marque(selection.r, selection.c, "#fff3c4");
  }
  if (modeClavier) {
    marque(curseur.r, curseur.c, "rgba(198,243,90,0.9)");
  }
}

function dessinerEffets() {
  effetsVisuels.forEach(e => {
    const k = e.age / e.duree;
    if (e.type === "rayon") {
      const x = xCase(e.c) + CASE / 2;
      const y = yCase(e.r) + CASE / 2;
      const ep = 16 * (1 - k);
      ctx.fillStyle = "rgba(255,255,255," + (1 - k) + ")";
      if (e.dir === "h") {
        ctx.fillRect(PLATEAU.x, y - ep / 2, CASE * M.C, ep);
        ctx.fillStyle = "rgba(255,226,120," + (1 - k) + ")";
        ctx.fillRect(PLATEAU.x, y - ep, CASE * M.C, ep * 0.35);
        ctx.fillRect(PLATEAU.x, y + ep * 0.65, CASE * M.C, ep * 0.35);
      } else {
        ctx.fillRect(x - ep / 2, PLATEAU.y, ep, CASE * M.R);
        ctx.fillStyle = "rgba(255,226,120," + (1 - k) + ")";
        ctx.fillRect(x - ep, PLATEAU.y, ep * 0.35, CASE * M.R);
        ctx.fillRect(x + ep * 0.65, PLATEAU.y, ep * 0.35, CASE * M.R);
      }
    } else if (e.type === "explosion") {
      const x = xCase(e.c) + CASE / 2;
      const y = yCase(e.r) + CASE / 2;
      const rayon = CASE * (e.rayon + 0.5) * (0.4 + k * 0.8);
      ctx.strokeStyle = "rgba(255,240,190," + (1 - k) + ")";
      ctx.lineWidth = 10 * (1 - k) + 1;
      ctx.beginPath();
      ctx.arc(x, y, rayon, 0, Math.PI * 2);
      ctx.stroke();
    } else if (e.type === "daruma" || e.type === "grandDaruma") {
      const x0 = xCase(e.c) + CASE / 2;
      const y0 = yCase(e.r) + CASE / 2;
      ctx.strokeStyle = "rgba(255,255,255," + (1 - k) + ")";
      ctx.lineWidth = 2.5;
      (e.cibles || []).forEach(([r, c], i) => {
        const x1 = xCase(c) + CASE / 2;
        const y1 = yCase(r) + CASE / 2;
        // Petit eclair en zigzag
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        const etapes = 4;
        for (let s = 1; s < etapes; s++) {
          const t = s / etapes;
          const decal = ((i * 7 + s * 13) % 10 - 5) * 1.6;
          ctx.lineTo(x0 + (x1 - x0) * t + decal, y0 + (y1 - y0) * t - decal);
        }
        ctx.lineTo(x1, y1);
        ctx.stroke();
      });
      if (e.type === "grandDaruma") {
        ctx.fillStyle = "rgba(255,255,255," + (0.6 * (1 - k)) + ")";
        ctx.fillRect(PLATEAU.x, PLATEAU.y, CASE * M.C, CASE * M.R);
      }
    }
  });
  particules.forEach(p => {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.globalAlpha = Math.min(1, p.vie * 3);
    ctx.fillStyle = p.couleur;
    if (p.forme === "petale") {
      ctx.beginPath();
      ctx.ellipse(0, 0, p.taille, p.taille * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(-p.taille / 2, -p.taille / 2, p.taille, p.taille);
    }
    ctx.restore();
  });
  ctx.globalAlpha = 1;
}

function texteContour(t, x, y, taille, couleur, contour, alignement) {
  ctx.font = "800 " + taille + "px 'Anybody', sans-serif";
  ctx.textAlign = alignement || "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(3, taille * 0.18);
  ctx.strokeStyle = contour || "#2a1030";
  ctx.strokeText(t, x, y);
  ctx.fillStyle = couleur;
  ctx.fillText(t, x, y);
}

function dessinerTextes() {
  textes.forEach(t => {
    const k = t.age / t.duree;
    if (t.grand) {
      const s = k < 0.15 ? 0.5 + (k / 0.15) * 0.7 : k < 0.25 ? 1.2 - ((k - 0.15) / 0.1) * 0.2 : 1;
      ctx.save();
      ctx.globalAlpha = k > 0.8 ? (1 - k) / 0.2 : 1;
      ctx.translate(t.x, t.y);
      ctx.scale(s, s);
      texteContour(t.texte, 0, 0, t.taille, t.couleur, "#3a0d2a");
      ctx.restore();
    } else {
      ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      texteContour(t.texte, t.x, t.y - k * 30, t.taille, t.couleur, "#2a1030");
    }
  });
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------
// Tete de l'ecran de jeu : coups, objectif, score et etoiles
// ---------------------------------------------------------------------

function panneau(x, y, w, h) {
  ctx.fillStyle = "rgba(24,12,36,0.72)";
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 14);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,226,170,0.45)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function petitePiece(type, x, y, taille) {
  const img = sprite(type, null);
  ctx.drawImage(img, x - taille / 2, y - taille / 2, taille, taille);
}

function dessinerTete() {
  // Coups restants
  panneau(14, 12, 104, 118);
  ctx.fillStyle = "#e8d9ff";
  ctx.font = "600 9px 'Martian Mono', monospace";
  ctx.textAlign = "center";
  ctx.fillText("COUPS", 66, 32);
  texteContour(String(partie.coups), 66, 76, 46, partie.coups <= 5 ? "#ff8a7a" : "#ffffff", "#2a1030");
  ctx.fillStyle = "#e8d9ff";
  ctx.font = "600 9px 'Martian Mono', monospace";
  ctx.fillText("NIVEAU " + niveau.n, 66, 114);

  // Objectif
  panneau(126, 12, 220, 118);
  ctx.fillStyle = "#e8d9ff";
  ctx.font = "600 9px 'Martian Mono', monospace";
  ctx.fillText("OBJECTIF", 236, 32);
  const o = niveau.objectif;
  if (o.type === "score") {
    texteContour(o.score.toLocaleString("fr-BE"), 236, 72, 26, "#ffe38a");
    ctx.fillStyle = "#e8d9ff";
    ctx.font = "600 9px 'Martian Mono', monospace";
    ctx.fillText("points à atteindre", 236, 104);
  } else if (o.type === "collecte") {
    o.cibles.forEach((cible, i) => {
      const x = o.cibles.length === 1 ? 236 : 186 + i * 100;
      petitePiece(cible.type, x - 20, 74, 38);
      const reste = Math.max(0, cible.quantite - (partie.collecte[cible.type] || 0));
      texteContour(reste ? String(reste) : "✓", x + 18, 76, 24, reste ? "#ffffff" : "#c6f35a");
    });
  } else if (o.type === "sceaux") {
    ctx.fillStyle = "#f6ead0";
    ctx.beginPath();
    ctx.roundRect(176, 56, 36, 36, 6);
    ctx.fill();
    ctx.strokeStyle = "#c8372d";
    ctx.lineWidth = 2;
    ctx.stroke();
    const reste = M.sceauxRestants(partie);
    texteContour(reste ? String(reste) : "✓", 262, 76, 28, reste ? "#ffffff" : "#c6f35a");
    ctx.fillStyle = "#e8d9ff";
    ctx.font = "600 9px 'Martian Mono', monospace";
    ctx.fillText("sceaux à briser", 236, 112);
  } else {
    petitePiece(M.LANTERNE, 196, 74, 40);
    texteContour(partie.lanternesLivrees + " / " + o.total, 268, 76, 26, partie.lanternesLivrees >= o.total ? "#c6f35a" : "#ffffff");
    ctx.fillStyle = "#e8d9ff";
    ctx.font = "600 9px 'Martian Mono', monospace";
    ctx.fillText("lanternes à descendre", 236, 112);
  }

  // Score et jauge d'etoiles
  panneau(354, 12, 172, 118);
  ctx.fillStyle = "#e8d9ff";
  ctx.font = "600 9px 'Martian Mono', monospace";
  ctx.textAlign = "center";
  ctx.fillText("SCORE", 440, 32);
  texteContour(Math.round(scoreAffiche).toLocaleString("fr-BE"), 440, 62, 24, "#ffffff");
  const max = niveau.etoiles[2] * 1.08;
  const jx = 370;
  const jw = 140;
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.beginPath();
  ctx.roundRect(jx, 88, jw, 10, 5);
  ctx.fill();
  const remplissage = Math.min(1, scoreAffiche / max);
  const g = ctx.createLinearGradient(jx, 0, jx + jw, 0);
  g.addColorStop(0, "#f06aa6");
  g.addColorStop(1, "#ffe38a");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(jx, 88, Math.max(10, jw * remplissage), 10, 5);
  ctx.fill();
  niveau.etoiles.forEach((s, i) => {
    const x = jx + jw * Math.min(1, s / max);
    etoile(x, 112, 9, scoreAffiche >= s && (i > 0 || M.objectifAtteint(partie) || niveau.objectif.type === "score"));
  });
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

// ---------------------------------------------------------------------
// Carte des niveaux
// ---------------------------------------------------------------------

function positionCarte(n) {
  // Un chemin qui serpente en montant
  const y = H - 90 - (n - 1) * 92 + carteDefil;
  const x = W / 2 + Math.sin(n * 0.9) * 150;
  return [x, y];
}

function dessinerCarte() {
  ctx.drawImage(fond, 0, 0, W, H);
  ctx.fillStyle = "rgba(20,10,30,0.25)";
  ctx.fillRect(0, 0, W, H);
  const premier = Math.max(1, Math.floor((carteDefil - H) / 92));
  const dernier = premier + 12;
  // Chemin de pierres
  ctx.strokeStyle = "rgba(255,236,200,0.55)";
  ctx.lineWidth = 6;
  ctx.setLineDash([2, 12]);
  ctx.lineCap = "round";
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
    if (y < -60 || y > H + 60) {
      continue;
    }
    const ouvert = n <= progres.max;
    const courant = n === progres.max;
    const choisi = n === carteChoix;
    // Lanterne de pierre : chaque niveau en est une
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(x + 3, y + 30, 30, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    const g = ctx.createRadialGradient(x - 10, y - 12, 4, x, y, 36);
    g.addColorStop(0, ouvert ? (courant ? "#fff0a0" : "#ffb0c8") : "#a49cb8");
    g.addColorStop(1, ouvert ? (courant ? "#e8a316" : "#c8376f") : "#4a4360");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, choisi ? 31 : 27, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = choisi ? "#ffffff" : "rgba(40,10,40,0.7)";
    ctx.stroke();
    texteContour(String(n), x, y + 1, n > 99 ? 18 : 22, ouvert ? "#ffffff" : "#d0c8e0", "#3a0d2a");
    const e = progres.etoiles[n] || 0;
    if (ouvert && n < progres.max) {
      [-1, 0, 1].forEach((d, i) => etoile(x + d * 18, y - 40 + Math.abs(d) * 5, 8, i < e));
    }
    if (courant) {
      // Le tanuki attend devant le niveau a jouer
      const by = y - 52 + Math.sin(temps * 4) * 3;
      ctx.fillStyle = "#8a6a4a";
      ctx.beginPath();
      ctx.arc(x, by, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#3a2a1e";
      ctx.beginPath();
      ctx.ellipse(x - 5, by, 4, 3, 0, 0, Math.PI * 2);
      ctx.ellipse(x + 5, by, 4, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillRect(x - 6, by - 1, 2, 2);
      ctx.fillRect(x + 4, by - 1, 2, 2);
      ctx.fillStyle = "#8a6a4a";
      ctx.beginPath();
      ctx.moveTo(x - 11, by - 6);
      ctx.lineTo(x - 7, by - 15);
      ctx.lineTo(x - 3, by - 10);
      ctx.moveTo(x + 11, by - 6);
      ctx.lineTo(x + 7, by - 15);
      ctx.lineTo(x + 3, by - 10);
      ctx.fill();
    }
  }
  // Bandeau du haut
  panneau(14, 12, W - 28, 70);
  texteContour("OMAMORI CRUSH", 34, 40, 28, "#ffffff", "#3a0d2a", "left");
  ctx.fillStyle = "#e8d9ff";
  ctx.font = "600 10px 'Martian Mono', monospace";
  ctx.textAlign = "left";
  ctx.fillText(totalEtoiles() + " étoiles   " + totalScores().toLocaleString("fr-BE") + " points", 36, 66);
  ctx.textAlign = "right";
  ctx.fillText("Niveau " + carteChoix, W - 34, 40);
  ctx.fillStyle = "#c6f35a";
  ctx.fillText(carteChoix <= progres.max ? "Touche pour jouer" : "Pas encore ouvert", W - 34, 62);
}

// ---------------------------------------------------------------------
// Fenetres : presentation du niveau, resultat
// ---------------------------------------------------------------------

function phraseObjectif(n) {
  const o = n.objectif;
  if (o.type === "score") {
    return "Atteins " + o.score.toLocaleString("fr-BE") + " points";
  }
  if (o.type === "collecte") {
    return "Ramasse " + o.cibles.map(c => c.quantite + " " + NOMS[c.type] + (c.quantite > 1 ? "s" : "")).join(" et ");
  }
  if (o.type === "sceaux") {
    return "Brise tous les sceaux de papier";
  }
  return "Fais descendre " + o.total + " lanternes";
}

function fenetre(titre, lignes, boutons) {
  ctx.fillStyle = "rgba(14,6,24,0.6)";
  ctx.fillRect(0, 0, W, H);
  const w = 400;
  const h = 300;
  const x = (W - w) / 2;
  const y = 170;
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
  texteContour(titre, W / 2, y + 1, 24, "#ffffff", "#7e211b");
  lignes(x, y, w, h);
  boutons.forEach((b, i) => {
    const bw = (w - 60 - (boutons.length - 1) * 14) / boutons.length;
    const bx = x + 30 + i * (bw + 14);
    const by = y + h - 70;
    b.zone = [bx, by, bw, 48];
    ctx.fillStyle = b.principal ? "#7fbf2a" : "#f06aa6";
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, 48, 14);
    ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(bx + 8, by + 40, bw - 16, 4);
    texteContour(b.texte, bx + bw / 2, by + 24, 18, "#ffffff", b.principal ? "#3f6912" : "#8e2558");
  });
  boutonsFenetre = boutons;
}

let boutonsFenetre = [];

function dessinerIntro() {
  fenetre("Niveau " + niveau.n, (x, y, w) => {
    ctx.fillStyle = "#3a2030";
    ctx.font = "700 16px 'Hanken Grotesk', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(phraseObjectif(niveau), W / 2, y + 70);
    ctx.font = "600 12px 'Martian Mono', monospace";
    ctx.fillStyle = "#7e5a6a";
    ctx.fillText("en " + niveau.coups + " coups", W / 2, y + 96);
    [-1, 0, 1].forEach((d, i) => etoile(W / 2 + d * 44, y + 150 - (d === 0 ? 8 : 0), d === 0 ? 22 : 18, i < (progres.etoiles[niveau.n] || 0)));
    if (progres.meilleurs[niveau.n]) {
      ctx.fillStyle = "#7e5a6a";
      ctx.font = "600 11px 'Martian Mono', monospace";
      ctx.fillText("Meilleur : " + progres.meilleurs[niveau.n].toLocaleString("fr-BE"), W / 2, y + 196);
    }
  }, [{ texte: "Carte", action: allerCarte }, { texte: "Jouer", principal: true, action: () => {
    ecranActuel = "jeu";
    son("pouvoir");
  } }]);
}

function dessinerResultat() {
  const r = resultat;
  fenetre(r.gagne ? "Bravo !" : "Raté…", (x, y) => {
    if (r.gagne) {
      [-1, 0, 1].forEach((d, i) => {
        const montre = r.age > 0.3 + i * 0.35;
        etoile(W / 2 + d * 56, y + 84 - (d === 0 ? 12 : 0), d === 0 ? 30 : 24, montre && i < r.etoiles);
      });
      texteContour(partie.score.toLocaleString("fr-BE"), W / 2, y + 152, 32, "#ffffff", "#7e211b");
      ctx.fillStyle = "#7e5a6a";
      ctx.font = "600 11px 'Martian Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText(r.record ? "Nouveau record pour ce niveau !" : "points", W / 2, y + 186);
    } else {
      ctx.fillStyle = "#3a2030";
      ctx.font = "700 16px 'Hanken Grotesk', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Plus de coups !", W / 2, y + 80);
      ctx.font = "600 12px 'Martian Mono', monospace";
      ctx.fillStyle = "#7e5a6a";
      ctx.fillText(r.raison, W / 2, y + 112);
      texteContour(partie.score.toLocaleString("fr-BE"), W / 2, y + 160, 26, "#ffffff", "#7e211b");
    }
  }, r.gagne
    ? [{ texte: "Carte", action: allerCarte }, { texte: "Rejouer", action: () => lancerNiveau(niveau.n) }, { texte: "Suivant", principal: true, action: () => lancerNiveau(niveau.n + 1) }]
    : [{ texte: "Carte", action: allerCarte }, { texte: "Rejouer", principal: true, action: () => lancerNiveau(niveau.n) }]);
}

// ---------------------------------------------------------------------
// Image
// ---------------------------------------------------------------------

function dessiner() {
  ctx.setTransform(echelle, 0, 0, echelle, 0, 0);
  if (ecranActuel === "carte") {
    dessinerCarte();
    return;
  }
  ctx.drawImage(fond, 0, 0, W, H);
  dessinerTete();
  dessinerPlateau();
  dessinerPierres();
  dessinerPieces();
  dessinerSelection();
  dessinerEffets();
  dessinerTextes();
  if (ecranActuel === "intro") {
    dessinerIntro();
  } else if (ecranActuel === "resultat") {
    dessinerResultat();
  }
}

// ---------------------------------------------------------------------
// Deroule d'un coup
// ---------------------------------------------------------------------

function exploserPiece(p, couleurForcee) {
  const cx = xCase(p.x) + CASE / 2;
  const cy = yCase(p.y) + CASE / 2;
  const couleur = couleurForcee || (p.type >= 0 ? COULEURS[p.type] : { base: "#ffd23a", claire: "#fff" });
  for (let i = 0; i < 9; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = 120 + Math.random() * 220;
    particules.push({
      x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 160,
      vie: 0.5 + Math.random() * 0.4, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12,
      taille: 3 + Math.random() * 4, couleur: i % 3 ? couleur.base : couleur.claire,
      forme: p.type === 4 ? "petale" : "eclat"
    });
  }
}

function texteVolant(texte, x, y, couleur, taille) {
  textes.push({ texte, x, y, couleur: couleur || "#ffffff", taille: taille || 18, age: 0, duree: 0.9 });
}

function grandTexte(texte, couleur, taille) {
  textes.push({ texte, x: W / 2, y: PLATEAU.y + CASE * 4.5, couleur, taille: taille || 54, age: 0, duree: 1.4, grand: true });
}

const MOTS = [[8, "Divin !", "#c6f35a"], [6, "Sublime !", "#ffe38a"], [4, "Superbe !", "#ffb0c8"], [3, "Bien !", "#a9e4ff"]];

async function executer(phases) {
  let cascadeMax = 1;
  for (const ph of phases) {
    if (ph.type === "echange") {
      const a = vis.get(ph.ida);
      const b = vis.get(ph.idb);
      animer(a, { x: ph.b[1], y: ph.b[0] }, 0.16);
      animer(b, { x: ph.a[1], y: ph.a[0] }, 0.16);
      son(ph.retour ? "clic" : "grain");
      await attendre(0.17);
    } else if (ph.type === "transformation") {
      ph.transformes.forEach(t => {
        const p = vis.get(t.id);
        if (p) {
          p.special = t.special;
          p.type = t.type;
          p.echelle = 1.4;
          animer(p, { echelle: 1 }, 0.25, "sortie");
        }
      });
      son(ph.finale ? "tir" : "pouvoir");
      await attendre(ph.finale ? 0.5 : 0.3);
    } else if (ph.type === "disparition") {
      cascadeMax = Math.max(cascadeMax, ph.cascade);
      ph.effets.forEach(e => {
        effetsVisuels.push(Object.assign({ age: 0, duree: e.type === "rayon" ? 0.4 : 0.5 }, e));
      });
      if (ph.effets.some(e => e.type === "daruma" || e.type === "grandDaruma")) {
        son("pouvoir");
      } else if (ph.effets.some(e => e.type === "explosion")) {
        son("explosion");
      } else if (ph.effets.some(e => e.type === "rayon")) {
        son("tir");
      }
      son("combo", ph.cascade);
      ph.retires.forEach(id => {
        const p = vis.get(id);
        if (p) {
          animer(p, { echelle: 1.25 }, 0.08);
        }
      });
      await attendre(ph.effets.length ? 0.16 : 0.08);
      ph.retires.forEach(id => {
        const p = vis.get(id);
        if (p) {
          exploserPiece(p);
          animer(p, { echelle: 0, alpha: 0 }, 0.16);
        }
      });
      ph.transformes.forEach(t => {
        const p = vis.get(t.id);
        if (p) {
          p.special = t.special;
          p.type = t.type;
          p.echelle = 1.5;
          animer(p, { echelle: 1 }, 0.3, "sortie");
        }
      });
      ph.points.forEach(pt => texteVolant(pt.valeur.toLocaleString("fr-BE"), xCase(pt.c) + CASE / 2, yCase(pt.r) + CASE / 2, pt.valeur >= 1000 ? "#ffe38a" : "#ffffff", pt.valeur >= 1000 ? 22 : 18));
      if (JSON.stringify(ph.cases) !== JSON.stringify(visCases)) {
        son("bonus");
      }
      visCases = ph.cases;
      await attendre(0.17);
      ph.retires.forEach(id => vis.delete(id));
    } else if (ph.type === "chute") {
      let duree = 0.1;
      ph.mouvements.forEach(m => {
        const p = vis.get(m.id);
        if (p) {
          const d = Math.max(0.12, Math.sqrt(m.r - p.y) * 0.13);
          duree = Math.max(duree, d);
          animer(p, { y: m.r, x: m.c }, d, "rebond");
        }
      });
      ph.nouveaux.forEach(nv => {
        const p = { id: nv.id, type: nv.type, special: nv.special, x: nv.c, y: nv.de, echelle: 1, alpha: 1 };
        vis.set(nv.id, p);
        const d = Math.max(0.15, Math.sqrt(nv.r - nv.de) * 0.13);
        duree = Math.max(duree, d);
        animer(p, { y: nv.r }, d, "rebond");
      });
      visCases = ph.cases;
      await attendre(duree + 0.02);
    } else if (ph.type === "livraison") {
      ph.livrees.forEach(l => {
        const p = vis.get(l.id);
        if (p) {
          animer(p, { y: p.y + 1.2, alpha: 0, echelle: 0.6 }, 0.4);
          texteVolant("10 000", xCase(l.c) + CASE / 2, yCase(l.r) + CASE / 2, "#ffe38a", 24);
        }
      });
      son("vie");
      await attendre(0.42);
      ph.livrees.forEach(l => vis.delete(l.id));
      visCases = ph.cases;
    } else if (ph.type === "melange") {
      grandTexte("Mélange !", "#ffffff", 42);
      ph.positions.forEach(pos => {
        const p = vis.get(pos.id);
        if (p) {
          animer(p, { x: pos.c, y: pos.r }, 0.5);
        }
      });
      son("vague");
      await attendre(0.6);
    }
  }
  const mot = MOTS.find(([n]) => cascadeMax >= n);
  if (mot) {
    grandTexte(mot[1], mot[2]);
  }
}

function synchroniser() {
  // Remet l'affichage exactement sur l'etat du moteur
  vis = new Map();
  partie.g.forEach((ligne, r) => ligne.forEach((p, c) => {
    if (p) {
      vis.set(p.id, { id: p.id, type: p.type, special: p.special, x: c, y: r, echelle: 1, alpha: 1 });
    }
  }));
  visCases = partie.cases.map(l => l.map(k => ({ sceau: k.sceau, pierre: k.pierre })));
}

async function jouerCoup(a, b) {
  if (occupe || ecranActuel !== "jeu") {
    return;
  }
  occupe = true;
  selection = null;
  indice = null;
  inactif = 0;
  const res = M.jouer(partie, [a.r, a.c], [b.r, b.c]);
  await executer(res.phases);
  synchroniser();
  if (res.valide) {
    await apresCoup();
  }
  occupe = false;
}

async function apresCoup() {
  if (M.objectifAtteint(partie)) {
    grandTexte("Objectif atteint !", "#c6f35a", 40);
    son("vie");
    await attendre(1.2);
    if (partie.coups > 0 || vis.size) {
      grandTexte("Fête finale !", "#ffe38a", 46);
      await attendre(0.6);
      const phases = M.feteFinale(partie);
      await executer(phases);
      synchroniser();
    }
    terminerNiveau(true);
  } else if (partie.coups <= 0) {
    await attendre(0.4);
    terminerNiveau(false);
  }
}

function terminerNiveau(gagne) {
  const n = niveau.n;
  let record = false;
  let etoiles = 0;
  if (gagne) {
    etoiles = Math.max(1, M.etoilesPour(partie));
    progres.etoiles[n] = Math.max(progres.etoiles[n] || 0, etoiles);
    if (partie.score > (progres.meilleurs[n] || 0)) {
      progres.meilleurs[n] = partie.score;
      record = true;
    }
    progres.max = Math.max(progres.max, n + 1);
    sauver();
    majScoreCourant(ID, totalScores());
    son("vie");
  } else {
    son("mort");
  }
  const o = niveau.objectif;
  const raison = o.type === "sceaux" ? M.sceauxRestants(partie) + " sceaux restants"
    : o.type === "lanternes" ? (o.total - partie.lanternesLivrees) + " lanternes restantes"
    : o.type === "collecte" ? "Il manquait des porte-bonheur"
    : "Il manquait " + (o.score - partie.score).toLocaleString("fr-BE") + " points";
  resultat = { gagne, etoiles, record, raison, age: 0 };
  ecranActuel = "resultat";
}

// ---------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------

function lancerNiveau(n) {
  niveau = M.genererNiveau(n);
  partie = M.creerPartie(niveau);
  synchroniser();
  scoreAffiche = 0;
  selection = null;
  indice = null;
  inactif = 0;
  animations = [];
  attentes = [];
  textes = [];
  particules = [];
  effetsVisuels = [];
  occupe = false;
  carteChoix = n;
  ecranActuel = "intro";
}

function allerCarte() {
  ecranActuel = "carte";
  carteChoix = Math.min(carteChoix, progres.max);
  centrerCarte(carteChoix);
}

function centrerCarte(n) {
  carteDefil = (n - 1) * 92 - (H / 2 - 90) + 90;
  carteDefil = Math.max(0, carteDefil);
}

// ---------------------------------------------------------------------
// Boucle
// ---------------------------------------------------------------------

function maj(dt) {
  temps += dt;
  majAnimations(dt);
  if (partie) {
    scoreAffiche += (partie.score - scoreAffiche) * Math.min(1, dt * 8);
    if (Math.abs(partie.score - scoreAffiche) < 1) {
      scoreAffiche = partie.score;
    }
  }
  if (resultat) {
    resultat.age += dt;
  }
  if (ecranActuel === "jeu" && !occupe) {
    inactif += dt;
    if (inactif > 6 && !indice) {
      montrerIndice();
    }
  }
}

function montrerIndice() {
  if (!partie || occupe || ecranActuel !== "jeu") {
    return;
  }
  const coups = M.tousLesCoups(partie);
  if (coups.length) {
    const [a, b] = coups[Math.floor(Math.random() * coups.length)];
    indice = [partie.g[a[0]][a[1]].id, partie.g[b[0]][b[1]].id];
  }
}

const boucle = creerBoucle(function (dt) {
  maj(dt);
  dessiner();
}, { plafond: 1 / 20 });

function ajuster() {
  const marge = window.innerWidth >= 1100 ? 500 : 0;
  const largeur = Math.min(window.innerWidth * 0.96 - marge, 620);
  const entete = zone.querySelector(".entete-omamori").getBoundingClientRect().height || 40;
  const manette = (document.querySelector(".manette:not([hidden])") ? document.querySelector(".manette:not([hidden])").getBoundingClientRect().height : 0);
  const hauteur = Math.max(300, window.innerHeight - entete - manette - 40);
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
// Commandes
// ---------------------------------------------------------------------

let modeClavier = false;
let depart = null;

function pointLogique(evenement) {
  const r = canvas.getBoundingClientRect();
  return [(evenement.clientX - r.left) / r.width * W, (evenement.clientY - r.top) / r.height * H];
}

function caseSous(x, y) {
  const c = Math.floor((x - PLATEAU.x) / CASE);
  const r = Math.floor((y - PLATEAU.y) / CASE);
  if (r < 0 || r >= M.R || c < 0 || c >= M.C || !M.libre(partie, r, c)) {
    return null;
  }
  return { r, c, id: partie.g[r][c] ? partie.g[r][c].id : null };
}

function cliquerFenetre(x, y) {
  const b = boutonsFenetre.find(bt => bt.zone && x >= bt.zone[0] && x <= bt.zone[0] + bt.zone[2] && y >= bt.zone[1] && y <= bt.zone[1] + bt.zone[3]);
  if (b) {
    son("clic");
    b.action();
    return true;
  }
  return false;
}

canvas.addEventListener("pointerdown", function (evenement) {
  if (!jeuAuPremierPlan(ID)) {
    return;
  }
  evenement.preventDefault();
  modeClavier = false;
  const [x, y] = pointLogique(evenement);
  if (ecranActuel === "carte") {
    depart = { x, y, defil: carteDefil, bouge: false };
    canvas.setPointerCapture(evenement.pointerId);
    return;
  }
  if (ecranActuel === "intro" || ecranActuel === "resultat") {
    cliquerFenetre(x, y);
    return;
  }
  if (occupe) {
    return;
  }
  const k = caseSous(x, y);
  if (!k) {
    selection = null;
    return;
  }
  canvas.setPointerCapture(evenement.pointerId);
  if (selection && M.voisins([selection.r, selection.c], [k.r, k.c])) {
    const a = selection;
    selection = null;
    jouerCoup(a, k);
    return;
  }
  selection = k;
  depart = { x, y, k };
  son("clic");
});

canvas.addEventListener("pointermove", function (evenement) {
  if (!depart) {
    return;
  }
  const [x, y] = pointLogique(evenement);
  if (ecranActuel === "carte") {
    if (Math.abs(y - depart.y) > 6) {
      depart.bouge = true;
    }
    carteDefil = Math.max(0, depart.defil + (y - depart.y));
    return;
  }
  if (!depart.k || occupe) {
    return;
  }
  const dx = x - depart.x;
  const dy = y - depart.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) > CASE * 0.35) {
    const a = depart.k;
    const b = Math.abs(dx) > Math.abs(dy) ? { r: a.r, c: a.c + Math.sign(dx) } : { r: a.r + Math.sign(dy), c: a.c };
    depart = null;
    if (b.r >= 0 && b.r < M.R && b.c >= 0 && b.c < M.C) {
      jouerCoup(a, b);
    }
  }
});

canvas.addEventListener("pointerup", function (evenement) {
  if (ecranActuel === "carte" && depart && !depart.bouge) {
    const [x, y] = pointLogique(evenement);
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
  depart = null;
});

canvas.addEventListener("wheel", function (evenement) {
  if (ecranActuel === "carte") {
    evenement.preventDefault();
    carteDefil = Math.max(0, carteDefil - evenement.deltaY * 0.6);
  }
}, { passive: false });
canvas.addEventListener("contextmenu", evenement => evenement.preventDefault());

const DIRS = { arrowup: [-1, 0], arrowdown: [1, 0], arrowleft: [0, -1], arrowright: [0, 1] };

surTouche(ID, function (evenement) {
  const touche = evenement.key.toLowerCase();
  if (touche === "escape") {
    quitterJeu();
    return;
  }
  if (touche === "m") {
    basculerSon();
    majBoutonSon();
    evenement.preventDefault();
    return;
  }
  if (ecranActuel === "carte") {
    if (touche === "arrowup" || touche === "arrowright") {
      carteChoix = Math.min(progres.max, carteChoix + 1);
      centrerCarte(carteChoix);
    } else if (touche === "arrowdown" || touche === "arrowleft") {
      carteChoix = Math.max(1, carteChoix - 1);
      centrerCarte(carteChoix);
    } else if (touche === " " || touche === "enter" || touche === "p") {
      lancerNiveau(carteChoix);
    } else {
      return;
    }
    evenement.preventDefault();
    return;
  }
  if (ecranActuel === "intro" || ecranActuel === "resultat") {
    if (touche === " " || touche === "enter" || touche === "p") {
      const principal = boutonsFenetre.find(b => b.principal);
      if (principal) {
        principal.action();
      }
    } else if (touche === "h" || touche === "backspace") {
      allerCarte();
    } else {
      return;
    }
    evenement.preventDefault();
    return;
  }
  if (touche === "h") {
    montrerIndice();
    evenement.preventDefault();
    return;
  }
  if (touche === "p") {
    allerCarte();
    evenement.preventDefault();
    return;
  }
  const d = DIRS[touche];
  if (d) {
    modeClavier = true;
    if (selection) {
      const a = selection;
      const b = { r: a.r + d[0], c: a.c + d[1] };
      selection = null;
      if (b.r >= 0 && b.r < M.R && b.c >= 0 && b.c < M.C) {
        curseur = { r: b.r, c: b.c };
        jouerCoup(a, b);
      }
    } else {
      curseur = { r: Math.max(0, Math.min(M.R - 1, curseur.r + d[0])), c: Math.max(0, Math.min(M.C - 1, curseur.c + d[1])) };
    }
    evenement.preventDefault();
  } else if (touche === " " || touche === "enter") {
    modeClavier = true;
    if (selection) {
      selection = null;
    } else if (M.libre(partie, curseur.r, curseur.c)) {
      selection = { r: curseur.r, c: curseur.c, id: partie.g[curseur.r][curseur.c].id };
      son("clic");
    }
    evenement.preventDefault();
  }
});

function majBoutonSon() {
  boutonSon.textContent = sonActif() ? "Son" : "Muet";
}

boutonSon.addEventListener("click", function () {
  basculerSon();
  majBoutonSon();
});
boutonCarte.addEventListener("click", allerCarte);
boutonClassement.addEventListener("click", function () {
  finDePartie(ID, totalScores(), "Omamori Crush");
});
boutonQuitter.addEventListener("click", quitterJeu);

function demarrer() {
  progres = Object.assign({ max: 1, etoiles: {}, meilleurs: {} }, stockage.lire() || {});
  fond = null;
  ajuster();
  requestAnimationFrame(ajuster);
  carteChoix = progres.max;
  allerCarte();
  majScoreCourant(ID, totalScores());
  majBoutonSon();
  boucle.lancer();
}

// Pour les tests automatiques
export const _test = { get partie() { return partie; }, lancerNiveau, get ecran() { return ecranActuel; }, set ecran(v) { ecranActuel = v; }, jouerCoup };

enregistrerJeu({
  id: ID,
  nom: "Omamori Crush",
  code: "2001",
  section: zone,
  demarrer,
  arreter: () => boucle.arreter(),
  formaterScore: score => Number(score).toLocaleString("fr-BE"),
  manette: { a: " ", b: "h", start: "p", quatreDirections: true, repetition: true, libelles: { a: "Saisir", b: "Indice" } }
});
