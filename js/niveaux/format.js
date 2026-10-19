// =====================================================================
//  FORMAT DES NIVEAUX
//  Un niveau est un fichier de donnees, jamais du code : une liste de
//  lignes de texte, un caractere par tuile, plus une liste d'entites
//  pour ce qui porte des reglages.
//
//  La regle de partage entre les deux est simple et se verifie a l'oeil :
//  ce qui n'a aucun parametre tient dans la grille, ce qui en a un va
//  dans entites. Une caisse est toujours une caisse, elle tient dans la
//  grille ; une planche mobile a une amplitude et une vitesse, elle n'y
//  tient pas.
//
//  La legende vit ici et non dans les niveaux : si chaque niveau pouvait
//  inventer ses propres symboles, il redeviendrait du code deguise.
// =====================================================================

export const VIDE = "vide";
export const PLEIN = "plein";
export const TRAVERSABLE = "traversable";
export const TUILE_TOIT = "tuileToit";
export const CAISSE = "caisse";
export const PIEU = "pieu";
export const FEUILLE = "feuille";
export const EAU = "eau";
export const JIZO = "jizo";
export const TORII = "torii";
export const BAMBOU = "bambou";

export const LEGENDE = {
  " ": VIDE,
  "#": PLEIN,          // terre, solide dans les quatre sens
  "=": TRAVERSABLE,    // planche fixe, solide seulement par le dessus
  "-": TUILE_TOIT,     // tuile de toit : porte, puis tombe
  "C": CAISSE,         // caisse de bois, cassable par en dessous
  "^": PIEU,           // pieu de bambou taille en pointe, mortel
  "o": FEUILLE,        // feuille a ramasser
  "~": EAU,            // la riviere, mortelle
  "J": JIZO,           // statue de Jizo, point de controle
  "!": TORII,          // torii vermillon, sortie du niveau
  "|": BAMBOU          // tige de bambou, decor seul
};

// Ce que chaque nature fait subir au jeu. Les regles vivent ici plutot
// que dispersees en tests dans la boucle : ajouter une nature ne demande
// alors qu'une ligne.
export const PROPRIETES = {
  [VIDE]: {},
  [PLEIN]: { solide: true },
  [TRAVERSABLE]: { porte: true },
  [TUILE_TOIT]: { porte: true, fragile: true },
  [CAISSE]: { solide: true, cassable: true },
  [PIEU]: { mortel: true },
  // fatal : aucune protection n'y change rien. On se noie avec ou sans
  // chapeau, alors qu'un pieu n'est qu'un coup de plus.
  [EAU]: { mortel: true, fatal: true },
  [FEUILLE]: { ramassable: true },
  [JIZO]: { controle: true },
  [TORII]: { sortie: true },
  [BAMBOU]: {}
};

// Les comportements de yokai que le moteur sait animer. Les noms sont
// volontairement generiques : un monde futur pourra leur donner d'autres
// creatures sans qu'une ligne du moteur bouge.
export const COMPORTEMENTS = ["rampant", "carapace", "volant", "tombeur"];

// Les types d'entites acceptes, avec leurs parametres obligatoires.
const TYPES_ENTITES = {
  yokai: ["comportement"],
  plateforme: ["axe", "amplitude", "vitesse"],
  omikuji: ["contenu"]
};

const AXES = ["x", "y"];
const CONTENUS = ["feuille", "chapeau"];

// ---------------------------------------------------------------------
// Verification du format
// ---------------------------------------------------------------------

// Rend la liste des fautes trouvees. Une liste vide veut dire que le
// niveau est lisible. Mieux vaut refuser un niveau bruyamment que de le
// dessiner a moitie : une ligne trop courte se voit sinon des heures
// plus tard, sous la forme d'un trou inexplicable dans le decor.
export function verifierNiveau(niveau) {
  const fautes = [];

  if (niveau === null || typeof niveau !== "object") {
    return ["le niveau n'est pas un objet"];
  }
  if (typeof niveau.nom !== "string" || niveau.nom === "") {
    fautes.push("nom manquant");
  }
  if (typeof niveau.tuile !== "number" || niveau.tuile <= 0) {
    fautes.push("taille de tuile absente ou negative");
  }
  if (!Array.isArray(niveau.decor) || niveau.decor.length === 0) {
    fautes.push("decor absent ou vide");
    return fautes;
  }

  // Toutes les lignes doivent avoir exactement la meme largeur
  const largeur = niveau.decor[0].length;
  niveau.decor.forEach((ligne, index) => {
    if (typeof ligne !== "string") {
      fautes.push("ligne " + index + " : ce n'est pas une chaine");
      return;
    }
    if (ligne.length !== largeur) {
      fautes.push("ligne " + index + " : " + ligne.length
        + " caracteres au lieu de " + largeur);
    }
    for (let colonne = 0; colonne < ligne.length; colonne++) {
      const caractere = ligne[colonne];
      if (LEGENDE[caractere] === undefined) {
        fautes.push("ligne " + index + ", colonne " + colonne
          + " : symbole inconnu " + JSON.stringify(caractere));
      }
    }
  });

  // Le depart doit tomber dans la grille
  const depart = niveau.depart;
  if (depart === null || typeof depart !== "object") {
    fautes.push("depart absent");
  } else if (depart.colonne < 0 || depart.colonne >= largeur
    || depart.ligne < 0 || depart.ligne >= niveau.decor.length) {
    fautes.push("depart hors de la grille : colonne " + depart.colonne
      + ", ligne " + depart.ligne);
  }

  if (niveau.entites !== undefined && !Array.isArray(niveau.entites)) {
    fautes.push("entites : ce n'est pas une liste");
    return fautes;
  }
  (niveau.entites || []).forEach((entite, index) => {
    fautes.push(...verifierEntite(entite, index, largeur, niveau.decor.length));
  });
  return fautes;
}

function verifierEntite(entite, index, colonnes, rangees) {
  const prefixe = "entite " + index + " : ";
  if (entite === null || typeof entite !== "object") {
    return [prefixe + "ce n'est pas un objet"];
  }
  const attendus = TYPES_ENTITES[entite.type];
  if (attendus === undefined) {
    return [prefixe + "type inconnu " + JSON.stringify(entite.type)];
  }

  const fautes = [];
  if (!Number.isInteger(entite.colonne) || entite.colonne < 0 || entite.colonne >= colonnes
    || !Number.isInteger(entite.ligne) || entite.ligne < 0 || entite.ligne >= rangees) {
    fautes.push(prefixe + "hors de la grille : colonne " + entite.colonne
      + ", ligne " + entite.ligne);
  }
  attendus.forEach(parametre => {
    if (entite[parametre] === undefined) {
      fautes.push(prefixe + "parametre manquant " + JSON.stringify(parametre));
    }
  });

  if (entite.type === "yokai" && entite.comportement !== undefined
    && !COMPORTEMENTS.includes(entite.comportement)) {
    fautes.push(prefixe + "comportement inconnu " + JSON.stringify(entite.comportement));
  }
  if (entite.type === "plateforme") {
    if (entite.axe !== undefined && !AXES.includes(entite.axe)) {
      fautes.push(prefixe + "axe inconnu " + JSON.stringify(entite.axe));
    }
    if (entite.amplitude !== undefined
      && (typeof entite.amplitude !== "number" || entite.amplitude <= 0)) {
      fautes.push(prefixe + "amplitude absente ou negative");
    }
    if (entite.vitesse !== undefined
      && (typeof entite.vitesse !== "number" || entite.vitesse <= 0)) {
      fautes.push(prefixe + "vitesse absente ou negative");
    }
  }
  if (entite.type === "omikuji" && entite.contenu !== undefined
    && !CONTENUS.includes(entite.contenu)) {
    fautes.push(prefixe + "contenu inconnu " + JSON.stringify(entite.contenu));
  }
  return fautes;
}

// ---------------------------------------------------------------------
// Verification de jouabilite
// ---------------------------------------------------------------------

// Ce qu'un niveau de Tanukiland doit contenir pour etre jouable, au-dela
// d'etre lisible. Separe de verifierNiveau pour qu'un niveau d'essai,
// sans sortie ni point de controle, reste un niveau valable.
export function verifierProgression(niveau) {
  const fautes = [];
  const colonnes = niveau.decor[0].length;
  const jizo = [];
  let torii = 0;

  niveau.decor.forEach((ligne, rangee) => {
    for (let colonne = 0; colonne < ligne.length; colonne++) {
      const nature = LEGENDE[ligne[colonne]];
      if (nature === JIZO) {
        jizo.push({ colonne, rangee });
      } else if (nature === TORII) {
        torii++;
      }
    }
  });

  // Le tanuki fait plus d'une tuile de haut : sa tuile de depart et
  // celle juste au-dessus doivent etre libres.
  const surLeDepart = niveau.decor[niveau.depart.ligne];
  const auDessusDuDepart = niveau.decor[niveau.depart.ligne - 1];
  if (surLeDepart === undefined || LEGENDE[surLeDepart[niveau.depart.colonne]] !== VIDE) {
    fautes.push("la tuile de depart n'est pas vide");
  }
  if (auDessusDuDepart === undefined
    || LEGENDE[auDessusDuDepart[niveau.depart.colonne]] !== VIDE) {
    fautes.push("la tuile au-dessus du depart doit rester vide");
  }
  if (torii === 0) {
    fautes.push("aucun torii : le niveau n'a pas de sortie");
  }
  if (jizo.length !== 1) {
    fautes.push("il faut exactement une statue de Jizo, il y en a " + jizo.length);
  } else {
    const part = jizo[0].colonne / colonnes;
    if (part < 0.3 || part > 0.7) {
      fautes.push("la statue de Jizo est colonne " + jizo[0].colonne
        + ", soit a " + Math.round(part * 100) + " pour cent du niveau,"
        + " alors qu'on l'attend vers le milieu");
    }
    // La statue fait deux tuiles de haut : celle du dessus lui revient.
    const dessus = niveau.decor[jizo[0].rangee - 1];
    if (dessus === undefined || LEGENDE[dessus[jizo[0].colonne]] !== VIDE) {
      fautes.push("la tuile au-dessus de la statue de Jizo, colonne "
        + jizo[0].colonne + ", doit rester vide");
    }
  }
  return fautes;
}

// ---------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------

// Transforme un niveau verifie en quelque chose d'interrogeable, sans
// rien decider de la physique : le jeu reste maitre de ce qui bloque.
//
// Les natures sont modifiables, parce que le decor change en cours de
// partie : une caisse cassee, une feuille ramassee, une tuile de toit
// tombee. reinitialiser() remet le decor d'origine au debut d'une vie.
export function preparerNiveau(niveau) {
  const lignes = niveau.decor;
  const colonnes = lignes[0].length;
  const origine = lignes.map(ligne => Array.from(ligne, c => LEGENDE[c]));
  const natures = origine.map(rangee => rangee.slice());

  return {
    nom: niveau.nom,
    tuile: niveau.tuile,
    colonnes,
    rangees: lignes.length,
    largeur: colonnes * niveau.tuile,
    hauteur: lignes.length * niveau.tuile,
    // Le depart est donne en tuiles autant qu'en pixels : un corps plus
    // haut qu'une tuile doit pouvoir se poser par les pieds, et non par
    // le coin, sinon il demarre encastre dans le sol.
    depart: {
      colonne: niveau.depart.colonne,
      ligne: niveau.depart.ligne,
      x: niveau.depart.colonne * niveau.tuile,
      y: niveau.depart.ligne * niveau.tuile
    },
    entites: niveau.entites === undefined ? [] : niveau.entites,

    // Nature d'une tuile, VIDE en dehors de la grille pour que le
    // personnage puisse sortir par les cotes et tomber par le bas.
    natureEn(colonne, rangee) {
      if (colonne < 0 || colonne >= colonnes || rangee < 0 || rangee >= lignes.length) {
        return VIDE;
      }
      return natures[rangee][colonne];
    },

    natureDorigine(colonne, rangee) {
      if (colonne < 0 || colonne >= colonnes || rangee < 0 || rangee >= lignes.length) {
        return VIDE;
      }
      return origine[rangee][colonne];
    },

    definirNature(colonne, rangee, nature) {
      if (colonne < 0 || colonne >= colonnes || rangee < 0 || rangee >= lignes.length) {
        return;
      }
      natures[rangee][colonne] = nature;
    },

    propriete(colonne, rangee) {
      return PROPRIETES[this.natureEn(colonne, rangee)] || {};
    },

    reinitialiser() {
      origine.forEach((rangee, index) => {
        natures[index] = rangee.slice();
      });
    },

    natureAuPoint(x, y) {
      return this.natureEn(Math.floor(x / niveau.tuile), Math.floor(y / niveau.tuile));
    }
  };
}
