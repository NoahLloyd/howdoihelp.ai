"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { useRouter } from "next/navigation";
import { createAuthBrowserClient } from "@/lib/supabase-browser";
import type { User } from "@supabase/supabase-js";

interface Profile {
  id: string;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
  role: string;
  bio: string | null;
  location: string | null;
}

interface AuthContextValue {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  profile: null,
  loading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({
  children,
  initialProfile,
}: {
  children: React.ReactNode;
  initialProfile?: Profile | null;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(initialProfile ?? null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = createAuthBrowserClient();

  useEffect(() => {
    // Get initial session
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    router.push("/");
  }, [supabase, router]);

  const refreshProfile = useCallback(async () => {
    const currentUser = user;
    if (!currentUser) return;
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", currentUser.id)
      .single();
    if (data) setProfile(data as Profile);
  }, [supabase, user]);

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}
