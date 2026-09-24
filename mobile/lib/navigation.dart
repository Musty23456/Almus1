import 'package:flutter/material.dart';

/// Global navigator so code outside the widget tree (e.g. a tapped push
/// notification) can open a screen.
final GlobalKey<NavigatorState> appNavigatorKey = GlobalKey<NavigatorState>();
