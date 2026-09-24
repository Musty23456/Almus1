import 'package:flutter/foundation.dart';
import '../models/user.dart';
import 'api_client.dart';
import 'push_service.dart';
import 'token_storage.dart';

class AuthService extends ChangeNotifier {
  AlmusUser? currentUser;
  bool isLoading = true;

  AuthService() {
    _restoreSession();
  }

  Future<void> _restoreSession() async {
    final token = await TokenStorage.getAccessToken();
    if (token != null) {
      try {
        final data = await ApiClient.get('/users/me');
        currentUser = AlmusUser.fromJson(data['user']);
      } catch (_) {
        await TokenStorage.clear();
      }
    }
    isLoading = false;
    notifyListeners();
  }

  Future<void> register({
    required String fullName,
    required String username,
    required String phoneNumber,
    required String email,
    required String password,
  }) async {
    final data = await ApiClient.post(
      '/auth/register',
      auth: false,
      body: {
        'fullName': fullName,
        'username': username,
        'phoneNumber': phoneNumber,
        'email': email,
        'password': password,
      },
    );
    await TokenStorage.save(data['accessToken'], data['refreshToken']);
    currentUser = AlmusUser.fromJson(data['user']);
    notifyListeners();
  }

  Future<void> login({required String identifier, required String password}) async {
    final data = await ApiClient.post(
      '/auth/login',
      auth: false,
      body: {'identifier': identifier, 'password': password},
    );
    await TokenStorage.save(data['accessToken'], data['refreshToken']);
    currentUser = AlmusUser.fromJson(data['user']);
    notifyListeners();
  }

  Future<void> logout() async {
    // Must happen while the access token is still valid, so this phone stops getting this account's pushes.
    await PushService.instance.unregister();
    final refreshToken = await TokenStorage.getRefreshToken();
    try {
      await ApiClient.post('/auth/logout', body: {'refreshToken': refreshToken});
    } catch (_) {
      // Best-effort - clear locally regardless of network state.
    }
    await TokenStorage.clear();
    currentUser = null;
    notifyListeners();
  }

  Future<void> logoutAllDevices() async {
    await PushService.instance.unregister();
    await ApiClient.post('/auth/logout-all');
    await TokenStorage.clear();
    currentUser = null;
    notifyListeners();
  }
}
