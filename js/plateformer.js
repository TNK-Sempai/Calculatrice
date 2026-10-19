// =====================================================================
//  TANUKILAND
//  Un plateformer en mondes et niveaux, dont tout l'univers vient du
//  folklore japonais : un tanuki, des yokai, des statues de Jizo et des
//  torii vermillon.
//
//  Le moteur ne connait que des comportements generiques, rampant,
//  carapace, volant, tombeur. C'est la table d'apparences de chaque
//  monde qui dit a quoi ils ressemblent : un monde futur reutilisera
//  les memes comportements avec d'autres creatures sans toucher ici.
//
//  Le panneau F2 reste accessible pour regler le saut en direct. Il
//  n'est pas annonce dans l'aide : c'est un outil de mise au point.
// =====================================================================

import {
  enregistrerJeu, quitterJeu, finDePartie, majScoreCourant
} from "./arcade.js";
import { creerBoucle } from "./noyau/boucle.js";
import { surTouche, surRelachement, jeuAuPremierPlan } from "./noyau/clavier.js";
import { creerChrono } from "./noyau/chrono.js";
import { creerCamera } from "./noyau/camera.js";
import {
  accelererVers, appliquerGravite, deplacerAvecCollision, surLeSol
} from "./noyau/physique.js";
import {
  verifierNiveau, verifierProgression, preparerNiveau,
  PROPRIETES, VIDE, PLEIN, TRAVERSABLE, CAISSE,
  PIEU, FEUILLE, EAU, JIZO, TORII, BAMBOU
} from "./niveaux/format.js";
import { MONDES } from "./niveaux/index.js";
import {
  sprites, VERMILLON, VERMILLON_SOMBRE, LIME, LIME_SOMBRE
} from "./tanukiland/sprites.js";
import {
  creerYokai, animerYokai, seTouchent, ecraser, contactLateral, imageDuYokai
} from "./tanukiland/yokai.js";
import {
  creerPlateforme, animerPlateforme, reposeSur, EPAISSEUR_PLANCHE,
  creerTuilesToit, animerTuile, appuieSurTuile,
  creerOmikuji, ouvrirOmikuji
} from "./tanukiland/objets.js";
import { creerPartie } from "./tanukiland/partie.js";
import {
  dessinerFond, dessinerTuile, viderCacheTuiles, dessinerSurfaceEau,
  dessinerFeuille, dessinerCaisse, dessinerJizo, dessinerTuileToit,
  dessinerOmikuji, dessinerPlanche, dessinerTanuki, dessinerYokai as peindreYokai,
  creerEffets, dessinerTete, dessinerCarte, texteContour
} from "./tanukiland/rendu.js";

// Le nom du jeu n'est ecrit qu'ici : le menu, le tableau des scores et
// le classement le reprennent tous de cette constante.
export const NOM_DU_JEU = "Tanukiland";
const ID_DU_JEU = "tanukiland";
const CODE_SECRET = "826854";   // TANUKI sur un clavier de telephone

const zoneJeu = document.getElementById("jeuPlateformer");
const canvasPlateformer = document.getElementById("canvasPlateformer");
const zoneReglages = document.getElementById("reglagesPlateformer");
const zoneMessagePlateformer = document.getElementById("messagePlateformer");
const boutonQuitterPlateformer = document.getElementById("quitterPlateformer");
const zoneVies = document.getElementById("viesTanukiland");
const zoneFeuilles = document.getElementById("feuillesTanukiland");
const zoneScore = document.getElementById("scoreTanukiland");
const zoneTemps = document.getElementById("tempsTanukiland");
const zoneEtiquette = document.getElementById("niveauTanukiland");
const zoneTactile = document.getElementById("tactilesTanukiland");
const zoneIndicateurTest = document.getElementById("testTanukiland");

const LARGEUR_VUE = canvasPlateformer.width;    // 640
const HAUTEUR_VUE = canvasPlateformer.height;   // 384

// Vitesse de chute maximale. Elle n'est pas reglable : elle ne sert qu'a
// empecher des vitesses absurdes apres une longue chute, pas a donner du
// caractere au saut.
const VITESSE_CHUTE_MAX = 900;

// Rebond apres avoir ecrase un yokai, invincibilite clignotante apres
// avoir perdu le chapeau, et les deux temps morts du jeu.
const REBOND = 220;
const INVINCIBILITE = 1.5;

// Apres un ecrasement, le tanuki rebondit mais reste un court instant
// dans le yokai ecrase ou contre son voisin. Sans ce repit, le contact
// de l'image suivante le tuerait.
const GRACE_ECRASEMENT = 0.1;

// Tolerance du test d'ecrasement, en pixels. Au debut de l'image, le bas
// du tanuki doit etre au-dessus du haut du yokai, a cela pres. Six
// pixels laissent passer un yokai qui monte au-devant du tanuki, et
// restent loin des douze pixels d'une carapace prise de cote.
const TOLERANCE_ECRASEMENT = 6;
const DELAI_MORT = 1.2;
const DELAI_SORTIE = 1.6;

// ---------------------------------------------------------------------
// Reglages du saut et de la course
//
// Ordres de grandeur. Les valeurs de saut sont celles du saut en course
// de Super Mario Bros sur NES, converties a 60 images par seconde. La
// conversion est directe parce que la tuile y fait deja 16 px : une
// vitesse de 1 px par image vaut 60 px/s, une acceleration de 1 px par
// image au carre vaut 3600 px/s carre.
//   - impulsion : 5 px par image en course, soit 300 px/s.
//   - gravite pendant la montee, touche tenue : 5/32 px par image au
//     carre, soit 562,5, arrondi a 563.
//   - gravite de descente : 9/16 px par image au carre, soit 2025.
// La hauteur maximale en decoule : 300 au carre divise par deux fois
// 563, soit 80 px, exactement cinq tuiles. Integree a pas fini, elle
// vaut 77,4 px : c'est cette valeur-la que le controle de faisabilite
// des niveaux utilise, pas les 80 theoriques.
//
// L'horizontal s'en ecarte volontairement. Super Mario Bros glisse
// beaucoup, ce qui demande une habitude que nous ne voulons pas exiger :
// la vitesse est ramenee a 150 px/s, avec une acceleration de 600 et une
// deceleration de 900, donc un demarrage en 0,25 s et un arret en 0,17 s.
// Le controle en l'air reste haut, 0,8, pour que le saut se rattrape.
//
// Coyote time et memoire de saut viennent de Celeste, qui garde le saut
// disponible 5 images apres le vide et memorise un appui pendant 0,1 s :
// 83 ms et 100 ms, d'ou nos 90 et 110.
//
// La hauteur variable ne demande aucune constante de plus. La gravite
// montante s'applique tant que la touche est tenue et que le corps
// monte ; des que la touche est relachee ou que la chute commence, on
// passe a la gravite descendante. La vitesse n'est jamais coupee, ce
// qui evite l'a-coup visible des implementations qui tronquent vy.
// ---------------------------------------------------------------------

const REGLAGES = [
  { cle: "graviteMontante", nom: "Gravite montante", min: 200, max: 2000, pas: 1, defaut: 563 },
  { cle: "graviteDescendante", nom: "Gravite descendante", min: 500, max: 5000, pas: 5, defaut: 2025 },
  { cle: "impulsionSaut", nom: "Impulsion de saut", min: 100, max: 700, pas: 5, defaut: 300 },
  { cle: "vitesseMax", nom: "Vitesse maximale", min: 50, max: 400, pas: 5, defaut: 150 },
  { cle: "accelerationSol", nom: "Acceleration au sol", min: 100, max: 3000, pas: 10, defaut: 600 },
  { cle: "decelerationSol", nom: "Deceleration au sol", min: 100, max: 4000, pas: 10, defaut: 900 },
  { cle: "controleEnAir", nom: "Controle en l'air", min: 0, max: 1, pas: 0.05, defaut: 0.8 },
  { cle: "coyoteMs", nom: "Coyote time (ms)", min: 0, max: 250, pas: 5, defaut: 90 },
  { cle: "memoireSautMs", nom: "Memoire de saut (ms)", min: 0, max: 300, pas: 5, defaut: 110 }
];

export const reglages = {};
REGLAGES.forEach(r => { reglages[r.cle] = r.defaut; });

// ---------------------------------------------------------------------
// Etat
// ---------------------------------------------------------------------

let dessins = null;         // sprites compiles, au premier demarrage
let niveau = null;
let apparences = {};
let camera = null;
const partie = creerPartie();

let yokais = [];
let planches = [];
let boites = [];
let tuilesToit = [];
let blocsEntites = new Map();

// La boite de collision est plus etroite que le dessin : un personnage
// aux epaules larges accroche partout.
const corps = { x: 0, y: 0, largeur: 12, hauteur: 22, vx: 0, vy: 0 };

let auSol = false;
let depuisLeSol = 0;          // secondes depuis le dernier contact, pour le coyote
let depuisLaDemande = 0;      // secondes depuis le dernier appui, pour la memoire
let sautTenu = false;
let regardeAGauche = false;
let chronoMarche = 0;
let piedsAuDebut = 0;         // ordonnee des pieds au debut de l'image

// L'ecrasement se juge sur l'image precedente. piedsAuDebut ne peut pas
// servir : il est reecrit par chaque deplacement de yokai, et vaudrait
// donc les pieds du dernier yokai anime. Ces trois-la ne changent
// qu'une fois par image, pour le tanuki.
let basDuTanukiAvant = 0;     // bas du corps au tout debut de l'image
let vyAvantCollision = 0;     // vitesse verticale avant que la collision l'annule
let graceEcrasement = 0;      // courte invulnerabilite apres un ecrasement
let chapeau = false;
let invincible = 0;
let controle = null;          // dernier Jizo active, ou null
let enPause = false;
let transition = null;        // { type, reste }
let majTenue = false;         // touche Maj, ou bouton tactile Prendre
let carapacePortee = null;    // la carapace que le tanuki tient devant lui
const touches = { gauche: false, droite: false };

// Rendu net : le canvas suit la taille reelle de l'ecran
let echelle = 1;
let temps = 0;
const effets = creerEffets();
let ecrasement = 0;          // etirement / ecrasement du tanuki
let etaitAuSol = true;
let carte = null;            // carte du monde affichee entre les niveaux

// ---------------------------------------------------------------------
// Outils de test, section Test du panneau F2
//
// Ils servent a parcourir les niveaux pour juger le jeu sans avoir a le
// reussir. Des qu'un seul a servi, la partie ne compte plus : aucun
// score n'est enregistre, ni localement ni en ligne, et un indicateur
// reste a l'ecran pour qu'on ne puisse pas s'y tromper.
// ---------------------------------------------------------------------

const OUTILS = [
  { cle: "invincible", nom: "Invincibilite" },
  { cle: "viesInfinies", nom: "Vies infinies" },
  { cle: "zones", nom: "Zones de collision" }
];

const outils = {};
OUTILS.forEach(outil => { outils[outil.cle] = false; });

let partieDeTest = false;     // vrai des qu'un outil a servi dans cette partie
let dernierSolSur = null;     // dernier endroit ou le tanuki a pose le pied

// ---------------------------------------------------------------------
// Decor
// ---------------------------------------------------------------------

// bloque() est la seule chose que le noyau sait du decor. Le sens du
// deplacement lui permet de laisser passer une plateforme traversable
// sans que la physique ait a connaitre cette notion.
//
// piedsAuDebut est renseigne juste avant chaque deplacement, pour le
// corps qui bouge : c'est ce qui permet de franchir une planche par le
// dessous et de se poser dessus par le dessus.
function bloque(x, y, largeur, hauteur, axe, sens) {
  const tuile = niveau.tuile;
  const colonneGauche = Math.floor(x / tuile);
  const colonneDroite = Math.floor((x + largeur - 0.001) / tuile);
  const rangeeHaute = Math.floor(y / tuile);
  const rangeeBasse = Math.floor((y + hauteur - 0.001) / tuile);

  for (let rangee = rangeeHaute; rangee <= rangeeBasse; rangee++) {
    for (let colonne = colonneGauche; colonne <= colonneDroite; colonne++) {
      const nature = niveau.natureEn(colonne, rangee);
      const propriete = PROPRIETES[nature] || {};
      if (propriete.solide) {
        return true;
      }
      if (blocsEntites.has(colonne + "," + rangee)) {
        return true;
      }
      // Une plateforme ne porte que si l'on descend et que l'on etait
      // deja au-dessus d'elle au debut de l'image.
      if (propriete.porte && axe === "vertical" && sens > 0) {
        if (piedsAuDebut <= rangee * tuile + 0.5) {
          return true;
        }
      }
    }
  }

  // Les planches mobiles ne sont pas dans la grille : elles portent
  // selon exactement la meme regle.
  if (axe === "vertical" && sens > 0) {
    for (const planche of planches) {
      if (x + largeur > planche.x && x < planche.x + planche.largeur
        && y + hauteur > planche.y && y < planche.y + planche.hauteur
        && piedsAuDebut <= planche.y + 0.5) {
        return true;
      }
    }
  }
  return false;
}

// Deplace un corps en tenant a jour la regle des plateformes.
function deplacer(unCorps, dx, dy) {
  piedsAuDebut = unCorps.y + unCorps.hauteur;
  return deplacerAvecCollision(unCorps, dx, dy, bloque, { pasMax: niveau.tuile / 2 });
}

// Y a-t-il de quoi poser le pied juste devant ? Sert aux yokai a faire
// demi-tour au bord du vide.
function solDevant(unCorps, sens) {
  const x = sens > 0 ? unCorps.x + unCorps.largeur + 1 : unCorps.x - 2;
  const y = unCorps.y + unCorps.hauteur + 1;
  piedsAuDebut = unCorps.y + unCorps.hauteur;
  return bloque(x, y, 1, 2, "vertical", 1);
}

// ---------------------------------------------------------------------
// Chargement d'un niveau
// ---------------------------------------------------------------------

function chargerNiveau(indexMonde, indexNiveau) {
  const monde = MONDES[indexMonde];
  if (monde === undefined || monde.niveaux[indexNiveau] === undefined) {
    zoneMessagePlateformer.textContent = "Niveau introuvable.";
    return false;
  }
  const donnees = monde.niveaux[indexNiveau];
  const fautes = verifierNiveau(donnees).concat(verifierProgression(donnees));
  if (fautes.length > 0) {
    // Un niveau casse est refuse : le dessiner a moitie couterait bien
    // plus cher a comprendre qu'un message clair.
    zoneMessagePlateformer.textContent = "Niveau refuse : " + fautes[0];
    return false;
  }

  niveau = preparerNiveau(donnees);
  apparences = monde.apparences;
  effets.vider();
  camera = creerCamera({ largeurVue: LARGEUR_VUE, hauteurVue: HAUTEUR_VUE });
  camera.definirMonde(niveau.largeur, niveau.hauteur);
  controle = null;
  partie.demarrerNiveau();
  installerLeNiveau();
  return true;
}

// Remet le decor changeant et les creatures a leur etat d'origine. Une
// mort ne doit pas laisser derriere elle des caisses cassees.
function installerLeNiveau() {
  niveau.reinitialiser();
  yokais = niveau.entites.filter(e => e.type === "yokai")
    .map(e => creerYokai(e, niveau.tuile));
  planches = niveau.entites.filter(e => e.type === "plateforme")
    .map(e => creerPlateforme(e, niveau.tuile));
  boites = niveau.entites.filter(e => e.type === "omikuji")
    .map(e => creerOmikuji(e, niveau.tuile));
  tuilesToit = creerTuilesToit(niveau);

  // Les boites bouchent leur tuile : bloque() les retrouve en O(1)
  blocsEntites = new Map();
  boites.forEach(boite => {
    blocsEntites.set(boite.colonne + "," + boite.rangee, boite);
  });

  replacerLeTanuki();
}

// Pose le tanuki sur une tuile, par les pieds. Il est plus haut qu'une
// tuile : le poser par le coin haut l'enfoncerait dans le sol.
function replacerLeTanuki() {
  carapacePortee = null;
  const place = controle === null ? niveau.depart : controle;
  corps.x = place.colonne * niveau.tuile + (niveau.tuile - corps.largeur) / 2;
  corps.y = (place.ligne + 1) * niveau.tuile - corps.hauteur;
  corps.vx = 0;
  corps.vy = 0;
  auSol = false;
  depuisLeSol = 999;
  depuisLaDemande = 999;
  sautTenu = false;
  invincible = 0;
  camera.centrerSur(corps.x, corps.y);
}

// ---------------------------------------------------------------------
// Vie et mort
// ---------------------------------------------------------------------

function subirUnCoup() {
  if (outils.invincible || invincible > 0 || transition !== null) {
    return;
  }
  // Touche, il lache ce qu'il portait, chapeau ou non
  lacherLaCarapace();
  if (chapeau) {
    // Le chapeau de paille encaisse le coup a la place du tanuki
    chapeau = false;
    invincible = INVINCIBILITE;
    afficher("Le chapeau s'envole.");
    return;
  }
  mourir();
}

function mourir() {
  if (transition !== null) {
    return;
  }
  lacherLaCarapace();
  chapeau = false;
  corps.vx = 0;
  corps.vy = 0;
  // Vies infinies : on meurt et on repart, mais le compteur ne bouge pas
  const fini = outils.viesInfinies ? false : partie.perdreUneVie();
  majAffichage();
  transition = { type: fini ? "gameover" : "mort", reste: DELAI_MORT };
  afficher(fini ? "Game over." : "Perdu.");
}

function reprendreApresLaMort() {
  // Le chrono repart a sa valeur de depart, pas a ce qu'il restait
  partie.demarrerNiveau();
  installerLeNiveau();
  afficher(controle === null ? "" : "Reprise au Jizo.");
  majAffichage();
}

function terminerLaPartie() {
  partie.sauvegarder();
  if (partieDeTest) {
    // Une partie jouee avec un outil de test n'entre nulle part, ni dans
    // le tableau local ni dans le classement en ligne.
    afficher("Mode test : score non enregistre.");
    partie.recommencer();
    controle = null;
    chapeau = false;
    lacherLaCarapace();
    dernierSolSur = null;
    return;
  }
  finDePartie(ID_DU_JEU, partie.score, NOM_DU_JEU);
  // Tout repart de zero : niveau 1-1, trois vies, aucun score, aucune
  // feuille, pas de chapeau, et la sauvegarde effacee.
  partie.recommencer();
  controle = null;
  chapeau = false;
  lacherLaCarapace();
  dernierSolSur = null;
}

function atteindreLeTorii() {
  if (transition !== null) {
    return;
  }
  const gagne = partie.terminerNiveau();
  majAffichage();
  annoncerLeScore();
  transition = { type: "niveau", reste: DELAI_SORTIE };
  afficher("Torii franchi. Temps converti : " + gagne + " points.");
}

function niveauSuivant() {
  const monde = MONDES[partie.monde];
  const suivant = partie.niveau + 1;
  if (suivant >= monde.niveaux.length) {
    if (partie.monde + 1 < MONDES.length) {
      // Monde suivant : la partie continue, score et vies gardes
      partie.monde++;
      partie.niveau = 0;
      partie.sauvegarder();
      chargerNiveau(partie.monde, 0);
      majAffichage();
      remplirLeChoixDeNiveau();
      ouvrirCarte();
      return;
    }
    // Dernier monde termine : la partie s'arrete sur son score
    afficher("Tous les mondes sont termines.");
    terminerLaPartie();
    chargerNiveau(partie.monde, 0);
    majAffichage();
    ouvrirCarte();
    return;
  }
  partie.niveau = suivant;
  partie.sauvegarder();
  chargerNiveau(partie.monde, suivant);
  majAffichage();
  remplirLeChoixDeNiveau();
  afficher("");
  ouvrirCarte();
}

// ---------------------------------------------------------------------
// Contacts avec le decor
// ---------------------------------------------------------------------

// Parcourt les tuiles que le corps recouvre et applique ce qu'elles
// font : ramasser, blesser, activer, sortir.
function lireLesTuiles() {
  const tuile = niveau.tuile;
  const colonneGauche = Math.floor((corps.x + 2) / tuile);
  const colonneDroite = Math.floor((corps.x + corps.largeur - 3) / tuile);
  const rangeeHaute = Math.floor((corps.y + 2) / tuile);
  const rangeeBasse = Math.floor((corps.y + corps.hauteur - 3) / tuile);

  for (let rangee = rangeeHaute; rangee <= rangeeBasse; rangee++) {
    for (let colonne = colonneGauche; colonne <= colonneDroite; colonne++) {
      const propriete = PROPRIETES[niveau.natureEn(colonne, rangee)] || {};

      if (propriete.ramassable) {
        niveau.definirNature(colonne, rangee, VIDE);
        effets.eclats(colonne * tuile + 8, rangee * tuile + 8, ["#9fd44a", "#c6f35a", "#f1ead2"], 7);
        effets.texte(colonne * tuile + 8, rangee * tuile, "+1", "#c6f35a");
        if (partie.ramasserFeuille()) {
          afficher("Cent feuilles : une vie de plus.");
        }
        majAffichage();
        annoncerLeScore();
      } else if (propriete.mortel) {
        if (outils.invincible) {
          continue;
        }
        // Un pieu est un coup comme un autre : le chapeau l'encaisse.
        // L'eau noie, et rien ne protege de la noyade.
        if (propriete.fatal) {
          mourir();
        } else {
          subirUnCoup();
        }
        return;
      } else if (propriete.controle && controle === null) {
        controle = { colonne, ligne: rangee };
        afficher("Jizo eveille. Point de controle.");
      } else if (propriete.sortie) {
        atteindreLeTorii();
        return;
      }
    }
  }
}

// Ce qui se trouve juste au-dessus de la tete quand on s'y cogne.
function frapperAuDessus() {
  const tuile = niveau.tuile;
  const rangee = Math.floor((corps.y - 2) / tuile);
  const colonneGauche = Math.floor((corps.x + 2) / tuile);
  const colonneDroite = Math.floor((corps.x + corps.largeur - 3) / tuile);

  for (let colonne = colonneGauche; colonne <= colonneDroite; colonne++) {
    const boite = blocsEntites.get(colonne + "," + rangee);
    if (boite !== undefined) {
      const contenu = ouvrirOmikuji(boite);
      if (contenu) {
        effets.eclats(boite.x + 8, boite.y, ["#f1e4c8", "#c8372d"], 8);
        effets.texte(boite.x + 8, boite.y - 6, contenu === "chapeau" ? "Chapeau !" : "+1", "#ffe38a");
      }
      if (contenu === "feuille") {
        partie.ramasserFeuille();
        afficher("Une feuille.");
      } else if (contenu === "chapeau") {
        chapeau = true;
        afficher("Le chapeau de paille.");
      }
      majAffichage();
      annoncerLeScore();
      continue;
    }
    if (niveau.natureEn(colonne, rangee) === CAISSE) {
      niveau.definirNature(colonne, rangee, VIDE);
      effets.eclats(colonne * tuile + 8, rangee * tuile + 8, ["#b07a40", "#8a5a2c", "#5a3a1e"], 12);
    }
  }
}

// ---------------------------------------------------------------------
// La carapace ramassee
//
// Maj enfoncee au contact d'une carapace immobile : le tanuki la prend
// et la porte devant lui. Il court et saute avec. Au relachement, elle
// part droit devant et redevient une carapace propulsee.
// ---------------------------------------------------------------------

function prendreLaCarapace(yokai) {
  carapacePortee = yokai;
  yokai.etat = "portee";
  yokai.vx = 0;
  yokai.vy = 0;
  afficher("Carapace en main. Relache Maj pour la lancer.");
}

// Place la carapace devant le tanuki et regarde ce qu'elle touche.
function porterLaCarapace() {
  if (carapacePortee === null) {
    return;
  }
  const carapace = carapacePortee;
  carapace.x = regardeAGauche
    ? corps.x - carapace.largeur + 3
    : corps.x + corps.largeur - 3;
  carapace.y = corps.y + 2;
  carapace.vx = 0;
  carapace.vy = 0;

  for (const autre of yokais) {
    if (autre === carapace || !autre.vivant) {
      continue;
    }
    if (seTouchent(carapace, autre)) {
      // Elle emporte le yokai et disparait avec lui
      autre.vivant = false;
      carapace.vivant = false;
      effets.eclats(autre.x + autre.largeur / 2, autre.y + autre.hauteur / 2, ["#f1ead2", "#e0574b", "#7fb23a"], 12);
      carapacePortee = null;
      partie.eliminerYokai();
      majAffichage();
      annoncerLeScore();
      afficher("La carapace emporte le yokai.");
      return;
    }
  }
}

function lancerLaCarapacePortee() {
  if (carapacePortee === null) {
    return;
  }
  const carapace = carapacePortee;
  carapacePortee = null;
  carapace.etat = "lancee";
  carapace.vx = regardeAGauche
    ? -carapace.reglages.vitesseLancee
    : carapace.reglages.vitesseLancee;
  // Un pas devant, et un court repit : sans cela elle toucherait le
  // tanuki a l'image meme ou il la lache.
  carapace.x = regardeAGauche
    ? corps.x - carapace.largeur - 2
    : corps.x + corps.largeur + 2;
  graceEcrasement = GRACE_ECRASEMENT;
  afficher("");
}

// Touche en la portant, le tanuki la lache : elle retombe a ses pieds.
function lacherLaCarapace() {
  if (carapacePortee === null) {
    return;
  }
  const carapace = carapacePortee;
  carapacePortee = null;
  carapace.etat = "immobile";
  carapace.vx = 0;
  carapace.vy = 0;
  carapace.y = corps.y + corps.hauteur - carapace.hauteur;
}

// ---------------------------------------------------------------------
// Contacts avec les yokai
// ---------------------------------------------------------------------

// L'ecrasement se decide sur les positions du debut de l'image, jamais
// sur celles d'apres le deplacement. Avec une gravite descendante de
// 2025, le tanuki entre de quatre a neuf pixels dans un yokai en une
// seule image : mesuree apres coup, cette interpenetration ne se
// distingue plus d'un choc lateral. Les positions d'avant, elles,
// restent nettes.
function lireLesYokai(delta) {
  for (const yokai of yokais) {
    if (yokai === carapacePortee || !yokai.vivant || !seTouchent(corps, yokai)) {
      continue;
    }
    const depuisLaGauche = corps.x + corps.largeur / 2 < yokai.x + yokai.largeur / 2;

    // Maj enfoncee sur une carapace immobile : on la ramasse au lieu de
    // la pousser du pied.
    if (majTenue && carapacePortee === null
      && yokai.comportement === "carapace" && yokai.etat === "immobile") {
      prendreLaCarapace(yokai);
      continue;
    }

    // Vitesse verticale reelle du yokai sur cette image, mesuree et non
    // lue dans vy : un volant se deplace par sa sinusoide, sans jamais
    // toucher a sa vitesse.
    const vyDuYokai = delta > 0 ? (yokai.y - yokai.hautAvant) / delta : 0;
    const venaitDuDessus = basDuTanukiAvant <= yokai.hautAvant + TOLERANCE_ECRASEMENT;
    const descendVersLui = vyAvantCollision - vyDuYokai > 0;

    if (venaitDuDessus && descendVersLui) {
      const effet = ecraser(yokai, depuisLaGauche);
      effets.poussiere(yokai.x + yokai.largeur / 2, yokai.y + yokai.hauteur, 7, "rgba(240,230,255,0.9)");
      if (effet.elimine) {
        effets.texte(yokai.x + yokai.largeur / 2, yokai.y - 4, "+100", "#ffffff");
      }
      corps.vy = -REBOND;
      // Le repit vaut pour les deux yokai cote a cote : celui d'a cote
      // est ecrase a la meme image, et c'est l'image suivante qui
      // aurait tue le tanuki.
      graceEcrasement = GRACE_ECRASEMENT;
      if (effet.elimine) {
        partie.eliminerYokai();
        majAffichage();
        annoncerLeScore();
      }
      continue;
    }

    if (graceEcrasement > 0) {
      continue;
    }
    if (contactLateral(yokai, depuisLaGauche) === "blesse") {
      subirUnCoup();
      return;
    }
  }
}

// ---------------------------------------------------------------------
// Boucle
// ---------------------------------------------------------------------

function enCoursDeJeu() {
  return niveau !== null && !enPause && transition === null && carte === null
    && jeuAuPremierPlan(ID_DU_JEU);
}

const bouclePlateformer = creerBoucle(function (delta) {
  if (niveau === null) {
    return;
  }
  temps += delta;
  effets.maj(delta);
  ecrasement *= Math.pow(0.0005, delta);
  if (carte !== null) {
    carte.temps += delta;
    dessiner();
    return;
  }
  if (!jeuAuPremierPlan(ID_DU_JEU)) {
    dessiner();
    return;
  }

  if (transition !== null) {
    transition.reste -= delta;
    if (transition.reste <= 0) {
      const type = transition.type;
      transition = null;
      if (type === "mort") {
        reprendreApresLaMort();
      } else if (type === "gameover") {
        terminerLaPartie();
        chargerNiveau(partie.monde, 0);
        majAffichage();
      } else {
        niveauSuivant();
      }
    }
    dessiner();
    return;
  }
  if (enPause) {
    dessiner();
    return;
  }

  if (invincible > 0) {
    invincible -= delta;
  }
  if (graceEcrasement > 0) {
    graceEcrasement -= delta;
  }

  // Instantane du debut de l'image, avant que quoi que ce soit ne bouge.
  // C'est sur lui que se decide l'ecrasement : a 2025 de gravite le
  // tanuki entre de plusieurs pixels dans un yokai en une seule image,
  // et les positions d'apres le deplacement ne veulent plus rien dire.
  basDuTanukiAvant = corps.y + corps.hauteur;
  yokais.forEach(yokai => { yokai.hautAvant = yokai.y; });

  // Les planches bougent avant le tanuki et emportent celui qui se tient
  // dessus : sans cela il glisserait d'une image a l'autre.
  const portePar = planches.find(planche => reposeSur(corps, planche)) || null;
  planches.forEach(planche => animerPlateforme(planche, delta));
  if (portePar !== null) {
    corps.x += portePar.dx;
    corps.y += portePar.dy;
  }

  piedsAuDebut = corps.y + corps.hauteur;
  auSol = surLeSol(corps, bloque);
  depuisLeSol = auSol ? 0 : depuisLeSol + delta;
  depuisLaDemande += delta;

  // Coyote time et memoire de saut : le saut part si le sol est assez
  // recent et l'appui assez recent, meme si les deux n'ont jamais ete
  // simultanes.
  const solEncoreValable = depuisLeSol <= reglages.coyoteMs / 1000;
  const appuiEncoreValable = depuisLaDemande <= reglages.memoireSautMs / 1000;
  if (solEncoreValable && appuiEncoreValable) {
    corps.vy = -reglages.impulsionSaut;
    ecrasement = -0.22;
    effets.poussiere(corps.x + corps.largeur / 2, corps.y + corps.hauteur, 4);
    depuisLeSol = 999;
    depuisLaDemande = 999;
    auSol = false;
  }

  // Course : on vise une vitesse, on y va a vitesse bornee. Au sol, on
  // accelere ou on freine selon qu'une direction est demandee ; en l'air
  // les deux sont attenues.
  const direction = (touches.droite ? 1 : 0) - (touches.gauche ? 1 : 0);
  const cible = direction * reglages.vitesseMax;
  let acceleration = direction !== 0 ? reglages.accelerationSol : reglages.decelerationSol;
  if (!auSol) {
    acceleration *= reglages.controleEnAir;
  }
  corps.vx = accelererVers(corps.vx, cible, acceleration, delta);
  if (direction !== 0) {
    regardeAGauche = direction < 0;
  }

  // Hauteur de saut variable : tant que la touche est tenue et que l'on
  // monte, la gravite est la plus faible des deux.
  const gravite = corps.vy < 0 && sautTenu
    ? reglages.graviteMontante
    : reglages.graviteDescendante;
  appliquerGravite(corps, gravite, VITESSE_CHUTE_MAX, delta);

  // La collision remet la vitesse a zero en posant le tanuki : on garde
  // celle qui a servi au deplacement, seule utilisable pour juger d'un
  // ecrasement.
  vyAvantCollision = corps.vy;
  piedsAuDebut = corps.y + corps.hauteur;
  const contact = deplacerAvecCollision(corps, corps.vx * delta, corps.vy * delta,
    bloque, { pasMax: niveau.tuile / 2 });
  if (contact.tete) {
    frapperAuDessus();
  }
  // Dernier endroit sur : un pieu et l'eau ne portent pas, seul un vrai
  // sol met contact.sol a vrai.
  if (contact.sol) {
    dernierSolSur = { x: corps.x, y: corps.y };
  }

  // Tombe hors du niveau : un trou est mortel. Invincible, le tanuki est
  // repose au dernier sol qu'il a touche, pour continuer a explorer.
  if (corps.y > niveau.hauteur) {
    if (outils.invincible && dernierSolSur !== null) {
      corps.x = dernierSolSur.x;
      corps.y = dernierSolSur.y;
      corps.vx = 0;
      corps.vy = 0;
      camera.centrerSur(corps.x, corps.y);
    } else {
      mourir();
    }
    dessiner();
    return;
  }

  porterLaCarapace();

  tuilesToit.forEach(tuileToit => {
    animerTuile(tuileToit, niveau, delta,
      appuieSurTuile(corps, tuileToit, niveau.tuile));
  });

  const contexte = { delta, deplacer, solDevant, joueur: corps, yokais };
  yokais.forEach(yokai => animerYokai(yokai, contexte));

  lireLesTuiles();
  if (transition === null) {
    lireLesYokai(delta);
  }

  chronoMarche += Math.abs(corps.vx) * delta;
  const surSol = surLeSol(corps, bloque);
  if (surSol && !etaitAuSol && vyAvantCollision > 220) {
    ecrasement = Math.min(0.3, vyAvantCollision / 1800);
    effets.poussiere(corps.x + corps.largeur / 2, corps.y + corps.hauteur, 6);
  }
  if (surSol && Math.abs(corps.vx) > reglages.vitesseMax * 0.85 && Math.random() < delta * 10) {
    effets.poussiere(corps.x + corps.largeur / 2 - Math.sign(corps.vx) * 6, corps.y + corps.hauteur, 1);
  }
  etaitAuSol = surSol;
  camera.suivre(corps.x + corps.largeur / 2, corps.y + corps.hauteur / 2);
  dessiner();
}, { plafond: 0.05 });

// Le chrono du niveau. Il ne compte que quand on joue vraiment : ni en
// pause, ni pendant une transition, ni quand un overlay est ouvert.
const chronoNiveau = creerChrono(function () {
  partie.tempsRestant--;
  majAffichage();
  if (partie.tempsRestant <= 0) {
    mourir();
  }
}, enCoursDeJeu);

// ---------------------------------------------------------------------
// Dessin
// ---------------------------------------------------------------------

function poseDuTanuki() {
  if (transition !== null && (transition.type === "mort" || transition.type === "gameover")) {
    return "chute";
  }
  if (!auSol) {
    return corps.vy < 0 ? "saut" : "chute";
  }
  return Math.abs(corps.vx) < 5 ? "repos" : "course";
}

// Le canvas suit la place disponible et la densite de l'ecran
function ajuster() {
  const marge = window.innerWidth >= 1100 ? 500 : 0;
  const largeurDispo = Math.min(window.innerWidth * 0.96 - marge, 1100);
  const entete = zoneJeu.querySelector(".entete-tanukiland");
  const hautEntete = entete ? entete.getBoundingClientRect().height : 40;
  const manette = document.querySelector(".manette:not([hidden])");
  const hautManette = manette ? manette.getBoundingClientRect().height : 0;
  const hauteurDispo = Math.max(200, window.innerHeight - hautEntete - hautManette - 70);
  const taille = Math.min(largeurDispo / LARGEUR_VUE, hauteurDispo / HAUTEUR_VUE);
  canvasPlateformer.style.width = Math.floor(LARGEUR_VUE * taille) + "px";
  canvasPlateformer.style.height = Math.floor(HAUTEUR_VUE * taille) + "px";
  const nouvelle = Math.min(3, Math.max(1, taille * (window.devicePixelRatio || 1)));
  if (Math.abs(nouvelle - echelle) > 0.02 || canvasPlateformer.width !== Math.round(LARGEUR_VUE * nouvelle)) {
    echelle = nouvelle;
    canvasPlateformer.width = Math.round(LARGEUR_VUE * echelle);
    canvasPlateformer.height = Math.round(HAUTEUR_VUE * echelle);
    viderCacheTuiles(echelle);
  }
}

window.addEventListener("resize", function () {
  if (!zoneJeu.hidden) {
    ajuster();
  }
});

function ouvrirCarte() {
  const monde = MONDES[partie.monde];
  carte = {
    monde: partie.monde,
    niveau: partie.niveau,
    niveaux: monde.niveaux,
    nomMonde: monde.nom,
    temps: 0,
    chapeau
  };
}

function fermerCarte() {
  if (carte === null || carte.temps < 0.35) {
    return;
  }
  carte = null;
  depuisLaDemande = 999;
  afficher("");
}

function dessiner() {
  const c = canvasPlateformer.getContext("2d");
  c.setTransform(echelle, 0, 0, echelle, 0, 0);
  if (niveau === null) {
    c.fillStyle = "#0e0e0e";
    c.fillRect(0, 0, LARGEUR_VUE, HAUTEUR_VUE);
    return;
  }
  if (carte !== null) {
    dessinerCarte(c, LARGEUR_VUE, HAUTEUR_VUE, Object.assign({}, carte, {
      invite: ("ontouchstart" in window ? "Touche l'ecran" : "Espace") + " pour commencer"
    }));
    return;
  }
  const camX = Math.round(camera.x * echelle) / echelle;
  const camY = Math.round(camera.y * echelle) / echelle;
  dessinerFond(c, partie.monde, camX, camY, LARGEUR_VUE, HAUTEUR_VUE, temps);

  // Tuiles visibles du decor fixe
  const tuile = niveau.tuile;
  const c0 = Math.max(0, Math.floor(camX / tuile) - 1);
  const c1 = Math.min(niveau.colonnes - 1, Math.ceil((camX + LARGEUR_VUE) / tuile) + 1);
  const r0 = Math.max(0, Math.floor(camY / tuile) - 1);
  const r1 = Math.min(niveau.rangees - 1, Math.ceil((camY + HAUTEUR_VUE) / tuile) + 1);
  for (let r = r0; r <= r1; r++) {
    for (let col = c0; col <= c1; col++) {
      dessinerTuile(c, niveau, partie.monde, col, r, col * tuile - camX, r * tuile - camY);
    }
  }

  dessinerDecorAnime(c, camX, camY, c0, c1, r0, r1);
  planches.forEach(planche => dessinerPlanche(c, planche.x - camX, planche.y - camY, planche.largeur, partie.monde));
  yokais.forEach(yokai => {
    if (yokai.vivant && yokai !== carapacePortee) {
      peindreYokai(c, apparences[yokai.comportement], yokai, camX, camY, temps);
    }
  });
  dessinerLeTanuki(c, camX, camY);
  effets.dessiner(c, camX, camY);
  if (outils.zones) {
    dessinerLesZones(c);
  }
  dessinerTete(c, LARGEUR_VUE, {
    vies: Math.max(0, partie.vies),
    feuilles: partie.feuilles,
    score: partie.score,
    temps: Math.max(0, partie.tempsRestant),
    etiquette: partie.etiquette()
  });
  if (enPause) {
    c.fillStyle = "rgba(10,8,20,0.55)";
    c.fillRect(0, 0, LARGEUR_VUE, HAUTEUR_VUE);
    texteContour(c, "PAUSE", LARGEUR_VUE / 2, HAUTEUR_VUE / 2, 32, "#ffffff", "center");
  } else if (transition !== null) {
    const titre = transition.type === "niveau" ? "TORII FRANCHI !"
      : transition.type === "gameover" ? "GAME OVER" : "AÏE !";
    texteContour(c, titre, LARGEUR_VUE / 2, HAUTEUR_VUE / 2 - 20, 30,
      transition.type === "niveau" ? "#c6f35a" : "#ff8a7a", "center");
  }
}

// Le contour des boites de collision, celle du tanuki et celle de chaque
// yokai.
function dessinerLesZones(contexte) {
  contexte.lineWidth = 1;
  contexte.strokeStyle = LIME;
  yokais.forEach(yokai => {
    if (!yokai.vivant) {
      return;
    }
    contexte.strokeRect(Math.round(yokai.x - camera.x) + 0.5,
      Math.round(yokai.y - camera.y) + 0.5, yokai.largeur - 1, yokai.hauteur - 1);
  });
  contexte.strokeStyle = VERMILLON;
  contexte.strokeRect(Math.round(corps.x - camera.x) + 0.5,
    Math.round(corps.y - camera.y) + 0.5, corps.largeur - 1, corps.hauteur - 1);
}

// Les tuiles qui changent en cours de partie, dessinees seulement dans
// le champ de la camera.
function dessinerDecorAnime(c, camX, camY, c0, c1, r0, r1) {
  const tuile = niveau.tuile;
  for (let rangee = r0; rangee <= r1; rangee++) {
    for (let colonne = c0; colonne <= c1; colonne++) {
      const nature = niveau.natureEn(colonne, rangee);
      const x = colonne * tuile - camX;
      const y = rangee * tuile - camY;
      if (nature === FEUILLE) {
        dessinerFeuille(c, x, y, temps, colonne);
      } else if (nature === CAISSE) {
        dessinerCaisse(c, x, y);
      } else if (nature === JIZO) {
        dessinerJizo(c, x, y + tuile, controle !== null, temps);
      } else if (nature === EAU && niveau.natureDorigine(colonne, rangee - 1) !== EAU) {
        dessinerSurfaceEau(c, x, y, tuile, temps);
      }
    }
  }

  // Les tuiles de toit ont leur propre position : elles tombent
  porterLaCarapace();

  tuilesToit.forEach(tuileToit => {
    if (tuileToit.etat === "absente") {
      return;
    }
    dessinerTuileToit(c, tuileToit.x - camX, tuileToit.y - camY);
  });

  boites.forEach(boite => {
    dessinerOmikuji(c, boite.x - camX, boite.y - camY, boite.utilisee, temps);
  });
}

function dessinerLeTanuki(c, camX, camY) {
  // Invincible : il clignote, une image sur deux
  if (invincible > 0 && Math.floor(invincible * 12) % 2 === 0) {
    return;
  }
  const mort = transition !== null && (transition.type === "mort" || transition.type === "gameover");
  dessinerTanuki(c, corps.x + corps.largeur / 2 - camX, corps.y + corps.hauteur - camY, {
    pose: poseDuTanuki(),
    phase: chronoMarche / 9,
    temps,
    gauche: regardeAGauche,
    squash: ecrasement,
    chapeau,
    mort
  });
  if (carapacePortee !== null) {
    peindreYokai(c, apparences[carapacePortee.comportement], carapacePortee, camX, camY, temps);
  }
}

// ---------------------------------------------------------------------
// Affichage
// ---------------------------------------------------------------------

function afficher(texte) {
  zoneMessagePlateformer.textContent = texte;
}

// Le rang en direct n'a de sens que pour une partie qui compte. En mode
// test, le panneau garde sa derniere valeur reelle plutot que d'afficher
// un classement obtenu avec l'invincibilite.
function annoncerLeScore() {
  if (partieDeTest) {
    return;
  }
  majScoreCourant(ID_DU_JEU, partie.score);
}

// Un outil vient de servir : cette partie ne comptera pas.
function marquerPartieDeTest() {
  partieDeTest = true;
  majIndicateurTest();
}

function unOutilEstActif() {
  return OUTILS.some(outil => outils[outil.cle] === true);
}

function majIndicateurTest() {
  if (zoneIndicateurTest === null) {
    return;
  }
  // L'indicateur reste visible tant qu'un outil est actif, et aussi
  // apres l'avoir eteint tant que la partie court : le score ne compte
  // toujours pas, le dire est plus honnete que de le taire.
  zoneIndicateurTest.hidden = !(unOutilEstActif() || partieDeTest);
}

function majAffichage() {
  zoneVies.textContent = String(Math.max(0, partie.vies));
  zoneFeuilles.textContent = String(partie.feuilles);
  zoneScore.textContent = String(partie.score);
  zoneTemps.textContent = String(Math.max(0, partie.tempsRestant));
  zoneEtiquette.textContent = partie.etiquette();
}

// ---------------------------------------------------------------------
// Partie
// ---------------------------------------------------------------------

function demarrerTanukiland() {
  if (dessins === null) {
    dessins = sprites();
  }
  partie.charger();
  touches.gauche = false;
  touches.droite = false;
  sautTenu = false;
  enPause = false;
  transition = null;
  chapeau = false;
  graceEcrasement = 0;
  dernierSolSur = null;
  majTenue = false;
  carapacePortee = null;
  // Une nouvelle partie repart propre, sauf si un outil est reste actif
  partieDeTest = unOutilEstActif();
  majIndicateurTest();

  if (!chargerNiveau(partie.monde, partie.niveau)) {
    return;
  }
  majAffichage();
  annoncerLeScore();
  afficher("");
  montrerLesCommandesTactiles();
  ajuster();
  requestAnimationFrame(ajuster);
  ouvrirCarte();
  bouclePlateformer.lancer();
  chronoNiveau.lancer();
}

function arreterTanukiland() {
  bouclePlateformer.arreter();
  chronoNiveau.arreter();
  partie.sauvegarder();
}

function basculerPause() {
  if (transition !== null) {
    return;
  }
  enPause = !enPause;
  afficher(enPause ? "Pause. P ou Echap pour reprendre." : "");
}

// ---------------------------------------------------------------------
// Commandes
// ---------------------------------------------------------------------

function estToucheSaut(touche) {
  return touche === " " || touche === "arrowup" || touche === "z" || touche === "w";
}

function demanderUnSaut() {
  depuisLaDemande = 0;
  sautTenu = true;
}

surTouche(ID_DU_JEU, function (evenement) {
  const touche = evenement.key.toLowerCase();

  if (touche === "escape" || touche === "p") {
    basculerPause();
  } else if (touche === "f2") {
    basculerPanneau();
  } else if (touche === "arrowleft" || touche === "q" || touche === "a") {
    touches.gauche = true;
  } else if (touche === "arrowright" || touche === "d") {
    touches.droite = true;
  } else if (estToucheSaut(touche) || (carte !== null && touche === "enter")) {
    if (carte !== null) {
      if (!evenement.repeat) {
        fermerCarte();
      }
      evenement.preventDefault();
      return;
    }
    if (!evenement.repeat) {
      demanderUnSaut();
    }
    sautTenu = true;
  } else if (touche === "shift") {
    majTenue = true;
  } else {
    return;
  }
  evenement.preventDefault();
});

// Sans garde : une touche maintenue au moment de quitter doit etre oubliee
surRelachement(function (evenement) {
  const touche = evenement.key.toLowerCase();
  if (touche === "arrowleft" || touche === "q" || touche === "a") {
    touches.gauche = false;
  } else if (touche === "arrowright" || touche === "d") {
    touches.droite = false;
  } else if (estToucheSaut(touche)) {
    sautTenu = false;
  } else if (touche === "shift") {
    majTenue = false;
    // Relacher Maj lance ce qu'on portait. Sans carapace en main, il n'y
    // a rien a faire, y compris si l'on a quitte le jeu entre-temps.
    lancerLaCarapacePortee();
  }
});

boutonQuitterPlateformer.addEventListener("click", quitterJeu);

// Une touche sur l'ecran ferme la carte du monde
canvasPlateformer.addEventListener("pointerdown", function () {
  if (carte !== null) {
    fermerCarte();
  }
});

// ---------------------------------------------------------------------
// Commandes tactiles
// ---------------------------------------------------------------------

// Trois boutons, seulement sur un ecran tactile. Le bouton de saut se
// maintient comme la touche du clavier : c'est ce qui rend la hauteur
// variable accessible au pouce.
function brancherBoutonTactile(element, appui, relache) {
  if (element === null) {
    return;
  }
  const presser = evenement => {
    evenement.preventDefault();
    appui();
  };
  const relacher = evenement => {
    evenement.preventDefault();
    relache();
  };
  element.addEventListener("pointerdown", presser);
  element.addEventListener("pointerup", relacher);
  element.addEventListener("pointercancel", relacher);
  element.addEventListener("pointerleave", relacher);
  element.addEventListener("contextmenu", evenement => evenement.preventDefault());
}

function montrerLesCommandesTactiles() {
  if (zoneTactile === null) {
    return;
  }
  // La manette commune de l'arcade remplace les anciens boutons
  zoneTactile.hidden = true;
}

brancherBoutonTactile(document.getElementById("tactileGauche"),
  () => { touches.gauche = true; }, () => { touches.gauche = false; });
brancherBoutonTactile(document.getElementById("tactileDroite"),
  () => { touches.droite = true; }, () => { touches.droite = false; });
brancherBoutonTactile(document.getElementById("tactileSaut"),
  demanderUnSaut, () => { sautTenu = false; });
// Le bouton Prendre tient le role de Maj : maintenu, il ramasse et
// porte ; relache, il lance.
brancherBoutonTactile(document.getElementById("tactilePrendre"),
  () => { majTenue = true; },
  () => { majTenue = false; lancerLaCarapacePortee(); });

// ---------------------------------------------------------------------
// Panneau de reglage
// ---------------------------------------------------------------------

const curseurs = {};

function construirePanneau() {
  zoneReglages.innerHTML = "";

  const titre = document.createElement("span");
  titre.className = "tetris-label";
  titre.textContent = "Reglages du saut - F2";
  zoneReglages.appendChild(titre);

  REGLAGES.forEach(reglage => {
    const ligne = document.createElement("label");
    ligne.className = "reglage";

    const nom = document.createElement("span");
    nom.className = "reglage-nom";
    nom.textContent = reglage.nom;

    const valeur = document.createElement("span");
    valeur.className = "reglage-valeur";
    valeur.textContent = String(reglages[reglage.cle]);

    const curseur = document.createElement("input");
    curseur.type = "range";
    curseur.min = String(reglage.min);
    curseur.max = String(reglage.max);
    curseur.step = String(reglage.pas);
    curseur.value = String(reglages[reglage.cle]);
    curseur.addEventListener("input", function () {
      // Le reglage prend effet tout de suite, sans relancer la partie
      reglages[reglage.cle] = Number(curseur.value);
      valeur.textContent = curseur.value;
    });

    curseurs[reglage.cle] = { curseur, valeur };
    ligne.append(nom, valeur, curseur);
    zoneReglages.appendChild(ligne);
  });

  const boutons = document.createElement("div");
  boutons.className = "scores-ligne";

  const copier = document.createElement("button");
  copier.type = "button";
  copier.className = "jeu-quitter";
  copier.textContent = "Copier les valeurs";
  copier.addEventListener("click", copierReglages);

  const defaut = document.createElement("button");
  defaut.type = "button";
  defaut.className = "jeu-quitter";
  defaut.textContent = "Valeurs par defaut";
  defaut.addEventListener("click", retablirDefauts);

  boutons.append(copier, defaut);
  zoneReglages.appendChild(boutons);

  const sortie = document.createElement("textarea");
  sortie.className = "reglage-sortie";
  sortie.id = "sortieReglages";
  sortie.readOnly = true;
  sortie.hidden = true;
  zoneReglages.appendChild(sortie);

  construireLaSectionTest();
}

// ---------------------------------------------------------------------
// Section Test du panneau
// ---------------------------------------------------------------------

function construireLaSectionTest() {
  const titre = document.createElement("span");
  titre.className = "tetris-label reglage-section";
  titre.textContent = "Test";
  zoneReglages.appendChild(titre);

  OUTILS.forEach(outil => {
    const ligne = document.createElement("label");
    ligne.className = "reglage-case";

    const case_ = document.createElement("input");
    case_.type = "checkbox";
    case_.id = "outil" + outil.cle;
    case_.checked = outils[outil.cle];
    case_.addEventListener("change", function () {
      outils[outil.cle] = case_.checked;
      if (case_.checked) {
        marquerPartieDeTest();
      }
      majIndicateurTest();
    });

    const nom = document.createElement("span");
    nom.textContent = outil.nom;

    ligne.append(case_, nom);
    zoneReglages.appendChild(ligne);
  });

  const ligneNiveau = document.createElement("label");
  ligneNiveau.className = "reglage-case reglage-choix";

  const etiquette = document.createElement("span");
  etiquette.textContent = "Niveau";

  const choix = document.createElement("select");
  choix.id = "choixNiveau";
  choix.addEventListener("change", function () {
    allerAuNiveau(Number(choix.value));
  });

  ligneNiveau.append(etiquette, choix);
  zoneReglages.appendChild(ligneNiveau);
  remplirLeChoixDeNiveau();
}

// La liste vient du registre : ajouter un niveau la remplit toute seule.
function remplirLeChoixDeNiveau() {
  const choix = document.getElementById("choixNiveau");
  if (choix === null) {
    return;
  }
  const monde = MONDES[partie.monde];
  choix.innerHTML = "";
  monde.niveaux.forEach((donnees, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = (partie.monde + 1) + "-" + (index + 1) + " " + donnees.nom;
    choix.appendChild(option);
  });
  choix.value = String(partie.niveau);
}

// Choisir son niveau est aussi un outil de test : la partie ne compte
// plus, on n'a pas franchi ce qui menait la.
function allerAuNiveau(index) {
  if (MONDES[partie.monde].niveaux[index] === undefined) {
    return;
  }
  marquerPartieDeTest();
  partie.niveau = index;
  transition = null;
  enPause = false;
  graceEcrasement = 0;
  dernierSolSur = null;
  chargerNiveau(partie.monde, index);
  majAffichage();
  afficher("");
}

function basculerPanneau() {
  if (zoneReglages.childElementCount === 0) {
    construirePanneau();
  }
  zoneReglages.hidden = !zoneReglages.hidden;
}

// Les valeurs, au format d'un objet JavaScript, pretes a etre recopiees
// telles quelles dans REGLAGES une fois le reglage trouve.
function texteDesReglages() {
  const lignes = REGLAGES.map(reglage => "  " + reglage.cle + ": " + reglages[reglage.cle]);
  return "{\n" + lignes.join(",\n") + "\n}";
}

function copierReglages() {
  const texte = texteDesReglages();
  const sortie = document.getElementById("sortieReglages");

  if (navigator.clipboard !== undefined) {
    navigator.clipboard.writeText(texte).then(function () {
      afficher("Valeurs copiees dans le presse-papiers.");
    }, function () {
      montrerLeTexte(sortie, texte);
    });
    return;
  }
  montrerLeTexte(sortie, texte);
}

// Repli quand le presse-papiers est refuse : on montre le texte, a
// selectionner a la main.
function montrerLeTexte(sortie, texte) {
  sortie.hidden = false;
  sortie.value = texte;
  sortie.select();
  afficher("Presse-papiers indisponible : le texte est selectionne.");
}

function retablirDefauts() {
  REGLAGES.forEach(reglage => {
    reglages[reglage.cle] = reglage.defaut;
    const paire = curseurs[reglage.cle];
    if (paire !== undefined) {
      paire.curseur.value = String(reglage.defaut);
      paire.valeur.textContent = String(reglage.defaut);
    }
  });
  afficher("Valeurs par defaut retablies.");
}

// ---------------------------------------------------------------------
// Entree dans l'arcade
// ---------------------------------------------------------------------

enregistrerJeu({
  id: ID_DU_JEU,
  nom: NOM_DU_JEU,
  code: CODE_SECRET,
  section: zoneJeu,
  demarrer: demarrerTanukiland,
  arreter: arreterTanukiland,
  manette: { a: " ", b: "Shift", start: "p", libelles: { a: "Saut", b: "Prendre" } }
});
