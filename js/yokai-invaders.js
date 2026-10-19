// =====================================================================
//  YOKAI INVADERS
//  L'esprit de Space Invaders : la troupe de yokai descend en bloc, le
//  tanuki tire depuis le bas, a l'abri de torii et de lanternes de
//  pierre qui s'effritent, et un tengu sur son nuage traverse le ciel.
//
//  Ce qui en fait un jeu a part :
//  - des bonus lâches par les yokai : tir double, tir triple, laser
//    percant, bouclier, ralenti, bombe qui nettoie une rangee, aimant ;
//  - des koban a ramasser, une boutique au hangar et toutes les trois
//    vagues : ameliorations permanentes et quatre vaisseaux au style de
//    jeu different (equilibre, rapide, lourd a tir etale, tir charge) ;
//  - une jauge de sceau (bouton B) qui balaie les tirs ennemis ;
//  - un boss toutes les cinq vagues, et des vagues sans fin dont la
//    formation et les yokai changent, avec une difficulte qui monte.
// =====================================================================

import { enregistrerJeu, finDePartie, quitterJeu, majScoreCourant } from "./arcade.js";
import { creerBoucle } from "./noyau/boucle.js";
import { surTouche, jeuAuPremierPlan } from "./noyau/clavier.js";
import { creerStockage } from "./noyau/stockage.js";
import { jouer as son, basculerSon, sonActif } from "./noyau/son.js";

const ID = "yokai-invaders";
const W = 480;
const H = 720;
const SOL = 660;                  // ligne du tanuki
const HAUT_FORMATION = 96;

const C = {
  encre: "#0b0b10",
  creme: "#ede8df",
  lime: "#c6f35a",
  or: "#f2c23a",
  orSombre: "#8a6a12",
  rouge: "#d83a2c",
  rougeSombre: "#7e1c14",
  bleu: "#5a8fa8",
  violet: "#8a6ac0",
  vert: "#6fae3a",
  gris: "#9a94a8"
};

// ---------------------------------------------------------------------
// Section : on garde la section existante, on remplace son contenu
// ---------------------------------------------------------------------

const zone = document.getElementById("jeuYokai");
zone.innerHTML = `
  <div class="jeu-entete entete-yokai">
    <span class="entete-boutons">
      <button class="jeu-quitter" id="hangarYokai" type="button">Hangar</button>
      <button class="jeu-quitter" id="sonYokai" type="button">Son</button>
      <button class="jeu-quitter" id="recommencerYokai" type="button">Rejouer</button>
      <button class="jeu-quitter" id="quitterYokai" type="button">Retour</button>
    </span>
  </div>
  <canvas id="canvasYokai"></canvas>
  <p class="jeu-aide">Flèches ou Q D pour bouger, Espace maintenu pour tirer, X pour le sceau quand sa jauge est pleine. Au doigt : le tanuki suit ton doigt et tire tant que tu appuies, deux doigts pour le sceau. Ramasse les koban et dépense-les au hangar. P pause, M son, N rejouer, Échap quitter.</p>`;

const canvas = zone.querySelector("#canvasYokai");
const ctx = canvas.getContext("2d");
const boutonHangar = zone.querySelector("#hangarYokai");
const boutonSon = zone.querySelector("#sonYokai");
const boutonRecommencer = zone.querySelector("#recommencerYokai");
const boutonQuitter = zone.querySelector("#quitterYokai");

// ---------------------------------------------------------------------
// Vaisseaux, ameliorations, sauvegarde
// ---------------------------------------------------------------------

const VAISSEAUX = [
  { id: "kaze", nom: "Kaze", jp: "風", prix: 0, desc: "Équilibré. Le tanuki des débuts, fiable partout.", vitesse: 260, cadence: 0.27, degats: 1, vies: 3, tir: "simple", coque: "#c8372d", aile: "#ede8df" },
  { id: "hayabusa", nom: "Hayabusa", jp: "隼", prix: 400, desc: "Rapide et fragile. Tir très rapide, une vie de moins.", vitesse: 370, cadence: 0.16, degats: 0.8, vies: 2, tir: "simple", coque: "#2f8fd8", aile: "#ede8df" },
  { id: "kabuto", nom: "Kabuto", jp: "兜", prix: 800, desc: "Lourd et lent. Trois tirs en éventail, une vie de plus.", vitesse: 190, cadence: 0.4, degats: 1, vies: 4, tir: "eventail", coque: "#6f7a3a", aile: "#e8c547" },
  { id: "raijin", nom: "Raijin", jp: "雷", prix: 1400, desc: "Tir chargé. Maintiens pour charger un éclair qui transperce tout.", vitesse: 240, cadence: 0.34, degats: 1, vies: 3, tir: "charge", coque: "#8a55e0", aile: "#f2c23a" }
];

const AMELIORATIONS = [
  { id: "cadence", nom: "Cadence", desc: "Tire plus vite" },
  { id: "puissance", nom: "Puissance", desc: "Tirs plus forts" },
  { id: "vitesse", nom: "Vitesse", desc: "Déplacement plus vif" },
  { id: "vie", nom: "Vie max", desc: "+1 vie aux niveaux 1, 3 et 5" },
  { id: "duree", nom: "Durée des bonus", desc: "Bonus plus longs" }
];
const PRIX_AMELIORATION = [80, 180, 340, 560, 900];
const NIVEAU_MAX = 5;

const stockage = creerStockage("tanuki-arcade-yokai-hangar");
function sauvegardeVide() {
  return { koban: 0, debloques: ["kaze"], choisi: "kaze", ameliorations: { cadence: 0, puissance: 0, vitesse: 0, vie: 0, duree: 0 }, record: 0 };
}
let sauvegarde = Object.assign(sauvegardeVide(), stockage.lire() || {});
sauvegarde.ameliorations = Object.assign(sauvegardeVide().ameliorations, sauvegarde.ameliorations || {});

function sauver() {
  stockage.ecrire(sauvegarde);
}

function vaisseauChoisi() {
  return VAISSEAUX.find(v => v.id === sauvegarde.choisi) || VAISSEAUX[0];
}

function statsJoueur(v) {
  const a = sauvegarde.ameliorations;
  return {
    vitesse: v.vitesse * (1 + a.vitesse * 0.08),
    cadence: v.cadence * Math.pow(0.92, a.cadence),
    degats: v.degats * (1 + a.puissance * 0.25),
    vies: v.vies + (a.vie >= 1 ? 1 : 0) + (a.vie >= 3 ? 1 : 0) + (a.vie >= 5 ? 1 : 0),
    duree: 1 + a.duree * 0.2
  };
}

// ---------------------------------------------------------------------
// Yokai : cinq familles, dessinees en volume
// ---------------------------------------------------------------------

const FAMILLES = {
  kasa: { nom: "Kasa-obake", pv: 1, points: 10, tir: 0.6 },
  chochin: { nom: "Chōchin-obake", pv: 1, points: 20, tir: 1.4 },
  hitotsume: { nom: "Hitotsume-kozō", pv: 1, points: 20, tir: 1 },
  kappa: { nom: "Kappa", pv: 1, points: 30, tir: 1.2, vise: true },
  oni: { nom: "Oni", pv: 2, points: 40, tir: 1.6 }
};

function ombreSous(x, y, l) {
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(x, y, l, l * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
}

function dessinerYokai(type, x, y, t, flash, abime) {
  const bob = Math.sin(t * 6 + x * 0.05) * 1.5;
  ctx.save();
  ctx.translate(x, y + bob);
  if (flash > 0) {
    ctx.globalAlpha = 0.6 + 0.4 * Math.sin(flash * 60);
  }
  if (type === "kasa") {
    // Parapluie a un oeil, une jambe qui sautille
    const saut = Math.abs(Math.sin(t * 6 + x)) * 2;
    ctx.fillStyle = "#7a5634";
    ctx.fillRect(-1.5, 2 - saut, 3, 10);
    ctx.fillStyle = "#e8c9a0";
    ctx.beginPath();
    ctx.ellipse(0, 13 - saut, 4, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#5b8f4a";
    ctx.beginPath();
    ctx.moveTo(-15, 3 - saut);
    ctx.quadraticCurveTo(0, -18 - saut, 15, 3 - saut);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#3f6a34";
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 6, 3 - saut);
      ctx.lineTo(0, -9 - saut);
      ctx.lineTo(i * 6 + 2, 3 - saut);
      ctx.fill();
    }
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.ellipse(0, -4 - saut, 4.5, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.encre;
    ctx.beginPath();
    ctx.arc(0.5, -4 - saut, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.rouge;
    ctx.fillRect(-3, 0 - saut, 6, 2.5);
  } else if (type === "chochin") {
    // Lanterne de papier fendue en bouche
    ctx.fillStyle = "#2a1a12";
    ctx.fillRect(-6, -14, 12, 3);
    ctx.fillRect(-6, 11, 12, 3);
    const g = ctx.createLinearGradient(-12, 0, 12, 0);
    g.addColorStop(0, "#b8461c");
    g.addColorStop(0.45, "#f59a3a");
    g.addColorStop(1, "#a0381a");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, 12, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(90,30,8,0.55)";
    ctx.lineWidth = 1;
    [-7, 0, 7].forEach(k => {
      ctx.beginPath();
      ctx.moveTo(-11, k);
      ctx.lineTo(11, k);
      ctx.stroke();
    });
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(-4, -3, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.encre;
    ctx.beginPath();
    ctx.arc(-4, -3, 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#3a0d08";
    ctx.beginPath();
    ctx.moveTo(-6, 4);
    ctx.quadraticCurveTo(0, 10 + Math.sin(t * 8) * 2, 8, 3);
    ctx.quadraticCurveTo(0, 6, -6, 4);
    ctx.fill();
    ctx.fillStyle = "#e0574b";
    ctx.beginPath();
    ctx.ellipse(2, 7, 3, 2, 0.3, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === "hitotsume") {
    // Petit moine au crane rase et a l'oeil unique
    ctx.fillStyle = "#4a3b78";
    ctx.beginPath();
    ctx.moveTo(-11, 13);
    ctx.lineTo(-8, 1);
    ctx.lineTo(8, 1);
    ctx.lineTo(11, 13);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#6a58a0";
    ctx.fillRect(-2, 2, 4, 11);
    ctx.fillStyle = "#f0cfa6";
    ctx.beginPath();
    ctx.arc(0, -6, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath();
    ctx.arc(-3, -10, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.ellipse(0, -6, 5, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    const regard = Math.sin(t * 2 + x) * 1.5;
    ctx.fillStyle = "#2a1a40";
    ctx.beginPath();
    ctx.arc(regard, -6, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#c8372d";
    ctx.fillRect(-2, -0.5, 4, 1.5);
  } else if (type === "kappa") {
    // Kappa : carapace, assiette d'eau sur la tete
    ctx.fillStyle = "#3f7a2a";
    ctx.beginPath();
    ctx.ellipse(0, 4, 12, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#7a5a2a";
    ctx.beginPath();
    ctx.ellipse(0, 6, 9, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#4a3416";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-6, 6);
    ctx.lineTo(6, 6);
    ctx.moveTo(0, 1);
    ctx.lineTo(0, 11);
    ctx.stroke();
    ctx.fillStyle = "#7fbf3a";
    ctx.beginPath();
    ctx.arc(0, -6, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#a8d0e0";
    ctx.beginPath();
    ctx.ellipse(0, -13, 6, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e8c547";
    ctx.beginPath();
    ctx.moveTo(-3, -4);
    ctx.lineTo(0, -1);
    ctx.lineTo(3, -4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = C.encre;
    ctx.fillRect(-5, -8, 2, 2);
    ctx.fillRect(3, -8, 2, 2);
  } else if (type === "oni") {
    // Oni rouge a cornes, abime apres le premier coup
    ctx.fillStyle = abime ? "#8e2a22" : "#c8372d";
    ctx.beginPath();
    ctx.ellipse(0, 1, 13, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f2e6c8";
    ctx.beginPath();
    ctx.moveTo(-9, -8);
    ctx.lineTo(-12, -17);
    ctx.lineTo(-5, -10);
    ctx.moveTo(9, -8);
    ctx.lineTo(12, -17);
    ctx.lineTo(5, -10);
    ctx.fill();
    ctx.fillStyle = "#2a1a12";
    ctx.beginPath();
    ctx.ellipse(0, -9, 10, 4, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = "#ffd23a";
    ctx.beginPath();
    ctx.arc(-5, -2, 2.5, 0, Math.PI * 2);
    ctx.arc(5, -2, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.encre;
    ctx.fillRect(-5.8, -2.8, 1.6, 1.6);
    ctx.fillRect(4.2, -2.8, 1.6, 1.6);
    ctx.fillStyle = "#3a0d08";
    ctx.fillRect(-6, 5, 12, 4);
    ctx.fillStyle = "#fff";
    ctx.fillRect(-5, 5, 2, 2);
    ctx.fillRect(3, 5, 2, 2);
    if (abime) {
      ctx.strokeStyle = "#2a0a06";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(4, -9);
      ctx.lineTo(1, -3);
      ctx.lineTo(5, 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------------
// Le vaisseau du tanuki
// ---------------------------------------------------------------------

function dessinerVaisseau(v, x, y, echelleV, t, bouclier, charge) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(echelleV, echelleV);
  // Flamme de propulsion
  const f = 5 + Math.sin(t * 30) * 2;
  ctx.fillStyle = "#f2c23a";
  ctx.beginPath();
  ctx.moveTo(-5, 12);
  ctx.lineTo(0, 12 + f + 4);
  ctx.lineTo(5, 12);
  ctx.fill();
  ctx.fillStyle = "#e0574b";
  ctx.beginPath();
  ctx.moveTo(-3, 12);
  ctx.lineTo(0, 12 + f);
  ctx.lineTo(3, 12);
  ctx.fill();
  // Ailes
  ctx.fillStyle = v.aile;
  if (v.id === "kabuto") {
    ctx.beginPath();
    ctx.moveTo(-22, 10);
    ctx.lineTo(-14, -4);
    ctx.lineTo(14, -4);
    ctx.lineTo(22, 10);
    ctx.lineTo(10, 13);
    ctx.lineTo(-10, 13);
    ctx.closePath();
    ctx.fill();
  } else if (v.id === "hayabusa") {
    ctx.beginPath();
    ctx.moveTo(-20, 12);
    ctx.lineTo(-4, -6);
    ctx.lineTo(4, -6);
    ctx.lineTo(20, 12);
    ctx.lineTo(6, 8);
    ctx.lineTo(-6, 8);
    ctx.closePath();
    ctx.fill();
  } else if (v.id === "raijin") {
    ctx.beginPath();
    ctx.moveTo(-18, 6);
    ctx.lineTo(-10, -2);
    ctx.lineTo(-16, -10);
    ctx.lineTo(-4, -4);
    ctx.lineTo(4, -4);
    ctx.lineTo(16, -10);
    ctx.lineTo(10, -2);
    ctx.lineTo(18, 6);
    ctx.lineTo(8, 12);
    ctx.lineTo(-8, 12);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(-18, 11);
    ctx.lineTo(-6, -2);
    ctx.lineTo(6, -2);
    ctx.lineTo(18, 11);
    ctx.lineTo(8, 12);
    ctx.lineTo(-8, 12);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fillRect(-18, 9, 36, 3);
  // Fuselage
  const g = ctx.createLinearGradient(-8, 0, 8, 0);
  g.addColorStop(0, v.coque);
  g.addColorStop(0.45, "#ffffff");
  g.addColorStop(0.55, v.coque);
  g.addColorStop(1, "#2a1a20");
  ctx.fillStyle = v.coque;
  ctx.beginPath();
  ctx.moveTo(0, -18);
  ctx.quadraticCurveTo(9, -8, 8, 12);
  ctx.lineTo(-8, 12);
  ctx.quadraticCurveTo(-9, -8, 0, -18);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.beginPath();
  ctx.moveTo(-1, -15);
  ctx.quadraticCurveTo(-6, -6, -5, 9);
  ctx.lineTo(-2, 9);
  ctx.quadraticCurveTo(-3, -6, -1, -15);
  ctx.fill();
  // Cockpit : la tete du tanuki
  ctx.fillStyle = "#8a6a4a";
  ctx.beginPath();
  ctx.arc(0, -4, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#3a2a1e";
  ctx.beginPath();
  ctx.ellipse(-2.2, -4, 1.8, 1.4, 0, 0, Math.PI * 2);
  ctx.ellipse(2.2, -4, 1.8, 1.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.fillRect(-2.6, -4.6, 1, 1);
  ctx.fillRect(1.8, -4.6, 1, 1);
  ctx.fillStyle = "#8a6a4a";
  ctx.beginPath();
  ctx.moveTo(-4.5, -6);
  ctx.lineTo(-3.5, -10);
  ctx.lineTo(-1.5, -8);
  ctx.moveTo(4.5, -6);
  ctx.lineTo(3.5, -10);
  ctx.lineTo(1.5, -8);
  ctx.fill();
  if (charge > 0) {
    ctx.fillStyle = "rgba(242,194,58," + (0.3 + charge * 0.6) + ")";
    ctx.beginPath();
    ctx.arc(0, -22, 3 + charge * 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, -22, 3 + charge * 6, 0, Math.PI * 2 * charge);
    ctx.stroke();
  }
  ctx.restore();
  if (bouclier > 0) {
    ctx.strokeStyle = bouclier < 2 && Math.floor(bouclier * 8) % 2 ? "rgba(168,208,224,0.3)" : "#a8d0e0";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, y - 2, 26 * echelleV, 22 * echelleV, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

// ---------------------------------------------------------------------
// Abris : torii et lanternes de pierre, qui s'effritent case par case
// ---------------------------------------------------------------------

const CASE_ABRI = 3;
const ABRI_L = 26;     // en cases
const ABRI_H = 18;

function formeAbri(type) {
  const m = new Uint8Array(ABRI_L * ABRI_H);
  for (let y = 0; y < ABRI_H; y++) {
    for (let x = 0; x < ABRI_L; x++) {
      let plein = false;
      if (type === "torii") {
        const linteau = y < 3 && x >= 0 && x < ABRI_L;
        const nuki = y >= 5 && y < 7 && x >= 2 && x < ABRI_L - 2;
        const piliers = y >= 3 && (x >= 4 && x < 8 || x >= ABRI_L - 8 && x < ABRI_L - 4);
        plein = linteau || nuki || piliers;
      } else {
        // Lanterne de pierre : chapeau, foyer, colonne, socle
        const cx = ABRI_L / 2;
        const d = Math.abs(x + 0.5 - cx);
        const chapeau = y < 4 && d < 6 + y * 2;
        const foyer = y >= 4 && y < 9 && d < 7 && !(y >= 5 && y < 8 && d < 3);
        const colonne = y >= 9 && y < 14 && d < 4;
        const socle = y >= 14 && d < 10;
        plein = chapeau || foyer || colonne || socle;
      }
      m[y * ABRI_L + x] = plein ? 1 : 0;
    }
  }
  return m;
}

function nouveauxAbris() {
  const types = ["lanterne", "torii", "torii", "lanterne"];
  return types.map((type, i) => ({
    type,
    x: W * (i + 0.5) / 4 - (ABRI_L * CASE_ABRI) / 2,
    y: SOL - 110,
    cases: formeAbri(type),
    image: null
  }));
}

function imageAbri(a) {
  if (a.image) {
    return a.image;
  }
  const off = document.createElement("canvas");
  off.width = Math.ceil(ABRI_L * CASE_ABRI * echelle);
  off.height = Math.ceil(ABRI_H * CASE_ABRI * echelle);
  const c = off.getContext("2d");
  c.setTransform(echelle, 0, 0, echelle, 0, 0);
  for (let y = 0; y < ABRI_H; y++) {
    for (let x = 0; x < ABRI_L; x++) {
      if (!a.cases[y * ABRI_L + x]) {
        continue;
      }
      if (a.type === "torii") {
        c.fillStyle = y < 3 ? (y === 0 ? "#2a1a14" : "#c8372d") : y < 7 && y >= 5 ? "#a82e24" : (x % 4 === 0 ? "#9e2a20" : "#c8372d");
      } else {
        const bord = !a.cases[(y - 1) * ABRI_L + x] || y === 0;
        c.fillStyle = bord ? "#c9c3b8" : (y > 13 ? "#77726a" : "#9a958a");
      }
      c.fillRect(x * CASE_ABRI, y * CASE_ABRI, CASE_ABRI, CASE_ABRI);
    }
  }
  a.image = off;
  return off;
}

// Un tir touche-t-il l'abri ? On creuse un petit cratere
function toucherAbri(px, py, rayon) {
  for (const a of etat.abris) {
    const lx = Math.floor((px - a.x) / CASE_ABRI);
    const ly = Math.floor((py - a.y) / CASE_ABRI);
    if (lx < 0 || ly < 0 || lx >= ABRI_L || ly >= ABRI_H || !a.cases[ly * ABRI_L + lx]) {
      continue;
    }
    for (let dy = -rayon; dy <= rayon; dy++) {
      for (let dx = -rayon; dx <= rayon; dx++) {
        const x = lx + dx;
        const y = ly + dy;
        if (x >= 0 && y >= 0 && x < ABRI_L && y < ABRI_H && dx * dx + dy * dy <= rayon * rayon + Math.random() * 2) {
          a.cases[y * ABRI_L + x] = 0;
        }
      }
    }
    a.image = null;
    eclats(px, py, a.type === "torii" ? ["#c8372d", "#2a1a14"] : ["#9a958a", "#c9c3b8"], 5, 70);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------
// Etat de la partie
// ---------------------------------------------------------------------

let echelle = 1;
let etat = null;
let ecran = "hangar";             // "hangar" | "jeu" | "boutique" | "fin"
let fond = null;
let temps = 0;
const commandes = { gauche: false, droite: false, tir: false };
let doigt = null;                 // { id, x }
let doigts = new Set();
let focus = 0;
let vueVaisseau = 0;
let boutons = [];

function nouvelEtat() {
  const v = vaisseauChoisi();
  const s = statsJoueur(v);
  return {
    v,
    s,
    x: W / 2,
    vies: s.vies,
    score: 0,
    combo: 1,
    serie: 0,
    vague: 0,
    kobanPartie: 0,
    tirs: [],
    tirsEnnemis: [],
    yokai: [],
    boss: null,
    soucoupe: null,
    prochaineSoucoupe: 12,
    pieces: [],
    bonus: [],
    actifs: { double: 0, triple: 0, laser: 0, bouclier: 0, ralenti: 0, aimant: 0 },
    recharge: 0,
    charge: 0,
    sceau: 0,
    invincible: 0,
    abris: nouveauxAbris(),
    formation: { dx: 1, vitesse: 20, descente: 0 },
    eclats: [],
    textes: [],
    banniere: null,
    secousse: 0,
    pause: false,
    termine: false,
    attenteVague: 0
  };
}

// ---------------------------------------------------------------------
// Vagues : formations qui changent, yokai qui changent
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

const FORMES = ["bloc", "damier", "chevron", "deuxBlocs", "pyramide", "colonnes"];

function difficulte(vague) {
  return 1 + Math.sqrt(Math.max(0, vague - 1)) * 0.32 + (vague - 1) * 0.015;
}

function lancerVague() {
  etat.vague++;
  const n = etat.vague;
  etat.tirsEnnemis = [];
  etat.yokai = [];
  etat.boss = null;
  if (n % 5 === 0) {
    lancerBoss();
    return;
  }
  const alea = hasard(n * 977 + 31);
  const forme = n === 1 ? "bloc" : FORMES[Math.floor(alea() * FORMES.length)];
  const familles = ["kasa", "chochin", "hitotsume", "kappa", "oni"];
  // Les rangees du haut valent plus ; les familles tournent avec les vagues
  const rangees = 5;
  const colonnes = 11;
  const decal = Math.floor(alea() * 3);
  for (let r = 0; r < rangees; r++) {
    const ordre = Math.min(4, Math.max(0, 4 - r - (n < 3 ? 1 : 0) + (decal > 1 && r === 0 ? 0 : 0)));
    const famille = familles[Math.max(0, Math.min(4, ordre - (n < 4 && ordre === 4 ? 1 : 0)))];
    for (let c = 0; c < colonnes; c++) {
      let present = true;
      if (forme === "damier") {
        present = (r + c) % 2 === 0 || r === rangees - 1;
      } else if (forme === "chevron") {
        present = Math.abs(c - 5) >= r - 1 || r < 2;
      } else if (forme === "deuxBlocs") {
        present = c !== 5;
      } else if (forme === "pyramide") {
        present = Math.abs(c - 5) <= r + 1;
      } else if (forme === "colonnes") {
        present = c % 3 !== 2;
      }
      if (!present) {
        continue;
      }
      const f = FAMILLES[famille];
      etat.yokai.push({
        type: famille,
        pv: f.pv + (n >= 12 && famille === "oni" ? 1 : 0),
        x: 60 + c * 36,
        y: HAUT_FORMATION + r * 36 + Math.min(110, (n - 1) * 9),
        flash: 0,
        abime: false
      });
    }
  }
  etat.formation = { dx: alea() < 0.5 ? 1 : -1, vitesse: 18 * difficulte(n), descente: 0, total: etat.yokai.length };
  annoncer("Vague " + n, nomForme(forme), 1.6);
  son("vague");
}

function nomForme(f) {
  return { bloc: "La troupe arrive", damier: "En damier", chevron: "En chevron", deuxBlocs: "Deux escouades", pyramide: "En pyramide", colonnes: "En colonnes" }[f];
}

function lancerBoss() {
  const rang = etat.vague / 5;
  const pvMax = Math.round((70 + rang * 45) * Math.pow(1.08, rang));
  etat.boss = {
    x: W / 2,
    y: 150,
    pv: pvMax,
    pvMax,
    phase: 0,
    minuterie: 2,
    motif: 0,
    flash: 0,
    entree: 1.5,
    rayon: null,
    rang
  };
  annoncer("Gashadokuro", "Le grand squelette du sanctuaire", 2.2, C.rouge);
  son("boss");
}

function annoncer(titre, sous, duree, couleur) {
  etat.banniere = { titre, sous: sous || "", reste: duree || 1.6, couleur: couleur || C.creme };
}

// ---------------------------------------------------------------------
// Effets
// ---------------------------------------------------------------------

function eclats(x, y, couleurs, n, v) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = (v || 140) * (0.4 + Math.random() * 0.8);
    etat.eclats.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, vie: 0.4 + Math.random() * 0.4, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14, taille: 2 + Math.random() * 3.5, couleur: couleurs[i % couleurs.length] });
  }
}

function texte(t, x, y, couleur, taille) {
  etat.textes.push({ t, x, y, couleur: couleur || C.creme, taille: taille || 12, age: 0 });
}

function couleursDe(type) {
  return { kasa: ["#5b8f4a", "#fff"], chochin: ["#f59a3a", "#2a1a12"], hitotsume: ["#4a3b78", "#f0cfa6"], kappa: ["#7fbf3a", "#7a5a2a"], oni: ["#c8372d", "#f2e6c8"] }[type] || [C.creme];
}

// ---------------------------------------------------------------------
// Tirs du joueur
// ---------------------------------------------------------------------

function tirer() {
  const e = etat;
  const y = SOL - 18;
  const perce = e.actifs.laser > 0;
  const deg = e.s.degats;
  const ajouter = (dx, vx, extra) => e.tirs.push(Object.assign({ x: e.x + dx, y, vx: vx || 0, vy: -560, degats: deg, perce, touches: new Set() }, extra || {}));
  if (e.v.tir === "eventail") {
    ajouter(0, 0);
    ajouter(-6, -120);
    ajouter(6, 120);
  } else {
    ajouter(0, 0);
  }
  if (e.actifs.double > 0) {
    ajouter(-9, 0);
    ajouter(9, 0);
  }
  if (e.actifs.triple > 0) {
    ajouter(-4, -200);
    ajouter(4, 200);
  }
  son("tir");
}

function tirCharge(force) {
  const e = etat;
  e.tirs.push({ x: e.x, y: SOL - 22, vx: 0, vy: -640, degats: e.s.degats * (1 + force * 5), perce: true, gros: 4 + force * 8, touches: new Set() });
  son(force > 0.8 ? "pouvoir" : "tir");
  e.secousse = Math.max(e.secousse, force * 0.15);
}

// ---------------------------------------------------------------------
// Mise a jour
// ---------------------------------------------------------------------

function toucherYokai(t) {
  for (const y of etat.yokai) {
    if (t.touches.has(y)) {
      continue;
    }
    const r = t.gros ? t.gros + 12 : 13;
    if (Math.abs(t.x - y.x) < r && Math.abs(t.y - y.y) < r) {
      t.touches.add(y);
      y.pv -= t.degats;
      y.flash = 0.12;
      if (y.pv <= 0) {
        abattre(y);
      } else {
        y.abime = true;
        son("impact");
      }
      return true;
    }
  }
  return false;
}

function abattre(y) {
  const e = etat;
  const f = FAMILLES[y.type];
  e.yokai = e.yokai.filter(z => z !== y);
  e.serie++;
  e.combo = Math.min(8, 1 + Math.floor(e.serie / 6));
  const gain = f.points * e.combo * Math.ceil(e.vague / 2);
  e.score += gain;
  e.sceau = Math.min(1, e.sceau + 0.035);
  if (gain >= 100) {
    texte(String(gain), y.x, y.y - 10, C.or, 11);
  }
  eclats(y.x, y.y, couleursDe(y.type), 12, 150);
  son("explosion");
  lacher(y.x, y.y, 0.3, 0.09);
  majHud();
}

function lacher(x, y, chancePiece, chanceBonus) {
  if (Math.random() < chancePiece) {
    etat.pieces.push({ x, y, vy: 60, valeur: Math.random() < 0.15 ? 5 : 1, age: 0 });
  }
  if (Math.random() < chanceBonus) {
    const types = ["double", "triple", "laser", "bouclier", "ralenti", "bombe", "aimant"];
    etat.bonus.push({ x, y, vy: 70, type: types[Math.floor(Math.random() * types.length)], age: 0 });
  }
}

function perdreVie() {
  const e = etat;
  if (e.invincible > 0) {
    return;
  }
  if (e.actifs.bouclier > 0) {
    e.actifs.bouclier = 0;
    son("impact");
    eclats(e.x, SOL, ["#a8d0e0", "#fff"], 16, 160);
    e.invincible = 0.8;
    return;
  }
  e.vies--;
  e.combo = 1;
  e.serie = 0;
  e.invincible = 2;
  e.secousse = 0.35;
  eclats(e.x, SOL, [e.v.coque, "#f2c23a", "#fff"], 26, 200);
  son("mort");
  majHud();
  if (e.vies <= 0) {
    finir();
  }
}

function finir() {
  const e = etat;
  e.termine = true;
  sauvegarde.record = Math.max(sauvegarde.record || 0, e.score);
  sauver();
  ecran = "fin";
  focus = 0;
  setTimeout(() => {
    if (etat === e && ecran === "fin" && !zone.hidden) {
      finDePartie(ID, e.score);
    }
  }, 2600);
}

function finVague() {
  const e = etat;
  const bonusVague = 100 * e.vague;
  e.score += bonusVague;
  texte("Vague nettoyée +" + bonusVague, W / 2, 330, C.lime, 16);
  son("vie");
  majHud();
  e.attenteVague = 1.6;
  e.tirsEnnemis = [];
}

function maj(dt) {
  temps += dt;
  if (!etat || etat.pause || ecran !== "jeu") {
    if (etat) {
      majEffets(dt);
    }
    return;
  }
  const e = etat;
  majEffets(dt);
  if (e.termine) {
    return;
  }
  Object.keys(e.actifs).forEach(k => {
    e.actifs[k] = Math.max(0, e.actifs[k] - dt);
  });
  e.invincible = Math.max(0, e.invincible - dt);
  const lent = e.actifs.ralenti > 0 ? 0.45 : 1;

  if (e.attenteVague > 0) {
    e.attenteVague -= dt;
    if (e.attenteVague <= 0) {
      // Boutique toutes les trois vagues
      if (e.vague % 3 === 0) {
        ouvrirBoutique();
        return;
      }
      lancerVague();
    }
  }

  // Deplacement
  let dir = (commandes.droite ? 1 : 0) - (commandes.gauche ? 1 : 0);
  if (doigt) {
    const ecart = doigt.x - e.x;
    dir = Math.abs(ecart) < 2 ? 0 : Math.sign(ecart) * Math.min(1, Math.abs(ecart) / 20);
  }
  e.x = Math.max(22, Math.min(W - 22, e.x + dir * e.s.vitesse * dt));

  // Tir
  const tient = commandes.tir || (doigt !== null);
  e.recharge -= dt;
  if (e.v.tir === "charge") {
    if (tient) {
      e.charge = Math.min(1, e.charge + dt / 0.9);
    } else if (e.charge > 0) {
      if (e.charge > 0.15) {
        tirCharge(e.charge);
      } else if (e.recharge <= 0) {
        tirer();
        e.recharge = e.s.cadence;
      }
      e.charge = 0;
    }
    // Les petits tirs partent quand meme si on tapote
  } else if (tient && e.recharge <= 0) {
    tirer();
    e.recharge = e.s.cadence;
  }

  // Tirs du joueur
  e.tirs.forEach(t => {
    t.x += t.vx * dt;
    t.y += t.vy * dt;
    if (!t.perce && toucherAbri(t.x, t.y, 2)) {
      t.mort = true;
      return;
    }
    if (toucherYokai(t) && !t.perce) {
      t.mort = true;
      return;
    }
    if (e.boss && e.boss.entree <= 0 && !t.touches.has(e.boss) && Math.abs(t.x - e.boss.x) < 54 && Math.abs(t.y - e.boss.y) < 48) {
      e.boss.pv -= t.degats;
      e.boss.flash = 0.08;
      e.score += 5;
      eclats(t.x, t.y, ["#ede8df", "#9a94a8"], 4, 90);
      if (t.perce) {
        t.touches.add(e.boss);
      } else {
        t.mort = true;
      }
      if (e.boss.pv <= 0) {
        bossVaincu();
      }
    }
    if (e.soucoupe && Math.abs(t.x - e.soucoupe.x) < 24 && Math.abs(t.y - e.soucoupe.y) < 14) {
      const gain = [100, 150, 300][Math.floor(Math.random() * 3)] * Math.ceil(e.vague / 2);
      e.score += gain;
      texte(String(gain), e.soucoupe.x, e.soucoupe.y, C.or, 16);
      eclats(e.soucoupe.x, e.soucoupe.y, ["#ede8df", "#d83a2c", "#f2c23a"], 22, 180);
      for (let i = 0; i < 5; i++) {
        e.pieces.push({ x: e.soucoupe.x + (i - 2) * 10, y: e.soucoupe.y, vy: 50 + i * 8, valeur: i === 2 ? 5 : 1, age: 0 });
      }
      lacher(e.soucoupe.x, e.soucoupe.y, 0, 1);
      e.soucoupe = null;
      son("grosseExplosion");
      if (!t.perce) {
        t.mort = true;
      }
      majHud();
    }
    if (t.y < 40) {
      t.mort = true;
      if (!t.perce) {
        e.serie = 0;
        e.combo = 1;
      }
    }
  });
  e.tirs = e.tirs.filter(t => !t.mort);

  // Formation
  if (e.yokai.length) {
    const f = e.formation;
    const restants = e.yokai.length / f.total;
    const vitesse = f.vitesse * (1 + (1 - restants) * 2.4) * lent;
    let minX = Infinity;
    let maxX = -Infinity;
    e.yokai.forEach(y => {
      minX = Math.min(minX, y.x);
      maxX = Math.max(maxX, y.x);
    });
    let descente = 0;
    if ((f.dx > 0 && maxX > W - 22) || (f.dx < 0 && minX < 22)) {
      f.dx *= -1;
      descente = 14;
    }
    e.yokai.forEach(y => {
      y.x += f.dx * vitesse * dt;
      y.y += descente;
      y.flash = Math.max(0, y.flash - dt);
      // Les yokai qui atteignent les abris les ecrasent
      if (y.y > SOL - 124) {
        toucherAbri(y.x, y.y + 8, 5);
      }
      if (y.y > SOL - 24 && !e.termine) {
        // La troupe a touche le sol : la partie s'arrete
        e.vies = 0;
        eclats(e.x, SOL, [e.v.coque, "#f2c23a", "#fff"], 26, 200);
        son("mort");
        finir();
      }
    });
    // Tirs ennemis : par les yokai du bas de chaque colonne
    const cadence = 0.55 * difficulte(e.vague) * lent;
    if (Math.random() < cadence * dt * (0.6 + (1 - restants))) {
      const bas = new Map();
      e.yokai.forEach(y => {
        const col = Math.round(y.x / 36);
        if (!bas.has(col) || bas.get(col).y < y.y) {
          bas.set(col, y);
        }
      });
      const tireurs = [...bas.values()];
      const t = tireurs[Math.floor(Math.random() * tireurs.length)];
      if (t) {
        const fam = FAMILLES[t.type];
        if (Math.random() < Math.min(1, fam.tir * 0.7)) {
          const vy = (170 + e.vague * 6) * Math.min(1.8, difficulte(e.vague));
          let vx = 0;
          if (fam.vise) {
            vx = Math.max(-120, Math.min(120, (e.x - t.x) * 0.5));
          }
          e.tirsEnnemis.push({ x: t.x, y: t.y + 12, vx, vy, type: t.type });
        }
      }
    }
  } else if (!e.boss && e.attenteVague <= 0) {
    finVague();
  }

  // Boss
  if (e.boss) {
    majBoss(e.boss, dt * lent);
  }

  // Soucoupe : le tengu sur son nuage
  e.prochaineSoucoupe -= dt;
  if (!e.soucoupe && e.prochaineSoucoupe <= 0 && !e.boss) {
    const sens = Math.random() < 0.5 ? 1 : -1;
    e.soucoupe = { x: sens > 0 ? -30 : W + 30, y: 70, vx: sens * 90 };
    e.prochaineSoucoupe = 16 + Math.random() * 10;
    son("vague");
  }
  if (e.soucoupe) {
    e.soucoupe.x += e.soucoupe.vx * dt * lent;
    if (e.soucoupe.x < -40 || e.soucoupe.x > W + 40) {
      e.soucoupe = null;
    }
  }

  // Tirs ennemis
  e.tirsEnnemis.forEach(t => {
    t.x += t.vx * dt * lent;
    t.y += t.vy * dt * lent;
    if (toucherAbri(t.x, t.y, 2)) {
      t.mort = true;
      return;
    }
    if (Math.abs(t.x - e.x) < 13 && Math.abs(t.y - (SOL - 2)) < 13) {
      t.mort = true;
      perdreVie();
    }
    if (t.y > H) {
      t.mort = true;
    }
  });
  e.tirsEnnemis = e.tirsEnnemis.filter(t => !t.mort);

  // Pieces et bonus qui tombent
  e.pieces.forEach(p => {
    p.age += dt;
    if (e.actifs.aimant > 0) {
      const dx = e.x - p.x;
      const dy = SOL - p.y;
      const d = Math.hypot(dx, dy) || 1;
      p.x += (dx / d) * 360 * dt;
      p.y += (dy / d) * 360 * dt;
    } else {
      p.y += p.vy * dt;
      p.vy = Math.min(220, p.vy + 120 * dt);
    }
    if (Math.abs(p.x - e.x) < 20 && Math.abs(p.y - SOL) < 20) {
      p.pris = true;
      e.kobanPartie += p.valeur;
      sauvegarde.koban += p.valeur;
      son("grain");
      texte("+" + p.valeur, p.x, p.y - 12, C.or, 11);
    }
  });
  e.pieces = e.pieces.filter(p => !p.pris && p.y < H + 10);
  e.bonus.forEach(b => {
    b.age += dt;
    b.y += b.vy * dt;
    if (Math.abs(b.x - e.x) < 22 && Math.abs(b.y - SOL) < 20) {
      b.pris = true;
      prendreBonus(b.type, b.x, b.y);
    }
  });
  e.bonus = e.bonus.filter(b => !b.pris && b.y < H + 10);
  if (Math.floor(temps * 2) !== Math.floor((temps - dt) * 2)) {
    sauver();
  }
}

const NOMS_BONUS = { double: "Tir double", triple: "Tir triple", laser: "Laser perçant", bouclier: "Bouclier", ralenti: "Ralenti", bombe: "Bombe", aimant: "Aimant à koban" };
const DUREES = { double: 12, triple: 10, laser: 8, bouclier: 14, ralenti: 7, aimant: 12 };

function prendreBonus(type, x, y) {
  const e = etat;
  son("bonus");
  texte(NOMS_BONUS[type], x, y - 16, C.lime, 13);
  if (type === "bombe") {
    // La rangee la plus basse disparait d'un coup
    if (e.yokai.length) {
      const bas = Math.max(...e.yokai.map(z => z.y));
      e.yokai.filter(z => Math.abs(z.y - bas) < 4).forEach(z => abattre(z));
    } else if (e.boss) {
      e.boss.pv -= e.boss.pvMax * 0.08;
    }
    e.secousse = 0.3;
    son("grosseExplosion");
    return;
  }
  e.actifs[type] = DUREES[type] * e.s.duree;
}

function utiliserSceau() {
  const e = etat;
  if (!e || ecran !== "jeu" || e.sceau < 1 || e.termine) {
    return;
  }
  e.sceau = 0;
  // Le sceau balaie tous les tirs ennemis et frappe toute la troupe
  e.tirsEnnemis.forEach(t => eclats(t.x, t.y, ["#f2c23a", "#fff"], 3, 60));
  e.tirsEnnemis = [];
  [...e.yokai].forEach(y => {
    y.pv -= 1;
    y.flash = 0.2;
    if (y.pv <= 0) {
      abattre(y);
    } else {
      y.abime = true;
    }
  });
  if (e.boss) {
    e.boss.pv -= e.boss.pvMax * 0.12;
    if (e.boss.pv <= 0) {
      bossVaincu();
    }
  }
  e.sceauOnde = 0.5;
  e.secousse = 0.4;
  son("grosseExplosion");
  annoncer("Sceau !", "", 0.8, C.or);
}

// ---------------------------------------------------------------------
// Boss : Gashadokuro, quatre motifs
// ---------------------------------------------------------------------

function majBoss(b, dt) {
  const e = etat;
  b.flash = Math.max(0, b.flash - dt);
  if (b.entree > 0) {
    b.entree -= dt;
    return;
  }
  b.phase += dt;
  b.x = W / 2 + Math.sin(b.phase * 0.7) * 150;
  b.minuterie -= dt;
  const rage = 1 + (1 - b.pv / b.pvMax) * 0.8 + b.rang * 0.1;
  if (b.rayon) {
    b.rayon.t -= dt;
    if (b.rayon.t < 0 && b.rayon.t > -0.6 && Math.abs(e.x - b.rayon.x) < 22) {
      perdreVie();
    }
    if (b.rayon.t <= -0.6) {
      b.rayon = null;
    }
  }
  if (b.minuterie <= 0) {
    b.motif = (b.motif + 1) % 4;
    b.minuterie = 2.4 / rage;
    if (b.motif === 0) {
      // Eventail d'os
      const n = 7 + b.rang;
      for (let i = 0; i < n; i++) {
        const a = Math.PI / 2 + (i - (n - 1) / 2) * 0.16;
        e.tirsEnnemis.push({ x: b.x, y: b.y + 40, vx: Math.cos(a) * 190, vy: Math.sin(a) * 190, type: "os" });
      }
      son("tir");
    } else if (b.motif === 1) {
      // Rafale visee
      for (let i = 0; i < 4 + b.rang; i++) {
        setTimeout(() => {
          if (etat === e && e.boss === b && !e.termine) {
            const dx = e.x - b.x;
            const dy = SOL - b.y;
            const d = Math.hypot(dx, dy);
            e.tirsEnnemis.push({ x: b.x, y: b.y + 40, vx: (dx / d) * 260, vy: (dy / d) * 260, type: "os" });
          }
        }, i * 130);
      }
    } else if (b.motif === 2) {
      // Rayon de feu annonce par une ligne
      b.rayon = { x: e.x, t: 1.1 };
      son("boss");
    } else {
      // Appel de petits yokai
      for (let i = 0; i < 3 + b.rang; i++) {
        e.yokai.push({ type: i % 2 ? "kasa" : "chochin", pv: 1, x: 80 + i * 70, y: b.y + 70, flash: 0, abime: false });
      }
      e.formation = { dx: 1, vitesse: 30 * difficulte(e.vague), descente: 0, total: e.yokai.length };
    }
  }
}

function bossVaincu() {
  const e = etat;
  const b = e.boss;
  if (!b) {
    return;
  }
  const gain = 5000 * b.rang;
  e.score += gain;
  texte("+" + gain, b.x, b.y, C.or, 20);
  for (let i = 0; i < 4; i++) {
    eclats(b.x + (Math.random() - 0.5) * 80, b.y + (Math.random() - 0.5) * 60, ["#ede8df", "#9a94a8", "#d83a2c"], 20, 220);
  }
  for (let i = 0; i < 12; i++) {
    e.pieces.push({ x: b.x + (Math.random() - 0.5) * 100, y: b.y, vy: 40 + Math.random() * 80, valeur: i < 4 ? 5 : 1, age: 0 });
  }
  lacher(b.x, b.y, 0, 1);
  e.boss = null;
  e.yokai = [];
  e.secousse = 0.6;
  son("grosseExplosion");
  annoncer("Boss vaincu", "+" + gain + " points", 2, C.lime);
  majHud();
  finVague();
}

function dessinerBoss(b) {
  const y = b.entree > 0 ? b.y - b.entree * 120 : b.y;
  ctx.save();
  ctx.translate(b.x, y);
  if (b.flash > 0) {
    ctx.globalAlpha = 0.7;
  }
  // Gashadokuro : grand crane, orbites rouges, mains osseuses
  const r = 46;
  ctx.fillStyle = "#cfc8b8";
  ctx.beginPath();
  ctx.ellipse(0, -6, r, r * 0.85, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#a8a090";
  ctx.beginPath();
  ctx.ellipse(10, 4, r * 0.75, r * 0.6, 0, 0, Math.PI);
  ctx.fill();
  ctx.fillStyle = "#e8e2d4";
  ctx.beginPath();
  ctx.ellipse(-14, -22, 16, 10, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1a1018";
  ctx.beginPath();
  ctx.ellipse(-17, -6, 11, 13, 0.2, 0, Math.PI * 2);
  ctx.ellipse(17, -6, 11, 13, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#d83a2c";
  const pulse = 3 + Math.sin(temps * 6) * 1.2;
  ctx.beginPath();
  ctx.arc(-17, -4, pulse, 0, Math.PI * 2);
  ctx.arc(17, -4, pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1a1018";
  ctx.beginPath();
  ctx.moveTo(-4, 10);
  ctx.lineTo(0, 2);
  ctx.lineTo(4, 10);
  ctx.fill();
  ctx.fillStyle = "#e8e2d4";
  for (let i = -3; i <= 3; i++) {
    ctx.fillRect(i * 7 - 3, 22, 5, 9);
  }
  ctx.fillStyle = "#1a1018";
  ctx.fillRect(-26, 21, 52, 2);
  // Mains
  [-1, 1].forEach(s => {
    const hx = s * (r + 22);
    const hy = 18 + Math.sin(temps * 3 + s) * 6;
    ctx.fillStyle = "#cfc8b8";
    ctx.beginPath();
    ctx.ellipse(hx, hy, 12, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#a8a090";
    for (let k = 0; k < 4; k++) {
      ctx.fillRect(hx - 9 + k * 5, hy + 6, 3, 9);
    }
  });
  ctx.restore();
  // Rayon annonce puis rayon de feu
  if (b.rayon) {
    if (b.rayon.t > 0) {
      ctx.strokeStyle = Math.floor(b.rayon.t * 10) % 2 ? "rgba(216,58,44,0.8)" : "rgba(216,58,44,0.3)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(b.rayon.x, b.y + 40);
      ctx.lineTo(b.rayon.x, H);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      ctx.fillStyle = "#d83a2c";
      ctx.fillRect(b.rayon.x - 14, b.y + 40, 28, H);
      ctx.fillStyle = "#f2c23a";
      ctx.fillRect(b.rayon.x - 6, b.y + 40, 12, H);
      ctx.fillStyle = "#fff";
      ctx.fillRect(b.rayon.x - 2, b.y + 40, 4, H);
    }
  }
  // Barre de vie
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(60, 52, W - 120, 8);
  ctx.fillStyle = C.rouge;
  ctx.fillRect(60, 52, (W - 120) * Math.max(0, b.pv / b.pvMax), 8);
  ctx.strokeStyle = C.creme;
  ctx.lineWidth = 1;
  ctx.strokeRect(60, 52, W - 120, 8);
}

// ---------------------------------------------------------------------
// Decor
// ---------------------------------------------------------------------

function peindreFond() {
  const off = document.createElement("canvas");
  off.width = Math.round((W + 60) * echelle);
  off.height = Math.round(H * echelle);
  const c = off.getContext("2d");
  c.setTransform(echelle, 0, 0, echelle, 0, 0);
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#0c0d26");
  g.addColorStop(0.55, "#221a44");
  g.addColorStop(1, "#3a1f3e");
  c.fillStyle = g;
  c.fillRect(0, 0, W + 60, H);
  // Quelques etoiles eparses, posees une fois
  const a = hasard(7);
  for (let i = 0; i < 34; i++) {
    const x = a() * (W + 60);
    const y = a() * H * 0.6;
    const t = a();
    c.fillStyle = t > 0.85 ? "#fff6d8" : "rgba(237,232,223,0.6)";
    if (t > 0.92) {
      c.fillRect(x - 2, y, 5, 1);
      c.fillRect(x, y - 2, 1, 5);
    } else {
      c.fillRect(x, y, t > 0.6 ? 2 : 1, t > 0.6 ? 2 : 1);
    }
  }
  // Pleine lune
  c.fillStyle = "#efe2be";
  c.beginPath();
  c.arc(W - 70, 120, 34, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#ddd0aa";
  c.beginPath();
  c.arc(W - 80, 112, 7, 0, Math.PI * 2);
  c.arc(W - 60, 132, 5, 0, Math.PI * 2);
  c.fill();
  return off;
}

function dessinerDecor() {
  const decal = etat ? (etat.x - W / 2) * 0.05 : 0;
  ctx.drawImage(fond, -30 - decal * 0.3, 0, W + 60, H);
  // Montagnes lointaines
  ctx.fillStyle = "#2c2350";
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let x = -40; x <= W + 40; x += 30) {
    ctx.lineTo(x - decal * 0.6, 500 - Math.abs(Math.sin(x * 0.012)) * 70 - Math.sin(x * 0.04) * 10);
  }
  ctx.lineTo(W, H);
  ctx.fill();
  // Village : toits et fenetres eclairees
  const base = 560;
  ctx.fillStyle = "#1a1530";
  for (let i = -1; i < 9; i++) {
    const x = i * 62 + 20 - decal;
    const h = 30 + ((i * 37) % 3) * 12;
    ctx.fillRect(x, base - h, 50, h + 80);
    ctx.beginPath();
    ctx.moveTo(x - 8, base - h);
    ctx.quadraticCurveTo(x + 25, base - h - 22, x + 58, base - h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = (i + Math.floor(temps * 0.2)) % 4 === 0 ? "#4a3420" : "#b8823a";
    ctx.fillRect(x + 10, base - h + 12, 7, 6);
    ctx.fillRect(x + 32, base - h + 12, 7, 6);
    ctx.fillStyle = "#1a1530";
  }
  // Pagode du sanctuaire
  const px = 360 - decal;
  ctx.fillStyle = "#161130";
  for (let k = 0; k < 4; k++) {
    const y = 520 - k * 26;
    const l = 46 - k * 8;
    ctx.fillRect(px - l / 2 + 6, y, l - 12, 26);
    ctx.beginPath();
    ctx.moveTo(px - l / 2 - 6, y + 4);
    ctx.quadraticCurveTo(px, y - 12, px + l / 2 + 6, y + 4);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillRect(px - 1, 400, 2, 22);
  // Sol
  ctx.fillStyle = "#14102a";
  ctx.fillRect(0, SOL + 22, W, H - SOL - 22);
  ctx.fillStyle = "#2a2148";
  ctx.fillRect(0, SOL + 22, W, 2);
}

function dessinerSoucoupe(s) {
  ctx.save();
  ctx.translate(s.x, s.y);
  // Nuage
  ctx.fillStyle = "#e8e2f0";
  ctx.beginPath();
  ctx.arc(-14, 6, 9, 0, Math.PI * 2);
  ctx.arc(0, 4, 12, 0, Math.PI * 2);
  ctx.arc(14, 6, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#b8b0c8";
  ctx.fillRect(-22, 8, 44, 6);
  // Tengu assis
  ctx.fillStyle = "#c8372d";
  ctx.beginPath();
  ctx.arc(0, -8, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#e0574b";
  ctx.beginPath();
  ctx.moveTo(4, -8);
  ctx.lineTo(13 * Math.sign(s.vx), -10);
  ctx.lineTo(4, -5);
  ctx.fill();
  ctx.fillStyle = "#1a1018";
  ctx.fillRect(-6, -16, 12, 3);
  ctx.fillRect(-3, -11, 2, 2);
  ctx.restore();
}

function dessinerKoban(p) {
  const l = Math.abs(Math.cos(p.age * 6)) * (p.valeur > 1 ? 7 : 5) + 1;
  const h = p.valeur > 1 ? 9 : 7;
  ctx.fillStyle = "#8a6a12";
  ctx.beginPath();
  ctx.ellipse(p.x + 1, p.y + 1, l, h, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = p.valeur > 1 ? "#ffd23a" : "#e8b83a";
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, l, h, 0, 0, Math.PI * 2);
  ctx.fill();
  if (l > 3) {
    ctx.fillStyle = "#a8820e";
    ctx.fillRect(p.x - l * 0.4, p.y - 1, l * 0.8, 2);
  }
}

const ICONES_BONUS = { double: "II", triple: "III", laser: "L", bouclier: "S", ralenti: "R", bombe: "B", aimant: "A" };
const COULEURS_BONUS = { double: "#2f8fd8", triple: "#8a55e0", laser: "#f2c23a", bouclier: "#5ab4c8", ralenti: "#7fbf3a", bombe: "#d83a2c", aimant: "#e06aa6" };

function dessinerBonus(b) {
  // Un omamori qui se balance en tombant
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(Math.sin(b.age * 4) * 0.2);
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.roundRect(-9, -11, 20, 25, 5);
  ctx.fill();
  ctx.fillStyle = COULEURS_BONUS[b.type];
  ctx.beginPath();
  ctx.roundRect(-10, -12, 20, 24, 5);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.fillRect(-7, -9, 5, 16);
  ctx.fillStyle = "#ffe08a";
  ctx.fillRect(-4, -15, 8, 4);
  ctx.fillStyle = "#fff";
  ctx.font = "800 10px 'Anybody', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(ICONES_BONUS[b.type], 0, 2);
  ctx.restore();
}

function contour(t, x, y, taille, couleur, alignement) {
  ctx.font = "800 " + taille + "px 'Anybody', sans-serif";
  ctx.textAlign = alignement || "left";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(3, taille * 0.2);
  ctx.strokeStyle = "#140c20";
  ctx.strokeText(t, x, y);
  ctx.fillStyle = couleur;
  ctx.fillText(t, x, y);
}

function mono(t, x, y, taille, couleur, alignement) {
  ctx.font = "600 " + taille + "px 'Martian Mono', monospace";
  ctx.textAlign = alignement || "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = couleur;
  ctx.fillText(t, x, y);
}

function dessinerHud() {
  const e = etat;
  mono("SCORE", 14, 16, 8, "#9a94c0");
  contour(e.score.toLocaleString("fr-BE"), 14, 34, 22, C.lime);
  mono("VAGUE", W / 2, 16, 8, "#9a94c0", "center");
  contour(String(e.vague), W / 2, 34, 22, C.creme, "center");
  // Koban de la reserve
  dessinerKoban({ x: W - 96, y: 32, valeur: 5, age: 0 });
  contour(String(sauvegarde.koban), W - 84, 33, 18, C.or);
  for (let i = 0; i < e.vies; i++) {
    dessinerVaisseau(e.v, W - 20 - i * 18, 62, 0.42, 0, 0, 0);
  }
  if (e.combo > 1) {
    contour("x" + e.combo, 14, 58, 14, C.or);
  }
  // Jauge de sceau
  const jx = 14;
  const jy = H - 22;
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(jx, jy, 120, 8);
  ctx.fillStyle = e.sceau >= 1 && Math.floor(temps * 4) % 2 ? "#fff" : C.or;
  ctx.fillRect(jx, jy, 120 * e.sceau, 8);
  ctx.strokeStyle = C.creme;
  ctx.lineWidth = 1;
  ctx.strokeRect(jx, jy, 120, 8);
  mono(e.sceau >= 1 ? "SCEAU PRÊT (B / X)" : "SCEAU", jx + 128, jy + 4, 8, e.sceau >= 1 ? C.or : "#9a94c0");
  // Bonus actifs
  let bx = W - 16;
  Object.keys(e.actifs).forEach(k => {
    if (e.actifs[k] > 0) {
      ctx.fillStyle = COULEURS_BONUS[k];
      ctx.beginPath();
      ctx.roundRect(bx - 22, H - 28, 22, 20, 4);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "800 9px 'Anybody', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(ICONES_BONUS[k], bx - 11, H - 20);
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      const total = DUREES[k] * e.s.duree;
      ctx.fillRect(bx - 22, H - 12, 22 * (1 - e.actifs[k] / total), 4);
      bx -= 26;
    }
  });
}

function dessinerJeu() {
  const e = etat;
  const sx = e.secousse > 0 ? (Math.random() - 0.5) * 8 * e.secousse : 0;
  const sy = e.secousse > 0 ? (Math.random() - 0.5) * 8 * e.secousse : 0;
  ctx.save();
  ctx.translate(sx, sy);
  dessinerDecor();
  if (e.actifs.ralenti > 0) {
    ctx.fillStyle = "rgba(127,191,58,0.08)";
    ctx.fillRect(0, 0, W, H);
  }
  e.abris.forEach(a => {
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(a.x + ABRI_L * CASE_ABRI / 2, a.y + ABRI_H * CASE_ABRI + 2, ABRI_L * CASE_ABRI * 0.55, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.drawImage(imageAbri(a), a.x, a.y, ABRI_L * CASE_ABRI, ABRI_H * CASE_ABRI);
  });
  if (e.soucoupe) {
    dessinerSoucoupe(e.soucoupe);
  }
  e.yokai.forEach(y => {
    ombreSous(y.x, y.y + 18, 9);
    dessinerYokai(y.type, y.x, y.y, temps, y.flash, y.abime);
  });
  if (e.boss) {
    dessinerBoss(e.boss);
  }
  // Tirs du joueur : feuilles de tanuki, laser, eclair
  e.tirs.forEach(t => {
    if (t.gros) {
      ctx.fillStyle = "#f2c23a";
      ctx.beginPath();
      ctx.moveTo(t.x, t.y - t.gros * 2);
      ctx.lineTo(t.x + t.gros * 0.6, t.y);
      ctx.lineTo(t.x - t.gros * 0.2, t.y + 2);
      ctx.lineTo(t.x + t.gros * 0.3, t.y + t.gros * 2);
      ctx.lineTo(t.x - t.gros * 0.6, t.y);
      ctx.lineTo(t.x + t.gros * 0.1, t.y - 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillRect(t.x - 1, t.y - t.gros, 2, t.gros * 2);
    } else if (t.perce) {
      ctx.fillStyle = "#f2c23a";
      ctx.fillRect(t.x - 2.5, t.y - 10, 5, 20);
      ctx.fillStyle = "#fff";
      ctx.fillRect(t.x - 1, t.y - 10, 2, 20);
    } else {
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.rotate(Math.atan2(t.vy, t.vx) + Math.PI / 2);
      ctx.fillStyle = "#9fdc4a";
      ctx.beginPath();
      ctx.ellipse(0, 0, 3, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#4a7a1c";
      ctx.fillRect(-0.5, -6, 1, 12);
      ctx.restore();
    }
  });
  // Tirs ennemis : gouttes, flammeches, concombres, os
  e.tirsEnnemis.forEach(t => {
    if (t.type === "chochin" || t.type === "oni") {
      ctx.fillStyle = "#f59a3a";
      ctx.beginPath();
      ctx.arc(t.x, t.y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffe08a";
      ctx.beginPath();
      ctx.arc(t.x, t.y - 1, 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (t.type === "kappa") {
      ctx.fillStyle = "#4a8a2a";
      ctx.beginPath();
      ctx.ellipse(t.x, t.y, 3, 7, Math.atan2(t.vx, t.vy) * -1, 0, Math.PI * 2);
      ctx.fill();
    } else if (t.type === "os") {
      ctx.fillStyle = "#e8e2d4";
      ctx.fillRect(t.x - 1.5, t.y - 6, 3, 12);
      ctx.beginPath();
      ctx.arc(t.x - 2, t.y - 6, 2.2, 0, Math.PI * 2);
      ctx.arc(t.x + 2, t.y - 6, 2.2, 0, Math.PI * 2);
      ctx.arc(t.x - 2, t.y + 6, 2.2, 0, Math.PI * 2);
      ctx.arc(t.x + 2, t.y + 6, 2.2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = "#7ab8d8";
      ctx.beginPath();
      ctx.moveTo(t.x, t.y - 7);
      ctx.quadraticCurveTo(t.x + 5, t.y + 2, t.x, t.y + 5);
      ctx.quadraticCurveTo(t.x - 5, t.y + 2, t.x, t.y - 7);
      ctx.fill();
    }
  });
  e.pieces.forEach(dessinerKoban);
  e.bonus.forEach(dessinerBonus);
  // Tanuki
  if (!e.termine && (e.invincible <= 0 || Math.floor(e.invincible * 12) % 2 === 0)) {
    ombreSous(e.x, SOL + 18, 16);
    dessinerVaisseau(e.v, e.x, SOL, 1, temps, e.actifs.bouclier, e.charge);
  }
  // Onde du sceau
  if (e.sceauOnde > 0) {
    ctx.strokeStyle = "rgba(242,194,58," + e.sceauOnde * 2 + ")";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(e.x, SOL, (0.5 - e.sceauOnde) * 1400, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Eclats et textes
  e.eclats.forEach(p => {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.globalAlpha = Math.min(1, p.vie * 3);
    ctx.fillStyle = p.couleur;
    ctx.beginPath();
    ctx.moveTo(-p.taille, p.taille * 0.6);
    ctx.lineTo(p.taille, p.taille * 0.6);
    ctx.lineTo(0, -p.taille);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  });
  ctx.globalAlpha = 1;
  e.textes.forEach(t => {
    ctx.globalAlpha = t.age > 0.6 ? Math.max(0, 1 - (t.age - 0.6) / 0.4) : 1;
    contour(t.t, t.x, t.y - t.age * 26, t.taille, t.couleur, "center");
  });
  ctx.globalAlpha = 1;
  ctx.restore();
  dessinerHud();
  if (e.banniere) {
    const b = e.banniere;
    ctx.fillStyle = "rgba(11,11,16,0.6)";
    ctx.fillRect(0, 300, W, 74);
    contour(b.titre.toUpperCase(), W / 2, 328, 30, b.couleur, "center");
    if (b.sous) {
      mono(b.sous, W / 2, 356, 10, C.creme, "center");
    }
  }
  if (e.pause) {
    ctx.fillStyle = "rgba(11,11,16,0.6)";
    ctx.fillRect(0, 0, W, H);
    contour("PAUSE", W / 2, H / 2, 40, C.creme, "center");
  }
}

function majEffets(dt) {
  const e = etat;
  e.eclats = e.eclats.filter(p => {
    p.vie -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 300 * dt;
    p.rot += p.vr * dt;
    return p.vie > 0;
  });
  e.textes = e.textes.filter(t => {
    t.age += dt;
    return t.age < 1;
  });
  if (e.banniere) {
    e.banniere.reste -= dt;
    if (e.banniere.reste <= 0) {
      e.banniere = null;
    }
  }
  e.secousse = Math.max(0, e.secousse - dt);
  if (e.sceauOnde > 0) {
    e.sceauOnde -= dt;
  }
}

// ---------------------------------------------------------------------
// Hangar et boutique
// ---------------------------------------------------------------------

function bouton(id, x, y, w, h, texteB, couleur, actif, action, enFocus) {
  boutons.push({ id, x, y, w, h, action, actif });
  ctx.fillStyle = actif ? couleur : "#2e2a44";
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(x + 6, y + h - 5, w - 12, 3);
  if (enFocus) {
    ctx.strokeStyle = C.lime;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(x - 3, y - 3, w + 6, h + 6, 12);
    ctx.stroke();
  }
  contour(texteB, x + w / 2, y + h / 2 + 1, Math.min(18, h * 0.42), actif ? "#fff" : "#7a7496", "center");
}

function barreStat(nom, valeur, x, y) {
  mono(nom, x, y, 8, "#b8b2d8");
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(x + 72, y - 4, 100, 8);
  ctx.fillStyle = C.lime;
  ctx.fillRect(x + 72, y - 4, 100 * Math.max(0.05, Math.min(1, valeur)), 8);
}

function enRun() {
  return ecran === "boutique";
}

function dessinerHangar() {
  boutons = [];
  ctx.drawImage(fond, -30, 0, W + 60, H);
  ctx.fillStyle = "rgba(14,10,30,0.45)";
  ctx.fillRect(0, 0, W, H);
  const run = enRun();
  contour(run ? "BOUTIQUE" : "HANGAR", 20, 34, 30, C.creme);
  mono(run ? "Vague " + etat.vague + " nettoyée. Prépare la suite." : "Choisis ton vaisseau, améliore-le.", 20, 60, 9, "#b8b2d8");
  dessinerKoban({ x: W - 110, y: 34, valeur: 5, age: temps });
  contour(String(sauvegarde.koban), W - 96, 35, 24, C.or);

  // Carte du vaisseau
  const v = run ? etat.v : VAISSEAUX[vueVaisseau];
  const debloque = sauvegarde.debloques.includes(v.id);
  ctx.fillStyle = "rgba(24,16,44,0.85)";
  ctx.beginPath();
  ctx.roundRect(16, 80, W - 32, 252, 16);
  ctx.fill();
  ctx.strokeStyle = "rgba(242,194,58,0.5)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  ctx.beginPath();
  ctx.arc(120, 190, 70, 0, Math.PI * 2);
  ctx.fill();
  if (!debloque) {
    ctx.globalAlpha = 0.45;
  }
  dessinerVaisseau(v, 120, 196, 2.8, temps, 0, 0);
  ctx.globalAlpha = 1;
  contour(v.nom.toUpperCase(), 222, 112, 26, C.creme);
  ctx.font = "700 20px 'Shippori Mincho B1', serif";
  ctx.fillStyle = C.rouge;
  ctx.textAlign = "right";
  ctx.fillText(v.jp, W - 34, 114);
  enveloppe(v.desc, 222, 140, W - 222 - 32, 9, "#d8d2f0");
  const s = statsJoueur(v);
  barreStat("VITESSE", s.vitesse / 420, 222, 186);
  barreStat("CADENCE", 0.1 / s.cadence, 222, 204);
  barreStat("PUISSANCE", s.degats / 2.4, 222, 222);
  barreStat("VIES", s.vies / 7, 222, 240);
  mono(v.tir === "eventail" ? "Tir en éventail" : v.tir === "charge" ? "Tir chargé" : "Tir droit", 222, 262, 8, C.or);
  if (!run) {
    bouton("prec", 26, 176, 34, 40, "‹", "#4a4470", true, () => changerVaisseau(-1), false);
    bouton("suiv", 180, 176, 34, 40, "›", "#4a4470", true, () => changerVaisseau(1), false);
    const choisi = sauvegarde.choisi === v.id;
    const texteB = choisi ? "Vaisseau choisi" : debloque ? "Choisir" : "Débloquer  " + v.prix;
    const peut = !choisi && (debloque || sauvegarde.koban >= v.prix);
    bouton("vaisseau", 222, 280, W - 222 - 30, 40, texteB, debloque ? "#2f8fd8" : C.orSombre, peut, () => actionVaisseau(v), focus === 0);
  }
  // Points de selection des vaisseaux
  if (!run) {
    VAISSEAUX.forEach((vv, i) => {
      ctx.fillStyle = i === vueVaisseau ? C.lime : sauvegarde.debloques.includes(vv.id) ? C.creme : "#4a4470";
      ctx.beginPath();
      ctx.arc(120 - 24 + i * 16, 312, 4, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // Ameliorations
  mono("AMÉLIORATIONS PERMANENTES", 20, 354, 8, "#b8b2d8");
  AMELIORATIONS.forEach((a, i) => {
    const y = 368 + i * 50;
    const niv = sauvegarde.ameliorations[a.id];
    ctx.fillStyle = "rgba(24,16,44,0.85)";
    ctx.beginPath();
    ctx.roundRect(16, y, W - 32, 44, 10);
    ctx.fill();
    contour(a.nom, 30, y + 15, 15, C.creme);
    mono(a.desc, 30, y + 33, 8, "#a8a2c8");
    for (let k = 0; k < NIVEAU_MAX; k++) {
      ctx.fillStyle = k < niv ? C.lime : "rgba(255,255,255,0.12)";
      ctx.beginPath();
      ctx.roundRect(216 + k * 18, y + 15, 14, 14, 3);
      ctx.fill();
    }
    const max = niv >= NIVEAU_MAX;
    const prix = max ? 0 : PRIX_AMELIORATION[niv];
    bouton("am" + i, W - 132, y + 6, 106, 32, max ? "Max" : prix + " koban", "#7fbf2a", !max && sauvegarde.koban >= prix, () => acheter(a), focus === i + 1);
  });

  // Jouer / continuer
  bouton("jouer", 16, 626, W - 32, 62, run ? "Continuer  (vague " + (etat.vague + 1) + ")" : "Jouer", C.rouge, true, () => (run ? continuerRun() : lancerPartie()), focus === AMELIORATIONS.length + 1);
  mono("Record : " + (sauvegarde.record || 0).toLocaleString("fr-BE"), W / 2, 704, 8, "#8a84b0", "center");
}

function enveloppe(t, x, y, largeur, taille, couleur) {
  ctx.font = "600 " + taille + "px 'Martian Mono', monospace";
  const mots = t.split(" ");
  const lignes = [];
  let ligne = "";
  mots.forEach(m => {
    const essai = ligne ? ligne + " " + m : m;
    if (ctx.measureText(essai).width > largeur && ligne) {
      lignes.push(ligne);
      ligne = m;
    } else {
      ligne = essai;
    }
  });
  lignes.push(ligne);
  lignes.slice(0, 3).forEach((l, i) => mono(l, x, y + i * (taille + 5), taille, couleur));
}

function changerVaisseau(d) {
  vueVaisseau = (vueVaisseau + d + VAISSEAUX.length) % VAISSEAUX.length;
  son("clic");
}

function actionVaisseau(v) {
  if (sauvegarde.debloques.includes(v.id)) {
    sauvegarde.choisi = v.id;
    son("clic");
  } else if (sauvegarde.koban >= v.prix) {
    sauvegarde.koban -= v.prix;
    sauvegarde.debloques.push(v.id);
    sauvegarde.choisi = v.id;
    son("pouvoir");
  }
  sauver();
}

function acheter(a) {
  const niv = sauvegarde.ameliorations[a.id];
  if (niv >= NIVEAU_MAX) {
    return;
  }
  const prix = PRIX_AMELIORATION[niv];
  if (sauvegarde.koban < prix) {
    return;
  }
  sauvegarde.koban -= prix;
  sauvegarde.ameliorations[a.id] = niv + 1;
  sauver();
  son("bonus");
  // En cours de partie, l'amelioration compte tout de suite
  if (enRun()) {
    const viesAvant = etat.s.vies;
    etat.s = statsJoueur(etat.v);
    etat.vies += etat.s.vies - viesAvant;
  }
}

function ouvrirBoutique() {
  ecran = "boutique";
  focus = AMELIORATIONS.length + 1;
  sauver();
  son("vie");
}

function continuerRun() {
  ecran = "jeu";
  etat.abris = nouveauxAbris();
  lancerVague();
}

function lancerPartie() {
  if (!sauvegarde.debloques.includes(VAISSEAUX[vueVaisseau].id)) {
    vueVaisseau = VAISSEAUX.findIndex(v => v.id === sauvegarde.choisi);
  }
  etat = nouvelEtat();
  ecran = "jeu";
  lancerVague();
  majHud();
  majScoreCourant(ID, 0);
}

function dessinerFin() {
  dessinerJeu();
  ctx.fillStyle = "rgba(11,11,16,0.72)";
  ctx.fillRect(0, 0, W, H);
  contour("FIN DE PARTIE", W / 2, 250, 36, C.rouge, "center");
  contour(etat.score.toLocaleString("fr-BE"), W / 2, 310, 40, C.lime, "center");
  mono("points, vague " + etat.vague, W / 2, 342, 10, C.creme, "center");
  dessinerKoban({ x: W / 2 - 52, y: 390, valeur: 5, age: temps });
  contour("+" + etat.kobanPartie + " koban", W / 2 - 38, 391, 18, C.or);
  mono("Dépense-les au hangar en rejouant", W / 2, 430, 9, "#b8b2d8", "center");
}

function dessiner() {
  ctx.setTransform(echelle, 0, 0, echelle, 0, 0);
  if (ecran === "hangar" || ecran === "boutique") {
    dessinerHangar();
  } else if (ecran === "fin") {
    dessinerFin();
  } else if (etat) {
    dessinerJeu();
  }
}

const boucle = creerBoucle(function (dt) {
  maj(dt);
  dessiner();
}, { plafond: 1 / 30 });

function ajuster() {
  const marge = window.innerWidth >= 1100 ? 500 : 0;
  const largeur = Math.min(window.innerWidth * 0.96 - marge, 600);
  const entete = zone.querySelector(".entete-yokai").getBoundingClientRect().height || 40;
  const m = document.querySelector(".manette:not([hidden])");
  const manette = m ? m.getBoundingClientRect().height : 0;
  const hauteur = Math.max(300, window.innerHeight - entete - manette - 34);
  const taille = Math.min(largeur / W, hauteur / H);
  canvas.style.width = Math.floor(W * taille) + "px";
  canvas.style.height = Math.floor(H * taille) + "px";
  const nouvelle = Math.min(3, Math.max(1, taille * (window.devicePixelRatio || 1)));
  if (Math.abs(nouvelle - echelle) > 0.02 || fond === null) {
    echelle = nouvelle;
    canvas.width = Math.round(W * echelle);
    canvas.height = Math.round(H * echelle);
    fond = peindreFond();
    if (etat) {
      etat.abris.forEach(a => {
        a.image = null;
      });
    }
  }
}

window.addEventListener("resize", function () {
  if (!zone.hidden) {
    ajuster();
  }
});

function majHud() {
  if (etat) {
    majScoreCourant(ID, etat.score);
  }
}

// ---------------------------------------------------------------------
// Commandes
// ---------------------------------------------------------------------

function pointLogique(evenement) {
  const r = canvas.getBoundingClientRect();
  return [(evenement.clientX - r.left) / r.width * W, (evenement.clientY - r.top) / r.height * H];
}

function nbElementsFocus() {
  return AMELIORATIONS.length + 2;
}

function activerFocus() {
  const id = focus === 0 ? "vaisseau" : focus <= AMELIORATIONS.length ? "am" + (focus - 1) : "jouer";
  const b = boutons.find(x => x.id === id);
  if (b && b.actif) {
    b.action();
  } else {
    son("clic");
  }
}

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
  if (ecran === "hangar" || ecran === "boutique") {
    if (touche === "arrowup" || touche === "z") {
      focus = (focus - 1 + nbElementsFocus()) % nbElementsFocus();
      if (enRun() && focus === 0) {
        focus = nbElementsFocus() - 1;
      }
    } else if (touche === "arrowdown" || touche === "s") {
      focus = (focus + 1) % nbElementsFocus();
      if (enRun() && focus === 0) {
        focus = 1;
      }
    } else if ((touche === "arrowleft" || touche === "q") && !enRun()) {
      changerVaisseau(-1);
    } else if ((touche === "arrowright" || touche === "d") && !enRun()) {
      changerVaisseau(1);
    } else if (touche === " " || touche === "enter") {
      activerFocus();
    } else if (touche === "p") {
      if (enRun()) {
        continuerRun();
      } else {
        lancerPartie();
      }
    } else {
      return;
    }
    evenement.preventDefault();
    return;
  }
  if (ecran === "fin") {
    if (touche === "n" || touche === "enter") {
      ouvrirHangar();
      evenement.preventDefault();
    }
    return;
  }
  if (touche === "arrowleft" || touche === "q" || touche === "a") {
    commandes.gauche = true;
  } else if (touche === "arrowright" || touche === "d") {
    commandes.droite = true;
  } else if (touche === " " || touche === "arrowup" || touche === "z" || touche === "w") {
    commandes.tir = true;
  } else if (touche === "x" || touche === "b" || touche === "shift") {
    utiliserSceau();
  } else if (touche === "p") {
    if (etat && !etat.termine) {
      etat.pause = !etat.pause;
      if (!etat.pause) {
        boucle.remettreALHeure();
      }
    }
  } else if (touche === "n") {
    ouvrirHangar();
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
  } else if (touche === " " || touche === "arrowup" || touche === "z" || touche === "w") {
    commandes.tir = false;
  }
});

canvas.addEventListener("pointerdown", function (evenement) {
  if (!jeuAuPremierPlan(ID)) {
    return;
  }
  evenement.preventDefault();
  const [x, y] = pointLogique(evenement);
  if (ecran === "hangar" || ecran === "boutique") {
    const b = boutons.find(bt => x >= bt.x && x <= bt.x + bt.w && y >= bt.y && y <= bt.y + bt.h);
    if (b && b.actif) {
      b.action();
    }
    return;
  }
  if (ecran === "fin") {
    ouvrirHangar();
    return;
  }
  doigts.add(evenement.pointerId);
  if (doigts.size >= 2) {
    utiliserSceau();
    return;
  }
  canvas.setPointerCapture(evenement.pointerId);
  doigt = { id: evenement.pointerId, x };
});

canvas.addEventListener("pointermove", function (evenement) {
  if (doigt && evenement.pointerId === doigt.id) {
    doigt.x = pointLogique(evenement)[0];
  }
});

function relacher(evenement) {
  doigts.delete(evenement.pointerId);
  if (doigt && evenement.pointerId === doigt.id) {
    doigt = null;
  }
}
canvas.addEventListener("pointerup", relacher);
canvas.addEventListener("pointercancel", relacher);
canvas.addEventListener("contextmenu", evenement => evenement.preventDefault());

document.addEventListener("visibilitychange", function () {
  if (document.hidden && etat && ecran === "jeu" && !etat.pause && !etat.termine && !zone.hidden) {
    etat.pause = true;
  }
});

function majBoutonSon() {
  boutonSon.textContent = sonActif() ? "Son" : "Muet";
}

function ouvrirHangar() {
  ecran = "hangar";
  focus = AMELIORATIONS.length + 1;
  vueVaisseau = Math.max(0, VAISSEAUX.findIndex(v => v.id === sauvegarde.choisi));
  commandes.gauche = commandes.droite = commandes.tir = false;
  doigt = null;
}

boutonSon.addEventListener("click", function () {
  basculerSon();
  majBoutonSon();
});
boutonHangar.addEventListener("click", function () {
  if (etat && ecran === "jeu" && !etat.termine && etat.score > 0) {
    // Quitter une partie en cours compte comme une fin
    finir();
    return;
  }
  ouvrirHangar();
});
boutonRecommencer.addEventListener("click", ouvrirHangar);
boutonQuitter.addEventListener("click", quitterJeu);

function demarrer() {
  sauvegarde = Object.assign(sauvegardeVide(), stockage.lire() || {});
  sauvegarde.ameliorations = Object.assign(sauvegardeVide().ameliorations, sauvegarde.ameliorations || {});
  fond = null;
  ajuster();
  requestAnimationFrame(ajuster);
  ouvrirHangar();
  majBoutonSon();
  majScoreCourant(ID, 0);
  boucle.lancer();
}

// Pour les tests automatiques
export const _test = {
  get etat() { return etat; },
  get ecran() { return ecran; },
  lancerPartie, ouvrirBoutique, prendreBonus, lancerBoss: () => { etat.vague = 4; etat.yokai = []; lancerVague(); },
  sauvegarde: () => sauvegarde, commandes
};

enregistrerJeu({
  id: ID,
  nom: "Yokai Invaders",
  code: "1978",
  section: zone,
  demarrer,
  manette: { a: " ", b: "x", start: "p", libelles: { a: "Tirer", b: "Sceau" } },
  arreter: () => {
    boucle.arreter();
    commandes.gauche = commandes.droite = commandes.tir = false;
    doigt = null;
    sauver();
  }
});
