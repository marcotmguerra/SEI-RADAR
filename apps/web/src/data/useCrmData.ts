import { useCallback, useEffect, useRef, useState } from 'react';
import { eventosDemonstracao, processosDemonstracao, execucoesSincronizacaoDemonstracao } from './demo';
import { coletarPaginas } from './pagination';
import { supabase } from '../lib/supabase';
import { exibirNotificacaoFilaUmaVez } from '../lib/notifications';
import { obterUrlSeiSegura } from '../lib/urls';
import type { AtualizacaoProcessoCrm, StatusCrm, RegistroProcesso, EventoSei, ExecucaoSincronizacao } from '../types';

interface DadosCrm {
  readonly processos: readonly RegistroProcesso[];
  readonly execucoesSincronizacao: readonly ExecucaoSincronizacao[];
  readonly eventos: readonly EventoSei[];
  readonly carregando: boolean;
  readonly erro: string | null;
  readonly modoDemonstracao: boolean;
  readonly atualizarStatus: (id: string, status: StatusCrm) => Promise<void>;
  readonly atualizarProcesso: (id: string, atualizacao: AtualizacaoProcessoCrm) => Promise<void>;
  readonly atualizarDados: () => Promise<void>;
}

const mapearProcesso = (registro: Record<string, unknown>): RegistroProcesso => ({
  id: String(registro.id), numero: String(registro.numero), assunto: registro.assunto ? String(registro.assunto) : null,
  unidade: String(registro.unidade ?? 'Sem unidade'),
  urlSei: obterUrlSeiSegura(registro.url_sei, import.meta.env.VITE_ORIGEM_SEI_PERMITIDA as string | undefined),
  naUnidade: Boolean(registro.na_unidade), atribuidoAMim: Boolean(registro.atribuido_a_mim),
  statusCrm: registro.status_crm as StatusCrm, prioridade: registro.prioridade as RegistroProcesso['prioridade'],
  dataPrazo: registro.data_prazo ? String(registro.data_prazo) : null,
  observacoes: registro.observacoes ? String(registro.observacoes) : null,
  marcadores: Array.isArray(registro.processos_marcadores_sei)
    ? registro.processos_marcadores_sei.flatMap((relacao) => {
        const itemRelacao = relacao as { ativa?: boolean; marcadores_sei?: { nome?: string } | null };
        return itemRelacao.ativa && itemRelacao.marcadores_sei?.nome ? [itemRelacao.marcadores_sei.nome] : [];
      })
    : [],
  vistoPrimeiroEm: String(registro.visto_primeiro_em), vistoUltimoEm: String(registro.visto_ultimo_em),
});

const mapearSincronizacao = (registro: Record<string, unknown>): ExecucaoSincronizacao => ({
  id: String(registro.id), status: registro.status as ExecucaoSincronizacao['status'], iniciadaEm: String(registro.iniciada_em),
  finalizadaEm: registro.finalizada_em ? String(registro.finalizada_em) : null,
  processosEsperados: typeof registro.processos_esperados === 'number' ? registro.processos_esperados : null,
  processosCapturados: Number(registro.processos_capturados ?? 0),
  mensagemErro: registro.mensagem_erro ? String(registro.mensagem_erro) : null,
});

export function useDadosCrm(): DadosCrm {
  const [processos, definirProcessos] = useState<readonly RegistroProcesso[]>(processosDemonstracao);
  const [execucoesSincronizacao, definirExecucoesSincronizacao] = useState<readonly ExecucaoSincronizacao[]>(execucoesSincronizacaoDemonstracao);
  const [eventos, definirEventos] = useState<readonly EventoSei[]>(eventosDemonstracao);
  const [carregando, definirCarregando] = useState(Boolean(supabase));
  const [erro, definirErro] = useState<string | null>(null);
  const temporizadorTempoReal = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sequenciaAtualizacao = useRef(0);

  const atualizarDados = useCallback(async () => {
    if (!supabase) return;
    const cliente = supabase;
    const sequencia = ++sequenciaAtualizacao.current;
    definirCarregando(true);
    const [resultadoProcessos, resultadoSincronizacoes, resultadoEventos, resultadoFila] = await Promise.all([
      coletarPaginas((inicio, fim) => cliente.from('processos_sei')
        .select('*, processos_marcadores_sei(ativa, marcadores_sei(nome))')
        .order('visto_ultimo_em', { ascending: false })
        .range(inicio, fim)),
      cliente.from('execucoes_sincronizacao_sei').select('*').order('iniciada_em', { ascending: false }).limit(50),
      cliente.from('eventos_sei').select('id,processo_id,tipo_evento,detectado_em,processos_sei(numero)').order('detectado_em', { ascending: false }).limit(100),
      cliente.from('fila_notificacoes').select('chave_deduplicacao,conteudo,status,criado_em')
        .in('status', ['PENDENTE', 'PROCESSANDO', 'FALHOU'])
        .order('criado_em', { ascending: false }).limit(100),
    ]);
    if (sequencia !== sequenciaAtualizacao.current) return;
    const primeiroErro = resultadoProcessos.error ?? resultadoSincronizacoes.error ?? resultadoEventos.error;
    if (primeiroErro) {
      definirErro('Não foi possível carregar os dados. Tente novamente.');
    } else {
      definirProcessos((resultadoProcessos.data ?? []).map((registro) => mapearProcesso(registro)));
      definirExecucoesSincronizacao((resultadoSincronizacoes.data ?? []).map((registro) => mapearSincronizacao(registro)));
      definirEventos((resultadoEventos.data ?? []).map((registro) => {
        const processoRelacionado = registro.processos_sei as unknown as { numero?: string } | null;
        return { id: String(registro.id), processoId: registro.processo_id ? String(registro.processo_id) : null,
          numeroProcesso: processoRelacionado?.numero ?? null, tipoEvento: String(registro.tipo_evento), detectadoEm: String(registro.detectado_em) };
      }));
      for (const registro of [...(resultadoFila.data ?? [])].reverse()) {
        void exibirNotificacaoFilaUmaVez(registro);
      }
      definirErro(null);
    }
    definirCarregando(false);
  }, []);

  const agendarAtualizacao = useCallback(() => {
    if (temporizadorTempoReal.current) clearTimeout(temporizadorTempoReal.current);
    temporizadorTempoReal.current = setTimeout(() => {
      temporizadorTempoReal.current = null;
      void atualizarDados();
    }, 250);
  }, [atualizarDados]);

  useEffect(() => {
    void atualizarDados();
    if (!supabase) return;
    const cliente = supabase;
    const canal = cliente.channel('crm-tempo-real')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'processos_sei' }, agendarAtualizacao)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'eventos_sei' }, agendarAtualizacao)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'execucoes_sincronizacao_sei' }, agendarAtualizacao)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'fila_notificacoes' }, (carga) => void exibirNotificacaoFilaUmaVez(carga.new))
      .subscribe();
    return () => {
      if (temporizadorTempoReal.current) clearTimeout(temporizadorTempoReal.current);
      void cliente.removeChannel(canal);
    };
  }, [agendarAtualizacao, atualizarDados]);

  const atualizarStatus = useCallback(async (id: string, status: StatusCrm) => {
    definirProcessos((atuais) => atuais.map((processo) => processo.id === id ? { ...processo, statusCrm: status } : processo));
    if (!supabase) return;
    const { error: erroRpc } = await supabase.rpc('atualizar_processo_crm', {
      p_processo_id: id, p_status_crm: status,
    });
    if (erroRpc) {
      await atualizarDados();
      definirErro('Não foi possível atualizar o status do processo.');
    }
  }, [atualizarDados]);

  const atualizarProcesso = useCallback(async (id: string, atualizacao: AtualizacaoProcessoCrm) => {
    definirProcessos((atuais) => atuais.map((processo) => processo.id === id ? { ...processo, ...atualizacao } : processo));
    if (!supabase) return;
    const { error: erroRpc } = await supabase.rpc('atualizar_processo_crm', {
      p_processo_id: id, p_status_crm: atualizacao.statusCrm, p_prioridade: atualizacao.prioridade,
      p_data_prazo: atualizacao.dataPrazo, p_observacoes: atualizacao.observacoes,
      p_limpar_data_prazo: atualizacao.dataPrazo === null, p_limpar_observacoes: atualizacao.observacoes === null,
    });
    if (erroRpc) {
      await atualizarDados();
      definirErro('Não foi possível salvar o acompanhamento do processo.');
    }
  }, [atualizarDados]);

  return { processos, execucoesSincronizacao, eventos, carregando, erro, modoDemonstracao: !supabase, atualizarStatus, atualizarProcesso, atualizarDados };
}
