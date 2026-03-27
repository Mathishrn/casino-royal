function combinations(arr, k) {
  if (k === 0) return [[]];
  if (arr.length === 0) return [];
  const [first, ...rest] = arr;
  const withFirst = combinations(rest, k - 1).map(c => [first, ...c]);
  const withoutFirst = combinations(rest, k);
  return [...withFirst, ...withoutFirst];
}

function evaluateHand(cards) {
  const values = cards.map(c => c.value).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);
  const isFlush = suits.every(s => s === suits[0]);

  let isStraight = false;
  let straightHigh = 0;
  const uniqueValues = [...new Set(values)];

  if (uniqueValues.length === 5) {
    if (values[0] - values[4] === 4) {
      isStraight = true;
      straightHigh = values[0];
    }
    if (values[0] === 14 && values[1] === 5 && values[2] === 4 && values[3] === 3 && values[4] === 2) {
      isStraight = true;
      straightHigh = 5;
    }
  }

  const counts = {};
  values.forEach(v => counts[v] = (counts[v] || 0) + 1);
  const groups = Object.entries(counts)
    .map(([v, c]) => ({ value: parseInt(v), count: c }))
    .sort((a, b) => b.count - a.count || b.value - a.value);

  if (isFlush && isStraight) {
    if (straightHigh === 14) return { rank: 9, name: 'Quinte Flush Royale', highCards: [14] };
    return { rank: 8, name: 'Quinte Flush', highCards: [straightHigh] };
  }
  if (groups[0].count === 4) return { rank: 7, name: 'Carré', highCards: [groups[0].value, groups[1].value] };
  if (groups[0].count === 3 && groups[1].count === 2) return { rank: 6, name: 'Full', highCards: [groups[0].value, groups[1].value] };
  if (isFlush) return { rank: 5, name: 'Couleur', highCards: values };
  if (isStraight) return { rank: 4, name: 'Quinte', highCards: [straightHigh] };
  if (groups[0].count === 3) {
    const kickers = values.filter(v => v !== groups[0].value);
    return { rank: 3, name: 'Brelan', highCards: [groups[0].value, ...kickers] };
  }
  if (groups[0].count === 2 && groups[1].count === 2) {
    const pairHigh = Math.max(groups[0].value, groups[1].value);
    const pairLow = Math.min(groups[0].value, groups[1].value);
    const kicker = groups[2].value;
    return { rank: 2, name: 'Double Paire', highCards: [pairHigh, pairLow, kicker] };
  }
  if (groups[0].count === 2) {
    const kickers = values.filter(v => v !== groups[0].value);
    return { rank: 1, name: 'Paire', highCards: [groups[0].value, ...kickers] };
  }
  return { rank: 0, name: 'Carte Haute', highCards: values };
}

function compareHands(a, b) {
  if (a.rank !== b.rank) return a.rank - b.rank;
  for (let i = 0; i < Math.min(a.highCards.length, b.highCards.length); i++) {
    if (a.highCards[i] !== b.highCards[i]) return a.highCards[i] - b.highCards[i];
  }
  return 0;
}

function getBestHand(cards) {
  const combos = combinations(cards, 5);
  let best = null;
  for (const combo of combos) {
    const hand = evaluateHand(combo);
    if (!best || compareHands(hand, best) > 0) {
      best = hand;
      best.cards = combo;
    }
  }
  return best;
}

module.exports = { evaluateHand, compareHands, getBestHand, combinations };
