// =====================================================================
//  RUBAN - l'historique imprime de la calculatrice
//  Chaque calcul valide sort sur un ticket ivoire, comme sur les
//  calculatrices imprimantes. Un code secret s'imprime a l'encre rouge.
//  Le ruban est garde sur l'appareil, et cliquer une ligne de calcul
//  renvoie son resultat dans la calculatrice.
// =====================================================================

const CLE_RUBAN = "tanuki-calc-ruban";
const LIGNES_MAX = 40;

const zoneRuban = document.getElementById("ruban");
const listeRuban = document.getElementById("rubanListe");
const boutonEffacerRuban = document.getElementById("rubanEffacer");
const boutonDeplierRuban = document.getElementById("rubanDeplier");

let lignes = lire();
let reutiliser = null;   // fourni par la calculatrice

function lire() {
  try {
    const brut = localStorage.getItem(CLE_RUBAN);
    const valeur = brut === null ? [] : JSON.parse(brut);
    return Array.isArray(valeur) ? valeur.slice(-LIGNES_MAX) : [];
  } catch (erreur) {
    return [];
  }
}

function ecrire() {
  try {
    localStorage.setItem(CLE_RUBAN, JSON.stringify(lignes));
  } catch (erreur) {
    // stockage indisponible : le ruban vit le temps de la page
  }
}

// La calculatrice dit quoi faire d'un resultat clique sur le ruban
export function surReutilisation(fonction) {
  reutiliser = fonction;
}

function creerLigne(ligne, recente) {
  const element = document.createElement("li");
  element.className = "ruban-ligne ruban-" + ligne.type;
  if (recente) {
    element.classList.add("imprime");
  }

  if (ligne.type === "code") {
    const haut = document.createElement("span");
    haut.className = "ruban-expr";
    haut.textContent = "▶ " + ligne.code;
    const bas = document.createElement("span");
    bas.className = "ruban-res";
    const nom = document.createElement("span");
    nom.textContent = ligne.nom.toUpperCase();
    const jp = document.createElement("span");
    jp.className = "ruban-jp";
    jp.lang = "ja";
    jp.textContent = ligne.jp || "";
    bas.append(nom, jp);
    element.append(haut, bas);
    return element;
  }

  // Une ligne de calcul se rejoue d'un clic
  const bouton = document.createElement("button");
  bouton.type = "button";
  bouton.className = "ruban-bouton";
  bouton.title = "Reprendre ce resultat";
  const expr = document.createElement("span");
  expr.className = "ruban-expr";
  expr.textContent = ligne.expr;
  const res = document.createElement("span");
  res.className = "ruban-res";
  const egal = document.createElement("span");
  egal.className = "ruban-egal";
  egal.textContent = ligne.erreur ? "E" : "=";
  const valeur = document.createElement("span");
  valeur.textContent = ligne.res;
  res.append(egal, valeur);
  bouton.append(expr, res);
  if (!ligne.erreur) {
    bouton.addEventListener("click", function () {
      if (reutiliser !== null) {
        reutiliser(ligne.brut);
      }
    });
  } else {
    bouton.disabled = true;
  }
  element.appendChild(bouton);
  return element;
}

function afficher() {
  listeRuban.innerHTML = "";
  if (lignes.length === 0) {
    const vide = document.createElement("li");
    vide.className = "ruban-ligne ruban-vide";
    vide.textContent = "Le ruban attend ton premier calcul";
    listeRuban.appendChild(vide);
  }
  lignes.forEach(ligne => listeRuban.appendChild(creerLigne(ligne, false)));
  descendre();
}

function descendre() {
  listeRuban.scrollTop = listeRuban.scrollHeight;
}

function ajouter(ligne) {
  lignes.push(ligne);
  if (lignes.length > LIGNES_MAX) {
    lignes = lignes.slice(-LIGNES_MAX);
    afficher();
  }
  const vide = listeRuban.querySelector(".ruban-vide");
  if (vide !== null) {
    vide.remove();
  }
  const element = creerLigne(ligne, true);
  listeRuban.appendChild(element);
  // Le premier element de trop sort par le haut, comme le papier
  while (listeRuban.children.length > lignes.length) {
    listeRuban.firstElementChild.remove();
  }
  descendre();
  zoneRuban.classList.add("a-servi");
  ecrire();
}

// Un calcul : expression telle qu'affichee, resultat formate, et la
// valeur brute a reinjecter
export function imprimerCalcul(expr, res, brut) {
  ajouter({ type: "calcul", expr, res, brut });
}

export function imprimerErreur(expr) {
  ajouter({ type: "calcul", expr, res: "ERREUR", erreur: true });
}

// Un code secret trouve : il s'imprime a l'encre rouge
export function imprimerCode(code, nom, jp) {
  ajouter({ type: "code", code, nom, jp });
}

boutonEffacerRuban.addEventListener("click", function () {
  lignes = [];
  ecrire();
  afficher();
});

// Sur telephone le ruban n'affiche que sa derniere ligne. Un appui le deplie.
boutonDeplierRuban.addEventListener("click", function () {
  const ouvert = zoneRuban.classList.toggle("deplie");
  boutonDeplierRuban.setAttribute("aria-expanded", String(ouvert));
  boutonDeplierRuban.textContent = ouvert ? "Replier" : "Ruban";
  descendre();
});

if (lignes.length > 0) {
  zoneRuban.classList.add("a-servi");
}
afficher();
