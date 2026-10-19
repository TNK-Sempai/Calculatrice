// =====================================================================
//  OSHIDASHI - regles d'Abalone et IA alpha-beta
//  Plateau hexagonal de 61 trous en coordonnees axiales (q, r).
//  0 vide, 1 joueur (pierres claires, en bas), 2 IA (pierres sombres).
//  Un coup deplace en ligne 1 a 3 pierres alignees, soit dans l'axe
//  (il peut alors pousser 1 ou 2 pierres adverses : sumito), soit de
//  cote (toutes les cases d'arrivee doivent etre vides).
// =====================================================================

export const RAYON = 4;
export const JOUEUR = 1;
export const IA = 2;
export const VICTOIRE = 6;

export const DIRECTIONS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

export const CELLULES = [];
const INDEX = new Map();
for (let r = -RAYON; r <= RAYON; r++) {
  for (let q = -RAYON; q <= RAYON; q++) {
    const s = -q - r;
    if (Math.abs(s) <= RAYON) {
      INDEX.set(q + "," + r, CELLULES.length);
      CELLULES.push({ q, r });
    }
  }
}
export const NOMBRE = CELLULES.length;

export function indexDe(q, r) {
  const i = INDEX.get(q + "," + r);
  return i === undefined ? -1 : i;
}

// Voisin de chaque case dans chaque direction (-1 hors plateau)
export const VOISIN = CELLULES.map(({ q, r }) => DIRECTIONS.map(([dq, dr]) => indexDe(q + dq, r + dr)));

// Distance au centre, pour l'evaluation
const DISTANCE = CELLULES.map(({ q, r }) => (Math.abs(q) + Math.abs(r) + Math.abs(-q - r)) / 2);

export function opposee(d) {
  return (d + 3) % 6;
}

export function adversaire(camp) {
  return camp === JOUEUR ? IA : JOUEUR;
}

export function positionDeDepart() {
  const plateau = new Int8Array(NOMBRE);
  CELLULES.forEach(({ q, r }, i) => {
    if (r === 4 || r === 3 || (r === 2 && q >= -2 && q <= 0)) {
      plateau[i] = JOUEUR;
    }
    if (r === -4 || r === -3 || (r === -2 && q >= 0 && q <= 2)) {
      plateau[i] = IA;
    }
  });
  return { plateau, sorties: [0, 0, 0] };
}

export function copier(position) {
  return { plateau: position.plateau.slice(), sorties: position.sorties.slice() };
}

// ---------------------------------------------------------------------
// Generation des coups
// Un coup : { pierres: [cases], dir, pousse: nombre de pierres adverses
// poussees, ejecte: vrai si une pierre sort, arrivees: [cases] }
// ---------------------------------------------------------------------

// Teste une ligne (cases triees dans l'axe d) deplacee dans la direction m
function essayer(plateau, ligne, axe, m, camp) {
  const enLigne = ligne.length === 1 || m === axe || m === opposee(axe);
  if (enLigne) {
    // La tete est la pierre la plus avancee dans la direction m
    const tete = m === axe || ligne.length === 1 ? ligne[ligne.length - 1] : ligne[0];
    let devant = VOISIN[tete][m];
    if (devant === -1 || plateau[devant] === camp) {
      return null;
    }
    if (plateau[devant] === 0) {
      return { pierres: ligne, dir: m, pousse: 0, ejecte: false, arrivees: [devant] };
    }
    // Sumito : compter les pierres adverses alignees devant
    let pousse = 0;
    let c = devant;
    while (c !== -1 && plateau[c] === adversaire(camp)) {
      pousse++;
      c = VOISIN[c][m];
    }
    if (pousse >= ligne.length || pousse > 2) {
      return null;
    }
    if (c !== -1 && plateau[c] !== 0) {
      return null;   // bloque par une de mes pierres derriere les leurs
    }
    return { pierres: ligne, dir: m, pousse, ejecte: c === -1, arrivees: [devant] };
  }
  // Deplacement de cote : chaque pierre avance d'une case vide
  const arrivees = [];
  for (const p of ligne) {
    const a = VOISIN[p][m];
    if (a === -1 || plateau[a] !== 0) {
      return null;
    }
    arrivees.push(a);
  }
  return { pierres: ligne, dir: m, pousse: 0, ejecte: false, arrivees };
}

export function coups(position, camp) {
  const plateau = position.plateau;
  const liste = [];
  for (let i = 0; i < NOMBRE; i++) {
    if (plateau[i] !== camp) {
      continue;
    }
    // Une pierre seule : six directions
    for (let m = 0; m < 6; m++) {
      const c = essayer(plateau, [i], 0, m, camp);
      if (c) {
        liste.push(c);
      }
    }
    // Lignes de 2 et 3 dans les trois axes
    for (let axe = 0; axe < 3; axe++) {
      const b = VOISIN[i][axe];
      if (b === -1 || plateau[b] !== camp) {
        continue;
      }
      const lignes = [[i, b]];
      const c3 = VOISIN[b][axe];
      if (c3 !== -1 && plateau[c3] === camp) {
        lignes.push([i, b, c3]);
      }
      for (const ligne of lignes) {
        for (let m = 0; m < 6; m++) {
          const c = essayer(plateau, ligne, axe, m, camp);
          if (c) {
            liste.push(c);
          }
        }
      }
    }
  }
  return liste;
}

// Joue un coup (position modifiee en place). Renvoie les deplacements
// [{ de, vers }] (vers = -1 pour une pierre ejectee), pour l'animation.
export function appliquer(position, coup, camp) {
  const plateau = position.plateau;
  const m = coup.dir;
  const mouvements = [];
  const enLigne = coup.arrivees.length === 1;
  if (enLigne) {
    // On deplace toute la chaine depuis l'avant : pierres adverses puis les miennes
    const chaine = [];
    const tete = coup.pierres.reduce((t, p) => {
      // la tete est la pierre dont le voisin dans m n'est pas dans la ligne
      return coup.pierres.includes(VOISIN[p][m]) ? t : p;
    }, coup.pierres[0]);
    let c = tete;
    // remonter la ligne vers l'arriere
    const miennes = [];
    while (c !== -1 && coup.pierres.includes(c)) {
      miennes.push(c);
      c = VOISIN[c][opposee(m)];
    }
    let devant = VOISIN[tete][m];
    const leurs = [];
    for (let k = 0; k < coup.pousse; k++) {
      leurs.push(devant);
      devant = VOISIN[devant][m];
    }
    chaine.push(...leurs.reverse(), ...miennes);
    for (const p of chaine) {
      const vers = VOISIN[p][m];
      const pierre = plateau[p];
      plateau[p] = 0;
      if (vers === -1) {
        position.sorties[camp]++;
        mouvements.push({ de: p, vers: -1, pierre });
      } else {
        plateau[vers] = pierre;
        mouvements.push({ de: p, vers, pierre });
      }
    }
  } else {
    for (let k = 0; k < coup.pierres.length; k++) {
      plateau[coup.arrivees[k]] = camp;
      plateau[coup.pierres[k]] = 0;
      mouvements.push({ de: coup.pierres[k], vers: coup.arrivees[k], pierre: camp });
    }
  }
  return mouvements;
}

// ---------------------------------------------------------------------
// Evaluation et recherche
// ---------------------------------------------------------------------

function evaluer(position, camp) {
  const plateau = position.plateau;
  const autre = adversaire(camp);
  let score = (position.sorties[camp] - position.sorties[autre]) * 1000;
  if (position.sorties[camp] >= VICTOIRE) {
    return 100000;
  }
  if (position.sorties[autre] >= VICTOIRE) {
    return -100000;
  }
  for (let i = 0; i < NOMBRE; i++) {
    const p = plateau[i];
    if (p === 0) {
      continue;
    }
    const signe = p === camp ? 1 : -1;
    // Le centre est la position forte, le bord la position faible
    score += signe * (4 - DISTANCE[i]) * 12;
    if (DISTANCE[i] === 4) {
      score -= signe * 18;
    }
    // Cohesion : les pierres voisines se protegent
    for (let d = 0; d < 3; d++) {
      const v = VOISIN[i][d];
      if (v !== -1 && plateau[v] === p) {
        score += signe * 4;
      }
    }
  }
  return score;
}

function ordonner(liste) {
  return liste.sort((a, b) => (b.ejecte - a.ejecte) * 10 + (b.pousse - a.pousse) * 3 + (b.pierres.length - a.pierres.length));
}

let finRecherche = 0;
let interrompu = false;

function negamax(position, camp, profondeur, alpha, beta) {
  if (Date.now() > finRecherche) {
    interrompu = true;
    return 0;
  }
  if (profondeur === 0 || position.sorties[1] >= VICTOIRE || position.sorties[2] >= VICTOIRE) {
    return evaluer(position, camp);
  }
  const liste = ordonner(coups(position, camp));
  if (liste.length === 0) {
    return -50000;
  }
  let meilleur = -Infinity;
  for (const coup of liste) {
    const essai = copier(position);
    appliquer(essai, coup, camp);
    const v = -negamax(essai, adversaire(camp), profondeur - 1, -beta, -alpha);
    if (v > meilleur) {
      meilleur = v;
    }
    if (v > alpha) {
      alpha = v;
    }
    if (alpha >= beta) {
      break;
    }
  }
  return meilleur;
}

const PROFONDEUR = { facile: 1, moyen: 2, difficile: 4 };

export function choisirCoup(position, camp, niveau) {
  const liste = ordonner(coups(position, camp));
  if (liste.length === 0) {
    return null;
  }
  finRecherche = Date.now() + (niveau === "difficile" ? 1400 : 700);
  let choisi = liste[0];
  // Approfondissement iteratif : on garde le meilleur coup de la derniere
  // profondeur terminee a temps
  for (let profondeur = 1; profondeur <= PROFONDEUR[niveau]; profondeur++) {
    interrompu = false;
    let meilleur = null;
    let valeurMax = -Infinity;
    let alpha = -Infinity;
    for (const coup of liste) {
      const essai = copier(position);
      appliquer(essai, coup, camp);
      // Un peu de hasard au niveau facile pour qu'il reste battable
      const bruit = niveau === "facile" ? Math.random() * 60 : Math.random() * 0.5;
      const v = -negamax(essai, adversaire(camp), profondeur - 1, -Infinity, -alpha) + bruit;
      if (interrompu) {
        break;
      }
      if (v > valeurMax) {
        valeurMax = v;
        meilleur = coup;
      }
      if (v > alpha) {
        alpha = v;
      }
    }
    if (interrompu) {
      break;
    }
    choisi = meilleur;
    // Le meilleur coup de cette profondeur est explore en premier a la suivante
    liste.splice(liste.indexOf(meilleur), 1);
    liste.unshift(meilleur);
  }
  return choisi;
}
