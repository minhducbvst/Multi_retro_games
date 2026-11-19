import React, { useState, useEffect, useRef } from 'react';
import {
  roomService,
  getOrCreatePlayerProfile,
  setLocalPlayerName,
  ServerConnectionStatus,
} from '../services/multiplayer/roomService';
import { webrtcNetplay, NetplayTelemetryStats } from '../services/multiplayer/webrtcNetplay';
import { useLibraryStore, libraryStore, getCartridgeCoverArt } from '../services/games/libraryStore';
import { NetPlayRoom, ChatMessage, Platform, Game } from '../types';
import { auth, loginWithGoogle } from '../services/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { parseRom } from '../emulator/romParser';
import { romStorage } from '../services/roms/romStorage';

export interface ActiveNetplayLaunch {
  room: NetPlayRoom;
  role: 'host' | 'guest' | 'spectator';
  playerUid: string;
  lockToRoom?: boolean;
}

interface NetPlayLobbyPageProps {
  roomId?: string;
  initialRoomCode?: string;
  preselectedGameId?: string;
  onConsumePreselectedGame?: () => void;
  onLockInviteRoom?: (launch: ActiveNetplayLaunch) => void;
  onLaunchNetplayMatch: (launch: ActiveNetplayLaunch) => void;
  onLeaveRoom: () => void;
}

const ARENA_FALLBACK_GAME: Game = {
  id: 'arena-coop',
  title: 'RetroVerse Co-Op Arena (2P Sandbox)',
  platform: 'SNES',
  year: 1995,
  developer: 'RetroVerse Engine',
  genre: 'Co-Op Arena / Ready-to-Play',
  rating: 5.0,
  ratingCount: 1,
  boxArt: getCartridgeCoverArt('RetroVerse Co-Op Arena', 'SNES'),
  description: 'Đấu trường 2 người chơi tích hợp sẵn, vào trận ngay không cần tải ROM hoặc thay băng ROM của bạn bất cứ lúc nào.',
  features: ['2-Player Simultaneous', 'Zero-ROM Ready', 'WebRTC 60FPS'],
};

export const NetPlayLobbyPage: React.FC<NetPlayLobbyPageProps> = ({
  roomId,
  initialRoomCode,
  preselectedGameId,
  onConsumePreselectedGame,
  onLockInviteRoom,
  onLaunchNetplayMatch,
  onLeaveRoom,
}) => {
  const libraryGames = useLibraryStore();
  const [currentUser, setCurrentUser] = useState<User | null>(auth.currentUser);
  const [playerProfile, setPlayerProfile] = useState(() => getOrCreatePlayerProfile());
  const [editingNickname, setEditingNickname] = useState<boolean>(false);
  const [nicknameDraft, setNicknameDraft] = useState<string>(() => getOrCreatePlayerProfile().displayName);

  const [activeRoomId, setActiveRoomId] = useState<string | undefined>(roomId);
  const [room, setRoom] = useState<NetPlayRoom | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [publicRooms, setPublicRooms] = useState<NetPlayRoom[]>([]);
  const [myHostedRooms, setMyHostedRooms] = useState<NetPlayRoom[]>([]);
  const [inputText, setInputText] = useState<string>('');
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Lobby Discovery Filters
  const [roomSearchQuery, setRoomSearchQuery] = useState<string>('');
  const [roomPlatformFilter, setRoomPlatformFilter] = useState<'ALL' | Platform>('ALL');
  const [onlyVacantRooms, setOnlyVacantRooms] = useState<boolean>(false);

  // Real Server & WebRTC Network Telemetry
  const [serverStatus, setServerStatus] = useState<ServerConnectionStatus>('connecting');
  const [serverRttMs, setServerRttMs] = useState<number>(0);
  const [rtcStats, setRtcStats] = useState<NetplayTelemetryStats>(() => webrtcNetplay.getStats());

  // Modals
  const [showCreateModal, setShowCreateModal] = useState<boolean>(() => Boolean(preselectedGameId));
  const [showJoinModal, setShowJoinModal] = useState<boolean>(false);
  const [showChangeCartridgeModal, setShowChangeCartridgeModal] = useState<boolean>(false);

  // Create Room Form
  const availableGames = libraryGames.length > 0 ? libraryGames : [ARENA_FALLBACK_GAME];
  const resolvedInitialGameId =
    preselectedGameId && preselectedGameId !== '__create__' ? preselectedGameId : undefined;
  const [createGameId, setCreateGameId] = useState<string>(
    () => resolvedInitialGameId || libraryGames[0]?.id || ARENA_FALLBACK_GAME.id
  );
  const [createPlatform, setCreatePlatform] = useState<Platform>(
    () =>
      (resolvedInitialGameId
        ? libraryGames.find((g) => g.id === resolvedInitialGameId)?.platform
        : libraryGames[0]?.platform) || 'SNES'
  );
  const [createIsPublic, setCreateIsPublic] = useState<boolean>(true);
  const [createRollback, setCreateRollback] = useState<number>(1);
  const [createRoomNote, setCreateRoomNote] = useState<string>('');
  const [createRomReady, setCreateRomReady] = useState<'ready' | 'drive' | 'arena' | 'missing'>('arena');
  const [activeRomReady, setActiveRomReady] = useState<'ready' | 'drive' | 'arena' | 'missing'>('arena');
  const [editingRoomNote, setEditingRoomNote] = useState<boolean>(false);
  const [roomNoteDraft, setRoomNoteDraft] = useState<string>('');
  const [isUpdatingSettings, setIsUpdatingSettings] = useState<boolean>(false);

  // Join Room Form
  const [joinCodeInput, setJoinCodeInput] = useState<string>('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isAutoJoiningInvite, setIsAutoJoiningInvite] = useState<boolean>(() => {
    if (initialRoomCode) return true;
    try {
      return Boolean(new URLSearchParams(window.location.search).get('room')?.trim());
    } catch {
      return false;
    }
  });
  const [isInviteLocked, setIsInviteLocked] = useState<boolean>(false);
  const isInviteLockedRef = useRef<boolean>(false);

  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const romUploadInputRef = useRef<HTMLInputElement | null>(null);
  const autoJoinedCodeRef = useRef<string | null>(null);
  const pendingInviteCodeRef = useRef<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const createAttemptIdRef = useRef<number>(0);
  const lastConsumedPreselectedRef = useRef<string | undefined>(undefined);
  const intentionalLeaveRef = useRef<boolean>(false);

  const showToast = (msg: string) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToastMessage(msg);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, 3000);
  };

  const openCreateModal = () => {
    setIsSubmitting(false);
    setCreateError(null);
    setShowCreateModal(true);
  };

  const closeCreateModal = () => {
    createAttemptIdRef.current += 1;
    setIsSubmitting(false);
    setShowCreateModal(false);
    onConsumePreselectedGame?.();
  };

  const closeJoinModal = () => {
    setIsSubmitting(false);
    setJoinError(null);
    setShowJoinModal(false);
  };

  // Sync props
  useEffect(() => {
    setActiveRoomId(roomId);
  }, [roomId]);

  useEffect(() => {
    if (!preselectedGameId) {
      lastConsumedPreselectedRef.current = undefined;
      return;
    }
    if (lastConsumedPreselectedRef.current === preselectedGameId) {
      return;
    }
    if (preselectedGameId === '__create__') {
      lastConsumedPreselectedRef.current = preselectedGameId;
      const fallback = libraryGames[0] || ARENA_FALLBACK_GAME;
      setCreateGameId(fallback.id);
      setCreatePlatform(fallback.platform);
      setIsSubmitting(false);
      setShowCreateModal(true);
      onConsumePreselectedGame?.();
      return;
    }
    const found = libraryGames.find((g) => g.id === preselectedGameId);
    if (found) {
      lastConsumedPreselectedRef.current = preselectedGameId;
      setCreateGameId(found.id);
      setCreatePlatform(found.platform);
      setIsSubmitting(false);
      setShowCreateModal(true);
      onConsumePreselectedGame?.();
    }
  }, [preselectedGameId, libraryGames]);

  // Allow Escape key to close any open modal immediately
  useEffect(() => {
    if (!showCreateModal && !showJoinModal && !showChangeCartridgeModal) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showCreateModal) closeCreateModal();
        if (showJoinModal) closeJoinModal();
        if (showChangeCartridgeModal) setShowChangeCartridgeModal(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showCreateModal, showJoinModal, showChangeCartridgeModal]);

  // Auth tracking
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (usr) => {
      setCurrentUser(usr);
      const nextProfile = getOrCreatePlayerProfile();
      setPlayerProfile(nextProfile);
      setNicknameDraft(nextProfile.displayName);
      roomService.sendHello();

      if (usr && pendingInviteCodeRef.current && !activeRoomId) {
        const codeToJoin = pendingInviteCodeRef.current;
        pendingInviteCodeRef.current = null;
        handleJoinByCode(codeToJoin, nextProfile);
      }
    });
    return () => unsub();
  }, [activeRoomId]);

  // WebSocket Server connection & RTT monitoring
  useEffect(() => {
    const unsubConn = roomService.subscribeToConnectionStatus((st, rtt) => {
      setServerStatus(st);
      setServerRttMs(rtt);
    });
    const unsubRtc = webrtcNetplay.subscribeStats((st) => {
      setRtcStats(st);
    });
    return () => {
      unsubConn();
      unsubRtc();
    };
  }, []);

  // Auto-join from ?room=CODE prop or URL query (waits for Firebase Auth restore so refreshing Host keeps Host role)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = initialRoomCode || params.get('room');
    if (code && autoJoinedCodeRef.current !== code) {
      setIsAutoJoiningInvite(true);
      let cancelled = false;
      auth.authStateReady().then(() => {
        if (!cancelled && autoJoinedCodeRef.current !== code) {
          autoJoinedCodeRef.current = code;
          handleJoinByCode(code, getOrCreatePlayerProfile(), true);
        }
      });
      return () => {
        cancelled = true;
      };
    } else if (!code) {
      setIsAutoJoiningInvite(false);
    }
  }, [initialRoomCode]);

  // Subscribe to public rooms lobby
  useEffect(() => {
    const unsub = roomService.subscribeToPublicRooms((roomsList) => {
      setPublicRooms(roomsList);
    });
    return () => unsub();
  }, []);

  // Subscribe to rooms created by current Google-authenticated Host (includes Private rooms)
  useEffect(() => {
    const uid = currentUser?.uid || null;
    if (!uid) {
      setMyHostedRooms([]);
      return;
    }
    const unsub = roomService.subscribeToMyHostedRooms(uid, (roomsList) => {
      setMyHostedRooms(roomsList);
    });
    return () => unsub();
  }, [currentUser?.uid]);

  // Check ROM readiness for selected game in Create Modal
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      if (createGameId === ARENA_FALLBACK_GAME.id) {
        if (!cancelled) setCreateRomReady('arena');
        return;
      }
      const g = libraryGames.find((item) => item.id === createGameId);
      const cached = romStorage.getRom(createGameId) || (await romStorage.getRomAsync(createGameId));
      if (cancelled) return;
      if (cached && cached.data?.length > 0) {
        setCreateRomReady('ready');
      } else if (g?.driveFileId) {
        setCreateRomReady('drive');
      } else {
        setCreateRomReady('missing');
      }
    };
    check();
    return () => {
      cancelled = true;
    };
  }, [createGameId, libraryGames]);

  // Check ROM readiness for current Active Room cartridge
  useEffect(() => {
    let cancelled = false;
    const gId = room?.gameId;
    if (!gId) return;
    const check = async () => {
      if (gId === ARENA_FALLBACK_GAME.id) {
        if (!cancelled) setActiveRomReady('arena');
        return;
      }
      const g = libraryGames.find((item) => item.id === gId);
      const cached = romStorage.getRom(gId) || (await romStorage.getRomAsync(gId));
      if (cancelled) return;
      if (cached && cached.data?.length > 0) {
        setActiveRomReady('ready');
      } else if (g?.driveFileId) {
        setActiveRomReady('drive');
      } else {
        setActiveRomReady('missing');
      }
    };
    check();
    return () => {
      cancelled = true;
    };
  }, [room?.gameId, libraryGames]);

  // Host 25s heartbeat while inside an active room so room freshness stays accurate
  useEffect(() => {
    if (!room?.id) return;
    const effectiveUid = currentUser?.uid || playerProfile.uid;
    if (room.hostUid !== effectiveUid) return;
    roomService.sendHostHeartbeat(room.id);
    const t = setInterval(() => {
      roomService.sendHostHeartbeat(room.id);
    }, 25000);
    return () => clearInterval(t);
  }, [room?.id, room?.hostUid, currentUser?.uid, playerProfile.uid]);

  // Subscribe to active room state, messages, launch events & WebRTC signaling
  useEffect(() => {
    if (!activeRoomId) {
      setRoom(null);
      setMessages([]);
      return;
    }

    intentionalLeaveRef.current = false;

    const unsubRoom = roomService.subscribeToRoom(activeRoomId, (updatedRoom) => {
      if (updatedRoom) {
        setRoom(updatedRoom);
      } else {
        setRoom(null);
        setActiveRoomId(undefined);
        webrtcNetplay.stopSession();
        try {
          if (new URLSearchParams(window.location.search).has('room')) {
            window.history.replaceState({}, '', window.location.pathname);
          }
        } catch {}
        if (!intentionalLeaveRef.current) {
          showToast('Phòng chơi đã đóng.');
        }
      }
    });

    const unsubMessages = roomService.subscribeToMessages(activeRoomId, (msgs) => {
      setMessages(msgs);
    });

    const unsubLaunch = roomService.subscribeToLaunch((launchedRoom) => {
      if (launchedRoom.id !== activeRoomId) return;
      const myUid = auth.currentUser?.uid || playerProfile.uid;
      const myRole: 'host' | 'guest' | 'spectator' =
        launchedRoom.hostUid === myUid
          ? 'host'
          : launchedRoom.guestUid === myUid
          ? 'guest'
          : 'spectator';
      onLaunchNetplayMatch({
        room: launchedRoom,
        role: myRole,
        playerUid: myUid,
        lockToRoom: isInviteLockedRef.current,
      });
    });

    return () => {
      unsubRoom();
      unsubMessages();
      unsubLaunch();
    };
  }, [activeRoomId, playerProfile.uid]);

  const prevLobbyGuestUidRef = useRef<string | null>(null);

  // Establish live WebRTC DataChannel peer connection while in Lobby for instant RTT measurement & warm NAT punch!
  useEffect(() => {
    if (!room) {
      prevLobbyGuestUidRef.current = null;
      return;
    }
    const myUid = currentUser?.uid || auth.currentUser?.uid || playerProfile.uid;
    const role: 'host' | 'guest' | 'spectator' =
      room.hostUid === myUid ? 'host' : room.guestUid === myUid ? 'guest' : 'spectator';

    webrtcNetplay.startSession(room.id, myUid, role);

    if (role === 'host') {
      const prevGuest = prevLobbyGuestUidRef.current;
      if (prevGuest && prevGuest !== room.guestUid) {
        webrtcNetplay.disconnectPeer(prevGuest);
      }
      prevLobbyGuestUidRef.current = room.guestUid || null;

      if (room.guestUid) {
        webrtcNetplay.connectToPeer(room.guestUid, true);
      }
      for (const spec of room.spectators || []) {
        webrtcNetplay.connectToPeer(spec.id, true);
      }
    } else if (room.hostUid) {
      // Guest prepares peer link (polite peer waits for Host's offer)
      webrtcNetplay.connectToPeer(room.hostUid, false);
    }
  }, [room?.id, room?.hostUid, room?.guestUid, room?.spectators?.length, currentUser?.uid, playerProfile.uid]);

  // Auto-scroll chat
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSaveNickname = () => {
    if (!nicknameDraft.trim()) return;
    setLocalPlayerName(nicknameDraft);
    const updated = getOrCreatePlayerProfile();
    setPlayerProfile(updated);
    setEditingNickname(false);
    showToast(`Đã đổi tên hiển thị thành "${updated.displayName}"`);
  };

  const handleCopyCode = () => {
    if (!room) return;
    navigator.clipboard.writeText(room.code);
    setCopiedCode(true);
    showToast(`Đã sao chép mã phòng ${room.code}`);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyInviteLink = () => {
    if (!room) return;
    const url = `${window.location.origin}${window.location.pathname}?room=${room.code}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    showToast('Đã sao chép đường link mời chơi qua Internet!');
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || inputText;
    if (!text.trim() || !room) return;
    try {
      await roomService.sendChatMessage(room.id, text.trim(), playerProfile);
      setInputText('');
    } catch {
      showToast('Không gửi được tin nhắn — kiểm tra kết nối máy chủ.');
    }
  };

  const handleToggleReady = async () => {
    if (!room) return;
    const myUid = currentUser?.uid || playerProfile.uid;
    const amIHost = room.hostUid === myUid;
    const currentReady = amIHost ? room.hostReady : room.guestReady;
    const nextReady = !currentReady;

    try {
      await roomService.toggleReady(room.id, amIHost, nextReady);
      showToast(nextReady ? 'Bạn đã SẴN SÀNG! Chờ Chủ phòng nhấn Bắt Đầu Game.' : 'Đã hủy trạng thái sẵn sàng.');
    } catch {
      showToast('Lỗi cập nhật trạng thái sẵn sàng');
    }
  };

  const handleUploadRomInLobby = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      const header = parseRom(bytes, file.name);
      const plat = header.platform === 'UNKNOWN' ? 'SNES' : header.platform;
      const title = header.internalTitle || file.name.replace(/\.[^/.]+$/, '');
      const customGame: Game = {
        id: `custom-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        title,
        platform: plat,
        year: 1995,
        developer: 'Tải lên từ máy',
        genre: 'NetPlay ROM',
        rating: 5.0,
        ratingCount: 1,
        boxArt: getCartridgeCoverArt(title, plat),
        description: `ROM ${file.name} (${header.crc32}) sẵn sàng stream cho Port 2 qua WebRTC.`,
        features: ['2-Player NetPlay', 'WebRTC 60FPS'],
        source: 'local',
        romFilename: file.name,
        crc32: header.crc32,
      };
      romStorage.saveRom(customGame.id, file.name, plat, bytes);
      libraryStore.addGame(customGame);
      setCreateGameId(customGame.id);
      setCreatePlatform(plat);

      if (room && room.hostUid === playerProfile.uid) {
        await roomService.updateRoomGame(room.id, customGame.id, customGame.title, plat);
        setShowChangeCartridgeModal(false);
      }
      showToast(`Đã nạp ROM "${title}" (${plat}) sẵn sàng tạo phòng!`);
    } catch {
      showToast('Không thể đọc tệp ROM đã chọn.');
    } finally {
      e.target.value = '';
    }
  };

  const handleCreateRoom = async () => {
    if (isSubmitting) return;
    const attemptId = ++createAttemptIdRef.current;

    // Close popup immediately upon pressing "Tạo Phòng Ngay" so the dialog never gets stuck open
    setShowCreateModal(false);
    onConsumePreselectedGame?.();
    setCreateError(null);
    setIsSubmitting(true);
    showToast('Đang khởi tạo phòng chơi...');

    try {
      const selectedGame =
        libraryGames.find((g) => g.id === createGameId) ||
        (createGameId === ARENA_FALLBACK_GAME.id ? ARENA_FALLBACK_GAME : libraryGames[0] || ARENA_FALLBACK_GAME);

      const newRoom = await roomService.createRoom({
        gameId: selectedGame.id,
        gameTitle: selectedGame.title,
        platform: selectedGame.platform || createPlatform,
        isPublic: createIsPublic,
        rollbackFrames: createRollback,
        inputDelayTarget: createRollback <= 1 ? '0-1 Frame (<16ms)' : `${createRollback} Frames`,
        hostName: playerProfile.displayName,
        ...(createRoomNote.trim() ? { roomNote: createRoomNote.trim() } : {}),
      });

      if (createAttemptIdRef.current !== attemptId) {
        // User cancelled while creation was in flight -> clean up orphaned room
        void roomService.leaveRoom(newRoom.id, playerProfile.uid);
        return;
      }

      // Keep Host URL clean so refreshing/exiting never auto-rejoins a deleted room
      try {
        if (new URLSearchParams(window.location.search).has('room')) {
          window.history.replaceState({}, '', window.location.pathname);
        }
      } catch {}

      isInviteLockedRef.current = false;
      setIsInviteLocked(false);
      setCreateRoomNote('');
      setActiveRoomId(newRoom.id);
      setRoom(newRoom);
      showToast(`Đã tạo phòng ${newRoom.code}!`);
    } catch (err: unknown) {
      if (createAttemptIdRef.current !== attemptId) return;
      let msg = err instanceof Error ? err.message : 'Không thể tạo phòng lúc này.';
      if (msg.startsWith('{') && msg.includes('"operationType"')) {
        msg = 'Không thể tạo phòng lúc này. Vui lòng kiểm tra đăng nhập Google và kết nối mạng.';
      }
      setCreateError(msg);
      showToast(msg);
    } finally {
      if (createAttemptIdRef.current === attemptId) {
        setIsSubmitting(false);
      }
    }
  };

  const handleJoinByCode = async (
    codeToJoin?: string,
    overrideProfile?: ReturnType<typeof getOrCreatePlayerProfile>,
    fromInvite: boolean = false
  ) => {
    const code = (codeToJoin || joinCodeInput).trim();
    if (!code) {
      setIsAutoJoiningInvite(false);
      return;
    }

    setIsSubmitting(true);
    setJoinError(null);
    await auth.authStateReady();
    const profile = overrideProfile || getOrCreatePlayerProfile();

    try {
      const joinedRoom = await roomService.joinRoomByCode(code, profile);
      pendingInviteCodeRef.current = null;
      const myUid = auth.currentUser?.uid || profile.uid;
      const isJoinedHost = joinedRoom.hostUid === myUid;
      if (!isJoinedHost) {
        try {
          const nextUrl = `${window.location.pathname}?room=${joinedRoom.code}`;
          window.history.replaceState({}, '', nextUrl);
        } catch {}
      }

      if (!isJoinedHost && joinedRoom.status === 'playing') {
        const myRole: 'host' | 'guest' | 'spectator' =
          joinedRoom.guestUid === myUid ? 'guest' : 'spectator';
        isInviteLockedRef.current = fromInvite;
        setIsInviteLocked(fromInvite);
        setShowJoinModal(false);
        setJoinCodeInput('');
        onLaunchNetplayMatch({
          room: joinedRoom,
          role: myRole,
          playerUid: myUid,
          lockToRoom: fromInvite,
        });
        return;
      }

      if (!isJoinedHost && fromInvite) {
        const myRole: 'host' | 'guest' | 'spectator' =
          joinedRoom.guestUid === myUid ? 'guest' : 'spectator';
        isInviteLockedRef.current = true;
        setIsInviteLocked(true);
        onLockInviteRoom?.({
          room: joinedRoom,
          role: myRole,
          playerUid: myUid,
          lockToRoom: true,
        });
      } else if (isJoinedHost) {
        isInviteLockedRef.current = false;
        setIsInviteLocked(false);
      }

      setActiveRoomId(joinedRoom.id);
      setRoom(joinedRoom);
      setShowJoinModal(false);
      setJoinCodeInput('');
      if (isJoinedHost && fromInvite) {
        showToast('Đang mở bằng tài khoản Chủ phòng. Dùng trình duyệt ẩn danh/tài khoản khác cho Máy 2!');
      } else if (!isJoinedHost) {
        showToast(`Đã vào phòng ${joinedRoom.code}! Hãy bấm "Sẵn Sàng" để Chủ phòng bắt đầu game.`);
      } else {
        showToast(`Đã tham gia phòng ${joinedRoom.code}!`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không tìm thấy phòng với mã này.';
      if (fromInvite) {
        try {
          if (new URLSearchParams(window.location.search).has('room')) {
            window.history.replaceState({}, '', window.location.pathname);
          }
        } catch {}
      }
      setJoinError(msg);
      showToast(msg);
    } finally {
      setIsSubmitting(false);
      setIsAutoJoiningInvite(false);
    }
  };

  const handleSelectGameChange = async (game: Game) => {
    if (!room) return;
    try {
      await roomService.updateRoomGame(room.id, game.id, game.title, game.platform);
      setShowChangeCartridgeModal(false);
      showToast(`Đã đổi băng game sang: ${game.title}`);
    } catch {
      setShowChangeCartridgeModal(false);
    }
  };

  const handleLeave = async () => {
    intentionalLeaveRef.current = true;
    webrtcNetplay.stopSession();
    await roomService.leaveRoom(room?.id, currentUser?.uid || playerProfile.uid);
    try {
      window.history.replaceState({}, '', window.location.pathname);
    } catch {}
    setActiveRoomId(undefined);
    setRoom(null);
    onLeaveRoom();
  };

  const handleDeleteActiveRoom = async () => {
    if (!room) return;
    intentionalLeaveRef.current = true;
    const deletedCode = room.code;
    webrtcNetplay.stopSession();
    try {
      await roomService.deleteHostedRoom(room.id);
    } catch {}
    try {
      if (new URLSearchParams(window.location.search).has('room')) {
        window.history.replaceState({}, '', window.location.pathname);
      }
    } catch {}
    setActiveRoomId(undefined);
    setRoom(null);
    showToast(`Đã đóng và xóa vĩnh viễn phòng ${deletedCode}.`);
  };

  const handleDeleteHostedRoomFromList = async (targetRoom: NetPlayRoom) => {
    try {
      await roomService.deleteHostedRoom(targetRoom.id);
      showToast(`Đã xóa phòng ${targetRoom.code}.`);
    } catch {
      showToast('Không thể xóa phòng này lúc này.');
    }
  };

  const handleToggleVisibility = async () => {
    if (!room || !isHost || isUpdatingSettings) return;
    setIsUpdatingSettings(true);
    const nextPublic = !room.isPublic;
    try {
      await roomService.updateRoomSettings(room.id, { isPublic: nextPublic });
      showToast(nextPublic ? 'Phòng đã chuyển sang Công Khai (hiện ở sảnh).' : 'Phòng đã chuyển sang Riêng Tư (chỉ vào bằng Mã / Link).');
    } catch {
      showToast('Không thể cập nhật chế độ hiển thị phòng.');
    } finally {
      setIsUpdatingSettings(false);
    }
  };

  const handleUpdateActiveRollback = async (nextRollback: number) => {
    if (!room || !isHost || isUpdatingSettings) return;
    setIsUpdatingSettings(true);
    const nextDelay = nextRollback <= 1 ? '0-1 Frame (<16ms)' : `${nextRollback} Frames`;
    try {
      await roomService.updateRoomSettings(room.id, {
        rollbackFrames: nextRollback,
        inputDelayTarget: nextDelay,
      });
      showToast(`Đã chỉnh độ trễ mạng: ${nextDelay}`);
    } catch {
      showToast('Không thể cập nhật độ trễ phòng.');
    } finally {
      setIsUpdatingSettings(false);
    }
  };

  const handleSaveRoomNote = async () => {
    if (!room || !isHost) return;
    try {
      await roomService.updateRoomSettings(room.id, { roomNote: roomNoteDraft });
      setEditingRoomNote(false);
      showToast(roomNoteDraft.trim() ? 'Đã cập nhật ghi chú phòng!' : 'Đã xóa ghi chú phòng.');
    } catch {
      showToast('Không thể lưu ghi chú phòng.');
    }
  };

  const handleCopyInviteForRoom = (code: string) => {
    const url = `${window.location.origin}${window.location.pathname}?room=${code}`;
    navigator.clipboard.writeText(url);
    showToast(`Đã sao chép link mời phòng ${code}!`);
  };

  const handleHostLaunch = async () => {
    if (!room) return;
    if (room.status === 'playing') {
      onLaunchNetplayMatch({
        room,
        role: 'host',
        playerUid: effectiveUid,
      });
      return;
    }
    if (!bothPlayersReady) {
      showToast(
        !room.guestUid
          ? 'Đang chờ người chơi khác vào phòng Port 2...'
          : !room.guestReady
          ? 'Đang chờ Port 2 nhấn nút Sẵn Sàng...'
          : 'Vui lòng nhấn Sẵn Sàng trước khi bắt đầu game.'
      );
      return;
    }
    try {
      await roomService.launchMatch(room.id);
    } catch {
      showToast('Không thể khởi chạy trận đấu. Vui lòng thử lại.');
    }
  };

  const handleJoinActiveMatch = () => {
    if (!room) return;
    const myRole: 'host' | 'guest' | 'spectator' =
      room.hostUid === effectiveUid ? 'host' : room.guestUid === effectiveUid ? 'guest' : 'spectator';
    if (room.status !== 'playing' && !isSpectator) {
      showToast('Vui lòng bấm "Sẵn Sàng" và chờ Chủ phòng nhấn Bắt Đầu Game.');
      return;
    }
    onLaunchNetplayMatch({
      room,
      role: myRole,
      playerUid: effectiveUid,
      lockToRoom: isInviteLocked,
    });
  };

  // Correct role detection using live Firebase Auth UID when signed in
  const effectiveUid = currentUser?.uid || playerProfile.uid;
  const isHost = Boolean(room && room.hostUid === effectiveUid);
  const isGuest = Boolean(room && room.guestUid === effectiveUid);
  const isSpectator = Boolean(room && !isHost && !isGuest);

  const filteredPublicRooms = publicRooms.filter((r) => {
    if (roomPlatformFilter !== 'ALL' && r.platform !== roomPlatformFilter) return false;
    if (onlyVacantRooms && r.guestUid) return false;
    if (roomSearchQuery.trim()) {
      const q = roomSearchQuery.trim().toLowerCase();
      return (
        r.code.toLowerCase().includes(q) ||
        r.gameTitle.toLowerCase().includes(q) ||
        r.hostName.toLowerCase().includes(q) ||
        (r.roomNote || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const formatFreshness = (iso?: string) => {
    if (!iso) return { label: 'Đang mở', stale: false };
    const diffSec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
    if (diffSec < 60) return { label: 'Vừa hoạt động', stale: false };
    const mins = Math.floor(diffSec / 60);
    if (mins < 5) return { label: `${mins} phút trước`, stale: false };
    return { label: `${mins} phút trước (chờ lâu)`, stale: true };
  };

  const activeGame =
    libraryGames.find((g) => g.id === room?.gameId) ||
    (room
      ? {
          ...ARENA_FALLBACK_GAME,
          id: room.gameId,
          title: room.gameTitle,
          platform: room.platform,
          boxArt: getCartridgeCoverArt(room.gameTitle, room.platform),
        }
      : ARENA_FALLBACK_GAME);

  const bothPlayersReady = Boolean(room?.hostUid && room?.guestUid && room?.hostReady && room?.guestReady);
  const liveLatencyMs = rtcStats.rttMs > 0 ? rtcStats.rttMs : room?.pingMs || serverRttMs || 0;

  const transportLabel =
    rtcStats.transportMode === 'p2p-lan'
      ? 'P2P LAN Direct (Tốc độ tối đa)'
      : rtcStats.transportMode === 'p2p-stun'
      ? 'WebRTC P2P Internet (STUN Direct)'
      : rtcStats.transportMode === 'ws-relay'
      ? 'WebSocket Relay (Qua NAT nghiêm ngặt)'
      : room?.guestUid
      ? 'Đang bắt tay WebRTC ICE...'
      : 'Chờ người chơi kết nối';

  return (
    <div className="w-full max-w-[1440px] mx-auto space-y-6 select-none font-sans">
      <input
        ref={romUploadInputRef}
        type="file"
        accept=".nes,.sfc,.smc,.gba,.gb,.gbc,.md,.gen,.zip"
        className="hidden"
        onChange={handleUploadRomInLobby}
      />

      {/* Toast */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 px-4 py-2.5 rounded-lg bg-[#1e1f26] border border-[#4cd7f6] text-[#4cd7f6] font-mono text-xs flex items-center gap-2 shadow-2xl animate-fade-in">
          <span className="material-symbols-outlined text-sm">wifi_channel</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {isInviteLocked && room && !isHost ? (
        <div className="min-h-screen flex items-center justify-center p-4 bg-[#0c0e14]">
          <div className="max-w-md w-full bg-[#161821] border border-[#4cd7f6]/35 rounded-2xl p-6 sm:p-8 text-center space-y-5 shadow-2xl">
            <div className="w-28 h-28 mx-auto rounded-2xl overflow-hidden border border-[#494454]/60 bg-[#0c0e14] shadow-lg">
              <img
                src={activeGame.boxArt}
                alt={room.gameTitle}
                className="w-full h-full object-cover"
              />
            </div>

            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#4cd7f6]/10 border border-[#4cd7f6]/30 text-[#4cd7f6] font-mono text-[11px] font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                PHÒNG #{room.code} • {room.platform}
              </div>
              <h2 className="font-headline font-bold text-xl text-white pt-1">
                {room.gameTitle}
              </h2>
              <p className="text-xs font-mono text-[#958ea0]">
                Chủ phòng: <span className="text-[#e2e2eb] font-bold">{room.hostName}</span> • {isGuest ? 'Bạn điều khiển Port 2' : 'Khán giả'}
              </p>
            </div>

            {room.status === 'playing' || isSpectator ? (
              <button
                type="button"
                onClick={handleJoinActiveMatch}
                className="w-full py-3.5 px-5 rounded-xl bg-gradient-to-r from-[#4cd7f6] to-[#34d399] text-[#002926] font-mono font-bold text-sm shadow-xl shadow-[#4cd7f6]/25 hover:brightness-110 flex items-center justify-center gap-2 cursor-pointer transition-all"
              >
                <span className="material-symbols-outlined text-lg">play_circle</span>
                <span>{room.status === 'playing' ? 'VÀO MÀN HÌNH CHƠI GAME' : 'VÀO XEM TRẬN ĐẤU'}</span>
              </button>
            ) : (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={handleToggleReady}
                  className={`w-full py-3.5 px-5 rounded-xl font-mono font-bold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    room.guestReady
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 hover:bg-emerald-500/30'
                      : 'bg-gradient-to-r from-amber-400 to-[#4cd7f6] text-[#002933] shadow-[0_0_24px_rgba(76,215,246,0.35)] hover:brightness-110'
                  }`}
                >
                  <span className="material-symbols-outlined text-lg">
                    {room.guestReady ? 'check_circle' : 'sports_esports'}
                  </span>
                  <span>
                    {room.guestReady ? 'ĐÃ SẴN SÀNG (BẤM ĐỂ HỦY)' : 'BẤM SẴN SÀNG VÀO GAME'}
                  </span>
                </button>
                <p className="text-[11px] font-mono text-[#958ea0]">
                  {room.guestReady
                    ? 'Đang chờ Chủ phòng nhấn Bắt Đầu Game — màn hình game sẽ tự mở ngay!'
                    : 'Nhấn Sẵn Sàng để Chủ phòng bắt đầu phát màn hình game cho bạn.'}
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={handleLeave}
              className="w-full py-2 px-4 rounded-xl bg-[#1e1f26] hover:bg-rose-500/15 text-[#958ea0] hover:text-rose-300 border border-[#494454]/40 hover:border-rose-500/40 font-mono text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
            >
              <span className="material-symbols-outlined text-sm">logout</span>
              <span>Thoát phòng</span>
            </button>
          </div>
        </div>
      ) : (
        <>
      {/* 1. Sub-Nav & Live Server Telemetry Strip */}
      <section className="w-full px-4 py-2.5 bg-[#0c0e14]/70 border-b border-[#494454]/20 flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-[#cbc3d7]">
        <div className="flex items-center gap-2 flex-wrap">
          {!isInviteLocked ? (
            <button onClick={handleLeave} className="hover:text-white transition-colors flex items-center gap-1 cursor-pointer">
              <span className="material-symbols-outlined text-sm">arrow_back</span>
              {room ? 'Rời Phòng' : 'Trang Chủ'}
            </button>
          ) : (
            <button onClick={onLeaveRoom} className="hover:text-amber-300 text-amber-400 transition-colors flex items-center gap-1 cursor-pointer">
              <span className="material-symbols-outlined text-sm">lock</span>
              Phòng Mời Cố Định
            </button>
          )}
          <span className="text-[#958ea0]">/</span>
          {room ? (
            <>
              <span className="text-[#4cd7f6] font-bold flex items-center gap-1">
                <span className="material-symbols-outlined text-base">meeting_room</span>
                Phòng #{room.code}
              </span>
              <span className="px-2 py-0.5 rounded bg-[#1e1f26] text-[10px] text-white border border-[#494454]/40">
                {isHost ? 'Bạn là Host (Port 1)' : isGuest ? 'Bạn là Challenger (Port 2)' : 'Khán giả (Spectator)'}
              </span>
            </>
          ) : (
            <span className="text-[#4cd7f6] font-bold flex items-center gap-1">
              <span className="material-symbols-outlined text-base">hub</span>
              Sảnh Thi Đấu Online Qua Internet (WebRTC P2P + WS Relay)
            </span>
          )}
        </div>

        {/* Player Identity & Server Status */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#111319] border border-[#494454]/30 text-[11px]">
            <span
              className={`w-2 h-2 rounded-full ${
                serverStatus === 'connected' || serverStatus === 'cloud-p2p'
                  ? 'bg-emerald-400 animate-pulse'
                  : serverStatus === 'reconnecting'
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-sky-400 animate-pulse'
              }`}
            ></span>
            <span className="text-[#cbc3d7]">
              {serverStatus === 'connected'
                ? `WS Server Online (${serverRttMs}ms)`
                : serverStatus === 'cloud-p2p'
                ? 'Cloud P2P Signaling Ready'
                : serverStatus === 'reconnecting'
                ? 'Đang kết nối lại...'
                : 'Đang dò kênh kết nối...'}
            </span>
          </div>

          {!currentUser && (
            editingNickname ? (
              <div className="flex items-center gap-1 bg-[#1e1f26] border border-[#4cd7f6]/50 rounded px-2 py-0.5">
                <input
                  type="text"
                  value={nicknameDraft}
                  onChange={(e) => setNicknameDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveNickname()}
                  className="bg-transparent text-white text-xs w-28 focus:outline-none"
                  autoFocus
                />
                <button onClick={handleSaveNickname} className="text-emerald-400 hover:text-emerald-300">
                  <span className="material-symbols-outlined text-sm">check</span>
                </button>
              </div>
            ) : (
              <button
                onClick={() => setEditingNickname(true)}
                className="px-2.5 py-1 rounded bg-[#1e1f26] hover:bg-[#282a30] border border-[#494454]/30 text-[#cbc3d7] hover:text-white flex items-center gap-1 cursor-pointer"
                title="Đổi tên hiển thị của bạn"
              >
                <span className="material-symbols-outlined text-xs text-[#4cd7f6]">badge</span>
                <span>{playerProfile.displayName}</span>
                <span className="material-symbols-outlined text-[11px] text-[#958ea0]">edit</span>
              </button>
            )
          )}

          {!room && (
            <>
              <button
                onClick={() => setShowJoinModal(true)}
                className="px-2.5 py-1 rounded bg-[#1e1f26] hover:bg-[#282a30] text-[#cbc3d7] hover:text-white border border-[#494454]/30 text-xs font-mono transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm text-emerald-400">login</span>
                Vào Bằng Mã ({publicRooms.length})
              </button>
              <button
                onClick={openCreateModal}
                className="px-3 py-1 rounded bg-[#4cd7f6] hover:bg-[#70e0f8] text-[#003641] font-bold text-xs font-mono shadow-md shadow-[#4cd7f6]/20 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">add_circle</span>
                Tạo Phòng Mới
              </button>
            </>
          )}
        </div>
      </section>

      {!room && isAutoJoiningInvite ? (
        <div className="min-h-[60vh] flex flex-col items-center justify-center p-6">
          <div className="bg-[#191b22] border border-[#4cd7f6]/30 rounded-2xl p-8 max-w-md w-full text-center space-y-4 shadow-2xl">
            <div className="w-14 h-14 mx-auto rounded-full border-2 border-[#4cd7f6] border-t-transparent animate-spin"></div>
            <h3 className="font-headline font-bold text-lg text-white">
              Đang Vào Thẳng Phòng Chơi...
            </h3>
            <p className="text-xs font-mono text-[#958ea0] leading-relaxed">
              Đang kết nối Port 2 trực tiếp vào màn hình game theo link mời mà không cần đăng nhập Google.
            </p>
          </div>
        </div>
      ) : !room ? (
        /* NETPLAY LOBBY HUB VIEW */
        <div className="space-y-6">
          {/* Hero Banner */}
          <div className="relative rounded-2xl overflow-hidden bg-gradient-to-r from-[#1c1d24] via-[#161720] to-[#0c0e14] border border-[#494454]/30 p-6 md:p-8">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
              <div className="space-y-2 text-center md:text-left">
                <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#4cd7f6]/10 border border-[#4cd7f6]/30 text-[#4cd7f6] font-mono text-xs font-bold">
                  <span className="w-2 h-2 rounded-full bg-[#4cd7f6] animate-pulse"></span>
                  WEBRTC P2P STREAM + UDP-LIKE INPUT CHANNEL
                </div>
                <h1 className="text-2xl md:text-3xl font-bold font-headline text-white">
                  Chơi Cùng Bạn Bè Từ Mọi Nơi Qua Internet
                </h1>
                <p className="text-xs md:text-sm font-mono text-[#958ea0] max-w-2xl">
                  Host đăng nhập Google để tạo phòng, chọn băng game và phát hình 60 FPS trực tiếp qua WebRTC STUN.
                  Bạn bè bấm link mời vào phòng, nhấn Sẵn Sàng là Host có thể Bắt Đầu Game ngay lập tức.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-3 shrink-0">
                <button
                  onClick={openCreateModal}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[#4cd7f6] hover:bg-[#70e0f8] text-[#003641] font-mono font-bold text-xs shadow-lg shadow-[#4cd7f6]/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-base">add_circle</span>
                  Tạo Phòng Mới (Host)
                </button>
                <button
                  onClick={() => setShowJoinModal(true)}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[#282a30] hover:bg-[#34373f] text-[#cbc3d7] hover:text-white border border-[#494454]/40 font-mono text-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-base">login</span>
                  Nhập Mã Phòng
                </button>
                {!currentUser && (
                  <button
                    onClick={() => loginWithGoogle().catch(() => {})}
                    className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-[#191b22] hover:bg-[#232632] text-[#d0bcff] border border-[#a078ff]/30 font-mono text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-sm">account_circle</span>
                    Đăng nhập Google (Host)
                  </button>
                )}
              </div>
            </div>
            {!currentUser && (
              <div className="mt-4 pt-3 border-t border-[#494454]/20 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
                <div className="flex items-center gap-2 text-amber-300">
                  <span className="material-symbols-outlined text-sm">shield_person</span>
                  <span>
                    Máy tạo phòng (Host) cần <strong>Đăng nhập Google</strong>. Người tham gia bằng link mời có thể vào chơi ngay không cần đăng nhập.
                  </span>
                </div>
                <button
                  onClick={() => loginWithGoogle().catch(() => {})}
                  className="px-3 py-1 rounded-lg bg-amber-400/15 hover:bg-amber-400/25 border border-amber-400/40 text-amber-200 font-bold cursor-pointer"
                >
                  Đăng nhập Google ngay
                </button>
              </div>
            )}
          </div>

          {/* My Hosted Rooms Manager (Shows Public & Private rooms owned by signed-in Host) */}
          {currentUser && !currentUser.isAnonymous && myHostedRooms.length > 0 && (
            <div className="bg-[#191b22] border border-[#a078ff]/40 rounded-2xl p-5 space-y-4 shadow-lg">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#494454]/20 pb-3">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#d0bcff]">admin_panel_settings</span>
                  <h3 className="font-headline font-bold text-white text-base">
                    Phòng Bạn Đã Tạo (Quản Lý Nhanh)
                  </h3>
                  <span className="px-2 py-0.5 rounded-full bg-[#a078ff]/15 text-[11px] font-mono text-[#d0bcff] border border-[#a078ff]/40">
                    {myHostedRooms.length} phòng đang mở
                  </span>
                </div>
                <span className="text-[11px] font-mono text-[#958ea0]">
                  Quản lý cả phòng Công khai &amp; Riêng tư, vào lại hoặc dọn phòng cũ
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {myHostedRooms.map((myRoom) => {
                  const fresh = formatFreshness(myRoom.updatedAt);
                  return (
                    <div
                      key={myRoom.id}
                      className="p-4 bg-[#111319] border border-[#494454]/40 hover:border-[#a078ff]/60 rounded-xl flex flex-col justify-between gap-3 transition-all"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs text-[#4cd7f6] font-bold">{myRoom.code}</span>
                          <div className="flex items-center gap-1">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${
                                myRoom.isPublic
                                  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                                  : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                              }`}
                            >
                              {myRoom.isPublic ? 'Công khai' : 'Riêng tư'}
                            </span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#1e1f26] text-[#cbc3d7] border border-[#494454]/40">
                              {myRoom.platform}
                            </span>
                          </div>
                        </div>
                        <h4 className="font-headline font-bold text-white text-sm line-clamp-1">{myRoom.gameTitle}</h4>
                        {myRoom.roomNote && (
                          <p className="text-[11px] font-mono text-[#d0bcff] line-clamp-1">“{myRoom.roomNote}”</p>
                        )}
                        <div className="flex items-center justify-between text-[11px] font-mono text-[#958ea0]">
                          <span className={myRoom.guestUid ? 'text-emerald-400' : 'text-[#cbc3d7]'}>
                            {myRoom.guestUid ? `Port 2: ${myRoom.guestName || 'Khách'}` : 'Port 2: Đang trống'}
                          </span>
                          <span className={fresh.stale ? 'text-amber-400' : 'text-emerald-400'}>{fresh.label}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-2 border-t border-[#494454]/20">
                        <button
                          type="button"
                          onClick={() => handleJoinByCode(myRoom.code)}
                          className="flex-1 py-1.5 px-2.5 rounded-lg bg-[#4cd7f6] hover:bg-[#70e0f8] text-[#003641] font-mono font-bold text-xs flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-sm">login</span>
                          Vào Lại
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopyInviteForRoom(myRoom.code)}
                          title="Sao chép link mời"
                          className="p-1.5 rounded-lg bg-[#1e1f26] hover:bg-[#282a30] text-[#4cd7f6] border border-[#494454]/40 cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-sm">share</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteHostedRoomFromList(myRoom)}
                          title="Đóng & xóa phòng này"
                          className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-sm">delete</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Public Rooms Section */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#494454]/20 pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#4cd7f6]">meeting_room</span>
                <h3 className="font-headline font-bold text-white text-base">
                  Phòng Chơi Công Khai Đang Mở
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-[#1e1f26] text-[11px] font-mono text-[#4cd7f6] border border-[#4cd7f6]/30">
                  {filteredPublicRooms.length}/{publicRooms.length} phòng
                </span>
              </div>
              <button
                onClick={openCreateModal}
                className="text-xs font-mono text-[#4cd7f6] hover:underline flex items-center gap-1 cursor-pointer"
              >
                + Tạo phòng mới
              </button>
            </div>

            {publicRooms.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 bg-[#191b22]/70 border border-[#494454]/25 rounded-xl p-3 font-mono text-xs">
                <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                  <span className="material-symbols-outlined text-sm text-[#958ea0]">search</span>
                  <input
                    type="text"
                    value={roomSearchQuery}
                    onChange={(e) => setRoomSearchQuery(e.target.value)}
                    placeholder="Tìm theo mã phòng, tên game, hoặc Host..."
                    className="w-full bg-transparent text-white placeholder-[#958ea0] focus:outline-none text-xs"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {(['ALL', 'NES', 'SNES', 'GBA', 'GENESIS'] as const).map((plat) => (
                    <button
                      key={plat}
                      type="button"
                      onClick={() => setRoomPlatformFilter(plat)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] border transition-colors cursor-pointer ${
                        roomPlatformFilter === plat
                          ? 'bg-[#4cd7f6]/20 border-[#4cd7f6] text-[#4cd7f6] font-bold'
                          : 'bg-[#111319] border-[#494454]/30 text-[#958ea0] hover:text-white'
                      }`}
                    >
                      {plat === 'ALL' ? 'Tất cả' : plat}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setOnlyVacantRooms((v) => !v)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] border transition-colors cursor-pointer ${
                      onlyVacantRooms
                        ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 font-bold'
                        : 'bg-[#111319] border-[#494454]/30 text-[#958ea0] hover:text-white'
                    }`}
                  >
                    Còn trống Port 2
                  </button>
                </div>
              </div>
            )}

            {filteredPublicRooms.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredPublicRooms.map((pubRoom) => {
                  const fresh = formatFreshness(pubRoom.updatedAt);
                  const isOwnRoom = Boolean(currentUser?.uid && pubRoom.hostUid === currentUser.uid);
                  return (
                    <div
                      key={pubRoom.id}
                      className="p-5 bg-[#1e1f26] border border-[#494454]/30 hover:border-[#4cd7f6]/50 rounded-2xl flex flex-col justify-between gap-4 transition-all shadow-md hover:shadow-xl"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-mono text-xs text-[#4cd7f6] font-bold tracking-wider">
                            {pubRoom.code}
                          </span>
                          <div className="flex items-center gap-1.5">
                            {pubRoom.status === 'playing' && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 animate-pulse">
                                LIVE
                              </span>
                            )}
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#111319] text-[#cbc3d7] border border-[#494454]/40">
                              {pubRoom.platform}
                            </span>
                          </div>
                        </div>
                        <h4 className="font-headline font-bold text-white text-sm line-clamp-1">
                          {pubRoom.gameTitle}
                        </h4>
                        {pubRoom.roomNote && (
                          <p className="text-[11px] font-mono text-[#d0bcff] mt-1 line-clamp-1">
                            “{pubRoom.roomNote}”
                          </p>
                        )}
                        <p className="text-xs font-mono text-[#958ea0] mt-1 flex items-center gap-2 flex-wrap">
                          <span>Host: {pubRoom.hostName}</span>
                          <span>•</span>
                          <span className={fresh.stale ? 'text-amber-400' : 'text-emerald-400'}>
                            {pubRoom.pingMs > 0 ? `${pubRoom.pingMs}ms` : fresh.label}
                          </span>
                        </p>
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t border-[#494454]/20 gap-2">
                        <span className={`text-[11px] font-mono ${pubRoom.guestUid ? 'text-amber-400' : 'text-emerald-400'}`}>
                          {pubRoom.guestUid ? '2/2 Đã Đủ Người (Vào Xem)' : '1/2 Trống Port 2'}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {isOwnRoom && (
                            <button
                              type="button"
                              onClick={() => handleDeleteHostedRoomFromList(pubRoom)}
                              title="Xóa phòng bạn đã tạo"
                              className="p-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 cursor-pointer"
                            >
                              <span className="material-symbols-outlined text-sm">delete</span>
                            </button>
                          )}
                          <button
                            onClick={() => handleJoinByCode(pubRoom.code)}
                            className="px-3.5 py-1.5 rounded-lg bg-[#4cd7f6] hover:bg-[#70e0f8] text-[#003641] font-mono font-bold text-xs shadow-md transition-all flex items-center gap-1 cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-sm">
                              {isOwnRoom ? 'login' : pubRoom.guestUid ? 'visibility' : 'sports_esports'}
                            </span>
                            {isOwnRoom ? 'Quản Lý' : pubRoom.guestUid ? 'Theo Dõi' : 'Tham Gia'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : publicRooms.length > 0 ? (
              <div className="bg-[#1e1f26] rounded-xl border border-[#494454]/30 p-8 text-center font-mono text-xs text-[#958ea0] space-y-3">
                <p>Không có phòng công khai nào khớp bộ lọc hiện tại.</p>
                <button
                  type="button"
                  onClick={() => {
                    setRoomSearchQuery('');
                    setRoomPlatformFilter('ALL');
                    setOnlyVacantRooms(false);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-[#282a30] hover:bg-[#34373f] text-[#4cd7f6] cursor-pointer"
                >
                  Đặt Lại Bộ Lọc
                </button>
              </div>
            ) : (
              <div className="bg-[#1e1f26] rounded-2xl border border-[#494454]/30 p-10 text-center flex flex-col items-center justify-center max-w-xl mx-auto my-4">
                <div className="w-16 h-16 rounded-2xl bg-[#4cd7f6]/10 border border-[#4cd7f6]/30 flex items-center justify-center text-[#4cd7f6] mb-4">
                  <span className="material-symbols-outlined text-3xl">sports_esports</span>
                </div>
                <h3 className="text-base font-bold font-headline text-white mb-2">
                  Chưa Có Phòng Công Khai Nào Đang Mở
                </h3>
                <p className="text-xs font-mono text-[#958ea0] max-w-md leading-relaxed mb-6">
                  Hãy tạo phòng mới và gửi mã phòng hoặc đường link mời cho bạn bè trên máy tính hoặc điện thoại khác để cùng chơi ngay lập tức.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button
                    onClick={openCreateModal}
                    className="px-5 py-2.5 rounded-xl bg-[#4cd7f6] hover:bg-[#70e0f8] text-[#003641] font-mono font-bold text-xs shadow-lg shadow-[#4cd7f6]/20 transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-base">add_circle</span>
                    Tạo Phòng Mới Ngay
                  </button>
                  <button
                    onClick={() => setShowJoinModal(true)}
                    className="px-5 py-2.5 rounded-xl bg-[#282a30] hover:bg-[#34373f] text-white border border-[#494454]/50 font-mono text-xs flex items-center gap-2 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-base">login</span>
                    Nhập Mã Phòng
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ACTIVE IN-ROOM CHAMBER VIEW */
        <>
          <div className="bg-[#191b22] rounded-xl p-5 border border-[#494454]/30 shadow-2xl relative overflow-hidden backdrop-blur-md">
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 relative z-10">
              {/* Room Code & Invite Link */}
              <div className="flex flex-wrap items-center gap-2.5 min-w-0 flex-1">
                <div className="flex items-center bg-[#0c0e14] border border-[#494454]/60 rounded-lg p-1 pl-3.5 pr-2 gap-2.5 shadow-inner shrink-0">
                  <span className="text-[#958ea0] font-mono text-[11px] whitespace-nowrap">MÃ PHÒNG:</span>
                  <span className="font-mono text-sm tracking-widest text-[#4cd7f6] font-bold whitespace-nowrap">
                    {room.code}
                  </span>
                  <button
                    onClick={handleCopyCode}
                    className="p-1.5 rounded hover:bg-[#1e1f26] text-[#cbc3d7] hover:text-[#4cd7f6] transition-colors cursor-pointer"
                    title="Sao chép mã phòng"
                  >
                    <span className="material-symbols-outlined text-sm">
                      {copiedCode ? 'check' : 'content_copy'}
                    </span>
                  </button>
                  <button
                    onClick={handleCopyInviteLink}
                    className="px-2 py-1 rounded bg-[#4cd7f6]/15 hover:bg-[#4cd7f6]/25 text-[#4cd7f6] font-mono text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
                    title="Sao chép đường link mời trực tiếp"
                  >
                    <span className="material-symbols-outlined text-xs">
                      {copiedLink ? 'check' : 'share'}
                    </span>
                    <span>{copiedLink ? 'Đã chép' : 'Link mời'}</span>
                  </button>
                </div>

                {/* Visibility Pill (Interactive for Host to toggle Public <-> Private live) */}
                {isHost ? (
                  <button
                    type="button"
                    onClick={handleToggleVisibility}
                    disabled={isUpdatingSettings}
                    title="Bấm để chuyển đổi giữa Công khai (hiện ở sảnh) và Riêng tư (chỉ vào bằng Mã/Link)"
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      room.isPublic
                        ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/20'
                        : 'bg-amber-500/10 border-amber-500/40 text-amber-300 hover:bg-amber-500/20'
                    }`}
                  >
                    <span className="material-symbols-outlined text-xs">
                      {room.isPublic ? 'public' : 'lock'}
                    </span>
                    <span>{room.isPublic ? 'Công khai' : 'Riêng tư'}</span>
                    <span className="material-symbols-outlined text-[12px] opacity-70">swap_horiz</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0c0e14] border border-[#494454]/40 text-xs font-mono whitespace-nowrap shrink-0">
                    <span className="material-symbols-outlined text-xs text-[#4cd7f6]">
                      {room.isPublic ? 'public' : 'lock'}
                    </span>
                    <span className="text-[#cbc3d7]">{room.isPublic ? 'Công khai' : 'Riêng tư'}</span>
                  </div>
                )}

                {/* Real Transport & Latency Diagnostics */}
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#1e1f26] border border-[#494454]/40 text-xs font-mono whitespace-nowrap max-w-full">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      rtcStats.dataChannelState === 'open'
                        ? 'bg-emerald-400 animate-pulse'
                        : rtcStats.transportMode === 'ws-relay'
                        ? 'bg-amber-400 animate-pulse'
                        : 'bg-sky-400 animate-pulse'
                    }`}
                  ></span>
                  <span className="text-white font-bold tabular-nums min-w-[36px] text-right">
                    {liveLatencyMs > 0 ? `${liveLatencyMs}ms` : `${serverRttMs}ms`}
                  </span>
                  <span className="text-[#494454]">|</span>
                  <span className="text-[#cbc3d7] truncate">{transportLabel}</span>
                </div>
              </div>

              {/* Ready, Close Room & Launch CTAs */}
              <div className="flex flex-wrap sm:flex-nowrap items-center justify-start xl:justify-end gap-2.5 shrink-0">
                {isHost && (
                  <button
                    type="button"
                    onClick={handleDeleteActiveRoom}
                    title="Đóng và xóa phòng ngay lập tức"
                    className="px-3 py-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/25 text-rose-300 border border-rose-500/35 font-mono text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <span className="material-symbols-outlined text-sm">delete_forever</span>
                    <span>Đóng &amp; Xóa Phòng</span>
                  </button>
                )}

                {!isSpectator && (
                  <button
                    type="button"
                    onClick={handleToggleReady}
                    className={`px-4 py-2 min-w-[164px] justify-center rounded-lg font-mono text-xs font-bold transition-colors flex items-center gap-2 shadow-lg cursor-pointer whitespace-nowrap shrink-0 ${
                      (isHost ? room.hostReady : room.guestReady)
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/30'
                        : isGuest
                        ? 'bg-gradient-to-r from-amber-400 to-[#4cd7f6] text-[#002933] border border-amber-300/60 shadow-[0_0_20px_rgba(251,191,36,0.4)] animate-pulse hover:brightness-110'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30'
                    }`}
                  >
                    <span className="material-symbols-outlined text-base">
                      {(isHost ? room.hostReady : room.guestReady) ? 'check_circle' : 'radio_button_unchecked'}
                    </span>
                    <span>{(isHost ? room.hostReady : room.guestReady) ? 'ĐÃ SẴN SÀNG' : 'BẤM ĐỂ SẴN SÀNG'}</span>
                  </button>
                )}

                {isHost ? (
                  <button
                    type="button"
                    onClick={handleHostLaunch}
                    disabled={!bothPlayersReady && room.status !== 'playing'}
                    title={
                      bothPlayersReady
                        ? 'Cả 2 người chơi đã sẵn sàng — bấm để bắt đầu game!'
                        : !room.guestUid
                        ? 'Chờ người chơi khác vào phòng Port 2 trước khi bắt đầu'
                        : !room.guestReady
                        ? 'Chờ Port 2 nhấn nút Sẵn Sàng để nút Bắt Đầu Game sáng lên'
                        : 'Hãy bật Sẵn Sàng để bắt đầu game'
                    }
                    className={`px-5 py-2 min-w-[176px] justify-center rounded-lg border font-mono font-bold text-xs flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 ${
                      room.status === 'playing'
                        ? 'bg-emerald-400 hover:bg-emerald-300 border-emerald-300 text-[#00291c] shadow-lg shadow-emerald-400/30 cursor-pointer'
                        : bothPlayersReady
                        ? 'bg-gradient-to-r from-[#4cd7f6] via-[#5ae6c6] to-[#34d399] border-[#4cd7f6] text-[#00312d] shadow-[0_0_24px_rgba(76,215,246,0.5)] hover:brightness-110 cursor-pointer'
                        : 'bg-[#22242d] text-[#7c7689] border-[#494454]/40 opacity-55 cursor-not-allowed shadow-none'
                    }`}
                  >
                    <span className="material-symbols-outlined text-base">
                      {bothPlayersReady || room.status === 'playing' ? 'play_arrow' : 'sports_esports'}
                    </span>
                    <span>{room.status === 'playing' ? 'QUAY LẠI MÀN HÌNH CHƠI' : 'BẮT ĐẦU GAME'}</span>
                  </button>
                ) : room.status === 'playing' || isSpectator ? (
                  <button
                    type="button"
                    onClick={handleJoinActiveMatch}
                    className={`px-5 py-2 rounded-lg border border-transparent font-mono font-bold text-xs flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      room.status === 'playing'
                        ? 'bg-emerald-400 hover:bg-emerald-300 text-[#00291c] shadow-xl animate-pulse'
                        : 'bg-[#4cd7f6] hover:bg-[#70e0f8] text-[#003641] shadow-lg shadow-[#4cd7f6]/20'
                    }`}
                  >
                    <span className="material-symbols-outlined text-base">
                      {room.status === 'playing' ? 'play_circle' : 'visibility'}
                    </span>
                    <span>{room.status === 'playing' ? 'VÀO TRẬN ĐẤU ĐANG DIỄN RA' : 'VÀO XEM TRẬN ĐẤU'}</span>
                  </button>
                ) : (
                  <div
                    className={`px-4 py-2 rounded-lg font-mono font-bold text-xs flex items-center gap-2 border whitespace-nowrap shrink-0 ${
                      room.guestReady
                        ? 'bg-[#4cd7f6]/10 border-[#4cd7f6]/40 text-[#4cd7f6]'
                        : 'bg-[#22242d] border-[#494454]/40 text-[#958ea0]'
                    }`}
                  >
                    <span className="material-symbols-outlined text-sm animate-pulse">
                      {room.guestReady ? 'hourglass_top' : 'touch_app'}
                    </span>
                    <span>
                      {room.guestReady
                        ? 'CHỜ CHỦ PHÒNG BẮT ĐẦU GAME...'
                        : 'HÃY BẤM SẴN SÀNG ĐỂ BẮT ĐẦU'}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* 3-Step Room Flow Progress Bar */}
            <div className="mt-4 pt-3 border-t border-[#494454]/25 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono relative z-10">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <span className="inline-flex items-center gap-1.5 text-emerald-400">
                  <span className="w-4 h-4 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-[10px] font-bold">
                    1
                  </span>
                  Đã tạo phòng
                </span>
                <span className="text-[#494454]">→</span>
                <span
                  className={`inline-flex items-center gap-1.5 ${
                    bothPlayersReady ? 'text-emerald-400' : 'text-amber-300'
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold border ${
                      bothPlayersReady
                        ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                        : 'bg-amber-500/20 border-amber-500/40 text-amber-300 animate-pulse'
                    }`}
                  >
                    2
                  </span>
                  {!room.guestUid
                    ? 'Đang chờ người khác vào phòng...'
                    : !room.guestReady
                    ? 'Port 2 đã vào — chờ bấm nút Sẵn Sàng'
                    : !room.hostReady
                    ? 'Chủ phòng hãy bấm Sẵn Sàng'
                    : 'Cả 2 đã Sẵn Sàng!'}
                </span>
                <span className="text-[#494454]">→</span>
                <span
                  className={`inline-flex items-center gap-1.5 ${
                    bothPlayersReady || room.status === 'playing' ? 'text-[#4cd7f6] font-bold' : 'text-[#7c7689]'
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold border ${
                      bothPlayersReady || room.status === 'playing'
                        ? 'bg-[#4cd7f6]/20 border-[#4cd7f6] text-[#4cd7f6]'
                        : 'bg-[#22242d] border-[#494454]/40 text-[#7c7689]'
                    }`}
                  >
                    3
                  </span>
                  {bothPlayersReady ? 'Nút Bắt Đầu Game đã sáng — nhấn để chơi!' : 'Bắt Đầu Game'}
                </span>
              </div>
              {!room.guestUid && isHost && (
                <button
                  type="button"
                  onClick={handleCopyInviteLink}
                  className="text-[#4cd7f6] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-xs">content_copy</span>
                  Gửi link mời cho bạn bè
                </button>
              )}
            </div>
          </div>

          {/* MAIN GRID */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Players & Active Game */}
            <div className="lg:col-span-7 space-y-6">
              <div className="bg-[#191b22] border border-[#494454]/30 rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-[#494454]/20 pb-3">
                  <h3 className="font-headline font-bold text-white text-base flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#4cd7f6]">group</span>
                    Người Chơi &amp; Cổng Tay Cầm
                  </h3>
                  <span className={`text-xs font-mono flex items-center gap-1.5 ${
                    rtcStats.dataChannelState === 'open' || serverStatus === 'connected' || serverStatus === 'cloud-p2p'
                      ? 'text-emerald-400'
                      : 'text-amber-400'
                  }`}>
                    <span
                      className={`w-2 h-2 rounded-full ${
                        rtcStats.dataChannelState === 'open' || serverStatus === 'connected' || serverStatus === 'cloud-p2p'
                          ? 'bg-emerald-400'
                          : 'bg-amber-400'
                      }`}
                    ></span>
                    {rtcStats.dataChannelState === 'open'
                      ? 'DataChannel: Unreliable Binary 0-Retransmit'
                      : serverStatus === 'connected'
                      ? 'Kênh tín hiệu: WS Server Sẵn sàng'
                      : serverStatus === 'cloud-p2p'
                      ? 'Kênh tín hiệu: Cloud P2P Sẵn sàng'
                      : 'Kênh tín hiệu: Đang kết nối'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Port 1: Host */}
                  <div className="p-4 bg-[#111319] border border-[#4cd7f6]/40 rounded-xl relative overflow-hidden space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 rounded bg-[#4cd7f6]/10 text-[#4cd7f6] border border-[#4cd7f6]/30 font-mono text-[10px] font-bold">
                        PORT 1 • HOST {isHost ? '(BẠN)' : ''}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold flex items-center gap-1 ${
                          room.hostReady
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                            : 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                        }`}
                      >
                        <span className="material-symbols-outlined text-xs">
                          {room.hostReady ? 'check' : 'hourglass_empty'}
                        </span>
                        {room.hostReady ? 'READY' : 'WAITING'}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-[#4cd7f6]/20 border border-[#4cd7f6]/50 flex items-center justify-center text-[#4cd7f6] font-bold text-lg shrink-0 overflow-hidden">
                        {room.hostAvatar ? (
                          <img src={room.hostAvatar} alt={room.hostName} className="w-full h-full object-cover" />
                        ) : (
                          room.hostName.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-headline font-bold text-white text-sm truncate">{room.hostName}</h4>
                        <p className="text-[11px] font-mono text-[#958ea0]">
                          Ping Server: {room.hostPingMs || serverRttMs || 1}ms
                        </p>
                        <span className="text-[10px] font-mono text-[#4cd7f6]">Điều khiển Port #1</span>
                      </div>
                    </div>
                  </div>

                  {/* Port 2: Guest */}
                  <div
                    className={`p-4 rounded-xl relative overflow-hidden space-y-3 transition-all ${
                      room.guestUid
                        ? 'bg-[#111319] border border-[#d0bcff]/40'
                        : 'bg-[#111319]/40 border-2 border-dashed border-[#494454]/40 flex flex-col justify-center items-center text-center'
                    }`}
                  >
                    {room.guestUid ? (
                      <>
                        <div className="flex items-center justify-between gap-2">
                          <span className="px-2 py-0.5 rounded bg-[#d0bcff]/10 text-[#d0bcff] border border-[#d0bcff]/30 font-mono text-[10px] font-bold">
                            PORT 2 • CHALLENGER {isGuest ? '(BẠN)' : ''}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold flex items-center gap-1 ${
                                room.guestReady
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                  : 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                              }`}
                            >
                              <span className="material-symbols-outlined text-xs">
                                {room.guestReady ? 'check' : 'hourglass_empty'}
                              </span>
                              {room.guestReady ? 'READY' : 'WAITING'}
                            </span>
                            {isHost && (
                              <button
                                onClick={async () => {
                                  if (!room.guestUid) return;
                                  const oldUid = room.guestUid;
                                  webrtcNetplay.disconnectPeer(oldUid);
                                  await roomService.clearGuestSlot(room.id);
                                  showToast('Đã làm trống Port 2 để bạn mới có thể tham gia.');
                                }}
                                title="Làm trống Port 2 (dùng khi khách bị treo kết nối)"
                                className="p-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 cursor-pointer"
                              >
                                <span className="material-symbols-outlined text-xs">person_remove</span>
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-xl bg-[#d0bcff]/20 border border-[#d0bcff]/50 flex items-center justify-center text-[#d0bcff] font-bold text-lg shrink-0 overflow-hidden">
                            {room.guestAvatar ? (
                              <img
                                src={room.guestAvatar}
                                alt={room.guestName || 'Guest'}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              (room.guestName || 'P2').charAt(0).toUpperCase()
                            )}
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-headline font-bold text-white text-sm truncate">
                              {room.guestName || 'Challenger'}
                            </h4>
                            <p className="text-[11px] font-mono text-[#958ea0]">
                              P2P RTT: {liveLatencyMs > 0 ? `${liveLatencyMs}ms` : 'Đang đo...'}
                            </p>
                            <span className="text-[10px] font-mono text-[#d0bcff]">Điều khiển Port #2</span>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="py-3 space-y-2">
                        <span className="material-symbols-outlined text-3xl text-[#494454]">person_add</span>
                        <p className="font-mono text-xs text-white font-bold">PORT 2 ĐANG CHỜ NGƯỜI CHƠI</p>
                        <p className="text-[11px] font-mono text-[#958ea0]">
                          Gửi link mời để bạn bè vào trực tiếp từ bất kỳ máy nào
                        </p>
                        <button
                          onClick={handleCopyInviteLink}
                          className="mt-1 px-3 py-1 rounded bg-[#282a30] hover:bg-[#34373f] text-[#4cd7f6] font-mono text-xs border border-[#4cd7f6]/30 transition-colors cursor-pointer"
                        >
                          Sao Chép Link Mời
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Spectators Bar */}
                {room.spectators && room.spectators.length > 0 && (
                  <div className="pt-3 border-t border-[#494454]/20 flex items-center justify-between text-xs font-mono">
                    <span className="text-[#958ea0] flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-sm">visibility</span>
                      Khán giả ({room.spectators.length}):
                    </span>
                    <div className="flex items-center gap-2 flex-wrap">
                      {room.spectators.map((s) => (
                        <span
                          key={s.id}
                          className="px-2 py-0.5 rounded bg-[#111319] text-[#cbc3d7] border border-[#494454]/30 text-[11px]"
                        >
                          {s.name} ({s.latencyMs}ms)
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Active Cartridge & Room Controls Card */}
              <div className="bg-[#191b22] border border-[#494454]/30 rounded-2xl p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between border-b border-[#494454]/20 pb-3 gap-2">
                  <div>
                    <h3 className="font-headline font-bold text-white text-base flex items-center gap-2">
                      <span className="material-symbols-outlined text-amber-400">sports_esports</span>
                      Băng Game &amp; Quản Lý Phòng
                    </h3>
                    <p className="text-xs font-mono text-[#958ea0]">
                      Host chạy lõi game &amp; stream trực tiếp sang Port 2 (Guest không cần có sẵn file ROM)
                    </p>
                  </div>

                  {isHost && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setRoomNoteDraft(room.roomNote || '');
                          setEditingRoomNote((v) => !v);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-[#111319] hover:bg-[#282a30] text-[#cbc3d7] border border-[#494454]/40 font-mono text-xs flex items-center gap-1 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-xs">edit_note</span>
                        Ghi chú
                      </button>
                      <button
                        onClick={() => setShowChangeCartridgeModal(true)}
                        className="px-3 py-1.5 rounded-lg bg-[#282a30] hover:bg-[#34373f] text-[#4cd7f6] border border-[#4cd7f6]/30 font-mono text-xs transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-sm">swap_horiz</span>
                        Đổi Game
                      </button>
                    </div>
                  )}
                </div>

                {isHost && editingRoomNote && (
                  <div className="flex items-center gap-2 bg-[#111319] border border-[#4cd7f6]/40 rounded-xl p-2.5 font-mono text-xs">
                    <input
                      type="text"
                      maxLength={120}
                      value={roomNoteDraft}
                      onChange={(e) => setRoomNoteDraft(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSaveRoomNote()}
                      placeholder="Nhập ghi chú phòng (VD: Chơi Co-op vui vẻ, P2 bấm nút nào cũng được)..."
                      className="flex-1 bg-transparent text-white placeholder-[#958ea0] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleSaveRoomNote}
                      className="px-3 py-1 rounded bg-[#4cd7f6] text-[#003641] font-bold cursor-pointer"
                    >
                      Lưu
                    </button>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row items-center gap-5">
                  <img
                    src={activeGame.artwork || activeGame.boxArt}
                    alt={activeGame.title}
                    className="w-24 h-28 rounded-xl object-contain bg-[#0c0e14] p-1 border border-[#494454]/50 shadow-xl"
                  />
                  <div className="space-y-2 text-center sm:text-left flex-1">
                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                      <span className="px-2 py-0.5 rounded bg-[#4cd7f6]/10 text-[#4cd7f6] border border-[#4cd7f6]/30 font-mono text-xs font-bold">
                        {activeGame.platform}
                      </span>
                      {isHost ? (
                        <span
                          className={`px-2 py-0.5 rounded font-mono text-xs border ${
                            activeRomReady === 'ready' || activeRomReady === 'arena'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : activeRomReady === 'drive'
                              ? 'bg-sky-500/10 text-sky-300 border-sky-500/30'
                              : 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                          }`}
                        >
                          {activeRomReady === 'ready'
                            ? 'ROM Đã Nạp Sẵn'
                            : activeRomReady === 'drive'
                            ? 'Tự Tải Từ Drive'
                            : activeRomReady === 'arena'
                            ? 'Arena 2P Tích Hợp'
                            : 'Chưa có file ROM (Sẽ chạy Arena 2P)'}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-mono text-xs">
                          2-Player NetPlay Ready
                        </span>
                      )}
                    </div>
                    <h4 className="font-headline font-bold text-white text-lg">{activeGame.title}</h4>
                    {room.roomNote && (
                      <p className="text-xs font-mono text-[#d0bcff]">“{room.roomNote}”</p>
                    )}
                    <p className="text-xs font-mono text-[#cbc3d7] line-clamp-2">{activeGame.description}</p>
                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 text-[11px] font-mono text-[#958ea0] pt-1">
                      <span>ICE: {rtcStats.iceConnectionState}</span>
                      <span>•</span>
                      {isHost ? (
                        <label className="inline-flex items-center gap-1.5 text-[#cbc3d7]">
                          <span>Buffer:</span>
                          <select
                            value={room.rollbackFrames || 1}
                            onChange={(e) => handleUpdateActiveRollback(Number(e.target.value))}
                            disabled={isUpdatingSettings}
                            className="bg-[#111319] border border-[#494454]/50 rounded px-1.5 py-0.5 text-[11px] text-[#4cd7f6] focus:outline-none"
                          >
                            <option value={1}>0-1 Frame (P2P Nhanh)</option>
                            <option value={2}>2 Frames (Cân Bằng)</option>
                            <option value={3}>3 Frames (Ổn Định Xa)</option>
                          </select>
                        </label>
                      ) : (
                        <span>Buffer: {room.inputDelayTarget}</span>
                      )}
                      <span>•</span>
                      <span>Stream: 60 FPS WebRTC + Relay</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Live Room Chat */}
            <div className="lg:col-span-5 bg-[#191b22] border border-[#494454]/30 rounded-2xl flex flex-col justify-between overflow-hidden min-h-[540px]">
              <div className="p-4 bg-[#111319] border-b border-[#494454]/30 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#4cd7f6] text-lg">chat</span>
                  <h3 className="font-headline font-bold text-white text-sm">Trò Chuyện Trong Phòng</h3>
                </div>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                  serverStatus === 'connected' || serverStatus === 'cloud-p2p'
                    ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
                    : 'text-amber-300 bg-amber-500/10 border-amber-500/30'
                }`}>
                  {serverStatus === 'connected'
                    ? `WS Live • ${serverRttMs}ms`
                    : serverStatus === 'cloud-p2p'
                    ? 'Cloud Live'
                    : 'Reconnecting...'}
                </span>
              </div>

              <div ref={chatScrollRef} className="flex-1 p-4 overflow-y-auto space-y-3 font-mono text-xs max-h-[400px]">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`p-2.5 rounded-xl border ${
                      m.isSystem
                        ? 'bg-[#111319]/50 border-[#494454]/20 text-[#958ea0] text-[11px]'
                        : m.senderUid === playerProfile.uid
                        ? 'bg-[#4cd7f6]/10 border-[#4cd7f6]/30 text-white ml-6'
                        : 'bg-[#282a30]/50 border-[#494454]/30 text-[#e2e2eb] mr-6'
                    }`}
                  >
                    {!m.isSystem && (
                      <div className="flex items-center justify-between mb-1 text-[10px] text-[#958ea0]">
                        <span className="font-bold text-[#4cd7f6]">{m.senderName}</span>
                        <span>
                          {m.timestamp?.includes('T')
                            ? new Date(m.timestamp).toLocaleTimeString('vi-VN', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : m.timestamp}
                        </span>
                      </div>
                    )}
                    <p className="leading-relaxed break-words">{m.text}</p>
                  </div>
                ))}
              </div>

              {/* Quick Emotes */}
              <div className="px-4 py-2 border-t border-[#494454]/20 bg-[#111319]/40 flex items-center gap-1.5 overflow-x-auto text-xs font-mono">
                {['Sẵn sàng!', 'Đợi chút nhé!', 'Chơi lại ván nữa?', 'GG!', 'Bắt đầu thôi!'].map((emote) => (
                  <button
                    key={emote}
                    onClick={() => handleSendMessage(emote)}
                    className="px-2.5 py-1 rounded bg-[#282a30] hover:bg-[#34373f] text-[#cbc3d7] hover:text-[#4cd7f6] transition-colors whitespace-nowrap text-[11px] cursor-pointer"
                  >
                    {emote}
                  </button>
                ))}
              </div>

              <div className="p-3 bg-[#111319] border-t border-[#494454]/30 flex items-center gap-2">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Nhắn tin với người chơi trong phòng..."
                  className="flex-1 bg-[#1e1f26] border border-[#494454]/40 rounded-lg px-3 py-2 text-xs font-mono text-white placeholder-[#958ea0] focus:outline-none focus:border-[#4cd7f6]"
                />
                <button
                  onClick={() => handleSendMessage()}
                  className="px-3.5 py-2 rounded-lg bg-[#4cd7f6] hover:bg-[#70e0f8] text-[#003641] font-mono font-bold text-xs shadow-md transition-all flex items-center gap-1 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-sm">send</span>
                </button>
              </div>
            </div>
          </div>
        </>
      )}
        </>
      )}

      {/* Non-blocking room creation progress bar or error alert when popup auto-closed */}
      {!room && isSubmitting && !showCreateModal && !showJoinModal && (
        <div className="bg-[#191b22] border border-[#4cd7f6]/40 rounded-xl px-4 py-3 flex items-center justify-between gap-3 font-mono text-xs text-[#4cd7f6] shadow-lg">
          <div className="flex items-center gap-2.5">
            <div className="w-4 h-4 rounded-full border-2 border-[#4cd7f6] border-t-transparent animate-spin shrink-0"></div>
            <span>Đang khởi tạo phòng chơi trực tuyến...</span>
          </div>
          <button
            type="button"
            onClick={closeCreateModal}
            className="px-2.5 py-1 rounded bg-[#282a30] hover:bg-[#34373f] text-[#cbc3d7] hover:text-white cursor-pointer"
          >
            Hủy
          </button>
        </div>
      )}

      {!room && createError && !isSubmitting && (
        <div className="bg-rose-500/10 border border-rose-500/40 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 font-mono text-xs text-rose-200 shadow-lg">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-rose-400">error</span>
            <span>{createError}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setCreateError(null);
                openCreateModal();
              }}
              className="px-3 py-1 rounded bg-[#4cd7f6] text-[#003641] font-bold cursor-pointer"
            >
              Thử Lại
            </button>
            <button
              type="button"
              onClick={() => setCreateError(null)}
              className="px-2 py-1 rounded bg-[#282a30] text-[#cbc3d7] cursor-pointer"
            >
              Đóng
            </button>
          </div>
        </div>
      )}

      {/* Create Room Modal */}
      {showCreateModal && (
        <div
          onClick={closeCreateModal}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[#1e1f26] border border-[#494454]/50 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-[#494454]/20 pb-3">
              <h3 className="font-headline font-bold text-lg text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-[#4cd7f6]">add_box</span>
                Khởi Tạo Phòng Chơi NetPlay
              </h3>
              <button
                type="button"
                onClick={closeCreateModal}
                className="text-[#958ea0] hover:text-white cursor-pointer"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            {!currentUser || currentUser.isAnonymous ? (
              <div className="py-4 text-center space-y-4 font-mono">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-[#4cd7f6]/10 border border-[#4cd7f6]/30 flex items-center justify-center text-[#4cd7f6]">
                  <span className="material-symbols-outlined text-3xl">account_circle</span>
                </div>
                <div className="space-y-1.5">
                  <h4 className="font-headline font-bold text-white text-base">
                    Yêu Cầu Đăng Nhập Google Để Tạo Phòng
                  </h4>
                  <p className="text-xs text-[#958ea0] max-w-sm mx-auto leading-relaxed">
                    Máy chủ tạo phòng (Host) cần liên kết Google để xác thực chủ phòng, chạy ROM và chia sẻ link mời cho bạn bè. Người nhận link có thể vào thẳng màn hình chơi ngay.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => loginWithGoogle().catch(() => showToast('Đăng nhập Google chưa hoàn tất.'))}
                    className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[#4cd7f6] hover:bg-[#70e0f8] text-[#003641] font-bold text-xs shadow-lg shadow-[#4cd7f6]/20 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-base">login</span>
                    Đăng nhập Google để Tạo Phòng
                  </button>
                  <button
                    type="button"
                    onClick={closeCreateModal}
                    className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-[#282a30] text-xs text-[#cbc3d7] hover:text-white cursor-pointer"
                  >
                    Hủy
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-4 font-mono text-xs">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[#cbc3d7]">Chọn Trò Chơi / Băng ROM</label>
                      <button
                        type="button"
                        onClick={() => romUploadInputRef.current?.click()}
                        className="text-[#4cd7f6] hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-xs">upload_file</span>
                        Tải ROM từ máy
                      </button>
                    </div>
                    <select
                      value={createGameId}
                      onChange={(e) => {
                        setCreateGameId(e.target.value);
                        const found = [...libraryGames, ARENA_FALLBACK_GAME].find((g) => g.id === e.target.value);
                        if (found) setCreatePlatform(found.platform);
                      }}
                      className="w-full bg-[#111319] border border-[#494454]/40 rounded-lg p-2.5 text-white focus:outline-none focus:border-[#4cd7f6]"
                    >
                      {libraryGames.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.title} ({g.platform})
                        </option>
                      ))}
                      <option value={ARENA_FALLBACK_GAME.id}>
                        {ARENA_FALLBACK_GAME.title} (Chơi thử 2P ngay không cần ROM)
                      </option>
                    </select>

                    {/* Pre-flight ROM Readiness Check */}
                    <div
                      className={`mt-2 px-3 py-2 rounded-lg border text-[11px] flex items-center justify-between gap-2 ${
                        createRomReady === 'ready' || createRomReady === 'arena'
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                          : createRomReady === 'drive'
                          ? 'bg-sky-500/10 border-sky-500/30 text-sky-300'
                          : 'bg-amber-500/10 border-amber-500/35 text-amber-200'
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-sm">
                          {createRomReady === 'ready'
                            ? 'check_circle'
                            : createRomReady === 'drive'
                            ? 'cloud_download'
                            : createRomReady === 'arena'
                            ? 'sports_esports'
                            : 'warning'}
                        </span>
                        <span>
                          {createRomReady === 'ready'
                            ? 'Tệp ROM đã nạp sẵn trong máy, khởi chạy ngay.'
                            : createRomReady === 'drive'
                            ? 'Game sẽ tự tải ROM từ Google Drive khi bắt đầu.'
                            : createRomReady === 'arena'
                            ? 'Đấu trường 2P tích hợp sẵn — chơi ngay không cần ROM.'
                            : 'Chưa tìm thấy tệp ROM trong bộ nhớ máy (sẽ chạy Arena 2P hoặc bấm Tải ROM).'}
                        </span>
                      </span>
                      {createRomReady === 'missing' && (
                        <button
                          type="button"
                          onClick={() => romUploadInputRef.current?.click()}
                          className="px-2 py-0.5 rounded bg-amber-400/20 hover:bg-amber-400/30 text-amber-100 font-bold shrink-0 cursor-pointer"
                        >
                          Nạp ROM
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[#cbc3d7] block mb-1">Hệ Máy</label>
                      <input
                        type="text"
                        disabled
                        value={createPlatform}
                        className="w-full bg-[#111319] border border-[#494454]/30 rounded-lg p-2 text-[#4cd7f6] font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[#cbc3d7] block mb-1">Tối Ưu Độ Trễ Mạng</label>
                      <select
                        value={createRollback}
                        onChange={(e) => setCreateRollback(Number(e.target.value))}
                        className="w-full bg-[#111319] border border-[#494454]/40 rounded-lg p-2 text-white"
                      >
                        <option value={1}>Ultra Low (0-1 Frame • P2P)</option>
                        <option value={2}>Standard (2 Frames • Khuyên dùng)</option>
                        <option value={3}>Cross-Region (3 Frames • Ổn định)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-[#cbc3d7] block mb-1">Ghi Chú Phòng (Tùy chọn)</label>
                    <input
                      type="text"
                      maxLength={120}
                      value={createRoomNote}
                      onChange={(e) => setCreateRoomNote(e.target.value)}
                      placeholder="VD: Chơi co-op đi cảnh, ai rảnh vào Port 2 nhé!"
                      className="w-full bg-[#111319] border border-[#494454]/40 rounded-lg px-3 py-2 text-white placeholder-[#958ea0] focus:outline-none focus:border-[#4cd7f6]"
                    />
                  </div>

                  <div>
                    <label className="text-[#cbc3d7] block mb-1.5">Chế Độ Hiển Thị Phòng</label>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="visibility"
                          checked={createIsPublic}
                          onChange={() => setCreateIsPublic(true)}
                          className="accent-[#4cd7f6]"
                        />
                        <span className="text-white">Công khai (Hiện trong sảnh)</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="visibility"
                          checked={!createIsPublic}
                          onChange={() => setCreateIsPublic(false)}
                          className="accent-[#4cd7f6]"
                        />
                        <span className="text-white">Riêng tư (Chỉ vào bằng Mã / Link)</span>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-3 border-t border-[#494454]/20">
                  <button
                    type="button"
                    onClick={closeCreateModal}
                    className="px-4 py-2 rounded-lg bg-[#282a30] hover:bg-[#34373f] text-xs font-mono text-[#cbc3d7] hover:text-white cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateRoom}
                    disabled={isSubmitting}
                    className="px-5 py-2 rounded-lg bg-[#4cd7f6] hover:bg-[#70e0f8] text-[#003641] font-mono font-bold text-xs shadow-lg shadow-[#4cd7f6]/20 transition-all cursor-pointer disabled:opacity-60"
                  >
                    {isSubmitting ? 'Đang tạo phòng...' : 'Tạo Phòng Ngay'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Join By Code Modal */}
      {showJoinModal && (
        <div
          onClick={closeJoinModal}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[#1e1f26] border border-[#494454]/50 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-[#494454]/20 pb-3">
              <h3 className="font-headline font-bold text-lg text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-emerald-400">login</span>
                Tham Gia Phòng Bằng Mã
              </h3>
              <button type="button" onClick={closeJoinModal} className="text-[#958ea0] hover:text-white cursor-pointer">
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <p className="text-[#cbc3d7]">
                Nhập mã phòng đầy đủ (VD: <span className="text-[#4cd7f6]">RV-4821-SNES</span>) hoặc 4 chữ số cuối:
              </p>
              <input
                type="text"
                value={joinCodeInput}
                onChange={(e) => {
                  setJoinCodeInput(e.target.value.toUpperCase());
                  setJoinError(null);
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleJoinByCode()}
                placeholder="VD: RV-4821-SNES hoặc 4821"
                className="w-full bg-[#111319] border border-[#494454]/60 rounded-lg px-4 py-3 text-base text-white tracking-widest text-center focus:outline-none focus:border-[#4cd7f6]"
                autoFocus
              />
              {joinError && <p className="text-rose-400 text-xs">{joinError}</p>}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={closeJoinModal}
                className="px-4 py-2 rounded-lg bg-[#282a30] hover:bg-[#34373f] text-xs font-mono text-[#cbc3d7] hover:text-white cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => handleJoinByCode()}
                disabled={isSubmitting || !joinCodeInput.trim()}
                className="px-5 py-2 rounded-lg bg-[#4cd7f6] hover:bg-[#70e0f8] text-[#003641] font-mono font-bold text-xs shadow-md transition-all cursor-pointer"
              >
                {isSubmitting ? 'Đang kết nối...' : 'Vào Phòng'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Cartridge Modal */}
      {showChangeCartridgeModal && (
        <div
          onClick={() => setShowChangeCartridgeModal(false)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[#1e1f26] border border-[#494454]/50 rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-[#494454]/20 pb-3">
              <h3 className="font-headline font-bold text-lg text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-400">swap_horiz</span>
                Chọn Băng Game Trong Thư Viện
              </h3>
              <button
                onClick={() => setShowChangeCartridgeModal(false)}
                className="text-[#958ea0] hover:text-white cursor-pointer"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => romUploadInputRef.current?.click()}
                className="px-3 py-1.5 rounded-lg bg-[#4cd7f6]/15 hover:bg-[#4cd7f6]/25 border border-[#4cd7f6]/40 text-[#4cd7f6] font-mono text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">upload_file</span>
                Tải Tệp ROM Mới Từ Máy
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto space-y-2">
              {[...availableGames, ...(libraryGames.length > 0 ? [ARENA_FALLBACK_GAME] : [])].map((g) => (
                <div
                  key={g.id}
                  onClick={() => handleSelectGameChange(g)}
                  className="p-3 bg-[#111319] hover:bg-[#282a30] border border-[#494454]/30 hover:border-[#4cd7f6]/50 rounded-xl cursor-pointer flex items-center justify-between transition-all"
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={g.artwork || g.boxArt}
                      alt={g.title}
                      className="w-12 h-12 rounded-lg object-contain bg-[#0c0e14] p-0.5"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-headline font-bold text-sm text-white">{g.title}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#4cd7f6]/10 text-[#4cd7f6]">
                          {g.platform}
                        </span>
                      </div>
                      <p className="text-[11px] font-mono text-[#958ea0] mt-0.5">{g.genre}</p>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-sm text-[#4cd7f6]">arrow_forward</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
