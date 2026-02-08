import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase";

export function useAuth() {
  const [user, setUser] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ─── Cargar perfil del usuario ───
  const fetchPerfil = useCallback(async (userId) => {
    try {
      const { data, error: err } = await supabase
        .from("perfiles")
        .select("*")
        .eq("user_id", userId)
        .single();

      if (err) {
        console.error("Error al cargar perfil:", err.message);
        setError("No se encontró tu perfil. Contacta al administrador.");
        setPerfil(null);
        return null;
      }

      if (!data.activo) {
        setError("Tu cuenta está desactivada. Contacta al administrador.");
        await supabase.auth.signOut();
        setPerfil(null);
        return null;
      }

      setPerfil(data);
      setError(null);
      return data;
    } catch (e) {
      console.error("Error inesperado en fetchPerfil:", e);
      setError("Error de conexión. Recarga la página.");
      setPerfil(null);
      return null;
    }
  }, []);

  // ─── Escuchar cambios de sesión ───
  useEffect(() => {
    let mounted = true;

    const timeout = setTimeout(() => {
      if (mounted) setLoading(false);
    }, 8000);

    supabase.auth.getSession()
      .then(async ({ data: { session } }) => {
        if (!mounted) return;
        if (session?.user) {
          setUser(session.user);
          await fetchPerfil(session.user.id);
        }
      })
      .catch((err) => {
        console.error("Error al restaurar sesión:", err);
      })
      .finally(() => {
        if (mounted) setLoading(false);
        clearTimeout(timeout);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;
        if (event === "SIGNED_IN" && session?.user) {
          setUser(session.user);
          await fetchPerfil(session.user.id);
        } else if (event === "SIGNED_OUT") {
          setUser(null);
          setPerfil(null);
        } else if (event === "TOKEN_REFRESHED" && session?.user) {
          setUser(session.user);
        }
      }
    );

    return () => {
      mounted = false;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [fetchPerfil]);

  // ─── Login ───
  const login = async (email, password) => {
    setError(null);
    try {
      const { data, error: err } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (err) {
        if (err.message.includes("Invalid login")) {
          setError("Email o contraseña incorrectos");
        } else {
          setError(err.message);
        }
        return { success: false, error: err.message };
      }

      const p = await fetchPerfil(data.user.id);
      return { success: !!p, perfil: p };
    } catch (e) {
      setError("Error de conexión. Intenta de nuevo.");
      return { success: false, error: e.message };
    }
  };

  // ─── Logout ───
  const logout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error("Error al cerrar sesión:", e);
    }
    setUser(null);
    setPerfil(null);
  };

  // ─── Reset password ───
  const resetPassword = async (email) => {
    const { error: err } = await supabase.auth.resetPasswordForEmail(email);
    if (err) return { success: false, error: err.message };
    return { success: true };
  };

  // ─── Create user (admin only) ───
  const createUser = async ({ email, password, nombre, rol, ejecutivo_id }) => {
    const { data, error: err } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          nombre_display: nombre,
          rol: rol,
        },
      },
    });

    if (err) return { success: false, error: err.message };

    if (rol === "ejecutivo" && ejecutivo_id) {
      await supabase
        .from("perfiles")
        .update({ ejecutivo_id, rol: "ejecutivo" })
        .eq("user_id", data.user.id);
    }

    if (rol === "admin") {
      await supabase
        .from("perfiles")
        .update({ rol: "admin" })
        .eq("user_id", data.user.id);
    }

    return { success: true, user: data.user };
  };

  return {
    user,
    perfil,
    loading,
    error,
    isAdmin: perfil?.rol === "admin",
    isEjecutivo: perfil?.rol === "ejecutivo",
    ejecutivoId: perfil?.ejecutivo_id,
    nombreDisplay: perfil?.nombre_display || "",
    login,
    logout,
    resetPassword,
    createUser,
  };
}
