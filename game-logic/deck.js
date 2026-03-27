class Deck {
  constructor() {
    this.reset();
  }

  reset() {
    this.cards = [];
    const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
    for (const suit of suits) {
      for (let value = 2; value <= 14; value++) {
        this.cards.push({ value, suit });
      }
    }
    this.shuffle();
  }

  shuffle() {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  deal(count = 1) {
    if (count === 1) return this.cards.pop();
    return Array.from({ length: count }, () => this.cards.pop());
  }

  get remaining() {
    return this.cards.length;
  }
}

module.exports = Deck;
