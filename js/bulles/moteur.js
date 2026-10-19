// =====================================================================
//  BUBBLE SHOOTER - moteur
//  Les regles, sans rien dessiner. Unites : une bulle fait 1 de
//  diametre. La grille est hexagonale : les rangees decalees ont une
//  case de moins. Un tir renvoie sa trajectoire, la case d'arrivee et
//  ce qui eclate ou tombe ; l'affichage n'a plus qu'a l'animer.
// =====================================================================

export const COLS = 10;
export const PAS_Y = 0.8660254;          // hauteur d'une rangee
export const LIGNE_MORT = 12;            // rangee (plafond compris) qui fait perdre
export const LANCEUR = { x: COLS / 2, y: 0.5 + LIGNE_MORT * PAS_Y + 1.5 };
export const ANGLE_MAX = 80 * Math.PI / 180;

export const PIERRE = "pierre";
export const LANTERNE = "lanterne";
export const BOMBE = "bombe";
export const ARC = "arc";

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
// Geometrie de la grille
// ---------------------------------------------------------------------

export function decalee(etat, r) {
  return ((r + etat.decalage) % 2 + 2) % 2 === 1;
}

export function largeurRangee(etat, r) {
  return decalee(etat, r) ? COLS - 1 : COLS;
}

export function position(etat, r, c) {
  return { x: c + 0.5 + (decalee(etat, r) ? 0.5 : 0), y: 0.5 + (r + etat.plafond) * PAS_Y };
}

export function voisins(etat, r, c) {
  const liste = decalee(etat, r)
    ? [[r, c - 1], [r, c + 1], [r - 1, c], [r - 1, c + 1], [r + 1, c], [r + 1, c + 1]]
    : [[r, c - 1], [r, c + 1], [r - 1, c - 1], [r - 1, c], [r + 1, c - 1], [r + 1, c]];
  return liste.filter(([y, x]) => y >= 0 && x >= 0 && x < largeurRangee(etat, y));
}

function cellule(etat, r, c) {
  return etat.g[r] && etat.g[r][c] ? etat.g[r][c] : null;
}

function assurerRangee(etat, r) {
  while (etat.g.length <= r) {
    etat.g.push(Array(COLS).fill(null));
  }
}

let prochainId = 1;
function bulle(type, couleur) {
  return { id: prochainId++, type, couleur };
}

// ---------------------------------------------------------------------
// Niveaux
// ---------------------------------------------------------------------

export function genererNiveau(n) {
  const alea = hasard(n * 9301 + 49297);
  const couleurs = n <= 3 ? 3 : n <= 9 ? 4 : n <= 24 ? 5 : 6;
  const lignes = Math.min(10, 5 + Math.floor(n / 3));
  const type = n <= 2 ? "vider" : ["vider", "lanternes", "score"][n % 3];
  const motif = Math.floor(alea() * 4);
  const etat = { decalage: 0, plafond: 0 };
  const grille = [];
  for (let r = 0; r < lignes; r++) {
    const ligne = Array(COLS).fill(null);
    const largeur = largeurRangee(etat, r);
    for (let c = 0; c < largeur; c++) {
      // Formes symetriques : on remplit la moitie et on reflete
      const miroir = largeur - 1 - c;
      if (c > miroir && grille[r] === undefined) {
        ligne[c] = ligne[miroir] ? { ...ligne[miroir] } : null;
        continue;
      }
      let vide = false;
      if (motif === 1 && r > 2 && (c === Math.floor(largeur / 2) || c === Math.floor((largeur - 1) / 2))) {
        vide = true;
      }
      if (motif === 2 && r >= lignes - 2 && (c < 2 || c > largeur - 3)) {
        vide = true;
      }
      if (vide) {
        continue;
      }
      let couleur;
      if (motif === 3) {
        couleur = (Math.floor(c / 2) + r) % couleurs;
      } else if (c > 0 && ligne[c - 1] && alea() < 0.3) {
        couleur = ligne[c - 1].couleur;
      } else if (r > 0 && grille[r - 1][c] && alea() < 0.22) {
        couleur = grille[r - 1][c].couleur;
      } else {
        couleur = Math.floor(alea() * couleurs);
      }
      ligne[c] = { type: "normale", couleur };
    }
    grille.push(ligne);
  }
  // Pierres et lanternes
  // Pas de pierres sur les niveaux de lanternes : une lanterne tenue par
  // des pierres ne pourrait plus tomber
  if (n >= 6 && type !== "lanternes") {
    const pierres = Math.min(8, 1 + Math.floor((n - 6) / 3));
    for (let k = 0; k < pierres; k++) {
      const r = 1 + Math.floor(alea() * (lignes - 1));
      const c = Math.floor(alea() * largeurRangee(etat, r));
      if (grille[r][c]) {
        grille[r][c] = { type: PIERRE, couleur: -1 };
      }
    }
  }
  let lanternes = 0;
  if (type === "lanternes") {
    const voulu = Math.min(4, 2 + Math.floor(n / 12));
    let essais = 0;
    while (lanternes < voulu && essais < 100) {
      essais++;
      const r = Math.max(1, lignes - 1 - Math.floor(alea() * 3));
      const c = Math.floor(alea() * largeurRangee(etat, r));
      if (grille[r][c] && grille[r][c].type === "normale") {
        grille[r][c] = { type: LANTERNE, couleur: -1 };
        lanternes++;
      }
    }
  }
  const total = grille.flat().filter(Boolean).length;
  const niveau = {
    n, couleurs, grille, type, lanternes,
    ratesAvantDescente: Math.max(5, 8 - Math.floor(n / 10)),
    tirsMax: type === "score" ? 22 + Math.floor(lignes * 1.5) : 0,
    cible: type === "score" ? Math.round(total * 28 / 50) * 50 : 0,
    par: Math.ceil(total / 2.4),
    graine: n * 7717 + 3
  };
  return niveau;
}

// ---------------------------------------------------------------------
// Partie
// ---------------------------------------------------------------------

export function creerPartie(niveau, mode) {
  const etat = {
    mode: mode || "niveau",
    niveau,
    alea: hasard(niveau ? niveau.graine : Date.now() & 0xffffff),
    g: [],
    decalage: 0,
    plafond: 0,
    score: 0,
    tirs: 0,
    rates: 0,
    lanternesLibres: 0,
    file: [],
    perdu: false,
    tirsDepuisAjout: 0
  };
  if (niveau) {
    niveau.grille.forEach((ligne, r) => {
      assurerRangee(etat, r);
      ligne.forEach((b, c) => {
        if (b) {
          etat.g[r][c] = bulle(b.type, b.couleur);
        }
      });
    });
    etat.couleurs = niveau.couleurs;
  } else {
    etat.couleurs = 4;
    for (let r = 0; r < 6; r++) {
      ajouterRangeeHaut(etat);
    }
  }
  etat.file = [nouvelleMunition(etat), nouvelleMunition(etat)];
  return etat;
}

function couleursPresentes(etat) {
  const set = new Set();
  etat.g.forEach(l => l.forEach(b => {
    if (b && b.type === "normale") {
      set.add(b.couleur);
    }
  }));
  return [...set];
}

function nouvelleMunition(etat, special) {
  if (special) {
    return bulle(special, -1);
  }
  const presentes = couleursPresentes(etat);
  const choix = presentes.length ? presentes : Array.from({ length: etat.couleurs }, (_, i) => i);
  return bulle("normale", choix[Math.floor(etat.alea() * choix.length)]);
}

// Le mode sans fin pousse une rangee neuve par le haut
function ajouterRangeeHaut(etat) {
  etat.decalage = (etat.decalage + 1) % 2;
  const ligne = Array(COLS).fill(null);
  const largeur = largeurRangee(etat, 0);
  for (let c = 0; c < largeur; c++) {
    const couleur = c > 0 && etat.alea() < 0.45 ? ligne[c - 1].couleur : Math.floor(etat.alea() * etat.couleurs);
    ligne[c] = bulle(etat.alea() < 0.02 ? PIERRE : "normale", couleur);
    if (ligne[c].type === PIERRE) {
      ligne[c].couleur = -1;
    }
  }
  etat.g.unshift(ligne);
}

export function echanger(etat) {
  etat.file.reverse();
}

// ---------------------------------------------------------------------
// Trajectoire
// ---------------------------------------------------------------------

export function trajectoire(etat, angle) {
  const a = Math.max(-ANGLE_MAX, Math.min(ANGLE_MAX, angle));
  let x = LANCEUR.x;
  let y = LANCEUR.y;
  let dx = Math.sin(a);
  let dy = -Math.cos(a);
  const points = [{ x, y }];
  const pas = 0.04;
  const plafondY = 0.5 + etat.plafond * PAS_Y;
  for (let i = 0; i < 4000; i++) {
    x += dx * pas;
    y += dy * pas;
    if (x < 0.5) {
      x = 1 - x;
      dx = -dx;
      points.push({ x: 0.5, y });
    } else if (x > COLS - 0.5) {
      x = 2 * (COLS - 0.5) - x;
      dx = -dx;
      points.push({ x: COLS - 0.5, y });
    }
    if (y <= plafondY) {
      points.push({ x, y: plafondY });
      return { points, x, y: plafondY };
    }
    // Contact avec une bulle : on s'arrete un peu avant le contact plein
    for (let r = 0; r < etat.g.length; r++) {
      const ligne = etat.g[r];
      for (let c = 0; c < ligne.length; c++) {
        if (ligne[c]) {
          const p = position(etat, r, c);
          const ddx = p.x - x;
          const ddy = p.y - y;
          if (ddx * ddx + ddy * ddy < 0.82 * 0.82) {
            points.push({ x, y });
            return { points, x, y };
          }
        }
      }
    }
  }
  points.push({ x, y });
  return { points, x, y };
}

function caseLaPlusProche(etat, x, y) {
  let meilleur = null;
  let distance = Infinity;
  const rMax = etat.g.length + 1;
  for (let r = 0; r <= rMax; r++) {
    const largeur = largeurRangee(etat, r);
    for (let c = 0; c < largeur; c++) {
      if (cellule(etat, r, c)) {
        continue;
      }
      // Une case accrochee : au plafond, ou a cote d'une bulle
      const accrochee = r === 0 || voisins(etat, r, c).some(([y2, x2]) => cellule(etat, y2, x2));
      if (!accrochee) {
        continue;
      }
      const p = position(etat, r, c);
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < distance) {
        distance = d;
        meilleur = [r, c];
      }
    }
  }
  return meilleur;
}

// ---------------------------------------------------------------------
// Resolution d'un tir
// ---------------------------------------------------------------------

function groupe(etat, r, c, couleur) {
  const vus = new Set([r + "," + c]);
  const pile = [[r, c]];
  const liste = [];
  while (pile.length) {
    const [y, x] = pile.pop();
    liste.push([y, x]);
    voisins(etat, y, x).forEach(([y2, x2]) => {
      const b = cellule(etat, y2, x2);
      const k = y2 + "," + x2;
      if (b && !vus.has(k) && b.type === "normale" && b.couleur === couleur) {
        vus.add(k);
        pile.push([y2, x2]);
      }
    });
  }
  return liste;
}

function detachees(etat) {
  const accroches = new Set();
  const pile = [];
  (etat.g[0] || []).forEach((b, c) => {
    if (b) {
      accroches.add("0," + c);
      pile.push([0, c]);
    }
  });
  while (pile.length) {
    const [y, x] = pile.pop();
    voisins(etat, y, x).forEach(([y2, x2]) => {
      const k = y2 + "," + x2;
      if (cellule(etat, y2, x2) && !accroches.has(k)) {
        accroches.add(k);
        pile.push([y2, x2]);
      }
    });
  }
  const liste = [];
  etat.g.forEach((l, r) => l.forEach((b, c) => {
    if (b && !accroches.has(r + "," + c)) {
      liste.push([r, c]);
    }
  }));
  return liste;
}

function retirer(etat, cases) {
  return cases.map(([r, c]) => {
    const b = etat.g[r][c];
    etat.g[r][c] = null;
    return { ...b, r, c, ...position(etat, r, c) };
  });
}

export function tirer(etat, angle) {
  const munition = etat.file.shift();
  const traj = trajectoire(etat, angle);
  const cible = caseLaPlusProche(etat, traj.x, traj.y);
  const res = { munition, trajet: traj.points, eclatees: [], tombees: [], liberees: [], descente: false, ajout: false, points: 0, special: null };
  etat.tirs++;
  if (!cible) {
    etat.file.push(nouvelleMunition(etat));
    return res;
  }
  const [r, c] = cible;
  assurerRangee(etat, r);
  etat.g[r][c] = munition;
  res.case = { r, c, ...position(etat, r, c) };

  let eclat = [];
  if (munition.type === BOMBE) {
    // Deux cercles autour du point d'impact, pierres comprises
    const zone = new Map([[r + "," + c, [r, c]]]);
    voisins(etat, r, c).forEach(([y, x]) => {
      zone.set(y + "," + x, [y, x]);
      voisins(etat, y, x).forEach(([y2, x2]) => zone.set(y2 + "," + x2, [y2, x2]));
    });
    eclat = [...zone.values()].filter(([y, x]) => cellule(etat, y, x));
    res.special = "bombe";
  } else {
    if (munition.type === ARC) {
      // L'arc-en-ciel prend la couleur qui fera le plus gros groupe
      let meilleure = -1;
      let taille = 0;
      voisins(etat, r, c).forEach(([y, x]) => {
        const b = cellule(etat, y, x);
        if (b && b.type === "normale") {
          munition.type = "normale";
          munition.couleur = b.couleur;
          const t = groupe(etat, r, c, b.couleur).length;
          if (t > taille) {
            taille = t;
            meilleure = b.couleur;
          }
        }
      });
      munition.type = "normale";
      munition.couleur = meilleure >= 0 ? meilleure : 0;
      res.special = "arc";
    }
    const g = groupe(etat, r, c, munition.couleur);
    if (g.length >= 3) {
      eclat = g;
    }
  }

  if (eclat.length) {
    // Les lanternes ne se liberent qu'en tombant : il faut les decrocher
    res.eclatees = retirer(etat, eclat);
    const n = res.eclatees.length;
    res.points += Math.round(n * 10 * (n > 3 ? 1 + (n - 3) * 0.5 : 1));
    etat.rates = 0;
  } else {
    etat.rates++;
  }
  const chute = retirer(etat, detachees(etat));
  chute.forEach(b => {
    if (b.type === LANTERNE) {
      res.liberees.push(b);
    } else {
      res.tombees.push(b);
    }
  });
  const k = res.tombees.length;
  res.points += Math.round(k * 20 * (1 + k / 4));
  res.points += res.liberees.length * 500;
  etat.lanternesLibres += res.liberees.length;
  etat.score += res.points;

  // Recompenses : une grosse chute donne une bombe, un gros eclat un arc-en-ciel
  let special = null;
  if (k >= 6) {
    special = BOMBE;
  } else if (res.eclatees.length >= 6) {
    special = ARC;
  }
  etat.file.push(nouvelleMunition(etat, special));
  // La munition en attente garde une couleur encore utile
  if (etat.file[0] && etat.file[0].type === "normale") {
    const presentes = couleursPresentes(etat);
    if (presentes.length && !presentes.includes(etat.file[0].couleur)) {
      etat.file[0].couleur = presentes[Math.floor(etat.alea() * presentes.length)];
    }
  }

  // Le plafond descend, ou une rangee arrive en mode sans fin
  if (etat.mode === "sansfin") {
    etat.tirsDepuisAjout++;
    const cadence = Math.max(3, 7 - Math.floor(etat.score / 4000));
    if (etat.tirsDepuisAjout >= cadence) {
      etat.tirsDepuisAjout = 0;
      ajouterRangeeHaut(etat);
      res.ajout = true;
      if (etat.score > 2500) {
        etat.couleurs = Math.min(6, 5 + Math.floor(etat.score / 8000));
      } else {
        etat.couleurs = 4 + (etat.score > 800 ? 1 : 0);
      }
    }
  } else if (etat.rates >= etat.niveau.ratesAvantDescente) {
    etat.rates = 0;
    etat.plafond++;
    res.descente = true;
  }
  // Rangees vides en bas : on les enleve
  while (etat.g.length && etat.g[etat.g.length - 1].every(b => !b)) {
    etat.g.pop();
  }
  etat.perdu = depasse(etat);
  return res;
}

function depasse(etat) {
  for (let r = 0; r < etat.g.length; r++) {
    if (etat.g[r].some(Boolean) && r + etat.plafond >= LIGNE_MORT) {
      return true;
    }
  }
  return false;
}

export function bullesRestantes(etat) {
  let n = 0;
  etat.g.forEach(l => l.forEach(b => {
    if (b && b.type !== PIERRE) {
      n++;
    }
  }));
  return n;
}

export function objectifAtteint(etat) {
  const niv = etat.niveau;
  if (!niv) {
    return false;
  }
  if (niv.type === "vider") {
    return couleursPresentes(etat).length === 0;
  }
  if (niv.type === "lanternes") {
    return etat.lanternesLibres >= niv.lanternes;
  }
  return etat.score >= niv.cible;
}

export function partieFinie(etat) {
  if (etat.perdu) {
    return "perdu";
  }
  if (etat.mode === "niveau") {
    if (objectifAtteint(etat)) {
      return "gagne";
    }
    if (etat.niveau.tirsMax && etat.tirs >= etat.niveau.tirsMax) {
      return "perdu";
    }
  }
  return null;
}

export function etoiles(etat) {
  const niv = etat.niveau;
  if (niv.type === "score") {
    return etat.score >= niv.cible * 1.7 ? 3 : etat.score >= niv.cible * 1.3 ? 2 : 1;
  }
  return etat.tirs <= niv.par ? 3 : etat.tirs <= niv.par * 1.5 ? 2 : 1;
}

// Pour l'affichage : toutes les bulles avec leur position
export function bulles(etat) {
  const liste = [];
  etat.g.forEach((l, r) => l.forEach((b, c) => {
    if (b) {
      liste.push({ ...b, r, c, ...position(etat, r, c) });
    }
  }));
  return liste;
}

export function cloner(etat) {
  return {
    ...etat,
    alea: hasard(Math.floor(Math.random() * 1e9)),
    g: etat.g.map(l => l.map(b => (b ? { ...b } : null))),
    file: etat.file.map(b => ({ ...b }))
  };
}
