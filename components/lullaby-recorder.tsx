'use client';

import { LoaderIcon, MicIcon, SquareIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

/**
 * Preferred first. Android records WebM and iOS records MP4; the server turns
 * either into an mp3, so all that matters is that the browser can make it.
 */
const MIME_TYPES = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'];

type RecorderState = 'idle' | 'recording' | 'saving';

function formatElapsed(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * Records a new lullaby from the phone's microphone and hands it to the
 * server, which names it for the moment it was saved.
 *
 * The browser's call-audio processing is switched off: echo cancellation,
 * noise suppression and gain control are tuned for a voice on a call, and they
 * chew up singing and anything played in the room.
 */
export function LullabyRecorder({ onSaved, secretHash }: { readonly onSaved: () => Promise<void>; readonly secretHash: string }) {
  const [state, setState] = useState<RecorderState>('idle');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState<null | string>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);

  useEffect(() => {
    if (state !== 'recording') {
      return undefined;
    }

    const startedAt = Date.now();
    const timer = setInterval(() => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1_000)), 250);

    return () => clearInterval(timer);
  }, [state]);

  /**
   * Leaving the tab mid-recording stops it, which saves what was recorded
   * rather than leaving the microphone open behind another page.
   */
  useEffect(() => () => recorderRef.current?.stop(), []);

  async function save(recording: Blob) {
    setState('saving');

    try {
      const response = await fetch(`/api/lullabies?secretHash=${encodeURIComponent(secretHash)}`, {
        body: recording,
        headers: { 'Content-Type': recording.type || 'application/octet-stream' },
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      await onSaved();
    } catch (caughtError) {
      setError(caughtError instanceof Error && caughtError.message !== '' ? caughtError.message : 'Could not save the recording.');
    } finally {
      setState('idle');
    }
  }

  async function start() {
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { autoGainControl: false, echoCancellation: false, noiseSuppression: false } });
      const mimeType = MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType === undefined ? undefined : { mimeType });
      const chunks: Blob[] = [];

      recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      });
      recorder.addEventListener('stop', () => {
        recorderRef.current = null;
        for (const track of stream.getTracks()) {
          track.stop();
        }

        void save(new Blob(chunks, { type: recorder.mimeType }));
      });

      recorder.start();
      recorderRef.current = recorder;
      setElapsedSeconds(0);
      setState('recording');
    } catch (caughtError) {
      setError(caughtError instanceof Error && caughtError.name === 'NotAllowedError' ? 'The microphone is not allowed for this site.' : 'Could not start recording.');
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        className={`flex items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm ${state === 'recording' ? 'border-amber-500/60 font-semibold text-amber-500' : 'border-foreground/15'}`}
        disabled={state === 'saving'}
        onClick={() => {
          if (state === 'recording') {
            recorderRef.current?.stop();
          } else {
            start();
          }
        }}
        type="button"
      >
        {state === 'idle' && <MicIcon className="size-4" />}
        {state === 'recording' && <SquareIcon className="size-4" />}
        {state === 'saving' && <LoaderIcon className="size-4 animate-spin" />}
        {state === 'idle' && 'Record a lullaby'}
        {state === 'recording' && `Stop recording · ${formatElapsed(elapsedSeconds)}`}
        {state === 'saving' && 'Saving…'}
      </button>
      {error !== null && <p className="text-sm text-amber-500">{error}</p>}
    </div>
  );
}
