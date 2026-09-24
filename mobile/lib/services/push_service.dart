import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';

import '../navigation.dart';
import '../screens/chat_screen.dart';
import 'api_client.dart';

/// Push notifications through Firebase Cloud Messaging.
///
/// Everything here is best-effort and silent on failure: if Firebase isn't
/// configured (no google-services.json), the user denies permission, or the
/// network is down, the app keeps working exactly as before - it just won't
/// show notifications while it's closed.
class PushService {
  PushService._();
  static final PushService instance = PushService._();

  bool _firebaseReady = false;
  String? _token;
  StreamSubscription<String>? _refreshSub;
  StreamSubscription<RemoteMessage>? _openedSub;

  /// Call once from main(). Safe when Firebase isn't configured.
  Future<void> initFirebase() async {
    try {
      await Firebase.initializeApp();
      _firebaseReady = true;
    } catch (e) {
      debugPrint('Push notifications disabled (Firebase not configured): $e');
    }
  }

  /// Call after the user is logged in: asks for permission, registers this
  /// phone's FCM token with the backend, and handles notification taps.
  Future<void> registerForCurrentUser() async {
    if (!_firebaseReady) return;
    try {
      final messaging = FirebaseMessaging.instance;
      final settings = await messaging.requestPermission();
      if (settings.authorizationStatus == AuthorizationStatus.denied) return;

      final token = await messaging.getToken();
      if (token != null) await _sendToken(token);

      _refreshSub ??= messaging.onTokenRefresh.listen(_sendToken);
      _openedSub ??= FirebaseMessaging.onMessageOpenedApp.listen(_openFromMessage);

      // App was launched by tapping a notification while it was closed.
      final initial = await messaging.getInitialMessage();
      if (initial != null) _openFromMessage(initial);
    } catch (e) {
      debugPrint('Could not set up push notifications: $e');
    }
  }

  /// Call BEFORE logging out (needs a valid session) so this phone stops
  /// receiving the account's notifications.
  Future<void> unregister() async {
    await _refreshSub?.cancel();
    _refreshSub = null;
    await _openedSub?.cancel();
    _openedSub = null;

    if (!_firebaseReady) return;
    try {
      final token = _token;
      if (token != null) {
        await ApiClient.delete('/devices/${Uri.encodeComponent(token)}');
      }
      await FirebaseMessaging.instance.deleteToken();
    } catch (e) {
      debugPrint('Could not unregister push token: $e');
    }
    _token = null;
  }

  Future<void> _sendToken(String token) async {
    _token = token;
    try {
      await ApiClient.post('/devices', body: {'token': token, 'platform': 'android'});
    } catch (e) {
      debugPrint('Could not register device token: $e');
    }
  }

  void _openFromMessage(RemoteMessage message) {
    final conversationId = message.data['conversationId'];
    if (conversationId is! String || conversationId.isEmpty) return;

    final title = message.notification?.title ?? 'Chat';
    appNavigatorKey.currentState?.push(
      MaterialPageRoute<void>(
        builder: (_) => ChatScreen(conversationId: conversationId, title: title),
      ),
    );
  }
}
