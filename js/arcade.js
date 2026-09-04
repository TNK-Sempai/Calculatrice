// =====================================================================
//  ARCADE - noyau commun a tous les jeux caches
//  Contient : le registre des jeux et de leurs codes secrets,
//  la bascule calculatrice / jeu, le menu et le tableau des scores.
//  Chaque jeu s'ajoute en appelant enregistrerJeu() depuis son fichier.
// =====================================================================

// ===== Elements de la page =====
const calculatrice = document.getElementById("calculatrice");
const zoneScores = document.getElementById("scores");
const zoneScoresTitre = document.getElementById("scoresTitre");
const zoneScoresListe = document.getElementById("scoresListe");
const zoneScoresSaisie = document.getElementById("scoresSaisie");
const champNom = document.getElementById("scoresNom");
const boutonValiderNom = document.getElementById("scoresValider");
const boutonRejouer = document.getElementById("scoresRejouer");
const boutonQuitterScores = document.getElementById("scoresQuitter");
const menuArcade = document.getElementById("menuArcade");
const menuListe = document.getElementById("menuListe");
const boutonFermerMenu = document.getElementById("menuFermer");
const titreCalculatrice = document.getElementById("titreCalculatrice");

// ===== Etat partage =====
let jeuActif = null;        // identifiant du jeu en cours, null sur la calculatrice
let overlayOuvert = false;  // vrai quand le menu ou le tableau des scores est ouvert

const CODE_MENU = "1337";
const CLE_SCORES = "tanuki-arcade-scores";
const TAILLE_TABLEAU = 10;
const LONGUEUR_PSEUDO = 9;

// ---------------------------------------------------------------------
// Registre des jeux
// ---------------------------------------------------------------------

// Chaque jeu fournit : id, nom affiche, code secret, sa section HTML,
// une fonction demarrer() et le libelle de son score.
const jeux = [];

function enregistrerJeu(jeu) {
  jeux.push(jeu);
}

// Un jeu peut avoir plusieurs classements ("sudoku-facile", "sudoku-extreme"),
// on retrouve alors le jeu parent par son prefixe.
function jeuParId(id) {
  return jeux.find(jeu => jeu.id === id)
    || jeux.find(jeu => id.startsWith(jeu.id + "-"))
    || null;
}

// ---------------------------------------------------------------------
// Codes secrets
// ---------------------------------------------------------------------

// Renvoie vrai si l'expression correspond a un code secret et lance l'action.
// Accepte le code seul, ou suivi d'un operateur, ou reutilise via "ans".
function verifierCodeSecret(expression) {
  const premier = expression[0];
  const suiviValide = expression.length === 1
    || (expression.length === 2 && ["+", "-", "*", "/"].includes(expression[1]));

  if (!suiviValide) {
    return false;
  }

  const correspond = code => premier === code
    || (premier === "ans" && dernierResultat === Number(code));

  if (correspond(CODE_MENU)) {
    ouvrirMenu();
    return true;
  }

  for (const jeu of jeux) {
    if (correspond(jeu.code)) {
      ouvrirJeu(jeu.id);
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------
// Bascule calculatrice / jeu
// ---------------------------------------------------------------------

function ouvrirJeu(id) {
  const jeu = jeuParId(id);
  if (jeu === null) {
    return;
  }
  fermerMenu();
  masquerScores();
  calculatrice.hidden = true;
  jeux.forEach(autre => { autre.section.hidden = autre.id !== id; });
  jeuActif = id;
  jeu.demarrer();
}

function quitterJeu() {
  const jeu = jeuParId(jeuActif);
  if (jeu !== null && typeof jeu.arreter === "function") {
    jeu.arreter();
  }
  jeux.forEach(autre => { autre.section.hidden = true; });
  masquerScores();
  jeuActif = null;
  calculatrice.hidden = false;
  effacerTout();
}

// ---------------------------------------------------------------------
// Menu arcade
// ---------------------------------------------------------------------

function ouvrirMenu() {
  menuListe.innerHTML = "";
  jeux.forEach(jeu => {
    const idClassement = typeof jeu.classement === "function" ? jeu.classement() : jeu.id;
    const meilleur = meilleursScores(idClassement)[0];
    const ligne = document.createElement("li");

    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.className = "menu-jeu";
    bouton.addEventListener("click", () => ouvrirJeu(jeu.id));

    const nom = document.createElement("span");
    nom.className = "menu-nom";
    nom.textContent = jeu.nom;

    const details = document.createElement("span");
    details.className = "menu-details";
    details.textContent = meilleur
      ? "code " + jeu.code + "  -  record " + meilleur.nom + " " + formaterScore(idClassement, meilleur.score)
      : "code " + jeu.code + "  -  aucun record";

    bouton.append(nom, details);
    ligne.appendChild(bouton);
    menuListe.appendChild(ligne);
  });

  menuArcade.hidden = false;
  overlayOuvert = true;
}

function fermerMenu() {
  menuArcade.hidden = true;
  if (zoneScores.hidden) {
    overlayOuvert = false;
  }
}

// Appui long sur le titre : ouvre le menu sans connaitre de code
let chronoAppuiLong = null;

function demarrerAppuiLong() {
  chronoAppuiLong = setTimeout(ouvrirMenu, 1500);
}

function annulerAppuiLong() {
  clearTimeout(chronoAppuiLong);
}

titreCalculatrice.addEventListener("mousedown", demarrerAppuiLong);
titreCalculatrice.addEventListener("mouseup", annulerAppuiLong);
titreCalculatrice.addEventListener("mouseleave", annulerAppuiLong);
titreCalculatrice.addEventListener("touchstart", demarrerAppuiLong, { passive: true });
titreCalculatrice.addEventListener("touchend", annulerAppuiLong);
boutonFermerMenu.addEventListener("click", function () {
  fermerMenu();
  if (jeuActif === null) {
    calculatrice.hidden = false;
  }
});

// ---------------------------------------------------------------------
// Tableau des meilleurs scores
// Stockage local pour l'instant. Pour un classement partage, seules
// lireScores et enregistrerScore ont besoin d'etre remplacees.
// ---------------------------------------------------------------------

let jeuAuScore = null;
let titreAuScore = null;
let scoreEnAttente = 0;
let saisieScoreOuverte = false;

function lireScores() {
  try {
    const brut = localStorage.getItem(CLE_SCORES);
    return brut === null ? {} : JSON.parse(brut);
  } catch (erreur) {
    return {};
  }
}

function ecrireScores(tous) {
  try {
    localStorage.setItem(CLE_SCORES, JSON.stringify(tous));
  } catch (erreur) {
    // stockage indisponible (navigation privee) : on continue sans sauvegarder
  }
}

function meilleursScores(id) {
  const tableau = lireScores()[id];
  return Array.isArray(tableau) ? tableau : [];
}

// Un score plus bas peut etre meilleur (billes restantes au solitaire)
function comparerScores(id, a, b) {
  const jeu = jeuParId(id);
  return jeu && jeu.plusBasEstMieux ? a - b : b - a;
}

function estDansLeTop(id, score) {
  const jeu = jeuParId(id);
  if (!jeu || score === null || score === undefined) {
    return false;
  }
  if (!jeu.plusBasEstMieux && score <= 0) {
    return false;
  }
  const tableau = meilleursScores(id);
  return tableau.length < TAILLE_TABLEAU
    || comparerScores(id, score, tableau[tableau.length - 1].score) < 0;
}

function enregistrerScore(id, nom, score) {
  const tous = lireScores();
  const entree = { nom, score, date: new Date().toISOString().slice(0, 10) };
  const tableau = Array.isArray(tous[id]) ? tous[id] : [];
  tableau.push(entree);
  tableau.sort((a, b) => comparerScores(id, a.score, b.score));
  tous[id] = tableau.slice(0, TAILLE_TABLEAU);
  ecrireScores(tous);
  return entree;
}

// Un jeu peut afficher ses scores autrement qu'en nombre brut (un temps par exemple)
function formaterScore(id, score) {
  const jeu = jeuParId(id);
  return jeu && typeof jeu.formaterScore === "function"
    ? jeu.formaterScore(score)
    : score.toLocaleString("fr-BE");
}

function afficherTableau(id, entreeRecente, titre) {
  const jeu = jeuParId(id);
  const tableau = meilleursScores(id);
  zoneScoresTitre.textContent = (titre || (jeu ? jeu.nom : "Arcade")) + " - high scores";
  zoneScoresListe.innerHTML = "";

  // Le tableau partage se remplit de son cote, sans bloquer l'affichage
  if (typeof afficherClassementEnLigne === "function" && !entreeRecente) {
    afficherClassementEnLigne(id);
  }

  if (tableau.length === 0) {
    const vide = document.createElement("li");
    vide.textContent = "Aucun score pour l'instant";
    zoneScoresListe.appendChild(vide);
    return;
  }

  tableau.forEach((entree, index) => {
    const ligne = document.createElement("li");
    if (entreeRecente && entree.nom === entreeRecente.nom && entree.score === entreeRecente.score) {
      ligne.classList.add("recent");
    }
    const rang = document.createElement("span");
    rang.className = "scores-rang";
    rang.textContent = String(index + 1).padStart(2, "0");
    const nom = document.createElement("span");
    nom.className = "scores-nom";
    nom.textContent = entree.nom;
    const points = document.createElement("span");
    points.textContent = formaterScore(id, entree.score);
    ligne.append(rang, nom, points);
    zoneScoresListe.appendChild(ligne);
  });
}

// Appelee par chaque jeu quand la partie est terminee
function finDePartie(id, score, titre) {
  jeuAuScore = id;
  scoreEnAttente = score;
  titreAuScore = titre || null;
  zoneScores.hidden = false;
  overlayOuvert = true;

  if (estDansLeTop(id, score)) {
    saisieScoreOuverte = true;
    zoneScoresSaisie.hidden = false;
    champNom.value = "";
    afficherTableau(id, null, titreAuScore);
    champNom.focus();
  } else {
    saisieScoreOuverte = false;
    zoneScoresSaisie.hidden = true;
    afficherTableau(id, null, titreAuScore);
  }
}

function validerNom() {
  if (!saisieScoreOuverte) {
    return;
  }
  const saisie = champNom.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, LONGUEUR_PSEUDO);
  const nom = saisie || "AAA";
  const entree = enregistrerScore(jeuAuScore, nom, scoreEnAttente);
  // Envoi au classement partage, s'il est configure
  if (typeof envoyerScore === "function") {
    envoyerScore(jeuAuScore, nom, scoreEnAttente);
  }
  saisieScoreOuverte = false;
  zoneScoresSaisie.hidden = true;
  afficherTableau(jeuAuScore, entree, titreAuScore);
}

function masquerScores() {
  zoneScores.hidden = true;
  zoneScoresSaisie.hidden = true;
  saisieScoreOuverte = false;
  if (menuArcade.hidden) {
    overlayOuvert = false;
  }
}

boutonValiderNom.addEventListener("click", validerNom);

boutonRejouer.addEventListener("click", function () {
  validerNom();
  const jeu = jeuParId(jeuAuScore);
  masquerScores();
  if (jeu !== null) {
    ouvrirJeu(jeu.id);
  }
});

boutonQuitterScores.addEventListener("click", function () {
  validerNom();
  masquerScores();
  quitterJeu();
});

champNom.addEventListener("keydown", function (evenement) {
  evenement.stopPropagation();
  if (evenement.key === "Enter") {
    validerNom();
  }
});

// Echap ferme les overlays
document.addEventListener("keydown", function (evenement) {
  if (evenement.key !== "Escape" || !overlayOuvert) {
    return;
  }
  evenement.preventDefault();
  if (!zoneScores.hidden) {
    validerNom();
    masquerScores();
    quitterJeu();
  } else {
    fermerMenu();
  }
});