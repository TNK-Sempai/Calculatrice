// =====================================================================
//  KOI-KOI - 花札
//  Le jeu de hanafuda a deux : on associe les cartes du meme mois pour
//  former des combinaisons (yaku). Des qu'un yaku tombe, il faut choisir :
//  s'arreter et encaisser, ou annoncer « koi-koi » et tenter plus gros,
//  au risque de voir l'adversaire marquer double.
//  Partie de 6 ou 12 mois contre l'IA. Score : total de tes points.
// =====================================================================

import { enregistrerJeu, finDePartie, quitterJeu, majScoreCourant } from "./arcade.js";
import { surTouche } from "./noyau/clavier.js";
import { creerBoutonsChoix, marquerChoixActif } from "./noyau/choix.js";
import { creerStockage } from "./noyau/stockage.js";
import { jouer as jouerSon, basculerSon, sonActif } from "./noyau/son.js";
import { CARTES, MOIS, TYPES, IMAGES, IMAGE_DOS } from "./koikoi/cartes.js";
import {
  YAKU, yakuDe, avancement, pointsDeManche,
  correspondances, prisePour, meilleureCible, choisirCarte, decisionKoi
} from "./koikoi/regles.js";

const ID = "koikoi";
const CLASSEMENT = "koikoi";
const DUREES = [
  { id: "6", nom: "6 mois" },
  { id: "12", nom: "12 mois" }
];
const MOI = 0;
const IA = 1;

// ---------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------

const zone = document.createElement("section");
zone.className = "jeu jeu-koikoi";
zone.id = "jeuKoikoi";
zone.hidden = true;
zone.innerHTML = `
  <div class="jeu-entete entete-koikoi">
    <span class="jeu-score score-principal">Toi <strong class="valeur-score" id="totalKoi">0</strong></span>
    <span class="jeu-score">IA <strong id="totalIaKoi">0</strong></span>
    <span class="jeu-score">Mois <strong id="moisKoi">1 / 6</strong></span>
    <span class="entete-boutons">
      <button class="jeu-quitter" id="tutoKoi" type="button">Apprendre</button>
      <button class="jeu-quitter" id="aideKoi" type="button">Yaku</button>
      <button class="jeu-quitter" id="sonKoi" type="button">Son</button>
      <button class="jeu-quitter" id="nouvelleKoi" type="button">Rejouer</button>
      <button class="jeu-quitter" id="quitterKoi" type="button">Retour</button>
    </span>
  </div>
  <div class="scores-ligne" id="dureesKoi"></div>
  <div class="tuto-koikoi" id="tutoBulleKoi" hidden></div>
  <div class="table-koikoi" id="tableKoi">
    <div class="rangee-prises" id="prisesIaKoi"></div>
    <div class="rangee-ia">
      <div class="main-ia" id="mainIaKoi"></div>
      <div class="pioche-koikoi" id="piocheKoi"></div>
    </div>
    <div class="terrain-koikoi" id="terrainKoi"></div>
    <div class="rangee-prises" id="prisesMoiKoi"></div>
    <div class="main-koikoi" id="mainKoi"></div>
    <div class="panneau-koikoi" id="panneauKoi" hidden></div>
    <div class="aide-yaku" id="yakuKoi" hidden></div>
  </div>
  <p class="jeu-message" id="messageKoi"></p>
  <p class="jeu-aide">Touche une carte de ta main pour la choisir, touche-la encore (ou la carte du terrain visée) pour la jouer. Flèches gauche et droite pour choisir, Espace ou Entrée pour jouer, H pour l'aide des yaku. Au moment de décider : K koi-koi, S stop. N rejouer, M son, Échap quitter.</p>`;
document.body.appendChild(zone);

const zoneTotal = document.getElementById("totalKoi");
const zoneTotalIa = document.getElementById("totalIaKoi");
const zoneMois = document.getElementById("moisKoi");
const zoneDurees = document.getElementById("dureesKoi");
const zonePrisesIa = document.getElementById("prisesIaKoi");
const zoneMainIa = document.getElementById("mainIaKoi");
const zonePioche = document.getElementById("piocheKoi");
const zoneTerrain = document.getElementById("terrainKoi");
const zonePrisesMoi = document.getElementById("prisesMoiKoi");
const zoneMain = document.getElementById("mainKoi");
const zonePanneau = document.getElementById("panneauKoi");
const zoneYaku = document.getElementById("yakuKoi");
const zoneMessage = document.getElementById("messageKoi");
const boutonSon = document.getElementById("sonKoi");

// ---------------------------------------------------------------------
// Une carte = un element cree une fois, deplace d'une rangee a l'autre
// ---------------------------------------------------------------------

const ELEMENTS = CARTES.map(carte => {
  const element = document.createElement("div");
  element.className = "carte-koikoi";
  element.dataset.carte = carte.id;
  element.title = carte.nom;
  const image = document.createElement("img");
  image.src = IMAGES[carte.id];
  image.alt = carte.nom;
  image.draggable = false;
  element.appendChild(image);
  const mois = document.createElement("span");
  mois.className = "carte-mois";
  mois.textContent = MOIS[carte.mois].kanji;
  element.appendChild(mois);
  if (TYPES[carte.type].kanji) {
    const type = document.createElement("span");
    type.className = "carte-type type-" + carte.type;
    type.textContent = TYPES[carte.type].kanji;
    element.appendChild(type);
  }
  return element;
});

function dos() {
  const element = document.createElement("div");
  element.className = "carte-koikoi dos";
  const image = document.createElement("img");
  image.src = IMAGE_DOS;
  image.alt = "";
  image.draggable = false;
  element.appendChild(image);
  return element;
}

// ---------------------------------------------------------------------
// Etat
// ---------------------------------------------------------------------

const stockageDuree = creerStockage("tanuki-arcade-koikoi-duree");
let duree = DUREES.find(d => d.id === stockageDuree.lireTexte()) || DUREES[0];

let pioche = [];
let terrain = [];            // emplacements fixes, null = vide
let mains = [[], []];
let prises = [[], []];
let totaux = [0, 0];
let koi = [false, false];
let moisCourant = 0;
let oya = MOI;
let tour = MOI;

let selection = 0;           // index dans ma main
let options = [];            // cartes du terrain entre lesquelles choisir
let curseurOption = 0;
let choixDecision = 0;       // 0 koi-koi, 1 stop
let carteJouee = -1;         // carte posee en surbrillance sur le terrain
let attente = null;          // { type, resoudre }
let generation = 0;
let aideOuverte = false;
let derniersYaku = [new Set(), new Set()];

class Annulation {}

function pause(ms) {
  const g = generation;
  return new Promise((ok, ko) => setTimeout(() => (g === generation ? ok() : ko(new Annulation())), ms));
}

// Attend une action du joueur : "main", "cible", "decision" ou "suite"
function attendre(type) {
  const g = generation;
  return new Promise((ok, ko) => {
    attente = {
      type,
      resoudre(valeur) {
        attente = null;
        if (g === generation) {
          ok(valeur);
        } else {
          ko(new Annulation());
        }
      }
    };
    rendre();
  });
}

function melanger(liste) {
  for (let i = liste.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [liste[i], liste[j]] = [liste[j], liste[i]];
  }
  return liste;
}

function cartesTerrain() {
  return terrain.filter(c => c !== null);
}

function ajouterAuTerrain(carte) {
  const trou = terrain.indexOf(null);
  if (trou >= 0) {
    terrain[trou] = carte;
  } else {
    terrain.push(carte);
  }
}

function retirerDuTerrain(carte) {
  const i = terrain.indexOf(carte);
  if (i >= 0) {
    terrain[i] = null;
  }
}

function afficher(texte) {
  zoneMessage.textContent = texte;
}

function nomYaku(id) {
  return YAKU.find(y => y.id === id).nom;
}

function detailYaku(pile) {
  const { liste, total } = yakuDe(pile);
  return { texte: liste.map(y => nomYaku(y.id) + " " + y.points).join(" + "), total };
}

// ---------------------------------------------------------------------
// Rendu
// ---------------------------------------------------------------------

const ORDRE_TYPES = ["lumiere", "animal", "ruban", "kasu"];

function rendrePrises(conteneur, camp) {
  conteneur.replaceChildren();
  const etiquette = document.createElement("div");
  etiquette.className = "prises-etiquette";
  const { total } = yakuDe(prises[camp]);
  etiquette.innerHTML = `<strong>${camp === MOI ? "Toi" : "IA"}</strong><span>${total} pt${total > 1 ? "s" : ""}</span>` +
    (koi[camp] ? `<em>koi-koi</em>` : "");
  conteneur.appendChild(etiquette);
  for (const type of ORDRE_TYPES) {
    const cartes = prises[camp].filter(c => CARTES[c].type === type).sort((a, b) => a - b);
    const groupe = document.createElement("div");
    groupe.className = "prises-groupe";
    groupe.dataset.type = type;
    for (const c of cartes) {
      ELEMENTS[c].className = "carte-koikoi";
      groupe.appendChild(ELEMENTS[c]);
    }
    if (cartes.length > 0) {
      const compte = document.createElement("span");
      compte.className = "prises-compte";
      compte.textContent = cartes.length;
      groupe.appendChild(compte);
    }
    conteneur.appendChild(groupe);
  }
}

// ---------------------------------------------------------------------
// Mouvements des cartes : chaque rendu compare la place de chaque carte
// avant et apres, puis la fait glisser de l'une a l'autre. Une carte qui
// arrive de la pioche ou de la main cachee de l'IA part de la et se
// retourne en chemin.
// ---------------------------------------------------------------------

const provenances = new Map();   // id -> { rect, delai, retourner }

function provenir(id, element, delai, retourner) {
  if (element) {
    provenances.set(id, { rect: element.getBoundingClientRect(), delai: delai || 0, retourner: retourner === true });
  }
}

function photographier() {
  const avant = new Map();
  ELEMENTS.forEach((e, i) => {
    if (e.isConnected) {
      avant.set(i, e.getBoundingClientRect());
    }
  });
  return avant;
}

function animerDeplacements(avant) {
  if (!zone.isConnected || zone.hidden) {
    provenances.clear();
    return;
  }
  ELEMENTS.forEach((e, i) => {
    if (!e.isConnected) {
      return;
    }
    const venue = provenances.get(i);
    const depart = venue ? venue.rect : avant.get(i);
    if (!depart) {
      return;
    }
    const arrivee = e.getBoundingClientRect();
    if (arrivee.width === 0) {
      return;
    }
    const dx = depart.left + depart.width / 2 - (arrivee.left + arrivee.width / 2);
    const dy = depart.top + depart.height / 2 - (arrivee.top + arrivee.height / 2);
    const k = depart.width / arrivee.width;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(k - 1) < 0.02) {
      return;
    }
    const debut = `translate(${dx}px, ${dy}px) scale(${k})`;
    const images = venue && venue.retourner
      ? [{ transform: debut + " scaleX(1)", filter: "brightness(0.35)" }, { transform: `translate(${dx * 0.5}px, ${dy * 0.5}px) scale(${(k + 1) / 2}) scaleX(0.04)`, filter: "brightness(0.35)", offset: 0.45 }, { transform: "none", filter: "none" }]
      : [{ transform: debut }, { transform: "none" }];
    e.style.zIndex = "5";
    const anim = e.animate(images, { duration: venue && venue.retourner ? 460 : 320, delay: venue ? venue.delai : 0, easing: "cubic-bezier(0.22, 0.8, 0.3, 1)", fill: "backwards" });
    anim.onfinish = () => {
      e.style.zIndex = "";
    };
  });
  provenances.clear();
}

function rendre() {
  const photo = photographier();
  rendreTable();
  ciblesTuto.forEach(id => ELEMENTS[id].classList.add("tuto-cible"));
  animerDeplacements(photo);
}

// ---------------------------------------------------------------------
// Tutoriel : une donne preparee, on joue vraiment les cartes
// ---------------------------------------------------------------------

const stockageTuto = creerStockage("tanuki-arcade-tuto-koikoi");
const zoneBulle = document.getElementById("tutoBulleKoi");
let ciblesTuto = new Set();
let bulleBoutons = [];

function imagesCartes(ids, avecNoms) {
  return `<span class="tuto-cartes">${ids.map(id => `<span class="tuto-carte"><img src="${IMAGES[id]}" alt="${CARTES[id].nom}">${avecNoms ? `<small>${avecNoms(id)}</small>` : ""}</span>`).join("")}</span>`;
}

// Affiche la bulle ; avec des boutons, rend une promesse resolue au clic
function bulle(etape, titre, texte, options) {
  const o = options || {};
  zoneBulle.hidden = false;
  zoneBulle.innerHTML = `<div class="tuto-tete"><strong>${etape ? etape + "  " : ""}${titre}</strong>` +
    (o.sansPasser ? "" : `<button type="button" class="jeu-quitter tuto-passer">Passer le tuto</button>`) + `</div>` +
    `<p>${texte}</p>${o.contenu || ""}<div class="tuto-boutons"></div>`;
  const passer = zoneBulle.querySelector(".tuto-passer");
  if (passer) {
    passer.addEventListener("click", quitterTuto);
  }
  bulleBoutons = [];
  ajusterTable();
  if (!o.boutons) {
    return Promise.resolve();
  }
  const g = generation;
  return new Promise((ok, ko) => {
    const rangee = zoneBulle.querySelector(".tuto-boutons");
    o.boutons.forEach(b => {
      const bouton = document.createElement("button");
      bouton.type = "button";
      bouton.className = "jeu-quitter difficulte" + (b.principal ? " active" : "");
      bouton.textContent = b.texte;
      const agir = () => {
        if (g !== generation) {
          ko(new Annulation());
          return;
        }
        jouerSon("clic");
        bulleBoutons = [];
        ok(b.valeur);
      };
      bouton.addEventListener("click", agir);
      bulleBoutons.push({ principal: b.principal, agir });
      rangee.appendChild(bouton);
    });
  });
}

function cacherBulle() {
  zoneBulle.hidden = true;
  zoneBulle.innerHTML = "";
  bulleBoutons = [];
}

function quitterTuto() {
  stockageTuto.ecrire({ vu: true });
  cacherBulle();
  ciblesTuto = new Set();
  demarrer();
}

function preparerDonne(main, table, prisesMoi, dessus) {
  mains = [main.slice(), [40, 43, 45, 7, 11, 15, 19, 23].slice(0, main.length)];
  terrain = table.slice();
  const utilisees = new Set([...main, ...table, ...prisesMoi, ...mains[IA], dessus]);
  pioche = CARTES.map(c => c.id).filter(id => !utilisees.has(id)).slice(0, 10).concat([dessus]);
  prises = [prisesMoi.slice(), []];
  koi = [false, false];
  carteJouee = -1;
  selection = 0;
  derniersYaku = [new Set(prisesMoi.length ? [] : []), new Set()];
}

// Attend que le joueur joue la carte attendue
async function jouerLaCarte(attendue, rappel) {
  for (;;) {
    selection = Math.max(0, mains[MOI].indexOf(attendue));
    const { carte, cible } = await attendre("main");
    if (carte === attendue) {
      ciblesTuto = new Set();
      mains[MOI].splice(mains[MOI].indexOf(carte), 1);
      await poser(MOI, carte, cible);
      return;
    }
    afficher(rappel);
    jouerSon("clic");
  }
}

async function tutoriel() {
  stockageTuto.ecrire({ vu: true });
  generation++;
  attente = null;
  contenuPanneau = null;
  zoneAnnonce.hidden = true;
  const total = 6;
  try {
    // 1. Le jeu de cartes
    mains = [[], []];
    terrain = [];
    pioche = [];
    prises = [[], []];
    rendre();
    afficher("");
    await bulle("1 / " + total, "Douze mois, quatre cartes",
      "Le hanafuda compte 48 cartes : 12 mois de 4 cartes. Chaque mois a sa plante, et le petit chiffre en coin rappelle le mois. Pas de couleurs ni de valeurs comme aux cartes françaises : seul le mois compte pour prendre.",
      { contenu: imagesCartes(MOIS.map((m, i) => i * 4), id => MOIS[CARTES[id].mois].nom), boutons: [{ texte: "Suivant", valeur: true, principal: true }] });

    // 2. Les quatre types
    await bulle("2 / " + total, "Quatre sortes de cartes",
      "Dans chaque mois, les cartes ne se valent pas : les lumières (les plus rares), les animaux, les rubans, et les kasu, les cartes simples. Elles servent à former des combinaisons, les yaku.",
      { contenu: imagesCartes([0, 4, 1, 2], id => ({ lumiere: "Lumière", animal: "Animal", ruban: "Ruban", kasu: "Kasu" })[CARTES[id].type]), boutons: [{ texte: "Suivant", valeur: true, principal: true }] });

    // 3. Capturer, puis piocher
    preparerDonne([13, 18, 41], [12, 25, 30, 44, 2, 39, 6, 46], [], 26);
    ciblesTuto = new Set([13, 12]);
    rendre();
    bulle("3 / " + total, "Prendre une carte",
      "À ton tour, joue une carte de ta main sur une carte du même mois du terrain : tu prends les deux. Ton ruban de la glycine (avril) va avec la carte entourée : joue-le.");
    afficher("Joue la carte entourée de ta main.");
    await jouerLaCarte(13, "Celle-ci ne prend rien : joue la carte entourée.");
    await bulle("3 / " + total, "Puis on pioche",
      "Ensuite, tu retournes toujours la carte du dessus de la pioche. Si elle est du même mois qu'une carte du terrain, tu la prends aussi. Regarde.");
    await pause(900);
    const tiree = pioche.pop();
    provenir(tiree, zonePioche.querySelector(".carte-koikoi") || zonePioche, 0, true);
    afficher("Tu retournes " + CARTES[tiree].nom + ".");
    await poser(MOI, tiree, undefined);
    afficher("");
    await bulle("3 / " + total, "Bien joué",
      "Quatre cartes prises en un tour. Une carte jouée qui ne va avec rien reste simplement sur le terrain, à la merci de l'adversaire.",
      { boutons: [{ texte: "Suivant", valeur: true, principal: true }] });

    // 4. Former un yaku
    preparerDonne([9, 16, 33], [10, 20, 29, 36, 42, 3, 47, 14], [1, 5], 27);
    ciblesTuto = new Set([9, 10]);
    rendre();
    bulle("4 / " + total, "Former un yaku",
      "Tu as déjà pris deux rubans à poème rouges (en bas). Le troisième, celui du cerisier, forme le yaku Akatan. Joue-le sur la carte de mars.");
    afficher("Joue le ruban à poème du cerisier.");
    await jouerLaCarte(9, "Joue plutôt le ruban à poème entouré.");
    await pause(300);
    afficher("");
    await annoncerYaku(MOI);

    // 5. Koi-koi ou stop
    const { texte: detail, total: points } = detailYaku(prises[MOI]);
    choixDecision = 0;
    contenuPanneau = {
      titre: "Yaku !",
      lignes: [detail + " = " + points + " points.", "Koi-koi : tu continues pour marquer plus. Stop : tu encaisses maintenant."],
      boutons: [{ texte: "Koi-koi", valeur: false }, { texte: "Stop", valeur: true }]
    };
    bulle("5 / " + total, "Koi-koi ou stop ?",
      "Dès que tu formes un yaku, tu choisis : t'arrêter et marquer, ou annoncer koi-koi pour viser plus haut. Choisis pour voir.");
    const stop = await attendre("decision");
    contenuPanneau = null;
    rendre();
    await bulle("5 / " + total, stop ? "Stop : la prudence" : "Koi-koi : le pari",
      stop
        ? "Tu encaisses tes points et le mois s'arrête. Une manche à 7 points ou plus compte double."
        : "Tu continues pour former d'autres yaku. Mais si l'IA forme un yaku avant que tu t'arrêtes, c'est elle qui marque, et double. Un bon koi-koi se tente quand ta main est forte.",
      { boutons: [{ texte: "Suivant", valeur: true, principal: true }] });

    // 6. Les principaux yaku
    const groupe = (titre, ids, pts) => `<div class="tuto-yaku"><strong>${titre}</strong> <em>${pts}</em>${imagesCartes(ids)}</div>`;
    await bulle("6 / " + total, "Les yaku à connaître",
      "Les plus utiles. Le bouton Yaku, pendant la partie, montre ton avancement sur chacun.",
      {
        contenu: groupe("Sankō : 3 lumières", [0, 8, 28], "5 pts") + groupe("Inoshikachō : sanglier, cerf, papillons", [24, 36, 20], "5 pts") +
          groupe("Hanami : rideau et saké", [8, 32], "5 pts") + groupe("Tsukimi : lune et saké", [28, 32], "5 pts") +
          groupe("Akatan : 3 rubans à poème", [1, 5, 9], "5 pts") + groupe("Aotan : 3 rubans bleus", [21, 33, 37], "5 pts") +
          `<p class="tuto-note">Et les plus simples : 5 animaux (Tane), 5 rubans (Tan) ou 10 kasu valent 1 point, plus 1 par carte en plus.</p>`,
        boutons: [{ texte: "Suivant", valeur: true, principal: true }]
      });

    const choix = await bulle("", "Prêt !",
      "Tu connais l'essentiel : prendre par mois, piocher, former des yaku, puis koi-koi ou stop. Une partie se joue sur 6 ou 12 mois contre l'IA.",
      { sansPasser: true, boutons: [{ texte: "Revoir", valeur: "revoir" }, { texte: "Jouer", valeur: "jouer", principal: true }] });
    if (choix === "revoir") {
      tutoriel();
      return;
    }
    quitterTuto();
  } catch (erreur) {
    if (!(erreur instanceof Annulation)) {
      throw erreur;
    }
  }
}

function proposerTuto() {
  generation++;
  attente = null;
  mains = [[], []];
  terrain = [];
  pioche = [];
  prises = [[], []];
  rendre();
  afficher("");
  bulle("", "Première visite",
    "Le koi-koi se joue avec des cartes japonaises, le hanafuda, peu connues en Europe. Quelques minutes pour apprendre en jouant ?",
    { sansPasser: true, boutons: [{ texte: "Plus tard", valeur: false }, { texte: "Apprendre", valeur: true, principal: true }] })
    .then(oui => {
      if (oui) {
        tutoriel();
      } else {
        quitterTuto();
      }
    })
    .catch(() => {});
}

function rendreTable() {
  const typeAttente = attente ? attente.type : "";
  const enMain = mains[MOI];
  if (selection >= enMain.length) {
    selection = Math.max(0, enMain.length - 1);
  }
  const carteChoisie = typeAttente === "main" ? enMain[selection] : -1;
  const visees = carteChoisie >= 0 ? correspondances(cartesTerrain(), carteChoisie) : [];

  // Main de l'IA, de dos
  zoneMainIa.replaceChildren();
  for (let k = 0; k < mains[IA].length; k++) {
    zoneMainIa.appendChild(dos());
  }
  // Pioche
  zonePioche.replaceChildren();
  if (pioche.length > 0) {
    zonePioche.appendChild(dos());
  }
  const reste = document.createElement("span");
  reste.className = "pioche-compte";
  reste.textContent = pioche.length;
  zonePioche.appendChild(reste);

  // Terrain : au moins 8 emplacements pour garder la table stable
  zoneTerrain.replaceChildren();
  const emplacements = Math.max(8, terrain.length);
  for (let i = 0; i < emplacements; i++) {
    const c = i < terrain.length ? terrain[i] : null;
    if (c === null) {
      const vide = document.createElement("div");
      vide.className = "carte-koikoi vide";
      zoneTerrain.appendChild(vide);
      continue;
    }
    const element = ELEMENTS[c];
    element.className = "carte-koikoi";
    element.classList.toggle("visee", visees.includes(c) || (typeAttente === "cible" && options.includes(c)));
    element.classList.toggle("curseur", typeAttente === "cible" && options[curseurOption] === c);
    element.classList.toggle("jouee", c === carteJouee);
    zoneTerrain.appendChild(element);
  }

  // Ma main
  zoneMain.replaceChildren();
  const surTable = cartesTerrain();
  enMain.forEach((c, i) => {
    const element = ELEMENTS[c];
    element.className = "carte-koikoi";
    element.classList.toggle("choisie", typeAttente === "main" && i === selection);
    element.classList.toggle("assortie", correspondances(surTable, c).length > 0);
    zoneMain.appendChild(element);
  });
  zoneMain.classList.toggle("attend", typeAttente === "main");

  rendrePrises(zonePrisesIa, IA);
  rendrePrises(zonePrisesMoi, MOI);

  zoneTotal.textContent = totaux[MOI];
  zoneTotalIa.textContent = totaux[IA];
  zoneMois.textContent = Math.min(moisCourant + 1, Number(duree.id)) + " / " + duree.id;

  rendrePanneau(typeAttente);
  if (aideOuverte) {
    rendreAide();
  }
}

// Panneau de decision (koi-koi ou stop) et de fin de manche
let contenuPanneau = null;   // { titre, lignes, boutons: [{ texte, valeur }] }

function rendrePanneau(typeAttente) {
  const visible = (typeAttente === "decision" || typeAttente === "suite") && contenuPanneau;
  zonePanneau.hidden = !visible;
  if (!visible) {
    return;
  }
  zonePanneau.replaceChildren();
  const boite = document.createElement("div");
  boite.className = "panneau-boite";
  const titre = document.createElement("h3");
  titre.textContent = contenuPanneau.titre;
  boite.appendChild(titre);
  for (const ligne of contenuPanneau.lignes) {
    const p = document.createElement("p");
    p.textContent = ligne;
    boite.appendChild(p);
  }
  const rangee = document.createElement("div");
  rangee.className = "panneau-boutons";
  contenuPanneau.boutons.forEach((b, i) => {
    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.className = "jeu-quitter difficulte";
    bouton.classList.toggle("active", typeAttente === "suite" || i === choixDecision);
    bouton.textContent = b.texte;
    bouton.addEventListener("click", () => {
      if (attente && attente.type === typeAttente) {
        jouerSon("clic");
        attente.resoudre(b.valeur);
      }
    });
    rangee.appendChild(bouton);
  });
  boite.appendChild(rangee);
  zonePanneau.appendChild(boite);
}

// Aide : avancement de chaque yaku pour les deux joueurs, et les mois
function rendreAide() {
  const moi = avancement(prises[MOI]);
  const ia = avancement(prises[IA]);
  const formesMoi = new Set(yakuDe(prises[MOI]).liste.map(y => y.id));
  const formesIa = new Set(yakuDe(prises[IA]).liste.map(y => y.id));
  let html = `<div class="aide-entete"><h3>Yaku</h3><button class="jeu-quitter" type="button" data-fermer>Fermer</button></div>
    <table><thead><tr><th>Yaku</th><th>Points</th><th>Toi</th><th>IA</th></tr></thead><tbody>`;
  for (const y of YAKU) {
    const [cm, bm] = moi[y.id];
    const [ci, bi] = ia[y.id];
    const classeMoi = formesMoi.has(y.id) ? "forme" : cm > 0 ? "proche" : "";
    const classeIa = formesIa.has(y.id) ? "forme" : ci > 0 ? "proche" : "";
    html += `<tr><td><span class="aide-kanji">${y.kanji}</span> <strong>${y.nom}</strong><small>${y.regle}</small></td><td>${y.points}</td>` +
      `<td class="${classeMoi}">${Math.min(cm, bm)}/${bm}</td><td class="${classeIa}">${Math.min(ci, bi)}/${bi}</td></tr>`;
  }
  html += `</tbody></table>
    <p class="aide-note">Une manche à 7 points ou plus compte double, et double encore si l'adversaire avait annoncé koi-koi. Les cartes que tu as déjà prises sont en couleur ci-dessous.</p>
    <div class="aide-mois">`;
  MOIS.forEach((m, i) => {
    html += `<div class="aide-colonne"><span>${m.kanji} ${m.nom}</span><div>`;
    for (let k = 0; k < 4; k++) {
      const id = i * 4 + k;
      const prise = prises[MOI].includes(id) ? " prise" : "";
      html += `<img class="aide-carte${prise}" src="${IMAGES[id]}" alt="${CARTES[id].nom}" title="${CARTES[id].nom}">`;
    }
    html += `</div></div>`;
  });
  html += `</div>`;
  zoneYaku.innerHTML = html;
  zoneYaku.querySelector("[data-fermer]").addEventListener("click", basculerAide);
}

function basculerAide() {
  aideOuverte = !aideOuverte;
  zoneYaku.hidden = !aideOuverte;
  if (aideOuverte) {
    rendreAide();
    zoneYaku.scrollTop = 0;
  }
}


// ---------------------------------------------------------------------
// Annonce d'un yaku : son nom en grand, ses cartes, ses points
// ---------------------------------------------------------------------

const CARTES_DU_YAKU = {
  hanami: [8, 32], tsukimi: [28, 32], inoshikacho: [24, 20, 36], akatan: [1, 5, 9], aotan: [21, 33, 37]
};

function cartesDuYaku(id, pile) {
  if (CARTES_DU_YAKU[id]) {
    return CARTES_DU_YAKU[id].filter(c => pile.includes(c));
  }
  const type = ["goko", "shiko", "ameshiko", "sanko"].includes(id) ? "lumiere" : id === "tane" ? "animal" : id === "tan" ? "ruban" : "kasu";
  return pile.filter(c => CARTES[c].type === type);
}

const zoneAnnonce = document.createElement("div");
zoneAnnonce.className = "annonce-yaku";
zoneAnnonce.hidden = true;
document.getElementById("tableKoi").appendChild(zoneAnnonce);

async function annoncerYaku(camp) {
  const { liste } = yakuDe(prises[camp]);
  const nouveaux = liste.filter(y => !derniersYaku[camp].has(y.id + ":" + y.points));
  liste.forEach(y => derniersYaku[camp].add(y.id + ":" + y.points));
  const y = (nouveaux.length ? nouveaux : liste).slice(-1)[0];
  if (!y) {
    return;
  }
  const def = YAKU.find(d => d.id === y.id);
  const cartes = cartesDuYaku(y.id, prises[camp]).slice(0, 10);
  zoneAnnonce.innerHTML = `<div class="annonce-boite ${camp === MOI ? "moi" : "ia"}">` +
    `<span class="annonce-qui">${camp === MOI ? "Tu formes" : "L'IA forme"}</span>` +
    `<strong class="annonce-kanji" lang="ja">${def.kanji}</strong>` +
    `<span class="annonce-nom">${def.nom}</span>` +
    `<span class="annonce-cartes">${cartes.map((c, i) => `<img src="${IMAGES[c]}" alt="${CARTES[c].nom}" style="animation-delay:${200 + i * 70}ms">`).join("")}</span>` +
    `<span class="annonce-points">${y.points} point${y.points > 1 ? "s" : ""}</span></div>`;
  zoneAnnonce.hidden = false;
  jouerSon(camp === MOI ? "pouvoir" : "bonus");
  try {
    await pause(1700);
  } finally {
    zoneAnnonce.hidden = true;
  }
}

// ---------------------------------------------------------------------
// Deroulement
// ---------------------------------------------------------------------

function distribuer() {
  // On redistribue si le terrain contient les quatre cartes d'un mois
  for (;;) {
    const paquet = melanger(CARTES.map(c => c.id));
    const table = paquet.slice(16, 24);
    const parMois = new Array(12).fill(0);
    table.forEach(c => parMois[CARTES[c].mois]++);
    if (parMois.some(n => n === 4)) {
      continue;
    }
    mains = [paquet.slice(0, 8), paquet.slice(8, 16)];
    terrain = table;
    pioche = paquet.slice(24);
    prises = [[], []];
    koi = [false, false];
    mains[MOI].sort((a, b) => a - b);
    return;
  }
}

// Pose une carte sur le terrain et capture ce qui va avec
async function poser(camp, carte, cible) {
  const avant = cartesTerrain();
  const assorties = correspondances(avant, carte);
  ajouterAuTerrain(carte);
  carteJouee = carte;
  rendre();
  await pause(camp === MOI ? 380 : 650);
  if (assorties.length === 2 && cible === undefined) {
    if (camp === MOI) {
      options = assorties;
      curseurOption = 0;
      afficher("Deux cartes du même mois : laquelle prends-tu ?");
      cible = await attendre("cible");
      options = [];
    } else {
      cible = meilleureCible(avant, carte, prises[IA], prises[MOI]);
    }
  }
  if (assorties.length > 0) {
    const prise = prisePour(avant, carte, cible);
    for (const c of prise) {
      retirerDuTerrain(c);
    }
    prises[camp].push(...prise);
    jouerSon(prise.length === 4 ? "combo" : "croque");
    carteJouee = -1;
    rendre();
    await pause(320);
  } else {
    carteJouee = -1;
    rendre();
  }
}

async function jouerTour(camp, dernierTotal) {
  let carte;
  let cible;
  if (camp === MOI) {
    afficher("À toi : choisis une carte de ta main.");
    ({ carte, cible } = await attendre("main"));
  } else {
    afficher("L'IA réfléchit…");
    await pause(500);
    ({ carte, cible } = choisirCarte(mains[IA], cartesTerrain(), prises[IA], prises[MOI]));
    afficher("L'IA joue " + CARTES[carte].nom + ".");
    provenir(carte, zoneMainIa.lastElementChild || zoneMainIa, 0, true);
  }
  mains[camp].splice(mains[camp].indexOf(carte), 1);
  await poser(camp, carte, cible);

  // Puis on retourne la carte du dessus de la pioche
  const tiree = pioche.pop();
  provenir(tiree, zonePioche.querySelector(".carte-koikoi") || zonePioche, 0, true);
  afficher((camp === MOI ? "Tu retournes " : "L'IA retourne ") + CARTES[tiree].nom + ".");
  await poser(camp, tiree, undefined);

  const { texte, total } = detailYaku(prises[camp]);
  if (total <= dernierTotal[camp]) {
    return null;
  }
  dernierTotal[camp] = total;
  await annoncerYaku(camp);
  let stop;
  if (mains[camp].length === 0) {
    stop = true;
  } else if (camp === MOI) {
    choixDecision = 0;
    const doubleAdverse = koi[IA] ? " L'IA a dit koi-koi : ta manche compterait double." : "";
    contenuPanneau = {
      titre: "Yaku !",
      lignes: [texte + " = " + total + " point" + (total > 1 ? "s" : "") + "." + doubleAdverse,
        "Koi-koi : tu continues pour marquer plus, mais si l'IA forme un yaku, elle marque double. Stop : tu encaisses maintenant."],
      boutons: [{ texte: "Koi-koi", valeur: false }, { texte: "Stop", valeur: true }]
    };
    afficher("Koi-koi ou stop ?");
    stop = await attendre("decision");
    contenuPanneau = null;
  } else {
    stop = !decisionKoi(total, mains[IA].length, prises[MOI], koi[MOI]);
    afficher(stop ? "L'IA s'arrête avec " + texte + "." : "L'IA forme " + texte + " et annonce koi-koi !");
    await pause(stop ? 500 : 1100);
  }
  if (stop) {
    return { gagnant: camp, total, texte };
  }
  koi[camp] = true;
  jouerSon("pouvoir");
  if (camp === MOI) {
    afficher("Koi-koi ! Tu continues.");
  }
  rendre();
  return null;
}

async function manche() {
  distribuer();
  tour = oya;
  selection = 0;
  const dernierTotal = [0, 0];
  derniersYaku = [new Set(), new Set()];
  // Les cartes partent de la pioche, une par une
  const tas = zonePioche.querySelector(".carte-koikoi") || zonePioche;
  [...terrain, ...mains[MOI]].forEach((c, i) => provenir(c, tas, i * 45, true));
  rendre();
  jouerSon("vague");
  afficher(oya === MOI ? "Tu commences ce mois-ci." : "L'IA commence ce mois-ci.");
  await pause(700);
  for (;;) {
    if (mains[MOI].length === 0 && mains[IA].length === 0) {
      return { gagnant: null };
    }
    const resultat = await jouerTour(tour, dernierTotal);
    if (resultat) {
      return resultat;
    }
    tour = tour === MOI ? IA : MOI;
  }
}

async function partie() {
  totaux = [0, 0];
  moisCourant = 0;
  oya = Math.random() < 0.5 ? MOI : IA;
  majScoreCourant(CLASSEMENT, 0);
  const nombre = Number(duree.id);
  while (moisCourant < nombre) {
    const r = await manche();
    let titre;
    const lignes = [];
    if (r.gagnant === null) {
      titre = "Mois nul";
      lignes.push("Les mains sont vides et personne ne s'est arrêté : aucun point.");
    } else {
      const { points, multiplicateurs } = pointsDeManche(r.total, koi[r.gagnant === MOI ? IA : MOI]);
      totaux[r.gagnant] += points;
      oya = r.gagnant;
      titre = r.gagnant === MOI ? "Tu remportes le mois" : "L'IA remporte le mois";
      lignes.push(r.texte + " = " + r.total + (multiplicateurs.length ? " ; " + multiplicateurs.join(", ") : "") + ".");
      lignes.push((r.gagnant === MOI ? "Tu marques " : "L'IA marque ") + points + " point" + (points > 1 ? "s" : "") + ".");
      jouerSon(r.gagnant === MOI ? "vie" : "mort");
      if (r.gagnant === MOI) {
        majScoreCourant(CLASSEMENT, totaux[MOI]);
      }
    }
    moisCourant++;
    const derniere = moisCourant >= nombre;
    lignes.push("Score : toi " + totaux[MOI] + ", IA " + totaux[IA] + ".");
    contenuPanneau = {
      titre: (derniere ? "Fin de partie · " : "") + titre,
      lignes,
      boutons: [{ texte: derniere ? "Voir le résultat" : "Mois suivant", valeur: true }]
    };
    afficher(derniere ? "Dernier mois joué." : "Mois " + moisCourant + " terminé.");
    await attendre("suite");
    contenuPanneau = null;
  }
  moisCourant = nombre - 1;
  const bilan = totaux[MOI] > totaux[IA] ? "Victoire" : totaux[MOI] < totaux[IA] ? "Défaite" : "Égalité";
  afficher(bilan + " : " + totaux[MOI] + " à " + totaux[IA] + ". N pour rejouer.");
  rendre();
  jouerSon(totaux[MOI] > totaux[IA] ? "bonus" : "vague");
  await pause(900);
  finDePartie(CLASSEMENT, totaux[MOI], "Koi-Koi " + duree.nom);
}

function demarrer() {
  generation++;
  attente = null;
  cacherBulle();
  ciblesTuto = new Set();
  zoneAnnonce.hidden = true;
  contenuPanneau = null;
  options = [];
  carteJouee = -1;
  if (aideOuverte) {
    basculerAide();
  }
  marquerChoixActif(zoneDurees, duree.id);
  majBoutonSon();
  ajusterTable();
  requestAnimationFrame(ajusterTable);
  partie().catch(erreur => {
    if (!(erreur instanceof Annulation)) {
      throw erreur;
    }
  });
}

function arreter() {
  generation++;
  attente = null;
}

// Taille des cartes : la table entiere doit tenir au-dessus de la manette
// sur telephone, et entre les classements lateraux sur grand ecran.
const zoneTable = document.getElementById("tableKoi");

function ajusterTable() {
  if (zone.hidden) {
    return;
  }
  const manette = document.querySelector(".manette:not([hidden])");
  const basDispo = manette ? manette.getBoundingClientRect().top : window.innerHeight;
  const haut = zoneTable.getBoundingClientRect().top;
  const message = zoneMessage.getBoundingClientRect().height || 22;
  const hauteur = basDispo - haut - message - 22;
  const marge = window.innerWidth >= 1100 ? 500 : 0;
  const largeur = Math.min(window.innerWidth * 0.94 - marge, 760);
  const l = Math.max(22, Math.min(80, largeur / 9.2, hauteur / 7.5));
  zoneTable.style.setProperty("--l", l.toFixed(1) + "px");
  zoneTable.style.width = Math.min(largeur, l * 9.2) + "px";
}

window.addEventListener("resize", ajusterTable);

// ---------------------------------------------------------------------
// Commandes
// ---------------------------------------------------------------------

function jouerCarteMain(index, cible) {
  if (!attente || attente.type !== "main") {
    return;
  }
  const carte = mains[MOI][index];
  if (carte === undefined) {
    return;
  }
  jouerSon("clic");
  attente.resoudre({ carte, cible });
}

function deplacer(sens) {
  if (!attente) {
    return;
  }
  if (attente.type === "main" && mains[MOI].length > 0) {
    selection = (selection + sens + mains[MOI].length) % mains[MOI].length;
  } else if (attente.type === "cible") {
    curseurOption = (curseurOption + sens + options.length) % options.length;
  } else if (attente.type === "decision") {
    choixDecision = 1 - choixDecision;
  } else {
    return;
  }
  jouerSon("clic");
  rendre();
}

function valider() {
  if (!attente) {
    return;
  }
  if (attente.type === "main") {
    jouerCarteMain(selection);
  } else if (attente.type === "cible") {
    jouerSon("clic");
    attente.resoudre(options[curseurOption]);
  } else if (attente.type === "decision") {
    jouerSon("clic");
    attente.resoudre(choixDecision === 1);
  } else if (attente.type === "suite") {
    jouerSon("clic");
    attente.resoudre(true);
  }
}

zoneMain.addEventListener("click", evenement => {
  const element = evenement.target.closest(".carte-koikoi");
  if (!element || !attente || attente.type !== "main") {
    return;
  }
  const index = mains[MOI].indexOf(Number(element.dataset.carte));
  if (index < 0) {
    return;
  }
  if (index === selection) {
    jouerCarteMain(index);
  } else {
    selection = index;
    jouerSon("clic");
    rendre();
  }
});

zoneTerrain.addEventListener("click", evenement => {
  const element = evenement.target.closest(".carte-koikoi");
  if (!element || !attente || element.dataset.carte === undefined) {
    return;
  }
  const carte = Number(element.dataset.carte);
  if (attente.type === "cible" && options.includes(carte)) {
    jouerSon("clic");
    attente.resoudre(carte);
  } else if (attente.type === "main") {
    // Toucher la carte visee du terrain joue la carte choisie dessus
    const choisie = mains[MOI][selection];
    if (choisie !== undefined && CARTES[choisie].mois === CARTES[carte].mois) {
      jouerCarteMain(selection, carte);
    } else {
      // Sinon, choisir la carte de ma main qui va avec
      const index = mains[MOI].findIndex(c => CARTES[c].mois === CARTES[carte].mois);
      if (index >= 0) {
        selection = index;
        jouerSon("clic");
        rendre();
      }
    }
  }
});

surTouche(ID, function (evenement) {
  const touche = evenement.key.toLowerCase();
  if (touche === "h" || touche === "?") {
    basculerAide();
  } else if (touche === "escape") {
    if (aideOuverte) {
      basculerAide();
    } else {
      quitterJeu();
      return;
    }
  } else if (touche === "m") {
    basculerSon();
    majBoutonSon();
  } else if (touche === "t" && !zoneBulle.hidden) {
    quitterTuto();
  } else if (touche === "n") {
    demarrer();
  } else if (aideOuverte) {
    // L'aide ouverte, A la referme aussi
    if (touche === " " || touche === "enter") {
      basculerAide();
    } else if (touche === "arrowdown" || touche === "arrowup") {
      zoneYaku.scrollBy(0, touche === "arrowdown" ? 80 : -80);
    } else {
      return;
    }
  } else if (touche === "arrowleft" || touche === "q" || touche === "arrowup") {
    deplacer(-1);
  } else if (touche === "arrowright" || touche === "d" || touche === "arrowdown") {
    deplacer(1);
  } else if ((touche === " " || touche === "enter") && bulleBoutons.length && (!attente || attente.type !== "decision")) {
    (bulleBoutons.find(b => b.principal) || bulleBoutons[0]).agir();
  } else if (touche === " " || touche === "enter") {
    valider();
  } else if (touche === "k" && attente && attente.type === "decision") {
    attente.resoudre(false);
  } else if (touche === "s" && attente && attente.type === "decision") {
    attente.resoudre(true);
  } else {
    return;
  }
  evenement.preventDefault();
});

function majBoutonSon() {
  boutonSon.textContent = sonActif() ? "Son" : "Muet";
}

creerBoutonsChoix(zoneDurees, DUREES, function (choix) {
  duree = choix;
  stockageDuree.ecrireTexte(choix.id);
  demarrer();
});

document.getElementById("aideKoi").addEventListener("click", basculerAide);
document.getElementById("tutoKoi").addEventListener("click", tutoriel);
boutonSon.addEventListener("click", () => { basculerSon(); majBoutonSon(); });
document.getElementById("nouvelleKoi").addEventListener("click", demarrer);
document.getElementById("quitterKoi").addEventListener("click", quitterJeu);

// Pour les tests automatiques
export const _test = { get attente() { return attente; }, get mains() { return mains; }, get bulleBoutons() { return bulleBoutons; }, tutoriel };

enregistrerJeu({
  id: ID,
  nom: "Koi-Koi",
  code: "48",
  section: zone,
  demarrer() {
    if ((stockageTuto.lire() || {}).vu) {
      demarrer();
    } else {
      cacherBulle();
      marquerChoixActif(zoneDurees, duree.id);
      majBoutonSon();
      ajusterTable();
      requestAnimationFrame(ajusterTable);
      proposerTuto();
    }
  },
  arreter,
  classement: () => CLASSEMENT,
  manette: { a: " ", b: "h", start: "n", libelles: { a: "Jouer", b: "Yaku" } }
});
