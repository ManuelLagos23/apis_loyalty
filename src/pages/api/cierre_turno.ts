import { NextApiRequest, NextApiResponse } from 'next';
import { executePgQuery } from '@/lib/database';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método no permitido. Use POST' });
  }

  try {
    console.log('Raw request body:', JSON.stringify(req.body, null, 2));

    const { dataArray } = req.body;

    // Validate dataArray exists and is an array with at least one element
    if (!dataArray || !Array.isArray(dataArray) || dataArray.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'El campo dataArray es obligatorio y debe ser un arreglo con al menos un elemento' 
      });
    }

    // Validate the first element is an object
    if (!dataArray[0] || typeof dataArray[0] !== 'object' || dataArray[0] === null) {
      return res.status(400).json({ 
        success: false, 
        error: 'El primer elemento de dataArray debe ser un objeto válido' 
      });
    }

    const { turno_id, fecha_final } = dataArray[0];
    

    // Validate turno_id is a number
    if (turno_id === undefined || turno_id === null || !Number.isInteger(Number(turno_id))) {
      return res.status(400).json({ 
        success: false, 
        error: 'El campo turno_id es obligatorio y debe ser un número dentro del primer objeto de dataArray' 
      });
    }

    // Validate turno_id is a number
    if (fecha_final === undefined || fecha_final === null) {
      return res.status(400).json({ 
        success: false, 
        error: 'El campo fecha final es obligatorio y debe ser una fecha dentro del primer objeto de dataArray' 
      });
    }

    console.log('turno_id:', turno_id);

    // Query to find transactions with the given turno_id
    const selectQuery = `
      SELECT id
      FROM transacciones 
      WHERE turno_id = $1;
    `;
    
    const transactions = await executePgQuery(selectQuery, [turno_id]);

    // Update turno_estado to 'close' for matching transactions
    const updateTransactionsQuery = `
      UPDATE transacciones 
      SET turno_estado = 'close'
      WHERE turno_id = $1
      RETURNING id;
    `;
    
    const updateTurnoQuery = `
      UPDATE turnos
      SET estado = false, fecha_final = $1
      WHERE id = $2
      RETURNING id;
    `;

    // Execute updates
    const updatedTransactions = transactions.length > 0 
      ? await executePgQuery(updateTransactionsQuery, [turno_id]) 
      : [];

    const updatedTurno = await executePgQuery(updateTurnoQuery, [fecha_final, turno_id]);

    // Check if turno was found and updated
    if (updatedTurno.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No se encontró un turno con turno_id: ${turno_id} en la tabla turnos`,
      });
    }

    return res.status(200).json({
      success: true,
      message: transactions.length > 0 
        ? `Se actualizaron ${updatedTransactions.length} transacciones con turno_id: ${turno_id} a turno_estado = 'close' y se cerró el turno en la tabla turnos`
        : `No se encontraron transacciones con turno_id: ${turno_id}. Se cerró el turno en la tabla turnos`,
      data: {
        updatedTransactions,
        updatedTurno
      },
    });
  } catch (error) {
    console.error('Error en la API:', error);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
}