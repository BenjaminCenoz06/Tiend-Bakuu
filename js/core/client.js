// =============================================================
//  Core · client.js
//  Conexión ÚNICA a Supabase (patrón Singleton).
//  Toda la app usa esta misma instancia — nunca se crea otra.
//  Cargamos el SDK oficial de Supabase por ESM (requiere internet,
//  que de todos modos hace falta para hablar con la base).
// =============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_CONFIG } from "../../config/supabase.config.js";

let _client = null;

/** Devuelve la instancia única del cliente de Supabase. */
export function getClient() {
  if (_client) return _client;

  const { url, anonKey } = SUPABASE_CONFIG;
  if (!url || url.includes("TU_SUPABASE") || !anonKey || anonKey.includes("TU_SUPABASE")) {
    throw new Error(
      "Faltan las credenciales de Supabase en config/supabase.config.js"
    );
  }

  _client = createClient(url, anonKey, {
    auth: {
      persistSession: true,       // "recordar sesión"
      autoRefreshToken: true,
      detectSessionInUrl: true,   // necesario para el link de recuperar contraseña
    },
  });
  return _client;
}

// Acceso directo cómodo: `import { supabase } from ".../client.js"`
export const supabase = getClient();
