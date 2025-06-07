                                                                              
import { NextApiRequest, NextApiResponse } from 'next';
import { executePgQuery } from '@/lib/database';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método no permitido. Use POST' });
  }

  try {
    const { cliente_id, numero_tarjeta, establecimiento_id, tipo_combustible_id, fecha, monto } = req.body;

    console.log("DATOS RECIBIDOS: ", req.body);

    // Validar campos obligatorios
    if (!establecimiento_id || !tipo_combustible_id || !fecha || !monto || monto <= 0) {
      return res.status(400).json({
        success: false,
        error: `Faltan campos obligatorios o monto inválido: ${JSON.stringify(req.body)}`
      });
    }

    // Si no hay cliente_id pero hay numero_tarjeta, buscar cliente_id usando los últimos 4 dígitos
    let finalClienteId = cliente_id;
    if (!finalClienteId && numero_tarjeta) {
      // Validar que numero_tarjeta sea una cadena
      if (typeof numero_tarjeta !== 'string') {
        return res.status(400).json({
          success: false,
          error: `El número de tarjeta debe ser una cadena: ${JSON.stringify(numero_tarjeta)}`
        });
      }

      // Validar que numero_tarjeta tenga exactamente 4 dígitos y sean numéricos
      if (!/^\d{4}$/.test(numero_tarjeta)) {
        return res.status(400).json({
          success: false,
          error: `El número de tarjeta debe contener exactamente 4 dígitos numéricos: ${numero_tarjeta}`
        });
      }

      const getClienteIdQuery = `
        SELECT cliente_id
        FROM tarjetas
        WHERE RIGHT(numero_tarjeta, 4) = $1;
      `;

      const clienteResult = await executePgQuery(getClienteIdQuery, [numero_tarjeta]);
      finalClienteId = clienteResult[0]?.cliente_id;

      if (!finalClienteId) {
        return res.status(400).json({
          success: false,
          error: `No se encontró cliente_id para los últimos 4 dígitos del número de tarjeta: ${numero_tarjeta}`
        });
      }
    }

    // Validar que se haya obtenido un cliente_id
    if (!finalClienteId) {
      return res.status(400).json({
        success: false,
        error: `Falta cliente_id y no se pudo obtener desde numero_tarjeta: ${JSON.stringify(req.body)}`
      });
    }

    // Buscar el precio en precio_venta_combustible
    const getPrecioQuery = `
      SELECT precio
      FROM precio_venta_combustible
      WHERE precio_sucursal_ids = $1
      AND tipo_combustible_id = $2
      AND $3::date BETWEEN fecha_inicio AND fecha_final;
    `;

  const precioResult = await executePgQuery(getPrecioQuery, [establecimiento_id, tipo_combustible_id, fecha]);
    const precio = precioResult[0]?.precio;

    if (!precio || precio <= 0) {
      return res.status(400).json({
        success: false,
        error: `No se encontró un precio válido para establecimiento_id: ${establecimiento_id}, tipo_combustible_id: ${tipo_combustible_id}, fecha: ${fecha}`
      });
    }

    // Calcular unidades vendidas
    const unidades = monto / precio;

    // Inicializar monto_descuento
    let monto_descuento = 0;

    // Obtener canal_id desde la tabla clientes
    const getCanalQuery = `
      SELECT canal_id
      FROM clientes
      WHERE id = $1;
    `;

    const canalResult = await executePgQuery(getCanalQuery, [finalClienteId]);
    const canal_id = canalResult[0]?.canal_id;

    if (canal_id) {
      // Obtener descuento desde la tabla descuentos
      const getDescuentoQuery = `
        SELECT descuento
        FROM descuentos
        WHERE canal_id = $1
        AND tipo_combustible_id = $2
        AND active = true;
      `;

      const descuentoResult = await executePgQuery(getDescuentoQuery, [canal_id, tipo_combustible_id]);
      const descuento = descuentoResult[0]?.descuento;

      if (descuento != null && descuento >= 0) {
        // Nueva fórmula de descuento: (1/3.8) * descuento * unidades
        
        monto_descuento =  descuento * unidades;
      } else {
        console.log(`No se encontró un descuento válido para canal_id: ${canal_id}, tipo_combustible_id: ${tipo_combustible_id}`);
      }
    } else {
      console.log(`No se encontró canal_id para cliente_id: ${finalClienteId}`);
    }

    return res.status(200).json({
      success: true,
      message: 'Unidades y descuento calculados con éxito.',
      cliente_id: finalClienteId,
      unidades: Number(unidades.toFixed(2)),
      monto_descuento: Number(monto_descuento.toFixed(2))
    });

  } catch (error) {
    console.error('Error en la API:', error);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
}

