import 'package:flutter/material.dart';

/// Global navigator so code outside the widget tree (e.g. a tapped push
/// notification) can open a screen.
final GlobalKey<NavigatorState> appNavigatorKey = GlobalKey<NavigatorState>();

/// Lets code outside the widget tree show a banner (e.g. a notification that
/// arrives while the app is open).
final GlobalKey<ScaffoldMessengerState> appMessengerKey = GlobalKey<ScaffoldMessengerState>();
