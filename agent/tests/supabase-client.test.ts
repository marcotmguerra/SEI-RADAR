import { describe, expect, it, vi } from 'vitest';
import { criarClienteSincronizacaoUsuario, type PortaClienteSupabase } from '../src/api/supabase-client';

describe('criarClienteSincronizacaoUsuario', () => {
  it('autentica com a chave anonima e envia a RPC na sessao do usuario', async () => {
    const entrarComSenha = vi.fn(async () => ({ data: { session: { access_token: 'usuario' } }, error: null }));
    const rpc = vi.fn(async () => ({ data: { sincronizacao_id: 'sincronizacao' }, error: null }));
    const cliente = { auth: { signInWithPassword: entrarComSenha }, rpc } satisfies PortaClienteSupabase;
    const fabrica = vi.fn(() => cliente);

    const clienteSincronizacao = await criarClienteSincronizacaoUsuario(
      {
        url: 'https://example.supabase.co',
        chavePublica: 'public-anon-key-with-enough-length',
        email: 'servidor@example.gov.br',
        senha: 'senha-local',
      },
      fabrica,
    );
    await clienteSincronizacao.enviar({ execucao_cliente_id: crypto.randomUUID(), status: 'SUCESSO' });

    expect(fabrica).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'public-anon-key-with-enough-length',
      expect.objectContaining({
        auth: expect.objectContaining({ persistSession: false, autoRefreshToken: true }),
      }),
    );
    expect(entrarComSenha).toHaveBeenCalledWith({
      email: 'servidor@example.gov.br',
      password: 'senha-local',
    });
    expect(rpc).toHaveBeenCalledWith('aplicar_retrato_sincronizacao', {
      p_retrato: expect.objectContaining({ status: 'SUCESSO' }),
    });
  });

  it('nao devolve detalhes potencialmente sensiveis em erro de autenticacao', async () => {
    const cliente: PortaClienteSupabase = {
      auth: {
        signInWithPassword: vi.fn(async () => ({
          data: { session: null },
          error: { message: 'senha=segredo token=abc' },
        })),
      },
      rpc: vi.fn(),
    };
    await expect(
      criarClienteSincronizacaoUsuario(
        { url: 'https://example.supabase.co', chavePublica: 'anon', email: 'u@example.com', senha: 'segredo' },
        () => cliente,
      ),
    ).rejects.toThrow('Falha ao autenticar');
    await expect(
      criarClienteSincronizacaoUsuario(
        { url: 'https://example.supabase.co', chavePublica: 'anon', email: 'u@example.com', senha: 'segredo' },
        () => cliente,
      ),
    ).rejects.not.toThrow(/segredo|token=abc/);
  });

  it('sanitiza erros retornados pela RPC', async () => {
    const cliente: PortaClienteSupabase = {
      auth: {
        signInWithPassword: vi.fn(async () => ({ data: { session: {} }, error: null })),
      },
      rpc: vi.fn(async () => ({ data: null, error: { message: 'conteudo e token internos' } })),
    };
    const clienteSincronizacao = await criarClienteSincronizacaoUsuario(
      { url: 'https://example.supabase.co', chavePublica: 'anon', email: 'u@example.com', senha: 'segredo' },
      () => cliente,
    );
    await expect(clienteSincronizacao.enviar({ status: 'ERRO' })).rejects.toThrow(
      'Falha ao registrar a sincronização',
    );
    await expect(clienteSincronizacao.enviar({ status: 'ERRO' })).rejects.not.toThrow(/token internos/);
  });
});
