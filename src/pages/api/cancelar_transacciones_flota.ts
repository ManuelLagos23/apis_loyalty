import { NextApiRequest, NextApiResponse } from 'next';
import { executePgQuery } from '@/lib/database';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PUT') {
    return res.status(405).json({ success: false, error: 'Método no permitido. Use PUT' });
  }

  try {
    const { dataArray } = req.body;

    console.log("ESTOS SON LOS DATOS DEL ARREGLO: ", dataArray);

    // Validar que dataArray sea un arreglo y no esté vacío
    if (!Array.isArray(dataArray) || dataArray.length === 0) {
      return res.status(400).json({ success: false, error: 'El cuerpo de la solicitud debe contener un arreglo de datos no vacío' });
    }

    const validationErrors: string[] = [];
    const processedIds: number[] = [];
    const errors: string[] = [];

    // Validación previa para todos los registros
    for (const data of dataArray) {
      const { transaccion_flota_id } = data;

      if (!transaccion_flota_id || typeof transaccion_flota_id !== 'number') {
        validationErrors.push(`El campo transaccion_flota_id es obligatorio y debe ser un número en el registro: ${JSON.stringify(data)}`);
        console.log(`El campo transaccion_flota_id es obligatorio y debe ser un número: ${JSON.stringify(data)}`);
        continue;
      }
    }

    // Si hay errores de validación, abortar
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validación fallida. No se procesaron transacciones debido a errores.',
        errors: validationErrors,
      });
    }

    // Procesar cada transacción
    for (const data of dataArray) {
      const { transaccion_flota_id } = data;

      // Iniciar transacción para este registro
      await executePgQuery('BEGIN', []);

      try {
        // Obtener datos de la transacción antes de actualizar
        const getTransaccionQuery = `
          SELECT id, vehiculo_id, unidades, estado
          FROM transacciones_flota
          WHERE id = $1;
        `;
        const transaccionResult = await executePgQuery(getTransaccionQuery, [transaccion_flota_id.toString()]);

        if (!transaccionResult[0]?.id) {
          await executePgQuery('ROLLBACK', []);
          errors.push(`No se encontró una transacción con transaccion_flota_id: ${transaccion_flota_id}`);
          console.log(`No se encontró una transacción con transaccion_flota_id: ${transaccion_flota_id}`);
          continue;
        }

        const { estado } = transaccionResult[0];

        // Si la transacción ya está cancelada, no hacer nada
        if (!estado) {
          await executePgQuery('COMMIT', []);
          errors.push(`La transacción con transaccion_flota_id: ${transaccion_flota_id} ya está cancelada (estado = false)`);
          console.log(`La transacción con transaccion_flota_id: ${transaccion_flota_id} ya está cancelada (estado = false)`);
          continue;
        }

        const { vehiculo_id, unidades } = transaccionResult[0];

        // Actualizar estado en transacciones_flota
        const updateTransaccionQuery = `
          UPDATE transacciones_flota
          SET estado = $1
          WHERE id = $2
          RETURNING id, estado;
        `;
        const updateTransaccionResult = await executePgQuery(updateTransaccionQuery, ['false', transaccion_flota_id.toString()]);

        if (!updateTransaccionResult[0]?.id) {
          throw new Error(`Error al actualizar el estado de la transacción con transaccion_flota_id: ${transaccion_flota_id}`);
        }

        console.log(`Transacción con transaccion_flota_id: ${transaccion_flota_id} actualizada, estado: ${updateTransaccionResult[0].estado}`);

        // Actualizar odometro en vehiculos si hay vehiculo_id
        if (vehiculo_id) {
          const updateVehiculoQuery = `
            UPDATE vehiculos
            SET odometro = ultimo_odometro
            WHERE id = $1
            RETURNING id, odometro, ultimo_odometro;
          `;
          const updateVehiculoResult = await executePgQuery(updateVehiculoQuery, [vehiculo_id.toString()]);

          if (!updateVehiculoResult[0]?.id) {
            throw new Error(`No se encontró vehículo con id: ${vehiculo_id} para la transacción con transaccion_flota_id: ${transaccion_flota_id}`);
          }

          console.log(`Odómetro actualizado para vehículo id ${vehiculo_id}: ` +
                      `odometro=${updateVehiculoResult[0].odometro}, ultimo_odometro=${updateVehiculoResult[0].ultimo_odometro}`);
        }

        // Actualizar galones_consumidos y galones_disponibles en monedero_flota si hay vehiculo_id
        if (vehiculo_id) {
          const getMonederoQuery = `
            SELECT id, galones_totales, galones_consumidos
            FROM monedero_flota
            WHERE vehiculo_id = $1;
          `;
          const monederoResult = await executePgQuery(getMonederoQuery, [vehiculo_id.toString()]);

          if (!monederoResult[0]?.id) {
            throw new Error(`No se encontró monedero para vehiculo_id: ${vehiculo_id} en la transacción con transaccion_flota_id: ${transaccion_flota_id}`);
          }

          const { galones_totales, galones_consumidos } = monederoResult[0];
          const nuevos_galones_consumidos = Math.max(0, galones_consumidos - unidades);
          const galones_disponibles = galones_totales - nuevos_galones_consumidos;

          const updateMonederoQuery = `
            UPDATE monedero_flota
            SET galones_consumidos = $1,
                galones_disponibles = $2
            WHERE vehiculo_id = $3
            RETURNING id, galones_consumidos, galones_disponibles;
          `;
          const updateMonederoResult = await executePgQuery(updateMonederoQuery, [
            nuevos_galones_consumidos,
            galones_disponibles,
            vehiculo_id.toString(),
          ]);

          if (!updateMonederoResult[0]?.id) {
            throw new Error(`Error al actualizar monedero_flota para vehiculo_id: ${vehiculo_id} en la transacción con transaccion_flota_id: ${transaccion_flota_id}`);
          }

          console.log(`Monedero actualizado para vehiculo_id ${vehiculo_id}: ` +
                      `galones_consumidos=${updateMonederoResult[0].galones_consumidos}, ` +
                      `galones_disponibles=${updateMonederoResult[0].galones_disponibles}`);
        }

        // Confirmar transacción
        await executePgQuery('COMMIT', []);
        processedIds.push(transaccion_flota_id);
      } catch (error) {
        await executePgQuery('ROLLBACK', []);
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push(`Error al procesar transacción con transaccion_flota_id ${transaccion_flota_id}: ${errorMessage}`);
        console.error(`Error al procesar transacción con transaccion_flota_id ${transaccion_flota_id}:`, error);
      }
    }

    // Preparar respuesta
    if (processedIds.length === dataArray.length) {
      return res.status(200).json({
        success: true,
        message: 'Todas las transacciones fueron canceladas con éxito',
        data: {
          processedIds,
        },
      });
    } else if (processedIds.length > 0) {
      return res.status(200).json({
        success: true,
        message: `Se cancelaron ${processedIds.length} de ${dataArray.length} transacciones con éxito`,
        data: {
          processedIds,
        },
        errors,
      });
    } else {
      return res.status(400).json({
        success: false,
        message: 'No se pudo cancelar ninguna transacción',
        errors,
      });
    }
  } catch (error) {
    console.error('Error en la API:', error);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
}