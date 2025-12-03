import React, { useEffect, useState, useMemo } from 'react';

// ---- power spectrum helpers (fast proxy) ----
const SCALES = [1, 2, 3, 4, 6, 8, 12]; // blur radii ~ “ell” increases to the right

function normalize01(arr) {
  if (!arr || arr.length === 0) return [];
  const lo = Math.min(...arr), hi = Math.max(...arr);
  if (hi - lo < 1e-9) return arr.map(() => 0);
  return arr.map(v => (v - lo) / (hi - lo));
}

function blurAtRadius(src, r) {
  if (r <= 0) return src.map(row => [...row]);
  const w = src.length, h = src[0].length;
  const out = Array.from({ length: w }, () => Array(h).fill(0));
  const d = 2 * r + 1, area = d * d;

  for (let i = 0; i < w; i++) {
    for (let j = 0; j < h; j++) {
      let sum = 0;
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          const x = Math.min(w - 1, Math.max(0, i + dx));
          const y = Math.min(h - 1, Math.max(0, j + dy));
          sum += src[x][y];
        }
      }
      out[i][j] = sum / area;
    }
  }
  return out;
}

function variance2D(arr) {
  const w = arr.length, h = arr[0].length;
  let sum = 0, sum2 = 0, n = w * h;
  for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) {
    const v = arr[i][j];
    sum += v; sum2 += v * v;
  }
  const mean = sum / n;
  return sum2 / n - mean * mean;
}

// simple two-line SVG chart (blue=current, gray dashed=target)
function SpectrumChart({ current, target, labels, width = 360, height = 160 }) {
  const pad = 28, w = width - 2 * pad, h = height - 2 * pad;
  const n = Math.max(current?.length || 0, target?.length || 0);
  const x = (i) => pad + (i / Math.max(1, n - 1)) * w;
  const y = (v) => pad + (1 - v) * h;
  const path = (data) =>
    (data || []).map((v, i) => `${i ? 'L' : 'M'} ${x(i)} ${y(v)}`).join(' ');

  return (
    <svg width={width} height={height}>
      {/* axes */}
      <line x1={pad} y1={pad} x2={pad} y2={pad + h} stroke="#9CA3AF" />
      <line x1={pad} y1={pad + h} x2={pad + w} y2={pad + h} stroke="#9CA3AF" />

      {/* target = gray dashed */}
      {target && target.length > 0 && (
        <path
          d={path(target)}
          fill="none"
          stroke="#9CA3AF"
          strokeWidth="2"
          strokeDasharray="4 4"
        />
      )}

      {/* current = blue */}
      {current && current.length > 0 && (
        <path
          d={path(current)}
          fill="none"
          stroke="#3B82F6"
          strokeWidth="2"
        />
      )}

      <text x={pad} y={16} fontSize="12" fill="#111827">
        Power Spectrum — blue: you · gray: CMB (WMAP)
      </text>

      {/* tick labels */}
      {labels && labels.length > 0 && (() => {
        const ticks = labels;
        return ticks.map((lab, k) => {
          const i = Math.round((k * (n - 1)) / Math.max(1, ticks.length - 1));
          return (
            <text
              key={k}
              x={x(i)}
              y={pad + h + 14}
              fontSize="10"
              textAnchor="middle"
              fill="#6B7280"
            >
              {lab}
            </text>
          );
        });
      })()}
    </svg>
  );
}

function resampleToLength(arr, L) {
  // linear resample [0..N-1] -> [0..L-1]
  const N = arr.length;
  if (N === 0 || L === 0) return Array(L).fill(0);
  const out = [];
  for (let i = 0; i < L; i++) {
    const x = (i * (N - 1)) / (L - 1);
    const i0 = Math.floor(x), i1 = Math.min(N - 1, i0 + 1);
    const t = x - i0;
    out.push(arr[i0] * (1 - t) + arr[i1] * t);
  }
  return out;
}

function pickTicks(ellArray, maxTicks = 8) {
  if (!ellArray || ellArray.length === 0) return [];
  if (ellArray.length <= maxTicks) return ellArray;
  const step = Math.floor(ellArray.length / (maxTicks - 1));
  const ticks = [];
  for (let i = 0; i < ellArray.length; i += step) ticks.push(ellArray[i]);
  if (ticks[ticks.length - 1] !== ellArray[ellArray.length - 1]) {
    ticks.push(ellArray[ellArray.length - 1]);
  }
  return ticks;
}

// --- brush config ---
const BRUSHES = {
  MEDIUM: 'medium',
  TINY: 'tiny',
  ERASE: 'erase',
};

const GRID_SIZE = 64;
const MAX_TEMP = 3;
const MIN_TEMP = -3;

// Gaussian helper
function applyGaussianBump(grid, row, col, radius, amplitude) {
  const newGrid = grid.map((r) => [...r]);
  const sigma = radius / 2;
  const rMax = Math.ceil(radius);

  for (let dx = -rMax; dx <= rMax; dx++) {
    for (let dy = -rMax; dy <= rMax; dy++) {
      const x = row + dx;
      const y = col + dy;
      if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE) continue;

      const r2 = dx * dx + dy * dy;
      if (r2 > radius * radius) continue;

      const value = amplitude * Math.exp(-r2 / (2 * sigma * sigma));
      const updated = Math.max(
        MIN_TEMP,
        Math.min(MAX_TEMP, newGrid[x][y] + value)
      );
      newGrid[x][y] = updated;
    }
  }

  return newGrid;
}

// Soft erase toward 0
function applyGaussianErase(grid, row, col, radius) {
  const newGrid = grid.map((r) => [...r]);
  const sigma = radius / 2;
  const rMax = Math.ceil(radius);

  for (let dx = -rMax; dx <= rMax; dx++) {
    for (let dy = -rMax; dy <= rMax; dy++) {
      const x = row + dx;
      const y = col + dy;
      if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE) continue;

      const r2 = dx * dx + dy * dy;
      if (r2 > radius * radius) continue;

      const w = Math.exp(-r2 / (2 * sigma * sigma)); // weight 0–1
      const val = newGrid[x][y];
      const erased = val * (1 - 0.7 * w); // move 70% toward 0 in center
      newGrid[x][y] = erased;
    }
  }

  return newGrid;
}

export default function CosmicOriginTutorial({ onRestart }) {
  const [targetSpectrum, setTargetSpectrum] = useState([]);
  const [grid, setGrid] = useState(
    // tiny initial fluctuations ~ like real CMB (~1e-5 but here exaggerated)
    Array.from({ length: GRID_SIZE }, () =>
      Array.from(
        { length: GRID_SIZE },
        () => -2 + (Math.random() - 0.5) * 0.4 // between -0.1 and +0.1
      )
    )
  );
  const [brush, setBrush] = useState(BRUSHES.MEDIUM);
  const [isPainting, setIsPainting] = useState(false);

  // Load target WMAP spectrum once on mount
  useEffect(() => {
    fetch(`${process.env.PUBLIC_URL}/wmap_tt_binned.json`)
      .then((r) => r.json())
      .then(setTargetSpectrum)
      .catch(() => setTargetSpectrum([]));
  }, []);

  // ---- derive current spectrum from grid state ----
  const currentSpectrum = useMemo(() => {
    const vals = SCALES.map((r) => variance2D(blurAtRadius(grid, r)));
    return normalize01(vals);
  }, [grid]);

  // prepare target spectrum and sparse ticks
  const sorted = [...targetSpectrum].sort(
    (a, b) => (a.ell ?? a.l) - (b.ell ?? b.l)
  );
  const targetEll = sorted.map((d) => d.ell ?? d.l);
  const targetClRaw = sorted.map((d) => d.cl ?? d.CL ?? d.Cl ?? 0);
  const targetClNorm = normalize01(targetClRaw);
  const tickLabels = pickTicks(targetEll, 7);

  const targetResampled = useMemo(() => {
    if (!targetClNorm.length || !currentSpectrum.length) return [];
    return normalize01(
      resampleToLength(targetClNorm, currentSpectrum.length)
    );
  }, [targetClNorm, currentSpectrum.length]);

  // Color map using clamped HSL
  const getColor = (temp) => {
    const clamped = Math.max(MIN_TEMP, Math.min(MAX_TEMP, temp));
    const norm = (clamped - MIN_TEMP) / (MAX_TEMP - MIN_TEMP);
    const hue = 240 - norm * 240; // blue → red
    const lightness = 50 + (norm - 0.5) * 20;
    return `hsl(${hue}, 100%, ${lightness}%)`;
  };

  // Paint handler for the "spectrum playground"
  const paintAt = (row, col) => {
    if (row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE) return;

    if (brush === BRUSHES.MEDIUM) {
      // Medium brush: main acoustic peak
      const radius = 5;
      const amplitude = 1.2;
      setGrid((prev) => applyGaussianBump(prev, row, col, radius, amplitude));
    } else if (brush === BRUSHES.TINY) {
      // Tiny brush: small-scale power
      const radius = 2;
      const amplitude = 0.7;
      setGrid((prev) => applyGaussianBump(prev, row, col, radius, amplitude));
    } else if (brush === BRUSHES.ERASE) {
      const radius = 4;
      setGrid((prev) => applyGaussianErase(prev, row, col, radius));
    }
  };

  return (
    <div className="p-4 text-center">
      <h1 className="text-2xl font-bold mb-1">Spectrum Playground: Sculpt the CMB</h1>
      <p className="text-gray-600 mb-1">
        Paint temperature fluctuations and watch how the CMB power spectrum reacts.
      </p>
      <p className="text-blue-500 font-mono text-sm mb-4">
        Universe Age: 380 kyr (CMB snapshot — no time evolution here)
      </p>

      {/* Layout: grid + controls on top, spectrum below */}
      <div className="flex flex-col items-center gap-4 md:flex-row md:justify-center md:items-start">
        {/* Left: CMB Grid + brushes */}
        <div className="flex flex-col items-center gap-3">
          {/* Brush selector with symbols */}
<div className="inline-flex rounded-md shadow-sm border border-gray-300 overflow-hidden">
  {/* Medium brush: single medium dot */}
  <button
    onClick={() => setBrush(BRUSHES.MEDIUM)}
    className={
      'px-3 py-1 text-xs font-medium ' +
      (brush === BRUSHES.MEDIUM
        ? 'bg-blue-600 text-white'
        : 'bg-white text-gray-700 hover:bg-gray-100')
    }
    aria-label="Medium blobs"
  >
    <div className="flex flex-col items-center">
      <span className="inline-block w-3 h-3 rounded-full bg-white mb-0.5" />
      <span className="text-[10px] leading-none">Med</span>
    </div>
  </button>

  {/* Tiny brush: several tiny dots */}
  <button
    onClick={() => setBrush(BRUSHES.TINY)}
    className={
      'px-3 py-1 text-xs font-medium border-l border-gray-300 ' +
      (brush === BRUSHES.TINY
        ? 'bg-blue-600 text-white'
        : 'bg-white text-gray-700 hover:bg-gray-100')
    }
    aria-label="Tiny ripples"
  >
    <div className="flex flex-col items-center">
      <span className="flex gap-[2px] mb-0.5">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-white" />
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-white" />
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-white" />
      </span>
      <span className="text-[10px] leading-none">Tiny</span>
    </div>
  </button>

  {/* Eraser: little white rectangle */}
  <button
    onClick={() => setBrush(BRUSHES.ERASE)}
    className={
      'px-3 py-1 text-xs font-medium border-l border-gray-300 ' +
      (brush === BRUSHES.ERASE
        ? 'bg-blue-600 text-white'
        : 'bg-white text-gray-700 hover:bg-gray-100')
    }
    aria-label="Eraser"
  >
    <div className="flex flex-col items-center">
      <span className="inline-block w-4 h-2 bg-white mb-0.5 rounded-sm border border-gray-200" />
      <span className="text-[10px] leading-none">Erase</span>
    </div>
  </button>
</div>

          {/* CMB Grid */}
            <div
              className="border border-gray-700 mx-auto"
              style={{
                width: 'min(100%, 520px)',     // make it BIG
                height: 'min(70vh, 520px)',    // keep it roughly square
              }}
              onMouseDown={() => setIsPainting(true)}
              onMouseUp={() => setIsPainting(false)}
              onMouseLeave={() => setIsPainting(false)}
            >
              <div
                className="grid"
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)`,
                  width: '100%',
                  height: '100%',              // fill the square
                }}
              >
                {grid.map((row, rowIndex) =>
                  row.map((cell, colIndex) => (
                    <div
                      key={`${rowIndex}-${colIndex}`}
                      onMouseDown={() => paintAt(rowIndex, colIndex)}
                      onMouseEnter={() => {
                        if (isPainting) paintAt(rowIndex, colIndex);
                      }}
                      style={{
                        width: '100%',
                        height: '100%',
                        backgroundColor: getColor(cell),
                        transition: 'background-color 0.2s ease',
                      }}
                    />
                  ))
                )}
              </div>
            </div>


          {/* Restart button */}
          <button
            onClick={onRestart}
            className="mt-2 px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-800 text-sm"
          >
            Restart Level
          </button>
        </div>

        {/* Right: Power spectrum + teaching text */}
        <div className="mt-4 md:mt-0 max-w-xl mx-auto">
          <div className="rounded-lg shadow-sm border border-gray-200 p-3">
            <h2 className="text-lg font-semibold mb-1">CMB Power Spectrum</h2>
            <p className="text-xs text-gray-500 mb-2">
              Blue = your fluctuation field · Gray = WMAP target.
              Use different brushes to shape the peaks.
            </p>

            <SpectrumChart
              current={currentSpectrum}
              target={targetResampled}
              labels={tickLabels}
            />

            {/* Training-wheel hints */}
            <div className="mt-3 text-xs text-gray-700 text-left space-y-1">
              <p className="font-semibold">How to control the peaks:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>
                  <span className="font-semibold">Medium blobs</span> mostly
                  change the big hump (first acoustic peak).
                </li>
                <li>
                  <span className="font-semibold">Tiny ripples</span> raise the
                  right-hand side (small-scale structure).
                </li>
                <li>
                  <span className="font-semibold">Eraser</span> softens
                  fluctuations and lowers power where you painted too much.
                </li>
              </ul>
            </div>

            <ul className="mt-3 text-xs text-gray-600 list-disc list-inside">
              <li>Left ≈ large angular scales (low ℓ)</li>
              <li>Right ≈ small angular scales (high ℓ)</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
