import { kv } from '@vercel/kv';

// Genera un ID aleatorio corto (7 caracteres) sin ambigüedades
function generateId(length = 7) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let id = '';
  for (let i = 0; i < length; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

// Sanitiza el texto para evitar inyecciones raras
function sanitizeText(text) {
  if (typeof text !== 'string') return '';
  return text.slice(0, 1000).trim();
}

// Valida que sea un data URL de imagen (Base64)
function isValidImageData(dataUrl) {
  if (typeof dataUrl !== 'string') return false;
  if (dataUrl.length === 0) return true; // vacío es válido
  if (dataUrl.length > 300 * 1024) return false; // máximo 300 KB por foto
  return /^data:image\/(jpeg|jpg|png|webp);base64,/.test(dataUrl);
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const { data } = req.body || {};

    // Validar estructura
    if (!data || !Array.isArray(data)) {
      return res.status(400).json({ error: 'Datos inválidos' });
    }

    if (data.length === 0) {
      return res.status(400).json({ error: 'Debe haber al menos un recuerdo' });
    }

    if (data.length > 12) {
      return res.status(400).json({ error: 'Máximo 12 recuerdos permitidos' });
    }

    // Validar cada recuerdo
    const cleanedData = [];
    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      if (typeof item !== 'object' || item === null) {
        return res.status(400).json({ error: `Recuerdo #${i + 1} inválido` });
      }

      const text = sanitizeText(item.text || '');
      const img = item.img || '';

      if (!isValidImageData(img)) {
        return res.status(400).json({
          error: `Imagen #${i + 1} inválida o demasiado grande (máx 300 KB)`
        });
      }

      cleanedData.push({ img, text });
    }

    // Verificar tamaño total (límite Vercel KV: 4 MB por valor)
    const totalSize = JSON.stringify(cleanedData).length;
    const maxSize = 4 * 1024 * 1024; // 4 MB

    if (totalSize > maxSize) {
      return res.status(413).json({
        error: `Los datos pesan ${(totalSize / 1024 / 1024).toFixed(2)} MB. Máximo: 4 MB.`
      });
    }

    // Generar ID único (reintentar hasta 5 veces si colisiona)
    let id;
    let attempts = 0;
    do {
      id = generateId();
      attempts++;
      const exists = await kv.exists(`memory:${id}`);
      if (!exists) break;
    } while (attempts < 5);

    if (attempts >= 5) {
      return res.status(500).json({ error: 'No se pudo generar un ID único' });
    }

    // Guardar en KV con expiración de 1 año (en segundos)
    // Cambia el `ex` si quieres que dure más o menos
    await kv.set(`memory:${id}`, cleanedData, {
      ex: 365 * 24 * 60 * 60  // 1 año
    });

    return res.status(200).json({
      id,
      size: totalSize,
      saved: true
    });

  } catch (error) {
    console.error('Error en /api/save:', error);
    return res.status(500).json({
      error: 'Error interno del servidor',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}