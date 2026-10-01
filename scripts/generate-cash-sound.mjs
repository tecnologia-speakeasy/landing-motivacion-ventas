#!/usr/bin/env node
/**
 * Sintetiza el efecto "ka-ching" de caja registradora en public/sounds/cash.wav.
 *
 *   node scripts/generate-cash-sound.mjs
 *
 * Es determinista (PRNG con semilla), así que regenerarlo produce el mismo
 * archivo. Si prefieres un sonido grabado, reemplaza el WAV (o añade un MP3) y
 * ajusta CASH_SOUND_SRC en app/hooks/useCashSound.ts.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SAMPLE_RATE = 44_100;
const DURATION = 1.3;
const OUTPUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "sounds", "cash.wav");

const length = Math.floor(SAMPLE_RATE * DURATION);
const samples = new Float32Array(length);

let seed = 20_260_930;
const random = () => {
  seed = (seed * 16_807) % 2_147_483_647;
  return seed / 2_147_483_647;
};

/** Suma un parcial senoidal con ataque corto y caída exponencial. */
function addTone({ start, frequency, amplitude, decay, attack = 0.002 }) {
  const from = Math.floor(start * SAMPLE_RATE);
  const to = Math.min(length, from + Math.floor(decay * 8 * SAMPLE_RATE));
  for (let i = from; i < to; i++) {
    const t = (i - from) / SAMPLE_RATE;
    const envelope = Math.min(1, t / attack) * Math.exp(-t / decay);
    samples[i] += amplitude * envelope * Math.sin(2 * Math.PI * frequency * t);
  }
}

/** Ráfaga de ruido filtrado (paso alto simple): el clic mecánico. */
function addClick({ start, amplitude, decay }) {
  const from = Math.floor(start * SAMPLE_RATE);
  const to = Math.min(length, from + Math.floor(decay * 8 * SAMPLE_RATE));
  let previousNoise = 0;
  for (let i = from; i < to; i++) {
    const t = (i - from) / SAMPLE_RATE;
    const noise = random() * 2 - 1;
    samples[i] += amplitude * Math.exp(-t / decay) * (noise - previousNoise) * 0.5;
    previousNoise = noise;
  }
}

// "Ka": cajón de la registradora (clic + golpe grave) y el pestillo.
addClick({ start: 0, amplitude: 0.9, decay: 0.012 });
addTone({ start: 0, frequency: 170, amplitude: 0.45, decay: 0.035, attack: 0.001 });
addClick({ start: 0.045, amplitude: 0.5, decay: 0.008 });

// "Ching": campana con parciales inarmónicos; el par 2093/2099 Hz produce un leve batido metálico.
const BELL_START = 0.07;
for (const [frequency, amplitude, decay] of [
  [2093, 0.55, 0.55],
  [2099, 0.3, 0.5],
  [4201, 0.28, 0.32],
  [5274, 0.2, 0.22],
  [6280, 0.13, 0.16],
  [8390, 0.07, 0.1],
]) {
  addTone({ start: BELL_START, frequency, amplitude, decay });
}

// Monedas: pequeños "tinks" agudos y aleatorios tras la campana.
for (let i = 0; i < 7; i++) {
  const start = 0.12 + random() * 0.45;
  const frequency = 3600 + random() * 3200;
  const amplitude = 0.06 + random() * 0.08;
  const decay = 0.03 + random() * 0.04;
  addTone({ start, frequency, amplitude, decay, attack: 0.0005 });
  addTone({ start, frequency: frequency * 1.47, amplitude: amplitude * 0.5, decay: decay * 0.7, attack: 0.0005 });
}

// Normaliza a -1 dBFS y suaviza el final para evitar clics al cortar.
const peak = samples.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
const gain = 0.89 / peak;
const fadeOut = Math.floor(0.12 * SAMPLE_RATE);
for (let i = 0; i < length; i++) {
  const tail = Math.min(1, (length - i) / fadeOut);
  samples[i] *= gain * tail;
}

// WAV PCM 16 bits mono.
const dataSize = length * 2;
const buffer = Buffer.alloc(44 + dataSize);
buffer.write("RIFF", 0);
buffer.writeUInt32LE(36 + dataSize, 4);
buffer.write("WAVE", 8);
buffer.write("fmt ", 12);
buffer.writeUInt32LE(16, 16);
buffer.writeUInt16LE(1, 20); // PCM
buffer.writeUInt16LE(1, 22); // mono
buffer.writeUInt32LE(SAMPLE_RATE, 24);
buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
buffer.writeUInt16LE(2, 32);
buffer.writeUInt16LE(16, 34);
buffer.write("data", 36);
buffer.writeUInt32LE(dataSize, 40);
for (let i = 0; i < length; i++) {
  const value = Math.max(-1, Math.min(1, samples[i]));
  buffer.writeInt16LE(Math.round(value * 32_767), 44 + i * 2);
}

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, buffer);
console.log(`Sonido generado: ${OUTPUT} (${(buffer.length / 1024).toFixed(0)} KB)`);
