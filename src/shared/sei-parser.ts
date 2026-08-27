import type { DetalheMarcador, ProcessoSei } from '../types';

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

  // Extrai o conteúdo de tooltips JavaScript do SEI (infraTooltipMostrar).
  //
  // É comum o SEI emitir o primeiro argumento vazio, como em
  // infraTooltipMostrar('','Pedidos, Oferecimentos e Informações Diversas') —
  // por isso a leitura precisa percorrer os argumentos e pegar o primeiro que
  // tenha conteúdo, em vez de assumir que o assunto está no primeiro deles.
  if (texto.includes('infraTooltipMostrar')) {
    const args = extrairArgsInfraTooltip(texto);
    const primeiroComConteudo = args.find((arg) => arg.trim().length > 0);
    if (!primeiroComConteudo) return null;
    texto = primeiroComConteudo.replace(
      /^(?:assunto|especifica[çc][ãa]o|tipo do processo)\s*:\s*/iu,
      ''
    );
  }

  // Remove tags HTML e normaliza espaços
  texto = texto.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  // Nunca devolve código: se sobrou JavaScript, é melhor não ter assunto
  if (
    texto.includes('infraTooltipMostrar') ||
    texto.includes('javascript:') ||
    /^return\b/iu.test(texto)
  ) {
    return null;
  }

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
 * Localiza o índice da coluna "Atribuição" a partir do cabeçalho da tabela do SEI.
 *
 * Saber o índice é o que permite diferenciar "célula lida e vazia" (sem atribuição)
 * de "não foi possível ler" — distinção da qual o filtro "Sem atribuição" depende.
 */
export const localizarIndiceColunaAtribuicao = (tabela: Element | null): number | null => {
  if (!tabela) return null;

  // O SEI nem sempre usa <th>; quando não usa, a primeira linha faz papel de cabeçalho
  const linhaCabecalho = tabela.querySelector('thead tr') || tabela.querySelector('tr');
  if (!linhaCabecalho) return null;

  const celulas = linhaCabecalho.querySelectorAll('th, td');
  for (let i = 0; i < celulas.length; i++) {
    const texto = celulas[i]?.textContent?.trim() || '';
    if (/atribui/iu.test(texto)) {
      return i;
    }
  }

  return null;
};

/**
 * Lê a célula de atribuição pelo índice de coluna conhecido.
 * Devolve `null` quando a célula existe e está vazia (sem atribuição confirmada)
 * e `undefined` quando a célula não pôde ser lida com confiança.
 */
const lerAtribuicaoPorColuna = (tr: Element, indiceColuna: number): string | null | undefined => {
  const celulas = tr.querySelectorAll(':scope > td');
  const celula = celulas[indiceColuna];
  if (!celula) return undefined;

  const texto = (celula.textContent || '').replace(/\s+/g, ' ').trim();

  // Célula lida e vazia (ou apenas com traço de "vazio" do SEI) = sem atribuição
  if (!texto || /^[-–—.\s]+$/u.test(texto)) return null;

  // Número de processo na célula indica que o índice não corresponde à atribuição
  if (REGEX_NUMERO_PROCESSO.test(texto)) return undefined;

  return texto.length >= 2 ? texto : null;
};

/**
 * Extrai o usuário atribuído a partir de uma linha da tabela do SEI.
 *
 * Retorna `string` quando atribuído, `null` quando a coluna foi lida e está vazia,
 * e `undefined` quando não foi possível determinar.
 */
export const extrairAtribuicaoDaLinha = (
  tr: Element,
  indiceColuna?: number | null
): string | null | undefined => {
  // 0. Caminho preferencial: coluna "Atribuição" localizada pelo cabeçalho.
  // Só cai para as heurísticas quando a leitura por coluna é inconclusiva.
  if (typeof indiceColuna === 'number' && indiceColuna >= 0) {
    const daColuna = lerAtribuicaoPorColuna(tr, indiceColuna);
    if (daColuna !== undefined) return daColuna;
  }

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

  // Nenhuma pista encontrada: indeterminado, e não "sem atribuição"
  return undefined;
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
 * Decide, entre os argumentos de uma chamada infraTooltipMostrar, qual representa
 * o nome do marcador e qual (se houver) representa o texto da observação/despacho.
 * Ex.: infraTooltipMostrar('Ten Biagini, Of. 3107...', 'Marcador: Almoxarifado')
 */
const separarNomeETextoDoTooltip = (
  args: string[]
): { nomeBruto: string; textoBruto?: string } | null => {
  if (args.length >= 2) {
    const arg1 = args[0] ?? '';
    const arg2 = args[1] ?? '';

    // No SEI, o padrão é: infraTooltipMostrar(observacao/despacho, nomeDoMarcador)
    // Ou infraTooltipMostrar(nomeDoMarcador, 'Marcador')
    // Ou infraTooltipMostrar(observacao, 'Marcador: NomeDoMarcador')
    const matchCabecalho = arg2.match(/^(?:marcador|tag)\s*:\s*(.+)/i);
    if (matchCabecalho?.[1]) {
      return { nomeBruto: matchCabecalho[1], textoBruto: arg1 };
    }

    if (/^(?:marcador|tag)$/i.test(arg2.trim())) {
      return { nomeBruto: arg1 };
    }

    const matchArg1 = arg1.match(/^(?:marcador|tag)\s*:\s*(.+)/i);
    if (matchArg1?.[1]) {
      return { nomeBruto: matchArg1[1] };
    }

    // Usa o segundo argumento como nome do marcador (ex: 'Cia QBRN', 'CIA BRESC')
    // e o primeiro, quando presente, como texto da observação/despacho
    return arg2.length > 0 ? { nomeBruto: arg2, textoBruto: arg1 } : { nomeBruto: arg1 };
  }

  if (args.length === 1 && args[0]) {
    return { nomeBruto: args[0] };
  }

  // Se não conseguiu extrair argumentos do JS, não retorna o código fonte JS bruto
  return null;
};

/**
 * Limpa e valida o texto da observação/despacho de um marcador (sem as restrições
 * de tamanho/conteúdo aplicadas ao nome, já que pode ser um despacho longo)
 */
const limparTextoObservacaoMarcador = (textoBruto: string | null | undefined): string | undefined => {
  if (!textoBruto) return undefined;

  let texto = textoBruto.trim();
  texto = texto.replace(/<[^>]+>/g, ' ');
  texto = texto.replace(/\s+/g, ' ').trim();

  if (texto.length === 0 || texto.length > 1000) return undefined;
  return texto;
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
    const separado = separarNomeETextoDoTooltip(args);
    if (!separado) return null;
    texto = separado.nomeBruto;
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
 * Extrai nome e, quando disponível, o texto da observação/despacho de um marcador
 * a partir de qualquer string bruta do SEI (title, onmouseover, alt, etc.)
 */
export const extrairDetalheMarcador = (textoBruto: string | null | undefined): DetalheMarcador | null => {
  if (!textoBruto) return null;

  const textoOriginal = textoBruto.trim();

  if (textoOriginal.includes('infraTooltipMostrar')) {
    const args = extrairArgsInfraTooltip(textoOriginal);
    const separado = separarNomeETextoDoTooltip(args);
    if (!separado) return null;

    const nome = limparNomeMarcador(separado.nomeBruto);
    if (!nome) return null;

    const texto = limparTextoObservacaoMarcador(separado.textoBruto);
    return texto ? { nome, texto } : { nome };
  }

  const nome = limparNomeMarcador(textoOriginal);
  return nome ? { nome } : null;
};

/**
 * Extrai marcadores (nome + texto da observação/despacho, quando disponível)
 * associados a um processo na linha da tabela
 */
export const extrairMarcadoresDaLinha = (tr: Element): DetalheMarcador[] => {
  const marcadores = new Map<string, DetalheMarcador>();

  const registrar = (fonte: string | null | undefined) => {
    const detalhe = extrairDetalheMarcador(fonte);
    if (!detalhe) return;
    const existente = marcadores.get(detalhe.nome);
    // Mantém o primeiro nome encontrado, mas completa com o texto assim que disponível
    if (!existente) {
      marcadores.set(detalhe.nome, detalhe);
    } else if (!existente.texto && detalhe.texto) {
      marcadores.set(detalhe.nome, detalhe);
    }
  };

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
      registrar(fonte);
    }
  }

  // 2. Procura em outros elementos com title ou onmouseover na linha que mencionem marcador
  const outrosComTitle = tr.querySelectorAll('[title*="marcador" i], [onmouseover*="marcador" i], [alt*="marcador" i]');
  for (const el of outrosComTitle) {
    const fontes = [el.getAttribute('onmouseover'), el.getAttribute('title'), el.getAttribute('alt')];
    for (const fonte of fontes) {
      registrar(fonte);
    }
  }

  return Array.from(marcadores.values());
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
      marcadores.add(m.nome);
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
 * Extrai a sigla da unidade ativa do usuário na interface do SEI.
 *
 * É essa sigla que permite identificar, na tabela de andamento, qual dos envios
 * fez o processo chegar até a unidade do usuário.
 */
export const extrairUnidadeAtual = (htmlOuDoc: string | Document): string | null => {
  let doc: Document;
  if (typeof htmlOuDoc === 'string') {
    if (!htmlOuDoc) return null;
    const parser = new DOMParser();
    doc = parser.parseFromString(htmlOuDoc, 'text/html');
  } else {
    doc = htmlOuDoc;
  }

  const limpar = (bruto: string | null | undefined): string | null => {
    if (!bruto) return null;
    const texto = bruto.replace(/\s+/g, ' ').trim();
    if (texto.length < 2 || texto.length > 60) return null;
    const minusculo = texto.toLowerCase();
    if (minusculo === 'unidade' || minusculo.startsWith('selecione')) return null;
    return texto;
  };

  // 1. Seletor de unidades do SEI: a opção marcada é a unidade ativa
  const select = doc.querySelector<HTMLSelectElement>('#selInfraUnidades, select[id*="Unidade" i]');
  if (select) {
    const opcaoMarcada =
      select.querySelector('option[selected]') ||
      (select.selectedIndex >= 0 ? select.options[select.selectedIndex] : null);
    const daOpcao = limpar(opcaoMarcada?.textContent);
    if (daOpcao) return daOpcao;
  }

  // 2. Rótulos que o SEI usa para exibir a unidade corrente
  for (const seletor of ['#lblInfraUnidade', '#spanInfraUnidade', '.infraSiglaUnidade']) {
    const daEtiqueta = limpar(doc.querySelector(seletor)?.textContent);
    if (daEtiqueta) return daEtiqueta;
  }

  // 3. Varredura textual na barra do sistema
  const barra = doc.querySelector('#divInfraBarraSistema, #divInfraBarraLocalizacao, #infraBarraComandosSuperior');
  const matchBarra = (barra?.textContent || '').match(/Unidade\s*:?\s*([A-Za-zÀ-ÿ0-9ºª._\-/]+)/iu);
  return limpar(matchBarra?.[1]);
};

/**
 * Indica se o HTML corresponde à tela de login ou a uma sessão expirada do SEI.
 * Centraliza a checagem que antes estava duplicada no parser e no service worker.
 */
export const ehTelaDeLogin = (html: string): boolean => {
  if (!html || typeof html !== 'string') return false;
  return (
    html.includes('txtUsuario') ||
    html.includes('txtSenha') ||
    html.includes('formLogin') ||
    html.includes('Sessão finalizada') ||
    html.includes('Informe seu usuário e senha')
  );
};

/**
 * Converte "dd/mm/aaaa[ hh:mm[:ss]]" (formato do SEI) para ISO 8601.
 * A data do SEI vem sem fuso explícito, então é interpretada como horário local.
 */
export const parsearDataHoraSei = (texto: string | null | undefined): string | null => {
  if (!texto) return null;

  const match = texto
    .replace(/\s+/g, ' ')
    .trim()
    .match(/(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/u);

  if (!match) return null;

  const [, dia, mes, ano, hora, minuto, segundo] = match;
  const data = new Date(
    Number(ano),
    Number(mes) - 1,
    Number(dia),
    Number(hora ?? 0),
    Number(minuto ?? 0),
    Number(segundo ?? 0)
  );

  if (Number.isNaN(data.getTime())) return null;

  // Rejeita datas absurdas, típicas de leitura equivocada de outra coluna
  if (data.getFullYear() < 1990 || data.getFullYear() > 2200) return null;

  return data.toISOString();
};

export interface PrazoProcesso {
  iso: string;
  texto: string;
}

const REGEX_DATA_BR = /(\d{2}\/\d{2}\/\d{4})/u;
const REGEX_MENCAO_PRAZO = /prazo|retorno\s+programado|sobrestad/iu;

/**
 * Extrai o prazo (retorno programado) de uma linha da tabela do SEI.
 *
 * O SEI sinaliza prazo com um ícone cujo title/tooltip traz a data, por exemplo
 * "Retorno Programado em 30/08/2026". A varredura é tolerante porque a marcação
 * varia entre versões: procura qualquer texto da linha que cite prazo/retorno e
 * contenha uma data.
 */
export const extrairPrazoDaLinha = (tr: Element): PrazoProcesso | null => {
  const candidatos: (string | null)[] = [];

  for (const el of tr.querySelectorAll('[title], [onmouseover], [alt], img')) {
    candidatos.push(
      el.getAttribute('title'),
      el.getAttribute('onmouseover'),
      el.getAttribute('alt')
    );

    // Ícones costumam nomear a ação no próprio arquivo (retorno_programado.gif)
    const src = el.getAttribute('src');
    if (src && REGEX_MENCAO_PRAZO.test(src)) {
      candidatos.push(el.getAttribute('title'), el.getAttribute('alt'), el.textContent);
    }
  }

  // Células com o prazo em texto puro, quando a tabela tem coluna própria
  for (const td of tr.querySelectorAll('td')) {
    candidatos.push(td.textContent);
  }

  for (const bruto of candidatos) {
    if (!bruto) continue;
    const texto = bruto.replace(/\s+/g, ' ').trim();
    if (!REGEX_MENCAO_PRAZO.test(texto)) continue;

    const data = texto.match(REGEX_DATA_BR)?.[1];
    if (!data) continue;

    const iso = parsearDataHoraSei(data);
    if (iso) return { iso, texto: data };
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
  if (ehTelaDeLogin(html)) {
    return [];
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const processosMap = new Map<string, ProcessoSei>();
  const tabelaPorNumero = new Map<string, Element | null>();
  const agora = new Date().toISOString();

  // O índice da coluna "Atribuição" é resolvido uma única vez por tabela e
  // reaproveitado em todas as linhas dela
  const indicePorTabela = new Map<Element, number | null>();
  const obterIndiceAtribuicao = (tr: Element): number | null => {
    const tabela = tr.closest('table');
    if (!tabela) return null;
    if (!indicePorTabela.has(tabela)) {
      indicePorTabela.set(tabela, localizarIndiceColunaAtribuicao(tabela));
    }
    return indicePorTabela.get(tabela) ?? null;
  };

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
    let atribuidoPara: string | null | undefined;
    let marcadores: DetalheMarcador[] = [];

    let prazo: PrazoProcesso | null = null;

    if (tr) {
      assunto = extrairAssuntoDaLinha(tr, link);
      atribuidoPara = extrairAtribuicaoDaLinha(tr, obterIndiceAtribuicao(tr));
      marcadores = extrairMarcadoresDaLinha(tr);
      prazo = extrairPrazoDaLinha(tr);
      tabelaPorNumero.set(numero, tr.closest('table'));
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
      ...(prazo ? { prazo: prazo.iso, prazoTexto: prazo.texto } : {}),
    });
  }

  // Se o parser conseguiu ler a atribuição de alguma linha da tabela, ele sabe lê-la
  // ali — então a ausência de marca nas demais linhas significa "sem atribuição", e
  // não "não consegui determinar".
  //
  // Sem isso, a tela de Controle de Processos (que não tem cabeçalho "Atribuição",
  // só a sigla ao lado do número) deixava todo mundo como indeterminado, e o filtro
  // "Sem atribuição" ficava permanentemente zerado.
  const tabelasComLeituraConfiavel = new Set<Element>();
  for (const [numero, processo] of processosMap) {
    const tabela = tabelaPorNumero.get(numero);
    if (tabela && typeof processo.atribuidoPara === 'string') {
      tabelasComLeituraConfiavel.add(tabela);
    }
  }

  for (const [numero, processo] of processosMap) {
    if (processo.atribuidoPara !== undefined) continue;
    const tabela = tabelaPorNumero.get(numero);
    if (tabela && tabelasComLeituraConfiavel.has(tabela)) {
      processosMap.set(numero, { ...processo, atribuidoPara: null });
    }
  }

  return Array.from(processosMap.values());
};

