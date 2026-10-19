// =====================================================================
//  ASTEROIDS (Bunbuku, la bouilloire dans les etoiles)
//  D'apres le conte du Bunbuku chagama : le tanuki change en bouilloire
//  n'a jamais retrouve sa forme. Ici il derive dans l'espace, crache sa
//  vapeur pour avancer et tire des gouttes de the brulant sur les
//  rochers qui l'entourent.
//
//  Regles de la borne de 1979 :
//  - inertie : la poussee accelere, rien ne freine sauf un leger
//    frottement ; l'ecran boucle sur ses bords ;
//  - trois tailles de rochers, chacun se fend en deux plus petits ;
//  - des yokai traversent l'ecran et tirent ;
//  - hyperespace : on disparait pour reapparaitre au hasard ;
//  - une vie tous les 10 000 points.
//  En plus : un bouclier qui se recharge, et des vagues sans fin dont
//  la composition change (rochers de lave, de glace, nuees de suie qui
//  traquent, gros rochers qui se fendent en trois).
// =====================================================================

import { enregistrerJeu, finDePartie, quitterJeu, majScoreCourant } from "./arcade.js";
import { creerBoucle } from "./noyau/boucle.js";
import { surTouche } from "./noyau/clavier.js";
import { jouer, basculerSon, sonActif } from "./noyau/son.js";

const ID = "bunbuku";
const W = 720;
const H = 540;

const ROTATION = 4.4;          // radians par seconde
const POUSSEE = 290;           // px/s2
const FROTTEMENT = 0.38;       // perte de vitesse par seconde
const VITESSE_MAX = 380;
const VITESSE_TIR = 470;
const VIE_TIR = 0.9;
const TIRS_MAX = 5;
const CADENCE = 0.16;
const VIE_EN_PLUS = 10000;
const RAYON_JOUEUR = 16;

// Les trois tailles de rochers (la taille -1 est le geant des vagues de boss)
const TAILLES = [
  { rayon: 36, points: 20, vitesse: 38 },
  { rayon: 20, points: 50, vitesse: 66 },
  { rayon: 11, points: 100, vitesse: 100 }
];
const GEANT = { rayon: 58, points: 300, vitesse: 24 };

// Palettes de rochers : chaque vague choisit sa matiere
const MATIERES = [
  { nom: "basalte", clair: "#9a93a8", base: "#6a6478", sombre: "#3c3848", eclat: "#c9c3d6" },
  { nom: "lave", clair: "#d4805a", base: "#8e3e2a", sombre: "#4a1c14", eclat: "#ffb070" },
  { nom: "glace", clair: "#cde8f4", base: "#7fb2c9", sombre: "#3a6478", eclat: "#ffffff" },
  { nom: "jade", clair: "#a8d8a0", base: "#4f8f5a", sombre: "#24482c", eclat: "#d8f5c8" }
];

// ---------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------

const zone = document.createElement("section");
zone.className = "jeu jeu-bunbuku";
zone.id = "jeuBunbuku";
zone.hidden = true;
zone.innerHTML = `
  <div class="jeu-entete entete-bunbuku">
    <span class="entete-boutons">
      <button class="jeu-quitter" id="sonBunbuku" type="button" aria-pressed="false">Son</button>
      <button class="jeu-quitter" id="rejouerBunbuku" type="button">Rejouer</button>
      <button class="jeu-quitter" id="quitterBunbuku" type="button">Retour</button>
    </span>
  </div>
  <canvas id="canvasBunbuku"></canvas>
  <p class="jeu-aide">Gauche et droite pour tourner, Haut pour la vapeur, Espace pour tirer. Bas pour le bouclier (il se recharge), X pour l'hyperespace. P pause, M son, N rejouer, &Eacute;chap quitter.</p>`;
document.body.appendChild(zone);

const canvas = zone.querySelector("#canvasBunbuku");
const ctx = canvas.getContext("2d");
const boutonSon = zone.querySelector("#sonBunbuku");

// ---------------------------------------------------------------------
// Etat
// ---------------------------------------------------------------------

let echelle = 1;
let etat = null;
let fond = null;
let temps = 0;
const commandes = { gauche: false, droite: false, poussee: false, tir: false, bouclier: false };

function alea(a, b) {
  return a + Math.random() * (b - a);
}

function nouvelEtat() {
  return {
    score: 0,
    vies: 3,
    prochaineVie: VIE_EN_PLUS,
    vague: 0,
    matiere: MATIERES[0],
    rochers: [],
    tirs: [],
    tirsEnnemis: [],
    ennemis: [],
    suies: [],
    eclats: [],
    poussieres: [],
    textes: [],
    joueur: null,
    attenteJoueur: 0,
    attenteVague: 0,
    prochainEnnemi: 12,
    secousse: 0,
    banniere: null,
    pause: false,
    termine: false,
    debut: true,
    finAge: 0
  };
}

function nouveauJoueur() {
  return {
    x: W / 2, y: H / 2, vx: 0, vy: 0, angle: -Math.PI / 2,
    rechargement: 0, invincible: 2.2, poussee: false,
    bouclier: 1, bouclierActif: false, hyper: 0, flamme: 0
  };
}

// Un rocher irregulier : rayon variable par sommet, facettes precalculees
function nouveauRocher(taille, x, y, vitesseBase, matiere) {
  const t = taille === -1 ? GEANT : TAILLES[taille];
  const sommets = [];
  const n = taille === -1 ? 14 : taille === 0 ? 11 : taille === 1 ? 9 : 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + alea(-0.15, 0.15);
    sommets.push({ a, r: t.rayon * alea(0.72, 1.08) });
  }
  // Deux ou trois cratere, toujours au meme endroit sur ce rocher
  const crateres = [];
  for (let i = 0; i < (taille === 2 ? 1 : 3); i++) {
    crateres.push({ a: alea(0, Math.PI * 2), d: alea(0.1, 0.55) * t.rayon, r: alea(0.12, 0.22) * t.rayon });
  }
  const dir = alea(0, Math.PI * 2);
  const v = t.vitesse * vitesseBase * alea(0.75, 1.25);
  return {
    taille, x, y, vx: Math.cos(dir) * v, vy: Math.sin(dir) * v,
    angle: alea(0, 6), rot: alea(-1.2, 1.2) / (taille === -1 ? 3 : 1),
    rayon: t.rayon, sommets, crateres, matiere: matiere || etat.matiere, touche: 0
  };
}

function facteurVitesse() {
  // Sans plafond, mais de plus en plus doucement
  return 1 + Math.sqrt(etat.vague) * 0.22 + etat.vague * 0.015;
}

function lancerVague() {
  etat.vague++;
  const v = etat.vague;
  etat.matiere = MATIERES[Math.floor((v - 1) / 3) % MATIERES.length];
  const boss = v % 5 === 0;
  const nombre = 3 + Math.floor(v * 0.75) + Math.floor(v / 10);
  const facteur = facteurVitesse();
  const j = etat.joueur;
  const place = () => {
    // Loin du joueur, depuis les bords
    for (let essai = 0; essai < 30; essai++) {
      const x = alea(0, W);
      const y = alea(0, H);
      if (!j || Math.hypot(x - j.x, y - j.y) > 170) {
        return [x, y];
      }
    }
    return [0, 0];
  };
  if (boss) {
    const geants = 1 + Math.floor(v / 15);
    for (let i = 0; i < geants; i++) {
      const [x, y] = place();
      etat.rochers.push(nouveauRocher(-1, x, y, facteur));
    }
    for (let i = 0; i < Math.floor(nombre / 2); i++) {
      const [x, y] = place();
      etat.rochers.push(nouveauRocher(0, x, y, facteur));
    }
  } else {
    for (let i = 0; i < nombre; i++) {
      const [x, y] = place();
      etat.rochers.push(nouveauRocher(i < nombre - Math.floor(v / 4) ? 0 : 1, x, y, facteur));
    }
  }
  // Une vague sur trois apporte une nuee de suie qui traque
  if (v >= 3 && v % 3 === 0) {
    const nuee = 3 + Math.floor(v / 3);
    for (let i = 0; i < nuee; i++) {
      const [x, y] = place();
      etat.suies.push({ x, y, vx: 0, vy: 0, phase: alea(0, 6) });
    }
  }
  etat.prochainEnnemi = Math.max(4, 14 - v * 0.6) + alea(0, 4);
  etat.banniere = { texte: boss ? "VAGUE " + v + " : GÉANTS" : "VAGUE " + v, sous: etat.matiere.nom.toUpperCase(), age: 0 };
  if (v > 1) {
    jouer("vague");
  }
}

// ---------------------------------------------------------------------
// Monde
// ---------------------------------------------------------------------

function boucler(o) {
  if (o.x < 0) {
    o.x += W;
  } else if (o.x >= W) {
    o.x -= W;
  }
  if (o.y < 0) {
    o.y += H;
  } else if (o.y >= H) {
    o.y -= H;
  }
}

function distance(a, b) {
  let dx = Math.abs(a.x - b.x);
  let dy = Math.abs(a.y - b.y);
  dx = Math.min(dx, W - dx);
  dy = Math.min(dy, H - dy);
  return Math.hypot(dx, dy);
}

function ajouterPoints(n, x, y) {
  etat.score += n;
  if (x !== undefined) {
    etat.textes.push({ texte: String(n), x, y, age: 0 });
  }
  if (etat.score >= etat.prochaineVie) {
    etat.prochaineVie += VIE_EN_PLUS;
    etat.vies++;
    etat.textes.push({ texte: "VIE EN PLUS", x: W / 2, y: H / 2 - 60, age: 0, grand: true });
    jouer("vie");
  }
  majScoreCourant(ID, etat.score);
}

function exploser(x, y, couleurs, nombre, force) {
  for (let i = 0; i < nombre; i++) {
    const a = alea(0, Math.PI * 2);
    const v = alea(40, force);
    const taille = alea(2, 6);
    etat.eclats.push({
      x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      vie: alea(0.5, 1.1), angle: alea(0, 6), rot: alea(-8, 8),
      // Petit eclat triangulaire, pas un carre
      forme: [[taille, 0], [-taille * 0.6, taille * 0.7], [-taille * 0.5, -taille * 0.8]],
      couleur: couleurs[i % couleurs.length]
    });
  }
  for (let i = 0; i < Math.ceil(nombre / 4); i++) {
    etat.poussieres.push({ x: x + alea(-6, 6), y: y + alea(-6, 6), r: alea(6, 14), vie: alea(0.4, 0.8), duree: 0.8 });
  }
}

function fendre(rocher) {
  const m = rocher.matiere;
  ajouterPoints((rocher.taille === -1 ? GEANT : TAILLES[rocher.taille]).points, rocher.x, rocher.y);
  exploser(rocher.x, rocher.y, [m.clair, m.base, m.sombre, m.eclat], rocher.taille === 2 ? 10 : rocher.taille === -1 ? 34 : 18, rocher.taille === -1 ? 260 : 180);
  etat.secousse = Math.max(etat.secousse, rocher.taille === -1 ? 0.35 : rocher.taille === 0 ? 0.15 : 0.06);
  jouer(rocher.taille === 2 ? "impact" : rocher.taille === -1 ? "grosseExplosion" : "explosion");
  if (rocher.taille === 2) {
    return;
  }
  const suivante = rocher.taille === -1 ? 0 : rocher.taille + 1;
  const morceaux = rocher.taille === -1 ? 3 : 2;
  for (let i = 0; i < morceaux; i++) {
    const r = nouveauRocher(suivante, rocher.x, rocher.y, facteurVitesse(), m);
    r.vx += rocher.vx * 0.5;
    r.vy += rocher.vy * 0.5;
    etat.rochers.push(r);
  }
}

function tirer() {
  const j = etat.joueur;
  if (!j || j.rechargement > 0 || etat.tirs.length >= TIRS_MAX || j.hyper > 0) {
    return;
  }
  j.rechargement = CADENCE;
  const bx = j.x + Math.cos(j.angle) * 18;
  const by = j.y + Math.sin(j.angle) * 18;
  etat.tirs.push({ x: bx, y: by, vx: Math.cos(j.angle) * VITESSE_TIR + j.vx, vy: Math.sin(j.angle) * VITESSE_TIR + j.vy, vie: VIE_TIR });
  jouer("tir");
}

function hyperespace() {
  const j = etat ? etat.joueur : null;
  if (!j || j.hyper > 0 || etat.pause || etat.termine) {
    return;
  }
  exploser(j.x, j.y, ["#e8dcc0", "#9fd0e0"], 8, 90);
  j.hyper = 0.6;
  j.cibleX = alea(40, W - 40);
  j.cibleY = alea(40, H - 40);
  jouer("pouvoir");
}

function perdreVie() {
  const j = etat.joueur;
  exploser(j.x, j.y, ["#c8372d", "#e8b83a", "#ede8df", "#6b4f33"], 36, 240);
  etat.secousse = 0.5;
  etat.joueur = null;
  etat.vies--;
  jouer("mort");
  if (etat.vies <= 0) {
    etat.termine = true;
    setTimeout(() => {
      if (etat && etat.termine && !zone.hidden) {
        finDePartie(ID, etat.score);
      }
    }, 2200);
  } else {
    etat.attenteJoueur = 1.6;
  }
}

function zoneLibre() {
  const centre = { x: W / 2, y: H / 2 };
  return etat.rochers.every(r => distance(r, centre) > r.rayon + 90) &&
    etat.ennemis.every(e => distance(e, centre) > 120);
}

// Les yokai : la lanterne chochin-obake, lente, tire au hasard ;
// le feu de renard (kitsune-bi), petit et rapide, vise le joueur
function lancerEnnemi() {
  const v = etat.vague;
  const precis = etat.score > 6000 && Math.random() < Math.min(0.85, 0.25 + v * 0.05);
  const gauche = Math.random() < 0.5;
  const y = alea(60, H - 60);
  etat.ennemis.push({
    type: precis ? "renard" : "lanterne",
    x: gauche ? -20 : W + 20, y, vx: (gauche ? 1 : -1) * (precis ? 120 : 75) * Math.min(2, 1 + v * 0.03),
    vy: 0, base: y, phase: alea(0, 6), cadence: precis ? Math.max(0.55, 1.4 - v * 0.04) : 1.6,
    attente: 1, rayon: precis ? 11 : 18, vie: precis ? 1 : 2
  });
}

function tirEnnemi(e) {
  const j = etat.joueur;
  let a;
  if (e.type === "renard" && j) {
    // Vise, avec une erreur qui fond au fil des vagues
    const erreur = Math.max(0.05, 0.4 - etat.vague * 0.02);
    a = Math.atan2(j.y - e.y, j.x - e.x) + alea(-erreur, erreur);
  } else {
    a = alea(0, Math.PI * 2);
  }
  const vitesse = 240 + Math.min(200, etat.vague * 6);
  etat.tirsEnnemis.push({ x: e.x, y: e.y, vx: Math.cos(a) * vitesse, vy: Math.sin(a) * vitesse, vie: 1.6 });
}

// ---------------------------------------------------------------------
// Mise a jour
// ---------------------------------------------------------------------

function maj(dt) {
  temps += dt;
  if (etat === null || etat.pause) {
    return;
  }
  majParticules(dt);
  if (etat.debut) {
    return;
  }
  if (etat.termine) {
    etat.finAge += dt;
  }
  etat.secousse = Math.max(0, etat.secousse - dt);
  if (etat.banniere) {
    etat.banniere.age += dt;
    if (etat.banniere.age > 2.2) {
      etat.banniere = null;
    }
  }

  const j = etat.joueur;
  if (j) {
    majJoueur(j, dt);
  } else if (!etat.termine) {
    etat.attenteJoueur -= dt;
    if (etat.attenteJoueur <= 0 && zoneLibre()) {
      etat.joueur = nouveauJoueur();
    }
  }

  etat.tirs = etat.tirs.filter(t => {
    t.x += t.vx * dt;
    t.y += t.vy * dt;
    boucler(t);
    t.vie -= dt;
    return t.vie > 0;
  });
  etat.tirsEnnemis = etat.tirsEnnemis.filter(t => {
    t.x += t.vx * dt;
    t.y += t.vy * dt;
    boucler(t);
    t.vie -= dt;
    return t.vie > 0;
  });
  etat.rochers.forEach(r => {
    r.x += r.vx * dt;
    r.y += r.vy * dt;
    r.angle += r.rot * dt;
    r.touche = Math.max(0, r.touche - dt);
    boucler(r);
  });

  // Suie : elle traque le joueur, avec un peu d'inertie
  etat.suies.forEach(s => {
    s.phase += dt * 6;
    const cible = etat.joueur || { x: W / 2, y: H / 2 };
    let dx = cible.x - s.x;
    let dy = cible.y - s.y;
    if (Math.abs(dx) > W / 2) {
      dx -= Math.sign(dx) * W;
    }
    if (Math.abs(dy) > H / 2) {
      dy -= Math.sign(dy) * H;
    }
    const d = Math.hypot(dx, dy) || 1;
    const acc = 70 + etat.vague * 3;
    s.vx += (dx / d) * acc * dt;
    s.vy += (dy / d) * acc * dt;
    const v = Math.hypot(s.vx, s.vy);
    const max = 90 + Math.min(110, etat.vague * 4);
    if (v > max) {
      s.vx *= max / v;
      s.vy *= max / v;
    }
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    boucler(s);
  });

  // Yokai
  etat.prochainEnnemi -= dt;
  if (etat.prochainEnnemi <= 0 && etat.ennemis.length < 1 + Math.floor(etat.vague / 6) && !etat.termine) {
    lancerEnnemi();
    etat.prochainEnnemi = Math.max(4, 16 - etat.vague * 0.5) + alea(0, 5);
  }
  etat.ennemis = etat.ennemis.filter(e => {
    e.phase += dt;
    e.x += e.vx * dt;
    e.y = e.base + Math.sin(e.phase * (e.type === "renard" ? 3 : 1.4)) * (e.type === "renard" ? 50 : 26);
    e.attente -= dt;
    if (e.attente <= 0) {
      e.attente = e.cadence;
      tirEnnemi(e);
    }
    return e.x > -40 && e.x < W + 40;
  });

  collisions();

  if (!etat.termine && etat.rochers.length === 0 && etat.suies.length === 0) {
    etat.attenteVague += dt;
    if (etat.attenteVague > 1.4) {
      etat.attenteVague = 0;
      lancerVague();
    }
  }
}

function majJoueur(j, dt) {
  if (j.hyper > 0) {
    j.hyper -= dt;
    if (j.hyper <= 0.3 && j.cibleX !== undefined) {
      j.x = j.cibleX;
      j.y = j.cibleY;
      j.vx *= 0.3;
      j.vy *= 0.3;
      j.cibleX = undefined;
      exploser(j.x, j.y, ["#e8dcc0", "#9fd0e0"], 8, 90);
    }
    return;
  }
  if (commandes.gauche) {
    j.angle -= ROTATION * dt;
  }
  if (commandes.droite) {
    j.angle += ROTATION * dt;
  }
  j.poussee = commandes.poussee;
  if (j.poussee) {
    j.vx += Math.cos(j.angle) * POUSSEE * dt;
    j.vy += Math.sin(j.angle) * POUSSEE * dt;
    j.flamme += dt;
    // Bouffees de vapeur qui restent derriere
    if (Math.random() < dt * 30) {
      etat.poussieres.push({
        x: j.x - Math.cos(j.angle) * 18 + alea(-3, 3), y: j.y - Math.sin(j.angle) * 18 + alea(-3, 3),
        r: alea(3, 6), vie: 0.45, duree: 0.45, vapeur: true
      });
    }
  }
  const frein = Math.max(0, 1 - FROTTEMENT * dt);
  j.vx *= frein;
  j.vy *= frein;
  const v = Math.hypot(j.vx, j.vy);
  if (v > VITESSE_MAX) {
    j.vx *= VITESSE_MAX / v;
    j.vy *= VITESSE_MAX / v;
  }
  j.x += j.vx * dt;
  j.y += j.vy * dt;
  boucler(j);
  j.rechargement -= dt;
  j.invincible = Math.max(0, j.invincible - dt);
  if (commandes.tir) {
    tirer();
  }
  // Bouclier : il se vide quand on le tient, se recharge sinon
  j.bouclierActif = commandes.bouclier && j.bouclier > 0.05;
  if (j.bouclierActif) {
    j.bouclier = Math.max(0, j.bouclier - dt * 0.55);
  } else {
    j.bouclier = Math.min(1, j.bouclier + dt * 0.08);
  }
}

function collisions() {
  const j = etat.joueur;
  // Tirs contre rochers, suies, yokai
  etat.tirs = etat.tirs.filter(t => {
    for (let i = 0; i < etat.rochers.length; i++) {
      const r = etat.rochers[i];
      if (distance(t, r) < r.rayon * 0.92) {
        etat.rochers.splice(i, 1);
        fendre(r);
        return false;
      }
    }
    for (let i = 0; i < etat.suies.length; i++) {
      const s = etat.suies[i];
      if (distance(t, s) < 10) {
        etat.suies.splice(i, 1);
        ajouterPoints(150, s.x, s.y);
        exploser(s.x, s.y, ["#2a2630", "#4a4456", "#e8dcc0"], 10, 120);
        jouer("impact");
        return false;
      }
    }
    for (let i = 0; i < etat.ennemis.length; i++) {
      const e = etat.ennemis[i];
      if (distance(t, e) < e.rayon) {
        e.vie--;
        if (e.vie <= 0) {
          etat.ennemis.splice(i, 1);
          ajouterPoints(e.type === "renard" ? 1000 : 200, e.x, e.y);
          exploser(e.x, e.y, e.type === "renard" ? ["#ff9a3a", "#ffe08a", "#ffffff"] : ["#c8372d", "#ffd08a", "#2a1a12"], 22, 200);
          jouer("explosion");
        } else {
          jouer("impact");
        }
        return false;
      }
    }
    return true;
  });
  // Les tirs ennemis fendent aussi les rochers
  etat.tirsEnnemis = etat.tirsEnnemis.filter(t => {
    for (let i = 0; i < etat.rochers.length; i++) {
      const r = etat.rochers[i];
      if (distance(t, r) < r.rayon * 0.9) {
        etat.rochers.splice(i, 1);
        fendreSansPoints(r);
        return false;
      }
    }
    return true;
  });
  if (!j || j.hyper > 0) {
    return;
  }
  const protege = j.invincible > 0 || j.bouclierActif;
  const rayonBouclier = 28;
  for (let i = 0; i < etat.rochers.length; i++) {
    const r = etat.rochers[i];
    const d = distance(j, r);
    if (j.bouclierActif && d < r.rayon + rayonBouclier) {
      // Le bouclier repousse le rocher
      const a = Math.atan2(r.y - j.y, r.x - j.x);
      r.vx = Math.cos(a) * Math.max(60, Math.hypot(r.vx, r.vy));
      r.vy = Math.sin(a) * Math.max(60, Math.hypot(r.vx, r.vy));
      j.bouclier = Math.max(0, j.bouclier - 0.12);
      jouer("impact");
      continue;
    }
    if (!protege && d < r.rayon * 0.85 + RAYON_JOUEUR) {
      etat.rochers.splice(i, 1);
      fendre(r);
      perdreVie();
      return;
    }
  }
  for (let i = 0; i < etat.suies.length; i++) {
    const s = etat.suies[i];
    if (distance(j, s) < (j.bouclierActif ? rayonBouclier + 6 : RAYON_JOUEUR + 6)) {
      etat.suies.splice(i, 1);
      exploser(s.x, s.y, ["#2a2630", "#4a4456"], 8, 100);
      if (!protege) {
        perdreVie();
        return;
      }
    }
  }
  for (const t of etat.tirsEnnemis) {
    if (distance(j, t) < (j.bouclierActif ? rayonBouclier : RAYON_JOUEUR)) {
      t.vie = 0;
      if (!protege) {
        perdreVie();
        return;
      }
    }
  }
  for (const e of etat.ennemis) {
    if (!protege && distance(j, e) < e.rayon + RAYON_JOUEUR) {
      e.vie = 0;
      perdreVie();
      return;
    }
  }
}

function fendreSansPoints(r) {
  const avant = etat.score;
  fendre(r);
  etat.score = avant;
  etat.textes.pop();
  majScoreCourant(ID, etat.score);
}

function majParticules(dt) {
  etat.eclats = etat.eclats.filter(e => {
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    e.vx *= 1 - dt * 0.8;
    e.vy *= 1 - dt * 0.8;
    e.angle += e.rot * dt;
    e.vie -= dt;
    return e.vie > 0;
  });
  etat.poussieres = etat.poussieres.filter(p => {
    p.vie -= dt;
    p.r += dt * (p.vapeur ? 14 : 22);
    return p.vie > 0;
  });
  etat.textes = etat.textes.filter(t => {
    t.age += dt;
    return t.age < (t.grand ? 1.6 : 0.8);
  });
}

// ---------------------------------------------------------------------
// Decor : espace profond, planete, etoiles eparses en trois plans
// ---------------------------------------------------------------------

let etoiles = [];

function preparerEtoiles() {
  etoiles = [];
  for (let i = 0; i < 90; i++) {
    const plan = i < 50 ? 0 : i < 78 ? 1 : 2;
    etoiles.push({
      x: Math.random() * W, y: Math.random() * H, plan,
      r: plan === 0 ? 0.6 : plan === 1 ? 1 : 1.6,
      teinte: ["#ede8df", "#cfe0ff", "#ffe8c0"][i % 3]
    });
  }
}

function peindreFond() {
  const off = document.createElement("canvas");
  off.width = Math.round(W * echelle);
  off.height = Math.round(H * echelle);
  const c = off.getContext("2d");
  c.setTransform(echelle, 0, 0, echelle, 0, 0);
  const g = c.createLinearGradient(0, 0, W * 0.3, H);
  g.addColorStop(0, "#0b0a1c");
  g.addColorStop(0.55, "#120f2a");
  g.addColorStop(1, "#1a1030");
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  // Grande planete annelee, en aplats
  const px = W * 0.82;
  const py = H * 0.78;
  c.save();
  c.translate(px, py);
  c.rotate(-0.35);
  c.strokeStyle = "#3a2e5a";
  c.lineWidth = 6;
  c.beginPath();
  c.ellipse(0, 0, 150, 30, 0, Math.PI, Math.PI * 2);
  c.stroke();
  const gp = c.createLinearGradient(-90, -90, 90, 90);
  gp.addColorStop(0, "#4a3a72");
  gp.addColorStop(1, "#1e1638");
  c.fillStyle = gp;
  c.beginPath();
  c.arc(0, 0, 92, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "rgba(255,255,255,0.06)";
  c.beginPath();
  c.ellipse(-10, -30, 80, 14, 0, 0, Math.PI * 2);
  c.fill();
  c.beginPath();
  c.ellipse(0, 18, 86, 10, 0, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = "#5a4a86";
  c.lineWidth = 6;
  c.beginPath();
  c.ellipse(0, 0, 150, 30, 0, 0, Math.PI);
  c.stroke();
  c.restore();
  // Petite lune lointaine
  c.fillStyle = "#3a3458";
  c.beginPath();
  c.arc(W * 0.16, H * 0.2, 22, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#0f0d22";
  c.beginPath();
  c.arc(W * 0.16 + 9, H * 0.2 - 4, 20, 0, Math.PI * 2);
  c.fill();
  return off;
}

// ---------------------------------------------------------------------
// Dessin
// ---------------------------------------------------------------------

// Dessine un objet et ses copies quand il chevauche un bord
function partout(x, y, marge, dessin) {
  const xs = [x];
  const ys = [y];
  if (x < marge) {
    xs.push(x + W);
  } else if (x > W - marge) {
    xs.push(x - W);
  }
  if (y < marge) {
    ys.push(y + H);
  } else if (y > H - marge) {
    ys.push(y - H);
  }
  xs.forEach(ax => ys.forEach(ay => dessin(ax, ay)));
}

function dessinerRocher(r) {
  partout(r.x, r.y, r.rayon + 4, (x, y) => {
    const m = r.matiere;
    ctx.save();
    ctx.translate(x, y);
    // Ombre portee
    ctx.save();
    ctx.translate(4, 6);
    ctx.rotate(r.angle);
    tracerRocher(r);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fill();
    ctx.restore();
    ctx.rotate(r.angle);
    tracerRocher(r);
    const g = ctx.createLinearGradient(-r.rayon, -r.rayon, r.rayon, r.rayon);
    g.addColorStop(0, m.clair);
    g.addColorStop(0.5, m.base);
    g.addColorStop(1, m.sombre);
    ctx.fillStyle = r.touche > 0 ? m.eclat : g;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = m.sombre;
    ctx.stroke();
    // Facette eclairee, comme une face taillee
    ctx.save();
    tracerRocher(r);
    ctx.clip();
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    ctx.beginPath();
    ctx.moveTo(-r.rayon, -r.rayon);
    ctx.lineTo(r.rayon * 0.2, -r.rayon);
    ctx.lineTo(-r.rayon * 0.3, r.rayon * 0.1);
    ctx.lineTo(-r.rayon, r.rayon * 0.2);
    ctx.closePath();
    ctx.fill();
    // Crateres
    r.crateres.forEach(k => {
      const cx = Math.cos(k.a) * k.d;
      const cy = Math.sin(k.a) * k.d;
      ctx.fillStyle = m.sombre;
      ctx.beginPath();
      ctx.arc(cx, cy, k.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.beginPath();
      ctx.arc(cx + k.r * 0.25, cy + k.r * 0.25, k.r * 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = m.sombre;
      ctx.beginPath();
      ctx.arc(cx - k.r * 0.1, cy - k.r * 0.1, k.r * 0.7, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
    if (m.nom === "lave") {
      // Fissures incandescentes, en traits pleins
      ctx.strokeStyle = "#ffb04a";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-r.rayon * 0.4, -r.rayon * 0.2);
      ctx.lineTo(0, r.rayon * 0.1);
      ctx.lineTo(r.rayon * 0.35, r.rayon * 0.05);
      ctx.moveTo(0, r.rayon * 0.1);
      ctx.lineTo(r.rayon * 0.05, r.rayon * 0.45);
      ctx.stroke();
    }
    ctx.restore();
  });
}

function tracerRocher(r) {
  ctx.beginPath();
  r.sommets.forEach((s, i) => {
    const x = Math.cos(s.a) * s.r;
    const y = Math.sin(s.a) * s.r;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.closePath();
}

// La bouilloire-tanuki, vue de dessus, bec vers l'avant (angle 0)
function dessinerJoueur(j) {
  if (j.hyper > 0) {
    // Elle se replie sur elle-meme puis se deplie ailleurs
    const k = j.hyper > 0.3 ? (j.hyper - 0.3) / 0.3 : 1 - j.hyper / 0.3;
    if (k < 0.05) {
      return;
    }
    ctx.save();
    ctx.translate(j.x, j.y);
    ctx.scale(k, k);
    ctx.translate(-j.x, -j.y);
  }
  if (j.invincible > 0 && Math.floor(j.invincible * 10) % 2 === 0) {
    if (j.hyper > 0) {
      ctx.restore();
    }
    return;
  }
  // Sur un petit ecran la theiere est grossie pour rester lisible
  const taille = canvas.clientWidth > 0 ? canvas.clientWidth / W : 1;
  const loupe = 1.3 * Math.min(1.8, Math.max(1, 0.78 / taille));
  partout(j.x, j.y, 34 * loupe / 1.3, (x, y) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(loupe, loupe);
    // Ombre
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(4, 7, 17, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(j.angle);
    // Flamme de vapeur, en aplats qui vacillent
    if (j.poussee) {
      const l = 16 + Math.sin(temps * 40) * 4 + Math.random() * 4;
      ctx.fillStyle = "#e8603a";
      ctx.beginPath();
      ctx.moveTo(-14, -7);
      ctx.lineTo(-14 - l, 0);
      ctx.lineTo(-14, 7);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#ffd26a";
      ctx.beginPath();
      ctx.moveTo(-14, -4);
      ctx.lineTo(-14 - l * 0.6, 0);
      ctx.lineTo(-14, 4);
      ctx.closePath();
      ctx.fill();
    }
    // Queue rayee du tanuki, a l'arriere
    ctx.save();
    ctx.translate(-14, 0);
    ctx.rotate(Math.sin(temps * 6) * 0.15);
    ctx.fillStyle = "#6b4f33";
    ctx.beginPath();
    ctx.ellipse(-6, 0, 9, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#3a2a1e";
    ctx.fillRect(-9, -5.5, 2.5, 11);
    ctx.fillRect(-4, -6, 2.5, 12);
    ctx.restore();
    // Bec verseur
    ctx.fillStyle = "#3a3f48";
    ctx.beginPath();
    ctx.moveTo(9, -4);
    ctx.lineTo(22, -2);
    ctx.lineTo(22, 2);
    ctx.lineTo(9, 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#6a707c";
    ctx.fillRect(10, -2.5, 11, 1.5);
    // Corps de fonte : sphere sombre avec reflet
    const g = ctx.createRadialGradient(-4, -5, 2, 0, 0, 15);
    g.addColorStop(0, "#8a909c");
    g.addColorStop(0.5, "#4a505c");
    g.addColorStop(1, "#22262e");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#16181e";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Anse en arc par-dessus
    ctx.strokeStyle = "#c8a24a";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-2, -13);
    ctx.quadraticCurveTo(-4, 0, -2, 13);
    ctx.stroke();
    // Couvercle et bouton
    ctx.fillStyle = "#5a606c";
    ctx.beginPath();
    ctx.arc(3, 0, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#c8372d";
    ctx.beginPath();
    ctx.arc(3, 0, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.beginPath();
    ctx.arc(2, -1, 1.1, 0, Math.PI * 2);
    ctx.fill();
    // Oreilles du tanuki qui depassent sur les cotes
    ctx.fillStyle = "#6b4f33";
    ctx.beginPath();
    ctx.moveTo(6, -12);
    ctx.lineTo(11, -17);
    ctx.lineTo(12, -10);
    ctx.closePath();
    ctx.moveTo(6, 12);
    ctx.lineTo(11, 17);
    ctx.lineTo(12, 10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // Bouclier : un anneau plein, qui palit quand il se vide
    if (j.bouclierActif) {
      ctx.strokeStyle = "rgba(159,208,224," + (0.45 + j.bouclier * 0.5) + ")";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, 28, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, 28, -2.4 + temps * 3, -1.6 + temps * 3);
      ctx.stroke();
    }
  });
  if (j.hyper > 0) {
    ctx.restore();
  }
}

function dessinerSuie(s) {
  partout(s.x, s.y, 14, (x, y) => {
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.arc(x + 3, y + 4, 9, 0, Math.PI * 2);
    ctx.fill();
    // Boule de suie herissee
    ctx.fillStyle = "#1c1a24";
    ctx.beginPath();
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + s.phase * 0.2;
      const r = i % 2 ? 7 : 10 + Math.sin(s.phase + i) * 1.2;
      ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(x - 3, y - 1, 2.6, 0, Math.PI * 2);
    ctx.arc(x + 3, y - 1, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#000";
    const j = etat.joueur;
    const a = j ? Math.atan2(j.y - y, j.x - x) : 0;
    ctx.beginPath();
    ctx.arc(x - 3 + Math.cos(a), y - 1 + Math.sin(a), 1.2, 0, Math.PI * 2);
    ctx.arc(x + 3 + Math.cos(a), y - 1 + Math.sin(a), 1.2, 0, Math.PI * 2);
    ctx.fill();
  });
}

function dessinerEnnemi(e) {
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(4, 8, e.rayon, e.rayon * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
  if (e.type === "lanterne") {
    // Chochin-obake : lanterne de papier, un oeil, une langue
    ctx.fillStyle = "#2a1a12";
    ctx.fillRect(-9, -22, 18, 5);
    ctx.fillRect(-9, 17, 18, 5);
    const g = ctx.createLinearGradient(-16, 0, 16, 0);
    g.addColorStop(0, "#b8402a");
    g.addColorStop(0.45, "#f0a050");
    g.addColorStop(1, "#8e2a1a");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, 16, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(80,20,10,0.5)";
    ctx.lineWidth = 1;
    [-10, -4, 2, 8].forEach(y => {
      ctx.beginPath();
      ctx.moveTo(-15, y);
      ctx.quadraticCurveTo(0, y + 3, 15, y);
      ctx.stroke();
    });
    ctx.fillStyle = "#fff4d8";
    ctx.beginPath();
    ctx.ellipse(-3, -5, 6, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1a1018";
    ctx.beginPath();
    ctx.arc(-2, -5, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1a1018";
    ctx.beginPath();
    ctx.ellipse(1, 7, 7, 3, 0, 0, Math.PI);
    ctx.fill();
    ctx.fillStyle = "#e0574b";
    ctx.beginPath();
    ctx.ellipse(4, 11 + Math.sin(temps * 8) * 2, 3, 5, 0.3, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Kitsune-bi : flamme de renard orange, avec un masque blanc
    const sens = Math.sign(e.vx) || 1;
    ctx.scale(sens, 1);
    ctx.fillStyle = "#e8603a";
    ctx.beginPath();
    ctx.moveTo(-18, 0);
    ctx.quadraticCurveTo(-8, -12 + Math.sin(temps * 12) * 3, 4, -10);
    ctx.quadraticCurveTo(14, -6, 12, 2);
    ctx.quadraticCurveTo(10, 11, 0, 10);
    ctx.quadraticCurveTo(-10, 8 + Math.sin(temps * 12 + 1) * 3, -18, 0);
    ctx.fill();
    ctx.fillStyle = "#ffd26a";
    ctx.beginPath();
    ctx.ellipse(2, 0, 8, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fbf3e2";
    ctx.beginPath();
    ctx.moveTo(-2, -4);
    ctx.lineTo(10, 0);
    ctx.lineTo(-2, 5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#c8372d";
    ctx.fillRect(3, -2, 3, 1.5);
  }
  ctx.restore();
}

function dessinerTirs() {
  etat.tirs.forEach(t => {
    // Goutte de the : ovale ambre avec reflet, orientee dans sa course
    const a = Math.atan2(t.vy, t.vx);
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.rotate(a);
    ctx.fillStyle = "#7a4a1a";
    ctx.beginPath();
    ctx.ellipse(0, 0, 6, 3.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e8b45a";
    ctx.beginPath();
    ctx.ellipse(1, 0, 4.5, 2.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff4d8";
    ctx.fillRect(1, -1.5, 2.5, 1.2);
    ctx.restore();
  });
  etat.tirsEnnemis.forEach(t => {
    ctx.fillStyle = "#3a0d14";
    ctx.beginPath();
    ctx.arc(t.x, t.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ff6a4a";
    ctx.beginPath();
    ctx.arc(t.x, t.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffe0c0";
    ctx.beginPath();
    ctx.arc(t.x - 1, t.y - 1, 1.2, 0, Math.PI * 2);
    ctx.fill();
  });
}

function dessinerParticules() {
  etat.poussieres.forEach(p => {
    const k = p.vie / p.duree;
    ctx.fillStyle = p.vapeur ? "rgba(232,228,240," + (k * 0.5) + ")" : "rgba(180,170,190," + (k * 0.35) + ")";
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  });
  etat.eclats.forEach(e => {
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.angle);
    ctx.globalAlpha = Math.min(1, e.vie * 2);
    ctx.fillStyle = e.couleur;
    ctx.beginPath();
    e.forme.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  });
  ctx.globalAlpha = 1;
}

function texteContour(t, x, y, taille, couleur, alignement, contour) {
  ctx.font = "800 " + taille + "px 'Anybody', sans-serif";
  ctx.textAlign = alignement || "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(3, taille * 0.16);
  ctx.strokeStyle = contour || "#0b0a1c";
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

function petiteBouilloire(x, y) {
  ctx.fillStyle = "#4a505c";
  ctx.beginPath();
  ctx.arc(x, y, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#3a3f48";
  ctx.fillRect(x + 5, y - 1.5, 6, 3);
  ctx.fillStyle = "#c8372d";
  ctx.beginPath();
  ctx.arc(x, y, 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#c8a24a";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, 7, Math.PI * 1.1, Math.PI * 1.9);
  ctx.stroke();
}

function dessinerHud() {
  mono("SCORE", 18, 18, 9, "#8a84b0");
  texteContour(etat.score.toLocaleString("fr-BE"), 18, 42, 28, "#c6f35a", "left");
  mono("VAGUE", W / 2, 18, 9, "#8a84b0", "center");
  texteContour(String(Math.max(1, etat.vague)), W / 2, 42, 26, "#ede8df");
  for (let i = 0; i < Math.min(etat.vies, 8); i++) {
    petiteBouilloire(W - 24 - i * 22, 22);
  }
  const j = etat.joueur;
  const b = j ? j.bouclier : 1;
  mono("BOUCLIER", W - 18, 44, 8, "#8a84b0", "right");
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(W - 118, 52, 100, 6);
  ctx.fillStyle = b > 0.3 ? "#9fd0e0" : "#e0574b";
  ctx.fillRect(W - 118, 52, 100 * b, 6);
}

function dessinerEcranTitre() {
  ctx.fillStyle = "rgba(11,10,28,0.55)";
  ctx.fillRect(0, 0, W, H);
  texteContour("ASTEROIDS", W / 2, H / 2 - 90, 58, "#ede8df");
  mono("LA BOUILLOIRE DANS LES ÉTOILES", W / 2, H / 2 - 48, 11, "#c6f35a", "center");
  const lignes = [["← →", "tourner"], ["↑", "vapeur"], ["Espace", "tirer"], ["↓", "bouclier"], ["X", "hyperespace"]];
  lignes.forEach(([k, v], i) => {
    mono(k, W / 2 - 16, H / 2 + i * 22, 11, "#ede8df", "right");
    mono(v, W / 2 + 16, H / 2 + i * 22, 11, "#8a84b0", "left");
  });
  if (Math.floor(temps * 2) % 2 === 0) {
    mono("ESPACE OU A POUR COMMENCER", W / 2, H - 50, 11, "#ffd26a", "center");
  }
}

function dessiner() {
  ctx.setTransform(echelle, 0, 0, echelle, 0, 0);
  if (!fond) {
    return;
  }
  ctx.drawImage(fond, 0, 0, W, H);
  if (etat === null) {
    return;
  }
  // Etoiles en trois plans, qui glissent un peu avec le joueur
  const j = etat.joueur;
  const ox = j ? (j.x - W / 2) : 0;
  const oy = j ? (j.y - H / 2) : 0;
  etoiles.forEach(s => {
    const f = [0.02, 0.05, 0.1][s.plan];
    let x = (s.x - ox * f) % W;
    let y = (s.y - oy * f) % H;
    if (x < 0) {
      x += W;
    }
    if (y < 0) {
      y += H;
    }
    ctx.fillStyle = s.teinte;
    if (s.plan === 2) {
      // Les plus proches en petite croix
      ctx.fillRect(x - s.r * 1.5, y - 0.5, s.r * 3, 1);
      ctx.fillRect(x - 0.5, y - s.r * 1.5, 1, s.r * 3);
    } else {
      ctx.beginPath();
      ctx.arc(x, y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  ctx.save();
  if (etat.secousse > 0) {
    ctx.translate(alea(-1, 1) * etat.secousse * 12, alea(-1, 1) * etat.secousse * 12);
  }
  dessinerParticules();
  etat.rochers.forEach(dessinerRocher);
  etat.suies.forEach(dessinerSuie);
  etat.ennemis.forEach(dessinerEnnemi);
  dessinerTirs();
  if (j) {
    dessinerJoueur(j);
  }
  etat.textes.forEach(t => {
    const k = t.age / (t.grand ? 1.6 : 0.8);
    ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
    texteContour(t.texte, t.x, t.y - k * 20, t.grand ? 30 : 14, t.grand ? "#c6f35a" : "#ffe08a");
  });
  ctx.globalAlpha = 1;
  ctx.restore();

  if (etat.debut) {
    dessinerEcranTitre();
    return;
  }
  dessinerHud();
  if (etat.banniere) {
    const k = etat.banniere.age;
    const alpha = k < 0.25 ? k / 0.25 : k > 1.8 ? (2.2 - k) / 0.4 : 1;
    ctx.globalAlpha = Math.max(0, alpha);
    texteContour(etat.banniere.texte, W / 2, H / 2 - 20, 40, "#ede8df");
    mono("ROCHERS DE " + etat.banniere.sous, W / 2, H / 2 + 16, 10, "#c6f35a", "center");
    ctx.globalAlpha = 1;
  }
  if (etat.pause) {
    ctx.fillStyle = "rgba(11,10,28,0.6)";
    ctx.fillRect(0, 0, W, H);
    texteContour("PAUSE", W / 2, H / 2, 48, "#ede8df");
  }
  if (etat.termine && etat.finAge > 0.6) {
    ctx.fillStyle = "rgba(11,10,28,0.62)";
    ctx.fillRect(0, H / 2 - 80, W, 160);
    texteContour("FIN DE PARTIE", W / 2, H / 2 - 26, 44, "#ede8df");
    mono(etat.score.toLocaleString("fr-BE") + " POINTS  ·  VAGUE " + etat.vague, W / 2, H / 2 + 18, 12, "#c6f35a", "center");
    mono("N POUR REJOUER", W / 2, H / 2 + 46, 10, "#8a84b0", "center");
  }
}

const boucle = creerBoucle(function (dt) {
  maj(dt);
  dessiner();
}, { plafond: 0.05 });

// ---------------------------------------------------------------------
// Taille
// ---------------------------------------------------------------------

function hauteurManette() {
  const m = document.querySelector(".manette:not([hidden])");
  return m ? m.getBoundingClientRect().height : 0;
}

function ajuster() {
  const marge = window.innerWidth >= 1100 ? 500 : 0;
  const largeur = Math.min(window.innerWidth * 0.96 - marge, 1000);
  const entete = zone.querySelector(".entete-bunbuku").getBoundingClientRect().height || 40;
  const hauteur = Math.max(220, window.innerHeight - entete - hauteurManette() - 44);
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
// Commandes
// ---------------------------------------------------------------------

function majBoutonSon() {
  boutonSon.textContent = sonActif() ? "Son" : "Muet";
  boutonSon.setAttribute("aria-pressed", String(!sonActif()));
}

function demarrer() {
  etat = nouvelEtat();
  Object.keys(commandes).forEach(cle => { commandes[cle] = false; });
  preparerEtoiles();
  fond = null;
  ajuster();
  requestAnimationFrame(ajuster);
  majScoreCourant(ID, 0);
  majBoutonSon();
  boucle.lancer();
}

function commencer() {
  if (etat && etat.debut) {
    etat.debut = false;
    etat.joueur = nouveauJoueur();
    lancerVague();
    jouer("pouvoir");
  }
}

function basculerPause() {
  if (etat === null || etat.termine || etat.debut) {
    return;
  }
  etat.pause = !etat.pause;
  if (!etat.pause) {
    boucle.remettreALHeure();
  }
}

const TOUCHES = {
  arrowleft: "gauche", q: "gauche", a: "gauche",
  arrowright: "droite", d: "droite",
  arrowup: "poussee", z: "poussee", w: "poussee",
  arrowdown: "bouclier", s: "bouclier",
  " ": "tir"
};

surTouche(ID, function (evenement) {
  const touche = evenement.key.toLowerCase();
  if (etat && etat.debut && (touche === " " || touche === "enter")) {
    commencer();
    evenement.preventDefault();
    return;
  }
  if (TOUCHES[touche] !== undefined) {
    commandes[TOUCHES[touche]] = true;
  } else if (touche === "x" || touche === "shift") {
    if (!evenement.repeat) {
      hyperespace();
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

canvas.addEventListener("pointerdown", function (evenement) {
  if (etat && etat.debut) {
    evenement.preventDefault();
    commencer();
  }
});

document.addEventListener("visibilitychange", function () {
  if (document.hidden && etat !== null && !etat.pause && !etat.termine && !zone.hidden) {
    basculerPause();
  }
});

boutonSon.addEventListener("click", function () {
  basculerSon();
  majBoutonSon();
});
zone.querySelector("#rejouerBunbuku").addEventListener("click", demarrer);
zone.querySelector("#quitterBunbuku").addEventListener("click", quitterJeu);

// Pour les tests automatiques
export const _test = { get etat() { return etat; }, commandes, commencer };

enregistrerJeu({
  id: ID,
  nom: "Asteroids",
  code: "1979",
  section: zone,
  demarrer,
  arreter: () => {
    boucle.arreter();
    Object.keys(commandes).forEach(cle => { commandes[cle] = false; });
  },
  manette: { a: " ", b: "x", start: "p", libelles: { a: "Tirer", b: "Hyperespace" } }
});
