// =====================================================================
//  PICROSS - les dessins caches
//  Les chiffres au bord de la grille donnent les suites de cases pleines
//  de chaque ligne et de chaque colonne : on creuse les bonnes cases,
//  on marque d'une croix celles qui restent vides, et le dessin apparait
//  en couleurs a la fin. Les 21 dessins faits main d'abord, puis des
//  grilles generees sans fin (blasons, paysages, rosaces), chacune
//  verifiee : elle se resout sans jamais deviner.
//  Classement : le temps, par taille (5, 10, 15), penalites comprises.
// =====================================================================

import { enregistrerJeu, finDePartie, quitterJeu, majScoreCourant } from "./arcade.js";
import { surTouche, surRelachement, jeuAuPremierPlan } from "./noyau/clavier.js";
import { creerStockage } from "./noyau/stockage.js";
import { creerBoucle } from "./noyau/boucle.js";
import { jouer, basculerSon, sonActif } from "./noyau/son.js";
import { IMAGES, COULEURS, indicesDe, grilleGeneree } from "./oekaki/images.js";

const ID = "oekaki";
const TAILLES = [5, 10, 15];
const PENALITE = 30;
const W = 560;
const H = 700;

const VIDE = 0;
const PLEINE = 1;
const CROIX = 2;

// ---------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------

const zone = document.createElement("section");
zone.className = "jeu jeu-oekaki";
zone.id = "jeuOekaki";
zone.hidden = true;
zone.innerHTML = `
  <div class="jeu-entete entete-oekaki">
    <span class="oekaki-boutons">
      <button class="jeu-quitter" id="albumOekaki" type="button">Album</button>
      <button class="jeu-quitter" id="outilOekaki" type="button" aria-pressed="false">Outil : creuser</button>
      <button class="jeu-quitter" id="correctionOekaki" type="button" aria-pressed="true">Correction : oui</button>
      <button class="jeu-quitter" id="sonOekaki" type="button">Son</button>
      <button class="jeu-quitter" id="quitterOekaki" type="button">Retour</button>
    </span>
  </div>
  <canvas id="canvasOekaki"></canvas>
  <p class="jeu-aide">Les chiffres donnent les suites de cases pleines de chaque ligne et colonne. Clic ou doigt pour creuser, clic droit (ou l'outil croix) pour marquer une case vide, glisse pour en faire plusieurs. Avec la correction, une erreur coûte 30 secondes. Clavier : flèches, Espace creuse, X marque (maintenus pendant le déplacement), G album, Échap quitter.</p>`;
document.body.appendChild(zone);

const canvas = zone.querySelector("#canvasOekaki");
const ctx = canvas.getContext("2d");
const boutonAlbum = zone.querySelector("#albumOekaki");
const boutonOutil = zone.querySelector("#outilOekaki");
const boutonCorrection = zone.querySelector("#correctionOekaki");
const boutonSon = zone.querySelector("#sonOekaki");
const boutonQuitter = zone.querySelector("#quitterOekaki");

// ---------------------------------------------------------------------
// Memoire
// ---------------------------------------------------------------------

const stockage = creerStockage("tanuki-arcade-oekaki");
let memoire = charger();

function charger() {
  return Object.assign({ taille: 5, correction: true, debloquees: [], temps: {}, generees: { 5: 0, 10: 0, 15: 0 } }, stockage.lire() || {});
}

function sauver() {
  stockage.ecrire(memoire);
}

function idClassement() {
  return "oekaki-" + memoire.taille;
}

// La liste des grilles d'une taille : dessins faits main, puis generees
// (une de plus que la derniere reussie, pour avancer pas a pas)
const cacheGenerees = new Map();

function grilleNumero(n, k) {
  const cle = n + "-" + k;
  if (!cacheGenerees.has(cle)) {
    cacheGenerees.set(cle, grilleGeneree(n, k));
  }
  return cacheGenerees.get(cle);
}

function listeGrilles(n) {
  const faites = IMAGES.filter(img => img.lignes.length === n);
  const generees = [];
  const jusqua = (memoire.generees[n] || 0) + 1;
  for (let k = 1; k <= jusqua; k++) {
    const g = grilleNumero(n, k);
    if (g) {
      generees.push(g);
    }
  }
  return [...faites, ...generees];
}

// ---------------------------------------------------------------------
// Etat
// ---------------------------------------------------------------------

let echelle = 1;
let fond = null;
let ecran = "album";          // "album" | "jeu" | "fin"
let partie = null;
let outil = PLEINE;
let trace = null;
let tenue = null;
let temps = 0;
let albumDefil = 0;
let boutonsCanvas = [];
let modeClavier = false;
let eclats = [];

function nouvellePartie(image) {
  const n = image.lignes.length;
  const solution = image.lignes.map(l => [...l].map(c => c !== "."));
  partie = {
    image,
    n,
    solution,
    grille: Array.from({ length: n }, () => new Array(n).fill(VIDE)),
    creuse: Array.from({ length: n }, () => new Array(n).fill(0)),   // animation de creusement 0..1
    erreur: Array.from({ length: n }, () => new Array(n).fill(0)),
    lignes: solution.map(l => indicesDe(l)),
    colonnes: solution[0].map((_, c) => indicesDe(solution.map(l => l[c]))),
    secondes: 0,
    erreurs: 0,
    curseur: { l: 0, c: 0 },
    gagnee: false,
    revelation: 0,
    demarree: false
  };
  memoire.taille = n;
  sauver();
  ecran = "jeu";
  eclats = [];
  majScoreCourant(idClassement(), 0);
  jouer("pouvoir");
}

function tempsTotal() {
  return Math.floor(partie.secondes) + partie.erreurs * PENALITE;
}

function formaterTemps(s) {
  const m = Math.floor(s / 60);
  return m + ":" + String(Math.floor(s % 60)).padStart(2, "0");
}

// ---------------------------------------------------------------------
// Geometrie : chiffres a gauche et en haut, grille dessous
// ---------------------------------------------------------------------

function geometrie() {
  const n = partie.n;
  const maxL = Math.max(1, ...partie.lignes.map(l => l.length));
  const maxC = Math.max(1, ...partie.colonnes.map(c => c.length));
  const haut = 92;
  // Taille d'une case : la grille et ses chiffres tiennent dans le cadre
  const cell = Math.floor(Math.min((W - 30) / (n + maxL * 0.62), (H - haut - 24) / (n + maxC * 0.6)));
  const indiceL = Math.ceil(maxL * cell * 0.62) + 8;
  const indiceH = Math.ceil(maxC * cell * 0.6) + 8;
  const largeur = indiceL + n * cell;
  const x0 = Math.round((W - largeur) / 2) + indiceL;
  const y0 = haut + indiceH + 8;
  return { cell, x0, y0, indiceL, indiceH };
}

function caseSous(x, y) {
  const g = geometrie();
  const c = Math.floor((x - g.x0) / g.cell);
  const l = Math.floor((y - g.y0) / g.cell);
  if (l < 0 || c < 0 || l >= partie.n || c >= partie.n) {
    return null;
  }
  return { l, c };
}

// Une ligne est "faite" quand ses suites de cases creusees collent aux chiffres
function ligneFaite(cases, indices) {
  const r = indicesDe(cases.map(v => v === PLEINE));
  return r.length === indices.length && r.every((v, i) => v === indices[i]);
}

// ---------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------

function appliquer(l, c, action) {
  if (!partie || partie.gagnee) {
    return;
  }
  const actuelle = partie.grille[l][c];
  if (action === "creuser" && actuelle === VIDE) {
    partie.demarree = true;
    if (memoire.correction && !partie.solution[l][c]) {
      // Erreur : la case se fend, une croix s'y pose, 30 secondes de plus
      partie.grille[l][c] = CROIX;
      partie.erreur[l][c] = 1;
      partie.erreurs++;
      jouer("impact");
      return;
    }
    partie.grille[l][c] = PLEINE;
    partie.creuse[l][c] = 0;
    jouer("clic");
    const g = geometrie();
    for (let i = 0; i < 4; i++) {
      eclats.push({ x: g.x0 + (c + 0.5) * g.cell, y: g.y0 + (l + 0.5) * g.cell, vx: (Math.random() - 0.5) * 120, vy: -60 - Math.random() * 80, vie: 0.4 });
    }
  } else if (action === "effacer" && actuelle === PLEINE && !memoire.correction) {
    partie.grille[l][c] = VIDE;
  } else if (action === "croix" && actuelle === VIDE) {
    partie.demarree = true;
    partie.grille[l][c] = CROIX;
    jouer("grain");
  } else if (action === "decroix" && actuelle === CROIX && !partie.erreur[l][c]) {
    partie.grille[l][c] = VIDE;
  }
  verifierVictoire();
}

function actionPour(l, c, avecCroix) {
  const v = partie.grille[l][c];
  if (avecCroix || outil === CROIX) {
    return v === CROIX ? "decroix" : "croix";
  }
  return v === PLEINE ? "effacer" : "creuser";
}

function verifierVictoire() {
  const n = partie.n;
  for (let l = 0; l < n; l++) {
    if (!ligneFaite(partie.grille[l], partie.lignes[l])) {
      return;
    }
  }
  for (let c = 0; c < n; c++) {
    if (!ligneFaite(partie.grille.map(r => r[c]), partie.colonnes[c])) {
      return;
    }
  }
  gagner();
}

function gagner() {
  partie.gagnee = true;
  trace = null;
  const total = tempsTotal();
  const img = partie.image;
  if (!memoire.debloquees.includes(img.id)) {
    memoire.debloquees.push(img.id);
  }
  if (!memoire.temps[img.id] || total < memoire.temps[img.id]) {
    memoire.temps[img.id] = total;
  }
  if (img.generee) {
    const k = Number(img.id.split("-")[2]);
    memoire.generees[partie.n] = Math.max(memoire.generees[partie.n] || 0, k);
  }
  sauver();
  majScoreCourant(idClassement(), total);
  jouer("vague");
  setTimeout(() => jouer("vie"), 600);
  setTimeout(() => {
    if (partie && partie.gagnee && !zone.hidden && ecran === "jeu") {
      ecran = "fin";
    }
  }, partie.n * 90 + 900);
}

function grilleSuivante() {
  const liste = listeGrilles(partie.n);
  const i = liste.findIndex(g => g.id === partie.image.id);
  const suivante = liste.slice(i + 1).find(g => !memoire.debloquees.includes(g.id)) || liste.find(g => !memoire.debloquees.includes(g.id)) || liste[liste.length - 1];
  nouvellePartie(suivante);
}

function envoyerTemps() {
  finDePartie(idClassement(), tempsTotal(), "Picross " + partie.n + " × " + partie.n);
}

// ---------------------------------------------------------------------
// Decor : papier washi chaud, bord laque
// ---------------------------------------------------------------------

function peindreFond() {
  const off = document.createElement("canvas");
  off.width = Math.round(W * echelle);
  off.height = Math.round(H * echelle);
  const c = off.getContext("2d");
  c.setTransform(echelle, 0, 0, echelle, 0, 0);
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#2c3b5c");
  g.addColorStop(1, "#1b2440");
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  // Montagnes au loin, aplats
  c.fillStyle = "#24314e";
  c.beginPath();
  c.moveTo(0, H);
  c.lineTo(0, 520);
  c.lineTo(140, 430);
  c.lineTo(250, 500);
  c.lineTo(380, 400);
  c.lineTo(560, 510);
  c.lineTo(560, H);
  c.closePath();
  c.fill();
  c.fillStyle = "#3a4a6c";
  c.beginPath();
  c.moveTo(352, 420);
  c.lineTo(380, 400);
  c.lineTo(408, 418);
  c.lineTo(392, 424);
  c.lineTo(380, 416);
  c.lineTo(366, 426);
  c.closePath();
  c.fill();
  return off;
}

// ---------------------------------------------------------------------
// Dessin
// ---------------------------------------------------------------------

function texteContour(t, x, y, taille, couleur, alignement, contour) {
  ctx.font = "800 " + taille + "px 'Anybody', sans-serif";
  ctx.textAlign = alignement || "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(3, taille * 0.16);
  ctx.strokeStyle = contour || "#141a2e";
  ctx.strokeText(t, x, y);
  ctx.fillStyle = couleur;
  ctx.fillText(t, x, y);
}

function mono(t, x, y, taille, couleur, alignement) {
  ctx.font = "600 " + taille + "px 'Martian Mono', monospace";
  ctx.textAlign = alignement || "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = couleur;
  ctx.fillText(t, x, y);
}

function panneau(x, y, w, h, couleur) {
  ctx.fillStyle = couleur || "rgba(10,14,30,0.6)";
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 14);
  ctx.fill();
  ctx.strokeStyle = "rgba(240,230,200,0.3)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function dessinerTete() {
  panneau(14, 12, 170, 66);
  mono("TEMPS", 99, 28, 9, "#c9d2f0");
  texteContour(formaterTemps(tempsTotal()), 99, 56, 28, partie.erreurs ? "#ffd0a0" : "#ffffff");
  panneau(192, 12, 176, 66);
  mono(partie.image.generee ? "GRILLE" : "DESSIN", 280, 28, 9, "#c9d2f0");
  texteContour(partie.gagnee ? partie.image.nom : "???", 280, 56, partie.gagnee ? 16 : 24, partie.gagnee ? "#ffe38a" : "#ffffff");
  panneau(376, 12, 170, 66);
  mono("ERREURS", 461, 28, 9, "#c9d2f0");
  texteContour(String(partie.erreurs), 461, 56, 28, partie.erreurs ? "#ff8a7a" : "#ffffff");
}

function dessinerGrille() {
  const g = geometrie();
  const n = partie.n;
  const { cell, x0, y0, indiceL, indiceH } = g;
  const cur = partie.curseur;

  // Cadre en bois laque autour de tout
  ctx.fillStyle = "#5a2e22";
  ctx.beginPath();
  ctx.roundRect(x0 - indiceL - 10, y0 - indiceH - 10, indiceL + n * cell + 20, indiceH + n * cell + 20, 16);
  ctx.fill();
  ctx.fillStyle = "#f3ead2";
  ctx.beginPath();
  ctx.roundRect(x0 - indiceL - 4, y0 - indiceH - 4, indiceL + n * cell + 8, indiceH + n * cell + 8, 12);
  ctx.fill();

  // Bandes du curseur, sur les chiffres et la grille
  if (!partie.gagnee) {
    ctx.fillStyle = "rgba(232,197,71,0.28)";
    ctx.fillRect(x0 - indiceL, y0 + cur.l * cell, indiceL + n * cell, cell);
    ctx.fillRect(x0 + cur.c * cell, y0 - indiceH, cell, indiceH + n * cell);
  }

  // Chiffres : ils passent au gris quand la ligne est faite
  const taille = Math.max(10, Math.round(cell * 0.5));
  for (let l = 0; l < n; l++) {
    const faite = ligneFaite(partie.grille[l], partie.lignes[l]);
    const chiffres = partie.lignes[l].length ? partie.lignes[l] : [0];
    chiffres.slice().reverse().forEach((v, i) => {
      ctx.font = "800 " + taille + "px 'Anybody', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = faite ? "#b9b09a" : "#2a2238";
      ctx.fillText(String(v), x0 - 10 - i * cell * 0.62 - cell * 0.22, y0 + l * cell + cell / 2 + 1);
    });
  }
  for (let c = 0; c < n; c++) {
    const col = partie.grille.map(r => r[c]);
    const faite = ligneFaite(col, partie.colonnes[c]);
    const chiffres = partie.colonnes[c].length ? partie.colonnes[c] : [0];
    chiffres.slice().reverse().forEach((v, i) => {
      ctx.font = "800 " + taille + "px 'Anybody', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = faite ? "#b9b09a" : "#2a2238";
      ctx.fillText(String(v), x0 + c * cell + cell / 2, y0 - 10 - i * cell * 0.6 - cell * 0.18);
    });
  }

  // Cases
  for (let l = 0; l < n; l++) {
    for (let c = 0; c < n; c++) {
      const x = x0 + c * cell;
      const y = y0 + l * cell;
      const v = partie.grille[l][c];
      const lettre = partie.image.lignes[l][c];
      const delai = (l + c) / (2 * n);
      const rev = partie.gagnee ? Math.max(0, Math.min(1, (partie.revelation - delai) * 4)) : 0;
      if (rev > 0 && lettre !== ".") {
        // Revelation : le dessin se colore en diagonale
        ctx.fillStyle = COULEURS[lettre];
        const s = 0.6 + 0.4 * rev;
        ctx.fillRect(x + cell * (1 - s) / 2, y + cell * (1 - s) / 2, cell * s, cell * s);
        continue;
      }
      if (rev > 0) {
        ctx.fillStyle = "#f3ead2";
        ctx.fillRect(x, y, cell, cell);
        continue;
      }
      ctx.fillStyle = (Math.floor(l / 5) + Math.floor(c / 5)) % 2 ? "#ece2c6" : "#f6eedb";
      ctx.fillRect(x, y, cell, cell);
      if (v === PLEINE) {
        // Case creusee : un bloc d'ardoise biseaute
        const k = partie.creuse[l][c];
        const m = 1 + (1 - k) * cell * 0.08;
        ctx.fillStyle = "#34405e";
        ctx.fillRect(x + m, y + m, cell - 2 * m, cell - 2 * m);
        ctx.fillStyle = "#56648a";
        ctx.fillRect(x + m, y + m, cell - 2 * m, Math.max(2, cell * 0.12));
        ctx.fillRect(x + m, y + m, Math.max(2, cell * 0.12), cell - 2 * m);
        ctx.fillStyle = "#1f2840";
        ctx.fillRect(x + m, y + cell - m - Math.max(2, cell * 0.1), cell - 2 * m, Math.max(2, cell * 0.1));
      } else if (v === CROIX) {
        const err = partie.erreur[l][c];
        ctx.strokeStyle = err ? "#c8372d" : "#9a8a6a";
        ctx.lineWidth = Math.max(1.5, cell * (err ? 0.1 : 0.07));
        ctx.lineCap = "round";
        const p = cell * 0.28;
        ctx.beginPath();
        ctx.moveTo(x + p, y + p);
        ctx.lineTo(x + cell - p, y + cell - p);
        ctx.moveTo(x + cell - p, y + p);
        ctx.lineTo(x + p, y + cell - p);
        ctx.stroke();
        if (err > 0.5) {
          ctx.fillStyle = "rgba(200,55,45," + ((err - 0.5) * 0.6) + ")";
          ctx.fillRect(x, y, cell, cell);
        }
      }
    }
  }
  // Traits de grille, plus epais tous les cinq
  for (let k = 0; k <= n; k++) {
    const epais = k % 5 === 0;
    ctx.fillStyle = epais ? "#5a2e22" : "rgba(90,46,34,0.28)";
    const e = epais ? 2 : 1;
    ctx.fillRect(x0 + k * cell - e / 2, y0, e, n * cell);
    ctx.fillRect(x0, y0 + k * cell - e / 2, n * cell, e);
  }
  if (modeClavier && !partie.gagnee) {
    ctx.strokeStyle = "#c8372d";
    ctx.lineWidth = 2.5;
    ctx.strokeRect(x0 + cur.c * cell + 1.5, y0 + cur.l * cell + 1.5, cell - 3, cell - 3);
  }
  eclats.forEach(e => {
    ctx.fillStyle = "rgba(52,64,94," + Math.min(1, e.vie * 3) + ")";
    ctx.fillRect(e.x, e.y, 3, 3);
  });
}

function vignette(img, x, y, taille, trouvee) {
  const n = img.lignes.length;
  const p = taille / n;
  ctx.fillStyle = "#f3ead2";
  ctx.fillRect(x, y, taille, taille);
  if (trouvee) {
    img.lignes.forEach((ligne, l) => [...ligne].forEach((ch, c) => {
      if (ch !== ".") {
        ctx.fillStyle = COULEURS[ch];
        ctx.fillRect(x + c * p, y + l * p, Math.ceil(p), Math.ceil(p));
      }
    }));
  } else {
    texteContour("?", x + taille / 2, y + taille / 2 + 2, taille * 0.42, "#c9bfa4", "center", "#8a7e64");
  }
  ctx.strokeStyle = "#5a2e22";
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, taille, taille);
}

function dessinerAlbum() {
  ctx.drawImage(fond, 0, 0, W, H);
  boutonsCanvas = [];
  panneau(14, 12, W - 28, 70);
  texteContour("PICROSS", 34, 40, 28, "#ffffff", "left");
  const total = memoire.debloquees.length;
  mono(total + " dessin" + (total > 1 ? "s" : "") + " trouvé" + (total > 1 ? "s" : ""), 36, 66, 10, "#c9d2f0", "left");
  // Onglets de taille
  TAILLES.forEach((n, i) => {
    const x = 300 + i * 82;
    const actif = memoire.taille === n;
    ctx.fillStyle = actif ? "#e8a23a" : "rgba(255,255,255,0.08)";
    ctx.beginPath();
    ctx.roundRect(x, 26, 74, 40, 12);
    ctx.fill();
    texteContour(n + "×" + n, x + 37, 47, 16, "#ffffff", "center", actif ? "#7a4a0a" : "#141a2e");
    boutonsCanvas.push({ zone: [x, 26, 74, 40], action: () => {
      memoire.taille = n;
      albumDefil = 0;
      sauver();
      jouer("clic");
    } });
  });
  // Grilles en mosaique, de la plus ancienne a la prochaine a faire
  const liste = listeGrilles(memoire.taille);
  const colonnes = 4;
  const t = 104;
  const ecart = (W - 28 - colonnes * t) / (colonnes - 1);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 96, W, H - 96);
  ctx.clip();
  liste.forEach((img, i) => {
    const x = 14 + (i % colonnes) * (t + ecart);
    const y = 110 + Math.floor(i / colonnes) * (t + 46) - albumDefil;
    if (y < 40 || y > H) {
      return;
    }
    const trouvee = memoire.debloquees.includes(img.id);
    vignette(img, x, y, t, trouvee);
    mono(trouvee ? img.nom : (img.generee ? "Grille n°" + img.id.split("-")[2] : "Dessin " + (i + 1)), x + t / 2, y + t + 14, 9, "#e8e0c8");
    const meilleur = memoire.temps[img.id];
    mono(meilleur ? formaterTemps(meilleur) : (trouvee ? "" : "à découvrir"), x + t / 2, y + t + 28, 8, meilleur ? "#c6f35a" : "#8f9ac0");
    boutonsCanvas.push({ zone: [x, y, t, t], action: () => nouvellePartie(img) });
  });
  ctx.restore();
}

function dessinerFin() {
  ctx.fillStyle = "rgba(6,8,20,0.55)";
  ctx.fillRect(0, 0, W, H);
  const w = 420;
  const h = 330;
  const x = (W - w) / 2;
  const y = 170;
  ctx.fillStyle = "#f6efdc";
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 22);
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = "#5a2e22";
  ctx.stroke();
  ctx.fillStyle = "#c8372d";
  ctx.beginPath();
  ctx.roundRect(x + 50, y - 22, w - 100, 46, 14);
  ctx.fill();
  texteContour(partie.image.nom, W / 2, y + 1, 20, "#ffffff", "center", "#7e211b");
  vignette(partie.image, W / 2 - 60, y + 40, 120, true);
  texteContour(formaterTemps(tempsTotal()), W / 2, y + 196, 30, "#ffffff", "center", "#5a2e22");
  const record = memoire.temps[partie.image.id] === tempsTotal();
  mono(partie.erreurs ? partie.erreurs + " erreur" + (partie.erreurs > 1 ? "s" : "") + " : +" + partie.erreurs * PENALITE + " s" : (record ? "Meilleur temps pour ce dessin" : "Sans erreur"), W / 2, y + 226, 10, "#7a5a4a");
  boutonsCanvas = [];
  const liste = [
    { texte: "Album", action: () => {
      ecran = "album";
    } },
    { texte: "Classement", action: envoyerTemps },
    { texte: "Suivante", principal: true, action: grilleSuivante }
  ];
  liste.forEach((b, i) => {
    const bw = (w - 60 - 2 * 12) / 3;
    const bx = x + 30 + i * (bw + 12);
    const by = y + h - 70;
    ctx.fillStyle = b.principal ? "#e8a23a" : "#5a7fa8";
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, 48, 14);
    ctx.fill();
    texteContour(b.texte, bx + bw / 2, by + 24, 16, "#ffffff", "center", b.principal ? "#7a4a0a" : "#1f3a5a");
    boutonsCanvas.push(Object.assign({ zone: [bx, by, bw, 48] }, b));
  });
}

function dessiner() {
  ctx.setTransform(echelle, 0, 0, echelle, 0, 0);
  if (ecran === "album") {
    dessinerAlbum();
    return;
  }
  ctx.drawImage(fond, 0, 0, W, H);
  dessinerTete();
  dessinerGrille();
  if (ecran === "fin") {
    dessinerFin();
  }
}

function maj(dt) {
  temps += dt;
  if (partie && ecran === "jeu") {
    if (!partie.gagnee && partie.demarree && !document.hidden) {
      partie.secondes += dt;
    }
    if (partie.gagnee) {
      partie.revelation = Math.min(1.5, partie.revelation + dt * 0.9);
    }
    for (let l = 0; l < partie.n; l++) {
      for (let c = 0; c < partie.n; c++) {
        partie.creuse[l][c] = Math.min(1, partie.creuse[l][c] + dt * 8);
        if (partie.erreur[l][c] > 0.4) {
          partie.erreur[l][c] = Math.max(0.4, partie.erreur[l][c] - dt * 1.2);
        }
      }
    }
  }
  eclats = eclats.filter(e => {
    e.vie -= dt;
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    e.vy += 400 * dt;
    return e.vie > 0;
  });
}

const boucle = creerBoucle(function (dt) {
  maj(dt);
  dessiner();
}, { plafond: 1 / 20 });

function hauteurManette() {
  const m = document.querySelector(".manette:not([hidden])");
  return m ? m.getBoundingClientRect().height : 0;
}

function ajuster() {
  const marge = window.innerWidth >= 1100 ? 500 : 0;
  const largeur = Math.min(window.innerWidth * 0.96 - marge, 640);
  const entete = zone.querySelector(".entete-oekaki").getBoundingClientRect().height || 40;
  const hauteur = Math.max(280, window.innerHeight - entete - hauteurManette() - 40);
  const taille = Math.min(largeur / W, hauteur / H);
  canvas.style.width = Math.floor(W * taille) + "px";
  canvas.style.height = Math.floor(H * taille) + "px";
  const nouvelle = Math.min(3, Math.max(1, taille * (window.devicePixelRatio || 1)));
  if (Math.abs(nouvelle - echelle) > 0.02 || fond === null) {
    echelle = nouvelle;
    canvas.width = Math.round(W * echelle);
    canvas.height = Math.round(H * echelle);
    fond = peindreFond();
  }
}

window.addEventListener("resize", function () {
  if (!zone.hidden) {
    ajuster();
  }
});

// ---------------------------------------------------------------------
// Doigt et souris : un geste suit la ligne ou la colonne de depart
// ---------------------------------------------------------------------

function pointLogique(evenement) {
  const r = canvas.getBoundingClientRect();
  return [(evenement.clientX - r.left) / r.width * W, (evenement.clientY - r.top) / r.height * H];
}

let glisseAlbum = null;

canvas.addEventListener("pointerdown", function (evenement) {
  if (!jeuAuPremierPlan(ID)) {
    return;
  }
  evenement.preventDefault();
  modeClavier = false;
  const [x, y] = pointLogique(evenement);
  const b = boutonsCanvas.find(bt => (ecran !== "jeu") && x >= bt.zone[0] && x <= bt.zone[0] + bt.zone[2] && y >= bt.zone[1] && y <= bt.zone[1] + bt.zone[3]);
  if (ecran === "album") {
    glisseAlbum = { y, defil: albumDefil, bouge: false, bouton: b };
    canvas.setPointerCapture(evenement.pointerId);
    return;
  }
  if (ecran === "fin") {
    if (b) {
      jouer("clic");
      b.action();
    }
    return;
  }
  const k = caseSous(x, y);
  if (!k || partie.gagnee) {
    return;
  }
  canvas.setPointerCapture(evenement.pointerId);
  partie.curseur = { l: k.l, c: k.c };
  const action = actionPour(k.l, k.c, evenement.button === 2);
  trace = { action, l: k.l, c: k.c, axe: null };
  appliquer(k.l, k.c, action);
});

canvas.addEventListener("pointermove", function (evenement) {
  const [x, y] = pointLogique(evenement);
  if (glisseAlbum) {
    if (Math.abs(y - glisseAlbum.y) > 6) {
      glisseAlbum.bouge = true;
    }
    albumDefil = Math.max(0, glisseAlbum.defil - (y - glisseAlbum.y));
    return;
  }
  if (!trace || !partie || partie.gagnee) {
    return;
  }
  const k = caseSous(x, y);
  if (!k) {
    return;
  }
  if (trace.axe === null && (k.l !== trace.l || k.c !== trace.c)) {
    trace.axe = k.l === trace.l ? "ligne" : "colonne";
  }
  const l = trace.axe === "colonne" ? k.l : trace.l;
  const c = trace.axe === "ligne" ? k.c : trace.c;
  if (trace.axe) {
    partie.curseur = { l, c };
    appliquer(l, c, trace.action);
  }
});

function finGeste() {
  if (glisseAlbum && !glisseAlbum.bouge && glisseAlbum.bouton) {
    jouer("clic");
    glisseAlbum.bouton.action();
  }
  glisseAlbum = null;
  trace = null;
}
canvas.addEventListener("pointerup", finGeste);
canvas.addEventListener("pointercancel", finGeste);
canvas.addEventListener("wheel", function (evenement) {
  if (ecran === "album") {
    evenement.preventDefault();
    albumDefil = Math.max(0, albumDefil + evenement.deltaY * 0.6);
  }
}, { passive: false });
canvas.addEventListener("contextmenu", evenement => evenement.preventDefault());

// ---------------------------------------------------------------------
// Clavier et manette
// ---------------------------------------------------------------------

surTouche(ID, function (evenement) {
  const touche = evenement.key.toLowerCase();
  if (touche === "escape") {
    quitterJeu();
    return;
  }
  if (touche === "m") {
    basculerSon();
    majBoutonSon();
  } else if (touche === "g") {
    ecran = "album";
  } else if (ecran === "album") {
    const liste = listeGrilles(memoire.taille);
    if (touche === "arrowleft" || touche === "arrowright") {
      const i = TAILLES.indexOf(memoire.taille) + (touche === "arrowright" ? 1 : -1);
      memoire.taille = TAILLES[(i + TAILLES.length) % TAILLES.length];
      albumDefil = 0;
      sauver();
    } else if (touche === " " || touche === "enter" || touche === "x") {
      const prochaine = liste.find(g => !memoire.debloquees.includes(g.id)) || liste[liste.length - 1];
      nouvellePartie(prochaine);
    } else {
      return;
    }
  } else if (ecran === "fin") {
    if (touche === " " || touche === "enter") {
      grilleSuivante();
    } else {
      return;
    }
  } else {
    const n = partie.n;
    const cur = partie.curseur;
    const deplacements = { arrowup: [-1, 0], arrowdown: [1, 0], arrowleft: [0, -1], arrowright: [0, 1] };
    const d = deplacements[touche];
    if (d) {
      modeClavier = true;
      cur.l = Math.max(0, Math.min(n - 1, cur.l + d[0]));
      cur.c = Math.max(0, Math.min(n - 1, cur.c + d[1]));
      if (tenue) {
        appliquer(cur.l, cur.c, tenue);
      }
    } else if (touche === " " || touche === "enter" || touche === "x") {
      modeClavier = true;
      if (!evenement.repeat) {
        tenue = actionPour(cur.l, cur.c, touche === "x");
        appliquer(cur.l, cur.c, tenue);
      }
    } else {
      return;
    }
  }
  evenement.preventDefault();
});

surRelachement(function (evenement) {
  const touche = evenement.key.toLowerCase();
  if (touche === " " || touche === "enter" || touche === "x") {
    tenue = null;
  }
});

// ---------------------------------------------------------------------
// Boutons
// ---------------------------------------------------------------------

function changerOutil(nouvel) {
  outil = nouvel;
  boutonOutil.textContent = outil === PLEINE ? "Outil : creuser" : "Outil : croix";
  boutonOutil.setAttribute("aria-pressed", String(outil === CROIX));
}

function majCorrection() {
  boutonCorrection.textContent = "Correction : " + (memoire.correction ? "oui" : "non");
  boutonCorrection.setAttribute("aria-pressed", String(memoire.correction));
}

function majBoutonSon() {
  boutonSon.textContent = sonActif() ? "Son" : "Muet";
}

boutonAlbum.addEventListener("click", function () {
  ecran = "album";
});
boutonOutil.addEventListener("click", () => changerOutil(outil === PLEINE ? CROIX : PLEINE));
boutonCorrection.addEventListener("click", function () {
  memoire.correction = !memoire.correction;
  sauver();
  majCorrection();
});
boutonSon.addEventListener("click", function () {
  basculerSon();
  majBoutonSon();
});
boutonQuitter.addEventListener("click", quitterJeu);

// Pour les tests automatiques
export const _test = { get partie() { return partie; }, get ecran() { return ecran; }, nouvellePartie, appliquer, listeGrilles };

enregistrerJeu({
  id: ID,
  nom: "Picross",
  code: "1987",
  section: zone,
  demarrer() {
    memoire = charger();
    fond = null;
    ajuster();
    requestAnimationFrame(ajuster);
    changerOutil(PLEINE);
    majCorrection();
    majBoutonSon();
    ecran = "album";
    albumDefil = 0;
    boucle.lancer();
  },
  arreter() {
    boucle.arreter();
    tenue = null;
    trace = null;
  },
  classement: idClassement,
  plusBasEstMieux: true,
  formaterScore: score => formaterTemps(score),
  manette: { a: " ", b: "x", start: "g", quatreDirections: true, libelles: { a: "Creuser", b: "Croix" } }
});
