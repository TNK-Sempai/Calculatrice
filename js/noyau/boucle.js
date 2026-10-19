// =====================================================================
//  NOYAU - boucle d'animation
//  Calcule le delta entre deux images et le plafonne, pour qu'un onglet
//  reste en arriere-plan ne fasse pas bondir le jeu au retour.
//  Chaque jeu garde son propre plafond et son unite : le noyau n'impose
//  aucune valeur.
// =====================================================================

// surImage(delta, maintenant) est appelee a chaque image.
// plafond : valeur maximale du delta, dans l'unite choisie.
// enSecondes : vrai pour un delta en secondes, faux pour des millisecondes.
export function creerBoucle(surImage, options) {
  const reglages = options || {};
  const plafond = reglages.plafond === undefined ? Infinity : reglages.plafond;
  const enSecondes = reglages.enSecondes !== false;

  let image = null;
  let dernierTemps = 0;

  function tour(maintenant) {
    const ecoule = enSecondes ? (maintenant - dernierTemps) / 1000 : maintenant - dernierTemps;
    dernierTemps = maintenant;
    surImage(Math.min(plafond, ecoule), maintenant);
    image = requestAnimationFrame(tour);
  }

  return {
    lancer() {
      dernierTemps = performance.now();
      cancelAnimationFrame(image);
      image = requestAnimationFrame(tour);
    },
    arreter() {
      cancelAnimationFrame(image);
    },
    // A appeler quand le jeu reprend apres une pause, pour que la premiere
    // image qui suit ne rattrape pas tout le temps ecoule.
    remettreALHeure() {
      dernierTemps = performance.now();
    }
  };
}
