// =====================================================================
//  NOYAU - message temporaire
//  Affiche un texte dans un element puis l'efface au bout d'un delai,
//  en annulant le minuteur precedent a chaque nouvel appel.
// =====================================================================

// delai : duree par defaut en millisecondes, 0 pour un message permanent.
// peutEffacer : consultee au moment d'effacer, pour qu'un message de fin
//   de partie reste a l'ecran.
// texteAuRepos : ce que l'element affiche une fois le message efface.
export function creerAfficheur(element, options) {
  const reglages = options || {};
  const delaiParDefaut = reglages.delai === undefined ? 2000 : reglages.delai;
  const peutEffacer = reglages.peutEffacer || (() => true);
  const texteAuRepos = reglages.texteAuRepos || (() => "");

  let minuteur = null;

  // Le delai passe a l'appel l'emporte sur celui par defaut. Un delai de 0
  // laisse le message en place jusqu'au suivant.
  return function afficher(texte, delai) {
    element.textContent = texte;
    clearTimeout(minuteur);
    const attente = delai === undefined ? delaiParDefaut : delai;
    if (attente > 0) {
      minuteur = setTimeout(() => {
        if (peutEffacer()) {
          element.textContent = texteAuRepos();
        }
      }, attente);
    }
  };
}
