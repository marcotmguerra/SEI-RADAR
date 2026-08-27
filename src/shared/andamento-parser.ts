import type { LinhaAndamento, ResumoAndamento } from '../types';
import { parsearDataHoraSei, resolverUrlAbsoluta } from './sei-parser';

export { parsearDataHoraSei };

const obterDocumento = (htmlOuDoc: string | Document): Document | null => {
  if (typeof htmlOuDoc !== 'string') return htmlOuDoc;
  if (!htmlOuDoc) return null;
  // O service worker do MV3 não tem DOMParser; quem depende de DOM trata o null
  if (typeof DOMParser === 'undefined') return null;
  return new DOMParser().parseFromString(htmlOuDoc, 'text/html');
};

/** Ações do SEI que levam ao histórico do processo */
const ACAO_DE_HISTORICO = /acao=[a-z_]*(?:historico|andamento)[a-z_]*/iu;
const URL_CONTROLADOR_GLOBAL = /controlador\.php\?[^'"\s<>\\]+/giu;

/** Converte as entidades que aparecem em URLs dentro de atributos HTML */
const decodificarEntidades = (texto: string): string =>
  texto
    .replace(/&amp;/giu, '&')
    .replace(/&#38;/gu, '&')
    .replace(/&quot;/giu, '"')
    .replace(/&#39;/gu, "'");

/** Lê o id_procedimento de uma URL do SEI, quando presente */
export const idDoProcedimento = (url: string | null | undefined): string | null =>
  url?.match(/id_procedimento=(\d+)/iu)?.[1] ?? null;

/**
 * Lista, em ordem de confiança, os links de histórico presentes no HTML.
 *
 * Devolver a lista inteira, e não só o primeiro, é o que permite ao chamador tentar
 * o próximo quando um candidato não leva à tabela: a página do processo cita vários
 * links que casam com "histórico", e parar no primeiro fazia a busca falhar em parte
 * dos processos sem nunca experimentar o link certo.
 *
 * A varredura é textual, então funciona também no service worker do Manifest V3,
 * onde `DOMParser` não existe.
 */
export const listarLinksAndamentoNoTexto = (
  html: string,
  urlBase: string,
  idPreferido?: string | null
): string[] => {
  if (!html || typeof html !== 'string') return [];

  // Três níveis de confiança: o histórico deste processo, o de algum processo, e
  // o que sequer identifica um processo
  const doProcessoAlvo: string[] = [];
  const comProcedimento: string[] = [];
  const semProcedimento: string[] = [];
  const vistos = new Set<string>();

  for (const bruta of html.match(URL_CONTROLADOR_GLOBAL) || []) {
    const url = decodificarEntidades(bruta);

    // Links de marcador também citam "andamento" (id_andamento_marcador), e o menu
    // do SEI tem "Histórico de Processos Visitados", que casa com /historico/ mas
    // não é o histórico deste processo
    if (/marcador|visitad/iu.test(url)) continue;
    if (!ACAO_DE_HISTORICO.test(url)) continue;

    const absoluta = resolverUrlAbsoluta(url, urlBase);
    if (vistos.has(absoluta)) continue;
    vistos.add(absoluta);

    const id = idDoProcedimento(url);
    if (id && idPreferido && id === idPreferido) doProcessoAlvo.push(absoluta);
    else if (id) comProcedimento.push(absoluta);
    else semProcedimento.push(absoluta);
  }

  return [...doProcessoAlvo, ...comProcedimento, ...semProcedimento];
};

/**
 * Descobre o link mais provável do histórico varrendo o HTML como texto.
 */
export const descobrirLinkAndamentoNoTexto = (
  html: string,
  urlBase: string
): string | null => listarLinksAndamentoNoTexto(html, urlBase)[0] ?? null;

/**
 * Lista as URLs dos frames varrendo o HTML como texto, sem depender de DOM.
 * Necessário no service worker do Manifest V3, que não tem DOMParser.
 */
export const extrairUrlsDeFramesNoTexto = (html: string, urlBase: string): string[] => {
  if (!html || typeof html !== 'string') return [];

  const urls: string[] = [];
  const vistos = new Set<string>();
  const regex = /<(?:i?frame)\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/giu;

  for (const match of html.matchAll(regex)) {
    const src = decodificarEntidades((match[1] || '').trim());
    if (!src || src.startsWith('#') || /^(?:javascript|about):/iu.test(src)) continue;

    const absoluta = resolverUrlAbsoluta(src, urlBase);
    if (!vistos.has(absoluta)) {
      vistos.add(absoluta);
      urls.push(absoluta);
    }
  }

  return urls;
};

/**
 * Teto de links de histórico tentados por página.
 *
 * Sem teto, uma página que cita muitos processos viraria uma rajada de requisições
 * contra o SEI; na prática o link certo está entre os primeiros da ordem de confiança.
 */
const LIMITE_CANDIDATOS_POR_PAGINA = 4;

export interface OpcoesBuscaAndamento {
  /** Baixa o HTML de uma URL, já decodificado */
  baixar: (url: string) => Promise<string>;
  /** Extrai as linhas da tabela de andamento de um HTML */
  parsearLinhas: (html: string) => LinhaAndamento[] | Promise<LinhaAndamento[]>;
  /** Lista os frames de um HTML */
  extrairFrames: (html: string, urlBase: string) => string[];
  /** Informa se um HTML tinha tabela reconhecível, para diagnosticar a falha */
  analisar?: (
    html: string
  ) =>
    | { tabelaEncontrada: boolean; linhasBrutas: number; tabelas?: number }
    | Promise<{ tabelaEncontrada: boolean; linhasBrutas: number; tabelas?: number }>;
  /** Indica se um HTML é a tela de login do SEI */
  ehLogin: (html: string) => boolean;
  profundidadeMaxima?: number;
}

export interface ResultadoBuscaAndamentoBruta {
  linhas: LinhaAndamento[];
  /** HTML onde a tabela foi encontrada, para detectar paginação */
  htmlDaTabela?: string;
  /** URL do histórico quando a tabela foi lida a partir dele */
  linkAndamento?: string;
  /** URL de histórico que chegamos a abrir, mesmo sem reconhecer a tabela */
  linkTentado?: string;
  paginasInspecionadas: number;
  sessaoExpirada: boolean;
  /** Verdadeiro quando alguma página tinha a tabela, mas sem linhas legíveis */
  tabelaSemRegistros: boolean;
  /** Maior número de tabelas visto numa das páginas, para diagnosticar a falha */
  tabelasNaPagina: number;
}

/**
 * Percorre a página do processo atrás da tabela de andamento, descendo pelos frames
 * e seguindo o link "Consultar Andamento".
 *
 * A travessia mora aqui, e não em cada chamador, porque o content script e o service
 * worker precisam do mesmo comportamento com mecanismos diferentes (DOM local vs.
 * documento offscreen). Quando essa lógica estava duplicada, os dois divergiram: o
 * service worker fazia um único salto e nunca achava o histórico.
 */
export const procurarAndamento = async (
  urlInicial: string,
  opcoes: OpcoesBuscaAndamento
): Promise<ResultadoBuscaAndamentoBruta> => {
  const { baixar, parsearLinhas, extrairFrames, ehLogin, analisar, profundidadeMaxima = 5 } = opcoes;

  const visitadas = new Set<string>();
  const estado: ResultadoBuscaAndamentoBruta = {
    linhas: [],
    paginasInspecionadas: 0,
    sessaoExpirada: false,
    tabelaSemRegistros: false,
    tabelasNaPagina: 0,
  };

  // O histórico certo é o que cita o mesmo processo da URL de partida
  const idAlvo = idDoProcedimento(urlInicial);

  const procurar = async (url: string, profundidade: number): Promise<LinhaAndamento[]> => {
    if (profundidade > profundidadeMaxima || visitadas.has(url)) return [];
    visitadas.add(url);

    const html = await baixar(url);
    estado.paginasInspecionadas++;

    if (ehLogin(html)) {
      estado.sessaoExpirada = true;
      return [];
    }

    // 1. A própria página já contém a tabela?
    const daPagina = await parsearLinhas(html);
    if (daPagina.length > 0) {
      estado.htmlDaTabela = html;
      if (url !== urlInicial) estado.linkAndamento = url;
      return daPagina;
    }

    if (analisar) {
      const analise = await analisar(html);
      if (analise.tabelaEncontrada) estado.tabelaSemRegistros = true;
      if (typeof analise.tabelas === 'number') {
        estado.tabelasNaPagina = Math.max(estado.tabelasNaPagina, analise.tabelas);
      }
    }

    // 2. Há link de "Consultar Andamento"? A página dele passa pela mesma rotina,
    //    porque costuma voltar dentro do layout de frames do SEI.
    //
    //    Todos os candidatos são tentados, do mais confiável ao menos: o primeiro
    //    link que casa com "histórico" nem sempre é o deste processo, e desistir
    //    nele deixava parte dos processos sem andamento.
    const candidatos = listarLinksAndamentoNoTexto(html, url, idAlvo).slice(
      0,
      LIMITE_CANDIDATOS_POR_PAGINA
    );

    for (const candidato of candidatos) {
      if (visitadas.has(candidato)) continue;
      estado.linkTentado = candidato;
      const doHistorico = await procurar(candidato, profundidade + 1);
      if (doHistorico.length > 0) {
        estado.linkAndamento = candidato;
        return doHistorico;
      }
      if (estado.sessaoExpirada) return [];
    }

    // 3. Desce para os frames desta página
    for (const urlFrame of extrairFrames(html, url)) {
      const doFrame = await procurar(urlFrame, profundidade + 1);
      if (doFrame.length > 0) return doFrame;
      if (estado.sessaoExpirada) return [];
    }

    return [];
  };

  estado.linhas = await procurar(urlInicial, 0);
  return estado;
};

/**
 * Descobre a URL da tela "Consultar Andamento" a partir do HTML da página do processo.
 *
 * As URLs do SEI carregam um `infra_hash` calculado no servidor, então não é possível
 * montá-las por concatenação — é obrigatório seguir o link já presente no HTML.
 */
export const descobrirLinkAndamento = (
  htmlOuDoc: string | Document,
  urlBase: string
): string | null => {
  // Caminho principal: varredura textual, que funciona com ou sem DOM
  if (typeof htmlOuDoc === 'string') {
    const doTexto = descobrirLinkAndamentoNoTexto(htmlOuDoc, urlBase);
    if (doTexto) return doTexto;
  }

  const doc = obterDocumento(htmlOuDoc);
  if (!doc) return null;

  // O SEI frequentemente usa href="javascript:void(0)" e coloca a URL real dentro do
  // onclick (infraAbrirJanela, location.href, window.open). Ignorar esses casos era o
  // que impedia de achar o "Consultar Andamento".
  const URL_EM_SCRIPT = /['"]([^'"\s]*controlador\.php\?[^'"\s]+)['"]/iu;

  const candidatoValido = (href: string | null | undefined): string | null => {
    if (!href) return null;
    const limpo = href.trim();
    if (!limpo || limpo.startsWith('#')) return null;

    if (limpo.toLowerCase().startsWith('javascript:')) {
      const embutida = limpo.match(URL_EM_SCRIPT);
      return embutida?.[1] ? resolverUrlAbsoluta(embutida[1], urlBase) : null;
    }

    return resolverUrlAbsoluta(limpo, urlBase);
  };

  /** Procura a URL dentro de atributos de script do elemento */
  const daScriptDoElemento = (el: Element): string | null => {
    for (const atributo of ['onclick', 'onmousedown', 'href']) {
      const valor = el.getAttribute(atributo);
      const match = valor?.match(URL_EM_SCRIPT);
      if (match?.[1] && /historico|andamento/iu.test(match[1])) {
        return resolverUrlAbsoluta(match[1], urlBase);
      }
    }
    return null;
  };

  // 1. Varre atributos atrás de qualquer URL do controlador cuja ação mencione
  //    histórico ou andamento.
  //
  //    Depender do nome exato da ação já custou caro: no SEI-MG ela se chama
  //    `procedimento_consultar_historico`, e fica dentro de
  //    onclick="consultarAndamento('controlador.php?acao=...')" com href="#".
  //    Casar pelo miolo da ação cobre as variações entre instalações.
  // Mesma priorização da varredura textual: exige id_procedimento e descarta
  // marcadores e o "Histórico de Processos Visitados" do menu
  const daVarredura = (valor: string | null | undefined): string | null =>
    valor ? descobrirLinkAndamentoNoTexto(valor, urlBase) : null;

  for (const el of doc.querySelectorAll('a, [onclick], [onmousedown], [href]')) {
    for (const atributo of Array.from(el.attributes)) {
      const encontrada = daVarredura(atributo.value);
      if (encontrada) return encontrada;
    }
  }

  // 1b. Scripts embutidos que montam a URL do histórico
  for (const script of doc.querySelectorAll('script')) {
    const encontrada = daVarredura(script.textContent);
    if (encontrada) return encontrada;
  }

  // 2. Qualquer link cujo texto, title ou ícone mencione "consultar andamento"
  const REGEX_ROTULO = /consultar\s+andamento|hist[óo]rico\s+do\s+processo|andamento\s+do\s+processo/iu;
  for (const ancora of doc.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    const imagem = ancora.querySelector('img');
    const rotulos = [
      ancora.getAttribute('title'),
      ancora.getAttribute('alt'),
      ancora.textContent,
      imagem?.getAttribute('title'),
      imagem?.getAttribute('alt'),
    ];

    if (rotulos.some((rotulo) => rotulo && REGEX_ROTULO.test(rotulo))) {
      const doRotulo = candidatoValido(ancora.getAttribute('href')) || daScriptDoElemento(ancora);
      if (doRotulo) return doRotulo;
    }
  }

  // 2b. Elementos clicáveis que não são âncoras (botões e imagens da barra do SEI)
  for (const el of doc.querySelectorAll('[onclick]')) {
    const rotulos = [el.getAttribute('title'), el.getAttribute('alt'), el.textContent];
    if (rotulos.some((rotulo) => rotulo && REGEX_ROTULO.test(rotulo))) {
      const doScript = daScriptDoElemento(el);
      if (doScript) return doScript;
    }
  }

  // 3. Último recurso: href que contenha "andamento" sem ser link de marcador
  for (const ancora of doc.querySelectorAll<HTMLAnchorElement>('a[href*="andamento" i]')) {
    const href = ancora.getAttribute('href') || '';
    if (/marcador/iu.test(href)) continue;
    const generico = candidatoValido(href);
    if (generico) return generico;
  }

  return null;
};

/**
 * Lista as URLs dos frames de uma página do SEI.
 *
 * A tela do processo (`procedimento_trabalhar`) é um frameset: a barra de ações,
 * onde fica "Consultar Andamento", vive num frame filho. Sem seguir os frames,
 * a busca pelo link no documento de topo não encontra nada.
 */
export const extrairUrlsDeFrames = (htmlOuDoc: string | Document, urlBase: string): string[] => {
  const doc = obterDocumento(htmlOuDoc);
  if (!doc) return [];

  const urls: string[] = [];
  const vistos = new Set<string>();

  for (const frame of doc.querySelectorAll<HTMLElement>('iframe[src], frame[src]')) {
    const src = frame.getAttribute('src')?.trim();
    if (!src || src.startsWith('#') || src.toLowerCase().startsWith('javascript:')) continue;
    if (/^about:/iu.test(src)) continue;

    const absoluta = resolverUrlAbsoluta(src, urlBase);
    if (!vistos.has(absoluta)) {
      vistos.add(absoluta);
      urls.push(absoluta);
    }
  }

  return urls;
};

interface MapaColunas {
  dataHora: number;
  unidade: number;
  usuario: number;
  descricao: number;
}

interface TabelaAndamento {
  tabela: Element;
  colunas: MapaColunas;
  /** Linha a ignorar na extração; nula quando a tabela foi reconhecida pelos dados */
  linhaCabecalho: Element | null;
}

/**
 * Normaliza um rótulo de cabeçalho para comparação: sem acentos, sem pontuação e
 * em minúsculas.
 *
 * Não é preciosismo: quando a resposta do SEI chega com a codificação trocada,
 * "Descrição" vira "Descri��o" ou "DescriÃ§Ã£o". Comparar a palavra inteira falhava
 * nesses casos e a tabela toda era dada como não reconhecida — daí a comparação ser
 * por prefixo, sobre a parte ASCII que sobrevive à corrupção.
 */
const normalizarRotulo = (texto: string): string =>
  texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();

/** Lê o mapa de colunas de uma linha candidata a cabeçalho */
const mapearColunasDoCabecalho = (linha: Element): MapaColunas | null => {
  const celulas = Array.from(linha.querySelectorAll('th, td'));
  if (celulas.length < 3) return null;

  const colunas: MapaColunas = { dataHora: -1, unidade: -1, usuario: -1, descricao: -1 };

  celulas.forEach((celula, indice) => {
    const rotulo = normalizarRotulo(celula.textContent || '');
    if (!rotulo) return;
    if (colunas.dataHora === -1 && rotulo.startsWith('data')) colunas.dataHora = indice;
    else if (colunas.unidade === -1 && rotulo.includes('unidade')) colunas.unidade = indice;
    else if (colunas.usuario === -1 && rotulo.startsWith('usuari')) colunas.usuario = indice;
    else if (colunas.descricao === -1 && rotulo.startsWith('descri')) colunas.descricao = indice;
  });

  // A coluna de unidade pode faltar: há instalações que só citam a unidade dentro
  // do texto da descrição, e `unidadeDaLinha` sabe lê-la de lá.
  return colunas.dataHora >= 0 && colunas.descricao >= 0 ? colunas : null;
};

/** Quantas linhas iniciais de uma tabela ainda podem ser o cabeçalho */
const LINHAS_ATE_CABECALHO = 5;

/**
 * Localiza a tabela de andamento pelo texto do cabeçalho, nunca por posição fixa —
 * a ordem das colunas varia entre versões e instalações do SEI.
 *
 * O cabeçalho é procurado nas primeiras linhas, e não só na primeira: a tela de
 * histórico costuma abrir a tabela com uma linha de título ou de paginação.
 */
const localizarPorCabecalho = (doc: Document): TabelaAndamento | null => {
  for (const tabela of doc.querySelectorAll('table')) {
    const doThead = tabela.querySelector('thead tr');
    const candidatas = doThead
      ? [doThead]
      : Array.from(tabela.querySelectorAll('tr')).slice(0, LINHAS_ATE_CABECALHO);

    for (const linha of candidatas) {
      const colunas = mapearColunasDoCabecalho(linha);
      if (colunas) return { tabela, colunas, linhaCabecalho: linha };
    }
  }

  return null;
};

/** Data no formato do SEI em qualquer ponto do texto da célula */
const REGEX_DATA_NA_CELULA = /\b\d{2}\/\d{2}\/\d{4}\b/u;

const textoDaCelula = (celulas: Element[], indice: number): string =>
  indice >= 0 ? (celulas[indice]?.textContent || '').replace(/\s+/g, ' ').trim() : '';

/**
 * Indica se uma coluna se parece com a de usuário, que no SEI é o CPF ou a matrícula
 */
const pareceColunaDeUsuario = (linhas: Element[][], indice: number): boolean => {
  const valores = linhas.map((celulas) => textoDaCelula(celulas, indice)).filter(Boolean);
  if (valores.length === 0) return false;
  const numericos = valores.filter((valor) => /^\d[\d.\-/]*$/u.test(valor)).length;
  return numericos > valores.length / 2;
};

/**
 * Localiza a tabela de andamento pela forma dos dados, quando nenhum cabeçalho é
 * reconhecível.
 *
 * É a rede de segurança para instalações que rotulam as colunas de outro jeito, para
 * páginas em que o cabeçalho não vem em `th`, e para respostas com a codificação
 * corrompida: uma tabela com várias linhas de data/hora do SEI, tendo a descrição na
 * coluna de texto mais longo, é o histórico do processo.
 */
const localizarPorConteudo = (doc: Document): TabelaAndamento | null => {
  for (const tabela of doc.querySelectorAll('table')) {
    const linhasDeDados = Array.from(tabela.querySelectorAll('tr'))
      .map((tr) => Array.from(tr.querySelectorAll(':scope > td')))
      .filter(
        (celulas) =>
          celulas.length >= 3 &&
          celulas.some((celula) => REGEX_DATA_NA_CELULA.test(celula.textContent || ''))
      );

    // Uma linha isolada com data pode ser qualquer coisa; o histórico traz várias
    if (linhasDeDados.length < 2) continue;

    const totalColunas = Math.max(...linhasDeDados.map((celulas) => celulas.length));

    // A coluna de data é a que traz data válida na maior parte das linhas
    let dataHora = -1;
    let melhorContagem = 0;
    for (let indice = 0; indice < totalColunas; indice++) {
      const comData = linhasDeDados.filter((celulas) =>
        parsearDataHoraSei(textoDaCelula(celulas, indice))
      ).length;
      if (comData > melhorContagem) {
        melhorContagem = comData;
        dataHora = indice;
      }
    }

    if (dataHora < 0 || melhorContagem < linhasDeDados.length / 2) continue;

    // A descrição é o texto livre: de longe a coluna mais extensa
    let descricao = -1;
    let maiorMedia = 0;
    for (let indice = 0; indice < totalColunas; indice++) {
      if (indice === dataHora) continue;
      const soma = linhasDeDados.reduce(
        (total, celulas) => total + textoDaCelula(celulas, indice).length,
        0
      );
      const media = soma / linhasDeDados.length;
      if (media > maiorMedia) {
        maiorMedia = media;
        descricao = indice;
      }
    }

    if (descricao < 0) continue;

    const restantes: number[] = [];
    for (let indice = 0; indice < totalColunas; indice++) {
      if (indice !== dataHora && indice !== descricao) restantes.push(indice);
    }

    // Entre o que sobra, a coluna numérica é o usuário e a outra é a unidade
    const unidade = restantes.find((i) => !pareceColunaDeUsuario(linhasDeDados, i)) ?? -1;
    const usuario = restantes.find((i) => i !== unidade) ?? -1;

    return { tabela, colunas: { dataHora, unidade, usuario, descricao }, linhaCabecalho: null };
  }

  return null;
};

const localizarTabelaAndamento = (doc: Document): TabelaAndamento | null =>
  localizarPorCabecalho(doc) || localizarPorConteudo(doc);

/**
 * Lê a tabela de andamento do SEI e devolve suas linhas.
 * Retorna lista vazia quando nenhuma tabela reconhecível é encontrada.
 */
export interface AnaliseAndamento {
  linhas: LinhaAndamento[];
  /** Houve uma tabela cujos cabeçalhos foram reconhecidos */
  tabelaEncontrada: boolean;
  /** Quantas linhas a tabela tinha, antes de descartar as sem data válida */
  linhasBrutas: number;
  /** Quantas tabelas a página tinha ao todo; separa "página sem tabela" de "tabela não reconhecida" */
  tabelas: number;
}

/**
 * Lê a tabela de andamento e informa por que falhou, quando falha.
 *
 * A distinção importa no diagnóstico: "nenhuma tabela reconhecida" e "tabela
 * reconhecida, mas sem registros legíveis" têm causas diferentes e apareciam
 * ao usuário com a mesma mensagem.
 */
export const analisarAndamentoHtml = (htmlOuDoc: string | Document): AnaliseAndamento => {
  const vazio: AnaliseAndamento = {
    linhas: [],
    tabelaEncontrada: false,
    linhasBrutas: 0,
    tabelas: 0,
  };

  const doc = obterDocumento(htmlOuDoc);
  if (!doc) return vazio;

  const tabelas = doc.querySelectorAll('table').length;

  const encontrada = localizarTabelaAndamento(doc);
  if (!encontrada) return { ...vazio, tabelas };

  const linhas = extrairLinhasDaTabela(encontrada);
  return {
    linhas,
    tabelaEncontrada: true,
    // Sem cabeçalho reconhecido, nenhuma linha é descontada da contagem bruta
    linhasBrutas:
      encontrada.tabela.querySelectorAll('tr').length - (encontrada.linhaCabecalho ? 1 : 0),
    tabelas,
  };
};

export const parseAndamentoHtml = (htmlOuDoc: string | Document): LinhaAndamento[] =>
  analisarAndamentoHtml(htmlOuDoc).linhas;

const extrairLinhasDaTabela = (encontrada: TabelaAndamento): LinhaAndamento[] => {
  const { tabela, colunas, linhaCabecalho } = encontrada;
  const linhas: LinhaAndamento[] = [];

  for (const tr of tabela.querySelectorAll('tr')) {
    if (tr === linhaCabecalho) continue;

    const celulas = Array.from(tr.querySelectorAll(':scope > td'));
    if (celulas.length === 0) continue;

    const dataHoraTexto = textoDaCelula(celulas, colunas.dataHora);
    const dataHora = parsearDataHoraSei(dataHoraTexto);
    // Sem data válida a linha é rodapé, paginação ou cabeçalho repetido
    if (!dataHora) continue;

    const usuario = textoDaCelula(celulas, colunas.usuario);

    linhas.push({
      dataHora,
      dataHoraTexto,
      unidade: textoDaCelula(celulas, colunas.unidade),
      descricao: textoDaCelula(celulas, colunas.descricao),
      ...(usuario ? { usuario } : {}),
    });
  }

  return linhas;
};

// Descrições conforme aparecem na tela "Histórico do Processo" do SEI.
//
// Atenção: em boa parte das instalações (SEI-MG, por exemplo) o texto NÃO traz o nome
// da unidade — ele fica só na coluna "Unidade". Por isso a sigla é lida da linha, e a
// captura no texto é apenas um complemento para instalações que a incluem.
/** Quantas linhas do andamento seguem para o armazenamento local */
const LIMITE_LINHAS_GUARDADAS = 20;

const REGEX_GERACAO = /processo\s+(?:p[úu]blico|restrito|sigiloso)\s+gerado|gerado\s+procedimento|autua[çc][ãa]o/iu;
const REGEX_ENVIO = /conclus[ãa]o do processo na unidade|remetido pela unidade/iu;
const REGEX_RECEBIMENTO = /recebido na unidade/iu;
const REGEX_UNIDADE_NO_TEXTO = /(?:remetido pela|recebido na|conclus[ãa]o do processo na)\s+unidade\s+(.+?)\s*$/iu;

/** Lê a sigla da unidade de uma linha, preferindo a coluna e caindo para o texto */
const unidadeDaLinha = (linha: LinhaAndamento | undefined): string | null => {
  if (!linha) return null;
  const daColuna = linha.unidade?.trim();
  if (daColuna) return daColuna;
  const doTexto = linha.descricao.match(REGEX_UNIDADE_NO_TEXTO)?.[1]?.trim();
  return doTexto || null;
};

/**
 * Detecta se a lista de andamentos veio paginada, lendo o rótulo
 * "Lista de Andamentos (330 registros - 1 a 100)".
 *
 * Importa porque a linha de geração do processo fica na página mais antiga: sem
 * saber que há corte, a unidade mais antiga da página seria tomada por geradora.
 */
export const historicoEstaTruncado = (htmlOuDoc: string | Document): boolean => {
  const doc = obterDocumento(htmlOuDoc);
  if (!doc) return false;

  const texto = (doc.body?.textContent || '').replace(/\s+/g, ' ');
  const match = texto.match(/Lista de Andamentos\s*\(\s*(\d+)\s*registros?\s*-\s*(\d+)\s*a\s*(\d+)/iu);
  if (!match) return false;

  const total = Number(match[1]);
  const ate = Number(match[3]);
  return Number.isFinite(total) && Number.isFinite(ate) && ate < total;
};

/**
 * Compara siglas de unidade ignorando caixa, acentos e pontuação
 */
const mesmaUnidade = (a: string | null | undefined, b: string | null | undefined): boolean => {
  if (!a || !b) return false;
  const normalizar = (valor: string) =>
    valor
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z0-9]/gi, '')
      .toLowerCase();
  const na = normalizar(a);
  const nb = normalizar(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
};

/**
 * Deriva, da tabela de andamento, as informações que a tela de controle do SEI não mostra:
 * unidade geradora, unidade que enviou, data do envio e data da última atualização.
 *
 * `unidadeUsuario` desambigua processos que passaram por várias unidades: com ela,
 * o envio relevante é o último que resultou na chegada à unidade do usuário.
 */
export const resumirAndamento = (
  linhas: LinhaAndamento[],
  unidadeUsuario?: string | null,
  historicoTruncado = false
): ResumoAndamento => {
  if (!Array.isArray(linhas) || linhas.length === 0) {
    return {
      unidadeGeradora: null,
      enviadoPorUnidade: null,
      dataEnvio: null,
      atualizadoEmSei: null,
      linhas: [],
    };
  }

  // Ordena da mais antiga para a mais recente
  const ordenadas = [...linhas].sort(
    (a, b) => new Date(a.dataHora).getTime() - new Date(b.dataHora).getTime()
  );

  const ultima = ordenadas[ordenadas.length - 1];

  // A geração só é afirmada quando a linha correspondente está presente. Com
  // histórico paginado, a linha mais antiga visível não é a de abertura, e
  // apresentá-la como unidade geradora seria informação errada.
  const linhaGeracao = ordenadas.find((linha) => REGEX_GERACAO.test(linha.descricao));
  const unidadeGeradora = linhaGeracao
    ? unidadeDaLinha(linhaGeracao)
    : historicoTruncado
      ? null
      : unidadeDaLinha(ordenadas[0]);

  // Índices de todos os recebimentos registrados
  const indicesRecebimento: number[] = [];
  ordenadas.forEach((linha, indice) => {
    if (REGEX_RECEBIMENTO.test(linha.descricao)) indicesRecebimento.push(indice);
  });

  // Por padrão, a chegada mais recente. Com a unidade do usuário conhecida,
  // a chegada que interessa é a que trouxe o processo até ela.
  let indiceChegada = indicesRecebimento[indicesRecebimento.length - 1] ?? -1;

  if (unidadeUsuario && unidadeUsuario.trim()) {
    for (let i = indicesRecebimento.length - 1; i >= 0; i--) {
      const candidato = indicesRecebimento[i]!;
      if (mesmaUnidade(unidadeDaLinha(ordenadas[candidato]), unidadeUsuario)) {
        indiceChegada = candidato;
        break;
      }
    }
  }

  let enviadoPorUnidade: string | null = null;
  let dataEnvio: string | null = null;

  if (indiceChegada >= 0) {
    const unidadeDestino = unidadeDaLinha(ordenadas[indiceChegada]);

    // O envio é o último evento anterior à chegada registrado em outra unidade —
    // tipicamente a "Conclusão do processo na unidade" de quem remeteu.
    for (let i = indiceChegada - 1; i >= 0; i--) {
      const linha = ordenadas[i]!;
      const unidade = unidadeDaLinha(linha);
      if (!unidade || mesmaUnidade(unidade, unidadeDestino)) continue;

      // Aceita qualquer marca da unidade anterior: quando o SEI não registra a
      // conclusão, o último evento dela ainda é a melhor evidência do envio
      enviadoPorUnidade = unidade;
      dataEnvio = linha.dataHora;
      break;
    }

    // Sem rastro da origem, ao menos a data de chegada é informação verdadeira
    if (!dataEnvio) dataEnvio = ordenadas[indiceChegada]?.dataHora ?? null;
  } else {
    // Instalações que registram "remetido pela unidade X" sem linha de recebimento
    for (let i = ordenadas.length - 1; i >= 0; i--) {
      const linha = ordenadas[i]!;
      if (REGEX_ENVIO.test(linha.descricao)) {
        enviadoPorUnidade = unidadeDaLinha(linha);
        dataEnvio = linha.dataHora;
        break;
      }
    }
  }

  return {
    unidadeGeradora,
    enviadoPorUnidade,
    dataEnvio,
    atualizadoEmSei: ultima?.dataHora ?? null,
    // Os campos acima já resumem o histórico inteiro; guardar as centenas de linhas
    // restantes só incharia o armazenamento local. Ficam as mais recentes, que são
    // as exibidas no card.
    linhas: ordenadas.slice(-LIMITE_LINHAS_GUARDADAS),
  };
};

/**
 * Traduz uma busca sem resultado na causa mais provável.
 *
 * Mora aqui, e não em cada chamador, porque o content script e o service worker
 * mostram a mesma falha ao usuário: duplicada, a frase divergia entre os dois e o
 * relato do problema ficava ambíguo.
 */
export const descreverFalhaAndamento = (busca: ResultadoBuscaAndamentoBruta): string => {
  const paginas = `${busca.paginasInspecionadas} página(s)`;

  if (busca.tabelaSemRegistros) {
    return `O histórico foi aberto e a tabela reconhecida, mas nenhum registro pôde ser lido (${paginas}). Abra o link abaixo para conferir no SEI.`;
  }

  if (busca.linkTentado) {
    const tabelas =
      busca.tabelasNaPagina > 0
        ? `${busca.tabelasNaPagina} tabela(s), nenhuma com o formato do histórico`
        : 'nenhuma tabela na página';
    return `Histórico aberto, mas a lista de andamentos não foi reconhecida — ${tabelas}, em ${paginas}. Abra o link abaixo para ver no SEI.`;
  }

  return `Link do histórico não localizado (${paginas} inspecionada(s)).`;
};
