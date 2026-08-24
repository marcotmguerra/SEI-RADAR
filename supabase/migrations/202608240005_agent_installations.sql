create table public.instalacoes_agente (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  hash_token text not null,
  origem_sei_permitida text not null,
  ativa boolean not null default true,
  ultimo_uso_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint instalacoes_agente_usuario_nome_unico unique (usuario_id, nome),
  constraint instalacoes_agente_usuario_id_id_unico unique (usuario_id, id),
  constraint instalacoes_agente_nome_valido check (
    char_length(btrim(nome)) between 1 and 100
    and nome !~ '[[:cntrl:]]'
  ),
  constraint instalacoes_agente_hash_token_valido check (
    hash_token ~ '^[0-9a-f]{64}$'
  ),
  constraint instalacoes_agente_origem_valido check (
    origem_sei_permitida = lower(origem_sei_permitida)
    and origem_sei_permitida ~ '^https://[a-z0-9.-]+(:[0-9]{1,5})?$'
    and origem_sei_permitida !~ '@'
    and origem_sei_permitida !~ '\.\.'
  )
);

create index instalacoes_agente_usuario_ativa_indice
  on public.instalacoes_agente (usuario_id, ativa, criado_em desc);

create trigger instalacoes_agente_definir_atualizado_em
before update on public.instalacoes_agente
for each row execute function public.definir_atualizado_em();

alter table public.execucoes_sincronizacao_sei add column instalacao_id uuid;
alter table public.execucoes_sincronizacao_sei
  add constraint execucoes_sincronizacao_instalacao_chave_estrangeira
  foreign key (usuario_id, instalacao_id)
  references public.instalacoes_agente(usuario_id, id)
  on delete set null (instalacao_id);
create index execucoes_sincronizacao_sei_instalacao_iniciada_indice
  on public.execucoes_sincronizacao_sei (instalacao_id, iniciada_em desc)
  where instalacao_id is not null;

create view public.instalacoes_agente_seguras
with (security_invoker = true)
as
select
  id,
  usuario_id,
  nome,
  origem_sei_permitida,
  ativa,
  ultimo_uso_em,
  criado_em,
  atualizado_em
from public.instalacoes_agente;

alter table public.instalacoes_agente enable row level security;

create policy instalacoes_agente_selecionar_proprios
on public.instalacoes_agente
for select
to authenticated
using ((select auth.uid()) = usuario_id);

revoke all on table public.instalacoes_agente from anon, authenticated;
revoke all on table public.instalacoes_agente_seguras from anon, authenticated;
grant select (
  id,
  usuario_id,
  nome,
  origem_sei_permitida,
  ativa,
  ultimo_uso_em,
  criado_em,
  atualizado_em
) on public.instalacoes_agente to authenticated;
grant select on table public.instalacoes_agente_seguras to authenticated;

create function public.provisionar_instalacao_agente(
  p_usuario_id uuid,
  p_nome text,
  p_origem_sei text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_instalacao_id uuid;
  v_nome text := btrim(p_nome);
  v_origem text := lower(btrim(p_origem_sei));
  v_token text;
  v_hash_token text;
  v_texto_porta text;
begin
  if p_usuario_id is null then
    raise exception using errcode = '22023', message = 'usuario_id e obrigatorio';
  end if;
  if v_nome is null
     or char_length(v_nome) not between 1 and 100
     or v_nome ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'nome deve ter entre 1 e 100 caracteres validos';
  end if;
  if v_origem is null
     or v_origem !~ '^https://[a-z0-9.-]+(:[0-9]{1,5})?$'
     or v_origem ~ '@'
     or v_origem ~ '\.\.' then
    raise exception using
      errcode = '22023',
      message = 'origem_sei deve ser uma origem HTTPS sem caminho, consulta ou credenciais';
  end if;

  v_texto_porta := substring(v_origem from ':([0-9]{1,5})$');
  if v_texto_porta is not null and v_texto_porta::integer > 65535 then
    raise exception using errcode = '22023', message = 'porta da origem SEI e invalida';
  end if;

  v_token := translate(
    rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='),
    '+/',
    '-_'
  );
  v_hash_token := encode(
    extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'),
    'hex'
  );

  insert into public.instalacoes_agente (
    usuario_id,
    nome,
    hash_token,
    origem_sei_permitida
  ) values (
    p_usuario_id,
    v_nome,
    v_hash_token,
    v_origem
  )
  returning id into v_instalacao_id;

  return jsonb_build_object(
    'instalacao_id', v_instalacao_id,
    'token_instalacao', v_token,
    'nome', v_nome,
    'origem_sei_permitida', v_origem
  );
end;
$$;

create function public.definir_instalacao_agente_ativa(
  p_instalacao_id uuid,
  p_ativa boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_instalacao public.instalacoes_agente%rowtype;
begin
  if p_instalacao_id is null or p_ativa is null then
    raise exception using errcode = '22023', message = 'instalacao_id e ativa sao obrigatorios';
  end if;

  update public.instalacoes_agente
  set ativa = p_ativa
  where id = p_instalacao_id
  returning * into v_instalacao;

  if not found then
    raise exception using errcode = 'P0002', message = 'instalacao nao encontrada';
  end if;

  return jsonb_build_object(
    'instalacao_id', v_instalacao.id,
    'usuario_id', v_instalacao.usuario_id,
    'nome', v_instalacao.nome,
    'origem_sei_permitida', v_instalacao.origem_sei_permitida,
    'ativa', v_instalacao.ativa,
    'atualizado_em', v_instalacao.atualizado_em
  );
end;
$$;

create function private.definir_instalacao_execucao_sincronizacao()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_configuracao_instalacao text;
begin
  if new.instalacao_id is null then
    v_configuracao_instalacao := current_setting('crm_sei.instalacao_id', true);
    if v_configuracao_instalacao is null or v_configuracao_instalacao = '' then
      raise exception using
        errcode = '28000',
        message = 'contexto da instalacao ausente';
    end if;
    new.instalacao_id := v_configuracao_instalacao::uuid;
  end if;

  return new;
end;
$$;

create trigger execucoes_sincronizacao_sei_definir_instalacao
before insert on public.execucoes_sincronizacao_sei
for each row execute function private.definir_instalacao_execucao_sincronizacao();

alter function public.aplicar_retrato_sincronizacao(jsonb) set schema private;
alter function private.aplicar_retrato_sincronizacao(jsonb) rename to aplicar_retrato_sincronizacao_interno;
revoke all on function private.aplicar_retrato_sincronizacao_interno(jsonb)
  from public, anon, authenticated;

create function public.aplicar_retrato_sincronizacao(p_retrato jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_usuario_id uuid := auth.uid();
  v_instalacao_id uuid;
  v_token_instalacao text;
  v_execucao_cliente_id uuid;
  v_instalacao public.instalacoes_agente%rowtype;
  v_instalacao_existente_id uuid;
  v_hash_conteudo_existente text;
  v_resultado_existente jsonb;
  v_hash_conteudo_legado text;
  v_processos jsonb;
  v_contagem_marcadores bigint;
begin
  if v_usuario_id is null then
    raise exception using errcode = '28000', message = 'autenticacao obrigatoria';
  end if;
  if p_retrato is null or jsonb_typeof(p_retrato) <> 'object' then
    raise exception using errcode = '22023', message = 'retrato deve ser um objeto JSON';
  end if;

  begin
    v_instalacao_id := (p_retrato ->> 'instalacao_id')::uuid;
    v_execucao_cliente_id := (p_retrato ->> 'execucao_cliente_id')::uuid;
  exception
    when invalid_text_representation then
      raise exception using errcode = '22023', message = 'instalacao_id ou execucao_cliente_id invalido';
  end;
  v_token_instalacao := p_retrato ->> 'token_instalacao';

  if v_instalacao_id is null
     or v_token_instalacao is null
     or char_length(v_token_instalacao) not between 32 and 512 then
    raise exception using
      errcode = '22023',
      message = 'instalacao_id e token_instalacao sao obrigatorios';
  end if;

  select *
    into v_instalacao
  from public.instalacoes_agente
  where id = v_instalacao_id and usuario_id = v_usuario_id
  for update;

  if not found or v_instalacao.hash_token <> encode(
    extensions.digest(convert_to(v_token_instalacao, 'UTF8'), 'sha256'),
    'hex'
  ) then
    raise exception using errcode = '28000', message = 'credenciais da instalacao invalidas';
  end if;
  if not v_instalacao.ativa then
    raise exception using errcode = '28000', message = 'instalacao inativa';
  end if;

  if pg_column_size(p_retrato) > 8388608 then
    raise exception using errcode = '54000', message = 'retrato excede o limite de 8 MiB';
  end if;

  v_processos := coalesce(p_retrato -> 'processos', '[]'::jsonb);
  if jsonb_typeof(v_processos) = 'array' then
    if jsonb_array_length(v_processos) > 5000 then
      raise exception using errcode = '54000', message = 'retrato excede o limite de 5000 processos';
    end if;

    select coalesce(sum(
      case
        when jsonb_typeof(item_processo.value -> 'marcadores') = 'array'
          then jsonb_array_length(item_processo.value -> 'marcadores')
        else 0
      end
    ), 0)
      into v_contagem_marcadores
    from jsonb_array_elements(v_processos) as item_processo(value);

    if v_contagem_marcadores > 20000 then
      raise exception using errcode = '54000', message = 'retrato excede o limite total de 20000 marcadores';
    end if;

    if exists (
      select 1
      from jsonb_array_elements(v_processos) as item_processo(value)
      where item_processo.value ? 'url_sei'
        and item_processo.value ->> 'url_sei' is not null
        and lower(substring(
          item_processo.value ->> 'url_sei'
          from '^(https://[^/?#]+)'
        )) is distinct from v_instalacao.origem_sei_permitida
    ) then
      raise exception using
        errcode = '22023',
        message = 'url_sei fora da origem HTTPS autorizada para a instalacao';
    end if;
  end if;

  select instalacao_id, hash_conteudo, resultado
    into v_instalacao_existente_id, v_hash_conteudo_existente, v_resultado_existente
  from public.execucoes_sincronizacao_sei
  where usuario_id = v_usuario_id and execucao_cliente_id = v_execucao_cliente_id
  for update;

  if found then
    if v_instalacao_existente_id is null then
      v_hash_conteudo_legado := encode(
        extensions.digest(
          convert_to(
            (p_retrato - 'instalacao_id' - 'token_instalacao')::text,
            'UTF8'
          ),
          'sha256'
        ),
        'hex'
      );
      if v_hash_conteudo_existente <> v_hash_conteudo_legado then
        raise exception using
          errcode = '22023',
          message = 'execucao_cliente_id ja usado com outro conteudo';
      end if;
      if v_resultado_existente is null then
        raise exception using
          errcode = '55000',
          message = 'sincronizacao idempotente ainda nao foi concluida';
      end if;

      update public.execucoes_sincronizacao_sei
      set
        instalacao_id = v_instalacao_id,
        hash_conteudo = encode(
          extensions.digest(convert_to(p_retrato::text, 'UTF8'), 'sha256'
          ),
          'hex'
        )
      where usuario_id = v_usuario_id and execucao_cliente_id = v_execucao_cliente_id;

      return v_resultado_existente || jsonb_build_object('idempotente', true);
    end if;

    if v_instalacao_existente_id <> v_instalacao_id then
      raise exception using
        errcode = '22023',
        message = 'execucao_cliente_id ja pertence a outra instalacao';
    end if;
    perform set_config('crm_sei.instalacao_id', v_instalacao_id::text, true);
    return private.aplicar_retrato_sincronizacao_interno(p_retrato);
  end if;

  if v_instalacao.ultimo_uso_em is not null
     and clock_timestamp() - v_instalacao.ultimo_uso_em < interval '30 seconds' then
    raise exception using
      errcode = 'P0001',
      message = 'limite de requisicoes da instalacao: aguarde antes de nova sincronizacao';
  end if;

  update public.instalacoes_agente
  set ultimo_uso_em = clock_timestamp()
  where id = v_instalacao_id;

  perform set_config('crm_sei.instalacao_id', v_instalacao_id::text, true);
  return private.aplicar_retrato_sincronizacao_interno(p_retrato);
end;
$$;

create function private.expurgar_dados_operacionais(
  p_agora timestamptz default now(),
  p_retencao_sincronizacao interval default interval '90 days',
  p_retencao_enviadas interval default interval '30 days',
  p_retencao_falhas interval default interval '90 days'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_enviadas_excluidas integer;
  v_falhas_excluidas integer;
  v_sincronizacoes_excluidas integer;
begin
  if p_agora is null
     or p_retencao_sincronizacao < interval '1 day'
     or p_retencao_enviadas < interval '1 day'
     or p_retencao_falhas < interval '1 day'
     or p_retencao_sincronizacao > interval '3650 days'
     or p_retencao_enviadas > interval '3650 days'
     or p_retencao_falhas > interval '3650 days' then
    raise exception using errcode = '22023', message = 'parametros de retencao invalidos';
  end if;

  delete from public.fila_notificacoes
  where status = 'ENVIADA'
    and enviado_em < p_agora - p_retencao_enviadas;
  get diagnostics v_enviadas_excluidas = row_count;

  delete from public.fila_notificacoes
  where status = 'FALHOU'
    and atualizado_em < p_agora - p_retencao_falhas;
  get diagnostics v_falhas_excluidas = row_count;

  delete from public.execucoes_sincronizacao_sei as execucao_sincronizacao
  where coalesce(execucao_sincronizacao.finalizada_em, execucao_sincronizacao.criado_em) < p_agora - p_retencao_sincronizacao
    and not exists (
      select 1
      from public.fila_notificacoes as fila
      left join public.eventos_sei as evento
        on evento.id = fila.evento_origem_id
      where (
          fila.sincronizacao_origem_id = execucao_sincronizacao.id
          or evento.sincronizacao_id = execucao_sincronizacao.id
        )
    );
  get diagnostics v_sincronizacoes_excluidas = row_count;

  return jsonb_build_object(
    'fila_enviada_excluida', v_enviadas_excluidas,
    'fila_falha_excluida', v_falhas_excluidas,
    'sincronizacoes_excluidas', v_sincronizacoes_excluidas
  );
end;
$$;

revoke all on function public.provisionar_instalacao_agente(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.definir_instalacao_agente_ativa(uuid, boolean)
  from public, anon, authenticated;
revoke all on function private.definir_instalacao_execucao_sincronizacao()
  from public, anon, authenticated;
revoke all on function private.expurgar_dados_operacionais(timestamptz, interval, interval, interval)
  from public, anon, authenticated;
revoke all on function public.aplicar_retrato_sincronizacao(jsonb) from public, anon;
grant execute on function public.aplicar_retrato_sincronizacao(jsonb) to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'revoke all on table public.fila_notificacoes from service_role';
    execute 'grant select, update on table public.fila_notificacoes to service_role';
    execute 'revoke all on table public.instalacoes_agente from service_role';
    execute 'grant execute on function public.provisionar_instalacao_agente(uuid, text, text) to service_role';
    execute 'grant execute on function public.definir_instalacao_agente_ativa(uuid, boolean) to service_role';
    execute 'grant usage on schema private to service_role';
    execute 'grant execute on function private.expurgar_dados_operacionais(timestamptz, interval, interval, interval) to service_role';
  end if;
end;
$$;

comment on table public.instalacoes_agente is
  'Instalacoes do agente local. hash_token nunca possui privilegio SELECT para clientes; o token puro e retornado apenas no provisionamento.';
comment on function public.aplicar_retrato_sincronizacao(jsonb) is
  'Valida sessao, instalacao, token, lista de permissoes HTTPS, limites e limite de requisicoes antes de executar a ingestao transacional.';
comment on function private.expurgar_dados_operacionais(timestamptz, interval, interval, interval) is
  'Retencao: execucoes de sincronizacao 90 dias, fila ENVIADA 30 dias e FALHOU 90 dias por padrao; preserva execucoes enquanto qualquer fila relacionada ainda existir.';
