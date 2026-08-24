create extension if not exists pgcrypto with schema extensions;

create type public.status_processo_crm as enum (
  'NOVO',
  'EM_ANALISE',
  'AGUARDANDO_RESPOSTA',
  'PARA_DESPACHO',
  'FINALIZADO'
);

create type public.prioridade_crm as enum ('BAIXA', 'NORMAL', 'ALTA', 'URGENTE');

create type public.status_sincronizacao_sei as enum (
  'EM_EXECUCAO',
  'SUCESSO',
  'INCOMPLETA',
  'SESSAO_EXPIRADA',
  'ERRO_LAYOUT_COLETOR',
  'ERRO'
);

create type public.tipo_evento_sei as enum (
  'IDENTIFICADO_PRIMEIRA_VEZ',
  'ENTROU_NA_UNIDADE',
  'SAIU_DA_UNIDADE',
  'ATRIBUIDO_A_MIM',
  'ATRIBUICAO_REMOVIDA',
  'MARCADOR_ADICIONADO',
  'MARCADOR_REMOVIDO'
);

create table public.execucoes_sincronizacao_sei (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  execucao_cliente_id uuid not null,
  unidade text not null,
  iniciada_em timestamptz not null default now(),
  finalizada_em timestamptz,
  status public.status_sincronizacao_sei not null default 'EM_EXECUCAO',
  processos_esperados integer,
  processos_capturados integer,
  atribuicoes_esperadas integer,
  atribuicoes_capturadas integer,
  completa boolean not null default false,
  atribuicoes_completas boolean not null default false,
  marcadores_completos boolean not null default false,
  mensagem_erro text,
  duracao_ms integer,
  hash_conteudo text not null,
  resultado jsonb,
  criado_em timestamptz not null default now(),
  constraint execucoes_sincronizacao_sei_usuario_cliente_unico unique (usuario_id, execucao_cliente_id),
  constraint execucoes_sincronizacao_sei_usuario_id_id_unico unique (usuario_id, id),
  constraint execucoes_sincronizacao_sei_unidade_valido check (
    char_length(btrim(unidade)) between 1 and 255
  ),
  constraint execucoes_sincronizacao_sei_contagens_valido check (
    (processos_esperados is null or processos_esperados >= 0)
    and (processos_capturados is null or processos_capturados >= 0)
    and (atribuicoes_esperadas is null or atribuicoes_esperadas >= 0)
    and (atribuicoes_capturadas is null or atribuicoes_capturadas >= 0)
  ),
  constraint execucoes_sincronizacao_sei_datas_horas_valido check (
    finalizada_em is null or finalizada_em >= iniciada_em
  ),
  constraint execucoes_sincronizacao_sei_duracao_valido check (duracao_ms is null or duracao_ms >= 0),
  constraint execucoes_sincronizacao_sei_mensagem_erro_valido check (
    mensagem_erro is null or char_length(mensagem_erro) <= 4000
  ),
  constraint execucoes_sincronizacao_sei_hash_conteudo_valido check (hash_conteudo ~ '^[0-9a-f]{64}$')
);

create table public.processos_sei (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  numero text not null,
  assunto text,
  url_sei text,
  unidade text not null,
  visto_primeiro_em timestamptz not null default now(),
  visto_ultimo_em timestamptz not null default now(),
  na_unidade boolean not null default true,
  atribuido_a_mim boolean not null default false,
  contagem_ausencias integer not null default 0,
  status_crm public.status_processo_crm not null default 'NOVO',
  prioridade public.prioridade_crm not null default 'NORMAL',
  data_prazo date,
  observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint processos_sei_usuario_unidade_numero_unico unique (usuario_id, unidade, numero),
  constraint processos_sei_usuario_id_id_unico unique (usuario_id, id),
  constraint processos_sei_numero_valido check (
    numero ~ '^[0-9]{4}\.[0-9]{2}\.[0-9]{6,10}/[0-9]{4}-[0-9]{2}$'
  ),
  constraint processos_sei_unidade_valido check (
    char_length(btrim(unidade)) between 1 and 255
  ),
  constraint processos_sei_assunto_valido check (
    assunto is null or char_length(assunto) <= 2000
  ),
  constraint processos_sei_url_sei_valido check (
    url_sei is null
    or (
      char_length(url_sei) <= 2048
      and url_sei ~* '^https://'
    )
  ),
  constraint processos_sei_contagem_ausencias_valido check (contagem_ausencias between 0 and 2),
  constraint processos_sei_observacoes_valido check (observacoes is null or char_length(observacoes) <= 10000),
  constraint processos_sei_datas_horas_valido check (visto_ultimo_em >= visto_primeiro_em)
);

create table public.marcadores_sei (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  cor text,
  identificador_sei text not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint marcadores_sei_usuario_identificador_unico unique (usuario_id, identificador_sei),
  constraint marcadores_sei_usuario_id_id_unico unique (usuario_id, id),
  constraint marcadores_sei_nome_valido check (char_length(btrim(nome)) between 1 and 200),
  constraint marcadores_identificador_sei_valido check (
    char_length(btrim(identificador_sei)) between 1 and 255
  ),
  constraint marcadores_sei_cor_valido check (
    cor is null or cor ~ '^#[0-9A-Fa-f]{6}$'
  )
);

create table public.processos_marcadores_sei (
  usuario_id uuid not null references auth.users(id) on delete cascade,
  processo_id uuid not null,
  marcador_id uuid not null,
  visto_primeiro_em timestamptz not null default now(),
  visto_ultimo_em timestamptz not null default now(),
  ativa boolean not null default true,
  primary key (processo_id, marcador_id),
  constraint processos_marcadores_sei_processo_chave_estrangeira
    foreign key (usuario_id, processo_id)
    references public.processos_sei(usuario_id, id)
    on delete cascade,
  constraint processos_marcadores_sei_marcador_chave_estrangeira
    foreign key (usuario_id, marcador_id)
    references public.marcadores_sei(usuario_id, id)
    on delete cascade,
  constraint processos_marcadores_sei_datas_horas_valido check (visto_ultimo_em >= visto_primeiro_em)
);

create table public.eventos_sei (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  processo_id uuid not null,
  tipo_evento public.tipo_evento_sei not null,
  detectado_em timestamptz not null default now(),
  sincronizacao_id uuid not null,
  metadados jsonb not null default '{}'::jsonb,
  constraint eventos_sei_proprietario_processo_chave_estrangeira
    foreign key (usuario_id, processo_id)
    references public.processos_sei(usuario_id, id)
    on delete cascade,
  constraint eventos_sei_proprietario_sincronizacao_chave_estrangeira
    foreign key (usuario_id, sincronizacao_id)
    references public.execucoes_sincronizacao_sei(usuario_id, id)
    on delete cascade,
  constraint eventos_sei_metadados_objeto check (jsonb_typeof(metadados) = 'object')
);

create table public.estado_sincronizacao_sei (
  usuario_id uuid not null references auth.users(id) on delete cascade,
  unidade text not null,
  linha_base_estabelecida boolean not null default false,
  linha_base_estabelecida_em timestamptz,
  ultima_sincronizacao_bem_sucedida_id uuid,
  ultima_sincronizacao_aplicada_id uuid,
  atualizado_em timestamptz not null default now(),
  primary key (usuario_id, unidade),
  constraint estado_sincronizacao_ultima_bem_sucedida_chave_estrangeira
    foreign key (usuario_id, ultima_sincronizacao_bem_sucedida_id)
    references public.execucoes_sincronizacao_sei(usuario_id, id)
    on delete set null (ultima_sincronizacao_bem_sucedida_id),
  constraint estado_sincronizacao_ultima_aplicada_chave_estrangeira
    foreign key (usuario_id, ultima_sincronizacao_aplicada_id)
    references public.execucoes_sincronizacao_sei(usuario_id, id)
    on delete set null (ultima_sincronizacao_aplicada_id),
  constraint estado_sincronizacao_sei_unidade_valido check (
    char_length(btrim(unidade)) between 1 and 255
  ),
  constraint estado_sincronizacao_sei_linha_base_consistente check (
    linha_base_estabelecida or linha_base_estabelecida_em is null
  )
);

create index processos_sei_usuario_na_unidade_indice
  on public.processos_sei (usuario_id, na_unidade, visto_ultimo_em desc);
create index processos_sei_usuario_atribuido_indice
  on public.processos_sei (usuario_id, atribuido_a_mim, visto_ultimo_em desc)
  where atribuido_a_mim;
create index processos_sei_usuario_status_indice
  on public.processos_sei (usuario_id, status_crm, prioridade, data_prazo);
create index processos_sei_usuario_data_prazo_indice
  on public.processos_sei (usuario_id, data_prazo)
  where data_prazo is not null and status_crm <> 'FINALIZADO';
create index execucoes_sincronizacao_sei_usuario_iniciada_indice
  on public.execucoes_sincronizacao_sei (usuario_id, iniciada_em desc);
create index eventos_sei_usuario_detectado_indice
  on public.eventos_sei (usuario_id, detectado_em desc);
create index eventos_sei_processo_detectado_indice
  on public.eventos_sei (processo_id, detectado_em desc);
create index processos_marcadores_sei_usuario_ativa_indice
  on public.processos_marcadores_sei (usuario_id, marcador_id, processo_id)
  where ativa;

create function public.definir_atualizado_em()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.atualizado_em := clock_timestamp();
  return new;
end;
$$;

create trigger processos_sei_definir_atualizado_em
before update on public.processos_sei
for each row execute function public.definir_atualizado_em();

create trigger marcadores_sei_definir_atualizado_em
before update on public.marcadores_sei
for each row execute function public.definir_atualizado_em();

comment on table public.processos_sei is
  'Metadados minimos coletados do SEI e campos privados do CRM; nenhum documento e armazenado.';
comment on column public.execucoes_sincronizacao_sei.execucao_cliente_id is
  'Chave idempotente gerada pelo agente para uma tentativa logica de sincronizacao.';
comment on table public.estado_sincronizacao_sei is
  'Estado interno por usuario/unidade usado para criar linha_base sem avalanche de eventos.';
