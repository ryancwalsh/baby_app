/**
 * Ten seconds of silence as a WAV file, built here rather than shipped, so
 * there is nothing to fetch through the tunnel at the moment the noise starts.
 *
 * It exists for Android — see `NoiseAudioProvider`. Chrome only gives a media
 * notification to something with a duration of more than five seconds, which
 * is what sets the length; the format is the smallest PCM has to offer.
 */
const SAMPLE_RATE_HERTZ = 8_000;
const SECONDS = 10;
const HEADER_BYTES = 44;
const FORMAT_CHUNK_BYTES = 16;
const PCM_FORMAT = 1;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 8;
/**
 * Unsigned 8-bit PCM rests at the middle of its range, not at zero.
 */
const SILENT_SAMPLE = 128;

export function createSilenceUrl(): string {
  const dataBytes = SAMPLE_RATE_HERTZ * SECONDS;
  const bytes = new Uint8Array(HEADER_BYTES + dataBytes).fill(SILENT_SAMPLE);
  const view = new DataView(bytes.buffer);
  const writeText = (offset: number, text: string) => {
    for (const [index, character] of [...text].entries()) {
      view.setUint8(offset + index, character.codePointAt(0) ?? 0);
    }
  };

  writeText(0, 'RIFF');
  view.setUint32(4, HEADER_BYTES - 8 + dataBytes, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, FORMAT_CHUNK_BYTES, true);
  view.setUint16(20, PCM_FORMAT, true);
  view.setUint16(22, CHANNELS, true);
  view.setUint32(24, SAMPLE_RATE_HERTZ, true);
  view.setUint32(28, SAMPLE_RATE_HERTZ, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, BITS_PER_SAMPLE, true);
  writeText(36, 'data');
  view.setUint32(40, dataBytes, true);

  return URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
}
