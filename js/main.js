// =====================================================================
//  POINT D'ENTREE
//  Seul fichier charge par index.html. Il importe le noyau puis chaque
//  jeu, dans l'ordre ou les balises script les chargeaient avant.
//  Chaque jeu s'enregistre tout seul au moment de son import, l'ordre
//  decide donc de l'ordre d'affichage dans le menu arcade.
// =====================================================================

import "./arcade.js";
import "./ruban.js";
import "./classement.js";
import "./calculatrice.js";
import "./snake.js";
import "./tetris.js";
import "./jeu-2048.js";
import "./solitaire.js";
import "./blackjack.js";
import "./casse-briques.js";
import "./sudoku.js";
import "./yokai-invaders.js";
import "./bake-danuki.js";
// V2 : nouveaux jeux
import "./motus.js";
import "./toro.js";
import "./oekaki.js";
import "./tanuki-run.js";
import "./flappy-tengu.js";
import "./pagode.js";
import "./karasu.js";
import "./bunbuku.js";
import "./kappa.js";
import "./go.js";
import "./koikoi.js";
import "./oshidashi.js";
import "./pachinko.js";
import "./matsuri.js";
import "./gassen.js";
import "./omamori.js";
import "./shogi.js";
import "./taiko.js";
import "./bulles.js";
import "./mahjong.js";
import "./pong.js";
import "./demineur.js";
import "./dames.js";
import "./puissance4.js";
import "./plateformer.js";
import { ouvrirLienVersus } from "./versus.js";

// Lien d'invitation au Versus (?versus=CODE) : ouvre le bon jeu
ouvrirLienVersus();
// Hors ligne : le service worker met l'application en cache. Il ne
// s'installe que sur un vrai serveur (GitHub Pages, python -m http.server).
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("sw.js").catch(function () {
      // pas de cache hors ligne dans ce contexte : la page marche quand meme
    });
  });
}
