import { createContext, useContext } from "react";

interface NotificationContextValue {
  openBell: () => void;
}

export const NotificationContext = createContext<NotificationContextValue>({
  openBell: () => {},
});

export function useNotificationBell() {
  return useContext(NotificationContext);
}
