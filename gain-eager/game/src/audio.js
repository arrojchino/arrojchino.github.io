// All sound is synthesised with WebAudio: no external files, no licences.
export class AudioEngine {
  constructor() { this.ctx = null; this.master = null; this.windGain = null; this.volume = .55; }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    // wind bed: filtered noise, amplitude follows speed
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * .35;
    const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const filt = this.ctx.createBiquadFilter(); filt.type = 'bandpass'; filt.frequency.value = 480; filt.Q.value = .6;
    this.windGain = this.ctx.createGain(); this.windGain.gain.value = 0;
    src.connect(filt).connect(this.windGain).connect(this.master); src.start();
  }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }
  wind(intensity) {
    if (!this.ctx) return;
    const g = Math.min(.22, intensity * .0016);
    this.windGain.gain.setTargetAtTime(g, this.ctx.currentTime, .12);
  }
  tone(freq, dur, type = 'sawtooth', gain = .18, slide = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + .02);
  }
  noise(dur, gain = .3, cutoff = 900) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = this.ctx.createBufferSource(); s.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff;
    const g = this.ctx.createGain(); g.gain.value = gain;
    s.connect(f).connect(g).connect(this.master); s.start(t);
  }
  play(name) {
    if (!this.ctx) return;
    switch (name) {
      case 'laser': this.tone(880, .18, 'sawtooth', .12, -620); break;
      case 'blast': this.tone(180, .32, 'square', .16, -120); this.noise(.25, .22, 1200); break;
      case 'boom': this.noise(.55, .38, 620); this.tone(70, .4, 'sine', .22, -35); break;
      case 'shock': this.tone(90, .6, 'sine', .22, 420); break;
      case 'teleport': this.tone(420, .28, 'triangle', .14, 900); break;
      case 'boost': this.tone(220, .25, 'sawtooth', .12, 480); break;
      case 'land': this.noise(.18, .2, 300); break;
      case 'hurt': this.tone(120, .22, 'square', .14, -60); break;
      case 'ui': this.tone(660, .08, 'triangle', .08, 120); break;
    }
  }
}
