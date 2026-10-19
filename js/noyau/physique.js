// =====================================================================
//  NOYAU - physique d'un corps contre un decor
//  Le noyau ne sait rien du decor : il demande au jeu, par une seule
//  fonction, si une boite donnee est bloquee. Un decor en tuiles et un
//  decor en pixels repondent tous les deux a cette question, c'est donc
//  la seule chose que les deux jeux ont vraiment en commun.
// =====================================================================

// Nombre de bissections pour se recoller au point de contact. Six coupes
// ramenent l'erreur a un soixante-quatrieme du pas, donc bien moins d'un
// pixel : le corps ne laisse pas de trou visible contre le decor.
const COUPES = 6;

// Fait tendre une valeur vers une cible a vitesse bornee. Sert a
// l'acceleration comme a la deceleration, au sol comme en l'air.
export function accelererVers(valeur, cible, acceleration, delta) {
  const marche = acceleration * delta;
  if (valeur < cible) {
    return Math.min(cible, valeur + marche);
  }
  if (valeur > cible) {
    return Math.max(cible, valeur - marche);
  }
  return valeur;
}

// Integre la gravite, en bornant la vitesse de chute
export function appliquerGravite(corps, gravite, vitesseChuteMax, delta) {
  corps.vy += gravite * delta;
  if (corps.vy > vitesseChuteMax) {
    corps.vy = vitesseChuteMax;
  }
}

// Cherche la derniere position libre entre une position sure et une
// position bloquee, par bissection.
function recoller(libre, bloquee, estBloquee) {
  let sure = libre;
  let dehors = bloquee;
  for (let i = 0; i < COUPES; i++) {
    const milieu = (sure + dehors) / 2;
    if (estBloquee(milieu)) {
      dehors = milieu;
    } else {
      sure = milieu;
    }
  }
  return sure;
}

// Deplace un corps { x, y, largeur, hauteur, vx, vy } de (dx, dy).
//
// bloque(x, y, largeur, hauteur, axe, sens) rend vrai si la boite est
// dans le decor. L'axe vaut "horizontal" ou "vertical", le sens vaut 1
// ou -1 : c'est ce qui permet au jeu de laisser passer une plateforme
// traversable par le bas sans que le noyau connaisse cette notion.
//
// Le deplacement est decoupe en pas d'au plus pasMax pixels et chaque
// axe est resolu separement : le corps ne traverse jamais un bloc, meme
// a grande vitesse, et ne s'accroche pas aux joints entre deux tuiles.
export function deplacerAvecCollision(corps, dx, dy, bloque, options) {
  const reglages = options || {};
  const pasMax = reglages.pasMax === undefined ? 6 : reglages.pasMax;
  const contacts = { sol: false, tete: false, mur: false };

  const distance = Math.max(Math.abs(dx), Math.abs(dy));
  const nombreDePas = Math.max(1, Math.ceil(distance / pasMax));
  const partX = dx / nombreDePas;
  const partY = dy / nombreDePas;

  for (let pas = 0; pas < nombreDePas; pas++) {
    if (partX !== 0) {
      const sens = partX > 0 ? 1 : -1;
      const depart = corps.x;
      const arrivee = depart + partX;
      const estBloquee = x => bloque(x, corps.y, corps.largeur, corps.hauteur, "horizontal", sens);
      if (estBloquee(arrivee)) {
        corps.x = recoller(depart, arrivee, estBloquee);
        corps.vx = 0;
        contacts.mur = true;
      } else {
        corps.x = arrivee;
      }
    }

    if (partY !== 0) {
      const sens = partY > 0 ? 1 : -1;
      const depart = corps.y;
      const arrivee = depart + partY;
      const estBloquee = y => bloque(corps.x, y, corps.largeur, corps.hauteur, "vertical", sens);
      if (estBloquee(arrivee)) {
        corps.y = recoller(depart, arrivee, estBloquee);
        corps.vy = 0;
        if (sens > 0) {
          contacts.sol = true;
        } else {
          contacts.tete = true;
        }
      } else {
        corps.y = arrivee;
      }
    }
  }
  return contacts;
}

// Vrai si le corps repose sur quelque chose : on le teste en le poussant
// d'un cheveu vers le bas plutot qu'en gardant un etat, ce qui evite de
// rester colle au sol apres qu'il a disparu.
export function surLeSol(corps, bloque) {
  return bloque(corps.x, corps.y + 1, corps.largeur, corps.hauteur, "vertical", 1);
}
