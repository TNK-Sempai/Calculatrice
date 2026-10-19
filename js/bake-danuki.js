// =====================================================================
//  BAKE-DANUKI - le tanuki dans le labyrinthe du sanctuaire
//  Un Pac-Man revu par le folklore : le bake-danuki, le tanuki qui se
//  transforme, ramasse les grains de riz offerts au sanctuaire. Quatre
//  yokai le traquent, chacun avec sa facon de chasser. Quand il pose
//  une feuille sur sa tete, le tanuki se transforme et les yokai, d'un
//  coup, ne sont plus que des talismans de papier qui fuient.
//
//  Les yokai suivent les regles de la borne de 1980 :
//  - le tengu fonce droit sur le tanuki ;
//  - le kitsune vise quatre cases devant lui pour lui couper la route ;
//  - le kappa prend le tengu comme pivot et prend le tanuki en tenaille ;
//  - l'onibi chasse de loin mais retourne dans son coin quand il est
//    trop pres.
//  Ils alternent des phases de dispersion et de chasse, et changent de
//  sens a chaque bascule : c'est ce qui rend le jeu lisible.
// =====================================================================

import { enregistrerJeu, finDePartie, quitterJeu, majScoreCourant } from "./arcade.js";
import { creerBoucle } from "./noyau/boucle.js";
import { surTouche } from "./noyau/clavier.js";
import { creerStockage } from "./noyau/stockage.js";
import { creerEffets } from "./noyau/effets.js";
import { surGlissement } from "./noyau/tactile.js";
import { jouer, basculerSon, sonActif } from "./noyau/son.js";
import { VERMILLON, PAPIER } from "./tanukiland/sprites.js";

const ID = "bake-danuki";

const zone = document.getElementById("jeuDanuki");
const canvas = document.getElementById("canvasDanuki");
const contexte = canvas.getContext("2d");
const zoneScore = document.getElementById("scoreDanuki");
const zoneNiveau = document.getElementById("niveauDanuki");
const zoneVies = document.getElementById("viesDanuki");
const boutonSon = document.getElementById("sonDanuki");
const boutonRecommencer = document.getElementById("recommencerDanuki");
const boutonQuitter = document.getElementById("quitterDanuki");

// ---------------------------------------------------------------------
// Le labyrinthe
// # mur, . grain de riz, o feuille, - porte de la maison des yokai,
// P depart du tanuki. La rangee 9 est un tunnel ouvert sur les cotes.
// ---------------------------------------------------------------------

// Trois labyrinthes qui tournent d'un niveau a l'autre. Le coeur (maison
// des yokai, tunnel, depart) reste au meme endroit : seuls le haut et le
// bas changent. Chacun a ete verifie : tout est relie, aucune impasse.
const MILIEU = [
  "####.### # ###.####",
  "   #.#       #.#   ",
  "####.# ##-## #.####",
  "    .  #   #  .    ",
  "####.# ##### #.####",
  "   #.#       #.#   ",
  "####.# ##### #.####"
];

function miroir(moities) {
  return moities.map(h => h + [...h.slice(0, 9)].reverse().join(""));
}

function assembler(haut, bas) {
  return ["###################", ...miroir(haut), ...MILIEU, ...miroir(bas), "###################"];
}

const PLANS = [
  assembler(
    ["#........#", "#o##.###.#", "#.........", "#.##.#.###", "#....#...#"],
    ["#........#", "#.##.###.#", "#o.#.....P", "##.#.#.###", "#....#...#", "#.######.#", "#........."]
  ),
  assembler(
    ["#.........", "#o##.#####", "#.........", "#.##.#.###", "#....#...."],
    ["#.........", "#.##.#.###", "#o...#...P", "##.#...###", "#.....#...", "#.#####.##", "#........."]
  ),
  assembler(
    ["#....#....", "#o##.#.##.", "#.........", "#.##.#.##.", "#....#...."],
    ["#....#....", "#.##.#.##.", "#o.......P", "###.#.####", "#...#.....", "#.#####.#.", "#........."]
  )
];

// Chaque labyrinthe a son decor : jardin de mousse, temple laque, nuit d'hiver
const THEMES = [
  { nom: "Jardin", sol: "#1c2a1c", chemin: "#24331f", dessus: "#4f7a34", face: "#2c4a1c", liseré: "#7fae4a", grain: "#f3ecda" },
  { nom: "Temple", sol: "#2a1414", chemin: "#331b17", dessus: "#b0352a", face: "#6e1a14", liseré: "#e8c547", grain: "#fbf3df" },
  { nom: "Neige", sol: "#151a2c", chemin: "#1c2238", dessus: "#c9d6e8", face: "#6b7a99", liseré: "#ffffff", grain: "#fff6c8" }
];

let PLAN = PLANS[0];
let THEME = THEMES[0];

const T = 16;
const COLONNES = PLAN[0].length;
const RANGEES = PLAN.length;
const LARGEUR = COLONNES * T;
const HAUTEUR = RANGEES * T;
const RANGEE_TUNNEL = 9;
const PORTE = { c: 9, r: 8 };
const SORTIE = { c: 9, r: 7 };      // la case devant la porte
const MAISON = { c: 9, r: 9 };
const BONUS = { c: 9, r: 11 };
const DEPART = { c: 9, r: 15 };
const VIES_DEPART = 3;
const VIE_EN_PLUS = 10000;

const DIRECTIONS = {
  haut: { x: 0, y: -1 },
  gauche: { x: -1, y: 0 },
  bas: { x: 0, y: 1 },
  droite: { x: 1, y: 0 }
};
// L'ordre de preference des yokai a distance egale, comme sur la borne
const ORDRE = ["haut", "gauche", "bas", "droite"];
const IMMOBILE = { x: 0, y: 0 };

// Dispersion puis chasse, en secondes. La derniere chasse ne finit pas.
const CYCLE = [7, 20, 7, 20, 5, 20, 5, Infinity];

// Bonus offerts au sanctuaire, un par niveau
const OFFRANDES = [
  { nom: "onigiri", points: 100 },
  { nom: "dango", points: 300 },
  { nom: "taiyaki", points: 500 },
  { nom: "onigiri", points: 700 },
  { nom: "dango", points: 1000 },
  { nom: "taiyaki", points: 2000 }
];

// Les yokai : chacun sa couleur et un detail qui le distingue sans elle
const YOKAI = [
  { nom: "tengu", couleur: "#d8402f", sombre: "#7e1f16", coin: { c: COLONNES - 2, r: 0 }, sortie: 0 },
  { nom: "kitsune", couleur: "#f0b93a", sombre: "#8a5a10", coin: { c: 1, r: 0 }, sortie: 1 },
  { nom: "kappa", couleur: "#5fb04a", sombre: "#26601c", coin: { c: COLONNES - 2, r: RANGEES - 1 }, sortie: 4 },
  { nom: "onibi", couleur: "#4a9ad8", sombre: "#1c4a7a", coin: { c: 1, r: RANGEES - 1 }, sortie: 8 }
];

// ---------------------------------------------------------------------
// Etat
// ---------------------------------------------------------------------

const effets = creerEffets();
let etat = null;
let directionVoulue = null;

function cle(c, r) {
  return c + "," + r;
}

function preparerGrains() {
  const grains = new Map();
  PLAN.forEach((ligne, r) => {
    [...ligne].forEach((caractere, c) => {
      if (caractere === ".") {
        grains.set(cle(c, r), "grain");
      } else if (caractere === "o") {
        grains.set(cle(c, r), "feuille");
      }
    });
  });
  return grains;
}

function nouvelEtat() {
  return {
    score: 0,
    vies: VIES_DEPART,
    niveau: 1,
    vieDonnee: false,
    grains: preparerGrains(),
    grainsTotal: 0,
    grainsManges: 0,
    tanuki: null,
    yokai: [],
    cycle: { index: 0, reste: CYCLE[0] },
    peur: 0,
    chaine: 0,
    offrande: null,
    offrandesApparues: 0,
    phase: "pret",        // pret, jeu, mort, victoire, fin
    minuteurPhase: 2,
    tempsNiveau: 0,
    pause: false,
    temps: 0
  };
}

function centre(c) {
  return c * T + T / 2;
}

function caseLibre(c, r, pourYokai) {
  if (r === RANGEE_TUNNEL && (c < 0 || c >= COLONNES)) {
    return true;
  }
  if (c < 0 || c >= COLONNES || r < 0 || r >= RANGEES) {
    return false;
  }
  const caractere = PLAN[r][c];
  if (caractere === "#") {
    return false;
  }
  if (caractere === "-") {
    return pourYokai === "porte";
  }
  return true;
}

function creerEntite(c, r) {
  return { c, r, progres: 0, dir: IMMOBILE, x: centre(c), y: centre(r) };
}

function placer(entite) {
  entite.x = centre(entite.c) + entite.dir.x * entite.progres;
  entite.y = centre(entite.r) + entite.dir.y * entite.progres;
}

function opposee(a, b) {
  return a.x === -b.x && a.y === -b.y && (a.x !== 0 || a.y !== 0);
}

// Fait demi-tour au milieu d'un couloir, sans attendre la case suivante
function demiTour(entite) {
  if (entite.dir === IMMOBILE || (entite.dir.x === 0 && entite.dir.y === 0)) {
    return;
  }
  if (entite.progres > 0) {
    entite.c += entite.dir.x;
    entite.r += entite.dir.y;
    entite.progres = T - entite.progres;
  }
  entite.dir = { x: -entite.dir.x, y: -entite.dir.y };
}

// Avance d'une distance en pixels. A chaque centre de case, decider()
// choisit la suite et peut arreter l'entite.
function avancer(entite, distance, decider) {
  let reste = distance;
  let garde = 0;
  while (reste > 0 && garde++ < 6) {
    if (entite.progres === 0) {
      decider(entite);
      if (entite.dir.x === 0 && entite.dir.y === 0) {
        break;
      }
    }
    const jusquAuCentre = T - entite.progres;
    if (reste < jusquAuCentre) {
      entite.progres += reste;
      reste = 0;
    } else {
      reste -= jusquAuCentre;
      entite.c += entite.dir.x;
      entite.r += entite.dir.y;
      entite.progres = 0;
      // Le tunnel ramene de l'autre cote
      if (entite.c < -1) {
        entite.c = COLONNES;
      } else if (entite.c > COLONNES) {
        entite.c = -1;
      }
    }
  }
  placer(entite);
}

// ---------------------------------------------------------------------
// Niveau
// ---------------------------------------------------------------------

function vitesse(base) {
  return base * T * Math.min(1.3, 1 + (etat.niveau - 1) * 0.05);
}

function dureePeur() {
  return Math.max(1.2, 7 - (etat.niveau - 1) * 0.8);
}

function placerActeurs() {
  etat.tanuki = creerEntite(DEPART.c, DEPART.r);
  etat.tanuki.dir = DIRECTIONS.gauche;
  etat.tanuki.bouche = 0;
  directionVoulue = null;
  etat.yokai = YOKAI.map((def, index) => {
    const dehors = index === 0;
    const y = creerEntite(dehors ? SORTIE.c : MAISON.c - 1 + index - (index > 1 ? 1 : 0), dehors ? SORTIE.r : MAISON.r);
    y.def = def;
    y.mode = dehors ? "actif" : "maison";
    y.dir = DIRECTIONS.gauche;
    y.effraye = false;
    y.sortieA = def.sortie * Math.max(0.4, 1 - (etat.niveau - 1) * 0.15);
    if (!dehors) {
      y.c = [8, 9, 10][index - 1];
      y.x = centre(y.c);
      y.y = centre(MAISON.r);
      y.dir = IMMOBILE;
    }
    return y;
  });
  etat.cycle = { index: 0, reste: CYCLE[0] };
  etat.peur = 0;
  etat.tempsNiveau = 0;
  etat.offrande = null;
}

function nouveauNiveau() {
  PLAN = PLANS[(etat.niveau - 1) % PLANS.length];
  THEME = THEMES[(etat.niveau - 1) % THEMES.length];
  decor = null;
  etat.grains = preparerGrains();
  etat.grainsTotal = etat.grains.size;
  etat.grainsManges = 0;
  etat.offrandesApparues = 0;
  placerActeurs();
  etat.phase = "pret";
  etat.minuteurPhase = 1.8;
  majHud();
}

// ---------------------------------------------------------------------
// Le tanuki
// ---------------------------------------------------------------------

function deciderTanuki(t) {
  if (directionVoulue !== null && caseLibre(t.c + directionVoulue.x, t.r + directionVoulue.y)) {
    t.dir = directionVoulue;
  } else if (!caseLibre(t.c + t.dir.x, t.r + t.dir.y)) {
    t.dir = IMMOBILE;
  }
}

function majTanuki(delta) {
  const t = etat.tanuki;
  // Demi-tour immediat, n'importe ou dans le couloir
  if (directionVoulue !== null && opposee(directionVoulue, t.dir)) {
    demiTour(t);
  }
  if (t.dir.x === 0 && t.dir.y === 0 && t.progres === 0) {
    deciderTanuki(t);
  }
  const enTunnel = t.r === RANGEE_TUNNEL && (t.c <= 3 || t.c >= COLONNES - 4);
  avancer(t, vitesse(enTunnel ? 6 : 7.2) * delta, deciderTanuki);
  if (t.dir.x !== 0 || t.dir.y !== 0) {
    t.bouche += delta;
  }
  if (t.progres < T / 2) {
    manger(t.c, t.r);
  }
}

function manger(c, r) {
  const k = cle(c, r);
  const quoi = etat.grains.get(k);
  if (quoi === undefined) {
    return;
  }
  etat.grains.delete(k);
  etat.grainsManges++;
  if (quoi === "grain") {
    gagner(10);
    jouer("grain");
  } else {
    gagner(50);
    transformer();
  }
  // Les offrandes apparaissent a 70 et 170 grains
  const seuils = [Math.round(etat.grainsTotal * 0.35), Math.round(etat.grainsTotal * 0.75)];
  if (seuils.includes(etat.grainsManges) && etat.offrande === null) {
    const def = OFFRANDES[Math.min(OFFRANDES.length - 1, etat.niveau - 1)];
    etat.offrande = { ...def, reste: 9.5 };
  }
  if (etat.grains.size === 0) {
    etat.phase = "victoire";
    etat.minuteurPhase = 2;
    jouer("vague");
  }
}

function transformer() {
  etat.peur = dureePeur();
  etat.chaine = 0;
  jouer("pouvoir");
  effets.eclater(etat.tanuki.x, etat.tanuki.y, ["#9fc43f", "#c8f060", "#5e7626"], 14, 110);
  etat.yokai.forEach(y => {
    if (y.mode === "actif") {
      y.effraye = true;
      demiTour(y);
    }
  });
}

function gagner(points) {
  etat.score += points;
  if (!etat.vieDonnee && etat.score >= VIE_EN_PLUS) {
    etat.vieDonnee = true;
    etat.vies++;
    effets.flotter(etat.tanuki.x, etat.tanuki.y - 14, "1UP", "#c8f060", 10);
    jouer("vie");
  }
  majScoreCourant(ID, etat.score);
  majHud();
}

// ---------------------------------------------------------------------
// Les yokai
// ---------------------------------------------------------------------

function modeChasse() {
  return etat.cycle.index % 2 === 1;
}

function cible(y) {
  const t = etat.tanuki;
  if (y.mode === "yeux") {
    return SORTIE;
  }
  if (!modeChasse()) {
    return y.def.coin;
  }
  const devant = (n) => ({ c: t.c + t.dir.x * n, r: t.r + t.dir.y * n });
  switch (y.def.nom) {
    case "tengu":
      return { c: t.c, r: t.r };
    case "kitsune":
      return devant(4);
    case "kappa": {
      const pivot = devant(2);
      const tengu = etat.yokai[0];
      return { c: pivot.c * 2 - tengu.c, r: pivot.r * 2 - tengu.r };
    }
    default: {
      const distance = Math.hypot(y.c - t.c, y.r - t.r);
      return distance > 8 ? { c: t.c, r: t.r } : y.def.coin;
    }
  }
}

function deciderYokai(y) {
  const passage = y.mode === "yeux" ? "porte" : null;
  const options = ORDRE.filter(nom => {
    const d = DIRECTIONS[nom];
    if (opposee(d, y.dir)) {
      return false;
    }
    return caseLibre(y.c + d.x, y.r + d.y, passage);
  });
  if (options.length === 0) {
    y.dir = { x: -y.dir.x, y: -y.dir.y };
    return;
  }
  if (y.effraye && y.mode === "actif") {
    y.dir = DIRECTIONS[options[Math.floor(Math.random() * options.length)]];
    return;
  }
  const but = cible(y);
  let meilleure = options[0];
  let distanceMin = Infinity;
  options.forEach(nom => {
    const d = DIRECTIONS[nom];
    const distance = Math.pow(y.c + d.x - but.c, 2) + Math.pow(y.r + d.y - but.r, 2);
    if (distance < distanceMin) {
      distanceMin = distance;
      meilleure = nom;
    }
  });
  y.dir = DIRECTIONS[meilleure];
}

function vitesseYokai(y) {
  if (y.mode === "yeux") {
    return vitesse(15);
  }
  const enTunnel = y.r === RANGEE_TUNNEL && (y.c <= 3 || y.c >= COLONNES - 4);
  if (enTunnel) {
    return vitesse(3.6);
  }
  if (y.effraye) {
    return vitesse(3.8);
  }
  // Le tengu s'enrage quand il reste peu de grains
  if (y.def.nom === "tengu" && etat.grains.size < 24) {
    return vitesse(7.4);
  }
  return vitesse(6.8);
}

// Deplacement libre, hors grille, pour entrer et sortir de la maison
function glisserVers(y, x, yCible, pas) {
  const dx = x - y.x;
  const dy = yCible - y.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= pas) {
    y.x = x;
    y.y = yCible;
    return true;
  }
  y.x += (dx / distance) * pas;
  y.y += (dy / distance) * pas;
  return false;
}

function majYokai(delta) {
  etat.yokai.forEach(y => {
    if (y.mode === "maison") {
      // Ils piaffent dans la maison en attendant leur tour
      y.y = centre(MAISON.r) + Math.sin(etat.temps * 6 + y.c) * 3;
      if (etat.tempsNiveau >= y.sortieA) {
        y.mode = "sortie";
      }
    } else if (y.mode === "sortie") {
      const pas = vitesse(3.4) * delta;
      if (Math.abs(y.x - centre(MAISON.c)) > 0.5) {
        glisserVers(y, centre(MAISON.c), centre(MAISON.r), pas);
      } else if (glisserVers(y, centre(SORTIE.c), centre(SORTIE.r), pas)) {
        y.c = SORTIE.c;
        y.r = SORTIE.r;
        y.progres = 0;
        y.dir = DIRECTIONS.gauche;
        y.mode = "actif";
      }
    } else if (y.mode === "rentree") {
      if (glisserVers(y, centre(MAISON.c), centre(MAISON.r), vitesse(8) * delta)) {
        y.mode = "sortie";
        y.effraye = false;
      }
    } else {
      avancer(y, vitesseYokai(y) * delta, deciderYokai);
      if (y.mode === "yeux" && y.c === SORTIE.c && y.r === SORTIE.r && y.progres === 0) {
        y.mode = "rentree";
        y.x = centre(SORTIE.c);
        y.y = centre(SORTIE.r);
      }
    }
  });
}

function majCycle(delta) {
  if (etat.peur > 0) {
    etat.peur -= delta;
    if (etat.peur <= 0) {
      etat.peur = 0;
      etat.yokai.forEach(y => { y.effraye = false; });
    }
    return;
  }
  etat.cycle.reste -= delta;
  if (etat.cycle.reste <= 0 && etat.cycle.index < CYCLE.length - 1) {
    etat.cycle.index++;
    etat.cycle.reste = CYCLE[etat.cycle.index];
    // A chaque bascule, les yokai font demi-tour : on les voit changer d'avis
    etat.yokai.forEach(y => {
      if (y.mode === "actif") {
        demiTour(y);
      }
    });
  }
}

function majContacts() {
  const t = etat.tanuki;
  for (const y of etat.yokai) {
    if (y.mode !== "actif" && y.mode !== "sortie") {
      continue;
    }
    if (Math.hypot(y.x - t.x, y.y - t.y) > 10) {
      continue;
    }
    if (y.effraye) {
      etat.chaine++;
      const points = 200 * Math.pow(2, etat.chaine - 1);
      gagner(points);
      effets.flotter(y.x, y.y - 6, String(points), "#c8f060", 10);
      effets.eclater(y.x, y.y, [PAPIER, "#d8c9a8", VERMILLON], 12, 110);
      jouer("croque");
      y.mode = "yeux";
      y.effraye = false;
      if (y.progres > 0) {
        y.progres = 0;
        placer(y);
      }
    } else {
      mourir();
      return;
    }
  }
  // Offrande
  const o = etat.offrande;
  if (o !== null && Math.hypot(centre(BONUS.c) - t.x, centre(BONUS.r) - t.y) < 10) {
    gagner(o.points);
    effets.flotter(centre(BONUS.c), centre(BONUS.r) - 8, String(o.points), "#e8c547", 10);
    jouer("bonus");
    etat.offrande = null;
  }
}

function mourir() {
  etat.phase = "mort";
  etat.minuteurPhase = 1.6;
  effets.eclater(etat.tanuki.x, etat.tanuki.y, ["#8a6644", "#4a3622", PAPIER], 26, 140);
  effets.secouer(5, 0.4);
  jouer("mort");
}

// ---------------------------------------------------------------------
// Boucle
// ---------------------------------------------------------------------

function maj(delta) {
  if (etat === null || etat.pause) {
    return;
  }
  etat.temps += delta;
  effets.maj(delta);

  if (etat.phase === "pret") {
    etat.minuteurPhase -= delta;
    if (etat.minuteurPhase <= 0) {
      etat.phase = "jeu";
    }
    return;
  }
  if (etat.phase === "mort") {
    etat.minuteurPhase -= delta;
    if (etat.minuteurPhase <= 0) {
      etat.vies--;
      majHud();
      if (etat.vies <= 0) {
        etat.phase = "fin";
        setTimeout(() => {
          if (etat !== null && etat.phase === "fin" && !zone.hidden) {
            if (etat.score > record) {
              record = etat.score;
              stockageRecord.ecrireTexte(record);
            }
            finDePartie(ID, etat.score);
          }
        }, 1200);
      } else {
        placerActeurs();
        etat.phase = "pret";
        etat.minuteurPhase = 1.4;
      }
    }
    return;
  }
  if (etat.phase === "victoire") {
    etat.minuteurPhase -= delta;
    if (etat.minuteurPhase <= 0) {
      if ([2, 5, 9].includes(etat.niveau) || (etat.niveau > 9 && etat.niveau % 4 === 1)) {
        // Petit intermede : une poursuite, puis l'arroseur arrose
        etat.phase = "intermede";
        etat.minuteurPhase = 6;
      } else {
        etat.niveau++;
        nouveauNiveau();
      }
    }
    return;
  }
  if (etat.phase === "intermede") {
    etat.minuteurPhase -= delta;
    if (etat.minuteurPhase <= 0) {
      etat.niveau++;
      nouveauNiveau();
    }
    return;
  }
  if (etat.phase !== "jeu") {
    return;
  }

  etat.tempsNiveau += delta;
  majCycle(delta);
  majTanuki(delta);
  if (etat.phase !== "jeu") {
    return;
  }
  majYokai(delta);
  majContacts();
  if (etat.offrande !== null) {
    etat.offrande.reste -= delta;
    if (etat.offrande.reste <= 0) {
      etat.offrande = null;
    }
  }
}

// ---------------------------------------------------------------------
// Dessin : net a toute resolution. Le decor (sol, murs en relief) est
// peint une fois par labyrinthe, le reste a chaque image.
// ---------------------------------------------------------------------

const HUD = 34;                       // bandeau du score au-dessus du labyrinthe
const VW = LARGEUR;
const VH = HAUTEUR + HUD;
const HAUTEUR_MUR = 3;                // les murs ont une epaisseur visible
const stockageRecord = creerStockage("tanuki-arcade-pac-tanuki-record");
let record = Number(stockageRecord.lireTexte()) || 0;
let echelle = 1;
let decor = null;

function estMur(c, r) {
  return r >= 0 && r < RANGEES && c >= 0 && c < COLONNES && PLAN[r][c] === "#";
}

function cheminMur(c2, c, r, decalage) {
  // Un bloc de mur arrondi la ou il forme un angle sortant
  const x = c * T;
  const y = r * T + decalage;
  const h = !estMur(c, r - 1);
  const b = !estMur(c, r + 1);
  const g = !estMur(c - 1, r);
  const d = !estMur(c + 1, r);
  const rayon = 6;
  // Un leger debord vers les murs voisins, pour qu'aucun joint ne se voie
  const e = 0.6;
  const x0 = x - (g ? 0 : e);
  const y0 = y - (h ? 0 : e);
  const x1 = x + T + (d ? 0 : e);
  const y1 = y + T + (b ? 0 : e);
  c2.beginPath();
  c2.roundRect(x0, y0, x1 - x0, y1 - y0, [h && g ? rayon : 0, h && d ? rayon : 0, b && d ? rayon : 0, b && g ? rayon : 0]);
}

function peindreDecor(clair) {
  const off = document.createElement("canvas");
  off.width = Math.round(VW * echelle);
  off.height = Math.round(HAUTEUR * echelle);
  const c2 = off.getContext("2d");
  c2.setTransform(echelle, 0, 0, echelle, 0, 0);
  c2.fillStyle = THEME.sol;
  c2.fillRect(0, 0, VW, HAUTEUR);
  // Allees : un sol un peu plus clair que le fond
  PLAN.forEach((ligne, r) => [...ligne].forEach((ch, c) => {
    if (ch === "." || ch === "o" || ch === "P" || (ch === " " && r >= 6 && r <= 12)) {
      c2.fillStyle = THEME.chemin;
      c2.fillRect(c * T, r * T, T, T);
    }
  }));
  // Ombre portee des murs sur l'allee
  c2.fillStyle = "rgba(0,0,0,0.35)";
  PLAN.forEach((ligne, r) => [...ligne].forEach((ch, c) => {
    if (ch === "#") {
      cheminMur(c2, c, r, HAUTEUR_MUR + 2);
      c2.fill();
    }
  }));
  // Face du mur, puis son dessus
  PLAN.forEach((ligne, r) => [...ligne].forEach((ch, c) => {
    if (ch === "#") {
      c2.fillStyle = THEME.face;
      cheminMur(c2, c, r, HAUTEUR_MUR);
      c2.fill();
    }
  }));
  PLAN.forEach((ligne, r) => [...ligne].forEach((ch, c) => {
    if (ch === "#") {
      c2.fillStyle = clair ? "#ffffff" : THEME.dessus;
      cheminMur(c2, c, r, 0);
      c2.fill();
    }
  }));
  // Liseré clair sur les bords du dessus qui donnent sur une allee
  c2.strokeStyle = clair ? "#ffffff" : THEME.liseré;
  c2.lineWidth = 1;
  c2.globalAlpha = 0.55;
  PLAN.forEach((ligne, r) => [...ligne].forEach((ch, c) => {
    if (ch !== "#") {
      return;
    }
    const x = c * T;
    const y = r * T;
    c2.beginPath();
    if (!estMur(c, r - 1) && r > 0) {
      c2.moveTo(x + 2, y + 1.5);
      c2.lineTo(x + T - 2, y + 1.5);
    }
    if (!estMur(c - 1, r) && c > 0) {
      c2.moveTo(x + 1.5, y + 2);
      c2.lineTo(x + 1.5, y + T - 2);
    }
    c2.stroke();
  }));
  c2.globalAlpha = 1;
  // La porte de la maison : un petit torii
  const px = PORTE.c * T;
  const py = PORTE.r * T;
  c2.fillStyle = VERMILLON;
  c2.fillRect(px - 4, py + 4, T + 8, 3);
  c2.fillRect(px - 1, py + 8, T + 2, 2);
  c2.fillStyle = "#1a1010";
  c2.fillRect(px - 5, py + 3, T + 10, 1.5);
  return off;
}

function feuille(ctx, x, y, taille, couleur) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.5);
  ctx.fillStyle = couleur || "#8fc84a";
  ctx.beginPath();
  ctx.ellipse(0, 0, taille * 0.55, taille, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#3f6a1c";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, -taille);
  ctx.lineTo(0, taille + 2);
  ctx.stroke();
  ctx.restore();
}

function dessinerTanuki(t, ouverture, transforme, mortK) {
  const ctx = contexte;
  const angle = t.dir.x > 0 ? 0 : t.dir.x < 0 ? Math.PI : t.dir.y > 0 ? Math.PI / 2 : t.dir.y < 0 ? -Math.PI / 2 : 0;
  const rayon = 7.2 * (mortK === undefined ? 1 : 1 - mortK * 0.8);
  ctx.save();
  ctx.translate(t.x, t.y);
  if (mortK !== undefined) {
    ctx.rotate(mortK * Math.PI * 4);
  }
  // Ombre au sol
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(1, rayon * 0.9, rayon * 0.9, rayon * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();
  // Oreilles
  ctx.fillStyle = transforme ? "#c08a3e" : "#6e4b2c";
  ctx.beginPath();
  ctx.arc(-rayon * 0.6, -rayon * 0.75, rayon * 0.32, 0, Math.PI * 2);
  ctx.arc(rayon * 0.6, -rayon * 0.75, rayon * 0.32, 0, Math.PI * 2);
  ctx.fill();
  // Corps, bouche ouverte vers la direction (lecture Pac-Man)
  const bouche = ouverture * 0.75;
  ctx.fillStyle = transforme ? "#e2ad55" : "#9a7048";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, rayon, angle + bouche, angle + Math.PI * 2 - bouche);
  ctx.closePath();
  ctx.fill();
  // Masque sombre autour des yeux, tourne avec le regard
  const ox = Math.cos(angle);
  const oy = Math.sin(angle);
  const px = -oy;
  const py = ox;
  ctx.fillStyle = "#2a1c12";
  [-1, 1].forEach(s => {
    ctx.beginPath();
    ctx.ellipse(ox * 1.5 + px * s * 3.2 - ox * 1, oy * 1.5 + py * s * 3.2 - oy * 1 - 1.5, 2.6, 2, angle, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = "#ffffff";
  [-1, 1].forEach(s => {
    ctx.fillRect(ox * 1.5 + px * s * 3.2 - 0.8, oy * 1.5 + py * s * 3.2 - 2.3, 1.6, 1.6);
  });
  if (transforme) {
    feuille(ctx, 0, -rayon - 1, 3.4);
  }
  ctx.restore();
}

function dessinerYokai(y) {
  const ctx = contexte;
  const x = y.x;
  const yy = y.y;
  const ondule = Math.sin(etat.temps * 10 + x * 0.1);
  const yeuxSeuls = y.mode === "yeux" || y.mode === "rentree";
  const dir = y.dir && (y.dir.x || y.dir.y) ? y.dir : { x: 0, y: 1 };
  if (!yeuxSeuls) {
    let corps = y.def.couleur;
    let sombre = y.def.sombre;
    if (y.effraye) {
      const fin = etat.peur < 2 && Math.floor(etat.temps * 8) % 2 === 0;
      corps = fin ? "#ffffff" : "#efe4c8";
      sombre = fin ? "#c8372d" : "#b7a57d";
    }
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(x + 1, yy + 8, 7, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Silhouette : un dome et une jupe ondulante
    ctx.fillStyle = corps;
    ctx.beginPath();
    ctx.arc(x, yy - 1, 7.4, Math.PI, 0);
    ctx.lineTo(x + 7.4, yy + 6);
    for (let i = 0; i <= 4; i++) {
      const px = x + 7.4 - i * 3.7;
      ctx.lineTo(px, yy + 6 + ((i + Math.round(ondule)) % 2 ? 2.5 : 0));
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = sombre;
    ctx.fillRect(x - 7.4, yy + 3, 14.8, 1.5);
    if (y.effraye) {
      // Talisman de papier : un trait rouge vertical et un petit sceau
      ctx.fillStyle = "#c8372d";
      ctx.fillRect(x - 0.8, yy - 6, 1.6, 9);
      ctx.fillRect(x - 3, yy - 6, 6, 1.4);
      ctx.fillStyle = "#4a3a2a";
      ctx.fillRect(x - 4, yy + 0, 2, 1.2);
      ctx.fillRect(x + 2, yy + 0, 2, 1.2);
      return;
    }
    // Detail de chaque yokai
    if (y.def.nom === "tengu") {
      ctx.fillStyle = "#a82a1e";
      ctx.beginPath();
      ctx.moveTo(x - 1, yy - 1);
      ctx.lineTo(x + dir.x * 6 + 1.5, yy + 1 + dir.y * 3);
      ctx.lineTo(x + 1.5, yy + 2);
      ctx.fill();
      ctx.fillStyle = "#1a1a22";
      ctx.fillRect(x - 3, yy - 10, 6, 2.5);
    } else if (y.def.nom === "kitsune") {
      ctx.fillStyle = corps;
      ctx.beginPath();
      ctx.moveTo(x - 6, yy - 4);
      ctx.lineTo(x - 5, yy - 11);
      ctx.lineTo(x - 1.5, yy - 7);
      ctx.moveTo(x + 6, yy - 4);
      ctx.lineTo(x + 5, yy - 11);
      ctx.lineTo(x + 1.5, yy - 7);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x - 5.5, yy - 9, 1.5, 2);
      ctx.fillRect(x + 4, yy - 9, 1.5, 2);
    } else if (y.def.nom === "kappa") {
      ctx.fillStyle = "#cfe8f0";
      ctx.beginPath();
      ctx.ellipse(x, yy - 8, 4.5, 1.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#2f7a2a";
      ctx.lineWidth = 1;
      ctx.stroke();
    } else {
      ctx.fillStyle = "#9fd0f5";
      ctx.beginPath();
      ctx.moveTo(x - 3, yy - 7);
      ctx.quadraticCurveTo(x, yy - 15 - ondule, x + 3, yy - 7);
      ctx.fill();
    }
  }
  // Yeux qui regardent ou va le yokai
  [-1, 1].forEach(s => {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.ellipse(x + s * 3, yy - 2, 2.4, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1a1a22";
    ctx.beginPath();
    ctx.arc(x + s * 3 + dir.x * 1.2, yy - 2 + dir.y * 1.4, 1.3, 0, Math.PI * 2);
    ctx.fill();
  });
}

function dessinerOffrande(nom, x, y) {
  const ctx = contexte;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(1, 6, 7, 2.2, 0, 0, Math.PI * 2);
  ctx.fill();
  if (nom === "onigiri") {
    ctx.fillStyle = "#fbf6ea";
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.quadraticCurveTo(8, 4, 6, 6);
    ctx.lineTo(-6, 6);
    ctx.quadraticCurveTo(-8, 4, 0, -7);
    ctx.fill();
    ctx.fillStyle = "#1e2a1e";
    ctx.fillRect(-3.5, 1, 7, 5);
  } else if (nom === "dango") {
    ctx.strokeStyle = "#a07a4a";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-6, 7);
    ctx.lineTo(6, -8);
    ctx.stroke();
    [["#f4a6b8", -3.5, 3], ["#fbf6ea", 0, -0.8], ["#8cc45a", 3.5, -4.6]].forEach(([coul, dx, dy]) => {
      ctx.fillStyle = coul;
      ctx.beginPath();
      ctx.arc(dx, dy, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  } else {
    ctx.fillStyle = "#d8913a";
    ctx.beginPath();
    ctx.ellipse(0, 0, 7.5, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(10, -4);
    ctx.lineTo(10, 4);
    ctx.fill();
    ctx.fillStyle = "#1a1a22";
    ctx.fillRect(-4.5, -1.5, 1.6, 1.6);
    ctx.strokeStyle = "#a0601e";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-1, -3);
    ctx.lineTo(3, 0);
    ctx.lineTo(-1, 3);
    ctx.stroke();
  }
  ctx.restore();
}

function texteContour(t, x, y, taille, couleur, alignement) {
  const ctx = contexte;
  ctx.font = "800 " + taille + "px 'Anybody', sans-serif";
  ctx.textAlign = alignement || "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(2.5, taille * 0.2);
  ctx.strokeStyle = "#0b0b10";
  ctx.strokeText(t, x, y);
  ctx.fillStyle = couleur;
  ctx.fillText(t, x, y);
}

function dessinerHud() {
  const ctx = contexte;
  ctx.fillStyle = "#0e0e15";
  ctx.fillRect(0, 0, VW, HUD);
  ctx.font = "600 6px 'Martian Mono', monospace";
  ctx.fillStyle = "#8f8a82";
  ctx.textAlign = "left";
  ctx.fillText("SCORE", 8, 9);
  ctx.textAlign = "center";
  ctx.fillText("RECORD", VW / 2, 9);
  ctx.textAlign = "right";
  ctx.fillText(THEME.nom.toUpperCase() + "  NIV. " + etat.niveau, VW - 8, 9);
  texteContour(etat.score.toLocaleString("fr-BE"), 8, 22, 15, "#c8f060", "left");
  texteContour(Math.max(record, etat.score).toLocaleString("fr-BE"), VW / 2, 22, 12, "#ede8df");
  // Vies : de petites tetes de tanuki
  for (let i = 0; i < Math.max(0, etat.vies - (etat.phase === "pret" ? 0 : 0)); i++) {
    dessinerTanuki({ x: VW - 14 - i * 16, y: 23, dir: DIRECTIONS.gauche }, 0.35, false);
  }
}

function dessinerIntermede() {
  const ctx = contexte;
  ctx.fillStyle = THEME.sol;
  ctx.fillRect(0, 0, VW, HAUTEUR);
  const k = 1 - etat.minuteurPhase / 6;
  const y = HAUTEUR / 2;
  ctx.fillStyle = THEME.chemin;
  ctx.fillRect(0, y - 14, VW, 28);
  if (k < 0.5) {
    // Le tengu poursuit le tanuki
    const u = k / 0.5;
    const tx = VW + 20 - u * (VW + 80);
    dessinerTanuki({ x: tx, y, dir: DIRECTIONS.gauche }, Math.abs(Math.sin(etat.temps * 14)), false);
    dessinerYokai({ x: tx + 34, y, def: YOKAI[0], mode: "actif", dir: DIRECTIONS.gauche, effraye: false });
  } else {
    // Puis le tanuki transforme, geant, le poursuit en sens inverse
    const u = (k - 0.5) / 0.5;
    const tx = -60 + u * (VW + 120);
    dessinerYokai({ x: tx + 40, y, def: YOKAI[0], mode: "actif", dir: DIRECTIONS.droite, effraye: true });
    contexte.save();
    contexte.translate(tx, y);
    contexte.scale(2.6, 2.6);
    contexte.translate(-tx, -y);
    dessinerTanuki({ x: tx, y, dir: DIRECTIONS.droite }, Math.abs(Math.sin(etat.temps * 14)), true);
    contexte.restore();
  }
  texteContour("ENTRACTE", VW / 2, y - 60, 22, "#ede8df");
}

function dessiner() {
  if (etat === null) {
    return;
  }
  const ctx = contexte;
  ctx.setTransform(echelle, 0, 0, echelle, 0, 0);
  ctx.fillStyle = "#0b0b10";
  ctx.fillRect(0, 0, VW, VH);
  dessinerHud();
  const d = effets.decalage();
  ctx.save();
  ctx.translate(d.x, HUD + d.y);

  if (etat.phase === "intermede") {
    dessinerIntermede();
    ctx.restore();
    return;
  }

  if (decor === null) {
    decor = { normal: peindreDecor(false), clair: peindreDecor(true) };
  }
  const clignote = etat.phase === "victoire" && Math.floor(etat.minuteurPhase * 6) % 2 === 0;
  ctx.drawImage(clignote ? decor.clair : decor.normal, 0, 0, VW, HAUTEUR);

  // Grains de riz et feuilles
  etat.grains.forEach((quoi, k) => {
    const [c, r] = k.split(",").map(Number);
    const x = centre(c);
    const y = centre(r);
    if (quoi === "grain") {
      ctx.fillStyle = THEME.grain;
      ctx.beginPath();
      ctx.ellipse(x, y, 1.3, 1.9, 0.5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const battement = 1 + Math.sin(etat.temps * 6) * 0.15;
      feuille(ctx, x, y, 4.4 * battement);
    }
  });

  if (etat.offrande !== null && (etat.offrande.reste > 2 || Math.floor(etat.temps * 8) % 2 === 0)) {
    dessinerOffrande(etat.offrande.nom, centre(BONUS.c), centre(BONUS.r));
  }

  if (etat.phase !== "mort" || etat.minuteurPhase > 1.3) {
    etat.yokai.forEach(dessinerYokai);
  }

  const t = etat.tanuki;
  if (etat.phase === "mort") {
    dessinerTanuki(t, 0, false, Math.min(1, (1.6 - etat.minuteurPhase) / 1.3));
  } else if (etat.phase !== "fin") {
    const ouverture = (t.dir.x || t.dir.y) ? Math.abs(Math.sin(t.bouche * 14)) : 0.3;
    dessinerTanuki(t, ouverture, etat.peur > 0);
  }

  effets.dessiner(ctx, "'Martian Mono', monospace");
  ctx.restore();

  if (etat.phase === "pret") {
    texteContour(etat.niveau > 1 ? "NIVEAU " + etat.niveau : "PRÊT ?", VW / 2, HUD + centre(11), 16, "#c8f060");
  }
  if (etat.pause) {
    voile("PAUSE", "P pour reprendre");
  } else if (etat.phase === "fin") {
    voile("PARTIE FINIE", etat.score.toLocaleString("fr-BE") + " points");
  }
}

function voile(titre, sousTitre) {
  const ctx = contexte;
  ctx.fillStyle = "rgba(7, 7, 11, 0.8)";
  ctx.fillRect(0, HUD, VW, HAUTEUR);
  texteContour(titre, VW / 2, HUD + HAUTEUR / 2 - 10, 28, "#c8f060");
  ctx.font = "600 8px 'Martian Mono', monospace";
  ctx.fillStyle = "#ede8df";
  ctx.textAlign = "center";
  ctx.fillText(sousTitre, VW / 2, HUD + HAUTEUR / 2 + 16);
}

// Taille : on garde la place des classements lateraux et de la manette
function ajuster() {
  const marge = window.innerWidth >= 1100 ? 500 : 0;
  const largeur = Math.min(window.innerWidth * 0.96 - marge, 640);
  const entete = zone.querySelector(".jeu-entete").getBoundingClientRect().height || 40;
  const manette = document.querySelector(".manette:not([hidden])");
  const hauteurManette = manette ? manette.getBoundingClientRect().height : 0;
  const hauteur = Math.max(260, window.innerHeight - entete - hauteurManette - 44);
  const taille = Math.min(largeur / VW, hauteur / VH);
  canvas.style.width = Math.floor(VW * taille) + "px";
  canvas.style.height = Math.floor(VH * taille) + "px";
  const nouvelle = Math.min(4, Math.max(1, taille * (window.devicePixelRatio || 1)));
  if (Math.abs(nouvelle - echelle) > 0.02 || canvas.width !== Math.round(VW * nouvelle)) {
    echelle = nouvelle;
    canvas.width = Math.round(VW * echelle);
    canvas.height = Math.round(VH * echelle);
    decor = null;
  }
}

window.addEventListener("resize", function () {
  if (!zone.hidden) {
    ajuster();
  }
});

const boucle = creerBoucle(function (delta) {
  maj(delta);
  dessiner();
}, { plafond: 0.04 });

// ---------------------------------------------------------------------
// En-tete et commandes
// ---------------------------------------------------------------------

function majHud() {
  if (etat === null) {
    return;
  }
  zoneScore.textContent = etat.score.toLocaleString("fr-BE");
  zoneNiveau.textContent = String(etat.niveau);
  zoneVies.textContent = String(Math.max(0, etat.vies));
}

function majBoutonSon() {
  boutonSon.textContent = sonActif() ? "Son" : "Muet";
  boutonSon.setAttribute("aria-pressed", String(!sonActif()));
}

function demarrer() {
  effets.vider();
  ajuster();
  requestAnimationFrame(ajuster);
  etat = nouvelEtat();
  nouveauNiveau();
  majScoreCourant(ID, 0);
  majBoutonSon();
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

const TOUCHES = {
  arrowup: "haut", z: "haut", w: "haut",
  arrowdown: "bas", s: "bas",
  arrowleft: "gauche", q: "gauche", a: "gauche",
  arrowright: "droite", d: "droite"
};

surTouche(ID, function (evenement) {
  const touche = evenement.key.toLowerCase();
  if (TOUCHES[touche] !== undefined) {
    directionVoulue = DIRECTIONS[TOUCHES[touche]];
  } else if (touche === "p" || touche === " ") {
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

// Sur telephone : un glissement n'importe ou dans la zone de jeu
surGlissement(zone, function (geste) {
  if (geste.tape) {
    return;
  }
  if (geste.horizontal) {
    directionVoulue = geste.deltaX > 0 ? DIRECTIONS.droite : DIRECTIONS.gauche;
  } else {
    directionVoulue = geste.deltaY > 0 ? DIRECTIONS.bas : DIRECTIONS.haut;
  }
}, { seuil: 14, actif: () => !zone.hidden });

// Le glissement ne doit pas faire defiler la page pendant la partie
zone.addEventListener("touchmove", function (evenement) {
  if (evenement.target === canvas) {
    evenement.preventDefault();
  }
}, { passive: false });

document.addEventListener("visibilitychange", function () {
  if (document.hidden && etat !== null && !etat.pause && etat.phase !== "fin" && !zone.hidden) {
    basculerPause();
  }
});

boutonSon.addEventListener("click", function () {
  basculerSon();
  majBoutonSon();
});
boutonRecommencer.addEventListener("click", demarrer);
boutonQuitter.addEventListener("click", quitterJeu);

enregistrerJeu({
  id: ID,
  nom: "Pac-Tanuki",
  code: "1980",
  section: zone,
  demarrer,
  manette: { a: "p", start: "p", quatreDirections: true, libelles: { a: "Pause" } },
  arreter: () => boucle.arreter()
});

// Pour les tests automatiques
export const _test = { get etat() { return etat; }, nouveauNiveau, transformer };
