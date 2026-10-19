// =====================================================================
//  NOYAU - gestes tactiles
//  Un glissement du doigt rend son deplacement et dit s'il s'agit plutot
//  d'une tape. Le jeu decide ensuite quoi en faire : le noyau ne traduit
//  pas les gestes en commandes.
// =====================================================================

// gestionnaire({ deltaX, deltaY, tape, horizontal, evenement })
// seuil : en deca, le geste compte comme une tape.
// actif() : consultee au relachement, pour ignorer le geste si besoin.
export function surGlissement(element, gestionnaire, options) {
  const reglages = options || {};
  const seuil = reglages.seuil === undefined ? 20 : reglages.seuil;
  const actif = reglages.actif || (() => true);
  let depart = null;

  element.addEventListener("touchstart", function (evenement) {
    const contact = evenement.touches[0];
    depart = { x: contact.clientX, y: contact.clientY };
  }, { passive: true });

  element.addEventListener("touchend", function (evenement) {
    if (depart === null || !actif()) {
      depart = null;
      return;
    }
    const contact = evenement.changedTouches[0];
    const deltaX = contact.clientX - depart.x;
    const deltaY = contact.clientY - depart.y;
    depart = null;

    gestionnaire({
      deltaX,
      deltaY,
      tape: Math.abs(deltaX) < seuil && Math.abs(deltaY) < seuil,
      horizontal: Math.abs(deltaX) > Math.abs(deltaY),
      evenement
    });
  });
}

// Suivi continu du doigt, pour les jeux ou le doigt pilote directement
// un element. surContact(clientX, clientY, evenement) est appelee au
// premier contact puis a chaque deplacement.
export function surDoigt(element, surContact, options) {
  const reglages = options || {};
  const actif = reglages.actif || (() => true);

  element.addEventListener("touchstart", function (evenement) {
    if (!actif()) {
      return;
    }
    const contact = evenement.touches[0];
    surContact(contact.clientX, contact.clientY, evenement);
  }, { passive: true });

  element.addEventListener("touchmove", function (evenement) {
    if (!actif()) {
      return;
    }
    const contact = evenement.touches[0];
    surContact(contact.clientX, contact.clientY, evenement);
  }, { passive: true });
}
