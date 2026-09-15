// Deterministic mock audio generator for the floating music player.
// Development and acceptance only: low volume, short, no randomness.

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const outputDirectory = path.resolve(scriptDirectory, '..', 'apps', 'web', 'public', 'mock', 'audio');

const sampleRate = 11025;
const amplitude = 0.12;
const fadeSeconds = 0.4;
const tremoloHertz = 0.5;
const tremoloDepth = 0.25;

const mockTracks = [
  { fileName: 'mock-track-01.wav', seconds: 6, hertz: 220 },
  { fileName: 'mock-track-02.wav', seconds: 8, hertz: 277.18 },
  { fileName: 'mock-track-03.wav', seconds: 10, hertz: 329.63 },
];

function buildSamples({ seconds, hertz }) {
  const sampleCount = Math.round(sampleRate * seconds);
  const samples = new Int16Array(sampleCount);

  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / sampleRate;

    const fadeIn = Math.min(1, time / fadeSeconds);
    const fadeOut = Math.min(1, (seconds - time) / fadeSeconds);
    const envelope = Math.max(0, Math.min(fadeIn, fadeOut));
    const tremolo = 1 - tremoloDepth + tremoloDepth * Math.sin(2 * Math.PI * tremoloHertz * time);
    const wave = Math.sin(2 * Math.PI * hertz * time);

    samples[index] = Math.round(wave * envelope * tremolo * amplitude * 32767);
  }

  return samples;
}

function buildWavBuffer(samples) {
  const dataBytes = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataBytes);

  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataBytes, 40);

  for (let index = 0; index < samples.length; index += 1) {
    buffer.writeInt16LE(samples[index], 44 + index * 2);
  }

  return buffer;
}

function main() {
  mkdirSync(outputDirectory, { recursive: true });

  for (const track of mockTracks) {
    const buffer = buildWavBuffer(buildSamples(track));
    const targetPath = path.join(outputDirectory, track.fileName);

    writeFileSync(targetPath, buffer);
    console.log(`${track.fileName} — ${track.seconds}s, ${track.hertz}Hz, ${buffer.length} bytes`);
  }

  console.log(`Mock audio written to ${outputDirectory}`);
}

main();
