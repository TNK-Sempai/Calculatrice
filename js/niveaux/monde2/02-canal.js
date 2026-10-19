// =====================================================================
//  MONDE 2, NIVEAU 2 : LE CANAL DES KAPPA
//  Un long canal entre les maisons. Planches qui coulissent, tortues
//  a carapace et ittan-momen qui ondulent au-dessus de l'eau.
// =====================================================================
export default {
  nom: "Le canal des kappa",
  tuile: 16,
  depart: {
    colonne: 3,
    ligne: 20
  },
  decor: [
    "                                                                                                                                                                                                                                                  ",
    "                                                                                                                                                                                                                                                  ",
    "                                                                                                                                                                                                                                                  ",
    "                                                                                                                                                                                                                                                  ",
    "                                                                                                                                                                                                                                                  ",
    "                                                                                                                                                                                                                                                  ",
    "                                                                                                                                                                                                                                                  ",
    "                                                                                                                                                                                                                                                  ",
    "                                                                                                                                                                                                                                                  ",
    "                                                                                                                                                                                                                                                  ",
    "                                                                                                                                                                                                                                                  ",
    "                                                                                                                                                                                                                                                  ",
    "                                                                                                                                                                                                                                                  ",
    "                                                                                                                                                                                                                                                  ",
    "                                                                                                                                                                                                                                 !!!!!!!!!        ",
    "                                                                                                                                                                                                                                  !     !         ",
    "                                       oooooo                                                                                                                                                                                     !!!!!!!         ",
    "                                                    CC                                                                                                                               oooooo                                       !     !         ",
    "          ooooo                                                 ##########     ############ ------         oooooo                                                                                                      oooooo     !     !         ",
    "                                                                ##########     ############                                                              ############     ########## ------                                       !     !         ",
    "                                                                ##########     ############           J                                           ^^^^^^ ############     ##########        ##############                        !     !         ",
    "####################~~~~############~~~~~~~~~~~~##########################~~~~~############~~~~~~~~##################~~~~~~~~~~~~~~##################################~~~~~##########~~~~~~~~##############~~~~~~~~~~##############################",
    "####################~~~~############~~~~~~~~~~~~##########################~~~~~############~~~~~~~~##################~~~~~~~~~~~~~~##################################~~~~~##########~~~~~~~~##############~~~~~~~~~~##############################",
    "####################~~~~############~~~~~~~~~~~~##########################~~~~~############~~~~~~~~##################~~~~~~~~~~~~~~##################################~~~~~##########~~~~~~~~##############~~~~~~~~~~##############################"
  ],
  entites: [
    {
      type: "yokai",
      comportement: "carapace",
      colonne: 31,
      ligne: 20
    },
    {
      type: "plateforme",
      colonne: 36,
      ligne: 19,
      axe: "x",
      amplitude: 8,
      vitesse: 45
    },
    {
      type: "yokai",
      comportement: "rampant",
      colonne: 56,
      ligne: 20
    },
    {
      type: "omikuji",
      colonne: 58,
      ligne: 17,
      contenu: "feuille"
    },
    {
      type: "yokai",
      comportement: "carapace",
      colonne: 85,
      ligne: 17
    },
    {
      type: "yokai",
      comportement: "rampant",
      colonne: 111,
      ligne: 20
    },
    {
      type: "yokai",
      comportement: "volant",
      colonne: 123,
      ligne: 13
    },
    {
      type: "plateforme",
      colonne: 117,
      ligne: 18,
      axe: "y",
      amplitude: 3,
      vitesse: 35
    },
    {
      type: "plateforme",
      colonne: 123,
      ligne: 17,
      axe: "y",
      amplitude: 3,
      vitesse: 40
    },
    {
      type: "yokai",
      comportement: "carapace",
      colonne: 141,
      ligne: 20
    },
    {
      type: "omikuji",
      colonne: 137,
      ligne: 17,
      contenu: "chapeau"
    },
    {
      type: "yokai",
      comportement: "rampant",
      colonne: 159,
      ligne: 18
    },
    {
      type: "yokai",
      comportement: "rampant",
      colonne: 193,
      ligne: 19
    },
    {
      type: "yokai",
      comportement: "rampant",
      colonne: 198,
      ligne: 19
    },
    {
      type: "plateforme",
      colonne: 202,
      ligne: 19,
      axe: "x",
      amplitude: 5,
      vitesse: 55
    }
  ]
};
