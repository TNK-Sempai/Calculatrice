// =====================================================================
//  CONSENTEMENT A LA MESURE D'AUDIENCE
//  Meme regle que le portfolio : Google Tag Manager n'est charge
//  qu'apres un « Accepter ». Sans choix ou apres un refus, aucun script
//  Google ni Meta n'arrive sur la page.
//
//  Le choix est garde dans un cookie tnk-consent, "granted" ou "denied",
//  pose sur .tanuki-corporation.com : le meme choix vaut donc pour le
//  portfolio et pour l'arcade. La lecture et l'ecriture sont dans
//  l'amorce du <head> d'index.html, qui pose aussi le Consent Mode v2 et
//  expose window.tnkConsentement. Ce fichier n'a que le bandeau.
// =====================================================================

// Repli si l'amorce du <head> manque : le bandeau doit rester utilisable
// et ne jamais charger GTM de lui-meme.
const amorce = window.tnkConsentement || {
  cle: "tnk-consent",
  choix: null,
  lire: function () { return null; },
  ecrire: function () {},
  gtag: function () {},
  chargerGtm: function () {}
};

// Repli quand le cookie est refuse : le choix vaut pour la page, et rien
// n'est garde.
let enMemoire = null;

function lireLeChoix() {
  const valeur = amorce.lire();
  return valeur === null ? enMemoire : valeur;
}

function ecrireLeChoix(valeur) {
  enMemoire = valeur;
  amorce.ecrire(valeur);
}

// Efface les cookies de mesure poses par Google et Meta sur ce domaine,
// quand un accord est retire.
function effacerLesCookiesDeMesure() {
  const hote = location.hostname;
  const domaines = ["", hote, "." + hote, "." + hote.split(".").slice(-2).join(".")];
  for (const morceau of document.cookie.split(";")) {
    const nom = morceau.split("=")[0].trim();
    if (!/^(_ga|_gid|_gat|_gcl|_fbp|_fbc)/.test(nom)) {
      continue;
    }
    for (const domaine of domaines) {
      document.cookie = nom + "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/"
        + (domaine ? "; domain=" + domaine : "");
    }
  }
}

// ---------------------------------------------------------------------
// Mesure
// ---------------------------------------------------------------------

// Envoi d'un evenement dans le dataLayer. Volontairement sans aucune
// dependance a GTM : sans conteneur charge, la poussee reste dans le
// tableau et ne coute rien. Toute erreur est avalee, la mesure ne doit
// jamais interrompre une partie.
export function mesurer(evenement) {
  try {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(evenement);
  } catch (erreur) {
    // une mesure ratee n'est pas une raison d'arreter le jeu
  }
}

// ---------------------------------------------------------------------
// Le bandeau
// ---------------------------------------------------------------------

const TEXTES = {
  label: "Mesure d'audience",
  texte: "Avec votre accord, ce site mesure sa fréquentation avec Google Analytics"
    + " et le pixel Meta, via Google Tag Manager. Rien n'est chargé tant que vous"
    + " n'avez pas choisi, et vous pouvez changer d'avis à tout moment avec le lien"
    + " « Cookies » en bas de page.",
  accepter: "Accepter",
  refuser: "Refuser"
};

let bandeau = null;

function construireLeBandeau() {
  bandeau = document.createElement("div");
  bandeau.className = "bandeau-consentement";
  bandeau.id = "bandeauConsentement";
  bandeau.hidden = true;
  bandeau.setAttribute("role", "region");
  bandeau.setAttribute("aria-label", TEXTES.label);

  const dedans = document.createElement("div");
  dedans.className = "consentement-dedans";

  const label = document.createElement("span");
  label.className = "consentement-label";
  label.textContent = TEXTES.label;

  const texte = document.createElement("p");
  texte.className = "consentement-texte";
  texte.textContent = TEXTES.texte;

  const boutons = document.createElement("div");
  boutons.className = "consentement-boutons";

  const accepter = document.createElement("button");
  accepter.type = "button";
  accepter.className = "jeu-quitter";
  accepter.textContent = TEXTES.accepter;
  accepter.addEventListener("click", () => repondre("granted"));

  const refuser = document.createElement("button");
  refuser.type = "button";
  refuser.className = "jeu-quitter";
  refuser.textContent = TEXTES.refuser;
  refuser.addEventListener("click", () => repondre("denied"));

  boutons.append(accepter, refuser);
  dedans.append(label, texte, boutons);
  bandeau.appendChild(dedans);
  document.body.appendChild(bandeau);
  return accepter;
}

function montrer(visible) {
  if (bandeau === null) {
    return;
  }
  bandeau.hidden = !visible;
}

function repondre(valeur) {
  const avant = lireLeChoix();
  ecrireLeChoix(valeur);
  montrer(false);

  if (valeur === "granted") {
    amorce.gtag("consent", "update", {
      ad_storage: "granted",
      analytics_storage: "granted",
      ad_user_data: "granted",
      ad_personalization: "granted"
    });
    amorce.chargerGtm();
    return;
  }

  amorce.gtag("consent", "update", {
    ad_storage: "denied",
    analytics_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied"
  });
  // Retirer un accord deja donne : on efface ce qui a ete pose, et on
  // recharge pour que le conteneur deja charge cesse de tourner.
  if (avant === "granted") {
    effacerLesCookiesDeMesure();
    location.reload();
  }
}

// Rouvre le bandeau, depuis le lien « Cookies » du pied de page
export function ouvrirLeBandeau() {
  montrer(true);
  const premier = bandeau === null ? null : bandeau.querySelector("button");
  if (premier !== null) {
    premier.focus();
  }
}

// ---------------------------------------------------------------------
// Clavier
// ---------------------------------------------------------------------

// La calculatrice et les jeux ecoutent le clavier sur document et sur
// window. Une touche tapee alors que le bandeau a le focus ne doit pas
// devenir un coup : on l'arrete au tout premier maillon, la capture sur
// window. Hors du bandeau, rien n'est touche.
function isolerLeClavier(evenement) {
  if (bandeau === null || bandeau.hidden) {
    return;
  }
  if (bandeau.contains(evenement.target)) {
    evenement.stopPropagation();
  }
}

window.addEventListener("keydown", isolerLeClavier, true);
window.addEventListener("keyup", isolerLeClavier, true);
window.addEventListener("keypress", isolerLeClavier, true);

// ---------------------------------------------------------------------
// Mise en place
// ---------------------------------------------------------------------

construireLeBandeau();

if (lireLeChoix() === null) {
  montrer(true);
}

const lienCookies = document.getElementById("lienCookies");
if (lienCookies !== null) {
  lienCookies.addEventListener("click", ouvrirLeBandeau);
}
