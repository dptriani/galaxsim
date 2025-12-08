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
const BASE_TEMP = -2.0;

// --- visual-only speckle texture (persistent) ---
const noiseField = Array.from({ length: GRID_SIZE }, () =>
  Array.from({ length: GRID_SIZE }, () => Math.random() * 2 - 1)
);


// toy CMB spectrum: big first peak, smaller later peaks
const WMAP_TOY = [
  { ell: 2,   cl: 900 },
  { ell: 22,  cl: 950 },
  { ell: 76,  cl: 1400 },
  { ell: 172, cl: 5600 }, // main acoustic peak
  { ell: 250, cl: 4200 },
  { ell: 332, cl: 2600 }, // 2nd peak
  { ell: 450, cl: 2100 },
  { ell: 625, cl: 1600 }, // 3rd-ish peak
  { ell: 800, cl: 1200 },
  { ell: 975, cl: 900 },
  { ell: 1150, cl: 700 },
];

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

// Speckle brush: spray several Gaussian bumps around the cursor
function applySpeckleBrush(grid, row, col, { count, radius, amplitude }) {
  let newGrid = grid;

  for (let n = 0; n < count; n++) {
    const angle = Math.random() * 2 * Math.PI;
    const dist = Math.random() * radius * 1.5; // spread around the center

    const r = row + Math.round(Math.cos(angle) * dist);
    const c = col + Math.round(Math.sin(angle) * dist);

    // skip if outside grid
    if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) continue;

    newGrid = applyGaussianBump(newGrid, r, c, radius, amplitude);
  }

  return newGrid;
}

// ---- toy CMB spectrum in angle space (for gray dashed line) ----

// we'll sample 80 points from left (large angle) to right (small angle)
const TARGET_LEN = 80;

// x in [0, 1] where 0 = large angles (~90 deg), 1 = small angles (~0.07 deg)
function toyCMBShape01(x) {
  // gentle baseline that rises then falls a bit
  let y = 0.15 + 0.05 * Math.cos(Math.PI * x);

  // big first peak around x ~ 0.35 (angle ~ 1 deg)
  y += 1.0 * Math.exp(-Math.pow((x - 0.35) / 0.08, 2));

  // smaller second bump around x ~ 0.58
  y += 0.40 * Math.exp(-Math.pow((x - 0.58) / 0.06, 2));

  // another small bump around x ~ 0.74
  y += 0.25 * Math.exp(-Math.pow((x - 0.74) / 0.05, 2));

  // little extra tail lift
  y += 0.10 * Math.exp(-Math.pow((x - 0.90) / 0.04, 2));

  return y;
}

function buildToyCMBTarget() {
  const vals = [];
  for (let i = 0; i < TARGET_LEN; i++) {
    const x = i / (TARGET_LEN - 1); // 0 → 1
    vals.push(toyCMBShape01(x));
  }
  return normalize01(vals); // reuse your existing normalize01
}

// nice angle tick labels to show on the x-axis
const ANGLE_TICKS = ['90°', '2°', '0.5°', '0.2°'];

export default function CosmicOriginTutorial({ onRestart }) {
  const [targetSpectrum, setTargetSpectrum] = useState(WMAP_TOY);
  const [grid, setGrid] = useState(
    Array.from({ length: GRID_SIZE }, () =>
      Array.from({ length: GRID_SIZE }, () => BASE_TEMP)
    )
  );

  const [brush, setBrush] = useState(BRUSHES.MEDIUM);
  const [isPainting, setIsPainting] = useState(false);

  const resetGrid = () =>
    Array.from({ length: GRID_SIZE }, () =>
      Array.from({ length: GRID_SIZE }, () => BASE_TEMP)
    );


    const handleRestartClick = () => {
      setGrid(resetGrid());
      setBrush(BRUSHES.MEDIUM);
      setIsPainting(false);
    };


  // ---- 5-band power extraction from the map ----
  const bandPowers = useMemo(() => {
    if (!grid || !grid.length) return [0, 0, 0, 0, 0];

    // progressively less-blurred maps to isolate different scales
    const blurL  = blurAtRadius(grid, 10); // very large scales
    const blurM1 = blurAtRadius(grid, 6);  // first-peak-ish
    const blurM2 = blurAtRadius(grid, 4);  // second bump
    const blurM3 = blurAtRadius(grid, 2);  // third / small scales

    const vL  = variance2D(blurL);
    const vM1 = variance2D(blurM1);
    const vM2 = variance2D(blurM2);
    const vM3 = variance2D(blurM3);
    const vS  = variance2D(grid); // smallest scales (no blur)

    // 5 non-overlapping "bands" of power
    const band0 = vL;                     // large-scale baseline
    const band1 = Math.max(0, vM1 - vL);  // first peak band
    const band2 = Math.max(0, vM2 - vM1); // second bump band
    const band3 = Math.max(0, vM3 - vM2); // third bump band
    const band4 = Math.max(0, vS  - vM3); // tiny-scale tail

    return [band0, band1, band2, band3, band4];
  }, [grid]);

  // ---- smooth blue spectrum built from the 5 bands ----
    const currentSpectrum = useMemo(() => {
      if (!bandPowers || bandPowers.length !== 5) {
        return Array(TARGET_LEN).fill(0);
      }

      const [b0, b1, b2, b3, b4] = bandPowers;

      // total variance of the field (sum of bands telescopes to vS)
      const totalVar = b0 + b1 + b2 + b3 + b4;
      if (totalVar <= 1e-8) {
        return Array(TARGET_LEN).fill(0);
      }

      // Expected CMB-like fraction of power in each band (tweak by feel)
      //   band0: very large-scale baseline
      //   band1: first peak (should be biggest)
      //   band2: second bump
      //   band3: third bump
      //   band4: tiny-scale tail
      const expectedFrac = [0.18, 0.36, 0.22, 0.14, 0.10]; // sums to ~1

      // Extra "visual gain" per band: how strongly each knob moves the curve
      const bandGain = [0.8, 1.3, 1.0, 0.9, 1.1];

      const bands = [b0, b1, b2, b3, b4];

      // Turn each band into an independent knob Ai ~ [0, 1+]
      const A = bands.map((b, i) => {
        const target = expectedFrac[i] * totalVar + 1e-8; // avoid div by 0
        const raw = b / target;        // 1 ≈ "CMB-like", <1 low, >1 high
        const scaled = bandGain[i] * raw;

        // Allow slightly >1 before final curve normalization
        return Math.max(0, Math.min(2.0, scaled));
      });

      const [a0, a1, a2, a3, a4] = A;

      const vals = [];
      for (let i = 0; i < TARGET_LEN; i++) {
        const x = i / (TARGET_LEN - 1); // 0 (large angles) → 1 (small angles)

        // soft baseline envelope: a little rise then fall
        const env = 0.3 + 0.2 * Math.cos(Math.PI * x);

        // three Gaussian-like bumps at "first", "second", "third" peak positions
        const peak1 = Math.exp(-Math.pow((x - 0.35) / 0.08, 2)); // ~1°
        const peak2 = Math.exp(-Math.pow((x - 0.58) / 0.06, 2)); // ~0.5°
        const peak3 = Math.exp(-Math.pow((x - 0.74) / 0.05, 2)); // ~0.3°

        // small-scale tail near the right edge
        const tailCore = Math.exp(-Math.pow((x - 0.90) / 0.05, 2));

        let y = 0;
        y += a0 * env;                              // large-scale baseline
        y += a1 * peak1;                            // first peak
        y += a2 * peak2;                            // second bump
        y += a3 * peak3;                            // third bump
        y += a4 * (0.4 * peak3 + 0.8 * tailCore);  // tiny-scale tail

        vals.push(y);
      }

      // Normalize final curve for plotting (shape preserved)
      return normalize01(vals);
    }, [bandPowers]);


  // toy target spectrum & angle ticks (smooth CMB-like gray curve)
  const targetClNorm = useMemo(() => buildToyCMBTarget(), []);
  const tickLabels = ANGLE_TICKS;

  const targetResampled = useMemo(() => {
    if (!targetClNorm.length || !currentSpectrum.length) return [];
    return normalize01(
      resampleToLength(targetClNorm, currentSpectrum.length)
    );
  }, [targetClNorm, currentSpectrum.length]);

    const matchScore = useMemo(() => {
      if (!currentSpectrum.length || !targetResampled.length) return null;
      const n = Math.min(currentSpectrum.length, targetResampled.length);
      let sumSq = 0;
      for (let i = 0; i < n; i++) {
        const diff = currentSpectrum[i] - targetResampled[i];
        sumSq += diff * diff;
      }
      const rmse = Math.sqrt(sumSq / n);   // both are normalized 0–1
      const score = Math.max(0, 1 - rmse); // 1 = perfect match, 0 = terrible
      return Math.round(score * 100);
    }, [currentSpectrum, targetResampled]);

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
      // Medium speckle brush → boosts band1 (first peak) & some large scales
      setGrid((prev) =>
        applySpeckleBrush(prev, row, col, {
          count: 12,
          radius: 4,
          amplitude: 0.5,
        })
      );
    } else if (brush === BRUSHES.TINY) {
      // Tiny speckle brush → mostly boosts small-scale tail
      setGrid((prev) =>
        applySpeckleBrush(prev, row, col, {
          count: 6,
          radius: 2,
          amplitude: 0.25,
        })
      );
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

      {/* Layout: grid + controls on top, spectrum below */}
      <div className="flex flex-col items-center gap-4 md:flex-row md:justify-center md:items-start">
        {/* Left: CMB Grid + brushes */}
        <div className="flex flex-col items-center gap-3 w-full max-w-[520px]">

          {/* Brush selector with symbols */}
<div className="inline-flex rounded-md shadow-sm border border-gray-300 overflow-hidden w-full justify-between">

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
                width: 'min(100%, 520px)',      // make it BIG
                height: 'min(70vh, 520px)',     // keep it roughly square
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
                  height: '100%',               // fill the square
                }}
              >
                {grid.map((row, rowIndex) =>
                  row.map((cell, colIndex) => {
                    // --- visual speckle: does NOT affect physics ---
                    const ε = 2;  // visual noise strength — tweak 0.10–0.40
                    const noisyTemp =
                      cell + ε * noiseField[rowIndex][colIndex];

                    return (
                      <div
                        key={`${rowIndex}-${colIndex}`}
                        onMouseDown={() => paintAt(rowIndex, colIndex)}
                        onMouseEnter={() => {
                          if (isPainting) paintAt(rowIndex, colIndex);
                        }}
                        style={{
                          width: '100%',
                          height: '100%',
                          backgroundColor: getColor(noisyTemp),  // ← use noisy value
                          transition: 'background-color 0.2s ease',
                        }}
                      />
                    );
                  })
                )}
              </div>
            </div>



          {/* Restart button */}
        <button
          onClick={handleRestartClick}
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
              target={targetClNorm}
              labels={tickLabels}
            />

            {matchScore !== null && (
              <p className="mt-2 text-xs text-gray-700">
                Match score:{' '}
                <span className="font-semibold">{matchScore}%</span>
                <span className="text-gray-500">
                  {' '}· Try to get above 80%
                </span>
              </p>
            )}

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
