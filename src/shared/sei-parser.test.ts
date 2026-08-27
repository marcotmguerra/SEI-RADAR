import { describe, it, expect } from 'vitest';
import {
  parseProcessosHtml,
  extrairTextoAssunto,
  resolverUrlAbsoluta,
  extrairAtribuicaoDaLinha,
  localizarIndiceColunaAtribuicao,
  extrairPrazoDaLinha,
  extrairMarcadoresDaLinha,
  extrairUsuarioLogado,
  extrairUnidadeAtual,
  extrairTodosMarcadoresDaPagina,
} from './sei-parser';

const montarDoc = (html: string): Document =>
  new DOMParser().parseFromString(html, 'text/html');

describe('SEI Parser', () => {
  describe('extrairTextoAssunto', () => {
    it('remove prefixos comuns do SEI', () => {
      expect(extrairTextoAssunto('Assunto: Aquisição de viaturas')).toBe('Aquisição de viaturas');
      expect(extrairTextoAssunto('Especificação: Relatório mensal de atividades')).toBe('Relatório mensal de atividades');
      expect(extrairTextoAssunto('Tipo do Processo: Treinamento de pessoal')).toBe('Treinamento de pessoal');
    });

    it('extrai conteúdo de tooltips JavaScript do SEI', () => {
      const tooltip = "return infraTooltipMostrar('Assunto: Solicitação de diárias operacionais');";
      expect(extrairTextoAssunto(tooltip)).toBe('Solicitação de diárias operacionais');
    });

    it('extrai o assunto quando o primeiro argumento do tooltip vem vazio', () => {
      // Padrão real do SEI, que fazia o JavaScript cru vazar como assunto
      const tooltip = `return infraTooltipMostrar('','Pedidos, Oferecimentos e Informações Diversas');`;
      expect(extrairTextoAssunto(tooltip)).toBe('Pedidos, Oferecimentos e Informações Diversas');
    });

    it('nunca devolve código JavaScript como assunto', () => {
      expect(extrairTextoAssunto(`return infraTooltipMostrar('','');`)).toBeNull();
      expect(extrairTextoAssunto('return algumaCoisa();')).toBeNull();
    });

    it('retorna null para valores vazios ou nulos', () => {
      expect(extrairTextoAssunto('')).toBeNull();
      expect(extrairTextoAssunto(null)).toBeNull();
      expect(extrairTextoAssunto(undefined)).toBeNull();
    });
  });

  describe('resolverUrlAbsoluta', () => {
    it('resolve URLs relativas para absolutas com a URL base', () => {
      const base = 'https://www.sei.mg.gov.br/sei/controlador.php?acao=procedimento_controlar';
      const relativo = 'controlador.php?acao=procedimento_trabalhar&id_procedimento=12345';
      const resultado = resolverUrlAbsoluta(relativo, base);
      expect(resultado).toBe('https://www.sei.mg.gov.br/sei/controlador.php?acao=procedimento_trabalhar&id_procedimento=12345');
    });
  });

  describe('extrairAtribuicaoDaLinha', () => {
    it('extrai sigla de link com classe ancoraSigla', () => {
      const parser = new DOMParser();
      const doc = parser.parseFromString('<table><tr><td><a class="ancoraSigla" title="Processo atribuído para Marco (MG12345)">MG12345</a></td></tr></table>', 'text/html');
      const tr = doc.querySelector('tr')!;
      expect(extrairAtribuicaoDaLinha(tr)).toBe('MG12345');
    });

    it('extrai sigla a partir de tooltip com "atribuído para"', () => {
      const parser = new DOMParser();
      const doc = parser.parseFromString('<table><tr><td><span title="Processo atribuído para GUERRA">👤</span></td></tr></table>', 'text/html');
      const tr = doc.querySelector('tr')!;
      expect(extrairAtribuicaoDaLinha(tr)).toBe('GUERRA');
    });

    it('devolve undefined quando não há nenhuma pista de atribuição na linha', () => {
      const doc = montarDoc('<table><tr><td>1400.01.000098/2026-43</td><td>Aquisição</td></tr></table>');
      const tr = doc.querySelector('tr')!;
      expect(extrairAtribuicaoDaLinha(tr)).toBeUndefined();
    });

    it('devolve null quando a coluna de atribuição existe e está vazia', () => {
      const doc = montarDoc(`
        <table>
          <tr><th>Processo</th><th>Atribuição</th></tr>
          <tr><td>1400.01.000098/2026-43</td><td>   </td></tr>
        </table>
      `);
      const tr = doc.querySelectorAll('tr')[1]!;
      const indice = localizarIndiceColunaAtribuicao(doc.querySelector('table'));
      expect(extrairAtribuicaoDaLinha(tr, indice)).toBeNull();
    });

    it('lê o responsável a partir da coluna de atribuição', () => {
      const doc = montarDoc(`
        <table>
          <tr><th>Processo</th><th>Atribuição</th></tr>
          <tr><td>1400.01.000098/2026-43</td><td>GUERRA</td></tr>
        </table>
      `);
      const tr = doc.querySelectorAll('tr')[1]!;
      const indice = localizarIndiceColunaAtribuicao(doc.querySelector('table'));
      expect(extrairAtribuicaoDaLinha(tr, indice)).toBe('GUERRA');
    });
  });

  describe('inferência de "sem atribuição" por tabela', () => {
    const linha = (numero: string, extra: string) => `
      <tr>
        <td><a href="controlador.php?acao=procedimento_trabalhar&id_procedimento=${numero}"
               title="Assunto: Teste">1400.01.00000${numero}/2026-01</a>${extra}</td>
      </tr>`;

    it('marca como sem atribuição quando outra linha da tabela tem atribuição', () => {
      // Padrão da tela de Controle de Processos: sem cabeçalho "Atribuição",
      // a sigla aparece ao lado do número
      const html = `<table id="tblProcessosRecebidos">
        ${linha('1', '<a class="ancoraSigla">05881659643</a>')}
        ${linha('2', '')}
      </table>`;

      const processos = parseProcessosHtml(html);
      expect(processos[0]?.atribuidoPara).toBe('05881659643');
      expect(processos[1]?.atribuidoPara).toBeNull();
    });

    it('mantém indeterminado quando nenhuma linha da tabela expõe atribuição', () => {
      const html = `<table id="tblProcessosRecebidos">
        ${linha('1', '')}
        ${linha('2', '')}
      </table>`;

      const processos = parseProcessosHtml(html);
      expect(processos[0]?.atribuidoPara).toBeUndefined();
      expect(processos[1]?.atribuidoPara).toBeUndefined();
    });
  });

  describe('extrairPrazoDaLinha', () => {
    it('lê o prazo do tooltip de retorno programado', () => {
      const doc = montarDoc(
        '<table><tr><td><img src="retorno_programado.gif" title="Retorno Programado em 30/08/2026"/></td></tr></table>'
      );
      const prazo = extrairPrazoDaLinha(doc.querySelector('tr')!);
      expect(prazo?.texto).toBe('30/08/2026');
      expect(new Date(prazo!.iso).getFullYear()).toBe(2026);
    });

    it('aceita a palavra "prazo" em célula de texto', () => {
      const doc = montarDoc('<table><tr><td>Prazo: 05/09/2026</td></tr></table>');
      expect(extrairPrazoDaLinha(doc.querySelector('tr')!)?.texto).toBe('05/09/2026');
    });

    it('ignora datas que não se referem a prazo', () => {
      const doc = montarDoc('<table><tr><td title="Gerado em 01/01/2026">x</td></tr></table>');
      expect(extrairPrazoDaLinha(doc.querySelector('tr')!)).toBeNull();
    });
  });

  describe('localizarIndiceColunaAtribuicao', () => {
    it('encontra a coluna pelo texto do cabeçalho', () => {
      const doc = montarDoc(
        '<table><tr><th>Processo</th><th>Atribuição</th><th>Tipo</th></tr></table>'
      );
      expect(localizarIndiceColunaAtribuicao(doc.querySelector('table'))).toBe(1);
    });

    it('devolve null quando a tabela não tem coluna de atribuição', () => {
      const doc = montarDoc('<table><tr><th>Processo</th><th>Tipo</th></tr></table>');
      expect(localizarIndiceColunaAtribuicao(doc.querySelector('table'))).toBeNull();
      expect(localizarIndiceColunaAtribuicao(null)).toBeNull();
    });
  });

  describe('extrairUnidadeAtual', () => {
    it('extrai a unidade da opção marcada no seletor do SEI', () => {
      const doc = montarDoc(
        '<select id="selInfraUnidades"><option value="1">SEC</option><option value="2" selected>1ªCIA</option></select>'
      );
      expect(extrairUnidadeAtual(doc)).toBe('1ªCIA');
    });

    it('extrai a unidade de rótulo dedicado', () => {
      const doc = montarDoc('<span id="lblInfraUnidade">2ºBPM</span>');
      expect(extrairUnidadeAtual(doc)).toBe('2ºBPM');
    });

    it('devolve null quando a página não expõe unidade', () => {
      expect(extrairUnidadeAtual(montarDoc('<div>sem unidade aqui</div>'))).toBeNull();
      expect(extrairUnidadeAtual('')).toBeNull();
    });
  });

  describe('extrairMarcadoresDaLinha', () => {
    it('extrai tags/marcadores de elementos com title ou link', () => {
      const parser = new DOMParser();
      const doc = parser.parseFromString(`
        <table>
          <tr>
            <td>
              <a href="controlador.php?acao=andamento_marcador_gerenciar" title="Marcador: Urgente / Prazo 24h">🏷️</a>
              <img src="marcador_amarelo.png" title="Marcador: Em Análise" />
            </td>
          </tr>
        </table>
      `, 'text/html');
      const tr = doc.querySelector('tr')!;
      const marcadores = extrairMarcadoresDaLinha(tr);
      const nomes = marcadores.map((m) => m.nome);
      expect(nomes).toContain('Urgente / Prazo 24h');
      expect(nomes).toContain('Em Análise');
    });

    it('extrai marcadores com tooltip infraTooltipMostrar com 2 argumentos', () => {
      const parser = new DOMParser();
      const doc = parser.parseFromString(`
        <table>
          <tr>
            <td>
              <a href="controlador.php?acao=andamento_marcador_gerenciar" 
                 onmouseover="return infraTooltipMostrar('Prioridade Alta', 'Marcador');">
                <img src="svg/marcador_azul.svg" />
              </a>
              <a href="controlador.php?acao=andamento_marcador_gerenciar" 
                 onmouseover="return infraTooltipMostrar('Aguardando parecer da assessoria', 'Marcador: Análise Jurídica');">
                <img src="svg/marcador_amarelo.svg" />
              </a>
            </td>
          </tr>
        </table>
      `, 'text/html');
      const tr = doc.querySelector('tr')!;
      const marcadores = extrairMarcadoresDaLinha(tr);
      const nomes = marcadores.map((m) => m.nome);
      expect(nomes).toContain('Prioridade Alta');
      expect(nomes).toContain('Análise Jurídica');

      const jurídica = marcadores.find((m) => m.nome === 'Análise Jurídica');
      expect(jurídica?.texto).toBe('Aguardando parecer da assessoria');

      const prioridade = marcadores.find((m) => m.nome === 'Prioridade Alta');
      expect(prioridade?.texto).toBeUndefined();
    });

    it('limpa metadados de data e usuário em tooltips de marcadores', () => {
      const parser = new DOMParser();
      const doc = parser.parseFromString(`
        <table>
          <tr>
            <td>
              <a href="controlador.php?acao=andamento_marcador_gerenciar" 
                 title="Gabinete do Secretário - Marco Guerra (24/08/2026 10:15)">
                <img src="svg/marcador.svg" />
              </a>
            </td>
          </tr>
        </table>
      `, 'text/html');
      const tr = doc.querySelector('tr')!;
      const marcadores = extrairMarcadoresDaLinha(tr);
      expect(marcadores).toEqual([{ nome: 'Gabinete do Secretário' }]);
    });
  });

  describe('extrairUsuarioLogado', () => {
    it('extrai usuário de #lblUsuario', () => {
      const html = `<html><body><span id="lblUsuario">Marco Túlio Guerra (MG123456)</span></body></html>`;
      expect(extrairUsuarioLogado(html)).toBe('MG123456');
    });

    it('extrai usuário direto do texto de identificação', () => {
      const html = `<html><body><a id="ancoraUsuario">MARCO.GUERRA</a></body></html>`;
      expect(extrairUsuarioLogado(html)).toBe('MARCO.GUERRA');
    });
  });

  describe('parseProcessosHtml', () => {
    it('retorna array vazio quando recebe tela de login', () => {
      const htmlLogin = `
        <html>
          <body>
            <form id="formLogin">
              <input type="text" name="txtUsuario" />
              <input type="password" name="txtSenha" />
            </form>
          </body>
        </html>
      `;
      expect(parseProcessosHtml(htmlLogin)).toEqual([]);
    });

    it('extrai processos com assunto, atribuição e marcadores', () => {
      const html = `
        <table id="tblProcessosRecebidos" class="infraTable">
          <thead><tr><th>Processo</th></tr></thead>
          <tbody>
            <tr>
              <td>
                <input type="checkbox" name="chkProcessos[]" value="123" />
                <a href="controlador.php?acao=procedimento_trabalhar&id_procedimento=1001" 
                   title="Assunto: Manutenção de viatura operacional">
                  1400.01.000142/2026-18
                </a>
                <a class="ancoraSigla" title="Processo atribuído para MARCO.GUERRA">MARCO.GUERRA</a>
                <img src="marcador.png" title="Marcador: Urgente" />
              </td>
            </tr>
            <tr>
              <td>
                <input type="checkbox" name="chkProcessos[]" value="124" />
                <a href="controlador.php?acao=procedimento_trabalhar&id_procedimento=1002" 
                   title="Especificação: Aquisição de EPI">
                  1400.01.000098/2026-43
                </a>
              </td>
            </tr>
          </tbody>
        </table>
      `;

      const processos = parseProcessosHtml(html, 'https://www.sei.mg.gov.br/sei/controlador.php?acao=procedimento_controlar');
      expect(processos).toHaveLength(2);
      expect(processos[0]?.numero).toBe('1400.01.000142/2026-18');
      expect(processos[0]?.assunto).toBe('Manutenção de viatura operacional');
      expect(processos[0]?.link).toBe('https://www.sei.mg.gov.br/sei/controlador.php?acao=procedimento_trabalhar&id_procedimento=1001');
      expect(processos[0]?.atribuidoPara).toBe('MARCO.GUERRA');
      expect(processos[0]?.marcadores).toEqual([{ nome: 'Urgente' }]);

      expect(processos[1]?.numero).toBe('1400.01.000098/2026-43');
      expect(processos[1]?.assunto).toBe('Aquisição de EPI');
      // A outra linha da mesma tabela teve a atribuição lida com sucesso, o que
      // prova que o parser sabe lê-la ali: a ausência aqui é "sem atribuição"
      expect(processos[1]?.atribuidoPara).toBeNull();
      expect(processos[1]?.marcadores).toBeUndefined();
    });

    it('extrai processos com assunto a partir de coluna separada na tabela', () => {
      const html = `
        <table id="tblProcessosRecebidos" class="infraTable">
          <tbody>
            <tr>
              <td><input type="checkbox" /></td>
              <td>
                <a href="controlador.php?acao=procedimento_trabalhar&id_procedimento=2001">
                  1400.01.000077/2026-29
                </a>
              </td>
              <td>Solicitação de parecer técnico de engenharia</td>
            </tr>
          </tbody>
        </table>
      `;

      const processos = parseProcessosHtml(html);
      expect(processos).toHaveLength(1);
      expect(processos[0]?.numero).toBe('1400.01.000077/2026-29');
      expect(processos[0]?.assunto).toBe('Solicitação de parecer técnico de engenharia');
    });

    it('extrai processos com tooltip JS em elemento auxiliar da linha', () => {
      const html = `
        <table>
          <tbody>
            <tr>
              <td>
                <a href="controlador.php?acao=procedimento_trabalhar&id_procedimento=3001">
                  1400.01.000031/2026-09
                </a>
                <span title="Assunto: Relatório mensal de desempenho">ℹ️</span>
              </td>
            </tr>
          </tbody>
        </table>
      `;

      const processos = parseProcessosHtml(html);
      expect(processos).toHaveLength(1);
      expect(processos[0]?.numero).toBe('1400.01.000031/2026-09');
      expect(processos[0]?.assunto).toBe('Relatório mensal de desempenho');
    });
  });

  describe('extrairTodosMarcadoresDaPagina', () => {
    it('extrai marcadores de select de filtro do SEI e das linhas da tabela', () => {
      const html = `
        <html>
          <body>
            <select id="selMarcador">
              <option value="">Todos</option>
              <option value="1">Urgente</option>
              <option value="2">Licitação / Contrato</option>
            </select>
            <table>
              <tr>
                <td>
                  <a href="controlador.php?acao=andamento_marcador_gerenciar" title="Marcador: Almoxarifado">🏷️</a>
                </td>
              </tr>
            </table>
          </body>
        </html>
      `;

      const marcadores = extrairTodosMarcadoresDaPagina(html);
      expect(marcadores).toContain('Urgente');
      expect(marcadores).toContain('Licitação / Contrato');
      expect(marcadores).toContain('Almoxarifado');
      expect(marcadores).not.toContain('Todos');
    });

    it('retorna array vazio para páginas sem marcadores ou inputs inválidos', () => {
      expect(extrairTodosMarcadoresDaPagina('')).toEqual([]);
      expect(extrairTodosMarcadoresDaPagina('<html><body><div>Sem tags</div></body></html>')).toEqual([]);
    });
  });
});

