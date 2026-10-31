import { type WebcamServerMessage } from '@/services/webcam/messages';

/**
 * Stand-ins for the browser's media APIs, which jsdom does not have, close enough to the real ones that the components under test cannot tell the difference.
 *
 * What each one does was measured against real Chrome rather than assumed. In particular, `currentTime` on a video playing a `MediaStream` went on advancing after the frames stopped, and even after the sending connection closed, with the receiving connection still reporting `connected`. Only `framesDecoded` and `packetsReceived` from `getStats` stopped.
 */

export const FAKE_SDP = [
  'v=0',
  'a=candidate:1 1 udp 2122260223 8f3a1c2e-1111-2222-3333-444455556666.local 54321 typ host',
  'a=candidate:2 1 udp 1686052607 203.0.113.9 54321 typ srflx raddr 0.0.0.0 rport 0',
  '',
].join('\r\n');

/**
 * `currentTime` as a real browser reports it for a `MediaStream`: zero until the first frame of whatever is attached, and from then on a clock that runs whether or not any more frames arrive.
 *
 * `frozenAt` is for the kinder browser that does stop the clock, which is what the old watchdog assumed. A picture must count as lost in that browser too.
 */
export const mediaClock = {
  frozenAt: null as null | number,
  startedAt: null as null | number,
};

export class FakePeerConnection extends EventTarget {
  static instances: FakePeerConnection[] = [];

  static get latest(): FakePeerConnection {
    const connection = FakePeerConnection.instances.at(-1);

    if (connection === undefined) {
      throw new Error('No connection has been made.');
    }

    return connection;
  }

  audioPackets = 0;

  connectionState: RTCPeerConnectionState = 'new';

  framesDecoded = 0;

  iceConnectionState: RTCIceConnectionState = 'new';

  iceGatheringState: RTCIceGathererState = 'complete';

  isAudioFlowing = false;

  isClosed = false;

  isVideoFlowing = false;

  localDescription: null | RTCSessionDescriptionInit = null;

  remoteDescription: null | RTCSessionDescriptionInit = null;

  signalingState: RTCSignalingState = 'stable';

  constructor() {
    super();
    FakePeerConnection.instances.push(this);
  }

  addTrack() {
    return {};
  }

  close() {
    this.isClosed = true;
    this.connectionState = 'closed';
    this.signalingState = 'closed';
  }

  deliverTrack() {
    const event = new Event('track');

    Object.assign(event, { streams: [{ id: 'remote-stream' }] });
    this.dispatchEvent(event);
  }

  getSenders() {
    return [];
  }

  async getStats() {
    this.framesDecoded += this.isVideoFlowing ? 15 : 0;
    this.audioPackets += this.isAudioFlowing ? 50 : 0;

    return new Map<string, Record<string, number | string>>([
      ['audio', { kind: 'audio', packetsReceived: this.audioPackets, type: 'inbound-rtp' }],
      ['codec', { id: 'codec', mimeType: 'video/VP8', type: 'codec' }],
      ['video', { codecId: 'codec', framesDecoded: this.framesDecoded, kind: 'video', type: 'inbound-rtp' }],
    ]);
  }

  setConnectionState(next: RTCPeerConnectionState) {
    this.connectionState = next;
    this.dispatchEvent(new Event('connectionstatechange'));
  }

  async setLocalDescription() {
    const type = this.signalingState === 'have-remote-offer' ? 'answer' : 'offer';

    this.signalingState = type === 'answer' ? 'stable' : 'have-local-offer';
    this.localDescription = { sdp: FAKE_SDP, type };
  }

  async setRemoteDescription(description: RTCSessionDescriptionInit) {
    if (description.type === 'answer' && this.signalingState !== 'have-local-offer') {
      throw new DOMException(`Cannot set a remote answer in state ${this.signalingState}.`, 'InvalidStateError');
    }

    this.signalingState = description.type === 'answer' ? 'stable' : 'have-remote-offer';
    this.remoteDescription = description;
  }

  /**
   * The picture and the sound both arriving, as they do once a connection is up.
   */
  startFlowing() {
    this.isAudioFlowing = true;
    this.isVideoFlowing = true;
    mediaClock.startedAt = Date.now();
    this.setConnectionState('connected');
  }
}

export class FakeEventSource extends EventTarget {
  static instances: FakeEventSource[] = [];

  static get latest(): FakeEventSource {
    const source = FakeEventSource.instances.at(-1);

    if (source === undefined) {
      throw new Error('No event stream has been opened.');
    }

    return source;
  }

  url: string;

  constructor(url: string) {
    super();
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  close() {
    // Nothing is held open.
  }

  emit(message: WebcamServerMessage) {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(message) }));
  }
}

export class FakeAudioContext {
  static gainValues: number[] = [];

  static instances: FakeAudioContext[] = [];

  static oscillatorsStarted = 0;

  static resumeCount = 0;

  /**
   * What `resume` achieves, so a test can stand in for iOS refusing it.
   */
  static resumesTo: AudioContextState = 'running';

  currentTime = 0;

  destination = {};

  state: AudioContextState = 'running';

  constructor() {
    FakeAudioContext.instances.push(this);
  }

  static reset() {
    FakeAudioContext.oscillatorsStarted = 0;
    FakeAudioContext.resumesTo = 'running';
    FakeAudioContext.resumeCount = 0;
    FakeAudioContext.gainValues = [];
  }

  createGain() {
    const gain = { gain: { value: 1 } };
    const node = {
      ...gain,
      connect: (target: unknown) => {
        FakeAudioContext.gainValues.push(node.gain.value);

        return target;
      },
    };

    return node;
  }

  createOscillator() {
    return {
      connect: (target: unknown) => target,
      frequency: { value: 0 },
      start: () => {
        FakeAudioContext.oscillatorsStarted += 1;
      },
      stop: () => {
        // The tone ends by itself.
      },
    };
  }

  async resume() {
    FakeAudioContext.resumeCount += 1;
    this.state = FakeAudioContext.resumesTo;
  }
}

export class FakeResizeObserver {
  disconnect() {
    // Nothing is being observed.
  }

  observe() {
    // jsdom never lays out.
  }
}

const stubbedNavigatorProperties = new Set<string>();

/**
 * Sets properties on the real `navigator`, for `useFakeBrowser` to take away again. A copy of it will not do: its getters refuse to run on anything else.
 */
export function stubNavigator(properties: Record<string, unknown>) {
  for (const [name, value] of Object.entries(properties)) {
    Object.defineProperty(window.navigator, name, { configurable: true, value });
    stubbedNavigatorProperties.add(name);
  }
}

export function restoreNavigator() {
  for (const name of stubbedNavigatorProperties) {
    Reflect.deleteProperty(window.navigator, name);
  }

  stubbedNavigatorProperties.clear();
}

export function installFakeMediaElement() {
  const streams = new WeakMap<HTMLMediaElement, unknown>();

  Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', {
    configurable: true,
    get(this: HTMLMediaElement) {
      return streams.get(this) ?? null;
    },
    set(this: HTMLMediaElement, stream: unknown) {
      streams.set(this, stream);
      mediaClock.startedAt = null;
    },
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', {
    configurable: true,
    get(this: HTMLMediaElement) {
      const isAttached = streams.get(this) !== null && streams.get(this) !== undefined;
      let time = 0;

      if (isAttached && mediaClock.startedAt !== null) {
        time = mediaClock.frozenAt ?? (Date.now() - mediaClock.startedAt) / 1_000;
      }

      return time;
    },
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    configurable: true,
    value: async () => {
      // Playback is modelled by the clock above.
    },
  });
}
