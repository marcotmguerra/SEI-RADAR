import { Bell, Laptop, LockKeyhole } from 'lucide-react';
import { useEffect, useState } from 'react';
import { obterNivelConteudoNotificacao, type NivelConteudoNotificacao } from '../lib/notifications';
import { supabase } from '../lib/supabase';
import type { ExecucaoSincronizacao } from '../types';

export function Configuracoes({ aoSair, ultimaSincronizacao }: {
  readonly aoSair: () => Promise<void>;
  readonly ultimaSincronizacao: ExecucaoSincronizacao | undefined;
}) {
  const [privacidade, definirPrivacidade] = useState(obterNivelConteudoNotificacao());
  const [opcoes, definirOpcoes] = useState<OpcoesNotificacao>({ novoProcesso: true, atribuicao: true, prazoProximo: true, falhaSincronizacao: true });
  const [salva, definirSalva] = useState(false);
  const [erroSalvamento, definirErroSalvamento] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    void supabase.rpc('obter_preferencias_notificacao').then(({ data: dados }) => {
      const nivel = (dados as { nivel_conteudo?: NivelConteudoNotificacao } | null)?.nivel_conteudo;
      if (nivel) definirPrivacidade(nivel);
      const preferencias = dados as Record<string, unknown> | null;
      if (preferencias) definirOpcoes({
        novoProcesso: preferencias.novo_processo !== false,
        atribuicao: preferencias.atribuicao !== false,
        prazoProximo: preferencias.prazo_proximo !== false,
        falhaSincronizacao: preferencias.falha_sincronizacao !== false,
      });
    });
  }, []);

  return <>
    <div className="page-heading"><div><span className="eyebrow">Preferências</span><h1>Configurações</h1><p>Controle notificações e acompanhe o agente.</p></div></div>
    <div className="settings-layout">
      <section className="settings-section">
        <header><Bell /><div><h2>Notificações</h2><p>Defina conteúdo e categorias dos alertas.</p></div></header>
        <div className="table-wrap"><table aria-label="Preferências de notificação"><tbody>
          <tr><th scope="row">Conteúdo exibido</th><td><fieldset className="inline-options"><legend className="sr-only">Conteúdo exibido</legend><label><input type="radio" name="privacidade" value="AVISO" checked={privacidade === 'AVISO'} onChange={(evento) => definirPrivacidade(evento.target.value as typeof privacidade)} />Apenas aviso</label><label><input type="radio" name="privacidade" value="NUMERO" checked={privacidade === 'NUMERO'} onChange={(evento) => definirPrivacidade(evento.target.value as typeof privacidade)} />Número do SEI</label><label><input type="radio" name="privacidade" value="ASSUNTO" checked={privacidade === 'ASSUNTO'} onChange={(evento) => definirPrivacidade(evento.target.value as typeof privacidade)} />Número e assunto</label></fieldset></td></tr>
          <tr><th scope="row">Alertas ativos</th><td><div className="inline-options"><AlternadorPreferencia rotulo="Novos processos" marcado={opcoes.novoProcesso} aoAlterar={(marcado) => definirOpcoes((atuais) => ({ ...atuais, novoProcesso: marcado }))} /><AlternadorPreferencia rotulo="Novas atribuições" marcado={opcoes.atribuicao} aoAlterar={(marcado) => definirOpcoes((atuais) => ({ ...atuais, atribuicao: marcado }))} /><AlternadorPreferencia rotulo="Prazos próximos" marcado={opcoes.prazoProximo} aoAlterar={(marcado) => definirOpcoes((atuais) => ({ ...atuais, prazoProximo: marcado }))} /><AlternadorPreferencia rotulo="Falhas de sincronização" marcado={opcoes.falhaSincronizacao} aoAlterar={(marcado) => definirOpcoes((atuais) => ({ ...atuais, falhaSincronizacao: marcado }))} /></div></td></tr>
          <tr><th scope="row">Ação</th><td>{erroSalvamento ? <p className="form-error" role="alert">Não foi possível salvar a preferência.</p> : null}<button className="primary-button" type="button" onClick={() => void salvarPreferencia(privacidade, opcoes).then((salvamentoBemSucedido) => { definirSalva(salvamentoBemSucedido); definirErroSalvamento(!salvamentoBemSucedido); })}>{salva ? 'Preferência salva' : 'Salvar preferência'}</button></td></tr>
        </tbody></table></div>
      </section>
      <section className="settings-section">
        <header><Laptop /><div><h2>Agente CRM-SEI</h2><p>Este navegador não acessa o SEI diretamente.</p></div></header>
        <div className="table-wrap"><table aria-label="Estado do agente"><tbody><tr><th scope="row">Status</th><td><span className="agent-status"><span className="agent-dot" />{obterStatusAgente(ultimaSincronizacao)}</span></td></tr><tr><th scope="row">Última sincronização</th><td>{ultimaSincronizacao ? new Date(ultimaSincronizacao.iniciadaEm).toLocaleString('pt-BR') : 'Ainda não registrada'}</td></tr><tr><th scope="row">Modo SEI</th><td>Somente leitura</td></tr></tbody></table></div>
      </section>
      <section className="settings-section">
        <header><LockKeyhole /><div><h2>Sessão</h2><p>Os dados são protegidos pelas políticas do Supabase.</p></div></header>
        <div className="table-wrap"><table aria-label="Sessão do usuário"><tbody><tr><th scope="row">Conta</th><td><button className="secondary-button" type="button" onClick={() => void aoSair()}>Sair da conta</button></td></tr></tbody></table></div>
      </section>
    </div>
  </>;
}

interface OpcoesNotificacao { readonly novoProcesso: boolean; readonly atribuicao: boolean; readonly prazoProximo: boolean; readonly falhaSincronizacao: boolean; }

export function obterStatusAgente(ultimaSincronizacao: ExecucaoSincronizacao | undefined, agora = Date.now()): string {
  if (!ultimaSincronizacao) return 'Sem sincronização';
  if (ultimaSincronizacao.status === 'SESSAO_EXPIRADA') return 'Sessão expirada';
  if (ultimaSincronizacao.status === 'ERRO_LAYOUT_COLETOR') return 'Layout do SEI alterado';
  if (ultimaSincronizacao.status === 'ERRO' || ultimaSincronizacao.status === 'INCOMPLETA') return 'Atenção necessária';
  return agora - new Date(ultimaSincronizacao.iniciadaEm).getTime() <= 25 * 60_000 ? 'Ativo' : 'Sem sincronizar';
}

function AlternadorPreferencia({ rotulo, marcado, aoAlterar }: { readonly rotulo: string; readonly marcado: boolean; readonly aoAlterar: (marcado: boolean) => void }) {
  return <label><input type="checkbox" checked={marcado} onChange={(evento) => aoAlterar(evento.target.checked)} />{rotulo}</label>;
}

async function salvarPreferencia(nivel: ReturnType<typeof obterNivelConteudoNotificacao>, opcoes: OpcoesNotificacao): Promise<boolean> {
  localStorage.setItem('crm-sei:conteudo-notificacao', nivel);
  if ('Notification' in globalThis && Notification.permission === 'default') await Notification.requestPermission();
  if (supabase) {
    const { error: erro } = await supabase.rpc('atualizar_preferencias_notificacao', {
      p_nivel_conteudo: nivel, p_novo_processo: opcoes.novoProcesso, p_atribuicao: opcoes.atribuicao,
      p_prazo_proximo: opcoes.prazoProximo, p_falha_sincronizacao: opcoes.falhaSincronizacao,
    });
    if (erro) return false;
  }
  return true;
}
