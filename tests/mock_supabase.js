// Supabase falso pros testes: RLS emulado, colunas e regras iguais às da migration real.
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

const COLUMNS = {
  tarefas: ['user_id', 'id', 'column_id', 'title', 'duration', 'tag_id', 'microblocks', 'position', 'color', 'archived', 'goal_id', 'deleted', 'updated_at'], // V40.34.0: + goal_id
  blocos: ['user_id', 'id', 'date', 'start_min', 'duration', 'title', 'type', 'theme', 'tag_id', 'microblocks', 'completed', 'was_delayed', 'linked_note_ids', 'color', 'archived', 'cards', 'goal_id', 'deleted', 'updated_at'], // V40.24.0: + cards (sublista); V40.34.0: + goal_id
  listas: ['user_id', 'id', 'name', 'is_default', 'position', 'created_ms', 'deleted', 'updated_at'],
  tags: ['user_id', 'id', 'name', 'color', 'position', 'deleted', 'updated_at'],
  // V40.17.0
  rotinas: ['user_id', 'id', 'title', 'emoji', 'duration', 'theme', 'tag_id', 'microblocks', 'created_ms', 'goal_id', 'deleted', 'updated_at'],
  notas: ['user_id', 'id', 'title', 'content', 'created_ms', 'updated_ms', 'deleted', 'updated_at'],
  financas: ['user_id', 'id', 'title', 'amount', 'start_month', 'duration_months', 'is_recurring', 'due_day', 'tag_id', 'paid_months', 'amount_overrides', 'created_ms', 'deleted', 'updated_at'],
  // V40.21.0
  metas_listas: ['user_id', 'id', 'name', 'is_default', 'position', 'created_ms', 'deleted', 'updated_at'],
  metas: ['user_id', 'id', 'list_id', 'title', 'emoji', 'period', 'unit', 'target', 'step', 'position', 'created_ms', 'count_from', 'deleted', 'updated_at'], // V40.34.0: + count_from
  metas_dias: ['user_id', 'id', 'goal_id', 'date', 'amount', 'target', 'deleted', 'updated_at'],
};
const DEFAULTS = {
  tarefas: { column_id: 'col_geral', title: '', duration: 30, tag_id: null, microblocks: [], position: 0, color: null, archived: false, goal_id: null, deleted: false },
  blocos: { title: '', type: 'focus', theme: 'focus', tag_id: null, microblocks: [], completed: false, was_delayed: false, linked_note_ids: [], color: null, archived: false, cards: null, goal_id: null, deleted: false },
  listas: { name: '', is_default: false, position: 0, created_ms: null, deleted: false },
  tags: { name: '', color: '#a1a1aa', position: 0, deleted: false },
  rotinas: { title: '', emoji: '', duration: 60, theme: 'focus', tag_id: null, microblocks: [], created_ms: null, goal_id: null, deleted: false },
  notas: { title: '', content: '', created_ms: null, updated_ms: null, deleted: false },
  financas: { title: '', amount: 0, duration_months: 1, is_recurring: false, due_day: null, tag_id: null, paid_months: [], amount_overrides: {}, created_ms: null, deleted: false },
  metas_listas: { name: '', is_default: false, position: 0, created_ms: null, deleted: false },
  metas: { list_id: null, title: '', emoji: '', period: 'dia', unit: 'vezes', target: 1, step: 1, position: 0, created_ms: null, count_from: null, deleted: false },
  metas_dias: { amount: 0, target: null, deleted: false },
};

function check(table, r) { // mesmas CHECKs da migration
  const bad = (m) => ({ code: '23514', message: 'violates check constraint: ' + m });
  for (const k of Object.keys(r)) if (!COLUMNS[table].includes(k)) return { code: 'PGRST204', message: `Could not find the '${k}' column of '${table}'` };
  if (typeof r.id !== 'string' || r.id.length < 1 || r.id.length > 64) return bad('id');
  if ('color' in r && table !== 'tags' && r.color !== null && !/^#[0-9a-fA-F]{6}$/.test(String(r.color))) return bad('color');
  if ('archived' in r && typeof r.archived !== 'boolean') return bad('archived');
  if ('goal_id' in r && r.goal_id !== null && (typeof r.goal_id !== 'string' || r.goal_id.length < 1 || r.goal_id.length > 64)) return bad('goal_id'); // V40.34.0 (migration faz_v40_34_0_meta_ligada)
  if ('count_from' in r && r.count_from !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(r.count_from))) return bad('count_from'); // V40.34.0
  if (table === 'blocos') {
    if ('date' in r && !/^\d{4}-\d{2}-\d{2}$/.test(String(r.date))) return bad('date');
    for (const k of ['start_min', 'duration']) if (k in r && (!Number.isInteger(r[k]) || r[k] < 0 || r[k] > 1440)) return bad(k);
    for (const k of ['microblocks', 'linked_note_ids']) if (k in r && !Array.isArray(r[k])) return bad(k);
    if ('cards' in r && r.cards !== null && (!Array.isArray(r.cards) || r.cards.length > 200)) return bad('cards'); // V40.24.0
    for (const k of ['completed', 'was_delayed']) if (k in r && typeof r[k] !== 'boolean') return bad(k);
    return null;
  }
  // V40.17.0: mesmos CHECKs da migration faz_v40_17_0_rotinas_notas_financas
  const txt = (k, max) => k in r && (typeof r[k] !== 'string' || [...r[k]].length > max);
  const int = (k, lo, hi) => k in r && (!Number.isInteger(r[k]) || r[k] < lo || r[k] > hi);
  const ms = (k) => k in r && r[k] !== null && !Number.isFinite(r[k]);
  const tag = () => 'tag_id' in r && r.tag_id !== null && (typeof r.tag_id !== 'string' || r.tag_id.length > 64);
  if ('deleted' in r && typeof r.deleted !== 'boolean') return bad('deleted');
  if (table === 'rotinas') {
    if (txt('title', 200)) return bad('title'); if (txt('emoji', 16)) return bad('emoji'); if (txt('theme', 32)) return bad('theme');
    if (int('duration', 0, 1440)) return bad('duration'); if (tag()) return bad('tag_id'); if (ms('created_ms')) return bad('created_ms');
    if ('microblocks' in r && !Array.isArray(r.microblocks)) return bad('microblocks');
    return null;
  }
  if (table === 'notas') {
    if (txt('title', 500)) return bad('title'); if (txt('content', 100000)) return bad('content');
    if (ms('created_ms')) return bad('created_ms'); if (ms('updated_ms')) return bad('updated_ms');
    return null;
  }
  if (table === 'financas') {
    if (txt('title', 200)) return bad('title');
    if ('amount' in r && (typeof r.amount !== 'number' || !Number.isFinite(r.amount) || Math.abs(r.amount) > 1e12)) return bad('amount');
    if ('start_month' in r && !/^\d{4}-(0[1-9]|1[0-2])$/.test(String(r.start_month))) return bad('start_month');
    if (int('duration_months', 1, 1200)) return bad('duration_months');
    if ('is_recurring' in r && typeof r.is_recurring !== 'boolean') return bad('is_recurring');
    if ('due_day' in r && r.due_day !== null && (!Number.isInteger(r.due_day) || r.due_day < 1 || r.due_day > 31)) return bad('due_day');
    if (tag()) return bad('tag_id'); if (ms('created_ms')) return bad('created_ms');
    if ('paid_months' in r && !Array.isArray(r.paid_months)) return bad('paid_months');
    if ('amount_overrides' in r && (!r.amount_overrides || typeof r.amount_overrides !== 'object' || Array.isArray(r.amount_overrides))) return bad('amount_overrides');
    return null;
  }
  // V40.21.0: mesmos CHECKs da migration faz_v40_21_0_metas
  const pos = (k) => k in r && (typeof r[k] !== 'number' || !Number.isFinite(r[k]));
  const goalNum = (k, nullable) => k in r && !(nullable && r[k] === null) && (typeof r[k] !== 'number' || !Number.isFinite(r[k]) || r[k] <= 0 || r[k] > 1e9);
  const ref = (k, nullable) => k in r && !(nullable && r[k] === null) && (typeof r[k] !== 'string' || r[k].length < 1 || r[k].length > 64);
  if (table === 'metas_listas') {
    if (txt('name', 100)) return bad('name'); if ('is_default' in r && typeof r.is_default !== 'boolean') return bad('is_default');
    if (pos('position')) return bad('position'); if (ms('created_ms')) return bad('created_ms');
    return null;
  }
  if (table === 'metas') {
    if (ref('list_id', true)) return bad('list_id'); if (txt('title', 200)) return bad('title'); if (txt('emoji', 16)) return bad('emoji');
    if ('period' in r && !['dia', 'semana', 'mes'].includes(r.period)) return bad('period');
    if ('unit' in r && !['vezes', 'minutos', 'reais'].includes(r.unit)) return bad('unit');
    if (goalNum('target')) return bad('target'); if (goalNum('step')) return bad('step');
    if (pos('position')) return bad('position'); if (ms('created_ms')) return bad('created_ms');
    return null;
  }
  if (table === 'metas_dias') {
    if (ref('goal_id')) return bad('goal_id');
    if ('date' in r && !/^\d{4}-\d{2}-\d{2}$/.test(String(r.date))) return bad('date');
    if ('amount' in r && (typeof r.amount !== 'number' || !Number.isFinite(r.amount) || r.amount < 0 || r.amount > 1e9)) return bad('amount');
    if (goalNum('target', true)) return bad('target');
    return null;
  }
  if ('position' in r && (typeof r.position !== 'number' || !Number.isFinite(r.position))) return bad('position');
  if ('deleted' in r && typeof r.deleted !== 'boolean') return bad('deleted');
  if (table === 'tarefas') {
    if ('title' in r && (typeof r.title !== 'string' || r.title.length > 2000)) return bad('title');
    if ('duration' in r && (!Number.isInteger(r.duration) || r.duration < 0 || r.duration > 1440)) return bad('duration');
    if ('microblocks' in r && !Array.isArray(r.microblocks)) return bad('microblocks');
    if ('column_id' in r && (typeof r.column_id !== 'string' || !r.column_id.length || r.column_id.length > 64)) return bad('column_id');
    if ('tag_id' in r && r.tag_id !== null && (typeof r.tag_id !== 'string' || r.tag_id.length > 64)) return bad('tag_id');
  }
  if (table === 'listas') {
    if ('name' in r && (typeof r.name !== 'string' || r.name.length > 100)) return bad('name');
    if ('is_default' in r && typeof r.is_default !== 'boolean') return bad('is_default');
    if ('created_ms' in r && r.created_ms !== null && !Number.isFinite(r.created_ms)) return bad('created_ms');
  }
  if (table === 'tags') {
    if ('name' in r && (typeof r.name !== 'string' || r.name.length > 100)) return bad('name');
    if ('color' in r && (typeof r.color !== 'string' || r.color.length > 32)) return bad('color');
  }
  return null;
}

function makeServer() {
  const s = {
    tables: { tarefas: new Map(), listas: new Map(), tags: new Map(), blocos: new Map(), rotinas: new Map(), notas: new Map(), financas: new Map(), metas_listas: new Map(), metas: new Map(), metas_dias: new Map() },
    users: new Map(), clock: 0, log: [], channels: [], storedSession: null, createClientCalls: 0, failNext: 0, failAuth: 0,
  };
  s.emitters = [];
  s.stamp = () => new Date(Date.now() + (++s.clock)).toISOString(); // updated_at do servidor, sempre crescente
  s.addUser = (email, password, id) => { const u = { id, email, password, meta: {} }; s.users.set(email, u); return u; };
  s.rows = (t, uid) => [...s.tables[t].values()].filter((r) => r.user_id === uid);
  s.alive = (t, uid) => s.rows(t, uid).filter((r) => !r.deleted);
  s.get = (t, uid, id) => s.tables[t].get(uid + '|' + id);
  s.emit = (table, eventType, row) => {
    for (const ch of s.channels) for (const h of ch.handlers) {
      if (h.f.table !== table) continue;
      if (h.f.filter && h.f.filter !== 'user_id=eq.' + row.user_id) continue;
      h.cb({ eventType, new: clone(row), old: { id: row.id } });
    }
  };
  // "o PC" mexendo direto na nuvem (como o kanban faz: só campos alterados)
  s.patch = (t, uid, id, fields) => { const r = s.get(t, uid, id); Object.assign(r, clone(fields), { updated_at: s.stamp() }); s.emit(t, 'UPDATE', r); };
  s.insert = (t, uid, row) => { const r = { ...clone(DEFAULTS[t]), ...clone(row), user_id: uid, updated_at: s.stamp() }; s.tables[t].set(uid + '|' + r.id, r); s.emit(t, 'INSERT', r); };
  return s;
}

class Query {
  constructor(s, table, getSession) { this.s = s; this.t = table; this.gs = getSession; this.f = []; this.op = 'select'; this.a = 0; this.b = 1e9; }
  select(cols) { this.cols = cols; return this; }
  eq(c, v) { this.f.push((r) => r[c] === v); return this; }
  in(c, arr) { this.f.push((r) => arr.includes(r[c])); return this; }
  gt(c, v) { this.f.push((r) => r[c] > v); this.since = v; return this; }
  order(c) { this.ord = c; return this; }
  range(a, b) { this.a = a; this.b = b; return this; }
  upsert(rows) { this.op = 'upsert'; this.payload = Array.isArray(rows) ? rows : [rows]; return this; }
  insert(rows) { this.op = 'insert'; this.payload = Array.isArray(rows) ? rows : [rows]; return this; }
  update(fields) { this.op = 'update'; this.payload = fields; return this; }
  then(res, rej) { return new Promise((r) => setTimeout(r, 5)).then(() => this.exec()).then(res, rej); }
  exec() {
    const sess = this.gs();
    if (!sess) return { data: null, error: { code: '42501', message: 'permission denied (anon)' } };
    if (this.s.failNext > 0) { this.s.failNext--; return { data: null, error: { message: 'Failed to fetch' } }; }
    const uid = sess.user.id, tb = this.s.tables[this.t];
    if (this.op === 'select') {
      const cols = this.cols && this.cols !== '*' ? this.cols.split(',') : null;
      if (cols) for (const c of cols) if (!COLUMNS[this.t].includes(c)) return { data: null, error: { message: `column ${this.t}.${c} does not exist` } };
      let rows = [...tb.values()].filter((r) => r.user_id === uid && this.f.every((fn) => fn(r)));
      if (this.ord) rows.sort((x, y) => (x[this.ord] < y[this.ord] ? -1 : x[this.ord] > y[this.ord] ? 1 : 0));
      rows = rows.slice(this.a, this.b + 1).map((r) => { if (!cols) return clone(r); const o = {}; cols.forEach((c) => (o[c] = clone(r[c]))); return o; });
      this.s.log.push({ op: 'select', t: this.t, n: rows.length, since: this.since || null });
      return { data: rows, error: null };
    }
    if (this.op === 'upsert' || this.op === 'insert') {
      for (const r of this.payload) {
        if (r.user_id !== uid) return { data: null, error: { code: '42501', message: 'new row violates row-level security policy' } };
        const err = check(this.t, r);
        if (err) return { data: null, error: err };
        if (this.op === 'insert' && tb.has(uid + '|' + r.id)) return { data: null, error: { code: '23505', message: 'duplicate key' } };
        if (this.t === 'financas' && !tb.has(uid + '|' + r.id) && !r.start_month) return { data: null, error: { code: '23502', message: 'null value in column "start_month" violates not-null constraint' } };
        if (this.t === 'metas_dias' && !tb.has(uid + '|' + r.id) && (!r.goal_id || !r.date)) return { data: null, error: { code: '23502', message: 'null value in column "goal_id"/"date" violates not-null constraint' } };
      }
      for (const r of this.payload) {
        const key = uid + '|' + r.id, prev = tb.get(key);
        const row = { ...clone(DEFAULTS[this.t]), ...(prev || {}), ...clone(r), updated_at: this.s.stamp() };
        tb.set(key, row);
        this.s.emit(this.t, prev ? 'UPDATE' : 'INSERT', row);
      }
      this.s.log.push({ op: this.op, t: this.t, n: this.payload.length, ids: this.payload.map((r) => r.id) });
      return { data: null, error: null };
    }
    if (this.op === 'update') {
      const err = check(this.t, { id: 'x', ...this.payload });
      if (err) return { data: null, error: err };
      let n = 0;
      for (const r of tb.values()) {
        if (r.user_id === uid && this.f.every((fn) => fn(r))) { Object.assign(r, clone(this.payload), { updated_at: this.s.stamp() }); n++; this.s.emit(this.t, 'UPDATE', r); }
      }
      this.s.log.push({ op: 'update', t: this.t, n, fields: Object.keys(this.payload) });
      return { data: null, error: null };
    }
    return { data: null, error: { message: 'op?' } };
  }
}

function makeCreateClient(s) {
  return function createClient() {
    s.createClientCalls++;
    let session = s.storedSession;
    const listeners = [];
    const emit = (ev, sess) => listeners.forEach((cb) => { try { cb(ev, sess === undefined ? session : sess); } catch (e) {} }); // sess: teste manda outra sessão (ex.: a velha guardada no aparelho)
    s.emitters.push(emit);
    const auth = {
      async getSession() { return { data: { session }, error: null }; },
      onAuthStateChange(cb) { listeners.push(cb); setTimeout(() => cb('INITIAL_SESSION', session), 0); return { data: { subscription: { unsubscribe() {} } } }; },
      async signInWithPassword({ email, password }) {
        const u = s.users.get(email);
        if (!u || u.password !== password) return { data: { session: null }, error: { message: 'Invalid login credentials' } };
        session = { access_token: 'tok', user: { id: u.id, email, user_metadata: clone(u.meta) } };
        s.storedSession = session;
        setTimeout(() => emit('SIGNED_IN'), 0);
        return { data: { session, user: session.user }, error: null };
      },
      async resetPasswordForEmail(email, opts) { s.log.push({ op: 'reset', email, redirectTo: opts && opts.redirectTo }); return { data: {}, error: null }; },
      async signUp({ email }) { s.log.push({ op: 'signUp', email }); return { data: { session: null, user: null }, error: null }; },
      async signOut() { session = null; s.storedSession = null; setTimeout(() => emit('SIGNED_OUT'), 0); return { error: null }; },
      // V40.32.0: lê os dados da conta de novo no "servidor" (a sessão guardada no aparelho pode estar velha)
      async getUser() {
        s.log.push({ op: 'getUser' });
        if (!session) return { data: { user: null }, error: { message: 'Auth session missing!' } };
        const u = [...s.users.values()].find((x) => x.id === session.user.id);
        return { data: { user: { ...clone(session.user), user_metadata: clone(u ? u.meta : session.user.user_metadata || {}) } }, error: null };
      },
      async updateUser({ data, password }) {
        if (s.failAuth > 0) { s.failAuth--; s.log.push({ op: 'updateUser', data, failed: true }); return { data: { user: null }, error: { message: 'Failed to fetch' } }; } // V40.32.0: sem internet
        const u = [...s.users.values()].find((x) => x.id === session.user.id);
        if (password) u.password = password;
        Object.assign(u.meta, clone(data || {}));
        session = { ...session, user: { ...session.user, user_metadata: clone(u.meta) } };
        s.storedSession = session;
        s.log.push({ op: 'updateUser', data, password: !!password });
        setTimeout(() => emit('USER_UPDATED'), 0);
        return { data: { user: session.user }, error: null };
      },
    };
    return {
      auth,
      from: (t) => new Query(s, t, () => session),
      channel(name) {
        const ch = { name, handlers: [], on(type, f, cb) { this.handlers.push({ f, cb }); return this; },
          subscribe(cb) { s.channels.push(ch); setTimeout(() => cb && cb('SUBSCRIBED'), 0); return ch; } };
        return ch;
      },
      removeChannel(ch) { s.channels = s.channels.filter((c) => c !== ch); },
    };
  };
}

module.exports = { makeServer, makeCreateClient, clone };
