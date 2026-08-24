import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Bell, CalendarClock, Columns3, FileClock, Files, History as Historico, LayoutDashboard, Menu,
  Settings as Configuracoes, Tags, UserRoundCheck, X,
} from 'lucide-react';

const navegacao = [
  { caminho: '/', rotulo: 'Visão geral', icone: LayoutDashboard, exato: true },
  { caminho: '/processos', rotulo: 'Processos', icone: Files },
  { caminho: '/atribuidos', rotulo: 'Atribuídos', icone: UserRoundCheck },
  { caminho: '/novos', rotulo: 'Novos', icone: Bell },
  { caminho: '/kanban', rotulo: 'Kanban', icone: Columns3 },
  { caminho: '/prazos', rotulo: 'Prazos', icone: CalendarClock },
  { caminho: '/marcadores', rotulo: 'Marcadores', icone: Tags },
  { caminho: '/historico', rotulo: 'Histórico', icone: Historico },
  { caminho: '/sincronizacoes', rotulo: 'Sincronizações', icone: FileClock },
  { caminho: '/configuracoes', rotulo: 'Configurações', icone: Configuracoes },
] as const;

interface PropriedadesEstruturaAplicativo {
  readonly children: ReactNode;
  readonly modoDemonstracao: boolean;
}

export function EstruturaAplicativo({ children, modoDemonstracao }: PropriedadesEstruturaAplicativo) {
  const [aberto, definirAberto] = useState(false);
  const principais = navegacao.slice(0, 5);

  return (
    <div className="app-shell">
      <aside className={`sidebar ${aberto ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <span className="brand-mark" aria-hidden>CS</span>
          <span><strong>CRM SEI</strong><small>Acompanhamento</small></span>
          <button className="icon-button sidebar-close" type="button" aria-label="Fechar menu" onClick={() => definirAberto(false)}><X /></button>
        </div>
        <nav className="nav-list" aria-label="Navegação principal">
          {navegacao.map((itemNavegacao) => {
            const Icone = itemNavegacao.icone;
            return <NavLink key={itemNavegacao.caminho} to={itemNavegacao.caminho} end={'exato' in itemNavegacao ? itemNavegacao.exato : false} onClick={() => definirAberto(false)} className={({ isActive: ativo }) => `nav-item ${ativo ? 'active' : ''}`}>
              <Icone size={20} aria-hidden /><span>{itemNavegacao.rotulo}</span>
            </NavLink>;
          })}
        </nav>
        <div className="sidebar-footer"><span className="agent-dot" />Agente local ativo</div>
      </aside>

      {aberto ? <button className="sidebar-overlay" type="button" aria-label="Fechar menu" onClick={() => definirAberto(false)} /> : null}

      <div className="main-area">
        <header className="mobile-header">
          <button className="icon-button" type="button" aria-label="Abrir menu" onClick={() => definirAberto(true)}><Menu /></button>
          <span className="mobile-brand">CRM SEI</span>
          {modoDemonstracao ? <span className="demo-pill">Demo</span> : <span />}
        </header>
        <main className="page-container">
          {modoDemonstracao ? <div className="demo-banner">Modo demonstração — configure o Supabase para usar dados reais.</div> : null}
          {children}
        </main>
      </div>

      <nav className="bottom-nav" aria-label="Navegação rápida">
        {principais.map((itemNavegacao) => {
          const Icone = itemNavegacao.icone;
          return <NavLink key={itemNavegacao.caminho} to={itemNavegacao.caminho} end={'exato' in itemNavegacao ? itemNavegacao.exato : false} className={({ isActive: ativo }) => `bottom-item ${ativo ? 'active' : ''}`}>
            <Icone size={20} aria-hidden /><span>{itemNavegacao.rotulo}</span>
          </NavLink>;
        })}
      </nav>
    </div>
  );
}
