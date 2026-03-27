const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let soundEnabled = true;

// Init audio context on first user interaction (browser policy)
let initialized = false;
function initAudio() {
  if (!initialized) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    initialized = true;
  }
}

document.addEventListener('click', initAudio, { once: true });

function playTone(freq, type, duration, vol = 0.5, slideFreq = null) {
  if (!soundEnabled) return;
  if(audioCtx.state === 'suspended') audioCtx.resume();
  
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
  if (slideFreq) {
    osc.frequency.exponentialRampToValueAtTime(slideFreq, audioCtx.currentTime + duration);
  }
  
  gain.gain.setValueAtTime(vol, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
  
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

// Noise generator for cards/swipes
function playNoise(duration, vol) {
  if (!soundEnabled) return;
  if(audioCtx.state === 'suspended') audioCtx.resume();
  
  const bufferSize = audioCtx.sampleRate * duration;
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  
  const noiseSource = audioCtx.createBufferSource();
  noiseSource.buffer = buffer;
  
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1000;
  
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(vol, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
  
  noiseSource.connect(filter);
  filter.connect(gain);
  gain.connect(audioCtx.destination);
  
  noiseSource.start();
}

const SFX = {
  click: () => playTone(600, 'sine', 0.05, 0.1),
  chip: () => {
    // Two quick high pitches for a chip clink
    playTone(2000, 'sine', 0.05, 0.1);
    setTimeout(() => playTone(2500, 'sine', 0.08, 0.05), 30);
  },
  cardSlide: () => {
    playNoise(0.15, 0.15);
  },
  win: () => {
    // Cheerful arpeggio
    playTone(523.25, 'sine', 0.1, 0.2); // C5
    setTimeout(() => playTone(659.25, 'sine', 0.1, 0.2), 100); // E5
    setTimeout(() => playTone(783.99, 'sine', 0.4, 0.2), 200); // G5
    setTimeout(() => playTone(1046.50, 'sine', 0.6, 0.2), 300); // C6
  },
  lose: () => {
    // Sad slide down
    playTone(300, 'sawtooth', 0.4, 0.2, 100);
  },
  rouletteSpin: () => {
    let delay = 0;
    for(let i=0; i<15; i++){
      setTimeout(() => playNoise(0.02, 0.2), delay);
      delay += 50 + (i * 20); // slows down
    }
  },
  rouletteWin: () => {
    playTone(800, 'square', 0.1, 0.1);
    setTimeout(() => playTone(1200, 'square', 0.4, 0.1), 100);
  }
};

window.SFX = SFX;
window.toggleSound = function() {
  soundEnabled = !soundEnabled;
  return soundEnabled;
};
