// =====================================================================
//  NOYAU - manette tactile facon Game Boy
//  Sur telephone, les jeux d'action recoivent une croix directionnelle,
//  deux boutons A et B, et Start / Select. La manette ne connait aucun
//  jeu : elle envoie de vraies touches clavier (KeyboardEvent sur
//  document), que chaque jeu ecoute deja. Un jeu declare seulement ce
//  que valent A, B et Start dans son enregistrement :
//
//    manette: { a: " ", b: "Shift", start: "p", libelles: { a: "Saut", b: "Prendre" } }
//    manette: false   (jeu qui se joue au doigt, pas de manette)
//
//  Tout est pense contre les reflexes d'iOS : pas de selection, pas de
//  loupe ni de menu sur appui long, pas de zoom au double-tap. Chaque
//  doigt est suivi a part, on peut donc courir et sauter en meme temps.
// =====================================================================

const TOUCHE_SELECT = "m";   // Select coupe ou remet le son dans tous les jeux
const SEUIL_CROIX = 0.28;    // en dessous, le pouce est au centre de la croix
const DELAI_REPETITION = 220;
const PAS_REPETITION = 90;

let racine = null;
let config = null;
const doigts = new Map();   // pointerId -> Set des touches tenues
const tenues = new Map();   // touche -> nombre de doigts qui la tiennent
const repetitions = new Map();

function ecranTactile() {
  return window.matchMedia("(pointer: coarse)").matches;
}

function envoyer(type, touche, repetee) {
  document.dispatchEvent(new KeyboardEvent(type, {
    key: touche,
    bubbles: true,
    cancelable: true,
    repeat: repetee === true
  }));
}

function appuyer(touche) {
  const deja = tenues.get(touche) || 0;
  tenues.set(touche, deja + 1);
  if (deja > 0) {
    return;
  }
  envoyer("keydown", touche);
  if (navigator.vibrate) {
    navigator.vibrate(6);
  }
  if (config && config.repetition && touche.startsWith("Arrow")) {
    const minuteur = setTimeout(function repeter() {
      envoyer("keydown", touche, true);
      repetitions.set(touche, setTimeout(repeter, PAS_REPETITION));
    }, DELAI_REPETITION);
    repetitions.set(touche, minuteur);
  }
}

function relacher(touche) {
  const reste = (tenues.get(touche) || 0) - 1;
  if (reste > 0) {
    tenues.set(touche, reste);
    return;
  }
  tenues.delete(touche);
  clearTimeout(repetitions.get(touche));
  repetitions.delete(touche);
  envoyer("keyup", touche);
}

// Met a jour les touches tenues par un doigt, en ne relachant que ce qui change
function tenirPourDoigt(id, nouvelles) {
  const anciennes = doigts.get(id) || new Set();
  anciennes.forEach(t => {
    if (!nouvelles.has(t)) {
      relacher(t);
    }
  });
  nouvelles.forEach(t => {
    if (!anciennes.has(t)) {
      appuyer(t);
    }
  });
  if (nouvelles.size) {
    doigts.set(id, nouvelles);
  } else {
    doigts.delete(id);
  }
  allumer();
}

function toutRelacher() {
  doigts.forEach((touches, id) => tenirPourDoigt(id, new Set()));
  doigts.clear();
  [...tenues.keys()].forEach(t => {
    tenues.set(t, 1);
    relacher(t);
  });
  allumer();
}

// Les boutons enfonces s'allument, comme une vraie touche qui descend
function allumer() {
  if (racine === null) {
    return;
  }
  racine.querySelectorAll("[data-touche]").forEach(el => {
    el.classList.toggle("enfonce", tenues.has(el.dataset.touche));
  });
}

// La croix lit la position du pouce : on peut glisser d'une direction a
// l'autre sans lever le doigt, et les diagonales tiennent deux fleches
function directionsDeLaCroix(croix, x, y) {
  const r = croix.getBoundingClientRect();
  const dx = (x - (r.left + r.width / 2)) / (r.width / 2);
  const dy = (y - (r.top + r.height / 2)) / (r.height / 2);
  const touches = new Set();
  if (Math.hypot(dx, dy) < SEUIL_CROIX) {
    return touches;
  }
  const angle = Math.atan2(dy, dx);
  const huitieme = Math.round(angle / (Math.PI / 4));
  const directions = {
    0: ["ArrowRight"], 1: ["ArrowRight", "ArrowDown"], 2: ["ArrowDown"], 3: ["ArrowDown", "ArrowLeft"],
    4: ["ArrowLeft"], "-4": ["ArrowLeft"], "-3": ["ArrowLeft", "ArrowUp"], "-2": ["ArrowUp"], "-1": ["ArrowUp", "ArrowRight"]
  };
  (directions[huitieme] || []).forEach(t => touches.add(t));
  // Les jeux en quatre directions preferent une seule fleche a la fois
  if (config && config.quatreDirections && touches.size === 2) {
    const premiere = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "ArrowRight" : "ArrowLeft") : (dy > 0 ? "ArrowDown" : "ArrowUp");
    return new Set([premiere]);
  }
  return touches;
}

function construire() {
  racine = document.createElement("div");
  racine.className = "manette";
  racine.hidden = true;
  racine.setAttribute("aria-hidden", "true");
  racine.innerHTML = `
    <div class="manette-croix" data-zone="croix">
      <span class="croix-bras croix-haut" data-touche="ArrowUp"></span>
      <span class="croix-bras croix-bas" data-touche="ArrowDown"></span>
      <span class="croix-bras croix-gauche" data-touche="ArrowLeft"></span>
      <span class="croix-bras croix-droite" data-touche="ArrowRight"></span>
      <span class="croix-centre"></span>
    </div>
    <div class="manette-centre">
      <button type="button" class="manette-pilule" data-role="select"><span>Select</span></button>
      <button type="button" class="manette-pilule" data-role="start"><span>Start</span></button>
    </div>
    <div class="manette-boutons">
      <div class="manette-bouton bouton-b" data-role="b"><span class="rond"></span><span class="nom">B</span><span class="libelle"></span></div>
      <div class="manette-bouton bouton-a" data-role="a"><span class="rond"></span><span class="nom">A</span><span class="libelle"></span></div>
    </div>`;
  document.body.appendChild(racine);

  // Aucun geste systeme sur la manette : ni defilement, ni zoom, ni loupe
  ["touchstart", "touchmove", "touchend", "gesturestart"].forEach(type => {
    racine.addEventListener(type, evenement => evenement.preventDefault(), { passive: false });
  });
  racine.addEventListener("contextmenu", evenement => evenement.preventDefault());

  const croix = racine.querySelector(".manette-croix");

  racine.addEventListener("pointerdown", function (evenement) {
    evenement.preventDefault();
    const cible = evenement.target.closest("[data-zone], [data-role]");
    if (cible === null || config === null) {
      return;
    }
    racine.setPointerCapture(evenement.pointerId);
    if (cible.dataset.zone === "croix") {
      doigtsSurCroix.add(evenement.pointerId);
      tenirPourDoigt(evenement.pointerId, directionsDeLaCroix(croix, evenement.clientX, evenement.clientY));
      return;
    }
    const touche = toucheDuRole(cible.dataset.role);
    if (touche) {
      tenirPourDoigt(evenement.pointerId, new Set([touche]));
    }
  });

  racine.addEventListener("pointermove", function (evenement) {
    if (doigtsSurCroix.has(evenement.pointerId)) {
      tenirPourDoigt(evenement.pointerId, directionsDeLaCroix(croix, evenement.clientX, evenement.clientY));
    }
  });

  const finir = function (evenement) {
    doigtsSurCroix.delete(evenement.pointerId);
    tenirPourDoigt(evenement.pointerId, new Set());
  };
  racine.addEventListener("pointerup", finir);
  racine.addEventListener("pointercancel", finir);
  racine.addEventListener("lostpointercapture", finir);
}

const doigtsSurCroix = new Set();

function toucheDuRole(role) {
  if (role === "a") {
    return config.a || null;
  }
  if (role === "b") {
    return config.b || null;
  }
  if (role === "start") {
    return config.start || "p";
  }
  if (role === "select") {
    return config.select || TOUCHE_SELECT;
  }
  return null;
}

function etiqueter() {
  const libelles = config.libelles || {};
  ["a", "b"].forEach(role => {
    const bouton = racine.querySelector("[data-role='" + role + "']");
    const touche = config[role];
    // A et B restent toujours a leur place, comme sur la console :
    // un bouton sans role dans ce jeu est simplement eteint
    bouton.hidden = false;
    bouton.classList.toggle("inactif", !touche);
    bouton.dataset.touche = touche || "";
    bouton.querySelector(".libelle").textContent = libelles[role] || "";
  });
  racine.querySelector("[data-role='start']").dataset.touche = config.start || "p";
  racine.querySelector("[data-role='select']").dataset.touche = config.select || TOUCHE_SELECT;
}

// Appelee par l'arcade a l'ouverture d'un jeu
export function afficherManette(configuration) {
  if (!configuration || !ecranTactile()) {
    masquerManette();
    return;
  }
  if (racine === null) {
    construire();
  }
  toutRelacher();
  config = configuration;
  etiqueter();
  racine.hidden = false;
  document.body.classList.add("avec-manette");
}

export function masquerManette() {
  if (racine !== null) {
    toutRelacher();
    racine.hidden = true;
  }
  config = null;
  document.body.classList.remove("avec-manette");
}

// Un onglet qui passe en arriere-plan ne doit pas laisser une touche enfoncee
document.addEventListener("visibilitychange", function () {
  if (document.hidden) {
    toutRelacher();
  }
});
