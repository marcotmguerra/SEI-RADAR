# Plano de Desenvolvimento — CRM SEI

## 1. Objetivo

Criar uma aplicação em **React/PWA + Supabase** que funcione como uma camada de gestão sobre o SEI!MG, sem substituir o SEI e sem realizar alterações automáticas no sistema na primeira versão.

O CRM deverá acompanhar:

- processos presentes na unidade;
- processos atribuídos ao usuário;
- processos em marcadores selecionados;
- entrada de novos processos;
- novas atribuições ao usuário;
- saída de processos da unidade;
- alterações de marcadores;
- prazos, prioridade, observações e status internos do CRM.

A integração com o SEI será feita por **Playwright executado localmente no computador do usuário**, sem VPS.

---

## 2. Decisão de arquitetura

Não será utilizada VPS na arquitetura inicial.

O sistema será dividido em duas partes:

1. **CRM Web/PWA** — React + Supabase.
2. **Agente CRM-SEI local** — Node.js + Playwright + Chromium.

```text
Computador do usuário — Windows ou Linux
│
├── Agente CRM-SEI
│   ├── Node.js
│   ├── Playwright
│   ├── Chromium
│   ├── sessão SEI local
│   ├── configuração de proxy
│   └── agendador local
│         │
│         ▼
│       SEI!MG
│         │
│         ▼
└────── Supabase API
          │
          ├── PostgreSQL
          ├── Auth + RLS
          ├── Realtime
          ├── Edge Functions
          └── notificações
                │
                ▼
             CRM React/PWA
```

### Princípio principal

A sessão do SEI e eventuais credenciais de proxy ficam **somente no computador do usuário**.

O Supabase recebe apenas os metadados necessários ao CRM.

---

## 3. Agente CRM-SEI local

O agente será um pequeno aplicativo/serviço instalado no computador utilizado pelo usuário.

Responsabilidades:

- abrir o Chromium controlado pelo Playwright;
- reutilizar a sessão autenticada do SEI;
- acessar a tela de Controle de Processos;
- ler processos da unidade;
- consultar “Ver atribuídos a mim”;
- consultar marcadores configurados;
- identificar mudanças;
- acessar somente processos novos quando for necessário coletar assunto ou outros metadados;
- enviar resultados ao Supabase;
- registrar erros de sincronização;
- encerrar o navegador ao finalizar a rotina.

O usuário **não precisa deixar uma aba do navegador aberta**.

```text
PC ligado
   ↓
Agente inicia automaticamente
   ↓
Playwright abre Chromium headless
   ↓
consulta SEI
   ↓
sincroniza Supabase
   ↓
fecha Chromium
```

Se o computador estiver desligado, o monitoramento fica pausado e retorna quando o computador for ligado novamente.

---

## 4. Compatibilidade com Windows e Linux

O agente deverá funcionar nos dois sistemas operacionais.

### Windows

Opções para inicialização automática:

- Agendador de Tarefas do Windows;
- serviço do Windows, se necessário posteriormente.

### Linux

Opções para inicialização automática:

- `systemd` do usuário;
- `systemd` do sistema;
- serviço equivalente da distribuição.

O código do agente deverá evitar caminhos e comandos específicos de um único sistema operacional.

---

## 5. Proxy da rede do CBMMG

O suporte ao proxy é um requisito do projeto desde a primeira prova de conceito.

O Playwright suporta proxy HTTP(S) e SOCKS, com possibilidade de usuário, senha e lista de endereços que devem ignorar o proxy.

Exemplo conceitual:

```js
const browser = await chromium.launch({
  headless: true,
  proxy: {
    server: process.env.PROXY_SERVER,
    username: process.env.PROXY_USERNAME,
    password: process.env.PROXY_PASSWORD
  }
});
```

As credenciais de proxy, quando necessárias, nunca deverão ser colocadas no código-fonte ou no GitHub.

Configuração sugerida:

```text
PROXY_ENABLED=true
PROXY_SERVER=http://proxy.exemplo:8080
PROXY_USERNAME=
PROXY_PASSWORD=
PROXY_BYPASS=localhost,127.0.0.1
```

Também deverá ser testado o cenário em que o sistema operacional já possui o proxy configurado.

### Primeiro teste dentro da rede do CBMMG

Validar:

- se o Chromium do Playwright acessa o SEI;
- se o agente acessa o Supabase;
- se o proxy exige autenticação;
- se existe proxy automático/PAC;
- se existe certificado raiz institucional;
- se o Chromium do Playwright consegue ser instalado/atualizado nessa rede.

Se houver inspeção HTTPS com certificado institucional, deverá ser utilizada a autoridade certificadora correta do ambiente. Não devemos desabilitar validações TLS apenas para contornar o proxy.

---

## 6. Instalação do Playwright

### Windows

```bash
npm install
npx playwright install chromium
```

### Linux

```bash
npm install
npx playwright install --with-deps chromium
```

Quando a instalação estiver atrás de proxy, o ambiente poderá precisar de `HTTPS_PROXY`.

Exemplo Linux:

```bash
HTTPS_PROXY=http://proxy.exemplo:8080 npx playwright install chromium
```

Exemplo PowerShell:

```powershell
$Env:HTTPS_PROXY="http://proxy.exemplo:8080"
npx playwright install chromium
```

---

## 7. Autenticação no SEI

A primeira versão utilizará **login manual**.

```text
Agente
  ↓
abre navegador visível
  ↓
usuário autentica no SEI
  ↓
sessão autenticada
  ↓
salva storageState local
```

O Playwright poderá reutilizar cookies e dados de sessão por meio de `storageState`.

Exemplo de arquivo:

```text
agent/playwright/.auth/sei.json
```

Esse arquivo é sensível e deverá ficar somente no computador do usuário.

Adicionar ao `.gitignore`:

```gitignore
agent/playwright/.auth/
.env
*.local.json
```

---

## 8. Expiração da sessão

Se a sessão expirar, o agente deverá detectar que o SEI retornou para a tela de login.

Status:

```text
AUTH_EXPIRED
```

O CRM poderá exibir:

```text
⚠️ Sessão do SEI expirada.
Abra o agente e autentique novamente.
```

O sistema não tentará contornar MFA, CAPTCHA ou outros mecanismos de segurança.

---

## 9. Frequência de sincronização

Começar com:

```text
10 minutos
```

Depois de validar estabilidade:

```text
5 minutos
```

A rotina será controlada pelo próprio agente local.

```text
Agente CRM-SEI
     ↓
executa sincronização
     ↓
espera 5 ou 10 min
     ↓
executa novamente
```

Pode haver configuração de horário de funcionamento, por exemplo:

```text
06:00 às 22:00
segunda a sexta
```

---

## 10. Primeira prova de conceito

Antes de construir o CRM completo, provar que o Playwright consegue ler corretamente a tela do SEI.

Objetivo inicial:

```text
Login manual
↓
Controle de Processos
↓
ler todos os números dos processos
↓
exibir resultado no terminal
```

Critério de sucesso:

```text
SEI informa: 180 registros
Playwright captura: 180 registros
```

Sem Supabase e sem notificações nesta fase.

---

## 11. Paginação

O agente deverá percorrer todas as páginas da lista.

```text
Página 1
↓
Página 2
↓
Página 3
↓
Página 4
```

A sincronização só será considerada válida se a quantidade coletada for compatível com a quantidade apresentada pelo SEI.

---

## 12. Validação da coleta

Cada execução deverá registrar um resultado.

```json
{
  "status": "SUCCESS",
  "expected": 180,
  "captured": 180,
  "duration": 8.3
}
```

Se o SEI informar 180 registros e apenas 150 forem coletados:

```text
INCOMPLETE
```

Nesse caso, nenhuma conclusão sobre processos removidos deverá ser feita.

---

## 13. Estratégia de coleta leve

Não abrir todos os processos a cada sincronização.

Fluxo:

```text
lista anterior: 180
↓
lista atual: 181
↓
identifica somente o novo processo
↓
abre esse processo
↓
coleta assunto/metadados necessários
↓
grava no Supabase
```

Isso reduz carga, tempo de execução e dependência da interface do SEI.

---

## 14. Dados que serão armazenados

Na primeira versão, não copiar documentos, PDFs ou anexos.

Guardar apenas metadados necessários ao CRM.

Tabela `sei_processes`:

```text
id
user_id
numero
assunto
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

O número do processo deverá possuir restrição de unicidade adequada ao contexto do usuário/unidade.

---

## 15. Marcadores

Tabela `sei_markers`:

```text
id
name
color
sei_identifier
created_at
```

Relacionamento `sei_process_markers`:

```text
process_id
marker_id
first_seen_at
last_seen_at
active
```

---

## 16. Eventos

Tabela `sei_events`:

```text
id
process_id
event_type
detected_at
sync_id
metadata
```

Eventos previstos:

```text
FIRST_SEEN
ENTERED_UNIT
LEFT_UNIT
ASSIGNED_TO_ME
UNASSIGNED_FROM_ME
MARKER_ADDED
MARKER_REMOVED
```

---

## 17. Histórico de sincronização

Tabela `sei_sync_runs`:

```text
id
user_id
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

Exemplo no CRM:

```text
08:30 ✅ 180 processos
08:20 ✅ 180 processos
08:10 ⚠️ coleta incompleta
08:00 ⚠️ sessão expirada
```

---

## 18. Detectando novos processos

Exemplo:

```text
08:00 → A B C
08:10 → A B C D
```

Evento:

```text
D → ENTERED_UNIT
```

Depois o agente pode abrir apenas `D`, coletar o assunto e gerar a notificação.

```text
🔔 Novo processo na unidade
Manutenção de viatura
SEI 1400.01.xxxxxxx/2026-xx
```

A exibição de assunto na notificação deverá ser configurável por questões de privacidade.

---

## 19. Detectando processos atribuídos ao usuário

O Playwright acessará:

```text
Ver atribuídos a mim
```

Exemplo:

```text
antes: B D
agora: B D E
```

Evento:

```text
E → ASSIGNED_TO_ME
```

Notificação:

```text
👤 Novo processo atribuído a você
```

---

## 20. Status do CRM separado do SEI

O CRM terá seu próprio fluxo de trabalho.

```text
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

Mover um card no Kanban **não deverá alterar o SEI** na primeira versão.

---

## 21. React/PWA

Telas previstas:

- Login;
- Dashboard;
- Processos da unidade;
- Atribuídos a mim;
- Novos;
- Marcadores;
- Kanban;
- Prazos;
- Histórico;
- Status das sincronizações;
- Configurações de notificações;
- Configurações do agente.

---

## 22. Supabase

O Supabase será o backend principal do CRM.

Utilizar:

- PostgreSQL;
- Auth;
- RLS;
- Realtime;
- Edge Functions;
- Cron apenas para rotinas que não precisem acessar o SEI.

O Supabase Cron poderá cuidar de:

- lembretes de prazo;
- resumo diário;
- limpeza de registros antigos;
- processamento de notificações;
- rotinas baseadas em dados já existentes no banco.

A sincronização do SEI continuará sendo responsabilidade do agente local.

---

## 23. Realtime

Fluxo:

```text
Agente local
   ↓
Supabase INSERT/UPDATE
   ↓
Realtime
   ↓
CRM React aberto atualiza automaticamente
```

---

## 24. Notificações

Eventos possíveis:

```text
🔔 Novo processo na unidade
👤 Processo atribuído a você
⏰ Prazo próximo
⚠️ Processo parado há muitos dias
⚠️ Sessão SEI expirada
⚠️ Agente sem sincronizar
```

Preferências do usuário:

```text
Conteúdo da notificação
○ apenas aviso
○ número do SEI
○ número + assunto
```

---

## 25. Regra contra falsos eventos de saída

Um processo não será marcado como removido após uma única ausência.

```text
1ª ausência → missing_count = 1
2ª ausência consecutiva → confirmar LEFT_UNIT
```

Se uma sincronização estiver incompleta, ela não contará para essa regra.

---

## 26. Segurança

### No frontend

Nunca utilizar `SERVICE_ROLE_KEY`.

Usar chave pública adequada + RLS.

### No agente

Nunca versionar:

- sessão do SEI;
- credenciais do proxy;
- chaves privadas;
- tokens de backend.

### No Supabase

Aplicar RLS para que cada usuário veja somente os dados autorizados.

### Dados do SEI

Na primeira versão, armazenar somente metadados necessários ao CRM.

Não copiar automaticamente:

- PDFs;
- ofícios;
- despachos;
- anexos;
- conteúdo integral de documentos;
- assinaturas.

---

## 27. Detecção de mudança de layout

Se o agente não encontrar elementos essenciais, deverá interromper a sincronização.

Exemplo:

```text
SCRAPER_LAYOUT_ERROR
```

Não gravar dados parciais como se fossem válidos.

O CRM deverá exibir:

```text
⚠️ A estrutura da página do SEI mudou.
Sincronização interrompida.
```

---

## 28. Estrutura sugerida do repositório

```text
crm-sei/
│
├── apps/
│   └── web/
│       └── React/PWA
│
├── agent/
│   ├── src/
│   │   ├── browser/
│   │   │   ├── login.ts
│   │   │   ├── control-processes.ts
│   │   │   ├── assignments.ts
│   │   │   └── markers.ts
│   │   ├── sync/
│   │   │   ├── processes.ts
│   │   │   ├── compare.ts
│   │   │   └── events.ts
│   │   ├── platform/
│   │   │   ├── windows.ts
│   │   │   └── linux.ts
│   │   └── config/
│   │       └── proxy.ts
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

## 29. Fases de implementação

### Fase 1 — Playwright local

- instalar Playwright;
- testar dentro e fora da rede do CBMMG;
- validar proxy;
- login manual;
- acessar Controle de Processos;
- listar todos os números;
- validar paginação.

**Critério:** quantidade capturada = quantidade mostrada pelo SEI.

### Fase 2 — Supabase

Criar:

```text
sei_processes
sei_sync_runs
```

Fazer UPSERT dos processos coletados.

### Fase 3 — Eventos

Criar `sei_events` e detectar:

```text
FIRST_SEEN
ENTERED_UNIT
LEFT_UNIT
```

### Fase 4 — Atribuições

Automatizar “Ver atribuídos a mim” e detectar:

```text
ASSIGNED_TO_ME
UNASSIGNED_FROM_ME
```

### Fase 5 — Assunto e metadados

Abrir somente processos novos/alterados e coletar os campos necessários.

### Fase 6 — Marcadores

Automatizar leitura dos marcadores selecionados.

### Fase 7 — CRM React/PWA

Criar dashboard, lista, filtros, Kanban, prazos e histórico.

### Fase 8 — Notificações

Implementar novos processos, atribuições, prazo e falha de sincronização.

### Fase 9 — Empacotamento Windows/Linux

Preparar instalação simples do agente e inicialização automática nos dois sistemas.

---

## 30. Critérios do MVP

O MVP estará pronto quando conseguir:

- funcionar em Windows e Linux;
- funcionar na rede do CBMMG com a configuração de proxy necessária;
- autenticar manualmente no SEI;
- reutilizar a sessão local;
- acessar Controle de Processos;
- percorrer todas as páginas;
- capturar todos os processos;
- identificar atribuídos ao usuário;
- gravar no Supabase;
- detectar processo novo;
- coletar assunto do processo novo quando disponível;
- detectar nova atribuição;
- gerar histórico;
- atualizar o React via Realtime;
- gerar notificação;
- abrir o processo original no SEI;
- detectar sessão expirada;
- detectar erro de layout;
- nunca alterar automaticamente o SEI.

---

## 31. Arquitetura final do MVP

```text
┌─────────────────────────────────┐
│ PC DO USUÁRIO                   │
│ Windows ou Linux                │
│                                 │
│ Agente Node.js                  │
│      ↓                          │
│ Playwright + Chromium           │
│      ↓                          │
│ SEI!MG                          │
│                                 │
│ sessão + proxy ficam locais     │
└──────────────┬──────────────────┘
               │ metadados
               ▼
┌───────────────────────────────────────┐
│               Supabase                │
│                                       │
│ PostgreSQL │ Auth │ RLS │ Realtime    │
│ Edge Functions │ notificações         │
└───────────────┬───────────────────────┘
                │
                ▼
       ┌─────────────────┐
       │   CRM React/PWA │
       └─────────────────┘
```

## Decisão técnica

Para o MVP:

- **React/PWA** para interface;
- **Supabase** para banco, autenticação, RLS, Realtime e funções server-side;
- **Node.js + Playwright local** como conector com o SEI;
- **Chromium headless** para automação sem aba aberta;
- **Agendador local** para sincronização periódica;
- **Windows + Linux** como plataformas suportadas;
- **proxy institucional** tratado como requisito de implantação;
- **sem VPS**;
- **Google Sheets apenas como exportação opcional**, não como banco principal.

O SEI continuará sendo o sistema oficial. O CRM será uma camada de organização, acompanhamento e notificações, inicialmente somente leitura.