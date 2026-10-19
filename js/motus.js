// =====================================================================
//  MOTUS - le jeu de mots de la tele, en session arcade
//  On choisit la longueur du mot (5 a 8 lettres). La premiere lettre est
//  donnee, on a six essais. Une lettre bien placee devient un carre
//  rouge, une lettre presente mais mal placee un rond jaune, sur le
//  bleu du plateau, comme a la tele. Les lettres se retournent une a
//  une. Chaque mot trouve rapporte des points et la serie continue :
//  la partie s'arrete au premier mot rate.
//
//  La serie se durcit sans fin : une lettre offerte au debut, puis
//  plus aucune, des mots aux lettres plus rares, et un chrono par mot
//  qui se resserre a partir du sixieme mot.
//  Le mode "Mot du jour" donne le meme mot a tout le monde ce jour-la.
// =====================================================================

import { enregistrerJeu, finDePartie, quitterJeu, majScoreCourant } from "./arcade.js";
import { surTouche } from "./noyau/clavier.js";
import { creerBoutonsChoix, marquerChoixActif } from "./noyau/choix.js";
import { creerStockage } from "./noyau/stockage.js";
import { jouer, basculerSon, sonActif } from "./noyau/son.js";

const ID = "motus";
const ESSAIS_MAX = 6;
const LONGUEURS = [5, 6, 7, 8];
const RANGEES_CLAVIER = ["AZERTYUIOP", "QSDFGHJKLM", "<WXCVBN>"];
const DELAI_REVELATION = 210;   // ms entre deux lettres devoilees
const DEMI_RETOURNEMENT = 160;  // la couleur change quand la case est de chant

// Paliers de la serie
const PALIER_AIDE = 3;          // avant : une lettre de plus est offerte
const PALIER_CHRONO = 5;        // a partir de ce mot, un chrono par mot

// ---------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------

const zone = document.createElement("section");
zone.className = "jeu jeu-motus";
zone.id = "jeuMotus";
zone.hidden = true;
zone.innerHTML = `
  <div class="jeu-entete entete-motus">
    <span class="jeu-score score-principal">Score <strong class="valeur-score" id="scoreMotus">0</strong></span>
    <span class="jeu-score">Série <strong id="serieMotus">0</strong></span>
    <span class="motus-boutons">
      <button class="jeu-quitter" id="statsMotus" type="button">Stats</button>
      <button class="jeu-quitter" id="sonMotus" type="button">Son</button>
      <button class="jeu-quitter" id="rejouerMotus" type="button">Rejouer</button>
      <button class="jeu-quitter" id="quitterMotus" type="button">Retour</button>
    </span>
  </div>
  <div class="scores-ligne" id="longueursMotus"></div>
  <div class="motus-plateau" id="plateauMotus">
    <div class="motus-bandeau">
      <span class="motus-logo">MOTUS</span>
      <span class="motus-info" id="infoMotus"></span>
    </div>
    <div class="motus-chrono" id="chronoMotus" hidden><span></span></div>
    <div class="motus-grille" id="grilleMotus" aria-live="polite"></div>
    <div class="motus-stats" id="panneauStatsMotus" hidden></div>
  </div>
  <p class="jeu-message motus-message" id="messageMotus"></p>
  <div class="motus-clavier" id="clavierMotus"></div>
  <p class="jeu-aide">Tape le mot au clavier, la première lettre est donnée. Entrée pour valider, Retour arrière pour effacer. Carré rouge : bien placée. Rond jaune : mal placée. Un mot raté met fin à la série. À partir du sixième mot, un chrono par mot.</p>`;
document.body.appendChild(zone);

const zoneScore = zone.querySelector("#scoreMotus");
const zoneSerie = zone.querySelector("#serieMotus");
const zoneInfo = zone.querySelector("#infoMotus");
const zoneChrono = zone.querySelector("#chronoMotus");
const zoneMessage = zone.querySelector("#messageMotus");
const zoneGrille = zone.querySelector("#grilleMotus");
const zoneClavier = zone.querySelector("#clavierMotus");
const zoneLongueurs = zone.querySelector("#longueursMotus");
const zonePlateau = zone.querySelector("#plateauMotus");
const zoneStats = zone.querySelector("#panneauStatsMotus");
const boutonSon = zone.querySelector("#sonMotus");
const boutonRejouer = zone.querySelector("#rejouerMotus");
const boutonQuitter = zone.querySelector("#quitterMotus");
const boutonStats = zone.querySelector("#statsMotus");

const stockage = creerStockage("tanuki-arcade-motus");
const stockageStats = creerStockage("tanuki-arcade-motus-stats");

// ---------------------------------------------------------------------
// Etat
// ---------------------------------------------------------------------

const reglages = Object.assign({ longueur: 6, duJour: false }, stockage.lire() || {});
const listes = {};          // longueur -> { solutions, paliers, valides: Set }

let partie = null;
let curseurClavier = { rangee: 0, colonne: 0 };
let minuteur = null;
let finEnAttente = null;

function modeChoisi() {
  return reglages.duJour ? "jour" : String(reglages.longueur);
}

function dateDuJour() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function idClassement() {
  return reglages.duJour
    ? "motus-jour-" + reglages.longueur + "-" + dateDuJour()
    : "motus-" + reglages.longueur;
}

// Rarete d'un mot : ses lettres peu courantes et ses lettres en double
// le rendent plus dur a trouver. Elle range les solutions en trois
// paliers que la serie parcourt.
const FREQUENCE = "EASINRTOLUDCMPGBVHFQYXJKWZ";

function difficulte(mot) {
  let score = 0;
  const vues = new Set();
  for (const lettre of mot) {
    score += FREQUENCE.indexOf(lettre) / 4;
    if (vues.has(lettre)) {
      score += 3;
    }
    vues.add(lettre);
  }
  return score;
}

async function chargerListe(longueur) {
  if (!listes[longueur]) {
    const module = await import("./motus/mots-" + longueur + ".js");
    const valides = new Set(module.ESSAIS);
    module.SOLUTIONS.forEach(m => valides.add(m));
    const triees = module.SOLUTIONS.slice().sort((a, b) => difficulte(a) - difficulte(b));
    const tiers = Math.ceil(triees.length / 3);
    listes[longueur] = {
      solutions: module.SOLUTIONS,
      paliers: [triees.slice(0, tiers), triees.slice(0, tiers * 2), triees],
      valides
    };
  }
  return listes[longueur];
}

// Hachage simple d'une chaine : sert de graine au mot du jour
function hacher(texte) {
  let h = 2166136261;
  for (const c of texte) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function tirerMot(liste, deja, serie) {
  if (reglages.duJour) {
    return liste.solutions[hacher("motus" + reglages.longueur + dateDuJour()) % liste.solutions.length];
  }
  // Les premiers mots viennent des plus faciles, puis tout y passe
  const palier = liste.paliers[serie < 5 ? 0 : serie < 10 ? 1 : 2];
  let mot = null;
  for (let essai = 0; essai < 40; essai++) {
    mot = palier[Math.floor(Math.random() * palier.length)];
    if (!deja.includes(mot)) {
      break;
    }
  }
  return mot;
}

function chronoPour(serie) {
  if (reglages.duJour || serie < PALIER_CHRONO) {
    return 0;
  }
  return Math.max(40, 90 - (serie - PALIER_CHRONO) * 5);
}

// ---------------------------------------------------------------------
// Statistiques par longueur : mots trouves en 1, 2... 6 essais
// ---------------------------------------------------------------------

function lireStats() {
  const toutes = stockageStats.lire() || {};
  const cle = String(reglages.longueur);
  return Object.assign({ series: 0, mots: 0, rates: 0, serieMax: 0, repartition: [0, 0, 0, 0, 0, 0] }, toutes[cle] || {});
}

function ecrireStats(stats) {
  const toutes = stockageStats.lire() || {};
  toutes[String(reglages.longueur)] = stats;
  stockageStats.ecrire(toutes);
}

function afficherStats(titre, boutons) {
  const s = lireStats();
  const max = Math.max(1, ...s.repartition);
  const reussite = s.mots + s.rates ? Math.round((s.mots / (s.mots + s.rates)) * 100) : 0;
  const dernier = partie && partie.dernierEssais ? partie.dernierEssais : 0;
  zoneStats.innerHTML =
    `<div class="stats-boite">` +
    `<h3>${titre}</h3>` +
    `<div class="stats-chiffres">` +
    `<span><strong>${s.series}</strong>séries</span>` +
    `<span><strong>${s.mots}</strong>mots</span>` +
    `<span><strong>${reussite}%</strong>réussite</span>` +
    `<span><strong>${s.serieMax}</strong>meilleure série</span>` +
    `</div>` +
    `<p class="stats-titre">Mots trouvés en ${reglages.longueur} lettres, par nombre d'essais</p>` +
    `<div class="stats-barres">` +
    s.repartition.map((n, i) => `<div class="stats-ligne"><span>${i + 1}</span><div class="stats-barre${dernier === i + 1 ? " derniere" : ""}" style="width:${Math.max(7, (n / max) * 100)}%">${n}</div></div>`).join("") +
    `</div>` +
    `<div class="stats-boutons">${boutons || `<button class="jeu-quitter" type="button" data-fermer>Fermer</button>`}</div>` +
    `</div>`;
  zoneStats.hidden = false;
  const fermer = zoneStats.querySelector("[data-fermer]");
  if (fermer) {
    fermer.addEventListener("click", () => {
      zoneStats.hidden = true;
    });
  }
}

// ---------------------------------------------------------------------
// Evaluation d'un essai, avec la gestion des lettres en double :
// d'abord les bien placees, puis les mal placees dans la limite du
// nombre de fois ou la lettre figure encore dans le mot.
// ---------------------------------------------------------------------

function evaluer(essai, mot) {
  const resultat = Array(mot.length).fill("absente");
  const restantes = {};
  for (let i = 0; i < mot.length; i++) {
    if (essai[i] === mot[i]) {
      resultat[i] = "placee";
    } else {
      restantes[mot[i]] = (restantes[mot[i]] || 0) + 1;
    }
  }
  for (let i = 0; i < mot.length; i++) {
    if (resultat[i] !== "placee" && restantes[essai[i]] > 0) {
      resultat[i] = "presente";
      restantes[essai[i]]--;
    }
  }
  return resultat;
}

// ---------------------------------------------------------------------
// Affichage
// ---------------------------------------------------------------------

function construireGrille() {
  zoneGrille.innerHTML = "";
  zoneGrille.style.setProperty("--colonnes", String(partie.mot.length));
  for (let r = 0; r < ESSAIS_MAX; r++) {
    const rangee = document.createElement("div");
    rangee.className = "motus-rangee";
    for (let c = 0; c < partie.mot.length; c++) {
      const case_ = document.createElement("span");
      case_.className = "motus-case";
      const lettre = document.createElement("b");
      case_.appendChild(lettre);
      rangee.appendChild(case_);
    }
    zoneGrille.appendChild(rangee);
  }
  ajuster();
}

function caseDe(r, c) {
  return zoneGrille.children[r].children[c];
}

function ecrire(case_, lettre) {
  case_.firstChild.textContent = lettre;
}

// La rangee en cours montre la saisie ; a defaut, les lettres deja
// trouvees, en pale, comme indice (c'est la regle de la tele)
function afficherRangeeCourante() {
  const r = partie.essais.length;
  if (r >= ESSAIS_MAX) {
    return;
  }
  for (let c = 0; c < partie.mot.length; c++) {
    const case_ = caseDe(r, c);
    case_.className = "motus-case courante";
    const lettre = partie.saisie[c];
    if (lettre) {
      ecrire(case_, lettre);
      case_.classList.add("tapee");
    } else if (partie.connues[c]) {
      ecrire(case_, partie.connues[c]);
      case_.classList.add("indice");
    } else {
      ecrire(case_, "");
    }
    case_.classList.toggle("curseur", c === partie.saisie.length && !partie.revelation);
  }
}

function construireClavier() {
  zoneClavier.innerHTML = "";
  RANGEES_CLAVIER.forEach((rangee, r) => {
    const ligne = document.createElement("div");
    ligne.className = "motus-ligne-clavier";
    [...rangee].forEach((lettre, c) => {
      const touche = document.createElement("button");
      touche.type = "button";
      touche.className = "motus-touche";
      touche.dataset.rangee = r;
      touche.dataset.colonne = c;
      if (lettre === "<") {
        touche.dataset.touche = "Backspace";
        touche.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5h12v14H8l-6-7z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M11 9l6 6M17 9l-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
        touche.setAttribute("aria-label", "Effacer");
        touche.classList.add("large");
      } else if (lettre === ">") {
        touche.dataset.touche = "Enter";
        touche.textContent = "Valider";
        touche.classList.add("large", "valider");
      } else {
        touche.dataset.touche = lettre;
        touche.textContent = lettre;
      }
      touche.addEventListener("click", () => {
        touche.blur();
        saisir(touche.dataset.touche);
      });
      ligne.appendChild(touche);
    });
    zoneClavier.appendChild(ligne);
  });
  afficherCurseurClavier();
}

function colorerClavier() {
  zoneClavier.querySelectorAll(".motus-touche").forEach(touche => {
    const etat = partie ? partie.etatsLettres[touche.dataset.touche] : null;
    touche.classList.toggle("placee", etat === "placee");
    touche.classList.toggle("presente", etat === "presente");
    touche.classList.toggle("absente", etat === "absente");
  });
}

function afficherCurseurClavier() {
  zoneClavier.querySelectorAll(".motus-touche").forEach(touche => {
    touche.classList.toggle("vise",
      Number(touche.dataset.rangee) === curseurClavier.rangee && Number(touche.dataset.colonne) === curseurClavier.colonne);
  });
}

function majEntete() {
  zoneScore.textContent = partie.score.toLocaleString("fr-BE");
  zoneSerie.textContent = String(partie.serie);
}

function afficherMessage(texte, ton) {
  zoneMessage.textContent = texte;
  zoneMessage.dataset.ton = ton || "";
}

function majBoutonSon() {
  boutonSon.textContent = sonActif() ? "Son" : "Muet";
}

function majChrono() {
  if (!partie || !partie.chrono) {
    zoneChrono.hidden = true;
    return;
  }
  zoneChrono.hidden = false;
  const reste = Math.max(0, partie.chrono - partie.secondesMot);
  const barre = zoneChrono.firstElementChild;
  barre.style.width = (reste / partie.chrono) * 100 + "%";
  zoneChrono.classList.toggle("presse", reste <= 10);
  zoneChrono.dataset.reste = reste + " s";
}

// Taille des cases et des touches : tout doit tenir au-dessus de la
// manette sur telephone, et rester confortable sur grand ecran.
function ajuster() {
  if (zone.hidden || !partie) {
    return;
  }
  const colonnes = partie.mot.length;
  const manette = document.querySelector(".manette:not([hidden])");
  const bas = (manette ? manette.getBoundingClientRect().top : window.innerHeight) - 8;
  const largeur = Math.min(window.innerWidth * 0.94, 520);
  zone.style.setProperty("--largeur-motus", largeur.toFixed(0) + "px");
  const parLargeur = (largeur - 28 - (colonnes - 1) * 6) / colonnes;
  // On cherche la plus grande grille qui laisse le clavier entier visible,
  // quitte a resserrer un peu les touches sur les petits ecrans
  let toucheH = Math.max(30, Math.min(56, (bas - 100) * 0.08));
  let taille = 0;
  for (let essai = 0; essai < 4; essai++) {
    zone.style.setProperty("--touche-h", toucheH.toFixed(0) + "px");
    const hautGrille = zoneGrille.getBoundingClientRect().top;
    const reserve = zoneClavier.getBoundingClientRect().height + (zoneMessage.getBoundingClientRect().height || 20) + 14 + 8 * 3;
    const parHauteur = (bas - hautGrille - reserve) / ESSAIS_MAX - 6;
    taille = Math.min(64, parHauteur, parLargeur);
    if (taille >= 24 || toucheH <= 28) {
      break;
    }
    toucheH -= 6;
  }
  zone.style.setProperty("--case", Math.max(16, taille).toFixed(1) + "px");
}

window.addEventListener("resize", ajuster);

// ---------------------------------------------------------------------
// Deroulement
// ---------------------------------------------------------------------

async function demarrer() {
  arreterMinuteur();
  clearTimeout(finEnAttente);
  zoneStats.hidden = true;
  marquerChoixActif(zoneLongueurs, modeChoisi(), "mode");
  afficherMessage("Chargement des mots...", "");
  const longueur = reglages.longueur;
  const liste = await chargerListe(longueur);
  if (longueur !== reglages.longueur) {
    return; // on a change de longueur pendant le chargement
  }
  partie = {
    liste,
    score: 0,
    serie: 0,
    dejaJoues: [],
    secondes: 0,
    termine: false
  };
  majScoreCourant(idClassement(), 0);
  nouveauMot();
  minuteur = setInterval(function () {
    if (partie && !partie.termine && !zone.hidden && !document.hidden && !partie.revelation) {
      partie.secondes++;
      partie.secondesMot++;
      majChrono();
      if (partie.chrono && partie.secondesMot >= partie.chrono) {
        tempsEcoule();
      } else if (partie.chrono && partie.chrono - partie.secondesMot <= 5) {
        jouer("clic");
      }
    }
  }, 1000);
}

function arreterMinuteur() {
  clearInterval(minuteur);
  minuteur = null;
}

function nouveauMot() {
  const mot = tirerMot(partie.liste, partie.dejaJoues, partie.serie);
  partie.dejaJoues.push(mot);
  partie.mot = mot;
  partie.essais = [];
  partie.saisie = [mot[0]];
  partie.connues = Array(mot.length).fill("");
  partie.connues[0] = mot[0];
  // Debut de serie : une lettre de plus offerte, comme un coup de pouce
  if (!reglages.duJour && partie.serie < PALIER_AIDE) {
    const i = 1 + Math.floor(Math.random() * (mot.length - 1));
    partie.connues[i] = mot[i];
  }
  partie.etatsLettres = {};
  partie.secondesMot = 0;
  partie.chrono = chronoPour(partie.serie);
  partie.revelation = false;
  construireGrille();
  colorerClavier();
  afficherRangeeCourante();
  majEntete();
  majChrono();
  const details = [];
  if (!reglages.duJour && partie.serie < PALIER_AIDE) {
    details.push("une lettre offerte");
  }
  if (partie.chrono) {
    details.push(partie.chrono + " s");
  }
  zoneInfo.textContent = reglages.duJour ? "Mot du jour · " + mot.length + " lettres" : "Mot " + (partie.serie + 1) + " · " + mot.length + " lettres";
  afficherMessage(details.length ? details.join(" · ") : "", "");
  // Le plateau s'allume a chaque nouveau mot
  zonePlateau.classList.remove("nouveau");
  void zonePlateau.offsetWidth;
  zonePlateau.classList.add("nouveau");
}

function saisir(touche) {
  if (!partie || partie.termine || partie.revelation) {
    return;
  }
  if (touche === "Enter") {
    valider();
    return;
  }
  if (touche === "Backspace") {
    if (partie.saisie.length > 1) {
      partie.saisie.pop();
      afficherRangeeCourante();
    }
    return;
  }
  if (/^[A-Z]$/.test(touche) && partie.saisie.length < partie.mot.length) {
    partie.saisie.push(touche);
    jouer("clic");
    afficherRangeeCourante();
    const case_ = caseDe(partie.essais.length, partie.saisie.length - 1);
    case_.classList.remove("frappe");
    void case_.offsetWidth;
    case_.classList.add("frappe");
  }
}

function secouerRangee() {
  const rangee = zoneGrille.children[partie.essais.length];
  rangee.classList.remove("refus");
  void rangee.offsetWidth;
  rangee.classList.add("refus");
}

function valider() {
  const essai = partie.saisie.join("");
  if (essai.length < partie.mot.length) {
    afficherMessage("Il manque des lettres.", "alerte");
    secouerRangee();
    return;
  }
  if (!partie.liste.valides.has(essai)) {
    afficherMessage(essai + " n'est pas dans le dictionnaire.", "alerte");
    secouerRangee();
    jouer("impact");
    return;
  }
  const resultat = evaluer(essai, partie.mot);
  const r = partie.essais.length;
  partie.essais.push(essai);
  partie.revelation = true;
  afficherMessage("", "");

  // Les lettres se retournent une a une, de gauche a droite : la case
  // pivote, et change de couleur quand on la voit de chant
  resultat.forEach((etat, c) => {
    setTimeout(() => {
      const case_ = caseDe(r, c);
      case_.className = "motus-case retourne";
      setTimeout(() => {
        case_.classList.add("revelee", etat);
        ecrire(case_, essai[c]);
        jouer(etat === "placee" ? "bonus" : etat === "presente" ? "grain" : "clic");
      }, DEMI_RETOURNEMENT);
    }, c * DELAI_REVELATION);
  });

  setTimeout(() => {
    resultat.forEach((etat, c) => {
      const lettre = essai[c];
      const avant = partie.etatsLettres[lettre];
      if (etat === "placee") {
        partie.connues[c] = lettre;
        partie.etatsLettres[lettre] = "placee";
      } else if (etat === "presente" && avant !== "placee") {
        partie.etatsLettres[lettre] = "presente";
      } else if (!avant) {
        partie.etatsLettres[lettre] = "absente";
      }
    });
    colorerClavier();
    partie.revelation = false;
    if (essai === partie.mot) {
      motTrouve();
    } else if (partie.essais.length >= ESSAIS_MAX) {
      motRate("Le mot était " + partie.mot + ".");
    } else {
      partie.saisie = [partie.mot[0]];
      afficherRangeeCourante();
    }
  }, (resultat.length - 1) * DELAI_REVELATION + DEMI_RETOURNEMENT * 2 + 80);
}

// Points : la longueur, les essais epargnes, la rapidite, et la serie
function pointsDuMot() {
  const longueur = partie.mot.length;
  const essaisEpargnes = ESSAIS_MAX - partie.essais.length;
  const base = 100 * (longueur - 3);
  const bonusEssais = essaisEpargnes * 60;
  const bonusTemps = Math.max(0, 90 - partie.secondesMot) * 2;
  const multiplicateur = 1 + partie.serie * 0.2;
  return Math.round((base + bonusEssais + bonusTemps) * multiplicateur);
}

function motTrouve() {
  const points = pointsDuMot();
  partie.score += points;
  partie.serie++;
  partie.dernierEssais = partie.essais.length;
  const stats = lireStats();
  stats.mots++;
  stats.repartition[partie.essais.length - 1]++;
  stats.serieMax = Math.max(stats.serieMax, partie.serie);
  ecrireStats(stats);
  majScoreCourant(idClassement(), partie.score);
  majEntete();
  jouer("vague");
  const rangee = zoneGrille.children[partie.essais.length - 1];
  rangee.classList.add("gagnee");
  const bravo = partie.essais.length === 1 ? "Du premier coup !" : partie.essais.length === 2 ? "Motus !" : "Trouvé en " + partie.essais.length;
  afficherMessage(bravo + " +" + points.toLocaleString("fr-BE"), "succes");
  if (reglages.duJour) {
    // Un seul mot par jour : la partie s'arrete ici
    terminer("Mot du jour trouvé");
    return;
  }
  if (partie.serie === PALIER_AIDE || partie.serie === PALIER_CHRONO) {
    setTimeout(() => {
      if (partie && !partie.termine) {
        afficherMessage(partie.serie === PALIER_AIDE ? "Fini les lettres offertes." : "Le chrono entre en jeu.", "alerte");
      }
    }, 700);
  }
  setTimeout(() => {
    if (partie && !partie.termine && !zone.hidden) {
      nouveauMot();
    }
  }, 1500);
}

function tempsEcoule() {
  partie.revelation = true;
  jouer("impact");
  motRate("Temps écoulé ! Le mot était " + partie.mot + ".");
}

function motRate(texte) {
  jouer("mort");
  partie.dernierEssais = 0;
  const stats = lireStats();
  stats.rates++;
  ecrireStats(stats);
  // La solution s'affiche sur la prochaine rangee libre, en rouge
  const r = Math.min(partie.essais.length, ESSAIS_MAX - 1);
  [...partie.mot].forEach((lettre, c) => {
    const case_ = caseDe(r, c);
    case_.className = "motus-case solution";
    ecrire(case_, lettre);
  });
  afficherMessage(texte, "alerte");
  terminer(null);
}

function terminer(texte) {
  partie.termine = true;
  arreterMinuteur();
  zoneChrono.hidden = true;
  const stats = lireStats();
  stats.series++;
  ecrireStats(stats);
  if (texte) {
    afficherMessage(texte + " · Score " + partie.score.toLocaleString("fr-BE"), "succes");
  }
  const score = partie.score;
  const id = idClassement();
  const titre = reglages.duJour ? "Motus du jour " + reglages.longueur + " lettres" : "Motus " + reglages.longueur + " lettres";
  // D'abord les statistiques de la serie, puis le tableau des scores
  setTimeout(() => {
    if (!zone.hidden && partie && partie.termine) {
      afficherStats(texte || "Série terminée : " + partie.serie + " mot" + (partie.serie > 1 ? "s" : ""), `<button class="jeu-quitter active" type="button" data-scores>Scores</button>`);
      zoneStats.querySelector("[data-scores]").addEventListener("click", () => envoyer());
    }
  }, 1300);
  const envoyer = () => {
    clearTimeout(finEnAttente);
    if (!zone.hidden && partie && partie.termine && !partie.envoye) {
      partie.envoye = true;
      zoneStats.hidden = true;
      finDePartie(id, score, titre);
    }
  };
  finEnAttente = setTimeout(envoyer, 5200);
}

// ---------------------------------------------------------------------
// Choix de la longueur
// ---------------------------------------------------------------------

creerBoutonsChoix(zoneLongueurs,
  LONGUEURS.map(n => ({ id: String(n), nom: n + " lettres" })).concat([{ id: "jour", nom: "Mot du jour" }]),
  function (entree) {
    if (entree.id === "jour") {
      reglages.duJour = true;
    } else {
      reglages.duJour = false;
      reglages.longueur = Number(entree.id);
    }
    stockage.ecrire(reglages);
    demarrer();
  }, "mode");

// ---------------------------------------------------------------------
// Commandes
// ---------------------------------------------------------------------

function deplacerCurseur(dr, dc) {
  const rangees = zoneClavier.children;
  const r = (curseurClavier.rangee + dr + rangees.length) % rangees.length;
  const taille = rangees[r].children.length;
  let c = curseurClavier.colonne + dc;
  if (dr !== 0) {
    c = Math.min(c, taille - 1);
  } else {
    c = (c + taille) % taille;
  }
  curseurClavier = { rangee: r, colonne: c };
  afficherCurseurClavier();
}

function toucheVisee() {
  const rangee = zoneClavier.children[curseurClavier.rangee];
  return rangee ? rangee.children[curseurClavier.colonne] : null;
}

surTouche(ID, function (evenement) {
  const touche = evenement.key;
  if (touche === "Escape") {
    if (!zoneStats.hidden) {
      zoneStats.hidden = true;
      evenement.preventDefault();
      return;
    }
    quitterJeu();
    return;
  }
  if (evenement.ctrlKey || evenement.metaKey || evenement.altKey) {
    return;
  }
  if (touche === "Enter") {
    if (!zoneStats.hidden) {
      const scores = zoneStats.querySelector("[data-scores]");
      if (scores) {
        scores.click();
      } else {
        zoneStats.hidden = true;
      }
    } else {
      saisir("Enter");
    }
  } else if (touche === "Backspace") {
    saisir("Backspace");
  } else if (touche === "ArrowLeft") {
    deplacerCurseur(0, -1);
  } else if (touche === "ArrowRight") {
    deplacerCurseur(0, 1);
  } else if (touche === "ArrowUp") {
    deplacerCurseur(-1, 0);
  } else if (touche === "ArrowDown") {
    deplacerCurseur(1, 0);
  } else if (touche === " ") {
    // La touche visee du clavier a l'ecran (bouton A de la manette)
    const visee = toucheVisee();
    if (visee) {
      saisir(visee.dataset.touche);
    }
  } else if (touche === "#") {
    // Select de la manette : le son (M est une lettre ici)
    basculerSon();
    majBoutonSon();
  } else if (/^[a-zA-Z]$/.test(touche)) {
    saisir(touche.toUpperCase());
  } else {
    return;
  }
  evenement.preventDefault();
});

boutonSon.addEventListener("click", function () {
  basculerSon();
  majBoutonSon();
});
boutonStats.addEventListener("click", function () {
  if (zoneStats.hidden) {
    afficherStats("Statistiques · " + reglages.longueur + " lettres");
  } else {
    zoneStats.hidden = true;
  }
});
boutonRejouer.addEventListener("click", demarrer);
boutonQuitter.addEventListener("click", quitterJeu);

construireClavier();

enregistrerJeu({
  id: ID,
  nom: "Motus",
  code: "1990",
  section: zone,
  demarrer() {
    majBoutonSon();
    demarrer();
    requestAnimationFrame(ajuster);
  },
  arreter() {
    arreterMinuteur();
    clearTimeout(finEnAttente);
  },
  classement: idClassement,
  manette: { a: " ", b: "Backspace", start: "Enter", select: "#", libelles: { a: "Lettre", b: "Effacer" } }
});
