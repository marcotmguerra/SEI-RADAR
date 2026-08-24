// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Painel } from './Dashboard';
import type { RegistroProcesso, ExecucaoSincronizacao } from '../types';

const processos: RegistroProcesso[] = [
  {
    id: '1',
    numero: '1400.01.000001/2026-01',
    assunto: 'Manutencao de viatura',
    unidade: 'Unidade Alfa',
    naUnidade: true,
    atribuidoAMim: true,
    statusCrm: 'NOVO',
    prioridade: 'URGENTE',
    dataPrazo: '2026-08-24',
    observacoes: null,
    marcadores: ['Urgente'],
    urlSei: 'https://sei.exemplo.gov.br/processo/1',
    vistoPrimeiroEm: '2026-08-23T10:00:00Z',
    vistoUltimoEm: '2026-08-24T10:00:00Z',
  },
];

const sincronizacao: ExecucaoSincronizacao = {
  id: 'sync-1',
  status: 'SUCESSO',
  iniciadaEm: '2026-08-24T10:00:00Z',
  finalizadaEm: '2026-08-24T10:00:08Z',
  processosEsperados: 180,
  processosCapturados: 180,
  mensagemErro: null,
};

describe('Painel', () => {
  it('resume processos e exibe a saude da ultima sincronizacao', () => {
    render(<Painel processos={processos} ultimaSincronizacao={sincronizacao} />);

    expect(screen.getByText('Visão geral')).toBeInTheDocument();
    expect(screen.getByText('180 de 180 processos coletados')).toBeInTheDocument();
    expect(screen.getAllByText('Atribuídos a mim')).toHaveLength(2);
    expect(screen.getByRole('table', { name: 'Resumo dos processos' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Processos atribuídos a mim' })).toBeInTheDocument();
    expect(screen.getByText('Manutencao de viatura')).toBeInTheDocument();
  });
});
