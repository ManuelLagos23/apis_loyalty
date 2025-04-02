import { NextApiRequest, NextApiResponse } from 'next';
import { executePgQuery } from '@/lib/database';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Método no permitido. Use POST' });
  }

  try {
    
    const { cliente_id } = req.body;

    if (!cliente_id) {
      return res.status(400).json({ success: false, error: 'Falta el cliente_id en el cuerpo de la solicitud' });
    }

    
    const selectQuery = `
      SELECT 
        cliente_id, 
        SUM(debe) AS total_debe, 
        SUM(haber) AS total_haber, 
        SUM(debe) - SUM(haber) AS diferencia 
      FROM puntos 
      WHERE cliente_id = $1 
      GROUP BY cliente_id;
    `;

   
    const result = await executePgQuery(selectQuery, [cliente_id]);

    
    if (result.length === 0) {
      return res.status(404).json({ success: false, error: 'No se encontraron datos para el cliente_id proporcionado' });
    }

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error en la API:', error);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
}
