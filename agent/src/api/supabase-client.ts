import { createClient } from '@supabase/supabase-js';

export interface CredenciaisUsuarioSupabase {
  readonly url: string;
  readonly chavePublica: string;
  readonly email: string;
  readonly senha: string;
}

interface ResultadoAutenticacao {
  readonly data: { readonly session: unknown | null };
  readonly error: { readonly message: string } | null;
}

interface ResultadoRpc {
  readonly data: unknown;
  readonly error: { readonly message: string } | null;
}

export interface PortaClienteSupabase {
  readonly auth: {
    signInWithPassword(credenciais: { email: string; password: string }): Promise<ResultadoAutenticacao>;
  };
  rpc(nome: string, parametros: Record<string, unknown>): Promise<ResultadoRpc>;
}

export type FabricaClienteSupabase = (
  url: string,
  chavePublica: string,
  opcoes: {
    auth: {
      persistSession: false;
      autoRefreshToken: true;
      detectSessionInUrl: false;
    };
  },
) => PortaClienteSupabase;

export interface ClienteSincronizacaoUsuario {
  enviar(retrato: Record<string, unknown>): Promise<unknown>;
}

const fabricaPadrao: FabricaClienteSupabase = (url, chavePublica, opcoes) =>
  createClient(url, chavePublica, opcoes) as unknown as PortaClienteSupabase;

export const criarClienteSincronizacaoUsuario = async (
  credenciais: CredenciaisUsuarioSupabase,
  fabrica: FabricaClienteSupabase = fabricaPadrao,
): Promise<ClienteSincronizacaoUsuario> => {
  const cliente = fabrica(credenciais.url, credenciais.chavePublica, {
    auth: {
      persistSession: false,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  const autenticacao = await cliente.auth.signInWithPassword({
    email: credenciais.email,
    password: credenciais.senha,
  });
  if (autenticacao.error !== null || autenticacao.data.session === null) {
    throw new Error('Falha ao autenticar o usuário do CRM no Supabase');
  }

  return Object.freeze({
    enviar: async (retrato: Record<string, unknown>): Promise<unknown> => {
      const resultado = await cliente.rpc('aplicar_retrato_sincronizacao', { p_retrato: retrato });
      if (resultado.error !== null) {
        throw new Error('Falha ao registrar a sincronização no Supabase');
      }
      return resultado.data;
    },
  });
};
