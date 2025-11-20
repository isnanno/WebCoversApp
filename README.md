# 🎵 WebCovers - Sistema de Fila de Covers com Gerador de Letras

Sistema web completo para gerenciar filas de covers do YouTube e gerar letras de músicas automaticamente usando inteligência artificial.

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen.svg)
![License](https://img.shields.io/badge/license-ISC-green.svg)

## 📋 Índice

- [Sobre o Projeto](#-sobre-o-projeto)
- [Funcionalidades](#-funcionalidades)
- [Tecnologias Utilizadas](#-tecnologias-utilizadas)
- [Pré-requisitos](#-pré-requisitos)
- [Instalação](#-instalação)
- [Configuração](#-configuração)
- [Uso](#-uso)
- [Estrutura do Projeto](#-estrutura-do-projeto)
- [API Endpoints](#-api-endpoints)
- [Contribuindo](#-contribuindo)
- [Licença](#-licença)

## 🎯 Sobre o Projeto

O **WebCovers** é uma aplicação web moderna desenvolvida para gerenciar filas de covers do YouTube de forma organizada e intuitiva. Além disso, oferece uma funcionalidade avançada de geração automática de letras de músicas utilizando a API do Google Gemini AI.

### Principais Características

- ✅ Interface moderna e responsiva
- ✅ Sistema de autenticação de usuários
- ✅ Gerenciamento de filas de covers
- ✅ Perfis privados/públicos
- ✅ Gerador de letras com IA
- ✅ Download de letras em formato TXT

## ✨ Funcionalidades

### 📝 Gerenciamento de Fila de Covers

- Adicionar covers do YouTube à sua fila pessoal
- Visualizar thumbnails e informações dos vídeos
- Reordenar covers (mover para cima/baixo)
- Remover covers da fila
- Visualizar covers de outros usuários (se o perfil não for privado)

### 👥 Sistema de Usuários

- Cadastro e login de usuários
- Perfis públicos e privados
- Visualização de usuários cadastrados
- Contagem de covers por usuário

### 🎤 Gerador de Letras

- Extração automática de legendas do YouTube
- Processamento inteligente com Google Gemini AI
- Limpeza e organização automática das letras
- Download das letras em formato TXT
- Suporte apenas para legendas manuais em português

### ⚙️ Configurações

- Ativar/desativar perfil privado
- Interface intuitiva para gerenciar preferências

## 🛠 Tecnologias Utilizadas

### Backend

- **Node.js** - Runtime JavaScript
- **Express.js** - Framework web
- **yt-dlp-exec** - Download de legendas do YouTube
- **Axios** - Cliente HTTP
- **Google Gemini AI** - Processamento de letras com IA

### Frontend

- **Vue.js 3** - Framework JavaScript reativo
- **Tailwind CSS** - Framework CSS utilitário
- **Lucide Icons** - Biblioteca de ícones

### Armazenamento

- **JSON Files** - Armazenamento de dados (usuários e covers)

## 📦 Pré-requisitos

Antes de começar, certifique-se de ter instalado:

- **Node.js** (versão 14.0.0 ou superior)
- **npm** (geralmente vem com o Node.js)
- **yt-dlp** instalado no sistema

### Instalando yt-dlp

#### Windows
```bash
# Usando pip
pip install yt-dlp

# Ou usando chocolatey
choco install yt-dlp
```

#### Linux/Mac
```bash
# Usando pip
pip install yt-dlp

# Ou usando brew (Mac)
brew install yt-dlp
```

## 🚀 Instalação

1. **Clone o repositório**
```bash
git clone https://github.com/seu-usuario/webcovers.git
cd webcovers
```

2. **Instale as dependências e inicie o servidor**
```bash
npm run install-and-start
```

Ou, se preferir fazer manualmente:

```bash
# Instalar dependências
npm install

# Iniciar o servidor
npm start
```

O servidor estará rodando em `http://localhost:3001`

## ⚙️ Configuração

### Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto com a seguinte variável:

```env
GEMINI_API_KEY=sua_chave_api_gemini_aqui
```

### Como obter a chave da API do Gemini

1. Acesse o [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Faça login com sua conta Google
3. Crie uma nova API key
4. Copie a chave e cole no arquivo `.env`

**Nota:** A funcionalidade de geração de letras requer a configuração da `GEMINI_API_KEY`. Sem ela, apenas o gerenciamento de covers funcionará.

## 📖 Uso

### Primeiro Acesso

1. Acesse `http://localhost:3001` no seu navegador
2. Crie uma conta clicando em "Cadastrar"
3. Preencha usuário e senha
4. Faça login

### Gerenciando Covers

1. Na aba **"Minha Fila"**, cole o link de um vídeo do YouTube
2. Clique em **"Adicionar"**
3. O cover será adicionado à sua fila
4. Use os botões de seta para reordenar
5. Use o botão de lixeira para remover

### Gerando Letras

1. Acesse a aba **"Letras"**
2. Cole o link do vídeo do YouTube
3. Clique em **"Buscar"**
4. Confirme se o vídeo está correto (verifique a capa e título)
5. Clique em **"Sim, gerar letra"**
6. Aguarde o processamento (pode levar alguns segundos)
7. Visualize a letra gerada
8. Clique em **"Baixar TXT"** para salvar a letra

**Importante:** Apenas vídeos com legendas manuais em português são suportados.

### Configurações de Privacidade

1. Acesse a aba **"Configurações"**
2. Ative/desative o **"Perfil Privado"**
3. Clique em **"Salvar Configurações"**

Quando o perfil está privado, outros usuários não podem ver sua lista de covers.

## 📁 Estrutura do Projeto

```
webcovers/
│
├── public/
│   └── index.html          # Interface frontend (Vue.js)
│
├── server.js               # Servidor Express e rotas da API
├── package.json            # Dependências e scripts
├── .env                    # Variáveis de ambiente (criar)
├── README.md               # Este arquivo
│
├── usuarios.json           # Banco de dados de usuários (gerado automaticamente)
├── covers.json             # Banco de dados de covers (gerado automaticamente)
│
└── LETRA.js                # Código original de referência (não utilizado)
```

## 🔌 API Endpoints

### Autenticação

- `POST /api/cadastrar` - Cadastrar novo usuário
- `POST /api/login` - Fazer login

### Covers

- `GET /api/covers/:usuario` - Obter fila de covers do usuário
- `POST /api/covers` - Adicionar cover à fila
- `DELETE /api/covers/:usuario/:id` - Remover cover
- `POST /api/covers/reordenar` - Reordenar covers na fila

### Usuários

- `GET /api/usuarios` - Listar todos os usuários cadastrados

### Configurações

- `GET /api/configuracoes/:usuario` - Obter configurações do usuário
- `PUT /api/configuracoes/:usuario` - Atualizar configurações

### Letras

- `POST /api/letras/info` - Obter informações do vídeo (capa, título)
- `POST /api/letras/gerar` - Gerar letra do vídeo

## 🤝 Contribuindo

Contribuições são sempre bem-vindas! Sinta-se à vontade para:

1. Fazer um fork do projeto
2. Criar uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abrir um Pull Request

## 📝 Licença

Este projeto está sob a licença ISC. Veja o arquivo `LICENSE` para mais detalhes.

## ⚠️ Avisos Importantes

- **Legendas Automáticas**: O gerador de letras funciona apenas com legendas manuais. Legendas automáticas não são suportadas.
- **Idioma**: Atualmente, apenas legendas em português (pt-BR, pt, por) são suportadas.
- **API Key**: A funcionalidade de geração de letras requer uma chave válida da API do Google Gemini.
- **yt-dlp**: Certifique-se de que o `yt-dlp` está instalado e acessível no PATH do sistema.

## 🐛 Problemas Conhecidos

- Vídeos sem legendas manuais não podem ter suas letras geradas
- A geração de letras pode falhar se a quota da API do Gemini for excedida
- Alguns vídeos podem ter legendas bloqueadas por região

## 📧 Suporte

Se você encontrar algum problema ou tiver dúvidas, abra uma [issue](https://github.com/seu-usuario/webcovers/issues) no GitHub.

---

Desenvolvido com ❤️ usando Vue.js, Express.js e Google Gemini AI

