import 'package:flutter/material.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import '../services/call_service.dart';

/// One screen for every stage of a call: outgoing ringing, incoming ringing
/// (Accept / Decline), connecting and the in-call controls.
class CallScreen extends StatefulWidget {
  const CallScreen({super.key});

  @override
  State<CallScreen> createState() => _CallScreenState();
}

class _CallScreenState extends State<CallScreen> {
  final CallService _call = CallService.instance;
  bool _closing = false;

  String _status() {
    switch (_call.phase) {
      case CallPhase.outgoing:
        return 'Calling…';
      case CallPhase.incoming:
        return _call.isVideo ? 'Incoming video call' : 'Incoming voice call';
      case CallPhase.connecting:
        return 'Connecting…';
      case CallPhase.connected:
        final m = (_call.seconds ~/ 60).toString().padLeft(2, '0');
        final s = (_call.seconds % 60).toString().padLeft(2, '0');
        return '$m:$s';
      case CallPhase.idle:
        return '';
    }
  }

  Widget _roundButton({
    required IconData icon,
    required VoidCallback onTap,
    Color color = Colors.white24,
    Color iconColor = Colors.white,
    double size = 58,
  }) {
    return InkResponse(
      onTap: onTap,
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        child: Icon(icon, color: iconColor, size: size * 0.46),
      ),
    );
  }

  Widget _controls() {
    if (_call.phase == CallPhase.incoming) {
      return Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: [
          _roundButton(icon: Icons.call_end, color: Colors.red, size: 72, onTap: _call.reject),
          _roundButton(
            icon: _call.isVideo ? Icons.videocam : Icons.call,
            color: Colors.green,
            size: 72,
            onTap: _call.accept,
          ),
        ],
      );
    }
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
      children: [
        _roundButton(
          icon: _call.muted ? Icons.mic_off : Icons.mic,
          color: _call.muted ? Colors.white : Colors.white24,
          iconColor: _call.muted ? Colors.black : Colors.white,
          onTap: _call.toggleMute,
        ),
        _roundButton(
          icon: _call.speakerOn ? Icons.volume_up : Icons.volume_down,
          color: _call.speakerOn ? Colors.white : Colors.white24,
          iconColor: _call.speakerOn ? Colors.black : Colors.white,
          onTap: _call.toggleSpeaker,
        ),
        if (_call.isVideo)
          _roundButton(
            icon: _call.cameraOff ? Icons.videocam_off : Icons.videocam,
            color: _call.cameraOff ? Colors.white : Colors.white24,
            iconColor: _call.cameraOff ? Colors.black : Colors.white,
            onTap: _call.toggleCamera,
          ),
        if (_call.isVideo)
          _roundButton(icon: Icons.cameraswitch, onTap: _call.switchCamera),
        _roundButton(icon: Icons.call_end, color: Colors.red, onTap: _call.hangUp),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      child: ListenableBuilder(
        listenable: _call,
        builder: (context, _) {
          if (_call.phase == CallPhase.idle) {
            if (!_closing) {
              _closing = true;
              WidgetsBinding.instance.addPostFrameCallback((_) {
                if (mounted) Navigator.of(context).pop();
              });
            }
            return const Scaffold(backgroundColor: Color(0xFF0B1F1F));
          }

          final showRemoteVideo = _call.isVideo &&
              _call.phase == CallPhase.connected &&
              _call.remoteRenderer.srcObject != null;
          final showLocalVideo = _call.isVideo && !_call.cameraOff && _call.localRenderer.srcObject != null;

          return Scaffold(
            backgroundColor: const Color(0xFF0B1F1F),
            body: SafeArea(
              child: Stack(
                children: [
                  if (showRemoteVideo)
                    Positioned.fill(
                      child: RTCVideoView(
                        _call.remoteRenderer,
                        objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover,
                      ),
                    ),
                  Column(
                    children: [
                      const SizedBox(height: 48),
                      if (!showRemoteVideo)
                        CircleAvatar(
                          radius: 56,
                          backgroundColor: Colors.white12,
                          child: Text(
                            _call.peerName.isNotEmpty ? _call.peerName[0].toUpperCase() : '?',
                            style: const TextStyle(fontSize: 44, color: Colors.white),
                          ),
                        ),
                      const SizedBox(height: 16),
                      Text(
                        _call.peerName,
                        style: const TextStyle(fontSize: 26, color: Colors.white, fontWeight: FontWeight.w600),
                      ),
                      const SizedBox(height: 8),
                      Text(_status(), style: const TextStyle(fontSize: 16, color: Colors.white70)),
                      const Spacer(),
                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 36),
                        child: _controls(),
                      ),
                    ],
                  ),
                  if (showLocalVideo)
                    Positioned(
                      top: 12,
                      right: 12,
                      width: 104,
                      height: 148,
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(12),
                        child: RTCVideoView(
                          _call.localRenderer,
                          mirror: true,
                          objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover,
                        ),
                      ),
                    ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}
