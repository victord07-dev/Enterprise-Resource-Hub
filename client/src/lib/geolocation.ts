import { Capacitor } from "@capacitor/core";

export interface GeoPosition {
  latitude: number;
  longitude: number;
}

export async function getCurrentPosition(options?: {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
}): Promise<GeoPosition> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { Geolocation } = await import("@capacitor/geolocation");
      await Geolocation.requestPermissions();
      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: options?.enableHighAccuracy ?? true,
        timeout: options?.timeout,
        maximumAge: options?.maximumAge,
      });
      return {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
    }

    return await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        reject,
        {
          enableHighAccuracy: options?.enableHighAccuracy ?? true,
          timeout: options?.timeout ?? 10000,
          maximumAge: options?.maximumAge ?? 0,
        }
      );
    });
  } catch (err: any) {
    const message = err?.message ?? "Unable to get location";
    throw new Error(message);
  }
}
