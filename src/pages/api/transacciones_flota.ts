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

    const validationErrors: string[] = [];

    // Validación previa para todos los registros
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
        validationErrors.push(`Faltan campos obligatorios en el registro: ${JSON.stringify(data)}`);
        console.log("Faltan campos obligatorios en el registro: ", data);
        continue;
      }

      // Validar que precio sea mayor que 0 para evitar división por cero
      if (typeof precio !== 'number' || precio <= 0) {
        validationErrors.push(`El precio debe ser un número mayor que 0: ${precio}`);
        console.log(`El precio debe ser un número mayor que 0: ${precio}`);
        continue;
      }

      // Validar que numero_tarjeta sea una cadena
      if (typeof numero_tarjeta !== 'string') {
        validationErrors.push(`El número de tarjeta debe ser una cadena: ${JSON.stringify(numero_tarjeta)}`);
        console.log(`El número de tarjeta debe ser una cadena: ${JSON.stringify(numero_tarjeta)}`);
        continue;
      }

      // Validar odometro si está presente
      if (odometro !== null && odometro !== undefined && (typeof odometro !== 'number' || odometro < 0)) {
        validationErrors.push(`El odómetro debe ser un número no negativo: ${odometro}`);
        console.log(`El odómetro debe ser un número no negativo: ${odometro}`);
        continue;
      }

      // Calcular unidades (en litros)
      const unidades = monto / precio;

      // Obtener tarjeta_id desde la tabla tarjetas
      const getTarjetaQuery = `
        SELECT id AS tarjeta_id
        FROM tarjetas
        WHERE numero_tarjeta = $1;
      `;
      
      const tarjetaResult = await executePgQuery(getTarjetaQuery, [numero_tarjeta]);
      const tarjeta_id = tarjetaResult[0]?.tarjeta_id;

      if (!tarjeta_id) {
        validationErrors.push(`No se encontró tarjeta para el número de tarjeta: ${numero_tarjeta}`);
        console.log(`No se encontró tarjeta para el número de tarjeta: ${numero_tarjeta}`);
        continue;
      }

      // Obtener monedero_id, galones_totales, galones_consumidos desde la tabla monedero_flota
      const getMonederoQuery = `
        SELECT id AS monedero_id, vehiculo_id, galones_totales, galones_consumidos
        FROM monedero_flota
        WHERE tarjeta_id = $1;
      `;
      
      const monederoResult = await executePgQuery(getMonederoQuery, [tarjeta_id]);
      const monedero_id = monederoResult[0]?.monedero_id;
      const monedero_vehiculo_id = monederoResult[0]?.vehiculo_id;
      const galones_totales = monederoResult[0]?.galones_totales || 0;
      const galones_consumidos_actual = monederoResult[0]?.galones_consumidos || 0;

      if (!monedero_id) {
        validationErrors.push(`No se encontró monedero para la tarjeta_id: ${tarjeta_id}`);
        console.log(`No se encontró monedero para la tarjeta_id: ${tarjeta_id}`);
        continue;
      }

      // Validar que vehiculo_id coincida con el de monedero_flota
      if (vehiculo_id && monedero_vehiculo_id && vehiculo_id !== monedero_vehiculo_id) {
        validationErrors.push(`El vehiculo_id ${vehiculo_id} no coincide con el vehiculo_id ${monedero_vehiculo_id} en monedero_flota`);
        console.log(`El vehiculo_id ${vehiculo_id} no coincide con el vehiculo_id ${monedero_vehiculo_id} en monedero_flota`);
        continue;
      }

      // Validar que nuevos_galones_consumidos no exceda galones_totales
      if (vehiculo_id) {
        const nuevos_galones_consumidos = galones_consumidos_actual + unidades;
        if (nuevos_galones_consumidos > galones_totales) {
          validationErrors.push(`Los litros consumidos (${nuevos_galones_consumidos}) exceden los litros totales (${galones_totales}) para vehiculo_id ${vehiculo_id}`);
          console.log(`Los litros consumidos (${nuevos_galones_consumidos}) exceden los litros totales (${galones_totales}) para vehiculo_id ${vehiculo_id}`);
        }
      }
    }

    // Si hay errores de validación, abortar sin ejecutar ninguna consulta
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validación fallida. No se ejecutaron consultas debido a errores.',
        errors: validationErrors,
      });
    }

    // Procesar transacciones solo si todas las validaciones pasaron
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

      // Calcular unidades (en litros)
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

      const monederoResult = await executePgQuery(`SELECT id AS monedero_id FROM monedero_flota WHERE tarjeta_id = $1`, [tarjeta_id]);
      const monedero_id = monederoResult[0]?.monedero_id;

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

      // Actualizar galones_consumidos y galones_disponibles en monedero_flota si vehiculo_id está presente
      if (vehiculo_id) {
        const monederoResult = await executePgQuery(`
          SELECT galones_totales, galones_consumidos
          FROM monedero_flota
          WHERE vehiculo_id = $1;
        `, [vehiculo_id]);
        const galones_totales = monederoResult[0]?.galones_totales || 0;
        const galones_consumidos_actual = monederoResult[0]?.galones_consumidos || 0;

        const nuevos_galones_consumidos = galones_consumidos_actual + unidades;
        const galones_disponibles = galones_totales - nuevos_galones_consumidos;

        const updateMonederoQuery = `
          UPDATE monedero_flota
          SET galones_consumidos = $1,
              galones_disponibles = $2
          WHERE vehiculo_id = $3
          RETURNING id;
        `;

        try {
          const updateMonederoResult = await executePgQuery(updateMonederoQuery, [
            nuevos_galones_consumidos,
            galones_disponibles,
            vehiculo_id,
          ]);
          if (!updateMonederoResult[0]?.id) {
            errors.push(`No se encontró monedero para vehiculo_id ${vehiculo_id} al actualizar galones`);
            console.log(`No se encontró monedero para vehiculo_id ${vehiculo_id} al actualizar galones`);
          } else {
            console.log(`Litros actualizados para vehiculo_id ${vehiculo_id}: ` +
                        `consumidos=${nuevos_galones_consumidos}, disponibles=${galones_disponibles}`);
          }
        } catch (updateError) {
          errors.push(`Error al actualizar galones para vehiculo_id ${vehiculo_id}: ${(updateError as Error).message}`);
          console.log(`Error al actualizar galones para vehiculo_id ${vehiculo_id}:`, updateError);
          continue;
        }
      }

      // Actualizar odómetro en la tabla vehiculos si vehiculo_id y odometro están presentes
      if (vehiculo_id && odometro !== null && odometro !== undefined) {
        const updateVehicleOdometerQuery = `
          UPDATE vehiculos
          SET odometro = $1
          WHERE id = $2
          RETURNING id;
        `;
        
        try {
          const updateResult = await executePgQuery(updateVehicleOdometerQuery, [odometro, vehiculo_id]);
          if (!updateResult[0]?.id) {
            errors.push(`No se encontró vehículo con id ${vehiculo_id} para actualizar el odómetro.`);
            console.log(`No se encontró vehículo con id ${vehiculo_id} para actualizar el odómetro.`);
          } else {
            console.log(`Odómetro actualizado para vehículo id ${vehiculo_id}: ${odometro}`);
          }
        } catch (updateError) {
          errors.push(`Error al actualizar el odómetro para vehículo id ${vehiculo_id}: ${(updateError as Error).message}`);
          console.log(`Error al actualizar el odómetro para vehículo id ${vehiculo_id}:`, updateError);
        }
      }

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