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

    const errors: string[] = [];
    let processedCount = 0;

    for (const data of dataArray) {
      let cliente_id = data.cliente_id;
      const { numero_tarjeta, establecimiento_id, fecha, monto, terminal_id } = data;

      // Validar campos obligatorios
      if (!establecimiento_id || !fecha || !monto || !terminal_id) {
        errors.push(`Faltan campos obligatorios en el registro: ${JSON.stringify(data)}`);
        console.log("Faltan campos obligatorios en el registro: ", data);
        continue;
      }

      // Si no hay cliente_id pero hay numero_tarjeta, buscar cliente_id
      if (!cliente_id && numero_tarjeta) {
        const getClienteIdQuery = `
          SELECT cliente_id 
          FROM tarjetas 
          WHERE numero_tarjeta = $1;
        `;
        
        const clienteResult = await executePgQuery(getClienteIdQuery, [numero_tarjeta]);
        cliente_id = clienteResult[0]?.cliente_id;

        if (!cliente_id) {
          errors.push(`No se encontró cliente_id para el número de tarjeta: ${numero_tarjeta}`);
          console.log(`No se encontró cliente_id para el número de tarjeta: ${numero_tarjeta}`);
          continue;
        }
      }

      // Si no se pudo obtener cliente_id, saltar el registro
      if (!cliente_id) {
        errors.push(`Falta cliente_id y no se pudo obtener desde numero_tarjeta en el registro: ${JSON.stringify(data)}`);
        console.log("Falta cliente_id y no se pudo obtener desde numero_tarjeta.");
        continue;
      }

      const insertTransactionQuery = `
        INSERT INTO transacciones (cliente_id, establecimiento_id, fecha, monto, terminal_id, numero_tarjeta, estado)
        VALUES ($1, $2, $3, $4, $5, $6, true)
        RETURNING id;
      `;

      const transactionResult = await executePgQuery(insertTransactionQuery, [
        cliente_id,
        establecimiento_id,
        fecha,
        monto,
        terminal_id,
        numero_tarjeta || null, // Guardar numero_tarjeta, o NULL si no se proporciona
      ]);
      const transaccion_id = transactionResult[0]?.id;

      if (!transaccion_id) {
        errors.push(`No se pudo obtener el id de la transacción para el registro: ${JSON.stringify(data)}`);
        console.log("No se pudo obtener el id de la transacción.");
        continue;
      }

      console.log("Transacción ID:", transaccion_id);

      const insertPuntosQuery = `
        INSERT INTO puntos (cliente_id, transaccion_id, debe, created_at, estado)
        VALUES ($1, $2, $3, CURRENT_DATE, true);
      `;

      await executePgQuery(insertPuntosQuery, [cliente_id, transaccion_id, monto]);

      console.log("Puntos insertados para la transacción", transaccion_id);
      processedCount++;
    }

    // Preparar la respuesta
    if (processedCount === dataArray.length) {
      return res.status(200).json({
        success: true,
        message: 'Todas las transacciones y puntos insertados con éxito.',
      });
    } else if (processedCount > 0) {
      return res.status(200).json({
        success: true,
        message: `Se procesaron ${processedCount} de ${dataArray.length} transacciones con éxito. Algunos registros fallaron.`,
        errors,
      });
    } else {
      return res.status(400).json({
        success: false,
        message: 'No se pudo procesar ninguna transacción.',
        errors,
      });
    }
  } catch (error) {
    console.error('Error en la API:', error);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
}