// =====================================================================
//  CALCULATRICE SCIENTIFIQUE
//  1. Etat et affichage
//  2. Saisie des jetons (chiffres, operateurs, fonctions)
//  3. Evaluation de l'expression
//  4. Evenements souris et clavier
// =====================================================================

// ===== Elements de la page =====
const zoneExpression = document.getElementById("expression");
const zoneApercu = document.getElementById("apercu");
const clavier = document.getElementById("clavier");
const basculeAngle = document.getElementById("basculeAngle");

// ===== Etat de la calculatrice =====
let jetons = [];            // l'expression sous forme de liste de jetons
let dernierResultat = null; // pour le bouton "ans"
let resultatAffiche = false;
let modeDegres = true;


// Comment chaque jeton s'affiche a l'ecran
const AFFICHAGE_JETONS = {
  "*": "\u00D7",
  "/": "\u00F7",
  "-": "\u2212",
  "^": "^",
  "sqrt": "\u221A(",
  "sin": "sin(",
  "cos": "cos(",
  "tan": "tan(",
  "ln": "ln(",
  "log": "log(",
  "pi": "\u03C0",
  "carre": "\u00B2",
  "ans": "ans"
};

const FONCTIONS = ["sin", "cos", "tan", "ln", "log", "sqrt"];
const OPERATEURS = ["+", "-", "*", "/", "^"];

// ---------------------------------------------------------------------
// 1. Affichage
// ---------------------------------------------------------------------

function jetonVersTexte(jeton) {
  return AFFICHAGE_JETONS[jeton] !== undefined ? AFFICHAGE_JETONS[jeton] : jeton;
}

function texteExpression() {
  return jetons.map(jetonVersTexte).join("");
}

function afficherExpression() {
  zoneExpression.classList.remove("resultat", "erreur");
  zoneExpression.textContent = jetons.length ? texteExpression() : "0";
  zoneExpression.scrollLeft = zoneExpression.scrollWidth;
  afficherApercu();
}

// Apercu du resultat en direct, en petit sous l'expression
function afficherApercu() {
  if (jetons.length < 2) {
    zoneApercu.textContent = "";
    return;
  }
  const resultat = evaluerJetons(jetons);
  zoneApercu.textContent = resultat === null ? "" : "= " + formaterNombre(resultat);
}

function formaterNombre(nombre) {
  // Arrondi pour eviter 0.30000000000000004
  const arrondi = Math.round(nombre * 1e10) / 1e10;
  if (Math.abs(arrondi) >= 1e15 || (Math.abs(arrondi) < 1e-9 && arrondi !== 0)) {
    return arrondi.toExponential(6);
  }
  return String(arrondi);
}

// ---------------------------------------------------------------------
// 2. Saisie
// ---------------------------------------------------------------------

function dernierJeton() {
  return jetons[jetons.length - 1];
}

function estNombre(jeton) {
  return jeton !== undefined && /^-?(\d+\.?\d*|\.\d+)$/.test(jeton);
}

function ajouterChiffre(chiffre) {
  // Apres un resultat, on repart de zero (sauf si on tape un operateur)
  if (resultatAffiche) {
    jetons = [];
    resultatAffiche = false;
  }

  const dernier = dernierJeton();

  if (estNombre(dernier)) {
    // Un seul point par nombre
    if (chiffre === "." && dernier.includes(".")) {
      return;
    }
    // Pas de zeros inutiles devant
    if (dernier === "0" && chiffre !== ".") {
      jetons[jetons.length - 1] = chiffre;
    } else {
      jetons[jetons.length - 1] = dernier + chiffre;
    }
  } else {
    // Multiplication implicite : 2pi, )3, pi3
    if (dernier === ")" || dernier === "pi" || dernier === "e" || dernier === "ans" || dernier === "carre") {
      jetons.push("*");
    }
    jetons.push(chiffre === "." ? "0." : chiffre);
  }

  afficherExpression();
}

function ajouterOperateur(operateur) {
  // Un operateur juste apres un resultat continue le calcul avec ce resultat
  if (resultatAffiche) {
    jetons = ["ans"];
    resultatAffiche = false;
  }

  const dernier = dernierJeton();

  // Signe moins en debut ou apres une parenthese ouvrante : nombre negatif
  if (dernier === undefined || dernier === "(" || FONCTIONS.includes(dernier)) {
    if (operateur === "-") {
      jetons.push("-");
      afficherExpression();
    }
    return;
  }

  // Deux operateurs a la suite : on remplace le precedent
  if (OPERATEURS.includes(dernier)) {
    jetons[jetons.length - 1] = operateur;
  } else {
    jetons.push(operateur);
  }

  afficherExpression();
}

function ajouterFonction(fonction) {
  if (resultatAffiche) {
    jetons = [];
    resultatAffiche = false;
  }
  const dernier = dernierJeton();
  if (estNombre(dernier) || dernier === ")" || dernier === "pi" || dernier === "e" || dernier === "ans" || dernier === "carre") {
    jetons.push("*");
  }
  jetons.push(fonction);
  afficherExpression();
}

function ajouterConstante(constante) {
  if (resultatAffiche) {
    jetons = [];
    resultatAffiche = false;
  }
  const dernier = dernierJeton();
  if (estNombre(dernier) || dernier === ")" || dernier === "pi" || dernier === "e" || dernier === "ans" || dernier === "carre") {
    jetons.push("*");
  }
  jetons.push(constante);
  afficherExpression();
}

function ajouterParenthese(parenthese) {
  if (resultatAffiche) {
    jetons = parenthese === ")" ? ["ans"] : [];
    resultatAffiche = false;
  }
  const dernier = dernierJeton();

  if (parenthese === "(") {
    if (estNombre(dernier) || dernier === ")" || dernier === "pi" || dernier === "e" || dernier === "ans" || dernier === "carre") {
      jetons.push("*");
    }
    jetons.push("(");
  } else {
    // On ne ferme que s'il y a quelque chose a fermer
    const ouvertes = jetons.filter(j => j === "(" || FONCTIONS.includes(j)).length;
    const fermees = jetons.filter(j => j === ")").length;
    if (ouvertes > fermees && !OPERATEURS.includes(dernier) && dernier !== "(" && !FONCTIONS.includes(dernier)) {
      jetons.push(")");
    }
  }
  afficherExpression();
}

function ajouterCarre() {
  const dernier = dernierJeton();
  if (estNombre(dernier) || dernier === ")" || dernier === "pi" || dernier === "e" || dernier === "ans") {
    if (resultatAffiche) {
      jetons = ["ans"];
      resultatAffiche = false;
    }
    jetons.push("carre");
    afficherExpression();
  }
}

function ajouterPourcentage() {
  const dernier = dernierJeton();
  if (estNombre(dernier) || dernier === "ans") {
    if (resultatAffiche) {
      jetons = ["ans"];
      resultatAffiche = false;
    }
    jetons.push("%");
    afficherExpression();
  }
}

function changerSigne() {
  const dernier = dernierJeton();
  if (resultatAffiche) {
    jetons = ["-", "ans"];
    resultatAffiche = false;
  } else if (estNombre(dernier)) {
    jetons[jetons.length - 1] = dernier.startsWith("-") ? dernier.slice(1) : "-" + dernier;
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

function effacerTout() {
  jetons = [];
  resultatAffiche = false;
  afficherExpression();
}

// ---------------------------------------------------------------------
// 3. Evaluation
// ---------------------------------------------------------------------

// Fonctions mathematiques disponibles pendant l'evaluation
function creerFonctions() {
  const enRadians = angle => (modeDegres ? angle * Math.PI / 180 : angle);
  return {
    sin: x => Math.sin(enRadians(x)),
    cos: x => Math.cos(enRadians(x)),
    tan: x => Math.tan(enRadians(x)),
    ln: x => Math.log(x),
    log: x => Math.log10(x),
    sqrt: x => Math.sqrt(x)
  };
}

// Transforme la liste de jetons en code JavaScript.
// Le code n'est construit qu'a partir de jetons connus : jamais de texte libre.
function jetonsVersJavascript(liste) {
  let code = "";
  let profondeur = 0;

  for (const jeton of liste) {
    if (estNombre(jeton)) {
      code += "(" + jeton + ")";
    } else if (jeton === "+" || jeton === "-" || jeton === "*" || jeton === "/") {
      code += jeton;
    } else if (jeton === "^") {
      code += "**";
    } else if (jeton === "carre") {
      code += "**2";
    } else if (jeton === "%") {
      code += "/100";
    } else if (jeton === "pi") {
      code += "Math.PI";
    } else if (jeton === "e") {
      code += "Math.E";
    } else if (jeton === "ans") {
      code += "(" + (dernierResultat === null ? 0 : dernierResultat) + ")";
    } else if (FONCTIONS.includes(jeton)) {
      code += "fn." + jeton + "(";
      profondeur++;
    } else if (jeton === "(") {
      code += "(";
      profondeur++;
    } else if (jeton === ")") {
      code += ")";
      profondeur--;
    } else {
      return null; // jeton inconnu
    }
  }

  // On ferme automatiquement les parentheses oubliees
  while (profondeur > 0) {
    code += ")";
    profondeur--;
  }

  return profondeur === 0 ? code : null;
}

// Renvoie un nombre, ou null si l'expression est invalide
function evaluerJetons(liste) {
  if (liste.length === 0) {
    return null;
  }
  const dernier = liste[liste.length - 1];
  if (OPERATEURS.includes(dernier) || dernier === "(" || FONCTIONS.includes(dernier)) {
    return null;
  }

  const code = jetonsVersJavascript(liste);
  if (code === null) {
    return null;
  }

  try {
    const calculer = new Function("fn", "Math", "return (" + code + ");");
    const resultat = calculer(creerFonctions(), Math);
    if (typeof resultat !== "number" || !isFinite(resultat)) {
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

  const resultat = evaluerJetons(jetons);
  zoneApercu.textContent = texteExpression() + " =";

  if (resultat === null) {
    zoneExpression.textContent = "Erreur";
    zoneExpression.classList.add("erreur");
    jetons = [];
    resultatAffiche = true;
    return;
  }

  dernierResultat = resultat;
  jetons = [formaterNombre(resultat)];
  zoneExpression.textContent = formaterNombre(resultat);
  zoneExpression.classList.remove("erreur");
  zoneExpression.classList.add("resultat");
  resultatAffiche = true;
}

function basculerUniteAngle() {
  modeDegres = !modeDegres;
  basculeAngle.textContent = modeDegres ? "DEG" : "RAD";
  afficherApercu();
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
  } else if (jeton === "pi" || jeton === "e" || jeton === "ans") {
    ajouterConstante(jeton);
  } else if (jeton === "(" || jeton === ")") {
    ajouterParenthese(jeton);
  } else if (jeton === "carre") {
    ajouterCarre();
  } else if (jeton === "%") {
    ajouterPourcentage();
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
  }
}

clavier.addEventListener("click", function (evenement) {
  const bouton = evenement.target.closest(".bouton");
  if (!bouton) {
    return;
  }
  if (bouton.dataset.jeton !== undefined) {
    traiterJeton(bouton.dataset.jeton);
  } else if (bouton.dataset.action !== undefined) {
    traiterAction(bouton.dataset.action);
  }
});

basculeAngle.addEventListener("click", basculerUniteAngle);

document.addEventListener("keydown", function (evenement) {
  if (jeuActif !== null || overlayOuvert) {
    return; // les jeux et les overlays gerent leur propre clavier
  }
  const touche = evenement.key;

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
    ajouterPourcentage();
  } else if (touche === "Enter" || touche === "=") {
    evenement.preventDefault();
    calculerResultat();
  } else if (touche === "Backspace") {
    supprimerDernierJeton();
  } else if (touche === "Escape" || touche === "Delete") {
    effacerTout();
  }
});

// ===== Affichage initial =====
afficherExpression();
