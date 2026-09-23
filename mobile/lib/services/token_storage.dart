import 'package:shared_preferences/shared_preferences.dart';

/// Simple token storage. For a production release, migrate to
/// flutter_secure_storage so tokens live in the platform keystore
/// instead of SharedPreferences.
class TokenStorage {
  static const _accessKey = 'almus_access_token';
  static const _refreshKey = 'almus_refresh_token';

  static Future<void> save(String accessToken, String refreshToken) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_accessKey, accessToken);
    await prefs.setString(_refreshKey, refreshToken);
  }

  static Future<String?> getAccessToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_accessKey);
  }

  static Future<String?> getRefreshToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_refreshKey);
  }

  static Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_accessKey);
    await prefs.remove(_refreshKey);
  }
}
