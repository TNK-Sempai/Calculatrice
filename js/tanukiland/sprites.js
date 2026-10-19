// =====================================================================
//  TANUKILAND - sprites
//  Tout le dessin des personnages tient ici, en chaines de pixels avec
//  palette. Le moteur ne connait que des noms de comportement ; c'est
//  ce fichier, et la table d'apparences de chaque monde, qui decident
//  a quoi ressemble un rampant dans la foret de bambous.
//
//  Direction artistique : fond sombre, vert de bambou pour la
//  vegetation, vermillon pour le sacre, beige papier pour les omikuji.
// =====================================================================

import { compilerSprite } from "../noyau/sprite.js";

export const VERMILLON = "#c8372d";
export const VERMILLON_SOMBRE = "#8f2620";
export const LIME = "#9fc43f";
export const LIME_SOMBRE = "#5e7626";
export const PAPIER = "#e8dcc8";

// ---------------------------------------------------------------------
// Le tanuki
// Deux rangees vides en haut du dessin reservent la place du chapeau :
// il se pose ainsi sans decaler le corps, et les trois poses de marche
// n'ont pas a etre redessinees en double.
// ---------------------------------------------------------------------

const TANUKI = {
  taillePixel: 2,
  palette: { b: "#7a5a3a", f: "#4a3622", c: PAPIER, n: "#141414" },
  images: {
    marche1: [
      "............",
      "............",
      "..ff....ff..",
      "..fbbbbbbf..",
      ".fbbnbbnbbf.",
      ".fbcnbbncbf.",
      ".fbbbccbbbf.",
      "..fbccccbf..",
      ".fbcccccbf.f",
      ".fbcccccbf.f",
      "..fbbccbbf..",
      "..fb....bf..",
      "..ff....ff..",
      "............"
    ],
    marche2: [
      "............",
      "............",
      "..ff....ff..",
      "..fbbbbbbf..",
      ".fbbnbbnbbf.",
      ".fbcnbbncbf.",
      ".fbbbccbbbf.",
      "..fbccccbf..",
      ".fbcccccbf.f",
      ".fbcccccbf.f",
      "..fbbccbbf..",
      ".fb......bf.",
      ".ff......ff.",
      "............"
    ],
    saut: [
      "............",
      "............",
      "..ff....ff..",
      "..fbbbbbbf..",
      ".fbbnbbnbbf.",
      ".fbcnbbncbf.",
      ".fbbbccbbbf.",
      "fbfbccccbfbf",
      ".fbcccccbf.f",
      ".fbcccccbf.f",
      "..fbbccbbf..",
      "..fbb..bbf..",
      "...ff..ff...",
      "............"
    ]
  }
};

// Le chapeau de paille de Shigaraki, dessine par-dessus le tanuki.
const CHAPEAU = {
  taillePixel: 2,
  palette: { p: "#d8b96a", q: "#a8873f" },
  images: {
    porte: [
      "....pppp....",
      "..pppppppp..",
      "qqqqqqqqqqqq",
      "............",
      "............",
      "............",
      "............",
      "............",
      "............",
      "............",
      "............",
      "............",
      "............",
      "............"
    ]
  }
};

// ---------------------------------------------------------------------
// Les yokai
// ---------------------------------------------------------------------

// Kasa-obake : le parapluie de papier a un oeil, une jambe et une
// longue langue. Comportement rampant.
const KASA_OBAKE = {
  taillePixel: 2,
  palette: {
    t: "#6a4aa0", u: "#4a3270", c: PAPIER, n: "#141414",
    r: VERMILLON, w: "#8a6a3a"
  },
  images: {
    marche1: [
      "....tttt....",
      "..tttuuttt..",
      ".tttuuuuttt.",
      "tttuuuuuuttt",
      "uuuuuuuuuuuu",
      ".....ww.....",
      "....cccc....",
      "....cnnc....",
      "....cccc....",
      ".....rr.....",
      ".....ww.....",
      "...wwwwww..."
    ],
    marche2: [
      "....tttt....",
      "..tttuuttt..",
      ".tttuuuuttt.",
      "tttuuuuuuttt",
      "uuuuuuuuuuuu",
      ".....ww.....",
      "....cccc....",
      "....cnnc....",
      "....cccc....",
      ".....rr.....",
      "....wwww....",
      "..wwww......"
    ]
  }
};

// Kappa : l'enfant de la riviere, sa coupelle d'eau sur la tete et sa
// carapace. Comportement carapace.
const KAPPA = {
  taillePixel: 2,
  palette: {
    v: "#7fa32f", w: "#4a6b1c", s: "#8a6a3a", d: "#5a4426",
    c: PAPIER, n: "#141414", b: "#5a8fa8"
  },
  images: {
    marche1: [
      "...wbbbbw...",
      "..wvvvvvvw..",
      ".wvvnvvnvvw.",
      ".wvvvccvvvw.",
      "..wvvccvvw..",
      ".ssssddssss.",
      "sssddddddsss",
      "ssddddddddss",
      ".ssssddssss.",
      "..wvw..wvw..",
      "..wvw..wvw..",
      ".ww........."
    ],
    marche2: [
      "...wbbbbw...",
      "..wvvvvvvw..",
      ".wvvnvvnvvw.",
      ".wvvvccvvvw.",
      "..wvvccvvw..",
      ".ssssddssss.",
      "sssddddddsss",
      "ssddddddddss",
      ".ssssddssss.",
      "..wvw..wvw..",
      "..wvw..wvw..",
      ".........ww."
    ],
    carapace: [
      "............",
      "............",
      "............",
      "............",
      "...ssssss...",
      ".ssssddssss.",
      "sssddddddsss",
      "ssddddddddss",
      "sssddddddsss",
      ".ssssddssss.",
      "...ssssss...",
      "............"
    ]
  }
};

// Karasu-tengu : le tengu corbeau, masque rouge et bec jaune.
// Comportement volant.
const KARASU_TENGU = {
  taillePixel: 2,
  palette: {
    n: "#4a4a58", g: "#6e6e80", r: VERMILLON, j: "#d8b96a", c: PAPIER
  },
  images: {
    vol1: [
      "g..........g",
      ".g........g.",
      "..gg....gg..",
      "...nnnnnn...",
      "..nrrrrrrn..",
      "..nrcnncrn..",
      "...njjjjn...",
      "...nnnnnn...",
      "...nnnnnn...",
      "....n..n....",
      "............",
      "............"
    ],
    vol2: [
      "............",
      "............",
      "...nnnnnn...",
      "..nrrrrrrn..",
      "..nrcnncrn..",
      "g..njjjjn..g",
      ".gg.nnnn.gg.",
      "..ggnnnngg..",
      "....n..n....",
      "............",
      "............",
      "............"
    ]
  }
};

// Tsuchigumo : l'araignee de terre, suspendue a son fil.
// Comportement tombeur.
const TSUCHIGUMO = {
  taillePixel: 2,
  palette: { d: "#5a4560", w: "#7d6a85", n: "#6a5a72", r: VERMILLON, c: PAPIER },
  images: {
    suspendu: [
      ".....nn.....",
      ".....nn.....",
      "n..nnnnnn..n",
      ".nnddddddnn.",
      "nnddrddrddnn",
      ".nddwddwddn.",
      "n.ndccccdn.n",
      "..nnnnnnnn..",
      ".n..n..n..n.",
      "n...n..n...n",
      "............",
      "............"
    ],
    marche1: [
      "............",
      "............",
      "n..nnnnnn..n",
      ".nnddddddnn.",
      "nnddrddrddnn",
      ".nddwddwddn.",
      "n.ndccccdn.n",
      "..nnnnnnnn..",
      ".n..n..n..n.",
      "n...n..n...n",
      "............",
      "............"
    ],
    marche2: [
      "............",
      "............",
      "...nnnnnn...",
      ".nnddddddnn.",
      "nnddrddrddnn",
      ".nddwddwddn.",
      "n.ndccccdn.n",
      "..nnnnnnnn..",
      "n..n....n..n",
      ".nn......nn.",
      "............",
      "............"
    ]
  }
};

// ---------------------------------------------------------------------
// Decor anime
// ---------------------------------------------------------------------

// La statue de Jizo, protecteur des voyageurs. Elle prend son bavoir
// vermillon au passage du tanuki : c'est tout le signal du point de
// controle, sans un mot d'interface.
const JIZO = {
  taillePixel: 2,
  palette: { s: "#9a9a92", d: "#6e6e68", n: "#141414", r: VERMILLON, e: VERMILLON_SOMBRE },
  images: {
    endormi: [
      "............",
      "....ssss....",
      "...ssssss...",
      "..ssssssss..",
      "..sdssssds..",
      "..ssnssnss..",
      "..ssssssss..",
      "...ssssss...",
      "....dddd....",
      "..ssssssss..",
      ".ssssssssss.",
      ".ssssssssss.",
      ".ssssssssss.",
      ".ssssssssss.",
      "dddddddddddd",
      "dddddddddddd"
    ],
    actif: [
      "............",
      "....ssss....",
      "...ssssss...",
      "..ssssssss..",
      "..sdssssds..",
      "..ssnssnss..",
      "..ssssssss..",
      "...ssssss...",
      "....dddd....",
      "..rrrrrrrr..",
      ".rrrrrrrrrr.",
      ".errrrrrrre.",
      "..errrrrre..",
      ".ssseeeesss.",
      "dddddddddddd",
      "dddddddddddd"
    ]
  }
};

// Une feuille, la monnaie du tanuki. Huit pixels de cote, soit une
// tuile exacte une fois pre-rendue.
const FEUILLE = {
  taillePixel: 2,
  palette: { v: LIME, w: LIME_SOMBRE, t: "#4a3622" },
  images: {
    feuille: [
      "....t...",
      "...vvv..",
      "..vvvvv.",
      ".vvvwvvv",
      ".vvvwvvv",
      "..vvwvv.",
      "...vvv..",
      "........"
    ]
  }
};

const CAISSE = {
  taillePixel: 2,
  palette: { s: "#8a6a3a", d: "#5a4426", l: "#a88a52" },
  images: {
    entiere: [
      "dddddddd",
      "dlllllld",
      "dsdssdsd",
      "dssddssd",
      "dssddssd",
      "dsdssdsd",
      "dlllllld",
      "dddddddd"
    ]
  }
};

const TUILE_TOIT = {
  taillePixel: 2,
  palette: { a: "#4a5560", b: "#63707c", c: "#333c45" },
  images: {
    tuile: [
      "bbbbbbbb",
      "aaaaaaaa",
      "aaaaaaaa",
      "cccccccc",
      "........",
      "........",
      "........",
      "........"
    ]
  }
};

// La boite d'omikuji, l'oracle de papier des sanctuaires.
const OMIKUJI = {
  taillePixel: 2,
  palette: { p: PAPIER, q: "#d8c9a8", w: "#8a6a3a", r: VERMILLON },
  images: {
    pleine: [
      "wwwwwwww",
      "wppppppw",
      "wpqrrqpw",
      "wpqrrqpw",
      "wppppppw",
      "wpqqqqpw",
      "wppppppw",
      "wwwwwwww"
    ],
    vide: [
      "wwwwwwww",
      "wqqqqqqw",
      "wqwwwwqw",
      "wqwwwwqw",
      "wqqqqqqw",
      "wqqqqqqw",
      "wqqqqqqw",
      "wwwwwwww"
    ]
  }
};

// ---------------------------------------------------------------------
// Compilation
// ---------------------------------------------------------------------

const DEFINITIONS = {
  tanuki: TANUKI,
  chapeau: CHAPEAU,
  kasaObake: KASA_OBAKE,
  kappa: KAPPA,
  karasuTengu: KARASU_TENGU,
  tsuchigumo: TSUCHIGUMO,
  jizo: JIZO,
  feuille: FEUILLE,
  caisse: CAISSE,
  tuileToit: TUILE_TOIT,
  omikuji: OMIKUJI
};

let compiles = null;

// Les sprites ne se compilent qu'une fois, au premier demarrage, et non
// au chargement du module : un jeu qu'on n'ouvre jamais ne doit rien
// couter a la page.
export function sprites() {
  if (compiles === null) {
    compiles = {};
    for (const [nom, definition] of Object.entries(DEFINITIONS)) {
      compiles[nom] = compilerSprite(definition);
    }
  }
  return compiles;
}
