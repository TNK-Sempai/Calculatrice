// =====================================================================
//  SHOGI - moteur
//  Les regles completes du shogi sur 9 x 9, sans rien dessiner :
//  deplacements des pieces, promotion, parachutage (et ses interdits :
//  deux pions dans une colonne, pion parachute qui mate, piece posee la
//  ou elle ne pourrait plus bouger), echec et mat, repetition. Plus
//  l'IA, en trois niveaux, qui tourne dans un Web Worker.
//
//  Codage : case = rangee * 9 + colonne, rangee 0 en haut (camp de
//  l'IA). Piece > 0 : le joueur (sente, en bas), < 0 : l'IA (gote).
//  Types : 1 pion, 2 lance, 3 cavalier, 4 argent, 5 or, 6 fou, 7 tour,
//  8 roi. Promus : +8 (9 tokin, 10 lance promue, 11 cavalier promu,
//  12 argent promu, 14 cheval-dragon, 15 roi-dragon).
// =====================================================================

export const TAILLE = 9;
export const CASES = 81;
export const SENTE = 1;
export const GOTE = -1;
export const PION = 1;
export const LANCE = 2;
export const CAVALIER = 3;
export const ARGENT = 4;
export const OR = 5;
export const FOU = 6;
export const TOUR = 7;
export const ROI = 8;
export const PROMU = 8;

const PROMOUVABLE = [false, true, true, true, true, false, true, true, false];

export const VALEURS = [0, 100, 300, 400, 500, 600, 800, 1000, 0, 600, 600, 600, 600, 0, 1050, 1250];

// Deplacements a un pas, vus du joueur (avant = rangee - 1)
const PAS_OR = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0]];
const PAS_ARGENT = [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 1]];
const PAS_ROI = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const ORTHO = [[-1, 0], [1, 0], [0, -1], [0, 1]];

// Pour chaque type : pas simples, et directions de glisse
const MOUVEMENTS = {
  1: { pas: [[-1, 0]], glisse: [] },
  2: { pas: [], glisse: [[-1, 0]] },
  3: { pas: [[-2, -1], [-2, 1]], glisse: [] },
  4: { pas: PAS_ARGENT, glisse: [] },
  5: { pas: PAS_OR, glisse: [] },
  6: { pas: [], glisse: DIAG },
  7: { pas: [], glisse: ORTHO },
  8: { pas: PAS_ROI, glisse: [] },
  9: { pas: PAS_OR, glisse: [] },
  10: { pas: PAS_OR, glisse: [] },
  11: { pas: PAS_OR, glisse: [] },
  12: { pas: PAS_OR, glisse: [] },
  14: { pas: ORTHO, glisse: DIAG },
  15: { pas: DIAG, glisse: ORTHO }
};

export function camp(p) {
  return p > 0 ? SENTE : p < 0 ? GOTE : 0;
}

export function typeDe(p) {
  return Math.abs(p);
}

export function typeDeBase(t) {
  return t > PROMU ? t - PROMU : t;
}

// ---------------------------------------------------------------------
// Positions
// ---------------------------------------------------------------------

export function positionDeDepart() {
  const p = new Int8Array(CASES);
  const ligneArriere = [LANCE, CAVALIER, ARGENT, OR, ROI, OR, ARGENT, CAVALIER, LANCE];
  for (let c = 0; c < 9; c++) {
    p[0 * 9 + c] = -ligneArriere[c];
    p[8 * 9 + c] = ligneArriere[c];
    p[2 * 9 + c] = -PION;
    p[6 * 9 + c] = PION;
  }
  // Fou et tour : la tour a droite du joueur, le fou a sa gauche
  p[1 * 9 + 1] = -TOUR;
  p[1 * 9 + 7] = -FOU;
  p[7 * 9 + 1] = FOU;
  p[7 * 9 + 7] = TOUR;
  return { plateau: p, mains: [new Array(8).fill(0), new Array(8).fill(0)], trait: SENTE };
}

export function copier(pos) {
  return { plateau: Int8Array.from(pos.plateau), mains: [pos.mains[0].slice(), pos.mains[1].slice()], trait: pos.trait };
}

export function indexMain(c) {
  return c === SENTE ? 0 : 1;
}

export function cle(pos) {
  return pos.plateau.join(",") + "|" + pos.mains[0].join("") + "|" + pos.mains[1].join("") + "|" + pos.trait;
}

function dans(r, c) {
  return r >= 0 && r < 9 && c >= 0 && c < 9;
}

export function zonePromotion(c, rangee) {
  return c === SENTE ? rangee <= 2 : rangee >= 6;
}

// Rangees ou une piece ne pourrait plus bouger
function sansAvenir(type, c, rangee) {
  const r = c === SENTE ? rangee : 8 - rangee;
  if (type === PION || type === LANCE) {
    return r === 0;
  }
  if (type === CAVALIER) {
    return r <= 1;
  }
  return false;
}

// ---------------------------------------------------------------------
// Attaques
// ---------------------------------------------------------------------

// La piece en "de" attaque-t-elle la case "vers" ?
function atteint(plateau, de, vers) {
  const p = plateau[de];
  const c = camp(p);
  const m = MOUVEMENTS[typeDe(p)];
  const r0 = Math.floor(de / 9);
  const c0 = de % 9;
  const r1 = Math.floor(vers / 9);
  const c1 = vers % 9;
  for (const [dr, dc] of m.pas) {
    if (r0 + dr * c === r1 && c0 + dc * c === c1) {
      return true;
    }
  }
  for (const [dr, dc] of m.glisse) {
    let r = r0 + dr * c;
    let k = c0 + dc * c;
    while (dans(r, k)) {
      if (r === r1 && k === c1) {
        return true;
      }
      if (plateau[r * 9 + k] !== 0) {
        break;
      }
      r += dr * c;
      k += dc * c;
    }
  }
  return false;
}

export function attaquee(plateau, sq, parCamp) {
  for (let i = 0; i < CASES; i++) {
    const p = plateau[i];
    if (p !== 0 && camp(p) === parCamp && atteint(plateau, i, sq)) {
      return true;
    }
  }
  return false;
}

export function caseDuRoi(plateau, c) {
  const roi = ROI * c;
  for (let i = 0; i < CASES; i++) {
    if (plateau[i] === roi) {
      return i;
    }
  }
  return -1;
}

export function enEchec(pos, c) {
  const r = caseDuRoi(pos.plateau, c);
  return r >= 0 && attaquee(pos.plateau, r, -c);
}

// ---------------------------------------------------------------------
// Coups
//   { de, vers, promo, type (parachutage), prise }
// ---------------------------------------------------------------------

export function coupsPseudo(pos, parachutes) {
  const c = pos.trait;
  const plateau = pos.plateau;
  const coups = [];
  for (let i = 0; i < CASES; i++) {
    const p = plateau[i];
    if (p === 0 || camp(p) !== c) {
      continue;
    }
    const t = typeDe(p);
    const m = MOUVEMENTS[t];
    const r0 = Math.floor(i / 9);
    const c0 = i % 9;
    const ajouter = (r, k) => {
      const v = r * 9 + k;
      const prise = plateau[v];
      const peutPromouvoir = t <= ROI && PROMOUVABLE[t] && (zonePromotion(c, r0) || zonePromotion(c, r));
      if (!sansAvenir(t, c, r)) {
        coups.push({ de: i, vers: v, promo: false, prise });
      }
      if (peutPromouvoir) {
        coups.push({ de: i, vers: v, promo: true, prise });
      }
    };
    for (const [dr, dc] of m.pas) {
      const r = r0 + dr * c;
      const k = c0 + dc * c;
      if (dans(r, k) && camp(plateau[r * 9 + k]) !== c) {
        ajouter(r, k);
      }
    }
    for (const [dr, dc] of m.glisse) {
      let r = r0 + dr * c;
      let k = c0 + dc * c;
      while (dans(r, k)) {
        const q = plateau[r * 9 + k];
        if (camp(q) === c) {
          break;
        }
        ajouter(r, k);
        if (q !== 0) {
          break;
        }
        r += dr * c;
        k += dc * c;
      }
    }
  }
  if (parachutes !== false) {
    const main = pos.mains[indexMain(c)];
    // Colonnes ou j'ai deja un pion non promu (nifu)
    const colonnesPion = new Array(9).fill(false);
    for (let i = 0; i < CASES; i++) {
      if (plateau[i] === PION * c) {
        colonnesPion[i % 9] = true;
      }
    }
    for (let t = PION; t <= TOUR; t++) {
      if (!main[t]) {
        continue;
      }
      for (let v = 0; v < CASES; v++) {
        if (plateau[v] !== 0) {
          continue;
        }
        const r = Math.floor(v / 9);
        if (sansAvenir(t, c, r)) {
          continue;
        }
        if (t === PION && colonnesPion[v % 9]) {
          continue;
        }
        coups.push({ de: -1, vers: v, type: t, promo: false, prise: 0 });
      }
    }
  }
  return coups;
}

// Joue le coup en place ; renvoie de quoi le defaire
export function jouer(pos, coup) {
  const c = pos.trait;
  const annule = { coup, prise: pos.plateau[coup.vers], piece: coup.de >= 0 ? pos.plateau[coup.de] : 0 };
  if (coup.de < 0) {
    pos.plateau[coup.vers] = coup.type * c;
    pos.mains[indexMain(c)][coup.type]--;
  } else {
    const p = pos.plateau[coup.de];
    if (annule.prise !== 0) {
      pos.mains[indexMain(c)][typeDeBase(typeDe(annule.prise))]++;
    }
    pos.plateau[coup.vers] = coup.promo ? p + PROMU * c : p;
    pos.plateau[coup.de] = 0;
  }
  pos.trait = -c;
  return annule;
}

export function defaire(pos, annule) {
  const coup = annule.coup;
  pos.trait = -pos.trait;
  const c = pos.trait;
  if (coup.de < 0) {
    pos.plateau[coup.vers] = 0;
    pos.mains[indexMain(c)][coup.type]++;
  } else {
    pos.plateau[coup.de] = annule.piece;
    pos.plateau[coup.vers] = annule.prise;
    if (annule.prise !== 0) {
      pos.mains[indexMain(c)][typeDeBase(typeDe(annule.prise))]--;
    }
  }
}

// Coups legaux : on ne laisse pas son roi en prise, et le pion
// parachute ne doit pas mater (uchifuzume)
export function coupsLegaux(pos) {
  const c = pos.trait;
  const legaux = [];
  for (const coup of coupsPseudo(pos)) {
    const a = jouer(pos, coup);
    let ok = !enEchec(pos, c);
    if (ok && coup.de < 0 && coup.type === PION && enEchec(pos, -c)) {
      // Le pion parachute donne echec : il ne doit pas etre mat
      ok = existeCoupLegal(pos);
    }
    defaire(pos, a);
    if (ok) {
      legaux.push(coup);
    }
  }
  return legaux;
}

function existeCoupLegal(pos) {
  const c = pos.trait;
  for (const coup of coupsPseudo(pos)) {
    const a = jouer(pos, coup);
    const ok = !enEchec(pos, c);
    defaire(pos, a);
    if (ok) {
      return true;
    }
  }
  return false;
}

export function estMat(pos) {
  return coupsLegaux(pos).length === 0;
}

export function memeCoup(a, b) {
  return a.de === b.de && a.vers === b.vers && !!a.promo === !!b.promo && (a.de >= 0 || a.type === b.type);
}

// Notation lisible : 7g7f, P*5e, 8h2b+
export function notation(coup) {
  const col = v => String(9 - (v % 9));
  const rang = v => "abcdefghi"[Math.floor(v / 9)];
  if (coup.de < 0) {
    return "PLNSGBRK"[coup.type - 1] + "*" + col(coup.vers) + rang(coup.vers);
  }
  return col(coup.de) + rang(coup.de) + col(coup.vers) + rang(coup.vers) + (coup.promo ? "+" : "");
}

// ---------------------------------------------------------------------
// IA
// ---------------------------------------------------------------------

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

// Evaluation du point de vue du camp au trait
function evaluer(pos) {
  let s = 0;
  const plateau = pos.plateau;
  for (let i = 0; i < CASES; i++) {
    const p = plateau[i];
    if (p === 0) {
      continue;
    }
    const t = typeDe(p);
    let v = VALEURS[t];
    // Les pieces mineures qui avancent valent un peu plus
    if (t === PION || t === ARGENT || t === OR) {
      const r = Math.floor(i / 9);
      v += (p > 0 ? 8 - r : r) * 4;
    }
    s += p > 0 ? v : -v;
  }
  for (let t = PION; t <= TOUR; t++) {
    s += (pos.mains[0][t] - pos.mains[1][t]) * VALEURS[t] * 1.1;
  }
  // Securite des rois : pieces amies autour
  [SENTE, GOTE].forEach(c => {
    const r = caseDuRoi(plateau, c);
    if (r < 0) {
      return;
    }
    let garde = 0;
    const r0 = Math.floor(r / 9);
    const c0 = r % 9;
    for (const [dr, dc] of PAS_ROI) {
      if (dans(r0 + dr, c0 + dc) && camp(plateau[(r0 + dr) * 9 + c0 + dc]) === c) {
        garde++;
      }
    }
    s += c * garde * 12;
  });
  return s * pos.trait;
}

function scoreOrdre(coup) {
  if (coup.prise !== 0) {
    return 10000 + VALEURS[typeDe(coup.prise)] * 10;
  }
  if (coup.promo) {
    return 5000;
  }
  if (coup.de < 0) {
    return 100;
  }
  return 0;
}

const MAT = 1000000;

export function choisirCoup(pos, niveau, graine, tempsMax) {
  const alea = creerAleatoire(graine || 1);
  const legaux = coupsLegaux(pos);
  if (legaux.length === 0) {
    return null;
  }
  if (niveau === "facile") {
    // Aleatoire guide : prend ce qui se prend sans trop reflechir
    let meilleur = null;
    let meilleurScore = -Infinity;
    for (const coup of legaux) {
      const a = jouer(pos, coup);
      let v = -evaluer(pos) + alea() * 260;
      if (estMat(pos)) {
        v += 50000;
      }
      defaire(pos, a);
      if (v > meilleurScore) {
        meilleurScore = v;
        meilleur = coup;
      }
    }
    return meilleur;
  }
  const profondeurMax = niveau === "moyen" ? 2 : 4;
  const limite = Date.now() + (tempsMax || (niveau === "moyen" ? 900 : 2200));
  let meilleurGlobal = legaux[0];
  let arret = false;

  function quiescence(alpha, beta, profondeur) {
    const debout = evaluer(pos);
    if (debout >= beta) {
      return beta;
    }
    if (debout > alpha) {
      alpha = debout;
    }
    if (profondeur <= 0) {
      return alpha;
    }
    const c = pos.trait;
    const prises = coupsPseudo(pos, false).filter(k => k.prise !== 0).sort((a, b) => scoreOrdre(b) - scoreOrdre(a));
    for (const coup of prises) {
      if (typeDe(coup.prise) === ROI) {
        return MAT;
      }
      const a = jouer(pos, coup);
      if (enEchec(pos, c)) {
        defaire(pos, a);
        continue;
      }
      const v = -quiescence(-beta, -alpha, profondeur - 1);
      defaire(pos, a);
      if (v >= beta) {
        return beta;
      }
      if (v > alpha) {
        alpha = v;
      }
    }
    return alpha;
  }

  function chercher(profondeur, alpha, beta, ply) {
    if (Date.now() > limite) {
      arret = true;
      return 0;
    }
    if (profondeur <= 0) {
      return quiescence(alpha, beta, 3);
    }
    const c = pos.trait;
    const coups = coupsPseudo(pos);
    coups.sort((a, b) => scoreOrdre(b) - scoreOrdre(a));
    let joues = 0;
    let meilleur = -MAT * 2;
    for (const coup of coups) {
      if (typeDe(coup.prise) === ROI) {
        return MAT - ply;
      }
      const a = jouer(pos, coup);
      if (enEchec(pos, c)) {
        defaire(pos, a);
        continue;
      }
      // Pion parachute qui mate : interdit
      if (coup.de < 0 && coup.type === PION && enEchec(pos, -c) && !existeCoupLegal(pos)) {
        defaire(pos, a);
        continue;
      }
      joues++;
      const v = -chercher(profondeur - 1, -beta, -alpha, ply + 1);
      defaire(pos, a);
      if (arret) {
        return 0;
      }
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
    if (joues === 0) {
      return -(MAT - ply);
    }
    return meilleur;
  }

  // Approfondissement progressif : on garde le meilleur coup du dernier
  // tour complet, et on le cherche en premier au tour suivant
  // Un peu de hasard dans l'ordre : a valeur egale, la partie varie
  const bruit = new Map(legaux.map(k => [k, alea()]));
  let ordre = legaux.slice().sort((a, b) => scoreOrdre(b) - scoreOrdre(a) || bruit.get(a) - bruit.get(b));
  for (let profondeur = 1; profondeur <= profondeurMax; profondeur++) {
    let meilleurIci = null;
    let alpha = -MAT * 2;
    const scores = new Map();
    for (const coup of ordre) {
      const a = jouer(pos, coup);
      const v = -chercher(profondeur - 1, -MAT * 2, -alpha, 1);
      defaire(pos, a);
      if (arret) {
        break;
      }
      scores.set(coup, v);
      if (v > alpha) {
        alpha = v;
        meilleurIci = coup;
      }
    }
    if (arret) {
      break;
    }
    if (meilleurIci) {
      meilleurGlobal = meilleurIci;
      ordre = ordre.slice().sort((a, b) => (scores.get(b) ?? -Infinity) - (scores.get(a) ?? -Infinity));
    }
    if (alpha > MAT / 2) {
      break;
    }
  }
  return meilleurGlobal;
}
