import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:almus_chat/main.dart';

void main() {
  testWidgets('App boots and shows the splash screen', (WidgetTester tester) async {
    // Avoid hitting the real platform channel for SharedPreferences in tests.
    SharedPreferences.setMockInitialValues({});

    await tester.pumpWidget(const AlmusChatApp());

    // The splash screen should render the app name and tagline immediately,
    // before the async auth-restore call resolves.
    expect(find.text('ALMUS CHAT'), findsOneWidget);
    expect(find.text('Connect. Chat. Share.'), findsOneWidget);
  });
}
