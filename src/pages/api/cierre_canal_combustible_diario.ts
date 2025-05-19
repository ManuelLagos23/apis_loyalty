import { NextApiRequest, NextApiResponse } from 'next';
import { executePgQuery } from '@/lib/database';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método no permitido. Use POST' });
  }

  try {
    const { dataArray } = req.body;

    // Validar dataArray
    if (!dataArray || !Array.isArray(dataArray) || dataArray.length === 0) {
      return res.status(400).json({ success: false, error: 'El campo dataArray es obligatorio y debe ser un arreglo no vacío' });
    }

    const { terminal_id, establecimiento_id } = dataArray[0];

    // Validar que los inputs sean números (no cadenas)
    if (terminal_id === undefined || typeof terminal_id !== 'number' || !Number.isInteger(terminal_id)) {
      return res.status(400).json({ success: false, error: 'El campo terminal_id es obligatorio y debe ser un número entero' });
    }
    if (establecimiento_id === undefined || typeof establecimiento_id !== 'number' || !Number.isInteger(establecimiento_id)) {
      return res.status(400).json({ success: false, error: 'El campo establecimiento_id es obligatorio y debe ser un número entero' });
    }

    // Convertir a cadenas para las consultas
    const terminalIdStr = terminal_id.toString();
    const establecimientoIdStr = establecimiento_id.toString();

    // Query 1: Transacciones por canal
    const channelQuery = `
      SELECT 
        c.canal AS nombre_canal,
        t.canal_id AS id_canal,
        SUM(t.monto) AS total_monto,
        SUM(t.descuento) AS total_descuento,
        SUM(t.unidades) AS total_unidades
      FROM transacciones t
      JOIN costos cs ON t.establecimiento_id = cs.id
      JOIN canales c ON t.canal_id = c.id
      WHERE t.terminal_id = $1 AND t.establecimiento_id = $2 AND t.estado = true AND  DATE(fecha AT TIME ZONE 'America/Mexico_City' AT TIME ZONE 'UTC') = CURRENT_DATE
      GROUP BY c.canal, t.canal_id;
    `;

    // Query 2: Transacciones por tipo de combustible
    const fuelTypeQuery = `
     
      SELECT 
        t.tipo_combustible_id,
        tc.name AS tipo_combustible,
        SUM(t.monto) AS total_monto,
        SUM(t.descuento) AS total_descuento,
        SUM(t.unidades) AS total_unidades
      FROM transacciones t
      JOIN costos cs ON t.establecimiento_id = cs.id
      JOIN canales c ON t.canal_id = c.id
      JOIN tipo_combustible tc ON t.tipo_combustible_id = tc.id
      WHERE t.terminal_id = $1 AND t.establecimiento_id = $2 AND t.estado = true and DATE(fecha AT TIME ZONE 'America/Mexico_City' AT TIME ZONE 'UTC') = CURRENT_DATE
      GROUP BY t.tipo_combustible_id, tc.name;
    `;

    // Ejecutar ambas consultas
    const channelResult = await executePgQuery(channelQuery, [terminalIdStr, establecimientoIdStr]);
    const fuelTypeResult = await executePgQuery(fuelTypeQuery, [terminalIdStr, establecimientoIdStr]);

    return res.status(200).json({
      success: true,
      data: {
        byChannel: channelResult,
        byFuelType: fuelTypeResult,
      },
    });
  } catch (error) {
    console.error('Error en la API:', error);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
}