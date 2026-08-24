import { resolve } from 'node:path';
import { config as carregarAmbiente } from 'dotenv';
import { criarClienteSincronizacaoUsuario } from './api/supabase-client';
import { realizarLoginManual } from './browser/login';
import { abrirSessaoColetaNavegador } from './browser/session';
import { interpretarConfiguracaoAgente, type ConfiguracaoAgente } from './config/config';
import { validarArquivoAmbienteSeguro } from './config/env-file';
import { iniciarAgendador } from './scheduler/scheduler';
import { executarSincronizacao } from './sync/sync-once';

const registrarMensagemSegura = (mensagem: string): void => {
  process.stdout.write(`${mensagem}\n`);
};

const criarSincronizacao = async (configuracao: ConfiguracaoAgente): Promise<() => Promise<void>> => {
  const api = await criarClienteSincronizacaoUsuario(configuracao.supabase);
  return async () => {
    const resultado = await executarSincronizacao({
      unidade: configuracao.unidade,
      urlControle: configuracao.urlControleSei,
      instalacaoId: configuracao.instalacao.id,
      tokenInstalacao: configuracao.instalacao.token,
      maximoPaginas: configuracao.maximoPaginas,
      abrirNavegador: async () => abrirSessaoColetaNavegador(configuracao),
      enviar: async (retrato) => api.enviar(retrato),
    });
    registrarMensagemSegura(`Sincronização finalizada: ${resultado.status} (${resultado.capturado}/${resultado.esperado ?? '?'})`);
  };
};

const principal = async (): Promise<void> => {
  const caminhoAmbiente = resolve(process.env.DOTENV_CONFIG_PATH ?? '.env');
  await validarArquivoAmbienteSeguro(caminhoAmbiente);
  carregarAmbiente({ path: caminhoAmbiente, quiet: true });
  const configuracao = interpretarConfiguracaoAgente(process.env);
  const comando = process.argv[2] ?? 'run';
  if (comando === 'login' || comando === 'login-sei') {
    await realizarLoginManual(configuracao);
    registrarMensagemSegura('Sessão do SEI salva localmente.');
    return;
  }

  const sincronizar = await criarSincronizacao(configuracao);
  if (comando === 'sync' || comando === 'sync-once') {
    await sincronizar();
    return;
  }
  if (comando !== 'run' && comando !== 'start') throw new Error('Comando inválido');

  const agendador = iniciarAgendador({
    executar: sincronizar,
    intervaloMs: configuracao.intervaloMinutos * 60_000,
    aoErro: () => registrarMensagemSegura('A sincronização falhou; uma nova tentativa ocorrerá no próximo intervalo.'),
  });
  const parar = async (): Promise<void> => {
    await agendador.parar();
    process.exitCode = 0;
  };
  process.once('SIGINT', () => void parar());
  process.once('SIGTERM', () => void parar());
};

principal().catch(() => {
  process.stderr.write('O agente não pôde concluir a operação. Verifique a configuração e os logs locais.\n');
  process.exitCode = 1;
});
