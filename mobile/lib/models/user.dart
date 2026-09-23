class AlmusUser {
  final String id;
  final String fullName;
  final String username;
  final String email;
  final String phoneNumber;
  final String? avatarUrl;
  final String? bio;
  final bool isOnline;
  final DateTime? lastSeenAt;

  AlmusUser({
    required this.id,
    required this.fullName,
    required this.username,
    required this.email,
    required this.phoneNumber,
    this.avatarUrl,
    this.bio,
    this.isOnline = false,
    this.lastSeenAt,
  });

  factory AlmusUser.fromJson(Map<String, dynamic> json) {
    return AlmusUser(
      id: json['id'],
      fullName: json['fullName'] ?? '',
      username: json['username'] ?? '',
      email: json['email'] ?? '',
      phoneNumber: json['phoneNumber'] ?? '',
      avatarUrl: json['avatarUrl'],
      bio: json['bio'],
      isOnline: json['isOnline'] ?? false,
      lastSeenAt: json['lastSeenAt'] != null ? DateTime.tryParse(json['lastSeenAt']) : null,
    );
  }
}
