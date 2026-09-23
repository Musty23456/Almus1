import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config/api_config.dart';
import 'token_storage.dart';

class ApiException implements Exception {
  final String message;
  final int statusCode;
  ApiException(this.message, this.statusCode);
  @override
  String toString() => message;
}

/// Thin REST client. Every real network call in the app goes through here -
/// there is no local mock data path.
class ApiClient {
  static Future<Map<String, String>> _headers({bool auth = true}) async {
    final headers = {'Content-Type': 'application/json'};
    if (auth) {
      final token = await TokenStorage.getAccessToken();
      if (token != null) headers['Authorization'] = 'Bearer $token';
    }
    return headers;
  }

  static Future<dynamic> _handle(http.Response res) async {
    final body = res.body.isNotEmpty ? jsonDecode(res.body) : null;
    if (res.statusCode == 401) {
      final refreshed = await _tryRefresh();
      if (refreshed) throw _RetryNeeded();
      throw ApiException('Session expired. Please log in again.', 401);
    }
    if (res.statusCode >= 400) {
      throw ApiException(body?['error'] ?? 'Something went wrong', res.statusCode);
    }
    return body;
  }

  static Future<bool> _tryRefresh() async {
    final refreshToken = await TokenStorage.getRefreshToken();
    if (refreshToken == null) return false;
    final res = await http.post(
      Uri.parse('${ApiConfig.baseUrl}/auth/refresh'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'refreshToken': refreshToken}),
    );
    if (res.statusCode != 200) return false;
    final data = jsonDecode(res.body);
    await TokenStorage.save(data['accessToken'], data['refreshToken']);
    return true;
  }

  static Future<dynamic> get(String path, {bool auth = true}) async {
    return _withRetry(() async {
      final res = await http.get(Uri.parse('${ApiConfig.baseUrl}$path'), headers: await _headers(auth: auth));
      return _handle(res);
    });
  }

  static Future<dynamic> post(String path, {Map<String, dynamic>? body, bool auth = true}) async {
    return _withRetry(() async {
      final res = await http.post(
        Uri.parse('${ApiConfig.baseUrl}$path'),
        headers: await _headers(auth: auth),
        body: body != null ? jsonEncode(body) : null,
      );
      return _handle(res);
    });
  }

  static Future<dynamic> patch(String path, {Map<String, dynamic>? body}) async {
    return _withRetry(() async {
      final res = await http.patch(
        Uri.parse('${ApiConfig.baseUrl}$path'),
        headers: await _headers(),
        body: body != null ? jsonEncode(body) : null,
      );
      return _handle(res);
    });
  }

  static Future<dynamic> delete(String path) async {
    return _withRetry(() async {
      final res = await http.delete(Uri.parse('${ApiConfig.baseUrl}$path'), headers: await _headers());
      return _handle(res);
    });
  }

  static Future<dynamic> _withRetry(Future<dynamic> Function() fn) async {
    try {
      return await fn();
    } on _RetryNeeded {
      return await fn();
    }
  }
}

class _RetryNeeded implements Exception {}
