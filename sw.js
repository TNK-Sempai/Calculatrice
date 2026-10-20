// =====================================================================
//  SERVICE WORKER - Tanuki Calc hors ligne
//  Au premier passage, toute l'application est mise en cache. Ensuite
//  chaque fichier est servi depuis le cache tout de suite, puis
//  rafraichi en arriere-plan : la visite suivante a la derniere version.
//  Le classement en ligne (Apps Script) n'est jamais intercepte.
//  La liste ci-dessous se regenere avec : python outils/liste-cache.py
// =====================================================================

const VERSION = "tanuki-calc-20261021-0029";
const FICHIERS = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/arcade.css",
  "css/bake-danuki.css",
  "css/base.css",
  "css/blackjack.css",
  "css/bulles.css",
  "css/bunbuku.css",
  "css/casse-briques.css",
  "css/consentement.css",
  "css/dames.css",
  "css/demineur.css",
  "css/facade.css",
  "css/flappy-tengu.css",
  "css/gassen.css",
  "css/go.css",
  "css/jeu-2048.css",
  "css/kappa.css",
  "css/karasu.css",
  "css/koikoi.css",
  "css/mahjong.css",
  "css/manette.css",
  "css/matsuri.css",
  "css/motus.css",
  "css/oekaki.css",
  "css/omamori.css",
  "css/oshidashi.css",
  "css/pachinko.css",
  "css/pagode.css",
  "css/plateformer.css",
  "css/polices.css",
  "css/pong.css",
  "css/puissance4.css",
  "css/shogi.css",
  "css/snake.css",
  "css/solitaire.css",
  "css/sudoku.css",
  "css/taiko.css",
  "css/tanuki-run.css",
  "css/tetris.css",
  "css/toro.css",
  "css/versus.css",
  "css/yokai-invaders.css",
  "js/arcade.js",
  "js/bake-danuki.js",
  "js/blackjack.js",
  "js/bulles.js",
  "js/bunbuku.js",
  "js/calculatrice.js",
  "js/casse-briques.js",
  "js/classement.js",
  "js/consentement.js",
  "js/dames.js",
  "js/demineur.js",
  "js/flappy-tengu.js",
  "js/gassen.js",
  "js/go.js",
  "js/jeu-2048.js",
  "js/kappa.js",
  "js/karasu.js",
  "js/koikoi.js",
  "js/mahjong.js",
  "js/main.js",
  "js/matsuri.js",
  "js/motus.js",
  "js/oekaki.js",
  "js/omamori.js",
  "js/oshidashi.js",
  "js/pachinko.js",
  "js/pagode.js",
  "js/panneaux-classement.js",
  "js/plateformer.js",
  "js/pong.js",
  "js/puissance4.js",
  "js/ruban.js",
  "js/shogi.js",
  "js/snake.js",
  "js/solitaire.js",
  "js/sudoku.js",
  "js/taiko.js",
  "js/tanuki-run.js",
  "js/tetris.js",
  "js/toro.js",
  "js/versus.js",
  "js/yokai-invaders.js",
  "js/bulles/moteur.js",
  "js/gassen/terrain.js",
  "js/go/ia.js",
  "js/go/moteur.js",
  "js/koikoi/cartes.js",
  "js/koikoi/regles.js",
  "js/motus/mots-5.js",
  "js/motus/mots-6.js",
  "js/motus/mots-7.js",
  "js/motus/mots-8.js",
  "js/niveaux/01-bac-a-sable.js",
  "js/niveaux/faisabilite.js",
  "js/niveaux/format.js",
  "js/niveaux/index.js",
  "js/niveaux/monde1/01-oree.js",
  "js/niveaux/monde1/02-riviere.js",
  "js/niveaux/monde1/03-sanctuaire.js",
  "js/niveaux/monde2/01-ruelles.js",
  "js/niveaux/monde2/02-canal.js",
  "js/niveaux/monde2/03-chateau.js",
  "js/noyau/boucle.js",
  "js/noyau/camera.js",
  "js/noyau/choix.js",
  "js/noyau/chrono.js",
  "js/noyau/clavier.js",
  "js/noyau/effets.js",
  "js/noyau/manette.js",
  "js/noyau/message.js",
  "js/noyau/outils.js",
  "js/noyau/physique.js",
  "js/noyau/pointeur.js",
  "js/noyau/son.js",
  "js/noyau/sprite.js",
  "js/noyau/stockage.js",
  "js/noyau/tactile.js",
  "js/oekaki/images.js",
  "js/omamori/moteur.js",
  "js/oshidashi/moteur.js",
  "js/pachinko/physique.js",
  "js/shogi/ia.js",
  "js/shogi/moteur.js",
  "js/taiko/morceaux.js",
  "js/tanukiland/objets.js",
  "js/tanukiland/partie.js",
  "js/tanukiland/rendu.js",
  "js/tanukiland/sprites.js",
  "js/tanukiland/yokai.js",
  "fonts/anybody-ext.woff2",
  "fonts/anybody.woff2",
  "fonts/hanken-grotesk.woff2",
  "fonts/martian-mono-400.woff2",
  "fonts/martian-mono-600.woff2",
  "fonts/shippori-jp.woff2",
  "icones/apple-touch-icon.png",
  "icones/favicon-32.png",
  "icones/icone-192.png",
  "icones/icone-512.png",
  "icones/icone-maskable-512.png"
];

self.addEventListener("install", function (evenement) {
  evenement.waitUntil(
    caches.open(VERSION).then(cache => cache.addAll(FICHIERS)).then(() => self.skipWaiting())
  );
});

// Les anciens caches partent quand une nouvelle version prend la main
self.addEventListener("activate", function (evenement) {
  evenement.waitUntil(
    caches.keys()
      .then(cles => Promise.all(cles.filter(cle => cle !== VERSION).map(cle => caches.delete(cle))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", function (evenement) {
  const requete = evenement.request;
  if (requete.method !== "GET" || new URL(requete.url).origin !== self.location.origin) {
    return;
  }
  evenement.respondWith(
    caches.open(VERSION).then(function (cache) {
      return cache.match(requete, { ignoreSearch: true }).then(function (enCache) {
        const reseau = fetch(requete).then(function (reponse) {
          if (reponse && reponse.ok) {
            cache.put(requete, reponse.clone());
          }
          return reponse;
        }).catch(() => enCache);
        return enCache || reseau;
      });
    })
  );
});
