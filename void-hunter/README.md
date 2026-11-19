# Void Hunter — Burrower Protocol

An original single-room boss-fight mini-game inspired by classic SNES Metroidvanias.
Pure HTML5 canvas, no dependencies, no build step.

Play: https://arrojchino.github.io/void-hunter/

## Controls

- `A` / `D` or `←` / `→` — move
- `Space` — jump
- `J` or `X` — shoot
- `R` — restart

## Gameplay

- Two targets: the Burrower (ground) and the Warden (flying). Defeat both to win.
- The Burrower spits projectiles and telegraphs a jump slam; the Warden shoots aimed shots and dashes.
- Below half health each boss enrages: faster attacks and a different hide.
- Shoot an open mouth for double damage.
- Hunter HP 100; Burrower HP 200, Warden HP 180. Defeating a target restores 30 HP.
- Win by eliminating both targets; lose if your HP reaches zero.

## Files

- `index.html` — the whole game: markup, styles and engine in one file.

## Verification

Tested in Chromium: title screen, movement, jump, shooting, boss damage, and both
win and lose states were exercised and screenshotted.
