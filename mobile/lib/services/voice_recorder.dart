import 'dart:async';
import 'dart:io';
import 'dart:math' as math;
import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';

/// A finished voice recording, ready to upload.
class RecordedVoice {
  final String path;
  final Duration duration;

  /// ~40 loudness bars (0-100) sampled while recording; drawn as the waveform.
  final List<int> waveform;

  RecordedVoice({required this.path, required this.duration, required this.waveform});
}

/// Hold-to-record helper: start / stop / cancel plus live level + timer for the UI.
class VoiceRecorder {
  final AudioRecorder _rec = AudioRecorder();
  final List<double> _all = [];
  StreamSubscription<Amplitude>? _ampSub;
  Timer? _timer;
  String? _path;
  DateTime? _startedAt;
  bool _active = false;

  /// Last ~20 loudness values (0..1) for the live bars.
  final ValueNotifier<List<double>> levels = ValueNotifier<List<double>>(const []);

  /// Whole seconds recorded so far.
  final ValueNotifier<int> seconds = ValueNotifier<int>(0);

  bool get isRecording => _active;

  /// Returns false if the microphone permission was refused.
  Future<bool> start() async {
    if (_active) return true;
    if (!await _rec.hasPermission()) return false;

    final dir = await getTemporaryDirectory();
    _path = '${dir.path}/voice_${DateTime.now().millisecondsSinceEpoch}.m4a';
    _all.clear();
    levels.value = const [];
    seconds.value = 0;

    await _rec.start(
      const RecordConfig(encoder: AudioEncoder.aacLc, bitRate: 64000, sampleRate: 44100, numChannels: 1),
      path: _path!,
    );
    _active = true;
    _startedAt = DateTime.now();

    _ampSub = _rec.onAmplitudeChanged(const Duration(milliseconds: 100)).listen((a) {
      // a.current is in dB (about -160..0). Map roughly -50..0 dB to 0..1.
      final v = ((a.current + 50) / 50).clamp(0.0, 1.0).toDouble();
      _all.add(v);
      levels.value = _all.sublist(math.max(0, _all.length - 20));
    });
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      seconds.value = DateTime.now().difference(_startedAt!).inSeconds;
    });
    return true;
  }

  /// Stops and returns the recording, or null if it was too short (< 1 s) to send.
  Future<RecordedVoice?> stop() async {
    if (!_active) return null;
    final started = _startedAt!;
    await _teardown();
    final path = await _rec.stop();
    _active = false;
    final elapsed = DateTime.now().difference(started);
    if (path == null || elapsed.inMilliseconds < 1000) {
      if (path != null) await _delete(path);
      return null;
    }
    return RecordedVoice(path: path, duration: elapsed, waveform: _resample(_all, 40));
  }

  /// Throws the recording away ("slide to cancel" / delete before sending).
  Future<void> cancel() async {
    if (!_active) return;
    await _teardown();
    _active = false;
    try {
      await _rec.cancel();
    } catch (_) {}
    if (_path != null) await _delete(_path!);
  }

  Future<void> dispose() async {
    await cancel();
    await _rec.dispose();
    levels.dispose();
    seconds.dispose();
  }

  Future<void> _teardown() async {
    _timer?.cancel();
    _timer = null;
    await _ampSub?.cancel();
    _ampSub = null;
  }

  Future<void> _delete(String path) async {
    try {
      final f = File(path);
      if (await f.exists()) await f.delete();
    } catch (_) {}
  }

  static List<int> _resample(List<double> src, int n) {
    if (src.isEmpty) return List<int>.filled(n, 8);
    return List<int>.generate(n, (i) {
      final start = (i * src.length / n).floor();
      final end = math.max(start + 1, ((i + 1) * src.length / n).floor());
      var peak = 0.0;
      for (var j = start; j < end && j < src.length; j++) {
        peak = math.max(peak, src[j]);
      }
      return (peak * 100).round().clamp(6, 100);
    });
  }
}
