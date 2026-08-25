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
 * Extrai o usuário atribuído a partir de uma linha da tabela do SEI
 */
export const extrairAtribuicaoDaLinha = (tr: Element): string | null => {
  // 1. Elementos com classe ancoraSigla ou similar (padrão nativo do SEI)
  const ancoraSigla = tr.querySelector('a.ancoraSigla, span.ancoraSigla, .ancoraSigla, a[class*="Sigla"], span[class*="Sigla"]');
  if (ancoraSigla) {
    const texto = ancoraSigla.textContent?.trim();
    if (texto && texto.length >= 2 && !REGEX_NUMERO_PROCESSO.test(texto)) {
      return texto;
    }
    const title = ancoraSigla.getAttribute('title') || ancoraSigla.getAttribute('onmouseover');
    if (title) {
      const match = title.match(/atribu[íi]do\s+(?:para|a)\s*:?\s*([^"'\n\r);]+)/i);
      if (match?.[1]) {
        return match[1].replace(/^[^\w\d]+|[^\w\d]+$/g, '').trim();
      }
    }
  }

  // 2. Procura em elementos com title ou tooltip na linha
  const elementos = tr.querySelectorAll('[title], [onmouseover]');
  for (const el of elementos) {
    const title = el.getAttribute('title') || '';
    const mouseover = el.getAttribute('onmouseover') || '';
    const combinado = `${title} ${mouseover}`;
    const match = combinado.match(/atribu[íi]do\s+(?:para|a)\s*:?\s*([^"'\n\r);]+)/i);
    if (match?.[1]) {
      const extraido = match[1].replace(/^[^\w\d]+|[^\w\d]+$/g, '').trim();
      if (extraido && extraido.length >= 2 && !extraido.toLowerCase().includes('clique')) {
        return extraido;
      }
    }
  }

  return null;
};

/**
 * Extrai de forma robusta todos os argumentos de string de uma chamada infraTooltipMostrar
 */
export const extrairArgsInfraTooltip = (textoJs: string): string[] => {
  const indexInicio = textoJs.indexOf('infraTooltipMostrar');
  if (indexInicio === -1) return [];

  const abreParen = textoJs.indexOf('(', indexInicio);
  if (abreParen === -1) return [];

  const args: string[] = [];
  let dentroDeString = false;
  let quoteChar = '';
  let escape = false;
  let buffer = '';

  for (let i = abreParen + 1; i < textoJs.length; i++) {
    const char = textoJs[i];

    if (escape) {
      if (char === 'n') buffer += '\n';
      else if (char === 'r') buffer += '\r';
      else if (char === 't') buffer += '\t';
      else buffer += char;
      escape = false;
      continue;
    }

    if (char === '\\') {
      escape = true;
      continue;
    }

    if (dentroDeString) {
      if (char === quoteChar) {
        dentroDeString = false;
        args.push(buffer);
        buffer = '';
      } else {
        buffer += char;
      }
    } else {
      if (char === "'" || char === '"') {
        dentroDeString = true;
        quoteChar = char;
        buffer = '';
      } else if (char === ')') {
        break;
      }
    }
  }

  return args;
};

/**
 * Limpa e extrai o nome do marcador a partir de qualquer string bruta do SEI
 */
export const limparNomeMarcador = (textoBruto: string | null | undefined): string | null => {
  if (!textoBruto) return null;

  let texto = textoBruto.trim();

  // 1. Trata chamadas de tooltip JavaScript do SEI (infraTooltipMostrar)
  if (texto.includes('infraTooltipMostrar')) {
    const args = extrairArgsInfraTooltip(texto);
    if (args.length >= 2) {
      const arg1 = args[0] ?? '';
      const arg2 = args[1] ?? '';

      // No SEI, o padrão é: infraTooltipMostrar(observacao/despacho, nomeDoMarcador)
      // Ou infraTooltipMostrar(nomeDoMarcador, 'Marcador')
      // Ou infraTooltipMostrar(observacao, 'Marcador: NomeDoMarcador')
      const matchCabecalho = arg2.match(/^(?:marcador|tag)\s*:\s*(.+)/i);
      if (matchCabecalho?.[1]) {
        texto = matchCabecalho[1];
      } else if (/^(?:marcador|tag)$/i.test(arg2.trim())) {
        texto = arg1;
      } else {
        const matchArg1 = arg1.match(/^(?:marcador|tag)\s*:\s*(.+)/i);
        if (matchArg1?.[1]) {
          texto = matchArg1[1];
        } else {
          // Usa o segundo argumento como nome do marcador (ex: 'Cia QBRN', 'CIA BRESC')
          texto = arg2.length > 0 ? arg2 : arg1;
        }
      }
    } else if (args.length === 1 && args[0]) {
      texto = args[0];
    } else {
      // Se não conseguiu extrair argumentos do JS, não retorna o código fonte JS bruto
      return null;
    }
  }

  // 2. Remove tags HTML caso existam dentro do texto
  texto = texto.replace(/<[^>]+>/g, ' ');

  // 3. Remove prefixos comuns como "Marcador:", "Marcador -", "Marcador", "Tag:"
  texto = texto.replace(/^(?:marcador|tag|etiqueta)\s*[:\-–—]?\s*/iu, '');

  // 4. Remove aspas envolventes (ex: "Urgente", 'Urgente', “Urgente”)
  texto = texto.replace(/^["'“‘]+|["'”’]+$/gu, '').trim();

  // 5. Remove sufixos como " (Marcador)"
  texto = texto.replace(/\s*\((?:marcador|tag|etiqueta)\)$/iu, '').trim();

  // 6. Remove data e autor em tooltips do tipo "Urgente - Marco Guerra (24/08/2026 14:00)" ou "Urgente (24/08/2026)"
  texto = texto.replace(/\s*-\s*[A-Za-zÀ-ÿ0-9._\s]+\s*\(\s*\d{2}\/\d{2}\/\d{4}.*$/u, '').trim();
  texto = texto.replace(/\s*\(\s*\d{2}\/\d{2}\/\d{4}.*$/u, '').trim();

  // 7. Remove quebras de linha e espaços múltiplos
  texto = texto.replace(/\s+/g, ' ').trim();

  // 8. Rejeita se ainda contiver trechos de código JS ou lixo
  if (
    texto.includes('infraTooltipMostrar') ||
    texto.includes('return ') ||
    texto.includes('javascript:') ||
    texto.includes(';')
  ) {
    return null;
  }

  // 9. Validações finais de conteúdo e exclusão de termos de ação
  const minusculo = texto.toLowerCase();
  if (
    texto.length < 2 ||
    texto.length > 60 ||
    minusculo === 'marcador' ||
    minusculo === 'marcadores' ||
    minusculo.startsWith('gerenciar marcador') ||
    minusculo.startsWith('andamento do marcador') ||
    minusculo.startsWith('clique para') ||
    minusculo.startsWith('adicionar marcador') ||
    minusculo.startsWith('novo marcador') ||
    minusculo === 'todos' ||
    minusculo === 'nenhum'
  ) {
    return null;
  }

  return texto;
};

/**
 * Extrai marcadores associados a um processo na linha da tabela
 */
export const extrairMarcadoresDaLinha = (tr: Element): string[] => {
  const marcadores = new Set<string>();

  // 1. Procura elementos âncoras ou imagens especificamente de marcadores no SEI
  const elementosMarcador = tr.querySelectorAll(
    'a[href*="marcador" i], a[href*="id_andamento_marcador" i], img[src*="marcador" i], img[src*="tag" i], [class*="marcador" i], [id*="marcador" i]'
  );

  for (const el of elementosMarcador) {
    const fontes: (string | null | undefined)[] = [
      el.getAttribute('onmouseover'),
      el.getAttribute('title'),
      el.getAttribute('alt'),
      el.getAttribute('data-title'),
      el.getAttribute('data-original-title'),
      el.textContent,
    ];

    const imgFilha = el.querySelector('img');
    if (imgFilha) {
      fontes.push(
        imgFilha.getAttribute('onmouseover'),
        imgFilha.getAttribute('title'),
        imgFilha.getAttribute('alt')
      );
    }

    for (const fonte of fontes) {
      const nomeLimpo = limparNomeMarcador(fonte);
      if (nomeLimpo) {
        marcadores.add(nomeLimpo);
      }
    }
  }

  // 2. Procura em outros elementos com title ou onmouseover na linha que mencionem marcador
  const outrosComTitle = tr.querySelectorAll('[title*="marcador" i], [onmouseover*="marcador" i], [alt*="marcador" i]');
  for (const el of outrosComTitle) {
    const fontes = [el.getAttribute('onmouseover'), el.getAttribute('title'), el.getAttribute('alt')];
    for (const fonte of fontes) {
      const nomeLimpo = limparNomeMarcador(fonte);
      if (nomeLimpo) {
        marcadores.add(nomeLimpo);
      }
    }
  }

  return Array.from(marcadores);
};

/**
 * Extrai todos os marcadores disponíveis na página de controle do SEI (tabela e selects de filtro)
 */
export const extrairTodosMarcadoresDaPagina = (htmlOuDoc: string | Document): string[] => {
  let doc: Document;
  if (typeof htmlOuDoc === 'string') {
    if (!htmlOuDoc || typeof htmlOuDoc !== 'string') return [];
    const parser = new DOMParser();
    doc = parser.parseFromString(htmlOuDoc, 'text/html');
  } else {
    doc = htmlOuDoc;
  }

  const marcadores = new Set<string>();

  // 1. Procura em selects de filtros do SEI
  const selects = doc.querySelectorAll<HTMLSelectElement>(
    'select[id*="Marcador" i], select[name*="Marcador" i], select[id*="tag" i]'
  );
  for (const sel of selects) {
    for (const opt of sel.options) {
      const texto = opt.textContent?.trim();
      const limpo = limparNomeMarcador(texto);
      if (limpo) {
        marcadores.add(limpo);
      }
    }
  }

  // 2. Procura em todas as linhas da tabela
  const linhas = doc.querySelectorAll('tr');
  for (const tr of linhas) {
    const daLinha = extrairMarcadoresDaLinha(tr);
    for (const m of daLinha) {
      marcadores.add(m);
    }
  }

  return Array.from(marcadores);
};

/**
 * Extrai a sigla ou nome do usuário logado na interface do SEI
 */
export const extrairUsuarioLogado = (htmlOuDoc: string | Document): string | null => {
  let doc: Document;
  if (typeof htmlOuDoc === 'string') {
    if (!htmlOuDoc || typeof htmlOuDoc !== 'string') return null;
    const parser = new DOMParser();
    doc = parser.parseFromString(htmlOuDoc, 'text/html');
  } else {
    doc = htmlOuDoc;
  }

  const seletores = [
    '#lblUsuario',
    '#spanUsuario',
    'a#ancoraUsuario',
    '#infraMenuSistema #lblUsuario',
    '#divInfraBarraLocalizacao a[title*="Usuário"]',
    'a.ancoraUsuario',
    'span.infraSiglaUsuario',
  ];

  for (const seletor of seletores) {
    const el = doc.querySelector(seletor);
    if (el) {
      const texto = el.textContent?.trim();
      if (texto && texto.length >= 2) {
        const matchSigla = texto.match(/\(([^)]+)\)/);
        if (matchSigla?.[1]) {
          return matchSigla[1].trim();
        }
        return texto;
      }
    }
  }

  const barra = doc.querySelector('#divInfraBarraLocalizacao, #infraBarraComandosSuperior, #header');
  if (barra) {
    const texto = barra.textContent || '';
    const matchUser = texto.match(/Usu[áa]rio:\s*([A-Za-z0-9._\-]+)/i);
    if (matchUser?.[1]) {
      return matchUser[1].trim();
    }
  }

  return null;
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
    let atribuidoPara: string | null = null;
    let marcadores: string[] = [];

    if (tr) {
      assunto = extrairAssuntoDaLinha(tr, link);
      atribuidoPara = extrairAtribuicaoDaLinha(tr);
      marcadores = extrairMarcadoresDaLinha(tr);
    } else {
      assunto = extrairTextoAssunto(link.getAttribute('title'));
    }

    processosMap.set(numero, {
      numero,
      assunto,
      link: linkCompleto,
      detectadoEm: agora,
      lido: false,
      atribuidoPara,
      marcadores: marcadores.length > 0 ? marcadores : undefined,
    });
  }

  return Array.from(processosMap.values());
};

