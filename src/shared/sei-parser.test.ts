import { describe, it, expect } from 'vitest';
import { parseProcessosHtml, extrairTextoAssunto, resolverUrlAbsoluta } from './sei-parser';

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

    it('extrai processos com assunto a partir do atributo title do link', () => {
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

      expect(processos[1]?.numero).toBe('1400.01.000098/2026-43');
      expect(processos[1]?.assunto).toBe('Aquisição de EPI');
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
});

