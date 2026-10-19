// =====================================================================
//  OSHIDASHI - 押し出し
//  L'Abalone, rebaptise du nom de la technique de sumo qui pousse
//  l'adversaire hors du cercle. Tes pierres claires contre les pierres
//  sombres de l'IA, sur un plateau hexagonal de 61 trous. Le premier
//  qui sort six pierres adverses gagne.
//
//  Au doigt : touche 1 a 3 de tes pierres alignees, puis une des cases
//  allumees pour les deplacer. Au clavier ou a la manette : le curseur
//  fait la meme chose.
// =====================================================================

import { enregistrerJeu, finDePartie, quitterJeu, majScoreCourant } from "./arcade.js";
import { surTouche } from "./noyau/clavier.js";
import { creerBoutonsChoix, marquerChoixActif } from "./noyau/choix.js";
import { creerStockage } from "./noyau/stockage.js";
import { creerEffets } from "./noyau/effets.js";
import { creerBoucle } from "./noyau/boucle.js";
import { jouer as jouerSon, basculerSon, sonActif } from "./noyau/son.js";
import { creerVersus, versusDisponible } from "./versus.js";
import {
  CELLULES, NOMBRE, VOISIN, JOUEUR, IA, VICTOIRE,
  indexDe, positionDeDepart, copier, coups, appliquer, choisirCoup, opposee
} from "./oshidashi/moteur.js";

const ID = "oshidashi";
const NIVEAUX = [
  { id: "facile", nom: "Facile" },
  { id: "moyen", nom: "Moyen" },
  { id: "difficile", nom: "Difficile" },
  { id: "deux", nom: "À deux", deux: true },
  { id: "ligne", nom: "En ligne", ligne: true }
];
const CHOIX = NIVEAUX.filter(n => !n.ligne || versusDisponible());

const zone = document.createElement("section");
zone.className = "jeu jeu-oshidashi";
zone.id = "jeuOshidashi";
zone.hidden = true;
zone.innerHTML = `
  <div class="jeu-entete entete-oshidashi">
    <span class="jeu-score score-principal">Sorties <strong class="valeur-score" id="sortiesOshi">0</strong></span>
    <span class="jeu-score">Perdues <strong id="perduesOshi">0</strong></span>
    <span class="jeu-score">Coups <strong id="coupsOshi">0</strong></span>
    <span class="entete-boutons">
      <button class="jeu-quitter" id="tutoOshi" type="button">Apprendre</button>
      <button class="jeu-quitter" id="annulerOshi" type="button">Annuler</button>
      <button class="jeu-quitter" id="sonOshi" type="button">Son</button>
      <button class="jeu-quitter" id="nouvelleOshi" type="button">Rejouer</button>
      <button class="jeu-quitter" id="quitterOshi" type="button">Retour</button>
    </span>
  </div>
  <div class="scores-ligne" id="niveauxOshi"></div>
  <canvas id="canvasOshi"></canvas>
  <p class="jeu-message" id="messageOshi"></p>
  <p class="jeu-aide">Touche 1 à 3 de tes pierres claires alignées, puis une case allumée pour les déplacer. Trois pierres poussent deux pierres adverses, deux en poussent une : sors-en six du plateau. Au clavier : flèches pour le curseur, Espace pour choisir, Retour arrière pour annuler. N rejouer, M son, Échap quitter.</p>`;
document.body.appendChild(zone);

const canvas = document.getElementById("canvasOshi");
const contexte = canvas.getContext("2d");
const zoneSorties = document.getElementById("sortiesOshi");
const zonePerdues = document.getElementById("perduesOshi");
const zoneCoups = document.getElementById("coupsOshi");
const zoneMessage = document.getElementById("messageOshi");
const zoneNiveaux = document.getElementById("niveauxOshi");
const boutonAnnuler = document.getElementById("annulerOshi");
const boutonSon = document.getElementById("sonOshi");

const LARGEUR = 560;
const HAUTEUR = 600;
const TAILLE = 28;           // rayon d'une case hexagonale
const CX = LARGEUR / 2;
const CY = 256;
const SQRT3 = Math.sqrt(3);

// ---------------------------------------------------------------------
// Etat
// ---------------------------------------------------------------------

const effets = creerEffets();
const stockageNiveau = creerStockage("tanuki-arcade-oshidashi-niveau");
let niveau = NIVEAUX.find(n => n.id === stockageNiveau.lireTexte() && !n.ligne) || NIVEAUX[1];
let joueurAuTrait = 1;   // a deux : le plateau se retourne, celui qui joue est en bas
let position = positionDeDepart();
let historique = [];
let selection = [];
let possibles = [];            // coups legaux pour la selection
let curseur = indexDe(0, 2);
let aMoi = true;
let termine = false;
let nombreCoups = 0;
let animation = null;          // { mouvements, debut, duree, fin }
let dernier = [];              // cases d'arrivee du dernier coup adverse
let jeton = 0;

function centre(i) {
  const { q, r } = CELLULES[i];
  return { x: CX + TAILLE * SQRT3 * (q + r / 2), y: CY + TAILLE * 1.5 * r };
}

function idClassement() {
  return "oshidashi-" + niveau.id;
}

function afficher(texte) {
  zoneMessage.textContent = texte;
}

function majEntete() {
  zoneSorties.textContent = position.sorties[JOUEUR] + "/" + VICTOIRE;
  zonePerdues.textContent = position.sorties[IA] + "/" + VICTOIRE;
  zoneCoups.textContent = String(nombreCoups);
  boutonAnnuler.disabled = historique.length === 0 || !aMoi || termine || !!niveau.ligne;
}

// ---------------------------------------------------------------------
// Tutoriel : des positions preparees ou l'on pousse vraiment les billes
// ---------------------------------------------------------------------

const stockageTuto = creerStockage("tanuki-arcade-tuto-oshidashi");
let tuto = null;
let boutonsTuto = [];
const ix = (q, r) => indexDe(q, r);

const ETAPES_OSHI = [
  {
    titre: "Déplacer une bille",
    texte: "Tu joues les billes claires. Touche ta bille pour la choisir, puis une case allumée pour la déplacer.",
    claires: [ix(0, 1)], sombres: [], choisir: [ix(0, 1)],
    reussi: c => true
  },
  {
    titre: "Jusqu'à trois en ligne",
    texte: "On peut bouger 1, 2 ou 3 billes alignées en même temps. Touche les trois billes l'une après l'autre, puis avance-les d'une case.",
    claires: [ix(-1, 1), ix(0, 1), ix(1, 1)], sombres: [], choisir: [ix(-1, 1), ix(0, 1), ix(1, 1)],
    reussi: c => c.pierres.length === 3,
    rate: "Il fallait bouger les trois billes ensemble. Recommence."
  },
  {
    titre: "Glisser de côté",
    texte: "Une ligne peut aussi glisser de côté, chaque bille avançant d'un pas. Choisis les trois billes et fais-les descendre en diagonale.",
    claires: [ix(-1, 0), ix(0, 0), ix(1, 0)], sombres: [], choisir: [ix(-1, 0), ix(0, 0), ix(1, 0)],
    reussi: c => c.arrivees.length === 3,
    rate: "Là, elles ont avancé en ligne. Cette fois, fais-les glisser de côté."
  },
  {
    titre: "Pousser : deux contre une",
    texte: "Le sumito : en ligne, tes billes poussent les billes sombres si elles sont plus nombreuses. Choisis tes deux billes et touche la bille sombre.",
    claires: [ix(0, 2), ix(0, 1)], sombres: [ix(0, 0)], choisir: [ix(0, 2), ix(0, 1)],
    reussi: c => c.pousse >= 1,
    rate: "Pousse la bille sombre : touche-la après avoir choisi tes deux billes."
  },
  {
    titre: "Trois contre deux",
    texte: "Trois billes poussent une ou deux billes sombres. Choisis tes trois billes et pousse les deux sombres.",
    claires: [ix(0, 3), ix(0, 2), ix(0, 1)], sombres: [ix(0, 0), ix(0, -1)], choisir: [ix(0, 3), ix(0, 2), ix(0, 1)],
    reussi: c => c.pousse === 2,
    rate: "Il fallait pousser les deux billes sombres. Recommence."
  },
  {
    titre: "À égalité, ça bloque",
    texte: "Deux contre deux : impossible de pousser, il faut être plus nombreux. Choisis tes deux billes : la bille sombre ne s'allume pas.",
    claires: [ix(0, 2), ix(0, 1)], sombres: [ix(0, 0), ix(0, -1)], choisir: [ix(0, 2), ix(0, 1)],
    selection: 2,
    apres: "Exact : aucune poussée possible vers le haut. À égalité de nombre, ou avec plus de trois billes sombres, on est bloqué."
  },
  {
    titre: "Sortir une bille",
    texte: "Pousse une bille sombre au-delà du bord : elle tombe dans la rigole. Choisis tes deux billes et pousse.",
    claires: [ix(0, -2), ix(0, -3)], sombres: [ix(0, -4)], choisir: [ix(0, -2), ix(0, -3)],
    reussi: c => c.ejecte,
    rate: "Vise la bille sombre au bord pour la faire tomber.",
    apres: "Elle est sortie ! Le but du jeu : faire tomber six billes adverses avant que l'IA en fasse tomber six des tiennes."
  }
];

function proposerTuto() {
  tuto = { proposition: true, i: -1, bravo: 0 };
}

function lancerTuto() {
  if (niveau.ligne && versus.ouvert) {
    afficher("Le tutoriel attendra la fin de la partie en ligne.");
    return;
  }
  stockageTuto.ecrire({ vu: true });
  tuto = { i: 0, bravo: 0 };
  preparerEtapeOshi();
}

function preparerEtapeOshi() {
  const e = ETAPES_OSHI[tuto.i];
  jeton++;
  position = { plateau: new Int8Array(NOMBRE), sorties: [0, 0, 0] };
  e.claires.forEach(c => { position.plateau[c] = JOUEUR; });
  e.sombres.forEach(c => { position.plateau[c] = IA; });
  historique = [];
  selection = [];
  possibles = [];
  aMoi = true;
  termine = false;
  nombreCoups = 0;
  animation = null;
  dernier = [];
  rigole = [];
  effets.vider();
  curseur = e.choisir[0];
  tuto.bravo = 0;
  tuto.apres = false;
  tuto.message = "";
  afficher("");
  majEntete();
}

function etapeSuivanteOshi() {
  if (tuto.i >= ETAPES_OSHI.length - 1) {
    tuto = { fin: true, i: -1, bravo: 0 };
    position = positionDeDepart();
    selection = [];
    possibles = [];
    return;
  }
  tuto.i++;
  preparerEtapeOshi();
}

function quitterTuto() {
  tuto = null;
  demarrer();
}

// Apres un coup joue pendant le tuto
function coupTuto(coup) {
  const e = ETAPES_OSHI[tuto.i];
  if (e.reussi && e.reussi(coup)) {
    jouerSon("vie");
    if (e.apres) {
      tuto.apres = true;
    } else {
      tuto.bravo = 1.3;
    }
  } else {
    tuto.message = e.rate || "Pas tout à fait. Recommence.";
    jouerSon("clic");
    setTimeout(() => {
      if (tuto && ETAPES_OSHI[tuto.i] === e && !tuto.apres && tuto.bravo <= 0) {
        const m = tuto.message;
        preparerEtapeOshi();
        tuto.message = m;
      }
    }, 900);
  }
}

function lignesTexte(g, texte, largeur) {
  const mots = texte.split(" ");
  const lignes = [];
  let ligne = "";
  mots.forEach(m => {
    const essai = ligne ? ligne + " " + m : m;
    if (g.measureText(essai).width > largeur && ligne) {
      lignes.push(ligne);
      ligne = m;
    } else {
      ligne = essai;
    }
  });
  lignes.push(ligne);
  return lignes;
}

function boutonCanvas(g, texte, x, y, w, h, principal, action) {
  g.fillStyle = principal ? "#c8372d" : "#e8dcc0";
  g.beginPath();
  g.roundRect(x, y, w, h, 9);
  g.fill();
  g.font = "800 13px 'Anybody', sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = principal ? "#ffffff" : "#5a4a3a";
  g.fillText(texte, x + w / 2, y + h / 2 + 1);
  boutonsTuto.push({ zone: [x, y, w, h], action, principal });
}

// La bulle prend la place des casiers du bas
function dessinerBulleOshi(g) {
  boutonsTuto = [];
  const x = 12;
  const y = 506;
  const w = LARGEUR - 24;
  const h = 90;
  g.fillStyle = "#f6efdc";
  g.beginPath();
  g.roundRect(x, y, w, h, 14);
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = "#c8372d";
  g.stroke();
  let titre;
  let texte;
  const choix = [];
  if (tuto.proposition) {
    titre = "Première visite";
    texte = "Ce jeu de poussée (l'Abalone) est peu connu ici. Une minute pour apprendre en jouant ?";
    choix.push(["Plus tard", false, () => { stockageTuto.ecrire({ vu: true }); quitterTuto(); }], ["Apprendre", true, lancerTuto]);
  } else if (tuto.fin) {
    titre = "Prêt !";
    texte = "Tu sais tout. Sors six billes sombres avant l'IA. Garde tes billes groupées au centre.";
    choix.push(["Revoir", false, lancerTuto], ["Jouer", true, quitterTuto]);
  } else {
    const e = ETAPES_OSHI[tuto.i];
    titre = (tuto.i + 1) + " / " + ETAPES_OSHI.length + "  " + e.titre;
    texte = tuto.apres ? e.apres : tuto.message || e.texte;
    if (tuto.apres) {
      choix.push(["Suivant", true, etapeSuivanteOshi]);
    }
  }
  g.font = "800 14px 'Anybody', sans-serif";
  g.textAlign = "left";
  g.textBaseline = "middle";
  g.fillStyle = "#c8372d";
  g.fillText(titre.toUpperCase(), x + 14, y + 16);
  g.font = "600 14px 'Hanken Grotesk', sans-serif";
  g.fillStyle = "#2a2030";
  const largeurTexte = w - 28 - (choix.length ? choix.length * 112 : 0);
  lignesTexte(g, texte, largeurTexte).slice(0, 4).forEach((l, k) => {
    g.textAlign = "left";
    g.fillText(l, x + 14, y + 36 + k * 16);
  });
  if (!tuto.proposition && !tuto.fin) {
    boutonCanvas(g, "Passer le tuto", x + w - 118, y + 6, 106, 22, false, quitterTuto);
  }
  choix.forEach(([t, principal, action], k) => {
    boutonCanvas(g, t, x + w - 12 - (choix.length - k) * 112 + 10, y + h - 40, 102, 32, principal, action);
  });
  if (tuto.bravo > 0) {
    g.font = "800 44px 'Anybody', sans-serif";
    g.textAlign = "center";
    g.lineWidth = 6;
    g.strokeStyle = "#0a2010";
    g.strokeText("Bravo !", CX, CY);
    g.fillStyle = "#c6f35a";
    g.fillText("Bravo !", CX, CY);
  }
}

// Billes a choisir : un anneau qui pulse
function dessinerAidesOshi(g) {
  if (!tuto || tuto.i < 0 || tuto.apres || tuto.bravo > 0 || animation) {
    return;
  }
  const e = ETAPES_OSHI[tuto.i];
  const r = TAILLE * 0.5;
  const p = Math.sin(temps * 6);
  e.choisir.forEach(c => {
    if (selection.includes(c) || position.plateau[c] !== JOUEUR) {
      return;
    }
    const { x, y } = centre(c);
    g.strokeStyle = "#c6f35a";
    g.lineWidth = 3;
    g.setLineDash([5, 4]);
    g.beginPath();
    g.arc(x, y, r + 6 + p * 2, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
  });
}

function demarrer() {
  if (niveau.ligne && versus.actif) {
    return;
  }
  tuto = null;
  position = positionDeDepart();
  joueurAuTrait = 1;
  historique = [];
  selection = [];
  possibles = [];
  aMoi = true;
  termine = false;
  nombreCoups = 0;
  animation = null;
  dernier = [];
  jeton++;
  effets.vider();
  curseur = indexDe(-1, 2);
  marquerChoixActif(zoneNiveaux, niveau.id);
  afficher(niveau.deux ? "Joueur 1 commence. Le plateau se retourne après chaque coup."
    : "À toi. Choisis une à trois pierres claires alignées.");
  rigole = [];
  if (niveau.ligne) {
    aMoi = false;
    afficher("Versus en ligne : trouve un adversaire dans le panneau ci-dessus.");
    versus.ouvrir();
  }
  majEntete();
  majBoutonSon();
  ajuster();
  requestAnimationFrame(ajuster);
  boucle.lancer();
}

// ---------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------

// Une selection valide : 1 a 3 pierres a moi, contigues et alignees
function selectionValide(cases) {
  if (cases.length === 0 || cases.length > 3) {
    return false;
  }
  if (cases.length === 1) {
    return true;
  }
  for (let axe = 0; axe < 3; axe++) {
    // Trouver une extremite : celle dont le voisin arriere n'est pas dans la selection
    const debut = cases.find(c => !cases.includes(VOISIN[c][axe + 3]));
    if (debut === undefined) {
      continue;
    }
    let c = debut;
    let compte = 0;
    while (c !== -1 && cases.includes(c)) {
      compte++;
      c = VOISIN[c][axe];
    }
    if (compte === cases.length) {
      return true;
    }
  }
  return false;
}

function memesCases(a, b) {
  return a.length === b.length && a.every(x => b.includes(x));
}

function majPossibles() {
  possibles = selection.length === 0
    ? []
    : coups(position, JOUEUR).filter(c => memesCases(c.pierres, selection));
}

// Les cases a toucher pour jouer chaque coup possible
function ciblesDe(coup) {
  return coup.arrivees.length === 1
    ? [coup.arrivees[0]]
    : coup.arrivees.filter(a => !coup.pierres.includes(a));
}

function toucher(i) {
  if (!aMoi || termine || animation) {
    return;
  }
  if (tuto && (tuto.i < 0 || tuto.apres || tuto.bravo > 0)) {
    return;
  }
  // Une case cible : on joue
  const coup = possibles.find(c => ciblesDe(c).includes(i));
  if (coup) {
    jouerMonCoup(coup);
    return;
  }
  if (position.plateau[i] === JOUEUR) {
    if (selection.includes(i)) {
      const reste = selection.filter(c => c !== i);
      selection = selectionValide(reste) ? reste : [];
    } else {
      const essai = selection.concat(i);
      selection = selectionValide(essai) ? essai : [i];
    }
    jouerSon("clic");
  } else {
    selection = [];
  }
  majPossibles();
  if (tuto) {
    const e = ETAPES_OSHI[tuto.i];
    tuto.message = "";
    if (e.selection && selection.length === e.selection) {
      jouerSon("vie");
      tuto.apres = true;
    }
    return;
  }
  if (selection.length && possibles.length === 0) {
    afficher("Ces pierres ne peuvent aller nulle part.");
  } else if (selection.length) {
    afficher("Touche une case allumée pour déplacer " + (selection.length === 1 ? "la pierre." : "les " + selection.length + " pierres."));
  } else {
    afficher("À toi. Choisis une à trois pierres claires alignées.");
  }
}

// ---------------------------------------------------------------------
// Coups
// ---------------------------------------------------------------------

function jouerMonCoup(coup) {
  historique.push({ position: copier(position), nombreCoups, dernier, rigole: rigole.slice(), joueurAuTrait });
  if (niveau.ligne) {
    versus.envoyer({ p: coup.pierres, d: coup.dir });
    aMoi = false;
    versus.tour(false);
  }
  const mouvements = appliquer(position, coup, JOUEUR);
  nombreCoups++;
  selection = [];
  possibles = [];
  dernier = [];
  lancerAnimation(mouvements, () => {
    if (tuto) {
      majEntete();
      coupTuto(coup);
      return;
    }
    if (verifierFin()) {
      return;
    }
    if (niveau.deux) {
      passerLaMain();
    } else if (niveau.ligne) {
      afficher("Au tour de " + versus.adversaire + ".");
      majEntete();
    } else {
      tourDeLIA();
    }
  });
  jouerSon(coup.ejecte ? "explosion" : coup.pousse ? "impact" : "clic");
  majEntete();
}

function tourDeLIA() {
  aMoi = false;
  afficher(niveau.id === "difficile" ? "L'IA réfléchit..." : "L'IA joue...");
  majEntete();
  const moi = ++jeton;
  // On laisse le navigateur dessiner avant de lancer la recherche
  setTimeout(() => {
    if (moi !== jeton) {
      return;
    }
    const coup = choisirCoup(position, IA, niveau.id);
    if (!coup) {
      termine = true;
      afficher("L'IA ne peut plus bouger.");
      return;
    }
    const mouvements = appliquer(position, coup, IA);
    dernier = coup.arrivees.length === 1
      ? mouvements.filter(m => m.pierre === IA && m.vers >= 0).map(m => m.vers)
      : coup.arrivees;
    jouerSon(coup.ejecte ? "mort" : coup.pousse ? "impact" : "clic");
    lancerAnimation(mouvements, () => {
      if (!verifierFin()) {
        aMoi = true;
        afficher(coup.ejecte ? "L'IA t'a sorti une pierre. À toi." : coup.pousse ? "L'IA te pousse. À toi." : "À toi.");
        majEntete();
      }
    });
  }, 80);
}

function lancerAnimation(mouvements, ensuite) {
  animation = { mouvements, debut: performance.now(), duree: 220, ensuite };
}

function verifierFin() {
  majEntete();
  if (niveau.deux || niveau.ligne) {
    const gagne = position.sorties[JOUEUR] >= VICTOIRE;
    const perdu = position.sorties[IA] >= VICTOIRE;
    if (!gagne && !perdu) {
      return false;
    }
    termine = true;
    aMoi = false;
    if (niveau.deux) {
      afficher("Six billes sorties : Joueur " + (gagne ? joueurAuTrait : 3 - joueurAuTrait) + " gagne !");
      jouerSon("vie");
    } else {
      afficher(gagne ? "Six billes sorties : tu bats " + versus.adversaire + " !" : versus.adversaire + " a sorti six de tes billes.");
      jouerSon(gagne ? "vie" : "mort");
      versus.terminer(gagne ? "victoire" : "defaite", "six");
    }
    return true;
  }
  if (position.sorties[JOUEUR] >= VICTOIRE) {
    termine = true;
    const perdues = position.sorties[IA];
    const score = Math.max(100, 1000 - 120 * perdues - 2 * nombreCoups);
    afficher("Victoire en " + nombreCoups + " coup" + (nombreCoups > 1 ? "s" : "") + " ! Tu as perdu " + perdues + " pierre" + (perdues > 1 ? "s" : "") + ".");
    jouerSon("vie");
    majScoreCourant(idClassement(), score);
    setTimeout(() => {
      if (!zone.hidden && termine) {
        finDePartie(idClassement(), score, "Oshidashi " + niveau.nom);
      }
    }, 1800);
    return true;
  }
  if (position.sorties[IA] >= VICTOIRE) {
    termine = true;
    afficher("L'IA a sorti six de tes pierres. N pour une revanche.");
    jouerSon("mort");
    setTimeout(() => {
      if (!zone.hidden && termine) {
        finDePartie(idClassement(), 0, "Oshidashi " + niveau.nom);
      }
    }, 1800);
    return true;
  }
  return false;
}

function annuler() {
  if (tuto || historique.length === 0 || !aMoi || termine || animation || niveau.ligne) {
    return;
  }
  const etat = historique.pop();
  jeton++;
  position = etat.position;
  nombreCoups = etat.nombreCoups;
  dernier = etat.dernier;
  rigole = Array.isArray(etat.rigole) ? etat.rigole : rigole.slice(0, etat.rigole);
  if (niveau.deux) {
    joueurAuTrait = etat.joueurAuTrait || 1;
    afficher("Coup annulé. Joueur " + joueurAuTrait + ", à toi.");
    selection = [];
    possibles = [];
    majEntete();
    return;
  }
  selection = [];
  possibles = [];
  afficher("Coup annulé. À toi.");
  majEntete();
}

// ---------------------------------------------------------------------
// Dessin : plateau laque, billes de verre, rigole tout autour
// ---------------------------------------------------------------------

let echelle = 1;
let fondOshi = null;
let rigole = [];               // billes tombees dans la rigole : { x, y, pierre }
let chutes = [];               // billes en train de tomber
let temps = 0;
let prochainAjustement = 0;

function hexagone(g, x, y, rayon, decalage) {
  g.beginPath();
  for (let k = 0; k < 6; k++) {
    const a = (decalage === undefined ? Math.PI / 6 : decalage) + k * Math.PI / 3;
    const px = x + rayon * Math.cos(a);
    const py = y + rayon * Math.sin(a);
    if (k === 0) {
      g.moveTo(px, py);
    } else {
      g.lineTo(px, py);
    }
  }
  g.closePath();
}

function peindrePlateau() {
  const off = document.createElement("canvas");
  off.width = Math.round(LARGEUR * echelle);
  off.height = Math.round(HAUTEUR * echelle);
  const g = off.getContext("2d");
  g.setTransform(echelle, 0, 0, echelle, 0, 0);

  // Ombre sur la table et flanc du plateau
  g.fillStyle = "rgba(0,0,0,0.4)";
  hexagone(g, CX + 6, CY + 14, TAILLE * 9.6, 0);
  g.fill();
  g.fillStyle = "#3a1410";
  hexagone(g, CX, CY + 10, TAILLE * 9.6, 0);
  g.fill();

  // La rigole : un anneau de bois sombre ou tombent les billes sorties
  const anneau = g.createLinearGradient(0, CY - TAILLE * 9, 0, CY + TAILLE * 9);
  anneau.addColorStop(0, "#5a2a1a");
  anneau.addColorStop(1, "#2e120c");
  g.fillStyle = anneau;
  hexagone(g, CX, CY, TAILLE * 9.6, 0);
  g.fill();
  g.fillStyle = "#1a0806";
  hexagone(g, CX, CY, TAILLE * 9.15, 0);
  g.fill();
  g.strokeStyle = "rgba(232,197,71,0.6)";
  g.lineWidth = 2;
  hexagone(g, CX, CY, TAILLE * 9.55, 0);
  g.stroke();

  // Le plateau laque vermillon, eclaire d'en haut
  const laque = g.createLinearGradient(0, CY - TAILLE * 8, 0, CY + TAILLE * 8);
  laque.addColorStop(0, "#b8352a");
  laque.addColorStop(0.5, "#9a2a20");
  laque.addColorStop(1, "#6e1c15");
  g.fillStyle = "#4a120d";
  hexagone(g, CX, CY + 4, TAILLE * 8.3, 0);
  g.fill();
  g.fillStyle = laque;
  hexagone(g, CX, CY, TAILLE * 8.3, 0);
  g.fill();
  g.strokeStyle = "#e8c547";
  g.lineWidth = 2.5;
  hexagone(g, CX, CY, TAILLE * 8.15, 0);
  g.stroke();
  // Reflet large et doux sur la laque, en haut a gauche
  g.save();
  hexagone(g, CX, CY, TAILLE * 8.3, 0);
  g.clip();
  g.fillStyle = "rgba(255,255,255,0.07)";
  g.beginPath();
  g.ellipse(CX - TAILLE * 3, CY - TAILLE * 5, TAILLE * 7, TAILLE * 2.4, -0.4, 0, Math.PI * 2);
  g.fill();
  g.restore();

  // Les 61 alveoles : un creux sombre, bord clair en bas (la lumiere vient d'en haut)
  for (let i = 0; i < NOMBRE; i++) {
    const { x, y } = centre(i);
    g.fillStyle = "rgba(255,210,180,0.22)";
    g.beginPath();
    g.arc(x, y + 1.5, TAILLE * 0.54, 0, Math.PI * 2);
    g.fill();
    const creux = g.createRadialGradient(x, y - 3, 1, x, y, TAILLE * 0.5);
    creux.addColorStop(0, "#2a0a07");
    creux.addColorStop(1, "#4e140e");
    g.fillStyle = creux;
    g.beginPath();
    g.arc(x, y, TAILLE * 0.52, 0, Math.PI * 2);
    g.fill();
  }

  // Bandeau du bas : les deux casiers de billes sorties
  [["TES SORTIES", 30, IA], ["TES PERTES", LARGEUR / 2 + 10, JOUEUR]].forEach(([titre, x]) => {
    g.fillStyle = "rgba(255,255,255,0.05)";
    g.beginPath();
    g.roundRect(x, HAUTEUR - 74, LARGEUR / 2 - 40, 60, 12);
    g.fill();
    g.fillStyle = "#a9a3b8";
    g.font = "600 9px 'Martian Mono', monospace";
    g.textAlign = "left";
    g.textBaseline = "middle";
    g.fillText(titre, x + 12, HAUTEUR - 62);
    for (let k = 0; k < VICTOIRE; k++) {
      const sx = x + 22 + k * 34;
      const sy = HAUTEUR - 36;
      g.fillStyle = "#14141c";
      g.beginPath();
      g.arc(sx, sy, 12, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "rgba(255,255,255,0.12)";
      g.lineWidth = 1;
      g.stroke();
    }
  });
  return off;
}

// Une bille de verre : ombre, corps en degrade, reflet net, lumiere qui traverse
function bille(g, x, y, r, pierre, leve) {
  const h = leve || 0;
  g.fillStyle = "rgba(0,0,0," + (0.45 - h * 0.03) + ")";
  g.beginPath();
  g.ellipse(x + 2 + h * 0.6, y + 3 + h, r * (1 + h * 0.03), r * 0.9, 0, 0, Math.PI * 2);
  g.fill();
  const cy = y - h;
  const corps = g.createRadialGradient(x - r * 0.3, cy - r * 0.35, r * 0.1, x, cy, r);
  if (pierre === JOUEUR) {
    corps.addColorStop(0, "#ffffff");
    corps.addColorStop(0.5, "#f1ebdd");
    corps.addColorStop(1, "#b8ae98");
  } else {
    corps.addColorStop(0, "#5c5c6c");
    corps.addColorStop(0.45, "#22222c");
    corps.addColorStop(1, "#06060a");
  }
  g.fillStyle = corps;
  g.beginPath();
  g.arc(x, cy, r, 0, Math.PI * 2);
  g.fill();
  // Lumiere qui traverse le verre et ressort en bas a droite
  g.fillStyle = pierre === JOUEUR ? "rgba(255,236,190,0.55)" : "rgba(140,150,190,0.35)";
  g.beginPath();
  g.ellipse(x + r * 0.28, cy + r * 0.45, r * 0.42, r * 0.22, -0.5, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "rgba(255,255,255,0.9)";
  g.beginPath();
  g.ellipse(x - r * 0.38, cy - r * 0.42, r * 0.26, r * 0.15, -0.6, 0, Math.PI * 2);
  g.fill();
}

function dessiner() {
  if (fondOshi === null) {
    return;
  }
  const d = effets.decalage();
  contexte.setTransform(1, 0, 0, 1, 0, 0);
  contexte.fillStyle = "#09090e";
  contexte.fillRect(0, 0, canvas.width, canvas.height);
  contexte.drawImage(fondOshi, d.x * echelle, d.y * echelle);
  contexte.setTransform(echelle, 0, 0, echelle, d.x * echelle, d.y * echelle);
  const r = TAILLE * 0.5;

  // Animation en cours : les pierres en vol ne sont pas dessinees a leur place
  let progres = 1;
  const enVol = new Set();
  if (animation) {
    progres = Math.min(1, (performance.now() - animation.debut) / animation.duree);
    animation.mouvements.forEach(m => {
      if (m.vers >= 0) {
        enVol.add(m.vers);
      }
    });
  }

  // Cases ou l'on peut aller : un point lime au fond de l'alveole
  const cibles = new Set();
  possibles.forEach(c => ciblesDe(c).forEach(t => cibles.add(t)));
  cibles.forEach(i => {
    const { x, y } = centre(i);
    contexte.fillStyle = "#c6f35a";
    contexte.beginPath();
    contexte.arc(x, y, position.plateau[i] ? r + 4 : 6, 0, Math.PI * 2);
    if (position.plateau[i]) {
      contexte.strokeStyle = "#c6f35a";
      contexte.lineWidth = 3;
      contexte.stroke();
    } else {
      contexte.fill();
    }
  });

  // Billes posees, de haut en bas pour que les ombres se recouvrent bien
  for (let i = 0; i < NOMBRE; i++) {
    const pierre = position.plateau[i];
    if (!pierre || enVol.has(i)) {
      continue;
    }
    const { x, y } = centre(i);
    const choisie = selection.includes(i);
    bille(contexte, x, y, r, pierre, choisie ? 4 : 0);
    if (choisie) {
      contexte.strokeStyle = "#c6f35a";
      contexte.lineWidth = 3;
      contexte.beginPath();
      contexte.arc(x, y - 4, r + 3, 0, Math.PI * 2);
      contexte.stroke();
    }
    if (dernier.includes(i) && !animation) {
      contexte.fillStyle = "#e0574b";
      contexte.beginPath();
      contexte.arc(x, y + r + 5, 2.5, 0, Math.PI * 2);
      contexte.fill();
    }
  }

  // Billes en mouvement : elles glissent ; l'ejectee file vers la rigole
  if (animation) {
    const t = 1 - Math.pow(1 - progres, 3);
    animation.mouvements.forEach(m => {
      const a = centre(m.de);
      if (m.vers >= 0) {
        const b = centre(m.vers);
        bille(contexte, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, r, m.pierre, 0);
      } else {
        const p = pointRigole(a);
        bille(contexte, a.x + (p.x - a.x) * t, a.y + (p.y - a.y) * t, r * (1 - 0.15 * t), m.pierre, 0);
      }
    });
    if (progres >= 1) {
      const fini = animation;
      animation = null;
      fini.mouvements.forEach(m => {
        if (m.vers < 0) {
          const p = pointRigole(centre(m.de));
          rigole.push({ x: p.x, y: p.y, pierre: m.pierre });
          effets.eclater(p.x, p.y, m.pierre === JOUEUR ? ["#ede8df", "#b8ae98"] : ["#22222c", "#5c5c6c"], 14, 120);
          effets.secouer(5, 0.3);
        }
      });
      fini.ensuite();
    }
  }

  // Billes dans la rigole, un peu plus petites (elles sont tombees plus bas)
  rigole.forEach(b => bille(contexte, b.x, b.y, r * 0.85, b.pierre, 0));

  dessinerAidesOshi(contexte);
  if (tuto) {
    dessinerBulleOshi(contexte);
  }
  // Casiers du bas : une bille par sortie
  for (let k = 0; !tuto && k < position.sorties[JOUEUR]; k++) {
    bille(contexte, 30 + 22 + k * 34, HAUTEUR - 36, 10, IA, 0);
  }
  for (let k = 0; !tuto && k < position.sorties[IA]; k++) {
    bille(contexte, LARGEUR / 2 + 10 + 22 + k * 34, HAUTEUR - 36, 10, JOUEUR, 0);
  }

  // Curseur clavier et manette
  if (aMoi && !termine) {
    const { x, y } = centre(curseur);
    contexte.strokeStyle = "#ede8df";
    contexte.lineWidth = 2;
    hexagone(contexte, x, y, TAILLE * 0.98);
    contexte.stroke();
  }

  effets.dessiner(contexte);
  contexte.setTransform(1, 0, 0, 1, 0, 0);
}

function majTuto(delta) {
  if (tuto && tuto.bravo > 0) {
    tuto.bravo -= delta;
    if (tuto.bravo <= 0) {
      etapeSuivanteOshi();
    }
  }
}

// Point de la rigole dans le prolongement d'une case du bord
function pointRigole(a) {
  const dx = a.x - CX;
  const dy = a.y - CY;
  const l = Math.hypot(dx, dy) || 1;
  const rayon = TAILLE * 8.75;
  return { x: CX + dx / l * rayon, y: CY + dy / l * rayon * 0.98 };
}

function ajuster() {
  const marge = window.innerWidth >= 1100 ? 500 : 0;
  const largeur = Math.min(window.innerWidth * 0.96 - marge, 640);
  const autres = ["entete-oshidashi", "scores-ligne", "versus", "jeu-message"].reduce((somme, classe) => {
    const el = zone.querySelector("." + classe);
    return somme + (el && !el.hidden ? el.getBoundingClientRect().height + 8 : 0);
  }, 0);
  const manette = document.querySelector(".manette:not([hidden])");
  const hauteurManette = manette ? manette.getBoundingClientRect().height : 0;
  const hauteur = Math.max(180, window.innerHeight - autres - hauteurManette - 60);
  const taille = Math.min(largeur / LARGEUR, hauteur / HAUTEUR);
  canvas.style.width = Math.floor(LARGEUR * taille) + "px";
  canvas.style.height = Math.floor(HAUTEUR * taille) + "px";
  const nouvelle = Math.min(3, Math.max(1, taille * (window.devicePixelRatio || 1)));
  if (Math.abs(nouvelle - echelle) > 0.02 || fondOshi === null) {
    echelle = nouvelle;
    canvas.width = Math.round(LARGEUR * echelle);
    canvas.height = Math.round(HAUTEUR * echelle);
    fondOshi = peindrePlateau();
  }
}

window.addEventListener("resize", function () {
  if (!zone.hidden) {
    ajuster();
  }
});

const boucle = creerBoucle((delta) => {
  temps += delta;
  effets.maj(delta);
  majTuto(delta);
  if (temps > prochainAjustement) {
    prochainAjustement = temps + 0.5;
    ajuster();
  }
  dessiner();
}, { plafond: 0.05 });

// ---------------------------------------------------------------------
// Commandes
// ---------------------------------------------------------------------

function caseSousPointeur(evenement) {
  const r = canvas.getBoundingClientRect();
  const x = (evenement.clientX - r.left) * (LARGEUR / r.width);
  const y = (evenement.clientY - r.top) * (HAUTEUR / r.height);
  let meilleure = -1;
  let distanceMin = TAILLE;
  for (let i = 0; i < NOMBRE; i++) {
    const c = centre(i);
    const dist = Math.hypot(c.x - x, c.y - y);
    if (dist < distanceMin) {
      distanceMin = dist;
      meilleure = i;
    }
  }
  return meilleure;
}

canvas.addEventListener("click", function (evenement) {
  if (tuto) {
    const r = canvas.getBoundingClientRect();
    const x = (evenement.clientX - r.left) * (LARGEUR / r.width);
    const y = (evenement.clientY - r.top) * (HAUTEUR / r.height);
    const b = boutonsTuto.find(bt => x >= bt.zone[0] && x <= bt.zone[0] + bt.zone[2] && y >= bt.zone[1] && y <= bt.zone[1] + bt.zone[3]);
    if (b) {
      jouerSon("clic");
      b.action();
      return;
    }
    if (y > 500) {
      return;
    }
  }
  const i = caseSousPointeur(evenement);
  if (i >= 0) {
    curseur = i;
    colonneVisee = null;
    toucher(i);
  } else {
    selection = [];
    majPossibles();
  }
});

canvas.addEventListener("contextmenu", evenement => evenement.preventDefault());

// Colonne visee en montant ou en descendant : le curseur zigzague
// autour d'une verticale au lieu de deriver sur le cote
let colonneVisee = null;

function deplacerCurseur(dq, dr) {
  const { q, r } = CELLULES[curseur];
  if (dr === 0) {
    const i = indexDe(q + dq, r);
    if (i >= 0) {
      curseur = i;
    }
    colonneVisee = null;
    return;
  }
  const options = dr < 0 ? [[q + 1, r - 1], [q, r - 1]] : [[q - 1, r + 1], [q, r + 1]];
  if (colonneVisee === null) {
    colonneVisee = centre(curseur).x;
  }
  // A egalite, on alterne pour rester sur la verticale
  const x = colonneVisee + (centre(curseur).x <= colonneVisee ? 0.01 : -0.01);
  let choisi = -1;
  let ecart = Infinity;
  for (const [nq, nr] of options) {
    const i = indexDe(nq, nr);
    if (i >= 0 && Math.abs(centre(i).x - x) < ecart) {
      ecart = Math.abs(centre(i).x - x);
      choisi = i;
    }
  }
  if (choisi >= 0) {
    curseur = choisi;
  }
}

surTouche(ID, function (evenement) {
  const touche = evenement.key.toLowerCase();
  if (touche === "arrowleft" || touche === "q") {
    deplacerCurseur(-1, 0);
  } else if (touche === "arrowright" || touche === "d") {
    deplacerCurseur(1, 0);
  } else if (touche === "arrowup" || touche === "z") {
    deplacerCurseur(0, -1);
  } else if (touche === "arrowdown" || touche === "s") {
    deplacerCurseur(0, 1);
  } else if ((touche === " " || touche === "enter") && tuto && boutonsTuto.some(b => b.principal)) {
    boutonsTuto.find(b => b.principal).action();
  } else if (touche === " " || touche === "enter") {
    toucher(curseur);
  } else if (touche === "x") {
    selection = [];
    majPossibles();
  } else if (touche === "backspace" || touche === "u") {
    annuler();
  } else if (touche === "n" && tuto && tuto.i >= 0) {
    preparerEtapeOshi();
  } else if (touche === "t" && tuto) {
    quitterTuto();
  } else if (touche === "n") {
    demarrer();
  } else if (touche === "m") {
    basculerSon();
    majBoutonSon();
  } else if (touche === "escape") {
    quitterJeu();
    return;
  } else {
    return;
  }
  evenement.preventDefault();
});

function majBoutonSon() {
  boutonSon.textContent = sonActif() ? "Son" : "Muet";
}

creerBoutonsChoix(zoneNiveaux, CHOIX, function (choix) {
  if (niveau.ligne && !choix.ligne && versus.ouvert) {
    versus.fermer();
    if (versus.ouvert) {
      return;
    }
  }
  niveau = choix;
  if (!choix.ligne) {
    stockageNiveau.ecrireTexte(choix.id);
  }
  demarrer();
});

// ---------------------------------------------------------------------
// A deux et en ligne
// ---------------------------------------------------------------------

// Une case vue depuis l'autre bout du plateau : (q, r) devient (-q, -r)
const OPPOSEE_CASE = CELLULES.map(({ q, r }) => indexDe(-q, -r));

function pivoter(pos) {
  const plateau = new Int8Array(NOMBRE);
  for (let i = 0; i < NOMBRE; i++) {
    const v = pos.plateau[OPPOSEE_CASE[i]];
    plateau[i] = v === JOUEUR ? IA : v === IA ? JOUEUR : 0;
  }
  return { plateau, sorties: [0, pos.sorties[IA], pos.sorties[JOUEUR]] };
}

function passerLaMain() {
  aMoi = false;
  const moi = ++jeton;
  setTimeout(() => {
    if (moi !== jeton || termine) {
      return;
    }
    position = pivoter(position);
    // La rigole tourne avec le plateau, les couleurs s'echangent
    rigole = rigole.map(b => ({ x: 2 * CX - b.x, y: 2 * CY - b.y, pierre: b.pierre === JOUEUR ? IA : JOUEUR }));
    dernier = dernier.map(i => OPPOSEE_CASE[i]);
    joueurAuTrait = 3 - joueurAuTrait;
    selection = [];
    possibles = [];
    aMoi = true;
    afficher("Joueur " + joueurAuTrait + ", à toi : tes billes sont les claires, en bas.");
    majEntete();
  }, 600);
}

function coupAdverse(recu) {
  const pierres = (recu.p || []).map(i => OPPOSEE_CASE[Number(i)]);
  const dir = opposee(Number(recu.d));
  const coup = coups(position, IA).find(c => c.dir === dir && memesCases(c.pierres, pierres));
  if (!coup) {
    afficher("Coup reçu impossible : la partie est arrêtée.");
    termine = true;
    versus.terminer("victoire", "invalide");
    return;
  }
  const mouvements = appliquer(position, coup, IA);
  dernier = coup.arrivees.length === 1
    ? mouvements.filter(m => m.pierre === IA && m.vers >= 0).map(m => m.vers)
    : coup.arrivees;
  jouerSon(coup.ejecte ? "mort" : coup.pousse ? "impact" : "clic");
  lancerAnimation(mouvements, () => {
    if (!verifierFin()) {
      aMoi = true;
      versus.tour(true);
      afficher(coup.ejecte ? versus.adversaire + " t'a sorti une bille. À toi." : coup.pousse ? versus.adversaire + " te pousse. À toi." : "À toi.");
      majEntete();
    }
  });
}

const versus = creerVersus({
  jeu: ID,
  nom: "Oshidashi",
  section: zone,
  surDebut(info) {
    jeton++;
    tuto = null;
    position = positionDeDepart();
    historique = [];
    selection = [];
    possibles = [];
    termine = false;
    nombreCoups = 0;
    animation = null;
    dernier = [];
    rigole = [];
    effets.vider();
    let auTrait = info.jeCommence ? JOUEUR : IA;
    info.coups.forEach(k => {
      const pierres = k.moi ? k.c.p.map(Number) : k.c.p.map(i => OPPOSEE_CASE[Number(i)]);
      const dir = k.moi ? Number(k.c.d) : opposee(Number(k.c.d));
      const camp = k.moi ? JOUEUR : IA;
      const coup = coups(position, camp).find(c => c.dir === dir && memesCases(c.pierres, pierres));
      if (coup) {
        appliquer(position, coup, camp);
        if (k.moi) {
          nombreCoups++;
        }
      }
      auTrait = camp === JOUEUR ? IA : JOUEUR;
    });
    aMoi = auTrait === JOUEUR;
    versus.tour(aMoi);
    afficher(aMoi ? "À toi : tes billes claires contre les sombres de " + info.adversaire + "." : info.adversaire + " commence.");
    jouerSon("bonus");
    majEntete();
  },
  surCoup: coupAdverse,
  surFin(fin) {
    termine = true;
    aMoi = false;
    majEntete();
    afficher(fin.resultat === "victoire" ? "Victoire : " + versus.adversaire + (fin.raison === "abandon" ? " abandonne." : " quitte la partie.")
      : fin.resultat === "nul" ? "Partie nulle." : "Partie perdue.");
  },
  passerEnLigne() {
    if (!niveau.ligne) {
      niveau = NIVEAUX.find(n => n.ligne);
      tuto = null;
      demarrer();
    }
  },
  surFermeture() {
    if (niveau.ligne) {
      niveau = NIVEAUX[1];
      demarrer();
    }
  }
});

boutonAnnuler.addEventListener("click", annuler);
document.getElementById("tutoOshi").addEventListener("click", lancerTuto);
boutonSon.addEventListener("click", () => { basculerSon(); majBoutonSon(); });
document.getElementById("nouvelleOshi").addEventListener("click", demarrer);
document.getElementById("quitterOshi").addEventListener("click", quitterJeu);

// Pour les tests automatiques
export const _test = { get aMoi() { return aMoi && !termine && !animation; }, get position() { return position; }, jouerMonCoup, coupsLegaux: () => coups(position, JOUEUR), get tuto() { return tuto; }, ETAPES_OSHI, get selection() { return selection; }, get possibles() { return possibles; }, get boutons() { return boutonsTuto; }, centre, get animation() { return animation; } };

enregistrerJeu({
  id: ID,
  nom: "Oshidashi",
  code: "14",
  section: zone,
  demarrer() {
    if (niveau.ligne && versus.ouvert) {
      marquerChoixActif(zoneNiveaux, niveau.id);
      ajuster();
      requestAnimationFrame(ajuster);
      boucle.lancer();
      versus.reprendreSondage();
      return;
    }
    if (niveau.ligne) {
      niveau = NIVEAUX[1];
    }
    demarrer();
    if (!(stockageTuto.lire() || {}).vu) {
      proposerTuto();
    }
  },
  arreter: () => { jeton++; boucle.arreter(); versus.suspendre(); },
  classement: () => "oshidashi-" + (niveau.deux || niveau.ligne ? "moyen" : niveau.id),
  manette: { a: " ", b: "x", start: "n", select: "m", libelles: { a: "Choisir", b: "Effacer" } }
});


