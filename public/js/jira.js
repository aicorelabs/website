// NeuroChecklists kanban — fetches tasks from /api/jira/tasks and persists
// status changes via PATCH. Optimistic UI on drop: the card moves immediately,
// and if the PATCH fails the card snaps back and the column flashes red.

(() => {
    const API = '/api/jira/tasks';
    const COLUMNS = ['todo', 'progress', 'review', 'done'];

    let tasks = [];

    // ---------- Status pill ------------------------------------------------
    const statusEl = document.getElementById('board-status');
    const statusLabel = statusEl?.querySelector('.board-status-label');
    const setStatus = (state, label) => {
        if (!statusEl) return;
        statusEl.classList.remove('is-online', 'is-offline', 'is-error');
        if (state) statusEl.classList.add(`is-${state}`);
        if (statusLabel && label) statusLabel.textContent = label;
    };

    // ---------- Rendering --------------------------------------------------
    const tagClass = (tag) => {
        switch ((tag || '').toLowerCase()) {
            case 'analytics': return 'tag-analytics';
            case 'strategy':  return 'tag-strategy';
            case 'seo':       return 'tag-seo';
            case 'content':   return 'tag-content';
            case 'ai':        return 'tag-ai';
            default:          return 'tag-dev';
        }
    };

    const renderCard = (task) => {
        const card = document.createElement('div');
        card.className = 'task-card';
        card.draggable = true;
        card.id = task.id;
        card.innerHTML = `
            <span class="task-tag ${tagClass(task.tag)}">${escape(task.tag)}</span>
            <div class="task-title">${escape(task.title)}</div>
            <div class="task-meta">
                <span class="task-id">${escape(task.id)}</span>
                <span class="task-duration">${escape(task.duration || '--')}</span>
            </div>
        `;
        card.addEventListener('click', () => openModal(task.id));
        card.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', task.id);
            card.classList.add('dragging');
        });
        card.addEventListener('dragend', () => card.classList.remove('dragging'));
        return card;
    };

    const escape = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

    const renderBoard = () => {
        const counts = { todo: 0, progress: 0, review: 0, done: 0 };
        for (const status of COLUMNS) {
            document.getElementById(`${status}-list`).innerHTML = '';
        }
        for (const task of tasks) {
            const list = document.getElementById(`${task.status}-list`);
            if (!list) continue;
            list.appendChild(renderCard(task));
            counts[task.status]++;
        }
        for (const status of COLUMNS) {
            const el = document.getElementById(`count-${status}`);
            if (el) el.textContent = counts[status];
        }
    };

    // ---------- Modal ------------------------------------------------------
    const openModal = (taskId) => {
        const task = tasks.find((t) => t.id === taskId);
        if (!task) return;
        document.getElementById('modal-title').textContent = task.title;
        document.getElementById('modal-status').textContent = task.status.replace('-', ' ').toUpperCase();
        document.getElementById('modal-duration').textContent = task.duration || '--';
        document.getElementById('modal-tag').textContent = task.tag;
        document.getElementById('modal-description').innerHTML = task.description || 'No description available.';
        document.getElementById('task-modal').classList.add('active');
    };
    const closeModal = () => document.getElementById('task-modal').classList.remove('active');
    document.getElementById('modal-close')?.addEventListener('click', closeModal);
    document.getElementById('task-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'task-modal') closeModal();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

    // ---------- Drag & drop wiring ----------------------------------------
    document.querySelectorAll('.task-list').forEach((list) => {
        list.addEventListener('dragover', (e) => {
            e.preventDefault();
            list.classList.add('drag-over');
        });
        list.addEventListener('dragleave', () => list.classList.remove('drag-over'));
        list.addEventListener('drop', async (e) => {
            e.preventDefault();
            list.classList.remove('drag-over');
            const taskId = e.dataTransfer.getData('text/plain');
            const newStatus = list.dataset.status;
            const task = tasks.find((t) => t.id === taskId);
            if (!task || task.status === newStatus) return;

            const oldStatus = task.status;
            task.status = newStatus;

            renderBoard();
            const card = document.getElementById(taskId);
            card?.classList.add('saving');

            try {
                const res = await fetch(`${API}/${encodeURIComponent(taskId)}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                    body: JSON.stringify({ status: newStatus }),
                });
                if (!res.ok) {
                    const j = await res.json().catch(() => ({}));
                    throw new Error(j.error || `Save failed (${res.status})`);
                }
                card?.classList.remove('saving');
            } catch (err) {
                console.error('[jira] save failed, reverting:', err.message);
                task.status = oldStatus;
                renderBoard();
                const reverted = document.getElementById(taskId);
                reverted?.classList.add('error');
                setStatus('error', 'Save failed — try again');
                setTimeout(() => {
                    reverted?.classList.remove('error');
                    setStatus('online', 'Live');
                }, 2000);
            }
        });
    });

    // ---------- Initial load ----------------------------------------------
    const load = async () => {
        setStatus('offline', 'Connecting…');
        try {
            const res = await fetch(API, { headers: { Accept: 'application/json' } });
            if (!res.ok) {
                const j = await res.json().catch(() => ({}));
                throw new Error(j.error || `Fetch failed (${res.status})`);
            }
            const { tasks: list } = await res.json();
            tasks = list || [];
            renderBoard();
            setStatus('online', 'Live');
        } catch (err) {
            console.error('[jira] load failed:', err.message);
            setStatus('error', err.message);
            const container = document.querySelector('.board-container');
            if (container) {
                container.innerHTML = `<div class="board-empty">Could not load board: ${escape(err.message)}</div>`;
            }
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', load);
    } else {
        load();
    }
})();
