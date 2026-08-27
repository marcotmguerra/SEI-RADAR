import type { ConfiguracaoExtensao, ProcessoSei } from '../types';

/**
 * Normaliza para dígitos quando o valor parece um CPF (11+ dígitos), senão compara como texto simples em minúsculas
 */
export const normalizarParaComparacao = (valor: string | null | undefined): string => {
  if (!valor) return '';
  const digitos = valor.replace(/\D/g, '');
  return digitos.length >= 11 ? digitos : valor.trim().toLowerCase();
};

/**
 * Verifica se um processo está atribuído ao usuário configurado
 */
export const ehProcessoAtribuido = (
  processo: ProcessoSei,
  usuarioSigla?: string | null
): boolean => {
  if (!usuarioSigla || !usuarioSigla.trim() || !processo.atribuidoPara) return false;
  const s = normalizarParaComparacao(usuarioSigla);
  const a = normalizarParaComparacao(processo.atribuidoPara);
  if (!s || !a) return false;
  return a.includes(s) || s.includes(a);
};

/**
 * Verifica se um processo está confirmadamente sem atribuição.
 *
 * Só `null` conta: `undefined` significa que a leitura foi inconclusiva, e tratar
 * isso como "sem atribuição" faria a secretaria trabalhar em cima de dado errado.
 */
export const ehSemAtribuicao = (processo: ProcessoSei): boolean =>
  processo.atribuidoPara === null;

/**
 * Verifica se um processo está atribuído a alguém que não é o usuário configurado
 */
export const ehAtribuidoAOutraPessoa = (
  processo: ProcessoSei,
  usuarioSigla?: string | null
): boolean => {
  const atribuicao = processo.atribuidoPara;
  if (typeof atribuicao !== 'string' || !atribuicao.trim()) return false;
  return !ehProcessoAtribuido(processo, usuarioSigla);
};

/**
 * Verifica se o processo tem prazo (retorno programado) sinalizado pelo SEI
 */
export const temPrazo = (processo: ProcessoSei): boolean =>
  typeof processo.prazo === 'string' && processo.prazo.length > 0;

/**
 * Verifica se um processo pertence ao escopo ativo do Radar pessoal
 */
export const processoPertenceAoRadar = (
  processo: ProcessoSei,
  config: ConfiguracaoExtensao
): boolean => {
  if (!config) return true;

  const escopo = config.escopoRadar || 'unidade';

  if (escopo === 'unidade') {
    return true;
  }

  if (escopo === 'atribuidos') {
    return ehProcessoAtribuido(processo, config.usuarioSigla);
  }

  if (escopo === 'marcadores') {
    if (
      !Array.isArray(config.marcadoresRadar) ||
      config.marcadoresRadar.length === 0 ||
      !Array.isArray(processo.marcadores) ||
      processo.marcadores.length === 0
    ) {
      return false;
    }

    const marcadoresInteresse = config.marcadoresRadar
      .filter((m) => Boolean(m && m.trim()))
      .map((m) => m.trim().toLowerCase());

    if (marcadoresInteresse.length === 0) return false;

    return processo.marcadores.some((m) =>
      marcadoresInteresse.includes((m.nome || '').trim().toLowerCase())
    );
  }

  return true;
};

/**
 * Filtra uma lista de processos para manter apenas os que pertencem ao escopo do Radar
 */
export const filtrarProcessosPorRadar = (
  processos: ProcessoSei[],
  config: ConfiguracaoExtensao
): ProcessoSei[] => {
  if (!Array.isArray(processos)) return [];
  return processos.filter((p) => processoPertenceAoRadar(p, config));
};

/**
 * Retorna uma descrição curta e amigável do escopo ativo do Radar
 */
export const descreverEscopoRadar = (config: ConfiguracaoExtensao): string => {
  const escopo = config.escopoRadar || 'unidade';

  if (escopo === 'atribuidos') {
    return 'Atribuídos a mim';
  }

  if (escopo === 'marcadores') {
    const lista = config.marcadoresRadar || [];
    if (lista.length === 0) return 'Etiquetas (nenhuma selecionada)';
    if (lista.length <= 2) return `Etiquetas: ${lista.join(', ')}`;
    return `Etiquetas: ${lista.slice(0, 2).join(', ')} (+${lista.length - 2})`;
  }

  return 'Todos os processos da unidade';
};

