import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Tus credenciales de Supabase (reemplázalas con tus variables reales o de entorno)
const SUPABASE_URL = 'TU_SUPABASE_URL';
const SUPABASE_KEY = 'TU_SUPABASE_ANON_KEY';
const BUCKET_NAME = 'whatsapp-session';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const SESSION_DIR = './auth_info_baileys';

// Función para descargar la sesión desde Supabase antes de iniciar
export async function downloadSessionFromSupabase() {
    if (!fs.existsSync(SESSION_DIR)) {
        fs.mkdirSync(SESSION_DIR, { recursive: true });
    }

    console. descargando sesión de Supabase...;
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

// Función para subir/actualizar archivos de sesión a Supabase cuando Baileys los modifique
export async function uploadSessionToSupabase() {
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