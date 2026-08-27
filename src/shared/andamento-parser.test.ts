import { describe, it, expect } from 'vitest';
import {
  parsearDataHoraSei,
  descobrirLinkAndamento,
  descobrirLinkAndamentoNoTexto,
  extrairUrlsDeFrames,
  extrairUrlsDeFramesNoTexto,
  procurarAndamento,
  analisarAndamentoHtml,
  historicoEstaTruncado,
  parseAndamentoHtml,
  resumirAndamento,
} from './andamento-parser';

const URL_BASE =
  'https://www.sei.mg.gov.br/sei/controlador.php?acao=procedimento_trabalhar&id_procedimento=123';

/**
 * Estrutura da tela "Consultar Andamento" do SEI: tabela com Data/Hora, Unidade,
 * Usuário e Descrição, listada da mais recente para a mais antiga.
 */
const HTML_ANDAMENTO = `
  <html><body>
    <div>Lista de Andamentos (5 registros - 1 a 5):</div>
    <table id="tblHistorico">
      <tr><th>Data/Hora</th><th>Unidade</th><th>Usuário</th><th>Descrição</th></tr>
      <tr>
        <td>25/08/2026 10:55</td><td>CBMMG/BEMAD</td><td>03534676696</td>
        <td>Processo atribuído para 08841376600</td>
      </tr>
      <tr>
        <td>21/08/2026 14:19</td><td>CBMMG/BEMAD</td><td>00416637647</td>
        <td>Processo recebido na unidade</td>
      </tr>
      <tr>
        <td>21/08/2026 10:01</td><td>CBMMG/SDAL</td><td>05672017673</td>
        <td>Conclusão do processo na unidade</td>
      </tr>
      <tr>
        <td>13/08/2026 16:57</td><td>CBMMG/SDAL</td><td>05267085650</td>
        <td>Processo recebido na unidade</td>
      </tr>
      <tr>
        <td>19/07/2026 08:00</td><td>CBMMG/2COB/12BBM</td><td>00416637647</td>
        <td>Processo público gerado</td>
      </tr>
    </table>
  </body></html>
`;

describe('Andamento Parser', () => {
  describe('parsearDataHoraSei', () => {
    it('converte data e hora do SEI para ISO', () => {
      const iso = parsearDataHoraSei('20/08/2026 14:32');
      expect(iso).not.toBeNull();
      const data = new Date(iso!);
      expect(data.getFullYear()).toBe(2026);
      expect(data.getMonth()).toBe(7); // agosto
      expect(data.getDate()).toBe(20);
      expect(data.getHours()).toBe(14);
      expect(data.getMinutes()).toBe(32);
    });

    it('aceita data sem hora e com segundos', () => {
      expect(parsearDataHoraSei('01/01/2026')).not.toBeNull();
      expect(parsearDataHoraSei('01/01/2026 08:05:30')).not.toBeNull();
    });

    it('rejeita textos que não contêm data', () => {
      expect(parsearDataHoraSei('Processo remetido')).toBeNull();
      expect(parsearDataHoraSei('')).toBeNull();
      expect(parsearDataHoraSei(null)).toBeNull();
    });
  });

  describe('descobrirLinkAndamento', () => {
    it('encontra a URL dentro do onclick do SEI-MG (markup real)', () => {
      // Capturado do frame procedimento_visualizar em sei.mg.gov.br:
      // href="#" e a URL dentro de consultarAndamento(...), com a ação
      // procedimento_consultar_historico
      const html =
        `<a href="#" style="cursor:pointer;" onclick="consultarAndamento('controlador.php?acao=procedimento_consultar_historico&amp;acao_origem=arvore_visualizar&amp;acao_retorno=arvore_visualizar&amp;id_procedimento=930615626&amp;arvore=1&amp;infra_sistema=100000100&amp;infra_unidade_atual=110000719&amp;infra_hash=abc123')">Consultar Andamento</a>`;

      const url = descobrirLinkAndamento(html, URL_BASE);
      expect(url).toContain('acao=procedimento_consultar_historico');
      expect(url).toContain('id_procedimento=930615626');
      expect(url).toContain('infra_hash=abc123');
      expect(url?.startsWith('https://www.sei.mg.gov.br/sei/')).toBe(true);
    });

    it('acha o link mesmo sem rótulo reconhecível', () => {
      // O rótulo pode ser só um ícone; a ação na URL é a evidência confiável
      const html =
        `<a href="#" onclick="consultarAndamento('controlador.php?acao=procedimento_consultar_historico&amp;id_procedimento=1&amp;infra_hash=z')"><img src="andamento.gif"/></a>`;
      expect(descobrirLinkAndamento(html, URL_BASE)).toContain('procedimento_consultar_historico');
    });

    it('encontra o link pela ação de histórico do SEI', () => {
      const html = `<a href="controlador.php?acao=procedimento_historico_consultar&id_procedimento=123&infra_hash=abc">x</a>`;
      expect(descobrirLinkAndamento(html, URL_BASE)).toBe(
        'https://www.sei.mg.gov.br/sei/controlador.php?acao=procedimento_historico_consultar&id_procedimento=123&infra_hash=abc'
      );
    });

    it('encontra o link pelo rótulo "Consultar Andamento"', () => {
      const html = `<a href="controlador.php?acao=x&infra_hash=z" title="Consultar Andamento"><img src="i.gif"/></a>`;
      expect(descobrirLinkAndamento(html, URL_BASE)).toContain('acao=x');
    });

    it('não confunde com "Histórico de Processos Visitados" do menu do SEI', () => {
      // O menu aparece antes do link do processo no HTML; sem priorização, a
      // varredura pegava o primeiro e navegava para a página errada
      const html =
        `<a href="controlador.php?acao=procedimento_historico_visitados&infra_hash=m">Histórico de Processos Visitados</a>` +
        `<a href="#" onclick="consultarAndamento('controlador.php?acao=procedimento_consultar_historico&amp;id_procedimento=930615626&amp;infra_hash=abc')">Consultar Andamento</a>`;

      const url = descobrirLinkAndamento(html, URL_BASE);
      expect(url).toContain('id_procedimento=930615626');
      expect(url).not.toContain('visitados');
    });

    it('ignora links de marcador e âncoras vazias', () => {
      const html = `<a href="#">t</a><a href="javascript:void(0)">t</a><a href="controlador.php?acao=andamento_marcador_gerenciar">m</a>`;
      expect(descobrirLinkAndamento(html, URL_BASE)).toBeNull();
    });

    it('funciona sem DOMParser, como no service worker do MV3', () => {
      const html =
        `<a href="#" onclick="consultarAndamento('controlador.php?acao=procedimento_consultar_historico&amp;id_procedimento=42&amp;infra_hash=xyz')">Consultar Andamento</a>`;

      const original = globalThis.DOMParser;
      // @ts-expect-error simula o ambiente do service worker, que não tem DOMParser
      delete globalThis.DOMParser;
      try {
        const url = descobrirLinkAndamento(html, URL_BASE);
        expect(url).toContain('acao=procedimento_consultar_historico');
        expect(url).toContain('id_procedimento=42');
        // As entidades do atributo precisam voltar a ser & na URL final
        expect(url).not.toContain('&amp;');
      } finally {
        globalThis.DOMParser = original;
      }
    });

    it('devolve null quando não há link de andamento', () => {
      expect(descobrirLinkAndamento('<div>sem links</div>', URL_BASE)).toBeNull();
      expect(descobrirLinkAndamentoNoTexto('<div>sem links</div>', URL_BASE)).toBeNull();
      expect(descobrirLinkAndamentoNoTexto('', URL_BASE)).toBeNull();
    });
  });

  describe('extrairUrlsDeFrames', () => {
    it('resolve os frames da tela do processo, que é um frameset', () => {
      const html = `
        <frameset>
          <frame src="controlador.php?acao=procedimento_visualizar&id_procedimento=123" />
          <frame src="controlador.php?acao=arvore_visualizar&id_procedimento=123" />
        </frameset>`;
      const urls = extrairUrlsDeFrames(html, URL_BASE);
      expect(urls).toHaveLength(2);
      expect(urls[0]).toContain('acao=procedimento_visualizar');
      expect(urls[1]).toContain('acao=arvore_visualizar');
    });

    it('aceita iframes e descarta about:blank e duplicados', () => {
      const html = `
        <iframe src="controlador.php?acao=x"></iframe>
        <iframe src="controlador.php?acao=x"></iframe>
        <iframe src="about:blank"></iframe>
        <iframe></iframe>`;
      expect(extrairUrlsDeFrames(html, URL_BASE)).toHaveLength(1);
    });

    it('devolve lista vazia quando não há frames', () => {
      expect(extrairUrlsDeFrames('<div>nada</div>', URL_BASE)).toEqual([]);
    });
  });

  describe('parseAndamentoHtml', () => {
    it('lê as linhas mapeando colunas pelo cabeçalho', () => {
      const linhas = parseAndamentoHtml(HTML_ANDAMENTO);
      expect(linhas).toHaveLength(5);
      expect(linhas[0]?.unidade).toBe('CBMMG/BEMAD');
      expect(linhas[0]?.usuario).toBe('03534676696');
      expect(linhas[0]?.dataHoraTexto).toBe('25/08/2026 10:55');
      expect(linhas[0]?.descricao).toBe('Processo atribuído para 08841376600');
    });

    it('funciona com colunas em ordem diferente', () => {
      const html = `
        <table>
          <tr><th>Descrição</th><th>Unidade</th><th>Data/Hora</th></tr>
          <tr><td>Processo público gerado</td><td>SEC</td><td>19/08/2026 08:00</td></tr>
        </table>`;
      const linhas = parseAndamentoHtml(html);
      expect(linhas).toHaveLength(1);
      expect(linhas[0]?.unidade).toBe('SEC');
      expect(linhas[0]?.descricao).toBe('Processo público gerado');
    });

    it('distingue "sem tabela" de "tabela sem registros legíveis"', () => {
      // Sem cabeçalho reconhecível: nenhuma tabela de andamento na página
      const semTabela = analisarAndamentoHtml('<table><tr><td>qualquer</td></tr></table>');
      expect(semTabela.tabelaEncontrada).toBe(false);
      expect(semTabela.linhas).toEqual([]);

      // Cabeçalho correto, mas as linhas não trazem data válida
      const semRegistros = analisarAndamentoHtml(`
        <table>
          <tr><th>Data/Hora</th><th>Unidade</th><th>Descrição</th></tr>
          <tr><td>Nenhum registro encontrado</td><td></td><td></td></tr>
        </table>`);
      expect(semRegistros.tabelaEncontrada).toBe(true);
      expect(semRegistros.linhas).toEqual([]);
      expect(semRegistros.linhasBrutas).toBe(1);
    });

    it('reconhece o cabeçalho mesmo com os acentos corrompidos pela codificação', () => {
      // É assim que "Descrição" e "Usuário" chegam quando a resposta do SEI é lida
      // com a codificação errada; a tabela continua sendo a do histórico
      const html = `
        <table>
          <tr><th>Data/Hora</th><th>Unidade</th><th>Usu\uFFFDrio</th><th>Descri\uFFFD\uFFFDo</th></tr>
          <tr><td>19/08/2026 08:00</td><td>SEC</td><td>00416637647</td><td>Processo público gerado</td></tr>
        </table>`;
      const linhas = parseAndamentoHtml(html);
      expect(linhas).toHaveLength(1);
      expect(linhas[0]?.unidade).toBe('SEC');
      expect(linhas[0]?.descricao).toBe('Processo público gerado');
    });

    it('acha o cabeçalho quando a tabela abre com linha de título ou paginação', () => {
      const html = `
        <table>
          <tr><td colspan="4">Lista de Andamentos (2 registros - 1 a 2)</td></tr>
          <tr><td>Data/Hora</td><td>Unidade</td><td>Usuário</td><td>Descrição</td></tr>
          <tr><td>19/08/2026 08:00</td><td>SEC</td><td>00416637647</td><td>Processo público gerado</td></tr>
        </table>`;
      const linhas = parseAndamentoHtml(html);
      expect(linhas).toHaveLength(1);
      expect(linhas[0]?.descricao).toBe('Processo público gerado');
    });

    it('reconhece a tabela pela forma dos dados quando não há cabeçalho', () => {
      // Instalações que entregam o histórico sem linha de cabeçalho: a data manda,
      // a coluna de texto mais longo é a descrição e a numérica é o usuário
      const html = `
        <table>
          <tr><td>25/08/2026 10:55</td><td>CBMMG/BEMAD</td><td>03534676696</td><td>Processo recebido na unidade</td></tr>
          <tr><td>19/07/2026 08:00</td><td>CBMMG/SDAL</td><td>00416637647</td><td>Processo público gerado</td></tr>
        </table>`;
      const analise = analisarAndamentoHtml(html);
      expect(analise.tabelaEncontrada).toBe(true);
      expect(analise.linhas).toHaveLength(2);
      expect(analise.linhas[0]?.unidade).toBe('CBMMG/BEMAD');
      expect(analise.linhas[0]?.usuario).toBe('03534676696');
      expect(analise.linhas[0]?.descricao).toBe('Processo recebido na unidade');
    });

    it('não confunde uma tabela qualquer com data solta com o histórico', () => {
      const html = `
        <table>
          <tr><td>Emitido em 19/08/2026</td><td>x</td><td>y</td></tr>
        </table>`;
      expect(analisarAndamentoHtml(html).tabelaEncontrada).toBe(false);
    });

    it('devolve lista vazia quando não há tabela reconhecível', () => {
      expect(parseAndamentoHtml('<table><tr><td>qualquer</td></tr></table>')).toEqual([]);
      expect(parseAndamentoHtml('')).toEqual([]);
    });
  });

  describe('resumirAndamento', () => {
    const linhas = parseAndamentoHtml(HTML_ANDAMENTO);

    it('identifica a unidade geradora pela linha de geração', () => {
      expect(resumirAndamento(linhas).unidadeGeradora).toBe('CBMMG/2COB/12BBM');
    });

    it('deriva o envio do último evento na unidade anterior à chegada', () => {
      // A chegada mais recente é em CBMMG/BEMAD (21/08 14:19); antes dela, o último
      // evento em outra unidade é a conclusão em CBMMG/SDAL (21/08 10:01)
      const resumo = resumirAndamento(linhas);
      expect(resumo.enviadoPorUnidade).toBe('CBMMG/SDAL');
      expect(resumo.dataEnvio).toBe(parsearDataHoraSei('21/08/2026 10:01'));
    });

    it('com a unidade do usuário, usa a chegada até ela', () => {
      const resumo = resumirAndamento(linhas, 'CBMMG/SDAL');
      expect(resumo.enviadoPorUnidade).toBe('CBMMG/2COB/12BBM');
      expect(resumo.dataEnvio).toBe(parsearDataHoraSei('19/07/2026 08:00'));
    });

    it('ignora diferenças de caixa e pontuação na sigla da unidade', () => {
      expect(resumirAndamento(linhas, 'cbmmg sdal').enviadoPorUnidade).toBe('CBMMG/2COB/12BBM');
    });

    it('deixa a linha mais recente por último, para o card exibir sua descrição', () => {
      const resumo = resumirAndamento(linhas);
      const maisRecente = resumo.linhas[resumo.linhas.length - 1];
      expect(maisRecente?.dataHora).toBe(resumo.atualizadoEmSei);
      expect(maisRecente?.descricao).toBe('Processo atribuído para 08841376600');
    });

    it('guarda apenas as linhas mais recentes, para não inchar o armazenamento', () => {
      const muitas = Array.from({ length: 60 }, (_, i) => ({
        dataHora: new Date(2026, 0, 1, 0, i).toISOString(),
        dataHoraTexto: `01/01/2026 00:${String(i).padStart(2, '0')}`,
        unidade: 'CBMMG/BEMAD',
        descricao: `evento ${i}`,
      }));

      const resumo = resumirAndamento(muitas);
      expect(resumo.linhas).toHaveLength(20);
      // As mantidas são as do fim, e a última continua sendo a mais recente
      expect(resumo.linhas[resumo.linhas.length - 1]?.descricao).toBe('evento 59');
      expect(resumo.atualizadoEmSei).toBe(muitas[59]?.dataHora);
    });

    it('usa a última linha como data de atualização', () => {
      expect(resumirAndamento(linhas).atualizadoEmSei).toBe(parsearDataHoraSei('25/08/2026 10:55'));
    });

    it('não afirma unidade geradora quando o histórico está truncado', () => {
      const semGeracao = linhas.filter((l) => !/gerado/i.test(l.descricao));
      expect(resumirAndamento(semGeracao, undefined, true).unidadeGeradora).toBeNull();
      // Sem truncamento, a linha mais antiga é a melhor aproximação disponível
      expect(resumirAndamento(semGeracao, undefined, false).unidadeGeradora).toBe('CBMMG/SDAL');
    });

    it('lida com processo que nunca saiu da unidade geradora', () => {
      const html = `
        <table>
          <tr><th>Data/Hora</th><th>Unidade</th><th>Descrição</th></tr>
          <tr><td>19/08/2026 08:00</td><td>SEC</td><td>Processo público gerado</td></tr>
        </table>`;
      const resumo = resumirAndamento(parseAndamentoHtml(html));
      expect(resumo.unidadeGeradora).toBe('SEC');
      expect(resumo.enviadoPorUnidade).toBeNull();
      expect(resumo.dataEnvio).toBeNull();
      expect(resumo.atualizadoEmSei).toBe(parsearDataHoraSei('19/08/2026 08:00'));
    });

    it('devolve resumo vazio para lista vazia', () => {
      const resumo = resumirAndamento([]);
      expect(resumo.unidadeGeradora).toBeNull();
      expect(resumo.enviadoPorUnidade).toBeNull();
      expect(resumo.dataEnvio).toBeNull();
      expect(resumo.atualizadoEmSei).toBeNull();
      expect(resumo.linhas).toEqual([]);
    });
  });

  describe('historicoEstaTruncado', () => {
    it('detecta corte pelo rótulo de registros do SEI', () => {
      expect(historicoEstaTruncado('<body>Lista de Andamentos (330 registros - 1 a 100):</body>')).toBe(true);
      expect(historicoEstaTruncado('<body>Lista de Andamentos (12 registros - 1 a 12):</body>')).toBe(false);
      expect(historicoEstaTruncado('<body>sem rótulo</body>')).toBe(false);
    });
  });

  describe('extrairUrlsDeFramesNoTexto', () => {
    it('lê frames sem depender de DOM, como no service worker', () => {
      const html = `
        <frameset>
          <frame src="controlador.php?acao=procedimento_visualizar&amp;id_procedimento=1"/>
          <iframe src="controlador.php?acao=arvore_visualizar"></iframe>
          <iframe src="about:blank"></iframe>
        </frameset>`;
      const urls = extrairUrlsDeFramesNoTexto(html, URL_BASE);
      expect(urls).toHaveLength(2);
      // As entidades precisam virar & na URL final
      expect(urls[0]).toContain('&id_procedimento=1');
      expect(urls.join(' ')).not.toContain('about:blank');
    });

    it('devolve lista vazia sem frames', () => {
      expect(extrairUrlsDeFramesNoTexto('<div>nada</div>', URL_BASE)).toEqual([]);
      expect(extrairUrlsDeFramesNoTexto('', URL_BASE)).toEqual([]);
    });
  });

  describe('procurarAndamento', () => {
    const URL_PROCESSO = 'https://sei.mg.gov.br/sei/controlador.php?acao=procedimento_trabalhar&id_procedimento=7';
    const URL_FRAME = 'https://sei.mg.gov.br/sei/controlador.php?acao=procedimento_visualizar&id_procedimento=7';
    const URL_HISTORICO = 'https://sei.mg.gov.br/sei/controlador.php?acao=procedimento_consultar_historico&id_procedimento=7&infra_hash=h';

    /** Reproduz a estrutura real: frameset -> frame com o link -> histórico */
    const paginas: Record<string, string> = {
      [URL_PROCESSO]: '<frameset><frame src="controlador.php?acao=procedimento_visualizar&id_procedimento=7"/></frameset>',
      [URL_FRAME]: `<a href="#" onclick="consultarAndamento('controlador.php?acao=procedimento_consultar_historico&amp;id_procedimento=7&amp;infra_hash=h')">Consultar Andamento</a>`,
      [URL_HISTORICO]: HTML_ANDAMENTO,
    };

    const opcoesBase = {
      parsearLinhas: parseAndamentoHtml,
      extrairFrames: extrairUrlsDeFramesNoTexto,
      ehLogin: (html: string) => html.includes('txtSenha'),
    };

    it('atravessa frameset e link do histórico até achar a tabela', async () => {
      const busca = await procurarAndamento(URL_PROCESSO, {
        ...opcoesBase,
        baixar: async (url) => paginas[url] ?? '',
      });

      expect(busca.linhas).toHaveLength(5);
      expect(busca.linkAndamento).toBe(URL_HISTORICO);
      expect(busca.sessaoExpirada).toBe(false);
      // processo -> frame -> histórico
      expect(busca.paginasInspecionadas).toBe(3);
    });

    it('sem descer pelos frames, nada seria encontrado', async () => {
      // Era exatamente esse o comportamento do service worker: um salto só
      const busca = await procurarAndamento(URL_PROCESSO, {
        ...opcoesBase,
        extrairFrames: () => [],
        baixar: async (url) => paginas[url] ?? '',
      });

      expect(busca.linhas).toHaveLength(0);
      expect(busca.linkTentado).toBeUndefined();
    });

    it('sinaliza sessão expirada sem seguir adiante', async () => {
      const busca = await procurarAndamento(URL_PROCESSO, {
        ...opcoesBase,
        baixar: async () => '<form id="formLogin"><input name="txtSenha"/></form>',
      });

      expect(busca.sessaoExpirada).toBe(true);
      expect(busca.linhas).toHaveLength(0);
      expect(busca.paginasInspecionadas).toBe(1);
    });

    it('tenta o próximo link quando o primeiro não leva à tabela', async () => {
      // A página cita dois "históricos": o de outro processo aparece primeiro no
      // HTML, e parar nele deixava este processo sem andamento
      const URL_OUTRO = 'https://sei.mg.gov.br/sei/controlador.php?acao=procedimento_consultar_historico&id_procedimento=99&infra_hash=z';
      const paginasComRuido: Record<string, string> = {
        [URL_PROCESSO]:
          `<a href="controlador.php?acao=procedimento_consultar_historico&amp;id_procedimento=99&amp;infra_hash=z">Histórico</a>` +
          `<a href="controlador.php?acao=procedimento_consultar_historico&amp;id_procedimento=7&amp;infra_hash=h">Consultar Andamento</a>`,
        [URL_OUTRO]: '<html><body>Nenhum registro para exibir</body></html>',
        [URL_HISTORICO]: HTML_ANDAMENTO,
      };

      const visitadas: string[] = [];
      const busca = await procurarAndamento(URL_PROCESSO, {
        ...opcoesBase,
        baixar: async (url) => {
          visitadas.push(url);
          return paginasComRuido[url] ?? '';
        },
      });

      expect(busca.linhas).toHaveLength(5);
      expect(busca.linkAndamento).toBe(URL_HISTORICO);
      // O histórico do próprio processo é tentado primeiro, pelo id_procedimento
      expect(visitadas).not.toContain(URL_OUTRO);
    });

    it('cai para o histórico de outro id apenas depois de esgotar o do processo', async () => {
      const URL_OUTRO = 'https://sei.mg.gov.br/sei/controlador.php?acao=procedimento_consultar_historico&id_procedimento=99&infra_hash=z';
      const paginasSemOAlvo: Record<string, string> = {
        [URL_PROCESSO]:
          `<a href="controlador.php?acao=procedimento_consultar_historico&amp;id_procedimento=99&amp;infra_hash=z">Histórico</a>`,
        [URL_OUTRO]: HTML_ANDAMENTO,
      };

      const busca = await procurarAndamento(URL_PROCESSO, {
        ...opcoesBase,
        baixar: async (url) => paginasSemOAlvo[url] ?? '',
      });

      expect(busca.linhas).toHaveLength(5);
      expect(busca.linkAndamento).toBe(URL_OUTRO);
    });

    it('guarda o link tentado quando a tabela não é reconhecida', async () => {
      const busca = await procurarAndamento(URL_PROCESSO, {
        ...opcoesBase,
        baixar: async (url) =>
          url === URL_HISTORICO ? '<html><body>sem tabela</body></html>' : paginas[url] ?? '',
      });

      expect(busca.linhas).toHaveLength(0);
      expect(busca.linkTentado).toBe(URL_HISTORICO);
    });
  });
});
