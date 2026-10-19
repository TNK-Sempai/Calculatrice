// =====================================================================
//  STACK (la pagode)
//  Une tour vue en perspective isometrique. Chaque etage arrive en
//  glissant, une fois sur un axe, une fois sur l'autre. Une tape le
//  pose : ce qui depasse de l'etage du dessous est tranche et tombe en
//  tournoyant. La tour retrecit a chaque imprecision.
//
//  Une pose parfaite garde l'etage entier ; a partir de trois parfaites
//  d'affilee, chaque nouvelle parfaite le fait regrandir. Tous les huit
//  etages, un toit retrousse : la tour devient une pagode.
//
//  Pas de plafond : la vitesse monte doucement sans limite, et passe
//  un certain score des etages "a souffle" ralentissent et accelerent.
//  Le ciel change avec l'altitude : matin, plein jour, couchant, nuit.
// =====================================================================

import { enregistrerJeu, finDePartie, quitterJeu, majScoreCourant } from "./arcade.js";
import { creerBoucle } from "./noyau/boucle.js";
import { surTouche, jeuAuPremierPlan } from "./noyau/clavier.js";
import { creerStockage } from "./noyau/stockage.js";
import { jouer, basculerSon, sonActif } from "./noyau/son.js";

const ID = "pagode";

const zone = document.createElement("section");
zone.className = "jeu jeu-pagode";
zone.id = "jeuPagode";
zone.hidden = true;
zone.innerHTML = `
  <div class="jeu-entete entete-pagode">
    <span class="entete-boutons-pagode">
      <button class="jeu-quitter" id="sonPagode" type="button" aria-pressed="false">Son</button>
      <button class="jeu-quitter" id="rejouerPagode" type="button">Rejouer</button>
      <button class="jeu-quitter" id="quitterPagode" type="button">Retour</button>
    </span>
  </div>
  <canvas id="canvasPagode"></canvas>
  <p class="jeu-aide">Espace, fl&egrave;che haut ou une tape pour poser l'&eacute;tage. Ce qui d&eacute;passe tombe. Trois poses parfaites d'affil&eacute;e et l'&eacute;tage regrandit. P pause, M son, N rejouer, &Eacute;chap quitter.</p>`;
document.body.appendChild(zone);

const canvas = zone.querySelector("#canvasPagode");
const ctx = canvas.getContext("2d");
const boutonSon = zone.querySelector("#sonPagode");
const boutonRejouer = zone.querySelector("#rejouerPagode");
const boutonQuitter = zone.querySelector("#quitterPagode");

// ---------------------------------------------------------------------
// Reglages
// ---------------------------------------------------------------------

const W = 400;                 // taille logique du canvas
const H = 640;
const K = 1.15;                // pixels par unite de monde
const BH = 12;                 // hauteur d'un etage
const TAILLE = 100;            // cote de l'etage de depart
const COURSE = 150;            // amplitude du glissement
const PARFAIT = 3;             // tolerance d'une pose parfaite
const CROISSANCE = 6;          // ce que regagne une parfaite en serie
const SERIE_POUR_GRANDIR = 3;
const TOIT_TOUS = 8;
const GRAVITE = 900;
const CX = W / 2;
const OY = H * 0.6;            // ou se tient le haut de la tour a l'ecran

const stockageRecord = creerStockage("tanuki-arcade-pagode-record");
let etat = null;
let echelle = 1;

// ---------------------------------------------------------------------
// Etat
// ---------------------------------------------------------------------

function nouvelEtat() {
  const teinte = 190 + Math.floor(Math.random() * 170);
  const etat0 = {
    phase: "attente",          // attente, jeu, fin
    pause: false,
    temps: 0,
    teinte,
    etages: [{ x: -TAILLE / 2, z: -TAILLE / 2, w: TAILLE, d: TAILLE, n: 0 }],
    mobile: null,
    debris: [],
    ondes: [],
    textes: [],
    serie: 0,
    meilleureSerie: 0,
    record: Number(stockageRecord.lire()) || 0,
    camH: 0,
    zoom: 1,
    secousse: 0,
    nuages: [],
    etoiles: []
  };
  // Nuages poses dans le ciel une fois pour toutes, a des altitudes fixes
  for (let i = 0; i < 16; i++) {
    etat0.nuages.push({ h: 420 + i * 120 + Math.random() * 60, x: 30 + Math.random() * (W - 60), taille: 0.6 + Math.random() * 0.7 });
  }
  for (let i = 0; i < 70; i++) {
    etat0.etoiles.push({ x: Math.random() * W, y: Math.random() * H, t: Math.random() < 0.2 ? 2 : 1 });
  }
  return etat0;
}

function score() {
  return etat.etages.length - 1;
}

function sommet() {
  return etat.etages[etat.etages.length - 1];
}

function vitesse() {
  // Sans plafond : chaque etage ajoute un peu de vitesse
  return 118 + score() * 2.3;
}

function nouvelEtageMobile() {
  const dessous = sommet();
  const n = dessous.n + 1;
  const axe = n % 2 === 1 ? "x" : "z";
  // Passe 60, l'etage arrive parfois de l'autre cote
  const inverse = n > 60 && Math.random() < 0.35;
  // Passe 30, des etages a souffle : ils ralentissent puis accelerent
  const souffle = n > 30 && Math.random() < Math.min(0.45, (n - 30) * 0.012);
  const m = {
    x: dessous.x, z: dessous.z, w: dessous.w, d: dessous.d, n,
    axe,
    sens: inverse ? -1 : 1,
    t: 0,
    souffle,
    pos: inverse ? COURSE : -COURSE
  };
  if (axe === "x") {
    m.x = dessous.x + m.pos;
  } else {
    m.z = dessous.z + m.pos;
  }
  etat.mobile = m;
}

// ---------------------------------------------------------------------
// Pose
// ---------------------------------------------------------------------

function poser() {
  if (etat === null || etat.pause) {
    return;
  }
  if (etat.phase === "attente") {
    etat.phase = "jeu";
    nouvelEtageMobile();
    jouer("clic");
    return;
  }
  if (etat.phase === "fin") {
    return;
  }
  const m = etat.mobile;
  if (m === null) {
    return;
  }
  const dessous = sommet();
  const cle = m.axe;
  const taille = cle === "x" ? "w" : "d";
  const delta = m[cle] - dessous[cle];
  const recouvre = m[taille] - Math.abs(delta);

  if (recouvre <= 0) {
    // Rate : l'etage entier tombe
    etat.debris.push(debrisDe({ x: m.x, z: m.z, w: m.w, d: m.d, n: m.n }, cle, Math.sign(delta) || 1));
    etat.mobile = null;
    terminer();
    return;
  }

  let pose;
  if (Math.abs(delta) <= PARFAIT) {
    // Parfait : l'etage se cale exactement, et regrandit en serie
    pose = { x: dessous.x, z: dessous.z, w: dessous.w, d: dessous.d, n: m.n };
    etat.serie++;
    etat.meilleureSerie = Math.max(etat.meilleureSerie, etat.serie);
    if (etat.serie >= SERIE_POUR_GRANDIR) {
      const gain = Math.min(CROISSANCE, TAILLE - pose[taille]);
      if (gain > 0) {
        pose[taille] += gain;
        pose[cle] -= gain / 2;
      }
    }
    etat.ondes.push({ etage: pose, age: 0 });
    texte(etat.serie >= SERIE_POUR_GRANDIR ? "PARFAIT x" + etat.serie : "PARFAIT", "#ffffff");
    jouer("combo", Math.min(12, etat.serie));
  } else {
    // Le morceau qui depasse est tranche et tombe
    pose = { x: m.x, z: m.z, w: m.w, d: m.d, n: m.n };
    const coupe = { x: m.x, z: m.z, w: m.w, d: m.d, n: m.n };
    if (delta > 0) {
      pose[taille] = recouvre;
      coupe[cle] = m[cle] + recouvre;
      coupe[taille] = Math.abs(delta);
    } else {
      pose[cle] = dessous[cle];
      pose[taille] = recouvre;
      coupe[taille] = Math.abs(delta);
    }
    etat.debris.push(debrisDe(coupe, cle, Math.sign(delta)));
    etat.serie = 0;
    jouer("clic");
  }
  etat.etages.push(pose);
  if (pose.n % TOIT_TOUS === 0) {
    jouer("bonus");
  }
  majScoreCourant(ID, score());
  nouvelEtageMobile();
}

function debrisDe(boite, axe, sens) {
  return {
    boite,
    y: boite.n * BH,
    vy: 0,
    rot: 0,
    vr: (1.2 + Math.random() * 1.6) * (sens || 1) * (axe === "x" ? 1 : -1),
    vx: (axe === "x" ? 40 : -40) * (sens || 1),
    decal: 0
  };
}

function texte(contenu, couleur) {
  etat.textes.push({ contenu, couleur, age: 0 });
}

function terminer() {
  etat.phase = "fin";
  etat.serie = 0;
  etat.secousse = 0.35;
  jouer("explosion");
  if (score() > etat.record) {
    etat.record = score();
    stockageRecord.ecrire(etat.record);
  }
  majScoreCourant(ID, score());
  setTimeout(() => {
    if (etat !== null && etat.phase === "fin" && !zone.hidden) {
      finDePartie(ID, score());
    }
  }, 1700);
}

// ---------------------------------------------------------------------
// Boucle
// ---------------------------------------------------------------------

function maj(dt) {
  if (etat === null || etat.pause) {
    return;
  }
  etat.temps += dt;
  etat.secousse = Math.max(0, etat.secousse - dt);

  const m = etat.mobile;
  if (m !== null && etat.phase === "jeu") {
    const dessous = sommet();
    let v = vitesse();
    if (m.souffle) {
      m.t += dt;
      v *= 1 + 0.55 * Math.sin(m.t * 3.2);
    }
    m.pos += m.sens * v * dt;
    if (m.pos > COURSE) {
      m.pos = COURSE;
      m.sens = -1;
    } else if (m.pos < -COURSE) {
      m.pos = -COURSE;
      m.sens = 1;
    }
    if (m.axe === "x") {
      m.x = dessous.x + m.pos;
    } else {
      m.z = dessous.z + m.pos;
    }
  }

  // Les morceaux tranches tombent en tournoyant
  etat.debris = etat.debris.filter(d => {
    d.vy += GRAVITE * dt;
    d.y -= d.vy * dt;
    d.rot += d.vr * dt;
    d.decal += d.vx * dt;
    return d.y > etat.camH - 900;
  });
  etat.ondes = etat.ondes.filter(o => {
    o.age += dt;
    return o.age < 0.5;
  });
  etat.textes = etat.textes.filter(t => {
    t.age += dt;
    return t.age < 0.9;
  });

  // Camera : elle suit le sommet ; en fin de partie, elle recule pour
  // montrer toute la tour
  const haut = (sommet().n + 1) * BH;
  let cibleH = haut;
  let cibleZoom = 1;
  if (etat.phase === "fin") {
    cibleZoom = Math.min(1, (H * 0.56) / ((haut + 40) * K));
    // Le sommet se cale sous le score, le pied vers le bas de l'ecran
    cibleH = haut - (OY - H * 0.3) / (K * cibleZoom);
  }
  etat.camH += (cibleH - etat.camH) * Math.min(1, dt * (etat.phase === "fin" ? 2.2 : 6));
  etat.zoom += (cibleZoom - etat.zoom) * Math.min(1, dt * 2.2);
}

// ---------------------------------------------------------------------
// Projection isometrique
// ---------------------------------------------------------------------

function P(x, y, z) {
  const k = K * etat.zoom;
  return [CX + (x - z) * 0.866 * k, OY + (x + z) * 0.5 * k - (y - etat.camH) * k];
}

function couleur(n, lumiere) {
  const h = (etat.teinte + n * 3.2) % 360;
  return "hsl(" + h.toFixed(0) + ", 42%, " + lumiere + "%)";
}

function polygone(points, remplissage) {
  ctx.beginPath();
  points.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
  ctx.closePath();
  ctx.fillStyle = remplissage;
  ctx.fill();
}

// Les trois faces visibles d'une boite, eclairees chacune a sa facon
function faces(b, y0, hauteur) {
  const y1 = y0 + hauteur;
  return {
    dessus: [P(b.x, y1, b.z), P(b.x + b.w, y1, b.z), P(b.x + b.w, y1, b.z + b.d), P(b.x, y1, b.z + b.d)],
    droite: [P(b.x + b.w, y1, b.z), P(b.x + b.w, y1, b.z + b.d), P(b.x + b.w, y0, b.z + b.d), P(b.x + b.w, y0, b.z)],
    gauche: [P(b.x, y1, b.z + b.d), P(b.x + b.w, y1, b.z + b.d), P(b.x + b.w, y0, b.z + b.d), P(b.x, y0, b.z + b.d)]
  };
}

function boite(b, y0, hauteur, n, rotation) {
  let f = faces(b, y0, hauteur);
  if (rotation) {
    // Rotation a l'ecran autour du centre du morceau
    const tous = [...f.dessus, ...f.droite, ...f.gauche];
    const cx = tous.reduce((s, p) => s + p[0], 0) / tous.length;
    const cy = tous.reduce((s, p) => s + p[1], 0) / tous.length;
    const c = Math.cos(rotation.angle);
    const s = Math.sin(rotation.angle);
    const tourner = p => [cx + (p[0] - cx) * c - (p[1] - cy) * s + rotation.dx, cy + (p[0] - cx) * s + (p[1] - cy) * c];
    f = { dessus: f.dessus.map(tourner), droite: f.droite.map(tourner), gauche: f.gauche.map(tourner) };
  }
  polygone(f.gauche, couleur(n, 46));
  polygone(f.droite, couleur(n, 56));
  polygone(f.dessus, couleur(n, 70));
  // Une fine ligne d'ombre au pied de chaque face : on lit les etages
  ctx.strokeStyle = couleur(n, 36);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(f.gauche[3][0], f.gauche[3][1]);
  ctx.lineTo(f.gauche[2][0], f.gauche[2][1]);
  ctx.lineTo(f.droite[3][0], f.droite[3][1]);
  ctx.stroke();
}

// Toit de pagode : une dalle sombre plus large que l'etage, coins relevés
function toit(b, y0, n) {
  const marge = Math.min(13, 5 + Math.min(b.w, b.d) * 0.09);
  const y = y0 + BH;
  const r = { x: b.x - marge, z: b.z - marge, w: b.w + marge * 2, d: b.d + marge * 2 };
  const leve = 9;
  const coins = [
    P(r.x, y + leve, r.z), P(r.x + r.w, y + leve, r.z), P(r.x + r.w, y + leve, r.z + r.d), P(r.x, y + leve, r.z + r.d)
  ];
  const milieux = [
    P(r.x + r.w / 2, y, r.z), P(r.x + r.w, y, r.z + r.d / 2), P(r.x + r.w / 2, y, r.z + r.d), P(r.x, y, r.z + r.d / 2)
  ];
  // Tuiles laquees rouge sombre, comme les toits des pagodes
  const sombre = "#6a2a26";
  const tranche = "#3c1714";
  // Epaisseur de la dalle, sur les deux cotes vus
  const bas = [P(r.x + r.w, y - 3, r.z), P(r.x + r.w, y - 3, r.z + r.d), P(r.x, y - 3, r.z + r.d)];
  polygone([coins[1], milieux[1], coins[2], milieux[2], coins[3], bas[2], bas[1], bas[0]], tranche);
  // Dessus : un contour aux coins releves, bords legerement creuses
  ctx.beginPath();
  ctx.moveTo(coins[0][0], coins[0][1]);
  for (let i = 0; i < 4; i++) {
    const c = coins[(i + 1) % 4];
    const mid = milieux[i];
    ctx.quadraticCurveTo(mid[0], mid[1] + 3 * etat.zoom, c[0], c[1]);
  }
  ctx.closePath();
  ctx.fillStyle = sombre;
  ctx.fill();
  // Arete du faitage : un fin trait clair vers le centre
  const centre = P(b.x + b.w / 2, y + 2, b.z + b.d / 2);
  ctx.strokeStyle = "#a8463c";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  coins.forEach(c => {
    ctx.moveTo(c[0], c[1]);
    ctx.lineTo(centre[0], centre[1]);
  });
  ctx.stroke();
}

// ---------------------------------------------------------------------
// Ciel
// ---------------------------------------------------------------------

const CIELS = [
  [0, [178, 222, 238], [248, 230, 206]],
  [40, [96, 170, 226], [206, 234, 246]],
  [90, [122, 88, 156], [244, 170, 120]],
  [140, [42, 36, 86], [140, 78, 122]],
  [200, [10, 12, 36], [28, 30, 70]]
];

function melanger(a, b, t) {
  return a.map((v, i) => Math.round(v + (b[i] - v) * t));
}

function cielA(niveau) {
  for (let i = 0; i < CIELS.length - 1; i++) {
    const [n0, h0, b0] = CIELS[i];
    const [n1, h1, b1] = CIELS[i + 1];
    if (niveau <= n1) {
      const t = Math.max(0, (niveau - n0) / (n1 - n0));
      return [melanger(h0, h1, t), melanger(b0, b1, t)];
    }
  }
  const dernier = CIELS[CIELS.length - 1];
  return [dernier[1], dernier[2]];
}

function rgb(c, a) {
  return a === undefined ? "rgb(" + c.join(",") + ")" : "rgba(" + c.join(",") + "," + a + ")";
}

function dessinerCiel() {
  // En fin de partie la camera recule : le ciel garde l'altitude atteinte
  const niveau = etat.phase === "fin" ? sommet().n : etat.camH / BH;
  const [haut, bas] = cielA(niveau);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, rgb(haut));
  g.addColorStop(1, rgb(bas));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Etoiles : elles apparaissent a la tombee de la nuit
  const nuit = Math.max(0, Math.min(1, (niveau - 130) / 60));
  if (nuit > 0) {
    ctx.fillStyle = "rgba(255,248,230," + nuit + ")";
    etat.etoiles.forEach(e => ctx.fillRect(e.x, e.y * 0.8, e.t, e.t));
  }
  // Soleil le jour, lune la nuit
  const jour = 1 - Math.max(0, Math.min(1, (niveau - 70) / 50));
  if (jour > 0) {
    ctx.fillStyle = "rgba(255,244,214," + (0.9 * jour) + ")";
    ctx.beginPath();
    ctx.arc(W * 0.78, 120 + niveau * 0.6, 26, 0, Math.PI * 2);
    ctx.fill();
  }
  if (nuit > 0) {
    ctx.fillStyle = "rgba(240,232,210," + nuit + ")";
    ctx.beginPath();
    ctx.arc(W * 0.22, 110, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgb(haut, nuit);
    ctx.beginPath();
    ctx.arc(W * 0.22 + 8, 104, 17, 0, Math.PI * 2);
    ctx.fill();
  }

  // Montagnes : elles s'enfoncent a mesure que la tour monte
  const descente = etat.camH * K * 0.22;
  [[0.78, 46, 0.5], [0.86, 30, 0.75]].forEach(([base, amplitude, teinte], k) => {
    const c = melanger(bas, [40, 46, 70], teinte);
    ctx.fillStyle = rgb(c);
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 10) {
      const y = H * base + descente * (k + 1) - Math.abs(Math.sin(x * 0.013 + k * 2.1)) * amplitude - Math.sin(x * 0.04 + k) * 6;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
  });

  // Nuages a altitude fixe, en parallaxe : on les traverse en montant
  const voile = Math.max(0, 1 - nuit * 1.6) * 0.88;
  etat.nuages.forEach(n => {
    const y = OY - (n.h - etat.camH) * K * 0.55;
    if (y < -40 || y > H + 40) {
      return;
    }
    // Plus discrets sous le score, pour qu'il reste lisible
    ctx.fillStyle = "rgba(255,255,255," + (y < 150 ? voile * 0.45 : voile) + ")";
    const s = n.taille;
    ctx.beginPath();
    ctx.ellipse(n.x, y, 34 * s, 9 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(n.x - 16 * s, y - 6 * s, 16 * s, 9 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(n.x + 12 * s, y - 8 * s, 20 * s, 11 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

// ---------------------------------------------------------------------
// Image
// ---------------------------------------------------------------------

function dessinerSocle() {
  // Un socle de pierre en deux marches, sous l'etage zero
  const marches = [{ marge: 26, h: 18 }, { marge: 14, h: 14 }];
  let y = -32;
  marches.forEach(mch => {
    const b = { x: -TAILLE / 2 - mch.marge, z: -TAILLE / 2 - mch.marge, w: TAILLE + mch.marge * 2, d: TAILLE + mch.marge * 2 };
    const f = faces(b, y, mch.h);
    polygone(f.gauche, "#5d5a63");
    polygone(f.droite, "#76727c");
    polygone(f.dessus, "#9a96a0");
    y += mch.h;
  });
  // Le pilier sous le socle file vers le bas de l'ecran
  const b = { x: -TAILLE / 2 - 26, z: -TAILLE / 2 - 26, w: TAILLE + 52, d: TAILLE + 52 };
  const f = faces(b, -2000, 1968);
  polygone(f.gauche, "#4a4750");
  polygone(f.droite, "#5f5b66");
}

function dessiner() {
  if (etat === null) {
    return;
  }
  ctx.setTransform(echelle, 0, 0, echelle, 0, 0);
  dessinerCiel();
  ctx.save();
  if (etat.secousse > 0) {
    const f = etat.secousse * 14;
    ctx.translate((Math.random() - 0.5) * f, (Math.random() - 0.5) * f);
  }
  dessinerSocle();

  // Etages poses, du bas vers le haut, avec un toit tous les huit
  const premier = Math.max(0, Math.floor((etat.camH - H / (K * etat.zoom)) / BH) - 2);
  etat.etages.forEach(e => {
    if (e.n < premier && e.n !== 0) {
      return;
    }
    const y0 = (e.n - 1) * BH;
    boite(e, y0, BH, e.n);
    if (e.n > 0 && e.n % TOIT_TOUS === 0) {
      toit(e, y0, e.n);
    }
  });

  // Ondes des poses parfaites, sur le dessus de l'etage
  etat.ondes.forEach(o => {
    const e = o.etage;
    const k = o.age / 0.5;
    const marge = 4 + k * 22;
    const y = e.n * BH + 0.5;
    const pts = [P(e.x - marge, y, e.z - marge), P(e.x + e.w + marge, y, e.z - marge), P(e.x + e.w + marge, y, e.z + e.d + marge), P(e.x - marge, y, e.z + e.d + marge)];
    ctx.strokeStyle = "rgba(255,255,255," + (1 - k) + ")";
    ctx.lineWidth = 3 * (1 - k) + 1;
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.closePath();
    ctx.stroke();
  });

  // L'etage qui glisse
  const m = etat.mobile;
  if (m !== null && etat.phase === "jeu") {
    boite(m, (m.n - 1) * BH, BH, m.n);
  }

  // Morceaux qui tombent
  etat.debris.forEach(d => {
    boite(d.boite, d.y - BH, BH, d.boite.n, { angle: d.rot, dx: d.decal * K * etat.zoom });
  });
  ctx.restore();

  // Score en grand, facon appli mobile
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const clair = (etat.phase === "fin" ? sommet().n : etat.camH / BH) < 110;
  const teinteTexte = clair ? "rgba(20,22,40,0.85)" : "rgba(255,250,240,0.92)";
  if (etat.phase !== "attente") {
    ctx.font = "800 64px 'Anybody', sans-serif";
    ctx.fillStyle = teinteTexte;
    ctx.fillText(String(score()), W / 2, 74);
  }
  etat.textes.forEach(t => {
    const k = t.age / 0.9;
    ctx.globalAlpha = 1 - k;
    ctx.font = "800 18px 'Anybody', sans-serif";
    ctx.fillStyle = clair ? "rgba(20,22,40,0.9)" : "#ffffff";
    ctx.fillText(t.contenu, W / 2, 124 - k * 16);
    ctx.globalAlpha = 1;
  });

  if (etat.phase === "attente") {
    ctx.font = "800 54px 'Anybody', sans-serif";
    ctx.fillStyle = teinteTexte;
    ctx.fillText("STACK", W / 2, 96);
    ctx.font = "600 11px 'Martian Mono', monospace";
    ctx.fillText(etat.record ? "Record : " + etat.record + " étages" : "Empile la plus haute pagode", W / 2, 134);
    ctx.font = "600 12px 'Martian Mono', monospace";
    ctx.fillText("Touche pour commencer", W / 2, H - 46);
  } else if (etat.phase === "fin") {
    ctx.font = "600 11px 'Martian Mono', monospace";
    ctx.fillStyle = teinteTexte;
    ctx.fillText(score() >= etat.record && score() > 0 ? "Nouveau record !" : "Record : " + etat.record, W / 2, 116);
    ctx.fillText("Partie terminée", W / 2, 136);
  }
  if (etat.pause) {
    ctx.fillStyle = "rgba(10,10,20,0.55)";
    ctx.fillRect(0, 0, W, H);
    ctx.font = "800 40px 'Anybody', sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.fillText("PAUSE", W / 2, H / 2);
  }
}

// La manette peut apparaitre juste apres le demarrage : on reverifie
// la place de temps en temps plutot qu'a chaque image
let signature = "";
let compteurImages = 0;
function verifierPlace() {
  if (++compteurImages % 20 !== 0) {
    return;
  }
  const s = window.innerWidth + "x" + window.innerHeight + ":" + document.body.classList.contains("avec-manette");
  if (s !== signature) {
    signature = s;
    ajuster();
  }
}

const boucle = creerBoucle(function (dt) {
  verifierPlace();
  maj(dt);
  dessiner();
}, { plafond: 1 / 30 });

// La taille suit la place : panneaux lateraux sur grand ecran, manette sur telephone
function ajuster() {
  const marge = window.innerWidth >= 1100 ? 500 : 0;
  const largeur = Math.min(window.innerWidth * 0.96 - marge, 520);
  const entete = zone.querySelector(".entete-pagode").getBoundingClientRect().height || 40;
  // --hauteur-manette vaut "calc(...)" : on mesure la manette elle-meme
  const pave = document.querySelector(".manette");
  const manette = pave && !pave.hidden && document.body.classList.contains("avec-manette") ? pave.getBoundingClientRect().height : 0;
  const hauteur = Math.max(260, window.innerHeight - entete - manette - 52);
  const taille = Math.min(largeur / W, hauteur / H);
  canvas.style.width = Math.floor(W * taille) + "px";
  canvas.style.height = Math.floor(H * taille) + "px";
  echelle = Math.min(3, Math.max(1, taille * (window.devicePixelRatio || 1)));
  canvas.width = Math.round(W * echelle);
  canvas.height = Math.round(H * echelle);
}

window.addEventListener("resize", function () {
  if (!zone.hidden) {
    ajuster();
  }
});

// ---------------------------------------------------------------------
// Commandes
// ---------------------------------------------------------------------

function majBoutonSon() {
  boutonSon.textContent = sonActif() ? "Son" : "Muet";
}

function demarrer() {
  etat = nouvelEtat();
  ajuster();
  requestAnimationFrame(ajuster);
  majScoreCourant(ID, 0);
  majBoutonSon();
  boucle.lancer();
}

function basculerPause() {
  if (etat === null || etat.phase !== "jeu") {
    return;
  }
  etat.pause = !etat.pause;
  if (!etat.pause) {
    boucle.remettreALHeure();
  }
}

surTouche(ID, function (evenement) {
  const touche = evenement.key.toLowerCase();
  if (touche === " " || touche === "arrowup" || touche === "enter" || touche === "z" || touche === "w" || touche === "b") {
    if (!evenement.repeat) {
      poser();
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
  poser();
});
zone.addEventListener("contextmenu", evenement => evenement.preventDefault());

document.addEventListener("visibilitychange", function () {
  if (document.hidden && etat !== null && !etat.pause && etat.phase === "jeu" && !zone.hidden) {
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
export const _test = { get etat() { return etat; }, poser };

enregistrerJeu({
  id: ID,
  nom: "Stack",
  code: "2016",
  section: zone,
  demarrer,
  arreter: () => boucle.arreter(),
  manette: { a: " ", b: "b", start: "p", libelles: { a: "Poser", b: "Poser" } }
});
