/** * SHADOW SURVIVAL: ETERNAL REQUIEM 
 * ENGINE CORE V6.0 - ULTRA EDITION
 * Author: Gemini
 */

// --- MATH UTILS ---
const MathUtils = {
    rand: (min, max) => Math.random() * (max - min) + min,
    randInt: (min, max) => Math.floor(Math.random() * (max - min + 1)) + min,
    dist: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1),
    lerp: (start, end, amt) => (1 - amt) * start + amt * end,
    clamp: (num, min, max) => Math.min(Math.max(num, min), max)
};

// --- CONFIGURAÇÃO GLOBAL ---
const CONFIG = {
    PARTICLE_LIMIT: 200,
    ENEMY_LIMIT: 60,
    SPAWN_RADIUS: 900,
    DESPAWN_RADIUS: 1400,
    BIOMES: [
        { name: "Cemitério de Éter", bg: "#08080a", fog: "#000", accent: "#ff3e3e" },
        { name: "Pantanal Tóxico", bg: "#050f05", fog: "#020", accent: "#2ecc71" },
        { name: "Deserto de Sangue", bg: "#140505", fog: "#200", accent: "#ffaa00" },
        { name: "Vazio Astral", bg: "#020208", fog: "#002", accent: "#00f2ff" },
        { name: "Reino de Obsidiana", bg: "#000000", fog: "#111", accent: "#ffffff" }
    ],
    SHOP_ITEMS: [
        { id: 'pot_hp', name: 'Elixir Vital', desc: 'Recupera 50% HP', cost: 100, type: 'consumable', fn: (p) => { p.hp = Math.min(p.maxHp, p.hp + p.maxHp*0.5); } },
        { id: 'up_dmg', name: 'Pedra de Amolar', desc: 'Dano Base +5', cost: 250, type: 'passive', fn: (p) => { p.dmg += 5; } },
        { id: 'up_spd', name: 'Botas de Hermes', desc: 'Velocidade +5%', cost: 300, type: 'passive', fn: (p) => { p.speed *= 1.05; } },
        { id: 'up_reg', name: 'Anel Lunar', desc: 'Regen Mana +0.05', cost: 400, type: 'passive', fn: (p) => { p.stats.regenMp += 0.05; } },
        { id: 'up_maxhp', name: 'Coração de Titã', desc: 'Vida Máx +50', cost: 500, type: 'passive', fn: (p) => { p.maxHp += 50; p.hp += 50; } },
        { id: 'up_thorns', name: 'Armadura de Espinhos', desc: 'Reflete 10% Dano', cost: 600, type: 'passive', fn: (p) => { p.stats.thorns += 0.1; } },
        { id: 'up_luck', name: 'Trevo Dourado', desc: 'Sorte +10%', cost: 800, type: 'passive', fn: (p) => { p.stats.luck += 0.1; } }
    ]
};

// --- ENGINE PRINCIPAL ---
const Engine = (() => {
    const canvas = document.getElementById("game-canvas");
    const ctx = canvas.getContext("2d");
    
    // Variáveis de Estado
    let width, height;
    let loopId;
    let frame = 0;
    
    // Áudio
    const bgm = document.getElementById("bgm");

    const world = {
        camera: { x: 0, y: 0, tx: 0, ty: 0, shake: 0 },
        entities: [], // Inimigos
        particles: [],
        drops: [],
        decals: [], // Sangue no chão
        floaters: [] // Texto flutuante
    };

    const state = {
        running: false,
        paused: false,
        level: 1,
        xp: 0,
        nextXp: 100,
        kills: 0,
        souls: 0,
        biomeIdx: 0,
        difficulty: 1.0,
        bossActive: false
    };

    const player = {
        x: 0, y: 0,
        radius: 16,
        color: '#fff',
        speed: 4.5,
        angle: 0,
        hp: 100, maxHp: 100,
        mp: 100, maxMp: 100,
        dmg: 30,
        weapon: 'blade',
        invul: 0, // Frames invulnerável
        cd_atk: 0, // Cooldown ataque
        stats: {
            area: 1.0,
            magnet: 150,
            regenMp: 0.1,
            lifesteal: 0,
            thorns: 0,
            luck: 1.0
        }
    };

    // Inputs
    const keys = {};
    const joy = { active: false, x: 0, y: 0, id: null };
    const attackBtn = { active: false, id: null };

    // --- CLASSES --- //

    class Enemy {
        constructor(x, y, type) {
            this.x = x; this.y = y;
            this.type = type;
            this.dead = false;
            this.frozen = 0;
            this.pushX = 0; this.pushY = 0;
            
            // Stats baseados no tipo
            const diff = state.difficulty;
            if (type === 'boss') {
                this.hp = 5000 * diff;
                this.maxHp = this.hp;
                this.dmg = 40 * diff;
                this.speed = 2.8;
                this.radius = 60;
                this.color = '#fff';
                this.xp = 1000;
                this.souls = 500;
            } else if (type === 'tank') {
                this.hp = 150 * diff;
                this.maxHp = this.hp;
                this.dmg = 20 * diff;
                this.speed = 1.5;
                this.radius = 30;
                this.color = '#888';
                this.xp = 30;
                this.souls = 10;
            } else if (type === 'runner') {
                this.hp = 40 * diff;
                this.maxHp = this.hp;
                this.dmg = 10 * diff;
                this.speed = 4.0;
                this.radius = 12;
                this.color = CONFIG.BIOMES[state.biomeIdx].accent;
                this.xp = 15;
                this.souls = 5;
            } else { // grunt
                this.hp = 80 * diff;
                this.maxHp = this.hp;
                this.dmg = 15 * diff;
                this.speed = 2.5 + Math.random();
                this.radius = 18;
                this.color = '#b33';
                this.xp = 10;
                this.souls = 2;
            }
        }

        update() {
            // Empurrão
            this.x += this.pushX; this.y += this.pushY;
            this.pushX *= 0.8; this.pushY *= 0.8;

            if (this.frozen > 0) { this.frozen--; return; }

            const ang = Math.atan2(player.y - this.y, player.x - this.x);
            this.x += Math.cos(ang) * this.speed;
            this.y += Math.sin(ang) * this.speed;

            // Colisão Player
            const d = MathUtils.dist(this.x, this.y, player.x, player.y);
            if (d < this.radius + player.radius) {
                Engine.damagePlayer(this.dmg);
                // Dano de Espinhos
                if (player.stats.thorns > 0 && player.invul > 30) {
                    Engine.damageEnemy(this, this.dmg * player.stats.thorns);
                }
            }
        }

        draw(ctx, cam) {
            const rx = this.x - cam.x;
            const ry = this.y - cam.y;

            // Sombra
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.beginPath(); ctx.ellipse(rx, ry + this.radius*0.8, this.radius, this.radius*0.4, 0, 0, Math.PI*2); ctx.fill();

            // Corpo
            ctx.fillStyle = this.frozen > 0 ? '#0ff' : this.color;
            ctx.beginPath(); ctx.arc(rx, ry, this.radius, 0, Math.PI*2); ctx.fill();

            // Barra HP Inimigo (apenas se machucado)
            if (this.hp < this.maxHp && this.type !== 'boss') {
                const pct = this.hp / this.maxHp;
                ctx.fillStyle = '#300';
                ctx.fillRect(rx - 15, ry - this.radius - 8, 30, 4);
                ctx.fillStyle = '#f00';
                ctx.fillRect(rx - 15, ry - this.radius - 8, 30 * pct, 4);
            }
        }
    }

    class Particle {
        constructor(x, y, color, speed, life) {
            this.x = x; this.y = y;
            const a = Math.random() * Math.PI * 2;
            this.vx = Math.cos(a) * speed;
            this.vy = Math.sin(a) * speed;
            this.life = life;
            this.maxLife = life;
            this.color = color;
            this.size = MathUtils.rand(2, 5);
        }
        update() {
            this.x += this.vx; this.y += this.vy;
            this.life--;
            this.vx *= 0.95; this.vy *= 0.95;
            this.size *= 0.96;
        }
        draw(ctx, cam) {
            ctx.globalAlpha = this.life / this.maxLife;
            ctx.fillStyle = this.color;
            ctx.fillRect(this.x - cam.x, this.y - cam.y, this.size, this.size);
            ctx.globalAlpha = 1;
        }
    }

    // --- FUNÇÕES DE SISTEMA --- //

    function resize() {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
    }

    function initInput() {
        window.addEventListener('keydown', e => {
            keys[e.code] = true;
            if(e.code === 'KeyB') toggleShop();
            if(e.key >= '1' && e.key <= '5') castSkill(parseInt(e.key));
        });
        window.addEventListener('keyup', e => keys[e.code] = false);

        // Mobile Touch (Multitouch)
        const joyZone = document.getElementById('joy-zone-left');
        const atkZone = document.getElementById('btn-attack-zone');

        if ('ontouchstart' in window) {
            document.getElementById('mobile-ui').style.display = 'block';
            
            // Joystick Touch
            joyZone.addEventListener('touchstart', e => {
                e.preventDefault();
                for(let i=0; i<e.changedTouches.length; i++){
                    joy.id = e.changedTouches[i].identifier;
                    joy.active = true;
                    updateJoy(e.changedTouches[i]);
                }
            });

            joyZone.addEventListener('touchmove', e => {
                e.preventDefault();
                for(let i=0; i<e.changedTouches.length; i++){
                    if(e.changedTouches[i].identifier === joy.id) updateJoy(e.changedTouches[i]);
                }
            });

            const endJoy = (e) => {
                for(let i=0; i<e.changedTouches.length; i++){
                    if(e.changedTouches[i].identifier === joy.id) {
                        joy.active = false;
                        joy.x = 0; joy.y = 0;
                        document.getElementById('joy-stick').style.transform = `translate(0px, 0px)`;
                    }
                }
            };
            joyZone.addEventListener('touchend', endJoy);
            joyZone.addEventListener('touchcancel', endJoy);

            // Attack Button Touch
            atkZone.addEventListener('touchstart', e => {
                e.preventDefault();
                attackBtn.active = true;
                performAttack(); // Ataque imediato no toque
            });
            atkZone.addEventListener('touchend', e => { e.preventDefault(); attackBtn.active = false; });
        }
    }

    function updateJoy(touch) {
        const rect = document.getElementById('joy-zone-left').getBoundingClientRect();
        const cx = rect.left + rect.width/2;
        const cy = rect.top + rect.height/2;
        const dx = touch.clientX - cx;
        const dy = touch.clientY - cy;
        const dist = Math.min(Math.hypot(dx, dy), rect.width/2);
        const ang = Math.atan2(dy, dx);
        
        joy.x = Math.cos(ang) * (dist / (rect.width/2));
        joy.y = Math.sin(ang) * (dist / (rect.width/2));
        
        const stickX = Math.cos(ang) * dist;
        const stickY = Math.sin(ang) * dist;
        document.getElementById('joy-stick').style.transform = `translate(${stickX}px, ${stickY}px)`;
    }

// Localize a função startGame e substitua por esta:
// --- DENTRO DO RETURN DO ENGINE ---
// Adicione ou atualize estas funções no objeto retornado:

function setDifficulty(level) {
    const levels = {
        'facil': 0.6,
        'normal': 2.0,
        'dificil': 3.0,
        'pesadelo': 5.0
    };
    state.difficulty = levels[level] || 1.0;
}

function startGame(weaponClass) { // weaponClass será 'soll', 'angelica', etc.
    document.getElementById("menu-start").classList.add("hidden");
    state.running = true;
    state.paused = false;
    
    // Setup Player - Salvando a escolha
    player.weapon = weaponClass; 

    // Atributos baseados no personagem
    if(weaponClass === 'staff' || weaponClass === 'angelica' || weaponClass === 'xerequinha') {
        player.maxMp = 150; player.mp = 150;
        player.dmg = 50;
        player.stats.regenMp = 0.3;
    } else {
        player.speed = 5.0;
        player.stats.lifesteal = 2;
    }
    
    bgm.play().catch(e => console.log("Áudio bloqueado"));
    loopId = requestAnimationFrame(gameLoop);


    const h = heroes[charId] || heroes['soll'];
    player.maxHp = h.hp; player.hp = h.hp;
    player.dmg = h.dmg;
    player.speed = h.speed;
    player.maxMp = h.mp; player.mp = h.mp;
    player.stats.regenMp = h.regen;
    player.weapon = h.weapon;
    player.charIcon = h.icon; // Guardamos o emoji para desenhar

    bgm.play().catch(e => console.log("Erro áudio"));
    loopId = requestAnimationFrame(gameLoop);


// --- ATUALIZAÇÃO NO MÉTODO DRAW DO PLAYER ---
// Procure a parte que desenha o "Corpo" do player e substitua pelo texto:
// Onde está: ctx.arc(player.x, player.y, player.radius, 0, Math.PI*2); ctx.fill();

ctx.font = "30px Arial";
ctx.textAlign = "center";
ctx.textBaseline = "middle";
ctx.fillText(player.charIcon || '👤', player.x, player.y);
        
        // Setup Player
        player.weapon = weaponClass;
        if(weaponClass === 'staff') {
            player.maxMp = 150; player.mp = 150;
            player.dmg = 50;
            player.stats.regenMp = 0.3;
        } else {
            player.speed = 5.0;
            player.stats.lifesteal = 2;
        }
        
        // Setup Music
        bgm.volume = 0.5;
        bgm.play().catch(e => console.log("Áudio bloqueado pelo browser até interação"));

        loopId = requestAnimationFrame(gameLoop);
    }

    // --- GAME LOOP --- //

    function gameLoop() {
        if(!state.paused && state.running) {
            update();
            draw();
            frame++;
        }
        loopId = requestAnimationFrame(gameLoop);
    }

    function update() {
        // --- PLAYER MOVEMENT ---
        let mx = 0, my = 0;
        if (keys['KeyW'] || keys['ArrowUp']) my -= 1;
        if (keys['KeyS'] || keys['ArrowDown']) my += 1;
        if (keys['KeyA'] || keys['ArrowLeft']) mx -= 1;
        if (keys['KeyD'] || keys['ArrowRight']) mx += 1;
        
        if (joy.active) { mx = joy.x; my = joy.y; }

        if (mx !== 0 || my !== 0) {
            const mag = Math.hypot(mx, my);
            const moveSpeed = mag > 1 ? player.speed : player.speed * mag;
            player.vx = (mx / mag) * moveSpeed;
            player.vy = (my / mag) * moveSpeed;
            player.x += player.vx;
            player.y += player.vy;
            player.angle = Math.atan2(my, mx);
        }

        // Camera Smooth Follow
        world.camera.tx = player.x - width/2;
        world.camera.ty = player.y - height/2;
        world.camera.x = MathUtils.lerp(world.camera.x, world.camera.tx, 0.1);
        world.camera.y = MathUtils.lerp(world.camera.y, world.camera.ty, 0.1);

        // --- ATTACK LOGIC ---
        if (player.cd_atk > 0) player.cd_atk--;
        if (player.invul > 0) player.invul--;
        player.mp = Math.min(player.maxMp, player.mp + player.stats.regenMp);

        // Auto Attack no PC se segurar Espaço, ou Mobile btn
        if ((keys['Space'] || attackBtn.active) && player.cd_atk <= 0) {
            performAttack();
        }

        // --- ENTITIES ---
        // Spawn
        if (world.entities.length < CONFIG.ENEMY_LIMIT && frame % 30 === 0) {
            const ang = Math.random() * Math.PI * 2;
            const dist = CONFIG.SPAWN_RADIUS;
            const ex = player.x + Math.cos(ang) * dist;
            const ey = player.y + Math.sin(ang) * dist;
            
            // Escolha de tipo baseada no nível/tempo
            let type = 'grunt';
            if (state.level > 3 && Math.random() < 0.2) type = 'runner';
            if (state.level > 5 && Math.random() < 0.1) type = 'tank';
            
            world.entities.push(new Enemy(ex, ey, type));
        }

        // Update Inimigos
        world.entities.forEach(en => en.update());
        
        // Remove mortos e distantes
        world.entities = world.entities.filter(en => {
            if (en.dead) return false;
            if (MathUtils.dist(player.x, player.y, en.x, en.y) > CONFIG.DESPAWN_RADIUS && en.type !== 'boss') return false;
            return true;
        });

        // --- DROPS ---
        world.drops.forEach(d => {
            const dist = MathUtils.dist(player.x, player.y, d.x, d.y);
            if (dist < player.stats.magnet) {
                d.x = MathUtils.lerp(d.x, player.x, 0.15);
                d.y = MathUtils.lerp(d.y, player.y, 0.15);
                if (dist < 20) {
                    d.collected = true;
                    if(d.type === 'xp') {
                        state.xp += d.val;
                        if(state.xp >= state.nextXp) levelUp();
                    } else {
                        state.souls += d.val;
                    }
                }
            }
        });
        world.drops = world.drops.filter(d => !d.collected);

        // --- PARTICLES ---
        world.particles.forEach(p => p.update());
        world.particles = world.particles.filter(p => p.life > 0);
        if(world.particles.length > CONFIG.PARTICLE_LIMIT) world.particles.splice(0, 20);

        syncHUD();
    }

    function draw() {
        const cam = world.camera;
        
        // Shake
        let sx = 0, sy = 0;
        if(cam.shake > 0) {
            sx = MathUtils.rand(-cam.shake, cam.shake);
            sy = MathUtils.rand(-cam.shake, cam.shake);
            cam.shake *= 0.9;
            if(cam.shake < 0.5) cam.shake = 0;
        }

        // Background
        const biome = CONFIG.BIOMES[state.biomeIdx];
        ctx.fillStyle = biome.bg;
        ctx.fillRect(0, 0, width, height);

        ctx.save();
        ctx.translate(-cam.x + sx, -cam.y + sy);

        // Grid (Opcional, para noção de movimento)
        ctx.strokeStyle = 'rgba(255,255,255,0.03)';
        ctx.lineWidth = 2;
        const gs = 200;
        const startX = Math.floor(cam.x / gs) * gs;
        const startY = Math.floor(cam.y / gs) * gs;
        // Desenha apenas o visível
        ctx.beginPath();
        for(let x=startX; x<startX+width+gs; x+=gs) { ctx.moveTo(x, cam.y); ctx.lineTo(x, cam.y+height); }
        for(let y=startY; y<startY+height+gs; y+=gs) { ctx.moveTo(cam.x, y); ctx.lineTo(cam.x+width, y); }
        ctx.stroke();

        // Decals (Sangue)
        world.decals.forEach(d => {
            ctx.fillStyle = d.color;
            ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI*2); ctx.fill();
        });

        // Drops
        world.drops.forEach(d => {
            ctx.fillStyle = d.type === 'xp' ? '#3b82f6' : '#ffd700';
            ctx.beginPath(); ctx.arc(d.x, d.y, 4 + Math.sin(frame*0.1)*1, 0, Math.PI*2); ctx.fill();
            // Brilho
            ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 10; ctx.stroke(); ctx.shadowBlur = 0;
        });

        // Entities
        world.entities.forEach(en => en.draw(ctx, {x:0, y:0})); // Passamos 0,0 pois ja traduzimos o contexto

        // Player
       // Player
if(player.invul % 8 < 4) { // Piscada de dano
    // Aura
    const grad = ctx.createRadialGradient(player.x, player.y, 10, player.x, player.y, 60);
    grad.addColorStop(0, player.weapon === 'staff' ? 'rgba(0,242,255,0.2)' : 'rgba(255,62,62,0.2)');
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(player.x, player.y, 60, 0, Math.PI*2); ctx.fill();

    // --- AQUI ENTRA A SUBSTITUIÇÃO ---
    ctx.font = "32px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

// Dicionário de emojis baseados na escolha do jogador
    const charEmojis = {
        'soll': '☀️',
        'angelica': '😇',
        'wix': '🦊',
        'xerequinha': '🐱'
    };

    // Desenha o emoji baseado no player.weapon
    const meuEmoji = charEmojis[player.weapon] || '👤';
    ctx.fillText(meuEmoji, player.x, player.y);
    // ----------------------------------
   
    // Direção (Pequeno ponto de referência)
    const ex = player.x + Math.cos(player.angle) * 15;
    const ey = player.y + Math.sin(player.angle) * 15;
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath(); ctx.arc(ex, ey, 3, 0, Math.PI*2); ctx.fill();
    // ---------------------------------
}

        // VFX Ataque
        if (player.cd_atk > (player.weapon === 'staff' ? 30 : 10)) {
            ctx.strokeStyle = player.weapon === 'staff' ? '#0ff' : '#f00';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(player.x, player.y, player.stats.area * 100, player.angle - 1, player.angle + 1);
            ctx.stroke();
        }

        // Particles
        world.particles.forEach(p => p.draw(ctx, {x:0, y:0}));

        ctx.restore();
    }

    // --- AÇÕES DO JOGO --- //

    function performAttack() {
        if(player.cd_atk > 0) return;
        
        player.cd_atk = player.weapon === 'staff' ? 45 : 20;
        const range = 120 * player.stats.area;
        
        // Efeito Visual
        world.camera.shake = 5;
        spawnParticles(player.x, player.y, '#fff', 5);

        // Lógica de Hit
        let hit = false;
        world.entities.forEach(en => {
            if(MathUtils.dist(player.x, player.y, en.x, en.y) < range + en.radius) {
                // Cálculo de Crítico
                let dmg = player.dmg;
                let isCrit = Math.random() < player.stats.crit;
                if(isCrit) dmg *= 2.0;

                damageEnemy(en, dmg, isCrit);
                
                // Knockback
                const ang = Math.atan2(en.y - player.y, en.x - player.x);
                en.pushX = Math.cos(ang) * 10;
                en.pushY = Math.sin(ang) * 10;
                hit = true;
            }
        });

        // Som de ataque (simulado visualmente)
    }

    function damagePlayer(amount) {
        if(player.invul > 0) return;
        player.hp -= amount;
        player.invul = 40;
        world.camera.shake = 15;
        showFloater(player.x, player.y, `-${Math.floor(amount)}`, '#f00');
        spawnParticles(player.x, player.y, '#f00', 10);
        
        if(player.hp <= 0) gameOver();
    }

    function damageEnemy(en, amount, isCrit) {
        en.hp -= amount;
        showFloater(en.x, en.y, Math.floor(amount), isCrit ? '#ff0' : '#fff', isCrit);
        spawnParticles(en.x, en.y, en.color, 3);
        
        if(en.hp <= 0 && !en.dead) {
            en.dead = true;
            killEnemy(en);
        }
    }

    function killEnemy(en) {
        state.kills++;
        spawnParticles(en.x, en.y, en.color, 15);
        world.decals.push({x: en.x, y: en.y, r: en.radius, color: 'rgba(100,0,0,0.3)'});
        
        // Drops (XP e Almas)
        const xpAmount = Math.floor(en.xp * (1 + player.stats.luck * 0.5));
        world.drops.push({x: en.x, y: en.y, type: 'xp', val: xpAmount, collected: false});
        
        if (Math.random() < 0.3) {
            world.drops.push({x: en.x, y: en.y, type: 'soul', val: en.souls, collected: false});
        }

        // Lifesteal
        if(player.stats.lifesteal > 0) {
            player.hp = Math.min(player.maxHp, player.hp + player.stats.lifesteal);
        }

        if(en.type === 'boss') {
            state.bossActive = false;
            document.getElementById("boss-hud").classList.remove("visible");
            showToast("ARAUTO CAÍDO!");
            state.difficulty += 0.5;
            state.souls += 1000;
        }
    }

    function castSkill(slot) {
        const costs = [0, 30, 45, 50, 60, 80]; // Slot 0 vazio
        const cost = costs[slot];
        if(!cost) return;

        if(player.mp < cost) {
            showToast("MANA INSUFICIENTE");
            return;
        }

        player.mp -= cost;
        world.camera.shake = 20;

        switch(slot) {
            case 1: // Nova Explosiva
                world.entities.forEach(en => {
                    if(MathUtils.dist(player.x, player.y, en.x, en.y) < 300) damageEnemy(en, 150, true);
                });
                spawnParticles(player.x, player.y, '#0ff', 50);
                break;
            case 2: // Blitz (Speed)
                player.speed *= 2;
                player.invul = 60;
                setTimeout(() => player.speed /= 2, 2000);
                showToast("VELOCIDADE DA LUZ");
                break;
            case 3: // Cura
                player.hp = Math.min(player.maxHp, player.hp + player.maxHp * 0.4);
                spawnParticles(player.x, player.y, '#0f0', 30);
                break;
            case 4: // Vórtex
                world.entities.forEach(en => {
                    const ang = Math.atan2(player.y - en.y, player.x - en.x);
                    en.pushX = Math.cos(ang) * 20;
                    en.pushY = Math.sin(ang) * 20;
                    en.frozen = 120;
                });
                break;
            case 5: // Apocalipse
                world.entities.forEach(en => damageEnemy(en, 9999, true));
                // Matar Boss instantaneamente é roubado, vamos limitar
                state.souls += 100;
                break;
        }
    }

    // --- UI E SISTEMAS --- //

    function showFloater(x, y, text, color, big=false) {
        const el = document.createElement('div');
        el.className = 'floater';
        el.style.left = (x - world.camera.x + width/2) + 'px'; // Aproximação, idealmente projetar coord
        // Como o canvas ocupa tudo e a câmera move o desenho, precisamos calcular posição na tela
        // Correção rápida: Floaters HTML não seguem a câmera. 
        // Vamos usar um método simples: só spawnar no centro relativo
        // Melhor: Desenhar texto no Canvas é mais performático.
        // Vou manter simples: não implementar floaters HTML complexos agora para não bugar a posição.
        // Vamos desenhar no Canvas no loop de draw se quisermos, mas o user pediu linha de código.
        // Vou implementar um sistema simples de array de floaters desenhados no canvas.
        world.floaters.push({x, y, text, color, life: 60, big});
    }

    function spawnParticles(x, y, color, count) {
        for(let i=0; i<count; i++) world.particles.push(new Particle(x, y, color, MathUtils.rand(2, 6), 60));
    }

    function levelUp() {
        state.level++;
        state.xp = 0;
        state.nextXp = Math.floor(state.nextXp * 1.3);
        state.difficulty += 0.1;
        showToast("NÍVEL " + state.level);

        // Pausa e abre menu
        state.paused = true;
        const menu = document.getElementById("menu-upgrade");
        const root = document.getElementById("upgrade-root");
        menu.classList.remove("hidden");
        root.innerHTML = "";

        // Gerar 3 opções aleatórias
        const upgrades = [
            {t:"Força Bruta", d:"+15% Dano", f:()=>player.dmg*=1.15},
            {t:"Vitalidade", d:"+50 Vida Máx", f:()=>{player.maxHp+=50; player.hp+=50;}},
            {t:"Agilidade", d:"+10% Velocidade", f:()=>player.speed*=1.1},
            {t:"Vampirismo", d:"+2 Lifesteal", f:()=>player.stats.lifesteal+=2},
            {t:"Área de Efeito", d:"+20% Alcance", f:()=>player.stats.area+=0.2},
            {t:"Sabedoria", d:"+20% Regen Mana", f:()=>player.stats.regenMp*=1.2}
        ];

        // Shuffle e pegar 3
        upgrades.sort(()=>Math.random()-0.5).slice(0,3).forEach(u => {
            const el = document.createElement("div");
            el.className = "card-item";
            el.innerHTML = `<h3>${u.t}</h3><p>${u.d}</p><span style='color:lime'>ESCOLHER</span>`;
            el.onclick = () => {
                u.f();
                menu.classList.add("hidden");
                state.paused = false;
            };
            root.appendChild(el);
        });

        if(state.level % 5 === 0) spawnBoss();
    }

    function spawnBoss() {
        state.bossActive = true;
        const boss = new Enemy(player.x + 600, player.y, 'boss');
        world.entities.push(boss);
        
        const hud = document.getElementById("boss-hud");
        hud.classList.add("visible");
        document.getElementById("boss-name").innerText = "LORDE DAS SOMBRAS";
        showToast("UMA PRESENÇA MALIGNA SURGIU");
    }

    function gameOver() {
        state.running = false;
        bgm.pause(); bgm.currentTime = 0;
        document.getElementById("menu-death").classList.remove("hidden");
        document.getElementById("death-stats").innerText = 
            `NÍVEL: ${state.level} • ABATES: ${state.kills} • ALMAS: ${state.souls}`;
    }

    function syncHUD() {
        document.getElementById("hp-bar").style.width = (player.hp / player.maxHp * 100) + "%";
        document.getElementById("mp-bar").style.width = (player.mp / player.maxMp * 100) + "%";
        document.getElementById("xp-bar").style.width = (state.xp / state.nextXp * 100) + "%";
        
        document.getElementById("hp-val").innerText = Math.floor(player.hp) + "/" + Math.floor(player.maxHp);
        document.getElementById("mp-val").innerText = Math.floor(player.mp) + "/" + Math.floor(player.maxMp);
        document.getElementById("xp-val").innerText = Math.floor(state.xp) + "/" + Math.floor(state.nextXp);
        
        document.getElementById("lvl-txt").innerText = state.level;
        document.getElementById("kills-txt").innerText = state.kills;
        document.getElementById("coins-txt").innerText = state.souls;
        document.getElementById("bioma-name").innerText = CONFIG.BIOMES[state.biomeIdx].name;

        // Atualizar Boss Bar
        if(state.bossActive) {
            const boss = world.entities.find(e => e.type === 'boss');
            if(boss) document.getElementById("boss-bar").style.width = (boss.hp / boss.maxHp * 100) + "%";
        }

        // Draw Floaters in HUD sync (draw call actually better inside draw loop, but keeping separate logic here if needed)
        // Vamos desenhar floaters dentro do loop draw() para ficarem corretos na tela
    }
    
    // Sobrescrevendo o draw final para incluir floaters (textos de dano)
    const originalDraw = draw;
    draw = function() {
        originalDraw();
        const ctx = canvas.getContext("2d");
        const cam = world.camera;
        
        ctx.save();
        ctx.font = "bold 20px Arial";
        ctx.textAlign = "center";
        
        world.floaters.forEach(f => {
            const sx = f.x - cam.x;
            const sy = f.y - cam.y;
            // Float up animation logic
            const offset = (60 - f.life) * 1.5;
            
            ctx.fillStyle = 'black';
            ctx.fillText(f.text, sx + 2, sy - offset + 2);
            ctx.fillStyle = f.color;
            if(f.big) ctx.font = "bold 30px Arial";
            ctx.fillText(f.text, sx, sy - offset);
            
            f.life--;
        });
        world.floaters = world.floaters.filter(f => f.life > 0);
        ctx.restore();
    }

    function toggleShop() {
        const menu = document.getElementById("menu-shop");
        if (menu.classList.contains("hidden")) {
            state.paused = true;
            menu.classList.remove("hidden");
            renderShop();
        } else {
            state.paused = false;
            menu.classList.add("hidden");
        }
    }

    function renderShop() {
        const root = document.getElementById("shop-root");
        root.innerHTML = "";
        CONFIG.SHOP_ITEMS.forEach(item => {
            const el = document.createElement("div");
            el.className = "card-item";
            el.innerHTML = `
                <h3>${item.name}</h3>
                <p>${item.desc}</p>
                <span class="card-price">${item.cost} ALMAS</span>
            `;
            el.onclick = () => {
                if(state.souls >= item.cost) {
                    state.souls -= item.cost;
                    item.fn(player);
                    showToast("COMPRADO: " + item.name);
                    renderShop(); // Atualiza (se quiser aumentar preço, etc)
                    syncHUD();
                } else {
                    showToast("ALMAS INSUFICIENTES");
                }
            };
            root.appendChild(el);
        });
    }

    function showToast(msg) {
        const t = document.getElementById("toast");
        t.innerText = msg;
        t.style.opacity = 1;
        setTimeout(() => t.style.opacity = 0, 2000);
    }

    // --- CONFIGURAÇÕES ---
    function toggleSettings() {
        const m = document.getElementById("menu-settings");
        m.classList.toggle("hidden");
    }

    function resizeJoystick(val) {
        const zone = document.getElementById("joy-zone-left");
        zone.style.width = val + "px";
        zone.style.height = val + "px";
    }

    function toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(e => console.log(e));
        } else {
            document.exitFullscreen();
        }
    }
    
    function setVolume(val) {
        bgm.volume = val / 100;
    }

    // Init
    window.onload = () => {
        resize();
        initInput();
        window.addEventListener('resize', resize);
    };

    return { 
        setDifficulty,
        startGame, 
        toggleShop, 
        toggleSettings, 
        toggleFullscreen,
        resizeJoystick,
        setVolume,
        cast: castSkill,
        damagePlayer,
        damageEnemy
    };
})();