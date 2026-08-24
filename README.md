# CRM SEI

PWA para acompanhar e organizar processos do SEI!MG sem alterar o sistema oficial. O sistema reúne uma interface React, um agente local Playwright e um backend Supabase isolado por usuário.

## Funcionalidades

- Painel, listas, busca, filtros, atribuídos, novos, marcadores, Kanban, prazos e históricos.
- Login pelo Supabase Auth, RLS, Realtime e notificações com níveis `AVISO`, `NUMERO` e `ASSUNTO`.
- Agente local somente leitura, com login manual no SEI, paginação, proxy, validação da coleta e agendamento sem sobreposição.
- Sincronização atômica e idempotente; a linha de base inicial não cria uma avalanche de eventos.
- Uma saída da unidade só é confirmada após duas ausências em retratos completos consecutivos.
- Campos internos do CRM separados dos dados observados no SEI.
- Testes unitários, de componentes, integração SQL e E2E responsivo.

O agente não contém operações para movimentar, atribuir, marcar, assinar ou modificar processos no SEI.

## Estrutura

```text
apps/web/       Aplicação React + Vite
agent/          Agente local Node.js + Playwright
packages/core/  Contratos Zod e reconciliação
supabase/       Migrations, RLS, RPCs, Realtime e testes pgTAP
tests/e2e/      Fluxos críticos da interface
```

## Como instalar e usar

O passo a passo completo está em [INSTALACAO_E_USO.md](INSTALACAO_E_USO.md). Ele cobre requisitos, Supabase, configuração da PWA e do agente, primeiro login, execução contínua, proxy, TLS e solução de problemas.

Para experimentar apenas a interface em modo demonstração:

```bash
npm install
npm run dev
```

Acesse `http://localhost:5173`.

## Validação do projeto

```bash
npm run verify
npm run test:e2e
npm audit
```

Os testes SQL exigem a Supabase CLI e um ambiente de contêineres:

```bash
supabase start
supabase db reset
supabase test db
supabase db lint --local --level warning
```

Consulte também [supabase/README.md](supabase/README.md) para o contrato da RPC e as garantias do banco.

## Limites deliberados

- Nenhum documento, PDF, anexo, assinatura ou conteúdo integral é copiado.
- O Kanban e os campos internos nunca alteram o SEI.
- O PWA mantém em cache apenas o shell e os recursos estáticos; respostas da API não ficam disponíveis offline.
- A coleta pausa quando o computador que executa o agente está desligado.
- Notificações com o PWA totalmente fechado exigem uma evolução com Web Push.
- Os seletores do SEI devem ser homologados na instalação real antes do uso operacional.
