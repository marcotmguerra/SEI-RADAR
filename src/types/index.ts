export interface ProcessoSei {
  readonly numero: string;
  readonly assunto: string | null;
  readonly link: string;
  readonly detectadoEm: string; // ISO 8601 string
  readonly lido: boolean;
  readonly unidade?: string;
}

export interface ConfiguracaoExtensao {
  readonly urlControle: string;
  readonly intervaloMinutos: number;
  readonly somAtivo: boolean;
  readonly notificacoesAtivas: boolean;
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
    }
  | { tipo: 'TESTAR_NOTIFICACAO' };
