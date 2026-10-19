// =====================================================================
//  OMAMORI CRUSH - moteur
//  Les regles, sans rien dessiner : grille 9 x 9, pieces, pieces
//  speciales, objectifs de niveau, generateur de niveaux sans fin.
//  Un coup renvoie une suite de "phases" (disparitions, chutes,
//  transformations, melange) que l'affichage anime une par une.
//
//  Pieces speciales, comme dans les jeux du genre :
//  - 4 alignes : piece rayee, qui vide sa ligne ou sa colonne ;
//  - en L ou en T : piece emballee, qui explose deux fois en 3 x 3 ;
//  - 5 alignes : daruma, qui efface toute une couleur.
//  Les speciales se combinent entre elles quand on les echange.
// =====================================================================

export const R = 9;
export const C = 9;
export const LANTERNE = -2;
export const DARUMA = -1;

// ---------------------------------------------------------------------
// Hasard reproductible : un niveau donne est toujours le meme
// ---------------------------------------------------------------------

export function hasard(graine) {
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
// Generateur de niveaux
// ---------------------------------------------------------------------

const FORMES = [
  ["xxxxxxxxx", "xxxxxxxxx", "xxxxxxxxx", "xxxxxxxxx", "xxxxxxxxx", "xxxxxxxxx", "xxxxxxxxx", "xxxxxxxxx", "xxxxxxxxx"],
  [".xxxxxxx.", "xxxxxxxxx", "xxxxxxxxx", "xxxxxxxxx", "xxxxxxxxx", "xxxxxxxxx", "xxxxxxxxx", "xxxxxxxxx", ".xxxxxxx."],
  ["..xxxxx..", ".xxxxxxx.", "xxxxxxxxx", "xxxxxxxxx", "xxxxxxxxx", "xxxxxxxxx", "xxxxxxxxx", ".xxxxxxx.", "..xxxxx.."],
  ["xxxxxxxxx", "xxxxxxxxx", ".xxxxxxx.", "..xxxxx..", "..xxxxx..", "..xxxxx..", ".xxxxxxx.", "xxxxxxxxx", "xxxxxxxxx"],
  ["xxx...xxx", "xxx...xxx", "xxxxxxxxx", "xxxxxxxxx", "xxxxxxxxx", "xxxxxxxxx", "xxxxxxxxx", "xxx...xxx", "xxx...xxx"],
  ["xxxxxxxxx", "xxxxxxxxx", "xxxxxxxxx", "xxx.x.xxx", "xxxxxxxxx", "xxx.x.xxx", "xxxxxxxxx", "xxxxxxxxx", "xxxxxxxxx"],
  ["..xxxxx..", "..xxxxx..", "xxxxxxxxx", "xxxxxxxxx", "xxxxxxxxx", "xxxxxxxxx", "xxxxxxxxx", "..xxxxx..", "..xxxxx.."],
  [".xxx.xxx.", "xxxxxxxxx", "xxxxxxxxx", "xxxxxxxxx", ".xxxxxxx.", "xxxxxxxxx", "xxxxxxxxx", "xxxxxxxxx", ".xxx.xxx."]
];

const OBJECTIFS_DEBUT = ["score", "collecte", "sceaux", "score", "lanternes", "sceaux", "collecte", "lanternes", "sceaux", "score"];

// Points moyens par coup, mesures par simulation (5 et 6 couleurs)
const POINTS_PAR_COUP = { 5: 1400, 6: 450 };

export function genererNiveau(n) {
  const alea = hasard(n * 7919 + 13);
  const choisir = liste => liste[Math.floor(alea() * liste.length)];
  const couleurs = n <= 9 ? 5 : alea() < Math.min(0.6, 0.15 + (n - 10) * 0.015) ? 6 : 5;
  const forme = n <= 3 ? FORMES[0] : n <= 10 ? choisir(FORMES.slice(0, 4)) : choisir(FORMES);
  const masque = forme.map(ligne => [...ligne].map(ch => ch === "x"));
  const type = n <= OBJECTIFS_DEBUT.length ? OBJECTIFS_DEBUT[n - 1] : choisir(["score", "collecte", "sceaux", "sceaux", "lanternes", "lanternes"]);
  const sceaux = Array.from({ length: R }, () => Array(C).fill(0));
  const pierres = Array.from({ length: R }, () => Array(C).fill(0));
  const difficulte = Math.min(1, n / 60);

  // Pierres a partir du niveau 6, de plus en plus nombreuses et dures
  if (n >= 6) {
    const nombre = Math.min(18, 3 + Math.floor(n / 4));
    let poses = 0;
    let essais = 0;
    while (poses < nombre && essais < 300) {
      essais++;
      const r = 3 + Math.floor(alea() * 4);
      const c = Math.floor(alea() * C);
      if (masque[r][c] && pierres[r][c] === 0) {
        pierres[r][c] = n >= 15 && alea() < 0.4 + difficulte * 0.4 ? 2 : 1;
        // On les pose par paires symetriques, plus jolies a l'oeil
        if (masque[r][C - 1 - c] && pierres[r][C - 1 - c] === 0 && c !== C - 1 - c) {
          pierres[r][C - 1 - c] = pierres[r][c];
          poses++;
        }
        poses++;
      }
    }
  }

  const objectif = { type };
  let coups = 24;
  if (type === "sceaux") {
    // Une zone de sceaux : un bloc central, des bandes, ou tout le bas
    const motif = n <= 3 ? 0 : Math.floor(alea() * 4);
    let total = 0;
    for (let r = 0; r < R; r++) {
      for (let c = 0; c < C; c++) {
        if (!masque[r][c] || pierres[r][c]) {
          continue;
        }
        const dedans =
          motif === 0 ? r >= 2 && r <= 6 && c >= 2 && c <= 6 :
          motif === 1 ? r >= 5 :
          motif === 2 ? (r + c) % 2 === 0 :
          r === 1 || r === 4 || r === 7 || c === 4;
        if (dedans) {
          sceaux[r][c] = n >= 8 && alea() < 0.2 + difficulte * 0.5 ? 2 : 1;
          total += sceaux[r][c];
        }
      }
    }
    coups = Math.round(Math.max(18, Math.min(42, total * 0.5 + 8 - n * 0.05)));
  } else if (type === "collecte") {
    const a = Math.floor(alea() * couleurs);
    let b = Math.floor(alea() * (couleurs - 1));
    if (b >= a) {
      b++;
    }
    const quantite = Math.round((18 + Math.min(42, Math.floor(n * 0.9))) * (couleurs === 6 ? 0.75 : 1));
    objectif.cibles = n <= 6 ? [{ type: a, quantite }] : [{ type: a, quantite }, { type: b, quantite: Math.round(quantite * 0.8) }];
    coups = 22;
  } else if (type === "lanternes") {
    objectif.total = Math.min(5, 2 + Math.floor(n / 9));
    coups = 18 + objectif.total * 5;
  } else {
    coups = 20;
  }
  // Les niveaux avancent : un peu moins de marge, jamais trop
  coups = Math.max(14, Math.round(coups * (1 - difficulte * 0.18)));
  if (pierres.flat().some(Boolean)) {
    coups += 3;
  }
  // Six couleurs, c'est beaucoup moins d'alignements : plus de coups
  if (couleurs === 6) {
    coups = Math.round(coups * 1.2);
  }

  const ppm = POINTS_PAR_COUP[couleurs];
  const arrondi = v => Math.max(1000, Math.round(v / 500) * 500);
  objectif.score = type === "score" ? arrondi(coups * ppm * (couleurs === 5 ? 0.72 : 0.85)) : 0;
  // Une etoile en reussissant, les deux autres se gagnent au score
  const etoiles = [type === "score" ? objectif.score : 1000, arrondi(coups * ppm * 1.6), arrondi(coups * ppm * 2.6)];

  return { n, couleurs, masque, sceaux, pierres, coups, objectif, etoiles, graine: n * 104729 + 7 };
}

// ---------------------------------------------------------------------
// Partie
// ---------------------------------------------------------------------

export function creerPartie(niveau, graine) {
  const etat = {
    niveau,
    alea: hasard(graine === undefined ? niveau.graine : graine),
    prochainId: 1,
    coups: niveau.coups,
    score: 0,
    cases: [],
    g: [],
    collecte: {},
    lanternesLivrees: 0,
    finie: false
  };
  for (let r = 0; r < R; r++) {
    etat.cases.push([]);
    etat.g.push([]);
    for (let c = 0; c < C; c++) {
      etat.cases[r].push({ jouable: niveau.masque[r][c], sceau: niveau.sceaux[r][c], pierre: niveau.pierres[r][c] });
      etat.g[r].push(null);
    }
  }
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      if (libre(etat, r, c)) {
        let type;
        do {
          type = Math.floor(etat.alea() * niveau.couleurs);
        } while (creeAlignement(etat, r, c, type));
        etat.g[r][c] = nouvellePiece(etat, type);
      }
    }
  }
  // Premieres lanternes en haut du plateau
  if (niveau.objectif.type === "lanternes") {
    const colonnes = [2, 6];
    colonnes.forEach(c => {
      for (let r = 0; r < R; r++) {
        if (etat.g[r][c]) {
          etat.g[r][c] = nouvellePiece(etat, LANTERNE);
          break;
        }
      }
    });
  }
  if (!coupPossible(etat)) {
    melanger(etat);
  }
  return etat;
}

function nouvellePiece(etat, type, special) {
  return { id: etat.prochainId++, type, special: special || null };
}

function dans(r, c) {
  return r >= 0 && r < R && c >= 0 && c < C;
}

// Une case qui peut porter une piece
export function libre(etat, r, c) {
  return dans(r, c) && etat.cases[r][c].jouable && etat.cases[r][c].pierre === 0;
}

function typeA(etat, r, c) {
  if (!dans(r, c)) {
    return null;
  }
  const p = etat.g[r][c];
  return p && p.type >= 0 ? p.type : null;
}

function creeAlignement(etat, r, c, type) {
  return (typeA(etat, r, c - 1) === type && typeA(etat, r, c - 2) === type) ||
    (typeA(etat, r - 1, c) === type && typeA(etat, r - 2, c) === type);
}

export function objectifAtteint(etat) {
  const o = etat.niveau.objectif;
  if (o.type === "score") {
    return etat.score >= o.score;
  }
  if (o.type === "collecte") {
    return o.cibles.every(cible => (etat.collecte[cible.type] || 0) >= cible.quantite);
  }
  if (o.type === "sceaux") {
    return sceauxRestants(etat) === 0;
  }
  return etat.lanternesLivrees >= o.total;
}

export function sceauxRestants(etat) {
  let n = 0;
  etat.cases.forEach(ligne => ligne.forEach(k => {
    n += k.sceau;
  }));
  return n;
}

export function etoilesPour(etat) {
  return etat.niveau.etoiles.filter(s => etat.score >= s).length;
}

function copieCases(etat) {
  return etat.cases.map(ligne => ligne.map(k => ({ sceau: k.sceau, pierre: k.pierre })));
}

// ---------------------------------------------------------------------
// Alignements
// ---------------------------------------------------------------------

function trouverGroupes(etat) {
  const runs = [];
  for (let r = 0; r < R; r++) {
    let c = 0;
    while (c < C) {
      const t = typeA(etat, r, c);
      let fin = c + 1;
      while (t !== null && typeA(etat, r, fin) === t) {
        fin++;
      }
      if (t !== null && fin - c >= 3) {
        runs.push({ dir: "h", cases: Array.from({ length: fin - c }, (_, i) => [r, c + i]) });
      }
      c = fin;
    }
  }
  for (let c = 0; c < C; c++) {
    let r = 0;
    while (r < R) {
      const t = typeA(etat, r, c);
      let fin = r + 1;
      while (t !== null && typeA(etat, fin, c) === t) {
        fin++;
      }
      if (t !== null && fin - r >= 3) {
        runs.push({ dir: "v", cases: Array.from({ length: fin - r }, (_, i) => [r + i, c]) });
      }
      r = fin;
    }
  }
  // Les alignements qui se touchent forment un seul groupe (L, T, croix)
  const groupes = [];
  runs.forEach(run => {
    const cles = new Set(run.cases.map(([r, c]) => r * C + c));
    const lies = groupes.filter(g => run.cases.some(([r, c]) => g.cles.has(r * C + c)));
    if (lies.length === 0) {
      groupes.push({ cles, runs: [run] });
    } else {
      const g = lies[0];
      run.cases.forEach(([r, c]) => g.cles.add(r * C + c));
      g.runs.push(run);
      lies.slice(1).forEach(autre => {
        autre.cles.forEach(k => g.cles.add(k));
        g.runs.push(...autre.runs);
        groupes.splice(groupes.indexOf(autre), 1);
      });
    }
  });
  return groupes;
}

function specialDuGroupe(groupe, swap) {
  const plusLong = Math.max(...groupe.runs.map(r => r.cases.length));
  const dirs = new Set(groupe.runs.map(r => r.dir));
  let special = null;
  if (plusLong >= 5) {
    special = "daruma";
  } else if (dirs.size === 2) {
    special = "emballe";
  } else if (plusLong === 4) {
    const dir = groupe.runs.find(r => r.cases.length === 4).dir;
    special = swap && swap.dir ? swap.dir : dir === "h" ? "v" : "h";
  }
  if (special === null) {
    return null;
  }
  // Ou poser la piece creee : la case jouee, sinon l'intersection, sinon le milieu
  let cle = null;
  if (swap) {
    [swap.a, swap.b].forEach(p => {
      if (p && groupe.cles.has(p[0] * C + p[1])) {
        cle = p[0] * C + p[1];
      }
    });
  }
  if (cle === null && special === "emballe") {
    const compte = new Map();
    groupe.runs.forEach(run => run.cases.forEach(([r, c]) => compte.set(r * C + c, (compte.get(r * C + c) || 0) + 1)));
    cle = [...compte.entries()].find(([, n]) => n > 1)[0];
  }
  if (cle === null) {
    const run = groupe.runs.reduce((a, b) => (b.cases.length > a.cases.length ? b : a));
    const m = run.cases[Math.floor(run.cases.length / 2)];
    cle = m[0] * C + m[1];
  }
  return { special, r: Math.floor(cle / C), c: cle % C };
}

// ---------------------------------------------------------------------
// Declenchement des speciales
// ---------------------------------------------------------------------

function couleurLaPlusPresente(etat) {
  const compte = {};
  etat.g.forEach(ligne => ligne.forEach(p => {
    if (p && p.type >= 0) {
      compte[p.type] = (compte[p.type] || 0) + 1;
    }
  }));
  let meilleur = 0;
  let max = -1;
  Object.entries(compte).forEach(([t, n]) => {
    if (n > max) {
      max = n;
      meilleur = Number(t);
    }
  });
  return meilleur;
}

// Ajoute a "zone" tout ce que la speciale en (r, c) emporte, en cascade
function declencher(etat, r, c, zone, effets, dejaFaits, armes) {
  const p = etat.g[r][c];
  if (!p || !p.special || dejaFaits.has(p.id)) {
    return;
  }
  dejaFaits.add(p.id);
  const ajouts = [];
  if (p.special === "h") {
    for (let x = 0; x < C; x++) {
      ajouts.push([r, x]);
    }
    effets.push({ type: "rayon", dir: "h", r, c });
  } else if (p.special === "v") {
    for (let y = 0; y < R; y++) {
      ajouts.push([y, c]);
    }
    effets.push({ type: "rayon", dir: "v", r, c });
  } else if (p.special === "emballe" || p.special === "arme") {
    for (let y = r - 1; y <= r + 1; y++) {
      for (let x = c - 1; x <= c + 1; x++) {
        ajouts.push([y, x]);
      }
    }
    effets.push({ type: "explosion", r, c, rayon: 1 });
    if (p.special === "emballe") {
      armes.add(p.id);
    }
  } else if (p.special === "daruma") {
    const t = couleurLaPlusPresente(etat);
    etat.g.forEach((ligne, y) => ligne.forEach((q, x) => {
      if (q && q.type === t) {
        ajouts.push([y, x]);
      }
    }));
    effets.push({ type: "daruma", r, c, cibles: ajouts.map(a => a.slice()) });
  }
  ajouts.forEach(([y, x]) => {
    if (dans(y, x)) {
      zone.add(y * C + x);
      declencher(etat, y, x, zone, effets, dejaFaits, armes);
    }
  });
}

// ---------------------------------------------------------------------
// Application d'une disparition
// ---------------------------------------------------------------------

function appliquer(etat, zone, creations, effets, cascade, groupes, armes, souffle) {
  const retires = [];
  const transformes = [];
  const points = [];
  const pierresTouchees = new Set();
  const garder = new Set(creations.map(k => k.r * C + k.c));

  // Chaque groupe aligne rapporte, plus encore en cascade
  (groupes || []).forEach(g => {
    const n = g.cles.size;
    const valeur = (n >= 5 ? 200 : n === 4 ? 120 : 60) * cascade;
    etat.score += valeur;
    const premier = [...g.cles][0];
    points.push({ r: Math.floor(premier / C), c: premier % C, valeur });
    // Une pierre a cote d'un alignement se fissure
    g.cles.forEach(k => {
      const r = Math.floor(k / C);
      const c = k % C;
      [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].forEach(([y, x]) => {
        if (dans(y, x) && etat.cases[y][x].pierre > 0) {
          pierresTouchees.add(y * C + x);
        }
      });
    });
  });

  let parSouffle = 0;
  zone.forEach(k => {
    const r = Math.floor(k / C);
    const c = k % C;
    const kase = etat.cases[r][c];
    if (!kase.jouable) {
      return;
    }
    if (kase.pierre > 0) {
      pierresTouchees.add(k);
      return;
    }
    const p = etat.g[r][c];
    if (!p || p.type === LANTERNE) {
      return;
    }
    if (kase.sceau > 0) {
      kase.sceau--;
      etat.score += 1000;
      points.push({ r, c, valeur: 1000 });
    }
    if (garder.has(k)) {
      return;
    }
    if (armes.has(p.id) && p.special === "emballe") {
      // L'emballee explose une premiere fois et reste, armee
      p.special = "arme";
      transformes.push({ id: p.id, special: "arme", type: p.type });
      return;
    }
    if (p.type >= 0) {
      etat.collecte[p.type] = (etat.collecte[p.type] || 0) + 1;
    }
    retires.push(p.id);
    etat.g[r][c] = null;
    parSouffle++;
  });
  if (souffle) {
    const valeur = parSouffle * 60 * Math.max(1, cascade - 1);
    etat.score += valeur;
    if (valeur > 0) {
      points.push({ r: souffle.r, c: souffle.c, valeur });
    }
  }
  pierresTouchees.forEach(k => {
    const kase = etat.cases[Math.floor(k / C)][k % C];
    kase.pierre = Math.max(0, kase.pierre - 1);
    etat.score += 200;
  });
  creations.forEach(k => {
    const p = etat.g[k.r][k.c];
    if (p) {
      if (p.type >= 0) {
        etat.collecte[p.type] = (etat.collecte[p.type] || 0) + 0;
      }
      p.special = k.special;
      if (k.special === "daruma") {
        p.type = DARUMA;
      }
      transformes.push({ id: p.id, special: p.special, type: p.type });
      etat.score += k.special === "daruma" ? 200 : k.special === "emballe" ? 200 : 120;
    }
  });
  return { type: "disparition", retires, transformes, effets, points, cases: copieCases(etat), cascade };
}

// ---------------------------------------------------------------------
// Gravite et remplissage
// ---------------------------------------------------------------------

function sortieDeColonne(etat, c) {
  for (let r = R - 1; r >= 0; r--) {
    if (etat.cases[r][c].jouable) {
      return etat.cases[r][c].pierre === 0 ? r : -1;
    }
  }
  return -1;
}

function lanternesEnJeu(etat) {
  let n = 0;
  etat.g.forEach(l => l.forEach(p => {
    if (p && p.type === LANTERNE) {
      n++;
    }
  }));
  return n;
}

function gravite(etat) {
  const mouvements = [];
  const nouveaux = [];
  const o = etat.niveau.objectif;
  for (let c = 0; c < C; c++) {
    // Segments de cases libres, separes par les trous et les pierres
    let r = R - 1;
    while (r >= 0) {
      if (!libre(etat, r, c)) {
        r--;
        continue;
      }
      const bas = r;
      while (r >= 0 && libre(etat, r, c)) {
        r--;
      }
      const haut = r + 1;
      const pieces = [];
      for (let y = bas; y >= haut; y--) {
        if (etat.g[y][c]) {
          pieces.push({ p: etat.g[y][c], de: y });
        }
        etat.g[y][c] = null;
      }
      let y = bas;
      pieces.forEach(({ p, de }) => {
        etat.g[y][c] = p;
        if (de !== y) {
          mouvements.push({ id: p.id, r: y, c, de });
        }
        y--;
      });
      let decalage = 1;
      while (y >= haut) {
        let type = Math.floor(etat.alea() * etat.niveau.couleurs);
        if (o.type === "lanternes" && etat.lanternesLivrees + lanternesEnJeu(etat) < o.total && lanternesEnJeu(etat) < 2 && etat.alea() < 0.12) {
          type = LANTERNE;
        }
        const p = nouvellePiece(etat, type);
        etat.g[y][c] = p;
        nouveaux.push({ id: p.id, type: p.type, special: null, r: y, c, de: haut - decalage });
        decalage++;
        y--;
      }
    }
  }
  return { type: "chute", mouvements, nouveaux, cases: copieCases(etat) };
}

function livrerLanternes(etat) {
  const livrees = [];
  for (let c = 0; c < C; c++) {
    const r = sortieDeColonne(etat, c);
    if (r >= 0 && etat.g[r][c] && etat.g[r][c].type === LANTERNE) {
      livrees.push({ id: etat.g[r][c].id, r, c });
      etat.g[r][c] = null;
      etat.lanternesLivrees++;
      etat.score += 10000;
    }
  }
  return livrees.length ? { type: "livraison", livrees, cases: copieCases(etat) } : null;
}

// ---------------------------------------------------------------------
// Cascade complete apres un coup
// ---------------------------------------------------------------------

function resoudre(etat, phases, swap, premiereZone) {
  let cascade = 1;
  let zoneImposee = premiereZone || null;
  for (let tour = 0; tour < 60; tour++) {
    const effets = [];
    const dejaFaits = new Set();
    const armes = new Set();
    let zone = new Set();
    let creations = [];
    let groupes = [];
    let souffle = null;

    // Les emballees armees explosent une seconde fois apres la chute
    const armees = [];
    etat.g.forEach((ligne, r) => ligne.forEach((p, c) => {
      if (p && p.special === "arme") {
        armees.push([r, c]);
      }
    }));

    if (zoneImposee) {
      zone = zoneImposee.zone;
      zoneImposee.effets.forEach(e => effets.push(e));
      souffle = zoneImposee.souffle;
      zoneImposee.declenchees.forEach(id => dejaFaits.add(id));
      zoneImposee = null;
    } else {
      groupes = trouverGroupes(etat);
      if (groupes.length === 0 && armees.length === 0) {
        break;
      }
      groupes.forEach(g => {
        g.cles.forEach(k => zone.add(k));
        const s = specialDuGroupe(g, cascade === 1 ? swap : null);
        if (s) {
          creations.push(s);
        }
      });
      if (armees.length) {
        souffle = { r: armees[0][0], c: armees[0][1] };
      }
    }
    armees.forEach(([r, c]) => {
      zone.add(r * C + c);
    });
    // Les speciales prises dans la zone partent a leur tour
    const garder = new Set(creations.map(k => k.r * C + k.c));
    [...zone].forEach(k => {
      const r = Math.floor(k / C);
      const c = k % C;
      const p = etat.g[r][c];
      if (p && p.special && !garder.has(k)) {
        if (p.special === "arme") {
          // seconde explosion : elle part vraiment cette fois
          dejaFaits.add(p.id);
          for (let y = r - 1; y <= r + 1; y++) {
            for (let x = c - 1; x <= c + 1; x++) {
              if (dans(y, x)) {
                zone.add(y * C + x);
              }
            }
          }
          effets.push({ type: "explosion", r, c, rayon: 1 });
          p.special = null;
        } else {
          declencher(etat, r, c, zone, effets, dejaFaits, armes);
        }
      }
    });
    if (effets.length && !souffle) {
      souffle = { r: Math.floor([...zone][0] / C), c: [...zone][0] % C };
    }
    phases.push(appliquer(etat, zone, creations, effets, cascade, groupes, armes, effets.length ? souffle : null));
    phases.push(gravite(etat));
    let livraison = livrerLanternes(etat);
    while (livraison) {
      phases.push(livraison);
      phases.push(gravite(etat));
      livraison = livrerLanternes(etat);
    }
    cascade++;
  }
  if (!coupPossible(etat)) {
    phases.push(melanger(etat));
  }
}

// ---------------------------------------------------------------------
// Jouer un coup
// ---------------------------------------------------------------------

export function voisins(a, b) {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;
}

function echanger(etat, a, b) {
  const t = etat.g[a[0]][a[1]];
  etat.g[a[0]][a[1]] = etat.g[b[0]][b[1]];
  etat.g[b[0]][b[1]] = t;
}

function zoneCombo(etat, a, b) {
  const pa = etat.g[a[0]][a[1]];
  const pb = etat.g[b[0]][b[1]];
  const zone = new Set();
  const effets = [];
  const declenchees = [];
  const transformations = [];
  const sa = pa.special;
  const sb = pb.special;
  const ajouterLigne = r => {
    for (let x = 0; x < C; x++) {
      zone.add(r * C + x);
    }
  };
  const ajouterColonne = c => {
    for (let y = 0; y < R; y++) {
      zone.add(y * C + c);
    }
  };
  const [r, c] = b;
  const raye = s => s === "h" || s === "v";
  const emb = s => s === "emballe" || s === "arme";

  if (sa === "daruma" && sb === "daruma") {
    for (let k = 0; k < R * C; k++) {
      zone.add(k);
    }
    effets.push({ type: "grandDaruma", r, c });
    declenchees.push(pa.id, pb.id);
  } else if (sa === "daruma" || sb === "daruma") {
    const daruma = sa === "daruma" ? pa : pb;
    const autre = sa === "daruma" ? pb : pa;
    const posD = sa === "daruma" ? a : b;
    const cibles = [];
    if (autre.type === LANTERNE) {
      return null;
    }
    etat.g.forEach((ligne, y) => ligne.forEach((q, x) => {
      if (q && q.type === autre.type && q !== daruma) {
        cibles.push([y, x]);
        zone.add(y * C + x);
        if (raye(autre.special) || emb(autre.special)) {
          // Toute la couleur devient speciale, puis tout part
          const sp = raye(autre.special) ? (etat.alea() < 0.5 ? "h" : "v") : "emballe";
          q.special = sp;
          transformations.push({ id: q.id, special: sp, type: q.type });
        }
      }
    }));
    zone.add(posD[0] * C + posD[1]);
    declenchees.push(daruma.id);
    effets.push({ type: "daruma", r: posD[0], c: posD[1], cibles });
  } else if (raye(sa) && raye(sb)) {
    ajouterLigne(r);
    ajouterColonne(c);
    effets.push({ type: "rayon", dir: "h", r, c }, { type: "rayon", dir: "v", r, c });
    declenchees.push(pa.id, pb.id);
  } else if ((raye(sa) && emb(sb)) || (emb(sa) && raye(sb))) {
    for (let d = -1; d <= 1; d++) {
      if (dans(r + d, 0)) {
        ajouterLigne(r + d);
      }
      if (dans(0, c + d)) {
        ajouterColonne(c + d);
      }
      effets.push({ type: "rayon", dir: "h", r: r + d, c }, { type: "rayon", dir: "v", r, c: c + d });
    }
    declenchees.push(pa.id, pb.id);
  } else if (emb(sa) && emb(sb)) {
    for (let y = r - 2; y <= r + 2; y++) {
      for (let x = c - 2; x <= c + 2; x++) {
        if (dans(y, x)) {
          zone.add(y * C + x);
        }
      }
    }
    effets.push({ type: "explosion", r, c, rayon: 2 });
    declenchees.push(pa.id, pb.id);
  } else {
    return null;
  }
  return { zone, effets, declenchees, transformations, souffle: { r, c } };
}

export function jouer(etat, a, b) {
  const phases = [];
  if (!voisins(a, b) || !libre(etat, a[0], a[1]) || !libre(etat, b[0], b[1])) {
    return { valide: false, phases };
  }
  const pa = etat.g[a[0]][a[1]];
  const pb = etat.g[b[0]][b[1]];
  if (!pa || !pb) {
    return { valide: false, phases };
  }
  const dir = a[0] === b[0] ? "h" : "v";
  // Echange de deux speciales, ou d'un daruma : effet immediat
  const combo = (pa.special && pb.special) || pa.special === "daruma" || pb.special === "daruma"
    ? zoneCombo(etat, a, b)
    : null;
  echanger(etat, a, b);
  phases.push({ type: "echange", a, b, ida: pa.id, idb: pb.id });
  if (combo) {
    etat.coups--;
    if (combo.transformations.length) {
      phases.push({ type: "transformation", transformes: combo.transformations });
    }
    resoudre(etat, phases, null, combo);
    return { valide: true, phases };
  }
  if (trouverGroupes(etat).length === 0) {
    echanger(etat, a, b);
    phases.push({ type: "echange", a: b, b: a, ida: pa.id, idb: pb.id, retour: true });
    return { valide: false, phases };
  }
  etat.coups--;
  resoudre(etat, phases, { a, b, dir });
  return { valide: true, phases };
}

// ---------------------------------------------------------------------
// Coups possibles, indice, melange
// ---------------------------------------------------------------------

function coupValable(etat, a, b) {
  if (!libre(etat, a[0], a[1]) || !libre(etat, b[0], b[1])) {
    return false;
  }
  const pa = etat.g[a[0]][a[1]];
  const pb = etat.g[b[0]][b[1]];
  if (!pa || !pb) {
    return false;
  }
  if ((pa.special && pb.special) || ((pa.special === "daruma" || pb.special === "daruma") && pa.type !== LANTERNE && pb.type !== LANTERNE)) {
    return true;
  }
  echanger(etat, a, b);
  const ok = [a, b].some(([r, c]) => {
    const t = typeA(etat, r, c);
    if (t === null) {
      return false;
    }
    let h = 1;
    for (let x = c - 1; typeA(etat, r, x) === t; x--) {
      h++;
    }
    for (let x = c + 1; typeA(etat, r, x) === t; x++) {
      h++;
    }
    let v = 1;
    for (let y = r - 1; typeA(etat, y, c) === t; y--) {
      v++;
    }
    for (let y = r + 1; typeA(etat, y, c) === t; y++) {
      v++;
    }
    return h >= 3 || v >= 3;
  });
  echanger(etat, a, b);
  return ok;
}

export function tousLesCoups(etat) {
  const liste = [];
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      if (coupValable(etat, [r, c], [r, c + 1])) {
        liste.push([[r, c], [r, c + 1]]);
      }
      if (coupValable(etat, [r, c], [r + 1, c])) {
        liste.push([[r, c], [r + 1, c]]);
      }
    }
  }
  return liste;
}

export function coupPossible(etat) {
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      if (coupValable(etat, [r, c], [r, c + 1]) || coupValable(etat, [r, c], [r + 1, c])) {
        return true;
      }
    }
  }
  return false;
}

export function melanger(etat) {
  const places = [];
  const pieces = [];
  etat.g.forEach((ligne, r) => ligne.forEach((p, c) => {
    if (p && !p.special && p.type >= 0) {
      places.push([r, c]);
      pieces.push(p);
    }
  }));
  for (let essai = 0; essai < 200; essai++) {
    for (let i = pieces.length - 1; i > 0; i--) {
      const j = Math.floor(etat.alea() * (i + 1));
      [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
    }
    places.forEach(([r, c], i) => {
      etat.g[r][c] = pieces[i];
    });
    if (trouverGroupes(etat).length === 0 && coupPossible(etat)) {
      break;
    }
    if (essai > 150) {
      // Plateau vraiment bloque : on change quelques couleurs
      pieces.forEach(p => {
        p.type = Math.floor(etat.alea() * etat.niveau.couleurs);
      });
    }
  }
  return { type: "melange", positions: places.map(([r, c]) => ({ id: etat.g[r][c].id, r, c })) };
}

// ---------------------------------------------------------------------
// Fete finale : chaque coup restant devient une piece rayee qui part
// ---------------------------------------------------------------------

export function feteFinale(etat) {
  const phases = [];
  const transformes = [];
  const normales = [];
  etat.g.forEach((ligne, r) => ligne.forEach((p, c) => {
    if (p && p.type >= 0 && !p.special) {
      normales.push(p);
    }
  }));
  while (etat.coups > 0 && normales.length) {
    const i = Math.floor(etat.alea() * normales.length);
    const p = normales.splice(i, 1)[0];
    p.special = etat.alea() < 0.5 ? "h" : "v";
    transformes.push({ id: p.id, special: p.special, type: p.type });
    etat.coups--;
    etat.score += 3000;
  }
  if (transformes.length) {
    phases.push({ type: "transformation", transformes, finale: true });
  }
  // Toutes les speciales du plateau partent ensemble
  const zone = new Set();
  etat.g.forEach((ligne, r) => ligne.forEach((p, c) => {
    if (p && p.special) {
      zone.add(r * C + c);
    }
  }));
  if (zone.size) {
    resoudre(etat, phases, null, { zone, effets: [], declenchees: [], souffle: null });
  }
  return phases;
}
