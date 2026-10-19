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
  serverTimestamp
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
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

// Generate unique, memorable room code like RV-7402-SNES
export function generateRoomCode(platform: Platform): string {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `RV-${num}-${platform}`;
}

export class RoomService {
  // 1. Create a new multiplayer room in Firestore
  public async createRoom(input: CreateRoomInput): Promise<NetPlayRoom> {
    const user = auth.currentUser;
    const hostUid = user?.uid || 'guest-host-' + Math.floor(Math.random() * 10000);
    const hostName = user?.displayName || input.hostName || 'RetroHost';
    const hostAvatar = user?.photoURL || 'https://images.unsplash.com/photo-1566492031773-4f4e44671857?w=150&auto=format&fit=crop&q=80';

    const roomId = 'room-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
    const code = generateRoomCode(input.platform);

    const newRoom: NetPlayRoom = {
      id: roomId,
      code,
      hostUid,
      hostName,
      hostAvatar,
      gameId: input.gameId,
      gameTitle: input.gameTitle,
      platform: input.platform,
      status: 'waiting',
      isPublic: input.isPublic !== undefined ? input.isPublic : true,
      hostReady: true,
      guestReady: false,
      pingMs: 16,
      spectators: [],
      rollbackFrames: input.rollbackFrames || 2,
      inputDelayTarget: input.inputDelayTarget || '1 Frame (16.6ms)',
      pauseAuthority: `Host Only (${hostName})`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const path = `rooms/${roomId}`;
    try {
      await setDoc(doc(db, 'rooms', roomId), newRoom);

      // Create initial greeting message
      const welcomeMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        roomId,
        senderUid: 'system',
        senderName: 'System',
        text: `Room ${code} created for ${input.gameTitle}. Waiting for Challenger on Port 2.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        isSystem: true
      };

      await setDoc(doc(db, 'rooms', roomId, 'messages', welcomeMsg.id), welcomeMsg);
      return newRoom;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
      throw err;
    }
  }

  // 2. Join room by 6-12 char Room Code (e.g. "RV-7402-SNES" or "7402")
  public async joinRoomByCode(code: string, player: PlayerProfile): Promise<NetPlayRoom> {
    const cleanCode = code.trim().toUpperCase();
    const roomsCol = collection(db, 'rooms');
    const path = 'rooms';

    try {
      // First exact match query
      let q = query(roomsCol, where('code', '==', cleanCode));
      let snapshot = await getDocs(q);

      // If not found, try partial numeric match (e.g. user typed "7402")
      if (snapshot.empty && !cleanCode.startsWith('RV-')) {
        const allRooms = await getDocs(roomsCol);
        const matched = allRooms.docs.find(d => {
          const c = (d.data().code || '').toUpperCase();
          return c.includes(cleanCode);
        });
        if (matched) {
          return this.joinRoomById(matched.id, player);
        }
      }

      if (snapshot.empty) {
        throw new Error(`Room with code "${cleanCode}" was not found or has expired.`);
      }

      const roomDoc = snapshot.docs[0];
      return this.joinRoomById(roomDoc.id, player);
    } catch (err) {
      if (err instanceof Error && err.message.includes('not found')) {
        throw err;
      }
      handleFirestoreError(err, OperationType.GET, path);
      throw err;
    }
  }

  // 3. Join room by Room ID
  public async joinRoomById(roomId: string, player: PlayerProfile): Promise<NetPlayRoom> {
    const roomRef = doc(db, 'rooms', roomId);
    const path = `rooms/${roomId}`;

    try {
      const snap = await getDoc(roomRef);
      if (!snap.exists()) {
        throw new Error('Room does not exist or has been closed by host.');
      }

      const room = snap.data() as NetPlayRoom;

      // Already host
      if (room.hostUid === player.uid) {
        return room;
      }

      // Already guest
      if (room.guestUid === player.uid) {
        return room;
      }

      // Guest slot is open
      if (!room.guestUid) {
        const updateData: Partial<NetPlayRoom> = {
          guestUid: player.uid,
          guestName: player.displayName,
          guestAvatar: player.photoURL || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
          guestReady: false,
          updatedAt: new Date().toISOString()
        };

        await updateDoc(roomRef, updateData);

        // Announce join
        const joinMsg: ChatMessage = {
          id: `msg-${Date.now()}`,
          roomId,
          senderUid: 'system',
          senderName: 'System',
          text: `${player.displayName} has joined Port 2 as Challenger. WebRTC Direct Tunnel handshaking...`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          isSystem: true
        };
        await setDoc(doc(db, 'rooms', roomId, 'messages', joinMsg.id), joinMsg);

        return { ...room, ...updateData };
      }

      // Both slots full -> Join as spectator
      const existingSpectators = room.spectators || [];
      if (!existingSpectators.some(s => s.id === player.uid)) {
        const updatedSpectators = [
          ...existingSpectators,
          { id: player.uid, name: player.displayName, latencyMs: 24 }
        ];
        await updateDoc(roomRef, {
          spectators: updatedSpectators,
          updatedAt: new Date().toISOString()
        });

        const specMsg: ChatMessage = {
          id: `msg-${Date.now()}`,
          roomId,
          senderUid: 'system',
          senderName: 'System',
          text: `${player.displayName} is now spectating this match.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          isSystem: true
        };
        await setDoc(doc(db, 'rooms', roomId, 'messages', specMsg.id), specMsg);

        return { ...room, spectators: updatedSpectators };
      }

      return room;
    } catch (err) {
      if (err instanceof Error && err.message.includes('does not exist')) {
        throw err;
      }
      handleFirestoreError(err, OperationType.UPDATE, path);
      throw err;
    }
  }

  // 4. Toggle Player Ready State (Host or Guest)
  public async toggleReady(roomId: string, isHost: boolean, nextReadyState: boolean): Promise<void> {
    const roomRef = doc(db, 'rooms', roomId);
    const path = `rooms/${roomId}`;

    try {
      const snap = await getDoc(roomRef);
      if (!snap.exists()) return;
      const room = snap.data() as NetPlayRoom;

      const hostReady = isHost ? nextReadyState : room.hostReady;
      const guestReady = isHost ? room.guestReady : nextReadyState;
      const newStatus = (hostReady && guestReady) ? 'ready' : 'waiting';

      await updateDoc(roomRef, {
        hostReady,
        guestReady,
        status: newStatus,
        updatedAt: new Date().toISOString()
      });

      // System announcement
      const actorName = isHost ? room.hostName : (room.guestName || 'Player 2');
      const readyMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        roomId,
        senderUid: 'system',
        senderName: 'System',
        text: `${actorName} is ${nextReadyState ? 'READY TO PLAY!' : 'not ready.'}${hostReady && guestReady ? ' All players synchronized!' : ''}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        isSystem: true
      };
      await setDoc(doc(db, 'rooms', roomId, 'messages', readyMsg.id), readyMsg);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  }

  // 5. Update game cartridge selected in lobby
  public async updateRoomGame(roomId: string, gameId: string, gameTitle: string, platform: Platform): Promise<void> {
    const roomRef = doc(db, 'rooms', roomId);
    const path = `rooms/${roomId}`;

    try {
      await updateDoc(roomRef, {
        gameId,
        gameTitle,
        platform,
        hostReady: true,
        guestReady: false,
        status: 'waiting',
        updatedAt: new Date().toISOString()
      });

      const changeMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        roomId,
        senderUid: 'system',
        senderName: 'System',
        text: `Host swapped cartridge to: ${gameTitle} (${platform}). Ready states reset.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        isSystem: true
      };
      await setDoc(doc(db, 'rooms', roomId, 'messages', changeMsg.id), changeMsg);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  }

  // 6. Leave or close room
  public async leaveRoom(roomId: string, playerUid: string): Promise<void> {
    const roomRef = doc(db, 'rooms', roomId);
    const path = `rooms/${roomId}`;

    try {
      const snap = await getDoc(roomRef);
      if (!snap.exists()) return;
      const room = snap.data() as NetPlayRoom;

      if (room.hostUid === playerUid) {
        // If guest is present, promote guest to host
        if (room.guestUid) {
          await updateDoc(roomRef, {
            hostUid: room.guestUid,
            hostName: room.guestName || 'Player 1',
            hostAvatar: room.guestAvatar,
            hostReady: room.guestReady,
            guestUid: null,
            guestName: null,
            guestAvatar: null,
            guestReady: false,
            status: 'waiting',
            pauseAuthority: `Host Only (${room.guestName || 'Player 1'})`,
            updatedAt: new Date().toISOString()
          });

          const leaveMsg: ChatMessage = {
            id: `msg-${Date.now()}`,
            roomId,
            senderUid: 'system',
            senderName: 'System',
            text: `Host left. ${room.guestName || 'Player 2'} has been promoted to Host (Port 1).`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            isSystem: true
          };
          await setDoc(doc(db, 'rooms', roomId, 'messages', leaveMsg.id), leaveMsg);
        } else {
          // No one left, close room
          await updateDoc(roomRef, {
            status: 'closed',
            updatedAt: new Date().toISOString()
          });
        }
      } else if (room.guestUid === playerUid) {
        await updateDoc(roomRef, {
          guestUid: null,
          guestName: null,
          guestAvatar: null,
          guestReady: false,
          status: 'waiting',
          updatedAt: new Date().toISOString()
        });

        const leaveMsg: ChatMessage = {
          id: `msg-${Date.now()}`,
          roomId,
          senderUid: 'system',
          senderName: 'System',
          text: `${room.guestName || 'Challenger'} has left the room. Port 2 is now open.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          isSystem: true
        };
        await setDoc(doc(db, 'rooms', roomId, 'messages', leaveMsg.id), leaveMsg);
      } else {
        // Remove from spectators
        const spectators = (room.spectators || []).filter(s => s.id !== playerUid);
        await updateDoc(roomRef, {
          spectators,
          updatedAt: new Date().toISOString()
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  }

  // 7. Subscribe to real-time updates for a single room
  public subscribeToRoom(
    roomId: string,
    onUpdate: (room: NetPlayRoom | null) => void,
    onError?: (err: unknown) => void
  ): () => void {
    const roomRef = doc(db, 'rooms', roomId);
    const path = `rooms/${roomId}`;

    return onSnapshot(
      roomRef,
      (docSnap) => {
        if (!docSnap.exists()) {
          onUpdate(null);
        } else {
          onUpdate({ id: docSnap.id, ...(docSnap.data() as Omit<NetPlayRoom, 'id'>) });
        }
      },
      (error) => {
        if (onError) onError(error);
        handleFirestoreError(error, OperationType.GET, path);
      }
    );
  }

  // 8. Subscribe to public rooms lobby
  public subscribeToPublicRooms(
    onUpdate: (rooms: NetPlayRoom[]) => void,
    onError?: (err: unknown) => void
  ): () => void {
    const roomsCol = collection(db, 'rooms');
    const path = 'rooms';
    const q = query(
      roomsCol,
      where('isPublic', '==', true),
      where('status', 'in', ['waiting', 'ready', 'playing'])
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const list: NetPlayRoom[] = [];
        snapshot.forEach((d) => {
          list.push({ id: d.id, ...(d.data() as Omit<NetPlayRoom, 'id'>) });
        });
        onUpdate(list);
      },
      (error) => {
        if (onError) onError(error);
        handleFirestoreError(error, OperationType.LIST, path);
      }
    );
  }

  // 9. Send in-room chat message
  public async sendChatMessage(roomId: string, text: string, sender: PlayerProfile): Promise<void> {
    const msgId = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const path = `rooms/${roomId}/messages/${msgId}`;

    const newMsg: ChatMessage = {
      id: msgId,
      roomId,
      senderUid: sender.uid,
      senderName: sender.displayName,
      senderAvatar: sender.photoURL,
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      isSystem: false
    };

    try {
      await setDoc(doc(db, 'rooms', roomId, 'messages', msgId), newMsg);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  }

  // 10. Subscribe to chat messages stream
  public subscribeToMessages(
    roomId: string,
    onUpdate: (messages: ChatMessage[]) => void,
    onError?: (err: unknown) => void
  ): () => void {
    const messagesCol = collection(db, 'rooms', roomId, 'messages');
    const path = `rooms/${roomId}/messages`;

    return onSnapshot(
      messagesCol,
      (snapshot) => {
        const msgs: ChatMessage[] = [];
        snapshot.forEach((d) => {
          msgs.push({ id: d.id, ...(d.data() as Omit<ChatMessage, 'id'>) });
        });
        // Sort chronologically by id/timestamp
        msgs.sort((a, b) => a.id.localeCompare(b.id));
        onUpdate(msgs);
      },
      (error) => {
        if (onError) onError(error);
        handleFirestoreError(error, OperationType.LIST, path);
      }
    );
  }

  // 11. Realtime WebRTC Signaling (Offers, Answers, ICE Candidates)
  public async sendSignal(roomId: string, signal: Omit<SignalingMessage, 'id' | 'createdAt'>): Promise<void> {
    const sigId = `sig-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const fullSignal: SignalingMessage = {
      ...signal,
      id: sigId,
      createdAt: new Date().toISOString()
    };

    // 11a. BroadcastChannel for local/instant cross-tab signaling
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel(`retroverse_signal_${roomId}`);
        bc.postMessage(fullSignal);
        bc.close();
      }
    } catch (e) {
      console.warn("BroadcastChannel error", e);
    }

    // 11b. Firestore signaling subcollection for remote multi-device signaling
    const path = `rooms/${roomId}/signals/${sigId}`;
    try {
      await setDoc(doc(db, 'rooms', roomId, 'signals', sigId), fullSignal);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  }

  // 12. Subscribe to WebRTC Signaling Channel
  public subscribeToSignals(
    roomId: string,
    userUid: string,
    onSignal: (signal: SignalingMessage) => void
  ): () => void {
    // 12a. BroadcastChannel listener
    let bc: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        bc = new BroadcastChannel(`retroverse_signal_${roomId}`);
        bc.onmessage = (ev) => {
          const sig = ev.data as SignalingMessage;
          if (sig.senderUid !== userUid) {
            onSignal(sig);
          }
        };
      }
    } catch (e) {
      console.warn("BroadcastChannel error", e);
    }

    // 12b. Firestore listener
    const signalsCol = collection(db, 'rooms', roomId, 'signals');
    const path = `rooms/${roomId}/signals`;

    const unsubFirestore = onSnapshot(
      signalsCol,
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const sig = change.doc.data() as SignalingMessage;
            if (sig.senderUid !== userUid) {
              onSignal(sig);
            }
          }
        });
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, path);
      }
    );

    return () => {
      if (bc) bc.close();
      unsubFirestore();
    };
  }
}

export const roomService = new RoomService();
