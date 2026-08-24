begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select plan(30);

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
    '50000000-0000-4000-8000-000000000005',
    'instalacao-1@example.invalid',
    extensions.crypt('not-a-real-password', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    'authenticated',
    'authenticated'
  ),
  (
    '60000000-0000-4000-8000-000000000006',
    'instalacao-2@example.invalid',
    extensions.crypt('not-a-real-password', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    'authenticated',
    'authenticated'
  );

create temporary table credenciais_instalacao_teste as
select public.provisionar_instalacao_agente(
  '50000000-0000-4000-8000-000000000005',
  'Agente principal',
  'https://sei.example.gov.br'
) as credenciais;
grant select on credenciais_instalacao_teste to authenticated;

select ok(
  char_length(credenciais ->> 'token_instalacao') between 32 and 512,
  'provisionamento retorna token forte uma unica vez'
)
from credenciais_instalacao_teste;

select ok(
  has_function_privilege(
    'service_role',
    'public.provisionar_instalacao_agente(uuid,text,text)',
    'EXECUTE'
  ),
  'somente o backend service_role recebe a RPC de provisionamento'
);

select ok(
  not has_table_privilege(
    'service_role',
    'public.fila_notificacoes',
    'INSERT'
  ),
  'service_role nao insere diretamente na fila'
);

select ok(
  not has_table_privilege(
    'service_role',
    'public.fila_notificacoes',
    'DELETE'
  ),
  'service_role nao remove diretamente da fila'
);

select ok(
  not has_column_privilege(
    'service_role',
    'public.instalacoes_agente',
    'hash_token',
    'SELECT'
  ),
  'nem service_role recebe SELECT do hash do token'
);

select is(
  (
    select instalacao.hash_token
    from public.instalacoes_agente instalacao
    cross join credenciais_instalacao_teste test
    where instalacao.id = (test.credenciais ->> 'instalacao_id')::uuid
  ),
  (
    select encode(
      extensions.digest(
        convert_to(credenciais ->> 'token_instalacao', 'UTF8'),
        'sha256'
      ),
      'hex'
    )
    from credenciais_instalacao_teste
  ),
  'banco armazena somente o hash do token'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '50000000-0000-4000-8000-000000000005',
  true
);

select ok(
  not has_column_privilege(
    'authenticated',
    'public.instalacoes_agente',
    'hash_token',
    'SELECT'
  ),
  'authenticated nunca possui leitura de hash_token'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.provisionar_instalacao_agente(uuid,text,text)',
    'EXECUTE'
  ),
  'browser autenticado nao provisiona instalacoes'
);

select lives_ok(
  format(
    'select public.aplicar_retrato_sincronizacao(%L::jsonb)',
    jsonb_build_object(
      'instalacao_id', credenciais ->> 'instalacao_id',
      'token_instalacao', credenciais ->> 'token_instalacao',
      'execucao_cliente_id', 'c0000000-0000-4000-8000-000000000001',
      'unidade', 'UNIDADE INSTALACAO',
      'status', 'SUCESSO',
      'completa', true,
      'esperado', 1,
      'capturado', 1,
      'processos', jsonb_build_array(jsonb_build_object(
        'numero', '1400.01.000201/2026-01',
        'url_sei', 'https://sei.example.gov.br/controlador.php?acao=procedimento_trabalhar&id=1'
      ))
    )
  ),
  'retrato com instalacao ativa e token valido e aceito'
)
from credenciais_instalacao_teste;

reset role;
update public.execucoes_sincronizacao_sei
set
  instalacao_id = null,
  hash_conteudo = encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'execucao_cliente_id', 'c0000000-0000-4000-8000-000000000001',
          'unidade', 'UNIDADE INSTALACAO',
          'status', 'SUCESSO',
          'completa', true,
          'esperado', 1,
          'capturado', 1,
          'processos', jsonb_build_array(jsonb_build_object(
            'numero', '1400.01.000201/2026-01',
            'url_sei', 'https://sei.example.gov.br/controlador.php?acao=procedimento_trabalhar&id=1'
          ))
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
where execucao_cliente_id = 'c0000000-0000-4000-8000-000000000001';
set local role authenticated;

select is(
  (
    public.aplicar_retrato_sincronizacao(jsonb_build_object(
      'instalacao_id', credenciais ->> 'instalacao_id',
      'token_instalacao', credenciais ->> 'token_instalacao',
      'execucao_cliente_id', 'c0000000-0000-4000-8000-000000000001',
      'unidade', 'UNIDADE INSTALACAO',
      'status', 'SUCESSO',
      'completa', true,
      'esperado', 1,
      'capturado', 1,
      'processos', jsonb_build_array(jsonb_build_object(
        'numero', '1400.01.000201/2026-01',
        'url_sei', 'https://sei.example.gov.br/controlador.php?acao=procedimento_trabalhar&id=1'
      ))
    )) ->> 'idempotente'
  ),
  'true',
  'retry de run anterior a migration permanece idempotente'
)
from credenciais_instalacao_teste;

select is(
  (
    select instalacao_id
    from public.execucoes_sincronizacao_sei
    where execucao_cliente_id = 'c0000000-0000-4000-8000-000000000001'
  ),
  (
    select (credenciais ->> 'instalacao_id')::uuid
    from credenciais_instalacao_teste
  ),
  'retry legado vincula a run a instalacao validada'
);

select throws_ok(
  format(
    'select public.aplicar_retrato_sincronizacao(%L::jsonb)',
    jsonb_build_object(
      'instalacao_id', credenciais ->> 'instalacao_id',
      'token_instalacao', credenciais ->> 'token_instalacao',
      'execucao_cliente_id', 'c0000000-0000-4000-8000-000000000001',
      'unidade', 'UNIDADE INSTALACAO',
      'status', 'SUCESSO', 'completa', true,
      'esperado', 0, 'capturado', 0, 'processos', jsonb_build_array()
    )
  ),
  '22023',
  'execucao_cliente_id ja usado com outro conteudo',
  'retry legado vinculado continua rejeitando conteudo alterado'
)
from credenciais_instalacao_teste;

select throws_ok(
  format(
    'select public.aplicar_retrato_sincronizacao(%L::jsonb)',
    jsonb_build_object(
      'instalacao_id', credenciais ->> 'instalacao_id',
      'token_instalacao', credenciais ->> 'token_instalacao',
      'execucao_cliente_id', 'c0000000-0000-4000-8000-000000000001',
      'unidade', 'UNIDADE INSTALACAO',
      'status', 'SUCESSO',
      'completa', true,
      'esperado', 5001,
      'capturado', 5001,
      'processos', (
        select jsonb_agg(jsonb_build_object('numero', i::text))
        from generate_series(1, 5001) as series(i)
      )
    )
  ),
  '54000',
  'retrato excede o limite de 5000 processos',
  'limite reduzido tambem e aplicado antes do retry idempotente'
)
from credenciais_instalacao_teste;

select is(
  (
    select instalacao_id
    from public.execucoes_sincronizacao_sei
    where execucao_cliente_id = 'c0000000-0000-4000-8000-000000000001'
  ),
  (
    select (credenciais ->> 'instalacao_id')::uuid
    from credenciais_instalacao_teste
  ),
  'execucao de sincronizacao registra a instalacao autenticada'
);

select lives_ok(
  format(
    'select public.aplicar_retrato_sincronizacao(%L::jsonb)',
    jsonb_build_object(
      'instalacao_id', credenciais ->> 'instalacao_id',
      'token_instalacao', credenciais ->> 'token_instalacao',
      'execucao_cliente_id', 'c0000000-0000-4000-8000-000000000001',
      'unidade', 'UNIDADE INSTALACAO',
      'status', 'SUCESSO',
      'completa', true,
      'esperado', 1,
      'capturado', 1,
      'processos', jsonb_build_array(jsonb_build_object(
        'numero', '1400.01.000201/2026-01',
        'url_sei', 'https://sei.example.gov.br/controlador.php?acao=procedimento_trabalhar&id=1'
      ))
    )
  ),
  'retry do mesmo execucao_cliente_id ignora limite de requisicoes e permanece idempotente'
)
from credenciais_instalacao_teste;

select throws_ok(
  format(
    'select public.aplicar_retrato_sincronizacao(%L::jsonb)',
    jsonb_build_object(
      'instalacao_id', credenciais ->> 'instalacao_id',
      'token_instalacao', credenciais ->> 'token_instalacao',
      'execucao_cliente_id', 'c0000000-0000-4000-8000-000000000002',
      'unidade', 'UNIDADE INSTALACAO',
      'status', 'SUCESSO', 'completa', true,
      'esperado', 0, 'capturado', 0, 'processos', jsonb_build_array()
    )
  ),
  'P0001',
  'limite de requisicoes da instalacao: aguarde antes de nova sincronizacao',
  'nova execucao imediata e limitada por instalacao'
)
from credenciais_instalacao_teste;

select throws_ok(
  format(
    'select public.aplicar_retrato_sincronizacao(%L::jsonb)',
    jsonb_build_object(
      'instalacao_id', credenciais ->> 'instalacao_id',
      'token_instalacao', 'token-incorreto-com-tamanho-minimo-000001',
      'execucao_cliente_id', 'c0000000-0000-4000-8000-000000000003',
      'unidade', 'UNIDADE INSTALACAO',
      'status', 'ERRO', 'completa', false,
      'esperado', null, 'capturado', 0, 'processos', jsonb_build_array()
    )
  ),
  '28000',
  'credenciais da instalacao invalidas',
  'token incorreto e rejeitado antes da ingestao'
)
from credenciais_instalacao_teste;

select throws_ok(
  $$select public.aplicar_retrato_sincronizacao(
    '{
      "instalacao_id":"51000000-0000-4000-8000-000000000001",
      "execucao_cliente_id":"c0000000-0000-4000-8000-000000000004",
      "unidade":"UNIDADE INSTALACAO","status":"ERRO","completa":false,
      "esperado":null,"capturado":0,"processos":[]
    }'::jsonb
  )$$,
  '22023',
  'instalacao_id e token_instalacao sao obrigatorios',
  'browser sem segredo da instalacao falha'
);

select throws_ok(
  format(
    'select public.aplicar_retrato_sincronizacao(%L::jsonb)',
    jsonb_build_object(
      'instalacao_id', credenciais ->> 'instalacao_id',
      'token_instalacao', credenciais ->> 'token_instalacao',
      'execucao_cliente_id', 'c0000000-0000-4000-8000-000000000005',
      'unidade', 'UNIDADE INSTALACAO',
      'status', 'INCOMPLETA', 'completa', false,
      'esperado', 1, 'capturado', 1,
      'processos', jsonb_build_array(jsonb_build_object(
        'numero', '1400.01.000202/2026-02',
        'url_sei', 'https://outro.example.gov.br/controlador.php?id=2'
      ))
    )
  ),
  '22023',
  'url_sei fora da origem HTTPS autorizada para a instalacao',
  'origem diferente da lista de permissoes e rejeitada'
)
from credenciais_instalacao_teste;

select throws_ok(
  format(
    'select public.aplicar_retrato_sincronizacao(%L::jsonb)',
    jsonb_build_object(
      'instalacao_id', credenciais ->> 'instalacao_id',
      'token_instalacao', credenciais ->> 'token_instalacao',
      'execucao_cliente_id', 'c0000000-0000-4000-8000-000000000006',
      'unidade', 'UNIDADE INSTALACAO',
      'status', 'INCOMPLETA', 'completa', false,
      'esperado', 1, 'capturado', 1,
      'processos', jsonb_build_array(jsonb_build_object(
        'numero', '1400.01.000203/2026-03',
        'url_sei', 'http://sei.example.gov.br/controlador.php?id=3'
      ))
    )
  ),
  '22023',
  'url_sei fora da origem HTTPS autorizada para a instalacao',
  'HTTP sem TLS e rejeitado'
)
from credenciais_instalacao_teste;

select throws_ok(
  format(
    'select public.aplicar_retrato_sincronizacao(%L::jsonb)',
    jsonb_build_object(
      'instalacao_id', credenciais ->> 'instalacao_id',
      'token_instalacao', credenciais ->> 'token_instalacao',
      'execucao_cliente_id', 'c0000000-0000-4000-8000-000000000007',
      'unidade', 'UNIDADE INSTALACAO',
      'status', 'INCOMPLETA', 'completa', false,
      'esperado', 1, 'capturado', 1,
      'processos', jsonb_build_array(jsonb_build_object(
        'numero', '1400.01.000204/2026-04',
        'url_sei', 'https://usuario:senha@sei.example.gov.br/controlador.php?id=4'
      ))
    )
  ),
  '22023',
  'url_sei fora da origem HTTPS autorizada para a instalacao',
  'URL com credenciais embutidas e rejeitada'
)
from credenciais_instalacao_teste;

select is(
  (select count(*) from public.instalacoes_agente)::bigint,
  1::bigint,
  'RLS permite leitura apenas da instalacao propria'
);

select is(
  (select count(*) from public.instalacoes_agente_seguras)::bigint,
  1::bigint,
  'view segura lista instalacao propria sem hash_token'
);

reset role;
update public.instalacoes_agente set ativa = false;
set local role authenticated;

select throws_ok(
  format(
    'select public.aplicar_retrato_sincronizacao(%L::jsonb)',
    jsonb_build_object(
      'instalacao_id', credenciais ->> 'instalacao_id',
      'token_instalacao', credenciais ->> 'token_instalacao',
      'execucao_cliente_id', 'c0000000-0000-4000-8000-000000000008',
      'unidade', 'UNIDADE INSTALACAO',
      'status', 'ERRO', 'completa', false,
      'esperado', null, 'capturado', 0, 'processos', jsonb_build_array()
    )
  ),
  '28000',
  'instalacao inativa',
  'instalacao desativada e rejeitada'
)
from credenciais_instalacao_teste;

select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000006',
  true
);

select throws_ok(
  format(
    'select public.aplicar_retrato_sincronizacao(%L::jsonb)',
    jsonb_build_object(
      'instalacao_id', credenciais ->> 'instalacao_id',
      'token_instalacao', credenciais ->> 'token_instalacao',
      'execucao_cliente_id', 'c0000000-0000-4000-8000-000000000009',
      'unidade', 'UNIDADE INSTALACAO',
      'status', 'ERRO', 'completa', false,
      'esperado', null, 'capturado', 0, 'processos', jsonb_build_array()
    )
  ),
  '28000',
  'credenciais da instalacao invalidas',
  'outro usuario nao usa instalacao alheia'
)
from credenciais_instalacao_teste;

select is(
  (select count(*) from public.instalacoes_agente)::bigint,
  0::bigint,
  'RLS oculta instalacoes de outro usuario'
);

select is(
  (select count(*) from public.instalacoes_agente_seguras)::bigint,
  0::bigint,
  'view segura tambem respeita RLS'
);

reset role;
select lives_ok(
  $$select public.definir_instalacao_agente_ativa(
    (select (credenciais ->> 'instalacao_id')::uuid from credenciais_instalacao_teste),
    true
  )$$,
  'backend confiavel pode reativar instalacao'
);

select is(
  (
    private.expurgar_dados_operacionais(
      now() + interval '100 days',
      interval '90 days',
      interval '30 days',
      interval '90 days'
    ) ->> 'sincronizacoes_excluidas'
  )::integer,
  1,
  'retencao remove execucoes de sincronizacao antigos sem trabalho pendente'
);

select throws_ok(
  $$select public.provisionar_instalacao_agente(
    '50000000-0000-4000-8000-000000000005',
    'Agente principal',
    'https://sei.example.gov.br'
  )$$,
  '23505',
  'duplicate key value violates unique constraint "instalacoes_agente_usuario_nome_unico"',
  'nome da instalacao e unico por usuario'
);

select * from finish();
rollback;
