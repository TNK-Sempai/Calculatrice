// =====================================================================
//  GO - moteur de regles et adversaire ordinateur
//  Partage par la page et par le Web Worker de l'IA. Le plateau est un
//  tableau de 81 cases : 0 vide, 1 noir, 2 blanc. Aucune dependance au
//  DOM : ce fichier doit pouvoir tourner dans un worker.
//
//  Regles : captures, ko simple, suicide interdit, fin apres deux
//  passes. Decompte chinois (par surface) : pierres posees + territoire
//  entoure, komi de 6,5 pour Blanc.
// =====================================================================

export const TAILLE = 9;
export const CASES = TAILLE * TAILLE;
export const VIDE = 0;
export const NOIR = 1;
export const BLANC = 2;
export const KOMI = 6.5;

// Voisins de chaque case, calcules une fois pour toutes
export const VOISINS = [];
for (let i = 0; i < CASES; i++) {
  const x = i % TAILLE;
  const y = Math.floor(i / TAILLE);
  const v = [];
  if (x > 0) v.push(i - 1);
  if (x < TAILLE - 1) v.push(i + 1);
  if (y > 0) v.push(i - TAILLE);
  if (y < TAILLE - 1) v.push(i + TAILLE);
  VOISINS.push(v);
}

// Diagonales, pour reconnaitre un vrai oeil
const DIAGONALES = [];
for (let i = 0; i < CASES; i++) {
  const x = i % TAILLE;
  const y = Math.floor(i / TAILLE);
  const d = [];
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx >= 0 && nx < TAILLE && ny >= 0 && ny < TAILLE) {
      d.push(ny * TAILLE + nx);
    }
  }
  DIAGONALES.push(d);
}

export function adversaire(couleur) {
  return couleur === NOIR ? BLANC : NOIR;
}

export function nouvellePosition() {
  return { plateau: new Uint8Array(CASES), ko: -1, captures: [0, 0, 0] };
}

export function copier(position) {
  return { plateau: position.plateau.slice(), ko: position.ko, captures: position.captures.slice() };
}

// Groupe et libertes d'une pierre : remplissage par pile
const marque = new Int32Array(CASES);
let generation = 1;

function groupe(plateau, depart) {
  generation++;
  const couleur = plateau[depart];
  const pile = [depart];
  const pierres = [];
  let libertes = 0;
  marque[depart] = generation;
  while (pile.length) {
    const p = pile.pop();
    pierres.push(p);
    for (const v of VOISINS[p]) {
      if (marque[v] === generation) {
        continue;
      }
      if (plateau[v] === couleur) {
        marque[v] = generation;
        pile.push(v);
      } else if (plateau[v] === VIDE) {
        marque[v] = generation;
        libertes++;
      }
    }
  }
  return { pierres, libertes };
}

// Joue un coup sur la position (modifiee en place). Renvoie false si le
// coup est illegal, et dans ce cas la position n'est pas touchee.
export function jouer(position, caseJouee, couleur) {
  const plateau = position.plateau;
  if (caseJouee < 0) {
    position.ko = -1;
    return true;   // passer
  }
  if (plateau[caseJouee] !== VIDE || caseJouee === position.ko) {
    return false;
  }
  const autre = adversaire(couleur);
  plateau[caseJouee] = couleur;
  let prises = 0;
  let derniereCapture = -1;
  for (const v of VOISINS[caseJouee]) {
    if (plateau[v] === autre) {
      const g = groupe(plateau, v);
      if (g.libertes === 0) {
        prises += g.pierres.length;
        derniereCapture = g.pierres[0];
        for (const p of g.pierres) {
          plateau[p] = VIDE;
        }
      }
    }
  }
  const moi = groupe(plateau, caseJouee);
  if (moi.libertes === 0) {
    plateau[caseJouee] = VIDE;   // suicide : interdit
    return false;
  }
  // Ko : une seule pierre prise par une pierre seule dans un seul trou
  position.ko = (prises === 1 && moi.pierres.length === 1 && moi.libertes === 1) ? derniereCapture : -1;
  position.captures[couleur] += prises;
  return true;
}

// Coup legal sans modifier la position
export function estLegal(position, caseJouee, couleur) {
  if (caseJouee < 0) {
    return true;
  }
  if (position.plateau[caseJouee] !== VIDE || caseJouee === position.ko) {
    return false;
  }
  const essai = copier(position);
  return jouer(essai, caseJouee, couleur);
}

// Un vrai oeil : toutes les cases voisines sont a moi, et assez de
// diagonales aussi. Les remplir serait un suicide strategique.
export function estOeil(plateau, c, couleur) {
  for (const v of VOISINS[c]) {
    if (plateau[v] !== couleur) {
      return false;
    }
  }
  let ennemies = 0;
  const diag = DIAGONALES[c];
  for (const d of diag) {
    if (plateau[d] === adversaire(couleur)) {
      ennemies++;
    }
  }
  return diag.length === 4 ? ennemies <= 1 : ennemies === 0;
}

// Decompte chinois. mortes : ensemble de cases a retirer avant le compte.
export function compter(plateau, mortes) {
  const p = plateau.slice();
  if (mortes) {
    for (const c of mortes) {
      p[c] = VIDE;
    }
  }
  const points = [0, 0, 0];
  const territoire = new Uint8Array(CASES);   // 0 neutre, 1 noir, 2 blanc
  const vu = new Uint8Array(CASES);
  for (let i = 0; i < CASES; i++) {
    if (p[i] !== VIDE) {
      points[p[i]]++;
      continue;
    }
    if (vu[i]) {
      continue;
    }
    const zone = [];
    const pile = [i];
    vu[i] = 1;
    let bord = 0;   // bits : 1 noir touche, 2 blanc touche
    while (pile.length) {
      const c = pile.pop();
      zone.push(c);
      for (const v of VOISINS[c]) {
        if (p[v] === VIDE) {
          if (!vu[v]) {
            vu[v] = 1;
            pile.push(v);
          }
        } else {
          bord |= p[v];
        }
      }
    }
    if (bord === NOIR || bord === BLANC) {
      points[bord] += zone.length;
      for (const c of zone) {
        territoire[c] = bord;
      }
    }
  }
  return { noir: points[NOIR], blanc: points[BLANC] + KOMI, territoire };
}

// ---------------------------------------------------------------------
// Parties aleatoires (playouts) : chaque joueur joue au hasard un coup
// legal qui ne remplit pas ses propres yeux, jusqu'a deux passes.
// ---------------------------------------------------------------------

const vides = new Int32Array(CASES);

export function partieAleatoire(position, couleur, aleatoire) {
  let passes = 0;
  let joueur = couleur;
  let coups = 0;
  const plateau = position.plateau;
  while (passes < 2 && coups < 200) {
    let n = 0;
    for (let i = 0; i < CASES; i++) {
      if (plateau[i] === VIDE) {
        vides[n++] = i;
      }
    }
    let joue = false;
    while (n > 0) {
      const k = Math.floor(aleatoire() * n);
      const c = vides[k];
      vides[k] = vides[--n];
      if (estOeil(plateau, c, joueur)) {
        continue;
      }
      if (jouer(position, c, joueur)) {
        joue = true;
        break;
      }
    }
    if (joue) {
      passes = 0;
    } else {
      position.ko = -1;
      passes++;
    }
    joueur = adversaire(joueur);
    coups++;
  }
  return position;
}

// Vainqueur d'une position finie : NOIR ou BLANC
function vainqueur(plateau) {
  const s = compter(plateau, null);
  return s.noir > s.blanc ? NOIR : BLANC;
}

// Graine pseudo-aleatoire rapide (mulberry32)
export function creerAleatoire(graine) {
  let a = graine >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Coups candidats : legaux et qui ne remplissent pas un oeil a soi
export function coupsCandidats(position, couleur) {
  const liste = [];
  for (let i = 0; i < CASES; i++) {
    if (position.plateau[i] === VIDE && !estOeil(position.plateau, i, couleur) && estLegal(position, i, couleur)) {
      liste.push(i);
    }
  }
  return liste;
}

// ---------------------------------------------------------------------
// Possession estimee : pour chaque case, la proportion de parties
// aleatoires ou elle finit chez Noir. Sert aux pierres mortes en fin de
// partie et a l'affichage des territoires.
// ---------------------------------------------------------------------

export function possession(position, couleur, nombre, aleatoire) {
  const noir = new Float32Array(CASES);
  for (let k = 0; k < nombre; k++) {
    const essai = partieAleatoire(copier(position), couleur, aleatoire);
    const s = compter(essai.plateau, null);
    for (let i = 0; i < CASES; i++) {
      const proprio = essai.plateau[i] || s.territoire[i];
      if (proprio === NOIR) {
        noir[i] += 1;
      }
    }
  }
  for (let i = 0; i < CASES; i++) {
    noir[i] /= nombre;
  }
  return noir;
}

// Pierres probablement mortes : celles qui finissent chez l'autre dans
// la grande majorite des parties
export function pierresMortes(position, aleatoire) {
  const p = possession(position, NOIR, 240, aleatoire);
  const mortes = [];
  for (let i = 0; i < CASES; i++) {
    const c = position.plateau[i];
    if (c === NOIR && p[i] < 0.2) {
      mortes.push(i);
    } else if (c === BLANC && p[i] > 0.8) {
      mortes.push(i);
    }
  }
  return { mortes, possession: p };
}

// ---------------------------------------------------------------------
// Les trois niveaux d'IA
// ---------------------------------------------------------------------

// Facile : un coup au hasard, en preferant sauver ou prendre une pierre
function coupFacile(position, couleur, aleatoire) {
  const candidats = coupsCandidats(position, couleur);
  if (candidats.length === 0) {
    return -1;
  }
  const autre = adversaire(couleur);
  const interessants = candidats.filter(c => {
    for (const v of VOISINS[c]) {
      const pierre = position.plateau[v];
      if (pierre !== VIDE && groupe(position.plateau, v).libertes === 1) {
        return pierre === autre || pierre === couleur;
      }
    }
    return false;
  });
  const choix = interessants.length && aleatoire() < 0.6 ? interessants : candidats;
  return choix[Math.floor(aleatoire() * choix.length)];
}

// Moyen : Monte-Carlo plat, quelques dizaines de parties par coup
function coupMoyen(position, couleur, aleatoire, temps) {
  const candidats = coupsCandidats(position, couleur);
  if (candidats.length === 0) {
    return -1;
  }
  const victoires = new Float64Array(candidats.length);
  const essais = new Float64Array(candidats.length);
  const fin = Date.now() + temps;
  let k = 0;
  while (Date.now() < fin) {
    const i = k % candidats.length;
    const essai = copier(position);
    jouer(essai, candidats[i], couleur);
    partieAleatoire(essai, adversaire(couleur), aleatoire);
    if (vainqueur(essai.plateau) === couleur) {
      victoires[i]++;
    }
    essais[i]++;
    k++;
  }
  let meilleur = 0;
  for (let i = 1; i < candidats.length; i++) {
    if (victoires[i] / (essais[i] || 1) > victoires[meilleur] / (essais[meilleur] || 1)) {
      meilleur = i;
    }
  }
  return { coup: candidats[meilleur], taux: victoires[meilleur] / (essais[meilleur] || 1) };
}

// Difficile : UCT (arbre de recherche Monte-Carlo) avec playouts legers
function coupDifficile(position, couleur, aleatoire, temps) {
  const racine = { coup: -2, joueur: adversaire(couleur), visites: 0, victoires: 0, enfants: null, nonExplores: null };
  const fin = Date.now() + temps;
  let iterations = 0;
  while (Date.now() < fin) {
    const essai = copier(position);
    let noeud = racine;
    const chemin = [racine];
    let joueur = couleur;
    // Selection
    while (noeud.enfants !== null && noeud.nonExplores.length === 0 && noeud.enfants.length > 0) {
      let meilleur = null;
      let valeurMax = -Infinity;
      const logN = Math.log(noeud.visites);
      for (const e of noeud.enfants) {
        const v = e.victoires / e.visites + 0.9 * Math.sqrt(logN / e.visites);
        if (v > valeurMax) {
          valeurMax = v;
          meilleur = e;
        }
      }
      noeud = meilleur;
      jouer(essai, noeud.coup, joueur);
      joueur = adversaire(joueur);
      chemin.push(noeud);
    }
    // Expansion
    if (noeud.enfants === null) {
      noeud.enfants = [];
      noeud.nonExplores = coupsCandidats(essai, joueur);
    }
    if (noeud.nonExplores.length > 0) {
      const k = Math.floor(aleatoire() * noeud.nonExplores.length);
      const coup = noeud.nonExplores[k];
      noeud.nonExplores[k] = noeud.nonExplores[noeud.nonExplores.length - 1];
      noeud.nonExplores.pop();
      jouer(essai, coup, joueur);
      const enfant = { coup, joueur, visites: 0, victoires: 0, enfants: null, nonExplores: null };
      noeud.enfants.push(enfant);
      noeud = enfant;
      joueur = adversaire(joueur);
      chemin.push(noeud);
    }
    // Simulation
    partieAleatoire(essai, joueur, aleatoire);
    const gagnant = vainqueur(essai.plateau);
    // Retropropagation : chaque noeud compte les victoires du joueur qui y a joue
    for (const n of chemin) {
      n.visites++;
      if (n.joueur === gagnant) {
        n.victoires++;
      }
    }
    iterations++;
  }
  if (!racine.enfants || racine.enfants.length === 0) {
    return { coup: -1, taux: 0, iterations };
  }
  let choisi = racine.enfants[0];
  for (const e of racine.enfants) {
    if (e.visites > choisi.visites) {
      choisi = e;
    }
  }
  return { coup: choisi.coup, taux: choisi.victoires / choisi.visites, iterations };
}

// Point d'entree commun. Renvoie { coup, taux } ; coup = -1 pour passer.
export function choisirCoup(position, couleur, niveau, graine, adversaireAPasse) {
  const aleatoire = creerAleatoire(graine);
  if (niveau === "facile") {
    return { coup: coupFacile(position, couleur, aleatoire), taux: 0.5 };
  }
  const resultat = niveau === "moyen"
    ? coupMoyen(position, couleur, aleatoire, 700)
    : coupDifficile(position, couleur, aleatoire, 1500);
  if (typeof resultat === "number") {
    return { coup: resultat, taux: 0.5 };
  }
  // En debut de partie, l'IA ne passe jamais : sinon une pierre posee
  // puis un passe suffiraient a rafler tout le plateau au classement
  let pierres = 0;
  for (let i = 0; i < CASES; i++) {
    if (position.plateau[i] !== VIDE) {
      pierres++;
    }
  }
  if (pierres < 24) {
    return resultat;
  }
  // Partie jouee : si l'adversaire a passe et que je gagne au compte,
  // je passe aussi plutot que de jouer dans mon propre territoire
  if (adversaireAPasse) {
    const { mortes } = pierresMortes(position, aleatoire);
    const s = compter(position.plateau, mortes);
    const jeGagne = couleur === BLANC ? s.blanc > s.noir : s.noir > s.blanc;
    if (jeGagne) {
      return { coup: -1, taux: resultat.taux };
    }
  }
  // Plus aucun coup utile : la recherche ne trouve rien qui change l'issue
  if (resultat.coup >= 0 && (resultat.taux > 0.97 || resultat.taux < 0.02)) {
    const proprio = possession(position, couleur, 60, aleatoire);
    const decide = proprio.every(v => v < 0.1 || v > 0.9);
    if (decide) {
      return { coup: -1, taux: resultat.taux };
    }
  }
  return resultat;
}
