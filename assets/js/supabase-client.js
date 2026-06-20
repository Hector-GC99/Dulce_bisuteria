// =========================================================
// Configuración de Supabase
// La "anon key" es PÚBLICA por diseño (no es una contraseña secreta).
// La seguridad real la dan las políticas RLS en la base de datos:
// solo un usuario logueado (tú) puede insertar/editar/borrar.
// NUNCA pongas aquí una "service_role key" — esa sí es secreta.
// =========================================================

const SUPABASE_URL = "https://edkqghfqhrbudqztfrac.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_11PL8Daj8skV-lGvsOAKhg_P8v3_3Fp";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
