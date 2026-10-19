// =====================================================================
//  LIGHTS OUT - les lanternes du jardin de nuit
//  Toucher une lanterne la fait changer d'etat, elle et ses quatre
//  voisines. Le but : eteindre tout le jardin, en le moins de coups.
//  Des niveaux sans fin, generes a partir de leur numero : grilles qui
//  grandissent, jardins aux formes irregulieres, pierres qui ne bougent
//  pas, puis lanternes a trois etats (eteinte, veilleuse, allumee).
//  Le minimum de coups est calcule exactement (pivot de Gauss modulo 2
//  ou 3), ce qui donne les etoiles : 3 au minimum, 2 un peu au-dessus.
// =====================================================================

import { enregistrerJeu, finDePartie, quitterJeu, majScoreCourant } from "./arcade.js";
import { surTouche, jeuAuPremierPlan } from "./noyau/clavier.js";
import { creerBoucle } from "./noyau/boucle.js";
import { creerStockage } from "./noyau/stockage.js";
import { jouer, basculerSon, sonActif } from "./noyau/son.js";

const ID = "toro";
const W = 520;
const H = 660;
const ZONE = { x: 20, y: 132, l: 480, h: 480 };

// ---------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------

const zone = document.createElement("section");
zone.className = "jeu jeu-toro";
zone.id = "jeuToro";
zone.hidden = true;
zone.innerHTML = `
  <div class="jeu-entete entete-toro">
    <span class="toro-boutons">
      <button class="jeu-quitter" id="carteToro" type="button">Carte</button>
      <button class="jeu-quitter" id="tutoToro" type="button">Apprendre</button>
      <button class="jeu-quitter" id="indiceToro" type="button">Indice</button>
      <button class="jeu-quitter" id="annulerToro" type="button">Annuler</button>
      <button class="jeu-quitter" id="rejouerToro" type="button">Recommencer</button>
      <button class="jeu-quitter" id="sonToro" type="button">Son</button>
      <button class="jeu-quitter" id="quitterToro" type="button">Retour</button>
    </span>
  </div>
  <canvas id="canvasToro"></canvas>
  <p class="jeu-aide">Touche une lanterne : elle et ses quatre voisines changent d'état. Éteins tout le jardin. Les pierres ne bougent pas ; plus loin, les lanternes ont trois états (allumée, veilleuse, éteinte). Flèches et Espace au clavier, H indice, Retour arrière annuler, R recommencer, Échap quitter.</p>`;
document.body.appendChild(zone);

const canvas = zone.querySelector("#canvasToro");
const ctx = canvas.getContext("2d");
const boutonCarte = zone.querySelector("#carteToro");
const boutonTuto = zone.querySelector("#tutoToro");
const boutonIndice = zone.querySelector("#indiceToro");
const boutonAnnuler = zone.querySelector("#annulerToro");
const boutonRejouer = zone.querySelector("#rejouerToro");
const boutonSon = zone.querySelector("#sonToro");
const boutonQuitter = zone.querySelector("#quitterToro");

// ---------------------------------------------------------------------
// Hasard reproductible
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
// Niveaux
// ---------------------------------------------------------------------

const FORMES = {
  croix: (r, c, n) => {
    const t = Math.floor(n / 3);
    return (r >= t && r < n - t) || (c >= t && c < n - t);
  },
  losange: (r, c, n) => Math.abs(r - (n - 1) / 2) + Math.abs(c - (n - 1) / 2) <= (n - 1) / 2 + 0.6,
  anneau: (r, c, n) => {
    const m = (n - 1) / 2;
    return !(Math.abs(r - m) < 1 && Math.abs(c - m) < 1);
  },
  coins: (r, c, n) => !((r === 0 || r === n - 1) && (c === 0 || c === n - 1)),
  plein: () => true
};

function genererNiveau(n) {
  const alea = hasard(n * 2654435761 + 97);
  const etats = n >= 35 ? 3 : 2;
  let taille;
  if (n <= 2) {
    taille = 3;
  } else if (n <= 6) {
    taille = 4;
  } else if (n <= 14) {
    taille = 5;
  } else if (n <= 26) {
    taille = 6;
  } else if (n <= 34) {
    taille = 7;
  } else if (n <= 45) {
    taille = n <= 40 ? 4 : 5;     // les trois etats repartent de petit
  } else {
    taille = Math.min(8, 5 + Math.floor((n - 46) / 12));
  }
  // Forme du jardin a partir du niveau 10
  let forme = "plein";
  if (n >= 10 && taille >= 5) {
    const choix = ["plein", "croix", "losange", "anneau", "coins"];
    forme = choix[Math.floor(alea() * choix.length)];
  }
  const cases = [];
  for (let r = 0; r < taille; r++) {
    for (let c = 0; c < taille; c++) {
      cases.push(FORMES[forme](r, c, taille) ? "l" : ".");
    }
  }
  // Pierres a partir du niveau 18
  if (n >= 18) {
    const nb = Math.min(Math.floor(taille * taille / 6), 1 + Math.floor((n - 18) / 8));
    for (let k = 0; k < nb; k++) {
      const i = Math.floor(alea() * cases.length);
      if (cases[i] === "l") {
        cases[i] = "p";
      }
    }
  }
  const actives = cases.map((v, i) => (v === "l" ? i : -1)).filter(i => i >= 0);
  // Brouillage : des coups au hasard depuis le jardin eteint
  const grille = cases.map(() => 0);
  const poids = Math.min(actives.length - 1, Math.round(etats === 3 ? 3 + (n - 35) * 0.35 : 2 + n * 0.45));
  const joues = new Set();
  let essais = 0;
  while (joues.size < poids && essais < 500) {
    essais++;
    const i = actives[Math.floor(alea() * actives.length)];
    if (joues.has(i)) {
      continue;
    }
    joues.add(i);
    const fois = etats === 3 && alea() < 0.4 ? 2 : 1;
    for (let f = 0; f < fois; f++) {
      basculer(grille, cases, taille, i, etats);
    }
  }
  if (grille.every(v => v === 0)) {
    basculer(grille, cases, taille, actives[0], etats);
  }
  const solution = resoudre(grille, cases, taille, etats);
  return { n, taille, cases, grille, etats, minimum: solution ? solution.poids : poids, forme };
}

function voisins(i, taille) {
  const r = Math.floor(i / taille);
  const c = i % taille;
  const liste = [i];
  if (r > 0) {
    liste.push(i - taille);
  }
  if (r < taille - 1) {
    liste.push(i + taille);
  }
  if (c > 0) {
    liste.push(i - 1);
  }
  if (c < taille - 1) {
    liste.push(i + 1);
  }
  return liste;
}

// Les pierres et les trous ne changent jamais
function basculer(grille, cases, taille, i, etats) {
  voisins(i, taille).forEach(j => {
    if (cases[j] === "l") {
      grille[j] = (grille[j] + 1) % etats;
    }
  });
}

// ---------------------------------------------------------------------
// Resolution exacte modulo 2 ou 3 : la solution qui demande le moins
// de coups, en parcourant l'espace des solutions quand il est petit
// ---------------------------------------------------------------------

function resoudre(grille, cases, taille, p) {
  const actives = cases.map((v, i) => (v === "l" ? i : -1)).filter(i => i >= 0);
  const index = new Map(actives.map((c, k) => [c, k]));
  const m = actives.length;
  // Une equation par lanterne : somme des coups qui la touchent = -etat
  const A = actives.map(cel => {
    const ligne = new Array(m + 1).fill(0);
    voisins(cel, taille).forEach(j => {
      if (index.has(j)) {
        ligne[index.get(j)] = 1;
      }
    });
    ligne[m] = (p - grille[cel]) % p;
    return ligne;
  });
  const inv = p === 2 ? [0, 1] : [0, 1, 2];
  const pivots = [];
  let rang = 0;
  for (let col = 0; col < m && rang < m; col++) {
    let piv = -1;
    for (let r = rang; r < m; r++) {
      if (A[r][col] % p !== 0) {
        piv = r;
        break;
      }
    }
    if (piv < 0) {
      continue;
    }
    [A[rang], A[piv]] = [A[piv], A[rang]];
    const f = inv[A[rang][col]];
    for (let k = col; k <= m; k++) {
      A[rang][k] = (A[rang][k] * f) % p;
    }
    for (let r = 0; r < m; r++) {
      if (r !== rang && A[r][col] !== 0) {
        const g = A[r][col];
        for (let k = col; k <= m; k++) {
          A[r][k] = ((A[r][k] - g * A[rang][k]) % p + p) % p;
        }
      }
    }
    pivots.push(col);
    rang++;
  }
  for (let r = rang; r < m; r++) {
    if (A[r][m] !== 0) {
      return null;
    }
  }
  const libres = [];
  for (let col = 0; col < m; col++) {
    if (!pivots.includes(col)) {
      libres.push(col);
    }
  }
  let meilleur = null;
  const total = Math.pow(p, Math.min(libres.length, 10));
  for (let code = 0; code < total; code++) {
    const x = new Array(m).fill(0);
    let reste = code;
    libres.forEach((col, k) => {
      if (k < 10) {
        x[col] = reste % p;
        reste = Math.floor(reste / p);
      }
    });
    pivots.forEach((col, r) => {
      let v = A[r][m];
      libres.forEach(lc => {
        v -= A[r][lc] * x[lc];
      });
      x[col] = ((v % p) + p) % p;
    });
    const poids = x.reduce((a, b) => a + b, 0);
    if (meilleur === null || poids < meilleur.poids) {
      meilleur = { poids, coups: x.map((v, k) => ({ cel: actives[k], fois: v })).filter(o => o.fois > 0) };
    }
  }
  return meilleur;
}

// ---------------------------------------------------------------------
// Progression
// ---------------------------------------------------------------------

const stockage = creerStockage("tanuki-arcade-lights-out");
let progres = Object.assign({ max: 1, etoiles: {}, meilleurs: {} }, stockage.lire() || {});

function sauver() {
  stockage.ecrire(progres);
}

function totalScores() {
  return Object.values(progres.meilleurs).reduce((a, b) => a + b, 0);
}

function totalEtoiles() {
  return Object.values(progres.etoiles).reduce((a, b) => a + b, 0);
}

// ---------------------------------------------------------------------
// Etat de l'ecran
// ---------------------------------------------------------------------

let echelle = 1;
let fond = null;
let ecran = "carte";
let niveau = null;
let partie = null;
let anim = [];               // une valeur d'allumage affichee par case (0..1, et 0.5 pour la veilleuse)
let rebond = [];
let lucioles = [];
let resultat = null;
let indice = -1;
let temps = 0;
let carteDefil = 0;
let carteChoix = 1;
let boutons = [];
let curseur = 0;
let modeClavier = false;

// ---------------------------------------------------------------------
// Tutoriel : de petits jardins prepares, ou l'on fait vraiment le geste
// ---------------------------------------------------------------------

const stockageTuto = creerStockage("tanuki-arcade-tuto-toro");
let tuto = null;              // { etapes, i, essais, bravo, debut }

// Etat d'un jardin apres une serie de touches, depuis tout eteint
function jardinApres(taille, cases, etats, touches) {
  const g = cases.map(() => 0);
  touches.forEach(i => basculer(g, cases, taille, i, etats));
  return g;
}

function casesPleines(taille) {
  return Array(taille * taille).fill("l");
}

const ETAPES_TUTO = [
  {
    titre: "Une touche, cinq lanternes",
    texte: "Toucher une lanterne la fait basculer, elle ET ses quatre voisines (haut, bas, gauche, droite). Touche la lanterne du centre.",
    taille: 3, etats: 2, touches: [4], cible: () => 4
  },
  {
    titre: "Éteindre en un coup",
    texte: "Le but : éteindre tout le jardin. Ici, un seul coup suffit. Trouve lequel.",
    taille: 3, etats: 2, touches: [0], limite: 1, aideApres: 1, solution: [0]
  },
  {
    titre: "Éteindre en trois coups",
    texte: "Plus grand, plus dur : trois coups bien choisis éteignent tout. Les erreurs se rattrapent, mais vise le minimum pour les étoiles.",
    taille: 4, etats: 2, touches: [5, 10, 3], limite: 3, aideApres: 2, solution: [5, 10, 3]
  },
  {
    titre: "L'astuce : chasser vers le bas",
    texte: "Pour chaque lanterne allumée d'une ligne, touche celle juste en dessous. Ligne après ligne, la lumière descend puis disparaît. Suis la flèche.",
    taille: 4, etats: 2, touches: [5, 6, 9, 15], chasse: true
  },
  {
    titre: "Les pierres",
    texte: "Plus loin dans le jardin arrivent des pierres : elles ne bougent jamais, une touche passe à côté d'elles. Éteins ce jardin.",
    taille: 3, etats: 2, pierres: [1], touches: [4], cible: () => 4
  },
  {
    titre: "Lanternes à trois états",
    texte: "Encore plus loin, chaque touche fait avancer d'un cran : éteinte, veilleuse, allumée, puis éteinte à nouveau. Touche deux fois le centre.",
    taille: 3, etats: 3, touches: [4], cible: () => 4
  }
];

function lancerTuto(depuis) {
  stockageTuto.ecrire({ vu: true });
  tuto = { etapes: ETAPES_TUTO, i: depuis || 0, essais: 0, bravo: 0, seule: depuis !== undefined };
  preparerEtapeTuto();
}

function preparerEtapeTuto() {
  const e = tuto.etapes[tuto.i];
  const cases = casesPleines(e.taille);
  (e.pierres || []).forEach(i => {
    cases[i] = "p";
  });
  const grille = jardinApres(e.taille, cases, e.etats, e.touches);
  niveau = { n: 0, taille: e.taille, cases, grille, etats: e.etats, minimum: e.limite || e.touches.length, forme: "plein", tuto: true };
  partie = { grille: grille.slice(), coups: 0, historique: [], gagnee: false, indices: 0 };
  anim = partie.grille.map(v => valeurAffichee(v));
  rebond = partie.grille.map(() => 0);
  lucioles = [];
  resultat = null;
  indice = -1;
  curseur = Math.floor(e.taille * e.taille / 2);
  tuto.bravo = 0;
  tuto.message = "";
  ecran = "jeu";
  majBoutons();
}

// La case a montrer du doigt, s'il y en a une
function cibleTuto() {
  if (!tuto || tuto.bravo > 0) {
    return -1;
  }
  const e = tuto.etapes[tuto.i];
  if (e.cible) {
    return e.cible();
  }
  if (e.chasse) {
    const n = niveau.taille;
    for (let r = 0; r < n - 1; r++) {
      for (let c = 0; c < n; c++) {
        if (partie.grille[r * n + c]) {
          return (r + 1) * n + c;
        }
      }
    }
    return -1;
  }
  if (e.aideApres !== undefined && tuto.essais >= e.aideApres) {
    // La solution, coup par coup, une fois qu'on a cherche un peu
    const sol = resoudre(partie.grille, niveau.cases, niveau.taille, niveau.etats);
    return sol && sol.coups.length ? sol.coups[0].cel : -1;
  }
  return -1;
}

function jardinEteint() {
  return partie.grille.every((v, k) => niveau.cases[k] !== "l" || v === 0);
}

// Appelee apres chaque touche pendant le tuto
function apresToucheTuto() {
  const e = tuto.etapes[tuto.i];
  if (jardinEteint()) {
    tuto.bravo = 1.4;
    tuto.message = "Bravo !";
    jouer("vague");
    return;
  }
  if (e.limite && partie.coups >= e.limite) {
    // Rate : le jardin revient tel quel, avec un coup de pouce ensuite
    tuto.essais++;
    tuto.message = "Pas tout à fait. Le jardin revient, réessaie" + (tuto.essais >= e.aideApres ? " : suis la flèche." : ".");
    jouer("clic");
    setTimeout(() => {
      if (tuto && tuto.etapes[tuto.i] === e && !jardinEteint()) {
        const essais = tuto.essais;
        const message = tuto.message;
        preparerEtapeTuto();
        tuto.essais = essais;
        tuto.message = message;
      }
    }, 700);
  }
}

function etapeSuivanteTuto() {
  if (tuto.seule || tuto.i >= tuto.etapes.length - 1) {
    finTuto();
    return;
  }
  tuto.i++;
  tuto.essais = 0;
  preparerEtapeTuto();
}

function finTuto() {
  tuto = null;
  niveau = null;
  partie = null;
  ecran = "message";
  messageFenetre = {
    titre: "Prêt !",
    lignes: ["Tu connais les règles du jardin.", "Le niveau 1 t'attend sur la carte."],
    boutons: [{ texte: "Revoir", action: () => lancerTuto() }, { texte: "Jouer", principal: true, action: () => nouvellePartie(Math.min(progres.max, carteChoix || 1)) }]
  };
  majBoutons();
}

function quitterTuto() {
  tuto = null;
  allerCarte();
}

let messageFenetre = null;

function proposerTuto() {
  ecran = "message";
  messageFenetre = {
    titre: "Première visite",
    lignes: ["Lights Out est peu connu ici.", "Une minute pour apprendre en jouant ?"],
    boutons: [{ texte: "Plus tard", action: () => {
      stockageTuto.ecrire({ vu: true });
      allerCarte();
    } }, { texte: "Apprendre", principal: true, action: () => lancerTuto() }]
  };
}

function dessinerMessage() {
  const m = messageFenetre;
  fenetre(m.titre, (x, y) => {
    ctx.fillStyle = "#1f2a3a";
    ctx.font = "700 16px 'Hanken Grotesk', sans-serif";
    ctx.textAlign = "center";
    m.lignes.forEach((l, k) => ctx.fillText(l, W / 2, y + 74 + k * 28));
  }, m.boutons);
}

function lignesTexte(texte, largeur) {
  const mots = texte.split(" ");
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
  return lignes;
}

// La bulle du tuto remplace la tete de l'ecran
function dessinerBulleTuto() {
  const e = tuto.etapes[tuto.i];
  const x = 14;
  const y = 10;
  const w = W - 28;
  const h = 116;
  ctx.fillStyle = "#f6efdc";
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 16);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#c8372d";
  ctx.stroke();
  ctx.font = "800 15px 'Anybody', sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#c8372d";
  ctx.fillText(e.titre.toUpperCase(), x + 16, y + 20);
  mono((tuto.i + 1) + " / " + tuto.etapes.length, x + w - 92, y + 20, 10, "#8a6a5a", "right");
  ctx.font = "600 15px 'Hanken Grotesk', sans-serif";
  ctx.fillStyle = "#2a2030";
  const texte = tuto.message && tuto.bravo <= 0 ? tuto.message : e.texte;
  lignesTexte(texte, w - 32).slice(0, 4).forEach((l, k) => {
    ctx.textAlign = "left";
    ctx.fillText(l, x + 16, y + 42 + k * 18);
  });
  if (e.limite) {
    mono("coups : " + partie.coups + " / " + e.limite, x + w - 16, y + h - 12, 10, "#8a6a5a", "right");
  }
  // Bouton "Passer"
  const bx = x + w - 80;
  const by = y + 8;
  ctx.fillStyle = "#e8dcc0";
  ctx.beginPath();
  ctx.roundRect(bx, by, 66, 24, 8);
  ctx.fill();
  ctx.font = "700 11px 'Hanken Grotesk', sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "#5a4a3a";
  ctx.fillText("Passer", bx + 33, by + 12.5);
  boutons = [{ zone: [bx, by, 66, 24], action: quitterTuto }];
  if (tuto.bravo > 0) {
    texteContour("Bravo !", W / 2, ZONE.y + ZONE.h / 2, 48, "#c6f35a", "center", "#0a2010");
  }
}

// Fleche qui montre la lanterne a toucher
function dessinerCibleTuto() {
  const i = cibleTuto();
  if (i < 0) {
    return;
  }
  const [x, y] = centreCase(i);
  const t = tailleCase();
  const p = Math.sin(temps * 6);
  ctx.strokeStyle = "#c6f35a";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(x, y, t * 0.46 + p * 2, 0, Math.PI * 2);
  ctx.stroke();
  const fy = y - t * 0.52 - 10 + p * 5;
  ctx.fillStyle = "#c6f35a";
  ctx.strokeStyle = "#0a2010";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, fy + 12);
  ctx.lineTo(x - 12, fy - 4);
  ctx.lineTo(x - 5, fy - 4);
  ctx.lineTo(x - 5, fy - 18);
  ctx.lineTo(x + 5, fy - 18);
  ctx.lineTo(x + 5, fy - 4);
  ctx.lineTo(x + 12, fy - 4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function nouvellePartie(n) {
  niveau = genererNiveau(n);
  partie = { grille: niveau.grille.slice(), coups: 0, historique: [], gagnee: false, indices: 3 };
  anim = partie.grille.map(v => valeurAffichee(v));
  rebond = partie.grille.map(() => 0);
  lucioles = [];
  resultat = null;
  indice = -1;
  curseur = niveau.cases.indexOf("l");
  carteChoix = n;
  ecran = "intro";
  majBoutons();
}

function valeurAffichee(v) {
  if (niveau.etats === 3) {
    return v === 0 ? 0 : v === 1 ? 0.5 : 1;
  }
  return v ? 1 : 0;
}

function limiteCoups() {
  return niveau.minimum * 2 + 6;
}

function etoilesPour(coups) {
  if (coups <= niveau.minimum) {
    return 3;
  }
  if (coups <= niveau.minimum + Math.max(2, Math.ceil(niveau.minimum * 0.4))) {
    return 2;
  }
  return 1;
}

function toucher(i) {
  if (ecran !== "jeu" || partie.gagnee || niveau.cases[i] !== "l") {
    if (ecran === "jeu" && niveau.cases[i] === "p") {
      jouer("clic");
      rebond[i] = 0.5;
    }
    return;
  }
  if (tuto) {
    const cible = cibleTuto();
    const e = tuto.etapes[tuto.i];
    if (tuto.bravo > 0 || (cible >= 0 && i !== cible && (e.cible || e.chasse))) {
      // Mauvaise lanterne : elle sursaute, la bulle insiste
      rebond[i] = 0.5;
      tuto.message = tuto.bravo > 0 ? tuto.message : "Pas celle-ci : touche la lanterne montrée par la flèche.";
      jouer("clic");
      return;
    }
  }
  partie.historique.push(partie.grille.slice());
  basculer(partie.grille, niveau.cases, niveau.taille, i, niveau.etats);
  partie.coups++;
  indice = -1;
  // L'onde part de la lanterne touchee : elle d'abord, puis ses voisines
  voisins(i, niveau.taille).forEach((j, k) => {
    if (niveau.cases[j] === "l") {
      rebond[j] = k === 0 ? 1 : 0.7;
    }
  });
  jouer("grain");
  if (tuto) {
    tuto.message = "";
    apresToucheTuto();
    majBoutons();
    return;
  }
  if (partie.grille.every((v, k) => niveau.cases[k] !== "l" || v === 0)) {
    gagner();
  } else if (partie.coups >= limiteCoups()) {
    perdre();
  }
  majBoutons();
}

function gagner() {
  partie.gagnee = true;
  const etoiles = etoilesPour(partie.coups);
  const score = niveau.taille * 100 + etoiles * 150 + (niveau.etats === 3 ? 300 : 0) + Math.max(0, limiteCoups() - partie.coups) * 10;
  const n = niveau.n;
  const record = score > (progres.meilleurs[n] || 0);
  progres.etoiles[n] = Math.max(progres.etoiles[n] || 0, etoiles);
  if (record) {
    progres.meilleurs[n] = score;
  }
  progres.max = Math.max(progres.max, n + 1);
  sauver();
  majScoreCourant(ID, totalScores());
  // Des lucioles s'envolent des lanternes eteintes
  niveau.cases.forEach((v, i) => {
    if (v === "l") {
      const [x, y] = centreCase(i);
      for (let k = 0; k < 2; k++) {
        lucioles.push({ x: x + (Math.random() - 0.5) * 20, y, vx: (Math.random() - 0.5) * 30, vy: -30 - Math.random() * 50, vie: 2 + Math.random() * 1.5, phase: Math.random() * 6 });
      }
    }
  });
  jouer("vague");
  setTimeout(() => {
    if (partie && partie.gagnee && ecran === "jeu") {
      resultat = { gagne: true, etoiles, score, record, age: 0 };
      ecran = "resultat";
      jouer("vie");
    }
  }, 1300);
}

function perdre() {
  jouer("mort");
  resultat = { gagne: false, age: 0 };
  ecran = "resultat";
}

function annuler() {
  if (ecran !== "jeu" || partie.gagnee || partie.historique.length === 0) {
    return;
  }
  partie.grille = partie.historique.pop();
  partie.coups = Math.max(0, partie.coups - 1);
  jouer("clic");
  majBoutons();
}

function montrerIndice() {
  if (ecran !== "jeu" || partie.gagnee || partie.indices <= 0) {
    return;
  }
  const sol = resoudre(partie.grille, niveau.cases, niveau.taille, niveau.etats);
  if (!sol || sol.coups.length === 0) {
    return;
  }
  indice = sol.coups[0].cel;
  partie.indices--;
  jouer("bonus");
  majBoutons();
}

function majBoutons() {
  const enJeu = ecran === "jeu" && partie && !partie.gagnee;
  boutonIndice.disabled = !enJeu || partie.indices <= 0;
  boutonIndice.textContent = "Indice" + (partie ? " (" + partie.indices + ")" : "");
  boutonAnnuler.disabled = !enJeu || partie.historique.length === 0;
  boutonRejouer.disabled = !partie;
  if (tuto) {
    boutonIndice.disabled = true;
    boutonAnnuler.disabled = true;
  }
}

// ---------------------------------------------------------------------
// Geometrie du plateau
// ---------------------------------------------------------------------

function tailleCase() {
  return Math.min(ZONE.l, ZONE.h) / niveau.taille;
}

function centreCase(i) {
  const t = tailleCase();
  const r = Math.floor(i / niveau.taille);
  const c = i % niveau.taille;
  const decal = (ZONE.l - t * niveau.taille) / 2;
  return [ZONE.x + decal + c * t + t / 2, ZONE.y + r * t + t / 2];
}

function caseSous(x, y) {
  const t = tailleCase();
  const decal = (ZONE.l - t * niveau.taille) / 2;
  const c = Math.floor((x - ZONE.x - decal) / t);
  const r = Math.floor((y - ZONE.y) / t);
  if (r < 0 || c < 0 || r >= niveau.taille || c >= niveau.taille) {
    return -1;
  }
  return r * niveau.taille + c;
}

// ---------------------------------------------------------------------
// Decor : jardin de nuit, lune, pins, etang
// ---------------------------------------------------------------------

function peindreFond() {
  const off = document.createElement("canvas");
  off.width = Math.round(W * echelle);
  off.height = Math.round(H * echelle);
  const c = off.getContext("2d");
  c.setTransform(echelle, 0, 0, echelle, 0, 0);
  const ciel = c.createLinearGradient(0, 0, 0, H);
  ciel.addColorStop(0, "#0c1030");
  ciel.addColorStop(0.5, "#16224a");
  ciel.addColorStop(1, "#0f2a2a");
  c.fillStyle = ciel;
  c.fillRect(0, 0, W, H);
  // Etoiles fixes, peu nombreuses
  const alea = hasard(7);
  for (let i = 0; i < 40; i++) {
    c.fillStyle = i % 4 ? "rgba(255,255,240,0.55)" : "rgba(255,255,240,0.9)";
    const s = i % 5 ? 1 : 1.8;
    c.fillRect(alea() * W, alea() * 200, s, s);
  }
  // Lune et son reflet sur l'etang
  c.fillStyle = "#f1e8c8";
  c.beginPath();
  c.arc(440, 136, 26, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#ddd2ae";
  c.beginPath();
  c.arc(432, 129, 5, 0, Math.PI * 2);
  c.arc(447, 144, 3.5, 0, Math.PI * 2);
  c.fill();
  // Collines
  c.fillStyle = "#13253c";
  c.beginPath();
  c.moveTo(0, 210);
  c.quadraticCurveTo(130, 140, 260, 190);
  c.quadraticCurveTo(390, 150, 520, 200);
  c.lineTo(520, H);
  c.lineTo(0, H);
  c.closePath();
  c.fill();
  // Pins en silhouette
  const pin = (x, y, s) => {
    c.fillStyle = "#0a1a22";
    c.fillRect(x - 2 * s, y, 4 * s, 40 * s);
    [[0, 0, 30], [-8, 14, 24], [10, 24, 22], [-4, 34, 18]].forEach(([dx, dy, l]) => {
      c.beginPath();
      c.ellipse(x + dx * s, y + dy * s, l * s, 7 * s, 0, 0, Math.PI * 2);
      c.fill();
    });
  };
  pin(40, 130, 1.3);
  pin(488, 150, 1.1);
  // Etang en bas, avec le reflet de la lune
  c.fillStyle = "#0c1c2c";
  c.beginPath();
  c.ellipse(W / 2, H - 14, 230, 26, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "rgba(241,232,200,0.35)";
  [0, 1, 2].forEach(k => c.fillRect(W / 2 + 80 - k * 6, H - 26 + k * 8, 40 - k * 10, 2));
  return off;
}

// ---------------------------------------------------------------------
// La lanterne de papier (chochin) sur son socle de pierre
// ---------------------------------------------------------------------

function dessinerLanterne(x, y, t, allumage, rebondValeur, i) {
  const s = t / 60;
  const b = 1 + Math.sin(Math.min(1, rebondValeur) * Math.PI) * 0.12 * (rebondValeur > 0 ? 1 : 0);
  ctx.save();
  ctx.translate(x, y + 4 * s);
  // Flaque de lumiere au sol, a plat
  if (allumage > 0.05) {
    ctx.fillStyle = "rgba(255,196,96," + (0.22 * allumage) + ")";
    ctx.beginPath();
    ctx.ellipse(0, 22 * s, 26 * s, 8 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Socle de pierre
  ctx.fillStyle = "#3e4650";
  ctx.beginPath();
  ctx.roundRect(-14 * s, 16 * s, 28 * s, 8 * s, 3 * s);
  ctx.fill();
  ctx.fillStyle = "#59626e";
  ctx.fillRect(-12 * s, 16 * s, 24 * s, 2 * s);
  ctx.scale(b, 2 - b);
  // Corps de papier : couleur qui passe de la nuit a la flamme
  // Trois teintes : nuit, veilleuse rouge orange, pleine flamme jaune
  const froid = [52, 58, 82];
  const veille = [206, 92, 48];
  const chaud = [248, 186, 64];
  const k = allumage;
  const de = k < 0.5 ? froid : veille;
  const a = k < 0.5 ? veille : chaud;
  const u = k < 0.5 ? k * 2 : (k - 0.5) * 2;
  const teinte = de.map((v, n) => Math.round(v + (a[n] - v) * u));
  const clair = teinte.map(v => Math.min(255, v + 50 + 40 * k));
  const g = ctx.createLinearGradient(-18 * s, 0, 18 * s, 0);
  g.addColorStop(0, "rgb(" + teinte.map(v => Math.round(v * 0.6)).join(",") + ")");
  g.addColorStop(0.45, "rgb(" + clair.join(",") + ")");
  g.addColorStop(1, "rgb(" + teinte.map(v => Math.round(v * 0.55)).join(",") + ")");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, -4 * s, 17 * s, 20 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  // Flamme a l'interieur, visible a travers le papier
  if (k > 0.05) {
    const vacille = 1 + Math.sin(temps * 9 + i) * 0.08;
    ctx.fillStyle = "rgba(255,240,180," + (0.8 * k) + ")";
    ctx.beginPath();
    ctx.ellipse(0, -2 * s, 6 * s * k * vacille, 10 * s * k * vacille, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Nervures du papier
  ctx.strokeStyle = "rgba(20,14,10," + (0.35 + 0.15 * (1 - k)) + ")";
  ctx.lineWidth = Math.max(0.8, 1.1 * s);
  for (let n = -3; n <= 3; n++) {
    const yy = -4 * s + n * 5.2 * s;
    const demi = 17 * s * Math.sqrt(Math.max(0, 1 - Math.pow((n * 5.2) / 20, 2)));
    ctx.beginPath();
    ctx.moveTo(-demi, yy);
    ctx.lineTo(demi, yy);
    ctx.stroke();
  }
  // Signe peint
  ctx.fillStyle = k > 0.5 ? "rgba(150,30,20,0.85)" : "rgba(10,10,20,0.45)";
  ctx.font = "700 " + Math.round(13 * s) + "px 'Shippori Mincho B1', serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("灯", 0, -3 * s);
  // Calottes noires et poignee
  ctx.fillStyle = "#15120f";
  ctx.beginPath();
  ctx.roundRect(-10 * s, -26 * s, 20 * s, 5 * s, 2 * s);
  ctx.roundRect(-10 * s, 14 * s, 20 * s, 5 * s, 2 * s);
  ctx.fill();
  ctx.fillRect(-1 * s, -31 * s, 2 * s, 5 * s);
  ctx.restore();
}

function dessinerPierre(x, y, t) {
  const s = t / 60;
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(x + 2 * s, y + 18 * s, 22 * s, 7 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createRadialGradient(x - 6 * s, y - 6 * s, 2, x, y, 26 * s);
  g.addColorStop(0, "#9aa0a6");
  g.addColorStop(1, "#3e444c");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x - 20 * s, y + 14 * s);
  ctx.quadraticCurveTo(x - 22 * s, y - 10 * s, x - 2 * s, y - 16 * s);
  ctx.quadraticCurveTo(x + 22 * s, y - 14 * s, x + 21 * s, y + 6 * s);
  ctx.quadraticCurveTo(x + 18 * s, y + 18 * s, x, y + 18 * s);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#4f7a3a";
  ctx.beginPath();
  ctx.ellipse(x - 5 * s, y - 12 * s, 11 * s, 4 * s, -0.2, 0, Math.PI * 2);
  ctx.fill();
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
  ctx.strokeStyle = contour || "#0a0c1e";
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

function etoile(x, y, r, pleine) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = pleine ? "#ffd23a" : "rgba(0,0,0,0.4)";
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, r * 0.18);
  ctx.strokeStyle = pleine ? "#a8650a" : "rgba(255,226,170,0.45)";
  ctx.stroke();
}

function panneau(x, y, w, h) {
  ctx.fillStyle = "rgba(8,12,30,0.7)";
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 14);
  ctx.fill();
  ctx.strokeStyle = "rgba(241,232,200,0.35)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function dessinerTete() {
  panneau(16, 14, 120, 104);
  mono("NIVEAU", 76, 34, 9, "#c9d2f0");
  texteContour(String(niveau.n), 76, 74, 40, "#ffffff");
  mono(niveau.etats === 3 ? "3 ÉTATS" : niveau.taille + " × " + niveau.taille, 76, 104, 8, "#8f9ac0");

  panneau(144, 14, 232, 104);
  mono("COUPS", 260, 34, 9, "#c9d2f0");
  const alerte = partie.coups >= limiteCoups() - 3;
  texteContour(String(partie.coups), 236, 72, 36, alerte ? "#ff8a7a" : "#ffffff", "right");
  mono("/ " + limiteCoups(), 246, 76, 12, "#8f9ac0", "left");
  mono("minimum possible : " + niveau.minimum, 260, 104, 8, "#8f9ac0");

  panneau(384, 14, 120, 104);
  mono("ÉTOILES", 444, 34, 9, "#c9d2f0");
  const e = etoilesPour(Math.max(partie.coups, 0));
  [-1, 0, 1].forEach((d, i) => etoile(444 + d * 30, 74 - (d === 0 ? 4 : 0), d === 0 ? 14 : 11, i < e));
  mono("encore possibles", 444, 104, 8, "#8f9ac0");
}

function dessinerPlateau() {
  const t = tailleCase();
  const n = niveau.taille;
  // Mousse du jardin sous les lanternes
  ctx.fillStyle = "#14302a";
  ctx.beginPath();
  ctx.roundRect(ZONE.x - 8, ZONE.y - 8, ZONE.l + 16, ZONE.h + 16, 26);
  ctx.fill();
  ctx.strokeStyle = "#2a4a3a";
  ctx.lineWidth = 2;
  ctx.stroke();
  for (let i = 0; i < n * n; i++) {
    const [x, y] = centreCase(i);
    const v = niveau.cases[i];
    if (v === ".") {
      continue;
    }
    // Pas japonais : une dalle sombre sous chaque lanterne
    ctx.fillStyle = (Math.floor(i / n) + i) % 2 ? "rgba(30,60,52,0.9)" : "rgba(36,68,58,0.9)";
    ctx.beginPath();
    ctx.roundRect(x - t / 2 + 3, y - t / 2 + 3, t - 6, t - 6, t * 0.18);
    ctx.fill();
  }
  for (let i = 0; i < n * n; i++) {
    const [x, y] = centreCase(i);
    const v = niveau.cases[i];
    if (v === "l") {
      dessinerLanterne(x, y, t, anim[i], rebond[i], i);
    } else if (v === "p") {
      dessinerPierre(x, y, t);
    }
    if (i === indice) {
      ctx.strokeStyle = "#ff8a7a";
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.arc(x, y, t * 0.44, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (modeClavier && i === curseur && ecran === "jeu") {
      ctx.strokeStyle = "#c6f35a";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(x - t / 2 + 4, y - t / 2 + 4, t - 8, t - 8, t * 0.16);
      ctx.stroke();
    }
  }
  // Lucioles de la victoire
  lucioles.forEach(l => {
    const a = Math.min(1, l.vie) * (0.6 + 0.4 * Math.sin(temps * 8 + l.phase));
    ctx.fillStyle = "rgba(214,255,140," + a + ")";
    ctx.beginPath();
    ctx.arc(l.x, l.y, 2.4, 0, Math.PI * 2);
    ctx.fill();
  });
}

function fenetre(titre, contenu, liste) {
  ctx.fillStyle = "rgba(4,6,18,0.62)";
  ctx.fillRect(0, 0, W, H);
  const w = 400;
  const h = 300;
  const x = (W - w) / 2;
  const y = 180;
  ctx.fillStyle = "#f6efdc";
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 22);
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = "#1f3a5a";
  ctx.stroke();
  ctx.fillStyle = "#1f3a5a";
  ctx.beginPath();
  ctx.roundRect(x + 60, y - 22, w - 120, 46, 14);
  ctx.fill();
  texteContour(titre, W / 2, y + 1, 24, "#ffffff", "center", "#0c1c34");
  contenu(x, y, w, h);
  boutons = liste.map((b, i) => {
    const bw = (w - 60 - (liste.length - 1) * 14) / liste.length;
    const bx = x + 30 + i * (bw + 14);
    const by = y + h - 70;
    ctx.fillStyle = b.principal ? "#e8a23a" : "#5a7fa8";
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, 48, 14);
    ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(bx + 8, by + 40, bw - 16, 4);
    texteContour(b.texte, bx + bw / 2, by + 24, 18, "#ffffff", "center", b.principal ? "#7a4a0a" : "#1f3a5a");
    return Object.assign({ zone: [bx, by, bw, 48] }, b);
  });
}

function dessinerIntro() {
  fenetre("Niveau " + niveau.n, (x, y) => {
    ctx.fillStyle = "#1f2a3a";
    ctx.font = "700 16px 'Hanken Grotesk', sans-serif";
    ctx.textAlign = "center";
    const phrase = niveau.etats === 3 ? "Lanternes à trois états : éteins-les toutes" : "Éteins toutes les lanternes du jardin";
    ctx.fillText(phrase, W / 2, y + 66);
    mono("3 étoiles en " + niveau.minimum + " coups, au plus " + limiteCoups(), W / 2, y + 94, 11, "#5a6a80");
    if (niveau.cases.includes("p")) {
      mono("Les pierres ne bougent pas", W / 2, y + 116, 10, "#5a6a80");
    }
    if (niveau.n === 18 || niveau.n === 35) {
      mono(niveau.n === 18 ? "Nouveau : les pierres (bouton Revoir)" : "Nouveau : trois états (bouton Revoir)", W / 2, y + 134, 10, "#c8372d");
    }
    [-1, 0, 1].forEach((d, i) => etoile(W / 2 + d * 44, y + 160 - (d === 0 ? 8 : 0), d === 0 ? 22 : 18, i < (progres.etoiles[niveau.n] || 0)));
  }, [{ texte: "Carte", action: allerCarte }].concat(niveau.n === 18 || niveau.n === 35 ? [{ texte: "Revoir", action: () => lancerTuto(niveau.n === 18 ? 4 : 5) }] : []).concat([{ texte: "Jouer", principal: true, action: () => {
    ecran = "jeu";
    majBoutons();
    jouer("pouvoir");
  } }]));
}

function dessinerResultat() {
  const r = resultat;
  fenetre(r.gagne ? "Jardin éteint" : "Trop de coups", (x, y) => {
    if (r.gagne) {
      [-1, 0, 1].forEach((d, i) => etoile(W / 2 + d * 56, y + 84 - (d === 0 ? 12 : 0), d === 0 ? 30 : 24, r.age > 0.25 + i * 0.3 && i < r.etoiles));
      texteContour(partie.coups + " coups", W / 2, y + 150, 26, "#ffffff", "center", "#1f3a5a");
      mono(partie.coups <= niveau.minimum ? "Le minimum, parfait !" : "Minimum : " + niveau.minimum + " coups", W / 2, y + 184, 11, "#5a6a80");
    } else {
      ctx.fillStyle = "#1f2a3a";
      ctx.font = "700 16px 'Hanken Grotesk', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Le jardin brûle encore.", W / 2, y + 80);
      mono("Il fallait " + niveau.minimum + " coups au mieux.", W / 2, y + 112, 11, "#5a6a80");
    }
  }, r.gagne
    ? [{ texte: "Carte", action: allerCarte }, { texte: "Rejouer", action: () => nouvellePartie(niveau.n) }, { texte: "Suivant", principal: true, action: () => nouvellePartie(niveau.n + 1) }]
    : [{ texte: "Carte", action: allerCarte }, { texte: "Rejouer", principal: true, action: () => nouvellePartie(niveau.n) }]);
}

// Carte : un chemin de lanternes de pierre dans le jardin
function positionCarte(n) {
  return [W / 2 + Math.sin(n * 0.85) * 150, H - 90 - (n - 1) * 92 + carteDefil];
}

function dessinerCarte() {
  ctx.drawImage(fond, 0, 0, W, H);
  const premier = Math.max(1, Math.floor((carteDefil - H) / 92));
  const dernier = premier + 12;
  ctx.strokeStyle = "rgba(241,232,200,0.45)";
  ctx.lineWidth = 6;
  ctx.setLineDash([2, 12]);
  ctx.lineCap = "round";
  ctx.beginPath();
  for (let n = premier; n <= dernier; n++) {
    const [x, y] = positionCarte(n);
    if (n === premier) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
  ctx.setLineDash([]);
  for (let n = premier; n <= dernier; n++) {
    const [x, y] = positionCarte(n);
    if (y < -60 || y > H + 60) {
      continue;
    }
    const ouvert = n <= progres.max;
    const courant = n === progres.max;
    dessinerLanterne(x, y - 6, 62, courant ? 1 : ouvert ? 0.45 : 0, 0, n);
    texteContour(String(n), x, y + 30, 16, ouvert ? "#ffffff" : "#8f9ac0");
    if (n === carteChoix) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y - 4, 34, 0, Math.PI * 2);
      ctx.stroke();
    }
    const e = progres.etoiles[n] || 0;
    if (ouvert && n < progres.max) {
      [-1, 0, 1].forEach((d, i) => etoile(x + d * 16, y - 46 + Math.abs(d) * 4, 7, i < e));
    }
  }
  panneau(14, 12, W - 28, 70);
  texteContour("LIGHTS OUT", 34, 40, 28, "#ffffff", "left");
  mono(totalEtoiles() + " étoiles   " + totalScores().toLocaleString("fr-BE") + " points", 36, 66, 10, "#c9d2f0", "left");
  mono("Niveau " + carteChoix, W - 34, 40, 10, "#c9d2f0", "right");
  mono(carteChoix <= progres.max ? "Touche pour jouer" : "Pas encore ouvert", W - 34, 62, 10, "#c6f35a", "right");
}

function dessiner() {
  ctx.setTransform(echelle, 0, 0, echelle, 0, 0);
  if (ecran === "carte") {
    dessinerCarte();
    return;
  }
  ctx.drawImage(fond, 0, 0, W, H);
  if (ecran === "message" && !niveau) {
    dessinerMessage();
    return;
  }
  if (tuto) {
    dessinerPlateau();
    dessinerCibleTuto();
    dessinerBulleTuto();
    return;
  }
  if (niveau) {
    dessinerTete();
    dessinerPlateau();
  }
  if (ecran === "message") {
    dessinerMessage();
  } else if (ecran === "intro") {
    dessinerIntro();
  } else if (ecran === "resultat") {
    dessinerResultat();
  }
}

function maj(dt) {
  temps += dt;
  if (niveau && partie) {
    // Chaque lanterne glisse vers son etat : la flamme prend ou s'eteint
    partie.grille.forEach((v, i) => {
      const cible = valeurAffichee(v);
      anim[i] += (cible - anim[i]) * Math.min(1, dt * 10);
      rebond[i] = Math.max(0, rebond[i] - dt * 4);
    });
  }
  lucioles = lucioles.filter(l => {
    l.vie -= dt;
    l.x += (l.vx + Math.sin(temps * 3 + l.phase) * 20) * dt;
    l.y += l.vy * dt;
    return l.vie > 0;
  });
  if (resultat) {
    resultat.age += dt;
  }
  if (tuto && tuto.bravo > 0) {
    tuto.bravo -= dt;
    if (tuto.bravo <= 0) {
      etapeSuivanteTuto();
    }
  }
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
  const largeur = Math.min(window.innerWidth * 0.96 - marge, 600);
  const entete = zone.querySelector(".entete-toro").getBoundingClientRect().height || 40;
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
// Navigation et commandes
// ---------------------------------------------------------------------

function allerCarte() {
  ecran = "carte";
  carteChoix = Math.min(carteChoix, progres.max);
  carteDefil = Math.max(0, (carteChoix - 1) * 92 - (H / 2 - 90) + 90);
  majBoutons();
}

function pointLogique(evenement) {
  const r = canvas.getBoundingClientRect();
  return [(evenement.clientX - r.left) / r.width * W, (evenement.clientY - r.top) / r.height * H];
}

let glisse = null;

canvas.addEventListener("pointerdown", function (evenement) {
  if (!jeuAuPremierPlan(ID)) {
    return;
  }
  evenement.preventDefault();
  modeClavier = false;
  const [x, y] = pointLogique(evenement);
  if (ecran === "carte") {
    glisse = { y, defil: carteDefil, bouge: false };
    canvas.setPointerCapture(evenement.pointerId);
    return;
  }
  if (tuto && boutons.length) {
    const b = boutons.find(bt => x >= bt.zone[0] && x <= bt.zone[0] + bt.zone[2] && y >= bt.zone[1] && y <= bt.zone[1] + bt.zone[3]);
    if (b) {
      jouer("clic");
      b.action();
      return;
    }
  }
  if (ecran === "intro" || ecran === "resultat" || ecran === "message") {
    const b = boutons.find(bt => x >= bt.zone[0] && x <= bt.zone[0] + bt.zone[2] && y >= bt.zone[1] && y <= bt.zone[1] + bt.zone[3]);
    if (b) {
      jouer("clic");
      b.action();
    }
    return;
  }
  const i = caseSous(x, y);
  if (i >= 0) {
    curseur = i;
    toucher(i);
  }
});

canvas.addEventListener("pointermove", function (evenement) {
  if (!glisse) {
    return;
  }
  const [, y] = pointLogique(evenement);
  if (Math.abs(y - glisse.y) > 6) {
    glisse.bouge = true;
  }
  carteDefil = Math.max(0, glisse.defil + (y - glisse.y));
});

canvas.addEventListener("pointerup", function (evenement) {
  if (ecran === "carte" && glisse && !glisse.bouge) {
    const [x, y] = pointLogique(evenement);
    for (let n = 1; n <= progres.max + 6; n++) {
      const [nx, ny] = positionCarte(n);
      if (Math.hypot(x - nx, y - ny) < 36) {
        carteChoix = n;
        if (n <= progres.max) {
          jouer("clic");
          nouvellePartie(n);
        }
        break;
      }
    }
  }
  glisse = null;
});

canvas.addEventListener("wheel", function (evenement) {
  if (ecran === "carte") {
    evenement.preventDefault();
    carteDefil = Math.max(0, carteDefil - evenement.deltaY * 0.6);
  }
}, { passive: false });
canvas.addEventListener("contextmenu", evenement => evenement.preventDefault());

surTouche(ID, function (evenement) {
  const touche = evenement.key.toLowerCase();
  if (touche === "escape") {
    quitterJeu();
    return;
  }
  if (touche === "m") {
    basculerSon();
    majBoutonSon();
  } else if (ecran === "carte") {
    if (touche === "arrowup" || touche === "arrowright") {
      carteChoix = Math.min(progres.max, carteChoix + 1);
      carteDefil = Math.max(0, (carteChoix - 1) * 92 - (H / 2 - 90) + 90);
    } else if (touche === "arrowdown" || touche === "arrowleft") {
      carteChoix = Math.max(1, carteChoix - 1);
      carteDefil = Math.max(0, (carteChoix - 1) * 92 - (H / 2 - 90) + 90);
    } else if (touche === " " || touche === "enter" || touche === "h") {
      nouvellePartie(carteChoix);
    } else {
      return;
    }
  } else if (ecran === "intro" || ecran === "resultat" || ecran === "message") {
    if (touche === " " || touche === "enter" || touche === "h") {
      const p = boutons.find(b => b.principal);
      if (p) {
        p.action();
      }
    } else if (touche === "backspace") {
      allerCarte();
    } else {
      return;
    }
  } else {
    const n = niveau.taille;
    const r = Math.floor(curseur / n);
    const c = curseur % n;
    if (touche === "arrowup") {
      modeClavier = true;
      curseur = Math.max(0, r - 1) * n + c;
    } else if (touche === "arrowdown") {
      modeClavier = true;
      curseur = Math.min(n - 1, r + 1) * n + c;
    } else if (touche === "arrowleft") {
      modeClavier = true;
      curseur = r * n + Math.max(0, c - 1);
    } else if (touche === "arrowright") {
      modeClavier = true;
      curseur = r * n + Math.min(n - 1, c + 1);
    } else if (touche === " " || touche === "enter") {
      modeClavier = true;
      toucher(curseur);
    } else if (touche === "h") {
      montrerIndice();
    } else if (touche === "backspace" || touche === "u") {
      annuler();
    } else if (tuto && (touche === "r" || touche === "n")) {
      preparerEtapeTuto();
    } else if (tuto && touche === "t") {
      quitterTuto();
    } else if (touche === "r" || touche === "n") {
      nouvellePartie(niveau.n);
      ecran = "jeu";
    } else {
      return;
    }
  }
  evenement.preventDefault();
});

function majBoutonSon() {
  boutonSon.textContent = sonActif() ? "Son" : "Muet";
}

boutonCarte.addEventListener("click", function () {
  tuto = null;
  allerCarte();
});
boutonTuto.addEventListener("click", function () {
  lancerTuto();
});
boutonIndice.addEventListener("click", montrerIndice);
boutonAnnuler.addEventListener("click", annuler);
boutonRejouer.addEventListener("click", function () {
  if (tuto) {
    preparerEtapeTuto();
    return;
  }
  if (niveau) {
    nouvellePartie(niveau.n);
    ecran = "jeu";
    majBoutons();
  }
});
boutonSon.addEventListener("click", function () {
  basculerSon();
  majBoutonSon();
});
boutonQuitter.addEventListener("click", function () {
  // Quitter envoie le total au classement s'il y a quelque chose a envoyer
  const total = totalScores();
  if (total > 0) {
    finDePartie(ID, total, "Lights Out");
  } else {
    quitterJeu();
  }
});

// Pour les tests automatiques
export const _test = { get tuto() { return tuto; }, lancerTuto, cibleTuto, get niveau() { return niveau; }, get partie() { return partie; }, get ecran() { return ecran; }, set ecran(v) { ecran = v; }, nouvellePartie, toucher, resoudre, genererNiveau };

enregistrerJeu({
  id: ID,
  nom: "Lights Out",
  code: "25",
  section: zone,
  demarrer() {
    progres = Object.assign({ max: 1, etoiles: {}, meilleurs: {} }, stockage.lire() || {});
    fond = null;
    ajuster();
    requestAnimationFrame(ajuster);
    carteChoix = progres.max;
    partie = null;
    tuto = null;
    allerCarte();
    if (!(stockageTuto.lire() || {}).vu) {
      niveau = null;
      proposerTuto();
    }
    majScoreCourant(ID, totalScores());
    majBoutonSon();
    boucle.lancer();
  },
  arreter() {
    boucle.arreter();
  },
  formaterScore: score => Number(score).toLocaleString("fr-BE"),
  manette: { a: " ", b: "Backspace", start: "h", quatreDirections: true, libelles: { a: "Basculer", b: "Annuler" } }
});
