import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';
import '../config/api_config.dart';
import '../config/theme.dart';
import '../models/chat.dart';
import '../services/api_client.dart';
import '../services/socket_service.dart';
import '../services/token_storage.dart';

class ChatScreen extends StatefulWidget {
  final String conversationId;
  final String title;

  const ChatScreen({super.key, required this.conversationId, required this.title});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final SocketService _socket = SocketService();
  final TextEditingController _textController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  final ImagePicker _imagePicker = ImagePicker();
  bool _uploading = false;
  List<ChatMessage> _messages = [];
  String? _myUserId;
  bool _loading = true;
  bool _peerTyping = false;

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    try {
      final me = await ApiClient.get('/users/me');
      _myUserId = me['user']['id'];
    } catch (_) {
      // Non-fatal: message alignment falls back to "not mine" until this resolves.
    }
    await _loadMessages();
    await _connectSocket();
  }

  Future<void> _loadMessages() async {
    try {
      final data = await ApiClient.get('/messages/${widget.conversationId}');
      setState(() {
        _messages = (data['messages'] as List).map((m) => ChatMessage.fromJson(m)).toList();
      });
      await ApiClient.post('/conversations/${widget.conversationId}/read');
      _scrollToBottom();
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not load messages. Check your connection.')),
      );
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _connectSocket() async {
    final token = await TokenStorage.getAccessToken();
    if (token == null) return;
    _socket.connect(token);

    _socket.on('message_received', (data) {
      final msg = ChatMessage.fromJson(data);
      if (msg.conversationId != widget.conversationId) return;
      setState(() => _messages.add(msg));
      _socket.messageRead(widget.conversationId);
      _scrollToBottom();
    });

    _socket.on('message_deleted', (data) {
      setState(() {
        _messages = _messages.map((m) {
          if (m.id == data['id']) {
            return ChatMessage(
              id: m.id,
              conversationId: m.conversationId,
              senderId: m.senderId,
              content: null,
              status: m.status,
              isEdited: m.isEdited,
              isDeleted: true,
              attachments: const [],
              createdAt: m.createdAt,
            );
          }
          return m;
        }).toList();
      });
    });

    _socket.on('typing_start', (data) {
      if (data['conversationId'] == widget.conversationId) setState(() => _peerTyping = true);
    });
    _socket.on('typing_stop', (data) {
      if (data['conversationId'] == widget.conversationId) setState(() => _peerTyping = false);
    });
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 250),
          curve: Curves.easeOut,
        );
      }
    });
  }

  Future<void> _send() async {
    final content = _textController.text.trim();
    if (content.isEmpty) return;
    _textController.clear();
    _socket.typingStop(widget.conversationId);
    try {
      await ApiClient.post('/messages', body: {
        'conversationId': widget.conversationId,
        'content': content,
      });
      // The sent message arrives back via the 'message_received' socket event
      // (server is the single source of truth) - it is never faked locally.
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Message failed to send')));
    }
  }

  Future<void> _pickMedia() async {
    if (_uploading) return;

    final choice = await showModalBottomSheet<String>(
      context: context,
      builder: (sheetContext) => SafeArea(
        child: Wrap(
          children: [
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Photo'),
              onTap: () => Navigator.pop(sheetContext, 'image'),
            ),
            ListTile(
              leading: const Icon(Icons.videocam_outlined),
              title: const Text('Video'),
              onTap: () => Navigator.pop(sheetContext, 'video'),
            ),
          ],
        ),
      ),
    );

    if (choice == null || !mounted) return;

    try {
      final XFile? file = choice == 'image'
          ? await _imagePicker.pickImage(source: ImageSource.gallery, imageQuality: 90)
          : await _imagePicker.pickVideo(source: ImageSource.gallery);

      if (file == null) return;

      await _uploadMedia(file);
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not select media')),
      );
    }
  }

  Future<void> _uploadMedia(XFile file) async {
    final token = await TokenStorage.getAccessToken();
    if (token == null) return;

    setState(() => _uploading = true);

    try {
      final request = http.MultipartRequest(
        'POST',
        Uri.parse('${ApiConfig.baseUrl}/messages/upload'),
      );
      request.headers['Authorization'] = 'Bearer $token';
      request.fields['conversationId'] = widget.conversationId;
      request.files.add(
        await http.MultipartFile.fromPath('file', file.path, filename: file.name),
      );

      final response = await request.send();
      final body = await response.stream.bytesToString();

      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw Exception(body.isNotEmpty ? body : 'Upload failed');
      }
      // The new message arrives via the 'message_received' socket event.
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Media upload failed')),
      );
    } finally {
      if (mounted) {
        setState(() => _uploading = false);
      }
    }
  }

  Future<void> _deleteMessage(ChatMessage m) async {
    try {
      await ApiClient.delete('/messages/${m.id}');
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not delete message')));
    }
  }

  @override
  void dispose() {
    _socket.off('message_received');
    _socket.off('message_deleted');
    _socket.off('typing_start');
    _socket.off('typing_stop');
    _textController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(widget.title, style: const TextStyle(fontSize: 16)),
            if (_peerTyping)
              const Text('typing…', style: TextStyle(fontSize: 12, fontWeight: FontWeight.normal, color: Colors.white70)),
          ],
        ),
      ),
      body: Column(
        children: [
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : ListView.builder(
                    controller: _scrollController,
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    itemCount: _messages.length,
                    itemBuilder: (context, index) {
                      final m = _messages[index];
                      final mine = m.senderId == _myUserId;
                      return _MessageBubble(
                        message: m,
                        mine: mine,
                        onLongPress: mine && !m.isDeleted ? () => _showMessageActions(m) : null,
                      );
                    },
                  ),
          ),
          if (_uploading) const LinearProgressIndicator(minHeight: 2),
          _buildComposer(),
        ],
      ),
    );
  }

  void _showMessageActions(ChatMessage m) {
    showModalBottomSheet(
      context: context,
      builder: (sheetContext) => SafeArea(
        child: Wrap(
          children: [
            ListTile(
              leading: const Icon(Icons.delete_outline, color: AlmusColors.danger),
              title: const Text('Delete'),
              onTap: () {
                Navigator.pop(sheetContext);
                _deleteMessage(m);
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildComposer() {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(8),
        child: Row(
          children: [
            IconButton(
              icon: const Icon(Icons.attach_file),
              onPressed: _uploading ? null : _pickMedia,
            ),
            Expanded(
              child: TextField(
                controller: _textController,
                decoration: const InputDecoration(hintText: 'Message'),
                onChanged: (v) {
                  if (v.isNotEmpty) {
                    _socket.typingStart(widget.conversationId);
                  } else {
                    _socket.typingStop(widget.conversationId);
                  }
                },
                onSubmitted: (_) => _send(),
              ),
            ),
            const SizedBox(width: 8),
            CircleAvatar(
              backgroundColor: AlmusColors.primary,
              child: IconButton(icon: const Icon(Icons.send, color: Colors.white, size: 20), onPressed: _send),
            ),
          ],
        ),
      ),
    );
  }
}

class _MessageBubble extends StatelessWidget {
  final ChatMessage message;
  final bool mine;
  final VoidCallback? onLongPress;

  const _MessageBubble({required this.message, required this.mine, this.onLongPress});

  Widget _buildAttachment(Attachment a) {
    if (a.type == 'IMAGE') {
      return Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: Image.network(
            '${ApiConfig.socketUrl}${a.url}',
            width: 220,
            fit: BoxFit.cover,
            errorBuilder: (_, __, ___) => const Icon(Icons.broken_image_outlined, size: 48, color: Colors.grey),
          ),
        ),
      );
    }
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(a.type == 'VIDEO' ? Icons.videocam_outlined : Icons.insert_drive_file_outlined, size: 20),
          const SizedBox(width: 6),
          Flexible(child: Text(a.fileName, overflow: TextOverflow.ellipsis)),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final hasText = message.isDeleted || (message.content != null && message.content!.isNotEmpty);

    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: GestureDetector(
        onLongPress: onLongPress,
        child: Container(
          margin: const EdgeInsets.symmetric(vertical: 4),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.75),
          decoration: BoxDecoration(
            color: mine ? AlmusColors.bubbleMine : AlmusColors.bubbleTheirs,
            borderRadius: BorderRadius.circular(14),
            boxShadow: const [BoxShadow(color: Color(0x11000000), blurRadius: 3, offset: Offset(0, 1))],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (!message.isDeleted) ...message.attachments.map(_buildAttachment),
              if (hasText)
                Text(
                  message.isDeleted ? 'This message was deleted' : (message.content ?? ''),
                  style: TextStyle(
                    fontStyle: message.isDeleted ? FontStyle.italic : FontStyle.normal,
                    color: message.isDeleted ? Colors.grey : Colors.black87,
                  ),
                ),
              if (message.isEdited && !message.isDeleted)
                const Text('edited', style: TextStyle(fontSize: 10, color: Colors.grey)),
              if (mine)
                Icon(
                  message.status == 'SENT' ? Icons.done : Icons.done_all,
                  size: 14,
                  color: message.status == 'READ' ? AlmusColors.primary : Colors.grey,
                ),
            ],
          ),
        ),
      ),
    );
  }
}
