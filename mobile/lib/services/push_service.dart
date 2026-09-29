import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';

import '../navigation.dart';
import '../screens/chat_screen.dart';
import 'api_client.dart';

/// Push notifications through Firebase Cloud Messaging.
///
/// Everything here is best-effort and never crashes the app: if Firebase isn't
/// configured (no google-services.json), the user denies permission, or the
/// network is down, the app keeps working - it just won't show notifications
/// while it's closed. [diagnose] (Settings > Test notifications) explains
/// exactly which step is failing.
class PushService {
  PushService._();
  static final PushService instance = PushService._();

  /// The chat that is open right now (set by ChatScreen) - no banner for it.
  static String? activeConversationId;

  bool _firebaseReady = false;
  String? _initError;
  String _permission = 'not asked yet';
  bool _tokenRegistered = false;
  String? _tokenError;
  String? _token;
  StreamSubscription<String>? _refreshSub;
  StreamSubscription<RemoteMessage>? _openedSub;
  StreamSubscription<RemoteMessage>? _foregroundSub;

  /// Call once from main(). Safe when Firebase isn't configured.
  Future<void> initFirebase() async {
    try {
      await Firebase.initializeApp();
      _firebaseReady = true;
    } catch (e) {
      _initError = e.toString();
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
      _permission = settings.authorizationStatus.name;
      if (settings.authorizationStatus == AuthorizationStatus.denied) return;

      final token = await messaging.getToken();
      if (token != null) {
        await _sendToken(token);
      } else {
        _tokenRegistered = false;
        _tokenError = 'Firebase did not give this phone a token (check internet / Google Play services).';
      }

      _refreshSub ??= messaging.onTokenRefresh.listen(_sendToken);
      _openedSub ??= FirebaseMessaging.onMessageOpenedApp.listen(_openFromMessage);
      // Android does not show a notification while the app is open, so show our own banner.
      _foregroundSub ??= FirebaseMessaging.onMessage.listen(_showInApp);

      // App was launched by tapping a notification while it was closed.
      final initial = await messaging.getInitialMessage();
      if (initial != null) _openFromMessage(initial);
    } catch (e) {
      _tokenError = e.toString();
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
    await _foregroundSub?.cancel();
    _foregroundSub = null;

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
    _tokenRegistered = false;
  }

  /// Checks every step (phone -> server -> Firebase) and returns a plain-language report.
  /// Sends a real test notification at the end.
  Future<String> diagnose() async {
    final lines = <String>[];

    if (!_firebaseReady) {
      lines.add('❌ Phone: Firebase is not set up in this app build.');
      lines.add(
          'Fix: add the GOOGLE_SERVICES_JSON secret on GitHub (from Firebase, for package com.almus.chat), then rebuild and reinstall the app.');
      if (_initError != null) lines.add('Detail: $_initError');
      return lines.join('\n\n');
    }

    await registerForCurrentUser();

    if (_permission == 'denied') {
      lines.add('❌ Phone: notification permission is denied.');
      lines.add('Fix: Android Settings > Apps > ALMUS CHAT > Notifications > allow.');
      return lines.join('\n\n');
    }
    lines.add('✅ Phone: Firebase is ready (permission: $_permission).');

    if (!_tokenRegistered) {
      lines.add('❌ Could not register this phone with the server: ${_tokenError ?? 'unknown error'}');
      return lines.join('\n\n');
    }
    lines.add('✅ This phone is registered with the server.');

    try {
      final r = await ApiClient.post('/devices/test');
      if (r is Map && r['ok'] == true) {
        lines.add('✅ Server sent a test notification.');
        lines.add(
            'If the app is open you will see a banner at the bottom. To see the real notification, press Home (close the app) and test again.');
      } else {
        lines.add('❌ Server: ${r is Map ? r['message'] : 'unexpected reply'}');
      }
    } on ApiException catch (e) {
      lines.add('❌ Server: ${e.message}');
    } catch (e) {
      lines.add('❌ Could not reach the server: $e');
    }
    return lines.join('\n\n');
  }

  Future<void> _sendToken(String token) async {
    _token = token;
    try {
      await ApiClient.post('/devices', body: {'token': token, 'platform': 'android'});
      _tokenRegistered = true;
      _tokenError = null;
    } catch (e) {
      _tokenRegistered = false;
      _tokenError = e.toString();
      debugPrint('Could not register device token: $e');
    }
  }

  void _showInApp(RemoteMessage message) {
    final conversationId = message.data['conversationId'];
    if (conversationId is String && conversationId == activeConversationId) return;

    final n = message.notification;
    if (n == null) return;
    appMessengerKey.currentState
      ?..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          duration: const Duration(seconds: 4),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(n.title ?? '', style: const TextStyle(fontWeight: FontWeight.w600)),
              if ((n.body ?? '').isNotEmpty) Text(n.body!, maxLines: 2, overflow: TextOverflow.ellipsis),
            ],
          ),
          action: (conversationId is String && conversationId.isNotEmpty)
              ? SnackBarAction(label: 'OPEN', onPressed: () => _openFromMessage(message))
              : null,
        ),
      );
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
