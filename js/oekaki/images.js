// =====================================================================
//  OEKAKI - les images a decouvrir
//  Chaque image est une grille de lettres : "." pour une case vide, une
//  lettre de couleur pour une case pleine. Toutes ont ete verifiees par
//  un solveur ligne par ligne : chacune a une solution unique, trouvable
//  sans jamais deviner.
// =====================================================================

export const COULEURS = {
  r: "#c8372d", w: "#ede8df", n: "#141418", b: "#5a8fa8", g: "#7fa32f",
  y: "#e8c547", o: "#d8783a", m: "#8a6644", d: "#4a3622", p: "#e88aa0",
  s: "#9a9a92", "#": "#7fa32f"
};

export const IMAGES = [
  { id: "onigiri", nom: "Onigiri", lignes: ["..w..", ".www.", "wwwww", "wnnnw", "wnnnw"] },
  { id: "torii-mini", nom: "Petit torii", lignes: ["rrrrr", ".r.r.", "rrrrr", ".r.r.", ".r.r."] },
  { id: "daruma-mini", nom: "Petit daruma", lignes: [".rrr.", "rrwrr", "rwwwr", "rrrrr", ".rrr."] },
  { id: "fuji-mini", nom: "Petit Fuji", lignes: ["..w..", ".www.", ".bbb.", "bbbbb", "bbbbb"] },
  { id: "lanterne-mini", nom: "Lanterne", lignes: [".rrr.", "rryrr", "ryyyr", "rryrr", ".rrr."] },
  { id: "arbre", nom: "Arbre", lignes: [".#...", "#####", "..#..", ".###.", "#.#.#"] },
  { id: "champignon", nom: "Champignon", lignes: [".rrr.", "rwrwr", "rrrrr", ".ww..", ".ww.."] },
  { id: "sake", nom: "Bouteille de sake", lignes: ["..w..", "..w..", ".www.", ".wrw.", ".www."] },
  { id: "coeur", nom: "Cœur", lignes: [".r.r.", "rrrrr", "rrrrr", ".rrr.", "..r.."] },
  { id: "tanuki", nom: "Tanuki", lignes: [".dd....dd.", ".dmd..dmd.", ".dmmmmmmd.", "dmnnmmnnmd", "dnwnmmnwnd", "dnnnwwnnnd", ".dmwwnwwd.", "..dwwwwd..", "...dmmd...", "....dd...."] },
  { id: "maneki", nom: "Maneki-neko", lignes: [".w......w.", ".ww....ww.", ".wwwwwwww.", ".wnwwwwnw.", ".wwwppwww.", "..wwwwww..", ".rryrrrrr.", ".wwwwwwww.", ".ww.ww.ww.", ".wwwwwwww."] },
  { id: "kappa", nom: "Kappa", lignes: ["...bbbb...", "..gbbbbg..", ".gggggggg.", ".gnggggng.", ".gggyyggg.", "..gggggg..", ".mmmggmmm.", "mmmmmmmmmm", ".g.mmmm.g.", ".g..gg..g."] },
  { id: "koi", nom: "Koi", lignes: ["..........", "...oo.....", "..oooo...o", ".ownooo.oo", "ooooowwoo.", "oooowwwoo.", ".ooooooo.o", "..oooo...o", "...oo.....", ".........."] },
  { id: "torii", nom: "Torii", lignes: ["rrrrrrrrrr", ".rrrrrrrr.", "..r....r..", "rrrrrrrrrr", "..r....r..", "..r....r..", "..r....r..", "..r....r..", "..r....r..", ".nnn..nnn."] },
  { id: "fuji", nom: "Mont Fuji", lignes: ["..........", "....ww....", "...wwww...", "..wwbwww..", "..bbbbbb..", ".bbbbbbbb.", ".bbbbbbbb.", "bbbbbbbbbb", "gggggggggg", "gggggggggg"] },
  { id: "daruma", nom: "Daruma", lignes: ["...rrrr...", "..rrrrrr..", ".rrwwwwrr.", ".rwnwwnwr.", ".rwwwwwwr.", ".rrwwwwrr.", "rrrrrrrrrr", "rryrrrryrr", ".rrrrrrrr.", "..rrrrrr.."] },
  { id: "onigiri-grand", nom: "Onigiri garni", lignes: ["....ww....", "...wwww...", "..wwwwww..", "..wwwwww..", ".wwwrrwww.", ".wwwrrwww.", "wwwwwwwwww", "wwnnnnnnww", "wwnnnnnnww", ".wnnnnnnw."] },
  { id: "pagode", nom: "Pagode", lignes: [".......y.......", ".......r.......", "....rrrrrrr....", "..rrrrrrrrrrr..", ".....mwwwm.....", "....rrrrrrr....", "..rrrrrrrrrrr..", ".....mwnwm.....", "....rrrrrrr....", "..rrrrrrrrrrr..", ".....mwnwm.....", ".....mwnwm.....", "...sssssssss...", "..sssssssssss..", "sssssssssssssss"] },
  { id: "tanuki-debout", nom: "Tanuki debout", lignes: ["...d.......d...", "..dmd.....dmd..", "..dmmmmmmmmmd..", ".dmmmmmmmmmmmd.", ".dnnnmmmmmnnnd.", ".dnwnmmmmmnwnd.", ".dnnnmwwwmnnnd.", "..dmwwwnwwwmd..", "...dmwwwwwmd...", "..dmmmmmmmmmd..", ".dmmwwwwwwwmmdm", ".dmmwwwwwwwmmdm", ".dmmmwwwwwmmmd.", "..dmmd...dmmd..", "..ddd.....ddd.."] },
  { id: "koi-grand", nom: "Koi au soleil", lignes: ["...........rrr.", "..........rrrrr", "..........rrrrr", "...........rrr.", "...............", ".....oooo......", "...oooooooo...o", "..ownoooowwo.oo", ".oooooowwwwooo.", "oooooowwwwwooo.", ".ooooooooooo..o", "..ooooooooo...o", "....oooo.......", "bbbbbbbbbbbbbbb", "bbbbbbbbbbbbbbb"] },
  { id: "maneki-grand", nom: "Maneki-neko levant la patte", lignes: ["..w.....w......", "..ww...ww...ww.", "..wwwwwww...ww.", "..wnwwwnw...ww.", "..wwwpwww..www.", "...wwwwwwwwww..", "..rrrryrrrrr...", "..wwwwwwwwww...", ".wwwwwwwwwwww..", ".wwwyyyywwwww..", ".wwwyyyywwwww..", ".wwwwwwwwwwww..", ".ww.wwwwww.ww..", ".wwwwwwwwwwww..", "..wwww..wwww..."] },
];

// =====================================================================
//  Grilles sans fin : un generateur d'images et un solveur ligne par
//  ligne. Une grille n'est gardee que si le solveur la termine sans
//  jamais deviner, ce qui garantit une solution unique.
// =====================================================================

export function indicesDe(cases) {
  const r = [];
  let suite = 0;
  cases.forEach(v => {
    if (v) {
      suite++;
    } else if (suite) {
      r.push(suite);
      suite = 0;
    }
  });
  if (suite) {
    r.push(suite);
  }
  return r;
}

// Une ligne : -1 inconnue, 0 vide, 1 pleine. Rend les cases deduites,
// ou null si la ligne est contradictoire.
function deduireLigne(cases, indices) {
  const n = cases.length;
  const k = indices.length;
  const memo = new Map();
  const peut = (i, j) => {
    const cle = i * 64 + j;
    if (memo.has(cle)) {
      return memo.get(cle);
    }
    let ok = false;
    if (j === k) {
      ok = true;
      for (let x = i; x < n; x++) {
        if (cases[x] === 1) {
          ok = false;
          break;
        }
      }
    } else if (i < n) {
      if (cases[i] !== 1 && peut(i + 1, j)) {
        ok = true;
      }
      if (!ok) {
        const L = indices[j];
        if (i + L <= n) {
          let place = true;
          for (let x = i; x < i + L; x++) {
            if (cases[x] === 0) {
              place = false;
              break;
            }
          }
          if (place && (i + L === n || cases[i + L] !== 1) && peut(Math.min(n, i + L + 1), j + 1)) {
            ok = true;
          }
        }
      }
    }
    memo.set(cle, ok);
    return ok;
  };
  if (!peut(0, 0)) {
    return null;
  }
  const vu0 = new Array(n).fill(false);
  const vu1 = new Array(n).fill(false);
  const visites = new Set();
  const parcourir = (i, j) => {
    const cle = i * 64 + j;
    if (visites.has(cle)) {
      return;
    }
    visites.add(cle);
    if (j === k) {
      for (let x = i; x < n; x++) {
        vu0[x] = true;
      }
      return;
    }
    if (i >= n) {
      return;
    }
    if (cases[i] !== 1 && peut(i + 1, j)) {
      vu0[i] = true;
      parcourir(i + 1, j);
    }
    const L = indices[j];
    if (i + L <= n) {
      let place = true;
      for (let x = i; x < i + L; x++) {
        if (cases[x] === 0) {
          place = false;
          break;
        }
      }
      if (place && (i + L === n || cases[i + L] !== 1) && peut(Math.min(n, i + L + 1), j + 1)) {
        for (let x = i; x < i + L; x++) {
          vu1[x] = true;
        }
        if (i + L < n) {
          vu0[i + L] = true;
        }
        parcourir(Math.min(n, i + L + 1), j + 1);
      }
    }
  };
  parcourir(0, 0);
  return cases.map((v, x) => (v !== -1 ? v : vu1[x] && !vu0[x] ? 1 : vu0[x] && !vu1[x] ? 0 : -1));
}

// Vrai si la grille se resout entierement par deduction ligne a ligne
export function resolubleSansDeviner(solution) {
  const n = solution.length;
  const lignes = solution.map(l => indicesDe(l));
  const colonnes = solution[0].map((_, c) => indicesDe(solution.map(l => l[c])));
  const g = Array.from({ length: n }, () => new Array(n).fill(-1));
  let change = true;
  while (change) {
    change = false;
    for (let r = 0; r < n; r++) {
      const d = deduireLigne(g[r], lignes[r]);
      if (!d) {
        return false;
      }
      d.forEach((v, c) => {
        if (v !== g[r][c]) {
          g[r][c] = v;
          change = true;
        }
      });
    }
    for (let c = 0; c < n; c++) {
      const col = g.map(l => l[c]);
      const d = deduireLigne(col, colonnes[c]);
      if (!d) {
        return false;
      }
      d.forEach((v, r) => {
        if (v !== g[r][c]) {
          g[r][c] = v;
          change = true;
        }
      });
    }
  }
  return g.every(l => l.every(v => v !== -1));
}

function hasard(graine) {
  let a = graine >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Trois familles d'images, choisies selon le numero
const FAMILLES = ["blason", "paysage", "rosace"];

function lisser(g, n, tours) {
  for (let t = 0; t < tours; t++) {
    const copie = g.map(l => l.slice());
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        let voisins = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if ((dr || dc) && copie[r + dr] && copie[r + dr][c + dc]) {
              voisins++;
            }
          }
        }
        g[r][c] = voisins >= 5 ? true : voisins <= 2 ? false : copie[r][c];
      }
    }
  }
}

function imageBrute(famille, n, alea, info) {
  const g = Array.from({ length: n }, () => new Array(n).fill(false));
  if (famille === "blason") {
    // Forme symetrique gauche-droite, lissee pour rester lisible
    const m = Math.ceil(n / 2);
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < m; c++) {
        const centre = 1 - Math.hypot((r - (n - 1) / 2) / n, (c - (n - 1) / 2) / n) * 1.6;
        g[r][c] = alea() < 0.35 + centre * 0.45;
      }
    }
    lisser(g, n, 2);
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < m; c++) {
        g[r][n - 1 - c] = g[r][c];
      }
    }
  } else if (famille === "paysage") {
    // Montagnes : une ligne de crete douce, un soleil a part, le sol
    const soleil = { r: Math.max(1, Math.round(n * 0.18)), c: Math.round(n * (0.15 + alea() * 0.7)), rayon: Math.max(1, Math.round(n / 7)) };
    info.soleil = soleil;
    const hauteurs = [];
    let h = n * (0.4 + alea() * 0.15);
    let pente = (alea() - 0.5) * 0.6;
    for (let c = 0; c < n; c++) {
      pente += (alea() - 0.5) * 0.9;
      pente = Math.max(-1.4, Math.min(1.4, pente));
      h += pente;
      if (h <= n * 0.2 || h >= n * 0.68) {
        pente = -pente * 0.6;
      }
      h = Math.max(n * 0.2, Math.min(n * 0.68, h));
      hauteurs.push(Math.round(h));
    }
    for (let c = 0; c < n; c++) {
      for (let r = 0; r < n; r++) {
        const dansSoleil = Math.hypot(r - soleil.r, c - soleil.c) <= soleil.rayon + 0.2;
        g[r][c] = r >= n - hauteurs[c] || (dansSoleil && r < n - hauteurs[c] - 1);
      }
    }
  } else {
    // Rosace a symetrie d'ordre 4
    const m = Math.ceil(n / 2);
    for (let r = 0; r < m; r++) {
      for (let c = r; c < m; c++) {
        const v = alea() < 0.55;
        [[r, c], [c, r]].forEach(([y, x]) => {
          g[y][x] = v;
          g[y][n - 1 - x] = v;
          g[n - 1 - y][x] = v;
          g[n - 1 - y][n - 1 - x] = v;
        });
      }
    }
  }
  return g;
}

function couleursDe(famille, g, n, info) {
  // Chaque case pleine recoit une lettre de COULEURS, pour la revelation
  return g.map((ligne, r) => ligne.map((v, c) => {
    if (!v) {
      return ".";
    }
    if (famille === "paysage") {
      const sol = info.soleil;
      if (sol && Math.hypot(r - sol.r, c - sol.c) <= sol.rayon + 0.2 && (r === 0 || !g[r - 1][c] || Math.hypot(r - 1 - sol.r, c - sol.c) <= sol.rayon + 0.2)) {
        return "y";
      }
      if (r >= n - Math.max(1, Math.round(n / 8))) {
        return "g";
      }
      const neige = r === 0 || !g[r - 1][c] || (r > 1 && !g[r - 2][c] && n >= 10);
      return neige ? "w" : "b";
    }
    if (famille === "rosace") {
      const d = Math.max(Math.abs(r - (n - 1) / 2), Math.abs(c - (n - 1) / 2));
      return ["r", "y", "o", "p"][Math.floor(d) % 4];
    }
    const d = Math.hypot(r - (n - 1) / 2, c - (n - 1) / 2);
    return d < n * 0.22 ? "y" : d < n * 0.38 ? "r" : "n";
  }).join(""));
}

const NOMS = { blason: "Blason", paysage: "Paysage", rosace: "Rosace" };

// La grille numero "k" de taille n : toujours la meme, toujours unique
export function grilleGeneree(n, k) {
  const famille = n === 5 ? FAMILLES[k % 2 === 0 ? 0 : 2] : FAMILLES[k % 3];
  for (let essai = 0; essai < 400; essai++) {
    const alea = hasard(n * 100003 + k * 7919 + essai * 31);
    const info = {};
    const g = imageBrute(famille, n, alea, info);
    const remplies = g.flat().filter(Boolean).length / (n * n);
    if (remplies < 0.35 || remplies > 0.75) {
      continue;
    }
    // Quelques retouches au hasard si la grille demande de deviner
    const retouches = famille === "paysage" ? 1 : 25;
    for (let retouche = 0; retouche < retouches; retouche++) {
      if (resolubleSansDeviner(g)) {
        return {
          id: "gen-" + n + "-" + k,
          nom: NOMS[famille] + " n°" + k,
          lignes: couleursDe(famille, g, n, info),
          generee: true
        };
      }
      const r = Math.floor(alea() * n);
      const c = Math.floor(alea() * n);
      g[r][c] = !g[r][c];
      if (famille !== "paysage") {
        g[r][n - 1 - c] = g[r][c];
      }
    }
  }
  return null;
}
