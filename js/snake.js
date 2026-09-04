// =====================================================================
//  SNAKE - version enrichie
//  Le serpent traverse les bords et ressort en face. Des bonus et des
//  malus apparaissent le temps de quelques secondes, une pomme doree
//  rapporte gros, et des murs s'ajoutent a mesure que le score monte.
// =====================================================================

const zoneJeu = document.getElementById("jeu");
const boutonQuitterJeu = document.getElementById("quitterJeu");
const canvasSnake = document.getElementById("canvasSnake");
const zoneScore = document.getElementById("score");
const zonePommes = document.getElementById("pommesSnake");
const zoneMessageSnake = document.getElementById("messageSnake");
const zoneEffetsSnake = document.getElementById("effetsSnake");

const TAILLE_GRILLE = 20;
const TAILLE_CASE = canvasSnake.width / TAILLE_GRILLE;

const VITESSE_DEPART = 130;      // millisecondes entre deux cases
const VITESSE_MINIMALE = 60;
const DUREE_POMME_DOREE = 7;     // secondes de presence
const DUREE_EFFET = 8;           // secondes pour un bonus ou un malus
const POMMES_PAR_MUR = 5;        // un mur de plus toutes les cinq pommes
const MURS_MAXIMUM = 14;

// Objets qui peuvent apparaitre en plus de la pomme normale
const OBJETS_SNAKE = {
  doree: { lettre: "\u2605", couleur: "#ffd447", bonus: true, texte: "Pomme doree" },
  ralenti: { lettre: "S", couleur: "#c8f060", bonus: true, texte: "Ralenti" },
  double: { lettre: "2", couleur: "#c8f060", bonus: true, texte: "Points doubles" },
  raccourci: { lettre: "-", couleur: "#c8f060", bonus: true, texte: "Serpent raccourci" },
  rapide: { lettre: "R", couleur: "#ff5f56", bonus: false, texte: "Acceleration" },
  inverse: { lettre: "?", couleur: "#ff5f56", bonus: false, texte: "Commandes inversees" }
};
const TYPES_OBJETS = Object.keys(OBJETS_SNAKE);

let serpent = [];
let direction = { x: 1, y: 0 };
let prochaineDirection = { x: 1, y: 0 };
let pomme = { x: 0, y: 0 };
let objet = null;                // { x, y, type, restant }
let murs = [];
let score = 0;
let pommesMangees = 0;
let partieTerminee = false;
let effets = {};                 // type -> secondes restantes
let chronoObjet = 0;
let accumulateur = 0;
let boucleSnake = null;
let dernierTempsSnake = 0;
let departTouche = null;
let chronoMessageSnake = null;

// ---------------------------------------------------------------------
// Mise en place
// ---------------------------------------------------------------------

function demarrerPartie() {
  serpent = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
  direction = { x: 1, y: 0 };
  prochaineDirection = { x: 1, y: 0 };
  score = 0;
  pommesMangees = 0;
  partieTerminee = false;
  effets = {};
  objet = null;
  chronoObjet = 0;
  murs = [];
  accumulateur = 0;
  placerPomme();
  majStatsSnake();
  afficherMessageSnake("");
  dernierTempsSnake = performance.now();
  cancelAnimationFrame(boucleSnake);
  boucleSnake = requestAnimationFrame(boucleDeJeuSnake);
}

function caseLibre(x, y) {
  return !serpent.some(segment => segment.x === x && segment.y === y)
    && !murs.some(mur => mur.x === x && mur.y === y)
    && !(pomme.x === x && pomme.y === y)
    && !(objet !== null && objet.x === x && objet.y === y);
}

function positionLibre() {
  const libres = [];
  for (let y = 0; y < TAILLE_GRILLE; y++) {
    for (let x = 0; x < TAILLE_GRILLE; x++) {
      if (caseLibre(x, y)) {
        libres.push({ x, y });
      }
    }
  }
  return libres.length === 0 ? null : libres[Math.floor(Math.random() * libres.length)];
}

function placerPomme() {
  const place = positionLibre();
  if (place !== null) {
    pomme = place;
  }
}

// Les murs se posent loin de la tete pour ne pas piéger le joueur
function ajouterMur() {
  if (murs.length >= MURS_MAXIMUM) {
    return;
  }
  const tete = serpent[0];
  for (let essai = 0; essai < 40; essai++) {
    const place = positionLibre();
    if (place === null) {
      return;
    }
    const distance = Math.abs(place.x - tete.x) + Math.abs(place.y - tete.y);
    if (distance >= 5) {
      murs.push(place);
      return;
    }
  }
}

function majStatsSnake() {
  zoneScore.textContent = String(score);
  zonePommes.textContent = String(pommesMangees);
}

function afficherMessageSnake(texte) {
  zoneMessageSnake.textContent = texte;
  clearTimeout(chronoMessageSnake);
  if (texte !== "") {
    chronoMessageSnake = setTimeout(() => {
      zoneMessageSnake.textContent = "";
    }, 1400);
  }
}

// ---------------------------------------------------------------------
// Bonus et malus
// ---------------------------------------------------------------------

function effetActif(type) {
  return (effets[type] || 0) > 0;
}

function vitesseActuelle() {
  // Le serpent accelere naturellement, puis selon les effets en cours
  let vitesse = Math.max(VITESSE_MINIMALE, VITESSE_DEPART - pommesMangees * 2.5);
  if (effetActif("ralenti")) {
    vitesse *= 1.6;
  }
  if (effetActif("rapide")) {
    vitesse *= 0.6;
  }
  return vitesse;
}

function faireApparaitreObjet() {
  const place = positionLibre();
  if (place === null) {
    return;
  }
  const type = TYPES_OBJETS[Math.floor(Math.random() * TYPES_OBJETS.length)];
  objet = { x: place.x, y: place.y, type, restant: DUREE_POMME_DOREE };
}

function ramasserObjet(type) {
  const modele = OBJETS_SNAKE[type];
  afficherMessageSnake(modele.texte);

  if (type === "doree") {
    score += effetActif("double") ? 10 : 5;
  } else if (type === "raccourci") {
    while (serpent.length > 3) {
      serpent.pop();
    }
  } else {
    effets[type] = DUREE_EFFET;
    // Ralenti et acceleration s'annulent l'un l'autre
    if (type === "ralenti") {
      effets.rapide = 0;
    }
    if (type === "rapide") {
      effets.ralenti = 0;
    }
  }
  majStatsSnake();
}

function majEffets(delta) {
  for (const type of Object.keys(effets)) {
    if (effets[type] > 0) {
      effets[type] = Math.max(0, effets[type] - delta);
    }
  }

  if (objet !== null) {
    objet.restant -= delta;
    if (objet.restant <= 0) {
      objet = null;
      chronoObjet = 0;
    }
  } else {
    chronoObjet += delta;
    // Un objet toutes les douze secondes environ
    if (chronoObjet > 12) {
      chronoObjet = 0;
      faireApparaitreObjet();
    }
  }

  const actifs = Object.keys(effets)
    .filter(type => effets[type] > 0)
    .map(type => OBJETS_SNAKE[type].texte + " " + Math.ceil(effets[type]) + "s");
  zoneEffetsSnake.textContent = actifs.join("   ");
}

// ---------------------------------------------------------------------
// Deroulement
// ---------------------------------------------------------------------

function avancer() {
  direction = prochaineDirection;

  // Le serpent traverse les bords et ressort de l'autre cote
  const tete = {
    x: (serpent[0].x + direction.x + TAILLE_GRILLE) % TAILLE_GRILLE,
    y: (serpent[0].y + direction.y + TAILLE_GRILLE) % TAILLE_GRILLE
  };

  const seMord = serpent.some(segment => segment.x === tete.x && segment.y === tete.y);
  const heurteUnMur = murs.some(mur => mur.x === tete.x && mur.y === tete.y);

  if (seMord || heurteUnMur) {
    partieTerminee = true;
    dessiner();
    finDePartie("snake", score);
    return;
  }

  serpent.unshift(tete);

  if (tete.x === pomme.x && tete.y === pomme.y) {
    pommesMangees++;
    score += effetActif("double") ? 2 : 1;
    majStatsSnake();
    placerPomme();
    if (pommesMangees % POMMES_PAR_MUR === 0) {
      ajouterMur();
      afficherMessageSnake("Un mur apparait");
    }
  } else {
    serpent.pop();
  }

  if (objet !== null && tete.x === objet.x && tete.y === objet.y) {
    ramasserObjet(objet.type);
    objet = null;
    chronoObjet = 0;
  }
}

function boucleDeJeuSnake(maintenant) {
  const delta = Math.min(0.1, (maintenant - dernierTempsSnake) / 1000);
  dernierTempsSnake = maintenant;

  if (!partieTerminee && jeuActif === "snake" && !overlayOuvert) {
    majEffets(delta);
    accumulateur += delta * 1000;
    while (accumulateur >= vitesseActuelle() && !partieTerminee) {
      accumulateur -= vitesseActuelle();
      avancer();
    }
  }

  dessiner();
  boucleSnake = requestAnimationFrame(boucleDeJeuSnake);
}

// ---------------------------------------------------------------------
// Dessin
// ---------------------------------------------------------------------

function dessiner() {
  const contexte = canvasSnake.getContext("2d");
  const largeur = canvasSnake.width;

  contexte.fillStyle = "#0e0e0e";
  contexte.fillRect(0, 0, largeur, largeur);

  contexte.strokeStyle = "#1a1a1a";
  contexte.lineWidth = 1;
  for (let i = 1; i < TAILLE_GRILLE; i++) {
    contexte.beginPath();
    contexte.moveTo(i * TAILLE_CASE, 0);
    contexte.lineTo(i * TAILLE_CASE, largeur);
    contexte.moveTo(0, i * TAILLE_CASE);
    contexte.lineTo(largeur, i * TAILLE_CASE);
    contexte.stroke();
  }

  // Murs
  contexte.fillStyle = "#3a3a3a";
  murs.forEach(mur => {
    contexte.fillRect(mur.x * TAILLE_CASE + 1, mur.y * TAILLE_CASE + 1, TAILLE_CASE - 2, TAILLE_CASE - 2);
  });

  // Pomme
  contexte.fillStyle = "#f2f2f2";
  contexte.fillRect(pomme.x * TAILLE_CASE + 4, pomme.y * TAILLE_CASE + 4, TAILLE_CASE - 8, TAILLE_CASE - 8);

  // Objet en attente, qui clignote quand il va disparaitre
  if (objet !== null && (objet.restant > 2 || Math.floor(objet.restant * 6) % 2 === 0)) {
    const modele = OBJETS_SNAKE[objet.type];
    contexte.fillStyle = modele.couleur;
    contexte.beginPath();
    contexte.arc(
      objet.x * TAILLE_CASE + TAILLE_CASE / 2,
      objet.y * TAILLE_CASE + TAILLE_CASE / 2,
      TAILLE_CASE / 2 - 3, 0, Math.PI * 2);
    contexte.fill();
    contexte.fillStyle = "#0e0e0e";
    contexte.font = "bold " + Math.round(TAILLE_CASE * 0.6) + "px 'JetBrains Mono', monospace";
    contexte.textAlign = "center";
    contexte.textBaseline = "middle";
    contexte.fillText(modele.lettre,
      objet.x * TAILLE_CASE + TAILLE_CASE / 2,
      objet.y * TAILLE_CASE + TAILLE_CASE / 2 + 1);
  }

  // Serpent, teinte selon l'effet en cours
  const couleurTete = effetActif("inverse") ? "#ff5f56"
    : effetActif("rapide") ? "#ffd447"
      : "#c8f060";
  serpent.forEach((segment, index) => {
    contexte.fillStyle = index === 0 ? couleurTete : "#9fc43f";
    contexte.fillRect(segment.x * TAILLE_CASE + 1, segment.y * TAILLE_CASE + 1, TAILLE_CASE - 2, TAILLE_CASE - 2);
  });

  if (partieTerminee) {
    contexte.fillStyle = "rgba(14, 14, 14, 0.8)";
    contexte.fillRect(0, 0, largeur, largeur);
    contexte.fillStyle = "#c8f060";
    contexte.font = "80px 'Bebas Neue', Impact, sans-serif";
    contexte.textAlign = "center";
    contexte.fillText("GAME OVER", largeur / 2, largeur / 2 - 10);
  }
}

// ---------------------------------------------------------------------
// Commandes
// ---------------------------------------------------------------------

function changerDirection(x, y) {
  // Le malus d'inversion retourne les commandes
  if (effetActif("inverse")) {
    x = -x;
    y = -y;
  }
  // Demi-tour immediat interdit
  if (x === -direction.x && y === -direction.y) {
    return;
  }
  prochaineDirection = { x, y };
}

document.addEventListener("keydown", function (evenement) {
  if (jeuActif !== "snake" || overlayOuvert) {
    return;
  }
  const touche = evenement.key.toLowerCase();

  if (touche === "arrowup" || touche === "z" || touche === "w") {
    changerDirection(0, -1);
  } else if (touche === "arrowdown" || touche === "s") {
    changerDirection(0, 1);
  } else if (touche === "arrowleft" || touche === "q" || touche === "a") {
    changerDirection(-1, 0);
  } else if (touche === "arrowright" || touche === "d") {
    changerDirection(1, 0);
  } else if (touche === "n") {
    demarrerPartie();
  } else if (touche === "escape") {
    quitterJeu();
    return;
  } else {
    return;
  }
  evenement.preventDefault();
});

canvasSnake.addEventListener("touchstart", function (evenement) {
  const contact = evenement.touches[0];
  departTouche = { x: contact.clientX, y: contact.clientY };
}, { passive: true });

canvasSnake.addEventListener("touchend", function (evenement) {
  if (!departTouche || overlayOuvert) {
    return;
  }
  const contact = evenement.changedTouches[0];
  const deltaX = contact.clientX - departTouche.x;
  const deltaY = contact.clientY - departTouche.y;
  departTouche = null;

  if (Math.abs(deltaX) < 20 && Math.abs(deltaY) < 20) {
    return;
  }
  if (Math.abs(deltaX) > Math.abs(deltaY)) {
    changerDirection(deltaX > 0 ? 1 : -1, 0);
  } else {
    changerDirection(0, deltaY > 0 ? 1 : -1);
  }
});

boutonQuitterJeu.addEventListener("click", quitterJeu);

// ===== Inscription dans l'arcade =====
enregistrerJeu({
  id: "snake",
  nom: "Snake",
  code: "713702",
  section: zoneJeu,
  demarrer: demarrerPartie,
  arreter: () => cancelAnimationFrame(boucleSnake)
});