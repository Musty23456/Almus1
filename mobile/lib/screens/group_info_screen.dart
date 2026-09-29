import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../config/theme.dart';
import '../models/user.dart';
import '../services/api_client.dart';

class GroupInfoScreen extends StatefulWidget {
  final String groupId;
  const GroupInfoScreen({super.key, required this.groupId});

  @override
  State<GroupInfoScreen> createState() => _GroupInfoScreenState();
}

class _GroupInfoScreenState extends State<GroupInfoScreen> {
  Map<String, dynamic>? _group;
  String? _myId;
  bool _loading = true;

  Future<void> _load() async {
    try {
      final me = await ApiClient.get('/users/me');
      final data = await ApiClient.get('/groups/${widget.groupId}');
      if (!mounted) return;
      setState(() {
        _myId = me['user']['id']?.toString();
        _group = Map<String, dynamic>.from(data['group']);
      });
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not load group information')));
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<Map<String, dynamic>> get _members =>
      ((_group?['members'] as List?) ?? []).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();

  bool get _isAdmin => _members.any((m) => m['userId'] == _myId && m['role'] == 'ADMIN');

  Future<void> _editGroup() async {
    final name = TextEditingController(text: _group?['name'] ?? '');
    final desc = TextEditingController(text: _group?['description'] ?? '');
    bool onlyAdminsSend = _group?['onlyAdminsSend'] == true;
    bool onlyAdminsEditInfo = _group?['onlyAdminsEditInfo'] == true;

    await showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (_, setDialog) => AlertDialog(
          title: const Text('Group settings'),
          content: SingleChildScrollView(
            child: Column(
              children: [
                TextField(controller: name, decoration: const InputDecoration(labelText: 'Name')),
                TextField(controller: desc, decoration: const InputDecoration(labelText: 'Description')),
                SwitchListTile(
                  title: const Text('Only admins can send'),
                  value: onlyAdminsSend,
                  onChanged: (v) => setDialog(() => onlyAdminsSend = v),
                ),
                SwitchListTile(
                  title: const Text('Only owner can edit group info'),
                  value: onlyAdminsEditInfo,
                  onChanged: (v) => setDialog(() => onlyAdminsEditInfo = v),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
            FilledButton(
              onPressed: () async {
                try {
                  await ApiClient.patch('/groups/${widget.groupId}', body: {
                    'name': name.text.trim(),
                    'description': desc.text.trim(),
                    'onlyAdminsSend': onlyAdminsSend,
                    'onlyAdminsEditInfo': onlyAdminsEditInfo,
                  });
                  if (ctx.mounted) Navigator.pop(ctx);
                  await _load();
                } catch (_) {
                  if (ctx.mounted) Navigator.pop(ctx);
                }
              },
              child: const Text('Save'),
            ),
          ],
        ),
      ),
    );
    name.dispose();
    desc.dispose();
  }

  Future<void> _addMembers() async {
    final search = TextEditingController();
    final Set<String> selected = {};
    List<Map<String, dynamic>> results = [];
    final existing = _members.map((m) => m['userId'].toString()).toSet();

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (_, setDialog) => AlertDialog(
          title: const Text('Add members'),
          content: SizedBox(
            width: double.maxFinite,
            height: 340,
            child: Column(
              children: [
                TextField(
                  controller: search,
                  decoration: const InputDecoration(labelText: 'Search name or username'),
                  onChanged: (q) async {
                    if (q.trim().length < 2) {
                      setDialog(() => results = []);
                      return;
                    }
                    try {
                      final data = await ApiClient.get('/users/search?q=${Uri.encodeComponent(q.trim())}');
                      final list = (data['users'] as List)
                          .whereType<Map>()
                          .map((e) => Map<String, dynamic>.from(e))
                          .where((u) => !existing.contains(u['id'].toString()))
                          .toList();
                      setDialog(() => results = list);
                    } catch (_) {
                      setDialog(() => results = []);
                    }
                  },
                ),
                Expanded(
                  child: ListView(
                    children: results.map((u) {
                      final id = u['id'].toString();
                      return CheckboxListTile(
                        value: selected.contains(id),
                        title: Text(u['fullName']?.toString() ?? 'User'),
                        subtitle: Text('@${u['username'] ?? ''}'),
                        onChanged: (v) => setDialog(() {
                          if (v == true) {
                            selected.add(id);
                          } else {
                            selected.remove(id);
                          }
                        }),
                      );
                    }).toList(),
                  ),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
            FilledButton(
              onPressed: selected.isEmpty ? null : () => Navigator.pop(ctx, true),
              child: Text('Add (${selected.length})'),
            ),
          ],
        ),
      ),
    );
    search.dispose();

    if (ok == true && selected.isNotEmpty) {
      try {
        await ApiClient.post('/groups/${widget.groupId}/members', body: {'memberIds': selected.toList()});
        await _load();
      } on ApiException catch (e) {
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      } catch (_) {
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not add members')));
      }
    }
  }

  Future<void> _changeRole(String userId, String role) async {
    try {
      await ApiClient.patch('/groups/${widget.groupId}/members/$userId/role', body: {'role': role});
      await _load();
    } catch (_) {}
  }

  Future<void> _remove(String userId) async {
    try {
      await ApiClient.delete('/groups/${widget.groupId}/members/$userId');
      await _load();
    } catch (_) {}
  }

  Future<void> _showInvite({bool regenerate = false}) async {
    try {
      String? code = _group?['inviteCode']?.toString();
      if (regenerate || code == null || code.isEmpty) {
        final data = await ApiClient.post('/groups/${widget.groupId}/invite/regenerate');
        code = data['inviteCode']?.toString();
        await _load();
      }
      if (code == null || !mounted) return;
      final link = 'almuschat://group/$code';
      await showDialog(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Group invite link'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SelectableText(link),
              const SizedBox(height: 8),
              Text('Code: $code', style: const TextStyle(fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              const Text('Share the code. Others can use "Join with invite code" in the app.'),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () async {
                await Clipboard.setData(ClipboardData(text: code!));
                if (ctx.mounted) {
                  ScaffoldMessenger.of(ctx).showSnackBar(const SnackBar(content: Text('Code copied')));
                }
              },
              child: const Text('Copy code'),
            ),
            if (_isAdmin)
              TextButton(
                onPressed: () async {
                  Navigator.pop(ctx);
                  await _showInvite(regenerate: true);
                },
                child: const Text('New code'),
              ),
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Close')),
          ],
        ),
      );
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not get invite link')));
      }
    }
  }

  Future<void> _leave() async {
    try {
      await ApiClient.post('/groups/${widget.groupId}/leave');
      if (mounted) Navigator.pop(context, true);
    } catch (_) {}
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    final g = _group;
    if (g == null) return const Scaffold(body: Center(child: Text('Group not found')));

    return Scaffold(
      appBar: AppBar(title: const Text('Group info')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          CircleAvatar(
            radius: 42,
            backgroundColor: AlmusColors.primary.withOpacity(.15),
            child: Text((g['name'] ?? 'G').toString()[0].toUpperCase(), style: const TextStyle(fontSize: 30)),
          ),
          const SizedBox(height: 12),
          Center(child: Text(g['name'], style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold))),
          if ((g['description'] ?? '').toString().isNotEmpty)
            Center(child: Text(g['description'])),
          const SizedBox(height: 18),
          if (_isAdmin) ...[
            ListTile(leading: const Icon(Icons.person_add), title: const Text('Add members'), onTap: _addMembers),
            ListTile(leading: const Icon(Icons.settings), title: const Text('Edit group settings'), onTap: _editGroup),
            ListTile(leading: const Icon(Icons.link), title: const Text('Invite link'), onTap: _showInvite),
          ],
          const Divider(),
          Text('${_members.length} members', style: const TextStyle(fontWeight: FontWeight.bold)),
          ..._members.map((m) {
            final u = Map<String, dynamic>.from(m['user'] ?? {});
            final isOwner = m['userId'] == g['ownerId'];
            final isMe = m['userId'] == _myId;
            return ListTile(
              leading: CircleAvatar(child: Text((u['fullName'] ?? '?').toString()[0].toUpperCase())),
              title: Text(u['fullName'] ?? 'User'),
              subtitle: Text('@${u['username'] ?? ''}${isOwner ? ' • Owner' : ''}'),
              trailing: _isAdmin && !isOwner && !isMe
                  ? PopupMenuButton<String>(
                      onSelected: (v) => v == 'remove'
                          ? _remove(m['userId'])
                          : _changeRole(m['userId'], v),
                      itemBuilder: (_) => const [
                        PopupMenuItem(value: 'ADMIN', child: Text('Promote to admin')),
                        PopupMenuItem(value: 'MEMBER', child: Text('Demote to member')),
                        PopupMenuItem(value: 'remove', child: Text('Remove member')),
                      ],
                    )
                  : (m['role'] == 'ADMIN' ? const Chip(label: Text('Admin')) : null),
            );
          }),
          const SizedBox(height: 16),
          OutlinedButton.icon(
            onPressed: _leave,
            icon: const Icon(Icons.exit_to_app),
            label: const Text('Leave group'),
          ),
        ],
      ),
    );
  }
}
