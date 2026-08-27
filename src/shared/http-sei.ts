/**
 * Leitura de respostas HTML do SEI respeitando a codificação declarada.
 *
 * O SEI serve as páginas em ISO-8859-1. Usar `Response.text()` decodifica como
 * UTF-8 e corrompe os acentos: "Descrição" vira "Descri��o". Isso quebra qualquer
 * comparação por texto — foi o que impediu o reconhecimento da coluna "Descrição"
 * na tabela de andamento.
 */

const CHARSET_PADRAO = 'utf-8';

/** Extrai o charset de um cabeçalho Content-Type, quando declarado */
const charsetDoCabecalho = (contentType: string | null | undefined): string | null => {
  const match = contentType?.match(/charset\s*=\s*["']?([\w-]+)/iu);
  return match?.[1]?.toLowerCase() || null;
};

/**
 * Procura a declaração de charset nos primeiros bytes do documento.
 *
 * A varredura é feita sobre uma leitura latina, que nunca falha e preserva os
 * caracteres ASCII das metatags — suficiente para achar a declaração.
 */
const charsetDoDocumento = (bytes: Uint8Array): string | null => {
  // Janela larga: o SEI empilha <link> e <script> antes da metatag de charset
  const inicio = new TextDecoder('iso-8859-1').decode(bytes.slice(0, 16384));
  const match =
    inicio.match(/<meta[^>]+charset\s*=\s*["']?([\w-]+)/iu) ||
    inicio.match(/content\s*=\s*["'][^"']*charset\s*=\s*([\w-]+)/iu);
  return match?.[1]?.toLowerCase() || null;
};

/**
 * Decide qual codificação usar: o cabeçalho tem prioridade sobre a metatag,
 * e o padrão é UTF-8 quando nada é declarado.
 */
export const detectarCharset = (bytes: Uint8Array, contentType?: string | null): string =>
  charsetDoCabecalho(contentType) || charsetDoDocumento(bytes) || CHARSET_PADRAO;

/**
 * Decodifica bytes de HTML usando a codificação detectada
 */
const CHARSET_LATINO = 'iso-8859-1';

/** Caractere de substituição: aparece quando os bytes não são válidos na codificação usada */
const MARCA_DE_ERRO = '�';

const decodificarCom = (charset: string, bytes: Uint8Array): string => {
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    // Rótulo desconhecido pelo navegador: melhor um texto legível que uma exceção
    return new TextDecoder(CHARSET_PADRAO).decode(bytes);
  }
};

/**
 * Decodifica bytes de HTML usando a codificação detectada, conferindo o resultado.
 *
 * A declaração do servidor nem sempre corresponde ao corpo: há respostas do SEI que
 * anunciam UTF-8 mas vêm em ISO-8859-1. Confiar na declaração fazia "Descrição" virar
 * lixo, e sem essa palavra a coluna da tabela de andamento deixava de ser reconhecida.
 * Por isso, quando a decodificação produz caracteres inválidos, tentamos a leitura
 * latina, que é a que o SEI de fato usa.
 */
export const decodificarHtml = (bytes: Uint8Array, contentType?: string | null): string => {
  const charset = detectarCharset(bytes, contentType);
  const texto = decodificarCom(charset, bytes);

  if (charset !== CHARSET_LATINO && texto.includes(MARCA_DE_ERRO)) {
    return decodificarCom(CHARSET_LATINO, bytes);
  }

  return texto;
};

/**
 * Lê o corpo de uma resposta do SEI como HTML, respeitando a codificação declarada.
 * Substitui `resposta.text()` em todas as leituras de páginas do SEI.
 */
export const lerHtmlDaResposta = async (resposta: Response): Promise<string> => {
  const bytes = new Uint8Array(await resposta.arrayBuffer());
  return decodificarHtml(bytes, resposta.headers?.get?.('content-type'));
};
