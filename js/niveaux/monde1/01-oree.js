// =====================================================================
//  MONDE 1, NIVEAU 1 : L'OREE DE LA FORET
//  Le niveau d'apprentissage, 340 tuiles. Il n'introduit que le
//  deplacement, le saut, les feuilles et le kasa-obake, chaque fois
//  d'abord sans danger, puis a l'epreuve, puis combine.
//
//  Progression :
//    colonnes 0 a 29     marcher, ramasser, rien a craindre
//    colonnes 30 a 55    le premier trou, puis le premier yokai
//    colonnes 56 a 96    la montee douce, les premieres caisses
//    colonnes 97 a 132   un chemin haut facultatif, mieux paye, avec
//                        une boite d'omikuji au-dessus de lui
//    colonnes 133 a 178  la statue de Jizo, colonne 170
//    colonnes 179 a 213  deux trous et une alcove sous un surplomb
//    colonnes 214 a 252  le couloir des carapaces : un kappa devant
//                        quatre kasa-obake alignes
//    colonnes 253 a 288  l'escalier et la terrasse, seconde boite
//    colonnes 289 a 339  six tuiles de vide, puis le torii
// =====================================================================
export default {
  nom: "L'oree de la foret",
  tuile: 16,
  depart: { colonne: 3, ligne: 20 },
  decor: [
    "                                                                                                                                                                                                                                                                                                                                                    ",
    "                                                                                                                                                                                                                                                                                                                                                    ",
    " |    |    |    |    |    |         |    |    |    |         |    |    |    |    |    |    |    |         |    |    |    |    |    |         |    |    |    |    |    |    |    |         |    |    |    |    |         |    |    |    |    |    |    |    |    |    |    |    |    |    |    |         |    |    |    |    |    |    |    |    |   ",
    " |    |    |    |    |    |         |    |    |    |         |    |    |    |    |    |    |    |         |    |    |    |    |    |         |    |    |    |    |    |    |    |         |    |    |    |    |         |    |    |    |    |    |    |    |    |    |    |    |    |    |    |         |    |    |    |    |    |    |    |    |   ",
    " |    |    |    |    |    |         |    |    |    |         |    |    |    |    |    |    |    |         |    |    |    |    |    |         |    |    |    |    |    |    |    |         |    |    |    |    |         |    |    |    |    |    |    |    |    |    |    |    |    |    |    |         |    |    |    |    |    |    |    |    |   ",
    " |    |    |    |    |    |         |    |    |    |         |    |    |    |    |    |    |    |         |    |    |    |    |    |         |    |    |    |    |    |    |    |         |    |    |    |    |         |    |    |    |    |    |    |    |    |    |    |    |    |    |    |         |    |    |    |    |    |    |    |    |   ",
    " |    |    |    |    |    |         |    |    |    |         |    |    |    |    |    |    |    |         |    |    |    |    |    |         |    |    |    |    |    |    |    |         |    |    |    |    |         |    |    |    |    |    |    |    |    |    |    |    |    |    |    |         |    |    |    |    |    |    |    |    |   ",
    " |    |    |    |    |    |         |    |    |    |         |    |    |    |    |    |    |    |         |    |    |    |    |    |         |    |    |    |    |    |    |    |         |    |    |    |    |         |    |    |    |    |    |    |    |    |    |    |    |    |    |    |         |    |    |    |    |    |    |    |    |   ",
    " |    |    |    |    |    |         |    |    |    |         |    |    |    |    |    |    |    |         |    |    |    |    |    |         |    |    |    |    |    |    |    |         |    |    |    |    |         |    |    |    |    |    |    |    |    |    |    |    |    |    |    |         |    |    |    |    |    |    |    |    |   ",
    " |    |    |    |    |    |         |    |    |    |         |    |    |    |    |    |    |    |         |    |    |    |    |    |         |    |    |    |    |    |    |    |         |    |    |    |    |         |    |    |    |    |    |    |    |    |    |    |    |    |    |    |         |    |    |    |    |    |    |    |    |   ",
    " |    |    |    |    |    |         |    |    |    |         |    |    |    |    |    |    |    |         |    |    |    |    |    |         |    |    |    |    |    |    |    |         |    |    |    |    |         |    |    |    |    |    |    |    |    |    |    |    |    |    |    |         |    |    |    |    |    |    |    |    |   ",
    " |    |    |    |    |    |         |    |    |    |         |    |    |    |    |    |    |    |         |    |   oo oo |    |    |         |    |    |    |    |    |    |    |         |    |    |    |    |         |    |    |    |    |    |    |    |    |    |    |    |    |    |    |         |    |    |    |    |    |    |    |    |   ",
    " |    |    |    |    |    |         |    |    |    |         |    |    |    |    |    |    |    |         |    |    |    |    |    |         |    |    |    |    |    |    |    |         |    |    |    |    |         |    |    |    |    |    |    |    |    |    |    |    |    |    |    |         |    |    |    |    |    |    |    |    |   ",
    " |    |    |    |    |    |         |    |    |    |         |    |    |    |    |    |    |    |         |    |    |    |    |    |         |    |    |    |    |    |    |    |         |    |    |    |    |         |    |    |    |    |    |    |    |    |    |    |  ooooo  |    |    |         |    |    |    |    |    |    |    |    |   ",
    " |    |    |    |    |    |         |    |    |    |         |    |    |    |    |    |    |    |        ooooo |   ooooo |    |    |         |    |    |    |    |    |    |    |         |    |    |    |    |         |    |    |    ooooo|    |    |    |    |    |    | ======= |    |    |         |    |    |ooooo    |    |    |  !!!!!!!!!  ",
    " |    |    |    |    |    |         |    |    |    |         |    |    |    |    |    |    |    |       =======|  =======|    |    |         |    |    |    |    | ooooo   |    |         |    |    ########  |         |    |    |   =======    |    |    |    |    |    |    |    |    |    |    oo   |    |    =======   |    |    |   !!!!!!!   ",
    " |    |    |    |    |    |         |  oooo   |    |         |    |    |    |    |    |    |    |         |    |    |    |    |    |         | oooo    |    |    |=======  |    |         |  oooo   ########  |         |    |    |    |    |    |    |    |    |    |    |    |    ooooooooooo   ====  |    |    |    |    |    |    |   !|    !   ",
    " |    |    |    |  oooo   |         | ======  |    |         |   oooo  |    |    |    |    | ooo|         |    |    |    |    |    |         |======   |    |    |    |    |    |         | ======  |oooooo   |         |    |    |    |    |    |    |    |    |   oooo ########################       |    |    |    |  oooo   |    |   !|    !   ",
    " |    |    |    | ======  |         |    |    |    |         |  ====== |    |    |    oooooo CCC| ooo     |    |    |    |    |    |  ooo    |    |    |    |    |    |   J|    |   oo    |    |    |    |    |   ooo   |    |  ooooooooooooooooooooooooooo|  oooo ##############################      ########################  |    |   !|    !   ",
    " |    |    |    |    |    |    o    |    |    |    |     oo  |    |    |    |    |   ############     ####################### |    |         |    |    |    |  ####################       |    |    |    |    |         |    |    |    |    |    |    |    | ####################################      ########################  |oooooooo!|    !   ",
    " |    |ooooooo  |    |    |         |    |    |    |         |    |    |    |  ##################     ###############################     #########################################    ##########################     ###########################################################################      #############################################",
    "##############################   #######################    #####################################     ###############################     #########################################    ##########################     ###########################################################################      #############################################",
    "##############################   #######################    #####################################     ###############################     #########################################    ##########################     ###########################################################################      #############################################",
    "##############################   #######################    #####################################     ###############################     #########################################    ##########################     ###########################################################################      #############################################"
  ],
  entites: [
    // Le premier kasa-obake, sur un sol plat et degage : on le voit
    // venir bien avant d'avoir a decider quoi faire.
    { type: "yokai", comportement: "rampant", colonne: 48, ligne: 20 },
    { type: "yokai", comportement: "rampant", colonne: 74, ligne: 20 },
    { type: "omikuji", colonne: 117, ligne: 12, contenu: "feuille" },
    // Un rampant sur le chemin haut, pour que le detour se merite.
    { type: "yokai", comportement: "rampant", colonne: 108, ligne: 14 },
    { type: "yokai", comportement: "rampant", colonne: 128, ligne: 19 },
    { type: "yokai", comportement: "rampant", colonne: 152, ligne: 19 },
    { type: "omikuji", colonne: 172, ligne: 15, contenu: "chapeau" },
    // Le couloir des carapaces. Le kappa arrive le premier : ecrase,
    // ramasse et lance, sa carapace fauche les quatre suivants d'un
    // seul trait. Sans elle, il faut les ecraser un par un.
    { type: "yokai", comportement: "rampant", colonne: 200, ligne: 19 },
    { type: "yokai", comportement: "carapace", colonne: 219, ligne: 19 },
    { type: "yokai", comportement: "rampant", colonne: 228, ligne: 19 },
    { type: "yokai", comportement: "rampant", colonne: 234, ligne: 19 },
    { type: "yokai", comportement: "rampant", colonne: 240, ligne: 19 },
    { type: "yokai", comportement: "rampant", colonne: 246, ligne: 19 },
    { type: "omikuji", colonne: 278, ligne: 13, contenu: "feuille" },
    { type: "yokai", comportement: "rampant", colonne: 282, ligne: 16 },
    { type: "yokai", comportement: "rampant", colonne: 302, ligne: 17 }
  ]
};
