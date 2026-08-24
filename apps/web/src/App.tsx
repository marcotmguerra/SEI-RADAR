import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { EstruturaAplicativo } from './components/AppShell';
import { useDadosCrm } from './data/useCrmData';
import { supabase } from './lib/supabase';
import { Painel } from './pages/Dashboard';
import { Prazos } from './pages/Deadlines';
import { Historico } from './pages/History';
import { Kanban } from './pages/Kanban';
import { TelaLogin } from './pages/Login';
import { PaginaProcessos } from './pages/ProcessesPage';
import { Configuracoes } from './pages/Settings';
import { HistoricoSincronizacoes } from './pages/SyncHistory';

export function Aplicativo() {
  const [sessao, definirSessao] = useState<Session | null>(null);
  const [carregandoAutenticacao, definirCarregandoAutenticacao] = useState(Boolean(supabase));
  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data: dadosAutenticacao }) => { definirSessao(dadosAutenticacao.session); definirCarregandoAutenticacao(false); });
    const { data: dadosAssinatura } = supabase.auth.onAuthStateChange((_evento, proximaSessao) => definirSessao(proximaSessao));
    return () => dadosAssinatura.subscription.unsubscribe();
  }, []);
  if (carregandoAutenticacao) return <div className="carregando-screen">Carregando CRM SEI…</div>;
  if (supabase && !sessao) return <TelaLogin />;
  return <AplicativoCrm />;
}

function AplicativoCrm() {
  const dados = useDadosCrm();
  const ativos = dados.processos.filter((processo) => processo.naUnidade);
  const novosDesdeOntem = ativos.filter((processo) => Date.now() - new Date(processo.vistoPrimeiroEm).getTime() < 48 * 86_400_000);
  const sair = async () => { if (supabase) await supabase.auth.signOut(); };
  return (
    <BrowserRouter>
      <EstruturaAplicativo modoDemonstracao={dados.modoDemonstracao}>
        {dados.erro ? <div className="error-banner" role="alert">{dados.erro}<button type="button" onClick={() => void dados.atualizarDados()}>Tentar novamente</button></div> : null}
        {dados.carregando ? <div className="carregando-line" /> : null}
        <Routes>
          <Route path="/" element={<Painel processos={dados.processos} ultimaSincronizacao={dados.execucoesSincronizacao[0]} />} />
          <Route path="/processos" element={<PaginaProcessos titulo="Processos da unidade" sobrelinha="Controle de processos" descricao="Todos os processos observados na unidade." processos={ativos} aoAlterarCrm={(id, atualizacao) => void dados.atualizarProcesso(id, atualizacao)} />} />
          <Route path="/atribuidos" element={<PaginaProcessos titulo="Atribuídos a mim" sobrelinha="Fila pessoal" descricao="Processos atribuídos ao seu usuário no SEI." processos={ativos.filter((processo) => processo.atribuidoAMim)} aoAlterarCrm={(id, atualizacao) => void dados.atualizarProcesso(id, atualizacao)} />} />
          <Route path="/novos" element={<PaginaProcessos titulo="Novos processos" sobrelinha="Entradas recentes" descricao="Processos identificados nas últimas 48 horas." processos={novosDesdeOntem} aoAlterarCrm={(id, atualizacao) => void dados.atualizarProcesso(id, atualizacao)} />} />
          <Route path="/marcadores" element={<PaginaProcessos titulo="Marcadores" sobrelinha="Organização do SEI" descricao="Processos agrupados pelos marcadores observados." processos={ativos.filter((processo) => processo.marcadores.length > 0)} aoAlterarCrm={(id, atualizacao) => void dados.atualizarProcesso(id, atualizacao)} />} />
          <Route path="/kanban" element={<Kanban processos={ativos} aoAlterarStatus={(id, status) => void dados.atualizarStatus(id, status)} />} />
          <Route path="/prazos" element={<Prazos processos={ativos} />} />
          <Route path="/historico" element={<Historico eventos={dados.eventos} />} />
          <Route path="/sincronizacoes" element={<HistoricoSincronizacoes execucoes={dados.execucoesSincronizacao} />} />
          <Route path="/configuracoes" element={<Configuracoes aoSair={sair} ultimaSincronizacao={dados.execucoesSincronizacao[0]} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </EstruturaAplicativo>
    </BrowserRouter>
  );
}
