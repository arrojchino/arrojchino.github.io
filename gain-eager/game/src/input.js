// Keyboard + pointer-lock mouse input. One listener set for the whole game.
class Input {
  constructor() {
    this.keys = Object.create(null);
    this.pressed = Object.create(null);
    this.mouse = { dx: 0, dy: 0, left: false, right: false, leftPressed: false, rightPressed: false };
    this.locked = false;
    this._bound = false;
  }
  attach(canvas) {
    if (this._bound) return;
    this._bound = true;
    addEventListener('keydown', e => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (!this.keys[k]) this.pressed[k] = true;
      this.keys[k] = true;
      if ([' ', 'Control', 'Shift', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
    });
    addEventListener('keyup', e => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      this.keys[k] = false;
    });
    addEventListener('blur', () => { this.keys = Object.create(null); this.mouse.left = this.mouse.right = false; });
    canvas.addEventListener('mousedown', e => {
      if (e.button === 0) { this.mouse.left = true; this.mouse.leftPressed = true; }
      if (e.button === 2) { this.mouse.right = true; this.mouse.rightPressed = true; }
      if (!this.locked && canvas.requestPointerLock) canvas.requestPointerLock();
    });
    addEventListener('mouseup', e => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    addEventListener('mousemove', e => {
      this.mouse.dx += e.movementX || 0;
      this.mouse.dy += e.movementY || 0;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
  }
  down(k) { return !!this.keys[k]; }
  hit(k) { if (this.pressed[k]) { this.pressed[k] = false; return true; } return false; }
  mouseDelta() { const d = { x: this.mouse.dx, y: this.mouse.dy }; this.mouse.dx = 0; this.mouse.dy = 0; return d; }
  endFrame() { this.pressed = Object.create(null); this.mouse.leftPressed = false; this.mouse.rightPressed = false; }
}

export const input = new Input();
