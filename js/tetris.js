// =====================================================================
//  TETRIS - regles de la version NES
//  Sac de 7, rotation SRS avec wall kicks, hold, file des 5 pieces,
//  piece fantome, lock delay, gravite et bareme NES.
// =====================================================================

const zoneTetris = document.getElementById("jeuTetris");
const boutonQuitterTetris = document.getElementById("quitterTetris");
const canvasTetris = document.getElementById("canvasTetris");
const zoneScoreTetris = document.getElementById("scoreTetris");
const zoneLignesTetris = document.getElementById("lignesTetris");
const canvasHold = document.getElementById("canvasHold");
const canvasNext = document.getElementById("canvasNext");
const zoneNiveauTetris = document.getElementById("niveauTetris");
const zoneMessageTetris = document.getElementById("messageTetris");

const COLONNES = 10;
const LIGNES_VISIBLES = 20;
const LIGNES_CACHEES = 2;               // zone de spawn au-dessus du plateau
const LIGNES = LIGNES_VISIBLES + LIGNES_CACHEES;
const TAILLE_BLOC = canvasTetris.width / COLONNES;
const TAILLE_BLOC_MINI = canvasHold.width / 4;

const DELAI_VERROUILLAGE_MS = 500;
const MAX_RESETS_VERROUILLAGE = 15;
const DAS_MS = 170;                     // delai avant repetition gauche/droite
const ARR_MS = 50;                      // vitesse de repetition
const CHUTE_DOUCE_MS = 50;

// Gravite NES : nombre d'images (a 60 fps) avant que la piece descende d'une ligne
const GRAVITE_IMAGES = [48, 43, 38, 33, 28, 23, 18, 13, 8, 6, 5, 5, 5, 4, 4, 4, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1];
const NIVEAU_DEPART_MAX = 9;

// Les 7 pieces, orientation de depart, couleurs dans la DA
const PIECES_TETRIS = {
  I: { forme: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]], couleur: "#c8f060" },
  O: { forme: [[1, 1], [1, 1]], couleur: "#f2f2f2" },
  T: { forme: [[0, 1, 0], [1, 1, 1], [0, 0, 0]], couleur: "#9fc43f" },
  S: { forme: [[0, 1, 1], [1, 1, 0], [0, 0, 0]], couleur: "#dff59a" },
  Z: { forme: [[1, 1, 0], [0, 1, 1], [0, 0, 0]], couleur: "#7fa030" },
  J: { forme: [[1, 0, 0], [1, 1, 1], [0, 0, 0]], couleur: "#b5b5b5" },
  L: { forme: [[0, 0, 1], [1, 1, 1], [0, 0, 0]], couleur: "#e9ffb0" }
};

// Tables de wall kicks SRS. Cle : "etatDepart>etatArrivee", etats 0 R 2 L.
// Les y sont donnes "vers le haut" comme dans la spec, on les inverse au moment de l'appliquer.
const KICKS_JLSTZ = {
  "0>R": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  "R>0": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  "R>2": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  "2>R": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  "2>L": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  "L>2": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  "L>0": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  "0>L": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]]
};
const KICKS_I = {
  "0>R": [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  "R>0": [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  "R>2": [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  "2>R": [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  "2>L": [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  "L>2": [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  "L>0": [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  "0>L": [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]]
};
const ETATS_ROTATION = ["0", "R", "2", "L"];

// ===== Etat du jeu =====
let plateau = [];
let pieceActive = null;
let sac = [];
let fileSuivante = [];
let pieceEnHold = null;
let holdUtilise = false;

let scoreTetris = 0;
let lignesTetris = 0;
let niveauTetris = 0;
let niveauDepart = 0;
let lignesAvantProchainNiveau = 10;
let tetrisEnAttente = true;   // ecran de choix du niveau
let tetrisTermine = false;
let tetrisEnPause = false;
let sonActif = true;

let chronoGravite = 0;
let chronoVerrouillage = null;
let resetsVerrouillage = 0;
let plusBasAtteint = 0;
let dernierMouvementRotation = false;
let dernierKickIndex = 0;
let dernierTemps = 0;
let boucleTetris = null;
let chronoMessage = null;

// Touches maintenues pour le DAS
const touchesTenues = { gauche: null, droite: null, bas: null };
let dernierePressionGauche = 0;
let dernierePressionDroite = 0;
let derniereChuteDouce = 0;
let departToucheTetris = null;

// ===== Lancement et arret =====
function demarrerTetris() {
  plateau = Array.from({ length: LIGNES }, () => Array(COLONNES).fill(null));
  sac = [];
  fileSuivante = [];
  pieceEnHold = null;
  holdUtilise = false;
  scoreTetris = 0;
  lignesTetris = 0;
  niveauTetris = niveauDepart;
  // Regle NES : premier palier plus long quand on demarre haut
  lignesAvantProchainNiveau = Math.min(niveauDepart * 10 + 10, Math.max(100, niveauDepart * 10 - 50));
  tetrisEnAttente = true;
  tetrisTermine = false;
  tetrisEnPause = false;
  touchesTenues.gauche = null;
  touchesTenues.droite = null;
  touchesTenues.bas = null;
  zoneMessageTetris.textContent = "";
  mettreAJourStats();
  remplirFile();
  faireApparaitrePiece();
  dessinerHold();
  dessinerFile();
  dernierTemps = performance.now();
  cancelAnimationFrame(boucleTetris);
  boucleTetris = requestAnimationFrame(boucleDeJeu);
}

function mettreAJourStats() {
  zoneScoreTetris.textContent = String(scoreTetris);
  zoneLignesTetris.textContent = String(lignesTetris);
  zoneNiveauTetris.textContent = String(niveauTetris);
}

function afficherMessageTetris(texte) {
  zoneMessageTetris.textContent = texte;
  clearTimeout(chronoMessage);
  chronoMessage = setTimeout(() => { zoneMessageTetris.textContent = ""; }, 1500);
}

// ===== Generateur de pieces : sac de 7 =====
function tirerDansLeSac() {
  if (sac.length === 0) {
    sac = Object.keys(PIECES_TETRIS);
    for (let i = sac.length - 1; i > 0; i--) {
      const k = Math.floor(Math.random() * (i + 1));
      [sac[i], sac[k]] = [sac[k], sac[i]];
    }
  }
  return sac.pop();
}

function remplirFile() {
  while (fileSuivante.length < 5) {
    fileSuivante.push(tirerDansLeSac());
  }
}

function creerPiece(type) {
  const modele = PIECES_TETRIS[type];
  return {
    type,
    forme: modele.forme.map(l => l.slice()),
    couleur: modele.couleur,
    rotation: 0,
    x: Math.floor((COLONNES - modele.forme[0].length) / 2),
    y: type === "I" ? 0 : LIGNES_CACHEES - 2
  };
}

function faireApparaitrePiece() {
  const type = fileSuivante.shift();
  remplirFile();
  pieceActive = creerPiece(type);
  chronoGravite = 0;
  chronoVerrouillage = null;
  resetsVerrouillage = 0;
  plusBasAtteint = pieceActive.y;
  dernierMouvementRotation = false;
  holdUtilise = false;

  if (collision(pieceActive.forme, pieceActive.x, pieceActive.y)) {
    tetrisTermine = true;
    jouerSon(110, 0.4);
    finDePartie("tetris", scoreTetris);
  }
  dessinerFile();
}

// ===== Collisions et mouvements =====
function collision(forme, x, y) {
  for (let ligne = 0; ligne < forme.length; ligne++) {
    for (let colonne = 0; colonne < forme[ligne].length; colonne++) {
      if (!forme[ligne][colonne]) {
        continue;
      }
      const px = x + colonne;
      const py = y + ligne;
      if (px < 0 || px >= COLONNES || py >= LIGNES) {
        return true;
      }
      if (py >= 0 && plateau[py][px] !== null) {
        return true;
      }
    }
  }
  return false;
}

function estPosee() {
  return collision(pieceActive.forme, pieceActive.x, pieceActive.y + 1);
}

// Chaque mouvement reussi pendant le lock delay relance le compte a rebours (15 fois max)
function relancerVerrouillage() {
  if (chronoVerrouillage !== null && resetsVerrouillage < MAX_RESETS_VERROUILLAGE) {
    chronoVerrouillage = 0;
    resetsVerrouillage++;
  }
}

function deplacerPiece(deltaX) {
  if (tetrisTermine || tetrisEnPause || tetrisEnAttente) {
    return false;
  }
  if (!collision(pieceActive.forme, pieceActive.x + deltaX, pieceActive.y)) {
    pieceActive.x += deltaX;
    dernierMouvementRotation = false;
    relancerVerrouillage();
    return true;
  }
  return false;
}

function tournerPiece(sensHoraire) {
  if (tetrisTermine || tetrisEnPause || tetrisEnAttente || pieceActive.type === "O") {
    return;
  }
  const forme = pieceActive.forme;
  const tournee = sensHoraire
    ? forme[0].map((_, c) => forme.map(l => l[c]).reverse())
    : forme[0].map((_, c) => forme.map(l => l[forme[0].length - 1 - c]));

  const depart = ETATS_ROTATION[pieceActive.rotation];
  const nouvelleRotation = (pieceActive.rotation + (sensHoraire ? 1 : 3)) % 4;
  const arrivee = ETATS_ROTATION[nouvelleRotation];
  const table = pieceActive.type === "I" ? KICKS_I : KICKS_JLSTZ;
  const kicks = table[depart + ">" + arrivee];

  for (let i = 0; i < kicks.length; i++) {
    const [kx, ky] = kicks[i];
    const nx = pieceActive.x + kx;
    const ny = pieceActive.y - ky; // y inverse par rapport a la spec
    if (!collision(tournee, nx, ny)) {
      pieceActive.forme = tournee;
      pieceActive.x = nx;
      pieceActive.y = ny;
      pieceActive.rotation = nouvelleRotation;
      dernierMouvementRotation = true;
      dernierKickIndex = i;
      relancerVerrouillage();
      jouerSon(440, 0.03);
      return;
    }
  }
}

function descendreDUneLigne(estChuteDouce) {
  if (!estPosee()) {
    pieceActive.y++;
    dernierMouvementRotation = false;
    if (estChuteDouce) {
      scoreTetris += 1;
      mettreAJourStats();
    }
    if (pieceActive.y > plusBasAtteint) {
      plusBasAtteint = pieceActive.y;
      resetsVerrouillage = 0;
      chronoVerrouillage = null;
    }
    return true;
  }
  return false;
}

function chuteRapide() {
  if (tetrisTermine || tetrisEnPause || tetrisEnAttente) {
    return;
  }
  let distance = 0;
  while (descendreDUneLigne(false)) {
    distance++;
  }
  scoreTetris += distance * 2;
  jouerSon(220, 0.05);
  figerPiece();
}

function utiliserHold() {
  if (tetrisTermine || tetrisEnPause || tetrisEnAttente || holdUtilise) {
    return;
  }
  const typeCourant = pieceActive.type;
  if (pieceEnHold === null) {
    pieceEnHold = typeCourant;
    faireApparaitrePiece();
  } else {
    const typeHold = pieceEnHold;
    pieceEnHold = typeCourant;
    pieceActive = creerPiece(typeHold);
    chronoGravite = 0;
    chronoVerrouillage = null;
    resetsVerrouillage = 0;
    plusBasAtteint = pieceActive.y;
    dernierMouvementRotation = false;
  }
  holdUtilise = true;
  jouerSon(330, 0.04);
  dessinerHold();
}

// ===== Verrouillage, T-spin et lignes =====
function detecterTSpin() {
  if (pieceActive.type !== "T" || !dernierMouvementRotation) {
    return null;
  }
  const x = pieceActive.x;
  const y = pieceActive.y;
  const estBloquee = (cx, cy) => cx < 0 || cx >= COLONNES || cy >= LIGNES || (cy >= 0 && plateau[cy][cx] !== null);

  const coins = {
    hautGauche: estBloquee(x, y),
    hautDroit: estBloquee(x + 2, y),
    basGauche: estBloquee(x, y + 2),
    basDroit: estBloquee(x + 2, y + 2)
  };
  const nombreCoins = Object.values(coins).filter(Boolean).length;
  if (nombreCoins < 3) {
    return null;
  }

  // Les deux coins "avant" dependent de l'orientation de la pointe du T
  const avant = [
    [coins.hautGauche, coins.hautDroit],
    [coins.hautDroit, coins.basDroit],
    [coins.basGauche, coins.basDroit],
    [coins.hautGauche, coins.basGauche]
  ][pieceActive.rotation];

  if ((avant[0] && avant[1]) || dernierKickIndex === 4) {
    return "complet";
  }
  return "mini";
}

function figerPiece() {
  const tSpin = detecterTSpin();

  let horsPlateau = true;
  pieceActive.forme.forEach((ligne, dy) => {
    ligne.forEach((case_, dx) => {
      if (case_) {
        const py = pieceActive.y + dy;
        if (py >= 0) {
          plateau[py][pieceActive.x + dx] = pieceActive.couleur;
        }
        if (py >= LIGNES_CACHEES) {
          horsPlateau = false;
        }
      }
    });
  });

  // Piece entierement figee dans la zone cachee : perdu
  if (horsPlateau) {
    tetrisTermine = true;
    jouerSon(110, 0.4);
    finDePartie("tetris", scoreTetris);
    return;
  }

  jouerSon(180, 0.04);
  const lignesEffacees = effacerLignesCompletes();
  compterPoints(lignesEffacees, tSpin);
  faireApparaitrePiece();
}

function effacerLignesCompletes() {
  let effacees = 0;
  for (let ligne = LIGNES - 1; ligne >= 0; ligne--) {
    if (plateau[ligne].every(case_ => case_ !== null)) {
      plateau.splice(ligne, 1);
      plateau.unshift(Array(COLONNES).fill(null));
      effacees++;
      ligne++;
    }
  }
  return effacees;
}

function compterPoints(lignesEffacees, tSpin) {
  // Bareme NES : 40 / 100 / 300 / 1200 multiplies par (niveau + 1)
  const bareme = [0, 40, 100, 300, 1200];
  scoreTetris += bareme[lignesEffacees] * (niveauTetris + 1);
  lignesTetris += lignesEffacees;

  if (lignesEffacees > 0) {
    lignesAvantProchainNiveau -= lignesEffacees;
    if (lignesAvantProchainNiveau <= 0) {
      niveauTetris++;
      lignesAvantProchainNiveau += 10;
      afficherMessageTetris("Niveau " + niveauTetris);
    }
    jouerSon(lignesEffacees === 4 ? 880 : 660, 0.12);
  }
  mettreAJourStats();
}

// ===== Boucle principale =====
function graviteActuelle() {
  const images = GRAVITE_IMAGES[Math.min(niveauTetris, GRAVITE_IMAGES.length - 1)];
  return images * 1000 / 60;
}

function boucleDeJeu(maintenant) {
  const delta = maintenant - dernierTemps;
  dernierTemps = maintenant;

  if (!tetrisTermine && !tetrisEnPause && !tetrisEnAttente) {
    gererTouchesTenues(maintenant);

    if (estPosee()) {
      // Lock delay : la piece touche le sol, on laisse un court instant pour bouger
      if (chronoVerrouillage === null) {
        chronoVerrouillage = 0;
      }
      chronoVerrouillage += delta;
      if (chronoVerrouillage >= DELAI_VERROUILLAGE_MS || resetsVerrouillage >= MAX_RESETS_VERROUILLAGE) {
        figerPiece();
      }
    } else {
      chronoVerrouillage = null;
      chronoGravite += delta;
      while (chronoGravite >= graviteActuelle() && !estPosee()) {
        chronoGravite -= graviteActuelle();
        descendreDUneLigne(false);
      }
    }
  }

  dessinerTetris();
  boucleTetris = requestAnimationFrame(boucleDeJeu);
}

// DAS/ARR : deplacement continu quand une touche reste enfoncee
function gererTouchesTenues(maintenant) {
  const directions = [
    ["gauche", -1, () => dernierePressionGauche, v => { dernierePressionGauche = v; }],
    ["droite", 1, () => dernierePressionDroite, v => { dernierePressionDroite = v; }]
  ];
  for (const [nom, delta, lireDerniere, ecrireDerniere] of directions) {
    const depuis = touchesTenues[nom];
    if (depuis !== null && maintenant - depuis >= DAS_MS && maintenant - lireDerniere() >= ARR_MS) {
      deplacerPiece(delta);
      ecrireDerniere(maintenant);
    }
  }
  if (touchesTenues.bas !== null && maintenant - derniereChuteDouce >= CHUTE_DOUCE_MS) {
    descendreDUneLigne(true);
    derniereChuteDouce = maintenant;
  }
}

// ===== Dessin =====
function dessinerBloc(contexte, x, y, couleur, taille, fantome) {
  if (fantome) {
    contexte.strokeStyle = couleur;
    contexte.lineWidth = 2;
    contexte.strokeRect(x * taille + 3, y * taille + 3, taille - 6, taille - 6);
  } else {
    contexte.fillStyle = couleur;
    contexte.fillRect(x * taille + 1, y * taille + 1, taille - 2, taille - 2);
  }
}

function positionFantome() {
  let y = pieceActive.y;
  while (!collision(pieceActive.forme, pieceActive.x, y + 1)) {
    y++;
  }
  return y;
}

function dessinerTetris() {
  const contexte = canvasTetris.getContext("2d");
  const largeur = canvasTetris.width;
  const hauteur = canvasTetris.height;

  contexte.fillStyle = "#0e0e0e";
  contexte.fillRect(0, 0, largeur, hauteur);

  contexte.strokeStyle = "#1a1a1a";
  contexte.lineWidth = 1;
  for (let i = 1; i < COLONNES; i++) {
    contexte.beginPath();
    contexte.moveTo(i * TAILLE_BLOC, 0);
    contexte.lineTo(i * TAILLE_BLOC, hauteur);
    contexte.stroke();
  }
  for (let i = 1; i < LIGNES_VISIBLES; i++) {
    contexte.beginPath();
    contexte.moveTo(0, i * TAILLE_BLOC);
    contexte.lineTo(largeur, i * TAILLE_BLOC);
    contexte.stroke();
  }

  for (let y = LIGNES_CACHEES; y < LIGNES; y++) {
    for (let x = 0; x < COLONNES; x++) {
      if (plateau[y][x] !== null) {
        dessinerBloc(contexte, x, y - LIGNES_CACHEES, plateau[y][x], TAILLE_BLOC, false);
      }
    }
  }

  if (pieceActive && !tetrisTermine) {
    const yFantome = positionFantome();
    pieceActive.forme.forEach((ligne, dy) => {
      ligne.forEach((case_, dx) => {
        if (!case_) {
          return;
        }
        const gy = yFantome + dy - LIGNES_CACHEES;
        if (gy >= 0 && yFantome !== pieceActive.y) {
          dessinerBloc(contexte, pieceActive.x + dx, gy, pieceActive.couleur, TAILLE_BLOC, true);
        }
        const py = pieceActive.y + dy - LIGNES_CACHEES;
        if (py >= 0) {
          dessinerBloc(contexte, pieceActive.x + dx, py, pieceActive.couleur, TAILLE_BLOC, false);
        }
      });
    });
  }

  if (tetrisTermine || tetrisEnPause || tetrisEnAttente) {
    contexte.fillStyle = "rgba(14, 14, 14, 0.85)";
    contexte.fillRect(0, 0, largeur, hauteur);
    contexte.textAlign = "center";
    contexte.fillStyle = "#c8f060";
    contexte.font = "56px 'Bebas Neue', Impact, sans-serif";
    if (tetrisEnAttente) {
      contexte.fillText("NIVEAU " + niveauDepart, largeur / 2, hauteur / 2 - 10);
      contexte.fillStyle = "#6f6f6f";
      contexte.font = "14px 'JetBrains Mono', monospace";
      contexte.fillText("Haut / Bas pour choisir", largeur / 2, hauteur / 2 + 24);
      contexte.fillText("Espace pour jouer", largeur / 2, hauteur / 2 + 46);
    } else {
      contexte.fillText(tetrisTermine ? "GAME OVER" : "PAUSE", largeur / 2, hauteur / 2 - 10);
      contexte.fillStyle = "#6f6f6f";
      contexte.font = "14px 'JetBrains Mono', monospace";
      contexte.fillText(tetrisTermine ? "Espace pour rejouer" : "P pour reprendre", largeur / 2, hauteur / 2 + 24);
    }
  }
}

function dessinerPieceMini(contexte, type, offsetY) {
  const modele = PIECES_TETRIS[type];
  const forme = modele.forme;
  const largeurForme = forme[0].length;
  const hauteurForme = forme.filter(l => l.some(Boolean)).length;
  const decalageX = (4 - largeurForme) / 2;
  const decalageY = offsetY + (4 - hauteurForme) / 2 - (type === "I" ? 1 : 0);
  forme.forEach((ligne, dy) => {
    ligne.forEach((case_, dx) => {
      if (case_) {
        dessinerBloc(contexte, dx + decalageX, dy + decalageY, modele.couleur, TAILLE_BLOC_MINI, false);
      }
    });
  });
}

function dessinerHold() {
  const contexte = canvasHold.getContext("2d");
  contexte.clearRect(0, 0, canvasHold.width, canvasHold.height);
  if (pieceEnHold !== null) {
    contexte.globalAlpha = holdUtilise ? 0.35 : 1;
    dessinerPieceMini(contexte, pieceEnHold, 0);
    contexte.globalAlpha = 1;
  }
}

function dessinerFile() {
  const contexte = canvasNext.getContext("2d");
  contexte.clearRect(0, 0, canvasNext.width, canvasNext.height);
  fileSuivante.forEach((type, index) => {
    dessinerPieceMini(contexte, type, index * 2.75);
  });
}

// ===== Sons (Web Audio, petits bips) =====
let contexteAudio = null;

function jouerSon(frequence, duree) {
  if (!sonActif) {
    return;
  }
  try {
    if (contexteAudio === null) {
      contexteAudio = new (window.AudioContext || window.webkitAudioContext)();
    }
    const oscillateur = contexteAudio.createOscillator();
    const gain = contexteAudio.createGain();
    oscillateur.type = "square";
    oscillateur.frequency.value = frequence;
    gain.gain.setValueAtTime(0.05, contexteAudio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, contexteAudio.currentTime + duree);
    oscillateur.connect(gain);
    gain.connect(contexteAudio.destination);
    oscillateur.start();
    oscillateur.stop(contexteAudio.currentTime + duree);
  } catch (erreur) {
    // pas de son disponible, on continue sans
  }
}

// ===== Clavier =====
document.addEventListener("keydown", function (evenement) {
  if (jeuActif !== "tetris" || overlayOuvert) {
    return;
  }
  if (evenement.repeat) {
    evenement.preventDefault();
    return; // la repetition est geree par le DAS
  }
  const touche = evenement.key.toLowerCase();
  const maintenant = performance.now();

  // Ecran de depart : choix du niveau
  if (tetrisEnAttente) {
    if (touche === "arrowup" || touche === "z" || touche === "w") {
      niveauDepart = Math.min(NIVEAU_DEPART_MAX, niveauDepart + 1);
    } else if (touche === "arrowdown" || touche === "s") {
      niveauDepart = Math.max(0, niveauDepart - 1);
    } else if (touche === " ") {
      demarrerTetris();
      tetrisEnAttente = false;
      dernierTemps = performance.now();
    } else if (touche === "escape") {
      quitterJeu();
    }
    evenement.preventDefault();
    return;
  }

  if (touche === "arrowleft" || touche === "q" || touche === "a") {
    deplacerPiece(-1);
    touchesTenues.gauche = maintenant;
    dernierePressionGauche = maintenant;
  } else if (touche === "arrowright" || touche === "d") {
    deplacerPiece(1);
    touchesTenues.droite = maintenant;
    dernierePressionDroite = maintenant;
  } else if (touche === "arrowdown" || touche === "s") {
    if (!tetrisTermine && !tetrisEnPause) {
      descendreDUneLigne(true);
    }
    touchesTenues.bas = maintenant;
    derniereChuteDouce = maintenant;
  } else if (touche === "arrowup" || touche === "z" || touche === "w") {
    tournerPiece(true);
  } else if (touche === "x" || touche === "control") {
    tournerPiece(false);
  } else if (touche === "shift" || touche === "c") {
    utiliserHold();
  } else if (touche === " ") {
    if (tetrisTermine) {
      demarrerTetris();
    } else {
      chuteRapide();
    }
  } else if (touche === "p") {
    if (!tetrisTermine) {
      tetrisEnPause = !tetrisEnPause;
    }
  } else if (touche === "m") {
    sonActif = !sonActif;
    afficherMessageTetris(sonActif ? "Son on" : "Son off");
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
    touchesTenues.gauche = null;
  } else if (touche === "arrowright" || touche === "d") {
    touchesTenues.droite = null;
  } else if (touche === "arrowdown" || touche === "s") {
    touchesTenues.bas = null;
  }
});

// ===== Tactile =====
// Glisser gauche/droite : bouger. Glisser bas : chute. Glisser haut : hold. Taper : tourner.
canvasTetris.addEventListener("touchstart", function (evenement) {
  const contact = evenement.touches[0];
  departToucheTetris = { x: contact.clientX, y: contact.clientY };
}, { passive: true });

canvasTetris.addEventListener("touchend", function (evenement) {
  if (!departToucheTetris || overlayOuvert) {
    return;
  }
  const contact = evenement.changedTouches[0];
  const deltaX = contact.clientX - departToucheTetris.x;
  const deltaY = contact.clientY - departToucheTetris.y;
  departToucheTetris = null;

  if (tetrisEnAttente) {
    if (Math.abs(deltaX) < 20 && Math.abs(deltaY) < 20) {
      demarrerTetris();
      tetrisEnAttente = false;
      dernierTemps = performance.now();
    } else if (Math.abs(deltaY) > Math.abs(deltaX)) {
      niveauDepart = deltaY < 0 ? Math.min(NIVEAU_DEPART_MAX, niveauDepart + 1) : Math.max(0, niveauDepart - 1);
    }
    return;
  }

  if (Math.abs(deltaX) < 20 && Math.abs(deltaY) < 20) {
    if (tetrisTermine) {
      demarrerTetris();
    } else if (tetrisEnPause) {
      tetrisEnPause = false;
    } else {
      tournerPiece(true);
    }
  } else if (Math.abs(deltaX) > Math.abs(deltaY)) {
    // Un long glissement deplace de plusieurs cases
    const cases = Math.max(1, Math.round(Math.abs(deltaX) / 40));
    for (let i = 0; i < cases; i++) {
      deplacerPiece(deltaX > 0 ? 1 : -1);
    }
  } else if (deltaY > 0) {
    chuteRapide();
  } else {
    utiliserHold();
  }
});

boutonQuitterTetris.addEventListener("click", quitterJeu);

// ===== Inscription dans l'arcade =====
enregistrerJeu({
  id: "tetris",
  nom: "Tetris",
  code: "321383773",
  section: zoneTetris,
  demarrer: demarrerTetris,
  arreter: () => cancelAnimationFrame(boucleTetris)
});
