const Deck = require('./deck');
const { getBestHand, compareHands } = require('./hand-evaluator');

class PokerGame {
  constructor(players) {
    this.deck = new Deck();
    this.players = players.map((p, i) => ({
      id: p.id, name: p.name, money: p.money,
      hand: [], bet: 0, totalBet: 0,
      status: p.money > 0 ? 'active' : 'out',
      hasActed: false, seatIndex: i, bestHand: null
    }));
    this.communityCards = [];
    this.pot = 0;
    this.phase = 'waiting';
    this.dealerIndex = 0;
    this.currentPlayerIndex = -1;
    this.currentBet = 0;
    this.minRaise = 0;
    this.bigBlind = 0;
    this.smallBlind = 0;
    this.results = [];
    this.roundOver = false;
  }

  getNextActive(from) {
    let idx = (from + 1) % this.players.length;
    for (let i = 0; i < this.players.length; i++) {
      if (this.players[idx].status === 'active') return idx;
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
    this.phase = 'preflop';
    this.dealerIndex = dealerIdx;
    this.results = [];
    this.roundOver = false;

    for (const p of this.players) {
      p.hand = []; p.bet = 0; p.totalBet = 0; p.hasActed = false; p.bestHand = null;
      p.status = p.money > 0 ? 'active' : 'out';
    }

    const active = this.getActivePlayers();
    if (active.length < 2) return false;

    this.bigBlind = Math.max(10, Math.floor(active[0].money / 50));
    this.smallBlind = Math.floor(this.bigBlind / 2);
    this.minRaise = this.bigBlind;

    const sbIdx = this.getNextActive(this.dealerIndex);
    const bbIdx = this.getNextActive(sbIdx);

    this.postBlind(sbIdx, this.smallBlind);
    this.postBlind(bbIdx, this.bigBlind);
    this.currentBet = this.bigBlind;

    for (let i = 0; i < 2; i++) {
      for (const p of this.players) {
        if (p.status !== 'out') p.hand.push(this.deck.deal());
      }
    }

    this.currentPlayerIndex = this.getNextActive(bbIdx);
    return true;
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
        if (amount < minTotal && amount < p.money + p.bet) return false;
        const r = Math.min(amount - p.bet, p.money);
        p.money -= r; p.bet += r; p.totalBet += r; this.pot += r;
        this.minRaise = p.bet - this.currentBet;
        this.currentBet = p.bet;
        if (p.money === 0) p.status = 'all-in';
        // Reset hasActed for everyone else
        for (const pl of this.players) { if (pl.id !== playerId) pl.hasActed = false; }
        break;
      }
      case 'all-in': {
        const a = p.money;
        p.money = 0; p.bet += a; p.totalBet += a; this.pot += a;
        if (p.bet > this.currentBet) {
          this.minRaise = p.bet - this.currentBet;
          this.currentBet = p.bet;
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
    const active = this.getActivePlayers();
    const betting = this.getBettingPlayers();

    if (active.length <= 1) { this.resolveWinner(); return; }
    if (betting.length === 0) { this.dealRemaining(); return; }
    if (betting.length >= 1 && betting.every(p => p.hasActed && p.bet === this.currentBet)) {
      this.nextPhase(); return;
    }

    const next = this.getNextActive(this.currentPlayerIndex);
    if (next === -1) { this.nextPhase(); return; }
    this.currentPlayerIndex = next;
  }

  nextPhase() {
    for (const p of this.players) { p.bet = 0; p.hasActed = false; }
    this.currentBet = 0;
    this.minRaise = this.bigBlind;

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

    const first = this.getNextActive(this.dealerIndex);
    if (first === -1 || this.getBettingPlayers().length <= 1) {
      this.dealRemaining(); return;
    }
    this.currentPlayerIndex = first;
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
    active.sort((a, b) => compareHands(b.bestHand, a.bestHand));
    const winner = active[0];
    winner.money += this.pot;
    this.results = active.map(p => ({
      id: p.id, name: p.name, hand: p.hand,
      bestHand: p.bestHand, money: p.money, isWinner: p.id === winner.id
    }));
    this.roundOver = true;
  }

  resolveWinner() {
    const winner = this.getActivePlayers()[0];
    winner.money += this.pot;
    this.results = [{ id: winner.id, name: winner.name, hand: winner.hand, money: winner.money, isWinner: true }];
    this.roundOver = true;
    this.phase = 'showdown';
  }

  getState(playerId) {
    return {
      phase: this.phase, pot: this.pot, communityCards: this.communityCards,
      currentBet: this.currentBet, minRaise: this.minRaise,
      currentPlayerId: this.currentPlayerIndex >= 0 ? this.players[this.currentPlayerIndex]?.id : null,
      dealerIndex: this.dealerIndex, bigBlind: this.bigBlind, smallBlind: this.smallBlind,
      roundOver: this.roundOver,
      players: this.players.map(p => ({
        id: p.id, name: p.name, money: p.money,
        hand: p.id === playerId || this.phase === 'showdown' ? p.hand : p.hand.map(() => ({ value: 0, suit: 'back' })),
        bet: p.bet, totalBet: p.totalBet, status: p.status,
        bestHand: this.phase === 'showdown' ? p.bestHand : undefined,
        seatIndex: p.seatIndex
      })),
      results: this.results
    };
  }
}

module.exports = PokerGame;
