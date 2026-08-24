import { useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import clsx from 'clsx';
import { ArrowLeft, LogOut, Menu } from 'lucide-react';
import { LogoApp } from '@/components/common/LogoApp';
import { IconButton, IconButtonLink } from '@/components/ui/IconButton';
import { useDados } from '@/dados/contexto';
import { sair } from '@/dados/sessao';
import { NOME_APP } from '@/lib/marca';
import { lerRascunhoTreino } from '@/lib/rascunhoTreino';
import { barraPara, casaRota, gruposNavPara, type GrupoNav, type ItemNav } from './navegacao';
import estilos from './AppShell.module.css';

interface AppShellProps {
  titulo: string;
  children: ReactNode;
  acoes?: ReactNode;
  tituloOculto?: boolean;
  voltar?: string;
  rotuloVoltar?: string;
}

/**
 * Arquivo copiado apenas como referência estrutural do Delta Trainer.
 * Os imports de domínio pertencem ao projeto de origem e deverão ser
 * substituídos pelos equivalentes do CRM-SEI quando a interface for criada.
 */
export function AppShell({
  titulo,
  children,
  acoes,
  tituloOculto,
  voltar,
  rotuloVoltar,
}: AppShellProps) {
  const { pathname } = useLocation();
  const navegar = useNavigate();
  const [drawerAberto, setDrawerAberto] = useState(false);
  const { ehCoach } = useDados();
  const treinoEmAndamento = ehCoach ? undefined : lerRascunhoTreino();
  const adaptarTreinar = (item: ItemNav): ItemNav =>
    item.rotulo === 'Treinar' && treinoEmAndamento
      ? { ...item, rotulo: 'Retomar', rota: treinoEmAndamento.rota }
      : item;
  const grupos = gruposNavPara(ehCoach).map((grupo) => ({
    ...grupo,
    itens: grupo.itens.map(adaptarTreinar),
  }));
  const barraBase = barraPara(pathname, ehCoach);
  const barra = barraBase?.map(adaptarTreinar) ?? null;

  async function aoSair() {
    await sair();
    navegar('/login');
  }

  return (
    <div className={estilos.shell}>
      <nav className={estilos.rail} aria-label="Navegação principal">
        <span className={estilos.marca}>
          <LogoApp size={30} />
          <span className={estilos.marcaTexto}>{NOME_APP}</span>
        </span>
        {grupos.map((grupo, indice) => (
          <GrupoRail key={grupo.rotulo || indice} grupo={grupo} primeiro={indice === 0} rotaAtual={pathname} />
        ))}
        <div className={estilos.railRodape}>
          <button
            type="button"
            className={estilos.botaoSair}
            onClick={aoSair}
            title="Sair da conta"
            aria-label="Sair da conta"
          >
            <LogOut size={22} aria-hidden />
            <span className={estilos.itemRailTexto}>Sair</span>
          </button>
        </div>
      </nav>

      <div className={estilos.principal}>
        <header className={estilos.topo}>
          <div className={estilos.topoInterno}>
            {voltar ? (
              <IconButtonLink to={voltar} className={estilos.botaoVoltar} rotulo={rotuloVoltar ?? 'Voltar'}>
                <ArrowLeft size={20} aria-hidden />
              </IconButtonLink>
            ) : !barra ? (
              <span className={estilos.botaoMenuContainer}>
                <IconButton
                  className={estilos.botaoMenu}
                  onClick={() => setDrawerAberto(true)}
                  rotulo="Abrir menu"
                >
                  <Menu size={24} aria-hidden />
                </IconButton>
              </span>
            ) : null}
            <h1 className={clsx(estilos.titulo, tituloOculto && estilos.tituloOculto)}>{titulo}</h1>
            {acoes ? <div className={estilos.acoes}>{acoes}</div> : null}
          </div>
        </header>

        <main className={clsx(estilos.conteudo, barra && estilos.conteudoComBarra)}>
          <div className={estilos.conteudoInterno}>{children}</div>
        </main>
      </div>

      {barra ? (
        <nav className={estilos.barra} aria-label="Navegação rápida">
          {barra.map((item) => {
            const ativo = casaRota(pathname, item.rota);
            const Icone = item.icone;
            return (
              <Link
                key={item.rota}
                to={item.rota}
                className={clsx(
                  estilos.itemBarra,
                  ativo && estilos.itemBarraAtivo,
                  item.destaque && estilos.itemBarraDestaque,
                )}
                aria-current={ativo ? 'page' : undefined}
              >
                <span className={item.destaque ? estilos.indicadorDestaque : estilos.indicadorBarra}>
                  <Icone size={item.destaque ? 24 : 20} aria-hidden />
                </span>
                {item.rotulo}
              </Link>
            );
          })}
        </nav>
      ) : null}

      <Drawer
        aberto={drawerAberto}
        onAbertoChange={setDrawerAberto}
        rotaAtual={pathname}
        grupos={grupos}
        onSair={aoSair}
      />
    </div>
  );
}

function GrupoRail({
  grupo,
  primeiro,
  rotaAtual,
}: {
  grupo: GrupoNav;
  primeiro: boolean;
  rotaAtual: string;
}) {
  if (!grupo.rotulo) {
    return (
      <>
        {grupo.itens.map((item) => (
          <ItemRail key={item.rota} item={item} ativo={casaRota(rotaAtual, item.rota)} />
        ))}
      </>
    );
  }
  return (
    <div
      role="group"
      aria-label={grupo.rotulo}
      className={clsx(estilos.grupoRail, !primeiro && estilos.grupoRailSeparado)}
    >
      <span className={estilos.grupoRotulo} aria-hidden>
        {grupo.rotulo}
      </span>
      {grupo.itens.map((item) => (
        <ItemRail key={item.rota} item={item} ativo={casaRota(rotaAtual, item.rota)} />
      ))}
    </div>
  );
}

function ItemRail({ item, ativo }: { item: ItemNav; ativo: boolean }) {
  const Icone = item.icone;
  return (
    <Link
      to={item.rota}
      title={item.rotulo}
      className={clsx(estilos.itemRail, ativo && estilos.itemRailAtivo)}
      aria-current={ativo ? 'page' : undefined}
    >
      <Icone size={22} aria-hidden />
      <span className={estilos.itemRailTexto}>{item.rotulo}</span>
    </Link>
  );
}

function Drawer({
  aberto,
  onAbertoChange,
  rotaAtual,
  grupos,
  onSair,
}: {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  rotaAtual: string;
  grupos: GrupoNav[];
  onSair: () => void;
}) {
  return (
    <DialogPrimitive.Root open={aberto} onOpenChange={onAbertoChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={estilos.drawerOverlay} />
        <DialogPrimitive.Content className={estilos.drawer} aria-label="Menu de navegação">
          <DialogPrimitive.Title className={estilos.drawerMarca}>
            <LogoApp size={34} />
            <span>
              <span className={estilos.drawerTitulo}>{NOME_APP}</span>
              <br />
              <span className={estilos.drawerSubtitulo}>Gestão de treino</span>
            </span>
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className={estilos.drawerSubtitulo} style={{ display: 'none' }}>
            Escolha uma seção do aplicativo.
          </DialogPrimitive.Description>
          <div className={estilos.drawerDivisor} />
          {grupos.map((grupo, indice) => (
            <div
              key={grupo.rotulo || indice}
              role={grupo.rotulo ? 'group' : undefined}
              aria-label={grupo.rotulo || undefined}
              className={clsx(grupo.rotulo && estilos.grupoDrawer)}
            >
              {grupo.rotulo ? (
                <span className={estilos.grupoRotulo} aria-hidden>
                  {grupo.rotulo}
                </span>
              ) : null}
              {grupo.itens.map((item) => {
                const ativo = casaRota(rotaAtual, item.rota);
                const Icone = item.icone;
                return (
                  <Link
                    key={item.rota}
                    to={item.rota}
                    onClick={() => onAbertoChange(false)}
                    className={clsx(estilos.itemRail, ativo && estilos.itemRailAtivo)}
                    style={{ justifyContent: 'flex-start', paddingInline: 'var(--e3)' }}
                  >
                    <Icone size={22} aria-hidden />
                    <span>{item.rotulo}</span>
                  </Link>
                );
              })}
            </div>
          ))}
          <div className={estilos.drawerRodape}>
            <button
              type="button"
              className={estilos.botaoSair}
              onClick={() => {
                onAbertoChange(false);
                onSair();
              }}
              style={{ justifyContent: 'flex-start', paddingInline: 'var(--e3)' }}
            >
              <LogOut size={22} aria-hidden />
              <span>Sair</span>
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
