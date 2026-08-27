import { describe, it, expect } from 'vitest';
import { detectarCharset, decodificarHtml, lerHtmlDaResposta } from './http-sei';
import { parseAndamentoHtml } from './andamento-parser';

/** Codifica texto em ISO-8859-1, como o SEI faz */
const emLatin1 = (texto: string): Uint8Array =>
  Uint8Array.from([...texto].map((c) => c.charCodeAt(0) & 0xff));

const META_LATIN1 = '<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1"/>';

describe('Leitura de HTML do SEI', () => {
  describe('detectarCharset', () => {
    it('prefere o charset declarado no cabeçalho', () => {
      const bytes = emLatin1(`<html><head>${META_LATIN1}</head></html>`);
      expect(detectarCharset(bytes, 'text/html; charset=utf-8')).toBe('utf-8');
    });

    it('cai para a metatag quando o cabeçalho não declara', () => {
      const bytes = emLatin1(`<html><head>${META_LATIN1}</head></html>`);
      expect(detectarCharset(bytes, 'text/html')).toBe('iso-8859-1');
      expect(detectarCharset(bytes, null)).toBe('iso-8859-1');
    });

    it('assume utf-8 quando nada é declarado', () => {
      expect(detectarCharset(emLatin1('<html></html>'), null)).toBe('utf-8');
    });
  });

  describe('decodificarHtml', () => {
    it('preserva os acentos de uma página ISO-8859-1 do SEI', () => {
      const html = `<html><head>${META_LATIN1}</head><body>Usuário Descrição</body></html>`;
      expect(decodificarHtml(emLatin1(html), 'text/html')).toContain('Usuário Descrição');
    });

    it('não quebra com rótulo de charset desconhecido', () => {
      const bytes = emLatin1('<html>ok</html>');
      expect(decodificarHtml(bytes, 'text/html; charset=inventado-9')).toContain('ok');
    });
  });

  describe('lerHtmlDaResposta', () => {
    it('decodifica o corpo conforme o Content-Type', async () => {
      const bytes = emLatin1('<html><body>Ofício nº 3126</body></html>');
      const resposta = {
        headers: { get: () => 'text/html; charset=iso-8859-1' },
        arrayBuffer: async () => bytes.buffer,
      } as unknown as Response;

      await expect(lerHtmlDaResposta(resposta)).resolves.toContain('Ofício nº 3126');
    });
  });

  it('a decodificação correta preserva o texto lido do andamento', () => {
    // Cabeçalho real do SEI. O parser hoje tolera o acento corrompido no cabeçalho,
    // mas o conteúdo das linhas só sai legível com a decodificação latina — e é ele
    // que o usuário lê no card.
    const html =
      `<html><head>${META_LATIN1}</head><body>` +
      '<table id="tblHistorico">' +
      '<tr><th>Data/Hora</th><th>Unidade</th><th>Usuário</th><th>Descrição</th></tr>' +
      '<tr><td>25/08/2026 10:55</td><td>CBMMG/BEMAD</td><td>03534676696</td>' +
      '<td>Conclusão do processo na unidade</td></tr>' +
      '</table></body></html>';

    const bytes = emLatin1(html);

    // Como a extensão lê agora: acentos íntegros na descrição
    const linhas = parseAndamentoHtml(decodificarHtml(bytes, 'text/html'));
    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.descricao).toBe('Conclusão do processo na unidade');

    // Como lia antes: bytes latinos decodificados como UTF-8 corrompem o texto
    const corrompidas = parseAndamentoHtml(new TextDecoder('utf-8').decode(bytes));
    expect(corrompidas[0]?.descricao).not.toBe('Conclusão do processo na unidade');
  });

  describe('quando o servidor declara o charset errado', () => {
    // Cabeçalho da tabela de andamento do SEI, com o acento que a coluna depende
    const CABECALHO = 'Data/Hora | Unidade | Usuário | Descrição';

    it('recupera o texto quando o cabeçalho anuncia UTF-8 mas o corpo é latino', () => {
      const bytes = emLatin1(`<html><body>${CABECALHO}</body></html>`);
      const texto = decodificarHtml(bytes, 'text/html; charset=utf-8');
      expect(texto).toContain(CABECALHO);
      expect(texto).not.toContain('\uFFFD');
    });

    it('a tabela de andamento volta a ser reconhecida nesse cenário', () => {
      const html =
        '<html><body><table id="tblHistorico">' +
        '<tr><th>Data/Hora</th><th>Unidade</th><th>Usuário</th><th>Descrição</th></tr>' +
        '<tr><td>06/07/2026 15:45</td><td>CBMMG/BEMAD</td><td>05515322622</td>' +
        '<td>Conclusão do processo na unidade</td></tr>' +
        '</table></body></html>';

      const bytes = emLatin1(html);
      expect(parseAndamentoHtml(decodificarHtml(bytes, 'text/html; charset=utf-8'))).toHaveLength(1);
    });

    it('não mexe em conteúdo UTF-8 legítimo', () => {
      const bytes = new TextEncoder().encode('<html><body>Ofício nº 1</body></html>');
      expect(decodificarHtml(bytes, 'text/html; charset=utf-8')).toContain('Ofício nº 1');
    });
  });
});
