import test from 'node:test';
import assert from 'node:assert/strict';
import { getCurrentDeviceTilt, getDeviceTilt, readOrientation, TILT_DATA_MAX_AGE_MS } from '../src/components/instruments/deviceTilt.ts';

const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-10);

test('requires finite readings from both sensor axes', () => {
  for (const [beta, gamma] of [[null, 0], [0, null], [NaN, 0], [0, Infinity]]) {
    assert.equal(readOrientation(beta, gamma), null);
  }
  assert.deepEqual(readOrientation(0, 0), { beta: 0, gamma: 0 });
});

test('calibrates relative to the starting holding position', () => {
  const neutral = { beta: 65, gamma: -12 };
  const tilt = getDeviceTilt(neutral, neutral, 0);
  near(tilt.x, 0);
  near(tilt.y, 0);
  const moved = getDeviceTilt({ beta: 80, gamma: 3 }, neutral, 0);
  near(moved.x, 0.5);
  near(moved.y, -0.5);
});

test('maps movement to the screen in either landscape direction', () => {
  const reading = { beta: 15, gamma: 0 };
  const neutral = { beta: 0, gamma: 0 };
  near(getDeviceTilt(reading, neutral, 90).x, 0.5);
  near(getDeviceTilt(reading, neutral, 90).y, 0);
  near(getDeviceTilt(reading, neutral, 270).x, -0.5);
  near(getDeviceTilt({ beta: 0, gamma: 15 }, neutral, 90).y, 0.5);
  near(getDeviceTilt({ beta: 0, gamma: 15 }, neutral, 180).x, -0.5);
});

test('crossing the beta boundary does not flip the model', () => {
  const tilt = getDeviceTilt({ beta: -179, gamma: 0 }, { beta: 179, gamma: 0 }, 0);
  near(tilt.y, -2 / 30);
});

test('large tilts stay within the supported movement range', () => {
  const tilt = getDeviceTilt({ beta: 90, gamma: -80 }, { beta: 0, gamma: 0 }, 0);
  assert.deepEqual(tilt, { x: -1, y: -1 });
});

test('no sensor data leaves pointer control available immediately', () => {
  assert.equal(getCurrentDeviceTilt(null, 100), null);
});

test('zero tilt is valid when real sensor data is fresh', () => {
  const sample = { x: 0, y: 0, receivedAt: 100 };
  assert.equal(getCurrentDeviceTilt(sample, 150), sample);
  assert.equal(getCurrentDeviceTilt(sample, 100 + TILT_DATA_MAX_AGE_MS), sample);
});

test('stopped sensor readings expire so the instrument returns to pointer control', () => {
  const sample = { x: 0.5, y: -0.5, receivedAt: 100 };
  assert.equal(getCurrentDeviceTilt(sample, 101 + TILT_DATA_MAX_AGE_MS), null);
  const resumed = { ...sample, receivedAt: 5000 };
  assert.equal(getCurrentDeviceTilt(resumed, 5000), resumed);
});

test('invalid or future-dated samples cannot select tilt control', () => {
  assert.equal(getCurrentDeviceTilt({ x: NaN, y: 0, receivedAt: 100 }, 150), null);
  assert.equal(getCurrentDeviceTilt({ x: 0, y: Infinity, receivedAt: 100 }, 150), null);
  assert.equal(getCurrentDeviceTilt({ x: 0, y: 0, receivedAt: NaN }, 150), null);
  assert.equal(getCurrentDeviceTilt({ x: 0, y: 0, receivedAt: 200 }, 150), null);
});
