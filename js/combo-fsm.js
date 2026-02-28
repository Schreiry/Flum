import { COMBO_SEQ } from './config.js';

export class ComboSystem {
    constructor() {
        this.buf = [];
        this.lastTs = 0;
        this.WIN = 750; // ms window
        this.activated = false;
    }

    press(btn, onProgress, onFlash) {
        const now = performance.now();
        if (now - this.lastTs > this.WIN) this.buf = [];
        this.lastTs = now;
        this.buf.push(btn);
        if (this.buf.length > COMBO_SEQ.length) this.buf.shift();

        const match = this.buf.length === COMBO_SEQ.length &&
            this.buf.every((b, i) => b === COMBO_SEQ[i]);
        if (match) {
            if (this.state === 3) {
                this.state = 0;
                ui.comboFlash();
                views.state[11] += 1; // track combos executed
                return true;
            }
            this.buf = [];
            this.activated = true;
            if (onFlash) onFlash();
            setTimeout(() => { this.activated = false; }, 500);
            return true;
        }
        if (onProgress) onProgress(this.buf.length);
        return false;
    }

    consume() {
        if (this.activated) { this.activated = false; return true; }
        return false;
    }

    reset(onProgress) {
        this.buf = [];
        this.activated = false;
        if (onProgress) onProgress(0);
    }
}
