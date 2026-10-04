# Powerball Timeline Predictor

Pattern lines for the next Powerball drawing, summarized from past official results. The page opens on the highest-scoring line. New numbers replaces it with the next distinct line for that same drawing.

## Run

```bash
cd powerball-timeline
npm install
npm test
npm run dev
```

Open http://localhost:5173.

`npm run build` then `npm run preview` serves the production build with the same `/api/draws` route.

The page polls that route every 30 seconds. The server reads [New York Open Data](https://data.ny.gov/resource/d6yy-54nr) (Lottery Powerball Winning Numbers) and, if that source fails, falls back to `src/data/bundled-draws.json`.

## Windows

The Windows build is an NSIS setup wizard named `PowerBall-Predictor-Setup.exe`. It installs PowerBall Predictor for the current user, without administrator rights, and adds a desktop shortcut and a Start menu shortcut named `PowerBall Predictor`. The same results check is included and still refreshes when a new drawing is published.

To build the installer from this repo (the binary is not committed):

```bash
npm run pack:win
```
