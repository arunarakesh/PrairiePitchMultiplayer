# Prairie Pitch Multiplayer

Prairie Pitch is a western-inspired ear-training game for exactly two players. Player 1 creates a room and selects a mode and difficulty. Player 2 joins with the room code and confirms the same selection. Both players hear the same challenge, submit answers privately, and see scores after both answers are in.

**Version:** 1.2.1  
**Owner:** ArunaR  
**License:** All rights reserved; see [LICENSE](LICENSE).

## Modes

- **Note Guess:** Listen to one piano note and choose the note you heard.
- **Scale Scout:** Listen to a major scale and choose the major scale you heard.

## Difficulty levels

Player 1 selects the level for both players. Player 2 sees its description and confirms before play. If Player 2 declines, the room switches to Beginner and Player 2 is asked to confirm again.

| Level | Note Guess | Scale Scout |
| --- | --- | --- |
| Beginner | Natural notes in C4 (C4–B4) | Natural-note major-scale roots in C4 |
| Intermediate | Natural notes from C3 through B5 | Natural-note roots across C3 through B5 |
| Advanced | All 12 chromatic notes in C4 | Chromatic major-scale roots in C4 |
| Expert | All 88 piano keys, A0 through C8 | Chromatic major-scale roots across the playable piano range |

## How a match works

1. Player 1 creates a room, enters a name, chooses Note Guess or Scale Scout, and selects a level.
2. Player 2 enters a name and the eight-character room code, reviews the selected mode and level, and confirms readiness.
3. Each player presses the play button to hear the challenge. Both receive the same generated sound.
4. Players submit privately. The correct answer and updated scores appear after both submissions. Each correct answer is worth 10 points.
5. Either player can choose **Save & Finish**. After confirmation, the room closes, both final scores are shown, and each browser saves the match locally.

Player 1 controls the next match by creating a new room. Player 2 returns to the join screen and uses the new room code. There is no lobby or real-time leaderboard. Recent finished games are stored in each browser on that device; the server does not retain a cross-player leaderboard or history after a session.

## Run locally

Requires Node.js 22 or newer.

```sh
npm install
npm start
```

Open `http://localhost:3000` in two browser windows or on two devices that can reach the computer running the server. Create a room in one window and join it from the other.

## Project files

- `server.js` — room management, level confirmation, sound generation, private answers, scoring, and match closeout
- `public/index.html` — game interface, instructions, player display, and local finished-match history
- `Dockerfile` — container deployment setup
- `DEMO_SCRIPT.md` — walkthrough for presenting a match
- `VERSION` — displayed project version
- `LICENSE` — ownership and all-rights-reserved notice
