// =====================================================================
//  SOLITAIRE A BILLES - plateau anglais en croix, 33 trous
//  On saute par-dessus une bille voisine vers un trou vide,
//  la bille sautee est retiree. Le but est d'en laisser une seule,
//  au centre si possible. Le score est le nombre de billes restantes,
//  donc plus il est bas, mieux c'est.
// =====================================================================

const zoneSolitaire = document.getElementById("jeuSolitaire");
const plateauSolitaire = document.getElementById("plateauSolitaire");
const zoneBilles = document.getElementById("billesSolitaire");
const zoneCoups = document.getElementById("coupsSolitaire");
const zoneMessageSolitaire = document.getElementById("messageSolitaire");
const boutonAnnulerSolitaire = document.getElementById("annulerSolitaire");
const boutonNouvelleSolitaire = document.getElementById("nouvelleSolitaire");
const boutonQuitterSolitaire = document.getElementById("quitterSolitaire");

const COTE_SOLITAIRE = 7;
const CENTRE_SOLITAIRE = 3;

// Etats possibles d'une case
const HORS_PLATEAU = -1;
const TROU_VIDE = 0;
const BILLE = 1;

let casesSolitaire = [];
let caseChoisie = null;      // { x, y } de la bille selectionnee
let coupsJoues = 0;
let historiqueSolitaire = [];
let solitaireTermine = false;

// ---------------------------------------------------------------------
// Plateau
// ---------------------------------------------------------------------

// Croix anglaise : les quatre blocs 2 x 2 des coins sont hors plateau
function caseValide(x, y) {
  const dansCroix = (x >= 2 && x <= 4) || (y >= 2 && y <= 4);
  return x >= 0 && x < COTE_SOLITAIRE && y >= 0 && y < COTE_SOLITAIRE && dansCroix;
}

function nouveauPlateauSolitaire() {
  const plateau = [];
  for (let y = 0; y < COTE_SOLITAIRE; y++) {
    const ligne = [];
    for (let x = 0; x < COTE_SOLITAIRE; x++) {
      if (!caseValide(x, y)) {
        ligne.push(HORS_PLATEAU);
      } else if (x === CENTRE_SOLITAIRE && y === CENTRE_SOLITAIRE) {
        ligne.push(TROU_VIDE);
      } else {
        ligne.push(BILLE);
      }
    }
    plateau.push(ligne);
  }
  return plateau;
}

function demarrerSolitaire() {
  casesSolitaire = nouveauPlateauSolitaire();
  caseChoisie = null;
  coupsJoues = 0;
  historiqueSolitaire = [];
  solitaireTermine = false;
  zoneMessageSolitaire.textContent = "";
  construirePlateauSolitaire();
  dessinerSolitaire();
}

function billesRestantes() {
  return casesSolitaire.flat().filter(etat => etat === BILLE).length;
}

// ---------------------------------------------------------------------
// Regles de deplacement
// ---------------------------------------------------------------------

const DIRECTIONS_SOLITAIRE = [
  { x: 0, y: -1 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 }
];

// Sauts possibles depuis une bille donnee
function sautsDepuis(x, y) {
  if (casesSolitaire[y][x] !== BILLE) {
    return [];
  }
  const sauts = [];
  for (const direction of DIRECTIONS_SOLITAIRE) {
    const sauteeX = x + direction.x;
    const sauteeY = y + direction.y;
    const arriveeX = x + direction.x * 2;
    const arriveeY = y + direction.y * 2;

    if (!caseValide(sauteeX, sauteeY) || !caseValide(arriveeX, arriveeY)) {
      continue;
    }
    if (casesSolitaire[sauteeY][sauteeX] === BILLE && casesSolitaire[arriveeY][arriveeX] === TROU_VIDE) {
      sauts.push({ x: arriveeX, y: arriveeY, sauteeX, sauteeY });
    }
  }
  return sauts;
}

function coupRestant() {
  for (let y = 0; y < COTE_SOLITAIRE; y++) {
    for (let x = 0; x < COTE_SOLITAIRE; x++) {
      if (casesSolitaire[y][x] === BILLE && sautsDepuis(x, y).length > 0) {
        return true;
      }
    }
  }
  return false;
}

function jouerSaut(depart, saut) {
  historiqueSolitaire.push({
    depart: { x: depart.x, y: depart.y },
    arrivee: { x: saut.x, y: saut.y },
    sautee: { x: saut.sauteeX, y: saut.sauteeY }
  });

  casesSolitaire[depart.y][depart.x] = TROU_VIDE;
  casesSolitaire[saut.sauteeY][saut.sauteeX] = TROU_VIDE;
  casesSolitaire[saut.y][saut.x] = BILLE;
  coupsJoues++;
  caseChoisie = null;

  dessinerSolitaire();
  verifierFinSolitaire();
}

function annulerCoupSolitaire() {
  if (solitaireTermine || historiqueSolitaire.length === 0) {
    return;
  }
  const dernier = historiqueSolitaire.pop();
  casesSolitaire[dernier.arrivee.y][dernier.arrivee.x] = TROU_VIDE;
  casesSolitaire[dernier.sautee.y][dernier.sautee.x] = BILLE;
  casesSolitaire[dernier.depart.y][dernier.depart.x] = BILLE;
  coupsJoues--;
  caseChoisie = null;
  zoneMessageSolitaire.textContent = "";
  dessinerSolitaire();
}

function verifierFinSolitaire() {
  if (coupRestant()) {
    return;
  }
  solitaireTermine = true;
  const restantes = billesRestantes();
  const auCentre = casesSolitaire[CENTRE_SOLITAIRE][CENTRE_SOLITAIRE] === BILLE;

  if (restantes === 1 && auCentre) {
    zoneMessageSolitaire.textContent = "Parfait, une bille au centre";
  } else if (restantes === 1) {
    zoneMessageSolitaire.textContent = "Une seule bille, mais pas au centre";
  } else {
    zoneMessageSolitaire.textContent = "Plus aucun saut possible";
  }
  finDePartie("solitaire", restantes);
}

// ---------------------------------------------------------------------
// Selection a la souris ou au doigt
// ---------------------------------------------------------------------

function choisirCase(x, y) {
  if (solitaireTermine) {
    return;
  }

  // Deuxieme clic : si la case est une arrivee valide, on joue le saut
  if (caseChoisie !== null) {
    const saut = sautsDepuis(caseChoisie.x, caseChoisie.y)
      .find(possible => possible.x === x && possible.y === y);
    if (saut) {
      jouerSaut(caseChoisie, saut);
      return;
    }
  }

  // Sinon on selectionne, ou on deselectionne si on reclique dessus
  if (casesSolitaire[y][x] === BILLE) {
    const memeCase = caseChoisie !== null && caseChoisie.x === x && caseChoisie.y === y;
    caseChoisie = memeCase ? null : { x, y };
  } else {
    caseChoisie = null;
  }
  dessinerSolitaire();
}

// ---------------------------------------------------------------------
// Affichage
// ---------------------------------------------------------------------

// Le plateau est construit une seule fois, on ne fait ensuite que
// mettre a jour les classes de chaque case.
function construirePlateauSolitaire() {
  plateauSolitaire.innerHTML = "";
  for (let y = 0; y < COTE_SOLITAIRE; y++) {
    for (let x = 0; x < COTE_SOLITAIRE; x++) {
      const element = document.createElement("div");
      if (!caseValide(x, y)) {
        element.className = "case-solitaire hors-plateau";
      } else {
        element.className = "case-solitaire";
        element.dataset.x = String(x);
        element.dataset.y = String(y);
      }
      plateauSolitaire.appendChild(element);
    }
  }
}

function dessinerSolitaire() {
  const arrivees = caseChoisie === null ? [] : sautsDepuis(caseChoisie.x, caseChoisie.y);

  for (const element of plateauSolitaire.children) {
    if (element.dataset.x === undefined) {
      continue;
    }
    const x = Number(element.dataset.x);
    const y = Number(element.dataset.y);

    element.classList.remove("bille", "choisie", "arrivee", "jouable");

    if (casesSolitaire[y][x] === BILLE) {
      element.classList.add("bille");
      if (sautsDepuis(x, y).length > 0 && caseChoisie === null) {
        element.classList.add("jouable");
      }
    }
    if (caseChoisie !== null && caseChoisie.x === x && caseChoisie.y === y) {
      element.classList.add("choisie");
    }
    if (arrivees.some(saut => saut.x === x && saut.y === y)) {
      element.classList.add("arrivee");
    }
  }

  zoneBilles.textContent = String(billesRestantes());
  zoneCoups.textContent = String(coupsJoues);
}

// ---------------------------------------------------------------------
// Commandes
// ---------------------------------------------------------------------

plateauSolitaire.addEventListener("click", function (evenement) {
  if (jeuActif !== "solitaire" || overlayOuvert) {
    return;
  }
  const element = evenement.target.closest(".case-solitaire");
  if (!element || element.dataset.x === undefined) {
    return;
  }
  choisirCase(Number(element.dataset.x), Number(element.dataset.y));
});

document.addEventListener("keydown", function (evenement) {
  if (jeuActif !== "solitaire" || overlayOuvert) {
    return;
  }
  const touche = evenement.key.toLowerCase();

  if (touche === "z" && (evenement.ctrlKey || evenement.metaKey)) {
    annulerCoupSolitaire();
  } else if (touche === "backspace") {
    annulerCoupSolitaire();
  } else if (touche === "n") {
    demarrerSolitaire();
  } else if (touche === "escape") {
    quitterJeu();
    return;
  } else {
    return;
  }
  evenement.preventDefault();
});

boutonAnnulerSolitaire.addEventListener("click", annulerCoupSolitaire);
boutonNouvelleSolitaire.addEventListener("click", demarrerSolitaire);
boutonQuitterSolitaire.addEventListener("click", quitterJeu);

// ===== Inscription dans l'arcade =====
enregistrerJeu({
  id: "solitaire",
  nom: "Solitaire",
  code: "33",
  section: zoneSolitaire,
  demarrer: demarrerSolitaire,
  plusBasEstMieux: true
});
