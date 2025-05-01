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
      let cliente_id;
      const { numero_tarjeta, establecimiento_id, fecha, monto, terminal_id } = data;

      if (numero_tarjeta && !cliente_id) {
        const getClienteIdQuery = `
          SELECT cliente_id 
          FROM tarjetas 
          WHERE numero_tarjeta = $1;
        `;
        
        const clienteResult = await executePgQuery(getClienteIdQuery, [numero_tarjeta]);
        cliente_id = clienteResult[0]?.cliente_id;

        if (!cliente_id) {
          console.log(`No se encontró cliente_id para el número de tarjeta: ${numero_tarjeta}`);
          continue;
        }
      }

      if (!cliente_id) {
        console.log("Falta cliente_id y no se pudo obtener desde numero_tarjeta.");
        continue;
      }

      const insertTransactionQuery = `
        INSERT INTO transacciones (cliente_id, establecimiento_id, fecha, monto, terminal_id)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id;
      `;

      const transactionResult = await executePgQuery(insertTransactionQuery, [cliente_id, establecimiento_id, fecha, monto, terminal_id]);
      const transaccion_id = transactionResult[0]?.id;

      if (!transaccion_id) {
        console.log("No se pudo obtener el id de la transacción.");
        continue;
      }

      console.log("Transacción ID:", transaccion_id);

      const insertPuntosQuery = `
        INSERT INTO puntos (cliente_id, transaccion_id, debe, created_at)
        VALUES ($1, $2, $3, CURRENT_DATE);
      `;

      await executePgQuery(insertPuntosQuery, [cliente_id, transaccion_id, monto]);

      console.log("Puntos insertados para la transacción", transaccion_id);
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