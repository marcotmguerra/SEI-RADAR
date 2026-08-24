import React, { useEffect, useState, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ExternalLink,
  RefreshCw,
  Settings,
  Search,
  CheckCircle,
  Bell,
  FileText,
  Clock,
  CheckCheck,
} from 'lucide-react';
import {
  obterConfiguracao,
  obterProcessos,
  obterStatusSessao,
  marcarProcessoComoLido,
  marcarTodosProcessosComoLidos,
  salvarConfiguracao,
} from '../shared/storage';
import type { ConfiguracaoExtensao, ProcessoSei, StatusSessao } from '../types';

const formatarHora = (dataIso: string): string => {
  try {
    const data = new Date(dataIso);
    const agora = new Date();
    const diferencaMinutos = Math.floor((agora.getTime() - data.getTime()) / (1000 * 60));

    if (diferencaMinutos < 1) return 'Agora mesmo';
    if (diferencaMinutos < 60) return `Há ${diferencaMinutos} min`;

    return data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return 'Recente';
  }
};

export const PopupApp: React.FC = () => {
  const [processos, setProcessos] = useState<ProcessoSei[]>([]);
  const [config, setConfig] = useState<ConfiguracaoExtensao | null>(null);
  const [status, setStatus] = useState<StatusSessao>('verificando');
  const [ultimaVerificacao, setUltimaVerificacao] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [termoBusca, setTermoBusca] = useState('');
  const [filtro, setFiltro] = useState<'todos' | 'nao_lidos'>('todos');
  const [exibindoConfig, setExibindoConfig] = useState(false);
  const [mensagemAviso, setMensagemAviso] = useState<string | null>(null);

  // Carrega dados iniciais e dispara checagem rápida
  const carregarDados = async () => {
    try {
      const [procs, conf, sessao] = await Promise.all([
        obterProcessos(),
        obterConfiguracao(),
        obterStatusSessao(),
      ]);
      setProcessos(procs);
      setConfig(conf);
      setStatus(sessao.status);
      setUltimaVerificacao(sessao.ultimaVerificacao);
    } catch (erro) {
      console.error('Erro ao carregar dados do popup:', erro);
    }
  };

  useEffect(() => {
    carregarDados();
    // Ao abrir o popup, dispara verificação em segundo plano para atualizar status de login
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime
        .sendMessage({ tipo: 'VERIFICAR_AGORA' })
        .then(() => carregarDados())
        .catch(() => {});
    }
  }, []);

  // Dispara verificação manual imediata
  const handleVerificarAgora = async () => {
    setCarregando(true);
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        await chrome.runtime.sendMessage({ tipo: 'VERIFICAR_AGORA' });
      }
      await carregarDados();
    } catch (erro) {
      console.error('Erro na verificação manual:', erro);
    } finally {
      setCarregando(false);
    }
  };

  // Abre ou foca a aba do SEI
  const handleAbrirSei = async (urlDestino?: string) => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      await chrome.runtime.sendMessage({ tipo: 'ABRIR_SEI', url: urlDestino });
    } else if (config) {
      window.open(urlDestino || config.urlControle, '_blank');
    }
  };

  // Marca um processo individual como lido
  const handleMarcarLido = async (numero: string, evento: React.MouseEvent) => {
    evento.stopPropagation();
    const atualizados = await marcarProcessoComoLido(numero);
    setProcessos(atualizados);
  };

  // Marca todos os processos como lidos
  const handleMarcarTodosLidos = async () => {
    const atualizados = await marcarTodosProcessosComoLidos();
    setProcessos(atualizados);
  };

  // Salva alterações de configuração
  const handleSalvarConfig = async () => {
    if (!config) return;
    await salvarConfiguracao(config);
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      await chrome.runtime.sendMessage({
        tipo: 'SALVAR_CONFIGURACAO',
        configuracao: config,
      });
    }
    setMensagemAviso('Configurações salvas!');
    setTimeout(() => {
      setMensagemAviso(null);
      setExibindoConfig(false);
    }, 1200);
  };

  // Dispara notificação de teste
  const handleTestarNotificacao = async () => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      await chrome.runtime.sendMessage({ tipo: 'TESTAR_NOTIFICACAO' });
    }
  };

  // Filtra e ordena processos
  const processosFiltrados = useMemo(() => {
    return processos
      .filter((p) => {
        if (filtro === 'nao_lidos' && p.lido) return false;
        if (!termoBusca.trim()) return true;
        const termo = termoBusca.toLowerCase();
        const num = p.numero.toLowerCase();
        const assunto = (p.assunto || '').toLowerCase();
        return num.includes(termo) || assunto.includes(termo);
      })
      .sort((a, b) => new Date(b.detectadoEm).getTime() - new Date(a.detectadoEm).getTime());
  }, [processos, filtro, termoBusca]);

  const totalNaoLidos = processos.filter((p) => !p.lido).length;

  return (
    <div className="popup-container">
      {/* Cabeçalho */}
      <header className="header">
        <div className="header-title-row">
          <span className="logo-badge">SEI</span>
          <h1 className="title">Monitor</h1>
        </div>

        <div className="header-actions">
          <button
            className="btn-open-sei"
            onClick={() => handleAbrirSei()}
            title="Abrir página de controle do SEI"
          >
            <ExternalLink size={13} />
            Abrir SEI
          </button>
          <button
            className={`btn-icon ${carregando ? 'spin' : ''}`}
            onClick={handleVerificarAgora}
            disabled={carregando}
            title="Verificar agora"
          >
            <RefreshCw size={15} />
          </button>
          <button
            className={`btn-icon ${exibindoConfig ? 'active' : ''}`}
            onClick={() => setExibindoConfig(!exibindoConfig)}
            title="Configurações"
          >
            <Settings size={15} />
          </button>
        </div>
      </header>

      {/* Barra de Status */}
      <div className="status-bar">
        <div className="status-badge">
          <span className={`status-dot ${status}`} />
          <span>
            {status === 'conectado' && 'Conectado ao SEI'}
            {status === 'verificando' && 'Verificando processos...'}
            {status === 'desconectado' && 'Faça login no SEI'}
            {status === 'erro' && 'Erro de conexão'}
          </span>
        </div>
        <div className="status-info">
          {ultimaVerificacao ? `Atualizado: ${formatarHora(ultimaVerificacao)}` : 'Nunca verificado'}
        </div>
      </div>

      {exibindoConfig && config ? (
        /* Tela de Configurações */
        <div className="settings-view">
          <div className="setting-group">
            <label className="setting-label">URL de Controle do SEI</label>
            <input
              type="text"
              className="setting-input"
              value={config.urlControle}
              onChange={(e) => setConfig({ ...config, urlControle: e.target.value })}
              placeholder="https://www.sei.mg.gov.br/sei/controlador.php?acao=procedimento_controlar"
            />
          </div>

          <div className="setting-group">
            <label className="setting-label">Intervalo de Verificação Automática</label>
            <select
              className="setting-select"
              value={config.intervaloMinutos}
              onChange={(e) => setConfig({ ...config, intervaloMinutos: Number(e.target.value) })}
            >
              <option value={1}>A cada 1 minuto</option>
              <option value={2}>A cada 2 minutos</option>
              <option value={5}>A cada 5 minutos (Recomendado)</option>
              <option value={10}>A cada 10 minutos</option>
              <option value={15}>A cada 15 minutos</option>
            </select>
          </div>

          <div className="setting-toggle-row">
            <div>
              <div className="setting-label">Notificações no Sistema</div>
              <div className="setting-toggle-desc">Avisar no canto da tela quando novos processos entrarem</div>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={config.notificacoesAtivas}
                onChange={(e) => setConfig({ ...config, notificacoesAtivas: e.target.checked })}
              />
              <span className="slider" />
            </label>
          </div>

          <div className="setting-toggle-row">
            <div>
              <div className="setting-label">Alerta Sonoro</div>
              <div className="setting-toggle-desc">Emitir som discreto ao receber novo processo</div>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={config.somAtivo}
                onChange={(e) => setConfig({ ...config, somAtivo: e.target.checked })}
              />
              <span className="slider" />
            </label>
          </div>

          <button className="btn-secondary" onClick={handleTestarNotificacao}>
            <Bell size={14} />
            Testar Notificação de Exemplo
          </button>

          <button className="btn-primary-full" onClick={handleSalvarConfig}>
            {mensagemAviso || 'Salvar Configurações'}
          </button>
        </div>
      ) : (
        /* Tela Principal de Processos */
        <>
          <div className="search-section">
            <div className="search-input-wrap">
              <Search size={14} />
              <input
                type="text"
                className="search-input"
                placeholder="Buscar por número ou assunto..."
                value={termoBusca}
                onChange={(e) => setTermoBusca(e.target.value)}
              />
            </div>

            <div className="filters-row">
              <div className="filter-pills">
                <button
                  className={`filter-pill ${filtro === 'todos' ? 'active' : ''}`}
                  onClick={() => setFiltro('todos')}
                >
                  Todos ({processos.length})
                </button>
                <button
                  className={`filter-pill ${filtro === 'nao_lidos' ? 'active' : ''}`}
                  onClick={() => setFiltro('nao_lidos')}
                >
                  Novos ({totalNaoLidos})
                </button>
              </div>

              {totalNaoLidos > 0 && (
                <button className="btn-mark-all" onClick={handleMarcarTodosLidos}>
                  <CheckCheck size={12} style={{ display: 'inline', marginRight: 3 }} />
                  Marcar todos como lidos
                </button>
              )}
            </div>
          </div>

          <main className="process-list">
            {processosFiltrados.length === 0 ? (
              <div className="empty-state">
                <FileText size={36} color="var(--text-light)" />
                <p>Nenhum processo encontrado</p>
                <span>
                  {processos.length === 0
                    ? 'Clique em "Abrir SEI" ou no botão de atualizar (🔄) para sincronizar.'
                    : 'Tente outro termo na busca.'}
                </span>
              </div>
            ) : (
              processosFiltrados.map((proc) => (
                <article
                  key={proc.numero}
                  className={`process-card ${!proc.lido ? 'unread' : ''}`}
                  onClick={() => handleAbrirSei(proc.link)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="process-header">
                    <a
                      href={proc.link}
                      className="process-number"
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAbrirSei(proc.link);
                      }}
                    >
                      {proc.numero}
                      <ExternalLink size={11} />
                    </a>
                    {!proc.lido && <span className="badge-new">Novo</span>}
                  </div>

                  <div className="process-subject">
                    {proc.assunto || 'Sem assunto especificado'}
                  </div>

                  <div className="process-footer">
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={11} />
                      {formatarHora(proc.detectadoEm)}
                    </span>

                    {!proc.lido && (
                      <button
                        className="btn-read-toggle"
                        onClick={(e) => handleMarcarLido(proc.numero, e)}
                        title="Marcar como lido"
                      >
                        <CheckCircle size={12} />
                        Marcar lido
                      </button>
                    )}
                  </div>
                </article>
              ))
            )}
          </main>
        </>
      )}
    </div>
  );
};

const elementoRoot = document.getElementById('root');
if (elementoRoot) {
  const root = createRoot(elementoRoot);
  root.render(<PopupApp />);
}
