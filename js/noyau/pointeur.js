// =====================================================================
//  NOYAU - pointeur sur canvas
//  Traduit une coordonnee d'ecran en coordonnee du repere interne du jeu,
//  quelle que soit la taille a laquelle le canvas est affiche.
// =====================================================================

export function abscisseLogique(canvas, clientX, largeurLogique) {
  const cadre = canvas.getBoundingClientRect();
  return (clientX - cadre.left) / cadre.width * largeurLogique;
}

export function ordonneeLogique(canvas, clientY, hauteurLogique) {
  const cadre = canvas.getBoundingClientRect();
  return (clientY - cadre.top) / cadre.height * hauteurLogique;
}
