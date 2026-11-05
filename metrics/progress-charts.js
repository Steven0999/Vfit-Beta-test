// Calendar-based progress views. SVG keeps these graphs available offline.
const METRIC_PROGRESS_TYPES = {
    weight: { label: 'Weight', unit: 'kg' }, chest: { label: 'Chest', unit: 'cm' },
    shoulders: { label: 'Shoulders', unit: 'cm' }, arms: { label: 'Arms', unit: 'cm' },
    waist: { label: 'Waist', unit: 'cm' }, legs: { label: 'Legs', unit: 'cm' },
    glutes: { label: 'Glutes', unit: 'cm' }, neck: { label: 'Neck', unit: 'cm' },
    bodyFat: { label: 'Body fat', unit: '%' }, steps: { label: 'Steps', unit: 'steps' },
    hydration: { label: 'Water', unit: 'ml' }
};
const METRIC_PROGRESS_RANGES = ['week', 'month', 'year', 'lifetime'];
let metricProgressRange = 'month';
let metricProgressAnchor = null;
let metricProgressSelection = 'weight';
let exerciseProgressRange = 'lifetime';
let exerciseProgressAnchor = null;

function validProgressDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value + 'T12:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function progressDateOffset(value, days) {
    const date = new Date(value + 'T12:00:00Z');
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

function progressCalendarWindow(range, anchor, entries) {
    const key = validProgressDate(anchor) ? anchor : localDateKey();
    const date = new Date(key + 'T12:00:00Z');
    let start = key, end = key;
    if (range === 'week') {
        start = progressDateOffset(key, -((date.getUTCDay() + 6) % 7));
        end = progressDateOffset(start, 6);
    } else if (range === 'month') {
        start = key.slice(0, 7) + '-01';
        end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 12)).toISOString().slice(0, 10);
    } else if (range === 'year') {
        start = key.slice(0, 4) + '-01-01';
        end = key.slice(0, 4) + '-12-31';
    } else {
        const keys = (entries || []).map(entry => entry.date).filter(validProgressDate).sort();
        start = keys[0] || key;
        end = keys[keys.length - 1] || key;
    }
    return { start, end };
}

function metricProgressEntries(metric, source) {
    const snapshot = source || state;
    if (metric === 'steps' || metric === 'hydration') {
        const logs = metric === 'steps' ? snapshot.stepsLogs : snapshot.waterLogs;
        return Object.entries(logs || {}).filter(([date, value]) => validProgressDate(date)
            && value !== null && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0)
            .map(([date, value]) => ({ date, value: Number(value) })).sort((a, b) => a.date.localeCompare(b.date));
    }
    const unit = snapshot.weightUnit || 'kg';
    return (snapshot.metricsHistory || []).filter(entry => entry && validProgressDate(entry.date)
        && Number.isFinite(Number(entry[metric])) && Number(entry[metric]) > 0).map(entry => ({
            date: entry.date, value: metric === 'weight' && ['lb','lbs'].includes(unit) ? Number(entry.weight) * 2.2046226218
                : metric === 'weight' && unit === 'st' ? Number(entry.weight) / 6.35029318 : Number(entry[metric])
        })).sort((a, b) => a.date.localeCompare(b.date));
}

function metricProgressSeries(entries, range, anchor) {
    const valid = (entries || []).filter(entry => entry && validProgressDate(entry.date)
        && typeof entry.value === 'number' && Number.isFinite(entry.value)).slice().sort((a, b) => a.date.localeCompare(b.date));
    const window = progressCalendarWindow(range, anchor, valid);
    const selected = valid.filter(entry => entry.date >= window.start && entry.date <= window.end);
    const span = (new Date(window.end + 'T12:00:00Z') - new Date(window.start + 'T12:00:00Z')) / 86400000;
    const bucket = range === 'year' ? 'month' : range === 'lifetime' && span > 62 ? (span > 18263 ? 'year' : 'month') : 'day';
    const byBucket = new Map();
    selected.forEach(entry => {
        const key = bucket === 'month' ? entry.date.slice(0, 7) + '-01' : bucket === 'year' ? entry.date.slice(0, 4) + '-01-01' : entry.date;
        if (!byBucket.has(key)) byBucket.set(key, []);
        byBucket.get(key).push(entry.value);
    });
    const points = [];
    let cursor = bucket === 'month' ? window.start.slice(0, 7) + '-01' : bucket === 'year' ? window.start.slice(0, 4) + '-01-01' : window.start;
    while (cursor <= window.end) {
        const values = byBucket.get(cursor) || [];
        points.push({ date: cursor, value: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null, count: values.length });
        if (bucket === 'day') cursor = progressDateOffset(cursor, 1);
        else {
            const date = new Date(cursor + 'T12:00:00Z');
            cursor = new Date(Date.UTC(date.getUTCFullYear() + (bucket === 'year' ? 1 : 0), date.getUTCMonth() + (bucket === 'month' ? 1 : 0), 1, 12)).toISOString().slice(0, 10);
        }
        if (!validProgressDate(cursor)) break;
    }
    return { ...window, points, entries: selected, bucket };
}

function metricProgressUnit(metric) {
    return metric === 'weight' ? state.weightUnit || 'kg' : METRIC_PROGRESS_TYPES[metric].unit;
}

function formatMetricProgressNumber(value) {
    return Number(value).toLocaleString('en-GB', { maximumFractionDigits: 2 });
}

function progressDateLabel(date, bucket) {
    return new Date(date + 'T12:00:00Z').toLocaleDateString('en-GB', bucket === 'year' ? { year: 'numeric', timeZone: 'UTC' }
        : bucket === 'month' ? { month: 'short', year: 'numeric', timeZone: 'UTC' } : { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function metricProgressSVG(series, label, unit, context) {
    const extra = context || {};
    const known = series.points.filter(point => point.value !== null);
    if (!known.length) return `<div class="flex items-center justify-center text-center text-sm text-slate-400 p-8 h-56">No ${escapeHtml(label.toLowerCase())} logged in this period. Choose another period or add a measurement.</div>`;
    const bounds = [...known.map(point=>point.value), ...(extra.trend || []).filter(point=>point.value!==null).map(point=>point.value), ...(Number.isFinite(extra.target) && extra.target>0 ? [extra.target] : [])];
    let min = Math.min(...bounds), max = Math.max(...bounds);
    const padding = Math.max((max - min) * 0.15, Math.abs(max) * 0.015, 0.5);
    min = Math.max(0, min - padding); max += padding;
    const width = 600, height = 270, left = 66, right = 20, top = 18, bottom = 42;
    const chartWidth = width - left - right, chartHeight = height - top - bottom;
    const x = index => left + (series.points.length === 1 ? chartWidth / 2 : index * chartWidth / (series.points.length - 1));
    const y = value => top + (max - value) / (max - min) * chartHeight;
    const grid = Array.from({ length: 4 }, (_, index) => {
        const value = min + (max - min) * index / 3, pos = y(value);
        return `<line x1="${left}" y1="${pos}" x2="${width - right}" y2="${pos}" stroke="#e2e8f0"/><text x="${left - 8}" y="${pos + 4}" text-anchor="end" font-size="11" fill="#64748b">${escapeHtml(formatMetricProgressNumber(value))}</text>`;
    }).join('');
    let path = '', connected = false;
    series.points.forEach((point, index) => {
        if (point.value === null) { connected = false; return; }
        path += `${connected ? 'L' : 'M'}${x(index).toFixed(2)},${y(point.value).toFixed(2)} `;
        connected = true;
    });
    let trendPath = '', trendConnected = false;
    (extra.trend || []).forEach((point,index)=>{
        if (point.value === null) { trendConnected=false; return; }
        trendPath += `${trendConnected?'L':'M'}${x(index).toFixed(2)},${y(point.value).toFixed(2)} `;
        trendConnected = true;
    });
    const trend = trendPath ? `<path d="${trendPath}" fill="none" stroke="#0284c7" stroke-width="3" stroke-linecap="round"><title>7-day trend: average of logged daily weights in each trailing seven-day window</title></path>` : '';
    const target = Number.isFinite(extra.target) && extra.target>0 ? `<line x1="${left}" y1="${y(extra.target)}" x2="${width-right}" y2="${y(extra.target)}" stroke="#059669" stroke-width="2" stroke-dasharray="7 5"><title>Target: ${formatMetricProgressNumber(extra.target)} ${escapeHtml(unit)}</title></line>` : '';
    const notes = (extra.annotations || []).map(note=>{
        const key=series.bucket==='month'?note.date.slice(0,7)+'-01':series.bucket==='year'?note.date.slice(0,4)+'-01-01':note.date;
        const index=series.points.findIndex(point=>point.date===key);
        return index<0?'':`<line x1="${x(index)}" y1="${top}" x2="${x(index)}" y2="${height-bottom}" stroke="#a855f7" stroke-dasharray="3 5"><title>${escapeHtml(note.date+': '+note.text)}</title></line>`;
    }).join('');
    const circles = series.points.map((point, index) => {
        if (point.value === null) return '';
        const title = `${progressDateLabel(point.date, series.bucket)}: ${formatMetricProgressNumber(point.value)} ${unit}${point.count > 1 ? ` (average of ${point.count} logs)` : ''}`;
        return `<circle cx="${x(index)}" cy="${y(point.value)}" r="${known.length > 80 ? 3 : 5}" fill="#ea580c" tabindex="0" role="button" aria-label="${escapeHtml(title)}" onclick="selectMetricProgressPoint('${point.date}')" onkeydown="activateMetricProgressPoint(event,'${point.date}')"><title>${escapeHtml(title)}</title></circle>`;
    }).join('');
    const ticks = [...new Set([0, Math.floor((series.points.length - 1) / 2), series.points.length - 1])].map(index =>
        `<text x="${x(index)}" y="${height - 12}" text-anchor="${index === 0 ? 'start' : index === series.points.length - 1 ? 'end' : 'middle'}" font-size="11" fill="#64748b">${escapeHtml(progressDateLabel(series.points[index].date, series.bucket))}</text>`).join('');
    return `<svg viewBox="0 0 ${width} ${height}" class="w-full" role="img" aria-label="${escapeHtml(label + ' in ' + unit + ', ' + series.start + ' to ' + series.end)}">${grid}${target}${notes}${trend}<path d="${path}" fill="none" stroke="#ea580c" stroke-width="3" stroke-linejoin="round"/>${circles}${ticks}</svg>`;
}

function setMetricProgressMetric(value) {
    if (!METRIC_PROGRESS_TYPES[value]) return;
    metricProgressSelection = value;
    renderMetricProgressGraphs();
}

function setMetricProgressRange(range) {
    if (!METRIC_PROGRESS_RANGES.includes(range)) return;
    metricProgressRange = range;
    renderMetricProgressGraphs();
}

function shiftMetricProgressPeriod(offset) {
    if (metricProgressRange === 'lifetime' || ![-1, 1].includes(offset)) return;
    const anchor = validProgressDate(metricProgressAnchor) ? metricProgressAnchor : state.metricsDate || localDateKey();
    const date = new Date(anchor + 'T12:00:00Z');
    metricProgressAnchor = metricProgressRange === 'week' ? progressDateOffset(anchor, offset * 7)
        : new Date(Date.UTC(date.getUTCFullYear() + (metricProgressRange === 'year' ? offset : 0), date.getUTCMonth() + (metricProgressRange === 'month' ? offset : 0), 1, 12)).toISOString().slice(0, 10);
    renderMetricProgressGraphs();
}

function zoomMetricProgress(direction) {
    const current = METRIC_PROGRESS_RANGES.indexOf(metricProgressRange);
    setMetricProgressRange(METRIC_PROGRESS_RANGES[Math.max(0, Math.min(3, current + direction))]);
}

function selectMetricProgressPoint(date) {
    if (!validProgressDate(date)) return;
    metricProgressAnchor = date;
    zoomMetricProgress(-1);
}

function activateMetricProgressPoint(event, date) {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectMetricProgressPoint(date); }
}

function resetMetricProgressView() {
    metricProgressAnchor = null;
    metricProgressSelection = 'weight';
    metricProgressRange = 'month';
    exerciseProgressRange = 'lifetime';
    exerciseProgressAnchor = null;
    resetMetricContextEditor();
}

function setExerciseProgressRange(range) {
    if (!METRIC_PROGRESS_RANGES.includes(range)) return;
    exerciseProgressRange = range;
    renderExerciseProgressChart();
}

function shiftExerciseProgressPeriod(offset) {
    if (exerciseProgressRange === 'lifetime' || ![-1, 1].includes(offset)) return;
    const anchor = exerciseProgressAnchor || state.metricsDate || localDateKey();
    const date = new Date(anchor + 'T12:00:00Z');
    exerciseProgressAnchor = exerciseProgressRange === 'week' ? progressDateOffset(anchor, offset * 7)
        : new Date(Date.UTC(date.getUTCFullYear() + (exerciseProgressRange === 'year' ? offset : 0), date.getUTCMonth() + (exerciseProgressRange === 'month' ? offset : 0), 1, 12)).toISOString().slice(0, 10);
    renderExerciseProgressChart();
}

function exerciseProgressPointsForRange(points, range, anchor) {
    const window = progressCalendarWindow(range, anchor, points);
    return points.filter(point => validProgressDate(point.date) && point.date >= window.start && point.date <= window.end);
}

function renderExerciseProgressRangeControls(points) {
    const controls = document.getElementById('exercise-progress-period-controls');
    if (!controls) return;
    const range = exerciseProgressRange;
    const window = progressCalendarWindow(range, exerciseProgressAnchor || state.metricsDate || localDateKey(), points);
    const label = range === 'lifetime' ? 'All saved workout history' : progressDateLabel(window.start, 'day') + ' – ' + progressDateLabel(window.end, 'day');
    controls.innerHTML = `<div class="flex gap-1 bg-slate-100 rounded-2xl p-1">${METRIC_PROGRESS_RANGES.map(option => `<button onclick="setExerciseProgressRange('${option}')" aria-pressed="${option === range}" class="flex-1 p-2 rounded-xl text-xs font-black ${option === range ? 'bg-white text-orange-600' : 'text-slate-500'}">${option.charAt(0).toUpperCase() + option.slice(1)}</button>`).join('')}</div>
        <div class="flex items-center justify-between gap-2 mt-2"><button onclick="shiftExerciseProgressPeriod(-1)" ${range === 'lifetime' ? 'disabled' : ''} aria-label="Previous lifting period" class="p-2 font-bold text-orange-600 disabled:opacity-30">←</button><p class="text-xs font-bold text-center" role="status">${escapeHtml(label)}</p><button onclick="shiftExerciseProgressPeriod(1)" ${range === 'lifetime' ? 'disabled' : ''} aria-label="Next lifting period" class="p-2 font-bold text-orange-600 disabled:opacity-30">→</button></div>`;
}

function renderMetricProgressGraphs() {
    const metric = metricProgressSelection, definition = METRIC_PROGRESS_TYPES[metric];
    const series = metricProgressSeries(metricProgressEntries(metric), metricProgressRange,
        metricProgressAnchor || state.metricsDate || localDateKey());
    const unit = metricProgressUnit(metric);
    ['overview', 'expanded'].forEach(scope => {
        const controls = document.getElementById('metric-progress-controls-' + scope);
        const graph = document.getElementById('metric-progress-graph-' + scope);
        const select = document.getElementById(scope === 'overview' ? 'metric-overview-select' : 'chart-metric-select');
        if (!controls || !graph || !select) return;
        select.innerHTML = Object.entries(METRIC_PROGRESS_TYPES).map(([key, value]) => `<option value="${key}">${escapeHtml(value.label)} (${escapeHtml(metricProgressUnit(key))})</option>`).join('');
        select.value = metric;
        const period = metricProgressRange === 'year' ? series.start.slice(0, 4) : metricProgressRange === 'month'
            ? new Date(series.start + 'T12:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
            : progressDateLabel(series.start, 'day') + ' – ' + progressDateLabel(series.end, 'day');
        controls.innerHTML = `<div class="flex justify-center gap-1 rounded-2xl bg-slate-100 p-1">${METRIC_PROGRESS_RANGES.map(range => `<button onclick="setMetricProgressRange('${range}')" aria-pressed="${range === metricProgressRange}" class="flex-1 p-2 text-xs font-black rounded-xl ${range === metricProgressRange ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500'}">${range.charAt(0).toUpperCase() + range.slice(1)}</button>`).join('')}</div>
            <div class="flex items-center justify-center gap-2 mt-3"><button onclick="shiftMetricProgressPeriod(-1)" aria-label="Previous period" ${metricProgressRange === 'lifetime' ? 'disabled' : ''} class="p-2 font-bold text-orange-600 disabled:opacity-30">←</button><p class="text-xs font-bold text-center flex-1" role="status">${escapeHtml(period)}</p><button onclick="shiftMetricProgressPeriod(1)" aria-label="Next period" ${metricProgressRange === 'lifetime' ? 'disabled' : ''} class="p-2 font-bold text-orange-600 disabled:opacity-30">→</button></div>
            <div class="flex justify-center gap-3 my-2"><button onclick="zoomMetricProgress(-1)" ${metricProgressRange === 'week' ? 'disabled' : ''} class="text-xs font-bold text-orange-600 p-2 disabled:opacity-30">+ Zoom in</button><button onclick="zoomMetricProgress(1)" ${metricProgressRange === 'lifetime' ? 'disabled' : ''} class="text-xs font-bold text-orange-600 p-2 disabled:opacity-30">− Zoom out</button></div>`;
        const context = metricGraphContext(metric,series);
        controls.innerHTML += metricContextControls(metric,scope);
        graph.innerHTML = metricProgressSVG(series, definition.label, unit,context) + metricContextLegend(metric,context,series);
        const summary = document.getElementById('metric-progress-summary-' + scope);
        if (summary) {
            const entries = series.entries, first = entries[0], last = entries[entries.length - 1];
            const delta = first && last ? last.value - first.value : 0;
            summary.innerHTML = entries.length ? `<div class="grid grid-cols-3 gap-2 text-center"><div><p class="text-[10px] text-slate-400">Latest logged</p><p class="text-sm font-black">${escapeHtml(formatMetricProgressNumber(last.value))} ${escapeHtml(unit)}</p></div><div><p class="text-[10px] text-slate-400">First to last</p><p class="text-sm font-black">${delta > 0 ? '+' : ''}${escapeHtml(formatMetricProgressNumber(delta))} ${escapeHtml(unit)}</p></div><div><p class="text-[10px] text-slate-400">Logs in period</p><p class="text-sm font-black">${entries.length}</p></div></div>` : '';
        }
        const help = document.getElementById('metric-progress-help-' + scope);
        if (help) help.textContent = `${series.bucket === 'day' ? 'Daily logged values' : series.bucket === 'month' ? 'Monthly averages of logged values' : 'Yearly averages of logged values'}. Missing logs are left blank.${metricProgressRange !== 'week' ? ' Tap a point to zoom in.' : ''}`;
    });
}
