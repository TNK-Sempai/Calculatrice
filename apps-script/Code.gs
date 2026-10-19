// =====================================================================
//  TANUKI ARCADE - classement en ligne sur Google Apps Script
//  A coller dans un projet Apps Script lie a une feuille de calcul.
//  La feuille sert de base : un onglet "scores" suffit.
//
//  Deploiement : Deployer > Nouveau deploiement > Application web
//    Executer en tant que : moi
//    Acces : tout le monde
//  Copier l'URL /exec obtenue dans js/classement.js
// =====================================================================

const ONGLET_SCORES = "scores";
const TAILLE_CLASSEMENT = 10;
const ENVOIS_MAX_PAR_HEURE = 30;
const LONGUEUR_PSEUDO = 9;
// Un envoi identique dans cet intervalle est considere comme un doublon
const SECONDES_ANTI_DOUBLON = 60;

// Sens du tri et bornes de plausibilite, un par classement.
// "bas" signifie que le petit score gagne (un temps, des billes restantes).
const JEUX = {
  "snake":            { sens: "haut", min: 1,   max: 5000 },
  "tetris":           { sens: "haut", min: 1,   max: 2000000 },
  "2048":             { sens: "haut", min: 1,   max: 5000000 },
  "solitaire":        { sens: "bas",  min: 1,   max: 32 },
  "blackjack":        { sens: "haut", min: 1,   max: 1000000 },
  "casse-briques":    { sens: "haut", min: 1,   max: 500000 },
  "invaders":         { sens: "haut", min: 1,   max: 500000 },
  "mahjong":          { sens: "bas",  min: 60,  max: 36000 },
  "sudoku-facile":    { sens: "bas",  min: 60,  max: 36000 },
  "sudoku-moyen":     { sens: "bas",  min: 90,  max: 36000 },
  "sudoku-difficile": { sens: "bas",  min: 120, max: 36000 },
  "sudoku-extreme":   { sens: "bas",  min: 150, max: 36000 },
  "pong":             { sens: "haut", min: 1,   max: 2000000 },
  "demineur-facile":  { sens: "bas",  min: 1,   max: 36000 },
  "demineur-moyen":   { sens: "bas",  min: 5,   max: 36000 },
  "demineur-difficile": { sens: "bas", min: 10, max: 36000 },
  "dames-facile":     { sens: "haut", min: 1,   max: 1000000 },
  "dames-moyen":      { sens: "haut", min: 1,   max: 1000000 },
  "dames-difficile":  { sens: "haut", min: 1,   max: 1000000 },
  "puissance4-facile":    { sens: "haut", min: 1, max: 1000000 },
  "puissance4-moyen":     { sens: "haut", min: 1, max: 1000000 },
  "puissance4-difficile": { sens: "haut", min: 1, max: 1000000 },
  "tanukiland":       { sens: "haut", min: 1,   max: 10000000 },
  // V2
  "yokai-invaders":   { sens: "haut", min: 1,   max: 5000000 },
  "bake-danuki":      { sens: "haut", min: 1,   max: 5000000 },
  "tetris-sprint":    { sens: "bas",  min: 15000, max: 3600000 },
  "mahjong-pagode":   { sens: "bas",  min: 30,  max: 36000 },
  "mahjong-pont":     { sens: "bas",  min: 30,  max: 36000 },
  "mahjong-dragon":   { sens: "bas",  min: 30,  max: 36000 },
  "solitaire-europeen":    { sens: "bas", min: 1, max: 36 },
  "solitaire-asymetrique": { sens: "bas", min: 1, max: 38 },
  "solitaire-triangle":    { sens: "bas", min: 1, max: 14 },
  // V2, nouveaux jeux
  "karasu":           { sens: "haut", min: 1,   max: 5000000 },
  "bunbuku":          { sens: "haut", min: 1,   max: 5000000 },
  "kappa":            { sens: "haut", min: 1,   max: 5000000 },
  "tanuki-run":       { sens: "haut", min: 1,   max: 1000000 },
  "flappy-tengu":     { sens: "haut", min: 1,   max: 10000 },
  "pagode":           { sens: "haut", min: 1,   max: 5000 },
  "gassen":           { sens: "haut", min: 1,   max: 20000 },
  "omamori":          { sens: "haut", min: 1,   max: 1000000000 },
  "toro":             { sens: "haut", min: 1,   max: 1000000000 },
  "motus-5":          { sens: "haut", min: 1,   max: 1000000 },
  "motus-6":          { sens: "haut", min: 1,   max: 1000000 },
  "motus-7":          { sens: "haut", min: 1,   max: 1000000 },
  "motus-8":          { sens: "haut", min: 1,   max: 1000000 },
  "oekaki-5":         { sens: "bas",  min: 5,   max: 36000 },
  "oekaki-10":        { sens: "bas",  min: 5,   max: 36000 },
  "oekaki-15":        { sens: "bas",  min: 5,   max: 36000 },
  "go-facile":        { sens: "haut", min: 5,   max: 900 },
  "go-moyen":         { sens: "haut", min: 5,   max: 900 },
  "go-difficile":     { sens: "haut", min: 5,   max: 900 },
  "oshidashi-facile":    { sens: "haut", min: 100, max: 1000 },
  "oshidashi-moyen":     { sens: "haut", min: 100, max: 1000 },
  "oshidashi-difficile": { sens: "haut", min: 100, max: 1000 },
  "koikoi":           { sens: "haut", min: 1,   max: 600 },
  "pachinko":         { sens: "haut", min: 1,   max: 100000 },
  "matsuri":          { sens: "haut", min: 1,   max: 50000000 },
  "shogi-facile":     { sens: "haut", min: 1,   max: 100000 },
  "shogi-moyen":      { sens: "haut", min: 1,   max: 100000 },
  "shogi-difficile":  { sens: "haut", min: 1,   max: 100000 },
  "taiko":            { sens: "haut", min: 1,   max: 100000000 },
  "bulles":           { sens: "haut", min: 1,   max: 1000000000 }
};

// Les grilles du jour ont un classement par date : "sudoku-jour-2026-10-18".
// Plutot que d'en declarer une infinite, on reconnait leur forme.
function reglesDuJeu(jeu) {
  if (JEUX[jeu]) {
    return JEUX[jeu];
  }
  if (/^sudoku-jour-\d{4}-\d{2}-\d{2}$/.test(jeu)) {
    return { sens: "bas", min: 30, max: 36000 };
  }
  if (/^demineur-jour-\d{4}-\d{2}-\d{2}$/.test(jeu)) {
    return { sens: "bas", min: 5, max: 36000 };
  }
  if (/^motus-jour-[5-8]-\d{4}-\d{2}-\d{2}$/.test(jeu)) {
    return { sens: "haut", min: 1, max: 20000 };
  }
  return null;
}

// ---------------------------------------------------------------------
// Points d'entree
// ---------------------------------------------------------------------

function doGet(evenement) {
  const jeu = (evenement.parameter && evenement.parameter.jeu) || "";
  if (!reglesDuJeu(jeu)) {
    return reponseJson({ erreur: "Jeu inconnu" });
  }
  return reponseJson({ jeu: jeu, sens: reglesDuJeu(jeu).sens, scores: meilleursScores(jeu) });
}

function doPost(evenement) {
  let corps;
  try {
    corps = JSON.parse(evenement.postData.contents);
  } catch (erreur) {
    return reponseJson({ erreur: "Corps illisible" });
  }

  const jeu = String(corps.jeu || "");
  const regles = reglesDuJeu(jeu);
  if (!regles) {
    return reponseJson({ erreur: "Jeu inconnu" });
  }

  const score = Math.round(Number(corps.score));
  if (!isFinite(score) || score < regles.min || score > regles.max) {
    return reponseJson({ erreur: "Score hors des valeurs plausibles" });
  }

  // Pseudo alphanumerique, en majuscules
  let nom = String(corps.nom || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, LONGUEUR_PSEUDO);
  if (nom === "") {
    nom = "AAA";
  }

  // Le verrou evite que deux envois simultanes s'ecrasent
  const verrou = LockService.getScriptLock();
  try {
    verrou.waitLock(8000);
  } catch (erreur) {
    return reponseJson({ erreur: "Serveur occupe" });
  }

  try {
    const feuille = feuilleScores();
    const empreinte = empreinteVisiteur(corps.marqueur);

    if (envoisRecents(feuille, empreinte) >= ENVOIS_MAX_PAR_HEURE) {
      return reponseJson({ erreur: "Trop d envois, reessaie plus tard" });
    }

    // Le navigateur peut renvoyer deux fois le meme score quand la reponse
    // du premier envoi n'a pas pu etre lue. On ne l'ecrit qu'une fois.
    if (dejaEnregistre(feuille, jeu, nom, score, empreinte)) {
      return reponseJson({ enregistre: false, doublon: true, jeu: jeu, scores: meilleursScores(jeu) });
    }

    feuille.appendRow([jeu, nom, score, new Date(), empreinte]);
    return reponseJson({ enregistre: true, jeu: jeu, scores: meilleursScores(jeu) });
  } finally {
    verrou.releaseLock();
  }
}

// ---------------------------------------------------------------------
// Feuille
// ---------------------------------------------------------------------

function feuilleScores() {
  const classeur = SpreadsheetApp.getActiveSpreadsheet();
  let feuille = classeur.getSheetByName(ONGLET_SCORES);
  if (feuille === null) {
    feuille = classeur.insertSheet(ONGLET_SCORES);
    feuille.appendRow(["jeu", "nom", "score", "date", "empreinte"]);
  }
  return feuille;
}

function lignes(feuille) {
  const dernier = feuille.getLastRow();
  if (dernier < 2) {
    return [];
  }
  return feuille.getRange(2, 1, dernier - 1, 5).getValues();
}

function meilleursScores(jeu) {
  const sens = reglesDuJeu(jeu).sens;
  return lignes(feuilleScores())
    .filter(ligne => ligne[0] === jeu)
    .map(ligne => ({
      nom: String(ligne[1]),
      score: Number(ligne[2]),
      date: Utilities.formatDate(new Date(ligne[3]), "Europe/Brussels", "yyyy-MM-dd")
    }))
    .sort((a, b) => sens === "bas" ? a.score - b.score : b.score - a.score)
    .slice(0, TAILLE_CLASSEMENT);
}

// Meme jeu, meme pseudo, meme score, meme visiteur, il y a moins d'une minute
function dejaEnregistre(feuille, jeu, nom, score, empreinte) {
  const limite = Date.now() - SECONDES_ANTI_DOUBLON * 1000;
  return lignes(feuille).some(ligne =>
    String(ligne[0]) === jeu
    && String(ligne[1]) === nom
    && Number(ligne[2]) === score
    && String(ligne[4]) === empreinte
    && new Date(ligne[3]).getTime() > limite);
}

function envoisRecents(feuille, empreinte) {
  const limite = Date.now() - 3600 * 1000;
  return lignes(feuille)
    .filter(ligne => String(ligne[4]) === empreinte && new Date(ligne[3]).getTime() > limite)
    .length;
}

// Apps Script ne donne pas l'adresse IP. On se contente d'un marqueur
// envoye par le navigateur : cela limite les envois repetes sans
// identifier personne.
function empreinteVisiteur(marqueur) {
  const brut = String(marqueur || "anonyme");
  const octets = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, brut);
  return octets.map(octet => (octet & 0xFF).toString(16).padStart(2, "0")).join("").slice(0, 32);
}

function reponseJson(donnees) {
  return ContentService
    .createTextOutput(JSON.stringify(donnees))
    .setMimeType(ContentService.MimeType.JSON);
}