const Deck = require('./deck');

class BlackjackGame {
  constructor(players) {
    this.deck = new Deck();
    this.players = players.map(p => ({
      id: p.id, name: p.name, money: p.money,
      hand: [], bet: 0, status: 'betting', handValue: 0
    }));
    this.dealer = { hand: [], handValue: 0, status: 'waiting' };
    this.phase = 'betting';
    this.currentPlayerIndex = -1;
    this.results = [];
  }

  calcValue(hand) {
    let value = 0, aces = 0;
    for (const card of hand) {
      if (card.value === 14) { aces++; value += 11; }
      else if (card.value >= 11) value += 10;
      else value += card.value;
    }
    while (value > 21 && aces > 0) { value -= 10; aces--; }
    return value;
  }

  placeBet(playerId, amount) {
    const player = this.players.find(p => p.id === playerId);
    if (!player || this.phase !== 'betting') return false;
    if (amount > player.money || amount <= 0) return false;
    player.bet = amount;
    player.money -= amount; // Deduct bet from money immediately
    player.status = 'ready';
    if (this.players.every(p => p.status === 'ready')) this.dealInitial();
    return true;
  }

  dealInitial() {
    for (let i = 0; i < 2; i++) {
      for (const p of this.players) p.hand.push(this.deck.deal());
      this.dealer.hand.push(this.deck.deal());
    }
    for (const p of this.players) {
      p.handValue = this.calcValue(p.hand);
      p.status = p.handValue === 21 ? 'blackjack' : 'playing';
    }
    this.dealer.handValue = this.calcValue(this.dealer.hand);
    this.phase = 'playing';
    this.currentPlayerIndex = this.players.findIndex(p => p.status === 'playing');
    if (this.currentPlayerIndex === -1) this.dealerPlay();
  }

  hit(playerId) {
    const p = this.players[this.currentPlayerIndex];
    if (!p || p.id !== playerId || this.phase !== 'playing') return false;
    p.hand.push(this.deck.deal());
    p.handValue = this.calcValue(p.hand);
    if (p.handValue > 21) { p.status = 'bust'; this.nextPlayer(); }
    else if (p.handValue === 21) { p.status = 'stand'; this.nextPlayer(); }
    return true;
  }

  stand(playerId) {
    const p = this.players[this.currentPlayerIndex];
    if (!p || p.id !== playerId || this.phase !== 'playing') return false;
    p.status = 'stand';
    this.nextPlayer();
    return true;
  }

  doubleDown(playerId) {
    const p = this.players[this.currentPlayerIndex];
    if (!p || p.id !== playerId || this.phase !== 'playing') return false;
    if (p.hand.length !== 2 || p.bet > p.money) return false;
    // Deduct extra bet and double the bet amount
    p.money -= p.bet;
    p.bet *= 2;
    p.hand.push(this.deck.deal());
    p.handValue = this.calcValue(p.hand);
    p.status = p.handValue > 21 ? 'bust' : 'stand';
    this.nextPlayer();
    return true;
  }

  nextPlayer() {
    this.currentPlayerIndex++;
    while (this.currentPlayerIndex < this.players.length &&
      this.players[this.currentPlayerIndex].status !== 'playing') {
      this.currentPlayerIndex++;
    }
    if (this.currentPlayerIndex >= this.players.length) this.dealerPlay();
  }

  dealerPlay() {
    this.phase = 'dealer';
    const hasActive = this.players.some(p => p.status !== 'bust');
    if (hasActive) {
      while (this.dealer.handValue < 17) {
        this.dealer.hand.push(this.deck.deal());
        this.dealer.handValue = this.calcValue(this.dealer.hand);
      }
    }
    this.dealer.status = this.dealer.handValue > 21 ? 'bust' : 'stand';
    this.resolve();
  }

  resolve() {
    this.phase = 'done';
    this.results = [];
    for (const p of this.players) {
      let r = { id: p.id, name: p.name, bet: p.bet };
      // Money was already deducted when placing bet, so we only add back winnings
      if (p.status === 'bust') {
        r.outcome = 'lose'; r.winnings = 0; // Already lost the bet
      } else if (p.status === 'blackjack') {
        if (this.dealer.handValue === 21 && this.dealer.hand.length === 2) {
          r.outcome = 'push'; r.winnings = p.bet; // Return bet
        } else {
          r.outcome = 'blackjack'; r.winnings = p.bet + Math.floor(p.bet * 1.5); // Bet + 1.5x
        }
      } else if (this.dealer.status === 'bust') {
        r.outcome = 'win'; r.winnings = p.bet * 2; // Bet + profit
      } else if (p.handValue > this.dealer.handValue) {
        r.outcome = 'win'; r.winnings = p.bet * 2; // Bet + profit
      } else if (p.handValue === this.dealer.handValue) {
        r.outcome = 'push'; r.winnings = p.bet; // Return bet
      } else {
        r.outcome = 'lose'; r.winnings = 0; // Already lost
      }
      p.money += r.winnings;
      // For display: show net gain/loss
      r.netGain = r.winnings - p.bet;
      r.money = p.money;
      this.results.push(r);
    }
  }

  getState(playerId) {
    return {
      phase: this.phase,
      currentPlayerId: this.currentPlayerIndex >= 0 && this.currentPlayerIndex < this.players.length
        ? this.players[this.currentPlayerIndex].id : null,
      dealer: {
        hand: this.phase === 'betting' ? [] :
          this.phase === 'playing' ? [this.dealer.hand[0], { value: 0, suit: 'back' }] :
            this.dealer.hand,
        handValue: this.phase === 'done' || this.phase === 'dealer' ? this.dealer.handValue : '?',
        status: this.dealer.status
      },
      players: this.players.map(p => ({
        id: p.id, name: p.name, money: p.money,
        hand: p.hand, bet: p.bet, status: p.status, handValue: p.handValue
      })),
      results: this.results
    };
  }
}

module.exports = BlackjackGame;
