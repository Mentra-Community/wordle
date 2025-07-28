import {
  AppServer,
  AppSession,
  StreamType,
  ViewType,
  createTranscriptionStream,
} from "@mentra/sdk";
import { getRandomWord, isValidWord } from './words';
import { create1BitBMP, createCanvas, drawRect } from './bitmap';
import { drawText, getTextWidth } from './font';

const PACKAGE_NAME =
  process.env.PACKAGE_NAME ??
  (() => {
    throw new Error("PACKAGE_NAME is not set in .env file");
  })();
const MENTRAOS_API_KEY =
  process.env.MENTRAOS_API_KEY ??
  (() => {
    throw new Error("MENTRAOS_API_KEY is not set in .env file");
  })();
const PORT = parseInt(process.env.PORT || "3000");

enum GameState {
  PLAYING = 'PLAYING',
  WON = 'WON',
  LOST = 'LOST',
  WAITING_RESTART = 'WAITING_RESTART'
}

enum LetterState {
  EMPTY = 'EMPTY',
  CORRECT = 'CORRECT',      // Green - right letter, right position
  PRESENT = 'PRESENT',      // Yellow - right letter, wrong position
  ABSENT = 'ABSENT'         // Gray - letter not in word
}

interface GuessedLetter {
  letter: string;
  state: LetterState;
}

interface WordleGame {
  targetWord: string;
  guesses: GuessedLetter[][];
  currentGuess: string;
  currentRow: number;
  state: GameState;
  maxGuesses: number;
  keyboardState: Map<string, LetterState>;
  previousGuesses: Set<string>;
}

class WordleManager {
  private games: Map<string, WordleGame> = new Map();

  createGame(userId: string): WordleGame {
    const game: WordleGame = {
      targetWord: getRandomWord(),
      guesses: [],
      currentGuess: '',
      currentRow: 0,
      state: GameState.PLAYING,
      maxGuesses: 6,
      keyboardState: new Map(),
      previousGuesses: new Set()
    };
    
    // Initialize empty guesses
    for (let i = 0; i < game.maxGuesses; i++) {
      game.guesses[i] = [];
      for (let j = 0; j < 5; j++) {
        game.guesses[i][j] = { letter: '', state: LetterState.EMPTY };
      }
    }
    
    this.games.set(userId, game);
    console.log(`New Wordle game created. Target word: ${game.targetWord}`);
    return game;
  }

  getGame(userId: string): WordleGame | undefined {
    return this.games.get(userId);
  }

  processInput(userId: string, input: string): boolean {
    let game = this.getGame(userId);
    let stateChanged = false;
    
    if (!game) {
      game = this.createGame(userId);
      stateChanged = true;
    }

    const normalizedInput = input.trim().toUpperCase();

    if (game && game.state === GameState.WAITING_RESTART) {
      if (normalizedInput.includes('PLAY AGAIN') || normalizedInput.includes('NEW GAME')) {
        this.createGame(userId);
        return true;
      }
      return false;
    }

    if (game!.state !== GameState.PLAYING) {
      return false;
    }

    // Extract 5-letter word from input - take the LAST valid word
    const words = normalizedInput.split(' ');
    let fiveLetterWord: string | undefined;
    
    // Iterate through all words to find the last valid 5-letter word
    for (const word of words) {
      // Remove trailing punctuation (periods, commas, exclamation marks, question marks)
      const cleanWord = word.replace(/[.,!?]+$/, '');
      if (cleanWord.length === 5 && /^[A-Z]+$/.test(cleanWord)) {
        fiveLetterWord = cleanWord;
        // Don't break - continue to find the last one
      }
    }
    
    if (fiveLetterWord && isValidWord(fiveLetterWord)) {
      // Check if word has already been guessed
      if (game!.previousGuesses.has(fiveLetterWord)) {
        console.log(`Word "${fiveLetterWord}" has already been guessed`);
        return false;
      }
      // Submit the guess
      this.submitGuess(game!, fiveLetterWord);
      stateChanged = true;
    }
    
    return stateChanged;
  }

  private submitGuess(game: WordleGame, guess: string): void {
    // Add to previous guesses
    game.previousGuesses.add(guess);
    
    // Check each letter
    const targetLetters = game.targetWord.split('');
    const guessLetters = guess.split('');
    const result: GuessedLetter[] = [];
    
    // First pass: mark correct positions
    for (let i = 0; i < 5; i++) {
      if (guessLetters[i] === targetLetters[i]) {
        result[i] = { letter: guessLetters[i]!, state: LetterState.CORRECT };
        targetLetters[i] = '*'; // Mark as used
        game.keyboardState.set(guessLetters[i]!, LetterState.CORRECT);
      } else {
        result[i] = { letter: guessLetters[i]!, state: LetterState.ABSENT };
      }
    }
    
    // Second pass: mark present letters
    for (let i = 0; i < 5; i++) {
      if (result[i]!.state === LetterState.ABSENT) {
        const index = targetLetters.indexOf(result[i]!.letter);
        if (index !== -1) {
          result[i]!.state = LetterState.PRESENT;
          targetLetters[index] = '*'; // Mark as used
          // Only update keyboard if not already marked as correct
          if (game.keyboardState.get(result[i]!.letter) !== LetterState.CORRECT) {
            game.keyboardState.set(result[i]!.letter, LetterState.PRESENT);
          }
        } else {
          // Update keyboard state for absent letters
          if (!game.keyboardState.has(result[i]!.letter)) {
            game.keyboardState.set(result[i]!.letter, LetterState.ABSENT);
          }
        }
      }
    }
    
    game.guesses[game.currentRow] = result;
    game.currentRow++;
    
    // Check win condition
    if (guess === game.targetWord) {
      game.state = GameState.WON;
      game.state = GameState.WAITING_RESTART;
    } else if (game.currentRow >= game.maxGuesses) {
      game.state = GameState.LOST;
      game.state = GameState.WAITING_RESTART;
    }
  }

  renderGameStateAsBase64(userId: string): string {
    const game = this.getGame(userId) || this.createGame(userId);
    const canvas = createCanvas(526, 100);

    // Draw game grid
    this.drawWordleGrid(canvas, game);
    
    // Draw keyboard state
    this.drawKeyboardHints(canvas, game);
    
    // Draw status message
    if (game.state === GameState.WAITING_RESTART) {
      this.drawStatusMessage(canvas, game);
    }

    const bitmapBuffer = create1BitBMP(526, 100, canvas);
    return bitmapBuffer.toString('base64');
  }

  private drawWordleGrid(canvas: boolean[][], game: WordleGame): void {
    const cellSize = 18;
    const cellSpacing = 3;
    const startY = 10;
    
    for (let row = 0; row < game.maxGuesses; row++) {
      // First 3 rows on the left, last 3 rows on the right
      const isLeftSide = row < 3;
      const startX = isLeftSide ? 10 : 125;
      const adjustedRow = isLeftSide ? row : row - 3;
      
      for (let col = 0; col < 5; col++) {
        const x = startX + col * (cellSize + cellSpacing);
        const y = startY + adjustedRow * (cellSize + cellSpacing);
        
        const guess = game.guesses[row]?.[col];
        if (!guess) continue;
        
        if (guess.state === LetterState.CORRECT) {
          // Fill square for correct letters
          drawRect(canvas, x, y, cellSize, cellSize, true, true);
          // Draw letter in black on white
          if (guess.letter) {
            drawText(canvas, guess.letter, x + 4, y + 4, 2);
            // Invert the letter pixels
            for (let dy = 0; dy < 14; dy++) {
              for (let dx = 0; dx < 10; dx++) {
                const px = x + 4 + dx;
                const py = y + 4 + dy;
                if (py < canvas.length && px < canvas[0]!.length && canvas[py] && canvas[py][px] !== undefined) {
                  canvas[py][px] = !canvas[py][px];
                }
              }
            }
          }
        } else if (guess.state === LetterState.PRESENT) {
          // Draw thick border for present letters
          drawRect(canvas, x, y, cellSize, cellSize, false, true);
          drawRect(canvas, x+1, y+1, cellSize-2, cellSize-2, false, true);
          if (guess.letter) {
            drawText(canvas, guess.letter, x + 4, y + 4, 2);
          }
        } else {
          // Draw normal border
          drawRect(canvas, x, y, cellSize, cellSize, false, true);
          if (guess.letter) {
            drawText(canvas, guess.letter, x + 4, y + 4, 2);
          }
        }
      }
    }
  }

  private drawKeyboardHints(canvas: boolean[][], game: WordleGame): void {
    const startX = 240;
    const startY = 10;
    
    drawText(canvas, 'LETTERS:', startX, startY, 2);
    
    let y = startY + 18;
    let x = startX;
    
    // Group letters by state
    const correct: string[] = [];
    const present: string[] = [];
    const absent: string[] = [];
    
    game.keyboardState.forEach((state, letter) => {
      if (state === LetterState.CORRECT) correct.push(letter);
      else if (state === LetterState.PRESENT) present.push(letter);
      else if (state === LetterState.ABSENT) absent.push(letter);
    });
    
    // Draw correct letters (filled)
    if (correct.length > 0) {
      drawText(canvas, 'COR', x, y, 2);
      drawText(canvas, correct.sort().join(' '), x + 50, y, 2);
      y += 18;
    }
    
    // Draw present letters
    if (present.length > 0) {
      drawText(canvas, 'POS', x, y, 2);
      drawText(canvas, present.sort().join(' '), x + 50, y, 2);
      y += 18;
    }
    
    // Draw absent letters
    if (absent.length > 0) {
      drawText(canvas, 'WRG', x, y, 2);
      const absentText = absent.sort().join(' ');
      // Split into multiple lines if too long
      const maxCharsPerLine = 15;
      let lineY = y;
      for (let i = 0; i < absentText.length; i += maxCharsPerLine) {
        drawText(canvas, absentText.substring(i, i + maxCharsPerLine), x + 50, lineY, 2);
        lineY += 18;
      }
    }
  }

  private drawStatusMessage(canvas: boolean[][], game: WordleGame): void {
    let message = '';
    if (game.state === GameState.WAITING_RESTART) {
      const won = game.guesses[game.currentRow - 1]?.every(g => g.state === LetterState.CORRECT);
      if (won) {
        message = `YOU WIN! SAY "PLAY AGAIN"`;
      } else {
        message = `WORD: ${game.targetWord}. SAY "NEW GAME"`;
      }
    }
    
    const scale = 2;
    const textWidth = getTextWidth(message, scale);
    // const x = Math.floor((526 - textWidth) / 2);
    const x = 10;
    drawText(canvas, message, x, 85, scale);
  }

  deleteGame(userId: string): void {
    this.games.delete(userId);
  }
}

// Global game manager instance
const wordleManager = new WordleManager();

class WordleApp extends AppServer {
  constructor() {
    super({
      packageName: PACKAGE_NAME,
      apiKey: MENTRAOS_API_KEY,
      port: PORT,
    });
  }

  protected override async onSession(
    session: AppSession,
    sessionId: string,
    userId: string
  ): Promise<void> {
    console.log(`🎮 Received Wordle session request for user ${userId}, session ${sessionId}`);

    try {
      // Sanitize userId
      const sanitizedUserId = userId.replace(/\./g, '_');

      // Create or get game for this user
      wordleManager.getGame(sanitizedUserId) || wordleManager.createGame(sanitizedUserId);

      // Subscribe to transcription events
      const transcriptionStream = createTranscriptionStream("en-US") as unknown as StreamType;
      session.subscribe(transcriptionStream);

      // Register transcription handler
      const cleanup = session.events.onTranscription((data: any) => {
        this.handleTranscription(session, sessionId, sanitizedUserId, data);
      });

      // Add cleanup handler
      this.addCleanupHandler(cleanup);

      // Show initial game state
      this.updateDisplay(session, sanitizedUserId);
      
      // Show instructions
      console.log(`Wordle session initialized. Say a 5-letter word to make a guess!`);
      
    } catch (error) {
      console.error('Error initializing session:', error);
    }
  }

  protected override async onStop(sessionId: string, userId: string, reason: string): Promise<void> {
    console.log(`💥 Session termination - User: ${userId}, Session: ${sessionId}, Reason: ${reason}`);
    
    try {
      const sanitizedUserId = userId.replace(/\./g, '_');
      wordleManager.deleteGame(sanitizedUserId);
      console.log(`✅ Game cleaned up for user ${sanitizedUserId}`);
    } catch (error) {
      console.error(`❌ Error during session cleanup:`, error);
    }
  }

  private handleTranscription(
    session: AppSession, 
    sessionId: string, 
    userId: string, 
    transcriptionData: any
  ): void {
    const isFinal = transcriptionData.isFinal;
    const text = transcriptionData.text.toLowerCase().trim();

    console.log(`[Session ${sessionId}]: Received transcription - ${text} (isFinal: ${isFinal})`);
    
    // Only process final transcriptions
    if (!isFinal) return;
    
    // Process the input
    const stateChanged = wordleManager.processInput(userId, text);
    
    // Update the display only if state changed
    if (stateChanged) {
      console.log(`[Session ${sessionId}]: Game state changed, updating display`);
      this.updateDisplay(session, userId);
    }
  }

  private updateDisplay(session: AppSession, userId: string): void {
    try {
      const base64Bitmap = wordleManager.renderGameStateAsBase64(userId);
      session.layouts.showBitmapView(base64Bitmap, {view: ViewType.MAIN});
      
    } catch (error) {
      console.error('Error updating display:', error);
    }
  }
}

// Create and start the app
const wordleApp = new WordleApp();

// Add a route to verify the server is running
const expressApp = wordleApp.getExpressApp();
expressApp.get('/health', (_req: any, res: any) => {
  res.json({ status: 'healthy', app: PACKAGE_NAME });
});

// Start the server
wordleApp.start().then(() => {
  console.log(`🎮 Wordle app running on port ${PORT}`);
}).catch(error => {
  console.error('Failed to start server:', error);
});