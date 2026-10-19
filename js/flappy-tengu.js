// =====================================================================
//  FLAPPY TENGU - un battement d'ailes a la fois
//  Le karasu-tengu traverse une allee de torii. Une tape, un battement :
//  physique seche, elan fixe, comme le jeu d'origine.
//
//  La difficulte ne plafonne jamais :
//  - l'ecart entre les poutres se resserre jusqu'a 40 points ;
//  - puis la vitesse monte, de plus en plus doucement mais sans fin ;
//  - des 25 points, certains torii montent et descendent ;
//  - l'espacement varie, pour casser le rythme.
//  Le ciel passe du jour au crepuscule, a la nuit puis a l'aube au fil
//  des points : on voit ou l'on en est sans regarder le score.
// =====================================================================

import { enregistrerJeu, finDePartie, quitterJeu, majScoreCourant } from "./arcade.js";
import { creerBoucle } from "./noyau/boucle.js";
import { surTouche, jeuAuPremierPlan } from "./noyau/clavier.js";
import { creerStockage } from "./noyau/stockage.js";
import { jouer, basculerSon, sonActif } from "./noyau/son.js";

const ID = "flappy-tengu";

// ---------------------------------------------------------------------
// Reglages
// ---------------------------------------------------------------------

const W = 360;
const H = 640;
const SOL = 560;
const X_TENGU = 104;
const RAYON = 13;
const GRAVITE = 1600;
const ELAN = 465;
const CHUTE_MAX = 700;
const LARGEUR_PILIER = 62;

function vitesse(score) {
  // 140 px/s au depart, puis une montee logarithmique : jamais de plafond
  return 140 + 62 * Math.log2(1 + Math.max(0, score - 20) / 20);
}

function ecart(score) {
  return Math.max(124, 158 - score * 0.85);
}

function espacement(score, alea) {
  const base = 210;
  const variation = Math.min(46, Math.max(0, score - 12) * 1.2);
  return base + (alea - 0.5) * 2 * variation;
}

function mouvement(score, alea) {
  // Torii qui ondulent a partir de 25 points
  if (score < 25 || alea > Math.min(0.65, (score - 25) * 0.025 + 0.2)) {
    return null;
  }
  return { amplitude: Math.min(74, 22 + (score - 25) * 0.6), periode: 2.4 + alea * 1.2, phase: alea * 6.28 };
}

const MEDAILLES = [
  { nom: "Jade", seuil: 100, claire: "#b9f0c8", base: "#4fae74", sombre: "#22603a" },
  { nom: "Platine", seuil: 40, claire: "#ffffff", base: "#cfd8dc", sombre: "#7c8a90" },
  { nom: "Or", seuil: 30, claire: "#fff3a8", base: "#e8b923", sombre: "#8a6208" },
  { nom: "Argent", seuil: 20, claire: "#ffffff", base: "#b8bcc8", sombre: "#6a6e7a" },
  { nom: "Bronze", seuil: 10, claire: "#f2c08a", base: "#b9763a", sombre: "#6a3e16" }
];

// Le ciel au fil des points : jour, crepuscule, nuit, aube
const CIELS = [
  { haut: "#5fb4e8", bas: "#cdeefc", loin: "#8fb8d4", milieu: "#5c8a6e", soleil: "#fff6c8" },
  { haut: "#463a86", bas: "#f59a6a", loin: "#8a5a86", milieu: "#4a3058", soleil: "#ffd27a" },
  { haut: "#0e1236", bas: "#2c3470", loin: "#2a2f5c", milieu: "#181b3a", soleil: "#f1ead2" },
  { haut: "#6a7fc8", bas: "#ffc9b0", loin: "#9b8fb8", milieu: "#5a5a7e", soleil: "#ffe9b0" }
];

// ---------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------

const zone = document.createElement("section");
zone.className = "jeu jeu-flappy";
zone.id = "jeuFlappyTengu";
zone.hidden = true;
zone.innerHTML = `
  <div class="jeu-entete entete-flappy">
    <span class="jeu-score score-principal">Score <strong class="valeur-score" id="scoreFlappy">0</strong></span>
    <span class="jeu-score">Record <strong id="recordFlappy">0</strong></span>
    <span class="entete-boutons-flappy">
      <button class="jeu-quitter" id="sonFlappy" type="button" aria-pressed="false">Son</button>
      <button class="jeu-quitter" id="rejouerFlappy" type="button">Rejouer</button>
      <button class="jeu-quitter" id="quitterFlappy" type="button">Retour</button>
    </span>
  </div>
  <canvas id="canvasFlappy"></canvas>
  <p class="jeu-aide">Espace, fl&egrave;che haut ou une tape pour battre des ailes. Passe entre les poutres des torii. P pause, M son, N rejouer, &Eacute;chap quitter.</p>`;
document.body.appendChild(zone);

const canvas = zone.querySelector("#canvasFlappy");
const ctx = canvas.getContext("2d");
const zoneScore = zone.querySelector("#scoreFlappy");
const zoneRecord = zone.querySelector("#recordFlappy");
const boutonSon = zone.querySelector("#sonFlappy");
const boutonRejouer = zone.querySelector("#rejouerFlappy");
const boutonQuitter = zone.querySelector("#quitterFlappy");

const stockageRecord = creerStockage("tanuki-arcade-flappy-record");

// ---------------------------------------------------------------------
// Etat
// ---------------------------------------------------------------------

let echelle = 1;
let etat = null;
let temps = 0;

function nouvelEtat() {
  return {
    phase: "pret",              // pret | vol | chute | fin
    y: 300,
    vy: 0,
    angle: 0,
    aile: 0,                    // phase du battement
    battement: 0,               // temps depuis le dernier battement
    score: 0,
    record: Number(stockageRecord.lire()) || 0,
    nouveauRecord: false,
    torii: [],
    defil: 0,                   // distance parcourue, pour la parallaxe
    prochain: W + 80,
    particules: [],
    flash: 0,
    secousse: 0,
    finAge: 0,
    pause: false,
    pointFlash: 0
  };
}

// ---------------------------------------------------------------------
// Logique
// ---------------------------------------------------------------------

function ajouterTorii() {
  const s = etat.score + etat.torii.filter(t => !t.passe).length;
  const e = ecart(s);
  const mv = mouvement(s, Math.random());
  const marge = 70 + (mv ? mv.amplitude : 0);
  const centre = marge + e / 2 + Math.random() * (SOL - 2 * marge - e);
  etat.torii.push({ x: W + 40, centre, base: centre, ecart: e, mv, passe: false });
  etat.prochain = espacement(s, Math.random());
}

function battre() {
  if (etat === null || etat.pause) {
    return;
  }
  if (etat.phase === "pret") {
    etat.phase = "vol";
  }
  if (etat.phase === "fin") {
    if (etat.finAge > 0.6) {
      demarrer();
    }
    return;
  }
  if (etat.phase !== "vol") {
    return;
  }
  etat.vy = -ELAN;
  etat.battement = 0;
  // Petites plumes au battement : on sent la poussee
  for (let i = 0; i < 2; i++) {
    etat.particules.push({ x: X_TENGU - 10, y: etat.y + 6, vx: -60 - Math.random() * 40, vy: 40 + Math.random() * 60, vie: 0.5, rot: Math.random() * 6, vr: 4, couleur: "#2c2a3a", taille: 4 });
  }
  jouer("clic");
}

function heurter() {
  etat.phase = "chute";
  etat.vy = Math.min(etat.vy, -180);
  etat.flash = 1;
  etat.secousse = 0.35;
  for (let i = 0; i < 22; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = 80 + Math.random() * 200;
    etat.particules.push({ x: X_TENGU, y: etat.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, vie: 0.8 + Math.random() * 0.5, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 10, couleur: i % 4 === 0 ? "#d63a2a" : i % 2 ? "#22202e" : "#3e3b52", taille: 4 + Math.random() * 4 });
  }
  jouer("impact");
  setTimeout(() => jouer("mort"), 140);
}

function terminer() {
  etat.phase = "fin";
  etat.finAge = 0;
  if (etat.score > etat.record) {
    etat.record = etat.score;
    etat.nouveauRecord = true;
    stockageRecord.ecrire(etat.score);
    zoneRecord.textContent = String(etat.record);
  }
  setTimeout(() => {
    if (etat !== null && etat.phase === "fin" && !zone.hidden && etat.score > 0) {
      finDePartie(ID, etat.score);
    }
  }, 1800);
}

function maj(dt) {
  temps += dt;
  if (etat === null || etat.pause) {
    return;
  }
  etat.flash = Math.max(0, etat.flash - dt * 5);
  etat.secousse = Math.max(0, etat.secousse - dt);
  etat.pointFlash = Math.max(0, etat.pointFlash - dt * 3);
  etat.particules = etat.particules.filter(p => {
    p.vie -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 500 * dt;
    p.vx *= 0.98;
    p.rot += p.vr * dt;
    return p.vie > 0;
  });

  const v = vitesse(etat.score);
  if (etat.phase === "pret") {
    // Le tengu flotte en attendant la premiere tape
    etat.y = 300 + Math.sin(temps * 5) * 8;
    etat.aile += dt * 9;
    etat.defil += v * dt;
    etat.angle = 0;
    return;
  }
  if (etat.phase === "fin") {
    etat.finAge += dt;
    return;
  }

  // Le tengu
  etat.battement += dt;
  etat.vy = Math.min(CHUTE_MAX, etat.vy + GRAVITE * dt);
  etat.y += etat.vy * dt;
  // Il pique du nez comme l'oiseau d'origine : releve juste apres le
  // battement, puis il bascule quand il tombe vraiment
  const cible = etat.vy < 0 || etat.battement < 0.28 ? -0.42 : Math.min(1.5, (etat.vy - 120) / 380 * 1.5);
  etat.angle += (cible - etat.angle) * Math.min(1, dt * (cible > etat.angle ? 5 : 14));
  etat.aile += dt * (etat.phase === "vol" ? (etat.battement < 0.3 ? 26 : 10) : 0);

  if (etat.phase === "vol") {
    etat.defil += v * dt;
    etat.prochain -= v * dt;
    if (etat.prochain <= 0) {
      ajouterTorii();
    }
    etat.torii.forEach(t => {
      t.x -= v * dt;
      if (t.mv) {
        t.centre = t.base + Math.sin(temps * (Math.PI * 2 / t.mv.periode) + t.mv.phase) * t.mv.amplitude;
      }
      if (!t.passe && t.x + LARGEUR_PILIER / 2 < X_TENGU) {
        t.passe = true;
        etat.score++;
        etat.pointFlash = 1;
        zoneScore.textContent = String(etat.score);
        majScoreCourant(ID, etat.score);
        jouer("grain");
        if (MEDAILLES.some(m => m.seuil === etat.score)) {
          jouer("bonus");
        }
      }
    });
    etat.torii = etat.torii.filter(t => t.x > -100);

    // Collisions : poteaux et poutre (kasagi) plus large au bord de l'ouverture
    const r = RAYON - 2;
    for (const t of etat.torii) {
      const haut = t.centre - t.ecart / 2;
      const bas = t.centre + t.ecart / 2;
      const boites = [
        [t.x - LARGEUR_PILIER / 2 + 8, -200, LARGEUR_PILIER - 16, haut + 200],
        [t.x - LARGEUR_PILIER / 2 - 10, haut - 24, LARGEUR_PILIER + 20, 24],
        [t.x - LARGEUR_PILIER / 2 + 8, bas, LARGEUR_PILIER - 16, SOL - bas],
        [t.x - LARGEUR_PILIER / 2 - 10, bas, LARGEUR_PILIER + 20, 22]
      ];
      if (boites.some(([bx, by, bw, bh]) => {
        const px = Math.max(bx, Math.min(X_TENGU, bx + bw));
        const py = Math.max(by, Math.min(etat.y, by + bh));
        return Math.hypot(X_TENGU - px, etat.y - py) < r;
      })) {
        heurter();
        break;
      }
    }
    if (etat.y < -40) {
      etat.y = -40;
      etat.vy = 0;
    }
  }
  if (etat.y + RAYON >= SOL) {
    etat.y = SOL - RAYON;
    if (etat.phase === "vol") {
      heurter();
    }
    terminer();
  }
}

// ---------------------------------------------------------------------
// Couleurs
// ---------------------------------------------------------------------

function hex(c) {
  return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
}

function melange(a, b, t) {
  const x = hex(a);
  const y = hex(b);
  return "rgb(" + x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(",") + ")";
}

function cielActuel() {
  const s = etat ? etat.score : 0;
  const u = (s / 25) % CIELS.length;
  const i = Math.floor(u);
  const t = u - i;
  // On reste longtemps sur chaque ciel, la transition est courte
  const k = t < 0.7 ? 0 : (t - 0.7) / 0.3;
  const a = CIELS[i];
  const b = CIELS[(i + 1) % CIELS.length];
  const res = {};
  Object.keys(a).forEach(cle => {
    res[cle] = melange(a[cle], b[cle], k);
  });
  res.nuit = (i === 2 ? 1 - k : 0) + (i === 1 ? k : 0);
  return res;
}

// ---------------------------------------------------------------------
// Decor
// ---------------------------------------------------------------------

// Silhouettes pre-calculees, repetees en boucle
const MONTAGNES = [];
for (let x = 0; x <= 720; x += 24) {
  MONTAGNES.push([x, 380 - Math.abs(Math.sin(x * 0.0087)) * 120 - Math.sin(x * 0.03) * 10]);
}

const ARBRES = [];
for (let i = 0; i < 18; i++) {
  ARBRES.push({ x: i * 40 + ((i * 37) % 17), h: 34 + ((i * 53) % 30), r: 18 + ((i * 29) % 10) });
}

function couche(largeur, decalage, dessin) {
  const x0 = -((decalage % largeur) + largeur) % largeur;
  for (let x = x0; x < W; x += largeur) {
    ctx.save();
    ctx.translate(x, 0);
    dessin();
    ctx.restore();
  }
}

function dessinerDecor() {
  const c = cielActuel();
  const d = etat ? etat.defil : 0;
  const g = ctx.createLinearGradient(0, 0, 0, SOL);
  g.addColorStop(0, c.haut);
  g.addColorStop(1, c.bas);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, SOL);

  // Etoiles la nuit
  if (c.nuit > 0.05) {
    ctx.fillStyle = "rgba(255,255,240," + (c.nuit * 0.9) + ")";
    for (let i = 0; i < 40; i++) {
      const x = (i * 97 + 13) % W;
      const y = (i * 61 + 7) % 300;
      const t = 1 + ((i * 7) % 3 === 0 ? 1 : 0);
      ctx.fillRect(x, y, t, t);
    }
  }
  // Soleil ou lune, presque immobile
  ctx.fillStyle = c.soleil;
  ctx.beginPath();
  ctx.arc(268, 132, 34, 0, Math.PI * 2);
  ctx.fill();
  if (c.nuit > 0.5) {
    ctx.fillStyle = c.haut;
    ctx.beginPath();
    ctx.arc(254, 124, 30, 0, Math.PI * 2);
    ctx.fill();
  }

  // Nuages lents
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  couche(520, d * 0.08, () => {
    [[60, 90, 1], [250, 170, 0.8], [400, 70, 1.2]].forEach(([x, y, s]) => {
      ctx.beginPath();
      ctx.ellipse(x, y, 34 * s, 12 * s, 0, 0, Math.PI * 2);
      ctx.ellipse(x + 22 * s, y - 8 * s, 22 * s, 13 * s, 0, 0, Math.PI * 2);
      ctx.ellipse(x - 20 * s, y - 4 * s, 18 * s, 10 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  });

  // Montagnes lointaines et le Fuji
  couche(720, d * 0.15, () => {
    ctx.fillStyle = c.loin;
    ctx.beginPath();
    ctx.moveTo(0, SOL);
    MONTAGNES.forEach(([x, y]) => ctx.lineTo(x, y));
    ctx.lineTo(720, SOL);
    ctx.closePath();
    ctx.fill();
    // Neige sur les deux sommets
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    [180.5, 541.5].forEach(sx => {
      const sy = 380 - 120 - Math.sin(sx * 0.03) * 10;
      ctx.beginPath();
      ctx.moveTo(sx - 26, sy + 22);
      ctx.lineTo(sx, sy);
      ctx.lineTo(sx + 26, sy + 22);
      ctx.lineTo(sx + 14, sy + 18);
      ctx.lineTo(sx + 6, sy + 26);
      ctx.lineTo(sx - 4, sy + 18);
      ctx.lineTo(sx - 14, sy + 25);
      ctx.closePath();
      ctx.fill();
    });
  });

  // Foret et pagode au milieu
  couche(720, d * 0.35, () => {
    ctx.fillStyle = c.milieu;
    ctx.fillRect(0, 470, 720, SOL - 470);
    ARBRES.forEach(a => {
      ctx.beginPath();
      ctx.ellipse(a.x, 470 - a.h * 0.5, a.r, a.h * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    // Pagode a cinq toits
    const px = 420;
    for (let i = 0; i < 5; i++) {
      const y = 470 - i * 22;
      const l = 46 - i * 6;
      ctx.beginPath();
      ctx.moveTo(px - l, y - 6);
      ctx.quadraticCurveTo(px, y - 16, px + l, y - 6);
      ctx.lineTo(px + l - 6, y - 2);
      ctx.lineTo(px - l + 6, y - 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(px - l * 0.55, y - 2, l * 1.1, 14);
    }
    ctx.fillRect(px - 1.5, 470 - 5 * 22 - 22, 3, 24);
  });

  // Haie de bambous juste derriere le sol
  couche(240, d * 0.7, () => {
    for (let i = 0; i < 12; i++) {
      const x = i * 20 + (i % 3) * 3;
      const h = 40 + ((i * 17) % 22);
      ctx.fillStyle = i % 2 ? "#3f6e2a" : "#4f8434";
      ctx.fillRect(x, SOL - h, 7, h);
      ctx.fillStyle = "#2c5220";
      for (let y = SOL - h + 12; y < SOL; y += 14) {
        ctx.fillRect(x - 1, y, 9, 2);
      }
      ctx.fillStyle = "#6ea844";
      ctx.beginPath();
      ctx.ellipse(x + 10, SOL - h + 4, 9, 3, -0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function dessinerSol() {
  const d = etat ? etat.defil : 0;
  // Bordure d'herbe, puis dalles de pierre qui defilent a la vitesse du jeu
  ctx.fillStyle = "#5fa83a";
  ctx.fillRect(0, SOL, W, 10);
  ctx.fillStyle = "#4a8c2c";
  ctx.fillRect(0, SOL + 10, W, 3);
  ctx.fillStyle = "#d8c49a";
  ctx.fillRect(0, SOL + 13, W, H - SOL - 13);
  // Un chemin de grandes dalles posees en quinconce (pas de hachures)
  const hauteurSol = H - SOL - 13;
  const rangee = Math.max(18, hauteurSol / 2);
  couche(96, d, () => {
    [0, 1].forEach(i => {
      const y = SOL + 15 + i * rangee;
      const decal = i ? 48 : 0;
      [0, 96].forEach(x0 => {
        const x = x0 + decal - 96;
        ctx.fillStyle = i ? "#ccb68a" : "#d2bd92";
        ctx.beginPath();
        ctx.roundRect(x + 3, y, 90, rangee - 4, 5);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.22)";
        ctx.fillRect(x + 7, y + 2, 82, 2);
      });
    });
  });
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.fillRect(0, SOL + 13, W, 4);
}

// ---------------------------------------------------------------------
// Torii
// ---------------------------------------------------------------------

function pilier(x, y, h) {
  // Poteau cylindrique : sombre sur les bords, clair au centre
  const g = ctx.createLinearGradient(x, 0, x + LARGEUR_PILIER - 16, 0);
  g.addColorStop(0, "#7a1810");
  g.addColorStop(0.35, "#f0533c");
  g.addColorStop(0.55, "#e0402c");
  g.addColorStop(1, "#6a140c");
  ctx.fillStyle = g;
  ctx.fillRect(x, y, LARGEUR_PILIER - 16, h);
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.fillRect(x + 12, y, 3, h);
}

function dessinerTorii(t) {
  const x = t.x - LARGEUR_PILIER / 2;
  const haut = t.centre - t.ecart / 2;
  const bas = t.centre + t.ecart / 2;
  const px = x + 8;

  // Moitie du haut : le poteau descend du ciel, la poutre ferme l'ouverture
  pilier(px, -10, haut - 14);
  // Nuki, la traverse fine
  ctx.fillStyle = "#b52818";
  ctx.fillRect(x - 4, haut - 52, LARGEUR_PILIER + 8, 10);
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(x - 4, haut - 44, LARGEUR_PILIER + 8, 2);
  // Kasagi : la grande poutre noire aux bouts releves
  ctx.fillStyle = "#c8301e";
  ctx.fillRect(x - 6, haut - 24, LARGEUR_PILIER + 12, 12);
  ctx.fillStyle = "#1c1820";
  ctx.beginPath();
  ctx.moveTo(x - 14, haut - 16);
  ctx.quadraticCurveTo(x + LARGEUR_PILIER / 2, haut - 6, x + LARGEUR_PILIER + 14, haut - 16);
  ctx.lineTo(x + LARGEUR_PILIER + 12, haut);
  ctx.quadraticCurveTo(x + LARGEUR_PILIER / 2, haut + 6, x - 12, haut);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fillRect(x - 6, haut - 12, LARGEUR_PILIER + 12, 2);

  // Moitie du bas : le poteau monte du sol, avec sa base noire (nemaki)
  pilier(px, bas, SOL - bas);
  ctx.fillStyle = "#1c1820";
  ctx.beginPath();
  ctx.roundRect(x - 8, bas, LARGEUR_PILIER + 16, 16, 4);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.fillRect(x - 6, bas + 2, LARGEUR_PILIER + 12, 2);
  ctx.fillStyle = "#1c1820";
  ctx.fillRect(px - 4, SOL - 16, LARGEUR_PILIER - 8, 16);

  // Torii mobile : une plaque doree le signale
  if (t.mv) {
    ctx.fillStyle = "#e8b923";
    ctx.beginPath();
    ctx.roundRect(t.x - 9, haut - 46, 18, 14, 3);
    ctx.fill();
    ctx.fillStyle = "#6a3e08";
    ctx.beginPath();
    ctx.moveTo(t.x, haut - 44);
    ctx.lineTo(t.x + 4, haut - 39);
    ctx.lineTo(t.x - 4, haut - 39);
    ctx.closePath();
    ctx.moveTo(t.x, haut - 34);
    ctx.lineTo(t.x + 4, haut - 38);
    ctx.lineTo(t.x - 4, haut - 38);
    ctx.closePath();
    ctx.fill();
  }
}

// ---------------------------------------------------------------------
// Le karasu-tengu
// ---------------------------------------------------------------------

function dessinerTengu(x, y, angle, aile) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  // Aile arriere, plus sombre
  const battu = Math.sin(aile);
  ctx.fillStyle = "#16141e";
  ctx.save();
  ctx.translate(-4, -2);
  ctx.rotate(-0.3 - battu * 0.7);
  ctx.beginPath();
  ctx.ellipse(-6, -6, 7, 15, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Corps : boule de plumes noires bleutees
  const corps = ctx.createRadialGradient(-5, -6, 2, 0, 0, 18);
  corps.addColorStop(0, "#5a5878");
  corps.addColorStop(0.6, "#2a283a");
  corps.addColorStop(1, "#141220");
  ctx.fillStyle = corps;
  ctx.beginPath();
  ctx.ellipse(0, 0, 17, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#0a0910";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Queue en eventail
  ctx.fillStyle = "#1c1a28";
  ctx.beginPath();
  ctx.moveTo(-15, -2);
  ctx.lineTo(-26, -8);
  ctx.lineTo(-24, 0);
  ctx.lineTo(-27, 6);
  ctx.lineTo(-15, 4);
  ctx.closePath();
  ctx.fill();

  // Pompon blanc du yamabushi sur la poitrine
  ctx.fillStyle = "#f4eee2";
  ctx.beginPath();
  ctx.arc(3, 8, 3, 0, Math.PI * 2);
  ctx.arc(8, 7, 2.6, 0, Math.PI * 2);
  ctx.fill();

  // Visage rouge et long bec de corbeau
  ctx.fillStyle = "#d63a2a";
  ctx.beginPath();
  ctx.ellipse(8, -3, 8, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f2b31c";
  ctx.beginPath();
  ctx.moveTo(13, -4);
  ctx.lineTo(27, 0);
  ctx.lineTo(13, 3);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#8a5a06";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(14, 0);
  ctx.lineTo(25, 0);
  ctx.stroke();
  // Oeil
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.ellipse(9, -6, 3.6, 3.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#121018";
  ctx.beginPath();
  ctx.arc(10, -6, 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#121018";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(5, -10);
  ctx.lineTo(13, -8.5);
  ctx.stroke();

  // Tokin, le petit bonnet noir
  ctx.fillStyle = "#0e0c14";
  ctx.beginPath();
  ctx.moveTo(1, -12);
  ctx.lineTo(7, -20);
  ctx.lineTo(12, -11);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#d63a2a";
  ctx.fillRect(3, -13, 9, 2);

  // Aile avant, qui bat
  ctx.fillStyle = "#2e2c42";
  ctx.save();
  ctx.translate(-3, 1);
  ctx.rotate(0.2 - battu * 0.9);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-8, -18, -2, -22);
  ctx.quadraticCurveTo(6, -14, 6, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#0a0910";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.strokeStyle = "#4a4866";
  ctx.beginPath();
  ctx.moveTo(1, -3);
  ctx.lineTo(-3, -16);
  ctx.stroke();
  ctx.restore();

  ctx.restore();
}

// ---------------------------------------------------------------------
// Textes, medailles, ecrans
// ---------------------------------------------------------------------

function texte(t, x, y, taille, couleur, contour, alignement) {
  ctx.font = "800 " + taille + "px 'Anybody', sans-serif";
  ctx.textAlign = alignement || "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(4, taille * 0.2);
  ctx.strokeStyle = contour || "#1c1424";
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

function medaille(m, x, y, r) {
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.arc(x + 2, y + 3, r, 0, Math.PI * 2);
  ctx.fill();
  if (!m) {
    ctx.fillStyle = "#d9cdb2";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#b9a985";
    ctx.lineWidth = 2;
    ctx.stroke();
    return;
  }
  const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, 2, x, y, r * 1.1);
  g.addColorStop(0, m.claire);
  g.addColorStop(0.5, m.base);
  g.addColorStop(1, m.sombre);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = m.sombre;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.72, 0, Math.PI * 2);
  ctx.stroke();
  // Le tengu en embleme
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(r / 30, r / 30);
  ctx.globalAlpha = 0.55;
  dessinerTengu(-4, 2, 0, 1.2);
  ctx.globalAlpha = 1;
  ctx.restore();
  // Reflet en etoile qui scintille de temps en temps : la medaille brille
  const k = (temps * 0.7) % 1;
  if (k < 0.2) {
    const s = Math.sin((k / 0.2) * Math.PI) * 5;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    const sx = x - r * 0.4;
    const sy = y - r * 0.45;
    ctx.moveTo(sx, sy - s);
    ctx.lineTo(sx + s * 0.25, sy);
    ctx.lineTo(sx, sy + s);
    ctx.lineTo(sx - s * 0.25, sy);
    ctx.closePath();
    ctx.moveTo(sx - s, sy);
    ctx.lineTo(sx, sy + s * 0.25);
    ctx.lineTo(sx + s, sy);
    ctx.lineTo(sx, sy - s * 0.25);
    ctx.closePath();
    ctx.fill();
  }
}

function dessinerPret() {
  texte("Prêt ?", W / 2, 150, 46, "#ffd23a", "#3a1a0a");
  // Demo du geste : un doigt qui tape sous le tengu
  const tape = (temps * 1.4) % 1;
  const x = W / 2 + 40;
  const y = 330 + (tape < 0.2 ? 4 : 0);
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.beginPath();
  ctx.roundRect(x - 7, y - 6, 14, 30, 7);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(x - 12, y + 14, 26, 26, 9);
  ctx.fill();
  ctx.strokeStyle = "#3a2a1a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x - 7, y - 6, 14, 30, 7);
  ctx.stroke();
  if (tape < 0.3) {
    ctx.strokeStyle = "rgba(255,255,255," + (1 - tape / 0.3) + ")";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y - 8, 8 + tape * 40, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  }
  // Fleches de montee
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  [0, 1].forEach(i => {
    const fy = 268 - i * 14 - ((temps * 30) % 14);
    ctx.beginPath();
    ctx.moveTo(X_TENGU - 6, fy);
    ctx.lineTo(X_TENGU, fy - 7);
    ctx.lineTo(X_TENGU + 6, fy);
    ctx.closePath();
    ctx.fill();
  });
  mono("TAPE POUR BATTRE DES AILES", W / 2, 420, 11, "#ffffff");
  if (etat.record > 0) {
    mono("RECORD " + etat.record, W / 2, 444, 10, "#ffe9b0");
  }
}

function dessinerFin() {
  const k = Math.min(1, etat.finAge / 0.35);
  const sortie = 1 - Math.pow(1 - k, 3);
  texte("Perdu !", W / 2, 120 - (1 - sortie) * 40, 46, "#ffd23a", "#3a1a0a");
  // Panneau en bois clair
  const py = 190 + (1 - sortie) * 300;
  const px = 34;
  const pw = W - 68;
  const ph = 170;
  ctx.fillStyle = "#6a4a2a";
  ctx.beginPath();
  ctx.roundRect(px, py, pw, ph, 14);
  ctx.fill();
  ctx.fillStyle = "#f4e6c4";
  ctx.beginPath();
  ctx.roundRect(px + 5, py + 5, pw - 10, ph - 10, 10);
  ctx.fill();
  mono("MÉDAILLE", px + 66, py + 26, 10, "#c0703a");
  const m = MEDAILLES.find(md => etat.score >= md.seuil) || null;
  medaille(m, px + 66, py + 90, 34);
  if (m) {
    mono(m.nom.toUpperCase(), px + 66, py + 144, 9, "#8a5a2a");
  }
  mono("SCORE", px + pw - 26, py + 26, 10, "#c0703a", "right");
  // Le score defile jusqu'a sa valeur, comme sur les vraies fins de partie
  const affiche = Math.min(etat.score, Math.floor(Math.max(0, etat.finAge - 0.35) * 40));
  texte(String(affiche), px + pw - 26, py + 60, 32, "#ffffff", "#3a1a0a", "right");
  mono("MEILLEUR", px + pw - 26, py + 100, 10, "#c0703a", "right");
  texte(String(etat.record), px + pw - 26, py + 132, 30, "#ffffff", "#3a1a0a", "right");
  if (etat.nouveauRecord && affiche >= etat.score) {
    ctx.fillStyle = "#e0402c";
    ctx.beginPath();
    ctx.roundRect(px + pw - 128, py + 118, 46, 18, 4);
    ctx.fill();
    mono("NOUVEAU", px + pw - 105, py + 127, 8, "#ffffff");
  }
  // Prochaine medaille
  const suivante = [...MEDAILLES].reverse().find(md => md.seuil > etat.score);
  if (suivante && etat.finAge > 0.6) {
    mono("Prochaine médaille : " + suivante.nom + " à " + suivante.seuil, W / 2, py + ph + 24, 10, "#ffffff");
  }
  if (etat.finAge > 0.6) {
    const a = 0.5 + Math.sin(temps * 5) * 0.5;
    mono("TAPE POUR REJOUER", W / 2, py + ph + 50, 11, "rgba(255,255,255," + (0.4 + a * 0.6) + ")");
  }
}

function dessiner() {
  if (etat === null) {
    return;
  }
  ctx.setTransform(echelle, 0, 0, echelle, 0, 0);
  ctx.save();
  if (etat.secousse > 0) {
    const f = etat.secousse * 18;
    ctx.translate((Math.random() - 0.5) * f, (Math.random() - 0.5) * f);
  }
  dessinerDecor();
  etat.torii.forEach(dessinerTorii);
  dessinerSol();

  // Ombre du tengu sur le sol, plus petite quand il vole haut
  const hauteur = Math.max(0, SOL - etat.y);
  const s = Math.max(0.3, 1 - hauteur / 500);
  ctx.fillStyle = "rgba(0,0,0," + (0.25 * s) + ")";
  ctx.beginPath();
  ctx.ellipse(X_TENGU, SOL + 6, 16 * s, 4 * s, 0, 0, Math.PI * 2);
  ctx.fill();

  dessinerTengu(X_TENGU, etat.y, etat.angle, etat.aile);

  etat.particules.forEach(p => {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.globalAlpha = Math.min(1, p.vie * 2.5);
    ctx.fillStyle = p.couleur;
    ctx.beginPath();
    ctx.ellipse(0, 0, p.taille, p.taille * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
  ctx.globalAlpha = 1;
  ctx.restore();

  if (etat.phase === "vol" || etat.phase === "chute") {
    const gonfle = 1 + etat.pointFlash * 0.18;
    ctx.save();
    ctx.translate(W / 2, 70);
    ctx.scale(gonfle, gonfle);
    texte(String(etat.score), 0, 0, 56, "#ffffff", "#1c1424");
    ctx.restore();
  }
  if (etat.phase === "pret") {
    dessinerPret();
  }
  if (etat.phase === "fin") {
    dessinerFin();
  }
  if (etat.flash > 0) {
    ctx.fillStyle = "rgba(255,255,255," + (etat.flash * 0.8) + ")";
    ctx.fillRect(0, 0, W, H);
  }
  if (etat.pause) {
    ctx.fillStyle = "rgba(10,8,20,0.55)";
    ctx.fillRect(0, 0, W, H);
    texte("Pause", W / 2, H / 2 - 20, 44, "#ffffff");
    mono("P POUR REPRENDRE", W / 2, H / 2 + 24, 11, "#ffffff");
  }
}

// ---------------------------------------------------------------------
// Taille et boucle
// ---------------------------------------------------------------------

function ajuster() {
  const marge = window.innerWidth >= 1100 ? 500 : 0;
  const largeur = Math.min(window.innerWidth * 0.96 - marge, 560);
  const entete = zone.querySelector(".entete-flappy").getBoundingClientRect().height || 40;
  // La variable CSS de la manette est un calc() : on mesure la manette elle-meme
  const pad = document.querySelector(".manette");
  const manette = pad && !pad.hidden ? pad.getBoundingClientRect().height : 0;
  const aide = window.matchMedia("(pointer: coarse)").matches ? 0 : 50;
  const hauteur = Math.max(300, window.innerHeight - entete - manette - 34 - aide);
  const taille = Math.min(largeur / W, hauteur / H);
  canvas.style.width = Math.floor(W * taille) + "px";
  canvas.style.height = Math.floor(H * taille) + "px";
  zone.querySelector(".entete-flappy").style.width = Math.max(Math.floor(W * taille), Math.min(window.innerWidth * 0.94, 340)) + "px";
  echelle = Math.min(3, Math.max(1, taille * (window.devicePixelRatio || 1)));
  canvas.width = Math.round(W * echelle);
  canvas.height = Math.round(H * echelle);
}

window.addEventListener("resize", function () {
  if (!zone.hidden) {
    ajuster();
  }
});

const boucle = creerBoucle(function (dt) {
  maj(dt);
  dessiner();
}, { plafond: 1 / 30 });

function majBoutonSon() {
  boutonSon.textContent = sonActif() ? "Son" : "Muet";
  boutonSon.setAttribute("aria-pressed", String(!sonActif()));
}

function demarrer() {
  etat = nouvelEtat();
  zoneScore.textContent = "0";
  zoneRecord.textContent = String(etat.record);
  majScoreCourant(ID, 0);
  majBoutonSon();
  ajuster();
  requestAnimationFrame(ajuster);
  boucle.lancer();
}

function basculerPause() {
  if (etat === null || etat.phase !== "vol") {
    return;
  }
  etat.pause = !etat.pause;
  if (!etat.pause) {
    boucle.remettreALHeure();
  }
}

surTouche(ID, function (evenement) {
  const touche = evenement.key.toLowerCase();
  if (touche === " " || touche === "arrowup" || touche === "z" || touche === "w" || touche === "b" || touche === "enter") {
    if (!evenement.repeat) {
      battre();
    }
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

// Une tape n'importe ou dans la zone de jeu, sauf sur les boutons
zone.addEventListener("pointerdown", function (evenement) {
  if (!jeuAuPremierPlan(ID) || evenement.target.closest("button")) {
    return;
  }
  evenement.preventDefault();
  battre();
});
zone.addEventListener("contextmenu", evenement => evenement.preventDefault());

document.addEventListener("visibilitychange", function () {
  if (document.hidden && etat !== null && !etat.pause && etat.phase === "vol" && !zone.hidden) {
    basculerPause();
  }
});

boutonSon.addEventListener("click", function () {
  basculerSon();
  majBoutonSon();
});
boutonRejouer.addEventListener("click", demarrer);
boutonQuitter.addEventListener("click", quitterJeu);

// Pour les tests automatiques
export const _test = { get etat() { return etat; }, battre, vitesse, ecart };

enregistrerJeu({
  id: ID,
  nom: "Flappy Tengu",
  code: "2013",
  section: zone,
  demarrer,
  arreter: () => boucle.arreter(),
  manette: { a: " ", b: "b", start: "p", libelles: { a: "Battre", b: "Battre" } }
});
