begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(35);

insert into auth.users (
  id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_usuario_meta_data,
  aud,
  role
) values
  (
    '30000000-0000-4000-8000-000000000003',
    'notifications-1@example.invalid',
    extensions.crypt('not-a-real-password', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    'authenticated',
    'authenticated'
  ),
  (
    '40000000-0000-4000-8000-000000000004',
    'notifications-2@example.invalid',
    extensions.crypt('not-a-real-password', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    'authenticated',
    'authenticated'
  );

insert into public.instalacoes_agente (
  id, usuario_id, nome, hash_token, origem_sei_permitida
) values (
  '33000000-0000-4000-8000-000000000033',
  '30000000-0000-4000-8000-000000000003',
  'Instalacao do teste de notificacoes',
  encode(
    extensions.digest(
      convert_to('notification-test-token-0000000000000000001', 'UTF8'),
      'sha256'
    ),
    'hex'
  ),
  'https://sei.example.invalid'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '30000000-0000-4000-8000-000000000003',
  true
);

select ok(
  not has_function_privilege(
    'anon',
    'public.atualizar_preferencias_notificacao(public.nivel_conteudo_notificacao,boolean,boolean,boolean,boolean)',
    'EXECUTE'
  ),
  'anon nao pode atualizar preferencias'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.obter_preferencias_notificacao()',
    'EXECUTE'
  ),
  'anon nao pode consultar preferencias'
);

select ok(
  not has_table_privilege('authenticated', 'public.fila_notificacoes', 'INSERT'),
  'authenticated nao insere diretamente na fila'
);

select ok(
  not has_table_privilege('authenticated', 'public.preferencias_notificacao', 'UPDATE'),
  'authenticated nao atualiza preferencias sem RPC'
);

select results_eq(
  $$select
      nivel_conteudo::text,
      novo_processo,
      atribuicao,
      prazo_proximo,
      falha_sincronizacao
    from public.obter_preferencias_notificacao()$$,
  $$values ('AVISO', true, true, true, true)$$,
  'preferencias seguras sao criadas com conteudo minimo'
);

select lives_ok(
  $$select public.atualizar_preferencias_notificacao(
    'ASSUNTO', true, true, false, true
  )$$,
  'usuario atualiza as proprias preferencias pela RPC'
);

select throws_ok(
  $$select public.atualizar_preferencias_notificacao(
    null, true, true, true, true
  )$$,
  '22023',
  'todas as preferencias sao obrigatorias',
  'RPC rejeita preferencia nula'
);

select results_eq(
  $$select nivel_conteudo::text, novo_processo, atribuicao, prazo_proximo, falha_sincronizacao
    from public.preferencias_notificacao$$,
  $$values ('ASSUNTO', true, true, false, true)$$,
  'RPC persiste nivel e flags'
);

select lives_ok(
  $$select public.aplicar_retrato_sincronizacao(
    '{
      "instalacao_id":"33000000-0000-4000-8000-000000000033",
      "token_instalacao":"notification-test-token-0000000000000000001",
      "execucao_cliente_id":"b0000000-0000-4000-8000-000000000001",
      "unidade":"UNIDADE NOTIFICACOES",
      "status":"SUCESSO","completa":true,"esperado":1,"capturado":1,
      "processos":[{"numero":"1400.01.000101/2026-01"}]
    }'::jsonb
  )$$,
  'linha_base de notificacoes e aplicado'
);

select is(
  (select count(*) from public.fila_notificacoes)::bigint,
  0::bigint,
  'linha_base sem eventos tambem nao cria notificacoes'
);

reset role;
update public.instalacoes_agente set ultimo_uso_em = null
where id = '33000000-0000-4000-8000-000000000033';
set local role authenticated;

select lives_ok(
  $$select public.aplicar_retrato_sincronizacao(
    '{
      "instalacao_id":"33000000-0000-4000-8000-000000000033",
      "token_instalacao":"notification-test-token-0000000000000000001",
      "execucao_cliente_id":"b0000000-0000-4000-8000-000000000002",
      "unidade":"UNIDADE NOTIFICACOES",
      "status":"SUCESSO","completa":true,"esperado":2,"capturado":2,
      "atribuicoes_completas":true,
      "processos":[
        {"numero":"1400.01.000101/2026-01","atribuido_a_mim":false},
        {"numero":"1400.01.000102/2026-02","assunto":"Assunto reservado","atribuido_a_mim":true}
      ]
    }'::jsonb
  )$$,
  'eventos criam notificacoes na mesma transacao'
);

select results_eq(
  $$select tipo_notificacao::text
    from public.fila_notificacoes
    order by tipo_notificacao::text$$,
  $$values ('ATRIBUICAO'), ('NOVO_PROCESSO')$$,
  'entrada e atribuicao geram uma notificacao cada, sem duplicar IDENTIFICADO_PRIMEIRA_VEZ'
);

select ok(
  (
    select bool_and(conteudo ? 'numero' and conteudo ? 'assunto')
    from public.fila_notificacoes
  ),
  'nivel ASSUNTO inclui numero e assunto no conteudo'
);

select lives_ok(
  $$select public.aplicar_retrato_sincronizacao(
    '{
      "instalacao_id":"33000000-0000-4000-8000-000000000033",
      "token_instalacao":"notification-test-token-0000000000000000001",
      "execucao_cliente_id":"b0000000-0000-4000-8000-000000000002",
      "unidade":"UNIDADE NOTIFICACOES",
      "status":"SUCESSO","completa":true,"esperado":2,"capturado":2,
      "atribuicoes_completas":true,
      "processos":[
        {"numero":"1400.01.000101/2026-01","atribuido_a_mim":false},
        {"numero":"1400.01.000102/2026-02","assunto":"Assunto reservado","atribuido_a_mim":true}
      ]
    }'::jsonb
  )$$,
  'retry idempotente da sincronizacao e aceito'
);

select is(
  (select count(*) from public.fila_notificacoes)::bigint,
  2::bigint,
  'retry nao duplica itens da fila'
);

reset role;
update public.fila_notificacoes
set status = 'PROCESSANDO'
where tipo_notificacao = 'NOVO_PROCESSO';
set local role authenticated;

select lives_ok(
  $$select public.atualizar_preferencias_notificacao(
    'AVISO', true, false, true, true
  )$$,
  'usuario reduz conteudo e desativa atribuicoes'
);

select ok(
  (
    select bool_and(not (conteudo ? 'numero') and not (conteudo ? 'assunto'))
    from public.fila_notificacoes
    where status <> 'ENVIADA'
  ),
  'reducao para AVISO sanitiza todo item ainda nao enviado, inclusive PROCESSANDO'
);

reset role;
update public.instalacoes_agente set ultimo_uso_em = null
where id = '33000000-0000-4000-8000-000000000033';
set local role authenticated;

select lives_ok(
  $$select public.aplicar_retrato_sincronizacao(
    '{
      "instalacao_id":"33000000-0000-4000-8000-000000000033",
      "token_instalacao":"notification-test-token-0000000000000000001",
      "execucao_cliente_id":"b0000000-0000-4000-8000-000000000003",
      "unidade":"UNIDADE NOTIFICACOES",
      "status":"SUCESSO","completa":true,"esperado":3,"capturado":3,
      "atribuicoes_completas":true,
      "processos":[
        {"numero":"1400.01.000101/2026-01","atribuido_a_mim":false},
        {"numero":"1400.01.000102/2026-02","atribuido_a_mim":true},
        {"numero":"1400.01.000103/2026-03","assunto":"Nao deve vazar","atribuido_a_mim":true}
      ]
    }'::jsonb
  )$$,
  'novos eventos respeitam preferencias atuais'
);

select ok(
  (
    select not (o.conteudo ? 'numero') and not (o.conteudo ? 'assunto')
    from public.fila_notificacoes o
    join public.processos_sei p on p.id = o.processo_id
    where p.numero = '1400.01.000103/2026-03'
  ),
  'nivel AVISO nao grava numero nem assunto na fila'
);

select lives_ok(
  $$select public.atualizar_preferencias_notificacao(
    'NUMERO', true, false, true, true
  )$$,
  'usuario seleciona o nivel intermediario NUMERO'
);

select ok(
  (
    select bool_and(conteudo ? 'numero' and not (conteudo ? 'assunto'))
    from public.fila_notificacoes
    where processo_id is not null and status <> 'ENVIADA'
  ),
  'nivel NUMERO inclui numero e exclui assunto'
);

select lives_ok(
  $$select public.atualizar_processo_crm(
    (select id from public.processos_sei where numero = '1400.01.000103/2026-03'),
    p_data_prazo => current_date + 3
  )$$,
  'prazo proximo e configurado no processo'
);

reset role;
select is(
  private.enfileirar_notificacoes_prazo(current_date, 7),
  1,
  'produtor privado cria lembrete de prazo para o Cron'
);
set local role authenticated;

select results_eq(
  $$select
      tipo_notificacao::text,
      conteudo ? 'numero',
      conteudo ? 'assunto'
    from public.fila_notificacoes
    where tipo_notificacao = 'PRAZO_PROXIMO'$$,
  $$values ('PRAZO_PROXIMO', true, false)$$,
  'lembrete de prazo respeita o nivel NUMERO'
);

reset role;
select is(
  private.enfileirar_notificacoes_prazo(current_date, 7),
  0,
  'produtor de prazos e idempotente'
);
set local role authenticated;

select lives_ok(
  $$select public.atualizar_processo_crm(
    (select id from public.processos_sei where numero = '1400.01.000103/2026-03'),
    p_limpar_data_prazo => true
  )$$,
  'prazo pode ser removido do processo'
);

select is(
  (select count(*) from public.fila_notificacoes where tipo_notificacao = 'PRAZO_PROXIMO')::bigint,
  0::bigint,
  'mudanca de prazo remove lembrete obsoleto ainda nao enviado'
);

reset role;
update public.instalacoes_agente set ultimo_uso_em = null
where id = '33000000-0000-4000-8000-000000000033';
set local role authenticated;

select lives_ok(
  $$select public.aplicar_retrato_sincronizacao(
    '{
      "instalacao_id":"33000000-0000-4000-8000-000000000033",
      "token_instalacao":"notification-test-token-0000000000000000001",
      "execucao_cliente_id":"b0000000-0000-4000-8000-000000000004",
      "unidade":"UNIDADE NOTIFICACOES",
      "status":"ERRO","completa":false,"esperado":null,"capturado":0,
      "mensagem_erro":"erro interno que nao deve ir ao conteudo","processos":[]
    }'::jsonb
  )$$,
  'falha de sincronizacao e registrada'
);

select is(
  (select count(*) from public.fila_notificacoes where tipo_notificacao = 'FALHA_SINCRONIZACAO')::bigint,
  1::bigint,
  'falha habilitada cria item de fila'
);

select lives_ok(
  $$select public.aplicar_retrato_sincronizacao(
    '{
      "instalacao_id":"33000000-0000-4000-8000-000000000033",
      "token_instalacao":"notification-test-token-0000000000000000001",
      "execucao_cliente_id":"b0000000-0000-4000-8000-000000000004",
      "unidade":"UNIDADE NOTIFICACOES",
      "status":"ERRO","completa":false,"esperado":null,"capturado":0,
      "mensagem_erro":"erro interno que nao deve ir ao conteudo","processos":[]
    }'::jsonb
  )$$,
  'retry idempotente da falha e aceito'
);

select is(
  (select count(*) from public.fila_notificacoes where tipo_notificacao = 'FALHA_SINCRONIZACAO')::bigint,
  1::bigint,
  'retry da falha nao duplica fila'
);

select set_config(
  'request.jwt.claim.sub',
  '40000000-0000-4000-8000-000000000004',
  true
);

select is(
  (select count(*) from public.preferencias_notificacao)::bigint,
  0::bigint,
  'RLS oculta preferencias de outro usuario'
);

select is(
  (select count(*) from public.fila_notificacoes)::bigint,
  0::bigint,
  'RLS oculta fila de outro usuario'
);

select lives_ok(
  $$select public.atualizar_preferencias_notificacao(
    'NUMERO', false, false, false, false
  )$$,
  'segundo usuario cria somente as proprias preferencias'
);

select is(
  (select count(*) from public.preferencias_notificacao)::bigint,
  1::bigint,
  'segundo usuario enxerga apenas seu registro'
);

select * from finish();
rollback;
