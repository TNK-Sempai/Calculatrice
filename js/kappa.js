// =====================================================================
//  FROGGER (Kappa, la traversee du village)
//  Un petit kappa doit rejoindre les cinq bassins de lotus en haut de
//  l'ecran. Il traverse d'abord la route du village au crepuscule
//  (pousse-pousse, charrettes a boeuf, petits camions, bus, bolides),
//  puis la riviere en sautant de rondin en tortue.
//
//  Regles de la borne de 1981 :
//  - un saut par case ; sur la riviere, le kappa est porte ;
//  - les tortues plongent par moments, les crocodiles mordent par la
//    tete, un serpent rode sur la berge du milieu ;
//  - un chrono par traversee, le temps restant devient des points ;
//  - une libellule se pose parfois dans un bassin vide (bonus), un
//    crocodile y guette parfois (danger) ;
//  - une kappa rose attend parfois sur un rondin : la ramener au bassin
//    rapporte gros ;
//  - cinq bassins remplis : niveau suivant. Les niveaux ne finissent
//    jamais : plus vite, plus dense, et des voies redistribuees.
// =====================================================================

import { enregistrerJeu, finDePartie, quitterJeu, majScoreCourant } from "./arcade.js";
import { creerBoucle } from "./noyau/boucle.js";
import { surTouche, jeuAuPremierPlan } from "./noyau/clavier.js";
import { surGlissement } from "./noyau/tactile.js";
import { jouer, basculerSon, sonActif } from "./noyau/son.js";

const ID = "kappa";

// ---------------------------------------------------------------------
// Plan : 13 colonnes de 40, 13 rangees, une tete de 56 et un pied de 34
// Rangee 0 : bassins. 1 a 5 : riviere. 6 : berge. 7 a 11 : route.
// 12 : depart.
// ---------------------------------------------------------------------

const T = 40;
const COLONNES = 13;
const RANGEES = 13;
const HAUT = 56;
const W = COLONNES * T;
const H = HAUT + RANGEES * T + 34;
const DEPART = 12;
const DUREE = 30;
const VIES_DEPART = 4;
const VIE_EN_PLUS = 20000;
const DUREE_SAUT = 0.14;
const BASSINS = [1.5, 4, 6.5, 9, 11.5].map(c => c * T - T / 2);   // bord gauche, centre a + T/2

const P = {
  encre: "#0b0b10",
  creme: "#ede8df",
  lime: "#c6f35a",
  or: "#ffd23a",
  rouge: "#e0412f",
  eau: "#1f4e7a",
  eauClaire: "#2f6d9e",
  eauSombre: "#163a5e",
  herbe: "#3f7a34",
  herbeSombre: "#2c5a25",
  terre: "#5a4a3c",
  terreClaire: "#6e5b4a",
  pierre: "#8a8478"
};

// ---------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------

const zone = document.createElement("section");
zone.className = "jeu jeu-kappa";
zone.id = "jeuKappa";
zone.hidden = true;
zone.innerHTML = `
  <div class="jeu-entete entete-kappa">
    <span class="entete-boutons">
      <button class="jeu-quitter" id="sonKappa" type="button">Son</button>
      <button class="jeu-quitter" id="rejouerKappa" type="button">Rejouer</button>
      <button class="jeu-quitter" id="quitterKappa" type="button">Retour</button>
    </span>
  </div>
  <canvas id="canvasKappa"></canvas>
  <p class="jeu-aide">Fl&egrave;ches ou Z Q S D pour sauter d'une case. Au doigt : glisse dans une direction, ou touche pour avancer. Remplis les cinq bassins avant la fin du chrono. Les tortues plongent, les crocodiles mordent par la t&ecirc;te, la libellule rapporte des points. P pause, M son, N rejouer, &Eacute;chap quitter.</p>`;
document.body.appendChild(zone);

const canvas = zone.querySelector("#canvasKappa");
const ctx = canvas.getContext("2d");
const boutonSon = zone.querySelector("#sonKappa");

// ---------------------------------------------------------------------
// Hasard reproductible : chaque niveau a ses voies
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

// ---------------------------------------------------------------------
// Les voies d'un niveau
// ---------------------------------------------------------------------

const VEHICULES = {
  pousse: { long: 1, v: 40, ecart: [3, 5] },
  voiture: { long: 1, v: 70, ecart: [3, 4.5] },
  bolide: { long: 1, v: 135, ecart: [6, 9] },
  charrette: { long: 2, v: 32, ecart: [3.5, 5] },
  camion: { long: 2, v: 55, ecart: [4, 6] },
  bus: { long: 3, v: 46, ecart: [5, 7] }
};

const FLOTTEURS = {
  rondinCourt: { long: 3, v: 44, ecart: [2.5, 4] },
  rondinMoyen: { long: 4, v: 54, ecart: [3, 4.5] },
  rondinLong: { long: 6, v: 62, ecart: [3.5, 5] },
  tortues2: { long: 2, v: 46, ecart: [2, 3] },
  tortues3: { long: 3, v: 40, ecart: [2, 3] },
  nenuphars: { long: 2, v: 36, ecart: [2, 3.2] },
  crocodile: { long: 3, v: 50, ecart: [3.5, 5] }
};

function configurerNiveau(n) {
  const alea = hasard(n * 2654435761);
  const melanger = liste => {
    const l = liste.slice();
    for (let i = l.length - 1; i > 0; i--) {
      const j = Math.floor(alea() * (i + 1));
      [l[i], l[j]] = [l[j], l[i]];
    }
    return l;
  };
  // Vitesse qui monte puis densite qui monte : il y a toujours plus dur
  const vitesse = Math.min(2.4, 1 + (n - 1) * 0.11);
  const densite = Math.max(0.55, 1 - Math.max(0, n - 8) * 0.03);

  let route = ["pousse", "charrette", "voiture", "camion", "bolide"];
  if (n >= 3) {
    route[Math.floor(alea() * 5)] = "bus";
  }
  if (n >= 2) {
    route = melanger(route);
  }
  // La riviere garde de quoi passer : au moins un long rondin
  let riviere = ["tortues3", "rondinMoyen", "rondinLong", "tortues2", "rondinCourt"];
  if (n >= 2) {
    riviere[4] = alea() < 0.5 ? "nenuphars" : "rondinCourt";
  }
  if (n >= 3) {
    riviere[1] = "crocodile";
  }
  if (n >= 2) {
    riviere = melanger(riviere);
  }
  const sens0 = alea() < 0.5 ? 1 : -1;
  const voies = [];
  riviere.forEach((type, i) => {
    const f = FLOTTEURS[type];
    voies.push(creerVoie(1 + i, type, f, i % 2 ? -sens0 : sens0, vitesse, densite, alea, n, true));
  });
  route.forEach((type, i) => {
    const f = VEHICULES[type];
    voies.push(creerVoie(7 + i, type, f, i % 2 ? sens0 : -sens0, vitesse, densite, alea, n, false));
  });
  return { voies, serpent: n >= 2, crocoBassin: n >= 2, serpentRondin: n >= 6 };
}

function creerVoie(r, type, f, sens, vitesse, densite, alea, n, eau) {
  const v = f.v * vitesse * (0.9 + alea() * 0.2) * sens;
  const objets = [];
  let x = alea() * T * 2;
  // On remplit un peu plus large que l'ecran, pour boucler sans trou
  const tour = W + T * 8;
  while (x < tour) {
    const ecart = (f.ecart[0] + alea() * (f.ecart[1] - f.ecart[0])) * (eau ? 1 / densite * 0.9 + 0.1 : densite);
    const o = { x, long: f.long, type, phase: alea() * 10 };
    // Certains groupes de tortues plongent
    if ((type === "tortues2" || type === "tortues3" || type === "nenuphars") && alea() < Math.min(0.75, 0.3 + n * 0.05)) {
      o.plonge = true;
    }
    objets.push(o);
    x += (f.long + ecart) * T;
  }
  return { r, type, eau, v, objets, tour: Math.max(tour, x) };
}

// ---------------------------------------------------------------------
// Etat
// ---------------------------------------------------------------------

let etat = null;
let echelle = 1;
let fond = null;

function nouvelEtat() {
  return {
    score: 0,
    record: 0,
    niveau: 1,
    vies: VIES_DEPART,
    prochaineVie: VIE_EN_PLUS,
    bassins: BASSINS.map(() => ({ plein: false, femme: false, bonus: null, t: 0 })),
    kappa: null,
    config: null,
    chrono: DUREE,
    meilleureRangee: DEPART,
    mort: null,
    femme: null,
    serpent: null,
    libellule: 6,
    croco: 10,
    pause: false,
    termine: false,
    message: null,
    temps: 0,
    eclats: [],
    textes: [],
    rides: []
  };
}

function nouveauKappa() {
  return { x: 6 * T + T / 2, r: DEPART, deR: DEPART, deX: 6 * T + T / 2, versR: DEPART, versX: 6 * T + T / 2, saut: 0, dir: 0, posee: 1, porte: null };
}

function lancerNiveau() {
  etat.config = configurerNiveau(etat.niveau);
  etat.bassins.forEach(b => {
    b.plein = false;
    b.femme = false;
    b.bonus = null;
  });
  etat.serpent = etat.config.serpent ? { x: -T * 2, v: 46 + etat.niveau * 3, sens: 1 } : null;
  etat.femme = null;
  nouvelleVie();
  annoncer("Niveau " + etat.niveau, etat.niveau === 1 ? "Rejoins les cinq bassins" : "Plus vite, nouvelles voies", 2);
}

function nouvelleVie() {
  etat.kappa = nouveauKappa();
  etat.chrono = DUREE;
  etat.meilleureRangee = DEPART;
  etat.mort = null;
}

function annoncer(titre, sous, duree) {
  etat.message = { titre, sous: sous || "", reste: duree || 1.6 };
}

function points(n, x, y, couleur) {
  etat.score += n;
  if (x !== undefined) {
    etat.textes.push({ texte: String(n), x, y, age: 0, couleur: couleur || P.creme });
  }
  if (etat.score >= etat.prochaineVie) {
    etat.prochaineVie += VIE_EN_PLUS;
    etat.vies = Math.min(9, etat.vies + 1);
    annoncer("Vie en plus", "", 1.4);
    jouer("vie");
  }
  majScoreCourant(ID, etat.score);
}

function yRangee(r) {
  return HAUT + r * T;
}

// ---------------------------------------------------------------------
// Deplacements
// ---------------------------------------------------------------------

function sauter(dr, dc) {
  if (etat === null || etat.pause || etat.termine || etat.mort || etat.message && etat.message.bloque) {
    return;
  }
  const k = etat.kappa;
  if (k.saut > 0) {
    return;
  }
  const r = k.r + dr;
  let x = k.x + dc * T;
  if (r > DEPART || x < T / 2 - 1 || x > W - T / 2 + 1) {
    return;
  }
  if (r < 0) {
    return;
  }
  // En ligne droite vers le haut, on se recale sur la colonne la plus proche
  if (dc === 0 && !etat.config.voies.some(v => v.r === k.r && v.eau)) {
    x = Math.round((x - T / 2) / T) * T + T / 2;
  }
  k.deR = k.r;
  k.deX = k.x;
  k.versR = r;
  k.versX = x;
  k.saut = DUREE_SAUT;
  k.dir = dr < 0 ? 0 : dr > 0 ? Math.PI : dc < 0 ? -Math.PI / 2 : Math.PI / 2;
  k.porte = null;
  jouer("grain");
}

function atterrir() {
  const k = etat.kappa;
  k.r = k.versR;
  k.x = k.versX;
  k.posee = 0;
  if (k.r < etat.meilleureRangee) {
    etat.meilleureRangee = k.r;
    if (k.r > 0) {
      points(10);
    }
  }
  if (k.r === 0) {
    arriverAuxBassins();
  }
}

function arriverAuxBassins() {
  const k = etat.kappa;
  const i = BASSINS.findIndex(bx => Math.abs(bx + T / 2 - k.x) < T * 0.62);
  if (i < 0) {
    mourir("haie");
    return;
  }
  const b = etat.bassins[i];
  if (b.plein) {
    mourir("haie");
    return;
  }
  if (b.bonus === "croco") {
    mourir("croco");
    return;
  }
  b.plein = true;
  const temps = Math.ceil(etat.chrono * 2) * 10;
  points(50 + temps, BASSINS[i] + T / 2, yRangee(0) + 6, P.lime);
  if (b.bonus === "libellule") {
    points(200, BASSINS[i] + T / 2, yRangee(0) + 26, P.or);
    jouer("bonus");
  }
  b.bonus = null;
  if (k.femme) {
    b.femme = true;
    points(200, BASSINS[i] + T / 2, yRangee(0) + 40, "#ffb0c8");
  }
  jouer("vague");
  if (etat.bassins.every(x => x.plein)) {
    points(1000, W / 2, yRangee(4), P.or);
    jouer("pouvoir");
    etat.niveau++;
    etat.attenteNiveau = 1.6;
    annoncer("Les cinq bassins !", "+1000", 1.6);
    etat.kappa = null;
    return;
  }
  nouvelleVie();
}

function mourir(cause) {
  if (etat.mort) {
    return;
  }
  const k = etat.kappa;
  etat.mort = { cause, t: 0, x: k.x, y: yRangee(k.r) + T / 2, dir: k.dir };
  if (cause === "eau") {
    jouer("explosion");
    for (let i = 0; i < 3; i++) {
      etat.rides.push({ x: k.x, y: yRangee(k.r) + T / 2, age: -i * 0.15 });
    }
    for (let i = 0; i < 14; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      const v = 80 + Math.random() * 120;
      etat.eclats.push({ x: k.x, y: yRangee(k.r) + T / 2, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vie: 0.6, couleur: Math.random() < 0.5 ? "#cfe6f0" : "#8fc1dc" });
    }
  } else if (cause === "route") {
    jouer("impact");
  } else {
    jouer("mort");
  }
  k.femme = false;
}

function apresMort() {
  etat.vies--;
  if (etat.vies <= 0) {
    etat.termine = true;
    etat.kappa = null;
    annoncer("Fin de partie", etat.score.toLocaleString("fr-BE") + " points", 99);
    setTimeout(() => {
      if (etat && etat.termine && !zone.hidden) {
        finDePartie(ID, etat.score);
      }
    }, 1800);
    return;
  }
  nouvelleVie();
}

// ---------------------------------------------------------------------
// Mise a jour
// ---------------------------------------------------------------------

function largeurPlongee(o, t) {
  // Cycle de plongee : visible, s'enfonce, sous l'eau, remonte
  if (!o.plonge) {
    return 1;
  }
  const cycle = (t * 0.32 + o.phase) % 4;
  if (cycle < 2.4) {
    return 1;
  }
  if (cycle < 2.9) {
    return 1 - (cycle - 2.4) / 0.5;
  }
  if (cycle < 3.5) {
    return 0;
  }
  return (cycle - 3.5) / 0.5;
}

function boucler(v, o) {
  const largeur = o.long * T;
  if (v.v > 0 && o.x > W + T * 2) {
    o.x -= v.tour;
  } else if (v.v < 0 && o.x + largeur < -T * 2) {
    o.x += v.tour;
  }
}

function sousLeKappa(v, x) {
  return v.objets.find(o => x > o.x + 6 && x < o.x + o.long * T - 6);
}

function maj(dt) {
  if (etat === null) {
    return;
  }
  etat.eclats = etat.eclats.filter(e => {
    e.vie -= dt;
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    e.vy += 400 * dt;
    return e.vie > 0;
  });
  etat.textes = etat.textes.filter(t => {
    t.age += dt;
    return t.age < 1;
  });
  etat.rides = etat.rides.filter(r => {
    r.age += dt;
    return r.age < 0.9;
  });
  if (etat.message) {
    etat.message.reste -= dt;
    if (etat.message.reste <= 0) {
      etat.message = null;
    }
  }
  if (etat.pause || etat.termine) {
    return;
  }
  etat.temps += dt;
  const t = etat.temps;

  // Tout ce qui roule et flotte avance, meme pendant une mort
  etat.config.voies.forEach(v => {
    v.objets.forEach(o => {
      o.x += v.v * dt;
      boucler(v, o);
    });
  });
  if (etat.serpent) {
    const s = etat.serpent;
    s.x += s.v * s.sens * dt;
    if (s.x > W + T) {
      s.sens = -1;
    } else if (s.x < -T * 2) {
      s.sens = 1;
    }
  }

  // Bonus et dangers dans les bassins
  etat.libellule -= dt;
  if (etat.libellule <= 0) {
    etat.libellule = 9 + Math.random() * 6;
    const vides = etat.bassins.filter(b => !b.plein && !b.bonus);
    if (vides.length) {
      const b = vides[Math.floor(Math.random() * vides.length)];
      b.bonus = "libellule";
      b.t = 5;
    }
  }
  if (etat.config.crocoBassin) {
    etat.croco -= dt;
    if (etat.croco <= 0) {
      etat.croco = Math.max(5, 12 - etat.niveau * 0.5) + Math.random() * 5;
      const vides = etat.bassins.filter(b => !b.plein && !b.bonus);
      if (vides.length) {
        const b = vides[Math.floor(Math.random() * vides.length)];
        b.bonus = "croco";
        b.t = 4;
      }
    }
  }
  etat.bassins.forEach(b => {
    if (b.bonus) {
      b.t -= dt;
      if (b.t <= 0) {
        b.bonus = null;
      }
    }
  });

  // La kappa rose apparait parfois sur un rondin
  if (!etat.femme && Math.random() < dt * 0.04 && !(etat.kappa && etat.kappa.femme)) {
    const voies = etat.config.voies.filter(v => v.eau && v.type.startsWith("rondin"));
    if (voies.length) {
      const v = voies[Math.floor(Math.random() * voies.length)];
      const o = v.objets.find(ob => ob.x > 0 && ob.x < W - ob.long * T);
      if (o) {
        etat.femme = { voie: v, objet: o, decal: T / 2, t: 12 };
      }
    }
  }
  if (etat.femme) {
    const f = etat.femme;
    f.t -= dt;
    // Elle marche d'un bout a l'autre de son rondin
    f.decal += Math.sin(t * 1.5) * 18 * dt;
    f.decal = Math.max(T / 2, Math.min(f.objet.long * T - T / 2, f.decal));
    if (f.t <= 0) {
      etat.femme = null;
    }
  }

  if (etat.attenteNiveau) {
    etat.attenteNiveau -= dt;
    if (etat.attenteNiveau <= 0) {
      etat.attenteNiveau = 0;
      lancerNiveau();
    }
    return;
  }

  if (etat.mort) {
    etat.mort.t += dt;
    if (etat.mort.t > 1.3) {
      apresMort();
    }
    return;
  }

  const k = etat.kappa;
  if (!k) {
    return;
  }
  k.posee = Math.min(1, k.posee + dt / 0.12);
  etat.chrono -= dt;
  if (etat.chrono <= 0) {
    mourir("temps");
    return;
  }

  if (k.saut > 0) {
    k.saut -= dt;
    if (k.saut <= 0) {
      k.saut = 0;
      atterrir();
    }
    return;
  }

  const voie = etat.config.voies.find(v => v.r === k.r);
  if (voie && voie.eau) {
    const o = sousLeKappa(voie, k.x);
    if (!o || largeurPlongee(o, t) < 0.35) {
      mourir("eau");
      return;
    }
    if (o.type === "crocodile") {
      // La tete est du cote ou il nage
      const tete = voie.v > 0 ? o.x + o.long * T - T : o.x;
      if (k.x > tete && k.x < tete + T && Math.sin(t * 3 + o.phase) > 0) {
        mourir("croco");
        return;
      }
    }
    k.x += voie.v * dt;
    if (k.x < T * 0.25 || k.x > W - T * 0.25) {
      mourir("eau");
      return;
    }
    // Escorter la kappa rose : on la rejoint sur son rondin
    if (etat.femme && etat.femme.objet === o && Math.abs(o.x + etat.femme.decal - k.x) < T * 0.6) {
      k.femme = true;
      etat.femme = null;
      points(100, k.x, yRangee(k.r), "#ffb0c8");
      jouer("bonus");
    }
    // Le serpent des rondins, aux niveaux avances
    if (etat.config.serpentRondin && o.type === "rondinLong") {
      const sx = o.x + o.long * T * (0.5 + Math.sin(t * 0.9 + o.phase) * 0.35);
      if (Math.abs(sx - k.x) < T * 0.5) {
        mourir("serpent");
        return;
      }
    }
  } else if (voie && !voie.eau) {
    const touche = voie.objets.some(o => k.x > o.x + 4 - T * 0.28 && k.x < o.x + o.long * T - 4 + T * 0.28);
    if (touche) {
      mourir("route");
      return;
    }
  }
  if (k.r === 6 && etat.serpent && Math.abs(etat.serpent.x + T - k.x) < T * 0.9) {
    mourir("serpent");
  }
}

// ---------------------------------------------------------------------
// Decor peint une fois
// ---------------------------------------------------------------------

function peindreFond() {
  const off = document.createElement("canvas");
  off.width = Math.round(W * echelle);
  off.height = Math.round(H * echelle);
  const c = off.getContext("2d");
  c.setTransform(echelle, 0, 0, echelle, 0, 0);
  const alea = hasard(7);

  // Tete et pied
  c.fillStyle = "#14112a";
  c.fillRect(0, 0, W, H);

  // Haie et bassins (rangee 0)
  const y0 = yRangee(0);
  c.fillStyle = "#24502a";
  c.fillRect(0, y0, W, T);
  for (let i = 0; i < 40; i++) {
    c.fillStyle = i % 2 ? "#2e6334" : "#1c4022";
    c.beginPath();
    c.arc(alea() * W, y0 + alea() * T, 6 + alea() * 6, 0, Math.PI * 2);
    c.fill();
  }
  BASSINS.forEach(bx => {
    const x = bx + T / 2;
    c.fillStyle = "#0f2a40";
    c.beginPath();
    c.ellipse(x, y0 + T / 2 + 2, T * 0.62, T * 0.48, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = P.eau;
    c.beginPath();
    c.ellipse(x, y0 + T / 2 + 2, T * 0.56, T * 0.42, 0, 0, Math.PI * 2);
    c.fill();
    // Pierres du bord
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + 0.3;
      c.fillStyle = k % 2 ? "#9a9488" : "#7a7468";
      c.beginPath();
      c.ellipse(x + Math.cos(a) * T * 0.6, y0 + T / 2 + 2 + Math.sin(a) * T * 0.46, 4, 3, a, 0, Math.PI * 2);
      c.fill();
    }
  });

  // Riviere (rangees 1 a 5)
  const g = c.createLinearGradient(0, yRangee(1), 0, yRangee(6));
  g.addColorStop(0, "#173f66");
  g.addColorStop(0.5, P.eau);
  g.addColorStop(1, "#1a4670");
  c.fillStyle = g;
  c.fillRect(0, yRangee(1), W, T * 5);
  c.fillStyle = "rgba(0,0,0,0.18)";
  c.fillRect(0, yRangee(1), W, 4);

  // Berge du milieu : herbe, pierres, lanternes
  const y6 = yRangee(6);
  c.fillStyle = P.herbe;
  c.fillRect(0, y6, W, T);
  c.fillStyle = "#4e8f40";
  c.fillRect(0, y6, W, 5);
  c.fillStyle = "#2a5a24";
  c.fillRect(0, y6 + T - 4, W, 4);
  for (let i = 0; i < 18; i++) {
    c.fillStyle = i % 3 ? "#5b9a4a" : "#336b2c";
    c.beginPath();
    c.ellipse(alea() * W, y6 + 8 + alea() * (T - 16), 3 + alea() * 4, 2 + alea() * 2, 0, 0, Math.PI * 2);
    c.fill();
  }
  [1, 6, 11].forEach(col => lanternePierre(c, col * T + T / 2, y6 + T / 2));

  // Route (rangees 7 a 11) : terre battue, bordures de pierre
  const yr = yRangee(7);
  c.fillStyle = P.terre;
  c.fillRect(0, yr, W, T * 5);
  for (let r = 0; r < 5; r++) {
    c.fillStyle = r % 2 ? "#564638" : "#5e4e40";
    c.fillRect(0, yr + r * T, W, T);
    // Deux traces de roues par voie
    c.fillStyle = "rgba(0,0,0,0.12)";
    c.fillRect(0, yr + r * T + 9, W, 3);
    c.fillRect(0, yr + r * T + T - 12, W, 3);
  }
  c.fillStyle = "#8a8478";
  c.fillRect(0, yr - 2, W, 4);
  c.fillRect(0, yr + T * 5 - 2, W, 4);
  // Petits cailloux poses au hasard
  for (let i = 0; i < 30; i++) {
    c.fillStyle = "rgba(160,150,135,0.5)";
    c.fillRect(Math.floor(alea() * W), yr + 4 + Math.floor(alea() * (T * 5 - 8)), 2, 2);
  }

  // Depart : herbe, sakura dans les coins, torii
  const yd = yRangee(12);
  c.fillStyle = P.herbe;
  c.fillRect(0, yd, W, T);
  c.fillStyle = "#4e8f40";
  c.fillRect(0, yd, W, 4);
  for (let i = 0; i < 14; i++) {
    c.fillStyle = i % 3 ? "#5b9a4a" : "#336b2c";
    c.beginPath();
    c.ellipse(alea() * W, yd + 8 + alea() * (T - 16), 3 + alea() * 3, 2, 0, 0, Math.PI * 2);
    c.fill();
  }
  [[18, yd + 18], [W - 18, yd + 18]].forEach(([x, y]) => {
    c.fillStyle = "#4a2e22";
    c.fillRect(x - 3, y - 2, 6, 14);
    [[0, -8, 12], [-9, -2, 8], [9, -2, 8], [-4, 4, 7], [5, 4, 7]].forEach(([dx, dy, r]) => {
      c.fillStyle = "#f4a8c6";
      c.beginPath();
      c.arc(x + dx, y + dy, r, 0, Math.PI * 2);
      c.fill();
    });
    c.fillStyle = "#ffd0e2";
    c.beginPath();
    c.arc(x - 3, y - 11, 4, 0, Math.PI * 2);
    c.fill();
  });

  // Pied : support du chrono
  c.fillStyle = "#14112a";
  c.fillRect(0, yRangee(13), W, 34);
  return off;
}

function lanternePierre(c, x, y) {
  c.fillStyle = "rgba(0,0,0,0.3)";
  c.beginPath();
  c.ellipse(x + 3, y + 6, 10, 5, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#6e695f";
  c.fillRect(x - 7, y - 2, 14, 10);
  c.fillStyle = "#9a9488";
  c.fillRect(x - 9, y - 6, 18, 5);
  c.fillStyle = "#ffcf6a";
  c.fillRect(x - 4, y, 8, 5);
  c.fillStyle = "#b8b2a4";
  c.beginPath();
  c.moveTo(x - 11, y - 6);
  c.lineTo(x, y - 13);
  c.lineTo(x + 11, y - 6);
  c.closePath();
  c.fill();
}

// ---------------------------------------------------------------------
// Dessin de ce qui bouge
// ---------------------------------------------------------------------

function ombre(x, y, w, h) {
  ctx.fillStyle = "rgba(0,0,0,0.32)";
  ctx.beginPath();
  ctx.roundRect(x + 3, y + 4, w, h, Math.min(8, h / 2));
  ctx.fill();
}

function dessinerRondin(x, y, long, o) {
  const w = long * T - 4;
  const h = T - 12;
  const top = y + 6;
  ombre(x + 2, top, w, h);
  const g = ctx.createLinearGradient(0, top, 0, top + h);
  g.addColorStop(0, "#a07a52");
  g.addColorStop(0.35, "#8a6440");
  g.addColorStop(1, "#4e3420");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(x + 2, top, w, h, h / 2);
  ctx.fill();
  // Ecorce : quelques noeuds et fentes, pas de motif regulier
  ctx.strokeStyle = "rgba(40,24,12,0.55)";
  ctx.lineWidth = 1.5;
  for (let i = 1; i < long; i++) {
    const xx = x + i * T + ((i * 13 + Math.floor(o.phase * 10)) % 9) - 4;
    ctx.beginPath();
    ctx.moveTo(xx, top + 5);
    ctx.lineTo(xx + 6, top + h - 6);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(255,230,190,0.25)";
  ctx.fillRect(x + 10, top + 4, w - 20, 3);
  // Bouts du rondin : cernes
  [x + 2 + h / 2, x + w + 2 - h / 2].forEach((cx, i) => {
    if (i === 0) {
      return;
    }
    ctx.fillStyle = "#c9a172";
    ctx.beginPath();
    ctx.ellipse(cx + h / 2 - 5, top + h / 2, 5, h / 2 - 1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#8a6440";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(cx + h / 2 - 5, top + h / 2, 2.5, h / 4, 0, 0, Math.PI * 2);
    ctx.stroke();
  });
}

function dessinerTortue(x, y, plongee, sens, t, i) {
  const cx = x + T / 2;
  const cy = y + T / 2;
  const profondeur = 1 - plongee;
  if (plongee <= 0.02) {
    // Sous l'eau : une ombre et des rides
    ctx.fillStyle = "rgba(10,30,50,0.45)";
    ctx.beginPath();
    ctx.ellipse(cx, cy, 13, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.globalAlpha = 0.35 + plongee * 0.65;
  const s = 0.75 + plongee * 0.25;
  // Pattes qui pagaient
  const pag = Math.sin(t * 8 + i) * 3;
  ctx.fillStyle = "#4f7f3a";
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([px, py], k) => {
    ctx.beginPath();
    ctx.ellipse(cx + px * 11 * s + (k % 2 ? pag : -pag) * px, cy + py * 9 * s, 5 * s, 3.5 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  });
  // Tete
  ctx.beginPath();
  ctx.ellipse(cx + sens * 15 * s, cy, 5.5 * s, 4.5 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = P.encre;
  ctx.fillRect(cx + sens * 17 * s - 1, cy - 2.5, 2, 2);
  // Carapace bombee
  const g = ctx.createRadialGradient(cx - 4, cy - 5, 2, cx, cy, 16);
  g.addColorStop(0, "#c9a24a");
  g.addColorStop(0.6, "#8a6a26");
  g.addColorStop(1, "#4e3a12");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 13 * s, 11 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(50,34,8,0.7)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 5 * s, 4.5 * s, 0, 0, Math.PI * 2);
  [0, 1, 2, 3, 4, 5].forEach(k => {
    const a = (k / 6) * Math.PI * 2;
    ctx.moveTo(cx + Math.cos(a) * 5 * s, cy + Math.sin(a) * 4.5 * s);
    ctx.lineTo(cx + Math.cos(a) * 12 * s, cy + Math.sin(a) * 10 * s);
  });
  ctx.stroke();
  ctx.globalAlpha = 1;
  if (profondeur > 0.1) {
    ctx.strokeStyle = "rgba(207,230,240," + (profondeur * 0.8) + ")";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 15 + profondeur * 4, 12 + profondeur * 3, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function dessinerNenuphar(x, y, plongee) {
  const cx = x + T / 2;
  const cy = y + T / 2;
  if (plongee <= 0.02) {
    ctx.fillStyle = "rgba(10,30,50,0.4)";
    ctx.beginPath();
    ctx.arc(cx, cy, 13, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.globalAlpha = 0.35 + plongee * 0.65;
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.arc(cx + 2, cy + 3, 16, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createRadialGradient(cx - 5, cy - 5, 2, cx, cy, 18);
  g.addColorStop(0, "#7fc25a");
  g.addColorStop(1, "#2f6b2a");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, 16, 0.35, Math.PI * 2 - 0.05);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(20,60,20,0.6)";
  ctx.lineWidth = 1;
  for (let k = 0; k < 5; k++) {
    const a = 0.6 + k * 1.15;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * 14, cy + Math.sin(a) * 14);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function dessinerCrocodile(x, y, long, sens, t, o) {
  const w = long * T - 6;
  const top = y + 8;
  const h = T - 16;
  ombre(x + 3, top, w, h);
  const g = ctx.createLinearGradient(0, top, 0, top + h);
  g.addColorStop(0, "#6f9a3a");
  g.addColorStop(1, "#2e4a18");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(x + 3, top, w, h, 8);
  ctx.fill();
  // Ecailles du dos
  ctx.fillStyle = "#3d5f22";
  for (let i = 0; i < long * 3; i++) {
    const xx = x + 10 + i * (w - 20) / (long * 3);
    ctx.beginPath();
    ctx.moveTo(xx, top + h / 2 - 4);
    ctx.lineTo(xx + 4, top + h / 2);
    ctx.lineTo(xx, top + h / 2 + 4);
    ctx.fill();
  }
  // Pattes
  ctx.fillStyle = "#4f7a2a";
  [0.25, 0.7].forEach(f => {
    ctx.fillRect(x + w * f, top - 4, 7, 5);
    ctx.fillRect(x + w * f, top + h - 1, 7, 5);
  });
  // Tete du cote ou il nage, gueule qui s'ouvre et se ferme
  const ouverte = Math.sin(t * 3 + o.phase) > 0;
  const tx = sens > 0 ? x + w - 2 : x + 4;
  const d = sens > 0 ? 1 : -1;
  ctx.fillStyle = "#5e8a30";
  ctx.beginPath();
  ctx.moveTo(tx, top + 1);
  ctx.lineTo(tx + d * 18, top + (ouverte ? -4 : 4));
  ctx.lineTo(tx + d * 18, top + h / 2);
  ctx.lineTo(tx, top + h / 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(tx, top + h - 1);
  ctx.lineTo(tx + d * 18, top + h + (ouverte ? 4 : -4));
  ctx.lineTo(tx + d * 18, top + h / 2);
  ctx.lineTo(tx, top + h / 2);
  ctx.fill();
  if (ouverte) {
    ctx.fillStyle = "#c8372d";
    ctx.beginPath();
    ctx.moveTo(tx, top + h / 2 - 3);
    ctx.lineTo(tx + d * 16, top + 0);
    ctx.lineTo(tx + d * 16, top + h);
    ctx.lineTo(tx, top + h / 2 + 3);
    ctx.fill();
    ctx.fillStyle = P.creme;
    for (let k = 0; k < 3; k++) {
      ctx.fillRect(tx + d * (5 + k * 4), top + 1, 2, 3);
      ctx.fillRect(tx + d * (5 + k * 4), top + h - 4, 2, 3);
    }
  }
  ctx.fillStyle = "#ffd23a";
  ctx.fillRect(tx - d * 4 - 1, top + 3, 3, 3);
  ctx.fillRect(tx - d * 4 - 1, top + h - 6, 3, 3);
}

function carrosserie(x, y, w, h, base, claire, sombre) {
  ombre(x, y, w, h);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, claire);
  g.addColorStop(0.5, base);
  g.addColorStop(1, sombre);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 6);
  ctx.fill();
}

function roues(x, y, w, h, n) {
  ctx.fillStyle = "#1a1418";
  for (let i = 0; i < n; i++) {
    const xx = x + 6 + (i * (w - 18)) / Math.max(1, n - 1);
    ctx.fillRect(xx, y - 2, 7, 3);
    ctx.fillRect(xx, y + h - 1, 7, 3);
  }
}

function phares(x, y, w, h, sens) {
  const xa = sens > 0 ? x + w - 3 : x;
  ctx.fillStyle = "#fff2b0";
  ctx.fillRect(xa, y + 3, 3, 4);
  ctx.fillRect(xa, y + h - 7, 3, 4);
  const xb = sens > 0 ? x : x + w - 3;
  ctx.fillStyle = "#e0412f";
  ctx.fillRect(xb, y + 3, 3, 3);
  ctx.fillRect(xb, y + h - 6, 3, 3);
}

function dessinerVehicule(type, x, y, long, sens, t) {
  const w = long * T - 6;
  const h = T - 12;
  const top = y + 6;
  const x0 = x + 3;
  if (type === "pousse") {
    // Pousse-pousse vu de dessus : deux grandes roues, capote noire,
    // brancards, et le coureur au chapeau de paille
    const d = sens > 0 ? 1 : -1;
    const cab = sens > 0 ? x0 + 2 : x0 + w - 22;
    ombre(cab, top + 1, 20, h - 2);
    ctx.fillStyle = "#1a1418";
    ctx.fillRect(cab + 4, top - 2, 12, 4);
    ctx.fillRect(cab + 4, top + h - 2, 12, 4);
    ctx.fillStyle = "#b8291d";
    ctx.beginPath();
    ctx.roundRect(cab, top + 2, 20, h - 4, 4);
    ctx.fill();
    ctx.fillStyle = "#2a1a1a";
    ctx.beginPath();
    ctx.ellipse(cab + (sens > 0 ? 6 : 14), top + h / 2, 7, h / 2 - 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#8a6a4a";
    ctx.lineWidth = 2;
    const debut = sens > 0 ? cab + 20 : cab;
    const fin = debut + d * 12;
    ctx.beginPath();
    ctx.moveTo(debut, top + 5);
    ctx.lineTo(fin, top + 5);
    ctx.moveTo(debut, top + h - 5);
    ctx.lineTo(fin, top + h - 5);
    ctx.stroke();
    const cx = fin + d * 3;
    const pas = Math.sin(t * 16) * 3;
    ctx.fillStyle = "#2a3a6a";
    ctx.fillRect(cx - 3 + pas * d * 0.5, top + 3, 5, 3);
    ctx.fillRect(cx - 3 - pas * d * 0.5, top + h - 6, 5, 3);
    ctx.fillStyle = "#2f4f8a";
    ctx.beginPath();
    ctx.ellipse(cx, top + h / 2, 5, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e8c45a";
    ctx.beginPath();
    ctx.arc(cx, top + h / 2, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#b8923a";
    ctx.beginPath();
    ctx.arc(cx, top + h / 2, 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === "voiture") {
    carrosserie(x0, top, w, h, "#2f8fd8", "#7cc4f2", "#14467a");
    roues(x0, top, w, h, 2);
    ctx.fillStyle = "#14263a";
    ctx.beginPath();
    ctx.roundRect(x0 + w * 0.22, top + 4, w * 0.5, h - 8, 4);
    ctx.fill();
    ctx.fillStyle = "#7cc4f2";
    ctx.fillRect(x0 + w * 0.3, top + 6, w * 0.34, h - 12);
    phares(x0, top, w, h, sens);
  } else if (type === "bolide") {
    carrosserie(x0 - 2, top + 2, w + 4, h - 4, "#f2b919", "#ffe38a", "#8a5d06");
    roues(x0, top + 2, w, h - 4, 2);
    ctx.fillStyle = P.encre;
    ctx.fillRect(x0 + 4, top + h / 2 - 2, w - 8, 4);
    ctx.fillStyle = "#14263a";
    ctx.beginPath();
    ctx.roundRect(x0 + w * 0.35 - (sens > 0 ? 0 : 4), top + 6, w * 0.32, h - 12, 3);
    ctx.fill();
    phares(x0 - 2, top + 2, w + 4, h - 4, sens);
  } else if (type === "charrette") {
    // Charrette tiree par un boeuf
    const boeufX = sens > 0 ? x0 + w - 24 : x0;
    const caisseX = sens > 0 ? x0 : x0 + 28;
    ombre(caisseX, top, w - 28, h);
    ctx.fillStyle = "#7a5634";
    ctx.fillRect(caisseX, top, w - 28, h);
    ctx.fillStyle = "#a0784e";
    ctx.fillRect(caisseX + 3, top + 3, w - 34, h - 6);
    ctx.fillStyle = "#e8c45a";
    for (let k = 0; k < 4; k++) {
      ctx.beginPath();
      ctx.arc(caisseX + 9 + k * 9, top + 9 + (k % 2) * 7, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#3a2618";
    ctx.fillRect(caisseX + (w - 28) / 2 - 3, top - 3, 6, h + 6);
    const pas = Math.sin(t * 6) * 2;
    ombre(boeufX, top + 2, 24, h - 4);
    ctx.fillStyle = "#4a3a30";
    ctx.beginPath();
    ctx.ellipse(boeufX + 12, top + h / 2, 12, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#5e4a3e";
    ctx.beginPath();
    ctx.ellipse(boeufX + 12 + (sens > 0 ? 10 : -10), top + h / 2 + pas * 0.3, 6, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = P.creme;
    ctx.lineWidth = 2;
    const hx = boeufX + 12 + (sens > 0 ? 12 : -12);
    ctx.beginPath();
    ctx.moveTo(hx, top + h / 2 - 3);
    ctx.quadraticCurveTo(hx + (sens > 0 ? 2 : -2), top + h / 2 - 9, hx + (sens > 0 ? 6 : -6), top + h / 2 - 9);
    ctx.moveTo(hx, top + h / 2 + 3);
    ctx.quadraticCurveTo(hx + (sens > 0 ? 2 : -2), top + h / 2 + 9, hx + (sens > 0 ? 6 : -6), top + h / 2 + 9);
    ctx.stroke();
    ctx.fillStyle = "#3a2a20";
    ctx.beginPath();
    ctx.ellipse(boeufX + 12, top + h / 2, 6, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === "camion") {
    // Petit camion de livraison, cabine blanche, plateau charge
    carrosserie(x0, top, w, h, "#d8d4cc", "#f4f0e8", "#8a867e");
    roues(x0, top, w, h, 3);
    const cab = sens > 0 ? x0 + w - 22 : x0;
    ctx.fillStyle = "#14263a";
    ctx.fillRect(cab + (sens > 0 ? 10 : 4), top + 4, 8, h - 8);
    const pl = sens > 0 ? x0 + 4 : x0 + 26;
    ctx.fillStyle = "#6a5a48";
    ctx.fillRect(pl, top + 3, w - 30, h - 6);
    ctx.fillStyle = "#c9a172";
    ctx.fillRect(pl + 3, top + 5, 14, 10);
    ctx.fillRect(pl + 19, top + 9, 12, 10);
    ctx.fillStyle = "#3d7a34";
    ctx.fillRect(pl + 8, top + 14, 10, 6);
    phares(x0, top, w, h, sens);
  } else if (type === "bus") {
    carrosserie(x0, top - 2, w, h + 4, "#e0412f", "#ff8a7a", "#8e1d14");
    roues(x0, top - 2, w, h + 4, 3);
    ctx.fillStyle = P.creme;
    ctx.fillRect(x0 + 4, top + h / 2 - 1, w - 8, 3);
    ctx.fillStyle = "#14263a";
    for (let k = 0; k < 6; k++) {
      ctx.fillRect(x0 + 10 + k * (w - 24) / 5, top + 1, 8, 4);
      ctx.fillRect(x0 + 10 + k * (w - 24) / 5, top + h - 5, 8, 4);
    }
    phares(x0, top - 2, w, h + 4, sens);
  }
}

function dessinerKappa(x, y, dir, hauteur, posee, rose) {
  // Vu de dessus : carapace sur le dos, assiette d'eau sur la tete
  const ecrase = 1 - Math.sin(Math.min(1, posee) * Math.PI) * 0.18;
  const etire = hauteur > 0 ? 1 + hauteur * 0.25 : 1;
  ctx.fillStyle = "rgba(0,0,0," + (0.35 - hauteur * 0.15) + ")";
  ctx.beginPath();
  ctx.ellipse(x + 2, y + 5, 13 - hauteur * 3, 10 - hauteur * 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(x, y - hauteur * 10);
  ctx.rotate(dir);
  ctx.scale((1 + hauteur * 0.18) / ecrase * (hauteur > 0 ? 0.92 : 1), (1 + hauteur * 0.18) * ecrase * etire);
  const peau = rose ? "#f09ab8" : "#6cc04a";
  const peauSombre = rose ? "#b8557a" : "#3d8a2a";
  // Pattes : repliees en vol, ecartees au sol
  const ec = hauteur > 0 ? 0.6 : 1;
  ctx.fillStyle = peauSombre;
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([px, py]) => {
    ctx.beginPath();
    ctx.ellipse(px * 11 * ec, py * 8 * ec + 2, 5, 3.5, px * py * 0.6, 0, Math.PI * 2);
    ctx.fill();
  });
  // Corps
  ctx.fillStyle = peau;
  ctx.beginPath();
  ctx.ellipse(0, 3, 10, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  // Carapace
  const g = ctx.createRadialGradient(-3, 2, 1, 0, 5, 11);
  g.addColorStop(0, rose ? "#ffd0e0" : "#c9d97a");
  g.addColorStop(1, rose ? "#c8608a" : "#5e7a2a");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 6, 8, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.3)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-6, 6);
  ctx.lineTo(6, 6);
  ctx.moveTo(0, -1);
  ctx.lineTo(0, 13);
  ctx.stroke();
  // Tete et bec
  ctx.fillStyle = peau;
  ctx.beginPath();
  ctx.arc(0, -8, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f2b919";
  ctx.beginPath();
  ctx.moveTo(-3, -14);
  ctx.lineTo(0, -18);
  ctx.lineTo(3, -14);
  ctx.closePath();
  ctx.fill();
  // L'assiette d'eau sur le crane
  ctx.fillStyle = "#cfe6f0";
  ctx.beginPath();
  ctx.ellipse(0, -7, 4.5, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#5a8fa8";
  ctx.beginPath();
  ctx.ellipse(0, -7, 2.5, 1.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = P.encre;
  ctx.fillRect(-5, -12, 2, 2);
  ctx.fillRect(3, -12, 2, 2);
  if (rose) {
    ctx.fillStyle = "#e0412f";
    ctx.beginPath();
    ctx.arc(6, -12, 2.5, 0, Math.PI * 2);
    ctx.arc(9, -10, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function dessinerSerpent(x, y, t, sens) {
  ctx.strokeStyle = "rgba(0,0,0,0.3)";
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  const trace = (dx, dy) => {
    ctx.beginPath();
    for (let i = 0; i <= 12; i++) {
      const xx = x + i * 5 * (sens > 0 ? 1 : -1) * -1 + (sens > 0 ? T * 1.6 : 0);
      const yy = y + Math.sin(t * 8 + i * 0.7) * 5;
      if (i === 0) {
        ctx.moveTo(xx + dx, yy + dy);
      } else {
        ctx.lineTo(xx + dx, yy + dy);
      }
    }
    ctx.stroke();
  };
  trace(2, 3);
  ctx.strokeStyle = "#c9a24a";
  ctx.lineWidth = 6;
  trace(0, 0);
  ctx.strokeStyle = "#5e3a12";
  ctx.lineWidth = 2;
  trace(0, 0);
  const hx = sens > 0 ? x + T * 1.6 : x;
  const hy = y + Math.sin(t * 8) * 5;
  ctx.fillStyle = "#c9a24a";
  ctx.beginPath();
  ctx.ellipse(hx + (sens > 0 ? 4 : -4), hy, 6, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = P.encre;
  ctx.fillRect(hx + (sens > 0 ? 6 : -8), hy - 3, 2, 2);
  if (Math.sin(t * 10) > 0.3) {
    ctx.strokeStyle = "#e0412f";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(hx + (sens > 0 ? 10 : -10), hy);
    ctx.lineTo(hx + (sens > 0 ? 15 : -15), hy);
    ctx.stroke();
  }
}

function dessinerLibellule(x, y, t) {
  const b = Math.sin(t * 40) * 0.5 + 0.5;
  ctx.fillStyle = "rgba(220,240,255," + (0.5 + b * 0.3) + ")";
  [-1, 1].forEach(s => {
    ctx.beginPath();
    ctx.ellipse(x + s * 7, y - 3, 7, 2.5 + b, s * 0.3, 0, Math.PI * 2);
    ctx.ellipse(x + s * 7, y + 2, 6, 2 + b, -s * 0.3, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = "#2f8fd8";
  ctx.fillRect(x - 1.5, y - 7, 3, 16);
  ctx.fillStyle = "#14467a";
  ctx.beginPath();
  ctx.arc(x, y - 8, 3, 0, Math.PI * 2);
  ctx.fill();
}

function texteContour(t, x, y, taille, couleur, alignement) {
  ctx.font = "800 " + taille + "px 'Anybody', sans-serif";
  ctx.textAlign = alignement || "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(3, taille * 0.2);
  ctx.strokeStyle = "#0b0b10";
  ctx.strokeText(t, x, y);
  ctx.fillStyle = couleur;
  ctx.fillText(t, x, y);
}

function dessinerTete() {
  ctx.fillStyle = "#14112a";
  ctx.fillRect(0, 0, W, HAUT);
  ctx.fillStyle = "#2a2840";
  ctx.fillRect(0, HAUT - 2, W, 2);
  ctx.font = "600 8px 'Martian Mono', monospace";
  ctx.textAlign = "left";
  ctx.fillStyle = "#8a84b0";
  ctx.fillText("SCORE", 14, 15);
  texteContour(etat.score.toLocaleString("fr-BE"), 14, 36, 24, P.lime, "left");
  ctx.textAlign = "center";
  ctx.fillStyle = "#8a84b0";
  ctx.font = "600 8px 'Martian Mono', monospace";
  ctx.fillText("NIVEAU", W / 2, 15);
  texteContour(String(etat.niveau), W / 2, 36, 24, P.creme);
  ctx.textAlign = "right";
  ctx.fillStyle = "#8a84b0";
  ctx.font = "600 8px 'Martian Mono', monospace";
  ctx.fillText("VIES", W - 14, 15);
  for (let i = 0; i < Math.min(8, etat.vies - (etat.kappa || etat.mort ? 1 : 0)); i++) {
    ctx.save();
    ctx.translate(W - 22 - i * 22, 36);
    ctx.scale(0.62, 0.62);
    dessinerKappa(0, 0, 0, 0, 1, false);
    ctx.restore();
  }
}

function dessinerPied() {
  const y = yRangee(13) + 8;
  const frac = Math.max(0, etat.chrono / DUREE);
  ctx.font = "600 8px 'Martian Mono', monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#8a84b0";
  ctx.fillText("TEMPS", 14, y + 9);
  const x0 = 64;
  const w = W - 80;
  ctx.fillStyle = "#2a2840";
  ctx.beginPath();
  ctx.roundRect(x0, y + 3, w, 12, 6);
  ctx.fill();
  ctx.fillStyle = frac < 0.25 ? "#e0412f" : frac < 0.5 ? "#f2b919" : P.lime;
  ctx.beginPath();
  ctx.roundRect(x0, y + 3, Math.max(12, w * frac), 12, 6);
  ctx.fill();
}

function dessiner() {
  if (etat === null || fond === null) {
    return;
  }
  ctx.setTransform(echelle, 0, 0, echelle, 0, 0);
  ctx.drawImage(fond, 0, 0, W, H);
  const t = etat.temps;

  // Bassins : remplis, libellule, crocodile
  etat.bassins.forEach((b, i) => {
    const x = BASSINS[i] + T / 2;
    const y = yRangee(0) + T / 2 + 2;
    // Fleur de lotus posee dans chaque bassin vide
    if (!b.plein && !b.bonus) {
      ctx.fillStyle = "#3f8a3a";
      ctx.beginPath();
      ctx.arc(x - 8, y + 4, 7, 0.4, Math.PI * 2 - 0.2);
      ctx.lineTo(x - 8, y + 4);
      ctx.fill();
      ctx.fillStyle = "#f4a8c6";
      ctx.beginPath();
      ctx.ellipse(x + 8, y - 3, 4, 6, 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    if (b.plein) {
      dessinerKappa(x, y, 0, 0, 1, false);
      if (b.femme) {
        dessinerKappa(x + 12, y + 4, 0, 0, 1, true);
      }
    } else if (b.bonus === "libellule") {
      dessinerLibellule(x, y, t);
    } else if (b.bonus === "croco") {
      const sortie = Math.min(1, (4 - b.t) * 2, b.t * 2);
      ctx.fillStyle = "#4f7a2a";
      ctx.beginPath();
      ctx.ellipse(x, y + 10 - sortie * 10, 12, 8 * sortie + 1, 0, Math.PI, 0);
      ctx.fill();
      if (sortie > 0.6) {
        ctx.fillStyle = "#ffd23a";
        ctx.fillRect(x - 7, y - 4, 4, 3);
        ctx.fillRect(x + 3, y - 4, 4, 3);
        ctx.fillStyle = P.creme;
        for (let k = -2; k <= 2; k++) {
          ctx.fillRect(x + k * 4 - 1, y + 2, 2, 3);
        }
      }
    }
  });

  // Courant : quelques reflets qui derivent dans le sens de chaque voie
  etat.config.voies.forEach(v => {
    if (!v.eau) {
      return;
    }
    const y = yRangee(v.r);
    ctx.fillStyle = "rgba(160,205,235,0.28)";
    for (let i = 0; i < 4; i++) {
      const base = (i * 173 + v.r * 61) % W;
      const x = ((base + t * v.v * 0.6) % (W + 60) + W + 60) % (W + 60) - 30;
      ctx.fillRect(x, y + 7 + ((i * 17 + v.r * 7) % (T - 14)), 10 + ((i * 7 + v.r) % 4) * 6, 2);
    }
  });

  // Flotteurs et vehicules
  etat.config.voies.forEach(v => {
    const y = yRangee(v.r);
    const sens = Math.sign(v.v);
    v.objets.forEach(o => {
      if (o.x > W + T || o.x + o.long * T < -T) {
        return;
      }
      if (v.eau) {
        if (o.type.startsWith("rondin")) {
          dessinerRondin(o.x, y, o.long, o);
          if (etat.config.serpentRondin && o.type === "rondinLong") {
            const sx = o.x + o.long * T * (0.5 + Math.sin(t * 0.9 + o.phase) * 0.35);
            dessinerSerpent(sx - T * 0.8, y + T / 2, t, Math.cos(t * 0.9 + o.phase) > 0 ? 1 : -1);
          }
        } else if (o.type === "crocodile") {
          dessinerCrocodile(o.x, y, o.long, sens, t, o);
        } else if (o.type === "nenuphars") {
          const p = largeurPlongee(o, t);
          for (let k = 0; k < o.long; k++) {
            dessinerNenuphar(o.x + k * T, y, p);
          }
        } else {
          const p = largeurPlongee(o, t);
          for (let k = 0; k < o.long; k++) {
            dessinerTortue(o.x + k * T, y, p, sens, t, k);
          }
        }
      } else {
        dessinerVehicule(o.type, o.x, y, o.long, sens, t);
      }
    });
  });

  // La kappa rose sur son rondin
  if (etat.femme) {
    const f = etat.femme;
    ctx.save();
    ctx.translate(f.objet.x + f.decal, yRangee(f.voie.r) + T / 2);
    ctx.scale(0.85, 0.85);
    dessinerKappa(0, 0, Math.cos(t * 1.5) > 0 ? Math.PI / 2 : -Math.PI / 2, 0, 1, true);
    ctx.restore();
  }
  // Serpent de la berge
  if (etat.serpent) {
    dessinerSerpent(etat.serpent.x, yRangee(6) + T / 2, t, etat.serpent.sens);
  }

  // Rides des plongeons et des noyades
  etat.rides.forEach(r => {
    if (r.age < 0) {
      return;
    }
    const k = r.age / 0.9;
    ctx.strokeStyle = "rgba(207,230,240," + (1 - k) + ")";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(r.x, r.y, 6 + k * 22, 4 + k * 14, 0, 0, Math.PI * 2);
    ctx.stroke();
  });

  // Le kappa
  const k = etat.kappa;
  if (k && !etat.mort) {
    let x = k.x;
    let y = yRangee(k.r) + T / 2;
    let hauteur = 0;
    if (k.saut > 0) {
      const u = 1 - k.saut / DUREE_SAUT;
      x = k.deX + (k.versX - k.deX) * u;
      y = yRangee(k.deR) + T / 2 + (k.versR - k.deR) * T * u;
      hauteur = Math.sin(u * Math.PI);
    }
    dessinerKappa(x, y, k.dir, hauteur, k.saut > 0 ? 1 : k.posee, false);
    if (k.femme) {
      dessinerKappa(x + 9, y + 9, k.dir, hauteur, 1, true);
    }
  }
  if (etat.mort) {
    dessinerMort(etat.mort);
  }

  etat.eclats.forEach(e => {
    ctx.globalAlpha = Math.min(1, e.vie * 3);
    ctx.fillStyle = e.couleur;
    ctx.fillRect(e.x - 1.5, e.y - 1.5, 3, 3);
  });
  ctx.globalAlpha = 1;
  etat.textes.forEach(tx => {
    ctx.globalAlpha = tx.age > 0.7 ? (1 - tx.age) / 0.3 : 1;
    texteContour(tx.texte, tx.x, tx.y - tx.age * 26, 14, tx.couleur);
  });
  ctx.globalAlpha = 1;

  dessinerTete();
  dessinerPied();

  if (etat.message || etat.pause) {
    const m = etat.pause ? { titre: "Pause", sous: "P pour reprendre" } : etat.message;
    const y = yRangee(6) + T / 2;
    ctx.fillStyle = "rgba(11,11,16,0.72)";
    ctx.fillRect(0, y - 34, W, 68);
    texteContour(m.titre.toUpperCase(), W / 2, y - (m.sous ? 8 : 0), 30, etat.termine ? P.rouge : P.creme);
    if (m.sous) {
      ctx.font = "600 10px 'Martian Mono', monospace";
      ctx.fillStyle = P.lime;
      ctx.textAlign = "center";
      ctx.fillText(m.sous, W / 2, y + 20);
    }
  }
}

function dessinerMort(m) {
  const k = Math.min(1, m.t / 1.2);
  if (m.cause === "route") {
    // Aplati sur la route, des etoiles tournent au-dessus
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.scale(1.35, 0.45);
    dessinerKappa(0, 0, m.dir, 0, 1, false);
    ctx.restore();
    for (let i = 0; i < 3; i++) {
      const a = m.t * 6 + (i / 3) * Math.PI * 2;
      etoile(m.x + Math.cos(a) * 14, m.y - 12 + Math.sin(a) * 5, 4);
    }
  } else if (m.cause === "eau") {
    // Il s'enfonce, de plus en plus petit et pale
    if (k < 0.6) {
      ctx.globalAlpha = 1 - k / 0.6;
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.scale(1 - k, 1 - k);
      dessinerKappa(0, 0, m.dir, 0, 1, false);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  } else {
    // Croque, mordu, ou plus de temps : il tourne et disparait
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(m.t * 8);
    ctx.scale(1 - k, 1 - k);
    dessinerKappa(0, 0, 0, 0, 1, false);
    ctx.restore();
    if (m.cause === "temps") {
      texteContour("TEMPS !", m.x, m.y - 24, 14, P.or);
    }
  }
}

function etoile(x, y, r) {
  ctx.fillStyle = P.or;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

// ---------------------------------------------------------------------
// Taille du canvas
// ---------------------------------------------------------------------

function ajuster() {
  const marge = window.innerWidth >= 1100 ? 500 : 0;
  const largeur = Math.min(window.innerWidth * 0.96 - marge, 700);
  const entete = zone.querySelector(".entete-kappa").getBoundingClientRect().height || 40;
  const manette = parseFloat(getComputedStyle(document.body).getPropertyValue("--hauteur-manette")) || 0;
  const hauteur = Math.max(280, window.innerHeight - entete - manette - 40);
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

const boucle = creerBoucle(function (dt) {
  maj(dt);
  dessiner();
}, { plafond: 1 / 30 });

// ---------------------------------------------------------------------
// Commandes
// ---------------------------------------------------------------------

function majBoutonSon() {
  boutonSon.textContent = sonActif() ? "Son" : "Muet";
}

function demarrer() {
  etat = nouvelEtat();
  fond = null;
  ajuster();
  requestAnimationFrame(ajuster);
  lancerNiveau();
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

const DIRECTIONS = {
  arrowup: [-1, 0], z: [-1, 0], w: [-1, 0],
  arrowdown: [1, 0], s: [1, 0],
  arrowleft: [0, -1], q: [0, -1], a: [0, -1],
  arrowright: [0, 1], d: [0, 1],
  " ": [-1, 0]
};

surTouche(ID, function (evenement) {
  const touche = evenement.key.toLowerCase();
  const d = DIRECTIONS[touche];
  if (d) {
    if (!evenement.repeat) {
      sauter(d[0], d[1]);
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

surGlissement(canvas, function (geste) {
  if (geste.tape) {
    sauter(-1, 0);
  } else if (geste.horizontal) {
    sauter(0, geste.deltaX > 0 ? 1 : -1);
  } else {
    sauter(geste.deltaY > 0 ? 1 : -1, 0);
  }
}, { actif: () => jeuAuPremierPlan(ID) });

let derniereTouche = 0;
canvas.addEventListener("touchend", function () {
  derniereTouche = performance.now();
}, { passive: true });

canvas.addEventListener("click", function (evenement) {
  // A la souris : un clic avance (le doigt passe deja par le glissement)
  if (evenement.pointerType === "touch" || performance.now() - derniereTouche < 700 || !jeuAuPremierPlan(ID)) {
    return;
  }
  sauter(-1, 0);
});
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
zone.querySelector("#rejouerKappa").addEventListener("click", demarrer);
zone.querySelector("#quitterKappa").addEventListener("click", quitterJeu);

// Pour les tests automatiques
export const _test = { get etat() { return etat; }, sauter, configurerNiveau, lancerNiveau };

enregistrerJeu({
  id: ID,
  nom: "Frogger",
  code: "1891",
  section: zone,
  demarrer,
  arreter: () => boucle.arreter(),
  manette: { a: "ArrowUp", b: " ", start: "p", quatreDirections: true, libelles: { a: "Sauter", b: "Sauter" } }
});
