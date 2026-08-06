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
    borradorActualId: null, // fila de ordenes_carga_borrador que se sigue actualizando mientras se edita
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
    },

    // ── BORRADOR (autoguardado 72h) ────────────────────────────────────────
    // Guarda el estado completo de la tabla (huecos, palets, todo) para no
    // perderlo al recargar. Primera vez de una carga → crea fila nueva;
    // ediciones posteriores → actualiza la misma fila.
    async guardarBorrador() {
      try {
        const fechasEntrega = [...new Set(this.ordenCargaData.map(f => f.fechaEntrega).filter(Boolean))];
        const fechasSalidaMercancias = [...new Set(this.ordenCargaData.map(f => f.salidaMercancias).filter(Boolean))];
        const payload = {
          fecha_produccion: this.fecha,
          datos: this.ordenCargaData,
          fechas_entrega: fechasEntrega,
          fechas_salida_mercancias: fechasSalidaMercancias,
          updated_at: new Date().toISOString(),
        };

        if (this.borradorActualId) {
          const { error } = await supabase
            .from('ordenes_carga_borrador')
            .update(payload)
            .eq('id', this.borradorActualId);
          if (error) throw error;
        } else {
          const { data, error } = await supabase
            .from('ordenes_carga_borrador')
            .insert(payload)
            .select('id')
            .single();
          if (error) throw error;
          this.borradorActualId = data.id;
        }

        const limite = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
        await supabase.from('ordenes_carga_borrador').delete().lt('created_at', limite);
      } catch (error) {
        console.error('Error guardando borrador:', error);
      }
    },

    // Carga automáticamente el borrador más reciente de las últimas 72h (al
    // abrir la pantalla). Devuelve true si encontró y cargó algo.
    async cargarUltimoBorrador() {
      const limite = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('ordenes_carga_borrador')
        .select('*')
        .gte('created_at', limite)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data) return false;
      this.ordenCargaData = data.datos || [];
      this.borradorActualId = data.id;
      return true;
    },

    // Lista de borradores de las últimas 72h (para el desplegable de historial)
    async listarBorradores() {
      const limite = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('ordenes_carga_borrador')
        .select('id, created_at, fechas_entrega, fechas_salida_mercancias')
        .gte('created_at', limite)
        .order('created_at', { ascending: false });

      if (error) return [];
      return data || [];
    },

    // Carga un borrador concreto elegido del historial
    async cargarBorrador(id) {
      const { data, error } = await supabase
        .from('ordenes_carga_borrador')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !data) return false;
      this.ordenCargaData = data.datos || [];
      this.borradorActualId = data.id;
      return true;
    },
  }
})