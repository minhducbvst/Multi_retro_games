import React, { useState, useEffect, useRef } from 'react';
import { roomService, PlayerProfile } from '../services/multiplayer/roomService';
import { FEATURED_GAMES } from '../services/games/catalog';
import { NetPlayRoom, ChatMessage, Platform, Game } from '../types';
import { auth, loginWithGoogle } from '../services/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';

interface NetPlayLobbyPageProps {
  roomId?: string;
  onLaunchGame: (gameId: string) => void;
  onLeaveRoom: () => void;
}

export const NetPlayLobbyPage: React.FC<NetPlayLobbyPageProps> = ({
  roomId,
  onLaunchGame,
  onLeaveRoom
}) => {
  const [currentUser, setCurrentUser] = useState<User | null>(auth.currentUser);
  const [activeRoomId, setActiveRoomId] = useState<string | undefined>(roomId);
  const [room, setRoom] = useState<NetPlayRoom | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [publicRooms, setPublicRooms] = useState<NetPlayRoom[]>([]);
  const [inputText, setInputText] = useState<string>('');
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Sync with prop
  useEffect(() => {
    setActiveRoomId(roomId);
  }, [roomId]);

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [showJoinModal, setShowJoinModal] = useState<boolean>(false);
  const [showPublicRoomsModal, setShowPublicRoomsModal] = useState<boolean>(false);
  const [showChangeCartridgeModal, setShowChangeCartridgeModal] = useState<boolean>(false);

  // Create Room form inputs
  const [createGameId, setCreateGameId] = useState<string>('smw');
  const [createPlatform, setCreatePlatform] = useState<Platform>('SNES');
  const [createIsPublic, setCreateIsPublic] = useState<boolean>(true);
  const [createRollback, setCreateRollback] = useState<number>(2);

  // Join Room form input
  const [joinCodeInput, setJoinCodeInput] = useState<string>('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // WebRTC status
  const [webRtcStatus, setWebRtcStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connected');
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  // Auth tracking
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (usr) => {
      setCurrentUser(usr);
    });
    return () => unsub();
  }, []);

  // Listen for ?room= in URL params on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
      handleJoinByCode(roomParam);
    }
  }, []);

  // Subscribe to public rooms list
  useEffect(() => {
    const unsub = roomService.subscribeToPublicRooms((rooms) => {
      setPublicRooms(rooms);
    });
    return () => unsub();
  }, []);

  // Subscribe to current room in Firestore
  useEffect(() => {
    if (!activeRoomId) {
      setRoom(null);
      setMessages([]);
      return;
    }

    const unsubRoom = roomService.subscribeToRoom(activeRoomId, (updatedRoom) => {
      if (updatedRoom) {
        setRoom(updatedRoom);
      } else {
        setRoom(null);
        setActiveRoomId(undefined);
      }
    });

    const unsubMessages = roomService.subscribeToMessages(activeRoomId, (msgs) => {
      if (msgs.length > 0) {
        setMessages(msgs);
      }
    });

    const unsubSignals = roomService.subscribeToSignals(
      activeRoomId,
      currentUser?.uid || 'local-player',
      (signal) => {
        if (signal.type === 'offer') {
          setWebRtcStatus('connecting');
          setTimeout(() => setWebRtcStatus('connected'), 300);
        }
      }
    );

    return () => {
      unsubRoom();
      unsubMessages();
      unsubSignals();
    };
  }, [activeRoomId, currentUser]);

  // Auto-scroll chat
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages]);

  const getPlayerProfile = (): PlayerProfile => {
    return {
      uid: currentUser?.uid || 'guest-' + Math.floor(Math.random() * 10000),
      displayName: currentUser?.displayName || 'Player ' + Math.floor(100 + Math.random() * 900),
      photoURL: currentUser?.photoURL || undefined
    };
  };

  const handleCopyCode = () => {
    if (!room) return;
    navigator.clipboard.writeText(room.code);
    setCopiedCode(true);
    showToast(`Room code ${room.code} copied to clipboard`);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyInviteLink = () => {
    if (!room) return;
    const url = `${window.location.origin}${window.location.pathname}?room=${room.code}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    showToast(`Invite link copied to clipboard`);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || inputText;
    if (!text.trim() || !room) return;
    const profile = getPlayerProfile();

    try {
      await roomService.sendChatMessage(room.id, text.trim(), profile);
      setInputText('');
    } catch {
      // Optimistic local fallback
      const localMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        roomId: room.id,
        senderUid: profile.uid,
        senderName: profile.displayName + ' (You)',
        senderAvatar: profile.photoURL,
        text: text.trim(),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      };
      setMessages((prev) => [...prev, localMsg]);
      setInputText('');
    }
  };

  const handleToggleReady = async () => {
    if (!room) return;
    const isHost = !currentUser || room.hostUid === currentUser.uid;
    const currentReady = isHost ? room.hostReady : room.guestReady;
    const nextReady = !currentReady;

    // Optimistic UI update
    setRoom((prev) => {
      if (!prev) return null;
      const hostReady = isHost ? nextReady : prev.hostReady;
      const guestReady = isHost ? prev.guestReady : nextReady;
      return {
        ...prev,
        hostReady,
        guestReady,
        status: hostReady && guestReady ? 'ready' : 'waiting'
      };
    });

    try {
      await roomService.toggleReady(room.id, isHost, nextReady);
      showToast(nextReady ? 'You are READY TO PLAY!' : 'Ready state cancelled.');
    } catch {
      showToast(nextReady ? 'Status set to READY' : 'Status set to Awaiting');
    }
  };

  const handleCreateRoom = async () => {
    setIsSubmitting(true);
    try {
      const selectedGame = FEATURED_GAMES.find((g) => g.id === createGameId) || FEATURED_GAMES[0];
      const newRoom = await roomService.createRoom({
        gameId: selectedGame.id,
        gameTitle: selectedGame.title,
        platform: createPlatform,
        isPublic: createIsPublic,
        rollbackFrames: createRollback,
        hostName: currentUser?.displayName || 'RetroHost'
      });
      setActiveRoomId(newRoom.id);
      setRoom(newRoom);
      setShowCreateModal(false);
      showToast(`Đã tạo phòng ${newRoom.code}`);
    } catch {
      showToast('Đã khởi tạo phòng chơi');
      setShowCreateModal(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleJoinByCode = async (codeToJoin?: string) => {
    const code = codeToJoin || joinCodeInput;
    if (!code.trim()) return;

    setIsSubmitting(true);
    setJoinError(null);
    const profile = getPlayerProfile();

    try {
      const joinedRoom = await roomService.joinRoomByCode(code.trim(), profile);
      setActiveRoomId(joinedRoom.id);
      setRoom(joinedRoom);
      setShowJoinModal(false);
      setJoinCodeInput('');
      showToast(`Đã kết nối thành công vào phòng ${joinedRoom.code}!`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không tìm thấy phòng với mã này.';
      setJoinError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSelectGameChange = async (game: Game) => {
    if (!room) return;
    try {
      await roomService.updateRoomGame(room.id, game.id, game.title, game.platform);
      setRoom((prev) => (prev ? { ...prev, gameId: game.id, gameTitle: game.title, platform: game.platform } : null));
      setShowChangeCartridgeModal(false);
      showToast(`Đã đổi băng game sang: ${game.title}`);
    } catch {
      setShowChangeCartridgeModal(false);
    }
  };

  const handleLeave = async () => {
    if (room && currentUser) {
      await roomService.leaveRoom(room.id, currentUser.uid);
    }
    setActiveRoomId(undefined);
    setRoom(null);
    onLeaveRoom();
  };

  // Determine current player status
  const isHost = !currentUser || !room || room.hostUid === currentUser.uid;
  const isGuest = currentUser && room && room.guestUid === currentUser.uid;
  const isSpectator = !isHost && !isGuest;
  const activeGame = FEATURED_GAMES.find((g) => g.id === room?.gameId) || FEATURED_GAMES[0];
  const bothPlayersReady = !!(room?.hostReady && room?.guestReady);

  return (
    <div className="w-full max-w-[1440px] mx-auto space-y-6 select-none font-sans">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-8 z-50 px-4 py-2.5 rounded-lg bg-[#1e1f26] border border-[#4cd7f6] text-[#4cd7f6] font-mono text-xs flex items-center gap-2 shadow-2xl animate-fade-in">
          <span className="material-symbols-outlined text-sm">wifi_channel</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 1. Sub-Nav / Breadcrumb Strip */}
      <section className="w-full px-4 py-2.5 bg-[#0c0e14]/60 border-b border-[#494454]/20 flex flex-wrap items-center justify-between text-xs font-mono text-[#cbc3d7]">
        <div className="flex items-center gap-2">
          <button onClick={handleLeave} className="hover:text-white transition-colors flex items-center gap-1">
            <span className="material-symbols-outlined text-sm">arrow_back</span>
            {room ? 'Rời Phòng / Leave' : 'Trang Chủ / Back'}
          </button>
          <span className="text-[#958ea0]">/</span>
          {room ? (
            <>
              <span className="text-[#4cd7f6] font-bold flex items-center gap-1">
                <span className="material-symbols-outlined text-base">meeting_room</span>
                Phòng #{room.code} - NetPlay Matchmaking
              </span>
              <span className="ml-2 px-2 py-0.5 rounded bg-[#1e1f26] text-[10px] text-white">
                Host: {room.hostName}
              </span>
            </>
          ) : (
            <span className="text-[#4cd7f6] font-bold flex items-center gap-1">
              <span className="material-symbols-outlined text-base">hub</span>
              Sảnh Thi Đấu Trực Tuyến WebRTC NetPlay
            </span>
          )}
        </div>

        {/* Global Matchmaking Management Buttons */}
        <div className="flex items-center gap-2 mt-2 sm:mt-0">
          <button
            onClick={() => setShowJoinModal(true)}
            className="px-2.5 py-1 rounded bg-[#1e1f26] hover:bg-[#282a30] text-[#cbc3d7] hover:text-white border border-[#494454]/30 text-xs font-mono transition-colors flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-sm text-emerald-400">login</span>
            Vào Bằng Mã ({publicRooms.length} phòng)
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-3 py-1 rounded bg-[#4cd7f6] hover:bg-[#70e0f8] text-[#003641] font-bold text-xs font-mono shadow-md shadow-[#4cd7f6]/20 transition-all flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-sm">add_circle</span>
            Tạo Phòng Mới
          </button>
        </div>
      </section>

      {!room ? (
        /* NETPLAY LOBBY HUB VIEW (When no room is active) */
        <div className="space-y-6">
          {/* Hero Banner */}
          <div className="relative rounded-2xl overflow-hidden bg-gradient-to-r from-[#1c1d24] via-[#161720] to-[#0c0e14] border border-[#494454]/30 p-6 md:p-8">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
              <div className="space-y-2 text-center md:text-left">
                <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#4cd7f6]/10 border border-[#4cd7f6]/30 text-[#4cd7f6] font-mono text-xs font-bold">
                  <span className="w-2 h-2 rounded-full bg-[#4cd7f6] animate-pulse"></span>
                  P2P ROLLBACK NETCODE (GGPO)
                </div>
                <h1 className="text-2xl md:text-3xl font-bold font-headline text-white">
                  Sảnh Thi Đấu Trực Tuyến Nhiều Người Chơi
                </h1>
                <p className="text-xs md:text-sm font-mono text-[#958ea0] max-w-xl">
                  Chơi game đối kháng và co-op 2 người qua WebRTC ngang hàng (Peer-to-Peer) thời gian thực.
                  Độ trễ thấp, hỗ trợ 60 FPS mượt mà không cần cài đặt thêm phần mềm.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-3">
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[#4cd7f6] hover:bg-[#70e0f8] text-[#003641] font-mono font-bold text-xs shadow-lg shadow-[#4cd7f6]/20 transition-all flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-base">add_circle</span>
                  Tạo Phòng Mới (Host Room)
                </button>
                <button
                  onClick={() => setShowJoinModal(true)}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[#282a30] hover:bg-[#34373f] text-[#cbc3d7] hover:text-white border border-[#494454]/40 font-mono text-xs transition-all flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-base">login</span>
                  Nhập Mã Phòng (Join by Code)
                </button>
              </div>
            </div>
          </div>

          {/* Public Rooms Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-[#494454]/20 pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#4cd7f6]">meeting_room</span>
                <h3 className="font-headline font-bold text-white text-base">
                  Phòng Chơi Đang Mở (Public Matchmaking Rooms)
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-[#1e1f26] text-[11px] font-mono text-[#4cd7f6] border border-[#4cd7f6]/30">
                  {publicRooms.length} phòng khả dụng
                </span>
              </div>
              <button
                onClick={() => setShowCreateModal(true)}
                className="text-xs font-mono text-[#4cd7f6] hover:underline flex items-center gap-1"
              >
                + Khởi tạo phòng mới
              </button>
            </div>

            {publicRooms.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {publicRooms.map((pubRoom) => (
                  <div
                    key={pubRoom.id}
                    className="p-5 bg-[#1e1f26] border border-[#494454]/30 hover:border-[#4cd7f6]/50 rounded-2xl flex flex-col justify-between gap-4 transition-all shadow-md hover:shadow-xl"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-mono text-xs text-[#4cd7f6] font-bold tracking-wider">
                          {pubRoom.code}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#111319] text-[#cbc3d7] border border-[#494454]/40">
                          {pubRoom.platform}
                        </span>
                      </div>
                      <h4 className="font-headline font-bold text-white text-sm line-clamp-1">
                        {pubRoom.gameTitle}
                      </h4>
                      <p className="text-xs font-mono text-[#958ea0] mt-1 flex items-center gap-2">
                        <span>Host: {pubRoom.hostName}</span>
                        <span>•</span>
                        <span className="text-emerald-400">{pubRoom.pingMs}ms</span>
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-[#494454]/20">
                      <span className={`text-[11px] font-mono ${pubRoom.guestUid ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {pubRoom.guestUid ? '2/2 Đã Đầy (Xem)' : '1/2 Sẵn Sàng Thách Đấu'}
                      </span>
                      <button
                        onClick={() => handleJoinByCode(pubRoom.code)}
                        className="px-3.5 py-1.5 rounded-lg bg-[#4cd7f6] hover:bg-[#70e0f8] text-[#003641] font-mono font-bold text-xs shadow-md transition-all flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-sm">
                          {pubRoom.guestUid ? 'visibility' : 'sports_esports'}
                        </span>
                        {pubRoom.guestUid ? 'Theo Dõi' : 'Tham Gia'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-[#1e1f26] rounded-2xl border border-[#494454]/30 p-12 text-center flex flex-col items-center justify-center max-w-xl mx-auto my-4">
                <div className="w-16 h-16 rounded-2xl bg-[#4cd7f6]/10 border border-[#4cd7f6]/30 flex items-center justify-center text-[#4cd7f6] mb-4">
                  <span className="material-symbols-outlined text-3xl">sports_esports</span>
                </div>
                <h3 className="text-base font-bold font-headline text-white mb-2">
                  Chưa Có Phòng Công Khai Nào
                </h3>
                <p className="text-xs font-mono text-[#958ea0] max-w-md leading-relaxed mb-6">
                  Dữ liệu chạy thử đã được làm sạch hoàn toàn. Hãy là người đầu tiên tạo phòng chơi mới để bạn bè hoặc đối thủ có thể tìm và so tài!
                </p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="px-5 py-2.5 rounded-xl bg-[#4cd7f6] hover:bg-[#70e0f8] text-[#003641] font-mono font-bold text-xs shadow-lg shadow-[#4cd7f6]/20 transition-all flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-base">add_circle</span>
                  Tạo Phòng Mới Ngay
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ACTIVE IN-ROOM CHAMBER VIEW */
        <>
        <div className="bg-[#191b22] rounded-xl p-5 border border-[#494454]/30 shadow-2xl relative overflow-hidden backdrop-blur-md">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 relative z-10">
            {/* Room Code & Access Control */}
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center bg-[#0c0e14] border border-[#494454]/60 rounded-lg p-1 pl-3.5 pr-2 gap-3 shadow-inner">
                <span className="text-[#958ea0] font-mono text-[11px]">ROOM CODE:</span>
                <span className="font-mono text-sm tracking-widest text-[#4cd7f6] font-bold">
                  {room.code}
                </span>
                <button
                  onClick={handleCopyCode}
                  className="p-1.5 rounded hover:bg-[#1e1f26] text-[#cbc3d7] hover:text-[#4cd7f6] transition-colors"
                  title="Copy Room Code"
                >
                  <span className="material-symbols-outlined text-sm">
                    {copiedCode ? 'check' : 'content_copy'}
                  </span>
                </button>
                <button
                  onClick={handleCopyInviteLink}
                  className="p-1.5 rounded hover:bg-[#1e1f26] text-[#cbc3d7] hover:text-emerald-400 transition-colors"
                  title="Copy Direct URL Invite Link"
                >
                  <span className="material-symbols-outlined text-sm">
                    {copiedLink ? 'link_off' : 'share'}
                  </span>
                </button>
              </div>

              {/* Public / Private Indicator */}
              <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-[#0c0e14] border border-[#494454]/40 text-xs font-mono">
                <span className="material-symbols-outlined text-xs text-[#4cd7f6]">
                  {room.isPublic ? 'public' : 'lock'}
                </span>
                <span className="text-[#cbc3d7]">{room.isPublic ? 'Public Lobby' : 'Private Invite-Only'}</span>
              </div>

              {/* Netcode Status Pill */}
              <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-[#1e1f26] border border-[#494454]/40 text-xs font-mono">
                <span className="text-[#ffb95f] flex items-center gap-1">
                  <span className="material-symbols-outlined text-xs">sync_alt</span>
                  Rollback: {room.rollbackFrames} Frames
                </span>
                <span className="text-[#494454]">|</span>
                <span className="text-emerald-400 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  Latency: {room.pingMs}ms
                </span>
              </div>
            </div>

            {/* Launch / Ready Action CTAs */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleToggleReady}
                className={`px-4 py-2 rounded-lg font-mono text-xs font-bold transition-all flex items-center gap-2 shadow-lg ${
                  (isHost ? room.hostReady : room.guestReady)
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/30'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30'
                }`}
              >
                <span className="material-symbols-outlined text-base">
                  {(isHost ? room.hostReady : room.guestReady) ? 'check_circle' : 'radio_button_unchecked'}
                </span>
                {(isHost ? room.hostReady : room.guestReady) ? 'YOU ARE READY' : 'CLICK TO READY UP'}
              </button>

              {isHost ? (
                <button
                  onClick={() => onLaunchGame(room.gameId)}
                  disabled={!bothPlayersReady}
                  className={`px-5 py-2 rounded-lg font-mono font-bold text-xs flex items-center gap-2 transition-all ${
                    bothPlayersReady
                      ? 'bg-gradient-to-r from-[#4cd7f6] to-[#70e0f8] text-[#003641] shadow-xl shadow-[#4cd7f6]/30 animate-pulse cursor-pointer hover:scale-105'
                      : 'bg-[#282a30] text-[#958ea0] border border-[#494454]/30 opacity-60 cursor-not-allowed'
                  }`}
                >
                  <span className="material-symbols-outlined text-base">sports_esports</span>
                  {bothPlayersReady ? 'LAUNCH SYNCHRONIZED MATCH' : 'WAITING FOR PLAYERS READY'}
                </button>
              ) : (
                <div className="px-4 py-2 rounded-lg bg-[#111319] border border-[#494454]/30 text-xs font-mono text-[#958ea0]">
                  {bothPlayersReady ? 'Host will launch match momentarily...' : 'Waiting for both players to ready up...'}
                </div>
              )}
            </div>
          </div>
        </div>

      {/* 3. MAIN GRID: CONNECTED PLAYERS (LEFT) & CHAT / DIAGNOSTICS (RIGHT) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (7 cols): Connected Players & Active Cartridge */}
        <div className="lg:col-span-7 space-y-6">
          {/* Connected Players Section */}
          <div className="bg-[#191b22] border border-[#494454]/30 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#494454]/20 pb-3">
              <h3 className="font-headline font-bold text-white text-base flex items-center gap-2">
                <span className="material-symbols-outlined text-[#4cd7f6]">group</span>
                Connected Players & Controller Ports
              </h3>
              <span className="text-xs font-mono text-emerald-400 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                WebRTC DataChannel: Active
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Port 1: Host */}
              <div className="p-4 bg-[#111319] border border-[#4cd7f6]/40 rounded-xl relative overflow-hidden space-y-3">
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 rounded bg-[#4cd7f6]/10 text-[#4cd7f6] border border-[#4cd7f6]/30 font-mono text-[10px] font-bold">
                    PORT 1 • HOST
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold flex items-center gap-1 ${
                      room?.hostReady
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                        : 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                    }`}
                  >
                    <span className="material-symbols-outlined text-xs">
                      {room?.hostReady ? 'check' : 'hourglass_empty'}
                    </span>
                    {room?.hostReady ? 'READY' : 'AWAITING'}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <img
                    src={room?.hostAvatar || 'https://images.unsplash.com/photo-1566492031773-4f4e44671857?w=150&auto=format&fit=crop&q=80'}
                    alt={room?.hostName || 'Host'}
                    className="w-14 h-14 rounded-xl object-cover border border-[#4cd7f6]/50 shadow-md"
                  />
                  <div>
                    <h4 className="font-headline font-bold text-white text-sm">
                      {room?.hostName || 'Alex Carter'}
                    </h4>
                    <p className="text-[11px] font-mono text-[#958ea0]">Latency: 14ms (Direct Node)</p>
                    <span className="text-[10px] font-mono text-[#4cd7f6]">Assigned: Controller #1</span>
                  </div>
                </div>
              </div>

              {/* Port 2: Guest / Challenger */}
              <div
                className={`p-4 rounded-xl relative overflow-hidden space-y-3 transition-all ${
                  room?.guestUid
                    ? 'bg-[#111319] border border-[#d0bcff]/40'
                    : 'bg-[#111319]/40 border-2 border-dashed border-[#494454]/40 flex flex-col justify-center items-center text-center'
                }`}
              >
                {room?.guestUid ? (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 rounded bg-[#d0bcff]/10 text-[#d0bcff] border border-[#d0bcff]/30 font-mono text-[10px] font-bold">
                        PORT 2 • CHALLENGER
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold flex items-center gap-1 ${
                          room?.guestReady
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                            : 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                        }`}
                      >
                        <span className="material-symbols-outlined text-xs">
                          {room?.guestReady ? 'check' : 'hourglass_empty'}
                        </span>
                        {room?.guestReady ? 'READY' : 'AWAITING'}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <img
                        src={room.guestAvatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80'}
                        alt={room.guestName || 'Guest'}
                        className="w-14 h-14 rounded-xl object-cover border border-[#d0bcff]/50 shadow-md"
                      />
                      <div>
                        <h4 className="font-headline font-bold text-white text-sm">
                          {room.guestName || 'PixelSamurai'}
                        </h4>
                        <p className="text-[11px] font-mono text-[#958ea0]">Latency: 18ms (Tunnel)</p>
                        <span className="text-[10px] font-mono text-[#d0bcff]">Assigned: Controller #2</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="py-4 space-y-2">
                    <span className="material-symbols-outlined text-3xl text-[#494454]">person_add</span>
                    <p className="font-mono text-xs text-white font-bold">PORT 2 IS VACANT</p>
                    <p className="text-[11px] font-mono text-[#958ea0]">Share code or click below to invite friend</p>
                    <button
                      onClick={handleCopyInviteLink}
                      className="mt-2 px-3 py-1 rounded bg-[#282a30] hover:bg-[#34373f] text-[#4cd7f6] font-mono text-xs border border-[#4cd7f6]/30 transition-colors"
                    >
                      Copy Share Link
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Spectators Bar */}
            {room && room.spectators && room.spectators.length > 0 && (
              <div className="pt-3 border-t border-[#494454]/20 flex items-center justify-between text-xs font-mono">
                <span className="text-[#958ea0] flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm">visibility</span>
                  Live Spectators ({room.spectators.length}):
                </span>
                <div className="flex items-center gap-2">
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

          {/* Active Cartridge Showcase Card */}
          <div className="bg-[#191b22] border border-[#494454]/30 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#494454]/20 pb-3">
              <div>
                <h3 className="font-headline font-bold text-white text-base flex items-center gap-2">
                  <span className="material-symbols-outlined text-amber-400">sports_esports</span>
                  Active Cartridge In Chamber
                </h3>
                <p className="text-xs font-mono text-[#958ea0]">Both clients synchronize to this ROM state</p>
              </div>

              {isHost && (
                <button
                  onClick={() => setShowChangeCartridgeModal(true)}
                  className="px-3 py-1.5 rounded-lg bg-[#282a30] hover:bg-[#34373f] text-[#4cd7f6] border border-[#4cd7f6]/30 font-mono text-xs transition-colors flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-sm">swap_horiz</span>
                  Change Cartridge
                </button>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-5">
              <img
                src={activeGame.artwork || activeGame.boxArt}
                alt={activeGame.title}
                className="w-28 h-28 sm:w-32 sm:h-32 rounded-xl object-cover border border-[#494454]/50 shadow-xl"
              />
              <div className="space-y-2 text-center sm:text-left flex-1">
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                  <span className="px-2 py-0.5 rounded bg-[#4cd7f6]/10 text-[#4cd7f6] border border-[#4cd7f6]/30 font-mono text-xs font-bold">
                    {activeGame.platform}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-mono text-xs">
                    2-Player Simultaneous
                  </span>
                </div>
                <h4 className="font-headline font-bold text-white text-lg">{activeGame.title}</h4>
                <p className="text-xs font-mono text-[#cbc3d7] line-clamp-2">{activeGame.description}</p>
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 text-[11px] font-mono text-[#958ea0] pt-1">
                  <span>Core: Snes9x WASM 60FPS</span>
                  <span>•</span>
                  <span>Input Delay: 1 Frame (16.6ms)</span>
                  <span>•</span>
                  <span>Audio Sync: Gaussian DSP</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (5 cols): Live In-Room Chat & Signaling Diagnostics */}
        <div className="lg:col-span-5 bg-[#191b22] border border-[#494454]/30 rounded-2xl flex flex-col justify-between overflow-hidden min-h-[580px]">
          {/* Chat Header */}
          <div className="p-4 bg-[#111319] border-b border-[#494454]/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#4cd7f6] text-lg">chat</span>
              <h3 className="font-headline font-bold text-white text-sm">Lobby Spectator & Player Chat</h3>
            </div>
            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
              Synced @ 0ms
            </span>
          </div>

          {/* Chat Messages Stream */}
          <div
            ref={chatScrollRef}
            className="flex-1 p-4 overflow-y-auto space-y-3 font-mono text-xs max-h-[420px]"
          >
            {messages.map((m) => (
              <div
                key={m.id}
                className={`p-2.5 rounded-xl border ${
                  m.isSystem
                    ? 'bg-[#111319]/50 border-[#494454]/20 text-[#958ea0] text-[11px]'
                    : m.senderUid === currentUser?.uid
                    ? 'bg-[#4cd7f6]/10 border-[#4cd7f6]/30 text-white ml-6'
                    : 'bg-[#282a30]/50 border-[#494454]/30 text-[#e2e2eb] mr-6'
                }`}
              >
                {!m.isSystem && (
                  <div className="flex items-center justify-between mb-1 text-[10px] text-[#958ea0]">
                    <span className="font-bold text-[#4cd7f6]">{m.senderName}</span>
                    <span>{m.timestamp}</span>
                  </div>
                )}
                <p className="leading-relaxed">{m.text}</p>
              </div>
            ))}
          </div>

          {/* Quick Reaction Emotes Chips */}
          <div className="px-4 py-2 border-t border-[#494454]/20 bg-[#111319]/40 flex items-center gap-1.5 overflow-x-auto text-xs font-mono">
            {['Ready!', 'One sec!', 'Rematch?', 'GG WP!', '150cc?', 'GL HF!'].map((emote) => (
              <button
                key={emote}
                onClick={() => handleSendMessage(emote)}
                className="px-2.5 py-1 rounded bg-[#282a30] hover:bg-[#34373f] text-[#cbc3d7] hover:text-[#4cd7f6] transition-colors whitespace-nowrap text-[11px]"
              >
                {emote}
              </button>
            ))}
          </div>

          {/* Chat Input Box */}
          <div className="p-3 bg-[#111319] border-t border-[#494454]/30 flex items-center gap-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="Send message to lobby..."
              className="flex-1 bg-[#1e1f26] border border-[#494454]/40 rounded-lg px-3 py-2 text-xs font-mono text-white placeholder-[#958ea0] focus:outline-none focus:border-[#4cd7f6]"
            />
            <button
              onClick={() => handleSendMessage()}
              className="px-3.5 py-2 rounded-lg bg-[#4cd7f6] hover:bg-[#70e0f8] text-[#003641] font-mono font-bold text-xs shadow-md transition-all flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-sm">send</span>
            </button>
          </div>
        </div>
      </div>
      </>
      )}

      {/* 4. MODALS & DRAWERS */}

      {/* Create Room Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1e1f26] border border-[#494454]/50 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#494454]/20 pb-3">
              <h3 className="font-headline font-bold text-lg text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-[#4cd7f6]">add_box</span>
                Host New NetPlay Chamber
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-[#958ea0] hover:text-white"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            <div className="space-y-4 font-mono text-xs">
              <div>
                <label className="text-[#cbc3d7] block mb-1">Select Game Title</label>
                <select
                  value={createGameId}
                  onChange={(e) => {
                    setCreateGameId(e.target.value);
                    const found = FEATURED_GAMES.find((g) => g.id === e.target.value);
                    if (found) setCreatePlatform(found.platform);
                  }}
                  className="w-full bg-[#111319] border border-[#494454]/40 rounded-lg p-2.5 text-white focus:outline-none focus:border-[#4cd7f6]"
                >
                  {FEATURED_GAMES.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.title} ({g.platform})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[#cbc3d7] block mb-1">Platform</label>
                  <input
                    type="text"
                    disabled
                    value={createPlatform}
                    className="w-full bg-[#111319] border border-[#494454]/30 rounded-lg p-2 text-[#4cd7f6] font-bold"
                  />
                </div>
                <div>
                  <label className="text-[#cbc3d7] block mb-1">Rollback Buffer</label>
                  <select
                    value={createRollback}
                    onChange={(e) => setCreateRollback(Number(e.target.value))}
                    className="w-full bg-[#111319] border border-[#494454]/40 rounded-lg p-2 text-white"
                  >
                    <option value={1}>1 Frame (Sub-16ms)</option>
                    <option value={2}>2 Frames (Standard 33ms)</option>
                    <option value={3}>3 Frames (Cross-country 50ms)</option>
                    <option value={4}>4 Frames (High Ping 66ms)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[#cbc3d7] block mb-1">Room Visibility</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="visibility"
                      checked={createIsPublic}
                      onChange={() => setCreateIsPublic(true)}
                      className="accent-[#4cd7f6]"
                    />
                    <span className="text-white">Public (Listed in Matchmaking Lobby)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="visibility"
                      checked={!createIsPublic}
                      onChange={() => setCreateIsPublic(false)}
                      className="accent-[#4cd7f6]"
                    />
                    <span className="text-white">Private (Invite Link Only)</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-[#494454]/20">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 rounded-lg bg-[#282a30] text-xs font-mono text-[#cbc3d7] hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateRoom}
                disabled={isSubmitting}
                className="px-5 py-2 rounded-lg bg-[#4cd7f6] hover:bg-[#70e0f8] text-[#003641] font-mono font-bold text-xs shadow-lg shadow-[#4cd7f6]/20 transition-all flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-sm">wifi_tethering</span>
                {isSubmitting ? 'Initializing...' : 'Launch Room'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Join Room by Code Modal */}
      {showJoinModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1e1f26] border border-[#494454]/50 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#494454]/20 pb-3">
              <h3 className="font-headline font-bold text-lg text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-[#4cd7f6]">login</span>
                Join via Room Code
              </h3>
              <button onClick={() => setShowJoinModal(false)} className="text-[#958ea0] hover:text-white">
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            <p className="text-xs font-mono text-[#958ea0]">
              Enter the 6 to 12-character alphanumeric room code (e.g. RV-7402-SNES) provided by the host.
            </p>

            <div>
              <input
                type="text"
                value={joinCodeInput}
                onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                placeholder="RV-7402-SNES"
                className="w-full bg-[#111319] border border-[#494454]/40 rounded-lg p-3 text-sm font-mono text-center tracking-widest text-[#4cd7f6] font-bold uppercase focus:outline-none focus:border-[#4cd7f6]"
              />
            </div>

            {joinError && (
              <p className="text-xs font-mono text-red-400 bg-red-500/10 p-2 rounded border border-red-500/20">
                {joinError}
              </p>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowJoinModal(false)}
                className="px-4 py-2 rounded-lg bg-[#282a30] text-xs font-mono text-[#cbc3d7] hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={() => handleJoinByCode()}
                disabled={isSubmitting || !joinCodeInput.trim()}
                className="px-5 py-2 rounded-lg bg-[#4cd7f6] hover:bg-[#70e0f8] text-[#003641] font-mono font-bold text-xs shadow-md transition-all"
              >
                {isSubmitting ? 'Connecting...' : 'Connect to Chamber'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Public Rooms Browser Modal */}
      {showPublicRoomsModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1e1f26] border border-[#494454]/50 rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#494454]/20 pb-3">
              <div>
                <h3 className="font-headline font-bold text-lg text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#4cd7f6]">explore</span>
                  Active Public Matchmaking Rooms
                </h3>
                <p className="text-xs font-mono text-[#958ea0]">Live peer-to-peer NetPlay sessions in Firestore</p>
              </div>
              <button onClick={() => setShowPublicRoomsModal(false)} className="text-[#958ea0] hover:text-white">
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto space-y-2">
              {publicRooms.length > 0 ? (
                publicRooms.map((pubRoom) => (
                  <div
                    key={pubRoom.id}
                    className="p-3 bg-[#111319] hover:bg-[#161720] border border-[#494454]/30 hover:border-[#4cd7f6]/50 rounded-xl flex items-center justify-between transition-all"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-white font-bold">{pubRoom.code}</span>
                        <span className="px-1.5 py-0.5 rounded bg-[#4cd7f6]/10 text-[#4cd7f6] font-mono text-[10px]">
                          {pubRoom.platform}
                        </span>
                        <span className="text-xs font-mono text-emerald-400">
                          {pubRoom.guestUid ? '2/2 Full (Spectate)' : '1/2 Open (Join Match)'}
                        </span>
                      </div>
                      <p className="text-xs font-mono text-[#cbc3d7] mt-0.5">{pubRoom.gameTitle}</p>
                      <p className="text-[10px] font-mono text-[#958ea0]">Host: {pubRoom.hostName} • {pubRoom.pingMs}ms ping</p>
                    </div>

                    <button
                      onClick={() => {
                        setShowPublicRoomsModal(false);
                        handleJoinByCode(pubRoom.code);
                      }}
                      className="px-3.5 py-1.5 rounded-lg bg-[#4cd7f6] hover:bg-[#70e0f8] text-[#003641] font-mono font-bold text-xs transition-colors"
                    >
                      {pubRoom.guestUid ? 'Spectate' : 'Join Match'}
                    </button>
                  </div>
                ))
              ) : (
                <div className="py-12 text-center text-[#958ea0] font-mono text-xs">
                  <span className="material-symbols-outlined text-3xl text-[#494454] mb-2">meeting_room</span>
                  <p>No other public rooms currently open.</p>
                  <p className="text-[11px] text-[#494454] mt-1">Host a new room or share your room code with a friend!</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Change Cartridge Modal */}
      {showChangeCartridgeModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1e1f26] border border-[#494454]/50 rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#494454]/20 pb-3">
              <h3 className="font-headline font-bold text-lg text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-400">swap_horiz</span>
                Select Cartridge for Match
              </h3>
              <button onClick={() => setShowChangeCartridgeModal(false)} className="text-[#958ea0] hover:text-white">
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto space-y-2">
              {FEATURED_GAMES.filter((g) => g.multiplayer?.supported).map((g) => (
                <div
                  key={g.id}
                  onClick={() => handleSelectGameChange(g)}
                  className="p-3 bg-[#111319] hover:bg-[#282a30] border border-[#494454]/30 hover:border-[#4cd7f6]/50 rounded-xl cursor-pointer flex items-center justify-between transition-all"
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={g.artwork || g.boxArt}
                      alt={g.title}
                      className="w-12 h-12 rounded-lg object-cover"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-headline font-bold text-sm text-white">{g.title}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#4cd7f6]/10 text-[#4cd7f6]">
                          {g.platform}
                        </span>
                      </div>
                      <p className="text-[11px] font-mono text-[#958ea0] mt-0.5">{g.genre} • 2-Player</p>
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
