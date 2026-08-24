import type { NumeroProcesso } from '@crm-sei/core';
import type { FontePaginaProcessos } from '../browser/collector';
import { coletarTodasPaginas } from '../browser/collector';
import { ErroSessaoExpirada, ErroLayout } from '../browser/errors';

export type StatusSincronizacaoAgente =
  | 'SUCESSO'
  | 'INCOMPLETA'
  | 'SESSAO_EXPIRADA'
  | 'ERRO_LAYOUT_COLETOR'
  | 'ERRO';

export interface EnvioSincronizacaoAgente extends Record<string, unknown> {
  readonly instalacao_id: string;
  readonly token_instalacao: string;
  readonly execucao_cliente_id: string;
  readonly unidade: string;
  readonly iniciada_em: string;
  readonly finalizada_em: string;
  readonly status: StatusSincronizacaoAgente;
  readonly completa: boolean;
  readonly esperado: number | null;
  readonly capturado: number;
  readonly atribuicoes_esperadas: number | null;
  readonly atribuicoes_capturadas: number;
  readonly atribuicoes_completas: boolean;
  readonly marcadores_completos: boolean;
  readonly processos: readonly {
    readonly numero: NumeroProcesso;
    readonly atribuido_a_mim?: boolean;
    readonly marcadores?: readonly string[];
  }[];
}

export interface SessaoNavegadorSincronizacao {
  readonly fonte: FontePaginaProcessos;
  readonly fonteAtribuidos?: FontePaginaProcessos;
  readonly fontesMarcadores?: Readonly<Record<string, FontePaginaProcessos>>;
  fechar(): Promise<void>;
}

export interface DependenciasExecutarSincronizacao {
  readonly unidade: string;
  readonly urlControle: string;
  readonly instalacaoId: string;
  readonly tokenInstalacao: string;
  readonly maximoPaginas?: number;
  abrirNavegador(): Promise<SessaoNavegadorSincronizacao>;
  enviar(retrato: EnvioSincronizacaoAgente): Promise<unknown>;
  agora?: () => Date;
  id?: () => string;
}

interface EstadoColeta {
  status: StatusSincronizacaoAgente;
  completa: boolean;
  esperado: number | null;
  capturado: number;
  processos: readonly NumeroProcesso[];
}

interface EstadoColetaOpcional {
  readonly completa: boolean;
  readonly esperado: number | null;
  readonly capturado: number;
  readonly processos: readonly NumeroProcesso[];
}

const coletaComFalha = (status: StatusSincronizacaoAgente): EstadoColeta => ({
  status,
  completa: false,
  esperado: null,
  capturado: 0,
  processos: [],
});

const classificarErro = (erro: unknown): StatusSincronizacaoAgente => {
  if (erro instanceof ErroSessaoExpirada) return 'SESSAO_EXPIRADA';
  if (erro instanceof ErroLayout) return 'ERRO_LAYOUT_COLETOR';
  return 'ERRO';
};

const coletarSecaoOpcional = async (
  fonte: FontePaginaProcessos | undefined,
  maximoPaginas: number | undefined,
): Promise<EstadoColetaOpcional> => {
  if (fonte === undefined) {
    return { completa: false, esperado: null, capturado: 0, processos: [] };
  }
  try {
    const resultado = await coletarTodasPaginas(fonte, maximoPaginas === undefined ? {} : { maximoPaginas });
    return {
      completa: resultado.status === 'SUCESSO',
      esperado: resultado.esperado,
      capturado: resultado.capturado,
      processos: resultado.processos,
    };
  } catch {
    return { completa: false, esperado: null, capturado: 0, processos: [] };
  }
};

interface EstadoColetaMarcadores {
  readonly completa: boolean;
  readonly processosPorMarcador: ReadonlyMap<string, readonly NumeroProcesso[]>;
}

const coletarSecoesMarcadores = async (
  fontes: Readonly<Record<string, FontePaginaProcessos>> | undefined,
  maximoPaginas: number | undefined,
): Promise<EstadoColetaMarcadores> => {
  if (fontes === undefined || Object.keys(fontes).length === 0) {
    return { completa: false, processosPorMarcador: new Map() };
  }
  const resultados = await Promise.all(
    Object.entries(fontes).map(async ([nome, fonte]) => [
      nome,
      await coletarSecaoOpcional(fonte, maximoPaginas),
    ] as const),
  );
  if (resultados.some(([, resultado]) => !resultado.completa)) {
    return { completa: false, processosPorMarcador: new Map() };
  }
  return {
    completa: true,
    processosPorMarcador: new Map(resultados.map(([nome, resultado]) => [nome, resultado.processos])),
  };
};

const mesclarProcessos = (
  numeros: readonly NumeroProcesso[],
  atribuicoes: EstadoColetaOpcional,
  marcadores: EstadoColetaMarcadores,
): EnvioSincronizacaoAgente['processos'] => {
  const atribuidos = new Set(atribuicoes.processos);
  const marcadoresPorProcesso = new Map<NumeroProcesso, string[]>();
  if (marcadores.completa) {
    for (const numero of numeros) marcadoresPorProcesso.set(numero, []);
    for (const [nome, processosMarcados] of marcadores.processosPorMarcador) {
      for (const numero of processosMarcados) {
        const marcadoresProcesso = marcadoresPorProcesso.get(numero);
        if (marcadoresProcesso !== undefined) {
          marcadoresPorProcesso.set(numero, [...marcadoresProcesso, nome]);
        }
      }
    }
  }
  return Object.freeze(
    numeros.map((numero) =>
      Object.freeze({
        numero,
        ...(atribuicoes.completa ? { atribuido_a_mim: atribuidos.has(numero) } : {}),
        ...(marcadores.completa ? { marcadores: Object.freeze(marcadoresPorProcesso.get(numero) ?? []) } : {}),
      }),
    ),
  );
};

export const executarSincronizacao = async (
  dependencias: DependenciasExecutarSincronizacao,
): Promise<EnvioSincronizacaoAgente> => {
  const agora = dependencias.agora ?? (() => new Date());
  const id = dependencias.id ?? (() => crypto.randomUUID());
  const iniciadaEm = agora();
  let sessao: SessaoNavegadorSincronizacao | undefined;
  let coleta: EstadoColeta = coletaComFalha('ERRO');
  let atribuicoes: EstadoColetaOpcional = {
    completa: false,
    esperado: null,
    capturado: 0,
    processos: [],
  };
  let marcadores: EstadoColetaMarcadores = { completa: false, processosPorMarcador: new Map() };

  try {
    sessao = await dependencias.abrirNavegador();
    const resultado = await coletarTodasPaginas(
      sessao.fonte,
      dependencias.maximoPaginas === undefined ? {} : { maximoPaginas: dependencias.maximoPaginas },
    );
    coleta = {
      status: resultado.status,
      completa: resultado.status === 'SUCESSO',
      esperado: resultado.esperado,
      capturado: resultado.capturado,
      processos: resultado.status === 'SUCESSO' ? resultado.processos : [],
    };
    if (coleta.completa) {
      [atribuicoes, marcadores] = await Promise.all([
        coletarSecaoOpcional(sessao.fonteAtribuidos, dependencias.maximoPaginas),
        coletarSecoesMarcadores(sessao.fontesMarcadores, dependencias.maximoPaginas),
      ]);
    }
  } catch (erro) {
    coleta = coletaComFalha(classificarErro(erro));
  } finally {
    try {
      await sessao?.fechar();
    } catch {
      coleta = coletaComFalha('ERRO');
      atribuicoes = { completa: false, esperado: null, capturado: 0, processos: [] };
      marcadores = { completa: false, processosPorMarcador: new Map() };
    }
  }

  const finalizadaEm = agora();
  const envio: EnvioSincronizacaoAgente = Object.freeze({
    instalacao_id: dependencias.instalacaoId,
    token_instalacao: dependencias.tokenInstalacao,
    execucao_cliente_id: id(),
    unidade: dependencias.unidade,
    iniciada_em: iniciadaEm.toISOString(),
    finalizada_em: finalizadaEm.toISOString(),
    status: coleta.status,
    completa: coleta.completa,
    esperado: coleta.esperado,
    capturado: coleta.capturado,
    atribuicoes_esperadas: atribuicoes.esperado,
    atribuicoes_capturadas: atribuicoes.capturado,
    atribuicoes_completas: atribuicoes.completa,
    marcadores_completos: marcadores.completa,
    processos: mesclarProcessos(coleta.processos, atribuicoes, marcadores),
  });
  await dependencias.enviar(envio);
  return envio;
};
