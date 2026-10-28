'use strict';
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const http = require('node:http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: false } });
const rooms = new Map();
const NATURAL = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const PITCH_NAMES = ['C', 'C♯/D♭', 'D', 'D♯/E♭', 'E', 'F', 'F♯/G♭', 'G', 'G♯/A♭', 'A', 'A♯/B♭', 'B'];
const NATURAL_PCS = new Set([0, 2, 4, 5, 7, 9, 11]);
const SCALE_STEPS = [0, 2, 4, 5, 7, 9, 11, 12];
const LEVELS = new Set(['beginner', 'intermediate', 'advanced', 'expert']);
const PORT = Number(process.env.PORT) || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.get('/healthz', (_req, res) => res.json({ ok: true, version: '1.2.1' }));

function cleanName(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 18) : '';
}
function makeCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do { code = Array.from({ length: 8 }, () => alphabet[crypto.randomInt(alphabet.length)]).join(''); } while (rooms.has(code));
  return code;
}
function noteOctave(midi) { return Math.floor(midi / 12) - 1; }
function noteLabel(midi, level) {
  const pitch = midi % 12;
  const octave = noteOctave(midi);
  if (level === 'beginner') return PITCH_NAMES[pitch];
  if (level === 'intermediate') return `${PITCH_NAMES[pitch]}${octave}`;
  return `${PITCH_NAMES[pitch]}${octave}`;
}
function scaleLabel(midi, level) {
  const pitch = midi % 12;
  const octave = noteOctave(midi);
  const root = PITCH_NAMES[pitch];
  if (level === 'beginner') return `${root} major`;
  return `${root} major · ${octave}`;
}
function shuffle(values) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
function chooseOptions(answer, pool, labels, count = 4) {
  const distractors = [...new Set(pool.filter(m => labels(m) !== answer).map(labels))];
  return shuffle([answer, ...shuffle(distractors).slice(0, count - 1)]);
}
function notePool(level) {
  if (level === 'beginner') return Array.from({ length: 12 }, (_, i) => 60 + i).filter(m => NATURAL_PCS.has(m % 12));
  if (level === 'intermediate') return Array.from({ length: 36 }, (_, i) => 48 + i).filter(m => NATURAL_PCS.has(m % 12));
  if (level === 'advanced') return Array.from({ length: 12 }, (_, i) => 60 + i);
  return Array.from({ length: 88 }, (_, i) => 21 + i);
}
function scalePool(level) {
  if (level === 'beginner') return Array.from({ length: 12 }, (_, i) => 60 + i).filter(m => NATURAL_PCS.has(m % 12));
  if (level === 'intermediate') return Array.from({ length: 36 }, (_, i) => 48 + i).filter(m => NATURAL_PCS.has(m % 12));
  if (level === 'advanced') return Array.from({ length: 12 }, (_, i) => 60 + i);
  return Array.from({ length: 76 }, (_, i) => 21 + i);
}
function createWave(midiNotes) {
  const sampleRate = 22050;
  const noteDuration = midiNotes.length === 1 ? 0.95 : 0.36;
  const gap = midiNotes.length === 1 ? 0 : 0.06;
  const frames = Math.ceil(midiNotes.length * noteDuration * sampleRate + Math.max(0, midiNotes.length - 1) * gap * sampleRate);
  const wav = Buffer.alloc(44 + frames * 2);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + frames * 2, 4); wav.write('WAVE', 8);
  wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i++) {
    const time = i / sampleRate;
    const noteIndex = Math.min(midiNotes.length - 1, Math.floor(time / (noteDuration + gap)));
    const within = time - noteIndex * (noteDuration + gap);
    if (within >= noteDuration) continue;
    const midi = midiNotes[noteIndex];
    const frequency = 440 * Math.pow(2, (midi - 69) / 12);
    const attack = Math.min(1, within / 0.018);
    const release = Math.min(1, (noteDuration - within) / 0.12);
    const envelope = Math.max(0, Math.min(attack, release));
    const sample = Math.sin(2 * Math.PI * frequency * within) * 0.22 + Math.sin(4 * Math.PI * frequency * within) * 0.055;
    wav.writeInt16LE(Math.max(-1, Math.min(1, sample * envelope)) * 32767, 44 + i * 2);
  }
  return `data:audio/wav;base64,${wav.toString('base64')}`;
}
function buildChallenge(mode, level) {
  const pool = mode === 'note' ? notePool(level) : scalePool(level);
  const targetMidi = pool[crypto.randomInt(pool.length)];
  const label = mode === 'note' ? noteLabel : scaleLabel;
  const answer = label(targetMidi, level);
  const choices = level === 'beginner'
    ? NATURAL.map(n => mode === 'note' ? n : `${n} major`)
    : level === 'advanced'
      ? (mode === 'note'
        ? Array.from({ length: 12 }, (_, i) => noteLabel(60 + i, level))
        : Array.from({ length: 12 }, (_, i) => scaleLabel(60 + i, level)))
      : chooseOptions(answer, pool, m => label(m, level));
  const midiNotes = mode === 'note' ? [targetMidi] : SCALE_STEPS.map(step => targetMidi + step);
  return { answer, choices, soundData: createWave(midiNotes) };
}
function publicState(room, selfId) {
  return {
    code: room.code, mode: room.mode, level: room.level, phase: room.phase,
    players: room.players.map((p, i) => ({ name: p.name, score: p.score, isSelf: p.id === selfId, isPlayer1: i === 0 }))
  };
}
function updateRoom(room) {
  for (const p of room.players) p.socket.emit('room_update', publicState(room, p.id));
}
function startRound(room) {
  if (room.players.length !== 2 || !room.players.every(p => p.confirmed)) return;
  room.round += 1;
  room.phase = 'playing';
  const challenge = buildChallenge(room.mode, room.level);
  room.current = { id: crypto.randomUUID(), answer: challenge.answer, choices: challenge.choices, soundData: challenge.soundData };
  for (const p of room.players) {
    p.answer = null; p.correct = false; p.ready = false;
    p.socket.emit('round_started', {
      roundId: room.current.id, number: room.round, mode: room.mode, level: room.level,
      choices: room.current.choices, soundData: room.current.soundData,
      players: room.players.map(other => ({ name: other.name, score: other.score, isSelf: other.id === p.id }))
    });
  }
}
function removePlayer(socket, notify = true) {
  const code = socket.data.roomCode;
  if (!code) return;
  const room = rooms.get(code);
  socket.data.roomCode = null;
  if (!room) return;
  room.players = room.players.filter(p => p.id !== socket.id);
  room.current = null; room.phase = 'waiting';
  if (!room.players.length) { rooms.delete(code); return; }
  if (notify) io.to(code).emit('partner_left', { code });
  updateRoom(room);
}
function sendError(socket, message) { socket.emit('room_error', { message }); }

io.on('connection', socket => {
  socket.data.roomCode = null;
  socket.on('create_room', payload => {
    if (socket.data.roomCode) return sendError(socket, 'Leave your current room before creating another.');
    const name = cleanName(payload?.name), mode = payload?.mode, level = payload?.level;
    if (!name) return sendError(socket, 'Enter your name first.');
    if (!['note', 'scale'].includes(mode)) return sendError(socket, 'Choose Note Guess or Scale Scout.');
    if (!LEVELS.has(level)) return sendError(socket, 'Choose a valid difficulty level.');
    const code = makeCode();
    const room = { code, mode, level, players: [], round: 0, phase: 'waiting', current: null };
    rooms.set(code, room);
    const player = { id: socket.id, socket, name, score: 0, answer: null, correct: false, ready: false, confirmed: true };
    room.players.push(player); socket.data.roomCode = code; socket.join(code);
    socket.emit('room_created', { code, mode, level }); updateRoom(room);
  });

  socket.on('join_room', payload => {
    if (socket.data.roomCode) return sendError(socket, 'Leave your current room before joining another.');
    const name = cleanName(payload?.name), code = typeof payload?.code === 'string' ? payload.code.trim().toUpperCase() : '';
    if (!name) return sendError(socket, 'Enter your name first.');
    if (!/^[A-HJ-NP-Z2-9]{8}$/.test(code)) return sendError(socket, 'Room codes use eight letters or numbers, excluding easily confused characters.');
    const room = rooms.get(code);
    if (!room) return sendError(socket, 'That room was not found. Ask Player 1 for a fresh code.');
    if (room.players.length >= 2) return sendError(socket, 'That room already has two players.');
    const player = { id: socket.id, socket, name, score: 0, answer: null, correct: false, ready: false, confirmed: false };
    room.players.push(player); socket.data.roomCode = code; socket.join(code); room.phase = 'confirming';
    updateRoom(room);
    const confirmation = { code, mode: room.mode, level: room.level };
    room.players[0].socket.emit('confirmation_pending', confirmation);
    player.socket.emit('confirm_level', confirmation);
  });

  socket.on('confirm_level', payload => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.phase !== 'confirming' || payload?.code !== room.code) return;
    const player2 = room.players[1];
    if (!player2 || player2.id !== socket.id) return;
    if (payload.decision === 'yes') { player2.confirmed = true; startRound(room); return; }
    if (payload.decision !== 'no') return;
    if (room.level !== 'beginner') {
      room.level = 'beginner'; player2.confirmed = false; updateRoom(room);
      const changed = { code: room.code, mode: room.mode, level: room.level, message: 'Player 1’s selection was reset to Beginner. Please review the updated rules.' };
      room.players[0].socket.emit('level_reset', changed);
      player2.socket.emit('confirm_level', changed);
      return;
    }
    player2.socket.emit('confirmation_notice', { message: 'Beginner is already selected. Choose Yes, I’m Ready to continue, or leave the room.' });
    room.players[0].socket.emit('level_reset', { code: room.code, mode: room.mode, level: room.level, message: 'Player 2 has not accepted Beginner yet.' });
  });

  socket.on('submit_answer', payload => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.phase !== 'playing' || !room.current || payload?.code !== room.code || payload?.roundId !== room.current.id) return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player || player.answer !== null || !room.current.choices.includes(payload.answer)) return;
    player.answer = payload.answer; player.correct = payload.answer === room.current.answer;
    player.socket.emit('answer_locked', { message: 'Answer locked privately. Waiting for your partner…' });
    if (room.players.some(p => p.answer === null)) return;
    room.phase = 'results';
    for (const p of room.players) if (p.correct) p.score += 10;
    for (const recipient of room.players) {
      recipient.socket.emit('round_result', {
        answer: room.current.answer,
        players: room.players.map(p => ({ name: p.name, score: p.score, isSelf: p.id === recipient.id, answer: p.answer, correct: p.correct }))
      });
    }
    updateRoom(room);
  });

  socket.on('finish_game', payload => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || !['playing', 'results'].includes(room.phase) || payload?.code !== room.code || room.players.length !== 2) return;
    const requesterIndex = room.players.findIndex(p => p.id === socket.id);
    if (requesterIndex < 0) return;
    const requester = room.players[requesterIndex];
    const gameId = crypto.randomUUID();
    const finishedAt = new Date().toISOString();
    room.phase = 'finished';
    rooms.delete(room.code);
    let acknowledgements = 0;
    let closed = false;
    const closeSession = () => {
      if (closed) return;
      closed = true;
      for (const p of room.players) {
        p.socket.data.roomCode = null;
        p.socket.leave(room.code);
        p.socket.disconnect(true);
      }
    };
    for (const recipient of room.players) {
      recipient.socket.emit('game_finished', {
        gameId, mode: room.mode, level: room.level, rounds: room.round, finishedAt,
        requesterNumber: requesterIndex + 1, requesterIsSelf: recipient.id === requester.id,
        notification: `Player ${requesterIndex + 1} wants to end the game. Game scores will be saved.`,
        players: room.players.map((p, index) => ({ name: p.name, score: p.score, isSelf: p.id === recipient.id, isPlayer1: index === 0 }))
      }, () => {
        acknowledgements += 1;
        if (acknowledgements >= room.players.length) closeSession();
      });
    }
    setTimeout(closeSession, 2500);
  });
  socket.on('next_round', payload => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.phase !== 'results' || payload?.code !== room.code) return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player || player.ready) return;
    player.ready = true; player.socket.emit('waiting_next');
    if (room.players.length === 2 && room.players.every(p => p.ready)) startRound(room);
  });
  socket.on('leave_room', payload => {
    if (payload?.code !== socket.data.roomCode) return;
    const code = socket.data.roomCode; removePlayer(socket, true); socket.leave(code); socket.emit('room_left');
  });
  socket.on('disconnect', () => removePlayer(socket, true));
});

server.listen(PORT, '0.0.0.0', () => console.log(`Prairie Pitch Multiplayer listening on ${PORT}`));




