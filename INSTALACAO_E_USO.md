# Instalação e uso do CRM SEI

Este guia prepara a aplicação web, o Supabase e o agente local. Os exemplos usam Linux/macOS; os comandos do npm são iguais no Windows, salvo quando indicado.

## 1. Requisitos

- Node.js 22 ou posterior;
- npm 10 ou posterior;
- Git;
- uma conta/projeto Supabase;
- Supabase CLI e Docker/Podman, caso o banco seja executado localmente;
- acesso de leitura ao SEI pelo computador que executará o agente.

Confirme as versões:

```bash
node --version
npm --version
supabase --version
```

## 2. Instalar as dependências

Na raiz do repositório:

```bash
npm install
npx playwright install chromium
```

Para abrir somente a interface com dados de demonstração:

```bash
npm run dev
```

Acesse `http://localhost:5173`. Nenhuma configuração do Supabase é necessária nesse modo.

## 3. Preparar o Supabase

### Opção A — ambiente local

Com o serviço de contêineres em execução:

```bash
supabase start
supabase db reset
supabase test db
supabase db lint --local --level warning
```

O `db reset` recria o banco e aplica, em ordem, todas as migrations de `supabase/migrations/`.

### Opção B — projeto remoto

Vincule o repositório e publique banco e configuração:

```bash
supabase login
supabase link --project-ref REFERENCIA_DO_PROJETO
supabase db push
supabase config push
```

O `supabase config push` é necessário porque `db push` não publica `supabase/config.toml`. No painel do Supabase, confirme que o cadastro público está desativado e que a confirmação de e-mail está habilitada.

### Criar o usuário

No painel do Supabase, abra Authentication → Users e crie o usuário que acessará o CRM. O mesmo e-mail e senha serão usados na PWA e no agente. Não use a senha do SEI.

### Provisionar uma instalação do agente

No SQL Editor, execute com privilégios administrativos:

```sql
select public.provisionar_instalacao_agente(
  'UUID_DO_USUARIO_AUTH',
  'Notebook institucional',
  'https://sei.exemplo.gov.br'
);
```

Guarde imediatamente os campos `instalacao_id` e `token_instalacao`. O token puro só aparece nessa resposta; o banco armazena apenas seu hash. A origem precisa ser HTTPS e não pode conter caminho, consulta ou credenciais.

Nunca coloque uma chave `service_role`, `sb_secret` ou equivalente na PWA, no agente ou em um arquivo `.env` do usuário.

## 4. Configurar a aplicação web

Copie o modelo:

```bash
cp apps/web/.env.example apps/web/.env.local
```

Preencha:

```dotenv
VITE_URL_SUPABASE=https://seu-projeto.supabase.co
VITE_CHAVE_PUBLICA_SUPABASE=sb_publishable_substitua
VITE_ORIGEM_SEI_PERMITIDA=https://sei.exemplo.gov.br
```

Use apenas a chave pública `anon`/`publishable`. `VITE_ORIGEM_SEI_PERMITIDA` bloqueia links de processo que apontem para outra origem.

Inicie a PWA:

```bash
npm run dev
```

Entre com o usuário criado no Supabase Auth.

## 5. Configurar o agente

Copie o modelo:

```bash
cp agent/.env.example agent/.env
```

Configuração mínima:

```dotenv
URL_BASE_SEI=https://sei.exemplo.gov.br
URL_CONTROLE_SEI=https://sei.exemplo.gov.br/controlador.php?acao=procedimento_controlar
UNIDADE_SEI=UNIDADE_EXEMPLO
CAMINHO_ESTADO_SESSAO_SEI=playwright/.auth/sei.json

URL_SUPABASE=https://seu-projeto.supabase.co
CHAVE_PUBLICA_SUPABASE=sb_publishable_substitua
EMAIL_USUARIO_SUPABASE=usuario@example.gov.br
SENHA_USUARIO_SUPABASE=senha-do-crm
ID_INSTALACAO_AGENTE_SUPABASE=uuid-retornado-no-provisionamento
TOKEN_INSTALACAO_AGENTE_SUPABASE=token-retornado-no-provisionamento

AGENTE_SEM_INTERFACE=true
INTERVALO_SINCRONIZACAO_MINUTOS=10
MAXIMO_PAGINAS_SEI=1000
PROXY_ATIVADO=false
```

As variáveis opcionais `URL_ATRIBUIDOS_SEI` e `URLS_MARCADORES_SEI_JSON` habilitam a coleta de atribuições e marcadores. Todas as URLs de coleta precisam usar a mesma origem, caminho e ação da tela de Controle de Processos.

Exemplo de marcadores:

```dotenv
URLS_MARCADORES_SEI_JSON={"Urgente":"https://sei.exemplo.gov.br/controlador.php?acao=procedimento_controlar&marcador=urgente"}
```

### Proteger o arquivo de configuração

No Linux/macOS:

```bash
chmod 600 agent/.env
```

O agente recusa um `.env` legível por grupo ou por outros usuários. No Windows, restrinja a ACL do arquivo ao usuário que executará a tarefa.

## 6. Fazer o primeiro login no SEI

Execute:

```bash
npm run login --workspace @crm-sei/agent
```

O Chromium será aberto. Faça o login e conclua MFA/CAPTCHA manualmente. Quando a tela de Controle de Processos for alcançada, a sessão será salva no caminho definido por `CAMINHO_ESTADO_SESSAO_SEI`.

A senha do SEI não é lida nem enviada ao Supabase.

## 7. Sincronizar e usar

Teste uma coleta única:

```bash
npm run sync --workspace @crm-sei/agent
```

Um resultado `SUCESSO` informa as quantidades capturada e esperada. Depois, atualize a PWA e confirme os processos, atribuídos, marcadores e o histórico.

Para manter o agente em execução:

```bash
npm run dev:agent
```

O intervalo é definido por `INTERVALO_SINCRONIZACAO_MINUTOS`. O agendador evita execuções sobrepostas.

Na PWA, os campos status, prioridade, prazo e observações pertencem apenas ao CRM. Alterá-los não envia nenhuma escrita ao SEI.

## 8. Iniciar automaticamente

### Linux com systemd do usuário

Copie `agent/platform/linux/crm-sei-agent.service` para `~/.config/systemd/user/`, ajuste `WorkingDirectory`, `EnvironmentFile` e `ExecStart` para o local real do clone e execute:

```bash
systemctl --user daemon-reload
systemctl --user enable --now crm-sei-agent
systemctl --user status crm-sei-agent
```

### Windows

Abra o PowerShell no repositório e execute:

```powershell
.\agent\platform\windows\register-task.ps1 -CaminhoRepositorio "C:\caminho\crm-sei"
```

A tarefa é registrada para o usuário atual.

## 9. Proxy e certificado institucional

Exemplo:

```dotenv
PROXY_ATIVADO=true
SERVIDOR_PROXY=https://proxy.exemplo:8443
USUARIO_PROXY=usuario
SENHA_PROXY=senha-local
IGNORAR_PROXY=localhost,127.0.0.1
PERMITIR_AUTENTICACAO_PROXY_INSEGURA=false
```

Se houver inspeção HTTPS, instale a autoridade certificadora institucional correta no sistema operacional. O agente não desabilita a validação TLS. Um proxy remoto HTTP/SOCKS com credenciais exige `PERMITIR_AUTENTICACAO_PROXY_INSEGURA=true`; prefira TLS ou autenticação integrada.

## 10. Validar a instalação

Execute a verificação automatizada:

```bash
npm run verify
npm run test:e2e
npm audit
```

Antes do uso operacional, também:

1. compare a quantidade do SEI com a quantidade capturada em pelo menos três coletas paginadas;
2. valide a lista de atribuídos e cada marcador configurado;
3. confirme que uma sessão expirada aparece como `SESSAO_EXPIRADA`;
4. confirme que uma coleta `INCOMPLETA` não produz saídas da unidade;
5. teste a reinicialização do agente e o agendamento do sistema operacional.

## 11. Solução de problemas

- **“arquivo .env contém segredos locais”**: execute `chmod 600 agent/.env` ou corrija a ACL no Windows.
- **“sessão expirada”**: repita o comando de login manual.
- **“layout do SEI alterado”**: homologue e atualize os seletores com HTML anonimizado da instalação real.
- **“credenciais da instalação inválidas”**: confira o UUID, o token e o usuário autenticado; provisione uma nova instalação se o token foi perdido.
- **“origem não autorizada”**: iguale `URL_BASE_SEI`, `VITE_ORIGEM_SEI_PERMITIDA` e a origem usada no provisionamento.
- **falha de TLS/proxy**: instale a CA institucional e revise as variáveis de proxy; não desative a validação de certificado.
- **PWA em modo demonstração**: confira `apps/web/.env.local` e reinicie o Vite.
- **testes SQL não iniciam**: confirme que Docker/Podman está ativo antes de `supabase start`.

Para detalhes do contrato de sincronização e das políticas de acesso, consulte [supabase/README.md](supabase/README.md).
