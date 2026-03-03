import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js';
import { PAL, CROWD_N, MAX_ENEMIES, MAX_HELPERS, MAX_BLOCKERS, MAX_SLOWERS, FH, INVERSION } from './config.js';
import { createView } from './memory-layout.js';

export class Renderer {
    constructor(canvas, sharedFloatArray) {
        this.canvas = canvas;
        this.sabView = sharedFloatArray;

        // Create Float32Array views referencing the exact same SharedArrayBuffer memory
        this.views = {
            state: createView(sharedFloatArray, 'STATE'),
            playerVars: createView(sharedFloatArray, 'PLAYER_VARS'),
            playerMats: createView(sharedFloatArray, 'PLAYER_MATS'),
            crowdBody: createView(sharedFloatArray, 'CROWD_BODY'),
            crowdHead: createView(sharedFloatArray, 'CROWD_HEAD'),
            enemyBody: createView(sharedFloatArray, 'ENEMY_BODY'),
            enemyHead: createView(sharedFloatArray, 'ENEMY_HEAD'),
            helperBody: createView(sharedFloatArray, 'HELPER_BODY'),
            helperHead: createView(sharedFloatArray, 'HELPER_HEAD'),
            helperLArm: createView(sharedFloatArray, 'HELPER_LARM'),
            helperRArm: createView(sharedFloatArray, 'HELPER_RARM'),
            helperVars: createView(sharedFloatArray, 'HELPER_VARS'),
            blockerBody: createView(sharedFloatArray, 'BLOCKER_BODY'),
            blockerHead: createView(sharedFloatArray, 'BLOCKER_HEAD'),
            blockerVars: createView(sharedFloatArray, 'BLOCKER_VARS'),
            slowerBody: createView(sharedFloatArray, 'SLOWER_BODY'),
            slowerHead: createView(sharedFloatArray, 'SLOWER_HEAD'),
            slowerVars: createView(sharedFloatArray, 'SLOWER_VARS'),
        };

        this.initThree();
        this.initPlayer();
        this.initCrowd();
        this.initEnemies();
        this.initHelpers();
        this.initBlockers();
        this.initSlowers();
        this.initHermit();

        // Camera target smooth follow variables
        this.bobPh = 0;
        this._target = new THREE.Vector3();

        // Bind resize
        window.addEventListener('resize', () => this.onResize());
    }

    initThree() {
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.setClearColor(PAL.fog);
        this.renderer.setSize(window.innerWidth, window.innerHeight);

        this.scene = new THREE.Scene();
        // Fog with dynamic density control (will be modulated by player speed)
        // Base density: 0.032, will vary from 0.025 (running fast) to 0.045 (standing still)
        this.fogBase = 0.032;
        this.scene.fog = new THREE.FogExp2(PAL.fog, this.fogBase);

        this.W = window.innerWidth;
        this.H = window.innerHeight;
        this.FW = FH * this.W / this.H;

        this.cam = new THREE.OrthographicCamera(-this.FW / 2, this.FW / 2, FH / 2, -FH / 2, -100, 300);
        this.cam.position.set(13, 13, 13);
        this.cam.lookAt(0, 0, 0);

        this.scene.add(new THREE.AmbientLight(PAL.ambient, 1.0));

        this.sun = new THREE.DirectionalLight(PAL.sunCol, 1.4);
        this.sun.position.set(7, 15, 9);
        this.sun.castShadow = true;
        Object.assign(this.sun.shadow.camera, { left: -45, right: 45, top: 35, bottom: -35, far: 200 });
        this.sun.shadow.mapSize.set(2048, 2048);
        this.sun.shadow.bias = -0.001;
        this.sun.shadow.radius = 5;
        this.scene.add(this.sun);

        const fill = new THREE.DirectionalLight(0x1a2a4a, 0.55);
        fill.position.set(-7, 3, -7);
        this.scene.add(fill);

        this.ground = new THREE.Mesh(
            new THREE.PlaneGeometry(400, 48, 80, 10),
            new THREE.MeshStandardMaterial({ color: PAL.ground, roughness: 0.95 })
        );
        this.ground.rotation.x = -Math.PI / 2;
        this.ground.receiveShadow = true;
        this.scene.add(this.ground);

        this.gridHelper = new THREE.GridHelper(400, 160, PAL.grid, PAL.grid);
        this.gridHelper.position.y = 0.002;
        this.scene.add(this.gridHelper);
    }

    _mkCharMats(color) {
        const baseCol = new THREE.Color(color);
        return new THREE.MeshStandardMaterial({
            color: baseCol,
            roughness: 0.8,
            metalness: 0.1,
            emissive: baseCol.clone(),
            emissiveIntensity: 0.75  // Усилено: 0.5 → 0.75 для более заметного свечения
        });
    }

    _mkGeo() {
        // Player proportions: similar to crowd but with better geometry fidelity
        // Body: slightly larger than crowd (0.21 → 0.24), more segments for smoothness
        if (!this.geoCyl) this.geoCyl = new THREE.CylinderGeometry(0.24, 0.04, 0.68, 16);
        // Head: match crowd ratio (0.17 × 1.15 ≈ 0.20), but with more segments to avoid flatness
        // Crowd head: SphereGeometry(0.17, 8, 7) → Player head: SphereGeometry(0.20, 20, 16)
        if (!this.geoSph) this.geoSph = new THREE.SphereGeometry(0.20, 20, 16);
        // Arms: spheres (visible and animated, unlike crowd)
        if (!this.geoArm) this.geoArm = new THREE.SphereGeometry(0.072, 14, 10);
        return { cyl: this.geoCyl, sph: this.geoSph, arm: this.geoArm };
    }

    // Uses regular meshes for the player, updating matrices from the SAB directly
    initPlayer() {
        const { cyl, sph, arm } = this._mkGeo();
        const mat = this._mkCharMats(PAL.player);

        // We disable frustum culling and purely drive via SAB matrix updates
        this.pGroup = new THREE.Group();

        this.pBody = new THREE.Mesh(cyl, mat);
        this.pBody.castShadow = true; this.pBody.matrixAutoUpdate = false;

        this.pHead = new THREE.Mesh(sph, mat);
        this.pHead.castShadow = true; this.pHead.matrixAutoUpdate = false;

        this.pLArm = new THREE.Mesh(arm, mat.clone());
        this.pLArm.matrixAutoUpdate = false;

        this.pRArm = new THREE.Mesh(arm, mat.clone());
        this.pRArm.matrixAutoUpdate = false;

        this.pGroup.add(this.pBody, this.pHead, this.pLArm, this.pRArm);
        this.scene.add(this.pGroup);

        // Soft local light tied to player position
        // This light will be reflected on crowd members around the player
        // Intensity: 1.0 (high enough to be visible on crowd), Distance: 12 (reach further)
        this.pLight = new THREE.PointLight(PAL.player, 1.0, 12, 2);
        this.pLight.position.set(0, 1.0, 0);
        this.pLight.castShadow = false; // No shadow casting to save performance
        this.scene.add(this.pLight);
    }

    initCrowd() {
        const geo = new THREE.CylinderGeometry(0.21, 0.03, 0.60, 8);
        const headGeo = new THREE.SphereGeometry(0.17, 8, 7);
        // Улучшенный материал толпы: менее шероховатая (0.84 → 0.68) для лучшего отражения света персонажа
        // но всё ещё матовая, не как враги (они 0.25). Это создает эффект "матово-перламутрового" отсвета
        const mat = new THREE.MeshStandardMaterial({ 
            color: 0xffffff, 
            roughness: 0.68,  // Более гладкая поверхность для отражения света
            metalness: 0.08   // Лёгкий металлический оттенок для глубины
        });
        const matH = mat.clone();

        this.iBody = new THREE.InstancedMesh(geo, mat, CROWD_N);
        this.iBody.instanceMatrix = new THREE.InstancedBufferAttribute(this.views.crowdBody, 16);
        this.iBody.castShadow = true;
        this.iBody.frustumCulled = false;
        this.scene.add(this.iBody);

        this.iHead = new THREE.InstancedMesh(headGeo, matH, CROWD_N);
        this.iHead.instanceMatrix = new THREE.InstancedBufferAttribute(this.views.crowdHead, 16);
        this.iHead.castShadow = true;
        this.iHead.frustumCulled = false;
        this.scene.add(this.iHead);

        // Initial random colors
        const _col = new THREE.Color();
        for (let i = 0; i < CROWD_N; i++) {
            _col.set(PAL.crowd[Math.floor(Math.random() * PAL.crowd.length)]);
            this.iBody.setColorAt(i, _col);
            _col.multiplyScalar(1.35);
            this.iHead.setColorAt(i, _col);
        }
        this.iBody.instanceColor.needsUpdate = true;
        this.iHead.instanceColor.needsUpdate = true;
    }

    initEnemies() {
        const eBodyMat = new THREE.MeshStandardMaterial({
            color: PAL.enemy, roughness: 0.25, metalness: 0.3,
            transparent: true, opacity: 0.90,
        });
        const geo = new THREE.CylinderGeometry(0.21, 0.03, 0.60, 8);
        const headGeo = new THREE.SphereGeometry(0.17, 8, 7);

        this.eBody = new THREE.InstancedMesh(geo, eBodyMat, MAX_ENEMIES);
        this.eBody.instanceMatrix = new THREE.InstancedBufferAttribute(this.views.enemyBody, 16);
        this.eBody.castShadow = true;
        this.eBody.frustumCulled = false;
        this.scene.add(this.eBody);

        this.eHead = new THREE.InstancedMesh(headGeo, eBodyMat.clone(), MAX_ENEMIES);
        this.eHead.instanceMatrix = new THREE.InstancedBufferAttribute(this.views.enemyHead, 16);
        this.eHead.castShadow = true;
        this.eHead.frustumCulled = false;
        this.scene.add(this.eHead);
    }

    initHelpers() {
        const geo = new THREE.CylinderGeometry(0.26 * 1.05, 0.04 * 1.05, 0.70 * 1.05, 10);
        const sph = new THREE.SphereGeometry(0.20 * 1.05, 10, 8);
        const armGeo = new THREE.SphereGeometry(0.072 * 1.05, 7, 6);

        // Standard green mat roughly based on PAL.helper
        const mat = new THREE.MeshStandardMaterial({ color: PAL.helper, roughness: 0.4, metalness: 0.2 });
        const armMat = mat.clone();

        this.hBody = new THREE.InstancedMesh(geo, mat, MAX_HELPERS);
        this.hBody.instanceMatrix = new THREE.InstancedBufferAttribute(this.views.helperBody, 16);
        this.hBody.frustumCulled = false;

        this.hHead = new THREE.InstancedMesh(sph, mat.clone(), MAX_HELPERS);
        this.hHead.instanceMatrix = new THREE.InstancedBufferAttribute(this.views.helperHead, 16);
        this.hHead.frustumCulled = false;

        this.hLArm = new THREE.InstancedMesh(armGeo, armMat, MAX_HELPERS);
        this.hLArm.instanceMatrix = new THREE.InstancedBufferAttribute(this.views.helperLArm, 16);
        this.hLArm.frustumCulled = false;

        this.hRArm = new THREE.InstancedMesh(armGeo, armMat.clone(), MAX_HELPERS);
        this.hRArm.instanceMatrix = new THREE.InstancedBufferAttribute(this.views.helperRArm, 16);
        this.hRArm.frustumCulled = false;

        // Initialize helper colors manually so we can lerp them later
        const _col = new THREE.Color(PAL.helper);
        for (let i = 0; i < MAX_HELPERS; i++) {
            this.hBody.setColorAt(i, _col);
            this.hHead.setColorAt(i, _col);
            this.hLArm.setColorAt(i, _col);
            this.hRArm.setColorAt(i, _col);
        }

        this.scene.add(this.hBody, this.hHead, this.hLArm, this.hRArm);
    }

    initBlockers() {
        const geo = new THREE.CylinderGeometry(0.24, 0.04, 0.65, 8);
        const headGeo = new THREE.SphereGeometry(0.19, 8, 7);
        const mat = new THREE.MeshStandardMaterial({ roughness: 0.62, metalness: 0.1 });

        this.bBody = new THREE.InstancedMesh(geo, mat, MAX_BLOCKERS);
        this.bBody.instanceMatrix = new THREE.InstancedBufferAttribute(this.views.blockerBody, 16);
        this.bBody.castShadow = true;
        this.bBody.frustumCulled = false;

        this.bHead = new THREE.InstancedMesh(headGeo, mat.clone(), MAX_BLOCKERS);
        this.bHead.instanceMatrix = new THREE.InstancedBufferAttribute(this.views.blockerHead, 16);
        this.bHead.castShadow = true;
        this.bHead.frustumCulled = false;

        const _col = new THREE.Color();
        for (let i = 0; i < MAX_BLOCKERS; i++) {
            // We assign default color, but will update dynamically per instance or assume random mix initially
            _col.set(PAL.blockers[i % 2]);
            this.bBody.setColorAt(i, _col);
            _col.multiplyScalar(1.2);
            this.bHead.setColorAt(i, _col);
        }
        this.scene.add(this.bBody, this.bHead);
    }

    initSlowers() {
        const geo = new THREE.CylinderGeometry(0.22, 0.03, 0.60, 8);
        const headGeo = new THREE.SphereGeometry(0.17, 8, 7);
        const mat = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.2 });

        this.sBody = new THREE.InstancedMesh(geo, mat, MAX_SLOWERS);
        this.sBody.instanceMatrix = new THREE.InstancedBufferAttribute(this.views.slowerBody, 16);
        this.sBody.castShadow = true;
        this.sBody.frustumCulled = false;

        this.sHead = new THREE.InstancedMesh(headGeo, mat.clone(), MAX_SLOWERS);
        this.sHead.instanceMatrix = new THREE.InstancedBufferAttribute(this.views.slowerHead, 16);
        this.sHead.castShadow = true;
        this.sHead.frustumCulled = false;

        const _col = new THREE.Color();
        for (let i = 0; i < MAX_SLOWERS; i++) {
            _col.set(PAL.slowers[i % 2]);
            this.sBody.setColorAt(i, _col);
            _col.multiplyScalar(1.2);
            this.sHead.setColorAt(i, _col);
        }
        this.scene.add(this.sBody, this.sHead);
    }

    initHermit() {
        // Hermit (отщепенец) — solitary figure that appears in inverted mode
        // Rendered as a fast, orange-glowing figure
        const geo = new THREE.CylinderGeometry(0.24, 0.04, 0.68, 16);
        const headGeo = new THREE.SphereGeometry(0.20, 20, 16);
        
        const mat = new THREE.MeshStandardMaterial({
            color: 0xff6600,  // Orange
            roughness: 0.4,
            metalness: 0.2,
            emissive: 0xff6600,
            emissiveIntensity: 1.2
        });
        
        this.hermitBody = new THREE.Mesh(geo, mat);
        this.hermitBody.castShadow = true;
        this.hermitBody.matrixAutoUpdate = false;
        
        this.hermitHead = new THREE.Mesh(headGeo, mat.clone());
        this.hermitHead.castShadow = true;
        this.hermitHead.matrixAutoUpdate = false;
        
        // Pulsating point light for hermit
        this.hermitLight = new THREE.PointLight(0xff6600, 2.0, 8, 2);
        this.hermitLight.position.set(0, 0, 0);
        this.hermitLight.castShadow = false;
        
        // Start invisible (will be enabled when hermitActive = true)
        this.hermitBody.visible = false;
        this.hermitHead.visible = false;
        this.hermitLight.visible = false;
        
        this.scene.add(this.hermitBody, this.hermitHead, this.hermitLight);
    }

    onResize() {
        this.W = window.innerWidth;
        this.H = window.innerHeight;
        this.renderer.setSize(this.W, this.H);
        this.FW = FH * this.W / this.H;
        this.cam.left = -this.FW / 2;
        this.cam.right = this.FW / 2;
        this.cam.top = FH / 2;
        this.cam.bottom = -FH / 2;
        this.cam.updateProjectionMatrix();
    }

    render(dt) {
        if (!this.views.state[0]) return; // if not running

        // ── Apply Player Matrices ──
        const pm = this.views.playerMats;
        this.pBody.matrix.fromArray(pm, 0);
        this.pHead.matrix.fromArray(pm, 16);
        this.pLArm.matrix.fromArray(pm, 32);
        this.pRArm.matrix.fromArray(pm, 48);

        // Read player pos for camera follow
        const px = this.views.playerVars[0];
        const pz = this.views.playerVars[1];
        const invTimer = this.views.playerVars[2];

        // Player invincibility flicker
        this.pGroup.visible = invTimer <= 0 || Math.floor(invTimer * 9) % 2 === 0;

        // ── Apply Hermit (Отщепенец) Matrix ──
        const hermitActive = this.views.state[21];  // 0/1
        const hermitX = this.views.state[22];
        const hermitZ = this.views.state[23];
        
        if (hermitActive > 0) {
            // Hermit is visible
            this.hermitBody.visible = true;
            this.hermitHead.visible = true;
            this.hermitLight.visible = true;
            
            // Hermit animation: bobbing and scaling
            const hermitBobPhase = performance.now() * 0.002 + hermitX * 0.1;
            const hermitBob = Math.sin(hermitBobPhase * 4.2) * 0.08;
            const hermitPulse = 0.9 + Math.sin(hermitBobPhase * 6.0) * 0.15;
            
            // Build matrices (use composeMatrix if available, otherwise manual)
            const bodySc = hermitPulse;
            const headSc = hermitPulse * 1.0;
            
            // Simple manual matrix composition for hermit
            const bodyMat = new THREE.Matrix4();
            bodyMat.compose(
                new THREE.Vector3(hermitX, 0.35, hermitZ),
                new THREE.Quaternion(),
                new THREE.Vector3(bodySc, bodySc, bodySc)
            );
            this.hermitBody.matrix.copy(bodyMat);
            
            const headMat = new THREE.Matrix4();
            headMat.compose(
                new THREE.Vector3(hermitX, 0.90 + hermitBob, hermitZ),
                new THREE.Quaternion(),
                new THREE.Vector3(headSc, headSc, headSc)
            );
            this.hermitHead.matrix.copy(headMat);
            
            // Update light position and intensity (pulse)
            this.hermitLight.position.set(hermitX, 0.7, hermitZ);
            this.hermitLight.intensity = 1.5 + Math.sin(hermitBobPhase * 3.0) * 0.7;
        } else {
            // Hermit not active
            this.hermitBody.visible = false;
            this.hermitHead.visible = false;
            this.hermitLight.visible = false;
        }

        // ── Apply Instances ──
        // Need to strictly mark as needing update since worker overwrites buffer
        this.iBody.instanceMatrix.needsUpdate = true;
        this.iHead.instanceMatrix.needsUpdate = true;
        this.eBody.instanceMatrix.needsUpdate = true;
        this.eHead.instanceMatrix.needsUpdate = true;
        this.hBody.instanceMatrix.needsUpdate = true;
        this.hHead.instanceMatrix.needsUpdate = true;
        this.hLArm.instanceMatrix.needsUpdate = true;
        this.hRArm.instanceMatrix.needsUpdate = true;
        this.bBody.instanceMatrix.needsUpdate = true;
        this.bHead.instanceMatrix.needsUpdate = true;
        this.sBody.instanceMatrix.needsUpdate = true;
        this.sHead.instanceMatrix.needsUpdate = true;

        // Dynamic colors based on colIdx
        const _col = new THREE.Color();
        let bNeedsUpd = false, sNeedsUpd = false;

        for (let i = 0; i < MAX_BLOCKERS; i++) {
            if (this.views.blockerVars[i * 4 + 1]) { // active
                const colIdx = this.views.blockerVars[i * 4];
                _col.set(PAL.blockers[colIdx]);
                this.bBody.setColorAt(i, _col);
                _col.multiplyScalar(1.2);
                this.bHead.setColorAt(i, _col);
                bNeedsUpd = true;
            }
        }
        for (let i = 0; i < MAX_SLOWERS; i++) {
            if (this.views.slowerVars[i * 4 + 1]) { // active
                const colIdx = this.views.slowerVars[i * 4];
                _col.set(PAL.slowers[colIdx]);
                this.sBody.setColorAt(i, _col);
                _col.multiplyScalar(1.2);
                this.sHead.setColorAt(i, _col);
                sNeedsUpd = true;
            }
        }

        if (bNeedsUpd) { this.bBody.instanceColor.needsUpdate = true; this.bHead.instanceColor.needsUpdate = true; }
        if (sNeedsUpd) { this.sBody.instanceColor.needsUpdate = true; this.sHead.instanceColor.needsUpdate = true; }

        // ── Helpers dynamic glow ──
        let hNeedsUpd = false;
        const baseHCol = new THREE.Color(PAL.helper);
        const peakHCol = new THREE.Color(0xffffff); // pure white flash

        for (let i = 0; i < MAX_HELPERS; i++) {
            const off = i * 4;
            const state = this.views.helperVars[off + 2]; // 0=off, 1=idle, 2=rescuing

            if (state > 0) {
                const phase = this.views.helperVars[off + 3];

                // Calculate pulse intensity
                const pulse = Math.abs(Math.sin(phase * 1.6));

                // Color lerp
                _col.copy(baseHCol).lerp(peakHCol, pulse * 0.95);

                this.hBody.setColorAt(i, _col);
                this.hHead.setColorAt(i, _col);
                this.hLArm.setColorAt(i, _col);
                this.hRArm.setColorAt(i, _col);
                hNeedsUpd = true;
            }
        }
        if (hNeedsUpd) {
            this.hBody.instanceColor.needsUpdate = true;
            this.hHead.instanceColor.needsUpdate = true;
            this.hLArm.instanceColor.needsUpdate = true;
            this.hRArm.instanceColor.needsUpdate = true;
        }

        // ── Camera Follow ──
        this.bobPh += dt * 0.65;
        const bob = Math.sin(this.bobPh) * 0.035;

        // ── INVERSION MODE: Camera Shake & Color Lerp ──
        const shakeIntensity = this.views.state[24];  // 0.0 to SHAKE_AMPLITUDE
        const colorBlend = this.views.state[25];      // 0.0 = normal, 1.0 = inverted
        
        // Camera shake (applied to position)
        let shakePosX = 0, shakePosY = 0, shakePosZ = 0;
        if (shakeIntensity > 0.001) {
            const t = performance.now() * 0.001;  // Convert to seconds
            const freq = 18.0;  // INVERSION.SHAKE_FREQUENCY
            const amp = shakeIntensity;
            shakePosX = Math.sin(t * freq * 2.0) * amp * 0.5;
            shakePosY = Math.sin(t * freq * 1.3) * amp * 0.3;
            shakePosZ = Math.cos(t * freq * 0.9) * amp * 0.5;
        }
        
        // Color lerping for inverted world
        if (colorBlend > 0.001) {
            // Initialize color caches if needed
            if (!this._normalFogColor) {
                this._normalFogColor = new THREE.Color(PAL.fog);
                this._invertedFogColor = new THREE.Color(INVERSION.COLORS.fog);
            }
            if (!this._normalGroundColor) {
                this._normalGroundColor = new THREE.Color(PAL.ground);
                this._invertedGroundColor = new THREE.Color(INVERSION.COLORS.ground);
            }
            if (!this._normalPlayerColor) {
                this._normalPlayerColor = new THREE.Color(PAL.player);
                this._invertedPlayerColor = new THREE.Color(INVERSION.COLORS.player);
            }
            
            // Lerp fog and ground colors
            this.scene.fog.color.lerpColors(this._normalFogColor, this._invertedFogColor, colorBlend);
            this.renderer.setClearColor(this.scene.fog.color);
            this.ground.material.color.lerpColors(this._normalGroundColor, this._invertedGroundColor, colorBlend);
            
            // Lerp player colors
            this.pBody.material.color.lerpColors(this._normalPlayerColor, this._invertedPlayerColor, colorBlend);
            this.pHead.material.color.lerpColors(this._normalPlayerColor, this._invertedPlayerColor, colorBlend);
            this.pLArm.material.color.lerpColors(this._normalPlayerColor, this._invertedPlayerColor, colorBlend);
            this.pRArm.material.color.lerpColors(this._normalPlayerColor, this._invertedPlayerColor, colorBlend);
            
            // Increase emissive intensity in inverted mode (player glows dark)
            const emissiveIntensity = 0.75 + colorBlend * 1.05;
            this.pBody.material.emissiveIntensity = emissiveIntensity;
            this.pHead.material.emissiveIntensity = emissiveIntensity;
            this.pLArm.material.emissiveIntensity = emissiveIntensity;
            this.pRArm.material.emissiveIntensity = emissiveIntensity;
        }

        this._target.set(px + 13 + shakePosX, 13 + bob + shakePosY, pz + 13 + shakePosZ);
        this.cam.position.lerp(this._target, 0.055);
        this.cam.lookAt(px, 0, pz);

        // Light and Grid follow player
        this.sun.position.set(px + 7, 15, pz + 9);
        this.ground.position.x = px;
        this.gridHelper.position.x = Math.floor(px / 10) * 10; // snap to grid intervals

        // Local warm light follows player
        if (this.pLight) {
            this.pLight.position.set(px, 0.9, pz);
        }

        // ── Dynamic Fog Density (Forgetfulness Fog) ──
        // Fog represents the psychological weight of the crowd: stronger when standing still, lighter when moving fast
        const vx = this.views.playerVars[3];
        const vz = this.views.playerVars[4];
        const speed = Math.sqrt(vx * vx + vz * vz);
        
        // Map speed to fog density:
        // - Standing still (speed ≈ 0): high fog density (0.045) = lost in the crowd
        // - Running fast (speed ≈ 7.6+): low fog density (0.025) = cutting through, seeing ahead
        const targetFogDensity = 0.045 - speed * 0.0025;  // Linear interpolation
        const clampedFogDensity = Math.max(0.025, Math.min(0.045, targetFogDensity));
        
        // Smooth transition (avoid jarring density changes)
        this.scene.fog.density += (clampedFogDensity - this.scene.fog.density) * 0.08;

        // Render Call
        this.renderer.render(this.scene, this.cam);
    }
}
