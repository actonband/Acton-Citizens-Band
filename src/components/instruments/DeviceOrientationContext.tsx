import React, { createContext, useContext, useEffect, useMemo, useRef } from "react";
import type { MutableRefObject, ReactNode } from "react";
import { useInstrumentLoading } from "./InstrumentLoadingContext";
import { getDeviceTilt, readOrientation, TILT_DATA_MAX_AGE_MS } from "./deviceTilt";
import type { DeviceTiltSample, OrientationReading } from "./deviceTilt";

const DeviceOrientationContext = createContext<{
  tilt: MutableRefObject<DeviceTiltSample | null>;
} | null>(null);

export const DeviceOrientationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { loadInstrumentsEnabled } = useInstrumentLoading();
  const tilt = useRef<DeviceTiltSample | null>(null);

  useEffect(() => {
    tilt.current = null;
    if (!loadInstrumentsEnabled) return;

    let neutral: OrientationReading | null = null;
    const recalibrate = () => {
      neutral = null;
      tilt.current = null;
    };
    const onOrientation = (event: DeviceOrientationEvent) => {
      if (document.hidden) return;
      const reading = readOrientation(event.beta, event.gamma);
      if (!reading) return;
      const now = performance.now();
      if (!tilt.current || now - tilt.current.receivedAt > TILT_DATA_MAX_AGE_MS) neutral = reading;
      neutral ??= reading;
      const angle =
        window.screen.orientation?.angle ??
        (window as Window & { orientation?: number }).orientation ??
        0;
      tilt.current = { ...getDeviceTilt(reading, neutral, angle), receivedAt: now };
    };

    // Only actual valid readings activate tilt. API detection, HTTPS and
    // permission state never prevent the pointer fallback from working.
    window.addEventListener("deviceorientation", onOrientation, { passive: true });
    window.screen.orientation?.addEventListener("change", recalibrate);
    window.addEventListener("orientationchange", recalibrate);
    document.addEventListener("visibilitychange", recalibrate);
    return () => {
      window.removeEventListener("deviceorientation", onOrientation);
      window.screen.orientation?.removeEventListener("change", recalibrate);
      window.removeEventListener("orientationchange", recalibrate);
      document.removeEventListener("visibilitychange", recalibrate);
      tilt.current = null;
    };
  }, [loadInstrumentsEnabled]);

  const value = useMemo(() => ({ tilt }), [tilt]);
  return (
    <DeviceOrientationContext.Provider value={value}>{children}</DeviceOrientationContext.Provider>
  );
};

export function useDeviceOrientation() {
  const context = useContext(DeviceOrientationContext);
  if (!context) throw new Error("Device orientation must be used within DeviceOrientationProvider");
  return context;
}
