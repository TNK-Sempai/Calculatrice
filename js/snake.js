// =====================================================================
//  SNAKE - le serpent traverse les bords et ressort en face
// =====================================================================

const zoneJeu = document.getElementById("jeu");
const boutonQuitterJeu = document.getElementById("quitterJeu");
const canvasSnake = document.getElementById("canvasSnake");
const zoneScore = document.getElementById("score");

const TAILLE_GRILLE = 20;      // 20 x 20 cases
const TAILLE_CASE = canvasSnake.width / TAILLE_GRILLE;
const VITESSE_MS = 120;

let serpent = [];
let direction = { x: 1, y: 0 };
let prochaineDirection = { x: 1, y: 0 };
let pomme = { x: 0, y: 0 };
let score = 0;
let partieTerminee = false;
let intervalleJeu = null;
let departTouche = null;

function demarrerPartie() {
  serpent = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
  direction = { x: 1, y: 0 };
  prochaineDirection = { x: 1, y: 0 };
  score = 0;
  partieTerminee = false;
  zoneScore.textContent = "0";
  placerPomme();
  clearInterval(intervalleJeu);
  intervalleJeu = setInterval(tourDeJeu, VITESSE_MS);
  dessiner();
}

function placerPomme() {
  let position;
  do {
    position = {
      x: Math.floor(Math.random() * TAILLE_GRILLE),
      y: Math.floor(Math.random() * TAILLE_GRILLE)
    };
  } while (serpent.some(segment => segment.x === position.x && segment.y === position.y));
  pomme = position;
}

function tourDeJeu() {
  if (partieTerminee) {
    return;
  }
  direction = prochaineDirection;
  // Le serpent traverse les bords et ressort de l'autre cote
  const tete = {
    x: (serpent[0].x + direction.x + TAILLE_GRILLE) % TAILLE_GRILLE,
    y: (serpent[0].y + direction.y + TAILLE_GRILLE) % TAILLE_GRILLE
  };

  const seMord = serpent.some(segment => segment.x === tete.x && segment.y === tete.y);

  if (seMord) {
    partieTerminee = true;
    dessiner();
    finDePartie("snake", score);
    return;
  }

  serpent.unshift(tete);

  if (tete.x === pomme.x && tete.y === pomme.y) {
    score++;
    zoneScore.textContent = String(score);
    placerPomme();
  } else {
    serpent.pop();
  }

  dessiner();
}

function dessiner() {
  const contexte = canvasSnake.getContext("2d");
  const largeur = canvasSnake.width;

  contexte.fillStyle = "#0e0e0e";
  contexte.fillRect(0, 0, largeur, largeur);

  // Grille discrete
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

  // Pomme
  contexte.fillStyle = "#f2f2f2";
  contexte.fillRect(pomme.x * TAILLE_CASE + 6, pomme.y * TAILLE_CASE + 6, TAILLE_CASE - 12, TAILLE_CASE - 12);

  // Serpent
  serpent.forEach((segment, index) => {
    contexte.fillStyle = index === 0 ? "#c8f060" : "#9fc43f";
    contexte.fillRect(segment.x * TAILLE_CASE + 1, segment.y * TAILLE_CASE + 1, TAILLE_CASE - 2, TAILLE_CASE - 2);
  });

  if (partieTerminee) {
    contexte.fillStyle = "rgba(14, 14, 14, 0.8)";
    contexte.fillRect(0, 0, largeur, largeur);
    contexte.fillStyle = "#c8f060";
    contexte.font = "80px 'Bebas Neue', Impact, sans-serif";
    contexte.textAlign = "center";
    contexte.fillText("GAME OVER", largeur / 2, largeur / 2 - 10);
    contexte.fillStyle = "#6f6f6f";
    contexte.font = "20px 'JetBrains Mono', monospace";
    contexte.fillText("Espace pour rejouer", largeur / 2, largeur / 2 + 40);
  }
}

function changerDirection(x, y) {
  // Interdit le demi-tour immediat
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
  } else if (touche === " ") {
    if (partieTerminee) {
      demarrerPartie();
    }
  } else if (touche === "escape") {
    quitterJeu();
    return;
  } else {
    return;
  }
  evenement.preventDefault();
});

// Controle tactile : glisser le doigt sur le canvas
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
    if (partieTerminee) {
      demarrerPartie();
    }
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
  arreter: () => clearInterval(intervalleJeu)
});

