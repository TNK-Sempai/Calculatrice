// =====================================================================
//  NOYAU - son
//  Des bruitages synthetises a la volee avec WebAudio : aucun fichier
//  audio a telecharger, et donc rien de plus a mettre en cache pour le
//  hors ligne. Le son est coupe ou remis par la touche M dans chaque jeu
//  qui l'utilise, et ce choix est garde pour toute l'arcade.
//
//  Le navigateur n'autorise le son qu'apres une interaction : le
//  contexte audio n'est cree qu'au premier bruitage demande.
// =====================================================================

import { creerStockage } from "./stockage.js";

const stockage = creerStockage("tanuki-arcade-son");
let actif = stockage.lire() !== false;
let contexte = null;
let bruitBlanc = null;
let volumeGeneral = null;

function preparer() {
  if (contexte !== null) {
    if (contexte.state === "suspended") {
      contexte.resume().catch(() => {});
    }
    return contexte;
  }
  const Classe = window.AudioContext || window.webkitAudioContext;
  if (!Classe) {
    return null;
  }
  try {
    contexte = new Classe();
  } catch (erreur) {
    return null;
  }
  volumeGeneral = contexte.createGain();
  volumeGeneral.gain.value = 0.22;
  volumeGeneral.connect(contexte.destination);

  // Une seconde de bruit blanc, reutilisee pour les explosions
  const taille = contexte.sampleRate;
  bruitBlanc = contexte.createBuffer(1, taille, contexte.sampleRate);
  const donnees = bruitBlanc.getChannelData(0);
  for (let i = 0; i < taille; i++) {
    donnees[i] = Math.random() * 2 - 1;
  }
  return contexte;
}

// Une note : forme d'onde, frequence de depart et d'arrivee, duree, volume
function note(forme, depart, arrivee, duree, volume, decalage) {
  const ctx = preparer();
  if (ctx === null) {
    return;
  }
  const debut = ctx.currentTime + (decalage || 0);
  const oscillateur = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillateur.type = forme;
  oscillateur.frequency.setValueAtTime(depart, debut);
  oscillateur.frequency.exponentialRampToValueAtTime(Math.max(20, arrivee), debut + duree);
  gain.gain.setValueAtTime(volume, debut);
  gain.gain.exponentialRampToValueAtTime(0.0001, debut + duree);
  oscillateur.connect(gain);
  gain.connect(volumeGeneral);
  oscillateur.start(debut);
  oscillateur.stop(debut + duree + 0.02);
}

function bruit(duree, volume, filtre, decalage) {
  const ctx = preparer();
  if (ctx === null) {
    return;
  }
  const debut = ctx.currentTime + (decalage || 0);
  const source = ctx.createBufferSource();
  source.buffer = bruitBlanc;
  const passeBas = ctx.createBiquadFilter();
  passeBas.type = "lowpass";
  passeBas.frequency.setValueAtTime(filtre, debut);
  passeBas.frequency.exponentialRampToValueAtTime(60, debut + duree);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, debut);
  gain.gain.exponentialRampToValueAtTime(0.0001, debut + duree);
  source.connect(passeBas);
  passeBas.connect(gain);
  gain.connect(volumeGeneral);
  source.start(debut);
  source.stop(debut + duree + 0.02);
}

// La bibliotheque de bruitages, partagee par tous les jeux
const BRUITAGES = {
  tir: () => note("square", 880, 320, 0.08, 0.35),
  impact: () => { note("square", 520, 120, 0.09, 0.4); bruit(0.08, 0.3, 3000); },
  explosion: () => bruit(0.45, 0.8, 1800),
  grosseExplosion: () => { bruit(0.9, 1, 1200); note("sawtooth", 160, 40, 0.8, 0.5); },
  bonus: () => { note("square", 660, 660, 0.07, 0.3); note("square", 990, 990, 0.1, 0.3, 0.07); },
  pouvoir: () => [523, 659, 784, 1047].forEach((f, i) => note("square", f, f, 0.08, 0.3, i * 0.06)),
  mort: () => { note("sawtooth", 440, 60, 0.7, 0.45); bruit(0.5, 0.5, 900, 0.05); },
  vague: () => [392, 523, 659].forEach((f, i) => note("triangle", f, f, 0.12, 0.5, i * 0.1)),
  boss: () => [196, 185, 175, 165].forEach((f, i) => note("sawtooth", f, f * 0.98, 0.22, 0.4, i * 0.22)),
  grain: () => note("triangle", 1200, 900, 0.04, 0.18),
  croque: () => { note("square", 220, 880, 0.12, 0.35); note("square", 330, 1320, 0.1, 0.25, 0.08); },
  combo: (niveau) => note("square", 440 * Math.pow(1.12, niveau || 1), 440 * Math.pow(1.12, niveau || 1), 0.06, 0.25),
  vie: () => [659, 784, 988, 1319].forEach((f, i) => note("triangle", f, f, 0.12, 0.45, i * 0.08)),
  clic: () => note("square", 600, 600, 0.03, 0.2),
  // Flipper : le claquement de la bobine, le bumper qui cogne, le ressort
  flipper: () => { bruit(0.035, 0.32, 2600); note("square", 150, 70, 0.05, 0.25); },
  bumper: () => { note("square", 330, 160, 0.09, 0.35); note("triangle", 990, 700, 0.07, 0.25); bruit(0.04, 0.25, 3500); },
  sling: () => { bruit(0.05, 0.35, 4200); note("square", 260, 200, 0.04, 0.2); },
  rampe: () => { note("triangle", 300, 1200, 0.38, 0.35); note("square", 600, 2400, 0.3, 0.12, 0.05); },
  ressort: () => { bruit(0.08, 0.4, 1500); note("sawtooth", 120, 420, 0.12, 0.25); },
  cible: () => { note("square", 880, 880, 0.04, 0.25); note("square", 1320, 1320, 0.05, 0.2, 0.04); }
};

export function jouer(nom, parametre) {
  if (!actif || BRUITAGES[nom] === undefined) {
    return;
  }
  try {
    BRUITAGES[nom](parametre);
  } catch (erreur) {
    // un bruitage rate ne doit jamais interrompre le jeu
  }
}

export function sonActif() {
  return actif;
}

// Renvoie le nouvel etat
export function basculerSon() {
  actif = !actif;
  stockage.ecrire(actif);
  if (actif) {
    preparer();
  }
  return actif;
}
