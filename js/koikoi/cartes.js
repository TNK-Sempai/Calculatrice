// =====================================================================
//  KOI-KOI - les 48 cartes du hanafuda
//  Chaque carte est une image vectorielle (SVG) : nette a toute taille,
//  du petit ecran de telephone au grand moniteur. Douze mois de quatre
//  cartes : lumieres, animaux, rubans et kasu, avec les motifs
//  traditionnels de chaque mois (pin et grue, prunier et rossignol...).
//  Pas de texte dans les SVG : une image chargee en <img> n'a pas acces
//  aux polices de la page, les poemes des rubans sont donc traces au
//  pinceau.
// =====================================================================

export const LARGEUR = 100;
export const HAUTEUR = 150;

export const MOIS = [
  { nom: "Pin", kanji: "一" },
  { nom: "Prunier", kanji: "二" },
  { nom: "Cerisier", kanji: "三" },
  { nom: "Glycine", kanji: "四" },
  { nom: "Iris", kanji: "五" },
  { nom: "Pivoine", kanji: "六" },
  { nom: "Lespédèze", kanji: "七" },
  { nom: "Susuki", kanji: "八" },
  { nom: "Chrysanthème", kanji: "九" },
  { nom: "Érable", kanji: "十" },
  { nom: "Saule", kanji: "十一" },
  { nom: "Paulownia", kanji: "十二" }
];

// type : lumiere, animal, ruban, kasu. sujet : ce qui est dessine dessus.
const DEFINITIONS = [
  [["lumiere", "grue", "Grue et soleil"], ["ruban", "poeme", "Ruban poème"], ["kasu"], ["kasu"]],
  [["animal", "fauvette", "Rossignol"], ["ruban", "poeme", "Ruban poème"], ["kasu"], ["kasu"]],
  [["lumiere", "rideau", "Rideau"], ["ruban", "poeme", "Ruban poème"], ["kasu"], ["kasu"]],
  [["animal", "coucou", "Coucou"], ["ruban", "rouge", "Ruban rouge"], ["kasu"], ["kasu"]],
  [["animal", "pont", "Pont de planches"], ["ruban", "rouge", "Ruban rouge"], ["kasu"], ["kasu"]],
  [["animal", "papillons", "Papillons"], ["ruban", "bleu", "Ruban bleu"], ["kasu"], ["kasu"]],
  [["animal", "sanglier", "Sanglier"], ["ruban", "rouge", "Ruban rouge"], ["kasu"], ["kasu"]],
  [["lumiere", "lune", "Pleine lune"], ["animal", "oies", "Oies sauvages"], ["kasu"], ["kasu"]],
  [["animal", "coupe", "Coupe de saké"], ["ruban", "bleu", "Ruban bleu"], ["kasu"], ["kasu"]],
  [["animal", "cerf", "Cerf"], ["ruban", "bleu", "Ruban bleu"], ["kasu"], ["kasu"]],
  [["lumiere", "pluie", "Homme à l'ombrelle"], ["animal", "hirondelle", "Hirondelle"], ["ruban", "rouge", "Ruban rouge"], ["kasu", "eclair", "Orage"]],
  [["lumiere", "phenix", "Phénix"], ["kasu"], ["kasu"], ["kasu"]]
];

export const CARTES = [];
DEFINITIONS.forEach((liste, m) => {
  liste.forEach(([type, sujet, nom], k) => {
    CARTES.push({
      id: m * 4 + k,
      mois: m,
      type,
      sujet: sujet || "kasu",
      variante: k,
      nom: (nom || "Kasu") + " · " + MOIS[m].nom
    });
  });
});

export const TYPES = {
  lumiere: { nom: "Lumière", kanji: "光" },
  animal: { nom: "Animal", kanji: "種" },
  ruban: { nom: "Ruban", kanji: "短" },
  kasu: { nom: "Kasu", kanji: "" }
};

// ---------------------------------------------------------------------
// Palette, celle des cartes imprimees : aplats francs, peu de nuances
// ---------------------------------------------------------------------

const C = {
  bord: "#16110d",
  papier: "#f1e8d2",
  papierOmbre: "#ddd0b0",
  rouge: "#c8302a",
  rougeSombre: "#7e1c16",
  rose: "#ee9aa6",
  roseClair: "#f8cfd3",
  vert: "#2f6b34",
  vertSombre: "#1b4222",
  vertClair: "#79ad45",
  olive: "#8a9a3a",
  brun: "#5e3b20",
  brunClair: "#94643a",
  noir: "#17171c",
  nuit: "#1d2347",
  bleu: "#2a4f9e",
  bleuClair: "#6f93d6",
  violet: "#6b3f9e",
  violetClair: "#b292dc",
  jaune: "#e9b52a",
  jauneClair: "#f6dc7a",
  or: "#d29b1c",
  blanc: "#fbf7ec",
  ciel: "#c9dcd8"
};

// ---------------------------------------------------------------------
// Petits outils de dessin SVG
// ---------------------------------------------------------------------

function attr(o) {
  return Object.entries(o).map(([k, v]) => `${k}="${v}"`).join(" ");
}

const el = (nom, o, contenu) => contenu === undefined ? `<${nom} ${attr(o)}/>` : `<${nom} ${attr(o)}>${contenu}</${nom}>`;
const chemin = (d, fill, extra) => el("path", Object.assign({ d, fill }, extra || {}));
const disque = (cx, cy, r, fill, extra) => el("circle", Object.assign({ cx, cy, r, fill }, extra || {}));
const ovale = (cx, cy, rx, ry, fill, extra) => el("ellipse", Object.assign({ cx, cy, rx, ry, fill }, extra || {}));
const trait = (d, stroke, w, extra) => el("path", Object.assign({ d, fill: "none", stroke, "stroke-width": w, "stroke-linecap": "round", "stroke-linejoin": "round" }, extra || {}));
const groupe = (contenu, transform) => `<g${transform ? ` transform="${transform}"` : ""}>${contenu}</g>`;

// Fleur a cinq petales (prunier, sakura)
function fleur5(cx, cy, r, couleur, coeur, echancree) {
  let s = "";
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i / 5) * Math.PI * 2;
    const x = cx + Math.cos(a) * r * 0.55;
    const y = cy + Math.sin(a) * r * 0.55;
    s += ovale(x.toFixed(1), y.toFixed(1), (r * 0.5).toFixed(1), (r * 0.42).toFixed(1), couleur, { transform: `rotate(${(a * 180 / Math.PI + 90).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})` });
    if (echancree) {
      const xe = cx + Math.cos(a) * r * 1.02;
      const ye = cy + Math.sin(a) * r * 1.02;
      s += chemin(`M${(xe - Math.cos(a + 1.57) * r * 0.12).toFixed(1)} ${(ye - Math.sin(a + 1.57) * r * 0.12).toFixed(1)} L${(cx + Math.cos(a) * r * 0.8).toFixed(1)} ${(cy + Math.sin(a) * r * 0.8).toFixed(1)} L${(xe + Math.cos(a + 1.57) * r * 0.12).toFixed(1)} ${(ye + Math.sin(a + 1.57) * r * 0.12).toFixed(1)}Z`, C.papier);
    }
  }
  s += disque(cx, cy, r * 0.28, coeur);
  return s;
}

// ---------------------------------------------------------------------
// Les plantes des douze mois. "m" : miroir horizontal pour varier les
// kasu jumelles.
// ---------------------------------------------------------------------

function touffePin(cx, cy, r) {
  // Une touffe d'aiguilles : un eventail sombre, ourle de clair
  let s = chemin(`M${cx - r} ${cy} Q${cx - r} ${cy - r * 0.9} ${cx} ${cy - r * 0.95} Q${cx + r} ${cy - r * 0.9} ${cx + r} ${cy} Q${cx} ${cy + r * 0.35} ${cx - r} ${cy}Z`, C.vertSombre);
  s += chemin(`M${cx - r * 0.8} ${cy - r * 0.15} Q${cx - r * 0.7} ${cy - r * 0.75} ${cx} ${cy - r * 0.8} Q${cx + r * 0.7} ${cy - r * 0.75} ${cx + r * 0.8} ${cy - r * 0.15} Q${cx} ${cy + r * 0.1} ${cx - r * 0.8} ${cy - r * 0.15}Z`, C.vert);
  for (let i = -3; i <= 3; i++) {
    s += trait(`M${cx} ${cy + r * 0.1} L${cx + i * r * 0.27} ${cy - r * 0.72}`, C.vertSombre, 1.1);
  }
  return s;
}

const PLANTES = [
  // 1. Pin
  () => trait("M18 150 C26 118 40 104 34 84 C30 70 44 60 56 58", C.brun, 7) +
    trait("M34 92 C50 90 62 98 74 92", C.brun, 4) +
    touffePin(30, 76, 22) + touffePin(62, 60, 20) + touffePin(76, 96, 18) + touffePin(22, 110, 16),
  // 2. Prunier
  () => trait("M8 150 C20 124 18 104 30 90 C40 78 38 62 52 52 C62 46 70 34 88 30", C.brun, 6) +
    trait("M30 92 C46 96 58 92 70 100", C.brun, 3.5) + trait("M52 54 C60 62 74 62 84 70", C.brun, 3) +
    fleur5(54, 50, 9, C.rouge, C.jaune) + fleur5(80, 32, 8, C.rouge, C.jaune) + fleur5(70, 100, 8, C.rouge, C.jaune) +
    fleur5(30, 88, 7, C.rouge, C.jaune) + fleur5(84, 70, 7, C.blanc, C.rouge) + fleur5(40, 70, 6, C.blanc, C.rouge),
  // 3. Cerisier
  () => trait("M92 150 C80 124 84 108 70 96 C58 86 62 70 48 62", C.brun, 6) + trait("M70 98 C56 104 42 102 30 110", C.brun, 3.5) +
    fleur5(46, 60, 10, C.rose, C.rouge, true) + fleur5(28, 70, 8, C.roseClair, C.rouge, true) + fleur5(62, 74, 8, C.rose, C.rouge, true) +
    fleur5(30, 108, 8, C.rose, C.rouge, true) + fleur5(50, 100, 7, C.roseClair, C.rouge, true) + fleur5(66, 46, 7, C.roseClair, C.rouge, true) +
    chemin("M3 128 Q30 118 50 128 T97 126 V147 H3Z", C.rouge),
  // 4. Glycine
  () => {
    let s = trait("M3 18 C30 26 50 14 97 22", C.brun, 4);
    [[18, 22, 7], [40, 22, 9], [62, 18, 7], [82, 22, 8]].forEach(([x, y, n]) => {
      for (let i = 0; i < n; i++) {
        const yy = y + 6 + i * 7;
        const rr = 5.5 - i * 0.45;
        s += ovale(x + Math.sin(i * 1.3) * 2, yy, rr, rr * 0.8, i % 2 ? C.violetClair : C.violet);
      }
      s += trait(`M${x} ${y} L${x + 2} ${y + n * 7}`, C.vertSombre, 0.8);
    });
    s += chemin("M30 22 Q38 12 46 20 Q38 26 30 22Z", C.vert) + chemin("M68 18 Q76 8 84 16 Q76 22 68 18Z", C.vert);
    return s;
  },
  // 5. Iris
  () => {
    let s = "";
    [[30, 150, 22, 60], [44, 150, 50, 70], [60, 150, 72, 64], [74, 150, 84, 84], [20, 150, 8, 92]].forEach(([x0, y0, x1, y1]) => {
      s += chemin(`M${x0 - 3} ${y0} Q${(x0 + x1) / 2 - 4} ${(y0 + y1) / 2} ${x1} ${y1} Q${(x0 + x1) / 2 + 4} ${(y0 + y1) / 2} ${x0 + 3} ${y0}Z`, C.vert);
    });
    [[24, 56], [52, 66], [74, 58]].forEach(([x, y]) => {
      s += chemin(`M${x} ${y} Q${x - 10} ${y - 10} ${x - 4} ${y - 20} Q${x} ${y - 10} ${x} ${y}Z`, C.violet);
      s += chemin(`M${x} ${y} Q${x + 10} ${y - 10} ${x + 4} ${y - 20} Q${x} ${y - 10} ${x} ${y}Z`, C.violet);
      s += chemin(`M${x} ${y} Q${x - 14} ${y + 2} ${x - 12} ${y + 12} Q${x - 4} ${y + 6} ${x} ${y}Z`, C.bleu);
      s += chemin(`M${x} ${y} Q${x + 14} ${y + 2} ${x + 12} ${y + 12} Q${x + 4} ${y + 6} ${x} ${y}Z`, C.bleu);
      s += ovale(x, y - 2, 2.5, 4, C.jaune);
    });
    return s;
  },
  // 6. Pivoine
  () => {
    let s = "";
    [[20, 120, -30], [80, 116, 30], [50, 132, 0], [30, 92, -50], [72, 90, 50]].forEach(([x, y, a]) => {
      s += chemin(`M${x} ${y} q-10 -6 -6 -18 q8 2 10 8 q2 -10 10 -12 q2 12 -6 22Z`, C.vert, { transform: `rotate(${a} ${x} ${y})` });
    });
    const pivoine = (cx, cy, r) => {
      let p = disque(cx, cy, r, C.rougeSombre);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        p += ovale((cx + Math.cos(a) * r * 0.55).toFixed(1), (cy + Math.sin(a) * r * 0.55).toFixed(1), r * 0.48, r * 0.38, C.rouge, { transform: `rotate(${(a * 57.3).toFixed(0)} ${(cx + Math.cos(a) * r * 0.55).toFixed(1)} ${(cy + Math.sin(a) * r * 0.55).toFixed(1)})` });
      }
      p += disque(cx, cy, r * 0.5, C.rose) + disque(cx, cy, r * 0.22, C.jaune);
      return p;
    };
    return s + pivoine(50, 96, 20) + pivoine(22, 72, 12) + pivoine(78, 70, 11);
  },
  // 7. Lespedeze : branches arquees, petites feuilles et fleurs rouges
  () => {
    let s = "";
    [["M10 150 C14 110 30 80 58 62", 0], ["M50 150 C52 120 66 96 90 84", 1], ["M30 150 C34 128 18 110 6 100", 2]].forEach(([d, k]) => {
      s += trait(d, C.brun, 2.5);
    });
    const feuille = (x, y, a, c) => ovale(x, y, 5, 2.4, c, { transform: `rotate(${a} ${x} ${y})` });
    [[16, 128, -60], [20, 110, -50], [28, 96, -40], [38, 82, -30], [50, 70, -20], [56, 130, -70], [60, 112, -50], [70, 100, -30], [82, 90, -20], [22, 118, 30], [12, 106, 40]].forEach(([x, y, a], i) => {
      s += feuille(x, y, a, i % 2 ? C.vert : C.olive);
      s += feuille(x + 6, y + 2, a + 50, C.vertSombre);
    });
    [[44, 76], [58, 64], [76, 94], [88, 86], [30, 90], [8, 102]].forEach(([x, y]) => {
      s += ovale(x, y, 3.2, 2, C.rouge) + ovale(x + 3, y + 3, 2.6, 1.8, C.rose);
    });
    return s;
  },
  // 8. Susuki : la colline noire et ses herbes
  () => {
    let s = chemin("M3 92 Q50 66 97 92 V147 H3Z", C.noir);
    for (let i = 0; i < 9; i++) {
      const x = 8 + i * 10.5;
      const h = 22 + (i % 3) * 8;
      s += trait(`M${x} ${86 - Math.abs(4.5 - i) * -1} q4 ${-h * 0.6} ${10 + (i % 2) * 4} ${-h}`, C.papier, 1.4);
    }
    return s;
  },
  // 9. Chrysantheme
  () => {
    let s = "";
    [[20, 130, -20], [78, 128, 20], [50, 140, 0]].forEach(([x, y, a]) => {
      s += chemin(`M${x} ${y} q-12 -4 -10 -16 q6 4 10 6 q0 -8 8 -10 q2 10 -8 20Z`, C.vert, { transform: `rotate(${a} ${x} ${y})` });
    });
    s += trait("M50 150 C48 130 44 116 40 100 M50 150 C56 132 64 118 70 106", C.vertSombre, 2);
    const kiku = (cx, cy, r, c, c2) => {
      let k = "";
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const x = cx + Math.cos(a) * r * 0.62;
        const y = cy + Math.sin(a) * r * 0.62;
        k += ovale(x.toFixed(1), y.toFixed(1), r * 0.42, r * 0.13, i % 2 ? c : c2, { transform: `rotate(${(a * 57.3).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})` });
      }
      return k + disque(cx, cy, r * 0.3, c2);
    };
    return s + kiku(40, 96, 16, C.jaune, C.or) + kiku(70, 104, 12, C.rouge, C.rougeSombre) + kiku(22, 70, 10, C.jaune, C.or);
  },
  // 10. Erable : feuilles rouges en etoile
  () => {
    let s = trait("M94 4 C80 30 70 44 58 56 C46 68 34 74 20 78 M70 44 C76 60 86 66 94 70", C.brun, 2.5);
    const feuille = (cx, cy, r, c, a) => {
      let f = "";
      for (let i = 0; i < 7; i++) {
        const b = -Math.PI / 2 + ((i - 3) / 7) * Math.PI * 1.6;
        const rr = i === 3 ? r : i === 0 || i === 6 ? r * 0.55 : r * 0.82;
        f += chemin(`M${cx} ${cy} L${(cx + Math.cos(b - 0.2) * rr * 0.5).toFixed(1)} ${(cy + Math.sin(b - 0.2) * rr * 0.5).toFixed(1)} L${(cx + Math.cos(b) * rr).toFixed(1)} ${(cy + Math.sin(b) * rr).toFixed(1)} L${(cx + Math.cos(b + 0.2) * rr * 0.5).toFixed(1)} ${(cy + Math.sin(b + 0.2) * rr * 0.5).toFixed(1)}Z`, c);
      }
      return groupe(f, `rotate(${a} ${cx} ${cy})`);
    };
    [[58, 52, 13, C.rouge, 10], [28, 76, 11, C.rougeSombre, -20], [84, 26, 11, C.rouge, 30], [86, 70, 10, C.rougeSombre, 40], [44, 66, 9, C.rouge, -10], [72, 40, 9, C.jaune, 20]].forEach(f => {
      s += feuille(...f);
    });
    return s;
  },
  // 11. Saule : longues tiges et feuilles
  () => {
    let s = "";
    [[20, 0, 26, 110], [36, 0, 30, 90], [52, 0, 60, 120], [70, 0, 66, 100], [86, 0, 92, 116]].forEach(([x0, y0, x1, y1]) => {
      s += trait(`M${x0} ${y0} Q${x0 + 8} ${(y0 + y1) / 2} ${x1} ${y1}`, C.vertSombre, 1.4);
      for (let t = 0.15; t < 1; t += 0.14) {
        const x = x0 + (x1 - x0) * t + Math.sin(t * 3) * 4;
        const y = y0 + (y1 - y0) * t;
        s += ovale(x.toFixed(1), y.toFixed(1), 2, 6, C.vert, { transform: `rotate(${(t * 40 - 20).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})` });
      }
    });
    return s;
  },
  // 12. Paulownia : grandes feuilles et grappes violettes
  () => {
    let s = "";
    [[50, 132, 0, 30], [22, 120, -30, 22], [78, 120, 30, 22]].forEach(([x, y, a, r]) => {
      s += groupe(chemin(`M0 0 C${-r} ${-r * 0.2} ${-r} ${-r * 1.3} 0 ${-r * 1.4} C${r} ${-r * 1.3} ${r} ${-r * 0.2} 0 0Z`, C.vert) +
        trait(`M0 0 L0 ${-r * 1.3} M0 ${-r * 0.6} L${-r * 0.5} ${-r * 0.95} M0 ${-r * 0.6} L${r * 0.5} ${-r * 0.95}`, C.vertSombre, 1.2), `translate(${x} ${y}) rotate(${a})`);
    });
    [[30, 70], [50, 60], [70, 70]].forEach(([x, y]) => {
      for (let i = 0; i < 5; i++) {
        s += ovale(x + (i % 2 ? 4 : -4), y - i * 7, 5 - i * 0.6, 4, i % 2 ? C.violet : C.violetClair);
      }
      s += trait(`M${x} ${y + 4} L${x} ${y - 32}`, C.vertSombre, 1);
    });
    return s;
  }
];

// ---------------------------------------------------------------------
// Les sujets
// ---------------------------------------------------------------------

const SUJETS = {
  grue: () =>
    disque(58, 50, 26, C.rouge) +
    // La grue : grand corps blanc, cou noir, calotte rouge
    chemin("M22 128 C20 110 30 96 46 92 C56 90 62 82 60 70 C59 62 64 58 68 60 C72 62 70 70 68 76 C66 90 72 104 64 118 C58 128 40 134 22 128Z", C.blanc, { stroke: C.noir, "stroke-width": 1.2 }) +
    trait("M60 70 C60 64 64 59 68 60", C.noir, 5) +
    disque(67, 60, 3, C.rouge) +
    chemin("M70 60 L84 64 L70 63Z", C.or) +
    chemin("M24 126 C34 120 44 122 52 128 C42 132 32 132 24 126Z", C.noir) +
    trait("M46 128 L44 146 M52 126 L54 146", C.noir, 1.6),
  fauvette: () =>
    groupe(ovale(0, 0, 14, 9, C.olive) + chemin("M-12 -2 L-26 -8 L-24 2Z", C.vertSombre) + disque(10, -6, 7, C.olive) +
      disque(12, -7, 1.6, C.noir) + chemin("M16 -6 L22 -5 L16 -4Z", C.noir) + chemin("M-4 -2 Q2 -10 8 -2 Q2 2 -4 -2Z", C.vert) +
      trait("M-2 8 L-4 14 M4 8 L4 14", C.brun, 1.4), "translate(54 116)"),
  rideau: () => {
    // Le rideau (maku) tendu sur la colline, aux couleurs du festival
    let s = chemin("M6 92 Q50 84 94 92 L92 140 Q50 132 8 140Z", C.rouge);
    s += chemin("M6 92 Q50 84 94 92 L94 98 Q50 90 6 98Z", C.blanc);
    s += chemin("M30 94 L32 136 L44 135 L42 92Z", C.blanc) + chemin("M58 92 L60 134 L72 135 L70 93Z", C.blanc);
    s += disque(51, 113, 8, C.blanc) + disque(51, 113, 5, C.rouge) + disque(51, 113, 2, C.blanc);
    [10, 28, 46, 64, 82].forEach(x => {
      s += disque(x + 4, 93, 2, C.noir);
    });
    return s;
  },
  coucou: () =>
    groupe(chemin("M-20 0 Q-6 -8 10 -4 Q20 -2 24 2 Q10 6 -6 6 Z", C.noir) + chemin("M-6 -2 L-24 -18 L-10 -2Z", C.noir) +
      chemin("M0 2 L-14 16 L4 4Z", C.noir) + disque(16, -2, 1.4, C.jaune) + chemin("M24 1 L30 2 L24 3Z", C.jaune), "translate(46 40) rotate(-12)") +
    chemin("M70 18 A14 14 0 1 0 84 36 A11 11 0 1 1 70 18Z", C.jaune),
  pont: () =>
    // Le pont en zigzag au-dessus de l'eau (yatsuhashi)
    chemin("M3 104 L60 96 L97 112 V147 H3Z", C.bleuClair) +
    chemin("M0 118 L44 104 L100 124 L100 132 L44 112 L0 126Z", C.brunClair, { stroke: C.brun, "stroke-width": 1.4 }) +
    trait("M10 115 L10 140 M30 109 L30 134 M60 109 L60 136 M84 118 L84 142", C.brun, 2.4),
  papillons: () => {
    const papillon = (x, y, a, c) => groupe(
      chemin("M0 0 C-14 -16 -22 -4 -14 6 C-10 10 -4 6 0 0Z", c) + chemin("M0 0 C14 -16 22 -4 14 6 C10 10 4 6 0 0Z", c) +
      chemin("M0 2 C-8 10 -10 18 -4 16 C-2 14 0 8 0 2Z", C.noir) + chemin("M0 2 C8 10 10 18 4 16 C2 14 0 8 0 2Z", C.noir) +
      disque(-11, -3, 2.4, C.jaune) + disque(11, -3, 2.4, C.jaune) + trait("M0 -6 L0 12", C.noir, 2) +
      trait("M0 -6 L-4 -14 M0 -6 L4 -14", C.noir, 1), `translate(${x} ${y}) rotate(${a})`);
    return papillon(30, 34, -20, C.bleuClair) + papillon(70, 28, 15, C.jaune);
  },
  sanglier: () =>
    groupe(chemin("M-30 6 C-30 -14 -10 -22 10 -18 C24 -16 32 -6 34 4 C30 14 18 16 0 16 C-16 16 -28 14 -30 6Z", C.brun) +
      chemin("M-24 -6 C-10 -16 10 -16 22 -10", "none", { stroke: C.noir, "stroke-width": 2.4 }) +
      chemin("M30 0 L40 4 L32 8Z", C.brunClair) + disque(24, -4, 1.8, C.noir) + chemin("M32 6 Q36 2 34 -2", "none", { stroke: C.blanc, "stroke-width": 1.6 }) +
      trait("M-20 14 L-24 26 M-8 15 L-8 27 M12 15 L14 27 M22 14 L26 25", C.noir, 3) + chemin("M-30 2 L-38 -2 L-34 6Z", C.brun), "translate(50 120)"),
  lune: () =>
    disque(50, 50, 30, C.blanc),
  oies: () => {
    const oie = (x, y) => groupe(chemin("M-10 0 Q0 -3 10 0 Q0 2 -10 0Z", C.noir) + chemin("M-2 0 L-10 -12 L4 -1Z", C.noir) +
      chemin("M-2 0 L-8 10 L4 1Z", C.noir) + disque(11, -1, 1.6, C.noir), `translate(${x} ${y})`);
    return oie(30, 26) + oie(50, 40) + oie(72, 30);
  },
  coupe: () =>
    groupe(ovale(0, 0, 22, 6, C.rougeSombre) + chemin("M-22 0 Q-18 14 0 16 Q18 14 22 0Z", C.rouge) + ovale(0, 0, 18, 4, C.or) +
      chemin("M-8 16 L-6 24 L6 24 L8 16Z", C.rouge) + ovale(0, 24, 10, 3, C.rougeSombre) +
      trait("M-5 -1 L5 -1 M0 -4 L0 3 M-4 2 L4 2", C.rougeSombre, 1.2), "translate(56 74)"),
  cerf: () =>
    groupe(chemin("M-22 4 C-22 -10 -6 -14 12 -12 C20 -11 22 -4 20 4 C18 12 4 14 -10 14 C-18 14 -22 10 -22 4Z", C.brunClair) +
      chemin("M14 -8 C16 -20 20 -26 26 -28 C30 -24 28 -16 22 -10Z", C.brunClair) +
      ovale(26, -30, 6, 4, C.brunClair) + disque(28, -31, 1.3, C.noir) +
      trait("M22 -34 L18 -46 L12 -50 M18 -46 L22 -54 M26 -34 L30 -46 L36 -50 M30 -46 L28 -54", C.brun, 1.8) +
      trait("M-16 12 L-18 28 M-8 13 L-8 29 M8 13 L10 29 M16 10 L18 26", C.brun, 2.4) +
      disque(-8, -2, 1.6, C.blanc) + disque(2, 2, 1.6, C.blanc) + disque(-14, 4, 1.4, C.blanc), "translate(48 112)"),
  pluie: () =>
    // L'homme a l'ombrelle, sa grenouille et le ruisseau
    chemin("M3 128 Q30 120 50 130 T97 128 V147 H3Z", C.bleu) +
    chemin("M40 66 Q58 48 80 66 Z", C.rouge) + trait("M60 58 L52 118", C.brun, 1.6) +
    chemin("M48 74 C44 80 42 96 44 116 L62 116 C64 96 62 82 56 74Z", C.blanc, { stroke: C.noir, "stroke-width": 1 }) +
    chemin("M46 96 L62 96 L62 116 L44 116Z", C.bleu) + disque(52, 70, 5, C.papierOmbre) + chemin("M47 68 L57 68 L52 62Z", C.noir) +
    groupe(ovale(0, 0, 6, 4, C.jaune) + disque(-3, -3, 1.6, C.jaune) + disque(3, -3, 1.6, C.jaune) + trait("M-5 2 L-9 6 M5 2 L9 6", C.vert, 1.4), "translate(26 122)"),
  hirondelle: () =>
    groupe(chemin("M-16 0 Q0 -6 16 -2 Q20 0 18 2 Q4 4 -16 0Z", C.noir) + chemin("M-4 -2 L-22 -20 L-8 -2Z", C.noir) +
      chemin("M-4 2 L-18 18 L2 2Z", C.noir) + chemin("M-16 0 L-26 -4 M-16 0 L-26 4", "none", { stroke: C.noir, "stroke-width": 1.4 }) +
      chemin("M8 1 Q12 3 16 1", "none", { stroke: C.rouge, "stroke-width": 1.6 }) + disque(14, -1, 1, C.blanc), "translate(54 120) rotate(-20)"),
  eclair: () =>
    chemin("M3 3 H97 V60 Q50 70 3 60Z", C.noir) +
    chemin("M60 6 L46 30 L56 30 L40 58 L64 26 L54 26 L68 6Z", C.jaune) +
    disque(18, 34, 8, C.rouge) + disque(18, 34, 3, C.noir) + disque(84, 40, 7, C.rouge) + disque(84, 40, 2.6, C.noir) +
    chemin("M3 112 Q50 100 97 112 V147 H3Z", C.vertSombre),
  phenix: () =>
    disque(34, 46, 16, C.rouge) +
    groupe(chemin("M0 0 C10 -20 30 -30 46 -24 C36 -18 30 -10 26 0 C40 -6 54 -4 60 4 C44 4 34 10 26 16 C14 20 4 14 0 0Z", C.vertClair) +
      chemin("M0 0 C-4 -10 0 -20 8 -22 C10 -14 6 -6 0 0Z", C.jaune) + disque(5, -18, 1.6, C.noir) + chemin("M10 -22 L16 -22 L10 -19Z", C.or) +
      chemin("M26 16 C34 30 30 44 20 52 C24 40 20 30 14 22Z", C.rouge) + chemin("M30 14 C44 24 48 38 44 50 C40 38 34 30 26 22Z", C.violet) +
      chemin("M20 18 C22 34 14 46 6 52 C10 38 10 28 12 20Z", C.jaune), "translate(36 62)")
};

// Le fond de chaque carte : ciel rouge, nuit, jaune, ou papier
function fond(carte) {
  if (carte.sujet === "lune") {
    return chemin("M3 3 H97 V100 H3Z", C.rouge);
  }
  if (carte.sujet === "oies") {
    return chemin("M3 3 H97 V100 H3Z", C.jaune);
  }
  if (carte.sujet === "pluie") {
    return chemin("M3 3 H97 V147 H3Z", C.nuit);
  }
  if (carte.sujet === "coucou") {
    return chemin("M3 3 H97 V70 Q50 80 3 70Z", C.nuit);
  }
  if (carte.mois === 11 && carte.variante === 3) {
    // Le kasu jaune du paulownia, celui qui se reconnait de loin
    return chemin("M3 3 H97 V70 H3Z", C.jaune);
  }
  if (carte.type === "kasu" && (carte.mois === 0 || carte.mois === 1 || carte.mois === 7)) {
    return chemin("M3 3 H97 V38 Q50 48 3 38Z", carte.mois === 7 ? C.ciel : C.rouge);
  }
  return "";
}

// Ruban : bande tombante, poeme trace au pinceau sur les rubans rouges a poeme
function ruban(sorte) {
  const couleur = sorte === "bleu" ? C.bleu : C.rouge;
  const bord = sorte === "bleu" ? C.bleuClair : C.rougeSombre;
  let s = chemin("M38 20 L60 16 L66 104 L44 110Z", couleur, { stroke: bord, "stroke-width": 1.4 });
  s += chemin("M38 20 L60 16 L61 24 L39 28Z", bord);
  if (sorte === "poeme") {
    s += trait("M48 36 q4 2 2 6 q-3 3 1 6 M50 54 q5 -2 4 4 q-2 4 3 5 M52 72 q-3 4 2 6 q4 1 2 6 M53 92 l4 2", C.noir, 1.8);
  }
  return s;
}

function svgCarte(carte) {
  const miroir = carte.type === "kasu" && carte.variante % 2 === 1 && carte.sujet === "kasu";
  let scene = fond(carte);
  if (carte.sujet === "pluie") {
    scene += PLANTES[10]();
  } else if (carte.sujet === "eclair") {
    scene += "";
  } else {
    scene += PLANTES[carte.mois]();
  }
  if (carte.type === "ruban") {
    scene += ruban(carte.sujet);
  } else if (SUJETS[carte.sujet]) {
    scene += SUJETS[carte.sujet]();
  }
  const contenu = miroir ? groupe(scene, "translate(100 0) scale(-1 1)") : scene;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 150">` +
    `<defs><clipPath id="c"><rect x="3" y="3" width="94" height="144" rx="4"/></clipPath></defs>` +
    `<rect width="100" height="150" rx="7" fill="${C.bord}"/>` +
    `<rect x="3" y="3" width="94" height="144" rx="4" fill="${C.papier}"/>` +
    `<g clip-path="url(#c)">${contenu}</g></svg>`;
}

function svgDos() {
  // Le dos : rouge laque, cadre noir, feuille du tanuki au centre
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 150">` +
    `<rect width="100" height="150" rx="7" fill="${C.bord}"/>` +
    `<rect x="3" y="3" width="94" height="144" rx="4" fill="${C.rougeSombre}"/>` +
    `<rect x="9" y="9" width="82" height="132" rx="3" fill="${C.rouge}"/>` +
    `<rect x="13" y="13" width="74" height="124" rx="2" fill="none" stroke="${C.rougeSombre}" stroke-width="1.5"/>` +
    groupe(chemin("M0 -26 C16 -16 18 8 0 24 C-18 8 -16 -16 0 -26Z", C.vert) + trait("M0 -22 L0 30 M0 -6 L-8 -12 M0 2 L9 -5 M0 10 L-7 5", C.vertSombre, 1.6), "translate(50 72)") +
    `</svg>`;
}

const versUrl = svg => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);

// Images (data URL) de chaque carte, calculees une fois
export const IMAGES = CARTES.map(carte => versUrl(svgCarte(carte)));
export const IMAGE_DOS = versUrl(svgDos());
