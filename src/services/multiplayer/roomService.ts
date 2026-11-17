import { auth, db, handleFirestoreError, OperationType, isFirestoreReachable } from '../firebase';
import firebaseConfig from '../../../firebase-applet-config.json';
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { NetPlayRoom, ChatMessage, SignalingMessage, Platform } from '../../types';

export interface CreateRoomInput {
  gameId: string;
  gameTitle: string;
  platform: Platform;
  isPublic?: boolean;
  rollbackFrames?: number;
  inputDelayTarget?: string;
  hostName?: string;
}

export interface PlayerProfile {
  uid: string;
  displayName: string;
  photoURL?: string;
}

export type ServerConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'cloud-p2p'
  | 'reconnecting'
  | 'disconnected';

export type TransportMode = 'probing' | 'ws' | 'cloud-p2p';

const TAB_UID_KEY = 'retroverse_tab_player_uid';
const GUEST_DEVICE_UID_KEY = 'retroverse_guest_device_uid';
const NICKNAME_KEY = 'retroverse_player_nickname';

export function generateRoomCode(platform: Platform): string {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `RV-${num}-${platform}`;
}

export function getOrCreatePlayerProfile(): PlayerProfile {
  const user = auth.currentUser;
  let guestUid = '';
  let storedNick = '';

  try {
    // Persist unauthenticated Guest UID in localStorage so closing & re-opening the invite link
    // in the same browser reclaims the same Port 2 identity instead of creating ghost duplicates.
    guestUid = localStorage.getItem(GUEST_DEVICE_UID_KEY) || sessionStorage.getItem(TAB_UID_KEY) || '';
    if (!guestUid) {
      guestUid = `player-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    }
    localStorage.setItem(GUEST_DEVICE_UID_KEY, guestUid);
    sessionStorage.setItem(TAB_UID_KEY, guestUid);
    storedNick = localStorage.getItem(NICKNAME_KEY) || '';
  } catch {
    guestUid = `player-${Math.random().toString(36).substring(2, 8)}`;
  }

  if (user) {
    return {
      uid: user.uid,
      displayName: user.displayName || storedNick || 'RetroPlayer',
      photoURL: user.photoURL || undefined,
    };
  }

  if (!storedNick) {
    storedNick = `Player-${guestUid.slice(-4).toUpperCase()}`;
  }

  return {
    uid: guestUid,
    displayName: storedNick,
  };
}

export function setLocalPlayerName(name: string): void {
  const clean = name.trim().slice(0, 32);
  if (!clean) return;
  try {
    localStorage.setItem(NICKNAME_KEY, clean);
  } catch {}
  roomService.sendHello();
}

interface PendingRequest {
  resolve: (data: any) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class RoomService {
  private ws: WebSocket | null = null;
  private status: ServerConnectionStatus = 'connecting';
  private transport: TransportMode = 'probing';
  private probePromise: Promise<TransportMode> | null = null;
  private resolvedWsUrl: string | null = null;

  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private lastServerRttMs = 0;

  private activeRoom: NetPlayRoom | null = null;
  private activeRoomId: string | null = null;
  private activeLocalUid: string | null = null;
  private prevRoomStatus: string | null = null;
  private messages: ChatMessage[] = [];
  private publicRooms: NetPlayRoom[] = [];
  private lobbySubscribed = false;

  // Firestore listeners (used when static CDN hosting lacks Node /ws/netplay)
  private cloudPublicUnsub: Unsubscribe | null = null;
  private cloudRoomUnsubs = new Map<string, Unsubscribe>();
  private cloudMsgUnsubs = new Map<string, Unsubscribe>();
  private cloudSigUnsubs = new Map<string, Unsubscribe>();
  private seenSignalIdsByRoom = new Map<string, Set<string>>();
  private signalSinceByRoom = new Map<string, number>();

  private pendingRequests = new Map<string, PendingRequest>();

  private statusListeners = new Set<(status: ServerConnectionStatus, rttMs: number) => void>();
  private publicRoomsListeners = new Set<(rooms: NetPlayRoom[]) => void>();
  private roomListeners = new Map<string, Set<(room: NetPlayRoom | null) => void>>();
  private messageListeners = new Map<string, Set<(messages: ChatMessage[]) => void>>();
  private signalListeners = new Map<string, Set<(signal: SignalingMessage) => void>>();
  private launchListeners = new Set<(room: NetPlayRoom) => void>();
  private relayInputListeners = new Set<(mask: number, senderUid: string) => void>();
  private relayFrameListeners = new Set<(frameDataUrl: string) => void>();
  private cachedIdToken: string | null = null;
  private unloadListenersAttached = false;

  constructor() {
    this.initTokenAndUnloadHooks();
  }

  private initTokenAndUnloadHooks(): void {
    if (typeof window === 'undefined' || this.unloadListenersAttached) return;
    this.unloadListenersAttached = true;

    try {
      auth.onIdTokenChanged(async (user) => {
        if (user) {
          try {
            this.cachedIdToken = await user.getIdToken();
          } catch {
            this.cachedIdToken = null;
          }
        } else {
          this.cachedIdToken = null;
        }
      });
    } catch {}

    const handlePageUnload = () => {
      this.cleanupRoomMembershipOnUnload();
    };
    window.addEventListener('pagehide', handlePageUnload);
    window.addEventListener('beforeunload', handlePageUnload);
  }

  public getActiveRoom(): NetPlayRoom | null {
    return this.activeRoom;
  }

  private cleanupRoomMembershipOnUnload(): void {
    const room = this.activeRoom;
    const roomId = room?.id || this.activeRoomId;
    if (!room || !roomId) return;

    const currentUid = auth.currentUser?.uid || this.activeLocalUid || getOrCreatePlayerProfile().uid;
    const isHost = Boolean(auth.currentUser?.uid && room.hostUid === auth.currentUser.uid);
    const isGuest = Boolean(!isHost && currentUid && room.guestUid === currentUid);

    if (!isHost && !isGuest) return;

    // Prevent duplicate execution across beforeunload + pagehide
    this.activeRoom = null;
    this.activeRoomId = null;
    this.activeLocalUid = null;
    this.prevRoomStatus = null;
    this.messages = [];

    if (this.transport === 'ws') {
      this.sendRaw({ type: 'room:leave' });
      return;
    }

    const dbId = (firebaseConfig as any).firestoreDatabaseId || '(default)';
    const baseDocUrl = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${encodeURIComponent(dbId)}/documents/rooms/${encodeURIComponent(roomId)}`;

    if (isHost) {
      try {
        deleteDoc(doc(db, 'rooms', roomId)).catch(() => {});
      } catch {}

      if (this.cachedIdToken) {
        try {
          fetch(baseDocUrl, {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${this.cachedIdToken}`,
            },
            keepalive: true,
          }).catch(() => {});
        } catch {}
      }
      return;
    }

    // Guest unload: notify Host and free Port 2 cleanly so Host never sees a stale Ghost guest
    try {
      const byeSigId = `sig-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const byeSignal = {
        id: byeSigId,
        roomId,
        senderUid: currentUid,
        targetUid: room.hostUid,
        type: 'candidate',
        payload: JSON.stringify({ __retroCtrl: 'bye', payload: 'unload' }),
        createdAt: new Date().toISOString(),
      };
      setDoc(doc(db, 'rooms', roomId, 'signals', byeSigId), byeSignal).catch(() => {});
    } catch {}

    const nextStatus = room.status === 'ready' ? 'waiting' : room.status;
    const nowIso = new Date().toISOString();

    try {
      updateDoc(doc(db, 'rooms', roomId), {
        guestUid: null,
        guestName: null,
        guestAvatar: null,
        guestReady: false,
        status: nextStatus,
        updatedAt: nowIso,
      }).catch(() => {});
    } catch {}

    try {
      const apiKeyParam = firebaseConfig.apiKey ? `key=${encodeURIComponent(firebaseConfig.apiKey)}&` : '';
      const maskParams = [
        'guestUid',
        'guestName',
        'guestAvatar',
        'guestReady',
        'status',
        'updatedAt',
      ]
        .map((f) => `updateMask.fieldPaths=${f}`)
        .join('&');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.cachedIdToken) {
        headers.Authorization = `Bearer ${this.cachedIdToken}`;
      }
      fetch(`${baseDocUrl}?${apiKeyParam}${maskParams}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          fields: {
            guestUid: { nullValue: null },
            guestName: { nullValue: null },
            guestAvatar: { nullValue: null },
            guestReady: { booleanValue: false },
            status: { stringValue: nextStatus },
            updatedAt: { stringValue: nowIso },
          },
        }),
        keepalive: true,
      }).catch(() => {});
    } catch {}
  }

  private getDefaultWsUrl(): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws/netplay`;
  }

  public getTransportMode(): TransportMode {
    return this.transport;
  }

  /**
   * Probes whether the current origin (or VITE_NETPLAY_WS_URL) exposes a real Node WebSocket backend.
   * On static CDNs like Vercel, /api/netplay/health returns text/html (index.html), so we cleanly
   * avoid opening a failing WebSocket and switch immediately to Cloud Firestore P2P signaling.
   */
  private async detectTransport(): Promise<TransportMode> {
    if (this.transport !== 'probing') {
      return this.transport;
    }
    if (this.probePromise) {
      return this.probePromise;
    }

    this.probePromise = (async () => {
      const configuredWsUrl = (import.meta as any).env?.VITE_NETPLAY_WS_URL?.trim();
      if (configuredWsUrl) {
        this.resolvedWsUrl = configuredWsUrl;
        this.transport = 'ws';
        return 'ws';
      }

      if (typeof window === 'undefined') {
        this.transport = 'cloud-p2p';
        return 'cloud-p2p';
      }

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2500);
        const res = await fetch('/api/netplay/health', {
          method: 'GET',
          cache: 'no-store',
          signal: controller.signal,
        });
        clearTimeout(timeout);

        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.includes('application/json')) {
          const data = await res.json().catch(() => null);
          if (data && data.status === 'ok') {
            this.resolvedWsUrl = this.getDefaultWsUrl();
            this.transport = 'ws';
            return 'ws';
          }
        }
      } catch {
        // Static CDN or offline -> switch gracefully to Cloud P2P signaling
      }

      this.transport = 'cloud-p2p';
      this.updateStatus('cloud-p2p');
      this.activateCloudSubscriptions();
      return 'cloud-p2p';
    })();

    return this.probePromise;
  }

  private activateCloudSubscriptions(): void {
    if ((this.lobbySubscribed || this.publicRoomsListeners.size > 0) && !this.cloudPublicUnsub) {
      this.startCloudPublicRoomsListener();
    }
    for (const roomId of this.roomListeners.keys()) {
      if (!this.cloudRoomUnsubs.has(roomId)) {
        this.startCloudRoomListener(roomId);
      }
    }
    for (const roomId of this.messageListeners.keys()) {
      if (!this.cloudMsgUnsubs.has(roomId)) {
        this.startCloudMessagesListener(roomId);
      }
    }
    for (const roomId of this.signalListeners.keys()) {
      if (!this.cloudSigUnsubs.has(roomId)) {
        this.startCloudSignalsListener(roomId);
      }
    }
  }

  public ensureConnected(): void {
    if (this.transport === 'cloud-p2p') {
      if (this.status !== 'cloud-p2p') {
        this.updateStatus('cloud-p2p');
      }
      return;
    }

    if (this.transport === 'probing') {
      this.updateStatus('connecting');
      this.detectTransport().then((mode) => {
        if (mode === 'ws') {
          this.openWebSocket();
        }
      });
      return;
    }

    this.openWebSocket();
  }

  private openWebSocket(): void {
    if (!this.resolvedWsUrl) {
      this.resolvedWsUrl = this.getDefaultWsUrl();
    }
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.updateStatus(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting');

    try {
      const ws = new WebSocket(this.resolvedWsUrl);
      this.ws = ws;

      ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.updateStatus('connected');
        this.sendHello();

        if (this.lobbySubscribed || this.publicRoomsListeners.size > 0) {
          this.sendRaw({ type: 'lobby:subscribe' });
        }

        if (this.activeRoomId) {
          const profile = getOrCreatePlayerProfile();
          this.sendRaw({
            type: 'room:join',
            codeOrId: this.activeRoomId,
            uid: profile.uid,
            displayName: profile.displayName,
            photoURL: profile.photoURL,
          });
        }

        if (this.pingTimer) clearInterval(this.pingTimer);
        this.pingTimer = setInterval(() => {
          this.sendRaw({
            type: 'ping',
            clientTime: performance.now(),
            lastRttMs: this.lastServerRttMs,
          });
        }, 2500);
        this.sendRaw({ type: 'ping', clientTime: performance.now() });
      };

      ws.onmessage = (ev) => {
        let msg: Record<string, any>;
        try {
          msg = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        this.handleServerMessage(msg);
      };

      ws.onclose = () => {
        this.ws = null;
        if (this.pingTimer) {
          clearInterval(this.pingTimer);
          this.pingTimer = null;
        }
        if (this.reconnectAttempts >= 3 && isFirestoreReachable()) {
          // Graceful fallback to Cloud P2P if custom WS server becomes unreachable
          this.transport = 'cloud-p2p';
          this.updateStatus('cloud-p2p');
          this.activateCloudSubscriptions();
          return;
        }
        this.updateStatus('reconnecting');
        this.scheduleReconnect();
      };

      ws.onerror = () => {
        // onclose handles backoff / fallback
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.transport !== 'ws') return;
    const delay = Math.min(5000, 500 * Math.pow(1.6, this.reconnectAttempts));
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openWebSocket();
    }, delay);
  }

  public sendHello(): void {
    if (this.transport !== 'ws') return;
    const profile = getOrCreatePlayerProfile();
    this.sendRaw({
      type: 'hello',
      uid: profile.uid,
      displayName: profile.displayName,
    });
  }

  private sendRaw(payload: Record<string, unknown>): boolean {
    if (this.transport === 'ws' && this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(payload));
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  private waitForSocketOpen(timeoutMs = 5000): Promise<void> {
    this.ensureConnected();
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        if (this.transport === 'cloud-p2p') {
          resolve();
          return;
        }
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          resolve();
        } else if (Date.now() - start > timeoutMs) {
          reject(new Error('Không thể kết nối tới máy chủ NetPlay. Vui lòng thử lại.'));
        } else {
          setTimeout(check, 60);
        }
      };
      check();
    });
  }

  private async request<T>(payload: Record<string, unknown>): Promise<T> {
    await this.waitForSocketOpen();
    if (this.transport !== 'ws') {
      throw new Error('Không dùng request WebSocket ở chế độ Cloud P2P.');
    }
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Hết thời gian phản hồi từ máy chủ NetPlay.'));
      }, 6000);

      this.pendingRequests.set(requestId, { resolve, reject, timer });
      const sent = this.sendRaw({ ...payload, requestId });
      if (!sent) {
        clearTimeout(timer);
        this.pendingRequests.delete(requestId);
        reject(new Error('Kết nối WebSocket chưa sẵn sàng.'));
      }
    });
  }

  private handleServerMessage(msg: Record<string, any>): void {
    const type = String(msg.type || '');

    if (type === 'pong' && typeof msg.clientTime === 'number') {
      this.lastServerRttMs = Math.max(1, Math.round(performance.now() - msg.clientTime));
      this.statusListeners.forEach((cb) => cb(this.status, this.lastServerRttMs));
      return;
    }

    if (type === 'lobby:rooms') {
      this.publicRooms = Array.isArray(msg.rooms) ? msg.rooms : [];
      this.publicRoomsListeners.forEach((cb) => cb(this.publicRooms));
      return;
    }

    if (type === 'room:joined') {
      const room = msg.room as NetPlayRoom;
      const msgs = Array.isArray(msg.messages) ? (msg.messages as ChatMessage[]) : [];
      this.activeRoom = room;
      this.activeRoomId = room.id;
      this.activeLocalUid = getOrCreatePlayerProfile().uid;
      this.prevRoomStatus = room.status;
      this.messages = msgs;

      if (msg.requestId && this.pendingRequests.has(msg.requestId)) {
        const pending = this.pendingRequests.get(msg.requestId)!;
        clearTimeout(pending.timer);
        this.pendingRequests.delete(msg.requestId);
        pending.resolve(room);
      }

      this.notifyRoomListeners(room.id, room);
      this.notifyMessageListeners(room.id, msgs);
      return;
    }

    if (type === 'room:error') {
      if (msg.requestId && this.pendingRequests.has(msg.requestId)) {
        const pending = this.pendingRequests.get(msg.requestId)!;
        clearTimeout(pending.timer);
        this.pendingRequests.delete(msg.requestId);
        pending.reject(new Error(String(msg.error || 'Lỗi phòng chơi')));
      }
      return;
    }

    if (type === 'room:state') {
      const room = msg.room as NetPlayRoom;
      if (this.activeRoomId === room.id) {
        this.activeRoom = room;
        this.prevRoomStatus = room.status;
      }
      this.notifyRoomListeners(room.id, room);
      return;
    }

    if (type === 'room:launched') {
      const room = msg.room as NetPlayRoom;
      this.activeRoom = room;
      this.prevRoomStatus = room.status;
      this.notifyRoomListeners(room.id, room);
      this.launchListeners.forEach((cb) => cb(room));
      return;
    }

    if (type === 'room:closed') {
      const closedId = String(msg.roomId || '');
      if (this.activeRoomId === closedId) {
        this.activeRoom = null;
        this.activeRoomId = null;
        this.prevRoomStatus = null;
        this.messages = [];
      }
      this.notifyRoomListeners(closedId, null);
      return;
    }

    if (type === 'room:left') {
      if (msg.requestId && this.pendingRequests.has(msg.requestId)) {
        const pending = this.pendingRequests.get(msg.requestId)!;
        clearTimeout(pending.timer);
        this.pendingRequests.delete(msg.requestId);
        pending.resolve(undefined);
      }
      return;
    }

    if (type === 'room:message') {
      const chatMsg = msg.message as ChatMessage;
      if (chatMsg && chatMsg.roomId === this.activeRoomId) {
        if (!this.messages.some((m) => m.id === chatMsg.id)) {
          this.messages = [...this.messages, chatMsg];
          this.notifyMessageListeners(chatMsg.roomId, this.messages);
        }
      }
      return;
    }

    if (type === 'room:signal') {
      const sig = msg.signal as SignalingMessage;
      if (sig && sig.roomId) {
        const listeners = this.signalListeners.get(sig.roomId);
        if (listeners) {
          listeners.forEach((cb) => cb(sig));
        }
      }
      return;
    }

    if (type === 'room:relay_input') {
      const mask = Number(msg.mask || 0);
      const senderUid = String(msg.senderUid || '');
      this.relayInputListeners.forEach((cb) => cb(mask, senderUid));
      return;
    }

    if (type === 'room:relay_frame') {
      if (typeof msg.frame === 'string') {
        this.relayFrameListeners.forEach((cb) => cb(msg.frame));
      }
    }
  }

  private notifyRoomListeners(roomId: string, room: NetPlayRoom | null): void {
    const set = this.roomListeners.get(roomId);
    if (set) set.forEach((cb) => cb(room));
  }

  private notifyMessageListeners(roomId: string, msgs: ChatMessage[]): void {
    const set = this.messageListeners.get(roomId);
    if (set) set.forEach((cb) => cb(msgs));
  }

  private updateStatus(next: ServerConnectionStatus): void {
    this.status = next;
    this.statusListeners.forEach((cb) => cb(next, this.lastServerRttMs));
  }

  public getServerRttMs(): number {
    return this.lastServerRttMs;
  }

  public getConnectionStatus(): ServerConnectionStatus {
    return this.status;
  }

  public subscribeToConnectionStatus(cb: (status: ServerConnectionStatus, rttMs: number) => void): () => void {
    this.ensureConnected();
    this.statusListeners.add(cb);
    cb(this.status, this.lastServerRttMs);
    return () => this.statusListeners.delete(cb);
  }

  // ==================== PUBLIC API (DUAL-MODE WS + CLOUD FIRESTORE P2P) ====================

  public async createRoom(input: CreateRoomInput): Promise<NetPlayRoom> {
    await auth.authStateReady();
    if (!auth.currentUser || auth.currentUser.isAnonymous) {
      throw new Error('Máy tạo phòng (Host) cần bấm "Đăng nhập Google" để tạo phòng chơi.');
    }

    const mode = await this.detectTransport();
    const profile = getOrCreatePlayerProfile();

    if (mode === 'ws') {
      return this.request<NetPlayRoom>({
        type: 'room:create',
        hostUid: auth.currentUser.uid,
        hostName: input.hostName || auth.currentUser.displayName || profile.displayName,
        hostAvatar: auth.currentUser.photoURL || profile.photoURL,
        gameId: input.gameId,
        gameTitle: input.gameTitle,
        platform: input.platform,
        isPublic: input.isPublic !== undefined ? input.isPublic : true,
        rollbackFrames: input.rollbackFrames || 1,
        inputDelayTarget: input.inputDelayTarget || '0-1 Frame (Sub-16ms)',
      });
    }

    // Cloud Firestore P2P mode (Vercel / Static CDN)
    const code = generateRoomCode(input.platform);
    const roomId = code; // Using room code as doc ID enables direct `get` for both public & private invites without login
    const now = new Date().toISOString();
    const hostDisplayName = (input.hostName || auth.currentUser.displayName || profile.displayName).slice(0, 100);
    const newRoom: NetPlayRoom = {
      id: roomId,
      code,
      hostUid: auth.currentUser.uid,
      hostName: hostDisplayName,
      ...(auth.currentUser.photoURL ? { hostAvatar: auth.currentUser.photoURL } : {}),
      guestUid: null,
      guestName: null,
      guestAvatar: null,
      gameId: input.gameId,
      gameTitle: input.gameTitle.slice(0, 150),
      platform: input.platform,
      status: 'waiting',
      isPublic: input.isPublic !== undefined ? input.isPublic : true,
      hostReady: true,
      guestReady: false,
      pingMs: 0,
      hostPingMs: 0,
      spectators: [],
      rollbackFrames: input.rollbackFrames || 1,
      inputDelayTarget: input.inputDelayTarget || '0-1 Frame (Sub-16ms)',
      pauseAuthority: `Host Only (${hostDisplayName})`,
      createdAt: now,
      updatedAt: now,
    };

    try {
      this.cachedIdToken = await auth.currentUser.getIdToken().catch(() => this.cachedIdToken);
      const writePromise = setDoc(doc(db, 'rooms', roomId), newRoom);
      let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error('Không thể kết nối máy chủ phòng chơi (hết thời gian chờ). Vui lòng thử lại.'));
        }, 8000);
      });
      try {
        await Promise.race([writePromise, timeoutPromise]);
      } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle);
      }
      this.activeRoom = newRoom;
      this.activeRoomId = roomId;
      this.activeLocalUid = auth.currentUser.uid;
      this.prevRoomStatus = 'waiting';
      this.messages = [];
      return newRoom;
    } catch (err: any) {
      if (err?.message?.includes('hết thời gian chờ')) {
        throw err;
      }
      handleFirestoreError(err, OperationType.CREATE, `rooms/${roomId}`);
      throw err;
    }
  }

  public async joinRoomByCode(code: string, player?: PlayerProfile): Promise<NetPlayRoom> {
    await auth.authStateReady();
    const mode = await this.detectTransport();
    const profile = player || getOrCreatePlayerProfile();

    if (mode === 'ws') {
      return this.request<NetPlayRoom>({
        type: 'room:join',
        codeOrId: code.trim(),
        uid: profile.uid,
        displayName: profile.displayName,
        photoURL: profile.photoURL,
      });
    }

    // Cloud Firestore P2P mode: Guests can join via invite link WITHOUT Google Sign-In
    const clean = code.trim();
    const upper = clean.toUpperCase();
    let targetId = upper;
    let roomData: NetPlayRoom | null = null;

    try {
      const upperSnap = await getDoc(doc(db, 'rooms', upper));
      if (upperSnap.exists()) {
        targetId = upperSnap.id;
        roomData = upperSnap.data() as NetPlayRoom;
      } else if (clean !== upper) {
        const cleanSnap = await getDoc(doc(db, 'rooms', clean));
        if (cleanSnap.exists()) {
          targetId = cleanSnap.id;
          roomData = cleanSnap.data() as NetPlayRoom;
        }
      }

      if (!roomData) {
        try {
          const q = query(collection(db, 'rooms'), where('code', '==', upper));
          const qSnap = await getDocs(q);
          if (!qSnap.empty) {
            targetId = qSnap.docs[0].id;
            roomData = qSnap.docs[0].data() as NetPlayRoom;
          }
        } catch {
          // Query on private legacy rooms fails safely
        }
      }

      if (!roomData || roomData.status === 'closed') {
        throw new Error(`Không tìm thấy phòng có mã "${code}" hoặc phòng đã đóng.`);
      }

      const uid = auth.currentUser?.uid || profile.uid;
      const displayName = (auth.currentUser?.displayName || profile.displayName || 'Khách Port 2').slice(0, 100);
      const photoURL = auth.currentUser?.photoURL || null;

      if (roomData.hostUid === uid) {
        this.activeRoom = roomData;
        this.activeRoomId = targetId;
        this.activeLocalUid = uid;
        this.prevRoomStatus = roomData.status;
        return roomData;
      }

      // If previous Guest slot is clearly stale (>20s without update while in lobby), release it cleanly
      const updatedMs = roomData.updatedAt ? new Date(roomData.updatedAt).getTime() : 0;
      const isStaleGuestSlot =
        Boolean(roomData.guestUid) &&
        roomData.guestUid !== uid &&
        roomData.status !== 'playing' &&
        updatedMs > 0 &&
        Date.now() - updatedMs > 20_000;

      if (isStaleGuestSlot) {
        try {
          await updateDoc(doc(db, 'rooms', targetId), {
            guestUid: null,
            guestName: null,
            guestAvatar: null,
            guestReady: false,
            status: 'waiting',
            updatedAt: new Date().toISOString(),
          });
          roomData = {
            ...roomData,
            guestUid: null,
            guestName: null,
            guestAvatar: null,
            guestReady: false,
            status: 'waiting',
          };
        } catch {}
      }

      if (!roomData.guestUid || roomData.guestUid === uid) {
        const nextStatus: NetPlayRoom['status'] =
          roomData.status === 'playing'
            ? 'playing'
            : roomData.hostReady
            ? 'ready'
            : 'waiting';
        const updatedFields: Partial<NetPlayRoom> = {
          guestUid: uid,
          guestName: displayName,
          guestAvatar: photoURL,
          guestReady: true,
          status: nextStatus,
          updatedAt: new Date().toISOString(),
        };
        await updateDoc(doc(db, 'rooms', targetId), updatedFields);
        roomData = { ...roomData, ...updatedFields };
      }

      this.activeRoom = roomData;
      this.activeRoomId = targetId;
      this.activeLocalUid = uid;
      this.prevRoomStatus = roomData.status;
      return roomData;
    } catch (err: any) {
      if (err?.message?.includes('Không tìm thấy phòng')) throw err;
      handleFirestoreError(err, OperationType.GET, `rooms/${targetId}`);
      throw err;
    }
  }

  public async joinRoomById(roomId: string, player?: PlayerProfile): Promise<NetPlayRoom> {
    return this.joinRoomByCode(roomId, player);
  }

  public async clearGuestSlot(roomId: string): Promise<void> {
    if (this.transport === 'ws') {
      await this.waitForSocketOpen();
      this.sendRaw({ type: 'room:kick_guest' });
      return;
    }
    try {
      const snap = await getDoc(doc(db, 'rooms', roomId));
      if (!snap.exists()) return;
      const cur = snap.data() as NetPlayRoom;
      await updateDoc(doc(db, 'rooms', roomId), {
        guestUid: null,
        guestName: null,
        guestAvatar: null,
        guestReady: false,
        status: cur.status === 'ready' ? 'waiting' : cur.status,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `rooms/${roomId}`);
    }
  }

  public async toggleReady(roomId: string, isHost: boolean, nextReadyState: boolean): Promise<void> {
    if (this.transport === 'ws') {
      await this.waitForSocketOpen();
      this.sendRaw({ type: 'room:ready', ready: nextReadyState });
      return;
    }

    const roomRef = doc(db, 'rooms', roomId);
    try {
      const snap = await getDoc(roomRef);
      if (!snap.exists()) return;
      const cur = snap.data() as NetPlayRoom;
      const hostReady = isHost ? nextReadyState : cur.hostReady;
      const guestReady = !isHost ? nextReadyState : cur.guestReady;
      const status = cur.status === 'playing' ? 'playing' : hostReady && guestReady ? 'ready' : 'waiting';
      await updateDoc(roomRef, {
        [isHost ? 'hostReady' : 'guestReady']: nextReadyState,
        status,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `rooms/${roomId}`);
    }
  }

  public async updateRoomGame(roomId: string, gameId: string, gameTitle: string, platform: Platform): Promise<void> {
    if (this.transport === 'ws') {
      await this.waitForSocketOpen();
      this.sendRaw({ type: 'room:change_game', gameId, gameTitle, platform });
      return;
    }

    try {
      await updateDoc(doc(db, 'rooms', roomId), {
        gameId,
        gameTitle,
        platform,
        hostReady: true,
        guestReady: false,
        status: 'waiting',
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `rooms/${roomId}`);
    }
  }

  public async launchMatch(roomId?: string): Promise<void> {
    if (this.transport === 'ws') {
      await this.waitForSocketOpen();
      this.sendRaw({ type: 'room:launch' });
      return;
    }

    const targetId = roomId || this.activeRoomId;
    if (!targetId) return;
    this.activeRoomId = targetId;
    try {
      await updateDoc(doc(db, 'rooms', targetId), {
        status: 'playing',
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `rooms/${targetId}`);
    }
  }

  public async stopMatch(): Promise<void> {
    if (this.transport === 'ws') {
      await this.waitForSocketOpen();
      this.sendRaw({ type: 'room:stop_match' });
      return;
    }

    if (!this.activeRoomId) return;
    try {
      const snap = await getDoc(doc(db, 'rooms', this.activeRoomId));
      if (!snap.exists()) return;
      const cur = snap.data() as NetPlayRoom;
      await updateDoc(doc(db, 'rooms', this.activeRoomId), {
        status: cur.hostReady && cur.guestReady ? 'ready' : 'waiting',
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `rooms/${this.activeRoomId}`);
    }
  }

  public async leaveRoom(roomId?: string, playerUid?: string): Promise<void> {
    const previousRoom = this.activeRoom;
    const targetId = roomId || this.activeRoomId;
    const targetUid = playerUid || auth.currentUser?.uid || this.activeLocalUid || getOrCreatePlayerProfile().uid;
    this.activeRoom = null;
    this.activeRoomId = null;
    this.activeLocalUid = null;
    this.prevRoomStatus = null;
    this.messages = [];

    if (this.transport === 'ws') {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.sendRaw({ type: 'room:leave' });
      }
      return;
    }

    if (!targetId) return;
    if (!auth.currentUser) {
      await auth.authStateReady();
    }

    const roomRef = doc(db, 'rooms', targetId);
    const knownHost =
      Boolean(auth.currentUser) &&
      Boolean(previousRoom && previousRoom.id === targetId && previousRoom.hostUid === auth.currentUser?.uid);

    try {
      if (knownHost) {
        await deleteDoc(roomRef);
        return;
      }

      const snap = await getDoc(roomRef);
      if (!snap.exists()) return;
      const cur = snap.data() as NetPlayRoom;
      if (auth.currentUser && cur.hostUid === auth.currentUser.uid) {
        await deleteDoc(roomRef);
      } else if (cur.guestUid === targetUid) {
        await updateDoc(roomRef, {
          guestUid: null,
          guestName: null,
          guestAvatar: null,
          guestReady: false,
          status: cur.status === 'ready' ? 'waiting' : cur.status,
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (err: any) {
      if (err?.code === 'permission-denied') {
        handleFirestoreError(err, OperationType.DELETE, `rooms/${targetId}`);
      }
    }
  }

  // ==================== CLOUD FIRESTORE LISTENERS ====================

  private startCloudRoomListener(roomId: string): void {
    if (this.cloudRoomUnsubs.has(roomId) || !isFirestoreReachable()) return;
    const unsub = onSnapshot(
      doc(db, 'rooms', roomId),
      (snap) => {
        if (!snap.exists()) {
          this.notifyRoomListeners(roomId, null);
          return;
        }
        const room = snap.data() as NetPlayRoom;
        if (room.status === 'closed') {
          this.notifyRoomListeners(roomId, null);
          return;
        }
        const wasPlaying = this.prevRoomStatus === 'playing';
        if (this.activeRoomId === roomId) {
          this.activeRoom = room;
          this.prevRoomStatus = room.status;
        }
        this.notifyRoomListeners(roomId, room);

        if (room.status === 'playing' && !wasPlaying) {
          this.launchListeners.forEach((cb) => cb(room));
        }
      },
      (err) => {
        if ((err as any)?.code === 'permission-denied') {
          handleFirestoreError(err, OperationType.GET, `rooms/${roomId}`);
        }
      }
    );
    this.cloudRoomUnsubs.set(roomId, unsub);
  }

  private startCloudPublicRoomsListener(): void {
    if (this.cloudPublicUnsub || !isFirestoreReachable()) return;
    const q = query(collection(db, 'rooms'), where('isPublic', '==', true));
    this.cloudPublicUnsub = onSnapshot(
      q,
      (snap) => {
        const list: NetPlayRoom[] = [];
        const cutoffMs = Date.now() - 6 * 60 * 60 * 1000;
        snap.forEach((d) => {
          const r = d.data() as NetPlayRoom;
          const updatedAtMs = r.updatedAt ? new Date(r.updatedAt).getTime() : Date.now();
          if (r.status !== 'closed' && updatedAtMs > cutoffMs) {
            list.push(r);
          }
        });
        list.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
        this.publicRooms = list;
        this.publicRoomsListeners.forEach((cb) => cb(list));
      },
      (err) => {
        if ((err as any)?.code === 'permission-denied') {
          handleFirestoreError(err, OperationType.LIST, 'rooms');
        }
      }
    );
  }

  private startCloudMessagesListener(roomId: string): void {
    if (this.cloudMsgUnsubs.has(roomId) || !isFirestoreReachable()) return;
    const q = query(collection(db, 'rooms', roomId, 'messages'), orderBy('timestamp', 'asc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const msgs: ChatMessage[] = [];
        snap.forEach((d) => msgs.push(d.data() as ChatMessage));
        if (this.activeRoomId === roomId) {
          this.messages = msgs;
        }
        this.notifyMessageListeners(roomId, msgs);
      },
      (err) => {
        if ((err as any)?.code === 'permission-denied') {
          handleFirestoreError(err, OperationType.LIST, `rooms/${roomId}/messages`);
        }
      }
    );
    this.cloudMsgUnsubs.set(roomId, unsub);
  }

  private startCloudSignalsListener(roomId: string): void {
    if (this.cloudSigUnsubs.has(roomId) || !isFirestoreReachable()) return;
    if (!this.seenSignalIdsByRoom.has(roomId)) {
      this.seenSignalIdsByRoom.set(roomId, new Set<string>());
    }
    if (!this.signalSinceByRoom.has(roomId)) {
      this.signalSinceByRoom.set(roomId, Date.now() - 12_000);
    }

    const seenSet = this.seenSignalIdsByRoom.get(roomId)!;
    const sinceMs = this.signalSinceByRoom.get(roomId)!;

    const q = query(collection(db, 'rooms', roomId, 'signals'), orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        snap.docChanges().forEach((change) => {
          if (change.type !== 'added') return;
          const rawSig = change.doc.data() as SignalingMessage;
          if (!rawSig || seenSet.has(rawSig.id)) return;
          seenSet.add(rawSig.id);

          // Ignore dead historical signals from earlier disconnected sessions
          const createdMs = rawSig.createdAt ? new Date(rawSig.createdAt).getTime() : Date.now();
          if (createdMs > 0 && createdMs < sinceMs) return;

          // Unwrap control signals (renegotiate / bye) sent safely through candidate rules
          let sig = rawSig;
          if (rawSig.type === 'candidate' && rawSig.payload.includes('__retroCtrl')) {
            try {
              const parsed = JSON.parse(rawSig.payload);
              if (parsed && parsed.__retroCtrl) {
                sig = {
                  ...rawSig,
                  type: parsed.__retroCtrl,
                  payload: typeof parsed.payload === 'string' ? parsed.payload : JSON.stringify(parsed.payload || {}),
                };
              }
            } catch {}
          }

          const listeners = this.signalListeners.get(roomId);
          if (listeners) {
            listeners.forEach((cb) => cb(sig));
          }
        });
      },
      (err) => {
        if ((err as any)?.code === 'permission-denied') {
          handleFirestoreError(err, OperationType.LIST, `rooms/${roomId}/signals`);
        }
      }
    );
    this.cloudSigUnsubs.set(roomId, unsub);
  }

  // ==================== SUBSCRIPTIONS ====================

  public subscribeToRoom(
    roomId: string,
    onUpdate: (room: NetPlayRoom | null) => void,
    _onError?: (err: unknown) => void
  ): () => void {
    this.ensureConnected();
    if (!this.roomListeners.has(roomId)) {
      this.roomListeners.set(roomId, new Set());
    }
    this.roomListeners.get(roomId)!.add(onUpdate);
    if (this.activeRoom && this.activeRoom.id === roomId) {
      onUpdate(this.activeRoom);
    }
    if (this.transport === 'cloud-p2p') {
      this.startCloudRoomListener(roomId);
    }

    return () => {
      const set = this.roomListeners.get(roomId);
      set?.delete(onUpdate);
      if (set && set.size === 0) {
        this.roomListeners.delete(roomId);
        this.cloudRoomUnsubs.get(roomId)?.();
        this.cloudRoomUnsubs.delete(roomId);
      }
    };
  }

  public subscribeToPublicRooms(
    onUpdate: (rooms: NetPlayRoom[]) => void,
    _onError?: (err: unknown) => void
  ): () => void {
    this.ensureConnected();
    this.lobbySubscribed = true;
    this.publicRoomsListeners.add(onUpdate);
    onUpdate(this.publicRooms);

    if (this.transport === 'ws') {
      this.sendRaw({ type: 'lobby:subscribe' });
    } else if (this.transport === 'cloud-p2p') {
      this.startCloudPublicRoomsListener();
    }

    return () => {
      this.publicRoomsListeners.delete(onUpdate);
      if (this.publicRoomsListeners.size === 0) {
        this.lobbySubscribed = false;
        this.sendRaw({ type: 'lobby:unsubscribe' });
        if (this.cloudPublicUnsub) {
          this.cloudPublicUnsub();
          this.cloudPublicUnsub = null;
        }
      }
    };
  }

  public async sendChatMessage(roomId: string, text: string, sender?: PlayerProfile): Promise<void> {
    if (this.transport === 'ws') {
      await this.waitForSocketOpen();
      this.sendRaw({
        type: 'room:chat',
        text,
        senderAvatar: sender?.photoURL,
      });
      return;
    }

    const profile = sender || getOrCreatePlayerProfile();
    const senderUid = auth.currentUser?.uid || profile.uid;
    const senderName = (auth.currentUser?.displayName || profile.displayName || 'Player').slice(0, 100);
    const msgId = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const msg: ChatMessage = {
      id: msgId,
      roomId,
      senderUid,
      senderName,
      ...(auth.currentUser?.photoURL ? { senderAvatar: auth.currentUser.photoURL } : {}),
      text: text.trim().slice(0, 500),
      timestamp: new Date().toISOString(),
    };
    try {
      await setDoc(doc(db, 'rooms', roomId, 'messages', msgId), msg);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `rooms/${roomId}/messages/${msgId}`);
    }
  }

  public subscribeToMessages(
    roomId: string,
    onUpdate: (messages: ChatMessage[]) => void,
    _onError?: (err: unknown) => void
  ): () => void {
    this.ensureConnected();
    if (!this.messageListeners.has(roomId)) {
      this.messageListeners.set(roomId, new Set());
    }
    this.messageListeners.get(roomId)!.add(onUpdate);
    if (this.activeRoomId === roomId) {
      onUpdate(this.messages);
    }
    if (this.transport === 'cloud-p2p') {
      this.startCloudMessagesListener(roomId);
    }

    return () => {
      const set = this.messageListeners.get(roomId);
      set?.delete(onUpdate);
      if (set && set.size === 0) {
        this.messageListeners.delete(roomId);
        this.cloudMsgUnsubs.get(roomId)?.();
        this.cloudMsgUnsubs.delete(roomId);
      }
    };
  }

  public async sendSignal(roomId: string, signal: Omit<SignalingMessage, 'id' | 'createdAt'>): Promise<void> {
    if (this.transport === 'ws') {
      await this.waitForSocketOpen();
      this.sendRaw({
        type: 'room:signal',
        targetUid: signal.targetUid,
        signalType: signal.type,
        payload: signal.payload,
      });
      return;
    }

    const senderUid = signal.senderUid || auth.currentUser?.uid || this.activeLocalUid || getOrCreatePlayerProfile().uid;
    const sigId = `sig-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    // Encode control signals safely under Firestore security rule's allowed types ['offer','answer','candidate']
    const isCtrlType = signal.type === 'renegotiate' || signal.type === 'bye';
    const wireType: SignalingMessage['type'] = isCtrlType ? 'candidate' : signal.type;
    const wirePayload = isCtrlType
      ? JSON.stringify({ __retroCtrl: signal.type, payload: signal.payload })
      : signal.payload.slice(0, 50000);

    const docData: SignalingMessage = {
      id: sigId,
      roomId,
      senderUid,
      targetUid: signal.targetUid,
      type: wireType,
      payload: wirePayload.slice(0, 50000),
      createdAt: new Date().toISOString(),
    };
    try {
      await setDoc(doc(db, 'rooms', roomId, 'signals', sigId), docData);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `rooms/${roomId}/signals/${sigId}`);
    }
  }

  public subscribeToSignals(
    roomId: string,
    userUid: string,
    onSignal: (signal: SignalingMessage) => void
  ): () => void {
    this.ensureConnected();
    if (!this.signalListeners.has(roomId)) {
      this.signalListeners.set(roomId, new Set());
      this.seenSignalIdsByRoom.set(roomId, new Set<string>());
      this.signalSinceByRoom.set(roomId, Date.now() - 12_000);
    }
    const handler = (sig: SignalingMessage) => {
      if (sig.senderUid !== userUid) {
        onSignal(sig);
      }
    };
    this.signalListeners.get(roomId)!.add(handler);
    if (this.transport === 'cloud-p2p') {
      this.startCloudSignalsListener(roomId);
    }

    return () => {
      const set = this.signalListeners.get(roomId);
      set?.delete(handler);
      if (set && set.size === 0) {
        this.signalListeners.delete(roomId);
        this.cloudSigUnsubs.get(roomId)?.();
        this.cloudSigUnsubs.delete(roomId);
        this.seenSignalIdsByRoom.delete(roomId);
        this.signalSinceByRoom.delete(roomId);
      }
    };
  }

  public subscribeToLaunch(cb: (room: NetPlayRoom) => void): () => void {
    this.launchListeners.add(cb);
    return () => this.launchListeners.delete(cb);
  }

  public reportPing(pingMs: number): void {
    if (this.transport === 'ws') {
      this.sendRaw({ type: 'room:ping_report', pingMs });
    } else if (this.activeRoomId && this.activeRoom) {
      const uid = auth.currentUser?.uid || getOrCreatePlayerProfile().uid;
      const field =
        this.activeRoom.hostUid === uid
          ? { hostPingMs: Math.round(pingMs), updatedAt: new Date().toISOString() }
          : this.activeRoom.guestUid === uid
          ? { guestPingMs: Math.round(pingMs), pingMs: Math.round(pingMs), updatedAt: new Date().toISOString() }
          : null;
      if (field) {
        updateDoc(doc(db, 'rooms', this.activeRoomId), field).catch(() => {});
      }
    }
  }

  public sendRelayInput(mask: number, seq: number): void {
    this.sendRaw({ type: 'room:relay_input', mask, seq });
  }

  public subscribeToRelayInput(cb: (mask: number, senderUid: string) => void): () => void {
    this.relayInputListeners.add(cb);
    return () => this.relayInputListeners.delete(cb);
  }

  public sendRelayFrame(frameDataUrl: string, width: number, height: number): void {
    this.sendRaw({ type: 'room:relay_frame', frame: frameDataUrl, width, height });
  }

  public subscribeToRelayFrame(cb: (frameDataUrl: string) => void): () => void {
    this.relayFrameListeners.add(cb);
    return () => this.relayFrameListeners.delete(cb);
  }
}

export const roomService = new RoomService();
