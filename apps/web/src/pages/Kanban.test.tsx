// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Kanban } from './Kanban';
import type { RegistroProcesso } from '../types';

const processo: RegistroProcesso = {
  id: '1',
  numero: '1400.01.000001/2026-01',
  assunto: null,
  unidade: 'Unidade Alfa',
  naUnidade: true,
  atribuidoAMim: false,
  statusCrm: 'NOVO',
  prioridade: 'NORMAL',
  dataPrazo: null,
  observacoes: null,
  marcadores: [],
  urlSei: 'https://sei.exemplo.gov.br/processo/1',
  vistoPrimeiroEm: '2026-08-23T10:00:00Z',
  vistoUltimoEm: '2026-08-24T10:00:00Z',
};

describe('Kanban', () => {
  it('altera somente o status interno pelo callback', () => {
    const aoAlterarStatus = vi.fn();
    render(<Kanban processos={[processo]} aoAlterarStatus={aoAlterarStatus} />);

    expect(screen.getByRole('table', { name: 'Lista Novo' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Processo' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Status do processo/), { target: { value: 'EM_ANALISE' } });

    expect(aoAlterarStatus).toHaveBeenCalledWith('1', 'EM_ANALISE');
  });
});
