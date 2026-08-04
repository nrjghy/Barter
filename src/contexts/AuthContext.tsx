import React, { createContext, useContext, useState, useEffect } from "react";
import { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { AuthUser } from "../types";

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signInWithOAuth: (provider: "google" | "facebook" | "apple") => Promise<{ data: any; error: any }>;
  signUp: (email: string, password: string, username: string, location?: string) => Promise<{ error: any }>;
  resendVerification: (email: string) => Promise<{ error: any }>;
  resetPassword: (email: string) => Promise<{ error: any }>;
  updatePassword: (newPassword: string) => Promise<{ error: any }>;
  signOut: () => Promise<{ error: any }>;
  updateProfile: (updates: Partial<AuthUser>) => Promise<{ error: any }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);

  const fetchUserProfile = async (authUser: User) => {
    console.log("[AuthContext] fetchUserProfile called", authUser);
    try {
      const { data, error } = await supabase.from("users").select("*, role").eq("id", authUser.id).single();
      console.log("[AuthContext] fetchUserProfile result", { data, error });
      if (error) {
        console.error("[AuthContext] Error fetching user profile:", error);
        if (error.code === "PGRST116") {
          console.log("[AuthContext] User not found in users table");
        }
        return;
      }
      setUser({
        id: authUser.id,
        email: authUser.email!,
        username: data.username,
        location: data.location || undefined,
        latitude: data.latitude ?? undefined,
        longitude: data.longitude ?? undefined,
        avatar_url: data.avatar_url || undefined,
        role: data.role || "user",
        locationPromptDismissedAt: data.location_prompt_dismissed_at ?? undefined,
      });
    } catch (error) {
      console.error("[AuthContext] Error in fetchUserProfile (catch):", error);
      setUser(null);
    }
  };

  useEffect(() => {
    // On mount, get the session and set user/loading immediately
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser({
          id: session.user.id,
          email: session.user.email!,
          username: session.user.user_metadata?.username || "",
          location: session.user.user_metadata?.location || undefined,
          avatar_url: session.user.user_metadata?.avatar_url || undefined,
          role: session.user.user_metadata?.role || "user",
        });
        // Metadata above is signup-time data and never has latitude/longitude
        // (or a post-signup location update) -- refine with the real users
        // row once it's back, same pattern as onAuthStateChange below.
        fetchUserProfile(session.user);
      } else {
        setUser(null);
      }
      setLoading(false);
      setInitialized(true);
      console.log("[AuthContext] setLoading(false) called after getSession");
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser({
          id: session.user.id,
          email: session.user.email!,
          username: session.user.user_metadata?.username || "",
          location: session.user.user_metadata?.location || undefined,
          avatar_url: session.user.user_metadata?.avatar_url || undefined,
          role: session.user.user_metadata?.role || "user",
        });
        fetchUserProfile(session.user);
      } else {
        setUser(null);
      }
      setLoading(false);
      setInitialized(true);
      console.log("[AuthContext] setLoading(false) called in onAuthStateChange");
    });

    return () => subscription.unsubscribe();
  }, []);

  // Don't render children until the context is fully initialized
  if (!initialized) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-barter-50 via-barter-50 to-indigo-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-barter-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-xl">B</span>
          </div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-barter-600 to-barter-600 bg-clip-text text-transparent mb-2">
            Barter
          </h1>
          <p className="text-gray-600">Initializing...</p>
        </div>
      </div>
    );
  }

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signInWithOAuth = async (provider: "google" | "facebook" | "apple") => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        // access_type/prompt are Google-OAuth2-specific concepts (offline
        // refresh tokens, forced consent screen) -- they don't mean anything
        // to Facebook or Apple's OAuth flows, so they're now scoped to
        // google only rather than sent to every provider unconditionally.
        ...(provider === "google" && {
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        }),
      },
    });
    return { data, error };
  };

  const signUp = async (email: string, password: string, username: string, location?: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username,
          location: location || "",
        },
      },
    });
    return { error };
  };

  const resendVerification = async (email: string) => {
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
    });
    return { error };
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    return { error };
  };

  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });
    return { error };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    return { error };
  };

  const updateProfile = async (updates: Partial<AuthUser>) => {
    if (!user) return { error: new Error("No user logged in") };

    try {
      // First check if user exists in users table
      const { data: existingUser, error: fetchError } = await supabase
        .from("users")
        .select("id")
        .eq("id", user.id)
        .single();

      if (fetchError && fetchError.code === "PGRST116") {
        // User doesn't exist in users table, create them first
        const { error: insertError } = await supabase.from("users").insert([
          {
            id: user.id,
            username: updates.username || user.username,
            location: updates.location || user.location,
            latitude: updates.latitude ?? user.latitude,
            longitude: updates.longitude ?? user.longitude,
            avatar_url: updates.avatar_url || user.avatar_url,
            location_prompt_dismissed_at: updates.locationPromptDismissedAt ?? user.locationPromptDismissedAt,
          },
        ]);

        if (insertError) {
          console.error("Error creating user profile:", insertError);
          return { error: insertError };
        }
      } else if (fetchError) {
        console.error("Error checking user existence:", fetchError);
        return { error: fetchError };
      }

      // Now update the user profile
      const { error } = await supabase
        .from("users")
        .update({
          username: updates.username,
          location: updates.location,
          latitude: updates.latitude,
          longitude: updates.longitude,
          avatar_url: updates.avatar_url,
          location_prompt_dismissed_at: updates.locationPromptDismissedAt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (!error) {
        setUser({ ...user, ...updates });
      }

      return { error };
    } catch (error) {
      console.error("Unexpected error updating profile:", error);
      return { error: error instanceof Error ? error : new Error("Unknown error occurred") };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signIn,
        signInWithOAuth,
        signUp,
        resendVerification,
        resetPassword,
        updatePassword,
        signOut,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// Custom hook that uses context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    console.error("[useAuth] Hook called outside of AuthProvider");
    console.error("[useAuth] Stack trace:", new Error().stack);
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
