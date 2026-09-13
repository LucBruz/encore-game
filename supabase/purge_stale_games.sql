-- ─────────────────────────────────────────────────────────────────────────────
-- Purge quotidienne des parties inactives depuis plus de 30 jours
-- ─────────────────────────────────────────────────────────────────────────────
--
-- APPLIQUE le 2026-09-14 sur le projet Supabase « Encore » (migration
-- purge_stale_games_daily). Ce fichier est la trace dans le depot : le schema ne
-- vit que dans le projet distant. Le re-executer est sans risque, la
-- planification est idempotente.
--
-- Regle : une partie est supprimee quand sa derniere activite date de plus de
-- 30 jours. « Derniere activite » = son dernier evenement dans game_events, ou sa
-- creation si elle n'en a aucun.
--
-- Pourquoi pas le statut « finished » : l'application ne marque jamais une partie
-- comme terminee (aucune occurrence dans app/), elle reste « playing » pour
-- toujours. Et les 30 jours s'appliquent aussi aux parties terminees : les
-- supprimer des leur fin les rendrait inanalysables par /review.
--
-- Les cles etrangeres de game_players et game_events sont en ON DELETE CASCADE
-- (verifie) : supprimer la partie supprime aussi ses joueurs et ses evenements.
--
-- Etat au 2026-09-13 : 5 parties, aucune ne serait supprimee.


-- 1. ESSAI A BLANC — ne supprime rien. Liste ce que la purge effacerait.
select g.code,
       g.status,
       greatest(g.created_at, max(e.created_at)) as derniere_activite
from games g
left join game_events e on e.game_id = g.id
group by g.id
having greatest(g.created_at, max(e.created_at)) < now() - interval '30 days'
order by derniere_activite;


-- 2. LA FONCTION
create or replace function public.purge_stale_games()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    removed integer;
begin
    with stale as (
        select g.id
        from games g
        left join game_events e on e.game_id = g.id
        group by g.id
        -- greatest ignore les NULL ; une partie sans aucune date n'est jamais purgee.
        having greatest(g.created_at, max(e.created_at)) < now() - interval '30 days'
    )
    delete from games where id in (select id from stale);

    get diagnostics removed = row_count;
    return removed;
end;
$$;


-- 3. SECURITE — a ne pas omettre.
-- Toute fonction du schema public est appelable par n'importe quel visiteur via
-- l'API. Sans ce retrait, n'importe qui pourrait declencher la purge. La fonction
-- n'a volontairement aucun parametre : on ne peut pas abaisser le delai.
revoke execute on function public.purge_stale_games() from public, anon, authenticated;


-- 4. PLANIFICATION — chaque nuit a 03:17 UTC. Relancable sans doublon.
select cron.unschedule(jobid) from cron.job where jobname = 'purge-stale-games';
select cron.schedule('purge-stale-games', '17 3 * * *', 'select public.purge_stale_games()');


-- 5. VERIFICATIONS apres application
-- a) Le public ne doit PAS pouvoir executer la fonction (attendu : false, false) :
--    select has_function_privilege('anon', 'public.purge_stale_games()', 'execute'),
--           has_function_privilege('authenticated', 'public.purge_stale_games()', 'execute');
-- b) La tache est programmee :
--    select jobname, schedule, command, active from cron.job where jobname = 'purge-stale-games';
-- c) Historique des executions (apres la premiere nuit) :
--    select status, return_message, start_time from cron.job_run_details
--    where jobid = (select jobid from cron.job where jobname = 'purge-stale-games')
--    order by start_time desc limit 5;


-- POUR ANNULER
--    select cron.unschedule(jobid) from cron.job where jobname = 'purge-stale-games';
--    drop function if exists public.purge_stale_games();
