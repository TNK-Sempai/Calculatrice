// =====================================================================
//  TAIKO - le tambour du festival
//  Les notes defilent vers le cercle de frappe : rouge (don) au centre
//  du tambour, bleu (ka) sur le bord. Grosses notes, roulements, ballon.
//  Toute la musique est synthetisee en direct (WebAudio) et la partition
//  sort de la meme grille que la musique : l'horloge est celle du
//  contexte audio, donc les notes et le son restent cales.
// =====================================================================

import { enregistrerJeu, finDePartie, quitterJeu, majScoreCourant } from "./arcade.js";
import { creerBoucle } from "./noyau/boucle.js";
import { surTouche, jeuAuPremierPlan } from "./noyau/clavier.js";
import { creerStockage } from "./noyau/stockage.js";
import { sonActif, basculerSon } from "./noyau/son.js";
import { catalogue, creerMorceau, DIFFICULTES } from "./taiko/morceaux.js";

const ID = "taiko";
const W = 520;
const H = 720;

// Fenetres de jugement (secondes, de part et d'autre de la note)
const FENETRE = { excellent: 0.042, bien: 0.095, rate: 0.135 };
const AVANCE_AUDIO = 0.45;       // on programme le son un peu en avance
const DECOMPTE = 1.6;            // silence avant la premiere mesure

const LANE = { y: 84, h: 104, cible: 92 };
const PX_PAR_TEMPS = 136;        // ecart entre deux noires sur la piste
const TAMBOUR = { x: 330, y: 560, r: 118 };

const C = {
  encre: "#0b0b10",
  nuit: "#171433",
  nuit2: "#2a1a3e",
  creme: "#ede8df",
  rouge: "#e0412f",
  rougeSombre: "#8e1d14",
  bleu: "#3fa7d6",
  bleuSombre: "#18577a",
  or: "#f2c14e",
  orSombre: "#8a6410",
  lime: "#c6f35a",
  bois: "#6e4524",
  boisClair: "#9b6a3c",
  peau: "#f3e3c3",
  peauOmbre: "#d8c29a"
};

// ---------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------

const zone = document.createElement("section");
zone.className = "jeu jeu-taiko";
zone.id = "jeuTaiko";
zone.hidden = true;
zone.innerHTML = `
  <div class="jeu-entete entete-taiko">
    <span class="entete-boutons">
      <button class="jeu-quitter" id="morceauxTaiko" type="button">Morceaux</button>
      <button class="jeu-quitter" id="sonTaiko" type="button">Son</button>
      <button class="jeu-quitter" id="quitterTaiko" type="button">Retour</button>
    </span>
  </div>
  <canvas id="canvasTaiko"></canvas>
  <p class="jeu-aide">Rouge (don) : F ou J, ou le centre du tambour. Bleu (ka) : D ou K, ou le bord du tambour. Les grosses notes valent double, frappe vite les roulements, crève le ballon avant qu'il passe. Remplis la jauge d'âme au-delà du trait pour réussir le morceau. Flèches et Espace dans le menu, M son, Échap quitter.</p>`;
document.body.appendChild(zone);

const canvas = zone.querySelector("#canvasTaiko");
const ctx = canvas.getContext("2d");
const boutonMorceaux = zone.querySelector("#morceauxTaiko");
const boutonSon = zone.querySelector("#sonTaiko");
const boutonQuitter = zone.querySelector("#quitterTaiko");

const stockage = creerStockage("tanuki-arcade-taiko");
let memoire = Object.assign({ calage: 0, records: {}, difficulte: 1, choix: 0 }, stockage.lire() || {});

function sauver() {
  stockage.ecrire(memoire);
}

// ---------------------------------------------------------------------
// Audio : un contexte a nous, branche sur le reglage Son de l'arcade
// ---------------------------------------------------------------------

let audio = null;
let general = null;
let bruit = null;

function preparerAudio() {
  if (audio !== null) {
    if (audio.state === "suspended") {
      audio.resume().catch(() => {});
    }
    return audio;
  }
  const Classe = window.AudioContext || window.webkitAudioContext;
  if (!Classe) {
    return null;
  }
  try {
    audio = new Classe({ latencyHint: "interactive" });
  } catch (erreur) {
    return null;
  }
  general = audio.createGain();
  general.gain.value = sonActif() ? 0.3 : 0;
  general.connect(audio.destination);
  const taille = audio.sampleRate;
  bruit = audio.createBuffer(1, taille, audio.sampleRate);
  const d = bruit.getChannelData(0);
  for (let i = 0; i < taille; i++) {
    d[i] = Math.random() * 2 - 1;
  }
  return audio;
}

function appliquerVolume() {
  if (general) {
    general.gain.setTargetAtTime(sonActif() ? 0.3 : 0, audio.currentTime, 0.02);
  }
}

function freq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function enveloppe(noeud, t, volume, attaque, duree) {
  noeud.gain.setValueAtTime(0.0001, t);
  noeud.gain.exponentialRampToValueAtTime(volume, t + attaque);
  noeud.gain.exponentialRampToValueAtTime(0.0001, t + duree);
}

function osc(type, f1, f2, t, duree, volume, destination) {
  const o = audio.createOscillator();
  const g = audio.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f1, t);
  if (f2 !== f1) {
    o.frequency.exponentialRampToValueAtTime(f2, t + duree);
  }
  enveloppe(g, t, volume, 0.004, duree);
  o.connect(g);
  g.connect(destination || general);
  o.start(t);
  o.stop(t + duree + 0.02);
}

function souffle(t, duree, volume, frequence, typeFiltre) {
  const s = audio.createBufferSource();
  s.buffer = bruit;
  const f = audio.createBiquadFilter();
  f.type = typeFiltre || "bandpass";
  f.frequency.value = frequence;
  const g = audio.createGain();
  enveloppe(g, t, volume, 0.002, duree);
  s.connect(f);
  f.connect(g);
  g.connect(general);
  s.start(t, Math.random() * 0.5);
  s.stop(t + duree + 0.02);
}

// Les instruments de l'orchestre du festival
const INSTRUMENTS = {
  grave: t => {
    osc("sine", 110, 48, t, 0.32, 0.9);
    souffle(t, 0.05, 0.25, 300, "lowpass");
  },
  claire: t => {
    souffle(t, 0.07, 0.35, 2600);
    osc("triangle", 520, 380, t, 0.05, 0.25);
  },
  shaker: (t, e) => souffle(t, 0.035, e.fort ? 0.12 : 0.06, 7000, "highpass"),
  basse: (t, e, dureePas) => osc("triangle", freq(e.midi), freq(e.midi), t, dureePas * 3, 0.35),
  melodie: (t, e, dureePas) => {
    // Une flute de bambou : sinus doux avec un leger souffle
    osc("sine", freq(e.midi), freq(e.midi), t, dureePas * (e.longueur || 2) * 0.95, 0.22);
    osc("triangle", freq(e.midi) * 2, freq(e.midi) * 2, t, dureePas * 1.2, 0.04);
    souffle(t, 0.06, 0.04, freq(e.midi) * 2, "bandpass");
  },
  baguette: t => {
    osc("square", 1500, 1500, t, 0.03, 0.18);
    souffle(t, 0.03, 0.2, 5000);
  }
};

// Le son du joueur, tout de suite, qu'il touche une note ou non
function sonFrappe(type) {
  if (!audio || !sonActif()) {
    return;
  }
  const t = audio.currentTime + 0.001;
  if (type === "don") {
    osc("sine", 150, 62, t, 0.22, 0.85);
    souffle(t, 0.04, 0.3, 400, "lowpass");
  } else {
    osc("triangle", 1100, 900, t, 0.05, 0.3);
    souffle(t, 0.05, 0.3, 3800);
  }
}

// ---------------------------------------------------------------------
// Horloge : celle de l'audio quand il tourne, sinon une horloge de secours
// ---------------------------------------------------------------------

let horlogeAudio = false;
let origineSecours = 0;

function maintenant() {
  if (horlogeAudio) {
    return audio.currentTime;
  }
  return performance.now() / 1000 - origineSecours;
}

function latenceSortie() {
  if (!horlogeAudio) {
    return 0;
  }
  return (audio.outputLatency || 0) + (audio.baseLatency || 0);
}

// ---------------------------------------------------------------------
// Etat
// ---------------------------------------------------------------------

const LISTE = catalogue();
let ecran = "menu";              // menu | jeu | resultat | calage
let partie = null;
let echelle = 1;
let fond = null;
let temps = 0;
let menuZones = [];
let pressions = [];              // frappes visibles sur le tambour
let calage = null;

function nouvellePartie(index, difficulte, sansFin) {
  preparerAudio();
  horlogeAudio = audio !== null && audio.state === "running";
  if (!horlogeAudio) {
    origineSecours = performance.now() / 1000;
  }
  const info = sansFin ? { nom: "Sans fin", bpm: 120, graine: 424242, index: -1 } : LISTE[index];
  const morceau = creerMorceau(info, difficulte, sansFin);
  if (!sansFin) {
    morceau.tout();
  } else {
    morceau.jusqua(30);
  }
  const notes = morceau.mesures.flatMap(m => m.notes);
  const simples = notes.filter(n => n.type !== "roulement" && n.type !== "ballon").length;
  partie = {
    morceau,
    sansFin,
    index,
    difficulte,
    debut: maintenant() + DECOMPTE,
    mesureProgrammee: 0,
    mesuresLues: morceau.mesures.length,
    notes,
    prochaine: 0,                 // premiere note pas encore jugee
    score: 0,
    combo: 0,
    comboMax: 0,
    compte: { excellent: 0, bien: 0, rate: 0, roulement: 0 },
    ame: sansFin ? 50 : 0,
    gainAme: sansFin ? 2 : 100 / Math.max(10, simples * 0.72),
    jugement: null,
    finie: false,
    echec: false,
    total: simples
  };
  ecran = "jeu";
  majScoreCourant(ID, 0);
}

function tempsMorceau() {
  if (!partie) {
    return 0;
  }
  return maintenant() - partie.debut - latenceSortie() - memoire.calage / 1000;
}

// Programme le son des mesures qui vont commencer
function programmerAudio() {
  if (!partie || !horlogeAudio) {
    return;
  }
  const morceau = partie.morceau;
  const t = maintenant() - partie.debut;
  if (partie.sansFin) {
    morceau.jusqua(t + 8);
    while (partie.mesuresLues < morceau.mesures.length) {
      morceau.mesures[partie.mesuresLues++].notes.forEach(n => partie.notes.push(n));
    }
  }
  while (partie.mesureProgrammee < morceau.mesures.length) {
    const m = morceau.mesures[partie.mesureProgrammee];
    if (m.debut > t + AVANCE_AUDIO + m.dureePas * 16) {
      break;
    }
    m.evenements.forEach(e => {
      const quand = partie.debut + m.debut + e.pas * m.dureePas;
      if (quand >= audio.currentTime - 0.01) {
        INSTRUMENTS[e.son](Math.max(quand, audio.currentTime), e, m.dureePas);
      }
    });
    partie.mesureProgrammee++;
  }
}

// ---------------------------------------------------------------------
// Jugement
// ---------------------------------------------------------------------

function annoncer(texte, couleur) {
  partie.jugement = { texte, couleur, age: 0 };
}

function gagner(points) {
  const bonus = 1 + Math.min(partie.combo, 100) / 100;
  partie.score += Math.round(points * bonus);
  majScoreCourant(ID, partie.score);
}

function changerAme(delta) {
  partie.ame = Math.max(0, Math.min(100, partie.ame + delta));
  if (partie.sansFin && partie.ame <= 0 && !partie.finie) {
    partie.echec = true;
    terminer();
  }
}

function frapper(type) {
  sonFrappe(type);
  pressions.push({ type, age: 0 });
  if (ecran === "calage") {
    noterCalage();
    return;
  }
  if (ecran !== "jeu" || !partie || partie.finie) {
    return;
  }
  const t = tempsMorceau();
  // Roulement ou ballon en cours : chaque frappe compte
  const longue = partie.notes.find(n => (n.type === "roulement" || n.type === "ballon") && t >= n.t - 0.02 && t <= n.fin && !n.creve);
  if (longue) {
    if (longue.type === "roulement") {
      partie.compte.roulement++;
      gagner(100);
      longue.frappes = (longue.frappes || 0) + 1;
    } else {
      longue.frappes = (longue.frappes || 0) + 1;
      gagner(100);
      if (longue.frappes >= longue.coups) {
        longue.creve = true;
        gagner(3000);
        annoncer("Ballon !", C.or);
      }
    }
    return;
  }
  // Note la plus proche du bon type, encore a juger
  let meilleure = null;
  for (let i = partie.prochaine; i < partie.notes.length; i++) {
    const n = partie.notes[i];
    if (n.t > t + FENETRE.rate) {
      break;
    }
    if (n.juge || n.type === "roulement" || n.type === "ballon") {
      continue;
    }
    if (n.type.toLowerCase() !== type) {
      continue;
    }
    if (Math.abs(n.t - t) <= FENETRE.rate && (!meilleure || Math.abs(n.t - t) < Math.abs(meilleure.t - t))) {
      meilleure = n;
    }
  }
  if (!meilleure) {
    return;
  }
  const ecart = Math.abs(meilleure.t - t);
  const grosse = meilleure.type === "DON" || meilleure.type === "KA";
  meilleure.juge = true;
  meilleure.ecart = meilleure.t - t;
  if (ecart <= FENETRE.excellent) {
    partie.compte.excellent++;
    partie.combo++;
    gagner(grosse ? 600 : 300);
    changerAme(partie.gainAme);
    annoncer("Excellent", C.or);
    meilleure.resultat = "excellent";
  } else if (ecart <= FENETRE.bien) {
    partie.compte.bien++;
    partie.combo++;
    gagner(grosse ? 300 : 150);
    changerAme(partie.gainAme / 2);
    annoncer("Bien", C.creme);
    meilleure.resultat = "bien";
  } else {
    rater(meilleure);
  }
  partie.comboMax = Math.max(partie.comboMax, partie.combo);
}

function rater(n) {
  n.juge = true;
  n.resultat = "rate";
  partie.compte.rate++;
  partie.combo = 0;
  changerAme(partie.sansFin ? -6 : -partie.gainAme * 1.6);
  annoncer("Raté", "#8a86a8");
}

function terminer() {
  if (partie.finie) {
    return;
  }
  partie.finie = true;
  const reussi = !partie.echec && (partie.sansFin || partie.ame >= 80);
  partie.reussi = reussi;
  const cle = partie.sansFin ? "sansfin" : partie.index + "-" + partie.difficulte;
  partie.record = partie.score > (memoire.records[cle] || 0);
  if (partie.record) {
    memoire.records[cle] = partie.score;
    sauver();
  }
  ecran = "resultat";
  partie.ageResultat = 0;
  setTimeout(() => {
    if (ecran === "resultat" && partie && partie.score > 0 && !zone.hidden) {
      finDePartie(ID, partie.score);
    }
  }, 3600);
}

function majPartie(dt) {
  programmerAudio();
  const t = tempsMorceau();
  // Les notes passees sans etre frappees sont ratees
  while (partie.prochaine < partie.notes.length) {
    const n = partie.notes[partie.prochaine];
    if (n.juge || ((n.type === "roulement" || n.type === "ballon") && t > n.fin)) {
      partie.prochaine++;
      continue;
    }
    if (n.type !== "roulement" && n.type !== "ballon" && t > n.t + FENETRE.rate) {
      rater(n);
      partie.prochaine++;
      continue;
    }
    break;
  }
  if (partie.jugement) {
    partie.jugement.age += dt;
  }
  if (!partie.sansFin && t > partie.morceau.duree() + 0.6 && !partie.finie) {
    terminer();
  }
}

// ---------------------------------------------------------------------
// Calage : on frappe en rythme sur un metronome, l'ecart moyen est garde
// ---------------------------------------------------------------------

function lancerCalage() {
  preparerAudio();
  horlogeAudio = audio !== null && audio.state === "running";
  if (!horlogeAudio) {
    origineSecours = performance.now() / 1000;
  }
  const debut = maintenant() + 1;
  const periode = 0.5;
  if (horlogeAudio) {
    for (let i = 0; i < 16; i++) {
      INSTRUMENTS.baguette(debut + i * periode);
    }
  }
  calage = { debut, periode, ecarts: [], fin: debut + 16 * periode };
  ecran = "calage";
}

function noterCalage() {
  const t = maintenant() - latenceSortie() - calage.debut;
  const rang = Math.round(t / calage.periode);
  if (rang < 2 || rang > 15) {
    return;
  }
  calage.ecarts.push((t - rang * calage.periode) * 1000);
  if (calage.ecarts.length >= 8) {
    const tri = calage.ecarts.slice().sort((a, b) => a - b);
    memoire.calage = Math.round(tri[Math.floor(tri.length / 2)]);
    sauver();
  }
}

// ---------------------------------------------------------------------
// Dessin
// ---------------------------------------------------------------------

function tracerTexte(t, x, y, taille, couleur, align, police) {
  ctx.font = police || "800 " + taille + "px 'Anybody', sans-serif";
  ctx.textAlign = align || "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(3, taille * 0.16);
  ctx.strokeStyle = "#140c1c";
  ctx.strokeText(t, x, y);
  ctx.fillStyle = couleur;
  ctx.fillText(t, x, y);
}

function mono(t, x, y, taille, couleur, align) {
  ctx.font = "600 " + Math.round(taille * 1.25) + "px 'Martian Mono', monospace";
  ctx.textAlign = align || "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = couleur;
  ctx.fillText(t, x, y);
}

function peindreFond() {
  const off = document.createElement("canvas");
  off.width = Math.round(W * echelle);
  off.height = Math.round(H * echelle);
  const c = off.getContext("2d");
  c.setTransform(echelle, 0, 0, echelle, 0, 0);
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#120f2c");
  g.addColorStop(0.55, "#2a1a3e");
  g.addColorStop(1, "#3b1d33");
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  // Lune et yagura (la tour du festival) en silhouette
  c.fillStyle = "#e9dfc6";
  c.beginPath();
  c.arc(440, 336, 26, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#1b1230";
  c.beginPath();
  c.moveTo(60, 470);
  c.lineTo(115, 350);
  c.lineTo(185, 350);
  c.lineTo(240, 470);
  c.closePath();
  c.fill();
  c.fillRect(88, 340, 124, 12);
  c.beginPath();
  c.moveTo(80, 342);
  c.lineTo(150, 308);
  c.lineTo(220, 342);
  c.closePath();
  c.fill();
  // Guirlande de lanternes
  c.strokeStyle = "#0e0a1c";
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(0, 262);
  c.quadraticCurveTo(W / 2, 312, W, 262);
  c.stroke();
  for (let i = 0; i < 11; i++) {
    const x = 24 + i * 47;
    const u = x / W;
    const y = 262 + 50 * 4 * u * (1 - u) * 0.5 + 12;
    c.fillStyle = "#0e0a1c";
    c.fillRect(x - 0.5, y - 14, 1, 6);
    c.fillStyle = i % 3 === 0 ? "#f08a24" : C.rouge;
    c.beginPath();
    c.ellipse(x, y, 8, 11, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#0e0a1c";
    c.fillRect(x - 5, y - 12, 10, 3);
    c.fillRect(x - 5, y + 9, 10, 3);
    c.fillStyle = "rgba(255,255,255,0.25)";
    c.fillRect(x - 4, y - 6, 2, 10);
  }
  // Sol de la place
  c.fillStyle = "#24142e";
  c.fillRect(0, 470, W, H - 470);
  c.fillStyle = "#2e1a38";
  c.fillRect(0, 470, W, 6);
  return off;
}

// La foule : des silhouettes qui hochent la tete sur le temps
function dessinerFoule(battement) {
  const phase = battement % 1;
  const saut = phase < 0.15 ? (0.15 - phase) / 0.15 : 0;
  for (let i = 0; i < 12; i++) {
    const x = 10 + i * 44 + (i % 2) * 10;
    const h = 46 + (i * 37 % 20);
    const y = 470 - h + (i % 3 === 0 ? -saut * 6 : 0);
    ctx.fillStyle = i % 2 ? "#120b20" : "#160d26";
    ctx.beginPath();
    ctx.arc(x + 14, y, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(x, y + 10, 28, h, [10, 10, 0, 0]);
    ctx.fill();
  }
}

function dessinerTanuki(battement) {
  // Le tanuki danse sur le temps : rebond sur chaque noire, bras qui
  // montent quand le joueur vient de frapper
  const phase = battement % 1;
  const rebond = Math.sin(Math.min(1, phase) * Math.PI) * 10;
  const frappeRecente = pressions.some(p => p.age < 0.12);
  const x = 108;
  const y = 600 - rebond;
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(x, 668, 44 - rebond, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  // Queue rayee
  ctx.fillStyle = "#7a5432";
  ctx.beginPath();
  ctx.ellipse(x + 36, y + 30, 16, 24, 0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#3a2716";
  ctx.beginPath();
  ctx.ellipse(x + 44, y + 38, 8, 6, 0.7, 0, Math.PI * 2);
  ctx.fill();
  // Corps et happi (veste du festival)
  ctx.fillStyle = "#8a6440";
  ctx.beginPath();
  ctx.ellipse(x, y + 20, 34, 42, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.bleuSombre;
  ctx.beginPath();
  ctx.roundRect(x - 30, y - 4, 60, 44, 10);
  ctx.fill();
  ctx.fillStyle = C.creme;
  ctx.fillRect(x - 3, y - 4, 6, 44);
  ctx.fillStyle = "#e9dfc6";
  ctx.beginPath();
  ctx.ellipse(x, y + 44, 22, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  // Bras et baguettes
  const brasHaut = frappeRecente ? -1 : 1;
  [-1, 1].forEach(cote => {
    ctx.save();
    ctx.translate(x + cote * 30, y + 6);
    ctx.rotate(cote * (brasHaut > 0 ? 0.5 : -0.9) + (cote < 0 ? Math.PI : 0) * 0);
    ctx.fillStyle = "#8a6440";
    ctx.beginPath();
    ctx.roundRect(cote > 0 ? 0 : -24, -6, 24, 12, 6);
    ctx.fill();
    ctx.fillStyle = "#d9b77a";
    ctx.fillRect(cote > 0 ? 20 : -40, -2, 22, 4);
    ctx.restore();
  });
  // Tete
  ctx.fillStyle = "#8a6440";
  ctx.beginPath();
  ctx.arc(x, y - 32, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - 26, y - 46);
  ctx.lineTo(x - 18, y - 68);
  ctx.lineTo(x - 6, y - 56);
  ctx.moveTo(x + 26, y - 46);
  ctx.lineTo(x + 18, y - 68);
  ctx.lineTo(x + 6, y - 56);
  ctx.fill();
  ctx.fillStyle = "#3a2716";
  ctx.beginPath();
  ctx.ellipse(x - 12, y - 32, 11, 8, -0.2, 0, Math.PI * 2);
  ctx.ellipse(x + 12, y - 32, 11, 8, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.creme;
  ctx.beginPath();
  ctx.ellipse(x, y - 20, 12, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(x - 11, y - 34, 3, 0, Math.PI * 2);
  ctx.arc(x + 13, y - 34, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#140c1c";
  ctx.beginPath();
  ctx.arc(x, y - 24, 4, 0, Math.PI * 2);
  ctx.fill();
  // Hachimaki (bandeau)
  ctx.fillStyle = C.rouge;
  ctx.fillRect(x - 30, y - 52, 60, 7);
  ctx.beginPath();
  ctx.moveTo(x + 28, y - 50);
  ctx.lineTo(x + 46, y - 60 + rebond * 0.4);
  ctx.lineTo(x + 44, y - 46);
  ctx.closePath();
  ctx.fill();
}

function dessinerTambour() {
  const { x, y, r } = TAMBOUR;
  const enfonceDon = pressions.some(p => p.type === "don" && p.age < 0.1);
  const enfonceKa = pressions.some(p => p.type === "ka" && p.age < 0.1);
  const ry = r * 0.42;
  // Socle
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.95, r * 1.05, ry * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#3a2316";
  ctx.fillRect(x - r * 0.9, y + r * 0.55, 16, r * 0.42);
  ctx.fillRect(x + r * 0.9 - 16, y + r * 0.55, 16, r * 0.42);
  // Fut en bois, avec un degrade de volume
  const g = ctx.createLinearGradient(x - r, 0, x + r, 0);
  g.addColorStop(0, "#4a2c16");
  g.addColorStop(0.35, C.boisClair);
  g.addColorStop(0.6, C.bois);
  g.addColorStop(1, "#3a2210");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, r, ry, 0, Math.PI, 0, true);
  ctx.lineTo(x + r * 0.96, y + r * 0.62);
  ctx.ellipse(x, y + r * 0.62, r * 0.96, ry * 0.95, 0, 0, Math.PI);
  ctx.closePath();
  ctx.fill();
  // Cerclages et clous
  ctx.fillStyle = "#1c120a";
  for (let i = 0; i < 18; i++) {
    const a = Math.PI * (i / 17);
    ctx.beginPath();
    ctx.arc(x - Math.cos(a) * r * 0.98, y + Math.sin(a) * ry * 0.98 + 6, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = C.rouge;
  ctx.fillRect(x - r * 0.97, y + r * 0.26, r * 1.94, 10);
  // Bord (zone ka)
  ctx.fillStyle = enfonceKa ? C.bleu : "#2b2136";
  ctx.beginPath();
  ctx.ellipse(x, y + (enfonceKa ? 2 : 0), r, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  // Peau (zone don)
  ctx.fillStyle = enfonceDon ? "#fff3dc" : C.peau;
  ctx.beginPath();
  ctx.ellipse(x, y + (enfonceDon ? 3 : 0), r * 0.78, ry * 0.78, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.peauOmbre;
  ctx.beginPath();
  ctx.ellipse(x, y + 6 + (enfonceDon ? 3 : 0), r * 0.78, ry * 0.5, 0, 0, Math.PI);
  ctx.fill();
  // Cercle peint au centre de la peau
  ctx.strokeStyle = enfonceDon ? C.rouge : "#c8372d";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.ellipse(x, y + (enfonceDon ? 3 : 0), r * 0.3, ry * 0.3, 0, 0, Math.PI * 2);
  ctx.stroke();
  // Etiquettes des zones, pour le doigt
  mono("DON", x, y + ry * 0.55, 9, enfonceDon ? C.rougeSombre : "#9b7d5a");
  mono("KA", x + r * 0.89, y - 2, 9, enfonceKa ? "#fff" : "#6a6488");
  mono("KA", x - r * 0.89, y - 2, 9, enfonceKa ? "#fff" : "#6a6488");
}

function dessinerNote(n, x, yC) {
  const grosse = n.type === "DON" || n.type === "KA";
  const r = grosse ? 26 : 18;
  const couleur = n.type.toLowerCase() === "don" ? C.rouge : C.bleu;
  const sombre = n.type.toLowerCase() === "don" ? C.rougeSombre : C.bleuSombre;
  ctx.fillStyle = "#140c1c";
  ctx.beginPath();
  ctx.arc(x, yC, r + 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.creme;
  ctx.beginPath();
  ctx.arc(x, yC, r + 2, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createRadialGradient(x - r * 0.35, yC - r * 0.4, r * 0.1, x, yC, r);
  g.addColorStop(0, n.type.toLowerCase() === "don" ? "#ff8a7a" : "#a9e4ff");
  g.addColorStop(0.55, couleur);
  g.addColorStop(1, sombre);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, yC, r - 1, 0, Math.PI * 2);
  ctx.fill();
  // Un trait horizontal pour les ka, un point pour les don : lisible sans la couleur
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  if (n.type.toLowerCase() === "ka") {
    ctx.fillRect(x - r * 0.45, yC - 2, r * 0.9, 4);
  } else {
    ctx.beginPath();
    ctx.arc(x, yC, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
  }
}

function dessinerPiste() {
  const yC = LANE.y + LANE.h / 2;
  // Bande en bois sombre
  ctx.fillStyle = "#1a1220";
  ctx.fillRect(0, LANE.y - 6, W, LANE.h + 12);
  ctx.fillStyle = "#2a1d30";
  ctx.fillRect(0, LANE.y, W, LANE.h);
  ctx.fillStyle = C.or;
  ctx.fillRect(0, LANE.y - 6, W, 2);
  ctx.fillRect(0, LANE.y + LANE.h + 4, W, 2);
  // Cercle de frappe
  ctx.strokeStyle = "#5a4a6a";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(LANE.cible, yC, 30, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "#3a2e48";
  ctx.beginPath();
  ctx.arc(LANE.cible, yC, 20, 0, Math.PI * 2);
  ctx.stroke();
  if (!partie) {
    return;
  }
  const t = tempsMorceau();
  const morceau = partie.morceau;
  const bat = morceau.battement(t);
  // Traits de mesure
  ctx.fillStyle = "#3d2f4c";
  const premiereMesure = Math.max(0, Math.floor(bat / 4));
  for (let m = premiereMesure; m < premiereMesure + 6; m++) {
    const x = LANE.cible + (m * 4 - bat) * PX_PAR_TEMPS;
    if (x > LANE.cible - 30 && x < W) {
      ctx.fillRect(x, LANE.y, 2, LANE.h);
    }
  }
  // Notes, de la plus lointaine a la plus proche
  const visibles = [];
  for (let i = partie.prochaine; i < partie.notes.length; i++) {
    const n = partie.notes[i];
    const x = LANE.cible + (n.temps - bat) * PX_PAR_TEMPS;
    if (x > W + 40) {
      break;
    }
    if (!n.juge || n.type === "roulement" || n.type === "ballon") {
      visibles.push({ n, x });
    }
  }
  visibles.reverse().forEach(({ n, x }) => {
    if (n.type === "roulement") {
      const xFin = LANE.cible + (morceau.battement(n.fin) - bat) * PX_PAR_TEMPS;
      const debut = Math.max(LANE.cible, x);
      if (xFin > LANE.cible - 10) {
        ctx.fillStyle = "#140c1c";
        ctx.beginPath();
        ctx.roundRect(debut - 22, yC - 22, Math.max(44, xFin - debut + 44), 44, 22);
        ctx.fill();
        ctx.fillStyle = C.or;
        ctx.beginPath();
        ctx.roundRect(debut - 18, yC - 18, Math.max(36, xFin - debut + 36), 36, 18);
        ctx.fill();
        ctx.fillStyle = C.orSombre;
        ctx.fillRect(debut, yC + 6, Math.max(0, xFin - debut), 6);
        mono("ROULEMENT", Math.max(debut + 50, Math.min(xFin - 40, debut + 70)), yC - 2, 9, "#3a2a08");
      }
    } else if (n.type === "ballon") {
      if (n.creve || t > n.fin) {
        return;
      }
      const xb = Math.max(LANE.cible, x);
      const reste = n.coups - (n.frappes || 0);
      const taille = 20 + reste * 2;
      ctx.fillStyle = "#140c1c";
      ctx.fillRect(xb - 1, yC + taille - 4, 2, 18);
      ctx.fillStyle = "#f08a24";
      ctx.beginPath();
      ctx.ellipse(xb, yC, taille * 0.85, taille, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#140c1c";
      ctx.fillRect(xb - taille * 0.5, yC - taille, taille, 4);
      tracerTexte(String(reste), xb, yC + 2, 20, C.creme);
    } else {
      dessinerNote(n, x, yC);
    }
  });
  // Jugement au-dessus du cercle
  if (partie.jugement && partie.jugement.age < 0.45) {
    const j = partie.jugement;
    tracerTexte(j.texte.toUpperCase(), LANE.cible + 10, LANE.y + 14 - j.age * 12, 14, j.couleur, "left");
  }
}

function dessinerTete() {
  // Score, combo, jauge d'ame
  ctx.fillStyle = "#100b18";
  ctx.fillRect(0, 0, W, 64);
  mono("SCORE", 18, 18, 8, "#8a86a8", "left");
  tracerTexte(partie ? partie.score.toLocaleString("fr-BE") : "0", 18, 42, 24, C.lime, "left");
  const nom = partie ? (partie.sansFin ? "Sans fin" : partie.morceau.info.nom) : "";
  mono(nom.toUpperCase(), W / 2, 18, 9, C.creme);
  mono(partie ? DIFFICULTES[partie.difficulte].nom + "  " + Math.round(partie.morceau.mesures[Math.min(partie.morceau.mesures.length - 1, Math.max(0, Math.floor(partie.morceau.battement(tempsMorceau()) / 4)))].bpm) + " BPM" : "", W / 2, 34, 8, "#8a86a8");
  if (partie && partie.combo >= 3) {
    mono("COMBO", W - 18, 18, 8, "#8a86a8", "right");
    tracerTexte(String(partie.combo), W - 18, 42, 24, C.or, "right");
  }
  // Jauge d'ame sous la piste
  if (partie) {
    const y = LANE.y + LANE.h + 14;
    const x0 = 16;
    const l = W - 32;
    ctx.fillStyle = "#140c1c";
    ctx.beginPath();
    ctx.roundRect(x0, y, l, 14, 7);
    ctx.fill();
    const seuil = partie.sansFin ? 0 : 0.8;
    ctx.fillStyle = partie.ame >= 80 ? C.or : C.rouge;
    ctx.beginPath();
    ctx.roundRect(x0 + 2, y + 2, Math.max(0, (l - 4) * partie.ame / 100), 10, 5);
    ctx.fill();
    if (seuil) {
      ctx.fillStyle = C.creme;
      ctx.fillRect(x0 + l * seuil, y - 3, 2, 20);
    }
    mono("ÂME", x0, y + 26, 8, "#8a86a8", "left");
    if (seuil) {
      mono("RÉUSSITE", x0 + l * seuil, y + 26, 8, "#8a86a8");
    }
  }
}

// ---------------------------------------------------------------------
// Menu des morceaux
// ---------------------------------------------------------------------

function dessinerMenu() {
  menuZones = [];
  ctx.fillStyle = "rgba(12,8,20,0.78)";
  ctx.fillRect(0, 0, W, H);
  tracerTexte("TAIKO", 24, 46, 40, C.creme, "left");
  ctx.font = "700 26px 'Shippori Mincho B1', serif";
  ctx.textAlign = "right";
  ctx.fillStyle = C.rouge;
  ctx.fillText("太鼓", W - 24, 52);
  mono("Choisis un morceau et une difficulté", 24, 84, 9, "#b8b2d8", "left");
  // Onglets de difficulte
  DIFFICULTES.forEach((d, i) => {
    const w = (W - 48 - 18) / 4;
    const x = 24 + i * (w + 6);
    const actif = i === memoire.difficulte;
    ctx.fillStyle = actif ? C.lime : "#231a30";
    ctx.beginPath();
    ctx.roundRect(x, 102, w, 36, 10);
    ctx.fill();
    mono(d.nom, x + w / 2, 120, 10, actif ? C.encre : C.creme);
    menuZones.push({ x, y: 102, w, h: 36, action: () => {
      memoire.difficulte = i;
      sauver();
    } });
  });
  // Liste des morceaux + sans fin
  const lignes = LISTE.map(m => ({ titre: m.nom, sous: m.bpm + " BPM", cle: m.index + "-" + memoire.difficulte, lancer: () => nouvellePartie(m.index, memoire.difficulte, false) }));
  lignes.push({ titre: "Sans fin", sous: "le tempo monte jusqu'à la chute", cle: "sansfin", lancer: () => nouvellePartie(-1, memoire.difficulte, true) });
  lignes.push({ titre: "Calibrer", sous: "si les notes te semblent en avance ou en retard (" + memoire.calage + " ms)", cle: null, lancer: lancerCalage });
  lignes.forEach((ligne, i) => {
    const y = 152 + i * 62;
    const actif = i === memoire.choix;
    ctx.fillStyle = actif ? "#3a2650" : "#1d1528";
    ctx.beginPath();
    ctx.roundRect(24, y, W - 48, 54, 12);
    ctx.fill();
    if (actif) {
      ctx.strokeStyle = C.lime;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    tracerTexte(ligne.titre, 40, y + 20, 17, C.creme, "left");
    mono(ligne.sous, 40, y + 40, 8, "#b8b2d8", "left");
    if (ligne.cle) {
      const rec = memoire.records[ligne.cle];
      mono(rec ? rec.toLocaleString("fr-BE") : "-", W - 40, y + 20, 10, rec ? C.or : "#6a6488", "right");
      if (i < LISTE.length) {
        const etoiles = DIFFICULTES[memoire.difficulte].etoiles + (LISTE[i].bpm >= 140 ? 1 : 0);
        mono("★".repeat(Math.min(5, etoiles)), W - 40, y + 40, 9, C.or, "right");
      }
    }
    menuZones.push({ x: 24, y, w: W - 48, h: 54, action: () => {
      if (memoire.choix === i) {
        ligne.lancer();
      } else {
        memoire.choix = i;
      }
    } });
  });
  mono("Espace ou A : jouer · flèches : choisir", W / 2, H - 18, 8, "#6a6488");
}

function lignesMenu() {
  return LISTE.length + 2;
}

function lancerChoix() {
  const i = memoire.choix;
  sauver();
  if (i < LISTE.length) {
    nouvellePartie(i, memoire.difficulte, false);
  } else if (i === LISTE.length) {
    nouvellePartie(-1, memoire.difficulte, true);
  } else {
    lancerCalage();
  }
}

function dessinerResultat() {
  const p = partie;
  p.ageResultat += 0;
  ctx.fillStyle = "rgba(12,8,20,0.82)";
  ctx.fillRect(0, 0, W, H);
  const x = 40;
  const w = W - 80;
  ctx.fillStyle = "#fbf1de";
  ctx.beginPath();
  ctx.roundRect(x, 170, w, 380, 22);
  ctx.fill();
  ctx.strokeStyle = C.rouge;
  ctx.lineWidth = 5;
  ctx.stroke();
  tracerTexte(p.reussi ? "RÉUSSI !" : (p.sansFin ? "LA FÊTE EST FINIE" : "RATÉ"), W / 2, 210, 30, p.reussi ? C.or : C.creme);
  tracerTexte(p.score.toLocaleString("fr-BE"), W / 2, 266, 36, C.rouge);
  if (p.record) {
    mono("Nouveau record !", W / 2, 296, 10, C.rouge);
  }
  const total = p.compte.excellent + p.compte.bien + p.compte.rate;
  const lignes = [
    ["Excellent", p.compte.excellent, C.orSombre],
    ["Bien", p.compte.bien, "#3a2030"],
    ["Raté", p.compte.rate, "#7e5a6a"],
    ["Roulements", p.compte.roulement, "#3a2030"],
    ["Combo max", p.comboMax, "#3a2030"]
  ];
  lignes.forEach(([nom, val, coul], i) => {
    const y = 330 + i * 30;
    ctx.font = "700 15px 'Hanken Grotesk', sans-serif";
    ctx.textAlign = "left";
    ctx.fillStyle = coul;
    ctx.fillText(nom, x + 40, y);
    ctx.textAlign = "right";
    ctx.fillText(String(val), x + w - 40, y);
  });
  const precision = total ? Math.round((p.compte.excellent + p.compte.bien * 0.5) / total * 100) : 0;
  mono("Précision " + precision + " %", W / 2, 498, 10, "#7e5a6a");
  mono("Espace : rejouer · Échap : morceaux", W / 2, 528, 9, "#7e5a6a");
}

function dessinerCalage() {
  ctx.fillStyle = "rgba(12,8,20,0.85)";
  ctx.fillRect(0, 0, W, H);
  tracerTexte("CALAGE", W / 2, 180, 32, C.creme);
  mono("Frappe (F, J, A ou le tambour) sur chaque coup de baguette.", W / 2, 230, 9, "#b8b2d8");
  const t = maintenant() - latenceSortie() - calage.debut;
  const rang = Math.floor(t / calage.periode);
  for (let i = 0; i < 16; i++) {
    ctx.fillStyle = i < rang ? C.lime : "#3a2e48";
    ctx.beginPath();
    ctx.arc(W / 2 - 150 + i * 20, 290, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  const fini = maintenant() > calage.fin + 0.3;
  mono(calage.ecarts.length ? "Écart mesuré : " + (calage.ecarts.length >= 8 ? memoire.calage : "...") + " ms" : "", W / 2, 330, 10, C.or);
  if (fini) {
    mono(calage.ecarts.length >= 8 ? "Calage enregistré. Espace pour revenir." : "Pas assez de frappes. Espace pour revenir.", W / 2, 370, 10, C.creme);
  }
}

// ---------------------------------------------------------------------
// Image
// ---------------------------------------------------------------------

function dessiner() {
  ctx.setTransform(echelle, 0, 0, echelle, 0, 0);
  if (fond) {
    ctx.drawImage(fond, 0, 0, W, H);
  }
  const bat = partie && ecran === "jeu" ? Math.max(0, partie.morceau.battement(tempsMorceau())) : temps * 2;
  dessinerFoule(bat);
  dessinerTanuki(bat);
  dessinerTambour();
  if (ecran !== "menu") {
    dessinerPiste();
    dessinerTete();
  }
  if (ecran === "menu") {
    dessinerMenu();
  } else if (ecran === "resultat") {
    dessinerResultat();
  } else if (ecran === "calage") {
    dessinerCalage();
  } else if (partie && tempsMorceau() < 0) {
    tracerTexte(String(Math.ceil(-tempsMorceau() / (60 / partie.morceau.info.bpm))), W / 2, 360, 60, C.creme);
  }
}

const boucle = creerBoucle(function (dt) {
  temps += dt;
  pressions = pressions.filter(p => {
    p.age += dt;
    return p.age < 0.2;
  });
  if (ecran === "jeu" && partie) {
    majPartie(dt);
  }
  dessiner();
}, { plafond: 1 / 20 });

// ---------------------------------------------------------------------
// Taille : net a toute resolution, au-dessus de la manette
// ---------------------------------------------------------------------

function ajuster() {
  const marge = window.innerWidth >= 1100 ? 500 : 0;
  const largeur = Math.min(document.documentElement.clientWidth * 0.96 - marge, 620);
  const entete = zone.querySelector(".entete-taiko").getBoundingClientRect().height || 40;
  const pad = document.querySelector(".manette:not([hidden])");
  const manette = pad ? pad.getBoundingClientRect().height : 0;
  const hauteur = Math.max(280, window.innerHeight - entete - manette - 40);
  const taille = Math.min(largeur / W, hauteur / H);
  canvas.style.width = Math.floor(W * taille) + "px";
  canvas.style.height = Math.floor(H * taille) + "px";
  const nouvelle = Math.min(3, Math.max(1, taille * (window.devicePixelRatio || 1)));
  if (Math.abs(nouvelle - echelle) > 0.02 || fond === null) {
    echelle = nouvelle;
    canvas.width = Math.round(W * echelle);
    canvas.height = Math.round(H * echelle);
    fond = peindreFond();
  }
}

window.addEventListener("resize", function () {
  if (!zone.hidden) {
    ajuster();
  }
});

// ---------------------------------------------------------------------
// Commandes
// ---------------------------------------------------------------------

const DON = new Set(["f", "j", "v", "n"]);
const KA = new Set(["d", "k", "c", "arrowleft", "arrowright", "s", "l"]);

surTouche(ID, function (evenement) {
  const touche = evenement.key.toLowerCase();
  if (touche === "escape") {
    if (ecran === "jeu" || ecran === "resultat" || ecran === "calage") {
      allerMenu();
    } else {
      quitterJeu();
    }
    evenement.preventDefault();
    return;
  }
  if (touche === "m") {
    basculerSon();
    appliquerVolume();
    majBoutonSon();
    evenement.preventDefault();
    return;
  }
  if (ecran === "menu") {
    if (touche === "arrowdown") {
      memoire.choix = (memoire.choix + 1) % lignesMenu();
    } else if (touche === "arrowup") {
      memoire.choix = (memoire.choix + lignesMenu() - 1) % lignesMenu();
    } else if (touche === "arrowright") {
      memoire.difficulte = Math.min(3, memoire.difficulte + 1);
    } else if (touche === "arrowleft") {
      memoire.difficulte = Math.max(0, memoire.difficulte - 1);
    } else if (touche === " " || touche === "enter" || touche === "f" || touche === "j" || touche === "p") {
      lancerChoix();
    } else {
      return;
    }
    evenement.preventDefault();
    return;
  }
  if (ecran === "resultat" || (ecran === "calage" && maintenant() > calage.fin + 0.3)) {
    if (touche === " " || touche === "enter" || touche === "p") {
      if (ecran === "resultat") {
        nouvellePartie(partie.index, partie.difficulte, partie.sansFin);
      } else {
        allerMenu();
      }
      evenement.preventDefault();
    }
    return;
  }
  if (evenement.repeat) {
    evenement.preventDefault();
    return;
  }
  if (DON.has(touche)) {
    frapper("don");
    evenement.preventDefault();
  } else if (KA.has(touche)) {
    frapper("ka");
    evenement.preventDefault();
  } else if (touche === "p" && ecran === "jeu") {
    allerMenu();
    evenement.preventDefault();
  }
});

function pointLogique(evenement) {
  const r = canvas.getBoundingClientRect();
  return [(evenement.clientX - r.left) / r.width * W, (evenement.clientY - r.top) / r.height * H];
}

canvas.addEventListener("pointerdown", function (evenement) {
  if (!jeuAuPremierPlan(ID)) {
    return;
  }
  evenement.preventDefault();
  preparerAudio();
  const [x, y] = pointLogique(evenement);
  if (ecran === "menu") {
    const z = menuZones.find(k => x >= k.x && x <= k.x + k.w && y >= k.y && y <= k.y + k.h);
    if (z) {
      z.action();
      sauver();
    }
    return;
  }
  if (ecran === "resultat") {
    nouvellePartie(partie.index, partie.difficulte, partie.sansFin);
    return;
  }
  if (ecran === "calage" && maintenant() > calage.fin + 0.3) {
    allerMenu();
    return;
  }
  // Sur le tambour : centre = don, bord = ka. Ailleurs : moitie haute ka,
  // moitie basse don, pour pouvoir jouer sans viser
  const dx = (x - TAMBOUR.x) / TAMBOUR.r;
  const dy = (y - TAMBOUR.y) / (TAMBOUR.r * 0.42);
  const d = Math.hypot(dx, dy);
  if (d <= 1.25) {
    frapper(d < 0.8 ? "don" : "ka");
  } else {
    frapper(x < W / 2 ? "ka" : "don");
  }
});
canvas.addEventListener("contextmenu", evenement => evenement.preventDefault());

function allerMenu() {
  if (partie && !partie.finie) {
    partie.finie = true;
  }
  ecran = "menu";
  // Coupe la musique programmee en relancant le volume a zero puis au niveau
  if (general) {
    general.disconnect();
    general = audio.createGain();
    general.gain.value = sonActif() ? 0.3 : 0;
    general.connect(audio.destination);
  }
}

function majBoutonSon() {
  boutonSon.textContent = sonActif() ? "Son" : "Muet";
}

boutonSon.addEventListener("click", function () {
  basculerSon();
  appliquerVolume();
  majBoutonSon();
});
boutonMorceaux.addEventListener("click", allerMenu);
boutonQuitter.addEventListener("click", quitterJeu);

function demarrer() {
  memoire = Object.assign({ calage: 0, records: {}, difficulte: 1, choix: 0 }, stockage.lire() || {});
  preparerAudio();
  appliquerVolume();
  fond = null;
  ajuster();
  requestAnimationFrame(ajuster);
  ecran = "menu";
  partie = null;
  majScoreCourant(ID, 0);
  majBoutonSon();
  boucle.lancer();
}

// Pour les tests automatiques
export const _test = {
  get partie() { return partie; },
  get ecran() { return ecran; },
  tempsMorceau,
  frapper,
  nouvellePartie,
  get horlogeAudio() { return horlogeAudio; },
  get pressions() { return pressions.map(p => p.type); }
};

enregistrerJeu({
  id: ID,
  nom: "Taiko",
  code: "120",
  section: zone,
  demarrer,
  arreter: () => {
    boucle.arreter();
    if (partie) {
      partie.finie = true;
    }
    if (general) {
      general.disconnect();
      general = null;
      if (audio) {
        general = audio.createGain();
        general.gain.value = sonActif() ? 0.3 : 0;
        general.connect(audio.destination);
      }
    }
  },
  formaterScore: score => Number(score).toLocaleString("fr-BE"),
  // A = don, B = ka ; la croix gauche et droite fait aussi ka
  manette: { a: "f", b: "d", start: "p", libelles: { a: "Don", b: "Ka" } }
});
