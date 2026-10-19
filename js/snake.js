// =====================================================================
//  SNAKE - version enrichie
//  Le serpent traverse les bords et ressort en face. Des bonus et des
//  malus apparaissent le temps de quelques secondes, une pomme doree
//  rapporte gros, et des murs s'ajoutent a mesure que le score monte.
//
//  Les regles sont celles de Lass et n'ont pas bouge. Seul le dessin a
//  ete refait : jardin illustre, serpent en volume qui glisse d'une case
//  a l'autre, pommes et objets dessines, effets quand il mange ou meurt.
//  Tout ce qui sert au dessin est marque "affichage" : rien de cela ne
//  touche a la vitesse, aux collisions, au score ni aux commandes.
// =====================================================================

import { enregistrerJeu, finDePartie, quitterJeu, jeuActif, overlayOuvert, majScoreCourant } from "./arcade.js";
import { creerBoucle } from "./noyau/boucle.js";
import { surTouche } from "./noyau/clavier.js";
import { surGlissement } from "./noyau/tactile.js";
import { creerAfficheur } from "./noyau/message.js";

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

// Affichage seulement : position du serpent avant le dernier pas, pour le
// faire glisser entre deux cases, et petits effets visuels
let serpentAvant = [];
let eclats = [];
let textesVolants = [];
let instantMort = 0;
let horloge = 0;


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
  serpentAvant = serpent.map(segment => ({ x: segment.x, y: segment.y }));
  eclats = [];
  textesVolants = [];
  placerPomme();
  majStatsSnake();
  afficherMessageSnake("");
  boucleSnake.lancer();
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
  majScoreCourant("snake", score);
}

const afficherMessageSnake = creerAfficheur(zoneMessageSnake, { delai: 1400 });

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
  // affichage : on retient ou etait le serpent avant ce pas
  serpentAvant = serpent.map(segment => ({ x: segment.x, y: segment.y }));
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
    instantMort = horloge;                      // affichage
    eclater(tete.x, tete.y, ["#9fc43f", "#c8f060", "#2f4a12"], 26);
    dessiner();
    finDePartie("snake", score);
    return;
  }

  serpent.unshift(tete);

  if (tete.x === pomme.x && tete.y === pomme.y) {
    eclater(pomme.x, pomme.y, ["#e0412f", "#ff8a7a", "#7fbf2a"], 12);   // affichage
    texteVolant(pomme.x, pomme.y, effetActif("double") ? "+2" : "+1", "#ffffff");
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
    eclater(objet.x, objet.y, [OBJETS_SNAKE[objet.type].couleur, "#ffffff"], 14);   // affichage
    ramasserObjet(objet.type);
    objet = null;
    chronoObjet = 0;
  }
}

const boucleSnake = creerBoucle(function (delta) {
  horloge += delta;           // affichage
  majEffetsVisuels(delta);    // affichage
  if (!partieTerminee && jeuActif === "snake" && !overlayOuvert) {
    majEffets(delta);
    accumulateur += delta * 1000;
    while (accumulateur >= vitesseActuelle() && !partieTerminee) {
      accumulateur -= vitesseActuelle();
      avancer();
    }
  }

  dessiner();
}, { plafond: 0.1 });

// ---------------------------------------------------------------------
// Dessin (affichage seulement)
// Le jeu se dessine dans un repere de 600 x 600, mis a l'echelle de
// l'ecran reel pour rester net. Le jardin est peint une fois, le serpent
// et les objets par-dessus a chaque image.
// ---------------------------------------------------------------------

const COTE = TAILLE_GRILLE * TAILLE_CASE;   // 600, le repere de dessin
let echelleSnake = 1;
let jardin = null;
// Les effets tirent leur hasard a part : le hasard du jeu (pommes, objets,
// murs) reste exactement celui d'avant
let aleaVisuel = () => 0.5;

function hasardFixe(graine) {
  let a = graine >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Le canvas suit la taille affichee : net sur tous les ecrans
aleaVisuel = hasardFixe(20261019);

function ajusterResolutionSnake() {
  const rect = canvasSnake.getBoundingClientRect();
  if (rect.width < 10) {
    return;
  }
  const cible = Math.min(3, Math.max(1, (rect.width / COTE) * (window.devicePixelRatio || 1)));
  if (Math.abs(cible - echelleSnake) > 0.02 || jardin === null) {
    echelleSnake = cible;
    canvasSnake.width = Math.round(COTE * echelleSnake);
    canvasSnake.height = Math.round(COTE * echelleSnake);
    jardin = peindreJardin();
  }
}

function peindreJardin() {
  const off = document.createElement("canvas");
  off.width = off.height = Math.round(COTE * echelleSnake);
  const c = off.getContext("2d");
  c.setTransform(echelleSnake, 0, 0, echelleSnake, 0, 0);
  // Herbe : un vert profond, plus clair vers le centre
  const g = c.createLinearGradient(0, 0, 0, COTE);
  g.addColorStop(0, "#2f5a22");
  g.addColorStop(1, "#244a1b");
  c.fillStyle = g;
  c.fillRect(0, 0, COTE, COTE);
  const alea = hasardFixe(713702);
  // Grandes taches d'herbe plus claire, en aplats
  for (let i = 0; i < 9; i++) {
    c.fillStyle = i % 2 ? "rgba(120,170,70,0.12)" : "rgba(20,40,14,0.18)";
    c.beginPath();
    c.ellipse(alea() * COTE, alea() * COTE, 60 + alea() * 90, 40 + alea() * 60, alea() * 3, 0, Math.PI * 2);
    c.fill();
  }
  // Touffes d'herbe et petites fleurs, posees au hasard mais toujours au meme endroit
  for (let i = 0; i < 46; i++) {
    const x = alea() * COTE;
    const y = alea() * COTE;
    c.strokeStyle = "rgba(150,200,90,0.45)";
    c.lineWidth = 1.6;
    c.lineCap = "round";
    for (let k = -1; k <= 1; k++) {
      c.beginPath();
      c.moveTo(x + k * 3, y);
      c.quadraticCurveTo(x + k * 4, y - 6, x + k * 6, y - 9 - alea() * 3);
      c.stroke();
    }
  }
  for (let i = 0; i < 14; i++) {
    const x = alea() * COTE;
    const y = alea() * COTE;
    const couleur = ["#f4e9d6", "#ffd0e4", "#ffe38a"][i % 3];
    c.fillStyle = couleur;
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * Math.PI * 2;
      c.beginPath();
      c.arc(x + Math.cos(a) * 3, y + Math.sin(a) * 3, 2.2, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = "#e8a316";
    c.beginPath();
    c.arc(x, y, 1.6, 0, Math.PI * 2);
    c.fill();
  }
  // Bord : une bande de terre en pointilles, les bords se traversent
  c.strokeStyle = "rgba(214,190,140,0.55)";
  c.lineWidth = 3;
  c.setLineDash([TAILLE_CASE * 0.5, TAILLE_CASE * 0.5]);
  c.strokeRect(2, 2, COTE - 4, COTE - 4);
  c.setLineDash([]);
  return off;
}

// ----- Petits effets -----

function eclater(cx, cy, couleurs, nombre) {
  const x = cx * TAILLE_CASE + TAILLE_CASE / 2;
  const y = cy * TAILLE_CASE + TAILLE_CASE / 2;
  for (let i = 0; i < nombre; i++) {
    const a = aleaVisuel() * Math.PI * 2;
    const v = 80 + aleaVisuel() * 180;
    eclats.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, vie: 0.5 + aleaVisuel() * 0.35, couleur: couleurs[i % couleurs.length], taille: 3 + aleaVisuel() * 4 });
  }
}

function texteVolant(cx, cy, texte, couleur) {
  textesVolants.push({ x: cx * TAILLE_CASE + TAILLE_CASE / 2, y: cy * TAILLE_CASE, texte, couleur, age: 0 });
}

function majEffetsVisuels(delta) {
  eclats = eclats.filter(e => {
    e.vie -= delta;
    e.x += e.vx * delta;
    e.y += e.vy * delta;
    e.vy += 420 * delta;
    return e.vie > 0;
  });
  textesVolants = textesVolants.filter(t => {
    t.age += delta;
    return t.age < 0.8;
  });
}

// ----- Pieces du decor -----

function dessinerPomme(c, x, y, doree) {
  const cx = x * TAILLE_CASE + TAILLE_CASE / 2;
  const cy = y * TAILLE_CASE + TAILLE_CASE / 2 + 1;
  const r = TAILLE_CASE * 0.38 * (1 + Math.sin(horloge * 5) * 0.04);
  c.fillStyle = "rgba(0,0,0,0.3)";
  c.beginPath();
  c.ellipse(cx + 2, cy + r * 0.85, r * 0.9, r * 0.35, 0, 0, Math.PI * 2);
  c.fill();
  const g = c.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r * 1.1);
  g.addColorStop(0, doree ? "#fff3b0" : "#ff8a7a");
  g.addColorStop(0.5, doree ? "#f2b919" : "#e0412f");
  g.addColorStop(1, doree ? "#8a5d06" : "#7e1a12");
  c.fillStyle = g;
  c.beginPath();
  c.arc(cx - r * 0.25, cy, r * 0.8, 0, Math.PI * 2);
  c.arc(cx + r * 0.25, cy, r * 0.8, 0, Math.PI * 2);
  c.fill();
  // Queue et feuille
  c.strokeStyle = "#5a3a1e";
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(cx, cy - r * 0.55);
  c.quadraticCurveTo(cx + 1, cy - r * 1.1, cx + 3, cy - r * 1.2);
  c.stroke();
  c.fillStyle = "#7fbf2a";
  c.beginPath();
  c.ellipse(cx + r * 0.45, cy - r * 0.95, r * 0.42, r * 0.2, -0.5, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "rgba(255,255,255,0.7)";
  c.beginPath();
  c.ellipse(cx - r * 0.45, cy - r * 0.3, r * 0.18, r * 0.28, -0.4, 0, Math.PI * 2);
  c.fill();
}

// Chaque objet a son dessin : un medaillon vert pour un bonus, rouge pour un malus
function dessinerObjet(c, o) {
  const modele = OBJETS_SNAKE[o.type];
  const cx = o.x * TAILLE_CASE + TAILLE_CASE / 2;
  const cy = o.y * TAILLE_CASE + TAILLE_CASE / 2;
  if (o.type === "doree") {
    dessinerPomme(c, o.x, o.y, true);
    return;
  }
  const r = TAILLE_CASE * 0.44;
  c.fillStyle = "rgba(0,0,0,0.3)";
  c.beginPath();
  c.ellipse(cx + 2, cy + r * 0.9, r * 0.9, r * 0.32, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = modele.bonus ? "#c8f060" : "#ff5f56";
  c.beginPath();
  c.arc(cx, cy, r, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = modele.bonus ? "#4d6b12" : "#7e1a12";
  c.beginPath();
  c.arc(cx, cy, r * 0.78, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = "#ffffff";
  c.fillStyle = "#ffffff";
  c.lineWidth = 2;
  c.lineCap = "round";
  c.lineJoin = "round";
  const k = r * 0.42;
  c.beginPath();
  if (o.type === "ralenti") {
    // Sablier
    c.moveTo(cx - k, cy - k);
    c.lineTo(cx + k, cy - k);
    c.lineTo(cx - k, cy + k);
    c.lineTo(cx + k, cy + k);
    c.closePath();
    c.stroke();
  } else if (o.type === "double") {
    c.font = "800 " + Math.round(r * 0.95) + "px 'Anybody', sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("x2", cx, cy + 1);
  } else if (o.type === "raccourci") {
    // Ciseaux
    c.arc(cx - k * 0.6, cy + k * 0.6, k * 0.35, 0, Math.PI * 2);
    c.moveTo(cx + k * 0.6 + k * 0.35, cy + k * 0.6);
    c.arc(cx + k * 0.6, cy + k * 0.6, k * 0.35, 0, Math.PI * 2);
    c.moveTo(cx - k * 0.4, cy + k * 0.3);
    c.lineTo(cx + k * 0.6, cy - k);
    c.moveTo(cx + k * 0.4, cy + k * 0.3);
    c.lineTo(cx - k * 0.6, cy - k);
    c.stroke();
  } else if (o.type === "rapide") {
    // Eclair
    c.moveTo(cx + k * 0.3, cy - k * 1.1);
    c.lineTo(cx - k * 0.5, cy + k * 0.1);
    c.lineTo(cx + k * 0.1, cy + k * 0.1);
    c.lineTo(cx - k * 0.3, cy + k * 1.1);
    c.lineTo(cx + k * 0.6, cy - k * 0.2);
    c.lineTo(cx, cy - k * 0.2);
    c.closePath();
    c.fill();
  } else if (o.type === "inverse") {
    // Deux fleches opposees
    c.moveTo(cx - k, cy - k * 0.4);
    c.lineTo(cx + k, cy - k * 0.4);
    c.lineTo(cx + k * 0.5, cy - k * 0.9);
    c.moveTo(cx + k, cy + k * 0.4);
    c.lineTo(cx - k, cy + k * 0.4);
    c.lineTo(cx - k * 0.5, cy + k * 0.9);
    c.stroke();
  }
}

function dessinerMur(c, m) {
  // Un rocher moussu : on sait tout de suite qu'il ne se traverse pas
  const x = m.x * TAILLE_CASE;
  const y = m.y * TAILLE_CASE;
  const t = TAILLE_CASE;
  c.fillStyle = "rgba(0,0,0,0.35)";
  c.beginPath();
  c.ellipse(x + t / 2 + 2, y + t * 0.86, t * 0.46, t * 0.16, 0, 0, Math.PI * 2);
  c.fill();
  const g = c.createLinearGradient(x, y, x + t, y + t);
  g.addColorStop(0, "#b9b3a6");
  g.addColorStop(1, "#5d584f");
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(x + t * 0.08, y + t * 0.82);
  c.quadraticCurveTo(x + t * 0.02, y + t * 0.2, x + t * 0.45, y + t * 0.08);
  c.quadraticCurveTo(x + t * 0.96, y + t * 0.1, x + t * 0.94, y + t * 0.78);
  c.quadraticCurveTo(x + t * 0.5, y + t * 0.96, x + t * 0.08, y + t * 0.82);
  c.fill();
  c.fillStyle = "#6f9a3a";
  c.beginPath();
  c.ellipse(x + t * 0.4, y + t * 0.16, t * 0.26, t * 0.1, -0.2, 0, Math.PI * 2);
  c.fill();
}

// ----- Le serpent -----

// Position affichee d'un anneau : il glisse de son ancienne case a la
// nouvelle. Quand il traverse un bord, on ne l'etire pas a travers tout
// l'ecran : il saute directement.
function positionAnneau(i, t) {
  const n = serpent[i];
  const a = serpentAvant[i] || serpentAvant[serpentAvant.length - 1] || n;
  const dx = n.x - a.x;
  const dy = n.y - a.y;
  if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
    return { x: n.x, y: n.y, saut: true };
  }
  return { x: a.x + dx * t, y: a.y + dy * t, saut: false };
}

function dessinerSerpent(c, t) {
  const couleurs = effetActif("inverse")
    ? { corps: "#d94a3f", clair: "#ff8a7a", sombre: "#6e1a14", ventre: "#ffd0c8" }
    : effetActif("rapide")
      ? { corps: "#e8b52a", clair: "#ffe38a", sombre: "#7a5a08", ventre: "#fff3c4" }
      : { corps: "#7fbf2a", clair: "#c8f060", sombre: "#2f4a12", ventre: "#e6f5b0" };
  // Le corps suit le vrai chemin de cases : la tete avance vers sa
  // nouvelle case, la queue rattrape l'avant-derniere, et les angles
  // restent droits
  const A = serpentAvant.length ? serpentAvant : serpent;
  const N = serpent;
  const interp = (a, b, k) => {
    if (Math.abs(b.x - a.x) > 1 || Math.abs(b.y - a.y) > 1) {
      return { x: b.x, y: b.y, saut: true };
    }
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, saut: false };
  };
  const pts = [interp(A[0], N[0], t)];
  const grandi = N.length > A.length;
  const dernier = Math.min(A.length, N.length) - 1;
  for (let i = 0; i < dernier; i++) {
    pts.push({ x: A[i].x, y: A[i].y, saut: false });
  }
  if (dernier >= 1) {
    pts.push(grandi ? { x: A[dernier].x, y: A[dernier].y, saut: false } : interp(A[dernier], A[dernier - 1], t));
  }
  const centre = p => [p.x * TAILLE_CASE + TAILLE_CASE / 2, p.y * TAILLE_CASE + TAILLE_CASE / 2];
  const epaisseur = TAILLE_CASE * 0.78;

  // Le corps est un tube : on le trace par troncons, coupes aux bords
  const troncons = [[]];
  pts.forEach((p, i) => {
    if (i > 0 && (p.saut || Math.abs(p.x - pts[i - 1].x) > 1.01 || Math.abs(p.y - pts[i - 1].y) > 1.01)) {
      troncons.push([]);
    }
    troncons[troncons.length - 1].push(centre(p));
  });
  c.lineCap = "round";
  c.lineJoin = "round";
  const tracer = (largeur, couleur, decalage) => {
    c.strokeStyle = couleur;
    c.lineWidth = largeur;
    troncons.forEach(tr => {
      c.beginPath();
      tr.forEach(([x, y], i) => (i ? c.lineTo(x + decalage, y + decalage) : c.moveTo(x + decalage, y + decalage)));
      if (tr.length === 1) {
        c.lineTo(tr[0][0] + decalage + 0.1, tr[0][1] + decalage);
      }
      c.stroke();
    });
  };
  tracer(epaisseur, "rgba(0,0,0,0.3)", 3);
  tracer(epaisseur, couleurs.sombre, 0);
  tracer(epaisseur * 0.82, couleurs.corps, 0);
  tracer(epaisseur * 0.3, couleurs.clair, -epaisseur * 0.12);

  // Ecailles : une rangee de taches sombres le long du dos, en aplats
  c.fillStyle = couleurs.sombre;
  pts.forEach((p, i) => {
    if (i === 0 || i % 2) {
      return;
    }
    const [x, y] = centre(p);
    c.beginPath();
    c.ellipse(x, y, epaisseur * 0.16, epaisseur * 0.12, 0, 0, Math.PI * 2);
    c.fill();
  });

  // Tete
  const [hx, hy] = centre(pts[0]);
  const dir = direction;
  const angle = Math.atan2(dir.y, dir.x);
  const mort = partieTerminee;
  c.save();
  c.translate(hx, hy);
  c.rotate(angle);
  const r = TAILLE_CASE * 0.5;
  c.fillStyle = couleurs.sombre;
  c.beginPath();
  c.ellipse(2, 0, r * 1.05, r * 0.88, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = couleurs.corps;
  c.beginPath();
  c.ellipse(2, 0, r * 0.92, r * 0.76, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = couleurs.clair;
  c.beginPath();
  c.ellipse(0, -r * 0.3, r * 0.5, r * 0.18, 0, 0, Math.PI * 2);
  c.fill();

  // Langue qui sort de temps en temps, et toujours pres de la pomme
  const tete = serpent[0];
  const pres = Math.abs(tete.x - pomme.x) + Math.abs(tete.y - pomme.y) <= 2;
  if (!mort && (pres || Math.sin(horloge * 3) > 0.85)) {
    c.strokeStyle = "#d9302a";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(r * 0.9, 0);
    c.lineTo(r * 1.45, 0);
    c.lineTo(r * 1.65, -r * 0.18);
    c.moveTo(r * 1.45, 0);
    c.lineTo(r * 1.65, r * 0.18);
    c.stroke();
  }

  // Yeux : ils regardent devant, se ferment en croix a la mort
  [-1, 1].forEach(cote => {
    const ex = r * 0.32;
    const ey = cote * r * 0.42;
    if (mort) {
      c.strokeStyle = "#1a1018";
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(ex - 4, ey - 4);
      c.lineTo(ex + 4, ey + 4);
      c.moveTo(ex + 4, ey - 4);
      c.lineTo(ex - 4, ey + 4);
      c.stroke();
      return;
    }
    const cligne = Math.sin(horloge * 0.9 + 1.3) > 0.985;
    c.fillStyle = "#ffffff";
    c.beginPath();
    c.ellipse(ex, ey, r * 0.24, cligne ? r * 0.04 : r * 0.22, 0, 0, Math.PI * 2);
    c.fill();
    if (!cligne) {
      c.fillStyle = "#1a1018";
      c.beginPath();
      c.arc(ex + r * 0.08, ey, r * 0.12, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#ffffff";
      c.beginPath();
      c.arc(ex + r * 0.12, ey - r * 0.06, r * 0.04, 0, Math.PI * 2);
      c.fill();
    }
  });
  c.restore();
}

function dessiner() {
  ajusterResolutionSnake();
  const c = canvasSnake.getContext("2d");
  c.setTransform(echelleSnake, 0, 0, echelleSnake, 0, 0);
  if (jardin) {
    c.drawImage(jardin, 0, 0, COTE, COTE);
  }

  // Avancement entre deux cases (0 au pas precedent, 1 au prochain)
  const t = partieTerminee ? 1 : Math.min(1, accumulateur / vitesseActuelle());

  murs.forEach(m => dessinerMur(c, m));
  dessinerPomme(c, pomme.x, pomme.y, false);

  // Objet en attente, qui clignote quand il va disparaitre
  if (objet !== null && (objet.restant > 2 || Math.floor(objet.restant * 6) % 2 === 0)) {
    dessinerObjet(c, objet);
  }

  // A la mort, le serpent tremble un instant
  if (partieTerminee) {
    const k = Math.max(0, 0.35 - (horloge - instantMort));
    c.translate((aleaVisuel() - 0.5) * 10 * k, (aleaVisuel() - 0.5) * 10 * k);
  }
  dessinerSerpent(c, t);
  c.setTransform(echelleSnake, 0, 0, echelleSnake, 0, 0);

  eclats.forEach(e => {
    c.globalAlpha = Math.min(1, e.vie * 3);
    c.fillStyle = e.couleur;
    c.fillRect(e.x - e.taille / 2, e.y - e.taille / 2, e.taille, e.taille);
  });
  c.globalAlpha = 1;
  textesVolants.forEach(tv => {
    c.globalAlpha = 1 - tv.age / 0.8;
    c.font = "800 22px 'Anybody', sans-serif";
    c.textAlign = "center";
    c.lineWidth = 4;
    c.strokeStyle = "#1a2a10";
    c.strokeText(tv.texte, tv.x, tv.y - tv.age * 40);
    c.fillStyle = tv.couleur;
    c.fillText(tv.texte, tv.x, tv.y - tv.age * 40);
  });
  c.globalAlpha = 1;

  if (partieTerminee && horloge - instantMort > 0.4) {
    c.fillStyle = "rgba(14, 18, 10, 0.72)";
    c.fillRect(0, 0, COTE, COTE);
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.lineJoin = "round";
    c.font = "800 84px 'Anybody', Impact, sans-serif";
    c.lineWidth = 10;
    c.strokeStyle = "#1a2a10";
    c.strokeText("GAME OVER", COTE / 2, COTE / 2 - 30);
    c.fillStyle = "#c8f060";
    c.fillText("GAME OVER", COTE / 2, COTE / 2 - 30);
    c.font = "600 18px 'Martian Mono', monospace";
    c.fillStyle = "#ede8df";
    c.fillText(score + (score > 1 ? " points" : " point") + "  ·  " + pommesMangees + (pommesMangees > 1 ? " pommes" : " pomme"), COTE / 2, COTE / 2 + 34);
    c.fillStyle = "#9fc43f";
    c.font = "600 14px 'Martian Mono', monospace";
    c.fillText("N pour rejouer", COTE / 2, COTE / 2 + 66);
  }
}

window.addEventListener("resize", function () {
  jardin = null;
});

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

surTouche("snake", function (evenement) {
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

surGlissement(canvasSnake, function (geste) {
  if (geste.tape) {
    return;
  }
  if (geste.horizontal) {
    changerDirection(geste.deltaX > 0 ? 1 : -1, 0);
  } else {
    changerDirection(0, geste.deltaY > 0 ? 1 : -1);
  }
}, { actif: () => !overlayOuvert });

boutonQuitterJeu.addEventListener("click", quitterJeu);

// ===== Inscription dans l'arcade =====
enregistrerJeu({
  id: "snake",
  nom: "Snake",
  code: "713702",
  section: zoneJeu,
  demarrer: demarrerPartie,
  arreter: () => boucleSnake.arreter(),
  // Sur telephone : la croix dirige, Start relance une partie
  manette: { a: "n", start: "n", quatreDirections: true, libelles: { a: "Rejouer" } }
});