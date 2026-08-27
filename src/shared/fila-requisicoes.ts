/**
 * Fila de requisições com concorrência limitada, espaçamento e timeout.
 *
 * A extensão consulta um sistema de governo em nome do usuário: disparar dezenas de
 * requisições simultâneas seria abusivo e provavelmente barrado. Toda coleta em lote
 * passa por aqui.
 */

export interface OpcoesFila {
  /** Requisições simultâneas. Padrão: 2 */
  concorrencia?: number;
  /** Espaçamento mínimo entre o início de duas requisições, em ms. Padrão: 400 */
  intervaloMs?: number;
  /** Tempo máximo por item, em ms. Padrão: 15000 */
  timeoutMs?: number;
  /** Chamado a cada item concluído, com sucesso ou erro */
  aoProgredir?: (concluidos: number, total: number) => void;
  /** Permite cancelar o lote inteiro */
  sinal?: AbortSignal;
}

export interface ResultadoItem<T, R> {
  item: T;
  resultado?: R;
  erro?: string;
}

const esperar = (ms: number, sinal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (ms <= 0) {
      resolve();
      return;
    }
    if (sinal?.aborted) {
      reject(new Error('Cancelado'));
      return;
    }
    const aoAbortar = () => {
      clearTimeout(id);
      reject(new Error('Cancelado'));
    };
    const id = setTimeout(() => {
      sinal?.removeEventListener('abort', aoAbortar);
      resolve();
    }, ms);
    sinal?.addEventListener('abort', aoAbortar, { once: true });
  });

/**
 * Aplica um limite de tempo a uma promessa. O `fetch` do SEI pode ficar pendurado
 * indefinidamente quando a sessão cai no meio da resposta.
 */
export const comTimeout = <R>(promessa: Promise<R>, timeoutMs: number): Promise<R> =>
  new Promise<R>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error('Tempo esgotado ao consultar o SEI')), timeoutMs);
    promessa.then(
      (valor) => {
        clearTimeout(id);
        resolve(valor);
      },
      (erro) => {
        clearTimeout(id);
        reject(erro);
      }
    );
  });

const mensagemDeErro = (erro: unknown): string => {
  if (erro instanceof Error) return erro.message;
  if (typeof erro === 'string') return erro;
  return 'Falha desconhecida';
};

/**
 * Executa `tarefa` para cada item respeitando concorrência, espaçamento e timeout.
 *
 * A falha de um item não derruba o lote: ela vira `{ erro }` na posição correspondente,
 * preservando a ordem de entrada. O cancelamento interrompe o que ainda não começou.
 */
export const executarEmFila = async <T, R>(
  itens: T[],
  tarefa: (item: T, indice: number) => Promise<R>,
  opcoes: OpcoesFila = {}
): Promise<ResultadoItem<T, R>[]> => {
  const { concorrencia = 2, intervaloMs = 400, timeoutMs = 15000, aoProgredir, sinal } = opcoes;

  if (!Array.isArray(itens) || itens.length === 0) return [];

  const total = itens.length;
  const resultados: ResultadoItem<T, R>[] = new Array(total);
  let proximoIndice = 0;
  let concluidos = 0;
  let ultimoInicio = 0;

  const trabalhador = async (): Promise<void> => {
    for (;;) {
      if (sinal?.aborted) return;

      const indice = proximoIndice++;
      if (indice >= total) return;

      const item = itens[indice] as T;

      // Espaçamento medido a partir do último disparo, compartilhado entre trabalhadores
      const agora = Date.now();
      const esperaNecessaria = ultimoInicio + intervaloMs - agora;
      ultimoInicio = esperaNecessaria > 0 ? agora + esperaNecessaria : agora;

      if (esperaNecessaria > 0) {
        try {
          await esperar(esperaNecessaria, sinal);
        } catch {
          return; // cancelado durante a espera
        }
      }

      if (sinal?.aborted) return;

      try {
        const resultado = await comTimeout(tarefa(item, indice), timeoutMs);
        resultados[indice] = { item, resultado };
      } catch (erro) {
        resultados[indice] = { item, erro: mensagemDeErro(erro) };
      }

      concluidos++;
      aoProgredir?.(concluidos, total);
    }
  };

  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(concorrencia, total)) }, () => trabalhador())
  );

  // Itens não processados por cancelamento ficam marcados como tal
  for (let i = 0; i < total; i++) {
    if (!resultados[i]) {
      resultados[i] = { item: itens[i] as T, erro: 'Cancelado' };
    }
  }

  return resultados;
};
