import { NextApiRequest, NextApiResponse } from 'next';
import { executePgQuery } from '@/lib/database';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método no permitido. Use POST' });
  }

  try {
    const { dataArray } = req.body;

    // Registrar los datos recibidos en el cuerpo de la solicitud
    console.log('DATOS RECIBIDOS EN EL CUERPO DE LA SOLICITUD:', req.body);

    // Validar que dataArray sea un array y no esté vacío
    if (!Array.isArray(dataArray) || dataArray.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Debe proporcionar un array dataArray no vacío en el cuerpo de la solicitud',
      });
    }

    const results = [];

    for (const item of dataArray) {
      const { vehiculo_id, numero_tarjeta, establecimiento_id } = item;

      // Validar que establecimiento_id esté presente y sea un número
      if (!establecimiento_id || typeof establecimiento_id !== 'number') {
        results.push({
          vehiculo_id: null,
          numero_tarjeta,
          establecimiento_id,
          galones_totales: 0,
          galones_disponibles: 0,
          galones_consumidos: 0,
          tipo_combustible_id: null,
          tipo_combustible_nombre: null,
          precio_combustible: null,
          error: 'Debe proporcionar un establecimiento_id válido',
        });
        continue;
      }

      // Validar que al menos vehiculo_id o numero_tarjeta esté presente
      if ((vehiculo_id === undefined || vehiculo_id === null) && !numero_tarjeta) {
        results.push({
          vehiculo_id: null,
          numero_tarjeta,
          establecimiento_id,
          galones_totales: 0,
          galones_disponibles: 0,
          galones_consumidos: 0,
          tipo_combustible_id: null,
          tipo_combustible_nombre: null,
          precio_combustible: null,
          error: 'Debe proporcionar al menos vehiculo_id o numero_tarjeta',
        });
        continue;
      }

      let finalTarjetaId: number | null = null;
      let finalVehiculoId: number | null = typeof vehiculo_id === 'number' ? vehiculo_id : null;

      // Si no hay vehiculo_id pero hay numero_tarjeta, buscar tarjeta_id y vehiculo_id
      if (!finalVehiculoId && numero_tarjeta) {
        const getTarjetaIdQuery = `
          SELECT id, vehiculo_id 
          FROM tarjetas 
          WHERE numero_tarjeta = $1;
        `;
        
        const tarjetaResult = await executePgQuery(getTarjetaIdQuery, [numero_tarjeta]);
        finalTarjetaId = tarjetaResult[0]?.id;
        finalVehiculoId = tarjetaResult[0]?.vehiculo_id || null;

        if (!finalTarjetaId) {
          results.push({
            vehiculo_id: null,
            numero_tarjeta,
            establecimiento_id,
            galones_totales: 0,
            galones_disponibles: 0,
            galones_consumidos: 0,
            tipo_combustible_id: null,
            tipo_combustible_nombre: null,
            precio_combustible: null,
            error: 'Tarjeta no encontrada',
          });
          continue;
        }
      }

      // Obtener tipo de combustible, ID del vehículo y precio si hay un vehiculo_id válido
      let tipo_combustible_id: number | null = null;
      let tipo_combustible_nombre: string | null = null;
      let precio_combustible: number | null = null;
      let vehiculo_id_obtenido: number | null = null;

      if (finalVehiculoId) {
        const getCombustibleQuery = `
          SELECT v.id AS vehiculo_id, v.tipo_combustible, tc.name AS tipo_combustible_nombre
          FROM vehiculos v
          LEFT JOIN tipo_combustible tc ON v.tipo_combustible = tc.id
          WHERE v.id = $1;
        `;
        
        const combustibleResult = await executePgQuery(getCombustibleQuery, [finalVehiculoId.toString()]);
        if (combustibleResult.length > 0) {
          vehiculo_id_obtenido = combustibleResult[0].vehiculo_id;
          tipo_combustible_id = combustibleResult[0].tipo_combustible;
          tipo_combustible_nombre = combustibleResult[0].tipo_combustible_nombre;

          // Obtener el precio del combustible para el tipo_combustible_id, establecimiento_id y la fecha actual
          if (tipo_combustible_id) {
            const getPrecioQuery = `
              SELECT precio
              FROM precio_venta_combustible
              WHERE tipo_combustible_id = $1
              AND precio_sucursal_ids = $2
              AND CURRENT_DATE BETWEEN fecha_inicio AND fecha_final
              ORDER BY fecha_inicio DESC
              LIMIT 1;
            `;
            const precioResult = await executePgQuery(getPrecioQuery, [
              tipo_combustible_id.toString(),
              establecimiento_id.toString(),
            ]);
            precio_combustible = precioResult[0]?.precio || null;
          }
        }
      }

      const selectQuery = finalTarjetaId
        ? `
          SELECT 
            COALESCE(mf.galones_totales, 0) AS galones_totales,
            COALESCE(mf.galones_disponibles, 0) AS galones_disponibles,
            COALESCE(mf.galones_consumidos, 0) AS galones_consumidos
          FROM monedero_flota mf
          WHERE mf.tarjeta_id = $1
        `
        : `
          SELECT 
            COALESCE(mf.galones_totales, 0) AS galones_totales,
            COALESCE(mf.galones_disponibles, 0) AS galones_disponibles,
            COALESCE(mf.galones_consumidos, 0) AS galones_consumidos
          FROM monedero_flota mf
          WHERE mf.vehiculo_id = $1
        `;

      const result = await executePgQuery(selectQuery, [
        finalTarjetaId ? finalTarjetaId.toString() : finalVehiculoId!.toString(),
      ]);

      if (result.length === 0) {
        results.push({
          vehiculo_id: vehiculo_id_obtenido,
          numero_tarjeta,
          establecimiento_id,
          galones_totales: 0,
          galones_disponibles: 0,
          galones_consumidos: 0,
          tipo_combustible_id,
          tipo_combustible_nombre,
          precio_combustible,
        });
      } else {
        results.push({
          vehiculo_id: vehiculo_id_obtenido,
          numero_tarjeta,
          establecimiento_id,
          galones_totales: result[0].galones_totales,
          galones_disponibles: result[0].galones_disponibles,
          galones_consumidos: result[0].galones_consumidos,
          tipo_combustible_id,
          tipo_combustible_nombre,
          precio_combustible,
        });
      }
    }

    return res.status(200).json({
      success: true,
      data: results,
    });
  } catch (error) {
    console.error('Error en la API:', error);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
}