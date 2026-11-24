-- V40.42.0 — O AGENDADOR DOS AVISOS. Cópia de referência da migration "faz_v40_42_0_avisos_cron" aplicada no
-- Supabase, DEPOIS da função "alertas" publicada (com verify_jwt = false: ela confere sozinha quem chama — o
-- agendador pelo token de faz_segredos, o aparelho pelo login).
-- A cada minuto o banco chama a função (pg_cron + pg_net). O token é lido na hora de cada chamada: não fica escrito
-- no agendamento.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

select cron.schedule('faz-alertas', '* * * * *', $$
    select net.http_post(
        url := 'https://zlwocojndrjnuvoowzzu.supabase.co/functions/v1/alertas',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-token', (select valor from public.faz_segredos where nome = 'cron_token')),
        body := '{}'::jsonb,
        timeout_milliseconds := 25000
    );
$$);

-- O histórico do agendador cresce 1.440 linhas por dia: guarda só os últimos 3 dias.
select cron.schedule('faz-alertas-limpeza', '23 4 * * *', $$
    delete from cron.job_run_details where end_time < now() - interval '3 days';
$$);
