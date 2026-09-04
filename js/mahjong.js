// =====================================================================
//  MAHJONG SOLITAIRE - disposition classique de la tortue, 144 tuiles
//  Une tuile est libre si rien ne la recouvre et si son cote gauche ou
//  son cote droit est degage. La grille est generee a l'envers, en
//  posant des paires sur des emplacements libres, ce qui garantit
//  qu'une solution existe toujours.
//  Le score est le temps, donc plus il est bas, mieux c'est.
// =====================================================================

const zoneMahjong = document.getElementById("jeuMahjong");
const plateauMahjong = document.getElementById("plateauMahjong");
const zoneChronoMahjong = document.getElementById("chronoMahjong");
const zoneRestantesMahjong = document.getElementById("restantesMahjong");
const zonePairesMahjong = document.getElementById("pairesMahjong");
const zoneMessageMahjong = document.getElementById("messageMahjong");
const boutonIndiceMahjong = document.getElementById("indiceMahjong");
const boutonMelangerMahjong = document.getElementById("melangerMahjong");
const boutonAnnulerMahjong = document.getElementById("annulerMahjong");
const boutonNouvelleMahjong = document.getElementById("nouvelleMahjong");
const boutonQuitterMahjong = document.getElementById("quitterMahjong");

const CLE_MAHJONG = "tanuki-arcade-mahjong";
const PENALITE_INDICE = 30;
const PENALITE_MELANGE = 60;

// Les 34 familles classiques, plus fleurs et saisons
const FAMILLES_MAHJONG = [
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => ({ id: "cercle" + n, texte: n + "\u25CF", famille: "cercle" })),
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => ({ id: "bambou" + n, texte: n + "\u7AF9", famille: "bambou" })),
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => ({ id: "carac" + n, texte: n + "\u842C", famille: "caractere" })),
  { id: "vent-e", texte: "\u6771", famille: "vent" },
  { id: "vent-s", texte: "\u5357", famille: "vent" },
  { id: "vent-o", texte: "\u897F", famille: "vent" },
  { id: "vent-n", texte: "\u5317", famille: "vent" },
  { id: "dragon-r", texte: "\u4E2D", famille: "dragon-rouge" },
  { id: "dragon-v", texte: "\u767C", famille: "dragon-vert" },
  { id: "dragon-b", texte: "\u767D", famille: "dragon-blanc" }
];
const SPECIALES_MAHJONG = [
  { id: "fleur", texte: "\u82B1", famille: "fleur" },
  { id: "saison", texte: "\u5B63", famille: "saison" }
];

let tuiles = [];
let tuileChoisie = null;
let historiqueMahjong = [];
let secondesMahjong = 0;
let penalitesMahjong = 0;
let pairesRetirees = 0;
let mahjongTermine = true;
let chronoMahjong = null;
let chronoMessageMahjong = null;

// ---------------------------------------------------------------------
// Disposition de la tortue
// ---------------------------------------------------------------------

// Renvoie la liste des emplacements : couche, x et y en unites de tuile.
// Les demi-valeurs correspondent aux tuiles decalees de l'original.
function dispositionTortue() {
  const places = [];
  const ajouter = (couche, x, y) => places.push({ couche, x, y });

  // Couche du bas : 87 emplacements
  const rangees = [
    { y: 0, debut: 1, fin: 12 },
    { y: 1, debut: 3, fin: 10 },
    { y: 2, debut: 2, fin: 11 },
    { y: 3, debut: 1, fin: 12 },
    { y: 4, debut: 1, fin: 12 },
    { y: 5, debut: 2, fin: 11 },
    { y: 6, debut: 3, fin: 10 },
    { y: 7, debut: 1, fin: 12 }
  ];
  rangees.forEach(rangee => {
    for (let x = rangee.debut; x <= rangee.fin; x++) {
      ajouter(0, x, rangee.y);
    }
  });
  // Les trois tuiles qui depassent, une a gauche et deux a droite
  ajouter(0, -1, 3.5);
  ajouter(0, 13, 3.5);
  ajouter(0, 14, 3.5);

  // Couche 1 : carre de 6 x 6
  for (let y = 1; y <= 6; y++) {
    for (let x = 3; x <= 8; x++) {
      ajouter(1, x, y);
    }
  }
  // Couche 2 : carre de 4 x 4
  for (let y = 2; y <= 5; y++) {
    for (let x = 4; x <= 7; x++) {
      ajouter(2, x, y);
    }
  }
  // Couche 3 : carre de 2 x 2
  for (let y = 3; y <= 4; y++) {
    for (let x = 5; x <= 6; x++) {
      ajouter(3, x, y);
    }
  }
  // Couche 4 : la tuile du sommet, posee a cheval sur les quatre
  ajouter(4, 5.5, 3.5);

  return places;
}

// ---------------------------------------------------------------------
// Regles de liberte
// ---------------------------------------------------------------------

function memeZone(a, b) {
  return Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1;
}

function estRecouverte(tuile, presentes) {
  return presentes.some(autre => autre !== tuile
    && autre.couche === tuile.couche + 1
    && memeZone(autre, tuile));
}

function cotesBloques(tuile, presentes) {
  let gauche = false;
  let droite = false;
  for (const autre of presentes) {
    if (autre === tuile || autre.couche !== tuile.couche || Math.abs(autre.y - tuile.y) >= 1) {
      continue;
    }
    if (autre.x < tuile.x && tuile.x - autre.x <= 1.001) {
      gauche = true;
    }
    if (autre.x > tuile.x && autre.x - tuile.x <= 1.001) {
      droite = true;
    }
  }
  return { gauche, droite };
}

function estLibre(tuile, presentes) {
  if (estRecouverte(tuile, presentes)) {
    return false;
  }
  const cotes = cotesBloques(tuile, presentes);
  return !cotes.gauche || !cotes.droite;
}

function tuilesPresentes() {
  return tuiles.filter(tuile => !tuile.retiree);
}

function tuilesLibres() {
  const presentes = tuilesPresentes();
  return presentes.filter(tuile => estLibre(tuile, presentes));
}

// Deux tuiles vont ensemble si elles portent la meme face.
// Les fleurs vont entre elles, les saisons aussi.
function formentUnePaire(a, b) {
  return a !== b && a.face.id === b.face.id;
}

function paireDisponible() {
  const libres = tuilesLibres();
  for (let i = 0; i < libres.length; i++) {
    for (let k = i + 1; k < libres.length; k++) {
      if (formentUnePaire(libres[i], libres[k])) {
        return [libres[i], libres[k]];
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------
// Generation garantie soluble
// ---------------------------------------------------------------------

function melangerListe(liste) {
  const copie = liste.slice();
  for (let i = copie.length - 1; i > 0; i--) {
    const k = Math.floor(Math.random() * (i + 1));
    [copie[i], copie[k]] = [copie[k], copie[i]];
  }
  return copie;
}

function listeDesFaces() {
  // 34 familles a quatre exemplaires, plus quatre fleurs et quatre saisons
  const paires = [];
  FAMILLES_MAHJONG.forEach(face => {
    paires.push(face, face);
  });
  SPECIALES_MAHJONG.forEach(face => {
    paires.push(face, face);
  });
  return melangerListe(paires);
}

// On part de la grille pleine et on retire des paires libres une par une,
// en notant la face donnee a chaque paire. En rejouant l'operation a
// l'envers, le joueur a forcement une solution.
function genererMahjong() {
  const places = dispositionTortue();

  for (let essai = 0; essai < 30; essai++) {
    const provisoires = places.map((place, index) => ({
      index,
      couche: place.couche,
      x: place.x,
      y: place.y,
      face: null,
      retiree: false
    }));

    const faces = listeDesFaces();
    let restantes = provisoires.slice();
    let reussi = true;

    while (restantes.length > 0) {
      const libres = melangerListe(restantes.filter(tuile => estLibre(tuile, restantes)));
      if (libres.length < 2) {
        reussi = false;
        break;
      }
      const premiere = libres[0];
      const seconde = libres[1];
      const face = faces.pop();
      premiere.face = face;
      seconde.face = face;
      restantes = restantes.filter(tuile => tuile !== premiere && tuile !== seconde);
    }

    if (reussi) {
      return provisoires;
    }
  }

  // Repli extremement improbable : faces distribuees au hasard
  const faces = listeDesFaces();
  return places.map((place, index) => ({
    index,
    couche: place.couche,
    x: place.x,
    y: place.y,
    face: faces[index],
    retiree: false
  }));
}

// ---------------------------------------------------------------------
// Sauvegarde
// ---------------------------------------------------------------------

function sauverMahjong() {
  try {
    localStorage.setItem(CLE_MAHJONG, JSON.stringify({
      tuiles: tuiles.map(tuile => ({
        couche: tuile.couche,
        x: tuile.x,
        y: tuile.y,
        face: tuile.face.id,
        retiree: tuile.retiree
      })),
      secondes: secondesMahjong,
      penalites: penalitesMahjong,
      paires: pairesRetirees
    }));
  } catch (erreur) {
    // stockage indisponible
  }
}

function effacerSauvegardeMahjong() {
  try {
    localStorage.removeItem(CLE_MAHJONG);
  } catch (erreur) {
    // rien a faire
  }
}

function faceParId(id) {
  return FAMILLES_MAHJONG.concat(SPECIALES_MAHJONG).find(face => face.id === id) || null;
}

function chargerMahjong() {
  try {
    const brut = localStorage.getItem(CLE_MAHJONG);
    if (brut === null) {
      return false;
    }
    const donnees = JSON.parse(brut);
    if (!Array.isArray(donnees.tuiles) || donnees.tuiles.length !== 144) {
      return false;
    }
    tuiles = donnees.tuiles.map((tuile, index) => ({
      index,
      couche: tuile.couche,
      x: tuile.x,
      y: tuile.y,
      face: faceParId(tuile.face),
      retiree: tuile.retiree === true
    }));
    if (tuiles.some(tuile => tuile.face === null)) {
      return false;
    }
    secondesMahjong = donnees.secondes || 0;
    penalitesMahjong = donnees.penalites || 0;
    pairesRetirees = donnees.paires || 0;
    return true;
  } catch (erreur) {
    return false;
  }
}

// ---------------------------------------------------------------------
// Partie
// ---------------------------------------------------------------------

function nouvellePartieMahjong() {
  tuiles = genererMahjong();
  tuileChoisie = null;
  historiqueMahjong = [];
  secondesMahjong = 0;
  penalitesMahjong = 0;
  pairesRetirees = 0;
  mahjongTermine = false;
  effacerSauvegardeMahjong();
  construirePlateauMahjong();
  dessinerMahjong();
  lancerChronoMahjong();
  afficherMessageMahjong("");
}

function demarrerMahjong() {
  if (chargerMahjong()) {
    tuileChoisie = null;
    historiqueMahjong = [];
    mahjongTermine = false;
    construirePlateauMahjong();
    dessinerMahjong();
    lancerChronoMahjong();
  } else {
    nouvellePartieMahjong();
  }
}

function lancerChronoMahjong() {
  clearInterval(chronoMahjong);
  chronoMahjong = setInterval(function () {
    if (mahjongTermine || overlayOuvert || jeuActif !== "mahjong") {
      return;
    }
    secondesMahjong++;
    majChronoMahjong();
    if (secondesMahjong % 10 === 0) {
      sauverMahjong();
    }
  }, 1000);
}

function tempsMahjong() {
  return secondesMahjong + penalitesMahjong;
}

function majChronoMahjong() {
  zoneChronoMahjong.textContent = formaterTempsMahjong(tempsMahjong());
}

function formaterTempsMahjong(secondes) {
  const minutes = Math.floor(secondes / 60);
  return minutes + ":" + String(secondes % 60).padStart(2, "0");
}

function afficherMessageMahjong(texte) {
  zoneMessageMahjong.textContent = texte;
  clearTimeout(chronoMessageMahjong);
  if (texte !== "") {
    chronoMessageMahjong = setTimeout(() => {
      if (!mahjongTermine) {
        zoneMessageMahjong.textContent = "";
      }
    }, 2500);
  }
}

function choisirTuile(tuile) {
  if (mahjongTermine || tuile.retiree) {
    return;
  }
  if (!estLibre(tuile, tuilesPresentes())) {
    afficherMessageMahjong("Cette tuile est bloquee");
    return;
  }

  if (tuileChoisie === null) {
    tuileChoisie = tuile;
    dessinerMahjong();
    return;
  }
  if (tuileChoisie === tuile) {
    tuileChoisie = null;
    dessinerMahjong();
    return;
  }

  if (formentUnePaire(tuileChoisie, tuile)) {
    retirerPaire(tuileChoisie, tuile);
  } else {
    tuileChoisie = tuile;
    dessinerMahjong();
  }
}

function retirerPaire(a, b) {
  a.retiree = true;
  b.retiree = true;
  historiqueMahjong.push([a.index, b.index]);
  pairesRetirees++;
  tuileChoisie = null;
  dessinerMahjong();
  sauverMahjong();

  if (tuilesPresentes().length === 0) {
    terminerMahjong();
  } else if (paireDisponible() === null) {
    afficherMessageMahjong("Aucun coup possible, melange conseille");
  }
}

function annulerCoupMahjong() {
  if (mahjongTermine || historiqueMahjong.length === 0) {
    return;
  }
  const [premier, second] = historiqueMahjong.pop();
  tuiles[premier].retiree = false;
  tuiles[second].retiree = false;
  pairesRetirees--;
  tuileChoisie = null;
  dessinerMahjong();
  sauverMahjong();
}

function indiceMahjong() {
  if (mahjongTermine) {
    return;
  }
  const paire = paireDisponible();
  penalitesMahjong += PENALITE_INDICE;
  majChronoMahjong();

  if (paire === null) {
    afficherMessageMahjong("Aucune paire jouable, plus " + PENALITE_INDICE + " s");
    return;
  }
  tuileChoisie = null;
  dessinerMahjong();
  paire.forEach(tuile => {
    const element = plateauMahjong.children[tuile.index];
    element.classList.add("indiquee");
  });
  afficherMessageMahjong("Paire indiquee, plus " + PENALITE_INDICE + " s");
  sauverMahjong();
}

// Redistribue les faces des tuiles encore en place, sans casser la partie
function melangerMahjong() {
  if (mahjongTermine) {
    return;
  }
  const presentes = tuilesPresentes();
  const faces = melangerListe(presentes.map(tuile => tuile.face));
  presentes.forEach((tuile, index) => {
    tuile.face = faces[index];
  });

  penalitesMahjong += PENALITE_MELANGE;
  tuileChoisie = null;
  majChronoMahjong();
  dessinerMahjong();
  afficherMessageMahjong("Tuiles melangees, plus " + PENALITE_MELANGE + " s");
  sauverMahjong();
}

function terminerMahjong() {
  mahjongTermine = true;
  clearInterval(chronoMahjong);
  effacerSauvegardeMahjong();
  afficherMessageMahjong("Termine en " + formaterTempsMahjong(tempsMahjong()));
  finDePartie("mahjong", tempsMahjong());
}

// ---------------------------------------------------------------------
// Affichage
// ---------------------------------------------------------------------

function construirePlateauMahjong() {
  plateauMahjong.innerHTML = "";
  tuiles.forEach(tuile => {
    const element = document.createElement("button");
    element.type = "button";
    element.className = "tuile-mahjong";
    element.dataset.index = String(tuile.index);
    plateauMahjong.appendChild(element);
  });
}

function dessinerMahjong() {
  const presentes = tuilesPresentes();

  tuiles.forEach(tuile => {
    const element = plateauMahjong.children[tuile.index];
    element.className = "tuile-mahjong famille-" + tuile.face.famille;
    element.textContent = tuile.face.texte;
    element.hidden = tuile.retiree;

    // Position en unites de tuile, decalee vers le haut a chaque couche
    element.style.left = "calc(" + tuile.x + " * var(--largeur-tuile) + " + tuile.couche + " * var(--relief))";
    element.style.top = "calc(" + tuile.y + " * var(--hauteur-tuile) - " + tuile.couche + " * var(--relief))";
    element.style.zIndex = String(tuile.couche * 100 + Math.round(tuile.y * 2) * 2 + Math.round(tuile.x));

    if (!tuile.retiree && estLibre(tuile, presentes)) {
      element.classList.add("libre");
    }
    if (tuile === tuileChoisie) {
      element.classList.add("choisie");
    }
  });

  zoneRestantesMahjong.textContent = String(presentes.length);
  zonePairesMahjong.textContent = String(pairesRetirees);
  majChronoMahjong();
}

// ---------------------------------------------------------------------
// Commandes
// ---------------------------------------------------------------------

plateauMahjong.addEventListener("click", function (evenement) {
  if (jeuActif !== "mahjong" || overlayOuvert) {
    return;
  }
  const element = evenement.target.closest(".tuile-mahjong");
  if (!element) {
    return;
  }
  choisirTuile(tuiles[Number(element.dataset.index)]);
});

document.addEventListener("keydown", function (evenement) {
  if (jeuActif !== "mahjong" || overlayOuvert) {
    return;
  }
  const touche = evenement.key.toLowerCase();

  if (touche === "h") {
    indiceMahjong();
  } else if (touche === "m") {
    melangerMahjong();
  } else if (touche === "backspace" || (touche === "z" && (evenement.ctrlKey || evenement.metaKey))) {
    annulerCoupMahjong();
  } else if (touche === "n") {
    nouvellePartieMahjong();
  } else if (touche === "escape") {
    quitterJeu();
    return;
  } else {
    return;
  }
  evenement.preventDefault();
});

boutonIndiceMahjong.addEventListener("click", indiceMahjong);
boutonMelangerMahjong.addEventListener("click", melangerMahjong);
boutonAnnulerMahjong.addEventListener("click", annulerCoupMahjong);
boutonNouvelleMahjong.addEventListener("click", nouvellePartieMahjong);
boutonQuitterMahjong.addEventListener("click", quitterJeu);

// ===== Inscription dans l'arcade =====
enregistrerJeu({
  id: "mahjong",
  nom: "Mahjong",
  code: "144",
  section: zoneMahjong,
  demarrer: demarrerMahjong,
  arreter: () => clearInterval(chronoMahjong),
  plusBasEstMieux: true,
  formaterScore: formaterTempsMahjong
});