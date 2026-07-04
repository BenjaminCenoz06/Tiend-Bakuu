// =============================================================
//  BAKU CMS · configuración de Supabase
//  La clave "publishable" es pública por diseño: es seguro tenerla
//  en el navegador porque la protección la dan las políticas RLS
//  de la base de datos (nadie modifica la tienda sin ser admin).
//  Nunca poner acá la clave "secret" (sb_secret_...).
// =============================================================
export const SUPABASE_CONFIG = {
  url: "https://xezvhwxhdyrssfpeqkic.supabase.co",
  anonKey: "sb_publishable_z1gCPUVWvcjcu4QmLiPrUQ_Kgr2bQmv",
};
