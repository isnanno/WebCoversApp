// server.js - Sistema de Fila de Covers
const express = require('express');
const fs = require('fs');
const cors = require('cors');
const path = require('path');
const https = require('https');
const axios = require('axios');
const ytdlp = require('yt-dlp-exec');
const os = require('os');
const app = express();
const PORT = 3001; // Porta diferente do projeto principal

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public')); // Serve o site visual

require('dotenv').config();

const USERS_FILE = 'usuarios.json';
const COVERS_FILE = 'covers.json';

// Função auxiliar para ler usuários
const lerUsuarios = () => {
    if (!fs.existsSync(USERS_FILE)) return [];
    const usuarios = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    
    // Migração: adiciona campos padrão para usuários antigos
    return usuarios.map(u => {
        if (u.perfilPrivado === undefined) u.perfilPrivado = false;
        return u;
    });
};

// Função auxiliar para salvar usuários
const salvarUsuarios = (dados) => {
    fs.writeFileSync(USERS_FILE, JSON.stringify(dados, null, 2));
};

// Função auxiliar para ler covers
const lerCovers = () => {
    if (!fs.existsSync(COVERS_FILE)) return {};
    return JSON.parse(fs.readFileSync(COVERS_FILE, 'utf8'));
};

// Função auxiliar para salvar covers
const salvarCovers = (dados) => {
    fs.writeFileSync(COVERS_FILE, JSON.stringify(dados, null, 2));
};

// Função para extrair informações do YouTube
const obterInfoYouTube = (url) => {
    return new Promise((resolve, reject) => {
        // Extrai o ID do vídeo da URL
        const videoIdMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/);
        if (!videoIdMatch) {
            reject(new Error('URL do YouTube inválida'));
            return;
        }
        
        const videoId = videoIdMatch[1];
        const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
        
        https.get(oembedUrl, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const info = JSON.parse(data);
                    resolve({
                        videoId: videoId,
                        titulo: info.title,
                        thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
                        url: url
                    });
                } catch (e) {
                    reject(new Error('Erro ao processar informações do vídeo'));
                }
            });
        }).on('error', (err) => {
            reject(err);
        });
    });
};

// Rota: Cadastrar usuário
app.post('/api/cadastrar', (req, res) => {
    const { usuario, senha } = req.body;
    
    if (!usuario || !senha) {
        console.log('❌ [CADASTRO] Tentativa de cadastro sem usuário ou senha');
        return res.status(400).json({ success: false, message: 'Usuário e senha são obrigatórios' });
    }
    
    const usuarios = lerUsuarios();
    
    // Verifica se o usuário já existe (case-insensitive)
    const usuarioExistente = usuarios.find(u => u.usuario.toLowerCase() === usuario.toLowerCase());
    if (usuarioExistente) {
        console.log(`❌ [CADASTRO] Tentativa de cadastro com nome já existente: ${usuario}`);
        return res.status(400).json({ success: false, message: 'Este nome de usuário já está em uso. Escolha outro nome.' });
    }
    
    // Adiciona novo usuário com configurações padrão
    usuarios.push({ 
        usuario, 
        senha,
        perfilPrivado: false
    });
    salvarUsuarios(usuarios);
    
    console.log(`✅ [CADASTRO] Novo usuário cadastrado: ${usuario}`);
    res.json({ success: true, message: 'Usuário cadastrado com sucesso' });
});

// Rota: Login
app.post('/api/login', (req, res) => {
    const { usuario, senha } = req.body;
    
    if (!usuario || !senha) {
        console.log('❌ [LOGIN] Tentativa de login sem usuário ou senha');
        return res.status(400).json({ success: false, message: 'Usuário e senha são obrigatórios' });
    }
    
    const usuarios = lerUsuarios();
    const usuarioEncontrado = usuarios.find(u => u.usuario === usuario && u.senha === senha);
    
    if (!usuarioEncontrado) {
        console.log(`❌ [LOGIN] Tentativa de login falhou para: ${usuario}`);
        return res.status(401).json({ success: false, message: 'Usuário ou senha incorretos' });
    }
    
    console.log(`✅ [LOGIN] Usuário logado com sucesso: ${usuario}`);
    res.json({ success: true, message: 'Login realizado com sucesso' });
});

// Rota: Listar todos os usuários cadastrados
app.get('/api/usuarios', (req, res) => {
    const usuarioLogado = req.query.usuarioLogado; // Usuário que está fazendo a requisição
    const usuarios = lerUsuarios();
    const covers = lerCovers();
    
    // Retorna apenas os nomes dos usuários e a quantidade de covers de cada um
    // Filtra usuários com perfil privado e remove o próprio usuário logado
    const usuariosComInfo = usuarios
        .filter(u => !u.perfilPrivado && u.usuario !== usuarioLogado) // Remove perfis privados e o próprio usuário
        .map(u => ({
            usuario: u.usuario,
            totalCovers: covers[u.usuario] ? covers[u.usuario].length : 0
        }));
    
    console.log(`📋 [USUÁRIOS] Lista de usuários solicitada por: ${usuarioLogado || 'não logado'} (${usuariosComInfo.length} usuários visíveis)`);
    res.json(usuariosComInfo);
});

// Rota: Obter fila de covers do usuário
app.get('/api/covers/:usuario', (req, res) => {
    const { usuario } = req.params;
    const usuarioSolicitante = req.query.solicitante; // Usuário que está solicitando
    
    const usuarios = lerUsuarios();
    const usuarioEncontrado = usuarios.find(u => u.usuario === usuario);
    
    // Se o perfil é privado e não é o próprio usuário, retorna erro
    if (usuarioEncontrado && usuarioEncontrado.perfilPrivado && usuarioSolicitante !== usuario) {
        return res.status(403).json({ success: false, message: 'Este perfil é privado' });
    }
    
    const covers = lerCovers();
    
    if (!covers[usuario]) {
        covers[usuario] = [];
        salvarCovers(covers);
    }
    
    res.json(covers[usuario] || []);
});

// Rota: Adicionar cover à fila
app.post('/api/covers', async (req, res) => {
    const { usuario, url } = req.body;
    
    if (!usuario || !url) {
        console.log('❌ [COVERS] Tentativa de adicionar cover sem usuário ou URL');
        return res.status(400).json({ success: false, message: 'Usuário e URL são obrigatórios' });
    }
    
    try {
        console.log(`📥 [COVERS] Usuário ${usuario} tentando adicionar cover: ${url}`);
        const infoVideo = await obterInfoYouTube(url);
        const covers = lerCovers();
        
        if (!covers[usuario]) {
            covers[usuario] = [];
        }
        
        // Adiciona o cover no final da fila
        const novoCover = {
            id: Date.now(),
            ...infoVideo,
            dataAdicao: new Date().toISOString()
        };
        
        covers[usuario].push(novoCover);
        salvarCovers(covers);
        
        console.log(`✅ [COVERS] Cover adicionado com sucesso: "${infoVideo.titulo}" por ${usuario}`);
        res.json({ success: true, cover: novoCover });
    } catch (error) {
        console.log(`❌ [COVERS] Erro ao adicionar cover: ${error.message}`);
        res.status(400).json({ success: false, message: error.message });
    }
});

// Rota: Remover cover da fila
app.delete('/api/covers/:usuario/:id', (req, res) => {
    const { usuario, id } = req.params;
    const covers = lerCovers();
    
    if (!covers[usuario]) {
        return res.status(404).json({ success: false, message: 'Usuário não encontrado' });
    }
    
    const index = covers[usuario].findIndex(c => c.id === parseInt(id));
    if (index === -1) {
        return res.status(404).json({ success: false, message: 'Cover não encontrado' });
    }
    
    covers[usuario].splice(index, 1);
    salvarCovers(covers);
    
    res.json({ success: true });
});

// Rota: Reordenar covers (mover para cima/baixo)
app.post('/api/covers/reordenar', (req, res) => {
    const { usuario, id, direcao } = req.body; // direcao: 'up' ou 'down'
    
    const covers = lerCovers();
    if (!covers[usuario]) {
        return res.status(404).json({ success: false, message: 'Usuário não encontrado' });
    }
    
    const index = covers[usuario].findIndex(c => c.id === parseInt(id));
    if (index === -1) {
        return res.status(404).json({ success: false, message: 'Cover não encontrado' });
    }
    
    if (direcao === 'up' && index > 0) {
        [covers[usuario][index], covers[usuario][index - 1]] = [covers[usuario][index - 1], covers[usuario][index]];
    } else if (direcao === 'down' && index < covers[usuario].length - 1) {
        [covers[usuario][index], covers[usuario][index + 1]] = [covers[usuario][index + 1], covers[usuario][index]];
    }
    
    salvarCovers(covers);
    res.json({ success: true });
});

// Rota: Obter configurações do usuário
app.get('/api/configuracoes/:usuario', (req, res) => {
    const { usuario } = req.params;
    const usuarios = lerUsuarios();
    const usuarioEncontrado = usuarios.find(u => u.usuario === usuario);
    
    if (!usuarioEncontrado) {
        return res.status(404).json({ success: false, message: 'Usuário não encontrado' });
    }
    
    res.json({
        success: true,
        perfilPrivado: usuarioEncontrado.perfilPrivado || false
    });
});

// Rota: Atualizar configurações do usuário
app.put('/api/configuracoes/:usuario', (req, res) => {
    const { usuario } = req.params;
    const { perfilPrivado } = req.body;
    
    const usuarios = lerUsuarios();
    const usuarioIndex = usuarios.findIndex(u => u.usuario === usuario);
    
    if (usuarioIndex === -1) {
        return res.status(404).json({ success: false, message: 'Usuário não encontrado' });
    }
    
    // Atualiza apenas os campos fornecidos
    if (perfilPrivado !== undefined) {
        usuarios[usuarioIndex].perfilPrivado = perfilPrivado;
    }
    
    salvarUsuarios(usuarios);
    
    res.json({ 
        success: true, 
        message: 'Configurações atualizadas com sucesso',
        perfilPrivado: usuarios[usuarioIndex].perfilPrivado
    });
});

// Função para pré-processar legenda
function preprocessSubtitle(subtitleText) {
    let processed = subtitleText;
    
    // Remove timestamps do formato VTT (WEBVTT, -->, números de sequência)
    processed = processed.replace(/WEBVTT[\s\S]*?\n\n/g, '');
    processed = processed.replace(/\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[.,]\d{3}/g, '');
    processed = processed.replace(/^\d+\n/gm, '');
    
    // Remove timestamps do formato SRT
    processed = processed.replace(/\d+\n\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[.,]\d{3}\n/g, '');
    
    // Remove linhas vazias excessivas
    processed = processed.replace(/\n{3,}/g, '\n\n');
    
    // Remove tags HTML/VTT
    processed = processed.replace(/<[^>]+>/g, '');
    
    // Limita o tamanho
    const MAX_LENGTH = 100000;
    if (processed.length > MAX_LENGTH) {
        processed = processed.substring(0, MAX_LENGTH) + '\n\n[... texto truncado para economizar tokens ...]';
    }
    
    return processed.trim();
}

// Função para processar letra com Gemini
async function processLyricsWithGemini(subtitleText) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY não configurada. Configure no arquivo .env');
    }
    
    const preprocessedSubtitle = preprocessSubtitle(subtitleText);
    
    try {
        const prompt = `Vou te enviar um arquivo de legenda em texto extraído do YouTube contendo marcações de tempo, quebras de linha estranhas e repetições causadas pelo formato da legenda.

Sua tarefa é:

1. Remover todas as marcações de tempo, números, símbolos ou elementos que não façam parte da letra.

2. Eliminar repetições de frases ou trechos que aparecem por causa da sincronização automática das legendas.

3. Unir as frases e ajustar as quebras de linha para que a letra fique natural.

4. Organizar o resultado como uma letra profissional, com estrofes e refrões bem estruturados.

5. Não criar versos novos — apenas limpar e organizar o conteúdo original.

Depois de aplicar tudo isso, entregue a letra final pronta para uso.

---LEGENDA ORIGINAL---
${preprocessedSubtitle}
---FIM DA LEGENDA---`;

        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
            {
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }]
            },
            {
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );

        if (response.data && response.data.candidates && response.data.candidates[0]) {
            return response.data.candidates[0].content.parts[0].text;
        } else {
            throw new Error('Resposta inválida da API do Gemini');
        }
    } catch (error) {
        if (error.response) {
            if (error.response.status === 429) {
                const errorMessage = error.response.data?.error?.message || '';
                const retryMatch = errorMessage.match(/retry in ([\d.]+)s/i);
                const waitTime = retryMatch ? Math.ceil(parseFloat(retryMatch[1]) * 1000) : 40000;
                
                await new Promise(resolve => setTimeout(resolve, waitTime));
                
                try {
                    const retryResponse = await axios.post(
                        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
                        {
                            contents: [{
                                parts: [{
                                    text: prompt
                                }]
                            }]
                        },
                        {
                            headers: {
                                'Content-Type': 'application/json'
                            }
                        }
                    );
                    
                    if (retryResponse.data && retryResponse.data.candidates && retryResponse.data.candidates[0]) {
                        return retryResponse.data.candidates[0].content.parts[0].text;
                    }
                } catch (retryError) {
                    throw new Error(`Erro na API do Gemini após retry: ${retryError.response?.data?.error?.message || retryError.message}`);
                }
            }
            
            throw new Error(`Erro na API do Gemini: ${error.response.data?.error?.message || error.message}`);
        }
        throw error;
    }
}

// Função para baixar legendas
async function downloadSubtitles(url) {
    return new Promise(async (resolve, reject) => {
        const workdir = __dirname;
        const outputTemplate = path.join(workdir, 'subtitle_%(title)s.%(ext)s');
        const cookiesPath = path.join(workdir, 'cookies.txt');
        const cookiesPathAlt = path.resolve('cookies.txt'); // Caminho alternativo
        
        console.log(`🔍 [LETRAS] Verificando cookies em: ${cookiesPath}`);
        console.log(`🔍 [LETRAS] Caminho alternativo: ${cookiesPathAlt}`);
        console.log(`🔍 [LETRAS] Diretório atual: ${workdir}`);
        
        try {
            const downloadOptions = {
                writeSubs: true,
                writeAutoSubs: false,
                subLangs: 'pt-BR,pt,por',
                skipDownload: true,
                output: outputTemplate,
                restrictFilenames: true,
                // Adiciona opções para contornar problemas de autenticação
                extractorArgs: 'youtube:player_client=android',
                noCheckCertificates: false
            };
            
            // Verifica múltiplos caminhos possíveis para cookies
            let cookiesFile = null;
            if (fs.existsSync(cookiesPath)) {
                cookiesFile = cookiesPath;
                console.log(`✅ [LETRAS] Arquivo de cookies encontrado em: ${cookiesPath}`);
            } else if (fs.existsSync(cookiesPathAlt)) {
                cookiesFile = cookiesPathAlt;
                console.log(`✅ [LETRAS] Arquivo de cookies encontrado em: ${cookiesPathAlt}`);
            } else {
                console.log(`⚠️  [LETRAS] Arquivo cookies.txt não encontrado em nenhum dos caminhos`);
            }
            
            // Se encontrou cookies, usa eles
            if (cookiesFile) {
                downloadOptions.cookies = cookiesFile;
                console.log(`📋 [LETRAS] Usando arquivo de cookies: ${cookiesFile}`);
                
                // Verifica se o arquivo não está vazio
                const stats = fs.statSync(cookiesFile);
                if (stats.size === 0) {
                    console.log(`⚠️  [LETRAS] Arquivo de cookies está vazio!`);
                } else {
                    console.log(`📋 [LETRAS] Tamanho do arquivo de cookies: ${stats.size} bytes`);
                }
            }
            
            // Tenta usar cookies do navegador também como fallback
            const platform = os.platform();
            try {
                if (!cookiesFile) {
                    downloadOptions.cookiesFromBrowser = 'chrome';
                    console.log('📋 [LETRAS] Tentando usar cookies do Chrome automaticamente (fallback)');
                } else {
                    // Mesmo com cookies.txt, tenta usar do navegador também
                    downloadOptions.cookiesFromBrowser = 'chrome';
                    console.log('📋 [LETRAS] Usando cookies do Chrome como complemento');
                }
            } catch (e) {
                console.log('⚠️  [LETRAS] Não foi possível usar cookies do Chrome');
            }
            
            console.log('📥 [LETRAS] Executando yt-dlp...');
            await ytdlp(url, downloadOptions);
            
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const files = fs.readdirSync(workdir)
                .map(f => ({ 
                    name: f, 
                    fullPath: path.join(workdir, f),
                    mtime: fs.statSync(path.join(workdir, f)).mtimeMs 
                }))
                .sort((a, b) => b.mtime - a.mtime);
            
            const now = Date.now();
            const subtitleFiles = files.filter(f => {
                const timeDiff = now - f.mtime;
                const isRecent = timeDiff < 30000; // Aumentado para 30 segundos
                const isSubtitle = /\.(srt|vtt|ass|ttml|lrc)$/i.test(f.name);
                const hasSubtitlePrefix = f.name.startsWith('subtitle_');
                return isRecent && isSubtitle && hasSubtitlePrefix;
            });
            
            if (subtitleFiles.length === 0) {
                console.log('❌ [LETRAS] Nenhum arquivo de legenda encontrado após download');
                reject(new Error('LEGENDAS_MANUAIS_NAO_ENCONTRADAS'));
                return;
            }
            
            const subtitleFile = subtitleFiles[0];
            console.log(`✅ [LETRAS] Arquivo de legenda encontrado: ${subtitleFile.name}`);
            const subtitleContent = fs.readFileSync(subtitleFile.fullPath, 'utf8');
            
            try {
                fs.unlinkSync(subtitleFile.fullPath);
                console.log('🗑️  [LETRAS] Arquivo temporário removido');
            } catch (e) {
                console.error('⚠️  [LETRAS] Erro ao deletar arquivo temporário:', e);
            }
            
            resolve(subtitleContent);
        } catch (error) {
            const errorMessage = (error.message || error.toString() || '').toLowerCase();
            const errorStdout = (error.stdout || '').toLowerCase();
            const errorStderr = (error.stderr || '').toLowerCase();
            const fullError = `${errorMessage} ${errorStdout} ${errorStderr}`;
            
            console.log(`❌ [LETRAS] Erro completo: ${fullError}`);
            
            // Verifica se é erro de autenticação
            if (fullError.includes('sign in') || fullError.includes('bot') || fullError.includes('cookies')) {
                console.log('⚠️  [LETRAS] Erro de autenticação detectado. YouTube pode estar bloqueando.');
                reject(new Error('O YouTube está pedindo autenticação. Tente adicionar um arquivo cookies.txt na raiz do projeto ou use cookies do navegador. Veja o README para mais informações.'));
            } else if (fullError.includes('no subtitles') || 
                fullError.includes('no captions') ||
                fullError.includes('requested subtitle') ||
                fullError.includes('legendas_manuais_nao_encontradas')) {
                reject(new Error('LEGENDAS_MANUAIS_NAO_ENCONTRADAS'));
            } else {
                reject(error);
            }
        }
    });
}

// Rota: Obter informações do vídeo para letras
app.post('/api/letras/info', async (req, res) => {
    const { url } = req.body;
    
    if (!url) {
        console.log('❌ [LETRAS] Tentativa de buscar info sem URL');
        return res.status(400).json({ success: false, message: 'URL é obrigatória' });
    }
    
    try {
        console.log(`🔍 [LETRAS] Buscando informações do vídeo: ${url}`);
        const info = await obterInfoYouTube(url);
        console.log(`✅ [LETRAS] Informações obtidas: "${info.titulo}"`);
        res.json({ success: true, info });
    } catch (error) {
        console.log(`❌ [LETRAS] Erro ao buscar informações: ${error.message}`);
        res.status(400).json({ success: false, message: error.message });
    }
});

// Rota: Gerar letra
app.post('/api/letras/gerar', async (req, res) => {
    const { url } = req.body;
    
    if (!url) {
        console.log('❌ [LETRAS] Tentativa de gerar letra sem URL');
        return res.status(400).json({ success: false, message: 'URL é obrigatória' });
    }
    
    try {
        console.log(`🎵 [LETRAS] Iniciando geração de letra para: ${url}`);
        console.log(`📥 [LETRAS] Baixando legendas...`);
        const subtitleText = await downloadSubtitles(url);
        console.log(`✅ [LETRAS] Legendas baixadas (${subtitleText.length} caracteres)`);
        console.log(`🤖 [LETRAS] Processando com Gemini AI...`);
        const cleanedLyrics = await processLyricsWithGemini(subtitleText);
        console.log(`✅ [LETRAS] Letra gerada com sucesso (${cleanedLyrics.length} caracteres)`);
        res.json({ success: true, letra: cleanedLyrics });
    } catch (error) {
        let message = error.message || 'Erro ao gerar letra';
        if (error.message === 'LEGENDAS_MANUAIS_NAO_ENCONTRADAS') {
            message = 'Este vídeo não possui legendas manuais em português. Apenas legendas manuais são suportadas.';
            console.log(`❌ [LETRAS] ${message}`);
        } else if (error.message && error.message.includes('GEMINI_API_KEY')) {
            message = 'GEMINI_API_KEY não configurada. Configure no arquivo .env';
            console.log(`❌ [LETRAS] ${message}`);
        } else {
            console.log(`❌ [LETRAS] Erro ao gerar letra: ${error.message}`);
        }
        res.status(400).json({ success: false, message });
    }
});

// Função para obter IP público
async function obterIPPublico() {
    try {
        const response = await axios.get('https://api.ipify.org?format=json', { timeout: 5000 });
        return response.data.ip;
    } catch (error) {
        try {
            const response = await axios.get('https://ifconfig.me/ip', { timeout: 5000 });
            return response.data.trim();
        } catch (error2) {
            return null;
        }
    }
}

// Função para obter IP local
function obterIPLocal() {
    const os = require('os');
    const interfaces = os.networkInterfaces();
    
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

// Iniciar o servidor
app.listen(PORT, async () => {
    console.log('\n' + '='.repeat(60));
    console.log('🎵  WEBCOVERS - Sistema de Fila de Covers com Gerador de Letras');
    console.log('='.repeat(60));
    console.log(`\n✅ SERVIDOR INICIADO COM SUCESSO!`);
    console.log(`\n📂 Dados salvos em:`);
    console.log(`   - ${path.resolve(USERS_FILE)}`);
    console.log(`   - ${path.resolve(COVERS_FILE)}`);
    
    const ipLocal = obterIPLocal();
    console.log(`\n🌐 ACESSO LOCAL:`);
    console.log(`   http://localhost:${PORT}`);
    console.log(`   http://${ipLocal}:${PORT}`);
    
    // Tenta obter IP público
    console.log(`\n🔍 Detectando IP público...`);
    const ipPublico = await obterIPPublico();
    
    if (ipPublico) {
        console.log(`\n🌍 ACESSO PÚBLICO (para compartilhar):`);
        console.log(`   http://${ipPublico}:${PORT}`);
        console.log(`\n📋 Link pronto para copiar:`);
        console.log(`   http://${ipPublico}:${PORT}`);
    } else {
        console.log(`\n⚠️  Não foi possível detectar o IP público automaticamente.`);
        console.log(`   Verifique seu IP público manualmente ou configure um domínio.`);
    }
    
    console.log(`\n🔌 Para desligar, pressione CTRL + C`);
    console.log('='.repeat(60) + '\n');
});

