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
      const { 
        monto, 
        odometro, 
        created_at, 
        vehiculo_id, 
        numero_tarjeta, 
        tipo_combustible_id, 
        turno_id, 
        establecimiento_id, 
        precio 
      } = data;

      // Validar campos obligatorios
      if (!monto || !created_at || !tipo_combustible_id || !turno_id || !establecimiento_id || !precio || !numero_tarjeta) {
        errors.push(`Faltan campos obligatorios en el registro: ${JSON.stringify(data)}`);
        console.log("Faltan campos obligatorios en el registro: ", data);
        continue;
      }

      // Validar que precio sea mayor que 0 para evitar división por cero
      if (typeof precio !== 'number' || precio <= 0) {
        errors.push(`El precio debe ser un número mayor que 0: ${precio}`);
        console.log(`El precio debe ser un número mayor que 0: ${precio}`);
        continue;
      }

      // Validar que numero_tarjeta sea una cadena
      if (typeof numero_tarjeta !== 'string') {
        errors.push(`El número de tarjeta debe ser una cadena: ${JSON.stringify(numero_tarjeta)}`);
        console.log(`El número de tarjeta debe ser una cadena: ${JSON.stringify(numero_tarjeta)}`);
        continue;
      }

      // Calcular unidades
      const unidades = monto / precio;

      // Obtener tarjeta_id, canal_id, subcanal_id desde la tabla tarjetas
      const getTarjetaQuery = `
        SELECT id AS tarjeta_id, canal_id, subcanal_id
        FROM tarjetas
        WHERE numero_tarjeta = $1;
      `;
      
      const tarjetaResult = await executePgQuery(getTarjetaQuery, [numero_tarjeta]);
      const tarjeta_id = tarjetaResult[0]?.tarjeta_id;
      const canal_id = tarjetaResult[0]?.canal_id;
      const subcanal_id = tarjetaResult[0]?.subcanal_id;

      if (!tarjeta_id) {
        errors.push(`No se encontró tarjeta para el número de tarjeta: ${numero_tarjeta}`);
        console.log(`No se encontró tarjeta para el número de tarjeta: ${numero_tarjeta}`);
        continue;
      }

      // Obtener monedero_id desde la tabla monedero_flota usando tarjeta_id
      const getMonederoQuery = `
        SELECT id AS monedero_id
        FROM monedero_flota
        WHERE tarjeta_id = $1;
      `;
      
      const monederoResult = await executePgQuery(getMonederoQuery, [tarjeta_id]);
      const monedero_id = monederoResult[0]?.monedero_id;

      if (!monedero_id) {
        errors.push(`No se encontró monedero para la tarjeta_id: ${tarjeta_id}`);
        console.log(`No se encontró monedero para la tarjeta_id: ${tarjeta_id}`);
        continue;
      }

      // Insertar transacción
      const insertTransactionQuery = `
        INSERT INTO transacciones_flota (
          monto, 
          odometro, 
          created_at, 
          vehiculo_id, 
          numero_tarjeta, 
          tipo_combustible_id, 
          turno_id, 
          establecimiento_id, 
          precio, 
          unidades, 
          tarjeta_id, 
          monedero_id, 
          canal_id, 
          subcanal_id, 
          turno_estado, 
          estado
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'open', true)
        RETURNING id;
      `;

      const transactionResult = await executePgQuery(insertTransactionQuery, [
        monto,
        odometro || null,
        created_at,
        vehiculo_id || null,
        numero_tarjeta,
        tipo_combustible_id,
        turno_id,
        establecimiento_id,
        precio,
        unidades,
        tarjeta_id,
        monedero_id,
        canal_id || null,
        subcanal_id || null,
      ]);

      const transaccion_id = transactionResult[0]?.id;

      if (!transaccion_id) {
        errors.push(`No se pudo obtener el id de la transacción para el registro: ${JSON.stringify(data)}`);
        console.log("No se pudo obtener el id de la transacción.");
        continue;
      }

      console.log("Transacción ID:", transaccion_id);
      processedCount++;
    }

    // Preparar la respuesta
    if (processedCount === dataArray.length) {
      return res.status(200).json({
        success: true,
        message: 'Todas las transacciones insertadas con éxito.',
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