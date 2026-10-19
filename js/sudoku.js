// =====================================================================
//  SUDOKU DU SANCTUAIRE
//  Une feuille de washi, des chiffres a l'encre. Les grilles sont
//  generees a la volee et toujours a solution unique : on part d'une
//  grille complete puis on retire des cases une par une, en verifiant a
//  chaque retrait qu'il n'existe toujours qu'une seule solution.
//
//  Ce qui change par rapport a la premiere version :
//  - chaque chiffre pose est compare a la solution : une erreur se voit
//    tout de suite, et trois erreurs perdent la grille (desactivable) ;
//  - trois indices par grille, chacun coute 20 secondes ;
//  - notes automatiques, nettoyage des notes devenues impossibles,
//    annulation ;
//  - le pave indique combien il reste de chaque chiffre ;
//  - une ligne, une colonne ou un bloc complete s'illumine en vague ;
//  - la grille du jour : la meme pour tout le monde, tiree de la date,
//    avec son propre classement.
//  Le score est le temps, donc plus il est bas, mieux c'est.
// =====================================================================

import { enregistrerJeu, finDePartie, quitterJeu, majScoreCourant } from "./arcade.js";
import { surTouche, jeuAuPremierPlan } from "./noyau/clavier.js";
import { creerAfficheur } from "./noyau/message.js";
import { creerStockage } from "./noyau/stockage.js";
import { creerChrono } from "./noyau/chrono.js";
import { formaterMinutesSecondes } from "./noyau/outils.js";
import { jouer, basculerSon, sonActif } from "./noyau/son.js";

const ID = "sudoku";
const CLE_SUDOKU = "tanuki-arcade-sudoku";
const CLE_REGLAGES = "tanuki-arcade-sudoku-reglages";
const CLE_JOUR_FAIT = "tanuki-arcade-sudoku-jour-fait";
const ERREURS_MAX = 3;
const INDICES_MAX = 3;
const PENALITE_INDICE = 20;

// Nombre de cases visibles au depart pour chaque difficulte
const DIFFICULTES = [
  { id: "facile", nom: "Facile", indices: 42 },
  { id: "moyen", nom: "Moyen", indices: 34 },
  { id: "difficile", nom: "Difficile", indices: 29 },
  { id: "extreme", nom: "Extrême", indices: 25 }
];
const JOUR = { id: "jour", nom: "Du jour", indices: 31 };

// ---------------------------------------------------------------------
// La section est reconstruite ici : la refonte a besoin de compteurs et
// de reglages que l'ancienne page n'avait pas.
// ---------------------------------------------------------------------

const zone = document.getElementById("jeuSudoku");
zone.innerHTML = `
  <div class="jeu-entete entete-sudoku">
    <span class="jeu-score score-principal">Temps <strong class="valeur-score" id="chronoSudoku">0:00</strong></span>
    <span class="jeu-score sudoku-erreurs">Erreurs <strong id="erreursSudoku">0/3</strong></span>
    <span class="jeu-score">Indices <strong id="indicesSudoku">3</strong></span>
    <span class="entete-boutons">
      <button class="jeu-quitter" id="sonSudoku" type="button" aria-pressed="false">Son</button>
      <button class="jeu-quitter" id="nouvelleSudoku" type="button">Nouvelle</button>
      <button class="jeu-quitter" id="quitterSudoku" type="button">Retour</button>
    </span>
  </div>
  <div class="scores-ligne sudoku-modes" id="difficultesSudoku" role="group" aria-label="Difficulté"></div>
  <div class="sudoku-carnet" id="carnetSudoku">
    <div class="sudoku-reliure" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
    <div class="sudoku-feuille">
      <div class="grille-sudoku" id="grilleSudoku" role="grid" aria-label="Grille de sudoku"></div>
    </div>
    <div class="fin-sudoku" id="finSudoku" hidden>
      <span class="sceau-sudoku" aria-hidden="true">数独</span>
      <strong id="finTitreSudoku"></strong>
      <span id="finTexteSudoku"></span>
      <span class="fin-boutons-sudoku">
        <button class="jeu-quitter" id="finVoirSudoku" type="button">Voir la grille</button>
        <button class="jeu-quitter" id="finNouvelleSudoku" type="button">Nouvelle grille</button>
      </span>
    </div>
  </div>
  <p class="jeu-message" id="messageSudoku"></p>
  <div class="sudoku-outils">
    <button class="jeu-quitter outil-sudoku" id="notesSudoku" type="button" aria-pressed="false">Crayon</button>
    <button class="jeu-quitter outil-sudoku" id="autoSudoku" type="button"><span class="long-sudoku">Notes </span>auto</button>
    <button class="jeu-quitter outil-sudoku" id="indiceSudoku" type="button">Indice</button>
    <button class="jeu-quitter outil-sudoku" id="annulerSudoku" type="button">Annuler</button>
    <button class="jeu-quitter outil-sudoku" id="limiteSudoku" type="button" aria-pressed="true">3 erreurs max</button>
  </div>
  <div class="pave-sudoku" id="paveSudoku"></div>
  <p class="jeu-aide">Touche une case puis un chiffre. Clavier : 1 à 9, flèches, 0 ou Retour pour effacer, N notes, H indice, U annuler. Échap pour quitter.</p>
`;

const grilleHtml = document.getElementById("grilleSudoku");
const pave = document.getElementById("paveSudoku");
const zoneModes = document.getElementById("difficultesSudoku");
const zoneChrono = document.getElementById("chronoSudoku");
const zoneErreurs = document.getElementById("erreursSudoku");
const zoneIndices = document.getElementById("indicesSudoku");
const zoneMessage = document.getElementById("messageSudoku");
const boutonSon = document.getElementById("sonSudoku");
const boutonNotes = document.getElementById("notesSudoku");
const boutonAuto = document.getElementById("autoSudoku");
const boutonIndice = document.getElementById("indiceSudoku");
const boutonAnnuler = document.getElementById("annulerSudoku");
const boutonLimite = document.getElementById("limiteSudoku");
const boutonNouvelle = document.getElementById("nouvelleSudoku");
const boutonQuitter = document.getElementById("quitterSudoku");
const fin = document.getElementById("finSudoku");
const finTitre = document.getElementById("finTitreSudoku");
const finTexte = document.getElementById("finTexteSudoku");
const finVoir = document.getElementById("finVoirSudoku");
const finNouvelle = document.getElementById("finNouvelleSudoku");

// ---------------------------------------------------------------------
// Etat
// ---------------------------------------------------------------------

let mode = DIFFICULTES[0];       // une difficulte, ou JOUR
let dateDuJour = "";
let grilleDepart = [];           // la grille proposee, 0 pour une case vide
let grilleJoueur = [];           // ce que le joueur a saisi
let solution = [];
let notes = [];                  // un ensemble de candidats par case
let historique = [];
let caseSelectionnee = null;
let modeNotes = false;
let secondes = 0;
let penalites = 0;
let erreurs = 0;
let indicesRestants = INDICES_MAX;
let termine = true;
let perdu = false;
let horsClassement = false;      // grille du jour deja reussie aujourd'hui
let cellules = [];
const stockageReglages = creerStockage(CLE_REGLAGES);
let limiteErreurs = (stockageReglages.lire() || {}).limite !== false;

// ---------------------------------------------------------------------
// Hasard : Math.random pour les grilles libres, une graine pour celle du jour
// ---------------------------------------------------------------------

// Mulberry32 : petit generateur a graine, suffisant pour un jeu
function creerAlea(graine) {
  let etatAlea = graine >>> 0;
  return function () {
    etatAlea = (etatAlea + 0x6D2B79F5) >>> 0;
    let t = etatAlea;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function graineDeTexte(texte) {
  let h = 2166136261;
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function aujourdhui() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

let alea = Math.random;

function melanger(liste) {
  const copie = liste.slice();
  for (let i = copie.length - 1; i > 0; i--) {
    const k = Math.floor(alea() * (i + 1));
    [copie[i], copie[k]] = [copie[k], copie[i]];
  }
  return copie;
}

// ---------------------------------------------------------------------
// Outils de grille
// ---------------------------------------------------------------------

function grilleVide() {
  return Array.from({ length: 9 }, () => Array(9).fill(0));
}

function copierGrille(grille) {
  return grille.map(ligne => ligne.slice());
}

function placementValide(grille, ligne, colonne, chiffre) {
  for (let i = 0; i < 9; i++) {
    if (grille[ligne][i] === chiffre || grille[i][colonne] === chiffre) {
      return false;
    }
  }
  const l0 = ligne - ligne % 3;
  const c0 = colonne - colonne % 3;
  for (let y = l0; y < l0 + 3; y++) {
    for (let x = c0; x < c0 + 3; x++) {
      if (grille[y][x] === chiffre) {
        return false;
      }
    }
  }
  return true;
}

// Les cases d'une ligne, d'une colonne et d'un bloc, sans doublon
function casesLiees(ligne, colonne) {
  const liste = [];
  for (let i = 0; i < 9; i++) {
    liste.push([ligne, i], [i, colonne]);
  }
  const l0 = ligne - ligne % 3;
  const c0 = colonne - colonne % 3;
  for (let y = l0; y < l0 + 3; y++) {
    for (let x = c0; x < c0 + 3; x++) {
      liste.push([y, x]);
    }
  }
  return liste;
}

// ---------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------

function remplirGrille(grille) {
  for (let ligne = 0; ligne < 9; ligne++) {
    for (let colonne = 0; colonne < 9; colonne++) {
      if (grille[ligne][colonne] !== 0) {
        continue;
      }
      for (const chiffre of melanger([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
        if (placementValide(grille, ligne, colonne, chiffre)) {
          grille[ligne][colonne] = chiffre;
          if (remplirGrille(grille)) {
            return true;
          }
          grille[ligne][colonne] = 0;
        }
      }
      return false;
    }
  }
  return true;
}

// Compte les solutions en s'arretant a la limite, en commencant par la
// case qui a le moins de candidats.
function compterSolutions(grille, limite) {
  let meilleure = null;
  for (let ligne = 0; ligne < 9 && (meilleure === null || meilleure.candidats.length > 1); ligne++) {
    for (let colonne = 0; colonne < 9; colonne++) {
      if (grille[ligne][colonne] !== 0) {
        continue;
      }
      const candidats = [];
      for (let chiffre = 1; chiffre <= 9; chiffre++) {
        if (placementValide(grille, ligne, colonne, chiffre)) {
          candidats.push(chiffre);
        }
      }
      if (candidats.length === 0) {
        return 0;
      }
      if (meilleure === null || candidats.length < meilleure.candidats.length) {
        meilleure = { ligne, colonne, candidats };
        if (candidats.length === 1) {
          break;
        }
      }
    }
  }
  if (meilleure === null) {
    return 1;
  }
  let total = 0;
  for (const chiffre of meilleure.candidats) {
    grille[meilleure.ligne][meilleure.colonne] = chiffre;
    total += compterSolutions(grille, limite - total);
    grille[meilleure.ligne][meilleure.colonne] = 0;
    if (total >= limite) {
      return total;
    }
  }
  return total;
}

function creuserGrille(complete, indicesVises) {
  const grille = copierGrille(complete);
  const positions = melanger(Array.from({ length: 81 }, (_, index) => index));
  let restantes = 81;
  for (const position of positions) {
    if (restantes <= indicesVises) {
      break;
    }
    const ligne = Math.floor(position / 9);
    const colonne = position % 9;
    const memoire = grille[ligne][colonne];
    grille[ligne][colonne] = 0;
    if (compterSolutions(copierGrille(grille), 2) === 1) {
      restantes--;
    } else {
      grille[ligne][colonne] = memoire;
    }
  }
  return grille;
}

function generer(difficulte, graine) {
  alea = graine === undefined ? Math.random : creerAlea(graine);
  const complete = grilleVide();
  remplirGrille(complete);
  const depart = creuserGrille(complete, difficulte.indices);
  alea = Math.random;
  return { solution: complete, depart };
}

// ---------------------------------------------------------------------
// Classement et sauvegarde
// ---------------------------------------------------------------------

function idClassement() {
  return mode === JOUR ? "sudoku-jour-" + dateDuJour : "sudoku-" + mode.id;
}

function nomClassement() {
  return mode === JOUR ? "Sudoku du jour" : "Sudoku " + mode.nom;
}

const stockage = creerStockage(CLE_SUDOKU);
const stockageJourFait = creerStockage(CLE_JOUR_FAIT);

function sauver() {
  if (termine) {
    return;
  }
  stockage.ecrire({
    mode: mode.id,
    date: dateDuJour,
    depart: grilleDepart,
    joueur: grilleJoueur,
    solution,
    notes: notes.map(ligne => ligne.map(candidats => Array.from(candidats))),
    secondes,
    penalites,
    erreurs,
    indices: indicesRestants
  });
}

function charger() {
  const donnees = stockage.lire();
  if (donnees === null || !Array.isArray(donnees.depart) || donnees.depart.length !== 9) {
    return false;
  }
  try {
    if (donnees.mode === "jour") {
      // Une grille du jour d'hier ne se reprend pas
      if (donnees.date !== aujourdhui()) {
        return false;
      }
      mode = JOUR;
      dateDuJour = donnees.date;
    } else {
      mode = DIFFICULTES.find(d => d.id === (donnees.mode || donnees.difficulte)) || DIFFICULTES[0];
    }
    grilleDepart = donnees.depart;
    grilleJoueur = donnees.joueur;
    solution = donnees.solution;
    notes = donnees.notes.map(ligne => ligne.map(candidats => new Set(candidats)));
    secondes = donnees.secondes || 0;
    penalites = donnees.penalites || 0;
    erreurs = donnees.erreurs || 0;
    indicesRestants = donnees.indices === undefined ? INDICES_MAX : donnees.indices;
    horsClassement = mode === JOUR && stockageJourFait.lire() === dateDuJour;
    return true;
  } catch (erreur) {
    return false;
  }
}

// ---------------------------------------------------------------------
// Partie
// ---------------------------------------------------------------------

function notesVides() {
  return Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => new Set()));
}

function nouvelleGrille(choix) {
  mode = choix;
  afficherMessage("Préparation de la feuille...", 0);
  // On laisse le message s'afficher avant le calcul, qui peut prendre un instant
  setTimeout(function () {
    let partie;
    if (mode === JOUR) {
      dateDuJour = aujourdhui();
      partie = generer(JOUR, graineDeTexte("tanuki-sudoku-" + dateDuJour));
      horsClassement = stockageJourFait.lire() === dateDuJour;
    } else {
      dateDuJour = "";
      partie = generer(mode);
      horsClassement = false;
    }
    solution = partie.solution;
    grilleDepart = partie.depart;
    grilleJoueur = copierGrille(partie.depart);
    notes = notesVides();
    historique = [];
    secondes = 0;
    penalites = 0;
    erreurs = 0;
    indicesRestants = INDICES_MAX;
    caseSelectionnee = null;
    termine = false;
    perdu = false;
    afficherMessage(horsClassement ? "Grille du jour déjà réussie : cette partie est hors classement." : "", horsClassement ? 4000 : undefined);
    construireGrille();
    affichagePrecedent = null;
    cacherFin();
    dessiner();
    chrono.lancer();
    requestAnimationFrame(ajusterSudoku);
    sauver();
    majScoreCourant(idClassement(), tempsTotal());
  }, 30);
}

function demarrer() {
  majBoutonSon();
  majBoutonLimite();
  historique = [];
  perdu = false;
  cacherFin();
  requestAnimationFrame(ajusterSudoku);
  if (charger()) {
    termine = false;
    affichagePrecedent = null;
    construireGrille();
    dessiner();
    chrono.lancer();
  } else {
    nouvelleGrille(mode === JOUR ? JOUR : mode);
  }
}

const chrono = creerChrono(function () {
  secondes++;
  majChrono();
  if (secondes % 10 === 0) {
    sauver();
  }
}, () => !termine && jeuAuPremierPlan(ID));

function tempsTotal() {
  return secondes + penalites;
}

const formaterTemps = formaterMinutesSecondes;

function grilleComplete() {
  for (let ligne = 0; ligne < 9; ligne++) {
    for (let colonne = 0; colonne < 9; colonne++) {
      if (grilleJoueur[ligne][colonne] !== solution[ligne][colonne]) {
        return false;
      }
    }
  }
  return true;
}

function memoriser() {
  historique.push({
    joueur: copierGrille(grilleJoueur),
    notes: notes.map(ligne => ligne.map(candidats => new Set(candidats)))
  });
  if (historique.length > 200) {
    historique.shift();
  }
}

function annuler() {
  if (termine || historique.length === 0) {
    return;
  }
  const etat = historique.pop();
  grilleJoueur = etat.joueur;
  notes = etat.notes;
  jouer("clic");
  dessiner();
  sauver();
}

function nettoyerNotes(ligne, colonne, chiffre) {
  casesLiees(ligne, colonne).forEach(([y, x]) => notes[y][x].delete(chiffre));
}

function saisirChiffre(chiffre) {
  if (termine || caseSelectionnee === null) {
    return;
  }
  const { ligne, colonne } = caseSelectionnee;
  if (grilleDepart[ligne][colonne] !== 0) {
    return;
  }
  // Une case deja juste ne se modifie plus : on evite les fausses manips
  if (grilleJoueur[ligne][colonne] !== 0 && grilleJoueur[ligne][colonne] === solution[ligne][colonne] && chiffre !== 0) {
    return;
  }

  if (modeNotes && chiffre !== 0) {
    if (grilleJoueur[ligne][colonne] !== 0) {
      return;
    }
    memoriser();
    const candidats = notes[ligne][colonne];
    if (candidats.has(chiffre)) {
      candidats.delete(chiffre);
    } else {
      candidats.add(chiffre);
    }
    jouer("clic");
  } else if (chiffre === 0) {
    if (grilleJoueur[ligne][colonne] === 0 && notes[ligne][colonne].size === 0) {
      return;
    }
    memoriser();
    grilleJoueur[ligne][colonne] = 0;
    notes[ligne][colonne].clear();
  } else {
    memoriser();
    grilleJoueur[ligne][colonne] = chiffre;
    notes[ligne][colonne].clear();
    if (chiffre !== solution[ligne][colonne]) {
      commettreErreur(ligne, colonne);
      return;
    }
    nettoyerNotes(ligne, colonne, chiffre);
    jouer("grain");
    const achevees = unitesAchevees(ligne, colonne);
    dessiner();
    sauver();
    if (grilleComplete()) {
      gagner();
      return;
    }
    if (achevees.length > 0) {
      animerUnites(achevees, ligne, colonne);
      jouer("bonus");
    }
    return;
  }
  dessiner();
  sauver();
}

function commettreErreur(ligne, colonne) {
  erreurs++;
  jouer("impact");
  dessiner();
  const cellule = cellules[ligne][colonne];
  cellule.classList.remove("secousse");
  void cellule.offsetWidth;
  cellule.classList.add("secousse");
  if (limiteErreurs && erreurs >= ERREURS_MAX) {
    perdre();
    return;
  }
  afficherMessage(limiteErreurs
    ? "Ce n'est pas le bon chiffre. " + (ERREURS_MAX - erreurs) + (ERREURS_MAX - erreurs > 1 ? " erreurs" : " erreur") + " avant de perdre la grille."
    : "Ce n'est pas le bon chiffre.");
  sauver();
}

// Les unites (ligne, colonne, bloc) que ce coup vient de completer
function unitesAchevees(ligne, colonne) {
  const juste = (y, x) => grilleJoueur[y][x] === solution[y][x];
  const unites = [];
  const ligneCases = Array.from({ length: 9 }, (_, i) => [ligne, i]);
  const colonneCases = Array.from({ length: 9 }, (_, i) => [i, colonne]);
  const l0 = ligne - ligne % 3;
  const c0 = colonne - colonne % 3;
  const blocCases = [];
  for (let y = l0; y < l0 + 3; y++) {
    for (let x = c0; x < c0 + 3; x++) {
      blocCases.push([y, x]);
    }
  }
  [ligneCases, colonneCases, blocCases].forEach(unite => {
    if (unite.every(([y, x]) => juste(y, x))) {
      unites.push(unite);
    }
  });
  return unites;
}

// L'onde part de la case jouee : on voit d'ou vient la completion
function animerUnites(unites, ligne, colonne) {
  const vues = new Set();
  unites.flat().forEach(([y, x]) => {
    const cle = y * 9 + x;
    if (vues.has(cle)) {
      return;
    }
    vues.add(cle);
    const cellule = cellules[y][x];
    const distance = Math.max(Math.abs(y - ligne), Math.abs(x - colonne));
    cellule.style.animationDelay = (distance * 45) + "ms";
    cellule.classList.remove("acheve");
    void cellule.offsetWidth;
    cellule.classList.add("acheve");
  });
}

function remplirNotesAuto() {
  if (termine) {
    return;
  }
  memoriser();
  for (let ligne = 0; ligne < 9; ligne++) {
    for (let colonne = 0; colonne < 9; colonne++) {
      if (grilleJoueur[ligne][colonne] !== 0) {
        continue;
      }
      // Les candidats se calculent sur les chiffres justes seulement
      const justes = grilleJoueur.map((rangee, y) => rangee.map((v, x) => (v === solution[y][x] ? v : 0)));
      const candidats = new Set();
      for (let chiffre = 1; chiffre <= 9; chiffre++) {
        if (placementValide(justes, ligne, colonne, chiffre)) {
          candidats.add(chiffre);
        }
      }
      notes[ligne][colonne] = candidats;
    }
  }
  jouer("clic");
  afficherMessage("Notes remplies avec tous les candidats possibles.");
  dessiner();
  sauver();
}

function donnerIndice() {
  if (termine) {
    return;
  }
  if (indicesRestants <= 0) {
    afficherMessage("Plus d'indice pour cette grille.");
    return;
  }
  // La case choisie si elle est vide ou fausse, sinon celle qui a le moins de candidats
  let cible = null;
  if (caseSelectionnee !== null) {
    const { ligne, colonne } = caseSelectionnee;
    if (grilleJoueur[ligne][colonne] !== solution[ligne][colonne]) {
      cible = { ligne, colonne };
    }
  }
  if (cible === null) {
    let moins = 10;
    for (let ligne = 0; ligne < 9; ligne++) {
      for (let colonne = 0; colonne < 9; colonne++) {
        if (grilleJoueur[ligne][colonne] === solution[ligne][colonne]) {
          continue;
        }
        let compte = 0;
        for (let chiffre = 1; chiffre <= 9; chiffre++) {
          if (placementValide(grilleJoueur, ligne, colonne, chiffre)) {
            compte++;
          }
        }
        if (compte < moins) {
          moins = compte;
          cible = { ligne, colonne };
        }
      }
    }
  }
  if (cible === null) {
    return;
  }
  indicesRestants--;
  penalites += PENALITE_INDICE;
  caseSelectionnee = cible;
  const ancienMode = modeNotes;
  modeNotes = false;
  // Une case fausse est d'abord videe, puis le bon chiffre est pose
  grilleJoueur[cible.ligne][cible.colonne] = 0;
  saisirChiffre(solution[cible.ligne][cible.colonne]);
  modeNotes = ancienMode;
  if (!termine) {
    afficherMessage("Indice posé, plus " + PENALITE_INDICE + " s.");
  }
  dessiner();
}

function gagner() {
  termine = true;
  chrono.arreter();
  stockage.effacer();
  jouer("vague");
  dessiner();
  // Toute la grille s'illumine, de haut en bas
  for (let ligne = 0; ligne < 9; ligne++) {
    for (let colonne = 0; colonne < 9; colonne++) {
      const cellule = cellules[ligne][colonne];
      cellule.style.animationDelay = ((ligne + colonne) * 30) + "ms";
      cellule.classList.remove("acheve");
      void cellule.offsetWidth;
      cellule.classList.add("acheve");
    }
  }
  afficherMessage("Résolu en " + formaterTemps(tempsTotal()) + (erreurs ? ", " + erreurs + (erreurs > 1 ? " erreurs" : " erreur") : ", sans erreur"), 0);
  const utilises = INDICES_MAX - indicesRestants;
  montrerFin(mode === JOUR ? "Grille du jour résolue" : "Grille résolue",
    formaterTemps(tempsTotal()) + " · " + (erreurs ? erreurs + (erreurs > 1 ? " erreurs" : " erreur") : "sans erreur")
    + " · " + (utilises ? utilises + (utilises > 1 ? " indices" : " indice") : "sans indice")
    + (horsClassement ? " · hors classement" : ""), 900);
  if (horsClassement) {
    afficherMessage("Résolu en " + formaterTemps(tempsTotal()) + ". Grille du jour déjà réussie : hors classement.", 0);
    return;
  }
  if (mode === JOUR) {
    stockageJourFait.ecrire(dateDuJour);
  }
  setTimeout(() => {
    if (!zone.hidden) {
      finDePartie(idClassement(), tempsTotal(), nomClassement());
    }
  }, 2800);
}

function perdre() {
  termine = true;
  perdu = true;
  chrono.arreter();
  stockage.effacer();
  jouer("mort");
  dessiner();
  afficherMessage("Trois erreurs : la grille est perdue. La solution est inscrite au crayon.", 0);
  montrerFin("Grille perdue", "Trois erreurs. La solution est inscrite au crayon.", 500);
}

const afficherMessage = creerAfficheur(zoneMessage, {
  delai: 2800,
  peutEffacer: () => !termine
});

// ---------------------------------------------------------------------
// Affichage
// ---------------------------------------------------------------------

// Les chiffres du joueur sont ecrits a la main : un trace au stylo pour
// les chiffres poses, au crayon pour les notes. Des chemins SVG, pour ne
// pas dependre d'une police manuscrite et rester nets a toute taille.
const TRACES = [
  "",
  "M6.5 7.6C8.6 6.4 10 5 11.3 3.2L11 24.8",
  "M4.6 8C5 4.6 8 3 10.8 3.2C14.5 3.5 16 6.5 15 9.5C13.8 13 8.2 18 4 24.5C8 23.8 12.2 24 16.6 24.2",
  "M5 6.2C7 3.6 10 2.8 12.5 3.4C15.5 4.2 15.8 8 13.5 10.5C12.2 11.8 10.2 12.6 8.4 12.8C12 12.6 15.8 14 16 18C16.2 22.5 12 25 8.5 24.8C6.5 24.6 5 23.8 4 22.5",
  "M12.8 3C10.2 9 7 14 3.8 18.6L17 18.2M13.2 9.4L13.6 25.2",
  "M15.2 3.6L6.6 3.8L5.6 12C7.6 10.8 10 10.4 12.2 11C15.2 11.8 16.4 15 16 18.5C15.4 22.6 12 25 8.6 24.8C6.6 24.6 5 23.8 4 22.6",
  "M14.2 3.4C9 5 5 10.5 4.6 17C4.4 21.5 7 24.8 10.4 24.8C13.8 24.8 16 22 15.8 18.6C15.6 15.2 13 13.2 10.2 13.4C7.6 13.6 5.6 15.4 4.8 17.4",
  "M4.2 4.4C8 3.6 12 3.8 16.2 3.4C12.4 9.8 9.8 16.6 8.6 25M7.2 14.4L13.8 14",
  "M10.4 13.2C7 12.2 5.2 10 5.6 7.4C6 4.6 8.2 3.2 10.6 3.2C13.2 3.2 15.2 4.8 15 7.4C14.8 10.2 12.6 12 10.4 13.2C7 14.6 4.6 16.8 4.8 20C5 23 7.6 24.9 10.4 24.8C13.4 24.7 16 22.8 15.8 19.6C15.6 16.4 13.2 14.6 10.4 13.2Z",
  "M15.4 9C15 5.4 12.8 3.4 10 3.4C7 3.4 5 5.8 5 8.8C5 11.8 7.2 13.8 10 13.8C12.8 13.8 15 11.8 15.4 9C15.8 15 14 21 10.8 25"
];

function chiffreManuscrit(chiffre) {
  return '<svg class="manuscrit" viewBox="0 0 20 28" aria-hidden="true"><path pathLength="1" d="' + TRACES[chiffre] + '"/></svg>';
}

let affichagePrecedent = null;

function ajusterSudoku() {
  if (zone.hidden) {
    return;
  }
  const marge = window.innerWidth >= 1100 ? 500 : 0;
  const etroit = window.innerWidth < 560;
  // Le carnet ajoute sa couverture et sa reliure autour de la grille
  const habillage = etroit ? 26 : 44;
  const largeur = Math.min(window.innerWidth * 0.96 - marge, 600) - habillage;
  let cote = Math.floor(Math.min(540, largeur));
  zone.style.setProperty("--cote-sudoku", cote + "px");
  // On mesure ce qui depasse sous la grille et on retire la difference
  const manette = document.querySelector(".manette:not([hidden])");
  const plafond = manette ? manette.getBoundingClientRect().top - 12 : window.innerHeight - 12;
  let bas = 0;
  for (const enfant of zone.children) {
    if (enfant.offsetParent !== null) {
      bas = Math.max(bas, enfant.getBoundingClientRect().bottom);
    }
  }
  if (bas > plafond) {
    cote = Math.max(etroit ? 170 : 260, cote - Math.ceil(bas - plafond));
    zone.style.setProperty("--cote-sudoku", cote + "px");
  }
}

window.addEventListener("resize", ajusterSudoku);

function montrerFin(titre, texte, delai) {
  finTitre.textContent = titre;
  finTexte.textContent = texte;
  fin.classList.toggle("perdu", perdu);
  setTimeout(function () {
    if (termine) {
      fin.hidden = false;
    }
  }, delai);
}

function cacherFin() {
  fin.hidden = true;
}

function construireGrille() {
  grilleHtml.innerHTML = "";
  cellules = [];
  for (let ligne = 0; ligne < 9; ligne++) {
    const rangee = [];
    for (let colonne = 0; colonne < 9; colonne++) {
      const cellule = document.createElement("div");
      cellule.className = "case-sudoku";
      cellule.setAttribute("role", "gridcell");
      cellule.dataset.ligne = String(ligne);
      cellule.dataset.colonne = String(colonne);
      // L'ecriture penche un peu differemment dans chaque case
      const h = (Math.imul(ligne + 1, 2654435761) ^ Math.imul(colonne + 3, 40503)) >>> 0;
      cellule.style.setProperty("--incl", ((h % 9) - 4) * 1.1 + "deg");
      cellule.style.setProperty("--decal", (((h >> 5) % 5) - 2) * 0.6 + "%");
      if (colonne % 3 === 2 && colonne !== 8) {
        cellule.classList.add("bord-droit");
      }
      if (ligne % 3 === 2 && ligne !== 8) {
        cellule.classList.add("bord-bas");
      }
      cellule.addEventListener("animationend", function () {
        cellule.classList.remove("acheve", "secousse");
        cellule.style.animationDelay = "";
      });
      grilleHtml.appendChild(cellule);
      rangee.push(cellule);
    }
    cellules.push(rangee);
  }
}

function memeBloc(a, b) {
  return Math.floor(a.ligne / 3) === Math.floor(b.ligne / 3)
    && Math.floor(a.colonne / 3) === Math.floor(b.colonne / 3);
}

function dessiner() {
  if (cellules.length === 0) {
    return;
  }
  const valeurActive = caseSelectionnee === null ? 0 : grilleJoueur[caseSelectionnee.ligne][caseSelectionnee.colonne];

  for (let ligne = 0; ligne < 9; ligne++) {
    for (let colonne = 0; colonne < 9; colonne++) {
      const cellule = cellules[ligne][colonne];
      const valeur = grilleJoueur[ligne][colonne];
      const imposee = grilleDepart[ligne][colonne] !== 0;
      cellule.removeAttribute("aria-label");
      ["imposee", "saisie", "selectionnee", "liee", "identique", "erreur", "notes", "solution-montree"].forEach(c => cellule.classList.remove(c));
      cellule.textContent = "";

      cellule.classList.remove("pose");
      if (valeur !== 0) {
        if (imposee) {
          cellule.textContent = String(valeur);
        } else {
          cellule.innerHTML = chiffreManuscrit(valeur);
          // Un chiffre qui vient d'etre ecrit s'encre en un trait
          if (affichagePrecedent && affichagePrecedent[ligne][colonne] !== valeur) {
            cellule.classList.add("pose");
          }
        }
        cellule.setAttribute("aria-label", String(valeur));
        cellule.classList.add(imposee ? "imposee" : "saisie");
        if (!imposee && valeur !== solution[ligne][colonne]) {
          cellule.classList.add("erreur");
        }
        if (valeur === valeurActive) {
          cellule.classList.add("identique");
        }
      } else if (perdu) {
        cellule.innerHTML = chiffreManuscrit(solution[ligne][colonne]);
        cellule.classList.add("solution-montree");
      } else if (notes[ligne][colonne].size > 0) {
        cellule.classList.add("notes");
        for (let chiffre = 1; chiffre <= 9; chiffre++) {
          const note = document.createElement("span");
          if (notes[ligne][colonne].has(chiffre)) {
            note.innerHTML = chiffreManuscrit(chiffre);
            if (chiffre === valeurActive) {
              note.className = "note-active";
            }
          }
          cellule.appendChild(note);
        }
      }

      if (caseSelectionnee !== null) {
        const position = { ligne, colonne };
        if (caseSelectionnee.ligne === ligne && caseSelectionnee.colonne === colonne) {
          cellule.classList.add("selectionnee");
        } else if (caseSelectionnee.ligne === ligne || caseSelectionnee.colonne === colonne || memeBloc(caseSelectionnee, position)) {
          cellule.classList.add("liee");
        }
      }
    }
  }

  affichagePrecedent = copierGrille(grilleJoueur);

  // Le pave indique combien il reste de chaque chiffre a poser
  const restants = Array(10).fill(9);
  grilleJoueur.flat().forEach((v, i) => {
    if (v !== 0 && v === solution[Math.floor(i / 9)][i % 9]) {
      restants[v]--;
    }
  });
  pave.querySelectorAll("[data-chiffre]").forEach(bouton => {
    const chiffre = Number(bouton.dataset.chiffre);
    if (chiffre === 0) {
      return;
    }
    bouton.querySelector(".reste").textContent = restants[chiffre] > 0 ? String(restants[chiffre]) : "";
    bouton.classList.toggle("epuise", restants[chiffre] === 0);
    bouton.classList.toggle("actif", chiffre === valeurActive && valeurActive !== 0);
  });

  zoneErreurs.textContent = limiteErreurs ? erreurs + "/" + ERREURS_MAX : String(erreurs);
  zoneErreurs.parentElement.classList.toggle("alerte", limiteErreurs && erreurs === ERREURS_MAX - 1);
  zoneIndices.textContent = String(indicesRestants);
  boutonIndice.disabled = indicesRestants === 0 || termine;
  boutonAnnuler.disabled = historique.length === 0 || termine;
  boutonNotes.classList.toggle("active", modeNotes);
  zone.classList.toggle("crayon", modeNotes);
  boutonNotes.setAttribute("aria-pressed", String(modeNotes));
  majChrono();
  for (const bouton of zoneModes.children) {
    bouton.classList.toggle("active", bouton.dataset.mode === mode.id);
  }
}

function majChrono() {
  zoneChrono.textContent = formaterTemps(tempsTotal());
  majScoreCourant(idClassement(), tempsTotal());
}

function majBoutonSon() {
  boutonSon.textContent = sonActif() ? "Son" : "Muet";
  boutonSon.setAttribute("aria-pressed", String(!sonActif()));
}

function majBoutonLimite() {
  boutonLimite.innerHTML = limiteErreurs ? '3 <span class="long-sudoku">erreurs </span>max' : 'Erreurs <span class="long-sudoku">illimitées</span><span class="court-sudoku">libres</span>';
  boutonLimite.setAttribute("aria-pressed", String(limiteErreurs));
  boutonLimite.classList.toggle("active", limiteErreurs);
}

// ---------------------------------------------------------------------
// Commandes
// ---------------------------------------------------------------------

grilleHtml.addEventListener("click", function (evenement) {
  if (!jeuAuPremierPlan(ID) || termine) {
    return;
  }
  const cellule = evenement.target.closest(".case-sudoku");
  if (!cellule) {
    return;
  }
  caseSelectionnee = { ligne: Number(cellule.dataset.ligne), colonne: Number(cellule.dataset.colonne) };
  dessiner();
});
grilleHtml.addEventListener("contextmenu", evenement => evenement.preventDefault());

function deplacerSelection(deltaLigne, deltaColonne) {
  if (caseSelectionnee === null) {
    caseSelectionnee = { ligne: 4, colonne: 4 };
  } else {
    caseSelectionnee = {
      ligne: (caseSelectionnee.ligne + deltaLigne + 9) % 9,
      colonne: (caseSelectionnee.colonne + deltaColonne + 9) % 9
    };
  }
  dessiner();
}

function basculerNotes() {
  modeNotes = !modeNotes;
  dessiner();
}

surTouche(ID, function (evenement) {
  const touche = evenement.key.toLowerCase();
  if (/^[1-9]$/.test(touche)) {
    saisirChiffre(Number(touche));
  } else if (touche === "0" || touche === "delete" || touche === "backspace") {
    saisirChiffre(0);
  } else if (touche === "arrowup" || touche === "z") {
    deplacerSelection(-1, 0);
  } else if (touche === "arrowdown" || touche === "s") {
    deplacerSelection(1, 0);
  } else if (touche === "arrowleft" || touche === "q") {
    deplacerSelection(0, -1);
  } else if (touche === "arrowright" || touche === "d") {
    deplacerSelection(0, 1);
  } else if (touche === "n") {
    basculerNotes();
  } else if (touche === "h") {
    donnerIndice();
  } else if (touche === "u" || (touche === "z" && (evenement.ctrlKey || evenement.metaKey))) {
    annuler();
  } else if (touche === "escape") {
    quitterJeu();
    return;
  } else {
    return;
  }
  evenement.preventDefault();
});

// Pave : neuf chiffres, chacun avec le nombre qu'il reste a poser
for (let chiffre = 1; chiffre <= 9; chiffre++) {
  const bouton = document.createElement("button");
  bouton.type = "button";
  bouton.className = "touche-sudoku";
  bouton.dataset.chiffre = String(chiffre);
  bouton.innerHTML = '<span class="chiffre">' + chiffre + '</span><span class="reste"></span>';
  bouton.setAttribute("aria-label", "Chiffre " + chiffre);
  bouton.addEventListener("click", () => saisirChiffre(chiffre));
  pave.appendChild(bouton);
}
const boutonEffacer = document.createElement("button");
boutonEffacer.type = "button";
boutonEffacer.className = "touche-sudoku effacer";
boutonEffacer.dataset.chiffre = "0";
boutonEffacer.setAttribute("aria-label", "Effacer la case");
boutonEffacer.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M9 5h11v14H9l-6-7z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M12 9.5l5 5m0-5l-5 5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
boutonEffacer.addEventListener("click", () => saisirChiffre(0));
pave.appendChild(boutonEffacer);

// Modes : quatre difficultes et la grille du jour
DIFFICULTES.concat([JOUR]).forEach(entree => {
  const bouton = document.createElement("button");
  bouton.type = "button";
  bouton.className = "jeu-quitter difficulte" + (entree === JOUR ? " mode-jour" : "");
  bouton.dataset.mode = entree.id;
  bouton.textContent = entree.nom;
  bouton.addEventListener("click", () => nouvelleGrille(entree));
  zoneModes.appendChild(bouton);
});

boutonNotes.addEventListener("click", basculerNotes);
boutonAuto.addEventListener("click", remplirNotesAuto);
boutonIndice.addEventListener("click", donnerIndice);
boutonAnnuler.addEventListener("click", annuler);
boutonLimite.addEventListener("click", function () {
  limiteErreurs = !limiteErreurs;
  stockageReglages.ecrire({ limite: limiteErreurs });
  majBoutonLimite();
  dessiner();
  if (limiteErreurs && !termine && erreurs >= ERREURS_MAX) {
    perdre();
  }
});
boutonSon.addEventListener("click", function () {
  basculerSon();
  majBoutonSon();
});
boutonNouvelle.addEventListener("click", () => nouvelleGrille(mode));
boutonQuitter.addEventListener("click", quitterJeu);
finVoir.addEventListener("click", cacherFin);
finNouvelle.addEventListener("click", () => nouvelleGrille(mode));

// ===== Inscription dans l'arcade =====
enregistrerJeu({
  id: ID,
  nom: "Sudoku",
  code: "123456789",
  section: zone,
  demarrer,
  arreter: () => chrono.arreter(),
  plusBasEstMieux: true,
  formaterScore: formaterTemps,
  classement: idClassement,
  manette: { a: "n", b: "u", start: "h", libelles: { a: "Notes", b: "Annuler" } }
});
