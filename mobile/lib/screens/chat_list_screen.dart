import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../config/theme.dart';
import '../models/chat.dart';
import '../services/api_client.dart';
import '../services/auth_service.dart';
import '../services/socket_service.dart';
import '../services/token_storage.dart';
import 'chat_screen.dart';
import 'contacts_screen.dart';
import 'settings_screen.dart';

class ChatListScreen extends StatefulWidget {
  const ChatListScreen({super.key});

  @override
  State<ChatListScreen> createState() => _ChatListScreenState();
}

class _ChatListScreenState extends State<ChatListScreen> {
  final SocketService _socket = SocketService();
  List<ConversationSummary> _conversations = [];
  bool _loading = true;
  String? _error;
  int _tabIndex = 0;

  @override
  void initState() {
    super.initState();
    _loadConversations();
    _connectSocket();
  }

  Future<void> _connectSocket() async {
    final auth = context.read<AuthService>();
    if (auth.currentUser == null) return;
    final token = await TokenStorage.getAccessToken();
    if (token == null) return;
    _socket.connect(token);
    // Refresh the chat list whenever a new message arrives anywhere, so
    // previews/ordering stay current without polling.
    _socket.on('message_received', (_) => _loadConversations());
    _socket.on('user_online', (_) => _loadConversations());
    _socket.on('user_offline', (_) => _loadConversations());
  }

  Future<void> _loadConversations() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await ApiClient.get('/conversations');
      setState(() {
        _conversations = (data['conversations'] as List)
            .map((c) => ConversationSummary.fromJson(c))
            .toList();
      });
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = 'No internet connection');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  void dispose() {
    _socket.disconnect();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final pages = [
      _buildChatList(),
      const ContactsScreen(),
      const SettingsScreen(),
    ];

    return Scaffold(
      appBar: _tabIndex == 0 ? AppBar(title: const Text('ALMUS CHAT')) : null,
      body: pages[_tabIndex],
      floatingActionButton: _tabIndex == 0
          ? FloatingActionButton(
              backgroundColor: AlmusColors.accent,
              onPressed: () => setState(() => _tabIndex = 1),
              child: const Icon(Icons.chat, color: Colors.white),
            )
          : null,
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tabIndex,
        onDestinationSelected: (i) => setState(() => _tabIndex = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.chat_bubble_outline), selectedIcon: Icon(Icons.chat_bubble), label: 'Chats'),
          NavigationDestination(icon: Icon(Icons.contacts_outlined), selectedIcon: Icon(Icons.contacts), label: 'Contacts'),
          NavigationDestination(icon: Icon(Icons.settings_outlined), selectedIcon: Icon(Icons.settings), label: 'Settings'),
        ],
      ),
    );
  }

  Widget _buildChatList() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(_error!, style: const TextStyle(color: AlmusColors.danger)),
            const SizedBox(height: 8),
            TextButton(onPressed: _loadConversations, child: const Text('Retry')),
          ],
        ),
      );
    }
    if (_conversations.isEmpty) {
      return const Center(child: Text('No conversations yet. Tap the chat icon to start one.'));
    }
    return RefreshIndicator(
      onRefresh: _loadConversations,
      child: ListView.separated(
        itemCount: _conversations.length,
        separatorBuilder: (_, __) => const Divider(height: 1),
        itemBuilder: (context, index) {
          final c = _conversations[index];
          final lastMsg = c.lastMessage;
          return ListTile(
            leading: CircleAvatar(
              backgroundColor: AlmusColors.primary.withOpacity(0.15),
              backgroundImage: c.avatarUrl != null ? NetworkImage(c.avatarUrl!) : null,
              child: c.avatarUrl == null ? Text(c.title.isNotEmpty ? c.title[0].toUpperCase() : '?') : null,
            ),
            title: Text(c.title, style: const TextStyle(fontWeight: FontWeight.w600)),
            subtitle: Text(
              lastMsg != null ? (lastMsg['content'] ?? '📎 Media') : 'Say hello 👋',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            trailing: Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(DateFormat.Hm().format(c.updatedAt), style: const TextStyle(fontSize: 12, color: Colors.grey)),
                if (c.isPeerOnline) const Padding(
                  padding: EdgeInsets.only(top: 4),
                  child: CircleAvatar(radius: 4, backgroundColor: Colors.green),
                ),
              ],
            ),
            onTap: () {
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => ChatScreen(conversationId: c.id, title: c.title),
                ),
              ).then((_) => _loadConversations());
            },
          );
        },
      ),
    );
  }
}
