# SEI Notifier - Radar de Processos

Extensão de navegador leve (Google Chrome, Microsoft Edge e Brave - Manifest V3) que monitora a tramitação e chegada de processos no SEI, extrai número, assunto, atribuição e etiquetas, e oferece um Radar Pessoal com notificações na área de trabalho.

---

## Funcionalidades

- **Radar Pessoal com Onboarding Inicial**: Na primeira abertura, configure seu escopo de monitoramento (processos atribuídos ao seu CPF, todos da unidade ou processos com etiquetas específicas). Suas escolhas são locais e não alteram processos nem a visualização de outros usuários.
- **Notificações Nativas no Sistema**: Avisos visuais na tela quando novos processos entrarem no seu Radar ou quando etiquetas acompanhadas forem atualizadas.
- **Radar Sonoro**: Alerta sonoro discreto e configurável ao detectar novos processos no Radar.
- **Suporte a Painel Lateral (Side Panel)**: Opção de manter o Radar aberto e visível na lateral do navegador enquanto você trabalha no SEI.
- **Extração Automática de Etiquetas do SEI**: Leitura direta das etiquetas e observações da página de controle do SEI, sem necessidade de cadastro manual.
- **Acesso Direto ao Processo**: Clique no card ou na notificação para abrir o processo diretamente no SEI.
- **Login Assistido**: Botão "Abrir SEI" para focar ou abrir imediatamente a página de controle da sua instituição.
- **Filtros e Busca Rápida**: Busca textual instantânea por número, assunto, atribuição ou etiqueta, com filtros por período (hoje, ontem, todos) e status (novos, atribuídos a mim).
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
5. Fixe o ícone do **SEI Notifier** na barra de ferramentas do navegador para acesso rápido.

---

## Sincronização: aba aberta vs. verificação em segundo plano

O Radar tem duas formas de se manter atualizado, e você pode usar as duas juntas:

1. **Com uma aba do SEI aberta** — a extensão lê os processos direto da tela, sem pedir nenhuma permissão extra. É o modo padrão e funciona sempre.
2. **Em segundo plano, sem nenhuma aba do SEI aberta** — ao salvar a URL de controle do SEI nas Configurações, o navegador pede permissão de acesso *apenas àquele domínio* para a extensão poder verificar novidades periodicamente mesmo sem aba aberta. Se você não conceder, nada quebra: o Radar continua funcionando normalmente todas as vezes que houver uma aba do SEI aberta.

Essa permissão é opcional (`optional_host_permissions`) e só é pedida no momento em que você clica em "Salvar", nunca automaticamente e nunca para outros sites.

---

## Comandos de Desenvolvimento

```bash
# Executa a suíte de testes unitários (Vitest)
npm test

# Valida os tipos TypeScript
npm run typecheck

# Compila a extensão e gera os arquivos da pasta dist/
npm run build

# Inicia o servidor Vite para desenvolvimento de interface
npm run dev
```

---

## Privacidade e Segurança

- A extensão opera estritamente em modo **somente leitura**.
- Não envia dados para servidores externos ou serviços em nuvem.
- Os processos coletados e as preferências de configuração ficam armazenados exclusivamente na memória local do seu próprio navegador (`chrome.storage.local`).
- A seleção pessoal de escopo e etiquetas não afeta as marcações nem a visualização de outros usuários da unidade.
- Nenhuma permissão de acesso a sites é concedida na instalação. O acesso a um domínio do SEI só é pedido em tempo de execução, restrito àquele domínio específico, e apenas se você optar por usar a verificação em segundo plano (veja a seção acima).
- Consulte a [Política de Privacidade completa](./docs/index.html) para detalhes sobre dados coletados, permissões utilizadas e seus direitos.
  Assim que publicada via GitHub Pages (apontando para a pasta `/docs`) ou Cloudflare Pages, a página fica disponível como um link público independente do código-fonte.
