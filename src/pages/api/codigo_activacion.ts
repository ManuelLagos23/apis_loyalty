import { NextApiRequest, NextApiResponse } from 'next';
import { executePgQuery } from '@/lib/database';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método no permitido. Use POST' });
  }

  try {
    const { dataArray } = req.body;

    console.log("ESTOS SON LOS DATOS DEL OBJETO: ", dataArray);

    if (!dataArray || Array.isArray(dataArray) || typeof dataArray !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'El cuerpo de la solicitud debe contener un objeto "dataArray".',
      });
    }

    const { codigo_activacion } = dataArray;

    console.log("Código de activación: " + codigo_activacion);

    if (!codigo_activacion || typeof codigo_activacion !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'El campo "codigo_activacion" es obligatorio y debe ser una cadena.',
      });
    }

    if (!/^\d{8}$/.test(codigo_activacion)) {
      return res.status(400).json({
        success: false,
        error: 'El "codigo_activacion" debe ser un número de exactamente 8 dígitos.',
      });
    }

    const queryTerminal = `
      SELECT id, empresa, estacion_servicio, codigo_terminal, nombre_terminal 
      FROM terminales 
      WHERE codigo_activacion = $1;
    `;

    const queryResult = await executePgQuery(queryTerminal, [codigo_activacion]);

    if (queryResult.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No se encontró ninguna terminal con ese código de activación',
      });
    }

    const terminalId = queryResult[0].id;

    const id_activacion = Math.floor(100000 + Math.random() * 900000).toString();

    const updateQuery = `
      UPDATE terminales 
      SET id_activacion = $1, codigo_activacion = NULL 
      WHERE id = $2 
      RETURNING id, empresa, estacion_servicio, codigo_terminal, id_activacion, codigo_activacion;
    `;

    const updateResult = await executePgQuery(updateQuery, [id_activacion, terminalId]);

    if (updateResult.length > 0) {
      return res.status(200).json({
        success: true,
        message: 'Terminal activada con éxito',
        data: updateResult[0],
      });
    } else {
      throw new Error('Error al actualizar los campos id_activacion y codigo_activacion');
    }
  } catch (error) {
    console.error('Error en la API:', error);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
}