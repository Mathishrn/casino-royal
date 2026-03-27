class CrapsGame {
  constructor(players) {
    this.players = players.map(p => ({
      id: p.id, name: p.name, money: p.money, startMoney: p.money,
      bets: {}, 
      status: 'betting'
    }));
    this.phase = 'betting'; 
    this.point = null;
    this.dice = [1, 1];
    this.sum = 2;
    this.results = [];
  }
  
  placeBet(playerId, betType, amount) {
    if (this.phase !== 'betting') return false;
    const p = this.players.find(x => x.id === playerId);
    if (!p || p.money < amount || amount <= 0) return false;
    
    // Pass/DontPass can generally only be made on Come Out roll (point = null)
    if ((betType === 'pass' || betType === 'dontPass') && this.point !== null) return false;
    
    p.money -= amount;
    p.bets[betType] = (p.bets[betType] || 0) + amount;
    return true;
  }
  
  clearBets(playerId) {
    if (this.phase !== 'betting') return false;
    const p = this.players.find(x => x.id === playerId);
    if (!p) return false;
    let refund = 0;
    for (const [t, amt] of Object.entries(p.bets)) {
      if ((t === 'pass' || t === 'dontPass') && this.point !== null) {
         continue; // Can't clear line bets during point phase
      }
      refund += amt;
      delete p.bets[t];
    }
    p.money += refund;
    return true;
  }

  confirmBets(playerId) {
    const p = this.players.find(x => x.id === playerId);
    if (p) p.status = 'ready';
    if (this.players.every(x => x.status === 'ready')) this.rollDice();
    return true;
  }
  
  rollDice() {
    this.phase = 'rolling';
    this.dice = [Math.floor(Math.random()*6)+1, Math.floor(Math.random()*6)+1];
    this.sum = this.dice[0] + this.dice[1];
    this.resolve();
  }
  
  resolve() {
    this.phase = 'done';
    this.results = [];
    const isComeOut = (this.point === null);
    const sum = this.sum;
    
    let nextPoint = this.point;
    
    if (isComeOut) {
       if (sum !== 7 && sum !== 11 && sum !== 2 && sum !== 3 && sum !== 12) {
         nextPoint = sum;
       }
    } else {
       if (sum === 7 || sum === this.point) {
         nextPoint = null;
       }
    }
    
    for (const p of this.players) {
       let netWin = 0;
       let payout = 0;
       let clearedBets = {};
       const r = { id: p.id, name: p.name, startMoney: p.startMoney, betDetails: [], netWin: 0, payout: 0 };
       
       for (const [type, amt] of Object.entries(p.bets)) {
         if (amt <= 0) continue;
         
         let winAmount = 0; 
         let resolved = false;
         
         if (type === 'pass') {
            if (isComeOut) {
               if (sum === 7 || sum === 11) { resolved = true; winAmount = amt; }
               else if (sum === 2 || sum === 3 || sum === 12) { resolved = true; winAmount = -amt; }
            } else {
               if (sum === this.point) { resolved = true; winAmount = amt; }
               else if (sum === 7) { resolved = true; winAmount = -amt; }
            }
         } else if (type === 'dontPass') {
            if (isComeOut) {
               if (sum === 2 || sum === 3) { resolved = true; winAmount = amt; }
               else if (sum === 12) { resolved = true; winAmount = 0; /* push */ }
               else if (sum === 7 || sum === 11) { resolved = true; winAmount = -amt; }
            } else {
               if (sum === 7) { resolved = true; winAmount = amt; }
               else if (sum === this.point) { resolved = true; winAmount = -amt; }
            }
         } else if (type === 'field') {
            resolved = true;
            if ([3,4,9,10,11].includes(sum)) winAmount = amt;
            else if (sum === 2) winAmount = Math.floor(amt * 2);
            else if (sum === 12) winAmount = Math.floor(amt * 3);
            else winAmount = -amt;
         } else if (type.startsWith('place')) { 
            const target = parseInt(type.replace('place', ''));
            if (sum === target) {
               resolved = true;
               if (target === 6 || target === 8) winAmount = Math.floor(amt * (7/6));
               else if (target === 5 || target === 9) winAmount = Math.floor(amt * (7/5));
               else winAmount = Math.floor(amt * (9/5));
            } else if (sum === 7) {
               resolved = true; winAmount = -amt;
            }
         }
         
         if (resolved) {
            clearedBets[type] = true;
            if (winAmount > 0) {
               payout += (amt + winAmount);
               netWin += winAmount;
               r.betDetails.push(`${type}: +${winAmount}€`);
            } else if (winAmount < 0) {
               netWin += winAmount;
               r.betDetails.push(`${type}: perdu`);
            } else {
               payout += amt; // Push
               r.betDetails.push(`${type}: push`);
            }
         }
       }
       
       p.money += payout;
       for (const t of Object.keys(clearedBets)) delete p.bets[t];
       
       r.netWin = netWin;
       r.payout = payout;
       r.winnings = netWin; 
       this.results.push(r);
    }
    
    this.point = nextPoint;
  }
  
  getState(playerId) {
    return {
       phase: this.phase,
       point: this.point,
       dice: this.dice,
       sum: this.sum,
       players: this.players.map(p => ({
         id: p.id, name: p.name, money: p.money, bets: p.bets, status: p.status
       })),
       results: this.phase === 'done' ? this.results : []
    };
  }
}

module.exports = CrapsGame;
