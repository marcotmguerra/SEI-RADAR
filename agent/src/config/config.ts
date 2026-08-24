import { resolve } from 'node:path';
import { esquemaNomeMarcador } from '@crm-sei/core';
import { z } from 'zod';

export interface ConfiguracaoProxyAgente {
  readonly server: string;
  readonly username?: string;
  readonly password?: string;
  readonly bypass?: string;
}

export interface ConfiguracaoAgente {
  readonly urlBaseSei: string;
  readonly urlControleSei: string;
  readonly unidade: string;
  readonly supabase: {
    readonly url: string;
    readonly chavePublica: string;
    readonly email: string;
    readonly senha: string;
  };
  readonly instalacao: {
    readonly id: string;
    readonly token: string;
  };
  readonly caminhoEstadoSessao: string;
  readonly semInterface: boolean;
  readonly intervaloMinutos: number;
  readonly maximoPaginas: number;
  readonly proxy?: ConfiguracaoProxyAgente;
  readonly urlAtribuidos?: string;
  readonly urlsMarcadores?: Readonly<Record<string, string>>;
}

const booleanoDoAmbiente = (valorPadrao: boolean) =>
  z
    .enum(['true', 'false'])
    .default(String(valorPadrao) as 'true' | 'false')
    .transform((valor) => valor === 'true');

const urlOpcionalDoAmbiente = z.preprocess(
  (valor) => (valor === '' ? undefined : valor),
  z.url().optional(),
);

const textoOpcionalDoAmbiente = z.preprocess(
  (valor) => (valor === '' ? undefined : valor),
  z.string().optional(),
);

const esquemaAmbiente = z
  .object({
    URL_BASE_SEI: z.url(),
    URL_CONTROLE_SEI: z.url(),
    UNIDADE_SEI: z.string().trim().min(1).max(200).default('principal'),
    CAMINHO_ESTADO_SESSAO_SEI: z.string().trim().min(1).optional(),
    URL_ATRIBUIDOS_SEI: urlOpcionalDoAmbiente,
    URLS_MARCADORES_SEI_JSON: textoOpcionalDoAmbiente,
    URL_SUPABASE: z.url(),
    CHAVE_PUBLICA_SUPABASE: z.string().trim().min(8),
    EMAIL_USUARIO_SUPABASE: z.email(),
    SENHA_USUARIO_SUPABASE: z.string().min(8),
    ID_INSTALACAO_AGENTE_SUPABASE: z.uuid(),
    TOKEN_INSTALACAO_AGENTE_SUPABASE: z.string().min(32).max(512),
    CHAVE_SERVICO_SUPABASE: z.string().optional(),
    AGENTE_SEM_INTERFACE: booleanoDoAmbiente(true),
    INTERVALO_SINCRONIZACAO_MINUTOS: z.coerce.number().int().min(1).max(1_440).default(10),
    MAXIMO_PAGINAS_SEI: z.coerce.number().int().min(1).max(10_000).default(1_000),
    PROXY_ATIVADO: booleanoDoAmbiente(false),
    SERVIDOR_PROXY: z.url().optional(),
    USUARIO_PROXY: z.string().optional(),
    SENHA_PROXY: z.string().optional(),
    IGNORAR_PROXY: z.string().trim().min(1).optional(),
    PERMITIR_AUTENTICACAO_PROXY_INSEGURA: booleanoDoAmbiente(false),
  })
  .passthrough()
  .superRefine((valor, contexto) => {
    if (valor.CHAVE_SERVICO_SUPABASE !== undefined) {
      contexto.addIssue({
        code: 'custom',
        path: ['CHAVE_SERVICO_SUPABASE'],
        message: 'CHAVE_SERVICO_SUPABASE não pode ser usada pelo agente',
      });
    }
    if (valor.PROXY_ATIVADO && valor.SERVIDOR_PROXY === undefined) {
      contexto.addIssue({
        code: 'custom',
        path: ['SERVIDOR_PROXY'],
        message: 'SERVIDOR_PROXY é obrigatório quando o proxy está habilitado',
      });
    }
    const possuiUsuario = Boolean(valor.USUARIO_PROXY);
    const possuiSenha = Boolean(valor.SENHA_PROXY);
    if (valor.PROXY_ATIVADO && possuiUsuario !== possuiSenha) {
      contexto.addIssue({
        code: 'custom',
        path: [possuiUsuario ? 'SENHA_PROXY' : 'USUARIO_PROXY'],
        message: `${possuiUsuario ? 'SENHA_PROXY' : 'USUARIO_PROXY'} deve acompanhar a outra credencial`,
      });
    }
    if (
      valor.PROXY_ATIVADO &&
      possuiUsuario &&
      valor.SERVIDOR_PROXY !== undefined &&
      !valor.PERMITIR_AUTENTICACAO_PROXY_INSEGURA
    ) {
      const urlProxy = new URL(valor.SERVIDOR_PROXY);
      const retornoLocal = nomeHostRetornoLocal(urlProxy.hostname);
      if (urlProxy.protocol !== 'https:' && !retornoLocal) {
        contexto.addIssue({
          code: 'custom',
          path: ['PERMITIR_AUTENTICACAO_PROXY_INSEGURA'],
          message:
            'PERMITIR_AUTENTICACAO_PROXY_INSEGURA=true é obrigatório para autenticação em proxy remoto sem HTTPS',
        });
      }
    }
  });

const validarUrlHttp = (valor: string, campo: string): URL => {
  const url = new URL(valor);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${campo} deve usar HTTP ou HTTPS`);
  }
  return url;
};

const NOMES_HOST_RETORNO_LOCAL = new Set(['localhost', '127.0.0.1', '[::1]']);

function nomeHostRetornoLocal(nomeHost: string): boolean {
  return NOMES_HOST_RETORNO_LOCAL.has(nomeHost) || /^127(?:\.\d{1,3}){3}$/u.test(nomeHost);
}

const validarUrlRemotaSegura = (valor: string, campo: string): URL => {
  const url = validarUrlHttp(valor, campo);
  if (url.protocol !== 'https:' && !nomeHostRetornoLocal(url.hostname)) {
    throw new Error(`${campo} deve usar HTTPS fora do ambiente local`);
  }
  return url;
};

const chaveSupabasePrivada = (chave: string): boolean => {
  if (chave.startsWith('sb_secret_')) return true;
  const carga = chave.split('.')[1];
  if (carga === undefined) return false;
  try {
    const decodificada = JSON.parse(Buffer.from(carga, 'base64url').toString('utf8')) as {
      readonly role?: unknown;
    };
    return decodificada.role === 'service_role';
  } catch {
    return false;
  }
};

const interpretarUrlsMarcadores = (
  serializado: string | undefined,
  urlControle: URL,
): Readonly<Record<string, string>> | undefined => {
  if (serializado === undefined) return undefined;
  let candidato: unknown;
  try {
    candidato = JSON.parse(serializado);
  } catch {
    throw new Error('URLS_MARCADORES_SEI_JSON deve conter um objeto JSON válido');
  }
  if (candidato === null || typeof candidato !== 'object' || Array.isArray(candidato)) {
    throw new Error('URLS_MARCADORES_SEI_JSON deve conter um objeto nome -> URL');
  }
  const entradas = Object.entries(candidato);
  if (entradas.length > 100) throw new Error('URLS_MARCADORES_SEI_JSON excede o limite de 100 marcadores');
  const validadas = entradas.map(([nomeBruto, urlBruta]) => {
    const nome = esquemaNomeMarcador.parse(nomeBruto);
    if (typeof urlBruta !== 'string') {
      throw new Error(`URLS_MARCADORES_SEI_JSON possui URL inválida para ${nome}`);
    }
    const url = validarUrlColetor(urlBruta, urlControle, `URL do marcador ${nome}`);
    return [nome, url.href] as const;
  });
  const nomesNormalizados = validadas.map(([nome]) => nome);
  if (new Set(nomesNormalizados).size !== nomesNormalizados.length) {
    throw new Error('URLS_MARCADORES_SEI_JSON contém nomes de marcadores duplicados');
  }
  return entradas.length === 0 ? undefined : Object.freeze(Object.fromEntries(validadas));
};

function validarUrlColetor(valor: string, urlControle: URL, campo: string): URL {
  const url = validarUrlRemotaSegura(valor, campo);
  if (url.origin !== urlControle.origin) {
    throw new Error('Todas as URLs de coletores devem usar a mesma origem do SEI');
  }
  if (url.searchParams.getAll('acao').length !== 1) {
    throw new Error(`${campo} deve conter exatamente uma ocorrência do parâmetro acao`);
  }
  if (
    url.pathname !== urlControle.pathname ||
    url.searchParams.get('acao') !== urlControle.searchParams.get('acao')
  ) {
    throw new Error(`${campo} deve reutilizar a mesma rota e ação da tela de Controle do SEI`);
  }
  return url;
}

export const interpretarConfiguracaoAgente = (ambiente: NodeJS.ProcessEnv | Record<string, string | undefined>): ConfiguracaoAgente => {
  const interpretado = esquemaAmbiente.parse(ambiente);
  const baseSei = validarUrlRemotaSegura(interpretado.URL_BASE_SEI, 'URL_BASE_SEI');
  const controleSei = validarUrlRemotaSegura(interpretado.URL_CONTROLE_SEI, 'URL_CONTROLE_SEI');
  validarUrlRemotaSegura(interpretado.URL_SUPABASE, 'URL_SUPABASE');
  if (chaveSupabasePrivada(interpretado.CHAVE_PUBLICA_SUPABASE)) {
    throw new Error('CHAVE_PUBLICA_SUPABASE deve conter somente uma chave pública/anonima');
  }
  if (baseSei.origin !== controleSei.origin) {
    throw new Error('URL_CONTROLE_SEI deve usar a mesma origem de URL_BASE_SEI');
  }
  if (controleSei.searchParams.getAll('acao').length !== 1) {
    throw new Error('URL_CONTROLE_SEI deve conter exatamente uma ocorrência do parâmetro acao');
  }
  if (controleSei.searchParams.get('acao') !== 'procedimento_controlar') {
    throw new Error('URL_CONTROLE_SEI deve apontar para a ação de Controle de Processos somente leitura');
  }
  const urlAtribuidos =
    interpretado.URL_ATRIBUIDOS_SEI === undefined
      ? undefined
      : validarUrlColetor(interpretado.URL_ATRIBUIDOS_SEI, controleSei, 'URL_ATRIBUIDOS_SEI');
  const urlsMarcadores = interpretarUrlsMarcadores(interpretado.URLS_MARCADORES_SEI_JSON, controleSei);

  const proxy = interpretado.PROXY_ATIVADO
    ? {
        server: interpretado.SERVIDOR_PROXY as string,
        ...(interpretado.USUARIO_PROXY ? { username: interpretado.USUARIO_PROXY } : {}),
        ...(interpretado.SENHA_PROXY ? { password: interpretado.SENHA_PROXY } : {}),
        ...(interpretado.IGNORAR_PROXY ? { bypass: interpretado.IGNORAR_PROXY } : {}),
      }
    : undefined;

  return {
    urlBaseSei: baseSei.href.replace(/\/$/u, ''),
    urlControleSei: controleSei.href,
    unidade: interpretado.UNIDADE_SEI,
    supabase: {
      url: interpretado.URL_SUPABASE,
      chavePublica: interpretado.CHAVE_PUBLICA_SUPABASE,
      email: interpretado.EMAIL_USUARIO_SUPABASE,
      senha: interpretado.SENHA_USUARIO_SUPABASE,
    },
    instalacao: {
      id: interpretado.ID_INSTALACAO_AGENTE_SUPABASE,
      token: interpretado.TOKEN_INSTALACAO_AGENTE_SUPABASE,
    },
    caminhoEstadoSessao: resolve(interpretado.CAMINHO_ESTADO_SESSAO_SEI ?? 'playwright/.auth/sei.json'),
    semInterface: interpretado.AGENTE_SEM_INTERFACE,
    intervaloMinutos: interpretado.INTERVALO_SINCRONIZACAO_MINUTOS,
    maximoPaginas: interpretado.MAXIMO_PAGINAS_SEI,
    ...(proxy ? { proxy } : {}),
    ...(urlAtribuidos ? { urlAtribuidos: urlAtribuidos.href } : {}),
    ...(urlsMarcadores ? { urlsMarcadores } : {}),
  };
};
