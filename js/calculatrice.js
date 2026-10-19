// =====================================================================
//  CALCULATRICE SCIENTIFIQUE
//  1. Etat et affichage
//  2. Saisie des jetons (chiffres, operateurs, fonctions)
//  3. Evaluation : un petit analyseur, sans eval ni new Function
//  4. Evenements souris et clavier
// =====================================================================

import { verifierCodeSecret, jeuActif, overlayOuvert } from "./arcade.js";
import { imprimerCalcul, imprimerErreur, surReutilisation } from "./ruban.js";

// ===== Elements de la page =====
const appareil = document.getElementById("appareil");
const zoneExpression = document.getElementById("expression");
const zoneApercu = document.getElementById("apercu");
const clavier = document.getElementById("clavier");
const basculeAngle = document.getElementById("basculeAngle");
const voyantAngle = document.getElementById("voyantAngle");
const voyantSecond = document.getElementById("voyantSecond");

// ===== Etat de la calculatrice =====
let jetons = [];                    // l'expression sous forme de liste de jetons
export let dernierResultat = null;  // pour la touche "ans"
let resultatAffiche = false;
let modeDegres = true;
let modeSecond = false;

// Comment chaque jeton s'affiche a l'ecran
const AFFICHAGE_JETONS = {
  "*": "×",
  "/": "÷",
  "-": "−",
  "^": "^",
  "sqrt": "√(",
  "cbrt": "∛(",
  "sin": "sin(",
  "cos": "cos(",
  "tan": "tan(",
  "asin": "sin⁻¹(",
  "acos": "cos⁻¹(",
  "atan": "tan⁻¹(",
  "ln": "ln(",
  "log": "log(",
  "exp": "e^(",
  "pow10": "10^(",
  "pi": "π",
  "carre": "²",
  "cube": "³",
  "inv": "⁻¹",
  "fact": "!",
  "ans": "ans"
};

const FONCTIONS = ["sin", "cos", "tan", "asin", "acos", "atan", "ln", "log", "sqrt", "cbrt", "exp", "pow10"];
const OPERATEURS = ["+", "-", "*", "/", "^"];
const POSTFIXES = ["carre", "cube", "inv", "fact", "%"];
const CONSTANTES = ["pi", "e", "ans"];

// Ce qui peut preceder une multiplication implicite : 2pi, )3, 5!(...)
function termineUnOperande(jeton) {
  return estNombre(jeton) || jeton === ")" || CONSTANTES.includes(jeton) || POSTFIXES.includes(jeton);
}

// ---------------------------------------------------------------------
// 1. Affichage
// ---------------------------------------------------------------------

// Les grands nombres sont groupes par trois, la virgule est francaise
function nombreVersTexte(nombre) {
  const [entier, decimales] = nombre.split(".");
  const signe = entier.startsWith("-") ? "−" : "";
  let chiffres = entier.replace("-", "");
  if (/^\d{5,}$/.test(chiffres)) {
    chiffres = chiffres.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  }
  return signe + chiffres + (decimales !== undefined ? "," + decimales : "");
}

function jetonVersTexte(jeton) {
  if (estNombre(jeton)) {
    return nombreVersTexte(jeton);
  }
  if (/e[+-]/.test(jeton)) {
    return jeton.replace(".", ",");
  }
  return AFFICHAGE_JETONS[jeton] !== undefined ? AFFICHAGE_JETONS[jeton] : jeton;
}

function texteExpression(liste) {
  return (liste || jetons).map(jetonVersTexte).join("");
}

function afficherExpression() {
  zoneExpression.classList.remove("resultat", "erreur");
  zoneExpression.textContent = jetons.length ? texteExpression() : "0";
  zoneExpression.scrollLeft = zoneExpression.scrollWidth;
  ajusterTaille();
  afficherApercu();
}

// Une expression longue reduit sa taille plutot que de deborder
function ajusterTaille() {
  const longueur = zoneExpression.textContent.length;
  zoneExpression.dataset.taille = longueur > 22 ? "s" : longueur > 14 ? "m" : "l";
}

// Apercu du resultat en direct, sous l'expression
function afficherApercu() {
  if (jetons.length < 2) {
    zoneApercu.textContent = "";
    return;
  }
  const resultat = evaluerJetons(jetons);
  zoneApercu.textContent = resultat === null ? "" : "= " + nombreVersTexte(formaterNombre(resultat));
}

// Douze chiffres significatifs, comme une vraie calculatrice
function formaterNombre(nombre) {
  if (nombre === 0 || Object.is(nombre, -0)) {
    return "0";
  }
  const absolu = Math.abs(nombre);
  if (absolu >= 1e15 || absolu < 1e-9) {
    return nombre.toExponential(6).replace(/\.?0+e/, "e");
  }
  return String(Number(nombre.toPrecision(12)));
}

// ---------------------------------------------------------------------
// 2. Saisie
// ---------------------------------------------------------------------

function dernierJeton() {
  return jetons[jetons.length - 1];
}

function estNombre(jeton) {
  return typeof jeton === "string" && /^-?(\d+\.?\d*|\.\d+)$/.test(jeton);
}

// Apres un resultat, une nouvelle saisie repart de zero
function repartirSiResultat(continuer) {
  if (resultatAffiche) {
    jetons = continuer ? ["ans"] : [];
    resultatAffiche = false;
  }
}

function multiplicationImplicite() {
  if (termineUnOperande(dernierJeton())) {
    jetons.push("*");
  }
}

function ajouterChiffre(chiffre) {
  repartirSiResultat(false);
  const dernier = dernierJeton();

  if (estNombre(dernier)) {
    if (chiffre === "." && dernier.includes(".")) {
      return;
    }
    if (dernier.length >= 18) {
      return;
    }
    // Pas de zeros inutiles devant
    if ((dernier === "0" || dernier === "-0") && chiffre !== ".") {
      jetons[jetons.length - 1] = dernier.replace("0", chiffre);
    } else {
      jetons[jetons.length - 1] = dernier + chiffre;
    }
  } else {
    multiplicationImplicite();
    jetons.push(chiffre === "." ? "0." : chiffre);
  }
  afficherExpression();
}

function ajouterOperateur(operateur) {
  repartirSiResultat(true);
  const dernier = dernierJeton();
  const avantDernier = jetons[jetons.length - 2];

  // En debut d'expression ou apres "(", seul le moins a un sens
  if (dernier === undefined || dernier === "(" || FONCTIONS.includes(dernier)) {
    if (operateur === "-") {
      jetons.push("-");
      afficherExpression();
    }
    return;
  }

  if (OPERATEURS.includes(dernier)) {
    // 2 x -3 : le moins apres un operateur devient un signe
    if (operateur === "-" && (dernier === "*" || dernier === "/" || dernier === "^")) {
      jetons.push("-");
    } else if (dernier === "-" && OPERATEURS.includes(avantDernier)) {
      // On remplace le couple "x -" par le nouvel operateur
      jetons.splice(-2, 2, operateur);
    } else if (dernier === "-" && (avantDernier === undefined || avantDernier === "(" || FONCTIONS.includes(avantDernier))) {
      // Un signe moins seul en tete ne se remplace pas par un operateur
      return;
    } else {
      jetons[jetons.length - 1] = operateur;
    }
  } else {
    jetons.push(operateur);
  }
  afficherExpression();
}

function ajouterFonction(fonction) {
  repartirSiResultat(false);
  multiplicationImplicite();
  jetons.push(fonction);
  afficherExpression();
}

function ajouterConstante(constante) {
  repartirSiResultat(false);
  multiplicationImplicite();
  jetons.push(constante);
  afficherExpression();
}

function ajouterParenthese(parenthese) {
  if (parenthese === "(") {
    repartirSiResultat(false);
    multiplicationImplicite();
    jetons.push("(");
  } else {
    repartirSiResultat(true);
    const dernier = dernierJeton();
    const ouvertes = jetons.filter(j => j === "(" || FONCTIONS.includes(j)).length;
    const fermees = jetons.filter(j => j === ")").length;
    if (ouvertes > fermees && !OPERATEURS.includes(dernier) && dernier !== "(" && !FONCTIONS.includes(dernier)) {
      jetons.push(")");
    }
  }
  afficherExpression();
}

// x2, x3, x-1, n! et % se posent apres un operande
function ajouterPostfixe(postfixe) {
  repartirSiResultat(true);
  if (!termineUnOperande(dernierJeton())) {
    return;
  }
  jetons.push(postfixe);
  afficherExpression();
}

function changerSigne() {
  const dernier = dernierJeton();
  if (resultatAffiche) {
    jetons = ["-", "ans"];
    resultatAffiche = false;
  } else if (estNombre(dernier)) {
    jetons[jetons.length - 1] = dernier.startsWith("-") ? dernier.slice(1) : "-" + dernier;
  } else {
    ajouterOperateur("-");
    return;
  }
  afficherExpression();
}

function supprimerDernierJeton() {
  if (resultatAffiche) {
    effacerTout();
    return;
  }
  const dernier = dernierJeton();
  // Sur un nombre, on enleve un chiffre a la fois
  if (estNombre(dernier) && dernier.replace("-", "").length > 1) {
    jetons[jetons.length - 1] = dernier.slice(0, -1);
    if (jetons[jetons.length - 1] === "-") {
      jetons.pop();
    }
  } else {
    jetons.pop();
  }
  afficherExpression();
}

export function effacerTout() {
  jetons = [];
  resultatAffiche = false;
  afficherExpression();
}

// Un resultat repris depuis le ruban arrive comme un nombre tape
function reprendreValeur(valeur) {
  if (jeuActif !== null || overlayOuvert) {
    return;
  }
  repartirSiResultat(false);
  const texte = formaterNombre(valeur);
  if (/e/.test(texte)) {
    // Trop grand pour etre tape : on passe par ans
    dernierResultat = valeur;
    ajouterConstante("ans");
    return;
  }
  multiplicationImplicite();
  if (OPERATEURS.includes(dernierJeton()) || jetons.length === 0 || dernierJeton() === "(" || FONCTIONS.includes(dernierJeton())) {
    jetons.push(texte);
  } else {
    jetons.push("*", texte);
  }
  afficherExpression();
}

surReutilisation(reprendreValeur);

// ---------------------------------------------------------------------
// 3. Evaluation
//    Descente recursive classique, de la priorite la plus faible a la
//    plus forte :
//      expression = terme (("+" | "-") terme)*
//      terme      = unaire (("*" | "/") unaire)*
//      unaire     = "-" unaire | puissance        (-3^2 vaut -9)
//      puissance  = postfixe ("^" unaire)?         (associative a droite)
//      postfixe   = primaire ("2" | "3" | "-1" | "!" | "%")*
//      primaire   = nombre | constante | "(" expression ")"? | fonction expression ")"?
//    Les parentheses oubliees en fin d'expression sont fermees d'office.
// ---------------------------------------------------------------------

function enRadians(angle) {
  return modeDegres ? angle * Math.PI / 180 : angle;
}

function depuisRadians(angle) {
  return modeDegres ? angle * 180 / Math.PI : angle;
}

// sin(180) doit donner 0, pas 1,22e-16
function nettoyer(valeur) {
  return Math.abs(valeur) < 1e-12 ? 0 : valeur;
}

// Gamma de Lanczos, pour les factorielles non entieres
function gamma(x) {
  if (x < 0.5) {
    return Math.PI / (Math.sin(Math.PI * x) * gamma(1 - x));
  }
  const g = 7;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) {
    a += c[i] / (x + i);
  }
  return Math.sqrt(2 * Math.PI) * Math.pow(t, x + 0.5) * Math.exp(-t) * a;
}

function factorielle(n) {
  if (Number.isInteger(n)) {
    if (n < 0) {
      return NaN;
    }
    if (n > 170) {
      return Infinity;
    }
    let produit = 1;
    for (let i = 2; i <= n; i++) {
      produit *= i;
    }
    return produit;
  }
  return gamma(n + 1);
}

const CALCULS = {
  sin: x => nettoyer(Math.sin(enRadians(x))),
  cos: x => nettoyer(Math.cos(enRadians(x))),
  // tan(90) n'existe pas : on le refuse plutot que d'afficher 1,6e16
  tan: x => (modeDegres && Math.abs(x % 180) === 90) ? NaN : nettoyer(Math.tan(enRadians(x))),
  asin: x => depuisRadians(Math.asin(x)),
  acos: x => depuisRadians(Math.acos(x)),
  atan: x => depuisRadians(Math.atan(x)),
  ln: x => Math.log(x),
  log: x => Math.log10(x),
  sqrt: x => Math.sqrt(x),
  cbrt: x => Math.cbrt(x),
  exp: x => Math.exp(x),
  pow10: x => Math.pow(10, x)
};

const CALCULS_POSTFIXES = {
  carre: x => x * x,
  cube: x => x * x * x,
  inv: x => 1 / x,
  fact: factorielle,
  "%": x => x / 100
};

// Renvoie un nombre, ou null si l'expression est incomplete ou invalide
function evaluerJetons(liste) {
  let position = 0;
  const voir = () => liste[position];

  function expression() {
    let valeur = terme();
    while (voir() === "+" || voir() === "-") {
      const operateur = liste[position++];
      const droite = terme();
      valeur = operateur === "+" ? valeur + droite : valeur - droite;
    }
    return valeur;
  }

  function terme() {
    let valeur = unaire();
    while (voir() === "*" || voir() === "/") {
      const operateur = liste[position++];
      const droite = unaire();
      valeur = operateur === "*" ? valeur * droite : valeur / droite;
    }
    return valeur;
  }

  function unaire() {
    if (voir() === "-") {
      position++;
      return -unaire();
    }
    if (voir() === "+") {
      position++;
      return unaire();
    }
    return puissance();
  }

  function puissance() {
    const base = postfixe();
    if (voir() === "^") {
      position++;
      return Math.pow(base, unaire());
    }
    return base;
  }

  function postfixe() {
    let valeur = primaire();
    while (POSTFIXES.includes(voir())) {
      valeur = CALCULS_POSTFIXES[liste[position++]](valeur);
    }
    return valeur;
  }

  function primaire() {
    const jeton = liste[position];
    if (jeton === undefined) {
      throw new Error("incomplet");
    }
    if (estNombre(jeton) || /e[+-]/.test(jeton)) {
      position++;
      return parseFloat(jeton);
    }
    if (jeton === "pi") {
      position++;
      return Math.PI;
    }
    if (jeton === "e") {
      position++;
      return Math.E;
    }
    if (jeton === "ans") {
      position++;
      return dernierResultat === null ? 0 : dernierResultat;
    }
    if (jeton === "(" || FONCTIONS.includes(jeton)) {
      position++;
      const interieur = expression();
      if (voir() === ")") {
        position++;
      } else if (voir() !== undefined) {
        throw new Error("parenthese");
      }
      return jeton === "(" ? interieur : CALCULS[jeton](interieur);
    }
    throw new Error("inattendu");
  }

  if (liste.length === 0) {
    return null;
  }
  try {
    const resultat = expression();
    if (position !== liste.length || typeof resultat !== "number" || !isFinite(resultat)) {
      return null;
    }
    return resultat;
  } catch (erreur) {
    return null;
  }
}

function calculerResultat() {
  // Codes secrets : arcade.js decide s'il y a quelque chose a lancer
  if (verifierCodeSecret(jetons)) {
    return;
  }

  if (jetons.length === 0 || resultatAffiche) {
    return;
  }

  // Les parentheses fermees d'office le sont aussi a l'ecran et sur le ruban
  const ouvertes = jetons.filter(j => j === "(" || FONCTIONS.includes(j)).length;
  const fermees = jetons.filter(j => j === ")").length;
  const texte = texteExpression() + ")".repeat(Math.max(0, ouvertes - fermees));
  const resultat = evaluerJetons(jetons);
  zoneApercu.textContent = texte + " =";

  if (resultat === null) {
    zoneExpression.textContent = "Erreur";
    zoneExpression.classList.add("erreur");
    ajusterTaille();
    imprimerErreur(texte);
    jetons = [];
    resultatAffiche = true;
    return;
  }

  const formate = formaterNombre(resultat);
  dernierResultat = resultat;
  jetons = [formate];
  zoneExpression.textContent = jetonVersTexte(formate);
  zoneExpression.classList.remove("erreur");
  zoneExpression.classList.add("resultat");
  ajusterTaille();
  imprimerCalcul(texte, jetonVersTexte(formate), resultat);
  resultatAffiche = true;
}

function basculerUniteAngle() {
  modeDegres = !modeDegres;
  basculeAngle.textContent = modeDegres ? "DEG" : "RAD";
  basculeAngle.setAttribute("aria-label", modeDegres ? "Angles en degres" : "Angles en radians");
  voyantAngle.textContent = modeDegres ? "DEG" : "RAD";
  afficherApercu();
}

function basculerSecond(force) {
  modeSecond = typeof force === "boolean" ? force : !modeSecond;
  appareil.classList.toggle("second", modeSecond);
  voyantSecond.classList.toggle("allume", modeSecond);
  const touche = clavier.querySelector("[data-action='second']");
  if (touche !== null) {
    touche.setAttribute("aria-pressed", String(modeSecond));
  }
}

// Copie du resultat d'un clic sur l'ecran
function copierResultat() {
  if (!resultatAffiche || dernierResultat === null || !navigator.clipboard) {
    return;
  }
  navigator.clipboard.writeText(formaterNombre(dernierResultat).replace(".", ",")).then(function () {
    zoneApercu.textContent = "Copie dans le presse-papier";
  }).catch(function () {
    // pas d'acces au presse-papier : rien a signaler
  });
}

// ---------------------------------------------------------------------
// 4. Evenements
// ---------------------------------------------------------------------

function traiterJeton(jeton) {
  if (/^[0-9.]$/.test(jeton)) {
    ajouterChiffre(jeton);
  } else if (OPERATEURS.includes(jeton)) {
    ajouterOperateur(jeton);
  } else if (FONCTIONS.includes(jeton)) {
    ajouterFonction(jeton);
  } else if (CONSTANTES.includes(jeton)) {
    ajouterConstante(jeton);
  } else if (jeton === "(" || jeton === ")") {
    ajouterParenthese(jeton);
  } else if (POSTFIXES.includes(jeton)) {
    ajouterPostfixe(jeton);
  }
}

function traiterAction(action) {
  if (action === "egal") {
    calculerResultat();
  } else if (action === "effacer") {
    effacerTout();
  } else if (action === "retour") {
    supprimerDernierJeton();
  } else if (action === "signe") {
    changerSigne();
  } else if (action === "second") {
    basculerSecond();
  }
}

clavier.addEventListener("click", function (evenement) {
  const bouton = evenement.target.closest(".touche");
  if (!bouton) {
    return;
  }
  // En mode 2nd, une touche qui a une seconde fonction l'utilise, puis
  // le mode retombe, comme sur une calculatrice de poche
  if (modeSecond && bouton.dataset.jeton2 !== undefined) {
    traiterJeton(bouton.dataset.jeton2);
    basculerSecond(false);
    return;
  }
  if (bouton.dataset.jeton !== undefined) {
    traiterJeton(bouton.dataset.jeton);
  } else if (bouton.dataset.action !== undefined) {
    traiterAction(bouton.dataset.action);
  }
});

basculeAngle.addEventListener("click", basculerUniteAngle);

// Apres un clic souris ou doigt sur un bouton de la facade, il rend le
// focus : sinon un Entree tape ensuite au clavier le declencherait une
// seconde fois au lieu de calculer
document.getElementById("calculatrice").addEventListener("click", function (evenement) {
  const bouton = evenement.target.closest("button");
  if (bouton !== null && evenement.detail > 0) {
    bouton.blur();
  }
});
zoneExpression.addEventListener("click", copierResultat);

// La touche a l'ecran s'enfonce quand on tape au clavier
function enfoncer(selecteur) {
  const touche = clavier.querySelector(selecteur);
  if (touche === null) {
    return;
  }
  touche.classList.remove("enfoncee");
  void touche.offsetWidth;
  touche.classList.add("enfoncee");
  setTimeout(() => touche.classList.remove("enfoncee"), 140);
}

const TOUCHES_CLAVIER = {
  "Enter": "[data-action='egal']",
  "=": "[data-action='egal']",
  "Backspace": "[data-action='retour']",
  "Escape": "[data-action='effacer']",
  "Delete": "[data-action='effacer']",
  ".": "[data-jeton='.']",
  ",": "[data-jeton='.']",
  "!": "[data-jeton2='fact']"
};

document.addEventListener("keydown", function (evenement) {
  if (jeuActif !== null || overlayOuvert) {
    return; // les jeux et les overlays gerent leur propre clavier
  }
  if (evenement.ctrlKey || evenement.metaKey || evenement.altKey) {
    return;
  }
  // Navigation au clavier : Entree ou Espace sur une touche focalisee
  // l'active, on ne la double pas avec un "="
  const focus = document.activeElement;
  if ((evenement.key === "Enter" || evenement.key === " ") && focus && focus.closest && focus.closest("button, a")) {
    return;
  }
  const touche = evenement.key;
  const cible = TOUCHES_CLAVIER[touche] || (/^[0-9+\-*/^()%]$/.test(touche) ? "[data-jeton='" + touche + "']" : null);

  if (/^[0-9]$/.test(touche)) {
    ajouterChiffre(touche);
  } else if (touche === "." || touche === ",") {
    ajouterChiffre(".");
  } else if (touche === "+" || touche === "-" || touche === "*" || touche === "/" || touche === "^") {
    evenement.preventDefault();
    ajouterOperateur(touche);
  } else if (touche === "(" || touche === ")") {
    ajouterParenthese(touche);
  } else if (touche === "%") {
    ajouterPostfixe("%");
  } else if (touche === "!") {
    ajouterPostfixe("fact");
  } else if (touche === "Enter" || touche === "=") {
    evenement.preventDefault();
    calculerResultat();
  } else if (touche === "Backspace") {
    supprimerDernierJeton();
  } else if (touche === "Escape" || touche === "Delete") {
    effacerTout();
  } else {
    return;
  }
  if (cible !== null) {
    enfoncer(cible);
  }
});

// ===== Affichage initial =====
afficherExpression();

// Pour les tests en console : evaluer("2^-1")
export function evaluerTexte(liste) {
  return evaluerJetons(liste);
}
