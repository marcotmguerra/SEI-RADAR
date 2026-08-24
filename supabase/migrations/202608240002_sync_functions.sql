create function public.aplicar_retrato_sincronizacao(p_retrato jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_usuario_id uuid := auth.uid();
  v_execucao_cliente_id uuid;
  v_unidade text;
  v_status public.status_sincronizacao_sei;
  v_completa boolean;
  v_atribuicoes_completas boolean;
  v_marcadores_completos boolean;
  v_esperado integer;
  v_capturado integer;
  v_atribuicoes_esperadas integer;
  v_atribuicoes_capturadas integer;
  v_iniciada_em timestamptz;
  v_finalizada_em timestamptz;
  v_processos jsonb;
  v_hash_conteudo text;
  v_hash_existente text;
  v_resultado_existente jsonb;
  v_sincronizacao_id uuid;
  v_estado public.estado_sincronizacao_sei%rowtype;
  v_existente public.processos_sei%rowtype;
  v_item jsonb;
  v_numero text;
  v_processo_id uuid;
  v_atribuido boolean;
  v_atribuicao_observada boolean;
  v_marcadores jsonb;
  v_valor_marcador jsonb;
  v_identificador_marcador text;
  v_marcador_id uuid;
  v_marcador_estava_ativo boolean;
  v_registro_marcador record;
  v_era_linha_base boolean;
  v_eventos_criados integer := 0;
  v_processos_atualizados integer := 0;
  v_resultado jsonb;
  v_ultima_finalizada_em timestamptz;
begin
  if v_usuario_id is null then
    raise exception using
      errcode = '28000',
      message = 'autenticacao obrigatoria';
  end if;

  if p_retrato is null or jsonb_typeof(p_retrato) <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'retrato deve ser um objeto JSON';
  end if;

  begin
    v_execucao_cliente_id := (p_retrato ->> 'execucao_cliente_id')::uuid;
    v_status := (p_retrato ->> 'status')::public.status_sincronizacao_sei;
    v_completa := coalesce((p_retrato ->> 'completa')::boolean, false);
    v_atribuicoes_completas := coalesce(
      (p_retrato ->> 'atribuicoes_completas')::boolean,
      v_completa
    );
    v_marcadores_completos := coalesce(
      (p_retrato ->> 'marcadores_completos')::boolean,
      v_completa
    );
    v_esperado := (p_retrato ->> 'esperado')::integer;
    v_capturado := (p_retrato ->> 'capturado')::integer;
    v_atribuicoes_esperadas := (p_retrato ->> 'atribuicoes_esperadas')::integer;
    v_atribuicoes_capturadas := (p_retrato ->> 'atribuicoes_capturadas')::integer;
    v_iniciada_em := coalesce((p_retrato ->> 'iniciada_em')::timestamptz, now());
    v_finalizada_em := coalesce((p_retrato ->> 'finalizada_em')::timestamptz, now());
  exception
    when invalid_text_representation or datetime_field_overflow then
      raise exception using
        errcode = '22023',
        message = 'retrato contem UUID, enum, booleano, numero ou data invalido';
  end;

  v_unidade := btrim(p_retrato ->> 'unidade');
  v_processos := coalesce(p_retrato -> 'processos', '[]'::jsonb);

  if v_execucao_cliente_id is null then
    raise exception using errcode = '22023', message = 'execucao_cliente_id e obrigatorio';
  end if;
  if v_status is null then
    raise exception using errcode = '22023', message = 'status e obrigatorio';
  end if;
  if v_status = 'EM_EXECUCAO' then
    raise exception using errcode = '22023', message = 'status EM_EXECUCAO e reservado ao banco';
  end if;
  if v_unidade is null
     or char_length(v_unidade) not between 1 and 255
     or v_unidade ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'unidade deve ter entre 1 e 255 caracteres';
  end if;
  if jsonb_typeof(v_processos) <> 'array' then
    raise exception using errcode = '22023', message = 'processos deve ser um array';
  end if;
  if jsonb_array_length(v_processos) > 25000 then
    raise exception using errcode = '54000', message = 'retrato excede o limite de 25000 processos';
  end if;
  if pg_column_size(p_retrato) > 67108864 then
    raise exception using errcode = '54000', message = 'retrato excede o limite de 64 MiB';
  end if;
  if v_capturado is null or v_capturado < 0 or (v_esperado is not null and v_esperado < 0) then
    raise exception using errcode = '22023', message = 'contagens informadas devem ser inteiros nao negativos';
  end if;
  if jsonb_array_length(v_processos) > v_capturado then
    raise exception using errcode = '22023', message = 'processos nao pode exceder capturado';
  end if;
  if v_completa and v_capturado <> jsonb_array_length(v_processos) then
    raise exception using
      errcode = '22023',
      message = 'retrato completo exige todos os processos capturados no conteudo';
  end if;
  if v_esperado is not null and v_capturado > v_esperado then
    raise exception using errcode = '22023', message = 'capturado nao pode exceder esperado';
  end if;
  if v_status in ('SUCESSO', 'INCOMPLETA') and v_esperado is null then
    raise exception using
      errcode = '22023',
      message = 'esperado e obrigatorio para coletas SUCESSO ou INCOMPLETA';
  end if;
  if v_completa and (v_status <> 'SUCESSO' or v_esperado <> v_capturado) then
    raise exception using
      errcode = '22023',
      message = 'retrato completo exige status SUCESSO e esperado igual a capturado';
  end if;
  if v_status = 'SUCESSO' and not v_completa then
    raise exception using errcode = '22023', message = 'status SUCESSO exige completa=true';
  end if;
  if v_atribuicoes_completas and (
    v_atribuicoes_esperadas is not null
    or v_atribuicoes_capturadas is not null
  ) and (
    v_atribuicoes_esperadas is null
    or v_atribuicoes_capturadas is null
    or v_atribuicoes_esperadas < 0
    or v_atribuicoes_capturadas < 0
    or v_atribuicoes_esperadas <> v_atribuicoes_capturadas
  ) then
    raise exception using
      errcode = '22023',
      message = 'coleta completa de atribuicoes exige contagens validas e iguais';
  end if;
  if v_finalizada_em < v_iniciada_em then
    raise exception using errcode = '22023', message = 'finalizada_em nao pode anteceder iniciada_em';
  end if;
  if v_finalizada_em - v_iniciada_em > interval '24 hours' then
    raise exception using errcode = '22023', message = 'duracao da sincronizacao excede 24 horas';
  end if;
  if v_finalizada_em > clock_timestamp() + interval '24 hours' then
    raise exception using errcode = '22023', message = 'finalizada_em esta excessivamente no futuro';
  end if;
  if char_length(coalesce(p_retrato ->> 'mensagem_erro', '')) > 4000 then
    raise exception using errcode = '22023', message = 'mensagem_erro excede 4000 caracteres';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_processos) as item_processo(value)
    where jsonb_typeof(item_processo.value) <> 'object'
       or coalesce(item_processo.value ->> 'numero', '') !~
          '^[0-9]{4}\.[0-9]{2}\.[0-9]{6,10}/[0-9]{4}-[0-9]{2}$'
       or char_length(coalesce(item_processo.value ->> 'assunto', '')) > 2000
       or (
         item_processo.value ? 'url_sei'
         and item_processo.value ->> 'url_sei' is not null
         and (
           char_length(item_processo.value ->> 'url_sei') > 2048
           or item_processo.value ->> 'url_sei' !~* '^https?://'
         )
       )
  ) then
    raise exception using errcode = '22023', message = 'processo contem campos invalidos';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_processos) as item_processo(value)
    where item_processo.value ? 'atribuido_a_mim'
      and jsonb_typeof(item_processo.value -> 'atribuido_a_mim') <> 'boolean'
  ) then
    raise exception using errcode = '22023', message = 'atribuido_a_mim deve ser booleano';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_processos) as item_processo(value)
    where item_processo.value ? 'marcadores'
      and jsonb_typeof(item_processo.value -> 'marcadores') <> 'array'
  ) then
    raise exception using errcode = '22023', message = 'marcadores deve ser um array';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_processos) as item_processo(value)
    where jsonb_array_length(coalesce(item_processo.value -> 'marcadores', '[]')) > 1000
  ) then
    raise exception using errcode = '54000', message = 'processo excede o limite de 1000 marcadores';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_processos) as item_processo(value)
    cross join lateral jsonb_array_elements(coalesce(item_processo.value -> 'marcadores', '[]')) marcador(value)
    where jsonb_typeof(marcador.value) <> 'string'
       or char_length(btrim(marcador.value #>> '{}')) not between 1 and 200
  ) then
    raise exception using errcode = '22023', message = 'marcador deve ser texto de 1 a 200 caracteres';
  end if;

  if (
    select count(*)
    from jsonb_array_elements(v_processos) as item_processo(value)
    cross join lateral jsonb_array_elements(coalesce(item_processo.value -> 'marcadores', '[]')) marcador(value)
  ) > 100000 then
    raise exception using errcode = '54000', message = 'retrato excede o limite total de marcadores';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_processos) as item_processo(value)
    cross join lateral jsonb_array_elements(coalesce(item_processo.value -> 'marcadores', '[]')) marcador(value)
    group by item_processo.value ->> 'numero', btrim(marcador.value #>> '{}')
    having count(*) > 1
  ) then
    raise exception using errcode = '22023', message = 'processo contem marcadores duplicados';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_processos) as item_processo(value)
    group by item_processo.value ->> 'numero'
    having count(*) > 1
  ) then
    raise exception using errcode = '22023', message = 'retrato contem numeros de processo duplicados';
  end if;

  v_hash_conteudo := encode(
    extensions.digest(convert_to(p_retrato::text, 'UTF8'), 'sha256'),
    'hex'
  );

  insert into public.execucoes_sincronizacao_sei (
    usuario_id,
    execucao_cliente_id,
    unidade,
    iniciada_em,
    finalizada_em,
    status,
    processos_esperados,
    processos_capturados,
    atribuicoes_esperadas,
    atribuicoes_capturadas,
    completa,
    atribuicoes_completas,
    marcadores_completos,
    mensagem_erro,
    duracao_ms,
    hash_conteudo
  ) values (
    v_usuario_id,
    v_execucao_cliente_id,
    v_unidade,
    v_iniciada_em,
    v_finalizada_em,
    v_status,
    v_esperado,
    v_capturado,
    v_atribuicoes_esperadas,
    v_atribuicoes_capturadas,
    v_completa,
    v_atribuicoes_completas,
    v_marcadores_completos,
    nullif(p_retrato ->> 'mensagem_erro', ''),
    floor(extract(epoch from (v_finalizada_em - v_iniciada_em)) * 1000)::integer,
    v_hash_conteudo
  )
  on conflict (usuario_id, execucao_cliente_id) do nothing
  returning id into v_sincronizacao_id;

  if v_sincronizacao_id is null then
    select hash_conteudo, resultado
      into v_hash_existente, v_resultado_existente
    from public.execucoes_sincronizacao_sei
    where usuario_id = v_usuario_id
      and execucao_cliente_id = v_execucao_cliente_id;

    if v_hash_existente <> v_hash_conteudo then
      raise exception using
        errcode = '22023',
        message = 'execucao_cliente_id ja usado com outro conteudo';
    end if;
    if v_resultado_existente is null then
      raise exception using
        errcode = '55000',
        message = 'sincronizacao idempotente ainda nao foi concluida';
    end if;
    return v_resultado_existente || jsonb_build_object('idempotente', true);
  end if;

  insert into public.estado_sincronizacao_sei (usuario_id, unidade)
  values (v_usuario_id, v_unidade)
  on conflict (usuario_id, unidade) do nothing;

  select *
    into v_estado
  from public.estado_sincronizacao_sei
  where usuario_id = v_usuario_id and unidade = v_unidade
  for update;

  if v_estado.ultima_sincronizacao_aplicada_id is not null then
    select finalizada_em
      into v_ultima_finalizada_em
    from public.execucoes_sincronizacao_sei
    where id = v_estado.ultima_sincronizacao_aplicada_id;

    if v_finalizada_em < v_ultima_finalizada_em then
      raise exception using
        errcode = '22023',
        message = 'retrato e anterior ao ultimo retrato aplicado';
    end if;
  end if;

  v_era_linha_base := not v_estado.linha_base_estabelecida;

  if v_status in ('SESSAO_EXPIRADA', 'ERRO_LAYOUT_COLETOR', 'ERRO') then
    v_resultado := jsonb_build_object(
      'sincronizacao_id', v_sincronizacao_id,
      'idempotente', false,
      'linha_base', false,
      'eventos_criados', 0,
      'processos_atualizados', 0
    );
    update public.execucoes_sincronizacao_sei set resultado = v_resultado where id = v_sincronizacao_id;
    return v_resultado;
  end if;

  for v_item in
    select value from jsonb_array_elements(v_processos)
  loop
    v_numero := v_item ->> 'numero';
    v_atribuicao_observada := v_atribuicoes_completas and v_item ? 'atribuido_a_mim';
    v_atribuido := case
      when v_atribuicao_observada then (v_item ->> 'atribuido_a_mim')::boolean
      else false
    end;

    select *
      into v_existente
    from public.processos_sei
    where usuario_id = v_usuario_id
      and unidade = v_unidade
      and numero = v_numero
    for update;

    if not found then
      insert into public.processos_sei (
        usuario_id,
        numero,
        assunto,
        url_sei,
        unidade,
        visto_primeiro_em,
        visto_ultimo_em,
        na_unidade,
        atribuido_a_mim,
        contagem_ausencias
      ) values (
        v_usuario_id,
        v_numero,
        nullif(btrim(v_item ->> 'assunto'), ''),
        nullif(btrim(v_item ->> 'url_sei'), ''),
        v_unidade,
        v_finalizada_em,
        v_finalizada_em,
        true,
        v_atribuido,
        0
      )
      returning id into v_processo_id;

      if not v_era_linha_base then
        insert into public.eventos_sei (usuario_id, processo_id, tipo_evento, detectado_em, sincronizacao_id)
        values (v_usuario_id, v_processo_id, 'IDENTIFICADO_PRIMEIRA_VEZ', v_finalizada_em, v_sincronizacao_id);
        v_eventos_criados := v_eventos_criados + 1;

        insert into public.eventos_sei (usuario_id, processo_id, tipo_evento, detectado_em, sincronizacao_id)
        values (v_usuario_id, v_processo_id, 'ENTROU_NA_UNIDADE', v_finalizada_em, v_sincronizacao_id);
        v_eventos_criados := v_eventos_criados + 1;

        if v_atribuido then
          insert into public.eventos_sei (usuario_id, processo_id, tipo_evento, detectado_em, sincronizacao_id)
          values (v_usuario_id, v_processo_id, 'ATRIBUIDO_A_MIM', v_finalizada_em, v_sincronizacao_id);
          v_eventos_criados := v_eventos_criados + 1;
        end if;
      end if;
    else
      v_processo_id := v_existente.id;

      update public.processos_sei
      set assunto = coalesce(nullif(btrim(v_item ->> 'assunto'), ''), assunto),
          url_sei = coalesce(nullif(btrim(v_item ->> 'url_sei'), ''), url_sei),
          visto_ultimo_em = greatest(visto_ultimo_em, v_finalizada_em),
          na_unidade = true,
          contagem_ausencias = 0,
          atribuido_a_mim = case
            when v_atribuicao_observada then v_atribuido
            else atribuido_a_mim
          end
      where id = v_processo_id;

      if not v_era_linha_base and not v_existente.na_unidade then
        insert into public.eventos_sei (usuario_id, processo_id, tipo_evento, detectado_em, sincronizacao_id)
        values (v_usuario_id, v_processo_id, 'ENTROU_NA_UNIDADE', v_finalizada_em, v_sincronizacao_id);
        v_eventos_criados := v_eventos_criados + 1;
      end if;

      if not v_era_linha_base
         and v_atribuicao_observada
         and v_existente.atribuido_a_mim is distinct from v_atribuido then
        insert into public.eventos_sei (usuario_id, processo_id, tipo_evento, detectado_em, sincronizacao_id)
        values (
          v_usuario_id,
          v_processo_id,
          (
            case
              when v_atribuido then 'ATRIBUIDO_A_MIM'
              else 'ATRIBUICAO_REMOVIDA'
            end
          )::public.tipo_evento_sei,
          v_finalizada_em,
          v_sincronizacao_id
        );
        v_eventos_criados := v_eventos_criados + 1;
      end if;
    end if;

    v_processos_atualizados := v_processos_atualizados + 1;
    v_marcadores := coalesce(v_item -> 'marcadores', '[]'::jsonb);

    if v_marcadores_completos and v_item ? 'marcadores' then
      for v_valor_marcador in
        select value from jsonb_array_elements(v_marcadores)
      loop
        v_identificador_marcador := btrim(v_valor_marcador #>> '{}');

        insert into public.marcadores_sei (usuario_id, nome, identificador_sei)
        values (v_usuario_id, v_identificador_marcador, v_identificador_marcador)
        on conflict (usuario_id, identificador_sei)
        do update set nome = excluded.nome
        returning id into v_marcador_id;

        select ativa
          into v_marcador_estava_ativo
        from public.processos_marcadores_sei
        where processo_id = v_processo_id and marcador_id = v_marcador_id;

        insert into public.processos_marcadores_sei (
          usuario_id,
          processo_id,
          marcador_id,
          visto_primeiro_em,
          visto_ultimo_em,
          ativa
        ) values (
          v_usuario_id,
          v_processo_id,
          v_marcador_id,
          v_finalizada_em,
          v_finalizada_em,
          true
        )
        on conflict (processo_id, marcador_id)
        do update set
          visto_ultimo_em = excluded.visto_ultimo_em,
          ativa = true;

        if not v_era_linha_base and coalesce(v_marcador_estava_ativo, false) = false then
          insert into public.eventos_sei (
            usuario_id, processo_id, tipo_evento, detectado_em, sincronizacao_id, metadados
          ) values (
            v_usuario_id,
            v_processo_id,
            'MARCADOR_ADICIONADO',
            v_finalizada_em,
            v_sincronizacao_id,
            jsonb_build_object('marcador_id', v_marcador_id, 'marcador', v_identificador_marcador)
          );
          v_eventos_criados := v_eventos_criados + 1;
        end if;
      end loop;

      for v_registro_marcador in
        select pm.marcador_id, m.nome
        from public.processos_marcadores_sei pm
        join public.marcadores_sei m on m.id = pm.marcador_id
        where pm.processo_id = v_processo_id
          and pm.ativa
          and not exists (
            select 1
            from jsonb_array_elements(v_marcadores) marcador_atual(value)
            where btrim(marcador_atual.value #>> '{}') = m.identificador_sei
          )
      loop
        update public.processos_marcadores_sei
        set ativa = false,
            visto_ultimo_em = v_finalizada_em
        where processo_id = v_processo_id
          and marcador_id = v_registro_marcador.marcador_id;

        if not v_era_linha_base then
          insert into public.eventos_sei (
            usuario_id, processo_id, tipo_evento, detectado_em, sincronizacao_id, metadados
          ) values (
            v_usuario_id,
            v_processo_id,
            'MARCADOR_REMOVIDO',
            v_finalizada_em,
            v_sincronizacao_id,
            jsonb_build_object(
              'marcador_id', v_registro_marcador.marcador_id,
              'marcador', v_registro_marcador.nome
            )
          );
          v_eventos_criados := v_eventos_criados + 1;
        end if;
      end loop;
    end if;
  end loop;

  if v_completa then
    for v_existente in
      select p.*
      from public.processos_sei p
      where p.usuario_id = v_usuario_id
        and p.unidade = v_unidade
        and p.na_unidade
        and not exists (
          select 1
          from jsonb_array_elements(v_processos) item_processo(value)
          where item_processo.value ->> 'numero' = p.numero
        )
      for update
    loop
      update public.processos_sei
      set contagem_ausencias = least(contagem_ausencias + 1, 2),
          na_unidade = case when contagem_ausencias >= 1 then false else na_unidade end,
          atribuido_a_mim = case
            when contagem_ausencias >= 1 and v_atribuicoes_completas then false
            else atribuido_a_mim
          end
      where id = v_existente.id;

      if not v_era_linha_base and v_existente.contagem_ausencias = 1 then
        insert into public.eventos_sei (usuario_id, processo_id, tipo_evento, detectado_em, sincronizacao_id)
        values (v_usuario_id, v_existente.id, 'SAIU_DA_UNIDADE', v_finalizada_em, v_sincronizacao_id);
        v_eventos_criados := v_eventos_criados + 1;

        if v_atribuicoes_completas and v_existente.atribuido_a_mim then
          insert into public.eventos_sei (usuario_id, processo_id, tipo_evento, detectado_em, sincronizacao_id)
          values (v_usuario_id, v_existente.id, 'ATRIBUICAO_REMOVIDA', v_finalizada_em, v_sincronizacao_id);
          v_eventos_criados := v_eventos_criados + 1;
        end if;
      end if;
    end loop;

    update public.estado_sincronizacao_sei
    set linha_base_estabelecida = true,
        linha_base_estabelecida_em = coalesce(linha_base_estabelecida_em, v_finalizada_em),
        ultima_sincronizacao_bem_sucedida_id = v_sincronizacao_id,
        ultima_sincronizacao_aplicada_id = v_sincronizacao_id,
        atualizado_em = now()
    where usuario_id = v_usuario_id and unidade = v_unidade;
  end if;

  if not v_completa then
    update public.estado_sincronizacao_sei
    set ultima_sincronizacao_aplicada_id = v_sincronizacao_id,
        atualizado_em = now()
    where usuario_id = v_usuario_id and unidade = v_unidade;
  end if;

  v_resultado := jsonb_build_object(
    'sincronizacao_id', v_sincronizacao_id,
    'idempotente', false,
    'linha_base', v_completa and v_era_linha_base,
    'eventos_criados', v_eventos_criados,
    'processos_atualizados', v_processos_atualizados
  );

  update public.execucoes_sincronizacao_sei
  set resultado = v_resultado
  where id = v_sincronizacao_id;

  return v_resultado;
end;
$$;

comment on function public.aplicar_retrato_sincronizacao(jsonb) is
  'Aplica atomicamente um retrato autenticado. execucao_cliente_id garante idempotencia; apenas retratos completos contam ausencias.';

create function public.atualizar_processo_crm(
  p_processo_id uuid,
  p_status_crm public.status_processo_crm default null,
  p_prioridade public.prioridade_crm default null,
  p_data_prazo date default null,
  p_observacoes text default null,
  p_limpar_data_prazo boolean default false,
  p_limpar_observacoes boolean default false
)
returns public.processos_sei
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_usuario_id uuid := auth.uid();
  v_processo public.processos_sei%rowtype;
begin
  if v_usuario_id is null then
    raise exception using errcode = '28000', message = 'autenticacao obrigatoria';
  end if;
  if p_processo_id is null then
    raise exception using
      errcode = '22023',
      message = 'processo_id e obrigatorio';
  end if;
  if p_observacoes is not null and char_length(p_observacoes) > 10000 then
    raise exception using errcode = '22023', message = 'observacoes excede 10000 caracteres';
  end if;

  update public.processos_sei
  set status_crm = coalesce(p_status_crm, status_crm),
      prioridade = coalesce(p_prioridade, prioridade),
      data_prazo = case
        when p_limpar_data_prazo then null
        else coalesce(p_data_prazo, data_prazo)
      end,
      observacoes = case
        when p_limpar_observacoes then null
        else coalesce(nullif(p_observacoes, ''), observacoes)
      end
  where id = p_processo_id
    and usuario_id = v_usuario_id
  returning * into v_processo;

  if not found then
    raise exception using errcode = 'P0002', message = 'processo nao encontrado';
  end if;

  return v_processo;
end;
$$;

comment on function public.atualizar_processo_crm(
  uuid,
  public.status_processo_crm,
  public.prioridade_crm,
  date,
  text,
  boolean,
  boolean
) is 'Atualiza somente status, prioridade, prazo e observacoes do CRM para um processo do usuario autenticado.';
