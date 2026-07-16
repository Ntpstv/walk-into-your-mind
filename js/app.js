/**
 * A Walk Through Your Mind — app logic
 * Single-page, story-driven sprint retrospective. No frameworks, no backend.
 * Everything lives in localStorage under STORAGE_KEY.
 */
(() => {
  'use strict';

  const STORAGE_KEY = 'walkThroughYourMind.answers.v1';
  const SCENE_STORAGE_KEY = 'walkThroughYourMind.currentScene.v1';

  // ---------------------------------------------------------------------
  // Anonymous submission — Google Form config
  // Fill these in once the Google Form exists (see SETUP.md for exact
  // steps). No names or identifiers are ever collected — only the answers
  // below. Leave GOOGLE_FORM_ACTION_URL empty to keep the submit button
  // disabled until this is configured.
  // ---------------------------------------------------------------------
  const GOOGLE_FORM_ACTION_URL = '';
  const GOOGLE_FORM_ENTRY_IDS = {
    doorEmoji: '',
    doorSentence: '',
    backpackWeight: '',
    windowEnergy: '',
    mirrorPride: '',
    chairImprove: '',
    cornerWish: '',
    letterReminder: '',
    lightsOutFinal: '',
  };
  const isSubmissionConfigured = () =>
    Boolean(GOOGLE_FORM_ACTION_URL) && Object.values(GOOGLE_FORM_ENTRY_IDS).every(Boolean);

  /** Ordered list of scenes. "landing" and "ending" bookend the 8 story scenes. */
  const SCENE_ORDER = [
    'landing', 'door', 'backpack', 'window', 'mirror',
    'chair', 'corner', 'letter', 'lightsout', 'ending',
  ];

  /** Scenes that count toward the footstep progress trail. */
  const JOURNEY_SCENES = SCENE_ORDER.slice(1, -1); // door..lightsout

  /** Maps each field to the scene it belongs to and its label in the summary/export. */
  const FIELDS = [
    { key: 'doorEmoji', scene: 'door', label: 'ความรู้สึกหน้าประตูบ้าน' },
    { key: 'doorSentence', scene: 'door', label: 'เล่าเป็นประโยคเดียว' },
    { key: 'backpackWeight', scene: 'backpack', label: 'สิ่งที่ทำให้รู้สึกหนักอึ้ง' },
    { key: 'windowEnergy', scene: 'window', label: 'สิ่งที่ช่วยให้หายใจสะดวกขึ้น' },
    { key: 'mirrorPride', scene: 'mirror', label: 'เรื่องที่ภูมิใจในตัวเอง' },
    { key: 'chairImprove', scene: 'chair', label: 'สิ่งที่อยากให้ทีมปรับปรุง' },
    { key: 'cornerWish', scene: 'corner', label: 'สิ่งที่อยากให้มีอยู่' },
    { key: 'letterReminder', scene: 'letter', label: 'ข้อความถึงตัวเองในวันข้างหน้า' },
    { key: 'lightsOutFinal', scene: 'lightsout', label: 'สิ่งที่ยังไม่ได้พูดออกมา' },
  ];

  const QUOTES = [
    'Resting your mind is part of taking care of yourself too.',
    'Even a small step can carry your mind forward.',
    'What you’ve been carrying, you can set down too.',
    'Just noticing how you feel is already a way of caring for yourself.',
    'Some progress is too quiet to notice from the outside.',
    'A calm mind usually goes further than a hurried one.',
    'Every moment that passes leaves something worth remembering.',
    'You’re allowed to be proud of yourself before you’re perfect.',
  ];

  /** In-memory state, mirrored to localStorage on every change. */
  let answers = loadAnswers();
  let currentSceneIndex = 0;
  let typingTimer = null;

  // ---------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------

  function loadAnswers() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (err) {
      return {};
    }
  }

  function saveAnswers() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(answers));
    } catch (err) {
      // Storage may be unavailable (private browsing quota etc.) — fail silently,
      // the reflection still works for the current session.
    }
  }

  function saveSceneIndex() {
    try {
      localStorage.setItem(SCENE_STORAGE_KEY, String(currentSceneIndex));
    } catch (err) { /* noop */ }
  }

  // ---------------------------------------------------------------------
  // Scene navigation
  // ---------------------------------------------------------------------

  const sceneEls = {};
  SCENE_ORDER.forEach((name) => {
    sceneEls[name] = document.querySelector(`.scene[data-scene="${name}"]`);
  });

  // Prevents a click/keypress during the quote hold from starting a second,
  // overlapping transition — without this, a scene could go active while the
  // previous one still is, and the hold time for that second jump would look
  // much shorter than intended.
  let isTransitioning = false;

  function goToScene(index, { showQuote = false } = {}) {
    if (isTransitioning) return;

    index = Math.max(0, Math.min(SCENE_ORDER.length - 1, index));
    const prevName = SCENE_ORDER[currentSceneIndex];
    const nextName = SCENE_ORDER[index];

    if (prevName === nextName) return;

    isTransitioning = true;
    sceneEls[prevName].classList.remove('active');
    currentSceneIndex = index;
    saveSceneIndex();

    const render = () => {
      sceneEls[nextName].classList.add('active');
      updateFootsteps();
      runTypingAnimation(sceneEls[nextName]);
      if (nextName === 'ending') renderSummary();
      focusFirstField(sceneEls[nextName]);
      isTransitioning = false;
    };

    if (showQuote) {
      showQuoteOverlay(render);
    } else {
      render();
    }
  }

  function nextScene() {
    goToScene(currentSceneIndex + 1, { showQuote: true });
  }

  function prevScene() {
    goToScene(currentSceneIndex - 1, { showQuote: true });
  }

  function focusFirstField(sceneEl) {
    const field = sceneEl.querySelector('.text-input, .textarea');
    if (field && window.innerWidth > 640) {
      // Gentle focus only on larger screens, to avoid popping the mobile keyboard unexpectedly.
      setTimeout(() => field.focus({ preventScroll: true }), 400);
    }
  }

  // ---------------------------------------------------------------------
  // Footstep progress indicator
  // ---------------------------------------------------------------------

  const footstepsEl = document.getElementById('footsteps');

  /** Thai scene titles, shown as the footstep dots' hover tooltip. */
  const SCENE_TITLES = {
    door: 'ประตูบ้าน',
    backpack: 'เป้ใบนั้น',
    window: 'หน้าต่างบานนั้น',
    mirror: 'หน้ากระจก',
    chair: 'เก้าอี้ตัวนั้น',
    corner: 'มุมว่างในห้อง',
    letter: 'จดหมายถึงวันข้างหน้า',
    lightsout: 'ก่อนไฟจะดับ',
  };

  function buildFootsteps() {
    footstepsEl.innerHTML = '';
    JOURNEY_SCENES.forEach((name) => {
      const dot = document.createElement('span');
      dot.className = 'footstep';
      dot.dataset.scene = name;
      dot.setAttribute('title', SCENE_TITLES[name] || name);
      footstepsEl.appendChild(dot);
    });
  }

  function updateFootsteps() {
    const currentName = SCENE_ORDER[currentSceneIndex];
    const journeyIndex = JOURNEY_SCENES.indexOf(currentName);

    footstepsEl.classList.toggle('visible', journeyIndex !== -1);

    Array.from(footstepsEl.children).forEach((dot, i) => {
      dot.classList.toggle('filled', journeyIndex !== -1 && i <= journeyIndex);
      dot.classList.toggle('current', i === journeyIndex);
    });
  }

  // ---------------------------------------------------------------------
  // Typing animation for story text
  // ---------------------------------------------------------------------

  function runTypingAnimation(sceneEl) {
    const storyEl = sceneEl.querySelector('[data-typing]');
    if (!storyEl) return;

    if (!storyEl.dataset.fullText) {
      storyEl.dataset.fullText = storyEl.innerHTML;
    }
    const fullText = storyEl.dataset.fullText;

    clearTimeout(typingTimer);

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      storyEl.innerHTML = fullText;
      return;
    }

    // Type by breaking on tags so <br> isn't split mid-tag.
    const tokens = fullText.split(/(<br\s*\/?>)/i);
    let output = '';
    let tokenIndex = 0;
    let charIndex = 0;
    storyEl.innerHTML = '';

    function typeStep() {
      if (tokenIndex >= tokens.length) return;
      const token = tokens[tokenIndex];

      if (token.match(/<br\s*\/?>/i)) {
        output += token;
        storyEl.innerHTML = output;
        tokenIndex += 1;
        charIndex = 0;
        typingTimer = setTimeout(typeStep, 120);
        return;
      }

      output += token[charIndex] || '';
      storyEl.innerHTML = output;
      charIndex += 1;

      if (charIndex >= token.length) {
        tokenIndex += 1;
        charIndex = 0;
      }
      typingTimer = setTimeout(typeStep, 16);
    }

    typeStep();
  }

  // ---------------------------------------------------------------------
  // Quote overlay between scenes
  // ---------------------------------------------------------------------

  const quoteOverlay = document.getElementById('quoteOverlay');
  const quoteText = document.getElementById('quoteText');

  function showQuoteOverlay(onDone) {
    quoteText.textContent = QUOTES[Math.floor(Math.random() * QUOTES.length)];
    quoteOverlay.classList.add('visible');
    setTimeout(() => {
      quoteOverlay.classList.remove('visible');
      // Wait for the overlay's own fade-out to finish before the next scene
      // starts fading in — otherwise the two fades overlap and briefly
      // double-expose the outgoing quote over the incoming scene.
      setTimeout(onDone, 950);
    }, 5000);
  }

  // ---------------------------------------------------------------------
  // Field binding + autosave
  // ---------------------------------------------------------------------

  function restoreFieldValues() {
    FIELDS.forEach(({ key }) => {
      const value = answers[key];
      if (!value) return;
      const el = document.querySelector(`[data-field="${key}"]`);
      if (el) el.value = value;
    });

    if (answers.doorEmoji) {
      const emojiBtn = document.querySelector(`.emoji-btn[data-emoji="${answers.doorEmoji}"]`);
      if (emojiBtn) emojiBtn.classList.add('selected');
    }
  }

  function bindFieldAutosave() {
    document.querySelectorAll('[data-field]').forEach((el) => {
      el.addEventListener('input', () => {
        answers[el.dataset.field] = el.value;
        saveAnswers();
      });
    });
  }

  function bindEmojiPicker() {
    const picker = document.getElementById('emojiPicker');
    picker.addEventListener('click', (e) => {
      const btn = e.target.closest('.emoji-btn');
      if (!btn) return;

      picker.querySelectorAll('.emoji-btn').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      answers.doorEmoji = btn.dataset.emoji;
      saveAnswers();
    });
  }

  // ---------------------------------------------------------------------
  // Navigation buttons + keyboard
  // ---------------------------------------------------------------------

  function bindNavButtons() {
    document.querySelectorAll('[data-nav]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.nav === 'next') nextScene();
        else prevScene();
      });
    });

    document.getElementById('beginJourneyBtn').addEventListener('click', () => {
      goToScene(1, { showQuote: true });
    });

    document.getElementById('restartBtn').addEventListener('click', restartJourney);
  }

  function bindKeyboardNav() {
    document.addEventListener('keydown', (e) => {
      const tag = document.activeElement.tagName;
      const isTyping = tag === 'TEXTAREA' || tag === 'INPUT';

      if (e.key === 'ArrowRight' && !isTyping) {
        e.preventDefault();
        nextScene();
      } else if (e.key === 'ArrowLeft' && !isTyping) {
        e.preventDefault();
        prevScene();
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || !isTyping)) {
        const activeScene = sceneEls[SCENE_ORDER[currentSceneIndex]];
        const nextBtn = activeScene.querySelector('[data-nav="next"]');
        if (nextBtn) {
          e.preventDefault();
          nextBtn.click();
        } else if (SCENE_ORDER[currentSceneIndex] === 'landing') {
          e.preventDefault();
          goToScene(1, { showQuote: true });
        }
      }
    });
  }

  // ---------------------------------------------------------------------
  // Summary / ending
  // ---------------------------------------------------------------------

  function renderSummary() {
    const summaryEl = document.getElementById('summary');
    summaryEl.innerHTML = '';

    // Emotion + sentence are combined into one card.
    const emotionValue = [answers.doorEmoji, answers.doorSentence].filter(Boolean).join('  —  ');
    summaryEl.appendChild(buildSummaryItem('ความรู้สึกหน้าประตูบ้าน', emotionValue));

    FIELDS.filter((f) => f.key !== 'doorEmoji' && f.key !== 'doorSentence').forEach((f) => {
      summaryEl.appendChild(buildSummaryItem(f.label, answers[f.key]));
    });
  }

  function buildSummaryItem(label, value) {
    const item = document.createElement('div');
    item.className = 'summary-item';
    const h3 = document.createElement('h3');
    h3.textContent = label;
    const p = document.createElement('p');
    if (value && value.trim()) {
      p.textContent = value;
    } else {
      p.textContent = 'ครั้งนี้ขอเงียบไว้ก่อนนะ';
      p.classList.add('empty-state');
    }
    item.appendChild(h3);
    item.appendChild(p);
    return item;
  }

  // ---------------------------------------------------------------------
  // Export: Markdown + JSON
  // ---------------------------------------------------------------------

  function buildMarkdown() {
    const date = new Date().toLocaleDateString('th-TH-u-ca-gregory', { year: 'numeric', month: 'long', day: 'numeric' });
    const lines = [
      '# เดินเล่นในใจตัวเอง',
      `_บันทึกการเดินทางในใจ — ${date}_`,
      '',
      `## ความรู้สึกหน้าประตูบ้าน`,
      [answers.doorEmoji, answers.doorSentence].filter(Boolean).join(' — ') || '_ครั้งนี้ขอเงียบไว้ก่อนนะ_',
      '',
    ];

    FIELDS.filter((f) => f.key !== 'doorEmoji' && f.key !== 'doorSentence').forEach((f) => {
      lines.push(`## ${f.label}`);
      lines.push(answers[f.key] && answers[f.key].trim() ? answers[f.key] : '_ครั้งนี้ขอเงียบไว้ก่อนนะ_');
      lines.push('');
    });

    return lines.join('\n');
  }

  function buildJson() {
    return JSON.stringify(
      {
        title: 'เดินเล่นในใจตัวเอง',
        exportedAt: new Date().toISOString(),
        answers,
      },
      null,
      2
    );
  }

  function bindExportButtons() {
    document.getElementById('copyMarkdownBtn').addEventListener('click', async () => {
      const md = buildMarkdown();
      try {
        await navigator.clipboard.writeText(md);
        showCopyFeedback('คัดลอกเป็น Markdown แล้ว');
      } catch (err) {
        // Clipboard API can fail without a secure context/permission — fall back to a download.
        downloadFile('reflection.md', md, 'text/markdown');
        showCopyFeedback('คัดลอกไม่ได้ เลยดาวน์โหลดไฟล์ให้แทน');
      }
    });

    document.getElementById('downloadJsonBtn').addEventListener('click', () => {
      downloadFile('reflection.json', buildJson(), 'application/json');
      showCopyFeedback('ดาวน์โหลดเป็น JSON แล้ว');
    });
  }

  // ---------------------------------------------------------------------
  // Anonymous submission — posts into the team's shared Google Form/Sheet.
  // No name or identifier is ever attached to the payload.
  // ---------------------------------------------------------------------

  function submitAnonymousReflection() {
    const formData = new FormData();
    Object.entries(GOOGLE_FORM_ENTRY_IDS).forEach(([key, entryId]) => {
      formData.append(entryId, answers[key] || '');
    });
    // Google Forms' response endpoint doesn't return CORS headers, so the
    // response is opaque with mode: 'no-cors' — this is the standard way to
    // post a form cross-origin from client-side JS. We can only detect
    // network-level failures (e.g. offline), not the form's own validation.
    return fetch(GOOGLE_FORM_ACTION_URL, { method: 'POST', mode: 'no-cors', body: formData });
  }

  function bindSubmitButton() {
    const btn = document.getElementById('submitReflectionBtn');
    if (!btn) return;

    if (!isSubmissionConfigured()) {
      btn.disabled = true;
      btn.title = 'ยังไม่ได้ตั้งค่าปลายทางสำหรับรับคำตอบ';
      return;
    }

    btn.addEventListener('click', async () => {
      btn.disabled = true;
      showCopyFeedback('กำลังส่งคำตอบ...', { persist: true });
      try {
        await submitAnonymousReflection();
        showCopyFeedback('ส่งคำตอบแบบไม่ระบุตัวตนให้ทีมแล้ว ขอบคุณนะ');
        btn.textContent = 'ส่งเรียบร้อยแล้ว';
      } catch (err) {
        showCopyFeedback('ส่งไม่สำเร็จ ลองอีกครั้งได้ไหม');
        btn.disabled = false;
      }
    });
  }

  function showCopyFeedback(message, { persist = false } = {}) {
    const el = document.getElementById('copyFeedback');
    el.textContent = message;
    if (persist) return;
    setTimeout(() => {
      if (el.textContent === message) el.textContent = '';
    }, 2600);
  }

  function downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ---------------------------------------------------------------------
  // Restart
  // ---------------------------------------------------------------------

  function restartJourney() {
    answers = {};
    saveAnswers();

    document.querySelectorAll('[data-field]').forEach((el) => { el.value = ''; });
    document.querySelectorAll('.emoji-btn.selected').forEach((el) => el.classList.remove('selected'));
    document.getElementById('copyFeedback').textContent = '';

    goToScene(0);
  }

  // ---------------------------------------------------------------------
  // Floating particles (ambient background)
  // ---------------------------------------------------------------------

  function buildParticles() {
    const container = document.getElementById('particles');
    const count = window.innerWidth < 640 ? 16 : 28;

    for (let i = 0; i < count; i += 1) {
      const p = document.createElement('span');
      p.className = 'particle';
      const size = 2 + Math.random() * 4;
      p.style.width = `${size}px`;
      p.style.height = `${size}px`;
      p.style.left = `${Math.random() * 100}%`;
      p.style.setProperty('--drift', `${(Math.random() - 0.5) * 80}px`);
      p.style.setProperty('--particle-opacity', `${0.3 + Math.random() * 0.4}`);
      const duration = 14 + Math.random() * 18;
      p.style.animationDuration = `${duration}s`;
      p.style.animationDelay = `${Math.random() * duration}s`;
      container.appendChild(p);
    }
  }

  // ---------------------------------------------------------------------
  // Ambient sound — generated in-browser with Web Audio API (no audio files).
  // Off by default per spec; toggled by the user.
  // ---------------------------------------------------------------------

  let audioCtx = null;
  let ambientNodes = null;
  let isSoundOn = false;

  // The famous eight-chord ground bass from Pachelbel's Canon in D (1680,
  // long public domain): I-V-vi-iii-IV-I-IV-V. Built from D3 by semitone
  // offsets so each chord's notes stay musically related rather than
  // hand-picked, then rendered softly as a slow, flowing broken-chord
  // (harp/piano) with one gentle sustained top voice (violin) — no drums,
  // no attack transients, just a slow, breathing loop.
  const noteFreq = (base, semitones) => base * Math.pow(2, semitones / 12);
  const CANON_ROOT_D3 = 146.83;
  const CANON_STEPS = [
    { root: 0, quality: 'maj' }, // D
    { root: 7, quality: 'maj' }, // A
    { root: 9, quality: 'min' }, // Bm
    { root: 4, quality: 'min' }, // F#m
    { root: 5, quality: 'maj' }, // G
    { root: 0, quality: 'maj' }, // D
    { root: 5, quality: 'maj' }, // G
    { root: 7, quality: 'maj' }, // A
  ];
  const CHORDS = CANON_STEPS.map(({ root, quality }) => {
    const rootFreq = noteFreq(CANON_ROOT_D3, root);
    const third = noteFreq(rootFreq, quality === 'maj' ? 4 : 3);
    const fifth = noteFreq(rootFreq, 7);
    const octave = noteFreq(rootFreq, 12);
    return {
      arpeggio: [rootFreq, third, fifth, octave],
      violin: noteFreq(rootFreq, 19), // an octave + a fifth above root — soft, always consonant
    };
  });
  const CHORD_DURATION_S = 5.5;

  function startAmbientSound() {
    if (audioCtx && ambientNodes) return;

    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audioCtx = new Ctx();

    const masterGain = audioCtx.createGain();
    masterGain.gain.value = 0;
    masterGain.connect(audioCtx.destination);
    masterGain.gain.linearRampToValueAtTime(0.11, audioCtx.currentTime + 3);

    // Soft feedback delay stands in for reverb, giving notes room to breathe.
    const delay = audioCtx.createDelay(1.0);
    delay.delayTime.value = 0.45;
    const feedback = audioCtx.createGain();
    feedback.gain.value = 0.32;
    const delayTone = audioCtx.createBiquadFilter();
    delayTone.type = 'lowpass';
    delayTone.frequency.value = 1800;
    const wetGain = audioCtx.createGain();
    wetGain.gain.value = 0.55;

    delay.connect(delayTone);
    delayTone.connect(feedback);
    feedback.connect(delay);
    delay.connect(wetGain);
    wetGain.connect(masterGain);

    // Piano/harp: a slow up-and-down broken chord in pure sine tones —
    // no harmonics to buzz, just a soft, rounded swell per note.
    function playArpeggio(notes, startTime) {
      const noteSpacing = 0.6;
      const pattern = [0, 1, 2, 3, 2, 1];
      pattern.forEach((noteIndex, i) => {
        const freq = notes[noteIndex];
        const t = startTime + i * noteSpacing;

        const osc = audioCtx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;

        const noteGain = audioCtx.createGain();
        noteGain.gain.setValueAtTime(0, t);
        noteGain.gain.linearRampToValueAtTime(0.075, t + 0.15); // gentle swell, no pluck
        noteGain.gain.exponentialRampToValueAtTime(0.0006, t + noteSpacing * 1.8);

        const toneFilter = audioCtx.createBiquadFilter();
        toneFilter.type = 'lowpass';
        toneFilter.frequency.value = 1600;

        osc.connect(noteGain);
        noteGain.connect(toneFilter);
        toneFilter.connect(masterGain);
        toneFilter.connect(delay);

        osc.start(t);
        osc.stop(t + noteSpacing * 2);
      });
    }

    // Violin: one long, softly-bowed note per chord (triangle wave, gently
    // filtered), floating quietly above the arpeggio.
    function playViolinNote(freq, startTime, duration) {
      const osc = audioCtx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;

      const filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1800;

      const vibrato = audioCtx.createOscillator();
      const vibratoGain = audioCtx.createGain();
      vibrato.frequency.value = 4.8;
      vibratoGain.gain.value = freq * 0.004; // subtle wobble, kept soft
      vibrato.connect(vibratoGain);
      vibratoGain.connect(osc.frequency);

      const noteGain = audioCtx.createGain();
      noteGain.gain.setValueAtTime(0.0001, startTime);
      noteGain.gain.exponentialRampToValueAtTime(0.045, startTime + 1.6); // slow, soft bow attack
      noteGain.gain.setValueAtTime(0.045, startTime + duration - 1.6);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      osc.connect(filter);
      filter.connect(noteGain);
      noteGain.connect(masterGain);
      noteGain.connect(delay);

      osc.start(startTime);
      vibrato.start(startTime);
      osc.stop(startTime + duration + 0.1);
      vibrato.stop(startTime + duration + 0.1);
    }

    // Step through the progression, looping with a touch of timing jitter
    // so it feels played rather than mechanically sequenced.
    let chordIndex = 0;
    let schedulerTimeoutId = null;
    function scheduleNextChord() {
      const chord = CHORDS[chordIndex % CHORDS.length];
      const startTime = audioCtx.currentTime + 0.05;
      playArpeggio(chord.arpeggio, startTime);
      playViolinNote(chord.violin, startTime + 0.3, CHORD_DURATION_S - 0.6);

      chordIndex += 1;
      const jitterMs = (Math.random() - 0.5) * 400;
      schedulerTimeoutId = setTimeout(scheduleNextChord, CHORD_DURATION_S * 1000 + jitterMs);
    }
    scheduleNextChord();

    ambientNodes = { masterGain, getSchedulerTimeoutId: () => schedulerTimeoutId };
  }

  function stopAmbientSound() {
    if (!audioCtx || !ambientNodes) return;
    const { masterGain, getSchedulerTimeoutId } = ambientNodes;

    clearTimeout(getSchedulerTimeoutId());
    masterGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 1.2);

    setTimeout(() => {
      // Closing the context stops and releases every node at once, including
      // any still-ringing piano/violin notes — no need to track them individually.
      audioCtx.close();
      audioCtx = null;
      ambientNodes = null;
    }, 1300);
  }

  function bindMusicToggle() {
    const btn = document.getElementById('musicToggle');
    btn.addEventListener('click', () => {
      isSoundOn = !isSoundOn;
      btn.setAttribute('aria-pressed', String(isSoundOn));
      if (isSoundOn) startAmbientSound();
      else stopAmbientSound();
    });
  }

  // ---------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------

  function init() {
    buildParticles();
    buildFootsteps();
    restoreFieldValues();
    bindFieldAutosave();
    bindEmojiPicker();
    bindNavButtons();
    bindKeyboardNav();
    bindExportButtons();
    bindSubmitButton();
    bindMusicToggle();

    // Always start at the landing scene on load; answers persist, position doesn't,
    // so returning visitors re-enter the story rather than resuming mid-scene.
    sceneEls.landing.classList.add('active');
    updateFootsteps();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
