// =====================================================================
//  BLACKJACK - regles de casino courantes
//  Sabot de 6 jeux, croupier qui reste a 17, blackjack paye 3 pour 2,
//  double et separation autorises. Le score du classement est le pic
//  de jetons atteint, pas le solde final.
// =====================================================================

const zoneBlackjack = document.getElementById("jeuBlackjack");
const zoneJetons = document.getElementById("jetonsBlackjack");
const zonePic = document.getElementById("picBlackjack");
const zoneSabot = document.getElementById("sabotBlackjack");
const mainCroupierHtml = document.getElementById("mainCroupier");
const mainsJoueurHtml = document.getElementById("mainsJoueur");
const totalCroupierHtml = document.getElementById("totalCroupier");
const zoneMessageBlackjack = document.getElementById("messageBlackjack");
const zoneMises = document.getElementById("misesBlackjack");
const zoneActions = document.getElementById("actionsBlackjack");
const boutonTirer = document.getElementById("tirerBlackjack");
const boutonRester = document.getElementById("resterBlackjack");
const boutonDoubler = document.getElementById("doublerBlackjack");
const boutonSeparer = document.getElementById("separerBlackjack");
const boutonEncaisser = document.getElementById("encaisserBlackjack");
const boutonQuitterBlackjack = document.getElementById("quitterBlackjack");

const JETONS_DEPART = 500;
const NOMBRE_DE_JEUX = 6;
const SEUIL_MELANGE = 0.25;          // on remelange quand un quart du sabot reste
const MAINS_MAX = 4;                 // jusqu'a trois separations
const CLE_BLACKJACK = "tanuki-arcade-blackjack";

const ENSEIGNES = [
  { symbole: "\u2660", rouge: false },
  { symbole: "\u2665", rouge: true },
  { symbole: "\u2666", rouge: true },
  { symbole: "\u2663", rouge: false }
];
const VALEURS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const MISES = [25, 50, 100, 250];

let sabot = [];
let jetonsJoueur = JETONS_DEPART;
let picJetons = JETONS_DEPART;
let mainsJoueur = [];
let indexMainCourante = 0;
let mainCroupier = [];
let phaseBlackjack = "mise";         // mise, joueur, croupier, resultat
let blackjackTermine = false;

// ---------------------------------------------------------------------
// Sauvegarde des jetons
// ---------------------------------------------------------------------

function sauverBlackjack() {
  try {
    localStorage.setItem(CLE_BLACKJACK, JSON.stringify({ jetonsJoueur, pic: picJetons }));
  } catch (erreur) {
    // stockage indisponible : les jetons repartiront de zero
  }
}

function chargerBlackjack() {
  try {
    const brut = localStorage.getItem(CLE_BLACKJACK);
    if (brut === null) {
      return false;
    }
    const donnees = JSON.parse(brut);
    if (typeof donnees.jetonsJoueur !== "number" || donnees.jetonsJoueur <= 0) {
      return false;
    }
    jetonsJoueur = donnees.jetonsJoueur;
    picJetons = Math.max(donnees.pic || 0, jetonsJoueur);
    return true;
  } catch (erreur) {
    return false;
  }
}

// ---------------------------------------------------------------------
// Sabot
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
  // Melange de Fisher-Yates
  for (let i = cartes.length - 1; i > 0; i--) {
    const k = Math.floor(Math.random() * (i + 1));
    [cartes[i], cartes[k]] = [cartes[k], cartes[i]];
  }
  return cartes;
}

function piocher() {
  if (sabot.length <= NOMBRE_DE_JEUX * 52 * SEUIL_MELANGE) {
    sabot = creerSabot();
  }
  return sabot.pop();
}

// ---------------------------------------------------------------------
// Valeur d'une main
// ---------------------------------------------------------------------

// L'as vaut 11 s'il ne fait pas depasser 21, sinon 1
function valeurMain(cartes) {
  let total = 0;
  let as = 0;
  for (const carte of cartes) {
    if (carte.valeur === "A") {
      as++;
      total += 11;
    } else if (["J", "Q", "K"].includes(carte.valeur)) {
      total += 10;
    } else {
      total += Number(carte.valeur);
    }
  }
  while (total > 21 && as > 0) {
    total -= 10;
    as--;
  }
  return total;
}

// Une main est souple si un as y compte encore pour 11
function mainSouple(cartes) {
  const brut = cartes.reduce((somme, carte) => {
    if (carte.valeur === "A") {
      return somme + 1;
    }
    return somme + (["J", "Q", "K"].includes(carte.valeur) ? 10 : Number(carte.valeur));
  }, 0);
  return cartes.some(carte => carte.valeur === "A") && brut + 10 <= 21;
}

function estBlackjack(main) {
  return main.cartes.length === 2 && valeurMain(main.cartes) === 21 && !main.issueDeSeparation;
}

function valeurCarte(carte) {
  if (carte.valeur === "A") {
    return 11;
  }
  return ["J", "Q", "K"].includes(carte.valeur) ? 10 : Number(carte.valeur);
}

// ---------------------------------------------------------------------
// Deroulement d'un coup
// ---------------------------------------------------------------------

function demarrerBlackjack() {
  if (!chargerBlackjack()) {
    jetonsJoueur = JETONS_DEPART;
    picJetons = JETONS_DEPART;
  }
  sabot = creerSabot();
  mainsJoueur = [];
  mainCroupier = [];
  indexMainCourante = 0;
  blackjackTermine = false;
  phaseBlackjack = "mise";
  zoneMessageBlackjack.classList.remove("resultat");
  zoneMessageBlackjack.textContent = "Choisis ta mise";
  dessinerBlackjack();
}

function miser(montant) {
  // Apres un resultat, cliquer une mise enchaine directement le coup suivant
  if (phaseBlackjack === "resultat" && !blackjackTermine) {
    nouveauCoup();
  }
  if (phaseBlackjack !== "mise" || montant > jetonsJoueur) {
    return;
  }
  jetonsJoueur -= montant;
  mainsJoueur = [{ cartes: [piocher(), piocher()], mise: montant, terminee: false, doublee: false, issueDeSeparation: false }];
  mainCroupier = [piocher(), piocher()];
  indexMainCourante = 0;
  phaseBlackjack = "joueur";
  zoneMessageBlackjack.classList.remove("resultat");
  zoneMessageBlackjack.textContent = "";

  // Blackjack immediat de part ou d'autre : le coup s'arrete tout de suite
  const blackjackJoueur = estBlackjack(mainsJoueur[0]);
  const blackjackCroupier = valeurMain(mainCroupier) === 21;

  if (blackjackJoueur || blackjackCroupier) {
    mainsJoueur[0].terminee = true;
    phaseBlackjack = "croupier";
    resoudreBlackjack();
    return;
  }
  dessinerBlackjack();
}

function mainCourante() {
  return mainsJoueur[indexMainCourante] || null;
}

function passerAlaSuite() {
  while (indexMainCourante < mainsJoueur.length && mainsJoueur[indexMainCourante].terminee) {
    indexMainCourante++;
  }
  if (indexMainCourante >= mainsJoueur.length) {
    phaseBlackjack = "croupier";
    tourCroupier();
  } else {
    dessinerBlackjack();
  }
}

function tirerBlackjack() {
  const main = mainCourante();
  if (phaseBlackjack !== "joueur" || main === null) {
    return;
  }
  main.cartes.push(piocher());
  if (valeurMain(main.cartes) >= 21) {
    main.terminee = true;
  }
  dessinerBlackjack();
  if (main.terminee) {
    passerAlaSuite();
  }
}

function resterBlackjack() {
  const main = mainCourante();
  if (phaseBlackjack !== "joueur" || main === null) {
    return;
  }
  main.terminee = true;
  passerAlaSuite();
}

function peutDoubler() {
  const main = mainCourante();
  return phaseBlackjack === "joueur" && main !== null
    && main.cartes.length === 2 && !main.doublee && jetonsJoueur >= main.mise;
}

function doublerBlackjack() {
  if (!peutDoubler()) {
    return;
  }
  const main = mainCourante();
  jetonsJoueur -= main.mise;
  main.mise *= 2;
  main.doublee = true;
  main.cartes.push(piocher());
  main.terminee = true;
  dessinerBlackjack();
  passerAlaSuite();
}

function peutSeparer() {
  const main = mainCourante();
  return phaseBlackjack === "joueur" && main !== null
    && main.cartes.length === 2
    && valeurCarte(main.cartes[0]) === valeurCarte(main.cartes[1])
    && mainsJoueur.length < MAINS_MAX
    && jetonsJoueur >= main.mise;
}

function separerBlackjack() {
  if (!peutSeparer()) {
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
  dessinerBlackjack();
  if (main.terminee) {
    passerAlaSuite();
  }
}

// Le croupier tire jusqu'a 17, et reste sur un 17 souple
function tourCroupier() {
  const resteUneMain = mainsJoueur.some(main => valeurMain(main.cartes) <= 21);
  if (resteUneMain) {
    while (valeurMain(mainCroupier) < 17) {
      mainCroupier.push(piocher());
    }
  }
  resoudreBlackjack();
}

function resoudreBlackjack() {
  const totalCroupier = valeurMain(mainCroupier);
  const croupierSaute = totalCroupier > 21;
  const croupierBlackjack = mainCroupier.length === 2 && totalCroupier === 21;
  const resumes = [];

  mainsJoueur.forEach(main => {
    const total = valeurMain(main.cartes);

    if (total > 21) {
      resumes.push("Saute a " + total);
      main.resultat = "perdu";
      return;
    }
    if (estBlackjack(main) && !croupierBlackjack) {
      // Blackjack paye 3 pour 2 : la mise plus une fois et demie
      const gain = main.mise + Math.floor(main.mise * 1.5);
      jetonsJoueur += gain;
      resumes.push("Blackjack, +" + (gain - main.mise));
      main.resultat = "blackjack";
      return;
    }
    if (croupierSaute || total > totalCroupier) {
      jetonsJoueur += main.mise * 2;
      resumes.push((croupierSaute ? "Croupier saute" : "Gagne " + total + " contre " + totalCroupier) + ", +" + main.mise);
      main.resultat = "gagne";
      return;
    }
    if (total === totalCroupier && !(croupierBlackjack && !estBlackjack(main))) {
      jetonsJoueur += main.mise;
      resumes.push("Egalite a " + total);
      main.resultat = "egalite";
      return;
    }
    resumes.push(croupierBlackjack && !estBlackjack(main)
      ? "Blackjack du croupier"
      : "Perdu " + total + " contre " + totalCroupier);
    main.resultat = "perdu";
  });

  picJetons = Math.max(picJetons, jetonsJoueur);
  phaseBlackjack = "resultat";
  zoneMessageBlackjack.textContent = resumes.join("  -  ");
  zoneMessageBlackjack.classList.add("resultat");
  sauverBlackjack();
  dessinerBlackjack();

  // Plus assez de jetons pour la plus petite mise : la partie est finie
  if (jetonsJoueur < MISES[0]) {
    blackjackTermine = true;
    zoneMessageBlackjack.textContent = "Plus de jetons. Pic atteint : " + picJetons;
    try {
      localStorage.removeItem(CLE_BLACKJACK);
    } catch (erreur) {
      // rien a faire
    }
    finDePartie("blackjack", picJetons);
  }
}

function nouveauCoup() {
  if (phaseBlackjack !== "resultat" || blackjackTermine) {
    return;
  }
  mainsJoueur = [];
  mainCroupier = [];
  indexMainCourante = 0;
  phaseBlackjack = "mise";
  zoneMessageBlackjack.classList.remove("resultat");
  zoneMessageBlackjack.textContent = "Choisis ta mise";
  dessinerBlackjack();
}

// Quitter la table en inscrivant son pic au classement
function encaisserBlackjack() {
  if (phaseBlackjack === "joueur") {
    return;
  }
  picJetons = Math.max(picJetons, jetonsJoueur);
  sauverBlackjack();
  finDePartie("blackjack", picJetons);
}

// ---------------------------------------------------------------------
// Affichage
// ---------------------------------------------------------------------

function elementCarte(carte, cachee) {
  const element = document.createElement("div");
  if (cachee) {
    element.className = "carte dos";
    return element;
  }
  element.className = carte.enseigne.rouge ? "carte rouge" : "carte";

  const coinHaut = document.createElement("span");
  coinHaut.className = "carte-coin";
  coinHaut.textContent = carte.valeur + carte.enseigne.symbole;

  const centre = document.createElement("span");
  centre.className = "carte-centre";
  centre.textContent = carte.enseigne.symbole;

  const coinBas = document.createElement("span");
  coinBas.className = "carte-coin bas";
  coinBas.textContent = carte.valeur + carte.enseigne.symbole;

  element.append(coinHaut, centre, coinBas);
  return element;
}

function texteTotal(cartes) {
  const total = valeurMain(cartes);
  return mainSouple(cartes) && total <= 21 ? total - 10 + " / " + total : String(total);
}

function dessinerBlackjack() {
  // Croupier
  mainCroupierHtml.innerHTML = "";
  const cacherDeuxieme = phaseBlackjack === "joueur";
  mainCroupier.forEach((carte, index) => {
    mainCroupierHtml.appendChild(elementCarte(carte, cacherDeuxieme && index === 1));
  });
  totalCroupierHtml.textContent = mainCroupier.length === 0
    ? ""
    : (cacherDeuxieme ? String(valeurCarte(mainCroupier[0])) : texteTotal(mainCroupier));

  // Mains du joueur
  mainsJoueurHtml.innerHTML = "";
  mainsJoueur.forEach((main, index) => {
    const bloc = document.createElement("div");
    bloc.className = "main-joueur";
    if (index === indexMainCourante && phaseBlackjack === "joueur") {
      bloc.classList.add("active");
    }
    if (main.resultat) {
      bloc.classList.add(main.resultat);
    }

    const cartes = document.createElement("div");
    cartes.className = "cartes";
    main.cartes.forEach(carte => cartes.appendChild(elementCarte(carte, false)));

    const details = document.createElement("span");
    details.className = "main-details";
    details.textContent = texteTotal(main.cartes) + "  -  mise " + main.mise;

    bloc.append(cartes, details);
    mainsJoueurHtml.appendChild(bloc);
  });

  // Boutons
  zoneMises.hidden = phaseBlackjack === "joueur" || blackjackTermine;
  zoneActions.hidden = phaseBlackjack !== "joueur";
  // Une mise trop grande pour la cave restante est desactivee
  for (const bouton of zoneMises.children) {
    bouton.disabled = Number(bouton.dataset.montant) > jetonsJoueur;
  }
  boutonDoubler.disabled = !peutDoubler();
  boutonSeparer.disabled = !peutSeparer();
  boutonEncaisser.disabled = phaseBlackjack === "joueur" || blackjackTermine;

  zoneJetons.textContent = String(jetonsJoueur);
  zonePic.textContent = String(Math.max(picJetons, jetonsJoueur));
  zoneSabot.textContent = String(sabot.length);
}

// ---------------------------------------------------------------------
// Commandes
// ---------------------------------------------------------------------

// Les boutons de mise sont construits une fois pour toutes
MISES.forEach(montant => {
  const bouton = document.createElement("button");
  bouton.type = "button";
  bouton.className = "mise-jeton";
  bouton.dataset.montant = String(montant);
  bouton.textContent = String(montant);
  bouton.addEventListener("click", () => miser(montant));
  zoneMises.appendChild(bouton);
});

boutonTirer.addEventListener("click", tirerBlackjack);
boutonRester.addEventListener("click", resterBlackjack);
boutonDoubler.addEventListener("click", doublerBlackjack);
boutonSeparer.addEventListener("click", separerBlackjack);
boutonEncaisser.addEventListener("click", encaisserBlackjack);
boutonQuitterBlackjack.addEventListener("click", quitterJeu);

document.addEventListener("keydown", function (evenement) {
  if (jeuActif !== "blackjack" || overlayOuvert) {
    return;
  }
  const touche = evenement.key.toLowerCase();

  if (phaseBlackjack === "mise" && /^[1-4]$/.test(touche)) {
    miser(MISES[Number(touche) - 1]);
  } else if (touche === "t") {
    tirerBlackjack();
  } else if (touche === "r") {
    resterBlackjack();
  } else if (touche === "d") {
    doublerBlackjack();
  } else if (touche === "s") {
    separerBlackjack();
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

// Un clic sur le tapis relance un coup apres un resultat
mainsJoueurHtml.addEventListener("click", function () {
  if (phaseBlackjack === "resultat") {
    nouveauCoup();
  }
});

// ===== Inscription dans l'arcade =====
enregistrerJeu({
  id: "blackjack",
  nom: "Blackjack",
  code: "21",
  section: zoneBlackjack,
  demarrer: demarrerBlackjack
});