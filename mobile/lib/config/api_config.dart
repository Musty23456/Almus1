/// Central place to point the app at your deployed backend.
/// On an Android emulator, use 10.0.2.2 instead of localhost to reach
/// your host machine's backend during development.
class ApiConfig {
  static const String baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:4000/api',
  );

  static const String socketUrl = String.fromEnvironment(
    'SOCKET_URL',
    defaultValue: 'http://10.0.2.2:4000',
  );
}
