-- =====================================================================
--  TANUKI ARCADE - schema "arcade" dans le Supabase du portfolio
--  Aucune table partagee avec le portfolio : tout vit dans ce schema.
--  Lecture publique du classement par une fonction ; ecriture uniquement
--  par la fonction Edge "soumettre-score" (cle d'administration cote
--  serveur). Les sauvegardes appartiennent a chaque joueur (anonyme ou
--  non) et ne sont lisibles que par lui.
-- =====================================================================

create schema if not exists arcade;

-- Regles de chaque classement (reprises de apps-script/Code.gs)
create table if not exists arcade.regles (
  jeu      text primary key,          -- identifiant, ou motif si est_motif
  sens     text not null check (sens in ('haut', 'bas')),
  min      bigint not null,
  max      bigint not null,
  est_motif boolean not null default false
);

-- Un joueur = un compte Supabase Auth (connexion anonyme au depart)
create table if not exists arcade.joueurs (
  id         uuid primary key references auth.users (id) on delete cascade,
  pseudo     text not null default 'AAA' check (pseudo ~ '^[A-Z0-9]{1,8}$'),
  cree_le    timestamptz not null default now()
);

create table if not exists arcade.scores (
  id         bigint generated always as identity primary key,
  jeu        text not null check (char_length(jeu) <= 64),
  joueur     uuid references arcade.joueurs (id) on delete set null,
  pseudo     text not null check (pseudo ~ '^[A-Z0-9]{1,8}$'),
  score      bigint not null,
  cree_le    timestamptz not null default now(),
  origine    text not null default 'arcade'   -- 'arcade' ou 'import-sheets'
);
create index if not exists scores_jeu_score on arcade.scores (jeu, score desc);
create index if not exists scores_joueur_recent on arcade.scores (joueur, cree_le desc);

-- Sauvegarde cloud : une ligne par joueur et par cle (ex. "omamori-crush")
create table if not exists arcade.sauvegardes (
  joueur     uuid not null references arcade.joueurs (id) on delete cascade,
  cle        text not null check (char_length(cle) <= 64),
  donnees    jsonb not null,
  maj_le     timestamptz not null default now(),
  primary key (joueur, cle)
);

-- ---------------------------------------------------------------------
-- Securite : RLS partout, aucune ecriture directe sur les scores
-- ---------------------------------------------------------------------

alter table arcade.regles enable row level security;
alter table arcade.joueurs enable row level security;
alter table arcade.scores enable row level security;
alter table arcade.sauvegardes enable row level security;

drop policy if exists "regles lisibles" on arcade.regles;
create policy "regles lisibles" on arcade.regles for select using (true);

drop policy if exists "mon profil" on arcade.joueurs;
create policy "mon profil" on arcade.joueurs for select using (auth.uid() = id);
drop policy if exists "creer mon profil" on arcade.joueurs;
create policy "creer mon profil" on arcade.joueurs for insert with check (auth.uid() = id);
drop policy if exists "changer mon pseudo" on arcade.joueurs;
create policy "changer mon pseudo" on arcade.joueurs for update using (auth.uid() = id) with check (auth.uid() = id);

-- Les scores se lisent par la fonction ci-dessous, et s'ecrivent par la
-- fonction Edge (cle d'administration). Pas de politique d'ecriture ici.
drop policy if exists "scores lisibles" on arcade.scores;
create policy "scores lisibles" on arcade.scores for select using (true);

drop policy if exists "mes sauvegardes" on arcade.sauvegardes;
create policy "mes sauvegardes" on arcade.sauvegardes for select using (auth.uid() = joueur);
drop policy if exists "ecrire mes sauvegardes" on arcade.sauvegardes;
create policy "ecrire mes sauvegardes" on arcade.sauvegardes for insert with check (auth.uid() = joueur);
drop policy if exists "maj mes sauvegardes" on arcade.sauvegardes;
create policy "maj mes sauvegardes" on arcade.sauvegardes for update using (auth.uid() = joueur) with check (auth.uid() = joueur);

-- ---------------------------------------------------------------------
-- Lecture du classement : le meilleur score de chaque pseudo, top 10
-- ---------------------------------------------------------------------

create or replace function arcade.regle_de(p_jeu text)
returns arcade.regles
language sql stable security definer set search_path = arcade, public as $$
  select r.* from arcade.regles r
  where (not r.est_motif and r.jeu = p_jeu) or (r.est_motif and p_jeu ~ r.jeu)
  order by r.est_motif limit 1;
$$;

create or replace function arcade.meilleurs_scores(p_jeu text, p_nombre int default 10)
returns table (nom text, score bigint, date text)
language plpgsql stable security definer set search_path = arcade, public as $$
declare
  r arcade.regles;
begin
  r := arcade.regle_de(p_jeu);
  if r.jeu is null then
    return;
  end if;
  return query
    select s.pseudo, case when r.sens = 'bas' then min(s.score) else max(s.score) end as meilleur,
           to_char(max(s.cree_le) at time zone 'Europe/Brussels', 'YYYY-MM-DD')
    from arcade.scores s
    where s.jeu = p_jeu
    group by s.pseudo
    order by case when r.sens = 'bas' then min(s.score) end asc nulls last,
             case when r.sens = 'haut' then max(s.score) end desc nulls last
    limit least(greatest(p_nombre, 1), 50);
end;
$$;

grant usage on schema arcade to anon, authenticated;
grant select on arcade.regles to anon, authenticated;
grant select, insert, update on arcade.joueurs to authenticated;
grant select, insert, update on arcade.sauvegardes to authenticated;
grant execute on function arcade.meilleurs_scores(text, int) to anon, authenticated;
grant execute on function arcade.regle_de(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Regles des classements
-- ---------------------------------------------------------------------

insert into arcade.regles (jeu, sens, min, max, est_motif) values
  ('2048', 'haut', 1, 5000000, false),
  ('snake', 'haut', 1, 5000, false),
  ('tetris', 'haut', 1, 2000000, false),
  ('solitaire', 'bas', 1, 32, false),
  ('blackjack', 'haut', 1, 1000000, false),
  ('casse-briques', 'haut', 1, 500000, false),
  ('invaders', 'haut', 1, 500000, false),
  ('mahjong', 'bas', 60, 36000, false),
  ('sudoku-facile', 'bas', 60, 36000, false),
  ('sudoku-moyen', 'bas', 90, 36000, false),
  ('sudoku-difficile', 'bas', 120, 36000, false),
  ('sudoku-extreme', 'bas', 150, 36000, false),
  ('pong', 'haut', 1, 2000000, false),
  ('demineur-facile', 'bas', 1, 36000, false),
  ('demineur-moyen', 'bas', 5, 36000, false),
  ('demineur-difficile', 'bas', 10, 36000, false),
  ('dames-facile', 'haut', 1, 1000000, false),
  ('dames-moyen', 'haut', 1, 1000000, false),
  ('dames-difficile', 'haut', 1, 1000000, false),
  ('puissance4-facile', 'haut', 1, 1000000, false),
  ('puissance4-moyen', 'haut', 1, 1000000, false),
  ('puissance4-difficile', 'haut', 1, 1000000, false),
  ('tanukiland', 'haut', 1, 10000000, false),
  ('yokai-invaders', 'haut', 1, 5000000, false),
  ('bake-danuki', 'haut', 1, 5000000, false),
  ('tetris-sprint', 'bas', 15000, 3600000, false),
  ('mahjong-pagode', 'bas', 30, 36000, false),
  ('mahjong-pont', 'bas', 30, 36000, false),
  ('mahjong-dragon', 'bas', 30, 36000, false),
  ('solitaire-europeen', 'bas', 1, 36, false),
  ('solitaire-asymetrique', 'bas', 1, 38, false),
  ('solitaire-triangle', 'bas', 1, 14, false),
  ('karasu', 'haut', 1, 5000000, false),
  ('bunbuku', 'haut', 1, 5000000, false),
  ('kappa', 'haut', 1, 5000000, false),
  ('tanuki-run', 'haut', 1, 1000000, false),
  ('flappy-tengu', 'haut', 1, 10000, false),
  ('pagode', 'haut', 1, 5000, false),
  ('gassen', 'haut', 1, 20000, false),
  ('omamori', 'haut', 1, 1000000000, false),
  ('toro', 'haut', 1, 1000000000, false),
  ('motus-5', 'haut', 1, 1000000, false),
  ('motus-6', 'haut', 1, 1000000, false),
  ('motus-7', 'haut', 1, 1000000, false),
  ('motus-8', 'haut', 1, 1000000, false),
  ('oekaki-5', 'bas', 5, 36000, false),
  ('oekaki-10', 'bas', 5, 36000, false),
  ('oekaki-15', 'bas', 5, 36000, false),
  ('go-facile', 'haut', 5, 900, false),
  ('go-moyen', 'haut', 5, 900, false),
  ('go-difficile', 'haut', 5, 900, false),
  ('oshidashi-facile', 'haut', 100, 1000, false),
  ('oshidashi-moyen', 'haut', 100, 1000, false),
  ('oshidashi-difficile', 'haut', 100, 1000, false),
  ('koikoi', 'haut', 1, 600, false),
  ('pachinko', 'haut', 1, 100000, false),
  ('matsuri', 'haut', 1, 50000000, false),
  ('shogi-facile', 'haut', 1, 100000, false),
  ('shogi-moyen', 'haut', 1, 100000, false),
  ('shogi-difficile', 'haut', 1, 100000, false),
  ('taiko', 'haut', 1, 100000000, false),
  ('bulles', 'haut', 1, 1000000000, false),
  ('^sudoku-jour-\d{4}-\d{2}-\d{2}$', 'bas', 30, 36000, true),
  ('^demineur-jour-\d{4}-\d{2}-\d{2}$', 'bas', 5, 36000, true),
  ('^motus-jour-[5-8]-\d{4}-\d{2}-\d{2}$', 'haut', 1, 20000, true)
on conflict (jeu) do update set sens = excluded.sens, min = excluded.min, max = excluded.max, est_motif = excluded.est_motif;
