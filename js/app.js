/**
 * A Walk Through Your Mind — app logic
 * Single-page, story-driven sprint retrospective. No frameworks, no backend.
 * Answers live only in memory for the current page load — a fresh visit
 * or reload always starts blank, on purpose.
 */
(() => {
  'use strict';

  // ---------------------------------------------------------------------
  // Anonymous submission — Google Form config
  // Fill these in once the Google Form exists (see SETUP.md for exact
  // steps). No names or identifiers are ever collected — only the answers
  // below. Leave GOOGLE_FORM_ACTION_URL empty to keep the submit button
  // disabled until this is configured.
  // ---------------------------------------------------------------------
  const GOOGLE_FORM_ACTION_URL = 'https://docs.google.com/forms/d/e/1FAIpQLScE7nP8upHhRqA_RR0_ZVZm5CWuJFkTUHttTGF4nkAAXjYMYA/formResponse';
  const GOOGLE_FORM_ENTRY_IDS = {
    backpackWeight: 'entry.555800095',
    windowEnergy: 'entry.1014643297',
    mirrorPride: 'entry.1056327519',
    chairImprove: 'entry.1456393874',
    cornerWish: 'entry.1529884405',
    letterReminder: 'entry.526103210',
    lightsOutFinal: 'entry.1733951691',
  };
  const isSubmissionConfigured = () =>
    Boolean(GOOGLE_FORM_ACTION_URL) && Object.values(GOOGLE_FORM_ENTRY_IDS).every(Boolean);

  // Optional — add an 8th "paragraph" question to the Form for the sprint
  // graph, then fill in its entry ID here. Left empty, the graph simply
  // isn't included in the team submission (it still saves locally and
  // exports fine). Not required for isSubmissionConfigured() since it's
  // additive, not core to the reflection.
  const GOOGLE_FORM_GRAPH_ENTRY_ID = 'entry.1563941710';

  /** Ordered list of scenes. "landing" and "ending" bookend the 8 story scenes. */
  const SCENE_ORDER = [
    'landing', 'graph', 'backpack', 'window', 'mirror',
    'chair', 'corner', 'letter', 'lightsout', 'ending',
  ];

  /** Scenes that count toward the footstep progress trail. */
  const JOURNEY_SCENES = SCENE_ORDER.slice(1, -1); // graph..lightsout

  /** Maps each field to the scene it belongs to and its label in the summary/export. */
  const FIELDS = [
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

  /** In-memory only — never persisted, so every page load starts blank. */
  let answers = {};
  let currentSceneIndex = 0;
  let typingTimer = null;

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
    const field = sceneEl.querySelector('.textarea');
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
    graph: 'เส้นทางที่ผ่านมา',
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
  // Field binding — keeps the in-memory answers object in sync with the
  // DOM as the user types. Nothing here persists across a reload.
  // ---------------------------------------------------------------------

  function bindFieldSync() {
    document.querySelectorAll('[data-field]').forEach((el) => {
      el.addEventListener('input', () => {
        answers[el.dataset.field] = el.value;
      });
    });
  }

  // ---------------------------------------------------------------------
  // Navigation buttons + keyboard
  // ---------------------------------------------------------------------

  function bindNavButtons() {
    document.querySelectorAll('[data-nav]').forEach((btn) => {
      // The sprint-graph scene's "Save Journey" button needs to snapshot the
      // drawing before advancing, so it's wired separately in bindSprintGraph().
      if (btn.id === 'saveJourneyBtn') return;

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
        // Route through the scene's own "next" button rather than calling nextScene()
        // directly — some scenes (like the sprint graph) attach their own validation
        // to that click instead of using the generic handler.
        const activeScene = sceneEls[SCENE_ORDER[currentSceneIndex]];
        const nextBtn = activeScene.querySelector('[data-nav="next"]');
        if (nextBtn) nextBtn.click();
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
  // Sprint graph — a freehand journal-style drawing of the sprint's
  // emotional arc. Strokes are stored as normalized (0–1) points so they
  // redraw correctly at any canvas size (resize, restore-on-load, replay).
  // ---------------------------------------------------------------------

  const GRAPH_STROKE_WIDTH = 4;
  const GRAPH_STROKE_COLOR = 'rgba(240, 185, 128, 0.92)';
  const GRAPH_GLOW_COLOR = 'rgba(240, 185, 128, 0.55)';
  const GRAPH_GRID_STEP = 28;

  let graphCanvas = null;
  let graphCtx = null;
  let graphLogicalWidth = 0;
  let graphLogicalHeight = 0;
  let graphStrokes = []; // array of strokes; each stroke: array of {x, y} normalized 0–1
  let graphCurrentStrokeRaw = []; // in-progress stroke, in CSS-pixel coordinates
  let graphIsDrawing = false;
  let graphResizeTimer = null;

  function getCanvasPoint(e) {
    const rect = graphCanvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function normalizePoint(p) {
    return { x: p.x / graphLogicalWidth, y: p.y / graphLogicalHeight };
  }

  function denormalizeStroke(stroke) {
    return stroke.map((p) => ({ x: p.x * graphLogicalWidth, y: p.y * graphLogicalHeight }));
  }

  function applyGraphStrokeStyle() {
    graphCtx.lineWidth = GRAPH_STROKE_WIDTH;
    graphCtx.lineCap = 'round';
    graphCtx.lineJoin = 'round';
    graphCtx.strokeStyle = GRAPH_STROKE_COLOR;
    graphCtx.shadowColor = GRAPH_GLOW_COLOR;
    graphCtx.shadowBlur = 8;
  }

  function drawGraphGrid() {
    graphCtx.clearRect(0, 0, graphLogicalWidth, graphLogicalHeight);
    graphCtx.save();
    graphCtx.shadowBlur = 0;

    graphCtx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    graphCtx.lineWidth = 1;
    for (let x = GRAPH_GRID_STEP; x < graphLogicalWidth; x += GRAPH_GRID_STEP) {
      graphCtx.beginPath();
      graphCtx.moveTo(x, 0);
      graphCtx.lineTo(x, graphLogicalHeight);
      graphCtx.stroke();
    }
    for (let y = GRAPH_GRID_STEP; y < graphLogicalHeight; y += GRAPH_GRID_STEP) {
      graphCtx.beginPath();
      graphCtx.moveTo(0, y);
      graphCtx.lineTo(graphLogicalWidth, y);
      graphCtx.stroke();
    }

    // Two dashed guide lines marking the Energized / Calm / Exhausted thirds.
    graphCtx.strokeStyle = 'rgba(240, 185, 128, 0.14)';
    graphCtx.setLineDash([4, 5]);
    [graphLogicalHeight / 3, (graphLogicalHeight / 3) * 2].forEach((y) => {
      graphCtx.beginPath();
      graphCtx.moveTo(0, y);
      graphCtx.lineTo(graphLogicalWidth, y);
      graphCtx.stroke();
    });
    graphCtx.setLineDash([]);

    graphCtx.restore();
  }

  /** Renders one complete stroke as a single smooth curve through its points, on any given context. */
  function drawFullStroke(ctx, pointsCss) {
    if (pointsCss.length === 0) return;
    if (pointsCss.length === 1) {
      ctx.beginPath();
      ctx.arc(pointsCss[0].x, pointsCss[0].y, GRAPH_STROKE_WIDTH / 2, 0, Math.PI * 2);
      ctx.fillStyle = GRAPH_STROKE_COLOR;
      ctx.fill();
      return;
    }

    ctx.beginPath();
    ctx.moveTo(pointsCss[0].x, pointsCss[0].y);
    for (let i = 1; i < pointsCss.length - 1; i += 1) {
      const midX = (pointsCss[i].x + pointsCss[i + 1].x) / 2;
      const midY = (pointsCss[i].y + pointsCss[i + 1].y) / 2;
      ctx.quadraticCurveTo(pointsCss[i].x, pointsCss[i].y, midX, midY);
    }
    ctx.lineTo(pointsCss[pointsCss.length - 1].x, pointsCss[pointsCss.length - 1].y);
    ctx.stroke();
  }

  /** Draws just the newest segment of the stroke currently being drawn, for a live feel. */
  function drawLiveSegment() {
    const pts = graphCurrentStrokeRaw;
    if (pts.length < 2) return;

    if (pts.length === 2) {
      graphCtx.beginPath();
      graphCtx.moveTo(pts[0].x, pts[0].y);
      graphCtx.lineTo(pts[1].x, pts[1].y);
      graphCtx.stroke();
      return;
    }

    const len = pts.length;
    const p0 = pts[len - 3];
    const p1 = pts[len - 2];
    const p2 = pts[len - 1];
    const mid1 = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
    const mid2 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

    graphCtx.beginPath();
    graphCtx.moveTo(mid1.x, mid1.y);
    graphCtx.quadraticCurveTo(p1.x, p1.y, mid2.x, mid2.y);
    graphCtx.stroke();
  }

  function redrawAllGraphStrokes() {
    drawGraphGrid();
    applyGraphStrokeStyle();
    graphStrokes.forEach((stroke) => drawFullStroke(graphCtx, denormalizeStroke(stroke)));
  }

  function resizeGraphCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = graphCanvas.getBoundingClientRect();
    graphLogicalWidth = rect.width;
    graphLogicalHeight = rect.height;

    graphCanvas.width = Math.round(rect.width * dpr);
    graphCanvas.height = Math.round(rect.height * dpr);
    graphCtx = graphCanvas.getContext('2d');
    graphCtx.scale(dpr, dpr);

    redrawAllGraphStrokes();
  }

  function updateGraphUIState() {
    const hasStrokes = graphStrokes.length > 0;
    const message = document.getElementById('graphFinishMessage');
    const replayBtn = document.getElementById('graphReplayBtn');
    if (message) {
      message.textContent = 'ทุกเส้นที่คุณวาด คือเรื่องราวที่คุณผ่านมา';
      message.classList.remove('graph-hint-warning');
      message.hidden = !hasStrokes;
    }
    if (replayBtn) replayBtn.hidden = !hasStrokes;
  }

  /** Gently prompts drawing first, instead of silently letting Continue skip past an empty canvas. */
  function showGraphNeedsDrawingHint() {
    const message = document.getElementById('graphFinishMessage');
    if (!message) return;
    message.textContent = 'ลองวาดเส้นทางของคุณก่อนนะ ค่อยบันทึกแล้วไปต่อ';
    message.classList.add('graph-hint-warning');
    message.hidden = false;
  }

  function isGraphLocked() {
    return Boolean(answers.sprintGraphLocked);
  }

  /** Once saved, the drawing becomes read-only — a one-time commitment rather than an editable form field. */
  function applyGraphLockUI() {
    const locked = isGraphLocked();
    if (graphCanvas) {
      graphCanvas.style.pointerEvents = locked ? 'none' : '';
      graphCanvas.classList.toggle('locked', locked);
    }
    const undoBtn = document.getElementById('graphUndoBtn');
    const clearBtn = document.getElementById('graphClearBtn');
    const saveBtn = document.getElementById('saveJourneyBtn');
    if (undoBtn) undoBtn.disabled = locked;
    if (clearBtn) clearBtn.disabled = locked;
    if (saveBtn) saveBtn.textContent = locked ? 'ไปต่อ' : 'บันทึกเส้นทาง';
  }

  function lockGraphCanvas() {
    answers.sprintGraphLocked = true;
    applyGraphLockUI();
  }

  function persistGraphSnapshot() {
    if (graphStrokes.length === 0) {
      delete answers.sprintGraphPoints;
      delete answers.sprintGraphImage;
    } else {
      answers.sprintGraphPoints = graphStrokes;
      answers.sprintGraphImage = graphCanvas.toDataURL('image/png');
    }
  }

  function onGraphPointerDown(e) {
    e.preventDefault();
    graphCanvas.setPointerCapture(e.pointerId);
    graphIsDrawing = true;
    graphCurrentStrokeRaw = [getCanvasPoint(e)];
    applyGraphStrokeStyle();
    const message = document.getElementById('graphFinishMessage');
    if (message) message.hidden = true;
  }

  function onGraphPointerMove(e) {
    if (!graphIsDrawing) return;
    e.preventDefault();
    graphCurrentStrokeRaw.push(getCanvasPoint(e));
    drawLiveSegment();
  }

  function onGraphPointerUp() {
    if (!graphIsDrawing) return;
    graphIsDrawing = false;
    if (graphCurrentStrokeRaw.length > 0) {
      graphStrokes.push(graphCurrentStrokeRaw.map(normalizePoint));
      persistGraphSnapshot();
      updateGraphUIState();
    }
    graphCurrentStrokeRaw = [];
  }

  function undoGraphStroke() {
    if (graphStrokes.length === 0) return;
    graphStrokes.pop();
    redrawAllGraphStrokes();
    persistGraphSnapshot();
    updateGraphUIState();
  }

  function resetGraphCanvas() {
    graphStrokes = [];
    if (graphCtx) redrawAllGraphStrokes();
    persistGraphSnapshot();
    updateGraphUIState();
    applyGraphLockUI(); // re-enables drawing if this reset came from restarting the whole journey
  }

  /** Replays the saved strokes by re-drawing their points progressively — no video, just the same data. */
  function replayGraphDrawing() {
    if (graphStrokes.length === 0) return;
    const replayBtn = document.getElementById('graphReplayBtn');
    replayBtn.disabled = true;

    const steps = [];
    graphStrokes.forEach((stroke, strokeIndex) => {
      denormalizeStroke(stroke).forEach((point) => steps.push({ point, strokeIndex }));
    });

    const drawnByStroke = graphStrokes.map(() => []);
    const pointsPerFrame = Math.max(1, Math.ceil(steps.length / 180)); // ~3s total regardless of point count
    let i = 0;

    function frame() {
      const frameEnd = Math.min(i + pointsPerFrame, steps.length);
      for (; i < frameEnd; i += 1) {
        drawnByStroke[steps[i].strokeIndex].push(steps[i].point);
      }

      drawGraphGrid();
      applyGraphStrokeStyle();
      drawnByStroke.forEach((pts) => drawFullStroke(graphCtx, pts));

      if (i < steps.length) {
        requestAnimationFrame(frame);
      } else {
        replayBtn.disabled = false;
      }
    }
    requestAnimationFrame(frame);
  }

  // A small offscreen render used only for the Google Form submission — a
  // Form text field has a practical size limit, and the full-resolution,
  // high-DPI canvas easily produces a 100KB+ base64 string. This trades
  // fidelity for something that reliably fits in a single answer.
  function buildGraphThumbnailDataUrl() {
    if (graphStrokes.length === 0) return '';
    const THUMB_W = 320;
    const THUMB_H = 120;
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = THUMB_W;
    thumbCanvas.height = THUMB_H;
    const ctx = thumbCanvas.getContext('2d');
    ctx.fillStyle = '#14192b';
    ctx.fillRect(0, 0, THUMB_W, THUMB_H);
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = GRAPH_STROKE_COLOR;
    graphStrokes.forEach((stroke) => {
      const pts = stroke.map((p) => ({ x: p.x * THUMB_W, y: p.y * THUMB_H }));
      drawFullStroke(ctx, pts);
    });
    return thumbCanvas.toDataURL('image/png');
  }

  function triggerDownload(href, filename) {
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  async function copyImageToClipboard(dataUrl) {
    const blob = await (await fetch(dataUrl)).blob();
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
  }

  function downloadGraphMarkdown(dataUrl) {
    const date = new Date().toLocaleDateString('th-TH-u-ca-gregory', { year: 'numeric', month: 'long', day: 'numeric' });
    const md = `# เส้นทางของฉัน\n\n_${date}_\n\n![เส้นทางที่วาดไว้](${dataUrl})\n`;
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    triggerDownload(url, 'sprint-graph.md');
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function buildGraphSummaryItem() {
    const item = document.createElement('div');
    item.className = 'summary-item';
    const h3 = document.createElement('h3');
    h3.textContent = 'เส้นทางที่คุณวาดไว้';
    item.appendChild(h3);

    const dataUrl = answers.sprintGraphImage;
    if (!dataUrl) {
      const p = document.createElement('p');
      p.textContent = 'ครั้งนี้ขอเงียบไว้ก่อนนะ';
      p.classList.add('empty-state');
      item.appendChild(p);
      return item;
    }

    const img = document.createElement('img');
    img.src = dataUrl;
    img.alt = 'เส้นกราฟความรู้สึกที่คุณวาดไว้';
    img.className = 'summary-graph-image';
    item.appendChild(img);

    const actions = document.createElement('div');
    actions.className = 'summary-graph-actions';

    const downloadPngBtn = document.createElement('button');
    downloadPngBtn.type = 'button';
    downloadPngBtn.className = 'btn-chip';
    downloadPngBtn.textContent = 'ดาวน์โหลด PNG';
    downloadPngBtn.addEventListener('click', () => {
      triggerDownload(dataUrl, 'sprint-graph.png');
      showCopyFeedback('ดาวน์โหลดรูปภาพแล้ว');
    });

    const copyImageBtn = document.createElement('button');
    copyImageBtn.type = 'button';
    copyImageBtn.className = 'btn-chip';
    copyImageBtn.textContent = 'คัดลอกรูปภาพ';
    copyImageBtn.addEventListener('click', async () => {
      try {
        await copyImageToClipboard(dataUrl);
        showCopyFeedback('คัดลอกรูปภาพแล้ว');
      } catch (err) {
        showCopyFeedback('คัดลอกไม่ได้ในเบราว์เซอร์นี้');
      }
    });

    const downloadMdBtn = document.createElement('button');
    downloadMdBtn.type = 'button';
    downloadMdBtn.className = 'btn-chip';
    downloadMdBtn.textContent = 'ดาวน์โหลด Markdown';
    downloadMdBtn.addEventListener('click', () => {
      downloadGraphMarkdown(dataUrl);
      showCopyFeedback('ดาวน์โหลด Markdown แล้ว');
    });

    actions.append(downloadPngBtn, copyImageBtn, downloadMdBtn);
    item.appendChild(actions);
    return item;
  }

  function bindSprintGraph() {
    graphCanvas = document.getElementById('sprintGraphCanvas');
    if (!graphCanvas) return;

    graphStrokes = answers.sprintGraphPoints || [];

    graphCanvas.addEventListener('pointerdown', onGraphPointerDown);
    graphCanvas.addEventListener('pointermove', onGraphPointerMove);
    graphCanvas.addEventListener('pointerup', onGraphPointerUp);
    graphCanvas.addEventListener('pointercancel', onGraphPointerUp);

    window.addEventListener('resize', () => {
      clearTimeout(graphResizeTimer);
      graphResizeTimer = setTimeout(resizeGraphCanvas, 200);
    });

    document.getElementById('graphUndoBtn').addEventListener('click', undoGraphStroke);
    document.getElementById('graphClearBtn').addEventListener('click', resetGraphCanvas);
    document.getElementById('graphReplayBtn').addEventListener('click', replayGraphDrawing);
    document.getElementById('saveJourneyBtn').addEventListener('click', () => {
      if (isGraphLocked()) {
        // Already saved on an earlier visit to this scene — nothing left to save, just continue.
        nextScene();
        return;
      }
      if (graphStrokes.length === 0) {
        showGraphNeedsDrawingHint();
        return;
      }
      persistGraphSnapshot();
      lockGraphCanvas();
      nextScene();
    });

    resizeGraphCanvas();
    updateGraphUIState();
    applyGraphLockUI();
  }

  // ---------------------------------------------------------------------
  // Summary / ending
  // ---------------------------------------------------------------------

  function renderSummary() {
    const summaryEl = document.getElementById('summary');
    summaryEl.innerHTML = '';

    summaryEl.appendChild(buildGraphSummaryItem());

    FIELDS.forEach((f) => {
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
  // Anonymous submission — posts into the team's shared Google Form/Sheet.
  // No name or identifier is ever attached to the payload.
  // ---------------------------------------------------------------------

  function submitAnonymousReflection() {
    const formData = new FormData();
    Object.entries(GOOGLE_FORM_ENTRY_IDS).forEach(([key, entryId]) => {
      formData.append(entryId, answers[key] || '');
    });
    if (GOOGLE_FORM_GRAPH_ENTRY_ID) {
      formData.append(GOOGLE_FORM_GRAPH_ENTRY_ID, answers.sprintGraphImage ? buildGraphThumbnailDataUrl() : '');
    }
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

  // ---------------------------------------------------------------------
  // Restart
  // ---------------------------------------------------------------------

  function restartJourney() {
    answers = {};

    document.querySelectorAll('[data-field]').forEach((el) => { el.value = ''; });
    document.getElementById('copyFeedback').textContent = '';
    resetGraphCanvas();

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
    // Clean up any answers a previous version of this app left in
    // localStorage — reloads are meant to always start blank now, and
    // that stored data (which can include a base64 image) would otherwise
    // just sit there unused indefinitely.
    try {
      localStorage.removeItem('walkThroughYourMind.answers.v1');
      localStorage.removeItem('walkThroughYourMind.currentScene.v1');
    } catch (err) { /* noop */ }

    buildParticles();
    buildFootsteps();
    bindFieldSync();
    bindSprintGraph();
    bindNavButtons();
    bindKeyboardNav();
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
