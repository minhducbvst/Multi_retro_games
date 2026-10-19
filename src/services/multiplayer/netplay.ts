import { NetPlayRoom, ChatMessage, Platform } from '../../types';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
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
  serverTimestamp,
  Unsubscribe
} from 'firebase/firestore';

export const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' }
];

export interface CreateRoomParams {
  gameId: string;
  gameTitle: string;
  platform: Platform;
  isPublic?: boolean;
  rollbackFrames?: number;
  inputDelayTarget?: string;
}

export function generateRoomCode(platform: string): string {
  const num = Math.floor(1000 + Math.random() * 9000);
  const plat = platform.toUpperCase().slice(0, 4);
  return `RV-${num}-${plat}`;
}

export class NetPlayManager {
  private activeRoomId: string | null = null;
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private broadcastChannel: BroadcastChannel | null = null;
  private localCandidatesQueue: RTCIceCandidateInit[] = [];
  private remoteDescriptionSet: boolean = false;
  private onInputCallbacks: Array<(port: 1 | 2, inputs: any) => void> = [];

  constructor() {
    // Local fallback channel for instantaneous multi-tab testing on same origin
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.broadcastChannel = new BroadcastChannel('retroverse-netplay-signaling');
        this.broadcastChannel.onmessage = (event) => {
          this.handleBroadcastMessage(event.data);
        };
      } catch (e) {
        console.warn("BroadcastChannel not available", e);
      }
    }
  }

  // 1. Create a new room in Firestore
  public async createRoom(params: CreateRoomParams): Promise<NetPlayRoom> {
    const user = auth.currentUser;
    const hostUid = user?.uid || `guest-${Date.now().toString(36)}`;
    const hostName = user?.displayName || 'Player 1 (Host)';
    const hostAvatar = user?.photoURL || 'https://images.unsplash.com/photo-1566492031773-4f4e44671857?w=150&auto=format&fit=crop&q=80';
    
    const roomId = `room-${Date.now()}`;
    const code = generateRoomCode(params.platform);

    const newRoom: NetPlayRoom = {
      id: roomId,
      code,
      hostUid,
      hostName,
      hostAvatar,
      gameId: params.gameId,
      gameTitle: params.gameTitle,
      platform: params.platform,
      status: 'waiting',
      isPublic: params.isPublic ?? true,
      hostReady: false,
      guestReady: false,
      pingMs: 14,
      spectators: [],
      rollbackFrames: params.rollbackFrames ?? 2,
      inputDelayTarget: params.inputDelayTarget ?? '1 Frame (16.6ms)',
      pauseAuthority: 'Host Only',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      await setDoc(doc(db, 'rooms', roomId), {
        ...newRoom,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      this.activeRoomId = roomId;

      // Broadcast room created for local multi-tab sync
      this.broadcastChannel?.postMessage({
        type: 'ROOM_CREATED',
        room: newRoom
      });

      return newRoom;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `rooms/${roomId}`);
      throw error;
    }
  }

  // 2. Join an existing room via Code or ID
  public async joinRoom(codeOrId: string): Promise<NetPlayRoom> {
    const cleanQuery = codeOrId.trim().toUpperCase();
    let targetDocId = codeOrId;
    let roomData: NetPlayRoom | null = null;

    try {
      // First try direct ID lookup
      const directDocRef = doc(db, 'rooms', codeOrId);
      const directSnap = await getDoc(directDocRef);

      if (directSnap.exists()) {
        targetDocId = directSnap.id;
        roomData = directSnap.data() as NetPlayRoom;
      } else {
        // Query by room code
        const roomsRef = collection(db, 'rooms');
        const q = query(roomsRef, where('code', '==', cleanQuery));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          const matchedDoc = querySnapshot.docs[0];
          targetDocId = matchedDoc.id;
          roomData = matchedDoc.data() as NetPlayRoom;
        }
      }

      if (!roomData) {
        throw new Error(`Room with code "${codeOrId}" was not found or has expired.`);
      }

      const user = auth.currentUser;
      const currentUid = user?.uid || `guest-p2-${Date.now().toString(36)}`;
      const currentName = user?.displayName || 'Player 2';
      const currentAvatar = user?.photoURL || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80';

      // Check if current user is already host
      if (roomData.hostUid === currentUid) {
        this.activeRoomId = targetDocId;
        return roomData;
      }

      // Check if guest slot is available or current user is guest
      if (!roomData.guestUid || roomData.guestUid === currentUid) {
        await updateDoc(doc(db, 'rooms', targetDocId), {
          guestUid: currentUid,
          guestName: currentName,
          guestAvatar: currentAvatar,
          guestReady: false,
          updatedAt: new Date().toISOString()
        });

        roomData.guestUid = currentUid;
        roomData.guestName = currentName;
        roomData.guestAvatar = currentAvatar;
        roomData.guestReady = false;
      } else {
        // Room full: join as Spectator
        const spectators = roomData.spectators || [];
        if (!spectators.some(s => s.id === currentUid)) {
          const updatedSpecs = [...spectators, { id: currentUid, name: currentName, latencyMs: 24 }];
          await updateDoc(doc(db, 'rooms', targetDocId), {
            spectators: updatedSpecs,
            updatedAt: new Date().toISOString()
          });
          roomData.spectators = updatedSpecs;
        }
      }

      this.activeRoomId = targetDocId;

      // Broadcast join event
      this.broadcastChannel?.postMessage({
        type: 'PLAYER_JOINED',
        roomId: targetDocId,
        player: { uid: currentUid, name: currentName }
      });

      return roomData;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `rooms/${targetDocId}`);
      throw error;
    }
  }

  // 3. Leave Room
  public async leaveRoom(roomId: string): Promise<void> {
    const user = auth.currentUser;
    const currentUid = user?.uid;

    try {
      const roomRef = doc(db, 'rooms', roomId);
      const snap = await getDoc(roomRef);
      if (!snap.exists()) return;

      const room = snap.data() as NetPlayRoom;

      if (room.hostUid === currentUid) {
        // Host leaves -> close room
        await updateDoc(roomRef, {
          status: 'closed',
          updatedAt: new Date().toISOString()
        });
      } else if (room.guestUid === currentUid) {
        // Guest leaves -> reset slot
        await updateDoc(roomRef, {
          guestUid: null,
          guestName: null,
          guestAvatar: null,
          guestReady: false,
          status: 'waiting',
          updatedAt: new Date().toISOString()
        });
      } else {
        // Remove from spectators if present
        const updatedSpecs = (room.spectators || []).filter(s => s.id !== currentUid);
        await updateDoc(roomRef, {
          spectators: updatedSpecs,
          updatedAt: new Date().toISOString()
        });
      }

      this.closeWebRTC();
      this.activeRoomId = null;
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `rooms/${roomId}`);
    }
  }

  // 4. Toggle Ready State
  public async toggleReady(roomId: string, isHost: boolean, currentReady: boolean): Promise<void> {
    try {
      const roomRef = doc(db, 'rooms', roomId);
      const snap = await getDoc(roomRef);
      if (!snap.exists()) return;

      const room = snap.data() as NetPlayRoom;
      const nextReady = !currentReady;

      const hostReady = isHost ? nextReady : room.hostReady;
      const guestReady = !isHost ? nextReady : room.guestReady;
      const nextStatus = (hostReady && guestReady) ? 'ready' : 'waiting';

      await updateDoc(roomRef, {
        [isHost ? 'hostReady' : 'guestReady']: nextReady,
        status: nextStatus,
        updatedAt: new Date().toISOString()
      });

      // Local broadcast
      this.broadcastChannel?.postMessage({
        type: 'READY_CHANGED',
        roomId,
        isHost,
        ready: nextReady,
        status: nextStatus
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `rooms/${roomId}`);
      throw error;
    }
  }

  // 5. Update room status (e.g. playing when host launches match)
  public async setRoomStatus(roomId: string, status: 'waiting' | 'ready' | 'playing' | 'closed'): Promise<void> {
    try {
      await updateDoc(doc(db, 'rooms', roomId), {
        status,
        updatedAt: new Date().toISOString()
      });
      this.broadcastChannel?.postMessage({
        type: 'STATUS_CHANGED',
        roomId,
        status
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `rooms/${roomId}`);
    }
  }

  // 6. Subscribe to single room updates (real-time listener)
  public subscribeToRoom(roomId: string, onUpdate: (room: NetPlayRoom) => void): Unsubscribe {
    const roomRef = doc(db, 'rooms', roomId);

    const unsubscribe = onSnapshot(
      roomRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data() as NetPlayRoom;
          onUpdate(data);
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, `rooms/${roomId}`);
      }
    );

    return unsubscribe;
  }

  // 7. Subscribe to public rooms directory
  public subscribeToPublicRooms(onUpdate: (rooms: NetPlayRoom[]) => void): Unsubscribe {
    const roomsRef = collection(db, 'rooms');
    const q = query(
      roomsRef,
      where('isPublic', '==', true)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const rooms: NetPlayRoom[] = [];
        snapshot.forEach((doc) => {
          const r = doc.data() as NetPlayRoom;
          if (r.status !== 'closed') {
            rooms.push(r);
          }
        });
        // Sort newest first
        rooms.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
        onUpdate(rooms);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'rooms');
      }
    );

    return unsubscribe;
  }

  // 8. In-room Chat messages
  public subscribeToMessages(roomId: string, onUpdate: (messages: ChatMessage[]) => void): Unsubscribe {
    const messagesRef = collection(db, 'rooms', roomId, 'messages');
    const q = query(messagesRef, orderBy('timestamp', 'asc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const msgs: ChatMessage[] = [];
        snapshot.forEach((doc) => {
          msgs.push(doc.data() as ChatMessage);
        });
        onUpdate(msgs);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, `rooms/${roomId}/messages`);
      }
    );

    return unsubscribe;
  }

  public async sendMessage(roomId: string, text: string): Promise<void> {
    const user = auth.currentUser;
    const senderUid = user?.uid || 'guest';
    const senderName = user?.displayName || 'Player';
    const senderAvatar = user?.photoURL || undefined;

    const messageId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const msg: ChatMessage = {
      id: messageId,
      roomId,
      senderUid,
      senderName,
      senderAvatar,
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };

    try {
      await setDoc(doc(db, 'rooms', roomId, 'messages', messageId), msg);

      // Also transmit across WebRTC DataChannel / BroadcastChannel
      if (this.dataChannel && this.dataChannel.readyState === 'open') {
        this.dataChannel.send(JSON.stringify({ type: 'CHAT', message: msg }));
      }
      this.broadcastChannel?.postMessage({
        type: 'CHAT_MESSAGE',
        roomId,
        message: msg
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `rooms/${roomId}/messages/${messageId}`);
    }
  }

  // 9. WebRTC Signaling via Firestore & BroadcastChannel
  public async initializeSignaling(roomId: string, isHost: boolean): Promise<void> {
    if (typeof RTCPeerConnection === 'undefined') return;

    try {
      this.closeWebRTC();
      this.peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });

      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          const cand = event.candidate.toJSON();
          this.broadcastChannel?.postMessage({
            type: 'ICE_CANDIDATE',
            roomId,
            isHost,
            candidate: cand
          });
          // Also save in Firestore signaling payload
          this.pushIceCandidateToFirestore(roomId, isHost, cand);
        }
      };

      if (isHost) {
        // Host creates the DataChannel
        this.dataChannel = this.peerConnection.createDataChannel('retroverse-inputs', {
          ordered: false,
          maxRetransmits: 0
        });
        this.setupDataChannel(this.dataChannel);

        const offer = await this.peerConnection.createOffer();
        await this.peerConnection.setLocalDescription(offer);

        await updateDoc(doc(db, 'rooms', roomId), {
          offer: JSON.stringify(offer),
          updatedAt: new Date().toISOString()
        });

        this.broadcastChannel?.postMessage({
          type: 'SDP_OFFER',
          roomId,
          offer: JSON.stringify(offer)
        });
      } else {
        // Guest handles incoming DataChannel
        this.peerConnection.ondatachannel = (event) => {
          this.dataChannel = event.channel;
          this.setupDataChannel(this.dataChannel);
        };
      }
    } catch (e) {
      console.warn("WebRTC signaling init warning:", e);
    }
  }

  private setupDataChannel(channel: RTCDataChannel) {
    channel.onopen = () => {
      console.log("WebRTC Low-Latency DataChannel OPENED @ 60 FPS lockstep");
    };

    channel.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'INPUT') {
          this.onInputCallbacks.forEach(cb => cb(payload.port, payload.inputs));
        }
      } catch {
        // Non-JSON binary packet
      }
    };
  }

  private async pushIceCandidateToFirestore(roomId: string, isHost: boolean, candidate: RTCIceCandidateInit) {
    try {
      const roomRef = doc(db, 'rooms', roomId);
      const snap = await getDoc(roomRef);
      if (!snap.exists()) return;

      const field = isHost ? 'hostIceCandidates' : 'guestIceCandidates';
      const rawCurrent = snap.data()?.[field] || '[]';
      let list: RTCIceCandidateInit[] = [];
      try {
        list = JSON.parse(rawCurrent);
      } catch {
        list = [];
      }
      list.push(candidate);

      await updateDoc(roomRef, {
        [field]: JSON.stringify(list.slice(-10)), // keep latest 10
        updatedAt: new Date().toISOString()
      });
    } catch {
      // Ignore background candidate error
    }
  }

  // Handle incoming broadcast messages for instant cross-tab connection
  private handleBroadcastMessage(data: any) {
    if (!data || data.roomId !== this.activeRoomId) return;

    if (data.type === 'INPUT') {
      this.onInputCallbacks.forEach(cb => cb(data.port, data.inputs));
    }
  }

  public sendInputPacket(roomId: string, port: 1 | 2, inputs: any): void {
    const packet = { type: 'INPUT', roomId, port, inputs, timestamp: performance.now() };

    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(JSON.stringify(packet));
    }

    this.broadcastChannel?.postMessage(packet);
  }

  public onInput(cb: (port: 1 | 2, inputs: any) => void): () => void {
    this.onInputCallbacks.push(cb);
    return () => {
      this.onInputCallbacks = this.onInputCallbacks.filter(c => c !== cb);
    };
  }

  public closeWebRTC(): void {
    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    this.localCandidatesQueue = [];
    this.remoteDescriptionSet = false;
  }
}

export const netplayManager = new NetPlayManager();
