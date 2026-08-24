export type Json =
  | string
  | number
  | boolean
  | null
  | { readonly [key: string]: Json | undefined }
  | readonly Json[];

export type StatusProcessoCrm =
  | 'NOVO'
  | 'EM_ANALISE'
  | 'AGUARDANDO_RESPOSTA'
  | 'PARA_DESPACHO'
  | 'FINALIZADO';

export type PrioridadeCrm = 'BAIXA' | 'NORMAL' | 'ALTA' | 'URGENTE';

export type StatusSincronizacaoSei =
  | 'EM_EXECUCAO'
  | 'SUCESSO'
  | 'INCOMPLETA'
  | 'SESSAO_EXPIRADA'
  | 'ERRO_LAYOUT_COLETOR'
  | 'ERRO';

export type TipoEventoSei =
  | 'IDENTIFICADO_PRIMEIRA_VEZ'
  | 'ENTROU_NA_UNIDADE'
  | 'SAIU_DA_UNIDADE'
  | 'ATRIBUIDO_A_MIM'
  | 'ATRIBUICAO_REMOVIDA'
  | 'MARCADOR_ADICIONADO'
  | 'MARCADOR_REMOVIDO';

export type NivelConteudoNotificacao = 'AVISO' | 'NUMERO' | 'ASSUNTO';
export type TipoNotificacao = 'NOVO_PROCESSO' | 'ATRIBUICAO' | 'PRAZO_PROXIMO' | 'FALHA_SINCRONIZACAO';
export type StatusFilaNotificacao = 'PENDENTE' | 'PROCESSANDO' | 'ENVIADA' | 'FALHOU';

export interface ProcessoRetratoSincronizacao {
  readonly numero: string;
  readonly assunto?: string | null;
  readonly url_sei?: string | null;
  readonly atribuido_a_mim?: boolean;
  readonly marcadores?: readonly string[];
}

export interface RetratoSincronizacao {
  readonly instalacao_id: string;
  readonly token_instalacao: string;
  readonly execucao_cliente_id: string;
  readonly unidade: string;
  readonly iniciada_em?: string;
  readonly finalizada_em?: string;
  readonly status: Exclude<StatusSincronizacaoSei, 'EM_EXECUCAO'>;
  readonly completa: boolean;
  readonly esperado: number | null;
  readonly capturado: number;
  readonly atribuicoes_esperadas?: number | null;
  readonly atribuicoes_capturadas?: number | null;
  readonly atribuicoes_completas?: boolean;
  readonly marcadores_completos?: boolean;
  readonly mensagem_erro?: string | null;
  readonly processos: readonly ProcessoRetratoSincronizacao[];
}

export interface ResultadoRetratoSincronizacao {
  readonly sincronizacao_id: string;
  readonly idempotente: boolean;
  readonly linha_base: boolean;
  readonly eventos_criados: number;
  readonly processos_atualizados: number;
}

type LinhaProcessoSei = {
  atribuido_a_mim: boolean;
  assunto: string | null;
  criado_em: string;
  status_crm: StatusProcessoCrm;
  data_prazo: string | null;
  visto_primeiro_em: string;
  id: string;
  na_unidade: boolean;
  visto_ultimo_em: string;
  contagem_ausencias: number;
  observacoes: string | null;
  numero: string;
  prioridade: PrioridadeCrm;
  url_sei: string | null;
  unidade: string;
  atualizado_em: string;
  usuario_id: string;
};

type LinhaExecucaoSincronizacaoSei = {
  atribuicoes_capturadas: number | null;
  atribuicoes_esperadas: number | null;
  atribuicoes_completas: boolean;
  execucao_cliente_id: string;
  completa: boolean;
  criado_em: string;
  duracao_ms: number | null;
  mensagem_erro: string | null;
  finalizada_em: string | null;
  id: string;
  instalacao_id: string | null;
  marcadores_completos: boolean;
  hash_conteudo: string;
  processos_capturados: number | null;
  processos_esperados: number | null;
  resultado: Json | null;
  iniciada_em: string;
  status: StatusSincronizacaoSei;
  unidade: string;
  usuario_id: string;
};

type LinhaInstalacaoAgenteSegura = {
  ativa: boolean;
  origem_sei_permitida: string;
  criado_em: string;
  id: string;
  ultimo_uso_em: string | null;
  nome: string;
  atualizado_em: string;
  usuario_id: string;
};

type LinhaInstalacaoAgente = LinhaInstalacaoAgenteSegura & {
  hash_token: string;
};

export interface Database {
  public: {
    Tables: {
      instalacoes_agente: {
        Row: LinhaInstalacaoAgente;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      preferencias_notificacao: {
        Row: {
          atribuicao: boolean;
          nivel_conteudo: NivelConteudoNotificacao;
          criado_em: string;
          prazo_proximo: boolean;
          novo_processo: boolean;
          falha_sincronizacao: boolean;
          atualizado_em: string;
          usuario_id: string;
        };
        Insert: {
          atribuicao?: boolean;
          nivel_conteudo?: NivelConteudoNotificacao;
          criado_em?: string;
          prazo_proximo?: boolean;
          novo_processo?: boolean;
          falha_sincronizacao?: boolean;
          atualizado_em?: string;
          usuario_id: string;
        };
        Update: {
          atribuicao?: boolean;
          nivel_conteudo?: NivelConteudoNotificacao;
          prazo_proximo?: boolean;
          novo_processo?: boolean;
          falha_sincronizacao?: boolean;
        };
        Relationships: [];
      };
      fila_notificacoes: {
        Row: {
          tentativas: number;
          disponivel_em: string;
          nivel_conteudo: NivelConteudoNotificacao;
          criado_em: string;
          chave_deduplicacao: string;
          id: string;
          ultimo_erro: string | null;
          tipo_notificacao: TipoNotificacao;
          conteudo: Json;
          processo_id: string | null;
          enviado_em: string | null;
          evento_origem_id: string | null;
          sincronizacao_origem_id: string | null;
          status: StatusFilaNotificacao;
          atualizado_em: string;
          usuario_id: string;
        };
        Insert: {
          tentativas?: number;
          disponivel_em?: string;
          nivel_conteudo: NivelConteudoNotificacao;
          chave_deduplicacao: string;
          id?: string;
          ultimo_erro?: string | null;
          tipo_notificacao: TipoNotificacao;
          conteudo: Json;
          processo_id?: string | null;
          enviado_em?: string | null;
          evento_origem_id?: string | null;
          sincronizacao_origem_id?: string | null;
          status?: StatusFilaNotificacao;
          usuario_id: string;
        };
        Update: {
          tentativas?: number;
          disponivel_em?: string;
          ultimo_erro?: string | null;
          enviado_em?: string | null;
          status?: StatusFilaNotificacao;
        };
        Relationships: [];
      };
      processos_sei: {
        Row: LinhaProcessoSei;
        Insert: Partial<LinhaProcessoSei> &
          Pick<LinhaProcessoSei, 'usuario_id' | 'numero' | 'unidade'>;
        Update: Partial<LinhaProcessoSei>;
        Relationships: [];
      };
      marcadores_sei: {
        Row: {
          cor: string | null;
          criado_em: string;
          id: string;
          nome: string;
          identificador_sei: string;
          atualizado_em: string;
          usuario_id: string;
        };
        Insert: {
          cor?: string | null;
          id?: string;
          nome: string;
          identificador_sei: string;
          usuario_id: string;
        };
        Update: {
          cor?: string | null;
          nome?: string;
          identificador_sei?: string;
        };
        Relationships: [];
      };
      processos_marcadores_sei: {
        Row: {
          ativa: boolean;
          visto_primeiro_em: string;
          visto_ultimo_em: string;
          marcador_id: string;
          processo_id: string;
          usuario_id: string;
        };
        Insert: {
          ativa?: boolean;
          visto_primeiro_em?: string;
          visto_ultimo_em?: string;
          marcador_id: string;
          processo_id: string;
          usuario_id: string;
        };
        Update: {
          ativa?: boolean;
          visto_ultimo_em?: string;
        };
        Relationships: [];
      };
      eventos_sei: {
        Row: {
          detectado_em: string;
          tipo_evento: TipoEventoSei;
          id: string;
          metadados: Json;
          processo_id: string;
          sincronizacao_id: string;
          usuario_id: string;
        };
        Insert: {
          detectado_em?: string;
          tipo_evento: TipoEventoSei;
          id?: string;
          metadados?: Json;
          processo_id: string;
          sincronizacao_id: string;
          usuario_id: string;
        };
        Update: never;
        Relationships: [];
      };
      execucoes_sincronizacao_sei: {
        Row: LinhaExecucaoSincronizacaoSei;
        Insert: Partial<LinhaExecucaoSincronizacaoSei> &
          Pick<LinhaExecucaoSincronizacaoSei, 'usuario_id' | 'execucao_cliente_id' | 'unidade' | 'hash_conteudo'>;
        Update: Partial<LinhaExecucaoSincronizacaoSei>;
        Relationships: [];
      };
      estado_sincronizacao_sei: {
        Row: {
          linha_base_estabelecida: boolean;
          linha_base_estabelecida_em: string | null;
          ultima_sincronizacao_aplicada_id: string | null;
          ultima_sincronizacao_bem_sucedida_id: string | null;
          unidade: string;
          atualizado_em: string;
          usuario_id: string;
        };
        Insert: {
          linha_base_estabelecida?: boolean;
          linha_base_estabelecida_em?: string | null;
          ultima_sincronizacao_aplicada_id?: string | null;
          ultima_sincronizacao_bem_sucedida_id?: string | null;
          unidade: string;
          atualizado_em?: string;
          usuario_id: string;
        };
        Update: never;
        Relationships: [];
      };
    };
    Views: {
      instalacoes_agente_seguras: {
        Row: LinhaInstalacaoAgenteSegura;
        Relationships: [];
      };
    };
    Functions: {
      aplicar_retrato_sincronizacao: {
        Args: { p_retrato: Json };
        Returns: Json;
      };
      obter_preferencias_notificacao: {
        Args: Record<PropertyKey, never>;
        Returns: Database['public']['Tables']['preferencias_notificacao']['Row'];
      };
      provisionar_instalacao_agente: {
        Args: {
          p_nome: string;
          p_origem_sei: string;
          p_usuario_id: string;
        };
        Returns: Json;
      };
      definir_instalacao_agente_ativa: {
        Args: {
          p_ativa: boolean;
          p_instalacao_id: string;
        };
        Returns: Json;
      };
      atualizar_preferencias_notificacao: {
        Args: {
          p_atribuicao: boolean;
          p_nivel_conteudo: NivelConteudoNotificacao;
          p_prazo_proximo: boolean;
          p_novo_processo: boolean;
          p_falha_sincronizacao: boolean;
        };
        Returns: Database['public']['Tables']['preferencias_notificacao']['Row'];
      };
      atualizar_processo_crm: {
        Args: {
          p_processo_id: string;
          p_status_crm?: StatusProcessoCrm | null;
          p_prioridade?: PrioridadeCrm | null;
          p_data_prazo?: string | null;
          p_observacoes?: string | null;
          p_limpar_data_prazo?: boolean;
          p_limpar_observacoes?: boolean;
        };
        Returns: LinhaProcessoSei;
      };
    };
    Enums: {
      status_processo_crm: StatusProcessoCrm;
      prioridade_crm: PrioridadeCrm;
      nivel_conteudo_notificacao: NivelConteudoNotificacao;
      status_fila_notificacao: StatusFilaNotificacao;
      tipo_notificacao: TipoNotificacao;
      tipo_evento_sei: TipoEventoSei;
      status_sincronizacao_sei: StatusSincronizacaoSei;
    };
    CompositeTypes: Record<string, never>;
  };
}
