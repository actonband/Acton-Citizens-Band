export type DeviceTilt = { x: number; y: number };
export type DeviceTiltSample = DeviceTilt & { receivedAt: number };
export type OrientationReading = { beta: number; gamma: number };
export const TILT_DATA_MAX_AGE_MS = 2500;

export function getCurrentDeviceTilt(
  sample: DeviceTiltSample | null,
  now: number,
): DeviceTilt | null {
  if (
    !sample ||
    !Number.isFinite(sample.x) ||
    !Number.isFinite(sample.y) ||
    !Number.isFinite(sample.receivedAt)
  )
    return null;
  const age = now - sample.receivedAt;
  return age >= 0 && age <= TILT_DATA_MAX_AGE_MS ? sample : null;
}

export function readOrientation(
  beta: number | null,
  gamma: number | null,
): OrientationReading | null {
  return beta !== null && gamma !== null && Number.isFinite(beta) && Number.isFinite(gamma)
    ? { beta, gamma }
    : null;
}

export function getDeviceTilt(
  reading: OrientationReading,
  neutral: OrientationReading,
  screenAngle: number,
): DeviceTilt {
  const difference = (value: number, start: number) => ((value - start + 540) % 360) - 180;
  const beta = difference(reading.beta, neutral.beta);
  const gamma = difference(reading.gamma, neutral.gamma);
  const angle = (screenAngle * Math.PI) / 180;
  const clamp = (value: number) => Math.max(-1, Math.min(1, value));

  return {
    x: clamp((gamma * Math.cos(angle) + beta * Math.sin(angle)) / 30),
    y: clamp((-beta * Math.cos(angle) + gamma * Math.sin(angle)) / 30),
  };
}
