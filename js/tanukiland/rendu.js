// =====================================================================
//  TANUKILAND - rendu
//  Tout ce qui se voit, dessine en vectoriel a la resolution reelle de
//  l'ecran : ciel et decor en parallaxe, tuiles du decor (mises en cache
//  par forme), tanuki, yokai, objets, effets et tete d'affichage.
//  Le moteur (plateformer.js) ne fait qu'appeler ces fonctions avec des
//  positions logiques ; rien ici ne touche a la physique.
// =====================================================================

import { PLEIN, TRAVERSABLE, CAISSE, PIEU, EAU, BAMBOU, TORII } from "../niveaux/format.js";

// ---------------------------------------------------------------------
// Themes des mondes
// ---------------------------------------------------------------------

export const THEMES = [
  {
    // Foret de bambous, fin d'apres-midi
    ciel: ["#f3c58a", "#e08a5c", "#5a3a6e"],
    soleil: "#fff1c4",
    loin: "#8a5a7a",
    milieu: "#5d4a6a",
    proche: "#2f3a2a",
    terre: ["#6b4a2e", "#4f3520", "#3a2616"],
    herbe: ["#7fb23a", "#5e8a26", "#a8d45a"],
    pierre: "#8a7a64",
    planche: ["#b08a54", "#7a5a32"]
  },
  {
    // Le village des yokai, la nuit
    ciel: ["#2a2f6a", "#1a1a44", "#0c0c1e"],
    soleil: "#f1ead2",
    loin: "#2e3266",
    milieu: "#24224e",
    proche: "#16142e",
    terre: ["#5a5466", "#433e50", "#2e2a3a"],
    herbe: ["#6a8a4a", "#4a6a32", "#8aaa5a"],
    pierre: "#9a94a4",
    planche: ["#9a6a3a", "#6a4422"]
  }
];

export function themeDu(monde) {
  return THEMES[Math.min(monde, THEMES.length - 1)];
}

// Hasard fixe par position : le decor est toujours le meme
function hache(a, b) {
  let h = (a * 374761393 + b * 668265263) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ---------------------------------------------------------------------
// Fond en parallaxe
// ---------------------------------------------------------------------

export function dessinerFond(c, monde, camX, camY, L, H, temps) {
  const t = themeDu(monde);
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, t.ciel[2]);
  g.addColorStop(0.55, t.ciel[1]);
  g.addColorStop(1, t.ciel[0]);
  c.fillStyle = g;
  c.fillRect(0, 0, L, H);
  const dy = -camY * 0.08;

  // Astre presque immobile
  c.fillStyle = t.soleil;
  c.beginPath();
  c.arc(L * 0.78 - camX * 0.02 % 40, 70 + dy, monde === 1 ? 26 : 34, 0, Math.PI * 2);
  c.fill();
  if (monde === 1) {
    c.fillStyle = t.ciel[1];
    c.beginPath();
    c.arc(L * 0.78 - camX * 0.02 % 40 + 10, 64 + dy, 22, 0, Math.PI * 2);
    c.fill();
    // Quelques etoiles eparses
    c.fillStyle = "#e8e2ff";
    for (let i = 0; i < 26; i++) {
      const x = (hache(i, 3) * 1400 - camX * 0.05) % 1400;
      const xx = x < 0 ? x + 1400 : x;
      if (xx < L) {
        c.fillRect(xx, hache(i, 9) * 160 + dy, 1.5, 1.5);
      }
    }
  }

  // Montagnes lointaines
  couche(c, camX * 0.12, L, 700, (x0, k) => {
    c.fillStyle = t.loin;
    c.beginPath();
    c.moveTo(x0, H);
    for (let i = 0; i <= 14; i++) {
      const x = x0 + i * 50;
      const y = 190 + dy - Math.abs(Math.sin(i * 0.9 + k * 1.3)) * 70 - hache(k, i) * 20;
      c.lineTo(x, y);
    }
    c.lineTo(x0 + 700, H);
    c.closePath();
    c.fill();
    // Un sommet enneige sur deux
    if (k % 2 === 0) {
      c.fillStyle = monde === 1 ? "#4a4e86" : "#e8d8d0";
      c.beginPath();
      c.moveTo(x0 + 300, 120 + dy);
      c.lineTo(x0 + 330, 144 + dy);
      c.lineTo(x0 + 314, 140 + dy);
      c.lineTo(x0 + 300, 150 + dy);
      c.lineTo(x0 + 286, 140 + dy);
      c.lineTo(x0 + 270, 144 + dy);
      c.closePath();
      c.fill();
      c.fillStyle = t.loin;
      c.beginPath();
      c.moveTo(x0 + 240, 190 + dy);
      c.lineTo(x0 + 300, 118 + dy);
      c.lineTo(x0 + 360, 190 + dy);
      c.closePath();
      c.fill();
      c.fillStyle = monde === 1 ? "#4a4e86" : "#e8d8d0";
      c.beginPath();
      c.moveTo(x0 + 300, 118 + dy);
      c.lineTo(x0 + 318, 140 + dy);
      c.lineTo(x0 + 306, 136 + dy);
      c.lineTo(x0 + 296, 144 + dy);
      c.lineTo(x0 + 288, 136 + dy);
      c.lineTo(x0 + 282, 140 + dy);
      c.closePath();
      c.fill();
    }
  });

  // Plan du milieu : collines et pagodes / toits du village
  couche(c, camX * 0.3, L, 520, (x0, k) => {
    c.fillStyle = t.milieu;
    c.beginPath();
    c.moveTo(x0, H);
    for (let i = 0; i <= 13; i++) {
      c.lineTo(x0 + i * 40, 250 + dy * 1.5 - Math.sin(i * 0.7 + k) * 22 - hache(k + 7, i) * 10);
    }
    c.lineTo(x0 + 520, H);
    c.closePath();
    c.fill();
    if (monde === 0 && k % 3 === 1) {
      pagode(c, x0 + 260, 236 + dy * 1.5, t.milieu);
    }
    if (monde === 1) {
      for (let m = 0; m < 3; m++) {
        maison(c, x0 + 60 + m * 170, 250 + dy * 1.5 - (m % 2) * 12, t.milieu, hache(k, m), temps, 0.75);
      }
    }
  });

  // Plan proche : bosquet de bambous ou maisons eclairees
  couche(c, camX * 0.55, L, 360, (x0, k) => {
    if (monde === 0) {
      for (let i = 0; i < 7; i++) {
        const x = x0 + i * 52 + hache(k, i) * 20;
        const haut = 120 + hache(i, k) * 90;
        c.fillStyle = t.proche;
        c.fillRect(x, haut + dy * 2, 6, H);
        for (let n = haut + 30; n < H; n += 34) {
          c.fillRect(x - 1, n + dy * 2, 8, 2);
        }
        c.beginPath();
        c.ellipse(x + 10, haut + 6 + dy * 2, 14, 4, -0.4, 0, Math.PI * 2);
        c.ellipse(x - 6, haut + 18 + dy * 2, 12, 3.5, 0.5, 0, Math.PI * 2);
        c.fill();
      }
    } else {
      for (let m = 0; m < 2; m++) {
        maison(c, x0 + 40 + m * 180, 300 + dy * 2, t.proche, hache(k + 3, m), temps, 1);
      }
      // Guirlande de lanternes
      c.strokeStyle = "#0a0a18";
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(x0, 238 + dy * 2);
      c.quadraticCurveTo(x0 + 180, 262 + dy * 2, x0 + 360, 238 + dy * 2);
      c.stroke();
      for (let i = 1; i < 6; i++) {
        const x = x0 + i * 60;
        const y = 238 + dy * 2 + Math.sin((i / 6) * Math.PI) * 18;
        c.fillStyle = i % 2 ? "#c8372d" : "#e8a33a";
        c.beginPath();
        c.ellipse(x, y + 7, 4, 5.5, 0, 0, Math.PI * 2);
        c.fill();
      }
    }
  });
}

function couche(c, decalage, L, periode, dessin) {
  const premier = Math.floor(decalage / periode);
  for (let k = premier; k * periode - decalage < L; k++) {
    dessin(k * periode - decalage, ((k % 1000) + 1000) % 1000);
  }
}

function pagode(c, x, y, couleur) {
  c.fillStyle = couleur;
  for (let e = 0; e < 4; e++) {
    const l = 46 - e * 8;
    const yy = y - e * 18;
    c.fillRect(x - l / 2 + 6, yy - 10, l - 12, 10);
    c.beginPath();
    c.moveTo(x - l / 2 - 4, yy - 10);
    c.lineTo(x + l / 2 + 4, yy - 10);
    c.lineTo(x + l / 2 - 6, yy - 16);
    c.lineTo(x - l / 2 + 6, yy - 16);
    c.closePath();
    c.fill();
  }
  c.fillRect(x - 1, y - 92, 2, 20);
}

function maison(c, x, y, couleur, h, temps, echelle) {
  const l = 90 * echelle;
  const m = 46 * echelle;
  c.fillStyle = couleur;
  c.fillRect(x, y - m, l, m + 200);
  // Toit retrousse
  c.beginPath();
  c.moveTo(x - 10 * echelle, y - m);
  c.quadraticCurveTo(x + l / 2, y - m - 30 * echelle, x + l + 10 * echelle, y - m);
  c.lineTo(x + l + 4, y - m + 4);
  c.lineTo(x - 4, y - m + 4);
  c.closePath();
  c.fill();
  // Fenetres eclairees, en aplats
  const allumees = h > 0.3;
  c.fillStyle = allumees ? "#e8b85a" : "#3a3558";
  c.fillRect(x + 14 * echelle, y - m + 14 * echelle, 16 * echelle, 12 * echelle);
  c.fillStyle = h > 0.6 ? "#e8b85a" : "#3a3558";
  c.fillRect(x + 54 * echelle, y - m + 14 * echelle, 16 * echelle, 12 * echelle);
  c.fillStyle = couleur;
  c.fillRect(x + 21 * echelle, y - m + 14 * echelle, 2, 12 * echelle);
  c.fillRect(x + 61 * echelle, y - m + 14 * echelle, 2, 12 * echelle);
}

// ---------------------------------------------------------------------
// Tuiles du decor, mises en cache par forme
// ---------------------------------------------------------------------

const cacheTuiles = new Map();
let echelleCache = 1;

export function viderCacheTuiles(echelle) {
  cacheTuiles.clear();
  echelleCache = echelle;
}

function estSolide(n) {
  return n === PLEIN || n === CAISSE;
}

// Cle de forme : nature + voisins utiles + une variante de hasard
function cleDe(niveau, colonne, rangee, nature) {
  const n = (dc, dr) => niveau.natureDorigine(colonne + dc, rangee + dr);
  if (nature === PLEIN) {
    const haut = estSolide(n(0, -1)) ? 1 : 0;
    const gauche = estSolide(n(-1, 0)) ? 1 : 0;
    const droite = estSolide(n(1, 0)) ? 1 : 0;
    const bas = estSolide(n(0, 1)) || n(0, 1) === undefined ? 1 : 0;
    const profond = haut && estSolide(n(0, -2)) ? 1 : 0;
    return "P" + haut + gauche + droite + bas + profond + (Math.floor(hache(colonne, rangee) * 4));
  }
  if (nature === TORII) {
    const g = n(-1, 0) === TORII;
    const d = n(1, 0) === TORII;
    const h = n(0, -1) === TORII;
    const b = n(0, 1) === TORII;
    return "T" + (g ? 1 : 0) + (d ? 1 : 0) + (h ? 1 : 0) + (b ? 1 : 0);
  }
  if (nature === EAU) {
    return "E" + (n(0, -1) === EAU ? 1 : 0);
  }
  if (nature === BAMBOU) {
    return "B" + Math.floor(hache(colonne, rangee) * 5);
  }
  if (nature === TRAVERSABLE) {
    return "=" + (n(-1, 0) === TRAVERSABLE ? 1 : 0) + (n(1, 0) === TRAVERSABLE ? 1 : 0);
  }
  if (nature === PIEU) {
    return "^";
  }
  return null;
}

export function dessinerTuile(c, niveau, monde, colonne, rangee, x, y) {
  const nature = niveau.natureDorigine(colonne, rangee);
  const cle = cleDe(niveau, colonne, rangee, nature);
  if (cle === null) {
    return;
  }
  const t = niveau.tuile;
  const complete = monde + ":" + cle;
  let img = cacheTuiles.get(complete);
  if (!img) {
    img = document.createElement("canvas");
    const marge = 6;
    img.width = Math.ceil((t + marge * 2) * echelleCache);
    img.height = Math.ceil((t + marge * 2) * echelleCache);
    const k = img.getContext("2d");
    k.setTransform(echelleCache, 0, 0, echelleCache, marge * echelleCache, marge * echelleCache);
    peindre(k, nature, cle, t, themeDu(monde));
    cacheTuiles.set(complete, img);
  }
  c.drawImage(img, x - 6, y - 6, t + 12, t + 12);
}

function peindre(k, nature, cle, t, th) {
  if (nature === PLEIN) {
    const [, haut, gauche, droite, bas, profond, variante] = cle.split("").map(Number);
    k.fillStyle = profond ? th.terre[2] : th.terre[1];
    k.fillRect(0, 0, t, t);
    if (!haut) {
      // Bande de terre plus claire juste sous l'herbe, en surface seulement
      k.fillStyle = th.terre[0];
      k.fillRect(0, 0, t, 7);
    }
    // Une pierre de temps en temps, jamais une trame reguliere
    if (variante === 0 && !profond) {
      k.fillStyle = th.pierre;
      k.beginPath();
      k.moveTo(4, 12);
      k.lineTo(6, 9);
      k.lineTo(10, 9.5);
      k.lineTo(11.5, 12.5);
      k.closePath();
      k.fill();
      k.fillStyle = "rgba(255,255,255,0.25)";
      k.fillRect(6, 9.6, 3, 0.8);
    } else if (variante === 1 && profond) {
      k.strokeStyle = "rgba(0,0,0,0.25)";
      k.lineWidth = 1;
      k.beginPath();
      k.moveTo(2, 4);
      k.quadraticCurveTo(7, 8, 6, 13);
      k.stroke();
    }
    if (!haut) {
      // Herbe : un liseré avec des brins qui depassent
      k.fillStyle = th.herbe[1];
      k.fillRect(0, -1, t, 5);
      k.fillStyle = th.herbe[0];
      k.fillRect(0, -1, t, 3);
      k.fillStyle = th.herbe[0];
      for (let i = 0; i < 4; i++) {
        const bx = 1 + i * 4 + (variante % 3);
        k.beginPath();
        k.moveTo(bx, 0);
        k.lineTo(bx + 1, -3 - ((i + variante) % 3));
        k.lineTo(bx + 2, 0);
        k.fill();
      }
      k.fillStyle = th.herbe[2];
      k.fillRect(0, -1, t, 1);
      k.fillStyle = th.herbe[1];
      if (!gauche) {
        k.fillRect(-2, -1, 3, 6);
      }
      if (!droite) {
        k.fillRect(t - 1, -1, 3, 6);
      }
    }
    k.fillStyle = "rgba(0,0,0,0.25)";
    if (!gauche) {
      k.fillRect(0, haut ? 0 : 4, 2, t);
    }
    if (!droite) {
      k.fillRect(t - 2, haut ? 0 : 4, 2, t);
    }
    if (!bas) {
      k.fillStyle = "rgba(0,0,0,0.35)";
      k.fillRect(0, t - 3, t, 3);
    }
    return;
  }
  if (nature === TRAVERSABLE) {
    const g = cle[1] === "1";
    const d = cle[2] === "1";
    k.fillStyle = th.planche[1];
    k.fillRect(0, 2, t, 6);
    k.fillStyle = th.planche[0];
    k.fillRect(0, 0, t, 5);
    k.fillStyle = "rgba(255,255,255,0.2)";
    k.fillRect(0, 0, t, 1);
    k.fillStyle = "rgba(0,0,0,0.25)";
    k.fillRect(4, 2.5, 7, 0.8);
    k.fillStyle = "#3a2a18";
    k.fillRect(2, 2, 1.5, 1.5);
    k.fillRect(t - 3.5, 2, 1.5, 1.5);
    if (!g) {
      k.fillStyle = th.planche[1];
      k.fillRect(1, 7, 3, 6);
    }
    if (!d) {
      k.fillStyle = th.planche[1];
      k.fillRect(t - 4, 7, 3, 6);
    }
    return;
  }
  if (nature === PIEU) {
    // Trois pieux de bambou taille en biseau
    [[1, 0], [6, -3], [11, 0]].forEach(([x, dy]) => {
      k.fillStyle = "#3f5a1a";
      k.fillRect(x, 6 + dy, 4, t - 6 - dy);
      k.fillStyle = "#7fb23a";
      k.fillRect(x, 6 + dy, 2, t - 6 - dy);
      k.fillStyle = "#c8e08a";
      k.beginPath();
      k.moveTo(x, 6 + dy);
      k.lineTo(x + 4, 1 + dy);
      k.lineTo(x + 4, 6 + dy);
      k.closePath();
      k.fill();
      k.fillStyle = "#3f5a1a";
      k.fillRect(x, 11, 4, 1);
    });
    return;
  }
  if (nature === EAU) {
    k.fillStyle = "#1d4a66";
    k.fillRect(0, 0, t, t);
    k.fillStyle = "#16384e";
    k.fillRect(0, t / 2, t, t / 2);
    return;
  }
  if (nature === BAMBOU) {
    const v = Number(cle[1]);
    const x = 5 + (v % 2);
    k.fillStyle = "#4a6a22";
    k.fillRect(x, 0, 6, t);
    k.fillStyle = "#7fb23a";
    k.fillRect(x + 1, 0, 2, t);
    k.fillStyle = "#3a5418";
    k.fillRect(x - 0.5, 6 + v, 7, 1.5);
    if (v === 3) {
      k.fillStyle = "#6a9a2a";
      k.beginPath();
      k.ellipse(x + 11, 4, 6, 2, -0.5, 0, Math.PI * 2);
      k.fill();
    }
    return;
  }
  if (nature === TORII) {
    const g = cle[1] === "1";
    const d = cle[2] === "1";
    const h = cle[3] === "1";
    if (g || d) {
      // Traverse
      const lg = k.createLinearGradient(0, 0, 0, t);
      lg.addColorStop(0, "#e0574b");
      lg.addColorStop(1, "#8f2620");
      k.fillStyle = lg;
      k.fillRect(g ? 0 : 2, 2, t - (g ? 0 : 2) - (d ? 0 : 2), t - 4);
      if (!h) {
        // Kasagi noir au sommet, bouts releves
        k.fillStyle = "#1a1418";
        k.fillRect(g ? 0 : -2, -1, t + (g ? 0 : 2) + (d ? 0 : 2), 4);
        if (!g) {
          k.fillRect(-4, -4, 4, 4);
        }
        if (!d) {
          k.fillRect(t, -4, 4, 4);
        }
      }
    } else {
      // Pilier cylindrique
      const lg = k.createLinearGradient(3, 0, t - 3, 0);
      lg.addColorStop(0, "#8f2620");
      lg.addColorStop(0.4, "#e0574b");
      lg.addColorStop(1, "#7a1e18");
      k.fillStyle = lg;
      k.fillRect(3, 0, t - 6, t);
      if (cle[4] === "0") {
        k.fillStyle = "#1a1418";
        k.fillRect(2, t - 4, t - 4, 4);
      }
    }
  }
}

// La surface de l'eau ondule : dessinee a chaque image
export function dessinerSurfaceEau(c, x, y, t, temps) {
  c.fillStyle = "#4a8fb0";
  const phase = temps * 3 + x * 0.15;
  for (let i = 0; i < t; i += 4) {
    const h = 1.5 + Math.sin(phase + i * 0.4) * 1;
    c.fillRect(x + i, y + 1 - h, 4, h + 1);
  }
  c.fillStyle = "rgba(255,255,255,0.35)";
  c.fillRect(x + ((temps * 20 + x) % t), y + 4, 3, 1);
}

// ---------------------------------------------------------------------
// Objets
// ---------------------------------------------------------------------

export function dessinerFeuille(c, x, y, temps, colonne) {
  const b = Math.sin(temps * 3 + colonne) * 1.5;
  c.save();
  c.translate(x + 8, y + 8 + b);
  c.rotate(Math.sin(temps * 2 + colonne) * 0.15);
  c.fillStyle = "#3f5a1a";
  c.beginPath();
  c.moveTo(-5, 6);
  c.bezierCurveTo(-8, -2, -2, -8, 6, -7);
  c.bezierCurveTo(7, 1, 2, 7, -5, 6);
  c.fill();
  c.fillStyle = "#9fd44a";
  c.beginPath();
  c.moveTo(-4, 5);
  c.bezierCurveTo(-7, -2, -2, -7, 5, -6);
  c.bezierCurveTo(5.5, 0, 1, 5, -4, 5);
  c.fill();
  c.strokeStyle = "#4a6a22";
  c.lineWidth = 0.8;
  c.beginPath();
  c.moveTo(-5, 6);
  c.lineTo(4, -5);
  c.stroke();
  c.fillStyle = "rgba(255,255,255,0.5)";
  c.fillRect(-2, -3, 2, 1);
  c.restore();
}

export function dessinerCaisse(c, x, y) {
  c.fillStyle = "#5a3a1e";
  c.fillRect(x, y, 16, 16);
  c.fillStyle = "#b07a40";
  c.fillRect(x + 1, y + 1, 14, 14);
  c.fillStyle = "#8a5a2c";
  c.fillRect(x + 1, y + 5, 14, 1);
  c.fillRect(x + 1, y + 10, 14, 1);
  c.strokeStyle = "#6a4422";
  c.lineWidth = 1.6;
  c.beginPath();
  c.moveTo(x + 2, y + 2);
  c.lineTo(x + 14, y + 14);
  c.stroke();
  c.fillStyle = "rgba(255,255,255,0.25)";
  c.fillRect(x + 1, y + 1, 14, 1);
  c.fillStyle = "#2a1a0e";
  [[2, 2], [13, 2], [2, 13], [13, 13]].forEach(([dx, dy]) => c.fillRect(x + dx, y + dy, 1.2, 1.2));
}

export function dessinerJizo(c, x, y, actif, temps) {
  // y : bas de la statue
  c.fillStyle = "rgba(0,0,0,0.3)";
  c.beginPath();
  c.ellipse(x + 8, y, 9, 2.5, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#7a766c";
  c.fillRect(x + 1, y - 6, 14, 6);
  const g = c.createLinearGradient(x + 2, 0, x + 14, 0);
  g.addColorStop(0, "#9a968a");
  g.addColorStop(1, "#6e6a60");
  c.fillStyle = g;
  c.beginPath();
  c.roundRect(x + 3, y - 22, 10, 17, 4);
  c.fill();
  c.beginPath();
  c.arc(x + 8, y - 25, 5, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#3a3630";
  c.fillRect(x + 5.5, y - 26, 1.5, 1);
  c.fillRect(x + 9, y - 26, 1.5, 1);
  // Bavoir rouge ; active, une petite offrande s'allume a ses pieds
  c.fillStyle = actif ? "#e0574b" : "#7a2a24";
  c.beginPath();
  c.moveTo(x + 3, y - 20);
  c.lineTo(x + 13, y - 20);
  c.lineTo(x + 8, y - 13);
  c.closePath();
  c.fill();
  if (actif) {
    c.fillStyle = "#f1ead2";
    c.fillRect(x + 15, y - 5, 2, 5);
    const f = Math.sin(temps * 12) * 0.6;
    c.fillStyle = "#f2b13a";
    c.beginPath();
    c.ellipse(x + 16, y - 7, 1.4, 2.4 + f, 0, 0, Math.PI * 2);
    c.fill();
  }
}

export function dessinerTuileToit(c, x, y) {
  c.fillStyle = "#2a3038";
  c.fillRect(x, y + 4, 16, 4);
  const g = c.createLinearGradient(0, y, 0, y + 8);
  g.addColorStop(0, "#7a8694");
  g.addColorStop(1, "#4a5560");
  c.fillStyle = g;
  for (let i = 0; i < 4; i++) {
    c.beginPath();
    c.arc(x + 2 + i * 4, y + 4, 2.4, Math.PI, 0);
    c.fill();
  }
  c.fillRect(x, y + 3, 16, 3);
}

export function dessinerOmikuji(c, x, y, vide, temps) {
  const bond = vide ? 0 : Math.max(0, Math.sin(temps * 4)) * 0.8;
  c.fillStyle = vide ? "#6a5a48" : "#8a6a3a";
  c.fillRect(x, y - bond, 16, 16);
  c.fillStyle = vide ? "#8a7c66" : "#f1e4c8";
  c.fillRect(x + 1.5, y + 1.5 - bond, 13, 13);
  if (!vide) {
    c.fillStyle = "#c8372d";
    c.fillRect(x + 6, y + 3 - bond, 4, 10);
    c.fillStyle = "#f1e4c8";
    c.fillRect(x + 7, y + 5 - bond, 2, 1.2);
    c.fillRect(x + 7, y + 8 - bond, 2, 1.2);
    c.fillStyle = "rgba(255,255,255,0.4)";
    c.fillRect(x + 1.5, y + 1.5 - bond, 13, 1);
  }
}

export function dessinerPlanche(c, x, y, largeur, monde) {
  const th = themeDu(monde);
  c.fillStyle = th.planche[1];
  c.fillRect(x, y + 2, largeur, 4);
  c.fillStyle = th.planche[0];
  c.fillRect(x, y, largeur, 4);
  c.fillStyle = "rgba(255,255,255,0.2)";
  c.fillRect(x, y, largeur, 1);
  c.fillStyle = "#3a2a18";
  for (let i = 4; i < largeur; i += 16) {
    c.fillRect(x + i, y + 1.5, 1.5, 1.5);
  }
  // Cordes qui la tiennent
  c.strokeStyle = "rgba(240,220,180,0.5)";
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(x + 3, y);
  c.lineTo(x + 3, y - 10);
  c.moveTo(x + largeur - 3, y);
  c.lineTo(x + largeur - 3, y - 10);
  c.stroke();
}

// ---------------------------------------------------------------------
// Le tanuki
// ---------------------------------------------------------------------

// cx : centre ; pieds : y du sol sous lui
export function dessinerTanuki(c, cx, pieds, o) {
  const pose = o.pose;
  const ph = o.phase || 0;
  c.save();
  c.translate(cx, pieds);
  if (o.gauche) {
    c.scale(-1, 1);
  }
  // Etirement au saut, ecrasement a l'atterrissage
  const sx = 1 + (o.squash || 0);
  const sy = 1 - (o.squash || 0);
  c.scale(sx, sy);
  const cours = pose === "course";
  const bob = cours ? Math.abs(Math.sin(ph)) * 1.5 : pose === "repos" ? Math.sin(o.temps * 3) * 0.6 : 0;
  c.translate(0, -bob);

  // Ombre au sol
  if (pose !== "saut" && pose !== "chute") {
    c.fillStyle = "rgba(0,0,0,0.25)";
    c.beginPath();
    c.ellipse(0, bob, 9, 2, 0, 0, Math.PI * 2);
    c.fill();
  }

  // Queue rayee, derriere
  c.save();
  c.translate(-8, -9);
  c.rotate(pose === "chute" ? -0.9 : cours ? -0.4 + Math.sin(ph * 2) * 0.25 : -0.2);
  c.fillStyle = "#6a4a2a";
  c.beginPath();
  c.ellipse(-5, 0, 7, 4.2, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#2e2016";
  c.fillRect(-7, -4, 2, 8);
  c.fillRect(-3, -4, 2, 8);
  c.fillStyle = "#2e2016";
  c.beginPath();
  c.ellipse(-11, 0, 2, 3, 0, 0, Math.PI * 2);
  c.fill();
  c.restore();

  // Pattes
  const jambe = (dx, angle) => {
    c.save();
    c.translate(dx, -7);
    c.rotate(angle);
    c.fillStyle = "#2e2016";
    c.beginPath();
    c.roundRect(-2, 0, 4.5, 7, 2);
    c.fill();
    c.restore();
  };
  if (pose === "saut") {
    jambe(-3, 0.6);
    jambe(4, -0.5);
  } else if (pose === "chute") {
    jambe(-3, -0.3);
    jambe(4, 0.4);
  } else if (cours) {
    jambe(-3, Math.sin(ph) * 0.8);
    jambe(4, -Math.sin(ph) * 0.8);
  } else {
    jambe(-3, 0);
    jambe(4, 0);
  }

  // Corps rond
  const g = c.createRadialGradient(-2, -14, 2, 0, -11, 11);
  g.addColorStop(0, "#a07a50");
  g.addColorStop(1, "#6a4a2a");
  c.fillStyle = g;
  c.beginPath();
  c.ellipse(0, -11, 8.5, 8, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#efe2c4";
  c.beginPath();
  c.ellipse(1.5, -9.5, 5, 5.5, 0, 0, Math.PI * 2);
  c.fill();

  // Bras
  c.fillStyle = "#2e2016";
  const bras = pose === "saut" ? -1.2 : pose === "chute" ? -0.6 : cours ? -Math.sin(ph) * 0.7 : 0.2;
  c.save();
  c.translate(5, -13);
  c.rotate(bras);
  c.beginPath();
  c.roundRect(-1.5, 0, 3.5, 6, 1.5);
  c.fill();
  c.restore();

  // Tete
  c.save();
  c.translate(2, -22);
  if (o.mort) {
    c.rotate(Math.sin(o.temps * 10) * 0.2);
  }
  c.fillStyle = "#6a4a2a";
  c.beginPath();
  c.moveTo(-7, -4);
  c.lineTo(-5, -10);
  c.lineTo(-2, -6);
  c.moveTo(7, -4);
  c.lineTo(5, -10);
  c.lineTo(2, -6);
  c.fill();
  const gt = c.createRadialGradient(-1, -3, 1, 0, -1, 9);
  gt.addColorStop(0, "#b08a5a");
  gt.addColorStop(1, "#7a5a36");
  c.fillStyle = gt;
  c.beginPath();
  c.ellipse(0, -1, 8, 7, 0, 0, Math.PI * 2);
  c.fill();
  // Masque sombre autour des yeux
  c.fillStyle = "#2e2016";
  c.beginPath();
  c.ellipse(-3.2, -1, 3, 2.4, -0.2, 0, Math.PI * 2);
  c.ellipse(3.2, -1, 3, 2.4, 0.2, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#f1ead2";
  c.beginPath();
  c.ellipse(-0.5, 3, 4.5, 2.6, 0, 0, Math.PI * 2);
  c.fill();
  if (o.bandeau) {
    // Hachimaki aux couleurs du clan, noue derriere la tete
    c.fillStyle = o.bandeau;
    c.beginPath();
    c.moveTo(-8, -5.5);
    c.quadraticCurveTo(0, -7.5, 8, -5.5);
    c.lineTo(7.6, -3.6);
    c.quadraticCurveTo(0, -5.6, -7.6, -3.6);
    c.closePath();
    c.fill();
    c.beginPath();
    c.moveTo(-7.5, -5);
    c.lineTo(-12, -7 + Math.sin((o.temps || 0) * 7) * 1.2);
    c.lineTo(-11.5, -4 + Math.sin((o.temps || 0) * 7 + 1) * 1.2);
    c.closePath();
    c.fill();
  }
  const humeur = o.humeur || "";
  if (!o.mort && humeur === "douleur") {
    // Yeux plisses de douleur
    c.strokeStyle = "#f1ead2";
    c.lineWidth = 1.1;
    c.lineCap = "round";
    c.beginPath();
    c.moveTo(-4.4, -2.4);
    c.lineTo(-2.2, -1.2);
    c.lineTo(-4.4, 0);
    c.moveTo(4.6, -2.4);
    c.lineTo(2.4, -1.2);
    c.lineTo(4.6, 0);
    c.stroke();
  } else if (!o.mort && humeur === "content") {
    c.strokeStyle = "#f1ead2";
    c.lineWidth = 1.1;
    c.lineCap = "round";
    [-3, 3.4].forEach(ex => {
      c.beginPath();
      c.arc(ex, -0.6, 1.4, Math.PI * 1.1, Math.PI * 1.9);
      c.stroke();
    });
  } else if (o.mort) {
    c.strokeStyle = "#f1ead2";
    c.lineWidth = 1;
    [-3.2, 3.2].forEach(ex => {
      c.beginPath();
      c.moveTo(ex - 1.2, -2.2);
      c.lineTo(ex + 1.2, 0.2);
      c.moveTo(ex + 1.2, -2.2);
      c.lineTo(ex - 1.2, 0.2);
      c.stroke();
    });
  } else {
    const cligne = Math.floor(o.temps * 10) % 37 === 0;
    c.fillStyle = "#ffffff";
    [-3, 3.4].forEach(ex => {
      c.beginPath();
      c.ellipse(ex, -1.2, 1.5, cligne ? 0.3 : 1.7, 0, 0, Math.PI * 2);
      c.fill();
    });
    if (!cligne) {
      c.fillStyle = "#141414";
      c.fillRect(-2.4, -1.8, 1.2, 1.4);
      c.fillRect(4.2, -1.8, 1.2, 1.4);
    }
  }
  c.fillStyle = "#141414";
  c.beginPath();
  c.ellipse(2.5, 2.2, 1.5, 1.1, 0, 0, Math.PI * 2);
  c.fill();
  if (humeur === "inquiet" || humeur === "colere") {
    // Sourcils : releves si inquiet, fronces si en colere
    const k = humeur === "inquiet" ? 1 : -1;
    c.strokeStyle = "#141414";
    c.lineWidth = 1;
    c.lineCap = "round";
    c.beginPath();
    c.moveTo(-5, -4 + k * 0.4);
    c.lineTo(-1.6, -4.4 - k * 1.2);
    c.moveTo(5.4, -4 + k * 0.4);
    c.lineTo(2, -4.4 - k * 1.2);
    c.stroke();
  }
  if (humeur === "douleur" || humeur === "inquiet") {
    c.fillStyle = "#3a1810";
    c.beginPath();
    c.ellipse(1.2, 4.6, humeur === "douleur" ? 1.6 : 1.1, humeur === "douleur" ? 1.4 : 0.8, 0, 0, Math.PI * 2);
    c.fill();
  } else if (humeur === "content" || humeur === "colere") {
    c.strokeStyle = "#3a1810";
    c.lineWidth = 0.9;
    c.beginPath();
    if (humeur === "content") {
      c.arc(1.2, 3.6, 1.8, 0.2, Math.PI - 0.2);
    } else {
      c.moveTo(-0.6, 5);
      c.lineTo(3, 4.6);
    }
    c.stroke();
  }
  // La feuille sur la tete, ou le chapeau de paille
  if (o.chapeau) {
    c.fillStyle = "#c8a052";
    c.beginPath();
    c.moveTo(-12, -5);
    c.quadraticCurveTo(0, -17, 12, -5);
    c.closePath();
    c.fill();
    c.fillStyle = "#a8803a";
    c.fillRect(-12, -6, 24, 1.5);
    c.strokeStyle = "#8a6428";
    c.lineWidth = 0.7;
    c.beginPath();
    c.moveTo(-6, -7);
    c.lineTo(0, -12);
    c.lineTo(6, -7);
    c.stroke();
  } else {
    c.fillStyle = "#7fb23a";
    c.beginPath();
    c.moveTo(-1, -7);
    c.bezierCurveTo(-4, -12, 2, -15, 5, -12);
    c.bezierCurveTo(4, -9, 1, -7, -1, -7);
    c.fill();
    c.strokeStyle = "#4a6a22";
    c.lineWidth = 0.7;
    c.beginPath();
    c.moveTo(-1, -7);
    c.lineTo(4, -12);
    c.stroke();
  }
  c.restore();
  c.restore();
}

// ---------------------------------------------------------------------
// Les yokai, un dessin par apparence
// ---------------------------------------------------------------------

// y.x, y.y : coin haut ; dimensions largeur/hauteur ; etat ; chrono
export function dessinerYokai(c, apparence, y, camX, camY, temps) {
  const cx = y.x + y.largeur / 2 - camX;
  const bas = y.y + y.hauteur - camY;
  const ch = y.chrono || 0;
  c.save();
  c.translate(cx, bas);
  if (!y.versLaGauche) {
    c.scale(-1, 1);
  }
  const fn = APPARENCES[apparence] || APPARENCES.kasaObake;
  fn(c, y, ch, temps);
  c.restore();
}

function ombre(c, l) {
  c.fillStyle = "rgba(0,0,0,0.25)";
  c.beginPath();
  c.ellipse(0, 0, l, 2, 0, 0, Math.PI * 2);
  c.fill();
}

function oeil(c, x, y, r) {
  c.fillStyle = "#ffffff";
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#141414";
  c.beginPath();
  c.arc(x - r * 0.35, y, r * 0.5, 0, Math.PI * 2);
  c.fill();
}

function carapaceSeule(c, couleur, sombre, y, ch) {
  ombre(c, 9);
  const tourne = y.etat === "lancee" ? ch * 30 : 0;
  c.save();
  c.translate(0, -6);
  c.scale(Math.cos(tourne) * 0.25 + 0.75, 1);
  c.fillStyle = sombre;
  c.beginPath();
  c.ellipse(0, 0, 10, 6.5, 0, Math.PI, 0);
  c.lineTo(10, 2);
  c.lineTo(-10, 2);
  c.fill();
  c.fillStyle = couleur;
  c.beginPath();
  c.ellipse(0, -1, 8.5, 5.5, 0, Math.PI, 0);
  c.fill();
  c.strokeStyle = sombre;
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(-4, -5);
  c.lineTo(-3, -1);
  c.moveTo(4, -5);
  c.lineTo(3, -1);
  c.moveTo(-8, -1);
  c.lineTo(8, -1);
  c.stroke();
  c.fillStyle = "#e8dcc0";
  c.fillRect(-10, 1, 20, 2);
  c.restore();
}

const APPARENCES = {
  // Parapluie a un oeil, qui sautille sur sa jambe unique
  kasaObake(c, y, ch) {
    const saut = Math.abs(Math.sin(ch * 6)) * 3;
    ombre(c, 8 - saut * 0.5);
    c.translate(0, -saut);
    c.fillStyle = "#c8a070";
    c.fillRect(-1, -6, 2, 6);
    c.fillStyle = "#3a2a1e";
    c.fillRect(-3, -1, 6, 1.5);
    c.fillStyle = "#4a3270";
    c.beginPath();
    c.moveTo(-11, -8);
    c.quadraticCurveTo(0, -26, 11, -8);
    c.closePath();
    c.fill();
    c.fillStyle = "#6a4aa0";
    c.beginPath();
    c.moveTo(-9, -9);
    c.quadraticCurveTo(0, -24, 9, -9);
    c.quadraticCurveTo(0, -12, -9, -9);
    c.fill();
    c.strokeStyle = "#3a2458";
    c.lineWidth = 0.8;
    c.beginPath();
    c.moveTo(0, -20);
    c.lineTo(-6, -9);
    c.moveTo(0, -20);
    c.lineTo(6, -9);
    c.stroke();
    oeil(c, -1, -13, 2.6);
    c.fillStyle = "#e0574b";
    c.beginPath();
    c.ellipse(-3, -8, 2, 3.5 + Math.sin(ch * 8), 0.3, 0, Math.PI * 2);
    c.fill();
  },
  // Kappa : coupelle sur la tete, carapace sur le dos
  kappa(c, y, ch) {
    if (y.etat !== "marche") {
      carapaceSeule(c, "#6a9a3a", "#3a5a1e", y, ch);
      return;
    }
    const pas = Math.sin(ch * 10);
    ombre(c, 9);
    c.fillStyle = "#3a5a1e";
    c.fillRect(-5 + pas, -5, 3, 5);
    c.fillRect(2 - pas, -5, 3, 5);
    c.fillStyle = "#4a6a2a";
    c.beginPath();
    c.ellipse(4, -10, 7, 6, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#7fb23a";
    c.beginPath();
    c.ellipse(-1, -10, 7, 6.5, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#e8dcc0";
    c.beginPath();
    c.ellipse(-3, -8, 3.5, 4, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#7fb23a";
    c.beginPath();
    c.arc(-1, -18, 5.5, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#a8d0e0";
    c.beginPath();
    c.ellipse(-1, -23, 4, 1.6, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#e8b83a";
    c.beginPath();
    c.moveTo(-7, -17);
    c.lineTo(-10, -16);
    c.lineTo(-7, -15);
    c.fill();
    oeil(c, -3.5, -19, 1.6);
  },
  // Corbeau tengu : visage rouge, ailes qui battent
  karasuTengu(c, y, ch) {
    const aile = Math.sin(ch * 14);
    c.translate(0, -9);
    c.fillStyle = "#1a1a24";
    c.save();
    c.rotate(-0.3 - aile * 0.6);
    c.beginPath();
    c.ellipse(4, -2, 10, 3.5, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
    c.fillStyle = "#2a2a38";
    c.beginPath();
    c.ellipse(0, 0, 7, 6, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#c8372d";
    c.beginPath();
    c.arc(-4, -3, 4, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#e8b83a";
    c.beginPath();
    c.moveTo(-7, -3);
    c.lineTo(-12, -1.5);
    c.lineTo(-7, -1);
    c.fill();
    oeil(c, -4.5, -4.2, 1.3);
    c.fillStyle = "#1a1a24";
    c.save();
    c.rotate(0.2 + aile * 0.7);
    c.beginPath();
    c.ellipse(5, 2, 9, 3.2, 0.3, 0, Math.PI * 2);
    c.fill();
    c.restore();
  },
  // Araignee suspendue a son fil
  tsuchigumo(c, y, ch) {
    if (y.etat === "suspendu") {
      c.strokeStyle = "rgba(230,230,240,0.6)";
      c.lineWidth = 0.8;
      c.beginPath();
      c.moveTo(0, -14);
      c.lineTo(0, -400);
      c.stroke();
    }
    const p = Math.sin(ch * 12) * 0.25;
    c.translate(0, -8);
    c.strokeStyle = "#3a2e40";
    c.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) {
      const a = 0.4 + i * 0.35 + (i % 2 ? p : -p);
      c.beginPath();
      c.moveTo(-2, 0);
      c.lineTo(-9, -4 + i * 3);
      c.lineTo(-11, 2 + i * 3);
      c.moveTo(2, 0);
      c.lineTo(9, -4 + i * 3);
      c.lineTo(11, 2 + i * 3);
      c.stroke();
      void a;
    }
    c.fillStyle = "#5a4560";
    c.beginPath();
    c.ellipse(0, 1, 7, 6, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#c8372d";
    c.fillRect(-2, -1, 4, 4);
    c.fillStyle = "#7d6a85";
    c.beginPath();
    c.arc(0, -5, 4, 0, Math.PI * 2);
    c.fill();
    oeil(c, -2, -5.5, 1.2);
    oeil(c, 2, -5.5, 1.2);
  },
  // Monde 2 : lanterne de papier qui sautille
  chochinObake(c, y, ch) {
    const saut = Math.abs(Math.sin(ch * 6)) * 3;
    ombre(c, 7);
    c.translate(0, -saut);
    c.fillStyle = "#2a1a12";
    c.fillRect(-6, -21, 12, 2.5);
    c.fillRect(-6, -3, 12, 2.5);
    const g = c.createLinearGradient(-8, 0, 8, 0);
    g.addColorStop(0, "#b8551c");
    g.addColorStop(0.5, "#f29a3a");
    g.addColorStop(1, "#a8481a");
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(0, -11, 8, 8.5, 0, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "rgba(90,30,10,0.5)";
    c.lineWidth = 0.7;
    [-14, -10, -6].forEach(yy => {
      c.beginPath();
      c.moveTo(-7.5, yy);
      c.lineTo(7.5, yy);
      c.stroke();
    });
    oeil(c, -2, -13, 2.4);
    c.fillStyle = "#3a0a0a";
    c.beginPath();
    c.ellipse(-1, -7, 3.5, 1.6, 0, 0, Math.PI);
    c.fill();
    c.fillStyle = "#e0574b";
    c.beginPath();
    c.ellipse(-2, -5, 1.8, 3 + Math.sin(ch * 9), 0.2, 0, Math.PI * 2);
    c.fill();
  },
  // Monde 2 : vieille tortue
  kame(c, y, ch) {
    if (y.etat !== "marche") {
      carapaceSeule(c, "#a8783a", "#5a3a1a", y, ch);
      return;
    }
    const pas = Math.sin(ch * 9);
    ombre(c, 10);
    c.fillStyle = "#7a8a5a";
    c.fillRect(-7 + pas, -4, 3, 4);
    c.fillRect(4 - pas, -4, 3, 4);
    c.beginPath();
    c.arc(-10, -9, 4, 0, Math.PI * 2);
    c.fill();
    oeil(c, -11, -10, 1.2);
    c.fillStyle = "#e8e2d0";
    c.beginPath();
    c.ellipse(-11, -5, 2.5, 3, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#5a3a1a";
    c.beginPath();
    c.ellipse(1, -7, 10, 7.5, 0, Math.PI, 0);
    c.fill();
    c.fillStyle = "#a8783a";
    c.beginPath();
    c.ellipse(1, -8, 8.5, 6, 0, Math.PI, 0);
    c.fill();
    c.strokeStyle = "#5a3a1a";
    c.lineWidth = 0.9;
    c.beginPath();
    c.moveTo(-3, -13);
    c.lineTo(-2, -8);
    c.moveTo(5, -13);
    c.lineTo(4, -8);
    c.stroke();
    c.fillStyle = "#e8dcc0";
    c.fillRect(-9, -7, 20, 2);
  },
  // Monde 2 : l'ittan-momen, bande de tissu qui vole
  ittanMomen(c, y, ch) {
    c.translate(0, -9);
    c.fillStyle = "#efe6d2";
    c.beginPath();
    c.moveTo(-10, -4);
    for (let i = 0; i <= 6; i++) {
      c.lineTo(-10 + i * 5, -4 + Math.sin(ch * 6 + i * 0.9) * 3);
    }
    for (let i = 6; i >= 0; i--) {
      c.lineTo(-10 + i * 5, 3 + Math.sin(ch * 6 + i * 0.9) * 3);
    }
    c.closePath();
    c.fill();
    c.strokeStyle = "#b8ae98";
    c.lineWidth = 0.8;
    c.stroke();
    oeil(c, -6, -1 + Math.sin(ch * 6) * 3, 1.5);
    oeil(c, -2, -1 + Math.sin(ch * 6 + 0.9) * 3, 1.5);
  },
  // Monde 2 : jorogumo, araignee violette
  jorogumo(c, y, ch, temps) {
    APPARENCES.tsuchigumo(c, y, ch, temps);
    c.fillStyle = "#e8b83a";
    c.fillRect(-1, -6, 2, 2);
  }
};

// ---------------------------------------------------------------------
// Effets : poussiere, eclats, points
// ---------------------------------------------------------------------

export function creerEffets() {
  let parts = [];
  let textes = [];
  return {
    poussiere(x, y, n, couleur) {
      for (let i = 0; i < (n || 5); i++) {
        parts.push({ x, y, vx: (Math.random() - 0.5) * 50, vy: -Math.random() * 25, vie: 0.35 + Math.random() * 0.2, r: 1.5 + Math.random() * 2, couleur: couleur || "rgba(230,215,190,0.8)", rond: true, g: 0 });
      }
    },
    eclats(x, y, couleurs, n) {
      for (let i = 0; i < (n || 10); i++) {
        const a = Math.random() * Math.PI * 2;
        const v = 60 + Math.random() * 120;
        parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, vie: 0.5 + Math.random() * 0.3, r: 1.5 + Math.random() * 2, couleur: couleurs[i % couleurs.length], rond: false, g: 500 });
      }
    },
    texte(x, y, t, couleur) {
      textes.push({ x, y, t, couleur: couleur || "#ffffff", age: 0 });
    },
    maj(dt) {
      parts = parts.filter(p => {
        p.vie -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += p.g * dt;
        p.vx *= 0.96;
        return p.vie > 0;
      });
      textes = textes.filter(t => {
        t.age += dt;
        return t.age < 0.8;
      });
    },
    vider() {
      parts = [];
      textes = [];
    },
    dessiner(c, camX, camY) {
      parts.forEach(p => {
        c.globalAlpha = Math.min(1, p.vie * 3);
        c.fillStyle = p.couleur;
        if (p.rond) {
          c.beginPath();
          c.arc(p.x - camX, p.y - camY, p.r * (1.4 - p.vie), 0, Math.PI * 2);
          c.fill();
        } else {
          c.fillRect(p.x - camX - p.r / 2, p.y - camY - p.r / 2, p.r, p.r);
        }
      });
      c.globalAlpha = 1;
      textes.forEach(t => {
        c.globalAlpha = t.age > 0.5 ? (0.8 - t.age) / 0.3 : 1;
        texteContour(c, t.t, t.x - camX, t.y - camY - t.age * 26, 9, t.couleur, "center");
      });
      c.globalAlpha = 1;
    }
  };
}

// ---------------------------------------------------------------------
// Texte et tete d'affichage
// ---------------------------------------------------------------------

export function texteContour(c, t, x, y, taille, couleur, alignement) {
  c.font = "800 " + taille + "px 'Anybody', sans-serif";
  c.textAlign = alignement || "left";
  c.textBaseline = "middle";
  c.lineJoin = "round";
  c.lineWidth = Math.max(2.5, taille * 0.22);
  c.strokeStyle = "#141018";
  c.strokeText(t, x, y);
  c.fillStyle = couleur;
  c.fillText(t, x, y);
}

export function dessinerTete(c, L, infos) {
  // Vies : une petite tete de tanuki
  c.save();
  c.translate(18, 18);
  c.fillStyle = "#7a5a36";
  c.beginPath();
  c.arc(0, 0, 7, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#2e2016";
  c.beginPath();
  c.ellipse(-2.6, 0, 2.4, 1.8, 0, 0, Math.PI * 2);
  c.ellipse(2.6, 0, 2.4, 1.8, 0, 0, Math.PI * 2);
  c.fill();
  c.restore();
  texteContour(c, "x" + infos.vies, 30, 19, 14, "#ffffff");
  // Feuilles
  dessinerFeuille(c, 64, 10, 0, 0);
  texteContour(c, String(infos.feuilles), 84, 19, 14, "#c6f35a");
  // Score au centre
  texteContour(c, String(infos.score).padStart(6, "0"), L / 2, 19, 16, "#ffffff", "center");
  // Niveau et temps a droite
  texteContour(c, infos.etiquette, L - 70, 19, 12, "#f1ead2", "right");
  texteContour(c, String(infos.temps), L - 14, 19, 16, infos.temps <= 50 ? "#ff8a7a" : "#ffe38a", "right");
}

// ---------------------------------------------------------------------
// Carte du monde, entre les niveaux
// ---------------------------------------------------------------------

export function dessinerCarte(c, L, H, o) {
  const th = themeDu(o.monde);
  dessinerFond(c, o.monde, o.temps * 12, 0, L, H, o.temps);
  c.fillStyle = "rgba(14,10,24,0.35)";
  c.fillRect(0, 0, L, H);
  const n = o.niveaux.length;
  const points = o.niveaux.map((_, i) => [90 + i * ((L - 180) / Math.max(1, n - 1 + 1)), 250 - (i % 2) * 60]);
  points.push([L - 90, 220]);
  // Chemin
  c.strokeStyle = "#f1e4c8";
  c.lineWidth = 4;
  c.setLineDash([2, 9]);
  c.lineCap = "round";
  c.beginPath();
  points.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
  c.stroke();
  c.setLineDash([]);
  points.forEach((p, i) => {
    const fini = i < o.niveau;
    const courant = i === o.niveau;
    const dernier = i === points.length - 1;
    c.fillStyle = "rgba(0,0,0,0.35)";
    c.beginPath();
    c.ellipse(p[0] + 2, p[1] + 14, 18, 5, 0, 0, Math.PI * 2);
    c.fill();
    if (dernier) {
      // Le torii du monde suivant
      c.fillStyle = "#c8372d";
      c.fillRect(p[0] - 14, p[1] - 22, 4, 30);
      c.fillRect(p[0] + 10, p[1] - 22, 4, 30);
      c.fillRect(p[0] - 18, p[1] - 22, 36, 5);
      c.fillStyle = "#1a1418";
      c.fillRect(p[0] - 20, p[1] - 26, 40, 4);
      c.fillStyle = "#c8372d";
      c.fillRect(p[0] - 14, p[1] - 13, 28, 3);
      return;
    }
    c.fillStyle = fini ? "#7fb23a" : courant ? "#e8b83a" : "#5a5470";
    c.beginPath();
    c.arc(p[0], p[1], 14, 0, Math.PI * 2);
    c.fill();
    c.lineWidth = 3;
    c.strokeStyle = courant ? "#ffffff" : "#1a1418";
    c.stroke();
    texteContour(c, (o.monde + 1) + "-" + (i + 1), p[0], p[1] + 1, 11, "#ffffff", "center");
    texteContour(c, o.niveaux[i].nom, p[0], p[1] + 30, 8, fini || courant ? "#f1ead2" : "#a8a2c0", "center");
  });
  // Le tanuki attend sur le niveau a jouer
  const p = points[Math.min(o.niveau, points.length - 1)];
  dessinerTanuki(c, p[0], p[1] - 14, { pose: "repos", temps: o.temps, chapeau: o.chapeau });
  texteContour(c, "MONDE " + (o.monde + 1), L / 2, 46, 13, "#e8b83a", "center");
  texteContour(c, o.nomMonde.toUpperCase(), L / 2, 72, 24, "#ffffff", "center");
  if (Math.floor(o.temps * 2) % 2 === 0) {
    texteContour(c, o.invite, L / 2, H - 34, 11, "#c6f35a", "center");
  }
  void th;
}
