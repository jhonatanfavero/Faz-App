// V40.30.0 — Sublista arrastando no CELULAR (o PC faz igual desde a V40.28.0), no app de verdade em jsdom:
// cartão sai da sublista e vira bloco num horário livre, muda de sublista, bloco entra numa sublista (com a pergunta
// das notas vinculadas), os textos e as regras iguais aos do PC, o Desfazer (um passo por arrasto), a nuvem e o gesto
// (segurar 400 ms, contorno do lugar, soltar, cancelar), com uma "tela" de mentira pras posições.
// Uso: TZ='America/Sao_Paulo' node test_sublista_arrastar.js <repo> <dados-ficticios.json>
const fs = require('fs'), boot = require('./boot_app');
const REPO = process.argv[2], backup = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅', m); } else { fail++; console.log('  ❌ FALHOU:', m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 8000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) {} await sleep(40); } return false; }
const UID = '11111111-1111-1111-1111-111111111111';

(async () => {
  const B = await boot(REPO, backup.data), { w, server, L, $ } = B, d = w.document;
  const ev = (x) => w.eval(x);
  const J = (x) => JSON.parse(ev('JSON.stringify(' + x + ')'));
  const toasts = () => w.__toasts || [];
  const lastToast = () => toasts()[toasts().length - 1] || '';
  const steps = () => J('undoStack.map((s) => s.label)');
  const lastStep = () => { const s = steps(); return s[s.length - 1] || ''; };
  const get = (id) => J(`db.find((b) => b.id === ${JSON.stringify(id)}) || null`);
  const el = (id) => d.querySelector(`#blocks-container .block-item[data-block-id="${id}"]`);
  const DAY = '2026-11-18'; // quarta (o "hoje" dos testes é 15/11/2026, 21:00)
  const TAG = ev('tagsDb[0].id'), TAG2 = ev('tagsDb[1].id');
  const put = (blocks) => { ev(`db = db.filter((b) => b.date !== '${DAY}').concat(${JSON.stringify(blocks)}); saveDb(); activeDateObj = new Date(2026, 10, 18); renderTimeline();`); };
  const blk = (id, st, dur, title, extra) => Object.assign({ id, date: DAY, startMin: st, duration: dur, title, type: 'focus', theme: 'focus', tagId: null, microblocks: [], completed: false, linkedNoteIds: [] }, extra || {});
  const sub = (id, st, dur, title, cards, extra) => blk(id, st, dur, title, Object.assign({ cards }, extra || {}));
  ev("closeAllSheets(); setTlDays(1);");

  // ======================================================================================================
  console.log('A) Cartão → bloco (subCardOut), com as regras do PC:');
  put([
    sub('f_sa', 480, 60, 'Rápidas', [
      { id: 'cd_a1', title: 'Pagar boleto', done: false, microblocks: [{ title: 'Abrir o app', done: true }, { title: 'Pagar', done: false }], tagId: TAG, color: '#ec4899', duration: 25, columnId: 'col_geral' },
      { id: 'cd_a2', title: 'Ligar pro cartório', done: true, microblocks: [] },
      { id: 'cd_a3', title: 'Sem tempo', done: false, microblocks: [] },
    ]),
    blk('f_n1', 600, 60, 'Reunião'),
  ]);
  await sleep(20);
  const n0 = steps().length;
  ok(ev("subCardOut('f_sa', 'cd_a1', '" + DAY + "', 600)") === false && get('f_sa').cards.length === 3 && lastToast() === 'Conflito! O cartão ficou na sublista.', 'em cima da Reunião: "Conflito! O cartão ficou na sublista." e nada muda');
  ok(ev("subCardOut('f_sa', 'cd_a1', '" + DAY + "', 590)") === false, 'às 09:50 com 25 min também bate na Reunião (10:00)');
  ok(ev("subCardOut('f_sa', 'cd_a1', '" + DAY + "', 545)") === true, 'às 09:05 cabe (09:05–09:30)');
  await sleep(20);
  const nb = J(`db.filter((b) => b.date === '${DAY}' && b.title === 'Pagar boleto')`);
  const b1 = nb[0] || {};
  ok(nb.length === 1 && b1.startMin === 545 && b1.duration === 25 && b1.date === DAY && /^f_\d+_[a-z0-9]+$/.test(b1.id), 'virou bloco das 09:05 às 09:30 com o tempo do cartão (25 min) e id f_…');
  ok(b1.tagId === TAG && b1.color === '#ec4899' && b1.theme === 'focus' && b1.type === 'focus' && b1.completed === false && JSON.stringify(b1.linkedNoteIds) === '[]' && !('cards' in b1), 'leva tag, cor; é foco, por fazer, sem notas e não é sublista');
  ok(b1.microblocks.length === 2 && b1.microblocks[0].title === 'Abrir o app' && b1.microblocks[0].done === true && b1.microblocks[1].done === false && b1.microblocks.every((m) => /^mb_/.test(m.id)), 'a checklist vai junto, com o que já estava marcado (e ids mb_…)');
  ok(get('f_sa').cards.map((c) => c.id).join() === 'cd_a2,cd_a3', 'saiu da sublista (ficaram os outros 2, na ordem)');
  ok(lastToast() === 'Conflito! O cartão ficou na sublista.', 'deu certo: sem aviso vermelho (quem avisa é a barrinha do Desfazer)');
  ok(steps().length === n0 + 1 && lastStep() === 'Cartão saiu da sublista', 'Desfazer: um passo só, "' + lastStep() + '"');
  ok(!!el(b1.id) && el('f_sa').querySelectorAll('.sub-card').length === 2, 'a agenda já mostra o bloco novo e a sublista com 2 cartões');
  ok(ev('fazUndo()') === true && get('f_sa').cards.map((c) => c.id).join() === 'cd_a1,cd_a2,cd_a3' && !get(b1.id), 'desfazer: o cartão volta pro lugar dele e o bloco some');
  ok(ev('fazRedo()') === true && get('f_sa').cards.length === 2 && !!get(b1.id), 'refazer: sai de novo');
  // feito → bloco concluído; sem tempo → 30 min; sublista que fica só com feitos fica concluída
  ok(ev("subCardOut('f_sa', 'cd_a3', '" + DAY + "', 720)") === true, 'o cartão sem tempo sai às 12:00');
  const b3 = J(`db.find((b) => b.date === '${DAY}' && b.title === 'Sem tempo')`);
  ok(b3.duration === 30 && b3.tagId === null && !('color' in b3), 'sem tempo guardado: 30 min (como no PC); sem tag e sem cor');
  ok(get('f_sa').cards.length === 1 && get('f_sa').completed === true, 'ficou só o feito: a sublista conta como concluída (todos marcados)');
  ok(ev("subCardOut('f_sa', 'cd_a2', '" + DAY + "', 780)") === true && J(`db.find((b) => b.title === 'Ligar pro cartório')`).completed === true, 'cartão feito vira bloco concluído');
  ok(JSON.stringify(get('f_sa').cards) === '[]' && /Vazia · arraste um bloco pra cá ou toque em/.test(el('f_sa').textContent), 'a sublista vazia fica na agenda e diz "Vazia · arraste um bloco pra cá ou toque em ⌄"');
  ok(ev("subCardOut('f_sa', 'cd_nao', '" + DAY + "', 900)") === false && lastToast() === 'Esse cartão não está mais na sublista.', 'cartão que não existe mais: avisa e não cria nada');
  // tag apagada não vai; dia que já passou → bloco "passado"; hoje antes de agora também
  ev(`db.push(${JSON.stringify(sub('f_old', 600, 60, 'Velha', [{ id: 'cd_o1', title: 'Antigo', done: false, microblocks: [], tagId: 'tag_apagada' }, { id: 'cd_o2', title: 'Hoje cedo', done: false, microblocks: [], duration: 15 }], { date: '2020-01-15' }))}); saveDb();`);
  ok(ev("subCardOut('f_old', 'cd_o1', '2020-01-15', 900)") === true && J("db.find((b) => b.title === 'Antigo')").type === 'past' && J("db.find((b) => b.title === 'Antigo')").tagId === null, 'dia que já passou: o bloco nasce "passado"; tag que não existe mais não vai');
  const cedo = ev("(() => { for (let m = 420; m < 1200; m += 5) if (!subHits('2026-11-15', m, 15)) return m; return -1; })()"); // um vago de hoje antes das 21:00
  ok(cedo > 0 && ev("subCardOut('f_old', 'cd_o2', '2026-11-15', " + cedo + ")") === true && J("db.find((b) => b.title === 'Hoje cedo')").type === 'past', 'hoje, num horário que já passou (' + ev('formatClock(' + cedo + ')') + '): "passado"');

  // ======================================================================================================
  console.log('\nB) Cartão de uma sublista pra outra (subCardMoveTo):');
  put([
    sub('f_s1', 480, 60, 'Trabalho', [{ id: 'cd_1', title: 'Feito já', done: true, microblocks: [] }, { id: 'cd_2', title: 'Mandar orçamento', done: false, microblocks: [{ title: 'PDF', done: true }], tagId: TAG, color: '#0ea5e9', duration: 20, columnId: 'col_geral' }]),
    sub('f_s2', 600, 60, 'Casa', [], { completed: true }),
  ]);
  await sleep(20);
  const card2 = get('f_s1').cards[1];
  ok(ev("subCardMoveTo('f_s1', 'cd_2', 'f_s2')") === true, 'mover o cartão pra outra sublista');
  await sleep(20);
  ok(JSON.stringify(get('f_s2').cards) === JSON.stringify([card2]) && get('f_s1').cards.map((c) => c.id).join() === 'cd_1', 'vai inteiro (o mesmo id, checklist, tag, cor, tempo e lista de origem) e sai da primeira');
  ok(get('f_s2').completed === false && get('f_s1').completed === true, 'a que recebeu um por fazer reabre; a que ficou só com feitos fica concluída');
  ok(lastStep() === 'Cartão mudou de sublista' && ev("document.getElementById('undo-bar-msg').textContent") === 'Cartão mudou de sublista', 'a barrinha do Desfazer avisa: "' + lastStep() + '"');
  ok(ev('fazUndo()') === true && get('f_s1').cards.length === 2 && get('f_s2').cards.length === 0 && get('f_s2').completed === true, 'desfazer devolve o cartão e o "concluída" de antes');
  ok(ev("subCardMoveTo('f_s1', 'cd_2', 'f_s1')") === false && get('f_s1').cards.length === 2, 'soltar na mesma sublista: nada muda');
  ev("db.find((b) => b.id === 'f_s2').cards = Array.from({ length: 100 }, (_, i) => ({ id: 'cd_m' + i, title: 'C' + i, done: false, microblocks: [] })); saveDb();");
  ok(ev("subCardMoveTo('f_s1', 'cd_2', 'f_s2')") === false && lastToast() === 'Uma sublista cabe até 100 cartões.' && get('f_s1').cards.length === 2, 'sublista cheia (100): avisa e o cartão fica');

  // ======================================================================================================
  console.log('\nC) Bloco → cartão da sublista (blockIntoSublist), com a pergunta das notas:');
  ev("notesDb.push({ id: 'note_t1', title: 'Pauta', content: 'x', linkedBlockIds: [], createdAt: Date.now() }, { id: 'note_t2', title: 'Ata', content: 'y', linkedBlockIds: [], createdAt: Date.now() }); saveNotes();");
  put([
    sub('f_s3', 480, 60, 'Rua', [{ id: 'cd_r1', title: 'Banco', done: true, microblocks: [] }], { completed: true }),
    blk('f_x1', 600, 45, 'Comprar pão', { tagId: TAG2, color: '#22c55e', microblocks: [{ id: 'mb_1', title: 'Padaria', done: true }, { id: 'mb_2', title: 'Leite', done: false }, { id: 'mb_3', title: '  ', done: false }] }),
    blk('f_x2', 660, 30, 'Revisar contrato', { linkedNoteIds: ['note_t1'] }),
    blk('f_x3', 720, 15, 'Ver e-mail', { completed: true }),
    blk('f_x4', 780, 30, 'Duas notas', { linkedNoteIds: ['note_t1', 'note_t2', 'note_apagada'] }),
    blk('f_r1', 840, 30, 'Descanso', { theme: 'rest' }),
    sub('f_s4', 900, 60, 'Outra', []),
  ]);
  await sleep(20);
  ok(ev("blockIntoSublist('f_x1', 'f_s3')") === true, 'o bloco entra na sublista');
  await sleep(20);
  const c1 = get('f_s3').cards[1] || {};
  ok(!get('f_x1') && get('f_s3').cards.length === 2 && /^cd_[a-z0-9]+_[a-z0-9]+$/.test(c1.id), 'sai da agenda e vira o 2º cartão (id cd_…)');
  ok(c1.title === 'Comprar pão' && c1.done === false && c1.duration === 45 && c1.tagId === TAG2 && c1.color === '#22c55e' && !('columnId' in c1), 'nome, por fazer, 45 min, tag e cor (sem lista de origem: volta pra Geral)');
  ok(JSON.stringify(c1.microblocks) === JSON.stringify([{ title: 'Padaria', done: true }, { title: 'Leite', done: false }]), 'a checklist vira a do cartão, com o que estava marcado (item em branco sai)');
  ok(get('f_s3').completed === false && lastStep() === 'Bloco entrou na sublista', 'a sublista reabre; barrinha do Desfazer: "' + lastStep() + '"');
  ok(ev('fazUndo()') === true && !!get('f_x1') && get('f_x1').startMin === 600 && get('f_s3').cards.length === 1 && get('f_s3').completed === true, 'desfazer: o bloco volta no mesmo horário e a sublista como estava');
  ok(ev('fazRedo()') === true && !get('f_x1'), 'refazer');
  ok(ev("blockIntoSublist('f_x3', 'f_s3')") === true && get('f_s3').cards[2].done === true, 'bloco concluído vira cartão feito');
  ok(ev("blockIntoSublist('f_s4', 'f_s3')") === false && lastToast() === 'Uma sublista não entra em outra.' && !!get('f_s4'), 'sublista não entra em sublista (aviso do PC)');
  ok(ev("blockIntoSublist('f_r1', 'f_s3')") === false && lastToast() === 'Descanso não entra numa sublista.' && !!get('f_r1'), 'Descanso não entra (aviso do PC)');
  // nota vinculada: pergunta (janelinha na cor do app, não vermelha)
  const modal = $('goal-confirm-modal');
  ok(ev("blockIntoSublist('f_x2', 'f_s3')") === false && !!get('f_x2'), 'bloco com nota vinculada: ainda não entra…');
  ok(!modal.classList.contains('hidden') && $('goal-confirm-title').textContent === 'Colocar na sublista?' && $('goal-confirm-text').textContent === 'Este bloco tem 1 nota vinculada. No cartão da sublista ela não fica vinculada (continua nas Notas).' && $('goal-confirm-btn').textContent === 'Colocar na sublista', '…pergunta antes, com o texto do PC');
  ok(modal.classList.contains('ask-neutral') && $('goal-confirm-ico').className === 'ph ph-list-checks text-2xl', 'pergunta que não apaga nada: ícone de lista e botão na cor do app');
  w.confirmGoalAction();
  ok(!get('f_x2') && get('f_s3').cards.some((c) => c.title === 'Revisar contrato') && J("notesDb.some((n) => n.id === 'note_t1')") && modal.classList.contains('hidden'), 'confirmou: entrou na sublista e a nota continua nas Notas');
  ev("blockIntoSublist('f_x4', 'f_s3')");
  ok($('goal-confirm-text').textContent === 'Este bloco tem 2 notas vinculadas. No cartão da sublista elas não ficam vinculadas (continuam nas Notas).', 'duas notas (a apagada não conta): "2 notas vinculadas"');
  w.cancelGoalAction();
  ok(!!get('f_x4') && modal.classList.contains('hidden'), 'cancelar: o bloco fica onde estava');
  ev("askGoalConfirm('Apagar meta?', 'x', 'Apagar', () => {})");
  ok(!modal.classList.contains('ask-neutral') && $('goal-confirm-ico').className === 'ph ph-warning text-2xl', 'as perguntas das Metas continuam vermelhas (de apagar)');
  w.cancelGoalAction();
  ev("db.find((b) => b.id === 'f_s4').cards = Array.from({ length: 100 }, (_, i) => ({ id: 'cd_q' + i, title: 'C' + i, done: false, microblocks: [] })); saveDb();");
  ok(ev("blockIntoSublist('f_x4', 'f_s4', true)") === false && lastToast() === 'Uma sublista cabe até 100 cartões.' && !!get('f_x4'), 'sublista cheia: avisa e o bloco fica');

  // ======================================================================================================
  console.log('\nD) O gesto (com uma tela de mentira: cabeçalho até 150 px, agenda começando em 150 px):');
  const HEAD = 150;
  w.Element.prototype.getBoundingClientRect = function () {
    const R = (top, h, left, width) => ({ top, bottom: top + h, left, right: left + width, width, height: h, x: left, y: top });
    if (this.id === 'timeline-scroll') return R(0, 800, 0, 390);
    if (this.tagName === 'HEADER') return R(0, HEAD, 0, 390);
    if (this.id === 'blocks-container') return R(HEAD, 4000, 56, 318);
    if (this.classList && this.classList.contains('block-item')) return R(HEAD + (parseFloat(this.style.top) || 0), parseFloat(this.style.height) || 0, 60, 310);
    if (this.classList && this.classList.contains('sub-card')) {
      const p = this.closest('.block-item'), pr = p ? p.getBoundingClientRect() : R(0, 0, 0, 0), i = p ? [...p.querySelectorAll('.sub-card')].indexOf(this) : 0;
      return R(pr.top + 46 + 28 * i, 24, 100, 260);
    }
    return R(0, 0, 0, 0);
  };
  const Y = (min) => HEAD + ev(`tlY(${min})`); // ponto da tela que é aquele horário
  const fire = (target, type, pts) => { const e = new w.Event(type, { bubbles: true, cancelable: true }); e.touches = pts.map(([clientX, clientY]) => ({ clientX, clientY })); target.dispatchEvent(e); return e; };
  const rowOf = (id, i) => el(id).querySelectorAll('.sub-card')[i];
  const rowY = (id, i) => rowOf(id, i).getBoundingClientRect().top + 12;
  const land = () => d.querySelector('#blocks-container .sub-land');
  const press = async (id, i, x = 180) => { const r = rowOf(id, i); fire(r.querySelector('.sub-card-title'), 'touchstart', [[x, rowY(id, i)]]); await sleep(460); return r; };
  put([
    sub('f_g1', 480, 60, 'Rápidas', [
      { id: 'cd_g1', title: 'Pagar boleto', done: false, microblocks: [], duration: 25 },
      { id: 'cd_g2', title: 'Ligar', done: false, microblocks: [] },
      { id: 'cd_g3', title: 'Responder', done: false, microblocks: [] },
    ]),
    blk('f_gn', 600, 60, 'Reunião'),
    sub('f_g2', 720, 60, 'Casa', []),
    blk('f_gb', 840, 45, 'Comprar pão', { microblocks: [{ id: 'mb_9', title: 'Padaria', done: false }] }),
    blk('f_gr', 900, 30, 'Descanso', { theme: 'rest' }),
  ]);
  await sleep(250);
  // segurar pouco: não arrasta (e o toque segue sendo toque)
  fire(rowOf('f_g1', 0).querySelector('.sub-card-title'), 'touchstart', [[180, rowY('f_g1', 0)]]);
  await sleep(150); fire(d, 'touchend', []); await sleep(350);
  ok(ev('subDrag') === null && !d.querySelector('.sub-ghost'), 'tocar e soltar antes de 400 ms: não vira arrasto');
  // rolando a agenda (mexeu mais de 8 px antes dos 400 ms): não arrasta
  fire(rowOf('f_g1', 0).querySelector('.sub-card-title'), 'touchstart', [[180, rowY('f_g1', 0)]]);
  fire(d, 'touchmove', [[181, rowY('f_g1', 0) + 20]]);
  await sleep(460);
  ok(ev('subDrag') === null, 'mexeu o dedo antes (rolando a agenda): não vira arrasto');
  fire(d, 'touchend', []);
  // o círculo continua só marcando
  fire(rowOf('f_g1', 0).querySelector('.sub-ck'), 'touchstart', [[110, rowY('f_g1', 0)]]);
  await sleep(460);
  ok(ev('subDrag') === null, 'segurar no círculo não arrasta (ele só marca)');
  fire(d, 'touchend', []);
  await sleep(250);
  // segurar 400 ms: o cartão sai e acompanha o dedo
  const r0 = await press('f_g1', 0);
  const gh = d.querySelector('.sub-ghost');
  ok(ev('!!subDrag') && r0.classList.contains('sub-src') && !!gh && /Pagar boleto/.test(gh.textContent) && !gh.querySelector('[onclick]'), 'segurou: o cartão "sai" (fica apagado no lugar) e uma cópia acompanha o dedo');
  ev('renderTimeline()');
  ok(r0.isConnected, 'no meio do arrasto a agenda não redesenha por baixo');
  fire(d, 'touchmove', [[180, Y(545)]]);
  ok(land() && land().style.display !== 'none' && land().textContent === '09:05 - 09:30' && !land().classList.contains('bad') && land().style.top === (ev('tlY(545)') + 1) + 'px', 'no vago das 09:00 às 10:00: o contorno mostra "09:05 - 09:30" no lugar certo');
  fire(d, 'touchmove', [[180, Y(585)]]);
  ok(land().textContent === '09:35 - 10:00', 'perto da Reunião o contorno encosta nela: "09:35 - 10:00"');
  fire(d, 'touchmove', [[180, Y(620)]]);
  ok(land().classList.contains('bad') && land().textContent === 'Não cabe aqui', 'em cima da Reunião: vermelho, "Não cabe aqui"');
  fire(d, 'touchmove', [[180, Y(730)]]);
  ok(land().style.display === 'none' && el('f_g2').classList.contains('sub-over'), 'em cima da sublista Casa: ela fica marcada ("Soltar aqui") e o contorno some');
  fire(d, 'touchmove', [[180, Y(500)]]);
  ok(land().style.display === 'none' && !d.querySelector('.sub-over'), 'de volta na própria sublista: nada marcado');
  fire(d, 'touchmove', [[180, Y(545)]]);
  fire(d, 'touchend', []);
  await sleep(30);
  const gb = J(`db.find((b) => b.date === '${DAY}' && b.title === 'Pagar boleto')`);
  ok(gb && gb.startMin === 545 && gb.duration === 25 && get('f_g1').cards.length === 2, 'soltou: virou bloco às 09:05 (25 min) e saiu da sublista');
  ok(!d.querySelector('.sub-ghost') && !land() && ev('subDrag') === null && !!el(gb.id), 'a cópia e o contorno somem e a agenda mostra o bloco');
  // o "clique" que sobra ao soltar não abre o cartão
  rowOf('f_g1', 0).querySelector('.sub-card-title').click();
  ok($('sub-card-modal').classList.contains('hidden'), 'o clique que sobra ao soltar não abre o cartão');
  await sleep(420);
  // cartão pra outra sublista
  await press('f_g1', 0);
  fire(d, 'touchmove', [[180, Y(740)]]);
  fire(d, 'touchend', []);
  await sleep(30);
  ok(get('f_g2').cards.map((c) => c.id).join() === 'cd_g2' && get('f_g1').cards.map((c) => c.id).join() === 'cd_g3' && lastStep() === 'Cartão mudou de sublista', 'soltar em cima da sublista Casa: o cartão muda de sublista');
  await sleep(420);
  // soltar onde não cabe: fica
  await press('f_g1', 0);
  fire(d, 'touchmove', [[180, Y(630)]]);
  fire(d, 'touchend', []);
  await sleep(30);
  ok(get('f_g1').cards.length === 1 && lastToast() === 'Conflito! O cartão ficou na sublista.' && !rowOf('f_g1', 0).classList.contains('sub-src'), 'soltar em cima da Reunião: "Conflito! O cartão ficou na sublista."');
  await sleep(420);
  // segurar e soltar sem mexer: nada muda e não abre
  await press('f_g1', 0);
  fire(d, 'touchend', []);
  rowOf('f_g1', 0).querySelector('.sub-card-title').click();
  ok(get('f_g1').cards.length === 1 && $('sub-card-modal').classList.contains('hidden'), 'segurar e soltar sem mexer: nada muda e o cartão não abre');
  await sleep(420);
  // toque cancelado pelo sistema
  await press('f_g1', 0);
  fire(d, 'touchmove', [[180, Y(545 + 120)]]);
  fire(d, 'touchcancel', []);
  await sleep(30);
  ok(get('f_g1').cards.length === 1 && ev('subDrag') === null && !d.querySelector('.sub-ghost'), 'toque cancelado pelo sistema (ex.: ligação): nada muda');
  await sleep(420);
  // toque normal no nome continua abrindo
  rowOf('f_g1', 0).querySelector('.sub-card-title').click();
  ok(!$('sub-card-modal').classList.contains('hidden'), 'tocar no nome (sem segurar) continua abrindo o cartão');
  w.closeSubCard();
  // onde não tem arrasto de cartão
  ev('toggleFilterCompleted()');
  await sleep(50);
  ok(ev('subDragOff()') === true, 'no filtro (lista) o arrasto de cartão fica desligado');
  ev('toggleFilterCompleted()');
  ev("scheduleBacklogItem(backlogDb[0].id)");
  ok(ev('subDragOff()') === true && !el('f_g1').querySelector('.sub-card'), 'com uma tarefa na mão também (a sublista mostra "Colocar aqui")');
  ev('cancelPendingTask()');
  ev('setTlDays(2)');
  ok(ev('subDragOff()') === true, 'com 2 dias na tela também');
  ev("setTlDays(1); activeDateObj = new Date(2026, 10, 18); renderTimeline();");
  ok(ev('subDragOff()') === false, '1 dia, sem filtro: ligado');

  // ---- bloco pela alça → sublista ----
  const mouse = (target, type, x, y) => target.dispatchEvent(new w.MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true }));
  const hb = el('f_gb').querySelector('.drag-handle');
  mouse(hb, 'mousedown', 80, Y(850));
  mouse(d, 'mousemove', 80, Y(740));
  ok(el('f_g2').classList.contains('sub-over') && el('f_gb').classList.contains('into-sub'), 'bloco arrastado pela alça em cima da sublista: ela fica marcada e o bloco meio transparente');
  mouse(d, 'mousemove', 80, Y(800));
  ok(!el('f_g2').classList.contains('sub-over') && !el('f_gb').classList.contains('into-sub'), 'saiu de cima: desmarca');
  mouse(d, 'mousemove', 80, Y(735));
  mouse(d, 'mouseup', 80, Y(735));
  await sleep(30);
  ok(!get('f_gb') && get('f_g2').cards.length === 2 && get('f_g2').cards[1].title === 'Comprar pão' && get('f_g2').cards[1].duration === 45, 'soltou em cima: o bloco virou cartão da sublista (com o tempo dele)');
  ok(lastStep() === 'Bloco entrou na sublista' && !d.querySelector('.sub-over'), 'Desfazer: "Bloco entrou na sublista"');
  await sleep(250);
  // Descanso em cima da sublista: aviso e volta
  const hr = el('f_gr').querySelector('.drag-handle');
  mouse(hr, 'mousedown', 80, Y(905));
  mouse(d, 'mousemove', 80, Y(740));
  ok(!el('f_g2').classList.contains('sub-over'), 'Descanso em cima da sublista: ela não fica marcada');
  mouse(d, 'mouseup', 80, Y(740));
  await sleep(30);
  ok(get('f_gr').startMin === 900 && lastToast() === 'Descanso não entra numa sublista.', 'soltou: "Descanso não entra numa sublista." e ele volta pro lugar');
  await sleep(250);
  // sublista em cima de outra
  const hs = el('f_g2').querySelector('.drag-handle');
  mouse(hs, 'mousedown', 80, Y(725));
  mouse(d, 'mousemove', 80, Y(500));
  mouse(d, 'mouseup', 80, Y(500));
  await sleep(30);
  ok(get('f_g2').startMin === 720 && lastToast() === 'Uma sublista não entra em outra.', 'sublista em cima de outra: "Uma sublista não entra em outra." e volta');
  await sleep(250);
  // arrastar bloco pra um horário livre continua igual
  const hn = el('f_gn').querySelector('.drag-handle');
  mouse(hn, 'mousedown', 80, Y(605));
  mouse(d, 'mousemove', 80, Y(605) + 3 * 60);
  mouse(d, 'mouseup', 80, Y(605) + 3 * 60);
  await sleep(30);
  ok(get('f_gn').startMin === 660, 'arrastar um bloco pra um vago continua só mudando o horário (10:00 → 11:00)');
  await sleep(250);
  // toque cancelado no meio do arrasto do bloco
  const hn2 = el('f_gn').querySelector('.drag-handle');
  fire(hn2, 'touchstart', [[80, Y(665)]]);
  fire(d, 'touchmove', [[80, Y(740)]]);
  fire(d, 'touchcancel', []);
  await sleep(30);
  ok(get('f_gn').startMin === 660 && get('f_g2').cards.length === 2 && !d.querySelector('.sub-over'), 'toque cancelado no meio do arrasto do bloco: nada muda');
  await sleep(250);

  // ======================================================================================================
  console.log('\nE) Dica e textos:');
  ev("localStorage.removeItem('tb__dica_sub_arrastar'); subTipShown = {};");
  ev("toggleExpandBlock('f_g2', { stopPropagation() {} })");
  ok(!!el('f_g2').querySelector('.sub-tip') && /Segure um cartão pra arrastar ele pra fora/.test(el('f_g2').querySelector('.sub-tip').textContent) && L('tb__dica_sub_arrastar') === '1', 'abrir uma sublista com cartões mostra a dica "Segure um cartão pra arrastar ele pra fora"');
  ev('renderTimeline()');
  ok(L('tb__dica_sub_arrastar') === '1', 'redesenhar não conta de novo (uma vez por sublista)');
  ok(!Object.keys(J('collectFazData()')).includes('tb__dica_sub_arrastar'), 'a contagem da dica não entra no backup');
  ev("collapseAllBlocks(); db.find((b) => b.id === 'f_g1').cards = []; saveDb(); toggleExpandBlock('f_g1', { stopPropagation() {} });");
  ok(/Ou arraste um bloco pra cá, ou agende um cartão da Lista e toque nesta sublista\./.test(el('f_g1').textContent), 'sublista aberta e vazia: "Ou arraste um bloco pra cá, ou agende um cartão da Lista…"');
  ev('collapseAllBlocks()');

  // ======================================================================================================
  console.log('\nF) Na nuvem:');
  server.addUser('j@t.com', 'senha123', UID);
  w.openConfigSheet(); w.openConfigSync(); await waitFor(() => server.createClientCalls === 1);
  $('sync-email').value = 'j@t.com'; $('sync-password').value = 'senha123'; await w.fazSyncLogin(); await waitFor(() => !!L('tb__sync'), 20000);
  w.closeAllSheets();
  const syncDone = async () => { const st = L('tb__sync'); w.fazSyncNow(); await waitFor(() => L('tb__sync') !== st, 20000); await sleep(60); };
  ok(!!server.get('blocos', UID, 'f_g2') && server.get('blocos', UID, 'f_g2').cards.length === 2 && !server.get('blocos', UID, 'f_gb'), 'subiu: a sublista Casa com os 2 cartões; o bloco que virou cartão nem chegou a subir');
  ev("db.find((b) => b.id === 'f_g1').cards = [{ id: 'cd_z1', title: 'Pro PC ver', done: true, microblocks: [{ title: 'Item', done: true }], tagId: '" + TAG + "', color: '#ec4899', duration: 20 }]; saveDb(); renderTimeline();");
  await syncDone();
  ok(ev("subCardOut('f_g1', 'cd_z1', '" + DAY + "', 1020)") === true, 'cartão sai às 17:00 (com a nuvem ligada)');
  const z = J(`db.find((b) => b.title === 'Pro PC ver')`);
  ok(ev("blockIntoSublist('f_gn', 'f_g2')") === true, 'e a Reunião entra na sublista Casa');
  await syncDone();
  const rz = server.get('blocos', UID, z.id), rs = server.get('blocos', UID, 'f_g1'), rc = server.get('blocos', UID, 'f_g2'), rn = server.get('blocos', UID, 'f_gn');
  ok(rz && rz.start_min === 1020 && rz.duration === 20 && rz.completed === true && rz.cards === null && rz.tag_id === TAG && rz.color === '#ec4899' && rz.microblocks.length === 1 && rz.deleted === false, 'na nuvem: o bloco novo (17:00, 20 min, feito, tag, cor, checklist, cards = null)');
  ok(rs && JSON.stringify(rs.cards) === '[]' && rc && rc.cards.length === 3 && rc.cards[2].title === 'Reunião' && rn && rn.deleted === true, 'a sublista de onde saiu ficou vazia; a Casa tem a Reunião como cartão; o bloco da Reunião foi apagado (deleted)');
  // o PC tira um cartão (V40.28.0) e o celular recebe
  const pcBlock = { id: 'f_pc_out', date: DAY, start_min: 1080, duration: 25, title: 'Saiu no PC', type: 'focus', theme: 'focus', tag_id: null, microblocks: [], completed: false, was_delayed: false, linked_note_ids: [], color: null, archived: false, cards: null, deleted: false };
  server.insert('blocos', UID, pcBlock);
  server.patch('blocos', UID, 'f_g2', { cards: rc.cards.slice(1) });
  await syncDone();
  ok(!!get('f_pc_out') && get('f_pc_out').startMin === 1080 && get('f_g2').cards.length === 2 && !!el('f_pc_out'), 'o que o PC faz arrastando (cartão saiu, bloco novo) chega no celular');

  ok(B.errors.length === 0, 'nenhum erro de página' + (B.errors.length ? ': ' + B.errors[0].slice(0, 300) : ''));
  console.log(`\nRESULTADO: ${pass} passaram, ${fail} falharam`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e); console.log(`\nRESULTADO: ${pass} passaram, ${fail + 1} falharam`); process.exit(1); });
