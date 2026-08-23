const test = require("node:test");
const assert = require("node:assert/strict");

function createPcm16Wav(samples, sampleRate = 48_000) {
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);
  samples.forEach((sample, index) => buffer.writeInt16LE(sample, 44 + index * 2));
  return buffer;
}

test("normalizes quiet PCM WAV speech to the shared target loudness", () => {
  const { analyzePcm16Wav, normalizePcm16WavVolume } = require("../dist/services/audio/audioLoudness.js");
  const source = createPcm16Wav([0, 0, 655, 655, 655, 0, 0]);
  const normalized = normalizePcm16WavVolume(source);
  const metrics = analyzePcm16Wav(normalized);

  assert.ok(metrics);
  assert.ok(Math.abs(metrics.activeRmsDbfs - (-18)) < 0.2);
  assert.ok(metrics.peakDbfs <= -1);
  assert.notDeepEqual(Buffer.from(normalized), source);
});

test("limits gain when a loud PCM WAV would exceed the peak ceiling", () => {
  const { analyzePcm16Wav, normalizePcm16WavVolume } = require("../dist/services/audio/audioLoudness.js");
  const source = createPcm16Wav([0, 30_000, 30_000, 30_000, 0]);
  const normalized = normalizePcm16WavVolume(source);
  const metrics = analyzePcm16Wav(normalized);

  assert.ok(metrics);
  assert.ok(metrics.peakDbfs <= -1);
});

test("compresses high-crest speech before raising it to the target loudness", () => {
  const { analyzePcm16Wav, normalizePcm16WavVolume } = require("../dist/services/audio/audioLoudness.js");
  const source = createPcm16Wav([
    30_000,
    30_000,
    30_000,
    30_000,
    ...Array.from({ length: 1_000 }, () => 1_200),
  ]);
  const normalized = normalizePcm16WavVolume(source);
  const metrics = analyzePcm16Wav(normalized);

  assert.ok(metrics);
  assert.ok(metrics.activeRmsDbfs > -18.5);
  assert.ok(metrics.activeRmsDbfs < -17.5);
  assert.ok(metrics.peakDbfs <= -1);
});

test("leaves non-WAV audio untouched", () => {
  const { normalizePcm16WavVolume } = require("../dist/services/audio/audioLoudness.js");
  const source = Buffer.from("fake-mp3-bytes");

  assert.deepEqual(Buffer.from(normalizePcm16WavVolume(source)), source);
});
