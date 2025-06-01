import { NextApiRequest, NextApiResponse } from 'next';
import { executePgQuery } from '@/lib/database';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método no permitido. Use POST' });
  }

  try {
    const { terminal_id } = req.body;

    if (!terminal_id || typeof terminal_id !== 'string') {
      return res.status(400).json({ success: false, error: 'El campo terminal_id es obligatorio y debe ser una cadena' });
    }

    const selectQuery = `
      SELECT 
    id, 
    cliente_id, 
    establecimiento_id, 
    fecha, 
    monto, 
    terminal_id 
FROM transacciones 
WHERE 
    terminal_id = $1 
    AND turno_estado = 'open'
    AND estado = true 
       AND fecha >= CURRENT_DATE::timestamp
    AND fecha < (CURRENT_DATE + INTERVAL '1 day')::timestamp;
    `;
    
    const result = await executePgQuery(selectQuery, [terminal_id]);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error en la API:', error);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
}