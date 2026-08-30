import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { executarVerificacaoSei, deveNotificarProcesso } from './service-worker';
import { obterProcessos, salvarConfiguracao, salvarProcessos } from '../shared/storage';
import {
  parseProcessosHtml,
  extrairUsuarioLogado,
  extrairTodosMarcadoresDaPagina,
} from '../shared/sei-parser';
import type { ConfiguracaoExtensao, ProcessoSei } from '../types';

const HTML_LOGIN = `
  <html>
    <body>
      <form id="formLogin">
        <input type="text" name="txtUsuario" />
        <input type="password" name="txtSenha" />
      </form>
    </body>
  </html>
`;

const HTML_PROCESSOS = `
  <table id="tblProcessosRecebidos" class="infraTable">
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
    </tbody>
  </table>
`;

/**
 * O SEI serve páginas em ISO-8859-1 e a extensão lê a resposta por arrayBuffer,
 * decodificando conforme o Content-Type. O mock reproduz esse contrato.
 */
const mockFetchOk = (html: string, charset = 'iso-8859-1') => {
  const bytes =
    charset === 'iso-8859-1'
      ? Uint8Array.from([...html].map((c) => c.charCodeAt(0) & 0xff))
      : new TextEncoder().encode(html);

  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => `text/html; charset=${charset}` },
      arrayBuffer: async () => bytes.buffer,
      text: async () => html,
    })
  );
};

/**
 * Simula o documento offscreen respondendo à mensagem PARSEAR_HTML_SEI,
 * usando as mesmas funções reais que offscreen.ts chama (com DOMParser,
 * disponível no ambiente de teste jsdom mas não no service worker real).
 */
const criarNotificacao = vi.fn().mockResolvedValue(undefined);

const mockOffscreenDisponivel = () => {
  criarNotificacao.mockClear();
  (globalThis as any).chrome = {
    permissions: { contains: vi.fn().mockResolvedValue(true) },
    notifications: { create: criarNotificacao },
    action: {
      setBadgeText: vi.fn().mockResolvedValue(undefined),
      setBadgeBackgroundColor: vi.fn().mockResolvedValue(undefined),
    },
    offscreen: {
      Reason: { AUDIO_PLAYBACK: 'AUDIO_PLAYBACK', DOM_PARSER: 'DOM_PARSER' },
      hasDocument: vi.fn().mockResolvedValue(true),
      createDocument: vi.fn().mockResolvedValue(undefined),
    },
    runtime: {
      getURL: (caminho: string) => caminho,
      sendMessage: vi.fn().mockImplementation(async (mensagem: any) => {
        if (mensagem?.tipo === 'PARSEAR_HTML_SEI') {
          return {
            processos: parseProcessosHtml(mensagem.html, mensagem.urlBase),
            usuarioLogado: extrairUsuarioLogado(mensagem.html),
            marcadoresDisponiveis: extrairTodosMarcadoresDaPagina(mensagem.html),
          };
        }
        return undefined;
      }),
    },
  };
};

describe('executarVerificacaoSei', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    delete (globalThis as any).chrome;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('não lança exceção quando não há chrome.tabs nem chrome.permissions disponíveis (cenário de sandbox sem aba do SEI aberta)', async () => {
    // Reproduz o ambiente em que o bug original (DOMParser dentro do service worker)
    // travava: nenhuma aba do SEI aberta e nenhuma API do chrome disponível ainda.
    delete (globalThis as any).chrome;

    const resultado = await executarVerificacaoSei();

    expect(resultado.sucesso).toBe(false);
    expect(resultado.semPermissao).toBe(true);
    expect(resultado.novos).toBe(0);
  });

  it('não tenta fazer fetch quando a permissão de host não foi concedida para a origem configurada', async () => {
    (globalThis as any).chrome = {
      permissions: { contains: vi.fn().mockResolvedValue(false) },
    };
    const fetchEspiao = vi.fn();
    vi.stubGlobal('fetch', fetchEspiao);

    const resultado = await executarVerificacaoSei();

    expect(resultado.sucesso).toBe(false);
    expect(resultado.semPermissao).toBe(true);
    expect(fetchEspiao).not.toHaveBeenCalled();
  });

  it('detecta a tela de login sem lançar exceção e sem travar no fallback de fetch', async () => {
    mockOffscreenDisponivel();
    mockFetchOk(HTML_LOGIN);

    const resultado = await executarVerificacaoSei();

    expect(resultado.sucesso).toBe(false);
    expect(resultado.mensagem).toBe('Faça login no SEI');
  });

  it('busca, interpreta (via documento offscreen) e salva processos do HTML retornado pelo fetch direto', async () => {
    // Escopo "unidade" para não depender de CPF configurado — o foco do teste é a
    // interpretação do HTML via offscreen, não o filtro de escopo do radar.
    await salvarConfiguracao({ escopoRadar: 'unidade' });
    mockOffscreenDisponivel();
    mockFetchOk(HTML_PROCESSOS);

    const resultado = await executarVerificacaoSei();

    expect(resultado.sucesso).toBe(true);
    expect(resultado.total).toBe(1);

    const processosSalvos = await obterProcessos();
    expect(processosSalvos).toHaveLength(1);
    expect(processosSalvos[0]?.numero).toBe('1400.01.000142/2026-18');
    expect(processosSalvos[0]?.assunto).toBe('Manutenção de viatura operacional');
    expect(processosSalvos[0]?.atribuidoPara).toBe('MARCO.GUERRA');
    expect(processosSalvos[0]?.marcadores).toEqual([{ nome: 'Urgente' }]);
  });

  it('retorna erro tratado (sem lançar exceção) quando o fetch falha', async () => {
    (globalThis as any).chrome = {
      permissions: { contains: vi.fn().mockResolvedValue(true) },
    };
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Falha de rede simulada')));

    const resultado = await executarVerificacaoSei();

    expect(resultado.sucesso).toBe(false);
    expect(resultado.mensagem).toBe('Falha de rede simulada');
  });
});

describe('deveNotificarProcesso', () => {
  const configBase: ConfiguracaoExtensao = {
    urlControle: 'https://www.sei.mg.gov.br/sei/controlador.php?acao=procedimento_controlar',
    intervaloMinutos: 5,
    somAtivo: true,
    notificacoesAtivas: true,
    notificarDesconexao: false,
    regraNotificacao: 'todos',
    usuarioSigla: '',
      marcadoresNotificacao: [],
    primeiraCargaRealizada: true,
    escopoRadar: 'atribuidos',
    marcadoresRadar: [],
    radarOnboardingConcluido: true,
  };

  const processoBase: ProcessoSei = {
    numero: '1400.01.000142/2026-18',
    assunto: 'Assunto de teste',
    link: 'https://www.sei.mg.gov.br/1',
    detectadoEm: new Date().toISOString(),
    lido: false,
    atribuidoPara: 'MARCO.GUERRA',
  };

  it('nunca notifica quando as notificações estão desativadas', () => {
    expect(deveNotificarProcesso(processoBase, { ...configBase, notificacoesAtivas: false })).toBe(
      false
    );
  });

  it('notifica todos os processos quando a regra é "todos"', () => {
    expect(deveNotificarProcesso(processoBase, { ...configBase, regraNotificacao: 'todos' })).toBe(
      true
    );
  });

  it('regra "atribuidos" só notifica quando a sigla configurada bate com a atribuição', () => {
    const config = { ...configBase, regraNotificacao: 'atribuidos' as const, usuarioSigla: 'MARCO.GUERRA' };
    expect(deveNotificarProcesso(processoBase, config)).toBe(true);
    expect(
      deveNotificarProcesso(processoBase, { ...config, usuarioSigla: 'OUTRO.USUARIO' })
    ).toBe(false);
  });

  it('regra "atribuidos_e_marcadores" notifica por marcador de interesse mesmo sem atribuição', () => {
    const config = {
      ...configBase,
      regraNotificacao: 'atribuidos_e_marcadores' as const,
      usuarioSigla: 'OUTRO.USUARIO',
          marcadoresNotificacao: ['Urgente'],
    };
    const processoComMarcador: ProcessoSei = {
      ...processoBase,
      atribuidoPara: 'ALGUEM.MAIS',
      marcadores: [{ nome: 'Urgente' }],
    };
    expect(deveNotificarProcesso(processoComMarcador, config)).toBe(true);
  });

  describe('mesclagem da atribuição', () => {
    // Tabela com coluna "Atribuição" explícita, para que a leitura seja conclusiva
    const htmlComColuna = (atribuicao: string) => `
      <table id="tblProcessosRecebidos">
        <tr><th>Processo</th><th>Atribuição</th></tr>
        <tr>
          <td><a href="controlador.php?acao=procedimento_trabalhar&id_procedimento=1001"
                 title="Assunto: Manutenção de viatura">1400.01.000142/2026-18</a></td>
          <td>${atribuicao}</td>
        </tr>
      </table>`;

    it('reflete a desatribuição feita no SEI', async () => {
      mockOffscreenDisponivel();
      await salvarConfiguracao({ primeiraCargaRealizada: true, escopoRadar: 'unidade' });

      mockFetchOk(htmlComColuna('MARCO.GUERRA'));
      await executarVerificacaoSei();
      expect((await obterProcessos())[0]?.atribuidoPara).toBe('MARCO.GUERRA');

      // O processo foi desatribuído: a célula agora está vazia
      mockFetchOk(htmlComColuna(''));
      await executarVerificacaoSei();
      expect((await obterProcessos())[0]?.atribuidoPara).toBeNull();
    });

    it('preserva a atribuição quando a leitura é inconclusiva', async () => {
      mockOffscreenDisponivel();
      await salvarConfiguracao({ primeiraCargaRealizada: true, escopoRadar: 'unidade' });

      mockFetchOk(htmlComColuna('MARCO.GUERRA'));
      await executarVerificacaoSei();
      expect((await obterProcessos())[0]?.atribuidoPara).toBe('MARCO.GUERRA');

      // Página sem coluna de atribuição e sem tooltip: não dá para concluir nada
      mockFetchOk(`
        <table id="tblProcessosRecebidos">
          <tr>
            <td><a href="controlador.php?acao=procedimento_trabalhar&id_procedimento=1001"
                   title="Assunto: Manutenção de viatura">1400.01.000142/2026-18</a></td>
          </tr>
        </table>`);
      await executarVerificacaoSei();
      expect((await obterProcessos())[0]?.atribuidoPara).toBe('MARCO.GUERRA');
    });
  });

  describe('primeira sincronização', () => {
    // Duas linhas para evidenciar que nenhuma delas vira notificação
    const HTML_DOIS = `
      <table id="tblProcessosRecebidos">
        <tr><th>Processo</th><th>Atribuição</th></tr>
        <tr>
          <td><a href="controlador.php?acao=procedimento_trabalhar&id_procedimento=1"
                 title="Assunto: Um">1400.01.000001/2026-01</a></td><td>FULANO</td>
        </tr>
        <tr>
          <td><a href="controlador.php?acao=procedimento_trabalhar&id_procedimento=2"
                 title="Assunto: Dois">1400.01.000002/2026-02</a></td><td>CICLANO</td>
        </tr>
      </table>`;

    beforeEach(async () => {
      localStorage.clear();
      mockOffscreenDisponivel();
      // Estado explícito de instalação nova: escopo amplo, primeira carga pendente
      await salvarConfiguracao({ escopoRadar: 'unidade', primeiraCargaRealizada: false });
      criarNotificacao.mockClear();
    });

    it('não emite nenhuma notificação na primeira carga', async () => {
      mockFetchOk(HTML_DOIS);

      const resultado = await executarVerificacaoSei();

      expect(resultado.novos).toBe(0);
      expect(criarNotificacao).not.toHaveBeenCalled();
      expect(await obterProcessos()).toHaveLength(2);
    });

    it('coletas simultâneas na primeira carga continuam sem notificar', async () => {
      mockFetchOk(HTML_DOIS);

      // Reproduz o content script empurrando várias coletas ao mesmo tempo:
      // sem serialização, uma delas lia a lista ainda vazia e notificava tudo
      await Promise.all([
        executarVerificacaoSei(),
        executarVerificacaoSei(),
        executarVerificacaoSei(),
      ]);

      expect(criarNotificacao).not.toHaveBeenCalled();
      expect(await obterProcessos()).toHaveLength(2);
    });

    it('não notifica quando o armazenamento está vazio, mesmo com a carga já marcada', async () => {
      // Estado alcançável após "Limpar" ou troca de escopo do Radar: a lista foi
      // esvaziada, mas a primeira carga continua marcada como concluída
      await salvarConfiguracao({ escopoRadar: 'unidade', primeiraCargaRealizada: true });
      await salvarProcessos([]);
      mockFetchOk(HTML_DOIS);

      const resultado = await executarVerificacaoSei();

      expect(resultado.novos).toBe(0);
      expect(criarNotificacao).not.toHaveBeenCalled();
      expect(await obterProcessos()).toHaveLength(2);
    });

    it('notifica apenas o que chega depois da primeira carga', async () => {
      mockFetchOk(HTML_DOIS);
      await executarVerificacaoSei();
      expect(criarNotificacao).not.toHaveBeenCalled();

      // Um terceiro processo aparece na listagem
      mockFetchOk(HTML_DOIS.replace('</table>', `
        <tr>
          <td><a href="controlador.php?acao=procedimento_trabalhar&id_procedimento=3"
                 title="Assunto: Tres">1400.01.000003/2026-03</a></td><td>BELTRANO</td>
        </tr></table>`));

      const resultado = await executarVerificacaoSei();

      expect(resultado.novos).toBe(1);
      expect(criarNotificacao).toHaveBeenCalledTimes(1);
    });
  });
});

describe('aviso de sessão finalizada', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    delete (globalThis as any).chrome;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** Leva o status a "conectado", que é o ponto de partida de qualquer queda real */
  const conectarPrimeiro = async () => {
    mockFetchOk(HTML_PROCESSOS);
    await executarVerificacaoSei();
  };

  it('não avisa nada quando notificarDesconexao está desligado (o padrão)', async () => {
    await salvarConfiguracao({ escopoRadar: 'unidade' });
    mockOffscreenDisponivel();
    await conectarPrimeiro();

    mockFetchOk(HTML_LOGIN);
    await executarVerificacaoSei();

    expect(criarNotificacao).not.toHaveBeenCalled();
  });

  it('avisa uma vez na queda da sessão quando o usuário liga a opção', async () => {
    await salvarConfiguracao({ escopoRadar: 'unidade', notificarDesconexao: true });
    mockOffscreenDisponivel();
    await conectarPrimeiro();

    mockFetchOk(HTML_LOGIN);
    await executarVerificacaoSei();

    expect(criarNotificacao).toHaveBeenCalledTimes(1);
    expect(criarNotificacao.mock.calls[0]?.[1]?.title).toContain('Sessão do SEI Finalizada');
  });

  it('não repete o aviso a cada verificação enquanto a sessão continua caída', async () => {
    await salvarConfiguracao({ escopoRadar: 'unidade', notificarDesconexao: true });
    mockOffscreenDisponivel();
    await conectarPrimeiro();

    mockFetchOk(HTML_LOGIN);
    await executarVerificacaoSei();
    await executarVerificacaoSei();
    await executarVerificacaoSei();

    expect(criarNotificacao).toHaveBeenCalledTimes(1);
  });

  it('continua sem repetir o aviso depois de o service worker ser descartado e recarregado', async () => {
    // A regressão original: o cooldown morava numa variável de módulo, e o service worker do
    // Manifest V3 é descartado depois de segundos ocioso. A cada despertar do alarme o módulo
    // voltava zerado e o aviso disparava de novo — de 5 em 5 minutos, indefinidamente.
    // resetModules + reimportação reproduzem exatamente esse descarte.
    await salvarConfiguracao({ escopoRadar: 'unidade', notificarDesconexao: true });
    mockOffscreenDisponivel();
    await conectarPrimeiro();

    mockFetchOk(HTML_LOGIN);
    await executarVerificacaoSei();
    expect(criarNotificacao).toHaveBeenCalledTimes(1);

    vi.resetModules();
    const moduloRecarregado = await import('./service-worker');
    mockFetchOk(HTML_LOGIN);
    await moduloRecarregado.executarVerificacaoSei();

    expect(criarNotificacao).toHaveBeenCalledTimes(1);
  });

  it('volta a avisar depois de a sessão se recuperar e cair de novo', async () => {
    await salvarConfiguracao({ escopoRadar: 'unidade', notificarDesconexao: true });
    mockOffscreenDisponivel();
    await conectarPrimeiro();

    mockFetchOk(HTML_LOGIN);
    await executarVerificacaoSei();
    expect(criarNotificacao).toHaveBeenCalledTimes(1);

    // Reconexão limpa o marcador persistido...
    await conectarPrimeiro();
    // ...e a queda seguinte é uma novidade de verdade.
    mockFetchOk(HTML_LOGIN);
    await executarVerificacaoSei();

    expect(criarNotificacao).toHaveBeenCalledTimes(2);
  });
});
