# Tanuki Calc

Une calculatrice scientifique en ligne, gratuite et utilisable hors ligne.
Enfin, presque : certains nombres cachent autre chose.

**En ligne :** https://tnk-sempai.github.io/Calculatrice/

## La calculatrice

- Trigonométrie (degrés ou radians) et fonctions inverses, logarithmes, exponentielles
- Puissances, racines carrée et cubique, factorielle (y compris non entière), inverse, pourcentage
- Priorités respectées (`-3²` vaut `-9`, `2^3^2` vaut `512`), multiplication implicite (`2π`, `3(4+1)`)
- Parenthèses fermées d'office, aperçu du résultat en direct
- Ruban imprimé : l'historique des calculs, gardé sur l'appareil, un clic sur une ligne reprend son résultat
- Clavier physique complet, touches qui s'enfoncent à l'écran
- Installable (PWA) et utilisable sans connexion

## Le reste

Il y a des choses à trouver. Pas d'indice ici.

## Développement

Le projet est en HTML, CSS et JavaScript natifs (modules ES), sans dépendance ni étape de build.
Les modules ES ne se chargent pas en double-cliquant sur `index.html`, il faut un petit serveur :

```
python -m http.server
```

puis http://localhost:8000.

### Après avoir ajouté ou renommé un fichier

Le service worker (`sw.js`) met toute l'application en cache pour le hors ligne. Sa liste se régénère avec :

```
python outils/liste-cache.py
```

Ça change aussi la version du cache, ce qui pousse la mise à jour aux visiteurs.

### Polices

Les polices sont hébergées dans `fonts/` (Anybody, Hanken Grotesk, Martian Mono, Shippori Mincho B1, toutes sous licence OFL).
Shippori Mincho est réduite aux seuls caractères japonais affichés dans l'interface : si tu ajoutes un nom japonais, il faut régénérer `fonts/shippori-jp.woff2` :

```
npm install @fontsource/shippori-mincho-b1
pip install fonttools brotli
python outils/sous-ensemble-jp.py node_modules/@fontsource/shippori-mincho-b1
```

Le script relève lui-même tous les caractères japonais présents dans `js/` et `index.html`.

### Classement en ligne

Les scores passent par un Google Apps Script (`apps-script/Code.gs`) qui écrit dans une feuille Google Sheets. Le script refuse tout jeu qu'il ne connaît pas : chaque nouveau classement doit être déclaré dans `JEUX`, puis le script redéployé (Déployer, Gérer les déploiements, modifier, Nouvelle version) pour garder la même URL.

## Structure

```
index.html            la page, une seule balise script
css/                  polices, base commune, façade, arcade, un fichier par jeu
js/main.js            point d'entrée
js/calculatrice.js    saisie et moteur de calcul (analyseur, sans eval)
js/ruban.js           historique imprimé
js/arcade.js          registre, carnet, menu, écran titre, scores
js/noyau/             boîte à outils partagée (son, effets, sprites, manette tactile)
js/<jeu>.js           un module par jeu, parfois avec un dossier js/<jeu>/
apps-script/Code.gs   classement en ligne (Google Apps Script)
outils/               cache du service worker, police japonaise
fonts/  icones/       ressources hébergées
sw.js  manifest.webmanifest
```

Un projet [Tanuki Corporation](https://tanuki-corporation.com/).
