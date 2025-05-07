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
        INSERT INTO canjeados (cliente_id, establecimiento_id, terminal_id, puntos_canjeados, created_at, numero_tarjeta, estado)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, estado;
      `;

      const transactionResult = await executePgQuery(insertTransactionQuery, [
        cliente_id,
        establecimiento_id,
        terminal_id,
        monto,
        fecha,
        numero_tarjeta || null,
        true, // Explicitly pass true for estado
      ]);
      const canjeados_id = transactionResult[0]?.id;

      if (!canjeados_id) {
        errors.push(`No se pudo obtener el id de la transacción para el registro: ${JSON.stringify(data)}`);
        console.log("No se pudo obtener el id de la transacción. Resultado:", transactionResult);
        continue;
      }

      console.log("Transacción ID:", canjeados_id, "Estado:", transactionResult[0]?.estado);

      const insertPuntosQuery = `
        INSERT INTO puntos (cliente_id, canjeados_id, haber, created_at, estado)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, estado;
      `;

      const puntosResult = await executePgQuery(insertPuntosQuery, [
        cliente_id,
        canjeados_id,
        monto,
        new Date(), // Use JavaScript Date for consistency
        true, // Explicitly pass true for estado
      ]);

      if (!puntosResult[0]?.id) {
        errors.push(`No se pudo insertar el registro de puntos para canjeados_id: ${canjeados_id}`);
        console.log("No se pudo insertar el registro de puntos. Resultado:", puntosResult);
        continue;
      }

      console.log("Puntos insertados para la transacción", canjeados_id, "Estado:", puntosResult[0]?.estado);
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