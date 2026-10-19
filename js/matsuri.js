// =====================================================================
//  FLIPPER (Matsuri, la fete de nuit)
//  Une vraie table : lanceur, trois couloirs du haut, trois tambours
//  taiko, deux lance-pierres, une rampe, une orbite avec son spinner,
//  trois masques a faire tomber, un sanctuaire qui capture la bille,
//  trois cibles qui arment le kickback.
//
//  La partie ne s'arrete jamais de monter : six missions tournent
//  (couloirs, tambours, masques, rampe, orbite, sanctuaire). Les six
//  faites, c'est Hanabi, une multibille a jackpot, puis le niveau
//  suivant, ou chaque mission demande un peu plus et rapporte plus.
//
//  Physique a pas fixe (1/600 s) : une bille a 1800 px/s avance de
//  3 px par pas, moins que son rayon, elle ne traverse donc rien.
//  Les flippers transmettent leur vitesse de rotation au point de
//  contact : un coup pris pres du bout part plus fort.
// =====================================================================

import { enregistrerJeu, finDePartie, quitterJeu, majScoreCourant } from "./arcade.js";
import { creerBoucle } from "./noyau/boucle.js";
import { surTouche, jeuAuPremierPlan } from "./noyau/clavier.js";
import { abscisseLogique } from "./noyau/pointeur.js";
import { creerEffets } from "./noyau/effets.js";
import { jouer, basculerSon, sonActif } from "./noyau/son.js";

const ID = "matsuri";

// ---------------------------------------------------------------------
// Reglages de ressenti
// ---------------------------------------------------------------------

const L = 400;                    // largeur logique de la table
const H_TABLE = 720;

const PAS = 1 / 600;
const GRAVITE = 1150;
const VITESSE_MAX = 1800;
const R = 8;                      // rayon de la bille

const FLIP = {
  longueur: 58,
  rayonPivot: 9,
  rayonBout: 5,
  repos: 0.52,
  leve: -0.5,
  vitesse: 30,                    // rad/s a la montee
  retour: 18,
  rebond: 0.32
};

const LANCEUR = { min: 1050, max: 1720, charge: 1.1 };
const BUMPER = { rayon: 19, ejection: 620 };
const KICK_SLING = 470;
const BILLES = 3;
const TILT = { force: 120, seuil: 3, oubli: 0.55 };

// Couleurs de la table
const C = {
  nuit: "#15132a",
  nuitClaire: "#1d1a36",
  montagne: "#211e3d",
  neige: "#34305a",
  lune: "#e9dfc6",
  rail: "#d9ccb2",
  railOmbre: "#8f856f",
  creme: "#ede8df",
  rouge: "#c8372d",
  rougeClair: "#e0574b",
  rougeSombre: "#7e211b",
  or: "#e8c547",
  orSombre: "#8a7426",
  lime: "#c6f35a",
  limeSombre: "#4d5e24",
  bleu: "#5a8fa8",
  bleuSombre: "#29424f",
  violet: "#8a6ac0",
  violetSombre: "#3d3058",
  encre: "#0b0b10",
  eteint: "#3a3654"
};

// ---------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------

const zone = document.createElement("section");
zone.className = "jeu jeu-matsuri";
zone.id = "jeuMatsuri";
zone.hidden = true;
zone.innerHTML = `
  <div class="jeu-entete entete-matsuri">
    <span class="jeu-score score-principal">Score <strong class="valeur-score" id="scoreMatsuri">0</strong></span>
    <span class="jeu-score">Bille <strong id="billeMatsuri">1</strong></span>
    <span class="jeu-score multi-matsuri">Niveau <strong id="multiMatsuri">1</strong></span>
    <span class="entete-boutons">
      <button class="jeu-quitter" id="sonMatsuri" type="button">Son</button>
      <button class="jeu-quitter" id="rejouerMatsuri" type="button">Rejouer</button>
      <button class="jeu-quitter" id="quitterMatsuri" type="button">Retour</button>
    </span>
  </div>
  <canvas id="canvasMatsuri"></canvas>
  <p class="jeu-aide">Flippers : Gauche / Q et Droite / D. Lanceur : Bas ou Espace, maintenu pour charger puis relâché. Haut ou Z secoue la table (trop et c'est le tilt). Au doigt : moitié gauche et moitié droite de la table, et doigt posé puis relâché pour lancer. Six missions s'enchaînent, les six faites lancent Hanabi et le niveau suivant. P pause, M son, N rejouer, Échap quitter.</p>`;
document.body.appendChild(zone);

const canvas = zone.querySelector("#canvasMatsuri");
const ctx = canvas.getContext("2d");
const zoneScore = zone.querySelector("#scoreMatsuri");
const zoneBille = zone.querySelector("#billeMatsuri");
const zoneNiveau = zone.querySelector("#multiMatsuri");
const boutonSon = zone.querySelector("#sonMatsuri");
const boutonRejouer = zone.querySelector("#rejouerMatsuri");
const boutonQuitter = zone.querySelector("#quitterMatsuri");

// ---------------------------------------------------------------------
// Geometrie de la table (coordonnees de la table, sans le fronton)
// ---------------------------------------------------------------------

const ARCHE = { x: 201, y: 196, r: 187 };
const PIVOT_G = { x: 124, y: 636 };
const PIVOT_D = { x: 252, y: 636 };
const BILLE_LANCEUR = { x: 375, y: 690 };

function arcSegments(cx, cy, r, de, a, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = de + (a - de) * (i / n);
    pts.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]);
  }
  return pts;
}

function polyligne(points, options) {
  const segs = [];
  for (let i = 0; i < points.length - 1; i++) {
    segs.push(Object.assign({ a: points[i], b: points[i + 1] }, options));
  }
  return segs;
}

// Murs : rebond sec. Caoutchouc : plus vif.
const RAIL_EXT = [[14, 740], [14, 196], ...arcSegments(ARCHE.x, ARCHE.y, ARCHE.r, Math.PI, Math.PI * 2, 44).slice(1), [388, 740]];
const MUR_LANCEUR = [[362, 740], [362, 258]];
const STOP_LANCEUR = [[362, 700], [388, 700]];
const MUR_ORBITE = [[44, 258], [44, 428], [56, 452]];
// Les guides arrivent tangents au dessus du flipper au repos : pas de
// creux ou la bille pourrait se coincer
const GUIDE_G = [[40, 472], [40, 590], [119.8, 623.2]];
const GUIDE_D = [[336, 472], [336, 590], [256.2, 623.2]];
const SLING_G = { a: [64, 500], b: [64, 566], c: [104, 592] };
const SLING_D = { a: [312, 500], b: [312, 566], c: [272, 592] };
const SEPARATEURS = [128, 168, 208, 248].map(x => [[x, 88], [x, 122]]);
const COULOIRS_HAUT = [148, 188, 228];
const BOUCHE_RAMPE = { g: [[254, 346], [274, 298]], d: [[296, 356], [316, 308]], seuil: [[274, 298], [316, 308]] };
const CHEMIN_RAMPE = [[295, 303], [302, 250], [296, 196], [270, 160], [224, 140], [170, 138], [118, 152], [82, 186], [64, 236], [56, 300], [54, 370], [52, 430], [52, 474]];
const BUMPERS = [{ x: 150, y: 214 }, { x: 226, y: 214 }, { x: 188, y: 278 }];
const MASQUES = [160, 188, 216].map(x => ({ x, y: 404, demi: 11 }));
const CIBLES = [302, 336, 370].map(y => ({ x: 354, y, demi: 13 }));
const SANCTUAIRE = { x: 96, y: 304, r: 11 };
const SPINNER = { x: 29, y: 340, demi: 15 };
const POSTES = [
  { x: 44, y: 258, r: 4 }, { x: 40, y: 472, r: 5 }, { x: 336, y: 472, r: 5 },
  { x: 128, y: 88, r: 3 }, { x: 168, y: 88, r: 3 }, { x: 208, y: 88, r: 3 }, { x: 248, y: 88, r: 3 },
  { x: 254, y: 346, r: 4 }, { x: 296, y: 356, r: 4 }
];

// Portillons a sens unique : la bille passe en montant, rebondit en descendant
const PORTE_ORBITE = { a: [14, 238], b: [44, 258] };
const PORTE_LANCEUR = { a: [388, 234], b: [362, 258] };

const MURS = [
  ...polyligne(RAIL_EXT, { rebond: 0.32 }),
  ...polyligne(MUR_LANCEUR, { rebond: 0.3 }),
  ...polyligne(STOP_LANCEUR, { rebond: 0.05 }),
  ...polyligne(MUR_ORBITE, { rebond: 0.22 }),
  ...polyligne(GUIDE_G, { rebond: 0.3 }),
  ...polyligne(GUIDE_D, { rebond: 0.3 }),
  ...SEPARATEURS.map(s => ({ a: s[0], b: s[1], rebond: 0.4 })),
  { a: BOUCHE_RAMPE.g[0], b: BOUCHE_RAMPE.g[1], rebond: 0.4 },
  { a: BOUCHE_RAMPE.d[0], b: BOUCHE_RAMPE.d[1], rebond: 0.4 },
  { a: SLING_G.a, b: SLING_G.b, rebond: 0.5 },
  { a: SLING_G.b, b: SLING_G.c, rebond: 0.5 },
  { a: SLING_D.a, b: SLING_D.b, rebond: 0.5 },
  { a: SLING_D.b, b: SLING_D.c, rebond: 0.5 },
  { a: SLING_G.a, b: SLING_G.c, rebond: 0.6, sling: "g" },
  { a: SLING_D.a, b: SLING_D.c, rebond: 0.6, sling: "d" }
];

// ---------------------------------------------------------------------
// Etat
// ---------------------------------------------------------------------

const effets = creerEffets();
let etat = null;
const commandes = { gauche: false, droite: false, lanceur: false };
const doigts = new Map();
let accumulateur = 0;
let echelle = 1;

const MISSIONS = [
  { id: "couloirs", nom: "Lanternes", jp: "灯", aide: "Passe les 3 couloirs du haut", but: n => 1 + Math.floor((n - 1) / 2) },
  { id: "taiko", nom: "Taiko", jp: "太鼓", aide: "Frappe les tambours", but: n => 15 + n * 5 },
  { id: "masques", nom: "Masques", jp: "面", aide: "Fais tomber les 3 masques", but: n => 1 + Math.floor((n - 1) / 2) },
  { id: "rampe", nom: "Dragon", jp: "竜", aide: "Monte la rampe", but: n => 2 + n },
  { id: "orbite", nom: "Orbite", jp: "輪", aide: "Fais le tour par la gauche", but: n => 2 + n },
  { id: "sanctuaire", nom: "Sanctuaire", jp: "社", aide: "Loge la bille au sanctuaire", but: n => 1 + Math.floor(n / 2) }
];

function nouveauFlipper(gauche) {
  const repos = gauche ? FLIP.repos : Math.PI - FLIP.repos;
  return { gauche, pivot: gauche ? PIVOT_G : PIVOT_D, angle: repos, w: 0, repos, leve: gauche ? FLIP.leve : Math.PI - FLIP.leve };
}

function nouvelEtat() {
  return {
    score: 0,
    bille: 1,
    billesEnPlus: 0,
    niveau: 1,
    billes: [],
    flippers: [nouveauFlipper(true), nouveauFlipper(false)],
    charge: 0,
    couloirs: [false, false, false],
    skill: 0,                    // couloir clignotant du tir d'adresse
    skillActif: false,
    multBonus: 1,
    bonus: 0,
    masques: [true, true, true],
    reposeMasques: 0,
    cibles: [false, false, false],
    kickback: true,
    sauvetage: 0,
    mission: 0,                  // index de la mission en cours
    faites: [false, false, false, false, false, false],
    progres: 0,
    verrous: 0,
    sanctuaireAllume: false,
    hanabi: false,
    jackpot: false,
    spinner: { angle: 0, w: 0, accu: 0 },
    bumpers: BUMPERS.map(() => 0),
    slings: { g: 0, d: 0 },
    secousses: 0,
    tilt: false,
    message: null,
    pause: false,
    termine: false,
    finBille: 0,
    capture: null,               // bille tenue par le sanctuaire
    dernierOrbite: 0,
    clignote: 0,
    mort: false
  };
}

function nouvelleBille(x, y, vx, vy) {
  return { x, y, vx: vx || 0, vy: vy || 0, px: x, py: y, rampe: null, dansLanceur: false };
}

function billeAuLanceur() {
  const b = nouvelleBille(BILLE_LANCEUR.x, BILLE_LANCEUR.y);
  b.dansLanceur = true;
  etat.billes.push(b);
  etat.skill = Math.floor(Math.random() * 3);
  etat.skillActif = true;
}

function annoncer(titre, sous, duree, couleur) {
  etat.message = { titre, sous: sous || "", reste: duree || 2, couleur: couleur || C.creme };
}

function points(n, x, y, couleur) {
  if (etat.tilt) {
    return;
  }
  const total = Math.round(n * (1 + (etat.niveau - 1) * 0.5));
  etat.score += total;
  if (x !== undefined) {
    effets.flotter(...pointEcran(x, y), total.toLocaleString("fr-BE"), couleur || C.creme, 11);
  }
  majHud();
}

// ---------------------------------------------------------------------
// Missions et regles
// ---------------------------------------------------------------------

function missionCourante() {
  return MISSIONS[etat.mission];
}

function avancerMission(id, quantite) {
  if (etat.hanabi || etat.tilt) {
    return;
  }
  const m = missionCourante();
  if (m.id !== id) {
    return;
  }
  etat.progres += quantite || 1;
  if (etat.progres >= m.but(etat.niveau)) {
    missionReussie();
  }
}

function missionReussie() {
  const m = missionCourante();
  etat.faites[etat.mission] = true;
  points(40000, 188, 520, C.lime);
  effets.eclater(...pointEcran(188, 520), [C.lime, C.or, C.rougeClair, C.creme], 40, 220);
  jouer("vie");
  const restantes = etat.faites.filter(f => !f).length;
  // Toutes les trois missions, une bille en plus
  if (restantes === 3) {
    etat.billesEnPlus++;
    annoncer(m.nom + " réussi", "Bille en plus !", 2.6, C.lime);
  } else {
    annoncer(m.nom + " réussi", restantes ? restantes + " mission" + (restantes > 1 ? "s" : "") + " avant Hanabi" : "", 2.4, C.lime);
  }
  if (restantes === 0) {
    lancerHanabi();
    return;
  }
  // Mission suivante : la prochaine pas encore faite
  let i = etat.mission;
  do {
    i = (i + 1) % MISSIONS.length;
  } while (etat.faites[i]);
  etat.mission = i;
  etat.progres = 0;
}

function lancerHanabi() {
  etat.hanabi = true;
  etat.jackpot = true;
  annoncer("Hanabi", "Multibille ! Le jackpot est sur la rampe", 3.2, C.or);
  jouer("vague");
  lancerMultibille(3);
}

function finirHanabi() {
  etat.hanabi = false;
  etat.jackpot = false;
  etat.niveau++;
  etat.faites = etat.faites.map(() => false);
  etat.mission = 0;
  etat.progres = 0;
  annoncer("Niveau " + etat.niveau, "Les missions reprennent, plus dures", 2.8, C.lime);
  jouer("pouvoir");
  majHud();
}

function lancerMultibille(total) {
  const enJeu = etat.billes.filter(b => !b.dansLanceur).length;
  for (let i = enJeu; i < total; i++) {
    // Les billes sortent du sanctuaire l'une apres l'autre
    setTimeout(() => {
      if (etat !== null && !etat.termine) {
        etat.billes.push(nouvelleBille(SANCTUAIRE.x + 6, SANCTUAIRE.y + 14, 160 + Math.random() * 120, 260));
        jouer("tir");
      }
    }, 450 * (i - enJeu));
  }
  etat.sauvetage = Math.max(etat.sauvetage, 12);
}

function dureeSauvetage() {
  return Math.max(4, 11 - etat.niveau);
}

// ---------------------------------------------------------------------
// Physique
// ---------------------------------------------------------------------

function plusProche(px, py, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  let t = l2 === 0 ? 0 : ((px - a[0]) * dx + (py - a[1]) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return { x: a[0] + dx * t, y: a[1] + dy * t, t };
}

// Choc contre une surface immobile ; renvoie la vitesse normale d'impact
function choc(b, qx, qy, rayon, rebond, frottement) {
  let nx = b.x - qx;
  let ny = b.y - qy;
  let d = Math.hypot(nx, ny);
  const limite = R + rayon;
  if (d >= limite) {
    return null;
  }
  if (d < 1e-6) {
    nx = 0;
    ny = -1;
    d = 1;
  }
  nx /= d;
  ny /= d;
  b.x += nx * (limite - d);
  b.y += ny * (limite - d);
  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) {
    const f = frottement === undefined ? 0.01 : frottement;
    const tx = b.vx - vn * nx;
    const ty = b.vy - vn * ny;
    b.vx = tx * (1 - f) - rebond * vn * nx;
    b.vy = ty * (1 - f) - rebond * vn * ny;
  }
  return { nx, ny, vn };
}

function chocSegment(b, s) {
  const q = plusProche(b.x, b.y, s.a, s.b);
  return choc(b, q.x, q.y, 0, s.rebond);
}

// Portillon : ne bloque que la bille qui arrive par le dessus
function chocPortillon(b, p) {
  const dx = p.b[0] - p.a[0];
  const dy = p.b[1] - p.a[1];
  // Normale cote haut
  let nx = dy;
  let ny = -dx;
  if (ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  const l = Math.hypot(nx, ny);
  nx /= l;
  ny /= l;
  const cote = (b.x - p.a[0]) * nx + (b.y - p.a[1]) * ny;
  const avant = (b.px - p.a[0]) * nx + (b.py - p.a[1]) * ny;
  if (cote < 0 || avant < 0) {
    return;
  }
  chocSegment(b, { a: p.a, b: p.b, rebond: 0.25 });
}

function bout(f) {
  return [f.pivot.x + Math.cos(f.angle) * FLIP.longueur, f.pivot.y + Math.sin(f.angle) * FLIP.longueur];
}

function chocFlipper(b, f) {
  const a = [f.pivot.x, f.pivot.y];
  const q = plusProche(b.x, b.y, a, bout(f));
  const rayon = FLIP.rayonPivot + (FLIP.rayonBout - FLIP.rayonPivot) * q.t;
  let nx = b.x - q.x;
  let ny = b.y - q.y;
  let d = Math.hypot(nx, ny);
  const limite = R + rayon;
  if (d >= limite) {
    return;
  }
  if (d < 1e-6) {
    nx = 0;
    ny = -1;
    d = 1;
  }
  nx /= d;
  ny /= d;
  b.x += nx * (limite - d);
  b.y += ny * (limite - d);
  // Vitesse de la surface du flipper au point de contact
  const sx = -f.w * (q.y - f.pivot.y);
  const sy = f.w * (q.x - f.pivot.x);
  const rx = b.vx - sx;
  const ry = b.vy - sy;
  const vn = rx * nx + ry * ny;
  if (vn < 0) {
    const tx = rx - vn * nx;
    const ty = ry - vn * ny;
    b.vx = sx + tx * 0.985 - FLIP.rebond * vn * nx;
    b.vy = sy + ty * 0.985 - FLIP.rebond * vn * ny;
  }
}

function majFlippers(h) {
  etat.flippers.forEach(f => {
    const actif = (f.gauche ? commandes.gauche : commandes.droite) && !etat.tilt && !etat.termine;
    const cible = actif ? f.leve : f.repos;
    const sens = Math.sign(cible - f.angle);
    if (Math.abs(cible - f.angle) < 1e-4) {
      f.w = 0;
      return;
    }
    const vitesse = actif ? FLIP.vitesse : FLIP.retour;
    f.w = sens * vitesse;
    const suivant = f.angle + f.w * h;
    if ((sens > 0 && suivant >= cible) || (sens < 0 && suivant <= cible)) {
      f.angle = cible;
      f.w = 0;
    } else {
      f.angle = suivant;
    }
  });
}

function pas(h) {
  majFlippers(h);
  const s = etat.spinner;
  s.angle += s.w * h;
  s.w *= 1 - 1.6 * h;
  s.accu += Math.abs(s.w) * h;
  while (s.accu > Math.PI) {
    s.accu -= Math.PI;
    points(150, SPINNER.x, SPINNER.y, C.or);
    jouer("grain");
  }

  etat.billes.forEach(b => {
    if (b.rampe !== null || b.capturee) {
      return;
    }
    if (b.dansLanceur) {
      b.x = BILLE_LANCEUR.x;
      b.y = BILLE_LANCEUR.y;
      b.vx = b.vy = 0;
      return;
    }
    b.px = b.x;
    b.py = b.y;
    b.vy += GRAVITE * h;
    const v = Math.hypot(b.vx, b.vy);
    if (v > VITESSE_MAX) {
      b.vx *= VITESSE_MAX / v;
      b.vy *= VITESSE_MAX / v;
    }
    b.x += b.vx * h;
    b.y += b.vy * h;
    collisions(b);
  });

  // Billes entre elles
  const libres = etat.billes.filter(b => b.rampe === null && !b.dansLanceur && !b.capturee);
  for (let i = 0; i < libres.length; i++) {
    for (let j = i + 1; j < libres.length; j++) {
      const a = libres[i];
      const c = libres[j];
      const dx = c.x - a.x;
      const dy = c.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d > 0 && d < R * 2) {
        const nx = dx / d;
        const ny = dy / d;
        const recouvre = (R * 2 - d) / 2;
        a.x -= nx * recouvre;
        a.y -= ny * recouvre;
        c.x += nx * recouvre;
        c.y += ny * recouvre;
        const vr = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
        if (vr < 0) {
          a.vx += vr * nx * 0.95;
          a.vy += vr * ny * 0.95;
          c.vx -= vr * nx * 0.95;
          c.vy -= vr * ny * 0.95;
        }
      }
    }
  }
}

function collisions(b) {
  MURS.forEach(s => {
    const c = chocSegment(b, s);
    if (c && s.sling && c.vn < -40) {
      // Le lance-pierre renvoie la bille
      b.vx += c.nx * KICK_SLING;
      b.vy += c.ny * KICK_SLING;
      etat.slings[s.sling] = 0.14;
      points(110, b.x, b.y);
      jouer("sling");
    }
  });
  POSTES.forEach(p => choc(b, p.x, p.y, p.r, 0.55));
  chocPortillon(b, PORTE_ORBITE);
  chocPortillon(b, PORTE_LANCEUR);

  // Tambours
  BUMPERS.forEach((t, i) => {
    const c = choc(b, t.x, t.y, BUMPER.rayon, 0.5);
    if (c) {
      b.vx = c.nx * BUMPER.ejection + b.vx * 0.2;
      b.vy = c.ny * BUMPER.ejection + b.vy * 0.2;
      etat.bumpers[i] = 0.16;
      points(etat.couloirs.every(x => x) ? 300 : 100, t.x, t.y - 26, C.or);
      avancerMission("taiko");
      jouer("bumper");
    }
  });

  // Masques (cibles tombantes)
  MASQUES.forEach((m, i) => {
    if (!etat.masques[i]) {
      return;
    }
    const c = chocSegment(b, { a: [m.x - m.demi, m.y], b: [m.x + m.demi, m.y], rebond: 0.45 });
    if (c && c.vn < -60) {
      etat.masques[i] = false;
      points(750, m.x, m.y + 4, C.rougeClair);
      effets.eclater(...pointEcran(m.x, m.y), [C.rouge, C.creme], 10, 110);
      jouer("croque");
      if (etat.masques.every(x => !x)) {
        avancerMission("masques");
        points(5000, 188, 430, C.lime);
        etat.sanctuaireAllume = true;
        annoncer("Masques tombés", "Le sanctuaire est ouvert : verrou", 2, C.rougeClair);
        etat.reposeMasques = 2.2;
      }
    }
  });

  // Cibles du kickback
  CIBLES.forEach((t, i) => {
    const c = chocSegment(b, { a: [t.x, t.y - t.demi], b: [t.x, t.y + t.demi], rebond: 0.5 });
    if (c && c.vn < -50) {
      if (!etat.cibles[i]) {
        etat.cibles[i] = true;
        points(500, t.x - 14, t.y);
        jouer("cible");
        if (etat.cibles.every(x => x)) {
          etat.kickback = true;
          etat.cibles = [false, false, false];
          points(3000, t.x - 30, t.y);
          annoncer("Kickback armé", "La sortie gauche est protégée", 1.8, C.bleu);
        }
      } else {
        points(100, t.x - 14, t.y);
      }
    }
  });

  // Flippers
  etat.flippers.forEach(f => chocFlipper(b, f));

  capteurs(b);
}

function croise(b, a, c) {
  // La bille a-t-elle franchi le segment [a, c] pendant ce pas ?
  const d1 = (c[0] - a[0]) * (b.py - a[1]) - (c[1] - a[1]) * (b.px - a[0]);
  const d2 = (c[0] - a[0]) * (b.y - a[1]) - (c[1] - a[1]) * (b.x - a[0]);
  if (Math.sign(d1) === Math.sign(d2)) {
    return false;
  }
  const minX = Math.min(a[0], c[0]) - R;
  const maxX = Math.max(a[0], c[0]) + R;
  return b.x >= minX && b.x <= maxX;
}

function capteurs(b) {
  // Couloirs du haut
  if (b.y > 92 && b.y < 120 && b.vy > 0) {
    COULOIRS_HAUT.forEach((x, i) => {
      if (Math.abs(b.x - x) < 14 && b.dernierCouloir !== i) {
        b.dernierCouloir = i;
        passageCouloir(i);
      }
    });
  }
  if (b.y > 140) {
    b.dernierCouloir = -1;
  }

  // Spinner dans le couloir d'orbite
  if (b.x < 44 && croise(b, [14, SPINNER.y], [44, SPINNER.y])) {
    etat.spinner.w = Math.sign(-b.vy || 1) * Math.min(60, Math.abs(b.vy) / 14);
    if (b.vy < 0) {
      b.montee = true;
    }
  }
  // Orbite : la bille montee par la gauche redescend par le portillon droit
  if (b.montee && b.x > 340 && b.y < 260) {
    b.montee = false;
    points(2500, 330, 270, C.bleu);
    avancerMission("orbite");
    jouer("combo", 3);
  }
  if (b.y > 470) {
    b.montee = false;
  }

  // Rampe
  if (croise(b, BOUCHE_RAMPE.seuil[0], BOUCHE_RAMPE.seuil[1]) && b.vy < 0) {
    if (Math.hypot(b.vx, b.vy) > 360) {
      b.rampe = { i: 0, t: 0, vitesse: Math.max(520, Math.hypot(b.vx, b.vy) * 0.75) };
      jouer("rampe");
    } else {
      // Trop lente : elle retombe de la bouche
      chocSegment(b, { a: BOUCHE_RAMPE.seuil[0], b: BOUCHE_RAMPE.seuil[1], rebond: 0.2 });
    }
  }

  // Sanctuaire
  if (!b.capturee && Math.hypot(b.x - SANCTUAIRE.x, b.y - SANCTUAIRE.y) < 9 && Math.hypot(b.vx, b.vy) < 650) {
    b.capturee = true;
    b.x = SANCTUAIRE.x;
    b.y = SANCTUAIRE.y;
    b.vx = b.vy = 0;
    etat.capture = { bille: b, reste: 1.2 };
    sanctuaire(b);
  }

  // Kickback dans la sortie gauche
  if (b.x < 40 && b.y > 600 && b.vy > 0 && etat.kickback && !etat.tilt) {
    etat.kickback = false;
    b.vx = 0;
    b.vy = -1250;
    points(500, 30, 600, C.bleu);
    annoncer("Kickback", "", 1, C.bleu);
    jouer("tir");
    effets.secouer(3, 0.15);
  }
}

function passageCouloir(i) {
  if (etat.tilt) {
    return;
  }
  // Tir d'adresse : le couloir clignotant au premier passage apres le lancer
  if (etat.skillActif) {
    etat.skillActif = false;
    if (i === etat.skill) {
      points(25000, COULOIRS_HAUT[i], 130, C.lime);
      annoncer("Tir d'adresse", "", 1.6, C.lime);
      jouer("pouvoir");
    }
  }
  points(etat.couloirs[i] ? 200 : 1000, COULOIRS_HAUT[i], 130);
  etat.couloirs[i] = true;
  jouer("grain");
  if (etat.couloirs.every(x => x)) {
    etat.couloirs = [false, false, false];
    etat.multBonus = Math.min(10, etat.multBonus + 1);
    points(5000, 188, 150, C.lime);
    annoncer("Bonus x" + etat.multBonus, "Tambours en or pour un temps", 1.8, C.or);
    avancerMission("couloirs");
  }
}

function sanctuaire(b) {
  jouer("croque");
  points(3000, SANCTUAIRE.x, SANCTUAIRE.y - 16, C.or);
  avancerMission("sanctuaire");
  if (etat.sanctuaireAllume && !etat.hanabi) {
    etat.sanctuaireAllume = false;
    etat.verrous++;
    if (etat.verrous >= 2) {
      etat.verrous = 0;
      annoncer("Multibille", "Trois billes en jeu", 2.4, C.or);
      jouer("vague");
      etat.capture.multi = true;
    } else {
      annoncer("Bille verrouillée", "Encore un verrou pour la multibille", 2, C.or);
      // La bille reste au chaud, une nouvelle arrive au lanceur
      etat.capture.verrou = true;
    }
  }
}

function majRampe(b, dt) {
  const r = b.rampe;
  let reste = r.vitesse * dt;
  while (reste > 0 && r.i < CHEMIN_RAMPE.length - 1) {
    const a = CHEMIN_RAMPE[r.i];
    const c = CHEMIN_RAMPE[r.i + 1];
    const long = Math.hypot(c[0] - a[0], c[1] - a[1]);
    const dispo = long * (1 - r.t);
    if (reste < dispo) {
      r.t += reste / long;
      reste = 0;
    } else {
      reste -= dispo;
      r.i++;
      r.t = 0;
    }
  }
  r.vitesse = Math.max(380, r.vitesse - 120 * dt);
  if (r.i >= CHEMIN_RAMPE.length - 1) {
    const fin = CHEMIN_RAMPE[CHEMIN_RAMPE.length - 1];
    b.x = fin[0];
    b.y = fin[1];
    b.px = b.x;
    b.py = b.y - 2;
    b.vx = 0;
    b.vy = 240;
    b.rampe = null;
    rampeReussie();
    return;
  }
  const a = CHEMIN_RAMPE[r.i];
  const c = CHEMIN_RAMPE[r.i + 1];
  b.x = a[0] + (c[0] - a[0]) * r.t;
  b.y = a[1] + (c[1] - a[1]) * r.t;
}

function rampeReussie() {
  if (etat.jackpot) {
    points(250000, 188, 160, C.or);
    annoncer("Jackpot", "", 2, C.or);
    effets.eclater(...pointEcran(188, 160), [C.or, C.creme, C.rougeClair], 50, 260);
    jouer("vie");
    effets.secouer(4, 0.25);
    return;
  }
  points(4000, 300, 180, C.lime);
  avancerMission("rampe");
  jouer("bonus");
}

// ---------------------------------------------------------------------
// Boucle
// ---------------------------------------------------------------------

function maj(dt) {
  effets.maj(dt);
  if (etat === null || etat.pause) {
    return;
  }
  etat.clignote += dt;
  if (etat.message) {
    etat.message.reste -= dt;
    if (etat.message.reste <= 0) {
      etat.message = null;
    }
  }
  etat.bumpers = etat.bumpers.map(v => Math.max(0, v - dt));
  etat.slings.g = Math.max(0, etat.slings.g - dt);
  etat.slings.d = Math.max(0, etat.slings.d - dt);
  etat.secousses = Math.max(0, etat.secousses - TILT.oubli * dt);
  if (etat.sauvetage > 0) {
    etat.sauvetage -= dt;
  }

  if (etat.termine) {
    return;
  }

  // Le ressort se tend tant qu'on tient
  const enAttente = etat.billes.find(b => b.dansLanceur);
  // Sans bille en jeu, n'importe quel bouton de flipper arme aussi le ressort
  const seule = enAttente && !etat.billes.some(b => !b.dansLanceur);
  const tenu = commandes.lanceur || (seule && (commandes.gauche || commandes.droite));
  if (enAttente && tenu) {
    etat.charge = Math.min(1, etat.charge + dt / LANCEUR.charge);
  } else if (enAttente && etat.charge > 0) {
    enAttente.dansLanceur = false;
    enAttente.vy = -(LANCEUR.min + (LANCEUR.max - LANCEUR.min) * etat.charge);
    enAttente.vx = 0;
    etat.charge = 0;
    etat.sauvetage = Math.max(etat.sauvetage, dureeSauvetage());
    jouer("ressort");
  }

  // Masques qui se relevent
  if (etat.reposeMasques > 0) {
    etat.reposeMasques -= dt;
    if (etat.reposeMasques <= 0) {
      const dessus = etat.billes.some(b => Math.abs(b.y - 404) < 16 && b.x > 140 && b.x < 236);
      if (dessus) {
        etat.reposeMasques = 0.3;
      } else {
        etat.masques = [true, true, true];
      }
    }
  }

  // Sanctuaire : il garde la bille un instant puis la recrache
  if (etat.capture) {
    etat.capture.reste -= dt;
    if (etat.capture.reste <= 0) {
      const cap = etat.capture;
      etat.capture = null;
      if (cap.verrou) {
        etat.billes = etat.billes.filter(b => b !== cap.bille);
        if (!etat.billes.some(b => !b.capturee)) {
          billeAuLanceur();
        }
      } else {
        cap.bille.capturee = false;
        cap.bille.x = SANCTUAIRE.x + 6;
        cap.bille.y = SANCTUAIRE.y + 14;
        cap.bille.vx = 180 + Math.random() * 80;
        cap.bille.vy = 220;
        jouer("tir");
        if (cap.multi) {
          lancerMultibille(3);
        }
      }
    }
  }

  etat.billes.forEach(b => {
    if (b.rampe !== null) {
      majRampe(b, dt);
    }
  });

  accumulateur += dt;
  while (accumulateur >= PAS) {
    pas(PAS);
    accumulateur -= PAS;
  }

  // Une bille immobile hors du lanceur : la table la secoue doucement
  etat.billes.forEach(b => {
    if (b.dansLanceur || b.rampe !== null || b.capturee) {
      b.immobile = 0;
      return;
    }
    const tenueParFlipper = b.y > 600 && (commandes.gauche || commandes.droite);
    if (Math.hypot(b.vx, b.vy) < 25 && !tenueParFlipper) {
      b.immobile = (b.immobile || 0) + dt;
      if (b.immobile > 3) {
        b.immobile = 0;
        b.vx += (Math.random() - 0.5) * 300;
        b.vy -= 260;
      }
    } else {
      b.immobile = 0;
    }
  });

  // Billes perdues
  const avant = etat.billes.length;
  etat.billes = etat.billes.filter(b => b.y < H_TABLE + 24);
  const perdues = avant - etat.billes.length;
  if (perdues > 0) {
    billesPerdues(perdues);
  }
}

function billesPerdues(n) {
  const restantes = etat.billes.filter(b => !b.dansLanceur);
  // Sauvetage : la bille revient au lanceur
  if (etat.sauvetage > 0 && !etat.tilt) {
    for (let i = 0; i < n; i++) {
      if (!etat.billes.some(b => b.dansLanceur)) {
        billeAuLanceur();
        etat.skillActif = false;
      } else {
        etat.billes.push(nouvelleBille(SANCTUAIRE.x + 6, SANCTUAIRE.y + 14, 200, 240));
      }
    }
    annoncer("Bille sauvée", "", 1.2, C.bleu);
    jouer("bonus");
    return;
  }
  const libres = restantes.length + (etat.capture ? 1 : 0);
  if (libres >= 1) {
    if (libres === 1 && etat.hanabi) {
      finirHanabi();
    }
    return;
  }
  if (etat.hanabi) {
    finirHanabi();
  }
  finDeBille();
}

function finDeBille() {
  jouer("mort");
  effets.secouer(4, 0.3);
  const bonus = etat.tilt ? 0 : etat.bonus * etat.multBonus;
  if (bonus > 0) {
    etat.score += bonus;
  }
  annoncer(etat.tilt ? "Tilt" : "Bonus " + bonus.toLocaleString("fr-BE"), etat.tilt ? "Pas de bonus" : "x" + etat.multBonus, 2, etat.tilt ? C.rougeClair : C.creme);
  etat.bonus = 0;
  etat.multBonus = 1;
  etat.tilt = false;
  etat.secousses = 0;
  etat.verrous = 0;
  majHud();
  if (etat.billesEnPlus > 0) {
    etat.billesEnPlus--;
    setTimeout(() => {
      if (etat && !etat.termine) {
        annoncer("Bille en plus", "Rejoue !", 1.6, C.lime);
        billeAuLanceur();
      }
    }, 1400);
    return;
  }
  if (etat.bille >= BILLES) {
    etat.termine = true;
    setTimeout(() => {
      if (etat && etat.termine && !zone.hidden) {
        finDePartie(ID, etat.score);
      }
    }, 2200);
    return;
  }
  etat.bille++;
  majHud();
  setTimeout(() => {
    if (etat && !etat.termine) {
      annoncer("Bille " + etat.bille, missionCourante().aide, 2, C.creme);
      billeAuLanceur();
    }
  }, 1400);
}

function secouer() {
  if (etat === null || etat.termine || etat.tilt) {
    return;
  }
  etat.billes.forEach(b => {
    if (!b.dansLanceur && b.rampe === null && !b.capturee) {
      b.vx += (Math.random() < 0.5 ? -1 : 1) * TILT.force * 0.5;
      b.vy -= TILT.force;
    }
  });
  effets.secouer(3, 0.12);
  etat.secousses += 1;
  if (etat.secousses > TILT.seuil) {
    etat.tilt = true;
    annoncer("Tilt", "Flippers coupés", 2.4, C.rougeClair);
    jouer("mort");
  } else if (etat.secousses > TILT.seuil - 1) {
    annoncer("Attention", "Encore une secousse et c'est le tilt", 1.2, C.or);
  }
}

// ---------------------------------------------------------------------
// Dessin en perspective, facon table de Windows XP
//  La physique vit dans un plan vu de dessus (400 x 720). A l'affichage,
//  ce plan est incline : le haut de la table s'eloigne et retrecit.
//  - le decor plat est peint une fois puis projete ligne par ligne ;
//  - les rails, poteaux, tambours, flippers ont une hauteur : on les
//    dessine en volume par-dessus, du fond vers l'avant ;
//  - chaque petit objet est dessine avec une transformation affine qui
//    epouse la perspective a l'endroit ou il se trouve.
// ---------------------------------------------------------------------

const CX = 201;                      // axe de la table
const PERSP = { k: 0.00054, b: 1, hz: 0.82 };
const VUE_TABLE_H = 534;             // hauteur de la table projetee
const PANNEAU_L = 250;               // panneau lateral (grand ecran)
const PANNEAU_H = 96;                // panneau du haut (telephone)

let vue = { mode: "cote", VW: L + PANNEAU_L, VH: VUE_TABLE_H, ox: 0, oy: 0, ybas: VUE_TABLE_H - 8 };
let plat = null;                     // decor plat, vu de dessus
let decor = null;                    // decor projete, avec ses volumes fixes

function sOf(y) {
  return 1 / (1 + PERSP.k * (H_TABLE - y));
}

// Point de la table (z = hauteur) vers l'ecran, en unites de vue
function proj(x, y, z) {
  const s = sOf(y);
  const t = H_TABLE - y;
  return [vue.ox + CX + (x - CX) * s, vue.oy + vue.ybas - PERSP.b * t * s - (z || 0) * s * PERSP.hz];
}

function ecran(x, y) {
  return proj(x, y, 0);
}

// Transformation affine locale : on dessine "vu de dessus" autour de
// (x, y), et la perspective est respectee a cet endroit
function local(c, x, y, z) {
  const s = sOf(y);
  const [X, Y] = proj(x, y, z || 0);
  const cc = (x - CX) * PERSP.k * s * s;
  const d = PERSP.b * s * s;
  c.setTransform(echelle * s, 0, echelle * cc, echelle * d, echelle * (X - s * x - cc * y), echelle * (Y - d * y));
}

function vueNormale(c) {
  c.setTransform(echelle, 0, 0, echelle, 0, 0);
}

function tracer(c, points, ferme) {
  c.beginPath();
  points.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
  if (ferme) {
    c.closePath();
  }
}

function degrade(c, x0, y0, x1, y1, arrets) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  arrets.forEach(([o, col]) => g.addColorStop(o, col));
  return g;
}

// ---------------------------------------------------------------------
// Le decor plat : tout ce qui est peint sur le bois de la table
// ---------------------------------------------------------------------

const CONTOUR = [[14, 740], [14, 196], ...arcSegments(ARCHE.x, ARCHE.y, ARCHE.r, Math.PI, Math.PI * 2, 60).slice(1), [388, 740]];

function feuArtifice(c, x, y, r, couleurs) {
  // Gerbe plate : des rayons de longueurs inegales et des points au bout
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const l = r * (i % 2 ? 0.62 : 1);
    c.strokeStyle = couleurs[i % couleurs.length];
    c.lineWidth = i % 2 ? 1.5 : 2.5;
    c.beginPath();
    c.moveTo(x + Math.cos(a) * r * 0.22, y + Math.sin(a) * r * 0.22);
    c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    c.stroke();
    c.fillStyle = couleurs[(i + 1) % couleurs.length];
    c.beginPath();
    c.arc(x + Math.cos(a) * (l + 3), y + Math.sin(a) * (l + 3), i % 2 ? 1.2 : 2, 0, Math.PI * 2);
    c.fill();
  }
}

function lanterneDecor(c, x, y, t, couleur) {
  c.fillStyle = "#1a1626";
  c.fillRect(x - 0.5, y - t * 1.5, 1, t * 0.6);
  c.fillStyle = couleur;
  c.beginPath();
  c.ellipse(x, y, t * 0.72, t, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "rgba(255,255,255,0.18)";
  c.beginPath();
  c.ellipse(x - t * 0.25, y - t * 0.2, t * 0.2, t * 0.55, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#1a1626";
  c.fillRect(x - t * 0.5, y - t - 1, t, 2);
  c.fillRect(x - t * 0.5, y + t - 1, t, 2);
  c.strokeStyle = "rgba(0,0,0,0.35)";
  c.lineWidth = 0.6;
  for (let k = -1; k <= 1; k++) {
    c.beginPath();
    c.ellipse(x, y, t * 0.72 * Math.abs(k * 0.6 + (k ? 0 : 0.01)), t, 0, -Math.PI / 2, Math.PI / 2);
    c.stroke();
  }
}

function etiquette(c, texte, x, y, taille, couleur, angle) {
  c.save();
  c.translate(x, y);
  if (angle) {
    c.rotate(angle);
  }
  c.font = "800 " + taille + "px 'Anybody', sans-serif";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillStyle = couleur;
  c.fillText(texte, 0, 0);
  c.restore();
}

function peindrePlat(e) {
  const off = document.createElement("canvas");
  off.width = Math.round(L * e);
  off.height = Math.round(H_TABLE * e);
  const c = off.getContext("2d");
  c.setTransform(e, 0, 0, e, 0, 0);
  c.fillStyle = C.encre;
  c.fillRect(0, 0, L, H_TABLE);

  c.save();
  tracer(c, CONTOUR, true);
  c.clip();

  // Ciel de nuit : du bleu nuit en haut vers le violet du festival en bas
  c.fillStyle = degrade(c, 0, 0, 0, H_TABLE, [[0, "#141634"], [0.45, "#1d1840"], [1, "#2a1838"]]);
  c.fillRect(0, 0, L, H_TABLE);

  // Feux d'artifice peints, en aplats
  feuArtifice(c, 86, 120, 34, [C.or, C.rougeClair]);
  feuArtifice(c, 320, 300, 26, [C.bleu, C.creme]);
  feuArtifice(c, 300, 92, 18, [C.lime, C.or]);

  // Lune et nuage
  c.fillStyle = C.lune;
  c.beginPath();
  c.arc(318, 160, 26, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#d6caa9";
  c.beginPath();
  c.arc(326, 152, 6, 0, Math.PI * 2);
  c.arc(310, 170, 4, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#2b2550";
  c.beginPath();
  c.ellipse(300, 182, 34, 7, 0, 0, Math.PI * 2);
  c.ellipse(332, 176, 22, 6, 0, 0, Math.PI * 2);
  c.fill();

  // Le grand torii derriere les tambours
  c.fillStyle = "#5c1d24";
  c.fillRect(108, 186, 160, 12);
  c.fillRect(100, 180, 176, 7);
  c.fillRect(120, 206, 136, 7);
  c.fillRect(130, 186, 12, 150);
  c.fillRect(234, 186, 12, 150);
  c.fillStyle = "#3e1419";
  c.fillRect(130, 306, 12, 30);
  c.fillRect(234, 306, 12, 30);
  c.fillStyle = "#7a2a2c";
  c.fillRect(100, 180, 176, 2);

  // Montagnes et collines du bas
  c.fillStyle = "#231d45";
  tracer(c, [[14, 470], [80, 420], [130, 402], [188, 380], [246, 402], [300, 420], [362, 470], [362, 740], [14, 740]], true);
  c.fill();
  c.fillStyle = "#3b3368";
  tracer(c, [[150, 394], [188, 380], [226, 394], [212, 400], [198, 394], [188, 402], [176, 394], [164, 400]], true);
  c.fill();
  c.fillStyle = "#2c2150";
  tracer(c, [[14, 560], [120, 520], [188, 512], [256, 520], [362, 560], [362, 740], [14, 740]], true);
  c.fill();

  // Guirlande de lanternes en travers de la table
  c.strokeStyle = "#0f0d1e";
  c.lineWidth = 1.2;
  c.beginPath();
  c.moveTo(46, 236);
  c.quadraticCurveTo(116, 266, 188, 246);
  c.quadraticCurveTo(260, 266, 334, 236);
  c.stroke();
  [[64, 244], [88, 252], [112, 256], [140, 254], [164, 250], [212, 250], [236, 254], [264, 256], [288, 252], [312, 244]].forEach((p, i) => {
    lanterneDecor(c, p[0], p[1] + 8, 5.5, [C.rouge, C.or, C.rougeClair][i % 3]);
  });

  // Blason des missions : grand disque peint
  c.fillStyle = "#16122e";
  c.beginPath();
  c.arc(188, 528, 62, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = C.or;
  c.lineWidth = 2;
  c.beginPath();
  c.arc(188, 528, 62, 0, Math.PI * 2);
  c.stroke();
  c.strokeStyle = "#3a3060";
  c.lineWidth = 1;
  c.beginPath();
  c.arc(188, 528, 56, 0, Math.PI * 2);
  c.stroke();
  c.beginPath();
  c.arc(188, 528, 24, 0, Math.PI * 2);
  c.stroke();

  // Couloirs : sol plus sombre, fleches de direction
  c.fillStyle = "#0f0c22";
  c.fillRect(14, 258, 30, 214);         // orbite
  c.fillRect(362, 196, 26, 544);        // lanceur
  c.fillRect(14, 472, 26, 268);         // sortie gauche
  c.fillRect(336, 472, 26, 268);        // sortie droite
  tracer(c, [[40, 472], [64, 500], [64, 566], [104, 592], [119.8, 623.2], [40, 590]], true);
  c.fill();
  tracer(c, [[336, 472], [312, 500], [312, 566], [272, 592], [256.2, 623.2], [336, 590]], true);
  c.fill();

  // Bouche de rampe
  c.fillStyle = "#1d2a14";
  tracer(c, [BOUCHE_RAMPE.g[0], BOUCHE_RAMPE.g[1], BOUCHE_RAMPE.d[1], BOUCHE_RAMPE.d[0]], true);
  c.fill();

  // Textes peints, comme les inscriptions d'une vraie table
  etiquette(c, "ORBITE", 29, 380, 8, "#5b6fb0", -Math.PI / 2);
  etiquette(c, "LANCEUR", 375, 600, 7, "#4a4470", -Math.PI / 2);
  etiquette(c, "SORTIE", 27, 650, 6, "#4a4470", -Math.PI / 2);
  etiquette(c, "SORTIE", 349, 650, 6, "#4a4470", -Math.PI / 2);
  etiquette(c, "RAMPE", 300, 372, 7, C.limeSombre, -1.15);
  etiquette(c, "VERROU", 96, 330, 6, C.orSombre);
  etiquette(c, "KICKBACK", 351, 430, 6, C.bleuSombre, -Math.PI / 2);
  ["MA", "TSU", "RI"].forEach((t, i) => etiquette(c, t, COULOIRS_HAUT[i], 136, 7, "#8a80c0"));
  etiquette(c, "SAUVETAGE", 188, 690, 6, "#5a5480");

  // Mots du festival en grand au bas de la table
  c.font = "700 30px 'Shippori Mincho B1', serif";
  c.textAlign = "center";
  c.fillStyle = "#3d2d60";
  c.fillText("祭", 76, 650);
  c.fillText("り", 300, 650);
  c.restore();

  // Tablier
  c.fillStyle = degrade(c, 0, 700, 0, 720, [[0, "#d9ccb2"], [1, "#a69a80"]]);
  tracer(c, [[14, 702], [150, 702], [162, 724], [214, 724], [226, 702], [388, 702], [388, 740], [14, 740]], true);
  c.fill();
  c.fillStyle = C.rouge;
  c.fillRect(20, 706, 100, 10);
  c.fillStyle = C.creme;
  c.font = "800 8px 'Anybody', sans-serif";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText("TANUKI ARCADE", 70, 711.5);
  c.fillStyle = "#3a2e22";
  c.fillText("3 BILLES", 300, 711.5);

  // Sanctuaire : trou noir cercle d'or
  c.fillStyle = "#050508";
  c.beginPath();
  c.arc(SANCTUAIRE.x, SANCTUAIRE.y, SANCTUAIRE.r + 1, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = C.or;
  c.lineWidth = 2.5;
  c.stroke();
  return off;
}

// Projection ligne par ligne du decor plat
function projeterPlat(c) {
  const e = plat.width / L;
  const haut = proj(CX, -6)[1];
  const bas = proj(CX, H_TABLE + 20)[1];
  const pasLigne = 1 / echelle;
  for (let Y = haut; Y <= bas; Y += pasLigne) {
    const u = (vue.oy + vue.ybas - Y) / PERSP.b;
    const t = u / (1 - PERSP.k * u);
    const y = H_TABLE - t;
    if (y < -6 || y > H_TABLE + 20) {
      continue;
    }
    const s = sOf(y);
    const hauteurSource = Math.max(1, (pasLigne / (PERSP.b * s * s)) * e);
    const x0 = vue.ox + CX - CX * s;
    c.drawImage(plat, 0, Math.max(0, y * e), plat.width, hauteurSource, x0 * echelle, Y * echelle, L * s * echelle, Math.ceil(echelle) + 0.5);
  }
}

// Un mur en relief : face avant sombre, dessus clair
function murRelief(c, points, h, dessus, face, epaisseur) {
  vueNormale(c);
  for (let i = 0; i < points.length - 1; i++) {
    const p = points[i];
    const q = points[i + 1];
    const a0 = proj(p[0], p[1], 0);
    const b0 = proj(q[0], q[1], 0);
    const a1 = proj(p[0], p[1], h);
    const b1 = proj(q[0], q[1], h);
    c.fillStyle = face;
    tracer(c, [a0, b0, b1, a1], true);
    c.fill();
  }
  c.lineCap = "round";
  c.lineJoin = "round";
  c.strokeStyle = dessus;
  c.lineWidth = epaisseur;
  tracer(c, points.map(p => proj(p[0], p[1], h)));
  c.stroke();
  c.strokeStyle = "rgba(255,255,255,0.55)";
  c.lineWidth = Math.max(0.8, epaisseur * 0.3);
  tracer(c, points.map(p => {
    const r = proj(p[0], p[1], h);
    return [r[0], r[1] - epaisseur * 0.25];
  }));
  c.stroke();
}

// Cylindre (poteau, tambour) : jupe, puis couvercle
function cylindre(c, x, y, r, h, jupe, couvercle, liseré) {
  const s = sOf(y);
  const rx = r * s;
  const ry = r * PERSP.b * s * s;
  const [bx, by] = proj(x, y, 0);
  const [tx, ty] = proj(x, y, h);
  vueNormale(c);
  c.fillStyle = jupe;
  c.beginPath();
  c.ellipse(bx, by, rx, ry, 0, 0, Math.PI);
  c.lineTo(tx - rx, ty);
  c.ellipse(tx, ty, rx, ry, 0, Math.PI, 0, true);
  c.closePath();
  c.fill();
  c.fillStyle = couvercle;
  c.beginPath();
  c.ellipse(tx, ty, rx, ry, 0, 0, Math.PI * 2);
  c.fill();
  if (liseré) {
    c.strokeStyle = liseré;
    c.lineWidth = 1;
    c.stroke();
  }
  return { tx, ty, rx, ry };
}

function peindreDecor() {
  const off = document.createElement("canvas");
  off.width = Math.round(vue.VW * echelle);
  off.height = Math.round(vue.VH * echelle);
  const c = off.getContext("2d");
  c.fillStyle = C.encre;
  c.fillRect(0, 0, off.width, off.height);
  projeterPlat(c);

  const metal = "#d9dbe2";
  const metalFace = "#6b6e7a";
  const bois = "#cdb48a";
  const boisFace = "#6e5434";
  // Du fond vers l'avant
  murRelief(c, CONTOUR.filter(p => p[1] < 300), 16, bois, boisFace, 6);
  SEPARATEURS.forEach(s => murRelief(c, s, 12, metal, metalFace, 3));
  murRelief(c, MUR_ORBITE, 14, metal, metalFace, 4);
  murRelief(c, BOUCHE_RAMPE.g, 14, metal, metalFace, 4);
  murRelief(c, BOUCHE_RAMPE.d, 14, metal, metalFace, 4);
  murRelief(c, MUR_LANCEUR, 14, metal, metalFace, 4);
  murRelief(c, GUIDE_G, 12, metal, metalFace, 4);
  murRelief(c, GUIDE_D, 12, metal, metalFace, 4);
  murRelief(c, [[14, 196], [14, 740]], 16, bois, boisFace, 6);
  murRelief(c, [[388, 196], [388, 740]], 16, bois, boisFace, 6);

  // Torii du sanctuaire, en relief
  [[SANCTUAIRE.x - 11, SANCTUAIRE.y - 6], [SANCTUAIRE.x + 11, SANCTUAIRE.y - 6]].forEach(([x, y]) => cylindre(c, x, y, 2.5, 22, C.rougeSombre, C.rouge));
  vueNormale(c);
  const g = proj(SANCTUAIRE.x - 18, SANCTUAIRE.y - 6, 24);
  const d = proj(SANCTUAIRE.x + 18, SANCTUAIRE.y - 6, 24);
  c.fillStyle = C.rouge;
  c.fillRect(g[0], g[1] - 4, d[0] - g[0], 4);
  c.fillStyle = C.encre;
  c.fillRect(g[0] - 1, g[1] - 6, d[0] - g[0] + 2, 2);

  // Taquet du lanceur
  vueNormale(c);
  const t0 = proj(362, 700, 0);
  const t1 = proj(388, 700, 6);
  c.fillStyle = metalFace;
  c.fillRect(t0[0], t1[1], t1[0] - t0[0], t0[1] - t1[1]);
  return off;
}

// ---------------------------------------------------------------------
// Les objets qui bougent
// ---------------------------------------------------------------------

function insert(x, y, allume, couleur, sombre, forme, angle) {
  local(ctx, x, y, 0.2);
  ctx.save();
  ctx.translate(x, y);
  if (angle) {
    ctx.rotate(angle);
  }
  ctx.fillStyle = allume ? couleur : sombre;
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.lineWidth = 1;
  if (forme === "fleche") {
    tracer(ctx, [[0, -9], [7, 1], [3, 1], [3, 9], [-3, 9], [-3, 1], [-7, 1]], true);
  } else if (forme === "losange") {
    tracer(ctx, [[0, -7], [5, 0], [0, 7], [-5, 0]], true);
  } else {
    ctx.beginPath();
    ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.stroke();
  if (allume) {
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.beginPath();
    ctx.arc(-1.5, -2, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function dessinerBlason() {
  const cx = 188;
  const cy = 528;
  MISSIONS.forEach((m, i) => {
    const a = -Math.PI / 2 + (i / MISSIONS.length) * Math.PI * 2;
    const x = cx + Math.cos(a) * 40;
    const y = cy + Math.sin(a) * 40;
    const courante = i === etat.mission && !etat.hanabi;
    const faite = etat.faites[i];
    const vif = faite || etat.hanabi || (courante && Math.floor(etat.clignote * 3) % 2 === 0);
    local(ctx, x, y, 0.2);
    ctx.fillStyle = faite ? C.lime : vif ? C.or : "#2e2850";
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = faite || vif ? "#ffffff" : "#463d72";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = faite || vif ? C.encre : "#6c63a0";
    ctx.font = (m.jp.length > 1 ? "700 8px" : "700 12px") + " 'Shippori Mincho B1', serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(m.jp, x, y + 0.5);
  });
  local(ctx, cx, cy, 0.2);
  ctx.fillStyle = etat.hanabi ? C.or : C.creme;
  ctx.font = "800 22px 'Anybody', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(etat.niveau), cx, cy - 2);
  ctx.font = "600 5px 'Martian Mono', monospace";
  ctx.fillStyle = "#8a80c0";
  ctx.fillText("NIVEAU", cx, cy + 13);
}

function dessinerTambour(t, flash, dore) {
  const enfonce = flash > 0;
  const h = enfonce ? 12 : 16;
  // Socle noir, jupe rouge, anneau chrome, peau
  cylindre(ctx, t.x, t.y, BUMPER.rayon + 3, 4, "#0b0b10", "#1c1a2a");
  const jupe = degrade(ctx, ...proj(t.x - BUMPER.rayon, t.y), ...proj(t.x + BUMPER.rayon, t.y), [[0, C.rougeSombre], [0.45, enfonce ? "#ff7a6c" : C.rougeClair], [1, C.rougeSombre]]);
  const r = cylindre(ctx, t.x, t.y, BUMPER.rayon, h, jupe, "#c9ccd6");
  // Peau du tambour, legerement en retrait de l'anneau
  ctx.fillStyle = enfonce ? "#ffffff" : (dore ? C.or : C.creme);
  ctx.beginPath();
  ctx.ellipse(r.tx, r.ty, r.rx * 0.78, r.ry * 0.78, 0, 0, Math.PI * 2);
  ctx.fill();
  // Clous autour
  ctx.fillStyle = "#1c1a2a";
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.fillRect(r.tx + Math.cos(a) * r.rx * 0.9 - 0.8, r.ty + Math.sin(a) * r.ry * 0.9 - 0.8, 1.6, 1.6);
  }
  // Tomoe au centre
  local(ctx, t.x, t.y, h);
  ctx.fillStyle = dore ? C.rougeSombre : C.rouge;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + etat.clignote * 1.2;
    ctx.beginPath();
    ctx.arc(t.x + Math.cos(a) * 4.5, t.y + Math.sin(a) * 4.5, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function dessinerPoste(p) {
  cylindre(ctx, p.x, p.y, p.r + 1.5, 10, "#b8b2a4", "#ede8df");
  cylindre(ctx, p.x, p.y, p.r * 0.5, 12, "#80838e", "#d9dbe2");
}

function dessinerSling(s, gauche, enfonce) {
  const { a, b, c: pc } = s;
  const h = 12;
  // Socle en plastique rouge, epais
  vueNormale(ctx);
  const bas = [a, b, pc].map(p => proj(p[0], p[1], 0));
  const haut = [a, b, pc].map(p => proj(p[0], p[1], h));
  ctx.fillStyle = C.rougeSombre;
  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3;
    tracer(ctx, [bas[i], bas[j], haut[j], haut[i]], true);
    ctx.fill();
  }
  ctx.fillStyle = degrade(ctx, haut[0][0], haut[0][1], haut[2][0], haut[2][1], [[0, C.rougeClair], [1, C.rouge]]);
  tracer(ctx, haut, true);
  ctx.fill();
  ctx.fillStyle = C.creme;
  ctx.font = "800 7px 'Anybody', sans-serif";
  // Elastique blanc a mi-hauteur, qui se tend quand il frappe
  const mx = (a[0] + pc[0]) / 2;
  const my = (a[1] + pc[1]) / 2;
  const dx = pc[0] - a[0];
  const dy = pc[1] - a[1];
  const l = Math.hypot(dx, dy);
  const nx = (gauche ? dy : -dy) / l;
  const ny = (gauche ? -dx : dx) / l;
  const pousse = enfonce > 0 ? 5 : 1.5;
  ctx.strokeStyle = C.creme;
  ctx.lineWidth = 3 * sOf(my) * echelle / echelle;
  ctx.lineCap = "round";
  tracer(ctx, [proj(a[0], a[1], 6), proj(mx + nx * pousse, my + ny * pousse, 6), proj(pc[0], pc[1], 6)]);
  ctx.stroke();
  [a, b, pc].forEach(p => dessinerPoste({ x: p[0], y: p[1], r: 3 }));
}

function dessinerMasque(m, debout, i) {
  if (!debout) {
    local(ctx, m.x, m.y, 0);
    ctx.fillStyle = "#050508";
    ctx.fillRect(m.x - m.demi, m.y - 2, m.demi * 2, 4);
    return;
  }
  vueNormale(ctx);
  const g0 = proj(m.x - m.demi, m.y, 0);
  const d0 = proj(m.x + m.demi, m.y, 0);
  const hauteur = 22;
  const g1 = proj(m.x - m.demi, m.y, hauteur);
  const d1 = proj(m.x + m.demi, m.y, hauteur);
  const fond = [C.creme, C.rouge, C.creme][i];
  const trait = i === 1 ? C.creme : C.rouge;
  ctx.fillStyle = fond;
  ctx.beginPath();
  ctx.moveTo(g0[0], g0[1]);
  ctx.lineTo(d0[0], d0[1]);
  ctx.lineTo(d1[0], d1[1] + 4);
  ctx.quadraticCurveTo((g1[0] + d1[0]) / 2, g1[1] - 6, g1[0], g1[1] + 4);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.lineWidth = 1;
  ctx.stroke();
  // Visage du masque : yeux en amande, bouche
  const cx = (g0[0] + d0[0]) / 2;
  const cy = (g0[1] + g1[1]) / 2;
  const w = d0[0] - g0[0];
  ctx.fillStyle = trait;
  ctx.beginPath();
  ctx.ellipse(cx - w * 0.22, cy - 2, w * 0.14, 1.6, -0.3, 0, Math.PI * 2);
  ctx.ellipse(cx + w * 0.22, cy - 2, w * 0.14, 1.6, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1c1a2a";
  ctx.fillRect(cx - w * 0.1, cy + 4, w * 0.2, 1.6);
  if (i !== 1) {
    // Oreilles de kitsune
    ctx.fillStyle = trait;
    tracer(ctx, [[g1[0] + 1, g1[1] + 3], [g1[0] + 3, g1[1] - 3], [g1[0] + 6, g1[1] + 1]], true);
    ctx.fill();
    tracer(ctx, [[d1[0] - 1, d1[1] + 3], [d1[0] - 3, d1[1] - 3], [d1[0] - 6, d1[1] + 1]], true);
    ctx.fill();
  }
}

function dessinerCible(t, allumee) {
  vueNormale(ctx);
  const h0 = proj(t.x, t.y - t.demi, 0);
  const b0 = proj(t.x, t.y + t.demi, 0);
  const h1 = proj(t.x, t.y - t.demi, 18);
  const b1 = proj(t.x, t.y + t.demi, 18);
  ctx.fillStyle = allumee ? C.bleu : C.bleuSombre;
  tracer(ctx, [h0, b0, b1, h1], true);
  ctx.fill();
  ctx.fillStyle = allumee ? "#cfe6f0" : "#4d7183";
  tracer(ctx, [h1, b1, [b1[0] - 4, b1[1] + 1], [h1[0] - 4, h1[1] + 1]], true);
  ctx.fill();
}

function dessinerFlipper(f) {
  const p = f.pivot;
  const ang = f.angle;
  const r0 = FLIP.rayonPivot;
  const r1 = FLIP.rayonBout;
  const [bx, by] = bout(f);
  const forme = (marge) => {
    const nx = -Math.sin(ang);
    const ny = Math.cos(ang);
    ctx.beginPath();
    ctx.arc(p.x, p.y, r0 - marge, ang + Math.PI / 2, ang - Math.PI / 2);
    ctx.lineTo(bx - nx * (r1 - marge), by - ny * (r1 - marge));
    ctx.arc(bx, by, r1 - marge, ang - Math.PI / 2, ang + Math.PI / 2);
    ctx.closePath();
  };
  // Epaisseur : on empile la forme du bas vers le haut
  for (let z = 0; z <= 8; z += 2) {
    local(ctx, p.x, p.y, z);
    forme(0);
    ctx.fillStyle = z < 8 ? C.rougeSombre : C.rouge;
    ctx.fill();
  }
  local(ctx, p.x, p.y, 8);
  forme(2.6);
  ctx.fillStyle = etat.tilt ? C.eteint : C.creme;
  ctx.fill();
  ctx.fillStyle = "#8f856f";
  ctx.beginPath();
  ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#d9dbe2";
  ctx.beginPath();
  ctx.arc(p.x - 0.8, p.y - 0.8, 1.2, 0, Math.PI * 2);
  ctx.fill();
}

function dessinerBille(b, hauteur) {
  const z = hauteur || 0;
  const s = sOf(b.y);
  const rayon = R * s;
  vueNormale(ctx);
  // Ombre sur la table, un peu decalee vers le bas
  const [ox, oy] = proj(b.x + 2, b.y + 4, 0);
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.beginPath();
  ctx.ellipse(ox, oy, rayon * 1.05, rayon * PERSP.b * s * 0.9, 0, 0, Math.PI * 2);
  ctx.fill();
  const [x, y] = proj(b.x, b.y, R + z);
  // Bille chromee : reflet du ciel en haut, de la table en bas
  const g = ctx.createRadialGradient(x - rayon * 0.35, y - rayon * 0.4, rayon * 0.1, x, y, rayon);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.25, "#e4e6ec");
  g.addColorStop(0.6, "#9a9dab");
  g.addColorStop(0.85, "#5d5f6c");
  g.addColorStop(1, "#3a3346");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, rayon, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(224,87,75,0.35)";
  ctx.beginPath();
  ctx.ellipse(x, y + rayon * 0.62, rayon * 0.55, rayon * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
}

// Hauteur de la rampe le long de son trace : elle monte puis redescend
function hauteurRampe(i, t) {
  const n = CHEMIN_RAMPE.length - 1;
  const u = (i + t) / n;
  return Math.sin(Math.min(1, u * 1.15) * Math.PI) * 46 + 8 * (1 - u);
}

function dessinerRampe() {
  const pts = CHEMIN_RAMPE;
  const allume = etat.jackpot || missionCourante().id === "rampe";
  const cotes = [-9, 9].map(decal => pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const c = pts[Math.min(pts.length - 1, i + 1)];
    const l = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1;
    return [p[0] - (c[1] - a[1]) / l * decal, p[1] + (c[0] - a[0]) / l * decal, hauteurRampe(i, 0)];
  }));
  vueNormale(ctx);
  // Ombre de la rampe sur la table
  ctx.strokeStyle = "rgba(0,0,0,0.3)";
  ctx.lineWidth = 3;
  cotes.forEach(cote => {
    tracer(ctx, cote.map(p => proj(p[0] + 4, p[1] + 8, 0)));
    ctx.stroke();
  });
  // Montants qui portent la rampe
  ctx.strokeStyle = "#5d5f6c";
  ctx.lineWidth = 2;
  [3, 6, 9].forEach(i => {
    cotes.forEach(cote => {
      const p = cote[i];
      const bas = proj(p[0], p[1], 0);
      const haut = proj(p[0], p[1], p[2]);
      ctx.beginPath();
      ctx.moveTo(bas[0], bas[1]);
      ctx.lineTo(haut[0], haut[1]);
      ctx.stroke();
    });
  });
  // Plancher en plastique teinte, presque opaque
  const g = cotes[0].map(p => proj(p[0], p[1], p[2]));
  const d = cotes[1].map(p => proj(p[0], p[1], p[2]));
  ctx.fillStyle = etat.jackpot ? "rgba(122,96,24,0.72)" : "rgba(52,74,32,0.72)";
  tracer(ctx, [...g, ...d.slice().reverse()], true);
  ctx.fill();
  // Traverses
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 1;
  for (let i = 0; i < pts.length; i++) {
    ctx.beginPath();
    ctx.moveTo(g[i][0], g[i][1]);
    ctx.lineTo(d[i][0], d[i][1]);
    ctx.stroke();
  }
  // Chevrons lumineux sur le plancher
  for (let i = 0; i < pts.length - 2; i++) {
    const a = pts[i];
    const c = pts[i + 1];
    const mx = (a[0] + c[0]) / 2;
    const my = (a[1] + c[1]) / 2;
    const vif = allume && Math.floor(etat.clignote * 8 - i) % 4 === 0;
    const [X, Y] = proj(mx, my, hauteurRampe(i, 0.5));
    const [X2, Y2] = proj(c[0], c[1], hauteurRampe(i + 1, 0));
    const ang = Math.atan2(Y2 - Y, X2 - X);
    ctx.save();
    ctx.translate(X, Y);
    ctx.rotate(ang);
    ctx.fillStyle = vif ? (etat.jackpot ? C.or : C.lime) : (etat.jackpot ? C.orSombre : C.limeSombre);
    tracer(ctx, [[-3, -4], [2, 0], [-3, 4], [-1, 4], [4, 0], [-1, -4]], true);
    ctx.fill();
    ctx.restore();
  }
  // Rails chromes
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  [g, d].forEach(rail => {
    tracer(ctx, rail);
    ctx.strokeStyle = "#4b4d58";
    ctx.lineWidth = 3.5;
    ctx.stroke();
    tracer(ctx, rail);
    ctx.strokeStyle = etat.jackpot ? C.or : "#e4e6ec";
    ctx.lineWidth = 1.6;
    ctx.stroke();
  });
  // Plaque du dragon au sommet
  const sommet = proj(196, 132, hauteurRampe(5, 0.5) + 6);
  ctx.fillStyle = etat.jackpot ? C.or : C.rouge;
  ctx.beginPath();
  ctx.roundRect(sommet[0] - 16, sommet[1] - 11, 32, 20, 4);
  ctx.fill();
  ctx.strokeStyle = C.creme;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.font = "700 13px 'Shippori Mincho B1', serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = etat.jackpot ? C.encre : C.creme;
  ctx.fillText("竜", sommet[0], sommet[1]);
}

function dessinerSpinner() {
  const s = etat.spinner;
  vueNormale(ctx);
  const g = proj(15, SPINNER.y, 22);
  const d = proj(43, SPINNER.y, 22);
  ctx.strokeStyle = "#d9dbe2";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(g[0], g[1]);
  ctx.lineTo(d[0], d[1]);
  ctx.stroke();
  // La plaque tourne autour de la barre : on la voit s'aplatir
  const c = Math.cos(s.angle);
  const hauteur = 16 * c;
  const g2 = proj(17, SPINNER.y, 22 - hauteur);
  const d2 = proj(41, SPINNER.y, 22 - hauteur);
  ctx.fillStyle = c > 0 ? C.or : C.orSombre;
  tracer(ctx, [g, d, d2, g2], true);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

function dessinerPortillons() {
  vueNormale(ctx);
  ctx.strokeStyle = "#d9dbe2";
  ctx.lineWidth = 2.5;
  [PORTE_ORBITE, PORTE_LANCEUR].forEach(p => {
    const a = proj(p.a[0], p.a[1], 10);
    const b = proj(p.b[0], p.b[1], 10);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
  });
}

function dessinerLanceur() {
  const comp = etat.charge * 14;
  vueNormale(ctx);
  // Ressort
  ctx.strokeStyle = "#a9acb8";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i <= 8; i++) {
    const y = 706 + comp * 0.5 + i * ((12 - comp * 0.3) / 8);
    const p = proj(i % 2 ? 368 : 382, y, 4);
    if (i === 0) {
      ctx.moveTo(p[0], p[1]);
    } else {
      ctx.lineTo(p[0], p[1]);
    }
  }
  ctx.stroke();
  // Tete du piston
  const a = proj(366, 702 + comp, 8);
  const b = proj(384, 708 + comp, 0);
  ctx.fillStyle = C.rouge;
  ctx.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
  ctx.fillStyle = C.rougeClair;
  ctx.fillRect(a[0], a[1], b[0] - a[0], 2);
}

// ---------------------------------------------------------------------
// Le panneau d'affichage (a droite sur grand ecran, en haut au telephone)
// ---------------------------------------------------------------------

function cadre(x, y, w, h, fond) {
  ctx.fillStyle = "#2a2840";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "#08080d";
  ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
  ctx.fillStyle = fond || "#0e0d18";
  ctx.fillRect(x + 4, y + 4, w - 8, h - 8);
}

function texte(t, x, y, taille, couleur, alignement, police, largeurMax) {
  ctx.font = police || ("800 " + taille + "px 'Anybody', sans-serif");
  // Un titre trop long se resserre pour tenir dans son cadre
  if (largeurMax && !police) {
    let corps = taille;
    while (corps > 8 && ctx.measureText(t).width > largeurMax) {
      corps -= 1;
      ctx.font = "800 " + corps + "px 'Anybody', sans-serif";
    }
  }
  ctx.textAlign = alignement || "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = couleur;
  ctx.fillText(t, x, y);
}

function mono(t, x, y, taille, couleur, alignement) {
  texte(t, x, y, taille, couleur, alignement, "600 " + taille + "px 'Martian Mono', monospace");
}

function dessinerPanneauCote(x0, y0, w, h) {
  vueNormale(ctx);
  ctx.fillStyle = "#13121f";
  ctx.fillRect(x0, y0, w, h);
  ctx.fillStyle = "#2a2840";
  ctx.fillRect(x0, y0, 2, h);
  const x = x0 + 14;
  const lw = w - 28;
  // Titre
  texte("FLIPPER", x, y0 + 26, 30, C.creme);
  texte("祭り", x + lw, y0 + 26, 22, C.rougeClair, "right", "700 22px 'Shippori Mincho B1', serif");
  mono("LA FÊTE DE NUIT", x, y0 + 48, 7, "#6c66a0");

  // Score
  cadre(x, y0 + 62, lw, 64);
  mono("SCORE", x + 12, y0 + 78, 7, "#6c66a0");
  texte(etat.score.toLocaleString("fr-BE"), x + lw - 12, y0 + 104, 30, C.lime, "right");

  // Bille, niveau, bonus
  const cases = [["BILLE", etat.bille + "/" + BILLES + (etat.billesEnPlus ? "+" + etat.billesEnPlus : "")], ["NIVEAU", String(etat.niveau)], ["BONUS", "x" + etat.multBonus]];
  const cw = (lw - 12) / 3;
  cases.forEach(([nom, val], i) => {
    const cx = x + i * (cw + 6);
    cadre(cx, y0 + 134, cw, 46);
    mono(nom, cx + cw / 2, y0 + 148, 6, "#6c66a0", "center");
    texte(val, cx + cw / 2, y0 + 166, 16, C.creme, "center");
  });

  // Message ou mission en cours
  const m = etat.message;
  cadre(x, y0 + 188, lw, 92, "#0b0a14");
  if (m) {
    texte(m.titre.toUpperCase(), x + lw / 2, y0 + 222, 24, m.couleur, "center", null, lw - 24);
    if (m.sous) {
      enveloppe(m.sous, x + lw / 2, y0 + 250, lw - 24, 8, C.creme, "center");
    }
  } else if (etat.pause) {
    texte("PAUSE", x + lw / 2, y0 + 234, 26, C.creme, "center");
  } else if (etat.termine) {
    texte("FIN DE PARTIE", x + lw / 2, y0 + 226, 20, C.creme, "center");
    mono("N pour rejouer", x + lw / 2, y0 + 252, 8, C.lime, "center");
  } else {
    const mi = missionCourante();
    mono(etat.hanabi ? "HANABI" : "MISSION " + (etat.faites.filter(Boolean).length + 1) + " / 6", x + 12, y0 + 204, 7, "#6c66a0");
    texte(etat.hanabi ? "JACKPOT !" : mi.nom.toUpperCase(), x + 12, y0 + 226, 22, etat.hanabi ? C.or : C.creme, "left", null, lw - 24);
    enveloppe(etat.hanabi ? "Monte la rampe pendant la multibille" : mi.aide, x + 12, y0 + 248, lw - 24, 8, "#b8b2d8", "left");
    if (!etat.hanabi) {
      const but = mi.but(etat.niveau);
      ctx.fillStyle = "#2a2840";
      ctx.fillRect(x + 12, y0 + 264, lw - 70, 5);
      ctx.fillStyle = C.lime;
      ctx.fillRect(x + 12, y0 + 264, (lw - 70) * Math.min(1, etat.progres / but), 5);
      mono(etat.progres + "/" + but, x + lw - 12, y0 + 267, 8, C.creme, "right");
    }
  }

  // Les six missions
  mono("MISSIONS DU NIVEAU " + etat.niveau, x, y0 + 298, 6, "#6c66a0");
  MISSIONS.forEach((mi, i) => {
    const ly = y0 + 314 + i * 19;
    const faite = etat.faites[i];
    const courante = i === etat.mission && !etat.hanabi;
    ctx.fillStyle = faite ? C.lime : courante ? C.or : "#2a2840";
    ctx.beginPath();
    ctx.arc(x + 7, ly, 6, 0, Math.PI * 2);
    ctx.fill();
    texte(mi.jp, x + 7, ly + 0.5, 7, faite || courante ? C.encre : "#6c66a0", "center", "700 " + (mi.jp.length > 1 ? 6 : 8) + "px 'Shippori Mincho B1', serif");
    texte(mi.nom, x + 20, ly, 11, faite ? C.lime : courante ? C.creme : "#6c66a0");
    if (faite) {
      mono("OK", x + lw, ly, 7, C.lime, "right");
    } else if (courante) {
      mono(etat.progres + "/" + mi.but(etat.niveau), x + lw, ly, 7, C.or, "right");
    }
  });

  // Voyants
  const voyants = [["KICKBACK", etat.kickback, C.bleu], ["SAUVETAGE", etat.sauvetage > 0, C.lime], ["VERROU " + etat.verrous + "/2", etat.sanctuaireAllume, C.or]];
  voyants.forEach(([nom, on, coul], i) => {
    const vy = y0 + 432 + i * 17;
    ctx.fillStyle = on ? coul : "#2a2840";
    ctx.fillRect(x, vy - 4, 8, 8);
    mono(nom, x + 16, vy, 7, on ? C.creme : "#4a4470");
  });

  mono("← → FLIPPERS   ↓ LANCER   ↑ SECOUER", x, y0 + h - 18, 6, "#4a4470");
}

function enveloppe(t, x, y, largeur, taille, couleur, alignement) {
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
  lignes.slice(0, 2).forEach((l, i) => mono(l, x, y + i * (taille + 4), taille, couleur, alignement));
}

function dessinerPanneauHaut(w, h) {
  vueNormale(ctx);
  ctx.fillStyle = "#13121f";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#2a2840";
  ctx.fillRect(0, h - 2, w, 2);
  // Score a gauche, etat a droite, message ou mission au centre
  cadre(8, 8, 170, 44);
  mono("SCORE", 18, 20, 6, "#6c66a0");
  texte(etat.score.toLocaleString("fr-BE"), 168, 36, 22, C.lime, "right");
  cadre(184, 8, 64, 44);
  mono("BILLE", 216, 20, 6, "#6c66a0", "center");
  texte(etat.bille + "/" + BILLES, 216, 37, 15, C.creme, "center");
  cadre(254, 8, 64, 44);
  mono("NIVEAU", 286, 20, 6, "#6c66a0", "center");
  texte(String(etat.niveau), 286, 37, 15, C.creme, "center");
  cadre(324, 8, 68, 44);
  mono("BONUS", 358, 20, 6, "#6c66a0", "center");
  texte("x" + etat.multBonus, 358, 37, 15, etat.multBonus > 1 ? C.or : C.creme, "center");

  const m = etat.message;
  if (m) {
    texte(m.titre.toUpperCase(), 14, 72, 18, m.couleur, "left", null, vue.VW - 60);
    if (m.sous) {
      mono(m.sous, 14, 88, 7, C.creme);
    }
  } else if (etat.pause) {
    texte("PAUSE", 14, 76, 20, C.creme);
  } else {
    const mi = missionCourante();
    texte(etat.hanabi ? "HANABI : JACKPOT SUR LA RAMPE" : mi.nom.toUpperCase(), 14, 70, 16, etat.hanabi ? C.or : C.creme);
    if (!etat.hanabi) {
      const but = mi.but(etat.niveau);
      mono(etat.progres + "/" + but + "  " + mi.aide, 14, 87, 7, "#b8b2d8");
    }
  }
  const voyants = [["K", etat.kickback, C.bleu], ["S", etat.sauvetage > 0, C.lime]];
  voyants.forEach(([nom, on, coul], i) => {
    ctx.fillStyle = on ? coul : "#2a2840";
    ctx.fillRect(w - 34 + i * 14, 64, 10, 10);
    mono(nom, w - 29 + i * 14, 81, 6, on ? C.creme : "#4a4470", "center");
  });
}

// ---------------------------------------------------------------------
// Image complete
// ---------------------------------------------------------------------

function dessiner() {
  if (etat === null || decor === null) {
    return;
  }
  const sec = effets.decalage();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(decor, sec.x * echelle, sec.y * echelle);
  const ancien = vue.ox;
  const ancienY = vue.oy;
  vue.ox += sec.x;
  vue.oy += sec.y;

  // Inserts
  const vif = Math.floor(etat.clignote * 4) % 2 === 0;
  const mi = missionCourante().id;
  insert(188, 674, (etat.sauvetage > 0 && vif) || etat.sauvetage > 3, C.lime, C.limeSombre, "losange");
  insert(27, 596, etat.kickback, C.bleu, C.bleuSombre);
  COULOIRS_HAUT.forEach((x, i) => {
    const skill = etat.skillActif && etat.skill === i && Math.floor(etat.clignote * 6) % 2 === 0;
    insert(x, 108, etat.couloirs[i] || skill, skill ? C.lime : C.or, C.orSombre);
  });
  insert(274, 380, (mi === "rampe" || etat.jackpot) && vif, etat.jackpot ? C.or : C.lime, C.limeSombre, "fleche", 0.4);
  insert(62, 470, mi === "orbite" && vif, C.bleu, C.bleuSombre, "fleche", -0.5);
  insert(112, 340, (etat.sanctuaireAllume || mi === "sanctuaire") && vif, C.or, C.orSombre, "fleche", -0.5);
  insert(188, 432, mi === "masques" && vif, C.rougeClair, C.rougeSombre, "fleche");
  insert(340, 336, etat.cibles.some(Boolean) && vif, C.bleu, C.bleuSombre, "fleche", -Math.PI / 2);
  [0, 1, 2].forEach(i => insert(230 + i * 14, 462, i < etat.verrous, C.or, C.orSombre, "losange"));
  dessinerBlason();

  if (etat.sanctuaireAllume) {
    local(ctx, SANCTUAIRE.x, SANCTUAIRE.y, 0.3);
    ctx.strokeStyle = vif ? C.or : C.orSombre;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(SANCTUAIRE.x, SANCTUAIRE.y, SANCTUAIRE.r + 4, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Objets en volume, du fond vers l'avant
  const objets = [];
  BUMPERS.forEach((t, i) => objets.push({ y: t.y, f: () => dessinerTambour(t, etat.bumpers[i], etat.couloirs.every(Boolean)) }));
  POSTES.forEach(p => objets.push({ y: p.y, f: () => dessinerPoste(p) }));
  MASQUES.forEach((m, i) => objets.push({ y: m.y, f: () => dessinerMasque(m, etat.masques[i], i) }));
  CIBLES.forEach((t, i) => objets.push({ y: t.y, f: () => dessinerCible(t, etat.cibles[i]) }));
  objets.push({ y: 560, f: () => dessinerSling(SLING_G, true, etat.slings.g) });
  objets.push({ y: 560, f: () => dessinerSling(SLING_D, false, etat.slings.d) });
  objets.push({ y: SPINNER.y, f: dessinerSpinner });
  etat.flippers.forEach(f => objets.push({ y: f.pivot.y, f: () => dessinerFlipper(f) }));
  etat.billes.filter(b => b.rampe === null).forEach(b => objets.push({ y: b.y, f: () => dessinerBille(b, b.capturee ? -6 : 0) }));
  objets.sort((a, b) => a.y - b.y).forEach(o => o.f());
  dessinerPortillons();
  dessinerLanceur();

  // La rampe et ce qui roule dessus
  dessinerRampe();
  etat.billes.filter(b => b.rampe !== null).forEach(b => dessinerBille(b, hauteurRampe(b.rampe.i, b.rampe.t)));

  vue.ox = ancien;
  vue.oy = ancienY;
  vueNormale(ctx);
  effets.dessiner(ctx, "'Martian Mono', monospace");

  // Panneau
  if (vue.mode === "cote") {
    dessinerPanneauCote(L, 0, PANNEAU_L, vue.VH);
  } else {
    dessinerPanneauHaut(vue.VW, PANNEAU_H);
  }
}

// La table s'adapte a la place : panneau a droite si l'ecran est large,
// en haut sinon. Elle se peint a la resolution reelle, pour rester nette.
function ajusterResolution() {
  // Au-dela de 1100 px, les classements lateraux occupent les bords
  const marge = window.innerWidth >= 1100 ? 500 : 0;
  const largeurDispo = Math.min(window.innerWidth * 0.96 - marge, 1100);
  const entete = zone.querySelector(".entete-matsuri").getBoundingClientRect().height || 40;
  const manette = (document.querySelector(".manette:not([hidden])") ? document.querySelector(".manette:not([hidden])").getBoundingClientRect().height : 0);
  const hauteurDispo = Math.max(320, window.innerHeight - entete - manette - 46);
  // On garde la disposition qui donne la plus grande table
  const tailleCote = Math.min(largeurDispo / (L + PANNEAU_L), hauteurDispo / VUE_TABLE_H);
  const tailleHaut = Math.min(largeurDispo / L, hauteurDispo / (VUE_TABLE_H + PANNEAU_H));
  const cote = tailleCote >= tailleHaut * 0.9;
  vue.mode = cote ? "cote" : "haut";
  vue.VW = cote ? L + PANNEAU_L : L;
  vue.VH = cote ? VUE_TABLE_H : VUE_TABLE_H + PANNEAU_H;
  vue.ox = 0;
  vue.oy = cote ? 0 : PANNEAU_H;
  vue.ybas = VUE_TABLE_H - 8;
  const taille = Math.min(largeurDispo / vue.VW, hauteurDispo / vue.VH);
  canvas.style.width = Math.floor(vue.VW * taille) + "px";
  canvas.style.height = Math.floor(vue.VH * taille) + "px";
  echelle = Math.min(3, Math.max(1, taille * (window.devicePixelRatio || 1)));
  canvas.width = Math.round(vue.VW * echelle);
  canvas.height = Math.round(vue.VH * echelle);
  plat = peindrePlat(Math.min(4, echelle * 1.6));
  decor = peindreDecor();
}

// Coordonnees d'ecran d'un point de la table, pour les effets
function pointEcran(x, y) {
  return ecran(x, y);
}

const boucle = creerBoucle(function (dt) {
  maj(dt);
  dessiner();
}, { plafond: 1 / 30 });

window.addEventListener("resize", function () {
  if (!zone.hidden) {
    ajusterResolution();
  }
});

// ---------------------------------------------------------------------
// En-tete et commandes
// ---------------------------------------------------------------------

function majHud() {
  if (etat === null) {
    return;
  }
  zoneScore.textContent = etat.score.toLocaleString("fr-BE");
  zoneBille.textContent = etat.bille + "/" + BILLES + (etat.billesEnPlus ? " +" + etat.billesEnPlus : "");
  zoneNiveau.textContent = String(etat.niveau);
  zoneNiveau.parentElement.classList.toggle("chaud", etat.niveau > 1);
  majScoreCourant(ID, etat.score);
}

function majBoutonSon() {
  boutonSon.textContent = sonActif() ? "Son" : "Muet";
}

function demarrer() {
  effets.vider();
  etat = nouvelEtat();
  accumulateur = 0;
  commandes.gauche = commandes.droite = commandes.lanceur = false;
  doigts.clear();
  ajusterResolution();
  requestAnimationFrame(ajusterResolution);
  billeAuLanceur();
  annoncer("Bille 1", "Maintiens un bouton puis relâche pour lancer", 2.6, C.creme);
  majHud();
  majScoreCourant(ID, 0);
  majBoutonSon();
  boucle.lancer();
}

function basculerPause() {
  if (etat === null || etat.termine) {
    return;
  }
  etat.pause = !etat.pause;
  if (!etat.pause) {
    boucle.remettreALHeure();
  }
}

const TOUCHES = {
  "arrowleft": "gauche", "q": "gauche", "a": "gauche", "shift": "gauche",
  "arrowright": "droite", "d": "droite", "l": "droite",
  "arrowdown": "lanceur", "s": "lanceur", " ": "lanceur", "enter": "lanceur"
};

// Comme sur les vraies tables, les flippers font tourner les couloirs allumes
function tournerCouloirs(sens) {
  if (etat === null || etat.termine) {
    return;
  }
  const c = etat.couloirs;
  etat.couloirs = sens > 0 ? [c[2], c[0], c[1]] : [c[1], c[2], c[0]];
  if (etat.skillActif && etat.billes.some(b => b.dansLanceur)) {
    etat.skill = (etat.skill + (sens > 0 ? 1 : 2)) % 3;
  }
}

function appuyer(action) {
  if ((action === "gauche" || action === "droite") && !commandes[action]) {
    tournerCouloirs(action === "gauche" ? -1 : 1);
    if (etat && !etat.tilt && !etat.pause) {
      jouer("flipper");
    }
  }
  commandes[action] = true;
}

surTouche(ID, function (evenement) {
  const touche = evenement.key.toLowerCase();
  if (TOUCHES[touche] !== undefined) {
    if (!evenement.repeat) {
      appuyer(TOUCHES[touche]);
    }
  } else if (touche === "arrowup" || touche === "z" || touche === "w") {
    if (!evenement.repeat && etat !== null && !etat.pause) {
      secouer();
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

document.addEventListener("keyup", function (evenement) {
  const touche = evenement.key.toLowerCase();
  if (TOUCHES[touche] !== undefined) {
    commandes[TOUCHES[touche]] = false;
  }
});

function recalculerDoigts() {
  const valeurs = [...doigts.values()];
  commandes.gauche = valeurs.includes("gauche");
  commandes.droite = valeurs.includes("droite");
  commandes.lanceur = valeurs.includes("lanceur");
}

canvas.addEventListener("pointerdown", function (evenement) {
  if (!jeuAuPremierPlan(ID) || etat === null || etat.pause) {
    return;
  }
  evenement.preventDefault();
  canvas.setPointerCapture(evenement.pointerId);
  const enJeu = etat.billes.some(b => !b.dansLanceur);
  const attente = etat.billes.some(b => b.dansLanceur);
  const x = abscisseLogique(canvas, evenement.clientX, vue.VW);
  // Bille au lanceur et aucune en jeu : le doigt arme le ressort
  const action = attente && !enJeu ? "lanceur" : x < CX ? "gauche" : "droite";
  if (action !== "lanceur" && !commandes[action]) {
    tournerCouloirs(action === "gauche" ? -1 : 1);
  }
  doigts.set(evenement.pointerId, action);
  recalculerDoigts();
});

function lacher(evenement) {
  doigts.delete(evenement.pointerId);
  recalculerDoigts();
}
canvas.addEventListener("pointerup", lacher);
canvas.addEventListener("pointercancel", lacher);
canvas.addEventListener("contextmenu", evenement => evenement.preventDefault());

document.addEventListener("visibilitychange", function () {
  if (document.hidden && etat !== null && !etat.pause && !etat.termine && !zone.hidden) {
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
export const _test = { get etat() { return etat; }, commandes };

enregistrerJeu({
  id: ID,
  nom: "Flipper",
  code: "1931",
  section: zone,
  demarrer,
  arreter: () => {
    boucle.arreter();
    commandes.gauche = commandes.droite = commandes.lanceur = false;
    doigts.clear();
  },
  // B a gauche, A a droite : chaque pouce tient un flipper. La croix :
  // gauche et droite pour les flippers, bas pour le lanceur, haut pour secouer.
  manette: { a: "d", b: "q", start: "p", libelles: { a: "Flipper D", b: "Flipper G" } }
});
