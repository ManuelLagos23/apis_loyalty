import { NextApiRequest, NextApiResponse } from 'next';
import { executePgQuery } from '@/lib/database';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método no permitido. Use POST' });
  }

  try {
    const { dataArray } = req.body;

    // Validate dataArray exists and is an array with at least one object
    if (!dataArray || !Array.isArray(dataArray) || dataArray.length === 0 || typeof dataArray[0] !== 'object') {
      return res.status(400).json({ 
        success: false, 
        error: 'El campo dataArray es obligatorio y debe ser un arreglo que contenga al menos un objeto' 
      });
    }

    const { miembro_id, empresa_id, establecimiento_id, terminal_id, fecha_inicio} = dataArray[0];

    // Validate all required fields
    if (!Number.isInteger(Number(miembro_id)) ||
        !Number.isInteger(Number(empresa_id)) ||
        !Number.isInteger(Number(establecimiento_id)) ||
        !Number.isInteger(Number(terminal_id)) ||
        !fecha_inicio ) {
      return res.status(400).json({ 
        success: false, 
        error: 'Los campos miembro_id, empresa_id, establecimiento_id, terminal_id, fecha_inicio, fecha_final y nombre_empleado son obligatorios' 
      });
    }

    // Validate date formats
    if (isNaN(Date.parse(fecha_inicio)) ) {
      return res.status(400).json({
        success: false,
        error: 'Las fechas deben estar en un formato válido (ISO 8601)'
      });
    }

    const insertQuery = `
      INSERT INTO turnos (
        miembro_id,
        empresa_id,
        establecimiento_id,
        terminal_id,
        fecha_inicio,
   
        estado
      ) VALUES ($1, $2, $3, $4, $5, true)
      RETURNING 
        id,
        miembro_id,
        empresa_id,
        establecimiento_id,
        terminal_id,
        fecha_inicio AT TIME ZONE 'UTC' AT TIME ZONE 'America/Tegucigalpa' AS fecha_inicio,

        estado
    `;

    const result = await executePgQuery(insertQuery, [
      miembro_id,
      empresa_id,
      establecimiento_id,
      terminal_id,
      fecha_inicio
    ]);

    return res.status(200).json({
      success: true,
      data: result[0] // Return the inserted record
    });
  } catch (error) {
    console.error('Error en la API:', error);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
}