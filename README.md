# Dynamite Lake

A browser game: two pontoon boats, two coolers, one fishing rod with a stick of dynamite on the lure.
You play a round-based casting duel against an AI crew (Gary & Dale).

No build step, no backend — plain HTML/CSS/JavaScript.

## Play locally

```bash
python3 -m http.server 5500
```

Then open http://localhost:5500/.

## How it works

- Every round both boats secretly re-anchor at 50, 100, 200 or 300 feet.
- Press **CAST**, a marker sweeps left to right across the distance scale, and **STOP** drops the
  dynamite exactly where the marker was at the instant you pressed.
- A hit only counts inside the target boat's hull length, so bigger pontoons are easier to clip —
  but they also carry more beer.
- When the dynamite comes at you, throw a beer can while the lure is in the red strike zone and it
  detonates mid-air, clear of your deck.
- Three hull hits sinks a boat.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page shell, scoreboard, rules modal |
| `game.js` | Game state, AI, canvas rendering and animation |
| `audio.js` | Boat radio, sound effects and smack talk |
| `music/` | Background tracks |
| `voice/` | Pre-generated smack-talk clips and `lines.json` manifest |
| `tools/generate_voices.py` | Regenerates the voice clips (needs `ELEVENLABS_API_KEY`) |

## Credits

Music by Kevin MacLeod (incompetech.com), licensed under
[Creative Commons BY 3.0](https://creativecommons.org/licenses/by/3.0/):
*Bama Country*, *Hillbilly Swing*, *Corncob*, *Still Pickin'*.

Voice lines generated with ElevenLabs text to speech.
