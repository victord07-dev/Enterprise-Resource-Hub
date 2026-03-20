import { useQuery } from "@tanstack/react-query";

export interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  email: string;
  role: string;
  employeeId: string | null;
}

export function getToken(): string | null {
  return localStorage.getItem("token");
}

export function getUser(): Omit<AuthUser, "employeeId"> | null {
  const raw = localStorage.getItem("user");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function isAuthenticated(): boolean {
  return !!getToken() && !!getUser();
}

export function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.location.href = "/login";
}

export function useCurrentUser() {
  return useQuery<AuthUser>({
    queryKey: ["/api/auth/me"],
    enabled: isAuthenticated(),
    staleTime: 5 * 60 * 1000,
  });
}
