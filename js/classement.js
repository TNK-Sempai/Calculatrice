// =====================================================================
//  CLASSEMENT EN LIGNE
//  Le top 10 local en localStorage reste la reference hors ligne.
//  Ce module ajoute un second tableau, partage entre tous les visiteurs.
//  Si l'API est absente ou injoignable, le jeu continue sans rien dire.
// =====================================================================

// Adresse de l'API. Une chaine vide desactive le classement en ligne.
//   Route PHP  : le dossier api, sans barre oblique finale
//                "https://serveur-de-l-ecole/tanuki/api"
//   Apps Script : l'URL de deploiement qui finit par /exec
//                "https://script.google.com/macros/s/AKfy.../exec"
const API_CLASSEMENT = "https://script.google.com/macros/s/AKfycbweoj6RUlFITisocCRYHNVxJulRydNA-08t89FAObuqJV5wzeewT33wAhpvzN1z7kL9/exec";

// "php" ou "apps-script". Les deux parlent le meme langage, seules
// l'adresse des routes et l'en-tete d'envoi changent.
const TYPE_API = "apps-script";

// Adresse du formulaire de suggestions. Vide : le bouton n'apparait pas.
const FORMULAIRE_SUGGESTIONS = "https://docs.google.com/forms/d/e/1FAIpQLSfHVda_NV80NzQLQhvvKFlw5rIvMiPUarLWE4-xth_A424-iw/viewform";

const DELAI_API = 6000;   // au-dela, on abandonne sans bloquer le jeu

const zoneEnLigne = document.getElementById("scoresEnLigne");
const zoneListeEnLigne = document.getElementById("scoresListeEnLigne");
const zoneEtatEnLigne = document.getElementById("scoresEtatEnLigne");

function classementActif() {
  // Sans les elements d'affichage, on ne tente rien
  return API_CLASSEMENT !== ""
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

// Envoi d'un score. Appele par arcade.js apres la saisie du nom.
async function envoyerScore(id, nom, score) {
  if (!classementActif()) {
    return;
  }
  const reponse = await appelerApi(adresseEnvoi(), {
    method: "POST",
    headers: { "Content-Type": typeDeContenu() },
    body: JSON.stringify({ jeu: id, nom, score, marqueur: marqueurVisiteur() })
  });

  if (reponse !== null && Array.isArray(reponse.scores)) {
    remplirListeEnLigne(id, reponse.scores, { nom, score });
  } else {
    afficherEtatEnLigne("Classement en ligne indisponible");
  }
}

// Chargement du classement d'un jeu. Appele a l'ouverture du tableau.
async function afficherClassementEnLigne(id) {
  if (!classementActif()) {
    if (zoneEnLigne !== null) {
      zoneEnLigne.hidden = true;
    }
    return;
  }
  zoneEnLigne.hidden = false;
  zoneListeEnLigne.innerHTML = "";
  afficherEtatEnLigne("Chargement du classement...");

  const reponse = await appelerApi(adresseLecture(id));
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
