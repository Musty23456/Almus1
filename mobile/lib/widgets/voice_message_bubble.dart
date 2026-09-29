import 'dart:async';
import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/material.dart';
import '../config/theme.dart';

/// Play/pause, seekable waveform, elapsed time and playback speed (1x / 1.5x / 2x)
/// for voice messages and audio files. Only one message plays at a time.
class VoiceMessageBubble extends StatefulWidget {
  final String url;
  final List<int>? waveform;
  final String? label;

  const VoiceMessageBubble({super.key, required this.url, this.waveform, this.label});

  @override
  State<VoiceMessageBubble> createState() => _VoiceMessageBubbleState();
}

class _VoiceMessageBubbleState extends State<VoiceMessageBubble> {
  static _VoiceMessageBubbleState? _active;
  static const _speeds = [1.0, 1.5, 2.0];

  final AudioPlayer _player = AudioPlayer();
  final List<StreamSubscription> _subs = [];
  PlayerState _state = PlayerState.stopped;
  Duration _pos = Duration.zero;
  Duration _dur = Duration.zero;
  int _speedIndex = 0;

  @override
  void initState() {
    super.initState();
    _subs.add(_player.onPlayerStateChanged.listen((s) {
      if (mounted) setState(() => _state = s);
    }));
    _subs.add(_player.onPositionChanged.listen((p) {
      if (mounted) setState(() => _pos = p);
    }));
    _subs.add(_player.onDurationChanged.listen((d) {
      if (mounted) setState(() => _dur = d);
    }));
    _subs.add(_player.onPlayerComplete.listen((_) {
      if (mounted) setState(() => _pos = Duration.zero);
    }));
  }

  bool get _playing => _state == PlayerState.playing;

  Future<void> _toggle() async {
    try {
      if (_playing) {
        await _player.pause();
        return;
      }
      if (_active != null && _active != this) await _active!._player.pause();
      _active = this;
      if (_state == PlayerState.paused) {
        await _player.resume();
      } else {
        await _player.play(UrlSource(widget.url));
      }
      await _player.setPlaybackRate(_speeds[_speedIndex]);
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not play this audio')));
    }
  }

  Future<void> _cycleSpeed() async {
    setState(() => _speedIndex = (_speedIndex + 1) % _speeds.length);
    try {
      await _player.setPlaybackRate(_speeds[_speedIndex]);
    } catch (_) {}
  }

  void _seek(double fraction) {
    if (_dur.inMilliseconds <= 0) return;
    _player.seek(Duration(milliseconds: (_dur.inMilliseconds * fraction.clamp(0.0, 1.0)).round()));
  }

  String _fmt(Duration d) {
    final m = d.inMinutes;
    final s = d.inSeconds % 60;
    return '$m:${s.toString().padLeft(2, '0')}';
  }

  @override
  void dispose() {
    for (final s in _subs) {
      s.cancel();
    }
    if (_active == this) _active = null;
    _player.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final bars = (widget.waveform != null && widget.waveform!.isNotEmpty)
        ? widget.waveform!.map((v) => (v / 100).clamp(0.05, 1.0).toDouble()).toList()
        : List<double>.filled(32, 0.35);
    final progress = _dur.inMilliseconds > 0 ? _pos.inMilliseconds / _dur.inMilliseconds : 0.0;
    final showPos = _playing || _pos > Duration.zero;

    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          GestureDetector(
            onTap: _toggle,
            child: CircleAvatar(
              radius: 18,
              backgroundColor: AlmusColors.primary,
              child: Icon(_playing ? Icons.pause : Icons.play_arrow, color: Colors.white, size: 22),
            ),
          ),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              LayoutBuilder(builder: (context, _) {
                return GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTapDown: (d) => _seek(d.localPosition.dx / 130),
                  child: SizedBox(
                    width: 130,
                    height: 30,
                    child: CustomPaint(painter: _WavePainter(bars, progress.clamp(0.0, 1.0).toDouble())),
                  ),
                );
              }),
              Text(
                widget.label != null && !showPos ? widget.label! : _fmt(showPos ? _pos : _dur),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 11, color: Colors.grey),
              ),
            ],
          ),
          const SizedBox(width: 8),
          GestureDetector(
            onTap: _cycleSpeed,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
              decoration: BoxDecoration(
                color: Colors.black.withOpacity(0.08),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                _speeds[_speedIndex] == 1.0 ? '1x' : '${_speeds[_speedIndex]}x',
                style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _WavePainter extends CustomPainter {
  final List<double> bars;
  final double progress;

  _WavePainter(this.bars, this.progress);

  @override
  void paint(Canvas canvas, Size size) {
    final n = bars.length;
    final step = size.width / n;
    final cy = size.height / 2;
    final played = Paint()
      ..color = AlmusColors.primary
      ..strokeWidth = 3
      ..strokeCap = StrokeCap.round;
    final idle = Paint()
      ..color = Colors.grey.shade400
      ..strokeWidth = 3
      ..strokeCap = StrokeCap.round;
    for (var i = 0; i < n; i++) {
      final h = (bars[i] * size.height).clamp(4.0, size.height).toDouble();
      final x = i * step + step / 2;
      canvas.drawLine(Offset(x, cy - h / 2), Offset(x, cy + h / 2), (i / n) < progress ? played : idle);
    }
  }

  @override
  bool shouldRepaint(_WavePainter old) => old.progress != progress || old.bars != bars;
}
