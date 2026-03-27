/* ===== CASINO ROYAL - Client App ===== */
const socket = io();

let currentRoom = null;
let myId = null;
let myName = '';
let currentGame = null;
let betAmount = 0;
let tripsBet = 0;
let showingResults = false;
let resultsTimer = null;
let isHost = false;
let seenCardCounts = {}; // track card counts to avoid re-animating

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

function cardHTML(card, idx = 0, isNew = true) {
  const animClass = isNew ? 'card-reveal' : '';
  const animStyle = isNew ? `animation-delay:${idx * 0.4}s` : '';
  if (!card || card.value === 0 || card.suit === 'back') return `<div class="card back ${animClass}" style="${animStyle}"></div>`;
  const suit = SUITS[card.suit] || '';
  const val = VALUES[card.value] || card.value;
  return `<div class="card ${card.suit} ${animClass}" style="${animStyle}"><span class="card-value">${val}</span><span class="card-suit">${suit}</span></div>`;
}
function cardsHTML(cards, sectionKey = '') {
  if (!cards || cards.length === 0) return '<div class="card-container"></div>';
  const prevCount = sectionKey ? (seenCardCounts[sectionKey] || 0) : 0;
  const html = cards.map((c, i) => cardHTML(c, i < prevCount ? 0 : i - prevCount, i >= prevCount)).join('');
  if (sectionKey) seenCardCounts[sectionKey] = cards.length;
  return `<div class="card-container">${html}</div>`;
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

// ===== BET SECTION =====
let lastBetAmount = 0;
let lastTripsBet = 0;

function betSectionHTML(title, subtitle = '', showBonus = false) {
  return `
    <div class="bet-section glass">
      <h3>${title}</h3>
      ${subtitle ? `<p class="muted" style="margin-bottom:12px">${subtitle}</p>` : ''}

      ${showBonus ? `
        <div class="ultimate-boxes">
          <div class="ult-box">
            <div class="ult-box-label">ANTE</div>
            <input type="number" id="bet-manual" class="ult-box-input" value="${betAmount}" min="1" step="1" onchange="setBetFromInput()">
          </div>
          <div class="ult-box">
            <div class="ult-box-label">BLIND</div>
            <div class="ult-box-value" id="blind-display">= ${betAmount} €</div>
          </div>
          <div class="ult-box bonus">
            <div class="ult-box-label">BONUS <span class="muted" style="font-size:0.7rem">(optionnel)</span></div>
            <input type="number" id="trips-manual" class="ult-box-input" value="${tripsBet}" min="0" step="1" onchange="setTripsFromInput()">
          </div>
        </div>
      ` : `
        <div class="bet-amount" id="bet-display">${betAmount} €</div>
        <div class="bet-manual-input">
          <span class="muted">Mise:</span>
          <input type="number" id="bet-manual" value="${betAmount}" min="1" step="1" onchange="setBetFromInput()">
          <span class="currency">€</span>
        </div>
      `}

      <div class="bet-chips">
        <div class="chip c10" onclick="addBet(10)">10</div>
        <div class="chip c25" onclick="addBet(25)">25</div>
        <div class="chip c50" onclick="addBet(50)">50</div>
        <div class="chip c100" onclick="addBet(100)">100</div>
        <div class="chip c500" onclick="addBet(500)">500</div>
      </div>

      <div class="bet-quick-actions">
        ${lastBetAmount > 0 ? `<button class="btn btn-sm btn-secondary" onclick="repeatBet()">🔁 Répéter (${lastBetAmount}€)</button>` : ''}
        <button class="btn btn-sm btn-secondary" onclick="doubleBet()">x2</button>
        <button class="btn btn-sm btn-secondary" onclick="halfBet()">÷2</button>
      </div>

      ${showBonus ? `<div style="margin-top:8px;color:var(--muted);font-size:0.85rem;text-align:center">
        Total: <strong id="ult-total" style="color:var(--gold)">${betAmount * 2 + tripsBet} €</strong>
        <span id="ult-total-detail" class="muted">(Ante ${betAmount} + Blind ${betAmount}${tripsBet > 0 ? ` + Bonus ${tripsBet}` : ''})</span>
      </div>` : ''}

      <div class="bet-buttons">
        <button class="btn btn-ghost" onclick="resetBet()">Effacer</button>
        <button class="btn btn-primary" onclick="confirmBet()">Miser</button>
      </div>
    </div>`;
}

window.addBet = function(a) { betAmount += a; updateBetDisplay(); };
window.resetBet = function() { betAmount = 0; tripsBet = 0; updateBetDisplay(); };
window.addTrips = function(a) { tripsBet += a; updateBetDisplay(); };
window.repeatBet = function() { if (lastBetAmount > 0) { betAmount = lastBetAmount; tripsBet = lastTripsBet; } updateBetDisplay(); };
window.doubleBet = function() { if (betAmount > 0) betAmount *= 2; updateBetDisplay(); };
window.halfBet = function() { if (betAmount >= 2) betAmount = Math.floor(betAmount / 2); updateBetDisplay(); };
window.setBetFromInput = function() {
  const v = parseInt(document.getElementById('bet-manual')?.value || 0);
  if (v > 0) betAmount = v;
  updateBetDisplay();
};
window.setTripsFromInput = function() {
  const v = parseInt(document.getElementById('trips-manual')?.value || 0);
  tripsBet = Math.max(0, v);
  updateBetDisplay();
};
function updateBetDisplay() {
  const el = document.getElementById('bet-display');
  if (el) el.textContent = `${betAmount} €`;
  const inp = document.getElementById('bet-manual');
  if (inp) inp.value = betAmount;
  const ti = document.getElementById('trips-manual');
  if (ti) ti.value = tripsBet;
  // Update dynamic total
  const tot = document.getElementById('ult-total');
  if (tot) tot.textContent = `${betAmount * 2 + tripsBet} €`;
  const totDetail = document.getElementById('ult-total-detail');
  if (totDetail) totDetail.textContent = `(Ante ${betAmount} + Blind ${betAmount}${tripsBet > 0 ? ` + Bonus ${tripsBet}` : ''})`;
  const bl = document.getElementById('blind-display');
  if (bl) bl.textContent = `= ${betAmount} €`;
}
function clearResultsState() {
  showingResults = false;
  if (resultsTimer) { clearTimeout(resultsTimer); resultsTimer = null; }
  seenCardCounts = {}; // reset card animations for new round
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
document.getElementById('player-name').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('btn-create').click(); });
document.getElementById('room-code').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('btn-join').click(); });

// ===== LOBBY =====
socket.on('room-joined', (room) => { currentRoom = room; myId = socket.id; isHost = room.isHost; showScreen('lobby'); updateLobby(); });
socket.on('room-update', (room) => { currentRoom = room; isHost = room.isHost; updateLobby(); });

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
  document.querySelectorAll('.game-option').forEach(btn => btn.classList.toggle('selected', btn.dataset.game === r.gameType));
  const btnStart = document.getElementById('btn-start');
  btnStart.classList.toggle('hidden', !r.isHost);
  if (r.isHost && r.gameType) btnStart.disabled = false;
  if (r.startMoney) document.getElementById('start-money').value = r.startMoney;
  const wcSel = document.getElementById('win-condition');
  if (wcSel && r.winCondition) wcSel.value = r.winCondition;
  const guestDiv = document.getElementById('lobby-settings-guest');
  if (!r.isHost && guestDiv) {
    const gl = r.gameType ? { blackjack:'Blackjack', poker:'Poker', ultimate:'Ultimate', roulette:'Roulette' }[r.gameType] : 'non choisi';
    const cl = { none:'Pas de limite', first_zero:'Premier à 0€', first_x2:'x2', first_x5:'x5', first_x10:'x10' }[r.winCondition] || 'Pas de limite';
    guestDiv.innerHTML = `<p class="muted">Jeu: <strong style="color:var(--gold)">${gl}</strong> | Argent: <strong style="color:var(--gold)">${r.startMoney}€</strong> | Condition: <strong style="color:var(--gold)">${cl}</strong></p><p class="muted" style="margin-top:8px">⏳ En attente de l'hôte...</p>`;
  }
}

document.getElementById('game-select').addEventListener('click', e => { const b = e.target.closest('.game-option'); if (b) socket.emit('update-settings', { gameType: b.dataset.game }); });
document.getElementById('start-money').addEventListener('change', e => socket.emit('update-settings', { startMoney: parseInt(e.target.value) }));
document.getElementById('win-condition').addEventListener('change', e => socket.emit('update-settings', { winCondition: e.target.value }));
document.getElementById('btn-start').onclick = () => { if (!currentRoom.gameType) return notify('Choisissez un jeu !', 'error'); socket.emit('start-game'); };
document.getElementById('btn-leave').onclick = () => { socket.emit('leave-room'); currentRoom = null; showScreen('home'); };
document.getElementById('btn-back-lobby').onclick = () => socket.emit('back-to-lobby');

socket.on('back-to-lobby', () => { showScreen('lobby'); currentGame = null; clearResultsState(); document.getElementById('session-end-overlay').classList.add('hidden'); });

// ===== GAME =====
const GAME_NAMES = { blackjack:'🃏 Blackjack', poker:'♠️ Poker Texas Hold\'em', ultimate:'💎 Ultimate Poker', roulette:'🎡 Roulette' };
socket.on('game-started', ({ gameType }) => { currentGame = gameType; betAmount = 0; tripsBet = 0; clearResultsState(); showScreen('game'); document.getElementById('game-type-label').textContent = GAME_NAMES[gameType]||gameType; document.getElementById('game-room-label').textContent = `Salle ${currentRoom.id}`; });
socket.on('game-update', (state) => { if (!currentGame) return; if (state.isHost !== undefined) isHost = state.isHost; if (state.allPlayers) updatePlayersBar(state.allPlayers); const me = state.players?.find(p => p.id === socket.id); if (me) document.getElementById('my-money').textContent = `${me.money} €`; renderGame(state); });
socket.on('session-ended', ({ reason, players }) => { const o = document.getElementById('session-end-overlay'); const t = document.getElementById('session-end-title'); const b = document.getElementById('session-end-body'); let m = reason.type === 'zero' ? `💀 ${reason.player} est tombé à 0€!` : `🎉 ${reason.player} a atteint ${reason.type.toUpperCase()} (${reason.amount}€)!`; t.textContent = '🏆 Fin de la session !'; b.innerHTML = `<p style="margin-bottom:16px;font-size:1.1rem">${m}</p>${players.sort((a,b)=>b.money-a.money).map((p,i)=>`<div class="result-item"><span>${i===0?'👑 ':''}${p.name}</span><span class="gold" style="font-weight:700">${p.money}€</span></div>`).join('')}<button class="btn btn-primary" style="margin-top:20px;width:100%" onclick="closeStatsOverlay()">Retour au Lobby</button>`; o.classList.remove('hidden'); });

// Session ended with full stats
socket.on('session-ended-stats', ({ stats, startMoney }) => {
  const o = document.getElementById('session-end-overlay');
  const t = document.getElementById('session-end-title');
  const b = document.getElementById('session-end-body');
  t.textContent = '🏁 Session terminée — Classement';
  let html = `<table class="stats-table"><tr><th>#</th><th>Joueur</th><th>Départ</th><th>Final</th><th>Gain</th></tr>`;
  stats.forEach((s, i) => {
    const cls = s.gain > 0 ? 'win' : s.gain < 0 ? 'lose' : '';
    html += `<tr><td>${i === 0 ? '👑' : i + 1}</td><td>${s.name}</td><td>${s.startMoney}€</td><td style="font-weight:700">${s.finalMoney}€</td><td class="${cls}" style="font-weight:700">${s.gain > 0 ? '+' : ''}${s.gain}€ (${s.gainPercent > 0 ? '+' : ''}${s.gainPercent}%)</td></tr>`;
  });
  html += '</table><button class="btn btn-primary" style="margin-top:20px;width:100%" onclick="closeStatsOverlay()">Retour au Lobby</button>';
  b.innerHTML = html;
  o.classList.remove('hidden');
});

window.closeStatsOverlay = function() {
  document.getElementById('session-end-overlay').classList.add('hidden');
  showScreen('lobby');
};
socket.on('connect', () => { myId = socket.id; document.getElementById('session-end-overlay').classList.add('hidden'); });

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

// ===== RESULTS HELPER =====
function resultsHTML(title, items) {
  return `<div class="results-section"><div class="results-card glass"><h2>${title}</h2>${items}
    <div class="results-actions">
      ${isHost ? `
        <button class="btn btn-primary" onclick="nextRound()">▶️ Nouvelle manche</button>
        <button class="btn btn-ghost" onclick="socket.emit('back-to-lobby')">🔄 Changer de jeu</button>
        <button class="btn btn-danger btn-sm" onclick="socket.emit('end-session')">🏁 Fin de session</button>
      ` : '<p class="muted">⏳ En attente que l\'hôte lance la prochaine manche...</p>'}
    </div></div></div>`;
}
window.nextRound = function() { clearResultsState(); rouletteBets = []; socket.emit('next-round'); };

function turnBannerHTML(name, isMyTurn) {
  return isMyTurn ? `<div class="turn-banner my-turn">🎯 C'est à VOUS de jouer !</div>` : `<div class="turn-banner waiting">⏳ ${name} est en train de jouer...</div>`;
}

// ===== 2D TABLE + PLAYER SEAT HELPERS =====
function tableHTML(tableClass, dealerContent, centerContent, playerSeats) {
  return `<div class="game-table ${tableClass}">
    <div class="table-felt">
      <div class="dealer-zone">${dealerContent}</div>
      <div class="table-center">${centerContent}</div>
      <div class="seats-zone">${playerSeats}</div>
    </div>
  </div>`;
}

function seatHTML(p, isMe, extra = '', badge = '', gameKey = '') {
  let cls = 'seat';
  if (isMe) cls += ' seat-me';
  if (p.status === 'bust' || p.status === 'folded') cls += ' seat-out';
  if (p._isTurn) cls += ' seat-active';
  return `<div class="${cls}">
    ${isMe ? '<div class="you-badge">VOUS</div>' : ''}
    ${badge}
    <div class="seat-name">${p.name}</div>
    <div class="seat-money">${p.money} €</div>
    ${extra}
    <div class="seat-cards">${cardsHTML(p.hand, gameKey ? gameKey + '_p_' + p.id : '')}</div>
  </div>`;
}

// ===== BLACKJACK =====
function renderBlackjack(s, area, ctrl) {
  const me = s.players.find(p => p.id === socket.id);
  if (s.phase === 'betting' && me.status === 'betting') { clearResultsState(); area.innerHTML = betSectionHTML('💰 Placez votre mise'); ctrl.innerHTML = ''; return; }
  if (s.phase === 'betting') { clearResultsState(); area.innerHTML = '<div class="turn-banner waiting">⏳ En attente des mises...</div>'; ctrl.innerHTML = ''; return; }

  // Turn banner
  let banner = '';
  if (s.phase === 'playing') {
    const tp = s.players.find(p => p.id === s.currentPlayerId);
    banner = turnBannerHTML(tp?.name || '...', s.currentPlayerId === socket.id);
  }

  const dealerContent = `<div class="section-label">CROUPIER</div>${cardsHTML(s.dealer.hand, 'bj_dealer')}<div class="hand-value">${s.dealer.handValue}</div>`;

  const seats = s.players.map(p => {
    const isMe = p.id === socket.id;
    p._isTurn = p.id === s.currentPlayerId && s.phase === 'playing';
    const extra = `<div class="seat-bet">Mise: ${p.bet}€</div><div class="hand-value">${p.handValue}</div>
      ${p.status === 'bust' ? '<div class="p-status bust">BUST</div>' : ''}
      ${p.status === 'blackjack' ? '<div class="p-status blackjack">BLACKJACK!</div>' : ''}`;
    return seatHTML(p, isMe, extra, '', 'bj');
  }).join('');

  area.innerHTML = banner + tableHTML('table-blackjack', dealerContent, '', seats);

  if (s.phase === 'done' && s.results.length > 0 && !showingResults) {
    showingResults = true;
    resultsTimer = setTimeout(() => {
      const a = document.getElementById('game-area');
      if (a) a.innerHTML += resultsHTML('🎲 Résultats', s.results.map(r => `<div class="result-item"><span>${r.name}</span><span class="${r.netGain > 0 ? 'win' : r.netGain < 0 ? 'lose' : 'push'}">${r.netGain > 0 ? '+' : ''}${r.netGain}€ (${r.outcome})</span><span class="muted">${r.money}€</span></div>`).join(''));
      document.getElementById('game-controls').innerHTML = '';
    }, 3000);
  }

  if (s.phase === 'playing' && s.currentPlayerId === socket.id) {
    const canDouble = me.hand.length === 2 && me.bet <= me.money;
    ctrl.innerHTML = `<button class="btn btn-primary" onclick="gameAction('hit')">🃏 Tirer</button>
      <button class="btn btn-secondary" onclick="gameAction('stand')">✋ Rester</button>
      ${canDouble ? '<button class="btn btn-success" onclick="gameAction(\'double\')">💰 Doubler</button>' : ''}`;
  } else if (s.phase === 'done' && showingResults) { ctrl.innerHTML = '<span class="muted">Résultats...</span>'; }
  else { ctrl.innerHTML = ''; }
}

window.confirmBet = function() {
  if (betAmount <= 0) return notify('Mise trop faible', 'error');
  lastBetAmount = betAmount;
  lastTripsBet = tripsBet;
  if (currentGame === 'ultimate') {
    socket.emit('game-action', { action: 'bet', data: { amount: betAmount, trips: tripsBet } });
  } else {
    socket.emit('game-action', { action: 'bet', data: { amount: betAmount } });
  }
  betAmount = 0; tripsBet = 0;
};
window.gameAction = function(action) { socket.emit('game-action', { action, data: {} }); };

// ===== POKER =====
function renderPoker(s, area, ctrl) {
  const me = s.players.find(p => p.id === socket.id);
  const isMyTurn = s.currentPlayerId === socket.id && me.status === 'active' && !s.roundOver;
  const phaseLabels = { preflop:'PRÉ-FLOP', flop:'FLOP', turn:'TURN', river:'RIVER', showdown:'SHOWDOWN' };

  let banner = '';
  if (!s.roundOver) {
    const tp = s.players.find(p => p.id === s.currentPlayerId);
    if (tp) banner = turnBannerHTML(tp.name, isMyTurn);
  }

  const centerContent = `
    <div class="poker-info-bar">
      <span>Blinds: ${s.smallBlind}/${s.bigBlind}€</span>
      <span style="color:var(--gold);font-weight:700;font-size:1.1rem">Pot: ${s.pot}€</span>
      <span>${phaseLabels[s.phase] || s.phase.toUpperCase()}</span>
    </div>
    ${s.communityCards?.length > 0 ? `<div class="table-community">${cardsHTML(s.communityCards, 'pk_comm')}</div>` : ''}`;

  const seats = s.players.filter(p => p.status !== 'out').map(p => {
    const isMe = p.id === socket.id;
    p._isTurn = p.id === s.currentPlayerId && !s.roundOver;
    const roleBadge = p.roleName ? `<div class="role-badge">${p.roleName}</div>` : '';
    const extra = `${p.bet > 0 ? `<div class="seat-bet">Mise: ${p.bet}€</div>` : ''}
      ${p.bestHand ? `<div class="p-status blackjack">
        <div style="font-weight:bold">${p.bestHand.name}</div>
        <div style="font-size:0.75em; opacity:0.9">${formatMiniHand(p.bestHand.cards)}</div>
      </div>` : ''}
      ${p.status === 'folded' ? '<div class="p-status bust">Couché</div>' : ''}
      ${p.status === 'all-in' ? '<div class="p-status blackjack">ALL-IN</div>' : ''}`;
    return seatHTML(p, isMe, extra, roleBadge, 'pk');
  }).join('');

  let tableContent = banner + tableHTML('table-poker', '', centerContent, seats);

  // Action log
  if (s.actionLog && s.actionLog.length > 0) {
    tableContent += `<div class="action-log">`;
    for (const a of s.actionLog.slice(-5)) {
      tableContent += `<div class="action-log-item"><strong>${a.name}</strong> ${a.action}</div>`;
    }
    tableContent += `</div>`;
  }

  area.innerHTML = tableContent;

  if (s.phase === 'showdown' && s.results.length > 0 && !showingResults) {
    showingResults = true;
    resultsTimer = setTimeout(() => {
      const a = document.getElementById('game-area');
      if (a) a.innerHTML += resultsHTML('🏆 Résultats', s.results.map(r => `<div class="result-item"><span>${r.isWinner ? '👑 ' : ''}${r.name}</span><span>${r.bestHand ? r.bestHand.name : ''}</span><span class="${r.isWinner ? 'win' : 'muted'}">${r.money}€</span></div>`).join(''));
      document.getElementById('game-controls').innerHTML = '';
    }, 3000);
  }

  if (isMyTurn) {
    const toCall = s.currentBet - me.bet;
    const minRaise = s.currentBet + (s.minRaise || s.bigBlind);
    let btns = '';
    if (toCall === 0) { btns += `<button class="btn btn-secondary" onclick="pokerAction('check')">✋ Check</button>`; }
    else { btns += `<button class="btn btn-secondary" onclick="pokerAction('call')">📞 Suivre (${toCall}€)</button>`; }
    btns += `<button class="btn btn-danger" onclick="pokerAction('fold')">❌ Coucher</button>`;
    btns += `<div class="raise-row"><input type="number" id="raise-amount" value="${minRaise}" min="${minRaise}" step="${s.bigBlind||10}"><button class="btn btn-success" onclick="pokerRaise()">💰 Relancer</button></div>`;
    btns += `<button class="btn btn-primary" onclick="pokerAction('all-in')">🔥 All-In (${me.money}€)</button>`;
    ctrl.innerHTML = btns;
  } else if (showingResults) { ctrl.innerHTML = '<span class="muted">Résultats...</span>'; }
  else { ctrl.innerHTML = ''; }
}
window.pokerAction = function(t) { socket.emit('game-action', { action: 'poker-action', data: { type: t } }); };
window.pokerRaise = function() { const a = parseInt(document.getElementById('raise-amount')?.value||0); socket.emit('game-action', { action:'poker-action', data:{ type:'raise', amount: a } }); };

function ultPaytablesLeft() {
  return `<div class="paytable-side">
    <div class="paytable compact">
      <h4>💰 Ante</h4>
      <table><tr><td>Si croupier qualifié</td><td class="gold">1:1</td></tr>
      <tr><td>Sinon</td><td>Push</td></tr></table>
      <p class="muted" style="font-size:0.6rem;margin-top:2px">Qualifié = Paire+</p>
    </div>
    <div class="paytable compact">
      <h4>🎯 Play</h4>
      <table><tr><td>Victoire</td><td class="gold">1:1</td></tr>
      <tr><td>Égalité</td><td>Push</td></tr>
      <tr><td>Défaite</td><td class="muted">Perdu</td></tr></table>
    </div>
  </div>`;
}

function ultPaytablesRight() {
  return `<div class="paytable-side">
    <div class="paytable compact">
      <h4>📋 Blind</h4>
      <table><tr><td>Royale</td><td class="gold">500:1</td></tr>
      <tr><td>Q. Flush</td><td class="gold">50:1</td></tr>
      <tr><td>Carré</td><td class="gold">10:1</td></tr>
      <tr><td>Full</td><td class="gold">3:1</td></tr>
      <tr><td>Couleur</td><td class="gold">3:2</td></tr>
      <tr><td>Quinte</td><td class="gold">1:1</td></tr>
      <tr><td>Autre</td><td>Push</td></tr></table>
    </div>
    <div class="paytable compact">
      <h4>🎲 Bonus</h4>
      <table><tr><td>Royale</td><td class="gold">50:1</td></tr>
      <tr><td>Q. Flush</td><td class="gold">40:1</td></tr>
      <tr><td>Carré</td><td class="gold">30:1</td></tr>
      <tr><td>Full</td><td class="gold">8:1</td></tr>
      <tr><td>Couleur</td><td class="gold">6:1</td></tr>
      <tr><td>Quinte</td><td class="gold">5:1</td></tr>
      <tr><td>Brelan</td><td class="gold">3:1</td></tr></table>
    </div>
  </div>`;
}

function formatMiniHand(cards) {
  if (!cards || !cards.length) return '';
  return cards.map(c => {
    const s = SUITS[c.suit] || '';
    const v = VALUES[c.value] || c.value;
    const color = (c.suit === 'heart' || c.suit === 'diamond') ? 'var(--red)' : '#fff';
    return `<span style="color:${color}; margin:0 1px">${v}${s}</span>`;
  }).join('');
}

// ===== ULTIMATE POKER =====
function renderUltimate(s, area, ctrl) {
  const me = s.players.find(p => p.id === socket.id);

  if (s.phase === 'betting' && me.status === 'betting') {
    clearResultsState();
    area.innerHTML = betSectionHTML('💎 Ultimate Texas Hold\'em', 'Ante + Blind (= Ante) + Bonus (optionnel)', true);
    // Show paytable
    area.innerHTML += `<div class="paytable-container glass" style="align-items:flex-start">
      ${ultPaytablesLeft()}
      ${ultPaytablesRight()}
    </div>`;
    ctrl.innerHTML = '';
    return;
  }
  if (s.phase === 'betting') { clearResultsState(); area.innerHTML = '<div class="turn-banner waiting">⏳ En attente des mises...</div>'; ctrl.innerHTML = ''; return; }

  const dealerContent = `<div class="section-label">CROUPIER</div>${cardsHTML(s.dealer.hand, 'ult_dealer')}
    ${s.dealer.bestHand ? `<div class="hand-value" style="display:flex;flex-direction:column;align-items:center;">
      <span>${s.dealer.bestHand.name}</span>
      <span style="font-size:0.75em; font-weight:normal; opacity:0.9">${formatMiniHand(s.dealer.bestHand.cards)}</span>
    </div>` : ''}`;

  const centerContent = s.communityCards?.length > 0 ? `<div class="table-community">${cardsHTML(s.communityCards, 'ult_comm')}</div>` : '';

  const seats = s.players.map(p => {
    const isMe = p.id === socket.id;
    p._isTurn = p.status === 'acting';
    const extra = `<div class="seat-bets">
        <span class="bet-spot">A:${p.ante}€</span>
        <span class="bet-spot">B:${p.blind}€</span>
        ${p.trips > 0 ? `<span class="bet-spot trips">Bonus:${p.trips}€</span>` : ''}
        ${p.play > 0 ? `<span class="bet-spot play">Play:${p.play}€</span>` : ''}
      </div>
      ${p.bestHand ? `<div class="p-status blackjack">
        <div style="font-weight:bold">${p.bestHand.name}</div>
        <div style="font-size:0.75em; opacity:0.9">${formatMiniHand(p.bestHand.cards)}</div>
      </div>` : ''}
      ${p.status === 'folded' ? '<div class="p-status bust">Couché</div>' : ''}`;
    return seatHTML(p, isMe, extra, '', 'ult');
  }).join('');

  const tableMarkup = tableHTML('table-ultimate', dealerContent, centerContent, seats);
  area.innerHTML = `
    <div class="ultimate-layout">
      <div class="ult-layout-side hidden-mobile">${ultPaytablesLeft()}</div>
      <div class="ult-layout-center">${tableMarkup}</div>
      <div class="ult-layout-side hidden-mobile">${ultPaytablesRight()}</div>
    </div>
  `;

  if (s.phase === 'done' && s.results.length > 0 && !showingResults) {
    showingResults = true;
    resultsTimer = setTimeout(() => {
      const a = document.getElementById('game-area');
      if (a) a.innerHTML += resultsHTML('💎 Résultats Détaillés', s.results.map(r => `
        <div class="result-item" style="flex-direction:column;align-items:flex-start;gap:8px">
          <div style="display:flex;justify-content:space-between;width:100%;align-items:flex-start">
            <strong>${r.name}</strong>
            <div style="text-align:right">
              <strong class="${r.winnings > 0 ? 'win' : r.winnings < 0 ? 'lose' : 'push'}">${r.winnings > 0 ? '+' : ''}${r.winnings}€</strong>
              <div class="muted" style="font-size:0.75rem; margin-top:4px">
                Avant: ${r.money - r.winnings}€ | Après: <strong style="color:var(--gold)">${r.money}€</strong>
              </div>
            </div>
          </div>
          ${r.detail ? `<div class="ult-results-detail" style="display:flex;gap:12px;font-size:0.8rem;background:rgba(0,0,0,0.2);padding:6px;border-radius:4px;width:100%">
            <div class="${r.detail.anteWin > 0 ? 'win' : r.detail.anteWin < 0 ? 'lose' : 'muted'}">A: ${r.detail.anteLabel}</div>
            <div class="${r.detail.blindWin > 0 ? 'win' : r.detail.blindWin < 0 ? 'lose' : 'muted'}">B: ${r.detail.blindLabel}</div>
            <div class="${r.detail.playWin > 0 ? 'win' : r.detail.playWin < 0 ? 'lose' : 'muted'}">P: ${r.detail.playLabel}</div>
            ${r.trips > 0 ? `<div class="${r.detail.bonusWin > 0 ? 'win' : 'lose'}">Bonus: ${r.detail.bonusLabel}</div>` : ''}
          </div>` : ''}
        </div>
      `).join(''));
      document.getElementById('game-controls').innerHTML = '';
    }, 3000);
  }

  if (me.status === 'acting' && s.phase !== 'done') {
    let btns = '';
    switch (s.phase) {
      case 'preflop':
        btns = `<button class="btn btn-secondary" onclick="ultAction('check')">Check</button>
          <button class="btn btn-success" onclick="ultAction('raise3')">Raise 3x (${me.ante*3}€)</button>
          <button class="btn btn-primary" onclick="ultAction('raise4')">Raise 4x (${me.ante*4}€)</button>`; break;
      case 'flop':
        btns = `<button class="btn btn-secondary" onclick="ultAction('check')">Check</button>
          <button class="btn btn-success" onclick="ultAction('raise2')">Raise 2x (${me.ante*2}€)</button>`; break;
      case 'river':
        btns = `<button class="btn btn-danger" onclick="ultAction('fold')">Coucher</button>
          <button class="btn btn-primary" onclick="ultAction('raise1')">Raise 1x (${me.ante}€)</button>`; break;
    }
    ctrl.innerHTML = btns;
  } else if (s.phase === 'done' && showingResults) { ctrl.innerHTML = '<span class="muted">Résultats...</span>'; }
  else if (s.phase !== 'done') { ctrl.innerHTML = '<div class="turn-banner waiting">⏳ En attente...</div>'; }
  else { ctrl.innerHTML = ''; }
}
window.ultAction = function(t) { socket.emit('game-action', { action: 'action', data: { type: t } }); };

// ===== ROULETTE =====
let rouletteBets = [];
let rouletteChipValue = 10;

function renderRoulette(s, area, ctrl) {
  const me = s.players.find(p => p.id === socket.id);

  if (s.phase === 'done') {
    showingResults = true;
    const isRed = REDS.includes(s.result);
    let html = `<div class="roulette-result-display" style="width:120px;height:120px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto;font-size:2.5rem;font-weight:800;background:${s.result===0?'#27ae60':isRed?'#c0392b':'#2c3e50'};box-shadow:0 0 30px ${s.result===0?'rgba(39,174,96,0.5)':isRed?'rgba(192,57,43,0.5)':'rgba(44,62,80,0.5)'}">${s.result}</div>`;
    const myR = s.results.find(r => r.id === socket.id);
    if (myR) html += `<p style="font-size:1.3rem;margin-top:12px;font-weight:700;color:${myR.totalWin>=0?'var(--green2)':'var(--red)'}">${myR.totalWin>=0?'+':''}${myR.totalWin}€</p>`;
    if (s.history.length > 0) { html += '<div class="roulette-history">'; for (const n of s.history) { html += `<div class="history-num ${n===0?'r-green':REDS.includes(n)?'r-red':'r-black'}">${n}</div>`; } html += '</div>'; }
    html += resultsHTML('🎲 Résultats', s.results.map(r => `<div class="result-item"><span>${r.name}</span><span class="${r.totalWin>=0?'win':'lose'}">${r.totalWin>=0?'+':''}${r.totalWin}€</span><span class="muted">${r.money}€</span></div>`).join(''));
    area.innerHTML = html; ctrl.innerHTML = ''; return;
  }
  clearResultsState();
  if (s.phase === 'betting' && me.status !== 'betting') { area.innerHTML = '<div class="turn-banner waiting">⏳ En attente des autres joueurs...</div>'; ctrl.innerHTML = ''; return; }

  let html = `<div style="margin-bottom:12px;display:flex;gap:6px;justify-content:center;align-items:center;flex-wrap:wrap"><span class="muted">Jeton:</span>`;
  [10,25,50,100,500].forEach(v => { html += `<div class="chip c${Math.min(v,500)} ${rouletteChipValue===v?'selected':''}" onclick="setRChip(${v})" style="${rouletteChipValue===v?'transform:scale(1.2)':''}">${v}</div>`; });
  html += '</div>';
  html += `<div class="bet-manual-input" style="margin-bottom:8px"><span class="muted">ou saisir:</span><input type="number" id="roulette-manual-chip" value="${rouletteChipValue}" min="1" style="width:80px" onchange="setRChipManual()"><span class="currency">€</span></div>`;
  const totalBet = rouletteBets.reduce((s,b)=>s+b.amount,0);
  html += `<div style="text-align:center;margin-bottom:10px"><span class="muted">Total:</span> <span class="gold" style="font-weight:700">${totalBet}€</span></div>`;
  if (s.history?.length > 0) { html += '<div class="roulette-history" style="margin-bottom:12px">'; for (const n of s.history) { html += `<div class="history-num ${n===0?'r-green':REDS.includes(n)?'r-red':'r-black'}">${n}</div>`; } html += '</div>'; }

  html += '<div class="roulette-table"><div class="roulette-grid">';
  html += `<div class="roulette-number r-green roulette-zero" onclick="rBet('straight',0)">0</div>`;
  html += '<div class="roulette-numbers-grid">';
  for (let i = 1; i <= 36; i++) { const hasBet = rouletteBets.some(b => b.type==='straight'&&b.value===i); html += `<div class="roulette-number ${REDS.includes(i)?'r-red':'r-black'} ${hasBet?'selected':''}" onclick="rBet('straight',${i})">${i}</div>`; }
  html += '</div>';
  html += `<div class="roulette-outside-grid">
    <div class="roulette-outside" onclick="rBet('dozen1',0)">1-12</div><div class="roulette-outside" onclick="rBet('dozen2',0)">13-24</div><div class="roulette-outside" onclick="rBet('dozen3',0)">25-36</div>
    <div class="roulette-outside" onclick="rBet('col1',0)">Col 1</div><div class="roulette-outside" onclick="rBet('col2',0)">Col 2</div><div class="roulette-outside" onclick="rBet('col3',0)">Col 3</div>
    <div class="roulette-outside" style="background:rgba(192,57,43,0.3)" onclick="rBet('red',0)">🔴 Rouge</div><div class="roulette-outside" style="background:rgba(44,62,80,0.5)" onclick="rBet('black',0)">⚫ Noir</div>
    <div class="roulette-outside" onclick="rBet('even',0)">Pair</div><div class="roulette-outside" onclick="rBet('odd',0)">Impair</div>
    <div class="roulette-outside" onclick="rBet('low',0)">1-18</div><div class="roulette-outside" onclick="rBet('high',0)">19-36</div>
  </div></div></div>`;
  area.innerHTML = html;
  ctrl.innerHTML = `<button class="btn btn-ghost" onclick="rClear()">Effacer</button><button class="btn btn-primary" onclick="rConfirm()">Confirmer les mises</button>`;
}

window.setRChip = function(v) { rouletteChipValue = v; };
window.setRChipManual = function() { const v = parseInt(document.getElementById('roulette-manual-chip')?.value||10); if (v>0) rouletteChipValue = v; };
window.rBet = function(t,v) { rouletteBets.push({type:t,value:v,amount:rouletteChipValue}); socket.emit('game-action',{action:'place-bet',data:{betType:t,betValue:v,amount:rouletteChipValue}}); };
window.rClear = function() { rouletteBets = []; socket.emit('game-action',{action:'clear-bets',data:{}}); };
window.rConfirm = function() { if (rouletteBets.length===0) return notify('Placez au moins une mise !','error'); socket.emit('game-action',{action:'confirm-bets',data:{}}); };

socket.on('error-msg', msg => notify(msg, 'error'));
socket.on('player-left', ({ message }) => notify(message, 'info'));
socket.on('disconnect', () => notify('Connexion perdue !', 'error'));
