/**
 * main.js - VERSÃO BAILEYS (Dual Account Support)
 * Migrado para Baileys para melhor desempenho.
 * Adicionado suporte para duas contas Google Photos, selecionáveis pelo Dono.
 * Integração com GoFile para upload automático de imagens e vídeos.
 *
 * Requisitos:
 * npm install @whiskeysockets/baileys qrcode-terminal axios googleapis yt-dlp-exec @google/genai dotenv pino form-data
 *
 * Uso:
 * node main.js
 *
 * Arquivos de credenciais necessários:
 * - credentials.json (para a Conta 1: nannostellar@gmail.com)
 * - credentials2.json (para a Conta 2: bayonettadeveloper@gmail.com)
 *
 * Variáveis de ambiente (opcional):
 * - GOFILE_API_TOKEN: Token da API do GoFile (recomendado para contas premium)
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { exec } = require('child_process');
const { promisify } = require('util');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers, downloadMediaMessage } = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const { google } = require('googleapis');
const ytdlp = require('yt-dlp-exec');
const FormData = require('form-data');
const execAsync = promisify(exec);

require('dotenv').config();
const { GoogleGenAI } = require("@google/genai");

// --------- CONFIGURAÇÃO ---------
const OWNER_NUMBER = "5528981124442";
const QUEEN_NUMBER = "351916364782";
const GOFILE_API_TOKEN = process.env.GOFILE_API_TOKEN || ''; // Token da API do GoFile (opcional, mas recomendado)

let isBusy = false;
let currentUser = null;
const taskQueue = [];
let connectedNumber = null;
let sockInstance = null;
let isReconnecting = false; // Flag para evitar múltiplas reconexões simultâneas

// --- Variável para aguardar a escolha da conta pelo Dono ---
let pendingOwnerChoice = null; // Ex: { number: '5528...', url: 'http://...', targetChatId: '...' }

// --- Caminhos para as duas contas ---
const CREDENTIALS_PATH_1 = path.resolve('credentials.json');
const TOKEN_PATH_1 = path.resolve('token.json');
const CREDENTIALS_PATH_2 = path.resolve('credentials2.json');
const TOKEN_PATH_2 = path.resolve('token2.json');

const SCOPES = ['https://www.googleapis.com/auth/photoslibrary.appendonly'];

// Inicialização do Gemini AI
const genAI = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

// Diretório para armazenar autenticação do Baileys
const authFolder = './auth_info_baileys';

// --------- MENSAGENS (personalidade Arlequina) ---------
const MESSAGES = {
    owner: {
        initial: [
          "Recebido, meu Pudinzinho! 🍮 Vou pegar esse vídeo pra você num piscar de olhos!",
          "Anotado, chefe! Deixa comigo que a caçada começa AGORA! 💥",
          "É pra já, meu amor! Vou buscar seu presentinho, hihi! ♦️",
          "Oba, brinquedo novo! Tô indo pegar, docinho! 😜",
          "Entendido, rei! A caça ao tesouro digital vai começar! 👑"
        ],
        download_done: [
          "Download concluído! Preparando pra enviar pro nosso esconderijo... 🚀",
          "Peguei o vídeo, rei — agora vou colocar no cofre. ✨",
          "Tá na mão, Pudinzinho! Agora a parte divertida: guardar tudo! 😇",
          "Consegui! Pacotinho seguro. Pronta pro próximo passo! 💌",
          "Missão de download: SUCESSO! Enviando pro nosso cantinho. 💖"
        ],
        upload_success: [
          "Missão cumprida, meu Rei! ♦️ O vídeo tá são e salvo na biblioteca!",
          "Tudo certo, Pudinzinho! ✨ O presentinho tá entregue!",
          "Prontinho, amor! Guardado com sucesso no nosso esconderijo secreto! 🤫",
          "Feito! Mais uma preciosidade adicionada à nossa coleção! 💎",
          "Entregue! O tesouro está seguro na nossa base. Te amo! ❤️"
        ],
        upload_failed: [
          "Deu ruim, chefe... não consegui guardar o vídeo. 😭",
          "Fodeu, algo travou na hora do envio. Vou avisar quando resolver.",
          "Puts, meu bem... a entrega falhou. A gente tenta de novo depois? 🥺",
          "Ah, não! O cofre emperrou! Não consegui guardar o vídeo. 😠",
          "Algo deu errado no finalzinho, Pudinzinho. A entrega falhou. 💔"
        ],
        token_invalid: [
          "PÁRA TUDO! 😠 Minha chave mestra do Google parou de funcionar! Tenta de novo, por favor.",
          "Amor, minha licença pra bagunça expirou! Preciso que você renove lá no console.",
          "Pudinzinho, a porta do nosso esconderijo emperrou! Me ajuda a autenticar de novo?",
          "O Google tá de palhaçada! Minha autorização sumiu. Arruma isso pra mim, por favor!",
          "Fomos bloqueados, docinho! O acesso ao Google foi pro espaço. Re-autentica pra mim? 🙏"
        ],
        busy_self: [
          "Calma, apressadinho! Termino um de cada vez, tá? 😉",
          "Ei, ei! Uma coisa de cada vez, meu amor! Assim que eu terminar aqui, pego o próximo!",
          "Segura a onda, Pudinzinho! Já tô ocupada com o seu outro pedido! 🃏",
          "Opa, pera lá! Deixa eu terminar essa bagunça primeiro, depois a gente faz mais! 💥",
          "Tô no meio de uma missão pra você! Assim que acabar, eu começo essa, prometo! 💋"
        ],
        busy_other: [
            "Ah, que pena, meu Rei... A Rainha chegou na frente e tá usando o brinquedo agora. 👑 Aviso assim que ela largar!",
            "Pudinzinho, segura aí! Tô numa missão pra Rainha. Assim que eu terminar, sou toda sua! ♦️",
            "Opa, meu amor! A amiga da onça pediu um favor primeiro. Te chamo quando a pista estiver livre pra você! 😉"
        ],
        on_confirm_sent: [
            "Ok, Pudinzinho! Avisei a Rainha que tô na área. ♦️",
            "Confirmado, chefe! A notificação de 'Voltei!' foi enviada pra ela. 😜",
            "Pode deixar! Mensagem de retorno enviada pra Rainha. Hihi!",
            "Beleza, meu Rei! A parceira de crime dela já foi notificada. 👑",
            "Entendido! A Rainha já sabe que a festa vai recomeçar!"
        ],
        off_confirm_sent: [
            "Beleza, chefe! Mandei a mensagem de despedida pra ela. 🤫",
            "Confirmado, Pudinzinho! A Rainha foi avisada que eu tirei uma folguinha. 💅",
            "Pode deixar! Notifiquei ela que eu dei uma sumida estratégica.",
            "Entendido, meu amor. A mensagem de 'Fui!' já tá com ela. 💋",
            "Ok! A Rainha já sabe que eu saí pra dar um rolê. Te vejo mais tarde!"
        ]
      },
      queen: {
        initial: [
          "Anotado, Rainha! 📝✨ Vou buscar esse tesouro agora. Shhh! 🤫",
          "É pra já, amiga! Tô indo buscar nosso novo segredinho! 💎",
          "Partiu, doidinha! Deixa comigo que eu pego essa belezinha pra nós! 💅",
          "Opa! Fofoca nova? Tô indo buscar o arquivo AGORA! 😂",
          "Entendido, parceira de crime! A operação 'Download Secreto' começou! 👯‍♀️"
        ],
        download_done: [
          "Download pronto! Agora vou mandar pro armário secreto. 👑",
          "Consegui baixar! Segue pro upload, rainha. 💋",
          "Tá na mão, gata! Agora é só esconder a prova do crime! Hihi! 😈",
          "Arquivo capturado, amiga! Preparando para o teletransporte pro nosso cofre!",
          "Missão de download completa! Agora, pra fase de ocultação de provas! ✨"
        ],
        upload_success: [
          "Feito, amiga! Mais um segredinho guardado com sucesso! 👑",
          "A-R-R-A-S-A-M-O-S! Tá tudo guardadinho na sua biblioteca. 💅",
          "Prontinho! Mais um pra nossa coleção de 'coisas que nunca aconteceram'! 😉",
          "Sucesso! O segredo está guardado a sete chaves. Ninguém nunca saberá! 🤫",
          "Tudo nos conformes, parceira! O pacote foi entregue e a área tá limpa! 🕵️‍♀️"
        ],
        upload_failed: [
          "Aff, deu ruim no envio... tenta daqui a pouco?",
          "Falha no upload — desliguei uns feitiços e volto a tentar.",
          "Mana, não rolou! O portal pro nosso esconderijo fechou. Tenta mais tarde!",
          "Que ódio! A entrega falhou. O sistema deve estar de TPM. 🙄",
          "Amiga, deu xabu! Não consegui guardar. Vamos ter que tentar outra tática. 🤯"
        ],
        token_invalid: [
          "Ah não! A autorização do Google expirou. Preciso que você re-autentique no console.",
          "Mana, o feitiço quebrou! A chave do Google pifou. Re-autentica lá pra gente!",
          "A senha do nosso clube secreto expirou! Corre no console e renova pra mim!",
          "Alerta de segurança, gata! O Google nos barrou. Preciso de uma nova autorização sua.",
          "Fomos descobertas! Brincadeira... a autenticação do Google falhou. Arruma lá pra mim!"
        ],
        busy_self: [
            "Calma, sua maluca! Uma coisa de cada vez! Deixa eu terminar esse aqui primeiro! 😂",
            "Eita, pera aí, doidinha! Já tô fazendo mágica aqui! Assim que acabar, eu pego o próximo!",
            "Segura a peruca, mulher! Já tô em outra missão pra você. Logo logo eu pego essa!",
            "Amiga, calma! Tô no meio do seu outro pedido! Termino e já vou, prometo! 👯‍♀️"
        ],
        busy_other: [
            "Ih, amiga... O Pudinzinho tá na minha cola agora. Assim que eu me livrar dele, te dou um toque! 😉",
            "Rainha, segura o tchan! O Chefe pediu um negócio na frente. Assim que eu terminar o serviço dele, te chamo!",
            "Mana, o Rei tá com o brinquedo agora. Te aviso quando a coroa dele cair e eu ficar livre! 👑"
        ],
        notify_on: [
            "Avisa a geral que a mamãe tá de volta! ♦️ A diversão vai recomeçar!",
            "Ei, amiga! Voltei pra ativa! O caos tá liberado de novo! 💥",
            "Adivinha quem voltou? Euzinha! Prepara que a gente vai aprontar!",
            "Tô de volta, parceira! O chefe me soltou da coleira. Hihi! 😜",
            "Voltei, doidinha! Acabou a paz, a bagunça tá garantida! 👯‍♀️"
        ],
        notify_off: [
            "Amiga, o chefe me deu uma folga! Tô saindo pra dar um rolê, volto mais tarde! 💋",
            "Ei, gata! O Pudinzinho me deu passe livre! Indo ali quebrar umas coisas, te ligo depois! 💅",
            "Mana, tô de saidinha! Missão secreta (ou só umas comprinhas, shhh!). 🤫",
            "Fui! O chefe mandou eu tirar umas férias. Não quebre o hospício sem mim! 😂",
            "Dando uma sumida estratégica, parceira! O dever (de ser maluca) me chama em outro lugar. Volto já!"
        ],
      },
};

// --------- HELPERS ---------
function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Formatar JID para número (remove @s.whatsapp.net, @g.us, etc e também remove sufixo do dispositivo como :30)
function jidToNumber(jid) {
  if (!jid) return null;
  let number = jid.split('@')[0];
  // Remove sufixo do dispositivo (ex: :30, :1, etc)
  number = number.split(':')[0];
  return number;
}

// Formatar número para JID (para contatos individuais)
function numberToJid(number) {
  if (!number) return null;
  // Remove caracteres não numéricos
  const cleanNumber = number.replace(/\D/g, '');
  return `${cleanNumber}@s.whatsapp.net`;
}

// --------- GOOGLE AUTH ---------
async function getGoogleClientInteractive(accountChoice = 1) {
    const credsPath = accountChoice === 2 ? CREDENTIALS_PATH_2 : CREDENTIALS_PATH_1;
    const tokenPath = accountChoice === 2 ? TOKEN_PATH_2 : TOKEN_PATH_1;

    if (!fs.existsSync(credsPath)) { 
        console.error(`ERRO: Arquivo de credenciais não encontrado para a Conta ${accountChoice}: ${credsPath}`); 
        return null; 
    }
    const content = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
    const { client_secret, client_id, redirect_uris } = content.installed || content.web;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

    if (fs.existsSync(tokenPath)) { 
        oAuth2Client.setCredentials(JSON.parse(fs.readFileSync(tokenPath, 'utf8'))); 
        return oAuth2Client; 
    }

	const authUrl = oAuth2Client.generateAuthUrl({ access_type: 'offline', scope: SCOPES, prompt: 'consent' });
    console.log(`\n=== AUTENTICAÇÃO GOOGLE NECESSÁRIA (Conta ${accountChoice}) ===\n1) Abra este link:\n`, authUrl, '\n2) Cole o código de autorização aqui.\n');
    
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const code = await new Promise(resolve => rl.question('Código de autorização: ', ans => { rl.close(); resolve(ans.trim()); }));
    
    try {
        const { tokens } = await oAuth2Client.getToken(code);
        oAuth2Client.setCredentials(tokens);
        fs.writeFileSync(tokenPath, JSON.stringify(tokens));
        console.log(`✅ Token da Conta ${accountChoice} salvo em`, tokenPath);
        return oAuth2Client;
    } catch (err) { 
        console.error(`Erro ao obter token para a Conta ${accountChoice}:`, err.message || err); 
        return null; 
    }
}

// --------- DETECÇÃO DE TIPO DE URL ---------
function isPinterestUrl(url) {
    return /pin\.it\/\w+|pinterest\.(com|pt|br)\/pin\//i.test(url);
}

// --------- DOWNLOAD DO VÍDEO (yt-dlp) ---------
function downloadVideo(url) {
    return new Promise(async (resolve, reject) => {
        const workdir = __dirname;
        const outputTemplate = path.join(workdir, '%(title)s.%(ext)s');
        const cookiesPath = path.join(workdir, 'cookies.txt');
        // Formato que garante máximo de 1080p: busca melhor vídeo até 1080p, nunca acima
        const formatString = 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best[height<=1080][ext=mp4]/best[height<=1080]/worst';
        const options = { 
            format: formatString,
            output: outputTemplate, 
            mergeOutputFormat: 'mp4', 
            restrictFilenames: true
        };
        if (fs.existsSync(cookiesPath)) { options.cookies = cookiesPath; console.log('Usando arquivo de cookies:', cookiesPath); }
        try {
            console.log('Iniciando download com yt-dlp-exec...');
            await ytdlp(url, options);
            console.log('Download finalizado pelo yt-dlp-exec.');
            setTimeout(() => {
                const files = fs.readdirSync(workdir).map(f => ({ name: f, mtime: fs.statSync(path.join(workdir, f)).mtimeMs })).sort((a, b) => b.mtime - a.mtime);
                const newestMp4 = files.find(f => /\.mp4$/i.test(f.name));
                if (!newestMp4) { reject(new Error('Nenhum arquivo .mp4 foi encontrado após o download.')); return; }
                const finalPath = path.join(workdir, newestMp4.name);
                resolve({ filePath: finalPath, videoTitle: path.parse(newestMp4.name).name });
            }, 1500);
        } catch (error) { console.error('Erro no yt-dlp-exec:', error); reject(error); }
    });
}

// --------- DOWNLOAD DO PINTEREST (gallery-dl) ---------
function downloadPinterest(url) {
    return new Promise(async (resolve, reject) => {
        const workdir = __dirname;
        const outputDir = path.join(workdir, 'gallery-dl-downloads');
        
        // Cria o diretório de download se não existir
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        try {
            console.log('Iniciando download com gallery-dl...');
            // Executa gallery-dl com output no diretório específico
            const command = `gallery-dl "${url}" -D "${outputDir}"`;
            const { stdout, stderr } = await execAsync(command);
            
            if (stderr && !stderr.includes('Download')) {
                console.warn('Avisos do gallery-dl:', stderr);
            }
            
            console.log('Download finalizado pelo gallery-dl.');
            console.log('Output:', stdout);
            
            // Aguarda um pouco para garantir que os arquivos foram escritos
            setTimeout(() => {
                const files = fs.readdirSync(outputDir)
                    .map(f => ({
                        name: f,
                        fullPath: path.join(outputDir, f),
                        mtime: fs.statSync(path.join(outputDir, f)).mtimeMs
                    }))
                    .sort((a, b) => b.mtime - a.mtime);
                
                // Procura por arquivos de mídia (vídeo ou imagem)
                const mediaExtensions = /\.(mp4|mov|avi|mkv|webm|jpg|jpeg|png|gif|webp)$/i;
                const mediaFiles = files.filter(f => mediaExtensions.test(f.name));
                
                if (mediaFiles.length === 0) {
                    reject(new Error('Nenhum arquivo de mídia foi encontrado após o download do Pinterest.'));
                    return;
                }
                
                // Pega o arquivo mais recente (geralmente o primeiro)
                const newestFile = mediaFiles[0];
                const videoTitle = path.parse(newestFile.name).name;
                
                resolve({
                    filePath: newestFile.fullPath,
                    videoTitle: videoTitle
                });
            }, 2000);
        } catch (error) {
            console.error('Erro no gallery-dl:', error);
            // Verifica se o erro é porque o gallery-dl não está instalado
            if (error.message && error.message.includes('gallery-dl')) {
                reject(new Error('gallery-dl não encontrado. Instale com: pip install gallery-dl'));
            } else {
                reject(error);
            }
        }
    });
}

// --------- DOWNLOAD DE LEGENDAS (yt-dlp) ---------
async function downloadSubtitles(url) {
    return new Promise(async (resolve, reject) => {
        const workdir = __dirname;
        const outputTemplate = path.join(workdir, 'subtitle_%(title)s.%(ext)s');
        const cookiesPath = path.join(workdir, 'cookies.txt');
        
        try {
            console.log('Tentando baixar legendas manuais em PT-BR...');
            
            // Configuração para baixar apenas legendas manuais em PT-BR
            const downloadOptions = {
                writeSubs: true,
                writeAutoSubs: false, // Não baixa legendas automáticas
                subLangs: 'pt-BR,pt,por', // Tenta pt-BR primeiro, depois pt, depois por
                skipDownload: true, // Não baixa o vídeo, apenas as legendas
                output: outputTemplate,
                restrictFilenames: true
            };
            
            if (fs.existsSync(cookiesPath)) {
                downloadOptions.cookies = cookiesPath;
                console.log('Usando arquivo de cookies:', cookiesPath);
            }
            
            await ytdlp(url, downloadOptions);
            console.log('Comando yt-dlp executado. Procurando arquivo de legenda...');
            
            // Aguarda um pouco para garantir que o arquivo foi criado
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Procura pelo arquivo de legenda baixado
            const files = fs.readdirSync(workdir)
                .map(f => ({ 
                    name: f, 
                    fullPath: path.join(workdir, f),
                    mtime: fs.statSync(path.join(workdir, f)).mtimeMs 
                }))
                .sort((a, b) => b.mtime - a.mtime);
            
            // Procura por arquivos de legenda (.srt, .vtt, .ass, .ttml, etc)
            // que começam com 'subtitle_' e foram criados recentemente (últimos 15 segundos)
            const now = Date.now();
            const subtitleFiles = files.filter(f => {
                const timeDiff = now - f.mtime;
                const isRecent = timeDiff < 15000; // Criado nos últimos 15 segundos
                const isSubtitle = /\.(srt|vtt|ass|ttml|lrc)$/i.test(f.name);
                const hasSubtitlePrefix = f.name.startsWith('subtitle_');
                return isRecent && isSubtitle && hasSubtitlePrefix;
            });
            
            if (subtitleFiles.length === 0) {
                reject(new Error('LEGENDAS_MANUAIS_NAO_ENCONTRADAS'));
                return;
            }
            
            // Pega o arquivo mais recente
            const subtitleFile = subtitleFiles[0];
            console.log('Arquivo de legenda encontrado:', subtitleFile.name);
            const subtitleContent = fs.readFileSync(subtitleFile.fullPath, 'utf8');
            
            // Limpa o arquivo temporário
            try {
                fs.unlinkSync(subtitleFile.fullPath);
                console.log('Arquivo de legenda temporário removido.');
            } catch (e) {
                console.error('Erro ao deletar arquivo de legenda temporário:', e);
            }
            
            resolve(subtitleContent);
        } catch (error) {
            console.error('Erro ao baixar legendas:', error);
            
            // Verifica se o erro indica que não há legendas manuais
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
                // Se não conseguir baixar, verifica se é porque não há legendas manuais
                // (o yt-dlp pode não lançar erro, apenas não criar arquivo)
                // Mas se chegou aqui no catch, pode ser outro erro, então repassa
                reject(error);
            }
        }
    });
}

// --------- PRÉ-PROCESSAMENTO DE LEGENDA (ECONOMIZA TOKENS) ---------
function preprocessSubtitle(subtitleText) {
    let processed = subtitleText;
    
    // Remove timestamps do formato VTT (WEBVTT, -->, números de sequência)
    processed = processed.replace(/WEBVTT[\s\S]*?\n\n/g, ''); // Remove cabeçalho WEBVTT
    processed = processed.replace(/\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[.,]\d{3}/g, ''); // Remove timestamps VTT
    processed = processed.replace(/^\d+\n/gm, ''); // Remove números de sequência
    
    // Remove timestamps do formato SRT (números de sequência, timestamps)
    processed = processed.replace(/\d+\n\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[.,]\d{3}\n/g, '');
    
    // Remove linhas vazias excessivas
    processed = processed.replace(/\n{3,}/g, '\n\n');
    
    // Remove tags HTML/VTT
    processed = processed.replace(/<[^>]+>/g, '');
    
    // Limita o tamanho (aproximadamente 100k caracteres = ~40k tokens)
    const MAX_LENGTH = 100000;
    if (processed.length > MAX_LENGTH) {
        processed = processed.substring(0, MAX_LENGTH) + '\n\n[... texto truncado para economizar tokens ...]';
        console.log(`Legenda truncada de ${subtitleText.length} para ${processed.length} caracteres`);
    }
    
    return processed.trim();
}

// --------- PROCESSAMENTO DE LETRA COM GEMINI ---------
async function processLyricsWithGemini(subtitleText) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY não configurada. Configure no arquivo .env');
    }
    
    // Pré-processa a legenda para economizar tokens
    const preprocessedSubtitle = preprocessSubtitle(subtitleText);
    console.log(`Legenda pré-processada: ${subtitleText.length} -> ${preprocessedSubtitle.length} caracteres`);
    
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

        // Usa a API REST do Gemini diretamente com o modelo mais recente
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
            const cleanedLyrics = response.data.candidates[0].content.parts[0].text;
            return cleanedLyrics;
        } else {
            throw new Error('Resposta inválida da API do Gemini');
        }
    } catch (error) {
        console.error('Erro ao processar letra com Gemini:', error);
        if (error.response) {
            console.error('Resposta do servidor:', error.response.data);
            
            // Se for erro 429 (quota excedida), tenta novamente após esperar
            if (error.response.status === 429) {
                const errorMessage = error.response.data?.error?.message || '';
                const retryMatch = errorMessage.match(/retry in ([\d.]+)s/i);
                const waitTime = retryMatch ? Math.ceil(parseFloat(retryMatch[1]) * 1000) : 40000;
                
                console.log(`Quota excedida. Aguardando ${waitTime/1000}s antes de tentar novamente...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                
                // Tenta novamente uma vez
                try {
                    console.log('Tentando novamente após espera...');
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

// --------- DOWNLOAD DE MÍDIA DO WHATSAPP ---------
async function downloadMediaFromWhatsApp(sock, msg) {
    try {
        const message = msg.message;
        let mediaMessage = null;
        let mediaType = null;
        let fileName = null;

        // Detecta tipo de mídia
        if (message.imageMessage) {
            mediaMessage = message.imageMessage;
            mediaType = 'image';
            fileName = mediaMessage.mimetype?.split('/')[1] || 'jpg';
        } else if (message.videoMessage) {
            mediaMessage = message.videoMessage;
            mediaType = 'video';
            fileName = mediaMessage.mimetype?.split('/')[1] || 'mp4';
        } else {
            return null;
        }

        // Gera nome do arquivo
        const timestamp = Date.now();
        const extension = fileName;
        const outputPath = path.join(__dirname, `temp_${timestamp}.${extension}`);

        // Baixa a mídia usando downloadMediaMessage do Baileys
        const buffer = await downloadMediaMessage(
            msg,
            'buffer',
            {},
            { 
                logger: pino({ level: 'silent' }),
                reuploadRequest: sock.updateMediaMessage 
            }
        );

        // Verifica se o buffer foi retornado corretamente
        if (!buffer || !Buffer.isBuffer(buffer)) {
            console.error('Buffer inválido retornado do downloadMediaMessage');
            return null;
        }

        // Salva o arquivo temporariamente
        fs.writeFileSync(outputPath, buffer);

        return {
            filePath: outputPath,
            mediaType: mediaType,
            fileName: `media_${timestamp}.${extension}`
        };
    } catch (error) {
        console.error('Erro ao baixar mídia do WhatsApp:', error);
        return null;
    }
}

// --------- UPLOAD PARA GOFILE ---------
async function uploadToGoFile(filePath, fileName) {
    try {
        const form = new FormData();
        
        form.append('file', fs.createReadStream(filePath), fileName);

        const headers = {
            ...form.getHeaders()
        };

        // Adiciona token de API se disponível
        if (GOFILE_API_TOKEN) {
            headers['Authorization'] = `Bearer ${GOFILE_API_TOKEN}`;
        }

        const response = await axios.post('https://upload.gofile.io/uploadfile', form, {
            headers: headers,
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });

        if (response.data && response.data.status === 'ok') {
            return {
                success: true,
                downloadPage: response.data.data.downloadPage,
                code: response.data.data.code,
                directLink: response.data.data.directLink || response.data.data.downloadPage
            };
        } else {
            console.error('Erro na resposta do GoFile:', response.data);
            return { success: false, error: 'Resposta inválida do GoFile' };
        }
    } catch (error) {
        console.error('Erro ao fazer upload para GoFile:', error.response?.data || error.message);
        return { success: false, error: error.message || 'Erro desconhecido' };
    }
}

// --------- UPLOAD PARA GOOGLE PHOTOS ---------
async function uploadToGooglePhotos(filePath, oAuth2Client, userNumber) {
    try {
        const { token } = await oAuth2Client.getAccessToken();
        if (!token) return "TOKEN_INVALID";
        const uploadUrl = 'https://photoslibrary.googleapis.com/v1/uploads';
        const fileData = fs.readFileSync(filePath);
        const fileName = path.basename(filePath);
        const headersStep1 = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/octet-stream', 'X-Goog-Upload-File-Name': fileName, 'X-Goog-Upload-Protocol': 'raw' };
        const res1 = await axios.post(uploadUrl, fileData, { headers: headersStep1 });
        const uploadToken = res1.data;
        const description = (userNumber === OWNER_NUMBER) ? randomChoice(MESSAGES.owner.upload_success) : randomChoice(MESSAGES.queen.upload_success);
        const createPayload = { newMediaItems: [{ description, simpleMediaItem: { uploadToken } }] };
        const headersStep2 = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
        await axios.post('https://photoslibrary.googleapis.com/v1/mediaItems:batchCreate', createPayload, { headers: headersStep2 });
        return "SUCCESS";
    } catch (err) {
        if (err.response && err.response.status === 401) return "TOKEN_INVALID";
        console.error('Erro no upload Google Photos:', err.message || err);
        return "FAILED";
    }
}

// --------- PROCESSAMENTO DA TAREFA (GERENCIADO) ---------
async function processVideoTask(sock, number, url, accountChoice = 1, targetChatId = null) {
    isBusy = true;
    currentUser = number;
    const chatId = targetChatId || numberToJid(number);
    const isOwner = number === OWNER_NUMBER;
    let downloadResult = null; 

    try {
        // Verifica se o socket ainda está conectado antes de enviar mensagem
        if (!sock || !sock.user) {
            console.error('Socket não está conectado, cancelando tarefa');
            finishTask(sock);
            return;
        }

        try {
            await sock.sendMessage(chatId, { text: randomChoice(isOwner ? MESSAGES.owner.initial : MESSAGES.queen.initial) });
        } catch (sendErr) {
            console.error('Erro ao enviar mensagem inicial (possível perda de conexão):', sendErr.message);
            // Se não conseguir enviar, pode ser que a conexão foi perdida
            finishTask(sock);
            return;
        }
        
        // Detecta se é um link do Pinterest e usa a função apropriada
        try {
            if (isPinterestUrl(url)) {
                console.log('Link do Pinterest detectado, usando gallery-dl...');
                downloadResult = await downloadPinterest(url);
            } else {
                console.log('Link comum detectado, usando yt-dlp...');
                downloadResult = await downloadVideo(url);
            }
        } catch (downloadErr) {
            console.error('Erro durante o download:', downloadErr);
            // Verifica se ainda está conectado antes de enviar mensagem de erro
            if (sock && sock.user) {
                try {
                    await sock.sendMessage(chatId, { text: "Ops! Deu um problema no download. Pode ser que a conexão tenha caído ou o link esteja inválido. 😅" });
                } catch {}
            }
            finishTask(sock);
            return;
        }
        
        // Verifica novamente se está conectado antes de continuar
        if (!sock || !sock.user) {
            console.error('Conexão perdida durante o download, cancelando tarefa');
            finishTask(sock);
            return;
        }

        try {
            await sock.sendMessage(chatId, { text: randomChoice(isOwner ? MESSAGES.owner.download_done : MESSAGES.queen.download_done) });
        } catch (sendErr) {
            console.error('Erro ao enviar mensagem de download concluído:', sendErr.message);
            finishTask(sock);
            return;
        }
        
        const googleClient = await getGoogleClientInteractive(accountChoice); 
        
        if (!googleClient) { 
            if (sock && sock.user) {
                try {
                    await sock.sendMessage(chatId, { text: `Ops! Não consegui as credenciais da Conta ${accountChoice}. Verifique o console.` });
                } catch {}
            }
            finishTask(sock);
            return; 
        }
        
        const uploadResult = await uploadToGooglePhotos(downloadResult.filePath, googleClient, number);

        // Verifica conexão antes de enviar mensagens finais
        if (!sock || !sock.user) {
            console.error('Conexão perdida durante o upload, cancelando tarefa');
            finishTask(sock);
            return;
        }

        if (uploadResult === "SUCCESS") {
            const successMsg = isOwner 
                ? randomChoice(MESSAGES.owner.upload_success) 
                : randomChoice(MESSAGES.queen.upload_success);
            
            const feedbackMsg = isOwner 
                ? `${successMsg} (Conta ${accountChoice})` 
                : successMsg;

            try {
                await sock.sendMessage(chatId, { text: feedbackMsg });

                if (!isOwner) {
                    const notifyMsg = `Psst, Pudinzinho! 🤫 A Rainha acabou de guardar um segredinho novo com o nome: *${downloadResult.videoTitle}* (na Conta 1)`;
                    await sock.sendMessage(numberToJid(OWNER_NUMBER), { text: notifyMsg });
                }
            } catch (sendErr) {
                console.error('Erro ao enviar mensagem de sucesso:', sendErr.message);
            }
        } else if (uploadResult === "TOKEN_INVALID") {
            const tokenPath = accountChoice === 2 ? TOKEN_PATH_2 : TOKEN_PATH_1;
            if (fs.existsSync(tokenPath)) fs.unlinkSync(tokenPath);
            try {
                await sock.sendMessage(chatId, { text: randomChoice(isOwner ? MESSAGES.owner.token_invalid : MESSAGES.queen.token_invalid) });
            } catch (sendErr) {
                console.error('Erro ao enviar mensagem de token inválido:', sendErr.message);
            }
        } else {
            try {
                await sock.sendMessage(chatId, { text: randomChoice(isOwner ? MESSAGES.owner.upload_failed : MESSAGES.queen.upload_failed) });
            } catch (sendErr) {
                console.error('Erro ao enviar mensagem de falha:', sendErr.message);
            }
        }
    } catch (err) {
        console.error('Erro geral no processamento da tarefa:', err);
        // Verifica se é erro de conexão
        if (err.message && (err.message.includes('Connection') || err.message.includes('timeout') || err.message.includes('408'))) {
            console.error('Erro de conexão detectado, resetando estado');
            isBusy = false;
            currentUser = null;
        } else {
            // Tenta enviar mensagem de erro apenas se ainda estiver conectado
            if (sock && sock.user) {
                try {
                    await sock.sendMessage(chatId, { text: "Deu um curto-circuito geral aqui! 😵 Checa o console pra ver o estrago." });
                } catch {}
            }
        }
    } finally {
        if (downloadResult && downloadResult.filePath && fs.existsSync(downloadResult.filePath)) {
            try { 
                // Deleta o arquivo baixado após o upload
                const stats = fs.statSync(downloadResult.filePath);
                if (stats.isFile()) {
                    fs.unlinkSync(downloadResult.filePath);
                    console.log(`Arquivo local deletado: ${downloadResult.filePath}`);
                }
            }
            catch(e) { console.error(`Erro ao deletar arquivo local: ${e}`); }
        }
        finishTask(sock);
    }
}

function finishTask(sock) {
    isBusy = false;
    currentUser = null;
    if (taskQueue.length > 0) {
        const nextTask = taskQueue.shift();
        const nextUserIsOwner = nextTask.number === OWNER_NUMBER;
        const targetChatId = nextTask.targetChatId || numberToJid(nextTask.number);
        const waitingMsg = nextUserIsOwner ? "Ufa! Me livrei da Rainha. Agora sou toda sua, Pudinzinho! ♥️ Começando seu pedido..." : "Finalmente! O Chefe me liberou. Agora vamos ao que interessa, amiga! 🤫";
        sock.sendMessage(targetChatId, { text: waitingMsg });
        processVideoTask(sock, nextTask.number, nextTask.url, nextTask.accountChoice, nextTask.targetChatId);
    }
}

// --------- FUNÇÃO COMPARTILHADA PARA PROCESSAR MENSAGENS ---------
async function handleMessage(sock, msg, isOwnMessage = false) {
  try {
    let number, targetChatId;
    
    if (isOwnMessage) {
      number = connectedNumber || jidToNumber(sock.user?.id);
      targetChatId = msg.key.remoteJid;
    } else {
      if (msg.key.participant) {
        number = jidToNumber(msg.key.participant);
      } else {
        number = jidToNumber(msg.key.remoteJid);
      }
      targetChatId = msg.key.remoteJid;
    }

    if (isOwnMessage && number !== OWNER_NUMBER) {
      return;
    }

    if (!isOwnMessage && number !== OWNER_NUMBER && number !== QUEEN_NUMBER) {
      return;
    }

    const messageText = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
    let text = messageText.trim().toLowerCase();
    const originalText = messageText.trim();
    
    // --- LÓGICA DOS COMANDOS ON/OFF ---
    if (text === '.on' || text === '.off') {
        if (number === OWNER_NUMBER) {
            if (text === '.on') {
                await sock.sendMessage(targetChatId, { text: randomChoice(MESSAGES.owner.on_confirm_sent) });
                await sock.sendMessage(numberToJid(QUEEN_NUMBER), { text: randomChoice(MESSAGES.queen.notify_on) });
            } else {
                await sock.sendMessage(targetChatId, { text: randomChoice(MESSAGES.owner.off_confirm_sent) });
                await sock.sendMessage(numberToJid(QUEEN_NUMBER), { text: randomChoice(MESSAGES.queen.notify_off) });
            }
        }
        return;
    }

    // --- LÓGICA DOS COMANDOS FEMALE/MALE/HENTAI ---
    if (text === '.female' || text === '.male' || text === '.hentai') {
        if (number === OWNER_NUMBER || number === QUEEN_NUMBER) {
            try {
                const charactersPath = path.join(__dirname, 'characters.json');
                if (!fs.existsSync(charactersPath)) {
                    await sock.sendMessage(targetChatId, { text: "Ops! Não encontrei o arquivo de personagens. 😅" });
                    return;
                }
                
                const charactersData = JSON.parse(fs.readFileSync(charactersPath, 'utf8'));
                let category, emoji, categoryName;
                
                if (text === '.hentai') {
                    category = 'hentai';
                    emoji = '🔞';
                    categoryName = 'hentai';
                } else {
                    category = text === '.female' ? 'female' : 'male';
                    emoji = category === 'female' ? '💖' : '💙';
                    categoryName = category === 'female' ? 'feminino' : 'masculino';
                }
                
                const characters = charactersData[category];
                
                if (!characters || characters.length === 0) {
                    await sock.sendMessage(targetChatId, { text: `Não encontrei ${categoryName === 'hentai' ? 'títulos de hentai' : `personagens ${categoryName === 'feminino' ? 'femininos' : 'masculinos'}`} na lista. 😢` });
                    return;
                }
                
                const selectedCharacter = randomChoice(characters);
                const isOwner = number === OWNER_NUMBER;
                
                let message;
                if (text === '.hentai') {
                    message = isOwner 
                        ? `${emoji} *${selectedCharacter}* - Aí está, meu Pudinzinho! Um título quentinho pra você! 😈🔥`
                        : `${emoji} *${selectedCharacter}* - Tá na mão, amiga! Um título picante pra você! 😉💋`;
                } else {
                    message = isOwner 
                        ? `${emoji} *${selectedCharacter}* - Aí está, meu Pudinzinho! Um personagem ${categoryName} lindão pra você! 😘`
                        : `${emoji} *${selectedCharacter}* - Tá na mão, amiga! Um personagem ${categoryName} gostoso pra você! 😉`;
                }
                
                await sock.sendMessage(targetChatId, { text: message });
            } catch (err) {
                console.error('Erro ao processar comando de personagem:', err);
                await sock.sendMessage(targetChatId, { text: "Deu um erro aqui na hora de sortear! 😵" });
            }
        }
        return;
    }

    // --- LÓGICA DO COMANDO .LETRA ---
    if (originalText.toLowerCase().startsWith('.letra ')) {
        if (number === OWNER_NUMBER || number === QUEEN_NUMBER) {
            const isOwner = number === OWNER_NUMBER;
            const urlMatch = originalText.match(/\.letra\s+(.+)/i);
            
            if (!urlMatch || !urlMatch[1]) {
                await sock.sendMessage(targetChatId, { 
                    text: isOwner 
                        ? "Pudinzinho, você precisa mandar o link do YouTube junto com o comando! 😅\nExemplo: `.letra https://youtube.com/watch?v=...`"
                        : "Amiga, precisa mandar o link do YouTube junto! 😅\nExemplo: `.letra https://youtube.com/watch?v=...`"
                });
                return;
            }
            
            const youtubeUrl = urlMatch[1].trim();
            
            // Verifica se é um link válido do YouTube
            if (!/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)/i.test(youtubeUrl)) {
                await sock.sendMessage(targetChatId, { 
                    text: isOwner 
                        ? "Pudinzinho, esse link não é do YouTube! Só funciona com links do YouTube. 😅"
                        : "Amiga, só funciona com links do YouTube! 😅"
                });
                return;
            }
            
            try {
                await sock.sendMessage(targetChatId, { 
                    text: isOwner 
                        ? "Anotado, meu Rei! 👑 Vou buscar a letra desse vídeo agora... ✨"
                        : "Entendido, amiga! 💅 Vou pegar a letra pra você agora... ✨"
                });
                
                // Baixa as legendas
                const subtitleText = await downloadSubtitles(youtubeUrl);
                
                await sock.sendMessage(targetChatId, { 
                    text: isOwner 
                        ? "Legendas baixadas! Agora vou limpar e organizar a letra com o Gemini... 🎵"
                        : "Legendas capturadas! Organizando a letra agora... 🎵"
                });
                
                // Processa a letra com o Gemini
                const cleanedLyrics = await processLyricsWithGemini(subtitleText);
                
                // Envia a letra limpa
                await sock.sendMessage(targetChatId, { 
                    text: isOwner 
                        ? `✨ *Letra limpa e organizada:* ✨\n\n${cleanedLyrics}\n\nPronto, meu Pudinzinho! 💖`
                        : `✨ *Letra limpa e organizada:* ✨\n\n${cleanedLyrics}\n\nTá na mão, amiga! 💋`
                });
                
            } catch (error) {
                console.error('Erro ao processar comando .letra:', error);
                
                let errorMessage;
                if (error.message === 'LEGENDAS_MANUAIS_NAO_ENCONTRADAS') {
                    errorMessage = isOwner 
                        ? "Pudinzinho, esse vídeo não tem legendas manuais em português! 😢\nSó consigo trabalhar com legendas manuais (não automáticas). Tenta outro vídeo?"
                        : "Amiga, esse vídeo não tem legendas manuais em PT-BR! 😢\nPreciso de legendas manuais pra funcionar. Tenta outro vídeo?";
                } else if (error.message && error.message.includes('GEMINI_API_KEY')) {
                    errorMessage = isOwner 
                        ? "Pudinzinho, a chave da API do Gemini não está configurada! Configure a GEMINI_API_KEY no arquivo .env"
                        : "Amiga, falta configurar a chave do Gemini! Configure a GEMINI_API_KEY no .env";
                } else {
                    errorMessage = isOwner 
                        ? `Ops, deu um erro aqui, meu Rei! 😅\nErro: ${error.message || 'Desconhecido'}`
                        : `Ih, deu xabu, amiga! 😅\nErro: ${error.message || 'Desconhecido'}`;
                }
                
                await sock.sendMessage(targetChatId, { text: errorMessage });
            }
        }
        return;
    }

    // --- LÓGICA PARA PROCESSAR A ESCOLHA DA CONTA PELO DONO ---
    if (pendingOwnerChoice && ['1', '2'].includes(text)) {
        const choice = parseInt(text, 10);
        const urlToProcess = pendingOwnerChoice.url;
        const storedTargetChatId = pendingOwnerChoice.targetChatId;
        
        pendingOwnerChoice = null; 

        await sock.sendMessage(targetChatId, { text: `Entendido, meu Rei! Usando a Conta ${choice} pra guardar seu presentinho. 💎` });

        if (isBusy) {
            taskQueue.push({ number, url: urlToProcess, accountChoice: choice, targetChatId: storedTargetChatId });
            await sock.sendMessage(targetChatId, { text: "Aliás... já tem gente na fila de espera. Quando for sua vez, eu começo!" });
        } else {
            processVideoTask(sock, number, urlToProcess, choice, storedTargetChatId);
        }
        return;
    }
    
    // --- LÓGICA DE PROCESSAMENTO DE IMAGENS E VÍDEOS (MÍDIA DIRETA) ---
    const hasImage = msg.message?.imageMessage;
    const hasVideo = msg.message?.videoMessage;
    
    if ((hasImage || hasVideo) && (number === OWNER_NUMBER || number === QUEEN_NUMBER)) {
        const isOwner = number === OWNER_NUMBER;
        const mediaType = hasImage ? 'imagem' : 'vídeo';
        
        try {
            await sock.sendMessage(targetChatId, { 
                text: isOwner 
                    ? `Oba! Recebi uma ${mediaType} sua, meu Rei! 👑 Vou enviar pro GoFile agora mesmo! 💎`
                    : `Ei, amiga! Peguei sua ${mediaType}! 📸 Vou mandar pro GoFile pra você! ✨`
            });

            // Baixa a mídia
            const mediaData = await downloadMediaFromWhatsApp(sock, msg);
            
            if (!mediaData) {
                await sock.sendMessage(targetChatId, { 
                    text: isOwner 
                        ? "Ops, Pudinzinho! Não consegui baixar a mídia. 😭"
                        : "Aff, deu ruim! Não consegui pegar a mídia. 😅"
                });
                return;
            }

            await sock.sendMessage(targetChatId, { 
                text: isOwner 
                    ? "Mídia baixada! Fazendo upload pro GoFile agora... 🚀"
                    : "Download pronto! Enviando pro GoFile... 💅"
            });

            // Faz upload para GoFile
            const uploadResult = await uploadToGoFile(mediaData.filePath, mediaData.fileName);

            // Limpa arquivo temporário
            if (fs.existsSync(mediaData.filePath)) {
                try {
                    fs.unlinkSync(mediaData.filePath);
                } catch (e) {
                    console.error('Erro ao deletar arquivo temporário:', e);
                }
            }

            if (uploadResult.success) {
                const linkMessage = isOwner
                    ? `Pronto, meu Rei! 👑\n\n🔗 Link do GoFile:\n${uploadResult.downloadPage}\n\nAproveite seu presentinho! 💎`
                    : `Tá na mão, amiga! 👑\n\n🔗 Link do GoFile:\n${uploadResult.downloadPage}\n\nGuarde bem esse segredinho! 🤫`;

                await sock.sendMessage(targetChatId, { text: linkMessage });
            } else {
                await sock.sendMessage(targetChatId, { 
                    text: isOwner 
                        ? `Deu ruim no upload, Pudinzinho! 😭\nErro: ${uploadResult.error || 'Desconhecido'}`
                        : `Aff, não rolou o upload! 😅\nErro: ${uploadResult.error || 'Desconhecido'}`
                });
            }
        } catch (error) {
            console.error('Erro ao processar mídia:', error);
            await sock.sendMessage(targetChatId, { 
                text: isOwner 
                    ? "Deu um curto-circuito aqui, meu Rei! 😵 Checa o console."
                    : "Ih, deu xabu, amiga! 😂 Checa o console."
            });
        }
        return;
    }
    
    // --- LÓGICA DE PROCESSAMENTO DE LINKS (HTTP) ---
    if (originalText.startsWith('http')) {
        const originalUrl = originalText;
        const correctedUrl = originalUrl.replace(/xvideos\.red/i, 'xvideos.com');
        const isOwner = number === OWNER_NUMBER;

        if (isBusy) {
            if (number === currentUser) {
                await sock.sendMessage(targetChatId, { text: randomChoice(isOwner ? MESSAGES.owner.busy_self : MESSAGES.queen.busy_self) });
            } else {
                await sock.sendMessage(targetChatId, { text: randomChoice(isOwner ? MESSAGES.owner.busy_other : MESSAGES.queen.busy_other) });
                if (isOwner) {
                    taskQueue.push({ number, url: correctedUrl, accountChoice: null, targetChatId });
                } else {
                    taskQueue.push({ number, url: correctedUrl, accountChoice: 1, targetChatId });
                }
            }
        } else {
            if (isOwner) {
                pendingOwnerChoice = { number, url: correctedUrl, targetChatId };
                await sock.sendMessage(targetChatId, { text: 'Para qual conta, Pudinzinho? 🍮\n\n*1*: nannostellar@gmail.com\n*2*: bayonettadeveloper@gmail.com' });
            } else {
                processVideoTask(sock, number, correctedUrl, 1, targetChatId);
            }
        }
    }
  } catch (err) {
    console.error(`Erro no processamento de mensagem:`, err);
  }
}

// --------- INICIALIZAÇÃO DO BAILEYS ---------
async function startSock() {
    // Evita múltiplas tentativas de reconexão simultâneas
    if (isReconnecting) {
        console.log('Reconexão já em andamento, ignorando nova tentativa...');
        return null;
    }
    
    isReconnecting = true;
    
    try {
        const { state, saveCreds } = await useMultiFileAuthState(authFolder);
        const { version } = await fetchLatestBaileysVersion();
        
        const sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false,
            auth: state,
            browser: Browsers.macOS('Desktop'),
            generateHighQualityLinkPreview: true,
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                console.clear();
                console.log('📱 Escaneie o QR code abaixo com o WhatsApp:');
                qrcode.generate(qr, { small: true });
            }
            
            if (connection === 'close') {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                console.log('Conexão fechada devido a ', lastDisconnect?.error, ', reconectando ', shouldReconnect);
                
                // Reseta o estado quando a conexão é perdida
                isBusy = false;
                currentUser = null;
                pendingOwnerChoice = null;
                console.log('Estado interno resetado devido à perda de conexão');
                
                if (shouldReconnect) {
                    // Aguarda um pouco antes de reconectar
                    setTimeout(() => {
                        console.log('Tentando reconectar...');
                        isReconnecting = false; // Reset flag antes de tentar reconectar
                        startSock();
                    }, 3000);
                } else {
                    isReconnecting = false;
                }
            } else if (connection === 'open') {
                isReconnecting = false; // Reset flag quando conecta com sucesso
                console.log('🤖 Bot da Arlequina conectado e pronto pra bagunça!');
                const jid = sock.user?.id;
                if (jid) {
                    connectedNumber = jidToNumber(jid);
                    sockInstance = sock;
                    console.log(`📱 Número conectado: ${connectedNumber}`);
                }
            }
        });

        // Handler para mensagens (recebidas e enviadas)
        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify') return;
            
            for (const msg of messages) {
                const isOwnMessage = msg.key.fromMe || false;
                await handleMessage(sock, msg, isOwnMessage);
            }
        });

        return sock;
    } catch (err) {
        console.error('Erro ao iniciar socket:', err);
        isReconnecting = false; // Reset flag em caso de erro
        // Tenta reconectar após 5 segundos
        setTimeout(() => {
            console.log('Tentando reconectar após erro...');
            startSock();
        }, 5000);
        return null;
    }
}

// Inicia o bot
startSock().catch(err => {
    console.error('Erro ao iniciar o bot:', err);
    isReconnecting = false;
    process.exit(1);
});
