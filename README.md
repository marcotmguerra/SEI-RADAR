# SEI! Radar - Radar de Processos

Extensão de navegador leve (Google Chrome, Microsoft Edge e Brave - Manifest V3) que monitora a tramitação e chegada de processos no SEI, extrai número, assunto, atribuição e etiquetas, e oferece um Radar Pessoal com notificações na área de trabalho.

---

## Funcionalidades

- **Radar Pessoal com Onboarding Inicial**: Na primeira abertura, configure seu escopo de monitoramento (processos atribuídos ao seu CPF, todos da unidade ou processos com etiquetas específicas). Suas escolhas são locais e não alteram processos nem a visualização de outros usuários.
- **Notificações Nativas no Sistema**: Avisos visuais na tela quando novos processos entrarem no seu Radar ou quando etiquetas acompanhadas forem atualizadas. **A primeira sincronização nunca notifica** — ela apenas fotografa o que já existia no SEI, e só o que chegar depois vira aviso. Cada ciclo emite no máximo 4 notificações individuais; o excedente vira um único aviso de resumo.
- **Radar Sonoro**: Alerta sonoro discreto e configurável ao detectar novos processos no Radar.
- **Suporte a Painel Lateral (Side Panel)**: Opção de manter o Radar aberto e visível na lateral do navegador enquanto você trabalha no SEI.
- **Andamento do Processo**: Em cada card, o botão "Andamento" consulta o histórico no SEI e mostra **unidade geradora**, **unidade que enviou**, **data de envio**, **última atualização** e a **descrição** da movimentação mais recente, com link para o andamento completo. Há também coleta em lote para a lista inteira, com progresso. As consultas são feitas sob demanda, com no máximo 2 requisições simultâneas e cache local de 6 horas.
- **Prazos à Vista**: Processos com retorno programado exibem a data no card, destacada em vermelho quando vencida, e podem ser isolados pelo filtro "Com prazo".
- **Extração Automática de Etiquetas do SEI**: Leitura direta das etiquetas e observações da página de controle do SEI, sem necessidade de cadastro manual.
- **Acesso Direto ao Processo**: Clique no card ou na notificação para abrir o processo diretamente no SEI.
- **Login Assistido**: Botão "Abrir SEI" para focar ou abrir imediatamente a página de controle da sua instituição.
- **Filtros e Busca Rápida**: Busca textual instantânea por número, assunto, atribuição ou etiqueta. Os filtros de situação ficam em uma linha só — **Todos**, **A mim**, **Novos**, **Sem atribuição**, **Atribuídos** (a outra pessoa) e **Com prazo**, cada um com sua contagem — acompanhados de seletores de período e etiqueta. As escolhas são lembradas entre aberturas do popup.
- **Apoio à Distribuição**: O filtro "Sem atribuição" isola o que ainda não foi distribuído a ninguém, e "Atribuídos" mostra o que está com outros militares — pensado para o trabalho das secretarias.
- **Configurações Flexíveis**: Ajuste de intervalo de verificação automática (1, 2, 5, 10 ou 15 minutos), regras de notificação, alertas sonoros e escopo.
- **Arquitetura Leve**: Sem banco de dados externo, sem servidores locais em execução e sem necessidade de robôs de login — a extensão utiliza sua própria sessão autenticada no navegador.

---

## Como Instalar no Navegador

### 1. Compilar a extensão
Se estiver instalando a partir do código-fonte, gere a pasta `dist` executando no terminal:
```bash
npm install
npm run build
```

### 2. Carregar no navegador (Chrome, Edge ou Brave)

1. Acesse a página de gerenciamento de extensões:
   - **Google Chrome**: `chrome://extensions`
   - **Microsoft Edge**: `edge://extensions`
   - **Brave**: `brave://extensions`
2. Ative a opção **Modo do desenvolvedor** no canto superior direito.
3. Clique no botão **Carregar sem compactação** (*Load unpacked*).
4. Selecione a pasta **`dist`** gerada dentro do repositório (`CRM-SEI/dist`).
5. Fixe o ícone do **SEI! Radar** na barra de ferramentas do navegador para acesso rápido.

---

## Sincronização: aba aberta vs. verificação em segundo plano

O Radar tem duas formas de se manter atualizado, e você pode usar as duas juntas:

1. **Com uma aba do SEI aberta** — a extensão lê os processos direto da tela, sem pedir nenhuma permissão extra. É o modo padrão e funciona sempre. A consulta de andamento também usa esse caminho, aproveitando a sessão já autenticada da própria aba.
2. **Em segundo plano, sem nenhuma aba do SEI aberta** — ao salvar a URL de controle do SEI nas Configurações, o navegador pede permissão de acesso *apenas àquele domínio* para a extensão poder verificar novidades periodicamente mesmo sem aba aberta. Se você não conceder, nada quebra: o Radar continua funcionando normalmente todas as vezes que houver uma aba do SEI aberta.

Essa permissão é opcional (`optional_host_permissions`), restrita a domínios institucionais brasileiros (`.gov.br`, `.jus.br`, `.leg.br`, `.mp.br`, `.def.br` — não a qualquer site da internet), e só é pedida no momento em que você clica em "Salvar".

O mesmo vale para a leitura da página com a aba aberta: os `content_scripts` também estão restritos a esses cinco domínios institucionais, e apenas a endereços do SEI dentro deles. É por isso que o aviso de instalação do navegador lista esses domínios, em vez de "todos os sites".

---

## Comandos de Desenvolvimento

```bash
# Executa a suíte de testes unitários (Vitest)
npm test

# Valida os tipos TypeScript
npm run typecheck

# Compila a extensão e gera os arquivos da pasta dist/
npm run build

# Compila e gera o dist.zip pronto para a Chrome Web Store
npm run package

# Gera as imagens 1280x800 da loja a partir do popup real, com dados fictícios
npm run screenshots

# Inicia o servidor Vite para desenvolvimento de interface
npm run dev
```

> `npm run package` monta o `dist.zip` com o `manifest.json` na raiz, que é como a Chrome Web
> Store espera receber o pacote. Use sempre esse comando em vez de compactar a pasta à mão: o
> pacote da versão 1.0.1 foi feito manualmente e acabou ficando defasado em relação ao código.

> `npm run screenshots` precisa do Chromium do Playwright (`npx playwright install chromium`).
> Se já houver um Chromium na máquina, aponte para ele com `CHROMIUM_PATH=/caminho/do/chrome`.

---

## Privacidade e Segurança

- A extensão opera estritamente em modo **somente leitura**: todas as requisições ao SEI são `GET`, e nenhuma linha do código escreve na página do SEI (não há envio de formulário, clique automatizado ou alteração de conteúdo). Ela não abre, não move, não assina e não conclui processo nenhum.
- O navegador exibe o aviso *"Ler e alterar seus dados"* nos domínios autorizados. Esse texto é fixo do Chrome e descreve o que a permissão **habilita**, não o que a extensão faz — não existe permissão de host somente-leitura no navegador. O escopo, esse sim, foi restringido aos domínios institucionais listados acima.
- Não envia dados para servidores externos ou serviços em nuvem.
- Os processos coletados e as preferências de configuração ficam armazenados exclusivamente na memória local do seu próprio navegador (`chrome.storage.local`).
- A seleção pessoal de escopo e etiquetas não afeta as marcações nem a visualização de outros usuários da unidade.
- Nenhuma permissão de acesso a sites é concedida na instalação. O acesso a um domínio do SEI só é pedido em tempo de execução, restrito àquele domínio específico dentro de uma lista de domínios institucionais brasileiros, e apenas se você optar por usar a verificação em segundo plano (veja a seção acima).
- Consulte a [Política de Privacidade completa](./docs/index.html) para detalhes sobre dados coletados, permissões utilizadas e seus direitos.
  Assim que publicada via GitHub Pages (apontando para a pasta `/docs`) ou Cloudflare Pages, a página fica disponível como um link público independente do código-fonte.
