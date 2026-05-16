(() => {
  "use strict";

  // -------------------- Themes per OS --------------------

  const THEMES = {
    msdos: {
      name: "MS-DOS 6.22",
      bg: "#6a6dfe",
      bgDot: "#9a9dff",
      usedFill: "#ffffff",
      usedDot: "#6a6dfe",
      writing: "#ffff55",
      reading: "#ffff55",
      text: "#ffffff",
      heading: "#ffff55",
      border: "#ffffff",
      title: "Microsoft Defrag",
      footerLabel: "Drive C:",
      gridStyle: "classic",
    },
    win31: {
      name: "Windows 3.1",
      bg: "#0000a8",
      bgDot: "#5050b0",
      usedFill: "#e8e8e8",
      usedDot: "#0000a8",
      writing: "#ffff55",
      reading: "#ffff55",
      text: "#ffffff",
      heading: "#ffff55",
      border: "#c0c0c0",
      title: "Microsoft Defragmenter",
      footerLabel: "Drive C:",
      gridStyle: "classic",
    },
    win9x: {
      name: "Windows 9x",
      bg: "#000080",
      bgDot: "#4040a0",
      usedFill: "#f0f0f0",
      usedDot: "#000080",
      writing: "#ffff00",
      reading: "#ffff00",
      text: "#ffffff",
      heading: "#ffff00",
      border: "#c0c0c0",
      title: "Disk Defragmenter",
      footerLabel: "Drive C:",
      gridStyle: "classic",
    },
    winxp: {
      name: "Windows XP",
      bg: "#3a6ea5",
      bgDot: "#3a6ea5",
      usedFill: "#3060a8",
      usedDot: "#3060a8",
      writing: "#ffffff",
      reading: "#ffffff",
      text: "#ffffff",
      heading: "#ffffff",
      border: "#ffffff",
      title: "Disk Defragmenter",
      footerLabel: "(C:)",
      gridStyle: "bars",
      barFragmented: "#d44040",
      barContiguous: "#3060a8",
      barFree: "#ffffff",
      barUnmovable: "#3aa050",
    },
  };

  // -------------------- Cell states --------------------

  const S = {
    UNUSED: 0,
    USED: 1,
    WRITING: 2,
    READING: 3,
    UNMOVABLE: 4,
    BAD: 5,
  };

  // -------------------- DOM --------------------

  const startScreen = document.getElementById("start-screen");
  const defragScreen = document.getElementById("defrag-screen");
  const completeScreen = document.getElementById("complete-screen");
  const canvas = document.getElementById("defrag-canvas");
  const ctx = canvas.getContext("2d");

  const osSelect = document.getElementById("os-select");
  const durationSelect = document.getElementById("duration-select");
  const soundToggle = document.getElementById("sound-toggle");
  const fullscreenToggle = document.getElementById("fullscreen-toggle");
  const startBtn = document.getElementById("start-btn");
  const rerunBtn = document.getElementById("rerun-btn");
  const backBtn = document.getElementById("back-btn");
  const completeStats = document.getElementById("complete-stats");

  // -------------------- App state --------------------

  let theme = THEMES.msdos;
  let grid = [];
  let cols = 0;
  let rows = 0;
  let totalClusters = 0;
  let processedClusters = 0;
  let currentCluster = 0;
  let cellW = 0;
  let cellH = 0;
  let glyphFontSize = 16;
  let gridX = 0;
  let gridY = 0;
  let gridW = 0;
  let gridH = 0;

  let running = false;
  let startTime = 0;
  let elapsedMs = 0;
  let durationSec = 0;
  let soundOn = true;

  let rafId = 0;
  let stepIntervalMs = 350; // per-move duration (includes flashing)
  let opInProgress = null; // single in-flight move with flash phases
  let movesSinceSlow = 0; // counter for occasional slow-move variability

  let xpLastStepTime = 0;
  let xpStepIntervalMs = 80;

  // Background random flickers in the unfragmented area (purely cosmetic).
  let randomFlickers = [];
  let lastFlickerSpawn = 0;

  // XP-mode bar state
  let xpBarSegments = []; // array of state values (much smaller resolution)
  let xpStepIndex = 0;

  // -------------------- Audio --------------------

  let audioCtx = null;

  function ensureAudio() {
    if (!audioCtx) {
      try {
        audioCtx =
          new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        audioCtx = null;
      }
    }
  }

  function beep(freq, durationMs, volume = 0.04) {
    if (!soundOn || !audioCtx) return;
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "square";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.005);
    gain.gain.linearRampToValueAtTime(0, t + durationMs / 1000);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + durationMs / 1000 + 0.02);
  }

  // -------------------- Screen routing --------------------

  function showScreen(el) {
    [startScreen, defragScreen, completeScreen].forEach((s) =>
      s.classList.remove("active")
    );
    el.classList.add("active");
  }

  // -------------------- Canvas sizing --------------------

  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (running) {
      layoutGrid();
    }
  }

  // -------------------- Grid setup --------------------

  function layoutGrid() {
    const w = window.innerWidth;
    const h = window.innerHeight;

    if (theme.gridStyle === "bars") {
      // No grid for XP, just margins
      gridX = Math.round(w * 0.08);
      gridY = Math.round(h * 0.18);
      gridW = w - gridX * 2;
      gridH = Math.round(h * 0.32);
      return;
    }

    // Classic cluster grid layout
    // Reserve bottom area for status + legend boxes
    const statusHeight = Math.min(160, Math.max(110, h * 0.18));
    const margin = Math.min(40, w * 0.025);

    gridX = margin;
    gridY = margin;
    gridW = w - margin * 2;
    gridH = h - statusHeight - margin * 2;

    // Each cell is one short-ish rectangle (no internal divider). ~80 cols.
    const targetCellWidth = Math.max(11, Math.min(18, Math.floor(w / 90)));
    cellW = targetCellWidth;
    cellH = Math.round(cellW * 1.6);

    cols = Math.floor(gridW / cellW);
    rows = Math.floor(gridH / cellH);

    // Re-center
    const usedW = cols * cellW;
    const usedH = rows * cellH;
    gridX = Math.round((w - usedW) / 2);
    gridY = margin;
    gridW = usedW;
    gridH = usedH;

    // Compute a glyph font size that actually fits a single cell.
    // Start tall, then shrink until measureText fits within ~80% of cell width.
    const innerW = (cellW - 2) * 0.82;
    let f = Math.floor(cellH * 0.75);
    for (let i = 0; i < 12; i++) {
      ctx.font = `${f}px VT323, monospace`;
      const w0 = ctx.measureText("W").width;
      if (w0 <= innerW) break;
      f = Math.max(8, Math.floor(f * (innerW / w0)));
    }
    glyphFontSize = f;
  }

  function initGrid() {
    layoutGrid();

    if (theme.gridStyle === "bars") {
      // XP mode: a smaller "block" array representing the disk
      const numSegments = 240;
      xpBarSegments = new Array(numSegments);
      for (let i = 0; i < numSegments; i++) {
        const r = Math.random();
        if (r < 0.02) xpBarSegments[i] = S.UNMOVABLE;
        else if (r < 0.45) xpBarSegments[i] = S.USED; // fragmented bits
        else xpBarSegments[i] = S.UNUSED;
      }
      // Shuffle existing for a fragmented look
      totalClusters = xpBarSegments.filter((v) => v === S.USED).length;
      processedClusters = 0;
      currentCluster = 0;
      xpStepIndex = 0;
      return;
    }

    grid = new Array(cols * rows);
    // Build a fragmented disk: random mix of used / unused, a few unmovable
    let usedCount = 0;
    for (let i = 0; i < grid.length; i++) {
      const r = Math.random();
      if (r < 0.005) {
        grid[i] = S.UNMOVABLE;
      } else if (r < 0.45) {
        grid[i] = S.USED;
        usedCount++;
      } else {
        grid[i] = S.UNUSED;
      }
    }
    // Force the very first cell to be a marker of where we start
    totalClusters = usedCount;
    processedClusters = 0;
    currentCluster = 0;
    opInProgress = null;

    // Uniform pace, independent of selected duration. Each move takes this
    // long including its r/W flashing.
    stepIntervalMs = 550;
  }

  // -------------------- Defrag step --------------------

  function findNextDefragMove() {
    // Destination: first UNUSED slot (keeps consolidation packing left-to-right)
    let firstUnused = -1;
    for (let i = 0; i < grid.length; i++) {
      if (grid[i] === S.UNUSED) {
        firstUnused = i;
        break;
      }
    }
    if (firstUnused === -1) return null;

    // Source: pick a random USED cell from anywhere after the destination
    const candidates = [];
    for (let i = firstUnused + 1; i < grid.length; i++) {
      if (grid[i] === S.USED) candidates.push(i);
    }
    if (candidates.length === 0) return null;

    const src = candidates[Math.floor(Math.random() * candidates.length)];
    return { from: src, to: firstUnused };
  }

  function performDefragStep(now) {
    const move = findNextDefragMove();
    if (!move) return false;

    // Every ~4 moves (with a little jitter), this move takes 2x as long and
    // flashes more — gives the pacing a more natural, less mechanical feel.
    movesSinceSlow++;
    const isSlowMove = movesSinceSlow >= 3 + Math.floor(Math.random() * 3);
    if (isSlowMove) movesSinceSlow = 0;

    const thisStepMs = isSlowMove ? stepIntervalMs * 2 : stepIntervalMs;

    // Flash cycles scale with the move duration
    const flashCycles =
      thisStepMs < 220 ? 2 : thisStepMs < 420 ? 3 : thisStepMs < 750 ? 4 : 6;
    const totalPhases = flashCycles * 2;

    opInProgress = {
      from: move.from,
      to: move.to,
      startedAt: now,
      totalPhases,
      phaseMs: (thisStepMs * 0.85) / totalPhases,
      finalizeAt: now + thisStepMs,
      lastPhase: -1,
    };
    currentCluster = move.to;
    beep(880 + Math.random() * 240, 16);
    return true;
  }

  function getCellDisplay(idx, now) {
    if (opInProgress && idx === opInProgress.to) {
      const phase = Math.floor((now - opInProgress.startedAt) / opInProgress.phaseMs);
      if (phase >= opInProgress.totalPhases) return S.WRITING;
      if (phase !== opInProgress.lastPhase) {
        opInProgress.lastPhase = phase;
        beep(phase % 2 === 0 ? 720 : 540, 8, 0.025);
      }
      return phase % 2 === 0 ? S.WRITING : S.READING;
    }
    const flick = flickerStateFor(idx);
    if (flick !== null) return flick;
    return grid[idx];
  }

  function finalizeOpIfDue(now) {
    if (!opInProgress) return;
    if (now >= opInProgress.finalizeAt) {
      grid[opInProgress.from] = S.UNUSED;
      grid[opInProgress.to] = S.USED;
      processedClusters++;
      beep(440, 14, 0.04);
      opInProgress = null;
    }
  }

  function maybeSpawnFlicker(now) {
    // Spawn rate: roughly 6-10 new flickers per second, capped at 6 alive at once.
    if (randomFlickers.length >= 6) return;
    if (now - lastFlickerSpawn < 80 + Math.random() * 100) return;
    lastFlickerSpawn = now;

    // Pick a random USED cell that's not at the consolidation front.
    const minIdx = opInProgress ? opInProgress.to + 6 : 30;
    if (minIdx >= grid.length) return;
    // Try a few times to find a USED cell — cheaper than building a full list.
    for (let attempt = 0; attempt < 8; attempt++) {
      const idx = minIdx + Math.floor(Math.random() * (grid.length - minIdx));
      if (grid[idx] !== S.USED) continue;
      // Skip if already in a flicker.
      if (randomFlickers.some((f) => f.idx === idx)) continue;
      const variant = Math.random();
      randomFlickers.push({
        idx,
        startedAt: now,
        durationMs: 90 + Math.random() * 260,
        // 50%: flash 'r', 30%: flash 'W', 20%: briefly clear (looks like it vanished)
        display:
          variant < 0.5 ? S.READING : variant < 0.8 ? S.WRITING : S.UNUSED,
      });
      return;
    }
  }

  function cleanupFlickers(now) {
    for (let i = randomFlickers.length - 1; i >= 0; i--) {
      if (now - randomFlickers[i].startedAt >= randomFlickers[i].durationMs) {
        randomFlickers.splice(i, 1);
      }
    }
  }

  function flickerStateFor(idx) {
    for (const f of randomFlickers) {
      if (f.idx === idx) return f.display;
    }
    return null;
  }

  function performXpStep() {
    let firstUnused = -1;
    for (let i = 0; i < xpBarSegments.length; i++) {
      if (xpBarSegments[i] === S.UNUSED) {
        firstUnused = i;
        break;
      }
    }
    if (firstUnused === -1) return false;
    // Pick a random USED segment after the destination
    const candidates = [];
    for (let i = firstUnused + 1; i < xpBarSegments.length; i++) {
      if (xpBarSegments[i] === S.USED) candidates.push(i);
    }
    if (candidates.length === 0) return false;
    const src = candidates[Math.floor(Math.random() * candidates.length)];
    xpBarSegments[src] = S.UNUSED;
    xpBarSegments[firstUnused] = S.USED;
    processedClusters++;
    xpStepIndex = firstUnused;
    beep(660, 14);
    return true;
  }

  // -------------------- Render --------------------

  function clearBackground() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, w, h);

    if (theme.gridStyle === "classic") {
      // Subtle dotted/cross-hatched background within grid bounds (the "unused" texture)
      drawHatchPattern(gridX, gridY, gridW, gridH);
    }
  }

  function drawHatchPattern(x, y, w, h) {
    // Light dotted texture for unused space
    ctx.fillStyle = theme.bgDot;
    const step = 3;
    for (let yy = y; yy < y + h; yy += step) {
      for (let xx = x + ((yy / step) & 1 ? 0 : 1); xx < x + w; xx += 2) {
        ctx.fillRect(xx, yy, 1, 1);
      }
    }
  }

  function drawCell(col, row, state) {
    const x = gridX + col * cellW;
    const y = gridY + row * cellH;
    const pad = 1;
    const w = cellW - pad;
    const h = cellH - pad;

    if (state === S.UNUSED) {
      // leave as background hatch
      return;
    }

    if (state === S.WRITING) {
      ctx.fillStyle = theme.writing;
      ctx.fillRect(x, y, w, h);
      return;
    }

    if (state === S.READING) {
      ctx.fillStyle = theme.usedFill;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = "#c80000";
      ctx.font = `${glyphFontSize}px VT323, monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("r", x + w / 2, y + h / 2 + 1);
      return;
    }

    if (state === S.UNMOVABLE) {
      ctx.fillStyle = theme.usedFill;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = "#c00000";
      ctx.font = `${glyphFontSize}px VT323, monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("X", x + w / 2, y + h / 2 + 1);
      return;
    }

    if (state === S.BAD) {
      ctx.fillStyle = theme.usedFill;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = "#000000";
      ctx.font = `${glyphFontSize}px VT323, monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("B", x + w / 2, y + h / 2 + 1);
      return;
    }

    if (state === S.USED) {
      // Solid white block with a single dot in the center.
      ctx.fillStyle = theme.usedFill;
      ctx.fillRect(x, y, w, h);
      const dotSize = Math.max(1, Math.floor(cellW * 0.2));
      ctx.fillStyle = theme.usedDot;
      ctx.fillRect(
        x + Math.floor(w / 2) - Math.floor(dotSize / 2),
        y + Math.floor(h / 2) - Math.floor(dotSize / 2),
        dotSize,
        dotSize
      );
    }
  }

  function drawClassicGrid() {
    const now = performance.now();
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const idx = row * cols + col;
        const state = getCellDisplay(idx, now);
        if (state !== S.UNUSED) drawCell(col, row, state);
      }
    }
  }

  function formatTime(ms) {
    const totalSec = Math.floor(ms / 1000);
    const hh = String(Math.floor(totalSec / 3600)).padStart(2, "0");
    const mm = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
    const ss = String(totalSec % 60).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }

  function drawClassicChrome() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const margin = Math.min(40, w * 0.025);
    const boxY = gridY + gridH + margin / 2;
    const boxH = h - boxY - margin / 2;
    const statusW = Math.floor((w - margin * 3) * 0.55);
    const legendW = w - margin * 3 - statusW;
    const statusX = margin;
    const legendX = statusX + statusW + margin;

    drawBox(statusX, boxY, statusW, boxH, "Status");
    drawBox(legendX, boxY, legendW, boxH, "Legend");

    // Status content
    ctx.fillStyle = theme.text;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    const fontSize = Math.max(18, Math.min(26, Math.floor(boxH * 0.16)));
    ctx.font = `${fontSize}px VT323, monospace`;

    const sx = statusX + 16;
    let sy = boxY + 26;
    const pct = totalClusters > 0
      ? Math.min(100, Math.floor((processedClusters / totalClusters) * 100))
      : 0;
    ctx.fillText(`Cluster ${currentCluster}`, sx, sy);
    // Right-align percent
    ctx.textAlign = "right";
    ctx.fillText(`${pct}%`, statusX + statusW - 16, sy);
    ctx.textAlign = "left";

    // Progress bar (dotted)
    sy += fontSize + 8;
    const barX = sx;
    const barW = statusW - 32;
    const barH = Math.max(8, Math.floor(fontSize * 0.5));
    // bar background hatch
    for (let i = 0; i < barW; i += 2) {
      ctx.fillStyle = i % 4 === 0 ? theme.bgDot : theme.bg;
      ctx.fillRect(barX + i, sy, 1, barH);
    }
    // filled portion
    const filled = Math.floor((pct / 100) * barW);
    ctx.fillStyle = theme.usedFill;
    for (let i = 0; i < filled; i += 2) {
      ctx.fillRect(barX + i, sy, 1, barH);
    }

    sy += barH + 14;
    ctx.fillText(`Elapsed Time:  ${formatTime(elapsedMs)}`, sx, sy);
    sy += fontSize + 4;
    ctx.fillText("Full Optimization", sx, sy);

    // Legend content
    const lx = legendX + 16;
    let ly = boxY + 26;
    const colGap = Math.floor(legendW / 2);
    const itemFont = Math.max(16, Math.min(22, Math.floor(boxH * 0.14)));
    const rowGap = itemFont + 10;

    drawLegendItem(lx, ly, "Used", S.USED, itemFont);
    drawLegendItem(lx + colGap, ly, "Unused", S.UNUSED, itemFont);
    ly += rowGap;
    drawLegendItem(lx, ly, "Reading", S.READING, itemFont);
    drawLegendItem(lx + colGap, ly, "Writing", S.WRITING, itemFont);
    ly += rowGap;
    drawLegendItem(lx, ly, "Bad", S.BAD, itemFont);
    drawLegendItem(lx + colGap, ly, "Unmovable", S.UNMOVABLE, itemFont);
    ly += rowGap + 4;
    ctx.fillStyle = theme.text;
    ctx.font = `${itemFont}px VT323, monospace`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(
      `${theme.footerLabel}   1 block = ${Math.max(8, Math.round(totalClusters / Math.max(cols, 1)))} clusters`,
      lx,
      ly
    );
  }

  function drawLegendItem(x, y, label, state, fontPx) {
    const sampleH = Math.round(fontPx * 1.1);
    const sampleW = Math.round(sampleH * 0.72);

    // Icon swatch — matches how the cell renders in the grid
    if (state === S.USED) {
      ctx.fillStyle = theme.usedFill;
      ctx.fillRect(x, y, sampleW, sampleH);
      const ds = Math.max(2, Math.floor(sampleW * 0.22));
      ctx.fillStyle = theme.usedDot;
      ctx.fillRect(
        x + Math.floor(sampleW / 2 - ds / 2),
        y + Math.floor(sampleH / 2 - ds / 2),
        ds,
        ds
      );
    } else if (state === S.UNUSED) {
      drawHatchPattern(x, y, sampleW, sampleH);
    } else if (state === S.WRITING) {
      ctx.fillStyle = theme.writing;
      ctx.fillRect(x, y, sampleW, sampleH);
    } else if (state === S.READING || state === S.UNMOVABLE || state === S.BAD) {
      ctx.fillStyle = theme.usedFill;
      ctx.fillRect(x, y, sampleW, sampleH);
      const ch = state === S.READING ? "r" : state === S.BAD ? "B" : "X";
      ctx.fillStyle = state === S.BAD ? "#000000" : "#c80000";
      ctx.font = `${Math.floor(sampleH * 0.85)}px VT323, monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(ch, x + sampleW / 2, y + sampleH / 2 + 1);
    }

    // Label — vertically centered with the icon
    ctx.fillStyle = theme.text;
    ctx.font = `${fontPx}px VT323, monospace`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(`- ${label}`, x + sampleW + 10, y + sampleH / 2 + 1);
  }

  function drawBox(x, y, w, h, title) {
    // Double-line border
    ctx.strokeStyle = theme.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.strokeRect(x + 3.5, y + 3.5, w - 7, h - 7);

    // Title centered on top border
    const titleFont = `${Math.max(18, Math.min(26, Math.floor(h * 0.16)))}px VT323, monospace`;
    ctx.font = titleFont;
    const metrics = ctx.measureText(` ${title} `);
    const tx = x + w / 2 - metrics.width / 2;
    ctx.fillStyle = theme.bg;
    ctx.fillRect(tx, y - 4, metrics.width, 18);
    ctx.fillStyle = theme.heading;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(title, x + w / 2, y - 6);
  }

  // -------- XP-style render --------

  function drawXp() {
    const w = window.innerWidth;
    const h = window.innerHeight;

    // Title bar
    ctx.fillStyle = "#ece9d8";
    ctx.fillRect(0, 0, w, 32);
    ctx.fillStyle = "#0a246a";
    ctx.font = "20px VT323, monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("  Disk Defragmenter — (C:)", 8, 16);

    // Section labels
    ctx.fillStyle = "#ffffff";
    ctx.font = "20px VT323, monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("Estimated disk usage before defragmentation:", gridX, gridY - 28);
    ctx.fillText(
      "Estimated disk usage after defragmentation:",
      gridX,
      gridY + gridH + 24
    );

    // Two bars: "before" (the original fragmented) and "after" (current state)
    // We'll keep "before" frozen so it's a reference
    if (!drawXp._before) {
      drawXp._before = xpBarSegments.slice();
    }
    drawBar(gridX, gridY, gridW, 60, drawXp._before);
    drawBar(gridX, gridY + gridH - 60, gridW, 60, xpBarSegments);

    // Status text
    const pct = totalClusters > 0
      ? Math.min(100, Math.floor((processedClusters / totalClusters) * 100))
      : 0;
    ctx.fillStyle = "#ffffff";
    ctx.font = "22px VT323, monospace";
    ctx.textAlign = "left";
    ctx.fillText(
      `Defragmenting...  ${pct}%   Elapsed:  ${formatTime(elapsedMs)}`,
      gridX,
      gridY + gridH + 90
    );

    // Legend
    const ly = gridY + gridH + 130;
    drawXpLegend(gridX, ly, theme.barFragmented, "Fragmented files");
    drawXpLegend(gridX + 220, ly, theme.barContiguous, "Contiguous files");
    drawXpLegend(gridX + 440, ly, theme.barUnmovable, "Unmovable files");
    drawXpLegend(gridX + 660, ly, theme.barFree, "Free space");
  }

  function drawXpLegend(x, y, color, label) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 18, 14);
    ctx.strokeStyle = "#ffffff";
    ctx.strokeRect(x + 0.5, y + 0.5, 17, 13);
    ctx.fillStyle = "#ffffff";
    ctx.font = "18px VT323, monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(label, x + 24, y - 1);
  }

  function drawBar(x, y, w, h, segments) {
    // White outline + content
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    const segW = w / segments.length;
    for (let i = 0; i < segments.length; i++) {
      let c;
      const s = segments[i];
      if (s === S.UNUSED) c = theme.barFree;
      else if (s === S.UNMOVABLE) c = theme.barUnmovable;
      else if (s === S.USED) {
        // Heuristic: fragmented if surrounded by unused, contiguous if has used neighbors
        const left = i > 0 ? segments[i - 1] : S.UNUSED;
        const right = i < segments.length - 1 ? segments[i + 1] : S.UNUSED;
        const contig = left === S.USED || right === S.USED;
        c = contig ? theme.barContiguous : theme.barFragmented;
      } else c = theme.barFree;
      ctx.fillStyle = c;
      ctx.fillRect(x + i * segW, y, Math.ceil(segW) + 1, h);
    }
  }

  // -------------------- Main loop --------------------

  function render() {
    clearBackground();
    if (theme.gridStyle === "classic") {
      drawClassicGrid();
      drawClassicChrome();
    } else {
      drawXp();
    }
  }

  function tick(now) {
    if (!running) return;
    elapsedMs = now - startTime;

    if (theme.gridStyle === "classic") {
      finalizeOpIfDue(now);
      maybeSpawnFlicker(now);
      cleanupFlickers(now);
      if (!opInProgress) {
        const moved = performDefragStep(now);
        if (!moved) {
          // Finished a pass. Refragment lightly and keep going until duration cap.
          refragmentLightly();
        }
      }
    } else {
      if (now - xpLastStepTime >= xpStepIntervalMs) {
        const moved = performXpStep();
        xpLastStepTime = now;
        if (!moved) {
          if (durationSec === 0) {
            refragmentLightly();
          } else if (elapsedMs / 1000 >= durationSec * 0.95) {
            finishRun();
            return;
          }
        }
      }
    }

    // Hard duration cap (so users still finish at their selected time)
    if (durationSec > 0 && elapsedMs / 1000 >= durationSec) {
      finishRun();
      return;
    }

    render();
    rafId = requestAnimationFrame(tick);
  }

  function refragmentLightly() {
    if (theme.gridStyle === "classic") {
      // Re-fragment by moving some used cells back to random unused positions
      const usedIdx = [];
      const unusedIdx = [];
      for (let i = 0; i < grid.length; i++) {
        if (grid[i] === S.USED) usedIdx.push(i);
        else if (grid[i] === S.UNUSED) unusedIdx.push(i);
      }
      const toMove = Math.min(Math.floor(usedIdx.length * 0.4), unusedIdx.length);
      for (let k = 0; k < toMove; k++) {
        const fromI = usedIdx[Math.floor(Math.random() * usedIdx.length)];
        const toI = unusedIdx[Math.floor(unusedIdx.length * 0.3 +
          Math.random() * unusedIdx.length * 0.7)];
        if (toI === undefined) continue;
        if (grid[fromI] === S.USED && grid[toI] === S.UNUSED) {
          grid[fromI] = S.UNUSED;
          grid[toI] = S.USED;
        }
      }
      processedClusters = 0;
    } else {
      for (let i = 0; i < xpBarSegments.length; i++) {
        if (xpBarSegments[i] === S.USED && Math.random() < 0.5) {
          // pick a random later spot
          const target = Math.floor(
            i + 1 + Math.random() * (xpBarSegments.length - i - 1)
          );
          if (target < xpBarSegments.length && xpBarSegments[target] === S.UNUSED) {
            xpBarSegments[i] = S.UNUSED;
            xpBarSegments[target] = S.USED;
          }
        }
      }
      processedClusters = 0;
    }
  }

  // -------------------- Run lifecycle --------------------

  async function startRun() {
    theme = THEMES[osSelect.value] || THEMES.msdos;
    durationSec = parseInt(durationSelect.value, 10) || 0;
    soundOn = soundToggle.checked;

    if (soundOn) ensureAudio();

    showScreen(defragScreen);

    if (fullscreenToggle.checked && document.documentElement.requestFullscreen) {
      try {
        await document.documentElement.requestFullscreen();
      } catch (e) {
        /* user denied or unsupported */
      }
    }

    resizeCanvas();
    initGrid();
    drawXp._before = null;

    running = true;
    startTime = performance.now();
    xpLastStepTime = startTime;
    elapsedMs = 0;
    randomFlickers = [];
    lastFlickerSpawn = 0;
    movesSinceSlow = 0;
    rafId = requestAnimationFrame(tick);
  }

  function stopRun() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function finishRun() {
    stopRun();
    const pct = totalClusters > 0
      ? Math.min(100, Math.floor((processedClusters / totalClusters) * 100))
      : 100;
    completeStats.textContent =
      `${theme.name}  •  ${pct}% optimized  •  Elapsed ${formatTime(elapsedMs)}`;
    showScreen(completeScreen);
    beep(880, 60);
    setTimeout(() => beep(1320, 80), 70);
  }

  function exitToStart() {
    stopRun();
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    showScreen(startScreen);
  }

  // -------------------- Events --------------------

  startBtn.addEventListener("click", () => {
    startRun();
  });

  rerunBtn.addEventListener("click", () => {
    startRun();
  });

  backBtn.addEventListener("click", () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    showScreen(startScreen);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (defragScreen.classList.contains("active")) {
        exitToStart();
      } else if (completeScreen.classList.contains("active")) {
        showScreen(startScreen);
      }
    }
    if (e.key === "Enter" && startScreen.classList.contains("active")) {
      startRun();
    }
  });

  window.addEventListener("resize", () => {
    resizeCanvas();
  });

  document.addEventListener("fullscreenchange", () => {
    // When user exits fullscreen via browser, also stop the run
    if (!document.fullscreenElement && running) {
      // Don't auto-stop — user might just want windowed mode.
      // But trigger a resize so canvas refits.
      resizeCanvas();
    }
  });

  // -------------------- Settings persistence --------------------

  const STORAGE_KEY = "defrag-screensaver-settings";

  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (s.os && THEMES[s.os]) osSelect.value = s.os;
      if (s.duration && [...durationSelect.options].some((o) => o.value === s.duration)) {
        durationSelect.value = s.duration;
      }
      if (typeof s.sound === "boolean") soundToggle.checked = s.sound;
      if (typeof s.fullscreen === "boolean") fullscreenToggle.checked = s.fullscreen;
    } catch (e) {
      /* corrupted storage — ignore */
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          os: osSelect.value,
          duration: durationSelect.value,
          sound: soundToggle.checked,
          fullscreen: fullscreenToggle.checked,
        })
      );
    } catch (e) {
      /* storage full or disabled — ignore */
    }
  }

  [osSelect, durationSelect, soundToggle, fullscreenToggle].forEach((el) => {
    el.addEventListener("change", saveSettings);
  });

  loadSettings();

  // Initial sizing
  resizeCanvas();

  // Re-measure glyph fit once the custom font loads so the r/W fit perfectly.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      if (running) layoutGrid();
    });
  }
})();
