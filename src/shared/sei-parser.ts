import type { ProcessoSei } from '../types';

/**
 * Expressão regular para identificar números de processo no padrão SEI (MG, Federal, etc.)
 * Exemplos: 1400.01.000142/2026-18, 00001.000002/2024-03, 1234567-89.2024.4.01.0000
 */
const REGEX_NUMERO_PROCESSO = /\b\d{4,}[\d.\-/]{7,}\d\b/u;

/**
 * Limpa e formata o assunto extraído do SEI
 */
export const extrairTextoAssunto = (textoBruto: string | null | undefined): string | null => {
  if (!textoBruto) return null;

  let texto = textoBruto.trim();

  // Remove prefixos comuns de tooltips do SEI (ex: "Assunto:", "Especificação:", "Tipo do Processo:")
  texto = texto.replace(/^(?:assunto|especifica[çc][ãa]o|tipo do processo|descri[çc][ãa]o)\s*:\s*/iu, '');

  // Remove trechos JavaScript de tooltips como infraTooltipMostrar('...')
  const matchTooltip = texto.match(/infraTooltipMostrar\s*\(\s*['"]([^'"]+)['"]/iu);
  if (matchTooltip?.[1]) {
    texto = matchTooltip[1].replace(/^(?:assunto|especifica[çc][ãa]o|tipo do processo)\s*:\s*/iu, '');
  }

  // Remove quebras de linha excessivas e espaços duplicados
  texto = texto.replace(/\s+/g, ' ').trim();

  return texto.length > 0 ? texto : null;
};

/**
 * Resolve URL relativa para URL absoluta baseada na URL de controle do SEI
 */
export const resolverUrlAbsoluta = (linkRelativo: string, urlBase: string): string => {
  try {
    const url = new URL(linkRelativo, urlBase);
    return url.href;
  } catch {
    return linkRelativo;
  }
};

/**
 * Extrai o assunto a partir de um elemento de linha (TR) ou link do SEI
 */
const extrairAssuntoDaLinha = (tr: Element, linkEl: Element): string | null => {
  // 1. Tenta obter do title do link do processo
  const titleLink = linkEl.getAttribute('title');
  if (titleLink) {
    const assunto = extrairTextoAssunto(titleLink);
    if (assunto && assunto.length > 3) return assunto;
  }

  // 2. Tenta obter de atributos onmouseover ou data-tooltip
  const mouseover = linkEl.getAttribute('onmouseover');
  if (mouseover) {
    const assunto = extrairTextoAssunto(mouseover);
    if (assunto && assunto.length > 3) return assunto;
  }

  // 3. Procura ícones ou spans auxiliares na mesma linha com title (ex: ícone de notas ou assunto)
  const elementosComTitle = tr.querySelectorAll('[title], [onmouseover], a.ancoraSigla, span.infraTexto');
  for (const el of elementosComTitle) {
    if (el === linkEl) continue;
    const title = el.getAttribute('title');
    if (title && !title.toLowerCase().includes('abrir') && !title.toLowerCase().includes('clique')) {
      const assunto = extrairTextoAssunto(title);
      if (assunto && assunto.length > 3) return assunto;
    }
  }

  // 4. Procura células de texto da tabela que possam conter a especificação/assunto
  const celulas = tr.querySelectorAll('td');
  for (const td of celulas) {
    // Se a célula não tem o link do processo nem checkbox, pode ser a especificação
    if (!td.contains(linkEl) && td.querySelectorAll('input[type="checkbox"]').length === 0) {
      const texto = td.textContent?.trim();
      if (texto && texto.length > 3 && !REGEX_NUMERO_PROCESSO.test(texto)) {
        const assunto = extrairTextoAssunto(texto);
        if (assunto) return assunto;
      }
    }
  }

  return null;
};

/**
 * Faz o parsing do HTML da página de controle do SEI e retorna a lista de processos encontrados
 */
export const parseProcessosHtml = (
  html: string,
  urlBase: string = 'https://www.sei.mg.gov.br/sei/controlador.php?acao=procedimento_controlar'
): ProcessoSei[] => {
  if (!html || typeof html !== 'string') return [];

  // Se o HTML indicar tela de login/expiração de sessão
  if (
    html.includes('txtUsuario') ||
    html.includes('txtSenha') ||
    html.includes('formLogin') ||
    html.includes('Sessão finalizada') ||
    html.includes('Informe seu usuário e senha')
  ) {
    return [];
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const processosMap = new Map<string, ProcessoSei>();
  const agora = new Date().toISOString();

  // Seleciona links que abrem processos no SEI
  const linksProcessos = doc.querySelectorAll<HTMLAnchorElement>(
    'a[href*="acao=procedimento_trabalhar"], a[href*="acao=procedimento_visualizar"], a[href*="controlador.php?acao=procedimento_"]'
  );

  for (const link of linksProcessos) {
    const textoLink = link.textContent?.trim() || '';
    const matchNumero = textoLink.match(REGEX_NUMERO_PROCESSO);
    if (!matchNumero) continue;

    const numero = matchNumero[0];
    if (processosMap.has(numero)) continue;

    const tr = link.closest('tr');
    const href = link.getAttribute('href') || '';
    const linkCompleto = resolverUrlAbsoluta(href, urlBase);

    let assunto: string | null = null;
    if (tr) {
      assunto = extrairAssuntoDaLinha(tr, link);
    } else {
      assunto = extrairTextoAssunto(link.getAttribute('title'));
    }

    processosMap.set(numero, {
      numero,
      assunto,
      link: linkCompleto,
      detectadoEm: agora,
      lido: false,
    });
  }

  return Array.from(processosMap.values());
};

