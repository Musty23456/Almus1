class Attachment {
  final String id;
  final String type;
  final String url;
  final String fileName;

  Attachment({required this.id, required this.type, required this.url, required this.fileName});

  factory Attachment.fromJson(Map<String, dynamic> json) => Attachment(
        id: json['id'],
        type: json['type'],
        url: json['url'],
        fileName: json['fileName'],
      );
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
    required this.createdAt,
  });

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
  String? get avatarUrl => type == 'GROUP' ? group?['avatarUrl'] : peer?['avatarUrl'];
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
