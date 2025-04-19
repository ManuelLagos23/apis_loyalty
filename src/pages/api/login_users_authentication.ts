import { NextApiRequest, NextApiResponse } from 'next';
import { executePgQuery } from '@/lib/database';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método no permitido. Use POST' });
  }

  try {
    const { user, password, id_activacion } = req.body;


    if (!user || !password || !id_activacion) {
      return res.status(400).json({ 
        success: false, 
        error: 'Usuario, contraseña e ID de activación son requeridos' 
      });
    }


    const terminalQuery = 'SELECT id_activacion FROM terminales WHERE id_activacion = $1;';
    const terminalResult = await executePgQuery(terminalQuery, [id_activacion]);

    if (terminalResult.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'ID de activación no válido' 
      });
    }


    const selectQuery = 'SELECT * FROM miembros WHERE "user" = $1 AND password = $2;';
    const result = await executePgQuery(selectQuery, [user, password]);

    if (result.length === 0) {
      return res.status(401).json({ 
        success: false, 
        error: 'Usuario o contraseña incorrectos' 
      });
    }

  
    const usuario = { ...result[0] };
    delete usuario.password;

    return res.status(200).json({
      success: true,
      data: usuario,
    });
  } catch (error) {
    console.error('Error en la API de autenticación:', error);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
}