'use strict';

const TARGET = 'התארסנו';
const COLS = 7;
const ROWS = 6;
const HEBREW_REGEX = /[\u0590-\u05FF]/;

const KEYBOARD_LAYOUT = [
  ['/', "'", 'ק', 'ר', 'א', 'ט', 'ו', 'ן'],
  ['ם', 'פ', 'ף', 'ך', 'ל', 'ח', 'י', 'ע', 'כ', 'ג', 'ד', 'ש'],
  ['BACKSPACE', 'ז', 'ס', 'ב', 'ה', 'נ', 'מ', 'צ', 'ת'],
  ['ENTER']
];

const KEYBOARD_STATE_PRIORITY = { correct: 3, present: 2, absent: 1 };

let currentRow = 0;
let currentCol = 0;
let row6Locked = false;
let gameWon = false;
let tiles = [];
let keyboardState = {};

let mediaStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let recordingStartTime = null;

const cameraBlock = document.getElementById('camera-block');
const gameContainer = document.getElementById('game-container');
const boardEl = document.getElementById('board');
const keyboardEl = document.getElementById('keyboard');
const winOverlay = document.getElementById('win-overlay');
const recorderVideo = document.getElementById('recorder-video');

document.addEventListener('DOMContentLoaded', init);

async function init() {
  buildBoard();
  buildKeyboard();
  document.addEventListener('keydown', handlePhysicalKeyboard);

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, frameRate: 15 },
      audio: true
    });
    showGame();
    startRecording();
  } catch {
    showCameraBlock();
  }
}

function showCameraBlock() {
  cameraBlock.classList.remove('hidden');
  gameContainer.classList.add('hidden');
}

function showGame() {
  cameraBlock.classList.add('hidden');
  gameContainer.classList.remove('hidden');
}

function buildBoard() {
  boardEl.innerHTML = '';
  tiles = [];

  for (let r = 0; r < ROWS; r++) {
    const rowEl = document.createElement('div');
    rowEl.className = 'board-row';
    rowEl.dataset.row = r;
    const rowTiles = [];

    for (let c = 0; c < COLS; c++) {
      const tile = document.createElement('div');
      tile.className = 'tile';
      tile.dataset.row = r;
      tile.dataset.col = c;
      tile.innerHTML = `
        <div class="tile-inner">
          <div class="tile-face tile-front"></div>
          <div class="tile-face tile-back"></div>
        </div>
      `;
      rowEl.appendChild(tile);
      rowTiles.push(tile);
    }

    boardEl.appendChild(rowEl);
    tiles.push(rowTiles);
  }
}

function buildKeyboard() {
  keyboardEl.innerHTML = '';

  KEYBOARD_LAYOUT.forEach((row) => {
    const rowEl = document.createElement('div');
    rowEl.className = 'keyboard-row';

    row.forEach((key) => {
      const btn = document.createElement('button');
      btn.type = 'button';

      if (key === 'BACKSPACE') {
        btn.className = 'key key-wide';
        btn.textContent = 'מחק';
        btn.dataset.key = 'BACKSPACE';
        btn.addEventListener('click', () => handleBackspace());
      } else if (key === 'ENTER') {
        btn.className = 'key key-enter';
        btn.textContent = 'Enter';
        btn.dataset.key = 'ENTER';
        btn.addEventListener('click', () => handleEnter());
      } else {
        btn.className = 'key';
        btn.textContent = key;
        btn.dataset.key = key;
        btn.addEventListener('click', () => handleLetter(key));
      }

      rowEl.appendChild(btn);
    });

    keyboardEl.appendChild(rowEl);
  });
}

function handlePhysicalKeyboard(e) {
  if (gameWon || gameContainer.classList.contains('hidden')) return;

  if (e.key === 'Enter') {
    e.preventDefault();
    handleEnter();
    return;
  }

  if (e.key === 'Backspace') {
    e.preventDefault();
    handleBackspace();
    return;
  }

  if (HEBREW_REGEX.test(e.key)) {
    e.preventDefault();
    handleLetter(e.key);
  }
}

function handleLetter(letter) {
  if (gameWon) return;

  if (row6Locked && currentRow === ROWS - 1) {
    clearRow(currentRow);
    row6Locked = false;
    currentCol = 0;
  }

  if (currentCol >= COLS) return;

  const tile = tiles[currentRow][currentCol];
  tile.querySelector('.tile-front').textContent = letter;
  tile.classList.add('filled');
  currentCol++;
}

function handleBackspace() {
  if (gameWon) return;

  if (row6Locked && currentRow === ROWS - 1) {
    clearRow(currentRow);
    row6Locked = false;
    currentCol = 0;
    return;
  }

  if (currentCol === 0) return;

  currentCol--;
  const tile = tiles[currentRow][currentCol];
  tile.querySelector('.tile-front').textContent = '';
  tile.classList.remove('filled');
}

function handleEnter() {
  if (gameWon) return;

  if (row6Locked && currentRow === ROWS - 1) return;

  if (currentCol < COLS) {
    showToast('יש להזין 7 אותיות');
    shakeRow(currentRow);
    return;
  }

  const guess = getGuess(currentRow);

  if (guess === TARGET) {
    evaluateGuess(currentRow, guess, true);
    return;
  }

  evaluateGuess(currentRow, guess, false);

  if (currentRow === ROWS - 1) {
    row6Locked = true;
    currentCol = COLS;
  } else {
    currentRow++;
    currentCol = 0;
  }
}

function getGuess(row) {
  let guess = '';
  for (let c = 0; c < COLS; c++) {
    guess += tiles[row][c].querySelector('.tile-front').textContent;
  }
  return guess;
}

function clearRow(row) {
  for (let c = 0; c < COLS; c++) {
    const tile = tiles[row][c];
    tile.querySelector('.tile-front').textContent = '';
    tile.querySelector('.tile-back').textContent = '';
    tile.className = 'tile';
  }
}

function evaluateGuess(row, guess, isWin) {
  const results = scoreGuess(guess);
  const flipDelay = 300;

  results.forEach((state, col) => {
    const tile = tiles[row][col];
    const letter = guess[col];

    setTimeout(() => {
      tile.querySelector('.tile-back').textContent = letter;
      tile.classList.add('flipped', state);
      updateKeyboardState(letter, state);
    }, col * flipDelay);
  });

  const totalDelay = COLS * flipDelay + 400;

  if (isWin) {
    setTimeout(() => onWin(), totalDelay);
  }
}

function scoreGuess(guess) {
  const result = new Array(COLS).fill('absent');
  const targetArr = TARGET.split('');
  const guessArr = guess.split('');
  const remaining = {};

  targetArr.forEach((ch) => {
    remaining[ch] = (remaining[ch] || 0) + 1;
  });

  for (let i = 0; i < COLS; i++) {
    if (guessArr[i] === targetArr[i]) {
      result[i] = 'correct';
      remaining[guessArr[i]]--;
    }
  }

  for (let i = 0; i < COLS; i++) {
    if (result[i] === 'correct') continue;
    const ch = guessArr[i];
    if (remaining[ch] > 0) {
      result[i] = 'present';
      remaining[ch]--;
    }
  }

  return result;
}

function updateKeyboardState(letter, state) {
  const current = keyboardState[letter];
  const currentPriority = current ? KEYBOARD_STATE_PRIORITY[current] : 0;
  const newPriority = KEYBOARD_STATE_PRIORITY[state];

  if (newPriority >= currentPriority) {
    keyboardState[letter] = state;
  }

  document.querySelectorAll(`.key[data-key="${letter}"]`).forEach((keyEl) => {
    keyEl.classList.remove('correct', 'present', 'absent');
    keyEl.classList.add(keyboardState[letter]);
  });
}

function shakeRow(row) {
  tiles[row].forEach((tile) => {
    tile.classList.add('shake');
    setTimeout(() => tile.classList.remove('shake'), 500);
  });
}

function showToast(message) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}

function onWin() {
  gameWon = true;
  launchConfetti();
  gameContainer.classList.add('game-blurred');
  winOverlay.classList.remove('hidden');
  requestAnimationFrame(() => {
    winOverlay.classList.add('visible');
    winOverlay.setAttribute('aria-hidden', 'false');
  });

  setTimeout(() => {
    stopRecordingAndUpload();
  }, 5000);
}

function launchConfetti() {
  const duration = 4000;
  const end = Date.now() + duration;

  const colors = ['#d4af37', '#f5e6a3', '#538d4e', '#e63946', '#ffffff', '#c9a0a0'];

  (function frame() {
    confetti({
      particleCount: 4,
      angle: 60,
      spread: 70,
      origin: { x: 0, y: 0.6 },
      colors
    });
    confetti({
      particleCount: 4,
      angle: 120,
      spread: 70,
      origin: { x: 1, y: 0.6 },
      colors
    });

    if (Date.now() < end) {
      requestAnimationFrame(frame);
    }
  })();

  setTimeout(() => {
    confetti({
      particleCount: 120,
      spread: 100,
      origin: { y: 0.5 },
      colors
    });
  }, 300);

  setTimeout(() => {
    confetti({
      particleCount: 80,
      startVelocity: 35,
      spread: 360,
      ticks: 80,
      origin: { x: 0.5, y: 0.4 },
      colors
    });
  }, 800);
}

function getSupportedMimeType() {
  const types = [
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4'
  ];
  return types.find((t) => MediaRecorder.isTypeSupported(t)) || '';
}

function startRecording() {
  recorderVideo.srcObject = mediaStream;
  recorderVideo.play().catch(() => {});

  const mimeType = getSupportedMimeType();
  const options = {
    videoBitsPerSecond: 250000,
    audioBitsPerSecond: 64000
  };
  if (mimeType) options.mimeType = mimeType;

  try {
    mediaRecorder = new MediaRecorder(mediaStream, options);
  } catch {
    mediaRecorder = new MediaRecorder(mediaStream);
  }

  recordedChunks = [];
  recordingStartTime = Date.now();

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) recordedChunks.push(e.data);
  };

  mediaRecorder.start(1000);
}

function stopRecordingAndUpload() {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') return;

  mediaRecorder.onstop = async () => {
    const mimeType = mediaRecorder.mimeType || 'video/webm';
    const blob = new Blob(recordedChunks, { type: mimeType });
    const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
    const filename = `reaction-${Date.now()}.${ext}`;

    // --- הגדרות Supabase ---
    // הדבק כאן את הנתונים מהפרויקט שלך
    const SUPABASE_URL = 'https://pgbeorlioywyufpeinnk.supabase.co'; 
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBnYmVvcmxpb3l3eXVmcGVpbm5rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3MjcyMjIsImV4cCI6MjEwMjMwMzIyMn0.x3AwnAAxUbz66CS6jsrwp4GCcTCu5eim75xv-6yrxLo';
    const BUCKET_NAME = 'videos';

    try {
      // שליחה ישירה ל-API של Supabase Storage
      const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET_NAME}/${filename}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'apikey': SUPABASE_ANON_KEY,
          'Content-Type': mimeType
        },
        body: blob
      });
      
      if (res.ok) {
        console.log('Video saved to Supabase successfully!');
      } else {
        const errorData = await res.json();
        console.error('Supabase upload failed:', errorData);
      }
    } catch (err) {
      console.error('Upload error:', err);
    }

    mediaStream.getTracks().forEach((track) => track.stop());
  };

  mediaRecorder.stop();
}
