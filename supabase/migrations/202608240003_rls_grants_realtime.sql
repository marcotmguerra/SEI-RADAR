revoke create on schema public from public, anon, authenticated;

alter table public.processos_sei enable row level security;
alter table public.marcadores_sei enable row level security;
alter table public.processos_marcadores_sei enable row level security;
alter table public.eventos_sei enable row level security;
alter table public.execucoes_sincronizacao_sei enable row level security;
alter table public.estado_sincronizacao_sei enable row level security;

create policy processos_sei_selecionar_proprios
on public.processos_sei
for select
to authenticated
using ((select auth.uid()) = usuario_id);

create policy marcadores_sei_selecionar_proprios
on public.marcadores_sei
for select
to authenticated
using ((select auth.uid()) = usuario_id);

create policy processos_marcadores_sei_selecionar_proprios
on public.processos_marcadores_sei
for select
to authenticated
using ((select auth.uid()) = usuario_id);

create policy eventos_sei_selecionar_proprios
on public.eventos_sei
for select
to authenticated
using ((select auth.uid()) = usuario_id);

create policy execucoes_sincronizacao_sei_selecionar_proprios
on public.execucoes_sincronizacao_sei
for select
to authenticated
using ((select auth.uid()) = usuario_id);

-- estado_sincronizacao_sei e uma tabela interna. RLS permanece habilitada sem politica de API.

revoke all on table public.processos_sei from anon, authenticated;
revoke all on table public.marcadores_sei from anon, authenticated;
revoke all on table public.processos_marcadores_sei from anon, authenticated;
revoke all on table public.eventos_sei from anon, authenticated;
revoke all on table public.execucoes_sincronizacao_sei from anon, authenticated;
revoke all on table public.estado_sincronizacao_sei from anon, authenticated;

grant select on table public.processos_sei to authenticated;
grant select on table public.marcadores_sei to authenticated;
grant select on table public.processos_marcadores_sei to authenticated;
grant select on table public.eventos_sei to authenticated;
grant select on table public.execucoes_sincronizacao_sei to authenticated;

revoke all on function public.definir_atualizado_em() from public, anon, authenticated;
revoke all on function public.aplicar_retrato_sincronizacao(jsonb) from public, anon;
revoke all on function public.atualizar_processo_crm(
  uuid,
  public.status_processo_crm,
  public.prioridade_crm,
  date,
  text,
  boolean,
  boolean
) from public, anon;

grant execute on function public.aplicar_retrato_sincronizacao(jsonb) to authenticated;
grant execute on function public.atualizar_processo_crm(
  uuid,
  public.status_processo_crm,
  public.prioridade_crm,
  date,
  text,
  boolean,
  boolean
) to authenticated;

grant usage on type public.status_processo_crm to authenticated;
grant usage on type public.prioridade_crm to authenticated;
grant usage on type public.status_sincronizacao_sei to authenticated;
grant usage on type public.tipo_evento_sei to authenticated;

alter table public.processos_sei replica identity full;
alter table public.marcadores_sei replica identity full;
alter table public.processos_marcadores_sei replica identity full;
alter table public.eventos_sei replica identity full;
alter table public.execucoes_sincronizacao_sei replica identity full;

do $$
declare
  v_tabela text;
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    foreach v_tabela in array array[
      'processos_sei',
      'marcadores_sei',
      'processos_marcadores_sei',
      'eventos_sei',
      'execucoes_sincronizacao_sei'
    ]
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
