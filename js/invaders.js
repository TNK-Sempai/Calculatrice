// =====================================================================
//  SPACE INVADERS - version fidele a l'original
//  Formation de 55 envahisseurs qui descend d'un cran a chaque bord,
//  et qui accelere a mesure qu'ils sont detruits. Quatre abris
//  destructibles, un vaisseau mystere, et des vagues de plus en plus
//  basses au depart.
// =====================================================================

const zoneInvaders = document.getElementById("jeuInvaders");
const canvasInvaders = document.getElementById("canvasInvaders");
const zoneScoreInvaders = document.getElementById("scoreInvaders");
const zoneViesInvaders = document.getElementById("viesInvaders");
const zoneVagueInvaders = document.getElementById("vagueInvaders");
const zoneMessageInvaders = document.getElementById("messageInvaders");
const boutonRecommencerInvaders = document.getElementById("recommencerInvaders");
const boutonQuitterInvaders = document.getElementById("quitterInvaders");

const LARGEUR_INVADERS = 480;
const HAUTEUR_INVADERS = 600;
const COLONNES_ENVAHISSEURS = 11;
const LIGNES_ENVAHISSEURS = 5;
const PAS_HORIZONTAL = 8;
const PAS_VERTICAL = 16;
const HAUTEUR_JOUEUR = 550;
const LIGNE_DEFAITE = 520;
const VIES_INVADERS = 3;
const CLE_INVADERS = "tanuki-arcade-invaders";

// Sprites en pixels : "1" pour un pixel plein. Deux images par type
// pour l'animation, comme sur la borne d'origine.
const SPRITES = {
  calamar: [
    ["00111100", "01111110", "11011011", "11111111", "01011010", "10100101"],
    ["00111100", "01111110", "11011011", "11111111", "00100100", "01011010"]
  ],
  crabe: [
    ["00100100", "10100101", "10111101", "11011011", "11111111", "01000010"],
    ["00100100", "00100100", "10111101", "11011011", "11111111", "10000001"]
  ],
  poulpe: [
    ["00111100", "01111110", "11111111", "11011011", "00100100", "01011010"],
    ["00111100", "01111110", "11111111", "11011011", "01011010", "10100101"]
  ],
  joueur: ["000010000", "000111000", "011111110", "111111111", "111111111"],
  mystere: ["0011111100", "0111111110", "1101101101", "1111111111", "0011001100"]
};

// Le type et les points dependent de la rangee
const TYPES_PAR_LIGNE = ["calamar", "crabe", "crabe", "poulpe", "poulpe"];
const POINTS_PAR_LIGNE = [30, 20, 20, 10, 10];
const POINTS_MYSTERE = [50, 100, 150, 300];

const TAILLE_PIXEL = 3;
const LARGEUR_ENVAHISSEUR = 8 * TAILLE_PIXEL;
const HAUTEUR_ENVAHISSEUR = 6 * TAILLE_PIXEL;
const ESPACE_COLONNE = 36;
const ESPACE_LIGNE = 34;

// Abris : grille de blocs que les tirs grignotent
const TAILLE_BLOC_ABRI = 4;
const FORME_ABRI = [
  "0011111100",
  "0111111110",
  "1111111111",
  "1111111111",
  "1111111111",
  "1111001111",
  "1110000111"
];

let envahisseurs = [];
let abris = [];
let tirJoueur = null;
let bombes = [];
let mystere = null;
let joueurX = LARGEUR_INVADERS / 2;
let scoreInvaders = 0;
let meilleurInvaders = 0;
let viesInvaders = VIES_INVADERS;
let vagueInvaders = 1;
let directionInvaders = 1;
let imageEnvahisseurs = 0;
let invadersTermine = false;
let pauseTouche = 0;              // petite pause quand le joueur est touche
let chronoDeplacement = 0;
let chronoMystere = 0;
let boucleInvaders = null;
let dernierTempsInvaders = 0;
let gaucheInvaders = false;
let droiteInvaders = false;
let tirDemande = false;
let chronoMessageInvaders = null;

// ---------------------------------------------------------------------
// Meilleur score local
// ---------------------------------------------------------------------

function chargerMeilleurInvaders() {
  try {
    const brut = localStorage.getItem(CLE_INVADERS);
    meilleurInvaders = brut === null ? 0 : Number(brut) || 0;
  } catch (erreur) {
    meilleurInvaders = 0;
  }
}

function sauverMeilleurInvaders() {
  try {
    localStorage.setItem(CLE_INVADERS, String(meilleurInvaders));
  } catch (erreur) {
    // stockage indisponible
  }
}

// ---------------------------------------------------------------------
// Mise en place
// ---------------------------------------------------------------------

function creerEnvahisseurs() {
  const liste = [];
  // Chaque vague demarre une rangee plus bas, jusqu'a un plafond
  const hauteurDepart = 70 + Math.min(4, vagueInvaders - 1) * PAS_VERTICAL * 1.5;

  for (let ligne = 0; ligne < LIGNES_ENVAHISSEURS; ligne++) {
    for (let colonne = 0; colonne < COLONNES_ENVAHISSEURS; colonne++) {
      liste.push({
        x: 40 + colonne * ESPACE_COLONNE,
        y: hauteurDepart + ligne * ESPACE_LIGNE,
        ligne,
        colonne,
        type: TYPES_PAR_LIGNE[ligne],
        points: POINTS_PAR_LIGNE[ligne],
        vivant: true
      });
    }
  }
  return liste;
}

function creerAbris() {
  const liste = [];
  const largeurAbri = FORME_ABRI[0].length * TAILLE_BLOC_ABRI;
  const espace = (LARGEUR_INVADERS - 4 * largeurAbri) / 5;

  for (let index = 0; index < 4; index++) {
    const blocs = FORME_ABRI.map(ligne => ligne.split("").map(caractere => caractere === "1"));
    liste.push({
      x: espace + index * (largeurAbri + espace),
      y: 460,
      blocs
    });
  }
  return liste;
}

function nouvelleVague() {
  envahisseurs = creerEnvahisseurs();
  directionInvaders = 1;
  tirJoueur = null;
  bombes = [];
  mystere = null;
  chronoDeplacement = 0;
  chronoMystere = 0;
  joueurX = LARGEUR_INVADERS / 2;
  afficherMessageInvaders("Vague " + vagueInvaders, 1500);
}

function demarrerInvaders() {
  chargerMeilleurInvaders();
  scoreInvaders = 0;
  viesInvaders = VIES_INVADERS;
  vagueInvaders = 1;
  invadersTermine = false;
  pauseTouche = 0;
  abris = creerAbris();
  nouvelleVague();
  majStatsInvaders();
  dernierTempsInvaders = performance.now();
  cancelAnimationFrame(boucleInvaders);
  boucleInvaders = requestAnimationFrame(boucleSpaceInvaders);
}

function majStatsInvaders() {
  zoneScoreInvaders.textContent = String(scoreInvaders);
  zoneViesInvaders.textContent = String(viesInvaders);
  zoneVagueInvaders.textContent = String(vagueInvaders);
}

function afficherMessageInvaders(texte, duree) {
  zoneMessageInvaders.textContent = texte;
  clearTimeout(chronoMessageInvaders);
  if (duree > 0) {
    chronoMessageInvaders = setTimeout(() => {
      zoneMessageInvaders.textContent = "";
    }, duree);
  }
}

// ---------------------------------------------------------------------
// Deplacement de la formation
// ---------------------------------------------------------------------

function envahisseursVivants() {
  return envahisseurs.filter(envahisseur => envahisseur.vivant);
}

// Plus il en reste peu, plus ils vont vite. Les vagues suivantes
// demarrent deja plus rapides.
function delaiDeplacement() {
  const vivants = envahisseursVivants().length;
  const total = LIGNES_ENVAHISSEURS * COLONNES_ENVAHISSEURS;
  const base = 55 + 700 * Math.pow(vivants / total, 1.4);
  return Math.max(45, base - (vagueInvaders - 1) * 45);
}

function deplacerFormation() {
  const vivants = envahisseursVivants();
  if (vivants.length === 0) {
    return;
  }

  const gauche = Math.min(...vivants.map(e => e.x));
  const droite = Math.max(...vivants.map(e => e.x)) + LARGEUR_ENVAHISSEUR;
  const toucheBord = (directionInvaders > 0 && droite + PAS_HORIZONTAL > LARGEUR_INVADERS - 10)
    || (directionInvaders < 0 && gauche - PAS_HORIZONTAL < 10);

  if (toucheBord) {
    directionInvaders = -directionInvaders;
    vivants.forEach(envahisseur => { envahisseur.y += PAS_VERTICAL; });
  } else {
    vivants.forEach(envahisseur => { envahisseur.x += PAS_HORIZONTAL * directionInvaders; });
  }

  imageEnvahisseurs = 1 - imageEnvahisseurs;

  // Un envahisseur qui atteint la ligne du joueur met fin a la partie
  if (vivants.some(envahisseur => envahisseur.y + HAUTEUR_ENVAHISSEUR >= LIGNE_DEFAITE)) {
    terminerInvaders();
  }
}

// Seul l'envahisseur le plus bas de chaque colonne peut lacher une bombe
function lancerBombe() {
  const parColonne = new Map();
  envahisseursVivants().forEach(envahisseur => {
    const actuel = parColonne.get(envahisseur.colonne);
    if (actuel === undefined || envahisseur.y > actuel.y) {
      parColonne.set(envahisseur.colonne, envahisseur);
    }
  });

  const candidats = Array.from(parColonne.values());
  if (candidats.length === 0) {
    return;
  }
  const tireur = candidats[Math.floor(Math.random() * candidats.length)];
  bombes.push({
    x: tireur.x + LARGEUR_ENVAHISSEUR / 2,
    y: tireur.y + HAUTEUR_ENVAHISSEUR,
    vitesse: 150 + vagueInvaders * 12
  });
}

function probabiliteBombe(delta) {
  const maximum = Math.min(4, 1 + Math.floor(vagueInvaders / 2));
  if (bombes.length >= maximum) {
    return;
  }
  if (Math.random() < delta * (0.9 + vagueInvaders * 0.15)) {
    lancerBombe();
  }
}

// ---------------------------------------------------------------------
// Abris
// ---------------------------------------------------------------------

// Renvoie vrai si un projectile touche un abri, et grignote la zone
function toucherAbri(x, y, rayon) {
  for (const abri of abris) {
    for (let ligne = 0; ligne < abri.blocs.length; ligne++) {
      for (let colonne = 0; colonne < abri.blocs[ligne].length; colonne++) {
        if (!abri.blocs[ligne][colonne]) {
          continue;
        }
        const blocX = abri.x + colonne * TAILLE_BLOC_ABRI;
        const blocY = abri.y + ligne * TAILLE_BLOC_ABRI;
        if (x >= blocX - 1 && x <= blocX + TAILLE_BLOC_ABRI + 1
          && y >= blocY - 1 && y <= blocY + TAILLE_BLOC_ABRI + 1) {
          // On creuse un petit cratere autour du point d'impact
          for (let dy = -rayon; dy <= rayon; dy++) {
            for (let dx = -rayon; dx <= rayon; dx++) {
              const cibleLigne = ligne + dy;
              const cibleColonne = colonne + dx;
              if (abri.blocs[cibleLigne] && abri.blocs[cibleLigne][cibleColonne] !== undefined) {
                abri.blocs[cibleLigne][cibleColonne] = false;
              }
            }
          }
          return true;
        }
      }
    }
  }
  return false;
}

// ---------------------------------------------------------------------
// Projectiles
// ---------------------------------------------------------------------

function tirer() {
  if (invadersTermine || pauseTouche > 0 || tirJoueur !== null) {
    return; // un seul tir a l'ecran, comme dans l'original
  }
  tirJoueur = { x: joueurX, y: HAUTEUR_JOUEUR - 10 };
}

function deplacerTirJoueur(delta) {
  if (tirJoueur === null) {
    return;
  }
  tirJoueur.y -= 520 * delta;

  if (tirJoueur.y < 40) {
    // Le tir touche le haut de l'ecran
    if (mystere !== null && tirJoueur.y < 46 && Math.abs(tirJoueur.x - (mystere.x + 15)) < 18) {
      toucherMystere();
    }
    tirJoueur = null;
    return;
  }

  if (mystere !== null
    && tirJoueur.y <= mystere.y + 15 && tirJoueur.y >= mystere.y - 5
    && tirJoueur.x >= mystere.x && tirJoueur.x <= mystere.x + 30) {
    toucherMystere();
    tirJoueur = null;
    return;
  }

  if (toucherAbri(tirJoueur.x, tirJoueur.y, 1)) {
    tirJoueur = null;
    return;
  }

  const touche = envahisseursVivants().find(envahisseur =>
    tirJoueur.x >= envahisseur.x && tirJoueur.x <= envahisseur.x + LARGEUR_ENVAHISSEUR
    && tirJoueur.y >= envahisseur.y && tirJoueur.y <= envahisseur.y + HAUTEUR_ENVAHISSEUR);

  if (touche) {
    touche.vivant = false;
    scoreInvaders += touche.points;
    tirJoueur = null;
    majStatsInvaders();

    if (envahisseursVivants().length === 0) {
      vagueInvaders++;
      scoreInvaders += 100;
      // Les abris se reparent partiellement entre deux vagues
      abris = creerAbris();
      nouvelleVague();
      majStatsInvaders();
    }
  }
}

function deplacerBombes(delta) {
  bombes.forEach(bombe => { bombe.y += bombe.vitesse * delta; });

  bombes = bombes.filter(bombe => {
    if (bombe.y > HAUTEUR_INVADERS) {
      return false;
    }
    if (toucherAbri(bombe.x, bombe.y, 1)) {
      return false;
    }
    // Une bombe peut detruire le tir du joueur
    if (tirJoueur !== null && Math.abs(bombe.x - tirJoueur.x) < 6 && Math.abs(bombe.y - tirJoueur.y) < 8) {
      tirJoueur = null;
      return false;
    }
    if (bombe.y >= HAUTEUR_JOUEUR - 6 && bombe.y <= HAUTEUR_JOUEUR + 12
      && Math.abs(bombe.x - joueurX) < 15) {
      perdreUneVieInvaders();
      return false;
    }
    return true;
  });
}

// ---------------------------------------------------------------------
// Vaisseau mystere
// ---------------------------------------------------------------------

function gererMystere(delta) {
  if (mystere === null) {
    chronoMystere += delta;
    if (chronoMystere > 22 && envahisseursVivants().length > 6) {
      chronoMystere = 0;
      const versLaDroite = Math.random() < 0.5;
      mystere = {
        x: versLaDroite ? -30 : LARGEUR_INVADERS,
        y: 40,
        direction: versLaDroite ? 1 : -1
      };
    }
    return;
  }

  mystere.x += 90 * mystere.direction * delta;
  if (mystere.x < -40 || mystere.x > LARGEUR_INVADERS + 10) {
    mystere = null;
  }
}

function toucherMystere() {
  scoreInvaders += POINTS_MYSTERE[Math.floor(Math.random() * POINTS_MYSTERE.length)];
  afficherMessageInvaders("Vaisseau mystere", 1200);
  mystere = null;
  majStatsInvaders();
}

// ---------------------------------------------------------------------
// Vies et fin de partie
// ---------------------------------------------------------------------

function perdreUneVieInvaders() {
  viesInvaders--;
  majStatsInvaders();
  pauseTouche = 1.2;
  tirJoueur = null;
  bombes = [];

  if (viesInvaders <= 0) {
    terminerInvaders();
  }
}

function terminerInvaders() {
  if (invadersTermine) {
    return;
  }
  invadersTermine = true;
  viesInvaders = Math.max(0, viesInvaders);
  majStatsInvaders();

  if (scoreInvaders > meilleurInvaders) {
    meilleurInvaders = scoreInvaders;
    sauverMeilleurInvaders();
  }
  afficherMessageInvaders("", 0);
  finDePartie("invaders", scoreInvaders);
}

// ---------------------------------------------------------------------
// Boucle
// ---------------------------------------------------------------------

function boucleSpaceInvaders(maintenant) {
  const delta = Math.min(0.05, (maintenant - dernierTempsInvaders) / 1000);
  dernierTempsInvaders = maintenant;

  if (!invadersTermine && jeuActif === "invaders" && !overlayOuvert) {
    if (pauseTouche > 0) {
      pauseTouche -= delta;
    } else {
      if (gaucheInvaders) {
        joueurX -= 280 * delta;
      }
      if (droiteInvaders) {
        joueurX += 280 * delta;
      }
      joueurX = Math.max(18, Math.min(LARGEUR_INVADERS - 18, joueurX));

      if (tirDemande) {
        tirer();
        tirDemande = false;
      }

      chronoDeplacement += delta * 1000;
      while (chronoDeplacement >= delaiDeplacement() && !invadersTermine) {
        chronoDeplacement -= delaiDeplacement();
        deplacerFormation();
      }

      deplacerTirJoueur(delta);
      deplacerBombes(delta);
      probabiliteBombe(delta);
      gererMystere(delta);
    }
  }

  dessinerInvaders();
  boucleInvaders = requestAnimationFrame(boucleSpaceInvaders);
}

// ---------------------------------------------------------------------
// Dessin
// ---------------------------------------------------------------------

function dessinerSprite(contexte, sprite, x, y, taille) {
  sprite.forEach((ligne, indexLigne) => {
    for (let colonne = 0; colonne < ligne.length; colonne++) {
      if (ligne[colonne] === "1") {
        contexte.fillRect(x + colonne * taille, y + indexLigne * taille, taille, taille);
      }
    }
  });
}

function dessinerInvaders() {
  const contexte = canvasInvaders.getContext("2d");
  contexte.fillStyle = "#0e0e0e";
  contexte.fillRect(0, 0, LARGEUR_INVADERS, HAUTEUR_INVADERS);

  // Envahisseurs
  contexte.fillStyle = "#c8f060";
  envahisseursVivants().forEach(envahisseur => {
    dessinerSprite(contexte, SPRITES[envahisseur.type][imageEnvahisseurs], envahisseur.x, envahisseur.y, TAILLE_PIXEL);
  });

  // Vaisseau mystere
  if (mystere !== null) {
    contexte.fillStyle = "#ff5f56";
    dessinerSprite(contexte, SPRITES.mystere, mystere.x, mystere.y, TAILLE_PIXEL);
  }

  // Abris
  contexte.fillStyle = "#9fc43f";
  abris.forEach(abri => {
    abri.blocs.forEach((ligne, indexLigne) => {
      ligne.forEach((present, indexColonne) => {
        if (present) {
          contexte.fillRect(
            abri.x + indexColonne * TAILLE_BLOC_ABRI,
            abri.y + indexLigne * TAILLE_BLOC_ABRI,
            TAILLE_BLOC_ABRI, TAILLE_BLOC_ABRI);
        }
      });
    });
  });

  // Joueur, qui clignote apres avoir ete touche
  if (pauseTouche <= 0 || Math.floor(pauseTouche * 10) % 2 === 0) {
    contexte.fillStyle = "#f2f2f2";
    dessinerSprite(contexte, SPRITES.joueur, joueurX - 13, HAUTEUR_JOUEUR, TAILLE_PIXEL);
  }

  // Projectiles
  if (tirJoueur !== null) {
    contexte.fillStyle = "#f2f2f2";
    contexte.fillRect(tirJoueur.x - 1, tirJoueur.y, 2, 10);
  }
  contexte.fillStyle = "#ff5f56";
  bombes.forEach(bombe => {
    contexte.fillRect(bombe.x - 1, bombe.y, 2, 9);
  });

  // Sol
  contexte.fillStyle = "#2b3a1e";
  contexte.fillRect(0, HAUTEUR_JOUEUR + 22, LARGEUR_INVADERS, 2);

  if (invadersTermine) {
    contexte.fillStyle = "rgba(14, 14, 14, 0.85)";
    contexte.fillRect(0, 0, LARGEUR_INVADERS, HAUTEUR_INVADERS);
    contexte.fillStyle = "#c8f060";
    contexte.font = "64px 'Bebas Neue', Impact, sans-serif";
    contexte.textAlign = "center";
    contexte.fillText("GAME OVER", LARGEUR_INVADERS / 2, HAUTEUR_INVADERS / 2);
  }
}

// ---------------------------------------------------------------------
// Commandes
// ---------------------------------------------------------------------

document.addEventListener("keydown", function (evenement) {
  if (jeuActif !== "invaders" || overlayOuvert) {
    return;
  }
  const touche = evenement.key.toLowerCase();

  if (touche === "arrowleft" || touche === "q" || touche === "a") {
    gaucheInvaders = true;
  } else if (touche === "arrowright" || touche === "d") {
    droiteInvaders = true;
  } else if (touche === " ") {
    tirDemande = true;
  } else if (touche === "n") {
    demarrerInvaders();
  } else if (touche === "escape") {
    quitterJeu();
    return;
  } else {
    return;
  }
  evenement.preventDefault();
});

document.addEventListener("keyup", function (evenement) {
  const touche = evenement.key.toLowerCase();
  if (touche === "arrowleft" || touche === "q" || touche === "a") {
    gaucheInvaders = false;
  } else if (touche === "arrowright" || touche === "d") {
    droiteInvaders = false;
  }
});

// Tactile : le doigt deplace le vaisseau, une tape tire
function suivreDoigtInvaders(clientX) {
  const cadre = canvasInvaders.getBoundingClientRect();
  joueurX = Math.max(18, Math.min(LARGEUR_INVADERS - 18,
    (clientX - cadre.left) / cadre.width * LARGEUR_INVADERS));
}

canvasInvaders.addEventListener("touchstart", function (evenement) {
  suivreDoigtInvaders(evenement.touches[0].clientX);
  tirDemande = true;
}, { passive: true });

canvasInvaders.addEventListener("touchmove", function (evenement) {
  suivreDoigtInvaders(evenement.touches[0].clientX);
  evenement.preventDefault();
}, { passive: false });

canvasInvaders.addEventListener("mousemove", function (evenement) {
  if (jeuActif === "invaders" && !overlayOuvert) {
    suivreDoigtInvaders(evenement.clientX);
  }
});

canvasInvaders.addEventListener("click", function () {
  tirDemande = true;
});

boutonRecommencerInvaders.addEventListener("click", demarrerInvaders);
boutonQuitterInvaders.addEventListener("click", quitterJeu);

// ===== Inscription dans l'arcade =====
enregistrerJeu({
  id: "invaders",
  nom: "Space Invaders",
  code: "1978",
  section: zoneInvaders,
  demarrer: demarrerInvaders,
  arreter: () => cancelAnimationFrame(boucleInvaders)
});

