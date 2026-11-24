// V40.42.0 — Edge Function "alertas" (avisos dos compromissos, Web Push). A lógica está em nucleo.js, testada no
// Node (tests/test_avisos_servidor.js). Aqui só a ligação com o Supabase: endereço, chaves e o Deno.serve.
// verify_jwt = false: quem chama se identifica do jeito dela (o agendador pelo x-cron-token, o aparelho pelo login).
import { atender } from './nucleo.js';

function chaveNova(nome: string): string { // SUPABASE_SECRET_KEYS / SUPABASE_PUBLISHABLE_KEYS: { "default": "sb_..." }
  try {
    const o = JSON.parse(Deno.env.get(nome) || '{}');
    return o && typeof o.default === 'string' ? o.default : '';
  } catch (_e) {
    return '';
  }
}

const env = {
  url: Deno.env.get('SUPABASE_URL') || '',
  secretKey: chaveNova('SUPABASE_SECRET_KEYS'),                 // a chave secreta nova vai só no cabeçalho apikey
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',   // a antiga (JWT), se a nova não existir
  publicKey: chaveNova('SUPABASE_PUBLISHABLE_KEYS') || Deno.env.get('SUPABASE_ANON_KEY') || '',
  vapidSub: 'https://jhonatanfavero.github.io/Faz-App/',
  fetch: (u: string, i?: RequestInit) => fetch(u, i),
  now: () => Date.now(),
  log: (...a: unknown[]) => console.log(...a),
  ttl: 900, // aviso que não chegou em 15 min (aparelho desligado) não chega mais
};

Deno.serve((req: Request) => atender(req, env));
