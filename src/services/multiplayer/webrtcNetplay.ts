import { EmulatorInputState } from '../../emulator/engine';
import { SignalingMessage } from '../../types';
import { roomService } from './roomService';

export type NetplayTransportMode = 'idle' | 'handshaking' | 'p2p-lan' | 'p2p-stun' | 'ws-relay';

export interface NetplayTelemetryStats {
  connectionState: RTCPeerConnectionState | 'closed';
  iceConnectionState: RTCIceConnectionState | 'closed';
  dataChannelState: RTCDataChannelState | 'closed';
  transportMode: NetplayTransportMode;
  rttMs: number;
  jitterMs: number;
  bitrateKbps: number;
  fps: number;
  packetLossPct: number;
  peerCount: number;
}

// 12-button compact bitmask mapping (fits in 2 bytes)
export const INPUT_BUTTON_ORDER: (keyof EmulatorInputState)[] = [
  'up',
  'down',
  'left',
  'right',
  'a',
  'b',
  'x',
  'y',
  'l',
  'r',
  'start',
  'select',
];

export function encodeInputBitmask(state: Partial<EmulatorInputState>): number {
  let mask = 0;
  for (let i = 0; i < INPUT_BUTTON_ORDER.length; i++) {
    if (state[INPUT_BUTTON_ORDER[i]]) {
      mask |= 1 << i;
    }
  }
  return mask;
}

export function decodeInputBitmask(mask: number): EmulatorInputState {
  const state: EmulatorInputState = {
    up: false,
    down: false,
    left: false,
    right: false,
    a: false,
    b: false,
    x: false,
    y: false,
    l: false,
    r: false,
    start: false,
    select: false,
  };
  for (let i = 0; i < INPUT_BUTTON_ORDER.length; i++) {
    state[INPUT_BUTTON_ORDER[i]] = (mask & (1 << i)) !== 0;
  }
  return state;
}

// Global ICE config for cross-internet NAT traversal (STUN direct first, TURN relay fallback)
const ICE_CONFIGURATION: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
  iceCandidatePoolSize: 6,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
};

// Optimize SDP for ultra-low-latency retro gaming (prioritize VP8/H264 & higher bitrate without buffering)
function optimizeSdpForLowLatency(sdp: string): string {
  const lines = sdp.split('\r\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    out.push(line);
    if (line.startsWith('a=fmtp:') && !line.includes('x-google-min-bitrate')) {
      out[out.length - 1] = `${line};x-google-min-bitrate=1500;x-google-start-bitrate=3500;x-google-max-bitrate=6500`;
    }
  }
  return out.join('\r\n');
}

interface PeerLink {
  peerUid: string;
  pc: RTCPeerConnection;
  inputChannel: RTCDataChannel;
  controlChannel: RTCDataChannel;
  frameChannel: RTCDataChannel;
  makingOffer: boolean;
  ignoreOffer: boolean;
  needsRenegotiate: boolean;
  pendingCandidates: RTCIceCandidateInit[];
  signalQueue: Promise<void>;
  lastRenegotiateAt: number;
  lastOfferSentAt: number;
  lastBytesRecv: number;
  lastBytesSent: number;
  lastStatsAt: number;
  fallbackTimer: ReturnType<typeof setTimeout> | null;
}

export class WebRTCNetplayManager {
  private roomId: string | null = null;
  private localUid: string = '';
  private role: 'host' | 'guest' | 'spectator' = 'host';
  private sessionEpoch = 0;
  private peers = new Map<string, PeerLink>();
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;

  private inputSeq = 0;
  private lastRecvSeq = -1;
  private wsFallbackActive = false;
  private dcFrameFallbackRequested = false;

  private unsubSignals: (() => void) | null = null;
  private unsubRelayInput: (() => void) | null = null;
  private unsubRelayFrame: (() => void) | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private statsTimer: ReturnType<typeof setInterval> | null = null;

  private statsListeners = new Set<(stats: NetplayTelemetryStats) => void>();
  private remoteStreamListeners = new Set<(stream: MediaStream) => void>();
  private remoteInputListeners = new Set<(mask: number, senderUid: string) => void>();
  private relayFrameListeners = new Set<(frameDataUrl: string) => void>();

  private currentStats: NetplayTelemetryStats = {
    connectionState: 'new',
    iceConnectionState: 'new',
    dataChannelState: 'connecting',
    transportMode: 'idle',
    rttMs: 0,
    jitterMs: 0,
    bitrateKbps: 0,
    fps: 0,
    packetLossPct: 0,
    peerCount: 0,
  };

  public startSession(roomId: string, localUid: string, role: 'host' | 'guest' | 'spectator'): void {
    if (this.roomId === roomId && this.localUid === localUid && this.role === role) {
      return;
    }
    this.stopSession();

    this.sessionEpoch++;
    this.roomId = roomId;
    this.localUid = localUid;
    this.role = role;
    this.wsFallbackActive = false;
    this.dcFrameFallbackRequested = false;
    this.lastRecvSeq = -1;
    this.updateStats({
      connectionState: 'new',
      iceConnectionState: 'new',
      dataChannelState: 'connecting',
      transportMode: 'handshaking',
      rttMs: 0,
      peerCount: 0,
    });

    this.unsubSignals = roomService.subscribeToSignals(roomId, localUid, (sig) => {
      this.handleIncomingSignal(sig);
    });

    // Always listen to WS fallback relays cleanly
    this.unsubRelayInput = roomService.subscribeToRelayInput((mask, senderUid) => {
      if (this.role === 'host') {
        this.remoteInputListeners.forEach((cb) => cb(mask, senderUid));
      }
    });

    this.unsubRelayFrame = roomService.subscribeToRelayFrame((frame) => {
      if (this.role !== 'host') {
        this.relayFrameListeners.forEach((cb) => cb(frame));
      }
    });

    // Periodic RTT Ping over P2P Control Channel
    this.pingTimer = setInterval(() => {
      const now = performance.now();
      for (const peer of this.peers.values()) {
        if (peer.controlChannel.readyState === 'open') {
          try {
            peer.controlChannel.send(JSON.stringify({ type: 'p2p_ping', t: now }));
          } catch {}
        }
      }
    }, 1500);

    // Periodic WebRTC getStats() inspection
    this.statsTimer = setInterval(() => {
      this.collectStats();
    }, 1500);
  }

  public stopSession(): void {
    const closingRoomId = this.roomId;
    const closingLocalUid = this.localUid;
    const peerIds = Array.from(this.peers.keys());

    this.sessionEpoch++;
    if (this.unsubSignals) {
      this.unsubSignals();
      this.unsubSignals = null;
    }
    if (this.unsubRelayInput) {
      this.unsubRelayInput();
      this.unsubRelayInput = null;
    }
    if (this.unsubRelayFrame) {
      this.unsubRelayFrame();
      this.unsubRelayFrame = null;
    }
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.statsTimer) {
      clearInterval(this.statsTimer);
      this.statsTimer = null;
    }

    for (const peer of this.peers.values()) {
      if (peer.fallbackTimer) clearTimeout(peer.fallbackTimer);
      try {
        if (peer.controlChannel.readyState === 'open') {
          peer.controlChannel.send(JSON.stringify({ type: 'peer_bye' }));
        }
      } catch {}
      try {
        peer.inputChannel.close();
      } catch {}
      try {
        peer.controlChannel.close();
      } catch {}
      try {
        peer.frameChannel.close();
      } catch {}
      try {
        peer.pc.close();
      } catch {}
    }

    if (closingRoomId && closingLocalUid && peerIds.length > 0) {
      for (const peerUid of peerIds) {
        roomService
          .sendSignal(closingRoomId, {
            roomId: closingRoomId,
            senderUid: closingLocalUid,
            targetUid: peerUid,
            type: 'bye',
            payload: 'stopSession',
          })
          .catch(() => {});
      }
    }

    this.peers.clear();
    this.localStream = null;
    this.remoteStream = null;
    this.roomId = null;
    this.wsFallbackActive = false;
    this.dcFrameFallbackRequested = false;
    this.updateStats({
      connectionState: 'closed',
      iceConnectionState: 'closed',
      dataChannelState: 'closed',
      transportMode: 'idle',
      rttMs: 0,
      bitrateKbps: 0,
      fps: 0,
      peerCount: 0,
    });
  }

  public hasPeerLink(peerUid: string): boolean {
    const link = this.peers.get(peerUid);
    if (!link) return false;
    return link.pc.connectionState !== 'closed' && link.pc.connectionState !== 'failed';
  }

  public async connectToPeer(peerUid: string, shouldInitiate: boolean): Promise<void> {
    if (!this.roomId || !peerUid || peerUid === this.localUid) return;
    const epoch = this.sessionEpoch;
    const link = this.ensurePeerLink(peerUid);

    if (shouldInitiate) {
      if (link.makingOffer || link.pc.signalingState !== 'stable') {
        link.needsRenegotiate = true;
        return;
      }

      try {
        link.makingOffer = true;
        link.needsRenegotiate = false;
        const offer = await link.pc.createOffer({
          offerToReceiveAudio: this.role !== 'host',
          offerToReceiveVideo: this.role !== 'host',
        });
        if (epoch !== this.sessionEpoch || link.pc.signalingState !== 'stable') {
          link.needsRenegotiate = true;
          return;
        }
        const tunedOffer: RTCSessionDescriptionInit = {
          type: offer.type,
          sdp: offer.sdp ? optimizeSdpForLowLatency(offer.sdp) : offer.sdp,
        };
        await link.pc.setLocalDescription(tunedOffer);
        link.lastOfferSentAt = performance.now();
        if (epoch !== this.sessionEpoch || !this.roomId) return;
        await roomService.sendSignal(this.roomId, {
          roomId: this.roomId,
          senderUid: this.localUid,
          targetUid: peerUid,
          type: 'offer',
          payload: JSON.stringify(link.pc.localDescription),
        });
      } catch (err) {
        console.warn('WebRTC initiate offer error:', err);
      } finally {
        link.makingOffer = false;
      }
    }
  }

  public async requestOfferFromHost(hostUid: string, resetPeer: boolean = false): Promise<void> {
    if (!this.roomId || !hostUid || hostUid === this.localUid || this.role === 'host') return;
    if (resetPeer) {
      this.disconnectPeer(hostUid);
      this.remoteStream = null;
    }
    this.ensurePeerLink(hostUid);

    const existing = this.peers.get(hostUid);
    if (!resetPeer && existing && existing.controlChannel.readyState === 'open') {
      try {
        existing.controlChannel.send(JSON.stringify({ type: 'request_offer' }));
      } catch {}
    }

    await roomService
      .sendSignal(this.roomId, {
        roomId: this.roomId,
        senderUid: this.localUid,
        targetUid: hostUid,
        type: 'renegotiate',
        payload: JSON.stringify({ action: 'request-offer', resetPeer, ts: Date.now() }),
      })
      .catch(() => {});
  }

  public disconnectPeer(peerUid: string): void {
    const link = this.peers.get(peerUid);
    if (!link) return;
    if (link.fallbackTimer) clearTimeout(link.fallbackTimer);
    try {
      link.inputChannel.close();
      link.controlChannel.close();
      link.frameChannel.close();
      link.pc.close();
    } catch {}
    this.peers.delete(peerUid);
    this.updateStats({ peerCount: this.peers.size });
  }

  public async attachLocalStream(stream: MediaStream): Promise<void> {
    this.localStream = stream;

    // Hint tracks for crisp motion & low latency
    for (const track of stream.getVideoTracks()) {
      try {
        if ('contentHint' in track) {
          track.contentHint = 'motion';
        }
      } catch {}
    }

    for (const [peerUid, link] of this.peers.entries()) {
      this.syncTracksOnPeer(link);
      if (this.role === 'host') {
        if (link.pc.signalingState !== 'stable') {
          link.needsRenegotiate = true;
        } else {
          await this.connectToPeer(peerUid, true);
        }
      }
    }
  }

  private syncTracksOnPeer(link: PeerLink): void {
    if (!this.localStream) return;
    const existingSenders = link.pc.getSenders();

    for (const track of this.localStream.getTracks()) {
      const existing = existingSenders.find((s) => s.track?.kind === track.kind);
      if (existing) {
        existing.replaceTrack(track).catch(() => {});
        this.tuneSenderLowLatency(existing, track.kind);
      } else {
        const sender = link.pc.addTrack(track, this.localStream);
        this.tuneSenderLowLatency(sender, track.kind);
      }
    }
  }

  private tuneSenderLowLatency(sender: RTCRtpSender, kind: string): void {
    if (kind !== 'video') return;
    try {
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) {
        params.encodings = [{}];
      }
      params.degradationPreference = 'maintain-framerate';
      params.encodings[0].maxBitrate = 5_000_000;
      params.encodings[0].maxFramerate = 60;
      (params.encodings[0] as any).priority = 'high';
      (params.encodings[0] as any).networkPriority = 'high';
      sender.setParameters(params).catch(() => {});
    } catch {}
  }

  private ensurePeerLink(peerUid: string): PeerLink {
    const existing = this.peers.get(peerUid);
    if (existing) return existing;

    const pc = new RTCPeerConnection(ICE_CONFIGURATION);

    // Negotiated UDP-like input channel (0 retransmits, unordered -> zero Head-of-Line blocking!)
    const inputChannel = pc.createDataChannel('inputs', {
      ordered: false,
      maxRetransmits: 0,
      negotiated: true,
      id: 1,
    });
    inputChannel.binaryType = 'arraybuffer';

    // Negotiated reliable control channel for RTT pings, fallback negotiation & sync commands
    const controlChannel = pc.createDataChannel('control', {
      ordered: true,
      negotiated: true,
      id: 2,
    });

    // Negotiated unreliable frame fallback channel when WebRTC video track cannot render across strict WebGL/NAT setups
    const frameChannel = pc.createDataChannel('frames', {
      ordered: false,
      maxRetransmits: 0,
      negotiated: true,
      id: 3,
    });

    const link: PeerLink = {
      peerUid,
      pc,
      inputChannel,
      controlChannel,
      frameChannel,
      makingOffer: false,
      ignoreOffer: false,
      needsRenegotiate: false,
      pendingCandidates: [],
      signalQueue: Promise.resolve(),
      lastRenegotiateAt: 0,
      lastOfferSentAt: 0,
      lastBytesRecv: 0,
      lastBytesSent: 0,
      lastStatsAt: performance.now(),
      fallbackTimer: null,
    };

    // 7-second ICE timeout -> seamless WebSocket relay fallback for strict symmetric NATs when WS backend is available
    link.fallbackTimer = setTimeout(() => {
      if (pc.iceConnectionState !== 'connected' && pc.iceConnectionState !== 'completed') {
        if (roomService.getTransportMode() === 'ws') {
          this.wsFallbackActive = true;
          this.updateStats({ transportMode: 'ws-relay' });
        } else if (this.role === 'host') {
          try {
            pc.restartIce();
          } catch {}
        }
      }
    }, 7000);

    inputChannel.onopen = () => {
      this.wsFallbackActive = false;
      this.updateStats({ dataChannelState: 'open' });
    };
    inputChannel.onclose = () => {
      this.updateStats({ dataChannelState: 'closed' });
    };
    inputChannel.onmessage = (ev) => {
      if (ev.data instanceof ArrayBuffer && ev.data.byteLength >= 4) {
        const view = new Uint16Array(ev.data);
        const mask = view[0];
        const seq = view[1];
        // Ignore stale out-of-order packets (handling 16-bit wraparound)
        const diff = (seq - this.lastRecvSeq + 65536) % 65536;
        if (this.lastRecvSeq === -1 || (diff > 0 && diff < 32768)) {
          this.lastRecvSeq = seq;
          this.remoteInputListeners.forEach((cb) => cb(mask, peerUid));
        }
      }
    };

    frameChannel.onmessage = (ev) => {
      if (this.role !== 'host' && typeof ev.data === 'string' && ev.data.startsWith('data:image/')) {
        this.relayFrameListeners.forEach((cb) => cb(ev.data));
      }
    };

    controlChannel.onmessage = (ev) => {
      try {
        const data = JSON.parse(String(ev.data));
        if (data.type === 'p2p_ping') {
          if (controlChannel.readyState === 'open') {
            controlChannel.send(JSON.stringify({ type: 'p2p_pong', t: data.t }));
          }
        } else if (data.type === 'p2p_pong' && typeof data.t === 'number') {
          const rtt = Math.max(1, Math.round(performance.now() - data.t));
          this.updateStats({ rttMs: rtt });
          roomService.reportPing(rtt);
        } else if (data.type === 'input_mask' && this.role === 'host' && typeof data.mask === 'number') {
          const seq = typeof data.seq === 'number' ? data.seq : 0;
          const diff = (seq - this.lastRecvSeq + 65536) % 65536;
          if (this.lastRecvSeq === -1 || (diff > 0 && diff < 32768)) {
            this.lastRecvSeq = seq;
            this.remoteInputListeners.forEach((cb) => cb(data.mask, peerUid));
          }
        } else if (data.type === 'request_offer' && this.role === 'host') {
          if (this.localStream) {
            this.syncTracksOnPeer(link);
          }
          this.connectToPeer(peerUid, true);
        } else if (data.type === 'need_frame_fallback' && this.role === 'host') {
          this.dcFrameFallbackRequested = Boolean(data.active);
        } else if (data.type === 'peer_bye') {
          this.disconnectPeer(peerUid);
        }
      } catch {}
    };

    pc.onicecandidate = (ev) => {
      if (ev.candidate && this.roomId) {
        roomService
          .sendSignal(this.roomId, {
            roomId: this.roomId,
            senderUid: this.localUid,
            targetUid: peerUid,
            type: 'candidate',
            payload: JSON.stringify(ev.candidate.toJSON()),
          })
          .catch(() => {});
      }
    };

    pc.oniceconnectionstatechange = () => {
      const iceState = pc.iceConnectionState;
      if (iceState === 'connected' || iceState === 'completed') {
        if (link.fallbackTimer) {
          clearTimeout(link.fallbackTimer);
          link.fallbackTimer = null;
        }
        this.wsFallbackActive = false;
        this.collectStats();
      } else if (iceState === 'failed' || iceState === 'disconnected') {
        const hasWs = roomService.getTransportMode() === 'ws';
        this.wsFallbackActive = hasWs;
        this.updateStats({
          iceConnectionState: iceState,
          transportMode: hasWs ? 'ws-relay' : 'idle',
        });
        if (this.role === 'host' && iceState === 'failed') {
          try {
            pc.restartIce();
          } catch {}
        }
      } else {
        this.updateStats({ iceConnectionState: iceState });
      }
    };

    pc.onconnectionstatechange = () => {
      this.updateStats({ connectionState: pc.connectionState });
    };

    pc.ontrack = (ev) => {
      // Minimize receiver jitter buffer delay to ~0ms for responsive retro controls
      try {
        const rx = ev.receiver as any;
        if ('playoutDelayHint' in rx) rx.playoutDelayHint = 0;
        if ('jitterBufferTarget' in rx) rx.jitterBufferTarget = 0;
      } catch {}

      const existingTracks = this.remoteStream
        ? this.remoteStream.getTracks().filter((t) => t.id !== ev.track.id && t.readyState !== 'ended')
        : [];
      this.remoteStream = new MediaStream([...existingTracks, ev.track]);
      this.remoteStreamListeners.forEach((cb) => cb(this.remoteStream!));
    };

    this.peers.set(peerUid, link);
    if (this.localStream && this.role === 'host') {
      this.syncTracksOnPeer(link);
    }
    this.updateStats({ peerCount: this.peers.size });
    return link;
  }

  private async handleIncomingSignal(sig: SignalingMessage): Promise<void> {
    if (!this.roomId || sig.senderUid === this.localUid) return;
    if (sig.targetUid && sig.targetUid !== this.localUid) return;

    if (sig.type === 'bye') {
      this.disconnectPeer(sig.senderUid);
      return;
    }

    if (sig.type === 'renegotiate') {
      if (this.role !== 'host') return;
      let shouldReset = false;
      try {
        const parsed = JSON.parse(sig.payload || '{}');
        shouldReset = Boolean(parsed?.resetPeer);
      } catch {}

      const existing = this.peers.get(sig.senderUid);
      const now = performance.now();
      if (existing) {
        // Ignore rapid duplicate renegotiate pulses while an offer is already in flight
        if (now - existing.lastRenegotiateAt < 700) {
          return;
        }
        if (shouldReset && (existing.makingOffer || now - existing.lastOfferSentAt < 900)) {
          shouldReset = false;
        }
      }

      const isDead =
        !existing ||
        shouldReset ||
        existing.pc.connectionState === 'failed' ||
        existing.pc.connectionState === 'closed' ||
        existing.pc.iceConnectionState === 'failed' ||
        existing.pc.iceConnectionState === 'closed';

      if (existing && isDead) {
        this.disconnectPeer(sig.senderUid);
      }
      const link = this.ensurePeerLink(sig.senderUid);
      link.lastRenegotiateAt = now;
      if (this.localStream) {
        this.syncTracksOnPeer(link);
      }
      this.connectToPeer(sig.senderUid, true);
      return;
    }

    const link = this.ensurePeerLink(sig.senderUid);
    const epoch = this.sessionEpoch;

    link.signalQueue = link.signalQueue
      .then(async () => {
        if (epoch !== this.sessionEpoch || !this.roomId) return;
        const pc = link.pc;
        if (pc.signalingState === 'closed' || pc.connectionState === 'closed') return;

        if (sig.type === 'offer' || sig.type === 'answer') {
          const desc = JSON.parse(sig.payload) as RTCSessionDescriptionInit;

          // Ignore stale or duplicate answers when peer connection is already stable (prevents InvalidStateError)
          if (desc.type === 'answer' && pc.signalingState !== 'have-local-offer') {
            return;
          }

          const polite = this.role !== 'host';
          const offerCollision = desc.type === 'offer' && (link.makingOffer || pc.signalingState !== 'stable');
          link.ignoreOffer = !polite && offerCollision;
          if (link.ignoreOffer) return;

          if (offerCollision) {
            await Promise.all([
              pc.setLocalDescription({ type: 'rollback' }),
              pc.setRemoteDescription(desc),
            ]);
          } else {
            await pc.setRemoteDescription(desc);
          }

          // Flush queued ICE candidates
          while (link.pendingCandidates.length > 0) {
            const cand = link.pendingCandidates.shift();
            if (cand) {
              await pc.addIceCandidate(cand).catch(() => {});
            }
          }

          if (desc.type === 'offer') {
            const answer = await pc.createAnswer();
            if (epoch !== this.sessionEpoch || !this.roomId || (pc.connectionState as string) === 'closed') return;
            const tunedAnswer: RTCSessionDescriptionInit = {
              type: answer.type,
              sdp: answer.sdp ? optimizeSdpForLowLatency(answer.sdp) : answer.sdp,
            };
            await pc.setLocalDescription(tunedAnswer);
            await roomService.sendSignal(this.roomId, {
              roomId: this.roomId,
              senderUid: this.localUid,
              targetUid: sig.senderUid,
              type: 'answer',
              payload: JSON.stringify(pc.localDescription),
            });
          } else if (desc.type === 'answer' && link.needsRenegotiate && this.role === 'host') {
            link.needsRenegotiate = false;
            this.connectToPeer(sig.senderUid, true);
          }
        } else if (sig.type === 'candidate') {
          const cand = JSON.parse(sig.payload) as RTCIceCandidateInit;
          if (!pc.remoteDescription) {
            link.pendingCandidates.push(cand);
          } else {
            await pc.addIceCandidate(cand).catch(() => {});
          }
        }
      })
      .catch((err) => {
        console.warn('WebRTC signaling handler error:', err);
      });
  }

  public sendInputBitmask(mask: number): void {
    this.inputSeq = (this.inputSeq + 1) & 0xffff;
    let sentP2P = false;

    const packet = new Uint16Array([mask, this.inputSeq]);
    for (const peer of this.peers.values()) {
      if (peer.inputChannel.readyState === 'open') {
        try {
          peer.inputChannel.send(packet.buffer);
          sentP2P = true;
        } catch {}
      } else if (peer.controlChannel.readyState === 'open') {
        try {
          peer.controlChannel.send(JSON.stringify({ type: 'input_mask', mask, seq: this.inputSeq }));
          sentP2P = true;
        } catch {}
      }
    }

    // Fallback to WS relay if P2P DataChannel isn't open
    if (!sentP2P) {
      roomService.sendRelayInput(mask, this.inputSeq);
    }
  }

  public setFrameFallbackNeeded(active: boolean): void {
    if (this.role === 'host') {
      this.dcFrameFallbackRequested = active;
      return;
    }
    for (const peer of this.peers.values()) {
      if (peer.controlChannel.readyState === 'open') {
        try {
          peer.controlChannel.send(JSON.stringify({ type: 'need_frame_fallback', active }));
        } catch {}
      }
    }
  }

  public isDataChannelFrameFallbackActive(): boolean {
    if (this.role !== 'host' || !this.dcFrameFallbackRequested) return false;
    for (const peer of this.peers.values()) {
      if (peer.frameChannel.readyState === 'open' && peer.frameChannel.bufferedAmount < 262_144) {
        return true;
      }
    }
    return false;
  }

  public sendDataChannelFrame(frameDataUrl: string): void {
    if (frameDataUrl.length > 180_000) return;
    for (const peer of this.peers.values()) {
      if (peer.frameChannel.readyState === 'open' && peer.frameChannel.bufferedAmount < 524_288) {
        try {
          peer.frameChannel.send(frameDataUrl);
        } catch {}
      }
    }
  }

  public isUsingRelayFallback(): boolean {
    if (this.peers.size === 0) return false;
    for (const peer of this.peers.values()) {
      if (peer.pc.iceConnectionState === 'connected' || peer.pc.iceConnectionState === 'completed') {
        return false;
      }
    }
    return this.wsFallbackActive;
  }

  public getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  public getStats(): NetplayTelemetryStats {
    return this.currentStats;
  }

  public subscribeStats(cb: (stats: NetplayTelemetryStats) => void): () => void {
    this.statsListeners.add(cb);
    cb(this.currentStats);
    return () => this.statsListeners.delete(cb);
  }

  public onRemoteStream(cb: (stream: MediaStream) => void): () => void {
    this.remoteStreamListeners.add(cb);
    if (this.remoteStream) cb(this.remoteStream);
    return () => this.remoteStreamListeners.delete(cb);
  }

  public onRemoteInput(cb: (mask: number, senderUid: string) => void): () => void {
    this.remoteInputListeners.add(cb);
    return () => this.remoteInputListeners.delete(cb);
  }

  public onRelayFrame(cb: (frameDataUrl: string) => void): () => void {
    this.relayFrameListeners.add(cb);
    return () => this.relayFrameListeners.delete(cb);
  }

  private async collectStats(): Promise<void> {
    const firstPeer = this.peers.values().next().value as PeerLink | undefined;
    if (!firstPeer) return;

    try {
      const report = await firstPeer.pc.getStats();
      let selectedPair: any = null;
      let localCandidateType = '';
      let remoteCandidateType = '';
      let fps = 0;
      let packetsLost = 0;
      let packetsTotal = 0;
      let jitterMs = 0;
      let totalBytes = 0;

      const localCandidates = new Map<string, any>();
      const remoteCandidates = new Map<string, any>();

      report.forEach((stat: any) => {
        if (stat.type === 'local-candidate') localCandidates.set(stat.id, stat);
        if (stat.type === 'remote-candidate') remoteCandidates.set(stat.id, stat);
      });

      report.forEach((stat: any) => {
        if (stat.type === 'candidate-pair' && (stat.nominated || stat.state === 'succeeded')) {
          selectedPair = stat;
        }
        if (stat.type === 'inbound-rtp' && stat.kind === 'video') {
          fps = stat.framesPerSecond || fps;
          packetsLost += stat.packetsLost || 0;
          packetsTotal += (stat.packetsReceived || 0) + (stat.packetsLost || 0);
          jitterMs = stat.jitter ? Math.round(stat.jitter * 1000) : jitterMs;
          totalBytes += stat.bytesReceived || 0;
        }
        if (stat.type === 'outbound-rtp' && stat.kind === 'video') {
          fps = stat.framesPerSecond || fps;
          totalBytes += stat.bytesSent || 0;
        }
      });

      let mode: NetplayTransportMode = this.wsFallbackActive ? 'ws-relay' : 'handshaking';
      let rttMs = this.currentStats.rttMs;

      if (selectedPair) {
        if (typeof selectedPair.currentRoundTripTime === 'number') {
          rttMs = Math.max(1, Math.round(selectedPair.currentRoundTripTime * 1000));
        }
        const lc = localCandidates.get(selectedPair.localCandidateId);
        const rc = remoteCandidates.get(selectedPair.remoteCandidateId);
        localCandidateType = lc?.candidateType || '';
        remoteCandidateType = rc?.candidateType || '';

        if (localCandidateType === 'relay' || remoteCandidateType === 'relay') {
          mode = 'ws-relay';
        } else if (localCandidateType === 'host' && remoteCandidateType === 'host') {
          mode = 'p2p-lan';
        } else if (firstPeer.pc.iceConnectionState === 'connected' || firstPeer.pc.iceConnectionState === 'completed') {
          mode = 'p2p-stun';
        }
      }

      const now = performance.now();
      const dtSec = Math.max(0.2, (now - firstPeer.lastStatsAt) / 1000);
      const prevBytes = this.role === 'host' ? firstPeer.lastBytesSent : firstPeer.lastBytesRecv;
      const bitrateKbps = prevBytes > 0 ? Math.max(0, Math.round(((totalBytes - prevBytes) * 8) / dtSec / 1000)) : 0;
      if (this.role === 'host') firstPeer.lastBytesSent = totalBytes;
      else firstPeer.lastBytesRecv = totalBytes;
      firstPeer.lastStatsAt = now;

      const lossPct = packetsTotal > 0 ? Math.round((packetsLost / packetsTotal) * 1000) / 10 : 0;

      this.updateStats({
        connectionState: firstPeer.pc.connectionState,
        iceConnectionState: firstPeer.pc.iceConnectionState,
        dataChannelState: firstPeer.inputChannel.readyState,
        transportMode: mode,
        rttMs,
        jitterMs,
        bitrateKbps,
        fps: Math.round(fps),
        packetLossPct: lossPct,
        peerCount: this.peers.size,
      });
    } catch {}
  }

  private updateStats(patch: Partial<NetplayTelemetryStats>): void {
    this.currentStats = { ...this.currentStats, ...patch };
    this.statsListeners.forEach((cb) => cb(this.currentStats));
  }
}

export const webrtcNetplay = new WebRTCNetplayManager();
