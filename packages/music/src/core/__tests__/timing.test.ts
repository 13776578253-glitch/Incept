import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_PLAYBACK_RATE,
  MIN_PLAYBACK_RATE,
  clampSeekSeconds,
  isPlaybackRateInRange,
  normalizeDuration,
} from '../timing';

test('clampSeekSeconds keeps values inside the track duration', () => {
  assert.equal(clampSeekSeconds(12, 30), 12);
  assert.equal(clampSeekSeconds(0, 30), 0);
});

test('clampSeekSeconds floors negative and non-finite seeks at zero', () => {
  assert.equal(clampSeekSeconds(-5, 30), 0);
  assert.equal(clampSeekSeconds(Number.NaN, 30), 0);
  assert.equal(clampSeekSeconds(Number.NEGATIVE_INFINITY, 30), 0);
});

test('clampSeekSeconds never exceeds a known duration', () => {
  assert.equal(clampSeekSeconds(90, 30), 30);
});

test('clampSeekSeconds leaves the seek untouched while the duration is unknown', () => {
  assert.equal(clampSeekSeconds(90, 0), 90);
  assert.equal(clampSeekSeconds(90, Number.NaN), 90);
});

test('isPlaybackRateInRange accepts the supported range only', () => {
  assert.equal(isPlaybackRateInRange(MIN_PLAYBACK_RATE), true);
  assert.equal(isPlaybackRateInRange(1), true);
  assert.equal(isPlaybackRateInRange(1.75), true);
  assert.equal(isPlaybackRateInRange(MAX_PLAYBACK_RATE), true);
});

test('isPlaybackRateInRange rejects out-of-range and non-finite rates', () => {
  assert.equal(isPlaybackRateInRange(MIN_PLAYBACK_RATE - 0.1), false);
  assert.equal(isPlaybackRateInRange(MAX_PLAYBACK_RATE + 0.1), false);
  assert.equal(isPlaybackRateInRange(0), false);
  assert.equal(isPlaybackRateInRange(-1), false);
  assert.equal(isPlaybackRateInRange(Number.NaN), false);
  assert.equal(isPlaybackRateInRange(Number.POSITIVE_INFINITY), false);
});

test('normalizeDuration drops unusable durations', () => {
  assert.equal(normalizeDuration(12), 12);
  assert.equal(normalizeDuration(0), 0);
  assert.equal(normalizeDuration(-3), 0);
  assert.equal(normalizeDuration(Number.NaN), 0);
});
