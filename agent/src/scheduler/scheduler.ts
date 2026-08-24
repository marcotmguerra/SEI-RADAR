export interface OpcoesAgendador {
  readonly executar: () => Promise<unknown>;
  readonly intervaloMs: number;
  readonly aoErro: (erro: unknown) => void;
}

export interface Agendador {
  parar(): Promise<void>;
}

export const iniciarAgendador = (opcoes: OpcoesAgendador): Agendador => {
  if (!Number.isSafeInteger(opcoes.intervaloMs) || opcoes.intervaloMs < 1) {
    throw new Error('O intervalo do agendador deve ser um inteiro positivo');
  }
  let parado = false;
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  let execucaoAtiva: Promise<void> | undefined;

  const executarCiclo = async (): Promise<void> => {
    if (parado) return;
    try {
      await opcoes.executar();
    } catch (erro) {
      opcoes.aoErro(erro);
    }
    if (!parado) temporizador = setTimeout(() => iniciarCiclo(), opcoes.intervaloMs);
  };

  const iniciarCiclo = (): void => {
    execucaoAtiva = executarCiclo();
  };

  iniciarCiclo();
  return Object.freeze({
    parar: async () => {
      parado = true;
      if (temporizador !== undefined) clearTimeout(temporizador);
      await execucaoAtiva;
    },
  });
};
