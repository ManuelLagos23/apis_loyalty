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

    // Validar ID de activación
    const terminalCheckQuery = 'SELECT id_activacion FROM terminales WHERE id_activacion = $1;';
    const terminalCheckResult = await executePgQuery(terminalCheckQuery, [id_activacion]);

    if (terminalCheckResult.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'ID de activación no válido' 
      });
    }

    // Autenticación y JOINs para obtener nombres descriptivos del usuario
    const userQuery = `
      SELECT 
        m.id, 
        m.nombre, 
        m."user", 
        m.email, 
        m.terminal_id,
        m.empresa_id,
        m.establecimiento,
        e.nombre_empresa AS empresa_nombre, 
        t.nombre_terminal AS terminal_nombre, 
        es.nombre_centro_costos AS establecimiento_nombre
      FROM miembros m
      LEFT JOIN empresas e ON m.empresa_id = e.id
      LEFT JOIN terminales t ON m.terminal_id = t.id
      LEFT JOIN costos es ON m.establecimiento = es.id
      WHERE m."user" = $1 AND m.password = $2;
    `;
    
    const userResult = await executePgQuery(userQuery, [user, password]);

    if (userResult.length === 0) {
      return res.status(401).json({ 
        success: false, 
        error: 'Usuario o contraseña incorrectos' 
      });
    }

    const usuario = userResult[0];

    // Obtener todos los datos del terminal, incluyendo empresa y estación por JOIN
    const terminalDetailQuery = `
      SELECT 
        t.id,
     
        e.id AS empresa_id,
        
        t.estacion_servicio as establecimiento_id,
        t.codigo_terminal,
        t.nombre_terminal,
        t.id_activacion
      FROM terminales t
      LEFT JOIN empresas e ON t.empresa = e.id
     
      WHERE t.id = $1;
    `;
    const terminalDetailResult = await executePgQuery(terminalDetailQuery, [usuario.terminal_id]);

    const terminal = terminalDetailResult.length > 0 ? terminalDetailResult[0] : null;

    return res.status(200).json({
      success: true,
      data: {
        usuario: {
          id: usuario.id,
          nombre: usuario.nombre,
          user: usuario.user,
          email: usuario.email,
          empresa_nombre: usuario.empresa_nombre,
          terminal_nombre: usuario.terminal_nombre,
          establecimiento_nombre: usuario.establecimiento_nombre,
        },
        terminal
      }
    });
  } catch (error) {
    console.error('Error en la API de autenticación:', error);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
}
