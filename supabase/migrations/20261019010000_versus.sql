-- =====================================================================
--  TANUKI ARCADE - Versus en ligne (a appliquer apres 20261019000000)
--  Une partie = une ligne de arcade.parties avec la liste des coups.
--  Les deux navigateurs rejouent les coups avec le moteur du jeu, donc
--  le serveur garde seulement l'ordre, les joueurs et le resultat.
--  Aucune ecriture directe : tout passe par les fonctions versus_*.
-- =====================================================================

create table if not exists arcade.parties (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique check (code ~ '^[A-Z0-9]{5}$'),
  jeu        text not null check (jeu in ('shogi', 'go', 'dames', 'puissance4', 'oshidashi', 'koikoi')),
  options    jsonb not null default '{}'::jsonb,
  publique   boolean not null default false,
  etat       text not null default 'attente' check (etat in ('attente', 'en_cours', 'finie', 'annulee')),
  joueur_a   uuid not null references arcade.joueurs (id) on delete cascade,
  joueur_b   uuid references arcade.joueurs (id) on delete cascade,
  pseudo_a   text not null,
  pseudo_b   text,
  premier    smallint not null default 1 check (premier in (1, 2)),
  graine     integer not null default floor(random() * 2147483647)::int,
  coups      jsonb not null default '[]'::jsonb,
  avis_a     smallint,
  avis_b     smallint,
  gagnant    smallint check (gagnant in (0, 1, 2)),   -- 0 nul, 1 joueur_a, 2 joueur_b
  raison     text,
  vu_a       timestamptz not null default now(),
  vu_b       timestamptz,
  cree_le    timestamptz not null default now(),
  maj_le     timestamptz not null default now()
);
create index if not exists parties_attente on arcade.parties (jeu, etat, publique, maj_le desc);
create index if not exists parties_joueur_a on arcade.parties (joueur_a, maj_le desc);
create index if not exists parties_joueur_b on arcade.parties (joueur_b, maj_le desc);

create table if not exists arcade.elo (
  joueur     uuid not null references arcade.joueurs (id) on delete cascade,
  jeu        text not null,
  note       integer not null default 1200,
  parties    integer not null default 0,
  victoires  integer not null default 0,
  maj_le     timestamptz not null default now(),
  primary key (joueur, jeu)
);

alter table arcade.parties enable row level security;
alter table arcade.elo enable row level security;

drop policy if exists "mes parties" on arcade.parties;
create policy "mes parties" on arcade.parties for select
  using (auth.uid() = joueur_a or auth.uid() = joueur_b);
drop policy if exists "elo lisible" on arcade.elo;
create policy "elo lisible" on arcade.elo for select using (true);

grant select on arcade.parties to authenticated;
grant select on arcade.elo to anon, authenticated;

-- ---------------------------------------------------------------------
-- Outils internes
-- ---------------------------------------------------------------------

create or replace function arcade.versus_moi(p_pseudo text)
returns uuid
language plpgsql security definer set search_path = arcade, public as $$
declare
  moi uuid := auth.uid();
  propre text := upper(coalesce(p_pseudo, ''));
begin
  if moi is null then
    raise exception 'connexion requise';
  end if;
  propre := regexp_replace(propre, '[^A-Z0-9]', '', 'g');
  if propre = '' then
    propre := 'AAA';
  end if;
  propre := left(propre, 8);
  insert into arcade.joueurs (id, pseudo) values (moi, propre)
    on conflict (id) do update set pseudo = excluded.pseudo;
  return moi;
end;
$$;

create or replace function arcade.versus_code()
returns text
language plpgsql volatile set search_path = arcade, public as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  essai text;
  i int;
begin
  loop
    essai := '';
    for i in 1..5 loop
      essai := essai || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from arcade.parties where code = essai);
  end loop;
  return essai;
end;
$$;

-- Fin de partie et mise a jour Elo (K = 32)
create or replace function arcade.versus_conclure(p_id uuid, p_gagnant smallint, p_raison text)
returns void
language plpgsql security definer set search_path = arcade, public as $$
declare
  p arcade.parties;
  na int; nb int; ea float; sa float; k int := 32;
begin
  update arcade.parties
     set etat = 'finie', gagnant = p_gagnant, raison = p_raison, maj_le = now()
   where id = p_id and etat = 'en_cours'
   returning * into p;
  if p.id is null or p.joueur_b is null then
    return;
  end if;
  insert into arcade.elo (joueur, jeu) values (p.joueur_a, p.jeu), (p.joueur_b, p.jeu)
    on conflict do nothing;
  select note into na from arcade.elo where joueur = p.joueur_a and jeu = p.jeu;
  select note into nb from arcade.elo where joueur = p.joueur_b and jeu = p.jeu;
  ea := 1.0 / (1.0 + power(10.0, (nb - na) / 400.0));
  sa := case p_gagnant when 1 then 1.0 when 2 then 0.0 else 0.5 end;
  update arcade.elo set note = na + round(k * (sa - ea))::int, parties = parties + 1,
         victoires = victoires + (case when p_gagnant = 1 then 1 else 0 end), maj_le = now()
   where joueur = p.joueur_a and jeu = p.jeu;
  update arcade.elo set note = nb + round(k * ((1.0 - sa) - (1.0 - ea)))::int, parties = parties + 1,
         victoires = victoires + (case when p_gagnant = 2 then 1 else 0 end), maj_le = now()
   where joueur = p.joueur_b and jeu = p.jeu;
end;
$$;

-- ---------------------------------------------------------------------
-- API appelee par le site (toutes en security definer)
-- ---------------------------------------------------------------------

create or replace function arcade.versus_creer(p_jeu text, p_options jsonb, p_publique boolean, p_pseudo text)
returns arcade.parties
language plpgsql security definer set search_path = arcade, public as $$
declare
  moi uuid := arcade.versus_moi(p_pseudo);
  p arcade.parties;
begin
  -- une seule partie en attente par joueur : on annule les precedentes
  update arcade.parties set etat = 'annulee', maj_le = now()
   where joueur_a = moi and etat = 'attente';
  insert into arcade.parties (code, jeu, options, publique, joueur_a, pseudo_a)
  values (arcade.versus_code(), p_jeu, coalesce(p_options, '{}'::jsonb), coalesce(p_publique, false), moi,
          (select pseudo from arcade.joueurs where id = moi))
  returning * into p;
  return p;
end;
$$;

create or replace function arcade.versus_rejoindre(p_code text, p_pseudo text)
returns arcade.parties
language plpgsql security definer set search_path = arcade, public as $$
declare
  moi uuid := arcade.versus_moi(p_pseudo);
  p arcade.parties;
begin
  select * into p from arcade.parties where code = upper(p_code) for update;
  if p.id is null then
    raise exception 'partie introuvable';
  end if;
  if p.joueur_a = moi or p.joueur_b = moi then
    return p;                                  -- deja dedans : on la reprend
  end if;
  if p.etat <> 'attente' then
    raise exception 'partie deja commencee';
  end if;
  update arcade.parties
     set joueur_b = moi, pseudo_b = (select pseudo from arcade.joueurs where id = moi),
         etat = 'en_cours', premier = (1 + floor(random() * 2))::smallint,
         vu_b = now(), maj_le = now()
   where id = p.id
   returning * into p;
  return p;
end;
$$;

create or replace function arcade.versus_rapide(p_jeu text, p_options jsonb, p_pseudo text)
returns arcade.parties
language plpgsql security definer set search_path = arcade, public as $$
declare
  moi uuid := arcade.versus_moi(p_pseudo);
  cible uuid;
  p arcade.parties;
begin
  select id into cible from arcade.parties
   where jeu = p_jeu and etat = 'attente' and publique
     and options = coalesce(p_options, '{}'::jsonb)
     and joueur_a <> moi and vu_a > now() - interval '45 seconds'
   order by cree_le
   limit 1
   for update skip locked;
  if cible is null then
    return arcade.versus_creer(p_jeu, p_options, true, p_pseudo);
  end if;
  update arcade.parties
     set joueur_b = moi, pseudo_b = (select pseudo from arcade.joueurs where id = moi),
         etat = 'en_cours', premier = (1 + floor(random() * 2))::smallint,
         vu_b = now(), maj_le = now()
   where id = cible
   returning * into p;
  return p;
end;
$$;

-- Lecture d'une partie ; sert aussi de signe de vie
create or replace function arcade.versus_lire(p_id uuid)
returns arcade.parties
language plpgsql security definer set search_path = arcade, public as $$
declare
  moi uuid := auth.uid();
  p arcade.parties;
begin
  update arcade.parties
     set vu_a = case when joueur_a = moi then now() else vu_a end,
         vu_b = case when joueur_b = moi then now() else vu_b end
   where id = p_id and (joueur_a = moi or joueur_b = moi)
   returning * into p;
  if p.id is null then
    raise exception 'partie introuvable';
  end if;
  return p;
end;
$$;

-- Ajout d'un coup. p_index = nombre de coups deja connus du client :
-- s'il ne correspond pas, quelqu'un a joue entre-temps et on refuse.
create or replace function arcade.versus_jouer(p_id uuid, p_index int, p_coup jsonb)
returns arcade.parties
language plpgsql security definer set search_path = arcade, public as $$
declare
  moi uuid := auth.uid();
  p arcade.parties;
  cote smallint;
begin
  select * into p from arcade.parties where id = p_id for update;
  if p.id is null or (p.joueur_a <> moi and p.joueur_b is distinct from moi) then
    raise exception 'partie introuvable';
  end if;
  if p.etat <> 'en_cours' then
    raise exception 'partie terminee';
  end if;
  if jsonb_array_length(p.coups) <> p_index then
    raise exception 'desynchronise';
  end if;
  if octet_length(p_coup::text) > 2048 or jsonb_array_length(p.coups) >= 2000 then
    raise exception 'coup refuse';
  end if;
  cote := case when p.joueur_a = moi then 1 else 2 end;
  update arcade.parties
     set coups = coups || jsonb_build_array(jsonb_build_object('j', cote, 'c', p_coup)),
         vu_a = case when cote = 1 then now() else vu_a end,
         vu_b = case when cote = 2 then now() else vu_b end,
         maj_le = now()
   where id = p_id
   returning * into p;
  return p;
end;
$$;

-- Resultat. 'abandon' : l'appelant perd tout de suite.
-- 'absent' : l'adversaire ne donne plus signe de vie depuis 2 minutes.
-- Sinon chaque joueur declare le gagnant vu par son moteur ; la partie
-- se termine quand les deux avis concordent.
create or replace function arcade.versus_fin(p_id uuid, p_gagnant smallint, p_raison text)
returns arcade.parties
language plpgsql security definer set search_path = arcade, public as $$
declare
  moi uuid := auth.uid();
  p arcade.parties;
  cote smallint;
  autre smallint;
begin
  select * into p from arcade.parties where id = p_id for update;
  if p.id is null or (p.joueur_a <> moi and p.joueur_b is distinct from moi) then
    raise exception 'partie introuvable';
  end if;
  cote := case when p.joueur_a = moi then 1 else 2 end;
  autre := 3 - cote;
  if p.etat = 'attente' then
    update arcade.parties set etat = 'annulee', maj_le = now() where id = p_id returning * into p;
    return p;
  end if;
  if p.etat <> 'en_cours' then
    return p;
  end if;
  if p_raison = 'abandon' then
    perform arcade.versus_conclure(p_id, autre, 'abandon');
  elsif p_raison = 'absent' then
    if (case when autre = 1 then p.vu_a else p.vu_b end) < now() - interval '2 minutes' then
      perform arcade.versus_conclure(p_id, cote, 'absent');
    end if;
  else
    if p_gagnant not in (0, 1, 2) then
      raise exception 'resultat invalide';
    end if;
    if cote = 1 then
      update arcade.parties set avis_a = p_gagnant where id = p_id returning * into p;
    else
      update arcade.parties set avis_b = p_gagnant where id = p_id returning * into p;
    end if;
    if p.avis_a is not null and p.avis_a = p.avis_b then
      perform arcade.versus_conclure(p_id, p.avis_a, left(coalesce(p_raison, 'fin'), 32));
    elsif p.avis_a is not null and p.avis_b is not null then
      perform arcade.versus_conclure(p_id, 0::smallint, 'desaccord');
    end if;
  end if;
  select * into p from arcade.parties where id = p_id;
  return p;
end;
$$;

-- Le jeu d'une partie a partir de son code (lien d'invitation)
create or replace function arcade.versus_jeu_du_code(p_code text)
returns text
language sql stable security definer set search_path = arcade, public as $$
  select jeu from arcade.parties where code = upper(p_code) and etat in ('attente', 'en_cours') limit 1;
$$;

-- Classement Versus d'un jeu
create or replace function arcade.versus_classement(p_jeu text, p_nombre int default 10)
returns table (nom text, note int, parties int, victoires int)
language sql stable security definer set search_path = arcade, public as $$
  select j.pseudo, e.note, e.parties, e.victoires
    from arcade.elo e join arcade.joueurs j on j.id = e.joueur
   where e.jeu = p_jeu and e.parties > 0
   order by e.note desc, e.parties desc
   limit least(greatest(p_nombre, 1), 50);
$$;

-- Ma note dans un jeu
create or replace function arcade.versus_ma_note(p_jeu text)
returns table (note int, parties int, victoires int)
language sql stable security definer set search_path = arcade, public as $$
  select e.note, e.parties, e.victoires from arcade.elo e
   where e.joueur = auth.uid() and e.jeu = p_jeu;
$$;

revoke all on function arcade.versus_moi(text) from public, anon, authenticated;
revoke all on function arcade.versus_code() from public, anon, authenticated;
revoke all on function arcade.versus_conclure(uuid, smallint, text) from public, anon, authenticated;

grant execute on function arcade.versus_creer(text, jsonb, boolean, text) to authenticated;
grant execute on function arcade.versus_rejoindre(text, text) to authenticated;
grant execute on function arcade.versus_rapide(text, jsonb, text) to authenticated;
grant execute on function arcade.versus_lire(uuid) to authenticated;
grant execute on function arcade.versus_jouer(uuid, int, jsonb) to authenticated;
grant execute on function arcade.versus_fin(uuid, smallint, text) to authenticated;
grant execute on function arcade.versus_jeu_du_code(text) to authenticated;
grant execute on function arcade.versus_classement(text, int) to anon, authenticated;
grant execute on function arcade.versus_ma_note(text) to authenticated;

-- Temps reel : les changements de parties sont diffuses aux deux joueurs
-- (filtres par la politique "mes parties"). Le site sait aussi s'en passer.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table arcade.parties;
    exception when duplicate_object then
      null;
    end;
  end if;
end;
$$;
