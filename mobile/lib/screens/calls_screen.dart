import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../config/theme.dart';
import '../services/api_client.dart';
import '../services/call_service.dart';

/// Call history tab.
class CallsScreen extends StatefulWidget {
  const CallsScreen({super.key});

  @override
  State<CallsScreen> createState() => _CallsScreenState();
}

class _CallsScreenState extends State<CallsScreen> {
  List<Map<String, dynamic>> _calls = [];
  String? _myId;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final me = await ApiClient.get('/users/me');
      final data = await ApiClient.get('/calls');
      if (!mounted) return;
      setState(() {
        _myId = me['user']['id']?.toString();
        _calls = (data['calls'] as List).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'No internet connection');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Map<String, dynamic> _other(Map<String, dynamic> call) {
    final iAmCaller = call['callerId'] == _myId;
    return Map<String, dynamic>.from((iAmCaller ? call['callee'] : call['caller']) ?? {});
  }

  String _summary(Map<String, dynamic> call) {
    final video = call['type'] == 'VIDEO' ? 'Video' : 'Voice';
    switch (call['status']) {
      case 'MISSED':
        return '$video • Missed';
      case 'REJECTED':
        return '$video • Declined';
      case 'CANCELED':
        return '$video • Canceled';
      case 'ENDED':
        final secs = (call['durationSec'] ?? 0) as int;
        final m = (secs ~/ 60).toString().padLeft(2, '0');
        final s = (secs % 60).toString().padLeft(2, '0');
        return '$video • $m:$s';
      default:
        return video;
    }
  }

  Widget _directionIcon(Map<String, dynamic> call) {
    final incoming = call['calleeId'] == _myId;
    final missed = incoming && (call['status'] == 'MISSED' || call['status'] == 'CANCELED');
    if (missed) return const Icon(Icons.call_missed, color: AlmusColors.danger, size: 18);
    return Icon(incoming ? Icons.call_received : Icons.call_made, color: Colors.grey, size: 18);
  }

  Future<void> _callBack(Map<String, dynamic> call, bool video) async {
    final other = _other(call);
    final id = other['id']?.toString();
    if (id == null) return;
    final ok = await CallService.instance.startCall(
      peerId: id,
      peerName: (other['fullName'] ?? other['username'] ?? 'Unknown').toString(),
      video: video,
    );
    if (ok) return;
    // startCall already showed the reason; reload in case the list changed.
    if (mounted) await _load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Calls')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(_error!, style: const TextStyle(color: AlmusColors.danger)),
                      const SizedBox(height: 8),
                      TextButton(onPressed: _load, child: const Text('Retry')),
                    ],
                  ),
                )
              : _calls.isEmpty
                  ? const Center(child: Text('No calls yet.'))
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView.separated(
                        itemCount: _calls.length,
                        separatorBuilder: (_, __) => const Divider(height: 1),
                        itemBuilder: (context, i) {
                          final call = _calls[i];
                          final other = _other(call);
                          final name = (other['fullName'] ?? other['username'] ?? 'Unknown').toString();
                          final started = DateTime.tryParse(call['startedAt']?.toString() ?? '')?.toLocal();
                          final video = call['type'] == 'VIDEO';
                          return ListTile(
                            leading: CircleAvatar(
                              backgroundColor: AlmusColors.primary.withOpacity(0.15),
                              child: Text(name.isNotEmpty ? name[0].toUpperCase() : '?'),
                            ),
                            title: Text(name, style: const TextStyle(fontWeight: FontWeight.w600)),
                            subtitle: Row(
                              children: [
                                _directionIcon(call),
                                const SizedBox(width: 4),
                                Flexible(
                                  child: Text(
                                    '${_summary(call)}${started != null ? '  ·  ${DateFormat.MMMd().add_Hm().format(started)}' : ''}',
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                              ],
                            ),
                            trailing: IconButton(
                              icon: Icon(video ? Icons.videocam : Icons.call, color: AlmusColors.primary),
                              onPressed: () => _callBack(call, video),
                            ),
                          );
                        },
                      ),
                    ),
    );
  }
}
