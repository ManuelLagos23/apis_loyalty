import { NextApiRequest, NextApiResponse } from 'next';
import { executePgQuery } from '@/lib/database';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PUT') {
    return res.status(405).json({ success: false, error: 'Método no permitido. Use PUT' });
  }

  try {
    const { id } = req.body;

    // Validar entrada
    if (!id || typeof id !== 'number') {
      return res.status(400).json({ success: false, error: 'El campo id es obligatorio y debe ser un número' });
    }


    const updateCanjeadosQuery = `
      UPDATE canjeados
      SET estado = $1
      WHERE id = $2
      RETURNING id, estado;
    `;
    const canjeadosResult = await executePgQuery(updateCanjeadosQuery, ['false', id.toString()]);

    if (!canjeadosResult[0]?.id) {
      return res.status(404).json({ success: false, error: `No se encontró un registro en canjeados con id: ${id}` });
    }

    console.log(`Canjeados ID: ${id} actualizado, Estado: ${canjeadosResult[0].estado}`);

 
    const updatePuntosQuery = `
      UPDATE puntos
      SET estado = $1
      WHERE canjeados_id = $2
      RETURNING id, estado;
    `;
    const puntosResult = await executePgQuery(updatePuntosQuery, ['false', id.toString()]);

    console.log(`Puntos actualizados para canjeados_id: ${id}, Filas afectadas: ${puntosResult.length}`);

    // Preparar respuesta
    return res.status(200).json({
      success: true,
      message: 'Estado actualizado con éxito en canjeados y puntos',
      data: {
        canjeados: canjeadosResult[0],
        puntos: puntosResult,
      },
    });
  } catch (error) {
    console.error('Error en la API:', error);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
}