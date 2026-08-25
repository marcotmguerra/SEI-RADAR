# Delta Design System
> Padrões de UI/UX para padronização dos sistemas internos

---

## 1. Fundamentos Visuais

### 1.1 Grid e Espaçamento

Adote uma base de **12px** como unidade fundamental do sistema — é um número altamente composto (divisível por 1, 2, 3, 4, 6 e 12), o que garante flexibilidade máxima para construir escalas harmônicas.

**Escala recomendada:**

| Token        | Valor  | Uso típico                      |
|--------------|--------|---------------------------------|
| `space-1`    | 4px    | Padding interno mínimo          |
| `space-2`    | 8px    | Gap entre ícone e label         |
| `space-3`    | 12px   | Base — padding de componentes   |
| `space-4`    | 16px   | Espaçamento entre elementos     |
| `space-6`    | 24px   | Seções internas                 |
| `space-8`    | 32px   | Separação entre blocos          |
| `space-12`   | 48px   | Margens de layout               |
| `space-16`   | 64px   | Seções de página                |

> **Regra prática:** nunca use valores arbitrários fora da escala. Se o design "pede" 18px, questione — provavelmente é 16px ou 20px.

---

### 1.2 Tipografia

Qual fonte usar? Pesquisar de acordo com o tema do sistema/site/app.

**Nunca usar:** Inter, Roboto, Arial, system-ui, Space Grotesk como escolha padrão. Essas fontes sinalizam UI genérica de IA/SaaS.

**Abordagem correta:** parear uma fonte de **display expressiva** com uma fonte de **corpo altamente legível**.

**Sugestões de pares:**

| Display (títulos)  | Body (corpo)   | Personalidade              |
|--------------------|----------------|----------------------------|
| Fraunces           | DM Sans        | Editorial, premium         |
| Bricolage Grotesque| Figtree        | Moderna, técnica           |
| Syne               | Instrument Sans| Bold, sistemática          |
| Playfair Display   | Lato           | Clássica, confiável        |

#### Escala tipográfica modular

Assim como o espaçamento tem base 12px, a tipografia precisa de uma **razão modular** — um multiplicador fixo que gera todos os tamanhos a partir de um corpo base. Isso cria hierarquia rítmica em vez de tamanhos "no olho".

Razões comuns:

| Razão | Nome           | Sensação                        |
|-------|----------------|---------------------------------|
| 1.200 | Minor third    | Compacta, densa (dashboards)    |
| 1.250 | Major third    | Equilibrada (uso geral)         |
| 1.333 | Perfect fourth | Dramática, editorial            |

**Exemplo** — base 16px × 1.250 (arredondando para inteiros):

| Token         | Valor  | Uso                       |
|---------------|--------|---------------------------|
| `text-xs`     | 13px   | Captions, metadados       |
| `text-sm`     | 14px   | Texto auxiliar            |
| `text-base`   | 16px   | Corpo padrão              |
| `text-lg`     | 20px   | Subtítulos                |
| `text-xl`     | 25px   | H3                        |
| `text-2xl`    | 31px   | H2                        |
| `text-3xl`    | 39px   | H1                        |
| `text-4xl`    | 49px   | Display / hero            |

> Defina **uma** razão por sistema e gere a escala a partir dela. Mudou a razão? Toda a hierarquia se reajusta de forma coerente.

#### Medida (line length)

O comprimento da linha de texto tem um ótimo perceptual: **45–75 caracteres por linha** (~66 é o ideal) para corpo de texto.

- Linhas **longas demais** fazem o olho perder o início da próxima.
- Linhas **curtas demais** quebram o ritmo da leitura.
- Na prática: `max-width: 65ch` em blocos de texto longo.

---

### 1.3 Paleta de Cores — Regra 60/30/10

Evite usar a cor primária em excesso. O equilíbrio correto:

| Proporção | Papel           | Descrição                                              |
|-----------|-----------------|--------------------------------------------------------|
| **60%**   | Neutros         | Fundos, superfícies, espaços em branco                 |
| **30%**   | Cor primária    | Identidade da marca, headers, elementos estruturais    |
| **10%**   | Cor de acento   | CTAs, alertas, elementos interativos de ação           |

> Usar a cor primária em mais de 30% da interface cria sobrecarga visual e dilui o impacto das ações importantes.

---

### 1.4 Nunca Dependa Apenas da Cor

Cerca de **8% dos homens** têm algum tipo de daltonismo. Cor sozinha nunca pode ser o único portador de informação.

**Regra-teste:** se a interface for convertida para escala de cinza, a informação ainda precisa sobreviver.

| Situação                 | ❌ Só cor                  | ✅ Cor + reforço                          |
|--------------------------|----------------------------|-------------------------------------------|
| Campo com erro           | Borda vermelha             | Borda + ícone + mensagem de texto         |
| Status (online/offline)  | Bolinha verde/cinza        | Bolinha + label                           |
| Séries de gráfico        | Cores diferentes           | Rótulos diretos, padrões ou ícones        |
| Link no meio do texto    | Cor diferente              | Cor + sublinhado                          |

> O contraste WCAG (ver checklist) resolve legibilidade; este princípio resolve **diferenciação**. São problemas distintos.

---

### 1.5 Espaço Negativo (White Space)

O espaço em branco não é "espaço desperdiçado" — é um elemento ativo de design.

**Funções do espaço negativo:**
- Cria hierarquia visual sem usar bordas ou divisores
- Agrupa elementos relacionados (lei da proximidade)
- Guia o olhar do usuário pelo fluxo desejado
- Comunica qualidade e confiança

> **Anti-padrão a evitar:** encher a tela com elementos para "parecer completo". Layouts densos aumentam a carga cognitiva e reduzem conversão.

#### Princípios de Gestalt — agrupar sem bordas

A proximidade é só um dos princípios de Gestalt. Juntos, eles resolvem quase todos os casos onde você seria tentado a desenhar uma linha divisória:

| Princípio        | O que faz                                                         | Como usar                                      |
| ---------------- | ----------------------------------------------------------------- | ---------------------------------------------- |
| **Proximidade**  | Elementos próximos são lidos como grupo                           | Aproxime relacionados, afaste não relacionados |
| **Região comum** | Um fundo/card compartilhado agrupa **mais forte** que proximidade | Card de superfície em vez de borda             |
| **Similaridade** | Mesma cor/forma = mesma função percebida                          | Botões da mesma ação têm o mesmo estilo        |
| **Figura-fundo** | O elemento que "salta" vira o foco                                | Contraste de superfície destaca o que importa  |

> Antes de adicionar uma borda, pergunte: dá para resolver com proximidade, fundo compartilhado ou contraste de superfície?

---

### 1.6 Bordas — Usar com Moderação

Bordas em excesso são um dos erros mais silenciosos no UI.

**Problema:** bordas dentro de bordas criam ruído visual, fazem a interface parecer um wireframe inacabado e cansam os olhos de quem escaneia.

**Alternativas preferidas para separar elementos:**
- Diferença de cor de superfície (`color-surface-raised` vs `color-background-default`)
- Espaçamento generoso
- Sombras sutis (`box-shadow` com baixa opacidade)
- Agrupamento tipográfico

> Use bordas apenas quando há uma necessidade semântica clara (ex: campo de input, tabela de dados).

---

### 1.7 Raio de Borda Concêntrico

Quando um elemento arredondado está **dentro** de outro (botão dentro de card, card dentro de container), os raios não podem ser iguais — devem ser concêntricos.

**Fórmula:**

```
raio externo = raio interno + distância (padding) entre eles
```

**Exemplo:** card com `padding: 16px` e cantos internos de `8px` → o card deve ter raio externo de `24px`.

- Cantos aninhados com o **mesmo** raio parecem "tortos".
- Raio externo **menor** que o interno é o pior caso — os cantos brigam.

> É um dos sinais mais silenciosos de UI amadora. Corrigir é barato e o ganho de polimento é imediato.

---

### 1.8 Alinhamento Óptico (não matemático)

O centro calculado pela régua raramente é o centro **percebido**. O olho manda mais que o `px`.

- **Ícone de play** num botão circular: centralizado matematicamente, parece deslocado à esquerda — precisa de um leve empurrão à direita.
- **Overshoot:** formas redondas e pontiagudas (círculos, triângulos) devem ultrapassar levemente a baseline de retângulos para parecerem do mesmo tamanho.
- **Ícone + label:** ajuste o gap pelo peso visual, não pela caixa do ícone.

> Em ícones dentro de botões, badges e avatares: confie no olho, faça o ajuste fino manual.

---

### 1.9 Estilo

- `style-match` — Combinar o estilo do produto
- `consistency` — Usar o mesmo estilo em todas as páginas
- `no-emoji-icons` — Usar ícones SVG (Heroicons, Lucide) e **NUNCA** emojis

---

### 1.10 Contraste em Light / Dark Mode

| Regra | Faça | Não faça |
|-------|------|----------|
| **Glass card light mode** | `bg-white/80` ou opacidade maior | `bg-white/10` (transparente demais) |
| **Contraste de texto (light)** | `#0F172A` (slate-900) | `#94A3B8` (slate-400) para corpo |
| **Texto mudo (light)** | `#475569` (slate-600) no mínimo | gray-400 ou mais claro |
| **Visibilidade de borda** | `border-gray-200` no light | `border-white/10` (invisível) |

> Em light mode, troque `box-shadow` por `border` quando a sombra não tiver contraste suficiente para ser percebida.

---

### 1.11 Evitar Valores Puros

- **Nunca use preto puro (`#000`) nem branco puro (`#FFF`).** Texto preto sobre fundo branco causa fadiga por excesso de contraste. Prefira quase-preto (`#0F172A`) e quase-branco (`#FAFAFA`).
- **Evite cores 100% saturadas.** Cores puras vibram, cansam e raramente existem na natureza. Reduza levemente a saturação para um resultado mais sofisticado e confortável.

---

### 1.12 Formulários

- Use **alinhamento horizontal** consistente (labels e campos alinhados) para criar uma coluna de leitura limpa.
- Validação **inline**, não apenas ao submeter.
- Se o texto de um bloco tiver **mais de 4 linhas, alinhe à esquerda** (centralizado só funciona em trechos curtos).

---

### 1.13 Controles de Seleção

- **Radio buttons** para escolha **única**.
- **Checkboxes** para escolha **múltipla**.
- Nunca misture as semânticas — o formato comunica a regra antes da leitura.

---

### 1.14 Input Masks

Use máscaras de input nos campos (telefone, CPF, data, cartão) para **guiar o usuário** e reduzir erro de formato durante a digitação.

---

## 2. Tokens Semânticos de Cor

### Estrutura de Nomenclatura

```
color → element → priority → state
```

**Exemplo:** `color-text-primary-disabled`

| Segmento   | Descrição                                     | Exemplos                                                        |
|------------|-----------------------------------------------|-----------------------------------------------------------------|
| `color`    | Prefixo fixo — indica token de cor            | `color`                                                         |
| `element`  | Papel visual do token                         | `text`, `icon`, `fill`, `border`, `background`, `surface`       |
| `priority` | Hierarquia dentro do elemento                 | `primary`, `secondary`, `tertiary`                              |
| `state`    | Estado interativo ou condicional              | `default`, `hover`, `active`, `disabled`, `focus`               |

---

### Camadas de Definição

**Foundation — Fundos e Superfícies**
```
color-background-default     → Fundo base da página
color-background-subtle      → Área levemente destacada
color-surface-raised         → Cards, modais, dropdowns
color-surface-overlay        → Overlays e drawers
color-surface-sunken         → Inputs, áreas internas recuadas
```

**Component Roles — Fills, Bordas, Texto e Ícones**
```
color-fill-primary           → Botão primário, badges principais
color-fill-secondary         → Botão secundário
color-fill-danger            → Ações destrutivas
color-fill-success           → Confirmações

color-border-default         → Bordas padrão
color-border-strong          → Bordas de ênfase
color-border-focus           → Outline de foco (acessibilidade)

color-text-primary           → Corpo de texto principal
color-text-secondary         → Labels, metadados, auxiliares
color-text-placeholder       → Placeholder de input
color-text-inverse           → Texto sobre fundos escuros
color-text-on-color          → Texto sobre cor primária

color-icon-primary           → Ícones funcionais principais
color-icon-secondary         → Ícones de suporte
color-icon-decorative        → Ícones puramente visuais
```

**Priority + State — Estados Interativos**
```
color-text-primary-default
color-text-primary-hover
color-text-primary-active
color-text-primary-disabled
color-text-primary-focus

color-fill-primary-default
color-fill-primary-hover
color-fill-primary-disabled

color-border-primary-default
color-border-primary-focus
color-border-danger-default
```

---

### Anti-padrões de Nomenclatura

| ❌ Evitar              | ✅ Preferir                      |
|------------------------|----------------------------------|
| `color-blue-500`       | `color-fill-primary-default`     |
| `color-gray-200`       | `color-background-subtle`        |
| `button-hover-color`   | `color-fill-primary-hover`       |
| `disabled-text`        | `color-text-primary-disabled`    |

> **Regra de ouro:** o nome do token descreve o *papel*, não o *valor*. Qualquer dev ou designer sabe onde usá-lo sem consultar a documentação.

---

### Princípios dos Tokens

- **Previsibilidade** — nomes descrevem função, não aparência
- **Escalabilidade** — mudar o valor primitivo atualiza toda a UI automaticamente
- **Manutenibilidade** — hierarquia clara elimina duplicações e inconsistências

---

## 3. UX e Interação

### 3.1 Feedback de Ações

**Problema crítico:** o usuário clica em um botão e nada acontece. Ele não sabe se salvou, se deu erro ou se precisa esperar.

**Regra:** toda ação deve ter resposta visual imediata.

**Estados obrigatórios para qualquer operação assíncrona:**

| Estado    | O que mostrar                                            |
|-----------|----------------------------------------------------------|
| Loading   | Spinner, skeleton, ou barra de progresso                 |
| Sucesso   | Confirmação visual (toast, checkmark, mudança de estado) |
| Erro      | Mensagem específica + ação de recuperação                |
| Vazio     | Explicar por que está vazio + o que fazer                |

> **Microcopy:** botões devem descrever a ação — **"Salvar rascunho"** não **"Enviar"**. Mensagens de erro respondem: *o que aconteceu* + *o que fazer*.

---

### 3.2 Tempo de Resposta — Limiar de Doherty e UI Otimista

A percepção de velocidade importa mais que a velocidade real.

- **Limiar de Doherty:** abaixo de **~400ms** a interação parece instantânea e mantém o usuário no fluxo. Acima disso, ele "sai" mentalmente da tarefa.
- **Feedback imediato:** se a operação passar de 400ms, mostre estado de loading **na hora** — o usuário precisa saber que o clique foi registrado.
- **UI otimista:** para ações com alta chance de sucesso (curtir, favoritar, marcar como lido, reordenar), atualize a interface **imediatamente** e reconcilie com o servidor em segundo plano. Reverta apenas se der erro.

> Regra: nunca deixe o usuário esperando uma resposta de rede para ver o resultado de uma ação trivial.

---

### 3.3 Micro-interações

Animações sutis elevam a percepção de qualidade sem distrair.

**Usos corretos:**
- Hover effects em elementos interativos
- Indicadores de progresso
- Transições de estado (carregando → sucesso)
- Confirmação de ação (ex: botão que "pulsa" ao salvar)
- Revelação de conteúdo (staggered load)

#### Easing e timing — onde mora o "feel"

| Parâmetro          | Recomendação                                              |
|--------------------|-----------------------------------------------------------|
| **Entrada**        | `ease-out` — começa rápido, desacelera (parece responsivo)|
| **Saída**          | `ease-in` — acelera ao sair                               |
| **Duração**        | 150–250ms para a maioria; acima de 400ms parece lento     |
| **Linear**         | Apenas para loops contínuos (spinners)                    |

- **Anime só `transform` e `opacity`** — rodam na GPU a 60fps.
- **Evite animar** `width`, `height`, `top`, `left` ou `margin` — causam reflow e travadas.
- Sempre respeitar `prefers-reduced-motion` para acessibilidade.

---

### 3.4 Onboarding Flow

Fluxo de cadastro com barra de progresso — padrão recomendado:

- Dividir o cadastro em etapas **nomeadas** (não apenas "Passo 2 de 5")
- Mostrar o que já foi completado e o que vem a seguir
- Permitir voltar sem perder dados
- Validação inline (não só ao submeter)
- CTA da etapa deve descrever o avanço: **"Continuar para pagamento"**, não **"Próximo"**

---

### 3.5 Simplicidade e Carga Cognitiva

- Limite os elementos visíveis por tela — cada elemento desnecessário compete pela atenção
- Layout claro e direto reduz a carga cognitiva
- **Reconhecimento > Memória:** labels visíveis, affordances claros, nenhuma regra oculta
- **Regra dos 5 segundos:** um novo usuário deve entender o propósito, o público e o próximo passo em até 5 segundos

---

### 3.6 Lei de Jakob — convenções de interação

> Os usuários passam a maior parte do tempo em **outros** sistemas. Eles esperam que o seu funcione como aqueles que já conhecem.

Há uma tensão saudável com a meta de "não parecer IA/SaaS genérico", e ela se resolve assim:

- **Inove na estética** — tipografia, cor, personalidade, movimento.
- **Mantenha as convenções de interação** — `X` fecha modal, logo volta para a home, carrinho no canto superior direito, busca com lupa.

> Memorável no visual, **previsível** no comportamento. Reinventar onde clicar é fricção, não inovação.

---

### 3.7 Lei de Fitts — alvos e distância

O tempo para atingir um alvo depende do **tamanho** dele e da **distância** até ele.

- **Touch targets ≥ 48px** (mínimo confortável no toque).
- **Cantos e bordas da tela** são alvos "infinitos" — o cursor para neles. Ótimos para ações frequentes (menu, fechar).
- **Ações destrutivas longe das frequentes:** nunca coloque "Excluir" colado em "Salvar".
- **Mobile:** priorize a zona do polegar (terço inferior da tela) para ações principais.

---

### 3.8 Feedback Multissensorial

- **Háptico:** vibração curta para confirmar ações importantes (envio, erro, toggle) em dispositivos compatíveis. Sutil — nunca para cada toque.
- **Sonoro:** toggleável via configurações; nunca ligado por padrão sem aviso.

> Reforço sensorial complementa o feedback visual — nunca o substitui (acessibilidade).

---

## 4. Estado de Carregamento com Personalidade

Splash screen com mensagens rotativas a cada 900ms e spinner. O carregamento é uma oportunidade de marca, não tempo morto.

---

## 5. Checklist de Qualidade

Antes de entregar qualquer tela ou componente:

- [ ] Propósito claro em 5 segundos?
- [ ] Uma ação primária dominante e inconfundível?
- [ ] Todos os estados tratados: loading · vazio · erro · sucesso · desabilitado?
- [ ] Acessível: contraste WCAG AA · labels · touch targets ≥ 48px?
- [ ] Informação não depende **apenas** de cor (sobrevive em escala de cinza)?
- [ ] Layout responsivo (reorganiza, não escala)?
- [ ] Tokens semânticos usados — zero valores hardcoded de cor?
- [ ] Fontes fora do padrão genérico (sem Inter, Roboto, Arial)?
- [ ] Escala tipográfica segue uma razão modular única?
- [ ] Medida de texto entre 45–75 caracteres por linha?
- [ ] Bordas usadas apenas quando semanticamente necessárias?
- [ ] Raios de borda concêntricos em elementos aninhados?
- [ ] Espaçamento dentro da escala de 12px?
- [ ] Sem preto/branco puro nem cores 100% saturadas?
- [ ] Feedback visual para toda ação do usuário (em < 400ms)?
- [ ] Animações só em `transform`/`opacity` e respeitando `prefers-reduced-motion`?
- [ ] Convenções de interação preservadas (Lei de Jakob)?
- [ ] Design memorável — não parece IA/SaaS genérico?

---

*Delta Design System — v0.2*
