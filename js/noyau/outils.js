// =====================================================================
//  NOYAU - petits outils sans dependance
// =====================================================================

// Melange de Fisher-Yates. La liste d'origine n'est pas touchee.
export function melanger(liste) {
  const copie = liste.slice();
  for (let i = copie.length - 1; i > 0; i--) {
    const k = Math.floor(Math.random() * (i + 1));
    [copie[i], copie[k]] = [copie[k], copie[i]];
  }
  return copie;
}

// Un nombre de secondes en minutes et secondes, par exemple 75 en "1:15"
export function formaterMinutesSecondes(secondes) {
  const minutes = Math.floor(secondes / 60);
  return minutes + ":" + String(secondes % 60).padStart(2, "0");
}
