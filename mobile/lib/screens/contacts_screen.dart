import 'package:flutter/material.dart';
import '../config/theme.dart';
import '../models/user.dart';
import '../services/api_client.dart';
import 'chat_screen.dart';

class ContactsScreen extends StatefulWidget {
  const ContactsScreen({super.key});

  @override
  State<ContactsScreen> createState() => _ContactsScreenState();
}

class _ContactsScreenState extends State<ContactsScreen> {
  final _searchController = TextEditingController();
  List<AlmusUser> _results = [];
  bool _loading = false;
  String? _error;

  Future<void> _search(String query) async {
    if (query.trim().length < 2) {
      setState(() => _results = []);
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await ApiClient.get('/users/search?q=${Uri.encodeComponent(query.trim())}');
      setState(() => _results = (data['users'] as List).map((u) => AlmusUser.fromJson(u)).toList());
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = 'No internet connection');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _startChat(AlmusUser user) async {
    try {
      final data = await ApiClient.post('/conversations', body: {'userId': user.id});
      if (!mounted) return;
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => ChatScreen(conversationId: data['conversation']['id'], title: user.fullName),
        ),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Contacts')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: TextField(
              controller: _searchController,
              onChanged: _search,
              decoration: const InputDecoration(
                hintText: 'Search by username, name, or phone',
                prefixIcon: Icon(Icons.search),
              ),
            ),
          ),
          if (_loading) const LinearProgressIndicator(),
          if (_error != null) Padding(padding: const EdgeInsets.all(8), child: Text(_error!, style: const TextStyle(color: AlmusColors.danger))),
          Expanded(
            child: ListView.builder(
              itemCount: _results.length,
              itemBuilder: (context, index) {
                final u = _results[index];
                return ListTile(
                  leading: CircleAvatar(
                    backgroundImage: u.avatarUrl != null ? NetworkImage(u.avatarUrl!) : null,
                    child: u.avatarUrl == null ? Text(u.fullName.isNotEmpty ? u.fullName[0].toUpperCase() : '?') : null,
                  ),
                  title: Text(u.fullName),
                  subtitle: Text('@${u.username}'),
                  onTap: () => _startChat(u),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
