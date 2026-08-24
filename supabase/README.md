# Supabase do CRM-SEI

Esta pasta contém o backend PostgreSQL do MVP. O cliente usa somente a chave
pública (`anon`) com uma sessão do Supabase Auth; a `service_role` não pertence
ao frontend nem ao agente local.

## Aplicar e validar localmente

Com Docker/Podman compatível e a Supabase CLI:

```bash
supabase start
supabase db reset
supabase test db
supabase db lint --local --level warning
```

Depois de mudar o schema, os tipos podem ser regenerados com:

```bash
supabase gen types typescript --local > supabase/types/database.types.ts
```

## Ingestão do agente

O agente autenticado chama apenas:

```ts
await supabase.rpc('aplicar_retrato_sincronizacao', { p_retrato: retrato });
```

Exemplo mínimo de retrato completo:

```json
{
  "instalacao_id": "51000000-0000-4000-8000-000000000001",
  "token_instalacao": "token-base64url-recebido-no-provisionamento",
  "execucao_cliente_id": "a0000000-0000-4000-8000-000000000001",
  "unidade": "5ª Cia BM",
  "iniciada_em": "2026-08-24T11:30:00-03:00",
  "finalizada_em": "2026-08-24T11:30:08-03:00",
  "status": "SUCESSO",
  "completa": true,
  "esperado": 2,
  "capturado": 2,
  "atribuicoes_completas": false,
  "marcadores_completos": false,
  "processos": [
    { "numero": "1400.01.000001/2026-01" },
    { "numero": "1400.01.000002/2026-02" }
  ]
}
```

`instalacao_id` e `token_instalacao` são obrigatórios em **todo** envio,
inclusive `INCOMPLETA`, `SESSAO_EXPIRADA`, `ERRO_LAYOUT_COLETOR` e `ERRO`. O token
deve ter de 32 a 512 caracteres; o provisionamento atual gera 32 bytes aleatórios
como base64url sem padding (43 caracteres). O banco armazena somente SHA-256 e
compara o token depois de validar que a instalação pertence ao usuário autenticado
e continua ativa.

O provisionamento é uma ação administrativa feita apenas por um backend confiável:

```sql
select public.provisionar_instalacao_agente(
  'uuid-do-usuario',
  'Notebook institucional',
  'https://sei.exemplo.gov.br'
);
```

A resposta contém `instalacao_id` e `token_instalacao`; o token puro aparece
uma única vez e deve ser guardado no armazenamento secreto do agente. Para girar
o segredo, provisione outra instalação (ou outro nome), atualize o agente e só
então desative a antiga com `definir_instalacao_agente_ativa`. Essas RPCs não têm
`EXECUTE` para `authenticated`; sua invocação exige `service_role`/Postgres e essa
chave nunca deve ser enviada ao agente ou navegador.

Cada instalação fica vinculada a uma origem SEI HTTPS sem caminho, consulta ou
credenciais. Qualquer `url_sei` enviada deve ter exatamente essa origem; HTTP,
credenciais embutidas e hosts diferentes são rejeitados. Uma nova sincronização
é aceita a cada 30 segundos por instalação/usuário. Uma nova tentativa com o mesmo
`execucao_cliente_id` e instalação ignora esse intervalo para preservar idempotência.
O wrapper também limita cada retrato a 8 MiB, 5.000 processos e 20.000
marcadores no total (mantendo o limite de 1.000 marcadores por processo da RPC
interna).

`execucao_cliente_id` é uma chave UUID idempotente. Repetir exatamente o mesmo
retrato devolve o resultado anterior; reutilizar a chave com outro conteúdo é
rejeitado. O primeiro retrato completo de cada usuário/unidade cria uma linha de base
sem eventos. Ausências só são avaliadas em retratos completos e `SAIU_DA_UNIDADE` só
é confirmado na segunda ausência completa consecutiva.

Falhas (`SESSAO_EXPIRADA`, `ERRO_LAYOUT_COLETOR` ou `ERRO`) podem enviar
`esperado: null`, `capturado: 0` e `processos: []`. Uma coleta `INCOMPLETA` deve
informar as contagens, mas pode omitir os metadados parciais de `processos` e
nunca incrementa ausências. Um retrato completo sempre envia todos os processos
capturados.

## Escritas do CRM

As tabelas coletadas não concedem `INSERT`, `UPDATE` ou `DELETE` direto ao papel
`authenticated`. O frontend altera somente os campos próprios do CRM pela RPC
`atualizar_processo_crm`. Parâmetros omitidos preservam o valor atual; use
`p_limpar_data_prazo` ou `p_limpar_observacoes` para limpar explicitamente esses campos.

RLS filtra todas as tabelas expostas por `auth.uid()`. `estado_sincronizacao_sei` permanece
interna, sem política de leitura pela API. Processos, eventos, marcadores e
execuções de sincronização estão na publicação `supabase_realtime`.

## Notificações

Preferências são lidas por `obter_preferencias_notificacao()` e atualizadas em uma
única chamada autenticada:

```ts
await supabase.rpc('atualizar_preferencias_notificacao', {
  p_nivel_conteudo: 'AVISO', // AVISO | NUMERO | ASSUNTO
  p_novo_processo: true,
  p_atribuicao: true,
  p_prazo_proximo: true,
  p_falha_sincronizacao: true,
});
```

`AVISO` não grava número nem assunto no conteúdo, `NUMERO` inclui somente o
número e `ASSUNTO` inclui número e assunto quando disponível. Eventos de entrada
e atribuição, além de sincronizações incompletas ou com falha, criam itens em
`fila_notificacoes` na mesma transação da sincronização. A chave `chave_deduplicacao`
impede duplicação em novas tentativas idempotentes. Ao reduzir o nível de conteúdo, itens
ainda pendentes também são sanitizados; ao desativar um tipo, seus itens não
processados são cancelados pela remoção da fila.

Um Supabase Cron diário pode gerar lembretes de prazo de forma idempotente:

```sql
select private.enfileirar_notificacoes_prazo(current_date, 7);
```

A função é privada e aceita janela máxima de 30 dias. O papel `service_role`
recebe somente `SELECT`/`UPDATE` na fila e execução dessa função; clientes não
recebem acesso ao schema `private`. Qualquer consumidor deve reler o item antes
do envio e confirmar que ele ainda existe e não está `ENVIADA`, pois mudanças de
preferência sanitizam ou removem inclusive itens anteriormente em processamento.

Clientes autenticados podem ler apenas as próprias preferências e a própria
fila. Eles não possuem escrita direta nessas tabelas. O processamento da fila
deve ocorrer em backend confiável; uma chave `service_role` nunca deve ser
incluída no agente, PWA ou qualquer bundle enviado ao navegador.

## Retenção operacional

Uma rotina privada `SECURITY DEFINER` remove dados operacionais antigos. Os
valores padrão são 90 dias para execuções de sincronização, 30 dias para fila `ENVIADA` e 90 dias
para fila `FALHOU`. Uma execução de sincronização não é apagada enquanto ainda existir
qualquer item de fila relacionado, evitando cascata sobre trabalho vigente.
Agende em Supabase Cron/backend confiável:

```sql
select private.expurgar_dados_operacionais(
  now(),
  interval '90 days',
  interval '30 days',
  interval '90 days'
);
```

Somente Postgres/`service_role` possui acesso à rotina privada. Na fila, a
`service_role` recebe exclusivamente `SELECT` e `UPDATE`; inserções são feitas
pelas funções transacionais e nenhuma permissão de `INSERT`/`DELETE` é necessária.
