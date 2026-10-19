// =====================================================================
//  GALAXIAN (Karasu, l'escadrille des corbeaux tengu), facon Galaga
//  Le tanuki pilote un petit vaisseau de papier et de laque au-dessus
//  du sanctuaire. Les corbeaux entrent par escadrilles en decrivant des
//  courbes, se rangent en formation qui respire, puis plongent en piqué.
//  - Le dai-tengu (chef, deux coups) peut capturer le vaisseau avec son
//    rayon. L'abattre pendant qu'il plonge libere le vaisseau captif,
//    qui rejoint le joueur : deux vaisseaux, deux fois plus de tirs.
//  - Toutes les trois vagues, une etape bonus : les escadrilles passent
//    sans tirer, chaque corbeau abattu rapporte.
//  - Les vagues ne s'arretent jamais : la formation et les entrees
//    changent d'une vague a l'autre, et tout accelere sans plafond.
//  - Bonus qui tombent : tir etale, tir rapide, bouclier, missiles,
//    bombes (bouton B). Le dai-tengu en lache souvent, une escadrille
//    entiere abattue en lache toujours un.
//  - Hangar avant chaque partie : les plumes gagnees en jouant
//    debloquent quatre vaisseaux et des ameliorations par paliers.
// =====================================================================

import { enregistrerJeu, finDePartie, quitterJeu, majScoreCourant } from "./arcade.js";
import { creerBoucle } from "./noyau/boucle.js";
import { surTouche, jeuAuPremierPlan } from "./noyau/clavier.js";
import { creerStockage } from "./noyau/stockage.js";
import { jouer, basculerSon, sonActif } from "./noyau/son.js";

const ID = "karasu";
const W = 480;
const H = 720;
const JOUEUR_Y = 650;
const VITESSE_JOUEUR = 260;
const ECART_DOUBLE = 34;
const CADENCE = 0.22;
const TIRS_MAX = 2;                 // volees en vol par vaisseau
const VIE_PALIERS = [20000, 70000];
const VIE_ECART = 70000;

const zone = document.createElement("section");
zone.className = "jeu jeu-karasu";
zone.id = "jeuKarasu";
zone.hidden = true;
zone.innerHTML = `
  <div class="jeu-entete entete-karasu">
    <span class="entete-boutons">
      <button class="jeu-quitter" id="sonKarasu" type="button">Son</button>
      <button class="jeu-quitter" id="rejouerKarasu" type="button">Rejouer</button>
      <button class="jeu-quitter" id="quitterKarasu" type="button">Retour</button>
    </span>
  </div>
  <canvas id="canvasKarasu"></canvas>
  <p class="jeu-aide">Fl&egrave;ches ou Q D pour bouger, Espace pour tirer (maintenu, tir automatique). Au doigt : le vaisseau suit ton doigt et tire tout seul. Le dai-tengu violet capture ton vaisseau avec son rayon : abats-le pendant qu'il plonge pour le r&eacute;cup&eacute;rer et tirer en double. Ramasse les charmes qui tombent (&eacute;ventail, rafale, bouclier, missiles, bombes) ; B ou C l&acirc;che une bombe. Avant chaque partie, le hangar d&eacute;bloque vaisseaux et am&eacute;liorations avec tes plumes. P pause, M son, N rejouer, &Eacute;chap quitter.</p>`;
document.body.appendChild(zone);

const canvas = zone.querySelector("#canvasKarasu");
const ctx = canvas.getContext("2d");
const boutonSon = zone.querySelector("#sonKarasu");
const stockageRecord = creerStockage("tanuki-arcade-karasu-record");
const stockageHangar = creerStockage("tanuki-arcade-karasu-hangar");

// Les quatre vaisseaux : chacun son style de jeu et son dessin
const VAISSEAUX = [
  { id: "kami", nom: "Kami", sous: "Papier et laque", prix: 0, vitesse: 1, cadence: 1, tir: "simple", bouclier: false,
    texte: "Équilibré, le vaisseau du tanuki depuis toujours." },
  { id: "hayabusa", nom: "Hayabusa", sous: "Le faucon", prix: 300, vitesse: 1.32, cadence: 0.88, tir: "simple", bouclier: false,
    texte: "Très rapide, tire plus vite, idéal pour esquiver." },
  { id: "kabuto", nom: "Kabuto", sous: "Le scarabée", prix: 650, vitesse: 0.86, cadence: 1.05, tir: "double", bouclier: true,
    texte: "Lent mais blindé : bouclier au départ, deux canons." },
  { id: "ryu", nom: "Ryu", sous: "Le dragon", prix: 1300, vitesse: 1, cadence: 1.4, tir: "etale", bouclier: false,
    texte: "Tir en éventail permanent, cadence plus lente." }
];

// Ameliorations par paliers, payees en plumes
const AMELIORATIONS = [
  { id: "cadence", nom: "Cadence de tir", effet: "-8 % de délai par palier" },
  { id: "moteur", nom: "Moteur", effet: "+8 % de vitesse par palier" },
  { id: "bombes", nom: "Soute à bombes", effet: "+1 bombe au départ par palier" },
  { id: "duree", nom: "Charmes durables", effet: "+25 % de durée des bonus" }
];
const PRIX_PALIERS = [120, 300, 600];

function lireHangar() {
  const h = Object.assign({ plumes: 0, vaisseaux: ["kami"], choisi: "kami", ameliorations: {} }, stockageHangar.lire() || {});
  AMELIORATIONS.forEach(a => {
    h.ameliorations[a.id] = h.ameliorations[a.id] || 0;
  });
  if (!h.vaisseaux.includes(h.choisi)) {
    h.choisi = "kami";
  }
  return h;
}

let hangar = lireHangar();

function vaisseauChoisi() {
  return VAISSEAUX.find(v => v.id === hangar.choisi) || VAISSEAUX[0];
}

function palier(id) {
  return hangar.ameliorations[id] || 0;
}

// Les bonus qui tombent des corbeaux
const BONUS = {
  etale: { nom: "Éventail", couleur: "#c6f35a", sombre: "#5d7a1c", lettre: "E", duree: 12 },
  rapide: { nom: "Rafale", couleur: "#f2c14a", sombre: "#8a6a1a", lettre: "R", duree: 12 },
  bouclier: { nom: "Bouclier", couleur: "#5a8fa8", sombre: "#2a4c5c", lettre: "B", duree: 0 },
  missile: { nom: "Missiles", couleur: "#e0574b", sombre: "#7e1d15", lettre: "M", duree: 12 },
  bombe: { nom: "Bombe", couleur: "#f3ead6", sombre: "#8a8070", lettre: "+", duree: 0 }
};

const C = {
  encre: "#0b0b10",
  creme: "#f3ead6",
  rouge: "#d8392b",
  rougeSombre: "#7e1d15",
  or: "#f2c14a",
  lime: "#c6f35a",
  bleu: "#5a8fa8"
};

// ---------------------------------------------------------------------
// Courbes : Catmull-Rom echantillonnee, parcourue a vitesse constante
// ---------------------------------------------------------------------

function courbe(points) {
  const pts = [points[0], ...points, points[points.length - 1]];
  const echantillons = [];
  for (let i = 1; i < pts.length - 2; i++) {
    const [p0, p1, p2, p3] = [pts[i - 1], pts[i], pts[i + 1], pts[i + 2]];
    for (let k = 0; k < 16; k++) {
      const t = k / 16;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      echantillons.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  echantillons.push(points[points.length - 1]);
  const cumul = [0];
  for (let i = 1; i < echantillons.length; i++) {
    cumul.push(cumul[i - 1] + Math.hypot(echantillons[i][0] - echantillons[i - 1][0], echantillons[i][1] - echantillons[i - 1][1]));
  }
  return { pts: echantillons, cumul, longueur: cumul[cumul.length - 1] };
}

function pointSur(c, d) {
  if (d >= c.longueur) {
    return c.pts[c.pts.length - 1];
  }
  let i = 1;
  while (c.cumul[i] < d) {
    i++;
  }
  const t = (d - c.cumul[i - 1]) / (c.cumul[i] - c.cumul[i - 1] || 1);
  const a = c.pts[i - 1];
  const b = c.pts[i];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

const miroir = pts => pts.map(([x, y]) => [W - x, y]);

// Entrees en escadrille
const ENTREES = [
  [[240, -30], [240, 130], [170, 280], [80, 350], [44, 260], [110, 180], [200, 220]],
  [[-30, 640], [120, 540], [240, 420], [270, 300], [190, 230], [120, 290], [170, 350]],
  [[-30, 90], [150, 200], [300, 150], [380, 240], [290, 320], [210, 260]],
  [[120, -30], [120, 200], [240, 330], [380, 300], [350, 190], [260, 210]],
  [[-30, 400], [140, 300], [90, 160], [200, 80], [300, 160], [240, 260]]
];

// Passages de l'etape bonus : les corbeaux traversent et s'en vont
const PASSAGES = [
  [[240, -30], [240, 200], [110, 320], [240, 440], [370, 320], [240, 200], [240, -50]],
  [[-30, 160], [120, 260], [240, 160], [360, 260], [520, 160]],
  [[-30, 560], [140, 420], [240, 300], [140, 180], [-40, 120]],
  [[120, -30], [180, 260], [300, 380], [420, 300], [520, 120]],
  [[-30, 300], [100, 200], [240, 420], [380, 200], [520, 300]]
];

// ---------------------------------------------------------------------
// La formation : chefs en haut, tengu, puis corbeaux
// ---------------------------------------------------------------------

const PLACES = [];
[3, 4, 5, 6].forEach(col => PLACES.push({ type: "chef", col, rang: 0 }));
[1, 2].forEach(rang => {
  for (let col = 1; col <= 8; col++) {
    PLACES.push({ type: "tengu", col, rang });
  }
});
[3, 4].forEach(rang => {
  for (let col = 0; col <= 9; col++) {
    PLACES.push({ type: "corbeau", col, rang });
  }
});

const POINTS = {
  corbeau: { formation: 50, plongee: 100 },
  tengu: { formation: 80, plongee: 160 },
  chef: { formation: 150, plongee: 400 }
};

function hasard(graine) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------
// Etat
// ---------------------------------------------------------------------

let etat = null;
let echelle = 1;
const commandes = { gauche: false, droite: false, tir: false };
let doigtX = null;
let etoiles = [];
let nuages = [];

function nouvelEtat() {
  return {
    score: 0,
    record: Number(stockageRecord.lireTexte()) || 0,
    vies: 3,
    vague: 0,
    bonus: false,
    temps: 0,
    defil: 0,
    joueur: { x: W / 2, double: false, mort: 0, invincible: 0, actif: true, aspire: null },
    tirs: [],
    tirsEnnemis: [],
    ennemis: [],
    eclats: [],
    anneaux: [],
    textes: [],
    banniere: null,
    attente: 0,
    prochainPlongeon: 2,
    cadence: 0,
    captif: null,              // vaisseau capture, porte par un chef
    libere: null,              // vaisseau libere qui rejoint le joueur
    prochaineVie: VIE_PALIERS[0],
    pause: false,
    termine: false,
    finTimer: 0,
    touchesBonus: 0,
    totalBonus: 0,
    tirsTires: 0,
    tirsTouches: 0,
    ecran: "hangar",
    modele: vaisseauChoisi(),
    actifs: { etale: 0, rapide: 0, missile: 0 },
    bouclier: vaisseauChoisi().bouclier,
    bombes: 1 + palier("bombes"),
    objets: [],
    missiles: [],
    prochainMissile: 0,
    flash: 0,
    plumesGagnees: 0
  };
}

// La difficulte monte sans plafond, de plus en plus doucement
function vitesse() {
  return 1 + 0.28 * Math.log(etat.vague);
}

function vitesseBalle() {
  return 250 + 55 * Math.sqrt(etat.vague - 1);
}

function intervallePlongee() {
  return 0.5 + 2.2 / (1 + 0.32 * (etat.vague - 1));
}

function plongeursMax() {
  return Math.min(14, 2 + Math.floor(etat.vague / 2));
}

function formeFormation() {
  return (etat.vague - 1) % 4;
}

function positionPlace(place) {
  const t = etat.temps;
  const complete = etat.ennemis.length > 0 && etat.ennemis.every(e => e.etat !== "entree");
  const souffle = complete ? 1 + 0.07 * Math.sin(t * 1.7) : 1;
  const balance = complete ? 0 : Math.sin(t * 0.9) * 22;
  const dx = (place.col - 4.5) * 38;
  let y = 100 + place.rang * 38;
  const f = formeFormation();
  if (f === 1) {
    y += Math.pow(place.col - 4.5, 2) * 1.5;
  } else if (f === 2) {
    y += Math.abs(place.col - 4.5) * 6;
  } else if (f === 3) {
    y += 28 - Math.pow(place.col - 4.5, 2) * 1.3;
  }
  return [W / 2 + balance + dx * souffle, 60 + (y - 60) * (complete ? 1 + 0.04 * Math.sin(t * 1.7) : 1)];
}

// ---------------------------------------------------------------------
// Vagues
// ---------------------------------------------------------------------

function banniere(titre, sous, duree) {
  etat.banniere = { titre, sous: sous || "", age: 0, duree: duree || 2.2 };
}

function lancerVague() {
  etat.vague++;
  etat.bonus = etat.vague >= 3 && etat.vague % 3 === 0;
  etat.ennemis = [];
  etat.tirsEnnemis = [];
  const alea = hasard(etat.vague * 7919);
  if (etat.bonus) {
    etat.touchesBonus = 0;
    etat.totalBonus = 40;
    banniere("Étape bonus", "Abats-les tous, ils ne tirent pas", 2.4);
    jouer("pouvoir");
    for (let g = 0; g < 5; g++) {
      const base = PASSAGES[(g + etat.vague) % PASSAGES.length];
      const types = ["corbeau", "tengu", "chef", "tengu", "corbeau"];
      for (let k = 0; k < 8; k++) {
        const chemin = courbe(k % 2 ? miroir(base) : base);
        etat.ennemis.push(nouvelEnnemi(types[g], null, chemin, 1.6 + g * 3.2 + Math.floor(k / 2) * 0.22, "passage"));
      }
    }
    return;
  }
  banniere("Vague " + etat.vague, etat.vague === 1 ? "Prêt ?" : "", 2);
  jouer("vague");
  // Cinq escadrilles de huit, chacune sur une entree et son miroir
  const groupes = [
    PLACES.filter(p => p.type === "tengu" && p.col >= 3 && p.col <= 6).concat(PLACES.filter(p => p.type === "corbeau" && p.col >= 3 && p.col <= 6 && p.rang === 3)).slice(0, 8),
    PLACES.filter(p => p.type === "chef").concat(PLACES.filter(p => p.type === "tengu" && (p.col <= 2 || p.col >= 7) && p.rang === 1)),
    PLACES.filter(p => p.type === "tengu" && (p.col <= 2 || p.col >= 7) && p.rang === 2).concat(PLACES.filter(p => p.type === "tengu" && p.rang === 2 && p.col >= 3 && p.col <= 6)),
    PLACES.filter(p => p.type === "corbeau" && p.rang === 3 && (p.col <= 2 || p.col >= 7)).concat(PLACES.filter(p => p.type === "corbeau" && p.rang === 4 && p.col >= 3 && p.col <= 6)),
    PLACES.filter(p => p.type === "corbeau" && p.rang === 4 && (p.col <= 2 || p.col >= 7))
  ];
  // Le reste des places, s'il en manque, rejoint le dernier groupe
  const utilisees = new Set(groupes.flat());
  PLACES.forEach(p => {
    if (!utilisees.has(p)) {
      groupes[4].push(p);
    }
  });
  const ordre = [0, 1, 2, 3, 4].sort(() => alea() - 0.5);
  groupes.forEach((places, g) => {
    const base = ENTREES[ordre[g]];
    places.forEach((place, k) => {
      const chemin = courbe(k % 2 ? miroir(base) : base);
      const ennemi = nouvelEnnemi(place.type, place, chemin, 1.8 + g * 2.6 + Math.floor(k / 2) * 0.16, "entree");
      ennemi.groupe = g;
      etat.ennemis.push(ennemi);
    });
  });
  etat.prochainPlongeon = 3;
}

function nouvelEnnemi(type, place, chemin, delai, mode) {
  return {
    type, place, chemin, d: 0, delai, mode,
    etat: delai > 0 ? "attente" : mode,
    x: -100, y: -100, angle: Math.PI / 2,
    vies: type === "chef" ? 2 : 1,
    battement: Math.random() * 6,
    escorte: null, tirsRestants: 0, prochainTir: 0,
    capture: null
  };
}

// ---------------------------------------------------------------------
// Plongees et capture
// ---------------------------------------------------------------------

function cheminPlongee(e, versX) {
  const cote = e.x < W / 2 ? -1 : 1;
  const px = Math.max(40, Math.min(W - 40, versX + (Math.random() - 0.5) * 80));
  if (e.type === "tengu" && Math.random() < 0.45) {
    // Le tengu fait une boucle a mi-hauteur et remonte a sa place
    return courbe([[e.x, e.y], [e.x + cote * 40, e.y - 30], [e.x + cote * 70, e.y + 40], [px, 420], [px - cote * 70, 520], [px - cote * 110, 430], [e.x, e.y + 40]]);
  }
  return courbe([[e.x, e.y], [e.x + cote * 40, e.y - 30], [e.x + cote * 70, e.y + 50], [px, 430], [px - cote * 90, 620], [px - cote * 140, 790]]);
}

function lancerPlongee(e, versX) {
  e.etat = "plongee";
  e.chemin = cheminPlongee(e, versX);
  e.d = 0;
  e.tirsRestants = etat.bonus ? 0 : 1 + Math.min(3, Math.floor(etat.vague / 4));
  e.prochainTir = 0.4 + Math.random() * 0.5;
  jouer("grain");
}

function lancerCapture(chef) {
  const px = etat.joueur.x;
  chef.etat = "capture";
  chef.chemin = courbe([[chef.x, chef.y], [chef.x + (chef.x < W / 2 ? -50 : 50), chef.y - 20], [(chef.x + px) / 2, 280], [px, 420]]);
  chef.d = 0;
  chef.capture = { phase: "descente", t: 0, longueur: 0 };
}

function choisirPlongeurs(dt) {
  if (etat.bonus || !etat.joueur.actif) {
    return;
  }
  const enFormation = etat.ennemis.filter(e => e.etat === "formation");
  if (enFormation.length !== etat.ennemis.filter(e => e.etat !== "mort").length && etat.ennemis.some(e => e.etat === "entree" || e.etat === "attente")) {
    return;
  }
  etat.prochainPlongeon -= dt;
  if (etat.prochainPlongeon > 0) {
    return;
  }
  etat.prochainPlongeon = intervallePlongee() * (0.7 + Math.random() * 0.6);
  const enVol = etat.ennemis.filter(e => e.etat === "plongee" || e.etat === "capture" || e.etat === "retour").length;
  if (enVol >= plongeursMax() || enFormation.length === 0) {
    return;
  }
  const chefs = enFormation.filter(e => e.type === "chef");
  const dejaCapture = etat.ennemis.some(e => e.etat === "capture") || etat.captif || etat.joueur.double || etat.libere;
  if (chefs.length && !dejaCapture && Math.random() < 0.28) {
    lancerCapture(chefs[Math.floor(Math.random() * chefs.length)]);
    return;
  }
  if (chefs.length && Math.random() < 0.3) {
    // Un chef plonge avec ses deux escortes
    const chef = chefs[Math.floor(Math.random() * chefs.length)];
    lancerPlongee(chef, etat.joueur.x);
    const escortes = enFormation.filter(e => e.type === "tengu" && Math.abs(e.place.col - chef.place.col) <= 1 && e.place.rang === 1).slice(0, 2);
    chef.escorte = escortes;
    escortes.forEach((e, i) => {
      e.etat = "plongee";
      e.chemin = courbe(chef.chemin.pts.filter((_, k) => k % 4 === 0).map(([x, y]) => [x + (i ? 26 : -26), y + 10]).concat([[chef.chemin.pts[chef.chemin.pts.length - 1][0] + (i ? 26 : -26), 800]]));
      e.d = 0;
      e.tirsRestants = 1;
      e.prochainTir = 0.6;
    });
    return;
  }
  const candidats = enFormation.filter(e => e.type !== "chef");
  const n = Math.random() < Math.min(0.6, etat.vague * 0.05) ? 2 : 1;
  for (let i = 0; i < n && candidats.length; i++) {
    const e = candidats.splice(Math.floor(Math.random() * candidats.length), 1)[0];
    lancerPlongee(e, etat.joueur.x);
  }
}

function largeurRayon(chef) {
  return 28 + chef.capture.longueur * 0.32;
}

function majCapture(chef, dt) {
  const c = chef.capture;
  c.t += dt;
  if (c.phase === "descente") {
    chef.d += 200 * vitesse() * dt;
    const [x, y] = pointSur(chef.chemin, chef.d);
    chef.angle = Math.atan2(y - chef.y, x - chef.x);
    chef.x = x;
    chef.y = y;
    if (chef.d >= chef.chemin.longueur) {
      c.phase = "rayon";
      c.t = 0;
      chef.angle = Math.PI / 2;
      jouer("boss");
    }
  } else if (c.phase === "rayon") {
    // Le rayon s'allonge, reste, puis se retire
    const duree = 3.2;
    c.longueur = c.t < 0.6 ? (c.t / 0.6) * 210 : c.t > duree - 0.5 ? Math.max(0, (duree - c.t) / 0.5) * 210 : 210;
    const j = etat.joueur;
    if (j.actif && !j.aspire && j.invincible <= 0 && c.longueur > 150 && !etat.captif) {
      const demi = largeurRayon(chef) / 2;
      const xs = j.double ? [j.x - ECART_DOUBLE / 2, j.x + ECART_DOUBLE / 2] : [j.x];
      if (xs.some(x => Math.abs(x - chef.x) < demi)) {
        j.aspire = { chef, t: 0, x: j.x, y: JOUEUR_Y };
        jouer("pouvoir");
      }
    }
    if (c.t >= duree && !etat.joueur.aspire) {
      retourFormation(chef);
    }
  }
}

function retourFormation(e) {
  e.etat = "retour";
  e.capture = null;
  const [sx, sy] = positionPlace(e.place);
  e.chemin = courbe([[e.x, e.y], [e.x, e.y - 60], [sx, sy + 90], [sx, sy]]);
  e.d = 0;
}

// Le vaisseau aspire monte vers le chef en tournant
function majAspiration(dt) {
  const j = etat.joueur;
  const a = j.aspire;
  if (!a) {
    return;
  }
  a.t += dt;
  const chef = a.chef;
  const k = Math.min(1, a.t / 1.6);
  a.x += (chef.x - a.x) * Math.min(1, dt * 3);
  a.y = JOUEUR_Y + (chef.y - 34 - JOUEUR_Y) * k;
  if (k >= 1) {
    // Capture faite : le vaisseau devient captif du chef
    etat.captif = { chef };
    chef.capture = null;
    j.aspire = null;
    if (j.double) {
      j.double = false;
    } else {
      j.actif = false;
      j.mort = 2.4;
      etat.vies--;
    }
    banniere("Vaisseau capturé", "Abats ce chef pendant qu'il plonge", 2.4);
    jouer("mort");
    retourFormation(chef);
  }
}

// ---------------------------------------------------------------------
// Mise a jour des ennemis
// ---------------------------------------------------------------------

function majEnnemis(dt) {
  const v = vitesse();
  etat.ennemis.forEach(e => {
    e.battement += dt * (e.etat === "formation" ? 6 : 12);
    if (e.etat === "attente") {
      e.delai -= dt;
      if (e.delai <= 0) {
        e.etat = e.mode;
        const p = e.chemin.pts[0];
        e.x = p[0];
        e.y = p[1];
      }
      return;
    }
    if (e.etat === "entree" || e.etat === "passage") {
      e.d += (e.etat === "passage" ? 280 : 300) * v * dt;
      const [x, y] = pointSur(e.chemin, e.d);
      e.angle = Math.atan2(y - e.y, x - e.x);
      e.x = x;
      e.y = y;
      if (e.d >= e.chemin.longueur) {
        if (e.etat === "passage") {
          e.etat = "mort";
        } else {
          e.etat = "rejoint";
        }
      }
      return;
    }
    if (e.etat === "rejoint") {
      const [sx, sy] = positionPlace(e.place);
      const dx = sx - e.x;
      const dy = sy - e.y;
      const d = Math.hypot(dx, dy);
      const pas = 260 * v * dt;
      if (d <= pas) {
        e.x = sx;
        e.y = sy;
        e.etat = "formation";
      } else {
        e.angle = Math.atan2(dy, dx);
        e.x += dx / d * pas;
        e.y += dy / d * pas;
      }
      return;
    }
    if (e.etat === "formation") {
      const [sx, sy] = positionPlace(e.place);
      e.x = sx;
      e.y = sy;
      e.angle += (Math.PI / 2 - e.angle) * Math.min(1, dt * 8);
      return;
    }
    if (e.etat === "capture") {
      majCapture(e, dt);
      return;
    }
    if (e.etat === "plongee" || e.etat === "retour") {
      e.d += (e.etat === "retour" ? 260 : 240) * v * dt;
      const [x, y] = pointSur(e.chemin, e.d);
      e.angle = Math.atan2(y - e.y, x - e.x);
      e.x = x;
      e.y = y;
      if (e.etat === "plongee" && e.tirsRestants > 0 && e.y > 140 && e.y < JOUEUR_Y - 120) {
        e.prochainTir -= dt;
        if (e.prochainTir <= 0) {
          e.tirsRestants--;
          e.prochainTir = 0.35 + Math.random() * 0.3;
          tirEnnemi(e);
        }
      }
      if (e.d >= e.chemin.longueur) {
        if (e.etat === "plongee" && e.y > H) {
          // Sortie par le bas : il revient par le haut vers sa place
          e.x = positionPlace(e.place)[0];
          e.y = -30;
          e.etat = "rejoint";
        } else {
          e.etat = e.etat === "plongee" ? "rejoint" : "formation";
        }
      }
    }
  });
  etat.ennemis = etat.ennemis.filter(e => e.etat !== "mort");
}

function tirEnnemi(e) {
  const vy = vitesseBalle();
  const dx = etat.joueur.x - e.x;
  const dy = JOUEUR_Y - e.y;
  const vx = Math.max(-120, Math.min(120, dx / Math.max(1, dy) * vy));
  etat.tirsEnnemis.push({ x: e.x, y: e.y + 14, vx, vy });
}

// ---------------------------------------------------------------------
// Joueur
// ---------------------------------------------------------------------

function positionsVaisseaux() {
  const j = etat.joueur;
  if (!j.actif || j.aspire) {
    return [];
  }
  return j.double ? [j.x - ECART_DOUBLE / 2, j.x + ECART_DOUBLE / 2] : [j.x];
}

function cadenceActuelle() {
  const m = etat.modele;
  return CADENCE * m.cadence * (1 - 0.08 * palier("cadence")) * (etat.actifs.rapide > 0 ? 0.5 : 1);
}

function vitesseJoueur() {
  return VITESSE_JOUEUR * etat.modele.vitesse * (1 + 0.08 * palier("moteur"));
}

function tirer() {
  const xs = positionsVaisseaux();
  if (!xs.length) {
    return;
  }
  // Chaque volee compte pour une, quel que soit le nombre de balles
  const enVol = new Set(etat.tirs.map(t => t.volee)).size;
  const limite = TIRS_MAX * xs.length * (etat.actifs.rapide > 0 ? 2 : 1);
  if (enVol >= limite) {
    return;
  }
  const volee = (etat.compteurVolee = (etat.compteurVolee || 0) + 1);
  const etale = etat.modele.tir === "etale";
  const eventail = etat.actifs.etale > 0;
  xs.forEach(x => {
    const balles = [];
    if (etat.modele.tir === "double") {
      balles.push([-5, 0], [5, 0]);
    } else {
      balles.push([0, 0]);
    }
    if (etale) {
      balles.push([0, -110], [0, 110]);
    }
    if (eventail) {
      balles.push([0, etale ? -220 : -150], [0, etale ? 220 : 150]);
    }
    balles.forEach(([dx, vx]) => etat.tirs.push({ x: x + dx, y: JOUEUR_Y - 22, vx, volee }));
  });
  etat.tirsTires += xs.length;
  jouer("tir");
}

// Bombe : chaque ennemi a l'ecran prend un coup, les balles disparaissent
function bombe() {
  if (!etat || etat.ecran !== "jeu" || etat.pause || etat.termine || etat.bombes <= 0 || !etat.joueur.actif) {
    return;
  }
  etat.bombes--;
  etat.flash = 0.35;
  etat.tirsEnnemis = [];
  jouer("grosseExplosion");
  etat.ennemis.slice().forEach(e => {
    if (e.etat !== "attente" && e.etat !== "mort" && e.y > -10) {
      toucherEnnemi(e);
    }
  });
}

// Un bonus tombe a l'endroit donne
function lacherBonus(x, y, type) {
  const types = Object.keys(BONUS);
  const t = type || types[Math.floor(Math.random() * types.length)];
  etat.objets.push({ type: t, x, y, t: 0 });
}

function prendreBonus(type) {
  const b = BONUS[type];
  const allonge = 1 + 0.25 * palier("duree");
  if (type === "bouclier") {
    etat.bouclier = true;
  } else if (type === "bombe") {
    etat.bombes = Math.min(6, etat.bombes + 1);
  } else {
    etat.actifs[type] = b.duree * allonge;
  }
  etat.textes.push({ t: b.nom, x: etat.joueur.x, y: JOUEUR_Y - 40, age: 0, couleur: b.couleur });
  jouer("pouvoir");
}

function points(n, x, y, couleur) {
  etat.score += n;
  if (n >= 150) {
    etat.textes.push({ t: n.toLocaleString("fr-BE"), x, y, age: 0, couleur: couleur || C.or });
  }
  while (etat.score >= etat.prochaineVie) {
    etat.vies++;
    jouer("vie");
    banniere("Vie en plus", "", 1.4);
    const i = VIE_PALIERS.indexOf(etat.prochaineVie);
    etat.prochaineVie = i >= 0 && i < VIE_PALIERS.length - 1 ? VIE_PALIERS[i + 1] : etat.prochaineVie + VIE_ECART;
  }
  majScoreCourant(ID, etat.score);
}

const COULEURS_ECLATS = {
  corbeau: ["#2b2e4a", "#f2c14a", "#55597e"],
  tengu: ["#2e6f73", "#d8392b", "#f3ead6"],
  chef: ["#6b4fb3", "#d8392b", "#f3ead6"]
};

function exploser(x, y, couleurs, nombre, force) {
  for (let i = 0; i < nombre; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = force * (0.3 + Math.random() * 0.9);
    etat.eclats.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vie: 0.4 + Math.random() * 0.5, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14, taille: 3 + Math.random() * 4, couleur: couleurs[i % couleurs.length] });
  }
  etat.anneaux.push({ x, y, age: 0, duree: 0.35, rayon: force * 0.16 });
}

function toucherEnnemi(e) {
  if (e.type === "chef" && e.vies > 1) {
    e.vies--;
    jouer("impact");
    points(0, e.x, e.y);
    return;
  }
  e.etat = "mort";
  etat.tirsTouches++;
  exploser(e.x, e.y, COULEURS_ECLATS[e.type], 14, 180);
  jouer("explosion");
  if (etat.bonus) {
    etat.touchesBonus++;
    points(100, e.x, e.y);
    return;
  }
  const enVol = e.etat === "plongee" || e.etat === "capture" || e.etat === "retour" || e.mode === "plongee";
  let valeur = POINTS[e.type][e.chemin && e.place && !["formation", "entree", "rejoint", "attente"].includes(e.etatAvant) ? "plongee" : "formation"];
  if (e.type === "chef" && e.escorte) {
    const tombees = e.escorte.filter(x => x.etat === "mort").length;
    valeur = 400 * Math.pow(2, tombees);
  }
  points(valeur, e.x, e.y - 14, valeur >= 400 ? C.or : C.creme);
  // Bonus : le chef en lache souvent, une escadrille entiere toujours
  const groupeFini = e.groupe !== undefined && !etat.ennemis.some(x => x !== e && x.groupe === e.groupe && x.etat !== "mort");
  if (groupeFini) {
    lacherBonus(e.x, e.y);
    etat.textes.push({ t: "Escadrille !", x: e.x, y: e.y - 30, age: 0, couleur: C.lime });
  } else if (e.type === "chef" ? Math.random() < 0.55 : Math.random() < 0.03) {
    lacherBonus(e.x, e.y);
  }
  // Le chef qui tenait le vaisseau captif : liberation s'il plongeait
  if (etat.captif && etat.captif.chef === e) {
    if (e.etatAvant === "plongee" || e.etatAvant === "capture" || e.etatAvant === "retour") {
      etat.libere = { x: e.x, y: e.y - 34, t: 0 };
      banniere("Vaisseau libéré", "Il rejoint le tien", 1.6);
      jouer("pouvoir");
    } else {
      exploser(e.x, e.y - 34, ["#f3ead6", "#d8392b"], 12, 160);
      points(1000, e.x, e.y - 50, C.rouge);
    }
    etat.captif = null;
  }
  // Le chef qui aspirait : le vaisseau aspire retombe libre
  if (etat.joueur.aspire && etat.joueur.aspire.chef === e) {
    etat.joueur.aspire = null;
  }
  void enVol;
}

function toucherJoueur(cote) {
  const j = etat.joueur;
  const xs = positionsVaisseaux();
  if (etat.bouclier) {
    // Le bouclier encaisse le coup a la place du vaisseau
    etat.bouclier = false;
    j.invincible = 1;
    exploser(xs[cote] !== undefined ? xs[cote] : j.x, JOUEUR_Y, ["#5a8fa8", "#cfe6f0"], 16, 160);
    jouer("impact");
    return;
  }
  const x = xs[cote] !== undefined ? xs[cote] : j.x;
  exploser(x, JOUEUR_Y, ["#f3ead6", "#d8392b", "#f2c14a", "#8a6a4a"], 26, 240);
  jouer("grosseExplosion");
  if (j.double) {
    // On perd un des deux vaisseaux, pas une vie
    j.double = false;
    j.x = xs[1 - cote] !== undefined ? xs[1 - cote] : j.x;
    j.invincible = 1;
    return;
  }
  j.actif = false;
  j.mort = 2.2;
  etat.vies--;
}

function terminer() {
  etat.termine = true;
  etat.finTimer = 0;
  // Les plumes gagnees servent au hangar
  etat.plumesGagnees = Math.floor(etat.score / 400) + etat.vague * 6;
  hangar.plumes += etat.plumesGagnees;
  stockageHangar.ecrire(hangar);
  if (etat.score > etat.record) {
    etat.record = etat.score;
    stockageRecord.ecrireTexte(String(etat.score));
  }
  jouer("mort");
  setTimeout(() => {
    if (etat && etat.termine && !zone.hidden) {
      finDePartie(ID, etat.score);
    }
  }, 2400);
}

// ---------------------------------------------------------------------
// Boucle
// ---------------------------------------------------------------------

function maj(dt) {
  if (etat === null) {
    return;
  }
  etat.defil += dt;
  if (etat.pause || etat.ecran !== "jeu") {
    return;
  }
  etat.flash = Math.max(0, etat.flash - dt);
  Object.keys(etat.actifs).forEach(k => {
    etat.actifs[k] = Math.max(0, etat.actifs[k] - dt);
  });
  etat.temps += dt;
  if (etat.banniere) {
    etat.banniere.age += dt;
    if (etat.banniere.age > etat.banniere.duree) {
      etat.banniere = null;
    }
  }
  const j = etat.joueur;

  // Deplacement : clavier ou doigt
  if (j.actif && !j.aspire && !etat.termine) {
    let dx = 0;
    if (doigtX !== null) {
      const ecart = doigtX - j.x;
      dx = Math.sign(ecart) * Math.min(Math.abs(ecart), vitesseJoueur() * 1.6 * dt);
    } else {
      dx = ((commandes.droite ? 1 : 0) - (commandes.gauche ? 1 : 0)) * vitesseJoueur() * dt;
    }
    const marge = j.double ? 22 + ECART_DOUBLE / 2 : 22;
    j.x = Math.max(marge, Math.min(W - marge, j.x + dx));
    etat.cadence -= dt;
    if ((commandes.tir || doigtX !== null) && etat.cadence <= 0) {
      etat.cadence = cadenceActuelle();
      tirer();
    }
  }
  if (j.invincible > 0) {
    j.invincible -= dt;
  }
  if (!j.actif && !etat.termine) {
    j.mort -= dt;
    if (j.mort <= 0) {
      if (etat.vies <= 0) {
        terminer();
      } else if (!etat.ennemis.some(e => e.etat === "plongee" || e.etat === "capture")) {
        j.actif = true;
        j.x = W / 2;
        j.invincible = 2;
      }
    }
  }
  majAspiration(dt);

  // Vaisseau libere qui descend rejoindre le joueur
  if (etat.libere) {
    const l = etat.libere;
    l.t += dt;
    const cible = j.actif ? j.x + ECART_DOUBLE / 2 : W / 2;
    l.x += (cible - l.x) * Math.min(1, dt * 2.5);
    l.y += (JOUEUR_Y - l.y) * Math.min(1, dt * 2.2);
    if (Math.abs(l.y - JOUEUR_Y) < 4 && j.actif) {
      etat.libere = null;
      j.double = true;
      j.x = Math.max(22 + ECART_DOUBLE / 2, Math.min(W - 22 - ECART_DOUBLE / 2, j.x));
      banniere("Double !", "Deux vaisseaux, deux fois plus de tirs", 1.6);
      jouer("vie");
    } else if (Math.abs(l.y - JOUEUR_Y) < 4 && !j.actif) {
      // Le joueur etait mort : le vaisseau libere devient le sien
      etat.libere = null;
      j.actif = true;
      j.x = l.x;
      j.invincible = 1.5;
    }
  }

  // On garde l'etat d'avant pour savoir si un ennemi plongeait quand on l'a touche
  etat.ennemis.forEach(e => {
    e.etatAvant = e.etat;
  });
  majEnnemis(dt);
  choisirPlongeurs(dt);

  // Tirs
  etat.tirs.forEach(t => {
    t.y -= 620 * dt;
    t.x += (t.vx || 0) * dt;
  });
  etat.tirs = etat.tirs.filter(t => t.y > -20 && t.x > -20 && t.x < W + 20);

  // Bonus qui tombent : on les ramasse en passant dessous
  const xsJ = positionsVaisseaux();
  etat.objets = etat.objets.filter(o => {
    o.t += dt;
    o.y += 115 * dt;
    o.x += Math.sin(o.t * 3) * 20 * dt;
    if (xsJ.some(x => Math.abs(o.x - x) < 24 && Math.abs(o.y - JOUEUR_Y) < 24)) {
      prendreBonus(o.type);
      return false;
    }
    return o.y < H + 20;
  });

  // Missiles a tete chercheuse
  if (etat.actifs.missile > 0 && xsJ.length) {
    etat.prochainMissile -= dt;
    if (etat.prochainMissile <= 0) {
      etat.prochainMissile = 0.85;
      xsJ.forEach(x => etat.missiles.push({ x, y: JOUEUR_Y - 10, angle: -Math.PI / 2, vie: 3 }));
      jouer("tir");
    }
  }
  etat.missiles = etat.missiles.filter(m => {
    m.vie -= dt;
    let cible = null;
    let meilleur = Infinity;
    etat.ennemis.forEach(e => {
      if (e.etat === "attente" || e.etat === "mort" || e.y < 0) {
        return;
      }
      const d = Math.hypot(e.x - m.x, e.y - m.y);
      if (d < meilleur) {
        meilleur = d;
        cible = e;
      }
    });
    if (cible) {
      const voulu = Math.atan2(cible.y - m.y, cible.x - m.x);
      let diff = voulu - m.angle;
      while (diff > Math.PI) {
        diff -= Math.PI * 2;
      }
      while (diff < -Math.PI) {
        diff += Math.PI * 2;
      }
      m.angle += Math.max(-5 * dt, Math.min(5 * dt, diff));
    }
    m.x += Math.cos(m.angle) * 400 * dt;
    m.y += Math.sin(m.angle) * 400 * dt;
    if (cible && Math.hypot(cible.x - m.x, cible.y - m.y) < 16) {
      toucherEnnemi(cible);
      return false;
    }
    return m.vie > 0 && m.y > -30 && m.y < H + 30 && m.x > -30 && m.x < W + 30;
  });
  etat.tirsEnnemis.forEach(t => {
    t.x += t.vx * dt;
    t.y += t.vy * dt;
  });
  etat.tirsEnnemis = etat.tirsEnnemis.filter(t => t.y < H + 20);

  collisions();

  // Effets
  etat.eclats = etat.eclats.filter(e => {
    e.vie -= dt;
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    e.vx *= 0.97;
    e.vy *= 0.97;
    e.rot += e.vr * dt;
    return e.vie > 0;
  });
  etat.anneaux = etat.anneaux.filter(a => (a.age += dt) < a.duree);
  etat.textes = etat.textes.filter(t => (t.age += dt) < 0.9);

  // Fin de vague
  if (!etat.termine && etat.ennemis.length === 0 && !etat.joueur.aspire) {
    etat.attente += dt;
    if (etat.bonus && etat.attente > 0.3 && etat.attente - dt <= 0.3) {
      const parfait = etat.touchesBonus === etat.totalBonus;
      const gain = parfait ? 10000 : etat.touchesBonus * 100;
      points(parfait ? 10000 : 0, W / 2, 330, C.lime);
      banniere(parfait ? "Parfait !" : etat.touchesBonus + " / " + etat.totalBonus, parfait ? "10 000 points" : gain.toLocaleString("fr-BE") + " points", 2.2);
      jouer(parfait ? "vie" : "bonus");
    }
    if (etat.attente > (etat.bonus ? 2.6 : 1.4)) {
      etat.attente = 0;
      lancerVague();
    }
  } else {
    etat.attente = 0;
  }
}

function collisions() {
  // Tirs du joueur sur les ennemis
  etat.tirs = etat.tirs.filter(t => {
    for (const e of etat.ennemis) {
      if (e.etat === "attente" || e.etat === "mort") {
        continue;
      }
      const r = e.type === "chef" ? 18 : 14;
      if (Math.abs(t.x - e.x) < r && Math.abs(t.y - e.y) < r) {
        toucherEnnemi(e);
        return false;
      }
    }
    // Tirer sur son propre vaisseau captif le detruit
    if (etat.captif) {
      const c = etat.captif.chef;
      if (Math.abs(t.x - c.x) < 12 && Math.abs(t.y - (c.y - 34)) < 12 && c.etat !== "formation") {
        exploser(c.x, c.y - 34, ["#f3ead6", "#d8392b"], 12, 160);
        etat.captif = null;
        jouer("explosion");
        return false;
      }
    }
    return true;
  });

  const j = etat.joueur;
  if (!j.actif || j.aspire || j.invincible > 0 || etat.termine) {
    return;
  }
  const xs = positionsVaisseaux();
  // Balles ennemies
  for (let i = etat.tirsEnnemis.length - 1; i >= 0; i--) {
    const t = etat.tirsEnnemis[i];
    const cote = xs.findIndex(x => Math.abs(t.x - x) < 12 && Math.abs(t.y - JOUEUR_Y) < 14);
    if (cote >= 0) {
      etat.tirsEnnemis.splice(i, 1);
      toucherJoueur(cote);
      return;
    }
  }
  // Collision avec un ennemi en vol
  for (const e of etat.ennemis) {
    if (e.etat !== "plongee" && e.etat !== "retour" && e.etat !== "passage") {
      continue;
    }
    const cote = xs.findIndex(x => Math.abs(e.x - x) < 22 && Math.abs(e.y - JOUEUR_Y) < 20);
    if (cote >= 0) {
      toucherEnnemi(e);
      if (e.etat === "mort") {
        toucherJoueur(cote);
      }
      return;
    }
  }
}

// ---------------------------------------------------------------------
// Dessin
// ---------------------------------------------------------------------

function preparerDecor() {
  const alea = hasard(1981);
  etoiles = Array.from({ length: 46 }, () => ({ x: alea() * W, y: alea() * H, t: alea() < 0.15 ? 2 : 1, v: 6 + alea() * 10, p: alea() * 6 }));
  nuages = Array.from({ length: 7 }, (_, i) => ({ x: alea() * W, y: alea() * H, l: 90 + alea() * 120, v: i < 4 ? 16 : 34, plan: i < 4 ? 0 : 1 }));
}

function dessinerFond() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#0c0e26");
  g.addColorStop(0.55, "#1d1640");
  g.addColorStop(1, "#3a1d46");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const t = etat ? etat.defil : 0;
  // Etoiles eparses qui glissent lentement
  etoiles.forEach(s => {
    const y = (s.y + t * s.v) % H;
    const scintille = 0.55 + 0.45 * Math.sin(t * 2 + s.p);
    ctx.fillStyle = "rgba(243,234,214," + (s.t > 1 ? scintille : 0.6) + ")";
    if (s.t > 1) {
      ctx.fillRect(s.x - 2, y - 0.5, 5, 1);
      ctx.fillRect(s.x - 0.5, y - 2, 1, 5);
    } else {
      ctx.fillRect(s.x, y, 1.4, 1.4);
    }
  });
  // Lune en croissant
  // Croissant decoupe pour de vrai : le ciel reste visible dans le creux
  ctx.save();
  ctx.beginPath();
  ctx.arc(392, 92, 30, 0, Math.PI * 2);
  ctx.clip();
  ctx.beginPath();
  ctx.rect(350, 50, 90, 90);
  ctx.arc(380, 84, 27, 0, Math.PI * 2);
  ctx.fillStyle = "#efe2bf";
  ctx.fill("evenodd");
  ctx.restore();
  // Fuji et collines au fond, immobiles
  ctx.fillStyle = "#251c47";
  ctx.beginPath();
  ctx.moveTo(0, H);
  ctx.lineTo(0, 610);
  ctx.lineTo(120, 560);
  ctx.lineTo(200, 500);
  ctx.lineTo(240, 488);
  ctx.lineTo(280, 500);
  ctx.lineTo(360, 560);
  ctx.lineTo(W, 600);
  ctx.lineTo(W, H);
  ctx.fill();
  ctx.fillStyle = "#4a3f74";
  ctx.beginPath();
  ctx.moveTo(206, 496);
  ctx.lineTo(240, 488);
  ctx.lineTo(274, 496);
  ctx.lineTo(262, 506);
  ctx.lineTo(250, 500);
  ctx.lineTo(240, 510);
  ctx.lineTo(228, 500);
  ctx.lineTo(218, 506);
  ctx.fill();
  ctx.fillStyle = "#1a1433";
  ctx.beginPath();
  ctx.moveTo(0, H);
  ctx.lineTo(0, 660);
  ctx.quadraticCurveTo(120, 620, 240, 668);
  ctx.quadraticCurveTo(360, 630, W, 650);
  ctx.lineTo(W, H);
  ctx.fill();
  // Pagode en silhouette
  ctx.fillStyle = "#120e26";
  const px = 70;
  for (let k = 0; k < 3; k++) {
    const y = 648 - k * 18;
    const l = 40 - k * 9;
    ctx.beginPath();
    ctx.moveTo(px - l, y);
    ctx.quadraticCurveTo(px, y - 12, px + l, y);
    ctx.lineTo(px + l - 6, y + 4);
    ctx.lineTo(px - l + 6, y + 4);
    ctx.fill();
    ctx.fillRect(px - l * 0.5, y + 4, l, 14);
  }
  ctx.fillRect(px - 1, 590, 2, 16);
  // Nuages en deux plans de parallaxe
  nuages.forEach(n => {
    const y = ((n.y + t * n.v) % (H + 120)) - 60;
    ctx.fillStyle = n.plan ? "rgba(74,63,116,0.55)" : "rgba(52,44,92,0.5)";
    ctx.beginPath();
    ctx.ellipse(n.x, y, n.l / 2, 9, 0, 0, Math.PI * 2);
    ctx.ellipse(n.x - n.l * 0.18, y - 6, n.l * 0.22, 8, 0, 0, Math.PI * 2);
    ctx.ellipse(n.x + n.l * 0.15, y - 4, n.l * 0.25, 7, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

// Corbeaux et tengu, dessines autour de (0, 0), tete vers le bas (+y)
function aile(cote, battement, couleur, sombre, envergure) {
  const ouverture = 0.35 + 0.65 * Math.abs(Math.cos(battement));
  ctx.save();
  ctx.scale(cote, 1);
  ctx.fillStyle = couleur;
  ctx.beginPath();
  ctx.moveTo(3, -4);
  ctx.quadraticCurveTo(envergure * 0.6, -12 * ouverture - 4, envergure, -4 * ouverture - 2);
  // bord de plumes en dents
  ctx.lineTo(envergure * 0.92, 4 * ouverture);
  ctx.lineTo(envergure * 0.78, 1 * ouverture);
  ctx.lineTo(envergure * 0.7, 8 * ouverture);
  ctx.lineTo(envergure * 0.56, 4 * ouverture);
  ctx.lineTo(envergure * 0.46, 10 * ouverture);
  ctx.lineTo(envergure * 0.3, 5);
  ctx.lineTo(3, 6);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = sombre;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.beginPath();
  ctx.moveTo(6, -2);
  ctx.quadraticCurveTo(envergure * 0.5, -9 * ouverture - 2, envergure * 0.9, -3 * ouverture - 1);
  ctx.stroke();
  ctx.restore();
}

function dessinerEnnemi(e) {
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.rotate(e.angle - Math.PI / 2);
  const b = e.battement;
  if (e.type === "corbeau") {
    aile(-1, b, "#2b2e4a", "#12142a", 18);
    aile(1, b, "#2b2e4a", "#12142a", 18);
    const g = ctx.createRadialGradient(-2, -3, 1, 0, 0, 10);
    g.addColorStop(0, "#5a5f88");
    g.addColorStop(1, "#16182e");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, 6.5, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 8, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.or;
    ctx.beginPath();
    ctx.moveTo(-2.5, 11);
    ctx.lineTo(2.5, 11);
    ctx.lineTo(0, 17);
    ctx.fill();
    ctx.fillStyle = "#ff5a48";
    ctx.fillRect(-3.5, 6.5, 2, 2);
    ctx.fillRect(1.5, 6.5, 2, 2);
  } else if (e.type === "tengu") {
    aile(-1, b, "#2e6f73", "#123b3e", 19);
    aile(1, b, "#2e6f73", "#123b3e", 19);
    // Robe vermillon
    const g = ctx.createLinearGradient(-7, 0, 7, 0);
    g.addColorStop(0, "#8e2219");
    g.addColorStop(0.5, "#e8503d");
    g.addColorStop(1, "#8e2219");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-7, -9);
    ctx.lineTo(7, -9);
    ctx.lineTo(5, 6);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    // Tete : visage rouge, bec dore, tokin blanc
    ctx.fillStyle = "#c8372d";
    ctx.beginPath();
    ctx.arc(0, 9, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.or;
    ctx.beginPath();
    ctx.moveTo(-2.5, 12);
    ctx.lineTo(2.5, 12);
    ctx.lineTo(0, 18);
    ctx.fill();
    ctx.fillStyle = C.creme;
    ctx.fillRect(-2.5, 3, 5, 3);
    ctx.fillStyle = C.encre;
    ctx.fillRect(-3.5, 8, 2, 2);
    ctx.fillRect(1.5, 8, 2, 2);
  } else {
    const blesse = e.vies < 2;
    const couleur = blesse ? "#3f6fb0" : "#6b4fb3";
    const sombre = blesse ? "#1c3558" : "#2e1f58";
    ctx.scale(1.3, 1.3);
    aile(-1, b * 0.8, couleur, sombre, 19);
    aile(1, b * 0.8, couleur, sombre, 19);
    const g = ctx.createLinearGradient(-8, 0, 8, 0);
    g.addColorStop(0, sombre);
    g.addColorStop(0.5, couleur);
    g.addColorStop(1, sombre);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-8, -10);
    ctx.lineTo(8, -10);
    ctx.lineTo(6, 6);
    ctx.lineTo(-6, 6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = C.or;
    ctx.fillRect(-8, -3, 16, 2.5);
    // Visage du dai-tengu : rouge, long nez, barbe blanche
    ctx.fillStyle = "#d8392b";
    ctx.beginPath();
    ctx.arc(0, 9, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#b72b20";
    ctx.beginPath();
    ctx.moveTo(-1.6, 9);
    ctx.lineTo(1.6, 9);
    ctx.lineTo(0, 19);
    ctx.fill();
    ctx.fillStyle = C.creme;
    ctx.beginPath();
    ctx.moveTo(-5, 12);
    ctx.quadraticCurveTo(0, 17, 5, 12);
    ctx.lineTo(3, 15);
    ctx.lineTo(-3, 15);
    ctx.fill();
    ctx.fillStyle = C.encre;
    ctx.fillRect(-4, 6.5, 2.4, 2);
    ctx.fillRect(1.6, 6.5, 2.4, 2);
    ctx.fillStyle = C.creme;
    ctx.fillRect(-3, 2, 6, 3);
  }
  ctx.restore();
}

function flamme(captif, decalages) {
  if (captif) {
    return;
  }
  const f = 7 + Math.sin(performance.now() / 40) * 2.5;
  (decalages || [0]).forEach(dx => {
    ctx.fillStyle = "#f2c14a";
    ctx.beginPath();
    ctx.moveTo(dx - 5, 14);
    ctx.lineTo(dx + 5, 14);
    ctx.lineTo(dx, 14 + f + 4);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(dx - 2.5, 14);
    ctx.lineTo(dx + 2.5, 14);
    ctx.lineTo(dx, 14 + f * 0.6);
    ctx.fill();
  });
}

function cockpit(y) {
  ctx.fillStyle = "#1c2a40";
  ctx.beginPath();
  ctx.ellipse(0, y, 4.8, 6.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#8a6a4a";
  ctx.beginPath();
  ctx.arc(0, y + 1, 3.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#3a2a1e";
  ctx.fillRect(-3, y, 6, 2);
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.fillRect(-3, y - 5, 1.6, 3);
}

function fuselage(clair, sombre, haut, largeur, bas) {
  const g = ctx.createLinearGradient(-largeur, 0, largeur, 0);
  g.addColorStop(0, sombre);
  g.addColorStop(0.45, clair);
  g.addColorStop(1, sombre);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, haut);
  ctx.quadraticCurveTo(largeur, haut + 10, largeur, 4);
  ctx.lineTo(largeur - 2, bas);
  ctx.lineTo(-largeur + 2, bas);
  ctx.lineTo(-largeur, 4);
  ctx.quadraticCurveTo(-largeur, haut + 10, 0, haut);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

// Les trois vaisseaux a debloquer, chacun sa silhouette
function dessinerVariante(id, captif) {
  const pale = captif ? 0.55 : 1;
  ctx.globalAlpha *= pale;
  if (id === "hayabusa") {
    // Faucon : ailes en fleche tres reculees, nez long, derives
    flamme(captif);
    ctx.fillStyle = "#2e8fa0";
    ctx.beginPath();
    ctx.moveTo(-3, -6);
    ctx.lineTo(-24, 14);
    ctx.lineTo(-17, 16);
    ctx.lineTo(-4, 8);
    ctx.closePath();
    ctx.moveTo(3, -6);
    ctx.lineTo(24, 14);
    ctx.lineTo(17, 16);
    ctx.lineTo(4, 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#1a5560";
    ctx.fillRect(-24, 12, 7, 3);
    ctx.fillRect(17, 12, 7, 3);
    fuselage(C.creme, "#9c917a", -27, 6, 15);
    ctx.fillStyle = "#2e8fa0";
    ctx.beginPath();
    ctx.moveTo(-6, 8);
    ctx.lineTo(-10, 18);
    ctx.lineTo(-5, 15);
    ctx.moveTo(6, 8);
    ctx.lineTo(10, 18);
    ctx.lineTo(5, 15);
    ctx.fill();
    cockpit(-9);
  } else if (id === "kabuto") {
    // Scarabee : carapace large et ronde, deux canons sur les flancs
    flamme(captif, [-6, 6]);
    ctx.fillStyle = "#2a2a22";
    ctx.fillRect(-15, -12, 4, 14);
    ctx.fillRect(11, -12, 4, 14);
    const g = ctx.createRadialGradient(-5, -6, 2, 0, 0, 20);
    g.addColorStop(0, "#7fa84a");
    g.addColorStop(0.6, "#3e6b2f");
    g.addColorStop(1, "#1f3818");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 2, 17, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#1a2a12";
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.strokeStyle = C.or;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(0, 16);
    ctx.stroke();
    // Corne du kabuto
    ctx.fillStyle = C.or;
    ctx.beginPath();
    ctx.moveTo(-3, -11);
    ctx.lineTo(0, -24);
    ctx.lineTo(3, -11);
    ctx.fill();
    cockpit(-4);
  } else if (id === "ryu") {
    // Dragon : ailes dentelees, cornes dorees, corps violet
    flamme(captif);
    ctx.fillStyle = "#6b4fb3";
    ctx.beginPath();
    ctx.moveTo(-4, -4);
    ctx.lineTo(-23, 2);
    ctx.lineTo(-18, 7);
    ctx.lineTo(-24, 11);
    ctx.lineTo(-17, 14);
    ctx.lineTo(-20, 18);
    ctx.lineTo(-4, 12);
    ctx.closePath();
    ctx.moveTo(4, -4);
    ctx.lineTo(23, 2);
    ctx.lineTo(18, 7);
    ctx.lineTo(24, 11);
    ctx.lineTo(17, 14);
    ctx.lineTo(20, 18);
    ctx.lineTo(4, 12);
    ctx.closePath();
    ctx.fill();
    fuselage("#c9b4f0", "#4a3480", -22, 8, 15);
    ctx.fillStyle = C.or;
    ctx.beginPath();
    ctx.moveTo(-5, -14);
    ctx.lineTo(-10, -24);
    ctx.lineTo(-3, -17);
    ctx.moveTo(5, -14);
    ctx.lineTo(10, -24);
    ctx.lineTo(3, -17);
    ctx.fill();
    ctx.fillStyle = C.or;
    ctx.fillRect(-7, 6, 14, 3);
    cockpit(-5);
  }
  ctx.globalAlpha /= pale;
}

function dessinerVaisseau(x, y, captif, angle, modele) {
  ctx.save();
  ctx.translate(x, y);
  if (angle) {
    ctx.rotate(angle);
  }
  const m = modele || (etat && etat.modele) || VAISSEAUX[0];
  if (m.id !== "kami") {
    dessinerVariante(m.id, captif);
    ctx.restore();
    return;
  }
  const corps = captif ? "#e8a9a0" : C.creme;
  const accent = captif ? "#9e2a1e" : C.rouge;
  // Flamme du reacteur, qui vacille
  if (!captif) {
    const f = 7 + Math.sin(performance.now() / 40) * 2.5;
    ctx.fillStyle = "#f2c14a";
    ctx.beginPath();
    ctx.moveTo(-5, 14);
    ctx.lineTo(5, 14);
    ctx.lineTo(0, 14 + f + 4);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(-2.5, 14);
    ctx.lineTo(2.5, 14);
    ctx.lineTo(0, 14 + f * 0.6);
    ctx.fill();
  }
  // Ailes en laque rouge
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(-4, -2);
  ctx.lineTo(-20, 10);
  ctx.lineTo(-20, 15);
  ctx.lineTo(-4, 10);
  ctx.closePath();
  ctx.moveTo(4, -2);
  ctx.lineTo(20, 10);
  ctx.lineTo(20, 15);
  ctx.lineTo(4, 10);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = corps;
  ctx.fillRect(-21, 6, 3, 10);
  ctx.fillRect(18, 6, 3, 10);
  // Fuselage creme avec volume
  const g = ctx.createLinearGradient(-8, 0, 8, 0);
  g.addColorStop(0, captif ? "#b77d74" : "#b9ad93");
  g.addColorStop(0.45, corps);
  g.addColorStop(1, captif ? "#a06058" : "#9c917a");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, -22);
  ctx.quadraticCurveTo(8, -12, 8, 4);
  ctx.lineTo(6, 15);
  ctx.lineTo(-6, 15);
  ctx.lineTo(-8, 4);
  ctx.quadraticCurveTo(-8, -12, 0, -22);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.fillRect(-7, 6, 14, 3);
  // Cockpit avec le tanuki
  ctx.fillStyle = "#1c2a40";
  ctx.beginPath();
  ctx.ellipse(0, -6, 4.8, 6.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#8a6a4a";
  ctx.beginPath();
  ctx.arc(0, -5, 3.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#3a2a1e";
  ctx.fillRect(-3, -6, 6, 2);
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.fillRect(-3, -11, 1.6, 3);
  ctx.restore();
}

function dessinerRayon(chef) {
  const c = chef.capture;
  if (!c || c.phase !== "rayon" || c.longueur <= 0) {
    return;
  }
  const haut = chef.y + 16;
  const bas = haut + c.longueur;
  const demi = largeurRayon(chef) / 2;
  // Bandes horizontales qui descendent : on voit le rayon tirer vers le haut
  const nb = 10;
  for (let i = 0; i < nb; i++) {
    const k = ((i / nb) + etat.temps * 0.9) % 1;
    const y = haut + k * c.longueur;
    const l = 8 + (demi - 8) * k;
    ctx.fillStyle = i % 2 ? "rgba(140,190,255,0.5)" : "rgba(200,170,255,0.45)";
    ctx.fillRect(chef.x - l, y, l * 2, c.longueur / nb * 0.6);
  }
  ctx.strokeStyle = "rgba(200,220,255,0.7)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(chef.x - 8, haut);
  ctx.lineTo(chef.x - demi, bas);
  ctx.moveTo(chef.x + 8, haut);
  ctx.lineTo(chef.x + demi, bas);
  ctx.stroke();
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

function petiteMono(t, x, y, couleur, alignement) {
  ctx.font = "600 9px 'Martian Mono', monospace";
  ctx.textAlign = alignement || "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = couleur;
  ctx.fillText(t, x, y);
}

function dessinerHud() {
  petiteMono("SCORE", 16, 18, "#9a92c8");
  texteContour(etat.score.toLocaleString("fr-BE"), 16, 42, 26, "#ffffff", "left");
  petiteMono("RECORD", W / 2, 18, "#9a92c8", "center");
  texteContour(Math.max(etat.record, etat.score).toLocaleString("fr-BE"), W / 2, 40, 18, C.or);
  petiteMono(etat.bonus ? "BONUS" : "VAGUE", W - 16, 18, "#9a92c8", "right");
  texteContour(String(etat.vague), W - 16, 42, 26, C.lime, "right");
  // Vies restantes en bas a gauche
  for (let i = 0; i < Math.min(6, etat.vies - (etat.joueur.actif ? 1 : 0)); i++) {
    ctx.save();
    ctx.translate(24 + i * 24, H - 20);
    ctx.scale(0.55, 0.55);
    dessinerVaisseau(0, 0, false);
    ctx.restore();
  }
  // Bombes en reserve, au-dessus des vies
  for (let i = 0; i < etat.bombes; i++) {
    const bx = 20 + i * 16;
    ctx.fillStyle = "#2a2a33";
    ctx.beginPath();
    ctx.arc(bx, H - 46, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.creme;
    ctx.fillRect(bx - 1, H - 55, 2, 4);
    ctx.fillStyle = "#e0574b";
    ctx.fillRect(bx - 1, H - 57, 2, 2);
  }
  if (etat.bombes > 0) {
    petiteMono("B : BOMBE", 20 + etat.bombes * 16 + 4, H - 44, "#9a92c8");
  }
  // Bonus actifs et leur temps restant, en bas au centre
  const actifs = Object.keys(etat.actifs).filter(k => etat.actifs[k] > 0);
  actifs.forEach((k, i) => {
    const bx = W / 2 - (actifs.length - 1) * 22 + i * 44;
    dessinerCharme(bx, H - 26, k, 0, 0.75);
    const reste = etat.actifs[k] / (BONUS[k].duree * (1 + 0.25 * palier("duree")));
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(bx - 14, H - 8, 28, 3);
    ctx.fillStyle = BONUS[k].couleur;
    ctx.fillRect(bx - 14, H - 8, 28 * reste, 3);
  });
  // Lanternes de vague en bas a droite : une grande toutes les 5 vagues
  let reste = etat.vague;
  let x = W - 16;
  const grandes = Math.floor(reste / 5);
  reste -= grandes * 5;
  for (let i = 0; i < Math.min(grandes, 8); i++) {
    lanterne(x, H - 20, 7);
    x -= 16;
  }
  for (let i = 0; i < reste; i++) {
    lanterne(x, H - 18, 4.5);
    x -= 11;
  }
}

function dessinerCharme(x, y, type, angle, taille) {
  const b = BONUS[type];
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle || 0);
  ctx.scale(taille, taille);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.roundRect(-9, -10, 20, 25, 5);
  ctx.fill();
  ctx.fillStyle = b.couleur;
  ctx.beginPath();
  ctx.roundRect(-10, -12, 20, 25, 5);
  ctx.fill();
  ctx.strokeStyle = b.sombre;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = b.sombre;
  ctx.fillRect(-10, -4, 20, 3);
  ctx.strokeStyle = C.or;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, -14, 3.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.font = "800 11px 'Anybody', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = type === "bombe" ? "#2a2a33" : C.encre;
  ctx.fillText(b.lettre, 0, 6);
  ctx.restore();
}

// ---------------------------------------------------------------------
// Hangar : choix du vaisseau et ameliorations, avant chaque partie
// ---------------------------------------------------------------------

const LIGNES_HANGAR = ["vaisseau", "cadence", "moteur", "bombes", "duree", "decoller"];
let selHangar = { ligne: 5, vaisseau: 0 };
let zonesHangar = [];

function ouvrirHangar() {
  hangar = lireHangar();
  etat.ecran = "hangar";
  selHangar = { ligne: 5, vaisseau: Math.max(0, VAISSEAUX.findIndex(v => v.id === hangar.choisi)) };
}

function decoller() {
  const v = VAISSEAUX[selHangar.vaisseau];
  if (hangar.vaisseaux.includes(v.id)) {
    hangar.choisi = v.id;
    stockageHangar.ecrire(hangar);
  }
  const record = etat.record;
  etat = nouvelEtat();
  etat.record = record;
  etat.ecran = "jeu";
  lancerVague();
  jouer("pouvoir");
}

function actionHangar(ligne) {
  if (ligne === "decoller") {
    decoller();
    return;
  }
  if (ligne === "vaisseau") {
    const v = VAISSEAUX[selHangar.vaisseau];
    if (hangar.vaisseaux.includes(v.id)) {
      hangar.choisi = v.id;
      jouer("clic");
    } else if (hangar.plumes >= v.prix) {
      hangar.plumes -= v.prix;
      hangar.vaisseaux.push(v.id);
      hangar.choisi = v.id;
      jouer("vie");
    } else {
      jouer("impact");
    }
    stockageHangar.ecrire(hangar);
    return;
  }
  const n = palier(ligne);
  if (n >= PRIX_PALIERS.length) {
    return;
  }
  if (hangar.plumes >= PRIX_PALIERS[n]) {
    hangar.plumes -= PRIX_PALIERS[n];
    hangar.ameliorations[ligne] = n + 1;
    stockageHangar.ecrire(hangar);
    jouer("bonus");
  } else {
    jouer("impact");
  }
}

function plume(x, y, r) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.6);
  ctx.fillStyle = C.creme;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.38, r, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#8a7a5a";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.lineTo(0, r * 1.3);
  ctx.stroke();
  ctx.restore();
}

function bouton(x, y, w, h, texte, actif, couleur, ligne) {
  ctx.fillStyle = actif ? (couleur || C.lime) : "rgba(255,255,255,0.08)";
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();
  ctx.strokeStyle = actif ? "rgba(0,0,0,0.3)" : "rgba(255,255,255,0.18)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.font = "800 13px 'Anybody', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = actif ? C.encre : "#8a84b0";
  ctx.fillText(texte, x + w / 2, y + h / 2 + 1);
  if (ligne) {
    zonesHangar.push({ x, y, w, h, ligne });
  }
}

function dessinerHangar() {
  zonesHangar = [];
  ctx.fillStyle = "rgba(11,11,22,0.72)";
  ctx.fillRect(0, 0, W, H);
  texteContour("HANGAR", 24, 44, 34, "#ffffff", "left");
  petiteMono("Les plumes gagnées en jouant paient vaisseaux et améliorations", 24, 70, "#9a92c8");
  texteContour(String(hangar.plumes), W - 24, 44, 24, C.or, "right");
  ctx.font = "800 24px 'Anybody', sans-serif";
  plume(W - 40 - ctx.measureText(String(hangar.plumes)).width, 40, 11);

  // Vaisseau en vitrine
  const v = VAISSEAUX[selHangar.vaisseau];
  const possede = hangar.vaisseaux.includes(v.id);
  const sur = selHangar.ligne === 0;
  ctx.fillStyle = sur ? "rgba(198,243,90,0.10)" : "rgba(255,255,255,0.05)";
  ctx.beginPath();
  ctx.roundRect(20, 90, W - 40, 236, 14);
  ctx.fill();
  ctx.strokeStyle = sur ? C.lime : "rgba(255,255,255,0.15)";
  ctx.lineWidth = sur ? 2 : 1;
  ctx.stroke();
  zonesHangar.push({ x: 70, y: 96, w: W - 140, h: 170, ligne: "vaisseau" });
  // Fleches pour changer de vaisseau
  [["‹", 44, -1], ["›", W - 44, 1]].forEach(([t, x, d]) => {
    texteContour(t, x, 176, 42, "#ffffff");
    zonesHangar.push({ x: x - 26, y: 136, w: 52, h: 80, fleche: d });
  });
  ctx.save();
  ctx.translate(W / 2, 168);
  ctx.scale(2.6, 2.6);
  ctx.globalAlpha = possede ? 1 : 0.45;
  dessinerVaisseau(0, 0, false, 0, v);
  ctx.restore();
  ctx.globalAlpha = 1;
  texteContour(v.nom.toUpperCase(), W / 2, 230, 22, possede ? "#ffffff" : "#b8b2d8");
  petiteMono(v.sous.toUpperCase(), W / 2, 250, C.or, "center");
  petiteMono(v.texte, W / 2, 266, "#d9d2f0", "center");
  // Stats du vaisseau
  const stats = [["Vitesse", v.vitesse / 1.35], ["Cadence", 0.88 / v.cadence], ["Tir", v.tir === "simple" ? 0.35 : v.tir === "double" ? 0.65 : 1]];
  stats.forEach(([nom, val], i) => {
    const sx = 52 + i * 136;
    petiteMono(nom.toUpperCase(), sx, 284, "#9a92c8");
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    ctx.fillRect(sx, 291, 110, 5);
    ctx.fillStyle = C.lime;
    ctx.fillRect(sx, 291, 110 * Math.min(1, val), 5);
  });
  const etiquette = possede ? (hangar.choisi === v.id ? "Choisi" : "Choisir") : "Débloquer · " + v.prix;
  ctx.font = "700 11px 'Martian Mono', monospace";
  ctx.textAlign = "center";
  ctx.fillStyle = possede ? (hangar.choisi === v.id ? C.lime : C.creme) : (hangar.plumes >= v.prix ? C.or : "#8a84b0");
  ctx.fillText(etiquette.toUpperCase(), W / 2, 315);

  // Ameliorations
  AMELIORATIONS.forEach((a, i) => {
    const y = 344 + i * 66;
    const ligne = i + 1;
    const sur2 = selHangar.ligne === ligne;
    ctx.fillStyle = sur2 ? "rgba(198,243,90,0.10)" : "rgba(255,255,255,0.05)";
    ctx.beginPath();
    ctx.roundRect(20, y, W - 40, 56, 12);
    ctx.fill();
    ctx.strokeStyle = sur2 ? C.lime : "rgba(255,255,255,0.12)";
    ctx.lineWidth = sur2 ? 2 : 1;
    ctx.stroke();
    texteContour(a.nom, 36, y + 22, 16, "#ffffff", "left");
    petiteMono(a.effet, 36, y + 42, "#9a92c8");
    const n = palier(a.id);
    for (let k = 0; k < PRIX_PALIERS.length; k++) {
      ctx.fillStyle = k < n ? C.lime : "rgba(255,255,255,0.14)";
      ctx.fillRect(W - 218 + k * 18, y + 22, 13, 13);
    }
    const max = n >= PRIX_PALIERS.length;
    const prix = max ? "MAX" : String(PRIX_PALIERS[n]);
    bouton(W - 150, y + 12, 110, 32, max ? "MAX" : "+ " + prix, !max && hangar.plumes >= PRIX_PALIERS[n], C.or, a.id);
  });

  // Decoller
  bouton(60, 616, W - 120, 52, "DÉCOLLER", true, selHangar.ligne === 5 ? C.lime : "#9fc43f", "decoller");
  petiteMono("Flèches pour choisir · Espace pour valider · Start pour décoller", W / 2, 690, "#8a84b0", "center");
}

function lanterne(x, y, r) {
  ctx.fillStyle = C.rouge;
  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.75, r, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.encre;
  ctx.fillRect(x - r * 0.5, y - r - 1, r, 2);
  ctx.fillRect(x - r * 0.5, y + r - 1, r, 2);
}

function dessiner() {
  ctx.setTransform(echelle, 0, 0, echelle, 0, 0);
  dessinerFond();
  if (etat === null) {
    return;
  }
  // Rayons de capture sous les ennemis
  etat.ennemis.forEach(e => {
    if (e.etat === "capture") {
      dessinerRayon(e);
    }
  });
  // Vaisseau captif au-dessus de son chef
  if (etat.captif) {
    const c = etat.captif.chef;
    dessinerVaisseau(c.x, c.y - 34, true, c.etat === "formation" ? 0 : c.angle - Math.PI / 2);
  }
  etat.ennemis.forEach(e => {
    if (e.etat !== "attente") {
      dessinerEnnemi(e);
    }
  });
  // Tirs ennemis : petits losanges rouges cernes de sombre
  etat.tirsEnnemis.forEach(t => {
    ctx.fillStyle = "#3a0d0a";
    ctx.beginPath();
    ctx.moveTo(t.x, t.y - 7);
    ctx.lineTo(t.x + 4, t.y);
    ctx.lineTo(t.x, t.y + 7);
    ctx.lineTo(t.x - 4, t.y);
    ctx.fill();
    ctx.fillStyle = "#ff6a52";
    ctx.beginPath();
    ctx.moveTo(t.x, t.y - 5);
    ctx.lineTo(t.x + 2.5, t.y);
    ctx.lineTo(t.x, t.y + 5);
    ctx.lineTo(t.x - 2.5, t.y);
    ctx.fill();
  });
  // Tirs du joueur : traits creme a coeur blanc
  etat.tirs.forEach(t => {
    ctx.fillStyle = C.lime;
    ctx.fillRect(t.x - 1.5, t.y - 7, 3, 14);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(t.x - 0.5, t.y - 6, 1, 8);
  });
  // Missiles : petite fusee rouge et sa fumee
  etat.missiles.forEach(m => {
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(m.angle + Math.PI / 2);
    ctx.fillStyle = "rgba(243,234,214,0.35)";
    ctx.fillRect(-1.5, 6, 3, 10);
    ctx.fillStyle = "#e0574b";
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(3, -2);
    ctx.lineTo(3, 6);
    ctx.lineTo(-3, 6);
    ctx.lineTo(-3, -2);
    ctx.fill();
    ctx.fillStyle = C.creme;
    ctx.fillRect(-3, 3, 6, 2);
    ctx.restore();
  });
  // Bonus qui tombent : des omamori de couleur, une lettre brodee
  etat.objets.forEach(o => dessinerCharme(o.x, o.y, o.type, Math.sin(o.t * 4) * 0.15, 1));
  // Joueur
  const j = etat.joueur;
  if (j.aspire) {
    dessinerVaisseau(j.aspire.x, j.aspire.y, false, j.aspire.t * 9);
  } else if (j.actif) {
    const visible = j.invincible <= 0 || Math.floor(j.invincible * 10) % 2 === 0;
    if (visible) {
      positionsVaisseaux().forEach(x => {
        dessinerVaisseau(x, JOUEUR_Y, false);
        if (etat.bouclier) {
          // Bouclier : un anneau plein qui respire, pas de halo
          const r = 26 + Math.sin(etat.temps * 5) * 1.5;
          ctx.strokeStyle = "#5a8fa8";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(x, JOUEUR_Y - 2, r, 0, Math.PI * 2);
          ctx.stroke();
          ctx.strokeStyle = "#cfe6f0";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(x, JOUEUR_Y - 2, r - 3, -2.4, -0.8);
          ctx.stroke();
        }
      });
    }
  }
  if (etat.libere) {
    dessinerVaisseau(etat.libere.x, etat.libere.y, false, etat.libere.t < 0.8 ? etat.libere.t * 8 : 0);
  }
  // Explosions
  etat.anneaux.forEach(a => {
    const k = a.age / a.duree;
    ctx.strokeStyle = "rgba(255,240,200," + (1 - k) + ")";
    ctx.lineWidth = 4 * (1 - k) + 1;
    ctx.beginPath();
    ctx.arc(a.x, a.y, a.rayon * (0.3 + k), 0, Math.PI * 2);
    ctx.stroke();
  });
  etat.eclats.forEach(e => {
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.rot);
    ctx.globalAlpha = Math.min(1, e.vie * 3);
    ctx.fillStyle = e.couleur;
    ctx.beginPath();
    ctx.moveTo(0, -e.taille);
    ctx.lineTo(e.taille * 0.8, e.taille * 0.6);
    ctx.lineTo(-e.taille * 0.8, e.taille * 0.6);
    ctx.fill();
    ctx.restore();
  });
  ctx.globalAlpha = 1;
  etat.textes.forEach(t => {
    ctx.globalAlpha = t.age > 0.6 ? (0.9 - t.age) / 0.3 : 1;
    texteContour(t.t, t.x, t.y - t.age * 24, 15, t.couleur);
  });
  ctx.globalAlpha = 1;
  if (etat.flash > 0) {
    ctx.fillStyle = "rgba(255,248,230," + (etat.flash / 0.35) * 0.7 + ")";
    ctx.fillRect(0, 0, W, H);
  }
  if (etat.ecran === "hangar") {
    dessinerHangar();
    return;
  }
  dessinerHud();

  const ban = etat.banniere;
  if (ban) {
    const k = ban.age / ban.duree;
    const s = k < 0.1 ? 0.6 + k * 4 : 1;
    ctx.save();
    ctx.globalAlpha = k > 0.8 ? (1 - k) / 0.2 : 1;
    ctx.translate(W / 2, 330);
    ctx.scale(s, s);
    texteContour(ban.titre.toUpperCase(), 0, 0, 38, "#ffffff");
    if (ban.sous) {
      ctx.font = "600 11px 'Martian Mono', monospace";
      ctx.textAlign = "center";
      ctx.lineWidth = 4;
      ctx.strokeStyle = C.encre;
      ctx.strokeText(ban.sous, 0, 32);
      ctx.fillStyle = C.or;
      ctx.fillText(ban.sous, 0, 32);
    }
    ctx.restore();
  }
  if (etat.pause) {
    ctx.fillStyle = "rgba(11,11,16,0.55)";
    ctx.fillRect(0, 0, W, H);
    texteContour("PAUSE", W / 2, H / 2, 44, "#ffffff");
  }
  if (etat.termine) {
    ctx.fillStyle = "rgba(11,11,16,0.6)";
    ctx.fillRect(0, 250, W, 180);
    texteContour("FIN DE PARTIE", W / 2, 300, 40, "#ffffff");
    texteContour(etat.score.toLocaleString("fr-BE"), W / 2, 352, 30, C.lime);
    const precision = etat.tirsTires ? Math.round(etat.tirsTouches / etat.tirsTires * 100) : 0;
    petiteMono("Vague " + etat.vague + "   Précision " + precision + " %", W / 2, 392, "#d9d2f0", "center");
    petiteMono("+" + etat.plumesGagnees + " plumes pour le hangar", W / 2, 414, C.or, "center");
  }
}

// ---------------------------------------------------------------------
// Taille et boucle
// ---------------------------------------------------------------------

function ajuster() {
  const marge = window.innerWidth >= 1100 ? 500 : 0;
  const largeur = Math.min(window.innerWidth * 0.96 - marge, 560);
  const entete = zone.querySelector(".entete-karasu").getBoundingClientRect().height || 40;
  const pad = document.querySelector(".manette:not([hidden])");
  const manette = pad ? pad.getBoundingClientRect().height : 0;
  const aide = window.matchMedia("(pointer: coarse)").matches ? 0 : 50;
  const hauteur = Math.max(300, window.innerHeight - entete - manette - 34 - aide);
  const taille = Math.min(largeur / W, hauteur / H);
  canvas.style.width = Math.floor(W * taille) + "px";
  canvas.style.height = Math.floor(H * taille) + "px";
  zone.querySelector(".entete-karasu").style.width = Math.max(Math.floor(W * taille), Math.min(window.innerWidth * 0.94, 300)) + "px";
  echelle = Math.min(3, Math.max(1, taille * (window.devicePixelRatio || 1)));
  canvas.width = Math.round(W * echelle);
  canvas.height = Math.round(H * echelle);
}

window.addEventListener("resize", function () {
  if (!zone.hidden) {
    ajuster();
  }
});

let compteurAjustement = 0;
const boucle = creerBoucle(function (dt) {
  // La manette peut apparaitre juste apres le demarrage : on remesure un peu
  if (compteurAjustement > 0) {
    compteurAjustement--;
    if (compteurAjustement % 10 === 0) {
      ajuster();
    }
  }
  maj(dt);
  dessiner();
}, { plafond: 1 / 30 });

function majBoutonSon() {
  boutonSon.textContent = sonActif() ? "Son" : "Muet";
}

function demarrer() {
  if (!etoiles.length) {
    preparerDecor();
  }
  etat = nouvelEtat();
  commandes.gauche = commandes.droite = commandes.tir = false;
  doigtX = null;
  ajuster();
  compteurAjustement = 40;
  ouvrirHangar();
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

surTouche(ID, function (evenement) {
  const touche = evenement.key.toLowerCase();
  if (etat && etat.ecran === "hangar") {
    if (touche === "arrowleft" || touche === "q" || touche === "a") {
      selHangar.ligne = 0;
      selHangar.vaisseau = (selHangar.vaisseau + VAISSEAUX.length - 1) % VAISSEAUX.length;
      jouer("clic");
    } else if (touche === "arrowright" || touche === "d") {
      selHangar.ligne = 0;
      selHangar.vaisseau = (selHangar.vaisseau + 1) % VAISSEAUX.length;
      jouer("clic");
    } else if (touche === "arrowup" || touche === "z" || touche === "w") {
      selHangar.ligne = (selHangar.ligne + LIGNES_HANGAR.length - 1) % LIGNES_HANGAR.length;
    } else if (touche === "arrowdown" || touche === "s") {
      selHangar.ligne = (selHangar.ligne + 1) % LIGNES_HANGAR.length;
    } else if (touche === " " || touche === "enter" || touche === "x") {
      if (!evenement.repeat) {
        actionHangar(LIGNES_HANGAR[selHangar.ligne]);
      }
    } else if (touche === "p") {
      decoller();
    } else if (touche === "m") {
      basculerSon();
      majBoutonSon();
    } else if (touche === "escape") {
      quitterJeu();
      return;
    } else {
      return;
    }
    evenement.preventDefault();
    return;
  }
  if (touche === "b" || touche === "c") {
    if (!evenement.repeat) {
      bombe();
    }
    evenement.preventDefault();
    return;
  }
  if (touche === "arrowleft" || touche === "q" || touche === "a") {
    commandes.gauche = true;
  } else if (touche === "arrowright" || touche === "d") {
    commandes.droite = true;
  } else if (touche === " " || touche === "arrowup" || touche === "z" || touche === "w" || touche === "x") {
    if (!commandes.tir && etat && etat.cadence <= 0.08 && !etat.pause) {
      etat.cadence = 0;
    }
    commandes.tir = true;
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
  if (touche === "arrowleft" || touche === "q" || touche === "a") {
    commandes.gauche = false;
  } else if (touche === "arrowright" || touche === "d") {
    commandes.droite = false;
  } else if (touche === " " || touche === "arrowup" || touche === "z" || touche === "w" || touche === "x") {
    commandes.tir = false;
  }
});

// Doigt ou souris sur le ciel : le vaisseau suit et tire tout seul
function suivre(clientX) {
  const r = canvas.getBoundingClientRect();
  doigtX = Math.max(18, Math.min(W - 18, (clientX - r.left) / r.width * W));
}
canvas.addEventListener("pointerdown", function (evenement) {
  if (!jeuAuPremierPlan(ID)) {
    return;
  }
  evenement.preventDefault();
  if (etat && etat.ecran === "hangar") {
    const r = canvas.getBoundingClientRect();
    const x = (evenement.clientX - r.left) / r.width * W;
    const y = (evenement.clientY - r.top) / r.height * H;
    const z = zonesHangar.find(k => x >= k.x && x <= k.x + k.w && y >= k.y && y <= k.y + k.h);
    if (z && z.fleche) {
      selHangar.ligne = 0;
      selHangar.vaisseau = (selHangar.vaisseau + z.fleche + VAISSEAUX.length) % VAISSEAUX.length;
      jouer("clic");
    } else if (z) {
      selHangar.ligne = Math.max(0, LIGNES_HANGAR.indexOf(z.ligne));
      actionHangar(z.ligne);
    }
    return;
  }
  canvas.setPointerCapture(evenement.pointerId);
  suivre(evenement.clientX);
});
canvas.addEventListener("pointermove", function (evenement) {
  if (doigtX !== null && etat && etat.ecran === "jeu") {
    suivre(evenement.clientX);
  }
});
const lacher = () => {
  doigtX = null;
};
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
zone.querySelector("#rejouerKarasu").addEventListener("click", demarrer);
zone.querySelector("#quitterKarasu").addEventListener("click", quitterJeu);

// Pour les tests automatiques
export const _test = {
  get etat() { return etat; },
  commandes,
  lancerCapture,
  toucherEnnemi,
  lancerVague,
  decoller,
  lacherBonus,
  prendreBonus,
  bombe,
  get hangar() { return hangar; },
  set hangar(h) { hangar = h; stockageHangar.ecrire(h); },
  selHangar: () => selHangar
};

enregistrerJeu({
  id: ID,
  nom: "Galaxian",
  code: "1981",
  section: zone,
  demarrer,
  arreter: () => {
    boucle.arreter();
    commandes.gauche = commandes.droite = commandes.tir = false;
    doigtX = null;
  },
  manette: { a: " ", b: "b", start: "p", libelles: { a: "Tirer", b: "Bombe" } }
});
