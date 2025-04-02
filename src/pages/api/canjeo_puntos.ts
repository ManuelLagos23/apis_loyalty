import { NextApiRequest, NextApiResponse } from 'next';
import { executePgQuery } from '@/lib/database';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método no permitido. Use POST' });
  }

  try {
    const { dataArray } = req.body;

    console.log("ESTOS SON LOS DATOS DEL ARREGLO: ", dataArray);

    if (!Array.isArray(dataArray) || dataArray.length === 0) {
      return res.status(400).json({ success: false, error: 'El cuerpo de la solicitud debe contener un arreglo de datos.' });
    }

    for (const data of dataArray) {
      const { cliente_id, establecimiento_id, fecha, monto, terminal_id } = data;

    
      const insertTransactionQuery = `
        INSERT INTO canjeados (cliente_id, establecimiento_id, terminal_id, puntos_canjeados, created_at)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id;
      `;

      const transactionResult = await executePgQuery(insertTransactionQuery, [cliente_id, establecimiento_id, terminal_id, monto, fecha ]);
      const canjeados_id = transactionResult[0]?.id;

      if (!canjeados_id) {
        console.log("No se pudo obtener el id de la transacción.");
        continue;
      }

      console.log("Transacción ID:", canjeados_id);

      
      const insertPuntosQuery = `
        INSERT INTO puntos (cliente_id, canjeados_id, haber, created_at)
        VALUES ($1, $2, $3, CURRENT_DATE);
      `;

      await executePgQuery(insertPuntosQuery, [cliente_id, canjeados_id, monto]);

      console.log("Puntos insertados para la transacción", canjeados_id);
    }

    return res.status(200).json({
      success: true,
      message: 'Transacciones y puntos insertados con éxito.',
    });
  } catch (error) {
    console.error('Error en la API:', error);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
}
