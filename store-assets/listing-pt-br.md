# Chrome Web Store — textos da versão 1.1.0

Material para colar no painel do desenvolvedor. As imagens 1280x800 estão em
`store-assets/screenshots/` e são regeradas com `npm run screenshots`.

---

## Nome

SEI! Radar

## Descrição breve (até 132 caracteres)

Avisa quando chega processo novo no SEI, com assunto, atribuição e link de acesso rápido. Somente leitura.

## Descrição completa

O SEI! Radar fica de olho na sua caixa do SEI e avisa quando chega processo novo — sem você
precisar ficar atualizando a página.

**O que ele faz**

- Mostra os processos com número, assunto, atribuição, etiquetas e prazo, tudo numa lista só.
- Notifica no sistema quando entra processo novo dentro do que você escolheu acompanhar.
- Deixa você escolher o escopo: só o que está atribuído a você, tudo da unidade, ou apenas
  processos com determinadas etiquetas.
- Mostra o andamento (de onde veio o processo, quem enviou e quando) dentro do próprio card.
- Funciona também no painel lateral do navegador.

**Somente leitura, sempre**

O Radar lê o que já está na sua tela do SEI. Ele não abre, não move, não assina, não conclui e
não altera absolutamente nada — nem para você, nem para as outras pessoas da sua unidade. Todas
as requisições ao SEI são do tipo GET; não existe nenhum POST, PUT ou DELETE no código.

**Nada sai do seu navegador**

Não há servidor, conta, senha nem serviço em nuvem. Os processos e as preferências ficam
guardados apenas no armazenamento local da sua máquina.

**Sobre o aviso "ler e alterar seus dados"**

O Chrome usa essa mesma frase para qualquer extensão que leia páginas: não existe uma permissão
de host somente-leitura no navegador. O texto descreve o que a permissão *habilita*, não o que
esta extensão *faz*. O código-fonte é aberto e pode ser auditado.

---

## Novidades da versão 1.1.0

- **Fim do aviso repetido de sessão finalizada.** A notificação de "sessão do SEI expirou"
  agora é opcional e vem desligada. Quando ligada, ela avisa uma única vez por queda, em vez
  de repetir a cada verificação. O estado de desconexão continua visível no `OFF` do ícone e
  no banner dentro do Radar.
- **Primeira abertura repensada.** Nova tela de boas-vindas explicando que a extensão é somente
  leitura, e uma tela de primeira carga com radar animado e progresso, no lugar da espera sem
  sinal nenhum.
- **Menos permissões na instalação.** Nenhum acesso a site é concedido ao instalar. O acesso a
  um domínio do SEI só é pedido depois, restrito àquele domínio, e apenas se você optar pela
  verificação em segundo plano.

---

## Justificativa das permissões (formulário de revisão)

| Permissão | Justificativa |
| :--- | :--- |
| `storage` | Guardar localmente os processos já vistos e as preferências do usuário. É o que permite distinguir o que é novidade do que já foi mostrado. |
| `alarms` | Agendar a verificação periódica (intervalo escolhido pelo usuário, de 1 a 15 minutos). Um service worker de Manifest V3 não pode manter um temporizador próprio. |
| `notifications` | Exibir o alerta de processo novo ou de etiqueta alterada, que é a função principal da extensão. |
| `tabs` | Localizar abas do SEI já abertas para ler os processos direto delas — o caminho que dispensa qualquer permissão de host — e focar a aba certa quando o usuário clica numa notificação. |
| `offscreen` | O service worker do Manifest V3 não tem DOM: o documento offscreen é usado para tocar o alerta sonoro (Web Audio) e para interpretar o HTML do SEI com DOMParser. |
| `sidePanel` | Exibir o Radar no painel lateral, quando o usuário escolhe essa visualização. |
| `optional_host_permissions` (`.gov.br`, `.jus.br`, `.leg.br`, `.mp.br`, `.def.br`) | **Não é concedida na instalação.** É pedida em tempo de execução, restrita ao domínio específico do SEI que o usuário configurar, e somente quando ele salva a URL nas Configurações. Serve para verificar novidades em segundo plano sem exigir uma aba aberta. Recusar não impede o uso: com uma aba do SEI aberta, o Radar funciona sem permissão nenhuma. |

**Uso de código remoto:** nenhum. Todo o código é empacotado na extensão.

**Justificativa do escopo de host:** a extensão lê a tela de controle de processos de instalações
do SEI, que no Brasil ficam sob domínios institucionais. Os cinco sufixos cobrem executivo,
judiciário, legislativo, Ministério Público e Defensoria Pública. Não há acesso a qualquer outro
site da internet.

---

## Política de privacidade

Publicada a partir de `docs/index.html`.

## Imagens

`store-assets/screenshots/` — cinco imagens 1280x800, geradas a partir do popup real com dados
totalmente fictícios (`scripts/dados-demo.json`). Nenhum número de processo, nome, CPF ou
unidade que apareça nelas corresponde a algo real.
