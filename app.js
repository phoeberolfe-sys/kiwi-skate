/* =========================================================
   KiwiSkate — App Logic
   ========================================================= */

(function () {
  'use strict';

  // ============================================================
  // SUPABASE — Sync layer
  // ============================================================
  const SUPABASE_URL = 'https://xexjtcsdoipligkwigwt.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_osMoyj4jCA99IFs_eqewyg_eq7Aains';
  const sb = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

  // Write to Supabase in the background (fire-and-forget)
  function syncToCloud(key, value) {
    if (!sb) return;
    sb.from('app_data').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
      .then(({ error }) => { if (error) console.warn('Sync write failed:', key, error.message); });
  }

  // Pull all data from Supabase and overwrite localStorage, then refresh UI
  async function syncFromCloud() {
    if (!sb) return;
    try {
      const { data, error } = await sb.from('app_data').select('key, value');
      if (error) { console.warn('Sync read failed:', error.message); return; }
      if (!data || data.length === 0) {
        // First time: push current localStorage up to Supabase
        await pushAllToCloud();
        return;
      }
      let changed = false;
      data.forEach(row => {
        const current = localStorage.getItem(row.key);
        const remote = JSON.stringify(row.value);
        if (current !== remote) {
          localStorage.setItem(row.key, remote);
          changed = true;
        }
      });
      if (changed) {
        // Re-render everything with the synced data
        renderDashboard();
        renderWorkouts();
        initSkills();
      }
    } catch (e) { console.warn('Sync error:', e); }
  }

  // Push all current localStorage data to Supabase (first-time setup)
  async function pushAllToCloud() {
    if (!sb) return;
    const keys = [
      'kiwiskate-workouts-v2', 'kiwiskate-skills-v1',
      'kiwiskate-collapse-v1', 'kiwiskate-last-edit-v1', 'kiwiskate-notes-v1'
    ];
    for (const key of keys) {
      const raw = localStorage.getItem(key);
      if (raw) {
        try {
          const value = JSON.parse(raw);
          await sb.from('app_data').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
        } catch (e) { /* skip invalid JSON */ }
      }
    }
  }

  // ============================================================
  // TAB NAVIGATION
  // ============================================================
  const navItems  = document.querySelectorAll('.nav-item');
  const screens   = document.querySelectorAll('.screen');
  const screenMap = {
    dashboard: 'screen-dashboard',
    skills:    'screen-skills',
    workouts:  'screen-workouts',
  };

  function switchTab(target) {
    screens.forEach(s => s.classList.remove('active'));
    const next = document.getElementById(screenMap[target]);
    if (next) next.classList.add('active');
    navItems.forEach(item => item.classList.toggle('active', item.dataset.target === target));
  }

  navItems.forEach(item => item.addEventListener('click', () => switchTab(item.dataset.target)));

  // ============================================================
  // CHIP FILTERS — visual toggle only
  // ============================================================
  document.querySelectorAll('.chip-scroll').forEach(row => {
    row.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', () => {
        row.querySelectorAll('.chip').forEach(c => c.classList.remove('chip-active'));
        chip.classList.add('chip-active');
      });
    });
  });

  // ============================================================
  // WORKOUTS — Data & Storage
  // ============================================================

  const WORKOUTS_KEY = 'kiwiskate-workouts-v2';

  function loadWorkouts() {
    try { return JSON.parse(localStorage.getItem(WORKOUTS_KEY)) || []; } catch { return []; }
  }
  function saveWorkouts(w) { localStorage.setItem(WORKOUTS_KEY, JSON.stringify(w)); syncToCloud(WORKOUTS_KEY, w); }

  function totalWorkoutMins(items) {
    return items.reduce((s, i) => s + (i.minutes || 0), 0);
  }

  // ============================================================
  // WORKOUTS — List rendering
  // ============================================================
  function renderWorkouts() {
    const el = document.getElementById('workouts-list');
    if (!el) return;
    const saved = loadWorkouts();
    if (saved.length === 0) {
      el.innerHTML = `
        <div class="workouts-empty">
          <div class="workouts-empty-illustration">
            <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
              <circle cx="40" cy="40" r="36" fill="var(--accent-soft)"/>
              <text x="40" y="48" text-anchor="middle" font-size="36">⛸</text>
            </svg>
          </div>
          <div class="workouts-empty-text">No workouts yet</div>
          <div class="workouts-empty-sub">Build a practice session to track your time on each skill</div>
          <button class="workouts-empty-cta" id="empty-new-workout" type="button">+ Create Workout</button>
        </div>`;
      document.getElementById('empty-new-workout')?.addEventListener('click', () => openBuilder());
      return;
    }

    // Summary stats
    const totalSessions = saved.length;
    const totalMins = saved.reduce((s, w) => s + totalWorkoutMins(w.items), 0);
    const avgMins = Math.round(totalMins / totalSessions);
    let html = `
      <div class="workouts-stats">
        <div class="wstat"><span class="wstat-val">${totalSessions}</span><span class="wstat-lbl">Workouts</span></div>
        <div class="wstat"><span class="wstat-val">${totalMins}</span><span class="wstat-lbl">Total Min</span></div>
        <div class="wstat"><span class="wstat-val">${avgMins}</span><span class="wstat-lbl">Avg Min</span></div>
      </div>`;

    // Group by date
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const thisWeek = [];
    const earlier = [];
    saved.forEach(entry => {
      const d = new Date(entry.date);
      if (d >= startOfWeek) thisWeek.push(entry);
      else earlier.push(entry);
    });

    function buildTile(entry) {
      const dateStr = new Date(entry.date).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' });
      const totalMin = totalWorkoutMins(entry.items);
      const skillCount = entry.items.length;
      return `
        <div class="saved-workout-tile" data-workout-id="${entry.id}">
          <div class="swt-left">
            <div class="swt-name">${entry.name}</div>
            <div class="swt-meta">${skillCount} skill${skillCount !== 1 ? 's' : ''} · ${dateStr}</div>
          </div>
          <div class="swt-right">
            <span class="swt-dur-pill">${totalMin} min</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="swt-chevron"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
        </div>`;
    }

    if (thisWeek.length > 0) {
      html += `<div class="section-label">This Week</div>`;
      html += thisWeek.map(buildTile).join('');
    }
    if (earlier.length > 0) {
      html += `<div class="section-label">Earlier</div>`;
      html += earlier.map(buildTile).join('');
    }

    el.innerHTML = html;
  }

  // ============================================================
  // WORKOUTS — Detail view (read-only, with Edit / Delete)
  // ============================================================
  function initWorkoutDetail() {
    const overlay = document.createElement('div');
    overlay.className = 'workout-detail-overlay';
    overlay.id = 'workout-detail-overlay';
    overlay.innerHTML = `
      <div class="wdo-header">
        <button class="wdo-close" id="wdo-close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div class="wdo-title" id="wdo-title"></div>
        <div class="wdo-actions">
          <button class="wdo-edit-btn" id="wdo-edit">Edit</button>
          <button class="wdo-delete-btn" id="wdo-delete">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>
      <div class="wdo-scroll" id="wdo-scroll"></div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#wdo-close').addEventListener('click', () => overlay.classList.remove('open'));
  }

  let currentDetailId = null;

  function showWorkoutDetail(entry) {
    currentDetailId = entry.id;
    const overlay = document.getElementById('workout-detail-overlay');
    const titleEl = document.getElementById('wdo-title');
    const scrollEl = document.getElementById('wdo-scroll');
    if (!overlay || !titleEl || !scrollEl) return;
    titleEl.textContent = entry.name;
    const dateStr = new Date(entry.date).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' });
    const totalMin = totalWorkoutMins(entry.items);
    const itemsHTML = entry.items.map((item, i) => {
      const badge = ALL_BADGES.find(b => b.id === item.badgeId);
      const badgeName = badge ? badge.name : '';
      return `
        <div class="wdo-item">
          <div class="wdo-item-num">${i + 1}</div>
          <div class="wdo-item-info">
            <div class="wdo-item-name">${item.skillName}</div>
            <div class="wdo-item-badge">${badgeName}</div>
          </div>
          <div class="wdo-item-dur">${item.minutes} min</div>
        </div>`;
    }).join('');
    scrollEl.innerHTML = `
      <div class="wdo-meta">${entry.items.length} skill${entry.items.length !== 1 ? 's' : ''} · ${totalMin} min · ${dateStr}</div>
      <div class="wdo-items">${itemsHTML}</div>`;
    scrollEl.scrollTop = 0;
    overlay.classList.add('open');
  }

  // ============================================================
  // WORKOUTS — Builder overlay (create & edit)
  // ============================================================
  let builderItems = []; // [{ badgeId, skillIdx, skillName, minutes }]
  let editingWorkoutId = null;

  function initWorkoutBuilder() {
    const overlay = document.createElement('div');
    overlay.className = 'workout-builder-overlay';
    overlay.id = 'workout-builder-overlay';
    overlay.innerHTML = `
      <div class="wb-header">
        <button class="wb-cancel" id="wb-cancel">Cancel</button>
        <div class="wb-header-title" id="wb-header-title">New Workout</div>
        <button class="wb-save" id="wb-save">Save</button>
      </div>
      <div class="wb-scroll" id="wb-scroll">
        <div class="wb-name-section">
          <input type="text" class="wb-name-input" id="wb-name-input" placeholder="Workout name" maxlength="60"/>
        </div>
        <div class="wb-section-label">Skills in this workout</div>
        <div class="wb-items" id="wb-items"></div>
        <button class="wb-add-btn" id="wb-add-skill" type="button">+ Add Skill</button>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#wb-cancel').addEventListener('click', closeBuilder);
    overlay.querySelector('#wb-save').addEventListener('click', saveFromBuilder);
    overlay.querySelector('#wb-add-skill').addEventListener('click', openSkillPicker);
  }

  function openBuilder(workoutEntry) {
    editingWorkoutId = workoutEntry ? workoutEntry.id : null;
    const overlay = document.getElementById('workout-builder-overlay');
    const nameInput = document.getElementById('wb-name-input');
    const titleEl = document.getElementById('wb-header-title');
    if (workoutEntry) {
      titleEl.textContent = 'Edit Workout';
      nameInput.value = workoutEntry.name;
      builderItems = workoutEntry.items.map(i => ({ ...i }));
    } else {
      titleEl.textContent = 'New Workout';
      nameInput.value = '';
      builderItems = [];
    }
    renderBuilderItems();
    overlay.classList.add('open');
    if (!workoutEntry) setTimeout(() => nameInput.focus(), 100);
  }

  function closeBuilder() {
    document.getElementById('workout-builder-overlay').classList.remove('open');
    editingWorkoutId = null;
    builderItems = [];
  }

  function renderBuilderItems() {
    const el = document.getElementById('wb-items');
    if (!el) return;
    if (builderItems.length === 0) {
      el.innerHTML = '<div class="wb-empty">No skills added yet. Tap + Add Skill below.</div>';
      return;
    }
    const totalMin = totalWorkoutMins(builderItems);
    el.innerHTML = builderItems.map((item, i) => {
      const badge = ALL_BADGES.find(b => b.id === item.badgeId);
      const badgeName = badge ? badge.name : '';
      return `
        <div class="wb-item" data-idx="${i}">
          <div class="wb-item-drag">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>
          </div>
          <div class="wb-item-info">
            <div class="wb-item-name">${item.skillName}</div>
            <div class="wb-item-badge">${badgeName}</div>
          </div>
          <div class="wb-item-time">
            <button class="wb-time-adj" data-idx="${i}" data-delta="-1" type="button">-</button>
            <span class="wb-time-val">${item.minutes}</span>
            <button class="wb-time-adj" data-idx="${i}" data-delta="1" type="button">+</button>
            <span class="wb-time-unit">min</span>
          </div>
          <button class="wb-item-remove" data-idx="${i}" type="button">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>`;
    }).join('') + `<div class="wb-total">Total: ${totalMin} min</div>`;

    // Delegated events for time adjust and remove
    el.onclick = e => {
      const adjBtn = e.target.closest('.wb-time-adj');
      if (adjBtn) {
        const idx = +adjBtn.dataset.idx;
        const delta = +adjBtn.dataset.delta;
        builderItems[idx].minutes = Math.max(1, builderItems[idx].minutes + delta);
        renderBuilderItems();
        return;
      }
      const removeBtn = e.target.closest('.wb-item-remove');
      if (removeBtn) {
        builderItems.splice(+removeBtn.dataset.idx, 1);
        renderBuilderItems();
      }
    };
  }

  function saveFromBuilder() {
    const nameInput = document.getElementById('wb-name-input');
    const name = nameInput.value.trim() || 'Untitled Workout';
    if (builderItems.length === 0) return;

    const saved = loadWorkouts();
    if (editingWorkoutId) {
      const idx = saved.findIndex(w => w.id === editingWorkoutId);
      if (idx !== -1) {
        saved[idx].name = name;
        saved[idx].items = builderItems.map(i => ({ ...i }));
        saved[idx].date = new Date().toISOString();
      }
    } else {
      saved.unshift({
        id: Date.now(),
        name,
        date: new Date().toISOString(),
        items: builderItems.map(i => ({ ...i })),
      });
    }
    saveWorkouts(saved);
    closeBuilder();
    renderWorkouts();
    renderDashboard();
    // If we were in detail view, close it too
    document.getElementById('workout-detail-overlay').classList.remove('open');
  }

  // ============================================================
  // WORKOUTS — Skill Picker overlay
  // ============================================================
  function initSkillPicker() {
    const overlay = document.createElement('div');
    overlay.className = 'skill-picker-overlay';
    overlay.id = 'skill-picker-overlay';
    overlay.innerHTML = `
      <div class="sp-header">
        <button class="sp-close" id="sp-close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div class="sp-title">Add Skill</div>
      </div>
      <div class="sp-search-wrap">
        <input type="text" class="sp-search" id="sp-search" placeholder="Search skills..." autocomplete="off"/>
      </div>
      <div class="sp-scroll" id="sp-scroll"></div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#sp-close').addEventListener('click', closeSkillPicker);
    const searchInput = overlay.querySelector('#sp-search');
    searchInput.addEventListener('input', () => renderSkillPickerList(searchInput.value));
  }

  function openSkillPicker() {
    const overlay = document.getElementById('skill-picker-overlay');
    const searchInput = document.getElementById('sp-search');
    searchInput.value = '';
    renderSkillPickerList('');
    overlay.classList.add('open');
    setTimeout(() => searchInput.focus(), 100);
  }

  function closeSkillPicker() {
    document.getElementById('skill-picker-overlay').classList.remove('open');
  }

  function renderSkillPickerList(query) {
    const el = document.getElementById('sp-scroll');
    if (!el) return;
    const q = query.toLowerCase().trim();
    let html = '';

    SKILL_GROUPS.forEach(group => {
      let groupHasMatch = false;
      let groupHTML = '';

      group.badges.forEach(badge => {
        let badgeSkills = '';
        badge.skills.forEach((skill, idx) => {
          if (q && !skill.toLowerCase().includes(q) && !badge.name.toLowerCase().includes(q)) return;
          // Check if already in workout
          const alreadyAdded = builderItems.some(item => item.badgeId === badge.id && item.skillIdx === idx);
          badgeSkills += `
            <button class="sp-skill${alreadyAdded ? ' sp-skill-added' : ''}" data-badge="${badge.id}" data-idx="${idx}" data-name="${skill.replace(/"/g, '&quot;')}" type="button"${alreadyAdded ? ' disabled' : ''}>
              <span class="sp-skill-name">${skill}</span>
              ${alreadyAdded ? '<span class="sp-skill-check">Added</span>' : '<span class="sp-skill-add">+</span>'}
            </button>`;
        });
        if (badgeSkills) {
          groupHTML += `
            <div class="sp-badge-group">
              <div class="sp-badge-label">${badge.name}</div>
              ${badgeSkills}
            </div>`;
          groupHasMatch = true;
        }
      });

      if (groupHasMatch) {
        html += `<div class="sp-group-label">${group.label}</div>${groupHTML}`;
      }
    });

    if (!html) {
      html = '<div class="sp-no-results">No matching skills found</div>';
    }
    el.innerHTML = html;

    // Delegated click
    el.onclick = e => {
      const btn = e.target.closest('.sp-skill:not(.sp-skill-added)');
      if (!btn) return;
      const badgeId = btn.dataset.badge;
      const idx = +btn.dataset.idx;
      const skillName = btn.dataset.name;
      builderItems.push({ badgeId, skillIdx: idx, skillName, minutes: 5 });
      renderBuilderItems();
      // Mark as added
      btn.classList.add('sp-skill-added');
      btn.disabled = true;
      btn.querySelector('.sp-skill-add').textContent = 'Added';
      btn.querySelector('.sp-skill-add').className = 'sp-skill-check';
    };
  }

  // ============================================================
  // WORKOUTS — Init
  // ============================================================
  function initWorkouts() {
    initWorkoutDetail();
    initWorkoutBuilder();
    initSkillPicker();
    renderWorkouts();

    // List click — open detail
    const el = document.getElementById('workouts-list');
    if (el) {
      el.addEventListener('click', e => {
        const tile = e.target.closest('.saved-workout-tile');
        if (!tile) return;
        const id = +tile.dataset.workoutId;
        const saved = loadWorkouts();
        const entry = saved.find(w => w.id === id);
        if (entry) showWorkoutDetail(entry);
      });
    }

    // New workout button
    const newBtn = document.getElementById('btn-new-workout');
    if (newBtn) newBtn.addEventListener('click', () => openBuilder(null));

    // Edit button in detail
    document.getElementById('wdo-edit').addEventListener('click', () => {
      const saved = loadWorkouts();
      const entry = saved.find(w => w.id === currentDetailId);
      if (entry) openBuilder(entry);
    });

    // Delete button in detail
    document.getElementById('wdo-delete').addEventListener('click', () => {
      if (!confirm('Delete this workout?')) return;
      const saved = loadWorkouts().filter(w => w.id !== currentDetailId);
      saveWorkouts(saved);
      document.getElementById('workout-detail-overlay').classList.remove('open');
      renderWorkouts();
      renderDashboard();
    });
  }

  // ============================================================
  // SKILLS — DATA (KiwiSkate NZ 2019 Rules & Regulations)
  // ============================================================
  const SKILL_GROUPS = [
    {
      label: 'General Badges',
      badges: [
        {
          id: 'beginner', name: 'Beginner Badge', icon: '🌱',
          skills: [
            'Rhythm skating: one count per glide',
            'Forward two foot glide on a curve',
            'Forward skating and glide in sit position (2 feet)',
            'Snow plough stops',
            'Backward marching',
            'Forward double sculling',
          ],
        },
        {
          id: 'elementary', name: 'Elementary Badge', icon: '🌿',
          skills: [
            '"T" pushes',
            'Forward double sculling to backward double sculling',
            "Backward skating, using alternating 'C' sculling",
            'Forward one foot glides on a curve',
            'Half snow plough stops (both feet)',
            'Forward pumping around circle',
          ],
        },
        {
          id: 'basic', name: 'Basic Badge', icon: '🔵',
          skills: [
            'Two-foot turns on curve (forward to backward)',
            'Forward crossovers on a circle',
            'Backwards half snow plough (both feet)',
            'Backward skating using alternating "C" pushes',
            'Forward inside edges',
          ],
        },
        {
          id: 'novice1', name: 'Novice 1 Badge', icon: '⭐',
          skills: [
            'Backward pumping on a circle (outside and inside)',
            'Forward outside edges',
            'Forward outside three turns',
            'Back inside Mohawks',
            'Backward one-foot glides around a circle',
            'BO to FO Mohawks',
          ],
        },
        {
          id: 'novice2', name: 'Novice 2 Badge', icon: '🌟',
          skills: [
            'Forward inside Mohawk',
            'Forward spiral on a curve',
            'Forward inside three turns',
            'Backward crossovers',
            'Forward two foot parallel side stop (left and right)',
            'Back outside edges',
          ],
        },
        {
          id: 'advanced', name: 'Advanced Badge', icon: '🏆',
          skills: [
            'Backward spirals on a curve',
            'Backward inside edges',
            'Backward outside three turns',
            'Backward inside three turns',
            '"T" stops',
          ],
        },
      ],
    },
    {
      label: 'Figure Badges',
      badges: [
        {
          id: 'figure1', name: 'Figure 1 Badge', icon: '🎯',
          skills: [
            'Forward outside edges',
            'Forward inside edges',
            'Backward outside edges',
            'Backward inside edges',
            'LBO – LFI three turn',
            'RBO – RFI three turn',
          ],
        },
        {
          id: 'figure2', name: 'Figure 2 Badge', icon: '🎨',
          skills: [
            'LBI – LFO three turn',
            'RBI – RFO three turn',
            'Forward outside eight',
            'Forward inside eight',
          ],
        },
        {
          id: 'figure3', name: 'Figure 3 Badge', icon: '🔮',
          skills: ['Waltz eight'],
        },
        {
          id: 'figure4', name: 'Figure 4 Badge', icon: '💎',
          skills: [
            'FO – FI Change curve',
            'FI – FO Change curve',
            'Backward outside eight',
          ],
        },
      ],
    },
    {
      label: 'Free Skating Badges',
      badges: [
        {
          id: 'fs1', name: 'Free Skating 1 Badge', icon: '🐰',
          skills: [
            'Forward bunny hop',
            'Waltz jump',
            'Toe loop jump',
            'Backward pivot',
            'Back spin from a pivot entrance',
            'Spiral sequence (min. two different spirals)',
            'One foot spin (3 revolutions with correct entry)',
            'Width of rink step sequence (min. two different turns and three different steps)',
          ],
        },
        {
          id: 'fs2', name: 'Free Skating 2 Badge', icon: '🦋',
          skills: [
            'Half flip jump',
            'Salchow jump',
            'Loop jump',
            '1-foot spin (3 revolutions, correct entry)',
            'Inside Ina Bauer or forward inside spread eagle',
            'Jump combination: waltz jump / toe loop jump',
            'Width of rink step sequence (min. three different turns and four different steps)',
          ],
        },
        {
          id: 'fs3', name: 'Free Skating 3 Badge', icon: '🚀',
          skills: [
            'Stag jump',
            'Back spin (correct entry)',
            'Camel spin or sit spin (three revolutions)',
            'Jump combination: salchow jump / loop jump',
            'Half lutz jump',
            'Flip jump',
            'Width of rink step sequence (min. four different turns and five different steps)',
          ],
        },
      ],
    },
  ];

  // Flat list for quick lookups
  const ALL_BADGES = SKILL_GROUPS.flatMap(g => g.badges);

  // Per-badge accent colours for visual variety
  const BADGE_COLORS = {
    beginner:   { bg: '#e8f5e9', fg: '#2e7d32', bar: '#4caf50' },
    elementary: { bg: '#e0f2f1', fg: '#00695c', bar: '#26a69a' },
    basic:      { bg: '#e3f2fd', fg: '#1565c0', bar: '#42a5f5' },
    novice1:    { bg: '#fff8e1', fg: '#f57f17', bar: '#ffca28' },
    novice2:    { bg: '#fff3e0', fg: '#e65100', bar: '#ffa726' },
    advanced:   { bg: '#fce4ec', fg: '#c62828', bar: '#ef5350' },
    figure1:    { bg: '#ede7f6', fg: '#4527a0', bar: '#7e57c2' },
    figure2:    { bg: '#f3e5f5', fg: '#7b1fa2', bar: '#ab47bc' },
    figure3:    { bg: '#e8eaf6', fg: '#283593', bar: '#5c6bc0' },
    figure4:    { bg: '#e0f7fa', fg: '#00838f', bar: '#26c6da' },
    fs1:        { bg: '#fff8e1', fg: '#f9a825', bar: '#ffee58' },
    fs2:        { bg: '#f1f8e9', fg: '#558b2f', bar: '#9ccc65' },
    fs3:        { bg: '#fce4ec', fg: '#ad1457', bar: '#ec407a' },
  };

  // ============================================================
  // SKILLS — STATE (localStorage)
  // ============================================================
  const SKILLS_KEY    = 'kiwiskate-skills-v1';
  const COLLAPSE_KEY  = 'kiwiskate-collapse-v1';
  const LAST_EDIT_KEY = 'kiwiskate-last-edit-v1';

  function loadSkillsState() {
    try { return JSON.parse(localStorage.getItem(SKILLS_KEY)) || {}; } catch { return {}; }
  }
  function saveSkillsState(s)  { localStorage.setItem(SKILLS_KEY, JSON.stringify(s)); syncToCloud(SKILLS_KEY, s); }
  function loadCollapseState() {
    try { return JSON.parse(localStorage.getItem(COLLAPSE_KEY)) || {}; } catch { return {}; }
  }
  function saveCollapseState(cs) { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(cs)); syncToCloud(COLLAPSE_KEY, cs); }

  function saveLastEdit(badgeId, skillIdx, stars) {
    const val = { badgeId, skillIdx, stars };
    localStorage.setItem(LAST_EDIT_KEY, JSON.stringify(val));
    syncToCloud(LAST_EDIT_KEY, val);
  }
  function loadLastEdit() {
    try { return JSON.parse(localStorage.getItem(LAST_EDIT_KEY)); } catch { return null; }
  }

  function getSkillData(state, badgeId, idx) {
    return (state[badgeId] && state[badgeId][idx]) || { stars: 0, working: false };
  }
  function ensureSkillEntry(state, badgeId, idx) {
    if (!state[badgeId]) state[badgeId] = {};
    if (!state[badgeId][idx]) state[badgeId][idx] = { stars: 0, working: false };
    return state[badgeId][idx];
  }

  // ============================================================
  // SKILLS — SHARED SVGs
  // ============================================================
  const BOOKMARK_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`;
  const STAR_SVG = `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 2.5c.38 0 .74.21.92.55l2.35 4.76 5.26.76c.4.06.73.34.86.72.13.39.03.81-.25 1.09l-3.8 3.71.9 5.23c.07.4-.1.8-.43 1.04-.33.23-.77.27-1.14.08L12 17.77l-4.67 2.46c-.37.19-.81.15-1.14-.08-.33-.24-.5-.64-.43-1.04l.9-5.23-3.8-3.71c-.28-.28-.38-.7-.25-1.09.13-.38.46-.66.86-.72l5.26-.76 2.35-4.76c.18-.34.54-.55.92-.55z"/></svg>`;
  const CHEVRON_RIGHT_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>`;

  // ============================================================
  // SKILLS — NOTES (localStorage)
  // ============================================================
  const NOTES_KEY = 'kiwiskate-notes-v1';

  function loadAllNotes() {
    try { return JSON.parse(localStorage.getItem(NOTES_KEY)) || {}; } catch { return {}; }
  }
  function saveAllNotes(n) { localStorage.setItem(NOTES_KEY, JSON.stringify(n)); syncToCloud(NOTES_KEY, n); }
  function notesKey(badgeId, idx) { return `${badgeId}:${idx}`; }
  function getSkillNotes(badgeId, idx) {
    return loadAllNotes()[notesKey(badgeId, idx)] || [];
  }
  function addSkillNote(badgeId, idx, text) {
    const all = loadAllNotes();
    const key = notesKey(badgeId, idx);
    if (!all[key]) all[key] = [];
    all[key].unshift({ id: Date.now(), text, date: new Date().toISOString() });
    saveAllNotes(all);
  }
  function deleteSkillNote(badgeId, idx, noteId) {
    const all = loadAllNotes();
    const key = notesKey(badgeId, idx);
    if (!all[key]) return;
    all[key] = all[key].filter(n => n.id !== noteId);
    if (all[key].length === 0) delete all[key];
    saveAllNotes(all);
  }

  // ============================================================
  // SKILLS — BUILD HTML
  // ============================================================
  function buildSkillRowHTML(badgeId, idx, skillName, state) {
    const { stars, working } = getSkillData(state, badgeId, idx);
    const miniStars = [1, 2, 3].map(n =>
      `<span class="sk-mini-star${stars >= n ? ' filled' : ''}">★</span>`
    ).join('');
    const allFilled = stars === 3;
    return `
      <div class="skill-row${working ? ' is-working' : ''}${allFilled ? ' is-mastered' : ''}" data-badge="${badgeId}" data-skill="${idx}">
        <div class="sk-tap-area">
          <span class="sk-name">${skillName}</span>
          <div class="sk-indicators">
            <span class="sk-mini-stars">${miniStars}</span>
            <span class="sk-bookmark${working ? ' active' : ''}">${BOOKMARK_SVG}</span>
          </div>
        </div>
      </div>`;
  }

  function countMastered(badge, state) {
    return badge.skills.filter((_, i) => getSkillData(state, badge.id, i).stars === 3).length;
  }

  function buildBadgeSectionHTML(badge, state, collapseState) {
    const mastered = countMastered(badge, state);
    const total    = badge.skills.length;
    const expanded = collapseState[badge.id] !== true;
    const allDone  = mastered === total;
    const pct      = total > 0 ? Math.round((mastered / total) * 100) : 0;
    const c        = BADGE_COLORS[badge.id] || { bg: 'var(--accent-soft)', fg: 'var(--accent)', bar: 'var(--accent)' };
    const skillsHTML = badge.skills.map((s, i) => buildSkillRowHTML(badge.id, i, s, state)).join('');
    return `
      <div class="badge-section${expanded ? ' expanded' : ''}" data-badge-id="${badge.id}" style="background:${c.bg}">
        <button class="badge-header" type="button">
          <div class="badge-header-left">
            <span class="badge-icon-wrap" style="background:rgba(255,255,255,0.6);font-size:22px">${badge.icon}</span>
            <div class="badge-meta">
              <span class="badge-name-text">${badge.name}</span>
              <div class="badge-bar-wrap"><div class="badge-bar" style="width:${pct}%;background:${c.bar}"></div></div>
              <span class="badge-progress-sub" id="bsub-${badge.id}">${mastered} of ${total} mastered</span>
            </div>
          </div>
          <div class="badge-header-right">
            <span class="badge-pill${allDone ? ' pill-done' : ''}" id="bpill-${badge.id}" style="${!allDone ? `background:${c.bg};color:${c.fg}` : ''}">${allDone ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' : `${mastered}/${total}`}</span>
            <svg class="badge-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </div>
        </button>
        <div class="badge-body">
          <div class="badge-body-inner">${skillsHTML}</div>
        </div>
      </div>`;
  }

  // ============================================================
  // SKILLS — SUMMARY CARD
  // ============================================================
  function updateSummaryCard(state) {
    let total = 0, mastered = 0, inProgress = 0;
    SKILL_GROUPS.forEach(g => g.badges.forEach(b => {
      b.skills.forEach((_, i) => {
        total++;
        const d = getSkillData(state, b.id, i);
        if (d.stars === 3) mastered++;
        else if (d.stars > 0 || d.working) inProgress++;
      });
    }));
    const pct = total > 0 ? Math.round((mastered / total) * 100) : 0;
    const el = document.getElementById('skills-summary');
    if (!el) return;
    el.innerHTML = `
      <div class="ss-top">
        <span class="ss-label">Overall Progress</span>
        <span class="ss-frac">${pct}<span class="ss-total">%</span></span>
      </div>
      <div class="progress-bar-wrap"><div class="progress-bar" style="width:${pct}%"></div></div>
      <div class="ss-sub">${mastered} of ${total} skills mastered</div>
      <div class="ss-stats">
        <div class="ss-stat ss-stat-mastered"><span class="ss-stat-icon">&#9733;</span><span class="ss-stat-val">${mastered}</span><span class="ss-stat-lbl">Mastered</span></div>
        <div class="ss-stat ss-stat-progress"><span class="ss-stat-icon">&#9998;</span><span class="ss-stat-val">${inProgress}</span><span class="ss-stat-lbl">In Progress</span></div>
        <div class="ss-stat ss-stat-new"><span class="ss-stat-icon">&#9675;</span><span class="ss-stat-val">${total - mastered - inProgress}</span><span class="ss-stat-lbl">Not Started</span></div>
      </div>`;
  }

  function updateBadgePill(badgeId, state) {
    const badge = ALL_BADGES.find(b => b.id === badgeId);
    if (!badge) return;
    const mastered = countMastered(badge, state);
    const total    = badge.skills.length;
    const allDone  = mastered === total;
    const pct      = total > 0 ? Math.round((mastered / total) * 100) : 0;
    const c        = BADGE_COLORS[badgeId] || { bg: 'var(--accent-soft)', fg: 'var(--accent)', bar: 'var(--accent)' };
    const pill = document.getElementById(`bpill-${badgeId}`);
    const sub  = document.getElementById(`bsub-${badgeId}`);
    if (pill) {
      pill.innerHTML = allDone ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' : `${mastered}/${total}`;
      pill.classList.toggle('pill-done', allDone);
      pill.style.background = allDone ? '' : c.bg;
      pill.style.color = allDone ? '' : c.fg;
    }
    if (sub)  { sub.textContent  = `${mastered} of ${total} mastered`; }
    // Update progress bar
    const section = document.querySelector(`.badge-section[data-badge-id="${badgeId}"]`);
    if (section) {
      const bar = section.querySelector('.badge-bar');
      if (bar) { bar.style.width = `${pct}%`; }
    }
  }

  // ============================================================
  // WORKING ON IT — list at top of skills page
  // ============================================================
  function renderWorkingSection(state) {
    const el = document.getElementById('working-section');
    if (!el) return;

    // Collect all working skills in badge order
    const items = [];
    SKILL_GROUPS.forEach(g => g.badges.forEach(badge => {
      badge.skills.forEach((skillName, i) => {
        if (getSkillData(state, badge.id, i).working) {
          items.push({ badge, skillName, idx: i });
        }
      });
    }));

    if (items.length === 0) {
      el.innerHTML = '';
      return;
    }

    const cs = loadCollapseState();
    const collapsed = cs['_working'] === true;

    const listHTML = items.map(({ badge, skillName, idx }) => {
      const st = loadSkillsState();
      const { stars } = getSkillData(st, badge.id, idx);
      const starHTML = [1,2,3].map(n =>
        `<span class="sr-star${stars >= n ? ' filled' : ''}">★</span>`
      ).join('');
      return `
      <div class="ws-item" data-badge="${badge.id}" data-skill="${idx}">
        <div class="ws-info">
          <span class="ws-skill-name">${skillName}</span>
          <span class="ws-badge-label">${badge.name}</span>
        </div>
        <span class="sr-stars">${starHTML}</span>
        <span class="sr-bookmark active ws-remove" data-badge="${badge.id}" data-skill="${idx}">${BOOKMARK_SVG}</span>
      </div>`;
    }).join('');

    el.innerHTML = `
      <div class="working-section">
        <button class="ws-header" id="ws-toggle-btn" type="button">
          <div class="ws-header-left">
            <span class="ws-title">Currently Working On</span>
            <span class="ws-count-pill">${items.length}</span>
          </div>
          <svg class="ws-chevron${collapsed ? ' collapsed' : ''}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="ws-list" id="ws-list" style="${collapsed ? 'max-height:0;overflow:hidden;' : ''}">${listHTML}</div>
      </div>`;
  }

  // ============================================================
  // DASHBOARD — fully dynamic, driven by localStorage data
  // ============================================================
  function renderDashboard() {
    const el = document.getElementById('dash-content');
    if (!el) return;

    const state = loadSkillsState();
    let html = '';

    // --- 1. Progress Stats ---
    let total = 0, mastered = 0, workingOn = 0, badgesComplete = 0;
    SKILL_GROUPS.forEach(g => g.badges.forEach(b => {
      let bMastered = 0;
      b.skills.forEach((_, i) => {
        total++;
        const d = getSkillData(state, b.id, i);
        if (d.stars === 3) { mastered++; bMastered++; }
        if (d.working) workingOn++;
      });
      if (bMastered === b.skills.length) badgesComplete++;
    }));
    const pct = total > 0 ? Math.round((mastered / total) * 100) : 0;

    html += `
      <div class="dash-hero">
        <span class="dash-hero-emoji">&#10052;</span>
        <div class="dash-hero-top">
          <div>
            <p class="dash-greeting">Kia ora, Phoebe</p>
            <h1 class="dash-title">Ready to skate?</h1>
          </div>
        </div>
        <div class="dash-hero-progress">
          <div class="dp-pct-ring">
            <svg viewBox="0 0 80 80" width="80" height="80">
              <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="6"/>
              <circle cx="40" cy="40" r="34" fill="none" stroke="white" stroke-width="6" stroke-linecap="round"
                stroke-dasharray="${Math.round(2 * Math.PI * 34)}" stroke-dashoffset="${Math.round(2 * Math.PI * 34 * (1 - pct / 100))}"
                transform="rotate(-90 40 40)"/>
            </svg>
            <span class="dp-pct-text">${pct}%</span>
          </div>
          <div class="dp-stats">
            <div class="dp-stat"><span class="dp-stat-val">${mastered}</span><span class="dp-stat-lbl">Mastered</span></div>
            <div class="dp-stat"><span class="dp-stat-val">${workingOn}</span><span class="dp-stat-lbl">Working On</span></div>
            <div class="dp-stat"><span class="dp-stat-val">${badgesComplete}<span class="dp-stat-sub">/${ALL_BADGES.length}</span></span><span class="dp-stat-lbl">Badges</span></div>
          </div>
        </div>
      </div>`;

    // --- 2. Next Badge ---
    let nextBadge = null, nextMastered = 0;
    outer: for (const group of SKILL_GROUPS) {
      for (const badge of group.badges) {
        const m = countMastered(badge, state);
        if (m < badge.skills.length) { nextBadge = badge; nextMastered = m; break outer; }
      }
    }
    if (nextBadge) {
      const nbPct = Math.round((nextMastered / nextBadge.skills.length) * 100);
      const nc = BADGE_COLORS[nextBadge.id] || { bg: 'var(--accent-soft)', bar: 'var(--accent)' };
      html += `
        <div class="card dash-next-badge">
          <div class="dnb-top">
            <span class="dnb-icon" style="background:${nc.bg}">${nextBadge.icon}</span>
            <div class="dnb-info">
              <span class="dnb-label">Next Badge</span>
              <span class="dnb-name">${nextBadge.name}</span>
            </div>
            <span class="dnb-frac">${nextMastered}/${nextBadge.skills.length}</span>
          </div>
          <div class="progress-bar-wrap"><div class="progress-bar" style="width:${nbPct}%;background:${nc.bar}"></div></div>
        </div>`;
    }

    // --- 3. Recent Workouts (up to 3) — shown before Working On for quick access ---
    const workouts = loadWorkouts();
    html += `<div class="section-label">Recent Workouts</div>`;
    if (workouts.length > 0) {
      const recent = workouts.slice(0, 3);
      const wHTML = recent.map(w => {
        const mins = totalWorkoutMins(w.items);
        return `
          <div class="dw-workout" data-workout-id="${w.id}">
            <div class="dw-workout-info">
              <span class="dw-workout-name">${w.name}</span>
              <span class="dw-workout-meta">${w.items.length} skill${w.items.length !== 1 ? 's' : ''} &middot; ${mins} min</span>
            </div>
            <svg class="dw-workout-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
          </div>`;
      }).join('');
      html += `<div class="card dash-workouts-card">${wHTML}</div>`;
    } else {
      html += `<div class="card dash-empty-card"><span class="dash-empty-text">No workouts yet. Tap Workouts to create one!</span></div>`;
    }

    // --- 4. Working On Skills (collapsible, after workouts) ---
    const workingItems = [];
    SKILL_GROUPS.forEach(g => g.badges.forEach(badge => {
      badge.skills.forEach((skillName, i) => {
        if (getSkillData(state, badge.id, i).working) {
          workingItems.push({ badge, skillName, idx: i });
        }
      });
    }));

    if (workingItems.length > 0) {
      const cs = loadCollapseState();
      const dwCollapsed = cs['_dash_working'] !== false; // collapsed by default
      const itemsHTML = workingItems.map(({ badge, skillName, idx }) => {
        const stars = getSkillData(state, badge.id, idx).stars;
        const dwStars = [1,2,3].map(n =>
          `<span class="dw-star${stars >= n ? ' filled' : ''}">★</span>`
        ).join('');
        return `
          <div class="dw-item" data-badge="${badge.id}" data-skill="${idx}">
            <div class="dw-item-info">
              <span class="dw-item-name">${skillName}</span>
              <span class="dw-item-badge">${badge.name}</span>
            </div>
            <span class="dw-stars">${dwStars}</span>
            <span class="sr-bookmark active">${BOOKMARK_SVG}</span>
          </div>`;
      }).join('');
      html += `
        <div class="section-label">Working On <span class="section-label-count">${workingItems.length}</span></div>
        <div class="card dash-working-card">
          <button class="dw-collapse-btn" id="dw-working-toggle" type="button">
            <span>${dwCollapsed ? 'Show all' : 'Hide'}</span>
            <svg class="dw-collapse-chevron${dwCollapsed ? '' : ' open'}" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <div class="dw-working-list" id="dw-working-list" style="${dwCollapsed ? 'max-height:0;overflow:hidden;' : ''}">${itemsHTML}</div>
        </div>`;
    }

    el.innerHTML = html;

    // --- Event delegation for dashboard ---
    el.onclick = e => {
      // Working On collapse toggle
      const toggleBtn = e.target.closest('#dw-working-toggle');
      if (toggleBtn) {
        const list = document.getElementById('dw-working-list');
        const cs = loadCollapseState();
        const isCollapsed = cs['_dash_working'] !== false;
        if (isCollapsed) {
          list.style.maxHeight = list.scrollHeight + 'px';
          list.style.overflow = '';
          toggleBtn.querySelector('span').textContent = 'Hide';
          toggleBtn.querySelector('svg').classList.add('open');
          cs['_dash_working'] = false;
        } else {
          list.style.maxHeight = list.scrollHeight + 'px';
          requestAnimationFrame(() => { list.style.maxHeight = '0'; list.style.overflow = 'hidden'; });
          toggleBtn.querySelector('span').textContent = 'Show all';
          toggleBtn.querySelector('svg').classList.remove('open');
          cs['_dash_working'] = true;
        }
        saveCollapseState(cs);
        return;
      }
      // Working On skill tap → open skill detail
      const dwItem = e.target.closest('.dw-item');
      if (dwItem) {
        showSkillDetail(dwItem.dataset.badge, +dwItem.dataset.skill);
        return;
      }
      // Workout tap → open workout detail
      const wkItem = e.target.closest('.dw-workout');
      if (wkItem) {
        const entry = loadWorkouts().find(w => w.id === +wkItem.dataset.workoutId);
        if (entry) showWorkoutDetail(entry);
        return;
      }
    };
  }

  // ============================================================
  // SKILLS — DETAIL PANEL
  // ============================================================
  function initSkillDetail() {
    const overlay = document.createElement('div');
    overlay.className = 'skill-detail-overlay';
    overlay.id = 'skill-detail-overlay';
    overlay.innerHTML = `
      <div class="sd-header">
        <button class="sd-close" id="sd-close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div class="sd-header-info">
          <div class="sd-title" id="sd-title"></div>
          <div class="sd-badge-name" id="sd-badge-name"></div>
        </div>
      </div>
      <div class="sd-scroll" id="sd-scroll"></div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#sd-close').addEventListener('click', closeSkillDetail);
  }

  function closeSkillDetail() {
    document.getElementById('skill-detail-overlay').classList.remove('open');
  }

  function showSkillDetail(badgeId, idx) {
    const badge = ALL_BADGES.find(b => b.id === badgeId);
    if (!badge || idx >= badge.skills.length) return;
    const skillName = badge.skills[idx];
    const state = loadSkillsState();
    const { stars, working } = getSkillData(state, badgeId, idx);
    const notes = getSkillNotes(badgeId, idx);

    const overlay = document.getElementById('skill-detail-overlay');
    overlay.querySelector('#sd-title').textContent = skillName;
    overlay.querySelector('#sd-badge-name').textContent = badge.name;

    const starsHTML = [1, 2, 3].map(n =>
      `<button class="sd-star-btn${stars >= n ? ' filled' : ''}" data-star="${n}" type="button">${STAR_SVG}</button>`
    ).join('');

    const searchTerm = encodeURIComponent(`how to ${skillName} figure skating`);

    const notesHTML = notes.length > 0
      ? notes.map(n => {
          const dateStr = new Date(n.date).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' });
          const escaped = n.text.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
          return `
            <div class="sd-note" data-note-id="${n.id}">
              <div class="sd-note-text">${escaped}</div>
              <div class="sd-note-footer">
                <span class="sd-note-date">${dateStr}</span>
                <button class="sd-note-delete" data-note-id="${n.id}" type="button">Delete</button>
              </div>
            </div>`;
        }).join('')
      : '<div class="sd-notes-empty">No notes yet. Add coaching tips, exercises, or reminders below.</div>';

    const scrollEl = overlay.querySelector('#sd-scroll');
    scrollEl.innerHTML = `
      <div class="sd-toolbar">
        <div class="sd-toolbar-section">
          <div class="sd-section-label">Kiwi Skate Progression</div>
          <div class="sd-stars" id="sd-stars" data-badge="${badgeId}" data-skill="${idx}">${starsHTML}</div>
        </div>
        <div class="sd-toolbar-actions">
          <button class="sd-action-btn sd-bookmark-btn${working ? ' active' : ''}" id="sd-working-toggle" data-badge="${badgeId}" data-skill="${idx}" type="button" title="${working ? 'Working on this' : 'Mark as working on it'}">
            ${BOOKMARK_SVG}
          </button>
          <a class="sd-action-btn sd-yt-btn" href="https://www.youtube.com/results?search_query=${searchTerm}" target="_blank" rel="noopener" title="Tutorial on YouTube">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31.5 31.5 0 0 0 0 12a31.5 31.5 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31.5 31.5 0 0 0 24 12a31.5 31.5 0 0 0-.5-5.8zM9.6 15.6V8.4l6.3 3.6-6.3 3.6z"/></svg>
          </a>
        </div>
      </div>
      <div class="sd-section">
        <div class="sd-section-label">Notes & Coaching Tips</div>
        <div class="sd-note-input-wrap">
          <textarea class="sd-note-input" id="sd-note-input" placeholder="Add a note (coaching tip, exercise, reminder...)" rows="3"></textarea>
          <button class="sd-note-add" id="sd-note-add" type="button">Add Note</button>
        </div>
        <div class="sd-notes-list" id="sd-notes-list" data-badge="${badgeId}" data-skill="${idx}">${notesHTML}</div>
      </div>`;

    // Scroll to top
    scrollEl.scrollTop = 0;
    overlay.classList.add('open');

    // Re-bind delegated events inside the scroll area
    scrollEl.onclick = e => {
      // Star buttons
      const starBtn = e.target.closest('.sd-star-btn');
      if (starBtn) {
        const newStar = +starBtn.dataset.star;
        const st = loadSkillsState();
        const d = ensureSkillEntry(st, badgeId, +idx);
        d.stars = d.stars === newStar ? newStar - 1 : newStar;
        saveSkillsState(st);
        saveLastEdit(badgeId, +idx, d.stars);
        scrollEl.querySelectorAll('.sd-star-btn').forEach(btn => {
          btn.classList.toggle('filled', +btn.dataset.star <= d.stars);
        });
        // Update the skill row behind the overlay
        refreshSkillRow(badgeId, idx);
        updateBadgePill(badgeId, st);
        updateSummaryCard(st);
        renderDashboard();
        return;
      }
      // Working toggle
      if (e.target.closest('#sd-working-toggle')) {
        toggleWorking(badgeId, idx);
        const st = loadSkillsState();
        const w = getSkillData(st, badgeId, idx).working;
        const btn = scrollEl.querySelector('#sd-working-toggle');
        btn.classList.toggle('active', w);
        btn.title = w ? 'Working on this' : 'Mark as working on it';
        return;
      }
      // Add note
      if (e.target.closest('#sd-note-add')) {
        const input = scrollEl.querySelector('#sd-note-input');
        const text = input.value.trim();
        if (!text) return;
        addSkillNote(badgeId, idx, text);
        input.value = '';
        refreshNotesInDetail(badgeId, idx);
        refreshSkillRow(badgeId, idx);
        return;
      }
      // Delete note
      const delBtn = e.target.closest('.sd-note-delete');
      if (delBtn) {
        deleteSkillNote(badgeId, idx, +delBtn.dataset.noteId);
        refreshNotesInDetail(badgeId, idx);
        refreshSkillRow(badgeId, idx);
        return;
      }
    };
  }

  function refreshNotesInDetail(badgeId, idx) {
    const notesList = document.getElementById('sd-notes-list');
    if (!notesList) return;
    const notes = getSkillNotes(badgeId, idx);
    if (notes.length === 0) {
      notesList.innerHTML = '<div class="sd-notes-empty">No notes yet. Add coaching tips, exercises, or reminders below.</div>';
      return;
    }
    notesList.innerHTML = notes.map(n => {
      const dateStr = new Date(n.date).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' });
      const escaped = n.text.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
      return `
        <div class="sd-note" data-note-id="${n.id}">
          <div class="sd-note-text">${escaped}</div>
          <div class="sd-note-footer">
            <span class="sd-note-date">${dateStr}</span>
            <button class="sd-note-delete" data-note-id="${n.id}" type="button">Delete</button>
          </div>
        </div>`;
    }).join('');
  }

  function refreshSkillRow(badgeId, idx) {
    const row = document.querySelector(`.skill-row[data-badge="${badgeId}"][data-skill="${idx}"]`);
    if (!row) return;
    const badge = ALL_BADGES.find(b => b.id === badgeId);
    if (!badge) return;
    const state = loadSkillsState();
    const { stars, working } = getSkillData(state, badgeId, idx);
    const notes = getSkillNotes(badgeId, idx);
    row.classList.toggle('is-working', working);
    row.classList.toggle('is-mastered', stars === 3);
    // Update mini stars
    const miniStars = row.querySelectorAll('.sk-mini-star');
    miniStars.forEach((el, i) => el.classList.toggle('filled', stars >= i + 1));
    // Update bookmark
    const bookmark = row.querySelector('.sk-bookmark');
    if (bookmark) bookmark.classList.toggle('active', working);
  }

  // ============================================================
  // SKILLS — SHARED TOGGLE LOGIC
  // ============================================================
  function toggleWorking(badgeId, idx) {
    const state = loadSkillsState();
    const d = ensureSkillEntry(state, badgeId, +idx);
    d.working = !d.working;
    saveSkillsState(state);

    // Update skill row in the badge list (if visible)
    const row = document.querySelector(`.skill-row[data-badge="${badgeId}"][data-skill="${idx}"]`);
    if (row) {
      row.classList.toggle('is-working', d.working);
      const bk = row.querySelector('.sk-bookmark');
      if (bk) bk.classList.toggle('active', d.working);
    }

    renderWorkingSection(state);
    updateSummaryCard(state);
    renderDashboard();
  }

  // ============================================================
  // SKILLS — COLLAPSE / EXPAND ANIMATION
  // ============================================================
  function expandSection(section) {
    const body = section.querySelector('.badge-body');
    section.classList.add('expanded');
    body.style.maxHeight = body.scrollHeight + 'px';
    body.addEventListener('transitionend', () => {
      if (section.classList.contains('expanded')) body.style.maxHeight = 'none';
    }, { once: true });
  }

  function collapseSection(section) {
    const body = section.querySelector('.badge-body');
    body.style.maxHeight = body.scrollHeight + 'px';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      body.style.maxHeight = '0';
      section.classList.remove('expanded');
    }));
  }

  // ============================================================
  // SKILLS — INIT & EVENTS
  // ============================================================
  function initSkills() {
    const state    = loadSkillsState();
    const collapse = loadCollapseState();
    const list     = document.getElementById('skills-list');
    if (!list) return;

    let html = '';
    SKILL_GROUPS.forEach(group => {
      html += `<div class="section-label">${group.label}</div>`;
      group.badges.forEach(badge => { html += buildBadgeSectionHTML(badge, state, collapse); });
    });
    list.innerHTML = html;

    updateSummaryCard(state);
    renderWorkingSection(state);
    renderDashboard();

    // Initialise expanded heights without animation
    list.querySelectorAll('.badge-section.expanded .badge-body').forEach(body => {
      body.style.transition = 'none';
      body.style.maxHeight  = 'none';
    });
    requestAnimationFrame(() => {
      list.querySelectorAll('.badge-body').forEach(body => { body.style.transition = ''; });
    });

    // ---- Delegated listener: badge list ----
    list.addEventListener('click', e => {
      // Skill row tap — open detail panel
      const row = e.target.closest('.skill-row');
      if (row) {
        showSkillDetail(row.dataset.badge, +row.dataset.skill);
        return;
      }

      // Badge header collapse/expand
      const hdr = e.target.closest('.badge-header');
      if (hdr) {
        const section  = hdr.closest('.badge-section');
        const badgeId  = section.dataset.badgeId;
        const isExpanded = section.classList.contains('expanded');
        isExpanded ? collapseSection(section) : expandSection(section);
        const cs = loadCollapseState();
        cs[badgeId] = isExpanded;
        saveCollapseState(cs);
      }
    });

    // ---- Delegated listener: working section (collapse toggle + remove buttons) ----
    const wsEl = document.getElementById('working-section');
    if (wsEl) {
      wsEl.addEventListener('click', e => {
        const btn = e.target.closest('.ws-remove');
        if (btn) { toggleWorking(btn.dataset.badge, btn.dataset.skill); return; }

        const item = e.target.closest('.ws-item');
        if (item) { showSkillDetail(item.dataset.badge, +item.dataset.skill); return; }

        if (e.target.closest('#ws-toggle-btn')) {
          const cs = loadCollapseState();
          cs['_working'] = !cs['_working'];
          saveCollapseState(cs);
          const listEl  = document.getElementById('ws-list');
          const chevron = wsEl.querySelector('.ws-chevron');
          if (!listEl) return;
          if (cs['_working']) {
            listEl.style.maxHeight = listEl.scrollHeight + 'px';
            listEl.style.overflow  = 'hidden';
            listEl.style.transition = 'max-height 0.3s ease';
            requestAnimationFrame(() => requestAnimationFrame(() => { listEl.style.maxHeight = '0'; }));
            if (chevron) chevron.classList.add('collapsed');
          } else {
            listEl.style.transition = 'max-height 0.3s ease';
            listEl.style.maxHeight  = listEl.scrollHeight + 'px';
            listEl.addEventListener('transitionend', () => {
              listEl.style.maxHeight  = 'none';
              listEl.style.overflow   = '';
              listEl.style.transition = '';
            }, { once: true });
            if (chevron) chevron.classList.remove('collapsed');
          }
        }
      });
    }

    // ---- Skills search ----
    const searchInput = document.getElementById('skills-search');
    const searchResults = document.getElementById('skills-search-results');
    const workingSec = document.getElementById('working-section');
    if (searchInput && searchResults) {
      searchInput.addEventListener('input', () => {
        const q = searchInput.value.trim().toLowerCase();
        if (!q) {
          searchResults.style.display = 'none';
          searchResults.innerHTML = '';
          list.style.display = '';
          if (workingSec) workingSec.style.display = '';
          return;
        }
        list.style.display = 'none';
        if (workingSec) workingSec.style.display = 'none';
        const st = loadSkillsState();
        const matches = [];
        SKILL_GROUPS.forEach(g => g.badges.forEach(badge => {
          badge.skills.forEach((skillName, i) => {
            if (skillName.toLowerCase().includes(q)) {
              matches.push({ badge, skillName, idx: i });
            }
          });
        }));
        if (matches.length === 0) {
          searchResults.innerHTML = '<div class="search-no-results">No skills found</div>';
        } else {
          searchResults.innerHTML = matches.map(({ badge, skillName, idx }) => {
            const { stars, working } = getSkillData(st, badge.id, idx);
            const starHTML = [1,2,3].map(n =>
              `<span class="sr-star${stars >= n ? ' filled' : ''}">★</span>`
            ).join('');
            return `
              <div class="search-result-item" data-badge="${badge.id}" data-skill="${idx}">
                <div class="sr-info">
                  <span class="sr-name">${skillName}</span>
                  <span class="sr-badge">${badge.name}</span>
                </div>
                <span class="sr-stars">${starHTML}</span>
                <span class="sr-bookmark${working ? ' active' : ''}">${BOOKMARK_SVG}</span>
              </div>`;
          }).join('');
        }
        searchResults.style.display = '';
      });
      searchResults.addEventListener('click', e => {
        const item = e.target.closest('.search-result-item');
        if (item) showSkillDetail(item.dataset.badge, +item.dataset.skill);
      });
    }
  }

  initSkillDetail();
  initSkills();
  initWorkouts();

  // Pull latest data from Supabase (runs in background, updates UI if anything changed)
  syncFromCloud();

})();
