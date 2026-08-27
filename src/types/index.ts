export interface DetalheMarcador {
  nome: string;
  texto?: string;
}

export interface ProcessoSei {
  numero: string;
  assunto: string | null;
  link: string;
  detectadoEm: string; // ISO 8601 string
  lido: boolean;
  /**
   * Atribuição do processo, em três estados distintos:
   * - `string`: atribuído a alguém (sigla ou CPF, conforme o SEI expõe na linha)
   * - `null`: sem atribuição confirmada (a coluna "Atribuição" foi lida e está vazia)
   * - `undefined`: não foi possível determinar (coluna ausente e heurísticas falharam)
   *
   * A distinção entre `null` e `undefined` é o que sustenta o filtro "Sem atribuição":
   * sem ela, uma falha de leitura apareceria como processo não distribuído.
   */
  atribuidoPara?: string | null;
  /** Prazo/retorno programado em ISO 8601, quando o SEI sinaliza um na linha */
  prazo?: string | null;
  /** O prazo como o SEI mostra, ex: "30/08/2026" */
  prazoTexto?: string;
  marcadores?: DetalheMarcador[];
  atualizadoEm?: string; // ISO 8601 string, presente quando o processo teve marcadores alterados após a primeira detecção
  motivoAtualizacao?: string;
}

export type EscopoRadar = 'unidade' | 'atribuidos' | 'marcadores';

export type RegraNotificacao = 'todos' | 'atribuidos' | 'atribuidos_e_marcadores';

export interface ConfiguracaoExtensao {
  urlControle: string;
  intervaloMinutos: number;
  somAtivo: boolean;
  notificacoesAtivas: boolean;
  regraNotificacao: RegraNotificacao;
  usuarioSigla: string;
  marcadoresNotificacao: string[];
  primeiraCargaRealizada: boolean;
  escopoRadar: EscopoRadar;
  marcadoresRadar: string[];
  radarOnboardingConcluido: boolean;
}

export type StatusSessao = 'conectado' | 'desconectado' | 'verificando' | 'erro';

/**
 * Uma linha da tabela de andamento do SEI ("Consultar Andamento")
 */
export interface LinhaAndamento {
  dataHora: string; // ISO 8601
  dataHoraTexto: string; // como veio do SEI, ex: "20/08/2026 14:32"
  unidade: string;
  usuario?: string;
  descricao: string;
}

/**
 * Resumo do andamento de um processo, derivado da tabela de andamento do SEI
 */
export interface AndamentoProcesso {
  numero: string;
  unidadeGeradora: string | null;
  enviadoPorUnidade: string | null;
  dataEnvio: string | null; // ISO 8601
  atualizadoEmSei: string | null; // ISO 8601, data/hora do andamento mais recente
  linhas: LinhaAndamento[];
  linkAndamento?: string;
  coletadoEm: string; // ISO 8601
  erro?: string;
}

export type ResumoAndamento = Omit<AndamentoProcesso, 'numero' | 'coletadoEm'>;

/**
 * Filtros da lista de processos, persistidos para sobreviverem ao fechamento do popup
 */
export interface FiltrosUi {
  filtroTipo: FiltroTipo;
  periodoFiltro: PeriodoFiltro;
  marcadorFiltro: string | null;
}

export type FiltroTipo =
  | 'todos'
  | 'meus'
  | 'nao_lidos'
  | 'sem_atribuicao'
  | 'outros'
  | 'com_prazo';

export type PeriodoFiltro = 'todos' | 'hoje' | 'ontem';

export const FILTROS_UI_PADRAO: FiltrosUi = {
  filtroTipo: 'todos',
  periodoFiltro: 'todos',
  marcadorFiltro: null,
};

export const CONFIGURACAO_PADRAO: ConfiguracaoExtensao = {
  urlControle: 'https://www.sei.mg.gov.br/sei/controlador.php?acao=procedimento_controlar',
  intervaloMinutos: 5,
  somAtivo: true,
  notificacoesAtivas: true,
  regraNotificacao: 'todos',
  usuarioSigla: '',
  marcadoresNotificacao: [],
  primeiraCargaRealizada: false,
  escopoRadar: 'atribuidos',
  marcadoresRadar: [],
  radarOnboardingConcluido: false,
};

export type MensagemRuntime =
  | { tipo: 'VERIFICAR_AGORA' }
  | { tipo: 'ABRIR_SEI'; url?: string }
  | { tipo: 'SALVAR_CONFIGURACAO'; configuracao: Partial<ConfiguracaoExtensao> }
  | {
      tipo: 'NOTIFICAR_PAGINA_SEI_CARREGADA';
      processos: ProcessoSei[];
      urlAtual?: string;
      autenticado?: boolean;
      usuarioLogado?: string;
      unidadeAtual?: string;
      marcadoresDisponiveis?: string[];
    }
  | { tipo: 'EXTRAIR_DOM_SEI' }
  | { tipo: 'TESTAR_NOTIFICACAO' }
  | { tipo: 'TOCAR_ALERTA_SONORO' }
  | { tipo: 'LIMPAR_PROCESSOS' }
  | { tipo: 'PARSEAR_HTML_SEI'; html: string; urlBase: string }
  | { tipo: 'PARSEAR_ANDAMENTO_HTML'; html: string; urlBase: string }
  | { tipo: 'BUSCAR_ANDAMENTO'; processos: ReferenciaProcesso[] };

/**
 * Identificação mínima de um processo para buscar seu andamento
 */
export interface ReferenciaProcesso {
  numero: string;
  link: string;
}

export interface ResultadoVerificacaoSei {
  sucesso: boolean;
  novos: number;
  total: number;
  mensagem?: string;
  semPermissao?: boolean;
}

export interface ResultadoParseHtmlSei {
  processos: ProcessoSei[];
  usuarioLogado: string | null;
  unidadeAtual: string | null;
  marcadoresDisponiveis: string[];
}

export interface ResultadoBuscaAndamento {
  sucesso: boolean;
  andamentos: AndamentoProcesso[];
  mensagem?: string;
  semPermissao?: boolean;
}
