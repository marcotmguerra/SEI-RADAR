// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TelaLogin } from './Login';

describe('TelaLogin', () => {
  it('coleta as credenciais sem confundi-las com a senha do SEI', () => {
    render(<TelaLogin />);
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'usuario@example.gov.br' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'senha-local' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Entrar' }).closest('form')!);
    expect(screen.getByText(/A senha do SEI nunca é enviada/)).toBeInTheDocument();
  });
});
