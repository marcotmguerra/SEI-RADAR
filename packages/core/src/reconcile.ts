import {
  esquemaProcessosConhecidos,
  esquemaRetratoSincronizacao,
  type ProcessoConhecido,
  type ProcessoSincronizacao,
  type EntradaRetratoSincronizacao,
} from './schemas';

export type { ProcessoConhecido } from './schemas';

export type TipoEventoReconciliacao =
  | 'IDENTIFICADO_PRIMEIRA_VEZ'
  | 'ENTROU_NA_UNIDADE'
  | 'SAIU_DA_UNIDADE'
  | 'ATRIBUIDO_A_MIM'
  | 'ATRIBUICAO_REMOVIDA'
  | 'MARCADOR_ADICIONADO'
  | 'MARCADOR_REMOVIDO';

type TipoEventoProcesso = Exclude<TipoEventoReconciliacao, 'MARCADOR_ADICIONADO' | 'MARCADOR_REMOVIDO'>;
type TipoEventoMarcador = Extract<TipoEventoReconciliacao, 'MARCADOR_ADICIONADO' | 'MARCADOR_REMOVIDO'>;

export type EventoReconciliacao =
  | Readonly<{
      tipo: TipoEventoProcesso;
      numero: string;
    }>
  | Readonly<{
      tipo: TipoEventoMarcador;
      numero: string;
      marcador: string;
    }>;

export type ResultadoReconciliacao = Readonly<{
  processos: readonly ProcessoConhecido[];
  eventos: readonly EventoReconciliacao[];
}>;

const eventoProcesso = (tipo: TipoEventoProcesso, numero: string): EventoReconciliacao => ({
  tipo,
  numero,
});

const eventoMarcador = (
  tipo: TipoEventoMarcador,
  numero: string,
  marcador: string,
): EventoReconciliacao => ({ tipo, numero, marcador });

const eventosParaProcessoObservado = (
  anterior: ProcessoConhecido,
  observado: ProcessoSincronizacao,
  atribuicoesCompletas: boolean,
  marcadoresCompletos: boolean,
): readonly EventoReconciliacao[] => {
  const eventosAtribuicao: readonly EventoReconciliacao[] =
    !atribuicoesCompletas || anterior.atribuidoAMim === observado.atribuidoAMim
      ? []
      : [
          eventoProcesso(
            observado.atribuidoAMim ? 'ATRIBUIDO_A_MIM' : 'ATRIBUICAO_REMOVIDA',
            observado.numero,
          ),
        ];
  const marcadoresAnteriores = new Set(anterior.marcadores);
  const marcadoresObservados = new Set(observado.marcadores);
  const eventosMarcadoresAdicionados = marcadoresCompletos
    ? observado.marcadores
        .filter((marcador) => !marcadoresAnteriores.has(marcador))
        .map((marcador) => eventoMarcador('MARCADOR_ADICIONADO', observado.numero, marcador))
    : [];
  const eventosMarcadoresRemovidos = marcadoresCompletos
    ? anterior.marcadores
        .filter((marcador) => !marcadoresObservados.has(marcador))
        .map((marcador) => eventoMarcador('MARCADOR_REMOVIDO', observado.numero, marcador))
    : [];

  return [
    ...(anterior.naUnidade ? [] : [eventoProcesso('ENTROU_NA_UNIDADE', observado.numero)]),
    ...eventosAtribuicao,
    ...eventosMarcadoresAdicionados,
    ...eventosMarcadoresRemovidos,
  ];
};

const criarProcessoConhecidoObservado = (
  observado: ProcessoSincronizacao,
  anterior: ProcessoConhecido | undefined,
  atribuicoesCompletas: boolean,
  marcadoresCompletos: boolean,
): ProcessoConhecido => ({
  numero: observado.numero,
  naUnidade: true,
  atribuidoAMim: atribuicoesCompletas ? observado.atribuidoAMim : (anterior?.atribuidoAMim ?? false),
  contagemAusencias: 0,
  marcadores: marcadoresCompletos ? [...observado.marcadores] : [...(anterior?.marcadores ?? [])],
});

const reconciliarProcessoAusente = (
  anterior: ProcessoConhecido,
  completa: boolean,
): Readonly<{ processo: ProcessoConhecido; eventos: readonly EventoReconciliacao[] }> => {
  if (!completa || !anterior.naUnidade) {
    return {
      processo: { ...anterior, marcadores: [...anterior.marcadores] },
      eventos: [],
    };
  }

  const contagemAusencias = anterior.contagemAusencias + 1;
  const saiuDaUnidade = contagemAusencias >= 2;

  return {
    processo: {
      ...anterior,
      naUnidade: !saiuDaUnidade,
      contagemAusencias,
      marcadores: [...anterior.marcadores],
    },
    eventos: saiuDaUnidade ? [eventoProcesso('SAIU_DA_UNIDADE', anterior.numero)] : [],
  };
};

/**
 * Reconcilia uma coleta validada do SEI com o último estado conhecido.
 *
 * A função é pura: as entradas são interpretadas como cópias e cada processo
 * devolvido é um novo objeto. Retratos incompletos podem atualizar processos
 * observados, mas nunca contam ausência para SAIR_DA_UNIDADE.
 */
export const reconciliarRetrato = (
  entradaConhecidos: readonly ProcessoConhecido[],
  entradaRetrato: EntradaRetratoSincronizacao,
): ResultadoReconciliacao => {
  const conhecidos = esquemaProcessosConhecidos.parse(entradaConhecidos);
  const retrato = esquemaRetratoSincronizacao.parse(entradaRetrato);
  const observadosPorNumero = new Map(
    retrato.processos.map((processo) => [processo.numero, processo] as const),
  );

  const conhecidosReconciliados = conhecidos.map((anterior) => {
    const observado = observadosPorNumero.get(anterior.numero);

    if (observado === undefined) {
      return reconciliarProcessoAusente(anterior, retrato.completa);
    }

    return {
      processo: criarProcessoConhecidoObservado(
        observado,
        anterior,
        retrato.atribuicoesCompletas,
        retrato.marcadoresCompletos,
      ),
      eventos: eventosParaProcessoObservado(
        anterior,
        observado,
        retrato.atribuicoesCompletas,
        retrato.marcadoresCompletos,
      ),
    };
  });
  const numerosConhecidos = new Set(conhecidos.map(({ numero }) => numero));
  const novosProcessos = retrato.processos
    .filter(({ numero }) => !numerosConhecidos.has(numero))
    .map((observado) => ({
      processo: criarProcessoConhecidoObservado(
        observado,
        undefined,
        retrato.atribuicoesCompletas,
        retrato.marcadoresCompletos,
      ),
      eventos: [
        eventoProcesso('IDENTIFICADO_PRIMEIRA_VEZ', observado.numero),
        eventoProcesso('ENTROU_NA_UNIDADE', observado.numero),
        ...(retrato.atribuicoesCompletas && observado.atribuidoAMim
          ? [eventoProcesso('ATRIBUIDO_A_MIM', observado.numero)]
          : []),
        ...(retrato.marcadoresCompletos ? observado.marcadores : []).map((marcador) =>
          eventoMarcador('MARCADOR_ADICIONADO', observado.numero, marcador),
        ),
      ],
    }));
  const reconciliados = [...conhecidosReconciliados, ...novosProcessos];

  return {
    processos: reconciliados.map(({ processo }) => processo),
    eventos: reconciliados.flatMap(({ eventos }) => eventos),
  };
};
