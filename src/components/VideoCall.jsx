import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Phone,
  PhoneOff,
  MonitorUp,
  Maximize2,
  Minimize2,
  Move,
} from 'lucide-react';
import '../styles/VideoCall.css';
import { clampFloatingRect } from '../utils/callLayout';

const TURN_URLS = String(import.meta.env.VITE_TURN_URLS || import.meta.env.VITE_TURN_URL || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const TURN_USERNAME = String(import.meta.env.VITE_TURN_USERNAME || '').trim();
const TURN_CREDENTIAL = String(import.meta.env.VITE_TURN_CREDENTIAL || '').trim();

const RTC_CONFIG = {
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
    ...(TURN_URLS.length
      ? [{
          urls: TURN_URLS,
          ...(TURN_USERNAME ? { username: TURN_USERNAME } : {}),
          ...(TURN_CREDENTIAL ? { credential: TURN_CREDENTIAL } : {}),
        }]
      : []),
  ],
  iceCandidatePoolSize: 10,
  bundlePolicy: 'max-bundle',
};

const AUDIO_CONSTRAINTS = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: false, // Disable to let our compressor handle it
  channelCount: { ideal: 1 },
  sampleRate: { ideal: 48000 },
  sampleSize: { ideal: 16 },
  latency: { ideal: 0.01 },
  noiseSuppressionMethod: 'experimental',
  echoCancellationMethod: 'experimental',
};

const VIDEO_CONSTRAINTS = {
  width: { ideal: 1280, max: 1920 },
  height: { ideal: 720, max: 1080 },
  frameRate: { ideal: 30, max: 30 },
  facingMode: 'user',
};

function normalizeRoomId(roomRaw) {
  return String(roomRaw || '')
    .split('_')
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join('_');
}

function normalizeCallType(value) {
  return String(value || '').toLowerCase() === 'audio' ? 'audio' : 'video';
}

function formatDuration(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return [hours, minutes, seconds]
      .map((value) => String(value).padStart(2, '0'))
      .join(':');
  }

  return [minutes, seconds]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');
}

function getMediaErrorMessage(error) {
  if (!error) return 'Could not access camera or microphone';

  switch (error.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return 'Camera or microphone permission was denied';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'Camera or microphone was not found';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'Camera is busy in another app. Close it and try again';
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return 'This camera setup is not supported on this device';
    default:
      return 'Could not access camera or microphone';
  }
}

function setMediaTrackEnabled(track, enabled) {
  if (!track) return;
  track.enabled = enabled;
}

async function tuneLocalStream(stream) {
  if (!stream) return stream;

  const [audioTrack] = stream.getAudioTracks();
  const [videoTrack] = stream.getVideoTracks();

  if (audioTrack) {
    audioTrack.contentHint = 'speech';
    try {
      const supported = navigator.mediaDevices?.getSupportedConstraints?.() || {};
      const audioConstraints = {
        ...AUDIO_CONSTRAINTS,
        ...(supported.voiceIsolation ? { voiceIsolation: true } : {}),
      };
      await audioTrack.applyConstraints(audioConstraints);
    } catch (err) {
      console.warn('Could not apply enhanced audio constraints', err);
    }
  }

  if (videoTrack) {
    videoTrack.contentHint = 'motion';
    try {
      await videoTrack.applyConstraints(VIDEO_CONSTRAINTS);
    } catch (err) {
      console.warn('Could not apply enhanced video constraints', err);
    }
  }

  return stream;
}

async function createProcessedAudioTrack(stream, store) {
  const [audioTrack] = stream.getAudioTracks();
  if (!audioTrack) return null;

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return audioTrack;

  if (!store.context) {
    store.context = new AudioCtx();
  }

  if (store.context.state === 'suspended') {
    try {
      await store.context.resume();
    } catch (err) {
      console.warn('Could not resume processing audio context', err);
    }
  }

  if (store.track) return store.track;

  const source = store.context.createMediaStreamSource(new MediaStream([audioTrack]));
  
  // === SIMPLE & BALANCED NOISE REDUCTION (Won't mute voices) ===
  
  // 1. Input gain
  const inputGain = store.context.createGain();
  inputGain.gain.value = 0.9;
  
  // 2. Notch filter for 60Hz hum only
  const notch60 = store.context.createBiquadFilter();
  notch60.type = 'notch';
  notch60.frequency.value = 60;
  notch60.Q.value = 15;
  
  // 3. Gentle highpass (keep voices, remove rumble)
  const highpass = store.context.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 80;
  highpass.Q.value = 0.7;
  
  // 4. Lowpass to remove hiss (but keep voices clear)
  const lowpass = store.context.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 12000;
  lowpass.Q.value = 0.7;
  
  // 5. Light compressor (normalize volume, not mute)
  const compressor = store.context.createDynamicsCompressor();
  compressor.threshold.value = -30;
  compressor.knee.value = 40;
  compressor.ratio.value = 2.5;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.4;
  
  // 6. Output gain
  const outputGain = store.context.createGain();
  outputGain.gain.value = 1.0;

  const destination = store.context.createMediaStreamDestination();

  // === BUILD SIMPLE SIGNAL CHAIN ===
  source.connect(inputGain);
  inputGain.connect(notch60);
  notch60.connect(highpass);
  highpass.connect(lowpass);
  lowpass.connect(compressor);
  compressor.connect(outputGain);
  outputGain.connect(destination);

  const processedTrack = destination.stream.getAudioTracks()[0];
  if (!processedTrack) return audioTrack;

  processedTrack.contentHint = 'speech';
  
  // Store nodes for cleanup
  store.nodes = [source, inputGain, notch60, highpass, lowpass, compressor, outputGain, destination];
  store.track = processedTrack;
  
  return processedTrack;
}

export default function VideoCall({
  socket,
  roomId,
  currentUserEmail,
  currentUserName,
  peerLabel = 'Other participant',
  enabled = true,
  compact = false,
  externalIncomingCall = null,
  onIncomingCallCleared = null,
  onCallStateChange = null,
}) {
  const panelRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const audioContextRef = useRef(null);
  const audioProcessingContextRef = useRef(null);
  const processedAudioNodesRef = useRef([]);
  const outgoingAudioTrackRef = useRef(null);
  const ringtoneTimeoutRef = useRef(null);
  const unansweredCallTimeoutRef = useRef(null);
  const activeNodesRef = useRef([]);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const pendingCandidatesRef = useRef([]);
  const joinedRoomRef = useRef('');
  const activeScreenTrackRef = useRef(null);
  const callStartedAtRef = useRef(null);
  const joinRoomFnRef = useRef(() => {});
  const resetCallStateRef = useRef(async () => {});
  const callGenerationRef = useRef(0);

  const [callStatus, setCallStatus] = useState('idle');
  const [incomingOffer, setIncomingOffer] = useState(null);
  const [incomingFrom, setIncomingFrom] = useState('');
  const [incomingCallType, setIncomingCallType] = useState('video');
  const [callType, setCallType] = useState('video');
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isAudioOnly, setIsAudioOnly] = useState(false);
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);
  const [callError, setCallError] = useState('');
  const [hasLocalPreview, setHasLocalPreview] = useState(false);
  const [hasRemotePreview, setHasRemotePreview] = useState(false);
  const [localVideoIsPortrait, setLocalVideoIsPortrait] = useState(false);
  const [remoteVideoIsPortrait, setRemoteVideoIsPortrait] = useState(false);
  const [remoteMediaMode, setRemoteMediaMode] = useState('camera');
  const [isSocketConnected, setIsSocketConnected] = useState(Boolean(socket?.connected));
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isFloating, setIsFloating] = useState(false);
  const [floatingRect, setFloatingRect] = useState({
    x: 24,
    y: 96,
    width: 460,
    height: 360,
  });
  const dragStateRef = useRef({
    active: false,
    startX: 0,
    startY: 0,
    startLeft: 0,
    startTop: 0,
  });
  const isResizingRef = useRef(false);
  const resizeObserverRef = useRef(null);
  const signalingRoomId = useMemo(() => normalizeRoomId(roomId), [roomId]);
  const normalizedCurrentUserEmail = useMemo(
    () => String(currentUserEmail || '').trim().toLowerCase(),
    [currentUserEmail]
  );

  const canCall = Boolean(socket && signalingRoomId && enabled);
  const canInitiateCall = canCall && isSocketConnected;
  const isCallActive = callStatus === 'calling' || callStatus === 'ringing' || callStatus === 'connected';
  const externalOfferForRoom = externalIncomingCall?.room === signalingRoomId ? externalIncomingCall.offer : null;
  const effectiveIncomingOffer = incomingOffer || externalOfferForRoom;
  const effectiveIncomingFrom = incomingFrom || (externalIncomingCall?.room === signalingRoomId
    ? (externalIncomingCall.fromName || externalIncomingCall.from)
    : '');
  const effectiveIncomingCallType = incomingOffer
    ? incomingCallType
    : normalizeCallType(externalIncomingCall?.room === signalingRoomId ? externalIncomingCall.callType : 'video');
  const hasIncomingRequest = Boolean(effectiveIncomingOffer);
  const isVoiceCall = callType === 'audio' || (hasIncomingRequest && effectiveIncomingCallType === 'audio');
  const showVideoStage = !isVoiceCall && (!compact || isCallActive || hasIncomingRequest);

  const statusLabel = useMemo(() => {
    if (callError) return callError;
    if (hasIncomingRequest) return `${effectiveIncomingFrom || peerLabel} is starting an ${effectiveIncomingCallType} call`;
    if (callStatus === 'calling') return `${callType === 'audio' ? 'Audio' : 'Video'} call ringing...`;
    if (callStatus === 'ringing') return 'Connecting...';
    if (callStatus === 'connected') return `Live • ${formatDuration(callSeconds)}`;
    return canInitiateCall ? 'Ready for a private call' : 'Connecting securely...';
  }, [callError, hasIncomingRequest, effectiveIncomingFrom, effectiveIncomingCallType, peerLabel, callStatus, callSeconds, canInitiateCall, callType]);

  const localMediaMode = isSharingScreen ? 'screen-share' : isAudioOnly ? 'audio-only' : 'camera';

  const updateVideoOrientation = useCallback((element, setter) => {
    if (!element) {
      setter(false);
      return;
    }
    const { videoWidth = 0, videoHeight = 0 } = element;
    if (!videoWidth || !videoHeight) {
      setter(false);
      return;
    }
    setter(videoHeight > videoWidth * 1.05);
  }, []);

  const emitMediaMode = useCallback((mode) => {
    if (!socket || !signalingRoomId) return;
    socket.emit('media-mode-changed', {
      room: signalingRoomId,
      mode,
    });
  }, [socket, signalingRoomId]);

  const syncVideoElement = async (element, stream, { muted = false } = {}) => {
    if (!element) return;

    if (element.srcObject === stream) {
      element.muted = muted;
      return;
    }

    element.srcObject = stream || null;
    element.muted = muted;

    if (!stream) return;

    try {
      await element.play();
    } catch (err) {
      // Ignore play races triggered by srcObject swaps; real playback will recover on the next stable frame.
      if (err?.name !== 'AbortError') {
        console.warn('Video autoplay was blocked or deferred', err);
      }
    }
  };

  const clearScheduledTone = () => {
    if (ringtoneTimeoutRef.current) {
      window.clearTimeout(ringtoneTimeoutRef.current);
      ringtoneTimeoutRef.current = null;
    }
    activeNodesRef.current.forEach(({ oscillator, gain }) => {
      try { oscillator.stop(); } catch (err) { void err; }
      try { oscillator.disconnect(); } catch (err) { void err; }
      try { gain.disconnect(); } catch (err) { void err; }
    });
    activeNodesRef.current = [];
  };

  const getAudioContext = useCallback(async () => {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioCtx();
    }
    if (audioContextRef.current.state === 'suspended') {
      try {
        await audioContextRef.current.resume();
      } catch (err) {
        console.warn('Could not resume audio context', err);
      }
    }
    return audioContextRef.current;
  }, []);

  const playToneBurst = useCallback(async (frequencies, durationMs = 180, volume = 0.025) => {
    const context = await getAudioContext();
    if (!context) return;

    const startAt = context.currentTime + 0.01;
    const stopAt = startAt + durationMs / 1000;

    frequencies.forEach((frequency) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, startAt);
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.linearRampToValueAtTime(volume, startAt + 0.02);
      gain.gain.linearRampToValueAtTime(0.0001, stopAt);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(startAt);
      oscillator.stop(stopAt + 0.02);
      activeNodesRef.current.push({ oscillator, gain });
      oscillator.onended = () => {
        activeNodesRef.current = activeNodesRef.current.filter((node) => node.oscillator !== oscillator);
        try { oscillator.disconnect(); } catch (err) { void err; }
        try { gain.disconnect(); } catch (err) { void err; }
      };
    });
  }, [getAudioContext]);

  const startToneLoop = useCallback((kind) => {
    clearScheduledTone();

    const schedule = async () => {
      if (kind === 'incoming') {
        await playToneBurst([880, 1174], 220, 0.028);
        ringtoneTimeoutRef.current = window.setTimeout(async () => {
          await playToneBurst([880, 1174], 220, 0.028);
          ringtoneTimeoutRef.current = window.setTimeout(schedule, 1400);
        }, 320);
        return;
      }

      await playToneBurst([425], 360, 0.02);
      ringtoneTimeoutRef.current = window.setTimeout(schedule, 1800);
    };

    schedule();
  }, [playToneBurst]);

  const stopToneLoop = useCallback(() => {
    clearScheduledTone();
  }, []);

  const clearPeerConnection = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.onicecandidate = null;
      peerConnectionRef.current.ontrack = null;
      peerConnectionRef.current.onconnectionstatechange = null;
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    pendingCandidatesRef.current = [];
    remoteStreamRef.current = null;
    syncVideoElement(remoteVideoRef.current, null);
    syncVideoElement(remoteAudioRef.current, null);
    setPlaybackBlocked(false);
    setHasRemotePreview(false);
    setRemoteVideoIsPortrait(false);
    setRemoteMediaMode('camera');
  };

  const clearProcessedAudio = useCallback(() => {
    if (outgoingAudioTrackRef.current) {
      try {
        outgoingAudioTrackRef.current.stop();
      } catch (err) {
        void err;
      }
      outgoingAudioTrackRef.current = null;
    }

    processedAudioNodesRef.current.forEach((node) => {
      try {
        node.disconnect();
      } catch (err) {
        void err;
      }
    });
    processedAudioNodesRef.current = [];

    if (audioProcessingContextRef.current) {
      audioProcessingContextRef.current.close().catch(() => {});
      audioProcessingContextRef.current = null;
    }
  }, []);

  const stopScreenSharing = useCallback(async () => {
    const screenTrack = activeScreenTrackRef.current;
    if (!screenTrack) return;

    screenTrack.onended = null;
    screenTrack.stop();
    activeScreenTrackRef.current = null;
    setIsSharingScreen(false);

    const stream = localStreamRef.current;
    const cameraTrack = stream?.getVideoTracks?.()[0];
    const sender = peerConnectionRef.current
      ?.getSenders()
      ?.find((item) => item.track?.kind === 'video');

    if (sender && cameraTrack) {
      await sender.replaceTrack(cameraTrack);
    }

    if (localVideoRef.current) {
      await syncVideoElement(localVideoRef.current, localStreamRef.current, { muted: true });
    }
    setHasLocalPreview(Boolean(cameraTrack));
    setIsCameraOff(cameraTrack ? !cameraTrack.enabled : true);
    emitMediaMode(cameraTrack ? 'camera' : 'audio-only');
  }, [emitMediaMode]);

  const stopLocalMedia = async () => {
    await stopScreenSharing();
    clearProcessedAudio();

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    syncVideoElement(localVideoRef.current, null, { muted: true });
    setHasLocalPreview(false);
    setLocalVideoIsPortrait(false);
    setIsAudioOnly(false);
  };

  const resetCallState = async ({ keepJoinedRoom = true } = {}) => {
    callGenerationRef.current += 1;
    setIsFloating(false);
    setIsFullscreen(false);
    if (document.fullscreenElement === panelRef.current) document.exitFullscreen().catch(() => {});
    clearPeerConnection();
    await stopLocalMedia();
    setIncomingOffer(null);
    setIncomingFrom('');
    setIncomingCallType('video');
    setCallStatus(keepJoinedRoom ? 'idle' : 'idle');
    setCallError('');
    setCallSeconds(0);
    callStartedAtRef.current = null;
    if (!keepJoinedRoom) {
      joinedRoomRef.current = '';
    }
  };

  const ensureLocalMedia = useCallback(async (requestedCallType = 'video') => {
    if (localStreamRef.current) return localStreamRef.current;
    const generation = callGenerationRef.current;

    let stream;
    const audioOnly = normalizeCallType(requestedCallType) === 'audio';

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: audioOnly ? false : VIDEO_CONSTRAINTS,
        audio: AUDIO_CONSTRAINTS,
      });
      setIsAudioOnly(audioOnly);
      setIsCameraOff(audioOnly);
    } catch (error) {
      const canFallbackToAudio =
        error?.name === 'NotFoundError' ||
        error?.name === 'NotReadableError' ||
        error?.name === 'TrackStartError' ||
        error?.name === 'OverconstrainedError' ||
        error?.name === 'ConstraintNotSatisfiedError';

      if (!canFallbackToAudio) {
        throw error;
      }

      stream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: AUDIO_CONSTRAINTS,
      });
      setIsAudioOnly(true);
      setIsCameraOff(true);
      setCallError('Camera unavailable, continuing with audio only');
    }

    await tuneLocalStream(stream);
    if (generation !== callGenerationRef.current) {
      stream.getTracks().forEach(track => track.stop());
      throw new DOMException('Call cancelled', 'AbortError');
    }
    localStreamRef.current = stream;
    const audioProcessingStore = {
      context: audioProcessingContextRef.current,
      nodes: processedAudioNodesRef.current,
      track: outgoingAudioTrackRef.current,
    };
    const processedTrack = await createProcessedAudioTrack(stream, audioProcessingStore);
    if (generation !== callGenerationRef.current) {
      processedTrack?.stop();
      audioProcessingStore.nodes?.forEach(node => node.disconnect());
      audioProcessingStore.context?.close().catch(() => {});
      stream.getTracks().forEach(track => track.stop());
      throw new DOMException('Call cancelled', 'AbortError');
    }
    audioProcessingContextRef.current = audioProcessingStore.context;
    processedAudioNodesRef.current = audioProcessingStore.nodes || [];
    setIsMuted(false);

    outgoingAudioTrackRef.current = processedTrack || stream.getAudioTracks()[0] || null;

    syncVideoElement(localVideoRef.current, stream, { muted: true });
    setHasLocalPreview(stream.getVideoTracks().length > 0);
    emitMediaMode(stream.getVideoTracks().length > 0 ? 'camera' : 'audio-only');

    return stream;
  }, [emitMediaMode]);

  const flushPendingCandidates = async () => {
    if (
      !peerConnectionRef.current
      || !peerConnectionRef.current.remoteDescription
      || !pendingCandidatesRef.current.length
    ) return;

    const queued = [...pendingCandidatesRef.current];
    pendingCandidatesRef.current = [];

    for (const candidate of queued) {
      try {
        await peerConnectionRef.current.addIceCandidate(candidate);
      } catch (err) {
        console.error('Failed to apply queued ICE candidate', err);
      }
    }
  };

  const createPeerConnection = async (requestedCallType = callType) => {
    if (peerConnectionRef.current) return peerConnectionRef.current;

    const stream = await ensureLocalMedia(requestedCallType);
    const connection = new RTCPeerConnection(RTC_CONFIG);

    remoteStreamRef.current = new MediaStream();
    syncVideoElement(remoteVideoRef.current, remoteStreamRef.current, { muted: true });

    stream.getVideoTracks().forEach((track) => {
      connection.addTrack(track, stream);
    });

    if (outgoingAudioTrackRef.current) {
      connection.addTrack(outgoingAudioTrackRef.current, new MediaStream([outgoingAudioTrackRef.current]));
    }

    connection.onicecandidate = (event) => {
      if (!event.candidate || !socket || !signalingRoomId) return;
      socket.emit('ice-candidate', {
        room: signalingRoomId,
        candidate: event.candidate,
      });
    };

    connection.ontrack = (event) => {
      const [streamFromPeer] = event.streams;
      const targetStream = remoteStreamRef.current || new MediaStream();

      if (streamFromPeer) {
        streamFromPeer.getTracks().forEach((track) => {
          if (!targetStream.getTracks().some((item) => item.id === track.id)) {
            targetStream.addTrack(track);
          }
        });
      } else if (!targetStream.getTracks().some((item) => item.id === event.track.id)) {
        targetStream.addTrack(event.track);
      }

      remoteStreamRef.current = targetStream;
      syncVideoElement(remoteVideoRef.current, targetStream, { muted: true });
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = targetStream;
        remoteAudioRef.current.play().then(() => setPlaybackBlocked(false)).catch(error => {
          if (error.name === 'NotAllowedError') setPlaybackBlocked(true);
        });
      }
      setHasRemotePreview(targetStream.getVideoTracks().length > 0);
    };

    connection.onconnectionstatechange = () => {
      const state = connection.connectionState;
      if (state === 'connected') {
        setCallStatus('connected');
        setCallError('');
        if (!callStartedAtRef.current) {
          callStartedAtRef.current = Date.now();
        }
      } else if (state === 'failed') {
        setCallError('Connection failed');
      } else if (state === 'disconnected') {
        setCallError('Peer disconnected');
      }
    };

    peerConnectionRef.current = connection;
    return connection;
  };

  const joinRoom = () => {
    if (!socket || !signalingRoomId || joinedRoomRef.current === signalingRoomId || !enabled) {
      return;
    }
    socket.emit('join-room', { room: signalingRoomId });
  };

  useEffect(() => {
    joinRoomFnRef.current = joinRoom;
    resetCallStateRef.current = resetCallState;
  });

  const startCall = async (requestedCallType = 'video') => {
    if (isCallActive) return;
    const generation = callGenerationRef.current;
    if (!canInitiateCall) {
      setCallError('Call service is reconnecting. Try again in a moment.');
      return;
    }

    try {
      const nextCallType = normalizeCallType(requestedCallType);
      setCallError('');
      setIncomingOffer(null);
      setIncomingFrom('');
      setIncomingCallType('video');
      setCallType(nextCallType);
      setCallStatus('calling');
      joinRoom();

      const connection = await createPeerConnection(nextCallType);
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      if (generation !== callGenerationRef.current) return;

      socket.emit('offer', {
        room: signalingRoomId,
        offer,
        callType: nextCallType,
      });
    } catch (err) {
      console.error('Failed to start call', err);
      if (generation !== callGenerationRef.current) return;
      await resetCallState();
      setCallError(getMediaErrorMessage(err));
    }
  };

  const acceptCall = async () => {
    const generation = callGenerationRef.current;
    if (!effectiveIncomingOffer || !socket || !signalingRoomId) return;

    try {
      const nextCallType = normalizeCallType(effectiveIncomingCallType);
      setCallError('');
      setCallType(nextCallType);
      setCallStatus('ringing');
      joinRoom();

      const connection = await createPeerConnection(nextCallType);
      await connection.setRemoteDescription(new RTCSessionDescription(effectiveIncomingOffer));
      await flushPendingCandidates();

      const answer = await connection.createAnswer();
      await connection.setLocalDescription(answer);
      if (generation !== callGenerationRef.current) return;

      socket.emit('answer', {
        room: signalingRoomId,
        answer,
        callType: nextCallType,
      });

      setIncomingOffer(null);
      setIncomingFrom('');
      setIncomingCallType('video');
      onIncomingCallCleared?.();
    } catch (err) {
      console.error('Failed to accept call', err);
      if (generation !== callGenerationRef.current) return;
      await resetCallState();
      setCallError(getMediaErrorMessage(err));
    }
  };

  const declineIncomingCall = () => {
    if (socket && signalingRoomId) {
      socket.emit('call-declined', { room: signalingRoomId });
    }
    setIncomingOffer(null);
    setIncomingFrom('');
    setIncomingCallType('video');
    setCallStatus('idle');
    onIncomingCallCleared?.();
  };

  const endCall = async (notifyPeer = true) => {
    if (notifyPeer && socket && signalingRoomId) {
      socket.emit('call-ended', { room: signalingRoomId });
    }
    onIncomingCallCleared?.();
    stopToneLoop();
    await resetCallState();
  };

  const toggleMute = () => {
    const audioTrack = outgoingAudioTrackRef.current || localStreamRef.current?.getAudioTracks?.()[0];
    if (!audioTrack) return;
    const nextEnabled = !audioTrack.enabled;
    setMediaTrackEnabled(audioTrack, nextEnabled);
    setIsMuted(!nextEnabled);
  };

  const toggleCamera = () => {
    const videoTrack = localStreamRef.current?.getVideoTracks?.()[0];
    if (!videoTrack) return;
    videoTrack.enabled = !videoTrack.enabled;
    setIsCameraOff(!videoTrack.enabled);
  };

  const toggleScreenShare = useCallback(async () => {
    if (!peerConnectionRef.current || !localStreamRef.current) return;

    if (isSharingScreen) {
      await stopScreenSharing();
      return;
    }

    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
      });
      const screenTrack = displayStream.getVideoTracks()[0];
      const sender = peerConnectionRef.current
        .getSenders()
        .find((item) => item.track?.kind === 'video');

      if (!sender || !screenTrack) return;

      activeScreenTrackRef.current = screenTrack;
      await sender.replaceTrack(screenTrack);
      setIsSharingScreen(true);
      emitMediaMode('screen-share');

      if (localVideoRef.current) {
        syncVideoElement(localVideoRef.current, displayStream, { muted: true });
      }

      screenTrack.onended = async () => {
        if (localVideoRef.current && localStreamRef.current) {
          syncVideoElement(localVideoRef.current, localStreamRef.current, { muted: true });
        }
        await stopScreenSharing();
      };
    } catch (err) {
      console.error('Screen sharing failed', err);
      setCallError('Could not share screen');
    }
  }, [emitMediaMode, isSharingScreen, stopScreenSharing]);

  useEffect(() => {
    const localVideo = localVideoRef.current;
    const remoteVideo = remoteVideoRef.current;
    if (!localVideo && !remoteVideo) return undefined;

    const bindOrientation = (element, setter) => {
      if (!element) return () => {};
      const update = () => updateVideoOrientation(element, setter);
      element.addEventListener('loadedmetadata', update);
      element.addEventListener('resize', update);
      update();
      return () => {
        element.removeEventListener('loadedmetadata', update);
        element.removeEventListener('resize', update);
      };
    };

    const cleanupLocal = bindOrientation(localVideo, setLocalVideoIsPortrait);
    const cleanupRemote = bindOrientation(remoteVideo, setRemoteVideoIsPortrait);

    return () => {
      cleanupLocal();
      cleanupRemote();
    };
  }, [updateVideoOrientation, hasLocalPreview, hasRemotePreview, isSharingScreen, remoteMediaMode]);

  useEffect(() => {
    if (!socket) return undefined;

    const handleConnect = () => setIsSocketConnected(true);
    const handleDisconnect = () => setIsSocketConnected(false);
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    if (socket.connected) queueMicrotask(handleConnect);
    else queueMicrotask(handleDisconnect);
    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
    };
  }, [socket]);

  useEffect(() => {
    if (!canCall) {
      resetCallStateRef.current({ keepJoinedRoom: false });
      return undefined;
    }

    joinRoomFnRef.current();

    const handleConnect = () => {
      joinedRoomRef.current = '';
      joinRoomFnRef.current();
    };

    const handleAuthSuccess = () => {
      joinRoomFnRef.current();
    };

    socket?.on?.('connect', handleConnect);
    socket?.on?.('auth_success', handleAuthSuccess);

    return () => {
      socket?.off?.('connect', handleConnect);
      socket?.off?.('auth_success', handleAuthSuccess);
      resetCallStateRef.current({ keepJoinedRoom: false });
    };
  }, [canCall, signalingRoomId, socket]);

  useEffect(() => {
    if (!socket || !signalingRoomId) return undefined;

    const handleRoomJoined = ({ room }) => {
      if (room !== signalingRoomId) return;
      joinedRoomRef.current = room;
    };

    const handleOffer = async ({ room, offer, from, fromName, callType: offeredCallType }) => {
      if (room !== signalingRoomId || from === normalizedCurrentUserEmail) return;
      const nextCallType = normalizeCallType(offeredCallType);
      setIncomingOffer(offer);
      setIncomingFrom(fromName || from || peerLabel);
      setIncomingCallType(nextCallType);
      setCallType(nextCallType);
      setRemoteMediaMode(nextCallType === 'audio' ? 'audio-only' : 'camera');
      setCallStatus('ringing');
      setCallError('');
    };

    const handleAnswer = async ({ room, answer }) => {
      if (room !== signalingRoomId || !peerConnectionRef.current) return;
      try {
        await peerConnectionRef.current.setRemoteDescription(
          new RTCSessionDescription(answer)
        );
        await flushPendingCandidates();
      } catch (err) {
        console.error('Failed to apply call answer', err);
        setCallError('Could not establish the call');
      }
    };

    const handleIceCandidate = async ({ room, candidate }) => {
      if (room !== signalingRoomId || !candidate) return;
      const rtcCandidate = new RTCIceCandidate(candidate);

      if (!peerConnectionRef.current || !peerConnectionRef.current.remoteDescription) {
        pendingCandidatesRef.current.push(rtcCandidate);
        return;
      }

      try {
        await peerConnectionRef.current.addIceCandidate(rtcCandidate);
      } catch (err) {
        console.error('Failed to add ICE candidate', err);
      }
    };

    const handleCallEnded = async ({ room }) => {
      if (room !== signalingRoomId) return;
      await resetCallStateRef.current();
      setCallError('Call ended');
    };

    const handleCallDeclined = async ({ room }) => {
      if (room !== signalingRoomId) return;
      await resetCallStateRef.current();
      setCallError('Call declined');
    };

    const handlePeerDisconnected = async ({ room }) => {
      if (room !== signalingRoomId) return;
      await resetCallStateRef.current();
      setCallError('Peer disconnected');
    };

    const handleCallDenied = async ({ room, message }) => {
      if (room && room !== signalingRoomId) return;
      await resetCallStateRef.current();
      setCallError(message || 'Call access denied');
    };

    const handleMediaModeChanged = ({ room, mode }) => {
      if (room !== signalingRoomId) return;
      setRemoteMediaMode(mode || 'camera');
    };

    socket.on('room_joined', handleRoomJoined);
    socket.on('offer', handleOffer);
    socket.on('answer', handleAnswer);
    socket.on('ice-candidate', handleIceCandidate);
    socket.on('call-ended', handleCallEnded);
    socket.on('call-declined', handleCallDeclined);
    socket.on('peer-disconnected', handlePeerDisconnected);
    socket.on('call_access_denied', handleCallDenied);
    socket.on('media-mode-changed', handleMediaModeChanged);

    return () => {
      socket.off('room_joined', handleRoomJoined);
      socket.off('offer', handleOffer);
      socket.off('answer', handleAnswer);
      socket.off('ice-candidate', handleIceCandidate);
      socket.off('call-ended', handleCallEnded);
      socket.off('call-declined', handleCallDeclined);
      socket.off('peer-disconnected', handlePeerDisconnected);
      socket.off('call_access_denied', handleCallDenied);
      socket.off('media-mode-changed', handleMediaModeChanged);
    };
  }, [socket, signalingRoomId, normalizedCurrentUserEmail, peerLabel]);

  useEffect(() => {
    if (unansweredCallTimeoutRef.current) {
      window.clearTimeout(unansweredCallTimeoutRef.current);
      unansweredCallTimeoutRef.current = null;
    }
    if (callStatus !== 'calling') return undefined;

    unansweredCallTimeoutRef.current = window.setTimeout(async () => {
      if (socket && signalingRoomId) socket.emit('call-ended', { room: signalingRoomId });
      await resetCallStateRef.current();
      setCallError('No answer');
    }, 45_000);

    return () => {
      if (unansweredCallTimeoutRef.current) {
        window.clearTimeout(unansweredCallTimeoutRef.current);
        unansweredCallTimeoutRef.current = null;
      }
    };
  }, [callStatus, signalingRoomId, socket]);

  useEffect(() => {
    if (!canCall) return;
    emitMediaMode(localMediaMode);
  }, [canCall, emitMediaMode, localMediaMode]);

  useEffect(() => {
    if (callStatus !== 'connected') return undefined;

    const interval = window.setInterval(() => {
      if (!callStartedAtRef.current) return;
      setCallSeconds(Math.floor((Date.now() - callStartedAtRef.current) / 1000));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [callStatus]);

  useEffect(() => {
    if (typeof onCallStateChange !== 'function') return;
    onCallStateChange({
      status: callStatus,
      connected: callStatus === 'connected',
      active: isCallActive || hasIncomingRequest,
      incoming: hasIncomingRequest,
      callType: hasIncomingRequest ? effectiveIncomingCallType : callType,
      error: callError,
    });
  }, [onCallStateChange, callStatus, isCallActive, hasIncomingRequest, effectiveIncomingCallType, callType, callError]);

  useEffect(() => {
    if (hasIncomingRequest) {
      startToneLoop('incoming');
      return () => stopToneLoop();
    }

    if (callStatus === 'calling') {
      startToneLoop('outgoing');
      return () => stopToneLoop();
    }

    stopToneLoop();
    return undefined;
  }, [hasIncomingRequest, callStatus, startToneLoop, stopToneLoop]);

  useEffect(() => () => {
    stopToneLoop();
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
    }
  }, [stopToneLoop]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === panelRef.current);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    const panel = panelRef.current;
    if (!panel) return;

    try {
      if (isFloating) setIsFloating(false);
      if (isFullscreen) {
        if (document.fullscreenElement === panel) await document.exitFullscreen();
        setIsFullscreen(false);
      } else {
        await panel.requestFullscreen();
      }
    } catch (err) {
      // Mobile browsers and embedded views may disallow native fullscreen.
      // Keep the same expand control usable with a viewport-sized panel.
      console.info('Using in-page fullscreen', err);
      setIsFullscreen(true);
    }
  };

  useEffect(() => {
    const onKeyDown = event => {
      if (event.key === 'Escape' && !document.fullscreenElement) setIsFullscreen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const toggleFloating = async () => {
    if (document.fullscreenElement === panelRef.current) await document.exitFullscreen();
    setIsFullscreen(false);
    if (isFloating) {
      setIsFloating(false);
      return;
    }

    const panel = panelRef.current;
    if (panel) {
      const box = panel.getBoundingClientRect();
      setFloatingRect((prev) => clampFloatingRect({
        x: box.left || prev.x,
        y: box.top || prev.y,
        width: box.width || prev.width,
        height: box.height || prev.height,
      }));
    }
    setIsFloating(true);
  };

  useEffect(() => {
    const onMove = (event) => {
      if (!dragStateRef.current.active) return;
      const next = clampFloatingRect({
        x: dragStateRef.current.startLeft + (event.clientX - dragStateRef.current.startX),
        y: dragStateRef.current.startTop + (event.clientY - dragStateRef.current.startY),
        width: floatingRect.width,
        height: floatingRect.height,
      });
      setFloatingRect((prev) => ({ ...prev, x: next.x, y: next.y }));
    };

    const onUp = () => {
      dragStateRef.current.active = false;
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [floatingRect.width, floatingRect.height]);

  const startDragging = (event) => {
    if (!isFloating || !compact || isFullscreen) return;
    if (event.button !== 0) return;
    const targetTag = event.target?.tagName?.toLowerCase();
    if (targetTag === 'button' || targetTag === 'svg' || targetTag === 'path') return;
    dragStateRef.current = {
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      startLeft: floatingRect.x,
      startTop: floatingRect.y,
    };
  };

  useEffect(() => {
    if (!isFloating || !compact || !panelRef.current) return undefined;

    const panel = panelRef.current;
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry || !isFloating) return;
      if (dragStateRef.current.active) return;
      if (isResizingRef.current) return;
      isResizingRef.current = true;
      const { width, height } = panel.getBoundingClientRect();
      setFloatingRect((prev) => {
        const next = clampFloatingRect({ ...prev, width, height });
        return Object.keys(next).every((key) => Math.abs(next[key] - prev[key]) < 1) ? prev : next;
      });
      window.requestAnimationFrame(() => {
        isResizingRef.current = false;
      });
    });

    resizeObserver.observe(panel);
    resizeObserverRef.current = resizeObserver;
    return () => {
      resizeObserver.disconnect();
      resizeObserverRef.current = null;
    };
  }, [isFloating, compact]);

  useEffect(() => {
    if (!isFloating) return undefined;
    const onWindowResize = () => {
      setFloatingRect((prev) => clampFloatingRect(prev));
    };
    window.addEventListener('resize', onWindowResize);
    return () => window.removeEventListener('resize', onWindowResize);
  }, [isFloating]);

  return (
    <section
      ref={panelRef}
      className={`vc-panel ${compact ? 'vc-panel-compact' : ''} ${isCallActive ? 'vc-panel-live' : ''} ${isVoiceCall ? 'vc-panel-audio' : ''} ${isFullscreen ? 'vc-panel-fullscreen' : ''} ${isFloating ? 'vc-panel-floating' : ''}`}
      style={
        isFloating && compact
          ? {
              left: `${floatingRect.x}px`,
              top: `${floatingRect.y}px`,
              width: `${floatingRect.width}px`,
              height: `${floatingRect.height}px`,
            }
          : undefined
      }
    >
      <audio ref={remoteAudioRef} autoPlay />
      {callError && !isCallActive && <p className="vc-call-error" role="alert">{callError}</p>}
      {playbackBlocked && <button className="vc-btn vc-btn-primary" onClick={async () => {
        try { await remoteAudioRef.current?.play(); setPlaybackBlocked(false); }
        catch { setCallError('Tap Enable audio again to allow sound in your browser.'); }
      }}>Enable audio</button>}
      <div className="vc-header" onPointerDown={startDragging}>
        <div>
          <div className="vc-kicker">{compact ? 'Call controls' : 'Private call'}</div>
          <h3>{compact ? peerLabel : `${callType === 'audio' ? 'Audio' : 'Video'} call with ${peerLabel}`}</h3>
        </div>
        <div role="status" className={`vc-status ${isCallActive ? 'live' : ''}`}>
          <span>{statusLabel}</span>
          {isCallActive && !isMuted && (
            <span className="vc-audio-indicator" title="Audio noise cancellation active">
              <i className="fa-solid fa-waveform-lines" />
            </span>
          )}
        </div>
      </div>

      {hasIncomingRequest ? (
        <div className="vc-incoming">
          <span>{effectiveIncomingFrom || peerLabel} wants to start an {effectiveIncomingCallType} call.</span>
          <div className="vc-inline-actions">
            <button type="button" className="vc-btn vc-btn-primary" onClick={acceptCall}>
              <Phone size={16} />
              Accept
            </button>
            <button type="button" className="vc-btn vc-btn-ghost" onClick={declineIncomingCall}>
              <PhoneOff size={16} />
              Decline
            </button>
          </div>
        </div>
      ) : null}

      {!hasIncomingRequest ? <div className="vc-actions">
        {!isCallActive ? (
          <>
            <button
              type="button"
              className="vc-btn vc-btn-primary"
              onClick={() => startCall('audio')}
              disabled={!canInitiateCall}
              title="Start audio call"
              aria-label="Start audio call"
            >
              <Phone size={16} />
              Audio call
            </button>

            <button
              type="button"
              className="vc-btn vc-btn-ghost"
              onClick={() => startCall('video')}
              disabled={!canInitiateCall}
              title="Start video call"
              aria-label="Start video call"
            >
              <Video size={16} />
              Video call
            </button>
          </>
        ) : null}

        {isCallActive ? <button
          type="button"
          className={`vc-icon-btn ${isMuted ? 'active' : ''}`}
          onClick={toggleMute}
          aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
        >
          {isMuted ? <MicOff size={16} /> : <Mic size={16} />}
        </button> : null}

        {isCallActive && !isVoiceCall ? <button
          type="button"
          className={`vc-icon-btn ${isCameraOff ? 'active' : ''}`}
          onClick={toggleCamera}
          aria-label={isCameraOff ? 'Turn camera on' : 'Turn camera off'}
        >
          {isCameraOff ? <VideoOff size={16} /> : <Video size={16} />}
        </button> : null}

        {isCallActive && !isVoiceCall ? <button
          type="button"
          className={`vc-icon-btn ${isSharingScreen ? 'active' : ''}`}
          onClick={toggleScreenShare}
          aria-label={isSharingScreen ? 'Stop screen sharing' : 'Share screen'}
        >
          <MonitorUp size={16} />
        </button> : null}

        {isCallActive && !isVoiceCall ? <button
          type="button"
          className="vc-icon-btn vc-move-btn"
          onClick={toggleFloating}
          aria-label={isFloating ? 'Dock panel' : 'Move and resize panel'}
          title={isFloating ? 'Dock panel' : 'Move and resize panel'}
        >
          <Move size={16} />
        </button> : null}

        {isCallActive && !isVoiceCall ? <button
          type="button"
          className="vc-icon-btn vc-fullscreen-btn"
          onClick={toggleFullscreen}
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Open fullscreen'}
        >
          {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button> : null}

        {isCallActive ? <button
          type="button"
          className="vc-btn vc-btn-danger"
          onClick={() => endCall(true)}
          aria-label="End call"
        >
          <PhoneOff size={16} />
          End
        </button> : null}
      </div> : null}

      {isVoiceCall && (isCallActive || hasIncomingRequest) ? (
        <div className="vc-audio-stage">
          <div className="vc-audio-avatar" aria-hidden="true">
            <span>{String(peerLabel || 'P').trim().charAt(0).toUpperCase() || 'P'}</span>
          </div>
          <strong>{peerLabel}</strong>
          <span>{statusLabel}</span>
        </div>
      ) : null}

      <div hidden={!showVideoStage} className={`vc-grid ${isCallActive ? 'vc-grid-live' : ''}`}>
          <div className="vc-video-card vc-video-card-remote">
            <div className="vc-video-label">{peerLabel}</div>
            <video ref={remoteVideoRef} autoPlay muted playsInline className={`vc-video vc-${remoteMediaMode} ${remoteVideoIsPortrait ? 'vc-video-portrait' : ''}`} />
            {!hasRemotePreview ? (
              <div className="vc-video-empty">
                {callType === 'audio'
                  ? (callStatus === 'connected' ? `${peerLabel} is on the audio call` : `Waiting for ${peerLabel}`)
                  : 'Waiting for remote stream'}
              </div>
            ) : null}
          </div>

          <div className="vc-video-card vc-video-card-local">
            <div className="vc-video-label">You</div>
            <video ref={localVideoRef} autoPlay muted playsInline className={`vc-video vc-${localMediaMode} ${localVideoIsPortrait ? 'vc-video-portrait' : ''}`} />
            {(!hasLocalPreview || isCameraOff) ? (
              <div className="vc-video-empty">{isAudioOnly ? 'Audio only' : 'Camera preview'}</div>
            ) : null}
          </div>
        </div>
      <div className="vc-footer">
        <span>{enabled ? 'Your private session' : 'Book a session to unlock calls'}</span>
        <span>{currentUserName || currentUserEmail}</span>
      </div>
    </section>
  );
}
