import { createClient } from '@supabase/supabase-js'

// Cliente hacia el proyecto Supabase de CMI Operaciones: lectura de
// producción real diaria (producciones, productos, ordenes_fabricacion,
// cuadre_pt_productos*) y lectura/escritura de aldi_pedidos, que es la misma
// tabla que usa la pestaña Aldi de CMI (fuente única de esos pedidos).
// Todo protegido por RLS por tabla.
const CMI_URL = import.meta.env.VITE_SUPABASE_CMI_URL
const CMI_ANON_KEY = import.meta.env.VITE_SUPABASE_CMI_ANON_KEY

export const supabaseCmi = createClient(CMI_URL, CMI_ANON_KEY)
