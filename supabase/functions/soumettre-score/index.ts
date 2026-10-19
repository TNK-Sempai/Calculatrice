// =====================================================================
//  soumettre-score : seule porte d'entree pour ecrire un score.
//  Le joueur est connu par son jeton Supabase (connexion anonyme).
//  Verifie : regle du jeu, bornes, pseudo, frequence (anti-spam),
//  doublons. Ecrit avec la cle d'administration, jamais exposee.
// =====================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const ENVOIS_PAR_HEURE = 60;
const SECONDES_ANTI_DOUBLON = 60;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function reponse(corps: unknown, statut = 200) {
  return new Response(JSON.stringify(corps), { status: statut, headers: { ...CORS, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }
  if (req.method !== "POST") {
    return reponse({ erreur: "Methode refusee" }, 405);
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { db: { schema: "arcade" } });

  // Qui envoie ? Le jeton du joueur, verifie aupres de Supabase Auth
  const jeton = (req.headers.get("Authorization") || "").replace("Bearer ", "");
  const { data: qui, error: erreurAuth } = await admin.auth.getUser(jeton);
  if (erreurAuth || !qui?.user) {
    return reponse({ erreur: "Joueur inconnu" }, 401);
  }
  const joueur = qui.user.id;

  let corps: { jeu?: string; nom?: string; score?: number };
  try {
    corps = await req.json();
  } catch {
    return reponse({ erreur: "Corps illisible" }, 400);
  }
  const jeu = String(corps.jeu || "").slice(0, 64);
  const score = Number(corps.score);
  const pseudo = (String(corps.nom || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8)) || "AAA";

  const { data: regle } = await admin.rpc("regle_de", { p_jeu: jeu });
  if (!regle || !regle.jeu) {
    return reponse({ erreur: "Jeu inconnu" }, 400);
  }
  if (!Number.isFinite(score) || !Number.isInteger(score) || score < regle.min || score > regle.max) {
    return reponse({ erreur: "Score hors limites" }, 400);
  }

  // Frequence : pas plus de ENVOIS_PAR_HEURE envois par joueur et par heure
  const depuis = new Date(Date.now() - 3600 * 1000).toISOString();
  const { count } = await admin.from("scores").select("id", { count: "exact", head: true }).eq("joueur", joueur).gte("cree_le", depuis);
  if ((count || 0) >= ENVOIS_PAR_HEURE) {
    return reponse({ erreur: "Trop d'envois, reessaie plus tard" }, 429);
  }

  // Profil du joueur (cree au premier score), pseudo mis a jour
  await admin.from("joueurs").upsert({ id: joueur, pseudo });

  // Meme joueur, meme jeu, meme score il y a moins d'une minute : doublon
  const recent = new Date(Date.now() - SECONDES_ANTI_DOUBLON * 1000).toISOString();
  const { count: doublons } = await admin.from("scores").select("id", { count: "exact", head: true })
    .eq("joueur", joueur).eq("jeu", jeu).eq("score", score).gte("cree_le", recent);
  if (!doublons) {
    const { error } = await admin.from("scores").insert({ jeu, joueur, pseudo, score });
    if (error) {
      return reponse({ erreur: "Enregistrement impossible" }, 500);
    }
  }

  const { data: scores } = await admin.rpc("meilleurs_scores", { p_jeu: jeu, p_nombre: 10 });
  return reponse({ jeu, sens: regle.sens, scores: scores || [] });
});
