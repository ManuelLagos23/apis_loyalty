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

    const selectQueryValidos = `
      SELECT 
        COUNT(*) as total_pagos,
        COALESCE(SUM(monto), 0) as monto_total
      FROM transacciones 
      WHERE terminal_id = $1 
      AND estado = true 
      AND DATE(fecha) = CURRENT_DATE;
    `;

    const selectQueryNoValidos = `
      SELECT 
        COUNT(*) as total_pagos,
        COALESCE(SUM(monto), 0) as monto_total
      FROM transacciones 
      WHERE terminal_id = $1 
      AND estado = false 
      AND DATE(fecha) = CURRENT_DATE;
    `;

    const selectQueryCanjeadosValidos = `
      SELECT 
        COUNT(*) as total_canjeados,
        COALESCE(SUM(puntos_canjeados), 0) as monto_total
      FROM canjeados 
      WHERE terminal_id = $1 
      AND estado = true 
      AND DATE(created_at) = CURRENT_DATE;
    `;

    const selectQueryCanjeadosNoValidos = `
      SELECT 
        COUNT(*) as total_canjeados,
        COALESCE(SUM(puntos_canjeados), 0) as monto_total
      FROM canjeados 
      WHERE terminal_id = $1 
      AND estado = false 
      AND DATE(created_at) = CURRENT_DATE;
    `;
    
    const [resultValidos, resultNoValidos, resultCanjeadosValidos, resultCanjeadosNoValidos] = await Promise.all([
      executePgQuery(selectQueryValidos, [terminal_id]),
      executePgQuery(selectQueryNoValidos, [terminal_id]),
      executePgQuery(selectQueryCanjeadosValidos, [terminal_id]),
      executePgQuery(selectQueryCanjeadosNoValidos, [terminal_id])
    ]);

    return res.status(200).json({
      success: true,
      data: {
        pagos_validos: {
          text: 'TOTAL PAGOS VALIDOS',
          total_pagos: Number(resultValidos[0].total_pagos),
          monto_total: Number(resultValidos[0].monto_total)
        },
        pagos_no_validos: {
          text: 'TOTAL PAGOS NO VALIDOS',
          total_pagos: Number(resultNoValidos[0].total_pagos),
          monto_total: Number(resultNoValidos[0].monto_total)
        },
        canjeados_validos: {
          text: 'TOTAL CANJEADOS VALIDOS',
          total_canjeados: Number(resultCanjeadosValidos[0].total_canjeados),
          monto_total: Number(resultCanjeadosValidos[0].monto_total)
        },
        canjeados_no_validos: {
          text: 'TOTAL CANJEADOS NO VALIDOS',
          total_canjeados: Number(resultCanjeadosNoValidos[0].total_canjeados),
          monto_total: Number(resultCanjeadosNoValidos[0].monto_total)
        }
      }
    });
  } catch (error) {
    console.error('Error en la API:', error);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
}