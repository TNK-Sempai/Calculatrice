// =====================================================================
//  NOYAU - rangee de boutons de choix
//  Sert aux difficultes et aux modes de jeu. Le bouton actif est marque
//  par la classe "active", que chaque jeu pose lors de son affichage.
// =====================================================================

// entrees : une liste d'objets { id, nom }.
// surChoix(entree) est appelee au clic.
// attribut : le nom du data-attribut qui portera l'identifiant.
export function creerBoutonsChoix(conteneur, entrees, surChoix, attribut) {
  const nomAttribut = attribut || "difficulte";
  entrees.forEach(entree => {
    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.className = "jeu-quitter difficulte";
    bouton.dataset[nomAttribut] = entree.id;
    bouton.textContent = entree.nom;
    bouton.addEventListener("click", () => surChoix(entree));
    conteneur.appendChild(bouton);
  });
}

// Met a jour le bouton en surbrillance
export function marquerChoixActif(conteneur, id, attribut) {
  const nomAttribut = attribut || "difficulte";
  for (const bouton of conteneur.children) {
    bouton.classList.toggle("active", bouton.dataset[nomAttribut] === id);
  }
}
