import { describe, expect, it } from 'vitest';
import { obterUrlSeiSegura } from './urls';

describe('obterUrlSeiSegura', () => {
  it('aceita somente HTTPS na origem configurada', () => {
    expect(obterUrlSeiSegura('https://sei.example/processo/1', 'https://sei.example')).toBe('https://sei.example/processo/1');
    expect(obterUrlSeiSegura('https://phishing.example/processo/1', 'https://sei.example')).toBe('#');
    expect(obterUrlSeiSegura('javascript:alert(1)', 'https://sei.example')).toBe('#');
  });
});
