const Deck = require('./deck');
const { getBestHand, compareHands } = require('./hand-evaluator');

class PokerGame {
  constructor(players, startMoney) {
    this.deck = new Deck();
    this.players = players.map((p, i) => ({
      id: p.id, name: p.name, money: p.money,
      hand: [], bet: 0, totalBet: 0,
      status: p.money > 0 ? 'active' : 'out',
      hasActed: false, seatIndex: i, bestHand: null,
      role: '' // 'dealer', 'sb', 'bb', or ''
    }));
    this.communityCards = [];
    this.pot = 0;
    this.sidePots = [];
    this.phase = 'waiting';
    this.dealerIndex = 0;
    this.sbIndex = -1;
    this.bbIndex = -1;
    this.currentPlayerIndex = -1;
    this.currentBet = 0;
    this.minRaise = 0;
    this.lastRaiser = -1;
    // Blinds proportional to starting bankroll: BB = 2% of startMoney, SB = half
    this.bigBlind = Math.max(10, Math.round((startMoney || 1000) * 0.02));
    this.smallBlind = Math.floor(this.bigBlind / 2);
    this.results = [];
    this.roundOver = false;
    this.turnMessage = '';
  }

  getNextActive(from) {
    let idx = (from + 1) % this.players.length;
    for (let i = 0; i < this.players.length; i++) {
      if (this.players[idx].status === 'active') return idx;
      idx = (idx + 1) % this.players.length;
    }
    return -1;
  }

  getNextInHand(from) {
    // Gets next player still in hand (active or all-in)
    let idx = (from + 1) % this.players.length;
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[idx];
      if (p.status === 'active' || p.status === 'all-in') return idx;
      idx = (idx + 1) % this.players.length;
    }
    return -1;
  }

  getActivePlayers() { return this.players.filter(p => p.status === 'active' || p.status === 'all-in'); }
  getBettingPlayers() { return this.players.filter(p => p.status === 'active'); }

  startRound(dealerIdx = 0) {
    this.deck = new Deck();
    this.communityCards = [];
    this.pot = 0;
    this.sidePots = [];
    this.phase = 'preflop';
    this.results = [];
    this.roundOver = false;
    this.turnMessage = '';

    // Reset all players
    for (const p of this.players) {
      p.hand = []; p.bet = 0; p.totalBet = 0; p.hasActed = false; p.bestHand = null;
      p.status = p.money > 0 ? 'active' : 'out';
      p.role = '';
    }

    // Find valid dealer position
    this.dealerIndex = this.findNextAlive(dealerIdx - 1);
    if (this.dealerIndex === -1) return false;

    const active = this.getActivePlayers();
    if (active.length < 2) return false;

    // Assign roles
    this.players[this.dealerIndex].role = 'dealer';

    if (active.length === 2) {
      // Heads-up: dealer is SB, other is BB
      this.sbIndex = this.dealerIndex;
      this.bbIndex = this.getNextActive(this.dealerIndex);
      this.players[this.sbIndex].role = 'dealer/sb';
      this.players[this.bbIndex].role = 'bb';
    } else {
      this.sbIndex = this.getNextActive(this.dealerIndex);
      this.bbIndex = this.getNextActive(this.sbIndex);
      this.players[this.sbIndex].role = 'sb';
      this.players[this.bbIndex].role = 'bb';
    }

    // Post blinds
    this.postBlind(this.sbIndex, this.smallBlind);
    this.postBlind(this.bbIndex, this.bigBlind);
    this.currentBet = this.bigBlind;
    this.minRaise = this.bigBlind;

    // Deal 2 cards to each player
    for (let i = 0; i < 2; i++) {
      for (const p of this.players) {
        if (p.status !== 'out') p.hand.push(this.deck.deal());
      }
    }

    // Pre-flop: action starts left of BB (UTG)
    this.currentPlayerIndex = this.getNextActive(this.bbIndex);
    this.lastRaiser = this.bbIndex; // BB is the initial "raiser"
    this.updateTurnMessage();
    return true;
  }

  findNextAlive(from) {
    let idx = (from + 1) % this.players.length;
    for (let i = 0; i < this.players.length; i++) {
      if (this.players[idx].money > 0) return idx;
      idx = (idx + 1) % this.players.length;
    }
    return -1;
  }

  postBlind(idx, amount) {
    const p = this.players[idx];
    const actual = Math.min(amount, p.money);
    p.money -= actual; p.bet = actual; p.totalBet += actual;
    this.pot += actual;
    if (p.money === 0) p.status = 'all-in';
  }

  action(playerId, type, amount = 0) {
    const p = this.players[this.currentPlayerIndex];
    if (!p || p.id !== playerId || p.status !== 'active') return false;
    const toCall = this.currentBet - p.bet;

    switch (type) {
      case 'fold':
        p.status = 'folded'; break;
      case 'check':
        if (toCall > 0) return false; break;
      case 'call': {
        const c = Math.min(toCall, p.money);
        p.money -= c; p.bet += c; p.totalBet += c; this.pot += c;
        if (p.money === 0) p.status = 'all-in';
        break;
      }
      case 'raise': {
        const minTotal = this.currentBet + this.minRaise;
        // Allow raise if amount >= minTotal, or if it's an all-in (less than min)
        if (amount < minTotal && amount < p.money + p.bet) return false;
        const r = Math.min(amount - p.bet, p.money);
        if (r <= 0) return false;
        p.money -= r; p.bet += r; p.totalBet += r; this.pot += r;
        this.minRaise = Math.max(this.minRaise, p.bet - this.currentBet);
        this.currentBet = p.bet;
        this.lastRaiser = this.currentPlayerIndex;
        if (p.money === 0) p.status = 'all-in';
        // Reset hasActed for everyone else since there's a new bet to respond to
        for (const pl of this.players) { if (pl.id !== playerId) pl.hasActed = false; }
        break;
      }
      case 'all-in': {
        const a = p.money;
        if (a <= 0) return false;
        p.money = 0; p.bet += a; p.totalBet += a; this.pot += a;
        if (p.bet > this.currentBet) {
          this.minRaise = Math.max(this.minRaise, p.bet - this.currentBet);
          this.currentBet = p.bet;
          this.lastRaiser = this.currentPlayerIndex;
          for (const pl of this.players) { if (pl.id !== playerId) pl.hasActed = false; }
        }
        p.status = 'all-in';
        break;
      }
      default: return false;
    }
    p.hasActed = true;
    this.advance();
    return true;
  }

  advance() {
    const active = this.getActivePlayers(); // active + all-in
    const betting = this.getBettingPlayers(); // only active (can still bet)

    // Only 1 player left in the hand → they win
    if (active.length <= 1) { this.resolveWinner(); return; }
    // No one can bet anymore → reveal remaining cards
    if (betting.length === 0) { this.dealRemaining(); return; }
    // Only 1 person can bet and they've already acted → deal remaining
    if (betting.length === 1 && betting[0].hasActed && betting[0].bet >= this.currentBet) {
      this.dealRemaining(); return;
    }
    // Everyone who can bet has acted and matched the current bet → next phase
    if (betting.every(p => p.hasActed && p.bet === this.currentBet)) {
      this.nextPhase(); return;
    }

    // Find next active player
    const next = this.getNextActive(this.currentPlayerIndex);
    if (next === -1) { this.nextPhase(); return; }
    this.currentPlayerIndex = next;
    this.updateTurnMessage();
  }

  nextPhase() {
    for (const p of this.players) { p.bet = 0; p.hasActed = false; }
    this.currentBet = 0;
    this.minRaise = this.bigBlind;
    this.lastRaiser = -1;

    switch (this.phase) {
      case 'preflop':
        this.phase = 'flop';
        this.communityCards.push(...this.deck.deal(3));
        break;
      case 'flop':
        this.phase = 'turn';
        this.communityCards.push(this.deck.deal());
        break;
      case 'turn':
        this.phase = 'river';
        this.communityCards.push(this.deck.deal());
        break;
      case 'river':
        this.phase = 'showdown';
        this.resolveShowdown();
        return;
    }

    // Post-flop: action starts left of dealer
    const first = this.getNextActive(this.dealerIndex);
    if (first === -1 || this.getBettingPlayers().length <= 1) {
      this.dealRemaining(); return;
    }
    this.currentPlayerIndex = first;
    this.updateTurnMessage();
  }

  dealRemaining() {
    while (this.communityCards.length < 5) {
      if (this.communityCards.length === 0) this.communityCards.push(...this.deck.deal(3));
      else this.communityCards.push(this.deck.deal());
    }
    this.phase = 'showdown';
    this.resolveShowdown();
  }

  resolveShowdown() {
    const active = this.getActivePlayers();
    for (const p of active) {
      p.bestHand = getBestHand([...p.hand, ...this.communityCards]);
    }

    // Sort by hand strength (best first)
    const sorted = [...active].sort((a, b) => compareHands(b.bestHand, a.bestHand));

    // Handle side pots properly
    this.calculateSidePots();

    // Distribute pots
    for (const pot of this.sidePots) {
      // Among eligible players, find who has the best hand
      const eligible = sorted.filter(p => pot.eligible.includes(p.id));
      if (eligible.length > 0) {
        // Check for ties (split pot)
        const winners = [eligible[0]];
        for (let i = 1; i < eligible.length; i++) {
          if (compareHands(eligible[i].bestHand, eligible[0].bestHand) === 0) {
            winners.push(eligible[i]);
          } else break;
        }
        const share = Math.floor(pot.amount / winners.length);
        for (const w of winners) {
          w.money += share;
        }
      }
    }

    this.results = active.map(p => ({
      id: p.id, name: p.name, hand: p.hand,
      bestHand: p.bestHand, money: p.money,
      isWinner: p.money > 0 && sorted.indexOf(p) === 0
    }));

    // Mark the actual winner(s)
    if (sorted.length >= 2) {
      const best = sorted[0].bestHand;
      for (const r of this.results) {
        const player = sorted.find(s => s.id === r.id);
        r.isWinner = player && compareHands(player.bestHand, best) === 0;
      }
    }

    this.roundOver = true;
    this.turnMessage = '';
  }

  calculateSidePots() {
    const active = this.getActivePlayers();
    const allBets = active
      .map(p => ({ id: p.id, totalBet: p.totalBet }))
      .sort((a, b) => a.totalBet - b.totalBet);

    this.sidePots = [];
    let processed = 0;

    for (let i = 0; i < allBets.length; i++) {
      const level = allBets[i].totalBet;
      if (level <= processed) continue;

      const contribution = level - processed;
      let potAmount = 0;
      const eligible = [];

      for (const p of allBets) {
        if (p.totalBet > processed) {
          potAmount += Math.min(contribution, p.totalBet - processed);
          eligible.push(p.id);
        }
      }

      // Add contributions from folded players too
      for (const p of this.players) {
        if (p.status === 'folded' && p.totalBet > processed) {
          potAmount += Math.min(contribution, p.totalBet - processed);
        }
      }

      if (potAmount > 0) {
        this.sidePots.push({ amount: potAmount, eligible });
      }
      processed = level;
    }

    // If no side pots were created, just use the main pot
    if (this.sidePots.length === 0 && this.pot > 0) {
      this.sidePots.push({
        amount: this.pot,
        eligible: active.map(p => p.id)
      });
    }
  }

  resolveWinner() {
    const active = this.getActivePlayers();
    if (active.length === 0) return;
    const winner = active[0];
    winner.money += this.pot;
    this.results = [{
      id: winner.id, name: winner.name, hand: winner.hand,
      money: winner.money, isWinner: true,
      bestHand: null
    }];
    this.roundOver = true;
    this.phase = 'showdown';
    this.turnMessage = `${winner.name} remporte le pot !`;
  }

  updateTurnMessage() {
    if (this.currentPlayerIndex >= 0 && this.currentPlayerIndex < this.players.length) {
      const p = this.players[this.currentPlayerIndex];
      this.turnMessage = `C'est au tour de ${p.name}`;
    }
  }

  getRoleName(role) {
    switch (role) {
      case 'dealer': return 'D';
      case 'dealer/sb': return 'D/SB';
      case 'sb': return 'SB';
      case 'bb': return 'BB';
      default: return '';
    }
  }

  getState(playerId) {
    return {
      phase: this.phase, pot: this.pot, communityCards: this.communityCards,
      currentBet: this.currentBet, minRaise: this.minRaise,
      currentPlayerId: this.currentPlayerIndex >= 0 ? this.players[this.currentPlayerIndex]?.id : null,
      dealerIndex: this.dealerIndex, bigBlind: this.bigBlind, smallBlind: this.smallBlind,
      roundOver: this.roundOver,
      turnMessage: this.turnMessage,
      players: this.players.map(p => ({
        id: p.id, name: p.name, money: p.money,
        hand: p.id === playerId || this.phase === 'showdown' ? p.hand : p.hand.map(() => ({ value: 0, suit: 'back' })),
        bet: p.bet, totalBet: p.totalBet, status: p.status,
        bestHand: this.phase === 'showdown' ? p.bestHand : undefined,
        seatIndex: p.seatIndex,
        role: p.role,
        roleName: this.getRoleName(p.role)
      })),
      results: this.results
    };
  }
}

module.exports = PokerGame;
