-- V40.42.0 — AVISOS DOS COMPROMISSOS (Web Push). Cópia de referência da migration "faz_v40_42_0_avisos"
-- aplicada no Supabase (projeto faz-app). A função que avisa está em supabase/functions/alertas/ e o lado do
-- aparelho em avisos.js. O teste tests/test_avisos.js confere que as regras daqui batem com as do app e da função.
--
-- push_inscricoes   cada aparelho que ligou os avisos: o endereço do serviço de push dele (Google, Apple, Mozilla ou
--                   Microsoft) e as chaves que o navegador deu pra cifrar o aviso. RLS: cada um só vê e mexe nas
--                   suas. id = SHA-256 do endereço (o mesmo aparelho não entra duas vezes). No máximo 20 por conta.
-- alertas_enviados  o que já foi avisado: a chave primária garante uma vez só, mesmo se o agendador chamar duas
--                   vezes. Só a função mexe (com a chave secreta do projeto); guarda 3 dias.
-- faz_segredos      a chave VAPID (a função cria na primeira vez que precisa) e o token do agendador (criado aqui,
--                   dentro do banco: não passa por ninguém). Só a função lê.

create table public.push_inscricoes (
    user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
    id text not null,
    endpoint text not null,
    p256dh text not null,
    auth text not null,
    aparelho text not null default 'celular',
    fuso text not null default 'America/Sao_Paulo',
    minutos integer not null default 10,
    criado_em timestamptz not null default now(),
    atualizado_em timestamptz not null default now(),
    primary key (user_id, id),
    constraint push_inscricoes_endpoint_check check (char_length(endpoint) <= 1000 and endpoint ~ '^https://(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/'),
    constraint push_inscricoes_id_check check (id ~ '^[0-9a-f]{64}$' and id = encode(extensions.digest(endpoint, 'sha256'), 'hex')),
    constraint push_inscricoes_p256dh_check check (char_length(p256dh) between 80 and 100 and p256dh ~ '^[A-Za-z0-9_=-]+$'),
    constraint push_inscricoes_auth_check check (char_length(auth) between 16 and 32 and auth ~ '^[A-Za-z0-9_=-]+$'),
    constraint push_inscricoes_aparelho_check check (aparelho in ('celular', 'pc')),
    constraint push_inscricoes_fuso_check check (char_length(fuso) between 1 and 64),
    constraint push_inscricoes_minutos_check check (minutos in (0, 5, 10, 15, 30))
);
comment on table public.push_inscricoes is 'Faz V40.42.0: aparelhos com os avisos dos compromissos ligados (Web Push). Um por navegador; RLS por conta.';

alter table public.push_inscricoes enable row level security;
create policy push_inscricoes_select_own on public.push_inscricoes for select to authenticated using ((select auth.uid()) = user_id);
create policy push_inscricoes_insert_own on public.push_inscricoes for insert to authenticated with check ((select auth.uid()) = user_id);
create policy push_inscricoes_update_own on public.push_inscricoes for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy push_inscricoes_delete_own on public.push_inscricoes for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.push_inscricoes from anon;

-- Quando mudou (atualizado_em) e o limite de 20 aparelhos por conta (o mesmo aparelho de novo não conta).
create or replace function public.push_inscricoes_antes() returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.atualizado_em := now();
    if tg_op = 'INSERT' and (select count(*) from public.push_inscricoes p where p.user_id = new.user_id and p.id <> new.id) >= 20 then
        raise exception 'faz_limite_aparelhos' using errcode = 'P0001', hint = 'No máximo 20 aparelhos com aviso por conta.';
    end if;
    return new;
end
$$;
create trigger push_inscricoes_antes before insert or update on public.push_inscricoes
    for each row execute function public.push_inscricoes_antes();

create table public.alertas_enviados (
    user_id uuid not null references auth.users (id) on delete cascade,
    inscricao_id text not null,
    chave text not null check (char_length(chave) <= 200),
    enviado_em timestamptz not null default now(),
    primary key (user_id, inscricao_id, chave)
);
comment on table public.alertas_enviados is 'Faz V40.42.0: avisos já enviados (bloco|dia|horário|minutos por aparelho). Uma vez só; a função apaga depois de 3 dias.';
create index alertas_enviados_enviado_em_idx on public.alertas_enviados (enviado_em);
alter table public.alertas_enviados enable row level security; -- sem política: só a chave secreta do projeto (a função)
revoke all on public.alertas_enviados from anon, authenticated;

create table public.faz_segredos (
    nome text primary key,
    valor text not null,
    criado_em timestamptz not null default now()
);
comment on table public.faz_segredos is 'Faz V40.42.0: chave VAPID dos avisos e token do agendador. Só a função alertas lê.';
alter table public.faz_segredos enable row level security; -- sem política: só a chave secreta do projeto (a função)
revoke all on public.faz_segredos from anon, authenticated;
insert into public.faz_segredos (nome, valor) values ('cron_token', encode(extensions.gen_random_bytes(32), 'hex'));
