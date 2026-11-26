-- V40.47.0 — QUADROS (grupos com membros) E LISTAS COMPARTILHADAS
-- Um quadro (Casa, Empresa) tem membros. Qualquer membro pode pôr uma lista DELE no quadro (listas.quadro_id): aí todo
-- mundo do quadro vê a lista e mexe nas tarefas dela (criar, editar, marcar, apagar, pôr na própria agenda). As tarefas
-- continuam na conta de quem é dono da lista (user_id); os outros leem e gravam nelas por estas regras novas, e o resto
-- das contas continua invisível. Quem entra é achado pelo e-mail da conta e entra direto (faz_quadro_adicionar). Só quem
-- criou o quadro põe e tira pessoas, renomeia e apaga o quadro. Quem sai (ou é tirado) leva as listas dele de volta.

create table public.quadros (
  id uuid primary key default gen_random_uuid(),
  dono uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome text not null check (char_length(btrim(nome)) between 1 and 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default clock_timestamp()
);
create table public.quadros_membros (
  quadro uuid not null references public.quadros(id) on delete cascade,
  membro uuid not null references auth.users(id) on delete cascade,
  email text not null default '' check (char_length(email) <= 320),
  papel text not null default 'membro' check (papel in ('dono', 'membro')),
  created_at timestamptz not null default now(),
  primary key (quadro, membro)
);
create index quadros_dono_idx on public.quadros (dono);
create index quadros_membros_membro_idx on public.quadros_membros (membro);

alter table public.listas add column quadro_id uuid references public.quadros(id) on delete set null;
create index listas_quadro_idx on public.listas (quadro_id);
create index tarefas_user_column_idx on public.tarefas (user_id, column_id);

create trigger quadros_touch_updated_at before insert or update on public.quadros
  for each row execute function public.faz_touch_updated_at();

alter table public.quadros enable row level security;
alter table public.quadros_membros enable row level security;

-- Quem é do quadro / a lista (de outra conta) está num quadro meu? Sem passar pelas regras (não dá volta nelas).
create or replace function public.faz_no_quadro(p_quadro uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.quadros_membros m where m.quadro = p_quadro and m.membro = (select auth.uid()));
$$;
create or replace function public.faz_lista_do_quadro(p_dono uuid, p_lista text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.listas l join public.quadros_membros m on m.quadro = l.quadro_id
    where l.user_id = p_dono and l.id = p_lista and not l.deleted and m.membro = (select auth.uid())
  );
$$;
revoke all on function public.faz_no_quadro(uuid) from public, anon;
revoke all on function public.faz_lista_do_quadro(uuid, text) from public, anon;
grant execute on function public.faz_no_quadro(uuid) to authenticated;
grant execute on function public.faz_lista_do_quadro(uuid, text) to authenticated;

-- Quadros: quem é do quadro vê; só o dono renomeia e apaga. Criar: pela faz_quadro_criar (já põe o dono como membro).
create policy quadros_select on public.quadros for select to authenticated using (public.faz_no_quadro(id));
create policy quadros_update_dono on public.quadros for update to authenticated
  using ((select auth.uid()) = dono) with check ((select auth.uid()) = dono);
create policy quadros_delete_dono on public.quadros for delete to authenticated using ((select auth.uid()) = dono);

-- Membros: quem é do quadro vê quem mais é; o dono tira os outros e cada um sai sozinho (o dono não sai: apaga o
-- quadro). Entrar: pela faz_quadro_adicionar.
create policy quadros_membros_select on public.quadros_membros for select to authenticated using (public.faz_no_quadro(quadro));
create policy quadros_membros_delete on public.quadros_membros for delete to authenticated using (
  papel <> 'dono' and (
    membro = (select auth.uid())
    or exists (select 1 from public.quadros q where q.id = quadro and q.dono = (select auth.uid()))
  )
);

-- Listas e tarefas de OUTRA conta, numa lista posta num quadro meu (as regras de sempre continuam pras minhas).
create policy listas_select_quadro on public.listas for select to authenticated
  using ((select auth.uid()) <> user_id and quadro_id is not null and public.faz_no_quadro(quadro_id));
create policy tarefas_quadro on public.tarefas for all to authenticated
  using ((select auth.uid()) <> user_id and public.faz_lista_do_quadro(user_id, column_id))
  with check ((select auth.uid()) <> user_id and public.faz_lista_do_quadro(user_id, column_id));

-- Lista só vai pra um quadro de que o dono dela é membro. Fora disso fica só dela, sem erro (o sync não para).
create or replace function public.faz_listas_quadro_ok() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.quadro_id is not null and not exists (
    select 1 from public.quadros_membros m where m.quadro = new.quadro_id and m.membro = new.user_id
  ) then
    new.quadro_id := null;
  end if;
  return new;
end;
$$;
create trigger listas_quadro_ok before insert or update of quadro_id on public.listas
  for each row execute function public.faz_listas_quadro_ok();

-- Saiu do quadro (ou foi tirado, ou o quadro foi apagado): as listas dele voltam a ser só dele.
create or replace function public.faz_quadros_membros_saiu() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.listas set quadro_id = null where user_id = old.membro and quadro_id = old.quadro;
  return old;
end;
$$;
create trigger quadros_membros_saiu after delete on public.quadros_membros
  for each row execute function public.faz_quadros_membros_saiu();

-- Criar um quadro (quem cria é o dono e já entra como membro). Até 20 quadros por conta.
create or replace function public.faz_quadro_criar(p_nome text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_id uuid; v_email text;
begin
  if v_uid is null then raise exception 'faz_sem_login'; end if;
  if char_length(btrim(coalesce(p_nome, ''))) not between 1 and 60 then raise exception 'faz_nome_invalido'; end if;
  if (select count(*) from public.quadros q where q.dono = v_uid) >= 20 then raise exception 'faz_limite_quadros'; end if;
  select lower(u.email) into v_email from auth.users u where u.id = v_uid;
  insert into public.quadros (dono, nome) values (v_uid, btrim(p_nome)) returning id into v_id;
  insert into public.quadros_membros (quadro, membro, email, papel) values (v_id, v_uid, coalesce(v_email, ''), 'dono');
  return v_id;
end;
$$;

-- Pôr alguém no quadro pelo e-mail da conta (entra direto). Só o dono do quadro. Até 50 pessoas por quadro.
-- Volta: ok | sem_login | sem_permissao | email_invalido | sem_conta | voce_mesmo | ja_esta | limite
create or replace function public.faz_quadro_adicionar(p_quadro uuid, p_email text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_membro uuid; v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if v_uid is null then return 'sem_login'; end if;
  if not exists (select 1 from public.quadros q where q.id = p_quadro and q.dono = v_uid) then return 'sem_permissao'; end if;
  if char_length(v_email) > 320 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then return 'email_invalido'; end if;
  select u.id into v_membro from auth.users u where lower(u.email) = v_email limit 1;
  if v_membro is null then return 'sem_conta'; end if;
  if v_membro = v_uid then return 'voce_mesmo'; end if;
  if exists (select 1 from public.quadros_membros m where m.quadro = p_quadro and m.membro = v_membro) then return 'ja_esta'; end if;
  if (select count(*) from public.quadros_membros m where m.quadro = p_quadro) >= 50 then return 'limite'; end if;
  insert into public.quadros_membros (quadro, membro, email, papel) values (p_quadro, v_membro, v_email, 'membro');
  return 'ok';
end;
$$;
revoke all on function public.faz_quadro_criar(text) from public, anon;
revoke all on function public.faz_quadro_adicionar(uuid, text) from public, anon;
grant execute on function public.faz_quadro_criar(text) to authenticated;
grant execute on function public.faz_quadro_adicionar(uuid, text) to authenticated;

-- Quadros e pessoas NÃO entram no "ao vivo" (supabase_realtime): o aviso de linha apagada não passa pelas regras e iria
-- pra todo mundo logado. O celular e o PC releem os quadros a cada rodada (e ao voltar pro app/aba).
