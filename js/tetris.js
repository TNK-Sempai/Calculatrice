// =====================================================================
//  TETRIS - regles de la version NES
//  Sac de 7, rotation SRS avec wall kicks, hold, file des 5 pieces,
//  piece fantome, lock delay, gravite et bareme NES.
//
//  Remise a niveau : rendu net a la resolution de l'ecran, tuiles en
//  volume, decors par palier, annonces T-spin / combo / back-to-back,
//  et une gravite qui continue d'accelerer apres le niveau 29.
//
//  Refonte V2 : les regles ne bougent pas. Ce qui change, c'est le
//  rendu (des tuiles laquees avec un vrai relief pixel, une couleur par
//  piece pour les lire d'un coup d'oeil), les effets qui donnent du
//  poids aux lignes et aux tetris, et un second mode : le Sprint 40
//  lignes, au chrono, avec son propre classement.
// =====================================================================

import { enregistrerJeu, finDePartie, quitterJeu, majScoreCourant, meilleursScores } from "./arcade.js";
import { ouvrirPanneaux } from "./panneaux-classement.js";
import { creerBoucle } from "./noyau/boucle.js";
import { surTouche, surRelachement } from "./noyau/clavier.js";
import { surGlissement } from "./noyau/tactile.js";
import { creerAfficheur } from "./noyau/message.js";
import { melanger } from "./noyau/outils.js";
import { creerEffets } from "./noyau/effets.js";
import { creerStockage } from "./noyau/stockage.js";
import { sonActif as sonGeneralActif, basculerSon } from "./noyau/son.js";

const zoneTetris = document.getElementById("jeuTetris");

// La section est reconstruite ici : la refonte ajoute le mode, le bouton
// du son et un cadre autour du plateau. Les classes .tetris-cote,
// .tetris-stats et .tetris-panneau restent : les panneaux de classement
// s'y glissent (voir panneaux-classement.js).
zoneTetris.innerHTML = `
  <div class="tetris-zone">
    <aside class="tetris-cote">
      <div class="tetris-panneau">
        <span class="tetris-label">Hold</span>
        <canvas id="canvasHold" width="120" height="120"></canvas>
      </div>
      <div class="tetris-stats">
        <span class="tetris-label" id="libelleScoreTetris">Score</span>
        <strong class="valeur-score" id="scoreTetris">0</strong>
        <span class="tetris-label" id="libelleLignesTetris">Lignes</span>
        <span class="tetris-duo">
          <strong id="lignesTetris">0</strong>
          <em class="tetris-taux" id="tauxTetris">-</em>
        </span>
        <span class="tetris-label">Niveau</span>
        <strong id="niveauTetris">0</strong>
        <span class="tetris-label">Perfect</span>
        <strong id="perfectTetris">0</strong>
      </div>
    </aside>
    <div class="tetris-cadre">
      <canvas id="canvasTetris" width="300" height="600"></canvas>
    </div>
    <aside class="tetris-cote">
      <div class="tetris-panneau">
        <span class="tetris-label">Next</span>
        <canvas id="canvasNext" width="120" height="420"></canvas>
      </div>
      <div class="tetris-message" id="messageTetris"></div>
      <div class="tetris-boutons">
        <button class="jeu-quitter" id="sonTetris" type="button" aria-pressed="false">Son</button>
        <button class="jeu-quitter" id="quitterTetris" type="button">Retour</button>
      </div>
    </aside>
  </div>
  <p class="jeu-aide">Fl&egrave;ches ou Q S D : bouger et descendre. Haut ou Z : tourner. X ou Ctrl : tourner dans l'autre sens. Shift ou C : hold. Espace : chute. P : pause. M : son. &Eacute;chap : quitter. &Agrave; l'&eacute;cran de d&eacute;part, Gauche et Droite changent de mode.</p>
`;
const boutonQuitterTetris = document.getElementById("quitterTetris");
const canvasTetris = document.getElementById("canvasTetris");
const zoneScoreTetris = document.getElementById("scoreTetris");
const zoneLignesTetris = document.getElementById("lignesTetris");
const canvasHold = document.getElementById("canvasHold");
const canvasNext = document.getElementById("canvasNext");
const zoneNiveauTetris = document.getElementById("niveauTetris");
const zonePerfectTetris = document.getElementById("perfectTetris");
const zoneTauxTetris = document.getElementById("tauxTetris");
const zoneMessageTetris = document.getElementById("messageTetris");
const zoneLibelleScore = document.getElementById("libelleScoreTetris");
const zoneLibelleLignes = document.getElementById("libelleLignesTetris");
const boutonSonTetris = document.getElementById("sonTetris");

const COLONNES = 10;
const LIGNES_VISIBLES = 20;
const LIGNES_CACHEES = 2;               // zone de spawn au-dessus du plateau
const LIGNES = LIGNES_VISIBLES + LIGNES_CACHEES;
const TAILLE_BLOC = 30;                 // en unites logiques (le puits fait 300 x 600)

const DELAI_VERROUILLAGE_MS = 500;
const MAX_RESETS_VERROUILLAGE = 15;
const DAS_MS = 170;                     // delai avant repetition gauche/droite
const ARR_MS = 50;                      // vitesse de repetition
const CHUTE_DOUCE_MS = 50;
const ANIMATION_LIGNES_MS = 350;        // duree de l'effacement anime des lignes

// Les deux modes : le marathon NES, et le sprint de 40 lignes au chrono
const MODES = ["marathon", "sprint"];
const LIGNES_SPRINT = 40;
const stockageMode = creerStockage("tanuki-arcade-tetris-mode");
let modeTetris = MODES.includes(stockageMode.lire()) ? stockageMode.lire() : "marathon";
let chronoSprint = 0;            // en millisecondes
let dernierEnvoiSprint = 0;
let suiteDifficile = 0;          // tetris et T-spin d'affilee, pour l'annonce B2B

function idClassementTetris() {
  return modeTetris === "sprint" ? "tetris-sprint" : "tetris";
}

// Un temps de sprint s'ecrit 1:23.45
function formaterChrono(ms) {
  const centiemes = Math.floor(ms / 10);
  const minutes = Math.floor(centiemes / 6000);
  const secondes = Math.floor(centiemes / 100) % 60;
  return minutes + ":" + String(secondes).padStart(2, "0") + "." + String(centiemes % 100).padStart(2, "0");
}

// Gravite NES : nombre d'images (a 60 fps) avant que la piece descende d'une ligne
const GRAVITE_IMAGES = [48, 43, 38, 33, 28, 23, 18, 13, 8, 6, 5, 5, 5, 4, 4, 4, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1];
const NIVEAU_DEPART_MAX = 9;

// Les 7 pieces, orientation de depart. Chacune a sa laque, dans les
// couleurs consacrees (I turquoise, O jaune, T violet...) : le biseau,
// le reflet et l'ombre en sont tires au moment de peindre la tuile.
const PIECES_TETRIS = {
  I: { forme: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]], couleur: "#3fb0c4" },
  O: { forme: [[1, 1], [1, 1]], couleur: "#e8c13a" },
  T: { forme: [[0, 1, 0], [1, 1, 1], [0, 0, 0]], couleur: "#9a5cc0" },
  S: { forme: [[0, 1, 1], [1, 1, 0], [0, 0, 0]], couleur: "#6fae45" },
  Z: { forme: [[1, 1, 0], [0, 1, 1], [0, 0, 0]], couleur: "#d8463a" },
  J: { forme: [[1, 0, 0], [1, 1, 1], [0, 0, 0]], couleur: "#3f6cc4" },
  L: { forme: [[0, 0, 1], [1, 1, 1], [0, 0, 0]], couleur: "#e8873a" }
};

const LAQUES = {
  I: { base: "#3fb0c4" },
  O: { base: "#e8c13a" },
  T: { base: "#9a5cc0" },
  S: { base: "#6fae45" },
  Z: { base: "#d8463a" },
  J: { base: "#3f6cc4" },
  L: { base: "#e8873a" }
};

// Tables de wall kicks SRS. Cle : "etatDepart>etatArrivee", etats 0 R 2 L.
// Les y sont donnes "vers le haut" comme dans la spec, on les inverse au moment de l'appliquer.
const KICKS_JLSTZ = {
  "0>R": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  "R>0": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  "R>2": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  "2>R": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  "2>L": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  "L>2": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  "L>0": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  "0>L": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]]
};
const KICKS_I = {
  "0>R": [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  "R>0": [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  "R>2": [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  "2>R": [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  "2>L": [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  "L>2": [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  "L>0": [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  "0>L": [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]]
};
const ETATS_ROTATION = ["0", "R", "2", "L"];

// ===== Etat du jeu =====
let plateau = [];
let pieceActive = null;
let sac = [];
let fileSuivante = [];
let pieceEnHold = null;
let holdUtilise = false;

let scoreTetris = 0;
let lignesTetris = 0;
let quadruplesTetris = 0;     // paquets de quatre lignes, pour le taux de Tetris
let perfectClearsTetris = 0;
let niveauTetris = 0;
let niveauDepart = 0;
let lignesAvantProchainNiveau = 10;
let tetrisEnAttente = true;   // ecran de choix du niveau
let tetrisTermine = false;
let tetrisEnPause = false;
const effetsTetris = creerEffets();

let chronoGravite = 0;
let chronoVerrouillage = null;
let resetsVerrouillage = 0;
let plusBasAtteint = 0;
let dernierMouvementRotation = false;
let dernierKickIndex = 0;


// Effacement anime des lignes : tant que la liste n'est pas vide, le jeu est
// suspendu. Les lignes restent en place sur le plateau, on ne fait que les
// dessiner autrement, puis on les retire vraiment a la fin de l'animation.
let lignesEnEffacement = [];
let chronoAnimationLignes = 0;
let tSpinEnAttente = null;    // T-spin repere au verrouillage, compte apres l'animation

function animationLignesEnCours() {
  return lignesEnEffacement.length > 0;
}

// Touches maintenues pour le DAS
const touchesTenues = { gauche: null, droite: null, bas: null };
let dernierePressionGauche = 0;
let dernierePressionDroite = 0;
let derniereChuteDouce = 0;

// ===== Lancement et arret =====
function demarrerTetris() {
  plateau = Array.from({ length: LIGNES }, () => Array(COLONNES).fill(null));
  sac = [];
  fileSuivante = [];
  pieceEnHold = null;
  holdUtilise = false;
  scoreTetris = 0;
  lignesTetris = 0;
  quadruplesTetris = 0;
  perfectClearsTetris = 0;
  niveauTetris = niveauDepart;
  // Regle NES : premier palier plus long quand on demarre haut
  lignesAvantProchainNiveau = Math.min(niveauDepart * 10 + 10, Math.max(100, niveauDepart * 10 - 50));
  tetrisEnAttente = true;
  tetrisTermine = false;
  tetrisEnPause = false;
  chronoSprint = 0;
  dernierEnvoiSprint = 0;
  suiteDifficile = 0;
  effetsTetris.vider();
  reinitialiserVisuels();
  majLibelles();
  lignesEnEffacement = [];
  chronoAnimationLignes = 0;
  tSpinEnAttente = null;
  touchesTenues.gauche = null;
  touchesTenues.droite = null;
  touchesTenues.bas = null;
  zoneMessageTetris.textContent = "";
  mettreAJourStats();
  remplirFile();
  faireApparaitrePiece();
  ajusterTetris();
  requestAnimationFrame(ajusterTetris);
  boucleTetris.lancer();
}

function mettreAJourStats() {
  if (modeTetris === "sprint") {
    zoneScoreTetris.textContent = formaterChrono(chronoSprint);
    zoneLignesTetris.textContent = Math.min(lignesTetris, LIGNES_SPRINT) + "/" + LIGNES_SPRINT;
  } else {
    zoneScoreTetris.textContent = scoreTetris.toLocaleString("fr-BE");
    zoneLignesTetris.textContent = String(lignesTetris);
    majScoreCourant("tetris", scoreTetris);
  }
  zoneNiveauTetris.textContent = String(niveauTetris);
  zonePerfectTetris.textContent = String(perfectClearsTetris);
  zoneTauxTetris.textContent = tauxDeTetris();
}

// En sprint, le grand chiffre est le chrono
function majLibelles() {
  zoneLibelleScore.textContent = modeTetris === "sprint" ? "Temps" : "Score";
  zoneLibelleLignes.textContent = modeTetris === "sprint" ? "Lignes / 40" : "Lignes";
}

function majBoutonSonTetris() {
  boutonSonTetris.textContent = sonGeneralActif() ? "Son" : "Muet";
  boutonSonTetris.setAttribute("aria-pressed", String(!sonGeneralActif()));
}

// Change de mode depuis l'ecran de depart, et rouvre les classements
// lateraux sur celui du nouveau mode
function changerMode(sens) {
  const index = (MODES.indexOf(modeTetris) + sens + MODES.length) % MODES.length;
  modeTetris = MODES[index];
  stockageMode.ecrire(modeTetris);
  majLibelles();
  chronoSprint = 0;
  mettreAJourStats();
  ouvrirPanneaux("tetris", idClassementTetris());
  if (modeTetris === "marathon") {
    majScoreCourant("tetris", 0);
  }
  jouerSon(520, 0.04);
}

function lancerDepuisAttente() {
  demarrerTetris();
  tetrisEnAttente = false;
  boucleTetris.remettreALHeure();
}

// Fin de partie, selon le mode
function conclurePartie(perdu) {
  tetrisTermine = true;
  notePartieFinie();
  noterRecordAvant();
  if (modeTetris === "sprint") {
    if (perdu) {
      finDePartie("tetris-sprint", null, "Tetris Sprint 40");
    } else {
      finDePartie("tetris-sprint", Math.round(chronoSprint), "Tetris Sprint 40");
    }
  } else {
    finDePartie("tetris", scoreTetris);
  }
}

// Part des lignes effacees par paquets de quatre, en pourcentage entier
function tauxDeTetris() {
  if (lignesTetris === 0) {
    return "-";
  }
  return Math.round(quadruplesTetris * 4 / lignesTetris * 100) + "%";
}

const afficherMessageTetris = creerAfficheur(zoneMessageTetris, { delai: 1500 });

// ===== Generateur de pieces : sac de 7 =====
function tirerDansLeSac() {
  if (sac.length === 0) {
    sac = melanger(Object.keys(PIECES_TETRIS));
  }
  return sac.pop();
}

function remplirFile() {
  while (fileSuivante.length < 5) {
    fileSuivante.push(tirerDansLeSac());
  }
}

function creerPiece(type) {
  const modele = PIECES_TETRIS[type];
  return {
    type,
    forme: modele.forme.map(l => l.slice()),
    couleur: modele.couleur,
    rotation: 0,
    x: Math.floor((COLONNES - modele.forme[0].length) / 2),
    y: type === "I" ? 0 : LIGNES_CACHEES - 2
  };
}

function faireApparaitrePiece() {
  const type = fileSuivante.shift();
  remplirFile();
  pieceActive = creerPiece(type);
  chronoGravite = 0;
  chronoVerrouillage = null;
  resetsVerrouillage = 0;
  plusBasAtteint = pieceActive.y;
  dernierMouvementRotation = false;
  holdUtilise = false;

  if (collision(pieceActive.forme, pieceActive.x, pieceActive.y)) {
    jouerSon(110, 0.4);
    effetsTetris.secouer(8, 0.5);
    conclurePartie(true);
  }
  dessinerFile();
}

// ===== Collisions et mouvements =====
function collision(forme, x, y) {
  for (let ligne = 0; ligne < forme.length; ligne++) {
    for (let colonne = 0; colonne < forme[ligne].length; colonne++) {
      if (!forme[ligne][colonne]) {
        continue;
      }
      const px = x + colonne;
      const py = y + ligne;
      if (px < 0 || px >= COLONNES || py >= LIGNES) {
        return true;
      }
      if (py >= 0 && plateau[py][px] !== null) {
        return true;
      }
    }
  }
  return false;
}

function estPosee() {
  return collision(pieceActive.forme, pieceActive.x, pieceActive.y + 1);
}

// Chaque mouvement reussi pendant le lock delay relance le compte a rebours (15 fois max)
function relancerVerrouillage() {
  if (chronoVerrouillage !== null && resetsVerrouillage < MAX_RESETS_VERROUILLAGE) {
    chronoVerrouillage = 0;
    resetsVerrouillage++;
  }
}

function deplacerPiece(deltaX) {
  if (tetrisTermine || tetrisEnPause || tetrisEnAttente || animationLignesEnCours()) {
    return false;
  }
  if (!collision(pieceActive.forme, pieceActive.x + deltaX, pieceActive.y)) {
    pieceActive.x += deltaX;
    dernierMouvementRotation = false;
    relancerVerrouillage();
    return true;
  }
  return false;
}

function tournerPiece(sensHoraire) {
  if (tetrisTermine || tetrisEnPause || tetrisEnAttente || animationLignesEnCours() || pieceActive.type === "O") {
    return;
  }
  const forme = pieceActive.forme;
  const tournee = sensHoraire
    ? forme[0].map((_, c) => forme.map(l => l[c]).reverse())
    : forme[0].map((_, c) => forme.map(l => l[forme[0].length - 1 - c]));

  const depart = ETATS_ROTATION[pieceActive.rotation];
  const nouvelleRotation = (pieceActive.rotation + (sensHoraire ? 1 : 3)) % 4;
  const arrivee = ETATS_ROTATION[nouvelleRotation];
  const table = pieceActive.type === "I" ? KICKS_I : KICKS_JLSTZ;
  const kicks = table[depart + ">" + arrivee];

  for (let i = 0; i < kicks.length; i++) {
    const [kx, ky] = kicks[i];
    const nx = pieceActive.x + kx;
    const ny = pieceActive.y - ky; // y inverse par rapport a la spec
    if (!collision(tournee, nx, ny)) {
      pieceActive.forme = tournee;
      pieceActive.x = nx;
      pieceActive.y = ny;
      pieceActive.rotation = nouvelleRotation;
      dernierMouvementRotation = true;
      dernierKickIndex = i;
      relancerVerrouillage();
      jouerSon(440, 0.03);
      return;
    }
  }
}

function descendreDUneLigne(estChuteDouce) {
  if (animationLignesEnCours()) {
    return false;
  }
  if (!estPosee()) {
    pieceActive.y++;
    dernierMouvementRotation = false;
    if (estChuteDouce) {
      scoreTetris += 1;
      mettreAJourStats();
    }
    if (pieceActive.y > plusBasAtteint) {
      plusBasAtteint = pieceActive.y;
      resetsVerrouillage = 0;
      chronoVerrouillage = null;
    }
    return true;
  }
  return false;
}

function chuteRapide() {
  if (tetrisTermine || tetrisEnPause || tetrisEnAttente || animationLignesEnCours()) {
    return;
  }
  let distance = 0;
  const yDepart = pieceActive.y;
  while (descendreDUneLigne(false)) {
    distance++;
  }
  scoreTetris += distance * 2;
  jouerSon(220, 0.05);
  if (distance > 2) {
    impactChute();
  }
  traceChute(yDepart);
  figerPiece();
}

function utiliserHold() {
  if (tetrisTermine || tetrisEnPause || tetrisEnAttente || animationLignesEnCours() || holdUtilise) {
    return;
  }
  const typeCourant = pieceActive.type;
  if (pieceEnHold === null) {
    pieceEnHold = typeCourant;
    faireApparaitrePiece();
  } else {
    const typeHold = pieceEnHold;
    pieceEnHold = typeCourant;
    pieceActive = creerPiece(typeHold);
    chronoGravite = 0;
    chronoVerrouillage = null;
    resetsVerrouillage = 0;
    plusBasAtteint = pieceActive.y;
    dernierMouvementRotation = false;
  }
  holdUtilise = true;
  jouerSon(330, 0.04);
  dessinerHold();
}

// ===== Verrouillage, T-spin et lignes =====
function detecterTSpin() {
  if (pieceActive.type !== "T" || !dernierMouvementRotation) {
    return null;
  }
  const x = pieceActive.x;
  const y = pieceActive.y;
  const estBloquee = (cx, cy) => cx < 0 || cx >= COLONNES || cy >= LIGNES || (cy >= 0 && plateau[cy][cx] !== null);

  const coins = {
    hautGauche: estBloquee(x, y),
    hautDroit: estBloquee(x + 2, y),
    basGauche: estBloquee(x, y + 2),
    basDroit: estBloquee(x + 2, y + 2)
  };
  const nombreCoins = Object.values(coins).filter(Boolean).length;
  if (nombreCoins < 3) {
    return null;
  }

  // Les deux coins "avant" dependent de l'orientation de la pointe du T
  const avant = [
    [coins.hautGauche, coins.hautDroit],
    [coins.hautDroit, coins.basDroit],
    [coins.basGauche, coins.basDroit],
    [coins.hautGauche, coins.basGauche]
  ][pieceActive.rotation];

  if ((avant[0] && avant[1]) || dernierKickIndex === 4) {
    return "complet";
  }
  return "mini";
}

function figerPiece() {
  const tSpin = detecterTSpin();
  marquerPose();

  let horsPlateau = true;
  pieceActive.forme.forEach((ligne, dy) => {
    ligne.forEach((case_, dx) => {
      if (case_) {
        const py = pieceActive.y + dy;
        if (py >= 0) {
          plateau[py][pieceActive.x + dx] = pieceActive.type;
        }
        if (py >= LIGNES_CACHEES) {
          horsPlateau = false;
        }
      }
    });
  });

  // Piece entierement figee dans la zone cachee : perdu
  if (horsPlateau) {
    jouerSon(110, 0.4);
    effetsTetris.secouer(8, 0.5);
    conclurePartie(true);
    return;
  }

  jouerSon(180, 0.04);

  // Des lignes sont completes : on les laisse en place et on lance l'animation.
  // Le vrai effacement et la piece suivante attendent la fin de celle-ci.
  const completes = repererLignesCompletes();
  if (completes.length > 0) {
    lignesEnEffacement = completes;
    chronoAnimationLignes = 0;
    tSpinEnAttente = tSpin;
    eclaterLignes(completes);
    return;
  }

  compterPoints(0, tSpin);
  faireApparaitrePiece();
}

// Indices des lignes pleines, du haut vers le bas
function repererLignesCompletes() {
  const completes = [];
  for (let ligne = 0; ligne < LIGNES; ligne++) {
    if (plateau[ligne].every(case_ => case_ !== null)) {
      completes.push(ligne);
    }
  }
  return completes;
}

// Fin de l'animation : on retire vraiment les lignes et le jeu repart
function terminerAnimationLignes() {
  const tSpin = tSpinEnAttente;
  lignesEnEffacement = [];
  chronoAnimationLignes = 0;
  tSpinEnAttente = null;

  const lignesEffacees = effacerLignesCompletes();
  compterPoints(lignesEffacees, tSpin);
  if (!tetrisTermine) {
    faireApparaitrePiece();
  }
}

function effacerLignesCompletes() {
  let effacees = 0;
  for (let ligne = LIGNES - 1; ligne >= 0; ligne--) {
    if (plateau[ligne].every(case_ => case_ !== null)) {
      plateau.splice(ligne, 1);
      plateau.unshift(Array(COLONNES).fill(null));
      effacees++;
      ligne++;
    }
  }
  return effacees;
}

function plateauVide() {
  return plateau.every(ligne => ligne.every(case_ => case_ === null));
}

function compterPoints(lignesEffacees, tSpin) {
  // Bareme NES : 40 / 100 / 300 / 1200 multiplies par (niveau + 1)
  const bareme = [0, 40, 100, 300, 1200];
  scoreTetris += bareme[lignesEffacees] * (niveauTetris + 1);
  lignesTetris += lignesEffacees;

  if (lignesEffacees === 4) {
    quadruplesTetris++;
  }

  // Perfect Clear : l'effacement ne laisse plus une seule case occupee
  const perfectClear = lignesEffacees > 0 && plateauVide();
  if (perfectClear) {
    const baremePerfect = [0, 800, 1200, 1800, 2000];
    scoreTetris += baremePerfect[lignesEffacees] * (niveauTetris + 1);
    perfectClearsTetris++;
  }

  if (lignesEffacees > 0) {
    lignesAvantProchainNiveau -= lignesEffacees;
    if (lignesAvantProchainNiveau <= 0) {
      niveauTetris++;
      lignesAvantProchainNiveau += 10;
      afficherMessageTetris("Niveau " + niveauTetris);
      annoncerNiveau(niveauTetris);
    }
    jouerSon(lignesEffacees === 4 ? 880 : 660, 0.12);
  }

  // Le Perfect Clear est plus rare qu'un passage de niveau, son message passe apres
  if (perfectClear) {
    afficherMessageTetris("Perfect Clear");
  }
  annoncerEffacement(lignesEffacees, tSpin, perfectClear);
  mettreAJourStats();

  // Sprint : les 40 lignes sont faites, le chrono s'arrete
  if (modeTetris === "sprint" && lignesTetris >= LIGNES_SPRINT && !tetrisTermine) {
    jouerSon(988, 0.2);
    annoncer(formaterChrono(chronoSprint), "#c8f060", 40, 4);
    conclurePartie(false);
  }
}

// ===== Boucle principale =====
// Au-dela du niveau 29 (une ligne par image), la gravite continue de
// monter sans plafond : chaque niveau ajoute une demi-ligne par image.
function graviteActuelle() {
  const dernier = GRAVITE_IMAGES.length - 1;
  if (niveauTetris <= dernier) {
    return GRAVITE_IMAGES[niveauTetris] * 1000 / 60;
  }
  return 1000 / 60 / (1 + (niveauTetris - dernier) * 0.5);
}

const boucleTetris = creerBoucle(function (delta, maintenant) {
  effetsTetris.maj(delta / 1000);
  majEffetsVisuels(Math.min(delta, 100) / 1000);
  // Le chrono du sprint tourne des que la premiere piece tombe, effacements compris
  if (modeTetris === "sprint" && !tetrisTermine && !tetrisEnPause && !tetrisEnAttente) {
    chronoSprint += delta;
    if (maintenant - dernierEnvoiSprint > 100) {
      dernierEnvoiSprint = maintenant;
      zoneScoreTetris.textContent = formaterChrono(chronoSprint);
    }
  }
  if (!tetrisTermine && !tetrisEnPause && !tetrisEnAttente && animationLignesEnCours()) {
    // Effacement en cours : gravite, verrouillage et commandes sont suspendus
    chronoAnimationLignes += delta;
    if (chronoAnimationLignes >= ANIMATION_LIGNES_MS) {
      terminerAnimationLignes();
    }
  } else if (!tetrisTermine && !tetrisEnPause && !tetrisEnAttente) {
    gererTouchesTenues(maintenant);

    if (estPosee()) {
      // Lock delay : la piece touche le sol, on laisse un court instant pour bouger
      if (chronoVerrouillage === null) {
        chronoVerrouillage = 0;
      }
      chronoVerrouillage += delta;
      if (chronoVerrouillage >= DELAI_VERROUILLAGE_MS || resetsVerrouillage >= MAX_RESETS_VERROUILLAGE) {
        figerPiece();
      }
    } else {
      chronoVerrouillage = null;
      chronoGravite += delta;
      while (chronoGravite >= graviteActuelle() && !estPosee()) {
        chronoGravite -= graviteActuelle();
        descendreDUneLigne(false);
      }
    }
  }

  dessinerTetris();
}, { enSecondes: false });

// DAS/ARR : deplacement continu quand une touche reste enfoncee
function gererTouchesTenues(maintenant) {
  const directions = [
    ["gauche", -1, () => dernierePressionGauche, v => { dernierePressionGauche = v; }],
    ["droite", 1, () => dernierePressionDroite, v => { dernierePressionDroite = v; }]
  ];
  for (const [nom, delta, lireDerniere, ecrireDerniere] of directions) {
    const depuis = touchesTenues[nom];
    if (depuis !== null && maintenant - depuis >= DAS_MS && maintenant - lireDerniere() >= ARR_MS) {
      deplacerPiece(delta);
      ecrireDerniere(maintenant);
    }
  }
  if (touchesTenues.bas !== null && maintenant - derniereChuteDouce >= CHUTE_DOUCE_MS) {
    descendreDUneLigne(true);
    derniereChuteDouce = maintenant;
  }
}

// ===== Dessin =====
//
// Tout se dessine dans un espace logique de 300 x 600 (le puits) et
// 120 x 120 / 120 x 420 (Hold, Next). Les canvas, eux, sont a la
// resolution reelle de l'ecran : ajusterTetris() calcule la taille du
// plateau, puis l'echelle (taille affichee x devicePixelRatio), et chaque
// dessin commence par un setTransform a cette echelle. Rien de ce qui
// suit ne touche aux regles : ce ne sont que des effets d'affichage.

const LARGEUR_PLATEAU = 300;
const HAUTEUR_PLATEAU = 600;
let echelleTetris = 1;
let echelleHold = 1;
let echelleNext = 1;

// --- Effets d'affichage (aucune incidence sur la partie) ---
let annoncesTetris = [];       // grands textes : TETRIS, T-SPIN, COMBO...
let eclatsTetris = [];         // copeaux de laque des lignes effacees
let posesTetris = [];          // eclair bref sur une piece qui se fige
let trainees = [];             // sillage d'une chute franche
let comboTetris = -1;          // effacements d'affilee, pour l'annonce
let instantFinTetris = null;   // pour le passage au gris de la pile
let recordAvantPartie = null;  // pour saluer un nouveau record
let themeAffiche = 0;
let themePrecedent = null;
let fonduTheme = 1;
const decors = new Map();

function reinitialiserVisuels() {
  annoncesTetris = [];
  eclatsTetris = [];
  posesTetris = [];
  trainees = [];
  comboTetris = -1;
  instantFinTetris = null;
  recordAvantPartie = null;
  themePrecedent = null;
  fonduTheme = 1;
  themeAffiche = themeCourant();
}

// Taille du plateau calculee d'apres la fenetre, la manette et l'aide
function ajusterTetris() {
  if (zoneTetris.hidden) {
    return;
  }
  const style = getComputedStyle(zoneTetris);
  const padL = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  const manette = document.querySelector(".manette:not([hidden])");
  const hManette = manette ? manette.getBoundingClientRect().height : 0;
  const aide = zoneTetris.querySelector(".jeu-aide");
  const hAide = aide && aide.offsetParent !== null ? aide.getBoundingClientRect().height + 12 : 0;
  const etroit = window.innerWidth <= 560;
  const ecart = etroit ? 8 : 14;
  const cadre = 16;
  // Le bas de la section reserve deja la place de la manette (padding)
  const bas = Math.max(parseFloat(style.paddingBottom), hManette + 8);
  const dispoH = window.innerHeight - parseFloat(style.paddingTop) - bas - hAide - cadre - 6;
  const dispoL = window.innerWidth - padL - 2 * ecart - cadre - 4;
  // Le puits fait h/2 de large ; chaque colonne h/5, resserree jusqu'a
  // 64 px sur telephone pour laisser grandir le puits
  let h = Math.min(dispoH, dispoL / 0.9, (dispoL - 128) * 2);
  if (dispoL / 0.9 < dispoH) {
    h = Math.min(dispoH, (dispoL - 128) * 2);
  }
  h = Math.max(220, Math.floor(h / 2) * 2);
  const cote = Math.max(58, Math.min(h / 5, (dispoL - h / 2) / 2));
  zoneTetris.style.setProperty("--largeur-cote", Math.floor(cote) + "px");
  zoneTetris.style.setProperty("--hauteur-plateau", h + "px");

  const dpr = window.devicePixelRatio || 1;
  const nouvelle = Math.min(3, Math.max(1, h / HAUTEUR_PLATEAU * dpr));
  if (Math.abs(nouvelle - echelleTetris) > 0.02 || canvasTetris.width !== Math.round(LARGEUR_PLATEAU * nouvelle)) {
    echelleTetris = nouvelle;
    canvasTetris.width = Math.round(LARGEUR_PLATEAU * echelleTetris);
    canvasTetris.height = Math.round(HAUTEUR_PLATEAU * echelleTetris);
    cacheTuiles.clear();
    decors.clear();
  }
  const largeurCote = canvasHold.getBoundingClientRect().width || 120;
  const echelleCote = Math.min(3, Math.max(1, largeurCote / 120 * dpr));
  if (Math.abs(echelleCote - echelleHold) > 0.02 || canvasHold.width !== Math.round(120 * echelleCote)) {
    echelleHold = echelleCote;
    echelleNext = echelleCote;
    canvasHold.width = Math.round(120 * echelleHold);
    canvasHold.height = Math.round(120 * echelleHold);
    canvasNext.width = Math.round(120 * echelleNext);
    canvasNext.height = Math.round(420 * echelleNext);
  }
  dessinerHold();
  dessinerFile();
}

window.addEventListener("resize", ajusterTetris);

// --- Couleurs ---
function melangerCouleur(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const canal = d => Math.round(((pa >> d) & 255) * (1 - t) + ((pb >> d) & 255) * t);
  return "#" + ((1 << 24) + (canal(16) << 16) + (canal(8) << 8) + canal(0)).toString(16).slice(1);
}

function laqueDe(type) {
  const base = type === "gris" ? "#6c6b78" : LAQUES[type].base;
  return {
    base,
    clair: melangerCouleur(base, "#ffffff", 0.38),
    tresClair: melangerCouleur(base, "#ffffff", 0.7),
    sombre: melangerCouleur(base, "#000000", 0.32),
    profond: melangerCouleur(base, "#000000", 0.55),
    contour: melangerCouleur(base, "#000000", 0.78)
  };
}

function cheminArrondi(c, x, y, l, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.lineTo(x + l - r, y);
  c.quadraticCurveTo(x + l, y, x + l, y + r);
  c.lineTo(x + l, y + h - r);
  c.quadraticCurveTo(x + l, y + h, x + l - r, y + h);
  c.lineTo(x + r, y + h);
  c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r);
  c.quadraticCurveTo(x, y, x + r, y);
  c.closePath();
}

// --- Tuiles en volume ---
// Chaque tuile est peinte une fois par piece et par taille reelle :
// un contour sombre, quatre biseaux (clair en haut, ombre en bas), une
// face legerement bombee et un reflet net en haut a gauche.
const cacheTuiles = new Map();

function tuile(type, taillePx) {
  const cle = type + "@" + taillePx;
  if (cacheTuiles.has(cle)) {
    return cacheTuiles.get(cle);
  }
  const l = laqueDe(type);
  const s = taillePx;
  const toile = document.createElement("canvas");
  toile.width = s;
  toile.height = s;
  const c = toile.getContext("2d");
  const o = Math.max(1, Math.round(s / 26));
  const b = Math.max(2, Math.round(s * 0.17));
  const r = Math.max(1, s * 0.14);

  cheminArrondi(c, 0, 0, s, s, r);
  c.fillStyle = l.contour;
  c.fill();
  c.save();
  cheminArrondi(c, o, o, s - 2 * o, s - 2 * o, Math.max(1, r - o));
  c.clip();
  const x0 = o, y0 = o, x1 = s - o, y1 = s - o;
  const face = (points, couleur) => {
    c.beginPath();
    c.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) {
      c.lineTo(points[i], points[i + 1]);
    }
    c.closePath();
    c.fillStyle = couleur;
    c.fill();
  };
  face([x0, y0, x1, y0, x1 - b, y0 + b, x0 + b, y0 + b], l.tresClair);
  face([x0, y0, x0 + b, y0 + b, x0 + b, y1 - b, x0, y1], l.clair);
  face([x1, y0, x1, y1, x1 - b, y1 - b, x1 - b, y0 + b], l.sombre);
  face([x0, y1, x0 + b, y1 - b, x1 - b, y1 - b, x1, y1], l.profond);
  // Face avant, un peu bombee
  const degrade = c.createLinearGradient(0, y0 + b, 0, y1 - b);
  degrade.addColorStop(0, melangerCouleur(l.base, "#ffffff", 0.12));
  degrade.addColorStop(1, melangerCouleur(l.base, "#000000", 0.1));
  c.fillStyle = degrade;
  c.fillRect(x0 + b, y0 + b, x1 - x0 - 2 * b, y1 - y0 - 2 * b);
  // Reflet net : une bande claire en diagonale sur le haut de la face
  c.globalAlpha = 0.28;
  face([x0 + b, y0 + b, x0 + b + (s - 2 * b) * 0.62, y0 + b, x0 + b, y0 + b + (s - 2 * b) * 0.48], "#ffffff");
  c.globalAlpha = 0.85;
  cheminArrondi(c, x0 + b + s * 0.06, y0 + b + s * 0.06, s * 0.16, s * 0.08, s * 0.04);
  c.fillStyle = "#ffffff";
  c.fill();
  c.restore();
  cacheTuiles.set(cle, toile);
  return toile;
}

function dessinerBloc(contexte, x, y, type, taille, echelle, alpha) {
  const px = x * taille;
  const py = y * taille;
  const reel = Math.max(4, Math.round(taille * echelle));
  if (alpha !== undefined) {
    contexte.globalAlpha = alpha;
  }
  contexte.drawImage(tuile(type, reel), px, py, taille, taille);
  if (alpha !== undefined) {
    contexte.globalAlpha = 1;
  }
}

// La piece fantome : un moule creux, bord clair et fond a peine teinte
function dessinerFantome(contexte, cases, type) {
  const l = laqueDe(type);
  const B = TAILLE_BLOC;
  cases.forEach(([x, y]) => {
    contexte.globalAlpha = 0.16;
    contexte.fillStyle = l.base;
    contexte.fillRect(x * B + 2, y * B + 2, B - 4, B - 4);
    contexte.globalAlpha = 0.85;
    contexte.strokeStyle = l.clair;
    contexte.lineWidth = 2;
    cheminArrondi(contexte, x * B + 3, y * B + 3, B - 6, B - 6, 4);
    contexte.stroke();
  });
  contexte.globalAlpha = 1;
}

function casesDePiece(piece, y) {
  const cases = [];
  piece.forme.forEach((ligne, dy) => {
    ligne.forEach((case_, dx) => {
      if (case_) {
        cases.push([piece.x + dx, y + dy - LIGNES_CACHEES]);
      }
    });
  });
  return cases;
}

function positionFantome() {
  let y = pieceActive.y;
  while (!collision(pieceActive.forme, pieceActive.x, y + 1)) {
    y++;
  }
  return y;
}

// La rangee occupee la plus haute, pour l'alerte de debordement
function sommetDeLaPile() {
  for (let y = 0; y < LIGNES; y++) {
    if (plateau[y] && plateau[y].some(case_ => case_ !== null)) {
      return y;
    }
  }
  return LIGNES;
}

// --- Decors : un paysage par palier de cinq niveaux ---
const THEMES = [
  { nom: "Temple de nuit", haut: "#151a36", bas: "#2b2452" },
  { nom: "Aube sur le Fuji", haut: "#2a1d3c", bas: "#8a4650" },
  { nom: "Bambouseraie", haut: "#0d2620", bas: "#1f4c3b" },
  { nom: "Mer de nuages", haut: "#16213e", bas: "#36598a" }
];

function themeCourant() {
  if (modeTetris === "sprint") {
    return Math.floor(lignesTetris / 10) % THEMES.length;
  }
  return Math.floor(niveauTetris / 5) % THEMES.length;
}

function peindreDecor(index) {
  const e = echelleTetris;
  const toile = document.createElement("canvas");
  toile.width = Math.round(LARGEUR_PLATEAU * e);
  toile.height = Math.round(HAUTEUR_PLATEAU * e);
  const c = toile.getContext("2d");
  c.setTransform(e, 0, 0, e, 0, 0);
  const W = LARGEUR_PLATEAU;
  const H = HAUTEUR_PLATEAU;
  const theme = THEMES[index];
  const ciel = c.createLinearGradient(0, 0, 0, H);
  ciel.addColorStop(0, theme.haut);
  ciel.addColorStop(1, theme.bas);
  c.fillStyle = ciel;
  c.fillRect(0, 0, W, H);

  const montagne = (points, couleur) => {
    c.beginPath();
    c.moveTo(0, H);
    points.forEach(([x, y]) => c.lineTo(x, y));
    c.lineTo(W, H);
    c.closePath();
    c.fillStyle = couleur;
    c.fill();
  };

  if (index === 0) {
    // Lune pleine, collines, pagode
    c.fillStyle = "#e9e2c8";
    c.beginPath();
    c.arc(212, 120, 38, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#d3caa9";
    [[200, 108, 7], [226, 132, 9], [214, 146, 4]].forEach(([x, y, r]) => {
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
    });
    montagne([[0, 380], [70, 330], [140, 372], [220, 316], [300, 360]], "#232650");
    montagne([[0, 450], [90, 410], [180, 448], [300, 400]], "#1a1c3c");
    c.fillStyle = "#10112a";
    const px = 70;
    for (let i = 0; i < 4; i++) {
      const y = 470 - i * 34;
      const l = 64 - i * 10;
      c.fillRect(px - l / 2 + 6, y, l - 12, 26);
      c.beginPath();
      c.moveTo(px - l / 2 - 8, y + 2);
      c.lineTo(px + l / 2 + 8, y + 2);
      c.lineTo(px + l / 2 - 6, y - 10);
      c.lineTo(px - l / 2 + 6, y - 10);
      c.closePath();
      c.fill();
    }
    c.fillRect(px - 2, 340, 4, 34);
    montagne([[0, 520], [300, 500]], "#0e0f24");
  } else if (index === 1) {
    // Soleil levant et Fuji
    c.fillStyle = "#e9a15a";
    c.beginPath();
    c.arc(150, 330, 56, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.moveTo(-20, H);
    c.lineTo(110, 300);
    c.quadraticCurveTo(150, 282, 190, 300);
    c.lineTo(320, H);
    c.closePath();
    c.fillStyle = "#3a2440";
    c.fill();
    c.beginPath();
    c.moveTo(110, 300);
    c.quadraticCurveTo(150, 282, 190, 300);
    c.lineTo(206, 322);
    c.lineTo(186, 316);
    c.lineTo(170, 330);
    c.lineTo(152, 316);
    c.lineTo(134, 332);
    c.lineTo(118, 316);
    c.lineTo(96, 322);
    c.closePath();
    c.fillStyle = "#d9cfe0";
    c.fill();
    montagne([[0, 470], [120, 440], [300, 480]], "#2a1a32");
  } else if (index === 2) {
    // Tiges de bambou en trois plans
    [["#163a2f", 0.9, 12], ["#1f5040", 1, 18], ["#2b6a50", 1.1, 24]].forEach(([couleur, pas, epaisseur], plan) => {
      c.fillStyle = couleur;
      for (let x = 14 + plan * 37; x < W; x += 92 * pas) {
        c.fillRect(x, 0, epaisseur, H);
        c.fillStyle = melangerCouleur(couleur, "#000000", 0.35);
        for (let y = 60 + plan * 40; y < H; y += 110) {
          c.fillRect(x - 1, y, epaisseur + 2, 3);
        }
        c.fillStyle = couleur;
      }
    });
    c.fillStyle = "#e3d9a8";
    c.beginPath();
    c.arc(240, 90, 24, 0, Math.PI * 2);
    c.fill();
  } else {
    // Soleil bas et nuages en rouleaux
    c.fillStyle = "#e8b04a";
    c.beginPath();
    c.arc(90, 230, 44, 0, Math.PI * 2);
    c.fill();
    const nuage = (x, y, l, couleur) => {
      c.fillStyle = couleur;
      c.beginPath();
      c.arc(x, y, l * 0.22, Math.PI, 0);
      c.arc(x + l * 0.3, y - l * 0.08, l * 0.28, Math.PI, 0);
      c.arc(x + l * 0.62, y, l * 0.2, Math.PI, 0);
      c.closePath();
      c.fill();
      c.fillRect(x - l * 0.22, y - 1, l * 1.04, l * 0.2);
    };
    nuage(170, 180, 120, "#4c6c98");
    nuage(-20, 300, 160, "#41608d");
    nuage(150, 380, 180, "#3a5683");
    nuage(10, 470, 200, "#2f4a74");
    nuage(140, 560, 220, "#273f66");
  }

  // Voile sombre pour que les pieces restent lisibles, puis la grille
  c.fillStyle = "rgba(6, 7, 14, 0.58)";
  c.fillRect(0, 0, W, H);
  c.fillStyle = "rgba(255, 255, 255, 0.05)";
  for (let i = 1; i < COLONNES; i++) {
    c.fillRect(i * TAILLE_BLOC, 0, 1, H);
  }
  for (let i = 1; i < LIGNES_VISIBLES; i++) {
    c.fillRect(0, i * TAILLE_BLOC, W, 1);
  }
  return toile;
}

function decor(index) {
  if (!decors.has(index)) {
    decors.set(index, peindreDecor(index));
  }
  return decors.get(index);
}

// --- Effets lies aux evenements du jeu ---

// Eclair bref sur la piece qui se fige
function marquerPose() {
  if (!pieceActive) {
    return;
  }
  posesTetris.push({ cases: casesDePiece(pieceActive, pieceActive.y), age: 0 });
}

// Sillage d'une chute franche, de la position de depart a l'arrivee
function traceChute(yDepart) {
  const piece = pieceActive;
  const colonnes = new Map();
  piece.forme.forEach((ligne, dy) => {
    ligne.forEach((case_, dx) => {
      if (case_) {
        const x = piece.x + dx;
        const haut = yDepart + dy - LIGNES_CACHEES;
        const bas = piece.y + dy - LIGNES_CACHEES;
        const actuel = colonnes.get(x);
        colonnes.set(x, actuel ? [Math.min(actuel[0], haut), Math.max(actuel[1], bas)] : [haut, bas]);
      }
    });
  });
  colonnes.forEach(([haut, bas], x) => {
    if (bas > haut) {
      trainees.push({ x, haut: Math.max(0, haut), bas, type: piece.type, age: 0 });
    }
  });
}

// Copeaux de laque au moment ou les lignes partent
function eclaterLignes(lignes) {
  const quadruple = lignes.length === 4;
  lignes.forEach(ligne => {
    const y = (ligne - LIGNES_CACHEES) * TAILLE_BLOC + TAILLE_BLOC / 2;
    if (y < 0) {
      return;
    }
    for (let x = 0; x < COLONNES; x++) {
      const type = plateau[ligne][x];
      if (type === null) {
        continue;
      }
      const l = laqueDe(type);
      const nombre = quadruple ? 5 : 3;
      for (let i = 0; i < nombre; i++) {
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
        const v = (quadruple ? 260 : 180) * (0.4 + Math.random() * 0.8);
        eclatsTetris.push({
          x: x * TAILLE_BLOC + TAILLE_BLOC / 2 + (Math.random() - 0.5) * 20,
          y: y + (Math.random() - 0.5) * 16,
          vx: Math.cos(angle) * v + (x - 4.5) * 14,
          vy: Math.sin(angle) * v,
          rot: Math.random() * Math.PI,
          vrot: (Math.random() - 0.5) * 12,
          taille: 4 + Math.random() * 5,
          couleur: [l.base, l.clair, l.tresClair][i % 3],
          vie: 0.6 + Math.random() * 0.4,
          age: 0
        });
      }
    }
  });
  if (quadruple) {
    effetsTetris.secouer(7, 0.35);
  }
}

function annoncer(texte, couleur, taille, rang) {
  annoncesTetris = annoncesTetris.filter(a => a.rang !== rang);
  annoncesTetris.push({ texte, couleur, taille, rang, age: 0, vie: 1.4 });
}

// Ce qui s'annonce sur le plateau apres chaque piece posee
function annoncerEffacement(lignesEffacees, tSpin, perfectClear) {
  const difficile = lignesEffacees === 4 || (tSpin !== null && lignesEffacees > 0);
  if (lignesEffacees > 0) {
    suiteDifficile = difficile ? suiteDifficile + 1 : 0;
    comboTetris++;
  } else {
    comboTetris = -1;
  }
  const noms = ["", "SIMPLE", "DOUBLE", "TRIPLE"];
  if (lignesEffacees === 4) {
    annoncer("TETRIS", "#c8f060", 54, 0);
  } else if (tSpin !== null && lignesEffacees > 0) {
    annoncer((tSpin === "mini" ? "T-SPIN MINI " : "T-SPIN ") + noms[lignesEffacees], "#c58ce0", 32, 0);
  } else if (tSpin === "complet") {
    annoncer("T-SPIN", "#c58ce0", 30, 0);
  } else if (lignesEffacees > 1) {
    annoncer(noms[lignesEffacees], "#ede8df", 30, 0);
  }
  if (difficile && suiteDifficile >= 2) {
    annoncer("BACK-TO-BACK" + (suiteDifficile > 2 ? " x" + (suiteDifficile - 1) : ""), "#e8c547", 22, 1);
  }
  if (comboTetris >= 1) {
    annoncer("COMBO " + comboTetris, "#7fd0e0", 24, 2);
  }
  if (perfectClear) {
    annoncer("PERFECT CLEAR", "#ffffff", 36, 3);
    effetsTetris.secouer(9, 0.5);
  }
}

function annoncerNiveau(niveau) {
  annoncer("NIVEAU " + niveau, "#ede8df", 26, 4);
}

// Une chute franche secoue a peine le puits et fait sauter quelques eclats
function impactChute() {
  const piece = pieceActive;
  const l = laqueDe(piece.type);
  piece.forme.forEach((ligne, dy) => {
    ligne.forEach((case_, dx) => {
      if (case_ && (dy === piece.forme.length - 1 || !piece.forme[dy + 1][dx])) {
        effetsTetris.eclater((piece.x + dx) * TAILLE_BLOC + TAILLE_BLOC / 2, (piece.y + dy + 1 - LIGNES_CACHEES) * TAILLE_BLOC,
          [l.clair, l.base], 2, 70);
      }
    });
  });
  effetsTetris.secouer(2, 0.12);
}

function notePartieFinie() {
  instantFinTetris = performance.now();
}

function majEffetsVisuels(dt) {
  annoncesTetris = annoncesTetris.filter(a => (a.age += dt) < a.vie);
  posesTetris = posesTetris.filter(p => (p.age += dt) < 0.16);
  trainees = trainees.filter(t => (t.age += dt) < 0.22);
  eclatsTetris = eclatsTetris.filter(e => {
    e.age += dt;
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    e.vy += 760 * dt;
    e.rot += e.vrot * dt;
    return e.age < e.vie;
  });
  const voulu = themeCourant();
  if (voulu !== themeAffiche) {
    themePrecedent = themeAffiche;
    themeAffiche = voulu;
    fonduTheme = 0;
  }
  if (fonduTheme < 1) {
    fonduTheme = Math.min(1, fonduTheme + dt / 0.8);
  }
}

// --- Le puits ---
function texteContoure(c, texte, x, y, taille, couleur, police) {
  c.font = police || ("800 extra-condensed " + taille + "px Anybody, Impact, sans-serif");
  c.lineJoin = "round";
  c.lineWidth = Math.max(3, taille * 0.2);
  c.strokeStyle = "#07070c";
  c.strokeText(texte, x, y);
  c.fillStyle = couleur;
  c.fillText(texte, x, y);
}

function dessinerTetris() {
  const c = canvasTetris.getContext("2d");
  const e = echelleTetris;
  const decalage = effetsTetris.decalage();
  const B = TAILLE_BLOC;
  const W = LARGEUR_PLATEAU;
  const H = HAUTEUR_PLATEAU;

  c.setTransform(1, 0, 0, 1, 0, 0);
  c.fillStyle = "#07070c";
  c.fillRect(0, 0, canvasTetris.width, canvasTetris.height);
  c.setTransform(e, 0, 0, e, decalage.x * e, decalage.y * e);

  // Decor, avec un fondu quand on change de palier
  if (themePrecedent !== null && fonduTheme < 1) {
    c.drawImage(decor(themePrecedent), 0, 0, W, H);
    c.globalAlpha = fonduTheme;
  }
  c.drawImage(decor(themeAffiche), 0, 0, W, H);
  c.globalAlpha = 1;

  const danger = !tetrisEnAttente && !tetrisTermine && plateau.length && sommetDeLaPile() < LIGNES_CACHEES + 4;

  // La pile : ombre portee, puis les tuiles
  const fin = tetrisTermine && instantFinTetris !== null && !(modeTetris === "sprint" && lignesTetris >= LIGNES_SPRINT);
  const ligneGrise = fin ? LIGNES - Math.floor((performance.now() - instantFinTetris) / 45) : LIGNES;
  if (plateau.length) {
    c.fillStyle = "rgba(0, 0, 0, 0.38)";
    for (let y = LIGNES_CACHEES; y < LIGNES; y++) {
      for (let x = 0; x < COLONNES; x++) {
        if (plateau[y][x] !== null) {
          c.fillRect(x * B + 3, (y - LIGNES_CACHEES) * B + 4, B, B);
        }
      }
    }
    for (let y = LIGNES_CACHEES; y < LIGNES; y++) {
      for (let x = 0; x < COLONNES; x++) {
        if (plateau[y][x] !== null) {
          dessinerBloc(c, x, y - LIGNES_CACHEES, y >= ligneGrise ? "gris" : plateau[y][x], B, e);
        }
      }
    }
  }

  // Sillages de chute franche
  trainees.forEach(t => {
    const l = laqueDe(t.type);
    const a = 1 - t.age / 0.22;
    const degrade = c.createLinearGradient(0, t.haut * B, 0, t.bas * B);
    degrade.addColorStop(0, "rgba(255,255,255,0)");
    degrade.addColorStop(1, l.clair);
    c.globalAlpha = 0.45 * a;
    c.fillStyle = degrade;
    c.fillRect(t.x * B + 5, t.haut * B, B - 10, (t.bas - t.haut) * B);
  });
  c.globalAlpha = 1;

  // Piece active et son fantome (pendant l'effacement, elle est deja figee)
  if (pieceActive && !tetrisTermine && !tetrisEnAttente && !animationLignesEnCours()) {
    const yFantome = positionFantome();
    if (yFantome !== pieceActive.y) {
      dessinerFantome(c, casesDePiece(pieceActive, yFantome).filter(([, y]) => y >= 0), pieceActive.type);
    }
    const cases = casesDePiece(pieceActive, pieceActive.y).filter(([, y]) => y >= 0);
    c.fillStyle = "rgba(0, 0, 0, 0.3)";
    cases.forEach(([x, y]) => c.fillRect(x * B + 3, y * B + 4, B, B));
    cases.forEach(([x, y]) => dessinerBloc(c, x, y, pieceActive.type, B, e));
    // Le delai de verrouillage se lit : la piece pose s'eclaircit peu a peu
    if (chronoVerrouillage !== null) {
      c.globalAlpha = Math.min(1, chronoVerrouillage / DELAI_VERROUILLAGE_MS) * 0.35;
      c.fillStyle = "#ffffff";
      cases.forEach(([x, y]) => {
        cheminArrondi(c, x * B + 1, y * B + 1, B - 2, B - 2, 4);
        c.fill();
      });
      c.globalAlpha = 1;
    }
  }

  // Eclair de pose
  posesTetris.forEach(p => {
    c.globalAlpha = (1 - p.age / 0.16) * 0.55;
    c.fillStyle = "#ffffff";
    p.cases.forEach(([x, y]) => {
      if (y >= 0) {
        cheminArrondi(c, x * B + 1, y * B + 1, B - 2, B - 2, 4);
        c.fill();
      }
    });
  });
  c.globalAlpha = 1;

  if (animationLignesEnCours()) {
    dessinerAnimationLignes(c);
  }

  // Copeaux de laque
  eclatsTetris.forEach(p => {
    c.save();
    c.globalAlpha = Math.min(1, (p.vie - p.age) * 4);
    c.translate(p.x, p.y);
    c.rotate(p.rot);
    c.fillStyle = p.couleur;
    c.fillRect(-p.taille / 2, -p.taille / 2, p.taille, p.taille * 0.7);
    c.restore();
  });
  c.globalAlpha = 1;

  effetsTetris.dessiner(c, "Anybody, Impact, sans-serif");

  // Annonces : un petit rebond a l'entree, puis elles montent et s'effacent
  c.textAlign = "center";
  c.textBaseline = "middle";
  annoncesTetris.forEach(a => {
    const entree = Math.min(1, a.age / 0.16);
    const rebond = entree < 1 ? 0.6 + 0.5 * entree : 1 + 0.08 * Math.max(0, 1 - (a.age - 0.16) / 0.12);
    const alpha = a.age > a.vie - 0.35 ? (a.vie - a.age) / 0.35 : 1;
    const y = [H * 0.36, H * 0.36 + 46, H * 0.36 + 80, H * 0.24, H * 0.6][a.rang] - a.age * 10;
    c.save();
    c.globalAlpha = Math.max(0, alpha);
    c.translate(W / 2, y);
    c.scale(rebond, rebond);
    let taille = a.taille;
    c.font = "800 extra-condensed " + taille + "px Anybody, Impact, sans-serif";
    while (c.measureText(a.texte).width > W - 24 && taille > 12) {
      taille -= 2;
      c.font = "800 extra-condensed " + taille + "px Anybody, Impact, sans-serif";
    }
    texteContoure(c, a.texte, 0, 0, taille, a.couleur);
    c.restore();
  });

  // Alerte : la pile approche du haut
  if (danger) {
    const allume = Math.floor(performance.now() / 300) % 2 === 0;
    c.fillStyle = allume ? "#d8463a" : "#8f2620";
    c.fillRect(0, 0, W, 4);
    c.globalAlpha = 0.16;
    c.fillRect(0, 4, W, B * 3);
    c.globalAlpha = 1;
  }

  c.setTransform(e, 0, 0, e, 0, 0);
  if (tetrisEnAttente) {
    dessinerEcranDepart(c);
  } else if (tetrisEnPause && !tetrisTermine) {
    dessinerPause(c);
  } else if (tetrisTermine && (!fin || performance.now() - instantFinTetris > 1000)) {
    dessinerFin(c);
  }
}

const tactile = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;

function carte(c, x, y, l, h) {
  c.fillStyle = "rgba(0, 0, 0, 0.4)";
  cheminArrondi(c, x + 3, y + 5, l, h, 14);
  c.fill();
  const fond = c.createLinearGradient(0, y, 0, y + h);
  fond.addColorStop(0, "#1d1e2c");
  fond.addColorStop(1, "#12131d");
  c.fillStyle = fond;
  cheminArrondi(c, x, y, l, h, 14);
  c.fill();
  c.strokeStyle = "#3a3b4f";
  c.lineWidth = 1.5;
  c.stroke();
  c.fillStyle = "rgba(255, 255, 255, 0.07)";
  c.fillRect(x + 14, y + 2, l - 28, 1.5);
}

function dessinerPause(c) {
  c.fillStyle = "rgba(6, 7, 14, 0.72)";
  c.fillRect(0, 0, LARGEUR_PLATEAU, HAUTEUR_PLATEAU);
  carte(c, 40, 230, 220, 130);
  c.textAlign = "center";
  c.textBaseline = "middle";
  texteContoure(c, "PAUSE", 150, 280, 52, "#c8f060");
  c.fillStyle = "#a9a49b";
  c.font = "11px 'Martian Mono', monospace";
  c.fillText(tactile ? "Touche pour reprendre" : "P pour reprendre", 150, 328);
}

function dessinerFin(c) {
  const W = LARGEUR_PLATEAU;
  const sprintReussi = modeTetris === "sprint" && lignesTetris >= LIGNES_SPRINT;
  c.fillStyle = "rgba(6, 7, 14, 0.66)";
  c.fillRect(0, 0, W, HAUTEUR_PLATEAU);
  carte(c, 22, 150, 256, 300);
  c.textAlign = "center";
  c.textBaseline = "middle";
  texteContoure(c, sprintReussi ? "40 LIGNES" : "GAME OVER", W / 2, 196, 46, sprintReussi ? "#c8f060" : "#e8604f");

  const lignes = [];
  if (modeTetris === "sprint") {
    lignes.push(["Temps", sprintReussi ? formaterChrono(chronoSprint) : "-"]);
    lignes.push(["Lignes", Math.min(lignesTetris, LIGNES_SPRINT) + " / " + LIGNES_SPRINT]);
  } else {
    lignes.push(["Score", scoreTetris.toLocaleString("fr-BE")]);
    lignes.push(["Lignes", String(lignesTetris)]);
    lignes.push(["Niveau", String(niveauTetris)]);
  }
  lignes.push(["Taux Tetris", tauxDeTetris()]);
  lignes.forEach(([libelle, valeur], i) => {
    const y = 250 + i * 34;
    c.textAlign = "left";
    c.fillStyle = "#8f8a82";
    c.font = "11px 'Martian Mono', monospace";
    c.fillText(libelle.toUpperCase(), 46, y);
    c.textAlign = "right";
    c.fillStyle = i === 0 ? "#c8f060" : "#ede8df";
    c.font = "700 extra-condensed 26px Anybody, Impact, sans-serif";
    c.fillText(valeur, W - 46, y);
  });
  c.textAlign = "center";
  const record = recordEnFin();
  if (record) {
    texteContoure(c, "NOUVEAU RECORD", W / 2, 392, 22, "#e8c547");
  }
  c.fillStyle = "#a9a49b";
  c.font = "11px 'Martian Mono', monospace";
  c.fillText(tactile ? "Touche le plateau pour rejouer" : "Espace pour rejouer", W / 2, 424);
}

// Un record est battu si la partie bat le meilleur score connu avant elle
function recordEnFin() {
  if (modeTetris === "sprint") {
    if (lignesTetris < LIGNES_SPRINT) {
      return false;
    }
    return recordAvantPartie === null || chronoSprint < recordAvantPartie;
  }
  return scoreTetris > 0 && (recordAvantPartie === null || scoreTetris > recordAvantPartie);
}

function noterRecordAvant() {
  const record = meilleursScores(idClassementTetris())[0];
  recordAvantPartie = record ? Number(record.score) : null;
}

// Petit triangle, pour les fleches de l'ecran de depart
function fleche(c, x, y, versLeHaut, couleur) {
  c.fillStyle = couleur;
  c.beginPath();
  if (versLeHaut) {
    c.moveTo(x - 11, y + 9);
    c.lineTo(x + 11, y + 9);
    c.lineTo(x, y - 3);
  } else {
    c.moveTo(x - 11, y);
    c.lineTo(x + 11, y);
    c.lineTo(x, y + 12);
  }
  c.closePath();
  c.fill();
}

// La petite pile posee au bas de l'ecran de depart, un puits a droite
const PILE_DEPART = [
  "J...T..OO.",
  "JJJTTTSOO.",
  "ZZLLLSSIJ.",
  "OZZLSSJJJ."
];

// Ecran de depart : titre, mode en onglets, niveau, record
function dessinerEcranDepart(c) {
  const W = LARGEUR_PLATEAU;
  const H = HAUTEUR_PLATEAU;
  const B = TAILLE_BLOC;
  c.fillStyle = "rgba(6, 7, 14, 0.35)";
  c.fillRect(0, 0, W, H);

  // La pile d'exemple, avec son puits a droite pour la barre I
  const debut = LIGNES_VISIBLES - PILE_DEPART.length;
  PILE_DEPART.forEach((ligne, i) => {
    [...ligne].forEach((type, x) => {
      if (type !== "." && LAQUES[type]) {
        c.fillStyle = "rgba(0, 0, 0, 0.38)";
        c.fillRect(x * B + 3, (debut + i) * B + 4, B, B);
        dessinerBloc(c, x, debut + i, type, B, echelleTetris);
      }
    });
  });
  carte(c, 20, 26, 260, 404);
  c.textAlign = "center";
  c.textBaseline = "middle";
  texteContoure(c, "TETRIS", W / 2, 76, 64, "#c8f060");
  c.fillStyle = "#8f8a82";
  c.font = "10px 'Martian Mono', monospace";
  c.fillText("Marathon NES ou sprint au chrono", W / 2, 116);

  // Onglets des modes
  [["marathon", "MARATHON"], ["sprint", "SPRINT 40"]].forEach(([mode, libelle], i) => {
    const x = W / 2 + (i === 0 ? -60 : 60);
    const actif = mode === modeTetris;
    cheminArrondi(c, x - 54, 136, 108, 34, 17);
    c.fillStyle = actif ? "#c8f060" : "#232434";
    c.fill();
    if (actif) {
      c.fillStyle = "rgba(255, 255, 255, 0.35)";
      c.fillRect(x - 40, 138, 80, 2);
    }
    c.fillStyle = actif ? "#0b0c12" : "#8f8a82";
    c.font = "800 extra-condensed 20px Anybody, Impact, sans-serif";
    c.fillText(libelle, x, 154);
  });
  c.fillStyle = "#6c685f";
  c.font = "10px 'Martian Mono', monospace";
  c.fillText(tactile ? "Glisse : mode et niveau" : "Gauche / Droite : mode", W / 2, 188);

  // Niveau de depart
  c.fillStyle = "#a9a49b";
  c.font = "11px 'Martian Mono', monospace";
  c.fillText("NIVEAU DE DÉPART", W / 2, 224);
  fleche(c, W / 2, 240, true, niveauDepart < NIVEAU_DEPART_MAX ? "#c8f060" : "#2a2b3a");
  texteContoure(c, String(niveauDepart), W / 2, 286, 70, "#ede8df");
  fleche(c, W / 2, 326, false, niveauDepart > 0 ? "#c8f060" : "#2a2b3a");

  c.fillStyle = "#a9a49b";
  c.font = "11px 'Martian Mono', monospace";
  c.fillText(modeTetris === "sprint" ? "40 lignes, le plus vite possible" : "Le plus de points avant de déborder",
    W / 2, 362);
  const record = meilleursScores(idClassementTetris())[0];
  c.fillStyle = record ? "#e8c547" : "#6c685f";
  c.fillText(record
    ? "Record : " + (modeTetris === "sprint" ? formaterChrono(record.score) : Number(record.score).toLocaleString("fr-BE"))
    : "Pas encore de record", W / 2, 382);

  const clignote = Math.floor(performance.now() / 600) % 2 === 0;
  texteContoure(c, tactile ? "TOUCHE POUR JOUER" : "ESPACE POUR JOUER", W / 2, 412, 22, clignote ? "#ede8df" : "#a9a49b");
}

// Effacement des lignes : un flash plein ivoire (qui clignote en lime
// pour un tetris), puis la bande se resserre sur son axe pendant que
// les copeaux partent.
function dessinerAnimationLignes(c) {
  const W = LARGEUR_PLATEAU;
  const B = TAILLE_BLOC;
  const avancement = Math.min(1, chronoAnimationLignes / ANIMATION_LIGNES_MS);
  const quadruple = lignesEnEffacement.length === 4;
  if (quadruple && avancement < 0.2) {
    c.fillStyle = "rgba(237, 232, 223, 0.18)";
    c.fillRect(0, 0, W, HAUTEUR_PLATEAU);
  }
  lignesEnEffacement.forEach(ligne => {
    const y = (ligne - LIGNES_CACHEES) * B;
    if (y + B <= 0) {
      return;
    }
    if (avancement < 0.35) {
      const alterne = quadruple && Math.floor(avancement * 24) % 2 === 1;
      c.fillStyle = alterne ? "#c8f060" : "#f4efe6";
      c.fillRect(0, y, W, B);
    } else {
      const t = (avancement - 0.35) / 0.65;
      const h = B * (1 - t) * (1 - t);
      // Le puits reapparait derriere la bande qui se referme
      c.drawImage(decor(themeAffiche), 0, y * echelleTetris, W * echelleTetris, B * echelleTetris, 0, y, W, B);
      c.globalAlpha = 1 - t * 0.5;
      c.fillStyle = quadruple ? "#c8f060" : "#f4efe6";
      c.fillRect(t * W * 0.15, y + (B - h) / 2, W - t * W * 0.3, h);
      c.globalAlpha = 1;
    }
  });
}

// --- Hold et Next : des plateaux laques avec leurs alveoles ---
function dessinerPieceMini(c, type, cx, cy, bloc, echelle, alpha) {
  const forme = PIECES_TETRIS[type].forme;
  let minX = 9, maxX = -1, minY = 9, maxY = -1;
  forme.forEach((ligne, dy) => ligne.forEach((v, dx) => {
    if (v) {
      minX = Math.min(minX, dx);
      maxX = Math.max(maxX, dx);
      minY = Math.min(minY, dy);
      maxY = Math.max(maxY, dy);
    }
  }));
  const ox = cx / bloc - (maxX - minX + 1) / 2 - minX;
  const oy = cy / bloc - (maxY - minY + 1) / 2 - minY;
  forme.forEach((ligne, dy) => ligne.forEach((v, dx) => {
    if (v) {
      c.globalAlpha = 0.35 * (alpha === undefined ? 1 : alpha);
      c.fillStyle = "#000000";
      c.fillRect((ox + dx) * bloc + 2, (oy + dy) * bloc + 3, bloc, bloc);
      c.globalAlpha = 1;
      dessinerBloc(c, ox + dx, oy + dy, type, bloc, echelle, alpha);
    }
  }));
}

function alveole(c, x, y, l, h, vive) {
  cheminArrondi(c, x, y, l, h, 9);
  c.fillStyle = vive ? "#0c0d15" : "#0e0f18";
  c.fill();
  c.fillStyle = "rgba(0, 0, 0, 0.45)";
  c.fillRect(x + 8, y + 1, l - 16, 2);
  c.fillStyle = "rgba(255, 255, 255, 0.06)";
  c.fillRect(x + 8, y + h - 2, l - 16, 1.5);
  if (vive) {
    c.strokeStyle = "#3a3b4f";
    c.lineWidth = 1;
    cheminArrondi(c, x + 0.5, y + 0.5, l - 1, h - 1, 9);
    c.stroke();
  }
}

function fondPanneau(c, l, h) {
  const fond = c.createLinearGradient(0, 0, 0, h);
  fond.addColorStop(0, "#1c1d2b");
  fond.addColorStop(1, "#13141e");
  c.fillStyle = fond;
  c.fillRect(0, 0, l, h);
}

function dessinerHold() {
  const c = canvasHold.getContext("2d");
  c.setTransform(echelleHold, 0, 0, echelleHold, 0, 0);
  fondPanneau(c, 120, 120);
  alveole(c, 8, 8, 104, 104, true);
  if (pieceEnHold !== null) {
    // Deja utilise pour cette piece : la piece passe en retrait
    dessinerPieceMini(c, pieceEnHold, 60, 60, 22, echelleHold,
      holdUtilise ? 0.35 : 1);
    if (holdUtilise) {
      c.fillStyle = "#8f8a82";
      c.fillRect(54, 92, 12, 9);
      c.strokeStyle = "#8f8a82";
      c.lineWidth = 2;
      c.beginPath();
      c.arc(60, 92, 4, Math.PI, 0);
      c.stroke();
    }
  }
}

function dessinerFile() {
  const c = canvasNext.getContext("2d");
  c.setTransform(echelleNext, 0, 0, echelleNext, 0, 0);
  fondPanneau(c, 120, 420);
  alveole(c, 8, 8, 104, 96, true);
  for (let i = 1; i < 5; i++) {
    alveole(c, 14, 112 + (i - 1) * 76, 92, 70, false);
  }
  fileSuivante.forEach((type, index) => {
    if (index === 0) {
      dessinerPieceMini(c, type, 60, 56, 22, echelleNext);
    } else if (index < 5) {
      dessinerPieceMini(c, type, 60, 112 + (index - 1) * 76 + 35, 15, echelleNext, 0.85);
    }
  });
}

// ===== Sons (Web Audio, petits bips) =====
let contexteAudio = null;

function jouerSon(frequence, duree) {
  if (!sonGeneralActif()) {
    return;
  }
  try {
    if (contexteAudio === null) {
      contexteAudio = new (window.AudioContext || window.webkitAudioContext)();
    }
    const oscillateur = contexteAudio.createOscillator();
    const gain = contexteAudio.createGain();
    oscillateur.type = "square";
    oscillateur.frequency.value = frequence;
    gain.gain.setValueAtTime(0.05, contexteAudio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, contexteAudio.currentTime + duree);
    oscillateur.connect(gain);
    gain.connect(contexteAudio.destination);
    oscillateur.start();
    oscillateur.stop(contexteAudio.currentTime + duree);
  } catch (erreur) {
    // pas de son disponible, on continue sans
  }
}

// ===== Clavier =====
surTouche("tetris", function (evenement) {
  if (evenement.repeat) {
    evenement.preventDefault();
    return; // la repetition est geree par le DAS
  }
  const touche = evenement.key.toLowerCase();
  const maintenant = performance.now();

  // Ecran de depart : choix du mode et du niveau
  if (tetrisEnAttente) {
    if (touche === "arrowup" || touche === "w") {
      niveauDepart = Math.min(NIVEAU_DEPART_MAX, niveauDepart + 1);
    } else if (touche === "arrowdown" || touche === "s") {
      niveauDepart = Math.max(0, niveauDepart - 1);
    } else if (touche === "arrowleft" || touche === "q" || touche === "a") {
      changerMode(-1);
    } else if (touche === "arrowright" || touche === "d") {
      changerMode(1);
    } else if (touche === " " || touche === "enter" || touche === "z" || touche === "x" || touche === "p") {
      lancerDepuisAttente();
    } else if (touche === "m") {
      basculerSon();
      majBoutonSonTetris();
    } else if (touche === "escape") {
      quitterJeu();
    }
    evenement.preventDefault();
    return;
  }

  // La manette envoie Haut pour la chute franche, comme sur les consoles
  // modernes ; au clavier, Haut reste la rotation.
  if (touche === "arrowup" && !evenement.isTrusted) {
    if (!tetrisTermine) {
      chuteRapide();
    }
    evenement.preventDefault();
    return;
  }

  if (touche === "arrowleft" || touche === "q" || touche === "a") {
    deplacerPiece(-1);
    touchesTenues.gauche = maintenant;
    dernierePressionGauche = maintenant;
  } else if (touche === "arrowright" || touche === "d") {
    deplacerPiece(1);
    touchesTenues.droite = maintenant;
    dernierePressionDroite = maintenant;
  } else if (touche === "arrowdown" || touche === "s") {
    if (!tetrisTermine && !tetrisEnPause && !animationLignesEnCours()) {
      descendreDUneLigne(true);
    }
    touchesTenues.bas = maintenant;
    derniereChuteDouce = maintenant;
  } else if (touche === "arrowup" || touche === "z" || touche === "w") {
    tournerPiece(true);
  } else if (touche === "x" || touche === "control") {
    tournerPiece(false);
  } else if (touche === "shift" || touche === "c") {
    utiliserHold();
  } else if (touche === " ") {
    if (tetrisTermine) {
      demarrerTetris();
    } else {
      chuteRapide();
    }
  } else if (touche === "p") {
    if (!tetrisTermine) {
      tetrisEnPause = !tetrisEnPause;
    }
  } else if (touche === "m") {
    basculerSon();
    majBoutonSonTetris();
    afficherMessageTetris(sonGeneralActif() ? "Son activé" : "Son coupé");
  } else if (touche === "escape") {
    quitterJeu();
    return;
  } else {
    return;
  }
  evenement.preventDefault();
});

surRelachement(function (evenement) {
  const touche = evenement.key.toLowerCase();
  if (touche === "arrowleft" || touche === "q" || touche === "a") {
    touchesTenues.gauche = null;
  } else if (touche === "arrowright" || touche === "d") {
    touchesTenues.droite = null;
  } else if (touche === "arrowdown" || touche === "s") {
    touchesTenues.bas = null;
  }
});

// ===== Tactile =====
// Glisser gauche/droite : bouger. Glisser bas : chute. Glisser haut : hold. Taper : tourner.
surGlissement(canvasTetris, function (geste) {
  const deltaX = geste.deltaX;
  const deltaY = geste.deltaY;

  if (tetrisEnAttente) {
    if (geste.tape) {
      lancerDepuisAttente();
    } else if (Math.abs(deltaY) > Math.abs(deltaX)) {
      niveauDepart = deltaY < 0 ? Math.min(NIVEAU_DEPART_MAX, niveauDepart + 1) : Math.max(0, niveauDepart - 1);
    } else {
      changerMode(deltaX > 0 ? 1 : -1);
    }
    return;
  }

  if (Math.abs(deltaX) < 20 && Math.abs(deltaY) < 20) {
    if (tetrisTermine) {
      demarrerTetris();
    } else if (tetrisEnPause) {
      tetrisEnPause = false;
    } else {
      tournerPiece(true);
    }
  } else if (Math.abs(deltaX) > Math.abs(deltaY)) {
    // Un long glissement deplace de plusieurs cases
    const cases = Math.max(1, Math.round(Math.abs(deltaX) / 40));
    for (let i = 0; i < cases; i++) {
      deplacerPiece(deltaX > 0 ? 1 : -1);
    }
  } else if (deltaY > 0) {
    chuteRapide();
  } else {
    utiliserHold();
  }
});

boutonQuitterTetris.addEventListener("click", quitterJeu);
boutonSonTetris.addEventListener("click", function () {
  basculerSon();
  majBoutonSonTetris();
});

// ===== Inscription dans l'arcade =====
// Le classement, le sens du tri et le format du score suivent le mode
// choisi : marathon aux points, sprint au chrono (le plus bas gagne).
enregistrerJeu({
  id: "tetris",
  nom: "Tetris",
  code: "321383773",
  section: zoneTetris,
  demarrer: demarrerTetris,
  arreter: () => boucleTetris.arreter(),
  classement: idClassementTetris,
  get plusBasEstMieux() {
    return modeTetris === "sprint";
  },
  formaterScore(score, id) {
    const sprint = id !== undefined ? id === "tetris-sprint" : modeTetris === "sprint";
    return sprint ? formaterChrono(Number(score)) : Number(score).toLocaleString("fr-BE");
  },
  manette: {
    a: "z",
    b: "c",
    start: "p",
    libelles: { a: "Tourner", b: "Hold" },
    repetition: false
  }
});
