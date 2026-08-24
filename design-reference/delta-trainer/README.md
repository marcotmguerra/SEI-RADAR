# Referência de design — Delta Trainer

Esta pasta reúne a base visual mais atual localizada entre os projetos Delta usados como referência.

## Fonte selecionada

- Repositório: `marcotmguerra/treino-app2`
- Projeto: **Delta Trainer**
- Commit de referência: `21322d9b30619eb2d0d04d869d7a8e47b2c2faad`
- Data do commit: 14/08/2026

O `treino-app2` é mais recente que as referências anteriores encontradas em `treino-app` e `F2fit`. O próprio README do projeto define a stack atual como React 19 + TypeScript, CSS Modules e tokens centralizados em `src/styles/tokens.css`.

## O que foi trazido para o CRM-SEI

- `tokens.css`: cores semânticas, tipografia, espaçamentos, raios, elevação, breakpoints, tema escuro e alvos de toque.
- `global.css`: reset e regras globais de acessibilidade e responsividade.
- `AppShell.tsx`: estrutura adaptativa de navegação.
- `AppShell.module.css`: comportamento mobile/tablet/desktop da casca de navegação.

Esses arquivos são **referência de UX/UI**, não dependências obrigatórias. O CRM-SEI deve reaproveitar os princípios e tokens adequando nomenclatura, marca e componentes ao domínio de processos administrativos.

## Direção visual para o CRM-SEI

Manter os princípios do Delta Trainer:

- hierarquia por tipografia e espaço antes de caixas e bordas;
- mobile-first;
- alvo de toque mínimo de 48 px;
- navegação adaptativa: bottom navigation no celular e rail/sidebar em telas maiores;
- cores semânticas, evitando cores hardcoded nos componentes;
- superfícies claras e discretas;
- cards com cantos moderados, sem transformar tudo em pílula;
- foco visível e suporte a `prefers-reduced-motion`;
- layout com largura máxima e gutters responsivos;
- estados de erro, sucesso, seleção e prioridade com tokens próprios.

## Adaptação ao CRM-SEI

A identidade visual pode usar a mesma estrutura de design system, mas os componentes de domínio devem ser próprios do CRM:

- cartão de processo;
- indicador de atribuição;
- marcador do SEI;
- prioridade e prazo;
- timeline de eventos;
- status do CRM;
- lista/kanban de processos;
- estado de sincronização do agente local;
- alerta de sessão SEI expirada.

Não copiar imagens, textos ou elementos de treino. A referência aqui é a arquitetura de interface e o design system.
