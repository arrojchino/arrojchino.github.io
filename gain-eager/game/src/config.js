// Shared tuning constants. No allocations at runtime.
export const CONFIG = {
  world: { size: 2200, segments: 110, waterY: -1.6 },
  player: {
    gravity: 22, walkSpeed: 6.5, runSpeed: 11, flySpeed: 34, boostMul: 2.3,
    accel: 18, airAccel: 26, damping: 2.4, airDamping: .75,
    maxSpeed: 115, hoverDamping: 3.4, jumpVelocity: 8.2, takeoffVelocity: 17,
    radius: .55, eyeHeight: 1.62, maxHealth: 100, maxEnergy: 100,
  },
  camera: { chaseDist: 6.6, chaseHeight: 2.2, lerp: 7, lookLerp: 9, fovBase: 62, fovSpeed: .12 },
  combat: { laserCooldown: .16, laserEnergy: 6, blastCooldown: .9, blastEnergy: 18,
    shockCooldown: 6, shockEnergy: 30, teleportCooldown: 3.5, teleportEnergy: 22,
    laserRange: 230, blastSpeed: 95, blastRadius: 7 },
  particles: { max: 1400 },
  quality: {
    low:    { pr: 1,   clouds: 140, trees: 70,  buildings: 45, shadow: 512,  bloom: false, bokeh: false, particles: 500 },
    medium: { pr: 1.25,clouds: 260, trees: 130, buildings: 70, shadow: 1024, bloom: true,  bokeh: false, particles: 900 },
    high:   { pr: 1.6, clouds: 380, trees: 200, buildings: 95, shadow: 2048, bloom: true,  bokeh: false, particles: 1400 },
    ultra:  { pr: 2,   clouds: 520, trees: 280, buildings: 130, shadow: 2048, bloom: true,  bokeh: true,  particles: 1400 },
  },
};
