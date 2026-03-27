const Deck = require('./deck');
const { getBestHand, compareHands } = require('./hand-evaluator');

/**
 * Ultimate Texas Hold'em - Official Rules
 * 
 * Betting spots: Ante, Blind (equal to Ante), Trips (optional bonus), Play
 * 
 * Flow:
 * 1. Players place Ante + Blind (equal & mandatory) and optionally Trips
 * 2. Deal 2 cards to each player and dealer
 * 3. Pre-flop: Check or Raise 3x/4x Ante (Play bet)
 * 4. Flop (3 community cards): Check or Raise 2x Ante
 * 5. River (2 more cards): Fold or Raise 1x Ante
 * 6. Showdown: Compare hands
 * 
 * Payouts:
 * - Play: 1:1
 * - Ante: 1:1 if dealer qualifies (pair or better), push otherwise
 * - Blind: pays according to Blind paytable (only on wins)
 * - Trips: pays regardless of win/loss according to Trips paytable
 */
class UltimateGame {
  constructor(players) {
    this.deck = new Deck();
    this.players = players.map(p => ({
      id: p.id, name: p.name, money: p.money,
      hand: [], ante: 0, blind: 0, trips: 0, play: 0,
      status: 'betting', hasRaised: false, bestHand: null
    }));
    this.dealer = { hand: [], bestHand: null };
    this.communityCards = [];
    this.phase = 'betting'; // betting, preflop, flop, river, done
    this.results = [];
  }

  // Place Ante + Blind + optional Trips
  placeBet(playerId, anteAmount, tripsAmount = 0) {
    const p = this.players.find(pl => pl.id === playerId);
    if (!p || this.phase !== 'betting') return false;
    const totalNeeded = anteAmount * 2 + tripsAmount; // ante + blind + trips
    if (totalNeeded > p.money || anteAmount <= 0) return false;
    if (tripsAmount < 0) return false;
    
    p.ante = anteAmount;
    p.blind = anteAmount; // Blind = Ante always
    p.trips = tripsAmount;
    p.money -= totalNeeded;
    p.status = 'ready';
    
    if (this.players.every(pl => pl.status === 'ready')) this.dealInitial();
    return true;
  }

  dealInitial() {
    // Deal 2 cards to each player and dealer
    for (let i = 0; i < 2; i++) {
      for (const p of this.players) p.hand.push(this.deck.deal());
      this.dealer.hand.push(this.deck.deal());
    }
    // Pre-deal all 5 community cards (revealed progressively)
    this.communityCards = this.deck.deal(5);
    this.phase = 'preflop';
    for (const p of this.players) p.status = 'acting';
  }

  playerAction(playerId, action) {
    const p = this.players.find(pl => pl.id === playerId);
    if (!p || p.status !== 'acting') return false;

    switch (this.phase) {
      case 'preflop':
        if (action === 'check') {
          p.status = 'waiting';
        } else if (action === 'raise3') {
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
        if (action === 'check') {
          p.status = 'waiting';
        } else if (action === 'raise2') {
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

  // Official Blind Paytable (pays only on player win)
  getBlindPay(rank) {
    switch (rank) {
      case 9: return 500;  // Royal Flush
      case 8: return 50;   // Straight Flush
      case 7: return 10;   // Four of a Kind
      case 6: return 3;    // Full House
      case 5: return 1.5;  // Flush
      case 4: return 1;    // Straight
      default: return 0;   // Trips or lower → push (returns blind)
    }
  }

  // Official Trips Bonus Paytable (pays regardless of dealer hand)
  getTripsPay(rank) {
    switch (rank) {
      case 9: return 50;   // Royal Flush
      case 8: return 40;   // Straight Flush
      case 7: return 30;   // Four of a Kind
      case 6: return 8;    // Full House
      case 5: return 6;    // Flush
      case 4: return 5;    // Straight
      case 3: return 3;    // Three of a Kind
      default: return -1;  // Lose trips bet
    }
  }

  resolve() {
    this.phase = 'done';
    this.dealer.bestHand = getBestHand([...this.dealer.hand, ...this.communityCards]);
    // Dealer qualifies with a pair or better
    const dealerQualifies = this.dealer.bestHand.rank >= 1;

    this.results = [];
    for (const p of this.players) {
      const r = { id: p.id, name: p.name, ante: p.ante, blind: p.blind, trips: p.trips, play: p.play };

      // === TRIPS BONUS (always pays based on player hand, regardless of win/loss) ===
      let tripsResult = 0;
      let tripsOutcome = '';
      
      if (p.status === 'folded') {
        // Folded: lose ante + blind, keep no refund. Trips still evaluated.
        if (p.trips > 0) {
          p.bestHand = getBestHand([...p.hand, ...this.communityCards]);
          const tripsMult = this.getTripsPay(p.bestHand.rank);
          if (tripsMult >= 0) {
            tripsResult = Math.floor(p.trips * tripsMult);
            p.money += p.trips + tripsResult; // return trips + winnings
            tripsOutcome = `Trips: +${tripsResult}€`;
          } else {
            tripsOutcome = 'Trips: perdu';
          }
        }
        r.outcome = 'fold';
        r.winnings = -(p.ante + p.blind) + tripsResult;
        r.tripsOutcome = tripsOutcome;
        r.money = p.money;
        r.bestHand = p.bestHand;
        this.results.push(r);
        continue;
      }

      // Evaluate player hand
      p.bestHand = getBestHand([...p.hand, ...this.communityCards]);
      const cmp = compareHands(p.bestHand, this.dealer.bestHand);

      // Trips bonus (independent of win/loss vs dealer)
      if (p.trips > 0) {
        const tripsMult = this.getTripsPay(p.bestHand.rank);
        if (tripsMult >= 0) {
          tripsResult = Math.floor(p.trips * tripsMult);
          p.money += p.trips + tripsResult;
          tripsOutcome = `Trips: +${tripsResult}€`;
        } else {
          tripsOutcome = 'Trips: perdu';
        }
      }

      let payout = 0;

      if (cmp > 0) {
        // === PLAYER WINS ===
        // Play: 1:1
        payout += p.play * 2;
        // Ante: 1:1 if dealer qualifies, push if not
        payout += dealerQualifies ? p.ante * 2 : p.ante;
        // Blind: pay according to blind paytable
        const blindMult = this.getBlindPay(p.bestHand.rank);
        if (blindMult > 0) {
          payout += p.blind + Math.floor(p.blind * blindMult);
        } else {
          payout += p.blind; // Push: return blind
        }
        r.outcome = 'win';
      } else if (cmp === 0) {
        // === TIE: all bets push ===
        payout += p.ante + p.blind + p.play;
        r.outcome = 'push';
      } else {
        // === PLAYER LOSES: lose all bets ===
        r.outcome = 'lose';
      }

      p.money += payout;
      r.winnings = payout - (p.ante + p.blind + p.play) + tripsResult;
      r.tripsOutcome = tripsOutcome;
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
        hand: p.hand, ante: p.ante, blind: p.blind, trips: p.trips, play: p.play,
        status: p.status, hasRaised: p.hasRaised,
        bestHand: this.phase === 'done' ? p.bestHand : null
      })),
      results: this.results
    };
  }
}

module.exports = UltimateGame;
