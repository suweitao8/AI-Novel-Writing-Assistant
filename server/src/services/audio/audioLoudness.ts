export const DEFAULT_AUDIO_TARGET_RMS_DBFS = -16;
export const DEFAULT_AUDIO_MAX_PEAK_DBFS = -1;
export const DEFAULT_AUDIO_ACTIVE_THRESHOLD_DBFS = -40;
export const DEFAULT_AUDIO_COMPRESSOR_THRESHOLD_DBFS = -6;
export const DEFAULT_AUDIO_COMPRESSOR_RATIO = 4;

export interface Pcm16WavLoudnessMetrics {
  sampleRate: number;
  channels: number;
  bitsPerSample: 16;
  sampleCount: number;
  activeSampleCount: number;
  activeRmsDbfs: number;
  peakDbfs: number;
}

interface Pcm16WavLayout {
  dataOffset: number;
  dataLength: number;
  sampleRate: number;
  channels: number;
  bitsPerSample: 16;
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function resolvePcm16WavLayout(input: Uint8Array): Pcm16WavLayout | null {
  if (input.byteLength < 12 || readAscii(input, 0, 4) !== "RIFF" || readAscii(input, 8, 4) !== "WAVE") {
    return null;
  }

  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  let offset = 12;
  let sampleRate = 0;
  let channels = 0;
  let bitsPerSample = 0;
  let dataOffset = 0;
  let dataLength = 0;

  while (offset + 8 <= input.byteLength) {
    const chunkId = readAscii(input, offset, 4);
    const chunkLength = view.getUint32(offset + 4, true);
    const chunkDataOffset = offset + 8;
    if (chunkDataOffset > input.byteLength || chunkLength > input.byteLength - chunkDataOffset) {
      return null;
    }

    if (chunkId === "fmt " && chunkLength >= 16) {
      const audioFormat = view.getUint16(chunkDataOffset, true);
      channels = view.getUint16(chunkDataOffset + 2, true);
      sampleRate = view.getUint32(chunkDataOffset + 4, true);
      bitsPerSample = view.getUint16(chunkDataOffset + 14, true);
      if (audioFormat !== 1) {
        return null;
      }
    } else if (chunkId === "data") {
      dataOffset = chunkDataOffset;
      dataLength = chunkLength;
    }

    offset = chunkDataOffset + chunkLength + (chunkLength % 2);
  }

  if (
    !dataOffset
    || !dataLength
    || !sampleRate
    || !channels
    || bitsPerSample !== 16
    || dataLength % 2 !== 0
  ) {
    return null;
  }

  return { dataOffset, dataLength, sampleRate, channels, bitsPerSample: 16 };
}

function dbfsFromAmplitude(amplitude: number): number {
  return 20 * Math.log10(Math.max(amplitude / 32768, Number.EPSILON));
}

function amplitudeFromDbfs(dbfs: number): number {
  return 10 ** (dbfs / 20);
}

export function analyzePcm16Wav(input: Uint8Array): Pcm16WavLoudnessMetrics | null {
  const layout = resolvePcm16WavLayout(input);
  if (!layout) {
    return null;
  }

  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const activeThreshold = 32768 * (10 ** (DEFAULT_AUDIO_ACTIVE_THRESHOLD_DBFS / 20));
  let sampleCount = 0;
  let activeSampleCount = 0;
  let activeSquareSum = 0;
  let peak = 0;

  for (let offset = layout.dataOffset; offset + 2 <= layout.dataOffset + layout.dataLength; offset += 2) {
    const sample = view.getInt16(offset, true);
    const amplitude = Math.abs(sample);
    sampleCount += 1;
    peak = Math.max(peak, amplitude);
    if (amplitude >= activeThreshold) {
      activeSampleCount += 1;
      activeSquareSum += sample * sample;
    }
  }

  const activeRms = activeSampleCount > 0
    ? Math.sqrt(activeSquareSum / activeSampleCount)
    : 0;
  return {
    sampleRate: layout.sampleRate,
    channels: layout.channels,
    bitsPerSample: layout.bitsPerSample,
    sampleCount,
    activeSampleCount,
    activeRmsDbfs: dbfsFromAmplitude(activeRms),
    peakDbfs: dbfsFromAmplitude(peak),
  };
}

export function normalizePcm16WavVolume(
  input: Uint8Array,
  options: {
    targetRmsDbfs?: number;
    maxPeakDbfs?: number;
  } = {},
): Uint8Array {
  let source = input;
  let metrics = analyzePcm16Wav(source);
  if (!metrics || metrics.activeSampleCount === 0) {
    return input;
  }

  const targetRmsDbfs = options.targetRmsDbfs ?? DEFAULT_AUDIO_TARGET_RMS_DBFS;
  const maxPeakDbfs = options.maxPeakDbfs ?? DEFAULT_AUDIO_MAX_PEAK_DBFS;
  let desiredGainDb = targetRmsDbfs - metrics.activeRmsDbfs;
  let peakLimitedGainDb = maxPeakDbfs - metrics.peakDbfs;

  // Speech can contain a few near-full-scale peaks while the body of the
  // sentence is quiet. In that case gain-only normalization would leave the
  // whole sample quiet because the peaks hit the ceiling first. Compress the
  // peaks just enough to make the requested gain safe, then recalculate RMS.
  for (
    let compressionPass = 0;
    compressionPass < 4 && desiredGainDb > peakLimitedGainDb + 0.1 && desiredGainDb > 0;
    compressionPass += 1
  ) {
    const layout = resolvePcm16WavLayout(source);
    const desiredGain = amplitudeFromDbfs(desiredGainDb);
    const maxPeakAmplitude = amplitudeFromDbfs(maxPeakDbfs);
    const targetPeakAmplitude = maxPeakAmplitude / desiredGain;
    const currentPeakAmplitude = amplitudeFromDbfs(metrics.peakDbfs);
    if (
      !layout
      || !Number.isFinite(targetPeakAmplitude)
      || targetPeakAmplitude <= 0
      || targetPeakAmplitude >= currentPeakAmplitude
    ) {
      break;
    }

    const thresholdAmplitude = Math.min(
      amplitudeFromDbfs(DEFAULT_AUDIO_COMPRESSOR_THRESHOLD_DBFS),
      targetPeakAmplitude * 0.75,
    );
    const denominator = targetPeakAmplitude - thresholdAmplitude;
    const calculatedRatio = denominator > 0
      ? (currentPeakAmplitude - thresholdAmplitude) / denominator
      : DEFAULT_AUDIO_COMPRESSOR_RATIO;
    const ratio = Math.max(DEFAULT_AUDIO_COMPRESSOR_RATIO, calculatedRatio);
    const compressed = new Uint8Array(source);
    const view = new DataView(compressed.buffer, compressed.byteOffset, compressed.byteLength);
    for (let offset = layout.dataOffset; offset + 2 <= layout.dataOffset + layout.dataLength; offset += 2) {
      const sample = view.getInt16(offset, true);
      const amplitude = Math.abs(sample) / 32768;
      if (amplitude <= thresholdAmplitude) {
        continue;
      }
      const compressedAmplitude = Math.min(
        targetPeakAmplitude,
        thresholdAmplitude + (amplitude - thresholdAmplitude) / ratio,
      );
      const compressedSample = Math.round(Math.sign(sample) * compressedAmplitude * 32768);
      view.setInt16(offset, compressedSample, true);
    }
    source = compressed;
    metrics = analyzePcm16Wav(source) ?? metrics;
    desiredGainDb = targetRmsDbfs - metrics.activeRmsDbfs;
    peakLimitedGainDb = maxPeakDbfs - metrics.peakDbfs;
  }

  const gainDb = Math.min(desiredGainDb, peakLimitedGainDb);
  const gain = amplitudeFromDbfs(gainDb);
  if (!Number.isFinite(gain) || Math.abs(gain - 1) < 0.0001) {
    return source;
  }

  const layout = resolvePcm16WavLayout(source);
  if (!layout) {
    return source;
  }
  const output = new Uint8Array(source);
  const view = new DataView(output.buffer, output.byteOffset, output.byteLength);
  const peakLimit = Math.min(32767, Math.floor(32768 * amplitudeFromDbfs(maxPeakDbfs)));
  for (let offset = layout.dataOffset; offset + 2 <= layout.dataOffset + layout.dataLength; offset += 2) {
    const sample = view.getInt16(offset, true);
    const scaled = Math.round(sample * gain);
    const limited = Math.max(-peakLimit, Math.min(peakLimit, scaled));
    view.setInt16(offset, limited, true);
  }
  return output;
}
