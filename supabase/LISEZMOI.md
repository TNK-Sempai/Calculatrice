# Classement et sauvegardes sur Supabase

L'arcade utilise le projet Supabase du portfolio (`rdmtduvghupgqqwgrsgz`), dans un schéma `arcade` qui n'a aucune table commune avec le portfolio. Le site reste sur GitHub Pages : le navigateur appelle Supabase directement.

## Mise en place (une seule fois)

1. **Créer le schéma** : SQL Editor, coller le contenu de `migrations/20261019000000_arcade.sql`, exécuter. Puis faire de même avec `migrations/20261019010000_versus.sql` (Versus en ligne). Les deux fichiers peuvent être relancés sans risque.
2. **Exposer le schéma** : Project Settings > Data API > Exposed schemas, ajouter `arcade`.
3. **Connexion anonyme** : Authentication > Sign In / Providers, activer « Allow anonymous sign-ins ». Activer aussi la protection CAPTCHA plus tard si le trafic monte.
4. **Déployer la fonction** `functions/soumettre-score` (CLI : `supabase functions deploy soumettre-score`, ou Edge Functions > Deploy a new function > coller `index.ts`, nom `soumettre-score`, vérification JWT activée).
5. **Brancher le site** : dans `js/classement.js`, coller la clé publique du projet (Project Settings > API Keys, la clé `anon` ou `sb_publishable_...`) dans `SUPABASE.clePublique`. Dès qu'elle est remplie, l'arcade passe de Google Apps Script à Supabase. Ne jamais mettre la clé `service_role` dans le code.
6. **Reprendre les anciens scores** : dans la feuille Google, Fichier > Télécharger > CSV de l'onglet des scores, puis `python outils/importer-scores-sheets.py scores.csv > import.sql` et coller `import.sql` dans le SQL Editor.

## Ce qui est protégé

- Les scores ne s'écrivent que par la fonction `soumettre-score` : jeu connu, score dans les bornes de `arcade.regles`, 60 envois par heure et par joueur au maximum, doublons ignorés.
- Les sauvegardes (`arcade.sauvegardes`) ne sont lisibles et modifiables que par leur propriétaire (RLS).
- Ajouter un jeu : une ligne dans `arcade.regles` (plus besoin de redéployer quoi que ce soit).

## Versus en ligne

Dès que la clé publique est renseignée, un bouton « En ligne » apparaît dans Shōgi, Go, Dames, Puissance 4 et Oshidashi.

- **Trouver un adversaire** : partie rapide (file d'attente), ou « Inviter un ami » qui donne un code de 5 caractères et un lien `?versus=CODE`. Le lien ouvre directement le bon jeu avec le code pré-rempli.
- **Déroulement** : chaque coup est ajouté à `arcade.parties.coups` par la fonction `versus_jouer`. Les deux navigateurs relisent la partie toutes les secondes environ quand c'est à l'adversaire de jouer, et rejouent les coups avec le moteur du jeu. Aucun coup illégal n'est accepté par le moteur adverse.
- **Fin** : chaque navigateur déclare le résultat vu par son moteur. Si les deux concordent, la partie est close et la cote Elo (`arcade.elo`, départ à 1200, K = 32) est mise à jour. S'ils divergent, la partie est déclarée nulle. Abandon immédiat possible. Si l'adversaire ne donne plus signe de vie pendant 2 minutes, on peut réclamer la victoire.
- **Reprise** : une partie en cours se retrouve après un rechargement (bouton « Reprendre ma partie »).
- **Sécurité** : la table `arcade.parties` n'est lisible que par ses deux joueurs (RLS) et ne s'écrit que par les fonctions `versus_*`.
- **Temps réel** : la table est ajoutée à la publication `supabase_realtime`, mais le site n'en dépend pas pour l'instant (lecture régulière, plus simple et sans SDK).

