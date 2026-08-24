// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { processosDemonstracao } from '../data/demo';
import { Prazos } from './Deadlines';
import { Historico } from './History';

describe('visualizacoes tabulares', () => {
  it('organiza os prazos em tabela', () => {
    render(<Prazos processos={processosDemonstracao} />);

    expect(screen.getByRole('table', { name: 'Prazos dos processos' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Vencimento' })).toBeInTheDocument();
  });

  it('organiza o historico em tabela', () => {
    render(<Historico eventos={[{
      id: 'evento-1',
      processoId: 'p1',
      numeroProcesso: '1400.01.000001/2026-01',
      tipoEvento: 'ENTROU_NA_UNIDADE',
      detectadoEm: '2026-08-24T10:00:00Z',
    }]} />);

    expect(screen.getByRole('table', { name: 'Histórico de eventos' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Evento' })).toBeInTheDocument();
  });
});
