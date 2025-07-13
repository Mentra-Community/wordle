import { AppServer, AppSession, BitmapUtils, AnimationUtils } from '@mentra/sdk';

const PACKAGE_NAME = process.env.PACKAGE_NAME ?? (() => { throw new Error('PACKAGE_NAME is not set in .env file'); })();
const MENTRAOS_API_KEY = process.env.MENTRAOS_API_KEY ?? (() => { throw new Error('MENTRAOS_API_KEY is not set in .env file'); })();
const PORT = parseInt(process.env.PORT || '3000');

class ExampleMentraOSApp extends AppServer {
  private animationControllers = new Map<string, { stop: () => void }>();

  constructor() {
    super({
      packageName: PACKAGE_NAME,
      apiKey: MENTRAOS_API_KEY,
      port: PORT,
    });
  }

  private stopAnimation(sessionId: string): void {
    if (this.animationControllers.has(sessionId)) {
      const controller = this.animationControllers.get(sessionId)!;
      controller.stop();
      this.animationControllers.delete(sessionId);
    }
  }

  protected async onSession(session: AppSession, sessionId: string, userId: string): Promise<void> {
    console.log(`Session started for user: ${userId}, sessionId: ${sessionId}`);
    
    // Stop any existing animations for this user to prevent overlaps
    this.animationControllers.forEach((controller, existingSessionId) => {
      if (existingSessionId.startsWith(userId)) {
        console.log(`🛑 Stopping existing animation for session: ${existingSessionId}`);
        controller.stop();
        this.animationControllers.delete(existingSessionId);
      }
    });
    
    try {
      // Demo sequence showcasing MentraOS capabilities
      console.log("🚀 Starting MentraOS demo sequence...");
      
      // Step 1: Welcome message
      session.layouts.showTextWall("Welcome to MentraOS!\n\nBitmap Demo Starting...", { durationMs: 3000 });
      await AnimationUtils.delay(3500);
      
      // Step 2: Clear and show single bitmap
      session.layouts.clearView();
      await AnimationUtils.delay(500);
      
      const frameHex = await BitmapUtils.loadBmpAsHex('./assets/animations/animation_10_frame_1.bmp');
      const validation = BitmapUtils.validateBmpHex(frameHex);
      
      if (!validation.isValid) {
        console.error(`❌ Frame validation failed: ${validation.errors.join(', ')}`);
        session.layouts.showTextWall("Error: Invalid bitmap data");
        return;
      }
      
      console.log(`✅ Loaded bitmap: ${validation.byteCount} bytes, ${validation.blackPixels} black pixels`);
      session.layouts.showBitmapView(frameHex, { durationMs: 5000 });
      await AnimationUtils.delay(5500);
      
      // Step 3: Animation preparation
      session.layouts.showTextWall("Loading animation...\n\n10 frames at 1650ms intervals", { durationMs: 2000 });
      await AnimationUtils.delay(2500);
      
      // Step 4: Start optimized animation using SDK utilities
      const config = AnimationUtils.getOptimizedConfig('even-realities-g1');
      config.repeat = true;
      config.onStart = () => console.log('🎬 Animation started');
      config.onFrame = (frame, total) => console.log(`📽️ Frame ${frame + 1}/${total}`);
      config.onError = (error) => console.error(`❌ Animation error: ${error}`);

      const animation = await AnimationUtils.createBitmapAnimation(
        session,
        './assets/animations',
        10,
        config
      );
      
      this.animationControllers.set(sessionId, animation);
      console.log("✅ Demo complete! Animation now looping at optimized 1650ms intervals.");
      
    } catch (error) {
      console.error("❌ Error in demo sequence:", error);
      session.layouts.showTextWall("Demo failed to load");
    }

    // Monitor glasses battery
    session.events.onGlassesBattery((data) => {
      console.log('Glasses battery:', data);
    });

    // Cleanup on server shutdown
    process.on('SIGINT', () => {
      console.log(`🔌 Cleaning up session ${sessionId}`);
      this.stopAnimation(sessionId);
    });
  }
}

// Start the server
// DEV CONSOLE: https://console.mentra.glass/
const app = new ExampleMentraOSApp();
app.start().catch(console.error);