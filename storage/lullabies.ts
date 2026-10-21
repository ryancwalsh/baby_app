import { spawn } from 'node:child_process';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { del, get, list, put, rename } from '@vercel/blob';
import ffmpegPath from 'ffmpeg-static';

import { getEnvironment } from '@/constants/environment';
import { UPLOADS_PREFIX } from '@/storage/lullaby-uploads';
import { formatTimestamp, startsWithTimestamp } from '@/storage/timestamps';

/**
 * The lullabies live in a private Vercel Blob store, under this prefix, so that every instance of the app sees the same ones and the laptop need not be on. Private means a blob cannot be fetched by its URL alone: they are served through `app/api/lullabies/`, behind the login.
 */
const LULLABIES_PREFIX = 'lullabies/';

const EXTENSION = '.mp3';

const MAXIMUM_NAME_LENGTH = 100;

function getBlobOptions() {
  return { access: 'private', token: getEnvironment().BLOB_READ_WRITE_TOKEN } as const;
}

function toPathname(fileName: string) {
  return `${LULLABIES_PREFIX}${fileName}`;
}

/**
 * Named lullabies come first, alphabetically, and fresh recordings after them
 * in the order they were made. The bottom nav plays the first lullaby, so a
 * recording made tonight must not quietly take over that button — and a digit
 * sorts before any letter.
 */
function compareFileNames(first: string, second: string) {
  const firstIsRecording = startsWithTimestamp(first);
  const secondIsRecording = startsWithTimestamp(second);

  if (firstIsRecording !== secondIsRecording) {
    return firstIsRecording ? 1 : -1;
  }

  /**
   * Without the extension, so a second recording in the same second sorts
   * after the first rather than before it.
   */
  return getLullabyName(first).localeCompare(getLullabyName(second));
}

export async function listLullabyFiles(): Promise<string[]> {
  const files: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ cursor, prefix: LULLABIES_PREFIX, token: getBlobOptions().token });
    for (const blob of page.blobs) {
      files.push(blob.pathname.slice(LULLABIES_PREFIX.length));
    }

    ({ cursor } = page);
  } while (cursor !== undefined);

  return files.filter((file) => file.toLowerCase().endsWith(EXTENSION) && !file.startsWith('.')).sort(compareFileNames);
}

export function getLullabyName(fileName: string) {
  return fileName.slice(0, -EXTENSION.length);
}

/**
 * The file name arrives from the browser, so it is only trusted once it is
 * plainly one of the lullabies — never a path.
 */
async function isLullaby(fileName: string): Promise<boolean> {
  return basename(fileName) === fileName && (await listLullabyFiles()).includes(fileName);
}

/**
 * The whole file, for the route that serves it in ranges. Lullabies are a few megabytes, so holding one in memory is cheaper than a Blob read per range.
 */
export async function readLullaby(fileName: string): Promise<Buffer | null> {
  let contents: Buffer | null = null;
  if (basename(fileName) === fileName) {
    const result = await get(toPathname(fileName), getBlobOptions());
    if (result?.statusCode === 200) {
      contents = Buffer.from(await new Response(result.stream).arrayBuffer());
    }
  }

  return contents;
}

/**
 * Typing the extension is forgiven rather than doubled.
 */
function toFileName(name: string): string {
  const trimmed = name
    .trim()
    .replace(/\.mp3$/iu, '')
    .trim();

  // eslint-disable-next-line no-control-regex -- control characters are exactly what is being refused.
  if (trimmed === '' || trimmed.startsWith('.') || /[/\\\u0000-\u001F]/u.test(trimmed)) {
    throw new Error('That name cannot be used for a file.');
  }

  if (trimmed.length > MAXIMUM_NAME_LENGTH) {
    throw new Error(`Names are limited to ${MAXIMUM_NAME_LENGTH} characters.`);
  }

  return `${trimmed}${EXTENSION}`;
}

export async function renameLullaby(fileName: string, newName: string): Promise<string> {
  if (!(await isLullaby(fileName))) {
    throw new Error('That lullaby is no longer there.');
  }

  const newFileName = toFileName(newName);

  /**
   * A change of case alone is still a rename.
   */
  if (newFileName !== fileName && (await listLullabyFiles()).includes(newFileName)) {
    throw new Error(`There is already a lullaby called ${getLullabyName(newFileName)}.`);
  }

  if (newFileName !== fileName) {
    await rename(toPathname(fileName), toPathname(newFileName), { ...getBlobOptions(), contentType: 'audio/mpeg' });
  }

  return newFileName;
}

/**
 * For good: there is no bin to fish it out of.
 */
export async function deleteLullaby(fileName: string) {
  if (!(await isLullaby(fileName))) {
    throw new Error('That lullaby is no longer there.');
  }

  await del(toPathname(fileName), { token: getBlobOptions().token });
}

/**
 * Vercel has no ffmpeg of its own, so the one bundled by `ffmpeg-static` is used wherever it was installed, and the system one otherwise.
 */
function getFfmpegCommand() {
  return ffmpegPath !== null && existsSync(ffmpegPath) ? ffmpegPath : 'ffmpeg';
}

function runFfmpeg(inputPath: string, outputPath: string) {
  return new Promise<void>((resolve, reject) => {
    const ffmpeg = spawn(getFfmpegCommand(), ['-hide_banner', '-loglevel', 'error', '-y', '-i', inputPath, '-vn', '-codec:a', 'libmp3lame', '-q:a', '2', '-f', 'mp3', outputPath], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let errorOutput = '';

    ffmpeg.stderr.on('data', (chunk: Buffer) => {
      errorOutput += chunk.toString();
    });
    ffmpeg.on('error', reject);
    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Could not convert the recording: ${errorOutput.trim() || `ffmpeg exited with ${code}`}`));
      }
    });
  });
}

/**
 * Stores an mp3 under its file name, refusing to overwrite one that is already there.
 */
export async function storeLullaby(fileName: string, mp3: Buffer) {
  await put(toPathname(fileName), mp3, { ...getBlobOptions(), addRandomSuffix: false, contentType: 'audio/mpeg' });
}

/**
 * Phones record in whatever their browser likes — WebM on Android, MP4 on iOS —
 * so every recording is turned into an mp3 here, and the store stays one
 * format that every phone can play.
 *
 * The phone uploads the raw recording straight to Blob, because a Vercel function refuses a request body over 4.5 MB, which a few minutes of recording passes. This fetches it, converts it through a temporary file rather than ffmpeg's stdin because an MP4 keeps its index at the end and ffmpeg needs to seek to find it, stores the mp3, and deletes the upload.
 *
 * A recording is named for when it was made, in UTC; the pages show that time in the phone's own time zone.
 */
export async function saveRecording(uploadPathname: string): Promise<string> {
  if (!uploadPathname.startsWith(UPLOADS_PREFIX) || uploadPathname.includes('..')) {
    throw new Error('That is not an uploaded recording.');
  }

  const upload = await get(uploadPathname, { ...getBlobOptions(), useCache: false });
  if (upload?.statusCode !== 200) {
    throw new Error('The uploaded recording is not there.');
  }

  const existing = await listLullabyFiles();
  const timestamp = formatTimestamp(new Date());
  let fileName = `${timestamp}${EXTENSION}`;

  for (let suffix = 2; existing.includes(fileName); suffix += 1) {
    fileName = `${timestamp}_${suffix}${EXTENSION}`;
  }

  const stamp = `${process.pid}-${Date.now()}`;
  const inputPath = join(tmpdir(), `lullaby-recording-${stamp}`);
  const outputPath = join(tmpdir(), `lullaby-recording-${stamp}.mp3`);

  try {
    writeFileSync(inputPath, Buffer.from(await new Response(upload.stream).arrayBuffer()));
    await runFfmpeg(inputPath, outputPath);
    await storeLullaby(fileName, await readFile(outputPath));
    await del(uploadPathname, { token: getBlobOptions().token });
  } finally {
    rmSync(inputPath, { force: true });
    rmSync(outputPath, { force: true });
  }

  return fileName;
}
