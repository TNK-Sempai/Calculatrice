// =====================================================================
//  SUDOKU - grilles generees a la volee, quatre difficultes
//  Chaque grille est garantie a solution unique : on part d'une grille
//  complete puis on retire des cases une par une, en verifiant a chaque
//  retrait qu'il n'existe toujours qu'une seule solution.
//  Le score est le temps, donc plus il est bas, mieux c'est.
// =====================================================================

const zoneSudoku = document.getElementById("jeuSudoku");
const grilleSudokuHtml = document.getElementById("grilleSudoku");
const paveSudoku = document.getElementById("paveSudoku");
const zoneDifficultes = document.getElementById("difficultesSudoku");
const zoneChrono = document.getElementById("chronoSudoku");
const zoneRestantes = document.getElementById("restantesSudoku");
const zoneMessageSudoku = document.getElementById("messageSudoku");
const boutonNotes = document.getElementById("notesSudoku");
const boutonVerifier = document.getElementById("verifierSudoku");
const boutonNouvelleSudoku = document.getElementById("nouvelleSudoku");
const boutonQuitterSudoku = document.getElementById("quitterSudoku");

const CLE_SUDOKU = "tanuki-arcade-sudoku";
const PENALITE_VERIFICATION = 30;   // secondes ajoutees a chaque verification

// Nombre de cases visibles au depart pour chaque difficulte
const DIFFICULTES = [
  { id: "facile", nom: "Facile", indices: 42 },
  { id: "moyen", nom: "Moyen", indices: 34 },
  { id: "difficile", nom: "Difficile", indices: 29 },
  { id: "extreme", nom: "Extreme", indices: 25 }
];

let grilleDepart = [];      // la grille proposee, 0 pour une case vide
let grilleJoueur = [];      // ce que le joueur a saisi
let solutionSudoku = [];
let notesSudoku = [];       // un tableau de candidats par case
let difficulteChoisie = DIFFICULTES[0];
let caseSelectionnee = null;
let modeNotes = false;
let secondesSudoku = 0;
let penalites = 0;
let sudokuTermine = true;
let erreursAffichees = false;   // reste vrai jusqu'a la prochaine saisie
let chronoSudoku = null;
let cellulesSudoku = [];

// ---------------------------------------------------------------------
// Outils de grille
// ---------------------------------------------------------------------

function grilleVideSudoku() {
  return Array.from({ length: 9 }, () => Array(9).fill(0));
}

function copierGrille(grille) {
  return grille.map(ligne => ligne.slice());
}

// Un chiffre est plaçable si sa ligne, sa colonne et son bloc sont libres
function placementValide(grille, ligne, colonne, chiffre) {
  for (let i = 0; i < 9; i++) {
    if (grille[ligne][i] === chiffre || grille[i][colonne] === chiffre) {
      return false;
    }
  }
  const debutLigne = ligne - ligne % 3;
  const debutColonne = colonne - colonne % 3;
  for (let y = debutLigne; y < debutLigne + 3; y++) {
    for (let x = debutColonne; x < debutColonne + 3; x++) {
      if (grille[y][x] === chiffre) {
        return false;
      }
    }
  }
  return true;
}

function melanger(liste) {
  const copie = liste.slice();
  for (let i = copie.length - 1; i > 0; i--) {
    const k = Math.floor(Math.random() * (i + 1));
    [copie[i], copie[k]] = [copie[k], copie[i]];
  }
  return copie;
}

// ---------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------

// Remplit une grille vide par retour sur trace, en essayant les chiffres
// dans un ordre aleatoire pour obtenir une grille differente a chaque fois
function remplirGrille(grille) {
  for (let ligne = 0; ligne < 9; ligne++) {
    for (let colonne = 0; colonne < 9; colonne++) {
      if (grille[ligne][colonne] !== 0) {
        continue;
      }
      for (const chiffre of melanger([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
        if (placementValide(grille, ligne, colonne, chiffre)) {
          grille[ligne][colonne] = chiffre;
          if (remplirGrille(grille)) {
            return true;
          }
          grille[ligne][colonne] = 0;
        }
      }
      return false;
    }
  }
  return true;
}

// Compte les solutions, en s'arretant des qu'on en trouve deux.
// On commence par la case qui a le moins de candidats, ce qui accelere
// enormement la recherche.
function compterSolutions(grille, limite) {
  let meilleureLigne = -1;
  let meilleureColonne = -1;
  let meilleursCandidats = null;

  for (let ligne = 0; ligne < 9; ligne++) {
    for (let colonne = 0; colonne < 9; colonne++) {
      if (grille[ligne][colonne] !== 0) {
        continue;
      }
      const candidats = [];
      for (let chiffre = 1; chiffre <= 9; chiffre++) {
        if (placementValide(grille, ligne, colonne, chiffre)) {
          candidats.push(chiffre);
        }
      }
      if (candidats.length === 0) {
        return 0;
      }
      if (meilleursCandidats === null || candidats.length < meilleursCandidats.length) {
        meilleureLigne = ligne;
        meilleureColonne = colonne;
        meilleursCandidats = candidats;
        if (candidats.length === 1) {
          break;
        }
      }
    }
    if (meilleursCandidats !== null && meilleursCandidats.length === 1) {
      break;
    }
  }

  if (meilleursCandidats === null) {
    return 1; // plus aucune case vide : une solution complete
  }

  let total = 0;
  for (const chiffre of meilleursCandidats) {
    grille[meilleureLigne][meilleureColonne] = chiffre;
    total += compterSolutions(grille, limite - total);
    grille[meilleureLigne][meilleureColonne] = 0;
    if (total >= limite) {
      return total;
    }
  }
  return total;
}

// Retire des cases tant que la solution reste unique
function creuserGrille(complete, indicesVises) {
  const grille = copierGrille(complete);
  const positions = melanger(Array.from({ length: 81 }, (_, index) => index));
  let restantes = 81;

  for (const position of positions) {
    if (restantes <= indicesVises) {
      break;
    }
    const ligne = Math.floor(position / 9);
    const colonne = position % 9;
    const memoire = grille[ligne][colonne];
    grille[ligne][colonne] = 0;

    if (compterSolutions(copierGrille(grille), 2) === 1) {
      restantes--;
    } else {
      grille[ligne][colonne] = memoire;
    }
  }
  return grille;
}

function genererSudoku(difficulte) {
  const complete = grilleVideSudoku();
  remplirGrille(complete);
  return {
    solution: complete,
    depart: creuserGrille(complete, difficulte.indices)
  };
}

// ---------------------------------------------------------------------
// Sauvegarde
// ---------------------------------------------------------------------

function sauverSudoku() {
  try {
    localStorage.setItem(CLE_SUDOKU, JSON.stringify({
      difficulte: difficulteChoisie.id,
      depart: grilleDepart,
      joueur: grilleJoueur,
      solution: solutionSudoku,
      notes: notesSudoku.map(ligne => ligne.map(candidats => Array.from(candidats))),
      secondes: secondesSudoku,
      penalites
    }));
  } catch (erreur) {
    // stockage indisponible : la grille ne sera pas reprise
  }
}

function effacerSauvegardeSudoku() {
  try {
    localStorage.removeItem(CLE_SUDOKU);
  } catch (erreur) {
    // rien a faire
  }
}

function chargerSudoku() {
  try {
    const brut = localStorage.getItem(CLE_SUDOKU);
    if (brut === null) {
      return false;
    }
    const donnees = JSON.parse(brut);
    if (!Array.isArray(donnees.depart) || donnees.depart.length !== 9) {
      return false;
    }
    difficulteChoisie = DIFFICULTES.find(d => d.id === donnees.difficulte) || DIFFICULTES[0];
    grilleDepart = donnees.depart;
    grilleJoueur = donnees.joueur;
    solutionSudoku = donnees.solution;
    notesSudoku = donnees.notes.map(ligne => ligne.map(candidats => new Set(candidats)));
    secondesSudoku = donnees.secondes || 0;
    penalites = donnees.penalites || 0;
    return true;
  } catch (erreur) {
    return false;
  }
}

// ---------------------------------------------------------------------
// Partie
// ---------------------------------------------------------------------

function notesVides() {
  return Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => new Set()));
}

function nouvelleGrilleSudoku(difficulte) {
  difficulteChoisie = difficulte;
  afficherMessageSudoku("Generation de la grille...");

  const partie = genererSudoku(difficulte);
  solutionSudoku = partie.solution;
  grilleDepart = partie.depart;
  grilleJoueur = copierGrille(partie.depart);
  notesSudoku = notesVides();
  secondesSudoku = 0;
  penalites = 0;
  caseSelectionnee = null;
  sudokuTermine = false;

  afficherMessageSudoku("");
  construireGrilleSudoku();
  dessinerSudoku();
  lancerChronoSudoku();
  sauverSudoku();
}

function demarrerSudoku() {
  if (chargerSudoku()) {
    sudokuTermine = false;
    construireGrilleSudoku();
    dessinerSudoku();
    lancerChronoSudoku();
  } else {
    nouvelleGrilleSudoku(difficulteChoisie);
  }
}

function lancerChronoSudoku() {
  clearInterval(chronoSudoku);
  chronoSudoku = setInterval(function () {
    if (sudokuTermine || overlayOuvert || jeuActif !== "sudoku") {
      return;
    }
    secondesSudoku++;
    majChronoSudoku();
    if (secondesSudoku % 10 === 0) {
      sauverSudoku();
    }
  }, 1000);
}

function tempsTotal() {
  return secondesSudoku + penalites;
}

function formaterTemps(secondes) {
  const minutes = Math.floor(secondes / 60);
  const reste = secondes % 60;
  return minutes + ":" + String(reste).padStart(2, "0");
}

function casesRestantes() {
  return grilleJoueur.flat().filter(valeur => valeur === 0).length;
}

function grilleComplete() {
  for (let ligne = 0; ligne < 9; ligne++) {
    for (let colonne = 0; colonne < 9; colonne++) {
      if (grilleJoueur[ligne][colonne] !== solutionSudoku[ligne][colonne]) {
        return false;
      }
    }
  }
  return true;
}

function saisirChiffre(chiffre) {
  if (sudokuTermine || caseSelectionnee === null) {
    return;
  }
  const { ligne, colonne } = caseSelectionnee;
  if (grilleDepart[ligne][colonne] !== 0) {
    return; // case imposee par la grille
  }

  if (modeNotes && chiffre !== 0) {
    const candidats = notesSudoku[ligne][colonne];
    if (candidats.has(chiffre)) {
      candidats.delete(chiffre);
    } else {
      candidats.add(chiffre);
    }
    grilleJoueur[ligne][colonne] = 0;
  } else if (chiffre === 0) {
    grilleJoueur[ligne][colonne] = 0;
    notesSudoku[ligne][colonne].clear();
  } else {
    grilleJoueur[ligne][colonne] = chiffre;
    notesSudoku[ligne][colonne].clear();
    // On retire ce chiffre des notes de la ligne, colonne et bloc
    nettoyerNotes(ligne, colonne, chiffre);
  }

  erreursAffichees = false;
  dessinerSudoku();
  sauverSudoku();

  if (grilleComplete()) {
    terminerSudoku();
  }
}

function nettoyerNotes(ligne, colonne, chiffre) {
  for (let i = 0; i < 9; i++) {
    notesSudoku[ligne][i].delete(chiffre);
    notesSudoku[i][colonne].delete(chiffre);
  }
  const debutLigne = ligne - ligne % 3;
  const debutColonne = colonne - colonne % 3;
  for (let y = debutLigne; y < debutLigne + 3; y++) {
    for (let x = debutColonne; x < debutColonne + 3; x++) {
      notesSudoku[y][x].delete(chiffre);
    }
  }
}

// Un chiffre en double dans sa ligne, sa colonne ou son bloc.
// C'est une infraction aux regles, pas une comparaison avec la solution,
// donc cela ne devoile jamais la reponse.
function enConflit(ligne, colonne) {
  const valeur = grilleJoueur[ligne][colonne];
  if (valeur === 0) {
    return false;
  }
  for (let i = 0; i < 9; i++) {
    if (i !== colonne && grilleJoueur[ligne][i] === valeur) {
      return true;
    }
    if (i !== ligne && grilleJoueur[i][colonne] === valeur) {
      return true;
    }
  }
  const debutLigne = ligne - ligne % 3;
  const debutColonne = colonne - colonne % 3;
  for (let y = debutLigne; y < debutLigne + 3; y++) {
    for (let x = debutColonne; x < debutColonne + 3; x++) {
      if ((y !== ligne || x !== colonne) && grilleJoueur[y][x] === valeur) {
        return true;
      }
    }
  }
  return false;
}

function verifierSudoku() {
  if (sudokuTermine) {
    return;
  }
  let fautes = 0;
  for (let ligne = 0; ligne < 9; ligne++) {
    for (let colonne = 0; colonne < 9; colonne++) {
      const valeur = grilleJoueur[ligne][colonne];
      if (valeur !== 0 && valeur !== solutionSudoku[ligne][colonne]) {
        fautes++;
      }
    }
  }
  penalites += PENALITE_VERIFICATION;
  erreursAffichees = true;
  majChronoSudoku();
  dessinerSudoku();
  afficherMessageSudoku(fautes === 0
    ? "Aucune erreur, plus " + PENALITE_VERIFICATION + " s"
    : fautes + (fautes > 1 ? " erreurs" : " erreur") + ", plus " + PENALITE_VERIFICATION + " s");
  sauverSudoku();
}

function terminerSudoku() {
  sudokuTermine = true;
  clearInterval(chronoSudoku);
  effacerSauvegardeSudoku();
  afficherMessageSudoku("Resolu en " + formaterTemps(tempsTotal()));
  finDePartie("sudoku-" + difficulteChoisie.id, tempsTotal(), "Sudoku " + difficulteChoisie.nom);
}

let chronoMessageSudoku = null;

function afficherMessageSudoku(texte) {
  zoneMessageSudoku.textContent = texte;
  clearTimeout(chronoMessageSudoku);
  if (texte !== "") {
    chronoMessageSudoku = setTimeout(() => {
      if (!sudokuTermine) {
        zoneMessageSudoku.textContent = "";
      }
    }, 2500);
  }
}

// ---------------------------------------------------------------------
// Affichage
// ---------------------------------------------------------------------

function construireGrilleSudoku() {
  grilleSudokuHtml.innerHTML = "";
  cellulesSudoku = [];

  for (let ligne = 0; ligne < 9; ligne++) {
    const rangee = [];
    for (let colonne = 0; colonne < 9; colonne++) {
      const cellule = document.createElement("div");
      cellule.className = "case-sudoku";
      cellule.dataset.ligne = String(ligne);
      cellule.dataset.colonne = String(colonne);
      if (colonne % 3 === 2 && colonne !== 8) {
        cellule.classList.add("bord-droit");
      }
      if (ligne % 3 === 2 && ligne !== 8) {
        cellule.classList.add("bord-bas");
      }
      grilleSudokuHtml.appendChild(cellule);
      rangee.push(cellule);
    }
    cellulesSudoku.push(rangee);
  }
}

function memeBloc(a, b) {
  return Math.floor(a.ligne / 3) === Math.floor(b.ligne / 3)
    && Math.floor(a.colonne / 3) === Math.floor(b.colonne / 3);
}

function dessinerSudoku() {
  const valeurActive = caseSelectionnee === null
    ? 0
    : grilleJoueur[caseSelectionnee.ligne][caseSelectionnee.colonne];

  for (let ligne = 0; ligne < 9; ligne++) {
    for (let colonne = 0; colonne < 9; colonne++) {
      const cellule = cellulesSudoku[ligne][colonne];
      const valeur = grilleJoueur[ligne][colonne];
      const imposee = grilleDepart[ligne][colonne] !== 0;

      cellule.classList.remove("imposee", "saisie", "selectionnee", "liee", "identique", "conflit", "erreur", "notes");
      cellule.innerHTML = "";

      if (valeur !== 0) {
        cellule.textContent = String(valeur);
        cellule.classList.add(imposee ? "imposee" : "saisie");

        // Doublon visible immediatement, faute reelle seulement apres verification
        if (!imposee && enConflit(ligne, colonne)) {
          cellule.classList.add("conflit");
        } else if (erreursAffichees && !imposee && valeur !== solutionSudoku[ligne][colonne]) {
          cellule.classList.add("erreur");
        }
        if (valeur === valeurActive && valeurActive !== 0) {
          cellule.classList.add("identique");
        }
      } else if (notesSudoku[ligne][colonne].size > 0) {
        cellule.classList.add("notes");
        for (let chiffre = 1; chiffre <= 9; chiffre++) {
          const note = document.createElement("span");
          note.textContent = notesSudoku[ligne][colonne].has(chiffre) ? String(chiffre) : "";
          cellule.appendChild(note);
        }
      }

      if (caseSelectionnee !== null) {
        const position = { ligne, colonne };
        if (caseSelectionnee.ligne === ligne && caseSelectionnee.colonne === colonne) {
          cellule.classList.add("selectionnee");
        } else if (caseSelectionnee.ligne === ligne
          || caseSelectionnee.colonne === colonne
          || memeBloc(caseSelectionnee, position)) {
          cellule.classList.add("liee");
        }
      }
    }
  }

  zoneRestantes.textContent = String(casesRestantes());
  majChronoSudoku();

  for (const bouton of zoneDifficultes.children) {
    bouton.classList.toggle("active", bouton.dataset.difficulte === difficulteChoisie.id);
  }
  boutonNotes.classList.toggle("active", modeNotes);
}

function majChronoSudoku() {
  zoneChrono.textContent = formaterTemps(tempsTotal());
}

// ---------------------------------------------------------------------
// Commandes
// ---------------------------------------------------------------------

grilleSudokuHtml.addEventListener("click", function (evenement) {
  if (jeuActif !== "sudoku" || overlayOuvert || sudokuTermine) {
    return;
  }
  const cellule = evenement.target.closest(".case-sudoku");
  if (!cellule) {
    return;
  }
  caseSelectionnee = {
    ligne: Number(cellule.dataset.ligne),
    colonne: Number(cellule.dataset.colonne)
  };
  dessinerSudoku();
});

function deplacerSelection(deltaLigne, deltaColonne) {
  if (caseSelectionnee === null) {
    caseSelectionnee = { ligne: 0, colonne: 0 };
  } else {
    caseSelectionnee = {
      ligne: (caseSelectionnee.ligne + deltaLigne + 9) % 9,
      colonne: (caseSelectionnee.colonne + deltaColonne + 9) % 9
    };
  }
  dessinerSudoku();
}

document.addEventListener("keydown", function (evenement) {
  if (jeuActif !== "sudoku" || overlayOuvert) {
    return;
  }
  const touche = evenement.key.toLowerCase();

  if (/^[1-9]$/.test(touche)) {
    saisirChiffre(Number(touche));
  } else if (touche === "0" || touche === "delete" || touche === "backspace") {
    saisirChiffre(0);
  } else if (touche === "arrowup" || touche === "z") {
    deplacerSelection(-1, 0);
  } else if (touche === "arrowdown" || touche === "s") {
    deplacerSelection(1, 0);
  } else if (touche === "arrowleft" || touche === "q") {
    deplacerSelection(0, -1);
  } else if (touche === "arrowright" || touche === "d") {
    deplacerSelection(0, 1);
  } else if (touche === "n") {
    modeNotes = !modeNotes;
    dessinerSudoku();
  } else if (touche === "escape") {
    quitterJeu();
    return;
  } else {
    return;
  }
  evenement.preventDefault();
});

// Pave numerique pour la souris et le doigt
for (let chiffre = 1; chiffre <= 9; chiffre++) {
  const bouton = document.createElement("button");
  bouton.type = "button";
  bouton.className = "touche-sudoku";
  bouton.textContent = String(chiffre);
  bouton.addEventListener("click", () => saisirChiffre(chiffre));
  paveSudoku.appendChild(bouton);
}
const boutonEffacer = document.createElement("button");
boutonEffacer.type = "button";
boutonEffacer.className = "touche-sudoku effacer";
boutonEffacer.textContent = "\u232B";
boutonEffacer.addEventListener("click", () => saisirChiffre(0));
paveSudoku.appendChild(boutonEffacer);

// Boutons de difficulte
DIFFICULTES.forEach(difficulte => {
  const bouton = document.createElement("button");
  bouton.type = "button";
  bouton.className = "jeu-quitter difficulte";
  bouton.dataset.difficulte = difficulte.id;
  bouton.textContent = difficulte.nom;
  bouton.addEventListener("click", () => nouvelleGrilleSudoku(difficulte));
  zoneDifficultes.appendChild(bouton);
});

boutonNotes.addEventListener("click", function () {
  modeNotes = !modeNotes;
  dessinerSudoku();
});
boutonVerifier.addEventListener("click", verifierSudoku);
boutonNouvelleSudoku.addEventListener("click", () => nouvelleGrilleSudoku(difficulteChoisie));
boutonQuitterSudoku.addEventListener("click", quitterJeu);

// ===== Inscription dans l'arcade =====
enregistrerJeu({
  id: "sudoku",
  nom: "Sudoku",
  code: "123456789",
  section: zoneSudoku,
  demarrer: demarrerSudoku,
  arreter: () => clearInterval(chronoSudoku),
  plusBasEstMieux: true,
  formaterScore: formaterTemps,
  classement: () => "sudoku-" + difficulteChoisie.id
});