import { NextApiRequest, NextApiResponse } from 'next';
import { executePgQuery } from '@/lib/database';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Método no permitido. Use GET' });
  }

  try {

    const selectQuery = 'SELECT cliente_id, establecimiento_id, fecha, monto, terminal_id FROM transacciones;';
    const result = await executePgQuery(selectQuery, []);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error en la API:', error);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
}
