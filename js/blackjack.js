// =====================================================================
//  BLACKJACK - le tripot du kitsune
//  Regles de casino courantes : sabot de 6 jeux, le croupier reste a 17,
//  blackjack paye 3 pour 2, double et separation autorises.
//  Ajouts de la V2 :
//  - l'assurance quand le croupier montre un As ;
//  - l'abandon sur les deux premieres cartes (on recupere la moitie) ;
//  - une serie : trois mains gagnees d'affilee et chaque victoire
//    suivante rapporte un bonus, de 10 a 50 % de la mise ;
//  - les statistiques de la session.
//  Le croupier est un kitsune qui reagit a chaque coup. Les cartes
//  partent du sabot une a une, les jetons glissent vers le gagnant.
//  Le score du classement reste le pic de jetons atteint.
// =====================================================================

import { enregistrerJeu, finDePartie, quitterJeu, majScoreCourant, jeuActif } from "./arcade.js";
import { surTouche } from "./noyau/clavier.js";
import { creerStockage } from "./noyau/stockage.js";
import { melanger } from "./noyau/outils.js";
import { jouer, basculerSon, sonActif } from "./noyau/son.js";

const ID = "blackjack";

// ---------------------------------------------------------------------
// La section est reconstruite ici : index.html ne garde que l'element
// ---------------------------------------------------------------------

const zone = document.getElementById("jeuBlackjack");
zone.innerHTML = `
  <div class="jeu-entete entete-blackjack">
    <span class="jeu-score">Jetons <strong id="jetonsBlackjack">500</strong></span>
    <span class="jeu-score score-principal">Pic <strong class="valeur-score" id="picBlackjack">500</strong></span>
    <span class="jeu-score serie-blackjack" id="serieBloc">Série <strong id="serieBlackjack">0</strong></span>
    <span class="boutons-blackjack">
      <button class="jeu-quitter" id="encaisserBlackjack" type="button">Encaisser</button>
      <button class="jeu-quitter" id="sonBlackjack" type="button" aria-pressed="false">Son</button>
      <button class="jeu-quitter" id="quitterBlackjack" type="button">Retour</button>
    </span>
  </div>
  <div class="tapis" id="tapisBlackjack">
    <div class="zone-croupier">
      <div class="croupier">
        <span class="kitsune" id="kitsuneBlackjack" aria-hidden="true"></span>
        <span class="croupier-infos"><span class="etiquette">Croupier</span><strong id="totalCroupier"></strong></span>
      </div>
      <div class="cartes cartes-croupier" id="mainCroupier"></div>
      <div class="sabot" id="sabotPile" aria-label="Sabot">
        <span class="sabot-cartes"></span>
        <span class="sabot-nombre" id="sabotBlackjack">312</span>
      </div>
    </div>
    <p class="tapis-regle">Le blackjack paie 3 pour 2 &middot; Le croupier reste &agrave; 17 &middot; <span lang="ja">狐の賭場</span></p>
    <p class="jeu-message" id="messageBlackjack">Choisis ta mise</p>
    <div class="mains-joueur" id="mainsJoueur"></div>
  </div>
  <div class="scores-ligne commandes-blackjack" id="misesBlackjack" aria-label="Mises"></div>
  <div class="scores-ligne commandes-blackjack" id="assuranceBlackjack" hidden>
    <button class="jeu-quitter action-blackjack" id="prendreAssurance" type="button">Assurance</button>
    <button class="jeu-quitter action-blackjack" id="refuserAssurance" type="button">Refuser</button>
  </div>
  <div class="scores-ligne commandes-blackjack" id="actionsBlackjack" hidden>
    <button class="jeu-quitter action-blackjack" id="tirerBlackjack" type="button">Tirer</button>
    <button class="jeu-quitter action-blackjack" id="resterBlackjack" type="button">Rester</button>
    <button class="jeu-quitter action-blackjack" id="doublerBlackjack" type="button">Doubler</button>
    <button class="jeu-quitter action-blackjack" id="separerBlackjack" type="button">Séparer</button>
    <button class="jeu-quitter action-blackjack" id="abandonBlackjack" type="button">Abandonner</button>
  </div>
  <p class="stats-blackjack" id="statsBlackjack"></p>
  <p class="jeu-aide">1 &agrave; 4 pour miser, T tirer, R rester, D doubler, S s&eacute;parer, A abandonner, I assurance, N refuser, Espace coup suivant, E encaisser, M son, &Eacute;chap quitter.</p>
`;

const $ = id => document.getElementById(id);
const zoneJetons = $("jetonsBlackjack");
const zonePic = $("picBlackjack");
const zoneSerie = $("serieBlackjack");
const blocSerie = $("serieBloc");
const zoneSabot = $("sabotBlackjack");
const pileSabot = $("sabotPile");
const mainCroupierHtml = $("mainCroupier");
const mainsJoueurHtml = $("mainsJoueur");
const totalCroupierHtml = $("totalCroupier");
const zoneMessage = $("messageBlackjack");
const zoneMises = $("misesBlackjack");
const zoneActions = $("actionsBlackjack");
const zoneAssurance = $("assuranceBlackjack");
const zoneStats = $("statsBlackjack");
const canvasKitsune = $("kitsuneBlackjack");
const boutonTirer = $("tirerBlackjack");
const boutonRester = $("resterBlackjack");
const boutonDoubler = $("doublerBlackjack");
const boutonSeparer = $("separerBlackjack");
const boutonAbandon = $("abandonBlackjack");
const boutonAssurance = $("prendreAssurance");
const boutonRefus = $("refuserAssurance");
const boutonEncaisser = $("encaisserBlackjack");
const boutonSon = $("sonBlackjack");
const boutonQuitter = $("quitterBlackjack");

const JETONS_DEPART = 500;
const NOMBRE_DE_JEUX = 6;
const SEUIL_MELANGE = 0.25;          // on remelange quand un quart du sabot reste
const MAINS_MAX = 4;                 // jusqu'a trois separations
const CLE_BLACKJACK = "tanuki-arcade-blackjack";
const DELAI_CARTE = 170;             // entre deux cartes distribuees, en ms

const ENSEIGNES = [
  { symbole: "♠", rouge: false, nom: "pique" },
  { symbole: "♥", rouge: true, nom: "coeur" },
  { symbole: "♦", rouge: true, nom: "carreau" },
  { symbole: "♣", rouge: false, nom: "trefle" }
];
// Les figures a la francaise : Valet, Dame, Roi
const VALEURS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "V", "D", "R"];
const FIGURES = { V: "侍", D: "姫", R: "殿" };
const MISES = [
  { montant: 25, couleur: "ivoire" },
  { montant: 50, couleur: "vermillon" },
  { montant: 100, couleur: "indigo" },
  { montant: 250, couleur: "lime" }
];

// ---------------------------------------------------------------------
// Dessins vectoriels : cartes, dos, croupier kitsune
// Tout est en SVG inline : net a toutes les tailles, et le texte des
// cartes profite des polices de la page.
// ---------------------------------------------------------------------

const ENCRE = { rouge: "#c3271c", noir: "#1d1d26" };

// Symboles des enseignes, dessines dans une boite de 100 x 100
const FORMES_ENSEIGNES = {
  coeur: '<path d="M50 90C20 67 5 49 9 30C13 13 34 9 50 28C66 9 87 13 91 30C95 49 80 67 50 90Z"/>',
  carreau: '<path d="M50 4L88 50L50 96L12 50Z"/>',
  pique: '<path d="M50 6C31 32 7 45 11 64C15 81 36 83 46 72C44 85 40 91 31 95H69C60 91 56 85 54 72C64 83 85 81 89 64C93 45 69 32 50 6Z"/>',
  trefle: '<circle cx="50" cy="29" r="18"/><circle cx="28" cy="57" r="18"/><circle cx="72" cy="57" r="18"/><path d="M46 52C46 74 42 85 32 95H68C58 85 54 74 54 52Z"/>'
};

function symbole(nom, x, y, taille, retourne) {
  const k = taille / 100;
  const tour = retourne ? " rotate(180 50 50)" : "";
  return '<g transform="translate(' + (x - taille / 2) + " " + (y - taille / 2) + ") scale(" + k + ")" + tour + '">' + FORMES_ENSEIGNES[nom] + "</g>";
}

// Position des enseignes sur les cartes de 2 a 10, comme un jeu classique
const G = 31;
const M = 50;
const D = 69;
const DISPOSITIONS = {
  2: [[M, 30], [M, 110, 1]],
  3: [[M, 30], [M, 70], [M, 110, 1]],
  4: [[G, 30], [D, 30], [G, 110, 1], [D, 110, 1]],
  5: [[G, 30], [D, 30], [M, 70], [G, 110, 1], [D, 110, 1]],
  6: [[G, 30], [D, 30], [G, 70], [D, 70], [G, 110, 1], [D, 110, 1]],
  7: [[G, 30], [D, 30], [M, 50], [G, 70], [D, 70], [G, 110, 1], [D, 110, 1]],
  8: [[G, 30], [D, 30], [M, 50], [G, 70], [D, 70], [M, 90, 1], [G, 110, 1], [D, 110, 1]],
  9: [[G, 30], [D, 30], [G, 57], [D, 57], [M, 70], [G, 83, 1], [D, 83, 1], [G, 110, 1], [D, 110, 1]],
  10: [[G, 30], [D, 30], [M, 43], [G, 57], [D, 57], [G, 83, 1], [D, 83, 1], [M, 97, 1], [G, 110, 1], [D, 110, 1]]
};

// Les figures : un samourai tengu (Valet), une princesse kitsune (Dame),
// un seigneur tanuki (Roi). Portrait en buste, en miroir comme sur les
// vraies cartes. Le kimono prend la couleur de l'enseigne.
function portrait(valeur, encre, kimono) {
  const col = '<path d="M20 70L36 50L50 62L64 50L80 70Z" fill="' + kimono + '"/>'
    + '<path d="M36 50L50 62L64 50L58 50L50 57L42 50Z" fill="#e8c547"/>';
  if (valeur === "V") {
    // Samourai tengu : visage rouge, long nez, casque a croissant dore
    return col
      + '<ellipse cx="50" cy="40" rx="11" ry="12" fill="#d9442f"/>'
      + '<path d="M50 40L62 45L50 46Z" fill="#b8301f"/>'
      + '<path d="M44 37h4M52 37h4" stroke="#1d1d26" stroke-width="2"/>'
      + '<path d="M44 49q6 3 12 0" stroke="#1d1d26" stroke-width="1.5" fill="none"/>'
      + '<path d="M36 33q14-16 28 0v-3q-14-11-28 0Z" fill="#2a2a34"/>'
      + '<path d="M38 22q12 10 24 0q-4 8-12 8q-8 0-12-8Z" fill="#e8c547"/>'
      + '<rect x="47" y="15" width="6" height="6" fill="' + encre + '"/>';
  }
  if (valeur === "D") {
    // Princesse kitsune : masque blanc, oreilles, marques rouges, kanzashi
    return col
      + '<path d="M38 26L42 38L46 31Z" fill="#f4efe4" stroke="#1d1d26" stroke-width="1"/>'
      + '<path d="M62 26L58 38L54 31Z" fill="#f4efe4" stroke="#1d1d26" stroke-width="1"/>'
      + '<path d="M38 34q-4 14 12 18q16-4 12-18q-12-6-24 0Z" fill="#f8f4ea" stroke="#1d1d26" stroke-width="1"/>'
      + '<path d="M42 38q3-2 6 0M52 38q3-2 6 0" stroke="#1d1d26" stroke-width="1.8" fill="none"/>'
      + '<path d="M41 41l4 3M59 41l-4 3" stroke="#c3271c" stroke-width="1.6"/>'
      + '<circle cx="50" cy="46" r="1.6" fill="#1d1d26"/>'
      + '<path d="M30 52q-2-24 20-28q22 4 20 28l-6-14q-14-8-28 0Z" fill="#1d1d26"/>'
      + '<circle cx="64" cy="27" r="3" fill="#e8c547"/><path d="M64 27l8-6" stroke="#e8c547" stroke-width="1.5"/>';
  }
  // Seigneur tanuki : face brune, masque sombre, eboshi noir, eventail
  return col
    + '<ellipse cx="50" cy="41" rx="13" ry="11" fill="#8a6440"/>'
    + '<ellipse cx="44" cy="40" rx="5" ry="3.5" fill="#3a2a1e"/><ellipse cx="56" cy="40" rx="5" ry="3.5" fill="#3a2a1e"/>'
    + '<circle cx="44" cy="40" r="1.4" fill="#f4efe4"/><circle cx="56" cy="40" r="1.4" fill="#f4efe4"/>'
    + '<ellipse cx="50" cy="46" rx="5" ry="3.5" fill="#efe2c8"/><circle cx="50" cy="45" r="1.5" fill="#1d1d26"/>'
    + '<path d="M38 33q12-6 24 0l-4-14q-8-3-16 0Z" fill="#1d1d26"/>'
    + '<circle cx="38" cy="33" r="3" fill="#8a6440"/><circle cx="62" cy="33" r="3" fill="#8a6440"/>'
    + '<path d="M70 66l8-14l4 4Z" fill="#e8c547" stroke="' + encre + '" stroke-width="1"/>';
}

const cacheFaces = new Map();

function svgFace(carte) {
  const cle = carte.valeur + carte.enseigne.nom;
  if (cacheFaces.has(cle)) {
    return cacheFaces.get(cle);
  }
  const encre = carte.enseigne.rouge ? ENCRE.rouge : ENCRE.noir;
  const nom = carte.enseigne.nom;
  let centre = "";
  if (carte.valeur === "A") {
    // L'as : une grande enseigne, cerclee d'or pour le pique
    centre = (nom === "pique" ? '<circle cx="50" cy="70" r="27" fill="none" stroke="#c9a23a" stroke-width="2"/>' : "")
      + '<g fill="' + encre + '">' + symbole(nom, 50, 70, nom === "pique" ? 40 : 46) + "</g>";
  } else if (FIGURES[carte.valeur]) {
    const kimono = carte.enseigne.rouge ? "#c3271c" : "#2c3a6e";
    const buste = portrait(carte.valeur, encre, kimono);
    centre = '<rect x="18" y="16" width="64" height="108" rx="3" fill="#f6efdf" stroke="' + encre + '" stroke-width="1.5"/>'
      + '<clipPath id="cadre' + cle + '"><rect x="19" y="17" width="62" height="106" rx="2"/></clipPath>'
      + '<g clip-path="url(#cadre' + cle + ')">'
      + '<g transform="translate(0 0)">' + buste + "</g>"
      + '<g transform="rotate(180 50 70)">' + buste + "</g></g>"
      + '<path d="M19 70H81" stroke="' + encre + '" stroke-width="1"/>'
      + '<text x="24" y="31" font-family="Shippori Mincho B1, serif" font-weight="700" font-size="11" fill="' + encre + '">' + FIGURES[carte.valeur] + "</text>"
      + '<g fill="' + encre + '">' + symbole(nom, 74, 26, 11) + symbole(nom, 26, 114, 11, true) + "</g>";
  } else {
    centre = '<g fill="' + encre + '">' + DISPOSITIONS[carte.valeur].map(([x, y, r]) => symbole(nom, x, y, 17, r)).join("") + "</g>";
  }
  const coin = '<text x="10" y="20" text-anchor="middle" font-family="Anybody, sans-serif" font-weight="800" font-stretch="80%" font-size="' + (carte.valeur === "10" ? 15 : 18) + '" fill="' + encre + '">' + carte.valeur + "</text>"
    + '<g fill="' + encre + '">' + symbole(nom, 10, 30, 11) + "</g>";
  const svg = '<svg viewBox="0 0 100 140" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'
    + '<rect x="0.75" y="0.75" width="98.5" height="138.5" rx="8" fill="#fbf7ee" stroke="#cfc5ae" stroke-width="1.5"/>'
    + centre + coin + '<g transform="rotate(180 50 70)">' + coin + "</g></svg>";
  cacheFaces.set(cle, svg);
  return svg;
}

// Le dos : laque vermillon, filet d'or, medaillon du tanuki a la feuille
const SVG_DOS = '<svg viewBox="0 0 100 140" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'
  + '<rect x="0.75" y="0.75" width="98.5" height="138.5" rx="8" fill="#b4261c" stroke="#6e140e" stroke-width="1.5"/>'
  + '<rect x="7" y="7" width="86" height="126" rx="5" fill="none" stroke="#e8c547" stroke-width="2"/>'
  + '<rect x="11" y="11" width="78" height="118" rx="3" fill="#9c1f17"/>'
  + '<circle cx="50" cy="70" r="24" fill="#f4e9cf" stroke="#e8c547" stroke-width="2.5"/>'
  + '<path d="M41 52q9-14 18 0q-9 6-18 0Z" fill="#5fa82a"/><path d="M50 46v10" stroke="#3f6912" stroke-width="1.5"/>'
  + '<ellipse cx="50" cy="73" rx="14" ry="11" fill="#8a6440"/>'
  + '<path d="M37 66l4-8l5 6ZM63 66l-4-8l-5 6Z" fill="#8a6440"/>'
  + '<ellipse cx="44" cy="72" rx="5" ry="3.5" fill="#3a2a1e"/><ellipse cx="56" cy="72" rx="5" ry="3.5" fill="#3a2a1e"/>'
  + '<circle cx="44" cy="72" r="1.3" fill="#f4efe4"/><circle cx="56" cy="72" r="1.3" fill="#f4efe4"/>'
  + '<ellipse cx="50" cy="78" rx="5" ry="3.5" fill="#efe2c8"/><circle cx="50" cy="77" r="1.5" fill="#1d1d26"/>'
  + '<path d="M22 22l6 6M78 22l-6 6M22 118l6-6M78 118l-6-6" stroke="#e8c547" stroke-width="2"/>'
  + "</svg>";

// Le croupier : un kitsune en SVG, quatre humeurs
const HUMEURS = {
  neutre: { yeux: '<path d="M22 31q4-3 8 0M34 31q4-3 8 0" stroke="#1d1d26" stroke-width="2.4" fill="none"/>', bouche: '<path d="M28 42q4 2 8 0" stroke="#8f2620" stroke-width="2" fill="none"/>', oreilles: 0 },
  rit: { yeux: '<path d="M22 32q4-5 8 0M34 32q4-5 8 0" stroke="#1d1d26" stroke-width="2.4" fill="none"/>', bouche: '<path d="M26 40q6 7 12 0Z" fill="#8f2620"/>', oreilles: 0 },
  triste: { yeux: '<path d="M22 30q4 3 8 1M34 31q4 2 8-1" stroke="#1d1d26" stroke-width="2.4" fill="none"/>', bouche: '<path d="M28 44q4-3 8 0" stroke="#8f2620" stroke-width="2" fill="none"/>', oreilles: 28 },
  surpris: { yeux: '<circle cx="26" cy="31" r="3" fill="#1d1d26"/><circle cx="38" cy="31" r="3" fill="#1d1d26"/>', bouche: '<ellipse cx="32" cy="43" rx="3" ry="3.5" fill="#8f2620"/>', oreilles: -8 }
};

function svgKitsune(humeur) {
  const h = HUMEURS[humeur] || HUMEURS.neutre;
  return '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'
    + '<g transform="rotate(' + (-h.oreilles) + ' 18 22)"><path d="M10 26L14 4L28 18Z" fill="#f4efe4" stroke="#1d1d26" stroke-width="1.2"/><path d="M14 22L16 10L23 18Z" fill="#e88aa0"/></g>'
    + '<g transform="rotate(' + h.oreilles + ' 46 22)"><path d="M54 26L50 4L36 18Z" fill="#f4efe4" stroke="#1d1d26" stroke-width="1.2"/><path d="M50 22L48 10L41 18Z" fill="#e88aa0"/></g>'
    + '<path d="M10 26q-2 22 22 26q24-4 22-26q-22-12-44 0Z" fill="#fbf7ee" stroke="#1d1d26" stroke-width="1.2"/>'
    + '<path d="M18 30l4-4M46 30l-4-4M30 22h4" stroke="#c3271c" stroke-width="2.2"/>'
    + h.yeux + '<ellipse cx="32" cy="37" rx="2.4" ry="1.8" fill="#1d1d26"/>' + h.bouche
    + '<path d="M18 52h28l-3 6H21Z" fill="#c3271c"/><circle cx="32" cy="57" r="3.5" fill="#e8c547" stroke="#8a6420" stroke-width="1"/>'
    + "</svg>";
}

pileSabot.querySelector(".sabot-cartes").innerHTML = SVG_DOS;

const blocKitsune = canvasKitsune;
let humeur = "neutre";

function poserHumeur(nouvelle) {
  humeur = nouvelle;
  blocKitsune.innerHTML = svgKitsune(humeur);
  blocKitsune.dataset.humeur = humeur;
}

// ---------------------------------------------------------------------
// Etat
// ---------------------------------------------------------------------

let sabot = [];
let uid = 0;
let jetonsJoueur = JETONS_DEPART;
let picJetons = JETONS_DEPART;
let mainsJoueur = [];
let indexMainCourante = 0;
let mainCroupier = [];
let phase = "mise";                  // mise, assurance, joueur, croupier, resultat
let termine = false;
let miseAssurance = 0;
let serie = 0;
let verrouJusqua = 0;
let minuteurs = [];
let stats = nouvellesStats();

function nouvellesStats() {
  return { mains: 0, gagnees: 0, perdues: 0, egalites: 0, blackjacks: 0, meilleureSerie: 0 };
}

const stockage = creerStockage(CLE_BLACKJACK);

function sauver() {
  stockage.ecrire({ jetonsJoueur, pic: picJetons });
}

function charger() {
  const donnees = stockage.lire();
  if (donnees === null || typeof donnees.jetonsJoueur !== "number" || donnees.jetonsJoueur <= 0) {
    return false;
  }
  jetonsJoueur = donnees.jetonsJoueur;
  picJetons = Math.max(donnees.pic || 0, jetonsJoueur);
  return true;
}

// Les appels differes sont annules si on quitte la table
function plusTard(fonction, delai) {
  const minuteur = setTimeout(() => {
    minuteurs = minuteurs.filter(m => m !== minuteur);
    fonction();
  }, delai);
  minuteurs.push(minuteur);
}

function annulerMinuteurs() {
  minuteurs.forEach(clearTimeout);
  minuteurs = [];
}

function verrouille() {
  return performance.now() < verrouJusqua;
}

// ---------------------------------------------------------------------
// Sabot et valeurs
// ---------------------------------------------------------------------

function creerSabot() {
  const cartes = [];
  for (let jeu = 0; jeu < NOMBRE_DE_JEUX; jeu++) {
    for (const enseigne of ENSEIGNES) {
      for (const valeur of VALEURS) {
        cartes.push({ valeur, enseigne });
      }
    }
  }
  return melanger(cartes);
}

function piocher() {
  if (sabot.length <= NOMBRE_DE_JEUX * 52 * SEUIL_MELANGE) {
    sabot = creerSabot();
  }
  const carte = sabot.pop();
  return { ...carte, uid: ++uid };
}

function valeurCarte(carte) {
  if (carte.valeur === "A") {
    return 11;
  }
  return FIGURES[carte.valeur] ? 10 : Number(carte.valeur);
}

// L'as vaut 11 s'il ne fait pas depasser 21, sinon 1
function valeurMain(cartes) {
  let total = 0;
  let as = 0;
  for (const carte of cartes) {
    total += valeurCarte(carte);
    if (carte.valeur === "A") {
      as++;
    }
  }
  while (total > 21 && as > 0) {
    total -= 10;
    as--;
  }
  return total;
}

function mainSouple(cartes) {
  const brut = cartes.reduce((somme, carte) => somme + (carte.valeur === "A" ? 1 : valeurCarte(carte)), 0);
  return cartes.some(carte => carte.valeur === "A") && brut + 10 <= 21;
}

function estBlackjack(main) {
  return main.cartes.length === 2 && valeurMain(main.cartes) === 21 && !main.issueDeSeparation;
}

// ---------------------------------------------------------------------
// Deroulement d'un coup
// ---------------------------------------------------------------------

function demarrer() {
  annulerMinuteurs();
  if (!charger()) {
    jetonsJoueur = JETONS_DEPART;
    picJetons = JETONS_DEPART;
  }
  sabot = creerSabot();
  mainsJoueur = [];
  mainCroupier = [];
  indexMainCourante = 0;
  termine = false;
  phase = "mise";
  serie = 0;
  miseAssurance = 0;
  stats = nouvellesStats();
  verrouJusqua = 0;
  mainCroupierHtml.innerHTML = "";
  mainsJoueurHtml.innerHTML = "";
  poserHumeur("neutre");
  message("Choisis ta mise", false);
  majBoutonSon();
  dessiner();
}

function message(texte, resultat) {
  zoneMessage.textContent = texte;
  zoneMessage.classList.toggle("resultat", resultat === true);
}

function miser(montant) {
  if (verrouille()) {
    return;
  }
  // Apres un resultat, une mise enchaine directement le coup suivant
  if (phase === "resultat" && !termine) {
    nouveauCoup();
  }
  if (phase !== "mise" || montant > jetonsJoueur) {
    return;
  }
  jetonsJoueur -= montant;
  stats.mains++;
  miseAssurance = 0;
  // L'ordre de distribution d'un vrai croupier : joueur, croupier, joueur, croupier
  const premiere = piocher();
  const visible = piocher();
  const seconde = piocher();
  const cachee = piocher();
  mainsJoueur = [{ cartes: [premiere, seconde], mise: montant, terminee: false, doublee: false, issueDeSeparation: false }];
  mainCroupier = [visible, cachee];
  indexMainCourante = 0;
  message("", false);
  poserHumeur("neutre");

  if (mainCroupier[0].valeur === "A" && jetonsJoueur >= Math.floor(montant / 2)) {
    phase = "assurance";
    const duree = dessiner();
    plusTard(() => message("Le kitsune montre un As. Assurance ?", false), duree);
    return;
  }
  phase = "joueur";
  const duree = dessiner();
  plusTard(verifierBlackjacksDepart, duree);
}

// Le croupier regarde sa carte cachee s'il montre un As ou une figure
function verifierBlackjacksDepart() {
  const blackjackJoueur = estBlackjack(mainsJoueur[0]);
  const blackjackCroupier = valeurMain(mainCroupier) === 21;
  if (blackjackJoueur || blackjackCroupier) {
    mainsJoueur[0].terminee = true;
    phase = "croupier";
    resoudre();
    return;
  }
  dessiner();
}

function choisirAssurance(prendre) {
  if (phase !== "assurance" || verrouille()) {
    return;
  }
  const main = mainsJoueur[0];
  if (prendre) {
    miseAssurance = Math.floor(main.mise / 2);
    jetonsJoueur -= miseAssurance;
  }
  if (valeurMain(mainCroupier) === 21) {
    main.terminee = true;
    phase = "croupier";
    resoudre();
    return;
  }
  if (miseAssurance > 0) {
    message("Pas de blackjack. L'assurance est perdue.", false);
    miseAssurance = 0;
  } else {
    message("", false);
  }
  phase = "joueur";
  if (estBlackjack(main)) {
    main.terminee = true;
    phase = "croupier";
    resoudre();
    return;
  }
  dessiner();
}

function mainCourante() {
  return mainsJoueur[indexMainCourante] || null;
}

function passerAlaSuite() {
  while (indexMainCourante < mainsJoueur.length && mainsJoueur[indexMainCourante].terminee) {
    indexMainCourante++;
  }
  if (indexMainCourante >= mainsJoueur.length) {
    phase = "croupier";
    tourCroupier();
  } else {
    dessiner();
  }
}

function tirer() {
  const main = mainCourante();
  if (phase !== "joueur" || main === null || verrouille()) {
    return;
  }
  main.cartes.push(piocher());
  if (valeurMain(main.cartes) >= 21) {
    main.terminee = true;
  }
  const duree = dessiner();
  if (main.terminee) {
    verrouJusqua = performance.now() + duree;
    plusTard(passerAlaSuite, duree);
  }
}

function rester() {
  const main = mainCourante();
  if (phase !== "joueur" || main === null || verrouille()) {
    return;
  }
  main.terminee = true;
  passerAlaSuite();
}

function peutDoubler() {
  const main = mainCourante();
  return phase === "joueur" && main !== null
    && main.cartes.length === 2 && !main.doublee && jetonsJoueur >= main.mise;
}

function doubler() {
  if (!peutDoubler() || verrouille()) {
    return;
  }
  const main = mainCourante();
  jetonsJoueur -= main.mise;
  main.mise *= 2;
  main.doublee = true;
  main.cartes.push(piocher());
  main.terminee = true;
  const duree = dessiner();
  verrouJusqua = performance.now() + duree;
  plusTard(passerAlaSuite, duree);
}

function peutSeparer() {
  const main = mainCourante();
  return phase === "joueur" && main !== null
    && main.cartes.length === 2
    && valeurCarte(main.cartes[0]) === valeurCarte(main.cartes[1])
    && mainsJoueur.length < MAINS_MAX
    && jetonsJoueur >= main.mise;
}

function separer() {
  if (!peutSeparer() || verrouille()) {
    return;
  }
  const main = mainCourante();
  jetonsJoueur -= main.mise;
  const carteDeplacee = main.cartes.pop();
  const nouvelleMain = {
    cartes: [carteDeplacee, piocher()],
    mise: main.mise,
    terminee: false,
    doublee: false,
    issueDeSeparation: true
  };
  main.cartes.push(piocher());
  main.issueDeSeparation = true;
  mainsJoueur.splice(indexMainCourante + 1, 0, nouvelleMain);
  // Les as separes ne recoivent qu'une carte chacun
  if (carteDeplacee.valeur === "A") {
    main.terminee = true;
    nouvelleMain.terminee = true;
  }
  const duree = dessiner();
  if (main.terminee) {
    verrouJusqua = performance.now() + duree;
    plusTard(passerAlaSuite, duree);
  }
}

// L'abandon n'est possible que sur la main de depart, avant toute action
function peutAbandonner() {
  const main = mainCourante();
  return phase === "joueur" && main !== null && mainsJoueur.length === 1
    && main.cartes.length === 2 && !main.issueDeSeparation && !main.doublee;
}

function abandonner() {
  if (!peutAbandonner() || verrouille()) {
    return;
  }
  const main = mainCourante();
  const rendu = Math.floor(main.mise / 2);
  jetonsJoueur += rendu;
  main.resultat = "abandon";
  main.gain = rendu - main.mise;
  main.terminee = true;
  passerAlaSuite();
}

// Le croupier tire jusqu'a 17, et reste sur un 17 souple
function tourCroupier() {
  const resteUneMain = mainsJoueur.some(main => main.resultat !== "abandon" && valeurMain(main.cartes) <= 21);
  if (resteUneMain) {
    while (valeurMain(mainCroupier) < 17) {
      mainCroupier.push(piocher());
    }
  }
  resoudre();
}

function resoudre() {
  const totalCroupier = valeurMain(mainCroupier);
  const croupierSaute = totalCroupier > 21;
  const croupierBlackjack = mainCroupier.length === 2 && totalCroupier === 21;
  const resumes = [];
  let bilan = 0;
  let blackjackJoueur = false;

  // L'assurance paie 2 pour 1 si le croupier a le blackjack
  if (miseAssurance > 0 && croupierBlackjack) {
    jetonsJoueur += miseAssurance * 3;
    bilan += miseAssurance * 2;
    resumes.push("Assurance payée, +" + miseAssurance * 2);
  } else if (miseAssurance > 0) {
    bilan -= miseAssurance;
  }

  mainsJoueur.forEach(main => {
    const total = valeurMain(main.cartes);
    if (main.resultat === "abandon") {
      resumes.push("Abandon, " + main.gain);
      bilan += main.gain;
      stats.perdues++;
      serie = 0;
      return;
    }
    let gain;
    if (total > 21) {
      main.resultat = "perdu";
      gain = -main.mise;
      resumes.push("Sauté à " + total);
    } else if (estBlackjack(main) && !croupierBlackjack) {
      main.resultat = "blackjack";
      gain = Math.floor(main.mise * 1.5);
      resumes.push("Blackjack, +" + gain);
      blackjackJoueur = true;
      stats.blackjacks++;
    } else if (croupierSaute || total > totalCroupier) {
      main.resultat = "gagne";
      gain = main.mise;
      resumes.push((croupierSaute ? "Le kitsune saute" : total + " contre " + totalCroupier) + ", +" + gain);
    } else if (total === totalCroupier && !(croupierBlackjack && !estBlackjack(main))) {
      main.resultat = "egalite";
      gain = 0;
      resumes.push("Égalité à " + total);
    } else {
      main.resultat = "perdu";
      gain = -main.mise;
      resumes.push(croupierBlackjack && !estBlackjack(main) ? "Blackjack du kitsune" : total + " contre " + totalCroupier);
    }

    // La serie : a partir de la troisieme victoire d'affilee, un bonus
    let bonus = 0;
    if (gain > 0) {
      serie++;
      stats.gagnees++;
      stats.meilleureSerie = Math.max(stats.meilleureSerie, serie);
      if (serie >= 3) {
        bonus = Math.round(main.mise * 0.1 * Math.min(5, serie - 2));
        resumes.push("Série " + serie + ", bonus +" + bonus);
      }
    } else if (gain < 0) {
      serie = 0;
      stats.perdues++;
    } else {
      stats.egalites++;
    }
    main.gain = gain + bonus;
    jetonsJoueur += main.mise + gain + bonus;
    bilan += gain + bonus;
  });

  picJetons = Math.max(picJetons, jetonsJoueur);
  phase = "resultat";
  const duree = dessiner();
  verrouJusqua = performance.now() + duree + 150;

  // Le verdict tombe quand la derniere carte est posee
  plusTard(() => {
    verrouJusqua = 0;
    message(resumes.join("  ·  "), true);
    poserHumeur(blackjackJoueur ? "surpris" : bilan > 0 ? "triste" : bilan < 0 ? "rit" : "neutre");
    jouer(blackjackJoueur ? "pouvoir" : bilan > 0 ? "bonus" : bilan < 0 ? "impact" : "clic");
    if (serie >= 3 && bilan > 0) {
      jouer("combo", serie);
    }
    glisserJetons();
    sauver();
    majCompteurs();
    // Plus assez de jetons pour la plus petite mise : la partie est finie
    if (jetonsJoueur < MISES[0].montant) {
      termine = true;
      message("Le kitsune a tout pris. Pic atteint : " + picJetons, true);
      stockage.effacer();
      plusTard(() => {
        if (jeuActif === ID) {
          finDePartie(ID, picJetons);
        }
      }, 1400);
    }
    dessinerCommandes();
  }, duree);
}

function nouveauCoup() {
  if (phase !== "resultat" || termine || verrouille()) {
    return;
  }
  mainsJoueur = [];
  mainCroupier = [];
  indexMainCourante = 0;
  phase = "mise";
  mainCroupierHtml.innerHTML = "";
  mainsJoueurHtml.innerHTML = "";
  poserHumeur("neutre");
  message("Choisis ta mise", false);
  dessiner();
}

// Quitter la table en inscrivant son pic au classement
function encaisser() {
  if (phase === "joueur" || phase === "assurance" || verrouille()) {
    return;
  }
  picJetons = Math.max(picJetons, jetonsJoueur);
  sauver();
  finDePartie(ID, picJetons);
}

// ---------------------------------------------------------------------
// Affichage
// Les cartes deja posees restent dans le DOM ; seules les nouvelles sont
// creees, et elles partent du sabot l'une apres l'autre. dessiner()
// renvoie la duree de la distribution, pour caler la suite dessus.
// ---------------------------------------------------------------------

function creerCarte(carte) {
  const element = document.createElement("div");
  element.className = "carte" + (carte.enseigne.rouge ? " rouge" : "") + (FIGURES[carte.valeur] ? " figure" : "");
  element.dataset.uid = String(carte.uid);
  element.setAttribute("role", "img");
  element.setAttribute("aria-label", carte.valeur + " de " + carte.enseigne.nom);
  const face = document.createElement("span");
  face.className = "carte-face";
  face.innerHTML = svgFace(carte);
  const dos = document.createElement("span");
  dos.className = "carte-dos";
  dos.innerHTML = SVG_DOS;
  element.append(face, dos);
  return element;
}

// Pose les cartes manquantes d'un conteneur, en partant du sabot
function poserCartes(conteneur, cartes, cacherIndex, file) {
  const existantes = new Map();
  for (const element of conteneur.children) {
    existantes.set(element.dataset.uid, element);
  }
  const vues = new Set();
  cartes.forEach((carte, index) => {
    const cle = String(carte.uid);
    vues.add(cle);
    let element = existantes.get(cle);
    const cachee = index === cacherIndex;
    if (element === undefined) {
      element = creerCarte(carte);
      element.classList.toggle("cachee", cachee);
      conteneur.appendChild(element);
      const depart = pileSabot.getBoundingClientRect();
      const arrivee = element.getBoundingClientRect();
      element.style.setProperty("--dx", Math.round(depart.left - arrivee.left) + "px");
      element.style.setProperty("--dy", Math.round(depart.top - arrivee.top) + "px");
      element.style.setProperty("--delai", file.n * DELAI_CARTE + "ms");
      element.classList.add("distribuee");
      const delai = file.n * DELAI_CARTE;
      plusTard(() => jouer("grain"), delai);
      file.n++;
    } else if (element.classList.contains("cachee") && !cachee) {
      // La carte cachee du croupier se retourne
      element.style.setProperty("--delai", file.n * DELAI_CARTE + "ms");
      element.classList.remove("cachee", "distribuee");
      void element.offsetWidth;
      element.classList.add("retournee");
      file.n++;
    }
  });
  for (const [cle, element] of existantes) {
    if (!vues.has(cle)) {
      element.remove();
    }
  }
}

function texteTotal(cartes) {
  const total = valeurMain(cartes);
  return mainSouple(cartes) && total <= 21 ? total - 10 + " / " + total : String(total);
}

function pileJetons(mise) {
  const pile = document.createElement("span");
  pile.className = "pile-jetons";
  let reste = mise;
  const jetons = [];
  for (const m of MISES.slice().reverse()) {
    while (reste >= m.montant && jetons.length < 8) {
      jetons.push(m.couleur);
      reste -= m.montant;
    }
  }
  jetons.forEach((couleur, i) => {
    const jeton = document.createElement("span");
    jeton.className = "jeton jeton-" + couleur;
    jeton.style.setProperty("--i", String(i));
    pile.appendChild(jeton);
  });
  return pile;
}

function dessiner() {
  const file = { n: 0 };
  const cacher = phase === "joueur" || phase === "assurance";
  poserCartes(mainCroupierHtml, mainCroupier, cacher ? 1 : -1, file);
  totalCroupierHtml.textContent = mainCroupier.length === 0
    ? ""
    : (cacher ? String(valeurCarte(mainCroupier[0])) : texteTotal(mainCroupier));

  // Une main par bloc, reconstruite seulement si leur nombre change
  while (mainsJoueurHtml.children.length > mainsJoueur.length) {
    mainsJoueurHtml.lastElementChild.remove();
  }
  mainsJoueur.forEach((main, index) => {
    let bloc = mainsJoueurHtml.children[index];
    if (bloc === undefined) {
      bloc = document.createElement("div");
      bloc.className = "main-joueur";
      bloc.innerHTML = '<div class="cartes"></div><span class="main-details"></span>';
      mainsJoueurHtml.appendChild(bloc);
    }
    bloc.className = "main-joueur";
    if (index === indexMainCourante && phase === "joueur") {
      bloc.classList.add("active");
    }
    poserCartes(bloc.querySelector(".cartes"), main.cartes, -1, file);
    const details = bloc.querySelector(".main-details");
    details.innerHTML = "";
    const total = document.createElement("strong");
    total.textContent = texteTotal(main.cartes);
    details.append(total, pileJetons(main.mise));
    const mise = document.createElement("span");
    mise.className = "main-mise";
    mise.textContent = main.mise + (main.doublee ? " doublée" : "");
    details.appendChild(mise);
  });

  majCompteurs();
  dessinerCommandes();
  return file.n * DELAI_CARTE + (file.n > 0 ? 260 : 0);
}

// Apres le verdict, chaque pile de jetons part vers son gagnant
function glisserJetons() {
  mainsJoueur.forEach((main, index) => {
    const bloc = mainsJoueurHtml.children[index];
    if (bloc === undefined || !main.resultat) {
      return;
    }
    bloc.classList.add(main.resultat);
    const pile = bloc.querySelector(".pile-jetons");
    if (pile !== null) {
      pile.classList.add(main.gain > 0 ? "vers-joueur" : main.gain < 0 ? "vers-croupier" : "reste");
    }
    const etiquette = document.createElement("span");
    etiquette.className = "main-gain " + (main.gain > 0 ? "plus" : main.gain < 0 ? "moins" : "");
    etiquette.textContent = main.gain > 0 ? "+" + main.gain : main.gain < 0 ? String(main.gain) : "±0";
    bloc.querySelector(".main-details").appendChild(etiquette);
  });
}

function majCompteurs() {
  const affiches = phase === "resultat" && verrouille() ? null : jetonsJoueur;
  if (affiches !== null) {
    zoneJetons.textContent = jetonsJoueur.toLocaleString("fr-BE");
  }
  zonePic.textContent = Math.max(picJetons, jetonsJoueur).toLocaleString("fr-BE");
  zoneSerie.textContent = String(serie);
  blocSerie.classList.toggle("chaud", serie >= 3);
  zoneSabot.textContent = String(sabot.length);
  pileSabot.style.setProperty("--epaisseur", Math.max(2, Math.round(sabot.length / 26)) + "px");
  const s = stats;
  zoneStats.textContent = s.mains === 0
    ? "Nouvelle session"
    : "Mains " + s.mains + "  ·  gagnées " + s.gagnees + "  ·  perdues " + s.perdues + "  ·  égalités " + s.egalites
      + "  ·  blackjacks " + s.blackjacks + "  ·  meilleure série " + s.meilleureSerie;
  majScoreCourant(ID, Math.max(picJetons, jetonsJoueur));
}

function dessinerCommandes() {
  zoneMises.hidden = !(phase === "mise" || phase === "resultat") || termine;
  zoneActions.hidden = phase !== "joueur";
  zoneAssurance.hidden = phase !== "assurance";
  for (const bouton of zoneMises.children) {
    bouton.disabled = Number(bouton.dataset.montant) > jetonsJoueur;
  }
  boutonDoubler.disabled = !peutDoubler();
  boutonSeparer.disabled = !peutSeparer();
  boutonAbandon.disabled = !peutAbandonner();
  if (mainsJoueur[0]) {
    boutonAssurance.textContent = "Assurance (" + Math.floor(mainsJoueur[0].mise / 2) + ")";
  }
  boutonEncaisser.disabled = phase === "joueur" || phase === "assurance" || termine;
}

function majBoutonSon() {
  boutonSon.textContent = sonActif() ? "Son" : "Muet";
  boutonSon.setAttribute("aria-pressed", String(!sonActif()));
}

// ---------------------------------------------------------------------
// Commandes
// ---------------------------------------------------------------------

MISES.forEach(mise => {
  const bouton = document.createElement("button");
  bouton.type = "button";
  bouton.className = "mise-jeton jeton-" + mise.couleur;
  bouton.dataset.montant = String(mise.montant);
  bouton.textContent = String(mise.montant);
  bouton.setAttribute("aria-label", "Miser " + mise.montant);
  bouton.addEventListener("click", () => miser(mise.montant));
  zoneMises.appendChild(bouton);
});

boutonTirer.addEventListener("click", tirer);
boutonRester.addEventListener("click", rester);
boutonDoubler.addEventListener("click", doubler);
boutonSeparer.addEventListener("click", separer);
boutonAbandon.addEventListener("click", abandonner);
boutonAssurance.addEventListener("click", () => choisirAssurance(true));
boutonRefus.addEventListener("click", () => choisirAssurance(false));
boutonEncaisser.addEventListener("click", encaisser);
boutonQuitter.addEventListener("click", quitterJeu);
boutonSon.addEventListener("click", function () {
  basculerSon();
  majBoutonSon();
});

surTouche(ID, function (evenement) {
  const touche = evenement.key.toLowerCase();
  if ((phase === "mise" || phase === "resultat") && /^[1-4]$/.test(touche)) {
    miser(MISES[Number(touche) - 1].montant);
  } else if (touche === "t") {
    tirer();
  } else if (touche === "r") {
    rester();
  } else if (touche === "d") {
    doubler();
  } else if (touche === "s") {
    separer();
  } else if (touche === "a") {
    abandonner();
  } else if (touche === "i") {
    choisirAssurance(true);
  } else if (touche === "n") {
    choisirAssurance(false);
  } else if (touche === "e") {
    encaisser();
  } else if (touche === "m") {
    basculerSon();
    majBoutonSon();
  } else if (touche === " " || touche === "enter") {
    nouveauCoup();
  } else if (touche === "escape") {
    quitterJeu();
    return;
  } else {
    return;
  }
  evenement.preventDefault();
});

// Un appui sur le tapis relance un coup apres un resultat
$("tapisBlackjack").addEventListener("click", function () {
  if (phase === "resultat") {
    nouveauCoup();
  }
});
zone.addEventListener("contextmenu", evenement => evenement.preventDefault());

poserHumeur("neutre");

enregistrerJeu({
  id: ID,
  nom: "Blackjack",
  code: "21",
  section: zone,
  demarrer,
  arreter: annulerMinuteurs,
  manette: { a: "t", b: "r", start: " ", libelles: { a: "Tirer", b: "Rester" } }
});

export const _test = { svgFace, SVG_DOS, svgKitsune, ENSEIGNES, VALEURS };
