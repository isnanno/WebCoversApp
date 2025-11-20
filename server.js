// server.js - Sistema de Fila de Covers
const express = require('express');
const fs = require('fs');
const cors = require('cors');
const path = require('path');
const https = require('https');
const axios = require('axios');
const ytdlp = require('yt-dlp-exec');
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
        return res.status(400).json({ success: false, message: 'Usuário e senha são obrigatórios' });
    }
    
    const usuarios = lerUsuarios();
    
    // Verifica se o usuário já existe
    if (usuarios.find(u => u.usuario === usuario)) {
        return res.status(400).json({ success: false, message: 'Usuário já existe' });
    }
    
    // Adiciona novo usuário com configurações padrão
    usuarios.push({ 
        usuario, 
        senha,
        perfilPrivado: false
    });
    salvarUsuarios(usuarios);
    
    res.json({ success: true, message: 'Usuário cadastrado com sucesso' });
});

// Rota: Login
app.post('/api/login', (req, res) => {
    const { usuario, senha } = req.body;
    
    if (!usuario || !senha) {
        return res.status(400).json({ success: false, message: 'Usuário e senha são obrigatórios' });
    }
    
    const usuarios = lerUsuarios();
    const usuarioEncontrado = usuarios.find(u => u.usuario === usuario && u.senha === senha);
    
    if (!usuarioEncontrado) {
        return res.status(401).json({ success: false, message: 'Usuário ou senha incorretos' });
    }
    
    res.json({ success: true, message: 'Login realizado com sucesso' });
});

// Rota: Listar todos os usuários cadastrados
app.get('/api/usuarios', (req, res) => {
    const usuarios = lerUsuarios();
    const covers = lerCovers();
    
    // Retorna apenas os nomes dos usuários e a quantidade de covers de cada um
    // Filtra usuários com perfil privado
    const usuariosComInfo = usuarios
        .filter(u => !u.perfilPrivado) // Remove perfis privados
        .map(u => ({
            usuario: u.usuario,
            totalCovers: covers[u.usuario] ? covers[u.usuario].length : 0
        }));
    
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
        return res.status(400).json({ success: false, message: 'Usuário e URL são obrigatórios' });
    }
    
    try {
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
        
        res.json({ success: true, cover: novoCover });
    } catch (error) {
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
        
        try {
            const downloadOptions = {
                writeSubs: true,
                writeAutoSubs: false,
                subLangs: 'pt-BR,pt,por',
                skipDownload: true,
                output: outputTemplate,
                restrictFilenames: true
            };
            
            if (fs.existsSync(cookiesPath)) {
                downloadOptions.cookies = cookiesPath;
            }
            
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
                const isRecent = timeDiff < 15000;
                const isSubtitle = /\.(srt|vtt|ass|ttml|lrc)$/i.test(f.name);
                const hasSubtitlePrefix = f.name.startsWith('subtitle_');
                return isRecent && isSubtitle && hasSubtitlePrefix;
            });
            
            if (subtitleFiles.length === 0) {
                reject(new Error('LEGENDAS_MANUAIS_NAO_ENCONTRADAS'));
                return;
            }
            
            const subtitleFile = subtitleFiles[0];
            const subtitleContent = fs.readFileSync(subtitleFile.fullPath, 'utf8');
            
            try {
                fs.unlinkSync(subtitleFile.fullPath);
            } catch (e) {
                console.error('Erro ao deletar arquivo de legenda temporário:', e);
            }
            
            resolve(subtitleContent);
        } catch (error) {
            const errorMessage = (error.message || error.toString() || '').toLowerCase();
            const errorStdout = (error.stdout || '').toLowerCase();
            const errorStderr = (error.stderr || '').toLowerCase();
            const fullError = `${errorMessage} ${errorStdout} ${errorStderr}`;
            
            if (fullError.includes('no subtitles') || 
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
        return res.status(400).json({ success: false, message: 'URL é obrigatória' });
    }
    
    try {
        const info = await obterInfoYouTube(url);
        res.json({ success: true, info });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

// Rota: Gerar letra
app.post('/api/letras/gerar', async (req, res) => {
    const { url } = req.body;
    
    if (!url) {
        return res.status(400).json({ success: false, message: 'URL é obrigatória' });
    }
    
    try {
        const subtitleText = await downloadSubtitles(url);
        const cleanedLyrics = await processLyricsWithGemini(subtitleText);
        res.json({ success: true, letra: cleanedLyrics });
    } catch (error) {
        let message = error.message || 'Erro ao gerar letra';
        if (error.message === 'LEGENDAS_MANUAIS_NAO_ENCONTRADAS') {
            message = 'Este vídeo não possui legendas manuais em português. Apenas legendas manuais são suportadas.';
        } else if (error.message && error.message.includes('GEMINI_API_KEY')) {
            message = 'GEMINI_API_KEY não configurada. Configure no arquivo .env';
        }
        res.status(400).json({ success: false, message });
    }
});

// Iniciar o servidor
app.listen(PORT, () => {
    console.log(`✅ SERVIDOR DE COVERS RODANDO!`);
    console.log(`📂 Dados salvos em: ${path.resolve(USERS_FILE)} e ${path.resolve(COVERS_FILE)}`);
    console.log(`🌐 Acesse localmente: http://localhost:${PORT}`);
    console.log(`🔌 Para desligar, pressione CTRL + C`);
});

