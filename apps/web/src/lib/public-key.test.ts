import { describe, expect, it } from 'vitest';
import { validarChavePublicaSupabase, ehChavePrivadaSupabase } from './public-key';

const criarJwt = (carga: Record<string, unknown>) => {
  const codificar = (valor: object) => btoa(JSON.stringify(valor)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  return `${codificar({ alg: 'HS256', typ: 'JWT' })}.${codificar(carga)}.assinatura`;
};

describe('validacao da chave publica do Supabase', () => {
  it('aceita chaves anon e publishable', () => {
    expect(ehChavePrivadaSupabase('sb_publishable_example')).toBe(false);
    expect(ehChavePrivadaSupabase(criarJwt({ role: 'anon' }))).toBe(false);
  });

  it('rejeita chaves secret e JWT service_role', () => {
    expect(ehChavePrivadaSupabase('sb_secret_example')).toBe(true);
    expect(ehChavePrivadaSupabase(criarJwt({ role: 'service_role' }))).toBe(true);
    expect(() => validarChavePublicaSupabase(criarJwt({ role: 'service_role' }))).toThrow(/privilegiada/i);
  });

  it('trata texto invalido como chave nao privilegiada', () => {
    expect(ehChavePrivadaSupabase('nao-e-jwt')).toBe(false);
  });
});
