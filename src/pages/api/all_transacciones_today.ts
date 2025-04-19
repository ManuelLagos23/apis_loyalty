import { NextApiRequest, NextApiResponse } from 'next';
import { executePgQuery } from '@/lib/database';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Método no permitido. Use GET' });
  }

  try {
    const queryPagos = `
      SELECT 
        COUNT(id) AS total_pagos, 
        SUM(monto) AS total_puntos_pagados 
      FROM transacciones 
      WHERE DATE(fecha) = CURRENT_DATE;
    `;

    const queryCanjeados = `
      SELECT 
        COUNT(id) AS total_canjeados, 
        SUM(puntos_canjeados) AS total_puntos_canjeados 
      FROM canjeados
      WHERE DATE(created_at) = CURRENT_DATE;
    `;

    const [pagosResult, canjeadosResult] = await Promise.all([
      executePgQuery(queryPagos, []),
      executePgQuery(queryCanjeados, [])
    ]);

    return res.status(200).json({
      success: true,
      data: {
        pagos: pagosResult[0],
        canjeados: canjeadosResult[0]
      }
    });
  } catch (error) {
    console.error('Error en la API:', error);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
}
