import { spawn } from 'node:child_process';

import { getAccessToken, getFirstCamera } from '../services/nanit/auth.js';
import { connectToCamera } from '../services/nanit/camera.js';

/**
 * Reads what the camera's MOBILE stream actually contains, so the video relay
 * can be built against real numbers rather than assumed ones. The two that
 * decide the design are the video codec profile, which has to be something a
 * phone will decode, and the keyframe interval, which is the shortest HLS
 * segment `-c:v copy` can produce.
 *
 * This asks the camera to start streaming. It does not touch the night light.
 */

const PROBE_SECONDS = 12;

function run(command: string, commandArguments: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArguments);
    let output = '';

    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(`${command} exited ${code}:\n${output}`));
      }
    });
  });
}

async function main() {
  const accessToken = await getAccessToken();
  const { babyName, babyUid, cameraUid } = await getFirstCamera(accessToken);
  const rtmpUrl = `rtmps://media-secured.nanit.com/nanit/${babyUid}.${accessToken}`;

  console.log(`Camera for ${babyName}. Asking it to start the MOBILE stream…`);

  /**
   * A plain socket rather than the shared `connect()`: that one owns reconnect
   * and brightness timers meant to outlive a request, which would keep this
   * script's event loop alive for ever.
   */
  const camera = await connectToCamera(cameraUid, accessToken, {
    onBrightness: () => {},
    onClose: () => {},
    onNightLight: () => {},
  });
  /**
   * Everything past the connection goes in the `try`, including the start
   * itself: a camera only allows so many app connections at once, so a socket
   * left open by a failed start is what makes the next run fail too.
   */
  try {
    await camera.sendRequest('PUT_STREAMING', {
      streaming: { attempts: 3, id: 'MOBILE', rtmpUrl, status: 'STARTED' },
    });

    console.log('Started. Probing streams…\n');

    const streams = await run('ffprobe', ['-hide_banner', '-loglevel', 'error', '-rw_timeout', '20000000', '-show_streams', '-of', 'json', rtmpUrl]);
    console.log(streams);

    console.log(`Reading ${PROBE_SECONDS}s of frames to measure the keyframe interval…\n`);

    const frames = await run('ffprobe', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-rw_timeout',
      '20000000',
      '-select_streams',
      'v:0',
      '-show_entries',
      'frame=pts_time,key_frame',
      '-read_intervals',
      `%+${PROBE_SECONDS}`,
      '-of',
      'csv=p=0',
      rtmpUrl,
    ]);

    const keyframeTimes = frames
      .trim()
      .split('\n')
      .filter((line) => line.startsWith('1,'))
      .map((line) => Number(line.split(',')[1]));
    const gaps = keyframeTimes.slice(1).map((time, index) => time - (keyframeTimes[index] ?? 0));

    console.log(`Frames read: ${frames.trim().split('\n').length}`);
    console.log(`Keyframes: ${keyframeTimes.length}`);
    console.log(`Keyframe gaps (seconds): ${gaps.map((gap) => gap.toFixed(2)).join(', ')}`);
  } finally {
    console.log('\nStopping the stream.');
    await camera.sendRequest('PUT_STREAMING', {
      streaming: { id: 'MOBILE', rtmpUrl: '', status: 'STOPPED' },
    });
    camera.close();
  }
}

main();
