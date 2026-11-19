// Single mutable game state shared by every module.
import { CONFIG } from './config.js';

export const state = {
  started: false, paused: false, over: false, time: 0, dt: 0,
  quality: 'high',
  cameraMode: 'chase', // chase | close | first | free | cinematic
  anim: 'idle',
  inputLocked: false,
  events: [],
  player: {
    pos: { x: 0, y: 2, z: 14 },
    vel: { x: 0, y: 0, z: 0 },
    yaw: 0, pitch: 0, roll: 0,
    speed: 0, flying: false, hovering: false, boosting: false,
    alive: true, grounded: true, health: CONFIG.player.maxHealth, energy: CONFIG.player.maxEnergy,
    damageFlash: 0, age: 0,
  },
  cooldowns: { laser: 0, blast: 0, shock: 0, teleport: 0, speed: 0 },
  stats: { fps: 0, frames: 0, calls: 0, tris: 0, particles: 0, projectiles: 0 },
};

export function emit(text) {
  state.events.push({ text, at: state.time });
  if (state.events.length > 6) state.events.shift();
}
