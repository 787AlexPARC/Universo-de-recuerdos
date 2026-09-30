import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const { id } = req.query;

    // Validar ID
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'ID requerido' });
    }

    if (id.length > 20 || !/^[A-Za-z0-9]+$/.test(id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    // Buscar en KV
    const data = await kv.get(`memory:${id}`);

    if (!data) {
      return res.status(404).json({
        error: 'Recuerdo no encontrado o expirado'
      });
    }

    return res.status(200).json({
      data,
      found: true
    });

  } catch (error) {
    console.error('Error en /api/get:', error);
    return res.status(500).json({
      error: 'Error interno del servidor'
    });
  }
}