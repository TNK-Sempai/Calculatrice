// =====================================================================
//  TANUKI RUN - la course sans fin dans la foret de bambous
//  Le jeu hors ligne de Chrome, revu par le folklore et peint comme un
//  runner mobile : cinq plans de decor qui defilent a des vitesses
//  differentes, le jour qui tourne au crepuscule puis a la nuit au fil
//  des metres, un tanuki qui court, saute, se baisse.
//
//  Le joueur ne fait que sauter (maintenu, le saut monte plus haut) et
//  se baisser (en l'air, il retombe plus vite). La vitesse ne plafonne
//  jamais : elle suit la racine de la distance, donc elle monte de plus
//  en plus doucement. L'ecart entre deux obstacles est toujours calcule
//  depuis la vitesse et la duree d'un saut : aucun piege impossible.
// =====================================================================

import { enregistrerJeu, finDePartie, quitterJeu, majScoreCourant } from "./arcade.js";
import { creerBoucle } from "./noyau/boucle.js";
import { surTouche, surRelachement, jeuAuPremierPlan } from "./noyau/clavier.js";
import { creerStockage } from "./noyau/stockage.js";
import { jouer, basculerSon, sonActif } from "./noyau/son.js";

const ID = "tanuki-run";

// ---------------------------------------------------------------------
// Reglages
// ---------------------------------------------------------------------

const PX_PAR_METRE = 40;
const GRAVITE = 2600;
const IMPULSION = 880;           // vitesse verticale au decollage
const MAINTIEN_MAX = 0.24;       // secondes pendant lesquelles tenir allege la gravite
const ALLEGEMENT = 0.45;
const CHUTE_RAPIDE = 2.4;        // multiplicateur de gravite quand on se baisse en l'air
const DUREE_SAUT = 2 * IMPULSION / GRAVITE;
const POINTS_ONIGIRI = 25;

function vitessePour(metres) {
  return 340 + 15 * Math.sqrt(metres);
}

// Les paliers ajoutent un nouveau motif, la vitesse elle continue seule
const PALIERS = [
  { m: 0, nom: "La foret de bambous" },
  { m: 150, nom: "Les lanternes de pierre" },
  { m: 300, nom: "Les corbeaux tengu" },
  { m: 500, nom: "Les trous du sentier" },
  { m: 800, nom: "Les kasa-obake" },
  { m: 1200, nom: "Les enchainements" },
  { m: 2000, nom: "Le vent se leve" }
];

// ---------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------

const zone = document.createElement("section");
zone.className = "jeu jeu-tanuki-run";
zone.id = "jeuTanukiRun";
zone.hidden = true;
zone.innerHTML = `
  <div class="jeu-entete entete-run">
    <span class="entete-boutons-run">
      <button class="jeu-quitter" id="sonRun" type="button" aria-pressed="false">Son</button>
      <button class="jeu-quitter" id="rejouerRun" type="button">Rejouer</button>
      <button class="jeu-quitter" id="quitterRun" type="button">Retour</button>
    </span>
  </div>
  <canvas id="canvasRun"></canvas>
  <p class="jeu-aide">Espace ou fl&egrave;che haut pour sauter (maintenu, le saut monte plus haut), fl&egrave;che bas pour te baisser (en l'air, tu retombes plus vite). Au doigt : touche l'&eacute;cran pour sauter, glisse vers le bas pour te baisser. Ramasse les onigiri. P pause, M son, N rejouer, &Eacute;chap quitter.</p>`;
document.body.appendChild(zone);

const canvas = zone.querySelector("#canvasRun");
const ctx = canvas.getContext("2d");
const boutonSon = zone.querySelector("#sonRun");
const boutonRejouer = zone.querySelector("#rejouerRun");
const boutonQuitter = zone.querySelector("#quitterRun");

const stockageRecord = creerStockage("tanuki-arcade-run-record");

// Vue logique : paysage 720 x 300, portrait 400 x 400
let LV = 720;
let HV = 300;
let SOL = 248;
let XT = 120;
let echelle = 1;

// ---------------------------------------------------------------------
// Palettes du cycle jour, crepuscule, nuit, aube
// ---------------------------------------------------------------------

const PALETTES = {
  jour: {
    cielHaut: "#7fc4e8", cielBas: "#e4f3e9", astre: "#fff4c8",
    mont: "#9cbfd0", mont2: "#7aa4b4", village: "#5f8a86", bambouFond: "#4f8a5c",
    bambou: "#3f7a3e", bambouClair: "#7fb35a", feuille: "#5f9a3e",
    sol: "#8a6a44", solHaut: "#6f9a3a", solSombre: "#5e472c", herbe: "#4f7f2a", nuit: 0
  },
  crepuscule: {
    cielHaut: "#4a3a7a", cielBas: "#f2a35e", astre: "#ffd37a",
    mont: "#8a5a7e", mont2: "#6a4568", village: "#4a3352", bambouFond: "#3f4a3e",
    bambou: "#2f3e2a", bambouClair: "#6a7a3a", feuille: "#4a5a2e",
    sol: "#6e4a34", solHaut: "#5a6a2a", solSombre: "#45301f", herbe: "#3e5222", nuit: 0.3
  },
  nuit: {
    cielHaut: "#0d1030", cielBas: "#2a2a5a", astre: "#f2ecd6",
    mont: "#2a2c52", mont2: "#1f2144", village: "#181a36", bambouFond: "#182a2a",
    bambou: "#14241e", bambouClair: "#2f4a3a", feuille: "#1f3a2a",
    sol: "#3a2e2a", solHaut: "#24382a", solSombre: "#241c1a", herbe: "#1c2e1e", nuit: 1
  },
  aube: {
    cielHaut: "#5a7ab0", cielBas: "#f6c6a8", astre: "#fff0d0",
    mont: "#a08aa8", mont2: "#7f6e90", village: "#5c5070", bambouFond: "#456a50",
    bambou: "#365a38", bambouClair: "#7a9a5a", feuille: "#4f7a3e",
    sol: "#7a5a40", solHaut: "#5e8434", solSombre: "#4f3a26", herbe: "#466e28", nuit: 0.2
  }
};
const CYCLE = [[0, "jour"], [0.3, "jour"], [0.42, "crepuscule"], [0.55, "nuit"], [0.84, "nuit"], [0.94, "aube"], [1, "jour"]];
const METRES_PAR_JOUR = 1800;

function hex(c) {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function melange(a, b, t) {
  const x = hex(a);
  const y = hex(b);
  return "rgb(" + x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(",") + ")";
}

function paletteA(metres) {
  const u = (metres % METRES_PAR_JOUR) / METRES_PAR_JOUR;
  for (let i = 0; i < CYCLE.length - 1; i++) {
    const [u0, n0] = CYCLE[i];
    const [u1, n1] = CYCLE[i + 1];
    if (u >= u0 && u <= u1) {
      const t = u1 === u0 ? 0 : (u - u0) / (u1 - u0);
      const lisse = t * t * (3 - 2 * t);
      const a = PALETTES[n0];
      const b = PALETTES[n1];
      const p = {};
      Object.keys(a).forEach(k => {
        p[k] = k === "nuit" ? a[k] + (b[k] - a[k]) * lisse : melange(a[k], b[k], lisse);
      });
      p.u = u;
      return p;
    }
  }
  return Object.assign({ u }, PALETTES.jour);
}

// Hasard deterministe pour le decor : une tuile donnee est toujours la meme
function bruit(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// ---------------------------------------------------------------------
// Etat
// ---------------------------------------------------------------------

let etat = null;
const commandes = { saut: false, bas: false };

function nouvelEtat() {
  return {
    phase: "attente",
    dist: 0,
    vitesse: vitessePour(0),
    temps: 0,
    t: { y: 0, vy: 0, auSol: true, maintien: 0, sx: 1, sy: 1, cycle: 0, chute: false, etourdi: 0 },
    obstacles: [],
    trous: [],
    onigiris: [],
    particules: [],
    textes: [],
    prochain: 640,
    onigiri: 0,
    score: 0,
    record: Number(stockageRecord.lireTexte()) || 0,
    palier: 0,
    banniere: null,
    pause: false,
    finAge: 0,
    secousse: 0
  };
}

function metres() {
  return etat.dist / PX_PAR_METRE;
}

// ---------------------------------------------------------------------
// Generation des obstacles
// ---------------------------------------------------------------------

function palierCourant() {
  let p = 0;
  PALIERS.forEach((pal, i) => {
    if (metres() >= pal.m) {
      p = i;
    }
  });
  return p;
}

// Distance au sol couverte pendant un saut complet, a la vitesse actuelle
function porteeSaut() {
  return etat.vitesse * DUREE_SAUT;
}

function ajouterObstacle(type, x, extra) {
  const defs = {
    pierre: { l: 34, h: 28 },
    souche: { l: 40, h: 40 },
    lanterne: { l: 30, h: 66 },
    corbeauBas: { l: 44, h: 22, vol: 36 },
    corbeauHaut: { l: 44, h: 22, vol: 96 },
    kasa: { l: 32, h: 46 }
  };
  const d = defs[type];
  etat.obstacles.push(Object.assign({ type, x, l: d.l, h: d.h, vol: d.vol || 0, phase: Math.random() * 6, passe: false }, extra || {}));
}

function arcOnigiri(x0, longueur, hauteur) {
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    etat.onigiris.push({ x: x0 + longueur * t, y: SOL - 40 - Math.sin(t * Math.PI) * hauteur, pris: false });
  }
}

function ligneOnigiri(x0, n, y) {
  for (let i = 0; i < n; i++) {
    etat.onigiris.push({ x: x0 + i * 34, y, pris: false });
  }
}

function genererMotif(x) {
  const p = palierCourant();
  const portee = porteeSaut();
  const choix = [["pierre", 3], ["souche", 2]];
  if (p >= 1) {
    choix.push(["lanterne", 2], ["double", 2]);
  }
  if (p >= 2) {
    choix.push(["corbeauBas", 2], ["corbeauHaut", 1]);
  }
  if (p >= 3) {
    choix.push(["trou", 2]);
  }
  if (p >= 4) {
    choix.push(["kasa", 2]);
  }
  if (p >= 5) {
    choix.push(["enchaine", 2], ["trouPierre", 1]);
  }
  if (p >= 6) {
    choix.push(["triple", 1]);
  }
  const total = choix.reduce((s, c) => s + c[1], 0);
  let r = Math.random() * total;
  let motif = choix[0][0];
  for (const [nom, poids] of choix) {
    r -= poids;
    if (r <= 0) {
      motif = nom;
      break;
    }
  }
  let largeur = 40;
  if (motif === "pierre" || motif === "souche" || motif === "lanterne" || motif === "kasa") {
    ajouterObstacle(motif, x);
    if (Math.random() < 0.5) {
      arcOnigiri(x - portee * 0.32, portee * 0.64 + 30, motif === "lanterne" ? 90 : 70);
    }
    largeur = 40;
  } else if (motif === "double") {
    ajouterObstacle("pierre", x);
    ajouterObstacle("souche", x + 38);
    largeur = 80;
  } else if (motif === "triple") {
    ajouterObstacle("pierre", x);
    ajouterObstacle("pierre", x + 32);
    ajouterObstacle("pierre", x + 64);
    largeur = 100;
  } else if (motif === "corbeauBas" || motif === "corbeauHaut") {
    ajouterObstacle(motif, x);
    if (motif === "corbeauHaut") {
      ligneOnigiri(x - 20, 3, SOL - 26);
    }
  } else if (motif === "trou") {
    const l = Math.max(56, Math.min(portee * 0.55, 60 + metres() * 0.03));
    etat.trous.push({ x0: x, x1: x + l });
    arcOnigiri(x - 20, l + 40, 60);
    largeur = l;
  } else if (motif === "enchaine") {
    // Une pierre, puis un corbeau bas juste apres l'atterrissage
    ajouterObstacle("pierre", x);
    ajouterObstacle("corbeauBas", x + portee * 0.9 + 60);
    largeur = portee * 0.9 + 100;
  } else if (motif === "trouPierre") {
    const l = Math.max(56, portee * 0.4);
    etat.trous.push({ x0: x, x1: x + l });
    ajouterObstacle("pierre", x + l + portee * 0.85 + 40);
    largeur = l + portee * 0.85 + 80;
  }
  // Onigiri en ligne au sol entre deux obstacles, de temps en temps
  if (Math.random() < 0.25 && motif !== "trou") {
    ligneOnigiri(x + largeur + portee * 0.5, 3, SOL - 22);
  }
  // L'ecart suivant : jamais moins qu'un saut et un temps de reaction
  const reaction = 0.32 * etat.vitesse;
  const ecart = portee + reaction + 40 + Math.random() * (portee * 0.9 + 120) * Math.max(0.45, 1 - metres() / 6000);
  return x + largeur + ecart;
}

// ---------------------------------------------------------------------
// Mouvement
// ---------------------------------------------------------------------

function surUnTrou(xMonde) {
  return etat.trous.some(t => xMonde - 6 > t.x0 && xMonde + 6 < t.x1);
}

function sauter() {
  if (etat === null) {
    return;
  }
  if (etat.phase === "attente") {
    etat.phase = "course";
  }
  if (etat.phase === "fin") {
    if (etat.finAge > 0.7) {
      demarrer();
    }
    return;
  }
  const t = etat.t;
  if (t.auSol && !t.chute && !etat.pause) {
    t.vy = -IMPULSION;
    t.auSol = false;
    t.maintien = 0;
    t.sx = 0.82;
    t.sy = 1.2;
    jouer("grain");
  }
}

function poussiere(x, y, n, force) {
  for (let i = 0; i < n; i++) {
    etat.particules.push({
      x: x + (Math.random() - 0.5) * 20, y, vx: (Math.random() - 0.7) * force, vy: -Math.random() * force * 0.6,
      vie: 0.35 + Math.random() * 0.3, taille: 2 + Math.random() * 3, couleur: "poussiere"
    });
  }
}

function boiteTanuki() {
  const t = etat.t;
  const baisse = commandes.bas && t.auSol;
  if (baisse) {
    return { x0: XT - 24, x1: XT + 26, y0: SOL + t.y - 24, y1: SOL + t.y };
  }
  return { x0: XT - 16, x1: XT + 18, y0: SOL + t.y - 42, y1: SOL + t.y - 2 };
}

function boiteObstacle(o) {
  const x = o.x - etat.dist + XT;
  if (o.type === "corbeauBas" || o.type === "corbeauHaut") {
    const y = SOL - o.vol - Math.sin(o.phase) * 4;
    return { x0: x - o.l / 2 + 6, x1: x + o.l / 2 - 6, y0: y - o.h / 2 + 4, y1: y + o.h / 2 - 2 };
  }
  if (o.type === "kasa") {
    const saut = Math.abs(Math.sin(o.phase)) * 48;
    return { x0: x - o.l / 2 + 5, x1: x + o.l / 2 - 5, y0: SOL - saut - o.h + 6, y1: SOL - saut };
  }
  return { x0: x - o.l / 2 + 4, x1: x + o.l / 2 - 4, y0: SOL - o.h + 4, y1: SOL };
}

function touche(a, b) {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}

function mourir(chute) {
  const t = etat.t;
  etat.phase = "fin";
  etat.finAge = 0;
  t.etourdi = 1;
  etat.secousse = 0.3;
  if (!chute) {
    t.vy = -380;
    t.auSol = false;
  }
  jouer("mort");
  if (etat.score > etat.record) {
    etat.record = etat.score;
    stockageRecord.ecrireTexte(String(etat.score));
  }
  setTimeout(() => {
    if (etat && etat.phase === "fin" && !zone.hidden) {
      finDePartie(ID, etat.score);
    }
  }, 1300);
}

function maj(dt) {
  if (etat === null || etat.pause) {
    return;
  }
  const t = etat.t;
  etat.temps += dt;
  etat.secousse = Math.max(0, etat.secousse - dt);
  // Particules et textes vivent meme apres la chute
  etat.particules = etat.particules.filter(p => {
    p.vie -= dt;
    p.x += p.vx * dt - (etat.phase === "course" ? etat.vitesse * dt * 0.6 : 0);
    p.y += p.vy * dt;
    p.vy += 400 * dt;
    return p.vie > 0;
  });
  etat.textes = etat.textes.filter(x => {
    x.age += dt;
    return x.age < 0.8;
  });
  if (etat.banniere) {
    etat.banniere.age += dt;
    if (etat.banniere.age > 2.6) {
      etat.banniere = null;
    }
  }
  // Retour progressif a la forme normale (squash and stretch)
  t.sx += (1 - t.sx) * Math.min(1, dt * 12);
  t.sy += (1 - t.sy) * Math.min(1, dt * 12);

  if (etat.phase === "fin") {
    etat.finAge += dt;
    if (!t.auSol || t.chute) {
      t.vy += GRAVITE * dt;
      t.y += t.vy * dt;
      if (!t.chute && t.y >= 0) {
        t.y = 0;
        t.vy = 0;
        t.auSol = true;
      }
    }
    return;
  }
  if (etat.phase === "attente") {
    t.cycle += dt * 6;
    return;
  }

  // Vitesse et distance
  etat.vitesse = vitessePour(metres());
  const avance = etat.vitesse * dt;
  etat.dist += avance;
  t.cycle += avance / 22;

  // Saut : tenir allege la gravite au debut de la montee
  if (!t.auSol) {
    let g = GRAVITE;
    if (commandes.saut && t.vy < 0 && t.maintien < MAINTIEN_MAX) {
      g *= ALLEGEMENT;
      t.maintien += dt;
    }
    if (commandes.bas) {
      g *= CHUTE_RAPIDE;
    }
    t.vy += g * dt;
    t.y += t.vy * dt;
    if (t.y >= 0 && !t.chute) {
      if (surUnTrou(etat.dist)) {
        t.chute = true;
      } else {
        t.y = 0;
        t.vy = 0;
        t.auSol = true;
        t.sx = 1.25;
        t.sy = 0.78;
        poussiere(XT, SOL, 8, 160);
      }
    }
  } else if (surUnTrou(etat.dist)) {
    t.auSol = false;
    t.chute = true;
    t.vy = 0;
  }
  if (t.chute) {
    t.vy += GRAVITE * dt;
    t.y += t.vy * dt;
    if (t.y > 120) {
      mourir(true);
      return;
    }
  }

  // Poussiere de course, un petit nuage a chaque foulee
  if (t.auSol && Math.floor(t.cycle) !== Math.floor(t.cycle - avance / 22) && Math.floor(t.cycle) % 2 === 0) {
    poussiere(XT - 14, SOL, 1, 60);
  }

  // Nouveaux motifs
  while (etat.prochain - etat.dist < LV + 200) {
    etat.prochain = genererMotif(etat.prochain);
  }

  // Obstacles
  const boite = boiteTanuki();
  for (const o of etat.obstacles) {
    o.phase += dt * (o.type === "kasa" ? 3.2 : 9);
    if (o.type === "corbeauBas" || o.type === "corbeauHaut") {
      o.x -= 60 * dt;
    }
    if (touche(boite, boiteObstacle(o))) {
      mourir(false);
      return;
    }
  }
  etat.obstacles = etat.obstacles.filter(o => o.x - etat.dist > -200);
  etat.trous = etat.trous.filter(tr => tr.x1 - etat.dist > -200);

  // Onigiri
  etat.onigiris.forEach(g => {
    if (g.pris) {
      return;
    }
    const x = g.x - etat.dist + XT;
    const y = g.y;
    if (x > boite.x0 - 10 && x < boite.x1 + 10 && y > boite.y0 - 12 && y < boite.y1 + 10) {
      g.pris = true;
      etat.onigiri++;
      etat.textes.push({ x, y, texte: "+" + POINTS_ONIGIRI, age: 0 });
      jouer("bonus");
    }
  });
  etat.onigiris = etat.onigiris.filter(g => !g.pris && g.x - etat.dist > -100);

  // Score, paliers
  const score = Math.floor(metres()) + etat.onigiri * POINTS_ONIGIRI;
  if (Math.floor(score / 500) > Math.floor(etat.score / 500)) {
    jouer("combo", Math.min(8, Math.floor(score / 500)));
  }
  if (score !== etat.score) {
    etat.score = score;
    majScoreCourant(ID, score);
  }
  const p = palierCourant();
  if (p > etat.palier) {
    etat.palier = p;
    etat.banniere = { texte: PALIERS[p].nom, age: 0 };
    jouer("vague");
  }
}

// ---------------------------------------------------------------------
// Decor
// ---------------------------------------------------------------------

function dessinerCiel(pal) {
  const g = ctx.createLinearGradient(0, 0, 0, SOL);
  g.addColorStop(0, pal.cielHaut);
  g.addColorStop(1, pal.cielBas);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, LV, HV);
  // Etoiles, seulement la nuit, rares et fixes
  if (pal.nuit > 0.3) {
    ctx.fillStyle = "rgba(242,236,214," + Math.min(1, (pal.nuit - 0.3) * 1.6) + ")";
    for (let i = 0; i < 40; i++) {
      const x = bruit(i * 3.1) * LV;
      const y = bruit(i * 7.7) * SOL * 0.6;
      const s = bruit(i * 1.3) < 0.2 ? 2 : 1;
      ctx.fillRect(x, y, s, s);
    }
  }
  // Astre : soleil le jour, lune la nuit, sur un grand arc
  const u = pal.u;
  const nuitArc = u >= 0.48 && u < 0.92;
  const k = nuitArc ? (u - 0.48) / 0.44 : ((u + (u < 0.48 ? 0.08 : -0.92)) / 0.56);
  const ax = LV * (0.1 + 0.8 * k);
  const ay = SOL * 0.75 - Math.sin(Math.max(0, Math.min(1, k)) * Math.PI) * SOL * 0.55;
  ctx.fillStyle = pal.astre;
  ctx.beginPath();
  ctx.arc(ax, ay, nuitArc ? 16 : 22, 0, Math.PI * 2);
  ctx.fill();
  if (nuitArc) {
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.beginPath();
    ctx.arc(ax - 5, ay - 3, 4, 0, Math.PI * 2);
    ctx.arc(ax + 6, ay + 5, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function crete(decalage, frequence, base, amplitude, couleur, pointes) {
  ctx.fillStyle = couleur;
  ctx.beginPath();
  ctx.moveTo(0, HV);
  for (let x = 0; x <= LV + 8; x += 8) {
    const w = x + decalage;
    let y = base - (Math.sin(w * frequence) * 0.5 + 0.5) * amplitude
      - (Math.sin(w * frequence * 2.7 + 1.3) * 0.5 + 0.5) * amplitude * 0.35;
    if (pointes) {
      // Un grand volcan facon Fuji de temps en temps
      const cycle = (w % 1400 + 1400) % 1400;
      const d = Math.abs(cycle - 700) / 220;
      if (d < 1) {
        y = Math.min(y, base - amplitude * 1.9 * (1 - d));
      }
    }
    ctx.lineTo(x, y);
  }
  ctx.lineTo(LV, HV);
  ctx.closePath();
  ctx.fill();
}

function dessinerMontagnes(pal) {
  const d = etat.dist;
  const k = SOL / 248;
  crete(d * 0.06, 0.004, SOL - 60 * k, 60 * k, pal.mont, true);
  // Neige sur le grand sommet : un triangle qui suit la pente
  const w0 = d * 0.06;
  const centre = 700 - ((w0 % 1400) + 1400) % 1400;
  for (const cx of [centre, centre + 1400, centre - 1400]) {
    if (cx < -300 || cx > LV + 300) {
      continue;
    }
    const sommet = SOL - 60 * k - 60 * k * 1.9;
    const pente = (60 * k * 1.9) / 220;
    const h = 30 * k;
    const demi = h / pente;
    ctx.fillStyle = "rgba(255,255,255," + (0.88 - pal.nuit * 0.5) + ")";
    ctx.beginPath();
    ctx.moveTo(cx, sommet);
    ctx.lineTo(cx + demi, sommet + h);
    ctx.lineTo(cx + demi * 0.5, sommet + h * 0.8);
    ctx.lineTo(cx + demi * 0.1, sommet + h * 1.05);
    ctx.lineTo(cx - demi * 0.35, sommet + h * 0.78);
    ctx.lineTo(cx - demi, sommet + h);
    ctx.closePath();
    ctx.fill();
  }
  crete(d * 0.12 + 300, 0.007, SOL - 30 * k, 44 * k, pal.mont2, false);
}

function etat_nuit(pal) {
  return pal.nuit;
}

function dessinerVillage(pal) {
  // Silhouettes de maisons, de pagodes et de torii, par tuiles de 220 px
  const vitesse = 0.22;
  const decal = etat.dist * vitesse;
  const tuile = 220;
  const premier = Math.floor(decal / tuile) - 1;
  ctx.fillStyle = pal.village;
  ctx.fillRect(0, SOL - 26, LV, 30);
  for (let i = premier; i < premier + Math.ceil(LV / tuile) + 2; i++) {
    const x = i * tuile - decal;
    const r = bruit(i);
    const base = SOL - 24;
    if (r < 0.3) {
      // Pagode a trois toits
      const px = x + 60 + bruit(i + 9) * 80;
      for (let k = 0; k < 3; k++) {
        const w = 46 - k * 10;
        const y = base - 18 - k * 20;
        ctx.fillRect(px - w / 2 + 6, y, w - 12, 20);
        ctx.beginPath();
        ctx.moveTo(px - w / 2 - 4, y + 4);
        ctx.lineTo(px + w / 2 + 4, y + 4);
        ctx.lineTo(px + w / 2 - 6, y - 4);
        ctx.lineTo(px - w / 2 + 6, y - 4);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillRect(px - 1, base - 92, 2, 16);
    } else if (r < 0.55) {
      // Torii
      const px = x + 40 + bruit(i + 3) * 120;
      ctx.fillRect(px, base - 34, 4, 34);
      ctx.fillRect(px + 26, base - 34, 4, 34);
      ctx.fillRect(px - 6, base - 38, 42, 5);
      ctx.fillRect(px - 2, base - 28, 34, 3);
    }
    // Maisons basses aux toits courbes
    const n = 1 + Math.floor(bruit(i + 5) * 3);
    for (let k = 0; k < n; k++) {
      const hx = x + bruit(i * 3 + k) * tuile;
      const hw = 30 + bruit(i * 5 + k) * 24;
      const hh = 12 + bruit(i * 7 + k) * 8;
      ctx.fillRect(hx, base - hh, hw, hh + 4);
      ctx.beginPath();
      ctx.moveTo(hx - 6, base - hh + 2);
      ctx.quadraticCurveTo(hx + hw / 2, base - hh - 14, hx + hw + 6, base - hh + 2);
      ctx.closePath();
      ctx.fill();
      // Fenetres eclairees la nuit
      if (pal.nuit > 0.5 && bruit(i * 11 + k) < 0.7) {
        ctx.fillStyle = "rgba(255,200,110," + (pal.nuit - 0.4) + ")";
        ctx.fillRect(hx + hw * 0.3, base - hh * 0.6, 4, 4);
        ctx.fillStyle = pal.village;
      }
    }
  }
}

function bambous(vitesse, tuile, couleur, clair, hautMin, decalSeed, feuilles, vide) {
  const decal = etat.dist * vitesse;
  const premier = Math.floor(decal / tuile) - 1;
  for (let i = premier; i < premier + Math.ceil(LV / tuile) + 2; i++) {
    const r = bruit(i * 1.7 + decalSeed);
    if (r < (vide || 0.35)) {
      continue;
    }
    const x = i * tuile - decal + bruit(i + decalSeed) * tuile * 0.6;
    const l = 5 + bruit(i * 2.3 + decalSeed) * 4;
    const haut = hautMin - bruit(i * 4.1 + decalSeed) * 70;
    const pench = (bruit(i * 9.1 + decalSeed) - 0.5) * 14;
    ctx.fillStyle = couleur;
    ctx.beginPath();
    ctx.moveTo(x, SOL + 2);
    ctx.lineTo(x + pench, haut);
    ctx.lineTo(x + pench + l, haut);
    ctx.lineTo(x + l, SOL + 2);
    ctx.closePath();
    ctx.fill();
    // Noeuds du bambou
    ctx.fillStyle = clair;
    for (let y = SOL - 28; y > haut + 8; y -= 30) {
      const k = (SOL - y) / (SOL - haut);
      ctx.fillRect(x + pench * k - 1, y, l + 2, 2);
    }
    // Liseré clair d'un cote : la lumiere vient de gauche
    ctx.fillRect(x + 1, haut + 4, 1.5, SOL - haut - 4);
    if (feuilles) {
      ctx.fillStyle = feuilles;
      for (let k = 0; k < 4; k++) {
        const fy = haut + 10 + k * 22;
        const kk = (SOL - fy) / (SOL - haut);
        const fx = x + pench * kk + l / 2;
        const sens = k % 2 ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.quadraticCurveTo(fx + sens * 14, fy - 6, fx + sens * 24, fy + 2);
        ctx.quadraticCurveTo(fx + sens * 12, fy + 2, fx, fy);
        ctx.fill();
      }
    }
  }
}

function dessinerSol(pal) {
  // Le sentier, coupe par les trous
  const morceaux = [];
  let debut = 0;
  const trous = etat.trous
    .map(t => [t.x0 - etat.dist + XT, t.x1 - etat.dist + XT])
    .filter(([a, b]) => b > 0 && a < LV)
    .sort((a, b) => a[0] - b[0]);
  trous.forEach(([a, b]) => {
    morceaux.push([debut, a]);
    debut = b;
  });
  morceaux.push([debut, LV]);
  trous.forEach(([a, b]) => {
    // Le fond du trou : de plus en plus sombre en descendant
    const g = ctx.createLinearGradient(0, SOL, 0, HV);
    g.addColorStop(0, pal.solSombre);
    g.addColorStop(1, "#050508");
    ctx.fillStyle = g;
    ctx.fillRect(a, SOL, b - a, HV - SOL);
  });
  morceaux.forEach(([a, b]) => {
    if (b <= a) {
      return;
    }
    ctx.fillStyle = pal.sol;
    ctx.fillRect(a, SOL, b - a, HV - SOL);
    ctx.fillStyle = pal.solHaut;
    ctx.fillRect(a, SOL - 3, b - a, 7);
    ctx.fillStyle = pal.herbe;
    ctx.fillRect(a, SOL + 4, b - a, 2);
    // Bords du trou : la terre se voit en coupe
    ctx.fillStyle = pal.solSombre;
    if (a > 0) {
      ctx.fillRect(a, SOL + 4, 4, HV - SOL);
    }
    if (b < LV) {
      ctx.fillRect(b - 4, SOL + 4, 4, HV - SOL);
    }
  });
  // Cailloux du sentier, au rythme du sol
  const tuile = 46;
  const decal = etat.dist;
  const premier = Math.floor(decal / tuile) - 1;
  for (let i = premier; i < premier + Math.ceil(LV / tuile) + 2; i++) {
    const x = i * tuile - decal + bruit(i * 1.9) * tuile;
    if (surUnTrou(x + etat.dist - XT)) {
      continue;
    }
    const y = SOL + 12 + bruit(i * 3.7) * (HV - SOL - 20);
    ctx.fillStyle = pal.solSombre;
    ctx.beginPath();
    ctx.ellipse(x, y, 3 + bruit(i * 2.2) * 5, 2 + bruit(i * 4.4) * 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Touffes d'herbe au bord
  for (let i = premier; i < premier + Math.ceil(LV / tuile) + 2; i++) {
    if (bruit(i * 5.3) < 0.55) {
      continue;
    }
    const x = i * tuile - decal + bruit(i * 6.1) * tuile;
    if (surUnTrou(x + etat.dist - XT)) {
      continue;
    }
    ctx.fillStyle = pal.herbe;
    for (let k = -2; k <= 2; k++) {
      ctx.beginPath();
      ctx.moveTo(x + k * 3, SOL);
      ctx.lineTo(x + k * 3 + k * 2, SOL - 7 - Math.abs(2 - Math.abs(k)) * 3);
      ctx.lineTo(x + k * 3 + 2, SOL);
      ctx.fill();
    }
  }
}

// ---------------------------------------------------------------------
// Le tanuki
// ---------------------------------------------------------------------

function dessinerTanuki(pal) {
  const t = etat.t;
  const baisse = commandes.bas && t.auSol && etat.phase === "course";
  const x = XT;
  const y = SOL + t.y;
  const course = etat.phase !== "fin" && t.auSol;
  const c = t.cycle * Math.PI;
  const rebond = course ? Math.abs(Math.sin(c)) * 3 : 0;
  // Ombre au sol, qui retrecit quand il monte
  if (!t.chute) {
    const h = Math.max(0, -t.y);
    ctx.fillStyle = "rgba(0,0,0," + (0.28 * Math.max(0.2, 1 - h / 200)) + ")";
    ctx.beginPath();
    ctx.ellipse(x + 2, SOL + 1, 22 * Math.max(0.4, 1 - h / 260), 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.save();
  ctx.translate(x, y);
  const sx = baisse ? 1.25 : t.sx;
  const sy = baisse ? 0.58 : t.sy;
  ctx.scale(sx, sy);
  ctx.translate(0, -rebond);
  if (t.etourdi) {
    ctx.rotate(Math.min(0.5, etat.finAge * 2) * (t.chute ? 1 : -1));
  }
  const brun = "#8a5e3a";
  const brunSombre = "#5e3c22";
  const creme = "#f0dfc0";
  const masque = "#2a1a12";
  // Queue rayee, qui suit la course
  const qa = course ? Math.sin(c) * 0.25 : t.vy < 0 ? -0.5 : 0.3;
  ctx.save();
  ctx.translate(-16, -18);
  ctx.rotate(-0.6 + qa);
  ctx.fillStyle = brun;
  ctx.beginPath();
  ctx.ellipse(-10, 0, 13, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = masque;
  ctx.fillRect(-14, -6, 3, 12);
  ctx.fillRect(-6, -7, 3, 14);
  ctx.beginPath();
  ctx.ellipse(-21, 0, 3, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // Pattes : deux paires qui alternent, regroupees en l'air
  const patte = (px, phase, avant) => {
    let a;
    if (course) {
      a = Math.sin(c + phase) * 0.8;
    } else if (!t.auSol) {
      a = avant ? -0.9 : 0.8;
    } else {
      a = 0;
    }
    ctx.save();
    ctx.translate(px, -10);
    ctx.rotate(a);
    ctx.fillStyle = phase > 1 ? brunSombre : masque;
    ctx.beginPath();
    ctx.roundRect(-3.5, 0, 7, 12, 3);
    ctx.fill();
    ctx.restore();
  };
  patte(-10, Math.PI, false);
  patte(10, 0, true);
  // Corps
  ctx.fillStyle = brun;
  ctx.beginPath();
  ctx.ellipse(0, -20, 19, 15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = creme;
  ctx.beginPath();
  ctx.ellipse(4, -15, 11, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  patte(-6, Math.PI + 2, false);
  patte(13, 2, true);
  // Tete
  ctx.fillStyle = brun;
  ctx.beginPath();
  ctx.ellipse(14, -34, 13, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  // Oreilles
  ctx.fillStyle = brunSombre;
  ctx.beginPath();
  ctx.moveTo(5, -40);
  ctx.lineTo(7, -50);
  ctx.lineTo(13, -43);
  ctx.moveTo(15, -43);
  ctx.lineTo(21, -50);
  ctx.lineTo(23, -40);
  ctx.fill();
  // Museau creme et masque sombre autour des yeux
  ctx.fillStyle = creme;
  ctx.beginPath();
  ctx.ellipse(22, -31, 7, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = masque;
  ctx.beginPath();
  ctx.ellipse(16, -35, 6, 4, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(28, -32, 2.2, 0, Math.PI * 2);
  ctx.fill();
  // Oeil
  if (t.etourdi) {
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(15, -37);
    ctx.lineTo(19, -33);
    ctx.moveTo(19, -37);
    ctx.lineTo(15, -33);
    ctx.stroke();
  } else {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(17, -35, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#120a06";
    ctx.beginPath();
    ctx.arc(17.8, -35, 1.3, 0, Math.PI * 2);
    ctx.fill();
  }
  // La feuille sur la tete, celle de la transformation
  ctx.save();
  ctx.translate(12, -46);
  ctx.rotate(-0.4 + (course ? Math.sin(c * 2) * 0.12 : 0));
  ctx.fillStyle = "#7fbf2a";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-8, -6, -2, -14);
  ctx.quadraticCurveTo(6, -8, 0, 0);
  ctx.fill();
  ctx.strokeStyle = "#3f6912";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-2, -11);
  ctx.stroke();
  ctx.restore();
  ctx.restore();
}

// ---------------------------------------------------------------------
// Obstacles et onigiri
// ---------------------------------------------------------------------

function dessinerObstacle(o, pal) {
  const x = o.x - etat.dist + XT;
  if (x < -80 || x > LV + 80) {
    return;
  }
  const ombre = () => {
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(x, SOL + 1, o.l * 0.55, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  if (o.type === "pierre") {
    ombre();
    ctx.fillStyle = "#8f8a80";
    ctx.beginPath();
    ctx.moveTo(x - 17, SOL);
    ctx.quadraticCurveTo(x - 19, SOL - 22, x - 4, SOL - 28);
    ctx.quadraticCurveTo(x + 16, SOL - 26, x + 17, SOL);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#b8b2a6";
    ctx.beginPath();
    ctx.ellipse(x - 6, SOL - 20, 6, 4, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#6f9a3a";
    ctx.beginPath();
    ctx.ellipse(x + 2, SOL - 26, 9, 3, 0.1, 0, Math.PI * 2);
    ctx.fill();
  } else if (o.type === "souche") {
    ombre();
    ctx.fillStyle = "#6e4a2c";
    ctx.fillRect(x - 17, SOL - 36, 34, 36);
    ctx.fillStyle = "#4f3420";
    ctx.fillRect(x - 17, SOL - 36, 5, 36);
    ctx.fillRect(x + 6, SOL - 30, 3, 30);
    ctx.fillStyle = "#c8a06a";
    ctx.beginPath();
    ctx.ellipse(x, SOL - 36, 17, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#8a6a3e";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(x, SOL - 36, 10, 3, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#6e4a2c";
    ctx.beginPath();
    ctx.moveTo(x + 17, SOL - 12);
    ctx.lineTo(x + 26, SOL - 18);
    ctx.lineTo(x + 17, SOL - 6);
    ctx.fill();
  } else if (o.type === "lanterne") {
    ombre();
    // Toro de pierre : socle, pilier, chambre de feu, toit
    ctx.fillStyle = "#9a958a";
    ctx.fillRect(x - 15, SOL - 8, 30, 8);
    ctx.fillRect(x - 5, SOL - 34, 10, 26);
    ctx.fillRect(x - 12, SOL - 40, 24, 6);
    ctx.fillStyle = "#7a766c";
    ctx.fillRect(x - 10, SOL - 54, 20, 14);
    ctx.fillStyle = pal.nuit > 0.4 ? "#ffcf7a" : "#3a3630";
    ctx.fillRect(x - 5, SOL - 51, 10, 8);
    ctx.fillStyle = "#9a958a";
    ctx.beginPath();
    ctx.moveTo(x - 18, SOL - 54);
    ctx.lineTo(x + 18, SOL - 54);
    ctx.lineTo(x + 6, SOL - 63);
    ctx.lineTo(x - 6, SOL - 63);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(x - 3, SOL - 67, 6, 4);
    ctx.fillStyle = "#b8b2a6";
    ctx.fillRect(x - 5, SOL - 34, 2, 26);
  } else if (o.type === "corbeauBas" || o.type === "corbeauHaut") {
    const y = SOL - o.vol - Math.sin(o.phase) * 4;
    const aile = Math.sin(o.phase) * 12;
    // Ombre portee au sol, pour juger la hauteur
    ctx.fillStyle = "rgba(0,0,0,0.15)";
    ctx.beginPath();
    ctx.ellipse(x, SOL + 1, 14, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1c1826";
    ctx.beginPath();
    ctx.moveTo(x - 4, y);
    ctx.lineTo(x - 22, y - aile);
    ctx.lineTo(x + 2, y - 4);
    ctx.lineTo(x + 20, y - aile);
    ctx.lineTo(x + 6, y + 2);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x, y + 2, 12, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    // Masque rouge de tengu et long nez
    ctx.fillStyle = "#c8372d";
    ctx.beginPath();
    ctx.arc(x - 11, y - 1, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - 15, y - 2);
    ctx.lineTo(x - 26, y);
    ctx.lineTo(x - 15, y + 2);
    ctx.fill();
    ctx.fillStyle = "#ffe08a";
    ctx.fillRect(x - 14, y - 3, 2, 2);
    ctx.fillStyle = "#1c1826";
    ctx.beginPath();
    ctx.moveTo(x + 10, y + 2);
    ctx.lineTo(x + 20, y - 1);
    ctx.lineTo(x + 20, y + 6);
    ctx.fill();
  } else if (o.type === "kasa") {
    const saut = Math.abs(Math.sin(o.phase)) * 48;
    const y = SOL - saut;
    ctx.fillStyle = "rgba(0,0,0," + (0.25 - saut / 400) + ")";
    ctx.beginPath();
    ctx.ellipse(x, SOL + 1, 14 - saut / 8, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    // Kasa-obake : l'ombrelle a un oeil et une jambe
    ctx.fillStyle = "#3a2a1e";
    ctx.fillRect(x - 1.5, y - 14, 3, 14);
    ctx.fillStyle = "#e8b83a";
    ctx.fillRect(x - 4, y - 2, 8, 3);
    ctx.fillStyle = "#c8372d";
    ctx.beginPath();
    ctx.moveTo(x - 18, y - 14);
    ctx.quadraticCurveTo(x, y - 52, x + 18, y - 14);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#8e2620";
    for (let k = -1; k <= 1; k++) {
      ctx.beginPath();
      ctx.moveTo(x + k * 6, y - 14);
      ctx.lineTo(x, y - 42);
      ctx.lineTo(x + k * 6 + 1.5, y - 14);
      ctx.fill();
    }
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(x - 2, y - 26, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#120a06";
    ctx.beginPath();
    ctx.arc(x - 3.5, y - 26, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#c8372d";
    ctx.beginPath();
    ctx.moveTo(x + 2, y - 18);
    ctx.quadraticCurveTo(x + 8, y - 14, x + 4, y - 12);
    ctx.fill();
  }
}

function dessinerOnigiri(g) {
  const x = g.x - etat.dist + XT;
  if (x < -20 || x > LV + 20) {
    return;
  }
  const y = g.y + Math.sin(etat.temps * 4 + g.x * 0.05) * 2;
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.beginPath();
  ctx.moveTo(x - 9, y + 8);
  ctx.quadraticCurveTo(x, y - 14, x + 9, y + 8);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#fbf6ea";
  ctx.beginPath();
  ctx.moveTo(x - 10, y + 6);
  ctx.quadraticCurveTo(x - 10, y - 2, x, y - 11);
  ctx.quadraticCurveTo(x + 10, y - 2, x + 10, y + 6);
  ctx.quadraticCurveTo(x, y + 9, x - 10, y + 6);
  ctx.fill();
  ctx.fillStyle = "#1e2a24";
  ctx.fillRect(x - 5, y, 10, 7);
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.fillRect(x - 5, y - 6, 2, 3);
}

// ---------------------------------------------------------------------
// Image complete
// ---------------------------------------------------------------------

function texteContour(texte, x, y, taille, couleur, alignement) {
  ctx.font = "800 " + taille + "px 'Anybody', sans-serif";
  ctx.textAlign = alignement || "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(3, taille * 0.2);
  ctx.strokeStyle = "rgba(10,8,20,0.75)";
  ctx.strokeText(texte, x, y);
  ctx.fillStyle = couleur;
  ctx.fillText(texte, x, y);
}

function dessinerHud() {
  texteContour(etat.score.toLocaleString("fr-BE"), 16, 24, 26, "#ffffff", "left");
  ctx.font = "600 9px 'Martian Mono', monospace";
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillText("MEILLEUR " + etat.record.toLocaleString("fr-BE"), 18, 46);
  // A droite : distance et onigiri
  texteContour(Math.floor(metres()) + " m", LV - 16, 24, 20, "#ffffff", "right");
  const ox = LV - 16;
  ctx.font = "600 10px 'Martian Mono', monospace";
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fillText("x" + etat.onigiri, ox, 47);
  dessinerOnigiri({ x: etat.dist - XT + ox - 34, y: 44 });
}

function dessiner() {
  if (etat === null) {
    return;
  }
  ctx.setTransform(echelle, 0, 0, echelle, 0, 0);
  const pal = paletteA(metres());
  const dx = etat.secousse > 0 ? (Math.random() - 0.5) * 6 * etat.secousse * 3 : 0;
  ctx.save();
  ctx.translate(dx, 0);
  dessinerCiel(pal);
  dessinerMontagnes(pal);
  dessinerVillage(pal);
  bambous(0.38, 46, pal.bambouFond, pal.bambouFond, SOL - 70 - HV * 0.12, 17, null, 0.55);
  bambous(0.62, 70, pal.bambou, pal.bambouClair, SOL - 110 - HV * 0.2, 41, pal.feuille, 0.45);
  dessinerSol(pal);
  etat.onigiris.forEach(dessinerOnigiri);
  etat.obstacles.forEach(o => dessinerObstacle(o, pal));
  dessinerTanuki(pal);
  // Poussiere
  etat.particules.forEach(p => {
    ctx.globalAlpha = Math.min(1, p.vie * 2.5) * 0.7;
    ctx.fillStyle = "#d8c8a8";
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.taille, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
  // Bambous du premier plan, rares et sombres : ils donnent la profondeur
  bambous(1.35, 420, "rgba(12,20,12,0.8)", "rgba(12,20,12,0.8)", -40, 77, null, 0.6);
  ctx.restore();

  etat.textes.forEach(t => {
    ctx.globalAlpha = 1 - t.age / 0.8;
    texteContour(t.texte, t.x, t.y - t.age * 40, 14, "#ffe38a");
  });
  ctx.globalAlpha = 1;
  dessinerHud();

  if (etat.banniere) {
    const k = etat.banniere.age;
    const a = k < 0.3 ? k / 0.3 : k > 2.2 ? (2.6 - k) / 0.4 : 1;
    ctx.globalAlpha = Math.max(0, a);
    ctx.fillStyle = "rgba(10,8,20,0.55)";
    ctx.fillRect(0, HV * 0.28 - 22, LV, 44);
    texteContour(etat.banniere.texte.toUpperCase(), LV / 2, HV * 0.28, 22, "#ffe38a");
    ctx.globalAlpha = 1;
  }

  if (etat.phase === "attente") {
    ctx.fillStyle = "rgba(10,8,20,0.45)";
    ctx.fillRect(0, 0, LV, HV);
    texteContour("TANUKI RUN", LV / 2, HV * 0.36, LV < 500 ? 40 : 52, "#ffffff");
    ctx.font = "600 11px 'Martian Mono', monospace";
    ctx.fillStyle = "#ffe38a";
    ctx.textAlign = "center";
    ctx.fillText("Saute pour partir", LV / 2, HV * 0.36 + 40);
  } else if (etat.pause) {
    ctx.fillStyle = "rgba(10,8,20,0.5)";
    ctx.fillRect(0, 0, LV, HV);
    texteContour("PAUSE", LV / 2, HV * 0.42, 40, "#ffffff");
  } else if (etat.phase === "fin" && etat.finAge > 0.5) {
    ctx.fillStyle = "rgba(10,8,20,0.55)";
    ctx.fillRect(0, 0, LV, HV);
    texteContour("CHUTE !", LV / 2, HV * 0.3, 40, "#ff8a7a");
    texteContour(etat.score.toLocaleString("fr-BE") + " points", LV / 2, HV * 0.3 + 44, 22, "#ffffff");
    ctx.font = "600 10px 'Martian Mono', monospace";
    ctx.fillStyle = "#ffe38a";
    ctx.textAlign = "center";
    ctx.fillText(Math.floor(metres()) + " m et " + etat.onigiri + " onigiri", LV / 2, HV * 0.3 + 74);
  }
}

// ---------------------------------------------------------------------
// Taille du canvas
// ---------------------------------------------------------------------

function ajuster() {
  const marge = window.innerWidth >= 1100 ? 500 : 0;
  const largeur = Math.min(window.innerWidth * 0.96 - marge, 1100);
  const entete = zone.querySelector(".entete-run").getBoundingClientRect().height || 40;
  const manette = parseFloat(getComputedStyle(document.body).getPropertyValue("--hauteur-manette")) || 0;
  const hauteur = Math.max(220, window.innerHeight - entete - manette - 46);
  // Paysage si la place est large, sinon un cadre carre pour le telephone
  const portrait = largeur < 600;
  LV = portrait ? 400 : 720;
  HV = portrait ? 400 : Math.round(Math.min(460, Math.max(300, 720 * hauteur / largeur)));
  SOL = HV - 52;
  XT = portrait ? 76 : 120;
  const taille = Math.min(largeur / LV, hauteur / HV);
  canvas.style.width = Math.floor(LV * taille) + "px";
  canvas.style.height = Math.floor(HV * taille) + "px";
  echelle = Math.min(3, Math.max(1, taille * (window.devicePixelRatio || 1)));
  canvas.width = Math.round(LV * echelle);
  canvas.height = Math.round(HV * echelle);
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

// ---------------------------------------------------------------------
// Commandes
// ---------------------------------------------------------------------

function majBoutonSon() {
  boutonSon.textContent = sonActif() ? "Son" : "Muet";
  boutonSon.setAttribute("aria-pressed", String(!sonActif()));
}

function demarrer() {
  ajuster();
  requestAnimationFrame(ajuster);
  etat = nouvelEtat();
  commandes.saut = false;
  commandes.bas = false;
  majScoreCourant(ID, 0);
  majBoutonSon();
  boucle.lancer();
}

function basculerPause() {
  if (etat === null || etat.phase !== "course") {
    return;
  }
  etat.pause = !etat.pause;
  if (!etat.pause) {
    boucle.remettreALHeure();
  }
}

const TOUCHES_SAUT = [" ", "arrowup", "z", "w"];
const TOUCHES_BAS = ["arrowdown", "s"];

surTouche(ID, function (evenement) {
  const touche = evenement.key.toLowerCase();
  if (TOUCHES_SAUT.includes(touche)) {
    if (!evenement.repeat) {
      commandes.saut = true;
      sauter();
    }
  } else if (TOUCHES_BAS.includes(touche)) {
    commandes.bas = true;
    if (etat && etat.phase === "attente") {
      etat.phase = "course";
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

surRelachement(function (evenement) {
  const touche = evenement.key.toLowerCase();
  if (TOUCHES_SAUT.includes(touche)) {
    commandes.saut = false;
  } else if (TOUCHES_BAS.includes(touche)) {
    commandes.bas = false;
  }
});

// Au doigt : toucher saute (tenir prolonge), glisser vers le bas baisse
let departDoigt = null;

canvas.addEventListener("pointerdown", function (evenement) {
  if (!jeuAuPremierPlan(ID)) {
    return;
  }
  evenement.preventDefault();
  canvas.setPointerCapture(evenement.pointerId);
  departDoigt = evenement.clientY;
  commandes.saut = true;
  sauter();
});

canvas.addEventListener("pointermove", function (evenement) {
  if (departDoigt !== null && evenement.clientY - departDoigt > 24) {
    commandes.saut = false;
    commandes.bas = true;
  }
});

function lacherDoigt() {
  departDoigt = null;
  commandes.saut = false;
  commandes.bas = false;
}
canvas.addEventListener("pointerup", lacherDoigt);
canvas.addEventListener("pointercancel", lacherDoigt);
canvas.addEventListener("contextmenu", evenement => evenement.preventDefault());

document.addEventListener("visibilitychange", function () {
  if (document.hidden && etat !== null && !etat.pause && etat.phase === "course" && !zone.hidden) {
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
export const _test = { get etat() { return etat; }, commandes, sauter };

enregistrerJeu({
  id: ID,
  nom: "Tanuki Run",
  code: "2014",
  section: zone,
  demarrer,
  arreter: () => {
    boucle.arreter();
    lacherDoigt();
  },
  manette: { a: " ", b: "ArrowDown", start: "p", libelles: { a: "Saut", b: "Baisser" } }
});
