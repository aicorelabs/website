// Shared chrome wiring loaded on every page via the layout.
// Sets up: mobile menu, smooth scroll (Lenis), custom cursor, reveal observer,
// ripple effect, and the brief modal + form. Page-specific scripts (hero
// parallax, marquee, magnetic buttons) stay inline in their views and may
// read `window.lenisInstance` once this file has run.

document.addEventListener('DOMContentLoaded', () => {
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();

    // --- Mobile menu --------------------------------------------------------
    const mobileMenuToggle = document.getElementById('mobileMenuToggle');
    const mobileMenu = document.getElementById('mobileMenu');
    const mobileBackdrop = document.getElementById('mobileBackdrop');
    const mobileMenuClose = document.getElementById('mobileMenuClose');

    function toggleMobileMenu() {
        if (!mobileMenu || !mobileBackdrop) return;
        mobileMenu.classList.toggle('active');
        mobileBackdrop.classList.toggle('active');
        document.body.style.overflow = mobileMenu.classList.contains('active') ? 'hidden' : '';
    }

    if (mobileMenuToggle) mobileMenuToggle.addEventListener('click', toggleMobileMenu);
    if (mobileMenuClose) mobileMenuClose.addEventListener('click', toggleMobileMenu);
    if (mobileBackdrop) mobileBackdrop.addEventListener('click', toggleMobileMenu);

    document.querySelectorAll('#mobileMenu a, #mobileMenu button[data-open-brief]').forEach((link) => {
        link.addEventListener('click', () => {
            if (mobileMenu && mobileMenu.classList.contains('active')) toggleMobileMenu();
        });
    });

    // --- GSAP / ScrollTrigger ----------------------------------------------
    if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
        gsap.registerPlugin(ScrollTrigger);
    }

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isFinePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const isDesktop = window.matchMedia('(min-width: 769px)').matches;

    // --- Lenis smooth scroll -----------------------------------------------
    // Isolated in try/catch with its own RAF loop so a Lenis failure cannot
    // stall GSAP's ticker or hide the rest of the page. Exposed as
    // window.lenisInstance so per-page scripts can reach it.
    let lenisInstance = null;
    const LenisCtor = (typeof Lenis !== 'undefined')
        ? (Lenis && Lenis.default ? Lenis.default : Lenis)
        : null;
    if (!prefersReducedMotion && typeof LenisCtor === 'function') {
        try {
            lenisInstance = new LenisCtor({
                lerp: 0.1,
                smoothWheel: true,
                wheelMultiplier: 1,
                touchMultiplier: 2,
                // Let wheel/touch events inside any [data-lenis-prevent]
                // subtree fall through to the browser (e.g. modal panel).
                prevent: (node) => !!(node && node.closest && node.closest('[data-lenis-prevent]')),
            });
            if (typeof ScrollTrigger !== 'undefined') {
                lenisInstance.on('scroll', ScrollTrigger.update);
            }
            const lenisRaf = (time) => {
                lenisInstance.raf(time);
                requestAnimationFrame(lenisRaf);
            };
            requestAnimationFrame(lenisRaf);

            document.querySelectorAll('a[href^="#"]').forEach((link) => {
                link.addEventListener('click', (e) => {
                    const href = link.getAttribute('href');
                    if (!href || href === '#' || href.length < 2) return;
                    const target = document.querySelector(href);
                    if (!target) return;
                    e.preventDefault();
                    lenisInstance.scrollTo(target, { offset: -64, duration: 1.2 });
                });
            });
        } catch (e) {
            console.warn('Lenis init failed; falling back to native scroll.', e);
            lenisInstance = null;
        }
    }
    window.lenisInstance = lenisInstance;

    // --- Custom cursor (lerp ring follows pointer) -------------------------
    if (!prefersReducedMotion && isFinePointer && isDesktop) {
        const dot = document.querySelector('.cursor-dot');
        const ring = document.querySelector('.cursor-ring');
        if (dot && ring) {
            let mouseX = window.innerWidth / 2;
            let mouseY = window.innerHeight / 2;
            let ringX = mouseX;
            let ringY = mouseY;

            document.body.classList.add('cursor-active');

            document.addEventListener('mousemove', (e) => {
                mouseX = e.clientX;
                mouseY = e.clientY;
                dot.style.setProperty('--cx', mouseX + 'px');
                dot.style.setProperty('--cy', mouseY + 'px');
            });

            const lerpCursor = () => {
                ringX += (mouseX - ringX) * 0.18;
                ringY += (mouseY - ringY) * 0.18;
                ring.style.setProperty('--cx', ringX + 'px');
                ring.style.setProperty('--cy', ringY + 'px');
                requestAnimationFrame(lerpCursor);
            };
            lerpCursor();

            const interactiveSelector = 'a, button, [role="button"], input, textarea, select, .magnetic, .showcase-image';
            document.querySelectorAll(interactiveSelector).forEach((el) => {
                el.addEventListener('mouseenter', () => document.body.classList.add('cursor-hover'));
                el.addEventListener('mouseleave', () => document.body.classList.remove('cursor-hover'));
            });
        }
    }

    // --- Reveal-on-scroll ---------------------------------------------------
    const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
                obs.unobserve(entry.target);
            }
        });
    }, { root: null, rootMargin: '0px', threshold: 0.1 });
    document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));

    // --- Copy-link share buttons -------------------------------------------
    document.querySelectorAll('[data-copy-link]').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            const url = btn.getAttribute('data-copy-link') || window.location.href;
            try {
                await navigator.clipboard.writeText(url);
            } catch {
                const ta = document.createElement('textarea');
                ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0';
                document.body.appendChild(ta); ta.select();
                try { document.execCommand('copy'); } finally { ta.remove(); }
            }
            const prev = btn.getAttribute('aria-label');
            btn.setAttribute('aria-label', 'Link copied');
            btn.classList.add('copy-link-success');
            setTimeout(() => {
                btn.setAttribute('aria-label', prev || 'Copy link');
                btn.classList.remove('copy-link-success');
            }, 1500);
        });
    });

    // --- Ripple on click ---------------------------------------------------
    document.querySelectorAll('a, button').forEach((el) => {
        el.addEventListener('click', function (e) {
            const ripple = document.createElement('span');
            ripple.classList.add('ripple');

            const rect = this.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            const x = e.clientX - rect.left - size / 2;
            const y = e.clientY - rect.top - size / 2;

            ripple.style.width = ripple.style.height = size + 'px';
            ripple.style.left = x + 'px';
            ripple.style.top = y + 'px';

            if (window.getComputedStyle(this).position === 'static') {
                this.style.position = 'relative';
            }

            this.appendChild(ripple);
            setTimeout(() => ripple.remove(), 600);
        });
    });

    // --- Brief modal -------------------------------------------------------
    (() => {
        const modal = document.getElementById('brief-modal');
        if (!modal) return;
        let lastFocused = null;
        let savedScrollY = 0;
        let isOpen = false;

        const resetForm = () => {
            const form = document.getElementById('brief-form');
            const thanks = document.getElementById('brief-thanks');
            if (form) form.hidden = false;
            if (thanks) thanks.hidden = true;
        };

        const setBackgroundInert = (inert) => {
            Array.from(document.body.children).forEach((el) => {
                if (el === modal) return;
                if (inert) {
                    el.setAttribute('inert', '');
                    el.setAttribute('aria-hidden', 'true');
                } else {
                    el.removeAttribute('inert');
                    el.removeAttribute('aria-hidden');
                }
            });
        };

        // Bulletproof scroll lock — works on iOS Safari (overflow:hidden alone
        // is not enough) and survives Lenis's wheel/touch hijacking.
        const lockScroll = () => {
            savedScrollY = window.scrollY || document.documentElement.scrollTop || 0;
            document.body.style.position = 'fixed';
            document.body.style.top = `-${savedScrollY}px`;
            document.body.style.left = '0';
            document.body.style.right = '0';
            document.body.style.width = '100%';
            document.body.classList.add('brief-modal-open');
            if (window.lenisInstance) { try { window.lenisInstance.stop(); } catch (_) {} }
        };
        const unlockScroll = () => {
            document.body.style.position = '';
            document.body.style.top = '';
            document.body.style.left = '';
            document.body.style.right = '';
            document.body.style.width = '';
            document.body.classList.remove('brief-modal-open');
            window.scrollTo(0, savedScrollY);
            if (window.lenisInstance) { try { window.lenisInstance.start(); } catch (_) {} }
        };

        const focusableSelector = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
        const onKeydown = (e) => {
            if (!isOpen) return;
            if (e.key === 'Escape') { e.preventDefault(); close(); return; }
            if (e.key !== 'Tab') return;
            const focusables = Array.from(modal.querySelectorAll(focusableSelector))
                .filter((el) => el.offsetParent !== null && !el.hasAttribute('inert'));
            if (!focusables.length) return;
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault(); last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault(); first.focus();
            }
        };

        const open = () => {
            if (isOpen) return;
            isOpen = true;
            lastFocused = document.activeElement;
            resetForm();
            modal.hidden = false;
            setBackgroundInert(true);
            lockScroll();
            if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
            requestAnimationFrame(() => {
                const first = modal.querySelector(focusableSelector);
                first && first.focus({ preventScroll: true });
            });
        };

        const close = () => {
            if (!isOpen) return;
            isOpen = false;
            modal.hidden = true;
            setBackgroundInert(false);
            unlockScroll();
            if (lastFocused && typeof lastFocused.focus === 'function') {
                lastFocused.focus({ preventScroll: true });
            }
        };

        document.querySelectorAll('[data-open-brief]').forEach((btn) => {
            btn.addEventListener('click', (e) => { e.preventDefault(); open(); });
        });
        modal.querySelectorAll('[data-close]').forEach((el) => {
            el.addEventListener('click', (e) => { e.preventDefault(); close(); });
        });
        document.addEventListener('keydown', onKeydown);
    })();

    // --- Brief form --------------------------------------------------------
    (() => {
        const form = document.getElementById('brief-form');
        if (!form) return;

        const toggleBtns = form.querySelectorAll('.brief-toggle-btn');
        const branches = form.querySelectorAll('.brief-branch');
        const modeInput = document.getElementById('brief-mode-input');

        // Switching modes disables the inactive branch's fields so their
        // `required` attributes don't block submission.
        const setMode = (mode) => {
            toggleBtns.forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
            branches.forEach((br) => {
                const isActive = br.dataset.branch === mode;
                br.hidden = !isActive;
                br.querySelectorAll('input, textarea, select').forEach((el) => {
                    el.disabled = !isActive;
                });
            });
            if (modeInput) modeInput.value = mode;
        };
        toggleBtns.forEach((btn) => btn.addEventListener('click', () => setMode(btn.dataset.mode)));
        setMode('new');

        const dz = document.getElementById('brief-dropzone');
        const fileInput = document.getElementById('brief-files');
        const fileList = document.getElementById('brief-file-list');
        if (dz && fileInput && fileList) {
            const formatSize = (bytes) => {
                if (bytes < 1024) return bytes + ' B';
                if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
                return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
            };
            const renderFiles = (files) => {
                fileList.innerHTML = '';
                Array.from(files).forEach((f) => {
                    const li = document.createElement('li');
                    const name = document.createElement('span');
                    name.textContent = f.name;
                    const size = document.createElement('span');
                    size.className = 'brief-file-size';
                    size.textContent = formatSize(f.size);
                    li.appendChild(name);
                    li.appendChild(size);
                    fileList.appendChild(li);
                });
            };
            fileInput.addEventListener('change', () => renderFiles(fileInput.files));

            ['dragenter', 'dragover'].forEach((ev) => {
                dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('is-dragover'); });
            });
            ['dragleave', 'drop'].forEach((ev) => {
                dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('is-dragover'); });
            });
            dz.addEventListener('drop', (e) => {
                if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
                try {
                    const dt = new DataTransfer();
                    Array.from(e.dataTransfer.files).forEach((f) => dt.items.add(f));
                    fileInput.files = dt.files;
                } catch (_) { /* older browsers: visual list only */ }
                renderFiles(e.dataTransfer.files);
            });
        }

        const thanks = document.getElementById('brief-thanks');
        const errorEl = document.getElementById('brief-error');
        const submitBtn = document.getElementById('brief-submit');

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (errorEl) { errorEl.hidden = true; errorEl.textContent = ''; }
            if (!form.checkValidity()) {
                form.reportValidity();
                return;
            }

            const originalLabel = submitBtn ? submitBtn.innerHTML : null;
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = 'Sending…';
            }

            try {
                const data = new FormData(form);
                const res = await fetch('/api/brief', {
                    method: 'POST',
                    body: data,
                    headers: { Accept: 'application/json' },
                });
                const json = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
                if (thanks) {
                    form.hidden = true;
                    thanks.hidden = false;
                    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
                    thanks.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            } catch (err) {
                if (errorEl) {
                    errorEl.textContent = `Couldn't send — ${err.message}. Email hello@zeffron.ai instead.`;
                    errorEl.hidden = false;
                }
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalLabel;
                    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
                }
            }
        });
    })();
});
