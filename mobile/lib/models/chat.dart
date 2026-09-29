class Attachment {
  final String id;
  final String type; // IMAGE, VIDEO, AUDIO, VOICE, DOCUMENT
  final String url;
  final String fileName;

  /// Loudness bars (0-100) for voice messages, if the sender's app recorded them.
  final List<int>? waveform;

  Attachment({
    required this.id,
    required this.type,
    required this.url,
    required this.fileName,
    this.waveform,
  });

  factory Attachment.fromJson(Map<String, dynamic> json) {
    List<int>? wave;
    final raw = json['waveform'];
    if (raw is String && raw.isNotEmpty) {
      wave = raw.split(',').map((e) => int.tryParse(e.trim()) ?? 0).toList();
    }
    return Attachment(
      id: json['id'],
      type: json['type'],
      url: json['url'],
      fileName: json['fileName'],
      waveform: wave,
    );
  }
}

class Reaction {
  final String userId;
  final String emoji;

  Reaction({required this.userId, required this.emoji});

  factory Reaction.fromJson(Map<String, dynamic> json) =>
      Reaction(userId: json['userId'], emoji: json['emoji']);
}

/// Small preview of the message being replied to (drawn as a quote in the bubble).
class ReplyPreview {
  final String id;
  final String senderId;
  final String senderName;
  final String? content;
  final bool isDeleted;
  final String? attachmentType;

  ReplyPreview({
    required this.id,
    required this.senderId,
    required this.senderName,
    required this.content,
    required this.isDeleted,
    this.attachmentType,
  });

  factory ReplyPreview.fromJson(Map<String, dynamic> json) {
    final sender = json['sender'] as Map<String, dynamic>?;
    final atts = json['attachments'] as List? ?? [];
    return ReplyPreview(
      id: json['id'],
      senderId: json['senderId'],
      senderName: (sender?['fullName'] ?? sender?['username'] ?? '') as String,
      content: json['content'],
      isDeleted: json['isDeleted'] ?? false,
      attachmentType: atts.isNotEmpty ? atts.first['type'] as String? : null,
    );
  }

  /// One-line text for the quote / reply bar.
  String get text {
    if (isDeleted) return 'This message was deleted';
    if (content != null && content!.isNotEmpty) return content!;
    switch (attachmentType) {
      case 'IMAGE':
        return '📷 Photo';
      case 'VIDEO':
        return '🎥 Video';
      case 'AUDIO':
        return '🎵 Audio';
      case 'VOICE':
        return '🎤 Voice message';
      case 'DOCUMENT':
        return '📄 Document';
    }
    return '';
  }
}

class ChatMessage {
  final String id;
  final String conversationId;
  final String senderId;
  final String? content;
  final String status; // SENT, DELIVERED, READ
  final bool isEdited;
  final bool isDeleted;
  final List<Attachment> attachments;
  final List<Reaction> reactions;
  final List<String> starredBy;
  final ReplyPreview? replyTo;
  final DateTime createdAt;

  ChatMessage({
    required this.id,
    required this.conversationId,
    required this.senderId,
    required this.content,
    required this.status,
    required this.isEdited,
    required this.isDeleted,
    required this.attachments,
    this.reactions = const [],
    this.starredBy = const [],
    this.replyTo,
    required this.createdAt,
  });

  ChatMessage copyWith({
    String? content,
    String? status,
    bool? isEdited,
    bool? isDeleted,
    List<Attachment>? attachments,
    List<Reaction>? reactions,
    List<String>? starredBy,
  }) {
    return ChatMessage(
      id: id,
      conversationId: conversationId,
      senderId: senderId,
      content: content ?? this.content,
      status: status ?? this.status,
      isEdited: isEdited ?? this.isEdited,
      isDeleted: isDeleted ?? this.isDeleted,
      attachments: attachments ?? this.attachments,
      reactions: reactions ?? this.reactions,
      starredBy: starredBy ?? this.starredBy,
      replyTo: replyTo,
      createdAt: createdAt,
    );
  }

  factory ChatMessage.fromJson(Map<String, dynamic> json) {
    return ChatMessage(
      id: json['id'],
      conversationId: json['conversationId'],
      senderId: json['senderId'],
      content: json['content'],
      status: json['status'] ?? 'SENT',
      isEdited: json['isEdited'] ?? false,
      isDeleted: json['isDeleted'] ?? false,
      attachments: (json['attachments'] as List? ?? [])
          .map((a) => Attachment.fromJson(a))
          .toList(),
      reactions: (json['reactions'] as List? ?? [])
          .map((r) => Reaction.fromJson(Map<String, dynamic>.from(r)))
          .toList(),
      starredBy: (json['isStarredBy'] as List? ?? []).map((e) => e.toString()).toList(),
      replyTo: json['replyTo'] != null
          ? ReplyPreview.fromJson(Map<String, dynamic>.from(json['replyTo']))
          : null,
      createdAt: DateTime.tryParse(json['createdAt'] ?? '') ?? DateTime.now(),
    );
  }
}

class ConversationSummary {
  final String id;
  final String type;
  final Map<String, dynamic>? peer;
  final Map<String, dynamic>? group;
  final Map<String, dynamic>? lastMessage;
  final DateTime updatedAt;

  ConversationSummary({
    required this.id,
    required this.type,
    this.peer,
    this.group,
    this.lastMessage,
    required this.updatedAt,
  });

  String get title => type == 'GROUP' ? (group?['name'] ?? 'Group') : (peer?['fullName'] ?? peer?['username'] ?? 'Unknown');
  String? get avatarUrl => type == 'GROUP' ? (group?['avatarUrl']) : (peer?['avatarUrl']);
  bool get isPeerOnline => peer?['isOnline'] == true;

  factory ConversationSummary.fromJson(Map<String, dynamic> json) {
    return ConversationSummary(
      id: json['id'],
      type: json['type'],
      peer: json['peer'],
      group: json['group'],
      lastMessage: json['lastMessage'],
      updatedAt: DateTime.tryParse(json['updatedAt'] ?? '') ?? DateTime.now(),
    );
  }
}
