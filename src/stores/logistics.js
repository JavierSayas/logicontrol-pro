import { defineStore } from 'pinia'
import { supabase } from '../lib/supabase'

export const useLogisticsStore = defineStore('logistics', {
  state: () => ({
    activeTab: 'pedidos',
    fecha: new Date().toISOString().split('T')[0],
    loading: false,
    productos: [],
    sapData: [],
    ordenCargaData: [],
    matrixOrders: {}, // { "COCO": { "MIRANDA": 10, "SAGUNTO": 5 } }
    ordenesGuardadas: [],
  }),
  actions: {
    setSapData(data) {
      this.sapData = data;
    },
    setOrdenCarga(data) {
      this.ordenCargaData = data;
    },
    updateMatrix(prod, plat, qty) {
      if (!this.matrixOrders[prod]) this.matrixOrders[prod] = {};
      this.matrixOrders[prod][plat] = qty;
    },

    // Guardar orden de carga en Supabase
    async guardarOrdenCarga(tipoCarga = 'DHL001') {
      try {
        this.loading = true;

        const ordenesAGuardar = this.ordenCargaData.map(fila => ({
          fecha: this.fecha,
          tipo_carga: tipoCarga,
          nombre_destino: fila.nombreDestino,
          fecha_entrega: fila.fechaEntrega,
          fecha_carga: fila.salidaMercancias,
          denominacion: fila.denominacion,
          cantidad_pedido: parseFloat(fila.cantidadPedido) || 0,
          agente_servicios: fila.agenteServicios,
          transporte: fila.transporte,
          ruta: fila.ruta,
          numero_entrega: fila.numeroEntrega || null,
          huecos: parseInt(fila.huecos) || 0,
        }));

        const { data, error } = await supabase
          .from('ordenes_carga')
          .insert(ordenesAGuardar)
          .select();

        if (error) throw error;

        return { success: true, data };
      } catch (error) {
        console.error('Error guardando orden:', error);
        return { success: false, error: error.message };
      } finally {
        this.loading = false;
      }
    },

    // Cargar órdenes de Supabase
    async cargarOrdenesCarga(tipoCarga = null) {
      try {
        this.loading = true;

        let query = supabase
          .from('ordenes_carga')
          .select('*')
          .eq('fecha', this.fecha);

        if (tipoCarga) {
          query = query.eq('tipo_carga', tipoCarga);
        }

        const { data, error } = await query;

        if (error) throw error;

        this.ordenesGuardadas = data || [];
        return data;
      } catch (error) {
        console.error('Error cargando órdenes:', error);
        return [];
      } finally {
        this.loading = false;
      }
    },

    // Actualizar huecos en Supabase
    async actualizarHuecos(ordenId, huecos) {
      try {
        const { error } = await supabase
          .from('ordenes_carga')
          .update({ huecos: parseInt(huecos) || 0 })
          .eq('id', ordenId);

        if (error) throw error;
        return { success: true };
      } catch (error) {
        console.error('Error actualizando huecos:', error);
        return { success: false, error: error.message };
      }
    }
  }
})