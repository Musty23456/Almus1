import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:file_picker/file_picker.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';
import '../config/api_config.dart';
import '../config/theme.dart';
import '../models/chat.dart';
import '../services/api_client.dart';
import '../services/call_service.dart';
import '../services/push_service.dart';
import '../services/socket_service.dart';
import '../services/token_storage.dart';
import '../services/voice_recorder.dart';
import '../widgets/image_viewer_screen.dart';
import '../widgets/voice_message_bubble.dart';

class ChatScreen extends StatefulWidget {
  final String conversationId;
  final String title;

  /// Set for 1-to-1 chats so the call buttons can appear in the app bar.
  final String? peerUserId;

  const ChatScreen({super.key, required this.conversationId, required this.title, this.peerUserId});

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
  ChatMessage? _replyingTo;
  ChatMessage? _editing;
  final VoiceRecorder _voice = VoiceRecorder();
  bool _recording = false;
  bool _cancelHint = false;
  bool _pressed = false;
  bool _hasText = false;
  bool _showJump = false;
  bool _searching = false;
  String _query = '';

  @override
  void initState() {
    super.initState();
    PushService.activeConversationId = widget.conversationId;
    _scrollController.addListener(_onScroll);
    _init();
  }

  void _onScroll() {
    if (!_scrollController.hasClients) return;
    final away = _scrollController.position.maxScrollExtent - _scrollController.position.pixels > 300;
    if (away != _showJump) setState(() => _showJump = away);
  }

  /// Messages currently shown (all of them, or only the matches while searching).
  List<ChatMessage> get _visible {
    final q = _query.trim().toLowerCase();
    if (!_searching || q.isEmpty) return _messages;
    return _messages
        .where((m) => !m.isDeleted && (m.content ?? '').toLowerCase().contains(q))
        .toList();
  }

  static const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  String _dayLabel(DateTime d) {
    final local = d.toLocal();
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final day = DateTime(local.year, local.month, local.day);
    final diff = today.difference(day).inDays;
    if (diff == 0) return 'Today';
    if (diff == 1) return 'Yesterday';
    return '${local.day} ${_months[local.month - 1]} ${local.year}';
  }

  bool _sameDay(DateTime a, DateTime b) {
    final x = a.toLocal();
    final y = b.toLocal();
    return x.year == y.year && x.month == y.month && x.day == y.day;
  }

  Widget _dateChip(DateTime d) => Center(
        child: Container(
          margin: const EdgeInsets.symmetric(vertical: 8),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
          decoration: BoxDecoration(
            color: Colors.black.withOpacity(0.08),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Text(_dayLabel(d), style: const TextStyle(fontSize: 12, color: Colors.black54)),
        ),
      );

  void _toggleSearch() {
    setState(() {
      _searching = !_searching;
      _query = '';
    });
    if (!_searching) _scrollToBottom();
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
      _updateMessage(data['id'], (m) => m.copyWith(isDeleted: true, attachments: const [], reactions: const []));
    });

    _socket.on('message_edited', (data) {
      _updateMessage(data['id'], (m) => m.copyWith(content: data['content'] as String?, isEdited: true));
    });

    _socket.on('message_reaction', (data) {
      final list = (data['reactions'] as List? ?? [])
          .map((r) => Reaction.fromJson(Map<String, dynamic>.from(r)))
          .toList();
      _updateMessage(data['messageId'], (m) => m.copyWith(reactions: list));
    });

    _socket.on('message_delivered', (data) {
      _updateMessage(data['messageId'], (m) => m.status == 'SENT' ? m.copyWith(status: 'DELIVERED') : m);
    });

    _socket.on('message_read', (data) {
      if (data['conversationId'] != widget.conversationId || data['userId'] == _myUserId) return;
      if (!mounted) return;
      setState(() {
        _messages = _messages.map((m) => m.senderId == _myUserId ? m.copyWith(status: 'READ') : m).toList();
      });
    });

    _socket.on('typing_start', (data) {
      if (data['conversationId'] == widget.conversationId) setState(() => _peerTyping = true);
    });
    _socket.on('typing_stop', (data) {
      if (data['conversationId'] == widget.conversationId) setState(() => _peerTyping = false);
    });
  }

  void _updateMessage(dynamic id, ChatMessage Function(ChatMessage) change) {
    if (!mounted) return;
    setState(() {
      _messages = _messages.map((m) => m.id == id ? change(m) : m).toList();
    });
  }

  void _toast(String text) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }

  // ------------------------------------------------------------ message actions

  static const _quickReactions = ['😂', '❤️', '👍', '😢', '😡'];

  void _startReply(ChatMessage m) {
    if (m.isDeleted) return;
    setState(() {
      _editing = null;
      _replyingTo = m;
    });
  }

  void _startEdit(ChatMessage m) {
    setState(() {
      _replyingTo = null;
      _editing = m;
      _textController.text = m.content ?? '';
      _hasText = true;
      _textController.selection = TextSelection.collapsed(offset: _textController.text.length);
    });
  }

  void _cancelComposerMode() {
    setState(() {
      if (_editing != null) {
        _textController.clear();
        _hasText = false;
      }
      _replyingTo = null;
      _editing = null;
    });
  }

  Future<void> _react(ChatMessage m, String emoji) async {
    try {
      await ApiClient.post('/messages/${m.id}/react', body: {'emoji': emoji});
      // Updated reactions arrive via the 'message_reaction' socket event.
    } catch (_) {
      _toast('Could not react');
    }
  }

  Future<void> _toggleStar(ChatMessage m) async {
    try {
      final data = await ApiClient.post('/messages/${m.id}/star');
      final list = (data['message']['isStarredBy'] as List? ?? []).map((e) => e.toString()).toList();
      _updateMessage(m.id, (x) => x.copyWith(starredBy: list));
    } catch (_) {
      _toast('Could not update star');
    }
  }

  Future<void> _forward(ChatMessage m) async {
    List<ConversationSummary> chats = [];
    try {
      final data = await ApiClient.get('/conversations');
      chats = (data['conversations'] as List).map((c) => ConversationSummary.fromJson(c)).toList();
    } catch (_) {
      _toast('Could not load your chats');
      return;
    }
    if (!mounted) return;
    final target = await showModalBottomSheet<ConversationSummary>(
      context: context,
      isScrollControlled: true,
      builder: (sheetContext) => SafeArea(
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.of(sheetContext).size.height * 0.6),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Padding(
                padding: EdgeInsets.all(16),
                child: Text('Forward to…', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
              ),
              Flexible(
                child: ListView(
                  shrinkWrap: true,
                  children: chats
                      .map((c) => ListTile(
                            leading: CircleAvatar(child: Text(c.title.isNotEmpty ? c.title[0].toUpperCase() : '?')),
                            title: Text(c.title),
                            onTap: () => Navigator.pop(sheetContext, c),
                          ))
                      .toList(),
                ),
              ),
            ],
          ),
        ),
      ),
    );
    if (target == null) return;
    try {
      await ApiClient.post('/messages/${m.id}/forward', body: {'conversationId': target.id});
      _toast('Forwarded to ${target.title}');
    } on ApiException catch (e) {
      _toast(e.message);
    } catch (_) {
      _toast('Could not forward message');
    }
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
    final editing = _editing;
    final replyTo = _replyingTo;
    _textController.clear();
    setState(() {
      _editing = null;
      _replyingTo = null;
      _hasText = false;
    });
    _socket.typingStop(widget.conversationId);
    try {
      if (editing != null) {
        if (content != editing.content) {
          await ApiClient.patch('/messages/${editing.id}', body: {'content': content});
        }
        return;
      }
      await ApiClient.post('/messages', body: {
        'conversationId': widget.conversationId,
        'content': content,
        if (replyTo != null) 'replyToId': replyTo.id,
      });
      // The sent message arrives back via the 'message_received' socket event
      // (server is the single source of truth) - it is never faked locally.
    } on ApiException catch (e) {
      _toast(e.message);
    } catch (_) {
      _toast('Message failed to send');
    }
  }

  Future<void> _pickMedia() async {
    if (_uploading) return;

    final choice = await showModalBottomSheet<String>(
      context: context,
      builder: (sheetContext) {
        Widget item(IconData icon, Color color, String label, String value) => InkWell(
              borderRadius: BorderRadius.circular(12),
              onTap: () => Navigator.pop(sheetContext, value),
              child: SizedBox(
                width: 80,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    CircleAvatar(radius: 26, backgroundColor: color, child: Icon(icon, color: Colors.white)),
                    const SizedBox(height: 6),
                    Text(label, style: const TextStyle(fontSize: 12), textAlign: TextAlign.center),
                  ],
                ),
              ),
            );
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Wrap(
              alignment: WrapAlignment.spaceEvenly,
              spacing: 8,
              runSpacing: 20,
              children: [
                item(Icons.photo_camera, Colors.pink, 'Camera', 'camera_photo'),
                item(Icons.videocam, Colors.red, 'Record video', 'camera_video'),
                item(Icons.photo_library, Colors.purple, 'Gallery', 'image'),
                item(Icons.video_library, Colors.deepOrange, 'Video', 'video'),
                item(Icons.insert_drive_file, Colors.indigo, 'Document', 'document'),
                item(Icons.headphones, Colors.orange, 'Audio', 'audio'),
              ],
            ),
          ),
        );
      },
    );

    if (choice == null || !mounted) return;

    try {
      XFile? file;
      switch (choice) {
        case 'camera_photo':
          file = await _imagePicker.pickImage(source: ImageSource.camera, imageQuality: 90);
          break;
        case 'camera_video':
          file = await _imagePicker.pickVideo(source: ImageSource.camera, maxDuration: const Duration(minutes: 3));
          break;
        case 'image':
          file = await _imagePicker.pickImage(source: ImageSource.gallery, imageQuality: 90);
          break;
        case 'video':
          file = await _imagePicker.pickVideo(source: ImageSource.gallery);
          break;
        case 'document':
          file = await _pickWithFilePicker(FileType.custom,
              extensions: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'zip']);
          break;
        case 'audio':
          file = await _pickWithFilePicker(FileType.audio);
          break;
      }

      if (file == null) return;

      await _uploadMedia(file);
    } catch (_) {
      _toast('Could not select media');
    }
  }

  Future<XFile?> _pickWithFilePicker(FileType type, {List<String>? extensions}) async {
    final res = await FilePicker.platform.pickFiles(
      type: type,
      allowedExtensions: type == FileType.custom ? extensions : null,
    );
    if (res == null || res.files.isEmpty || res.files.first.path == null) return null;
    final f = res.files.first;
    return XFile(f.path!, name: f.name);
  }

  Future<void> _uploadMedia(XFile file, {bool voice = false, List<int>? waveform}) async {
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
      if (_replyingTo != null) request.fields['replyToId'] = _replyingTo!.id;
      if (voice) {
        request.fields['isVoiceNote'] = 'true';
        if (waveform != null && waveform.isNotEmpty) request.fields['waveform'] = waveform.join(',');
      }
      request.files.add(
        await http.MultipartFile.fromPath('file', file.path, filename: file.name),
      );

      final response = await request.send();
      final body = await response.stream.bytesToString();

      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw Exception(body.isNotEmpty ? body : 'Upload failed');
      }
      // The new message arrives via the 'message_received' socket event.
      if (mounted) setState(() => _replyingTo = null);
    } catch (_) {
      _toast(voice ? 'Voice message failed to send' : 'Media upload failed');
    } finally {
      if (mounted) {
        setState(() => _uploading = false);
      }
    }
  }

  // ------------------------------------------------------------ voice messages

  Future<void> _startRecording() async {
    if (_uploading || _recording || _editing != null) return;
    HapticFeedback.mediumImpact();
    bool ok = false;
    try {
      ok = await _voice.start();
    } catch (_) {
      ok = false;
    }
    if (!ok) {
      _pressed = false;
      _toast('Microphone permission is needed to record voice messages');
      return;
    }
    // The finger was lifted while the permission / recorder was still starting.
    if (!_pressed || !mounted) {
      await _voice.cancel();
      return;
    }
    setState(() {
      _recording = true;
      _cancelHint = false;
    });
  }

  Future<void> _finishRecording({required bool cancel}) async {
    setState(() {
      _recording = false;
      _cancelHint = false;
    });
    if (cancel) {
      await _voice.cancel();
      return;
    }
    final clip = await _voice.stop();
    if (clip == null) {
      _toast('Hold the mic button and speak, then release to send');
      return;
    }
    await _uploadMedia(XFile(clip.path, name: 'voice.m4a'), voice: true, waveform: clip.waveform);
  }

  Future<void> _openExternal(String url) async {
    try {
      final ok = await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
      if (!ok) _toast('No app found to open this file');
    } catch (_) {
      _toast('Could not open file');
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
    if (PushService.activeConversationId == widget.conversationId) PushService.activeConversationId = null;
    _socket.off('message_received');
    _socket.off('message_deleted');
    _socket.off('message_edited');
    _socket.off('message_reaction');
    _socket.off('message_delivered');
    _socket.off('message_read');
    _socket.off('typing_start');
    _socket.off('typing_stop');
    _voice.dispose();
    _textController.dispose();
    _scrollController.removeListener(_onScroll);
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _startCall(bool video) async {
    final peerId = widget.peerUserId;
    if (peerId == null) return;
    await CallService.instance.startCall(peerId: peerId, peerName: widget.title, video: video);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        actions: [
          IconButton(
            icon: Icon(_searching ? Icons.close : Icons.search),
            tooltip: _searching ? 'Close search' : 'Search in chat',
            onPressed: _toggleSearch,
          ),
          if (widget.peerUserId != null && !_searching) ...[
            IconButton(
              icon: const Icon(Icons.call),
              tooltip: 'Voice call',
              onPressed: () => _startCall(false),
            ),
            IconButton(
              icon: const Icon(Icons.videocam),
              tooltip: 'Video call',
              onPressed: () => _startCall(true),
            ),
          ],
        ],
        title: _searching
            ? TextField(
                autofocus: true,
                style: const TextStyle(color: Colors.white),
                cursorColor: Colors.white,
                decoration: const InputDecoration(
                  hintText: 'Search messages…',
                  hintStyle: TextStyle(color: Colors.white70),
                  border: InputBorder.none,
                  enabledBorder: InputBorder.none,
                  focusedBorder: InputBorder.none,
                  filled: false,
                ),
                onChanged: (v) => setState(() => _query = v),
              )
            : Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(widget.title, style: const TextStyle(fontSize: 16)),
                  if (_peerTyping)
                    const Text('typing…',
                        style: TextStyle(fontSize: 12, fontWeight: FontWeight.normal, color: Colors.white70)),
                ],
              ),
      ),
      floatingActionButton: _showJump && !_searching
          ? Padding(
              padding: const EdgeInsets.only(bottom: 64),
              child: FloatingActionButton.small(
                onPressed: _scrollToBottom,
                child: const Icon(Icons.keyboard_arrow_down),
              ),
            )
          : null,
      body: Column(
        children: [
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : Builder(builder: (context) {
                    final shown = _visible;
                    if (shown.isEmpty && _searching && _query.trim().isNotEmpty) {
                      return const Center(child: Text('No messages found', style: TextStyle(color: Colors.grey)));
                    }
                    return ListView.builder(
                      controller: _scrollController,
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      itemCount: shown.length,
                      itemBuilder: (context, index) {
                        final m = shown[index];
                        final mine = m.senderId == _myUserId;
                        final newDay = index == 0 || !_sameDay(shown[index - 1].createdAt, m.createdAt);
                        final bubble = _MessageBubble(
                          message: m,
                          mine: mine,
                          myUserId: _myUserId,
                          onLongPress: m.isDeleted ? null : () => _showMessageActions(m, mine),
                          onSwipeReply: () => _startReply(m),
                          onReactionTap: (emoji) => _react(m, emoji),
                          onOpenExternal: _openExternal,
                        );
                        if (!newDay) return bubble;
                        return Column(children: [_dateChip(m.createdAt), bubble]);
                      },
                    );
                  }),
          ),
          if (_uploading) const LinearProgressIndicator(minHeight: 2),
          _buildComposer(),
        ],
      ),
    );
  }

  void _showMessageActions(ChatMessage m, bool mine) {
    final starred = _myUserId != null && m.starredBy.contains(_myUserId);
    final hasText = m.content != null && m.content!.isNotEmpty;

    Widget action(IconData icon, String label, VoidCallback run, {Color? color}) => ListTile(
          leading: Icon(icon, color: color),
          title: Text(label, style: TextStyle(color: color)),
          onTap: () {
            Navigator.pop(context);
            run();
          },
        );

    showModalBottomSheet(
      context: context,
      builder: (sheetContext) => SafeArea(
        child: Wrap(
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: _quickReactions
                    .map((e) => InkWell(
                          borderRadius: BorderRadius.circular(24),
                          onTap: () {
                            Navigator.pop(sheetContext);
                            _react(m, e);
                          },
                          child: Padding(
                            padding: const EdgeInsets.all(8),
                            child: Text(e, style: const TextStyle(fontSize: 28)),
                          ),
                        ))
                    .toList(),
              ),
            ),
            const Divider(height: 1),
            action(Icons.reply, 'Reply', () => _startReply(m)),
            if (hasText)
              action(Icons.copy, 'Copy', () {
                Clipboard.setData(ClipboardData(text: m.content!));
                _toast('Copied');
              }),
            action(Icons.forward, 'Forward', () => _forward(m)),
            action(starred ? Icons.star : Icons.star_border, starred ? 'Unstar' : 'Star', () => _toggleStar(m)),
            if (mine && hasText && m.attachments.isEmpty) action(Icons.edit_outlined, 'Edit', () => _startEdit(m)),
            if (mine)
              action(Icons.delete_outline, 'Delete for everyone', () => _deleteMessage(m), color: AlmusColors.danger),
          ],
        ),
      ),
    );
  }

  Widget _buildComposerBar() {
    final editing = _editing;
    final reply = _replyingTo;
    if (editing == null && reply == null) return const SizedBox.shrink();
    final title = editing != null
        ? 'Edit message'
        : (reply!.senderId == _myUserId ? 'You' : widget.title);
    final text = editing != null
        ? (editing.content ?? '')
        : ReplyPreview(
            id: reply!.id,
            senderId: reply.senderId,
            senderName: '',
            content: reply.content,
            isDeleted: reply.isDeleted,
            attachmentType: reply.attachments.isNotEmpty ? reply.attachments.first.type : null,
          ).text;
    return Container(
      margin: const EdgeInsets.fromLTRB(8, 4, 8, 0),
      padding: const EdgeInsets.fromLTRB(12, 8, 4, 8),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.05),
        borderRadius: BorderRadius.circular(10),
        border: const Border(left: BorderSide(color: AlmusColors.primary, width: 4)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title,
                    style: const TextStyle(fontWeight: FontWeight.w600, color: AlmusColors.primary, fontSize: 12)),
                Text(text, maxLines: 1, overflow: TextOverflow.ellipsis),
              ],
            ),
          ),
          IconButton(icon: const Icon(Icons.close, size: 20), onPressed: _cancelComposerMode),
        ],
      ),
    );
  }

  Widget _buildRecordingBar() {
    return Container(
      height: 48,
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.05),
        borderRadius: BorderRadius.circular(24),
      ),
      child: Row(
        children: [
          const Icon(Icons.mic, color: Colors.red, size: 22),
          const SizedBox(width: 6),
          ValueListenableBuilder<int>(
            valueListenable: _voice.seconds,
            builder: (_, sec, __) => Text(
              '${sec ~/ 60}:${(sec % 60).toString().padLeft(2, '0')}',
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: ValueListenableBuilder<List<double>>(
              valueListenable: _voice.levels,
              builder: (_, levels, __) => Align(
                alignment: Alignment.centerRight,
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: levels
                        .map((v) => Container(
                              width: 3,
                              height: 4 + 24 * v,
                              margin: const EdgeInsets.symmetric(horizontal: 1),
                              decoration: BoxDecoration(
                                color: Colors.red.shade300,
                                borderRadius: BorderRadius.circular(2),
                              ),
                            ))
                        .toList(),
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(width: 8),
          Text(
            _cancelHint ? 'Release to cancel' : '‹ Slide to cancel',
            style: TextStyle(fontSize: 12, color: _cancelHint ? Colors.red : Colors.grey.shade600),
          ),
        ],
      ),
    );
  }

  Widget _buildActionButton() {
    if (_hasText || _editing != null) {
      return CircleAvatar(
        backgroundColor: AlmusColors.primary,
        child: IconButton(
          icon: Icon(_editing != null ? Icons.check : Icons.send, color: Colors.white, size: 20),
          onPressed: _send,
        ),
      );
    }
    // Hold to record, slide left to cancel, release to send.
    return GestureDetector(
      onTap: () => _toast('Hold to record, release to send'),
      onLongPressStart: (_) {
        _pressed = true;
        _startRecording();
      },
      onLongPressMoveUpdate: (d) {
        if (!_recording) return;
        final cancel = d.localOffsetFromOrigin.dx < -90;
        if (cancel != _cancelHint) setState(() => _cancelHint = cancel);
      },
      onLongPressEnd: (_) {
        _pressed = false;
        if (_recording) _finishRecording(cancel: _cancelHint);
      },
      onLongPressCancel: () {
        _pressed = false;
        if (_recording) _finishRecording(cancel: true);
      },
      child: CircleAvatar(
        radius: _recording ? 26 : 20,
        backgroundColor: _recording ? Colors.red : AlmusColors.primary,
        child: const Icon(Icons.mic, color: Colors.white, size: 22),
      ),
    );
  }

  Widget _buildComposer() {
    return SafeArea(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        _buildComposerBar(),
        Padding(
          padding: const EdgeInsets.all(8),
          child: Row(
            children: [
              Expanded(
                child: _recording
                    ? _buildRecordingBar()
                    : Row(
                        children: [
                          IconButton(
                            icon: const Icon(Icons.attach_file),
                            onPressed: _uploading ? null : _pickMedia,
                          ),
                          Expanded(
                            child: TextField(
                              controller: _textController,
                              minLines: 1,
                              maxLines: 5,
                              textCapitalization: TextCapitalization.sentences,
                              decoration: const InputDecoration(hintText: 'Message'),
                              onChanged: (v) {
                                final has = v.trim().isNotEmpty;
                                if (has != _hasText) setState(() => _hasText = has);
                                if (v.isNotEmpty) {
                                  _socket.typingStart(widget.conversationId);
                                } else {
                                  _socket.typingStop(widget.conversationId);
                                }
                              },
                              onSubmitted: (_) => _send(),
                            ),
                          ),
                        ],
                      ),
              ),
              const SizedBox(width: 8),
              _buildActionButton(),
            ],
          ),
        ),
      ]),
    );
  }
}

class _MessageBubble extends StatelessWidget {
  final ChatMessage message;
  final bool mine;
  final String? myUserId;
  final VoidCallback? onLongPress;
  final VoidCallback? onSwipeReply;
  final void Function(String emoji)? onReactionTap;
  final void Function(String url)? onOpenExternal;

  const _MessageBubble({
    required this.message,
    required this.mine,
    this.myUserId,
    this.onLongPress,
    this.onSwipeReply,
    this.onReactionTap,
    this.onOpenExternal,
  });

  Widget _buildAttachment(BuildContext context, Attachment a) {
    final url = '${ApiConfig.socketUrl}${a.url}';

    if (a.type == 'IMAGE') {
      return Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: GestureDetector(
          onTap: () => Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => ImageViewerScreen(url: url, title: a.fileName)),
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: Image.network(
              url,
              width: 220,
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => const Icon(Icons.broken_image_outlined, size: 48, color: Colors.grey),
            ),
          ),
        ),
      );
    }

    if (a.type == 'VOICE' || a.type == 'AUDIO') {
      return VoiceMessageBubble(
        url: url,
        waveform: a.waveform,
        label: a.type == 'AUDIO' ? a.fileName : null,
      );
    }

    // Video / documents: open in the phone's own viewer.
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: InkWell(
        onTap: () => onOpenExternal?.call(url),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(a.type == 'VIDEO' ? Icons.play_circle_outline : Icons.insert_drive_file_outlined, size: 24),
            const SizedBox(width: 6),
            Flexible(child: Text(a.fileName, overflow: TextOverflow.ellipsis)),
          ],
        ),
      ),
    );
  }

  Widget _buildQuote() {
    final r = message.replyTo!;
    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.fromLTRB(8, 4, 8, 4),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.06),
        borderRadius: BorderRadius.circular(8),
        border: const Border(left: BorderSide(color: AlmusColors.primary, width: 3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            r.senderId == myUserId ? 'You' : r.senderName,
            style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 12, color: AlmusColors.primary),
          ),
          Text(r.text, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13)),
        ],
      ),
    );
  }

  Widget _buildReactions() {
    final counts = <String, int>{};
    for (final r in message.reactions) {
      counts[r.emoji] = (counts[r.emoji] ?? 0) + 1;
    }
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Wrap(
        spacing: 4,
        children: counts.entries.map((e) {
          final mineReacted = message.reactions.any((r) => r.emoji == e.key && r.userId == myUserId);
          return GestureDetector(
            onTap: () => onReactionTap?.call(e.key),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: mineReacted ? AlmusColors.primary.withOpacity(0.15) : Colors.black.withOpacity(0.06),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(e.value > 1 ? '${e.key} ${e.value}' : e.key, style: const TextStyle(fontSize: 13)),
            ),
          );
        }).toList(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final hasText = message.isDeleted || (message.content != null && message.content!.isNotEmpty);
    final starred = myUserId != null && message.starredBy.contains(myUserId);

    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: GestureDetector(
        onLongPress: onLongPress,
        onHorizontalDragEnd: (d) {
          if ((d.primaryVelocity ?? 0).abs() > 400) onSwipeReply?.call();
        },
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
              if (message.replyTo != null && !message.isDeleted) _buildQuote(),
              if (!message.isDeleted) ...message.attachments.map((a) => _buildAttachment(context, a)),
              if (hasText)
                Text(
                  message.isDeleted ? 'This message was deleted' : (message.content ?? ''),
                  style: TextStyle(
                    fontStyle: message.isDeleted ? FontStyle.italic : FontStyle.normal,
                    color: message.isDeleted ? Colors.grey : Colors.black87,
                  ),
                ),
              if (!message.isDeleted && message.reactions.isNotEmpty) _buildReactions(),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (starred) const Icon(Icons.star, size: 12, color: Colors.amber),
                  if (message.isEdited && !message.isDeleted)
                    const Padding(
                      padding: EdgeInsets.only(left: 2),
                      child: Text('edited', style: TextStyle(fontSize: 10, color: Colors.grey)),
                    ),
                  if (mine)
                    Padding(
                      padding: const EdgeInsets.only(left: 4),
                      child: Icon(
                        message.status == 'SENT' ? Icons.done : Icons.done_all,
                        size: 14,
                        color: message.status == 'READ' ? AlmusColors.primary : Colors.grey,
                      ),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
