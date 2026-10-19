// =====================================================================
//  NOYAU - stockage local
//  Le stockage peut etre indisponible, en navigation privee par exemple.
//  Chaque acces est donc protege et le jeu continue sans sauvegarde,
//  au lieu de s'interrompre.
// =====================================================================

// Un petit acces nomme au stockage, en JSON.
// lire() rend null quand il n'y a rien, ou quand le contenu est illisible.
export function creerStockage(cle) {
  return {
    ecrire(valeur) {
      try {
        localStorage.setItem(cle, JSON.stringify(valeur));
      } catch (erreur) {
        // stockage indisponible : on continue sans sauvegarder
      }
    },
    lire() {
      try {
        const brut = localStorage.getItem(cle);
        return brut === null ? null : JSON.parse(brut);
      } catch (erreur) {
        return null;
      }
    },
    effacer() {
      try {
        localStorage.removeItem(cle);
      } catch (erreur) {
        // rien a faire
      }
    },
    // Pour les valeurs simples deja enregistrees en texte brut, que l'on
    // ne veut pas reecrire en JSON sous peine de perdre l'existant.
    ecrireTexte(texte) {
      try {
        localStorage.setItem(cle, String(texte));
      } catch (erreur) {
        // stockage indisponible
      }
    },
    lireTexte() {
      try {
        return localStorage.getItem(cle);
      } catch (erreur) {
        return null;
      }
    }
  };
}
