import {
  type AndamentoProcesso,
  type ConfiguracaoExtensao,
  type FiltrosUi,
  type ProcessoSei,
  type StatusSessao,
  CONFIGURACAO_PADRAO,
  FILTROS_UI_PADRAO,
} from '../types';

const CHAVE_CONFIGURACAO = 'sei_monitor_configuracao';
const CHAVE_PROCESSOS = 'sei_monitor_processos';
const CHAVE_STATUS = 'sei_monitor_status';
const CHAVE_ULTIMA_VERIFICACAO = 'sei_monitor_ultima_verificacao';
const CHAVE_MARCADORES_DISPONIVEIS = 'sei_monitor_marcadores_disponiveis';
const CHAVE_ANDAMENTOS = 'sei_monitor_andamentos';
const CHAVE_FILTROS_UI = 'sei_monitor_filtros_ui';

/** Tempo após o qual um andamento em cache é considerado velho */
export const VALIDADE_ANDAMENTO_MS = 6 * 60 * 60 * 1000;

/**
 * Validade de uma consulta que falhou.
 *
 * Falha não é resultado: guardá-la pelas mesmas 6 horas de um sucesso congela o
 * erro na tela e impede qualquer nova tentativa — inclusive depois de a extensão
 * ter sido corrigida. Poucos minutos evitam martelar o SEI e, ainda assim,
 * deixam o usuário tentar de novo.
 */
export const VALIDADE_ERRO_MS = 2 * 60 * 1000;

/** Teto de andamentos guardados; os mais antigos são descartados */
const LIMITE_ANDAMENTOS = 500;

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

export const obterAndamentos = async (): Promise<Record<string, AndamentoProcesso>> => {
  const arm = obterArmazenamento();
  const dados = await arm.get(CHAVE_ANDAMENTOS);
  return dados && typeof dados === 'object' ? dados : {};
};

/**
 * Indica se um andamento em cache ainda pode ser exibido sem nova consulta ao SEI
 */
export const andamentoEstaFresco = (
  andamento: AndamentoProcesso | undefined,
  agora: number = Date.now()
): boolean => {
  if (!andamento?.coletadoEm) return false;
  const coletadoEm = new Date(andamento.coletadoEm).getTime();
  if (Number.isNaN(coletadoEm)) return false;

  const validade = andamento.erro ? VALIDADE_ERRO_MS : VALIDADE_ANDAMENTO_MS;
  return agora - coletadoEm < validade;
};

export const salvarAndamentos = async (
  novos: AndamentoProcesso[]
): Promise<Record<string, AndamentoProcesso>> => {
  if (!Array.isArray(novos) || novos.length === 0) return obterAndamentos();

  const arm = obterArmazenamento();
  const atuais = await obterAndamentos();

  for (const andamento of novos) {
    if (andamento?.numero) {
      atuais[andamento.numero] = andamento;
    }
  }

  // Poda os mais antigos quando o cache cresce demais
  const entradas = Object.entries(atuais);
  if (entradas.length > LIMITE_ANDAMENTOS) {
    entradas.sort(
      (a, b) => new Date(b[1].coletadoEm).getTime() - new Date(a[1].coletadoEm).getTime()
    );
    const podado = Object.fromEntries(entradas.slice(0, LIMITE_ANDAMENTOS));
    await arm.set(CHAVE_ANDAMENTOS, podado);
    return podado;
  }

  await arm.set(CHAVE_ANDAMENTOS, atuais);
  return atuais;
};

export const limparAndamentos = async (): Promise<void> => {
  const arm = obterArmazenamento();
  await arm.set(CHAVE_ANDAMENTOS, {});
};

export const obterFiltrosUi = async (): Promise<FiltrosUi> => {
  const arm = obterArmazenamento();
  const dados = await arm.get(CHAVE_FILTROS_UI);
  if (!dados || typeof dados !== 'object') return { ...FILTROS_UI_PADRAO };
  return { ...FILTROS_UI_PADRAO, ...dados };
};

export const salvarFiltrosUi = async (filtros: Partial<FiltrosUi>): Promise<FiltrosUi> => {
  const arm = obterArmazenamento();
  const atuais = await obterFiltrosUi();
  const novos = { ...atuais, ...filtros };
  await arm.set(CHAVE_FILTROS_UI, novos);
  return novos;
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

