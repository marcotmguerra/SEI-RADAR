import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { executarVerificacaoSei, deveNotificarProcesso } from './service-worker';
import { obterProcessos, salvarConfiguracao } from '../shared/storage';
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

const mockFetchOk = (html: string) => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => html,
    })
  );
};

/**
 * Simula o documento offscreen respondendo à mensagem PARSEAR_HTML_SEI,
 * usando as mesmas funções reais que offscreen.ts chama (com DOMParser,
 * disponível no ambiente de teste jsdom mas não no service worker real).
 */
const mockOffscreenDisponivel = () => {
  (globalThis as any).chrome = {
    permissions: { contains: vi.fn().mockResolvedValue(true) },
    offscreen: {
      Reason: { AUDIO_PLAYBACK: 'AUDIO_PLAYBACK', DOM_PARSER: 'DOM_PARSER' },
      hasDocument: vi.fn().mockResolvedValue(true),
      createDocument: vi.fn().mockResolvedValue(undefined),
    },
    runtime: {
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
});
