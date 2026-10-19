// =====================================================================
//  NOYAU - camera
//  Suit une cible avec une zone morte au centre : tant que la cible y
//  reste, la camera ne bouge pas, ce qui evite le tremblement permanent
//  d'une camera qui colle au personnage. Elle reste toujours bornee aux
//  limites du monde, de sorte qu'on ne voit jamais au-dela du niveau.
// =====================================================================

export function creerCamera(options) {
  const reglages = options || {};
  const largeurVue = reglages.largeurVue;
  const hauteurVue = reglages.hauteurVue;
  // La zone morte est exprimee en fraction de la vue
  const partMorteX = reglages.partMorteX === undefined ? 0.25 : reglages.partMorteX;
  const partMorteY = reglages.partMorteY === undefined ? 0.35 : reglages.partMorteY;

  let largeurMonde = largeurVue;
  let hauteurMonde = hauteurVue;
  let x = 0;
  let y = 0;

  // Quand le monde est plus petit que la vue, il n'y a rien a cadrer
  function borner() {
    const maxX = Math.max(0, largeurMonde - largeurVue);
    const maxY = Math.max(0, hauteurMonde - hauteurVue);
    x = Math.max(0, Math.min(maxX, x));
    y = Math.max(0, Math.min(maxY, y));
  }

  return {
    get x() { return x; },
    get y() { return y; },
    get largeurVue() { return largeurVue; },
    get hauteurVue() { return hauteurVue; },

    definirMonde(largeur, hauteur) {
      largeurMonde = largeur;
      hauteurMonde = hauteur;
      borner();
    },

    // Place la cible au centre, sans transition
    centrerSur(cibleX, cibleY) {
      x = cibleX - largeurVue / 2;
      y = cibleY - hauteurVue / 2;
      borner();
    },

    // Ne bouge que de ce qu'il faut pour ramener la cible dans la zone morte
    suivre(cibleX, cibleY) {
      const margeX = largeurVue * partMorteX / 2;
      const margeY = hauteurVue * partMorteY / 2;
      const centreX = x + largeurVue / 2;
      const centreY = y + hauteurVue / 2;

      if (cibleX < centreX - margeX) {
        x -= (centreX - margeX) - cibleX;
      } else if (cibleX > centreX + margeX) {
        x += cibleX - (centreX + margeX);
      }
      if (cibleY < centreY - margeY) {
        y -= (centreY - margeY) - cibleY;
      } else if (cibleY > centreY + margeY) {
        y += cibleY - (centreY + margeY);
      }
      borner();
    },

    // Une case du monde est-elle dans le champ, a une marge pres
    dansLeChamp(mondeX, mondeY, largeur, hauteur, marge) {
      const jeu = marge === undefined ? 0 : marge;
      return mondeX + largeur >= x - jeu
        && mondeX <= x + largeurVue + jeu
        && mondeY + hauteur >= y - jeu
        && mondeY <= y + hauteurVue + jeu;
    }
  };
}
