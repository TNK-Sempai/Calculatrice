// =====================================================================
//  CLASSEMENT EN LIGNE
//  Le top 10 local en localStorage reste la reference hors ligne.
//  Ce module ajoute un second tableau, partage entre tous les visiteurs.
//  Si l'API est absente ou injoignable, le jeu continue sans rien dire.
// =====================================================================

import { formaterScore } from "./arcade.js";

// Adresse de l'API. Une chaine vide desactive le classement en ligne.
//   Route PHP  : le dossier api, sans barre oblique finale
//                "https://serveur-de-l-ecole/tanuki/api"
//   Apps Script : l'URL de deploiement qui finit par /exec
//                "https://script.google.com/macros/s/AKfy.../exec"
const API_CLASSEMENT = "https://script.google.com/macros/s/AKfycbwPzEKYsPyfv_X-0wVNMHRNXqPfSntE6G10ooctO5Yt4sd8pk2I3eRkhBqWFVqrec1l/exec";

// Supabase (schema "arcade" du projet du portfolio). Tant que la cle
// publique est vide, on reste sur Apps Script. La cle publique (anon ou
// sb_publishable_...) peut vivre dans le code : la securite est assuree
// par les regles RLS et la fonction Edge "soumettre-score".
const SUPABASE = {
  url: "https://rdmtduvghupgqqwgrsgz.supabase.co",
  clePublique: "sb_publishable_xErs40HvZEHWYIuw1hHmZw_3xqRfiqx"
};

// Le Versus en ligne n'existe qu'avec Supabase
export function configSupabase() {
  return SUPABASE.clePublique ? SUPABASE : null;
}

// "supabase", "php" ou "apps-script"
const TYPE_API = SUPABASE.clePublique ? "supabase" : "apps-script";

// Adresse du formulaire de suggestions. Vide : le bouton n'apparait pas.
const FORMULAIRE_SUGGESTIONS = "https://docs.google.com/forms/d/e/1FAIpQLSfHVda_NV80NzQLQhvvKFlw5rIvMiPUarLWE4-xth_A424-iw/viewform";

const DELAI_API = 6000;   // au-dela, on abandonne sans bloquer le jeu

const zoneEnLigne = document.getElementById("scoresEnLigne");
const zoneListeEnLigne = document.getElementById("scoresListeEnLigne");
const zoneEtatEnLigne = document.getElementById("scoresEtatEnLigne");

function classementActif() {
  // Sans les elements d'affichage, on ne tente rien
  return (TYPE_API === "supabase" || API_CLASSEMENT !== "")
    && typeof fetch === "function"
    && zoneEnLigne !== null
    && zoneListeEnLigne !== null;
}

// Apps Script n'expose qu'une seule adresse, avec les parametres en clair
function adresseLecture(id) {
  return TYPE_API === "apps-script"
    ? API_CLASSEMENT + "?jeu=" + encodeURIComponent(id)
    : API_CLASSEMENT + "/classement.php?jeu=" + encodeURIComponent(id);
}

function adresseEnvoi() {
  return TYPE_API === "apps-script" ? API_CLASSEMENT : API_CLASSEMENT + "/score.php";
}

// Apps Script ne repond pas aux requetes de controle prealable, donc on
// envoie du texte brut plutot que du JSON declare. Le contenu reste du JSON.
function typeDeContenu() {
  return TYPE_API === "apps-script" ? "text/plain;charset=utf-8" : "application/json";
}

// Marqueur anonyme et durable, utilise seulement pour limiter les envois
function marqueurVisiteur() {
  try {
    let marqueur = localStorage.getItem("tanuki-arcade-marqueur");
    if (marqueur === null) {
      marqueur = String(Date.now()) + "-" + Math.random().toString(36).slice(2, 10);
      localStorage.setItem("tanuki-arcade-marqueur", marqueur);
    }
    return marqueur;
  } catch (erreur) {
    return "anonyme";
  }
}

// Un fetch qui abandonne au bout de quelques secondes
async function appelerApi(adresse, options) {
  const abandon = new AbortController();
  const minuteur = setTimeout(() => abandon.abort(), DELAI_API);
  try {
    const reponse = await fetch(adresse, Object.assign({
      signal: abandon.signal
    }, options || {}));
    if (!reponse.ok) {
      return null;
    }
    return await reponse.json();
  } catch (erreur) {
    return null; // hors ligne, serveur muet, requete refusee : on ignore
  } finally {
    clearTimeout(minuteur);
  }
}

// ---------------------------------------------------------------------
// Supabase : connexion anonyme automatique, lecture par fonction SQL,
// ecriture par la fonction Edge qui verifie chaque score
// ---------------------------------------------------------------------

const CLE_SESSION = "tanuki-arcade-session";

function lireSession() {
  try {
    return JSON.parse(localStorage.getItem(CLE_SESSION) || "null");
  } catch (erreur) {
    return null;
  }
}

function garderSession(donnees) {
  if (!donnees || !donnees.access_token) {
    return null;
  }
  const session = {
    access_token: donnees.access_token,
    refresh_token: donnees.refresh_token,
    expire: Date.now() + (Number(donnees.expires_in) || 3600) * 1000 - 60000
  };
  try {
    localStorage.setItem(CLE_SESSION, JSON.stringify(session));
  } catch (erreur) {
    // sans stockage, la session vit le temps de la page
  }
  return session;
}

// Jeton du joueur : session existante, rafraichie, ou nouveau compte anonyme
export async function jetonJoueur() {
  let session = lireSession();
  const enTetes = { "Content-Type": "application/json", apikey: SUPABASE.clePublique };
  if (session && session.expire > Date.now()) {
    return session.access_token;
  }
  if (session && session.refresh_token) {
    session = garderSession(await appelerApi(SUPABASE.url + "/auth/v1/token?grant_type=refresh_token", {
      method: "POST", headers: enTetes, body: JSON.stringify({ refresh_token: session.refresh_token })
    }));
    if (session) {
      return session.access_token;
    }
  }
  session = garderSession(await appelerApi(SUPABASE.url + "/auth/v1/signup", {
    method: "POST", headers: enTetes, body: JSON.stringify({})
  }));
  return session ? session.access_token : null;
}

async function lireScores(id) {
  if (TYPE_API !== "supabase") {
    return appelerApi(adresseLecture(id));
  }
  const liste = await appelerApi(SUPABASE.url + "/rest/v1/rpc/meilleurs_scores", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Profile": "arcade",
      apikey: SUPABASE.clePublique,
    },
    body: JSON.stringify({ p_jeu: id, p_nombre: 10 })
  });
  return Array.isArray(liste) ? { jeu: id, scores: liste } : null;
}

async function envoyerScoreSupabase(id, nom, score) {
  const jeton = await jetonJoueur();
  if (jeton === null) {
    return null;
  }
  return appelerApi(SUPABASE.url + "/functions/v1/soumettre-score", {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE.clePublique, Authorization: "Bearer " + jeton },
    body: JSON.stringify({ jeu: id, nom, score })
  });
}

// Envoi d'un score. Appele par arcade.js apres la saisie du nom.
export async function envoyerScore(id, nom, score) {
  if (!classementActif()) {
    return;
  }
  if (TYPE_API === "supabase") {
    const retour = await envoyerScoreSupabase(id, nom, score);
    const liste = retour && Array.isArray(retour.scores) ? retour : await lireScores(id);
    if (liste !== null && Array.isArray(liste.scores)) {
      remplirListeEnLigne(id, liste.scores, { nom, score });
    } else {
      afficherEtatEnLigne("Classement en ligne indisponible");
    }
    return;
  }
  const corps = JSON.stringify({ jeu: id, nom, score, marqueur: marqueurVisiteur() });
  const enTetes = { "Content-Type": typeDeContenu() };

  const reponse = await appelerApi(adresseEnvoi(), {
    method: "POST",
    headers: enTetes,
    body: corps
  });

  // Cas ideal : le serveur renvoie le classement mis a jour
  if (reponse !== null && Array.isArray(reponse.scores)) {
    remplirListeEnLigne(id, reponse.scores, { nom, score });
    return;
  }

  // Le serveur a peut-etre enregistre sans que sa reponse soit lisible.
  // Apps Script redirige les POST, et la redirection n'expose pas toujours
  // les en-tetes qui autorisent la lecture entre domaines.
  if (reponse === null) {
    await envoiSansLecture(corps, enTetes);
  }

  // Dans tous les cas, on relit le classement : la lecture, elle, passe.
  afficherEtatEnLigne("Mise a jour du classement...");
  const relecture = await lireScores(id);

  if (relecture !== null && Array.isArray(relecture.scores)) {
    remplirListeEnLigne(id, relecture.scores, { nom, score });
  } else {
    afficherEtatEnLigne("Classement en ligne indisponible");
  }
}

// Dernier recours : on envoie sans chercher a lire la reponse.
// La requete part bien, seul le retour est opaque.
async function envoiSansLecture(corps, enTetes) {
  try {
    await fetch(adresseEnvoi(), {
      method: "POST",
      mode: "no-cors",
      headers: enTetes,
      body: corps
    });
  } catch (erreur) {
    // rien de plus a tenter
  }
}

// Lecture brute du classement d'un jeu, sans rien afficher. Les panneaux
// lateraux s'en servent pour charger la liste une seule fois, a l'ouverture
// du jeu, et la garder en memoire pendant toute la partie.
// Renvoie la liste des scores, ou null si le classement est injoignable.
export async function lireClassementEnLigne(id) {
  if (!classementActif()) {
    return null;
  }
  const reponse = await lireScores(id);
  if (reponse === null || !Array.isArray(reponse.scores)) {
    return null;
  }
  return reponse.scores;
}

// Chargement du classement d'un jeu. Appele a l'ouverture du tableau.
export async function afficherClassementEnLigne(id) {
  if (!classementActif()) {
    if (zoneEnLigne !== null) {
      zoneEnLigne.hidden = true;
    }
    return;
  }
  zoneEnLigne.hidden = false;
  zoneListeEnLigne.innerHTML = "";
  afficherEtatEnLigne("Chargement du classement...");

  const reponse = await lireScores(id);
  if (reponse === null || !Array.isArray(reponse.scores)) {
    afficherEtatEnLigne("Classement en ligne indisponible");
    return;
  }
  remplirListeEnLigne(id, reponse.scores, null);
}

function afficherEtatEnLigne(texte) {
  if (zoneEtatEnLigne !== null) {
    zoneEtatEnLigne.textContent = texte;
  }
}

function remplirListeEnLigne(id, scores, aMettreEnAvant) {
  zoneListeEnLigne.innerHTML = "";
  afficherEtatEnLigne(scores.length === 0 ? "Personne n'a encore joue" : "");

  scores.forEach((entree, index) => {
    const ligne = document.createElement("li");
    if (aMettreEnAvant
      && entree.nom === aMettreEnAvant.nom
      && Number(entree.score) === aMettreEnAvant.score) {
      ligne.classList.add("recent");
    }

    const rang = document.createElement("span");
    rang.className = "scores-rang";
    rang.textContent = String(index + 1).padStart(2, "0");

    const nom = document.createElement("span");
    nom.className = "scores-nom";
    nom.textContent = entree.nom;

    const points = document.createElement("span");
    points.textContent = formaterScore(id, Number(entree.score));

    ligne.append(rang, nom, points);
    zoneListeEnLigne.appendChild(ligne);
  });
}

// ---------------------------------------------------------------------
// Formulaire de suggestions
// ---------------------------------------------------------------------

const boutonSuggestion = document.getElementById("menuSuggestion");

// Le bouton peut ne pas exister si index.html n'a pas ete mis a jour
if (boutonSuggestion !== null) {
  if (FORMULAIRE_SUGGESTIONS === "") {
    boutonSuggestion.hidden = true;
  } else {
    boutonSuggestion.addEventListener("click", function () {
      window.open(FORMULAIRE_SUGGESTIONS, "_blank", "noopener");
    });
  }
}
// ---------------------------------------------------------------------
// Cache du classement en ligne
// Le menu et l'ecran titre affichent le n°1 mondial de chaque jeu. Pour
// ne pas interroger le serveur a chaque ouverture, la derniere lecture
// est gardee quelques minutes sur l'appareil.
// ---------------------------------------------------------------------

const DUREE_CACHE = 5 * 60 * 1000;
const enVol = new Map();

function cleCache(id) {
  return "tanuki-arcade-monde-" + id;
}

// Lecture immediate, sans reseau : la derniere liste connue, ou null
export function classementEnCache(id) {
  try {
    const brut = localStorage.getItem(cleCache(id));
    if (brut === null) {
      return null;
    }
    const valeur = JSON.parse(brut);
    return Array.isArray(valeur.scores) ? valeur : null;
  } catch (erreur) {
    return null;
  }
}

// Renvoie la liste a jour (depuis le cache s'il est frais), ou null
export function classementFrais(id) {
  const cache = classementEnCache(id);
  if (cache !== null && Date.now() - cache.t < DUREE_CACHE) {
    return Promise.resolve(cache.scores);
  }
  if (enVol.has(id)) {
    return enVol.get(id);
  }
  const promesse = lireClassementEnLigne(id).then(scores => {
    enVol.delete(id);
    if (scores === null) {
      return cache !== null ? cache.scores : null;
    }
    try {
      localStorage.setItem(cleCache(id), JSON.stringify({ t: Date.now(), scores }));
    } catch (erreur) {
      // pas de cache possible : on servira la lecture directe
    }
    return scores;
  });
  enVol.set(id, promesse);
  return promesse;
}

// Apres un envoi, le cache ne reflete plus la realite
export function oublierCache(id) {
  try {
    localStorage.removeItem(cleCache(id));
  } catch (erreur) {
    // rien a faire
  }
}

export function classementEnLigneActif() {
  return classementActif();
}
