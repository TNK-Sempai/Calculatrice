// =====================================================================
//  SHOGI - 将棋
//  Les echecs japonais sur 9 x 9, contre une IA en trois niveaux. Tu as
//  les pieces du bas (sente) et tu commences. Les pieces prises passent
//  sur ton komadai et tu peux les reparachuter a la place d'un coup.
//  Promotion dans les trois dernieres rangees, echec et mat, et la
//  repetition (sennichite) donne une partie nulle.
//  L'IA (alpha-beta) tourne dans un Web Worker.
// =====================================================================

import { enregistrerJeu, finDePartie, quitterJeu, majScoreCourant } from "./arcade.js";
import { surTouche } from "./noyau/clavier.js";
import { creerBoutonsChoix, marquerChoixActif } from "./noyau/choix.js";
import { creerStockage } from "./noyau/stockage.js";
import { creerBoucle } from "./noyau/boucle.js";
import { jouer as jouerSon, basculerSon, sonActif } from "./noyau/son.js";
import { creerVersus, versusDisponible } from "./versus.js";
import {
  CASES, SENTE, GOTE, PION, LANCE, CAVALIER, ARGENT, OR, FOU, TOUR, ROI, PROMU,
  camp, typeDe, positionDeDepart, copier, cle, zonePromotion, enEchec, caseDuRoi,
  jouer, coupsLegaux, memeCoup, choisirCoup, creerAleatoire
} from "./shogi/moteur.js";

const ID = "shogi";
const NIVEAUX = [
  { id: "facile", nom: "Facile", facteur: 1 },
  { id: "moyen", nom: "Moyen", facteur: 2 },
  { id: "difficile", nom: "Difficile", facteur: 3 },
  { id: "deux", nom: "À deux", facteur: 0, deux: true },
  { id: "ligne", nom: "En ligne", facteur: 0, ligne: true }
];
const CHOIX = NIVEAUX.filter(n => !n.ligne || versusDisponible());

// Kanji des pieces (le roi du joueur est 玉, celui de l'IA 王)
const KANJI = { 1: "歩", 2: "香", 3: "桂", 4: "銀", 5: "金", 6: "角", 7: "飛", 8: "玉", 9: "と", 10: "杏", 11: "圭", 12: "全", 14: "馬", 15: "龍" };
// Petite aide en lettres pour les debutants (initiales francaises)
const LETTRES = { 1: "P", 2: "L", 3: "C", 4: "A", 5: "O", 6: "F", 7: "T", 8: "R", 9: "P+", 10: "L+", 11: "C+", 12: "A+", 14: "F+", 15: "T+" };
const NOMS = { 1: "pion", 2: "lance", 3: "cavalier", 4: "argent", 5: "or", 6: "fou", 7: "tour", 8: "roi" };
// Taille relative de chaque piece, comme les vraies
const TAILLES = { 1: 0.76, 2: 0.79, 3: 0.81, 4: 0.85, 5: 0.85, 6: 0.89, 7: 0.89, 8: 0.92 };
const POLICE_JP = "'Shippori Mincho B1', 'Hiragino Mincho ProN', 'Yu Mincho', 'Noto Serif JP', 'Noto Serif CJK JP', serif";

// ---------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------

const zone = document.createElement("section");
zone.className = "jeu jeu-shogi";
zone.id = "jeuShogi";
zone.hidden = true;
zone.innerHTML = `
  <div class="jeu-entete entete-shogi">
    <span class="jeu-score score-principal">Coups <strong class="valeur-score" id="coupsShogi">0</strong></span>
    <span class="jeu-score">Prises <strong id="prisesShogi">0 / 0</strong></span>
    <span class="entete-boutons">
      <button class="jeu-quitter" id="tutoShogi" type="button">Apprendre</button>
      <button class="jeu-quitter" id="annulerShogi" type="button">Annuler</button>
      <button class="jeu-quitter" id="nomsShogi" type="button" aria-pressed="false">Noms</button>
      <button class="jeu-quitter" id="sonShogi" type="button">Son</button>
      <button class="jeu-quitter" id="nouvelleShogi" type="button">Rejouer</button>
      <button class="jeu-quitter" id="quitterShogi" type="button">Retour</button>
    </span>
  </div>
  <div class="scores-ligne" id="niveauxShogi"></div>
  <canvas id="canvasShogi"></canvas>
  <p class="jeu-message" id="messageShogi"></p>
  <p class="jeu-aide">Touche une de tes pièces (en bas) puis une case verte. Pour parachuter, touche une pièce de ton komadai puis une case vide. Flèches pour le curseur, Espace ou Entrée pour choisir, U pour annuler, L pour les noms des pièces. N rejouer, M son, Échap quitter.</p>`;
document.body.appendChild(zone);

const canvas = document.getElementById("canvasShogi");
const contexte = canvas.getContext("2d");
const zoneCoups = document.getElementById("coupsShogi");
const zonePrises = document.getElementById("prisesShogi");
const zoneMessage = document.getElementById("messageShogi");
const zoneNiveaux = document.getElementById("niveauxShogi");
const boutonAnnuler = document.getElementById("annulerShogi");
const boutonNoms = document.getElementById("nomsShogi");
const boutonSon = document.getElementById("sonShogi");

// Plan logique : komadai de l'IA en haut, le shogiban, le tien en bas
const W = 560;
const H = 714;
const CASE = 54;
const BX = 37;
const BY = 114;
const COTE = CASE * 9;
const KOMADAI = { haut: { x: BX, y: 6, w: COTE, h: 90 }, bas: { x: BX, y: 618, w: COTE, h: 90 } };
const TYPES_MAIN = [PION, LANCE, CAVALIER, ARGENT, OR, FOU, TOUR];
const LARGEUR_CASIER = COTE / TYPES_MAIN.length;

// ---------------------------------------------------------------------
// Etat
// ---------------------------------------------------------------------

const stockageNiveau = creerStockage("tanuki-arcade-shogi-niveau");
const stockageNoms = creerStockage("tanuki-arcade-shogi-noms");
let niveau = NIVEAUX.find(n => n.id === stockageNiveau.lireTexte() && !n.ligne) || NIVEAUX[0];
// A deux sur un ecran : le plateau se retourne a chaque coup, si bien que
// celui qui joue a toujours ses pieces en bas. joueurAuTrait : 1 ou 2.
let joueurAuTrait = 1;
// Noms affiches sur les komadai (l'IA, l'autre joueur, l'adversaire en ligne)
let nomEnHaut = "L'IA";
let avecNoms = stockageNoms.lireTexte() === "1";
let position = positionDeDepart();
let legaux = [];
let historique = [];        // etats avant chacun de mes coups
let repetitions = new Map();
let dernier = null;         // dernier coup joue
let coupsJoueur = 0;
let prises = [0, 0];
let aMoi = true;
let terminee = false;
let reflexion = false;
let selection = null;       // { case } ou { main: type }
let cibles = [];            // coups possibles depuis la selection
let choixPromo = null;      // { coups: [garder, promouvoir], vers, actif }
let curseur = { r: 6, c: 4 };
let survol = -1;
let anim = null;            // { piece, x0, y0, vers, t }
let demandeEnCours = 0;

// ---------------------------------------------------------------------
// Web Worker de l'IA, avec repli sur la page si le navigateur refuse
// ---------------------------------------------------------------------

let ouvrier = null;
try {
  ouvrier = new Worker(new URL("./shogi/ia.js", import.meta.url), { type: "module" });
  ouvrier.onerror = () => { ouvrier = null; };
} catch (erreur) {
  ouvrier = null;
}

function demanderCoup() {
  return new Promise(resoudre => {
    const id = ++demandeEnCours;
    const message = {
      plateau: Array.from(position.plateau),
      mains: [position.mains[0].slice(), position.mains[1].slice()],
      trait: position.trait,
      niveau: niveau.id,
      graine: Math.floor(Math.random() * 1e9)
    };
    if (ouvrier === null) {
      setTimeout(() => {
        const pos = { plateau: Int8Array.from(message.plateau), mains: message.mains, trait: message.trait };
        resoudre({ id, coup: choisirCoup(pos, message.niveau, message.graine) });
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

// ---------------------------------------------------------------------
// Tutoriel : des positions preparees, on bouge vraiment les pieces
// ---------------------------------------------------------------------

const stockageTuto = creerStockage("tanuki-arcade-tuto-shogi");
let tuto = null;               // { i, bravo, message, apres }
let boutonsTuto = [];

const ic = (r, c) => r * 9 + c;
// Les deux rois sont toujours la, dans les coins, pour que les regles tiennent
const ROIS = [[ic(0, 0), -ROI], [ic(8, 8), ROI]];

function etapePiece(type, titre, texte, depuis, autres) {
  return {
    titre, texte,
    pieces: ROIS.concat([[depuis, type]], autres || []),
    depuis, horsZone: true,
    reussi: ev => ev.coup && ev.coup.de === depuis
  };
}

const ETAPES = [
  etapePiece(PION, "Le pion 歩", "Le pion avance d'une seule case, tout droit, et prend de la même façon. Touche ton pion, puis la case verte.", ic(6, 4)),
  etapePiece(LANCE, "La lance 香", "La lance file tout droit, aussi loin que la voie est libre, mais ne recule jamais et ne va pas de côté. Touche-la, puis une case verte.", ic(8, 2)),
  etapePiece(CAVALIER, "Le cavalier 桂", "Le cavalier saute deux cases en avant puis une de côté, par-dessus les pièces. Il n'a que ces deux sauts, jamais en arrière.", ic(7, 4), [[ic(6, 4), PION], [ic(6, 3), PION], [ic(6, 5), PION]]),
  etapePiece(ARGENT, "L'argent 銀", "L'argent va d'une case en avant ou en diagonale. Il ne recule qu'en diagonale, jamais tout droit ni de côté.", ic(6, 4)),
  etapePiece(OR, "L'or 金", "L'or va d'une case dans toutes les directions, sauf les deux diagonales arrière. C'est le meilleur garde du roi.", ic(6, 4)),
  etapePiece(FOU, "Le fou 角", "Le fou glisse en diagonale, aussi loin que la voie est libre, en avant comme en arrière.", ic(6, 4)),
  etapePiece(TOUR, "La tour 飛", "La tour glisse en ligne droite dans les quatre directions. Avec le fou, c'est la pièce la plus forte.", ic(6, 4)),
  {
    titre: "Le roi 玉",
    texte: "Le roi va d'une case dans toutes les directions. Il ne doit jamais aller sur une case attaquée : ici, le fou adverse surveille une diagonale.",
    pieces: [[ic(0, 0), -ROI], [ic(6, 4), ROI], [ic(2, 8), -FOU]],
    depuis: ic(6, 4), horsZone: true,
    reussi: ev => ev.coup && ev.coup.de === ic(6, 4)
  },
  {
    titre: "Capturer",
    texte: "On prend en allant sur la case d'une pièce adverse. Prends l'argent adverse avec ton argent : regarde où elle part.",
    pieces: ROIS.concat([[ic(6, 4), ARGENT], [ic(5, 4), -ARGENT]]),
    depuis: ic(6, 4), cibles: [ic(5, 4)],
    reussi: ev => ev.coup && ev.prise !== 0,
    apres: "La pièce prise ne disparaît pas : elle rejoint ton komadai, en bas. Elle est à toi maintenant, et tu pourras la reposer sur le plateau."
  },
  {
    titre: "Parachuter",
    texte: "Au lieu de bouger, tu peux poser une pièce de ton komadai sur une case vide. Touche le pion en bas, puis une case verte. Rien dans la colonne de ton pion : deux pions dans une colonne (nifu), c'est interdit.",
    pieces: ROIS.concat([[ic(6, 2), PION]]),
    main: PION, horsZone: true,
    reussi: ev => ev.coup && ev.coup.de < 0,
    apres: "Deux autres interdits : on ne parachute pas un pion qui fait mat, ni une pièce là où elle ne pourrait plus bouger (pion ou lance sur la dernière rangée, cavalier sur les deux dernières)."
  },
  {
    titre: "La promotion",
    texte: "Les trois rangées du haut sont la zone adverse. Une pièce qui y entre peut se retourner : elle est promue. Avance ton pion et choisis la face rouge.",
    pieces: ROIS.concat([[ic(3, 4), PION]]),
    depuis: ic(3, 4), zone: true,
    reussi: ev => ev.coup && ev.coup.promo,
    rate: "Tu as gardé le pion tel quel. Recommence et choisis cette fois la face rouge, promue.",
    apres: "Le pion devient と et bouge comme un or. Les promus ont leur kanji en rouge. Arrivés sur la dernière rangée, pion et lance sont promus d'office. L'or et le roi ne se promeuvent jamais."
  },
  {
    titre: "Échec et mat",
    texte: "Une pièce qui menace le roi le met en échec. S'il ne peut plus s'en sortir, il est mat et tu gagnes. Parachute ton or juste devant le roi adverse : ton pion le protège.",
    pieces: [[ic(0, 4), -ROI], [ic(2, 4), PION], [ic(8, 8), ROI]],
    mains: { [OR]: 1 }, main: OR, cibles: [ic(1, 4)],
    reussi: ev => ev.mat,
    apres: "Mat ! Le roi ne peut ni prendre l'or (le pion le protège) ni fuir : chaque case est attaquée. Tout le shogi est là : protéger ton roi et piéger celui d'en face."
  }
];

function proposerTuto() {
  tuto = { proposition: true, i: -1, bravo: 0, message: "" };
  position = positionDeDepart();
  legaux = [];
  afficher("");
}

function lancerTuto() {
  if (niveau.ligne && versus.ouvert) {
    afficher("Le tutoriel attendra la fin de la partie en ligne.");
    return;
  }
  stockageTuto.ecrire({ vu: true });
  tuto = { i: 0, bravo: 0, message: "" };
  preparerEtape();
  boucle.lancer();
}

function positionEtape(e) {
  const pos = { plateau: new Int8Array(CASES), mains: [new Array(8).fill(0), new Array(8).fill(0)], trait: SENTE };
  e.pieces.forEach(([c, p]) => { pos.plateau[c] = p; });
  Object.entries(e.mains || {}).forEach(([t, n]) => { pos.mains[0][t] = n; });
  if (e.main && !e.mains) {
    pos.mains[0][e.main] = 1;
  }
  return pos;
}

function preparerEtape() {
  const e = ETAPES[tuto.i];
  demandeEnCours++;
  position = positionEtape(e);
  historique = [];
  repetitions = new Map();
  dernier = null;
  coupsJoueur = 0;
  prises = [0, 0];
  aMoi = true;
  terminee = false;
  reflexion = false;
  anim = null;
  deselectionner();
  tuto.bravo = 0;
  tuto.message = "";
  tuto.apres = false;
  calculerLegaux();
  if (e.depuis !== undefined) {
    curseur = { r: Math.floor(e.depuis / 9), c: e.depuis % 9 };
  } else {
    curseur = { r: 9, c: TYPES_MAIN.indexOf(e.main) };
  }
  afficher("");
  majEntete();
}

function finTuto() {
  tuto = { fin: true, i: -1, bravo: 0, message: "" };
  position = positionDeDepart();
  legaux = [];
  dernier = null;
  deselectionner();
}

function quitterTuto() {
  tuto = null;
  demarrer();
}

function etapeSuivante() {
  if (tuto.i >= ETAPES.length - 1) {
    finTuto();
    return;
  }
  tuto.i++;
  preparerEtape();
}

// ---------------------------------------------------------------------
// Partie
// ---------------------------------------------------------------------

function demarrer() {
  if (niveau.ligne && versus.actif) {
    return;   // une partie en ligne ne se recommence pas : on l'abandonne
  }
  tuto = null;
  position = positionDeDepart();
  joueurAuTrait = 1;
  nomEnHaut = niveau.deux ? "JOUEUR 2" : niveau.ligne ? "ADVERSAIRE" : "L'IA";
  historique = [];
  repetitions = new Map([[cle(position), 1]]);
  dernier = null;
  coupsJoueur = 0;
  prises = [0, 0];
  aMoi = true;
  terminee = false;
  reflexion = false;
  anim = null;
  curseur = { r: 6, c: 4 };
  demandeEnCours++;   // ignore une reponse d'une partie precedente
  deselectionner();
  calculerLegaux();
  marquerChoixActif(zoneNiveaux, niveau.id);
  afficher(niveau.deux ? "Joueur 1 commence. Le plateau se retourne après chaque coup."
    : "À toi. Tu as les pièces du bas et tu commences.");
  if (niveau.ligne) {
    aMoi = false;
    legaux = [];
    afficher("Versus en ligne : trouve un adversaire dans le panneau ci-dessus.");
    versus.ouvrir();
  }
  majEntete();
  majBoutonSon();
  majBoutonNoms();
  ajuster();
  requestAnimationFrame(ajuster);
  boucle.lancer();
}

function idClassement() {
  return "shogi-" + niveau.id;
}

function afficher(texte) {
  zoneMessage.textContent = texte;
}

function majEntete() {
  zoneCoups.textContent = coupsJoueur.toLocaleString("fr-BE");
  zonePrises.textContent = prises[0] + " / " + prises[1];
  boutonAnnuler.disabled = !!tuto || historique.length === 0 || terminee || !!niveau.ligne;
}

// Coups legaux du joueur ; pendant le tuto, seulement ceux de l'etape
function calculerLegaux() {
  if (position.trait !== SENTE) {
    legaux = [];
    return;
  }
  legaux = coupsLegaux(position);
  if (tuto && tuto.i >= 0) {
    const e = ETAPES[tuto.i];
    legaux = legaux.filter(k => {
      if (e.depuis !== undefined && k.de !== e.depuis) {
        return false;
      }
      if (e.main && (k.de >= 0 || k.type !== e.main)) {
        return false;
      }
      if (e.cibles && !e.cibles.includes(k.vers)) {
        return false;
      }
      if (e.horsZone && (k.promo || zonePromotion(SENTE, Math.floor(k.vers / 9)))) {
        return false;
      }
      return true;
    });
  }
}

function deselectionner() {
  selection = null;
  cibles = [];
  choixPromo = null;
}

function peutJouer() {
  if (tuto) {
    return tuto.i >= 0 && !tuto.apres && tuto.bravo <= 0;
  }
  return aMoi && !terminee && !reflexion;
}

// Toucher une case du plateau (ou -1 - type pour une piece du komadai)
function activerCase(c) {
  if (!peutJouer()) {
    return;
  }
  // Une case verte : on joue
  if (selection) {
    const vers = cibles.filter(k => k.vers === c);
    if (vers.length) {
      if (vers.length === 2) {
        const garder = vers.find(k => !k.promo);
        const promouvoir = vers.find(k => k.promo);
        choixPromo = { coups: [garder, promouvoir], vers: c, actif: 1 };
        jouerSon("clic");
        return;
      }
      jouerCoupJoueur(vers[0]);
      return;
    }
  }
  const p = position.plateau[c];
  if (p > 0) {
    if (selection && selection.case === c) {
      deselectionner();
      return;
    }
    const depuis = legaux.filter(k => k.de === c);
    if (!depuis.length) {
      deselectionner();
      if (tuto) {
        tuto.message = "Ce n'est pas la pièce de l'exercice : touche celle qui est montrée.";
      } else {
        afficher(enEchec(position, SENTE) ? "Échec ! Cette pièce ne peut rien pour ton roi." : "Cette pièce ne peut pas bouger.");
      }
      jouerSon("clic");
      return;
    }
    selection = { case: c };
    cibles = depuis;
    jouerSon("clic");
    return;
  }
  deselectionner();
}

function activerMain(type) {
  if (!peutJouer()) {
    return;
  }
  if (position.mains[0][type] <= 0) {
    deselectionner();
    return;
  }
  if (selection && selection.main === type) {
    deselectionner();
    return;
  }
  const poses = legaux.filter(k => k.de < 0 && k.type === type);
  if (!poses.length) {
    deselectionner();
    if (tuto) {
      tuto.message = "Pas cette pièce-là pour l'exercice.";
    } else {
      afficher("Cette pièce ne peut être posée nulle part pour l'instant.");
    }
    jouerSon("clic");
    return;
  }
  selection = { main: type };
  cibles = poses;
  jouerSon("clic");
}

function choisirPromotion(promouvoir) {
  if (!choixPromo) {
    return;
  }
  const coup = choixPromo.coups[promouvoir ? 1 : 0];
  choixPromo = null;
  jouerCoupJoueur(coup);
}

// Position a l'ecran du centre d'une case ou d'un casier du komadai
function centreCase(c) {
  return { x: BX + (c % 9 + 0.5) * CASE, y: BY + (Math.floor(c / 9) + 0.5) * CASE };
}

function centreCasier(type, cote) {
  const k = TYPES_MAIN.indexOf(type);
  const kd = cote === SENTE ? KOMADAI.bas : KOMADAI.haut;
  return { x: kd.x + (k + 0.5) * LARGEUR_CASIER, y: kd.y + 52 };
}

// Joue un coup en place, avec le petit glissement de la piece
function jouerAvecAnim(coup) {
  const c = position.trait;
  const depart = coup.de >= 0 ? centreCase(coup.de) : centreCasier(coup.type, c);
  const prise = position.plateau[coup.vers];
  jouer(position, coup);
  anim = { x0: depart.x, y0: depart.y, vers: coup.vers, t: 0 };
  dernier = coup;
  if (prise !== 0) {
    prises[c === SENTE ? 0 : 1]++;
  }
  return prise;
}

function jouerCoupJoueur(coup) {
  deselectionner();
  if (tuto) {
    jouerTuto(coup);
    return;
  }
  if (niveau.ligne) {
    jouerEnLigne(coup);
    return;
  }
  historique.push({ position: copier(position), dernier, repetitions: new Map(repetitions), coupsJoueur, prises: prises.slice(), joueurAuTrait });
  const prise = jouerAvecAnim(coup);
  coupsJoueur++;
  jouerSon(prise !== 0 ? "croque" : coup.de < 0 ? "grain" : "clic");
  majEntete();
  if (verifierFin()) {
    return;
  }
  if (niveau.deux) {
    passerLaMain();
    return;
  }
  tourDeLIA();
}

// ---------------------------------------------------------------------
// A deux et en ligne
// ---------------------------------------------------------------------

// Le plateau vu par l'autre camp : rotation d'un demi-tour, couleurs
// echangees, reserves echangees. Le joueur au trait se retrouve en bas.
function pivoter(pos) {
  const plateau = new Int8Array(CASES);
  for (let i = 0; i < CASES; i++) {
    plateau[i] = -pos.plateau[CASES - 1 - i];
  }
  return { plateau, mains: [pos.mains[1].slice(), pos.mains[0].slice()], trait: -pos.trait };
}

// Un coup vu depuis l'autre bout du plateau
function tourner(coup) {
  if (!coup) {
    return coup;
  }
  return { de: coup.de >= 0 ? CASES - 1 - coup.de : -1, vers: CASES - 1 - coup.vers, type: coup.type, promo: !!coup.promo };
}

function passerLaMain() {
  aMoi = false;
  legaux = [];
  const attendu = demandeEnCours;
  setTimeout(() => {
    if (attendu !== demandeEnCours || terminee) {
      return;
    }
    position = pivoter(position);
    dernier = tourner(dernier);
    prises = [prises[1], prises[0]];
    anim = null;
    joueurAuTrait = 3 - joueurAuTrait;
    nomEnHaut = "JOUEUR " + (3 - joueurAuTrait);
    aMoi = true;
    calculerLegaux();
    majEntete();
    afficher("Joueur " + joueurAuTrait + ", à toi" + (enEchec(position, SENTE) ? " : ton roi est en échec !" : "."));
  }, 650);
}

function jouerEnLigne(coup) {
  const prise = jouerAvecAnim(coup);
  coupsJoueur++;
  jouerSon(prise !== 0 ? "croque" : coup.de < 0 ? "grain" : "clic");
  versus.envoyer({ de: coup.de, vers: coup.vers, type: coup.type, promo: !!coup.promo });
  aMoi = false;
  legaux = [];
  majEntete();
  if (verifierFin()) {
    return;
  }
  versus.tour(false);
  afficher("Au tour de " + versus.adversaire + ".");
}

function coupAdverse(recu) {
  const voulu = tourner(recu);
  const coup = coupsLegaux(position).find(k => memeCoup(k, voulu));
  if (!coup) {
    afficher("Coup reçu impossible : la partie est arrêtée.");
    terminee = true;
    versus.terminer("victoire", "invalide");
    return;
  }
  const prise = jouerAvecAnim(coup);
  jouerSon(prise !== 0 ? "impact" : "clic");
  aMoi = true;
  majEntete();
  if (verifierFin()) {
    return;
  }
  calculerLegaux();
  versus.tour(true);
  if (enEchec(position, SENTE)) {
    afficher("Échec ! Protège ton roi.");
    jouerSon("bonus");
  } else if (prise !== 0) {
    afficher(versus.adversaire + " prend ton " + NOMS[typeDe(prise) > PROMU ? typeDe(prise) - PROMU : typeDe(prise)] + ". À toi.");
  } else {
    afficher("À toi.");
  }
}

const versus = creerVersus({
  jeu: ID,
  nom: "Shōgi",
  section: zone,
  surDebut(info) {
    demandeEnCours++;
    tuto = null;
    position = positionDeDepart();
    if (!info.jeCommence) {
      position.trait = GOTE;   // l'adversaire ouvre la partie
    }
    historique = [];
    repetitions = new Map([[cle(position), 1]]);
    dernier = null;
    coupsJoueur = 0;
    prises = [0, 0];
    terminee = false;
    reflexion = false;
    anim = null;
    nomEnHaut = info.adversaire;
    deselectionner();
    info.coups.forEach(k => {
      const voulu = k.moi ? k.c : tourner(k.c);
      const coup = coupsLegaux(position).find(x => memeCoup(x, voulu)) || voulu;
      const c = position.trait;
      if (position.plateau[coup.vers] !== 0) {
        prises[c === SENTE ? 0 : 1]++;
      }
      jouer(position, coup);
      dernier = coup;
      if (k.moi) {
        coupsJoueur++;
      }
      const cleP = cle(position);
      repetitions.set(cleP, (repetitions.get(cleP) || 0) + 1);
    });
    aMoi = position.trait === SENTE;
    calculerLegaux();
    majEntete();
    versus.tour(aMoi);
    afficher(aMoi ? "À toi : tu as les pièces du bas contre " + info.adversaire + "." : info.adversaire + " commence.");
    jouerSon("bonus");
  },
  surCoup: coupAdverse,
  surFin(fin) {
    terminee = true;
    legaux = [];
    deselectionner();
    majEntete();
    afficher(fin.resultat === "victoire" ? "Victoire : " + versus.adversaire + " quitte la partie." : fin.resultat === "nul" ? "Partie nulle." : "Partie perdue.");
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

function jouerTuto(coup) {
  const e = ETAPES[tuto.i];
  const avant = copier(position);
  const prise = jouerAvecAnim(coup);
  const ev = { coup, prise, mat: coupsLegaux(position).length === 0 && enEchec(position, GOTE) };
  jouerSon(prise !== 0 ? "croque" : "clic");
  majEntete();
  if (!e.reussi(ev)) {
    tuto.message = e.rate || "Presque ! Recommence avec la case montrée.";
    // Retour a la position de l'exercice, apres avoir vu le coup
    const message = tuto.message;
    setTimeout(() => {
      if (tuto && ETAPES[tuto.i] === e && !tuto.apres) {
        position = avant;
        dernier = null;
        anim = null;
        calculerLegaux();
        tuto.message = message;
      }
    }, 900);
    legaux = [];
    return;
  }
  jouerSon("vie");
  tuto.message = "";
  legaux = [];
  if (e.apres) {
    tuto.apres = true;
  } else {
    tuto.bravo = 1.3;
  }
}

function annuler() {
  if (tuto || historique.length === 0 || terminee || niveau.ligne) {
    return;
  }
  const etat = historique.pop();
  demandeEnCours++;   // l'IA qui reflechissait est oubliee
  position = etat.position;
  dernier = etat.dernier;
  repetitions = etat.repetitions;
  coupsJoueur = etat.coupsJoueur;
  prises = etat.prises;
  if (niveau.deux) {
    joueurAuTrait = etat.joueurAuTrait || 1;
    nomEnHaut = "JOUEUR " + (3 - joueurAuTrait);
  }
  aMoi = true;
  reflexion = false;
  anim = null;
  deselectionner();
  calculerLegaux();
  afficher("Coup annulé. À toi.");
  majEntete();
}

// Fin de partie apres chaque coup : mat (ou plus aucun coup), repetition
function verifierFin() {
  const k = cle(position);
  repetitions.set(k, (repetitions.get(k) || 0) + 1);
  if (repetitions.get(k) >= 4) {
    terminer("nulle");
    return true;
  }
  if (coupsLegaux(position).length === 0) {
    terminer(position.trait === GOTE ? "victoire" : "defaite");
    return true;
  }
  return false;
}

async function tourDeLIA() {
  aMoi = false;
  reflexion = true;
  legaux = [];
  afficher(niveau.id === "facile" ? "L'IA joue..." : "L'IA réfléchit...");
  const debut = performance.now();
  const reponse = await demanderCoup();
  if (reponse.id !== demandeEnCours) {
    return;   // partie abandonnee ou coup annule entre-temps
  }
  const attente = Math.max(0, 380 - (performance.now() - debut));
  await new Promise(r => setTimeout(r, attente));
  if (reponse.id !== demandeEnCours) {
    return;
  }
  reflexion = false;
  const possibles = coupsLegaux(position);
  let coup = reponse.coup && possibles.find(k => memeCoup(k, reponse.coup));
  if (!coup) {
    // Ne devrait pas arriver : on prend un coup legal plutot que bloquer
    coup = possibles[0];
  }
  const prise = jouerAvecAnim(coup);
  jouerSon(prise !== 0 ? "impact" : "clic");
  aMoi = true;
  majEntete();
  if (verifierFin()) {
    return;
  }
  calculerLegaux();
  if (enEchec(position, SENTE)) {
    afficher("Échec ! Protège ton roi.");
    jouerSon("bonus");
  } else if (prise !== 0) {
    afficher("L'IA prend ton " + NOMS[typeDe(prise) > PROMU ? typeDe(prise) - PROMU : typeDe(prise)] + ". À toi.");
  } else {
    afficher("À toi.");
  }
}

function terminer(resultat) {
  terminee = true;
  reflexion = false;
  legaux = [];
  deselectionner();
  majEntete();
  if (niveau.deux) {
    // "victoire" : celui qui vient de jouer (en bas) a mate l'autre
    afficher(resultat === "nulle" ? "Sennichite : partie nulle."
      : "Échec et mat : Joueur " + (resultat === "victoire" ? joueurAuTrait : 3 - joueurAuTrait) + " gagne !");
    jouerSon(resultat === "nulle" ? "clic" : "vie");
    return;
  }
  if (niveau.ligne) {
    const r = resultat === "nulle" ? "nul" : resultat;
    afficher(r === "victoire" ? "Échec et mat, tu bats " + versus.adversaire + " !"
      : r === "defaite" ? "Échec et mat : " + versus.adversaire + " gagne." : "Sennichite : partie nulle.");
    jouerSon(r === "victoire" ? "vie" : r === "defaite" ? "mort" : "clic");
    versus.terminer(r, r === "nul" ? "sennichite" : "mat");
    return;
  }
  let score = 0;
  if (resultat === "victoire") {
    score = Math.min(100000, Math.max(1000, 10000 - 50 * coupsJoueur) * niveau.facteur);
    afficher("Échec et mat, tu gagnes en " + coupsJoueur + " coups ! " + score.toLocaleString("fr-BE") + " points.");
    jouerSon("vie");
  } else if (resultat === "defaite") {
    afficher("Échec et mat : l'IA gagne. Rejoue pour ta revanche.");
    jouerSon("mort");
  } else {
    afficher("Sennichite : la même position revient quatre fois, partie nulle.");
    jouerSon("clic");
  }
  majScoreCourant(idClassement(), score);
  setTimeout(() => {
    if (!zone.hidden && terminee && !tuto) {
      finDePartie(idClassement(), score, "Shōgi " + niveau.nom);
    }
  }, 2600);
}

// ---------------------------------------------------------------------
// Dessin : shogiban en kaya, pieces en buis, komadai
// ---------------------------------------------------------------------

let echelle = 1;
let fond = null;               // plateau et komadai peints une fois
let temps = 0;

function peindreFond() {
  const off = document.createElement("canvas");
  off.width = Math.round(W * echelle);
  off.height = Math.round(H * echelle);
  const g = off.getContext("2d");
  g.setTransform(echelle, 0, 0, echelle, 0, 0);
  const alea = creerAleatoire(40);

  // Les deux komadai : de petits plateaux en bois plus sombre
  [KOMADAI.haut, KOMADAI.bas].forEach(kd => {
    g.fillStyle = "rgba(0,0,0,0.35)";
    g.beginPath();
    g.roundRect(kd.x + 4, kd.y + 6, kd.w, kd.h, 10);
    g.fill();
    g.fillStyle = "#7d5222";
    g.beginPath();
    g.roundRect(kd.x, kd.y + 3, kd.w, kd.h, 10);
    g.fill();
    const bois = g.createLinearGradient(kd.x, kd.y, kd.x + kd.w, kd.y + kd.h);
    bois.addColorStop(0, "#c48a45");
    bois.addColorStop(1, "#a8702f");
    g.fillStyle = bois;
    g.beginPath();
    g.roundRect(kd.x, kd.y, kd.w, kd.h, 10);
    g.fill();
    // Le creux du plateau
    g.fillStyle = "rgba(60,35,10,0.18)";
    g.beginPath();
    g.roundRect(kd.x + 8, kd.y + 20, kd.w - 16, kd.h - 28, 6);
    g.fill();
    g.fillStyle = "rgba(255,255,255,0.12)";
    g.fillRect(kd.x + 10, kd.y + 1, kd.w - 20, 2);
  });

  // Le shogiban : flanc sombre, puis le dessus en kaya
  const x = BX - 10;
  const y = BY - 10;
  const cote = COTE + 20;
  g.fillStyle = "rgba(0,0,0,0.35)";
  g.beginPath();
  g.roundRect(x + 5, y + 9, cote, cote, 8);
  g.fill();
  g.fillStyle = "#9c6a2e";
  g.beginPath();
  g.roundRect(x, y + 4, cote, cote, 8);
  g.fill();
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
  let base = x + 20;
  for (let i = 0; i < 6; i++) {
    base += 40 + alea() * 66;
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

  // Quadrillage a l'encre et les quatre points
  g.strokeStyle = "#3a2612";
  for (let i = 0; i <= 9; i++) {
    g.lineWidth = i === 0 || i === 9 ? 2 : 1.1;
    g.beginPath();
    g.moveTo(BX, BY + i * CASE);
    g.lineTo(BX + COTE, BY + i * CASE);
    g.moveTo(BX + i * CASE, BY);
    g.lineTo(BX + i * CASE, BY + COTE);
    g.stroke();
  }
  g.fillStyle = "#3a2612";
  [[3, 3], [3, 6], [6, 3], [6, 6]].forEach(([a, b]) => {
    g.beginPath();
    g.arc(BX + b * CASE, BY + a * CASE, 3.2, 0, Math.PI * 2);
    g.fill();
  });
  return off;
}

// Une piece pentagonale en buis, avec son epaisseur
function piece(g, x, y, p, taille, transparente) {
  const t = typeDe(p);
  const base = t > PROMU ? t - PROMU : t;
  const h = taille * TAILLES[base];
  const w = h * 0.84;
  const gote = p < 0;
  const forme = () => {
    g.beginPath();
    g.moveTo(0, -h / 2);
    g.lineTo(w * 0.4, -h * 0.3);
    g.lineTo(w * 0.5, h / 2);
    g.lineTo(-w * 0.5, h / 2);
    g.lineTo(-w * 0.4, -h * 0.3);
    g.closePath();
  };
  g.save();
  g.globalAlpha = transparente ? 0.55 : 1;
  // Ombre portee et tranche, toujours vers le bas de l'ecran
  const ep = Math.max(2, h * 0.07);
  g.save();
  g.translate(x + 1.5, y + ep + 1.5);
  if (gote) {
    g.rotate(Math.PI);
  }
  g.fillStyle = "rgba(0,0,0,0.28)";
  forme();
  g.fill();
  g.restore();
  g.save();
  g.translate(x, y + ep);
  if (gote) {
    g.rotate(Math.PI);
  }
  g.fillStyle = "#a57a3e";
  forme();
  g.fill();
  g.restore();
  // Le dessus de la piece
  g.translate(x, y);
  if (gote) {
    g.rotate(Math.PI);
  }
  const buis = g.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
  buis.addColorStop(0, "#f6e2b4");
  buis.addColorStop(0.6, "#ecd29a");
  buis.addColorStop(1, "#d8b676");
  g.fillStyle = buis;
  forme();
  g.fill();
  g.strokeStyle = "rgba(95,62,24,0.85)";
  g.lineWidth = 1;
  g.stroke();
  // Arete eclairee sur les deux pans du haut
  g.strokeStyle = "rgba(255,250,235,0.7)";
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(-w * 0.36, -h * 0.28);
  g.lineTo(0, -h / 2 + 1.5);
  g.lineTo(w * 0.36, -h * 0.28);
  g.stroke();
  // Le kanji, rouge pour une piece promue
  let kanji = KANJI[t];
  if (t === ROI && gote) {
    kanji = "王";
  }
  const corps = h * (avecNoms ? 0.42 : 0.54);
  g.fillStyle = t > PROMU ? "#b3261e" : "#1d1410";
  g.font = "700 " + corps.toFixed(1) + "px " + POLICE_JP;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(kanji, 0, avecNoms ? -h * 0.07 : h * 0.07);
  g.restore();
  // L'aide en lettres, toujours a l'endroit, cote large de la piece
  if (avecNoms) {
    g.save();
    g.globalAlpha = transparente ? 0.55 : 1;
    g.font = "800 " + (h * 0.27).toFixed(1) + "px 'Anybody', sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = t > PROMU ? "#b3261e" : "#6a4520";
    g.fillText(LETTRES[t], x, y + (gote ? -h * 0.31 : h * 0.33));
    g.restore();
  }
}

function teinte(g, c, couleur) {
  g.fillStyle = couleur;
  g.fillRect(BX + (c % 9) * CASE + 1, BY + Math.floor(c / 9) * CASE + 1, CASE - 2, CASE - 2);
}

function dessiner() {
  if (fond === null) {
    return;
  }
  const g = contexte;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.drawImage(fond, 0, 0);
  g.setTransform(echelle, 0, 0, echelle, 0, 0);

  const etape = tuto && tuto.i >= 0 ? ETAPES[tuto.i] : null;

  // Zone de promotion, montree pendant l'etape qui en parle
  if (etape && etape.zone) {
    g.fillStyle = "rgba(200,55,45,0.10)";
    g.fillRect(BX + 1, BY + 1, COTE - 2, CASE * 3 - 2);
    g.strokeStyle = "rgba(200,55,45,0.7)";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(BX, BY + CASE * 3);
    g.lineTo(BX + COTE, BY + CASE * 3);
    g.stroke();
  }

  // Dernier coup : depart pale, arrivee vermillon
  if (dernier) {
    if (dernier.de >= 0) {
      teinte(g, dernier.de, "rgba(200,55,45,0.13)");
    }
    teinte(g, dernier.vers, "rgba(200,55,45,0.27)");
  }
  // Roi en echec
  [SENTE, GOTE].forEach(cote => {
    if (enEchec(position, cote)) {
      const r = caseDuRoi(position.plateau, cote);
      if (r >= 0) {
        teinte(g, r, "rgba(200,55,45,0.55)");
      }
    }
  });
  if (selection && selection.case !== undefined) {
    teinte(g, selection.case, "rgba(198,243,90,0.55)");
  }

  // Pieces sur le plateau
  for (let c = 0; c < CASES; c++) {
    const p = position.plateau[c];
    if (p === 0 || (anim && anim.vers === c)) {
      continue;
    }
    const { x, y } = centreCase(c);
    piece(g, x, y, p, CASE);
  }

  // Coups possibles : un point sur les cases vides, des coins sur les prises
  cibles.forEach(k => {
    if (choixPromo && k.vers !== choixPromo.vers) {
      return;
    }
    const { x, y } = centreCase(k.vers);
    g.fillStyle = "rgba(38,92,16,0.62)";
    if (position.plateau[k.vers] === 0) {
      g.beginPath();
      g.arc(x, y, 7, 0, Math.PI * 2);
      g.fill();
    } else {
      const d = CASE / 2 - 2;
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy]) => {
        g.beginPath();
        g.moveTo(x + sx * d, y + sy * d);
        g.lineTo(x + sx * (d - 13), y + sy * d);
        g.lineTo(x + sx * d, y + sy * (d - 13));
        g.closePath();
        g.fill();
      });
    }
  });

  // La piece qui glisse vers sa case
  if (anim) {
    const k = Math.min(1, anim.t / 0.16);
    const e = 1 - Math.pow(1 - k, 3);
    const arrivee = centreCase(anim.vers);
    const p = position.plateau[anim.vers];
    if (p !== 0) {
      piece(g, anim.x0 + (arrivee.x - anim.x0) * e, anim.y0 + (arrivee.y - anim.y0) * e - Math.sin(k * Math.PI) * 6, p, CASE);
    }
  }

  dessinerAides(g, etape);

  // Komadai : les pieces en reserve de chacun, avec leur nombre
  [[SENTE, KOMADAI.bas], [GOTE, KOMADAI.haut]].forEach(([cote, kd]) => {
    if (tuto && cote === GOTE) {
      return;   // la bulle du tuto prend sa place
    }
    const main = position.mains[cote === SENTE ? 0 : 1];
    const joue = !terminee && position.trait === cote && !tuto;
    g.font = "600 9px 'Martian Mono', monospace";
    g.textAlign = "left";
    g.textBaseline = "middle";
    g.fillStyle = joue ? "#e4ff9a" : "rgba(40,22,6,0.75)";
    const nomBas = niveau.deux ? "JOUEUR " + joueurAuTrait : "TA";
    const libelle = cote === SENTE ? (niveau.deux ? "RÉSERVE " + nomBas : "TA RÉSERVE") : "RÉSERVE " + (nomEnHaut === "L'IA" ? "DE L'IA" : nomEnHaut);
    const joueTexte = cote === SENTE ? "  ·  À TOI" : nomEnHaut === "L'IA" ? "  ·  L'IA JOUE" : "  ·  " + nomEnHaut + " JOUE";
    g.fillText(libelle + (joue ? joueTexte : ""), kd.x + 12, kd.y + 11);
    TYPES_MAIN.forEach(type => {
      const n = main[type];
      const { x, y } = centreCasier(type, cote);
      if (cote === SENTE && selection && selection.main === type) {
        g.fillStyle = "rgba(198,243,90,0.6)";
        g.beginPath();
        g.roundRect(x - LARGEUR_CASIER / 2 + 4, kd.y + 22, LARGEUR_CASIER - 8, kd.h - 28, 6);
        g.fill();
      }
      if (n <= 0) {
        return;
      }
      // Le glissement d'un parachutage : la piece a deja quitte la reserve
      piece(g, x, y, type * cote, 52);
      if (n > 1) {
        g.fillStyle = "#2a1c0e";
        g.beginPath();
        g.roundRect(x + 12, y + 10, 24, 17, 8);
        g.fill();
        g.fillStyle = "#f6efdc";
        g.font = "600 11px 'Martian Mono', monospace";
        g.textAlign = "center";
        g.fillText("×" + n, x + 24, y + 19);
      }
    });
  });

  // Curseur clavier ou manette
  if (peutJouer() && !choixPromo) {
    let x;
    let y;
    let d;
    if (curseur.r < 9) {
      ({ x, y } = centreCase(curseur.r * 9 + curseur.c));
      d = CASE / 2 - 1;
    } else {
      ({ x, y } = centreCasier(TYPES_MAIN[curseur.c], SENTE));
      y -= 4;
      d = LARGEUR_CASIER / 2 - 3;
    }
    [["#1a1a20", 5], ["#c6f35a", 2.5]].forEach(([couleur, epaisseur]) => {
      g.strokeStyle = couleur;
      g.lineWidth = epaisseur;
      g.beginPath();
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy]) => {
        g.moveTo(x + sx * d, y + sy * d * 0.45);
        g.lineTo(x + sx * d, y + sy * d);
        g.lineTo(x + sx * d * 0.45, y + sy * d);
      });
      g.stroke();
    });
  }

  if (choixPromo) {
    dessinerChoixPromo(g);
  }
  if (tuto) {
    dessinerBulle(g);
  }
}

// Le petit choix de promotion, pres de la case d'arrivee
let zonesPromo = [];

function dessinerChoixPromo(g) {
  const { x, y } = centreCase(choixPromo.vers);
  const w = 200;
  const h = 98;
  const bx = Math.max(10, Math.min(W - w - 10, x - w / 2));
  const by = y - CASE / 2 - h - 6 < 4 ? y + CASE / 2 + 6 : y - CASE / 2 - h - 6;
  g.fillStyle = "#f6efdc";
  g.strokeStyle = "#c8372d";
  g.lineWidth = 3;
  g.beginPath();
  g.roundRect(bx, by, w, h, 12);
  g.fill();
  g.stroke();
  zonesPromo = [];
  const pieceAvant = position.plateau[choixPromo.coups[0].de];
  [0, 1].forEach(k => {
    const cx = bx + 52 + k * 96;
    const actif = choixPromo.actif === k;
    if (actif) {
      g.fillStyle = "rgba(198,243,90,0.75)";
      g.beginPath();
      g.roundRect(cx - 44, by + 8, 88, h - 16, 8);
      g.fill();
    }
    piece(g, cx, by + 40, k ? pieceAvant + PROMU : pieceAvant, 50);
    g.font = "800 12px 'Anybody', sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = k ? "#b3261e" : "#5a4a3a";
    g.fillText(k ? "Promouvoir" : "Garder", cx, by + h - 16);
    zonesPromo.push({ zone: [cx - 44, by + 8, 88, h - 16], k });
  });
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
  g.roundRect(x, y, w, h, 8);
  g.fill();
  g.font = "800 13px 'Anybody', sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = principal ? "#ffffff" : "#5a4a3a";
  g.fillText(texte, x + w / 2, y + h / 2 + 1);
  boutonsTuto.push({ zone: [x, y, w, h], action, principal });
}

// La bulle du tuto, a la place du komadai de l'IA
function dessinerBulle(g) {
  boutonsTuto = [];
  const x = 8;
  const y = 3;
  const w = W - 16;
  const h = 98;
  g.fillStyle = "#f6efdc";
  g.beginPath();
  g.roundRect(x, y, w, h, 14);
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = "#c8372d";
  g.stroke();
  let titre;
  let texte;
  const choix = [];
  if (tuto.proposition) {
    titre = "Première visite";
    texte = "Le shogi, ce sont les échecs japonais : les pièces prises changent de camp et reviennent en jeu. Quelques minutes pour apprendre en jouant ?";
    choix.push(["Plus tard", false, () => { stockageTuto.ecrire({ vu: true }); quitterTuto(); }], ["Apprendre", true, lancerTuto]);
  } else if (tuto.fin) {
    titre = "Prêt !";
    texte = "Tu connais les règles. Commence en Facile, garde ton roi bien entouré d'or et d'argent, et n'hésite pas à annuler un coup. Le bouton Noms affiche des lettres sur les pièces.";
    choix.push(["Revoir", false, lancerTuto], ["Jouer", true, quitterTuto]);
  } else {
    const e = ETAPES[tuto.i];
    titre = (tuto.i + 1) + " / " + ETAPES.length + "  " + e.titre;
    texte = tuto.apres ? e.apres : tuto.message || e.texte;
    if (tuto.apres) {
      choix.push(["Suivant", true, etapeSuivante]);
    }
    choix.unshift(["Passer le tuto", false, quitterTuto]);
  }
  // Les boutons sur la ligne du titre, a droite
  let bx = x + w - 10;
  for (let k = choix.length - 1; k >= 0; k--) {
    const [t, principal, action] = choix[k];
    const bw = t.length > 10 ? 112 : 96;
    bx -= bw;
    boutonCanvas(g, t, bx, y + 8, bw, 26, principal, action);
    bx -= 8;
  }
  g.font = "800 15px 'Anybody', sans-serif";
  g.textAlign = "left";
  g.textBaseline = "middle";
  g.fillStyle = "#c8372d";
  g.fillText(titre.toUpperCase(), x + 14, y + 22);
  g.font = "600 14px 'Hanken Grotesk', sans-serif";
  g.fillStyle = "#2a2030";
  const lignes = lignesTexte(g, texte, w - 28).slice(0, 4);
  const pas = lignes.length > 3 ? 15.5 : 17;
  lignes.forEach((l, k) => {
    g.fillText(l, x + 14, y + 47 + k * pas);
  });
  if (tuto.bravo > 0) {
    g.font = "800 46px 'Anybody', sans-serif";
    g.textAlign = "center";
    g.lineWidth = 6;
    g.strokeStyle = "#0a2010";
    g.strokeText("Bravo !", W / 2, BY + COTE / 2);
    g.fillStyle = "#c6f35a";
    g.fillText("Bravo !", W / 2, BY + COTE / 2);
  }
}

// Pendant le tuto : la piece a toucher clignote doucement, cases cibles
function dessinerAides(g, etape) {
  if (!etape || tuto.apres || tuto.bravo > 0 || !legaux.length) {
    return;
  }
  const p = Math.sin(temps * 6);
  g.strokeStyle = "#c8372d";
  g.lineWidth = 3;
  if (!selection) {
    let x;
    let y;
    if (etape.depuis !== undefined) {
      ({ x, y } = centreCase(etape.depuis));
    } else {
      ({ x, y } = centreCasier(etape.main, SENTE));
    }
    g.beginPath();
    g.roundRect(x - CASE / 2 + 2 - p, y - CASE / 2 + 2 - p, CASE - 4 + 2 * p, CASE - 4 + 2 * p, 6);
    g.stroke();
  } else if (etape.cibles) {
    etape.cibles.forEach(c => {
      const { x, y } = centreCase(c);
      g.beginPath();
      g.roundRect(x - CASE / 2 + 2 - p, y - CASE / 2 + 2 - p, CASE - 4 + 2 * p, CASE - 4 + 2 * p, 6);
      g.stroke();
    });
  }
}

let prochainAjustement = 0;

const boucle = creerBoucle(function (dt) {
  temps += dt;
  // La manette peut apparaitre apres le demarrage : on revoit la taille
  if (temps > prochainAjustement) {
    prochainAjustement = temps + 0.5;
    ajuster();
  }
  if (anim) {
    anim.t += dt;
    if (anim.t > 0.2) {
      anim = null;
    }
  }
  if (tuto && tuto.bravo > 0) {
    tuto.bravo -= dt;
    if (tuto.bravo <= 0) {
      etapeSuivante();
    }
  }
  dessiner();
}, { plafond: 1 / 20 });

function ajuster() {
  const marge = window.innerWidth >= 1100 ? 500 : 0;
  const largeur = Math.min(window.innerWidth * 0.96 - marge, 620);
  const autres = ["entete-shogi", "scores-ligne", "versus", "jeu-message"].reduce((somme, classe) => {
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

function pointLogique(evenement) {
  const r = canvas.getBoundingClientRect();
  return { x: (evenement.clientX - r.left) * (W / r.width), y: (evenement.clientY - r.top) * (H / r.height) };
}

function dansZone(z, x, y) {
  return x >= z[0] && x <= z[0] + z[2] && y >= z[1] && y <= z[1] + z[3];
}

// Ce qui se trouve sous un point : une case, un casier du komadai, ou rien
function cibleSous(x, y) {
  const cx = Math.floor((x - BX) / CASE);
  const cy = Math.floor((y - BY) / CASE);
  if (cx >= 0 && cx < 9 && cy >= 0 && cy < 9) {
    return { r: cy, c: cx };
  }
  const kd = KOMADAI.bas;
  if (y >= kd.y && y <= kd.y + kd.h && x >= kd.x && x < kd.x + kd.w) {
    return { r: 9, c: Math.floor((x - kd.x) / LARGEUR_CASIER) };
  }
  return null;
}

function activer(cible) {
  if (cible.r < 9) {
    activerCase(cible.r * 9 + cible.c);
  } else {
    activerMain(TYPES_MAIN[cible.c]);
  }
}

canvas.addEventListener("click", function (evenement) {
  const { x, y } = pointLogique(evenement);
  if (choixPromo) {
    const z = zonesPromo.find(zp => dansZone(zp.zone, x, y));
    if (z) {
      choisirPromotion(z.k === 1);
    } else {
      choixPromo = null;
    }
    return;
  }
  if (tuto) {
    const b = boutonsTuto.find(bt => dansZone(bt.zone, x, y));
    if (b) {
      jouerSon("clic");
      b.action();
      return;
    }
  }
  const cible = cibleSous(x, y);
  if (cible) {
    curseur = cible;
    activer(cible);
  } else {
    deselectionner();
  }
});

canvas.addEventListener("contextmenu", evenement => evenement.preventDefault());

function deplacerCurseur(dr, dc) {
  if (curseur.r === 9) {
    if (dr < 0) {
      curseur = { r: 8, c: Math.min(8, Math.round((curseur.c + 0.5) * 9 / 7 - 0.5)) };
    } else {
      curseur = { r: 9, c: Math.max(0, Math.min(6, curseur.c + dc)) };
    }
    return;
  }
  if (curseur.r === 8 && dr > 0) {
    curseur = { r: 9, c: Math.min(6, Math.round((curseur.c + 0.5) * 7 / 9 - 0.5)) };
    return;
  }
  curseur = { r: Math.max(0, Math.min(8, curseur.r + dr)), c: Math.max(0, Math.min(8, curseur.c + dc)) };
}

surTouche(ID, function (evenement) {
  const touche = evenement.key.toLowerCase();
  const gauche = touche === "arrowleft" || touche === "q";
  const droite = touche === "arrowright" || touche === "d";
  const valider = touche === " " || touche === "enter";
  if (choixPromo) {
    if (gauche || droite) {
      choixPromo.actif = 1 - choixPromo.actif;
    } else if (valider) {
      choisirPromotion(choixPromo.actif === 1);
    } else if (touche === "u" || touche === "backspace" || touche === "escape") {
      choixPromo = null;
    } else {
      return;
    }
    evenement.preventDefault();
    return;
  }
  if (gauche) {
    deplacerCurseur(0, -1);
  } else if (droite) {
    deplacerCurseur(0, 1);
  } else if (touche === "arrowup" || touche === "z") {
    deplacerCurseur(-1, 0);
  } else if (touche === "arrowdown" || touche === "s") {
    deplacerCurseur(1, 0);
  } else if (valider && tuto && boutonsTuto.some(b => b.principal)) {
    boutonsTuto.find(b => b.principal).action();
  } else if (valider) {
    activer(curseur);
  } else if (touche === "u" || touche === "backspace") {
    // B : lache d'abord la piece choisie, sinon annule le dernier coup
    if (selection) {
      deselectionner();
    } else {
      annuler();
    }
  } else if (touche === "l") {
    basculerNoms();
  } else if (touche === "n" && tuto && tuto.i >= 0) {
    preparerEtape();
  } else if (touche === "t" && tuto) {
    quitterTuto();
  } else if (touche === "n") {
    demarrer();
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
});

function majBoutonSon() {
  boutonSon.textContent = sonActif() ? "Son" : "Muet";
}

function majBoutonNoms() {
  boutonNoms.setAttribute("aria-pressed", avecNoms ? "true" : "false");
}

function basculerNoms() {
  avecNoms = !avecNoms;
  stockageNoms.ecrireTexte(avecNoms ? "1" : "0");
  majBoutonNoms();
}

creerBoutonsChoix(zoneNiveaux, CHOIX, function (choix) {
  if (niveau.ligne && !choix.ligne && versus.ouvert) {
    versus.fermer();   // demande confirmation si une partie est en cours
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

document.getElementById("tutoShogi").addEventListener("click", lancerTuto);
boutonAnnuler.addEventListener("click", annuler);
boutonNoms.addEventListener("click", basculerNoms);
boutonSon.addEventListener("click", () => { basculerSon(); majBoutonSon(); });
document.getElementById("nouvelleShogi").addEventListener("click", demarrer);
document.getElementById("quitterShogi").addEventListener("click", quitterJeu);

// Pour les tests automatiques
export const _test = {
  get tuto() { return tuto; },
  get position() { return position; },
  get legaux() { return legaux; },
  get aMoi() { return aMoi && !reflexion; },
  get terminee() { return terminee; },
  get boutons() { return boutonsTuto; },
  get choixPromo() { return choixPromo; },
  ETAPES, lancerTuto, activerCase, activerMain, choisirPromotion, jouerCoupJoueur, centreCase, centreCasier,
  W, H
};

enregistrerJeu({
  id: ID,
  nom: "Shōgi",
  code: "40",
  section: zone,
  demarrer() {
    if (niveau.ligne && versus.ouvert) {
      // Retour dans le jeu pendant une partie en ligne : on la retrouve
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
  classement: () => "shogi-" + (niveau.deux || niveau.ligne ? "facile" : niveau.id),
  manette: { a: " ", b: "u", start: "n", libelles: { a: "Choisir", b: "Annuler" }, quatreDirections: true }
});
