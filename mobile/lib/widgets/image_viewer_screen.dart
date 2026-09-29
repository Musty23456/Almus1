import 'package:flutter/material.dart';

/// Full-screen, pinch-to-zoom image viewer.
class ImageViewerScreen extends StatelessWidget {
  final String url;
  final String title;

  const ImageViewerScreen({super.key, required this.url, this.title = ''});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: Text(title, style: const TextStyle(fontSize: 14), overflow: TextOverflow.ellipsis),
      ),
      body: Center(
        child: InteractiveViewer(
          minScale: 1,
          maxScale: 5,
          child: Image.network(
            url,
            loadingBuilder: (context, child, progress) =>
                progress == null ? child : const Center(child: CircularProgressIndicator()),
            errorBuilder: (_, __, ___) => const Icon(Icons.broken_image_outlined, size: 64, color: Colors.white54),
          ),
        ),
      ),
    );
  }
}
