// =====================================================================
//  VERSUS EN LIGNE
//  Une partie a deux sur deux appareils, par Supabase (schema arcade).
//  Le serveur garde la liste des coups ; chaque navigateur les rejoue
//  avec le moteur du jeu. Pas de SDK : de simples appels REST, relus a
//  intervalle court tant que c'est a l'adversaire de jouer.
//
//  Chaque jeu cree sa session avec creerVersus(...) et recoit :
//    surDebut({ monCote, jeCommence, graine, adversaire, moi, coups })
//      coups : [{ moi: bool, c: coup }] deja joues (reprise de partie)
//    surCoup(coup)        un coup de l'adversaire, dans SON repere
//    surFin({ resultat: "victoire" | "defaite" | "nul", raison })
//      seulement quand la fin vient du serveur (abandon, absence)
//    surFermeture()       le joueur quitte le mode en ligne
//  et dispose de envoyer(coup), terminer(resultat, raison), tour(bool).
// =====================================================================

import { configSupabase, jetonJoueur } from "./classement.js";
import { pseudoArcade, memoriserPseudoArcade, ouvrirJeuParId } from "./arcade.js";

const INTERVALLE_ATTENTE = 1500;     // en attente d'un adversaire
const INTERVALLE_SON_TOUR = 1100;    // l'adversaire reflechit
const INTERVALLE_MON_TOUR = 4000;    // simple signe de vie
const SILENCE_INQUIETANT = 25000;    // l'adversaire semble deconnecte
const SILENCE_ABANDON = 125000;      // on peut reclamer la victoire
const CLE_EN_COURS = "tanuki-arcade-versus-";

const sessions = new Map();          // jeu -> session

export function versusDisponible() {
  return configSupabase() !== null && typeof fetch === "function";
}

// ---------------------------------------------------------------------
// Appels au serveur
// ---------------------------------------------------------------------

// Mon identifiant de joueur, lu dans le jeton (champ "sub")
let monIdentifiant = null;

function identifiantDuJeton(jeton) {
  try {
    const morceau = jeton.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(morceau + "===".slice((morceau.length + 3) % 4))).sub || null;
  } catch (erreur) {
    return null;
  }
}

async function rpc(nom, corps) {
  const config = configSupabase();
  const jeton = await jetonJoueur();
  if (config === null || jeton === null) {
    throw new Error("hors ligne");
  }
  monIdentifiant = identifiantDuJeton(jeton) || monIdentifiant;
  const abandon = new AbortController();
  const minuteur = setTimeout(() => abandon.abort(), 8000);
  let reponse;
  try {
    reponse = await fetch(config.url + "/rest/v1/rpc/" + nom, {
      method: "POST",
      signal: abandon.signal,
      headers: {
        "Content-Type": "application/json",
        "Content-Profile": "arcade",
        "Accept-Profile": "arcade",
        apikey: config.clePublique,
        Authorization: "Bearer " + jeton
      },
      body: JSON.stringify(corps)
    });
  } catch (erreur) {
    throw new Error("hors ligne");
  } finally {
    clearTimeout(minuteur);
  }
  let donnees = null;
  try {
    donnees = await reponse.json();
  } catch (erreur) {
    donnees = null;
  }
  if (!reponse.ok) {
    throw new Error(donnees && donnees.message ? donnees.message : "erreur " + reponse.status);
  }
  return donnees;
}

function nettoyerPseudo(texte) {
  return String(texte || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

function nettoyerCode(texte) {
  return String(texte || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
}

export function lienPartie(code) {
  return location.origin + location.pathname + "?versus=" + code;
}

const MESSAGES_ERREUR = {
  "partie introuvable": "Aucune partie avec ce code.",
  "partie deja commencee": "Cette partie a déjà deux joueurs.",
  "partie terminee": "Cette partie est terminée.",
  "hors ligne": "Connexion impossible. Vérifie ta connexion."
};

function texteErreur(erreur) {
  return MESSAGES_ERREUR[erreur.message] || "Le serveur a refusé : " + erreur.message;
}

// ---------------------------------------------------------------------
// Session d'un jeu
// ---------------------------------------------------------------------

export function creerVersus(config) {
  const { jeu, section, options, surDebut, surCoup, surFin, surFermeture, passerEnLigne } = config;
  const nomJeu = config.nom || jeu;

  // Le panneau se place juste sous la rangee des difficultes
  const panneau = document.createElement("div");
  panneau.className = "versus";
  panneau.hidden = true;
  const repere = section.querySelector(".scores-ligne") || section.querySelector(".jeu-entete");
  if (repere && repere.parentNode) {
    repere.parentNode.insertBefore(panneau, repere.nextSibling);
  } else {
    section.prepend(panneau);
  }

  // Le panneau prend de la hauteur : le jeu doit se redimensionner
  if (typeof ResizeObserver === "function") {
    let hauteur = 0;
    new ResizeObserver(() => {
      const h = panneau.offsetHeight;
      if (h !== hauteur) {
        hauteur = h;
        window.dispatchEvent(new Event("resize"));
      }
    }).observe(panneau);
  }

  let etat = "ferme";        // ferme, accueil, attente, jeu, fin
  let partie = null;
  let monCote = 1;
  let connus = 0;            // coups deja pris en compte
  let monTour = false;
  let minuteur = null;
  let enVol = false;
  let envois = Promise.resolve();
  let vuAdversaire = null;   // derniere valeur lue
  let vuChangeLe = 0;        // heure locale du dernier changement
  let erreurReseau = false;
  let resultatAnnonce = false;

  function opts() {
    return typeof options === "function" ? options() : (options || {});
  }

  function memoriserEnCours() {
    try {
      if (partie && (etat === "jeu" || etat === "attente")) {
        localStorage.setItem(CLE_EN_COURS + jeu, partie.id);
      } else {
        localStorage.removeItem(CLE_EN_COURS + jeu);
      }
    } catch (erreur) {
      // sans stockage, pas de reprise apres rechargement
    }
  }

  function idEnCours() {
    try {
      return localStorage.getItem(CLE_EN_COURS + jeu);
    } catch (erreur) {
      return null;
    }
  }

  function adversaire() {
    if (!partie) {
      return "";
    }
    return (monCote === 1 ? partie.pseudo_b : partie.pseudo_a) || "???";
  }

  function moi() {
    if (!partie) {
      return "";
    }
    return (monCote === 1 ? partie.pseudo_a : partie.pseudo_b) || "";
  }

  // ----- Rendu du panneau -----

  function bouton(texte, action, principal) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "jeu-quitter" + (principal ? " versus-principal" : "");
    b.textContent = texte;
    b.addEventListener("click", action);
    return b;
  }

  function ligne(...enfants) {
    const div = document.createElement("div");
    div.className = "versus-ligne";
    div.append(...enfants);
    return div;
  }

  function texte(contenu, classe) {
    const p = document.createElement("p");
    p.className = classe || "versus-texte";
    p.textContent = contenu;
    return p;
  }

  function champ(valeur, place, taille, etiquette) {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "versus-champ";
    input.value = valeur;
    input.placeholder = place;
    input.maxLength = taille;
    input.autocomplete = "off";
    input.spellcheck = false;
    input.setAttribute("autocapitalize", "characters");
    input.setAttribute("aria-label", etiquette);
    input.addEventListener("input", () => {
      const propre = taille === 5 ? nettoyerCode(input.value) : nettoyerPseudo(input.value);
      if (propre !== input.value) {
        input.value = propre;
      }
    });
    return input;
  }

  let messageAccueil = "";

  function rendreAccueil(codePrerempli) {
    panneau.innerHTML = "";
    const titre = texte("Versus en ligne", "versus-titre");
    const pseudo = champ(nettoyerPseudo(pseudoArcade()), "PSEUDO", 8, "Ton pseudo");
    const code = champ(nettoyerCode(codePrerempli || ""), "CODE", 5, "Code de la partie");
    const lirePseudo = () => {
      const p = nettoyerPseudo(pseudo.value);
      if (p === "") {
        pseudo.focus();
        rendreMessage("Choisis un pseudo d'abord.");
        return null;
      }
      memoriserPseudoArcade(p);
      return p;
    };
    const zoneMessage = texte(messageAccueil, "versus-alerte");
    function rendreMessage(t) {
      zoneMessage.textContent = t;
    }
    const lancer = async (appel) => {
      const p = lirePseudo();
      if (p === null) {
        return;
      }
      rendreMessage("Connexion...");
      try {
        const reponse = await appel(p);
        brancher(reponse);
      } catch (erreur) {
        rendreMessage(texteErreur(erreur));
      }
    };
    const rapide = bouton("Partie rapide", () => lancer(p => rpc("versus_rapide", { p_jeu: jeu, p_options: opts(), p_pseudo: p })), true);
    const creer = bouton("Inviter un ami", () => lancer(p => rpc("versus_creer", { p_jeu: jeu, p_options: opts(), p_publique: false, p_pseudo: p })));
    const rejoindre = bouton("Rejoindre", () => {
      const c = nettoyerCode(code.value);
      if (c.length !== 5) {
        code.focus();
        rendreMessage("Le code a 5 caractères.");
        return;
      }
      lancer(p => rpc("versus_rejoindre", { p_code: c, p_pseudo: p }));
    }, !!codePrerempli);
    code.addEventListener("keydown", e => { if (e.key === "Enter") { rejoindre.click(); } });
    const fermerB = bouton("Retour à l'IA", fermer);
    panneau.append(
      titre,
      ligne(pseudo, rapide, creer),
      ligne(code, rejoindre, fermerB),
      zoneMessage
    );
    const enCours = idEnCours();
    if (enCours && !codePrerempli) {
      zoneMessage.textContent = "";
      const reprise = bouton("Reprendre ma partie", async () => {
        rendreMessage("Connexion...");
        try {
          brancher(await rpc("versus_lire", { p_id: enCours }));
        } catch (erreur) {
          memoriserEnCours();
          rendreMessage("Cette partie n'existe plus.");
          reprise.remove();
        }
      }, true);
      panneau.insertBefore(ligne(reprise), zoneMessage);
    }
    messageAccueil = "";
    if (codePrerempli) {
      pseudo.focus();
    }
  }

  function rendreAttente() {
    panneau.innerHTML = "";
    const lien = lienPartie(partie.code);
    const copier = bouton("Copier le lien", async () => {
      try {
        if (navigator.share && matchMedia("(pointer: coarse)").matches) {
          await navigator.share({ title: "Tanuki Arcade", text: "Viens jouer au " + nomJeu + " contre moi", url: lien });
          return;
        }
        await navigator.clipboard.writeText(lien);
        copier.textContent = "Lien copié";
      } catch (erreur) {
        copier.textContent = lien;
      }
    }, true);
    panneau.append(
      texte(partie.publique ? "Recherche d'un adversaire..." : "Envoie ce code à ton adversaire", "versus-titre"),
      ligne(texte(partie.code, "versus-code"), copier, bouton("Annuler", () => annulerAttente()))
    );
    if (partie.publique) {
      panneau.append(texte("Tu peux aussi partager le code : la première personne qui le tape joue contre toi."));
    }
  }

  function rendreJeu() {
    panneau.innerHTML = "";
    const silence = vuChangeLe ? Date.now() - vuChangeLe : 0;
    let etatTexte = monTour ? "À toi de jouer" : "Au tour de " + adversaire();
    if (erreurReseau) {
      etatTexte = "Connexion perdue, nouvel essai...";
    } else if (!monTour && silence > SILENCE_INQUIETANT) {
      etatTexte = adversaire() + " ne répond plus";
    }
    const duel = document.createElement("p");
    duel.className = "versus-duel";
    const a = document.createElement("strong");
    a.textContent = moi();
    const b = document.createElement("strong");
    b.textContent = adversaire();
    duel.append(a, document.createTextNode(" contre "), b);
    const statut = texte(etatTexte, "versus-statut" + (monTour ? " a-toi" : ""));
    const boutons = [bouton("Abandonner", abandonner)];
    if (!monTour && silence > SILENCE_ABANDON) {
      boutons.unshift(bouton("Réclamer la victoire", reclamer, true));
    }
    panneau.append(ligne(duel, statut, ...boutons));
  }

  async function rendreFin(resultat, raison) {
    panneau.innerHTML = "";
    const mots = { victoire: "Victoire", defaite: "Défaite", nul: "Partie nulle" };
    const pourquoi = {
      abandon: resultat === "victoire" ? adversaire() + " abandonne." : "Tu as abandonné.",
      absent: resultat === "victoire" ? adversaire() + " a quitté la partie." : "Partie perdue par absence.",
      desaccord: "Les deux appareils ne voyaient pas le même résultat : partie nulle."
    }[raison] || "";
    const titre = texte(mots[resultat] + " contre " + adversaire(), "versus-titre resultat-" + resultat);
    const note = texte("", "versus-texte");
    panneau.append(titre);
    if (pourquoi) {
      panneau.append(texte(pourquoi));
    }
    panneau.append(note, ligne(
      bouton("Nouvelle partie en ligne", () => { partie = null; etat = "accueil"; rendreAccueil(); }, true),
      bouton("Retour à l'IA", fermer)
    ));
    try {
      const ligneNote = await rpc("versus_ma_note", { p_jeu: jeu });
      const n = Array.isArray(ligneNote) ? ligneNote[0] : ligneNote;
      if (n && n.note !== undefined) {
        note.textContent = "Ta cote " + nomJeu + " : " + n.note + " (" + n.victoires + " victoire" + (n.victoires > 1 ? "s" : "")
          + " en " + n.parties + " partie" + (n.parties > 1 ? "s" : "") + ")";
      }
    } catch (erreur) {
      // la cote s'affichera la prochaine fois
    }
  }

  // ----- Cycle de vie -----

  function brancher(p) {
    if (!p || !p.id) {
      return;
    }
    partie = p;
    etat = "accueil";
    connus = 0;
    resultatAnnonce = false;
    vuAdversaire = null;
    vuChangeLe = 0;
    monCote = p.joueur_a === monIdentifiant ? 1 : 2;
    traiter(p);
    planifier();
  }

  function traiter(p) {
    partie = p;
    if (p.etat === "annulee") {
      etat = "accueil";
      partie = null;
      memoriserEnCours();
      messageAccueil = "La partie a été annulée.";
      rendreAccueil();
      return;
    }
    if (p.etat === "attente") {
      if (etat !== "attente") {
        etat = "attente";
        memoriserEnCours();
        rendreAttente();
      }
      return;
    }
    const vu = monCote === 1 ? p.vu_b : p.vu_a;
    if (vu !== vuAdversaire) {
      vuAdversaire = vu;
      vuChangeLe = Date.now();
    }
    const coups = Array.isArray(p.coups) ? p.coups : [];
    if (etat !== "jeu" && etat !== "fin") {
      etat = "jeu";
      memoriserEnCours();
      connus = coups.length;
      surDebut({
        monCote,
        jeCommence: p.premier === monCote,
        graine: p.graine,
        moi: moi(),
        adversaire: adversaire(),
        options: p.options || {},
        coups: coups.map(k => ({ moi: k.j === monCote, c: k.c }))
      });
      rendreJeu();
    } else if (etat === "jeu") {
      for (let i = connus; i < coups.length; i++) {
        if (coups[i].j !== monCote) {
          surCoup(coups[i].c);
        }
      }
      connus = Math.max(connus, coups.length);
    }
    if (p.etat === "finie" && etat !== "fin") {
      etat = "fin";
      memoriserEnCours();
      const resultat = p.gagnant === 0 ? "nul" : p.gagnant === monCote ? "victoire" : "defaite";
      if (!resultatAnnonce || p.raison === "abandon" || p.raison === "absent" || p.raison === "desaccord") {
        surFin({ resultat, raison: p.raison });
      }
      rendreFin(resultat, p.raison);
      return;
    }
    if (etat === "jeu") {
      rendreJeu();
    }
  }

  function planifier() {
    clearTimeout(minuteur);
    if (etat !== "attente" && etat !== "jeu") {
      return;
    }
    const delai = etat === "attente" ? INTERVALLE_ATTENTE : monTour ? INTERVALLE_MON_TOUR : INTERVALLE_SON_TOUR;
    minuteur = setTimeout(sonder, document.hidden ? Math.max(delai, 4000) : delai);
  }

  async function sonder() {
    if (!partie || enVol) {
      planifier();
      return;
    }
    enVol = true;
    try {
      const p = await rpc("versus_lire", { p_id: partie.id });
      erreurReseau = false;
      // Un envoi en cours sera compte a son retour
      traiter(p);
    } catch (erreur) {
      erreurReseau = true;
      if (etat === "jeu") {
        rendreJeu();
      }
    } finally {
      enVol = false;
      planifier();
    }
  }

  async function annulerAttente() {
    const p = partie;
    clearTimeout(minuteur);
    etat = "accueil";
    partie = null;
    memoriserEnCours();
    rendreAccueil();
    if (p) {
      try {
        await rpc("versus_fin", { p_id: p.id, p_gagnant: null, p_raison: "annule" });
      } catch (erreur) {
        // elle expirera d'elle-meme
      }
    }
  }

  async function abandonner() {
    if (!partie || etat !== "jeu") {
      return;
    }
    if (!confirm("Abandonner la partie contre " + adversaire() + " ?")) {
      return;
    }
    try {
      traiter(await rpc("versus_fin", { p_id: partie.id, p_gagnant: null, p_raison: "abandon" }));
    } catch (erreur) {
      erreurReseau = true;
      rendreJeu();
    }
  }

  async function reclamer() {
    if (!partie) {
      return;
    }
    try {
      traiter(await rpc("versus_fin", { p_id: partie.id, p_gagnant: null, p_raison: "absent" }));
    } catch (erreur) {
      erreurReseau = true;
      rendreJeu();
    }
  }

  function ouvrir(codePrerempli) {
    if (!versusDisponible()) {
      return false;
    }
    panneau.hidden = false;
    if (etat === "jeu" || etat === "attente") {
      return true;
    }
    etat = "accueil";
    rendreAccueil(codePrerempli);
    return true;
  }

  function fermer() {
    if (etat === "jeu") {
      if (!confirm("Quitter le Versus abandonne la partie. Continuer ?")) {
        return;
      }
      rpc("versus_fin", { p_id: partie.id, p_gagnant: null, p_raison: "abandon" }).catch(() => {});
    } else if (etat === "attente") {
      annulerAttente();
    }
    clearTimeout(minuteur);
    etat = "ferme";
    partie = null;
    memoriserEnCours();
    panneau.hidden = true;
    panneau.innerHTML = "";
    if (typeof surFermeture === "function") {
      surFermeture();
    }
  }

  // Le jeu est quitte (Retour) : on arrete de sonder, la partie reste
  // reprenable depuis le panneau tant que l'adversaire attend.
  function suspendre() {
    clearTimeout(minuteur);
    if (etat === "jeu" || etat === "attente") {
      memoriserEnCours();
    }
  }

  function reprendreSondage() {
    if (etat === "jeu" || etat === "attente") {
      planifier();
    }
  }

  // Envoi d'un coup, dans MON repere. Les envois partent dans l'ordre.
  function envoyer(coup) {
    if (!partie || etat !== "jeu") {
      return Promise.resolve(false);
    }
    const id = partie.id;
    envois = envois.then(async () => {
      for (let essai = 0; essai < 4; essai++) {
        try {
          const p = await rpc("versus_jouer", { p_id: id, p_index: connus, p_coup: coup });
          erreurReseau = false;
          connus = Math.max(connus, Array.isArray(p.coups) ? p.coups.length : connus + 1);
          partie = p;
          return true;
        } catch (erreur) {
          if (erreur.message === "desynchronise") {
            // Le coup est peut-etre deja passe (reponse perdue) : on relit
            try {
              const p = await rpc("versus_lire", { p_id: id });
              const coups = Array.isArray(p.coups) ? p.coups : [];
              const dernier = coups[coups.length - 1];
              if (dernier && dernier.j === monCote && JSON.stringify(dernier.c) === JSON.stringify(coup)) {
                connus = coups.length;
                return true;
              }
              traiter(p);
            } catch (e) {
              // on reessaie plus bas
            }
          } else if (erreur.message === "partie terminee") {
            sonder();
            return false;
          }
          erreurReseau = true;
          rendreJeu();
          await new Promise(r => setTimeout(r, 1200 * (essai + 1)));
        }
      }
      return false;
    });
    return envois;
  }

  // Le moteur local a vu la fin : on la declare. "victoire" est la mienne.
  function terminer(resultat, raison) {
    if (!partie || etat !== "jeu") {
      return;
    }
    resultatAnnonce = true;
    const gagnant = resultat === "nul" ? 0 : resultat === "victoire" ? monCote : 3 - monCote;
    envois.then(() => rpc("versus_fin", { p_id: partie.id, p_gagnant: gagnant, p_raison: raison || "fin" }))
      .then(p => { if (p) { traiter(p); } })
      .catch(() => {});
    // L'adversaire declare aussi : on continue de sonder jusqu'a la fin
    planifier();
  }

  function tour(estMonTour) {
    monTour = !!estMonTour;
    if (etat === "jeu") {
      rendreJeu();
      planifier();
    }
  }

  // Arrivee par un lien : le jeu se met d'abord en mode "En ligne"
  function ouvrirDepuisLien(code) {
    if (typeof passerEnLigne === "function") {
      passerEnLigne();
    }
    if (etat === "accueil" || etat === "ferme") {
      etat = "ferme";
    }
    return ouvrir(code);
  }

  const session = {
    ouvrir,
    ouvrirDepuisLien,
    fermer,
    suspendre,
    reprendreSondage,
    envoyer,
    terminer,
    tour,
    get actif() { return etat === "jeu"; },
    get ouvert() { return etat !== "ferme"; },
    get monCote() { return monCote; },
    get adversaire() { return adversaire(); },
    // Rafraichit le texte (appele chaque seconde pour le compteur de silence)
    rafraichir() { if (etat === "jeu") { rendreJeu(); } }
  };
  sessions.set(jeu, session);
  return session;
}

// Le texte de silence evolue sans nouvelle donnee : petit battement
setInterval(() => {
  sessions.forEach(s => s.rafraichir());
}, 5000);

// ---------------------------------------------------------------------
// Lien d'invitation : ?versus=CODE ouvre le bon jeu, code pre-rempli
// ---------------------------------------------------------------------

export async function ouvrirLienVersus() {
  let code = "";
  try {
    code = nettoyerCode(new URLSearchParams(location.search).get("versus"));
  } catch (erreur) {
    code = "";
  }
  if (code.length !== 5 || !versusDisponible()) {
    return;
  }
  history.replaceState(null, "", location.pathname + location.hash);
  // Le jeu de la partie n'est connu qu'en la lisant : on demande au
  // serveur via la fonction de lecture du code
  try {
    const jeu = await rpc("versus_jeu_du_code", { p_code: code });
    const session = sessions.get(jeu);
    if (!session) {
      return;
    }
    ouvrirJeuParId(jeu);
    session.ouvrirDepuisLien(code);
  } catch (erreur) {
    // code inconnu : on reste sur la calculatrice
  }
}
