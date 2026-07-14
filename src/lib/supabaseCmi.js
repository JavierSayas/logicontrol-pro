import { createClient } from '@supabase/supabase-js'

// Cliente de solo lectura hacia el proyecto Supabase de CMI Operaciones, para
// traer la producción real diaria (tablas producciones, productos y
// ordenes_fabricacion) y calcular la cantidad fabricada en Cuadre PT.
// Protegida por RLS (solo SELECT).
const CMI_URL = import.meta.env.VITE_SUPABASE_CMI_URL
const CMI_ANON_KEY = import.meta.env.VITE_SUPABASE_CMI_ANON_KEY

export const supabaseCmi = createClient(CMI_URL, CMI_ANON_KEY)
