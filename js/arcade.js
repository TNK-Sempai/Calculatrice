// =====================================================================
//  ARCADE - noyau commun a tous les jeux caches
//  Contient : le registre des jeux et de leurs codes secrets,
//  la bascule calculatrice / jeu, le menu et le tableau des scores.
//  Chaque jeu s'ajoute en appelant enregistrerJeu() depuis son fichier.
// =====================================================================

import { dernierResultat, effacerTout } from "./calculatrice.js";
import { imprimerCode } from "./ruban.js";
import { mesurer } from "./consentement.js";
import { afficherManette, masquerManette } from "./noyau/manette.js";
import { afficherClassementEnLigne, envoyerScore, classementFrais, classementEnCache, oublierCache } from "./classement.js";
import {
  ouvrirPanneaux, fermerPanneaux, majScoreCourant as majPanneaux, rafraichirApresPartie
} from "./panneaux-classement.js";

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
const ecranCalculatrice = document.querySelector(".ecran");
const menuProgression = document.getElementById("menuProgression");
const menuJauge = document.getElementById("menuJauge");
const compteurSecrets = document.getElementById("compteurSecrets");
const carteTitre = document.getElementById("carteTitre");
const carteCode = document.getElementById("carteCode");
const carteJp = document.getElementById("carteJp");
const carteNom = document.getElementById("carteNom");
const cartePitch = document.getElementById("cartePitch");
const carteTop = document.getElementById("carteTop");
const carteTopTitre = document.getElementById("carteTopTitre");
const cartePerso = document.getElementById("cartePerso");
const carteRang = document.getElementById("carteRang");

// ===== Etat partage =====
export let jeuActif = null;        // identifiant du jeu en cours, null sur la calculatrice
export let overlayOuvert = false;  // vrai quand le menu ou le tableau des scores est ouvert

const CODE_MENU = "1337";
const CLE_SCORES = "tanuki-arcade-scores";
const CLE_CODES = "tanuki-arcade-codes";
const CLE_PSEUDO = "tanuki-arcade-pseudo";
const TAILLE_TABLEAU = 10;
const LONGUEUR_PSEUDO = 9;

// ---------------------------------------------------------------------
// Registre des jeux
// ---------------------------------------------------------------------

// Chaque jeu fournit : id, nom affiche, code secret, sa section HTML,
// une fonction demarrer() et le libelle de son score.
// Un jeu marque cache: true garde son code secret mais ne parait pas
// dans le menu et n'a pas de panneaux de classement. C'est ce qui permet
// de travailler sur un jeu en chantier sans l'exposer.
const jeux = [];

export function enregistrerJeu(jeu) {
  jeux.push(jeu);
}

// Ce que l'arcade sait de chaque jeu en plus de ce qu'il declare :
// son nom japonais, l'enigme qui remplace son code tant qu'on ne l'a
// pas trouve, et un nom accentue pour l'affichage. Les fichiers des jeux
// n'ont pas besoin d'etre touches pour ajouter une fiche.
const FICHES = {
  snake: { jp: "スネーク", pitch: "Le serpent qui grandit à chaque bouchée.", enigme: "Le premier code de tous, celui de Lass. Six chiffres, il commence par 7." },
  tetris: { jp: "テトリス", pitch: "Les pièces tombent, complète les lignes.", enigme: "L'autre code d'origine. Neuf chiffres qui commencent par 321." },
  "2048": { nom: "2048", jp: "進化", pitch: "Fais glisser, fusionne les tuiles jusqu'à 2048.", enigme: "Ce jeu porte son code dans son nom." },
  solitaire: { nom: "Solitaire", jp: "石跳び", pitch: "Saute par-dessus les billes jusqu'à n'en garder qu'une.", enigme: "Compte les trous du plateau à billes." },
  blackjack: { jp: "ブラックジャック", pitch: "Approche-toi de 21 sans jamais le dépasser.", enigme: "Le total qu'il ne faut jamais dépasser." },
  "casse-briques": { nom: "Casse-briques", jp: "瓦割り", pitch: "Une raquette, une balle, un mur de tuiles à casser.", enigme: "L'année où Atari a cassé ses premières briques." },
  sudoku: { jp: "数独", pitch: "Chaque chiffre une seule fois par ligne, colonne et carré.", enigme: "Tous les chiffres d'une ligne, dans l'ordre." },
  "yokai-invaders": { nom: "Yōkai Invaders", jp: "妖怪インベーダー", pitch: "Le Space Invaders des yōkai : tire avant qu'ils n'atterrissent.", enigme: "L'année où les envahisseurs de Taito ont débarqué." },
  "bake-danuki": { nom: "Pac-Tanuki", jp: "化け狸", pitch: "Le Pac-Man du tanuki : mange tout, fuis les yōkai.", enigme: "L'année où un rond jaune a commencé à manger des pac-gommes." },
  mahjong: { nom: "Mahjong", jp: "麻雀", pitch: "Le solitaire de tuiles : retire-les par paires.", enigme: "Le nombre de tuiles d'un jeu complet." },
  pong: { nom: "Pong", jp: "羽根突き", pitch: "Le tout premier jeu d'arcade, raquette contre raquette.", enigme: "L'année du tout premier échange d'Atari." },
  demineur: { nom: "Démineur", jp: "マインスイーパ", pitch: "Ouvre les cases sans tomber sur une mine.", enigme: "Une année des sixties. Le reste, à toi de le déminer." },
  dames: { jp: "チェッカー", pitch: "Les dames internationales, contre l'ordinateur ou à deux.", enigme: "Le nombre de cases sur un côté du damier international." },
  puissance4: { jp: "四目並べ", pitch: "Aligne quatre jetons avant l'adversaire.", enigme: "Quatre, quatre fois." },
  tanukiland: { jp: "狸の国", pitch: "Un jeu de plateforme façon Mario, version tanuki.", enigme: "TANUKI, tapé sur le clavier d'un vieux téléphone." },
  // V2 : nouveaux jeux
  motus: { jp: "言葉", pitch: "Trouve le mot caché en six essais.", enigme: "L'année où le jeu des mots en couleurs a débuté à la télé française." },
  toro: { nom: "Lights Out", jp: "灯籠", pitch: "Chaque lanterne touchée bascule ses voisines : éteins tout.", enigme: "Le nombre de lanternes du jardin : cinq rangées de cinq." },
  oekaki: { nom: "Picross", jp: "お絵かき", pitch: "Noircis les bonnes cases grâce aux chiffres, un dessin apparaît.", enigme: "L'année où une graphiste japonaise a inventé les grilles à colorier par logique." },
  "tanuki-run": { jp: "走れ狸", pitch: "Le jeu du dinosaure de Chrome : saute, cours, ne t'arrête pas.", enigme: "L'année où un dinosaure s'est mis à courir quand internet tombe." },
  "flappy-tengu": { jp: "天狗", pitch: "Le Flappy Bird du tengu : tape pour passer entre les torii.", enigme: "L'année où un petit oiseau a rendu le monde fou à coups de tapotements." },
  pagode: { nom: "Stack", jp: "五重塔", pitch: "Empile les étages au bon moment, le plus haut possible.", enigme: "L'année où l'on empilait des blocs au bon moment sur tous les téléphones." },
  karasu: { nom: "Galaxian", jp: "烏天狗", pitch: "Le shoot'em up façon Galaga : les corbeaux plongent sur toi.", enigme: "L'année où des abeilles de Namco capturaient les vaisseaux." },
  bunbuku: { nom: "Asteroids", jp: "分福茶釜", pitch: "Tourne, pousse, tire : fais éclater les rochers.", enigme: "L'année où un vaisseau triangulaire a fait exploser les rochers d'Atari." },
  kappa: { nom: "Frogger", jp: "河童", pitch: "Traverse la route puis la rivière sans te faire écraser.", enigme: "L'année de la grenouille qui traverse la route, lue à l'envers." },
  go: { jp: "囲碁", pitch: "Le jeu de go sur un petit plateau, contre l'ordinateur.", enigme: "Les intersections d'un petit goban : neuf fois neuf." },
  koikoi: { nom: "Koi-Koi", jp: "花札", pitch: "Le jeu de cartes japonais : forme des combinaisons de fleurs.", enigme: "Le nombre de cartes d'un jeu de hanafuda." },
  oshidashi: { nom: "Abalone", jp: "押し出し", pitch: "Pousse six billes adverses hors du plateau.", enigme: "Les billes de chaque camp au début de la partie." },
  pachinko: { jp: "パチンコ", pitch: "Lance les billes, vise les poches, fais tourner la roulette.", enigme: "La combinaison qui fait pleuvoir les billes." },
  matsuri: { nom: "Flipper", jp: "祭り", pitch: "Un vrai flipper : rampes, bumpers, multiball.", enigme: "L'année du premier flipper à pièces, encore sans flippers." },
  gassen: { nom: "Tanuki Worms", jp: "狸合戦", pitch: "Le Worms des tanuki : vise, tiens compte du vent, tire.", enigme: "L'année où des vers de terre se sont déclaré la guerre au bazooka." },
  shogi: { nom: "Shōgi", jp: "将棋", pitch: "Les échecs japonais : les pièces prises changent de camp.", enigme: "Le nombre de pièces sur le plateau au début d'une partie." },
  taiko: { nom: "Taiko", jp: "太鼓", pitch: "Frappe le tambour en rythme : don au centre, ka sur le bord.", enigme: "Le tempo d'une marche, en battements par minute." },
  bulles: { nom: "Bubble Shooter", jp: "泡", pitch: "Vise et tire des bulles pour en grouper trois de la même couleur.", enigme: "L'année où deux petits dragons ont commencé à tirer des bulles." },
  omamori: { nom: "Omamori Crush", jp: "お守り", pitch: "Des niveaux sans fin : aligne les porte-bonheur, brise les sceaux, descends les lanternes.", enigme: "L'année où des joyaux s'alignaient par trois sur tous les écrans." }
};

function ficheDe(jeu) {
  return FICHES[jeu.id] || {};
}

function nomAffiche(jeu) {
  return ficheDe(jeu).nom || jeu.nom;
}

// Les jeux visibles dans le menu, ceux qui comptent dans le carnet
function jeuxPublics() {
  return jeux.filter(jeu => jeu.cache !== true);
}

// Les codes s'ecrivent groupes par trois au-dela de quatre chiffres
function codeLisible(code) {
  return code.length > 4 ? code.replace(/\B(?=(\d{3})+(?!\d))/g, "\u202F") : code;
}

// Un jeu peut avoir plusieurs classements ("sudoku-facile", "sudoku-extreme"),
// on retrouve alors le jeu parent par son prefixe.
function jeuParId(id) {
  // Sans identifiant valable (aucun jeu en cours par exemple), rien a trouver
  if (typeof id !== "string") {
    return null;
  }
  return jeux.find(jeu => jeu.id === id)
    || jeux.find(jeu => id.startsWith(jeu.id + "-"))
    || null;
}

// L'identifiant de classement du jeu, sa difficulte courante comprise
function idClassementDe(jeu) {
  return typeof jeu.classement === "function" ? jeu.classement() : jeu.id;
}

// Les panneaux lateraux en ont besoin pour savoir s'ils peuvent afficher
// un rang en cours de partie.
export function plusBasEstMieuxPour(id) {
  const jeu = jeuParId(id);
  return jeu !== null && jeu.plusBasEstMieux === true;
}

// ---------------------------------------------------------------------
// Codes secrets
// ---------------------------------------------------------------------

// Renvoie vrai si l'expression correspond a un code secret et lance l'action.
// Accepte le code seul, ou suivi d'un operateur, ou reutilise via "ans".
export function verifierCodeSecret(expression) {
  const premier = expression[0];
  const suiviValide = expression.length === 1
    || (expression.length === 2 && ["+", "-", "*", "/"].includes(expression[1]));

  if (!suiviValide) {
    return false;
  }

  const correspond = code => premier === code
    || (premier === "ans" && dernierResultat === Number(code));

  if (correspond(CODE_MENU)) {
    imprimerCode(CODE_MENU, "Arcade", "ゲームセンター");
    ouvrirMenu();
    return true;
  }

  for (const jeu of jeux) {
    if (correspond(jeu.code)) {
      const nouveau = marquerDecouvert(jeu.id);
      // Decouvert veut dire trouve pour la premiere fois a la
      // calculatrice : retaper un code deja connu n'est pas une trouvaille
      if (nouveau) {
        mesurer({ event: "code_trouve", jeu: jeu.id });
      }
      imprimerCode(codeLisible(jeu.code), nomAffiche(jeu), ficheDe(jeu).jp);
      lancerAvecIntro(jeu, ecranCalculatrice.getBoundingClientRect(), jeu.code, nouveau);
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------
// Carnet de codes
// Un code compte comme trouve quand il a ete tape sur la calculatrice.
// Lancer un jeu depuis le menu ne le devoile pas.
// ---------------------------------------------------------------------

function lireDecouverts() {
  try {
    const brut = localStorage.getItem(CLE_CODES);
    if (brut === null) {
      // Premier passage en V2 : un jeu deja joue a forcement ete trouve
      const deja = [];
      Object.keys(lireScores()).forEach(id => {
        const jeu = jeuParId(id);
        if (jeu !== null && !deja.includes(jeu.id)) {
          deja.push(jeu.id);
        }
      });
      ecrireDecouverts(deja);
      return deja;
    }
    const liste = JSON.parse(brut);
    return Array.isArray(liste) ? liste : [];
  } catch (erreur) {
    return [];
  }
}

function ecrireDecouverts(liste) {
  try {
    localStorage.setItem(CLE_CODES, JSON.stringify(liste));
  } catch (erreur) {
    // navigation privee : le carnet vit le temps de la page
  }
}

let decouverts = null;

function estDecouvert(id) {
  if (decouverts === null) {
    decouverts = lireDecouverts();
  }
  return decouverts.includes(id);
}

// Renvoie vrai si le code n'avait jamais ete trouve
function marquerDecouvert(id) {
  if (estDecouvert(id)) {
    return false;
  }
  decouverts.push(id);
  ecrireDecouverts(decouverts);
  majCompteur();
  return true;
}

function nombreDecouverts() {
  return jeuxPublics().filter(jeu => estDecouvert(jeu.id)).length;
}

// Le compteur de la facade reste invisible tant qu'aucun code n'est trouve
function majCompteur() {
  const total = jeuxPublics().length;
  const trouves = nombreDecouverts();
  if (trouves === 0 || total === 0) {
    compteurSecrets.hidden = true;
    return;
  }
  compteurSecrets.hidden = false;
  compteurSecrets.innerHTML = "";
  const nombre = document.createElement("strong");
  nombre.textContent = String(trouves);
  compteurSecrets.append(nombre, "/" + total + (trouves === total ? " secrets, tous" : " secrets"));
}

// Les jeux s'enregistrent pendant le chargement des modules : on attend
// qu'ils soient tous la pour compter
setTimeout(majCompteur, 0);

// ---------------------------------------------------------------------
// Ecran titre
// L'ecran de la calculatrice (ou la cartouche du menu) s'agrandit
// jusqu'a remplir la fenetre et devient l'ecran titre du jeu : son nom,
// le classement mondial, ton record et ton rang. Une touche ou un appui
// lance la partie.
// ---------------------------------------------------------------------

const DUREE_OUVERTURE = 520;
const TAILLE_TOP_CARTE = 5;
let introEnCours = null;   // { jeu, debut } pendant l'ecran titre

function mouvementReduit() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// ----- Le pseudo, retenu d'une partie a l'autre -----

function pseudo() {
  try {
    return localStorage.getItem(CLE_PSEUDO) || "";
  } catch (erreur) {
    return "";
  }
}

function memoriserPseudo(nom) {
  try {
    localStorage.setItem(CLE_PSEUDO, nom);
  } catch (erreur) {
    // sans stockage, on redemandera
  }
}

// Le Versus en ligne reprend le meme pseudo que les classements
export function pseudoArcade() {
  return pseudo();
}

export function memoriserPseudoArcade(nom) {
  memoriserPseudo(nom);
}

// Ton meilleur score sur cet appareil : sous ton pseudo s'il est connu
function recordPerso(idClassement) {
  const tableau = meilleursScores(idClassement);
  const moi = pseudo();
  return (moi ? tableau.find(entree => entree.nom === moi) : null) || tableau[0] || null;
}

// Ou ce score se placerait dans une liste triee
function rangDans(idClassement, liste, score) {
  const plusBas = plusBasEstMieuxPour(idClassement);
  const devant = liste.filter(entree => (plusBas ? Number(entree.score) < score : Number(entree.score) > score)).length;
  return devant + 1;
}

function remplirTop(idClassement, liste, enLigne) {
  carteTop.innerHTML = "";
  carteTopTitre.textContent = enLigne ? "Classement mondial" : "Sur cet appareil";
  const moi = pseudo();
  if (liste.length === 0) {
    const vide = document.createElement("li");
    vide.className = "carte-vide";
    vide.textContent = enLigne ? "Personne n'a encore joué. La place est libre." : "Aucune partie pour l'instant.";
    carteTop.appendChild(vide);
    return;
  }
  liste.slice(0, TAILLE_TOP_CARTE).forEach((entree, index) => {
    const ligne = document.createElement("li");
    if (moi && entree.nom === moi) {
      ligne.classList.add("moi");
    }
    const rang = document.createElement("span");
    rang.className = "carte-rang-num";
    rang.textContent = String(index + 1).padStart(2, "0");
    const nom = document.createElement("span");
    nom.className = "carte-nom-joueur";
    nom.textContent = entree.nom;
    const points = document.createElement("span");
    points.textContent = formaterScore(idClassement, Number(entree.score));
    ligne.append(rang, nom, points);
    carteTop.appendChild(ligne);
  });
}

function remplirPerso(idClassement, monde) {
  const record = recordPerso(idClassement);
  if (record === null) {
    cartePerso.textContent = "Pas encore de score";
    carteRang.textContent = monde && monde.length ? "Le 10e mondial est à " + formaterScore(idClassement, Number(monde[monde.length - 1].score)) : "";
    return;
  }
  cartePerso.textContent = formaterScore(idClassement, record.score);
  if (!monde) {
    carteRang.textContent = record.nom + ", record sur cet appareil";
    return;
  }
  const rang = rangDans(idClassement, monde, record.score);
  const dejaClasse = monde.some(entree => entree.nom === record.nom && Number(entree.score) === record.score);
  if (dejaClasse) {
    carteRang.textContent = rang === 1 ? "Tu es n°1 mondial. Défends ta place." : "Tu es " + rang + "e mondial. Le n°1 est à " + formaterScore(idClassement, Number(monde[0].score)) + ".";
  } else if (rang <= 10) {
    carteRang.textContent = "Ce score n'est pas encore envoyé. Il serait " + rang + "e mondial.";
  } else {
    carteRang.textContent = "Hors du top 10 : le 10e est à " + formaterScore(idClassement, Number(monde[monde.length - 1].score));
  }
}

function remplirCarte(jeu, code, nouveau) {
  const idClassement = idClassementDe(jeu);
  carteCode.textContent = code
    ? (nouveau ? "Nouveau code  " : "Code  ") + codeLisible(code)
    : "Depuis le menu";
  carteCode.classList.toggle("nouveau", nouveau === true);
  carteJp.textContent = ficheDe(jeu).jp || "";
  carteNom.textContent = nomAffiche(jeu);
  cartePitch.textContent = ficheDe(jeu).pitch || "";

  // Ce qu'on sait tout de suite, puis la version a jour quand elle arrive
  const cache = classementEnCache(idClassement);
  if (cache !== null) {
    remplirTop(idClassement, cache.scores, true);
    remplirPerso(idClassement, cache.scores);
  } else {
    remplirTop(idClassement, meilleursScores(idClassement), false);
    remplirPerso(idClassement, null);
  }
  classementFrais(idClassement).then(scores => {
    if (scores === null || introEnCours === null || introEnCours.jeu !== jeu) {
      return;
    }
    remplirTop(idClassement, scores, true);
    remplirPerso(idClassement, scores);
  });
}

function lancerAvecIntro(jeu, origine, code, nouveau) {
  if (introEnCours !== null) {
    return;
  }
  introEnCours = { jeu, debut: performance.now() };
  remplirCarte(jeu, code, nouveau);
  overlayOuvert = true;
  carteTitre.hidden = false;
  carteTitre.classList.remove("sortie", "pret");

  if (mouvementReduit() || typeof carteTitre.animate !== "function") {
    carteTitre.classList.add("pret");
    return;
  }

  // Le rectangle de depart, exprime en retraits depuis chaque bord
  const largeur = window.innerWidth;
  const hauteur = window.innerHeight;
  const depart = "inset(" + Math.max(0, origine.top) + "px " + Math.max(0, largeur - origine.right) + "px "
    + Math.max(0, hauteur - origine.bottom) + "px " + Math.max(0, origine.left) + "px round 12px)";
  carteTitre.animate(
    [{ clipPath: depart }, { clipPath: "inset(0px 0px 0px 0px round 0px)" }],
    { duration: DUREE_OUVERTURE, easing: "cubic-bezier(0.7, 0, 0.2, 1)", fill: "both" }
  ).finished.then(() => {
    if (introEnCours !== null && introEnCours.jeu === jeu) {
      carteTitre.classList.add("pret");
    }
  }).catch(() => {});
}

// lancer : vrai pour demarrer le jeu, faux pour revenir a la calculatrice
function terminerIntro(lancer) {
  if (introEnCours === null) {
    return;
  }
  const { jeu } = introEnCours;
  introEnCours = null;
  carteTitre.getAnimations().forEach(animation => animation.cancel());

  if (lancer) {
    ouvrirJeu(jeu.id);
    jeu.section.classList.remove("entree");
    void jeu.section.offsetWidth;
    jeu.section.classList.add("entree");
  } else {
    overlayOuvert = !menuArcade.hidden || !zoneScores.hidden;
    effacerTout();
  }
  carteTitre.classList.add("sortie");
  setTimeout(() => {
    if (introEnCours === null) {
      carteTitre.hidden = true;
      carteTitre.classList.remove("sortie", "pret");
    }
  }, 200);
}

// Pendant l'ecran titre, la touche qui lance la partie ne doit pas
// arriver jusqu'au jeu : on l'intercepte avant tout le monde.
window.addEventListener("keydown", function (evenement) {
  if (introEnCours === null) {
    return;
  }
  evenement.preventDefault();
  evenement.stopImmediatePropagation();
  // Un appui trop tot est sans doute le "=" qui vient d'etre tape
  if (performance.now() - introEnCours.debut < 250 || evenement.repeat) {
    return;
  }
  terminerIntro(evenement.key !== "Escape");
}, true);

carteTitre.addEventListener("pointerdown", function (evenement) {
  if (introEnCours === null || performance.now() - introEnCours.debut < 250) {
    return;
  }
  evenement.preventDefault();
  terminerIntro(true);
});

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
  mesurer({ event: "jeu_ouvert", jeu: id });
  // Un jeu cache n'a aucun panneau. On ferme avant de le demarrer :
  // ainsi rien de ce qu'il fait a son demarrage ne peut les rouvrir, et
  // la decision ne depend plus de l'ordre des appels.
  const avecPanneaux = jeu.cache !== true;
  fermerPanneaux();
  jeu.demarrer();
  // Sur telephone, les jeux d'action recoivent leur manette
  afficherManette(jeu.manette);
  if (avecPanneaux) {
    // L'identifiant de classement n'est connu qu'une fois le jeu demarre,
    // puisqu'il depend de la difficulte que le jeu vient de retablir.
    ouvrirPanneaux(jeu.id, idClassementDe(jeu));
  }
}

// Ouverture directe, sans ecran titre (lien d'invitation au Versus)
export function ouvrirJeuParId(id) {
  if (introEnCours !== null) {
    terminerIntro(false);
  }
  ouvrirJeu(id);
}

export function quitterJeu() {
  const jeu = jeuParId(jeuActif);
  if (jeu !== null && typeof jeu.arreter === "function") {
    jeu.arreter();
  }
  jeux.forEach(autre => { autre.section.hidden = true; });
  masquerScores();
  fermerPanneaux();
  masquerManette();
  jeuActif = null;
  effacerTout();
  // On revient au choix des jeux. La calculatrice reste derriere, et le
  // bouton Calculatrice du menu y ramene.
  ouvrirMenu();
}

// Depuis le menu : retour a la calculatrice
function revenirALaCalculatrice() {
  fermerMenu();
  calculatrice.hidden = false;
  calculatrice.classList.remove("retour");
  void calculatrice.offsetWidth;
  calculatrice.classList.add("retour");
}

// ---------------------------------------------------------------------
// Menu arcade
// ---------------------------------------------------------------------

function ouvrirMenu() {
  menuListe.innerHTML = "";
  const publics = jeuxPublics();
  const aCharger = [];
  const trouves = nombreDecouverts();

  publics.forEach((jeu, index) => {
    const idClassement = idClassementDe(jeu);
    const decouvert = estDecouvert(jeu.id);
    const fiche = ficheDe(jeu);

    const ligne = document.createElement("li");
    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.className = "cartouche" + (decouvert ? " decouverte" : "");
    bouton.addEventListener("click", () => lancerAvecIntro(jeu, bouton.getBoundingClientRect(), null, false));

    const haut = document.createElement("span");
    haut.className = "cart-haut";
    const numero = document.createElement("span");
    numero.className = "cart-num";
    numero.textContent = String(index + 1).padStart(2, "0");
    const jp = document.createElement("span");
    jp.className = "cart-jp";
    jp.lang = "ja";
    jp.textContent = fiche.jp || "";
    haut.append(numero, jp);

    const nom = document.createElement("span");
    nom.className = "cart-nom";
    nom.textContent = nomAffiche(jeu);

    const code = document.createElement("span");
    code.className = "cart-code";
    code.textContent = decouvert ? "Code " + codeLisible(jeu.code) : "Code " + "\u2022".repeat(Math.min(jeu.code.length, 9));

    const enigme = document.createElement("span");
    enigme.className = "cart-enigme";
    enigme.textContent = decouvert ? "" : "Indice : " + (fiche.enigme || "un nombre que la calculatrice reconnaitra.");

    // Ton record et le n°1 mondial, cote a cote
    const record = document.createElement("span");
    record.className = "cart-scores";
    const perso = recordPerso(idClassement);
    const lignePerso = ligneScore("Ton record", perso ? formaterScore(idClassement, perso.score) : "-", perso !== null);
    const cache = classementEnCache(idClassement);
    const ligneMonde = ligneScore("N°1 mondial", texteMonde(idClassement, cache ? cache.scores : null), false);
    ligneMonde.classList.add("monde");
    record.append(lignePerso, ligneMonde);
    aCharger.push({ idClassement, cible: ligneMonde.lastElementChild });

    // Ce que c'est, en clair, puis l'indice tant que le code n'est pas trouve
    const pitch = document.createElement("span");
    pitch.className = "cart-pitch";
    pitch.textContent = fiche.pitch || "";
    bouton.append(haut, nom, pitch, code);
    if (!decouvert) {
      bouton.appendChild(enigme);
    }
    bouton.appendChild(record);
    bouton.setAttribute("aria-label", nomAffiche(jeu) + (decouvert ? ", code " + jeu.code : ", code a trouver"));
    ligne.appendChild(bouton);
    menuListe.appendChild(ligne);
  });

  menuProgression.textContent = String(trouves).padStart(2, "0") + " / " + String(publics.length).padStart(2, "0") + " codes trouvés";
  menuJauge.style.width = (publics.length ? (trouves / publics.length) * 100 : 0) + "%";

  menuArcade.hidden = false;
  overlayOuvert = true;
  menuArcade.scrollTop = 0;
  chargerMondes(aCharger);
  const premier = menuListe.querySelector(".cartouche");
  if (premier !== null) {
    premier.focus({ preventScroll: true });
  }
}

function ligneScore(libelle, valeur, aMoi) {
  const ligne = document.createElement("span");
  ligne.className = "cart-ligne" + (aMoi ? " a-moi" : "");
  const gauche = document.createElement("span");
  gauche.textContent = libelle;
  const droite = document.createElement("strong");
  droite.textContent = valeur;
  ligne.append(gauche, droite);
  return ligne;
}

function texteMonde(idClassement, scores) {
  if (scores === null) {
    return "...";
  }
  if (scores.length === 0) {
    return "place libre";
  }
  return scores[0].nom + " " + formaterScore(idClassement, Number(scores[0].score));
}

// Les n°1 mondiaux se chargent trois par trois, sans bloquer le menu
async function chargerMondes(liste) {
  const file = liste.slice();
  async function suivant() {
    const tache = file.shift();
    if (tache === undefined || menuArcade.hidden) {
      return;
    }
    const scores = await classementFrais(tache.idClassement);
    if (tache.cible.isConnected) {
      tache.cible.textContent = scores === null ? "hors ligne" : texteMonde(tache.idClassement, scores);
    }
    return suivant();
  }
  await Promise.all([suivant(), suivant(), suivant()]);
}

// Fleches dans la grille : on se deplace d'une cartouche ou d'une rangee
menuListe.addEventListener("keydown", function (evenement) {
  const cartouches = Array.from(menuListe.querySelectorAll(".cartouche"));
  const index = cartouches.indexOf(document.activeElement);
  if (index < 0) {
    return;
  }
  const colonnes = getComputedStyle(menuListe).gridTemplateColumns.split(" ").filter(Boolean).length || 1;
  const pas = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: colonnes, ArrowUp: -colonnes }[evenement.key];
  if (pas === undefined) {
    return;
  }
  evenement.preventDefault();
  const cible = cartouches[Math.min(cartouches.length - 1, Math.max(0, index + pas))];
  cible.focus();
  cible.scrollIntoView({ block: "nearest" });
});

function fermerMenu() {
  menuArcade.hidden = true;
  if (zoneScores.hidden) {
    overlayOuvert = false;
  }
}

// Appui long sur le titre : ouvre le menu sans connaitre de code
let chronoAppuiLong = null;

function demarrerAppuiLong() {
  clearTimeout(chronoAppuiLong);
  titreCalculatrice.classList.add("appui");
  chronoAppuiLong = setTimeout(function () {
    titreCalculatrice.classList.remove("appui");
    ouvrirMenu();
  }, 1500);
}

function annulerAppuiLong() {
  clearTimeout(chronoAppuiLong);
  titreCalculatrice.classList.remove("appui");
}

titreCalculatrice.addEventListener("mousedown", demarrerAppuiLong);
titreCalculatrice.addEventListener("mouseup", annulerAppuiLong);
titreCalculatrice.addEventListener("mouseleave", annulerAppuiLong);
titreCalculatrice.addEventListener("touchstart", demarrerAppuiLong, { passive: true });
titreCalculatrice.addEventListener("touchend", annulerAppuiLong);
titreCalculatrice.addEventListener("touchcancel", annulerAppuiLong);
titreCalculatrice.addEventListener("contextmenu", evenement => evenement.preventDefault());
boutonFermerMenu.addEventListener("click", function () {
  if (jeuActif === null) {
    revenirALaCalculatrice();
  } else {
    fermerMenu();
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

export function meilleursScores(id) {
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
export function formaterScore(id, score) {
  const jeu = jeuParId(id);
  return jeu && typeof jeu.formaterScore === "function"
    ? jeu.formaterScore(score, id)
    : score.toLocaleString("fr-BE");
}

function afficherTableau(id, entreeRecente, titre) {
  const jeu = jeuParId(id);
  const tableau = meilleursScores(id);
  zoneScoresTitre.textContent = (titre || (jeu ? nomAffiche(jeu) : "Arcade")) + " - high scores";
  zoneScoresListe.innerHTML = "";

  // Le tableau partage se remplit de son cote, sans bloquer l'affichage
  if (!entreeRecente) {
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

// ---------------------------------------------------------------------
// Score de la partie en cours
// ---------------------------------------------------------------------

let idScoreSuivi = null;
let dernierScoreSuivi = null;

// Appelee par les jeux a chaque fois que leur score change. Elle nourrit
// les panneaux lateraux et anime brievement le score de l'en-tete.
export function majScoreCourant(idClassement, score) {
  animerScorePrincipal(idClassement, score);
  majPanneaux(idClassement, score);
}

// Une pulsation courte quand le score monte. Les jeux dont le meilleur
// score est le plus bas en sont exclus : leur valeur ne monte jamais.
function animerScorePrincipal(id, score) {
  const monte = id === idScoreSuivi
    && typeof score === "number"
    && typeof dernierScoreSuivi === "number"
    && score > dernierScoreSuivi
    && !plusBasEstMieuxPour(id);

  idScoreSuivi = id;
  dernierScoreSuivi = score;
  if (!monte) {
    return;
  }
  const valeur = document.querySelector(".jeu:not([hidden]) .valeur-score");
  if (valeur === null) {
    return;
  }
  valeur.classList.remove("augmente");
  void valeur.offsetWidth;   // relance l'animation meme si elle tournait deja
  valeur.classList.add("augmente");
}

// Appelee par chaque jeu quand la partie est terminee
export function finDePartie(id, score, titre) {
  jeuAuScore = id;
  scoreEnAttente = score;
  titreAuScore = titre || null;
  mesurer({ event: "fin_partie", jeu: id, score: score });
  // Le tableau des scores se tape au doigt : la manette s'efface
  masquerManette();
  zoneScores.hidden = false;
  overlayOuvert = true;
  // La partie est finie : c'est le moment de relire le classement partage,
  // jamais pendant qu'on joue.
  rafraichirApresPartie(id);

  if (estDansLeTop(id, score)) {
    saisieScoreOuverte = true;
    zoneScoresSaisie.hidden = false;
    champNom.value = pseudo();
    champNom.select();
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
  memoriserPseudo(nom);
  oublierCache(jeuAuScore);
  const entree = enregistrerScore(jeuAuScore, nom, scoreEnAttente);
  // Envoi au classement partage. Le module decide lui-meme s'il est
  // configure, inutile de le verifier ici.
  envoyerScore(jeuAuScore, nom, scoreEnAttente);
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
  } else if (jeuActif === null) {
    revenirALaCalculatrice();
  } else {
    fermerMenu();
  }
});