// =====================================================================
//  EVOLUTION - le 2048 du tanuki
//  Les memes regles que 2048, mais chaque palier est un objet ou un
//  yokai du sanctuaire : le grain de riz devient onigiri, puis dango,
//  mochi, daruma... jusqu'au tanuki dore, et au-dela.
//
//  - les tuiles glissent et fusionnent sous les yeux du joueur ;
//  - une annulation en reserve, regagnee a chaque nouveau palier atteint
//    dans la partie (trois au plus) ;
//  - plusieurs fusions dans le meme coup font un combo, qui rapporte un
//    petit bonus ;
//  - le carnet garde les paliers deja decouverts, d'une partie a l'autre ;
//  - la partie en cours est sauvegardee.
// =====================================================================

import { enregistrerJeu, finDePartie, quitterJeu, overlayOuvert, meilleursScores, majScoreCourant } from "./arcade.js";
import { surTouche } from "./noyau/clavier.js";
import { surGlissement } from "./noyau/tactile.js";
import { creerStockage } from "./noyau/stockage.js";
import { jouer, basculerSon, sonActif } from "./noyau/son.js";

const ID = "2048";
const COTE = 4;
const DUREE_GLISSEMENT = 110;
const ANNULATIONS_MAX = 3;

// ---------------------------------------------------------------------
// La section est reconstruite ici
// ---------------------------------------------------------------------

const zone = document.getElementById("jeu2048");
zone.innerHTML = `
  <div class="jeu-entete entete-2048">
    <span class="jeu-score score-principal">Score <strong class="valeur-score" id="score2048">0</strong></span>
    <span class="jeu-score">Record <strong id="meilleur2048">0</strong></span>
    <span class="jeu-score annulations-2048">Annuler <strong id="annulations2048">1</strong></span>
  </div>
  <div class="barre-2048">
    <button class="jeu-quitter" id="annuler2048" type="button">Annuler</button>
    <button class="jeu-quitter" id="ouvrirCarnet2048" type="button">Carnet</button>
    <button class="jeu-quitter" id="son2048" type="button" aria-pressed="false">Son</button>
    <button class="jeu-quitter" id="nouvelle2048" type="button">Nouvelle partie</button>
    <button class="jeu-quitter" id="quitter2048" type="button">Retour</button>
  </div>
  <p class="message-2048" id="message2048" aria-live="polite"></p>
  <div class="plateau-2048" id="grille2048">
    <div class="fond-2048" id="fond2048"></div>
    <div class="tuiles-2048" id="tuiles2048"></div>
    <div class="carnet-2048" id="carnet2048" hidden>
      <div class="carnet-entete">
        <span class="carnet-titre">Carnet</span>
        <button class="jeu-quitter" id="fermerCarnet2048" type="button">Fermer</button>
      </div>
      <ol class="carnet-liste" id="carnetListe2048"></ol>
    </div>
  </div>
  <p class="jeu-aide">Fl&egrave;ches ou Z Q S D, ou glisse le doigt. Deux tuiles identiques fusionnent et &eacute;voluent. U annuler, C carnet, M son, N nouvelle partie, &Eacute;chap quitter.</p>
`;

const plateau = document.getElementById("grille2048");
const fond = document.getElementById("fond2048");
const calque = document.getElementById("tuiles2048");
const zoneScore = document.getElementById("score2048");
const zoneMeilleur = document.getElementById("meilleur2048");
const zoneAnnulations = document.getElementById("annulations2048");
const zoneMessage = document.getElementById("message2048");
const carnet = document.getElementById("carnet2048");
const carnetListe = document.getElementById("carnetListe2048");
const boutonAnnuler = document.getElementById("annuler2048");
const boutonCarnet = document.getElementById("ouvrirCarnet2048");
const boutonFermerCarnet = document.getElementById("fermerCarnet2048");
const boutonSon = document.getElementById("son2048");
const boutonNouvelle = document.getElementById("nouvelle2048");
const boutonQuitter = document.getElementById("quitter2048");

for (let i = 0; i < COTE * COTE; i++) {
  const caseVide = document.createElement("div");
  caseVide.className = "case-2048";
  fond.appendChild(caseVide);
}

// ---------------------------------------------------------------------
// Les paliers : icone pixel, nom, nom japonais, couleurs
// ---------------------------------------------------------------------

const PALETTE = {
  w: "#ede8df", n: "#141414", r: "#c8372d", p: "#e88aa0", g: "#7fa32f", d: "#4a6b1c",
  b: "#8a6644", f: "#4a3622", o: "#d8873a", y: "#e8c547", s: "#9a9a92", c: "#d8c9a8",
  l: "#9fc43f", k: "#5a8fa8", m: "#2a1e14"
};

const PALIERS = {
  2: { nom: "Grain de riz", jp: "米", fond: "#efe6d2", texte: "#4a3a2a", icone: [
    "..........", "..........", "....ww....", "...wwww...", "...wwww...",
    "...wwcw...", "....wc....", "..........", "..........", ".........."] },
  4: { nom: "Onigiri", jp: "おにぎり", fond: "#f2d59c", texte: "#4a3a2a", icone: [
    "....ww....", "...wwww...", "..wwwwww..", "..wwwwww..", ".wwwwwwww.",
    ".wwwwwwww.", "wwnnnnnnww", "wwnnnnnnww", "wwnnnnnnww", ".wnnnnnnw."] },
  8: { nom: "Dango", jp: "団子", fond: "#f4a7b9", texte: "#5a1a2e", icone: [
    "....pp....", "...pppp...", "...pppp...", "....ww....", "...wwww...",
    "...wwww...", "....gg....", "...gggg...", "...gggg...", "....bb...."] },
  16: { nom: "Mochi", jp: "餅", fond: "#cfe3a4", texte: "#2f4a12", icone: [
    "..........", "...wwww...", "..wwwwww..", ".wwwwwwww.", ".wwwppwww.",
    ".wwwwwwww.", ".cwwwwwwc.", "..cccccc..", "..........", ".........."] },
  32: { nom: "Daruma", jp: "達磨", fond: "#e8735f", texte: "#ffffff", icone: [
    "...rrrr...", "..rrrrrr..", ".rrwwwwrr.", ".rwnwwnwr.", ".rwwwwwwr.",
    ".rrwwwwrr.", "rrrrrrrrrr", "rryrrrryrr", ".rrrrrrrr.", "..rrrrrr.."] },
  64: { nom: "Maneki-neko", jp: "招き猫", fond: "#f0c43a", texte: "#4a3200", icone: [
    ".w....w.ww", ".ww..ww.ww", ".wwwwww.ww", ".wnwwnw.w.", ".wwppww.w.",
    ".wwwwwwww.", "..wrrrrw..", "..wwywww..", "..wwwwww..", "..ww..ww.."] },
  128: { nom: "Kitsune", jp: "狐", fond: "#ef8a3a", texte: "#ffffff", icone: [
    "o........o", "oo......oo", "ooo....ooo", "oooooooooo", "oonoooonoo",
    "owwoooowwo", ".owwwwwwo.", "..owwwwo..", "...wnnw...", "....ww...."] },
  256: { nom: "Kappa", jp: "河童", fond: "#5fb38a", texte: "#ffffff", icone: [
    "...kkkk...", "..dkkkkd..", ".gggggggg.", ".gnggggng.", ".gggggggg.",
    ".ggyyyygg.", "..gggggg..", ".bbbbbbbb.", "bbbbffbbbb", ".bbbbbbbb."] },
  512: { nom: "Tengu", jp: "天狗", fond: "#d8463a", texte: "#ffffff", icone: [
    "...nnnn...", "..nnnnnn..", ".rrrrrrrr.", ".rnnrrnnr.", ".rwnrrnwr.",
    ".rrrrrrrrr", ".rrrrrrrr.", ".rwwwwwwr.", "..wwwwww..", "...wwww..."] },
  1024: { nom: "Oni", jp: "鬼", fond: "#4f7fc4", texte: "#ffffff", icone: [
    "y........y", "yy......yy", ".ykkkkkky.", ".kkkkkkkk.", ".kwnkknwk.",
    ".kkkkkkkk.", ".knnnnnnk.", ".knwnnwnk.", "..kkkkkk..", "...kkkk..."] },
  2048: { nom: "Tanuki doré", jp: "金狸", fond: "#e8b52a", texte: "#3a2400", icone: [
    "..f....f..", ".fyf..fyf.", ".fyyyyyyf.", "fymmyymmyf", "fmwmyymwmf",
    "fymmwwmmyf", ".fywwnwyf.", ".fywwwwyf.", "..fyyyyf..", "...ffff..."] },
  4096: { nom: "Torii", jp: "鳥居", fond: "#c8372d", texte: "#ffffff", icone: [
    "rrrrrrrrrr", ".rrrrrrrr.", "..r....r..", "rrrrrrrrrr", "..r....r..",
    "..r....r..", "..r....r..", "..r....r..", ".nn....nn.", ".........."] },
  8192: { nom: "Mont Fuji", jp: "富士", fond: "#3b4a7a", texte: "#ffffff", icone: [
    "..........", "....ww....", "...wwww...", "..wwkkww..", "..kkkkkk..",
    ".kkkkkkkk.", ".kkkkkkkk.", "kkkkkkkkkk", "gggggggggg", ".........."] }
};
const ETOILE = { nom: "Étoile", jp: "星", fond: "#9fc43f", texte: "#141414", icone: [
  "....ll....", "....ll....", "...llll...", "llllllllll", ".llllllll.",
  "..llllll..", "..ll..ll..", ".ll....ll.", "..........", ".........."] };
const VALEURS = Object.keys(PALIERS).map(Number);

function palier(valeur) {
  return PALIERS[valeur] || ETOILE;
}

// Chaque icone est dessinee une fois en grand (160 px), puis servie en
// image : nette sur tous les ecrans. Dessins faits main, en aplats et
// en volume, avec un petit visage pour les mets du sanctuaire.
const TAILLE_ICONE = 160;
const icones = {};

function visage(c, x, y, e, couleurYeux, joues) {
  // Deux yeux, une bouche en sourire, deux joues roses
  c.fillStyle = couleurYeux || "#2a1a14";
  c.beginPath();
  c.ellipse(x - 12 * e, y, 3.6 * e, 4.6 * e, 0, 0, Math.PI * 2);
  c.ellipse(x + 12 * e, y, 3.6 * e, 4.6 * e, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#ffffff";
  c.beginPath();
  c.arc(x - 11 * e, y - 1.6 * e, 1.3 * e, 0, Math.PI * 2);
  c.arc(x + 13 * e, y - 1.6 * e, 1.3 * e, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = couleurYeux || "#2a1a14";
  c.lineWidth = 2.4 * e;
  c.lineCap = "round";
  c.beginPath();
  c.arc(x, y + 5 * e, 4 * e, 0.15 * Math.PI, 0.85 * Math.PI);
  c.stroke();
  if (joues !== false) {
    c.fillStyle = "rgba(240,110,140,0.55)";
    c.beginPath();
    c.ellipse(x - 20 * e, y + 7 * e, 5 * e, 3 * e, 0, 0, Math.PI * 2);
    c.ellipse(x + 20 * e, y + 7 * e, 5 * e, 3 * e, 0, 0, Math.PI * 2);
    c.fill();
  }
}

function ombre(c, x, y, rx) {
  c.fillStyle = "rgba(0,0,0,0.22)";
  c.beginPath();
  c.ellipse(x, y, rx, rx * 0.22, 0, 0, Math.PI * 2);
  c.fill();
}

function degradeRadial(c, x, y, r, clair, base, sombre) {
  const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * 1.1);
  g.addColorStop(0, clair);
  g.addColorStop(0.55, base);
  g.addColorStop(1, sombre);
  return g;
}

const DESSINS_2048 = {
  2(c) {
    // Trois grains de riz
    [[-18, 8, -0.5], [6, -6, 0.3], [16, 18, -0.2]].forEach(([dx, dy, a]) => {
      c.save();
      c.translate(80 + dx, 80 + dy);
      c.rotate(a);
      c.fillStyle = "rgba(0,0,0,0.18)";
      c.beginPath();
      c.ellipse(3, 4, 13, 22, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = degradeRadial(c, 0, 0, 22, "#ffffff", "#f6f1e6", "#cfc4ad");
      c.beginPath();
      c.ellipse(0, 0, 13, 22, 0, 0, Math.PI * 2);
      c.fill();
      c.restore();
    });
  },
  4(c) {
    ombre(c, 80, 132, 46);
    c.fillStyle = degradeRadial(c, 80, 80, 56, "#ffffff", "#f7f3ea", "#d8cfbd");
    c.beginPath();
    c.moveTo(80, 26);
    c.quadraticCurveTo(96, 26, 124, 98);
    c.quadraticCurveTo(134, 128, 104, 128);
    c.lineTo(56, 128);
    c.quadraticCurveTo(26, 128, 36, 98);
    c.quadraticCurveTo(64, 26, 80, 26);
    c.fill();
    c.fillStyle = "#1f2a24";
    c.beginPath();
    c.roundRect(52, 96, 56, 32, 4);
    c.fill();
    c.fillStyle = "rgba(255,255,255,0.12)";
    c.fillRect(56, 100, 48, 4);
    visage(c, 80, 74, 0.9);
  },
  8(c) {
    // Brochette de dango
    c.strokeStyle = "#b0814a";
    c.lineWidth = 6;
    c.lineCap = "round";
    c.beginPath();
    c.moveTo(80, 18);
    c.lineTo(80, 146);
    c.stroke();
    [["#ffd0dc", "#f28fab", "#b8506c", 42], ["#ffffff", "#f3eee2", "#c9bfa9", 80], ["#d6f0a8", "#9cc65a", "#5d8a2c", 118]].forEach(([cl, b, s, y]) => {
      c.fillStyle = "rgba(0,0,0,0.18)";
      c.beginPath();
      c.arc(83, y + 4, 22, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = degradeRadial(c, 80, y, 22, cl, b, s);
      c.beginPath();
      c.arc(80, y, 22, 0, Math.PI * 2);
      c.fill();
    });
    visage(c, 80, 78, 0.6, "#2a1a14", true);
  },
  16(c) {
    ombre(c, 80, 128, 52);
    c.fillStyle = degradeRadial(c, 80, 88, 56, "#ffffff", "#f6efe6", "#d9cbbd");
    c.beginPath();
    c.ellipse(80, 92, 56, 40, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#f6b8c8";
    c.beginPath();
    c.ellipse(80, 60, 18, 8, 0, 0, Math.PI * 2);
    c.fill();
    visage(c, 80, 92, 1);
  },
  32(c) {
    ombre(c, 80, 140, 50);
    c.fillStyle = degradeRadial(c, 80, 84, 58, "#ff8f80", "#d42a1c", "#6e110a");
    c.beginPath();
    c.ellipse(80, 86, 52, 58, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#fbefd8";
    c.beginPath();
    c.ellipse(80, 72, 32, 27, 0, 0, Math.PI * 2);
    c.fill();
    // Yeux ronds sans pupille d'un cote, comme un vrai daruma
    c.fillStyle = "#1a1018";
    c.beginPath();
    c.arc(68, 70, 7, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "#1a1018";
    c.lineWidth = 2.5;
    c.beginPath();
    c.arc(92, 70, 7, 0, Math.PI * 2);
    c.stroke();
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(56, 56);
    c.quadraticCurveTo(66, 50, 74, 57);
    c.moveTo(104, 56);
    c.quadraticCurveTo(94, 50, 86, 57);
    c.stroke();
    c.fillStyle = "#e8b83a";
    c.beginPath();
    c.roundRect(62, 112, 36, 10, 4);
    c.fill();
  },
  64(c) {
    // Maneki-neko : chat blanc, patte levee, collier rouge
    ombre(c, 80, 146, 46);
    c.fillStyle = degradeRadial(c, 80, 100, 50, "#ffffff", "#f4efe6", "#cfc5b4");
    c.beginPath();
    c.ellipse(80, 112, 40, 32, 0, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.ellipse(80, 66, 38, 32, 0, 0, Math.PI * 2);
    c.fill();
    // Oreilles
    c.beginPath();
    c.moveTo(46, 52);
    c.lineTo(52, 24);
    c.lineTo(70, 40);
    c.moveTo(114, 52);
    c.lineTo(108, 24);
    c.lineTo(90, 40);
    c.fill();
    c.fillStyle = "#f6a3b6";
    c.beginPath();
    c.moveTo(53, 44);
    c.lineTo(55, 31);
    c.lineTo(64, 40);
    c.moveTo(107, 44);
    c.lineTo(105, 31);
    c.lineTo(96, 40);
    c.fill();
    // Patte levee
    c.fillStyle = "#f4efe6";
    c.beginPath();
    c.ellipse(124, 66, 12, 20, 0.3, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "#cfc5b4";
    c.lineWidth = 2;
    c.stroke();
    c.fillStyle = "#c8261a";
    c.beginPath();
    c.roundRect(50, 92, 60, 9, 4);
    c.fill();
    c.fillStyle = "#f2c230";
    c.beginPath();
    c.arc(80, 104, 7, 0, Math.PI * 2);
    c.fill();
    visage(c, 80, 66, 0.9);
  },
  128(c) {
    // Kitsune
    ombre(c, 80, 136, 44);
    c.fillStyle = degradeRadial(c, 80, 80, 60, "#ffc27a", "#ef8a2a", "#9a4a0e");
    c.beginPath();
    c.moveTo(30, 30);
    c.lineTo(60, 52);
    c.lineTo(100, 52);
    c.lineTo(130, 30);
    c.lineTo(126, 80);
    c.quadraticCurveTo(110, 124, 80, 132);
    c.quadraticCurveTo(50, 124, 34, 80);
    c.closePath();
    c.fill();
    c.fillStyle = "#fff6ea";
    c.beginPath();
    c.moveTo(42, 84);
    c.quadraticCurveTo(62, 92, 80, 132);
    c.quadraticCurveTo(98, 92, 118, 84);
    c.quadraticCurveTo(110, 118, 80, 132);
    c.quadraticCurveTo(50, 118, 42, 84);
    c.fill();
    c.fillStyle = "#2a1a14";
    c.beginPath();
    c.ellipse(80, 122, 6, 4, 0, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "#2a1a14";
    c.lineWidth = 4;
    c.lineCap = "round";
    c.beginPath();
    c.moveTo(56, 76);
    c.quadraticCurveTo(62, 70, 70, 76);
    c.moveTo(90, 76);
    c.quadraticCurveTo(98, 70, 104, 76);
    c.stroke();
    c.fillStyle = "#c8261a";
    c.beginPath();
    c.ellipse(52, 66, 5, 3, -0.5, 0, Math.PI * 2);
    c.ellipse(108, 66, 5, 3, 0.5, 0, Math.PI * 2);
    c.fill();
  },
  256(c) {
    // Kappa et son assiette d'eau
    ombre(c, 80, 140, 46);
    c.fillStyle = degradeRadial(c, 80, 86, 56, "#b7e07a", "#6fae32", "#2f5a12");
    c.beginPath();
    c.ellipse(80, 88, 50, 48, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#3f6e1c";
    for (let i = 0; i < 7; i++) {
      const a = Math.PI + (i / 6) * Math.PI;
      c.beginPath();
      c.ellipse(80 + Math.cos(a) * 44, 58 + Math.sin(a) * 18, 9, 6, a, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = "#cfeaf2";
    c.beginPath();
    c.ellipse(80, 46, 28, 10, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#5aa6c4";
    c.beginPath();
    c.ellipse(80, 47, 20, 6, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#f2c230";
    c.beginPath();
    c.ellipse(80, 108, 18, 9, 0, 0, Math.PI * 2);
    c.fill();
    visage(c, 80, 84, 1, "#1a2a10", false);
  },
  512(c) {
    // Tengu : visage rouge, long nez, petit chapeau noir
    ombre(c, 80, 140, 44);
    c.fillStyle = degradeRadial(c, 80, 86, 54, "#ff8a7a", "#d6402e", "#7e1a12");
    c.beginPath();
    c.ellipse(80, 90, 46, 46, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#1c1a24";
    c.beginPath();
    c.moveTo(62, 48);
    c.lineTo(80, 22);
    c.lineTo(98, 48);
    c.closePath();
    c.fill();
    c.fillStyle = "#ffffff";
    c.beginPath();
    c.ellipse(80, 132, 30, 12, 0, 0, Math.PI);
    c.fill();
    c.strokeStyle = "#1a1018";
    c.lineWidth = 5;
    c.lineCap = "round";
    c.beginPath();
    c.moveTo(56, 70);
    c.lineTo(72, 76);
    c.moveTo(104, 70);
    c.lineTo(88, 76);
    c.stroke();
    c.fillStyle = "#1a1018";
    c.beginPath();
    c.arc(64, 84, 4, 0, Math.PI * 2);
    c.arc(96, 84, 4, 0, Math.PI * 2);
    c.fill();
    // Le nez, qui sort du visage
    c.fillStyle = degradeRadial(c, 100, 100, 26, "#ff9a8a", "#c8372d", "#7e1a12");
    c.beginPath();
    c.moveTo(76, 92);
    c.quadraticCurveTo(110, 92, 136, 108);
    c.quadraticCurveTo(110, 112, 76, 108);
    c.closePath();
    c.fill();
  },
  1024(c) {
    // Oni bleu, cornes jaunes, crocs
    ombre(c, 80, 140, 46);
    c.fillStyle = "#f2c230";
    c.beginPath();
    c.moveTo(42, 56);
    c.lineTo(34, 18);
    c.lineTo(58, 46);
    c.moveTo(118, 56);
    c.lineTo(126, 18);
    c.lineTo(102, 46);
    c.fill();
    c.fillStyle = degradeRadial(c, 80, 88, 56, "#9cc4f2", "#4f7fc4", "#1f3a6a");
    c.beginPath();
    c.ellipse(80, 90, 50, 48, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#1a1018";
    c.beginPath();
    c.moveTo(48, 64);
    c.lineTo(76, 74);
    c.lineTo(48, 74);
    c.closePath();
    c.moveTo(112, 64);
    c.lineTo(84, 74);
    c.lineTo(112, 74);
    c.closePath();
    c.fill();
    c.fillStyle = "#f2e64a";
    c.beginPath();
    c.arc(62, 72, 4, 0, Math.PI * 2);
    c.arc(98, 72, 4, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#3a0e14";
    c.beginPath();
    c.roundRect(52, 100, 56, 22, 8);
    c.fill();
    c.fillStyle = "#ffffff";
    c.beginPath();
    c.moveTo(58, 100);
    c.lineTo(64, 112);
    c.lineTo(70, 100);
    c.moveTo(90, 100);
    c.lineTo(96, 112);
    c.lineTo(102, 100);
    c.fill();
  },
  2048(c) {
    // Le tanuki dore : masque sombre, oreilles rondes, feuille sur la tete
    ombre(c, 80, 142, 48);
    c.fillStyle = "#8a5d06";
    c.beginPath();
    c.arc(42, 44, 16, 0, Math.PI * 2);
    c.arc(118, 44, 16, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = degradeRadial(c, 80, 84, 60, "#fff3b0", "#f2b919", "#8a5d06");
    c.beginPath();
    c.ellipse(80, 88, 54, 50, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#4a2e08";
    c.beginPath();
    c.ellipse(57, 82, 16, 12, -0.35, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.ellipse(103, 82, 16, 12, 0.35, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#fff8de";
    c.beginPath();
    c.ellipse(80, 110, 20, 14, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#ffffff";
    c.beginPath();
    c.arc(60, 82, 7, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.arc(100, 82, 7, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#1a1018";
    c.beginPath();
    c.arc(61, 83, 4, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.arc(99, 83, 4, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.ellipse(80, 103, 7, 5, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#7fbf2a";
    c.beginPath();
    c.ellipse(84, 34, 18, 9, -0.6, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "#3f6912";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(70, 44);
    c.lineTo(98, 26);
    c.stroke();
  },
  4096(c) {
    ombre(c, 80, 140, 52);
    c.fillStyle = "#1c1a24";
    c.fillRect(44, 128, 14, 8);
    c.fillRect(102, 128, 14, 8);
    c.fillStyle = "#e0412f";
    c.fillRect(46, 52, 10, 78);
    c.fillRect(104, 52, 10, 78);
    c.fillRect(36, 60, 88, 9);
    c.fillStyle = "#1c1a24";
    c.beginPath();
    c.moveTo(20, 36);
    c.quadraticCurveTo(80, 46, 140, 36);
    c.lineTo(136, 48);
    c.quadraticCurveTo(80, 56, 24, 48);
    c.closePath();
    c.fill();
    c.fillStyle = "#e0412f";
    c.fillRect(30, 46, 100, 8);
  },
  8192(c) {
    c.fillStyle = "#e0412f";
    c.beginPath();
    c.arc(118, 46, 16, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#4a6aa8";
    c.beginPath();
    c.moveTo(14, 132);
    c.lineTo(62, 56);
    c.quadraticCurveTo(80, 48, 98, 56);
    c.lineTo(146, 132);
    c.closePath();
    c.fill();
    c.fillStyle = "#ffffff";
    c.beginPath();
    c.moveTo(62, 56);
    c.quadraticCurveTo(80, 48, 98, 56);
    c.lineTo(110, 76);
    c.lineTo(98, 70);
    c.lineTo(88, 80);
    c.lineTo(80, 70);
    c.lineTo(72, 80);
    c.lineTo(62, 70);
    c.lineTo(50, 76);
    c.closePath();
    c.fill();
  },
  etoile(c) {
    c.fillStyle = degradeRadial(c, 80, 80, 60, "#f4ffb8", "#c6f35a", "#5a7a1a");
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
      const r = i % 2 ? 26 : 60;
      c.lineTo(80 + Math.cos(a) * r, 84 + Math.sin(a) * r);
    }
    c.closePath();
    c.fill();
    visage(c, 80, 84, 0.8);
  }
};

function icone(valeur) {
  const cle = PALIERS[valeur] ? valeur : "etoile";
  if (icones[cle] === undefined) {
    const toile = document.createElement("canvas");
    toile.width = TAILLE_ICONE;
    toile.height = TAILLE_ICONE;
    const c2 = toile.getContext("2d");
    (DESSINS_2048[cle] || DESSINS_2048.etoile)(c2);
    icones[cle] = toile.toDataURL();
  }
  return icones[cle];
}

// ---------------------------------------------------------------------
// Etat
// ---------------------------------------------------------------------

const stockage = creerStockage("tanuki-arcade-2048");
const stockageCarnet = creerStockage("tanuki-arcade-2048-carnet");

let tuiles = new Map();     // id -> { id, valeur, x, y, element }
let grille = [];            // grille[y][x] = id ou 0
let prochainId = 1;
let score = 0;
let meilleur = 0;
let annulations = 1;
let palierPartie = 2;       // plus haut palier atteint dans cette partie
let precedent = null;       // instantane pour l'annulation
let terminee = false;
let objectifAtteint = false;
let animation = null;       // { fin: fonction } pendant un glissement
let decouvertMax = Math.max(2, Number(stockageCarnet.lire()) || 2);

function grilleVide() {
  return Array.from({ length: COTE }, () => Array(COTE).fill(0));
}

function valeurs() {
  return grille.map(ligne => ligne.map(id => (id ? tuiles.get(id).valeur : 0)));
}

function sauver() {
  stockage.ecrire({
    grille: valeurs(),
    score,
    objectif: objectifAtteint,
    annulations,
    palier: palierPartie
  });
}

// ---------------------------------------------------------------------
// Tuiles a l'ecran
// ---------------------------------------------------------------------

function remplirTuile(element, valeur) {
  const def = palier(valeur);
  element.style.setProperty("--fond-tuile", def.fond);
  element.style.setProperty("--texte-tuile", def.texte);
  element.dataset.chiffres = String(String(valeur).length);
  const corps = element.firstElementChild;
  corps.innerHTML = "";
  const image = document.createElement("img");
  image.className = "icone-2048";
  image.alt = "";
  image.src = icone(valeur);
  const nombre = document.createElement("span");
  nombre.className = "nombre-2048";
  nombre.textContent = String(valeur);
  corps.append(image, nombre);
  element.setAttribute("aria-label", def.nom + ", " + valeur);
}

function placerElement(tuile) {
  tuile.element.style.setProperty("--x", tuile.x);
  tuile.element.style.setProperty("--y", tuile.y);
}

function creerTuile(valeur, x, y, classe) {
  const id = prochainId++;
  const element = document.createElement("div");
  element.className = "tuile-2048" + (classe ? " " + classe : "");
  const corps = document.createElement("div");
  corps.className = "corps-2048";
  element.appendChild(corps);
  const tuile = { id, valeur, x, y, element };
  remplirTuile(element, valeur);
  placerElement(tuile);
  calque.appendChild(element);
  tuiles.set(id, tuile);
  grille[y][x] = id;
  return tuile;
}

function reconstruire(depuis) {
  calque.innerHTML = "";
  tuiles = new Map();
  grille = grilleVide();
  depuis.forEach((ligne, y) => ligne.forEach((v, x) => {
    if (v) {
      creerTuile(v, x, y, "");
    }
  }));
}

function casesLibres() {
  const libres = [];
  for (let y = 0; y < COTE; y++) {
    for (let x = 0; x < COTE; x++) {
      if (!grille[y][x]) {
        libres.push({ x, y });
      }
    }
  }
  return libres;
}

// 90 % de grains de riz, 10 % d'onigiri, comme le 2048 d'origine
function ajouterTuile() {
  const libres = casesLibres();
  if (libres.length === 0) {
    return;
  }
  const place = libres[Math.floor(Math.random() * libres.length)];
  creerTuile(Math.random() < 0.9 ? 2 : 4, place.x, place.y, "apparait");
}

// ---------------------------------------------------------------------
// Deplacement
// ---------------------------------------------------------------------

const VECTEURS = {
  gauche: { x: -1, y: 0 },
  droite: { x: 1, y: 0 },
  haut: { x: 0, y: -1 },
  bas: { x: 0, y: 1 }
};

// Fin immediate d'un glissement en cours, pour enchainer les coups vite
function finirAnimation() {
  if (animation !== null) {
    const fin = animation.fin;
    clearTimeout(animation.chrono);
    animation = null;
    fin();
  }
}

function deplacer(direction) {
  if (terminee || !carnet.hidden) {
    return;
  }
  finirAnimation();
  const fete = plateau.querySelector(".fete-2048");
  if (fete) {
    fete.remove();
  }
  const v = VECTEURS[direction];
  const instantane = { grille: valeurs(), score, palier: palierPartie };
  const ordre = [0, 1, 2, 3];
  const xs = v.x > 0 ? ordre.slice().reverse() : ordre;
  const ys = v.y > 0 ? ordre.slice().reverse() : ordre;

  const nouvelle = grilleVide();
  const absorbees = [];       // tuiles qui disparaissent dans une autre
  const fusions = [];         // tuiles qui doublent
  let aBouge = false;
  let gagne = 0;

  const lignes = v.x !== 0 ? ys : xs;
  lignes.forEach(indexLigne => {
    let derniere = null;
    let position = 0;
    const parcours = v.x !== 0 ? xs : ys;
    parcours.forEach(indexCase => {
      const x = v.x !== 0 ? indexCase : indexLigne;
      const y = v.x !== 0 ? indexLigne : indexCase;
      const id = grille[y][x];
      if (!id) {
        return;
      }
      const tuile = tuiles.get(id);
      if (derniere !== null && derniere.valeur === tuile.valeur && !derniere.fusionnee) {
        // Elle glisse jusqu'a la precedente et s'y fond
        derniere.fusionnee = true;
        absorbees.push({ tuile, x: derniere.cibleX, y: derniere.cibleY });
        fusions.push(derniere);
        gagne += tuile.valeur * 2;
        aBouge = true;
        return;
      }
      const cible = v.x > 0 || v.y > 0 ? COTE - 1 - position : position;
      tuile.cibleX = v.x !== 0 ? cible : x;
      tuile.cibleY = v.x !== 0 ? y : cible;
      tuile.fusionnee = false;
      if (tuile.cibleX !== x || tuile.cibleY !== y) {
        aBouge = true;
      }
      nouvelle[tuile.cibleY][tuile.cibleX] = id;
      position++;
      derniere = tuile;
    });
  });

  if (!aBouge) {
    if (!coupPossible()) {
      terminer();
    }
    return false;
  }

  precedent = instantane;
  grille = nouvelle;
  tuiles.forEach(tuile => {
    if (tuile.cibleX !== undefined && !absorbees.some(a => a.tuile === tuile)) {
      tuile.x = tuile.cibleX;
      tuile.y = tuile.cibleY;
      placerElement(tuile);
    }
  });
  absorbees.forEach(a => {
    a.tuile.x = a.x;
    a.tuile.y = a.y;
    placerElement(a.tuile);
    a.tuile.element.classList.add("absorbee");
  });

  // Score et combo
  score += gagne;
  if (fusions.length >= 2) {
    const bonus = Math.round(gagne * 0.25 * (fusions.length - 1));
    score += bonus;
    annoncer("Combo x" + fusions.length + "  +" + bonus);
    jouer("combo", fusions.length);
  } else if (fusions.length === 1) {
    jouer("bonus");
  } else {
    jouer("clic");
  }

  // A la fin du glissement : on retire les absorbees et on fait evoluer
  const fin = () => {
    absorbees.forEach(a => {
      a.tuile.element.remove();
      tuiles.delete(a.tuile.id);
    });
    fusions.forEach(tuile => {
      tuile.valeur *= 2;
      remplirTuile(tuile.element, tuile.valeur);
      tuile.element.classList.remove("fusion", "apparait");
      void tuile.element.offsetWidth;
      tuile.element.classList.add("fusion");
      verifierPalier(tuile.valeur);
      gainVolant(tuile);
    });
    ajouterTuile();
    sauver();
    majEntete();
    if (!coupPossible()) {
      terminer();
    }
  };
  animation = { fin, chrono: setTimeout(() => { animation = null; fin(); }, DUREE_GLISSEMENT) };
  majEntete();
  return true;
}

// Le gain d'une fusion monte au-dessus de la tuile et s'efface
function gainVolant(tuile) {
  const gain = document.createElement("span");
  gain.className = "gain-2048";
  gain.textContent = "+" + tuile.valeur.toLocaleString("fr-BE");
  gain.style.setProperty("--x", tuile.x);
  gain.style.setProperty("--y", tuile.y);
  calque.appendChild(gain);
  setTimeout(() => gain.remove(), 750);
}

// 2048 atteint : on le fete, puis la partie continue sans fin
function celebrer() {
  const fete = document.createElement("div");
  fete.className = "fete-2048";
  const couleurs = ["#e8b52a", "#e0412f", "#7fbf2a", "#4f7fc4", "#f4a7b9", "#ede8df"];
  for (let i = 0; i < 46; i++) {
    const morceau = document.createElement("i");
    morceau.style.left = (Math.random() * 100) + "%";
    morceau.style.background = couleurs[i % couleurs.length];
    morceau.style.animationDelay = (Math.random() * 0.5) + "s";
    morceau.style.setProperty("--derive", ((Math.random() - 0.5) * 120) + "px");
    morceau.style.setProperty("--tour", (Math.random() * 720 - 360) + "deg");
    fete.appendChild(morceau);
  }
  const carte = document.createElement("div");
  carte.className = "fete-carte";
  const image = document.createElement("img");
  image.src = icone(2048);
  image.alt = "";
  const titre = document.createElement("strong");
  titre.textContent = "Tanuki doré !";
  const texte = document.createElement("span");
  texte.textContent = "2048 atteint. La partie continue : jusqu'où iras-tu ?";
  const bouton = document.createElement("button");
  bouton.type = "button";
  bouton.className = "jeu-quitter";
  bouton.textContent = "Continuer";
  const fermer = () => fete.remove();
  bouton.addEventListener("click", fermer);
  carte.append(image, titre, texte, bouton);
  fete.appendChild(carte);
  plateau.appendChild(fete);
  setTimeout(fermer, 6000);
}

function verifierPalier(valeur) {
  if (valeur > palierPartie) {
    palierPartie = valeur;
    const def = palier(valeur);
    let texte = def.nom + "  " + def.jp;
    if (valeur >= 16 && annulations < ANNULATIONS_MAX) {
      annulations++;
      texte += "  ·  annulation +1";
    }
    if (valeur > decouvertMax) {
      decouvertMax = valeur;
      stockageCarnet.ecrire(decouvertMax);
      texte = "Nouveau dans le carnet : " + texte;
      jouer("pouvoir");
    }
    annoncer(texte);
  }
  if (!objectifAtteint && valeur >= 2048) {
    objectifAtteint = true;
    jouer("vie");
    celebrer();
  }
}

function coupPossible() {
  if (casesLibres().length > 0) {
    return true;
  }
  const v = valeurs();
  for (let y = 0; y < COTE; y++) {
    for (let x = 0; x < COTE; x++) {
      if ((x + 1 < COTE && v[y][x + 1] === v[y][x]) || (y + 1 < COTE && v[y + 1][x] === v[y][x])) {
        return true;
      }
    }
  }
  return false;
}

function terminer() {
  if (terminee) {
    return;
  }
  terminee = true;
  stockage.effacer();
  jouer("mort");
  annoncer("Plus aucun coup possible");
  plateau.classList.add("bloque");
  setTimeout(() => {
    if (terminee && !zone.hidden) {
      finDePartie(ID, score);
    }
  }, 700);
}

function annuler() {
  if (precedent === null || annulations <= 0 || !carnet.hidden) {
    if (annulations <= 0) {
      annoncer("Plus d'annulation : atteins un nouveau palier pour en regagner une");
    }
    return;
  }
  finirAnimation();
  annulations--;
  score = precedent.score;
  palierPartie = precedent.palier;
  reconstruire(precedent.grille);
  precedent = null;
  terminee = false;
  plateau.classList.remove("bloque");
  sauver();
  majEntete();
  annoncer("Coup annulé");
  jouer("clic");
}

// ---------------------------------------------------------------------
// Affichage
// ---------------------------------------------------------------------

let chronoMessage = null;
function annoncer(texte) {
  zoneMessage.textContent = texte;
  clearTimeout(chronoMessage);
  chronoMessage = setTimeout(() => { zoneMessage.textContent = ""; }, 2400);
}

function majEntete() {
  zoneScore.textContent = score.toLocaleString("fr-BE");
  zoneMeilleur.textContent = Math.max(meilleur, score).toLocaleString("fr-BE");
  zoneAnnulations.textContent = String(annulations);
  boutonAnnuler.disabled = precedent === null || annulations <= 0;
  majScoreCourant(ID, score);
}

function majBoutonSon() {
  boutonSon.textContent = sonActif() ? "Son" : "Muet";
  boutonSon.setAttribute("aria-pressed", String(!sonActif()));
}

// Le carnet montre les paliers decouverts, les autres restent des ombres
function ouvrirCarnet() {
  carnetListe.innerHTML = "";
  VALEURS.concat([16384]).forEach(valeur => {
    const def = palier(valeur);
    const connu = valeur <= decouvertMax;
    const ligne = document.createElement("li");
    ligne.className = "carnet-entree" + (connu ? "" : " inconnue");
    const image = document.createElement("img");
    image.className = "icone-2048";
    image.alt = "";
    image.src = icone(valeur);
    const texte = document.createElement("span");
    texte.className = "carnet-nom";
    texte.textContent = connu ? def.nom : "???";
    const jp = document.createElement("span");
    jp.className = "carnet-jp";
    jp.lang = "ja";
    jp.textContent = connu ? def.jp : "";
    const nombre = document.createElement("span");
    nombre.className = "carnet-nombre";
    nombre.textContent = String(valeur);
    ligne.append(image, texte, jp, nombre);
    carnetListe.appendChild(ligne);
  });
  carnet.hidden = false;
  boutonFermerCarnet.focus({ preventScroll: true });
}

function fermerCarnet() {
  carnet.hidden = true;
}

// ---------------------------------------------------------------------
// Demarrage
// ---------------------------------------------------------------------

function demarrer() {
  meilleur = (meilleursScores(ID)[0] || { score: 0 }).score;
  terminee = false;
  precedent = null;
  plateau.classList.remove("bloque");
  carnet.hidden = true;
  finirAnimation();
  const donnees = stockage.lire();
  if (donnees !== null && Array.isArray(donnees.grille) && donnees.grille.length === COTE) {
    reconstruire(donnees.grille);
    score = donnees.score || 0;
    objectifAtteint = donnees.objectif === true;
    annulations = typeof donnees.annulations === "number" ? donnees.annulations : 1;
    palierPartie = donnees.palier || Math.max(2, ...donnees.grille.flat());
    // Une ancienne sauvegarde alimente aussi le carnet
    const plusHaut = Math.max(...donnees.grille.flat());
    if (plusHaut > decouvertMax) {
      decouvertMax = plusHaut;
      stockageCarnet.ecrire(decouvertMax);
    }
  } else {
    nouvellePartie();
    return;
  }
  majEntete();
  majBoutonSon();
}

function nouvellePartie() {
  finirAnimation();
  stockage.effacer();
  reconstruire(grilleVide());
  score = 0;
  annulations = 1;
  palierPartie = 2;
  precedent = null;
  terminee = false;
  objectifAtteint = false;
  plateau.classList.remove("bloque");
  ajouterTuile();
  ajouterTuile();
  sauver();
  majEntete();
  majBoutonSon();
}

// ---------------------------------------------------------------------
// Commandes
// ---------------------------------------------------------------------

surTouche(ID, function (evenement) {
  const touche = evenement.key.toLowerCase();
  if (!carnet.hidden && (touche === "escape" || touche === "c")) {
    fermerCarnet();
  } else if (touche === "arrowleft" || touche === "q" || touche === "a") {
    deplacer("gauche");
  } else if (touche === "arrowright" || touche === "d") {
    deplacer("droite");
  } else if (touche === "arrowup" || touche === "z" || touche === "w") {
    deplacer("haut");
  } else if (touche === "arrowdown" || touche === "s") {
    deplacer("bas");
  } else if (touche === "u" || touche === "backspace") {
    annuler();
  } else if (touche === "c") {
    ouvrirCarnet();
  } else if (touche === "m") {
    basculerSon();
    majBoutonSon();
  } else if (touche === "n") {
    nouvellePartie();
  } else if (touche === "escape") {
    quitterJeu();
    return;
  } else {
    return;
  }
  evenement.preventDefault();
});

surGlissement(plateau, function (geste) {
  if (geste.tape) {
    return;
  }
  if (geste.horizontal) {
    deplacer(geste.deltaX > 0 ? "droite" : "gauche");
  } else {
    deplacer(geste.deltaY > 0 ? "bas" : "haut");
  }
}, { actif: () => !overlayOuvert && carnet.hidden });

// Le glissement ne doit jamais faire defiler la page
plateau.addEventListener("touchmove", function (evenement) {
  if (carnet.hidden) {
    evenement.preventDefault();
  }
}, { passive: false });

boutonAnnuler.addEventListener("click", annuler);
boutonCarnet.addEventListener("click", ouvrirCarnet);
boutonFermerCarnet.addEventListener("click", fermerCarnet);
boutonSon.addEventListener("click", function () {
  basculerSon();
  majBoutonSon();
});
boutonNouvelle.addEventListener("click", nouvellePartie);
boutonQuitter.addEventListener("click", quitterJeu);

// ===== Inscription dans l'arcade =====
enregistrerJeu({
  id: ID,
  nom: "2048",
  code: "2048",
  section: zone,
  demarrer,
  arreter: () => {
    finirAnimation();
    fermerCarnet();
  },
  manette: { a: "u", b: "c", start: "c", libelles: { a: "Annuler", b: "Carnet" }, repetition: false }
});
