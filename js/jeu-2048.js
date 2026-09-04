// =====================================================================
//  2048 - fusion de tuiles sur une grille 4 x 4
//  La partie en cours est sauvegardee, on peut reprendre plus tard.
// =====================================================================

const zone2048 = document.getElementById("jeu2048");
const grille2048 = document.getElementById("grille2048");
const zoneScore2048 = document.getElementById("score2048");
const zoneMeilleur2048 = document.getElementById("meilleur2048");
const boutonNouvelle2048 = document.getElementById("nouvelle2048");
const boutonQuitter2048 = document.getElementById("quitter2048");

const COTE_2048 = 4;
const CLE_PARTIE_2048 = "tanuki-arcade-2048";

// Palette : plus la tuile est grande, plus elle tire vers le lime
const COULEURS_2048 = {
  2: "#242424",
  4: "#2e2e2e",
  8: "#3a3f2a",
  16: "#474f2c",
  32: "#55612e",
  64: "#647330",
  128: "#748532",
  256: "#87993a",
  512: "#9fc43f",
  1024: "#b4dc4f",
  2048: "#c8f060"
};

let grilleTuiles = [];
let score2048 = 0;
let meilleur2048 = 0;
let partie2048Terminee = false;
let objectifAtteint = false;
let departTouche2048 = null;

// ---------------------------------------------------------------------
// Sauvegarde de la partie en cours
// ---------------------------------------------------------------------

function sauverPartie2048() {
  try {
    localStorage.setItem(CLE_PARTIE_2048, JSON.stringify({
      grille: grilleTuiles,
      score: score2048,
      objectif: objectifAtteint
    }));
  } catch (erreur) {
    // stockage indisponible : la partie ne sera pas reprise, tant pis
  }
}

function effacerPartie2048() {
  try {
    localStorage.removeItem(CLE_PARTIE_2048);
  } catch (erreur) {
    // rien a faire
  }
}

function chargerPartie2048() {
  try {
    const brut = localStorage.getItem(CLE_PARTIE_2048);
    if (brut === null) {
      return false;
    }
    const donnees = JSON.parse(brut);
    if (!Array.isArray(donnees.grille) || donnees.grille.length !== COTE_2048) {
      return false;
    }
    grilleTuiles = donnees.grille.map(ligne => ligne.slice());
    score2048 = donnees.score || 0;
    objectifAtteint = donnees.objectif === true;
    return true;
  } catch (erreur) {
    return false;
  }
}

// ---------------------------------------------------------------------
// Mise en place
// ---------------------------------------------------------------------

function grilleVide2048() {
  return Array.from({ length: COTE_2048 }, () => Array(COTE_2048).fill(0));
}

function demarrer2048() {
  meilleur2048 = (meilleursScores("2048")[0] || { score: 0 }).score;
  partie2048Terminee = false;

  // On reprend la partie sauvegardee si elle existe encore
  if (!chargerPartie2048()) {
    grilleTuiles = grilleVide2048();
    score2048 = 0;
    objectifAtteint = false;
    ajouterTuile2048();
    ajouterTuile2048();
    sauverPartie2048();
  }
  dessiner2048();
}

function nouvellePartie2048() {
  effacerPartie2048();
  grilleTuiles = grilleVide2048();
  score2048 = 0;
  objectifAtteint = false;
  partie2048Terminee = false;
  ajouterTuile2048();
  ajouterTuile2048();
  sauverPartie2048();
  dessiner2048();
}

function casesLibres2048() {
  const libres = [];
  for (let y = 0; y < COTE_2048; y++) {
    for (let x = 0; x < COTE_2048; x++) {
      if (grilleTuiles[y][x] === 0) {
        libres.push({ x, y });
      }
    }
  }
  return libres;
}

// 90 % de 2 et 10 % de 4, comme dans le jeu d'origine
function ajouterTuile2048() {
  const libres = casesLibres2048();
  if (libres.length === 0) {
    return;
  }
  const place = libres[Math.floor(Math.random() * libres.length)];
  grilleTuiles[place.y][place.x] = Math.random() < 0.9 ? 2 : 4;
}

// ---------------------------------------------------------------------
// Deplacements
// ---------------------------------------------------------------------

// Compacte une ligne vers la gauche et fusionne les paires voisines.
// Une tuile issue d'une fusion ne refusionne pas dans le meme coup.
function compacterLigne2048(ligne) {
  const valeurs = ligne.filter(valeur => valeur !== 0);
  const resultat = [];
  let gagne = 0;

  for (let i = 0; i < valeurs.length; i++) {
    if (valeurs[i] === valeurs[i + 1]) {
      const fusion = valeurs[i] * 2;
      resultat.push(fusion);
      gagne += fusion;
      i++;
    } else {
      resultat.push(valeurs[i]);
    }
  }
  while (resultat.length < COTE_2048) {
    resultat.push(0);
  }
  return { ligne: resultat, gagne };
}

// Lit la grille dans le sens du mouvement, compacte, puis reecrit
function lireLigne2048(index, direction) {
  const ligne = [];
  for (let i = 0; i < COTE_2048; i++) {
    if (direction === "gauche") {
      ligne.push(grilleTuiles[index][i]);
    } else if (direction === "droite") {
      ligne.push(grilleTuiles[index][COTE_2048 - 1 - i]);
    } else if (direction === "haut") {
      ligne.push(grilleTuiles[i][index]);
    } else {
      ligne.push(grilleTuiles[COTE_2048 - 1 - i][index]);
    }
  }
  return ligne;
}

function ecrireLigne2048(index, direction, ligne) {
  for (let i = 0; i < COTE_2048; i++) {
    if (direction === "gauche") {
      grilleTuiles[index][i] = ligne[i];
    } else if (direction === "droite") {
      grilleTuiles[index][COTE_2048 - 1 - i] = ligne[i];
    } else if (direction === "haut") {
      grilleTuiles[i][index] = ligne[i];
    } else {
      grilleTuiles[COTE_2048 - 1 - i][index] = ligne[i];
    }
  }
}

function deplacer2048(direction) {
  if (partie2048Terminee) {
    return false;
  }
  let aBouge = false;
  let gagneTotal = 0;

  for (let index = 0; index < COTE_2048; index++) {
    const avant = lireLigne2048(index, direction);
    const apres = compacterLigne2048(avant);
    if (apres.ligne.join(",") !== avant.join(",")) {
      aBouge = true;
      ecrireLigne2048(index, direction, apres.ligne);
    }
    gagneTotal += apres.gagne;
  }

  if (!aBouge) {
    // Grille bloquee dans tous les sens : la partie est finie
    if (!coupPossible2048()) {
      partie2048Terminee = true;
      effacerPartie2048();
      finDePartie("2048", score2048);
    }
    return false;
  }

  score2048 += gagneTotal;
  ajouterTuile2048();
  sauverPartie2048();

  if (!objectifAtteint && grilleTuiles.some(ligne => ligne.includes(2048))) {
    objectifAtteint = true;
    afficherMessage2048("2048 atteint");
  }
  dessiner2048();

  if (!coupPossible2048()) {
    partie2048Terminee = true;
    effacerPartie2048();
    finDePartie("2048", score2048);
  }
  return true;
}

function coupPossible2048() {
  if (casesLibres2048().length > 0) {
    return true;
  }
  for (let y = 0; y < COTE_2048; y++) {
    for (let x = 0; x < COTE_2048; x++) {
      const valeur = grilleTuiles[y][x];
      if ((x + 1 < COTE_2048 && grilleTuiles[y][x + 1] === valeur)
        || (y + 1 < COTE_2048 && grilleTuiles[y + 1][x] === valeur)) {
        return true;
      }
    }
  }
  return false;
}

// ---------------------------------------------------------------------
// Affichage
// ---------------------------------------------------------------------

let chronoMessage2048 = null;

function afficherMessage2048(texte) {
  zoneMeilleur2048.textContent = texte;
  clearTimeout(chronoMessage2048);
  chronoMessage2048 = setTimeout(() => {
    zoneMeilleur2048.textContent = String(Math.max(meilleur2048, score2048));
  }, 1500);
}

function dessiner2048() {
  grille2048.innerHTML = "";
  for (let y = 0; y < COTE_2048; y++) {
    for (let x = 0; x < COTE_2048; x++) {
      const valeur = grilleTuiles[y][x];
      const tuile = document.createElement("div");
      tuile.className = valeur === 0 ? "tuile vide" : "tuile";
      if (valeur !== 0) {
        tuile.textContent = String(valeur);
        tuile.style.backgroundColor = COULEURS_2048[valeur] || "#c8f060";
        // Texte sombre sur les tuiles claires, clair sur les tuiles sombres
        tuile.style.color = valeur >= 512 ? "#0e0e0e" : "#f2f2f2";
        if (valeur >= 1024) {
          tuile.classList.add("grande");
        }
      }
      grille2048.appendChild(tuile);
    }
  }
  zoneScore2048.textContent = String(score2048);
  zoneMeilleur2048.textContent = String(Math.max(meilleur2048, score2048));
}

// ---------------------------------------------------------------------
// Commandes
// ---------------------------------------------------------------------

document.addEventListener("keydown", function (evenement) {
  if (jeuActif !== "2048" || overlayOuvert) {
    return;
  }
  const touche = evenement.key.toLowerCase();

  if (touche === "arrowleft" || touche === "q" || touche === "a") {
    deplacer2048("gauche");
  } else if (touche === "arrowright" || touche === "d") {
    deplacer2048("droite");
  } else if (touche === "arrowup" || touche === "z" || touche === "w") {
    deplacer2048("haut");
  } else if (touche === "arrowdown" || touche === "s") {
    deplacer2048("bas");
  } else if (touche === "n") {
    nouvellePartie2048();
  } else if (touche === "escape") {
    quitterJeu();
    return;
  } else {
    return;
  }
  evenement.preventDefault();
});

grille2048.addEventListener("touchstart", function (evenement) {
  const contact = evenement.touches[0];
  departTouche2048 = { x: contact.clientX, y: contact.clientY };
}, { passive: true });

grille2048.addEventListener("touchend", function (evenement) {
  if (!departTouche2048 || overlayOuvert) {
    return;
  }
  const contact = evenement.changedTouches[0];
  const deltaX = contact.clientX - departTouche2048.x;
  const deltaY = contact.clientY - departTouche2048.y;
  departTouche2048 = null;

  if (Math.abs(deltaX) < 20 && Math.abs(deltaY) < 20) {
    return;
  }
  if (Math.abs(deltaX) > Math.abs(deltaY)) {
    deplacer2048(deltaX > 0 ? "droite" : "gauche");
  } else {
    deplacer2048(deltaY > 0 ? "bas" : "haut");
  }
});

boutonNouvelle2048.addEventListener("click", nouvellePartie2048);
boutonQuitter2048.addEventListener("click", quitterJeu);

// ===== Inscription dans l'arcade =====
enregistrerJeu({
  id: "2048",
  nom: "2048",
  code: "2048",
  section: zone2048,
  demarrer: demarrer2048
});