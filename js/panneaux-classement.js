// =====================================================================
//  PANNEAUX DE CLASSEMENT LATERAUX
//  Sur grand ecran, les deux cotes du jeu affichent le top 10 local a
//  gauche et le top 10 en ligne a droite. Pendant la partie, le score
//  courant est compare a ces listes gardees en memoire : aucun appel
//  reseau n'a lieu tant qu'on joue, la liste en ligne n'est chargee
//  qu'a l'ouverture du jeu puis rafraichie en fin de partie.
// =====================================================================

import { meilleursScores, formaterScore, plusBasEstMieuxPour } from "./arcade.js";
import { lireClassementEnLigne } from "./classement.js";

const panneauLocal = document.getElementById("panneauClassementLocal");
const panneauEnLigne = document.getElementById("panneauClassementEnLigne");
const listeLocale = document.getElementById("classementListeLocale");
const listeEnLigne = document.getElementById("classementListeEnLigne");
const rangLocal = document.getElementById("classementRangLocal");
const rangEnLigne = document.getElementById("classementRangEnLigne");

const LARGEUR_MINIMALE = 1100;
const TAILLE_TABLEAU = 10;

// Glisses dans les colonnes d'un jeu, les panneaux partagent la hauteur
// avec le jeu lui-meme : dix entrees de chaque cote rendaient les
// colonnes du Tetris plus hautes que la fenetre. On n'en montre alors
// que cinq, plus un emplacement pour la ligne provisoire du joueur
// quand il est classe au-dela.
const TAILLE_COMPACTE = 5;

// Le jeu occupe deja ses deux cotes : les panneaux se glissent dans ses
// colonnes au lieu de se coller aux bords de la fenetre. Chaque place
// dit sous quel element se ranger.
const COLONNES_DU_JEU = {
  tetris: () => {
    const cotes = document.querySelectorAll("#jeuTetris .tetris-cote");
    if (cotes.length < 2) {
      return null;
    }
    return [
      // A gauche, sous les statistiques et non entre Hold et Score : le
      // score de la partie en cours passe avant les classements.
      { colonne: cotes[0], apres: cotes[0].querySelector(".tetris-stats") },
      // A droite, sous Next. Le message et Retour descendent en dessous.
      { colonne: cotes[1], apres: cotes[1].querySelector(".tetris-panneau") }
    ];
  }
};

let idClassementCourant = null;
let scoresEnLigne;               // tableau si recu, null si injoignable,
                                 // indefini tant que la reponse n'est pas arrivee
let idEnLigneCharge = null;      // identifiant dont la liste est en memoire
let scoreCourant = null;
let panneauxOuverts = false;
let premierePlaceAnnoncee = false;

// ---------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------

function ecranAssezLarge() {
  return window.innerWidth >= LARGEUR_MINIMALE;
}

// Remet les deux panneaux a leur place par defaut, aux bords de la fenetre
function replacerAuxBords() {
  [panneauLocal, panneauEnLigne].forEach(panneau => {
    panneau.classList.remove("dans-le-jeu");
    if (panneau.parentElement !== document.body) {
      document.body.appendChild(panneau);
    }
  });
}

// Glisse les panneaux dans les colonnes du jeu quand celui-ci en a
function placerPourLeJeu(idJeu) {
  const chercher = COLONNES_DU_JEU[idJeu];
  if (chercher === undefined) {
    replacerAuxBords();
    return;
  }
  const places = chercher();
  if (places === null || places.length < 2) {
    replacerAuxBords();
    return;
  }
  glisserApres(places[0], panneauLocal);
  glisserApres(places[1], panneauEnLigne);
  panneauLocal.classList.add("dans-le-jeu");
  panneauEnLigne.classList.add("dans-le-jeu");
}

// Insere le panneau juste apres l'element de reference de sa colonne.
// Ce qui suivait descend en dessous.
function glisserApres(place, panneau) {
  const reference = place.apres;
  if (reference !== null && reference.nextSibling !== null) {
    place.colonne.insertBefore(panneau, reference.nextSibling);
  } else {
    place.colonne.appendChild(panneau);
  }
}

// Vrai quand les panneaux sont glisses dans les colonnes d'un jeu
function enModeCompact() {
  return panneauLocal.classList.contains("dans-le-jeu");
}

function montrer(visible) {
  panneauLocal.classList.toggle("actif", visible);
  panneauEnLigne.classList.toggle("actif", visible);
}

// Glisses dans les colonnes d'un jeu, les panneaux partagent sa hauteur.
// Si le jeu n'y tient plus, ce sont eux qui s'effacent : reduire le
// plateau pour loger un classement serait le mauvais arbitrage.
//
// On mesure au lieu de fixer une hauteur minimale : le seuil depend du
// jeu, de la taille de sa police et du nombre d'entrees, et une valeur
// ecrite a la main finirait par mentir.
function effacerSiLeJeuNyTientPas() {
  if (!panneauxOuverts || !enModeCompact()) {
    return;
  }
  const section = panneauLocal.closest(".jeu");
  if (section === null || section.hidden) {
    return;
  }
  if (section.scrollHeight > section.clientHeight + 1) {
    montrer(false);
  }
}

// ---------------------------------------------------------------------
// Rang du score courant
// ---------------------------------------------------------------------

// Position, a partir de 1, qu'occuperait le score courant dans la liste.
// Renvoie 0 quand le score n'entre pas dans le tableau.
function rangDansLaListe(liste, score) {
  let rang = 1;
  for (const entree of liste) {
    if (score > Number(entree.score)) {
      return rang;
    }
    rang++;
  }
  return rang <= TAILLE_TABLEAU ? rang : 0;
}

// ---------------------------------------------------------------------
// Affichage d'un panneau
// ---------------------------------------------------------------------

function ligneDeClassement(id, entree, position, classes) {
  const ligne = document.createElement("li");
  if (classes) {
    ligne.classList.add(...[].concat(classes));
  }
  const rang = document.createElement("span");
  rang.className = "scores-rang";
  rang.textContent = String(position).padStart(2, "0");

  const nom = document.createElement("span");
  nom.className = "scores-nom";
  nom.textContent = entree.nom;

  const points = document.createElement("span");
  points.textContent = formaterScore(id, Number(entree.score));

  ligne.append(rang, nom, points);
  return ligne;
}

// Une ligne d'encombrement identique a une vraie, mais invisible. Elle
// sert a reserver la hauteur : un panneau doit faire sa taille finale
// des l'ouverture du jeu, sinon toute la page saute au moment ou le
// classement en ligne arrive, une seconde plus tard. Le pseudo le plus
// long possible garantit aussi que la largeur ne bougera pas.
function ligneReservee(id) {
  return ligneDeClassement(id, { nom: "AAAAAAAAA", score: 0 }, 0, "reserve");
}

// Dessine une liste, avec au besoin la ligne provisoire du joueur inseree
// a sa position. Les entrees depassees sont estompees, et les places
// manquantes sont remplies de lignes reservees.
function dessinerListe(element, liste, id, score, avecRangProvisoire, compact) {
  element.innerHTML = "";
  const capacite = compact ? TAILLE_COMPACTE : TAILLE_TABLEAU;
  let ecrites = 0;

  const completer = () => {
    while (ecrites < capacite) {
      element.appendChild(ligneReservee(id));
      ecrites++;
    }
  };

  // En mode compact, un emplacement de plus est toujours present, sous
  // un separateur : il accueille la ligne du joueur quand celui-ci est
  // classe au-dela de la cinquieme place. Reserve, il occupe la meme
  // hauteur, donc rien ne bouge quand il se remplit.
  const completerLeSixieme = rang => {
    if (!compact) {
      return;
    }
    if (rang > capacite) {
      element.appendChild(ligneDeClassement(id, { nom: "TOI", score }, rang,
        ["provisoire", "hors-tableau"]));
    } else {
      element.appendChild(ligneDeClassement(id, { nom: "AAAAAAAAA", score: 0 }, 0,
        ["reserve", "hors-tableau"]));
    }
  };

  if (!Array.isArray(liste) || (liste.length === 0 && !avecRangProvisoire)) {
    const message = document.createElement("li");
    message.className = "classement-vide";
    message.textContent = liste === undefined ? "Chargement"
      : (liste === null ? "Classement indisponible" : "Aucun score");
    element.appendChild(message);
    ecrites = 1;
    completer();
    completerLeSixieme(0);
    return 0;
  }

  const rang = avecRangProvisoire ? rangDansLaListe(liste, score) : 0;
  let position = 1;

  for (const entree of liste) {
    if (position > capacite) {
      break;
    }
    if (rang > 0 && position === rang) {
      element.appendChild(ligneDeClassement(id,
        { nom: "TOI", score }, position, "provisoire"));
      ecrites++;
      position++;
      if (position > capacite) {
        break;
      }
    }
    // Une entree que le score courant a depassee s'efface
    const depassee = rang > 0 && position > rang;
    element.appendChild(ligneDeClassement(id, entree, position,
      depassee ? "depassee" : null));
    ecrites++;
    position++;
  }

  // Le joueur se glisse en fin de liste quand elle n'est pas pleine
  if (rang > 0 && rang >= position && position <= capacite) {
    element.appendChild(ligneDeClassement(id, { nom: "TOI", score }, rang, "provisoire"));
    ecrites++;
  }

  completer();
  completerLeSixieme(rang);
  return rang;
}

// La ligne sous le panneau : rang atteint et ecart avec la place suivante
function texteDuRang(liste, id, score, rang) {
  if (!Array.isArray(liste)) {
    return "";
  }
  if (rang === 1) {
    return "Premiere place";
  }
  if (rang === 0) {
    if (liste.length < TAILLE_TABLEAU) {
      return "";
    }
    const dernier = Number(liste[liste.length - 1].score);
    return "Il manque " + formaterScore(id, dernier - score + 1) + " pour entrer";
  }
  // La place juste au-dessus est celle qui precede le rang atteint
  const suivante = Number(liste[rang - 2].score);
  return "Rang " + rang + ", a " + formaterScore(id, suivante - score + 1) + " de la place " + (rang - 1);
}

// Pour les jeux ou le meilleur score est le plus bas, un rang en cours de
// partie n'aurait aucun sens : le score n'est connu qu'a la fin. On se
// contente donc d'annoncer le record a battre.
function texteDuRecord(liste, id) {
  if (!Array.isArray(liste) || liste.length === 0) {
    return "Aucun record";
  }
  return "Record a battre " + formaterScore(id, Number(liste[0].score));
}

// ---------------------------------------------------------------------
// Mise a jour complete
// ---------------------------------------------------------------------

function redessiner() {
  if (!panneauxOuverts || idClassementCourant === null) {
    return;
  }
  const id = idClassementCourant;
  const locaux = meilleursScores(id);
  const plusBas = plusBasEstMieuxPour(id);
  // Un rang provisoire n'a de sens que pour un score qui monte
  const avecRang = !plusBas && typeof scoreCourant === "number" && scoreCourant > 0;

  const compact = enModeCompact();
  const rangL = dessinerListe(listeLocale, locaux, id, scoreCourant, avecRang, compact);
  const rangE = dessinerListe(listeEnLigne, scoresEnLigne, id, scoreCourant, avecRang, compact);

  if (plusBas) {
    rangLocal.textContent = texteDuRecord(locaux, id);
    rangEnLigne.textContent = texteDuRecord(scoresEnLigne, id);
  } else if (avecRang) {
    rangLocal.textContent = texteDuRang(locaux, id, scoreCourant, rangL);
    rangEnLigne.textContent = texteDuRang(scoresEnLigne, id, scoreCourant, rangE);
  } else {
    rangLocal.textContent = "";
    rangEnLigne.textContent = "";
  }

  const premiere = avecRang && (rangL === 1 || rangE === 1);
  panneauLocal.classList.toggle("premiere-place", avecRang && rangL === 1);
  panneauEnLigne.classList.toggle("premiere-place", avecRang && rangE === 1);
  if (premiere && !premierePlaceAnnoncee) {
    premierePlaceAnnoncee = true;
  }
  if (!premiere) {
    premierePlaceAnnoncee = false;
  }
}

// Charge la liste en ligne une seule fois par identifiant de classement
function chargerEnLigneSiBesoin(id) {
  if (idEnLigneCharge === id) {
    return;
  }
  idEnLigneCharge = id;
  scoresEnLigne = undefined;
  lireClassementEnLigne(id).then(scores => {
    // Le joueur a pu changer de difficulte entre-temps
    if (idEnLigneCharge === id) {
      scoresEnLigne = scores;
      redessiner();
    }
  });
}

function changerDeClassement(id) {
  if (id === idClassementCourant) {
    return;
  }
  idClassementCourant = id;
  scoreCourant = null;
  premierePlaceAnnoncee = false;
  chargerEnLigneSiBesoin(id);
}

// ---------------------------------------------------------------------
// Interface utilisee par arcade.js et par les jeux
// ---------------------------------------------------------------------

// A l'ouverture d'un jeu : on place les panneaux et on charge la liste
export function ouvrirPanneaux(idJeu, idClassement) {
  panneauxOuverts = true;
  scoreCourant = null;
  premierePlaceAnnoncee = false;
  idClassementCourant = null;
  placerPourLeJeu(idJeu);
  montrer(ecranAssezLarge());
  changerDeClassement(idClassement);
  redessiner();
  effacerSiLeJeuNyTientPas();
}

export function fermerPanneaux() {
  panneauxOuverts = false;
  montrer(false);
  replacerAuxBords();
  scoreCourant = null;
  idClassementCourant = null;
}

// Appelee par les jeux a chaque changement de score. C'est le seul point
// d'entree : elle recible les panneaux si la difficulte a change.
export function majScoreCourant(idClassement, score) {
  if (!panneauxOuverts) {
    return;
  }
  changerDeClassement(idClassement);
  scoreCourant = score;
  redessiner();
}

// En fin de partie, le classement en ligne a change : on le relit
export function rafraichirApresPartie(idClassement) {
  if (idClassement !== idEnLigneCharge) {
    return;
  }
  idEnLigneCharge = null;
  chargerEnLigneSiBesoin(idClassement);
}

// La largeur de la fenetre decide de l'affichage, pas le jeu
window.addEventListener("resize", function () {
  if (panneauxOuverts) {
    montrer(ecranAssezLarge());
    effacerSiLeJeuNyTientPas();
  }
});
