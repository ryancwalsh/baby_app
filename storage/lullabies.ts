import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { formatTimestamp, startsWithTimestamp } from '@/storage/timestamps';

/**
 * The lullabies live here rather than in `public/`, for two reasons. A
 * production Next server lists `public/` once when it starts, so a file
 * recorded or renamed afterwards would not be served until the next restart.
 * And the folder is written at runtime, which in a git checkout that is also
 * the deployment would leave the tree dirty after every recording. It is
 * gitignored for the same reason `secrets/` is.
 */
export const LULLABIES_DIRECTORY = 'lullabies';

const EXTENSION = '.mp3';

const MAXIMUM_NAME_LENGTH = 100;

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

export function listLullabyFiles(): string[] {
  let files: string[] = [];
  try {
    files = readdirSync(LULLABIES_DIRECTORY);
  } catch {
    /**
     * No folder yet means no lullabies, which is not an error.
     */
  }

  return files.filter((file) => file.toLowerCase().endsWith(EXTENSION) && !file.startsWith('.')).sort(compareFileNames);
}

export function getLullabyName(fileName: string) {
  return fileName.slice(0, -EXTENSION.length);
}

/**
 * The file name arrives from the browser, so it is only trusted once it is
 * plainly one of the files in the folder — never a path.
 */
export function resolveLullabyPath(fileName: string): null | string {
  if (basename(fileName) !== fileName || !listLullabyFiles().includes(fileName)) {
    return null;
  }

  return join(LULLABIES_DIRECTORY, fileName);
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

export function renameLullaby(fileName: string, newName: string): string {
  const oldPath = resolveLullabyPath(fileName);

  if (oldPath === null) {
    throw new Error('That lullaby is no longer there.');
  }

  const newFileName = toFileName(newName);
  const newPath = join(LULLABIES_DIRECTORY, newFileName);

  /**
   * A change of case alone is still a rename, and on a case-sensitive disk the
   * new name does not exist yet.
   */
  if (newFileName !== fileName && existsSync(newPath)) {
    throw new Error(`There is already a lullaby called ${getLullabyName(newFileName)}.`);
  }

  renameSync(oldPath, newPath);

  return newFileName;
}

/**
 * For good: the folder is not in git and there is no bin to fish it out of.
 */
export function deleteLullaby(fileName: string) {
  const path = resolveLullabyPath(fileName);

  if (path === null) {
    throw new Error('That lullaby is no longer there.');
  }

  unlinkSync(path);
}

function runFfmpeg(inputPath: string, outputPath: string) {
  return new Promise<void>((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', inputPath, '-vn', '-codec:a', 'libmp3lame', '-q:a', '2', '-f', 'mp3', outputPath], {
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
 * Phones record in whatever their browser likes — WebM on Android, MP4 on iOS —
 * so every recording is turned into an mp3 here, and the folder stays one
 * format that every phone can play.
 *
 * The upload goes to a temporary file rather than ffmpeg's stdin because an
 * MP4 keeps its index at the end, and ffmpeg needs to seek to find it. The mp3
 * is written under a dot-name and renamed into place, so a half-converted file
 * is never listed.
 *
 * A recording is named for when it was made, in UTC; the pages show that time in the phone's own time zone.
 */
export async function saveRecording(recording: Buffer): Promise<string> {
  mkdirSync(LULLABIES_DIRECTORY, { recursive: true });

  const timestamp = formatTimestamp(new Date());
  let fileName = `${timestamp}${EXTENSION}`;

  for (let suffix = 2; existsSync(join(LULLABIES_DIRECTORY, fileName)); suffix += 1) {
    fileName = `${timestamp}_${suffix}${EXTENSION}`;
  }

  const inputPath = join(tmpdir(), `lullaby-recording-${process.pid}-${Date.now()}`);
  const partialPath = join(LULLABIES_DIRECTORY, `.${fileName}.partial`);

  try {
    writeFileSync(inputPath, recording);
    await runFfmpeg(inputPath, partialPath);
    renameSync(partialPath, join(LULLABIES_DIRECTORY, fileName));
  } finally {
    rmSync(inputPath, { force: true });
    rmSync(partialPath, { force: true });
  }

  return fileName;
}
