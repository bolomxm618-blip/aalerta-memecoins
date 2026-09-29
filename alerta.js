const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const P = require('pino');
const qrcode = require('qrcode-terminal');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// Configuración de Supabase
const SUPABASE_URL = 'https://ksbwygtikbdcfrkglhmv.supabase.co';
const SUPABASE_KEY = 'sb_secret_n8dxShChEP_W3ilLTuVCnQ_DYfB0sd5';
const BUCKET_NAME = 'whatsapp-session';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const SESSION_DIR = './auth_info_baileys';

const JID_GRUPO = '120363431064407680@g.us';
const TOKENS_YA_REPORTADOS = new Set();

async function downloadSessionFromSupabase() {
    if (!fs.existsSync(SESSION_DIR)) {
        fs.mkdirSync(SESSION_DIR, { recursive: true });
    }

    console.log("📥 Descargando sesión de Supabase...");
    const { data, error } = await supabase.storage.from(BUCKET_NAME).list('', { limit: 100 });

    if (error) {
        console.error('Error al listar archivos de sesión en Supabase:', error);
        return;
    }

    if (data && data.length > 0) {
        for (const file of data) {
            const { data: fileData, error: downloadError } = await supabase.storage
                .from(BUCKET_NAME)
                .download(file.name);

            if (!downloadError && fileData) {
                const buffer = Buffer.from(await fileData.arrayBuffer());
                fs.writeFileSync(path.join(SESSION_DIR, file.name), buffer);
            }
        }
        console.log('✅ Sesión sincronizada desde Supabase con éxito.');
    } else {
        console.log('ℹ️ No hay sesión previa en Supabase. Se requerirá escanear QR.');
    }
}

async function uploadSessionToSupabase() {
    if (!fs.existsSync(SESSION_DIR)) return;

    const files = fs.readdirSync(SESSION_DIR);
    for (const file of files) {
        const filePath = path.join(SESSION_DIR, file);
        if (fs.lstatSync(filePath).isFile()) {
            const fileContent = fs.readFileSync(filePath);
            await supabase.storage
                .from(BUCKET_NAME)
                .upload(file, fileContent, { upsert: true });
        }
    }
    console.log('☁️ Sesión respaldada en Supabase.');
}

async function iniciarBot() {
    await downloadSessionFromSupabase();

    console.log("Iniciando bot con análisis inteligente de memecoins...");
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    
    const sock = makeWASocket({
        auth: state,
        logger: P({ level: 'silent' }),
        printQRInTerminal: false
    });

    sock.ev.on('creds.update', async () => {
        await saveCreds();
        await uploadSessionToSupabase();
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = reason !== DisconnectReason.loggedOut;
            console.log('Conexión cerrada. Reconectando...', shouldReconnect);
            if (shouldReconnect) iniciarBot();
        } else if (connection === 'open') {
            console.log('🟢 ¡Bot conectado y analizando el mercado de Solana sin spam!');
            
            // Revisa el mercado cada 3 minutos para evitar saturar
            setInterval(() => analizarMercadoInteligente(sock), 180000);
            analizarMercadoInteligente(sock);
        }
    });
}

async function analizarMercadoInteligente(sock) {
    try {
        console.log(`[Escáner PRO] Buscando oportunidades con alta tracción en Solana...`);
        
        const respuesta = await fetch('https://api.dexscreener.com/latest/dex/search?q=solana');
        const data = await respuesta.json();

        if (!data || !data.pairs) {
            console.log("No se encontraron datos de la API.");
            return;
        }

        // Filtramos pares de Solana con liquidez mayor a $4,000 para evitar estafas obvias
        const paresSolana = data.pairs.filter(p => p.chainId === 'solana' && p.liquidity && p.liquidity.usd > 4000);

        for (let token of paresSolana) {
            const tokenAddress = token.baseToken.address;

            if (TOKENS_YA_REPORTADOS.has(tokenAddress)) continue;

            const nombre = token.baseToken.symbol;
            const marketCap = token.marketCap || token.fdv || 0;
            const liquidez = token.liquidity.usd;
            const h1Change = token.priceChange?.h1 || 0;
            const h24Volume = token.volume?.h24 || 0;

            // Filtro estratégico: Market Cap entre $20K y $400K (fase óptima de crecimiento antes de los millones)
            if (marketCap >= 20000 && marketCap <= 400000) {
                TOKENS_YA_REPORTADOS.add(tokenAddress);

                // Lógica de análisis de recomendación
                let veredicto = "🔴 RIESGO ALTO / EVITAR";
                let consejoAccion = "Evita comprar por ahora. El volumen de compra es bajo o presenta caídas fuertes.";

                if (h1Change > 15 && liquidez > 8000 && h24Volume > 15000) {
                    veredicto = "🟢 ¡MOMENTO IDEAL PARA ENTRAR!";
                    consejoAccion = "Fuerte tendencia alcista y volumen saludable. Considera entrar con posición pequeña y asegurar ganancias pronto.";
                } else if (h1Change > 5 && liquidez >= 5000) {
                    veredicto = "🟡 BUENA OPORTUNIDAD (ESPERAR DIP)";
                    consejoAccion = "El token muestra estabilidad. Vigila la gráfica por si da un pequeño retroceso para comprar más barato.";
                }

                const reporteCompleto = `
🚨 *ALERTA DE MEMECOIN - ANÁLISIS PRO* 🚨

🪙 *Token:* $${nombre}
📄 *Contrato (CA):* \`${tokenAddress}\`

📊 *Métricas Clave:*
• *Market Cap:* $${(marketCap / 1000).toFixed(1)}K
• *Liquidez en Pool:* $${(liquidez / 1000).toFixed(1)}K
• *Variación (1h):* ${h1Change}%
• *Volumen (24h):* ${h24Volume > 0 ? '$' + (h24Volume / 1000).toFixed(1) + 'K' : 'N/D'}

🤖 *VEREDICTO DEL BOT:*
*${veredicto}*

💡 *Consejo de Operación:*
${consejoAccion}

🔗 *Ver Gráfica en Vivo:*
https://dexscreener.com/solana/${tokenAddress}

_⚠️ Recuerda: Invierte solo dinero que estés dispuesto a perder y gestiona tu propio riesgo._
                `.trim();

                // Enviamos la alerta con la imagen y el reporte completo como pie de foto
                await sock.sendMessage(JID_GRUPO, { 
                    image: { url: 'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?q=80&w=1000&auto=format&fit=crop' }, 
                    caption: reporteCompleto 
                });

                console.log(`📊 Reporte PRO con imagen enviado para: $${nombre}`);
                
                // Mandamos de a 1 análisis por ciclo para no saturar el grupo
                break;
            }
        }

    } catch (error) {
        console.error("Error al ejecutar el análisis inteligente:", error);
    }
}

iniciarBot();