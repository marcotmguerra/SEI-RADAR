import { describe, it, expect } from 'vitest';
import {
  processoPertenceAoRadar,
  filtrarProcessosPorRadar,
  descreverEscopoRadar,
  ehProcessoAtribuido,
  ehSemAtribuicao,
  ehAtribuidoAOutraPessoa,
  normalizarParaComparacao,
} from './radar';
import type { ConfiguracaoExtensao, ProcessoSei } from '../types';

const configBase: ConfiguracaoExtensao = {
  urlControle: 'https://sei.mg.gov.br',
  intervaloMinutos: 5,
  somAtivo: true,
  notificacoesAtivas: true,
  regraNotificacao: 'todos',
  usuarioSigla: '00652162614',
  marcadoresNotificacao: [],
  primeiraCargaRealizada: true,
  escopoRadar: 'unidade',
  marcadoresRadar: [],
  radarOnboardingConcluido: true,
};

const mockProcesso1: ProcessoSei = {
  numero: '1400.01.000100/2026-01',
  assunto: 'Processo 1',
  link: 'https://sei.mg.gov.br/1',
  detectadoEm: new Date().toISOString(),
  lido: false,
  atribuidoPara: '006.521.626-14',
  marcadores: [{ nome: 'Urgente' }, { nome: 'Licitações' }],
};

const mockProcesso2: ProcessoSei = {
  numero: '1400.01.000200/2026-02',
  assunto: 'Processo 2',
  link: 'https://sei.mg.gov.br/2',
  detectadoEm: new Date().toISOString(),
  lido: false,
  atribuidoPara: 'OUTRO.USUARIO',
  marcadores: [{ nome: 'Financeiro' }],
};

const mockProcessoSemAtribuicao: ProcessoSei = {
  numero: '1400.01.000300/2026-03',
  assunto: 'Processo Sem Atribuição nem Marcadores',
  link: 'https://sei.mg.gov.br/3',
  detectadoEm: new Date().toISOString(),
  lido: false,
};

describe('Radar Manager & Utilities', () => {
  describe('normalizarParaComparacao', () => {
    it('extrai apenas números para CPF com 11 dígitos', () => {
      expect(normalizarParaComparacao('006.521.626-14')).toBe('00652162614');
      expect(normalizarParaComparacao('00652162614')).toBe('00652162614');
    });

    it('mantém texto em minúsculas para siglas e nomes', () => {
      expect(normalizarParaComparacao('MARCO.GUERRA')).toBe('marco.guerra');
      expect(normalizarParaComparacao(' MG12345 ')).toBe('mg12345');
    });

    it('trata valores nulos e vazios', () => {
      expect(normalizarParaComparacao('')).toBe('');
      expect(normalizarParaComparacao(null)).toBe('');
      expect(normalizarParaComparacao(undefined)).toBe('');
    });
  });

  describe('ehProcessoAtribuido', () => {
    it('compara CPF com máscara vs sem máscara', () => {
      expect(ehProcessoAtribuido(mockProcesso1, '00652162614')).toBe(true);
      expect(ehProcessoAtribuido(mockProcesso1, '006.521.626-14')).toBe(true);
      expect(ehProcessoAtribuido(mockProcesso2, '00652162614')).toBe(false);
    });

    it('compara siglas de usuários sem distinção de maiúsculas/minúsculas', () => {
      const proc: ProcessoSei = {
        ...mockProcesso1,
        atribuidoPara: 'Marco.Guerra',
      };
      expect(ehProcessoAtribuido(proc, 'MARCO.GUERRA')).toBe(true);
      expect(ehProcessoAtribuido(proc, 'marco.guerra')).toBe(true);
      expect(ehProcessoAtribuido(proc, 'OUTRO.USER')).toBe(false);
    });

    it('retorna false quando processo não tem atribuição ou usuárioSigla é vazio', () => {
      expect(ehProcessoAtribuido(mockProcessoSemAtribuicao, '00652162614')).toBe(false);
      expect(ehProcessoAtribuido(mockProcesso1, '')).toBe(false);
      expect(ehProcessoAtribuido(mockProcesso1, undefined)).toBe(false);
    });
  });

  describe('processoPertenceAoRadar - Escopo Unidade', () => {
    const configUnidade: ConfiguracaoExtensao = {
      ...configBase,
      escopoRadar: 'unidade',
    };

    it('inclui todos os processos da unidade independentemente de atribuição ou etiquetas', () => {
      expect(processoPertenceAoRadar(mockProcesso1, configUnidade)).toBe(true);
      expect(processoPertenceAoRadar(mockProcesso2, configUnidade)).toBe(true);
      expect(processoPertenceAoRadar(mockProcessoSemAtribuicao, configUnidade)).toBe(true);
    });
  });

  describe('processoPertenceAoRadar - Escopo Atribuídos', () => {
    const configAtribuidos: ConfiguracaoExtensao = {
      ...configBase,
      escopoRadar: 'atribuidos',
      usuarioSigla: '00652162614',
        };

    it('inclui apenas processos atribuídos ao usuário configurado', () => {
      expect(processoPertenceAoRadar(mockProcesso1, configAtribuidos)).toBe(true);
      expect(processoPertenceAoRadar(mockProcesso2, configAtribuidos)).toBe(false);
      expect(processoPertenceAoRadar(mockProcessoSemAtribuicao, configAtribuidos)).toBe(false);
    });
  });

  describe('processoPertenceAoRadar - Escopo Marcadores/Etiquetas', () => {
    const configMarcadores: ConfiguracaoExtensao = {
      ...configBase,
      escopoRadar: 'marcadores',
      marcadoresRadar: ['Urgente', 'Contratos'],
    };

    it('inclui processos com marcadores correspondentes (case-insensitive)', () => {
      expect(processoPertenceAoRadar(mockProcesso1, configMarcadores)).toBe(true); // contém 'Urgente'
    });

    it('ignora maiúsculas e minúsculas ao comparar etiquetas', () => {
      const configMinusc: ConfiguracaoExtensao = {
        ...configBase,
        escopoRadar: 'marcadores',
        marcadoresRadar: ['urgente'],
      };
      expect(processoPertenceAoRadar(mockProcesso1, configMinusc)).toBe(true);
    });

    it('descarta processos com outras etiquetas ou sem etiquetas', () => {
      expect(processoPertenceAoRadar(mockProcesso2, configMarcadores)).toBe(false); // contém apenas 'Financeiro'
      expect(processoPertenceAoRadar(mockProcessoSemAtribuicao, configMarcadores)).toBe(false);
    });

    it('retorna false se a lista de marcadores do radar for vazia', () => {
      const configSemMarcadores: ConfiguracaoExtensao = {
        ...configBase,
        escopoRadar: 'marcadores',
        marcadoresRadar: [],
      };
      expect(processoPertenceAoRadar(mockProcesso1, configSemMarcadores)).toBe(false);
    });
  });

  describe('filtrarProcessosPorRadar', () => {
    it('filtra listas removendo itens fora do escopo', () => {
      const lista = [mockProcesso1, mockProcesso2, mockProcessoSemAtribuicao];

      const filtradosAtribuidos = filtrarProcessosPorRadar(lista, {
        ...configBase,
        escopoRadar: 'atribuidos',
        usuarioSigla: '00652162614',
            });
      expect(filtradosAtribuidos).toEqual([mockProcesso1]);

      const filtradosMarcadores = filtrarProcessosPorRadar(lista, {
        ...configBase,
        escopoRadar: 'marcadores',
        marcadoresRadar: ['Financeiro'],
      });
      expect(filtradosMarcadores).toEqual([mockProcesso2]);

      const filtradosUnidade = filtrarProcessosPorRadar(lista, {
        ...configBase,
        escopoRadar: 'unidade',
      });
      expect(filtradosUnidade).toHaveLength(3);
    });
  });

  describe('descreverEscopoRadar', () => {
    it('descreve escopo atribuídos', () => {
      expect(descreverEscopoRadar({ ...configBase, escopoRadar: 'atribuidos' })).toBe(
        'Atribuídos a mim'
      );
    });

    it('descreve escopo unidade', () => {
      expect(descreverEscopoRadar({ ...configBase, escopoRadar: 'unidade' })).toBe(
        'Todos os processos da unidade'
      );
    });

    it('descreve escopo marcadores com poucas etiquetas', () => {
      expect(
        descreverEscopoRadar({
          ...configBase,
          escopoRadar: 'marcadores',
          marcadoresRadar: ['Urgente', 'Licitações'],
        })
      ).toBe('Etiquetas: Urgente, Licitações');
    });

    it('descreve escopo marcadores com mais de 2 etiquetas', () => {
      expect(
        descreverEscopoRadar({
          ...configBase,
          escopoRadar: 'marcadores',
          marcadoresRadar: ['Urgente', 'Licitações', 'Contratos', 'Obras'],
        })
      ).toBe('Etiquetas: Urgente, Licitações (+2)');
    });

    it('descreve escopo marcadores vazio', () => {
      expect(
        descreverEscopoRadar({
          ...configBase,
          escopoRadar: 'marcadores',
          marcadoresRadar: [],
        })
      ).toBe('Etiquetas (nenhuma selecionada)');
    });
  });

  describe('ehSemAtribuicao', () => {
    const comAtribuicao = (valor: string | null | undefined): ProcessoSei => ({
      numero: '1400.01.000900/2026-09',
      assunto: 'Teste',
      link: 'https://sei.mg.gov.br/9',
      detectadoEm: new Date().toISOString(),
      lido: false,
      atribuidoPara: valor,
    });

    it('reconhece apenas null como sem atribuição confirmada', () => {
      expect(ehSemAtribuicao(comAtribuicao(null))).toBe(true);
    });

    it('não trata leitura inconclusiva (undefined) como sem atribuição', () => {
      expect(ehSemAtribuicao(comAtribuicao(undefined))).toBe(false);
    });

    it('não trata processo atribuído como sem atribuição', () => {
      expect(ehSemAtribuicao(comAtribuicao('GUERRA'))).toBe(false);
    });
  });

  describe('ehAtribuidoAOutraPessoa', () => {
    const processoDe = (valor: string | null | undefined): ProcessoSei => ({
      numero: '1400.01.000901/2026-10',
      assunto: 'Teste',
      link: 'https://sei.mg.gov.br/10',
      detectadoEm: new Date().toISOString(),
      lido: false,
      atribuidoPara: valor,
    });

    it('identifica processo atribuído a um colega', () => {
      expect(ehAtribuidoAOutraPessoa(processoDe('OUTRO.MILITAR'), '00652162614')).toBe(true);
    });

    it('não conta o processo do próprio usuário, mesmo com CPF formatado', () => {
      expect(ehAtribuidoAOutraPessoa(processoDe('006.521.626-14'), '00652162614')).toBe(false);
    });

    it('não conta processos sem atribuição nem com leitura inconclusiva', () => {
      expect(ehAtribuidoAOutraPessoa(processoDe(null), '00652162614')).toBe(false);
      expect(ehAtribuidoAOutraPessoa(processoDe(undefined), '00652162614')).toBe(false);
      expect(ehAtribuidoAOutraPessoa(processoDe('   '), '00652162614')).toBe(false);
    });
  });
});

