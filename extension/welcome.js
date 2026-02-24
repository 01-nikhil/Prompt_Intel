/**
 * welcome.js — Premium Interactive Onboarding
 *
 * Features:
 *  - Interactive particle constellation background
 *  - Mouse-tracking 3D tilt on cards
 *  - Smooth slide transitions with 3D perspective
 *  - Animated number counters
 *  - Canvas confetti celebration
 *  - Typing effect with realistic timing
 */

(function () {
    'use strict';

    /* ═══════════════════════════════════════════════════
       CONFIGURATION
       ═══════════════════════════════════════════════════ */
    const TOTAL_SLIDES = 5;
    const PARTICLE_COUNT = 90;
    const CONNECTION_DIST = 120;
    const MOUSE_RADIUS = 160;

    /* Theme colors per slide */
    const THEMES = {
        red: { r: 239, g: 68, b: 68 },
        indigo: { r: 129, g: 140, b: 248 },
        green: { r: 52, g: 211, b: 153 },
        celebration: { r: 167, g: 139, b: 250 },
    };

    let current = 0;
    let isTransitioning = false;
    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;

    /* ═══════════════════════════════════════════════════
       DOM REFERENCES
       ═══════════════════════════════════════════════════ */
    const slides = document.querySelectorAll('.slide');
    const dots = document.querySelectorAll('.dot');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const skipBtn = document.getElementById('skip-btn');
    const startBtn = document.getElementById('get-started');
    const progressEl = document.getElementById('progress-fill');
    const flipCard = document.getElementById('flip-card');
    const flipTrigger = document.getElementById('flip-trigger');
    const flipLabel = document.getElementById('flip-label');
    const canvas = document.getElementById('particle-canvas');
    const ctx = canvas.getContext('2d');

    /* ═══════════════════════════════════════════════════
       PARTICLE SYSTEM — Interactive Constellation
       ═══════════════════════════════════════════════════ */
    let particles = [];
    let currentThemeColor = THEMES.red;
    let targetColor = THEMES.red;

    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    class Particle {
        constructor() {
            this.reset();
        }
        reset() {
            this.x = Math.random() * canvas.width;
            this.y = Math.random() * canvas.height;
            this.vx = (Math.random() - 0.5) * 0.5;
            this.vy = (Math.random() - 0.5) * 0.5;
            this.radius = Math.random() * 2 + 0.5;
            this.alpha = Math.random() * 0.5 + 0.1;
        }
        update() {
            // Mouse repulsion
            const dx = this.x - mouseX;
            const dy = this.y - mouseY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < MOUSE_RADIUS && dist > 0) {
                const force = (MOUSE_RADIUS - dist) / MOUSE_RADIUS * 0.8;
                this.vx += (dx / dist) * force;
                this.vy += (dy / dist) * force;
            }

            // Damping
            this.vx *= 0.98;
            this.vy *= 0.98;

            // Clamp velocity
            const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
            if (speed > 2) {
                this.vx = (this.vx / speed) * 2;
                this.vy = (this.vy / speed) * 2;
            }

            this.x += this.vx;
            this.y += this.vy;

            // Wrap edges
            if (this.x < -10) this.x = canvas.width + 10;
            if (this.x > canvas.width + 10) this.x = -10;
            if (this.y < -10) this.y = canvas.height + 10;
            if (this.y > canvas.height + 10) this.y = -10;
        }
        draw() {
            const c = currentThemeColor;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${this.alpha})`;
            ctx.fill();
        }
    }

    // Spawn particles
    for (let i = 0; i < PARTICLE_COUNT; i++) {
        particles.push(new Particle());
    }

    function drawConnections() {
        const c = currentThemeColor;
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x;
                const dy = particles[i].y - particles[j].y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < CONNECTION_DIST) {
                    const alpha = (1 - dist / CONNECTION_DIST) * 0.12;
                    ctx.beginPath();
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.strokeStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`;
                    ctx.lineWidth = 0.6;
                    ctx.stroke();
                }
            }
        }
    }

    function lerpColor(a, b, t) {
        return {
            r: Math.round(a.r + (b.r - a.r) * t),
            g: Math.round(a.g + (b.g - a.g) * t),
            b: Math.round(a.b + (b.b - a.b) * t),
        };
    }

    function animateParticles() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Smooth color transition
        currentThemeColor = lerpColor(currentThemeColor, targetColor, 0.03);

        particles.forEach(p => { p.update(); p.draw(); });
        drawConnections();

        requestAnimationFrame(animateParticles);
    }
    animateParticles();

    /* ═══════════════════════════════════════════════════
       MOUSE TRACKING (for particles + 3D tilt)
       ═══════════════════════════════════════════════════ */
    document.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
        updateTiltElements(e);
    });

    /* ═══════════════════════════════════════════════════
       3D TILT EFFECT on [data-tilt] elements
       ═══════════════════════════════════════════════════ */
    function updateTiltElements(e) {
        const tiltEls = slides[current].querySelectorAll('[data-tilt]');
        tiltEls.forEach(el => {
            const rect = el.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            const dx = (e.clientX - cx) / rect.width;
            const dy = (e.clientY - cy) / rect.height;
            const tiltX = dy * -6; // max 6 degrees
            const tiltY = dx * 6;
            el.style.transform = `perspective(600px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) scale(1.01)`;

            // Move shine
            const shine = el.querySelector('.card-3d__shine');
            if (shine) {
                shine.style.transform = `translate(${dx * 20}px, ${dy * 20}px)`;
            }
        });
    }

    // Reset tilt on mouse leave
    document.addEventListener('mouseleave', () => {
        document.querySelectorAll('[data-tilt]').forEach(el => {
            el.style.transform = '';
        });
    });

    /* ═══════════════════════════════════════════════════
       SLIDE NAVIGATION
       ═══════════════════════════════════════════════════ */
    function goTo(index) {
        if (index < 0 || index >= TOTAL_SLIDES || index === current || isTransitioning) return;
        isTransitioning = true;

        // Exit current
        slides[current].classList.remove('slide--active');

        current = index;

        // Set particle theme based on slide
        const theme = slides[current].getAttribute('data-theme') || 'indigo';
        targetColor = THEMES[theme] || THEMES.indigo;

        setTimeout(() => {
            // Restart CSS animations
            restartAnimations(slides[current]);
            slides[current].classList.add('slide--active');

            // Slide-specific triggers
            if (current === 0) startTyping();
            if (current === 2) startCounters(slides[current]);
            if (current === 4) launchConfetti();

            isTransitioning = false;
        }, 80);

        // Update UI
        updateNav();
    }

    function updateNav() {
        dots.forEach((d, i) => d.classList.toggle('dot--active', i === current));
        prevBtn.style.display = current === 0 ? 'none' : 'flex';
        nextBtn.style.display = current === TOTAL_SLIDES - 1 ? 'none' : 'flex';
        skipBtn.style.display = current === TOTAL_SLIDES - 1 ? 'none' : 'block';
        progressEl.style.width = ((current + 1) / TOTAL_SLIDES * 100) + '%';
    }

    function restartAnimations(slideEl) {
        const selectors = [
            '.floating-emoji', '.slide__title', '.slide__subtitle', '.tagline',
            '.prompt-card', '.response-card', '.card-enter',
            '.warning-pill', '.scan-result', '.readout',
            '.scanner-box', '.scanner-beam', '.scan-line',
            '.step-card', '.welcome-logo-3d', '.party',
            '.word-3d', '.reveal-text', '.glitch-text',
            '.shake-overlay'
        ].join(', ');
        slideEl.querySelectorAll(selectors).forEach(el => {
            el.style.animation = 'none';
            void el.offsetWidth;
            el.style.animation = '';
        });
    }

    /* ── Event listeners ── */
    nextBtn.addEventListener('click', () => goTo(current + 1));
    prevBtn.addEventListener('click', () => goTo(current - 1));

    dots.forEach(dot => {
        dot.addEventListener('click', () => {
            goTo(parseInt(dot.getAttribute('data-index'), 10));
        });
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); goTo(current + 1); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(current - 1); }
        if (e.key === 'Escape') finishOnboarding();
    });

    skipBtn.addEventListener('click', finishOnboarding);
    startBtn.addEventListener('click', finishOnboarding);

    function finishOnboarding() {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.set({ piOnboardingDone: true });
        }
        window.close();
    }

    /* ═══════════════════════════════════════════════════
       TYPING ANIMATION (Slide 1)
       ═══════════════════════════════════════════════════ */
    const TYPED = 'Write me something about marketing';
    let typeTimer = null;

    function startTyping() {
        const el = document.getElementById('typed-text');
        const cursorEl = document.getElementById('cursor');
        const responseEl = document.getElementById('ai-response');
        if (!el) return;

        el.textContent = '';
        if (cursorEl) cursorEl.style.display = 'inline';
        if (responseEl) {
            responseEl.style.opacity = '0';
            responseEl.style.transform = 'translateY(16px)';
        }
        clearTimeout(typeTimer);

        let i = 0;
        function tick() {
            if (i < TYPED.length) {
                el.textContent += TYPED[i++];
                typeTimer = setTimeout(tick, 40 + Math.random() * 50);
            } else {
                setTimeout(() => {
                    if (cursorEl) cursorEl.style.display = 'none';
                    if (responseEl) {
                        responseEl.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
                        responseEl.style.opacity = '1';
                        responseEl.style.transform = 'translateY(0)';
                    }
                }, 700);
            }
        }
        typeTimer = setTimeout(tick, 900);
    }

    /* ═══════════════════════════════════════════════════
       ANIMATED COUNTERS (Slide 3)
       ═══════════════════════════════════════════════════ */
    function startCounters(slideEl) {
        slideEl.querySelectorAll('.counter').forEach(el => {
            const target = parseInt(el.getAttribute('data-target'), 10);
            const suffix = el.getAttribute('data-suffix') || '';
            let current = 0;
            const duration = 1200;
            const start = performance.now();

            function animate(now) {
                const elapsed = now - start;
                const progress = Math.min(elapsed / duration, 1);
                // Ease out cubic
                const eased = 1 - Math.pow(1 - progress, 3);
                current = Math.round(eased * target);
                el.textContent = current + suffix;
                if (progress < 1) requestAnimationFrame(animate);
            }
            requestAnimationFrame(animate);
        });
    }

    /* ═══════════════════════════════════════════════════
       3D CARD FLIP (Slide 4)
       ═══════════════════════════════════════════════════ */
    let isFlipped = false;

    flipTrigger.addEventListener('click', () => {
        isFlipped = !isFlipped;
        flipCard.classList.toggle('flip-card--flipped', isFlipped);
        flipLabel.textContent = isFlipped ? '🔄 Tap to see the original' : '🔄 Tap to see the magic';
    });

    /* ═══════════════════════════════════════════════════
       CONFETTI SYSTEM (Slide 5)
       ═══════════════════════════════════════════════════ */
    const confettiCanvas = document.getElementById('confetti-canvas');
    const cctx = confettiCanvas ? confettiCanvas.getContext('2d') : null;
    let confettiPieces = [];
    let confettiRunning = false;

    function resizeConfetti() {
        if (!confettiCanvas) return;
        const parent = confettiCanvas.parentElement;
        if (parent) {
            confettiCanvas.width = parent.offsetWidth;
            confettiCanvas.height = parent.offsetHeight;
        }
    }

    const CONFETTI_COLORS = [
        '#818cf8', '#a78bfa', '#c084fc', '#6366f1',
        '#34d399', '#6ee7b7', '#fbbf24', '#fb923c',
        '#f87171', '#c7d2fe',
    ];

    class ConfettiPiece {
        constructor(cw, ch) {
            this.x = Math.random() * cw;
            this.y = -10 - Math.random() * ch * 0.3;
            this.w = Math.random() * 8 + 4;
            this.h = Math.random() * 4 + 2;
            this.color = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
            this.vx = (Math.random() - 0.5) * 3;
            this.vy = Math.random() * 3 + 2;
            this.va = (Math.random() - 0.5) * 0.15;
            this.angle = Math.random() * Math.PI * 2;
            this.alpha = 1;
        }
        update() {
            this.x += this.vx;
            this.vy += 0.04; // gravity
            this.y += this.vy;
            this.angle += this.va;
            this.vx *= 0.99;
            if (this.y > confettiCanvas.height + 20) this.alpha = 0;
        }
        draw(ctx) {
            if (this.alpha <= 0) return;
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(this.angle);
            ctx.globalAlpha = this.alpha;
            ctx.fillStyle = this.color;
            ctx.fillRect(-this.w / 2, -this.h / 2, this.w, this.h);
            ctx.restore();
        }
    }

    function launchConfetti() {
        if (!cctx || confettiRunning) return;
        resizeConfetti();
        confettiRunning = true;
        confettiPieces = [];

        for (let i = 0; i < 120; i++) {
            confettiPieces.push(new ConfettiPiece(confettiCanvas.width, confettiCanvas.height));
        }

        function loop() {
            cctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
            let alive = false;
            confettiPieces.forEach(p => {
                p.update();
                p.draw(cctx);
                if (p.alpha > 0) alive = true;
            });
            if (alive) {
                requestAnimationFrame(loop);
            } else {
                confettiRunning = false;
            }
        }
        loop();
    }

    /* ═══════════════════════════════════════════════════
       FLOATING EMOJI PARALLAX (data-depth)
       ═══════════════════════════════════════════════════ */
    document.addEventListener('mousemove', (e) => {
        const emojis = document.querySelectorAll('.floating-emoji');
        emojis.forEach(em => {
            const depth = parseFloat(em.getAttribute('data-depth') || 0.2);
            const cx = window.innerWidth / 2;
            const cy = window.innerHeight / 2;
            const dx = (e.clientX - cx) * depth * 0.05;
            const dy = (e.clientY - cy) * depth * 0.05;
            em.style.transform = `translate(${dx}px, ${dy}px) translateZ(30px)`;
        });
    });

    /* ═══════════════════════════════════════════════════
       INITIALIZE
       ═══════════════════════════════════════════════════ */
    // Set initial theme
    const initTheme = slides[0].getAttribute('data-theme') || 'red';
    currentThemeColor = THEMES[initTheme] || THEMES.red;
    targetColor = currentThemeColor;

    // Start typing on first slide
    startTyping();
    updateNav();

})();
