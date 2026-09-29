import 'package:flutter/material.dart';
import '../services/api_client.dart';
import 'chat_screen.dart';

class JoinGroupScreen extends StatefulWidget {
  const JoinGroupScreen({super.key});

  @override
  State<JoinGroupScreen> createState() => _JoinGroupScreenState();
}

class _JoinGroupScreenState extends State<JoinGroupScreen> {
  final _code = TextEditingController();
  bool _joining = false;

  String _extractCode(String input) {
    final text = input.trim();
    final idx = text.lastIndexOf('/');
    return idx >= 0 ? text.substring(idx + 1).trim() : text;
  }

  Future<void> _join() async {
    final code = _extractCode(_code.text);
    if (code.isEmpty || _joining) return;
    setState(() => _joining = true);
    try {
      final data = await ApiClient.post('/groups/join/${Uri.encodeComponent(code)}');
      if (!mounted) return;
      final conversationId = data['conversationId'].toString();
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => ChatScreen(conversationId: conversationId, title: 'Group')),
      );
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not join group')));
    } finally {
      if (mounted) setState(() => _joining = false);
    }
  }

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Join with invite code')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            TextField(
              controller: _code,
              decoration: const InputDecoration(
                labelText: 'Invite code or link',
                hintText: 'almuschat://group/...',
              ),
              onSubmitted: (_) => _join(),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: _joining ? null : _join,
                child: _joining
                    ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Text('Join group'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
