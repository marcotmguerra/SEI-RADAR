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
  unidade?: string;
  atribuidoPara?: string | null;
  marcadores?: DetalheMarcador[];
  atualizadoEm?: string; // ISO 8601 string, presente quando o processo teve marcadores alterados após a primeira detecção
  motivoAtualizacao?: string;
}

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
}

export type StatusSessao = 'conectado' | 'desconectado' | 'verificando' | 'erro';

export interface EstadoExtensao {
  readonly status: StatusSessao;
  readonly ultimaVerificacao: string | null;
  readonly erroMensagem?: string;
  readonly totalProcessos: number;
  readonly novosProcessos: number;
}

export const CONFIGURACAO_PADRAO: ConfiguracaoExtensao = {
  urlControle: 'https://www.sei.mg.gov.br/sei/controlador.php?acao=procedimento_controlar',
  intervaloMinutos: 5,
  somAtivo: true,
  notificacoesAtivas: true,
  regraNotificacao: 'todos',
  usuarioSigla: '',
  marcadoresNotificacao: [],
  primeiraCargaRealizada: false,
};

export type MensagemRuntime =
  | { tipo: 'VERIFICAR_AGORA' }
  | { tipo: 'ABRIR_SEI'; url?: string }
  | { tipo: 'MARCAR_LIDO'; numero: string }
  | { tipo: 'MARCAR_TODOS_LIDOS' }
  | { tipo: 'SALVAR_CONFIGURACAO'; configuracao: Partial<ConfiguracaoExtensao> }
  | { tipo: 'OBTER_ESTADO' }
  | {
      tipo: 'NOTIFICAR_PAGINA_SEI_CARREGADA';
      processos: ProcessoSei[];
      urlAtual?: string;
      autenticado?: boolean;
      usuarioLogado?: string;
    }
  | { tipo: 'TESTAR_NOTIFICACAO' }
  | { tipo: 'TOCAR_ALERTA_SONORO' };
