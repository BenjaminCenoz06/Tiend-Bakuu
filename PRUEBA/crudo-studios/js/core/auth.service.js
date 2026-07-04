// =============================================================
//  Core · auth.service.js
//  Autenticación con Supabase Auth. Responsabilidad única:
//  todo lo relativo a sesión y permisos vive acá (SRP).
// =============================================================
import { supabase } from "./client.js";
import { emit, EVENTS } from "./events.js";

export const AuthService = {
  /** Inicia sesión con correo + contraseña. */
  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: String(email || "").trim().toLowerCase(),
      password,
    });
    if (error) throw new Error(traducir(error.message));
    return data.user;
  },

  /** Cierra la sesión. */
  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(error.message);
  },

  /** Envía el correo de recuperación de contraseña. */
  async resetPassword(email, redirectTo) {
    const { error } = await supabase.auth.resetPasswordForEmail(
      String(email || "").trim().toLowerCase(),
      redirectTo ? { redirectTo } : undefined
    );
    if (error) throw new Error(traducir(error.message));
  },

  /** Define una contraseña nueva (tras abrir el link de recuperación). */
  async updatePassword(newPassword) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw new Error(traducir(error.message));
  },

  /** Usuario actual (o null). */
  async getUser() {
    const { data } = await supabase.auth.getUser();
    return data?.user || null;
  },

  /** Sesión actual (o null). */
  async getSession() {
    const { data } = await supabase.auth.getSession();
    return data?.session || null;
  },

  /** ¿El usuario actual tiene rol admin? (verificado en la DB). */
  async isAdmin() {
    const user = await this.getUser();
    if (!user) return false;
    const { data, error } = await supabase
      .from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (error) return false;
    return data?.role === "admin";
  },

  /** Reacciona a cambios de sesión (login/logout en otra pestaña, etc.). */
  onChange(handler) {
    const { data } = supabase.auth.onAuthStateChange((_evt, session) => {
      emit(EVENTS.AUTH_CHANGED, session?.user || null);
      handler(session?.user || null);
    });
    return () => data.subscription.unsubscribe();
  },
};

// Mensajes de error de Supabase → español claro
function traducir(msg = "") {
  const m = msg.toLowerCase();
  if (m.includes("invalid login")) return "Correo o contraseña incorrectos.";
  if (m.includes("email not confirmed")) return "Confirmá tu correo antes de ingresar.";
  if (m.includes("rate limit")) return "Demasiados intentos. Esperá un momento.";
  if (m.includes("user not found")) return "No encontramos una cuenta con ese correo.";
  return msg;
}
