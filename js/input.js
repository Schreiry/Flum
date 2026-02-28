import { comboProgress, comboFlash } from './ui.js';

export class GamepadManager {
    constructor() {
        this.padIdx = -1;
        this.prevBtn = {};
        this.dTapTs = {};

        this.onConnect = null;
        this.onDisconnect = null;

        window.addEventListener('gamepadconnected', e => {
            this.padIdx = e.gamepad.index;
            if (this.onConnect) this.onConnect();
        });
        window.addEventListener('gamepaddisconnected', () => {
            this.padIdx = -1;
            if (this.onDisconnect) this.onDisconnect();
        });
    }

    get connected() { return this.padIdx >= 0; }

    poll(combo, playerDashFn) {
        if (!this.connected) return { x: 0, z: 0 };
        const pads = navigator.getGamepads();
        const pad = pads[this.padIdx];
        if (!pad) return { x: 0, z: 0 };

        const DZ = 0.15;
        let ax = pad.axes[0] || 0, az = pad.axes[1] || 0;
        if (Math.abs(ax) < DZ) ax = 0;
        if (Math.abs(az) < DZ) az = 0;

        const MAP = [[2, 'x'], [3, 'y'], [0, 'a'], [1, 'b']];
        for (const [idx, name] of MAP) {
            const pressed = pad.buttons[idx]?.pressed;
            if (pressed && !this.prevBtn[idx]) combo.press(name, comboProgress, comboFlash);
            this.prevBtn[idx] = pressed;
        }

        // D-pad double-tap dash
        for (const [idx, dz] of [[12, -1], [13, 1]]) {
            const pressed = pad.buttons[idx]?.pressed;
            if (pressed && !this.prevBtn['d' + idx]) {
                const now = performance.now();
                if (this.dTapTs[idx] && now - this.dTapTs[idx] < 280) {
                    if (playerDashFn) playerDashFn(0, dz);
                }
                this.dTapTs[idx] = now;
            }
            this.prevBtn['d' + idx] = pressed;
        }

        return { x: ax, z: az };
    }
}

export class KeyboardManager {
    constructor(combo) {
        this.combo = combo;
        this.keys = {};
        this.lastK = '';
        this.lastTs = 0;
        this.playerDashFn = null;

        document.addEventListener('keydown', e => {
            if (!this.keys[e.code]) this.onPress(e.code);
            this.keys[e.code] = true;
        });
        document.addEventListener('keyup', e => {
            this.keys[e.code] = false;
        });

        // Space/Enter mapping for Main Menu
        document.addEventListener('keydown', e => {
            if ((e.code === 'Space' || e.code === 'Enter') &&
                document.getElementById('menu').style.display !== 'none') {
                e.preventDefault();
                document.getElementById('btnPlay')?.click();
            }
        });
    }

    onPress(code) {
        const CM = { KeyZ: 'x', KeyX: 'y', KeyC: 'a', KeyV: 'b' };
        if (CM[code]) this.combo.press(CM[code], comboProgress, comboFlash);

        const now = performance.now();
        const DASH_MAP = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'dn', KeyS: 'dn' };
        if (DASH_MAP[code] && this.lastK === code && now - this.lastTs < 270) {
            const dz = DASH_MAP[code] === 'up' ? -1 : 1;
            if (this.playerDashFn) this.playerDashFn(0, dz);
        }
        this.lastK = code;
        this.lastTs = now;
    }

    dir() {
        let x = 0, z = 0;
        if (this.keys.ArrowLeft || this.keys.KeyA) x -= 1;
        if (this.keys.ArrowRight || this.keys.KeyD) x += 1;
        if (this.keys.ArrowUp || this.keys.KeyW) z -= 1;
        if (this.keys.ArrowDown || this.keys.KeyS) z += 1;
        const len = Math.hypot(x, z);
        return len > 0 ? { x: x / len, z: z / len } : { x: 0, z: 0 };
    }
}
