// =====================================================================
//  REGISTRE DES MONDES
//  Ajouter un niveau : un fichier de donnees, une ligne ici. Ajouter un
//  monde : un dossier, une entree ici. Le moteur ne connait rien
//  d'autre, et c'est ce qui permet de faire grandir le jeu sans le
//  toucher.
//
//  apparences fait le lien entre un comportement generique du moteur et
//  la creature qui le porte dans ce monde. Un monde futur pourra donner
//  un autre yokai au meme comportement sans qu'une ligne du moteur bouge.
// =====================================================================

import oree from "./monde1/01-oree.js";
import riviere from "./monde1/02-riviere.js";
import sanctuaire from "./monde1/03-sanctuaire.js";
import ruelles from "./monde2/01-ruelles.js";
import canal from "./monde2/02-canal.js";
import chateau from "./monde2/03-chateau.js";
import bacASable from "./01-bac-a-sable.js";

export const MONDES = [
  {
    id: "foret-de-bambous",
    nom: "La foret de bambous",
    apparences: {
      rampant: "kasaObake",
      carapace: "kappa",
      volant: "karasuTengu",
      tombeur: "tsuchigumo"
    },
    niveaux: [oree, riviere, sanctuaire]
  },
  {
    id: "village-des-yokai",
    nom: "Le village des yokai",
    apparences: {
      rampant: "chochinObake",
      carapace: "kame",
      volant: "ittanMomen",
      tombeur: "jorogumo"
    },
    niveaux: [ruelles, canal, chateau]
  }
];

// Le bac a sable de la mise au point du saut. Il n'est dans aucun monde :
// il ne sert qu'aux essais de physique, et reste la comme banc d'essai.
export const NIVEAUX = [bacASable];
