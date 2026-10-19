// =====================================================================
//  MONDE 1, NIVEAU 2 : LE BORD DE LA RIVIERE
//  360 tuiles. Introduit le kappa et sa carapace, les pieux de bambou,
//  les planches mobiles et les boites d'omikuji.
//
//  Progression :
//    colonnes 0 a 25     un sol plat, des feuilles, rien a craindre
//    colonnes 26 a 45    le premier kappa, puis un mur contre lequel sa
//                        carapace rebondit
//    colonnes 46 a 70    les pieux, un seul d'abord, deux ensuite
//    colonnes 71 a 82    la riviere, sur une planche qui la traverse
//                        entierement : il suffit d'attendre
//    colonnes 83 a 115   les oracles de papier, dont un en hauteur
//    colonnes 116 a 145  caisses, kappa, et un chemin haut facultatif
//    colonnes 146 a 157  la seconde riviere, sur deux planches
//                        verticales qu'il faut enchainer
//    colonne 180         la statue de Jizo
//    colonnes 191 a 232  le couloir des carapaces
//    colonnes 233 a 285  un chemin haut par-dessus le vide, mieux paye,
//                        et des pieux sur le chemin bas
//    colonnes 311 a 322  la derniere riviere, avec son ilot et son kappa
//    colonnes 348 a 355  le torii de sortie
// =====================================================================
export default {
  nom: "Le bord de la riviere",
  tuile: 16,
  depart: { colonne: 3, ligne: 20 },
  decor: [
    "                         |                             |                             |                             |                             |                             |                             |                             |                             |                             |                             |                             |    ",
    "             |           |                 |           |                             |                 |           |                 |           |                 |           |                 |           |                 |           |                             |                 |           |                             |                 |           |    ",
    " |           |           |     |           |           |     |                       |     |           |           |     |           |           |                 |           |     |           |           |     |           |           |     |                       |     |           |           |     |                       |     |           |           |    ",
    " |           |     |     |     |           |     |     |     |                       |     |           |     |     |     |           |     |     |                 |     |     |     |           |     |     |     |           |     |     |     |                 |     |     |           |     |     |     |                       |     |           |     |     |    ",
    " |     |     |     |     |     |     |     |     |     |     |     |                 |     |     |     |     |     |     |     |     |     |     |                 |     |     |     |     |     |     |     |     |     |     |     |     |     |     |           |     |     |     |     |     |     |     |     |                 |     |     |     |     |     |    ",
    " |     |     |     |     |     |     |     |     |     |     |     |                 |     |     |     |     |     |     |     |     |     |     |                 |     |     |     |     |     |     |     |     |     |     |     |     |     |     |           |     |     |     |     |     |     |     |     |                 |     |     |     |     |     |    ",
    " |     |     |     |     |     |     |     |     |     |     |     |                 |     |     |     |     |     |     |     |     |     |     |                 |     |     |     |     |     |     |     |     |     |     |     |     |     |     |           |     |     |     |     |     |     |     |     |                 |     |     |     |     |     |    ",
    " |     |     |     |     |     |     |     |     |     |     |     |                 |     |     |     |     |     |     |     |     |     |     |                 |     |     |     |     |     |     |     |     |     |     |     |     |     |     |           |     |     |     |     |     |     |     |     |                 |     |     |     |     |     |    ",
    " |     |     |     |     |     |     |     |     |     |     |     |                 |     |     |     |     |     |     |     |     |     |     |                 |     |     |     |     |     |     |     |     |     |     |     |     |     |     |           |     |     |     |     |     |     |     |     |                 |     |     |     |     |     |    ",
    " |     |     |     |     |     |     |     |     |     |     |     |                 |     |     |     |     |     |     |     |     |     |     |                 |     |     |     |     |     |     |     |     |     |     |     |     |     |     |           |     |     |     |     |     |     |     |     |                 |     |     |     |     |     |    ",
    " |     |     |     |     |     |     |     |     |     |     |     |                 |     |     |     |     |     |     |     |     |     |     |                 |     |     |     |     |     |     |     |     |     |     |     |     |     |     |           |     |     |     |     |     |     |     |     |                 |     |     |     |     |     |    ",
    " |     |     |     |     |     |     |     |     |     |     |     |                 |     |     |     |     |     |     |     |     |     |     |                 |     |     |     |     |     |     |     |     |     |     |     |     |     |     |           |     |     |     |     |     |     |     |     |                 |     |     |     |     |     |    ",
    " |     |     |     |     |     |     |     |     |     |     |     |                 |     |     |     |     |     |     |     |     |     |     |                 |     |     |     |     |     |     |     |     |     |     |     |     |     |     |           |     |     |     |     |     |     |     |     |                 |     |     |     |     |     |    ",
    " |     |     |     |     |     |     |     |     |     |     |     |                 |     |     |     |     |     |     |     | ooooooo   |     |                 |     |     |     |     |     |     |     |     |     |     |     |     |     |     |           |     |     |     |     |     |     |     |     |                 |     |     |     |     |     |    ",
    " |     |     |     |     |     |     |     |     |     |     |     |                 |     |     |     |     |     |     |     |=========  |     |                 |     |     |     |     |     |     |     |     |     |     |     |     |     |   ooooooo       |     |     |     |     |     |     |     |     |                 |     |     |     |     |     |    ",
    " |     |     |     |     |     |     |     |     |     |     |     |                 |     |     |     |     |     |     |     |     |     |     |    ooo          |     |     |     |     |     |     |     |   ooooooo |     |     |     |     |  =========      |     |     |   ooooooo |     |     |     |     |                 |     |     |     |   !!!!!!!!!    ",
    " |     |     |     |     |     |   ooooo   |     |     |     |     |                 | ooooo     |     |     |     |     |     |     |     |     |                 |     |   ooooo   |     |     |     |     |  =========|     |     |     |     |     |           |     |     |  =========|     |     |     ooooo |                 |     ooooo |     |    !!!!!!!|    ",
    " |     |     |   oooo    |     |  =======  |     |     |     ooo   |                 |=======    |   ooooooo |     |    ooooo  |     |     |     |                 |     |  =======  |     |     |     |     |     |     |     |     |     |     |     |           |     |     |     |     |     |     |    =======|         oo      |    =======|     |    !|    !|    ",
    " |     |     |  ======   |     |     |     |     |     |     CCC   |      oooooo     |     |     |  =========|     |    CCCCC  |     |     |     |                 |     |     |     |     |     |     |     |     |     |     |     |     |     |     |           |  ooooooo  |     |     |     |     |     |     |         ====    |     |     |     |    !|    !|    ",
    " |     |     |     |     |     |     |     ##    ooo   |oooo |     |                 |     |     |     |     |     |     |     |     |     |     |                 |     |     |     |     |     |     |     |     |     |     |     |     |ooooo|     |           |     |     |     |     |     |     |     |     |                 |     |     |     |    !|    !|    ",
    " |    ooooooo|     |     |     |  oooooo   ##    |     |     |     |                 |     |     |     |     |     |     |     |     |     |     |                ooooooo|     |    J|     |     |     |ooooooooooooooooooooooooooooooo  ##################     ###^^#########^^##############   |     |ooooooo    |                 |ooooooooo  |     |    !|    !|    ",
    "##################################################^######^^#####^^#####~~~~~~~~~~~~###############################################################~~~~~~~~~~~~#############################################################################################     #######################################################~~~~~~~~~~~~#####################################",
    "#######################################################################~~~~~~~~~~~~###############################################################~~~~~~~~~~~~#############################################################################################     #######################################################~~~~~~~~~~~~#####################################",
    "#######################################################################~~~~~~~~~~~~###############################################################~~~~~~~~~~~~#############################################################################################     #######################################################~~~~~~~~~~~~#####################################"
  ],
  entites: [
    // Le premier kappa est seul sur un sol plat : on peut l'ecraser,
    // puis pousser ou ramasser sa carapace sans rien risquer. Le mur
    // des colonnes 43 et 44 la renvoie, ce qui apprend le rebond.
    { type: "yokai", comportement: "carapace", colonne: 31, ligne: 20 },
    { type: "yokai", comportement: "carapace", colonne: 68, ligne: 20 },
    { type: "plateforme", colonne: 71, ligne: 19, axe: "x", amplitude: 9, vitesse: 45 },
    { type: "omikuji", colonne: 96, ligne: 17, contenu: "feuille" },
    { type: "omikuji", colonne: 104, ligne: 14, contenu: "chapeau" },
    // Le couloir des carapaces : un kappa en tete, trois kasa-obake
    // et un second kappa alignes derriere. Porter la carapace et la
    // lancer nettoie tout le couloir d'un trait.
    { type: "yokai", comportement: "rampant", colonne: 112, ligne: 20 },
    { type: "yokai", comportement: "carapace", colonne: 132, ligne: 13 },
    { type: "yokai", comportement: "rampant", colonne: 141, ligne: 20 },
    { type: "plateforme", colonne: 147, ligne: 17, axe: "y", amplitude: 4, vitesse: 35 },
    { type: "plateforme", colonne: 153, ligne: 16, axe: "y", amplitude: 4, vitesse: 40 },
    { type: "omikuji", colonne: 185, ligne: 16, contenu: "feuille" },
    { type: "yokai", comportement: "carapace", colonne: 196, ligne: 20 },
    { type: "yokai", comportement: "rampant", colonne: 206, ligne: 20 },
    { type: "yokai", comportement: "rampant", colonne: 213, ligne: 20 },
    { type: "yokai", comportement: "rampant", colonne: 220, ligne: 20 },
    { type: "yokai", comportement: "carapace", colonne: 227, ligne: 20 },
    { type: "omikuji", colonne: 248, ligne: 11, contenu: "chapeau" },
    { type: "yokai", comportement: "carapace", colonne: 265, ligne: 19 },
    { type: "yokai", comportement: "rampant", colonne: 292, ligne: 20 },
    { type: "plateforme", colonne: 311, ligne: 19, axe: "x", amplitude: 4, vitesse: 50 },
    { type: "yokai", comportement: "carapace", colonne: 318, ligne: 17 },
    { type: "plateforme", colonne: 319, ligne: 19, axe: "x", amplitude: 3, vitesse: 55 },
    { type: "yokai", comportement: "rampant", colonne: 341, ligne: 20 }
  ]
};
