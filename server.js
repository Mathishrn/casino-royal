const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const os = require('os');
const BlackjackGame = require('./game-logic/blackjack');
const PokerGame = require('./game-logic/poker');
const UltimateGame = require('./game-logic/ultimate');
const RouletteGame = require('./game-logic/roulette');
const CrapsGame = require('./game-logic/craps');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const rooms = new Map();
const playerRooms = new Map();

function genRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 4; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return rooms.has(id) ? genRoomId() : id;
}

function broadcastRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  for (const p of room.players) {
    const sock = io.sockets.sockets.get(p.id);
    if (sock) sock.emit('room-update', getRoomInfo(room, p.id));
  }
}

function broadcastGameState(roomId) {
  const room = rooms.get(roomId);
  if (!room || !room.game) return;
  for (const p of room.players) {
    const sock = io.sockets.sockets.get(p.id);
    if (sock) {
      const state = room.game.getState ? room.game.getState(p.id) : null;
      if (state) {
        // Inject room-level info into game state
        state.allPlayers = room.players.map(rp => ({ id: rp.id, name: rp.name, money: rp.money }));
        state.winCondition = room.winCondition;
        state.winValue = room.winValue;
        state.startMoney = room.startMoney;
        state.isHost = p.id === room.hostId;
        state.hostId = room.hostId;
      }
      sock.emit('game-update', state);
    }
  }
}

function getRoomInfo(room, playerId) {
  return {
    id: room.id, name: room.name, gameType: room.gameType,
    startMoney: room.startMoney, hostId: room.hostId,
    state: room.state, isHost: playerId === room.hostId,
    winCondition: room.winCondition, winValue: room.winValue,
    players: room.players.map(p => ({ id: p.id, name: p.name, money: p.money }))
  };
}

// Check if session should end based on win condition
function checkWinCondition(room) {
  if (!room.winCondition || room.winCondition === 'none') return null;

  for (const p of room.players) {
    switch (room.winCondition) {
      case 'first_zero':
        if (p.money <= 0) return { type: 'zero', player: p.name };
        break;
      case 'first_x2':
        if (p.money >= room.startMoney * 2) return { type: 'x2', player: p.name, amount: p.money };
        break;
      case 'first_x5':
        if (p.money >= room.startMoney * 5) return { type: 'x5', player: p.name, amount: p.money };
        break;
      case 'first_x10':
        if (p.money >= room.startMoney * 10) return { type: 'x10', player: p.name, amount: p.money };
        break;
    }
  }
  return null;
}

io.on('connection', (socket) => {
  console.log(`Joueur connecté: ${socket.id}`);

  socket.on('create-room', ({ playerName }) => {
    const roomId = genRoomId();
    const room = {
      id: roomId, name: `Salle de ${playerName}`,
      hostId: socket.id, gameType: null, startMoney: 1000,
      state: 'lobby', game: null,
      winCondition: 'none', winValue: 0,
      sessionStarted: false,
      players: [{ id: socket.id, name: playerName, money: 1000 }],
      sessionStats: { bestHand: null, bestWin: {player:'', amount:0} },
      pokerDealerIdx: 0,
    };
    rooms.set(roomId, room);
    playerRooms.set(socket.id, roomId);
    socket.join(roomId);
    socket.emit('room-joined', getRoomInfo(room, socket.id));
  });

  socket.on('join-room', ({ roomId, playerName }) => {
    const room = rooms.get(roomId.toUpperCase());
    if (!room) return socket.emit('error-msg', 'Salle introuvable');
    if (room.state === 'playing') return socket.emit('error-msg', 'Partie déjà en cours');
    if (room.players.length >= 8) return socket.emit('error-msg', 'Salle pleine');
    if (room.players.find(p => p.id === socket.id)) return socket.emit('error-msg', 'Déjà dans la salle');

    const money = room.sessionStarted ? room.startMoney : room.startMoney;
    room.players.push({ id: socket.id, name: playerName, money });
    playerRooms.set(socket.id, roomId.toUpperCase());
    socket.join(room.id);
    socket.emit('room-joined', getRoomInfo(room, socket.id));
    broadcastRoom(room.id);
  });

  socket.on('update-settings', ({ gameType, startMoney, winCondition }) => {
    const roomId = playerRooms.get(socket.id);
    const room = rooms.get(roomId);
    if (!room || room.hostId !== socket.id) return;
    
    // Only allow changing startMoney/winCondition before session starts
    if (!room.sessionStarted) {
      if (startMoney && startMoney >= 100) {
        room.startMoney = startMoney;
        room.players.forEach(p => p.money = startMoney);
      }
      if (winCondition !== undefined) room.winCondition = winCondition;
    }
    
    // Game type can always be changed while in lobby
    if (gameType && room.state === 'lobby') room.gameType = gameType;
    
    broadcastRoom(roomId);
  });

  socket.on('start-game', () => {
    const roomId = playerRooms.get(socket.id);
    const room = rooms.get(roomId);
    if (!room || room.hostId !== socket.id || !room.gameType) return;
    if (room.gameType === 'poker' && room.players.length < 2) {
      return socket.emit('error-msg', 'Il faut au moins 2 joueurs pour le poker');
    }

    room.state = 'playing';
    room.sessionStarted = true;
    const playerData = room.players.map(p => ({ id: p.id, name: p.name, money: p.money }));

    switch (room.gameType) {
      case 'blackjack': room.game = new BlackjackGame(playerData); break;
      case 'poker':
        room.game = new PokerGame(playerData, room.startMoney);
        room.game.startRound(room.pokerDealerIdx || 0);
        break;
      case 'ultimate': room.game = new UltimateGame(playerData); break;
      case 'roulette': room.game = new RouletteGame(playerData); break;
      case 'craps': room.game = new CrapsGame(playerData); break;
    }

    for (const p of room.players) {
      const sock = io.sockets.sockets.get(p.id);
      if (sock) sock.emit('game-started', { gameType: room.gameType });
    }
    broadcastGameState(roomId);
  });

  socket.on('game-action', ({ action, data }) => {
    const roomId = playerRooms.get(socket.id);
    const room = rooms.get(roomId);
    if (!room || !room.game || room.state !== 'playing') return;

    let success = false;
    const g = room.game;

    switch (room.gameType) {
      case 'blackjack':
        if (action === 'bet') success = g.placeBet(socket.id, data.amount);
        else if (action === 'hit') success = g.hit(socket.id);
        else if (action === 'stand') success = g.stand(socket.id);
        else if (action === 'double') success = g.doubleDown(socket.id);
        break;
      case 'poker':
        if (action === 'poker-action') success = g.action(socket.id, data.type, data.amount);
        break;
      case 'ultimate':
        if (action === 'bet') success = g.placeBet(socket.id, data.amount, data.trips || 0);
        else if (action === 'action') success = g.playerAction(socket.id, data.type);
        break;
      case 'roulette':
        if (action === 'place-bet') success = g.placeBet(socket.id, data.betType, data.betValue, data.amount);
        else if (action === 'clear-bets') success = g.clearBets(socket.id);
        else if (action === 'confirm-bets') success = g.confirmBets(socket.id);
        break;
    }

    if (!success) socket.emit('error-msg', 'Action invalide');

    // Sync money after round done
    const isDone = (room.gameType === 'blackjack' && g.phase === 'done') ||
                   (room.gameType === 'poker' && g.roundOver) ||
                   (room.gameType === 'ultimate' && g.phase === 'done') ||
                   (room.gameType === 'roulette' && g.phase === 'done') ||
                   (room.gameType === 'craps' && g.phase === 'done');
    
    if (isDone) {
      if ((room.gameType === 'poker' || room.gameType === 'ultimate') && g.players) {
        g.players.forEach(p => {
          if (p.bestHand && p.bestHand.rank > 0) {
            if (!room.sessionStats.bestHand || p.bestHand.rank > room.sessionStats.bestHand.rank) {
              room.sessionStats.bestHand = { player: p.name, name: p.bestHand.name, cards: p.bestHand.cards, rank: p.bestHand.rank };
            }
          }
        });
      }
      if (g.results) {
        g.results.forEach(r => {
          const win = r.winnings !== undefined ? r.winnings : (r.netWin || 0);
          if (win > room.sessionStats.bestWin.amount) {
            room.sessionStats.bestWin = { player: r.name, amount: win };
          }
        });
      }
      syncMoney(room);
    }

    broadcastGameState(roomId);

    // Check win condition after sync
    if (isDone) {
      const result = checkWinCondition(room);
      if (result) {
        setTimeout(() => {
          for (const p of room.players) {
            const sock = io.sockets.sockets.get(p.id);
            if (sock) sock.emit('session-ended', {
              reason: result,
              players: room.players.map(rp => ({ name: rp.name, money: rp.money }))
            });
          }
          room.state = 'lobby';
          room.game = null;
          room.sessionStarted = false;
          room.pokerDealerIdx = 0;
          room.players.forEach(p => p.money = room.startMoney);
          broadcastRoom(roomId);
        }, 4000); // wait for results display
      }
    }
  });

  socket.on('next-round', () => {
    const roomId = playerRooms.get(socket.id);
    const room = rooms.get(roomId);
    if (!room || !room.game) return;
    // Only host can start next round
    if (room.hostId !== socket.id) return socket.emit('error-msg', 'Seul l\'hôte peut lancer la prochaine manche');

    const playerData = room.players.map(p => ({ id: p.id, name: p.name, money: p.money }));

    switch (room.gameType) {
      case 'blackjack':
        room.game = new BlackjackGame(playerData);
        break;
      case 'poker':
        room.pokerDealerIdx = ((room.pokerDealerIdx || 0) + 1) % room.players.length;
        room.game = new PokerGame(playerData, room.startMoney);
        room.game.startRound(room.pokerDealerIdx);
        break;
      case 'ultimate':
        room.game = new UltimateGame(playerData);
        break;
      case 'roulette':
        room.game.newRound();
        break;
    }
    broadcastGameState(roomId);
  });

  // Switch game without resetting bankroll
  socket.on('switch-game', ({ gameType }) => {
    const roomId = playerRooms.get(socket.id);
    const room = rooms.get(roomId);
    if (!room || room.hostId !== socket.id) return;
    
    room.gameType = gameType;
    room.game = null;
    room.state = 'lobby';
    
    // DON'T reset money - keep bankrolls!
    for (const p of room.players) {
      const sock = io.sockets.sockets.get(p.id);
      if (sock) sock.emit('back-to-lobby');
    }
    broadcastRoom(roomId);
  });

  socket.on('leave-room', () => {
    leaveRoom(socket);
  });

  // Back to lobby keeping money (just switch game)
  socket.on('back-to-lobby', () => {
    const roomId = playerRooms.get(socket.id);
    const room = rooms.get(roomId);
    if (!room || room.hostId !== socket.id) return;
    room.state = 'lobby';
    room.game = null;
    // DON'T reset money
    for (const p of room.players) {
      const sock = io.sockets.sockets.get(p.id);
      if (sock) sock.emit('back-to-lobby');
    }
    broadcastRoom(roomId);
  });

  // End entire session with stats and ranking
  socket.on('end-session', () => {
    const roomId = playerRooms.get(socket.id);
    const room = rooms.get(roomId);
    if (!room || room.hostId !== socket.id) return;
    
    // Build stats per player
    const stats = room.players.map(p => ({
      name: p.name,
      startMoney: room.startMoney,
      finalMoney: p.money,
      gain: p.money - room.startMoney,
      gainPercent: Math.round(((p.money - room.startMoney) / room.startMoney) * 100)
    })).sort((a, b) => b.finalMoney - a.finalMoney);
    
    // Send end-session with stats to all
    for (const p of room.players) {
      const sock = io.sockets.sockets.get(p.id);
      if (sock) sock.emit('session-ended-stats', { stats, startMoney: room.startMoney, sessionStats: room.sessionStats });
    }
    
    room.state = 'lobby';
    room.game = null;
    room.sessionStarted = false;
    room.sessionStats = { bestHand: null, bestWin: {player:'', amount:0} };
    room.pokerDealerIdx = 0;
    room.players.forEach(p => p.money = room.startMoney);
    broadcastRoom(roomId);
  });

  socket.on('player-emote', (data) => {
    const roomId = playerRooms.get(socket.id);
    if (!roomId) return;
    socket.to(roomId).emit('show-emote', { playerId: socket.id, emote: data.emote });
  });

  socket.on('disconnect', () => {
    console.log(`Joueur déconnecté: ${socket.id}`);
    leaveRoom(socket);
  });
});

function syncMoney(room) {
  const g = room.game;
  if (!g) return;
  const gamePlayers = g.players || [];
  for (const gp of gamePlayers) {
    const rp = room.players.find(p => p.id === gp.id);
    if (rp) rp.money = gp.money;
  }
}

function leaveRoom(socket) {
  const roomId = playerRooms.get(socket.id);
  if (!roomId) return;
  const room = rooms.get(roomId);
  if (!room) { playerRooms.delete(socket.id); return; }

  room.players = room.players.filter(p => p.id !== socket.id);
  playerRooms.delete(socket.id);
  socket.leave(roomId);

  if (room.players.length === 0) {
    rooms.delete(roomId);
  } else {
    if (room.hostId === socket.id) room.hostId = room.players[0].id;
    broadcastRoom(roomId);
    io.to(roomId).emit('player-left', { message: 'Un joueur a quitté la salle' });
  }
}

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  console.log('╔══════════════════════════════════════════╗');
  console.log('║        🎰 CASINO MULTIJOUEUR 🎰         ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  Local:   http://localhost:${PORT}          ║`);
  console.log(`║  Réseau:  http://${ip}:${PORT}     ║`);
  console.log('╠══════════════════════════════════════════╣');
  console.log('║  Partagez l\'adresse réseau avec vos amis ║');
  console.log('╚══════════════════════════════════════════╝');
});
