import { z } from 'zod';

const PADRAO_NUMERO_PROCESSO = /^\d{4}\.\d{2}\.\d{6,7}\/\d{4}-\d{2}$/;
const PADRAO_CARACTERE_CONTROLE = /[\u0000-\u001f\u007f-\u009f]/u;

const valoresUnicos = <T>(valores: readonly T[]): boolean => new Set(valores).size === valores.length;

/** Número de processo SEI normalizado conforme exibido pelo SEI!MG. */
export const esquemaNumeroProcesso = z
  .string()
  .trim()
  .regex(PADRAO_NUMERO_PROCESSO, 'Número de processo SEI inválido');

/** Nomes de marcadores são visíveis ao usuário e não aceitam caracteres de controle. */
export const esquemaNomeMarcador = z
  .string()
  .trim()
  .min(1, 'O marcador não pode estar vazio')
  .max(200, 'O marcador deve ter no máximo 200 caracteres')
  .refine((valor) => !PADRAO_CARACTERE_CONTROLE.test(valor), {
    message: 'O marcador contém caracteres de controle inválidos',
  });

const esquemaMarcadores = z
  .array(esquemaNomeMarcador)
  .max(1_000, 'Quantidade de marcadores acima do limite permitido')
  .superRefine((marcadores, contexto) => {
    if (!valoresUnicos(marcadores)) {
      contexto.addIssue({
        code: 'custom',
        message: 'Um processo não pode conter marcadores duplicados',
      });
    }
  });

export const esquemaProcessoSincronizacao = z
  .object({
    numero: esquemaNumeroProcesso,
    atribuidoAMim: z.boolean(),
    marcadores: esquemaMarcadores,
  })
  .strict();

export const esquemaRetratoSincronizacao = z
  .object({
    completa: z.boolean(),
    esperado: z.number().int().nonnegative().max(1_000_000).optional(),
    atribuicoesCompletas: z.boolean().default(false),
    marcadoresCompletos: z.boolean().default(false),
    processos: z.array(esquemaProcessoSincronizacao).max(1_000_000),
  })
  .strict()
  .superRefine((retrato, contexto) => {
    const numeros = retrato.processos.map(({ numero }) => numero);

    if (!valoresUnicos(numeros)) {
      contexto.addIssue({
        code: 'custom',
        path: ['processos'],
        message: 'O retrato não pode conter processos duplicados',
      });
    }

    if (retrato.esperado !== undefined && retrato.processos.length > retrato.esperado) {
      contexto.addIssue({
        code: 'custom',
        path: ['esperado'],
        message: 'A quantidade capturada não pode exceder a esperada',
      });
    }

    if (
      retrato.completa &&
      retrato.esperado === undefined
    ) {
      contexto.addIssue({
        code: 'custom',
        path: ['esperado'],
        message: 'Um retrato completo deve informar a quantidade esperada',
      });
    }

    if (
      retrato.completa &&
      retrato.esperado !== undefined &&
      retrato.processos.length !== retrato.esperado
    ) {
      contexto.addIssue({
        code: 'custom',
        path: ['completa'],
        message: 'Um retrato completo deve conter a quantidade esperada de processos',
      });
    }
  });

export const esquemaProcessoConhecido = z
  .object({
    numero: esquemaNumeroProcesso,
    naUnidade: z.boolean(),
    atribuidoAMim: z.boolean(),
    contagemAusencias: z.number().int().nonnegative(),
    marcadores: esquemaMarcadores,
  })
  .strict()
  .superRefine((processo, contexto) => {
    const contagemAusenciasValida = processo.naUnidade
      ? processo.contagemAusencias <= 1
      : processo.contagemAusencias >= 2;

    if (!contagemAusenciasValida) {
      contexto.addIssue({
        code: 'custom',
        path: ['contagemAusencias'],
        message: 'A contagem de ausências é incompatível com a presença na unidade',
      });
    }
  });

export const esquemaProcessosConhecidos = z
  .array(esquemaProcessoConhecido)
  .max(1_000_000)
  .superRefine((processos, contexto) => {
    if (!valoresUnicos(processos.map(({ numero }) => numero))) {
      contexto.addIssue({
        code: 'custom',
        message: 'A lista conhecida não pode conter processos duplicados',
      });
    }
  });

export type NumeroProcesso = z.output<typeof esquemaNumeroProcesso>;
export type ProcessoSincronizacao = z.output<typeof esquemaProcessoSincronizacao>;
export type RetratoSincronizacao = z.output<typeof esquemaRetratoSincronizacao>;
export type EntradaRetratoSincronizacao = z.input<typeof esquemaRetratoSincronizacao>;
export type ProcessoConhecido = z.output<typeof esquemaProcessoConhecido>;
