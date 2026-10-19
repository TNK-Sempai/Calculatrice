// =====================================================================
//  MONDE 1, NIVEAU 3 : LA MONTEE VERS LE SANCTUAIRE
//  360 tuiles. Introduit les tuiles de toit qui cedent, le karasu-tengu
//  et le tsuchigumo, puis combine le tout jusqu'au grand torii.
//
//  Le niveau monte de la rangee 21 a la rangee 8. La vue fait
//  exactement la hauteur du niveau : la montee reste lisible d'un seul
//  coup d'oeil, sans defilement vertical.
//
//  Progression :
//    colonnes 0 a 44     les tuiles de toit, posees au-dessus du sol :
//                        les voir ceder ne coute rien
//    colonnes 45 a 52    les memes, cette fois au-dessus du vide
//    colonnes 53 a 87    les karasu-tengu, en terrain degage
//    colonnes 88 a 110   le couloir bas sous plafond : un kappa, puis
//                        des tsuchigumo suspendues
//    colonnes 111 a 145  la ligne des kasa-obake, et un chemin haut
//                        portant une boite d'omikuji
//    colonne 180         la statue de Jizo
//    colonnes 186 a 225  la traversee sur tuiles, un volant au-dessus
//    colonnes 226 a 260  le second couloir sous plafond
//    colonnes 261 a 300  le dernier franchissement et ses pieux
//    colonnes 301 a 359  le parvis, puis le grand torii
// =====================================================================
export default {
  nom: "La montee vers le sanctuaire",
  tuile: 16,
  depart: { colonne: 3, ligne: 20 },
  decor: [
    "               |                                                                     |                                  |                                  |                                                                     |                                  |                                  |                                  |                             ",
    "        |      |                           |                                  |      |                                  |                           |      |                           |                                  |      |                           |      |                           |      |                           |      |                !!!!!!!!!!!| ",
    " |      |      |                    |      |                           |      |      |                    |             |                    |      |      |                    |      |                           |      |      |                    |      |      |                    |      |      |                    |      |      |                 !!!!!!!!! | ",
    " |      |      |             |      |      |                    |      |      |      |             |      |             |             |      |      |      |             |      |      |                    |      |      |      |             |      |      |      |             |      |      |      |             |      |      |      |             |   !  |    ! | ",
    " |      |      |      |      |      |      |             |      |      |      |      |      |      |      |             |      |      |      |      |      |      |      |      |      |             |      |      |      |      |      |      |      |      |      |             |      |      |      |      |      |      |      |      |      |      |   !  |    ! | ",
    " |      |      |      |      |      |      |             |      |      |      |      |      |      |      |             |      |      |      |      |      |      |      |      |      |             |      |      |      |      |      |      |      ###############             |      |      |      |      |      | ooooooo     |      |      |      |   !  |    ! | ",
    " |      |      |      |      |      |      |             |      |      |      |      |      |      |      |             |      |      |      |      |      |      |      |      |      |             |      |      |      |      |      |      |      ###############             |      |      |  ooooooo    |      |=========    |      |      |      |   !  |    ! | ",
    " |      |      |      |      |      |      |             |      |      |      |      |      |      |      |             |      |      |      |      |      |      |      |      |      |             |      |      |      |      |      |      |      |      |      |             |      |      | =========   |      |      |      |      |      |      oooo!oooo   ! | ",
    " |      |      |      |      |      |      |             |      |      |      |      |      |      |      |             |      |      |      |      |      |      |      |      |      |             |      |      |      |      |      |ooooooo      |      |      | oooooooo    |      |      |      |      |      |      |     ooooooooo      |   ###################",
    " |      |      |      |      |      |      |             |      |      |      |      |      |      |      |             |      |      |      |      |      |      |      |      |      |             |   ooooooo   |      |      |      =========     |      |      |----------   |      |      ooooooo|      | ooooooooo   |    #######################################",
    " |      |      |      |      |      |      |             |      |      |      |      |      |      |      |             |      |      |      |      |      |      |    oooooo   |      |             |  =========  |      |      |      |      |      |      |      |             |      |      |      |     ###########################################################",
    " |      |      |      |      |      |      |             |      |      |      |      |  #######################         |      |      |      |      |  oooooo     |   ========  |      |   oooooooo  |      |      |      |      |      |      |      | oooooooooooo|          #############^^##########################################################################",
    " |      |      |      |      |      |      |             |      |      |      |      |  #######################         |      ooooooo|      |      | ========    |      |      |      |  ---------- |      |      |    oooooo   |      |      |      ###############          #########################################################################################",
    " |      |      |      |      |      |      |             |      |      |      |      |      |      |      |             |     =========      |      |      |      |      |      |      |             |      |      |      |      |###################################          #########################################################################################",
    " |      |      |      |      |      |      |             |      |      |      |      |      |      |      |     oooooo  |      |      |      |      |      |      | ooooooo     |   J  |            ######################^^#########################################          #########################################################################################",
    " |      |      |      |      |      |      |             ooooo  |      |      |      |      |      |      |    -------- |      |      |      |      oooooo |     #########################          #################################################################          #########################################################################################",
    " |      |      |      |      |      |      |            ======= |      |      |      |      |      |      |             |      |      |      |    ########################################          #################################################################          #########################################################################################",
    " |      |      |      |      |   ooooooooo |  oooooo     |      |      |ooo   |      |      | oooooooooooooooo         ###################################################################          #################################################################          #########################################################################################",
    " |      |      |      |      |  -----------| --------    |      |      |CCC   |     ooo #######################        ###################################################################          #################################################################          #########################################################################################",
    " |      |      |      |      |      |      |             |      |      |      ooo #############################        ###################################################################          #################################################################          #########################################################################################",
    " |    ooooooo  |      |      |      |      |             |      ooooo  |    ###################################        ###################################################################          #################################################################          #########################################################################################",
    "#############################################        ##########################################################        ###################################################################          #################################################################          #########################################################################################",
    "#############################################        ##########################################################        ###################################################################          #################################################################          #########################################################################################",
    "#############################################        ##########################################################        ###################################################################          #################################################################          #########################################################################################"
  ],
  entites: [
    { type: "yokai", comportement: "rampant", colonne: 24, ligne: 20 },
    { type: "yokai", comportement: "volant", colonne: 60, ligne: 14, portee: 4 },
    { type: "yokai", comportement: "volant", colonne: 70, ligne: 15, portee: 3 },
    // Les tuiles de toit des colonnes 45 a 52 passent au-dessus du
    // vide : elles cedent sous le poids, il faut avancer sans s'y
    // arreter.
    { type: "yokai", comportement: "carapace", colonne: 91, ligne: 17 },
    // Le couloir des carapaces. Le kappa de la colonne 91 arrive
    // avant les tsuchigumo : ecrase, ramasse et porte, sa carapace
    // fauche chaque araignee des qu'elle se laisse tomber.
    { type: "yokai", comportement: "tombeur", colonne: 97, ligne: 13 },
    { type: "yokai", comportement: "tombeur", colonne: 103, ligne: 13 },
    { type: "yokai", comportement: "rampant", colonne: 107, ligne: 17 },
    { type: "yokai", comportement: "rampant", colonne: 124, ligne: 16 },
    { type: "yokai", comportement: "rampant", colonne: 131, ligne: 16 },
    { type: "yokai", comportement: "rampant", colonne: 138, ligne: 16 },
    { type: "omikuji", colonne: 130, ligne: 10, contenu: "chapeau" },
    { type: "yokai", comportement: "volant", colonne: 156, ligne: 9, portee: 3 },
    { type: "omikuji", colonne: 176, ligne: 11, contenu: "feuille" },
    { type: "yokai", comportement: "volant", colonne: 204, ligne: 6, portee: 3 },
    { type: "yokai", comportement: "rampant", colonne: 214, ligne: 13 },
    { type: "yokai", comportement: "carapace", colonne: 230, ligne: 12 },
    { type: "yokai", comportement: "rampant", colonne: 238, ligne: 12 },
    { type: "yokai", comportement: "tombeur", colonne: 250, ligne: 7 },
    { type: "yokai", comportement: "tombeur", colonne: 256, ligne: 7 },
    { type: "yokai", comportement: "volant", colonne: 278, ligne: 6, portee: 4 },
    { type: "yokai", comportement: "rampant", colonne: 308, ligne: 9 },
    { type: "omikuji", colonne: 324, ligne: 5, contenu: "feuille" },
    { type: "yokai", comportement: "volant", colonne: 330, ligne: 4, portee: 3 }
  ]
};
