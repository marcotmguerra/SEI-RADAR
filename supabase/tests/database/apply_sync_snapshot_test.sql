begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(28);

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
    '10000000-0000-4000-8000-000000000001',
    'db-test-1@example.invalid',
    extensions.crypt('not-a-real-password', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    'authenticated',
    'authenticated'
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    'db-test-2@example.invalid',
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
  '11000000-0000-4000-8000-000000000011',
  '10000000-0000-4000-8000-000000000001',
  'Instalacao do teste principal',
  encode(
    extensions.digest(
      convert_to('apply-test-token-000000000000000000000001', 'UTF8'),
      'sha256'
    ),
    'hex'
  ),
  'https://sei.example.invalid'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);

create temporary table test_processo_ids (id uuid primary key);

select ok(
  not has_function_privilege('anon', 'public.aplicar_retrato_sincronizacao(jsonb)', 'EXECUTE'),
  'anon nao pode executar a RPC de sincronizacao'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.atualizar_processo_crm(uuid,public.status_processo_crm,public.prioridade_crm,date,text,boolean,boolean)',
    'EXECUTE'
  ),
  'anon nao pode executar a RPC de campos CRM'
);

select ok(
  not has_schema_privilege('authenticated', 'public', 'CREATE'),
  'authenticated nao pode criar objetos no schema public'
);

select throws_ok(
  $$select public.aplicar_retrato_sincronizacao(
    '{
      "instalacao_id":"11000000-0000-4000-8000-000000000011",
      "token_instalacao":"apply-test-token-000000000000000000000001",
      "execucao_cliente_id":"a0000000-0000-4000-8000-000000000000",
      "unidade":"UNIDADE TESTE",
      "status":"EM_EXECUCAO","completa":false,"esperado":0,"capturado":0,"processos":[]
    }'::jsonb
  )$$,
  '22023',
  'status EM_EXECUCAO e reservado ao banco',
  'EM_EXECUCAO nao e aceito como status enviado pelo cliente'
);

select throws_ok(
  $$select public.aplicar_retrato_sincronizacao(
    '{
      "instalacao_id":"11000000-0000-4000-8000-000000000011",
      "token_instalacao":"apply-test-token-000000000000000000000001",
      "execucao_cliente_id":"a0000000-0000-4000-8000-000000000010",
      "unidade":"UNIDADE TESTE",
      "status":"INCOMPLETA","completa":false,"esperado":1,"capturado":1,
      "marcadores_completos":true,
      "processos":[{"numero":"1400.01.000010/2026-10","marcadores":["X","X"]}]
    }'::jsonb
  )$$,
  '22023',
  'processo contem marcadores duplicados',
  'marcadores duplicados sao rejeitados na fronteira SQL'
);

select throws_ok(
  $$select public.aplicar_retrato_sincronizacao(
    jsonb_build_object(
      'instalacao_id', '11000000-0000-4000-8000-000000000011',
      'token_instalacao', 'apply-test-token-000000000000000000000001',
      'execucao_cliente_id', 'a0000000-0000-4000-8000-000000000011',
      'unidade', 'UNIDADE TESTE',
      'status', 'INCOMPLETA',
      'completa', false,
      'esperado', 1,
      'capturado', 1,
      'marcadores_completos', true,
      'processos', jsonb_build_array(
        jsonb_build_object(
          'numero', '1400.01.000011/2026-11',
          'marcadores', (select jsonb_agg(i::text) from generate_series(1, 1001) i)
        )
      )
    )
  )$$,
  '54000',
  'processo excede o limite de 1000 marcadores',
  'limite de marcadores protege a RPC contra conteudo abusivo'
);

select lives_ok(
  $$select public.aplicar_retrato_sincronizacao(
    '{
      "instalacao_id":"11000000-0000-4000-8000-000000000011",
      "token_instalacao":"apply-test-token-000000000000000000000001",
      "execucao_cliente_id":"a0000000-0000-4000-8000-000000000001",
      "unidade":"UNIDADE TESTE",
      "status":"SUCESSO",
      "completa":true,
      "esperado":2,
      "capturado":2,
      "atribuicoes_completas":true,
      "marcadores_completos":true,
      "processos":[
        {"numero":"1400.01.000001/2026-01","atribuido_a_mim":true,"marcadores":["Urgente"]},
        {"numero":"1400.01.000002/2026-02","atribuido_a_mim":false,"marcadores":[]}
      ]
    }'::jsonb
  )$$,
  'o primeiro retrato completo cria o linha_base'
);

select is(
  (select count(*) from public.processos_sei)::bigint,
  2::bigint,
  'linha_base grava os processos'
);

insert into test_processo_ids (id)
select id from public.processos_sei order by numero limit 1;

select is(
  (select count(*) from public.eventos_sei)::bigint,
  0::bigint,
  'linha_base nao gera avalanche de eventos'
);

select is(
  (select count(*) from public.processos_marcadores_sei where ativa)::bigint,
  1::bigint,
  'linha_base grava marcadores sem evento'
);

reset role;
update public.instalacoes_agente set ultimo_uso_em = null
where id = '11000000-0000-4000-8000-000000000011';
set local role authenticated;

select lives_ok(
  $$select public.aplicar_retrato_sincronizacao(
    '{
      "instalacao_id":"11000000-0000-4000-8000-000000000011",
      "token_instalacao":"apply-test-token-000000000000000000000001",
      "execucao_cliente_id":"a0000000-0000-4000-8000-000000000002",
      "unidade":"UNIDADE TESTE",
      "status":"SUCESSO",
      "completa":true,
      "esperado":3,
      "capturado":3,
      "atribuicoes_completas":true,
      "marcadores_completos":true,
      "processos":[
        {"numero":"1400.01.000001/2026-01","atribuido_a_mim":false,"marcadores":[]},
        {"numero":"1400.01.000002/2026-02","atribuido_a_mim":false,"marcadores":[]},
        {"numero":"1400.01.000003/2026-03","atribuido_a_mim":true,"marcadores":["Novo"]}
      ]
    }'::jsonb
  )$$,
  'retrato posterior reconcilia mudancas'
);

select results_eq(
  $$select tipo_evento::text from public.eventos_sei order by tipo_evento::text$$,
  $$values ('ATRIBUIDO_A_MIM'), ('ENTROU_NA_UNIDADE'), ('IDENTIFICADO_PRIMEIRA_VEZ'), ('MARCADOR_ADICIONADO'), ('MARCADOR_REMOVIDO'), ('ATRIBUICAO_REMOVIDA')$$,
  'retrato posterior produz cada evento esperado uma vez'
);

reset role;
update public.instalacoes_agente set ultimo_uso_em = null
where id = '11000000-0000-4000-8000-000000000011';
set local role authenticated;

select lives_ok(
  $$select public.aplicar_retrato_sincronizacao(
    '{
      "instalacao_id":"11000000-0000-4000-8000-000000000011",
      "token_instalacao":"apply-test-token-000000000000000000000001",
      "execucao_cliente_id":"a0000000-0000-4000-8000-000000000003",
      "unidade":"UNIDADE TESTE",
      "status":"INCOMPLETA",
      "completa":false,
      "esperado":3,
      "capturado":1,
      "processos":[{"numero":"1400.01.000003/2026-03"}]
    }'::jsonb
  )$$,
  'retrato incompleto e registrado sem inferir ausencias'
);

select is(
  (select contagem_ausencias from public.processos_sei where numero = '1400.01.000001/2026-01'),
  0,
  'retrato incompleto nao incrementa ausencias'
);

reset role;
update public.instalacoes_agente set ultimo_uso_em = null
where id = '11000000-0000-4000-8000-000000000011';
set local role authenticated;

select lives_ok(
  $$select public.aplicar_retrato_sincronizacao(
    '{
      "instalacao_id":"11000000-0000-4000-8000-000000000011",
      "token_instalacao":"apply-test-token-000000000000000000000001",
      "execucao_cliente_id":"a0000000-0000-4000-8000-000000000012",
      "unidade":"UNIDADE TESTE",
      "status":"INCOMPLETA","completa":false,"esperado":3,"capturado":1,
      "processos":[]
    }'::jsonb
  )$$,
  'incompleto pode registrar contagem mesmo descartando metadados parciais'
);

reset role;
update public.instalacoes_agente set ultimo_uso_em = null
where id = '11000000-0000-4000-8000-000000000011';
set local role authenticated;

select lives_ok(
  $$select public.aplicar_retrato_sincronizacao(
    '{
      "instalacao_id":"11000000-0000-4000-8000-000000000011",
      "token_instalacao":"apply-test-token-000000000000000000000001",
      "execucao_cliente_id":"a0000000-0000-4000-8000-000000000004",
      "unidade":"UNIDADE TESTE",
      "status":"SUCESSO","completa":true,"esperado":2,"capturado":2,
      "processos":[
        {"numero":"1400.01.000002/2026-02"},
        {"numero":"1400.01.000003/2026-03"}
      ]
    }'::jsonb
  )$$,
  'primeira ausencia completa e aceita'
);

select results_eq(
  $$select contagem_ausencias, na_unidade from public.processos_sei where numero = '1400.01.000001/2026-01'$$,
  $$values (1, true)$$,
  'primeira ausencia mantem processo na unidade'
);

reset role;
update public.instalacoes_agente set ultimo_uso_em = null
where id = '11000000-0000-4000-8000-000000000011';
set local role authenticated;

select lives_ok(
  $$select public.aplicar_retrato_sincronizacao(
    '{
      "instalacao_id":"11000000-0000-4000-8000-000000000011",
      "token_instalacao":"apply-test-token-000000000000000000000001",
      "execucao_cliente_id":"a0000000-0000-4000-8000-000000000005",
      "unidade":"UNIDADE TESTE",
      "status":"SUCESSO","completa":true,"esperado":2,"capturado":2,
      "processos":[
        {"numero":"1400.01.000002/2026-02"},
        {"numero":"1400.01.000003/2026-03"}
      ]
    }'::jsonb
  )$$,
  'segunda ausencia completa e aceita'
);

select results_eq(
  $$select contagem_ausencias, na_unidade from public.processos_sei where numero = '1400.01.000001/2026-01'$$,
  $$values (2, false)$$,
  'segunda ausencia confirma saida'
);

select is(
  (select count(*) from public.eventos_sei where tipo_evento = 'SAIU_DA_UNIDADE')::bigint,
  1::bigint,
  'saida gera um unico evento'
);

reset role;
update public.instalacoes_agente set ultimo_uso_em = null
where id = '11000000-0000-4000-8000-000000000011';
set local role authenticated;

select throws_ok(
  $$select public.aplicar_retrato_sincronizacao(
    '{
      "instalacao_id":"11000000-0000-4000-8000-000000000011",
      "token_instalacao":"apply-test-token-000000000000000000000001",
      "execucao_cliente_id":"a0000000-0000-4000-8000-000000000006",
      "unidade":"UNIDADE TESTE",
      "iniciada_em":"2000-01-01T00:00:00Z",
      "finalizada_em":"2000-01-01T00:01:00Z",
      "status":"INCOMPLETA","completa":false,"esperado":1,"capturado":1,
      "processos":[{"numero":"1400.01.000001/2026-01"}]
    }'::jsonb
  )$$,
  '22023',
  'retrato e anterior ao ultimo retrato aplicado',
  'retrato incompleto atrasado nao reativa processo removido'
);

select is(
  (
    public.aplicar_retrato_sincronizacao(
      '{
        "instalacao_id":"11000000-0000-4000-8000-000000000011",
        "token_instalacao":"apply-test-token-000000000000000000000001",
        "execucao_cliente_id":"a0000000-0000-4000-8000-000000000005",
        "unidade":"UNIDADE TESTE",
        "status":"SUCESSO","completa":true,"esperado":2,"capturado":2,
        "processos":[
          {"numero":"1400.01.000002/2026-02"},
          {"numero":"1400.01.000003/2026-03"}
        ]
      }'::jsonb
    )->>'idempotente'
  ),
  'true',
  'repeticao do execucao_cliente_id e idempotente'
);

select throws_ok(
  $$select public.aplicar_retrato_sincronizacao(
    '{
      "instalacao_id":"11000000-0000-4000-8000-000000000011",
      "token_instalacao":"apply-test-token-000000000000000000000001",
      "execucao_cliente_id":"a0000000-0000-4000-8000-000000000005",
      "unidade":"UNIDADE TESTE",
      "status":"SUCESSO","completa":true,"esperado":0,"capturado":0,"processos":[]
    }'::jsonb
  )$$,
  '22023',
  'execucao_cliente_id ja usado com outro conteudo',
  'chave de idempotencia nao pode ser reutilizada com outro conteudo'
);

select lives_ok(
  $$select public.atualizar_processo_crm(
    (select id from public.processos_sei where numero = '1400.01.000002/2026-02'),
    'EM_ANALISE',
    'ALTA',
    current_date + 7,
    'Observacao de teste'
  )$$,
  'RPC permite alterar somente campos CRM do processo proprio'
);

select results_eq(
  $$select status_crm::text, prioridade::text, observacoes from public.processos_sei where numero = '1400.01.000002/2026-02'$$,
  $$values ('EM_ANALISE', 'ALTA', 'Observacao de teste')$$,
  'campos CRM foram atualizados'
);

select ok(
  not has_table_privilege('authenticated', 'public.processos_sei', 'UPDATE'),
  'authenticated nao possui UPDATE direto na tabela de processos'
);

select set_config(
  'request.jwt.claim.sub',
  '20000000-0000-4000-8000-000000000002',
  true
);

select is(
  (select count(*) from public.processos_sei)::bigint,
  0::bigint,
  'RLS isola os processos de outro usuario'
);

select throws_ok(
  $$select public.atualizar_processo_crm(
    (select id from test_processo_ids),
    p_status_crm => 'FINALIZADO'
  )$$,
  'P0002',
  'processo nao encontrado',
  'usuario nao pode alterar campos CRM de processo alheio'
);

select * from finish();
rollback;
