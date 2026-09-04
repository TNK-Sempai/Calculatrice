// =====================================================================
//  CASSE-BRIQUES - chaque niveau dessine un mot en briques
//  La difficulte monte : balle plus rapide, raquette plus courte,
//  briques a plusieurs coups. Bonus et malus tombent des briques.
//  La progression (niveau, vies, score) est sauvegardee.
// =====================================================================

const zoneCasseBriques = document.getElementById("jeuCasseBriques");
const canvasBriques = document.getElementById("canvasBriques");
const zoneNiveauBriques = document.getElementById("niveauBriques");
const zoneScoreBriques = document.getElementById("scoreBriques");
const zoneViesBriques = document.getElementById("viesBriques");
const zoneMessageBriques = document.getElementById("messageBriques");
const boutonRecommencerBriques = document.getElementById("recommencerBriques");
const boutonQuitterBriques = document.getElementById("quitterBriques");

const LARGEUR_JEU = 480;
const HAUTEUR_JEU = 640;
const COLONNES_BRIQUES = 15;
const LIGNES_BRIQUES = 8;
const LARGEUR_BRIQUE = LARGEUR_JEU / COLONNES_BRIQUES;
const HAUTEUR_BRIQUE = 22;
const MARGE_HAUTE = 60;

const VIES_DEPART = 3;
const RAYON_BALLE = 6;
const HAUTEUR_RAQUETTE = 12;
const CLE_BRIQUES = "tanuki-arcade-briques";

// Les mots dessines niveau apres niveau, puis on reprend la liste
// avec une difficulte plus elevee.
const MOTS_NIVEAUX = ["TANUKI", "ARCADE", "CF2M", "BRUXELLES", "WU TANG", "2048", "GAME ON"];

// Couleurs selon la resistance restante de la brique
const COULEURS_BRIQUES = {
  1: "#c8f060",
  2: "#9fc43f",
  3: "#f2f2f2"
};

// Bonus et malus qui tombent
const CHUTES = {
  large: { texte: "L", couleur: "#c8f060", bonus: true },
  multi: { texte: "M", couleur: "#c8f060", bonus: true },
  lent: { texte: "S", couleur: "#c8f060", bonus: true },
  vie: { texte: "+", couleur: "#c8f060", bonus: true },
  court: { texte: "C", couleur: "#ff5f56", bonus: false },
  rapide: { texte: "R", couleur: "#ff5f56", bonus: false }
};
const TYPES_CHUTE = Object.keys(CHUTES);

let briques = [];
let balles = [];
let chutes = [];
let raquette = { x: LARGEUR_JEU / 2 - 45, largeur: 90 };
let niveauBriques = 1;
let scoreBriques = 0;
let viesBriques = VIES_DEPART;
let briquesTermine = false;
let enAttenteLancement = true;
let boucleBriques = null;
let dernierTempsBriques = 0;
let toucheGauche = false;
let toucheDroite = false;
let chronoMessageBriques = null;

// ---------------------------------------------------------------------
// Sauvegarde de la progression
// ---------------------------------------------------------------------

function sauverBriques() {
  try {
    localStorage.setItem(CLE_BRIQUES, JSON.stringify({
      niveau: niveauBriques,
      score: scoreBriques,
      vies: viesBriques
    }));
  } catch (erreur) {
    // stockage indisponible : la progression ne sera pas conservee
  }
}

function effacerBriques() {
  try {
    localStorage.removeItem(CLE_BRIQUES);
  } catch (erreur) {
    // rien a faire
  }
}

function chargerBriques() {
  try {
    const brut = localStorage.getItem(CLE_BRIQUES);
    if (brut === null) {
      return false;
    }
    const donnees = JSON.parse(brut);
    if (typeof donnees.niveau !== "number" || donnees.niveau < 1) {
      return false;
    }
    niveauBriques = donnees.niveau;
    scoreBriques = donnees.score || 0;
    viesBriques = donnees.vies || VIES_DEPART;
    return true;
  } catch (erreur) {
    return false;
  }
}

// ---------------------------------------------------------------------
// Construction d'un niveau a partir d'un mot
// ---------------------------------------------------------------------

// Le mot est dessine dans un canvas hors ecran, puis chaque case de la
// grille regarde si du texte s'y trouve. Cela evite d'ecrire une police
// en dur et accepte n'importe quel mot.
function grilleDepuisMot(mot) {
  const largeurRendu = 300;
  const hauteurRendu = 160;
  try {
    const canvasTexte = document.createElement("canvas");
    canvasTexte.width = largeurRendu;
    canvasTexte.height = hauteurRendu;
    const contexte = canvasTexte.getContext("2d");

    contexte.fillStyle = "#000000";
    contexte.textAlign = "center";
    contexte.textBaseline = "middle";

    // On cherche la taille de police qui remplit la largeur disponible
    let taille = 140;
    contexte.font = "bold " + taille + "px Impact, 'Arial Black', sans-serif";
    const largeurMot = contexte.measureText(mot).width;
    taille = Math.min(taille, Math.floor(taille * (largeurRendu - 10) / largeurMot));
    contexte.font = "bold " + taille + "px Impact, 'Arial Black', sans-serif";
    contexte.fillText(mot, largeurRendu / 2, hauteurRendu / 2);

    const pixels = contexte.getImageData(0, 0, largeurRendu, hauteurRendu).data;
    const grille = [];

    for (let ligne = 0; ligne < LIGNES_BRIQUES; ligne++) {
      const cases = [];
      for (let colonne = 0; colonne < COLONNES_BRIQUES; colonne++) {
        // On echantillonne quelques points au centre de la case
        let touches = 0;
        let total = 0;
        for (let dy = 1; dy <= 3; dy++) {
          for (let dx = 1; dx <= 3; dx++) {
            const x = Math.floor((colonne + dx / 4) * largeurRendu / COLONNES_BRIQUES);
            const y = Math.floor((ligne + dy / 4) * hauteurRendu / LIGNES_BRIQUES);
            const alpha = pixels[(y * largeurRendu + x) * 4 + 3];
            total++;
            if (alpha > 100) {
              touches++;
            }
          }
        }
        cases.push(touches / total >= 0.35);
      }
      grille.push(cases);
    }
    if (grille.some(ligne => ligne.some(Boolean))) {
      return grille;
    }
  } catch (erreur) {
    // lecture de pixels impossible : on retombe sur un mur classique
  }

  // Repli : un mur plein sur quatre rangees
  return Array.from({ length: LIGNES_BRIQUES }, (_, ligne) =>
    Array.from({ length: COLONNES_BRIQUES }, () => ligne >= 2 && ligne <= 5));
}

function motDuNiveau(niveau) {
  return MOTS_NIVEAUX[(niveau - 1) % MOTS_NIVEAUX.length];
}

// Nombre de tours de liste deja effectues, sert a durcir le jeu
function cycleDuNiveau(niveau) {
  return Math.floor((niveau - 1) / MOTS_NIVEAUX.length);
}

function construireNiveau() {
  const grille = grilleDepuisMot(motDuNiveau(niveauBriques));
  const cycle = cycleDuNiveau(niveauBriques);
  briques = [];

  grille.forEach((ligne, indexLigne) => {
    ligne.forEach((pleine, indexColonne) => {
      if (!pleine) {
        return;
      }
      // Plus on avance, plus les briques hautes resistent
      let resistance = 1;
      if (niveauBriques >= 3 && indexLigne < 3) {
        resistance = 2;
      }
      if (niveauBriques >= 6 && indexLigne < 2) {
        resistance = 3;
      }
      resistance = Math.min(3, resistance + cycle);

      briques.push({
        x: indexColonne * LARGEUR_BRIQUE,
        y: MARGE_HAUTE + indexLigne * HAUTEUR_BRIQUE,
        resistance
      });
    });
  });
}

// ---------------------------------------------------------------------
// Mise en place
// ---------------------------------------------------------------------

function vitesseDuNiveau() {
  return 260 + (niveauBriques - 1) * 22;
}

function largeurRaquetteDuNiveau() {
  return Math.max(52, 100 - (niveauBriques - 1) * 4);
}

function nouvelleBalle() {
  const vitesse = vitesseDuNiveau();
  return {
    x: LARGEUR_JEU / 2,
    y: HAUTEUR_JEU - 60,
    dx: vitesse * 0.45,
    dy: -vitesse,
    rayon: RAYON_BALLE
  };
}

function preparerLancement() {
  balles = [nouvelleBalle()];
  chutes = [];
  raquette.largeur = largeurRaquetteDuNiveau();
  raquette.x = LARGEUR_JEU / 2 - raquette.largeur / 2;
  enAttenteLancement = true;
  afficherMessageBriques("Niveau " + niveauBriques + " : " + motDuNiveau(niveauBriques), 0);
}

function demarrerCasseBriques() {
  if (!chargerBriques()) {
    niveauBriques = 1;
    scoreBriques = 0;
    viesBriques = VIES_DEPART;
  }
  briquesTermine = false;
  construireNiveau();
  preparerLancement();
  majStatsBriques();
  dernierTempsBriques = performance.now();
  cancelAnimationFrame(boucleBriques);
  boucleBriques = requestAnimationFrame(boucleCasseBriques);
}

function recommencerCasseBriques() {
  effacerBriques();
  niveauBriques = 1;
  scoreBriques = 0;
  viesBriques = VIES_DEPART;
  briquesTermine = false;
  construireNiveau();
  preparerLancement();
  majStatsBriques();
}

function majStatsBriques() {
  zoneNiveauBriques.textContent = String(niveauBriques);
  zoneScoreBriques.textContent = String(scoreBriques);
  zoneViesBriques.textContent = String(viesBriques);
}

function afficherMessageBriques(texte, duree) {
  zoneMessageBriques.textContent = texte;
  clearTimeout(chronoMessageBriques);
  if (duree > 0) {
    chronoMessageBriques = setTimeout(() => {
      zoneMessageBriques.textContent = "";
    }, duree);
  }
}

// ---------------------------------------------------------------------
// Bonus et malus
// ---------------------------------------------------------------------

function peutLacherChute() {
  return Math.random() < 0.14;
}

function lacherChute(x, y) {
  const type = TYPES_CHUTE[Math.floor(Math.random() * TYPES_CHUTE.length)];
  chutes.push({ x, y, type, vitesse: 150 });
}

function appliquerChute(type) {
  if (type === "large") {
    raquette.largeur = Math.min(180, raquette.largeur * 1.4);
    afficherMessageBriques("Raquette allongee", 1200);
  } else if (type === "court") {
    raquette.largeur = Math.max(40, raquette.largeur * 0.7);
    afficherMessageBriques("Raquette raccourcie", 1200);
  } else if (type === "lent") {
    balles.forEach(balle => { balle.dx *= 0.75; balle.dy *= 0.75; });
    afficherMessageBriques("Balle ralentie", 1200);
  } else if (type === "rapide") {
    balles.forEach(balle => { balle.dx *= 1.3; balle.dy *= 1.3; });
    afficherMessageBriques("Balle acceleree", 1200);
  } else if (type === "vie") {
    viesBriques++;
    majStatsBriques();
    afficherMessageBriques("Vie supplementaire", 1200);
  } else if (type === "multi") {
    const copies = balles.slice(0, 2).map(balle => ({
      x: balle.x,
      y: balle.y,
      dx: -balle.dx * 0.9,
      dy: balle.dy,
      rayon: RAYON_BALLE
    }));
    balles = balles.concat(copies);
    afficherMessageBriques("Balles multiples", 1200);
  }
}

// ---------------------------------------------------------------------
// Physique
// ---------------------------------------------------------------------

function deplacerRaquette(delta) {
  const vitesse = 420 * delta;
  if (toucheGauche) {
    raquette.x -= vitesse;
  }
  if (toucheDroite) {
    raquette.x += vitesse;
  }
  raquette.x = Math.max(0, Math.min(LARGEUR_JEU - raquette.largeur, raquette.x));
}

function briqueTouchee(balle) {
  return briques.find(brique =>
    balle.x + balle.rayon > brique.x
    && balle.x - balle.rayon < brique.x + LARGEUR_BRIQUE
    && balle.y + balle.rayon > brique.y
    && balle.y - balle.rayon < brique.y + HAUTEUR_BRIQUE) || null;
}

function casserBrique(brique, balle) {
  brique.resistance--;
  scoreBriques += 10 * niveauBriques;

  if (brique.resistance <= 0) {
    briques.splice(briques.indexOf(brique), 1);
    if (peutLacherChute()) {
      lacherChute(brique.x + LARGEUR_BRIQUE / 2, brique.y + HAUTEUR_BRIQUE / 2);
    }
  }

  // On rebondit sur le cote le moins profondement penetre
  const centreX = brique.x + LARGEUR_BRIQUE / 2;
  const centreY = brique.y + HAUTEUR_BRIQUE / 2;
  const chevauchementX = LARGEUR_BRIQUE / 2 + balle.rayon - Math.abs(balle.x - centreX);
  const chevauchementY = HAUTEUR_BRIQUE / 2 + balle.rayon - Math.abs(balle.y - centreY);

  if (chevauchementX < chevauchementY) {
    balle.dx = -balle.dx;
  } else {
    balle.dy = -balle.dy;
  }
  majStatsBriques();
}

function deplacerBalle(balle, delta) {
  balle.x += balle.dx * delta;
  balle.y += balle.dy * delta;

  if (balle.x - balle.rayon < 0) {
    balle.x = balle.rayon;
    balle.dx = Math.abs(balle.dx);
  } else if (balle.x + balle.rayon > LARGEUR_JEU) {
    balle.x = LARGEUR_JEU - balle.rayon;
    balle.dx = -Math.abs(balle.dx);
  }
  if (balle.y - balle.rayon < 0) {
    balle.y = balle.rayon;
    balle.dy = Math.abs(balle.dy);
  }

  // Raquette : l'angle de renvoi depend du point d'impact
  const hautRaquette = HAUTEUR_JEU - 40;
  if (balle.dy > 0
    && balle.y + balle.rayon >= hautRaquette
    && balle.y - balle.rayon <= hautRaquette + HAUTEUR_RAQUETTE
    && balle.x >= raquette.x
    && balle.x <= raquette.x + raquette.largeur) {
    const position = (balle.x - raquette.x) / raquette.largeur - 0.5;
    const vitesse = Math.hypot(balle.dx, balle.dy);
    const angle = position * 2.2;
    balle.dx = Math.sin(angle) * vitesse;
    balle.dy = -Math.abs(Math.cos(angle) * vitesse);
    balle.y = hautRaquette - balle.rayon;
  }

  const brique = briqueTouchee(balle);
  if (brique !== null) {
    casserBrique(brique, balle);
  }
}

function perdreUneVie() {
  viesBriques--;
  majStatsBriques();
  sauverBriques();

  if (viesBriques <= 0) {
    briquesTermine = true;
    effacerBriques();
    afficherMessageBriques("Partie terminee", 0);
    finDePartie("casse-briques", scoreBriques);
    return;
  }
  preparerLancement();
}

function niveauSuivant() {
  niveauBriques++;
  scoreBriques += 100 * (niveauBriques - 1);
  sauverBriques();
  construireNiveau();
  preparerLancement();
  majStatsBriques();
}

// ---------------------------------------------------------------------
// Boucle de jeu
// ---------------------------------------------------------------------

function boucleCasseBriques(maintenant) {
  const delta = Math.min(0.05, (maintenant - dernierTempsBriques) / 1000);
  dernierTempsBriques = maintenant;

  if (!briquesTermine && jeuActif === "casse-briques" && !overlayOuvert) {
    deplacerRaquette(delta);

    if (enAttenteLancement) {
      // La balle suit la raquette tant qu'on n'a pas lance
      balles[0].x = raquette.x + raquette.largeur / 2;
      balles[0].y = HAUTEUR_JEU - 54;
    } else {
      balles.forEach(balle => deplacerBalle(balle, delta));
      balles = balles.filter(balle => balle.y - balle.rayon < HAUTEUR_JEU);

      chutes.forEach(chute => { chute.y += chute.vitesse * delta; });
      chutes = chutes.filter(chute => {
        const attrapee = chute.y >= HAUTEUR_JEU - 40
          && chute.y <= HAUTEUR_JEU - 40 + HAUTEUR_RAQUETTE + 10
          && chute.x >= raquette.x
          && chute.x <= raquette.x + raquette.largeur;
        if (attrapee) {
          appliquerChute(chute.type);
          return false;
        }
        return chute.y < HAUTEUR_JEU;
      });

      if (balles.length === 0) {
        perdreUneVie();
      } else if (briques.length === 0) {
        niveauSuivant();
      }
    }
  }

  dessinerCasseBriques();
  boucleBriques = requestAnimationFrame(boucleCasseBriques);
}

// ---------------------------------------------------------------------
// Dessin
// ---------------------------------------------------------------------

function dessinerCasseBriques() {
  const contexte = canvasBriques.getContext("2d");
  contexte.fillStyle = "#141414";
  contexte.fillRect(0, 0, LARGEUR_JEU, HAUTEUR_JEU);

  // Briques
  briques.forEach(brique => {
    contexte.fillStyle = COULEURS_BRIQUES[brique.resistance] || "#c8f060";
    contexte.fillRect(brique.x + 1, brique.y + 1, LARGEUR_BRIQUE - 2, HAUTEUR_BRIQUE - 2);
    if (brique.resistance > 1) {
      contexte.fillStyle = "rgba(14, 14, 14, 0.35)";
      contexte.fillRect(brique.x + 1, brique.y + HAUTEUR_BRIQUE - 6, LARGEUR_BRIQUE - 2, 5);
    }
  });

  // Bonus et malus
  chutes.forEach(chute => {
    const modele = CHUTES[chute.type];
    contexte.fillStyle = modele.couleur;
    contexte.beginPath();
    contexte.arc(chute.x, chute.y, 9, 0, Math.PI * 2);
    contexte.fill();
    contexte.fillStyle = "#0e0e0e";
    contexte.font = "bold 12px 'JetBrains Mono', monospace";
    contexte.textAlign = "center";
    contexte.textBaseline = "middle";
    contexte.fillText(modele.texte, chute.x, chute.y + 1);
  });

  // Raquette
  contexte.fillStyle = "#c8f060";
  contexte.fillRect(raquette.x, HAUTEUR_JEU - 40, raquette.largeur, HAUTEUR_RAQUETTE);

  // Balles
  contexte.fillStyle = "#f2f2f2";
  balles.forEach(balle => {
    contexte.beginPath();
    contexte.arc(balle.x, balle.y, balle.rayon, 0, Math.PI * 2);
    contexte.fill();
  });

  if (enAttenteLancement && !briquesTermine) {
    contexte.fillStyle = "#6f6f6f";
    contexte.font = "16px 'JetBrains Mono', monospace";
    contexte.textAlign = "center";
    contexte.fillText("Espace ou clic pour lancer", LARGEUR_JEU / 2, HAUTEUR_JEU - 90);
  }

  if (briquesTermine) {
    contexte.fillStyle = "rgba(14, 14, 14, 0.85)";
    contexte.fillRect(0, 0, LARGEUR_JEU, HAUTEUR_JEU);
    contexte.fillStyle = "#c8f060";
    contexte.font = "64px 'Bebas Neue', Impact, sans-serif";
    contexte.textAlign = "center";
    contexte.fillText("GAME OVER", LARGEUR_JEU / 2, HAUTEUR_JEU / 2);
  }
}

// ---------------------------------------------------------------------
// Commandes
// ---------------------------------------------------------------------

function lancerLaBalle() {
  if (briquesTermine || !enAttenteLancement) {
    return;
  }
  enAttenteLancement = false;
  afficherMessageBriques("", 0);
}

document.addEventListener("keydown", function (evenement) {
  if (jeuActif !== "casse-briques" || overlayOuvert) {
    return;
  }
  const touche = evenement.key.toLowerCase();

  if (touche === "arrowleft" || touche === "q" || touche === "a") {
    toucheGauche = true;
  } else if (touche === "arrowright" || touche === "d") {
    toucheDroite = true;
  } else if (touche === " ") {
    lancerLaBalle();
  } else if (touche === "n") {
    recommencerCasseBriques();
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
    toucheGauche = false;
  } else if (touche === "arrowright" || touche === "d") {
    toucheDroite = false;
  }
});

// Souris et doigt : la raquette suit le pointeur
function suivrePointeur(clientX) {
  const cadre = canvasBriques.getBoundingClientRect();
  const position = (clientX - cadre.left) / cadre.width * LARGEUR_JEU;
  raquette.x = Math.max(0, Math.min(LARGEUR_JEU - raquette.largeur, position - raquette.largeur / 2));
}

canvasBriques.addEventListener("mousemove", function (evenement) {
  if (jeuActif === "casse-briques" && !overlayOuvert) {
    suivrePointeur(evenement.clientX);
  }
});

canvasBriques.addEventListener("click", lancerLaBalle);

canvasBriques.addEventListener("touchmove", function (evenement) {
  if (jeuActif === "casse-briques" && !overlayOuvert) {
    suivrePointeur(evenement.touches[0].clientX);
    evenement.preventDefault();
  }
}, { passive: false });

canvasBriques.addEventListener("touchstart", function (evenement) {
  suivrePointeur(evenement.touches[0].clientX);
  lancerLaBalle();
}, { passive: true });

boutonRecommencerBriques.addEventListener("click", recommencerCasseBriques);
boutonQuitterBriques.addEventListener("click", quitterJeu);

// ===== Inscription dans l'arcade =====
enregistrerJeu({
  id: "casse-briques",
  nom: "Casse-briques",
  code: "1972",
  section: zoneCasseBriques,
  demarrer: demarrerCasseBriques,
  arreter: () => cancelAnimationFrame(boucleBriques)
});