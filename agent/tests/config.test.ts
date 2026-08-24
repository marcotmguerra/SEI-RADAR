import { describe, expect, it } from 'vitest';
import { interpretarConfiguracaoAgente } from '../src/config/config';

const ambienteValido = {
  URL_BASE_SEI: 'https://sei.exemplo.gov.br',
  URL_CONTROLE_SEI: 'https://sei.exemplo.gov.br/controlador.php?acao=procedimento_controlar',
  URL_SUPABASE: 'https://example.supabase.co',
  CHAVE_PUBLICA_SUPABASE: 'public-anon-key-with-enough-length',
  EMAIL_USUARIO_SUPABASE: 'servidor@example.gov.br',
  SENHA_USUARIO_SUPABASE: 'uma-senha-local-segura',
  ID_INSTALACAO_AGENTE_SUPABASE: '10000000-0000-4000-8000-000000000001',
  TOKEN_INSTALACAO_AGENTE_SUPABASE: 'token-local-com-pelo-menos-32-caracteres',
};

describe('interpretarConfiguracaoAgente', () => {
  it('aplica defaults seguros sem proxy', () => {
    const configuracao = interpretarConfiguracaoAgente(ambienteValido);
    expect(configuracao.semInterface).toBe(true);
    expect(configuracao.intervaloMinutos).toBe(10);
    expect(configuracao.proxy).toBeUndefined();
  });

  it('aceita proxy autenticado e bypass', () => {
    const configuracao = interpretarConfiguracaoAgente({
      ...ambienteValido,
      PROXY_ATIVADO: 'true',
      SERVIDOR_PROXY: 'http://proxy.exemplo:8080',
      USUARIO_PROXY: 'usuario',
      SENHA_PROXY: 'segredo',
      IGNORAR_PROXY: 'localhost,127.0.0.1',
      PERMITIR_AUTENTICACAO_PROXY_INSEGURA: 'true',
    });
    expect(configuracao.proxy).toEqual({
      server: 'http://proxy.exemplo:8080',
      username: 'usuario',
      password: 'segredo',
      bypass: 'localhost,127.0.0.1',
    });
  });

  it('rejeita configuracao de proxy sem servidor', () => {
    expect(() => interpretarConfiguracaoAgente({ ...ambienteValido, PROXY_ATIVADO: 'true' })).toThrow(/SERVIDOR_PROXY/);
  });

  it('exige identificador e token forte da instalacao local', () => {
    const semId = Object.fromEntries(
      Object.entries(ambienteValido).filter(([chave]) => chave !== 'ID_INSTALACAO_AGENTE_SUPABASE'),
    );
    const semToken = Object.fromEntries(
      Object.entries(ambienteValido).filter(([chave]) => chave !== 'TOKEN_INSTALACAO_AGENTE_SUPABASE'),
    );
    expect(() => interpretarConfiguracaoAgente(semId)).toThrow(/ID_INSTALACAO_AGENTE_SUPABASE/);
    expect(() => interpretarConfiguracaoAgente(semToken)).toThrow(/TOKEN_INSTALACAO_AGENTE_SUPABASE/);
    expect(() =>
      interpretarConfiguracaoAgente({ ...ambienteValido, ID_INSTALACAO_AGENTE_SUPABASE: 'nao-e-uuid' }),
    ).toThrow(/ID_INSTALACAO_AGENTE_SUPABASE/);
    expect(() =>
      interpretarConfiguracaoAgente({ ...ambienteValido, TOKEN_INSTALACAO_AGENTE_SUPABASE: 'curto' }),
    ).toThrow(/TOKEN_INSTALACAO_AGENTE_SUPABASE/);
  });

  it('rejeita service role e URL de controle fora da origem do SEI', () => {
    expect(() =>
      interpretarConfiguracaoAgente({ ...ambienteValido, CHAVE_SERVICO_SUPABASE: 'nao-pode-entrar-no-agente' }),
    ).toThrow(/CHAVE_SERVICO_SUPABASE/);
    expect(() =>
      interpretarConfiguracaoAgente({ ...ambienteValido, URL_CONTROLE_SEI: 'https://atacante.example/controlador.php' }),
    ).toThrow(/mesma origem/);
    expect(() => interpretarConfiguracaoAgente({
      ...ambienteValido,
      URL_CONTROLE_SEI: 'https://sei.exemplo.gov.br/controlador.php?acao=usuario_sair',
    })).toThrow(/Controle.*leitura/i);
  });

  it('rejeita uma chave secreta fornecida no campo de chave anonima', () => {
    expect(() => interpretarConfiguracaoAgente({ ...ambienteValido, CHAVE_PUBLICA_SUPABASE: 'sb_secret_nao_e_publica' })).toThrow(
      /pública|anonima/i,
    );
    const jwtPapelServico = [
      'cabecalho',
      Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url'),
      'assinatura',
    ].join('.');
    expect(() => interpretarConfiguracaoAgente({ ...ambienteValido, CHAVE_PUBLICA_SUPABASE: jwtPapelServico })).toThrow(
      /pública|anonima/i,
    );
  });

  it('rejeita intervalo inseguro e credenciais de proxy incompletas', () => {
    expect(() => interpretarConfiguracaoAgente({ ...ambienteValido, INTERVALO_SINCRONIZACAO_MINUTOS: '0' })).toThrow();
    expect(() =>
      interpretarConfiguracaoAgente({
        ...ambienteValido,
        PROXY_ATIVADO: 'true',
        SERVIDOR_PROXY: 'http://proxy.exemplo:8080',
        USUARIO_PROXY: 'usuario',
      }),
    ).toThrow(/SENHA_PROXY/);
  });

  it('exige opt-in para autenticacao em proxy remoto sem HTTPS', () => {
    expect(() =>
      interpretarConfiguracaoAgente({
        ...ambienteValido,
        PROXY_ATIVADO: 'true',
        SERVIDOR_PROXY: 'http://proxy.exemplo:8080',
        USUARIO_PROXY: 'usuario',
        SENHA_PROXY: 'segredo',
      }),
    ).toThrow(/PERMITIR_AUTENTICACAO_PROXY_INSEGURA/);
    expect(
      interpretarConfiguracaoAgente({
        ...ambienteValido,
        PROXY_ATIVADO: 'true',
        SERVIDOR_PROXY: 'https://proxy.exemplo:8443',
        USUARIO_PROXY: 'usuario',
        SENHA_PROXY: 'segredo',
      }).proxy,
    ).toMatchObject({ server: 'https://proxy.exemplo:8443', username: 'usuario' });
  });

  it('exige TLS para destinos remotos e permite HTTP somente em loopback', () => {
    expect(() => interpretarConfiguracaoAgente({ ...ambienteValido, URL_SUPABASE: 'http://example.supabase.co' })).toThrow(
      /HTTPS/,
    );
    expect(() =>
      interpretarConfiguracaoAgente({
        ...ambienteValido,
        URL_BASE_SEI: 'http://sei.example',
        URL_CONTROLE_SEI: 'http://sei.example/controlador.php',
      }),
    ).toThrow(/HTTPS/);
    expect(
      interpretarConfiguracaoAgente({ ...ambienteValido, URL_SUPABASE: 'http://127.0.0.1:54321' }).supabase.url,
    ).toBe('http://127.0.0.1:54321');
  });

  it('aceita coletores opcionais somente na mesma origem do SEI', () => {
    const configuracao = interpretarConfiguracaoAgente({
      ...ambienteValido,
      URL_ATRIBUIDOS_SEI:
        'https://sei.exemplo.gov.br/controlador.php?acao=procedimento_controlar&atribuidos=1',
      URLS_MARCADORES_SEI_JSON: JSON.stringify({
        Urgente:
          'https://sei.exemplo.gov.br/controlador.php?acao=procedimento_controlar&marcador=urgente',
        'A revisar':
          'https://sei.exemplo.gov.br/controlador.php?acao=procedimento_controlar&marcador=revisar',
      }),
    });
    expect(configuracao.urlAtribuidos).toContain('atribuidos=1');
    expect(configuracao.urlsMarcadores).toEqual({
      Urgente:
        'https://sei.exemplo.gov.br/controlador.php?acao=procedimento_controlar&marcador=urgente',
      'A revisar':
        'https://sei.exemplo.gov.br/controlador.php?acao=procedimento_controlar&marcador=revisar',
    });
  });

  it('rejeita JSON de marcadores invalido e URLs externas', () => {
    expect(() => interpretarConfiguracaoAgente({ ...ambienteValido, URLS_MARCADORES_SEI_JSON: '[]' })).toThrow(
      /URLS_MARCADORES_SEI_JSON/,
    );
    expect(() =>
      interpretarConfiguracaoAgente({ ...ambienteValido, URL_ATRIBUIDOS_SEI: 'https://externo.example/atribuidos' }),
    ).toThrow(/mesma origem/);
    expect(() =>
      interpretarConfiguracaoAgente({
        ...ambienteValido,
        URLS_MARCADORES_SEI_JSON: JSON.stringify({ Urgente: 'https://externo.example/marcador' }),
      }),
    ).toThrow(/mesma origem/);
    expect(() =>
      interpretarConfiguracaoAgente({
        ...ambienteValido,
        URL_ATRIBUIDOS_SEI: 'https://sei.exemplo.gov.br/controlador.php?acao=usuario_sair',
      }),
    ).toThrow(/mesma rota.*ação/i);
  });

  it('rejeita nomes de marcadores duplicados depois da normalizacao', () => {
    const primeiraUrl = `${ambienteValido.URL_CONTROLE_SEI}&marcador=1`;
    const segundaUrl = `${ambienteValido.URL_CONTROLE_SEI}&marcador=2`;
    expect(() => interpretarConfiguracaoAgente({
      ...ambienteValido,
      URLS_MARCADORES_SEI_JSON: JSON.stringify({ ' Urgente ': primeiraUrl, Urgente: segundaUrl }),
    })).toThrow(/duplicados/);
  });

  it('rejeita parametro acao duplicado no controle e nos coletores', () => {
    const duplicada =
      'https://sei.exemplo.gov.br/controlador.php?acao=procedimento_controlar&acao=procedimento_controlar';
    expect(() => interpretarConfiguracaoAgente({ ...ambienteValido, URL_CONTROLE_SEI: duplicada })).toThrow(
      /exatamente uma.*acao/i,
    );
    expect(() => interpretarConfiguracaoAgente({ ...ambienteValido, URL_ATRIBUIDOS_SEI: duplicada })).toThrow(
      /exatamente uma.*acao/i,
    );
    expect(() =>
      interpretarConfiguracaoAgente({
        ...ambienteValido,
        URLS_MARCADORES_SEI_JSON: JSON.stringify({ Urgente: duplicada }),
      }),
    ).toThrow(/exatamente uma.*acao/i);
  });
});
