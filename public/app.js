/* ===== CASINO ROYAL - Client App ===== */
const socket = io();

let currentRoom = null;
let myId = null;
let myName = '';
let currentGame = null;
let betAmount = 0;
let showingResults = false;
let resultsTimer = null;
let isHost = false;

// ===== SCREEN MANAGEMENT =====
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(`screen-${name}`).classList.add('active');
}

function notify(msg, type = 'info') {
  const el = document.getElementById('notification');
  el.textContent = msg;
  el.className = `notification ${type}`;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3000);
}

// ===== VALUE/SUIT HELPERS =====
const SUITS = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
const VALUES = { 2:'2',3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'V',12:'D',13:'R',14:'A' };
const REDS = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];

function cardHTML(card) {
  if (!card || card.value === 0 || card.suit === 'back') return '<div class="card back"></div>';
  const suit = SUITS[card.suit] || '';
  const val = VALUES[card.value] || card.value;
  return `<div class="card ${card.suit}"><span class="card-value">${val}</span><span class="card-suit">${suit}</span></div>`;
}

function cardsHTML(cards) {
  return `<div class="card-container">${(cards||[]).map(c => cardHTML(c)).join('')}</div>`;
}

// ===== PLAYERS BAR =====
function updatePlayersBar(players) {
  const bar = document.getElementById('players-bar');
  if (!bar || !players) return;
  bar.innerHTML = players.map(p => {
    const isMe = p.id === socket.id;
    return `<div class="pb-player ${isMe ? 'pb-me' : ''}">
      <span class="pb-name">${isMe ? '👤 ' : ''}${p.name}</span>
      <span class="pb-money">${p.money} €</span>
    </div>`;
  }).join('');
}

// ===== BET SECTION HELPER =====
function betSectionHTML(title, subtitle = '') {
  return `
    <div class="bet-section glass">
      <h3>${title}</h3>
      ${subtitle ? `<p class="muted" style="margin-bottom:12px">${subtitle}</p>` : ''}
      <div class="bet-chips">
        <div class="chip c10" onclick="addBet(10)">10</div>
        <div class="chip c25" onclick="addBet(25)">25</div>
        <div class="chip c50" onclick="addBet(50)">50</div>
        <div class="chip c100" onclick="addBet(100)">100</div>
        <div class="chip c500" onclick="addBet(500)">500</div>
      </div>
      <div class="bet-amount" id="bet-display">${betAmount} €</div>
      <div class="bet-manual-input">
        <span class="muted">ou saisir:</span>
        <input type="number" id="bet-manual" value="${betAmount}" min="1" step="1" onchange="setBetFromInput()">
        <span class="currency">€</span>
      </div>
      <div class="bet-buttons">
        <button class="btn btn-ghost" onclick="resetBet()">Effacer</button>
        <button class="btn btn-primary" onclick="confirmBet()">Miser</button>
      </div>
    </div>`;
}

window.addBet = function(amount) { betAmount += amount; updateBetDisplay(); };
window.resetBet = function() { betAmount = 0; updateBetDisplay(); };
window.setBetFromInput = function() {
  const v = parseInt(document.getElementById('bet-manual')?.value || 0);
  if (v > 0) betAmount = v;
  updateBetDisplay();
};

function updateBetDisplay() {
  const el = document.getElementById('bet-display');
  if (el) el.textContent = `${betAmount} €`;
  const inp = document.getElementById('bet-manual');
  if (inp) inp.value = betAmount;
}

function clearResultsState() {
  showingResults = false;
  if (resultsTimer) { clearTimeout(resultsTimer); resultsTimer = null; }
}

// ===== HOME =====
document.getElementById('btn-create').onclick = () => {
  const name = document.getElementById('player-name').value.trim();
  if (!name) return notify('Entrez un pseudo !', 'error');
  myName = name;
  socket.emit('create-room', { playerName: name });
};

document.getElementById('btn-join').onclick = () => {
  const name = document.getElementById('player-name').value.trim();
  const code = document.getElementById('room-code').value.trim().toUpperCase();
  if (!name) return notify('Entrez un pseudo !', 'error');
  if (!code || code.length !== 4) return notify('Entrez un code de salle valide !', 'error');
  myName = name;
  socket.emit('join-room', { roomId: code, playerName: name });
};

document.getElementById('player-name').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-create').click();
});
document.getElementById('room-code').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-join').click();
});

// ===== LOBBY =====
socket.on('room-joined', (room) => {
  currentRoom = room;
  myId = socket.id;
  isHost = room.isHost;
  showScreen('lobby');
  updateLobby();
});

socket.on('room-update', (room) => {
  currentRoom = room;
  isHost = room.isHost;
  updateLobby();
});

function updateLobby() {
  const r = currentRoom;
  document.getElementById('lobby-room-id').textContent = r.id;

  const pl = document.getElementById('lobby-players');
  pl.innerHTML = r.players.map(p => `
    <div class="player-item">
      <div class="player-avatar">${p.name.charAt(0).toUpperCase()}</div>
      <span class="name">${p.name}</span>
      <span class="money-tag">${p.money} €</span>
      ${p.id === r.hostId ? '<span class="badge">HÔTE</span>' : ''}
    </div>
  `).join('');

  document.getElementById('lobby-settings').classList.toggle('hidden', !r.isHost);
  document.getElementById('lobby-settings-guest').classList.toggle('hidden', r.isHost);

  document.querySelectorAll('.game-option').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.game === r.gameType);
  });

  const btnStart = document.getElementById('btn-start');
  btnStart.classList.toggle('hidden', !r.isHost);
  if (r.isHost && r.gameType) btnStart.disabled = false;

  if (r.startMoney) document.getElementById('start-money').value = r.startMoney;
  const wcSel = document.getElementById('win-condition');
  if (wcSel && r.winCondition) wcSel.value = r.winCondition;

  // Guest info
  const guestDiv = document.getElementById('lobby-settings-guest');
  if (!r.isHost && guestDiv) {
    const gameLabel = r.gameType ? { blackjack: 'Blackjack', poker: 'Poker', ultimate: 'Ultimate', roulette: 'Roulette' }[r.gameType] : 'non choisi';
    const condLabel = { none: 'Pas de limite', first_zero: 'Premier à 0€', first_x2: 'Premier à x2', first_x5: 'Premier à x5', first_x10: 'Premier à x10' }[r.winCondition] || 'Pas de limite';
    guestDiv.innerHTML = `
      <p class="muted">Jeu: <strong style="color:var(--gold)">${gameLabel}</strong></p>
      <p class="muted">Argent: <strong style="color:var(--gold)">${r.startMoney} €</strong></p>
      <p class="muted">Condition: <strong style="color:var(--gold)">${condLabel}</strong></p>
      <p class="muted" style="margin-top:12px">⏳ En attente que l'hôte lance la partie...</p>
    `;
  }
}

document.getElementById('game-select').addEventListener('click', (e) => {
  const btn = e.target.closest('.game-option');
  if (!btn) return;
  socket.emit('update-settings', { gameType: btn.dataset.game });
});
document.getElementById('start-money').addEventListener('change', (e) => {
  socket.emit('update-settings', { startMoney: parseInt(e.target.value) });
});
document.getElementById('win-condition').addEventListener('change', (e) => {
  socket.emit('update-settings', { winCondition: e.target.value });
});
document.getElementById('btn-start').onclick = () => {
  if (!currentRoom.gameType) return notify('Choisissez un jeu !', 'error');
  socket.emit('start-game');
};
document.getElementById('btn-leave').onclick = () => {
  socket.emit('leave-room');
  currentRoom = null;
  showScreen('home');
};
document.getElementById('btn-back-lobby').onclick = () => {
  socket.emit('back-to-lobby');
};

socket.on('back-to-lobby', () => {
  showScreen('lobby');
  currentGame = null;
  clearResultsState();
  document.getElementById('session-end-overlay').classList.add('hidden');
});

// ===== GAME =====
const GAME_NAMES = { blackjack: '🃏 Blackjack', poker: '♠️ Poker Texas Hold\'em', ultimate: '💎 Ultimate Poker', roulette: '🎡 Roulette' };

socket.on('game-started', ({ gameType }) => {
  currentGame = gameType;
  betAmount = 0;
  clearResultsState();
  showScreen('game');
  document.getElementById('game-type-label').textContent = GAME_NAMES[gameType] || gameType;
  document.getElementById('game-room-label').textContent = `Salle ${currentRoom.id}`;
});

socket.on('game-update', (state) => {
  if (!currentGame) return;
  if (state.isHost !== undefined) isHost = state.isHost;
  if (state.allPlayers) updatePlayersBar(state.allPlayers);
  const me = state.players?.find(p => p.id === socket.id);
  if (me) document.getElementById('my-money').textContent = `${me.money} €`;
  renderGame(state);
});

// Session end
socket.on('session-ended', ({ reason, players }) => {
  const overlay = document.getElementById('session-end-overlay');
  const title = document.getElementById('session-end-title');
  const body = document.getElementById('session-end-body');
  let msg = '';
  if (reason.type === 'zero') msg = `💀 ${reason.player} est tombé à 0 € !`;
  else msg = `🎉 ${reason.player} a atteint ${reason.type.toUpperCase()} (${reason.amount} €) !`;
  title.textContent = '🏆 Fin de la session !';
  body.innerHTML = `
    <p style="margin-bottom:16px;font-size:1.1rem">${msg}</p>
    ${players.sort((a, b) => b.money - a.money).map((p, i) => `
      <div class="result-item">
        <span>${i === 0 ? '👑 ' : ''}${p.name}</span>
        <span class="gold" style="font-weight:700">${p.money} €</span>
      </div>
    `).join('')}
  `;
  overlay.classList.remove('hidden');
});

socket.on('connect', () => {
  myId = socket.id;
  document.getElementById('session-end-overlay').classList.add('hidden');
});

function renderGame(state) {
  const area = document.getElementById('game-area');
  const ctrl = document.getElementById('game-controls');
  switch (currentGame) {
    case 'blackjack': renderBlackjack(state, area, ctrl); break;
    case 'poker': renderPoker(state, area, ctrl); break;
    case 'ultimate': renderUltimate(state, area, ctrl); break;
    case 'roulette': renderRoulette(state, area, ctrl); break;
  }
}

// ===== RESULTS HELPER (host-only: change game / end session) =====
function resultsHTML(title, items) {
  return `<div class="results-section">
    <div class="results-card glass">
      <h2>${title}</h2>
      ${items}
      <div class="results-actions">
        <button class="btn btn-primary" onclick="nextRound()">Nouvelle manche</button>
        ${isHost ? '<button class="btn btn-ghost" onclick="socket.emit(\'back-to-lobby\')">Changer de jeu</button>' : ''}
        ${isHost ? '<button class="btn btn-danger btn-sm" onclick="socket.emit(\'end-session\')">Fin de session</button>' : ''}
      </div>
    </div>
  </div>`;
}

window.nextRound = function() {
  clearResultsState();
  rouletteBets = [];
  socket.emit('next-round');
};

// ===== TURN INDICATOR =====
function turnBannerHTML(playerName, isMyTurn) {
  if (isMyTurn) {
    return `<div class="turn-banner my-turn">🎯 C'est à VOUS de jouer !</div>`;
  }
  return `<div class="turn-banner waiting">⏳ ${playerName} est en train de jouer...</div>`;
}

// ===== BLACKJACK RENDER =====
function renderBlackjack(s, area, ctrl) {
  const me = s.players.find(p => p.id === socket.id);

  if (s.phase === 'betting' && me.status === 'betting') {
    clearResultsState();
    area.innerHTML = betSectionHTML('💰 Placez votre mise');
    ctrl.innerHTML = '';
    return;
  }
  if (s.phase === 'betting') {
    clearResultsState();
    area.innerHTML = '<div class="turn-banner waiting">⏳ En attente des autres joueurs...</div>';
    ctrl.innerHTML = '';
    return;
  }

  let html = '';

  // Turn indicator
  if (s.phase === 'playing') {
    const turnPlayer = s.players.find(p => p.id === s.currentPlayerId);
    html += turnBannerHTML(turnPlayer?.name || '...', s.currentPlayerId === socket.id);
  }

  // Dealer
  html += `<div class="dealer-section">
    <div class="section-label">Croupier</div>
    ${cardsHTML(s.dealer.hand)}
    <div class="hand-value">${s.dealer.handValue}</div>
  </div>`;

  // Players
  html += '<div class="players-row">';
  for (const p of s.players) {
    const isMe = p.id === socket.id;
    const isTurn = p.id === s.currentPlayerId;
    let cls = 'player-box';
    if (isMe) cls += ' is-me';
    if (isTurn) cls += ' active-turn';
    if (p.status === 'bust') cls += ' bust';

    html += `<div class="${cls}">
      ${isMe ? '<div class="you-badge">VOUS</div>' : ''}
      <div class="p-name">${p.name}</div>
      <div class="p-money">${p.money} €</div>
      <div class="p-bet">Mise: ${p.bet} €</div>
      ${cardsHTML(p.hand)}
      <div class="hand-value">${p.handValue}</div>
      ${p.status === 'bust' ? '<div class="p-status bust">BUST</div>' : ''}
      ${p.status === 'blackjack' ? '<div class="p-status blackjack">BLACKJACK!</div>' : ''}
    </div>`;
  }
  html += '</div>';

  area.innerHTML = html;

  // Results with delay
  if (s.phase === 'done' && s.results.length > 0 && !showingResults) {
    showingResults = true;
    resultsTimer = setTimeout(() => {
      const area2 = document.getElementById('game-area');
      if (!area2) return;
      area2.innerHTML += resultsHTML('🎲 Résultats',
        s.results.map(r => `
          <div class="result-item">
            <span>${r.name}</span>
            <span class="${r.netGain > 0 ? 'win' : r.netGain < 0 ? 'lose' : 'push'}">
              ${r.netGain > 0 ? '+' : ''}${r.netGain} € (${r.outcome})
            </span>
            <span class="muted">${r.money} €</span>
          </div>
        `).join(''));
      document.getElementById('game-controls').innerHTML = '';
    }, 3000);
  }

  if (s.phase === 'playing' && s.currentPlayerId === socket.id) {
    const canDouble = me.hand.length === 2 && me.bet <= me.money;
    ctrl.innerHTML = `
      <button class="btn btn-primary" onclick="gameAction('hit')">🃏 Tirer</button>
      <button class="btn btn-secondary" onclick="gameAction('stand')">✋ Rester</button>
      ${canDouble ? '<button class="btn btn-success" onclick="gameAction(\'double\')">💰 Doubler</button>' : ''}
    `;
  } else if (s.phase === 'done' && showingResults) {
    ctrl.innerHTML = '<span class="muted">Résultats dans un instant...</span>';
  } else if (s.phase !== 'done') {
    ctrl.innerHTML = '';
  } else {
    ctrl.innerHTML = '';
  }
}

window.confirmBet = function() {
  if (betAmount <= 0) return notify('Mise trop faible', 'error');
  socket.emit('game-action', { action: 'bet', data: { amount: betAmount } });
  betAmount = 0;
};
window.gameAction = function(action) {
  socket.emit('game-action', { action, data: {} });
};

// ===== POKER RENDER =====
function renderPoker(s, area, ctrl) {
  const me = s.players.find(p => p.id === socket.id);
  const isMyTurn = s.currentPlayerId === socket.id && me.status === 'active' && !s.roundOver;
  let html = '';

  // Blinds info
  html += `<div class="poker-info-bar">
    <span>Blinds: ${s.smallBlind}/${s.bigBlind} €</span>
    <span class="pot-display">Pot: ${s.pot} €</span>
  </div>`;

  // Turn indicator
  if (!s.roundOver) {
    const turnPlayer = s.players.find(p => p.id === s.currentPlayerId);
    if (turnPlayer) {
      html += turnBannerHTML(turnPlayer.name, isMyTurn);
    }
  }

  // Phase label
  const phaseLabels = { preflop: 'PRÉ-FLOP', flop: 'FLOP', turn: 'TURN', river: 'RIVER', showdown: 'SHOWDOWN' };
  html += `<div class="action-info">
    ${phaseLabels[s.phase] || s.phase.toUpperCase()}
    ${s.currentBet > 0 && !s.roundOver ? ` • Mise: ${s.currentBet} €` : ''}
  </div>`;

  // Community cards
  if (s.communityCards && s.communityCards.length > 0) {
    html += `<div class="community-section">
      <div class="section-label">Cartes communes</div>
      ${cardsHTML(s.communityCards)}
    </div>`;
  }

  // Players
  html += '<div class="players-row">';
  for (const p of s.players) {
    if (p.status === 'out') continue;
    const isMe = p.id === socket.id;
    const isTurn = p.id === s.currentPlayerId && !s.roundOver;
    let cls = 'player-box';
    if (isMe) cls += ' is-me';
    if (isTurn) cls += ' active-turn';
    if (p.status === 'folded') cls += ' folded';

    // Role badge (D, SB, BB)
    const roleBadge = p.roleName ? `<div class="role-badge">${p.roleName}</div>` : '';

    html += `<div class="${cls}">
      ${isMe ? '<div class="you-badge">VOUS</div>' : ''}
      ${roleBadge}
      <div class="p-name">${p.name}</div>
      <div class="p-money">${p.money} €</div>
      ${p.bet > 0 ? `<div class="p-bet">Mise: ${p.bet} €</div>` : ''}
      ${cardsHTML(p.hand)}
      ${p.bestHand ? `<div class="p-status blackjack">${p.bestHand.name}</div>` : ''}
      ${p.status === 'folded' ? '<div class="p-status bust">Couché</div>' : ''}
      ${p.status === 'all-in' ? '<div class="p-status blackjack">ALL-IN</div>' : ''}
    </div>`;
  }
  html += '</div>';

  area.innerHTML = html;

  // Showdown results (delayed)
  if (s.phase === 'showdown' && s.results.length > 0 && !showingResults) {
    showingResults = true;
    resultsTimer = setTimeout(() => {
      const area2 = document.getElementById('game-area');
      if (!area2) return;
      area2.innerHTML += resultsHTML('🏆 Résultats',
        s.results.map(r => `
          <div class="result-item">
            <span>${r.isWinner ? '👑 ' : ''}${r.name}</span>
            <span>${r.bestHand ? r.bestHand.name : ''}</span>
            <span class="${r.isWinner ? 'win' : 'muted'}">${r.money} €</span>
          </div>
        `).join(''));
      document.getElementById('game-controls').innerHTML = '';
    }, 3000);
  }

  // Controls
  if (isMyTurn) {
    const toCall = s.currentBet - me.bet;
    const minRaise = s.currentBet + (s.minRaise || s.bigBlind);

    let btns = '';

    if (toCall === 0) {
      btns += `<button class="btn btn-secondary" onclick="pokerAction('check')">✋ Check</button>`;
      btns += `<button class="btn btn-danger" onclick="pokerAction('fold')">❌ Coucher</button>`;
    } else {
      btns += `<button class="btn btn-secondary" onclick="pokerAction('call')">📞 Suivre (${toCall} €)</button>`;
      btns += `<button class="btn btn-danger" onclick="pokerAction('fold')">❌ Coucher</button>`;
    }

    btns += `<div class="raise-row">
      <input type="number" id="raise-amount" value="${minRaise}" min="${minRaise}" step="${s.bigBlind || 10}">
      <button class="btn btn-success" onclick="pokerRaise()">💰 Relancer</button>
    </div>`;
    btns += `<button class="btn btn-primary" onclick="pokerAction('all-in')">🔥 All-In (${me.money} €)</button>`;
    ctrl.innerHTML = btns;
  } else if (!s.roundOver) {
    ctrl.innerHTML = '';
  } else if (showingResults) {
    ctrl.innerHTML = '<span class="muted">Résultats dans un instant...</span>';
  } else {
    ctrl.innerHTML = '';
  }
}

window.pokerAction = function(type) {
  socket.emit('game-action', { action: 'poker-action', data: { type } });
};
window.pokerRaise = function() {
  const amount = parseInt(document.getElementById('raise-amount')?.value || 0);
  socket.emit('game-action', { action: 'poker-action', data: { type: 'raise', amount } });
};

// ===== ULTIMATE RENDER =====
function renderUltimate(s, area, ctrl) {
  const me = s.players.find(p => p.id === socket.id);

  if (s.phase === 'betting' && me.status === 'betting') {
    clearResultsState();
    area.innerHTML = betSectionHTML('💎 Mise Ante & Blind', 'La mise Blind est égale à la mise Ante');
    ctrl.innerHTML = '';
    return;
  }
  if (s.phase === 'betting') {
    clearResultsState();
    area.innerHTML = '<div class="turn-banner waiting">⏳ En attente des autres joueurs...</div>';
    ctrl.innerHTML = '';
    return;
  }

  let html = '';

  // Dealer
  html += `<div class="dealer-section">
    <div class="section-label">Croupier</div>
    ${cardsHTML(s.dealer.hand)}
    ${s.dealer.bestHand ? `<div class="hand-value">${s.dealer.bestHand.name}</div>` : ''}
  </div>`;

  if (s.communityCards && s.communityCards.length > 0) {
    html += `<div class="community-section">
      <div class="section-label">Cartes communes</div>
      ${cardsHTML(s.communityCards)}
    </div>`;
  }

  html += '<div class="players-row">';
  for (const p of s.players) {
    const isMe = p.id === socket.id;
    let cls = 'player-box';
    if (isMe) cls += ' is-me';
    if (p.status === 'folded') cls += ' folded';

    html += `<div class="${cls}">
      ${isMe ? '<div class="you-badge">VOUS</div>' : ''}
      <div class="p-name">${p.name}</div>
      <div class="p-money">${p.money} €</div>
      <div class="p-bet">Ante: ${p.ante} € | Blind: ${p.blind} € | Play: ${p.play} €</div>
      ${cardsHTML(p.hand)}
      ${p.bestHand ? `<div class="p-status blackjack">${p.bestHand.name}</div>` : ''}
      ${p.status === 'folded' ? '<div class="p-status bust">Couché</div>' : ''}
    </div>`;
  }
  html += '</div>';

  area.innerHTML = html;

  // Results (delayed)
  if (s.phase === 'done' && s.results.length > 0 && !showingResults) {
    showingResults = true;
    resultsTimer = setTimeout(() => {
      const area2 = document.getElementById('game-area');
      if (!area2) return;
      area2.innerHTML += resultsHTML('💎 Résultats',
        s.results.map(r => `
          <div class="result-item">
            <span>${r.name}</span>
            <span class="${r.winnings > 0 ? 'win' : r.winnings < 0 ? 'lose' : 'push'}">
              ${r.winnings > 0 ? '+' : ''}${r.winnings} € (${r.outcome})
            </span>
            <span class="muted">${r.money} €</span>
          </div>
        `).join(''));
      document.getElementById('game-controls').innerHTML = '';
    }, 3000);
  }

  if (me.status === 'acting' && s.phase !== 'done') {
    let btns = '';
    switch (s.phase) {
      case 'preflop':
        btns = `
          <button class="btn btn-secondary" onclick="ultAction('check')">Check</button>
          <button class="btn btn-success" onclick="ultAction('raise3')">Raise 3x (${me.ante * 3}€)</button>
          <button class="btn btn-primary" onclick="ultAction('raise4')">Raise 4x (${me.ante * 4}€)</button>`;
        break;
      case 'flop':
        btns = `
          <button class="btn btn-secondary" onclick="ultAction('check')">Check</button>
          <button class="btn btn-success" onclick="ultAction('raise2')">Raise 2x (${me.ante * 2}€)</button>`;
        break;
      case 'river':
        btns = `
          <button class="btn btn-danger" onclick="ultAction('fold')">Coucher</button>
          <button class="btn btn-primary" onclick="ultAction('raise1')">Raise 1x (${me.ante}€)</button>`;
        break;
    }
    ctrl.innerHTML = btns;
  } else if (s.phase === 'done' && showingResults) {
    ctrl.innerHTML = '<span class="muted">Résultats dans un instant...</span>';
  } else if (s.phase !== 'done') {
    ctrl.innerHTML = '<div class="turn-banner waiting">⏳ En attente des autres joueurs...</div>';
  } else {
    ctrl.innerHTML = '';
  }
}

window.ultAction = function(type) {
  socket.emit('game-action', { action: 'action', data: { type } });
};

// ===== ROULETTE RENDER =====
let rouletteBets = [];
let rouletteChipValue = 10;

function renderRoulette(s, area, ctrl) {
  const me = s.players.find(p => p.id === socket.id);

  if (s.phase === 'done') {
    showingResults = true;
    const isRed = REDS.includes(s.result);

    let html = `
      <div class="roulette-result-display" style="
        width:120px;height:120px;border-radius:50%;display:flex;align-items:center;
        justify-content:center;margin:0 auto;font-size:2.5rem;font-weight:800;
        background:${s.result === 0 ? '#27ae60' : isRed ? '#c0392b' : '#2c3e50'};
        box-shadow:0 0 30px ${s.result === 0 ? 'rgba(39,174,96,0.5)' : isRed ? 'rgba(192,57,43,0.5)' : 'rgba(44,62,80,0.5)'}">
        ${s.result}
      </div>
      ${(() => {
        const myResult = s.results.find(r => r.id === socket.id);
        return myResult ? `<p style="font-size:1.3rem;margin-top:12px;font-weight:700;color:${myResult.totalWin >= 0 ? 'var(--green2)' : 'var(--red)'}">
          ${myResult.totalWin >= 0 ? '+' : ''}${myResult.totalWin} €</p>` : '';
      })()}
    `;

    if (s.history.length > 0) {
      html += '<div class="roulette-history">';
      for (const n of s.history) {
        const c = n === 0 ? 'r-green' : REDS.includes(n) ? 'r-red' : 'r-black';
        html += `<div class="history-num ${c}">${n}</div>`;
      }
      html += '</div>';
    }

    html += resultsHTML('🎲 Résultats',
      s.results.map(r => `
        <div class="result-item">
          <span>${r.name}</span>
          <span class="${r.totalWin >= 0 ? 'win' : 'lose'}">${r.totalWin >= 0 ? '+' : ''}${r.totalWin} €</span>
          <span class="muted">${r.money} €</span>
        </div>
      `).join(''));

    area.innerHTML = html;
    ctrl.innerHTML = '';
    return;
  }

  clearResultsState();

  if (s.phase === 'betting' && me.status !== 'betting') {
    area.innerHTML = '<div class="turn-banner waiting">⏳ En attente des autres joueurs...</div>';
    ctrl.innerHTML = '';
    return;
  }

  let html = '';

  html += `<div style="margin-bottom:12px;display:flex;gap:6px;justify-content:center;align-items:center;flex-wrap:wrap">
    <span class="muted">Jeton:</span>
    ${[10,25,50,100,500].map(v => `
      <div class="chip c${Math.min(v,500)} ${rouletteChipValue===v?'selected':''}" 
           onclick="setRChip(${v})" style="${rouletteChipValue===v?'transform:scale(1.2)':''}">
        ${v}
      </div>
    `).join('')}
  </div>`;

  html += `<div class="bet-manual-input" style="margin-bottom:8px">
    <span class="muted">ou saisir:</span>
    <input type="number" id="roulette-manual-chip" value="${rouletteChipValue}" min="1" style="width:80px" onchange="setRChipManual()">
    <span class="currency">€</span>
  </div>`;

  const totalBet = rouletteBets.reduce((sum, b) => sum + b.amount, 0);
  html += `<div style="text-align:center;margin-bottom:10px"><span class="muted">Total misé:</span> <span class="gold" style="font-weight:700">${totalBet} €</span></div>`;

  if (s.history && s.history.length > 0) {
    html += '<div class="roulette-history" style="margin-bottom:12px">';
    for (const n of s.history) {
      const c = n === 0 ? 'r-green' : REDS.includes(n) ? 'r-red' : 'r-black';
      html += `<div class="history-num ${c}">${n}</div>`;
    }
    html += '</div>';
  }

  html += '<div style="max-width:500px;width:100%">';
  html += `<div class="roulette-number r-green" onclick="rBet('straight',0)" style="width:100%;text-align:center;margin-bottom:4px;padding:12px;border-radius:6px;cursor:pointer;font-weight:700;font-size:1.1rem">0</div>`;

  html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:2px;margin-bottom:8px">';
  for (let i = 1; i <= 36; i++) {
    const ir = REDS.includes(i);
    const cls = ir ? 'r-red' : 'r-black';
    const hasBet = rouletteBets.some(b => b.type === 'straight' && b.value === i);
    html += `<div class="roulette-number ${cls} ${hasBet?'selected':''}" onclick="rBet('straight',${i})">${i}</div>`;
  }
  html += '</div>';

  html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-bottom:4px">';
  html += `<div class="roulette-outside" onclick="rBet('dozen1',0)">1-12</div>`;
  html += `<div class="roulette-outside" onclick="rBet('dozen2',0)">13-24</div>`;
  html += `<div class="roulette-outside" onclick="rBet('dozen3',0)">25-36</div>`;
  html += '</div>';

  html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-bottom:4px">';
  html += `<div class="roulette-outside" onclick="rBet('col1',0)">Col 1</div>`;
  html += `<div class="roulette-outside" onclick="rBet('col2',0)">Col 2</div>`;
  html += `<div class="roulette-outside" onclick="rBet('col3',0)">Col 3</div>`;
  html += '</div>';

  html += '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:4px;margin-bottom:4px">';
  html += `<div class="roulette-outside" style="background:rgba(192,57,43,0.3)" onclick="rBet('red',0)">🔴 Rouge</div>`;
  html += `<div class="roulette-outside" style="background:rgba(44,62,80,0.5)" onclick="rBet('black',0)">⚫ Noir</div>`;
  html += '</div>';

  html += '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:4px;margin-bottom:4px">';
  html += `<div class="roulette-outside" onclick="rBet('even',0)">Pair</div>`;
  html += `<div class="roulette-outside" onclick="rBet('odd',0)">Impair</div>`;
  html += '</div>';

  html += '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:4px">';
  html += `<div class="roulette-outside" onclick="rBet('low',0)">1-18</div>`;
  html += `<div class="roulette-outside" onclick="rBet('high',0)">19-36</div>`;
  html += '</div>';

  html += '</div>';

  area.innerHTML = html;

  ctrl.innerHTML = `
    <button class="btn btn-ghost" onclick="rClear()">Effacer</button>
    <button class="btn btn-primary" onclick="rConfirm()">Confirmer les mises</button>
  `;
}

window.setRChip = function(val) { rouletteChipValue = val; };
window.setRChipManual = function() {
  const v = parseInt(document.getElementById('roulette-manual-chip')?.value || 10);
  if (v > 0) rouletteChipValue = v;
};
window.rBet = function(type, value) {
  rouletteBets.push({ type, value, amount: rouletteChipValue });
  socket.emit('game-action', { action: 'place-bet', data: { betType: type, betValue: value, amount: rouletteChipValue } });
};
window.rClear = function() {
  rouletteBets = [];
  socket.emit('game-action', { action: 'clear-bets', data: {} });
};
window.rConfirm = function() {
  if (rouletteBets.length === 0) return notify('Placez au moins une mise !', 'error');
  socket.emit('game-action', { action: 'confirm-bets', data: {} });
};

// ===== ERROR HANDLING =====
socket.on('error-msg', (msg) => notify(msg, 'error'));
socket.on('player-left', ({ message }) => notify(message, 'info'));
socket.on('disconnect', () => notify('Connexion perdue !', 'error'));
