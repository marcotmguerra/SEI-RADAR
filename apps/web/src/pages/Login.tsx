import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

export function TelaLogin() {
  const [email, definirEmail] = useState(''); const [senha, definirSenha] = useState(''); const [erro, definirErro] = useState<string | null>(null); const [carregando, definirCarregando] = useState(false);
  async function enviar(evento: FormEvent) { evento.preventDefault(); if (!supabase) return; definirCarregando(true); const resultado = await supabase.auth.signInWithPassword({ email, password: senha }); definirErro(resultado.error ? 'E-mail ou senha inválidos.' : null); definirCarregando(false); }
  return <main className="login-page"><section className="login-card"><div className="brand login-brand"><span className="brand-mark">CS</span><span><strong>CRM SEI</strong><small>Acompanhamento de processos</small></span></div><div><span className="eyebrow">Acesso seguro</span><h1>Entre na sua conta</h1><p>Use suas credenciais do CRM. A senha do SEI nunca é enviada para cá.</p></div><form onSubmit={(evento) => void enviar(evento)}><label>E-mail<input type="email" required value={email} onChange={(evento) => definirEmail(evento.target.value)} autoComplete="email" /></label><label>Senha<input type="password" required value={senha} onChange={(evento) => definirSenha(evento.target.value)} autoComplete="current-password" /></label>{erro ? <p className="form-error" role="alert">{erro}</p> : null}<button className="primary-button" disabled={carregando}>{carregando ? 'Entrando…' : 'Entrar'}</button></form></section></main>;
}
