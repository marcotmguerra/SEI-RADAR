// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Aplicativo } from './App';

describe('CRM web em modo demonstracao', () => {
  it('permite navegar pelos fluxos operacionais do MVP', async () => {
    window.history.pushState({}, '', '/');
    render(<Aplicativo />);
    expect(screen.getByRole('heading', { name: 'Visão geral' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menu' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Fechar menu' })[0]!);

    const destinos = [
      ['Processos', 'Processos da unidade'],
      ['Atribuídos', 'Atribuídos a mim'],
      ['Novos', 'Novos processos'],
      ['Kanban', 'Kanban'],
      ['Prazos', 'Prazos'],
      ['Marcadores', 'Marcadores'],
      ['Histórico', 'Histórico'],
      ['Sincronizações', 'Sincronizações'],
      ['Configurações', 'Configurações'],
    ] as const;

    for (const [rotuloLink, titulo] of destinos) {
      fireEvent.click(screen.getAllByRole('link', { name: rotuloLink })[0]!);
      expect(screen.getByRole('heading', { name: titulo, level: 1 })).toBeInTheDocument();
      if (rotuloLink === 'Processos') {
        fireEvent.change(screen.getByPlaceholderText('Número, assunto ou marcador'), { target: { value: 'viatura' } });
        fireEvent.change(screen.getByLabelText('Filtrar por prioridade'), { target: { value: 'URGENTE' } });
      }
    }

    fireEvent.click(screen.getByLabelText('Apenas aviso'));
    for (const rotulo of ['Novos processos', 'Novas atribuições', 'Prazos próximos', 'Falhas de sincronização']) {
      fireEvent.click(screen.getByLabelText(rotulo));
    }
    fireEvent.click(screen.getByRole('button', { name: 'Salvar preferência' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Preferência salva' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Sair da conta' }));
  });
});
