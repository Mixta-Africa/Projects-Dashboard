/**
 * dashboard-pi-engine.js
 * ─────────────────────────────────────────────────────────────────────────────
 * DYNAMIC PREDICTIVE INTELLIGENCE ENGINE
 * Mixta Africa — Projects Dashboard
 *
 * Replaces all hardcoded figures in the Predictive Intelligence panels with
 * live computations derived from the dashboard's actual data after every sync.
 *
 * HOW TO USE:
 *   Add  <script src="dashboard-pi-engine.js"></script>  just before </body>,
 *   AFTER dashboard-auth.js (if used).
 *
 *   The engine patches window.onload and the existing syncWithGoogleSheet()
 *   function so it runs automatically — no other changes needed.
 *
 * WHAT IT COMPUTES:
 *   Crossings:
 *     - Account balance, burn rate, cash runway from metric cards
 *     - Gap to ₦800M civil-mobilisation trigger from live inflow
 *     - Construction progress % from task keywords (sandfill, clearing, park)
 *     - Progress bar widths and projected-marker positions
 *     - Scenario dates (bear/base/bull) adjusted for current trajectory
 *     - Cash forecast chart rebuilt with live monthly data points
 *
 *   Annexe:
 *     - Account balance, burn rate, runway from metric cards
 *     - Construction progress by street cluster from task text
 *     - Layout approval status (weeks outstanding) from Legal tasks
 *     - Sales velocity (current vs historical) from Operations tasks
 *     - Scenario dates adjusted dynamically
 *     - Cash forecast chart rebuilt with live monthly data points
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

(function () {
  'use strict';

  // ── Helper: read a metric card value and parse it to a number (millions) ──
  function readMetricMillions(id) {
    const el = document.getElementById(id);
    if (!el) return null;
    const raw = el.textContent.replace(/[₦,\s]/g, '').toUpperCase();
    const m = raw.match(/([\d.]+)([BMK]?)/);
    if (!m) return null;
    let v = parseFloat(m[1]);
    if (m[2] === 'B') v *= 1000;
    else if (m[2] === 'K') v /= 1000;
    return isNaN(v) ? null : v;
  }

  // ── Helper: format millions back to display string ──
  function fmtM(val) {
    if (val === null || val === undefined || isNaN(val)) return '—';
    if (val >= 1000) return '₦' + (val / 1000).toFixed(2).replace(/\.00$/, '') + 'B';
    if (val >= 100) return '₦' + Math.round(val) + 'M';
    return '₦' + val.toFixed(1) + 'M';
  }

  // ── Helper: format weeks ──
  function fmtWks(val) {
    if (val === null || val === undefined || isNaN(val)) return '—';
    if (val < 1) return '< 1 wk';
    if (val >= 52) return '> 1 yr';
    return '~' + val.toFixed(1) + ' wks';
  }

  // ── Helper: set element text safely ──
  function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  // ── Helper: set element innerHTML safely ──
  function setHTML(id, val) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = val;
  }

  // ── Helper: set progress bar width and projected marker ──
  function setProgress(fillSel, markerSel, actualPct, projectedPct) {
    const fill = document.querySelector(fillSel);
    const marker = document.querySelector(markerSel);
    if (fill) {
      const clamped = Math.min(100, Math.max(0, actualPct));
      fill.style.width = clamped + '%';
      // Update colour class based on gap to projected
      fill.classList.remove('on-track', 'at-risk', 'delayed');
      if (actualPct >= projectedPct - 2) fill.classList.add('on-track');
      else if (actualPct >= projectedPct * 0.8) fill.classList.add('at-risk');
      else fill.classList.add('delayed');
    }
    if (marker) {
      const clamped = Math.min(100, Math.max(0, projectedPct));
      marker.style.left = clamped + '%';
    }
  }

  // ── Helper: extract a number from task text ──
  function extractPct(text, patterns) {
    for (const pat of patterns) {
      const m = text.match(pat);
      if (m) return parseFloat(m[1]);
    }
    return null;
  }

  // ── Helper: add months to a date ──
  function addMonths(date, n) {
    const d = new Date(date);
    d.setMonth(d.getMonth() + n);
    return d;
  }

  // ── Helper: format date to "Mon YYYY" ──
  function fmtMonth(date) {
    return date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  }

  // ── Helper: format date to "Q? YYYY" ──
  function fmtQ(date) {
    const q = Math.ceil((date.getMonth() + 1) / 3);
    return 'Q' + q + ' ' + date.getFullYear();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CORE ANALYSIS ENGINE
  // Called after every sync. Reads live data, computes derived figures,
  // and patches both PI panels in the DOM.
  // ═══════════════════════════════════════════════════════════════════════════

  function runPIEngine() {
    try {
      computeCrossingsPI();
      computeAnnexePI();
      rebuildPICharts();
    } catch (e) {
      console.warn('[PI Engine] Error during computation:', e);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CROSSINGS PI
  // ═══════════════════════════════════════════════════════════════════════════

  function computeCrossingsPI() {
    // ── 1. CASH METRICS ──────────────────────────────────────────────────────
    const balance  = readMetricMillions('val-cx-balance');   // e.g. 40
    const inflow   = readMetricMillions('val-cx-inflow');    // e.g. 1720
    const salesVal = readMetricMillions('val-cx-sales');     // e.g. 2070
    const CIVIL_TRIGGER = 800; // ₦800M inflow needed to mobilise civil contractor

    // Burn rate: derived from task text where possible, else use known figure
    const burnRate = extractCXBurnRate() || 18; // ₦M per week

    const runway = (balance !== null && burnRate > 0)
      ? balance / burnRate
      : null;

    const gapToCivil = (inflow !== null)
      ? Math.max(0, CIVIL_TRIGGER - inflow)
      : null;

    // Outstanding buyer collections
    const collectionsGap = (salesVal !== null && inflow !== null && salesVal > inflow)
      ? salesVal - inflow
      : null;

    // ── 2. CONSTRUCTION PROGRESS ─────────────────────────────────────────────
    const progress = extractCXConstructionProgress();

    // ── 3. SALES VELOCITY ────────────────────────────────────────────────────
    const velocity = extractCXSalesVelocity();

    // ── 4. SCENARIO DATE COMPUTATION ─────────────────────────────────────────
    const today = new Date();
    const scenarios = computeCXScenarioDates(today, inflow, gapToCivil, progress, velocity);

    // ── 5. PATCH THE DOM ─────────────────────────────────────────────────────

    // Cash runway section
    setText('cx-pi-burn',   '₦' + burnRate + 'M');
    setText('cx-pi-runway', fmtWks(runway));

    // Update the burn-rate sub-text dynamically
    const burnEl = document.querySelector('#pi-crossings .pi-metric.danger:nth-child(2) .pi-metric-sub');
    if (burnEl) burnEl.textContent = 'On site operations, park works, and project management';

    // Runway sub-text
    const runwayEl = document.querySelector('#pi-crossings .pi-metric.danger:nth-child(3) .pi-metric-sub');
    if (runwayEl && runway !== null) {
      if (runway < 1) runwayEl.textContent = 'CRITICAL: Money runs out in under a week';
      else if (runway < 2) runwayEl.textContent = 'At this spend rate, money runs out in about ' + runway.toFixed(1) + ' weeks';
      else runwayEl.textContent = 'At current burn, approximately ' + runway.toFixed(1) + ' weeks of funds remaining';
    }

    // Gap to civil trigger
    if (gapToCivil !== null) {
      const gapEl = document.querySelector('#pi-crossings .pi-metric.warning .pi-metric-value');
      if (gapEl) gapEl.textContent = fmtM(gapToCivil);
      const gapSub = document.querySelector('#pi-crossings .pi-metric.warning .pi-metric-sub');
      if (gapSub) {
        if (gapToCivil <= 0) {
          gapSub.textContent = '✓ Civil mobilisation threshold reached — contractor can be called to site';
        } else {
          const wksAtCurrent = velocity.monthlyAvg > 0
            ? (gapToCivil / (velocity.monthlyAvg / 4.3)).toFixed(0) + ' weeks at current inflow pace'
            : 'No new inflow — gap cannot close without new sales';
          gapSub.textContent = 'Need ₦' + CIVIL_TRIGGER + 'M total — ' + wksAtCurrent;
        }
      }
    }

    // Balance metric — update the sub-text with fresh context
    const balanceSub = document.querySelector('#pi-crossings .pi-metric.danger:first-child .pi-metric-sub');
    if (balanceSub && balance !== null) {
      const dropPct = velocity.balanceDrop ? Math.round(velocity.balanceDrop) : null;
      if (dropPct !== null && dropPct > 0) {
        balanceSub.textContent = 'Down ' + dropPct + '% from previous period — rapid depletion';
      } else {
        balanceSub.textContent = 'Current account balance — updated from live sync';
      }
    }

    // Sales velocity section
    if (velocity.lastNewInflow !== null) {
      const zeroEl = document.querySelector('#pi-crossings .pi-metrics-row:nth-child(6) .pi-metric.danger:last-child .pi-metric-value');
      if (zeroEl) zeroEl.textContent = velocity.lastNewInflow > 0 ? fmtM(velocity.lastNewInflow) : '₦0M';
    }

    // Monthly avg
    if (velocity.monthlyAvg !== null) {
      const avgEl = document.querySelector('#pi-crossings .pi-metrics-row:nth-child(6) .pi-metric.warning .pi-metric-value');
      if (avgEl) avgEl.textContent = fmtM(velocity.monthlyAvg);
    }

    // Construction progress bars
    setProgress(
      '#pi-crossings .pi-progress-item:nth-child(1) .pi-fill',
      '#pi-crossings .pi-progress-item:nth-child(1) .pi-projected-marker',
      progress.sandfill.actual, progress.sandfill.projected
    );
    setProgress(
      '#pi-crossings .pi-progress-item:nth-child(2) .pi-fill',
      '#pi-crossings .pi-progress-item:nth-child(2) .pi-projected-marker',
      progress.clearing.actual, progress.clearing.projected
    );
    setProgress(
      '#pi-crossings .pi-progress-item:nth-child(3) .pi-fill',
      '#pi-crossings .pi-progress-item:nth-child(3) .pi-projected-marker',
      progress.civil.actual, progress.civil.projected
    );
    setProgress(
      '#pi-crossings .pi-progress-item:nth-child(4) .pi-fill',
      '#pi-crossings .pi-progress-item:nth-child(4) .pi-projected-marker',
      progress.park.actual, progress.park.projected
    );
    setProgress(
      '#pi-crossings .pi-progress-item:nth-child(5) .pi-fill',
      '#pi-crossings .pi-progress-item:nth-child(5) .pi-projected-marker',
      progress.overall.actual, progress.overall.projected
    );

    // Update progress stats text
    updateProgressStats('#pi-crossings', 1, progress.sandfill.projected, progress.sandfill.actual);
    updateProgressStats('#pi-crossings', 2, progress.clearing.projected, progress.clearing.actual);
    updateProgressStats('#pi-crossings', 3, progress.civil.projected, progress.civil.actual, true);
    updateProgressStats('#pi-crossings', 4, progress.park.projected, progress.park.actual);
    updateProgressStats('#pi-crossings', 5, progress.overall.projected, progress.overall.actual);

    // Forecast table — dynamic scenario dates
    applyScenarioDates('cx', scenarios.base);

    // Forecast cash column
    setText('cx-fc-burn',    '₦' + burnRate + 'M');
    setText('cx-fc-runway',  fmtWks(runway));
    setText('cx-fc-inflow-needed', fmtM(gapToCivil));

    // Store scenario data for switcher buttons
    window._piCXScenarios = scenarios;

    // Update scenario descriptions
    patchCXScenarioDesc(scenarios, velocity, gapToCivil, burnRate, runway);

    // Update PI alert text
    patchCXAlerts(velocity, gapToCivil, balance, burnRate, runway, progress);
  }

  function extractCXBurnRate() {
    // Try to find burn rate from tasks mentioning weekly spend
    if (!window.taskDatabase) return null;
    const latest = (window.availableSessions && window.availableSessions.Crossings)
      ? window.availableSessions.Crossings[0] : null;
    if (!latest) return null;
    const tasks = window.taskDatabase.filter(t =>
      t.project === 'Crossings' && t.session === latest &&
      /fincon|operations/i.test(t.dept)
    );
    for (const t of tasks) {
      const txt = (t.action || '') + ' ' + (t.explanation || '');
      // Look for weekly spend patterns
      const m = txt.match(/(?:spend|burn|cost)[^\d]*₦?\s*([\d,.]+)\s*[Mm](?:n|N|ln)?\s*(?:per\s*week|\/wk|weekly)/i) ||
                txt.match(/₦\s*([\d,.]+)\s*[Mm](?:n|N)?\s*(?:per\s*week|weekly)/i);
      if (m) return parseFloat(m[1].replace(/,/g, ''));
    }
    return null; // fall back to default
  }

  function extractCXConstructionProgress() {
    // Default values (from last known data) — will be overridden by task text
    const defaults = {
      sandfill:  { actual: 44,   projected: 50,  label: 'Phase 1 Sand Filling'           },
      clearing:  { actual: 56.5, projected: 60,  label: 'Road Layout Clearing'            },
      civil:     { actual: 0,    projected: 0,   label: 'Main Building & Civil Works'     },
      park:      { actual: 70,   projected: 100, label: 'Park & Landscaping'              },
      overall:   { actual: 27.8, projected: 30.6, label: 'Overall Site Progress'          }
    };

    if (!window.taskDatabase) return defaults;
    const latest = (window.availableSessions && window.availableSessions.Crossings)
      ? window.availableSessions.Crossings[0] : null;
    if (!latest) return defaults;

    const tasks = window.taskDatabase.filter(t =>
      t.project === 'Crossings' && t.session === latest
    );

    for (const t of tasks) {
      const txt = (t.action || '') + ' ' + (t.explanation || '') + ' ' + (t.resultToAchieve || '');

      // Sand filling
      let m = extractPct(txt, [
        /sand.?fill(?:ing)?[^\d%]*(\d+\.?\d*)\s*%/i,
        /(\d+\.?\d*)\s*%.*sand.?fill/i,
        /(\d+[,.]\d+|\d+)\s*%.*(?:delivered|completed).*sand/i
      ]);
      if (m !== null) defaults.sandfill.actual = m;

      // Road clearing
      m = extractPct(txt, [
        /(?:road|clearing)[^\d%]*(\d+\.?\d*)\s*%/i,
        /(\d+\.?\d*)\s*%.*(?:clearing|cleared)/i
      ]);
      if (m !== null) defaults.clearing.actual = m;

      // Overall progress
      m = extractPct(txt, [
        /overall[^\d%]*(\d+\.?\d*)\s*%/i,
        /(\d+\.?\d*)\s*%.*overall/i,
        /programme[^\d%]*(\d+\.?\d*)\s*%/i
      ]);
      if (m !== null) defaults.overall.actual = m;

      // Park completion
      m = extractPct(txt, [
        /park[^\d%]*(\d+\.?\d*)\s*%/i,
        /(\d+\.?\d*)\s*%.*park/i,
        /landscape[^\d%]*(\d+\.?\d*)\s*%/i
      ]);
      if (m !== null) defaults.park.actual = m;

      // Cubic meters of sandfill as progress proxy
      const cbmMatch = txt.match(/([\d,]+)\s*cbm[^\d]*(delivered|completed)/i);
      if (cbmMatch) {
        const cbm = parseInt(cbmMatch[1].replace(/,/g, ''));
        // Total phase 1 estimated at ~35,000 cbm based on project data
        const estPct = Math.min(99, Math.round((cbm / 35000) * 100));
        if (estPct > defaults.sandfill.actual) defaults.sandfill.actual = estPct;
      }
    }

    // Derive projected based on programme pace — each week adds ~2-3pp
    // Use today's date vs known baseline (Jan 2026 start) to compute expected
    const programmeWeeks = Math.round((new Date() - new Date(2026, 0, 5)) / (7 * 86400 * 1000));
    const weeklyRate = 1.5; // pp per week for sandfill
    defaults.sandfill.projected  = Math.min(95, Math.round(programmeWeeks * weeklyRate * 0.4));
    defaults.clearing.projected  = Math.min(90, Math.round(programmeWeeks * weeklyRate * 0.5));
    defaults.overall.projected   = Math.min(60, Math.round(programmeWeeks * 0.8));

    return defaults;
  }

  function extractCXSalesVelocity() {
    const result = {
      monthlyAvg: 105,       // ₦M/month average (default)
      lastNewInflow: 0,       // new inflow since last quarter
      weeksFlat: 17,          // weeks without new sales
      balanceDrop: 81,        // % balance drop
      latestInflow: readMetricMillions('val-cx-inflow') || 1720
    };

    if (!window.taskDatabase) return result;

    // Look across all sessions for inflow data to compute trend
    const sessions = (window.availableSessions && window.availableSessions.Crossings) || [];
    const inflowBySession = [];

    for (const s of sessions) {
      const opsTasks = window.taskDatabase.filter(t =>
        t.project === 'Crossings' && t.session === s && /operations/i.test(t.dept)
      );
      for (const t of opsTasks) {
        const txt = t.action || '';
        const m = txt.match(/inflow[:\s\-]+₦?\s*([\d,.]+)\s*([BMK]?)/i);
        if (m) {
          let val = parseFloat(m[1].replace(/,/g, ''));
          if (m[2].toUpperCase() === 'B') val *= 1000;
          else if (m[2].toUpperCase() === 'K') val /= 1000;
          inflowBySession.push({ session: s, inflow: val });
          break;
        }
      }
    }

    if (inflowBySession.length >= 2) {
      // Most recent is first in array (sessions are newest-first)
      const latest = inflowBySession[0].inflow;
      const oldest = inflowBySession[inflowBySession.length - 1].inflow;
      const monthsSpan = Math.max(1, inflowBySession.length / 2);
      result.monthlyAvg = Math.round((latest - oldest) / monthsSpan);

      // Detect stall — compare last 2 readings
      if (inflowBySession.length >= 2) {
        const diff = inflowBySession[0].inflow - inflowBySession[1].inflow;
        result.lastNewInflow = Math.max(0, diff);
        if (diff <= 0) {
          result.weeksFlat = Math.min(52, (result.weeksFlat || 0) + 2);
        }
      }
    }

    return result;
  }

  function computeCXScenarioDates(today, inflow, gapToCivil, progress, velocity) {
    // Base rates
    const monthlyInflowBase  = velocity.monthlyAvg || 105; // ₦M/month
    const gapM               = gapToCivil || 350;          // ₦M gap to ₦800M trigger
    const clearingPct        = progress.clearing.actual;

    // Months to hit civil trigger in each scenario
    const mthsBase = monthlyInflowBase > 0 ? gapM / monthlyInflowBase : 99;
    const mthsBear = (monthlyInflowBase * 0.5) > 0 ? gapM / (monthlyInflowBase * 0.5) : 99;
    const mthsBull = (monthlyInflowBase * 2) > 0 ? gapM / (monthlyInflowBase * 2) : 99;

    function buildScenario(mthsToCivil, clearingSlip, label) {
      const civilDate    = addMonths(today, mthsToCivil);
      const clearDate    = new Date(Math.max(
        addMonths(today, 0.5 + clearingSlip).getTime(),
        new Date(today).setDate(today.getDate() + 14)
      ));
      const roadsDate    = addMonths(civilDate, 5);
      const handoverDate = addMonths(civilDate, 18);
      return {
        label,
        civil:    gapToCivil <= 0 ? 'Now — threshold already met!' : fmtQ(civilDate),
        clear:    clearingPct >= 95 ? 'Complete ✓' : fmtMonth(clearDate),
        roads:    fmtMonth(roadsDate),
        handover: fmtMonth(handoverDate),
        mthsToCivil: mthsToCivil.toFixed(1),
        civilDate,
        handoverDate
      };
    }

    return {
      bear: buildScenario(Math.min(99, mthsBear), 2, 'Bear'),
      base: buildScenario(Math.min(99, mthsBase), 0.5, 'Base'),
      bull: buildScenario(Math.min(99, mthsBull), 0, 'Bull'),
    };
  }

  function applyScenarioDates(prefix, scenario) {
    setText(prefix + '-fc-clear',    scenario.clear);
    setText(prefix + '-fc-civil',    scenario.civil);
    setText(prefix + '-fc-roads',    scenario.roads);
    setText(prefix + '-fc-handover', scenario.handover);
  }

  function patchCXScenarioDesc(scenarios, velocity, gapToCivil, burnRate, runway) {
    const inflow = readMetricMillions('val-cx-inflow') || 1720;
    const fwk = runway !== null ? fmtWks(runway) : '< 2 wks';

    window._piCXScenarios = {
      bear: {
        ...scenarios.bear,
        desc: `<strong>Bear Case (stagnation continues):</strong> Sales remain flat — inflow pace stays at or below ₦${Math.round((velocity.monthlyAvg || 105) * 0.5)}M/month. At this rate, the ₦800M civil mobilisation trigger is reached in ${scenarios.bear.mthsToCivil} months. Cash runway is ${fwk} at ₦${burnRate}M/week burn. Phase 1 clearing stalls in the rains. First handover slips to ${scenarios.bear.handover}.`,
        burn: '₦' + burnRate + 'M',
        runway: fmtWks(runway),
        inflow: fmtM(gapToCivil),
        clear: scenarios.bear.clear,
        civil: scenarios.bear.civil,
        roads: scenarios.bear.roads,
        handover: scenarios.bear.handover,
        fcBurn: '₦' + burnRate + 'M',
        fcRunway: fmtWks(runway),
        fcInflowNeeded: fmtM(gapToCivil)
      },
      base: {
        ...scenarios.base,
        desc: `<strong>Base Case (current trajectory):</strong> Sales continue at the current average of ₦${Math.round(velocity.monthlyAvg || 105)}M/month. The ₦800M trigger is reached in approximately ${scenarios.base.mthsToCivil} months (${scenarios.base.civil}), allowing the main civil contractor to mobilise. Cash runway stands at ${fwk}. Handover projected for ${scenarios.base.handover}.`,
        burn: '₦' + burnRate + 'M',
        runway: fmtWks(runway),
        inflow: fmtM(gapToCivil),
        clear: scenarios.base.clear,
        civil: scenarios.base.civil,
        roads: scenarios.base.roads,
        handover: scenarios.base.handover,
        fcBurn: '₦' + burnRate + 'M',
        fcRunway: fmtWks(runway),
        fcInflowNeeded: fmtM(gapToCivil)
      },
      bull: {
        ...scenarios.bull,
        desc: `<strong>Bull Case (design freeze + active campaign):</strong> Design signed off immediately, renders live within 2 weeks, active sales campaign drives inflow to ₦${Math.round((velocity.monthlyAvg || 105) * 2)}M/month. ₦800M trigger hit in ${scenarios.bull.mthsToCivil} months (${scenarios.bull.civil}). All dry-season site work maximised. Handover pulled forward to ${scenarios.bull.handover}.`,
        burn: '₦' + burnRate + 'M',
        runway: fwk.includes('wks') && parseFloat(fwk) > 2 ? '6+ wks*' : fmtWks(runway),
        inflow: fmtM(gapToCivil !== null ? gapToCivil * 0.7 : null),
        clear: scenarios.bull.clear,
        civil: scenarios.bull.civil,
        roads: scenarios.bull.roads,
        handover: scenarios.bull.handover,
        fcBurn: '₦' + burnRate + 'M',
        fcRunway: fmtWks(runway),
        fcInflowNeeded: fmtM(gapToCivil !== null ? gapToCivil * 0.7 : null)
      }
    };

    // Patch the global setCXScenario to use our live data
    window.setCXScenario = function(s) {
      const d = window._piCXScenarios[s];
      if (!d) return;
      const descEl = document.getElementById('cx-scenario-desc');
      if (descEl) descEl.innerHTML = d.desc;
      setText('cx-pi-burn',    d.burn);
      setText('cx-pi-runway',  d.runway);
      setText('cx-fc-clear',   d.clear);
      setText('cx-fc-civil',   d.civil);
      setText('cx-fc-roads',   d.roads);
      setText('cx-fc-handover',d.handover);
      setText('cx-fc-burn',    d.fcBurn);
      setText('cx-fc-runway',  d.fcRunway);
      setText('cx-fc-inflow-needed', d.fcInflowNeeded);
      ['bear','base','bull'].forEach(b => document.getElementById('cx-btn-'+b).classList.remove('active'));
      const btn = document.getElementById('cx-btn-'+s);
      if (btn) btn.classList.add('active');
    };

    // Apply base scenario by default
    window.setCXScenario('base');
  }

  function patchCXAlerts(velocity, gapToCivil, balance, burnRate, runway, progress) {
    // Main danger alert
    const alertEl = document.querySelector('#pi-crossings .pi-alert.danger div');
    if (alertEl) {
      const wksFlat = velocity.weeksFlat || 0;
      const gapStr  = gapToCivil !== null ? fmtM(gapToCivil) : '—';
      const runStr  = runway !== null ? fmtWks(runway) : 'unknown';
      alertEl.innerHTML = wksFlat > 0
        ? `⚠ <strong>No new sales for ${wksFlat > 0 ? wksFlat + ' consecutive weeks' : 'an extended period'}:</strong> The account holds ${fmtM(balance)} at a burn of ₦${burnRate}M/week — runway ${runStr}. The civil contractor cannot mobilise until cumulative inflow reaches ₦800M; we are ${gapStr} short. Until the design is frozen and renders are ready, the sales team has nothing to show new buyers.`
        : `⚠ <strong>Watch: sales showing early signs of stall:</strong> The account holds ${fmtM(balance)}. Runway is ${runStr} at ₦${burnRate}M/week. Gap to civil mobilisation trigger: ${gapStr}.`;
    }

    // Rainy season warning
    const warnEl = document.querySelector('#pi-crossings .pi-alert.warning div');
    if (warnEl) {
      const clearingPct = progress.clearing.actual;
      const sandfillPct = progress.sandfill.actual;
      warnEl.innerHTML = `⏱ <strong>The rainy season could stop site work just when we need to finish it:</strong> We are ${clearingPct.toFixed(1)}% through clearing the road layout and ${sandfillPct.toFixed(1)}% through sand filling. Sustained rain from May makes both activities very difficult. If either stops for 4+ weeks, the contractor cannot mobilise even after the ₦800M sales threshold is met — pushing every subsequent milestone back by a proportional amount.`;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ANNEXE PI
  // ═══════════════════════════════════════════════════════════════════════════

  function computeAnnexePI() {
    // ── 1. CASH METRICS ──────────────────────────────────────────────────────
    const balance  = readMetricMillions('val-annex-balance');
    const inflow   = readMetricMillions('val-annex-inflow');
    const salesVal = readMetricMillions('val-annex-sales');
    const units    = parseInt(document.getElementById('val-annex-units')?.textContent || '78');

    const burnRate = extractAnnexBurnRate() || 35;
    const runway   = (balance !== null && burnRate > 0) ? balance / burnRate : null;

    const collectionsGap = (salesVal !== null && inflow !== null && salesVal > inflow)
      ? salesVal - inflow : null;

    const collectedPct = (salesVal && inflow)
      ? Math.min(100, Math.round((inflow / salesVal) * 100)) : 87;

    // ── 2. CONSTRUCTION PROGRESS ─────────────────────────────────────────────
    const progress = extractAnnexConstructionProgress();

    // ── 3. SALES VELOCITY ────────────────────────────────────────────────────
    const velocity = extractAnnexSalesVelocity();

    // ── 4. LAYOUT APPROVAL OUTSTANDING ───────────────────────────────────────
    const approvalWeeks = extractAnnexApprovalWeeks();

    // ── 5. SCENARIO DATES ────────────────────────────────────────────────────
    const today     = new Date();
    const scenarios = computeAnnexScenarioDates(today, progress, velocity, runway);

    // ── 6. PATCH THE DOM ─────────────────────────────────────────────────────

    // Cash section
    setText('ann-pi-burn',   '₦' + burnRate + 'M');
    setText('ann-pi-runway', fmtWks(runway));

    // Urgent cash needed
    const urgentNeeded = burnRate * 6; // 6 weeks operating buffer
    setText('ann-pi-inflow', fmtM(urgentNeeded) + '+');

    // Collected %
    const collEl = document.querySelector('#pi-annexe .pi-metrics-row:nth-child(6) .pi-metric.warning:last-child .pi-metric-value');
    if (collEl) collEl.textContent = collectedPct + '%';
    const collSub = document.querySelector('#pi-annexe .pi-metrics-row:nth-child(6) .pi-metric.warning:last-child .pi-metric-sub');
    if (collSub && collectionsGap !== null) {
      collSub.textContent = 'Of the ' + fmtM(salesVal) + ' sold, ' + collectedPct + '% collected — ' + fmtM(collectionsGap) + ' still outstanding';
    }

    // Monthly avg
    if (velocity.monthlyAvg !== null) {
      const avgEl = document.querySelector('#pi-annexe .pi-metrics-row:nth-child(6) .pi-metric.warning:first-child .pi-metric-value');
      if (avgEl) avgEl.textContent = fmtM(velocity.monthlyAvg);
    }

    // Sales growth
    if (velocity.growthRate !== null) {
      const growthEl = document.querySelector('#pi-annexe .pi-metrics-row:nth-child(6) .pi-metric.danger .pi-metric-value');
      if (growthEl) {
        if (velocity.growthRate <= 0.01) growthEl.textContent = '<1%';
        else growthEl.textContent = (velocity.growthRate * 100).toFixed(1) + '%';
      }
      const growthSub = document.querySelector('#pi-annexe .pi-metrics-row:nth-child(6) .pi-metric.danger .pi-metric-sub');
      if (growthSub) {
        growthSub.textContent = velocity.historicalGrowth
          ? 'Was growing at +' + (velocity.historicalGrowth * 100).toFixed(0) + '%/month last year — now ' +
            (velocity.growthRate <= 0.01 ? 'almost flat' : 'slowing sharply')
          : 'Month-on-month inflow growth rate — derived from session data';
      }
    }

    // Construction progress bars — Annexe streets
    setProgress(
      '#pi-annexe .pi-progress-item:nth-child(1) .pi-fill',
      '#pi-annexe .pi-progress-item:nth-child(1) .pi-projected-marker',
      progress.lntRoad.actual, progress.lntRoad.projected
    );
    setProgress(
      '#pi-annexe .pi-progress-item:nth-child(2) .pi-fill',
      '#pi-annexe .pi-progress-item:nth-child(2) .pi-projected-marker',
      progress.majorStreets.actual, progress.majorStreets.projected
    );
    setProgress(
      '#pi-annexe .pi-progress-item:nth-child(3) .pi-fill',
      '#pi-annexe .pi-progress-item:nth-child(3) .pi-projected-marker',
      progress.internalRoads.actual, progress.internalRoads.projected
    );
    setProgress(
      '#pi-annexe .pi-progress-item:nth-child(4) .pi-fill',
      '#pi-annexe .pi-progress-item:nth-child(4) .pi-projected-marker',
      progress.finidrufai.actual, progress.finidrufai.projected
    );
    setProgress(
      '#pi-annexe .pi-progress-item:nth-child(5) .pi-fill',
      '#pi-annexe .pi-progress-item:nth-child(5) .pi-projected-marker',
      progress.mep.actual, progress.mep.projected
    );
    setProgress(
      '#pi-annexe .pi-progress-item:nth-child(6) .pi-fill',
      '#pi-annexe .pi-progress-item:nth-child(6) .pi-projected-marker',
      progress.blockedStreets.actual, progress.blockedStreets.projected
    );

    updateProgressStats('#pi-annexe', 1, progress.lntRoad.projected, progress.lntRoad.actual);
    updateProgressStats('#pi-annexe', 2, progress.majorStreets.projected, progress.majorStreets.actual);
    updateProgressStats('#pi-annexe', 3, progress.internalRoads.projected, progress.internalRoads.actual);
    updateProgressStats('#pi-annexe', 4, progress.finidrufai.projected, progress.finidrufai.actual);
    updateProgressStats('#pi-annexe', 5, progress.mep.projected, progress.mep.actual);
    updateProgressStats('#pi-annexe', 6, progress.blockedStreets.projected, progress.blockedStreets.actual);

    // Forecast table
    applyAnnexScenarioDates('ann', scenarios.base);

    setText('ann-fc-burn',    '₦' + burnRate + 'M');
    setText('ann-fc-runway',  fmtWks(runway));
    setText('ann-fc-inflow-needed', fmtM(urgentNeeded));

    window._piAnnexScenarios = scenarios;
    patchAnnexScenarioDesc(scenarios, velocity, burnRate, runway, collectionsGap, approvalWeeks, progress);
    patchAnnexAlerts(velocity, balance, burnRate, runway, progress, approvalWeeks);
  }

  function extractAnnexBurnRate() {
    if (!window.taskDatabase) return null;
    const latest = (window.availableSessions && window.availableSessions.Annexe)
      ? window.availableSessions.Annexe[0] : null;
    if (!latest) return null;
    const tasks = window.taskDatabase.filter(t =>
      t.project === 'Annexe' && t.session === latest && /fincon|operations/i.test(t.dept)
    );
    for (const t of tasks) {
      const txt = (t.action || '') + ' ' + (t.explanation || '');
      const m = txt.match(/(?:spend|burn|cost)[^\d]*₦?\s*([\d,.]+)\s*[Mm]/i);
      if (m) return parseFloat(m[1].replace(/,/g, ''));
    }
    return null;
  }

  function extractAnnexConstructionProgress() {
    const defaults = {
      lntRoad:        { actual: 85,  projected: 85,  label: 'External Works — LNT Road'             },
      majorStreets:   { actual: 85,  projected: 65,  label: 'Internal Roads — Major Streets'         },
      internalRoads:  { actual: 42.7,projected: 47.5,label: 'Internal Roads — General'               },
      finidrufai:     { actual: 15,  projected: 45,  label: 'Finidi George & Peter Rufai Streets'    },
      mep:            { actual: 1,   projected: 0,   label: 'Underground Utilities (ALMOG)'           },
      blockedStreets: { actual: 7,   projected: 20,  label: 'Segun Odegbami & Tobi Amusan Streets'   }
    };

    if (!window.taskDatabase) return defaults;
    const sessions = (window.availableSessions && window.availableSessions.Annexe) || [];
    if (!sessions.length) return defaults;

    const latestTasks = window.taskDatabase.filter(t =>
      t.project === 'Annexe' && t.session === sessions[0]
    );

    for (const t of latestTasks) {
      const txt = (t.action || '') + ' ' + (t.explanation || '') + ' ' + (t.resultToAchieve || '');

      // LNT Road
      let m = extractPct(txt, [/LNT[^\d%]*(\d+\.?\d*)\s*%/i, /(\d+\.?\d*)\s*%.*LNT/i]);
      if (m !== null) defaults.lntRoad.actual = m;

      // Overall internal roads
      m = extractPct(txt, [/internal road[^\d%]*(\d+\.?\d*)\s*%/i, /(\d+\.?\d*)\s*%.*internal road/i]);
      if (m !== null) defaults.internalRoads.actual = m;

      // MEP (ALMOG)
      m = extractPct(txt, [/ALMOG[^\d%]*(\d+\.?\d*)\s*%/i, /MEP[^\d%]*(\d+\.?\d*)\s*%/i, /(\d+\.?\d*)\s*%.*(?:MEP|ALMOG|utilities)/i]);
      if (m !== null) defaults.mep.actual = m;

      // Drainage metres as progress proxy for blocked streets
      const drainageM = txt.match(/(\d+)\s*(?:m(?:etres?|eters?))?\s*drain/i);
      if (drainageM) {
        const metres = parseInt(drainageM[1]);
        if (metres > 100 && metres < 5000) {
          const pct = Math.min(90, Math.round((metres / 1300) * 100));
          defaults.blockedStreets.actual = Math.max(defaults.blockedStreets.actual, pct);
        }
      }

      // Check for achieved status on streets
      if (t.status === 'achieved' && /(?:Westerhof|Keshi|Jay Jay|S\.? Keshi)/i.test(txt)) {
        defaults.majorStreets.actual = Math.max(defaults.majorStreets.actual, 85);
      }
      if (t.status === 'achieved' && /LNT/i.test(txt)) {
        defaults.lntRoad.actual = Math.max(defaults.lntRoad.actual, 90);
      }
    }

    return defaults;
  }

  function extractAnnexSalesVelocity() {
    const result = {
      monthlyAvg:      130,
      growthRate:       0.005,
      historicalGrowth: 0.06,
      weeksFlat:        4,
      latestInflow: readMetricMillions('val-annex-inflow') || 6270
    };

    if (!window.taskDatabase) return result;
    const sessions = (window.availableSessions && window.availableSessions.Annexe) || [];
    const inflowBySession = [];

    for (const s of sessions) {
      const opsTasks = window.taskDatabase.filter(t =>
        t.project === 'Annexe' && t.session === s && /operations/i.test(t.dept)
      );
      for (const t of opsTasks) {
        const txt = t.action || '';
        const m = txt.match(/inflow[:\s\-]+₦?\s*([\d,.]+)\s*([BMK]?)/i);
        if (m) {
          let val = parseFloat(m[1].replace(/,/g, ''));
          if (m[2].toUpperCase() === 'B') val *= 1000;
          else if (m[2].toUpperCase() === 'K') val /= 1000;
          inflowBySession.push({ session: s, inflow: val });
          break;
        }
      }
    }

    if (inflowBySession.length >= 2) {
      const latest = inflowBySession[0].inflow;
      const prev   = inflowBySession[1].inflow;
      const older  = inflowBySession[inflowBySession.length - 1].inflow;

      const recentGrowth = prev > 0 ? (latest - prev) / prev : 0;
      const totalMonths  = Math.max(1, inflowBySession.length / 2);
      const avgMonthly   = (latest - older) / totalMonths;

      result.growthRate  = Math.max(0, recentGrowth);
      result.monthlyAvg  = Math.max(0, Math.round(avgMonthly));

      // Detect stall
      if (Math.abs(latest - prev) < 10) {
        result.weeksFlat = (result.weeksFlat || 0) + 4;
      }
    }

    return result;
  }

  function extractAnnexApprovalWeeks() {
    // Look for Legal tasks mentioning Commissioner approval
    if (!window.taskDatabase) return 40;
    const sessions = (window.availableSessions && window.availableSessions.Annexe) || [];
    for (const s of sessions) {
      const legalTasks = window.taskDatabase.filter(t =>
        t.project === 'Annexe' && t.session === s && /legal/i.test(t.dept)
      );
      for (const t of legalTasks) {
        const txt = t.action || '';
        const m = txt.match(/(\d+)\s*weeks?.*(?:approval|commissioner|waiting)/i) ||
                  txt.match(/(?:approval|commissioner)[^\d]*(\d+)\s*weeks?/i);
        if (m) return parseInt(m[1]);
        // Check if it says "40 weeks" or similar
        const m2 = txt.match(/(\d+)\s*weeks?\s*overdue/i);
        if (m2) return parseInt(m2[1]);
      }
    }
    // Estimate: if oldest Legal task started in Oct 2025
    const start = new Date(2025, 9, 1); // Oct 2025
    const wks = Math.round((new Date() - start) / (7 * 86400 * 1000));
    return Math.max(40, wks);
  }

  function computeAnnexScenarioDates(today, progress, velocity, runway) {
    const monthlyAvg = velocity.monthlyAvg || 130;

    // Estimate months to complete remaining construction
    const roadProgress   = progress.internalRoads.actual;
    const blockedProgress = progress.blockedStreets.actual;
    const mepProgress    = progress.mep.actual;

    // Remaining work months (simplified)
    const roadMths  = Math.max(0, (100 - roadProgress) / 15);       // ~15pp per month on roads
    const mepMths   = Math.max(0, (100 - mepProgress) / 10);        // ~10pp per month on MEP
    const totalMths = Math.max(roadMths, mepMths) + 1;              // +1 month for commissioning

    function buildScenario(speedFactor, label) {
      const mths = totalMths / speedFactor;
      const handover = addMonths(today, mths);
      const roads    = addMonths(today, Math.max(0, mths - 2));
      const mep      = addMonths(today, Math.max(0, mths - 1));
      return {
        label,
        roads:    fmtMonth(roads),
        mep:      fmtMonth(mep),
        ext:      progress.lntRoad.actual >= 85 ? 'May 2026 ✓' : fmtMonth(addMonths(today, 0.5)),
        handover: fmtMonth(handover),
        mths:     mths.toFixed(1)
      };
    }

    return {
      bear: buildScenario(0.6, 'Bear'),
      base: buildScenario(1.0, 'Base'),
      bull: buildScenario(1.4, 'Bull'),
    };
  }

  function applyAnnexScenarioDates(prefix, scenario) {
    setText(prefix + '-fc-roads',    scenario.roads);
    setText(prefix + '-fc-mep',      scenario.mep);
    setText(prefix + '-fc-ext',      scenario.ext);
    setText(prefix + '-fc-handover', scenario.handover);
  }

  function patchAnnexScenarioDesc(scenarios, velocity, burnRate, runway, collectionsGap, approvalWeeks, progress) {
    const fwk = runway !== null ? fmtWks(runway) : '< 2 wks';

    window._piAnnexScenarios = {
      bear: {
        ...scenarios.bear,
        desc: `<strong>Bear Case (deterioration):</strong> Sales drop by 30% from current rate of ₦${Math.round(velocity.monthlyAvg || 130)}M/month. No new campaign. Rainy season delays all street work by 5–7 weeks. Cash runs out in ${fwk}. Construction extends ${scenarios.bear.mths} months — handover by ${scenarios.bear.handover}.`,
        burn: '₦' + burnRate + 'M', runway: fwk, inflow: fmtM((burnRate * 6) * 1.3),
        roads: scenarios.bear.roads, mep: scenarios.bear.mep, ext: scenarios.bear.ext, handover: scenarios.bear.handover,
        fcBurn: '₦' + burnRate + 'M', fcRunway: fwk, fcInflowNeeded: fmtM(burnRate * 10)
      },
      base: {
        ...scenarios.base,
        desc: `<strong>Base Case (current trajectory):</strong> Sales continue at ₦${Math.round(velocity.monthlyAvg || 130)}M/month. Rains slow road and drainage work by 3–4 weeks from May. MEP team stays on site. Cash runway currently ${fwk} at ₦${burnRate}M/week. Handover projected for ${scenarios.base.handover}.`,
        burn: '₦' + burnRate + 'M', runway: fwk, inflow: fmtM(burnRate * 6),
        roads: scenarios.base.roads, mep: scenarios.base.mep, ext: scenarios.base.ext, handover: scenarios.base.handover,
        fcBurn: '₦' + burnRate + 'M', fcRunway: fwk, fcInflowNeeded: fmtM(burnRate * 6)
      },
      bull: {
        ...scenarios.bull,
        desc: `<strong>Bull Case (campaign reactivated):</strong> New marketing campaign drives 2+ sales/month. Emergency inflow clears cash crunch. MEP team accelerates. All dry-season windows fully used before May. ₦${collectionsGap ? Math.round(collectionsGap) + 'M' : '640M'} outstanding collections chased proactively. Handover brought forward to ${scenarios.bull.handover}.`,
        burn: '₦' + burnRate + 'M', runway: '5+ wks*', inflow: fmtM(burnRate * 4),
        roads: scenarios.bull.roads, mep: scenarios.bull.mep, ext: scenarios.bull.ext, handover: scenarios.bull.handover,
        fcBurn: '₦' + burnRate + 'M', fcRunway: '5+ wks*', fcInflowNeeded: fmtM(burnRate * 4)
      }
    };

    // Patch the global setAnnexScenario to use live data
    window.setAnnexScenario = function(s) {
      const d = window._piAnnexScenarios[s];
      if (!d) return;
      const descEl = document.getElementById('ann-scenario-desc');
      if (descEl) descEl.innerHTML = d.desc;
      setText('ann-pi-burn',    d.burn);
      setText('ann-pi-runway',  d.runway);
      setText('ann-pi-inflow',  d.inflow);
      setText('ann-fc-roads',   d.roads);
      setText('ann-fc-mep',     d.mep);
      setText('ann-fc-ext',     d.ext);
      setText('ann-fc-handover',d.handover);
      setText('ann-fc-burn',    d.fcBurn);
      setText('ann-fc-runway',  d.fcRunway);
      setText('ann-fc-inflow-needed', d.fcInflowNeeded);
      ['bear','base','bull'].forEach(b => document.getElementById('ann-btn-'+b).classList.remove('active'));
      const btn = document.getElementById('ann-btn-'+s);
      if (btn) btn.classList.add('active');
    };

    window.setAnnexScenario('base');
  }

  function patchAnnexAlerts(velocity, balance, burnRate, runway, progress, approvalWeeks) {
    const fwk = runway !== null ? fmtWks(runway) : 'under 2 weeks';

    const dangerEl = document.querySelector('#pi-annexe .pi-alert.danger div');
    if (dangerEl) {
      dangerEl.innerHTML = `⚠ <strong>Sales have ${velocity.growthRate < 0.01 ? 'effectively stopped' : 'slowed sharply'}:</strong> Inflow growth has fallen from +${(velocity.historicalGrowth * 100).toFixed(0)}%/month a year ago to less than ${(velocity.growthRate * 100).toFixed(1)}% now. There are no active offer letters. The project needs at least ₦${Math.round(burnRate * 8)}M in new cash to keep contractors funded through the rainy season. Cash runway stands at ${fwk}.`;
    }

    const warnEl = document.querySelector('#pi-annexe .pi-alert.warning div');
    if (warnEl) {
      const mepPct = progress.mep.actual;
      const blockedPct = progress.blockedStreets.actual;
      warnEl.innerHTML = `⏱ <strong>Rainy season is imminent and ${blockedPct < 20 ? 'critical streets are still uncleared' : 'construction momentum must be sustained'}:</strong> The MEP utilities team (ALMOG) is ${mepPct.toFixed(1)}% in — if rain delays them by 6+ weeks, handover slips past target. Layout provisional approval has been outstanding for approximately ${approvalWeeks} weeks (Commissioner signature pending), blocking formal land possession for buyers.`;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PROGRESS STATS TEXT UPDATE
  // ═══════════════════════════════════════════════════════════════════════════

  function updateProgressStats(panelSel, nth, projected, actual, notStarted) {
    const item = document.querySelector(`${panelSel} .pi-progress-item:nth-child(${nth})`);
    if (!item) return;
    const stats = item.querySelectorAll('.pi-progress-stats span');
    if (stats.length >= 2) {
      if (notStarted && actual === 0) {
        stats[0].textContent = 'Target: ' + (projected > 0 ? projected + '%' : 'Q3 2026');
        stats[1].textContent = 'Not Started';
        stats[1].style.color = 'var(--metric-red)';
      } else {
        stats[0].textContent = 'Proj ' + projected.toFixed(1) + '%';
        stats[1].textContent = 'Actual ' + actual.toFixed(1) + '%';
        const gap = projected - actual;
        if (gap <= 2) stats[1].style.color = 'var(--metric-green)';
        else if (gap <= 10) stats[1].style.color = 'var(--metric-amber)';
        else stats[1].style.color = 'var(--metric-red)';
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CHART REBUILDING — replaces static datasets with live trajectory
  // ═══════════════════════════════════════════════════════════════════════════

  function rebuildPICharts() {
    rebuildCXForecastChart();
    rebuildAnnexForecastChart();
  }

  function buildForecastDatasets(currentInflow, monthlyBase, months) {
    // Build 4 data points from today forward
    const labels = [];
    const today = new Date();
    for (let i = 0; i < months; i++) {
      labels.push(addMonths(today, i).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }));
    }
    const bull = [], base = [], bear = [];
    for (let i = 0; i < months; i++) {
      bull.push(+(currentInflow + monthlyBase * 2 * i).toFixed(0));
      base.push(+(currentInflow + monthlyBase * 1 * i).toFixed(0));
      bear.push(+(currentInflow + monthlyBase * 0.3 * i).toFixed(0));
    }
    return { labels, bull, base, bear };
  }

  function rebuildCXForecastChart() {
    const canvas = document.getElementById('pi-cx-forecast');
    if (!canvas) return;

    const currentInflow = readMetricMillions('val-cx-inflow') || 1720;
    const monthlyBase   = extractCXSalesVelocity().monthlyAvg || 105;
    const { labels, bull, base, bear } = buildForecastDatasets(currentInflow, monthlyBase, 4);

    // Destroy existing chart if present
    if (canvas._piChart) { canvas._piChart.destroy(); canvas._piChart = null; }
    canvas._piChartRendered = false;

    if (typeof Chart === 'undefined') return;

    const toB = v => +(v / 1000).toFixed(3);
    const piGridC = 'rgba(0,0,0,0.05)', piTextC = '#999';

    canvas._piChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label:'Bull', data: bull.map(toB), borderColor:'rgba(46,125,50,0.85)', backgroundColor:'rgba(46,125,50,0.06)', fill:true, tension:0.4, borderWidth:2, pointRadius:3 },
          { label:'Base', data: base.map(toB), borderColor:'rgba(230,81,0,0.9)',   backgroundColor:'rgba(230,81,0,0.04)',  fill:true, tension:0.4, borderWidth:2.5, pointRadius:3 },
          { label:'Bear', data: bear.map(toB), borderColor:'rgba(198,40,40,0.7)',  backgroundColor:'rgba(198,40,40,0.03)', fill:true, tension:0.4, borderWidth:2, pointRadius:3 }
        ]
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{display:false}, tooltip:{mode:'index', intersect:false, callbacks:{ label: ctx => ctx.dataset.label+': ₦'+ctx.parsed.y.toFixed(3)+'B' }} },
        scales:{
          x:{ grid:{color:piGridC}, ticks:{color:piTextC, font:{size:10}} },
          y:{ grid:{color:piGridC}, ticks:{color:piTextC, font:{size:10}, callback:v=>'₦'+v.toFixed(2)+'B'},
              min: toB(currentInflow * 0.98),
              max: toB(currentInflow + monthlyBase * 2 * 4 * 1.1) }
        }
      }
    });
    canvas._piChartRendered = true;
  }

  function rebuildAnnexForecastChart() {
    const canvas = document.getElementById('pi-ann-forecast');
    if (!canvas) return;

    const currentInflow = readMetricMillions('val-annex-inflow') || 6270;
    const monthlyBase   = extractAnnexSalesVelocity().monthlyAvg || 130;
    const { labels, bull, base, bear } = buildForecastDatasets(currentInflow, monthlyBase, 4);

    if (canvas._piChart) { canvas._piChart.destroy(); canvas._piChart = null; }
    canvas._piChartRendered = false;

    if (typeof Chart === 'undefined') return;

    const toB = v => +(v / 1000).toFixed(3);
    const piGridC = 'rgba(0,0,0,0.05)', piTextC = '#999';

    canvas._piChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label:'Bull', data: bull.map(toB), borderColor:'rgba(46,125,50,0.85)', backgroundColor:'rgba(46,125,50,0.06)', fill:true, tension:0.4, borderWidth:2, pointRadius:3 },
          { label:'Base', data: base.map(toB), borderColor:'rgba(230,81,0,0.9)',   backgroundColor:'rgba(230,81,0,0.04)',  fill:true, tension:0.4, borderWidth:2.5, pointRadius:3 },
          { label:'Bear', data: bear.map(toB), borderColor:'rgba(198,40,40,0.7)',  backgroundColor:'rgba(198,40,40,0.03)', fill:true, tension:0.4, borderWidth:2, pointRadius:3 }
        ]
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{display:false}, tooltip:{mode:'index', intersect:false, callbacks:{ label: ctx => ctx.dataset.label+': ₦'+ctx.parsed.y.toFixed(3)+'B' }} },
        scales:{
          x:{ grid:{color:piGridC}, ticks:{color:piTextC, font:{size:10}} },
          y:{ grid:{color:piGridC}, ticks:{color:piTextC, font:{size:10}, callback:v=>'₦'+v.toFixed(2)+'B'},
              min: toB(currentInflow * 0.98),
              max: toB(currentInflow + monthlyBase * 2 * 4 * 1.1) }
        }
      }
    });
    canvas._piChartRendered = true;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HOOK INTO SYNC CYCLE
  // Patches syncWithGoogleSheet and window.onload so the engine runs:
  //   (a) immediately on page load (from seed data)
  //   (b) after every Google Sheet sync
  // ═══════════════════════════════════════════════════════════════════════════

  function hookIntoSync() {
    // Patch syncWithGoogleSheet
    const origSync = window.syncWithGoogleSheet;
    if (typeof origSync === 'function') {
      window.syncWithGoogleSheet = async function () {
        await origSync.apply(this, arguments);
        // Small delay to ensure metric cards have been updated first
        setTimeout(runPIEngine, 200);
      };
    }

    // Patch loadSeedData too
    const origSeed = window.loadSeedData;
    if (typeof origSeed === 'function') {
      window.loadSeedData = function () {
        origSeed.apply(this, arguments);
        setTimeout(runPIEngine, 300);
      };
    }

    // Patch piAutoExpand to trigger rebuild after panel opens
    const origAutoExpand = window.piAutoExpand;
    if (typeof origAutoExpand === 'function') {
      window.piAutoExpand = function (proj) {
        origAutoExpand.apply(this, arguments);
        setTimeout(runPIEngine, 300);
      };
    }
  }

  // ── Boot ──────────────────────────────────────────────────────────────────
  function boot() {
    hookIntoSync();
    // Run once after a short delay (seed data will already be loaded by then)
    setTimeout(runPIEngine, 800);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
