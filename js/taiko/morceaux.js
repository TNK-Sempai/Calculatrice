// =====================================================================
//  TAIKO - morceaux generes
//  Chaque morceau est fabrique a partir d'une graine : tempo, gamme
//  pentatonique, motifs de percussions, basse, melodie, puis la partition
//  du tambour, tiree de la meme grille de doubles-croches que la musique.
//  Les notes tombent donc exactement sur la musique, par construction.
//
//  Une mesure = 16 pas (doubles-croches). Le temps d'un pas depend du
//  tempo de la mesure, ce qui permet au mode sans fin d'accelerer.
// =====================================================================

export const DIFFICULTES = [
  { id: "facile", nom: "Facile", etoiles: 1 },
  { id: "normal", nom: "Normal", etoiles: 2 },
  { id: "difficile", nom: "Difficile", etoiles: 3 },
  { id: "extreme", nom: "Extrême", etoiles: 4 }
];

const PREMIERS = ["Kitsune", "Tanuki", "Hanabi", "Tsuki", "Kaze", "Sakura", "Yama", "Kawa", "Hotaru", "Momiji", "Yuki", "Kumo"];
const SECONDS = ["Bayashi", "Odori", "no Yoru", "Ondo", "no Michi", "Uta", "Matsuri", "no Kaze"];

// Gammes pentatoniques japonaises (demi-tons depuis la tonique)
const GAMMES = [
  { nom: "yo", pas: [0, 2, 5, 7, 9] },
  { nom: "min'yo", pas: [0, 3, 5, 7, 10] },
  { nom: "in", pas: [0, 1, 5, 7, 8] }
];

export function hasard(graine) {
  let a = graine >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Les 6 morceaux de la liste : nom, tempo, couleur, graine
export function catalogue() {
  const liste = [];
  // Melange fixe des mots, pour six noms tous differents
  const tirage = hasard(20260);
  const premiers = PREMIERS.slice().sort(() => tirage() - 0.5);
  const seconds = SECONDS.slice().sort(() => tirage() - 0.5);
  for (let i = 0; i < 6; i++) {
    const alea = hasard(1000 + i * 7919);
    const nom = premiers[i] + " " + seconds[i];
    const bpm = 100 + Math.round((i / 5) * 60 / 5) * 5 + Math.round(alea() * 2) * 5;
    liste.push({ index: i, nom, bpm, graine: 1000 + i * 7919 });
  }
  return liste;
}

// ---------------------------------------------------------------------
// Motifs
// ---------------------------------------------------------------------

function motifSection(alea, gamme) {
  // Grosse caisse (taiko grave) et frappe claire (bord) sur 16 pas
  const grosses = [
    [0, 8], [0, 6, 8], [0, 8, 10], [0, 3, 8, 11], [0, 6, 10]
  ];
  const claires = [
    [4, 12], [4, 12, 14], [4, 10, 12], [2, 4, 12], [4, 7, 12]
  ];
  const grosse = grosses[Math.floor(alea() * grosses.length)];
  const claire = claires[Math.floor(alea() * claires.length)];
  // Melodie : une phrase de deux mesures, en croches, qui se promene dans la gamme
  const melodie = [];
  let degre = Math.floor(alea() * 5);
  for (let p = 0; p < 32; p += 2) {
    if (alea() < 0.78) {
      degre = Math.max(0, Math.min(9, degre + Math.floor(alea() * 5) - 2));
      melodie.push({ pas: p, degre, longueur: alea() < 0.3 ? 4 : 2 });
    }
  }
  // Basse : tonique et quinte sur les temps forts
  const basse = [{ pas: 0, degre: 0 }, { pas: 6, degre: alea() < 0.5 ? 3 : 0 }, { pas: 8, degre: 3 }, { pas: 14, degre: 4 }];
  return { grosse, claire, melodie, basse, gamme };
}

// Pas candidats pour la partition, selon la difficulte
function grilleDifficulte(d, alea, motif) {
  const pas = new Set();
  if (d === 0) {
    [0, 4, 8, 12].forEach(p => {
      if (alea() < 0.62 || p === 0) {
        pas.add(p);
      }
    });
  } else if (d === 1) {
    [0, 2, 4, 6, 8, 10, 12, 14].forEach(p => {
      if (motif.grosse.includes(p) || motif.claire.includes(p) || alea() < 0.32) {
        pas.add(p);
      }
    });
  } else if (d === 2) {
    [0, 2, 4, 6, 8, 10, 12, 14].forEach(p => {
      if (alea() < 0.75 || motif.grosse.includes(p)) {
        pas.add(p);
        if (alea() < 0.22 && p < 14) {
          pas.add(p + 1);
        }
      }
    });
  } else {
    for (let p = 0; p < 16; p++) {
      const fort = p % 2 === 0;
      if ((fort && alea() < 0.85) || (!fort && alea() < 0.45)) {
        pas.add(p);
      }
    }
  }
  return [...pas].sort((a, b) => a - b);
}

// ---------------------------------------------------------------------
// Flux de mesures : un morceau fini, ou sans fin
// ---------------------------------------------------------------------

// Plan d'un morceau : intro, A, B, A, C, A, fin
const PLAN = ["intro", "A", "A", "B", "B", "A", "A", "C", "C", "A", "A", "fin"];

export function creerMorceau(info, difficulte, sansFin) {
  const alea = hasard(info.graine + difficulte * 31);
  const gamme = GAMMES[Math.floor(alea() * GAMMES.length)];
  const tonique = 50 + Math.floor(alea() * 7);      // note MIDI de la tonique
  const sections = { A: motifSection(alea, gamme), B: motifSection(alea, gamme), C: motifSection(alea, gamme) };
  const mesures = [];
  let tempsCourant = 0;
  let bpm = info.bpm;
  let compteur = 0;

  function sectionDe(n) {
    if (!sansFin) {
      return PLAN[Math.floor(n / 2)] || null;
    }
    if (n < 2) {
      return "intro";
    }
    return ["A", "B", "A", "C"][Math.floor((n - 2) / 4) % 4];
  }

  // Fabrique la mesure n et l'ajoute a la liste
  function fabriquer() {
    const n = compteur;
    const nomSection = sectionDe(n);
    if (nomSection === null) {
      return null;
    }
    if (sansFin && n > 2 && (n - 2) % 8 === 0) {
      bpm = Math.min(260, bpm + 6);
    }
    const dureePas = 60 / bpm / 4;
    const motif = nomSection === "intro" || nomSection === "fin" ? sections.A : sections[nomSection];
    const evenements = [];
    const notes = [];
    const premiereDeSection = sansFin ? (n - 2) % 4 === 0 : n % 2 === 0;
    const moitie = n % 2;

    // Musique
    for (let p = 0; p < 16; p++) {
      evenements.push({ pas: p, son: "shaker", fort: p % 4 === 0 });
    }
    motif.grosse.forEach(p => evenements.push({ pas: p, son: "grave" }));
    motif.claire.forEach(p => evenements.push({ pas: p, son: "claire" }));
    if (nomSection !== "intro") {
      motif.basse.forEach(b => evenements.push({ pas: b.pas, son: "basse", midi: tonique - 12 + degreVersDemiTons(gamme, b.degre) }));
      motif.melodie.filter(m => Math.floor(m.pas / 16) === moitie).forEach(m => {
        evenements.push({ pas: m.pas % 16, son: "melodie", midi: tonique + 12 + degreVersDemiTons(gamme, m.degre), longueur: m.longueur });
      });
    }
    if (nomSection === "intro") {
      // Decompte : quatre coups de baguette sur la mesure qui precede la musique
      if (n === 1) {
        [0, 4, 8, 12].forEach(p => evenements.push({ pas: p, son: "baguette" }));
      }
    }

    // Partition du tambour
    if (nomSection !== "intro") {
      const roulement = nomSection === "B" && moitie === 1 && !sansFin;
      const ballon = nomSection === "C" && moitie === 1 && !sansFin && n === PLAN.lastIndexOf("C") * 2 + 1;
      const roulementSansFin = sansFin && n % 16 === 9;
      if (ballon) {
        notes.push({ pas: 0, type: "ballon", duree: 12, coups: 5 + difficulte * 3 });
      } else if (roulement || roulementSansFin) {
        grilleDifficulte(difficulte, alea, motif).filter(p => p < 8).forEach(p => notes.push({ pas: p, type: typeDuPas(p, motif, evenements) }));
        notes.push({ pas: 8, type: "roulement", duree: 6 });
      } else if (nomSection === "fin") {
        notes.push({ pas: 0, type: "DON" });
      } else {
        grilleDifficulte(difficulte, alea, motif).forEach(p => {
          let type = typeDuPas(p, motif, evenements);
          if (premiereDeSection && p === 0) {
            type = type === "don" ? "DON" : "KA";
          } else if (difficulte >= 1 && alea() < 0.04) {
            type = type.toUpperCase();
          }
          notes.push({ pas: p, type });
        });
      }
    }

    const mesure = {
      index: n,
      debut: tempsCourant,
      dureePas,
      bpm,
      section: nomSection,
      evenements,
      notes: notes.map(no => Object.assign(no, {
        t: tempsCourant + no.pas * dureePas,
        fin: no.duree ? tempsCourant + (no.pas + no.duree) * dureePas : null,
        temps: n * 4 + no.pas / 4
      }))
    };
    tempsCourant += dureePas * 16;
    compteur++;
    mesures.push(mesure);
    return mesure;
  }

  return {
    info,
    difficulte,
    sansFin,
    mesures,
    // Garantit que les mesures sont construites jusqu'au temps donne
    jusqua(temps) {
      while (tempsCourant <= temps + 4) {
        if (fabriquer() === null) {
          break;
        }
      }
    },
    duree() {
      return sansFin ? Infinity : tempsCourant;
    },
    // Battement (en temps de noire) a l'instant t, tempo variable compris
    battement(t) {
      if (t <= 0 || mesures.length === 0) {
        return t / (60 / info.bpm);
      }
      for (let i = mesures.length - 1; i >= 0; i--) {
        const m = mesures[i];
        if (t >= m.debut) {
          return m.index * 4 + (t - m.debut) / (m.dureePas * 4);
        }
      }
      return 0;
    },
    tout() {
      if (!sansFin) {
        while (fabriquer() !== null) {
          // construit tout le morceau
        }
      }
    }
  };
}

function degreVersDemiTons(gamme, degre) {
  const octave = Math.floor(degre / 5);
  return gamme.pas[degre % 5] + octave * 12;
}

// Don quand le pas porte un coup grave, ka sur la frappe claire, sinon
// selon la hauteur de la melodie a ce pas
function typeDuPas(p, motif, evenements) {
  if (motif.grosse.includes(p)) {
    return "don";
  }
  if (motif.claire.includes(p)) {
    return "ka";
  }
  const mel = evenements.find(e => e.son === "melodie" && e.pas === p);
  if (mel) {
    return mel.midi % 12 < 6 ? "don" : "ka";
  }
  return p % 4 === 0 ? "don" : "ka";
}
