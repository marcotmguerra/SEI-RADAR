import {
  type ConfiguracaoExtensao,
  type ProcessoSei,
  type StatusSessao,
  CONFIGURACAO_PADRAO,
} from '../types';

const CHAVE_CONFIGURACAO = 'sei_monitor_configuracao';
const CHAVE_PROCESSOS = 'sei_monitor_processos';
const CHAVE_STATUS = 'sei_monitor_status';
const CHAVE_ULTIMA_VERIFICACAO = 'sei_monitor_ultima_verificacao';
const CHAVE_MARCADORES_DISPONIVEIS = 'sei_monitor_marcadores_disponiveis';

// Fallback em memória para ambiente de testes ou desenvolvimento fora do Chrome
const memoriaLocal = new Map<string, any>();

const obterArmazenamento = (): {
  get: (chave: string) => Promise<any>;
  set: (chave: string, valor: any) => Promise<void>;
} => {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    return {
      get: async (chave: string) => {
        const resultado = await chrome.storage.local.get(chave);
        return resultado[chave];
      },
      set: async (chave: string, valor: any) => {
        await chrome.storage.local.set({ [chave]: valor });
      },
    };
  }

  if (typeof localStorage !== 'undefined') {
    return {
      get: async (chave: string) => {
        const item = localStorage.getItem(chave);
        return item ? JSON.parse(item) : undefined;
      },
      set: async (chave: string, valor: any) => {
        localStorage.setItem(chave, JSON.stringify(valor));
      },
    };
  }

  return {
    get: async (chave: string) => memoriaLocal.get(chave),
    set: async (chave: string, valor: any) => {
      memoriaLocal.set(chave, valor);
    },
  };
};

export const obterConfiguracao = async (): Promise<ConfiguracaoExtensao> => {
  const arm = obterArmazenamento();
  const dados = await arm.get(CHAVE_CONFIGURACAO);

  if (!dados) {
    return { ...CONFIGURACAO_PADRAO };
  }

  // Migração transparente para usuários existentes que já utilizavam a extensão
  if (dados.radarOnboardingConcluido === undefined) {
    const ehUsuarioLegado =
      dados.primeiraCargaRealizada === true ||
      Boolean(dados.usuarioSigla) ||
      (Array.isArray(dados.marcadoresNotificacao) && dados.marcadoresNotificacao.length > 0) ||
      dados.intervaloMinutos !== undefined;

    if (ehUsuarioLegado) {
      return {
        ...CONFIGURACAO_PADRAO,
        ...dados,
        radarOnboardingConcluido: true,
        escopoRadar: dados.escopoRadar || 'unidade',
        marcadoresRadar: dados.marcadoresRadar || dados.marcadoresNotificacao || [],
      };
    }
  }

  return {
    ...CONFIGURACAO_PADRAO,
    ...dados,
    escopoRadar: dados.escopoRadar || 'atribuidos',
    marcadoresRadar: dados.marcadoresRadar || [],
    radarOnboardingConcluido: Boolean(dados.radarOnboardingConcluido),
  };
};

export const salvarConfiguracao = async (
  config: Partial<ConfiguracaoExtensao>
): Promise<ConfiguracaoExtensao> => {
  const atual = await obterConfiguracao();
  const nova = { ...atual, ...config };
  const arm = obterArmazenamento();
  await arm.set(CHAVE_CONFIGURACAO, nova);
  return nova;
};

export const obterMarcadoresDisponiveis = async (): Promise<string[]> => {
  const arm = obterArmazenamento();
  const lista = await arm.get(CHAVE_MARCADORES_DISPONIVEIS);
  return Array.isArray(lista) ? lista : [];
};

export const salvarMarcadoresDisponiveis = async (marcadores: string[]): Promise<string[]> => {
  const arm = obterArmazenamento();
  const anteriores = await obterMarcadoresDisponiveis();
  const mapaExistentes = new Map<string, string>();

  for (const m of [...anteriores, ...marcadores]) {
    if (!m || typeof m !== 'string') continue;
    const limpo = m.trim();
    if (!limpo) continue;
    const chave = limpo.toLowerCase();
    if (!mapaExistentes.has(chave)) {
      mapaExistentes.set(chave, limpo);
    }
  }

  const listaFinal = Array.from(mapaExistentes.values()).sort((a, b) =>
    a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })
  );

  await arm.set(CHAVE_MARCADORES_DISPONIVEIS, listaFinal);
  return listaFinal;
};

/**
 * Normaliza processos gravados antes da introdução de DetalheMarcador,
 * quando marcadores eram salvos como string[] em vez de { nome, texto }[]
 */
const normalizarProcesso = (processo: any): ProcessoSei => {
  if (
    Array.isArray(processo?.marcadores) &&
    processo.marcadores.length > 0 &&
    typeof processo.marcadores[0] === 'string'
  ) {
    return {
      ...processo,
      marcadores: processo.marcadores.map((nome: string) => ({ nome })),
    };
  }
  return processo;
};

export const obterProcessos = async (): Promise<ProcessoSei[]> => {
  const arm = obterArmazenamento();
  const lista = await arm.get(CHAVE_PROCESSOS);
  return Array.isArray(lista) ? lista.map(normalizarProcesso) : [];
};

export const salvarProcessos = async (processos: ProcessoSei[]): Promise<void> => {
  const arm = obterArmazenamento();
  await arm.set(CHAVE_PROCESSOS, processos);
};

export const marcarProcessoComoLido = async (numero: string): Promise<ProcessoSei[]> => {
  const lista = await obterProcessos();
  const atualizada = lista.map((p) => (p.numero === numero ? { ...p, lido: true } : p));
  await salvarProcessos(atualizada);
  return atualizada;
};

export const marcarTodosProcessosComoLidos = async (): Promise<ProcessoSei[]> => {
  const lista = await obterProcessos();
  const atualizada = lista.map((p) => ({ ...p, lido: true }));
  await salvarProcessos(atualizada);
  return atualizada;
};

export const limparProcessos = async (): Promise<void> => {
  await salvarProcessos([]);
};

export const obterStatusSessao = async (): Promise<{
  status: StatusSessao;
  ultimaVerificacao: string | null;
}> => {
  const arm = obterArmazenamento();
  const status = (await arm.get(CHAVE_STATUS)) || 'desconectado';
  const ultimaVerificacao = (await arm.get(CHAVE_ULTIMA_VERIFICACAO)) || null;
  return { status, ultimaVerificacao };
};

export const salvarStatusSessao = async (
  status: StatusSessao,
  ultimaVerificacao: string = new Date().toISOString()
): Promise<void> => {
  const arm = obterArmazenamento();
  await arm.set(CHAVE_STATUS, status);
  await arm.set(CHAVE_ULTIMA_VERIFICACAO, ultimaVerificacao);
};

