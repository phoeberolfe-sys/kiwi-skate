/* =========================================================
   KiwiSkate — App Logic
   ========================================================= */

(function () {
  'use strict';

  // ============================================================
  // TAB NAVIGATION
  // ============================================================
  const navItems  = document.querySelectorAll('.nav-item');
  const screens   = document.querySelectorAll('.screen');
  const screenMap = {
    dashboard: 'screen-dashboard',
    skills:    'screen-skills',
    bot:       'screen-bot',
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
  // KIWI BOT — Workout Generator
  // ============================================================
  const KIWI_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="110" height="110">
    <ellipse cx="62" cy="108" rx="30" ry="6" fill="rgba(0,0,0,0.07)"/>
    <ellipse cx="60" cy="74" rx="36" ry="30" fill="#8B5E3C"/>
    <circle cx="80" cy="48" r="22" fill="#8B5E3C"/>
    <circle cx="87" cy="54" r="5" fill="#c47a5a" opacity="0.5"/>
    <circle cx="86" cy="44" r="5" fill="white"/>
    <circle cx="87" cy="44" r="3" fill="#1a1826"/>
    <circle cx="89" cy="42" r="1.2" fill="white"/>
    <path d="M97 51 L120 56 L97 60 Z" fill="#E07B39"/>
    <line x1="98" y1="53" x2="116" y2="56" stroke="rgba(255,255,255,0.25)" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M33 72 Q24 60 38 54 Q42 70 33 72Z" fill="#7A5030"/>
    <g fill="none" stroke="#E07B39" stroke-width="3" stroke-linecap="round">
      <path d="M48 100 L43 110 M48 100 L50 111 M48 100 L55 108"/>
      <path d="M68 103 L63 113 M68 103 L70 114 M68 103 L76 111"/>
    </g>
    <g fill="none" stroke="#7A5030" stroke-width="1.5" opacity="0.35" stroke-linecap="round">
      <path d="M33 65 Q50 57 67 66"/>
      <path d="M30 73 Q50 64 70 74"/>
      <path d="M33 82 Q52 73 70 82"/>
    </g>
  </svg>`;

  const KB_DURATION_OPTIONS = [
    { value: 15, label: '15 min' },
    { value: 30, label: '30 min' },
    { value: 45, label: '45 min' },
    { value: 60, label: '60 min' },
    { value: 90, label: '90 min' },
  ];
  const KB_ENV_OPTIONS = [
    { value: 'on-ice',  label: '🧊 On Ice' },
    { value: 'off-ice', label: '🏃 Off Ice' },
  ];
  const KB_INTENSITY_OPTIONS = [
    { value: 'easy',    label: '😌 Easy' },
    { value: 'regular', label: '💪 Regular' },
    { value: 'intense', label: '🔥 Intense' },
  ];

  let kbSelections    = { duration: 30, environment: 'on-ice', intensity: 'regular' };
  let kbCurrentWorkout = null;

  function getWorkingSkills() {
    const state = loadSkillsState();
    const working = [];
    ALL_BADGES.forEach(badge => {
      badge.skills.forEach((skill, idx) => {
        if (getSkillData(state, badge.id, idx).working) {
          working.push({ badge: badge.name, skill });
        }
      });
    });
    return working;
  }

  function buildKbChips(options, selectedVal, key) {
    return options.map(o =>
      `<button class="kb-chip${String(o.value) === String(selectedVal) ? ' active' : ''}" data-kb-key="${key}" data-kb-val="${o.value}">${o.label}</button>`
    ).join('');
  }

  function renderKiwiSelector() {
    const el = document.getElementById('kb-container');
    if (!el) return;
    const working = getWorkingSkills();
    const workingCard = working.length > 0
      ? `<div class="kb-working-card">
           <span class="kb-working-icon">🎯</span>
           <span class="kb-working-text">I'll focus on your <strong>${working.length} working-on-it skill${working.length > 1 ? 's' : ''}</strong>: ${working.map(w => w.skill).slice(0, 3).join(', ')}${working.length > 3 ? ` +${working.length - 3} more` : ''}</span>
         </div>`
      : '';
    el.innerHTML = `
      <div class="kb-scroll">
        <div class="kb-hero">
          <div class="kb-kiwi-wrap"><span class="kb-kiwi-bob">${KIWI_SVG}</span></div>
          <div class="kb-speech">Kia ora! Let me whip up a session for you! 🏒</div>
        </div>
        ${workingCard}
        <div class="kb-section">
          <div class="kb-label">How long do you have?</div>
          <div class="kb-chips">${buildKbChips(KB_DURATION_OPTIONS, kbSelections.duration, 'duration')}</div>
        </div>
        <div class="kb-section">
          <div class="kb-label">Where are you skating?</div>
          <div class="kb-chips">${buildKbChips(KB_ENV_OPTIONS, kbSelections.environment, 'environment')}</div>
        </div>
        <div class="kb-section">
          <div class="kb-label">How are you feeling?</div>
          <div class="kb-chips">${buildKbChips(KB_INTENSITY_OPTIONS, kbSelections.intensity, 'intensity')}</div>
        </div>
        <button class="kb-generate-btn" id="kb-generate">✨ Generate Workout</button>
      </div>`;
  }

  function renderKiwiLoading() {
    const el = document.getElementById('kb-container');
    if (!el) return;
    el.innerHTML = `
      <div class="kb-loading">
        <div class="kb-kiwi-bob">${KIWI_SVG}</div>
        <div class="kb-loading-text">Generating your session…</div>
        <div class="kb-dots">
          <div class="kb-dot"></div>
          <div class="kb-dot"></div>
          <div class="kb-dot"></div>
        </div>
      </div>`;
  }

  function renderKiwiResult(workout) {
    const el = document.getElementById('kb-container');
    if (!el) return;
    const warmupItems   = (workout.warmup?.items   || []).map(i => `<li>${i}</li>`).join('');
    const cooldownItems = (workout.cooldown?.items || []).map(i => `<li>${i}</li>`).join('');
    const mainHTML = (workout.main || []).map(ex => `
      <div class="kb-ex">
        <div class="kb-ex-header">
          <span class="kb-ex-name">${ex.name}</span>
          ${ex.duration ? `<span class="kb-ex-dur">${ex.duration}</span>` : ''}
        </div>
        ${ex.description ? `<div class="kb-ex-desc">${ex.description}</div>` : ''}
        ${ex.tips       ? `<div class="kb-ex-tip">💡 ${ex.tips}</div>`       : ''}
      </div>`).join('');

    const envLabel = kbSelections.environment === 'on-ice' ? 'On Ice' : 'Off Ice';
    const intLabel = kbSelections.intensity.charAt(0).toUpperCase() + kbSelections.intensity.slice(1);

    el.innerHTML = `
      <div class="kb-scroll">
        <div class="kb-hero">
          <div class="kb-kiwi-wrap"><span class="kb-kiwi-bob">${KIWI_SVG}</span></div>
          <div class="kb-speech">Here's your workout! Ka pai! 🎉</div>
        </div>
        <div class="kb-result-title">${workout.title || 'Your Session'}</div>
        <div class="kb-result-sub">${kbSelections.duration} min · ${envLabel} · ${intLabel}</div>
        ${warmupItems ? `<div class="kb-block"><div class="kb-block-title">🌡 Warm-Up${workout.warmup?.duration ? ' · ' + workout.warmup.duration : ''}</div><ul>${warmupItems}</ul></div>` : ''}
        ${mainHTML    ? `<div class="kb-block"><div class="kb-block-title">⛸ Main Session</div>${mainHTML}</div>` : ''}
        ${cooldownItems ? `<div class="kb-block"><div class="kb-block-title">❄️ Cool-Down${workout.cooldown?.duration ? ' · ' + workout.cooldown.duration : ''}</div><ul>${cooldownItems}</ul></div>` : ''}
        ${workout.notes ? `<div class="kb-notes">📝 ${workout.notes}</div>` : ''}
        <div style="height:8px"></div>
      </div>
      <div class="kb-footer">
        <button class="kb-save-btn" id="kb-save">Save Workout</button>
        <button class="kb-regen-btn" id="kb-regen">Regenerate</button>
      </div>`;
  }

  function renderKiwiError(msg) {
    const el = document.getElementById('kb-container');
    if (!el) return;
    el.innerHTML = `
      <div class="kb-scroll">
        <div class="kb-hero">
          <div class="kb-kiwi-wrap"><span>${KIWI_SVG}</span></div>
          <div class="kb-speech">Oops, something went wrong!</div>
        </div>
        <div class="kb-error">${msg}</div>
        <button class="kb-generate-btn" id="kb-retry">Try Again</button>
      </div>`;
  }

  function showApiKeyModal(onSuccess) {
    const overlay = document.createElement('div');
    overlay.className = 'kb-modal-overlay';
    overlay.innerHTML = `
      <div class="kb-modal">
        <div class="kb-modal-title">OpenAI API Key</div>
        <div class="kb-modal-desc">To generate workouts, paste your OpenAI API key below. It's stored only on this device and never sent anywhere other than OpenAI.</div>
        <input type="password" class="kb-modal-input" id="kb-key-input" placeholder="sk-..." autocomplete="off"/>
        <button class="kb-modal-save" id="kb-key-save">Save & Generate</button>
      </div>`;
    document.body.appendChild(overlay);
    const input = overlay.querySelector('#kb-key-input');
    overlay.querySelector('#kb-key-save').addEventListener('click', () => {
      const key = input.value.trim();
      if (!key.startsWith('sk-')) { input.style.borderColor = '#ef4444'; return; }
      localStorage.setItem('kiwiskate-openai-key', key);
      overlay.remove();
      onSuccess();
    });
    setTimeout(() => input.focus(), 50);
  }

  async function callOpenAI(prompt) {
    const key = localStorage.getItem('kiwiskate-openai-key') || '';
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1500,
        temperature: 0.8,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `API error ${res.status}`);
    }
    const data = await res.json();
    return JSON.parse(data.choices[0].message.content);
  }

  async function handleGenerate() {
    const key = localStorage.getItem('kiwiskate-openai-key') || '';
    if (!key) { showApiKeyModal(handleGenerate); return; }
    renderKiwiLoading();
    const working = getWorkingSkills();
    const envLabel = kbSelections.environment === 'on-ice' ? 'on-ice' : 'off-ice (no skates)';
    const workingLine = working.length > 0
      ? `The skater is currently working on: ${working.map(w => `"${w.skill}" (${w.badge})`).join(', ')}. Prioritise these.`
      : 'The skater has no specific skills currently marked as working on — design a well-rounded session.';
    const prompt = `You are a figure skating coach for the New Zealand KiwiSkate programme.
Generate a ${kbSelections.duration}-minute ${envLabel} training session at ${kbSelections.intensity} intensity.
${workingLine}
Use NZ English spelling (e.g. practise, prioritise, recognise).
Respond ONLY with a valid JSON object in exactly this structure:
{
  "title": "Short descriptive session title",
  "warmup":   { "duration": "X min", "items": ["activity 1", "activity 2", "activity 3"] },
  "main":     [{ "name": "Exercise name", "duration": "X min", "description": "What to do", "tips": "One key coaching tip" }],
  "cooldown": { "duration": "X min", "items": ["activity 1", "activity 2"] },
  "notes": "Optional short coaching note or encouragement (or empty string)"
}`;
    try {
      const workout = await callOpenAI(prompt);
      kbCurrentWorkout = workout;
      renderKiwiResult(workout);
    } catch (err) {
      renderKiwiError(`${err.message}<br><br>Check your API key is valid and has credits available.`);
    }
  }

  function saveWorkout(workout) {
    const saved = JSON.parse(localStorage.getItem('kiwiskate-saved-workouts-v1') || '[]');
    saved.unshift({
      id: Date.now(),
      date: new Date().toISOString(),
      duration: kbSelections.duration,
      environment: kbSelections.environment,
      intensity: kbSelections.intensity,
      workout,
    });
    localStorage.setItem('kiwiskate-saved-workouts-v1', JSON.stringify(saved));
  }

  function initKiwiBot() {
    const el = document.getElementById('kb-container');
    if (!el) return;
    // Single delegated listener on the container handles all bot interactions
    el.addEventListener('click', e => {
      const chip = e.target.closest('.kb-chip[data-kb-key]');
      if (chip) {
        const key = chip.dataset.kbKey;
        const val = chip.dataset.kbVal;
        kbSelections[key] = isNaN(val) ? val : +val;
        el.querySelectorAll(`.kb-chip[data-kb-key="${key}"]`).forEach(c => {
          c.classList.toggle('active', c.dataset.kbVal === String(kbSelections[key]));
        });
        return;
      }
      if (e.target.closest('#kb-generate') || e.target.closest('#kb-retry')) { handleGenerate(); return; }
      if (e.target.closest('#kb-regen'))   { handleGenerate(); return; }
      const saveBtn = e.target.closest('#kb-save');
      if (saveBtn && kbCurrentWorkout) {
        saveWorkout(kbCurrentWorkout);
        saveBtn.textContent = 'Saved ✓';
        saveBtn.classList.add('saved');
        saveBtn.disabled = true;
        return;
      }
    });
    renderKiwiSelector();
  }

  const askBtn = document.querySelector('.bs-btn');
  if (askBtn) askBtn.addEventListener('click', () => switchTab('bot'));

  // ============================================================
  // STATUS BAR CLOCK
  // ============================================================
  function updateClock() {
    const el = document.querySelector('.status-time');
    if (!el) return;
    const now = new Date();
    const h = now.getHours(), m = now.getMinutes().toString().padStart(2, '0');
    el.textContent = `${h % 12 || 12}:${m}`;
  }
  updateClock();
  setInterval(updateClock, 30000);

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

  // ============================================================
  // SKILLS — STATE (localStorage)
  // ============================================================
  const SKILLS_KEY    = 'kiwiskate-skills-v1';
  const COLLAPSE_KEY  = 'kiwiskate-collapse-v1';
  const LAST_EDIT_KEY = 'kiwiskate-last-edit-v1';

  function loadSkillsState() {
    try { return JSON.parse(localStorage.getItem(SKILLS_KEY)) || {}; } catch { return {}; }
  }
  function saveSkillsState(s)  { localStorage.setItem(SKILLS_KEY,   JSON.stringify(s)); }
  function loadCollapseState() {
    try { return JSON.parse(localStorage.getItem(COLLAPSE_KEY)) || {}; } catch { return {}; }
  }
  function saveCollapseState(cs) { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(cs)); }

  function saveLastEdit(badgeId, skillIdx, stars) {
    localStorage.setItem(LAST_EDIT_KEY, JSON.stringify({ badgeId, skillIdx, stars }));
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
  // SKILLS — BOOKMARK SVG (shared)
  // ============================================================
  const BOOKMARK_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`;

  // ============================================================
  // SKILLS — BUILD HTML
  // ============================================================
  function buildSkillRowHTML(badgeId, idx, skillName, state) {
    const { stars, working } = getSkillData(state, badgeId, idx);
    const starsHTML = [1, 2, 3].map(n =>
      `<button class="star-btn${stars >= n ? ' filled' : ''}" data-badge="${badgeId}" data-skill="${idx}" data-star="${n}" type="button" aria-label="${n} star${n > 1 ? 's' : ''}">★</button>`
    ).join('');
    return `
      <div class="skill-row${working ? ' is-working' : ''}" data-badge="${badgeId}" data-skill="${idx}">
        <span class="sk-name">${skillName}</span>
        <div class="sk-actions">
          <div class="sk-stars">${starsHTML}</div>
          <button class="working-btn${working ? ' active' : ''}" data-badge="${badgeId}" data-skill="${idx}" type="button" aria-label="Mark as working on it">${BOOKMARK_SVG}</button>
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
    const skillsHTML = badge.skills.map((s, i) => buildSkillRowHTML(badge.id, i, s, state)).join('');
    return `
      <div class="badge-section${expanded ? ' expanded' : ''}" data-badge-id="${badge.id}">
        <button class="badge-header" type="button">
          <div class="badge-header-left">
            <span class="badge-icon-wrap">${badge.icon}</span>
            <div class="badge-meta">
              <span class="badge-name-text">${badge.name}</span>
              <span class="badge-progress-sub" id="bsub-${badge.id}">${mastered} of ${total} mastered</span>
            </div>
          </div>
          <div class="badge-header-right">
            <span class="badge-pill${allDone ? ' pill-done' : ''}" id="bpill-${badge.id}">${allDone ? '✓' : `${mastered}/${total}`}</span>
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
        <span class="ss-frac">${mastered}<span class="ss-total"> / ${total} skills</span></span>
      </div>
      <div class="progress-bar-wrap"><div class="progress-bar" style="width:${pct}%"></div></div>
      <div class="ss-stats">
        <div class="ss-stat"><span class="ss-stat-val">${mastered}</span><span class="ss-stat-lbl">★★★ Mastered</span></div>
        <div class="ss-stat"><span class="ss-stat-val">${inProgress}</span><span class="ss-stat-lbl">In Progress</span></div>
        <div class="ss-stat"><span class="ss-stat-val">${total - mastered - inProgress}</span><span class="ss-stat-lbl">Not Started</span></div>
      </div>`;
  }

  function updateBadgePill(badgeId, state) {
    const badge = ALL_BADGES.find(b => b.id === badgeId);
    if (!badge) return;
    const mastered = countMastered(badge, state);
    const total    = badge.skills.length;
    const allDone  = mastered === total;
    const pill = document.getElementById(`bpill-${badgeId}`);
    const sub  = document.getElementById(`bsub-${badgeId}`);
    if (pill) { pill.textContent = allDone ? '✓' : `${mastered}/${total}`; pill.classList.toggle('pill-done', allDone); }
    if (sub)  { sub.textContent  = `${mastered} of ${total} mastered`; }
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

    const listHTML = items.map(({ badge, skillName, idx }) => `
      <div class="ws-item">
        <div class="ws-info">
          <span class="ws-badge-label">${badge.icon} ${badge.name}</span>
          <span class="ws-skill-name">${skillName}</span>
        </div>
        <button class="working-btn active ws-remove" data-badge="${badge.id}" data-skill="${idx}" type="button" aria-label="Remove from working on it">${BOOKMARK_SVG}</button>
      </div>`).join('');

    el.innerHTML = `
      <div class="working-section">
        <div class="ws-header">
          <span class="ws-title">Currently Working On</span>
          <span class="ws-count-pill">${items.length}</span>
        </div>
        <div class="ws-list">${listHTML}</div>
      </div>`;
  }

  // ============================================================
  // DASHBOARD — Skills Progress section
  // ============================================================
  function renderDashSkills(state) {
    const el = document.getElementById('dash-skills-section');
    if (!el) return;

    // Find first incomplete badge (next to achieve)
    let nextBadge = null, nextMastered = 0;
    outer: for (const group of SKILL_GROUPS) {
      for (const badge of group.badges) {
        const m = countMastered(badge, state);
        if (m < badge.skills.length) { nextBadge = badge; nextMastered = m; break outer; }
      }
    }

    // Find last edited skill
    const lastEdit = loadLastEdit();
    let lastBadge = null, lastSkillName = null;
    if (lastEdit) {
      lastBadge = ALL_BADGES.find(b => b.id === lastEdit.badgeId);
      if (lastBadge && lastEdit.skillIdx < lastBadge.skills.length) {
        lastSkillName = lastBadge.skills[lastEdit.skillIdx];
      }
    }

    if (!nextBadge && !lastSkillName) { el.innerHTML = ''; return; }

    let inner = '';

    if (nextBadge) {
      const pct = Math.round((nextMastered / nextBadge.skills.length) * 100);
      inner += `
        <div class="dsc-lbl">Next Badge</div>
        <div class="dsc-row">
          <span class="dsc-badge-icon">${nextBadge.icon}</span>
          <div class="dsc-info"><span class="dsc-badge-name">${nextBadge.name}</span></div>
          <span class="dsc-fraction">${nextMastered}/${nextBadge.skills.length}</span>
        </div>
        <div class="dsc-mini-bar"><div class="progress-bar-wrap"><div class="progress-bar" style="width:${pct}%"></div></div></div>`;
    }

    if (nextBadge && lastSkillName) {
      inner += '<div class="dsc-divider"></div>';
    }

    if (lastSkillName) {
      const filled = lastEdit.stars;
      const starsHTML = [1,2,3].map(n =>
        `<span${n > filled ? ' class="empty"' : ''}>★</span>`
      ).join('');
      inner += `
        <div class="dsc-lbl">Last Rated</div>
        <div class="dsc-last-row">
          <span class="dsc-stars">${starsHTML}</span>
          <div>
            <span class="dsc-skill-name">${lastSkillName}</span>
            <span class="dsc-badge-sub">${lastBadge.name}</span>
          </div>
        </div>`;
    }

    el.innerHTML = `
      <div class="section-label" style="margin-top:20px">Skills Progress</div>
      <div class="card dash-skills-card">${inner}</div>`;
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
      const btn = row.querySelector('.working-btn');
      if (btn) btn.classList.toggle('active', d.working);
    }

    renderWorkingSection(state);
    updateSummaryCard(state);
    renderDashSkills(state);
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
    renderDashSkills(state);

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
      // Star button
      const starBtn = e.target.closest('.star-btn');
      if (starBtn) {
        const { badge: badgeId, skill: idx, star } = starBtn.dataset;
        const state = loadSkillsState();
        const d = ensureSkillEntry(state, badgeId, +idx);
        d.stars = d.stars === +star ? +star - 1 : +star;
        saveSkillsState(state);
        saveLastEdit(badgeId, +idx, d.stars);

        starBtn.closest('.sk-stars').querySelectorAll('.star-btn').forEach(btn => {
          btn.classList.toggle('filled', +btn.dataset.star <= d.stars);
        });
        updateBadgePill(badgeId, state);
        updateSummaryCard(state);
        renderDashSkills(state);
        return;
      }

      // Working on it button (in skill rows)
      const workBtn = e.target.closest('.working-btn');
      if (workBtn) {
        toggleWorking(workBtn.dataset.badge, workBtn.dataset.skill);
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

    // ---- Delegated listener: working section (remove buttons) ----
    const wsEl = document.getElementById('working-section');
    if (wsEl) {
      wsEl.addEventListener('click', e => {
        const btn = e.target.closest('.ws-remove');
        if (btn) toggleWorking(btn.dataset.badge, btn.dataset.skill);
      });
    }
  }

  initSkills();
  initKiwiBot();

})();
