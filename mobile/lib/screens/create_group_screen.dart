import 'package:flutter/material.dart';
import '../models/user.dart';
import '../services/api_client.dart';
import 'chat_screen.dart';

class CreateGroupScreen extends StatefulWidget {
  const CreateGroupScreen({super.key});

  @override
  State<CreateGroupScreen> createState() => _CreateGroupScreenState();
}

class _CreateGroupScreenState extends State<CreateGroupScreen> {
  final _name = TextEditingController();
  final _description = TextEditingController();
  final _search = TextEditingController();
  final Set<String> _selected = {};
  List<AlmusUser> _results = [];
  bool _loading = false;
  bool _creating = false;

  Future<void> _findUsers(String q) async {
    if (q.trim().length < 2) {
      setState(() => _results = []);
      return;
    }
    setState(() => _loading = true);
    try {
      final data = await ApiClient.get('/users/search?q=${Uri.encodeComponent(q.trim())}');
      if (!mounted) return;
      setState(() {
        _results = (data['users'] as List)
            .map((u) => AlmusUser.fromJson(u))
            .toList();
      });
    } catch (_) {
      if (mounted) setState(() => _results = []);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _create() async {
    if (_name.text.trim().isEmpty || _selected.isEmpty || _creating) return;
    setState(() => _creating = true);
    try {
      final data = await ApiClient.post('/groups', body: {
        'name': _name.text.trim(),
        'description': _description.text.trim().isEmpty ? null : _description.text.trim(),
        'memberIds': _selected.toList(),
      });
      if (!mounted) return;
      final conversation = data['conversation'];
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) => ChatScreen(
            conversationId: conversation['id'],
            title: _name.text.trim(),
          ),
        ),
      );
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not create group')));
    } finally {
      if (mounted) setState(() => _creating = false);
    }
  }

  @override
  void dispose() {
    _name.dispose();
    _description.dispose();
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('New group')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              children: [
                TextField(controller: _name, decoration: const InputDecoration(labelText: 'Group name')),
                const SizedBox(height: 8),
                TextField(controller: _description, decoration: const InputDecoration(labelText: 'Description')),
                const SizedBox(height: 8),
                TextField(
                  controller: _search,
                  onChanged: _findUsers,
                  decoration: const InputDecoration(
                    labelText: 'Add members',
                    prefixIcon: Icon(Icons.search),
                  ),
                ),
              ],
            ),
          ),
          if (_loading) const LinearProgressIndicator(),
          if (_selected.isNotEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text('${_selected.length} member(s) selected'),
              ),
            ),
          Expanded(
            child: ListView.builder(
              itemCount: _results.length,
              itemBuilder: (_, i) {
                final user = _results[i];
                final selected = _selected.contains(user.id);
                return ListTile(
                  leading: CircleAvatar(
                    backgroundImage: user.avatarUrl != null ? NetworkImage(user.avatarUrl!) : null,
                    child: user.avatarUrl == null ? Text(user.fullName[0].toUpperCase()) : null,
                  ),
                  title: Text(user.fullName),
                  subtitle: Text('@${user.username}'),
                  trailing: Checkbox(
                    value: selected,
                    onChanged: (_) => setState(() {
                      if (selected) {
                        _selected.remove(user.id);
                      } else {
                        _selected.add(user.id);
                      }
                    }),
                  ),
                );
              },
            ),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  onPressed: _name.text.trim().isEmpty || _selected.isEmpty || _creating ? null : _create,
                  icon: const Icon(Icons.group_add),
                  label: Text(_creating ? 'Creating…' : 'Create group'),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
