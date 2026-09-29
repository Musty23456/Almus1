import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import '../navigation.dart';
import '../screens/call_screen.dart';
import 'api_client.dart';
import 'socket_service.dart';

enum CallPhase { idle, outgoing, incoming, connecting, connected }

/// Owns everything about the current 1-to-1 voice/video call:
/// signaling (Socket.IO, see backend/src/sockets/callSignaling.ts) and the
/// WebRTC peer connection. The screens only listen to this object.
class CallService extends ChangeNotifier {
  CallService._();
  static final CallService instance = CallService._();

  SocketService? _socket;

  CallPhase phase = CallPhase.idle;
  String? callId;
  String peerName = '';
  bool isVideo = false;
  bool isCaller = false;
  bool muted = false;
  bool speakerOn = false;
  bool cameraOff = false;
  int seconds = 0;

  final RTCVideoRenderer localRenderer = RTCVideoRenderer();
  final RTCVideoRenderer remoteRenderer = RTCVideoRenderer();
  bool _renderersReady = false;

  RTCPeerConnection? _pc;
  MediaStream? _localStream;
  final List<RTCIceCandidate> _pendingCandidates = [];
  bool _remoteDescriptionSet = false;
  Timer? _ticker;
  Timer? _ringTimer;
  bool _screenOpen = false;

  bool get isConnectedToServer => _socket?.isConnected ?? false;

  // ---------------------------------------------------------------- lifecycle

  /// Call once after login (the chat list does this). Safe to call again.
  void start(String accessToken) {
    stop();
    final socket = SocketService();
    socket.connect(accessToken);
    socket.on('call:incoming', _onIncoming);
    socket.on('call:ringing', _onRinging);
    socket.on('call:accepted', _onAccepted);
    socket.on('call:rejected', _onRejected);
    socket.on('call:ended', _onEnded);
    socket.on('call:offer', _onOffer);
    socket.on('call:answer', _onAnswer);
    socket.on('call:ice', _onIce);
    socket.on('call:error', _onError);
    _socket = socket;
  }

  void stop() {
    if (phase != CallPhase.idle) _cleanup();
    _socket?.disconnect();
    _socket = null;
  }

  // ------------------------------------------------------------ user actions

  /// Returns false if the call could not be started (no connection / already busy).
  Future<bool> startCall({required String peerId, required String peerName, required bool video}) async {
    if (phase != CallPhase.idle) return false;
    if (!isConnectedToServer) {
      _toast('No connection. Try again in a moment.');
      return false;
    }
    await _initRenderers();
    this.peerName = peerName;
    isVideo = video;
    isCaller = true;
    phase = CallPhase.outgoing;
    notifyListeners();
    _socket?.emit('call:invite', {'calleeId': peerId, 'type': video ? 'VIDEO' : 'VOICE'});
    _openScreen();
    return true;
  }

  Future<void> accept() async {
    if (phase != CallPhase.incoming || callId == null) return;
    _stopRinging();
    phase = CallPhase.connecting;
    notifyListeners();
    try {
      // Get the microphone/camera and the peer connection ready BEFORE telling
      // the caller we accepted, so their offer never arrives too early.
      await _setupPeer();
      _socket?.emit('call:accept', {'callId': callId});
    } catch (_) {
      _toast('Could not access microphone/camera. Check permissions.');
      _socket?.emit('call:reject', {'callId': callId});
      _cleanup();
    }
  }

  void reject() {
    if (callId != null) _socket?.emit('call:reject', {'callId': callId});
    _cleanup();
  }

  void hangUp() {
    if (callId != null) _socket?.emit('call:end', {'callId': callId});
    _cleanup();
  }

  void toggleMute() {
    muted = !muted;
    for (final t in _localStream?.getAudioTracks() ?? <MediaStreamTrack>[]) {
      t.enabled = !muted;
    }
    notifyListeners();
  }

  void toggleSpeaker() {
    speakerOn = !speakerOn;
    Helper.setSpeakerphoneOn(speakerOn);
    notifyListeners();
  }

  void toggleCamera() {
    cameraOff = !cameraOff;
    for (final t in _localStream?.getVideoTracks() ?? <MediaStreamTrack>[]) {
      t.enabled = !cameraOff;
    }
    notifyListeners();
  }

  Future<void> switchCamera() async {
    final tracks = _localStream?.getVideoTracks() ?? <MediaStreamTrack>[];
    if (tracks.isNotEmpty) await Helper.switchCamera(tracks.first);
  }

  // --------------------------------------------------------- socket handlers

  void _onIncoming(Map<String, dynamic> data) {
    if (phase != CallPhase.idle) return; // already busy (server also guards this)
    final call = Map<String, dynamic>.from(data['call']);
    final caller = Map<String, dynamic>.from(call['caller'] ?? {});
    callId = call['id'].toString();
    peerName = (caller['fullName'] ?? caller['username'] ?? 'Unknown').toString();
    isVideo = call['type'] == 'VIDEO';
    isCaller = false;
    phase = CallPhase.incoming;
    _initRenderers().then((_) => notifyListeners());
    _startRinging();
    notifyListeners();
    _openScreen();
  }

  void _onRinging(Map<String, dynamic> data) {
    final call = Map<String, dynamic>.from(data['call']);
    callId = call['id'].toString();
    notifyListeners();
  }

  Future<void> _onAccepted(Map<String, dynamic> data) async {
    if (!isCaller || data['callId'] != callId) return;
    phase = CallPhase.connecting;
    notifyListeners();
    try {
      await _setupPeer();
      final offer = await _pc!.createOffer();
      await _pc!.setLocalDescription(offer);
      _socket?.emit('call:offer', {
        'callId': callId,
        'sdp': {'sdp': offer.sdp, 'type': offer.type},
      });
    } catch (_) {
      _toast('Could not access microphone/camera. Check permissions.');
      hangUp();
    }
  }

  void _onRejected(Map<String, dynamic> data) {
    if (data['callId'] != callId) return;
    _toast('Call declined');
    _cleanup();
  }

  void _onEnded(Map<String, dynamic> data) {
    if (phase == CallPhase.idle) return;
    // callId is still null when the server refused/ended the invite before ringing.
    if (callId != null && data['callId'] != callId) return;
    final reason = data['reason'];
    final status = data['status'];
    if (reason == 'busy') {
      _toast('User is busy');
    } else if (reason == 'unavailable') {
      _toast('User is not available');
    } else if (status == 'MISSED' && isCaller) {
      _toast('No answer');
    }
    _cleanup();
  }

  Future<void> _onOffer(Map<String, dynamic> data) async {
    if (data['callId'] != callId || _pc == null) return;
    try {
      final sdp = Map<String, dynamic>.from(data['sdp']);
      await _pc!.setRemoteDescription(RTCSessionDescription(sdp['sdp'], sdp['type']));
      _remoteDescriptionSet = true;
      await _flushCandidates();
      final answer = await _pc!.createAnswer();
      await _pc!.setLocalDescription(answer);
      _socket?.emit('call:answer', {
        'callId': callId,
        'sdp': {'sdp': answer.sdp, 'type': answer.type},
      });
    } catch (_) {
      _toast('Call failed');
      hangUp();
    }
  }

  Future<void> _onAnswer(Map<String, dynamic> data) async {
    if (data['callId'] != callId || _pc == null) return;
    try {
      final sdp = Map<String, dynamic>.from(data['sdp']);
      await _pc!.setRemoteDescription(RTCSessionDescription(sdp['sdp'], sdp['type']));
      _remoteDescriptionSet = true;
      await _flushCandidates();
    } catch (_) {
      _toast('Call failed');
      hangUp();
    }
  }

  Future<void> _onIce(Map<String, dynamic> data) async {
    if (data['callId'] != callId) return;
    final c = Map<String, dynamic>.from(data['candidate']);
    final candidate = RTCIceCandidate(c['candidate'], c['sdpMid'], c['sdpMLineIndex']);
    if (_pc == null || !_remoteDescriptionSet) {
      _pendingCandidates.add(candidate);
    } else {
      await _pc!.addCandidate(candidate);
    }
  }

  void _onError(Map<String, dynamic> data) {
    _toast((data['message'] ?? 'Call failed').toString());
    // The invite itself was refused (blocked, already in a call, ...).
    if (phase == CallPhase.outgoing && callId == null) _cleanup();
  }

  // ------------------------------------------------------------------ WebRTC

  Future<void> _initRenderers() async {
    if (_renderersReady) return;
    await localRenderer.initialize();
    await remoteRenderer.initialize();
    _renderersReady = true;
  }

  Future<List<Map<String, dynamic>>> _loadIceServers() async {
    try {
      final data = await ApiClient.get('/calls/ice-servers');
      return (data['iceServers'] as List).map((e) => Map<String, dynamic>.from(e)).toList();
    } catch (_) {
      return [
        {'urls': ['stun:stun.l.google.com:19302']},
      ];
    }
  }

  Future<void> _setupPeer() async {
    await _initRenderers();
    final servers = await _loadIceServers();
    final pc = await createPeerConnection({
      'iceServers': servers,
      'sdpSemantics': 'unified-plan',
    });
    _pc = pc;

    pc.onIceCandidate = (RTCIceCandidate c) {
      if (c.candidate == null) return;
      _socket?.emit('call:ice', {
        'callId': callId,
        'candidate': {'candidate': c.candidate, 'sdpMid': c.sdpMid, 'sdpMLineIndex': c.sdpMLineIndex},
      });
    };

    pc.onTrack = (RTCTrackEvent e) {
      if (e.streams.isNotEmpty) {
        remoteRenderer.srcObject = e.streams.first;
        notifyListeners();
      }
    };

    pc.onConnectionState = (RTCPeerConnectionState state) {
      if (state == RTCPeerConnectionState.RTCPeerConnectionStateConnected) {
        _onMediaConnected();
      } else if (state == RTCPeerConnectionState.RTCPeerConnectionStateFailed) {
        _toast('Connection lost');
        hangUp();
      }
    };

    final stream = await navigator.mediaDevices.getUserMedia({
      'audio': true,
      'video': isVideo ? {'facingMode': 'user'} : false,
    });
    _localStream = stream;
    for (final track in stream.getTracks()) {
      await pc.addTrack(track, stream);
    }
    localRenderer.srcObject = stream;
    notifyListeners();
  }

  Future<void> _flushCandidates() async {
    final pending = List<RTCIceCandidate>.from(_pendingCandidates);
    _pendingCandidates.clear();
    for (final c in pending) {
      await _pc?.addCandidate(c);
    }
  }

  void _onMediaConnected() {
    if (phase == CallPhase.connected) return;
    phase = CallPhase.connected;
    seconds = 0;
    speakerOn = isVideo;
    Helper.setSpeakerphoneOn(speakerOn);
    _ticker?.cancel();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      seconds++;
      notifyListeners();
    });
    notifyListeners();
  }

  // ---------------------------------------------------------------- plumbing

  void _startRinging() {
    _ringTimer?.cancel();
    _ringTimer = Timer.periodic(const Duration(seconds: 2), (_) {
      HapticFeedback.heavyImpact();
      SystemSound.play(SystemSoundType.alert);
    });
  }

  void _stopRinging() {
    _ringTimer?.cancel();
    _ringTimer = null;
  }

  void _openScreen() {
    if (_screenOpen) return;
    _screenOpen = true;
    appNavigatorKey.currentState
        ?.push(MaterialPageRoute<void>(builder: (_) => const CallScreen()))
        .then((_) => _screenOpen = false);
  }

  void _toast(String message) {
    final ctx = appNavigatorKey.currentContext;
    if (ctx == null) return;
    ScaffoldMessenger.maybeOf(ctx)?.showSnackBar(SnackBar(content: Text(message)));
  }

  void _cleanup() {
    _ticker?.cancel();
    _ticker = null;
    _stopRinging();
    for (final t in _localStream?.getTracks() ?? <MediaStreamTrack>[]) {
      t.stop();
    }
    _localStream?.dispose();
    _localStream = null;
    _pc?.close();
    _pc = null;
    if (_renderersReady) {
      localRenderer.srcObject = null;
      remoteRenderer.srcObject = null;
    }
    _pendingCandidates.clear();
    _remoteDescriptionSet = false;
    Helper.setSpeakerphoneOn(false);
    callId = null;
    peerName = '';
    isVideo = false;
    isCaller = false;
    muted = false;
    speakerOn = false;
    cameraOff = false;
    seconds = 0;
    phase = CallPhase.idle;
    notifyListeners();
  }
}
