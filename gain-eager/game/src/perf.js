// FPS meter, renderer diagnostics and adaptive quality.
import { CONFIG } from './config.js';

const ORDER = ['low', 'medium', 'high', 'ultra'];

export class Perf {
  constructor(renderer, onQuality) {
    this.renderer = renderer; this.onQuality = onQuality;
    this.frames = 0; this.t = 0; this.lowFor = 0; this.adaptive = true;
  }
  update(dt, state) {
    this.frames++; this.t += dt;
    if (this.t >= .5) {
      state.stats.fps = Math.round(this.frames / this.t);
      state.stats.calls = this.renderer.info.render.calls;
      state.stats.tris = this.renderer.info.render.triangles;
      this.frames = 0; this.t = 0;
      if (this.adaptive && state.started) {
        if (state.stats.fps < 38) this.lowFor += .5; else this.lowFor = 0;
        if (this.lowFor >= 3) {
          const i = ORDER.indexOf(state.quality);
          if (i > 0) { this.lowFor = 0; this.onQuality(ORDER[i-1], true); }
        }
      }
    }
  }
}
