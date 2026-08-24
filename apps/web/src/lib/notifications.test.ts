// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { montarNotificacao, obterNivelConteudoNotificacao, exibirNotificacaoFila, exibirNotificacaoFilaUmaVez, exibirNotificacaoProcesso } from './notifications';

const processo = { numero: '1400.01.000001/2026-01', assunto: 'Assunto sigiloso' };

describe('privacidade das notificacoes', () => {
  it('oculta metadados no modo apenas aviso', () => {
    expect(montarNotificacao('ENTROU_NA_UNIDADE', processo, 'AVISO').corpo).toBe('Há uma nova atualização no CRM SEI.');
  });

  it('inclui somente os campos autorizados', () => {
    expect(montarNotificacao('ENTROU_NA_UNIDADE', processo, 'NUMERO').corpo).toContain(processo.numero);
    expect(montarNotificacao('ENTROU_NA_UNIDADE', processo, 'NUMERO').corpo).not.toContain(processo.assunto);
    expect(montarNotificacao('ENTROU_NA_UNIDADE', processo, 'ASSUNTO').corpo).toContain(processo.assunto);
  });

  it('le a preferencia e exibe a notificacao quando autorizada', async () => {
    localStorage.setItem('crm-sei:conteudo-notificacao', 'ASSUNTO');
    const chamadas: unknown[] = [];
    class NotificacaoFalsa {
      static permission = 'granted';
      constructor(...argumentos: unknown[]) { chamadas.push(argumentos); }
    }
    Object.defineProperty(globalThis, 'Notification', { configurable: true, value: NotificacaoFalsa });

    expect(obterNivelConteudoNotificacao()).toBe('ASSUNTO');
    await exibirNotificacaoProcesso('ATRIBUIDO_A_MIM', processo);
    expect(chamadas).toHaveLength(1);
    await exibirNotificacaoFila({ chave_deduplicacao: 'evento:1', conteudo: { titulo: 'Nova entrada', numero: processo.numero } });
    expect(chamadas).toHaveLength(2);
    await exibirNotificacaoFilaUmaVez({ chave_deduplicacao: 'evento:2', conteudo: { titulo: 'Nova entrada', numero: processo.numero } });
    await exibirNotificacaoFilaUmaVez({ chave_deduplicacao: 'evento:2', conteudo: { titulo: 'Nova entrada', numero: processo.numero } });
    expect(chamadas).toHaveLength(3);
  });
});
