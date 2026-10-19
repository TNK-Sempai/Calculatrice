// =====================================================================
//  TANUKI GASSEN - terrain destructible
//  Le terrain est un masque de pixels : 1 pour la terre, 0 pour l'air.
//  Une explosion y creuse un vrai cercle, et le rendu est recalcule a
//  partir du masque : l'herbe (ou la neige) repousse sur chaque bord
//  expose, la terre montre ses couches, la roche garde son relief, et
//  les bords de cratere restent roussis.
//
//  Quatre themes et quatre formes de carte, tires a chaque partie :
//  le gameplay ne change pas, le paysage si.
// =====================================================================

export const THEMES = {
  printemps: {
    nom: "Printemps à Awa",
    ciel: ["#7fb6dc", "#cfe3ee", "#f4dccf"],
    astre: { x: 0.8, y: 0.16, r: 22, couleur: "#fff4dc", lune: false },
    loin: "#9bb4c8",
    milieu: "#6f9a6a",
    arbre: "sakura",
    eau: ["#3d8db0", "#21566e", "#9fd2e4"],
    herbe: [124, 176, 58], herbeClair: [170, 210, 92], herbeSombre: [82, 124, 40],
    terre: [[122, 86, 54], [110, 76, 46], [134, 96, 60]], profonde: [76, 54, 36],
    roche: [108, 104, 98], rocheClair: [146, 142, 134], rocheSombre: [70, 66, 62],
    bord: [58, 40, 26], brule: [64, 46, 32]
  },
  automne: {
    nom: "Automne sur Shikoku",
    ciel: ["#4f4a86", "#c7798a", "#f4b062"],
    astre: { x: 0.24, y: 0.3, r: 26, couleur: "#ffd48a", lune: false },
    loin: "#7a5f8a",
    milieu: "#8a5a4a",
    arbre: "erable",
    eau: ["#3a6f86", "#1e3e52", "#e8b48a"],
    herbe: [190, 146, 58], herbeClair: [226, 186, 90], herbeSombre: [146, 104, 40],
    terre: [[128, 72, 46], [114, 62, 40], [142, 82, 52]], profonde: [72, 42, 30],
    roche: [124, 110, 100], rocheClair: [160, 144, 128], rocheSombre: [84, 74, 68],
    bord: [60, 34, 22], brule: [62, 38, 28]
  },
  hiver: {
    nom: "Neige sur le col",
    ciel: ["#9db7cf", "#cddbe7", "#eef2f5"],
    astre: { x: 0.7, y: 0.18, r: 18, couleur: "#ffffff", lune: false },
    loin: "#b4c4d4",
    milieu: "#8ea3b8",
    arbre: "pin",
    eau: ["#4a7090", "#26405a", "#dcecf6"],
    herbe: [232, 240, 246], herbeClair: [255, 255, 255], herbeSombre: [176, 196, 214],
    terre: [[94, 80, 74], [84, 72, 66], [104, 90, 82]], profonde: [56, 50, 50],
    roche: [118, 130, 146], rocheClair: [156, 168, 182], rocheSombre: [80, 88, 102],
    bord: [44, 40, 42], brule: [52, 46, 46]
  },
  volcan: {
    nom: "Les pentes du volcan",
    ciel: ["#1e1428", "#4a2236", "#a2462e"],
    astre: { x: 0.18, y: 0.18, r: 16, couleur: "#f2e6c8", lune: true },
    loin: "#4a2a40",
    milieu: "#3a2432",
    arbre: "mort",
    eau: ["#2e4a5e", "#18283a", "#7aa0b4"],
    herbe: [118, 122, 72], herbeClair: [150, 154, 94], herbeSombre: [80, 82, 52],
    terre: [[106, 70, 58], [94, 62, 52], [118, 80, 66]], profonde: [52, 34, 32],
    roche: [60, 56, 64], rocheClair: [92, 86, 98], rocheSombre: [38, 36, 42],
    bord: [30, 20, 20], brule: [36, 24, 22]
  }
};

export const FORMES = ["collines", "archipel", "falaises", "cuvette"];

export const NOMS_FORMES = {
  collines: "Collines",
  archipel: "Archipel",
  falaises: "Falaises",
  cuvette: "Cuvette"
};

function hasard(graine) {
  // Petit generateur pseudo-aleatoire, pour un terrain reproductible
  let etat = graine >>> 0;
  return function () {
    etat = (etat * 1664525 + 1013904223) >>> 0;
    return etat / 4294967296;
  };
}

// Bruit doux d'une variable, sans motif repetitif visible
function ondule(x, a) {
  return Math.sin(x * 0.013 + a) * 0.6 + Math.sin(x * 0.041 + a * 2.3) * 0.3 + Math.sin(x * 0.11 + a * 0.7) * 0.1;
}

function profil(forme, largeur, hauteur, alea) {
  const sol = new Float32Array(largeur);
  const phases = [alea() * 6, alea() * 6, alea() * 6, alea() * 6];
  for (let x = 0; x < largeur; x++) {
    const u = x / largeur;
    let h;
    if (forme === "archipel") {
      // Quatre iles separees par des bras de mer
      h = hauteur * 0.97;
      [0.14, 0.38, 0.62, 0.86].forEach((c, i) => {
        const centre = c + (phases[i] - 3) * 0.006;
        const largeurIle = 0.11 + (phases[(i + 1) % 4] / 6) * 0.03;
        const d = (u - centre) / largeurIle;
        const bosse = Math.exp(-d * d * 1.6);
        h = Math.min(h, hauteur * (0.98 - bosse * (0.34 + (phases[i] / 6) * 0.1)));
      });
      h += ondule(x, phases[0]) * 10;
    } else if (forme === "falaises") {
      // Des plateaux en escalier, des parois raides entre eux
      const marches = 7;
      const k = u * marches;
      const i = Math.floor(k);
      const f = k - i;
      const niveauDe = n => 0.42 + 0.22 * Math.abs(Math.sin(n * 1.7 + phases[0]));
      const a = niveauDe(i);
      const b = niveauDe(i + 1);
      const lisse = f < 0.82 ? 0 : (f - 0.82) / 0.18;
      h = hauteur * (a + (b - a) * lisse * lisse * (3 - 2 * lisse)) + ondule(x, phases[1]) * 6;
    } else if (forme === "cuvette") {
      // Des bords hauts, un fond large, un piton au milieu
      const d = (u - 0.5) * 2;
      h = hauteur * (0.36 + 0.3 * (1 - d * d)) + ondule(x, phases[2]) * 16;
      const piton = Math.exp(-Math.pow((u - 0.5) / 0.05, 2));
      h -= piton * hauteur * 0.2;
    } else {
      h = hauteur * (0.54 + (phases[3] / 6) * 0.06);
      for (let i = 0; i < 4; i++) {
        const frequence = (0.6 + phases[i] / 6 * 2.6) * (i + 1) * Math.PI * 2 / largeur;
        h += Math.sin(x * frequence + phases[(i + 2) % 4]) * hauteur * (0.12 / (i + 1));
      }
    }
    // Les bords descendent vers l'eau, pour qu'on puisse y tomber
    const bord = Math.min(x, largeur - 1 - x) / (largeur * 0.07);
    if (bord < 1) {
      h += (1 - bord) * hauteur * 0.3;
    }
    sol[x] = Math.max(hauteur * 0.24, Math.min(hauteur * 1.02, h));
  }
  return sol;
}

export function creerTerrain(largeur, hauteur, options) {
  const choix = options || {};
  const graine = choix.graine === undefined ? Math.floor(Math.random() * 1e9) : choix.graine;
  const alea = hasard(graine);
  const nomTheme = choix.theme || Object.keys(THEMES)[Math.floor(alea() * 4)];
  const theme = THEMES[nomTheme];
  const forme = choix.forme || FORMES[Math.floor(alea() * FORMES.length)];

  const masque = new Uint8Array(largeur * hauteur);
  const roche = new Uint8Array(largeur * hauteur);
  const brule = new Uint8Array(largeur * hauteur);
  const sol = profil(forme, largeur, hauteur, alea);

  for (let x = 0; x < largeur; x++) {
    for (let y = Math.floor(sol[x]); y < hauteur; y++) {
      masque[y * largeur + x] = 1;
    }
  }

  // Iles flottantes, des promontoires a contourner par le haut
  const iles = forme === "archipel" ? 0 : forme === "falaises" ? 1 : 2;
  for (let i = 0; i < iles; i++) {
    const cx = largeur * (iles === 1 ? 0.5 : 0.3 + i * 0.4) + (alea() - 0.5) * largeur * 0.1;
    const cy = hauteur * (0.2 + alea() * 0.08);
    const rx = 46 + alea() * 40;
    const ry = 12 + alea() * 8;
    for (let y = Math.floor(cy - ry); y <= cy + ry * 1.8; y++) {
      for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
        if (x < 0 || x >= largeur || y < 0 || y >= hauteur) {
          continue;
        }
        const dx = (x - cx) / rx;
        // Le dessous de l'ile est plus pointu que le dessus
        const dy = y < cy ? (y - cy) / ry : (y - cy) / (ry * 1.8);
        if (dx * dx + dy * dy <= 1 - Math.abs(ondule(x * 3, i)) * 0.15) {
          masque[y * largeur + x] = 1;
        }
      }
    }
  }

  // Blocs de roche irreguliers, qui se creusent pareil
  for (let i = 0; i < 9; i++) {
    const cx = alea() * largeur;
    const cy = sol[Math.max(0, Math.min(largeur - 1, Math.floor(cx)))] + 18 + alea() * 70;
    const r = 9 + alea() * 16;
    const ph = alea() * 6;
    for (let y = Math.floor(cy - r * 1.3); y <= cy + r * 1.3; y++) {
      for (let x = Math.floor(cx - r * 1.3); x <= cx + r * 1.3; x++) {
        if (x < 0 || x >= largeur || y < 0 || y >= hauteur) {
          continue;
        }
        const a = Math.atan2(y - cy, x - cx);
        const rr = r * (1 + Math.sin(a * 3 + ph) * 0.18 + Math.sin(a * 5 + ph * 2) * 0.08);
        if ((x - cx) ** 2 + ((y - cy) * 1.2) ** 2 <= rr * rr) {
          roche[y * largeur + x] = 1;
        }
      }
    }
  }

  // Les couches de terre suivent une ligne ondulee propre a la carte
  const couches = new Float32Array(largeur);
  for (let x = 0; x < largeur; x++) {
    couches[x] = ondule(x * 0.6, graine % 7) * 9;
  }
  // Epaisseur de l'herbe, qui varie d'une colonne a l'autre
  const touffes = new Uint8Array(largeur);
  for (let x = 0; x < largeur; x++) {
    const v = Math.sin(x * 12.9898 + graine) * 43758.5453;
    touffes[x] = 3 + Math.floor((v - Math.floor(v)) * 3);
  }

  const toile = document.createElement("canvas");
  toile.width = largeur;
  toile.height = hauteur;
  const ctx = toile.getContext("2d");
  const image = ctx.createImageData(largeur, hauteur);
  const pixels = new Uint32Array(image.data.buffer);
  const enCouleur = ([r, g, b]) => (255 << 24) | (b << 16) | (g << 8) | r;
  const t = {
    herbe: enCouleur(theme.herbe), herbeClair: enCouleur(theme.herbeClair), herbeSombre: enCouleur(theme.herbeSombre),
    // Chaque couche fonce par paliers doux avec la profondeur
    terre: theme.terre.map(c => [0, 1, 2, 3, 4, 5].map(n => {
      const k = n / 5;
      return enCouleur(c.map((v, j) => Math.round(v + (theme.profonde[j] - v) * k * 0.85)));
    })),
    profonde: enCouleur(theme.profonde),
    roche: enCouleur(theme.roche), rocheClair: enCouleur(theme.rocheClair), rocheSombre: enCouleur(theme.rocheSombre),
    bord: enCouleur(theme.bord), brule: enCouleur(theme.brule)
  };

  const air = i => masque[i] === 0;

  function redessiner() {
    pixels.fill(0);
    for (let x = 0; x < largeur; x++) {
      let depuisAir = 0;
      const epaisseur = touffes[x];
      for (let y = 0; y < hauteur; y++) {
        const i = y * largeur + x;
        if (!masque[i]) {
          depuisAir = 0;
          continue;
        }
        depuisAir++;
        const gauche = x > 0 && air(i - 1);
        const droite = x < largeur - 1 && air(i + 1);
        const dessous = y < hauteur - 1 && air(i + largeur);
        let teinte;
        if (roche[i]) {
          // La roche a son propre relief : arete claire dessus, ombre dessous
          const hautRoche = y > 0 && !roche[i - largeur];
          const bordRoche = (y < hauteur - 1 && !roche[i + largeur]) || (x > 0 && !roche[i - 1]) || (x < largeur - 1 && !roche[i + 1]);
          const brillant = y > 1 && !roche[i - 2 * largeur] && !hautRoche;
          teinte = depuisAir <= 1 || hautRoche ? t.rocheSombre : brillant ? t.rocheClair
            : bordRoche || gauche || droite || dessous ? t.rocheSombre : t.roche;
        } else if (depuisAir <= epaisseur && !brule[i]) {
          teinte = depuisAir === 1 ? t.herbeClair : depuisAir === epaisseur ? t.herbeSombre : t.herbe;
        } else if (brule[i] && depuisAir <= 3) {
          teinte = t.brule;
        } else if (gauche || droite || dessous) {
          teinte = t.bord;
        } else if (y > hauteur - 22) {
          teinte = t.profonde;
        } else {
          const bande = Math.floor((y + couches[x]) / 22);
          const palier = Math.min(5, Math.floor(Math.max(0, depuisAir - 12 + couches[x] * 2) / 24));
          teinte = t.terre[((bande % 3) + 3) % 3][palier];
        }
        pixels[i] = teinte;
      }
    }
    ctx.putImageData(image, 0, 0);
  }

  function plein(x, y) {
    x |= 0;
    y |= 0;
    if (x < 0 || x >= largeur || y < 0) {
      return false;
    }
    if (y >= hauteur) {
      return true;
    }
    return masque[y * largeur + x] === 1;
  }

  // La couleur d'un point, pour que les eclats d'une explosion aient
  // celle de ce qu'elle a souffle
  function couleurEn(x, y) {
    x |= 0;
    y |= 0;
    if (x < 0 || x >= largeur || y < 0 || y >= hauteur) {
      return null;
    }
    const v = pixels[y * largeur + x];
    if (!masque[y * largeur + x]) {
      return null;
    }
    return "rgb(" + (v & 255) + "," + ((v >> 8) & 255) + "," + ((v >> 16) & 255) + ")";
  }

  // Le decor (arbres, lanternes, touffes) n'est pas solide : il vit sur
  // une toile a part, en double resolution, et l'explosion l'efface.
  const deco = document.createElement("canvas");
  deco.width = largeur * 2;
  deco.height = hauteur * 2;
  const dc = deco.getContext("2d");
  dc.scale(2, 2);
  peindreDecor(dc, theme, sol, largeur, hauteur, alea, roche);

  // Creuse un cercle ; ne redessine pas, l'appelant le fait une fois
  function creuser(cx, cy, rayon) {
    const r2 = rayon * rayon;
    const rb = (rayon + 4) * (rayon + 4);
    for (let y = Math.max(0, Math.floor(cy - rayon - 4)); y <= Math.min(hauteur - 1, cy + rayon + 4); y++) {
      for (let x = Math.max(0, Math.floor(cx - rayon - 4)); x <= Math.min(largeur - 1, cx + rayon + 4); x++) {
        const d = (x - cx) ** 2 + (y - cy) ** 2;
        if (d <= r2) {
          masque[y * largeur + x] = 0;
        } else if (d <= rb) {
          brule[y * largeur + x] = 1;
        }
      }
    }
    dc.save();
    dc.globalCompositeOperation = "destination-out";
    dc.beginPath();
    dc.arc(cx, cy, rayon + 3, 0, Math.PI * 2);
    dc.fill();
    dc.restore();
  }

  // Le premier pixel de terre en partant d'une hauteur donnee
  function surface(x, depuis) {
    for (let y = Math.max(0, depuis || 0); y < hauteur; y++) {
      if (plein(x, y)) {
        return y;
      }
    }
    return hauteur;
  }

  redessiner();
  return {
    largeur, hauteur, plein, creuser, surface, redessiner, couleurEn,
    toile, deco, sol, theme, nomTheme, forme
  };
}

// ---------------------------------------------------------------------
// Decor pose sur le sol
// ---------------------------------------------------------------------

function peindreDecor(c, theme, sol, largeur, hauteur, alea, roche) {
  const poser = (x) => {
    const xi = Math.max(0, Math.min(largeur - 1, Math.round(x)));
    return sol[xi];
  };
  const eau = hauteur - 30;
  const objets = [];
  for (let i = 0; i < 26; i++) {
    const x = 40 + alea() * (largeur - 80);
    const y = poser(x);
    if (y > eau - 8 || roche[Math.floor(y + 2) * largeur + Math.round(x)]) {
      continue;
    }
    // Terrain trop pentu : pas d'arbre
    const pente = Math.abs(poser(x - 6) - poser(x + 6));
    const r = alea();
    if (pente < 7 && r < 0.36) {
      objets.push({ type: "arbre", x, y: y + 1, taille: 0.8 + alea() * 0.5 });
    } else if (pente < 5 && r < 0.48) {
      objets.push({ type: "lanterne", x, y: y + 1 });
    } else {
      objets.push({ type: "touffe", x, y: y + 1, taille: 0.8 + alea() * 0.6 });
    }
  }
  objets.sort((a, b) => (a.type === "touffe") - (b.type === "touffe"));
  objets.forEach(o => {
    if (o.type === "arbre") {
      dessinerArbre(c, theme.arbre, o.x, o.y, o.taille, alea);
    } else if (o.type === "lanterne") {
      dessinerLanterne(c, o.x, o.y);
    } else {
      dessinerTouffe(c, theme, o.x, o.y, o.taille);
    }
  });
}

function dessinerArbre(c, sorte, x, y, k, alea) {
  c.save();
  c.translate(x, y);
  c.scale(k, k);
  if (sorte === "pin") {
    c.fillStyle = "#4a3426";
    c.fillRect(-1.5, -8, 3, 8);
    const etages = [[-30, 7], [-22, 10], [-14, 13]];
    etages.forEach(([h, l]) => {
      c.fillStyle = "#2f5a48";
      c.beginPath();
      c.moveTo(0, h - 10);
      c.lineTo(l, h + 6);
      c.lineTo(-l, h + 6);
      c.closePath();
      c.fill();
      c.fillStyle = "#f4f8fb";
      c.beginPath();
      c.moveTo(0, h - 10);
      c.lineTo(l * 0.55, h - 1);
      c.lineTo(0, h - 3);
      c.lineTo(-l * 0.55, h - 1);
      c.closePath();
      c.fill();
    });
  } else if (sorte === "mort") {
    c.strokeStyle = "#1c1218";
    c.lineCap = "round";
    c.lineWidth = 2.4;
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(0, -16);
    c.moveTo(0, -9);
    c.lineTo(-6, -15);
    c.moveTo(0, -13);
    c.lineTo(5, -20);
    c.stroke();
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(-6, -15);
    c.lineTo(-8, -19);
    c.moveTo(5, -20);
    c.lineTo(8, -21);
    c.stroke();
  } else {
    const feuillage = sorte === "sakura" ? ["#f2b8c6", "#e893a8", "#fbd8e0"] : ["#e2702e", "#c4501e", "#f2a03e"];
    c.strokeStyle = "#4a2e22";
    c.lineCap = "round";
    c.lineWidth = 2.6;
    c.beginPath();
    c.moveTo(0, 0);
    c.quadraticCurveTo(1, -8, -1, -14);
    c.moveTo(0, -8);
    c.lineTo(5, -13);
    c.stroke();
    const amas = [[-5, -16, 6], [4, -17, 6.5], [0, -22, 6], [-8, -12, 4.5], [8, -12, 4.5]];
    amas.forEach(([ax, ay, r], i) => {
      c.fillStyle = feuillage[i % 2];
      c.beginPath();
      c.arc(ax, ay, r, 0, Math.PI * 2);
      c.fill();
    });
    c.fillStyle = feuillage[2];
    amas.slice(0, 3).forEach(([ax, ay, r]) => {
      c.beginPath();
      c.arc(ax - r * 0.3, ay - r * 0.35, r * 0.45, 0, Math.PI * 2);
      c.fill();
    });
  }
  c.restore();
}

function dessinerLanterne(c, x, y) {
  // Toro de pierre, comme au bord des sanctuaires
  c.save();
  c.translate(x, y);
  c.fillStyle = "#8a8680";
  c.fillRect(-4, -2, 8, 2);
  c.fillRect(-1.5, -8, 3, 6);
  c.fillRect(-3.5, -10, 7, 2);
  c.fillStyle = "#6e6a64";
  c.fillRect(-3, -15, 6, 5);
  c.fillStyle = "#f0c868";
  c.fillRect(-1.5, -14, 3, 3);
  c.fillStyle = "#8a8680";
  c.beginPath();
  c.moveTo(-6, -15);
  c.lineTo(0, -19);
  c.lineTo(6, -15);
  c.closePath();
  c.fill();
  c.restore();
}

function dessinerTouffe(c, theme, x, y, k) {
  const [r, g, b] = theme.herbeSombre;
  const [r2, g2, b2] = theme.herbe;
  c.save();
  c.translate(x, y);
  c.scale(k, k);
  c.strokeStyle = "rgb(" + r + "," + g + "," + b + ")";
  c.lineWidth = 1;
  c.lineCap = "round";
  [-3, -1, 1, 3].forEach((dx, i) => {
    c.beginPath();
    c.moveTo(dx * 0.6, 0);
    c.quadraticCurveTo(dx, -3, dx * 1.4, -5 - (i % 2) * 2);
    c.stroke();
  });
  c.strokeStyle = "rgb(" + r2 + "," + g2 + "," + b2 + ")";
  c.beginPath();
  c.moveTo(0, 0);
  c.quadraticCurveTo(0.5, -4, 0, -7);
  c.stroke();
  c.restore();
}
