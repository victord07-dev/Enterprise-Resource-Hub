import { useEffect, useRef } from "react";
import { logout, isAuthenticated } from "@/lib/auth";

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Automatically logs out the user after 30 minutes of inactivity.
 * Resets the timer on any mouse movement, keyboard input, click, scroll, or touch.
 * Only active when the user is authenticated.
 */
export function useInactivityLogout() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isAuthenticated()) return;

    const reset = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        // Double-check still authenticated before logging out
        if (isAuthenticated()) {
          logout();
        }
      }, INACTIVITY_TIMEOUT_MS);
    };

    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"];
    events.forEach(e => window.addEventListener(e, reset, { passive: true }));

    // Start the timer immediately
    reset();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      events.forEach(e => window.removeEventListener(e, reset));
    };
  }, []);
}
