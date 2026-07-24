// =============================================================
//  Store · customer-auth.js
//  Autenticación de CLIENTES de la tienda (distinta del admin).
//  Email + contraseña y "Continuar con Google" (OAuth de Supabase).
//  El login es obligatorio para finalizar la compra.
// =============================================================
import { supabase } from "../core/client.js";

/** Usuario actual (o null). */
export async function getUser() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.user || null;
}

/** Registro con email + contraseña. Crea la ficha de cliente. */
export async function signUp(email, password, nombre = "", apellido = "") {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: { data: { full_name: [nombre, apellido].filter(Boolean).join(" ").trim() } },
  });
  if (error) throw new Error(traducirError(error.message));
  // Si el proyecto no exige confirmación por email, ya hay sesión: creamos la ficha.
  if (data.session) await ensureCustomer(nombre, apellido);
  return data;
}

/** Ingreso con email + contraseña. */
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(traducirError(error.message));
  await ensureCustomer();
  return data;
}

/** Ingreso / registro con Google (redirige y vuelve a la misma página). */
export async function signInWithGoogle(redirectTo = location.href) {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });
  if (error) throw new Error(traducirError(error.message));
}

/** Cierra la sesión del cliente. */
export async function signOut() {
  await supabase.auth.signOut();
}

/**
 * Garantiza que exista la ficha de cliente vinculada al usuario logueado
 * (para que aparezca en el panel > Clientes aunque todavía no compró).
 */
export async function ensureCustomer(nombre = "", apellido = "", telefono = "") {
  try {
    const user = await getUser();
    if (!user) return;
    const meta = user.user_metadata || {};
    const fullName = (meta.full_name || meta.name || "").trim();
    const nom = nombre || fullName.split(" ")[0] || "";
    const ape = apellido || fullName.split(" ").slice(1).join(" ") || "";
    await supabase.rpc("upsert_my_customer", {
      nombre: nom || null,
      apellido: ape || null,
      telefono: telefono || null,
    });
  } catch (e) {
    console.warn("[customer-auth] ensureCustomer:", e.message);
  }
}

/** Trae la ficha de cliente del usuario logueado (o null). */
export async function getMyCustomer() {
  const user = await getUser();
  if (!user) return null;
  const { data } = await supabase.from("customers").select("*").eq("user_id", user.id).maybeSingle();
  return data || null;
}

/** Suscribe a cambios de sesión (login/logout). Devuelve función para desuscribir. */
export function onAuthChange(cb) {
  const { data } = supabase.auth.onAuthStateChange((_evt, session) => cb(session?.user || null));
  return () => data.subscription.unsubscribe();
}

/** Mensajes de Supabase Auth → español claro. */
function traducirError(msg = "") {
  const m = msg.toLowerCase();
  if (m.includes("invalid login")) return "Email o contraseña incorrectos.";
  if (m.includes("already registered") || m.includes("already exists")) return "Ese email ya tiene una cuenta. Iniciá sesión.";
  if (m.includes("password should be at least")) return "La contraseña debe tener al menos 6 caracteres.";
  if (m.includes("email not confirmed")) return "Confirmá tu email antes de ingresar (revisá tu casilla).";
  if (m.includes("unable to validate email") || m.includes("invalid email")) return "Revisá el email ingresado.";
  if (m.includes("provider is not enabled")) return "El login con Google todavía no está habilitado en el servidor.";
  return msg;
}
