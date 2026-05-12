# 📋 TIMEBLOCK PWA — DOSSIÊ MESTRE V40.2.24

> **Cole esse texto inteiro no início de uma nova conversa com o Claude.**
> Estado: pós-V40.2.24 — saga visual + busca expandida encerrada, V40.3 (Motor de Rotinas) próximo passo.

---

## 🎯 RESUMO RÁPIDO PRO CLAUDE

Olá Claude! Continuando o projeto **TimeBlock PWA**. Última versão estável: **V40.2.24 FINAL**.

**URL:** `jhonatanfavero.github.io/Faz-App` | **Branch:** `V-5.0` | **Repo:** `github.com/jhonatanfavero/Faz-App`

**Stack:** HTML + Tailwind CDN + JS vanilla + Service Worker + LocalStorage + Phosphor Icons.

**Equipe:**
- **Jhonatan (PR/Brasil):** product owner, deploy via GitHub web, testa em celular Android (PWA) + desktop Chrome
- **Claude:** arquiteto técnico, codifica e simula
- **Jules/Gemini:** UX Tech Lead, revisora final, dá ordens cirúrgicas

**Próximo objetivo:** V40.3 — Motor de Rotinas (Cenário definido com Jules: "Carimbo Rápido")

---

## 🛑 REGRAS DE OURO (11 regras, aprendidas com sangue na V40.2.x)

1. **NUNCA aplicar `overflow: hidden !important` em containers da timeline** que causem cobertura indevida do `bg-hatched`. EXCEÇÃO: `overflow-x: hidden` em `#timeline-scroll` é OK e desejável (V40.2.23). Status: BLINDADO.

2. **NUNCA forçar `.focus()` programático em PWA com `100dvh`** → Chrome Android empurra body, cria "buraco branco". Removidos de `openNoteForm` e `openEditNote`. Só sobraram 4 `.focus()` legítimos.

3. **Sempre rodar simulação profunda em VM Node ANTES de entregar** — sintaxe, diff cirúrgico, regressão por feature, cenários de uso, edge cases. **Simular DESDE O COMEÇO, não depois do Jhonatan perguntar** (lição V40.2.20→V40.2.21).

4. **`sw.js` SEMPRE muda versão** quando qualquer arquivo muda.

5. **Quando Jules/Gemini dá ordem específica, siga LETRA POR LETRA.** Não invente.

6. **Quando achar que viu um bug/oportunidade, RE-LEIA antes de propor solução.** Pense em uso real, não só na matemática (lição V40.2.22). E **fale com o usuário** antes de chutar (lição V40.2.23 com os prints).

7. **localStorage NUNCA é apagado pelo SW.** Limpar cache no Chrome NÃO apaga dados se marcar só "imagens e arquivos em cache".

8. **Padrão de fechamento de sheets:** sempre `closeAllSheets()` antes de abrir nova, salvando variáveis críticas (`targetNoteId`, `blockIdToLink`) ANTES.

9. **Cards expandidos têm RAIOS DE PROTEÇÃO:** (a) só fecha por scroll quando sai 100% do viewport + 20px; (b) toque em outro card NÃO fecha; (c) só fecha por botão ▲, área neutra ou scroll-out.

10. **NÃO mexer em `PX_PER_MIN`, `setupClickOutCollapse`, `setupScrollCollapse`, `.drag-handle` (touch-action), `#timeline-scroll` (overflow-x), `cardMatchesSearch`** sem autorização explícita do Jhonatan + Jules.

11. **UX no centro de cada decisão.** Frase do Jhonatan: "sempre vamos focar na experiência do usuário". Engenharia obedece à UX, sempre.

---

## ✅ FUNCIONALIDADES ESTÁVEIS V40.2.24

### 🎯 Header (V40.2.5)
- Data/dia da semana, 6 botões cluster direito: ☁️ ◀◀ ⭐ ▶▶ 🔍 ^
- Nuvem Passageira (☁️): 1º acesso do dia

### 💭 Pensamento do Dia (V40.2.2-3)
- 50 frases motivacionais PT-BR, modal centralizado
- Frase do dia: `Math.floor(Date.now()/86400000) % 50`

### 🔍 Busca por cartão (V40.2.5-13, **expandida na V40.2.24**)
- Lupa no cluster do header, barra colapsável com X
- **Filtra em 3 campos** (helper `cardMatchesSearch`):
  - Título do bloco (`b.title`)
  - Microblocos (`b.microblocks[].title`) ← NOVO V40.2.24
  - Nome da tag (`tagsDb.find().name`) ← NOVO V40.2.24
- Notas vinculadas EXCLUÍDAS do escopo (performance + escopo Jules)
- Normalização de acentos via `normalizeText()` (NFD + strip diacritics + lowercase)
- Busca em TODOS os dias do db, resultados agrupados por dia com selo clicável
- Modo lista (sem grade) ativado por `.filter-list-mode + .search-mode`
- Performance validada: 10k itens em 15ms

### 🏷️ Sistema de Tags
- Sheet `#tags-sheet`, CRUD completo, cores customizáveis
- Faixa lateral 5px (border-left) + halo branco inset 1px (V40.2.14)

### 📝 Notas — Standalone + Vinculadas
- 3 abas: Lista (backlog) / Rotinas (placeholder) / Notas
- `openNoteForm` e `openEditNote` SEM `.focus()` (Regra de Ouro #2)

### 🎨 Tema dinâmico
- `applyThemeColor()` com hexToRgb()
- localStorage: `tb_theme_color`

### 🧠 Filtros + Setas Teclado (V40.2.12)
- Atrasados, concluídos, modo lista
- ← / → / Home pra trocar dia (desktop)

---

## 🌟 AS QUATRO LEIS DE UX + AJUSTES DE COMFORT (V40.2.18 → V40.2.24)

### LEI 1 — Scroll Collapse por VISIBILIDADE (V40.2.18)
- `setupScrollCollapse` (app.js L1127+)
- Card expandido só fecha quando sai 100% do viewport + 20px de tolerância
- `getBoundingClientRect()` + debounce 120ms + guarda `isPhysicsBusy`

### LEI 2 — Click-out por NEUTRALIDADE (V40.2.19)
- `setupClickOutCollapse` (app.js L1023+)
- Tocar em card real → IGNORA. Tempo Livre / área neutra → FECHA.
- Resolve "gordura do dedo": cards não se fecham uns aos outros

### LEI 3 — Cores SÓLIDAS sem fantasma (V40.2.20)
- `drawBlock` bloco bgClass (L743+)
- Atrasado pendente: `bg-app-focus` sólido, só o "i" diferencia
- Concluído (qualquer): `bg-emerald-500` vivo, texto branco riscado
- ZERO `opacity-80 saturate-50`
- `isDarkTheme = !isRest || block.completed` cobre escuros

### LEI 4 — DIVULGAÇÃO PROGRESSIVA dos botões (V40.2.21)
- `drawBlock` innerHTML (L869+)
- Topo retraído: só ▼ ✓ (w-7 h-7, 28px touch target)
- Rodapé expandido: action bar Editar/Duplicar/Apagar
- Resize handle: hidden no expandido (V40.2.21)

### Ajuste de conforto da escala (V40.2.22 — Jules)
- `PX_PER_MIN`: 2.5 → 3.0
- Card de 15min: 37.5px → 45px (cabe botões w-7 h-7)
- Mantém visão panorâmica do dia (4.7h visíveis no celular)

### LEI 5 — DRAG ZONE EXPANDIDA + correção de scroll horizontal (V40.2.23)
- Drag-handle: era `w-6 h-6` flex-child, virou `absolute left-0 top-0 bottom-0 w-10`
- Faixa esquerda inteira (40px × altura toda) vira pega
- Ícone `⋮⋮` centralizado vertical, opacity-70, sem background
- Conteúdo do card: `pl-10` (40px) pra escapar do drag
- ActionBar do expandido: ajustada de `left-3` pra `left-12` (escapar do drag)
- `.drag-handle { touch-action: none }` (corrige drag horizontal)
- `#timeline-scroll { overflow-x: hidden; touch-action: pan-y }` (defense in depth)
- Fix em modo lista: `.filter-list-mode .block-item > .flex.justify-between { padding-left: 0 !important }`
- HTML wrapper: `max-w-[420px]` (intocado — sm:max-w foi tentativa equivocada revertida)

### Busca expandida (V40.2.24)
- Helper `cardMatchesSearch(block, normalizedQuery)` em app.js L321
- 4 lugares de filtro consolidados em 1 helper: updateSearchCounter, renderTimeline (2x), renderSearchResultsAllDays
- Argumento `normalizedQuery` já passa normalizado pra evitar re-normalize por bloco

---

## 🐛 SAGA COMPLETA DA V40.2.x

| Versão | Bug/Feature | Solução |
|---|---|---|
| V40.2.9 | Card pesquisado abria time-picker | `isSearching` flag em drawBlock |
| V40.2.9 | Excluir tag não atualizava lista | renderTagsList() + toast |
| V40.2.10 | Espaço branco topo busca | padding-top reduzido |
| V40.2.10 | Editar nota inline abria lista | targetNoteId salvo ANTES |
| V40.2.11 | Toque acima de HOJE fechava busca | handleClickOutsideSearch removido |
| V40.2.11 | Folga horizontal celular | overscroll-behavior-x: none |
| V40.2.12 | Espaço fantasma filtros | padding-top 16px |
| V40.2.12 | Setas teclado dia | keydown handler com guards |
| V40.2.13 | Cursor texto piscando | user-select: none |
| V40.2.13 | Selo data não clicável | goToDateFromSearch() |
| V40.2.14 | Sheets sobrepostas editar nota | editLinkedNoteInline → closeAllSheets() |
| V40.2.14 | Tag invisível na cor do card | border-left 5px + halo branco inset |
| V40.2.17 (Bala Gemini) | Sheets sobrepostas (Notas+Reports+Clone) | visibility: hidden com delay 300ms |
| V40.2.17 (Regra PWA Jules) | Buraco branco no form de Nota | Removidos `.focus()` programáticos |
| V40.2.18 (LEI 1) | Card fechava após 30px scroll | Visibility-based collapse + 20px tolerância |
| V40.2.19 (LEI 2) | Card fechava ao apoiar dedo em outro card | Click-out por neutralidade |
| V40.2.20 (LEI 3) | Atrasados/concluídos cores fantasma | Cor sólida + emerald-500 vivo |
| V40.2.21 (LEI 4) | 5 botões no topo cortavam título | Divulgação progressiva: 2 botões topo + action bar rodapé |
| V40.2.22 (Conforto Jules) | Cards 15min apertados | PX_PER_MIN 2.5 → 3.0 |
| **V40.2.23 (LEI 5)** | **Drag em quadradinho minúsculo + scroll horizontal** | **Drag zone expandida w-10 + touch-action:none + overflow-x:hidden** |
| **V40.2.24 (Busca turbinada)** | **Busca só por título — dossiê prometia mais** | **Helper `cardMatchesSearch` filtra título + microblocos + nome da tag** |

---

## 🛠️ ESTADO TÉCNICO ATUAL (V40.2.24 FINAL)

### `app.js` (~2852 linhas)
- L8: `PX_PER_MIN = 3.0`
- L304: `normalizeText()`
- **L321: `cardMatchesSearch(block, normalizedQuery)` ← V40.2.24**
- L375 / L546 / L574 / L611: filtros de busca usam `cardMatchesSearch`
- L1023: `setupClickOutCollapse` (LEI 2)
- L1127: `setupScrollCollapse` (LEI 1)
- L710+: `drawBlock` com tudo das leis 3, 4, 5
- 4 `.focus()` legítimos (L319, L446, L1244, L1782)

### `style.css` (~140 linhas)
- `.drag-handle { touch-action: none; cursor: grab }` (V40.2.23)
- `#timeline-scroll { overflow-x: hidden; touch-action: pan-y; user-select: none }` (V40.2.23)
- Fix de buraco branco em modo lista: `.filter-list-mode .block-item > .flex.justify-between { padding-left: 0 !important }` (V40.2.23)
- Bala de Prata Gemini ativa (sheets visibility:hidden)

### `sw.js`
- Versão: `timeblock-v40-2-24`

### `index.html` (~650 linhas)
- Wrapper: `max-w-[420px]` (sem sm:max-w — sm:max-w foi mudança equivocada da V40.2.23 PRELIMINAR, revertida na V40.2.23 FINAL)
- 8 sheets + sm:rounded-[40px] + sm:border-[6px] no desktop

### LocalStorage keys
- `tb_master_db`, `tb_backlog_db`, `tb_tags_db`, `tb_periods_db`, `tb_notes_db`
- `tb_theme_color`, `tb_start_hour`, `tb_end_hour`, `tb_thought_read_date`

---

## 🚀 V40.3 — MOTOR DE ROTINAS (PRÓXIMO PASSO)

### Conceito definido com Jules: **"CARIMBO"**

Rotina = **template/carimbo** que cria 1 cartão completo na timeline com 1-2 toques.

### Especificação travada

**Cenário escolhido (Jhonatan + Jules):**
- Bloco de tempo é sagrado (duração total fixa)
- Microblocos são checklist livre dentro do bloco (SEM tempo individual)
- Atende 5 critérios: melhor que concorrentes, intuitivo, menos carregado, fácil de visualizar, viciante

### Estrutura de dados (proposta)

```javascript
// tb_routines_db
{
    id: 'rt_xyz',
    title: '🌞 Manhã Produtiva',
    duration: 120,         // em minutos
    theme: 'focus',        // 'focus' ou 'rest'
    tagId: null,           // opcional
    microblocks: [
        { title: 'Meditação e Café' },
        { title: 'Revisar métricas' },
        { title: 'Planejar o dia' }
    ],
    createdAt: 1701234567000
}
```

### Comportamento "Carimbo"
- Toque na rotina → cria card flutuante pendente (igual backlog hoje)
- Usuário toca onde quer encaixar OU os blocos "Tempo Livre" pulsam destacando
- Rotina ORIGINAL fica intacta (carimbo reutilizável)
- Cria block novo em `tb_master_db` com:
  - `id: 'f_' + Date.now() + '_' + Math.random()`
  - Microblocos clonados com IDs únicos e `done: false`

### Decisões UX confirmadas
- **3 perguntas chave (C-C-C):**
  1. Carimbo: ambos (barra flutuante + blocos vazios pulsando)
  2. Bloco atrasado com itens pendentes: comportamento normal, sem julgamento
  3. Empty state: com 2-3 exemplos prontos pré-cadastrados

### Drag zone ampliada (botão de mover)
- Faixa esquerda inteira do card vira pega (V40.2.23) — mesmo padrão pra cards de rotina futuros

### Fases sugeridas
- **Fase 1:** Empty state + CRUD da rotina (criar, listar, editar, deletar)
- **Fase 2:** Botão "Carimbar" → cria card flutuante pendente
- **Fase 3:** Estilo visual refinado + animação de "carimbo soltando"

---

## 💡 INSTRUÇÕES FINAIS PRO CLAUDE NA NOVA CONVERSA

1. **Carregue mentalmente o estado V40.2.24 FINAL**
2. **Respeite as 11 Regras de Ouro**
3. **Antes de codificar V40.3**, confirme com Jhonatan a especificação detalhada da Fase 1
4. **Comece pequeno e simule DESDE O COMEÇO**
5. **Obedecer Jules letra por letra**
6. **UX no centro de cada decisão**
7. **NÃO mexer em código blindado (Regra #10) sem autorização**

---

## 🙏 RECONHECIMENTOS — SAGA V40.2.x ENCERRADA COM CHAVE DE OURO

Aprendizados acumulados:
- Respeitar diretrizes da Tech Lead (Jules)
- Simulações teóricas não substituem testes reais em celular
- Bugs em PWA são frequentemente do compositor gráfico (V40.2.17)
- `.focus()` programático em PWA é antipattern (Regra #2)
- "Gordura do dedo" no celular pede UX inteligente (V40.2.19)
- UX de fechamento precisa de raios de proteção claros (V40.2.18)
- Quando o usuário descreve uso real, essa frase é a chave do bug (V40.2.19, V40.2.23)
- Cores desbotadas tiram a vida do app (V40.2.20)
- Divulgação Progressiva > tudo à mão (V40.2.21)
- Matemática sem UX leva a respostas tecnicamente corretas mas humanamente erradas (V40.2.22)
- Pedir prints e perguntar ANTES de propor solução (V40.2.23)
- Helpers centralizados > lógica duplicada em 4 lugares (V40.2.24)
- **UX no centro** — Jhonatan

**Status final:** estrada limpa, asfaltada, com leis de UX claras. As 5 LEIS DE UX + busca expandida + ajustes de escala/drag elevam o TimeBlock ao padrão de apps modernos. Próxima saga: V40.3 — Motor de Rotinas.

🏗️🚀🥂
