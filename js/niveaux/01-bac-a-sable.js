// =====================================================================
//  NIVEAU 1 - Bac a sable
//  Un niveau de reglage, pas un niveau de jeu : il sert a eprouver la
//  physique et la camera. Il fait deux fois et demie la largeur de
//  l'ecran et une fois et demie sa hauteur, avec des plateformes a
//  differentes hauteurs, des plateformes traversables par le bas, un
//  trou a franchir, un mur ou glisser et un escalier.
//
//  Legende, definie dans format.js :
//    espace  vide        #  bloc plein        =  plateforme traversable
// =====================================================================

export default {
  nom: "Bac a sable",
  tuile: 16,
  depart: { colonne: 3, ligne: 24 },
  decor: [
    "                                                                                                    ",
    "                                                                                                    ",
    "                                                                                                    ",
    "                                                                                                    ",
    "                                                                                                    ",
    "                                                                                                    ",
    "                                                                                                    ",
    "                                                                                                    ",
    "                                                                                                    ",
    "                                                                                                    ",
    "                                                                                                    ",
    "                                                                                                    ",
    "                                                                                                    ",
    "                                                                                                    ",
    "                                                                                                    ",
    "                                                                                                    ",
    "                          ######                                                                    ",
    "                                                                                                    ",
    "                                                                                                    ",
    "                  ======          ======                            ############                    ",
    "                                                     ##           ##############                    ",
    "                                                     ##         ################   =====            ",
    "          ======                        ====         ##       ##################                !!! ",
    "                                                     ##     ####################                ! ! ",
    "                                                     ##   ######################           =====! ! ",
    "                                   J                 ## ########################                ! ! ",
    "############################################       #################################################",
    "############################################       #################################################"
  ],
  entites: []
};
