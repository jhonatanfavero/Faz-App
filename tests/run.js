#!/usr/bin/env node
// Roda todas as suítes de teste do Faz (é o que o "npm test" chama).
// Cada suíte roda num processo separado, sempre no fuso de São Paulo (Regra de Ouro: datas são locais).
//   node tests/run.js            resumo de cada suíte
//   node tests/run.js --tudo     mostra todas as verificações, uma por linha
const { spawnSync } = require('child_process'), path = require('path');
const ROOT = path.join(__dirname, '..'), DADOS = path.join(__dirname, 'dados-ficticios.json');
const SUITES = [
    ['Motor de sincronização (regras de mesclagem)', 'sim_sync.js', [path.join(ROOT, 'sync.js'), DADOS]],
    ['App do celular + sincronização', 'test_app.js', [ROOT, DADOS]],
    ['Agenda na nuvem, blocos de 5 min, segurança, iOS', 'test_v408.js', [ROOT, DADOS]],
    ['Cor do cartão e Arquivados', 'test_v409.js', [ROOT, DADOS]],
    ['Listas afastadas e arrastar entre listas', 'test_v4091.js', [ROOT, DADOS]],
    ['Atualização de quem já sincronizava numa versão antiga', 'test_atualizacao.js', [ROOT, DADOS]],
    ['Rotinas, notas e finanças na nuvem (celular)', 'test_v4017.js', [ROOT, DADOS]],
    ['Tela do PC (kanban.html)', 'test_kanban.js', [ROOT, DADOS]],
    ['Tela do PC: Rotinas e Notas', 'test_kanban_v4017.js', [ROOT, DADOS]],
    ['Tela do PC: Tags e zoom', 'test_kanban_v4018.js', [ROOT, DADOS]],
    ['Tela do PC: Finanças e setas do teclado', 'test_kanban_v4019.js', [ROOT, DADOS]],
    ['Finanças do celular: editar sem estragar os valores por mês', 'test_v4019.js', [ROOT, DADOS]],
    ['Assistente: o cérebro e a aba do celular', 'test_assistente.js', [ROOT, DADOS]],
    ['Tela do PC: aba Assistente', 'test_kanban_v4020.js', [ROOT, DADOS]],
    ['Metas: as regras, a aba do celular, a nuvem e o Assistente', 'test_metas.js', [ROOT, DADOS]],
    ['Tela do PC: aba Metas', 'test_kanban_v4021.js', [ROOT, DADOS]],
    ['Tela do PC: notas no bloco e Dia com os vagos compactados', 'test_kanban_v4022.js', [ROOT, DADOS]],
    ['Sublista e vagos ocultos no celular (e na nuvem)', 'test_sublista.js', [ROOT, DADOS]],
    ['Tela do PC: sublista', 'test_kanban_v4024.js', [ROOT, DADOS]],
    ['Desfazer e refazer no celular (e na nuvem)', 'test_desfazer.js', [ROOT, DADOS]],
    ['Tela do PC: Desfazer (Ctrl+Z) e Refazer; dois cliques no horário vazio', 'test_kanban_v4025.js', [ROOT, DADOS]],
    ['Dois toques no horário vazio (celular)', 'test_dois_toques.js', [ROOT, DADOS]],
    ['Agenda afastada no celular: 2 ou 3 dias lado a lado', 'test_agenda_dias.js', [ROOT, DADOS]],
    ['Botão voltar do celular', 'test_voltar.js', [ROOT, DADOS]],
    ['Tela do PC: duração, mesmo dia, Duplicar e sublista na Semana', 'test_kanban_v4028.js', [ROOT, DADOS]],
    ['Tela do PC: Relatórios (as mesmas contas do celular) e Semana de segunda a domingo', 'test_kanban_v4029.js', [ROOT, DADOS]],
    ['Sublista arrastando no celular: cartão sai, muda de sublista e bloco entra', 'test_sublista_arrastar.js', [ROOT, DADOS]],
    ['Recorrente sem fim, até encerrar (celular, nuvem e PC)', 'test_recorrente.js', [ROOT, DADOS]],
    ['Dias lado a lado: arrastar bloco de um dia pro outro (celular)', 'test_arrastar_dias.js', [ROOT, DADOS]],
    ['Configurações no PC: cor do app e horário do dia, nos 2 sentidos', 'test_preferencias.js', [ROOT, DADOS]],
    ['Ordem das listas: arrastar e menu, no celular e no PC (Desfazer e nuvem)', 'test_ordem_listas.js', [ROOT, DADOS]],
    ['Metas etapa 2: bloco, tarefa, rotina e cartão ligados a uma meta; gráfico (celular, nuvem e PC)', 'test_metas_etapa2.js', [ROOT, DADOS]],
    ['Busca na agenda: PC (nome, checklist, sublista e tag; abrir, teclado, nuvem) e as mesmas regras no celular', 'test_busca_agenda.js', [ROOT, DADOS]],
    ['PC: Repetir bloco (todo dia, semana ou mês) e os 3 pontinhos na visão Dia', 'test_repetir_pc.js', [ROOT, DADOS]],
    ['Celular: Repetir igual ao PC, cartão curto sem fatia, Metas, nome pela meta, vagos com 2 dias (V40.36.1)', 'test_v40361.js', [ROOT, DADOS]],
    ['Sublista de metas: "Pôr na agenda" da categoria (celular e PC)', 'test_sublista_metas.js', [ROOT, DADOS]],
    ['Voltar pra lista de onde veio (ou pra primeira): celular, nuvem e PC', 'test_volta_lista.js', [ROOT, DADOS]],
    ['Busca nas Listas: filtra as próprias listas (celular e PC)', 'test_busca_listas.js', [ROOT, DADOS]],
    ['PC, visão Dia: cartão sai da sublista arrastando, muda de sublista e bloco entra', 'test_dia_sublista_pc.js', [ROOT, DADOS]],
    ['Períodos nos 2 sentidos (celular, conta e PC): Configurações e Novo bloco', 'test_periodos.js', [ROOT, DADOS]],
    ['PC: Salvar backup (o mesmo arquivo do celular, que abre igual num celular novo)', 'test_backup_pc.js', [ROOT, DADOS]],
    ['Texto digitado nunca vira HTML', 'test_injecao.js', [ROOT]],
];
// A versão tem que ser a mesma no selo do celular, no selo do PC, no cache do service worker, no backup e no package.json.
const fs = require('fs'), ler = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8'), acha = (txt, re) => (txt.match(re) || [])[1] || '?';
const versoes = {
    'index.html (selo)': acha(ler('index.html'), /select-none">v(\d+\.\d+\.\d+)<\/div>/),
    'kanban.html (selo)': acha(ler('kanban.html'), /id="pc-version"[^>]*>v(\d+\.\d+\.\d+)</),
    'sw.js (CACHE_NAME)': acha(ler('sw.js'), /CACHE_NAME = 'timeblock-v(\d+-\d+-\d+)'/).replace(/-/g, '.'),
    'app.js (backup)': acha(ler('app.js'), /version: 'v(\d+\.\d+\.\d+)'/),
    'package.json': JSON.parse(ler('package.json')).version,
};
const distintas = [...new Set(Object.values(versoes))];
let versaoErrada = distintas.length !== 1 || distintas[0] === '?';
console.log((versaoErrada ? '❌ Versão diferente entre os arquivos: ' + JSON.stringify(versoes) : '✅ Versão ' + distintas[0] + ' igual nos 5 lugares') + '\n');
const tudo = process.argv.includes('--tudo');
let passou = 0, falhou = 0, quebradas = 0;
for (const [nome, arquivo, args] of SUITES) {
    const t0 = Date.now();
    const r = spawnSync(process.execPath, [path.join(__dirname, arquivo), ...args], { encoding: 'utf8', env: { ...process.env, TZ: 'America/Sao_Paulo' }, timeout: 300000 });
    const out = (r.stdout || '') + (r.stderr || '');
    const m = out.match(/RESULTADO: (\d+) passaram, (\d+) falharam/);
    const ok = !!m && m[2] === '0' && r.status === 0;
    if (m) { passou += +m[1]; falhou += +m[2]; }
    if (!ok && !(m && +m[2] > 0)) quebradas++;
    console.log(`${ok ? '✅' : '❌'} ${nome}: ${m ? m[1] + ' passaram, ' + m[2] + ' falharam' : 'não terminou'} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    if (tudo || !ok) console.log(out.split('\n').filter((l) => tudo || /FALHOU|ERRO|Error|^\s+at /.test(l)).slice(0, tudo ? 400 : 25).map((l) => '    ' + l).join('\n'));
}
console.log(`\n${falhou || quebradas ? '❌' : '✅'} TOTAL: ${passou} verificações passaram, ${falhou} falharam` + (quebradas ? `, ${quebradas} suíte(s) não terminaram` : ''));
process.exit(falhou || quebradas || versaoErrada ? 1 : 0);
