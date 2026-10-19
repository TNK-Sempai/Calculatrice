// =====================================================================
//  TANUKI GASSEN - la grande bataille des tanuki d'Awa
//  Artillerie au tour par tour, facon Worms. Deux clans de tanuki
//  s'affrontent sur un terrain qui se creuse a chaque explosion.
//  Le vent, la gravite et l'eau en contrebas font le reste.
//
//  Armes :
//  - gland : l'obus de base, sensible au vent ;
//  - bouilloire : rebondit et explose apres trois secondes (le tanuki
//    bouilloire de la legende, Bunbuku Chagama) ;
//  - feuille : plane longtemps, tres sensible au vent ;
//  - grappe de kaki : eclate en quatre pepins a l'impact ;
//  - mochi collant : se colle ou il touche et explose deux secondes
//    plus tard ;
//  - frappe de tengu : un corbeau lache cinq glands sur la cible ;
//  - transformation : le tanuki se change en fumee et reapparait plus loin.
//
//  Trois modes : la campagne (des etapes contre une IA de plus en plus
//  forte, le score s'additionne), le duel contre l'IA a un niveau
//  choisi, et la partie a deux sur le meme appareil, sans classement.
// =====================================================================

import { enregistrerJeu, finDePartie, quitterJeu, majScoreCourant } from "./arcade.js";
import { creerBoucle } from "./noyau/boucle.js";
import { surTouche, surRelachement, jeuAuPremierPlan } from "./noyau/clavier.js";
import { creerEffets } from "./noyau/effets.js";
import { jouer, basculerSon, sonActif } from "./noyau/son.js";
import { VERMILLON, PAPIER } from "./tanukiland/sprites.js";
import { dessinerTanuki } from "./tanukiland/rendu.js";
import { creerTerrain, FORMES, NOMS_FORMES } from "./gassen/terrain.js";

const ID = "gassen";
const VUE_L = 640;
const VUE_H = 400;
const MONDE_L = 1280;
const MONDE_H = 560;
const GRAVITE = 520;
const VITESSE_MAX = 640;
const FORCE_VENT = 150;
const VITESSE_MARCHE = 46;
const ENDURANCE = 170;          // pixels de marche par tour
const DUREE_TOUR = 30;
const PV_DEPART = 100;
const LIME = "#c8f060";
const ENCRE = "#120e0c";
const TAILLE_TANUKI = 0.72;     // le tanuki de Tanukiland, a l'echelle du champ de bataille

const CLANS = [
  { nom: "Clan Kinchō", court: "Kinchō", couleur: LIME, tanuki: ["Kinchō", "Fujinoki", "Kotaka", "Matsuo"] },
  { nom: "Clan Rokuemon", court: "Rokuemon", couleur: VERMILLON, tanuki: ["Rokuemon", "Kumataka", "Sennin", "Shibaemon"] }
];

const ARMES = [
  { id: "gland", nom: "Gland", munitions: Infinity, vent: 1, gravite: 1, rayon: 24, degats: 42 },
  { id: "bouilloire", nom: "Bouilloire", munitions: 3, vent: 0.4, gravite: 1, rayon: 34, degats: 55, rebond: true, minuterie: 3 },
  { id: "feuille", nom: "Feuille", munitions: 3, vent: 2.4, gravite: 0.3, rayon: 20, degats: 34, plane: true },
  { id: "kaki", nom: "Kaki", munitions: 2, vent: 0.8, gravite: 1, rayon: 18, degats: 22, grappe: 4 },
  { id: "mochi", nom: "Mochi", munitions: 2, vent: 0.6, gravite: 1, rayon: 30, degats: 50, colle: true, minuterie: 2 },
  { id: "tengu", nom: "Tengu", munitions: 1, cible: true, vent: 0.5, gravite: 1, rayon: 20, degats: 26 },
  { id: "transformation", nom: "Henge", munitions: 2, cible: true }
];
const INDEX_TENGU = ARMES.findIndex(a => a.id === "tengu");
// Les pepins de la grappe : une arme qu'on ne choisit pas
const PEPIN = { id: "pepin", vent: 0.5, gravite: 1, rayon: 13, degats: 15 };
// Les armes a projectile que l'IA sait simuler
const ARMES_TIREES = ARMES.map((a, i) => (a.cible ? -1 : i)).filter(i => i >= 0);

const NIVEAUX = {
  facile: { nom: "Facile", erreurPuissance: 0.12, erreurAngle: 9, multiplicateur: 1 },
  moyen: { nom: "Moyen", erreurPuissance: 0.05, erreurAngle: 4, multiplicateur: 1.5 },
  difficile: { nom: "Difficile", erreurPuissance: 0.015, erreurAngle: 1.5, multiplicateur: 2 }
};

const ORDRE_THEMES = ["printemps", "automne", "hiver", "volcan"];

// Chaque etape de la campagne resserre la visee de l'IA, lui donne plus
// de vie, puis un quatrieme tanuki. Au-dela, elle reste au plafond.
function etapeCampagne(n) {
  return {
    nom: "Étape " + n,
    erreurPuissance: Math.max(0.012, 0.14 - (n - 1) * 0.018),
    erreurAngle: Math.max(1, 11 - (n - 1) * 1.4),
    pvIA: Math.min(160, 80 + (n - 1) * 12),
    armesRares: n >= 3,
    nombreIA: n >= 5 ? 4 : 3,
    multiplicateur: 1 + (n - 1) * 0.3,
    theme: ORDRE_THEMES[(n - 1) % ORDRE_THEMES.length],
    forme: FORMES[(n - 1) % FORMES.length]
  };
}

// ---------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------

const zone = document.createElement("section");
zone.className = "jeu jeu-gassen";
zone.id = "jeuGassen";
zone.hidden = true;
zone.innerHTML = `
  <div class="jeu-entete entete-gassen">
    <span class="jeu-score score-principal">Tour <strong class="valeur-score" id="tourGassen">1</strong></span>
    <span class="jeu-score">Arme <strong id="armeGassen">Gland</strong></span>
    <span class="gassen-boutons">
      <button class="jeu-quitter" id="sonGassen" type="button" aria-pressed="false">Son</button>
      <button class="jeu-quitter" id="rejouerGassen" type="button">Rejouer</button>
      <button class="jeu-quitter" id="quitterGassen" type="button">Retour</button>
    </span>
  </div>
  <div class="gassen-reglages">
    <span class="gassen-groupe" id="modesGassen">
      <button class="jeu-quitter" type="button" data-mode="campagne">Campagne</button>
      <button class="jeu-quitter" type="button" data-mode="ia">Contre l'IA</button>
      <button class="jeu-quitter" type="button" data-mode="duel">À deux</button>
    </span>
    <span class="gassen-groupe" id="niveauxGassen">
      <button class="jeu-quitter" type="button" data-niveau="facile">Facile</button>
      <button class="jeu-quitter" type="button" data-niveau="moyen">Moyen</button>
      <button class="jeu-quitter" type="button" data-niveau="difficile">Difficile</button>
    </span>
  </div>
  <canvas id="canvasGassen" width="${VUE_L * 2}" height="${VUE_H * 2}"></canvas>
  <div class="gassen-armes" id="armesGassen"></div>
  <p class="jeu-aide">Au doigt ou à la souris : glisse depuis ton tanuki vers la cible, plus loin pour plus de force, et lâche pour tirer. Au clavier : flèches pour marcher et viser, Espace maintenu pour charger. E ou 1 à 7 pour changer d'arme. P pause, M son, N rejouer, Échap quitter.</p>`;
document.body.appendChild(zone);

const canvas = zone.querySelector("#canvasGassen");
const contexte = canvas.getContext("2d");
const zoneTour = zone.querySelector("#tourGassen");
const zoneArme = zone.querySelector("#armeGassen");
const zoneArmes = zone.querySelector("#armesGassen");
const zoneModes = zone.querySelector("#modesGassen");
const zoneNiveaux = zone.querySelector("#niveauxGassen");
const boutonSon = zone.querySelector("#sonGassen");
const boutonRejouer = zone.querySelector("#rejouerGassen");
const boutonQuitter = zone.querySelector("#quitterGassen");

// Reglages retenus d'une partie a l'autre
let mode = "campagne";
let niveau = "moyen";
let meilleureEtape = 0;
try {
  const garde = JSON.parse(localStorage.getItem("tanuki-arcade-gassen") || "{}");
  if (garde.mode === "ia" || garde.mode === "duel" || garde.mode === "campagne") {
    mode = garde.mode;
  }
  if (NIVEAUX[garde.niveau]) {
    niveau = garde.niveau;
  }
  if (Number.isFinite(garde.meilleureEtape)) {
    meilleureEtape = garde.meilleureEtape;
  }
} catch (erreur) {
  // reglages par defaut
}

function garderReglages() {
  try {
    localStorage.setItem("tanuki-arcade-gassen", JSON.stringify({ mode, niveau, meilleureEtape }));
  } catch (erreur) {
    // sans stockage, on garde les reglages le temps de la page
  }
}

// ---------------------------------------------------------------------
// Etat
// ---------------------------------------------------------------------

const effets = creerEffets();
let etat = null;
let terrain = null;
let campagne = { etape: 1, total: 0 };
let particules = [];
let nuages = [];
let echelle = 2;
let ui = 1;                     // grossissement de l'interface sur petit ecran
let UL = VUE_L;
let UH = VUE_H;
const touches = { gauche: false, droite: false, haut: false, bas: false, tir: false };

function nouvelEtat() {
  return {
    tanuki: [],
    projectiles: [],
    camera: { x: 0, y: 0 },
    vent: 0,
    eau: MONDE_H - 26,
    tour: 1,
    tourGlobal: 0,
    equipe: 0,
    indexParEquipe: [0, 0],
    actif: null,
    arme: [0, 0],
    munitions: [ARMES.map(a => a.munitions), ARMES.map(a => a.munitions)],
    phase: "debut",
    minuteur: 1.4,
    tempsTour: DUREE_TOUR,
    marche: ENDURANCE,
    charge: 0,
    enCharge: false,
    viseDoigt: false,
    degats: [0, 0],
    banniere: null,
    banniereSuivante: null,
    ia: null,
    tengu: null,
    gagnant: null,
    pause: false,
    temps: 0,
    calme: 0,
    reglageIA: null,
    pvMax: [0, 0]
  };
}

function placerTanuki(reglage) {
  const liste = [];
  // Les places de chaque clan, chacun dans sa moitie du terrain
  CLANS.forEach((clan, equipe) => {
    const nombre = equipe === 1 && reglage ? reglage.nombreIA : 3;
    const pv = equipe === 1 && reglage ? reglage.pvIA : PV_DEPART;
    for (let i = 0; i < nombre; i++) {
      let x = 0;
      let essais = 0;
      do {
        const debut = equipe === 0 ? MONDE_L * 0.08 : MONDE_L * 0.56;
        x = debut + (i + 0.5) * (MONDE_L * 0.36 / nombre) + (Math.random() - 0.5) * 50;
        if (essais > 10) {
          x = debut + Math.random() * MONDE_L * 0.36;
        }
        essais++;
      } while (terrain.surface(Math.round(x), 0) > etat.eau - 30 && essais < 40);
      const y = terrain.surface(Math.round(x), 0) - 1;
      liste.push({
        equipe, nom: clan.tanuki[i], x, y, vx: 0, vy: 0, pv, pvMax: pv,
        vivant: true, face: equipe === 0 ? 1 : -1, angle: 35, auSol: true, pas: 0,
        aie: 0, marcheRecente: 0, chute: 0
      });
      etat.pvMax[equipe] += pv;
    }
  });
  return liste;
}

// ---------------------------------------------------------------------
// Physique des tanuki
// ---------------------------------------------------------------------

function surLeSol(t) {
  return terrain.plein(t.x, t.y + 1) || terrain.plein(t.x - 3, t.y + 1) || terrain.plein(t.x + 3, t.y + 1);
}

// Monte une petite marche si besoin ; refuse un mur
function marcher(t, sens, delta) {
  if (!t.auSol) {
    return 0;
  }
  const nx = t.x + sens * VITESSE_MARCHE * delta;
  if (nx < 4 || nx > MONDE_L - 4) {
    return 0;
  }
  let ny = t.y;
  if (terrain.plein(nx, ny)) {
    let k = 1;
    while (k <= 6 && terrain.plein(nx, ny - k)) {
      k++;
    }
    if (k > 6) {
      return 0;
    }
    ny -= k;
  }
  if (terrain.plein(nx, ny - 18)) {
    return 0;
  }
  const parcouru = Math.abs(nx - t.x);
  t.x = nx;
  t.y = ny;
  t.pas += parcouru;
  t.marcheRecente = 0.15;
  t.auSol = surLeSol(t);
  return parcouru;
}

function majCorps(t, delta) {
  t.aie = Math.max(0, t.aie - delta);
  t.marcheRecente = Math.max(0, t.marcheRecente - delta);
  if (!t.vivant) {
    return;
  }
  if (t.auSol && t.vx === 0 && t.vy === 0) {
    if (!surLeSol(t)) {
      t.auSol = false;
    } else {
      return;
    }
  }
  t.vy += GRAVITE * delta;
  const etapes = Math.max(1, Math.ceil(Math.max(Math.abs(t.vx), Math.abs(t.vy)) * delta));
  for (let i = 0; i < etapes; i++) {
    const nx = t.x + t.vx * delta / etapes;
    if (terrain.plein(nx, t.y - 6) || nx < 2 || nx > MONDE_L - 2) {
      t.vx = -t.vx * 0.2;
    } else {
      t.x = nx;
    }
    const ny = t.y + t.vy * delta / etapes;
    if (t.vy > 0 && terrain.plein(t.x, ny + 1)) {
      // Atterrissage, avec des degats si la chute est rude
      if (t.vy > 430) {
        blesser(t, Math.round((t.vy - 430) / 9), null);
      }
      if (t.vy > 160) {
        poussiere(t.x, t.y, 5);
      }
      t.vy = 0;
      t.vx *= 0.35;
      if (Math.abs(t.vx) < 12) {
        t.vx = 0;
      }
      t.auSol = true;
      // On se recale juste au-dessus de la terre
      while (terrain.plein(t.x, t.y)) {
        t.y--;
      }
      break;
    }
    if (t.vy < 0 && terrain.plein(t.x, ny - 18)) {
      t.vy = 0;
    } else {
      t.y = ny;
    }
  }
  if (t.auSol && t.vx !== 0) {
    marcher(t, Math.sign(t.vx), Math.abs(t.vx) / VITESSE_MARCHE * delta);
    t.vx *= 0.8;
    if (Math.abs(t.vx) < 12) {
      t.vx = 0;
    }
  }
  if (t.y > etat.eau) {
    noyer(t);
  }
}

function blesser(t, degats, parEquipe) {
  if (!t.vivant || degats <= 0) {
    return;
  }
  t.pv = Math.max(0, t.pv - degats);
  t.aie = 0.9;
  effets.flotter(t.x, t.y - 34, "-" + degats, t.equipe === 0 ? LIME : "#ff8a7a", 11);
  if (parEquipe !== null && parEquipe !== t.equipe) {
    etat.degats[parEquipe] += degats;
  }
  if (t.pv <= 0) {
    t.vivant = false;
    t.tombe = true;
    eclats(t.x, t.y - 10, ["#8a6644", "#4a3622", PAPIER], 14, 150);
    fumee(t.x, t.y - 10, 4, 12);
    jouer("mort");
  }
}

function noyer(t) {
  if (!t.vivant) {
    return;
  }
  t.vivant = false;
  t.noye = true;
  t.pv = 0;
  eclabousser(t.x, 14);
  for (let i = 0; i < 6; i++) {
    particules.push({ type: "bulle", x: t.x + (Math.random() - 0.5) * 8, y: etat.eau + 4 + i * 3, vy: -20 - Math.random() * 20, r: 1 + Math.random() * 1.6, vie: 0.6 + i * 0.12, vieMax: 0.6 + i * 0.12 });
  }
  jouer("mort");
}

// ---------------------------------------------------------------------
// Particules : eclats de terre, feu, fumee, onde, eau
// ---------------------------------------------------------------------

function eclats(x, y, couleurs, nombre, elan) {
  for (let i = 0; i < nombre; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = elan * (0.35 + Math.random() * 0.8);
    const taille = 1.5 + Math.random() * 3;
    const forme = [];
    const cotes = 4 + Math.floor(Math.random() * 2);
    for (let k = 0; k < cotes; k++) {
      const ak = (k / cotes) * Math.PI * 2;
      forme.push([Math.cos(ak) * taille * (0.6 + Math.random() * 0.5), Math.sin(ak) * taille * (0.6 + Math.random() * 0.5)]);
    }
    particules.push({
      type: "eclat", x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - elan * 0.45,
      rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14, forme,
      couleur: couleurs[Math.floor(Math.random() * couleurs.length)],
      vie: 0.9 + Math.random() * 0.8, vieMax: 1.7
    });
  }
}

function fumee(x, y, nombre, rayon) {
  for (let i = 0; i < nombre; i++) {
    particules.push({
      type: "fumee", x: x + (Math.random() - 0.5) * rayon, y: y + (Math.random() - 0.5) * rayon * 0.6,
      vx: (Math.random() - 0.5) * 16, vy: -14 - Math.random() * 16,
      r: rayon * (0.3 + Math.random() * 0.3), rMax: rayon * (0.7 + Math.random() * 0.4),
      vie: 0.9 + Math.random() * 0.6, vieMax: 1.5
    });
  }
}

function poussiere(x, y, nombre) {
  for (let i = 0; i < nombre; i++) {
    particules.push({
      type: "fumee", x: x + (Math.random() - 0.5) * 8, y: y - 1,
      vx: (Math.random() - 0.5) * 40, vy: -8 - Math.random() * 10,
      r: 1.5, rMax: 3.5, vie: 0.4, vieMax: 0.4, poussiere: true
    });
  }
}

function eclabousser(x, nombre) {
  const [, , reflet] = terrain.theme.eau;
  for (let i = 0; i < nombre; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.4;
    const v = 80 + Math.random() * 110;
    particules.push({
      type: "goutte", x: x + (Math.random() - 0.5) * 6, y: etat.eau,
      vx: Math.cos(a) * v, vy: Math.sin(a) * v, couleur: Math.random() < 0.5 ? reflet : "#ffffff",
      vie: 0.8, vieMax: 0.8
    });
  }
  particules.push({ type: "rond", x, y: etat.eau, r: 2, vie: 0.6, vieMax: 0.6 });
}

function boule(x, y, rayon) {
  // Le souffle : une onde courte, puis des boules de feu qui virent a la fumee
  particules.push({ type: "onde", x, y, r: rayon * 0.4, rMax: rayon * 1.5, vie: 0.22, vieMax: 0.22 });
  const n = 5 + Math.round(rayon / 6);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = Math.random() * rayon * 0.5;
    particules.push({
      type: "feu", x: x + Math.cos(a) * d, y: y + Math.sin(a) * d,
      vx: Math.cos(a) * 30, vy: Math.sin(a) * 30 - 24,
      r: rayon * 0.25, rMax: rayon * (0.35 + Math.random() * 0.25),
      vie: 0.55 + Math.random() * 0.35, vieMax: 0.9
    });
  }
}

function majParticules(delta) {
  particules = particules.filter(p => {
    p.vie -= delta;
    if (p.vie <= 0) {
      return false;
    }
    if (p.type === "eclat") {
      p.vy += 420 * delta;
      p.x += p.vx * delta;
      p.y += p.vy * delta;
      p.rot += p.vr * delta;
      if (terrain.plein(p.x, p.y)) {
        p.y -= p.vy * delta;
        p.vy *= -0.3;
        p.vx *= 0.55;
        p.vr *= 0.5;
      }
      if (p.y > etat.eau) {
        return false;
      }
    } else if (p.type === "goutte") {
      p.vy += 420 * delta;
      p.x += p.vx * delta;
      p.y += p.vy * delta;
      if (p.y > etat.eau + 2 && p.vy > 0) {
        return false;
      }
    } else if (p.type === "feu" || p.type === "fumee") {
      p.x += p.vx * delta;
      p.y += p.vy * delta;
      p.vx *= 0.94;
      p.vy *= 0.97;
      p.x += etat.vent * 14 * delta;
      const k = 1 - p.vie / p.vieMax;
      p.rCourant = p.r + (p.rMax - p.r) * Math.min(1, k * 2);
    } else if (p.type === "onde" || p.type === "rond") {
      const k = 1 - p.vie / p.vieMax;
      p.rCourant = p.type === "onde" ? p.r + (p.rMax - p.r) * k : 2 + k * 16;
    } else if (p.type === "bulle") {
      p.y += p.vy * delta;
      if (p.y < etat.eau) {
        return false;
      }
    } else if (p.type === "plume") {
      p.vy = Math.min(p.vy + 60 * delta, 30);
      p.x += (p.vx + Math.sin(p.vie * 6) * 20) * delta;
      p.y += p.vy * delta;
      p.rot += delta * 3;
    }
    return true;
  });
}

function dessinerParticules(c) {
  particules.forEach(p => {
    const k = p.vie / p.vieMax;
    if (p.type === "eclat") {
      c.globalAlpha = Math.min(1, k * 3);
      c.save();
      c.translate(p.x, p.y);
      c.rotate(p.rot);
      c.fillStyle = p.couleur;
      c.beginPath();
      p.forme.forEach(([fx, fy], i) => (i ? c.lineTo(fx, fy) : c.moveTo(fx, fy)));
      c.closePath();
      c.fill();
      c.strokeStyle = "rgba(0,0,0,0.35)";
      c.lineWidth = 0.6;
      c.stroke();
      c.restore();
    } else if (p.type === "feu") {
      // Jaune au coeur, orange, puis gris en fin de vie
      const age = 1 - k;
      c.globalAlpha = Math.min(1, k * 2.2);
      c.fillStyle = age < 0.25 ? "#ffe9a0" : age < 0.5 ? "#f6a23a" : age < 0.7 ? "#d0502a" : "#5a4e4a";
      c.beginPath();
      c.arc(p.x, p.y, p.rCourant || p.r, 0, Math.PI * 2);
      c.fill();
    } else if (p.type === "fumee") {
      c.globalAlpha = Math.min(0.55, k);
      c.fillStyle = p.poussiere ? "#c8b89a" : "#6a625e";
      c.beginPath();
      c.arc(p.x, p.y, p.rCourant || p.r, 0, Math.PI * 2);
      c.fill();
    } else if (p.type === "onde") {
      c.globalAlpha = k;
      c.strokeStyle = "#fff6dc";
      c.lineWidth = 2.5 * k + 0.5;
      c.beginPath();
      c.arc(p.x, p.y, p.rCourant || p.r, 0, Math.PI * 2);
      c.stroke();
    } else if (p.type === "rond") {
      c.globalAlpha = k;
      c.strokeStyle = "#ffffff";
      c.lineWidth = 1;
      c.beginPath();
      c.ellipse(p.x, p.y + 1, p.rCourant || 2, (p.rCourant || 2) * 0.3, 0, 0, Math.PI * 2);
      c.stroke();
    } else if (p.type === "goutte") {
      c.globalAlpha = Math.min(1, k * 2);
      c.fillStyle = p.couleur;
      c.fillRect(p.x - 1, p.y - 1, 2, 2);
    } else if (p.type === "bulle") {
      c.globalAlpha = 0.8;
      c.strokeStyle = "#e8f6fb";
      c.lineWidth = 0.8;
      c.beginPath();
      c.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      c.stroke();
    } else if (p.type === "plume") {
      c.globalAlpha = Math.min(1, k * 2);
      c.save();
      c.translate(p.x, p.y);
      c.rotate(p.rot);
      c.fillStyle = "#1c1a22";
      c.beginPath();
      c.ellipse(0, 0, 3.5, 1.2, 0, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
  });
  c.globalAlpha = 1;
}

// ---------------------------------------------------------------------
// Tirs et explosions
// ---------------------------------------------------------------------

function vitesseDeDepart(angle, puissance, face) {
  const a = angle * Math.PI / 180;
  const v = puissance * VITESSE_MAX;
  return { vx: face * Math.cos(a) * v, vy: -Math.sin(a) * v };
}

function tirer(t, arme, puissance) {
  const def = ARMES[arme];
  const equipe = t.equipe;
  if (etat.munitions[equipe][arme] <= 0) {
    return;
  }
  etat.munitions[equipe][arme]--;
  etat.enCharge = false;
  etat.viseDoigt = false;
  etat.charge = 0;

  if (def.cible) {
    const cibleX = Math.max(10, Math.min(MONDE_L - 10, t.x + t.face * (50 + puissance * 560)));
    if (def.id === "tengu") {
      // Le corbeau traverse le ciel et lache cinq glands sur la cible
      etat.tengu = { x: cibleX - t.face * 260, cible: cibleX, face: t.face, lache: 0, equipe };
      jouer("boss");
    } else {
      transformer(t, cibleX);
    }
    etat.phase = "vol";
    majHud();
    return;
  }

  const v = vitesseDeDepart(t.angle, puissance, t.face);
  const a = t.angle * Math.PI / 180;
  const bx = t.x + t.face * Math.cos(a) * 14;
  const by = t.y - 13 - Math.sin(a) * 14;
  etat.projectiles.push({
    def, equipe, tireur: t,
    x: bx, y: by, vx: v.vx, vy: v.vy,
    age: 0, minuterie: def.colle ? 0 : def.minuterie || 0, colle: false, rot: 0
  });
  fumee(bx, by, 3, 6);
  etat.phase = "vol";
  jouer("tir");
  majHud();
}

function transformer(t, cibleX) {
  fumee(t.x, t.y - 10, 8, 16);
  let x = cibleX;
  let y = terrain.surface(Math.round(x), 0) - 1;
  // Pas de reapparition dans l'eau : on recule vers le lanceur
  let essais = 0;
  while (y > etat.eau - 6 && essais < 60) {
    x -= t.face * 8;
    y = terrain.surface(Math.round(x), 0) - 1;
    essais++;
  }
  t.x = x;
  t.y = y;
  t.vx = 0;
  t.vy = 0;
  t.auSol = true;
  fumee(t.x, t.y - 10, 8, 16);
  eclats(t.x, t.y - 14, ["#9fc43f", "#7fb23a"], 6, 70);
  jouer("pouvoir");
}

function exploser(x, y, rayon, degats, equipe) {
  // Les eclats prennent la couleur de ce que le souffle arrache
  const couleurs = [];
  for (let i = 0; i < 10; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = Math.random() * rayon;
    const col = terrain.couleurEn(x + Math.cos(a) * d, y + Math.sin(a) * d);
    if (col) {
      couleurs.push(col);
    }
  }
  terrain.creuser(x, y, rayon);
  terrain.redessiner();
  boule(x, y, rayon);
  if (couleurs.length) {
    eclats(x, y, couleurs, 10 + Math.round(rayon / 2), 150 + rayon * 3);
  }
  fumee(x, y - rayon * 0.2, 4, rayon * 0.9);
  effets.secouer(Math.min(10, rayon / 4), 0.35);
  jouer(rayon > 30 ? "grosseExplosion" : "explosion");
  etat.tanuki.forEach(t => {
    if (!t.vivant) {
      return;
    }
    const dx = t.x - x;
    const dy = (t.y - 10) - y;
    const d = Math.hypot(dx, dy);
    const portee = rayon + 14;
    if (d >= portee) {
      return;
    }
    const f = 1 - d / portee;
    blesser(t, Math.round(degats * f), equipe);
    const n = d || 1;
    t.vx += (dx / n) * 280 * f;
    t.vy += (dy / n) * 200 * f - 140 * f;
    t.auSol = false;
  });
  // Un mochi colle a un mur souffle retombe
  etat.projectiles.forEach(p => {
    if (p.colle && Math.hypot(p.x - x, p.y - y) < rayon + 4) {
      p.colle = false;
    }
  });
  etat.calme = 0;
  majScoreCourant(ID, scoreCourant());
}

// Le point d'impact le plus proche dans la direction du mouvement
function avancerProjectile(p, delta) {
  const def = p.def;
  p.age += delta;
  if (p.colle) {
    // Colle : il ne bouge plus, sauf si on lui retire son appui
    if (!terrain.plein(p.x, p.y + 2) && !terrain.plein(p.x - 2, p.y) && !terrain.plein(p.x + 2, p.y) && !terrain.plein(p.x, p.y - 2)) {
      p.colle = false;
    }
    return null;
  }
  p.vx += etat.vent * FORCE_VENT * def.vent * delta;
  p.vy += GRAVITE * def.gravite * delta;
  if (def.plane) {
    p.vy = Math.min(p.vy, 70);
  }
  p.rot += (def.id === "feuille" ? 6 : def.rebond ? 4 : 10) * delta * Math.sign(p.vx || 1);
  const etapes = Math.max(1, Math.ceil(Math.max(Math.abs(p.vx), Math.abs(p.vy)) * delta));
  for (let i = 0; i < etapes; i++) {
    p.x += p.vx * delta / etapes;
    p.y += p.vy * delta / etapes;
    if (p.x < -60 || p.x > MONDE_L + 60 || p.y > etat.eau) {
      if (p.y > etat.eau && p.x > 0 && p.x < MONDE_L) {
        eclabousser(p.x, 8);
      }
      return "perdu";
    }
    // Un tanuki touche de plein fouet
    if (!def.rebond) {
      for (const t of etat.tanuki) {
        if (t.vivant && (t !== p.tireur || p.age > 0.25) && Math.hypot(t.x - p.x, t.y - 10 - p.y) < 10) {
          if (def.colle) {
            p.colle = true;
            p.minuterie = def.minuterie;
            p.vx = 0;
            p.vy = 0;
            return "colle";
          }
          return "impact";
        }
      }
    }
    if (terrain.plein(p.x, p.y)) {
      if (def.colle) {
        p.x -= p.vx * delta / etapes;
        p.y -= p.vy * delta / etapes;
        p.colle = true;
        p.minuterie = def.minuterie;
        p.vx = 0;
        p.vy = 0;
        jouer("clic");
        return "colle";
      }
      if (def.rebond) {
        // La bouilloire rebondit : on la renvoie selon la pente locale
        p.x -= p.vx * delta / etapes;
        p.y -= p.vy * delta / etapes;
        const nx = (terrain.plein(p.x - 3, p.y) ? 1 : 0) - (terrain.plein(p.x + 3, p.y) ? 1 : 0);
        const ny = (terrain.plein(p.x, p.y - 3) ? 1 : 0) - (terrain.plein(p.x, p.y + 3) ? 1 : 0);
        const n = Math.hypot(nx, ny) || 1;
        const ux = nx / n;
        const uy = ny / n;
        const produit = p.vx * ux + p.vy * uy;
        p.vx = (p.vx - 2 * produit * ux) * 0.45;
        p.vy = (p.vy - 2 * produit * uy) * 0.45;
        if (Math.hypot(p.vx, p.vy) > 60) {
          jouer("clic");
        }
        return "rebond";
      }
      return "impact";
    }
  }
  return null;
}

function majProjectiles(delta) {
  const nouveaux = [];
  etat.projectiles = etat.projectiles.filter(p => {
    const def = p.def;
    const resultat = avancerProjectile(p, delta);
    if (def.rebond || (def.colle && p.colle)) {
      p.minuterie -= delta;
      if (p.minuterie <= 0) {
        exploser(p.x, p.y, def.rayon, def.degats, p.equipe);
        return false;
      }
      return resultat !== "perdu";
    }
    if (resultat === "impact") {
      exploser(p.x, p.y, def.rayon, def.degats, p.equipe);
      if (def.grappe) {
        // La grappe : quatre pepins en eventail
        for (let k = 0; k < def.grappe; k++) {
          nouveaux.push({
            def: PEPIN, equipe: p.equipe, tireur: null,
            x: p.x, y: p.y - 6,
            vx: (k - (def.grappe - 1) / 2) * 70 + (Math.random() - 0.5) * 20,
            vy: -200 - Math.random() * 60,
            age: 1, minuterie: 0, colle: false, rot: 0
          });
        }
      }
      return false;
    }
    return resultat !== "perdu";
  });
  etat.projectiles.push(...nouveaux);
}

function majTengu(delta) {
  const tg = etat.tengu;
  if (tg === null) {
    return;
  }
  tg.x += tg.face * 240 * delta;
  // Cinq glands lacheres autour de la cible
  const ecart = (tg.x - tg.cible) * tg.face;
  if (tg.lache < 5 && ecart > -60 + tg.lache * 30) {
    etat.projectiles.push({
      def: ARMES[INDEX_TENGU], equipe: tg.equipe, tireur: null,
      x: tg.x, y: 34, vx: tg.face * 30, vy: 40, age: 1, minuterie: 0, colle: false, rot: 0
    });
    particules.push({ type: "plume", x: tg.x, y: 30, vx: -tg.face * 20, vy: 0, rot: 0, vie: 1.4, vieMax: 1.4 });
    tg.lache++;
  }
  if (ecart > 360) {
    etat.tengu = null;
  }
}

// ---------------------------------------------------------------------
// IA : elle simule ses tirs et garde le meilleur
// ---------------------------------------------------------------------

function simulerTir(t, angle, puissance, arme, face) {
  const def = ARMES[arme];
  const v = vitesseDeDepart(angle, puissance, face);
  const a = angle * Math.PI / 180;
  let x = t.x + face * Math.cos(a) * 14;
  let y = t.y - 13 - Math.sin(a) * 14;
  let vx = v.vx;
  let vy = v.vy;
  const dt = 1 / 60;
  for (let k = 0; k < 420; k++) {
    vx += etat.vent * FORCE_VENT * def.vent * dt;
    vy += GRAVITE * def.gravite * dt;
    if (def.plane) {
      vy = Math.min(vy, 70);
    }
    const etapes = Math.max(1, Math.ceil(Math.max(Math.abs(vx), Math.abs(vy)) * dt / 3));
    for (let i = 0; i < etapes; i++) {
      x += vx * dt / etapes;
      y += vy * dt / etapes;
      if (x < -60 || x > MONDE_L + 60 || y > etat.eau) {
        return null;
      }
      if (terrain.plein(x, y)) {
        return { x, y };
      }
      if (k > 15) {
        for (const autre of etat.tanuki) {
          if (autre.vivant && Math.hypot(autre.x - x, autre.y - 10 - y) < 10) {
            return { x, y };
          }
        }
      }
    }
  }
  return null;
}

function evaluerImpact(t, point, rayon) {
  let note = 0;
  etat.tanuki.forEach(autre => {
    if (!autre.vivant) {
      return;
    }
    const d = Math.hypot(autre.x - point.x, autre.y - 10 - point.y);
    const portee = rayon + 14;
    if (d < portee) {
      const f = 1 - d / portee;
      note += (autre.equipe === t.equipe ? -1.6 : 1) * f * 100;
    } else if (autre.equipe !== t.equipe) {
      // Un tir proche vaut mieux qu'un tir perdu
      note += Math.max(0, 30 - d / 12);
    }
  });
  return note;
}

function planifierIA(t) {
  const reglage = etat.reglageIA;
  const munitions = etat.munitions[t.equipe];
  let meilleur = null;
  const candidates = ARMES_TIREES.filter(i => reglage.armesRares || i <= 2);
  candidates.forEach(arme => {
    if (munitions[arme] <= 0) {
      return;
    }
    const def = ARMES[arme];
    // La grappe vaut un peu plus que son seul rayon
    const rayon = def.grappe ? def.rayon + 14 : def.rayon;
    [1, -1].forEach(face => {
      for (let angle = -20; angle <= 85; angle += 5) {
        for (let puissance = 0.25; puissance <= 1.001; puissance += 0.05) {
          const point = simulerTir(t, angle, puissance, arme, face);
          if (point === null) {
            continue;
          }
          let note = evaluerImpact(t, point, rayon);
          // Les munitions rares servent seulement si elles apportent beaucoup
          if (arme !== 0) {
            note -= 12;
          }
          if (meilleur === null || note > meilleur.note) {
            meilleur = { arme, face, angle, puissance, note };
          }
        }
      }
    });
  });
  // Aucun bon tir : la frappe de tengu passe au-dessus des obstacles
  const ennemis = etat.tanuki.filter(a => a.vivant && a.equipe !== t.equipe);
  if ((meilleur === null || meilleur.note < 25) && munitions[INDEX_TENGU] > 0 && ennemis.length) {
    const cible = ennemis.reduce((a, b) => (a.pv < b.pv ? a : b));
    const face = cible.x > t.x ? 1 : -1;
    const puissance = Math.max(0, Math.min(1, (Math.abs(cible.x - t.x) - 50) / 560));
    return { arme: INDEX_TENGU, face, angle: t.angle, puissance };
  }
  if (meilleur === null) {
    return { arme: 0, face: t.face, angle: 45, puissance: 0.6 };
  }
  // L'erreur de visee depend du niveau
  meilleur.puissance = Math.max(0.1, Math.min(1, meilleur.puissance + (Math.random() * 2 - 1) * reglage.erreurPuissance));
  meilleur.angle += (Math.random() * 2 - 1) * reglage.erreurAngle;
  return meilleur;
}

function majIA(delta) {
  const t = etat.actif;
  const ia = etat.ia;
  if (ia.etape === "reflexion") {
    ia.attente -= delta;
    if (ia.attente <= 0) {
      ia.plan = planifierIA(t);
      etat.arme[t.equipe] = ia.plan.arme;
      ia.etape = "visee";
      majHud();
    }
  } else if (ia.etape === "visee") {
    t.face = ia.plan.face;
    const ecart = ia.plan.angle - t.angle;
    const pas = 70 * delta;
    if (Math.abs(ecart) <= pas) {
      t.angle = ia.plan.angle;
      ia.etape = "charge";
      etat.enCharge = true;
      etat.charge = 0;
    } else {
      t.angle += Math.sign(ecart) * pas;
    }
  } else if (ia.etape === "charge") {
    etat.charge = Math.min(1, etat.charge + delta * 0.9);
    if (etat.charge >= ia.plan.puissance) {
      ia.etape = "fini";
      tirer(t, ia.plan.arme, ia.plan.puissance);
    }
  }
}

// ---------------------------------------------------------------------
// Tours
// ---------------------------------------------------------------------

function vivantsDe(equipe) {
  return etat.tanuki.filter(t => t.vivant && t.equipe === equipe);
}

function estIA(equipe) {
  return mode !== "duel" && equipe === 1;
}

function commencerTour() {
  const equipe = etat.equipe;
  const vivants = etat.tanuki.filter(t => t.equipe === equipe);
  // Le prochain tanuki vivant du clan, chacun son tour
  let index = etat.indexParEquipe[equipe];
  for (let k = 0; k < vivants.length; k++) {
    const t = vivants[(index + k) % vivants.length];
    if (t.vivant) {
      etat.actif = t;
      etat.indexParEquipe[equipe] = (index + k + 1) % vivants.length;
      break;
    }
  }
  etat.vent = Math.round((Math.random() * 2 - 1) * 10) / 10;
  etat.tempsTour = DUREE_TOUR;
  etat.marche = ENDURANCE;
  etat.charge = 0;
  etat.enCharge = false;
  etat.viseDoigt = false;
  etat.ia = estIA(equipe) ? { etape: "reflexion", attente: 0.9 } : null;
  etat.phase = "debut";
  etat.minuteur = 1.1;
  const banniere = { texte: etat.actif.nom, sous: CLANS[equipe].nom, couleur: CLANS[equipe].couleur, age: 0 };
  if (etat.banniere && etat.banniere.carte) {
    etat.banniereSuivante = banniere;
  } else {
    etat.banniere = banniere;
  }
  // Si l'arme choisie est epuisee, retour au gland
  if (etat.munitions[equipe][etat.arme[equipe]] <= 0) {
    etat.arme[equipe] = 0;
  }
  majHud();
}

function finirTour() {
  // Victoire ?
  const restants = [vivantsDe(0).length, vivantsDe(1).length];
  if (restants[0] === 0 || restants[1] === 0) {
    terminer(restants[0] > 0 ? 0 : restants[1] > 0 ? 1 : -1);
    return;
  }
  etat.tourGlobal++;
  if (etat.tourGlobal % 2 === 0) {
    etat.tour++;
    // Mort subite : l'eau monte a partir du dixieme tour
    if (etat.tour > 10) {
      etat.eau = Math.max(MONDE_H * 0.4, etat.eau - 10);
      etat.banniere = { texte: "L'eau monte", sous: "Mort subite", couleur: "#7ab8d4", age: -0.6 };
    }
  }
  etat.equipe = 1 - etat.equipe;
  commencerTour();
}

function scoreDeVictoire() {
  const survivants = vivantsDe(0);
  const pv = survivants.reduce((s, t) => s + t.pv, 0);
  return 1000 + pv * 4 + survivants.length * 250 + etat.degats[0] - etat.tour * 15;
}

function scoreCourant() {
  if (etat === null) {
    return 0;
  }
  if (mode === "campagne") {
    return Math.round(campagne.total + etat.degats[0] * etat.reglageIA.multiplicateur);
  }
  return etat.degats[0];
}

function terminer(gagnant) {
  etat.phase = "fin";
  etat.gagnant = gagnant;
  jouer(gagnant === 0 ? "vie" : "mort");
  if (mode === "duel") {
    return;
  }
  const reglage = etat.reglageIA;
  if (mode === "campagne") {
    if (gagnant === 0) {
      const gain = Math.max(0, Math.round(scoreDeVictoire() * reglage.multiplicateur));
      campagne.total += gain;
      etat.gain = gain;
      etat.scoreFinal = campagne.total;
      if (campagne.etape > meilleureEtape) {
        meilleureEtape = campagne.etape;
        garderReglages();
      }
      majScoreCourant(ID, campagne.total);
      // L'etape suivante se lance seule
      const ici = etat;
      setTimeout(() => {
        if (etat === ici && !zone.hidden) {
          campagne.etape++;
          lancerManche();
        }
      }, 3200);
      return;
    }
    etat.scoreFinal = Math.round(campagne.total + etat.degats[0] * reglage.multiplicateur);
    majScoreCourant(ID, etat.scoreFinal);
    const ici = etat;
    setTimeout(() => {
      if (etat === ici && !zone.hidden) {
        finDePartie(ID, ici.scoreFinal, "Tanuki Gassen Campagne, étape " + campagne.etape);
      }
    }, 2400);
    return;
  }
  let score = gagnant === 0 ? scoreDeVictoire() : etat.degats[0];
  score = Math.max(0, Math.round(score * reglage.multiplicateur));
  etat.scoreFinal = score;
  majScoreCourant(ID, score);
  const ici = etat;
  setTimeout(() => {
    if (etat === ici && !zone.hidden) {
      finDePartie(ID, ici.scoreFinal, "Tanuki Gassen " + NIVEAUX[niveau].nom);
    }
  }, 2200);
}

// ---------------------------------------------------------------------
// Boucle
// ---------------------------------------------------------------------

function toutEstCalme() {
  return etat.projectiles.length === 0 && etat.tengu === null
    && etat.tanuki.every(t => !t.vivant || (t.auSol && t.vx === 0 && t.vy === 0));
}

function maj(delta) {
  if (etat === null || etat.pause) {
    return;
  }
  etat.temps += delta;
  effets.maj(delta);
  majParticules(delta);
  majNuages(delta);
  if (etat.banniere) {
    etat.banniere.age += delta;
    const duree = etat.banniere.carte ? 2.2 : 1.6;
    if (etat.banniere.age > duree) {
      etat.banniere = etat.banniereSuivante;
      etat.banniereSuivante = null;
    }
  }

  etat.tanuki.forEach(t => majCorps(t, delta));
  majTengu(delta);
  majProjectiles(delta);

  const t = etat.actif;
  if (etat.phase === "debut") {
    etat.minuteur -= delta;
    if (etat.minuteur <= 0) {
      etat.phase = "visee";
    }
  } else if (etat.phase === "visee") {
    if (!t.vivant) {
      etat.phase = "attente";
      etat.calme = 0;
    } else if (etat.ia) {
      majIA(delta);
    } else {
      etat.tempsTour -= delta;
      if (!etat.enCharge && !etat.viseDoigt) {
        const sens = (touches.droite ? 1 : 0) - (touches.gauche ? 1 : 0);
        if (sens !== 0) {
          t.face = sens;
          if (etat.marche > 0) {
            etat.marche -= marcher(t, sens, delta);
          }
        }
      }
      const visee = (touches.haut ? 1 : 0) - (touches.bas ? 1 : 0);
      t.angle = Math.max(-80, Math.min(88, t.angle + visee * 55 * delta));
      if (etat.enCharge) {
        etat.charge = Math.min(1, etat.charge + delta * 0.75);
      }
      if (etat.tempsTour <= 0) {
        etat.phase = "attente";
        etat.calme = 0;
        etat.enCharge = false;
        etat.viseDoigt = false;
      }
    }
  } else if (etat.phase === "vol") {
    if (toutEstCalme()) {
      etat.phase = "attente";
      etat.calme = 0;
    }
  } else if (etat.phase === "attente") {
    if (toutEstCalme()) {
      etat.calme += delta;
      if (etat.calme > 0.7) {
        finirTour();
      }
    } else {
      etat.calme = 0;
    }
  }

  majCamera(delta);
}

function majCamera(delta) {
  let cx;
  let cy;
  const p = etat.projectiles[0];
  if (p) {
    cx = p.x;
    cy = p.y;
  } else if (etat.tengu) {
    cx = etat.tengu.x;
    cy = 120;
  } else if (etat.actif) {
    cx = etat.actif.x;
    cy = etat.actif.y - 40;
    const def = ARMES[etat.arme[etat.actif.equipe]];
    if (def.cible && (etat.enCharge || etat.viseDoigt)) {
      cx = etat.actif.x + etat.actif.face * (50 + etat.charge * 560);
    }
  } else {
    cx = MONDE_L / 2;
    cy = MONDE_H / 2;
  }
  const cibleX = Math.max(0, Math.min(MONDE_L - VUE_L, cx - VUE_L / 2));
  let haut = cy - VUE_H / 2;
  if (!p && !etat.tengu && etat.actif) {
    // On descend assez pour voir l'eau, sans perdre le tanuki par le haut
    haut = Math.min(etat.actif.y - 100, Math.max(haut, etat.eau + 34 - VUE_H));
  }
  const cibleY = Math.max(0, Math.min(MONDE_H - VUE_H, haut));
  // Au doigt, la camera bouge plus doucement : la cible ne fuit pas sous le pouce
  const k = Math.min(1, delta * (etat.viseDoigt ? 1.5 : 4));
  etat.camera.x += (cibleX - etat.camera.x) * k;
  etat.camera.y += (cibleY - etat.camera.y) * k;
}

// ---------------------------------------------------------------------
// Dessin : decor
// ---------------------------------------------------------------------

function creerNuages() {
  nuages = [];
  for (let i = 0; i < 6; i++) {
    nuages.push({ x: Math.random() * (VUE_L + 200) - 100, y: 30 + Math.random() * 110, l: 40 + Math.random() * 50, k: 0.3 + Math.random() * 0.4 });
  }
}

// Les nuages filent avec le vent : on lit sa force dans le ciel
function majNuages(delta) {
  nuages.forEach(n => {
    n.x += (etat.vent * 34 + 3) * n.k * delta;
    if (n.x > VUE_L + 120) {
      n.x = -120;
    } else if (n.x < -120) {
      n.x = VUE_L + 120;
    }
  });
}

function crete(c, couleur, base, parallaxe, camX, camY, fonction, pas) {
  c.fillStyle = couleur;
  c.beginPath();
  c.moveTo(0, VUE_H);
  for (let sx = 0; sx <= VUE_L + pas; sx += pas) {
    const wx = sx + camX * parallaxe;
    c.lineTo(sx, base - camY * parallaxe * 0.5 + fonction(wx));
  }
  c.lineTo(VUE_L, VUE_H);
  c.closePath();
  c.fill();
}

function dessinerCiel(c, camX, camY) {
  const th = terrain.theme;
  const g = c.createLinearGradient(0, 0, 0, VUE_H);
  g.addColorStop(0, th.ciel[0]);
  g.addColorStop(0.55, th.ciel[1]);
  g.addColorStop(1, th.ciel[2]);
  c.fillStyle = g;
  c.fillRect(0, 0, VUE_L, VUE_H);

  // Le soleil ou la lune, presque immobile
  const a = th.astre;
  const ax = VUE_L * a.x - camX * 0.03;
  const ay = VUE_H * a.y - camY * 0.03;
  c.fillStyle = a.couleur;
  c.beginPath();
  c.arc(ax, ay, a.r, 0, Math.PI * 2);
  c.fill();
  if (a.lune) {
    c.fillStyle = th.ciel[0];
    c.beginPath();
    c.arc(ax + a.r * 0.45, ay - a.r * 0.2, a.r * 0.85, 0, Math.PI * 2);
    c.fill();
  }

  // Montagnes lointaines
  const nom = terrain.nomTheme;
  crete(c, th.loin, VUE_H * 0.56, 0.15, camX, camY, wx => -Math.abs(Math.sin(wx / 160)) * 70 - Math.sin(wx / 53 + 1) * 10, 6);
  if (nom === "hiver") {
    // Neige sur les sommets : une seconde crete plus claire, coupee plus haut
    c.save();
    c.beginPath();
    c.rect(0, 0, VUE_L, VUE_H * 0.56 - camY * 0.075 - 46);
    c.clip();
    crete(c, "#f4f8fb", VUE_H * 0.56, 0.15, camX, camY, wx => -Math.abs(Math.sin(wx / 160)) * 70 - Math.sin(wx / 53 + 1) * 10, 6);
    c.restore();
  } else if (nom === "volcan") {
    // Le volcan au loin et son panache
    const vx = VUE_L * 0.62 - camX * 0.15;
    const vy = VUE_H * 0.56 - camY * 0.075;
    c.fillStyle = "#3e2236";
    c.beginPath();
    c.moveTo(vx - 150, vy + 30);
    c.lineTo(vx - 26, vy - 120);
    c.lineTo(vx + 26, vy - 120);
    c.lineTo(vx + 150, vy + 30);
    c.fill();
    c.fillStyle = "#d4602a";
    c.fillRect(vx - 22, vy - 121, 44, 3);
    c.fillStyle = "rgba(70, 56, 64, 0.85)";
    [[0, -138, 16], [12, -158, 20], [32, -180, 24], [60, -198, 22]].forEach(([dx, dy, r]) => {
      c.beginPath();
      c.arc(vx + dx + Math.sin(etat.temps * 0.4 + dx) * 2, vy + dy, r, 0, Math.PI * 2);
      c.fill();
    });
  }

  // Nuages plats
  c.fillStyle = nom === "volcan" ? "rgba(60, 40, 52, 0.75)" : "rgba(255, 255, 255, 0.78)";
  nuages.forEach(n => {
    const y = n.y - camY * 0.08;
    c.beginPath();
    c.ellipse(n.x, y, n.l * 0.5, 7, 0, 0, Math.PI * 2);
    c.ellipse(n.x - n.l * 0.18, y - 6, n.l * 0.22, 8, 0, 0, Math.PI * 2);
    c.ellipse(n.x + n.l * 0.12, y - 8, n.l * 0.2, 9, 0, 0, Math.PI * 2);
    c.fill();
  });

  // Collines du milieu, avec leurs arbres en silhouette
  const base = VUE_H * 0.74;
  const fn = wx => -Math.sin(wx / 120) * 22 - Math.sin(wx / 47 + 2) * 8;
  crete(c, th.milieu, base, 0.4, camX, camY, fn, 5);
  c.fillStyle = th.milieu;
  const debut = Math.floor((camX * 0.4) / 46) * 46;
  for (let wx = debut; wx < camX * 0.4 + VUE_L + 46; wx += 46) {
    const graine = Math.sin(wx * 3.17) * 1000;
    if (graine - Math.floor(graine) < 0.45) {
      continue;
    }
    const sx = wx - camX * 0.4;
    const sy = base - camY * 0.2 + fn(wx);
    const h = 14 + (graine - Math.floor(graine)) * 12;
    c.beginPath();
    if (nom === "hiver" || nom === "volcan") {
      c.moveTo(sx - 6, sy + 2);
      c.lineTo(sx, sy - h);
      c.lineTo(sx + 6, sy + 2);
    } else {
      c.arc(sx, sy - h * 0.6, h * 0.45, 0, Math.PI * 2);
      c.rect(sx - 1, sy - h * 0.4, 2, h * 0.5);
    }
    c.fill();
  }
}

function dessinerEau(c, x0, x1, arriere) {
  const [surface, profond, reflet] = terrain.theme.eau;
  const t = etat.temps;
  const niveauEau = etat.eau;
  const vague = x => niveauEau + Math.sin(x / 26 + t * 1.6) * 2 + Math.sin(x / 11 - t * 2.3) * 0.8;
  if (arriere) {
    // Une vague de fond plus sombre, decalee, donne de la profondeur
    c.fillStyle = profond;
    c.beginPath();
    c.moveTo(x0, MONDE_H + 10);
    for (let x = x0; x <= x1; x += 4) {
      c.lineTo(x, niveauEau - 3 + Math.sin(x / 34 - t * 1.2) * 2.2);
    }
    c.lineTo(x1, MONDE_H + 10);
    c.closePath();
    c.fill();
    return;
  }
  const g = c.createLinearGradient(0, niveauEau, 0, MONDE_H);
  g.addColorStop(0, surface);
  g.addColorStop(1, profond);
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(x0, MONDE_H + 10);
  for (let x = x0; x <= x1; x += 3) {
    c.lineTo(x, vague(x));
  }
  c.lineTo(x1, MONDE_H + 10);
  c.closePath();
  c.fill();
  // L'ecume de la crete
  c.strokeStyle = reflet;
  c.lineWidth = 1.2;
  c.beginPath();
  for (let x = x0; x <= x1; x += 3) {
    if (x === x0) {
      c.moveTo(x, vague(x));
    } else {
      c.lineTo(x, vague(x));
    }
  }
  c.stroke();
  // Reflets qui glissent lentement
  c.fillStyle = reflet;
  c.globalAlpha = 0.45;
  for (let k = 0; k < 40; k++) {
    const largeur = 5 + (k * 7) % 11;
    const x = x0 + (((k * 131) % 997) / 997) * (x1 - x0) + Math.sin(t * 0.7 + k) * 6;
    const y = niveauEau + 6 + ((k * 37) % 5) * 5;
    if (y < MONDE_H) {
      c.fillRect(x, y, largeur, 1);
    }
  }
  c.globalAlpha = 1;
}

// ---------------------------------------------------------------------
// Dessin : armes et projectiles
// ---------------------------------------------------------------------

// Chaque arme se dessine autour de l'origine, pointe vers +x
function dessinerObjet(c, id, temps, info) {
  const i = info || {};
  c.lineJoin = "round";
  if (id === "gland" || id === "tengu" || id === "pepin") {
    const k = id === "pepin" ? 0.6 : 1;
    c.save();
    c.scale(k, k);
    c.fillStyle = id === "pepin" ? "#e8782a" : "#b07a40";
    c.beginPath();
    c.ellipse(1, 0, 4.2, 3.2, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "rgba(255,255,255,0.35)";
    c.beginPath();
    c.ellipse(2, -1.2, 1.6, 0.9, 0, 0, Math.PI * 2);
    c.fill();
    if (id !== "pepin") {
      c.fillStyle = "#5a3a1e";
      c.beginPath();
      c.ellipse(-2.4, 0, 2.2, 3.6, 0, 0, Math.PI * 2);
      c.fill();
      c.fillRect(-6, -0.6, 2.4, 1.2);
    }
    c.restore();
  } else if (id === "bouilloire") {
    // Le chagama de Bunbuku : fonte, couvercle, bec et anse
    c.fillStyle = "#3a3a42";
    c.beginPath();
    c.ellipse(0, 0.5, 5.5, 4.4, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#5c5c66";
    c.beginPath();
    c.ellipse(-1.2, -0.8, 2.6, 1.6, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#2a2a30";
    c.fillRect(-2.5, -4.6, 5, 1.6);
    c.fillRect(-0.8, -6, 1.6, 1.6);
    c.beginPath();
    c.moveTo(4.6, -0.6);
    c.lineTo(8, -3);
    c.lineTo(8, -1.6);
    c.lineTo(5, 1.4);
    c.fill();
    c.strokeStyle = "#8a7a5a";
    c.lineWidth = 0.9;
    c.beginPath();
    c.arc(0, -3, 4.5, Math.PI * 1.1, Math.PI * 1.9);
    c.stroke();
    if (i.minuterie !== undefined) {
      c.fillStyle = Math.floor(i.minuterie * 4) % 2 ? VERMILLON : "#f2c84a";
      c.beginPath();
      c.arc(0, -6.6, 1.2, 0, Math.PI * 2);
      c.fill();
    }
  } else if (id === "feuille") {
    c.fillStyle = "#8cc43f";
    c.beginPath();
    c.moveTo(-6, 0);
    c.bezierCurveTo(-3, -5, 4, -5, 7, 0);
    c.bezierCurveTo(4, 4, -3, 4, -6, 0);
    c.fill();
    c.strokeStyle = "#4a6a22";
    c.lineWidth = 0.8;
    c.beginPath();
    c.moveTo(-7, 0.4);
    c.lineTo(6, 0);
    c.moveTo(-1, 0);
    c.lineTo(1.5, -2.4);
    c.moveTo(2, 0);
    c.lineTo(4, 2.2);
    c.stroke();
  } else if (id === "kaki") {
    c.fillStyle = "#ec7a22";
    c.beginPath();
    c.ellipse(0, 0.6, 5, 4.4, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#f6a85a";
    c.beginPath();
    c.ellipse(-1.4, -0.4, 1.8, 1.2, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#4e7a2a";
    c.beginPath();
    c.moveTo(-3.4, -3);
    c.lineTo(0, -4.6);
    c.lineTo(3.4, -3);
    c.lineTo(0, -2.4);
    c.closePath();
    c.fill();
    c.fillRect(-0.5, -6, 1, 2);
  } else if (id === "mochi") {
    const ecrase = i.colle ? 0.7 : 1;
    c.fillStyle = "#f4efe4";
    c.beginPath();
    c.ellipse(0, (1 - ecrase) * 3, 5 / ecrase * 0.9, 4.4 * ecrase, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#e2a0b0";
    c.beginPath();
    c.ellipse(0, (1 - ecrase) * 3 + 1.4, 3.6 / ecrase * 0.9, 1.1 * ecrase, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#d8cfbe";
    c.beginPath();
    c.ellipse(1.6, (1 - ecrase) * 3 - 1.4, 1.4, 0.7, 0, 0, Math.PI * 2);
    c.fill();
  } else if (id === "transformation") {
    // La feuille sur le front, avec deux volutes de fumee
    c.fillStyle = "#e8e2d4";
    c.beginPath();
    c.arc(-3, 2, 3, 0, Math.PI * 2);
    c.arc(2, 2.6, 3.4, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#7fb23a";
    c.beginPath();
    c.moveTo(-2, 0);
    c.bezierCurveTo(-5, -6, 2, -9, 5, -6);
    c.bezierCurveTo(4, -2, 1, 0, -2, 0);
    c.fill();
  } else if (id === "eventail") {
    // L'eventail du tengu, en plumes
    c.fillStyle = "#3a2a1e";
    c.fillRect(-6, -0.8, 6, 1.6);
    c.fillStyle = VERMILLON;
    c.beginPath();
    c.moveTo(0, 0);
    c.arc(0, 0, 7, -0.9, 0.9);
    c.closePath();
    c.fill();
    c.strokeStyle = "#7a1e14";
    c.lineWidth = 0.6;
    [-0.5, 0, 0.5].forEach(a => {
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(Math.cos(a) * 7, Math.sin(a) * 7);
      c.stroke();
    });
  } else if (id === "tube") {
    // Le lance-gland : un troncon de bambou
    c.fillStyle = "#6e9a3a";
    c.fillRect(-4, -2.4, 15, 4.8);
    c.fillStyle = "#94bf56";
    c.fillRect(-4, -2.4, 15, 1.4);
    c.fillStyle = "#4a6a26";
    c.fillRect(2, -2.6, 1.2, 5.2);
    c.fillRect(9.6, -2.8, 1.6, 5.6);
  }
}

// Ce que le tanuki tient en visant
function dessinerArmeEnMain(c, t, def) {
  const a = t.angle * Math.PI / 180;
  c.save();
  c.translate(t.x + t.face * 2, t.y - 13);
  c.scale(t.face, 1);
  c.rotate(-a);
  if (def.id === "gland" || def.id === "kaki" || def.id === "mochi") {
    dessinerObjet(c, "tube", etat.temps);
    c.translate(12, 0);
    c.scale(0.7, 0.7);
    dessinerObjet(c, def.id, etat.temps);
  } else if (def.id === "tengu") {
    c.rotate(a);
    c.translate(4, -2);
    dessinerObjet(c, "eventail", etat.temps);
  } else if (def.id === "transformation") {
    c.rotate(a);
    c.translate(5, -4);
    c.scale(0.8, 0.8);
    dessinerObjet(c, "transformation", etat.temps);
  } else {
    c.translate(7, 0);
    c.rotate(def.id === "bouilloire" ? a : 0);
    c.scale(0.85, 0.85);
    dessinerObjet(c, def.id, etat.temps);
  }
  c.restore();
}

function dessinerProjectile(c, p) {
  c.save();
  c.translate(p.x, p.y);
  const id = p.def.id;
  if (id === "gland" || id === "tengu" || id === "pepin") {
    c.rotate(Math.atan2(p.vy, p.vx));
  } else if (id === "feuille" || id === "kaki") {
    c.rotate(p.rot);
  } else if (id === "bouilloire") {
    c.rotate(Math.sin(p.rot) * 0.5);
  }
  dessinerObjet(c, id, etat.temps, { minuterie: p.minuterie, colle: p.colle });
  c.restore();
  // Le compte a rebours des armes a retardement
  if ((p.def.rebond || p.colle) && p.minuterie > 0) {
    texte(c, String(Math.ceil(p.minuterie)), p.x, p.y - 12, 9, "#ffffff", "center");
  }
}

function dessinerTengu(c) {
  const tg = etat.tengu;
  const battement = Math.sin(etat.temps * 18);
  c.save();
  c.translate(tg.x, 28);
  c.scale(tg.face, 1);
  c.fillStyle = "#1c1a22";
  // Ailes
  c.beginPath();
  c.moveTo(-2, -2);
  c.lineTo(-14, -2 - battement * 9);
  c.lineTo(-6, 2);
  c.closePath();
  c.moveTo(2, -2);
  c.lineTo(-8, -1 - battement * 11);
  c.lineTo(4, 2);
  c.closePath();
  c.fill();
  c.beginPath();
  c.ellipse(0, 1, 8, 5, 0, 0, Math.PI * 2);
  c.fill();
  // Tete au masque rouge, long nez
  c.fillStyle = "#c83a26";
  c.beginPath();
  c.arc(8, -2, 4, 0, Math.PI * 2);
  c.fill();
  c.beginPath();
  c.moveTo(11, -2.5);
  c.lineTo(18, -1);
  c.lineTo(11, -0.5);
  c.fill();
  c.fillStyle = "#ffffff";
  c.fillRect(8.4, -4, 1.6, 1.2);
  c.restore();
}

function dessinerTombe(c, t) {
  // Un petit Jizo de pierre au bavoir rouge marque la ou le tanuki est tombe
  c.save();
  c.translate(t.x, t.y + 1);
  c.fillStyle = "rgba(0,0,0,0.25)";
  c.beginPath();
  c.ellipse(0, 0, 7, 1.6, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#8e8a84";
  c.beginPath();
  c.roundRect(-5, -12, 10, 12, [5, 5, 1, 1]);
  c.fill();
  c.beginPath();
  c.arc(0, -14, 4, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = VERMILLON;
  c.beginPath();
  c.moveTo(-4.4, -10);
  c.lineTo(4.4, -10);
  c.lineTo(0, -5);
  c.closePath();
  c.fill();
  c.strokeStyle = "#5a5650";
  c.lineWidth = 0.7;
  c.beginPath();
  c.moveTo(-1.6, -14.6);
  c.lineTo(-0.4, -14.6);
  c.moveTo(0.6, -14.6);
  c.lineTo(1.8, -14.6);
  c.stroke();
  c.restore();
}

function humeurDe(t) {
  if (t.aie > 0) {
    return "douleur";
  }
  if (etat.phase === "fin") {
    return etat.gagnant === t.equipe ? "content" : "inquiet";
  }
  for (const p of etat.projectiles) {
    if (p.equipe !== t.equipe && Math.hypot(p.x - t.x, p.y - t.y) < 90) {
      return "inquiet";
    }
  }
  if (t.pv <= 30) {
    return "inquiet";
  }
  if (t === etat.actif && etat.phase === "visee") {
    return etat.enCharge || etat.viseDoigt ? "colere" : "";
  }
  return "";
}

function dessinerUnTanuki(c, t) {
  const pose = !t.auSol ? (t.vy < 0 ? "saut" : "chute") : t.marcheRecente > 0 ? "course" : "repos";
  c.save();
  c.translate(t.x, t.y + 1);
  c.scale(TAILLE_TANUKI, TAILLE_TANUKI);
  dessinerTanuki(c, 0, 0, {
    pose, phase: t.pas * 0.45, temps: etat.temps + t.x * 0.01, gauche: t.face < 0,
    squash: 0, chapeau: false, bandeau: CLANS[t.equipe].couleur, humeur: humeurDe(t)
  });
  c.restore();
}

function dessinerEtiquette(c, t) {
  // Nom et barre de vie au-dessus de chaque tanuki
  const couleur = CLANS[t.equipe].couleur;
  const k = Math.sqrt(ui);
  const y = Math.round(t.y - 36 - (k - 1) * 6);
  texte(c, t.nom, t.x, y - 6 * k, 6.5 * k, couleur, "center");
  const l = Math.round(24 * k);
  c.fillStyle = ENCRE;
  c.fillRect(Math.round(t.x - l / 2) - 1, y - 1, l + 2, 5);
  c.fillStyle = "#3a3634";
  c.fillRect(Math.round(t.x - l / 2), y, l, 3);
  c.fillStyle = t.pv > t.pvMax * 0.3 ? couleur : "#ff8a5a";
  c.fillRect(Math.round(t.x - l / 2), y, Math.round(l * t.pv / t.pvMax), 3);
}

function texte(c, s, x, y, taille, couleur, alignement, poids) {
  c.font = (poids || 800) + " " + taille + "px 'Anybody', Impact, sans-serif";
  c.textAlign = alignement || "left";
  c.textBaseline = "middle";
  c.lineJoin = "round";
  c.lineWidth = Math.max(2, taille * 0.32);
  c.strokeStyle = ENCRE;
  c.strokeText(s, x, y);
  c.fillStyle = couleur;
  c.fillText(s, x, y);
}

// ---------------------------------------------------------------------
// Dessin : scene
// ---------------------------------------------------------------------

function dessiner() {
  if (etat === null || terrain === null) {
    return;
  }
  const c = contexte;
  c.setTransform(echelle, 0, 0, echelle, 0, 0);
  c.imageSmoothingEnabled = true;
  const d = effets.decalage();
  const cx = etat.camera.x - d.x;
  const cy = etat.camera.y - d.y;
  dessinerCiel(c, cx, cy);

  c.setTransform(echelle, 0, 0, echelle, -cx * echelle, -cy * echelle);
  const x0 = Math.floor(cx) - 4;
  const x1 = Math.ceil(cx + VUE_L) + 4;
  dessinerEau(c, x0, x1, true);
  c.imageSmoothingEnabled = false;
  c.drawImage(terrain.toile, 0, 0);
  c.imageSmoothingEnabled = true;
  c.drawImage(terrain.deco, 0, 0, MONDE_L, MONDE_H);

  // Tombes, puis tanuki vivants
  etat.tanuki.forEach(t => {
    if (!t.vivant && !t.noye) {
      dessinerTombe(c, t);
    }
  });
  const t = etat.actif;
  etat.tanuki.forEach(u => {
    if (u.vivant) {
      dessinerUnTanuki(c, u);
    }
  });

  // Le tanuki actif : son arme, sa visee
  if (t && t.vivant && (etat.phase === "visee" || etat.phase === "debut")) {
    const def = ARMES[etat.arme[t.equipe]];
    dessinerArmeEnMain(c, t, def);
    if (etat.phase === "visee") {
      dessinerVisee(c, t, def);
    }
  }
  etat.tanuki.forEach(u => {
    if (u.vivant) {
      dessinerEtiquette(c, u);
    }
  });
  if (t && t.vivant && (etat.phase === "visee" || etat.phase === "debut")) {
    // Le repere du tanuki dont c'est le tour
    const saut = Math.sin(etat.temps * 5) * 2;
    const my = t.y - 52 + saut;
    c.fillStyle = CLANS[t.equipe].couleur;
    c.strokeStyle = ENCRE;
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(t.x - 5, my);
    c.lineTo(t.x + 5, my);
    c.lineTo(t.x, my + 6);
    c.closePath();
    c.stroke();
    c.fill();
  }

  etat.projectiles.forEach(p => dessinerProjectile(c, p));
  if (etat.tengu) {
    dessinerTengu(c);
  }
  dessinerEau(c, x0, x1, false);
  dessinerParticules(c);
  effets.dessiner(c);

  // Interface a l'ecran
  c.setTransform(echelle, 0, 0, echelle, 0, 0);
  dessinerInterface(c);
}

function dessinerVisee(c, t, def) {
  const couleur = CLANS[t.equipe].couleur;
  if (def.cible) {
    // Une colonne et une marque au sol, la ou tombera la frappe
    const rx = t.x + t.face * (50 + etat.charge * 560);
    const sol = terrain.surface(Math.round(rx), 0);
    c.strokeStyle = def.id === "tengu" ? VERMILLON : PAPIER;
    c.lineWidth = 1.5;
    c.setLineDash([4, 4]);
    c.beginPath();
    c.moveTo(rx, etat.camera.y);
    c.lineTo(rx, sol - 6);
    c.stroke();
    c.setLineDash([]);
    c.lineWidth = 2.5;
    c.strokeStyle = ENCRE;
    c.beginPath();
    c.ellipse(rx, sol - 1, 11, 4, 0, 0, Math.PI * 2);
    c.stroke();
    c.lineWidth = 1.5;
    c.strokeStyle = def.id === "tengu" ? VERMILLON : PAPIER;
    c.stroke();
    return;
  }
  const a = t.angle * Math.PI / 180;
  const ox = t.x;
  const oy = t.y - 13;
  const ux = t.face * Math.cos(a);
  const uy = -Math.sin(a);
  // La fleche de visee : sa longueur dit la force, son trait l'angle
  const charge = etat.charge;
  const base = 20;
  const long = base + 70 * charge;
  c.lineCap = "round";
  c.strokeStyle = ENCRE;
  c.lineWidth = 6;
  c.beginPath();
  c.moveTo(ox + ux * base, oy + uy * base);
  c.lineTo(ox + ux * (base + 70), oy + uy * (base + 70));
  c.stroke();
  c.strokeStyle = "rgba(255,255,255,0.35)";
  c.lineWidth = 3.5;
  c.stroke();
  if (charge > 0) {
    c.strokeStyle = charge > 0.8 ? "#ff8a5a" : couleur;
    c.beginPath();
    c.moveTo(ox + ux * base, oy + uy * base);
    c.lineTo(ox + ux * long, oy + uy * long);
    c.stroke();
  }
  // Pointe
  const px = ox + ux * (base + 76);
  const py = oy + uy * (base + 76);
  c.save();
  c.translate(px, py);
  c.rotate(Math.atan2(uy, ux));
  c.fillStyle = "#ffffff";
  c.strokeStyle = ENCRE;
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(6, 0);
  c.lineTo(-3, -5);
  c.lineTo(-3, 5);
  c.closePath();
  c.stroke();
  c.fill();
  c.restore();
  c.lineCap = "butt";
  if (etat.enCharge || etat.viseDoigt) {
    texte(c, Math.round(charge * 100) + " %", px + ux * 10, py + uy * 10 - 8, 8, "#ffffff", "center");
    texte(c, Math.round(t.angle) + "°", ox - t.face * 16, oy - 14, 7, "#ffffff", "center");
  }
}

function panneau(c, x, y, l, h) {
  c.fillStyle = "rgba(14, 11, 10, 0.72)";
  c.beginPath();
  c.roundRect(x, y, l, h, 5);
  c.fill();
  c.strokeStyle = "rgba(255, 255, 255, 0.14)";
  c.lineWidth = 1;
  c.stroke();
}

function dessinerInterface(c) {
  // Sur petit ecran l'interface grossit pour rester lisible au doigt
  c.scale(ui, ui);
  // Vent : une fleche et des chevrons, dans le sens ou il souffle
  panneau(c, UL / 2 - 58, 6, 116, 26);
  texte(c, "VENT", UL / 2, 13, 7, "#d8d2c8", "center");
  const force = Math.round(Math.abs(etat.vent) * 5);
  const sens = Math.sign(etat.vent);
  for (let k = 0; k < 5; k++) {
    const actif = k < force;
    const x = UL / 2 + (sens >= 0 ? 6 + k * 9 : -6 - k * 9);
    c.fillStyle = actif ? "#a8daf0" : "rgba(255,255,255,0.12)";
    c.beginPath();
    const s = sens >= 0 ? 1 : -1;
    c.moveTo(x, 20);
    c.lineTo(x + s * 5, 24);
    c.lineTo(x, 28);
    c.lineTo(x + s * 2.5, 24);
    c.closePath();
    c.fill();
  }
  if (force === 0) {
    texte(c, "calme", UL / 2, 24, 7, "#a8daf0", "center", 600);
  }

  // La vie de chaque clan
  CLANS.forEach((clan, equipe) => {
    const liste = etat.tanuki.filter(t => t.equipe === equipe);
    const total = liste.reduce((s, t) => s + t.pv, 0);
    const l = Math.min(132, Math.floor((UL - 116 - 28) / 2));
    const x = equipe === 0 ? 8 : UL - 8 - l;
    panneau(c, x, 6, l, 26);
    texte(c, clan.court.toUpperCase() + (estIA(equipe) ? "  IA" : ""), x + (equipe === 0 ? 7 : l - 7), 13, 7.5, clan.couleur, equipe === 0 ? "left" : "right");
    // Un rond par tanuki, plein s'il est debout
    liste.forEach((t, i) => {
      const px = equipe === 0 ? x + l - 10 - i * 9 : x + 10 + i * 9;
      c.fillStyle = t.vivant ? clan.couleur : "rgba(255,255,255,0.18)";
      c.beginPath();
      c.arc(px, 13, 3, 0, Math.PI * 2);
      c.fill();
    });
    c.fillStyle = "#3a3634";
    c.fillRect(x + 7, 22, l - 14, 4);
    c.fillStyle = clan.couleur;
    const part = Math.round((l - 14) * total / Math.max(1, etat.pvMax[equipe]));
    c.fillRect(equipe === 0 ? x + 7 : x + l - 7 - part, 22, part, 4);
  });

  if (mode === "campagne" && etat.reglageIA) {
    texte(c, etat.reglageIA.nom.toUpperCase() + "   " + Math.round(scoreCourant()).toLocaleString("fr-BE") + " PTS", UL / 2, 42, 8, "#f2c84a", "center");
  }

  // Arme et temps, en bas
  if (etat.actif && etat.phase !== "fin") {
    const equipe = etat.actif.equipe;
    const arme = etat.arme[equipe];
    const reste = etat.munitions[equipe][arme];
    panneau(c, 6, UH - 30, 132, 24);
    c.save();
    c.translate(22, UH - 18);
    c.scale(1.5, 1.5);
    dessinerObjet(c, ARMES[arme].id === "gland" ? "gland" : ARMES[arme].id === "tengu" ? "eventail" : ARMES[arme].id, etat.temps);
    c.restore();
    texte(c, ARMES[arme].nom.toUpperCase(), 38, UH - 18, 9, "#ffffff", "left");
    if (reste !== Infinity) {
      texte(c, "x" + reste, 132, UH - 18, 8, "#d8d2c8", "right");
    }
    if (!etat.ia && etat.phase === "visee") {
      // Le temps restant, en cadran
      const cxT = UL - 24;
      const cyT = UH - 24;
      c.fillStyle = "rgba(14, 11, 10, 0.72)";
      c.beginPath();
      c.arc(cxT, cyT, 16, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = etat.tempsTour < 6 ? "#ff8a5a" : "#d8d2c8";
      c.lineWidth = 3;
      c.beginPath();
      c.arc(cxT, cyT, 12.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, etat.tempsTour) / DUREE_TOUR);
      c.stroke();
      texte(c, String(Math.ceil(etat.tempsTour)), cxT, cyT + 1, 10, etat.tempsTour < 6 ? "#ff8a5a" : "#ffffff", "center");
      // Le souffle de marche qu'il reste
      c.fillStyle = "#3a3634";
      c.fillRect(UL - 108, UH - 14, 60, 3);
      c.fillStyle = "#c8b89a";
      c.fillRect(UL - 108, UH - 14, Math.round(60 * Math.max(0, etat.marche) / ENDURANCE), 3);
      texte(c, "MARCHE", UL - 78, UH - 22, 6.5, "#d8d2c8", "center", 600);
    }
  }

  if (etat.banniere && etat.banniere.age >= 0) {
    const b = etat.banniere;
    const duree = b.carte ? 2.2 : 1.6;
    c.globalAlpha = Math.max(0, Math.min(1, b.age * 6, (duree - b.age) * 3));
    c.fillStyle = "rgba(14, 11, 10, 0.78)";
    c.fillRect(0, UH / 2 - 32, UL, 58);
    texte(c, b.texte.toUpperCase(), UL / 2, UH / 2 - 8, 30, b.couleur, "center");
    texte(c, b.sous.toUpperCase(), UL / 2, UH / 2 + 16, 9, "#e8e2d8", "center", 600);
    c.globalAlpha = 1;
  }

  if (etat.pause) {
    voile(c, "PAUSE", "P pour reprendre");
  } else if (etat.phase === "fin") {
    let titre = etat.gagnant === -1 ? "MATCH NUL" : CLANS[etat.gagnant].nom.toUpperCase() + " GAGNE";
    let sous = "N pour une revanche";
    if (mode === "campagne") {
      if (etat.gagnant === 0) {
        titre = etat.reglageIA.nom.toUpperCase() + " GAGNÉE";
        sous = "+" + (etat.gain || 0).toLocaleString("fr-BE") + " points, l'étape " + (campagne.etape + 1) + " arrive";
      } else {
        titre = "FIN DE CAMPAGNE";
        sous = (etat.scoreFinal || 0).toLocaleString("fr-BE") + " points, jusqu'à l'étape " + campagne.etape;
      }
    } else if (mode === "ia") {
      sous = (etat.scoreFinal || 0).toLocaleString("fr-BE") + " points";
    }
    voile(c, titre, sous);
  }
}

function voile(c, titre, sousTitre) {
  c.fillStyle = "rgba(14, 11, 10, 0.78)";
  c.fillRect(0, 0, UL, UH);
  texte(c, titre, UL / 2, UH / 2 - 10, 40, LIME, "center");
  texte(c, sousTitre, UL / 2, UH / 2 + 26, 11, "#e8e2d8", "center", 600);
}

const boucle = creerBoucle(function (delta) {
  maj(delta);
  dessiner();
}, { plafond: 0.04 });

// ---------------------------------------------------------------------
// Taille : la vue tient entre l'en-tete, les armes et la manette
// ---------------------------------------------------------------------

function ajuster() {
  const marge = window.innerWidth >= 1100 ? 500 : 0;
  const largeurDispo = Math.min(window.innerWidth * 0.96 - marge, 1100);
  let autour = 0;
  [".entete-gassen", ".gassen-reglages", ".gassen-armes"].forEach(sel => {
    const el = zone.querySelector(sel);
    if (el) {
      autour += el.getBoundingClientRect().height + 8;
    }
  });
  const manette = document.querySelector(".manette:not([hidden])");
  const hautManette = manette ? manette.getBoundingClientRect().height : 0;
  const hauteurDispo = Math.max(160, window.innerHeight - autour - hautManette - 48);
  const taille = Math.max(0.3, Math.min(largeurDispo / VUE_L, hauteurDispo / VUE_H));
  ui = Math.min(2, Math.max(1, 0.8 / taille));
  UL = VUE_L / ui;
  UH = VUE_H / ui;
  const l = Math.floor(VUE_L * taille);
  canvas.style.width = l + "px";
  canvas.style.height = Math.floor(VUE_H * taille) + "px";
  zone.style.setProperty("--largeur-gassen", Math.max(l, Math.min(window.innerWidth * 0.94, 360)) + "px");
  const nouvelle = Math.min(3, Math.max(1, taille * (window.devicePixelRatio || 1)));
  if (Math.abs(nouvelle - echelle) > 0.02 || canvas.width !== Math.round(VUE_L * nouvelle)) {
    echelle = nouvelle;
    canvas.width = Math.round(VUE_L * echelle);
    canvas.height = Math.round(VUE_H * echelle);
  }
}

window.addEventListener("resize", function () {
  if (!zone.hidden) {
    ajuster();
  }
});

// ---------------------------------------------------------------------
// En-tete, armes, reglages
// ---------------------------------------------------------------------

function majHud() {
  if (etat === null) {
    return;
  }
  zoneTour.textContent = String(etat.tour);
  const equipe = etat.actif ? etat.actif.equipe : 0;
  zoneArme.textContent = ARMES[etat.arme[equipe]].nom;
  zoneArmes.querySelectorAll("button").forEach((bouton, i) => {
    const reste = etat.munitions[equipe][i];
    bouton.classList.toggle("active", etat.arme[equipe] === i);
    bouton.disabled = reste <= 0 || etat.ia !== null || etat.phase === "fin";
    bouton.querySelector(".gassen-munitions").textContent = reste === Infinity ? "" : "x" + reste;
  });
}

function construireBoutonsArmes() {
  zoneArmes.innerHTML = "";
  ARMES.forEach((arme, i) => {
    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.className = "jeu-quitter gassen-arme";
    bouton.title = arme.nom + " (" + (i + 1) + ")";
    bouton.innerHTML = '<canvas class="gassen-icone" width="44" height="44" aria-hidden="true"></canvas><span class="gassen-nom">' + arme.nom + '</span><span class="gassen-munitions"></span>';
    const icone = bouton.querySelector("canvas").getContext("2d");
    icone.setTransform(2.6, 0, 0, 2.6, 22, 23);
    dessinerObjet(icone, arme.id === "tengu" ? "eventail" : arme.id, 0);
    bouton.addEventListener("click", () => choisirArme(i));
    zoneArmes.appendChild(bouton);
  });
}

function marquerReglages() {
  zoneModes.querySelectorAll("button").forEach(b => b.classList.toggle("active", b.dataset.mode === mode));
  zoneNiveaux.querySelectorAll("button").forEach(b => b.classList.toggle("active", b.dataset.niveau === niveau));
  zoneNiveaux.hidden = mode !== "ia";
}

function choisirArme(index) {
  if (etat === null || etat.ia || etat.phase === "fin" || etat.enCharge || etat.viseDoigt) {
    return;
  }
  const equipe = etat.actif ? etat.actif.equipe : 0;
  if (etat.munitions[equipe][index] <= 0) {
    return;
  }
  etat.arme[equipe] = index;
  jouer("clic");
  majHud();
}

function armeSuivante() {
  if (etat === null || !etat.actif) {
    return;
  }
  const equipe = etat.actif.equipe;
  let i = etat.arme[equipe];
  for (let k = 0; k < ARMES.length; k++) {
    i = (i + 1) % ARMES.length;
    if (etat.munitions[equipe][i] > 0) {
      choisirArme(i);
      return;
    }
  }
}

function majBoutonSon() {
  boutonSon.textContent = sonActif() ? "Son" : "Muet";
  boutonSon.setAttribute("aria-pressed", String(!sonActif()));
}

// ---------------------------------------------------------------------
// Demarrage et commandes
// ---------------------------------------------------------------------

function reglageDuMode() {
  if (mode === "campagne") {
    return etapeCampagne(campagne.etape);
  }
  const n = NIVEAUX[niveau];
  return {
    nom: n.nom, erreurPuissance: n.erreurPuissance, erreurAngle: n.erreurAngle,
    multiplicateur: n.multiplicateur, armesRares: niveau !== "facile",
    pvIA: PV_DEPART, nombreIA: 3
  };
}

// Une manche : nouvelle carte, nouveaux tanuki
function lancerManche() {
  effets.vider();
  particules = [];
  etat = nouvelEtat();
  etat.reglageIA = reglageDuMode();
  terrain = creerTerrain(MONDE_L, MONDE_H, mode === "campagne"
    ? { theme: etat.reglageIA.theme, forme: etat.reglageIA.forme }
    : {});
  etat.tanuki = placerTanuki(mode === "duel" ? null : etat.reglageIA);
  creerNuages();
  Object.keys(touches).forEach(k => { touches[k] = false; });
  etat.equipe = 0;
  etat.banniere = {
    carte: true, age: 0, couleur: "#f2c84a",
    texte: mode === "campagne" ? etat.reglageIA.nom : terrain.theme.nom,
    sous: mode === "campagne"
      ? terrain.theme.nom + ", " + NOMS_FORMES[terrain.forme].toLowerCase()
      : NOMS_FORMES[terrain.forme]
  };
  commencerTour();
  etat.minuteur = 2.4;
  majCamera(1);
  marquerReglages();
  majHud();
  majScoreCourant(ID, scoreCourant());
}

function demarrer() {
  campagne = { etape: 1, total: 0 };
  lancerManche();
  majBoutonSon();
  ajuster();
  requestAnimationFrame(ajuster);
  boucle.lancer();
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

function peutJouer() {
  return etat !== null && !etat.pause && etat.phase === "visee" && etat.ia === null && etat.actif && etat.actif.vivant;
}

function commencerCharge() {
  if (!peutJouer() || etat.enCharge || etat.viseDoigt) {
    return;
  }
  const equipe = etat.actif.equipe;
  if (etat.munitions[equipe][etat.arme[equipe]] <= 0) {
    return;
  }
  etat.enCharge = true;
  etat.charge = 0;
}

function lacherCharge() {
  if (!peutJouer() || !etat.enCharge) {
    return;
  }
  tirer(etat.actif, etat.arme[etat.actif.equipe], Math.max(0.08, etat.charge));
}

// Visee au doigt ou a la souris : on glisse depuis le tanuki vers la
// cible. La direction donne l'angle, la distance donne la force.
let pointeur = null;

function versLeMonde(evenement) {
  const r = canvas.getBoundingClientRect();
  return {
    x: (evenement.clientX - r.left) / r.width * VUE_L + etat.camera.x,
    y: (evenement.clientY - r.top) / r.height * VUE_H + etat.camera.y
  };
}

function viserVers(evenement) {
  const t = etat.actif;
  const p = versLeMonde(evenement);
  const def = ARMES[etat.arme[t.equipe]];
  const dx = p.x - t.x;
  if (Math.abs(dx) > 2) {
    t.face = dx >= 0 ? 1 : -1;
  }
  if (def.cible) {
    etat.charge = Math.max(0, Math.min(1, (Math.abs(dx) - 50) / 560));
    return;
  }
  const dy = (t.y - 13) - p.y;
  t.angle = Math.max(-80, Math.min(88, Math.atan2(dy, Math.abs(dx)) * 180 / Math.PI));
  etat.charge = Math.max(0, Math.min(1, (Math.hypot(dx, dy) - 16) / 150));
}

canvas.addEventListener("pointerdown", function (evenement) {
  if (!peutJouer() || etat.enCharge) {
    return;
  }
  const equipe = etat.actif.equipe;
  if (etat.munitions[equipe][etat.arme[equipe]] <= 0) {
    return;
  }
  evenement.preventDefault();
  pointeur = evenement.pointerId;
  try {
    canvas.setPointerCapture(evenement.pointerId);
  } catch (erreur) {
    // la capture n'est qu'un confort
  }
  etat.viseDoigt = true;
  viserVers(evenement);
});

canvas.addEventListener("pointermove", function (evenement) {
  if (pointeur !== evenement.pointerId || etat === null || !etat.viseDoigt) {
    return;
  }
  viserVers(evenement);
});

function finDuGeste(evenement, annule) {
  if (pointeur !== evenement.pointerId) {
    return;
  }
  pointeur = null;
  if (etat === null || !etat.viseDoigt) {
    return;
  }
  etat.viseDoigt = false;
  const def = ARMES[etat.arme[etat.actif.equipe]];
  // Un simple toucher ne tire pas : il faut avoir tire le trait
  if (!annule && peutJouer() && (def.cible || etat.charge > 0.06)) {
    tirer(etat.actif, etat.arme[etat.actif.equipe], Math.max(0.08, etat.charge));
  } else {
    etat.charge = 0;
  }
}

canvas.addEventListener("pointerup", evenement => finDuGeste(evenement, false));
canvas.addEventListener("pointercancel", evenement => finDuGeste(evenement, true));

const DIRECTIONS = {
  arrowleft: "gauche", q: "gauche", a: "gauche",
  arrowright: "droite", d: "droite",
  arrowup: "haut", z: "haut", w: "haut",
  arrowdown: "bas", s: "bas"
};

surTouche(ID, function (evenement) {
  const touche = evenement.key.toLowerCase();
  if (DIRECTIONS[touche]) {
    touches[DIRECTIONS[touche]] = true;
  } else if (touche === " " || touche === "enter") {
    if (!evenement.repeat) {
      commencerCharge();
    }
  } else if (touche === "e" || touche === "tab") {
    armeSuivante();
  } else if (/^[1-7]$/.test(touche)) {
    choisirArme(Number(touche) - 1);
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

surRelachement(function (evenement) {
  const touche = evenement.key.toLowerCase();
  if (DIRECTIONS[touche]) {
    touches[DIRECTIONS[touche]] = false;
  } else if ((touche === " " || touche === "enter") && jeuAuPremierPlan(ID)) {
    lacherCharge();
  }
});

zoneModes.addEventListener("click", function (evenement) {
  const bouton = evenement.target.closest("[data-mode]");
  if (bouton === null || bouton.dataset.mode === mode) {
    return;
  }
  mode = bouton.dataset.mode;
  garderReglages();
  demarrer();
});

zoneNiveaux.addEventListener("click", function (evenement) {
  const bouton = evenement.target.closest("[data-niveau]");
  if (bouton === null || bouton.dataset.niveau === niveau) {
    return;
  }
  niveau = bouton.dataset.niveau;
  garderReglages();
  demarrer();
});

canvas.addEventListener("contextmenu", evenement => evenement.preventDefault());

document.addEventListener("visibilitychange", function () {
  if (document.hidden && etat !== null && !etat.pause && etat.phase !== "fin" && !zone.hidden) {
    basculerPause();
  }
});

boutonSon.addEventListener("click", function () {
  basculerSon();
  majBoutonSon();
});
boutonRejouer.addEventListener("click", demarrer);
boutonQuitter.addEventListener("click", quitterJeu);

construireBoutonsArmes();
marquerReglages();

enregistrerJeu({
  id: ID,
  nom: "Tanuki Gassen",
  code: "1995",
  section: zone,
  demarrer,
  arreter: () => {
    boucle.arreter();
    pointeur = null;
    Object.keys(touches).forEach(k => { touches[k] = false; });
  },
  manette: { a: " ", b: "e", start: "p", libelles: { a: "Tirer", b: "Arme" } }
});
