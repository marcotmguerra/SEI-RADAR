# Plano de Desenvolvimento — CRM SEI

## 1. Objetivo

Criar uma aplicação que funcione como uma camada de gestão sobre o SEI!MG, sem substituir ou modificar o SEI.

O sistema deverá monitorar automaticamente:

- processos presentes na unidade;
- processos atribuídos ao usuário;
- processos presentes em determinados marcadores;
- entrada de novos processos;
- atribuição de processos ao usuário;
- saída de processos da unidade;
- alterações relevantes nos marcadores.

A primeira versão será **100% somente leitura no SEI**.

O CRM terá funcionalidades próprias, como:

- status de atendimento;
- prioridade;
- prazo;
- observações;
- histórico;
- filtros;
- dashboard;
- kanban;
- notificações.

---

# 2. Arquitetura recomendada

```text
                    SEI!MG
                       │
                       │
                 Playwright
                       │
                 Chromium Headless
                       │
                       ▼
               Worker Node.js
                    VPS
                       │
                       │
                 Supabase API
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
      PostgreSQL    Realtime    Edge Functions
          │                         │
          │                         └── notificações
          │
          ▼
       CRM React
        / PWA
```

### Responsabilidade de cada componente

**Playwright**

Responsável exclusivamente por acessar e ler o SEI.

**VPS / Worker Node.js**

Executa o Playwright, controla a sessão e envia os resultados para o Supabase.

**Supabase**

Será a fonte principal de dados do CRM.

Utilizaremos:

- PostgreSQL;
- Auth;
- RLS;
- Realtime;
- Edge Functions;
- Cron;
- eventualmente Webhooks.

**React/PWA**

Interface utilizada pelo usuário.

---

# 3. Por que não executar Playwright diretamente em uma Edge Function

O Playwright trabalha com um navegador real ou headless e precisa dos binários do Chromium e respectivas dependências do sistema operacional.

A própria instalação oficial do Playwright prevê:

```bash
npx playwright install chromium
```

e, em ambientes Linux:

```bash
npx playwright install --with-deps chromium
```

As Edge Functions hospedadas do Supabase possuem limites de execução, memória e CPU e não são um servidor Linux convencional onde manteremos um navegador Chromium.

Portanto:

```text
ERRADO

Supabase Cron
     ↓
Edge Function
     ↓
Playwright
     ↓
SEI
```

A arquitetura será:

```text
Supabase Cron
     ↓
Edge Function
     ↓
chama Worker privado
     ↓
Playwright
     ↓
SEI
```

Ou, ainda mais simples:

```text
Cron da própria VPS
     ↓
Playwright
     ↓
SEI
     ↓
Supabase
```

Para a primeira versão, esta segunda opção é a que eu utilizaria.

Tem menos componentes e consequentemente menos pontos de falha.

---

# 4. Frequência de sincronização

Inicialmente:

```text
A cada 10 minutos
```

Depois de validar estabilidade:

```text
A cada 5 minutos
```

Não existe necessidade de consultar o SEI a cada poucos segundos.

Com intervalo de 5 minutos teremos no máximo:

```text
12 verificações/hora
```

O suficiente para um CRM administrativo sem gerar consultas desnecessárias ao SEI.

Também podemos limitar para horário de expediente.

Exemplo:

```text
06:00 → 22:00
segunda a sexta
```

---

# 5. Primeiro desafio: autenticação

O Playwright deverá autenticar no SEI.

Existem duas possibilidades.

## Opção A — Login manual inicial

É a opção que eu testaria primeiro.

Abrimos o Chromium com Playwright:

```text
Playwright
   ↓
SEI
   ↓
usuário faz login
   ↓
sessão autenticada
   ↓
storageState
```

Depois disso o Playwright reutiliza a sessão.

O Playwright suporta oficialmente salvar cookies, localStorage e outros dados de autenticação em um `storageState`. A documentação alerta que esse arquivo é sensível porque quem tiver acesso a ele poderá potencialmente utilizar a sessão autenticada.

Portanto:

```text
playwright/.auth/sei.json
```

NUNCA deverá entrar no Git.

Adicionar:

```gitignore
playwright/.auth/
.env
```

O arquivo deverá existir somente no servidor.

---

# 6. Expiração da sessão

Se o SEI expirar a sessão, o robô NÃO tentará contornar controles de segurança.

Ele deverá registrar:

```text
STATUS:
AUTH_EXPIRED
```

e gerar uma notificação:

```text
⚠️ CRM SEI

A sessão do SEI expirou.

É necessário autenticar novamente.
```

Depois fazemos novo login manual e atualizamos o estado de autenticação.

Se posteriormente descobrirmos que é seguro e autorizado automatizar o formulário de login, poderemos avaliar isso separadamente.

---

# 7. Primeira automação

Inicialmente o Playwright não fará absolutamente nenhuma alteração no SEI.

Ele apenas irá para:

```text
Controle de Processos
```

e identificará:

```text
Processos recebidos
Processos gerados
```

A primeira prova de conceito deverá produzir algo parecido com:

```json
{
  "unidade": "CBMMG/BEMAD",
  "data": "2026-08-23T21:00:00",
  "recebidos": [
    "1400.01.0048464/2026-71",
    "1400.01.0000704/2023-82"
  ]
}
```

Neste momento não precisamos nem do CRM.

Primeiro precisamos provar:

> O Playwright consegue entrar no SEI e listar corretamente todos os processos.

---

# 8. Paginação

Esse ponto é muito importante.

Na tela atual existem, por exemplo:

```text
Processos recebidos
180 registros

Página:
1 → 50
```

Portanto não podemos ler somente a primeira tela.

O robô deverá percorrer:

```text
Página 1
↓
Página 2
↓
Página 3
↓
Página 4
```

e consolidar todos os processos.

Somente depois disso consideramos a sincronização válida.

---

# 9. Validação da coleta

Cada execução deverá gerar um relatório interno.

Exemplo:

```json
{
  "status": "SUCCESS",
  "expected": 180,
  "captured": 180,
  "duration": 8.3
}
```

Se o SEI indicar:

```text
180 registros
```

mas o Playwright encontrar apenas:

```text
150
```

a execução será marcada:

```text
INCOMPLETE
```

Nenhuma notificação de processo removido será gerada.

Isso evita falsos alertas causados por:

- erro de carregamento;
- timeout;
- mudança de HTML;
- problema na paginação;
- perda da sessão.

---

# 10. Banco de dados

## Tabela `sei_processes`

```text
id
numero
sei_url
unidade
first_seen_at
last_seen_at
in_unit
assigned_to_me
crm_status
priority
due_date
notes
created_at
updated_at
```

`numero` deverá ser UNIQUE.

Exemplo:

```text
1400.01.0048464/2026-71
```

---

# 11. Marcadores

Teremos uma tabela específica.

## `sei_markers`

```text
id
name
color
sei_identifier
created_at
```

E relacionamento:

## `sei_process_markers`

```text
process_id
marker_id
first_seen_at
last_seen_at
active
```

Dessa forma um processo poderá ter vários marcadores.

---

# 12. Eventos

Esta será uma das tabelas mais importantes.

## `sei_events`

```text
id
process_id
event_type
detected_at
sync_id
metadata
```

Possíveis eventos:

```text
ENTERED_UNIT

LEFT_UNIT

ASSIGNED_TO_ME

UNASSIGNED_FROM_ME

MARKER_ADDED

MARKER_REMOVED

FIRST_SEEN
```

Exemplo:

```text
Processo:
1400.01.0048464/2026-71

Evento:
ASSIGNED_TO_ME

Detectado:
24/08/2026 08:15
```

Isso cria uma verdadeira linha do tempo.

---

# 13. Histórico de sincronização

Tabela:

## `sei_sync_runs`

```text
id
started_at
finished_at
status
processes_expected
processes_captured
assigned_expected
assigned_captured
error_message
duration_ms
```

Assim poderemos ter uma tela administrativa:

```text
SINCRONIZAÇÕES

21:00 ✅ 180 processos
20:50 ✅ 180 processos
20:40 ✅ 179 processos
20:30 ⚠️ sessão expirada
```

---

# 14. Detectando processo novo

Exemplo.

Às 08:00:

```text
A
B
C
```

Às 08:10:

```text
A
B
C
D
```

O sistema encontra:

```text
D
```

Resultado:

```text
ENTERED_UNIT
```

Banco:

```text
process: D
first_seen_at: 08:10
```

Notificação:

```text
🔔 Novo processo na unidade

SEI:
1400.01.xxxxxxx/2026-xx
```

---

# 15. Detectando processo atribuído a mim

O Playwright acessará:

```text
Ver atribuídos a mim
```

e criará um conjunto separado.

Exemplo:

```text
UNIDADE

A
B
C
D
E
```

```text
ATRIBUÍDOS A MIM

B
D
```

Banco:

```text
B → assigned_to_me = true
D → assigned_to_me = true
```

Se na próxima consulta aparecer:

```text
B
D
E
```

criamos:

```text
E
ASSIGNED_TO_ME
```

e podemos notificar:

```text
👤 Novo processo atribuído a você

1400.01.xxxxxxx/2026-xx
```

---

# 16. Detectando marcadores

Depois implementaremos:

```text
Ver por marcadores
```

O Playwright poderá capturar:

```text
URGENTE

A
B
```

```text
MANUTENÇÃO

C
D
```

```text
AGUARDANDO

E
F
```

O CRM passa a conhecer também os marcadores existentes dentro do próprio SEI.

---

# 17. Separação entre status SEI e status CRM

Isso é importante.

O marcador do SEI continuará sendo informação do SEI.

O CRM terá seu próprio fluxo.

Exemplo:

```text
STATUS CRM

Novo
↓
Em análise
↓
Aguardando resposta
↓
Para despacho
↓
Finalizado
```

Isso permite usar um Kanban:

```text
NOVOS        EM ANÁLISE      AGUARDANDO      FINALIZADOS

SEI 001      SEI 005         SEI 003         SEI 010
SEI 002      SEI 006         SEI 004         SEI 011
```

Mover um card no Kanban inicialmente **não altera nada no SEI**.

---

# 18. Tela inicial

Dashboard:

```text
┌─────────────────────────────────────────────┐
│ CRM SEI                                     │
├──────────┬──────────┬──────────┬────────────┤
│ Unidade  │ Meus     │ Novos    │ Prazos     │
│   180    │   12     │    3     │    4       │
├──────────┴──────────┴──────────┴────────────┤

NOVOS

🔴 1400.01.xxxxx/2026
Entrou há 12 minutos

🟡 1400.01.xxxxx/2026
Entrou há 1 hora

──────────────────────────────────────────────

ATRIBUÍDOS A MIM

1400.01.xxxxx/2026
Em análise

1400.01.xxxxx/2026
Aguardando resposta
```

---

# 19. Página individual do processo

Ao selecionar um processo:

```text
SEI 1400.01.xxxxxxx/2026-xx

Status CRM
Em análise

Prioridade
Alta

Marcadores SEI
🟡 Manutenção
🔵 BEMAD

Detectado na unidade
23/08/2026 14:22

Atribuído a mim
23/08/2026 15:10

Prazo CRM
30/08/2026

Observações
...

Histórico

15:10  Atribuído a você
14:22  Processo entrou na unidade
```

E:

```text
[ ABRIR NO SEI ]
```

O botão abre o processo original.

---

# 20. Não duplicar documentos do SEI

Na primeira versão NÃO iremos copiar:

- PDFs;
- ofícios;
- despachos;
- documentos;
- anexos;
- conteúdo interno;
- assinaturas.

Guardaremos apenas metadados mínimos necessários para o CRM.

Isso deixa a aplicação:

- mais simples;
- mais segura;
- mais rápida;
- menos dependente do HTML interno dos processos.

---

# 21. Google Sheets

É perfeitamente possível usar uma Planilha Google.

Por exemplo:

```text
Playwright
     ↓
Google Sheets API
     ↓
Planilha
```

Planilha:

| Processo | Unidade | Atribuído | Marcador | Entrada |
|---|---|---|---|---|
| SEI 001 | BEMAD | Sim | Urgente | 08:10 |
| SEI 002 | BEMAD | Não | Manutenção | 08:20 |

Isso seria excelente para uma **prova de conceito de um ou dois dias**.

Porém não utilizaria Google Sheets como banco definitivo.

Quando adicionarmos:

- eventos;
- histórico;
- usuários;
- notificações;
- RLS;
- relacionamentos;
- Kanban;
- dashboards;
- filtros;
- Realtime;

o Supabase será muito mais apropriado.

### Minha escolha

```text
Supabase = banco oficial do CRM

Google Sheets = exportação opcional
```

Poderíamos inclusive criar:

```text
Exportar para Google Sheets
```

posteriormente.

---

# 22. Supabase Cron

O Supabase oferece Cron baseado em `pg_cron` e consegue executar SQL, chamar funções do banco e fazer requisições HTTP, inclusive para Edge Functions.

Podemos futuramente fazer:

```text
Supabase Cron
cada 5 minutos
       ↓
Edge Function
trigger-sei-sync
       ↓
POST
       ↓
VPS
/api/sei/sync
       ↓
Playwright
```

Exemplo conceitual:

```text
*/5 * * * *
```

Mas para o MVP eu usaria:

```text
Cron da VPS
     ↓
node sei-sync.js
```

É mais simples.

---

# 23. Edge Functions

As Edge Functions continuam muito úteis.

Elas poderão ser responsáveis por:

```text
notify-new-process

notify-assignment

create-push-notification

generate-daily-summary

export-sheet

trigger-sei-sync
```

Ou seja:

```text
Playwright = coleta

Postgres = dados

Edge Functions = regras e integração

React = interface
```

---

# 24. Realtime

Depois que o Playwright inserir:

```text
ENTERED_UNIT
```

no Supabase, o Realtime poderá atualizar imediatamente o CRM aberto.

Fluxo:

```text
Playwright
   ↓
INSERT
   ↓
Supabase
   ↓
Realtime
   ↓
CRM
```

Sem precisar atualizar a página.

---

# 25. Notificações

Quando surgir:

```text
ENTERED_UNIT
```

podemos gerar:

```text
🔔 Novo SEI recebido
```

Quando surgir:

```text
ASSIGNED_TO_ME
```

podemos gerar:

```text
👤 Processo atribuído a você
```

E posteriormente:

```text
⏰ Prazo próximo

⚠️ Processo parado há 10 dias
```

---

# 26. Regra contra falso "processo saiu"

Não devemos considerar um processo removido simplesmente porque ele não apareceu uma vez.

Exemplo:

```text
08:00 → processo existe
08:10 → não apareceu
08:20 → processo existe
```

Isso pode ter sido erro de carregamento.

Portanto o algoritmo pode exigir duas verificações consecutivas.

```text
missing_count = 1
```

não faz nada.

```text
missing_count = 2
```

então:

```text
LEFT_UNIT
```

Isso aumenta bastante a confiabilidade.

---

# 27. Segurança do Supabase

O frontend nunca receberá:

```text
SERVICE_ROLE_KEY
```

Somente:

```text
anon/publishable key
```

com RLS.

O Worker Playwright poderá utilizar uma credencial de backend separada.

Também devemos criar políticas para que cada usuário veja apenas aquilo que sua função permitir.

---

# 28. Segurança da sessão SEI

A sessão do Playwright deve ser tratada praticamente como uma senha.

O próprio Playwright alerta que arquivos de estado autenticado podem conter cookies e informações capazes de representar aquele usuário.

Portanto:

```text
NUNCA:
GitHub

NUNCA:
frontend

NUNCA:
localStorage do CRM

NUNCA:
tabela pública do Supabase
```

Ela ficará somente no servidor do Worker, com acesso restrito.

---

# 29. Monitoramento de mudança no SEI

Como estamos automatizando uma interface HTML, eventualmente o SEI pode mudar.

Precisamos detectar isso.

Exemplo:

```text
não encontrou:
Controle de Processos

não encontrou:
Ver atribuídos a mim
```

Resultado:

```text
SCRAPER_LAYOUT_ERROR
```

O sistema para aquela sincronização e alerta:

```text
⚠️ CRM SEI

A estrutura da página do SEI mudou.

Sincronização interrompida.
```

Melhor parar do que gravar dados incorretos.

---

# 30. Estrutura do projeto

```text
sei-crm/
│
├── apps/
│   └── web/
│       └── React
│
├── worker/
│   ├── src/
│   │   ├── browser/
│   │   │   ├── login.ts
│   │   │   ├── control-processes.ts
│   │   │   ├── assignments.ts
│   │   │   └── markers.ts
│   │   │
│   │   ├── sync/
│   │   │   ├── processes.ts
│   │   │   ├── compare.ts
│   │   │   └── events.ts
│   │   │
│   │   └── index.ts
│   │
│   └── playwright/
│       └── .auth/
│
├── supabase/
│   ├── migrations/
│   └── functions/
│
└── README.md
```

---

# 31. Fases de implementação

## Fase 1 — Playwright local

Objetivo:

```text
Login
↓
Controle de Processos
↓
listar números
```

Sem banco.

Critério de sucesso:

```text
SEI mostra: 180
Playwright captura: 180
```

---

## Fase 2 — Supabase

Criar:

```text
sei_processes
sei_sync_runs
```

O Playwright passa a fazer UPSERT dos processos.

---

## Fase 3 — Detecção de eventos

Criar:

```text
sei_events
```

Detectar:

```text
FIRST_SEEN
ENTERED_UNIT
LEFT_UNIT
```

---

## Fase 4 — Atribuições

Automatizar:

```text
Ver atribuídos a mim
```

Detectar:

```text
ASSIGNED_TO_ME
UNASSIGNED_FROM_ME
```

---

## Fase 5 — Marcadores

Automatizar:

```text
Ver por marcadores
```

Criar relacionamento entre processos e marcadores.

---

## Fase 6 — CRM

Criar React/PWA:

```text
Dashboard
Processos
Meus processos
Novos
Marcadores
Kanban
Prazos
Histórico
```

---

## Fase 7 — Notificações

Adicionar:

```text
Novo processo

Atribuído a mim

Prazo próximo

Processo sem movimentação
```

---

## Fase 8 — Produção

Mover Worker para VPS.

Instalar:

```text
Node.js
Playwright
Chromium
```

Executar com:

```text
systemd
```

ou:

```text
PM2
```

Adicionar Cron.

---

# 32. Critérios para considerar o MVP pronto

O MVP estará pronto quando conseguir:

- autenticar no SEI;
- reutilizar sessão autenticada;
- acessar Controle de Processos;
- percorrer todas as páginas;
- capturar todos os processos recebidos;
- identificar processos atribuídos ao usuário;
- identificar marcadores selecionados;
- gravar dados no Supabase;
- detectar processo novo;
- detectar nova atribuição;
- criar histórico;
- atualizar o dashboard;
- gerar uma notificação;
- abrir o processo original no SEI;
- falhar com segurança caso a sessão expire;
- não realizar nenhuma alteração no SEI.

---

# 33. Arquitetura final recomendada

```text
┌─────────────────┐
│     SEI!MG      │
└────────┬────────┘
         │
         │ somente leitura
         ▼
┌─────────────────┐
│   Playwright    │
│    Chromium     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Node Worker VPS │
│ sync 5-10 min   │
└────────┬────────┘
         │
         ▼
┌───────────────────────────────────────┐
│               Supabase                │
│                                       │
│ PostgreSQL │ Auth │ RLS │ Realtime    │
│ Cron       │ Edge Functions           │
└───────────────┬───────────────────────┘
                │
                ▼
       ┌─────────────────┐
       │     CRM PWA     │
       │ React           │
       └─────────────────┘
```

# Decisão técnica

Para este projeto:

**Playwright + Worker Node.js em VPS** para conversar com o SEI.

**Supabase PostgreSQL** como banco do CRM.

**Supabase Realtime** para atualizar a aplicação.

**Supabase Edge Functions** para notificações, integrações e regras server-side.

**Supabase Cron ou Cron da VPS** para agendamento.

**Google Sheets** apenas como exportação ou prova de conceito.

Essa arquitetura mantém o SEI como sistema oficial e transforma o CRM em uma camada de acompanhamento, priorização e gestão do trabalho, sem inicialmente escrever ou alterar nenhum dado dentro do SEI.
