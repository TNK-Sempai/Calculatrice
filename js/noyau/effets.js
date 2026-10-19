// =====================================================================
//  NOYAU - effets de jeu
//  Ce qui donne du poids a une action sans en changer les regles :
//  eclats de pixels quand quelque chose se brise, points qui flottent
//  la ou on les gagne, secousse de l'ecran sur un coup dur.
//  Pas de lueur ni de flou : des carres pleins, dans l'esprit pixel.
// =====================================================================

export function creerEffets() {
  let eclats = [];
  let textes = [];
  let secousse = { force: 0, duree: 0, reste: 0 };

  return {
    // Des carres qui partent dans toutes les directions et retombent
    eclater(x, y, couleurs, nombre, vitesse) {
      const palette = Array.isArray(couleurs) ? couleurs : [couleurs];
      const total = nombre || 12;
      const elan = vitesse || 140;
      for (let i = 0; i < total; i++) {
        const angle = Math.random() * Math.PI * 2;
        const v = elan * (0.4 + Math.random() * 0.8);
        eclats.push({
          x, y,
          vx: Math.cos(angle) * v,
          vy: Math.sin(angle) * v - elan * 0.3,
          vie: 0.35 + Math.random() * 0.45,
          taille: Math.random() < 0.3 ? 3 : 2,
          couleur: palette[Math.floor(Math.random() * palette.length)]
        });
      }
    },

    // Un texte qui monte et s'efface : "+200", "x4", "1UP"
    flotter(x, y, texte, couleur, taille) {
      textes.push({ x, y, texte, couleur: couleur || "#ede8df", taille: taille || 12, vie: 0.9, age: 0 });
    },

    secouer(force, duree) {
      if (force >= secousse.force * (secousse.reste / Math.max(secousse.duree, 0.001))) {
        secousse = { force, duree, reste: duree };
      }
    },

    maj(delta) {
      eclats = eclats.filter(e => {
        e.vie -= delta;
        e.x += e.vx * delta;
        e.y += e.vy * delta;
        e.vy += 320 * delta;
        e.vx *= 0.98;
        return e.vie > 0;
      });
      textes = textes.filter(t => {
        t.age += delta;
        t.y -= 28 * delta;
        return t.age < t.vie;
      });
      if (secousse.reste > 0) {
        secousse.reste = Math.max(0, secousse.reste - delta);
      }
    },

    // Decalage a appliquer a toute la scene pendant une secousse
    decalage() {
      if (secousse.reste <= 0) {
        return { x: 0, y: 0 };
      }
      const f = secousse.force * (secousse.reste / secousse.duree);
      return { x: Math.round((Math.random() * 2 - 1) * f), y: Math.round((Math.random() * 2 - 1) * f) };
    },

    dessiner(contexte, police) {
      eclats.forEach(e => {
        contexte.globalAlpha = Math.min(1, e.vie * 3);
        contexte.fillStyle = e.couleur;
        contexte.fillRect(Math.round(e.x), Math.round(e.y), e.taille, e.taille);
      });
      contexte.globalAlpha = 1;
      contexte.textAlign = "center";
      contexte.textBaseline = "middle";
      textes.forEach(t => {
        contexte.globalAlpha = Math.max(0, 1 - Math.pow(t.age / t.vie, 2));
        contexte.font = "600 " + t.taille + "px " + (police || "'Martian Mono', monospace");
        contexte.fillStyle = "#050508";
        contexte.fillText(t.texte, Math.round(t.x) + 1, Math.round(t.y) + 1);
        contexte.fillStyle = t.couleur;
        contexte.fillText(t.texte, Math.round(t.x), Math.round(t.y));
      });
      contexte.globalAlpha = 1;
    },

    vider() {
      eclats = [];
      textes = [];
      secousse = { force: 0, duree: 0, reste: 0 };
    }
  };
}
