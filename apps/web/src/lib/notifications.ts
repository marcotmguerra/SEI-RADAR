export type NivelConteudoNotificacao = 'AVISO' | 'NUMERO' | 'ASSUNTO';

export interface ProcessoNotificacao {
  readonly numero: string;
  readonly assunto: string | null;
}

const titulos: Record<string, string> = {
  ENTROU_NA_UNIDADE: 'Novo processo na unidade', ATRIBUIDO_A_MIM: 'Processo atribuído a você',
  SAIU_DA_UNIDADE: 'Processo saiu da unidade', ATRIBUICAO_REMOVIDA: 'Atribuição removida',
  MARCADOR_ADICIONADO: 'Marcador adicionado', MARCADOR_REMOVIDO: 'Marcador removido',
};

export function montarNotificacao(tipoEvento: string, processo: ProcessoNotificacao, nivel: NivelConteudoNotificacao) {
  const titulo = titulos[tipoEvento] ?? 'Atualização no CRM SEI';
  if (nivel === 'AVISO') return { titulo, corpo: 'Há uma nova atualização no CRM SEI.' };
  if (nivel === 'NUMERO') return { titulo, corpo: processo.numero };
  return { titulo, corpo: processo.assunto ? `${processo.numero} · ${processo.assunto}` : processo.numero };
}

export function obterNivelConteudoNotificacao(): NivelConteudoNotificacao {
  const valor = globalThis.localStorage?.getItem('crm-sei:conteudo-notificacao');
  return valor === 'AVISO' || valor === 'ASSUNTO' ? valor : 'NUMERO';
}

export async function exibirNotificacaoProcesso(tipoEvento: string, processo: ProcessoNotificacao): Promise<void> {
  if (!('Notification' in globalThis) || Notification.permission !== 'granted') return;
  const conteudo = montarNotificacao(tipoEvento, processo, obterNivelConteudoNotificacao());
  new Notification(conteudo.titulo, { body: conteudo.corpo, icon: '/app-icon.svg', tag: `crm-sei-${tipoEvento}-${processo.numero}` });
}

export async function exibirNotificacaoFila(registro: Record<string, unknown>): Promise<boolean> {
  if (!('Notification' in globalThis) || Notification.permission !== 'granted') return false;
  const conteudo = registro.conteudo;
  if (!conteudo || typeof conteudo !== 'object') return false;
  const mensagem = conteudo as Record<string, unknown>;
  const titulo = typeof mensagem.titulo === 'string' ? mensagem.titulo.slice(0, 160) : 'Atualização no CRM SEI';
  const numero = typeof mensagem.numero === 'string' ? mensagem.numero : '';
  const assunto = typeof mensagem.assunto === 'string' ? mensagem.assunto : '';
  const corpo = [numero, assunto].filter(Boolean).join(' · ') || 'Há uma nova atualização no CRM SEI.';
  const etiqueta = typeof registro.chave_deduplicacao === 'string' ? registro.chave_deduplicacao : undefined;
  new Notification(titulo, {
    body: corpo.slice(0, 500), icon: '/app-icon.svg',
    ...(etiqueta ? { tag: etiqueta } : {}),
  });
  return true;
}

export async function exibirNotificacaoFilaUmaVez(registro: Record<string, unknown>): Promise<void> {
  const chaveDeduplicacao = typeof registro.chave_deduplicacao === 'string' ? registro.chave_deduplicacao : null;
  const chaveArmazenamento = chaveDeduplicacao ? `crm-sei:notificacao-vista:${chaveDeduplicacao}` : null;
  try {
    if (chaveArmazenamento && globalThis.localStorage?.getItem(chaveArmazenamento)) return;
  } catch { /* armazenamento pode estar indisponível em modo privado */ }
  const exibida = await exibirNotificacaoFila(registro);
  if (!exibida || !chaveArmazenamento) return;
  try { globalThis.localStorage?.setItem(chaveArmazenamento, new Date().toISOString()); } catch { /* sem persistência */ }
}
