// =====================================================================
//  NOYAU - sprites en chaines de pixels
//  Un sprite s'ecrit comme du dessin dans le code : une liste de lignes,
//  un caractere par pixel, et une palette qui donne sa couleur a chaque
//  caractere. Le point et l'espace laissent la case transparente.
//
//  Chaque image est compilee une seule fois dans un canvas hors ecran,
//  dans les deux orientations. Le jeu ne fait ensuite qu'un drawImage
//  par entite : dessiner un sprite de 12 sur 12 en fillRect couterait
//  144 appels par entite et par image, ce qui ne tient pas avec un
//  decor qui defile et plusieurs entites a l'ecran.
// =====================================================================

const TRANSPARENT = ". ";

// Verifie qu'une image est bien rectangulaire et n'utilise que des
// caracteres connus. Une faute de frappe dans un sprite est sinon
// invisible jusqu'au moment ou le dessin sort de travers.
function verifierImage(nom, lignes, palette) {
  if (!Array.isArray(lignes) || lignes.length === 0) {
    throw new Error("sprite " + nom + " : image vide");
  }
  const largeur = lignes[0].length;
  lignes.forEach((ligne, index) => {
    if (ligne.length !== largeur) {
      throw new Error("sprite " + nom + " : la ligne " + index + " fait "
        + ligne.length + " caracteres au lieu de " + largeur);
    }
    for (const caractere of ligne) {
      if (!TRANSPARENT.includes(caractere) && palette[caractere] === undefined) {
        throw new Error("sprite " + nom + " : caractere inconnu " + JSON.stringify(caractere));
      }
    }
  });
  return largeur;
}

function peindre(lignes, palette, taillePixel, versLaGauche) {
  const colonnes = lignes[0].length;
  const canvas = document.createElement("canvas");
  canvas.width = colonnes * taillePixel;
  canvas.height = lignes.length * taillePixel;
  const contexte = canvas.getContext("2d");

  lignes.forEach((ligne, indexLigne) => {
    for (let colonne = 0; colonne < colonnes; colonne++) {
      const caractere = ligne[colonne];
      if (TRANSPARENT.includes(caractere)) {
        continue;
      }
      const x = versLaGauche ? colonnes - 1 - colonne : colonne;
      contexte.fillStyle = palette[caractere];
      contexte.fillRect(x * taillePixel, indexLigne * taillePixel, taillePixel, taillePixel);
    }
  });
  return canvas;
}

// definition : { palette, taillePixel, images: { nom: [lignes] } }
// Rend un objet qui sait se dessiner, sans que le jeu ait a connaitre
// la mecanique du pre-rendu.
export function compilerSprite(definition) {
  const palette = definition.palette;
  const taillePixel = definition.taillePixel === undefined ? 2 : definition.taillePixel;
  const compilees = {};
  let largeur = 0;
  let hauteur = 0;

  for (const [nom, lignes] of Object.entries(definition.images)) {
    const colonnes = verifierImage(nom, lignes, palette);
    largeur = colonnes * taillePixel;
    hauteur = lignes.length * taillePixel;
    compilees[nom] = {
      droite: peindre(lignes, palette, taillePixel, false),
      gauche: peindre(lignes, palette, taillePixel, true)
    };
  }

  return {
    largeur,
    hauteur,
    aLImage(nom) {
      return compilees[nom] !== undefined;
    },
    // Un seul appel de dessin, quelle que soit la taille du sprite
    dessiner(contexte, x, y, nomImage, versLaGauche) {
      const image = compilees[nomImage];
      if (image === undefined) {
        return;
      }
      contexte.drawImage(versLaGauche ? image.gauche : image.droite,
        Math.round(x), Math.round(y));
    }
  };
}
