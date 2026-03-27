const Deck = require('./deck');
const { getBestHand, compareHands } = require('./hand-evaluator');

class UltimateGame {
  constructor(players) {
    this.deck = new Deck();
    this.players = players.map(p => ({
      id: p.id, name: p.name, money: p.money,
      hand: [], ante: 0, blind: 0, play: 0,
      status: 'betting', hasRaised: false, bestHand: null
    }));
    this.dealer = { hand: [], bestHand: null };
    this.communityCards = [];
    this.phase = 'betting';
    this.results = [];
  }

  placeBet(playerId, amount) {
    const p = this.players.find(pl => pl.id === playerId);
    if (!p || this.phase !== 'betting') return false;
    if (amount * 2 > p.money || amount <= 0) return false;
    p.ante = amount;
    p.blind = amount;
    p.money -= amount * 2; // Deduct ante + blind
    p.status = 'ready';
    if (this.players.every(pl => pl.status === 'ready')) this.dealInitial();
    return true;
  }

  dealInitial() {
    for (let i = 0; i < 2; i++) {
      for (const p of this.players) p.hand.push(this.deck.deal());
      this.dealer.hand.push(this.deck.deal());
    }
    this.communityCards = this.deck.deal(5);
    this.phase = 'preflop';
    for (const p of this.players) p.status = 'acting';
  }

  playerAction(playerId, action) {
    const p = this.players.find(pl => pl.id === playerId);
    if (!p || p.status !== 'acting') return false;

    switch (this.phase) {
      case 'preflop':
        if (action === 'check') { p.status = 'waiting'; }
        else if (action === 'raise3') {
          const r = p.ante * 3;
          if (r > p.money) return false;
          p.play = r; p.money -= r; p.hasRaised = true; p.status = 'done';
        } else if (action === 'raise4') {
          const r = p.ante * 4;
          if (r > p.money) return false;
          p.play = r; p.money -= r; p.hasRaised = true; p.status = 'done';
        } else return false;
        break;
      case 'flop':
        if (p.hasRaised) { p.status = 'done'; return true; }
        if (action === 'check') { p.status = 'waiting'; }
        else if (action === 'raise2') {
          const r = p.ante * 2;
          if (r > p.money) return false;
          p.play = r; p.money -= r; p.hasRaised = true; p.status = 'done';
        } else return false;
        break;
      case 'river':
        if (p.hasRaised) { p.status = 'done'; return true; }
        if (action === 'fold') {
          p.status = 'folded';
        } else if (action === 'raise1') {
          const r = p.ante;
          if (r > p.money) return false;
          p.play = r; p.money -= r; p.hasRaised = true; p.status = 'done';
        } else return false;
        break;
    }

    this.checkPhaseComplete();
    return true;
  }

  checkPhaseComplete() {
    const acting = this.players.filter(p => p.status === 'acting');
    if (acting.length > 0) return;

    switch (this.phase) {
      case 'preflop':
        this.phase = 'flop';
        for (const p of this.players) {
          if (p.status === 'waiting') p.status = 'acting';
        }
        if (this.players.every(p => p.status === 'done' || p.status === 'folded')) {
          this.resolve();
        }
        break;
      case 'flop':
        this.phase = 'river';
        for (const p of this.players) {
          if (p.status === 'waiting') p.status = 'acting';
        }
        if (this.players.every(p => p.status === 'done' || p.status === 'folded')) {
          this.resolve();
        }
        break;
      case 'river':
        this.resolve();
        break;
    }
  }

  getBlindPay(rank) {
    // Payout multiplier on blind bet for strong hands
    if (rank >= 9) return 500; // Royal Flush
    if (rank >= 8) return 50;  // Straight Flush
    if (rank >= 7) return 10;  // Four of a Kind
    if (rank >= 6) return 3;   // Full House
    if (rank >= 5) return 1.5; // Flush
    if (rank >= 4) return 1;   // Straight
    return 0; // Trips or lower: blind pushes (returns bet)
  }

  resolve() {
    this.phase = 'done';
    const allCards = this.communityCards;
    this.dealer.bestHand = getBestHand([...this.dealer.hand, ...allCards]);
    // Dealer qualifies with a pair or better
    const dealerQualifies = this.dealer.bestHand.rank >= 1;

    this.results = [];
    for (const p of this.players) {
      const r = { id: p.id, name: p.name };
      
      if (p.status === 'folded') {
        // Folded: lose ante + blind (already deducted)
        r.outcome = 'fold';
        r.winnings = -(p.ante + p.blind);
        r.money = p.money;
        this.results.push(r);
        continue;
      }

      p.bestHand = getBestHand([...p.hand, ...allCards]);
      const cmp = compareHands(p.bestHand, this.dealer.bestHand);

      // Money was already deducted (ante + blind on placeBet, play on raise)
      // We need to calculate what to return to the player
      
      if (cmp > 0) {
        // PLAYER WINS
        let payout = 0;
        // Play bet: always paid 1:1 when winning
        payout += p.play * 2; // return play + win
        // Ante: paid 1:1 only if dealer qualifies, otherwise push (returned)
        payout += dealerQualifies ? p.ante * 2 : p.ante; // return ante (+ win if qualifies)
        // Blind: paid according to pay table
        const blindMult = this.getBlindPay(p.bestHand.rank);
        payout += p.blind + Math.floor(p.blind * blindMult); // return blind + bonus
        
        p.money += payout;
        r.outcome = 'win';
        r.winnings = payout - (p.ante + p.blind + p.play); // net gain
      } else if (cmp === 0) {
        // TIE: all bets push (returned)
        p.money += p.ante + p.blind + p.play;
        r.outcome = 'push';
        r.winnings = 0;
      } else {
        // PLAYER LOSES: already deducted, nothing to return
        r.outcome = 'lose';
        r.winnings = -(p.ante + p.blind + p.play);
      }

      r.money = p.money;
      r.bestHand = p.bestHand;
      this.results.push(r);
    }
  }

  getState(playerId) {
    const showDealer = this.phase === 'done';
    return {
      phase: this.phase,
      communityCards: this.phase === 'preflop' ? [] :
        this.phase === 'flop' ? this.communityCards.slice(0, 3) :
          this.communityCards,
      dealer: {
        hand: showDealer ? this.dealer.hand : this.dealer.hand.map(() => ({ value: 0, suit: 'back' })),
        bestHand: showDealer ? this.dealer.bestHand : null
      },
      players: this.players.map(p => ({
        id: p.id, name: p.name, money: p.money,
        hand: p.hand, ante: p.ante, blind: p.blind, play: p.play,
        status: p.status, hasRaised: p.hasRaised,
        bestHand: this.phase === 'done' ? p.bestHand : null
      })),
      results: this.results
    };
  }
}

module.exports = UltimateGame;
