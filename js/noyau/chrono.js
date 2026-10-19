// =====================================================================
//  NOYAU - chronometre a la seconde
//  Le minuteur tourne en continu mais ne compte que lorsque le jeu est
//  vraiment en cours : c'est le jeu qui dit quand, pas le noyau.
// =====================================================================

// surSeconde() est appelee une fois par seconde ecoulee.
// compte() doit rendre vrai pour que la seconde soit comptee.
export function creerChrono(surSeconde, compte) {
  let minuteur = null;

  return {
    lancer() {
      clearInterval(minuteur);
      minuteur = setInterval(function () {
        if (!compte()) {
          return;
        }
        surSeconde();
      }, 1000);
    },
    arreter() {
      clearInterval(minuteur);
    }
  };
}
