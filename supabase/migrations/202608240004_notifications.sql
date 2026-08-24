create type public.nivel_conteudo_notificacao as enum (
  'AVISO',
  'NUMERO',
  'ASSUNTO'
);

create type public.tipo_notificacao as enum (
  'NOVO_PROCESSO',
  'ATRIBUICAO',
  'PRAZO_PROXIMO',
  'FALHA_SINCRONIZACAO'
);

create type public.status_fila_notificacao as enum (
  'PENDENTE',
  'PROCESSANDO',
  'ENVIADA',
  'FALHOU'
);

alter table public.eventos_sei
  add constraint eventos_sei_usuario_id_id_unico unique (usuario_id, id);

create table public.preferencias_notificacao (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  nivel_conteudo public.nivel_conteudo_notificacao not null default 'AVISO',
  novo_processo boolean not null default true,
  atribuicao boolean not null default true,
  prazo_proximo boolean not null default true,
  falha_sincronizacao boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table public.fila_notificacoes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  tipo_notificacao public.tipo_notificacao not null,
  nivel_conteudo public.nivel_conteudo_notificacao not null,
  evento_origem_id uuid,
  sincronizacao_origem_id uuid,
  processo_id uuid,
  chave_deduplicacao text not null unique,
  conteudo jsonb not null,
  status public.status_fila_notificacao not null default 'PENDENTE',
  tentativas smallint not null default 0,
  disponivel_em timestamptz not null default now(),
  enviado_em timestamptz,
  ultimo_erro text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint fila_notificacoes_proprietario_evento_chave_estrangeira
    foreign key (usuario_id, evento_origem_id)
    references public.eventos_sei(usuario_id, id)
    on delete cascade,
  constraint fila_notificacoes_proprietario_sincronizacao_chave_estrangeira
    foreign key (usuario_id, sincronizacao_origem_id)
    references public.execucoes_sincronizacao_sei(usuario_id, id)
    on delete cascade,
  constraint fila_notificacoes_proprietario_processo_chave_estrangeira
    foreign key (usuario_id, processo_id)
    references public.processos_sei(usuario_id, id)
    on delete cascade,
  constraint fila_notificacoes_chave_deduplicacao_valido check (
    char_length(chave_deduplicacao) between 1 and 255
  ),
  constraint fila_notificacoes_conteudo_objeto check (
    jsonb_typeof(conteudo) = 'object'
  ),
  constraint fila_notificacoes_tentativas_valido check (tentativas between 0 and 100),
  constraint fila_notificacoes_erro_valido check (
    ultimo_erro is null or char_length(ultimo_erro) <= 4000
  ),
  constraint fila_notificacoes_enviada_status_valido check (
    (status = 'ENVIADA') = (enviado_em is not null)
  ),
  constraint fila_notificacoes_origem_valido check (
    (
      tipo_notificacao in ('NOVO_PROCESSO', 'ATRIBUICAO')
      and evento_origem_id is not null
      and sincronizacao_origem_id is null
      and processo_id is not null
    )
    or (
      tipo_notificacao = 'FALHA_SINCRONIZACAO'
      and evento_origem_id is null
      and sincronizacao_origem_id is not null
      and processo_id is null
    )
    or (
      tipo_notificacao = 'PRAZO_PROXIMO'
      and evento_origem_id is null
      and sincronizacao_origem_id is null
      and processo_id is not null
    )
  )
);

create index fila_notificacoes_pendente_indice
  on public.fila_notificacoes (disponivel_em, criado_em)
  where status in ('PENDENTE', 'FALHOU');
create index fila_notificacoes_usuario_criado_indice
  on public.fila_notificacoes (usuario_id, criado_em desc);
create index fila_notificacoes_processo_indice
  on public.fila_notificacoes (processo_id, criado_em desc)
  where processo_id is not null;

create trigger preferencias_notificacao_definir_atualizado_em
before update on public.preferencias_notificacao
for each row execute function public.definir_atualizado_em();

create trigger fila_notificacoes_definir_atualizado_em
before update on public.fila_notificacoes
for each row execute function public.definir_atualizado_em();

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create function private.enfileirar_notificacao_evento()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_preferencias public.preferencias_notificacao%rowtype;
  v_processo public.processos_sei%rowtype;
  v_tipo public.tipo_notificacao;
  v_ativada boolean;
  v_conteudo jsonb;
begin
  if new.tipo_evento = 'ENTROU_NA_UNIDADE' then
    v_tipo := 'NOVO_PROCESSO';
  elsif new.tipo_evento = 'ATRIBUIDO_A_MIM' then
    v_tipo := 'ATRIBUICAO';
  else
    return new;
  end if;

  insert into public.preferencias_notificacao (usuario_id)
  values (new.usuario_id)
  on conflict (usuario_id) do nothing;

  select *
    into strict v_preferencias
  from public.preferencias_notificacao
  where usuario_id = new.usuario_id;

  v_ativada := case v_tipo
    when 'NOVO_PROCESSO' then v_preferencias.novo_processo
    when 'ATRIBUICAO' then v_preferencias.atribuicao
    else false
  end;

  if not v_ativada then
    return new;
  end if;

  select *
    into strict v_processo
  from public.processos_sei
  where id = new.processo_id and usuario_id = new.usuario_id;

  v_conteudo := jsonb_strip_nulls(jsonb_build_object(
    'tipo', v_tipo,
    'titulo', case v_tipo
      when 'NOVO_PROCESSO' then 'Novo processo na unidade'
      when 'ATRIBUICAO' then 'Novo processo atribuido a voce'
      else 'Notificacao CRM-SEI'
    end,
    'numero', case
      when v_preferencias.nivel_conteudo in ('NUMERO', 'ASSUNTO') then v_processo.numero
      else null
    end,
    'assunto', case
      when v_preferencias.nivel_conteudo = 'ASSUNTO' then v_processo.assunto
      else null
    end
  ));

  insert into public.fila_notificacoes (
    usuario_id,
    tipo_notificacao,
    nivel_conteudo,
    evento_origem_id,
    processo_id,
    chave_deduplicacao,
    conteudo
  ) values (
    new.usuario_id,
    v_tipo,
    v_preferencias.nivel_conteudo,
    new.id,
    new.processo_id,
    'evento:' || new.id::text,
    v_conteudo
  )
  on conflict (chave_deduplicacao) do nothing;

  return new;
end;
$$;

create function private.enfileirar_notificacao_falha_sincronizacao()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_preferencias public.preferencias_notificacao%rowtype;
begin
  if new.status not in ('INCOMPLETA', 'SESSAO_EXPIRADA', 'ERRO_LAYOUT_COLETOR', 'ERRO') then
    return new;
  end if;

  insert into public.preferencias_notificacao (usuario_id)
  values (new.usuario_id)
  on conflict (usuario_id) do nothing;

  select *
    into strict v_preferencias
  from public.preferencias_notificacao
  where usuario_id = new.usuario_id;

  if not v_preferencias.falha_sincronizacao then
    return new;
  end if;

  insert into public.fila_notificacoes (
    usuario_id,
    tipo_notificacao,
    nivel_conteudo,
    sincronizacao_origem_id,
    chave_deduplicacao,
    conteudo
  ) values (
    new.usuario_id,
    'FALHA_SINCRONIZACAO',
    v_preferencias.nivel_conteudo,
    new.id,
    'sincronizacao:' || new.id::text || ':falha',
    jsonb_build_object(
      'tipo', 'FALHA_SINCRONIZACAO',
      'titulo', 'Falha na sincronizacao do SEI',
      'status', new.status
    )
  )
  on conflict (chave_deduplicacao) do nothing;

  return new;
end;
$$;

create trigger eventos_sei_enfileirar_notificacao
after insert on public.eventos_sei
for each row execute function private.enfileirar_notificacao_evento();

create trigger execucoes_sincronizacao_sei_enfileirar_notificacao_falha
after insert on public.execucoes_sincronizacao_sei
for each row execute function private.enfileirar_notificacao_falha_sincronizacao();

create function public.atualizar_preferencias_notificacao(
  p_nivel_conteudo public.nivel_conteudo_notificacao,
  p_novo_processo boolean,
  p_atribuicao boolean,
  p_prazo_proximo boolean,
  p_falha_sincronizacao boolean
)
returns public.preferencias_notificacao
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_usuario_id uuid := auth.uid();
  v_preferencias public.preferencias_notificacao%rowtype;
begin
  if v_usuario_id is null then
    raise exception using errcode = '28000', message = 'autenticacao obrigatoria';
  end if;
  if p_nivel_conteudo is null
     or p_novo_processo is null
     or p_atribuicao is null
     or p_prazo_proximo is null
     or p_falha_sincronizacao is null then
    raise exception using errcode = '22023', message = 'todas as preferencias sao obrigatorias';
  end if;

  insert into public.preferencias_notificacao (
    usuario_id,
    nivel_conteudo,
    novo_processo,
    atribuicao,
    prazo_proximo,
    falha_sincronizacao
  ) values (
    v_usuario_id,
    p_nivel_conteudo,
    p_novo_processo,
    p_atribuicao,
    p_prazo_proximo,
    p_falha_sincronizacao
  )
  on conflict (usuario_id) do update
  set nivel_conteudo = excluded.nivel_conteudo,
      novo_processo = excluded.novo_processo,
      atribuicao = excluded.atribuicao,
      prazo_proximo = excluded.prazo_proximo,
      falha_sincronizacao = excluded.falha_sincronizacao
  returning * into v_preferencias;

  delete from public.fila_notificacoes
  where usuario_id = v_usuario_id
    and status <> 'ENVIADA'
    and (
      (tipo_notificacao = 'NOVO_PROCESSO' and not p_novo_processo)
      or (tipo_notificacao = 'ATRIBUICAO' and not p_atribuicao)
      or (tipo_notificacao = 'PRAZO_PROXIMO' and not p_prazo_proximo)
      or (tipo_notificacao = 'FALHA_SINCRONIZACAO' and not p_falha_sincronizacao)
    );

  update public.fila_notificacoes as fila
  set nivel_conteudo = p_nivel_conteudo,
      conteudo = case p_nivel_conteudo
        when 'AVISO' then fila.conteudo - 'numero' - 'assunto'
        when 'NUMERO' then jsonb_set(
          fila.conteudo - 'assunto',
          '{numero}',
          to_jsonb(processo.numero),
          true
        )
        when 'ASSUNTO' then jsonb_strip_nulls(
          (fila.conteudo - 'numero' - 'assunto')
          || jsonb_build_object(
            'numero', processo.numero,
            'assunto', processo.assunto
          )
        )
      end
  from public.processos_sei as processo
  where fila.usuario_id = v_usuario_id
    and fila.processo_id = processo.id
    and processo.usuario_id = v_usuario_id
    and fila.status <> 'ENVIADA';

  update public.fila_notificacoes
  set nivel_conteudo = p_nivel_conteudo,
      conteudo = conteudo - 'numero' - 'assunto'
  where usuario_id = v_usuario_id
    and processo_id is null
    and status <> 'ENVIADA';

  return v_preferencias;
end;
$$;

create function private.enfileirar_notificacoes_prazo(
  p_data_referencia date default current_date,
  p_dias_janela integer default 7
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_inseridos integer;
begin
  if p_data_referencia is null or p_dias_janela is null or p_dias_janela not between 0 and 30 then
    raise exception using
      errcode = '22023',
      message = 'data de referencia e janela entre 0 e 30 dias sao obrigatorias';
  end if;

  insert into public.preferencias_notificacao (usuario_id)
  select distinct processo.usuario_id
  from public.processos_sei as processo
  where processo.na_unidade
    and processo.status_crm <> 'FINALIZADO'
    and processo.data_prazo between p_data_referencia and p_data_referencia + p_dias_janela
  on conflict (usuario_id) do nothing;

  insert into public.fila_notificacoes (
    usuario_id,
    tipo_notificacao,
    nivel_conteudo,
    processo_id,
    chave_deduplicacao,
    conteudo
  )
  select
    processo.usuario_id,
    'PRAZO_PROXIMO',
    preferencias.nivel_conteudo,
    processo.id,
    'prazo:' || processo.id::text || ':' || processo.data_prazo::text,
    jsonb_strip_nulls(jsonb_build_object(
      'tipo', 'PRAZO_PROXIMO',
      'titulo', 'Prazo de processo proximo',
      'data_prazo', processo.data_prazo,
      'numero', case
        when preferencias.nivel_conteudo in ('NUMERO', 'ASSUNTO') then processo.numero
        else null
      end,
      'assunto', case
        when preferencias.nivel_conteudo = 'ASSUNTO' then processo.assunto
        else null
      end
    ))
  from public.processos_sei as processo
  join public.preferencias_notificacao as preferencias
    on preferencias.usuario_id = processo.usuario_id
  where processo.na_unidade
    and processo.status_crm <> 'FINALIZADO'
    and preferencias.prazo_proximo
    and processo.data_prazo between p_data_referencia and p_data_referencia + p_dias_janela
  on conflict (chave_deduplicacao) do nothing;

  get diagnostics v_inseridos = row_count;
  return v_inseridos;
end;
$$;

create function private.remover_notificacoes_prazo_obsoletas()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if old.data_prazo is distinct from new.data_prazo
     or old.status_crm is distinct from new.status_crm
     or old.na_unidade is distinct from new.na_unidade then
    delete from public.fila_notificacoes
    where usuario_id = new.usuario_id
      and processo_id = new.id
      and tipo_notificacao = 'PRAZO_PROXIMO'
      and status <> 'ENVIADA'
      and (
        new.data_prazo is null
        or new.status_crm = 'FINALIZADO'
        or not new.na_unidade
        or chave_deduplicacao <> 'prazo:' || new.id::text || ':' || new.data_prazo::text
      );
  end if;

  return new;
end;
$$;

create trigger processos_sei_remover_notificacoes_prazo_obsoletas
after update of data_prazo, status_crm, na_unidade on public.processos_sei
for each row execute function private.remover_notificacoes_prazo_obsoletas();

create function public.obter_preferencias_notificacao()
returns public.preferencias_notificacao
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_usuario_id uuid := auth.uid();
  v_preferencias public.preferencias_notificacao%rowtype;
begin
  if v_usuario_id is null then
    raise exception using errcode = '28000', message = 'autenticacao obrigatoria';
  end if;

  insert into public.preferencias_notificacao (usuario_id)
  values (v_usuario_id)
  on conflict (usuario_id) do nothing;

  select *
    into strict v_preferencias
  from public.preferencias_notificacao
  where usuario_id = v_usuario_id;

  return v_preferencias;
end;
$$;

alter table public.preferencias_notificacao enable row level security;
alter table public.fila_notificacoes enable row level security;

create policy preferencias_notificacao_selecionar_proprios
on public.preferencias_notificacao
for select
to authenticated
using ((select auth.uid()) = usuario_id);

create policy fila_notificacoes_selecionar_proprios
on public.fila_notificacoes
for select
to authenticated
using ((select auth.uid()) = usuario_id);

revoke all on table public.preferencias_notificacao from anon, authenticated;
revoke all on table public.fila_notificacoes from anon, authenticated;
grant select on table public.preferencias_notificacao to authenticated;
grant select on table public.fila_notificacoes to authenticated;

revoke all on function private.enfileirar_notificacao_evento() from public, anon, authenticated;
revoke all on function private.enfileirar_notificacao_falha_sincronizacao() from public, anon, authenticated;
revoke all on function private.enfileirar_notificacoes_prazo(date, integer) from public, anon, authenticated;
revoke all on function private.remover_notificacoes_prazo_obsoletas() from public, anon, authenticated;
revoke all on function public.atualizar_preferencias_notificacao(
  public.nivel_conteudo_notificacao,
  boolean,
  boolean,
  boolean,
  boolean
) from public, anon;
revoke all on function public.obter_preferencias_notificacao() from public, anon;

grant execute on function public.atualizar_preferencias_notificacao(
  public.nivel_conteudo_notificacao,
  boolean,
  boolean,
  boolean,
  boolean
) to authenticated;
grant execute on function public.obter_preferencias_notificacao() to authenticated;

grant usage on type public.nivel_conteudo_notificacao to authenticated;
grant usage on type public.tipo_notificacao to authenticated;
grant usage on type public.status_fila_notificacao to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, update on table public.fila_notificacoes to service_role';
    execute 'grant usage on schema private to service_role';
    execute 'grant execute on function private.enfileirar_notificacoes_prazo(date, integer) to service_role';
  end if;
end;
$$;

alter table public.preferencias_notificacao replica identity full;
alter table public.fila_notificacoes replica identity full;

do $$
declare
  v_tabela text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach v_tabela in array array['preferencias_notificacao', 'fila_notificacoes']
    loop
      if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = v_tabela
      ) then
        execute format(
          'alter publication supabase_realtime add table public.%I',
          v_tabela
        );
      end if;
    end loop;
  end if;
end;
$$;

comment on table public.fila_notificacoes is
  'Fila transacional e idempotente. Clientes autenticados possuem somente leitura propria; processamento exige backend confiavel.';
comment on function public.atualizar_preferencias_notificacao(
  public.nivel_conteudo_notificacao,
  boolean,
  boolean,
  boolean,
  boolean
) is 'Atualiza todas as preferencias de notificacao do usuario autenticado.';
