# CouroAncestral - Prompt de Melhorias e Correcoes

> Projeto: [CouroAncestral](https://github.com/GooseXRL8/CouroAncestral) (Google AI Studio)
> Stack: React 19 + TypeScript 5.8 + Vite 6 + TailwindCSS v4 + Web Audio API (procedural synthesis)
> Data da auditoria: 2026-06-15

---

## Etapa 1: Correcoes de Bugs Criticos

### BUG-01: AudioContext nao resume em contexto ja ativo

**Arquivo:** `src/audio.ts` (linhas 135-137)
**Problema:** O metodo `playHit` verifica `if (this.ctx.state === 'suspended')` e chama `resume()`. Porem, em algumas situacoes (especialmente no Safari ou quando o AudioContext foi criado mas nunca iniciado), o estado pode ser `running` mas os nodes nao estao conectados. Alem disso, `init()` e chamado dentro de `playHit` (linha 131) sem verificar se ja foi inicializado — `init()` verifica `if (this.initialized) return`, mas o retorno de `init()` e `Promise<void>` e nao e aguardado.

**Correcao esperada:**
- Garantir que `init()` seja sempre aguardado antes de tocar
- Verificar se o AudioContext esta realmente funcional antes de criar nodes
- Adicionar try-catch ao redor de toda a criacao de nodes

```typescript
public async playHit(...): Promise<{ type: 'TUM' | 'TA' | 'INTERMEDIATE' }> {
  try {
    if (!this.ctx || !this.initialized) {
      await this.init();
    }
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
    // ... rest of synthesis
  } catch (e) {
    console.error('Audio playback failed:', e);
    return { type: 'INTERMEDIATE' };
  }
}
```

---

### BUG-02: Memory leak nos osciladores e nodes de audio

**Arquivo:** `src/audio.ts` (linhas 245-264)
**Problema:** Os osciladores criados em `playHit` sao desconectados via `setTimeout` (linhas 298-305), mas em toques rapidos consecutivos, o `setTimeout` pode ser limpo ou executar antes que o node tenha terminado. Alem disso, os `GainNode` intermediarios (`gain` em linha 248) nao sao explicitamente desconectados — apenas o `output` e `panner` sao desconectados no timeout.

**Correcao esperada:**
- Desconectar TODOS os nodes criados (oscillators, gains, panner, noise nodes) no cleanup
- Usar `onended` nos osciladores ao inves de `setTimeout` para cleanup automatico
- Reduzir o tempo de timeout para evitar acumulo de nodes em toques rapidos

```typescript
// Desconectar todos os nodes no cleanup
osc.stop(now + attack + decay + release + 0.1);
osc.onended = () => {
  try {
    osc.disconnect();
    gain.disconnect();
  } catch (e) { /* safe ignore */ }
};
```

---

### BUG-03: activeGains acumula sem limite em toques rapidos

**Arquivo:** `src/audio.ts` (linhas 17-21, 153-172)
**Problema:** O array `activeGains` e limpo por idade (> 2 segundos) e por choke threshold (35ms), mas em toques muito rapidos (mais de 10 por segundo), o array pode crescer significativamente antes que o loop de limpeza execute. Isso causa processamento desnecessario no choke engine.

**Correcao esperada:**
- Adicionar um limite maximo ao array (ex: 20 entradas)
- Limpar voices com age > 1.0 segundo ao inves de 2.0 (mais agressivo)

```typescript
// Manter array pequeno
if (this.activeGains.length > 20) {
  this.activeGains = this.activeGains.slice(-10);
}
```

---

### BUG-04: GameState desatualizado em closures stale

**Arquivo:** `src/App.tsx` (linhas 87-154)
**Problema:** O handler `handleAtabaqueHit` usa `gameState.challengeStatus` e `gameState.challengeSequence` diretamente do closure. Como o React atualiza o state de forma assincrona, em toques rapidos consecutivos, o handler pode ler um state desatualizado (stale closure), causando avaliacoes incorretas da sequencia.

**Correcao esperada:**
- Usar `useRef` para o gameState no handler de hit
- Ou usar a forma funcional do `setGameState(prev => ...)` para ler o estado mais recente

```typescript
const gameStateRef = useRef(gameState);
useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

// No handler:
const currentGameState = gameStateRef.current;
if (currentGameState.challengeStatus === 'WAITING_USER') { ... }
```

---

### BUG-05: setActiveTouches causa re-renders desnecessarios

**Arquivo:** `src/components/AtabaqueCanvas.tsx` (linhas 52, 465-468)
**Problema:** Cada toque no atabaque chama `setActiveTouches` com um novo array, causando re-render do componente inteiro. Em toques rapidos, isso degrada significativamente a performance do canvas animation loop.

**Correcao esperada:**
- Usar `useRef` para as touches ativas (o canvas ja renderiza via `activeTouches` state, mas o ref evita re-renders)
- Ou limitar a 1 touch ativo por vez (toque mais recente)

---

## Etapa 2: Melhorias de Seguranca

### SEC-01: Sem validacao de entrada no customMessage

**Arquivo:** `src/App.tsx` — nao ha campo de mensagem custom (diferente do FlowerLove)
**Problema:** Nao ha entrada de usuario direta que possa ser explorada, mas o `handlePlayDemoHit` aceita coordenadas arbitrarias que sao usadas para calcular `distance` e `intensity` no audio engine.

**Correcao esperada:**
- Validar que x e y estao dentro dos limites esperados (-1 a 1)
- Garantir que distance e intensity estao entre 0 e 1

---

### SEC-02: AudioContext sem user-gesture check

**Arquivo:** `src/audio.ts` (linha 36)
**Problema:** O AudioContext e criado na primeira interacao do usuario (lazy init), o que e bom. Mas nao ha uma verificacao explicita de que o contexto foi criado apos um gesto do usuario. Alguns navegadores (especialmente mobile) podem bloquear a criacao.

**Correcao esperada:**
- Adicionar feedback visual claro quando o audio nao esta disponivel
- Mostrar um banner "Clique no atabaque para ativar o som" na primeira visita

---

## Etapa 3: Qualidade de Codigo e Manutenabilidade

### QA-01: package.json com nome generico

**Arquivo:** `package.json`
**Problema:** `"name": "react-example"`, `"version": "0.0.0"` — nunca foram atualizados desde o template do Google AI Studio.

**Correcao esperada:**
```json
{
  "name": "couro-ancestral",
  "version": "1.0.0",
  "description": "Simulador interativo de atabaque brasileiro com sintese fisica de som",
  "author": "Ganso Dev"
}
```

---

### QA-02: TailwindCSS classes com typos e valores invalidos

**Arquivo:** Diversos componentes
**Problema:** Ha varias classes Tailwind com erros de digitacao ou valores nao padrao:

| Arquivo | Linha | Class Errada | Class Correta |
|---------|-------|---------------|---------------|
| `App.tsx` | 217 | `bg-orange-550` | `bg-orange-500` |
| `App.tsx` | 217 | `animate-pulse` em span | Verificar se nao deveria ser `animate-ping` |
| `GameModes.tsx` | 265 | `bg-red-650` | `bg-red-600` |
| `GameModes.tsx` | 265 | `hover:bg-red-750` | `hover:bg-red-700` |
| `GameModes.tsx` | 329 | `text-stone-550` | `text-stone-500` |
| `GameModes.tsx` | 385 | `font-extraboldhadow` | `font-extrabold shadow` (espaco faltando — deveria ser `font-extrabold shadow`) |
| `GameModes.tsx` | 385 | `shadow-[0_0_10px...]` | OK, mas a class `font-extrabold` esta colada com `shadow` |
| `SettingsPanel.tsx` | 62 | `text-stone-350` | `text-stone-300` ou `text-stone-400` |
| `SettingsPanel.tsx` | 180 | `bg-red-950/15` | OK (tailwind v4 aceita) |
| `index.css` | 1 | `@import url(...)` | Mover para `index.html` como `<link>` (melhor performance) |

**Correcao esperada:**
- Rodar um lint de classes Tailwind ou buscar todas as classes que nao existem
- Padronizar a nomenclatura (sempre usar valores validos: 50, 100, 150, 200, 300...)

---

### QA-03: Duplicacao de logica de calculo de audio

**Arquivo:** `src/audio.ts` (linhas 196-201)
**Problema:** O calculo de `t_stable` (zona estabilizada) e feito com `lerp` mas a logica de mapeamento e complexa e poderia ser extraida para uma funcao utilitaria. Alem disso, os mesmos valores de `t_stable` sao re-calculados para frequencias, envelope e timbre.

**Correcao esperada:**
- Extrair a logica de `t_stable` para uma funcao `mapToStableZone(t: number)`
- Criar tipos intermediarios para os parametros de audio (frequencies, envelope, timbre)

---

### QA-04: Constantes magicas espalhadas

**Problema:** Ha diversos valores hardcoded que deveriam ser constantes:

| Arquivo | Linha | Valor | Deveria ser |
|---------|-------|-------|-------------|
| `audio.ts` | 40 | `threshold: -3` | `COMPRESSOR_THRESHOLD_DB` |
| `audio.ts` | 144 | `t < 0.50` | `TA_TUM_THRESHOLD` |
| `audio.ts` | 152 | `0.035` | `CHOKE_THRESHOLD_SEC` |
| `audio.ts` | 176 | `0.60` | `MIN_VELOCITY` |
| `audio.ts` | 175 | `0.85` | `SKIN_TENSION` |
| `GameModes.tsx` | 108 | `220` | `DEMO_STEP_DURATION_MS` |
| `GameModes.tsx` | 147 | `60000` | `MS_PER_MINUTE` |
| `AtabaqueCanvas.tsx` | 112 | `0.44` | `DRUM_RADIUS_FACTOR` |

**Correcao esperada:**
- Criar `src/constants.ts` com todas as constantes
- Importar nos arquivos que precisam

---

### QA-05: Tipos TypeScript nao utilizados

**Arquivo:** `src/types.ts`
**Problema:** O tipo `HitEvent` nao e utilizado em nenhum lugar do codigo. O tipo `RhythmStep` tambem nao e usado. O tipo `ChallengeSequence` e usado apenas em `GameModes.tsx`.

**Correcao esperada:**
- Remover tipos nao utilizados ou implementar o uso
- Adicionar `@ts-check` rigoroso

---

## Etapa 4: Testes

### TEST-01: Adicionar testes unitarios

**Situacao atual:** Zero cobertura de testes

**Implementar com:** Vitest + React Testing Library

**Testes prioritarios:**
1. `audio.ts` — testar `calculateAnniversary` (N/A para este projeto, mas testar `mapToStableZone` se extraido)
2. `audio.ts` — testar `lerp()` com valores conhecidos
3. `GameModes.tsx` — testar a logica de desafio: sequencia correta, sequencia errada, level up
4. `AtabaqueCanvas.tsx` — testar o trigger de hit com coordenadas conhecidas
5. `types.ts` — validar que todos os tipos sao exportados corretamente

---

### TEST-02: Adicionar testes E2E

**Situacao atual:** Zero testes E2E

**Implementar com:** Playwright

**Cenarios prioritarios:**
1. Carregar pagina → Clicar no canvas → Verificar que o audio toca (via mock)
2. Modo Desafio → Selecionar nivel 1 → Ouvir prompt → Repetir sequencia → Verificar score
3. Modo Exemplo → Iniciar demo → Verificar que o ritmo toca → Parar
4. Settings → Mudar tuning → Verificar que o som muda
5. Reset session → Verificar que hitCount volta a 0

---

## Etapa 5: Performance e UX

### PERF-01: Canvas animation loop sem throttling

**Arquivo:** `src/components/AtabaqueCanvas.tsx` (linhas 90-361)
**Problema:** O loop de renderizacao roda via `requestAnimationFrame` sem nenhum throttling. Em dispositivos lentos ou com DPR alto (3x em alguns celulares), o canvas pode cair de FPS.

**Correcao esperada:**
- Monitorar FPS e reduzir complexidade se necessario
- Reduzir o numero de segmentos no ripple (120 → 60) em dispositivos lentos
- Usar `OffscreenCanvas` se disponivel

---

### PERF-02: Re-renders desnecessarios no GameModes

**Arquivo:** `src/components/GameModes.tsx`
**Problema:** O componente `GameModes` recebe `gameState` e `setGameState` como props. Cada mudanca no gameState (incluindo `playbackProgress` que muda a cada step do desafio) causa re-render de todo o painel.

**Correcao esperada:**
- Extrair o HUD de status (score, streak, nivel) em um componente memoizado
- Extrair o painel de desafio em um componente separado
- Usar `React.memo` nos sub-componentes

---

### PERF-03: setInterval no demo sem cleanup adequado

**Arquivo:** `src/components/GameModes.tsx` (linhas 110-119)
**Problema:** O `setInterval` do demo e limpo em `stopAllSequences`, mas se o usuario navegar para outra aba e voltar, o intervalo pode ter sido limpo sem que o estado `demoPlaying` tenha sido atualizado.

**Correcao esperada:**
- Usar `useEffect` com cleanup para gerenciar o timer
- Sincronizar `demoPlaying` com o estado real do timer

---

### UX-01: Feedback visual de toque insuficiente

**Problema:** Quando o usuario toca o atabaque, as ondas de choque e sparks aparecem, mas nao ha feedback claro de qual tipo (TUM ou TA) foi detectado.

**Correcao esperada:**
- Mostrar um indicador "TUM" ou "TA" brevemente na tela apos cada toque
- Adicionar vibracao háptica (Vibration API) em dispositivos mobile

---

### UX-02: Sem suporte a mobile/touch

**Problema:** O canvas responde a cliques e teclas, mas nao ha suporte a touch events explicitos. Em dispositivos mobile, o toque pode nao ser registrado corretamente.

**Correcao esperada:**
- Adicionar handlers de `touchstart` e `touchmove` no canvas
- Prevenir scroll da pagina durante toque no canvas (`touch-action: none`)
- Testar em dispositivos mobile reais

---

### UX-03: Teclas de atalho nao documentadas

**Arquivo:** `src/components/AtabaqueCanvas.tsx` (linhas 472-498)
**Problema:** As teclas C, V, N, M sao usadas para tocar o atabaque, mas nao ha nenhum tooltip ou documentacao visual para o usuario.

**Correcao esperada:**
- Adicionar um painel de "Controles" mostrando as teclas
- Permitir que o usuario customize as teclas

---

## Etapa 6: Features e Melhorias de Produto

### FEAT-01: Gravacao e playback de ritmos

**Problema:** O usuario pode tocar livremente, mas nao pode gravar uma sequencia e reproduzi-la.

**Implementar:**
- Botao "Gravar" que armazena a sequencia de toques (tipo, timestamp, position)
- Botao "Reproduzir" que replay a gravacao
- Exportar gravacao como JSON

---

### FEAT-02: Mais ritmos de desafio

**Problema:** Existem apenas 7 niveis pre-definidos.

**Implementar:**
- Ritmos adicionais de capoeira (Angola, Benguela, Sao Bento Grande de Bimba)
- Ritmos de samba, maracatu, frevo
- Editor de ritmos customizados pelo usuario

---

### FEAT-03: Compartilhamento social

**Problema:** Nao ha como compartilhar a pontuacao ou ritmos.

**Implementar:**
- Botao "Compartilhar" que gera uma imagem/texto com a pontuacao
- Integracao com Web Share API para compartilhar nativo em mobile

---

### FEAT-04: Multiplayer local

**Problema:** Apenas um usuario pode tocar por vez.

**Implementar:**
- Modo "2 jogadores" com teclas diferentes para cada jogador
- Placar competitivo

---

### FEAT-05: PWA (Progressive Web App)

**Problema:** O app nao pode ser instalado no celular.

**Implementar:**
- `manifest.json` com icones, theme_color, display: standalone
- Service Worker com cache-first para assets
- Funcionar offline (o audio e canvas ja sao client-side)

---

## Etapa 7: DevOps

### DEV-01: CI/CD Pipeline

**Situacao atual:** Deploy manual pelo Google AI Studio

**Implementar:**
- GitHub Actions workflow: `lint → test → build → deploy`
- Deploy automatico na Vercel/Netlify a cada merge em `main`
- Preview deploys PRs

---

### DEV-02: Estrutura de pastas escalavel

**Problema:** Conforme o projeto crescera, a estrutura atual nao escala bem.

**Estrutura sugerida:**
```
src/
├── app/              → Layout, providers, rotas
├── features/         → Cada feature como modulo independente
│   ├── atabaque/     → Canvas, audio engine, hit detection
│   ├── game-modes/   → Free, Example, Challenge modes
│   └── settings/     → Audio settings, tuning
├── components/       → Componentes compartilhados (UI pura)
├── hooks/            → Custom hooks (useAudio, useGameState)
├── utils/            → Funcoes utilitarias
├── constants/        → Constantes do app
├── types/            → Tipos TypeScript globais
└── styles/           → Estilos globais, temas
```

---

## Resumo de Prioridade

| Prioridade | ID | Descricao |
|------------|-----|-----------|
| **P0 (Critico)** | BUG-01 | AudioContext nao resume corretamente |
| **P0 (Critico)** | BUG-02 | Memory leak nos nodes de audio |
| **P1 (Alto)** | BUG-04 | Stale closure no gameState |
| **P1 (Alto)** | QA-02 | Tailwind classes com typos |
| **P1 (Alto)** | QA-04 | Constantes magicas espalhadas |
| **P2 (Medio)** | BUG-03 | activeGains sem limite |
| **P2 (Medio)** | BUG-05 | setActiveTouches causa re-renders |
| **P2 (Medio)** | PERF-01 | Canvas sem throttling |
| **P2 (Medio)** | PERF-02 | Re-renders no GameModes |
| **P2 (Medio)** | UX-02 | Sem suporte a touch/mobile |
| **P2 (Medio)** | QA-01 | package.json generico |
| **P3 (Baixo)** | FEAT-01 | Gravacao de ritmos |
| **P3 (Baixo)** | FEAT-05 | PWA |
| **P3 (Baixo)** | DEV-01 | CI/CD |
| **P3 (Baixo)** | DEV-02 | Estrutura de pastas |
