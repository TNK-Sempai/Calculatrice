// =====================================================================
//  TANUKILAND - comportements des yokai
//  Quatre comportements, nommes par ce qu'ils font et non par la
//  creature qui les porte : rampant, carapace, volant, tombeur. Un
//  monde futur pourra donner un autre yokai au meme comportement sans
//  qu'une ligne d'ici change.
//
//  Ce module ne connait pas le decor. Il ne sait que ce que le contexte
//  lui donne : avancer un corps, savoir s'il y a du sol devant, ou est
//  le tanuki. C'est ce qui permet de le tester sur des positions
//  construites a la main, sans niveau.
// =====================================================================

export const GRAVITE = 900;
export const CHUTE_MAX = 700;

// Reglages par comportement. Un niveau peut les surcharger entite par
// entite, avec les memes noms.
const DEFAUTS = {
  rampant: {
    largeur: 20, hauteur: 20, vitesse: 40,
    saut: 150, periodeSaut: 0.9
  },
  carapace: {
    largeur: 20, hauteur: 22, vitesse: 45,
    vitesseLancee: 320, hauteurCarapace: 12
  },
  volant: {
    largeur: 22, hauteur: 18, vitesse: 55,
    amplitude: 28, periode: 2.2, portee: 5
  },
  tombeur: {
    largeur: 20, hauteur: 16, vitesse: 40,
    declenchement: 26
  }
};

export function reglagesDe(comportement) {
  return DEFAUTS[comportement];
}

// ---------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------

// entite : { type: "yokai", comportement, colonne, ligne, ...reglages }
export function creerYokai(entite, tuile) {
  const defauts = DEFAUTS[entite.comportement];
  const reglages = Object.assign({}, defauts, entite);
  const yokai = {
    comportement: entite.comportement,
    reglages,
    largeur: reglages.largeur,
    hauteur: reglages.hauteur,
    vx: 0,
    vy: 0,
    vivant: true,
    etat: "marche",
    sol: false,
    chrono: 0,
    animation: 0,
    versLaGauche: true
  };

  // Le yokai est pose au fond de sa tuile, centre dessus. Un volant et
  // un tombeur n'ont pas de sol : ils prennent le haut de leur tuile.
  yokai.x = entite.colonne * tuile + (tuile - yokai.largeur) / 2;
  if (entite.comportement === "volant" || entite.comportement === "tombeur") {
    yokai.y = entite.ligne * tuile;
  } else {
    yokai.y = (entite.ligne + 1) * tuile - yokai.hauteur;
  }

  yokai.xDepart = yokai.x;
  yokai.yDepart = yokai.y;

  if (entite.comportement === "volant") {
    yokai.vx = -reglages.vitesse;
  } else if (entite.comportement === "tombeur") {
    yokai.etat = "suspendu";
  } else {
    yokai.vx = -reglages.vitesse;
  }
  return yokai;
}

// ---------------------------------------------------------------------
// Animation
// ---------------------------------------------------------------------

// contexte : { delta, deplacer(corps, dx, dy), solDevant(corps, sens),
//              joueur, yokais }
export function animerYokai(yokai, contexte) {
  if (!yokai.vivant) {
    return;
  }
  yokai.chrono += contexte.delta;
  yokai.animation += Math.abs(yokai.vx) * contexte.delta;
  if (yokai.vx !== 0) {
    yokai.versLaGauche = yokai.vx < 0;
  }

  if (yokai.comportement === "volant") {
    animerVolant(yokai, contexte);
    return;
  }
  if (yokai.comportement === "tombeur") {
    animerTombeur(yokai, contexte);
    return;
  }
  if (yokai.comportement === "carapace") {
    animerCarapace(yokai, contexte);
    return;
  }
  animerRampant(yokai, contexte);
}

// Avance au sol, fait demi-tour contre un mur et au bord du vide.
function marcherAuSol(yokai, contexte, avecSaut) {
  yokai.vy += GRAVITE * contexte.delta;
  if (yokai.vy > CHUTE_MAX) {
    yokai.vy = CHUTE_MAX;
  }

  // Le sautillement du kasa-obake : il ne quitte le sol que d'un rien,
  // assez pour se voir, pas assez pour franchir quoi que ce soit.
  if (avecSaut && yokai.sol && yokai.chrono >= yokai.reglages.periodeSaut) {
    yokai.chrono = 0;
    yokai.vy = -yokai.reglages.saut;
  }

  // La collision annule la vitesse du corps qu'elle arrete. Un yokai ne
  // veut pas s'arreter, il veut se retourner : on garde donc la vitesse
  // voulue avant le deplacement, et on la relit apres.
  const vxVoulu = yokai.vx;
  const contact = contexte.deplacer(yokai, vxVoulu * contexte.delta,
    yokai.vy * contexte.delta);
  yokai.vx = vxVoulu;
  yokai.sol = contact.sol;
  if (contact.sol || contact.tete) {
    yokai.vy = 0;
  }
  if (vxVoulu === 0) {
    return;
  }
  if (contact.mur) {
    yokai.vx = -vxVoulu;
  } else if (yokai.sol && !contexte.solDevant(yokai, Math.sign(vxVoulu))) {
    // Bord du vide : demi-tour plutot que chute
    yokai.vx = -vxVoulu;
  }
}

function animerRampant(yokai, contexte) {
  marcherAuSol(yokai, contexte, true);
}

function animerCarapace(yokai, contexte) {
  // Portee par le tanuki, la carapace n'obeit plus a la physique : c'est
  // le jeu qui la place, image apres image.
  if (yokai.etat === "portee") {
    return;
  }
  if (yokai.etat === "marche") {
    marcherAuSol(yokai, contexte, false);
    return;
  }
  if (yokai.etat === "immobile") {
    yokai.vx = 0;
    marcherAuSol(yokai, contexte, false);
    return;
  }
  // Lancee : elle file droit, rebondit sur les murs, et fauche ce
  // qu'elle croise.
  marcherAuSol(yokai, contexte, false);
  contexte.yokais.forEach(autre => {
    if (autre === yokai || !autre.vivant) {
      return;
    }
    if (seTouchent(yokai, autre)) {
      autre.vivant = false;
      yokai.fauches = (yokai.fauches || 0) + 1;
    }
  });
}

function animerVolant(yokai, contexte) {
  const reglages = yokai.reglages;
  const limite = reglages.portee * 16;
  yokai.x += yokai.vx * contexte.delta;
  if (yokai.x < yokai.xDepart - limite) {
    yokai.x = yokai.xDepart - limite;
    yokai.vx = reglages.vitesse;
  } else if (yokai.x > yokai.xDepart + limite) {
    yokai.x = yokai.xDepart + limite;
    yokai.vx = -reglages.vitesse;
  }
  // L'ondulation : une sinusoide pure, sans collision avec le decor.
  // Un volant se place en l'air libre, c'est au niveau de le garantir.
  yokai.y = yokai.yDepart
    + reglages.amplitude * Math.sin(2 * Math.PI * yokai.chrono / reglages.periode);
}

function animerTombeur(yokai, contexte) {
  if (yokai.etat === "suspendu") {
    const centre = yokai.x + yokai.largeur / 2;
    const centreJoueur = contexte.joueur.x + contexte.joueur.largeur / 2;
    const dessous = contexte.joueur.y > yokai.y;
    if (dessous && Math.abs(centreJoueur - centre) <= yokai.reglages.declenchement) {
      yokai.etat = "chute";
      yokai.vx = 0;
      yokai.vy = 0;
    }
    return;
  }
  if (yokai.etat === "chute") {
    yokai.vy += GRAVITE * contexte.delta;
    const contact = contexte.deplacer(yokai, 0, yokai.vy * contexte.delta);
    if (contact.sol) {
      yokai.etat = "marche";
      yokai.sol = true;
      yokai.vy = 0;
      yokai.vx = -yokai.reglages.vitesse;
    }
    return;
  }
  marcherAuSol(yokai, contexte, false);
}

// ---------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------

export function seTouchent(a, b) {
  return a.x < b.x + b.largeur && a.x + a.largeur > b.x
    && a.y < b.y + b.hauteur && a.y + a.hauteur > b.y;
}

// Ce que devient le yokai quand le tanuki lui saute dessus.
// Rend { elimine, rebond } : le rebond est toujours accorde, c'est ce
// qui rend l'ecrasement agreable.
export function ecraser(yokai, depuisLaGauche) {
  if (yokai.comportement !== "carapace") {
    yokai.vivant = false;
    return { elimine: true, rebond: true };
  }
  if (yokai.etat === "marche") {
    retracter(yokai);
    return { elimine: false, rebond: true };
  }
  if (yokai.etat === "lancee") {
    // Une carapace lancee se rattrape du pied : elle s'arrete net.
    yokai.etat = "immobile";
    yokai.vx = 0;
    return { elimine: false, rebond: true };
  }
  // Deja retractee et immobile : le coup de pied la propulse
  lancerCarapace(yokai, depuisLaGauche);
  return { elimine: false, rebond: true };
}

// La carapace est plus basse que le kappa debout : on garde les pieds
// au sol en baissant le haut de la boite, jamais le bas.
function retracter(yokai) {
  yokai.etat = "immobile";
  yokai.vx = 0;
  const perdu = yokai.hauteur - yokai.reglages.hauteurCarapace;
  yokai.hauteur = yokai.reglages.hauteurCarapace;
  yokai.y += perdu;
}

export function lancerCarapace(yokai, depuisLaGauche) {
  yokai.etat = "lancee";
  yokai.vx = depuisLaGauche ? yokai.reglages.vitesseLancee : -yokai.reglages.vitesseLancee;
}

// Ce que subit le tanuki a un contact qui n'est pas un ecrasement.
// Rend "blesse", ou "lance" quand il ne fait que pousser une carapace.
export function contactLateral(yokai, depuisLaGauche) {
  if (yokai.comportement === "carapace" && yokai.etat === "immobile") {
    lancerCarapace(yokai, depuisLaGauche);
    return "lance";
  }
  return "blesse";
}

// ---------------------------------------------------------------------
// Dessin
// ---------------------------------------------------------------------

// Le nom de l'image, par comportement. Le sprite lui-meme vient de la
// table d'apparences du monde.
export function imageDuYokai(yokai) {
  const alterne = Math.floor(yokai.animation / 12) % 2 === 0;
  if (yokai.comportement === "carapace" && yokai.etat !== "marche") {
    return "carapace";
  }
  if (yokai.comportement === "volant") {
    return alterneParTemps(yokai) ? "vol1" : "vol2";
  }
  if (yokai.comportement === "tombeur" && yokai.etat === "suspendu") {
    return "suspendu";
  }
  if (yokai.comportement === "tombeur" && yokai.etat === "chute") {
    return "marche1";
  }
  return alterne ? "marche1" : "marche2";
}

// Un volant garde une vitesse constante : son battement d'ailes suit le
// temps et non la distance parcourue.
function alterneParTemps(yokai) {
  return Math.floor(yokai.chrono * 5) % 2 === 0;
}
