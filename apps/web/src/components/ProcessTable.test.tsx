// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TabelaProcessos } from './ProcessTable';
import { processosDemonstracao } from '../data/demo';

describe('TabelaProcessos', () => {
  it('organiza processos em colunas e envia somente campos internos ao salvar', () => {
    const aoAlterarCrm = vi.fn();
    render(<TabelaProcessos processos={[processosDemonstracao[0]!]} aoAlterarCrm={aoAlterarCrm} />);

    expect(screen.getByRole('table', { name: 'Processos' })).toBeInTheDocument();
    for (const coluna of ['Processo', 'Assunto', 'Prioridade', 'Marcadores', 'Prazo', 'Status', 'Ações']) {
      expect(screen.getByRole('columnheader', { name: coluna })).toBeInTheDocument();
    }
    fireEvent.click(screen.getByText('Editar acompanhamento'));
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'EM_ANALISE' } });
    fireEvent.change(screen.getByLabelText('Prioridade'), { target: { value: 'ALTA' } });
    fireEvent.change(screen.getByLabelText('Prazo'), { target: { value: '2026-08-30' } });
    fireEvent.change(screen.getByLabelText('Observações'), { target: { value: 'Aguardar conferência.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar acompanhamento' }));

    expect(aoAlterarCrm).toHaveBeenCalledWith('p1', expect.objectContaining({
      statusCrm: 'EM_ANALISE', prioridade: 'ALTA', dataPrazo: '2026-08-30', observacoes: 'Aguardar conferência.',
    }));
    expect(aoAlterarCrm.mock.calls[0]?.[1]).not.toHaveProperty('numero');
    expect(aoAlterarCrm.mock.calls[0]?.[1]).not.toHaveProperty('naUnidade');
  });
});
