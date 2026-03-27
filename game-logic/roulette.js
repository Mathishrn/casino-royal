const REDS = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
const BLACKS = [2,4,6,8,10,11,13,15,17,20,22,24,26,28,29,31,33,35];

class RouletteGame {
  constructor(players) {
    this.players = players.map(p => ({
      id: p.id, name: p.name, money: p.money,
      bets: [], totalBet: 0, status: 'betting'
    }));
    this.phase = 'betting';
    this.result = null;
    this.history = [];
    this.results = [];
  }

  placeBet(playerId, betType, betValue, amount) {
    const p = this.players.find(pl => pl.id === playerId);
    if (!p || this.phase !== 'betting') return false;
    if (amount <= 0 || amount > p.money - p.totalBet) return false;
    p.bets.push({ type: betType, value: betValue, amount });
    p.totalBet += amount;
    return true;
  }

  clearBets(playerId) {
    const p = this.players.find(pl => pl.id === playerId);
    if (!p || this.phase !== 'betting') return false;
    p.bets = [];
    p.totalBet = 0;
    return true;
  }

  confirmBets(playerId) {
    const p = this.players.find(pl => pl.id === playerId);
    if (!p || this.phase !== 'betting') return false;
    if (p.bets.length === 0) return false;
    p.money -= p.totalBet;
    p.status = 'ready';
    if (this.players.every(pl => pl.status === 'ready')) this.spin();
    return true;
  }

  spin() {
    this.phase = 'spinning';
    this.result = Math.floor(Math.random() * 37);
    this.history.unshift(this.result);
    if (this.history.length > 20) this.history.pop();
    this.resolve();
  }

  checkBet(bet, number) {
    switch (bet.type) {
      case 'straight': return bet.value === number ? 35 : -1;
      case 'red': return REDS.includes(number) ? 1 : -1;
      case 'black': return BLACKS.includes(number) ? 1 : -1;
      case 'even': return number > 0 && number % 2 === 0 ? 1 : -1;
      case 'odd': return number > 0 && number % 2 === 1 ? 1 : -1;
      case 'low': return number >= 1 && number <= 18 ? 1 : -1;
      case 'high': return number >= 19 && number <= 36 ? 1 : -1;
      case 'dozen1': return number >= 1 && number <= 12 ? 2 : -1;
      case 'dozen2': return number >= 13 && number <= 24 ? 2 : -1;
      case 'dozen3': return number >= 25 && number <= 36 ? 2 : -1;
      case 'col1': return number > 0 && number % 3 === 1 ? 2 : -1;
      case 'col2': return number > 0 && number % 3 === 2 ? 2 : -1;
      case 'col3': return number > 0 && number % 3 === 0 ? 2 : -1;
      default: return -1;
    }
  }

  resolve() {
    this.phase = 'done';
    this.results = [];
    for (const p of this.players) {
      let totalWin = 0;
      const betResults = [];
      for (const bet of p.bets) {
        const mult = this.checkBet(bet, this.result);
        const winnings = mult >= 0 ? bet.amount * mult : -bet.amount;
        totalWin += mult >= 0 ? bet.amount * (mult + 1) : 0;
        betResults.push({ ...bet, winnings, won: mult >= 0 });
      }
      p.money += totalWin;
      this.results.push({
        id: p.id, name: p.name, money: p.money,
        bets: betResults, totalWin: totalWin - p.totalBet
      });
    }
  }

  newRound() {
    this.phase = 'betting';
    this.result = null;
    this.results = [];
    for (const p of this.players) {
      p.bets = []; p.totalBet = 0;
      p.status = p.money > 0 ? 'betting' : 'out';
    }
  }

  getState(playerId) {
    return {
      phase: this.phase, result: this.result, history: this.history,
      players: this.players.map(p => ({
        id: p.id, name: p.name, money: p.money,
        bets: p.bets, totalBet: p.totalBet, status: p.status
      })),
      results: this.results
    };
  }
}

module.exports = RouletteGame;
