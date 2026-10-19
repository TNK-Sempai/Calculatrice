// =====================================================================
//  PUISSANCE 4 - grille de 7 colonnes sur 6 rangees
//  Le jeton tombe sur la premiere case libre en partant du bas, et le
//  premier a en aligner quatre gagne, dans les quatre directions.
//  L'IA est un minimax alpha-beta qui explore les colonnes du centre
//  vers les bords, ce qui rend l'elagage bien plus efficace.
//
//  Refonte V2 : daruma contre oni. Le joueur pose des daruma lime, l'IA
//  des masques d'oni vermillon. Les jetons tombent derriere la facade
//  laquee du plateau et rebondissent pour de vrai, la ligne gagnante se
//  trace net, un indice (limite) montre le meilleur coup, et une serie de
//  victoires est tenue par difficulte.
// =====================================================================

import { enregistrerJeu, finDePartie, quitterJeu, jeuActif, majScoreCourant } from "./arcade.js";
import { surTouche, jeuAuPremierPlan } from "./noyau/clavier.js";
import { creerAfficheur } from "./noyau/message.js";
import { creerStockage } from "./noyau/stockage.js";
import { creerBoutonsChoix, marquerChoixActif } from "./noyau/choix.js";
import { creerBoucle } from "./noyau/boucle.js";
import { creerEffets } from "./noyau/effets.js";
import { abscisseLogique } from "./noyau/pointeur.js";
import { jouer, basculerSon, sonActif } from "./noyau/son.js";
import { creerVersus, versusDisponible } from "./versus.js";

const zonePuissance4 = document.getElementById("jeuPuissance4");

// La section est reconstruite ici : la grille de cases HTML laisse la
// place a un plateau dessine, et l'en-tete gagne l'indice et la serie.
zonePuissance4.innerHTML = `
  <div class="jeu-entete entete-p4">
    <span class="jeu-score score-principal">Coups <strong class="valeur-score" id="coupsP4">0</strong></span>
    <span class="jeu-score">S&eacute;rie <strong id="serieP4">0</strong></span>
    <span class="entete-boutons-p4">
      <button class="jeu-quitter" id="indiceP4" type="button">Indice</button>
      <button class="jeu-quitter" id="annulerP4" type="button">Annuler</button>
      <button class="jeu-quitter" id="nouvelleP4" type="button">Nouvelle partie</button>
      <button class="jeu-quitter" id="sonP4" type="button" aria-pressed="false">Son</button>
      <button class="jeu-quitter" id="quitterP4" type="button">Retour</button>
    </span>
  </div>
  <div class="scores-ligne" id="difficultesP4"></div>
  <canvas id="canvasP4" width="480" height="488"></canvas>
  <p class="jeu-message" id="messageP4"></p>
  <p class="stats-p4" id="statsP4"></p>
  <p class="jeu-aide">Clic ou tape sur une colonne pour y l&acirc;cher ton daruma, ou Gauche / Droite puis Espace, ou les touches 1 &agrave; 7. Aligne quatre daruma avant les oni. H : indice. Retour arri&egrave;re : annuler. N : nouvelle partie. M : son. &Eacute;chap : quitter.</p>
`;

const canvasP4 = document.getElementById("canvasP4");
const contexteP4 = canvasP4.getContext("2d");
const zoneDifficultesP4 = document.getElementById("difficultesP4");
const zoneCoupsP4 = document.getElementById("coupsP4");
const zoneSerieP4 = document.getElementById("serieP4");
const zoneMessageP4 = document.getElementById("messageP4");
const zoneStatsP4 = document.getElementById("statsP4");
const boutonIndiceP4 = document.getElementById("indiceP4");
const boutonAnnulerP4 = document.getElementById("annulerP4");
const boutonNouvelleP4 = document.getElementById("nouvelleP4");
const boutonSonP4 = document.getElementById("sonP4");
const boutonQuitterP4 = document.getElementById("quitterP4");

const CLE_P4 = "tanuki-arcade-puissance4";
const COLONNES = 7;
const RANGEES = 6;
const CASES = COLONNES * RANGEES;

const VIDE = 0;
const JOUEUR = 1;   // daruma lime, c'est lui qui commence
const IA = 2;       // masques d'oni vermillon

// Une victoire trouvee tot vaut mieux qu'une victoire lointaine : on ajoute
// la profondeur restante pour que l'IA conclue au lieu de faire trainer.
const VICTOIRE = 1000000;

const BUDGET_P4_MS = 1000;
const INDICES_PAR_PARTIE = 2;
const MALUS_INDICE = 50;      // points retires du score de victoire par indice

// Du centre vers les bords : l'elagage coupe beaucoup plus tot
const ORDRE_COLONNES = [3, 2, 4, 1, 5, 0, 6];

const DIFFICULTES_P4 = [
  { id: "facile", nom: "Facile", profondeur: 3, bonus: 0 },
  { id: "moyen", nom: "Moyen", profondeur: 5, bonus: 200 },
  { id: "difficile", nom: "Difficile", profondeur: 7, bonus: 500 },
  // Deux joueurs sur le meme ecran : daruma contre oni, sans classement
  { id: "deux", nom: "À deux", profondeur: 5, bonus: 0, deux: true },
  // Contre quelqu'un d'autre, sur son propre appareil (Supabase)
  { id: "ligne", nom: "En ligne", profondeur: 5, bonus: 0, ligne: true }
];
const CHOIX_P4 = DIFFICULTES_P4.filter(d => !d.ligne || versusDisponible());

// Bareme des fenetres de quatre cases
const TROIS_ET_UN_VIDE = 50;
const DEUX_ET_DEUX_VIDES = 5;
// L'adversaire pese un peu plus lourd, pour que l'IA pense a defendre
const TROIS_ADVERSES = 70;
const DEUX_ADVERSES = 7;
const BONUS_COLONNE_CENTRALE = 4;

let grilleP4 = new Int8Array(CASES);
let tourAuJoueurP4 = true;
let difficulteP4 = DIFFICULTES_P4[0];
let p4Termine = true;
let coupsJouesP4 = 0;
let iaReflechitP4 = false;
let historiqueP4 = [];
let alignementGagnant = null;   // les quatre cases gagnantes
let colonneSurvolee = -1;       // colonne visee a la souris ou au clavier
let derniereChute = null;       // derniere case posee
let chronoReflexionP4 = null;
let indicesRestants = INDICES_PAR_PARTIE;
let indicesUtilises = 0;
let indiceAffiche = null;       // { colonne, reste } pendant que l'indice est montre

// ---------------------------------------------------------------------
// Outils de grille
// ---------------------------------------------------------------------

// La rangee 0 est en haut, la rangee 5 en bas : le jeton tombe vers le bas
function indexP4(rangee, colonne) {
  return rangee * COLONNES + colonne;
}

function rangeeDe(position) {
  return Math.floor(position / COLONNES);
}

function colonneDe(position) {
  return position % COLONNES;
}

function dansLaGrilleP4(rangee, colonne) {
  return rangee >= 0 && rangee < RANGEES && colonne >= 0 && colonne < COLONNES;
}

// La premiere case libre en partant du bas, ou -1 si la colonne est pleine
function premiereLibre(grille, colonne) {
  for (let rangee = RANGEES - 1; rangee >= 0; rangee--) {
    if (grille[indexP4(rangee, colonne)] === VIDE) {
      return rangee;
    }
  }
  return -1;
}

function colonnesJouables(grille) {
  const liste = [];
  for (const colonne of ORDRE_COLONNES) {
    if (grille[indexP4(0, colonne)] === VIDE) {
      liste.push(colonne);
    }
  }
  return liste;
}

function grillePleine(grille) {
  return colonnesJouables(grille).length === 0;
}

function compterJetons(grille) {
  let total = 0;
  for (let position = 0; position < CASES; position++) {
    if (grille[position] !== VIDE) {
      total++;
    }
  }
  return total;
}

// ---------------------------------------------------------------------
// Detection de victoire
// ---------------------------------------------------------------------

// Les quatre directions : horizontale, verticale et les deux diagonales
const DIRECTIONS_P4 = [[0, 1], [1, 0], [1, 1], [1, -1]];

// Renvoie les quatre cases alignees qui passent par le jeton qu'on vient de
// poser, ou null. On part de la case posee et on compte de part et d'autre.
function alignementDepuis(grille, rangee, colonne, camp) {
  for (const [pasRangee, pasColonne] of DIRECTIONS_P4) {
    const cases = [indexP4(rangee, colonne)];

    for (const sens of [1, -1]) {
      let r = rangee + pasRangee * sens;
      let c = colonne + pasColonne * sens;
      while (dansLaGrilleP4(r, c) && grille[indexP4(r, c)] === camp) {
        cases.push(indexP4(r, c));
        r += pasRangee * sens;
        c += pasColonne * sens;
      }
    }

    if (cases.length >= 4) {
      // On rend exactement quatre cases contigues, dans l'ordre de la ligne
      cases.sort((a, b) => a - b);
      const debut = cases.findIndex(p => p === indexP4(rangee, colonne));
      const depart = Math.min(Math.max(0, debut - 3), cases.length - 4);
      return cases.slice(depart, depart + 4);
    }
  }
  return null;
}

function aGagne(grille, rangee, colonne, camp) {
  return alignementDepuis(grille, rangee, colonne, camp) !== null;
}

// ---------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------

// Note une fenetre de quatre cases du point de vue de l'IA
function noterFenetre(a, b, c, d) {
  let ia = 0;
  let joueur = 0;
  for (const valeur of [a, b, c, d]) {
    if (valeur === IA) {
      ia++;
    } else if (valeur === JOUEUR) {
      joueur++;
    }
  }
  // Une fenetre partagee ne mene nulle part
  if (ia > 0 && joueur > 0) {
    return 0;
  }
  if (ia === 3) {
    return TROIS_ET_UN_VIDE;
  }
  if (ia === 2) {
    return DEUX_ET_DEUX_VIDES;
  }
  if (joueur === 3) {
    return -TROIS_ADVERSES;
  }
  if (joueur === 2) {
    return -DEUX_ADVERSES;
  }
  return 0;
}

function evaluerP4(grille) {
  let note = 0;

  // Toutes les fenetres de quatre, dans les quatre directions
  for (const [pasRangee, pasColonne] of DIRECTIONS_P4) {
    for (let rangee = 0; rangee < RANGEES; rangee++) {
      for (let colonne = 0; colonne < COLONNES; colonne++) {
        const finRangee = rangee + pasRangee * 3;
        const finColonne = colonne + pasColonne * 3;
        if (!dansLaGrilleP4(finRangee, finColonne)) {
          continue;
        }
        note += noterFenetre(
          grille[indexP4(rangee, colonne)],
          grille[indexP4(rangee + pasRangee, colonne + pasColonne)],
          grille[indexP4(rangee + pasRangee * 2, colonne + pasColonne * 2)],
          grille[indexP4(finRangee, finColonne)]
        );
      }
    }
  }

  // La colonne centrale est statistiquement la plus forte
  const centre = Math.floor(COLONNES / 2);
  for (let rangee = 0; rangee < RANGEES; rangee++) {
    const valeur = grille[indexP4(rangee, centre)];
    if (valeur === IA) {
      note += BONUS_COLONNE_CENTRALE;
    } else if (valeur === JOUEUR) {
      note -= BONUS_COLONNE_CENTRALE;
    }
  }
  return note;
}

// ---------------------------------------------------------------------
// Minimax
// ---------------------------------------------------------------------

let limiteReflexionP4 = 0;
let rechercheAbandonneeP4 = false;

// La victoire est testee juste apres avoir pose le jeton, donc avant toute
// evaluation : une position gagnee n'est jamais confondue avec une position
// simplement prometteuse.
function minimaxP4(grille, profondeur, alpha, beta, estIa) {
  if (performance.now() > limiteReflexionP4) {
    rechercheAbandonneeP4 = true;
    return 0;
  }
  const colonnes = colonnesJouables(grille);
  if (colonnes.length === 0) {
    return 0;   // grille pleine, match nul
  }
  if (profondeur === 0) {
    return evaluerP4(grille);
  }

  const camp = estIa ? IA : JOUEUR;
  let meilleur = estIa ? -Infinity : Infinity;

  for (const colonne of colonnes) {
    const rangee = premiereLibre(grille, colonne);
    grille[indexP4(rangee, colonne)] = camp;

    let note;
    if (aGagne(grille, rangee, colonne, camp)) {
      note = estIa ? VICTOIRE + profondeur : -VICTOIRE - profondeur;
    } else {
      note = minimaxP4(grille, profondeur - 1, alpha, beta, !estIa);
    }

    grille[indexP4(rangee, colonne)] = VIDE;

    if (estIa) {
      if (note > meilleur) {
        meilleur = note;
      }
      if (meilleur > alpha) {
        alpha = meilleur;
      }
    } else {
      if (note < meilleur) {
        meilleur = note;
      }
      if (meilleur < beta) {
        beta = meilleur;
      }
    }
    if (alpha >= beta || rechercheAbandonneeP4) {
      break;
    }
  }
  return meilleur;
}

// Approfondissement progressif : si le budget est depasse, on garde la
// derniere profondeur terminee plutot que de faire attendre la page.
function choisirColonneIa(grille, profondeurVisee, budget) {
  const colonnes = colonnesJouables(grille);
  if (colonnes.length === 0) {
    return null;
  }
  const debut = performance.now();
  limiteReflexionP4 = debut + budget;

  let meilleureColonne = colonnes[0];
  let profondeurAtteinte = 0;

  for (let profondeur = 1; profondeur <= profondeurVisee; profondeur++) {
    rechercheAbandonneeP4 = false;
    let meilleureNote = -Infinity;
    let colonneDeCeTour = null;
    let alpha = -Infinity;

    for (const colonne of colonnes) {
      const rangee = premiereLibre(grille, colonne);
      grille[indexP4(rangee, colonne)] = IA;

      let note;
      if (aGagne(grille, rangee, colonne, IA)) {
        note = VICTOIRE + profondeur;
      } else {
        note = minimaxP4(grille, profondeur - 1, alpha, Infinity, false);
      }
      grille[indexP4(rangee, colonne)] = VIDE;

      if (rechercheAbandonneeP4) {
        break;
      }
      if (colonneDeCeTour === null || note > meilleureNote) {
        meilleureNote = note;
        colonneDeCeTour = colonne;
      }
      if (note > alpha) {
        alpha = note;
      }
    }

    if (rechercheAbandonneeP4 || colonneDeCeTour === null) {
      break;
    }
    meilleureColonne = colonneDeCeTour;
    profondeurAtteinte = profondeur;

    // Inutile de chercher plus loin si la victoire est deja en vue
    if (meilleureNote >= VICTOIRE) {
      break;
    }
    if (performance.now() - debut > budget / 2) {
      break;
    }
  }

  return {
    colonne: meilleureColonne,
    profondeur: profondeurAtteinte,
    duree: Math.round(performance.now() - debut)
  };
}

// ---------------------------------------------------------------------
// Sauvegarde
// ---------------------------------------------------------------------

const stockageP4 = creerStockage(CLE_P4);

function sauverP4() {
  if (p4Termine || difficulteP4.ligne) {
    return;
  }
  stockageP4.ecrire({
    difficulte: difficulteP4.id,
    grille: Array.from(grilleP4),
    tourAuJoueur: tourAuJoueurP4,
    coups: coupsJouesP4,
    historique: historiqueP4.slice(-40),
    indicesRestants,
    indicesUtilises
  });
}

function effacerSauvegardeP4() {
  stockageP4.effacer();
}

function chargerP4() {
  const donnees = stockageP4.lire();
  if (donnees === null) {
    return false;
  }
  const difficulte = DIFFICULTES_P4.find(d => d.id === donnees.difficulte);
  if (!difficulte || difficulte.ligne || !Array.isArray(donnees.grille) || donnees.grille.length !== CASES) {
    return false;
  }
  difficulteP4 = difficulte;
  grilleP4 = Int8Array.from(donnees.grille);
  tourAuJoueurP4 = donnees.tourAuJoueur !== false;
  coupsJouesP4 = donnees.coups || 0;
  historiqueP4 = Array.isArray(donnees.historique) ? donnees.historique : [];
  indicesRestants = Number.isInteger(donnees.indicesRestants) ? donnees.indicesRestants : INDICES_PAR_PARTIE;
  indicesUtilises = Number.isInteger(donnees.indicesUtilises) ? donnees.indicesUtilises : 0;
  return true;
}

// ---------------------------------------------------------------------
// Statistiques par difficulte : victoires, defaites, nuls et series
// ---------------------------------------------------------------------

const stockageStatsP4 = creerStockage("tanuki-arcade-p4-stats");

function lireStats() {
  const toutes = stockageStatsP4.lire() || {};
  const s = toutes[difficulteP4.id] || {};
  return {
    victoires: s.victoires || 0,
    defaites: s.defaites || 0,
    nuls: s.nuls || 0,
    serie: s.serie || 0,
    meilleureSerie: s.meilleureSerie || 0
  };
}

function noterResultat(resultat) {
  const toutes = stockageStatsP4.lire() || {};
  const s = lireStats();
  if (resultat === "victoire") {
    s.victoires++;
    s.serie++;
    s.meilleureSerie = Math.max(s.meilleureSerie, s.serie);
  } else if (resultat === "defaite") {
    s.defaites++;
    s.serie = 0;
  } else {
    s.nuls++;
  }
  toutes[difficulteP4.id] = s;
  stockageStatsP4.ecrire(toutes);
  afficherStats();
}

function afficherStats() {
  if (difficulteP4.ligne) {
    zoneSerieP4.textContent = "-";
    zoneStatsP4.textContent = "En ligne : tu joues les daruma, ton adversaire les oni. La victoire fait monter ta cote.";
    return;
  }
  if (difficulteP4.deux) {
    zoneSerieP4.textContent = "-";
    zoneStatsP4.textContent = "À deux sur le même écran : daruma contre oni, chacun son tour.";
    return;
  }
  const s = lireStats();
  zoneSerieP4.textContent = String(s.serie);
  zoneStatsP4.textContent = difficulteP4.nom + " : " + s.victoires + " victoire" + (s.victoires > 1 ? "s" : "")
    + ", " + s.defaites + " défaite" + (s.defaites > 1 ? "s" : "")
    + ", " + s.nuls + " nul" + (s.nuls > 1 ? "s" : "")
    + ". Meilleure série : " + s.meilleureSerie + ".";
}

// ---------------------------------------------------------------------
// Partie
// ---------------------------------------------------------------------

function scoreDeVictoire() {
  return Math.max(1, 1000 - 20 * coupsJouesP4 + difficulteP4.bonus - MALUS_INDICE * indicesUtilises);
}

function nouvellePartieP4(difficulte) {
  if (difficulteP4.ligne && versusP4.actif && difficulte.ligne) {
    return;   // une partie en ligne se joue jusqu'au bout (ou s'abandonne)
  }
  if (difficulteP4.ligne && !difficulte.ligne && versusP4.ouvert) {
    versusP4.fermer();
    if (versusP4.ouvert) {
      return;   // le joueur a refuse d'abandonner
    }
  }
  clearTimeout(chronoReflexionP4);
  difficulteP4 = difficulte;
  grilleP4 = new Int8Array(CASES);
  tourAuJoueurP4 = true;
  coupsJouesP4 = 0;
  p4Termine = false;
  iaReflechitP4 = false;
  historiqueP4 = [];
  alignementGagnant = null;
  derniereChute = null;
  indicesRestants = INDICES_PAR_PARTIE;
  indicesUtilises = 0;
  indiceAffiche = null;
  chutes = [];
  apresChutes = [];
  coupEnAttente = null;
  effetsP4.vider();
  effacerSauvegardeP4();
  afficherMessageP4("");
  afficherStats();
  if (difficulteP4.ligne) {
    p4Termine = true;   // le plateau attend l'adversaire
    versusP4.ouvrir();
  }
  majInterfaceP4();
}

function demarrerP4() {
  clearTimeout(chronoReflexionP4);
  iaReflechitP4 = false;
  alignementGagnant = null;
  derniereChute = null;
  indiceAffiche = null;
  chutes = [];
  apresChutes = [];
  coupEnAttente = null;
  effetsP4.vider();
  if (colonneSurvolee < 0) {
    colonneSurvolee = 3;
  }
  majBoutonSonP4();
  ajusterP4();
  requestAnimationFrame(ajusterP4);
  boucleP4.lancer();
  if (difficulteP4.ligne && versusP4.ouvert) {
    versusP4.reprendreSondage();
    majInterfaceP4();
    return;
  }
  if (difficulteP4.ligne) {
    difficulteP4 = DIFFICULTES_P4[0];
  }
  if (chargerP4()) {
    p4Termine = false;
    afficherMessageP4("");
    afficherStats();
    majInterfaceP4();
    // La sauvegarde peut avoir ete prise juste avant le coup de l'IA
    if (!tourAuJoueurP4 && !difficulteP4.deux) {
      lancerReflexionP4();
    }
  } else {
    nouvellePartieP4(difficulteP4);
  }
}

function arreterP4() {
  clearTimeout(chronoReflexionP4);
  versusP4.suspendre();
  boucleP4.arreter();
}

function terminerP4(texte, resultat) {
  p4Termine = true;
  iaReflechitP4 = false;
  clearTimeout(chronoReflexionP4);
  effacerSauvegardeP4();
  afficherMessageP4(texte, true);
  majInterfaceP4();
  if (difficulteP4.ligne) {
    if (resultat === "victoire") {
      jouer("vague");
      celebrer();
    } else if (resultat === "defaite") {
      jouer("mort");
    }
    versusP4.terminer(resultat, resultat === "nul" ? "pleine" : "alignement");
    return;
  }
  if (difficulteP4.deux) {
    // Partie a deux : la fete, mais ni statistiques ni classement
    if (resultat === "deux") {
      jouer("vague");
      celebrer();
    }
    return;
  }
  noterResultat(resultat);

  if (resultat === "victoire") {
    jouer("vague");
    celebrer();
    // Le classement n'enregistre que les victoires du joueur
    finDePartie("puissance4-" + difficulteP4.id, scoreDeVictoire(), "Puissance 4 " + difficulteP4.nom);
  } else if (resultat === "defaite") {
    jouer("mort");
  }
}

// Pose un jeton, lance sa chute, et conclut si la partie s'arrete la.
// La fin n'est annoncee qu'une fois le jeton arrive en bas.
function poserJeton(colonne, camp) {
  const rangee = premiereLibre(grilleP4, colonne);
  if (rangee < 0) {
    return false;
  }
  grilleP4[indexP4(rangee, colonne)] = camp;
  coupsJouesP4++;
  derniereChute = { position: indexP4(rangee, colonne), hauteur: rangee + 1 };
  lancerChute(colonne, rangee, camp);
  indiceAffiche = null;

  const aligne = alignementDepuis(grilleP4, rangee, colonne, camp);
  if (aligne !== null) {
    p4Termine = true;
    apresLesChutes(() => {
      alignementGagnant = aligne;
      if (difficulteP4.deux) {
        terminerP4(camp === JOUEUR ? "Les daruma gagnent, quatre alignés." : "Les oni gagnent, quatre masques alignés.", "deux");
        return;
      }
      terminerP4(camp === JOUEUR ? "Gagné, quatre daruma alignés." : "Perdu, les oni alignent quatre masques.",
        camp === JOUEUR ? "victoire" : "defaite");
    });
    return true;
  }
  if (grillePleine(grilleP4)) {
    p4Termine = true;
    apresLesChutes(() => terminerP4("Grille pleine, match nul.", "nul"));
    return true;
  }
  return true;
}

// Peut-on poser un jeton maintenant (a deux, chacun son tour)
function peutJouer() {
  return !p4Termine && !iaReflechitP4 && (difficulteP4.deux || tourAuJoueurP4)
    && (!difficulteP4.ligne || versusP4.actif);
}

function jouerColonneJoueur(colonne) {
  // Un coup demande pendant que le masque de l'oni tombe encore est garde
  // et joue des que le plateau est calme
  if (peutJouer() && chutes.length > 0) {
    coupEnAttente = colonne;
    return;
  }
  if (!peutJouer()) {
    return;
  }
  if (premiereLibre(grilleP4, colonne) < 0) {
    afficherMessageP4("Cette colonne est pleine.");
    jouer("clic");
    return;
  }

  historiqueP4.push({
    grille: Array.from(grilleP4),
    coups: coupsJouesP4,
    tourAuJoueur: tourAuJoueurP4
  });
  if (historiqueP4.length > 40) {
    historiqueP4.shift();
  }

  colonneSurvolee = colonne;
  if (difficulteP4.ligne) {
    historiqueP4 = [];
    poserJeton(colonne, JOUEUR);
    tourAuJoueurP4 = false;
    versusP4.envoyer({ col: colonne });
    versusP4.tour(false);
    if (!p4Termine) {
      afficherMessageP4("Au tour de " + versusP4.adversaire + ".", true);
    }
    majInterfaceP4();
    return;
  }
  if (difficulteP4.deux) {
    // A deux : on pose le jeton du camp au trait, puis la main passe
    poserJeton(colonne, campAuTrait());
    tourAuJoueurP4 = !tourAuJoueurP4;
    majInterfaceP4();
    sauverP4();
    return;
  }
  poserJeton(colonne, JOUEUR);
  tourAuJoueurP4 = false;
  majInterfaceP4();
  sauverP4();

  if (p4Termine) {
    return;
  }
  // L'IA ne reflechit qu'une fois le daruma arrive : le calcul bloque la
  // page un instant, la chute doit etre finie avant.
  apresLesChutes(lancerReflexionP4);
}

function lancerReflexionP4() {
  iaReflechitP4 = true;
  afficherMessageP4("Les oni réfléchissent...", true);
  majInterfaceP4();

  // La recherche part dans un setTimeout : l'indicateur a le temps de
  // s'afficher avant que le calcul ne prenne la main.
  clearTimeout(chronoReflexionP4);
  chronoReflexionP4 = setTimeout(function () {
    if (p4Termine || jeuActif !== "puissance4") {
      iaReflechitP4 = false;
      return;
    }
    const resultat = choisirColonneIa(grilleP4, difficulteP4.profondeur, BUDGET_P4_MS);
    iaReflechitP4 = false;

    if (resultat === null) {
      terminerP4("Grille pleine, match nul.", "nul");
      return;
    }
    poserJeton(resultat.colonne, IA);
    tourAuJoueurP4 = true;
    if (!p4Termine) {
      afficherMessageP4("");
    }
    majInterfaceP4();
    sauverP4();
  }, 80);
}

// Annuler revient sur le coup complet : celui du joueur et la reponse de l'IA
function annulerCoupP4() {
  if (difficulteP4.ligne || iaReflechitP4 || historiqueP4.length === 0) {
    return;
  }
  const etat = historiqueP4.pop();
  grilleP4 = Int8Array.from(etat.grille);
  coupsJouesP4 = etat.coups;
  tourAuJoueurP4 = difficulteP4.deux ? etat.tourAuJoueur !== false : true;
  p4Termine = false;
  alignementGagnant = null;
  derniereChute = null;
  indiceAffiche = null;
  chutes = [];
  apresChutes = [];
  coupEnAttente = null;
  clearTimeout(chronoReflexionP4);
  afficherMessageP4("");
  majInterfaceP4();
  sauverP4();
}

// L'indice : le coup que l'IA jouerait a ta place. On retourne la grille
// (daruma et oni echangent leurs roles) et on lui demande son choix.
function demanderIndice() {
  if (difficulteP4.ligne || !peutJouer() || chutes.length > 0) {
    return;
  }
  if (indicesRestants <= 0) {
    afficherMessageP4("Plus d'indice pour cette partie.");
    return;
  }
  // L'IA joue les oni : pour conseiller le daruma, on retourne la grille
  const miroir = campAuTrait() === JOUEUR ? grilleP4.map(v => (v === JOUEUR ? IA : v === IA ? JOUEUR : VIDE)) : grilleP4;
  const resultat = choisirColonneIa(miroir, Math.max(5, difficulteP4.profondeur), 600);
  if (resultat === null) {
    return;
  }
  indicesRestants--;
  indicesUtilises++;
  indiceAffiche = { colonne: resultat.colonne, reste: 3 };
  colonneSurvolee = resultat.colonne;
  afficherMessageP4("L'indice conseille la colonne " + (resultat.colonne + 1) + ".");
  jouer("bonus");
  majInterfaceP4();
  sauverP4();
}

const effacerMessageP4 = creerAfficheur(zoneMessageP4, {
  delai: 2200,
  peutEffacer: () => !p4Termine
});

// Un message permanent reste jusqu'au suivant
function afficherMessageP4(texte, permanent) {
  effacerMessageP4(texte, texte === "" || permanent ? 0 : undefined);
}

// ---------------------------------------------------------------------
// Chutes : chaque jeton tombe avec la gravite et rebondit deux fois
// ---------------------------------------------------------------------

// Le plateau vit dans un repere logique de 480 x 520, dessine a la
// resolution reelle de l'ecran (echelleP4) pour rester net partout.
const W_P4 = 480;
const H_P4 = 520;
const CASE = 62;
const MARGE_X = (W_P4 - COLONNES * CASE) / 2;
const HAUT_PLATEAU = 96;
const RAYON_TROU = 26;
const RAYON_JETON = 24;
const GRAVITE = 5200;           // px/s2
const RESTITUTION = 0.3;

let echelleP4 = 1;
let chutes = [];                // jetons en train de tomber
let apresChutes = [];           // actions qui attendent la fin des chutes
let coupEnAttente = null;       // colonne demandee pendant une chute
let tempsVictoire = 0;          // secondes depuis la ligne gagnante

function centreX(colonne) {
  return MARGE_X + colonne * CASE + CASE / 2;
}

function centreY(rangee) {
  return HAUT_PLATEAU + 12 + rangee * CASE + CASE / 2;
}

function lancerChute(colonne, rangee, camp) {
  chutes.push({ colonne, rangee, camp, y: 44, vy: 120, rebonds: 0 });
}

function apresLesChutes(action) {
  if (chutes.length === 0) {
    action();
  } else {
    apresChutes.push(action);
  }
}

function majChutes(delta) {
  chutes = chutes.filter(chute => {
    const cible = centreY(chute.rangee);
    chute.vy += GRAVITE * delta;
    chute.y += chute.vy * delta;
    if (chute.y >= cible) {
      chute.y = cible;
      if (chute.rebonds === 0) {
        effetsP4.secouer(2, 0.12);
        jouer("clic");
      }
      if (chute.vy > 420 && chute.rebonds < 2) {
        chute.vy = -chute.vy * RESTITUTION;
        chute.rebonds++;
        return true;
      }
      return false;
    }
    return true;
  });
  if (chutes.length === 0 && apresChutes.length > 0) {
    const actions = apresChutes;
    apresChutes = [];
    actions.forEach(action => action());
  }
  if (chutes.length === 0 && coupEnAttente !== null) {
    const colonne = coupEnAttente;
    coupEnAttente = null;
    jouerColonneJoueur(colonne);
  }
}

function celebrer() {
  if (alignementGagnant === null) {
    return;
  }
  tempsVictoire = 0;
  alignementGagnant.forEach((position, i) => {
    setTimeout(() => {
      effetsP4.eclater(centreX(colonneDe(position)), centreY(rangeeDe(position)),
        ["#c8f060", "#e6ffa6", "#e8c547", "#ede8df"], 14, 170);
    }, 120 * i);
  });
  effetsP4.secouer(4, 0.3);
}

// ---------------------------------------------------------------------
// Dessin : jetons en volume, plateau laque perce de 42 trous
// ---------------------------------------------------------------------

const effetsP4 = creerEffets();
let cacheJetons = new Map();

const TEINTES = {
  [JOUEUR]: { clair: "#d8f57a", base: "#9fc43f", sombre: "#4f6a1c", tranche: "#3b5014" },
  [IA]: { clair: "#ff8a74", base: "#d2412f", sombre: "#7e1d14", tranche: "#5a140d" }
};

function visageDaruma(c) {
  // Visage ivoire, sourcils noirs, yeux ronds, moustache doree
  c.fillStyle = "#f3ead6";
  c.beginPath();
  c.ellipse(0, -3, 13, 11, 0, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = "#1c1612";
  c.lineWidth = 2;
  c.lineCap = "round";
  c.beginPath();
  c.moveTo(-10, -9);
  c.quadraticCurveTo(-6, -12, -2, -9);
  c.moveTo(10, -9);
  c.quadraticCurveTo(6, -12, 2, -9);
  c.stroke();
  c.fillStyle = "#1c1612";
  c.beginPath();
  c.arc(-5.5, -3.5, 2.6, 0, Math.PI * 2);
  c.arc(5.5, -3.5, 2.6, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = "#c99a1e";
  c.lineWidth = 2.2;
  c.beginPath();
  c.moveTo(-8, 3);
  c.quadraticCurveTo(-4, 6, 0, 3);
  c.quadraticCurveTo(4, 6, 8, 3);
  c.stroke();
  // Ventre dore
  c.fillStyle = "#e8c547";
  c.beginPath();
  c.ellipse(0, 13, 8, 3.2, 0, 0, Math.PI * 2);
  c.fill();
}

function visageOni(c) {
  // Cornes ivoire, sourcils en colere, yeux jaunes, crocs
  c.fillStyle = "#f3ead6";
  c.beginPath();
  c.moveTo(-12, -10);
  c.lineTo(-8, -21);
  c.lineTo(-5, -11);
  c.closePath();
  c.moveTo(12, -10);
  c.lineTo(8, -21);
  c.lineTo(5, -11);
  c.closePath();
  c.fill();
  c.strokeStyle = "#2a0d09";
  c.lineWidth = 2.6;
  c.lineCap = "round";
  c.beginPath();
  c.moveTo(-12, -8);
  c.lineTo(-3, -4);
  c.moveTo(12, -8);
  c.lineTo(3, -4);
  c.stroke();
  c.fillStyle = "#f2c63a";
  c.beginPath();
  c.ellipse(-6, -1, 4, 3, 0, 0, Math.PI * 2);
  c.ellipse(6, -1, 4, 3, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#2a0d09";
  c.beginPath();
  c.arc(-5.5, -1, 1.6, 0, Math.PI * 2);
  c.arc(5.5, -1, 1.6, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#2a0d09";
  c.beginPath();
  c.roundRect(-9, 6, 18, 7, 3);
  c.fill();
  c.fillStyle = "#f3ead6";
  c.beginPath();
  c.moveTo(-7, 6);
  c.lineTo(-5, 11);
  c.lineTo(-3, 6);
  c.moveTo(3, 6);
  c.lineTo(5, 11);
  c.lineTo(7, 6);
  c.fill();
}

function spriteJeton(camp) {
  if (cacheJetons.has(camp)) {
    return cacheJetons.get(camp);
  }
  const taille = Math.ceil((RAYON_JETON * 2 + 8) * echelleP4);
  const toile = document.createElement("canvas");
  toile.width = toile.height = taille;
  const c = toile.getContext("2d");
  c.setTransform(echelleP4, 0, 0, echelleP4, taille / 2, taille / 2);
  const t = TEINTES[camp];
  const r = RAYON_JETON;
  // Tranche du jeton, visible en bas : il a une epaisseur
  c.fillStyle = t.tranche;
  c.beginPath();
  c.arc(0, 2.5, r, 0, Math.PI * 2);
  c.fill();
  // Face bombee
  const g = c.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
  g.addColorStop(0, t.clair);
  g.addColorStop(0.55, t.base);
  g.addColorStop(1, t.sombre);
  c.fillStyle = g;
  c.beginPath();
  c.arc(0, 0, r, 0, Math.PI * 2);
  c.fill();
  // Rebord en relief
  c.strokeStyle = t.sombre;
  c.lineWidth = 2;
  c.beginPath();
  c.arc(0, 0, r - 4, 0, Math.PI * 2);
  c.stroke();
  c.save();
  c.scale(0.92, 0.92);
  if (camp === JOUEUR) {
    visageDaruma(c);
  } else {
    visageOni(c);
  }
  c.restore();
  // Reflet
  c.fillStyle = "rgba(255,255,255,0.35)";
  c.beginPath();
  c.ellipse(-r * 0.45, -r * 0.55, r * 0.28, r * 0.13, -0.6, 0, Math.PI * 2);
  c.fill();
  cacheJetons.set(camp, toile);
  return toile;
}

function dessinerJeton(camp, x, y, alpha, echelleJeton) {
  const s = echelleJeton || 1;
  const taille = (RAYON_JETON * 2 + 8) * s;
  contexteP4.globalAlpha = alpha === undefined ? 1 : alpha;
  contexteP4.drawImage(spriteJeton(camp), x - taille / 2, y - taille / 2, taille, taille);
  contexteP4.globalAlpha = 1;
}

// La facade laquee se dessine par-dessus les jetons : on les voit tomber
// derriere, a travers les trous.
let facade = null;
let decor = null;

function preparerDecor() {
  const toile = document.createElement("canvas");
  toile.width = Math.round(W_P4 * echelleP4);
  toile.height = Math.round(H_P4 * echelleP4);
  const c = toile.getContext("2d");
  c.setTransform(echelleP4, 0, 0, echelleP4, 0, 0);
  const g = c.createLinearGradient(0, 0, 0, H_P4);
  g.addColorStop(0, "#1a1524");
  g.addColorStop(1, "#0d0b12");
  c.fillStyle = g;
  c.fillRect(0, 0, W_P4, H_P4);
  // Le sol de tatami sur lequel pose le plateau
  c.fillStyle = "#2b2a1c";
  c.fillRect(0, H_P4 - 30, W_P4, 30);
  c.fillStyle = "#3a3824";
  c.fillRect(0, H_P4 - 30, W_P4, 3);
  // Ombre du plateau au sol
  c.fillStyle = "rgba(0,0,0,0.45)";
  c.beginPath();
  c.ellipse(W_P4 / 2, H_P4 - 16, COLONNES * CASE / 2 + 30, 9, 0, 0, Math.PI * 2);
  c.fill();
  // Fond des trous : l'interieur du plateau, tres sombre
  c.fillStyle = "#0a0709";
  c.fillRect(MARGE_X - 6, HAUT_PLATEAU, COLONNES * CASE + 12, RANGEES * CASE + 24);
  decor = toile;
}

function preparerFacade() {
  const toile = document.createElement("canvas");
  toile.width = Math.round(W_P4 * echelleP4);
  toile.height = Math.round(H_P4 * echelleP4);
  const c = toile.getContext("2d");
  c.setTransform(echelleP4, 0, 0, echelleP4, 0, 0);
  const gauche = MARGE_X - 14;
  const largeur = COLONNES * CASE + 28;
  const hauteur = RANGEES * CASE + 24;

  // Bois laque vermillon, perce de 42 trous
  const forme = new Path2D();
  forme.roundRect(gauche, HAUT_PLATEAU, largeur, hauteur, 10);
  for (let rangee = 0; rangee < RANGEES; rangee++) {
    for (let colonne = 0; colonne < COLONNES; colonne++) {
      forme.moveTo(centreX(colonne) + RAYON_TROU, centreY(rangee));
      forme.arc(centreX(colonne), centreY(rangee), RAYON_TROU, 0, Math.PI * 2);
    }
  }
  const laque = c.createLinearGradient(0, HAUT_PLATEAU, 0, HAUT_PLATEAU + hauteur);
  laque.addColorStop(0, "#a8302a");
  laque.addColorStop(1, "#7a1f1a");
  c.fillStyle = laque;
  c.fill(forme, "evenodd");
  // Biseaux : le haut prend la lumiere, le bas est dans l'ombre
  c.fillStyle = "#c9493d";
  c.fillRect(gauche + 8, HAUT_PLATEAU, largeur - 16, 3);
  c.fillStyle = "#5e1612";
  c.fillRect(gauche + 8, HAUT_PLATEAU + hauteur - 4, largeur - 16, 4);
  // Filet d'or le long du cadre
  c.strokeStyle = "#e8c547";
  c.lineWidth = 1.5;
  c.beginPath();
  c.roundRect(gauche + 5, HAUT_PLATEAU + 5, largeur - 10, hauteur - 10, 7);
  c.stroke();
  // Profondeur de chaque trou : ombre en haut, lumiere en bas du rebord
  for (let rangee = 0; rangee < RANGEES; rangee++) {
    for (let colonne = 0; colonne < COLONNES; colonne++) {
      const x = centreX(colonne);
      const y = centreY(rangee);
      c.strokeStyle = "#4a110d";
      c.lineWidth = 4;
      c.beginPath();
      c.arc(x, y, RAYON_TROU - 1, Math.PI * 1.05, Math.PI * 1.95);
      c.stroke();
      c.strokeStyle = "#c9493d";
      c.lineWidth = 1.5;
      c.beginPath();
      c.arc(x, y, RAYON_TROU + 0.5, Math.PI * 0.15, Math.PI * 0.85);
      c.stroke();
    }
  }
  // Pieds laques noirs
  c.fillStyle = "#1a1214";
  c.beginPath();
  c.roundRect(gauche + 14, HAUT_PLATEAU + hauteur - 2, 34, 26, 4);
  c.roundRect(gauche + largeur - 48, HAUT_PLATEAU + hauteur - 2, 34, 26, 4);
  c.fill();
  c.fillStyle = "#e8c547";
  c.fillRect(gauche + 14, HAUT_PLATEAU + hauteur + 2, 34, 2);
  c.fillRect(gauche + largeur - 48, HAUT_PLATEAU + hauteur + 2, 34, 2);
  facade = toile;
}

function enChute(position) {
  return chutes.some(chute => indexP4(chute.rangee, chute.colonne) === position);
}

// Le camp qui joue maintenant (en solo, toujours le daruma)
function campAuTrait() {
  if (difficulteP4.deux) {
    return tourAuJoueurP4 ? JOUEUR : IA;
  }
  return JOUEUR;
}

function dessinerScene(delta) {
  if (facade === null || decor === null) {
    preparerDecor();
    preparerFacade();
  }
  const decalage = effetsP4.decalage();
  contexteP4.setTransform(1, 0, 0, 1, 0, 0);
  contexteP4.drawImage(decor, 0, 0);
  contexteP4.setTransform(echelleP4, 0, 0, echelleP4, decalage.x * echelleP4, decalage.y * echelleP4);

  const jouable = peutJouer() && chutes.length === 0;
  const camp = campAuTrait();

  // Colonne visee : un couloir plus clair derriere la facade
  if (jouable && colonneSurvolee >= 0) {
    contexteP4.fillStyle = camp === JOUEUR ? "rgba(159,196,63,0.16)" : "rgba(210,65,47,0.18)";
    contexteP4.fillRect(MARGE_X + colonneSurvolee * CASE + 4, HAUT_PLATEAU, CASE - 8, RANGEES * CASE + 24);
  }

  // Jetons poses
  for (let position = 0; position < CASES; position++) {
    const valeur = grilleP4[position];
    if (valeur === VIDE || enChute(position)) {
      continue;
    }
    let s = 1;
    if (alignementGagnant !== null && alignementGagnant.includes(position)) {
      const i = alignementGagnant.indexOf(position);
      const t = tempsVictoire - i * 0.12;
      s = t > 0 && t < 0.3 ? 1 + Math.sin((t / 0.3) * Math.PI) * 0.16 : 1;
    }
    dessinerJeton(valeur, centreX(colonneDe(position)), centreY(rangeeDe(position)), 1, s);
  }
  chutes.forEach(chute => dessinerJeton(chute.camp, centreX(chute.colonne), chute.y));

  // Fantome : la ou le jeton tombera
  if (jouable && colonneSurvolee >= 0) {
    const rangee = premiereLibre(grilleP4, colonneSurvolee);
    if (rangee >= 0) {
      dessinerJeton(camp, centreX(colonneSurvolee), centreY(rangee), 0.25);
    }
  }

  contexteP4.drawImage(facade, 0, 0, W_P4, H_P4);

  // Fin de partie : les autres jetons s'eteignent, la ligne se trace
  if (alignementGagnant !== null) {
    contexteP4.fillStyle = "rgba(10, 7, 9, 0.55)";
    for (let position = 0; position < CASES; position++) {
      if (grilleP4[position] !== VIDE && !alignementGagnant.includes(position)) {
        contexteP4.beginPath();
        contexteP4.arc(centreX(colonneDe(position)), centreY(rangeeDe(position)), RAYON_TROU - 1, 0, Math.PI * 2);
        contexteP4.fill();
      }
    }
    const premier = alignementGagnant[0];
    const dernier = alignementGagnant[3];
    const x0 = centreX(colonneDe(premier));
    const y0 = centreY(rangeeDe(premier));
    const x1 = centreX(colonneDe(dernier));
    const y1 = centreY(rangeeDe(dernier));
    const k = Math.min(1, tempsVictoire / 0.45);
    contexteP4.lineCap = "round";
    contexteP4.strokeStyle = "rgba(20,10,8,0.6)";
    contexteP4.lineWidth = 9;
    contexteP4.beginPath();
    contexteP4.moveTo(x0, y0 + 2);
    contexteP4.lineTo(x0 + (x1 - x0) * k, y0 + 2 + (y1 - y0) * k);
    contexteP4.stroke();
    contexteP4.strokeStyle = "#e8c547";
    contexteP4.lineWidth = 5;
    contexteP4.beginPath();
    contexteP4.moveTo(x0, y0);
    contexteP4.lineTo(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k);
    contexteP4.stroke();
    if (k >= 1) {
      contexteP4.lineWidth = 3;
      alignementGagnant.forEach(position => {
        contexteP4.beginPath();
        contexteP4.arc(centreX(colonneDe(position)), centreY(rangeeDe(position)), RAYON_TROU + 1, 0, Math.PI * 2);
        contexteP4.stroke();
      });
    }
  }

  // Indice : la colonne conseillee, encadree d'or
  if (indiceAffiche !== null) {
    const x = MARGE_X + indiceAffiche.colonne * CASE;
    contexteP4.strokeStyle = "#e8c547";
    contexteP4.lineWidth = 2;
    contexteP4.setLineDash([6, 5]);
    contexteP4.strokeRect(x + 3, HAUT_PLATEAU + 3, CASE - 6, RANGEES * CASE + 18);
    contexteP4.setLineDash([]);
  }

  // Au-dessus du plateau : le jeton qu'on tient, ou l'oni qui reflechit
  if (jouable && colonneSurvolee >= 0) {
    const flotte = Math.sin(performance.now() / 260) * 2;
    dessinerJeton(camp, centreX(colonneSurvolee), 46 + flotte);
    dessinerFlecheBas(centreX(colonneSurvolee), 78, camp === JOUEUR ? "#c8f060" : "#ff8a74");
  } else if (iaReflechitP4) {
    const t = performance.now() / 400;
    dessinerJeton(IA, W_P4 / 2 + Math.sin(t) * 60, 46, 0.75);
  }

  // Bandeau du tour en mode deux joueurs
  if (difficulteP4.deux && !p4Termine) {
    contexteP4.font = "800 15px 'Anybody', sans-serif";
    contexteP4.textAlign = jouable && colonneSurvolee >= 3 ? "left" : "right";
    contexteP4.textBaseline = "middle";
    contexteP4.fillStyle = camp === JOUEUR ? "#c8f060" : "#ff8a74";
    contexteP4.fillText(camp === JOUEUR ? "AU DARUMA" : "AUX ONI", contexteP4.textAlign === "left" ? 18 : W_P4 - 18, 22);
  }

  effetsP4.dessiner(contexteP4);
  contexteP4.setTransform(1, 0, 0, 1, 0, 0);
}

function dessinerFlecheBas(x, y, couleur) {
  contexteP4.fillStyle = couleur;
  contexteP4.beginPath();
  contexteP4.moveTo(x - 7, y);
  contexteP4.lineTo(x + 7, y);
  contexteP4.lineTo(x, y + 8);
  contexteP4.closePath();
  contexteP4.fill();
}

// Taille du plateau : la place restante sous l'en-tete et au-dessus de la
// manette, entre les classements lateraux sur grand ecran.
function ajusterP4() {
  if (zonePuissance4.hidden) {
    return;
  }
  const marge = window.innerWidth >= 1100 ? 500 : 0;
  const largeur = Math.min(window.innerWidth * 0.96 - marge, 600);
  const manette = document.querySelector(".manette:not([hidden])");
  const hManette = manette ? manette.getBoundingClientRect().height : 0;
  let autres = 0;
  [".entete-p4", "#difficultesP4", ".versus", "#messageP4", "#statsP4"].forEach(sel => {
    const el = zonePuissance4.querySelector(sel);
    if (el && el.offsetParent !== null) {
      autres += el.getBoundingClientRect().height + 8;
    }
  });
  const aide = zonePuissance4.querySelector(".jeu-aide");
  if (aide && aide.offsetParent !== null) {
    autres += aide.getBoundingClientRect().height + 8;
  }
  const hauteur = Math.max(220, window.innerHeight - autres - hManette - 40);
  const taille = Math.min(largeur / W_P4, hauteur / H_P4);
  canvasP4.style.width = Math.floor(W_P4 * taille) + "px";
  canvasP4.style.height = Math.floor(H_P4 * taille) + "px";
  const nouvelle = Math.min(3, Math.max(1, taille * (window.devicePixelRatio || 1)));
  if (Math.abs(nouvelle - echelleP4) > 0.02 || facade === null) {
    echelleP4 = nouvelle;
    canvasP4.width = Math.round(W_P4 * echelleP4);
    canvasP4.height = Math.round(H_P4 * echelleP4);
    cacheJetons = new Map();
    facade = null;
    decor = null;
  }
}

window.addEventListener("resize", ajusterP4);

const boucleP4 = creerBoucle(function (delta) {
  majChutes(delta);
  if (alignementGagnant !== null) {
    tempsVictoire += delta;
  }
  effetsP4.maj(delta);
  if (indiceAffiche !== null) {
    indiceAffiche.reste -= delta;
    if (indiceAffiche.reste <= 0) {
      indiceAffiche = null;
    }
  }
  dessinerScene(delta);
}, { plafond: 0.05 });

// L'en-tete et les boutons suivent l'etat de la partie
function majInterfaceP4() {
  zoneCoupsP4.textContent = String(coupsJouesP4);
  boutonAnnulerP4.disabled = iaReflechitP4 || historiqueP4.length === 0;
  boutonIndiceP4.disabled = !peutJouer() || indicesRestants <= 0;
  boutonIndiceP4.textContent = "Indice (" + indicesRestants + ")";
  marquerChoixActif(zoneDifficultesP4, difficulteP4.id);
  canvasP4.classList.toggle("reflexion", iaReflechitP4);
  // Le score du classement est celui qu'on obtiendrait en gagnant maintenant
  if (!difficulteP4.deux && !difficulteP4.ligne) {
    majScoreCourant("puissance4-" + difficulteP4.id, scoreDeVictoire());
  }
}

function majBoutonSonP4() {
  boutonSonP4.textContent = sonActif() ? "Son" : "Muet";
  boutonSonP4.setAttribute("aria-pressed", String(!sonActif()));
}

// ---------------------------------------------------------------------
// Commandes
// ---------------------------------------------------------------------

function colonneDuPointeur(evenement) {
  const x = abscisseLogique(canvasP4, evenement.clientX, W_P4);
  const colonne = Math.floor((x - MARGE_X) / CASE);
  return colonne >= 0 && colonne < COLONNES ? colonne : -1;
}

canvasP4.addEventListener("pointerdown", function (evenement) {
  if (!jeuAuPremierPlan("puissance4")) {
    return;
  }
  const colonne = colonneDuPointeur(evenement);
  if (colonne >= 0) {
    jouerColonneJoueur(colonne);
  }
});

canvasP4.addEventListener("pointermove", function (evenement) {
  if (!jeuAuPremierPlan("puissance4") || evenement.pointerType === "touch") {
    return;
  }
  const colonne = colonneDuPointeur(evenement);
  if (colonne >= 0) {
    colonneSurvolee = colonne;
  }
});

surTouche("puissance4", function (evenement) {
  const touche = evenement.key.toLowerCase();

  if (touche === "escape") {
    quitterJeu();
    return;
  }
  if (/^[1-7]$/.test(touche)) {
    jouerColonneJoueur(Number(touche) - 1);
  } else if (touche === "arrowleft" || touche === "q" || touche === "a") {
    colonneSurvolee = Math.max(0, (colonneSurvolee < 0 ? 3 : colonneSurvolee) - 1);
  } else if (touche === "arrowright" || touche === "d") {
    colonneSurvolee = Math.min(COLONNES - 1, (colonneSurvolee < 0 ? 3 : colonneSurvolee) + 1);
  } else if (touche === " " || touche === "enter" || touche === "arrowdown" || touche === "s") {
    if (colonneSurvolee >= 0) {
      jouerColonneJoueur(colonneSurvolee);
    }
  } else if (touche === "h") {
    demanderIndice();
  } else if (touche === "m") {
    basculerSon();
    majBoutonSonP4();
  } else if (touche === "backspace" || (touche === "z" && (evenement.ctrlKey || evenement.metaKey))) {
    annulerCoupP4();
  } else if (touche === "n") {
    nouvellePartieP4(difficulteP4);
  } else {
    return;
  }
  evenement.preventDefault();
});

// Boutons de difficulte, comme aux dames
creerBoutonsChoix(zoneDifficultesP4, CHOIX_P4, nouvellePartieP4);

boutonIndiceP4.addEventListener("click", demanderIndice);
boutonAnnulerP4.addEventListener("click", annulerCoupP4);
boutonNouvelleP4.addEventListener("click", () => nouvellePartieP4(difficulteP4));
boutonSonP4.addEventListener("click", function () {
  basculerSon();
  majBoutonSonP4();
});
boutonQuitterP4.addEventListener("click", quitterJeu);

// ===== Versus en ligne =====
// Chacun voit ses jetons en daruma (en bas de l'ecran, comme en solo) et
// ceux de l'adversaire en oni. Un coup = une colonne, sans conversion.

function poserSansAnimation(colonne, camp) {
  const rangee = premiereLibre(grilleP4, colonne);
  if (rangee < 0) {
    return;
  }
  grilleP4[indexP4(rangee, colonne)] = camp;
  coupsJouesP4++;
  derniereChute = { position: indexP4(rangee, colonne), hauteur: 0 };
}

const versusP4 = creerVersus({
  jeu: "puissance4",
  nom: "Puissance 4",
  section: zonePuissance4,
  surDebut(info) {
    grilleP4 = new Int8Array(CASES);
    coupsJouesP4 = 0;
    historiqueP4 = [];
    alignementGagnant = null;
    derniereChute = null;
    chutes = [];
    apresChutes = [];
    coupEnAttente = null;
    info.coups.forEach(k => poserSansAnimation(Number(k.c.col), k.moi ? JOUEUR : IA));
    // Le premier joueur joue les coups pairs
    tourAuJoueurP4 = (info.coups.length % 2 === 0) === info.jeCommence;
    p4Termine = false;
    versusP4.tour(tourAuJoueurP4);
    afficherMessageP4(tourAuJoueurP4 ? "À toi : tes daruma contre les oni de " + info.adversaire + "." : info.adversaire + " commence.", true);
    jouer("bonus");
    majInterfaceP4();
  },
  surCoup(coup) {
    const colonne = Number(coup.col);
    if (!Number.isInteger(colonne) || colonne < 0 || colonne >= COLONNES || premiereLibre(grilleP4, colonne) < 0) {
      return;
    }
    poserJeton(colonne, IA);
    tourAuJoueurP4 = true;
    versusP4.tour(true);
    if (!p4Termine) {
      afficherMessageP4("À toi.", true);
      jouer("clic");
    }
    majInterfaceP4();
  },
  surFin(fin) {
    p4Termine = true;
    if (fin.resultat === "victoire") {
      afficherMessageP4("Victoire : " + versusP4.adversaire + " quitte la partie.", true);
      jouer("vague");
    } else if (fin.resultat === "defaite") {
      afficherMessageP4("Partie perdue.", true);
    } else {
      afficherMessageP4("Partie nulle.", true);
    }
    majInterfaceP4();
  },
  passerEnLigne() {
    if (!difficulteP4.ligne) {
      nouvellePartieP4(DIFFICULTES_P4.find(d => d.ligne));
    }
  },
  surFermeture() {
    if (difficulteP4.ligne) {
      difficulteP4 = DIFFICULTES_P4[0];
      nouvellePartieP4(difficulteP4);
    }
  }
});

// ===== Inscription dans l'arcade =====
enregistrerJeu({
  id: "puissance4",
  nom: "Puissance 4",
  code: "4444",
  section: zonePuissance4,
  demarrer: demarrerP4,
  arreter: arreterP4,
  classement: () => "puissance4-" + (difficulteP4.ligne || difficulteP4.deux ? "facile" : difficulteP4.id),
  // La croix vise la colonne, A lache le daruma, B annule
  manette: {
    a: " ",
    b: "Backspace",
    start: "h",
    libelles: { a: "Poser", b: "Annuler", start: "Indice" },
    repetition: false
  }
});
