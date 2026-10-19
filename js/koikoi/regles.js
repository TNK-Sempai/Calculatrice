// =====================================================================
//  KOI-KOI - yaku, decompte et IA
//  Sans DOM : les fonctions travaillent sur des listes d'ids de cartes.
// =====================================================================

import { CARTES } from "./cartes.js";

const PLUIE = 40;          // l'homme a l'ombrelle
const RIDEAU = 8;
const LUNE = 28;
const COUPE = 32;
const ISC = [24, 20, 36];  // sanglier, papillons, cerf
const POEMES = [1, 5, 9];
const BLEUS = [21, 33, 37];

export const YAKU = [
  { id: "goko", nom: "Gokō", kanji: "五光", regle: "Les 5 lumières", points: "10" },
  { id: "shiko", nom: "Shikō", kanji: "四光", regle: "4 lumières sans l'homme à l'ombrelle", points: "8" },
  { id: "ameshiko", nom: "Ame-Shikō", kanji: "雨四光", regle: "4 lumières dont l'homme à l'ombrelle", points: "7" },
  { id: "sanko", nom: "Sankō", kanji: "三光", regle: "3 lumières sans l'homme à l'ombrelle", points: "5" },
  { id: "hanami", nom: "Hanami-zake", kanji: "花見酒", regle: "Rideau du cerisier et coupe de saké", points: "5" },
  { id: "tsukimi", nom: "Tsukimi-zake", kanji: "月見酒", regle: "Pleine lune et coupe de saké", points: "5" },
  { id: "inoshikacho", nom: "Inoshikachō", kanji: "猪鹿蝶", regle: "Sanglier, cerf et papillons", points: "5, +1 par animal en plus" },
  { id: "akatan", nom: "Akatan", kanji: "赤短", regle: "Les 3 rubans poèmes", points: "5, +1 par ruban en plus" },
  { id: "aotan", nom: "Aotan", kanji: "青短", regle: "Les 3 rubans bleus", points: "5, +1 par ruban en plus" },
  { id: "tane", nom: "Tane", kanji: "タネ", regle: "5 animaux", points: "1, +1 par animal en plus" },
  { id: "tan", nom: "Tan", kanji: "タン", regle: "5 rubans", points: "1, +1 par ruban en plus" },
  { id: "kasu", nom: "Kasu", kanji: "カス", regle: "10 kasu", points: "1, +1 par kasu en plus" }
];

// Liste des yaku formes par une pile : [{ id, points }] et total
export function yakuDe(pile) {
  const a = new Set(pile);
  const lumieres = pile.filter(c => CARTES[c].type === "lumiere");
  const animaux = pile.filter(c => CARTES[c].type === "animal").length;
  const rubans = pile.filter(c => CARTES[c].type === "ruban").length;
  const kasu = pile.filter(c => CARTES[c].type === "kasu").length;
  const pluie = a.has(PLUIE);
  const liste = [];
  const n = lumieres.length;
  if (n === 5) {
    liste.push({ id: "goko", points: 10 });
  } else if (n === 4) {
    liste.push(pluie ? { id: "ameshiko", points: 7 } : { id: "shiko", points: 8 });
  } else if (n === 3 && !pluie) {
    liste.push({ id: "sanko", points: 5 });
  }
  if (a.has(RIDEAU) && a.has(COUPE)) {
    liste.push({ id: "hanami", points: 5 });
  }
  if (a.has(LUNE) && a.has(COUPE)) {
    liste.push({ id: "tsukimi", points: 5 });
  }
  if (ISC.every(c => a.has(c))) {
    liste.push({ id: "inoshikacho", points: 5 + animaux - 3 });
  }
  // Les rubans en plus ne sont comptes qu'une fois, meme avec les deux
  const aka = POEMES.every(c => a.has(c));
  const ao = BLEUS.every(c => a.has(c));
  if (aka && ao) {
    liste.push({ id: "akatan", points: 5 + rubans - 6 });
    liste.push({ id: "aotan", points: 5 });
  } else if (aka || ao) {
    liste.push({ id: aka ? "akatan" : "aotan", points: 5 + rubans - 3 });
  }
  if (animaux >= 5) {
    liste.push({ id: "tane", points: animaux - 4 });
  }
  if (rubans >= 5) {
    liste.push({ id: "tan", points: rubans - 4 });
  }
  if (kasu >= 10) {
    liste.push({ id: "kasu", points: kasu - 9 });
  }
  return { liste, total: liste.reduce((s, y) => s + y.points, 0) };
}

// Avancement de chaque yaku, pour l'aide : { id: [compte, besoin] }
export function avancement(pile) {
  const a = new Set(pile);
  const lumieres = pile.filter(c => CARTES[c].type === "lumiere");
  const sansPluie = lumieres.filter(c => c !== PLUIE).length;
  const compter = liste => liste.filter(c => a.has(c)).length;
  return {
    goko: [lumieres.length, 5],
    shiko: [sansPluie, 4],
    ameshiko: [Math.min(lumieres.length, 4), 4],
    sanko: [sansPluie, 3],
    hanami: [compter([RIDEAU, COUPE]), 2],
    tsukimi: [compter([LUNE, COUPE]), 2],
    inoshikacho: [compter(ISC), 3],
    akatan: [compter(POEMES), 3],
    aotan: [compter(BLEUS), 3],
    tane: [pile.filter(c => CARTES[c].type === "animal").length, 5],
    tan: [pile.filter(c => CARTES[c].type === "ruban").length, 5],
    kasu: [pile.filter(c => CARTES[c].type === "kasu").length, 10]
  };
}

// Points de la manche une fois le joueur arrete : x2 a partir de 7,
// x2 encore si l'adversaire avait annonce koi-koi.
export function pointsDeManche(total, adversaireKoi) {
  let points = total;
  const multiplicateurs = [];
  if (points >= 7) {
    points *= 2;
    multiplicateurs.push("7 points ou plus : ×2");
  }
  if (adversaireKoi) {
    points *= 2;
    multiplicateurs.push("koi-koi adverse : ×2");
  }
  return { points, multiplicateurs };
}

// ---------------------------------------------------------------------
// IA
// ---------------------------------------------------------------------

// Une mesure de la proximite des yaku : sert a la fois a l'attaque et
// a la defense (prendre ce dont l'adversaire a besoin).
function potentiel(pile) {
  const av = avancement(pile);
  let v = yakuDe(pile).total * 10;
  for (const id of Object.keys(av)) {
    const [compte, besoin] = av[id];
    if (compte > 0 && compte < besoin) {
      v += (compte / besoin) ** 2 * (id === "kasu" || id === "tane" || id === "tan" ? 2 : 4);
    }
  }
  return v;
}

function valeurPrise(cartes, pile, pileAdverse) {
  const avant = potentiel(pile);
  const apres = potentiel(pile.concat(cartes));
  const refus = potentiel(pileAdverse.concat(cartes)) - potentiel(pileAdverse);
  let base = 0;
  for (const c of cartes) {
    const t = CARTES[c].type;
    base += t === "lumiere" ? 3 : t === "animal" ? 1.5 : t === "ruban" ? 1.2 : 0.3;
  }
  return apres - avant + refus * 0.6 + base;
}

export function correspondances(terrain, carte) {
  return terrain.filter(c => CARTES[c].mois === CARTES[carte].mois);
}

// Ce que capture une carte posee sur le terrain (choix = carte visee si 2)
export function prisePour(terrain, carte, choix) {
  const m = correspondances(terrain, carte);
  if (m.length === 0) {
    return [];
  }
  if (m.length === 1) {
    return [carte, m[0]];
  }
  if (m.length === 2) {
    return [carte, choix === undefined ? m[0] : choix];
  }
  return [carte, ...m];
}

// Meilleure cible parmi deux cartes du meme mois sur le terrain
export function meilleureCible(terrain, carte, pile, pileAdverse) {
  const m = correspondances(terrain, carte);
  let meilleure = m[0];
  let valeur = -Infinity;
  for (const cible of m) {
    const v = valeurPrise([carte, cible], pile, pileAdverse);
    if (v > valeur) {
      valeur = v;
      meilleure = cible;
    }
  }
  return meilleure;
}

// Choix de la carte a jouer : { carte, cible }
export function choisirCarte(main, terrain, pile, pileAdverse) {
  let meilleur = null;
  let valeurMax = -Infinity;
  for (const carte of main) {
    const m = correspondances(terrain, carte);
    let v;
    let cible;
    if (m.length === 0) {
      // Se defausser : on lache ce qui sert le moins, surtout pas une
      // carte dont l'adversaire profiterait. Garder une paire en main
      // pour plus tard rend la defausse moins couteuse.
      const doublon = main.some(c => c !== carte && CARTES[c].mois === CARTES[carte].mois);
      v = -valeurPrise([carte], pileAdverse, pile) * 0.8 - valeurPrise([carte], pile, pileAdverse) * 0.3 + (doublon ? -0.5 : 0);
    } else {
      cible = m.length === 2 ? meilleureCible(terrain, carte, pile, pileAdverse) : undefined;
      v = valeurPrise(prisePour(terrain, carte, cible), pile, pileAdverse) + 1;
    }
    v += Math.random() * 0.2;
    if (v > valeurMax) {
      valeurMax = v;
      meilleur = { carte, cible };
    }
  }
  return meilleur;
}

// Continuer (koi-koi) ou s'arreter
export function decisionKoi(total, cartesEnMain, pileAdverse, adversaireKoi) {
  if (adversaireKoi || cartesEnMain <= 2 || total >= 6) {
    return false;
  }
  const menace = potentiel(pileAdverse);
  return menace < 14 && cartesEnMain >= 4;
}
