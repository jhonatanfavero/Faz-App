-- V40.47.0 (logo depois da faz_v40_47_0_quadros, pelos avisos de segurança do Supabase): as duas funções dos gatilhos
-- não são pra ser chamadas pela API (só o banco chama, no gatilho, e lá ninguém confere essa permissão).
revoke all on function public.faz_listas_quadro_ok() from public, anon, authenticated;
revoke all on function public.faz_quadros_membros_saiu() from public, anon, authenticated;
