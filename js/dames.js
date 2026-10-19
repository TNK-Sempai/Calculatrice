// =====================================================================
//  DAMES INTERNATIONALES - damier de 10 sur 10, 20 pions par camp
//  Le pion prend en avant comme en arriere, la dame se deplace et prend
//  a distance sur toute sa diagonale. La prise est obligatoire et c'est
//  toujours la rafle la plus longue qui doit etre jouee.
//  Pendant une rafle, les pieces prises restent sur le damier jusqu'au
//  bout et ne peuvent pas etre sautees deux fois, et un pion qui ne fait
//  que traverser la rangee de promotion n'est pas promu.
//
//  Refonte V2 : un vrai plateau de bois, des pions facon pierres de go
//  (coquillage pour toi, ardoise pour l'adversaire), chaque coup anime
//  case par case avec les pieces prises qui partent dans la reserve, une
//  dame empilee et couronnee, l'historique en notation officielle, et une
//  aide qui trace les prises obligatoires.
// =====================================================================

import { enregistrerJeu, finDePartie, quitterJeu, jeuActif, majScoreCourant } from "./arcade.js";
import { surTouche, jeuAuPremierPlan } from "./noyau/clavier.js";
import { creerAfficheur } from "./noyau/message.js";
import { creerStockage } from "./noyau/stockage.js";
import { creerBoutonsChoix, marquerChoixActif } from "./noyau/choix.js";
import { creerBoucle } from "./noyau/boucle.js";
import { creerEffets } from "./noyau/effets.js";
import { abscisseLogique, ordonneeLogique } from "./noyau/pointeur.js";
import { jouer, basculerSon, sonActif } from "./noyau/son.js";
import { creerVersus, versusDisponible } from "./versus.js";

const zoneDames = document.getElementById("jeuDames");

// La section est reconstruite ici : le damier en cases HTML laisse la
// place a un plateau dessine, encadre de ses deux reserves, et a
// l'historique des coups.
zoneDames.innerHTML = `
  <div class="jeu-entete entete-dames">
    <span class="jeu-score score-principal">Toi <strong class="valeur-score" id="piecesJoueurDames">20</strong></span>
    <span class="jeu-score">Adversaire <strong id="piecesIaDames">20</strong></span>
    <span class="entete-boutons-dames">
      <button class="jeu-quitter" id="reglesDames" type="button">Règles</button>
      <button class="jeu-quitter" id="aideDames" type="button" aria-pressed="false">Montrer les prises</button>
      <button class="jeu-quitter" id="annulerDames" type="button">Annuler</button>
      <button class="jeu-quitter" id="nouvelleDames" type="button">Nouvelle partie</button>
      <button class="jeu-quitter" id="sonDames" type="button" aria-pressed="false">Son</button>
      <button class="jeu-quitter" id="quitterDames" type="button">Retour</button>
    </span>
  </div>
  <div class="scores-ligne" id="difficultesDames"></div>
  <div class="dames-zone">
    <div class="dames-plateau">
      <canvas class="dames-reserve" id="reserveHautDames" width="560" height="36" aria-label="Tes pieces prises par l'adversaire"></canvas>
      <canvas id="damierDames" width="560" height="560"></canvas>
      <canvas class="dames-reserve" id="reserveBasDames" width="560" height="36" aria-label="Les pieces que tu as prises"></canvas>
      <div class="fin-dames" id="finDames" hidden>
        <strong id="finTitreDames"></strong>
        <span id="finTexteDames"></span>
        <span class="fin-boutons-dames">
          <button class="jeu-quitter" id="finVoirDames" type="button">Voir le damier</button>
          <button class="jeu-quitter" id="finRejouerDames" type="button">Rejouer</button>
        </span>
      </div>
      <div class="regles-dames" id="panneauReglesDames" hidden>
        <span class="regles-etape" id="etapeReglesDames"></span>
        <strong id="titreReglesDames"></strong>
        <canvas id="toileReglesDames" width="216" height="216" aria-hidden="true"></canvas>
        <p id="texteReglesDames"></p>
        <span class="regles-boutons">
          <button class="jeu-quitter" id="precedentReglesDames" type="button">Précédent</button>
          <button class="jeu-quitter" id="suivantReglesDames" type="button">Suivant</button>
        </span>
        <button class="regles-fermer" id="fermerReglesDames" type="button" aria-label="Fermer les règles">×</button>
      </div>
    </div>
    <aside class="dames-historique">
      <span class="tetris-label">Historique</span>
      <ol class="dames-coups" id="historiqueDames"></ol>
    </aside>
  </div>
  <p class="jeu-message" id="messageDames"></p>
  <p class="jeu-aide">Clic sur une pi&egrave;ce puis sur une case allum&eacute;e. La prise est obligatoire, et toujours la plus longue : une rafle se clique &eacute;tape par &eacute;tape. &laquo; Montrer les prises &raquo; trace les rafles possibles. Retour arri&egrave;re ou Annuler pour reprendre ton coup. R : r&egrave;gles. N : nouvelle partie. M : son. &Eacute;chap : quitter.</p>
`;

const canvasDames = document.getElementById("damierDames");
const contexteDames = canvasDames.getContext("2d");
const canvasReserveHaut = document.getElementById("reserveHautDames");
const canvasReserveBas = document.getElementById("reserveBasDames");
const listeHistorique = document.getElementById("historiqueDames");
const zoneDifficultesDames = document.getElementById("difficultesDames");
const zonePiecesJoueur = document.getElementById("piecesJoueurDames");
const zonePiecesIa = document.getElementById("piecesIaDames");
const zoneMessageDames = document.getElementById("messageDames");
const boutonAideDames = document.getElementById("aideDames");
const boutonAnnulerDames = document.getElementById("annulerDames");
const boutonNouvelleDames = document.getElementById("nouvelleDames");
const boutonSonDames = document.getElementById("sonDames");
const boutonQuitterDames = document.getElementById("quitterDames");
const boutonReglesDames = document.getElementById("reglesDames");
const finDames = document.getElementById("finDames");
const finTitreDames = document.getElementById("finTitreDames");
const finTexteDames = document.getElementById("finTexteDames");
const regles = document.getElementById("panneauReglesDames");
const toileRegles = document.getElementById("toileReglesDames");
const titreRegles = document.getElementById("titreReglesDames");
const texteRegles = document.getElementById("texteReglesDames");
const etapeRegles = document.getElementById("etapeReglesDames");
const precedentRegles = document.getElementById("precedentReglesDames");
const suivantRegles = document.getElementById("suivantReglesDames");
const stockageRegles = creerStockage("tanuki-arcade-dames-regles");

const CLE_DAMES = "tanuki-arcade-dames";
const COTE = 10;
const CASES = COTE * COTE;

// Contenu d'une case
const VIDE = 0;
const PION_CLAIR = 1;
const DAME_CLAIRE = 2;
const PION_SOMBRE = 3;
const DAME_SOMBRE = 4;

// Les deux camps. Le joueur a les pieces claires et commence.
const CLAIR = "clair";
const SOMBRE = "sombre";

const DIAGONALES = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

// Nulle apres ce nombre de coups d'affilee qui ne sont que des
// deplacements de dame sans prise. La regle de la Federation mondiale
// compte 25 coups par camp, soit 50 en tout puisque le compteur avance
// a chaque demi-coup.
const COUPS_NULLE = 50;

// Budget de reflexion : au-dela, l'IA se contente de la profondeur atteinte
const BUDGET_IA_MS = 1000;
const DUREE_PAS_MS = 170;        // une case de deplacement anime
const DUREE_PAS_DAME_MS = 240;   // une glissade de dame, plus longue

const DIFFICULTES_DAMES = [
  { id: "facile", nom: "Facile", profondeur: 2, bonus: 0 },
  { id: "moyen", nom: "Moyen", profondeur: 4, bonus: 200 },
  { id: "difficile", nom: "Difficile", profondeur: 6, bonus: 500 },
  // A deux sur un ecran : le damier se retourne a chaque coup
  { id: "deux", nom: "À deux", profondeur: 4, bonus: 0, deux: true },
  { id: "ligne", nom: "En ligne", profondeur: 4, bonus: 0, ligne: true }
];
const CHOIX_DAMES = DIFFICULTES_DAMES.filter(d => !d.ligne || versusDisponible());
let joueurAuTrait = 1;      // a deux : 1 (clairs au depart) ou 2

// Bareme de l'evaluation
const VALEUR_PION = 100;
const VALEUR_DAME = 300;
const BONUS_AVANCE = 8;     // par rangee gagnee vers la promotion
const BONUS_CENTRE = 12;    // pour les quatre colonnes du milieu

let damier = new Int8Array(CASES);
let tourAuJoueur = true;
let difficulteDames = DIFFICULTES_DAMES[0];
let damesTermine = true;
let compteurNulle = 0;
let iaReflechit = false;
let historique = [];        // etats d'avant chaque coup du joueur, pour Annuler

let selection = null;       // case de depart choisie
let candidats = [];         // coups encore compatibles avec les etapes cliquees
let etapesChoisies = [];    // etapes deja validees d'une rafle en cours
let damierAffiche = null;   // damier temporaire pendant une rafle
let prisesEnCours = [];     // pieces sautees pendant la rafle en cours
let dernierCoup = null;     // cases de depart et d'arrivee du dernier coup joue
let notes = [];             // historique en notation officielle, un coup par entree
let animation = null;       // coup en train d'etre anime
let aideActive = false;     // tracer les prises obligatoires
let caseSurvolee = -1;
let chronoReflexion = null;

// ---------------------------------------------------------------------
// Outils de damier
// ---------------------------------------------------------------------

function index(ligne, colonne) {
  return ligne * COTE + colonne;
}

function ligneDe(position) {
  return Math.floor(position / COTE);
}

function colonneDe(position) {
  return position % COTE;
}

function dansLeDamier(ligne, colonne) {
  return ligne >= 0 && ligne < COTE && colonne >= 0 && colonne < COTE;
}

// Seules les cases sombres sont jouables
function caseJouable(ligne, colonne) {
  return (ligne + colonne) % 2 === 1;
}

function campDe(piece) {
  if (piece === VIDE) {
    return null;
  }
  return piece === PION_CLAIR || piece === DAME_CLAIRE ? CLAIR : SOMBRE;
}

function estDame(piece) {
  return piece === DAME_CLAIRE || piece === DAME_SOMBRE;
}

function campAdverse(camp) {
  return camp === CLAIR ? SOMBRE : CLAIR;
}

// Le clair monte vers la rangee 0, le sombre descend vers la rangee 9
function sensDuPion(camp) {
  return camp === CLAIR ? -1 : 1;
}

function rangeeDePromotion(camp) {
  return camp === CLAIR ? 0 : COTE - 1;
}

function dameDuCamp(camp) {
  return camp === CLAIR ? DAME_CLAIRE : DAME_SOMBRE;
}

function damierDeDepart() {
  const nouveau = new Int8Array(CASES);
  for (let ligne = 0; ligne < COTE; ligne++) {
    for (let colonne = 0; colonne < COTE; colonne++) {
      if (!caseJouable(ligne, colonne)) {
        continue;
      }
      if (ligne < 4) {
        nouveau[index(ligne, colonne)] = PION_SOMBRE;
      } else if (ligne > 5) {
        nouveau[index(ligne, colonne)] = PION_CLAIR;
      }
    }
  }
  return nouveau;
}

function compterPieces(plateau, camp) {
  let total = 0;
  for (let position = 0; position < CASES; position++) {
    if (campDe(plateau[position]) === camp) {
      total++;
    }
  }
  return total;
}

// ---------------------------------------------------------------------
// Generation des prises
// ---------------------------------------------------------------------

// Toutes les prises possibles depuis une case, en un seul saut.
// Les pieces deja sautees pendant la rafle restent sur le damier : elles
// bloquent le passage et ne peuvent pas etre reprises.
function prisesDepuis(plateau, position, piece, dejaPrises) {
  const ligne = ligneDe(position);
  const colonne = colonneDe(position);
  const camp = campDe(piece);
  const sauts = [];

  for (const [pasLigne, pasColonne] of DIAGONALES) {
    let l = ligne + pasLigne;
    let c = colonne + pasColonne;

    // La dame survole autant de cases vides qu'elle veut avant la victime
    if (estDame(piece)) {
      while (dansLeDamier(l, c) && plateau[index(l, c)] === VIDE) {
        l += pasLigne;
        c += pasColonne;
      }
    }
    if (!dansLeDamier(l, c)) {
      continue;
    }

    const victime = plateau[index(l, c)];
    if (victime === VIDE || campDe(victime) === camp || dejaPrises.includes(index(l, c))) {
      continue;
    }

    // Cases d'arrivee derriere la victime : une seule pour un pion,
    // toutes les cases vides de la diagonale pour une dame.
    let al = l + pasLigne;
    let ac = c + pasColonne;
    while (dansLeDamier(al, ac) && plateau[index(al, ac)] === VIDE) {
      sauts.push({ arrivee: index(al, ac), prise: index(l, c) });
      if (!estDame(piece)) {
        break;
      }
      al += pasLigne;
      ac += pasColonne;
    }
  }
  return sauts;
}

// Explore recursivement tous les enchainements de prises depuis une case.
// Le pion garde son rang pendant toute la rafle : traverser la rangee de
// promotion sans s'y arreter ne le transforme pas en dame.
function explorerRafles(plateau, position, piece, dejaPrises, chemin, sorties) {
  const sauts = prisesDepuis(plateau, position, piece, dejaPrises);

  if (sauts.length === 0) {
    if (chemin.length > 0) {
      sorties.push(chemin.slice());
    }
    return;
  }

  for (const saut of sauts) {
    plateau[position] = VIDE;
    plateau[saut.arrivee] = piece;
    dejaPrises.push(saut.prise);
    chemin.push({ arrivee: saut.arrivee, prise: saut.prise });

    explorerRafles(plateau, saut.arrivee, piece, dejaPrises, chemin, sorties);

    chemin.pop();
    dejaPrises.pop();
    plateau[saut.arrivee] = VIDE;
    plateau[position] = piece;
  }
}

// ---------------------------------------------------------------------
// Coups legaux
// ---------------------------------------------------------------------

// Un coup : la case de depart et la suite des etapes. Une etape simple
// a une prise a null, une etape de rafle porte la case sautee.
function coupsLegaux(plateau, camp) {
  const rafles = [];
  let record = 0;

  for (let position = 0; position < CASES; position++) {
    const piece = plateau[position];
    if (campDe(piece) !== camp) {
      continue;
    }
    const sorties = [];
    explorerRafles(plateau, position, piece, [], [], sorties);
    for (const chemin of sorties) {
      if (chemin.length > record) {
        record = chemin.length;
      }
      rafles.push({ depart: position, etapes: chemin });
    }
  }

  // Prise obligatoire, et parmi les prises la rafle la plus longue
  if (record > 0) {
    return rafles.filter(coup => coup.etapes.length === record);
  }

  const simples = [];
  for (let position = 0; position < CASES; position++) {
    const piece = plateau[position];
    if (campDe(piece) !== camp) {
      continue;
    }
    const ligne = ligneDe(position);
    const colonne = colonneDe(position);

    if (estDame(piece)) {
      for (const [pasLigne, pasColonne] of DIAGONALES) {
        let l = ligne + pasLigne;
        let c = colonne + pasColonne;
        while (dansLeDamier(l, c) && plateau[index(l, c)] === VIDE) {
          simples.push({ depart: position, etapes: [{ arrivee: index(l, c), prise: null }] });
          l += pasLigne;
          c += pasColonne;
        }
      }
    } else {
      const pasLigne = sensDuPion(camp);
      for (const pasColonne of [-1, 1]) {
        const l = ligne + pasLigne;
        const c = colonne + pasColonne;
        if (dansLeDamier(l, c) && plateau[index(l, c)] === VIDE) {
          simples.push({ depart: position, etapes: [{ arrivee: index(l, c), prise: null }] });
        }
      }
    }
  }
  return simples;
}

function nombreDePrises(coup) {
  return coup.etapes.filter(etape => etape.prise !== null).length;
}

// Joue un coup entier sur un damier. Les pieces prises ne disparaissent
// qu'a la fin de la sequence, la promotion ne joue que sur la case finale.
function appliquerCoup(plateau, coup) {
  const piece = plateau[coup.depart];
  const camp = campDe(piece);
  plateau[coup.depart] = VIDE;

  for (const etape of coup.etapes) {
    if (etape.prise !== null) {
      plateau[etape.prise] = VIDE;
    }
  }

  const finale = coup.etapes[coup.etapes.length - 1].arrivee;
  const promu = !estDame(piece) && ligneDe(finale) === rangeeDePromotion(camp);
  plateau[finale] = promu ? dameDuCamp(camp) : piece;
  return promu;
}

// Un coup de dame sans prise : c'est ce qui fait avancer le compteur de nulle
function coupDeDameSansPrise(plateau, coup) {
  return estDame(plateau[coup.depart]) && nombreDePrises(coup) === 0;
}

// ---------------------------------------------------------------------
// Adversaire ordinateur
// ---------------------------------------------------------------------

// Evaluation du point de vue du sombre, donc de l'IA
function evaluer(plateau) {
  let score = 0;
  for (let position = 0; position < CASES; position++) {
    const piece = plateau[position];
    if (piece === VIDE) {
      continue;
    }
    const camp = campDe(piece);
    let valeur = estDame(piece) ? VALEUR_DAME : VALEUR_PION;

    if (!estDame(piece)) {
      // Plus le pion approche de la promotion, plus il vaut cher
      const ligne = ligneDe(position);
      const avance = camp === SOMBRE ? ligne : COTE - 1 - ligne;
      valeur += avance * BONUS_AVANCE;
    }
    const colonne = colonneDe(position);
    if (colonne >= 3 && colonne <= 6) {
      valeur += BONUS_CENTRE;
    }
    score += camp === SOMBRE ? valeur : -valeur;
  }
  return score;
}

let limiteReflexion = 0;
let rechercheAbandonnee = false;

function minimax(plateau, camp, profondeur, alpha, beta) {
  if (performance.now() > limiteReflexion) {
    rechercheAbandonnee = true;
    return 0;
  }
  const coups = coupsLegaux(plateau, camp);
  if (coups.length === 0) {
    // Le camp au trait est bloque : il a perdu
    return camp === SOMBRE ? -100000 - profondeur : 100000 + profondeur;
  }
  if (profondeur === 0) {
    return evaluer(plateau);
  }

  if (camp === SOMBRE) {
    let meilleur = -Infinity;
    for (const coup of coups) {
      const suivant = plateau.slice();
      appliquerCoup(suivant, coup);
      const note = minimax(suivant, CLAIR, profondeur - 1, alpha, beta);
      if (note > meilleur) {
        meilleur = note;
      }
      if (meilleur > alpha) {
        alpha = meilleur;
      }
      if (alpha >= beta || rechercheAbandonnee) {
        break;
      }
    }
    return meilleur;
  }

  let meilleur = Infinity;
  for (const coup of coups) {
    const suivant = plateau.slice();
    appliquerCoup(suivant, coup);
    const note = minimax(suivant, SOMBRE, profondeur - 1, alpha, beta);
    if (note < meilleur) {
      meilleur = note;
    }
    if (meilleur < beta) {
      beta = meilleur;
    }
    if (alpha >= beta || rechercheAbandonnee) {
      break;
    }
  }
  return meilleur;
}

// Approfondissement progressif : on gagne une profondeur a la fois et on
// s'arrete des que le budget est depasse. La profondeur demandee se reduit
// donc toute seule sur les positions trop lourdes, sans figer la page.
function choisirCoupIa(plateau, profondeurVisee, budget) {
  const coups = coupsLegaux(plateau, SOMBRE);
  if (coups.length === 0) {
    return null;
  }
  const debut = performance.now();
  limiteReflexion = debut + budget;

  let meilleurCoup = coups[0];
  let profondeurAtteinte = 0;

  for (let profondeur = 1; profondeur <= profondeurVisee; profondeur++) {
    rechercheAbandonnee = false;
    let meilleureNote = -Infinity;
    let coupDeCeTour = null;
    let alpha = -Infinity;

    for (const coup of coups) {
      const suivant = plateau.slice();
      appliquerCoup(suivant, coup);
      const note = minimax(suivant, CLAIR, profondeur - 1, alpha, Infinity);
      if (rechercheAbandonnee) {
        break;
      }
      if (coupDeCeTour === null || note > meilleureNote) {
        meilleureNote = note;
        coupDeCeTour = coup;
      }
      if (note > alpha) {
        alpha = note;
      }
    }

    // Une profondeur interrompue ne compte pas, on garde la precedente
    if (rechercheAbandonnee || coupDeCeTour === null) {
      break;
    }
    meilleurCoup = coupDeCeTour;
    profondeurAtteinte = profondeur;
    if (performance.now() - debut > budget / 2) {
      break;
    }
  }

  return {
    coup: meilleurCoup,
    profondeur: profondeurAtteinte,
    duree: Math.round(performance.now() - debut)
  };
}

// ---------------------------------------------------------------------
// Sauvegarde
// ---------------------------------------------------------------------

const stockageDames = creerStockage(CLE_DAMES);
const stockageAide = creerStockage("tanuki-arcade-dames-aide");
aideActive = stockageAide.lire() === true;

function sauverDames() {
  if (damesTermine || difficulteDames.deux || difficulteDames.ligne) {
    return;
  }
  stockageDames.ecrire({
    difficulte: difficulteDames.id,
    damier: Array.from(damier),
    tourAuJoueur,
    compteurNulle,
    historique: historique.slice(-40),
    notes: notes.slice(-200),
    dernierCoup
  });
}

function effacerSauvegardeDames() {
  stockageDames.effacer();
}

function chargerDames() {
  const donnees = stockageDames.lire();
  if (donnees === null) {
    return false;
  }
  const difficulte = DIFFICULTES_DAMES.find(d => d.id === donnees.difficulte);
  if (!difficulte || difficulte.deux || difficulte.ligne || !Array.isArray(donnees.damier) || donnees.damier.length !== CASES) {
    return false;
  }
  difficulteDames = difficulte;
  damier = Int8Array.from(donnees.damier);
  tourAuJoueur = donnees.tourAuJoueur !== false;
  compteurNulle = donnees.compteurNulle || 0;
  historique = Array.isArray(donnees.historique) ? donnees.historique : [];
  notes = Array.isArray(donnees.notes) ? donnees.notes : [];
  dernierCoup = donnees.dernierCoup || null;
  return true;
}

// ---------------------------------------------------------------------
// Notation officielle : les 50 cases jouables sont numerotees de 1 a 50,
// ligne par ligne depuis le camp adverse. Un deplacement s'ecrit 32-28,
// une rafle 28x19x10.
// ---------------------------------------------------------------------

function numeroDe(position) {
  return ligneDe(position) * 5 + Math.floor(colonneDe(position) / 2) + 1;
}

function noterCoup(coup) {
  const prise = nombreDePrises(coup) > 0;
  const cases = [coup.depart].concat(coup.etapes.map(etape => etape.arrivee));
  return prise ? cases.map(numeroDe).join("x") : numeroDe(cases[0]) + "-" + numeroDe(cases[cases.length - 1]);
}

function afficherHistorique() {
  listeHistorique.innerHTML = "";
  for (let i = 0; i < notes.length; i += 2) {
    const ligne = document.createElement("li");
    const numero = document.createElement("span");
    numero.className = "coup-numero";
    numero.textContent = String(i / 2 + 1) + ".";
    const blanc = document.createElement("span");
    blanc.className = "coup-joueur";
    blanc.textContent = notes[i];
    ligne.append(numero, blanc);
    if (notes[i + 1] !== undefined) {
      const noir = document.createElement("span");
      noir.className = "coup-ia";
      noir.textContent = notes[i + 1];
      ligne.appendChild(noir);
    }
    listeHistorique.appendChild(ligne);
  }
  listeHistorique.scrollTop = listeHistorique.scrollHeight;
}

// ---------------------------------------------------------------------
// Partie
// ---------------------------------------------------------------------

function nouvellePartieDames(difficulte) {
  if (difficulteDames.ligne && versusDames.actif && difficulte.ligne) {
    return;
  }
  if (difficulteDames.ligne && !difficulte.ligne && versusDames.ouvert) {
    versusDames.fermer();
    if (versusDames.ouvert) {
      return;
    }
  }
  arreterMinuteries();
  difficulteDames = difficulte;
  joueurAuTrait = 1;
  damier = damierDeDepart();
  tourAuJoueur = true;
  compteurNulle = 0;
  damesTermine = false;
  iaReflechit = false;
  historique = [];
  notes = [];
  dernierCoup = null;
  animation = null;
  effetsDames.vider();
  disparitions = [];
  cacherFinDames();
  effacerSauvegardeDames();
  annulerSelection();
  afficherMessageDames(difficulte.deux ? "À deux : le damier se retourne après chaque coup. Joueur 1 commence." : "");
  if (difficulte.ligne) {
    damesTermine = true;
    afficherMessageDames("Versus en ligne : trouve un adversaire dans le panneau ci-dessus.", true);
    versusDames.ouvrir();
  }
  majLibellesDames();
  majInterfaceDames();
}

function demarrerDames() {
  arreterMinuteries();
  iaReflechit = false;
  animation = null;
  effetsDames.vider();
  annulerSelection();
  majBoutons();
  cacherFinDames();
  disparitions = [];
  reservesAffichees = "";
  ajusterDames();
  requestAnimationFrame(ajusterDames);
  boucleDames.lancer();
  if (!stockageRegles.lire()) {
    ouvrirRegles();
  }
  if (difficulteDames.ligne && versusDames.ouvert) {
    versusDames.reprendreSondage();
    majInterfaceDames();
    return;
  }
  if (difficulteDames.ligne || difficulteDames.deux) {
    nouvellePartieDames(difficulteDames.deux ? difficulteDames : DIFFICULTES_DAMES[0]);
    return;
  }
  if (chargerDames()) {
    damesTermine = false;
    afficherMessageDames("");
    majInterfaceDames();
    // La sauvegarde peut avoir ete prise juste avant le coup de l'IA
    if (!tourAuJoueur) {
      lancerReflexionIa();
    }
  } else {
    nouvellePartieDames(difficulteDames);
  }
}

function arreterMinuteries() {
  clearTimeout(chronoReflexion);
}

function arreterDames() {
  arreterMinuteries();
  versusDames.suspendre();
  boucleDames.arreter();
}

function annulerSelection() {
  selection = null;
  candidats = [];
  etapesChoisies = [];
  damierAffiche = null;
  prisesEnCours = [];
}

function etatCourant() {
  return {
    damier: Array.from(damier),
    tourAuJoueur,
    compteurNulle,
    nombreNotes: notes.length,
    dernierCoup,
    joueurAuTrait
  };
}

// ---------------------------------------------------------------------
// Fin de partie
// ---------------------------------------------------------------------

function terminerDames(texte, victoireDuJoueur) {
  damesTermine = true;
  iaReflechit = false;
  arreterMinuteries();
  annulerSelection();
  effacerSauvegardeDames();
  majInterfaceDames();
  afficherMessageDames(texte);
  const nulle = /^Partie nulle/.test(texte);
  const detail = texte.replace(/^(Gagné|Perdu|Partie nulle), /, "");
  const phrase = detail.charAt(0).toUpperCase() + detail.slice(1);

  if (difficulteDames.deux) {
    const gagnant = victoireDuJoueur ? joueurAuTrait : 3 - joueurAuTrait;
    if (nulle) {
      montrerFinDames("Partie nulle", phrase, "nulle");
    } else {
      jouer("vague");
      montrerFinDames("Joueur " + gagnant + " gagne", phrase.replace(/l'adversaire/g, "l'autre camp").replace(/^Tu n'as plus/, "Plus"), "gagne");
    }
    return;
  }
  if (difficulteDames.ligne) {
    const r = victoireDuJoueur ? "victoire" : nulle ? "nul" : "defaite";
    jouer(r === "victoire" ? "vague" : r === "defaite" ? "mort" : "clic");
    montrerFinDames(r === "victoire" ? "Victoire" : r === "nul" ? "Partie nulle" : "Défaite", phrase, r === "victoire" ? "gagne" : r === "nul" ? "nulle" : "perdu");
    versusDames.terminer(r, nulle ? "nulle" : "fin");
    return;
  }
  if (victoireDuJoueur) {
    jouer("vague");
    // Le classement n'enregistre que les victoires du joueur
    const restantes = compterPieces(damier, CLAIR);
    const score = restantes * 100 + difficulteDames.bonus;
    montrerFinDames("Victoire", phrase + " " + restantes + (restantes > 1 ? " pièces sauvées" : " pièce sauvée") + ", " + score + " points.", "gagne");
    setTimeout(function () {
      if (!zoneDames.hidden) {
        finDePartie("dames-" + difficulteDames.id, score, "Dames " + difficulteDames.nom);
      }
    }, 2600);
  } else if (nulle) {
    montrerFinDames("Partie nulle", phrase, "nulle");
  } else {
    jouer("mort");
    montrerFinDames("Défaite", phrase, "perdu");
  }
}

// Verifie la fin de partie pour le camp qui doit jouer maintenant
function verifierFinDames() {
  if (compterPieces(damier, SOMBRE) === 0) {
    terminerDames("Gagné, l'adversaire n'a plus de pièce.", true);
    return true;
  }
  if (compterPieces(damier, CLAIR) === 0) {
    terminerDames("Perdu, tu n'as plus de pièce.", false);
    return true;
  }
  if (compteurNulle >= COUPS_NULLE) {
    terminerDames("Partie nulle, " + COUPS_NULLE + " coups de dames sans prise.", false);
    return true;
  }
  const camp = tourAuJoueur ? CLAIR : SOMBRE;
  if (coupsLegaux(damier, camp).length === 0) {
    if (tourAuJoueur) {
      terminerDames("Perdu, plus aucun coup possible.", false);
    } else {
      terminerDames("Gagné, l'adversaire est bloqué.", true);
    }
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------
// Animation d'un coup : la piece avance case par case, les pieces prises
// disparaissent au moment ou elle les saute et partent dans la reserve.
// ---------------------------------------------------------------------

// plateauAvant : le damier tel qu'il est a l'ecran au depart de l'animation.
// dejaJouees : etapes deja montrees (rafle cliquee etape par etape).
function animerCoup(coup, plateauAvant, dejaJouees, finir) {
  const piece = plateauAvant[coup.depart] !== VIDE ? plateauAvant[coup.depart] : damier[coup.depart];
  const plateau = plateauAvant.slice();
  let depart = coup.depart;
  for (let i = 0; i < dejaJouees; i++) {
    depart = coup.etapes[i].arrivee;
  }
  plateau[coup.depart] = VIDE;
  plateau[depart] = VIDE;
  animation = {
    piece,
    plateau,
    chemin: [depart].concat(coup.etapes.slice(dejaJouees).map(etape => etape.arrivee)),
    prises: coup.etapes.slice(dejaJouees).map(etape => etape.prise),
    pas: 0,
    t: 0,
    finir
  };
  if (animation.chemin.length < 2) {
    const action = animation.finir;
    animation = null;
    action();
  }
}

function majAnimation(delta) {
  if (animation === null) {
    return;
  }
  const a = animation;
  const duree = estDame(a.piece) ? DUREE_PAS_DAME_MS : DUREE_PAS_MS;
  a.t += delta * 1000 / duree;
  while (a.t >= 1 && animation === a) {
    a.t -= 1;
    const prise = a.prises[a.pas];
    const arrivee = a.chemin[a.pas + 1];
    if (prise !== null && prise !== undefined) {
      // La victime saute dans la reserve
      const victime = a.plateau[prise];
      a.plateau[prise] = VIDE;
      disparitions.push({ piece: victime, position: prise, t: 0 });
      const couleurs = campDe(victime) === CLAIR ? ["#f1e6cd", "#b09670", "#fffaf0"] : ["#3a2f2c", "#191312", "#5e504b"];
      effetsDames.eclater(centre(colonneDe(prise)), centre(ligneDe(prise)), couleurs, 10, 120);
      effetsDames.secouer(2, 0.12);
      jouer("impact");
    } else {
      jouer("clic");
    }
    a.pas++;
    if (a.pas >= a.chemin.length - 1) {
      const camp = campDe(a.piece);
      if (!estDame(a.piece) && ligneDe(arrivee) === rangeeDePromotion(camp)) {
        effetsDames.eclater(centre(colonneDe(arrivee)), centre(ligneDe(arrivee)), ["#e8c547", "#c8372d", "#ede8df"], 18, 150);
        effetsDames.flotter(centre(colonneDe(arrivee)), centre(ligneDe(arrivee)) - 30, "DAME", "#e8c547", 16);
        jouer("vie");
      }
      animation = null;
      a.finir();
    }
  }
}

// Position de la piece animee, entre deux cases
function positionAnimee() {
  const a = animation;
  const de = a.chemin[a.pas];
  const vers = a.chemin[Math.min(a.pas + 1, a.chemin.length - 1)];
  const t = a.t < 0.5 ? 2 * a.t * a.t : 1 - Math.pow(-2 * a.t + 2, 2) / 2;
  const x = centre(colonneDe(de)) + (centre(colonneDe(vers)) - centre(colonneDe(de))) * t;
  const y = centre(ligneDe(de)) + (centre(ligneDe(vers)) - centre(ligneDe(de))) * t;
  // Un petit saut au-dessus de la piece prise
  const saut = a.prises[a.pas] !== null && a.prises[a.pas] !== undefined ? Math.sin(t * Math.PI) * 18 : 0;
  return { x, y: y - saut };
}

// ---------------------------------------------------------------------
// Coup du joueur
// ---------------------------------------------------------------------

function jouerCoupJoueur(coup) {
  historique.push(etatCourant());
  if (historique.length > 40) {
    historique.shift();
  }
  const plateauVisible = damierAffiche !== null ? damierAffiche : damier;
  const dejaJouees = Math.max(0, etapesChoisies.length - 1);
  const note = noterCoup(coup);

  annulerSelection();
  tourAuJoueur = false;
  majInterfaceDames();
  if (difficulteDames.ligne) {
    versusDames.envoyer({ d: coup.depart, e: coup.etapes.map(k => [k.arrivee, k.prise]) });
    versusDames.tour(false);
  }

  animerCoup(coup, plateauVisible, dejaJouees, function () {
    const compteAvant = coupDeDameSansPrise(damier, coup);
    appliquerCoup(damier, coup);
    compteurNulle = compteAvant ? compteurNulle + 1 : 0;
    // A deux, la notation reste celle du joueur 1 (le damier est retourne)
    notes.push(difficulteDames.deux && joueurAuTrait === 2 ? noterCoup(tournerCoup(coup)) : note);
    dernierCoup = { depart: coup.depart, arrivee: coup.etapes[coup.etapes.length - 1].arrivee };
    afficherHistorique();
    majInterfaceDames();
    sauverDames();
    if (verifierFinDames()) {
      return;
    }
    if (difficulteDames.deux) {
      passerLaMainDames();
      return;
    }
    if (difficulteDames.ligne) {
      afficherMessageDames("Au tour de " + versusDames.adversaire + ".", true);
      return;
    }
    lancerReflexionIa();
  });
}

function lancerReflexionIa() {
  iaReflechit = true;
  afficherMessageDames("Réflexion...", true);
  majInterfaceDames();

  // La recherche part dans un setTimeout : la page a le temps d'afficher
  // l'indicateur avant que le calcul ne prenne la main.
  clearTimeout(chronoReflexion);
  chronoReflexion = setTimeout(function () {
    if (damesTermine || jeuActif !== "dames") {
      iaReflechit = false;
      return;
    }
    const resultat = choisirCoupIa(damier, difficulteDames.profondeur, BUDGET_IA_MS);
    iaReflechit = false;

    if (resultat === null) {
      terminerDames("Gagné, l'adversaire est bloqué.", true);
      return;
    }

    const coup = resultat.coup;
    const prises = nombreDePrises(coup);
    afficherMessageDames(prises > 0
      ? "L'adversaire prend " + prises + (prises > 1 ? " pièces." : " pièce.")
      : "");
    animerCoup(coup, damier, 0, function () {
      const compteAvant = coupDeDameSansPrise(damier, coup);
      appliquerCoup(damier, coup);
      compteurNulle = compteAvant ? compteurNulle + 1 : 0;
      tourAuJoueur = true;
      notes.push(noterCoup(coup));
      dernierCoup = { depart: coup.depart, arrivee: coup.etapes[coup.etapes.length - 1].arrivee };
      afficherHistorique();
      majInterfaceDames();
      sauverDames();
      verifierFinDames();
    });
  }, 60);
}

// Annuler revient sur le coup complet : celui du joueur et la reponse de l'IA
function annulerCoupDames() {
  if (difficulteDames.ligne || iaReflechit || animation !== null || historique.length === 0) {
    return;
  }
  const etat = historique.pop();
  damier = Int8Array.from(etat.damier);
  tourAuJoueur = etat.tourAuJoueur;
  compteurNulle = etat.compteurNulle;
  notes = notes.slice(0, etat.nombreNotes !== undefined ? etat.nombreNotes : Math.max(0, notes.length - 2));
  dernierCoup = etat.dernierCoup || null;
  if (difficulteDames.deux) {
    joueurAuTrait = etat.joueurAuTrait || 1;
    tourAuJoueur = true;
    majLibellesDames();
  }
  damesTermine = false;
  arreterMinuteries();
  annulerSelection();
  afficherMessageDames("");
  afficherHistorique();
  majInterfaceDames();
  sauverDames();
}

// ---------------------------------------------------------------------
// Selection au clic
// ---------------------------------------------------------------------

// Les arrivees possibles a l'etape courante de la rafle
function arriveesProposees() {
  const vues = new Set();
  const liste = [];
  for (const coup of candidats) {
    const etape = coup.etapes[etapesChoisies.length];
    if (etape !== undefined && !vues.has(etape.arrivee)) {
      vues.add(etape.arrivee);
      liste.push(etape.arrivee);
    }
  }
  return liste;
}

// Damier temporaire montrant la rafle en cours : la piece est deja posee
// sur l'etape choisie, les victimes restent en place jusqu'a la fin.
function construireDamierTemporaire() {
  const copie = damier.slice();
  const piece = copie[selection];
  copie[selection] = VIDE;
  prisesEnCours = [];
  let position = selection;
  for (const etape of etapesChoisies) {
    position = etape.arrivee;
    if (etape.prise !== null) {
      prisesEnCours.push(etape.prise);
    }
  }
  copie[position] = piece;
  damierAffiche = copie;
}

function choisirCaseDames(position) {
  if (damesTermine || iaReflechit || !tourAuJoueur || animation !== null) {
    return;
  }
  const legaux = coupsLegaux(damier, CLAIR);
  if (legaux.length === 0) {
    return;
  }

  // Une rafle est en cours : on n'accepte que les arrivees proposees.
  // Un clic sur la piece elle-meme repart de zero, rien n'a encore ete joue.
  if (selection !== null && etapesChoisies.length > 0) {
    if (position === positionCourante()) {
      annulerSelection();
      return;
    }
    if (!avancerRafle(position, legaux)) {
      afficherMessageDames("Il faut terminer la rafle.");
    }
    return;
  }

  // Choix d'une piece
  const piecesJouables = legaux.map(coup => coup.depart);
  if (piecesJouables.includes(position)) {
    selection = position;
    candidats = legaux.filter(coup => coup.depart === position);
    etapesChoisies = [];
    damierAffiche = null;
    prisesEnCours = [];
    jouer("clic");
    return;
  }

  // Clic sur une arrivee proposee pour la piece deja choisie
  if (selection !== null) {
    if (!avancerRafle(position, legaux)) {
      annulerSelection();
    }
    return;
  }

  // Aide : un clic sur une piece qui ne peut pas jouer alors qu'une prise existe
  if (campDe(damier[position]) === CLAIR && nombreDePrises(legaux[0]) > 0) {
    afficherMessageDames("Prise obligatoire, et la plus longue.");
  }
}

// Valide une etape de la rafle. Renvoie faux si la case n'est pas proposee.
function avancerRafle(position, legaux) {
  const suivants = candidats.filter(coup => {
    const etape = coup.etapes[etapesChoisies.length];
    return etape !== undefined && etape.arrivee === position;
  });
  if (suivants.length === 0) {
    return false;
  }

  etapesChoisies.push(suivants[0].etapes[etapesChoisies.length]);
  candidats = suivants;

  // Toutes les suites restantes sont finies : le coup est complet
  const finis = candidats.filter(coup => coup.etapes.length === etapesChoisies.length);
  if (finis.length > 0) {
    jouerCoupJoueur(finis[0]);
    return true;
  }

  construireDamierTemporaire();
  jouer("impact");
  return true;
}

// La case ou se trouve la piece choisie, etapes de rafle comprises
function positionCourante() {
  if (selection === null) {
    return -1;
  }
  return etapesChoisies.length === 0
    ? selection
    : etapesChoisies[etapesChoisies.length - 1].arrivee;
}

const effacerMessageDames = creerAfficheur(zoneMessageDames, {
  delai: 2500,
  peutEffacer: () => !damesTermine
});

// Un message permanent reste jusqu'au suivant
function afficherMessageDames(texte, permanent) {
  effacerMessageDames(texte, texte === "" || permanent ? 0 : undefined);
}

// ---------------------------------------------------------------------
// Dessin
// ---------------------------------------------------------------------

// Le plateau est dessine dans un repere logique de 608 sur 608 : un cadre
// de bois de 24 autour de cent cases de 56. Le canvas est rendu a la
// resolution de l'ecran (echelle), donc net a toute taille.
const CASE = 56;
const BORD = 24;
const W_DAMES = COTE * CASE + 2 * BORD;
const H_RESERVE = 40;
const effetsDames = creerEffets();
let echelleDames = 1;
let coteAffiche = 560;

function centre(n) {
  return BORD + n * CASE + CASE / 2;
}

// ----- Pieces en volume : un disque tourne, vu d'un peu au-dessus -----

const BOIS_PIECES = {
  clair: { dessus: "#f1e6cd", clair: "#fffaf0", fonce: "#d9c7a2", flanc: "#b09670", flancSombre: "#8a7352", sillon: "#cdb98f", liseré: "#8d7756" },
  sombre: { dessus: "#3a2f2c", clair: "#5e504b", fonce: "#241c1a", flanc: "#191312", flancSombre: "#0d0a09", sillon: "#4c403c", liseré: "#0b0807" }
};
const cachePieces = new Map();

// Un disque : flanc dessous, face du dessus en degrade, deux sillons
function disque(c, camp, cx, cy, r, epaisseur) {
  const t = BOIS_PIECES[camp];
  // Le flanc : le meme disque, decale vers le bas
  c.fillStyle = t.flancSombre;
  c.beginPath();
  c.arc(cx, cy + epaisseur, r, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = t.flanc;
  c.fillRect(cx - r, cy, r * 2, epaisseur);
  const flanc = c.createLinearGradient(cx - r, 0, cx + r, 0);
  flanc.addColorStop(0, t.flancSombre);
  flanc.addColorStop(0.35, t.flanc);
  flanc.addColorStop(1, t.flancSombre);
  c.fillStyle = flanc;
  c.beginPath();
  c.arc(cx, cy + epaisseur, r, 0, Math.PI);
  c.lineTo(cx - r, cy);
  c.arc(cx, cy, r, Math.PI, 0, true);
  c.closePath();
  c.fill();
  // La face du dessus, eclairee d'en haut a gauche
  const face = c.createRadialGradient(cx - r * 0.4, cy - r * 0.45, r * 0.1, cx, cy, r);
  face.addColorStop(0, t.clair);
  face.addColorStop(0.55, t.dessus);
  face.addColorStop(1, t.fonce);
  c.fillStyle = face;
  c.beginPath();
  c.arc(cx, cy, r, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = t.liseré;
  c.lineWidth = 1;
  c.stroke();
  // Les sillons tournes, ombre dessous et lumiere dessus
  [0.72, 0.4].forEach(k => {
    c.lineWidth = 1.4;
    c.strokeStyle = t.sillon;
    c.beginPath();
    c.arc(cx, cy, r * k, 0, Math.PI * 2);
    c.stroke();
    c.strokeStyle = t.clair;
    c.lineWidth = 0.8;
    c.beginPath();
    c.arc(cx, cy + 1, r * k, 0.15 * Math.PI, 0.85 * Math.PI);
    c.stroke();
  });
}

// La couronne doree posee sur la dame
function couronne(c, cx, cy, taille) {
  const s = taille / 20;
  c.save();
  c.translate(cx, cy);
  c.scale(s, s);
  c.beginPath();
  c.moveTo(-10, 5);
  c.lineTo(-11, -5);
  c.lineTo(-5.5, -0.5);
  c.lineTo(0, -8);
  c.lineTo(5.5, -0.5);
  c.lineTo(11, -5);
  c.lineTo(10, 5);
  c.closePath();
  const or = c.createLinearGradient(0, -8, 0, 6);
  or.addColorStop(0, "#f7dc7a");
  or.addColorStop(0.6, "#d9a93a");
  or.addColorStop(1, "#a87a1f");
  c.fillStyle = or;
  c.fill();
  c.strokeStyle = "#6e4f12";
  c.lineWidth = 1.1;
  c.lineJoin = "round";
  c.stroke();
  // Bandeau et perles
  c.fillStyle = "#a87a1f";
  c.fillRect(-10, 2.5, 20, 2.5);
  c.fillStyle = "#f7dc7a";
  [[-11, -5], [0, -8], [11, -5]].forEach(([x, y]) => {
    c.beginPath();
    c.arc(x, y, 1.8, 0, Math.PI * 2);
    c.fill();
    c.stroke();
  });
  c.fillStyle = "#c8372d";
  c.beginPath();
  c.arc(0, 0.5, 2, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

// Sprite d'une piece, 64 x 72 logiques, centre de la face a (32, 32)
const SPRITE_L = 64;
const SPRITE_H = 72;
const ANCRE_Y = 32;

function spritePiece(piece, echelle) {
  const cle = piece + ":" + echelle;
  if (cachePieces.has(cle)) {
    return cachePieces.get(cle);
  }
  const toile = document.createElement("canvas");
  toile.width = Math.ceil(SPRITE_L * echelle);
  toile.height = Math.ceil(SPRITE_H * echelle);
  const c = toile.getContext("2d");
  c.scale(echelle, echelle);
  const camp = campDe(piece);
  const r = 22;
  if (estDame(piece)) {
    // Ombre portee, puis deux pions empiles
    c.fillStyle = "rgba(20, 10, 4, 0.35)";
    c.beginPath();
    c.ellipse(34, ANCRE_Y + 13, r, r * 0.9, 0, 0, Math.PI * 2);
    c.fill();
    disque(c, camp, 32, ANCRE_Y + 2, r, 5);
    disque(c, camp, 32, ANCRE_Y - 5, r, 5);
    couronne(c, 32, ANCRE_Y - 6, 22);
  } else {
    c.fillStyle = "rgba(20, 10, 4, 0.35)";
    c.beginPath();
    c.ellipse(34, ANCRE_Y + 9, r, r * 0.9, 0, 0, Math.PI * 2);
    c.fill();
    disque(c, camp, 32, ANCRE_Y, r, 5);
  }
  cachePieces.set(cle, toile);
  return toile;
}

function dessinerPieceSur(c, piece, x, y, options) {
  const reglages = options || {};
  const echelle = reglages.echelle || echelleDames;
  const taille = reglages.taille || 1;
  const souleve = reglages.souleve ? 6 : 0;
  c.globalAlpha = reglages.alpha === undefined ? 1 : reglages.alpha;
  c.drawImage(spritePiece(piece, echelle * taille),
    x - 32 * taille, y - (ANCRE_Y + souleve) * taille,
    SPRITE_L * taille, SPRITE_H * taille);
  c.globalAlpha = 1;
}

function dessinerPiece(piece, x, y, options) {
  dessinerPieceSur(contexteDames, piece, x, y, options);
}

// ----- Le plateau de bois, peint une fois par echelle -----

// Teinte de chaque case : chaque piece de marqueterie a sa nuance
function nuance(ligne, colonne) {
  const h = (Math.imul(ligne + 7, 73856093) ^ Math.imul(colonne + 3, 19349663)) >>> 0;
  return ((h % 9) - 4) / 100;
}

function eclaircir(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = v => Math.max(0, Math.min(255, Math.round(v + (k > 0 ? (255 - v) * k : v * k))));
  return "rgb(" + f(n >> 16) + "," + f((n >> 8) & 255) + "," + f(n & 255) + ")";
}

function peindreCases(c, lignes, colonnes, taille, x0, y0, numeros) {
  for (let ligne = 0; ligne < lignes; ligne++) {
    for (let colonne = 0; colonne < colonnes; colonne++) {
      const jouable = (ligne + colonne) % 2 === 1;
      const base = jouable ? "#6e4a2c" : "#e0c693";
      const k = nuance(ligne, colonne);
      const x = x0 + colonne * taille;
      const y = y0 + ligne * taille;
      const g = c.createLinearGradient(x, y, x + taille, y + taille);
      g.addColorStop(0, eclaircir(base, k + 0.05));
      g.addColorStop(1, eclaircir(base, k - 0.05));
      c.fillStyle = g;
      c.fillRect(x, y, taille, taille);
      if (jouable && numeros) {
        c.fillStyle = "rgba(255, 236, 200, 0.28)";
        c.font = "500 8px 'Martian Mono', monospace";
        c.textAlign = "left";
        c.textBaseline = "top";
        c.fillText(String(numeroDe(index(ligne, colonne))), x + 3, y + 3);
      }
    }
  }
}

let fondPlateau = null;

function peindrePlateau() {
  const toile = document.createElement("canvas");
  toile.width = Math.round(W_DAMES * echelleDames);
  toile.height = Math.round(W_DAMES * echelleDames);
  const c = toile.getContext("2d");
  c.scale(echelleDames, echelleDames);
  // Le cadre : noyer sombre, chanfrein clair en haut, ombre en bas
  const cadre = c.createLinearGradient(0, 0, 0, W_DAMES);
  cadre.addColorStop(0, "#5a3a22");
  cadre.addColorStop(1, "#3a2414");
  c.fillStyle = cadre;
  c.beginPath();
  c.roundRect(0, 0, W_DAMES, W_DAMES, 14);
  c.fill();
  c.strokeStyle = "#8a6240";
  c.lineWidth = 2;
  c.beginPath();
  c.roundRect(2, 2, W_DAMES - 4, W_DAMES - 4, 12);
  c.stroke();
  c.strokeStyle = "#24160c";
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(16, W_DAMES - 2);
  c.lineTo(W_DAMES - 16, W_DAMES - 2);
  c.stroke();
  // Une baguette doree entre le cadre et les cases
  c.fillStyle = "#24160c";
  c.fillRect(BORD - 5, BORD - 5, COTE * CASE + 10, COTE * CASE + 10);
  c.fillStyle = "#b88a3e";
  c.fillRect(BORD - 3, BORD - 3, COTE * CASE + 6, COTE * CASE + 6);
  c.fillStyle = "#24160c";
  c.fillRect(BORD - 1, BORD - 1, COTE * CASE + 2, COTE * CASE + 2);
  peindreCases(c, COTE, COTE, CASE, BORD, BORD, true);
  // Le cadre porte une ombre sur les cases du haut et de gauche
  const ombreHaut = c.createLinearGradient(0, BORD, 0, BORD + 8);
  ombreHaut.addColorStop(0, "rgba(20, 10, 4, 0.35)");
  ombreHaut.addColorStop(1, "rgba(20, 10, 4, 0)");
  c.fillStyle = ombreHaut;
  c.fillRect(BORD, BORD, COTE * CASE, 8);
  const ombreGauche = c.createLinearGradient(BORD, 0, BORD + 6, 0);
  ombreGauche.addColorStop(0, "rgba(20, 10, 4, 0.25)");
  ombreGauche.addColorStop(1, "rgba(20, 10, 4, 0)");
  c.fillStyle = ombreGauche;
  c.fillRect(BORD, BORD, 6, COTE * CASE);
  fondPlateau = toile;
}

// ----- Taille : le plateau prend la place libre, au-dessus de la manette -----

function ajusterDames() {
  if (zoneDames.hidden) {
    return;
  }
  const marge = window.innerWidth >= 1100 ? 500 : 0;
  const historiqueACote = window.innerWidth > 860;
  const largeur = Math.min(window.innerWidth * 0.96 - marge - (historiqueACote ? 186 : 0), 640);
  let cote = Math.floor(largeur);
  appliquerCote(cote);
  const manette = document.querySelector(".manette:not([hidden])");
  const plafond = manette ? manette.getBoundingClientRect().top - 10 : window.innerHeight - 12;
  let bas = 0;
  for (const enfant of zoneDames.children) {
    if (enfant.offsetParent !== null) {
      bas = Math.max(bas, enfant.getBoundingClientRect().bottom);
    }
  }
  if (bas > plafond) {
    // Le plateau et ses deux reserves grandissent ensemble
    const ratio = (W_DAMES + 2 * H_RESERVE) / W_DAMES;
    cote = Math.max(240, Math.floor(cote - (bas - plafond) / ratio));
    appliquerCote(cote);
  }
}

function appliquerCote(cote) {
  coteAffiche = cote;
  zoneDames.style.setProperty("--cote-dames", cote + "px");
  const echelle = Math.min(3, Math.max(1, cote / W_DAMES * (window.devicePixelRatio || 1)));
  canvasDames.style.width = cote + "px";
  canvasDames.style.height = cote + "px";
  const hReserve = Math.round(cote * H_RESERVE / W_DAMES);
  [canvasReserveHaut, canvasReserveBas].forEach(toile => {
    toile.style.width = cote + "px";
    toile.style.height = hReserve + "px";
  });
  if (Math.abs(echelle - echelleDames) > 0.01 || canvasDames.width !== Math.round(W_DAMES * echelle)) {
    echelleDames = echelle;
    canvasDames.width = Math.round(W_DAMES * echelle);
    canvasDames.height = Math.round(W_DAMES * echelle);
    [canvasReserveHaut, canvasReserveBas].forEach(toile => {
      toile.width = Math.round(W_DAMES * echelle);
      toile.height = Math.round(H_RESERVE * echelle);
    });
    fondPlateau = null;
    cachePieces.clear();
  }
}

window.addEventListener("resize", ajusterDames);

// ----- Dessin du damier, a chaque image -----

// Les pieces prises s'effacent en s'enfoncant, le temps d'un battement
let disparitions = [];

function surlignerCase(position, couleur) {
  contexteDames.fillStyle = couleur;
  contexteDames.fillRect(BORD + colonneDe(position) * CASE, BORD + ligneDe(position) * CASE, CASE, CASE);
}

function anneau(x, y, rayon, couleur, epaisseur) {
  contexteDames.strokeStyle = couleur;
  contexteDames.lineWidth = epaisseur;
  contexteDames.beginPath();
  contexteDames.arc(x, y, rayon, 0, Math.PI * 2);
  contexteDames.stroke();
}

function dessinerDamier(delta) {
  if (fondPlateau === null) {
    peindrePlateau();
  }
  const decalage = effetsDames.decalage();
  contexteDames.setTransform(1, 0, 0, 1, 0, 0);
  contexteDames.clearRect(0, 0, canvasDames.width, canvasDames.height);
  contexteDames.setTransform(echelleDames, 0, 0, echelleDames, decalage.x * echelleDames, decalage.y * echelleDames);
  contexteDames.drawImage(fondPlateau, 0, 0, W_DAMES, W_DAMES);

  // Le dernier coup : depart et arrivee teintes d'or pale
  if (dernierCoup !== null && animation === null) {
    surlignerCase(dernierCoup.depart, "rgba(240, 200, 90, 0.22)");
    surlignerCase(dernierCoup.arrivee, "rgba(240, 200, 90, 0.38)");
  }

  const plateau = animation !== null ? animation.plateau : (damierAffiche !== null ? damierAffiche : damier);
  const monTour = !damesTermine && !iaReflechit && tourAuJoueur && animation === null;
  const legaux = monTour ? coupsLegaux(damier, CLAIR) : [];
  const jouables = legaux.map(coup => coup.depart);
  const arrivees = selection !== null ? arriveesProposees() : [];
  const priseObligatoire = legaux.length > 0 && nombreDePrises(legaux[0]) > 0;

  if (monTour && caseSurvolee >= 0 && caseJouable(ligneDe(caseSurvolee), colonneDe(caseSurvolee))) {
    surlignerCase(caseSurvolee, "rgba(255, 240, 210, 0.1)");
  }

  // Les pieces qui peuvent jouer : un anneau grave dans la case
  if (selection === null) {
    jouables.forEach(position => {
      const couleur = priseObligatoire ? "#e0574b" : "#c8f060";
      anneau(centre(colonneDe(position)), centre(ligneDe(position)) + 2, 25.5, couleur, 2.5);
    });
  }

  // Aide : les rafles obligatoires, tracees en vermillon
  if (aideActive && monTour && priseObligatoire && selection === null) {
    contexteDames.strokeStyle = "rgba(224, 87, 75, 0.85)";
    contexteDames.lineWidth = 4;
    contexteDames.lineCap = "round";
    contexteDames.lineJoin = "round";
    legaux.forEach(coup => {
      contexteDames.beginPath();
      contexteDames.moveTo(centre(colonneDe(coup.depart)), centre(ligneDe(coup.depart)));
      coup.etapes.forEach(etape => contexteDames.lineTo(centre(colonneDe(etape.arrivee)), centre(ligneDe(etape.arrivee))));
      contexteDames.stroke();
    });
  }

  // Les arrivees proposees : un jeton de lumiere au fond de la case
  arrivees.forEach(position => {
    const x = centre(colonneDe(position));
    const y = centre(ligneDe(position));
    contexteDames.fillStyle = "rgba(10, 6, 2, 0.45)";
    contexteDames.beginPath();
    contexteDames.arc(x, y + 1.5, 9, 0, Math.PI * 2);
    contexteDames.fill();
    contexteDames.fillStyle = priseObligatoire ? "#e0574b" : "#c8f060";
    contexteDames.beginPath();
    contexteDames.arc(x, y, 8, 0, Math.PI * 2);
    contexteDames.fill();
  });

  // Rangee par rangee, du haut vers le bas : les pieces du bas passent devant
  for (let position = 0; position < CASES; position++) {
    const piece = plateau[position];
    if (piece === VIDE) {
      continue;
    }
    const x = centre(colonneDe(position));
    const y = centre(ligneDe(position));
    const choisie = selection !== null && position === positionCourante();
    const capturee = prisesEnCours.includes(position);
    if (choisie) {
      anneau(x, y + 2, 25.5, "#c8f060", 3);
    }
    dessinerPiece(piece, x, y, { souleve: choisie, alpha: capturee ? 0.45 : 1 });
    if (capturee) {
      contexteDames.strokeStyle = "#c8372d";
      contexteDames.lineWidth = 3.5;
      contexteDames.lineCap = "round";
      contexteDames.beginPath();
      contexteDames.moveTo(x - 10, y - 10);
      contexteDames.lineTo(x + 10, y + 10);
      contexteDames.moveTo(x + 10, y - 10);
      contexteDames.lineTo(x - 10, y + 10);
      contexteDames.stroke();
    }
  }

  // Les pieces sautees s'enfoncent et s'effacent
  disparitions = disparitions.filter(d => {
    d.t += (delta || 0) / 0.28;
    if (d.t >= 1) {
      return false;
    }
    const x = centre(colonneDe(d.position));
    const y = centre(ligneDe(d.position));
    dessinerPieceSur(contexteDames, d.piece, x, y + d.t * 4, { alpha: 1 - d.t, taille: 1 - d.t * 0.35 });
    return true;
  });

  // La piece en mouvement, soulevee
  if (animation !== null) {
    const p = positionAnimee();
    dessinerPiece(animation.piece, p.x, p.y, { souleve: true });
  }

  effetsDames.dessiner(contexteDames);
  contexteDames.setTransform(1, 0, 0, 1, 0, 0);
}

// Les reserves : les pieces prises, rangees en pile serree du cote de
// celui qui les a prises
function dessinerReserve(toile, camp, nombre) {
  const c = toile.getContext("2d");
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, toile.width, toile.height);
  c.setTransform(echelleDames, 0, 0, echelleDames, 0, 0);
  const piece = camp === CLAIR ? PION_CLAIR : PION_SOMBRE;
  const pas = Math.min(26, (W_DAMES - 70) / Math.max(1, nombre));
  for (let i = 0; i < nombre; i++) {
    dessinerPieceSur(c, piece, BORD + 14 + i * pas, 17, { taille: 0.62 });
  }
  if (nombre > 0) {
    c.fillStyle = "#8f8a82";
    c.font = "600 13px 'Martian Mono', monospace";
    c.textAlign = "right";
    c.textBaseline = "middle";
    c.fillText("×" + nombre, W_DAMES - BORD, H_RESERVE / 2);
  }
}

let reservesAffichees = "";

function dessinerReserves() {
  const plateau = animation !== null ? animation.plateau : damier;
  const haut = 20 - compterPieces(plateau, CLAIR) - (animation !== null && campDe(animation.piece) === CLAIR ? 1 : 0);
  const bas = 20 - compterPieces(plateau, SOMBRE) - (animation !== null && campDe(animation.piece) === SOMBRE ? 1 : 0);
  const cle = haut + "/" + bas + "/" + canvasReserveHaut.width;
  if (cle === reservesAffichees) {
    return;
  }
  reservesAffichees = cle;
  // En haut, du cote de l'adversaire : tes pieces qu'il a prises
  dessinerReserve(canvasReserveHaut, CLAIR, haut);
  dessinerReserve(canvasReserveBas, SOMBRE, bas);
}

const boucleDames = creerBoucle(function (delta) {
  majAnimation(delta);
  effetsDames.maj(delta);
  dessinerDamier(delta);
  dessinerReserves();
}, { plafond: 0.05 });

// ----- Fin de partie : une plaque posee sur le damier -----

function montrerFinDames(titre, texte, issue) {
  finTitreDames.textContent = titre;
  finTexteDames.textContent = texte;
  finDames.dataset.issue = issue;
  setTimeout(function () {
    if (damesTermine && !zoneDames.hidden) {
      finDames.hidden = false;
    }
  }, issue === "gagne" ? 1100 : 700);
}

function cacherFinDames() {
  finDames.hidden = true;
}

// ----- Les regles en trois planches -----

const PLANCHES = [
  {
    titre: "La prise est obligatoire",
    texte: "Si tu peux prendre, tu dois prendre : on saute une pièce adverse vers la case libre juste derrière. Les pions prennent aussi en arrière.",
    lignes: 5,
    pieces: [[3, 2, PION_CLAIR], [2, 1, PION_SOMBRE], [1, 4, PION_SOMBRE]],
    fleches: [{ chemin: [[3, 2], [1, 0]], bonne: true }, { chemin: [[3, 2], [2, 3]], bonne: false }]
  },
  {
    titre: "La prise majoritaire",
    texte: "Quand plusieurs prises sont possibles, il faut jouer celle qui prend le plus de pièces. La rafle se joue en entier, case après case.",
    lignes: 6,
    pieces: [[5, 2, PION_CLAIR], [4, 3, PION_SOMBRE], [2, 3, PION_SOMBRE], [4, 1, PION_SOMBRE]],
    fleches: [{ chemin: [[5, 2], [3, 4], [1, 2]], bonne: true }, { chemin: [[5, 2], [3, 0]], bonne: false }]
  },
  {
    titre: "La dame volante",
    texte: "Un pion qui atteint le dernier rang devient dame. Elle glisse sur toute une diagonale, prend de loin et peut s'arrêter sur n'importe quelle case libre derrière la pièce prise.",
    lignes: 6,
    pieces: [[5, 0, DAME_CLAIRE], [2, 3, PION_SOMBRE]],
    fleches: [{ chemin: [[5, 0], [1, 4]], bonne: true }, { chemin: [[5, 0], [0, 5]], bonne: true, legere: true }]
  }
];
let plancheCourante = 0;

function dessinerPlanche() {
  const planche = PLANCHES[plancheCourante];
  const n = planche.lignes;
  const taille = window.innerWidth < 420 ? 26 : 36;
  const cote = n * taille;
  const echelle = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
  toileRegles.width = cote * echelle;
  toileRegles.height = cote * echelle;
  toileRegles.style.width = cote + "px";
  toileRegles.style.height = cote + "px";
  const c = toileRegles.getContext("2d");
  c.setTransform(echelle, 0, 0, echelle, 0, 0);
  peindreCases(c, n, n, taille, 0, 0, false);
  const centreMini = k => k * taille + taille / 2;
  planche.pieces.forEach(([ligne, colonne, piece]) => {
    dessinerPieceSur(c, piece, centreMini(colonne), centreMini(ligne), { echelle, taille: taille / CASE });
  });
  planche.fleches.forEach(fleche => {
    const couleur = fleche.bonne ? "#c8f060" : "#e0574b";
    const pts = fleche.chemin.map(([l, k]) => [centreMini(k), centreMini(l)]);
    c.strokeStyle = "#140c06";
    c.lineWidth = 6;
    c.lineCap = "round";
    c.lineJoin = "round";
    c.globalAlpha = fleche.legere ? 0.5 : 1;
    c.setLineDash(fleche.bonne ? [] : [5, 6]);
    c.beginPath();
    pts.forEach(([x, y], i) => (i === 0 ? c.moveTo(x, y) : c.lineTo(x, y)));
    c.stroke();
    c.strokeStyle = couleur;
    c.lineWidth = 3;
    c.stroke();
    c.setLineDash([]);
    // Pointe de fleche
    const [x1, y1] = pts[pts.length - 2];
    const [x2, y2] = pts[pts.length - 1];
    const angle = Math.atan2(y2 - y1, x2 - x1);
    c.fillStyle = couleur;
    c.beginPath();
    c.moveTo(x2, y2);
    c.lineTo(x2 - 11 * Math.cos(angle - 0.45), y2 - 11 * Math.sin(angle - 0.45));
    c.lineTo(x2 - 11 * Math.cos(angle + 0.45), y2 - 11 * Math.sin(angle + 0.45));
    c.closePath();
    c.fill();
    if (!fleche.bonne) {
      // Une croix au bout du mauvais choix
      c.strokeStyle = "#e0574b";
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(x2 - 6, y2 - 6);
      c.lineTo(x2 + 6, y2 + 6);
      c.moveTo(x2 + 6, y2 - 6);
      c.lineTo(x2 - 6, y2 + 6);
      c.stroke();
    }
    c.globalAlpha = 1;
  });
  titreRegles.textContent = planche.titre;
  texteRegles.textContent = planche.texte;
  etapeRegles.textContent = (plancheCourante + 1) + " / " + PLANCHES.length;
  precedentRegles.disabled = plancheCourante === 0;
  suivantRegles.textContent = plancheCourante === PLANCHES.length - 1 ? "À toi de jouer" : "Suivant";
}

function ouvrirRegles() {
  plancheCourante = 0;
  regles.hidden = false;
  dessinerPlanche();
}

function fermerRegles() {
  regles.hidden = true;
  stockageRegles.ecrire(true);
}

function majInterfaceDames() {
  zonePiecesJoueur.textContent = String(compterPieces(damier, CLAIR));
  zonePiecesIa.textContent = String(compterPieces(damier, SOMBRE));
  canvasDames.classList.toggle("reflexion", iaReflechit);
  boutonAnnulerDames.disabled = iaReflechit || animation !== null || historique.length === 0 || !!difficulteDames.ligne;
  marquerChoixActif(zoneDifficultesDames, difficulteDames.id);
  afficherHistorique();
  // Le score du classement est celui qu'on obtiendrait en gagnant maintenant
  if (!difficulteDames.deux && !difficulteDames.ligne) {
    majScoreCourant("dames-" + difficulteDames.id,
      compterPieces(damier, CLAIR) * 100 + difficulteDames.bonus);
  }
}

function majBoutons() {
  boutonSonDames.textContent = sonActif() ? "Son" : "Muet";
  boutonSonDames.setAttribute("aria-pressed", String(!sonActif()));
  boutonAideDames.setAttribute("aria-pressed", String(aideActive));
  boutonAideDames.classList.toggle("actif", aideActive);
}

function basculerAide() {
  aideActive = !aideActive;
  stockageAide.ecrire(aideActive);
  majBoutons();
}

// ---------------------------------------------------------------------
// Commandes
// ---------------------------------------------------------------------

function caseDuPointeur(evenement) {
  const x = abscisseLogique(canvasDames, evenement.clientX, W_DAMES) - BORD;
  const y = ordonneeLogique(canvasDames, evenement.clientY, W_DAMES) - BORD;
  const colonne = Math.floor(x / CASE);
  const ligne = Math.floor(y / CASE);
  if (!dansLeDamier(ligne, colonne) || !caseJouable(ligne, colonne)) {
    return -1;
  }
  return index(ligne, colonne);
}

canvasDames.addEventListener("pointerdown", function (evenement) {
  if (!jeuAuPremierPlan("dames") || !regles.hidden) {
    return;
  }
  const position = caseDuPointeur(evenement);
  if (position >= 0) {
    choisirCaseDames(position);
  }
});

canvasDames.addEventListener("pointermove", function (evenement) {
  if (evenement.pointerType === "touch") {
    return;
  }
  caseSurvolee = caseDuPointeur(evenement);
});

canvasDames.addEventListener("pointerleave", function () {
  caseSurvolee = -1;
});

surTouche("dames", function (evenement) {
  const touche = evenement.key.toLowerCase();

  if (touche === "escape") {
    if (!regles.hidden) {
      fermerRegles();
      evenement.preventDefault();
      return;
    }
    quitterJeu();
    return;
  }
  if (touche === "r") {
    if (regles.hidden) {
      ouvrirRegles();
    } else {
      fermerRegles();
    }
    evenement.preventDefault();
    return;
  }
  if (touche === "backspace" || (touche === "z" && (evenement.ctrlKey || evenement.metaKey))) {
    annulerCoupDames();
  } else if (touche === "n") {
    nouvellePartieDames(difficulteDames);
  } else if (touche === "h") {
    basculerAide();
  } else if (touche === "m") {
    basculerSon();
    majBoutons();
  } else {
    return;
  }
  evenement.preventDefault();
});

// Boutons de difficulte, comme au sudoku
creerBoutonsChoix(zoneDifficultesDames, CHOIX_DAMES, nouvellePartieDames);

boutonAideDames.addEventListener("click", basculerAide);
boutonAnnulerDames.addEventListener("click", annulerCoupDames);
boutonNouvelleDames.addEventListener("click", () => nouvellePartieDames(difficulteDames));
boutonSonDames.addEventListener("click", function () {
  basculerSon();
  majBoutons();
});
boutonQuitterDames.addEventListener("click", quitterJeu);
boutonReglesDames.addEventListener("click", ouvrirRegles);
document.getElementById("fermerReglesDames").addEventListener("click", fermerRegles);
precedentRegles.addEventListener("click", function () {
  plancheCourante = Math.max(0, plancheCourante - 1);
  dessinerPlanche();
});
suivantRegles.addEventListener("click", function () {
  if (plancheCourante === PLANCHES.length - 1) {
    fermerRegles();
    return;
  }
  plancheCourante++;
  dessinerPlanche();
});
document.getElementById("finVoirDames").addEventListener("click", cacherFinDames);
document.getElementById("finRejouerDames").addEventListener("click", () => nouvellePartieDames(difficulteDames));

// ===== Inscription dans l'arcade =====
// Les dames se jouent au doigt et a la souris ; la manette donne en plus
  // l'aide aux prises (A) et l'annulation (B).
// ---------------------------------------------------------------------
// A deux et en ligne
// ---------------------------------------------------------------------

// Le damier vu de l'autre camp : demi-tour et couleurs echangees
const ECHANGE = [VIDE, PION_SOMBRE, DAME_SOMBRE, PION_CLAIR, DAME_CLAIRE];

function pivoterDamier(plateau) {
  const retourne = new Int8Array(CASES);
  for (let i = 0; i < CASES; i++) {
    retourne[i] = ECHANGE[plateau[CASES - 1 - i]];
  }
  return retourne;
}

function tournerCoup(coup) {
  return {
    depart: CASES - 1 - coup.depart,
    etapes: coup.etapes.map(k => ({ arrivee: CASES - 1 - k.arrivee, prise: k.prise === null ? null : CASES - 1 - k.prise }))
  };
}

function majLibellesDames() {
  const libelles = zoneDames.querySelectorAll(".entete-dames > .jeu-score");
  const noms = difficulteDames.deux ? ["Joueur " + joueurAuTrait, "Joueur " + (3 - joueurAuTrait)]
    : difficulteDames.ligne && versusDames.actif ? ["Toi", versusDames.adversaire] : ["Toi", "Adversaire"];
  libelles.forEach((span, i) => {
    if (span.firstChild && span.firstChild.nodeType === Node.TEXT_NODE) {
      span.firstChild.textContent = noms[i] + " ";
    }
  });
}

function passerLaMainDames() {
  setTimeout(() => {
    if (damesTermine || !difficulteDames.deux || animation !== null || tourAuJoueur) {
      return;
    }
    damier = pivoterDamier(damier);
    dernierCoup = dernierCoup ? { depart: CASES - 1 - dernierCoup.depart, arrivee: CASES - 1 - dernierCoup.arrivee } : null;
    joueurAuTrait = 3 - joueurAuTrait;
    tourAuJoueur = true;
    disparitions = [];
    reservesAffichees = "";
    majLibellesDames();
    majInterfaceDames();
    const legaux = coupsLegaux(damier, CLAIR);
    afficherMessageDames("Joueur " + joueurAuTrait + ", à toi." + (legaux.length && nombreDePrises(legaux[0]) > 0 ? " Prise obligatoire." : ""), true);
  }, 550);
}

function coupAdverseDames(recu) {
  const voulu = tournerCoup({ depart: Number(recu.d), etapes: (recu.e || []).map(k => ({ arrivee: Number(k[0]), prise: k[1] === null ? null : Number(k[1]) })) });
  const coup = coupsLegaux(damier, SOMBRE).find(k => k.depart === voulu.depart
    && k.etapes.length === voulu.etapes.length
    && k.etapes.every((e, i) => e.arrivee === voulu.etapes[i].arrivee && e.prise === voulu.etapes[i].prise));
  if (!coup) {
    afficherMessageDames("Coup reçu impossible : la partie est arrêtée.", true);
    damesTermine = true;
    versusDames.terminer("victoire", "invalide");
    return;
  }
  const prises = nombreDePrises(coup);
  afficherMessageDames(prises > 0 ? versusDames.adversaire + " prend " + prises + (prises > 1 ? " pièces." : " pièce.") : "");
  animerCoup(coup, damier, 0, function () {
    const compteAvant = coupDeDameSansPrise(damier, coup);
    appliquerCoup(damier, coup);
    compteurNulle = compteAvant ? compteurNulle + 1 : 0;
    tourAuJoueur = true;
    notes.push(noterCoup(coup));
    dernierCoup = { depart: coup.depart, arrivee: coup.etapes[coup.etapes.length - 1].arrivee };
    afficherHistorique();
    majInterfaceDames();
    if (!verifierFinDames()) {
      versusDames.tour(true);
      if (prises === 0) {
        afficherMessageDames("À toi.", true);
      }
    }
  });
}

const versusDames = creerVersus({
  jeu: "dames",
  nom: "Dames",
  section: zoneDames,
  surDebut(info) {
    arreterMinuteries();
    damier = damierDeDepart();
    compteurNulle = 0;
    historique = [];
    notes = [];
    dernierCoup = null;
    animation = null;
    disparitions = [];
    reservesAffichees = "";
    cacherFinDames();
    annulerSelection();
    // Celui qui commence a toujours les clairs a l'ecran (en bas)
    let auTrait = info.jeCommence ? CLAIR : SOMBRE;
    info.coups.forEach(k => {
      const brut = { depart: Number(k.c.d), etapes: (k.c.e || []).map(x => ({ arrivee: Number(x[0]), prise: x[1] === null ? null : Number(x[1]) })) };
      const coup = k.moi ? brut : tournerCoup(brut);
      const compteAvant = coupDeDameSansPrise(damier, coup);
      appliquerCoup(damier, coup);
      compteurNulle = compteAvant ? compteurNulle + 1 : 0;
      notes.push(noterCoup(coup));
      dernierCoup = { depart: coup.depart, arrivee: coup.etapes[coup.etapes.length - 1].arrivee };
      auTrait = auTrait === CLAIR ? SOMBRE : CLAIR;
    });
    tourAuJoueur = auTrait === CLAIR;
    damesTermine = false;
    majLibellesDames();
    majInterfaceDames();
    versusDames.tour(tourAuJoueur);
    afficherMessageDames(tourAuJoueur ? "À toi : tu as les pièces claires contre " + info.adversaire + "." : info.adversaire + " commence.", true);
    jouer("bonus");
  },
  surCoup: coupAdverseDames,
  surFin(fin) {
    damesTermine = true;
    annulerSelection();
    majInterfaceDames();
    afficherMessageDames(fin.resultat === "victoire" ? "Victoire : " + versusDames.adversaire + (fin.raison === "abandon" ? " abandonne." : " quitte la partie.")
      : fin.resultat === "nul" ? "Partie nulle." : "Partie perdue.", true);
  },
  passerEnLigne() {
    if (!difficulteDames.ligne) {
      nouvellePartieDames(DIFFICULTES_DAMES.find(d => d.ligne));
    }
  },
  surFermeture() {
    if (difficulteDames.ligne) {
      difficulteDames = DIFFICULTES_DAMES[0];
      nouvellePartieDames(difficulteDames);
    }
  }
});

// Pour les tests automatiques
export const _test = {
  get damier() { return damier; },
  get aMoi() { return tourAuJoueur && !damesTermine && animation === null && !iaReflechit; },
  get joueurAuTrait() { return joueurAuTrait; },
  legaux: () => coupsLegaux(damier, CLAIR),
  jouer: coup => jouerCoupJoueur(coup)
};

enregistrerJeu({
  id: "dames",
  nom: "Dames",
  code: "10",
  section: zoneDames,
  demarrer: demarrerDames,
  arreter: arreterDames,
  classement: () => "dames-" + (difficulteDames.deux || difficulteDames.ligne ? "facile" : difficulteDames.id),
  manette: { a: "h", b: "Backspace", start: "n", libelles: { a: "Prises", b: "Annuler" } }
});
