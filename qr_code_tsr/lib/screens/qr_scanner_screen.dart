import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

class QrScannerScreen extends StatefulWidget {
  const QrScannerScreen({super.key});

  @override
  State<QrScannerScreen> createState() => _QrScannerScreenState();
}

class _QrScannerScreenState extends State<QrScannerScreen> {
  final MobileScannerController _controller = MobileScannerController();
  bool _handled = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _handleBarcode(BarcodeCapture capture) {
    if (_handled) return;
    final barcode = capture.barcodes.firstOrNull;
    final value = barcode?.rawValue;
    if (value == null || value.isEmpty) return;

    _handled = true;
    Navigator.of(context).pop(value);
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;
    final scanAreaSize = 280.0;
    final borderWidth = 60.0;

    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          // Camera feed
          MobileScanner(controller: _controller, onDetect: _handleBarcode),

          // Semi-transparent overlay with clear center frame
          Positioned.fill(
            child: Stack(
              children: [
                // Top semi-transparent border
                Positioned(
                  top: 0,
                  left: 0,
                  right: 0,
                  height: (size.height - scanAreaSize) / 2,
                  child: Container(color: Colors.white.withOpacity(0.15)),
                ),

                // Bottom semi-transparent border
                Positioned(
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: (size.height - scanAreaSize) / 2 - 80,
                  child: Container(color: Colors.white.withOpacity(0.15)),
                ),

                // Left semi-transparent border
                Positioned(
                  left: 0,
                  top: (size.height - scanAreaSize) / 2,
                  width: borderWidth,
                  height: scanAreaSize,
                  child: Container(color: Colors.white.withOpacity(0.15)),
                ),

                // Right semi-transparent border
                Positioned(
                  right: 0,
                  top: (size.height - scanAreaSize) / 2,
                  width: borderWidth,
                  height: scanAreaSize,
                  child: Container(color: Colors.white.withOpacity(0.15)),
                ),

                // Clear frame border outline
                Positioned(
                  top: (size.height - scanAreaSize) / 2,
                  left: borderWidth,
                  width: size.width - (2 * borderWidth),
                  height: scanAreaSize,
                  child: Container(
                    decoration: BoxDecoration(
                      border: Border.all(
                        color: Colors.white.withOpacity(0.7),
                        width: 3,
                      ),
                      borderRadius: BorderRadius.circular(16),
                    ),
                  ),
                ),
              ],
            ),
          ),

          // Back button
          Positioned(
            top: 16,
            left: 16,
            child: SafeArea(
              child: FloatingActionButton.small(
                onPressed: () => Navigator.of(context).pop(),
                backgroundColor: Colors.white.withOpacity(0.9),
                foregroundColor: Colors.black,
                child: const Icon(Icons.arrow_back),
              ),
            ),
          ),

          // Instruction text at bottom
          Align(
            alignment: Alignment.bottomCenter,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 10,
                ),
                decoration: BoxDecoration(
                  color: Colors.black.withOpacity(0.6),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: const Text(
                  'Cadre le QR dans la zone pour scanner',
                  style: TextStyle(color: Colors.white),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
