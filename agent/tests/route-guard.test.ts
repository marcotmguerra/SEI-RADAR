import { describe, expect, it, vi } from 'vitest';
import { instalarProtecaoRotasColeta, type PortaRotaColeta } from '../src/browser/route-guard';

const requisicao = (metodo: string, url: string): PortaRotaColeta => ({
  request: () => ({ method: () => metodo, url: () => url }),
  abort: vi.fn(async () => undefined),
  continue: vi.fn(async () => undefined),
});

describe('instalarProtecaoRotasColeta', () => {
  it('bloqueia metodos que podem escrever', async () => {
    let manipulador: ((rota: PortaRotaColeta) => Promise<void>) | undefined;
    const contexto = {
      route: vi.fn(async (_padrao: string, candidato: typeof manipulador) => {
        manipulador = candidato;
      }),
    };
    await instalarProtecaoRotasColeta(contexto, 'https://sei.example');
    const requisicaoPost = requisicao('POST', 'https://sei.example/controlador.php?acao=procedimento_controlar');
    await manipulador?.(requisicaoPost);
    expect(requisicaoPost.abort).toHaveBeenCalledOnce();
    expect(requisicaoPost.continue).not.toHaveBeenCalled();
  });

  it.each([
    'https://sei.example/controlador.php?acao=usuario_sair',
    'https://sei.example/controlador.php?acao=procedimento_controlar&acao=procedimento_controlar',
    'https://sso.example/login',
  ])('bloqueia acao SEI fora da lista permitida ou duplicada: %s', async (url) => {
    let manipulador: ((rota: PortaRotaColeta) => Promise<void>) | undefined;
    await instalarProtecaoRotasColeta(
      { route: async (_padrao, candidato) => void (manipulador = candidato) },
      'https://sei.example',
    );
    const protegida = requisicao('GET', url);
    await manipulador?.(protegida);
    expect(protegida.abort).toHaveBeenCalledOnce();
  });

  it.each([
    'https://sei.example/controlador.php?acao=procedimento_controlar',
    'https://sei.example/controlador.php?acao=usuario_autenticar',
    'https://sei.example/infra_css/estilos.css',
  ])('permite GET/HEAD somente leitura e telas necessarias: %s', async (url) => {
    let manipulador: ((rota: PortaRotaColeta) => Promise<void>) | undefined;
    await instalarProtecaoRotasColeta(
      { route: async (_padrao, candidato) => void (manipulador = candidato) },
      'https://sei.example',
    );
    const protegida = requisicao('HEAD', url);
    await manipulador?.(protegida);
    expect(protegida.continue).toHaveBeenCalledOnce();
  });
});
