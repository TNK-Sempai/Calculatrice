// =====================================================================
//  MONDE 2, NIVEAU 1 : LES RUELLES AUX LANTERNES
//  Le village la nuit. On y apprend les tuiles de toit, qui portent
//  un instant puis tombent, et le chochin-obake qui ronde dans les rues.
// =====================================================================
export default {
  nom: "Les ruelles aux lanternes",
  tuile: 16,
  depart: {
    colonne: 3,
    ligne: 20
  },
  decor: [
    "                                                                                                                                                                                                                                                                                        ",
    "                                                                                                                                                                                                                                                                                        ",
    "                                                                                                                                                                                                                                                                                        ",
    "                                                                                                                                                                                                                                                                                        ",
    "                                                                                                                                                                                                                                                                                        ",
    "                                                                                                                                                                                                                                                                                        ",
    "                                                                                                                                                                                                                                                                                        ",
    "                                                                                                                                                                                                                                                                                        ",
    "                                                                                                                                                                                                                                                                                        ",
    "                                                                                                                                                                                                                                                                                        ",
    "                                                                                                                                                                                                                                                                                        ",
    "                                                                                                                                                                                                                                                                                        ",
    "                                                                                                            oooooo                                                                                                                                                   !!!!!!!!!          ",
    "                                                                                                            ------                                                                                                                                                    !     !           ",
    "                                                                                                                                                                          oooo                                                                                        !!!!!!!           ",
    "                                                                                                                                                                          ====                                                    CCCC                                !     !           ",
    "                              ooooo                                                                                                                                                                                                                                   !     !           ",
    "                              =====                   CCC                                     oooooooo   ##############                                           ====                                        oooooooooooo                ############      oooooo    !     !           ",
    "        oooooo                                                                                           ##############                                                                                                                   ############                !     !           ",
    "                                                                 ooooo                     ########################################                                                                                           ########################    ##############################",
    "                                                                                           ########################################               J                                       ########## ----                     ########################    ##############################",
    "############################################~~~~################~-----~############################################################~~~~~##########################################~------~##########~~~~~~############################################    ##############################",
    "############################################~~~~################~~~~~~~############################################################~~~~~##########################################~~~~~~~~##########~~~~~~############################################    ##############################",
    "############################################~~~~################~~~~~~~############################################################~~~~~##########################################~~~~~~~~##########~~~~~~############################################    ##############################"
  ],
  entites: [
    {
      type: "yokai",
      comportement: "rampant",
      colonne: 38,
      ligne: 20
    },
    {
      type: "omikuji",
      colonne: 55,
      ligne: 17,
      contenu: "feuille"
    },
    {
      type: "yokai",
      comportement: "rampant",
      colonne: 79,
      ligne: 20
    },
    {
      type: "yokai",
      comportement: "rampant",
      colonne: 86,
      ligne: 20
    },
    {
      type: "yokai",
      comportement: "carapace",
      colonne: 125,
      ligne: 18
    },
    {
      type: "omikuji",
      colonne: 150,
      ligne: 17,
      contenu: "chapeau"
    },
    {
      type: "yokai",
      comportement: "rampant",
      colonne: 166,
      ligne: 20
    },
    {
      type: "yokai",
      comportement: "volant",
      colonne: 172,
      ligne: 15
    },
    {
      type: "yokai",
      comportement: "rampant",
      colonne: 208,
      ligne: 20
    },
    {
      type: "yokai",
      comportement: "rampant",
      colonne: 213,
      ligne: 20
    },
    {
      type: "yokai",
      comportement: "rampant",
      colonne: 218,
      ligne: 20
    }
  ]
};
