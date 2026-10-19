// =====================================================================
//  PACHINKO - la machine a billes japonaise
//  On regle la force, on lance : la bille d'acier monte par le rail,
//  suit l'arc du haut, puis redescend entre les clous. Certaines
//  tombent dans une poche et rapportent des billes ; la poche centrale
//  lance la roulette. Trois 7 : la trappe du bas s'ouvre et les billes
//  pleuvent. Le score est le pic de billes atteint, comme au blackjack.
//
//  Les constantes de reglage sont regroupees juste en dessous.
// =====================================================================

import { enregistrerJeu, finDePartie, quitterJeu, majScoreCourant } from "./arcade.js";
import { creerBoucle } from "./noyau/boucle.js";
import { surTouche, jeuAuPremierPlan } from "./noyau/clavier.js";
import { abscisseLogique } from "./noyau/pointeur.js";
import { creerEffets } from "./noyau/effets.js";
import { jouer, basculerSon, sonActif } from "./noyau/son.js";
import { VERMILLON, PAPIER } from "./tanukiland/sprites.js";
import { rebondSegment, rebondCercle, chocBilles, plafonner, segmentsDe, arc } from "./pachinko/physique.js";

const ID = "pachinko";

// ---------------------------------------------------------------------
// Reglages
// ---------------------------------------------------------------------

const LARGEUR = 360;
const HAUTEUR = 620;
const GRAVITE = 520;              // px/s2
const SOUS_PAS = 6;               // sous-pas de simulation par image
const VITESSE_MAX = 1100;
const RAYON_BILLE = 3.5;
const RAYON_CLOU = 1.8;
const REST_CLOU = 0.42;
const REST_MUR = 0.35;
const LANCER_MIN = 560;           // vitesse de lancement a force 0 (retombe)
const LANCER_MAX = 1040;          // vitesse a force 1 (fait le tour de l'arc)
const CHARGE_PAR_SECONDE = 1.1;
const CADENCE_RAFALE = 0.16;      // secondes entre deux billes en rafale
const BILLES_DEPART = 200;
const MAX_BILLES_EN_JEU = 40;
const PROBA_JACKPOT = 1 / 28;
const PROBA_BRELAN = 1 / 9;
const DUREE_FIEVRE = 8;           // secondes de trappe ouverte apres 777
const PLUIE_JACKPOT = 38;         // billes gagnees d'un coup sur 777
// Apres une fievre, le kakuhen : quelques tours ou le 777 sort bien plus
// souvent. Les fievres peuvent s'enchainer ; les gains par fievre sont
// reduits d'autant pour garder une legere perte moyenne.
const TOURS_KAKUHEN = 4;
const PROBA_JACKPOT_KAKUHEN = 1 / 9;
const GAINS = { poche: 1, tulipe: 4, start: 3, trappe: 15, brelan: 30 };

// ---------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------

const zone = document.createElement("section");
zone.className = "jeu jeu-pachinko";
zone.id = "jeuPachinko";
zone.hidden = true;
zone.innerHTML = `
  <div class="jeu-entete entete-pachinko">
    <span class="jeu-score">Billes <strong id="reservePachinko">200</strong></span>
    <span class="jeu-score score-principal">Pic <strong class="valeur-score" id="picPachinko">200</strong></span>
    <span class="jeu-score">Roulette <strong id="attentePachinko">0</strong></span>
    <span class="entete-boutons">
      <button class="jeu-quitter" id="encaisserPachinko" type="button">Encaisser</button>
      <button class="jeu-quitter" id="sonPachinko" type="button">Son</button>
      <button class="jeu-quitter" id="rejouerPachinko" type="button">Rejouer</button>
      <button class="jeu-quitter" id="quitterPachinko" type="button">Retour</button>
    </span>
  </div>
  <canvas id="canvasPachinko"></canvas>
  <p class="jeu-aide">Maintiens Espace pour charger la force, relâche pour lancer. X maintenu : rafale. Haut et Bas règlent la force. Au doigt : appuie et garde le doigt posé, à gauche pour un tir doux, à droite pour un tir fort. Trois 7 ouvrent la trappe. P pause, M son, N rejouer, Échap quitter.</p>`;
document.body.appendChild(zone);

const canvas = zone.querySelector("#canvasPachinko");
const contexte = canvas.getContext("2d");
const zoneReserve = zone.querySelector("#reservePachinko");
const zonePic = zone.querySelector("#picPachinko");
const zoneAttente = zone.querySelector("#attentePachinko");
const boutonEncaisser = zone.querySelector("#encaisserPachinko");
const boutonSon = zone.querySelector("#sonPachinko");
const boutonRejouer = zone.querySelector("#rejouerPachinko");
const boutonQuitter = zone.querySelector("#quitterPachinko");

// ---------------------------------------------------------------------
// Le plateau
// ---------------------------------------------------------------------

const CENTRE_ARC = { x: 180, y: 232, r: 172 };
const RAIL_INTERIEUR = 336;       // x du mur entre le plateau et le rail
const RAIL_EXTERIEUR = 352;
const HAUT_RAIL = 252;            // ou le rail debouche dans l'arc
const BAS = 606;                  // en dessous, la bille est perdue

// Murs fixes : l'arc du haut, les deux cotes, le rail de lancement
const MURS = [
  ...segmentsDe(arc(CENTRE_ARC.x, CENTRE_ARC.y, CENTRE_ARC.r, Math.PI, Math.PI * 2, 0.08)),
  [8, CENTRE_ARC.y, 8, 612],
  [RAIL_EXTERIEUR, CENTRE_ARC.y, RAIL_EXTERIEUR, 612],
  [RAIL_INTERIEUR, HAUT_RAIL, RAIL_INTERIEUR, 612],
  // Le fond du rail : une bille trop faible y retombe et revient au joueur
  [RAIL_INTERIEUR, 612, RAIL_EXTERIEUR, 612]
];


// Clapet a sens unique en haut du rail : une bille du plateau ne peut pas
// redescendre dans le rail
const CLAPET = [RAIL_INTERIEUR, HAUT_RAIL, RAIL_EXTERIEUR, HAUT_RAIL - 20];

// La fenetre de la roulette est un obstacle : les billes rebondissent dessus
const ROULETTE = { x: 126, y: 168, l: 108, h: 80 };
const MURS_ROULETTE = segmentsDe([
  [ROULETTE.x, ROULETTE.y + 14], [ROULETTE.x + 14, ROULETTE.y],
  [ROULETTE.x + ROULETTE.l - 14, ROULETTE.y], [ROULETTE.x + ROULETTE.l, ROULETTE.y + 14],
  [ROULETTE.x + ROULETTE.l, ROULETTE.y + ROULETTE.h], [ROULETTE.x, ROULETTE.y + ROULETTE.h]
], true);

// Les poches : une bouche entre deux plots, et une zone de capture juste dessous
const POCHES = [
  { type: "start", x: 180, y: 384, demiLargeur: 13 },
  { type: "poche", x: 46, y: 330, demiLargeur: 8 },
  { type: "poche", x: 314, y: 330, demiLargeur: 8 },
  { type: "tulipe", x: 96, y: 470, demiLargeur: 7, ouverte: false, reste: 0 },
  { type: "tulipe", x: 264, y: 470, demiLargeur: 7, ouverte: false, reste: 0 }
];
const TRAPPE = { x: 180, y: 548, demiLargeur: 30 };

// Deflecteurs le long des deux bords : sans eux, une bille qui longe le
// mur descendrait tout droit sans toucher un clou
const DEFLECTEURS = [];
for (let y = 270; y < 580; y += 62) {
  DEFLECTEURS.push([8, y, 24, y + 10]);
  DEFLECTEURS.push([RAIL_INTERIEUR, y + 31, RAIL_INTERIEUR - 16, y + 41]);
}
MURS.push(...DEFLECTEURS);

// Distance d'un point a un segment
function distanceSegment(x, y, s) {
  const dx = s[2] - s[0];
  const dy = s[3] - s[1];
  const t = Math.max(0, Math.min(1, ((x - s[0]) * dx + (y - s[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - (s[0] + t * dx), y - (s[1] + t * dy));
}

// Zones sans clous : roulette, poches, trappe, deflecteurs, exterieur de l'arc.
// Autour d'un deflecteur on laisse assez de place pour qu'une bille ne
// puisse jamais se coincer entre lui, le mur et un clou.
function sansClou(x, y) {
  if (DEFLECTEURS.some(d => distanceSegment(x, y, d) < 13)) {
    return true;
  }
  if (x > ROULETTE.x - 10 && x < ROULETTE.x + ROULETTE.l + 10 && y > ROULETTE.y - 10 && y < ROULETTE.y + ROULETTE.h + 12) {
    return true;
  }
  for (const p of POCHES) {
    if (Math.abs(x - p.x) < p.demiLargeur + 6 && y > p.y - 10 && y < p.y + 14) {
      return true;
    }
  }
  if (Math.abs(x - TRAPPE.x) < TRAPPE.demiLargeur + 8 && y > TRAPPE.y - 14) {
    return true;
  }
  if (y < CENTRE_ARC.y && Math.hypot(x - CENTRE_ARC.x, y - CENTRE_ARC.y) > CENTRE_ARC.r - 14) {
    return true;
  }
  return x < 18 || x > RAIL_INTERIEUR - 10 || y < 74 || y > 580;
}

// Les clous ne forment pas une grille : comme sur une vraie machine, ils
// dessinent des structures qui guident la bille. Un toit sous l'arc, deux
// glissieres qui menent vers la poche start, des entonnoirs au-dessus de
// chaque poche, des bouquets de sept clous qui dispersent, et un dernier
// jardin en quinconce avant la sortie.
function creerClous() {
  const clous = [];
  const ajouter = (x, y) => {
    if (sansClou(x, y) || clous.some(c => Math.hypot(c.x - x, c.y - y) < 9)) {
      return;
    }
    clous.push({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 });
  };
  const ligne = (x1, y1, x2, y2, nombre) => {
    for (let i = 0; i < nombre; i++) {
      const t = nombre === 1 ? 0 : i / (nombre - 1);
      ajouter(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t);
    }
  };

  // 1. Le toit : deux rangees sous l'arc, la seconde percee de portes
  [CENTRE_ARC.r - 24, CENTRE_ARC.r - 38].forEach((r, rang) => {
    const pas = 15 / r;
    let i = 0;
    for (let angle = Math.PI * 1.16; angle <= Math.PI * 1.84; angle += pas, i++) {
      // Des portes dans chaque rangee : une partie des billes tombe au centre
      if ((rang === 0 && i % 5 === 3) || (rang === 1 && i % 4 === 1)) {
        continue;
      }
      ajouter(CENTRE_ARC.x + Math.cos(angle) * r, CENTRE_ARC.y + Math.sin(angle) * r);
    }
  });

  // 2. Les glissieres sous la roulette, vers la poche start
  ligne(ROULETTE.x - 4, ROULETTE.y + ROULETTE.h + 14, 160, 352, 6);
  ligne(ROULETTE.x + ROULETTE.l + 4, ROULETTE.y + ROULETTE.h + 14, 200, 352, 6);

  // 3. Un entonnoir au-dessus de chaque poche et de chaque tulipe
  // Les poches de cote n'ont qu'un demi-entonnoir, cote mur : sinon toutes
  // les billes qui longent l'arc y tomberaient et la machine paierait trop
  POCHES.forEach(p => {
    if (p.type === "start") {
      return;
    }
    if (p.type === "poche") {
      const versLeMur = p.x < LARGEUR / 2 ? -1 : 1;
      ligne(p.x + versLeMur * 24, p.y - 38, p.x + versLeMur * (p.demiLargeur + 5), p.y - 10, 4);
      ligne(p.x - versLeMur * 14, p.y - 44, p.x - versLeMur * 26, p.y - 20, 3);
      return;
    }
    // Les tulipes n'ont qu'une paire de clous gardiens : elles paient
    // beaucoup, elles doivent rester difficiles a atteindre
    ajouter(p.x - p.demiLargeur - 6, p.y - 14);
    ajouter(p.x + p.demiLargeur + 6, p.y - 14);
  });

  // 4. Les bouquets : un clou au centre, six autour
  [[56, 268], [304, 268], [118, 420], [242, 420], [180, 452], [52, 522], [308, 522]].forEach(([cx, cy]) => {
    ajouter(cx, cy);
    for (let k = 0; k < 6; k++) {
      const angle = k * Math.PI / 3;
      ajouter(cx + Math.cos(angle) * 12, cy + Math.sin(angle) * 12);
    }
  });

  // 5. Le dernier jardin, en quinconce, juste avant la sortie
  [498, 516].forEach((y, rang) => {
    for (let x = 30 + rang * 12; x < RAIL_INTERIEUR - 10; x += 24) {
      ajouter(x, y);
    }
  });

  // Les plots de chaque poche, qui en forment la bouche
  POCHES.forEach(p => {
    p.plotGauche = { x: p.x - p.demiLargeur, y: p.y };
    p.plotDroit = { x: p.x + p.demiLargeur, y: p.y };
  });
  // Deux clous en entonnoir au-dessus de la poche start
  clous.push({ x: 160, y: 366 }, { x: 200, y: 366 });
  return clous;
}

const CLOUS = creerClous();

// Grille de clous par cases, pour ne tester que le voisinage d'une bille
const CASE = 24;
const GRILLE = new Map();
CLOUS.forEach(c => {
  const cle = Math.floor(c.x / CASE) + "," + Math.floor(c.y / CASE);
  if (!GRILLE.has(cle)) {
    GRILLE.set(cle, []);
  }
  GRILLE.get(cle).push(c);
});

function clousAutour(x, y) {
  const cx = Math.floor(x / CASE);
  const cy = Math.floor(y / CASE);
  const liste = [];
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      const g = GRILLE.get((cx + i) + "," + (cy + j));
      if (g) {
        liste.push(...g);
      }
    }
  }
  return liste;
}

// ---------------------------------------------------------------------
// Symboles de la roulette, en pixels 8 x 8
// ---------------------------------------------------------------------

const SYMBOLES = ["sept", "tanuki", "daruma", "lanterne", "koban"];
// ---------------------------------------------------------------------
// Etat
// ---------------------------------------------------------------------

const effets = creerEffets();
let etat = null;
const commandes = { charge: false, rafale: false, plus: false, moins: false };
let doigt = null;   // { x } pendant un appui au doigt

function nouvelEtat() {
  return {
    reserve: BILLES_DEPART,
    pic: BILLES_DEPART,
    aVerser: 0,             // billes gagnees qui tombent une a une dans le bac
    billes: [],
    force: 0.55,
    charge: 0,
    enCharge: false,
    minuteurRafale: 0,
    tirs: 0,
    rouleaux: { tourne: false, t: 0, fins: [0, 0, 0], resultat: [0, 1, 2], affiche: [0, 1, 2] },
    attente: 0,
    fievre: 0,
    kakuhen: 0,
    kakuhenAVenir: 0,
    poches: POCHES.map(p => ({ ...p, ouverte: false, reste: 0, eclat: 0 })),
    message: null,
    pause: false,
    termine: false,
    temps: 0
  };
}

// ---------------------------------------------------------------------
// Lancer
// ---------------------------------------------------------------------

function lancer(force) {
  if (etat.termine || etat.reserve <= 0 || etat.billes.length >= MAX_BILLES_EN_JEU) {
    return;
  }
  etat.reserve--;
  etat.tirs++;
  const vitesse = LANCER_MIN + (LANCER_MAX - LANCER_MIN) * force;
  etat.billes.push({
    x: (RAIL_INTERIEUR + RAIL_EXTERIEUR) / 2,
    y: 600,
    vx: 0,
    vy: -vitesse * (0.985 + Math.random() * 0.03),
    r: RAYON_BILLE,
    dansLeRail: true
  });
  jouer("clic");
  majHud();
}

// ---------------------------------------------------------------------
// Gains
// ---------------------------------------------------------------------

function gagner(nombre, x, y, couleur) {
  etat.aVerser += nombre;
  effets.flotter(x, y - 8, "+" + nombre, couleur || "#c8f060", 10);
}

function capturer(bille, poche) {
  bille.capturee = true;
  poche.eclat = 0.4;
  effets.eclater(poche.x, poche.y, [PAPIER, "#c8f060"], 6, 60);
  if (poche.type === "start") {
    gagner(GAINS.start, poche.x, poche.y);
    if (etat.attente < 4) {
      etat.attente++;
    }
    jouer("bonus");
  } else if (poche.type === "poche") {
    gagner(GAINS.poche, poche.x, poche.y);
    jouer("grain");
  } else if (poche.type === "tulipe") {
    gagner(GAINS.tulipe, poche.x, poche.y);
    jouer("bonus");
    // Fermee, elle s'ouvre ; ouverte, elle avale deux billes puis se referme
    if (!poche.ouverte) {
      poche.ouverte = true;
      poche.reste = 2;
    } else if (--poche.reste <= 0) {
      poche.ouverte = false;
    }
  }
  majHud();
}

// ---------------------------------------------------------------------
// Roulette
// ---------------------------------------------------------------------

function tirerResultat() {
  const r = Math.random();
  if (r < (etat.kakuhen > 0 ? PROBA_JACKPOT_KAKUHEN : PROBA_JACKPOT)) {
    return [0, 0, 0];
  }
  if (r < PROBA_JACKPOT + PROBA_BRELAN) {
    const s = 1 + Math.floor(Math.random() * (SYMBOLES.length - 1));
    return [s, s, s];
  }
  // Perdu, mais parfois avec une « reach » : deux identiques qui font esperer
  const a = Math.floor(Math.random() * SYMBOLES.length);
  const b = Math.random() < 0.3 ? a : Math.floor(Math.random() * SYMBOLES.length);
  let c = Math.floor(Math.random() * SYMBOLES.length);
  if (a === b && c === a) {
    c = (c + 1) % SYMBOLES.length;
  }
  return [a, b, c];
}

function lancerRoulette() {
  const rl = etat.rouleaux;
  rl.resultat = tirerResultat();
  if (etat.kakuhen > 0) {
    etat.kakuhen--;
  }
  rl.tourne = true;
  rl.t = 0;
  const reach = rl.resultat[0] === rl.resultat[1];
  rl.fins = [0.9, 1.35, reach ? 2.8 : 1.85];
  rl.reach = reach;
  etat.attente--;
  majHud();
}

function majRoulette(delta) {
  const rl = etat.rouleaux;
  if (!rl.tourne) {
    if (etat.attente > 0 && etat.fievre <= 0) {
      lancerRoulette();
    }
    return;
  }
  rl.t += delta;
  for (let i = 0; i < 3; i++) {
    if (rl.t < rl.fins[i]) {
      // Le rouleau defile : le symbole affiche change tres vite
      rl.affiche[i] = Math.floor(rl.t * 18 + i * 2) % SYMBOLES.length;
    } else {
      if (rl.affiche[i] !== rl.resultat[i]) {
        jouer("clic");
      }
      rl.affiche[i] = rl.resultat[i];
    }
  }
  if (rl.t >= rl.fins[2] + 0.2) {
    rl.tourne = false;
    const [a, b, c] = rl.resultat;
    if (a === b && b === c) {
      if (a === 0) {
        jackpot();
      } else {
        gagner(GAINS.brelan, 180, ROULETTE.y + ROULETTE.h + 10, "#e8c547");
        etat.message = { texte: "Brelan", age: 0, duree: 1.2 };
        jouer("pouvoir");
      }
    }
  }
}

function jackpot() {
  etat.fievre = DUREE_FIEVRE;
  etat.kakuhenAVenir = TOURS_KAKUHEN;
  gagner(PLUIE_JACKPOT, 180, ROULETTE.y + ROULETTE.h + 10, "#e8c547");
  etat.message = { texte: "Fièvre 777", age: 0, duree: 2.2 };
  effets.secouer(5, 0.5);
  for (let i = 0; i < 4; i++) {
    effets.eclater(130 + i * 34, ROULETTE.y + 40, ["#e8c547", VERMILLON, PAPIER], 14, 180);
  }
  jouer("vie");
}

// ---------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------

function pas(dt) {
  const billes = etat.billes.filter(b => !b.capturee && !b.perdue);

  // 1. Mouvement
  for (const b of billes) {
    b.vy += GRAVITE * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
  }

  // 2. Les billes se cognent entre elles. On le fait AVANT les murs :
  // un choc peut pousser une bille contre un mur, et le mur doit avoir
  // le dernier mot, sinon elle passerait au travers.
  for (let i = 0; i < billes.length; i++) {
    for (let j = i + 1; j < billes.length; j++) {
      chocBilles(billes[i], billes[j], 0.5);
    }
  }

  // 3. Murs, clous, poches
  for (const b of billes) {
    if (b.dansLeRail) {
      if (b.y < HAUT_RAIL - 26) {
        b.dansLeRail = false;
      }
    } else if (b.x > RAIL_INTERIEUR - 8 && b.y < HAUT_RAIL + 6) {
      rebondSegment(b, CLAPET[0], CLAPET[1], CLAPET[2], CLAPET[3], REST_MUR);
    }

    if (!b.dansLeRail) {
      for (const m of MURS_ROULETTE) {
        rebondSegment(b, m[0], m[1], m[2], m[3], REST_MUR);
      }
      for (const c of clousAutour(b.x, b.y)) {
        if (rebondCercle(b, c.x, c.y, RAYON_CLOU, REST_CLOU)) {
          // Un rien de hasard : deux billes ne suivent jamais le meme chemin
          b.vx += (Math.random() - 0.5) * 8;
        }
      }
      for (const p of etat.poches) {
        const ecart = p.type === "tulipe" && p.ouverte ? p.demiLargeur + 4 : p.demiLargeur;
        rebondCercle(b, p.x - ecart, p.y, 2.4, REST_CLOU);
        rebondCercle(b, p.x + ecart, p.y, 2.4, REST_CLOU);
        if (Math.abs(b.x - p.x) < ecart - 1 && b.y > p.y && b.y < p.y + 8 && b.vy > 0) {
          capturer(b, p);
          break;
        }
      }
      if (b.capturee) {
        continue;
      }
      // La trappe : fermee c'est un couvercle, ouverte elle avale tout
      if (etat.fievre > 0) {
        if (Math.abs(b.x - TRAPPE.x) < TRAPPE.demiLargeur && b.y > TRAPPE.y && b.y < TRAPPE.y + 10) {
          b.capturee = true;
          gagner(GAINS.trappe, b.x, TRAPPE.y, "#e8c547");
          jouer("grain");
          continue;
        }
      } else {
        rebondSegment(b, TRAPPE.x - TRAPPE.demiLargeur, TRAPPE.y, TRAPPE.x + TRAPPE.demiLargeur, TRAPPE.y, REST_MUR);
      }
    }

    // Une bille immobile hors du rail (calee contre un clou et un mur)
    // recoit une petite pichenette, comme un joueur qui tape la vitre
    if (!b.dansLeRail && Math.abs(b.vx) + Math.abs(b.vy) < 12) {
      b.immobile = (b.immobile || 0) + dt;
      if (b.immobile > 1.2) {
        b.vx += (Math.random() < 0.5 ? -1 : 1) * 60;
        b.vy -= 40;
        b.immobile = 0;
      }
    } else {
      b.immobile = 0;
    }

    // Les murs en dernier : ils ont toujours raison
    for (const m of MURS) {
      rebondSegment(b, m[0], m[1], m[2], m[3], REST_MUR);
    }
    plafonner(b, VITESSE_MAX);

    if (b.dansLeRail && b.y > 600 && b.vy > 0 && Math.abs(b.vy) < 40) {
      // Bille trop faible, retombee au fond du rail : elle revient au bac
      b.perdue = true;
      etat.reserve++;
    } else if (b.y > BAS) {
      b.perdue = true;
    }
  }
}

function maj(delta) {
  if (etat === null || etat.pause) {
    return;
  }
  effets.maj(delta);
  if (etat.message) {
    etat.message.age += delta;
    if (etat.message.age > etat.message.duree) {
      etat.message = null;
    }
  }
  if (etat.termine) {
    return;
  }
  etat.temps += delta;

  // Force : Haut/Bas la reglent, le doigt la choisit par sa position
  if (commandes.plus) {
    etat.force = Math.min(1, etat.force + delta * 0.6);
  }
  if (commandes.moins) {
    etat.force = Math.max(0, etat.force - delta * 0.6);
  }
  if (doigt !== null) {
    etat.force = Math.max(0, Math.min(1, (doigt.x - 30) / (LARGEUR - 60)));
  }

  // Maintenir A charge la force ; relacher lance
  if (commandes.charge) {
    etat.enCharge = true;
    etat.charge = Math.min(1, etat.charge + delta * CHARGE_PAR_SECONDE);
  } else if (etat.enCharge) {
    etat.enCharge = false;
    etat.force = etat.charge;
    lancer(etat.charge);
    etat.charge = 0;
  }

  // Rafale : B maintenu ou doigt pose
  etat.minuteurRafale -= delta;
  if ((commandes.rafale || doigt !== null) && etat.minuteurRafale <= 0) {
    etat.minuteurRafale = CADENCE_RAFALE;
    lancer(etat.force);
  }

  const dt = delta / SOUS_PAS;
  for (let i = 0; i < SOUS_PAS; i++) {
    pas(dt);
  }
  etat.billes = etat.billes.filter(b => !b.capturee && !b.perdue);

  // Les gains tombent dans le bac une bille a la fois
  if (etat.aVerser > 0) {
    const n = Math.min(etat.aVerser, Math.max(1, Math.ceil(etat.aVerser * delta * 6)));
    etat.aVerser -= n;
    etat.reserve += n;
    if (etat.reserve > etat.pic) {
      etat.pic = etat.reserve;
      majScoreCourant(ID, etat.pic);
    }
    majHud();
  }

  etat.poches.forEach(p => { p.eclat = Math.max(0, p.eclat - delta); });
  if (etat.fievre > 0) {
    etat.fievre = Math.max(0, etat.fievre - delta);
    if (etat.fievre === 0 && etat.kakuhenAVenir > 0) {
      // Fin de fievre : on entre en kakuhen, le prochain 777 est plus proche
      etat.kakuhen = etat.kakuhenAVenir;
      etat.kakuhenAVenir = 0;
      etat.message = { texte: "Kakuhen !", age: 0, duree: 1.8 };
      jouer("pouvoir");
    }
  }
  majRoulette(delta);

  // Plus de billes, plus rien en jeu ni en attente : la partie s'arrete
  if (etat.reserve <= 0 && etat.billes.length === 0 && etat.aVerser === 0
    && !etat.rouleaux.tourne && etat.attente === 0 && etat.fievre <= 0) {
    terminer("Le bac est vide");
  }
}

function terminer(texte) {
  if (etat.termine) {
    return;
  }
  etat.termine = true;
  etat.message = { texte, age: 0, duree: 99 };
  majHud();
  setTimeout(() => {
    if (etat !== null && etat.termine && !zone.hidden) {
      finDePartie(ID, etat.pic);
    }
  }, 1300);
}

// ---------------------------------------------------------------------
// Dessin : une vraie machine vue de face
//  Cadre chrome, vitre, plateau imprime, ecran a trois rouleaux,
//  clous de laiton, tulipes, trappe, bac de billes et poignee.
//  Le plateau garde ses coordonnees de 360 x 620 : on le dessine
//  decale de (OX, OY) dans la machine.
// ---------------------------------------------------------------------

const W = 440;
const H = 800;
const OX = 40;
const OY = 2;
const BAC = { x: 40, y: 644, l: 250, h: 70 };
const POIGNEE = { x: 362, y: 714, r: 40 };

let echelle = 1;
let fondPachi = null;
let tempsPachi = 0;
let prochainAjustement = 0;

function degrade(g, x0, y0, x1, y1, arrets) {
  const d = g.createLinearGradient(x0, y0, x1, y1);
  arrets.forEach(([o, c]) => d.addColorStop(o, c));
  return d;
}

function contourPlateau(g) {
  g.beginPath();
  g.moveTo(8, 612);
  g.lineTo(8, CENTRE_ARC.y);
  g.arc(CENTRE_ARC.x, CENTRE_ARC.y, CENTRE_ARC.r, Math.PI, Math.PI * 2);
  g.lineTo(RAIL_EXTERIEUR, 612);
  g.closePath();
}

function peindreMachine() {
  const off = document.createElement("canvas");
  off.width = Math.round(W * echelle);
  off.height = Math.round(H * echelle);
  const g = off.getContext("2d");
  g.setTransform(echelle, 0, 0, echelle, 0, 0);

  // Caisse de la machine : laque blanche nacree, bordures chromees
  g.fillStyle = degrade(g, 0, 0, W, 0, [[0, "#b9bcc6"], [0.08, "#f2f3f6"], [0.5, "#dfe1e8"], [0.92, "#f2f3f6"], [1, "#9a9daa"]]);
  g.beginPath();
  g.roundRect(0, 0, W, H, 22);
  g.fill();
  // Facade laquee rouge autour du plateau, filet d'or
  g.fillStyle = degrade(g, 0, 14, 0, H - 14, [[0, "#9a2a20"], [1, "#5c140e"]]);
  g.beginPath();
  g.roundRect(14, 14, W - 28, H - 28, 16);
  g.fill();
  g.strokeStyle = "rgba(232,197,71,0.7)";
  g.lineWidth = 1.5;
  g.beginPath();
  g.roundRect(22, 22, W - 44, H - 44, 12);
  g.stroke();

  // Fronton : la plaque du nom, rouge et or
  g.fillStyle = degrade(g, 0, 18, 0, 58, [[0, "#e0574b"], [1, "#8e1d14"]]);
  g.beginPath();
  g.roundRect(70, 18, W - 140, 38, 12);
  g.fill();
  g.strokeStyle = "#e8c547";
  g.lineWidth = 2;
  g.stroke();
  g.font = "800 20px 'Anybody', sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = "#fff3cf";
  g.fillText("TANUKI MATSURI", W / 2, 38);

  // Fond du plateau, imprime : nuit de fete, grand soleil, vagues
  g.save();
  g.translate(OX, OY);
  contourPlateau(g);
  g.clip();
  g.fillStyle = degrade(g, 0, 0, 0, 620, [[0, "#1d1a4a"], [0.55, "#3a1f5c"], [1, "#5c2244"]]);
  g.fillRect(0, 0, 360, 620);
  g.fillStyle = "#a83228";
  g.beginPath();
  g.arc(180, 210, 140, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#c8443a";
  g.beginPath();
  g.arc(180, 210, 112, 0, Math.PI * 2);
  g.fill();
  // Vagues du bas
  [["#2b2a6e", 520], ["#3a3a8a", 548], ["#22205a", 578]].forEach(([coul, y], k) => {
    g.fillStyle = coul;
    g.beginPath();
    g.moveTo(0, 620);
    for (let x = 0; x <= 360; x += 30) {
      g.quadraticCurveTo(x + 15, y - 14 + k * 2, x + 30, y);
    }
    g.lineTo(360, 620);
    g.closePath();
    g.fill();
  });
  g.restore();

  // Rail chrome de l'arc et du lanceur
  g.save();
  g.translate(OX, OY);
  g.lineCap = "round";
  g.strokeStyle = "#6b6e7a";
  g.lineWidth = 7;
  contourPlateau(g);
  g.stroke();
  g.strokeStyle = "#e4e6ec";
  g.lineWidth = 3;
  contourPlateau(g);
  g.stroke();
  g.strokeStyle = "#a9acb8";
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(RAIL_INTERIEUR, 612);
  g.lineTo(RAIL_INTERIEUR, HAUT_RAIL);
  g.stroke();
  // Deflecteurs des bords : petites lames chromees
  g.strokeStyle = "#d9dbe2";
  g.lineWidth = 2.5;
  DEFLECTEURS.forEach(m => {
    g.beginPath();
    g.moveTo(m[0], m[1]);
    g.lineTo(m[2], m[3]);
    g.stroke();
  });
  // Clous de laiton : tete ronde, ombre, reflet ; ils suivent les structures du plateau
  CLOUS.forEach(c => {
    g.fillStyle = "rgba(0,0,0,0.45)";
    g.beginPath();
    g.arc(c.x + 0.8, c.y + 1.2, 2.3, 0, Math.PI * 2);
    g.fill();
    const tete = g.createRadialGradient(c.x - 0.8, c.y - 0.8, 0.2, c.x, c.y, 2.4);
    tete.addColorStop(0, "#fff4c4");
    tete.addColorStop(0.5, "#d8b64e");
    tete.addColorStop(1, "#7a5c16");
    g.fillStyle = tete;
    g.beginPath();
    g.arc(c.x, c.y, 2.2, 0, Math.PI * 2);
    g.fill();
  });
  g.restore();

  // Vitre : deux reflets en diagonale, tres discrets
  g.save();
  g.translate(OX, OY);
  contourPlateau(g);
  g.clip();
  g.fillStyle = "rgba(255,255,255,0.05)";
  g.beginPath();
  g.moveTo(40, 0);
  g.lineTo(110, 0);
  g.lineTo(-20, 300);
  g.lineTo(-20, 200);
  g.closePath();
  g.fill();
  g.beginPath();
  g.moveTo(140, 0);
  g.lineTo(160, 0);
  g.lineTo(10, 340);
  g.lineTo(-10, 340);
  g.closePath();
  g.fill();
  g.restore();

  // Le bas de la machine : bac a billes et socle de la poignee
  g.fillStyle = degrade(g, 0, 628, 0, H, [[0, "#e9ebf0"], [1, "#b2b5c0"]]);
  g.beginPath();
  g.roundRect(28, 628, W - 56, H - 656, 14);
  g.fill();
  g.fillStyle = "#2a2838";
  g.beginPath();
  g.roundRect(BAC.x, BAC.y, BAC.l, BAC.h, 30);
  g.fill();
  g.fillStyle = "#141320";
  g.beginPath();
  g.roundRect(BAC.x + 6, BAC.y + 6, BAC.l - 12, BAC.h - 12, 26);
  g.fill();
  g.fillStyle = "#6b6e7a";
  g.font = "600 8px 'Martian Mono', monospace";
  g.textAlign = "left";
  g.fillText("BILLES", BAC.x + 10, BAC.y + BAC.h + 14);
  // Socle chrome de la poignee
  g.fillStyle = "#8a8d99";
  g.beginPath();
  g.arc(POIGNEE.x, POIGNEE.y, POIGNEE.r + 8, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = degrade(g, POIGNEE.x - 40, POIGNEE.y - 40, POIGNEE.x + 40, POIGNEE.y + 40, [[0, "#f6f7fa"], [1, "#7d808c"]]);
  g.beginPath();
  g.arc(POIGNEE.x, POIGNEE.y, POIGNEE.r + 4, 0, Math.PI * 2);
  g.fill();
  // Graduation de la force autour de la poignee
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI * 0.8 + (i / 10) * Math.PI * 1.4;
    g.strokeStyle = i >= 4 ? "#c8372d" : "#4a4d58";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(POIGNEE.x + Math.cos(a) * (POIGNEE.r + 10), POIGNEE.y + Math.sin(a) * (POIGNEE.r + 10));
    g.lineTo(POIGNEE.x + Math.cos(a) * (POIGNEE.r + 16), POIGNEE.y + Math.sin(a) * (POIGNEE.r + 16));
    g.stroke();
  }
  return off;
}

// Symboles des rouleaux, dessines en vectoriel
function symbole(g, s, x, y, t) {
  g.save();
  g.translate(x, y);
  g.scale(t / 30, t / 30);
  g.textAlign = "center";
  g.textBaseline = "middle";
  if (s === "sept") {
    g.font = "900 34px 'Anybody', sans-serif";
    g.lineWidth = 5;
    g.strokeStyle = "#8a5d06";
    g.strokeText("7", 0, 2);
    g.fillStyle = "#e0412f";
    g.fillText("7", 0, 2);
  } else if (s === "tanuki") {
    g.fillStyle = "#8a6a4a";
    g.beginPath();
    g.arc(0, 2, 12, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(-11, -4);
    g.lineTo(-8, -14);
    g.lineTo(-2, -9);
    g.moveTo(11, -4);
    g.lineTo(8, -14);
    g.lineTo(2, -9);
    g.fill();
    g.fillStyle = "#3a2a1e";
    g.beginPath();
    g.ellipse(-5, 1, 4.5, 3.5, 0, 0, Math.PI * 2);
    g.ellipse(5, 1, 4.5, 3.5, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#fff";
    g.fillRect(-6, 0, 2, 2);
    g.fillRect(4, 0, 2, 2);
    g.fillStyle = "#f1e6d6";
    g.beginPath();
    g.ellipse(0, 8, 5, 3.5, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#1a1018";
    g.fillRect(-1.5, 6, 3, 2);
  } else if (s === "daruma") {
    g.fillStyle = "#d42a1c";
    g.beginPath();
    g.ellipse(0, 1, 12, 14, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#fbefd8";
    g.beginPath();
    g.ellipse(0, -2, 8, 7, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#1a1018";
    g.beginPath();
    g.arc(-3, -2, 2, 0, Math.PI * 2);
    g.arc(3, -2, 2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#e8b83a";
    g.fillRect(-5, 8, 10, 3);
  } else if (s === "lanterne") {
    g.fillStyle = "#1a1018";
    g.fillRect(-6, -14, 12, 3);
    g.fillRect(-6, 11, 12, 3);
    g.fillStyle = "#f08a24";
    g.beginPath();
    g.ellipse(0, 0, 10, 12, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#c8261a";
    g.font = "700 11px 'Shippori Mincho B1', serif";
    g.fillText("祭", 0, 1);
  } else {
    g.fillStyle = "#e8c547";
    g.beginPath();
    g.ellipse(0, 0, 9, 13, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#8a5d06";
    g.lineWidth = 1.5;
    g.stroke();
    g.beginPath();
    g.moveTo(-5, -6);
    g.lineTo(5, -6);
    g.moveTo(-5, 0);
    g.lineTo(5, 0);
    g.moveTo(-5, 6);
    g.lineTo(5, 6);
    g.stroke();
  }
  g.restore();
}

function dessinerPoche(p) {
  const ouverte = p.type === "tulipe" && p.ouverte;
  const eclat = p.eclat > 0;
  const c = contexte;
  if (p.type === "start") {
    // Le "chucker" central : une coupe doree qui avale la bille
    c.fillStyle = "rgba(0,0,0,0.35)";
    c.beginPath();
    c.ellipse(p.x + 1, p.y + 9, 16, 5, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = degrade(c, p.x - 16, 0, p.x + 16, 0, [[0, "#8a5d06"], [0.4, eclat ? "#ffffff" : "#ffe08a"], [1, "#8a5d06"]]);
    c.beginPath();
    c.moveTo(p.x - 17, p.y - 2);
    c.lineTo(p.x + 17, p.y - 2);
    c.lineTo(p.x + 11, p.y + 10);
    c.lineTo(p.x - 11, p.y + 10);
    c.closePath();
    c.fill();
    c.fillStyle = "#1a0e04";
    c.beginPath();
    c.ellipse(p.x, p.y - 2, 13, 3.5, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#c6f35a";
    c.font = "800 7px 'Anybody', sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("START", p.x, p.y + 17);
  } else if (p.type === "poche") {
    c.fillStyle = eclat ? "#ffffff" : "#5a8fa8";
    c.beginPath();
    c.moveTo(p.x - 10, p.y - 3);
    c.lineTo(p.x + 10, p.y - 3);
    c.lineTo(p.x + 7, p.y + 7);
    c.lineTo(p.x - 7, p.y + 7);
    c.closePath();
    c.fill();
    c.fillStyle = "#0c1a24";
    c.beginPath();
    c.ellipse(p.x, p.y - 3, 8, 2.5, 0, 0, Math.PI * 2);
    c.fill();
  } else {
    // Tulipe : deux petales qui s'ecartent quand elle s'ouvre
    const angle = ouverte ? 0.75 : 0.12;
    [-1, 1].forEach(sens => {
      c.save();
      c.translate(p.x + sens * 4, p.y + 4);
      c.rotate(sens * angle);
      c.fillStyle = eclat ? "#ffffff" : ouverte ? "#ffd23a" : "#e0412f";
      c.beginPath();
      c.moveTo(0, 0);
      c.quadraticCurveTo(sens * 9, -6, sens * 3, -16);
      c.quadraticCurveTo(sens * -1, -8, 0, 0);
      c.fill();
      c.restore();
    });
    c.fillStyle = "#3f6912";
    c.fillRect(p.x - 1, p.y + 4, 2, 8);
    c.fillStyle = "#7fbf2a";
    c.beginPath();
    c.ellipse(p.x - 4, p.y + 9, 4, 1.8, -0.4, 0, Math.PI * 2);
    c.fill();
  }
}

function dessinerTrappe() {
  const c = contexte;
  const ouverte = etat.fievre > 0;
  const t = TRAPPE;
  // Cadre de la trappe ("attacker") : une boite chromee avec un V
  c.fillStyle = "#6b6e7a";
  c.beginPath();
  c.roundRect(t.x - t.demiLargeur - 8, t.y - 6, t.demiLargeur * 2 + 16, 24, 6);
  c.fill();
  c.fillStyle = "#12101c";
  c.fillRect(t.x - t.demiLargeur, t.y - 2, t.demiLargeur * 2, 16);
  if (ouverte) {
    // Le volet bascule vers l'avant : on voit son dessous dore
    c.fillStyle = "#e8c547";
    c.beginPath();
    c.moveTo(t.x - t.demiLargeur, t.y + 14);
    c.lineTo(t.x + t.demiLargeur, t.y + 14);
    c.lineTo(t.x + t.demiLargeur + 6, t.y + 26);
    c.lineTo(t.x - t.demiLargeur - 6, t.y + 26);
    c.closePath();
    c.fill();
    c.fillStyle = "#8a5d06";
    c.font = "800 8px 'Anybody', sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("OUVERT", t.x, t.y + 21);
  } else {
    c.fillStyle = degrade(c, 0, t.y - 2, 0, t.y + 14, [[0, "#e4e6ec"], [1, "#8a8d99"]]);
    c.fillRect(t.x - t.demiLargeur, t.y - 2, t.demiLargeur * 2, 16);
    c.fillStyle = "#c8372d";
    c.font = "800 10px 'Anybody', sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("V", t.x, t.y + 6);
  }
}

function dessinerEcran() {
  const c = contexte;
  const rl = etat.rouleaux;
  const r = ROULETTE;
  const fievre = etat.fievre > 0;
  const kakuhen = etat.kakuhen > 0;
  // Bezel chrome autour de l'ecran
  const forme = (marge) => {
    c.beginPath();
    c.moveTo(r.x - marge, r.y + 14);
    c.lineTo(r.x + 14 - marge * 0.4, r.y - marge);
    c.lineTo(r.x + r.l - 14 + marge * 0.4, r.y - marge);
    c.lineTo(r.x + r.l + marge, r.y + 14);
    c.lineTo(r.x + r.l + marge, r.y + r.h + marge);
    c.lineTo(r.x - marge, r.y + r.h + marge);
    c.closePath();
  };
  forme(5);
  c.fillStyle = degrade(c, r.x, r.y - 5, r.x, r.y + r.h + 5, [[0, "#f2f3f6"], [1, "#7d808c"]]);
  c.fill();
  forme(0);
  // Fond de l'ecran : nuit, ou rouge et or pendant la fievre
  c.fillStyle = fievre
    ? (Math.floor(tempsPachi * 4) % 2 ? "#8e1d14" : "#c8372d")
    : kakuhen ? "#3d1a5c" : "#0c0c1e";
  c.fill();
  // Les trois rouleaux : le symbole d'avant et d'apres defilent au-dessus et au-dessous
  for (let i = 0; i < 3; i++) {
    const x = r.x + 8 + i * 32;
    const y = r.y + 20;
    c.fillStyle = "#fbf3e2";
    c.beginPath();
    c.roundRect(x, y, 28, 36, 4);
    c.fill();
    c.save();
    c.beginPath();
    c.roundRect(x, y, 28, 36, 4);
    c.clip();
    const tourne = rl.tourne && rl.t < rl.fins[i];
    const decal = tourne ? ((rl.t * 18 + i * 2) % 1) * 30 : 0;
    const idx = rl.affiche[i];
    [-1, 0, 1].forEach(k => {
      const s = SYMBOLES[(idx - k + SYMBOLES.length * 3) % SYMBOLES.length];
      symbole(c, s, x + 14, y + 18 + k * 30 + decal - (tourne ? 15 : 0), 26);
    });
    // Ombre du cylindre en haut et en bas : le rouleau a du volume
    c.fillStyle = "rgba(0,0,0,0.28)";
    c.fillRect(x, y, 28, 5);
    c.fillRect(x, y + 31, 28, 5);
    c.restore();
  }
  // Reach : le troisieme rouleau est encadre pendant qu'on espere
  if (rl.tourne && rl.reach && rl.t > rl.fins[1]) {
    c.strokeStyle = Math.floor(rl.t * 8) % 2 ? "#e0412f" : "#ffd23a";
    c.lineWidth = 2.5;
    c.strokeRect(r.x + 71, r.y + 18, 32, 40);
    c.fillStyle = "#ffd23a";
    c.font = "800 9px 'Anybody', sans-serif";
    c.textAlign = "center";
    c.fillText("REACH !", r.x + r.l / 2, r.y + 12);
  } else {
    c.fillStyle = fievre ? "#fff3cf" : kakuhen ? "#ffd23a" : "#a9a3b8";
    c.font = "800 8px 'Anybody', sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(fievre ? "FIÈVRE " + Math.ceil(etat.fievre) + " s" : kakuhen ? "KAKUHEN x" + etat.kakuhen : "パチンコ", r.x + r.l / 2, r.y + 11);
  }
  // Tours de roulette en reserve
  for (let i = 0; i < 4; i++) {
    c.fillStyle = i < etat.attente ? "#c6f35a" : "#2a2a3a";
    c.beginPath();
    c.arc(r.x + 30 + i * 16, r.y + r.h - 9, 3.5, 0, Math.PI * 2);
    c.fill();
  }
}

function dessinerBille(x, y, r) {
  const c = contexte;
  c.fillStyle = "rgba(0,0,0,0.4)";
  c.beginPath();
  c.arc(x + 1, y + 1.5, r, 0, Math.PI * 2);
  c.fill();
  const g = c.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.4, "#c9ccd6");
  g.addColorStop(1, "#5d606c");
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
}

function dessinerBac() {
  // Le tas de billes dans le bac : sa hauteur suit la reserve
  const c = contexte;
  const n = Math.min(90, Math.ceil(etat.reserve / 3));
  const alea = mulberry(7);
  for (let i = 0; i < n; i++) {
    const rang = Math.floor(i / 18);
    const col = i % 18;
    const x = BAC.x + 20 + col * 12 + (rang % 2) * 6 + (alea() - 0.5) * 2;
    const y = BAC.y + BAC.h - 16 - rang * 9 + (alea() - 0.5) * 2;
    dessinerBille(x, y, 5.5);
  }
  c.fillStyle = "#1c1a2a";
  c.font = "800 22px 'Anybody', sans-serif";
  c.textAlign = "right";
  c.textBaseline = "middle";
  c.fillText(etat.reserve.toLocaleString("fr-BE"), BAC.x + BAC.l, BAC.y + BAC.h + 14);
}

function mulberry(graine) {
  let a = graine;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dessinerPoignee() {
  const c = contexte;
  const valeur = etat.enCharge ? etat.charge : etat.force;
  const a = Math.PI * 0.8 + valeur * Math.PI * 1.4;
  // Le bouton tourne avec la force : son repere rouge indique le reglage
  c.fillStyle = degrade(c, POIGNEE.x - 30, POIGNEE.y - 30, POIGNEE.x + 30, POIGNEE.y + 30, [[0, "#3a3848"], [1, "#12101c"]]);
  c.beginPath();
  c.arc(POIGNEE.x, POIGNEE.y, POIGNEE.r - 4, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = "#e8c547";
  c.lineWidth = 2;
  c.stroke();
  c.save();
  c.translate(POIGNEE.x, POIGNEE.y);
  c.rotate(a);
  c.fillStyle = "#c8372d";
  c.beginPath();
  c.roundRect(4, -5, POIGNEE.r - 8, 10, 5);
  c.fill();
  c.restore();
  c.fillStyle = "#e4e6ec";
  c.beginPath();
  c.arc(POIGNEE.x, POIGNEE.y, 9, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#4a4d58";
  c.font = "600 8px 'Martian Mono', monospace";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText("FORCE " + Math.round(valeur * 100), POIGNEE.x, POIGNEE.y - POIGNEE.r - 22);
}

function dessinerCompteurs() {
  // Petit afficheur au-dessus du bac : pic, billes gagnees en attente
  const c = contexte;
  c.fillStyle = "#1c1a2a";
  c.font = "600 8px 'Martian Mono', monospace";
  c.textAlign = "left";
  c.textBaseline = "middle";
  c.fillText("PIC", BAC.x + 70, BAC.y + BAC.h + 14);
  c.font = "800 16px 'Anybody', sans-serif";
  c.fillStyle = "#c8372d";
  c.fillText(etat.pic.toLocaleString("fr-BE"), BAC.x + 92, BAC.y + BAC.h + 14);
  // Lampes du fronton : elles alternent pendant la fievre
  [[44, 37], [W - 44, 37]].forEach(([lx, ly], i) => {
    const vive = etat.fievre > 0 ? Math.floor(tempsPachi * 6 + i) % 2 === 0 : etat.kakuhen > 0;
    c.fillStyle = vive ? (etat.fievre > 0 ? "#ffd23a" : "#d9c2ff") : "#5a5d68";
    c.beginPath();
    c.arc(lx, ly, 11, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "#e4e6ec";
    c.lineWidth = 2;
    c.stroke();
  });
}

function dessiner() {
  if (etat === null || fondPachi === null) {
    return;
  }
  const d = effets.decalage();
  contexte.setTransform(1, 0, 0, 1, 0, 0);
  contexte.drawImage(fondPachi, d.x * echelle, d.y * echelle);
  contexte.setTransform(echelle, 0, 0, echelle, (OX + d.x) * echelle, (OY + d.y) * echelle);

  etat.poches.forEach(dessinerPoche);
  dessinerTrappe();
  dessinerEcran();
  etat.billes.forEach(b => dessinerBille(b.x, b.y, b.r));
  effets.dessiner(contexte);

  // Message en bandeau sur la vitre
  if (etat.message) {
    const m = etat.message;
    contexte.globalAlpha = Math.min(1, m.age * 6, Math.max(0, (m.duree - m.age) * 3));
    contexte.fillStyle = "rgba(14,8,24,0.85)";
    contexte.fillRect(8, 388, 344, 46);
    contexte.fillStyle = "#e8c547";
    contexte.fillRect(8, 388, 344, 2);
    contexte.fillRect(8, 432, 344, 2);
    contexte.font = "900 28px 'Anybody', sans-serif";
    contexte.textAlign = "center";
    contexte.textBaseline = "middle";
    contexte.lineWidth = 5;
    contexte.strokeStyle = "#3a0d2a";
    contexte.strokeText(m.texte.toUpperCase(), 180, 412);
    contexte.fillStyle = "#ffd23a";
    contexte.fillText(m.texte.toUpperCase(), 180, 412);
    contexte.globalAlpha = 1;
  }

  contexte.setTransform(echelle, 0, 0, echelle, d.x * echelle, d.y * echelle);
  dessinerBac();
  dessinerCompteurs();
  dessinerPoignee();

  if (etat.pause) {
    contexte.setTransform(echelle, 0, 0, echelle, 0, 0);
    contexte.fillStyle = "rgba(7, 7, 11, 0.8)";
    contexte.fillRect(0, 0, W, H);
    contexte.fillStyle = "#c6f35a";
    contexte.font = "800 48px 'Anybody', sans-serif";
    contexte.textAlign = "center";
    contexte.textBaseline = "middle";
    contexte.fillText("PAUSE", W / 2, H / 2);
  }
}

function ajuster() {
  const marge = window.innerWidth >= 1100 ? 500 : 0;
  const largeur = Math.min(window.innerWidth * 0.96 - marge, 560);
  const entete = zone.querySelector(".entete-pachinko");
  const hEntete = entete ? entete.getBoundingClientRect().height + 8 : 40;
  const manette = document.querySelector(".manette:not([hidden])");
  const hauteurManette = manette ? manette.getBoundingClientRect().height : 0;
  const hauteur = Math.max(260, window.innerHeight - hEntete - hauteurManette - 44);
  const taille = Math.min(largeur / W, hauteur / H);
  canvas.style.width = Math.floor(W * taille) + "px";
  canvas.style.height = Math.floor(H * taille) + "px";
  const nouvelle = Math.min(3, Math.max(1, taille * (window.devicePixelRatio || 1)));
  if (Math.abs(nouvelle - echelle) > 0.02 || fondPachi === null) {
    echelle = nouvelle;
    canvas.width = Math.round(W * echelle);
    canvas.height = Math.round(H * echelle);
    fondPachi = peindreMachine();
  }
}

window.addEventListener("resize", function () {
  if (!zone.hidden) {
    ajuster();
  }
});

const boucle = creerBoucle(function (delta) {
  tempsPachi += delta;
  if (tempsPachi > prochainAjustement) {
    prochainAjustement = tempsPachi + 0.5;
    ajuster();
  }
  maj(delta);
  dessiner();
}, { plafond: 1 / 30 });

// ---------------------------------------------------------------------
// En-tete et commandes
// ---------------------------------------------------------------------

function majHud() {
  if (etat === null) {
    return;
  }
  zoneReserve.textContent = etat.reserve.toLocaleString("fr-BE");
  zonePic.textContent = etat.pic.toLocaleString("fr-BE");
  zoneAttente.textContent = String(etat.attente);
}

function majBoutonSon() {
  boutonSon.textContent = sonActif() ? "Son" : "Muet";
}

function demarrer() {
  effets.vider();
  etat = nouvelEtat();
  commandes.charge = commandes.rafale = commandes.plus = commandes.moins = false;
  doigt = null;
  majHud();
  majScoreCourant(ID, etat.pic);
  majBoutonSon();
  ajuster();
  requestAnimationFrame(ajuster);
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
  " ": "charge", "a": "charge", "enter": "charge",
  "x": "rafale", "b": "rafale",
  "arrowup": "plus", "arrowright": "plus",
  "arrowdown": "moins", "arrowleft": "moins"
};

surTouche(ID, function (evenement) {
  const touche = evenement.key.toLowerCase();
  if (TOUCHES[touche] !== undefined) {
    commandes[TOUCHES[touche]] = true;
  } else if (touche === "p") {
    basculerPause();
  } else if (touche === "m") {
    basculerSon();
    majBoutonSon();
  } else if (touche === "n") {
    demarrer();
  } else if (touche === "e") {
    encaisser();
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

function encaisser() {
  if (etat !== null && !etat.termine) {
    terminer("Billes encaissées");
  }
}

// Au doigt : on appuie et on garde le doigt pose pour tirer en rafale ;
// la position horizontale du doigt regle la force
canvas.addEventListener("pointerdown", function (evenement) {
  if (!jeuAuPremierPlan(ID) || etat === null || etat.pause) {
    return;
  }
  evenement.preventDefault();
  canvas.setPointerCapture(evenement.pointerId);
  doigt = { x: abscisseLogique(canvas, evenement.clientX, W) - OX };
});
canvas.addEventListener("pointermove", function (evenement) {
  if (doigt !== null) {
    doigt.x = abscisseLogique(canvas, evenement.clientX, W) - OX;
  }
});
function lacher() {
  doigt = null;
}
canvas.addEventListener("pointerup", lacher);
canvas.addEventListener("pointercancel", lacher);
canvas.addEventListener("contextmenu", evenement => evenement.preventDefault());

document.addEventListener("visibilitychange", function () {
  if (document.hidden && etat !== null && !etat.pause && !etat.termine && !zone.hidden) {
    basculerPause();
  }
});

boutonEncaisser.addEventListener("click", encaisser);
boutonSon.addEventListener("click", function () {
  basculerSon();
  majBoutonSon();
});
boutonRejouer.addEventListener("click", demarrer);
boutonQuitter.addEventListener("click", quitterJeu);

// Pour les tests automatiques
export const _test = { get etat() { return etat; }, jackpot: () => jackpot() };

enregistrerJeu({
  id: ID,
  nom: "Pachinko",
  code: "777",
  section: zone,
  demarrer,
  arreter: () => {
    boucle.arreter();
    commandes.charge = commandes.rafale = commandes.plus = commandes.moins = false;
    doigt = null;
  },
  manette: { a: " ", b: "x", start: "p", libelles: { a: "Lancer", b: "Rafale" } }
});
