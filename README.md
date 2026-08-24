# 🔔 SEI Notifier - Monitor de Processos

Extensão de navegador leve (Chrome, Microsoft Edge e Brave - Manifest V3) que monitora a entrada de novos processos no SEI, extrai o **número do processo** e o **assunto** e envia notificações nativas na área de trabalho.

---

## ✨ Funcionalidades

- 🔔 **Notificações Nativas no Sistema**: Avisa na tela do computador assim que um novo processo entra na caixa da sua unidade, com número e assunto em destaque.
- ⚡ **Acesso Direto ao Processo**: Clicar na notificação ou no card da lista abre a página do processo diretamente no SEI.
- 🚀 **Login Assistido de 1 Clique**: Botão "Abrir SEI" no popup para abrir/focar a tela de controle do sistema oficial.
- 🔍 **Busca Rápida**: Filtre processos por número ou palavras-chave do assunto.
- ⚙️ **Configurações Flexíveis**: Ajuste o intervalo de checagem automática (1, 2, 5, 10, 15 min), ative/desative som e notificações.
- 🪶 **Ultra Leve**: Sem banco de dados externo, sem servidores locais rodando no terminal, sem necessidade de logins paralelos por robôs — a extensão aproveita sua própria sessão ativa no navegador.

---

## 📥 Como Instalar no Navegador (2 passos)

### 1. Gerar os arquivos da extensão
```bash
npm run build
```
Isso criará a pasta `dist/` pronta para ser carregada no navegador.

### 2. Carregar no Google Chrome, Edge ou Brave

1. Abra o navegador e acesse a tela de extensões:
   - No **Google Chrome**: `chrome://extensions`
   - No **Microsoft Edge**: `edge://extensions`
   - No **Brave**: `brave://extensions`
2. Ative a chave **"Modo do desenvolvedor"** (no canto superior direito).
3. Clique no botão **"Carregar sem compactação"** (ou *"Load unpacked"*).
4. Selecione a pasta **`dist`** dentro da pasta deste projeto (`CRM-SEI/dist`).
5. Fixe o ícone do **SEI Notifier** na barra de ferramentas do seu navegador para fácil acesso!

---

## 🛠️ Comandos de Desenvolvimento

```bash
# Executa a suíte de testes unitários
npm test

# Valida os tipos TypeScript
npm run typecheck

# Compila a extensão para a pasta dist/
npm run build
```

---

## 🔒 Privacidade e Segurança

- A extensão opera em modo **somente leitura**.
- Não salva dados em servidores externos nem em nuvem.
- Os dados de processos e preferências ficam armazenados exclusivamente na memória local do seu próprio navegador (`chrome.storage.local`).
