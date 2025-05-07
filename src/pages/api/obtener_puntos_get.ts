import { NextApiRequest, NextApiResponse } from 'next';
import { executePgQuery } from '@/lib/database';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método no permitido. Use POST' });
  }

  try {
    const { cliente_id, numero_tarjeta } = req.body;

    // Registrar los datos recibidos en el cuerpo de la solicitud
    console.log('DATOS RECIBIDOS EN EL CUERPO DE LA SOLICITUD:', req.body);

    // Validar que al menos cliente_id o numero_tarjeta esté presente
    if (!cliente_id && !numero_tarjeta) {
      return res.status(400).json({
        success: false,
        error: 'Debe proporcionar cliente_id o numero_tarjeta en el cuerpo de la solicitud',
      });
    }

    let finalClienteId = cliente_id;

    // Si no hay cliente_id pero hay numero_tarjeta, buscar cliente_id
    if (!cliente_id && numero_tarjeta) {
      const getClienteIdQuery = `
        SELECT cliente_id 
        FROM tarjetas 
        WHERE numero_tarjeta = $1;
      `;
      
      const clienteResult = await executePgQuery(getClienteIdQuery, [numero_tarjeta]);
      finalClienteId = clienteResult[0]?.cliente_id;

      if (!finalClienteId) {
        return res.status(404).json({
          success: false,
          error: `No se encontró cliente_id para el número de tarjeta: ${numero_tarjeta}`,
        });
      }
    }

    const selectQuery = `
      SELECT 
        p.cliente_id, 
        COALESCE(SUM(p.debe), 0) AS total_debe, 
        COALESCE(SUM(p.haber), 0) AS total_haber, 
        COALESCE(SUM(p.debe), 0) - COALESCE(SUM(p.haber), 0) AS diferencia,
        c.nombre AS cliente_nombre,
        p.estado
      FROM puntos p
      LEFT JOIN clientes c ON p.cliente_id = c.id
      WHERE p.cliente_id = $1 and p.estado = true
      GROUP BY p.cliente_id, c.nombre, p.estado;
    `;

    const result = await executePgQuery(selectQuery, [finalClienteId]);

    if (result.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No se encontraron datos para el cliente_id proporcionado',
      });
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