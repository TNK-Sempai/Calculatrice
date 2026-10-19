// =====================================================================
//  GO 9x9 - 囲碁
//  Le petit goban de neuf lignes, contre une IA en trois niveaux. Tu as
//  les noirs et tu commences ; Blanc recoit 6,5 points de komi.
//  Decompte chinois : pierres posees + territoire entoure. En fin de
//  partie, les pierres mortes sont estimees par des parties aleatoires,
//  et le territoire de chacun s'affiche sur le plateau.
//  L'IA difficile (recherche Monte-Carlo) tourne dans un Web Worker.
// =====================================================================

import { enregistrerJeu, finDePartie, quitterJeu, majScoreCourant } from "./arcade.js";
import { surTouche } from "./noyau/clavier.js";
import { creerBoutonsChoix, marquerChoixActif } from "./noyau/choix.js";
import { creerStockage } from "./noyau/stockage.js";
import { creerBoucle } from "./noyau/boucle.js";
import { creerVersus, versusDisponible } from "./versus.js";
import { jouer as jouerSon, basculerSon, sonActif } from "./noyau/son.js";
import {
  TAILLE, CASES, VIDE, NOIR, BLANC,
  nouvellePosition, copier, jouer, estLegal, compter, choisirCoup, pierresMortes, creerAleatoire, adversaire
} from "./go/moteur.js";

const ID = "go";
const NIVEAUX = [
  { id: "facile", nom: "Facile" },
  { id: "moyen", nom: "Moyen" },
  { id: "difficile", nom: "Difficile" },
  { id: "deux", nom: "À deux", deux: true },
  { id: "ligne", nom: "En ligne", ligne: true }
];
const CHOIX = NIVEAUX.filter(n => !n.ligne || versusDisponible());

// ---------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------

const zone = document.createElement("section");
zone.className = "jeu jeu-go";
zone.id = "jeuGo";
zone.hidden = true;
zone.innerHTML = `
  <div class="jeu-entete entete-go">
    <span class="jeu-score score-principal">Écart <strong class="valeur-score" id="ecartGo">0</strong></span>
    <span class="jeu-score">Prises <strong id="prisesGo">0 / 0</strong></span>
    <span class="entete-boutons">
      <button class="jeu-quitter" id="tutoGo" type="button">Apprendre</button>
      <button class="jeu-quitter" id="passerGo" type="button">Passer</button>
      <button class="jeu-quitter" id="annulerGo" type="button">Annuler</button>
      <button class="jeu-quitter" id="sonGo" type="button">Son</button>
      <button class="jeu-quitter" id="nouvelleGo" type="button">Rejouer</button>
      <button class="jeu-quitter" id="quitterGo" type="button">Retour</button>
    </span>
  </div>
  <div class="scores-ligne" id="niveauxGo"></div>
  <canvas id="canvasGo"></canvas>
  <p class="jeu-message" id="messageGo"></p>
  <p class="jeu-aide">Clique une intersection pour poser une pierre noire. Flèches pour déplacer le curseur, Espace ou Entrée pour poser, P pour passer, U pour annuler. Deux passes de suite terminent la partie. Décompte chinois, komi 6,5. N rejouer, M son, Échap quitter.</p>`;
document.body.appendChild(zone);

const canvas = document.getElementById("canvasGo");
const contexte = canvas.getContext("2d");
const zoneEcart = document.getElementById("ecartGo");
const zonePrises = document.getElementById("prisesGo");
const zoneMessage = document.getElementById("messageGo");
const zoneNiveaux = document.getElementById("niveauxGo");
const boutonPasser = document.getElementById("passerGo");
const boutonAnnuler = document.getElementById("annulerGo");
const boutonSon = document.getElementById("sonGo");

// Plan logique : le goban en haut, les deux bols (goke) en dessous
const W = 560;
const H = 700;
const PLATEAU = { x: 30, y: 24, cote: 500, epaisseur: 16 };
const MARGE = 44;
const PAS = (PLATEAU.cote - 2 * MARGE) / (TAILLE - 1);
const RAYON = PAS * 0.47;
const HOSHI = [20, 24, 56, 60, 40];
const BOLS = { noir: { x: 130, y: 604 }, blanc: { x: 370, y: 604 } };

// ---------------------------------------------------------------------
// Etat
// ---------------------------------------------------------------------

const stockageNiveau = creerStockage("tanuki-arcade-go-niveau");
let niveau = NIVEAUX.find(n => n.id === stockageNiveau.lireTexte() && !n.ligne) || NIVEAUX[0];
let trait = NOIR;             // couleur qui doit jouer
let maCouleur = NOIR;         // en ligne : la mienne ; contre l'IA : noir
let nomAdversaire = "IA";
let graineFin = null;         // en ligne : meme decompte des deux cotes
let position = nouvellePosition();
let historique = [];        // positions avant chacun de mes coups
let dernierCoup = -1;
let passes = 0;
let aMoi = true;
let terminee = false;
let reflexion = false;
let curseur = 40;
let survol = -1;
let finale = null;          // { mortes, territoire, noir, blanc }
let demandeEnCours = 0;

// ---------------------------------------------------------------------
// Web Worker de l'IA, avec repli sur la page si le navigateur refuse
// ---------------------------------------------------------------------

let ouvrier = null;
try {
  ouvrier = new Worker(new URL("./go/ia.js", import.meta.url), { type: "module" });
  ouvrier.onerror = () => { ouvrier = null; };
} catch (erreur) {
  ouvrier = null;
}

function demanderAuWorker(message) {
  return new Promise(resoudre => {
    const id = ++demandeEnCours;
    if (ouvrier === null) {
      // Repli : calcul sur la page, apres avoir laisse le temps de dessiner
      setTimeout(() => {
        const pos = { plateau: Uint8Array.from(message.plateau), ko: message.ko, captures: message.captures.slice() };
        if (message.type === "coup") {
          const r = choisirCoup(pos, message.couleur, message.niveau, message.graine, message.adversaireAPasse);
          resoudre({ id, coup: r.coup, taux: r.taux });
        } else {
          const r = pierresMortes(pos, creerAleatoire(message.graine));
          resoudre({ id, mortes: r.mortes, possession: Array.from(r.possession) });
        }
      }, 30);
      return;
    }
    const ecoute = evenement => {
      if (evenement.data.id === id) {
        ouvrier.removeEventListener("message", ecoute);
        resoudre(evenement.data);
      }
    };
    ouvrier.addEventListener("message", ecoute);
    ouvrier.postMessage({ ...message, id });
  });
}

function messagePosition(type, extra) {
  return {
    type,
    plateau: Array.from(position.plateau),
    ko: position.ko,
    captures: position.captures.slice(),
    graine: graineFin !== null ? graineFin : Math.floor(Math.random() * 1e9),
    ...extra
  };
}

// ---------------------------------------------------------------------
// Partie
// ---------------------------------------------------------------------

// ---------------------------------------------------------------------
// Tutoriel : des positions preparees, on pose vraiment les pierres
// ---------------------------------------------------------------------

const stockageTuto = creerStockage("tanuki-arcade-tuto-go");
let tuto = null;               // { i, bravo, message, apres }
let boutonsTuto = [];

const ic = (ligne, col) => ligne * TAILLE + col;

const ETAPES_GO = [
  {
    titre: "Poser une pierre",
    texte: "Tu as les noirs et tu commences. Les pierres se posent sur les croisements des lignes, pas dans les cases. Pose ta pierre sur le point montré.",
    noirs: [], blancs: [], cibles: [ic(4, 4)],
    reussi: ev => ev.pose
  },
  {
    titre: "Les libertés",
    texte: "Les croisements vides juste à côté d'une pierre sont ses libertés (points verts). Cette pierre blanche en a quatre. Pose une pierre sur l'une d'elles.",
    noirs: [], blancs: [ic(4, 4)], libertes: true, cibles: [ic(3, 4), ic(5, 4), ic(4, 3), ic(4, 5)],
    reussi: ev => ev.pose
  },
  {
    titre: "Capturer une pierre",
    texte: "Une pierre qui n'a plus aucune liberté est capturée et retirée. Il n'en reste qu'une à la pierre blanche : prends-la.",
    noirs: [ic(3, 4), ic(4, 3), ic(4, 5)], blancs: [ic(4, 4)], libertes: true, cibles: [ic(5, 4)],
    reussi: ev => ev.prises > 0
  },
  {
    titre: "Capturer un groupe",
    texte: "Des pierres reliées par une ligne forment un groupe et partagent leurs libertés. Ce groupe blanc n'a plus qu'une liberté : prends les deux pierres d'un coup.",
    noirs: [ic(3, 3), ic(3, 4), ic(4, 2), ic(4, 5), ic(5, 3)], blancs: [ic(4, 3), ic(4, 4)], libertes: true, cibles: [ic(5, 4)],
    reussi: ev => ev.prises >= 2
  },
  {
    titre: "Coup interdit",
    texte: "On ne peut pas poser une pierre là où elle n'aurait aucune liberté, sauf si elle capture. Essaie quand même au centre, entre les quatre blanches.",
    noirs: [], blancs: [ic(3, 4), ic(4, 3), ic(4, 5), ic(5, 4)], cibles: [ic(4, 4)],
    reussi: ev => ev.refuse
  },
  {
    titre: "Le ko",
    texte: "Prends la pierre blanche au centre. Tu verras pourquoi Blanc ne peut pas la reprendre aussitôt.",
    noirs: [ic(3, 4), ic(4, 3), ic(5, 4)], blancs: [ic(3, 5), ic(4, 4), ic(5, 5), ic(4, 6)], cibles: [ic(4, 5)],
    reussi: ev => ev.prises > 0,
    apres: "Blanc voudrait reprendre aussitôt en jouant à la croix rouge, mais cela répéterait la position : c'est le ko, c'est interdit. Il doit d'abord jouer ailleurs.",
    croix: ic(4, 4)
  },
  {
    titre: "Fin de partie et décompte",
    texte: "Quand plus aucun coup n'est utile, chacun passe : deux passes de suite et la partie s'arrête. Ici, tout est joué. Touche Passer (bouton du haut ou B).",
    noirs: [0, 1, 2, 3, 4, 5, 6, 7, 8].map(l => ic(l, 4)), blancs: [0, 1, 2, 3, 4, 5, 6, 7, 8].map(l => ic(l, 5)),
    reussi: ev => ev.passe,
    apres: "On compte les pierres et les croisements entourés : Noir 45, Blanc 36. Blanc reçoit 6,5 points de komi parce que Noir a commencé : 42,5. Tu gagnes de 2,5 points."
  }
];

function proposerTuto() {
  tuto = { proposition: true, i: -1, bravo: 0, message: "" };
  position = nouvellePosition();
  finale = null;
  afficher("");
}

function lancerTuto() {
  if (niveau.ligne && versus.ouvert) {
    afficher("Le tutoriel attendra la fin de la partie en ligne.");
    return;
  }
  stockageTuto.ecrire({ vu: true });
  tuto = { i: 0, bravo: 0, message: "" };
  preparerEtapeGo();
}

function preparerEtapeGo() {
  const e = ETAPES_GO[tuto.i];
  demandeEnCours++;
  position = nouvellePosition();
  e.noirs.forEach(c => { position.plateau[c] = NOIR; });
  e.blancs.forEach(c => { position.plateau[c] = BLANC; });
  historique = [];
  dernierCoup = -1;
  passes = 0;
  aMoi = true;
  terminee = false;
  reflexion = false;
  finale = null;
  volants = [];
  poses = new Map();
  tuto.bravo = 0;
  tuto.message = "";
  tuto.apres = false;
  curseur = e.cibles && e.cibles.length ? e.cibles[0] : 40;
  afficher("");
  majEntete();
}

function finTuto() {
  tuto = { fin: true, i: -1, bravo: 0, message: "" };
  position = nouvellePosition();
  finale = null;
}

function quitterTuto() {
  tuto = null;
  demarrer();
}

function etapeSuivanteGo() {
  if (tuto.i >= ETAPES_GO.length - 1) {
    finTuto();
    return;
  }
  tuto.i++;
  preparerEtapeGo();
}

// Un geste du joueur pendant le tuto
function evenementTuto(ev) {
  const e = ETAPES_GO[tuto.i];
  if (e.reussi(ev)) {
    jouerSon("vie");
    if (e.apres) {
      tuto.apres = true;
      if (ev.passe) {
        const s = compter(position.plateau, []);
        finale = { mortes: [], territoire: s.territoire, noir: s.noir, blanc: s.blanc };
        majEntete();
      }
    } else {
      tuto.bravo = 1.3;
    }
  }
}

function poserTuto(c) {
  const e = ETAPES_GO[tuto.i];
  if (tuto.bravo > 0 || tuto.apres) {
    return;
  }
  if (!e.cibles) {
    tuto.message = "Ici, plus rien à poser : touche Passer.";
    jouerSon("clic");
    return;
  }
  if (!e.cibles.includes(c)) {
    tuto.message = "Pas ici : pose ta pierre sur un point montré.";
    jouerSon("clic");
    return;
  }
  if (!estLegal(position, c, NOIR)) {
    tuto.message = "Refusé ! Ta pierre n'aurait aucune liberté et ne capture rien : c'est interdit.";
    jouerSon("clic");
    evenementTuto({ refuse: true });
    if (e.reussi({ refuse: true })) {
      tuto.bravo = 0;
      tuto.apres = true;
      tuto.texteApres = "Exactement : le coup est refusé. Une pierre doit toujours garder au moins une liberté, ou capturer en arrivant.";
    }
    return;
  }
  const avant = position.captures[NOIR];
  jouerAnime(c, NOIR);
  dernierCoup = c;
  jouerSon(position.captures[NOIR] > avant ? "croque" : "clic");
  tuto.message = "";
  evenementTuto({ pose: true, prises: position.captures[NOIR] - avant });
  majEntete();
}

// Libertes du groupe blanc, pour les points verts
function libertesBlanches() {
  const res = new Set();
  for (let c = 0; c < CASES; c++) {
    if (position.plateau[c] !== BLANC) {
      continue;
    }
    const l = Math.floor(c / TAILLE);
    const k = c % TAILLE;
    [[l - 1, k], [l + 1, k], [l, k - 1], [l, k + 1]].forEach(([a, b]) => {
      if (a >= 0 && a < TAILLE && b >= 0 && b < TAILLE && position.plateau[a * TAILLE + b] === VIDE) {
        res.add(a * TAILLE + b);
      }
    });
  }
  return res;
}

function lignesTexte(g, texte, largeur) {
  const mots = texte.split(" ");
  const lignes = [];
  let ligne = "";
  mots.forEach(m => {
    const essai = ligne ? ligne + " " + m : m;
    if (g.measureText(essai).width > largeur && ligne) {
      lignes.push(ligne);
      ligne = m;
    } else {
      ligne = essai;
    }
  });
  lignes.push(ligne);
  return lignes;
}

function boutonCanvas(g, texte, x, y, w, h, principal, action) {
  g.fillStyle = principal ? "#c8372d" : "#e8dcc0";
  g.beginPath();
  g.roundRect(x, y, w, h, 10);
  g.fill();
  g.font = "800 14px 'Anybody', sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = principal ? "#ffffff" : "#5a4a3a";
  g.fillText(texte, x + w / 2, y + h / 2 + 1);
  boutonsTuto.push({ zone: [x, y, w, h], action, principal });
}

// La bulle du tuto, a la place des bols
function dessinerBulleGo(g) {
  boutonsTuto = [];
  const x = 16;
  const y = 552;
  const w = W - 32;
  const h = 138;
  g.fillStyle = "#f6efdc";
  g.beginPath();
  g.roundRect(x, y, w, h, 16);
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = "#c8372d";
  g.stroke();
  let titre;
  let texte;
  const choix = [];
  if (tuto.proposition) {
    titre = "Première visite";
    texte = "Le go est peu connu en Europe. Une minute pour apprendre les règles en jouant ?";
    choix.push(["Plus tard", false, () => { stockageTuto.ecrire({ vu: true }); quitterTuto(); }], ["Apprendre", true, lancerTuto]);
  } else if (tuto.fin) {
    titre = "Prêt !";
    texte = "Tu connais les règles. Commence en Facile : l'IA est gentille, et tu peux annuler tes coups.";
    choix.push(["Revoir", false, lancerTuto], ["Jouer", true, quitterTuto]);
  } else {
    const e = ETAPES_GO[tuto.i];
    titre = (tuto.i + 1) + " / " + ETAPES_GO.length + "  " + e.titre;
    texte = tuto.apres ? (tuto.texteApres || e.apres) : tuto.message || e.texte;
    if (tuto.apres) {
      choix.push(["Suivant", true, () => { tuto.texteApres = null; etapeSuivanteGo(); }]);
    }
  }
  g.font = "800 15px 'Anybody', sans-serif";
  g.textAlign = "left";
  g.textBaseline = "middle";
  g.fillStyle = "#c8372d";
  g.fillText(titre.toUpperCase(), x + 16, y + 20);
  g.font = "600 15px 'Hanken Grotesk', sans-serif";
  g.fillStyle = "#2a2030";
  const largeurTexte = w - 32 - (choix.length && !tuto.proposition && !tuto.fin ? 0 : 0);
  lignesTexte(g, texte, largeurTexte).slice(0, choix.length ? 3 : 5).forEach((l, k) => {
    g.textAlign = "left";
    g.fillText(l, x + 16, y + 44 + k * 18);
  });
  if (!tuto.proposition && !tuto.fin) {
    boutonCanvas(g, "Passer le tuto", x + w - 128, y + 8, 114, 24, false, quitterTuto);
  }
  choix.forEach(([t, principal, action], k) => {
    const bw = 130;
    boutonCanvas(g, t, x + w - 16 - (choix.length - k) * (bw + 10) + 10, y + h - 44, bw, 34, principal, action);
  });
  if (tuto.bravo > 0) {
    g.font = "800 46px 'Anybody', sans-serif";
    g.textAlign = "center";
    g.lineWidth = 6;
    g.strokeStyle = "#0a2010";
    g.strokeText("Bravo !", W / 2, PLATEAU.y + PLATEAU.cote / 2);
    g.fillStyle = "#c6f35a";
    g.fillText("Bravo !", W / 2, PLATEAU.y + PLATEAU.cote / 2);
  }
}

// Points verts, cible qui pulse, croix du ko
function dessinerAidesGo(g) {
  if (!tuto || tuto.i < 0) {
    return;
  }
  const e = ETAPES_GO[tuto.i];
  if (e.libertes && !tuto.apres) {
    libertesBlanches().forEach(c => {
      const { x, y } = coordonnees(c);
      g.fillStyle = "#7fbf2a";
      g.beginPath();
      g.arc(x, y, 6, 0, Math.PI * 2);
      g.fill();
    });
  }
  if (e.cibles && tuto.bravo <= 0 && !tuto.apres) {
    const p = Math.sin(temps * 6);
    e.cibles.forEach(c => {
      if (position.plateau[c] !== VIDE) {
        return;
      }
      const { x, y } = coordonnees(c);
      g.strokeStyle = "#c6f35a";
      g.lineWidth = 3.5;
      g.beginPath();
      g.arc(x, y, RAYON * 0.9 + p * 2, 0, Math.PI * 2);
      g.stroke();
    });
    if (e.cibles.length === 1) {
      const { x, y } = coordonnees(e.cibles[0]);
      const fy = y - RAYON - 14 + p * 4;
      g.fillStyle = "#c6f35a";
      g.strokeStyle = "#0a2010";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x, fy + 10);
      g.lineTo(x - 11, fy - 4);
      g.lineTo(x - 4, fy - 4);
      g.lineTo(x - 4, fy - 18);
      g.lineTo(x + 4, fy - 18);
      g.lineTo(x + 4, fy - 4);
      g.lineTo(x + 11, fy - 4);
      g.closePath();
      g.fill();
      g.stroke();
    }
  }
  if (tuto.apres && e.croix !== undefined) {
    const { x, y } = coordonnees(e.croix);
    g.strokeStyle = "#c8372d";
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(x - 10, y - 10);
    g.lineTo(x + 10, y + 10);
    g.moveTo(x + 10, y - 10);
    g.lineTo(x - 10, y + 10);
    g.stroke();
  }
}

function demarrer() {
  if (niveau.ligne && versus.actif) {
    return;
  }
  tuto = null;
  position = nouvellePosition();
  trait = NOIR;
  maCouleur = NOIR;
  graineFin = null;
  nomAdversaire = niveau.deux ? "BLANC" : "IA";
  historique = [];
  dernierCoup = -1;
  passes = 0;
  aMoi = true;
  terminee = false;
  reflexion = false;
  finale = null;
  curseur = 40;
  demandeEnCours++;   // ignore une reponse d'une partie precedente
  marquerChoixActif(zoneNiveaux, niveau.id);
  afficher(niveau.deux ? "À deux : Noir commence, puis chacun son tour." : "À toi. Tu as les noirs.");
  if (niveau.ligne) {
    aMoi = false;
    afficher("Versus en ligne : trouve un adversaire dans le panneau ci-dessus.");
    versus.ouvrir();
  }
  majEntete();
  majBoutonSon();
  volants = [];
  poses = new Map();
  ajuster();
  requestAnimationFrame(ajuster);
  boucle.lancer();
}

function idClassement() {
  return "go-" + niveau.id;
}

function afficher(texte) {
  zoneMessage.textContent = texte;
}

function majEntete() {
  const s = compter(position.plateau, finale ? finale.mortes : null);
  const ecart = s.noir - s.blanc;
  zoneEcart.textContent = (ecart > 0 ? "+" : "") + ecart.toLocaleString("fr-BE");
  zonePrises.textContent = position.captures[NOIR] + " / " + position.captures[BLANC];
  boutonPasser.disabled = !aMoi || terminee || reflexion;
  boutonAnnuler.disabled = historique.length === 0 || reflexion || terminee || !!niveau.ligne;
}

function poserPierre(c) {
  if (tuto) {
    if (tuto.i >= 0) {
      poserTuto(c);
    }
    return;
  }
  if (!aMoi || terminee || reflexion) {
    return;
  }
  const couleur = couleurQuiJoue();
  if (!estLegal(position, c, couleur)) {
    afficher(position.plateau[c] !== VIDE ? "Cette intersection est occupée." : c === position.ko ? "Ko : tu ne peux pas reprendre tout de suite." : "Coup interdit : ta pierre n'aurait aucune liberté.");
    jouerSon("clic");
    return;
  }
  historique.push({ position: copier(position), dernierCoup, passes, trait });
  const avant = position.captures[couleur];
  jouerAnime(c, couleur);
  dernierCoup = c;
  passes = 0;
  jouerSon(position.captures[couleur] > avant ? "croque" : "clic");
  apresMonCoup(c);
}

// La couleur posee par un clic : noir contre l'IA, celle au trait a deux,
// la mienne en ligne
function couleurQuiJoue() {
  return niveau.deux ? trait : niveau.ligne ? maCouleur : NOIR;
}

function nomCouleur(couleur) {
  return couleur === NOIR ? "Noir" : "Blanc";
}

function apresMonCoup(c) {
  trait = adversaire(trait);
  if (niveau.deux) {
    afficher(c < 0 ? nomCouleur(adversaire(trait)) + " passe. " + nomCouleur(trait) + ", à toi (passe aussi pour finir)." : nomCouleur(trait) + ", à toi.");
    majEntete();
    dessiner();
    return;
  }
  if (niveau.ligne) {
    versus.envoyer({ c });
    aMoi = false;
    versus.tour(false);
    afficher(c < 0 ? "Tu passes. Au tour de " + nomAdversaire + "." : "Au tour de " + nomAdversaire + ".");
    majEntete();
    dessiner();
    return;
  }
  tourDeLIA();
}

function passer() {
  if (tuto) {
    if (tuto.i >= 0 && !tuto.apres && tuto.bravo <= 0) {
      passes++;
      evenementTuto({ passe: true });
      if (!ETAPES_GO[tuto.i].reussi({ passe: true })) {
        tuto.message = "Pas encore : il reste un coup à jouer ici.";
      }
    }
    return;
  }
  if (!aMoi || terminee || reflexion) {
    return;
  }
  historique.push({ position: copier(position), dernierCoup, passes, trait });
  jouer(position, -1, couleurQuiJoue());
  dernierCoup = -1;
  passes++;
  if (passes >= 2) {
    if (niveau.ligne) {
      versus.envoyer({ c: -1 });
    }
    trait = adversaire(trait);
    terminer();
    return;
  }
  apresMonCoup(-1);
}

function annuler() {
  if (tuto) {
    return;
  }
  if (historique.length === 0 || reflexion || terminee || niveau.ligne) {
    return;
  }
  const etat = historique.pop();
  position = etat.position;
  dernierCoup = etat.dernierCoup;
  passes = etat.passes;
  trait = etat.trait || NOIR;
  aMoi = true;
  afficher(niveau.deux ? "Coup annulé. " + nomCouleur(trait) + ", à toi." : "Coup annulé. À toi.");
  majEntete();
  dessiner();
}

async function tourDeLIA() {
  aMoi = false;
  reflexion = true;
  afficher(niveau.id === "difficile" ? "L'IA réfléchit..." : "L'IA joue...");
  majEntete();
  dessiner();
  const debut = performance.now();
  const reponse = await demanderAuWorker(messagePosition("coup", {
    couleur: BLANC,
    niveau: niveau.id,
    adversaireAPasse: passes > 0
  }));
  if (reponse.id !== demandeEnCours) {
    return;   // partie abandonnee entre-temps
  }
  // Un petit temps de pose, sinon le coup facile tombe instantanement
  const attente = Math.max(0, 350 - (performance.now() - debut));
  await new Promise(r => setTimeout(r, attente));
  reflexion = false;
  if (reponse.coup < 0 || !estLegal(position, reponse.coup, BLANC)) {
    jouer(position, -1, BLANC);
    dernierCoup = -1;
    passes++;
    if (passes >= 2) {
      terminer();
      return;
    }
    afficher("L'IA passe. Si tu passes aussi, la partie est finie.");
  } else {
    const avant = position.captures[BLANC];
    jouerAnime(reponse.coup, BLANC);
    dernierCoup = reponse.coup;
    passes = 0;
    jouerSon(position.captures[BLANC] > avant ? "impact" : "clic");
    afficher(position.captures[BLANC] > avant ? "L'IA prend des pierres. À toi." : "À toi.");
  }
  aMoi = true;
  trait = NOIR;
  majEntete();
  dessiner();
}

async function terminer() {
  terminee = true;
  reflexion = true;
  afficher("Décompte en cours...");
  majEntete();
  dessiner();
  const reponse = await demanderAuWorker(messagePosition("fin"));
  if (reponse.id !== demandeEnCours) {
    return;
  }
  reflexion = false;
  const s = compter(position.plateau, reponse.mortes);
  finale = { mortes: reponse.mortes, territoire: s.territoire, noir: s.noir, blanc: s.blanc };
  const ecart = s.noir - s.blanc;
  majEntete();
  dessiner();
  const detail = "Noir " + s.noir + ", Blanc " + s.blanc.toLocaleString("fr-BE") + " (komi compris).";
  if (niveau.deux) {
    afficher((ecart > 0 ? "Noir" : "Blanc") + " gagne de " + Math.abs(ecart).toLocaleString("fr-BE") + " points. " + detail);
    jouerSon("vie");
    return;
  }
  if (niveau.ligne) {
    const monEcart = maCouleur === NOIR ? ecart : -ecart;
    afficher((monEcart > 0 ? "Tu gagnes de " : nomAdversaire + " gagne de ") + Math.abs(ecart).toLocaleString("fr-BE") + " points. " + detail);
    jouerSon(monEcart > 0 ? "vie" : "mort");
    versus.terminer(monEcart > 0 ? "victoire" : "defaite", "decompte");
    return;
  }
  if (ecart > 0) {
    afficher("Victoire de " + ecart.toLocaleString("fr-BE") + " points. " + detail);
    jouerSon("vie");
  } else {
    afficher("L'IA gagne de " + (-ecart).toLocaleString("fr-BE") + " points. " + detail);
    jouerSon("mort");
  }
  // Score de classement : l'ecart en dixiemes de point, pour garder le ,5
  const score = ecart > 0 ? Math.round(ecart * 10) : 0;
  majScoreCourant(idClassement(), score);
  setTimeout(() => {
    if (!zone.hidden && terminee) {
      finDePartie(idClassement(), score, "Go " + niveau.nom);
    }
  }, 2600);
}

// ---------------------------------------------------------------------
// Dessin : goban en kaya, pierres d'ardoise et de coquillage, bols
// ---------------------------------------------------------------------

let echelle = 1;
let fondGo = null;              // goban peint une fois
let volants = [];               // pierres prises qui volent vers un bol
let poses = new Map();          // case -> age de la pose (petit rebond)
let temps = 0;

function coordonnees(c) {
  return { x: PLATEAU.x + MARGE + (c % TAILLE) * PAS, y: PLATEAU.y + MARGE + Math.floor(c / TAILLE) * PAS };
}

// Petit hasard stable par case : chaque pierre a sa propre veine
function graineCase(c) {
  const x = Math.sin(c * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function jouerAnime(c, couleur) {
  const avant = position.plateau.slice();
  jouer(position, c, couleur);
  poses.set(c, 0);
  // Les pierres qui ont disparu volent vers le couvercle de celui qui prend
  for (let i = 0; i < CASES; i++) {
    if (avant[i] !== VIDE && position.plateau[i] === VIDE) {
      const { x, y } = coordonnees(i);
      const bol = couleur === NOIR ? BOLS.noir : BOLS.blanc;
      volants.push({ couleur: avant[i], x0: x, y0: y, x1: bol.x + 62 + (Math.random() - 0.5) * 30, y1: bol.y - 8 + (Math.random() - 0.5) * 16, t: -volants.length * 0.06, c: i });
    }
  }
}

function peindreGoban() {
  const off = document.createElement("canvas");
  off.width = Math.round(W * echelle);
  off.height = Math.round(H * echelle);
  const g = off.getContext("2d");
  g.setTransform(echelle, 0, 0, echelle, 0, 0);
  const { x, y, cote, epaisseur } = PLATEAU;

  // Ombre du goban sur la table, puis le flanc en bois plus sombre
  g.fillStyle = "rgba(0,0,0,0.35)";
  g.beginPath();
  g.roundRect(x + 6, y + 10, cote, cote + epaisseur, 10);
  g.fill();
  g.fillStyle = "#9c6a2e";
  g.beginPath();
  g.roundRect(x, y + 4, cote, cote + epaisseur - 4, 8);
  g.fill();
  g.fillStyle = "#7d5222";
  g.fillRect(x + 6, y + cote, cote - 12, 2);

  // Le dessus en kaya : un aplat chaud, eclaire du coin haut gauche
  const bois = g.createLinearGradient(x, y, x + cote, y + cote);
  bois.addColorStop(0, "#f0c983");
  bois.addColorStop(0.55, "#e2b468");
  bois.addColorStop(1, "#d39f52");
  g.fillStyle = bois;
  g.beginPath();
  g.roundRect(x, y, cote, cote, 8);
  g.fill();

  // Veinage : quelques longues fibres irregulieres, tres discretes
  g.save();
  g.beginPath();
  g.roundRect(x, y, cote, cote, 8);
  g.clip();
  const alea = creerAleatoire(9);
  // Six fibres seulement, espacees au hasard : le bois, pas un motif
  let base = x + 30;
  for (let i = 0; i < 6; i++) {
    base += 40 + alea() * 70;
    g.strokeStyle = "rgba(140,90,30," + (0.05 + alea() * 0.05) + ")";
    g.lineWidth = 2 + alea() * 6;
    g.beginPath();
    g.moveTo(base, y);
    g.bezierCurveTo(base + (alea() - 0.5) * 30, y + cote * 0.33, base + (alea() - 0.5) * 30, y + cote * 0.66, base + (alea() - 0.5) * 16, y + cote);
    g.stroke();
  }
  g.fillStyle = "rgba(255,255,255,0.12)";
  g.fillRect(x, y, cote, 3);
  g.restore();

  // Lignes et hoshi a l'encre
  g.strokeStyle = "#3a2612";
  for (let i = 0; i < TAILLE; i++) {
    const p = MARGE + i * PAS;
    g.lineWidth = i === 0 || i === TAILLE - 1 ? 2 : 1.1;
    g.beginPath();
    g.moveTo(x + MARGE, y + p);
    g.lineTo(x + cote - MARGE, y + p);
    g.moveTo(x + p, y + MARGE);
    g.lineTo(x + p, y + cote - MARGE);
    g.stroke();
  }
  g.fillStyle = "#3a2612";
  HOSHI.forEach(c => {
    const pt = coordonnees(c);
    g.beginPath();
    g.arc(pt.x, pt.y, 3.6, 0, Math.PI * 2);
    g.fill();
  });
  g.fillStyle = "rgba(90,58,26,0.75)";
  g.font = "600 10px 'Martian Mono', monospace";
  g.textAlign = "center";
  g.textBaseline = "middle";
  const lettres = "ABCDEFGHJ";
  for (let i = 0; i < TAILLE; i++) {
    g.fillText(lettres[i], x + MARGE + i * PAS, y + 11);
    g.fillText(String(TAILLE - i), x + 11, y + MARGE + i * PAS);
  }

  // Les deux bols en bois tourne, pierres dedans, couvercle pose a cote
  [["noir", NOIR], ["blanc", BLANC]].forEach(([cle, couleur]) => {
    const b = BOLS[cle];
    g.fillStyle = "rgba(0,0,0,0.35)";
    g.beginPath();
    g.ellipse(b.x + 4, b.y + 30, 54, 16, 0, 0, Math.PI * 2);
    g.fill();
    // Corps du bol en bois tourne, vu de trois quarts
    const flanc = g.createLinearGradient(b.x - 52, 0, b.x + 52, 0);
    flanc.addColorStop(0, "#4a2a10");
    flanc.addColorStop(0.35, "#b0732f");
    flanc.addColorStop(0.6, "#8a5520");
    flanc.addColorStop(1, "#3e220c");
    g.fillStyle = flanc;
    g.beginPath();
    g.moveTo(b.x - 52, b.y);
    g.bezierCurveTo(b.x - 52, b.y + 44, b.x + 52, b.y + 44, b.x + 52, b.y);
    g.closePath();
    g.fill();
    g.fillStyle = "#c08540";
    g.beginPath();
    g.ellipse(b.x, b.y, 52, 15, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#3a200c";
    g.beginPath();
    g.ellipse(b.x, b.y, 46, 12, 0, 0, Math.PI * 2);
    g.fill();
    // Pierres en reserve dans le bol
    const a2 = creerAleatoire(couleur * 31);
    for (let i = 0; i < 16; i++) {
      const px = b.x + (a2() - 0.5) * 66;
      const py = b.y + (a2() - 0.5) * 12;
      pierre(g, px, py, 9, couleur, i * 7 + couleur, true);
    }
    // Le couvercle retourne, ou l'on range les prises
    g.fillStyle = "rgba(0,0,0,0.3)";
    g.beginPath();
    g.ellipse(b.x + 66, b.y + 2, 40, 13, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#9a5f26";
    g.beginPath();
    g.ellipse(b.x + 62, b.y - 2, 40, 13, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#6e4018";
    g.beginPath();
    g.ellipse(b.x + 62, b.y - 3, 34, 10, 0, 0, Math.PI * 2);
    g.fill();
  });
  return off;
}

// Une pierre en volume : ardoise mate ou coquillage veine
function pierre(g, x, y, r, couleur, graine, petite) {
  const v = graineCase(graine);
  g.fillStyle = "rgba(0,0,0,0.38)";
  g.beginPath();
  g.ellipse(x + r * 0.16, y + r * 0.22, r, r * 0.96, 0, 0, Math.PI * 2);
  g.fill();
  const grad = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.08, x, y, r * 1.05);
  if (couleur === NOIR) {
    grad.addColorStop(0, "#6a6a72");
    grad.addColorStop(0.3, "#2a2a30");
    grad.addColorStop(1, "#0a0a0d");
  } else {
    const teinte = 238 + Math.round(v * 10);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.45, "rgb(" + teinte + "," + (teinte - 4) + "," + (teinte - 14) + ")");
    grad.addColorStop(1, "#b9b2a4");
  }
  g.fillStyle = grad;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  if (couleur === BLANC && !petite) {
    // Les fines stries du coquillage, propres a chaque pierre
    g.save();
    g.beginPath();
    g.arc(x, y, r - 1, 0, Math.PI * 2);
    g.clip();
    g.strokeStyle = "rgba(160,150,130,0.22)";
    g.lineWidth = 0.8;
    const ang = v * Math.PI;
    for (let k = -2; k <= 2; k++) {
      g.beginPath();
      g.ellipse(x + Math.cos(ang) * k * r * 0.32, y + Math.sin(ang) * k * r * 0.32, r * 1.6, r * 1.6, ang, Math.PI * 0.4, Math.PI * 0.6);
      g.stroke();
    }
    g.restore();
  }
  if (couleur === NOIR) {
    g.fillStyle = "rgba(255,255,255,0.18)";
    g.beginPath();
    g.ellipse(x - r * 0.35, y - r * 0.42, r * 0.32, r * 0.18, -0.6, 0, Math.PI * 2);
    g.fill();
  }
}

function dessiner() {
  if (fondGo === null) {
    return;
  }
  contexte.setTransform(1, 0, 0, 1, 0, 0);
  contexte.drawImage(fondGo, 0, 0);
  contexte.setTransform(echelle, 0, 0, echelle, 0, 0);

  const mortes = new Set(finale ? finale.mortes : []);

  // Territoires de fin de partie : une petite pierre au centre de chaque point
  if (finale) {
    for (let c = 0; c < CASES; c++) {
      const proprio = mortes.has(c) ? (position.plateau[c] === NOIR ? BLANC : NOIR) : finale.territoire[c];
      if (proprio !== VIDE && position.plateau[c] === VIDE) {
        const { x, y } = coordonnees(c);
        contexte.fillStyle = proprio === NOIR ? "rgba(20,20,26,0.85)" : "rgba(250,246,236,0.95)";
        contexte.strokeStyle = proprio === NOIR ? "rgba(0,0,0,0.6)" : "rgba(120,110,90,0.6)";
        contexte.lineWidth = 1;
        contexte.beginPath();
        contexte.roundRect(x - 7, y - 7, 14, 14, 3);
        contexte.fill();
        contexte.stroke();
      }
    }
  }

  // Pierres posees
  for (let c = 0; c < CASES; c++) {
    const couleur = position.plateau[c];
    if (couleur === VIDE) {
      continue;
    }
    const { x, y } = coordonnees(c);
    const decal = (graineCase(c) - 0.5) * 1.6;
    let r = RAYON;
    let leve = 0;
    if (poses.has(c)) {
      // La pierre arrive de quelques pixels au-dessus et se pose d'un coup
      const t = poses.get(c);
      if (t < 0.14) {
        const k = t / 0.14;
        r *= 1.12 - 0.12 * k;
        leve = (1 - k) * 6;
      }
    }
    contexte.globalAlpha = mortes.has(c) ? 0.45 : 1;
    pierre(contexte, x + decal, y + decal * 0.6 - leve, r, couleur, c, false);
    contexte.globalAlpha = 1;
    if (mortes.has(c)) {
      // Pierre morte : marquee d'une croix au territoire adverse
      contexte.strokeStyle = couleur === NOIR ? "#f6efe0" : "#1a1a20";
      contexte.lineWidth = 2;
      contexte.beginPath();
      contexte.moveTo(x - 6, y - 6);
      contexte.lineTo(x + 6, y + 6);
      contexte.moveTo(x + 6, y - 6);
      contexte.lineTo(x - 6, y + 6);
      contexte.stroke();
    }
  }

  // Dernier coup : un anneau vermillon sur la pierre
  if (dernierCoup >= 0 && position.plateau[dernierCoup] !== VIDE) {
    const { x, y } = coordonnees(dernierCoup);
    contexte.strokeStyle = "#e0574b";
    contexte.lineWidth = 2.5;
    contexte.beginPath();
    contexte.arc(x, y, RAYON * 0.38, 0, Math.PI * 2);
    contexte.stroke();
  }

  // Apercu au survol et curseur clavier
  if (aMoi && !terminee && !reflexion) {
    if (survol >= 0 && position.plateau[survol] === VIDE) {
      const { x, y } = coordonnees(survol);
      contexte.globalAlpha = 0.45;
      pierre(contexte, x, y, RAYON, couleurQuiJoue(), survol, true);
      contexte.globalAlpha = 1;
    }
    const { x, y } = coordonnees(curseur);
    contexte.strokeStyle = "#c6f35a";
    contexte.lineWidth = 2.5;
    const d = PAS * 0.5;
    contexte.beginPath();
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy]) => {
      contexte.moveTo(x + sx * d, y + sy * d * 0.45);
      contexte.lineTo(x + sx * d, y + sy * d);
      contexte.lineTo(x + sx * d * 0.45, y + sy * d);
    });
    contexte.stroke();
  }

  dessinerAidesGo(contexte);
  if (tuto) {
    // Le fond peint des bols reste dessous : la bulle les recouvre
    dessinerBulleGo(contexte);
    volants.forEach(v => {
      if (v.t < 0) {
        return;
      }
      const k = Math.min(1, v.t);
      const x = v.x0 + (v.x1 - v.x0) * k;
      const y = v.y0 + (v.y1 - v.y0) * k - Math.sin(k * Math.PI) * 60;
      pierre(contexte, x, y, RAYON * (1 - 0.35 * k), v.couleur, v.c, true);
    });
    return;
  }

  // Prises : en tas dans le couvercle de chacun, avec le compte
  [["noir", NOIR, BLANC], ["blanc", BLANC, NOIR]].forEach(([cle, joueur, prise]) => {
    const b = BOLS[cle];
    const n = position.captures[joueur] - volants.filter(v => v.couleur === prise && v.t < 1).length;
    const a = creerAleatoire(joueur * 101);
    for (let i = 0; i < Math.min(n, 24); i++) {
      pierre(contexte, b.x + 62 + (a() - 0.5) * 48, b.y - 3 + (a() - 0.5) * 12, 8, prise, i + 50 * joueur, true);
    }
    contexte.fillStyle = "#ede8df";
    contexte.font = "800 18px 'Anybody', sans-serif";
    contexte.textAlign = "center";
    contexte.textBaseline = "middle";
    contexte.fillText(libelleBol(joueur), b.x - 6, b.y + 52);
    contexte.font = "600 10px 'Martian Mono', monospace";
    contexte.fillStyle = "#a9a3b8";
    contexte.fillText(position.captures[joueur] + " prise" + (position.captures[joueur] > 1 ? "s" : ""), b.x + 62, b.y + 52);
    // Le tour : un petit trait sous celui qui joue
    if (!terminee && joueur === trait) {
      contexte.fillStyle = "#c6f35a";
      contexte.fillRect(b.x - 26, b.y + 64, 40, 3);
    }
  });

  // Pierres qui volent vers un couvercle
  volants.forEach(v => {
    if (v.t < 0) {
      return;
    }
    const k = Math.min(1, v.t);
    const e = 1 - Math.pow(1 - k, 3);
    const x = v.x0 + (v.x1 - v.x0) * e;
    const y = v.y0 + (v.y1 - v.y0) * e - Math.sin(k * Math.PI) * 60;
    pierre(contexte, x, y, RAYON * (1 - 0.35 * k), v.couleur, v.c, true);
  });
}

let prochainAjustement = 0;

const boucle = creerBoucle(function (dt) {
  temps += dt;
  // La manette peut apparaitre apres le demarrage : on revoit la taille
  if (temps > prochainAjustement) {
    prochainAjustement = temps + 0.5;
    ajuster();
  }
  poses.forEach((t, c) => {
    if (t > 0.3) {
      poses.delete(c);
    } else {
      poses.set(c, t + dt);
    }
  });
  volants.forEach(v => {
    v.t += dt / 0.55;
  });
  volants = volants.filter(v => v.t < 1.05);
  if (tuto && tuto.bravo > 0) {
    tuto.bravo -= dt;
    if (tuto.bravo <= 0) {
      etapeSuivanteGo();
    }
  }
  dessiner();
}, { plafond: 1 / 20 });

function ajuster() {
  const marge = window.innerWidth >= 1100 ? 500 : 0;
  const largeur = Math.min(window.innerWidth * 0.96 - marge, 620);
  const autres = ["entete-go", "scores-ligne", "versus", "jeu-message"].reduce((somme, classe) => {
    const el = zone.querySelector("." + classe);
    return somme + (el && !el.hidden ? el.getBoundingClientRect().height + 8 : 0);
  }, 0);
  const manette = document.querySelector(".manette:not([hidden])");
  const hauteurManette = manette ? manette.getBoundingClientRect().height : 0;
  const hauteur = Math.max(180, window.innerHeight - autres - hauteurManette - 60);
  const taille = Math.min(largeur / W, hauteur / H);
  canvas.style.width = Math.floor(W * taille) + "px";
  canvas.style.height = Math.floor(H * taille) + "px";
  const nouvelle = Math.min(3, Math.max(1, taille * (window.devicePixelRatio || 1)));
  if (Math.abs(nouvelle - echelle) > 0.02 || fondGo === null) {
    echelle = nouvelle;
    canvas.width = Math.round(W * echelle);
    canvas.height = Math.round(H * echelle);
    fondGo = peindreGoban();
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

function caseSousPointeur(evenement) {
  const r = canvas.getBoundingClientRect();
  const x = (evenement.clientX - r.left) * (W / r.width) - PLATEAU.x;
  const y = (evenement.clientY - r.top) * (H / r.height) - PLATEAU.y;
  const cx = Math.round((x - MARGE) / PAS);
  const cy = Math.round((y - MARGE) / PAS);
  if (cx < 0 || cx >= TAILLE || cy < 0 || cy >= TAILLE) {
    return -1;
  }
  return cy * TAILLE + cx;
}

canvas.addEventListener("pointermove", function (evenement) {
  if (evenement.pointerType !== "mouse") {
    return;
  }
  const c = caseSousPointeur(evenement);
  if (c !== survol) {
    survol = c;
    dessiner();
  }
});

canvas.addEventListener("pointerleave", function () {
  survol = -1;
  dessiner();
});

canvas.addEventListener("click", function (evenement) {
  if (tuto) {
    const r = canvas.getBoundingClientRect();
    const x = (evenement.clientX - r.left) * (W / r.width);
    const y = (evenement.clientY - r.top) * (H / r.height);
    const b = boutonsTuto.find(bt => x >= bt.zone[0] && x <= bt.zone[0] + bt.zone[2] && y >= bt.zone[1] && y <= bt.zone[1] + bt.zone[3]);
    if (b) {
      jouerSon("clic");
      b.action();
      return;
    }
  }
  const c = caseSousPointeur(evenement);
  if (c >= 0) {
    curseur = c;
    poserPierre(c);
  }
});

canvas.addEventListener("contextmenu", evenement => evenement.preventDefault());

surTouche(ID, function (evenement) {
  const touche = evenement.key.toLowerCase();
  const x = curseur % TAILLE;
  const y = Math.floor(curseur / TAILLE);
  if (touche === "arrowleft" || touche === "q") {
    curseur = y * TAILLE + Math.max(0, x - 1);
  } else if (touche === "arrowright" || touche === "d") {
    curseur = y * TAILLE + Math.min(TAILLE - 1, x + 1);
  } else if (touche === "arrowup" || touche === "z") {
    curseur = Math.max(0, y - 1) * TAILLE + x;
  } else if (touche === "arrowdown" || touche === "s") {
    curseur = Math.min(TAILLE - 1, y + 1) * TAILLE + x;
  } else if ((touche === " " || touche === "enter") && tuto && boutonsTuto.some(b => b.principal)) {
    boutonsTuto.find(b => b.principal).action();
  } else if (touche === " " || touche === "enter") {
    poserPierre(curseur);
  } else if (touche === "p") {
    passer();
  } else if (touche === "u" || touche === "backspace") {
    annuler();
  } else if (touche === "n" && tuto && tuto.i >= 0) {
    preparerEtapeGo();
  } else if (touche === "t" && tuto) {
    quitterTuto();
  } else if (touche === "n") {
    demarrer();
    return;
  } else if (touche === "m") {
    basculerSon();
    majBoutonSon();
  } else if (touche === "escape") {
    quitterJeu();
    return;
  } else {
    return;
  }
  evenement.preventDefault();
  dessiner();
});

function majBoutonSon() {
  boutonSon.textContent = sonActif() ? "Son" : "Muet";
}

creerBoutonsChoix(zoneNiveaux, CHOIX, function (choix) {
  if (niveau.ligne && !choix.ligne && versus.ouvert) {
    versus.fermer();
    if (versus.ouvert) {
      return;
    }
  }
  niveau = choix;
  if (!choix.ligne) {
    stockageNiveau.ecrireTexte(choix.id);
  }
  demarrer();
});

function libelleBol(couleur) {
  if (niveau.deux) {
    return couleur === NOIR ? "NOIR" : "BLANC";
  }
  if (niveau.ligne) {
    return couleur === maCouleur ? "TOI" : nomAdversaire.slice(0, 8);
  }
  return couleur === NOIR ? "TOI" : "IA";
}

// ---------------------------------------------------------------------
// Versus en ligne : un coup = une intersection (-1 pour passer).
// Celui qui commence a les noirs.
// ---------------------------------------------------------------------

function coupAdverse(k) {
  const c = Number(k.c);
  const couleur = adversaire(maCouleur);
  if (c >= 0 && !estLegal(position, c, couleur)) {
    afficher("Coup reçu impossible : la partie est arrêtée.");
    terminee = true;
    versus.terminer("victoire", "invalide");
    return;
  }
  if (c < 0) {
    jouer(position, -1, couleur);
    dernierCoup = -1;
    passes++;
    trait = maCouleur;
    if (passes >= 2) {
      terminer();
      return;
    }
    afficher(nomAdversaire + " passe. Si tu passes aussi, la partie est finie.");
  } else {
    const avant = position.captures[couleur];
    jouerAnime(c, couleur);
    dernierCoup = c;
    passes = 0;
    trait = maCouleur;
    jouerSon(position.captures[couleur] > avant ? "impact" : "clic");
    afficher(position.captures[couleur] > avant ? nomAdversaire + " prend des pierres. À toi." : "À toi.");
  }
  aMoi = true;
  versus.tour(true);
  majEntete();
  dessiner();
}

const versus = creerVersus({
  jeu: ID,
  nom: "Go",
  section: zone,
  surDebut(info) {
    demandeEnCours++;
    tuto = null;
    position = nouvellePosition();
    historique = [];
    dernierCoup = -1;
    passes = 0;
    terminee = false;
    reflexion = false;
    finale = null;
    volants = [];
    poses = new Map();
    maCouleur = info.jeCommence ? NOIR : BLANC;
    trait = NOIR;
    graineFin = Number(info.graine) || 1;
    nomAdversaire = info.adversaire;
    info.coups.forEach(k => {
      const c = Number(k.c.c);
      jouer(position, c, trait);
      dernierCoup = c;
      passes = c < 0 ? passes + 1 : 0;
      trait = adversaire(trait);
    });
    aMoi = trait === maCouleur;
    versus.tour(aMoi);
    afficher(aMoi ? "À toi : tu as les " + (maCouleur === NOIR ? "noirs" : "blancs") + " contre " + nomAdversaire + "."
      : nomAdversaire + " a les noirs et commence.");
    jouerSon("bonus");
    majEntete();
    dessiner();
    if (passes >= 2) {
      terminer();
    }
  },
  surCoup: coupAdverse,
  surFin(fin) {
    terminee = true;
    majEntete();
    afficher(fin.resultat === "victoire" ? "Victoire : " + nomAdversaire + (fin.raison === "abandon" ? " abandonne." : " quitte la partie.")
      : fin.resultat === "nul" ? "Partie nulle." : "Partie perdue.");
    dessiner();
  },
  passerEnLigne() {
    if (!niveau.ligne) {
      niveau = NIVEAUX.find(n => n.ligne);
      tuto = null;
      demarrer();
    }
  },
  surFermeture() {
    if (niveau.ligne) {
      niveau = NIVEAUX[0];
      demarrer();
    }
  }
});

boutonPasser.addEventListener("click", passer);
document.getElementById("tutoGo").addEventListener("click", lancerTuto);
boutonAnnuler.addEventListener("click", annuler);
boutonSon.addEventListener("click", () => { basculerSon(); majBoutonSon(); });
document.getElementById("nouvelleGo").addEventListener("click", demarrer);
document.getElementById("quitterGo").addEventListener("click", quitterJeu);

// Pour les tests automatiques
export const _test = { get tuto() { return tuto; }, get position() { return position; }, get aMoi() { return aMoi && !reflexion; }, ETAPES_GO, lancerTuto, poserPierre, passer, get boutons() { return boutonsTuto; } };

enregistrerJeu({
  id: ID,
  nom: "Go",
  code: "81",
  section: zone,
  demarrer() {
    if (niveau.ligne && versus.ouvert) {
      marquerChoixActif(zoneNiveaux, niveau.id);
      ajuster();
      requestAnimationFrame(ajuster);
      boucle.lancer();
      versus.reprendreSondage();
      return;
    }
    if (niveau.ligne) {
      niveau = NIVEAUX[0];
    }
    demarrer();
    if (!(stockageTuto.lire() || {}).vu) {
      proposerTuto();
    }
  },
  arreter: () => { demandeEnCours++; boucle.arreter(); versus.suspendre(); },
  classement: () => "go-" + (niveau.deux || niveau.ligne ? "facile" : niveau.id),
  formaterScore: score => "+" + (score / 10).toLocaleString("fr-BE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
  manette: { a: " ", b: "p", start: "n", libelles: { a: "Poser", b: "Passer" }, quatreDirections: true }
});


