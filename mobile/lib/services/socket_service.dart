import 'package:socket_io_client/socket_io_client.dart' as io;
import '../config/api_config.dart';

typedef MessageHandler = void Function(Map<String, dynamic> data);

/// Wraps the Socket.IO connection. Authenticates with the same JWT as the
/// REST API (see backend/src/sockets/io.ts) - the server rejects any socket
/// that doesn't present a valid token, so there is no unauthenticated path
/// into a conversation's real-time room.
class SocketService {
  io.Socket? _socket;

  void connect(String accessToken) {
    _socket = io.io(
      ApiConfig.socketUrl,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': accessToken})
          .disableAutoConnect()
          .build(),
    );
    _socket!.connect();
  }

  void disconnect() {
    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
  }

  void on(String event, MessageHandler handler) {
    _socket?.on(event, (data) => handler(Map<String, dynamic>.from(data)));
  }

  void off(String event) => _socket?.off(event);

  void emit(String event, Map<String, dynamic> data) => _socket?.emit(event, data);

  void typingStart(String conversationId) => emit('typing_start', {'conversationId': conversationId});
  void typingStop(String conversationId) => emit('typing_stop', {'conversationId': conversationId});
  void messageDelivered(String messageId) => emit('message_delivered', {'messageId': messageId});
  void messageRead(String conversationId) => emit('message_read', {'conversationId': conversationId});

  bool get isConnected => _socket?.connected ?? false;
}
