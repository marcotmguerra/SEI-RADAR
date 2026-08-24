export type StatusCrm = 'NOVO' | 'EM_ANALISE' | 'AGUARDANDO_RESPOSTA' | 'PARA_DESPACHO' | 'FINALIZADO';
export type Prioridade = 'BAIXA' | 'NORMAL' | 'ALTA' | 'URGENTE';
export type StatusSincronizacao =
  | 'EM_EXECUCAO'
  | 'SUCESSO'
  | 'INCOMPLETA'
  | 'SESSAO_EXPIRADA'
  | 'ERRO_LAYOUT_COLETOR'
  | 'ERRO_REDE'
  | 'ERRO';

export interface RegistroProcesso {
  readonly id: string;
  readonly numero: string;
  readonly assunto: string | null;
  readonly unidade: string;
  readonly urlSei: string;
  readonly naUnidade: boolean;
  readonly atribuidoAMim: boolean;
  readonly statusCrm: StatusCrm;
  readonly prioridade: Prioridade;
  readonly dataPrazo: string | null;
  readonly observacoes: string | null;
  readonly marcadores: readonly string[];
  readonly vistoPrimeiroEm: string;
  readonly vistoUltimoEm: string;
}

export type AtualizacaoProcessoCrm = Readonly<Pick<RegistroProcesso, 'statusCrm' | 'prioridade' | 'dataPrazo' | 'observacoes'>>;

export interface ExecucaoSincronizacao {
  readonly id: string;
  readonly status: StatusSincronizacao;
  readonly iniciadaEm: string;
  readonly finalizadaEm: string | null;
  readonly processosEsperados: number | null;
  readonly processosCapturados: number;
  readonly mensagemErro: string | null;
}

export interface EventoSei {
  readonly id: string;
  readonly processoId: string | null;
  readonly numeroProcesso: string | null;
  readonly tipoEvento: string;
  readonly detectadoEm: string;
}

export const STATUS_CRM: readonly StatusCrm[] = [
  'NOVO',
  'EM_ANALISE',
  'AGUARDANDO_RESPOSTA',
  'PARA_DESPACHO',
  'FINALIZADO',
];

export const ROTULOS_STATUS: Record<StatusCrm, string> = {
  NOVO: 'Novo',
  EM_ANALISE: 'Em análise',
  AGUARDANDO_RESPOSTA: 'Aguardando resposta',
  PARA_DESPACHO: 'Para despacho',
  FINALIZADO: 'Finalizado',
};

export const ROTULOS_PRIORIDADE: Record<Prioridade, string> = {
  BAIXA: 'Baixa',
  NORMAL: 'Normal',
  ALTA: 'Alta',
  URGENTE: 'Urgente',
};
