/* ═══════════════════════════════════════════════════════════ */
/*  NCYU Smart Microgrid Dashboard — Core Application Logic  */
/* ═══════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ───── CONFIGURATION ─────
  const CONFIG = {
    updateInterval: 3000,       // 3 seconds
    clockInterval: 1000,        // 1 second
    maxLogs: 30,
    healthRingCircumference: 326.73, // 2πr where r=52
  };

  // ───── STATE ─────
  const state = {
    biogas: {
      pH: 7.1,
      temp: 36.5,
      ch4: 62,
      h2: 18,
      orp: -350,
      healthScore: 85,
      status: 'normal'
    },
    solar: {
      power: 42.5,
      dailyTotal: 186.2,
      irradianceHistory: []
    },
    ess: {
      soc: 72,
      chargePower: 15.2,
      dischargePower: 0,
      mode: 'charging' // charging | discharging | idle
    },
    hydrogen: {
      power: 8.3,
      pressure: 35.2,
      efficiency: 52.8
    },
    airQuality: {
      aqi: 42,
      pm25: 12.3,
      pm10: 28.5,
      co2: 418,
      voc: 0.15
    },
    animalHouse: {
      totalPower: 45.2,
      gridIn: 15.0,
      biogasIn: 30.2
    },
    logs: [],
    logCounts: { info: 0, warning: 0, error: 0 }
  };

  // ───── HELPER FUNCTIONS ─────
  function rand(min, max) {
    return Math.round((Math.random() * (max - min) + min) * 100) / 100;
  }

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  function drift(current, min, max, maxDelta) {
    const delta = (Math.random() - 0.5) * 2 * maxDelta;
    return clamp(Math.round((current + delta) * 100) / 100, min, max);
  }

  function formatTime(date) {
    return date.toLocaleTimeString('zh-TW', { hour12: false });
  }

  function formatDate(date) {
    return date.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });
  }

  // Animate a numeric value change
  function animateValue(el, newVal, decimals = 1, suffix = '') {
    const current = parseFloat(el.textContent) || 0;
    const diff = newVal - current;
    const steps = 12;
    let step = 0;

    function update() {
      step++;
      const progress = step / steps;
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      const val = current + diff * eased;
      el.textContent = val.toFixed(decimals) + suffix;
      if (step < steps) requestAnimationFrame(update);
    }

    requestAnimationFrame(update);
    el.classList.add('value-update');
    setTimeout(() => el.classList.remove('value-update'), 600);
  }

  // ───── CLOCK ─────
  function updateClock() {
    const now = new Date();
    document.getElementById('headerTime').textContent = formatTime(now);
    document.getElementById('headerDate').textContent = formatDate(now);
    // CCTV timestamp
    const cctvTime = document.getElementById('cctvTime');
    if (cctvTime) cctvTime.textContent = formatTime(now);
  }

  // ───── HEALTH SCORE CALCULATION ─────
  function calculateHealthScore(bio) {
    let score = 100;

    // pH scoring (ideal 7.0-7.2)
    if (bio.pH >= 7.0 && bio.pH <= 7.2) score -= 0;
    else if (bio.pH >= 6.8 && bio.pH <= 7.5) score -= 5 + Math.abs(bio.pH - 7.1) * 10;
    else if (bio.pH >= 6.5) score -= 25;
    else score -= 45;

    // Temperature scoring (ideal 35-38°C)
    if (bio.temp >= 35 && bio.temp <= 38) score -= 0;
    else if (bio.temp >= 33 && bio.temp <= 40) score -= 8;
    else score -= 25;

    // CH₄ scoring (ideal > 60%)
    if (bio.ch4 >= 60) score -= 0;
    else if (bio.ch4 >= 50) score -= 10 + (60 - bio.ch4);
    else score -= 35;

    // H₂ scoring (ideal < 100 ppm, warning if rising)
    if (bio.h2 < 50) score -= 0;
    else if (bio.h2 < 100) score -= (bio.h2 - 50) * 0.3;
    else score -= 20;

    // ORP scoring (ideal -300 to -400 mV)
    if (bio.orp >= -400 && bio.orp <= -300) score -= 0;
    else if (bio.orp >= -450 && bio.orp <= -250) score -= 10;
    else score -= 30;

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  function determineHealthStatus(bio) {
    // Critical
    if (bio.pH < 6.5) return 'critical';
    if (Math.abs(bio.orp - (-350)) > 80) return 'critical';

    // Warning
    if (bio.pH <= 6.6 || bio.pH > 7.5) return 'warning';
    if (bio.h2 > 80) return 'warning';
    if (bio.ch4 < 55) return 'warning';

    return 'normal';
  }

  // ───── DATA SIMULATION ─────
  function generateMockData() {
    const hour = new Date().getHours();
    const isDaytime = hour >= 6 && hour <= 18;

    // Biogas — gentle drift with occasional anomalies
    const anomaly = Math.random() < 0.08; // 8% chance of anomaly
    if (anomaly) {
      // Simulate a minor warning scenario
      state.biogas.pH = drift(state.biogas.pH, 6.4, 7.6, 0.3);
      state.biogas.h2 = drift(state.biogas.h2, 10, 150, 30);
    } else {
      state.biogas.pH = drift(state.biogas.pH, 6.7, 7.4, 0.08);
      state.biogas.h2 = drift(state.biogas.h2, 8, 60, 5);
    }
    state.biogas.temp = drift(state.biogas.temp, 34, 39, 0.3);
    state.biogas.ch4 = drift(state.biogas.ch4, 48, 68, 1.5);
    state.biogas.orp = drift(state.biogas.orp, -430, -270, 10);

    state.biogas.healthScore = calculateHealthScore(state.biogas);
    state.biogas.status = determineHealthStatus(state.biogas);

    // Solar — depends on time of day
    if (isDaytime) {
      const solarBase = 15 + 35 * Math.sin(((hour - 6) / 12) * Math.PI);
      state.solar.power = clamp(drift(solarBase, 0, 65, 3), 0, 65);
    } else {
      state.solar.power = drift(0, 0, 2, 0.5);
    }
    state.solar.dailyTotal = Math.round((state.solar.dailyTotal + state.solar.power * (CONFIG.updateInterval / 3600000)) * 10) / 10;

    // Track irradiance history for chart
    state.solar.irradianceHistory.push(state.solar.power);
    if (state.solar.irradianceHistory.length > 24) state.solar.irradianceHistory.shift();

    // ESS
    if (Math.random() < 0.15) {
      const modes = ['charging', 'discharging', 'idle'];
      state.ess.mode = modes[Math.floor(Math.random() * modes.length)];
    }
    if (state.ess.mode === 'charging') {
      state.ess.chargePower = drift(state.ess.chargePower, 8, 25, 2);
      state.ess.dischargePower = 0;
      state.ess.soc = clamp(state.ess.soc + rand(0.1, 0.5), 0, 100);
    } else if (state.ess.mode === 'discharging') {
      state.ess.chargePower = 0;
      state.ess.dischargePower = drift(state.ess.dischargePower || 10, 5, 20, 2);
      state.ess.soc = clamp(state.ess.soc - rand(0.1, 0.4), 0, 100);
    } else {
      state.ess.chargePower = 0;
      state.ess.dischargePower = 0;
    }
    state.ess.soc = Math.round(state.ess.soc * 10) / 10;

    // Hydrogen
    state.hydrogen.power = drift(state.hydrogen.power, 5, 12, 0.8);
    state.hydrogen.pressure = drift(state.hydrogen.pressure, 28, 40, 0.5);
    state.hydrogen.efficiency = drift(state.hydrogen.efficiency, 45, 60, 1);

    // Air Quality — varies by time of day (higher during daytime/traffic hours)
    const isRushHour = (hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19);
    const aqBase = isRushHour ? 1.3 : isDaytime ? 1.0 : 0.7;
    state.airQuality.pm25 = drift(state.airQuality.pm25 * aqBase / (state.airQuality.pm25 > 20 ? 1.1 : 1), 5, 55, 2.5);
    state.airQuality.pm25 = clamp(state.airQuality.pm25, 3, 60);
    state.airQuality.pm10 = drift(state.airQuality.pm10, state.airQuality.pm25 * 1.5, state.airQuality.pm25 * 3.5, 4);
    state.airQuality.pm10 = clamp(state.airQuality.pm10, 8, 120);
    state.airQuality.co2 = drift(state.airQuality.co2, 380, 650, 8);
    state.airQuality.voc = drift(state.airQuality.voc, 0.03, 0.45, 0.03);
    // AQI based on PM2.5 (Taiwan EPA standard approximation)
    state.airQuality.aqi = Math.round(state.airQuality.pm25 * 2.8 + Math.random() * 5);
    state.airQuality.aqi = clamp(state.airQuality.aqi, 10, 180);

    // Animal Testing Ground Power Flow
    state.animalHouse.totalPower = drift(state.animalHouse.totalPower, 35, 65, 2.5);
    state.animalHouse.biogasIn = drift(state.animalHouse.biogasIn, 10, 35, 1.2);
    if (state.animalHouse.biogasIn > state.animalHouse.totalPower) {
      state.animalHouse.biogasIn = state.animalHouse.totalPower;
    }
    state.animalHouse.gridIn = state.animalHouse.totalPower - state.animalHouse.biogasIn;
    
    // Round for display
    state.animalHouse.totalPower = Math.round(state.animalHouse.totalPower * 10) / 10;
    state.animalHouse.biogasIn = Math.round(state.animalHouse.biogasIn * 10) / 10;
    state.animalHouse.gridIn = Math.round(state.animalHouse.gridIn * 10) / 10;
  }

  // ───── LOG SYSTEM ─────
  const LOG_MESSAGES = {
    info: [
      '生質能系統數據讀取完成',
      '太陽能逆變器通訊正常',
      '儲能系統 BMS 回報正常',
      '氫燃料電池堆溫度穩定',
      '沼氣流量計校正完成',
      '消化槽攪拌器運轉正常',
      '系統排程備份已完成',
      'SCADA 通訊連線穩定'
    ],
    warning: [
      '消化槽 pH 值偏離最佳範圍',
      '太陽能發電功率低於預期',
      '儲能 SOC 低於 30%',
      '氫氣濃度 H₂ 略有上升',
      'ORP 電位波動幅度增大',
      '沼氣 CH₄ 濃度下降中',
      '環境溫度偏高，注意散熱',
      '空氣品質 PM2.5 濃度上升',
      '案場 VOC 濃度略高'
    ],
    error: [
      '消化槽 pH 低於安全閾值！',
      'ORP 電位劇烈波動，菌種活性異常',
      '儲能系統過溫保護觸發',
      '氫燃料電池通訊中斷'
    ]
  };

  const LOG_SOURCES = ['BIOGAS', 'SOLAR-PV', 'ESS-BMS', 'H2-FC', 'SCADA', 'SENSOR', 'AQI-MON'];

  function generateLog() {
    const now = new Date();
    let type;

    // Log type based on system state
    if (state.biogas.status === 'critical') {
      type = Math.random() < 0.5 ? 'error' : 'warning';
    } else if (state.biogas.status === 'warning') {
      type = Math.random() < 0.3 ? 'warning' : 'info';
    } else {
      const r = Math.random();
      type = r < 0.7 ? 'info' : r < 0.92 ? 'warning' : 'error';
    }

    // Some logs are success type
    if (type === 'info' && Math.random() < 0.3) type = 'success';

    const messages = LOG_MESSAGES[type === 'success' ? 'info' : type];
    const msg = messages[Math.floor(Math.random() * messages.length)];
    const source = LOG_SOURCES[Math.floor(Math.random() * LOG_SOURCES.length)];

    const log = {
      time: formatTime(now),
      type,
      message: msg,
      source
    };

    state.logs.unshift(log);
    if (state.logs.length > CONFIG.maxLogs) state.logs.pop();

    // Count
    if (type === 'info' || type === 'success') state.logCounts.info++;
    else if (type === 'warning') state.logCounts.warning++;
    else state.logCounts.error++;
  }

  // ───── UI UPDATE FUNCTIONS ─────
  function updateKPIs() {
    const totalPower = state.solar.power + state.hydrogen.power + (state.biogas.ch4 / 100 * 15);
    animateValue(document.getElementById('kpiTotalPowerVal'), totalPower, 1);
    animateValue(document.getElementById('kpiBiogasHealthVal'), state.biogas.healthScore, 0);
    animateValue(document.getElementById('kpiSOCVal'), state.ess.soc, 1);

    const carbon = Math.round(state.solar.dailyTotal * 0.5 + totalPower * 0.02);
    animateValue(document.getElementById('kpiCarbonVal'), carbon, 0);

    // SOC trend
    const socTrend = document.getElementById('kpiSOCTrend');
    socTrend.textContent = state.ess.mode === 'charging' ? '⚡ 充電中' : state.ess.mode === 'discharging' ? '🔋 放電中' : '— 待機';
    socTrend.className = 'kpi-trend ' + (state.ess.mode === 'charging' ? 'up' : state.ess.mode === 'discharging' ? 'down' : '');
  }

  function updateBiogasPanel() {
    const bio = state.biogas;

    // Re-calculate values with formatting
    animateValue(document.getElementById('valPH'), bio.pH, 2);
    animateValue(document.getElementById('valTemp'), bio.temp, 1);
    document.getElementById('valCH4').textContent = bio.ch4.toFixed(1) + '%';
    animateValue(document.getElementById('valH2'), bio.h2, 0);
    animateValue(document.getElementById('valORP'), bio.orp, 0);

    // SVG overlay values
    document.getElementById('svgValTemp').textContent = bio.temp.toFixed(1) + '°C';
    document.getElementById('svgValPH').textContent = bio.pH.toFixed(2);
    document.getElementById('svgValCH4').textContent = bio.ch4.toFixed(1) + '%';
    document.getElementById('svgValH2').textContent = bio.h2.toFixed(0) + ' ppm';
    document.getElementById('svgValORP').textContent = bio.orp.toFixed(0) + ' mV';

    // Indicator statuses
    updateIndicatorStatus('statusPH', bio.pH >= 6.8 && bio.pH <= 7.5 ? (bio.pH >= 7.0 && bio.pH <= 7.2 ? 'normal' : 'warning') : 'critical');
    updateIndicatorStatus('statusTemp', bio.temp >= 35 && bio.temp <= 38 ? 'normal' : (bio.temp >= 33 && bio.temp <= 40 ? 'warning' : 'critical'));
    updateIndicatorStatus('statusCH4', bio.ch4 >= 60 ? 'normal' : (bio.ch4 >= 50 ? 'warning' : 'critical'));
    updateIndicatorStatus('statusH2', bio.h2 < 50 ? 'normal' : (bio.h2 < 100 ? 'warning' : 'critical'));
    updateIndicatorStatus('statusORP', (bio.orp >= -400 && bio.orp <= -300) ? 'normal' : (bio.orp >= -450 && bio.orp <= -250 ? 'warning' : 'critical'));

    // Health ring
    const score = bio.healthScore;
    const offset = CONFIG.healthRingCircumference * (1 - score / 100);
    const ring = document.getElementById('healthRingFill');
    ring.setAttribute('stroke-dashoffset', offset);

    const color = bio.status === 'normal' ? 'var(--status-normal)' : bio.status === 'warning' ? 'var(--status-warning)' : 'var(--status-critical)';
    ring.setAttribute('stroke', color);

    const scoreEl = document.getElementById('healthScore');
    scoreEl.textContent = score;
    scoreEl.style.color = color;

    // Health badge
    const badge = document.getElementById('healthStatusBadge');
    badge.className = 'health-status-badge ' + bio.status;
    const statusLabels = { normal: '正常運作', warning: '⚠ 注意觀察', critical: '⛔ 異常警報' };
    badge.innerHTML = `<span class="dot"></span>${statusLabels[bio.status]}`;

    // SVG liquid level (animate based on a slight variation)
    const liquidEl = document.getElementById('svgLiquid');
    const liquidY = 210 + Math.sin(Date.now() / 2000) * 5;
    liquidEl.setAttribute('y', liquidY);
    liquidEl.setAttribute('height', 380 - liquidY);
  }

  function updateIndicatorStatus(elementId, status) {
    const el = document.getElementById(elementId);
    el.className = 'indicator-status ' + status;
  }

  function updateSolarPanel() {
    animateValue(document.getElementById('solarPower'), state.solar.power, 1);
    animateValue(document.getElementById('solarDaily'), state.solar.dailyTotal, 1);
  }

  function updateESSPanel() {
    const ess = state.ess;
    document.getElementById('essSOC').textContent = ess.soc.toFixed(1);
    document.getElementById('essBatteryFill').style.height = ess.soc + '%';
    document.getElementById('essChargePower').textContent = ess.chargePower.toFixed(1) + ' kW';
    document.getElementById('essDischargePower').textContent = ess.dischargePower.toFixed(1) + ' kW';

    const modeBadge = document.getElementById('essModeBadge');
    const modeLabels = { charging: '⚡ 充電中', discharging: '🔋 放電中', idle: '— 待機' };
    modeBadge.className = 'ess-mode-badge ' + ess.mode;
    modeBadge.innerHTML = `<span class="dot"></span>${modeLabels[ess.mode]}`;

    // Color coding on charge/discharge values
    document.getElementById('essChargePower').className = 'value ' + (ess.chargePower > 0 ? 'charging' : '');
    document.getElementById('essDischargePower').className = 'value ' + (ess.dischargePower > 0 ? 'discharging' : '');
  }

  function updateHydrogenPanel() {
    const h2 = state.hydrogen;
    animateValue(document.getElementById('h2Power'), h2.power, 1);
    animateValue(document.getElementById('h2Pressure'), h2.pressure, 1);
    animateValue(document.getElementById('h2Efficiency'), h2.efficiency, 1);
    document.getElementById('h2EfficiencyBar').style.width = h2.efficiency + '%';
  }

  // ───── ANIMAL HOUSE UI UPDATE ─────
  function updateAnimalHousePanel() {
    const data = state.animalHouse;
    animateValue(document.getElementById('svgGridIn'), data.gridIn, 1);
    document.getElementById('svgGridIn').textContent = data.gridIn.toFixed(1) + ' kW';
    
    animateValue(document.getElementById('svgBiogasIn'), data.biogasIn, 1);
    document.getElementById('svgBiogasIn').textContent = data.biogasIn.toFixed(1) + ' kW';
    
    animateValue(document.getElementById('svgAnimalTotal'), data.totalPower, 1);
    document.getElementById('svgAnimalTotal').textContent = data.totalPower.toFixed(1) + ' kW';
    
    // Modify animation speeds based on power
    const gridSpeed = Math.max(0.5, 3 - (data.gridIn / 15)); // between 0.5s and 3s
    const biogasSpeed = Math.max(0.5, 3 - (data.biogasIn / 15));
    
    const gridLine = document.querySelector('.flow-line-grid');
    const biogasLine = document.querySelector('.flow-line-biogas');
    
    if (gridLine) gridLine.style.animationDuration = gridSpeed + 's';
    if (biogasLine) biogasLine.style.animationDuration = biogasSpeed + 's';
  }

  // ───── AIR QUALITY UI UPDATE ─────
  function updateAirQuality() {
    const aq = state.airQuality;

    // AQI classification (Taiwan EPA standard)
    let aqiClass, aqiLabel;
    if (aq.aqi <= 50) { aqiClass = 'good'; aqiLabel = '良好'; }
    else if (aq.aqi <= 100) { aqiClass = 'moderate'; aqiLabel = '普通'; }
    else if (aq.aqi <= 150) { aqiClass = 'unhealthy-sensitive'; aqiLabel = '敏感'; }
    else { aqiClass = 'unhealthy'; aqiLabel = '不良'; }

    // Badge
    const badge = document.getElementById('aqiBadge');
    badge.className = 'aqi-badge ' + aqiClass;
    document.getElementById('aqiValue').textContent = aq.aqi;
    document.getElementById('aqiLevel').textContent = aqiLabel;

    // Dropdown metrics
    animateValue(document.getElementById('aqiPM25'), aq.pm25, 1);
    animateValue(document.getElementById('aqiPM10'), aq.pm10, 1);
    animateValue(document.getElementById('aqiCO2'), aq.co2, 0);
    animateValue(document.getElementById('aqiVOC'), aq.voc, 2);

    // Progress bars (normalized to max safe thresholds)
    document.getElementById('aqiPM25Bar').style.width = Math.min(100, (aq.pm25 / 50) * 100) + '%';
    document.getElementById('aqiPM10Bar').style.width = Math.min(100, (aq.pm10 / 150) * 100) + '%';
    document.getElementById('aqiCO2Bar').style.width = Math.min(100, (aq.co2 / 1000) * 100) + '%';
    document.getElementById('aqiVOCBar').style.width = Math.min(100, (aq.voc / 1.0) * 100) + '%';

    // Update timestamp
    document.getElementById('aqiUpdateTime').textContent = formatTime(new Date());
  }

  function updateLogs() {
    const container = document.getElementById('logsContainer');
    container.innerHTML = state.logs.map(log => `
      <div class="log-entry">
        <span class="log-time">${log.time}</span>
        <span class="log-type ${log.type}">${log.type.toUpperCase()}</span>
        <span class="log-message">${log.message}</span>
        <span class="log-source">${log.source}</span>
      </div>
    `).join('');

    document.getElementById('logCountInfo').textContent = state.logCounts.info;
    document.getElementById('logCountWarn').textContent = state.logCounts.warning;
    document.getElementById('logCountErr').textContent = state.logCounts.error;
  }

  // ───── CHART.JS — Solar Irradiance ─────
  let solarChartInstance = null;

  function initSolarChart() {
    // Seed initial data
    const now = new Date();
    for (let i = 23; i >= 0; i--) {
      const h = (now.getHours() - i + 24) % 24;
      const isDaytime = h >= 6 && h <= 18;
      const base = isDaytime ? 15 + 35 * Math.sin(((h - 6) / 12) * Math.PI) : 0;
      state.solar.irradianceHistory.push(clamp(base + rand(-5, 5), 0, 65));
    }

    const ctx = document.getElementById('solarChart').getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 80);
    gradient.addColorStop(0, 'rgba(251, 191, 36, 0.35)');
    gradient.addColorStop(1, 'rgba(251, 191, 36, 0.02)');

    solarChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: state.solar.irradianceHistory.map((_, i) => {
          const h = (now.getHours() - (state.solar.irradianceHistory.length - 1 - i) + 24) % 24;
          return h + ':00';
        }),
        datasets: [{
          data: state.solar.irradianceHistory,
          borderColor: '#FBBF24',
          borderWidth: 2,
          backgroundColor: gradient,
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: '#FBBF24',
          pointHoverBorderColor: '#fff',
          pointHoverBorderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.9)',
            titleColor: '#94A3B8',
            bodyColor: '#FBBF24',
            borderColor: 'rgba(251, 191, 36, 0.2)',
            borderWidth: 1,
            cornerRadius: 8,
            padding: 8,
            titleFont: { size: 10 },
            bodyFont: { size: 12, weight: 'bold' },
            callbacks: {
              label: (ctx) => ctx.parsed.y.toFixed(1) + ' kW'
            }
          }
        },
        scales: {
          x: {
            display: true,
            grid: { color: 'rgba(0, 0, 0, 0.05)' },
            ticks: { color: '#999', font: { size: 8 }, maxRotation: 0, maxTicksLimit: 6 }
          },
          y: {
            display: true,
            min: 0,
            grid: { color: 'rgba(0, 0, 0, 0.05)' },
            ticks: { color: '#999', font: { size: 8 }, maxTicksLimit: 4 }
          }
        },
        interaction: {
          intersect: false,
          mode: 'index'
        }
      }
    });
  }

  function updateSolarChart() {
    if (!solarChartInstance) return;
    const now = new Date();

    solarChartInstance.data.datasets[0].data = state.solar.irradianceHistory;
    solarChartInstance.data.labels = state.solar.irradianceHistory.map((_, i) => {
      const h = (now.getHours() - (state.solar.irradianceHistory.length - 1 - i) + 24) % 24;
      return h + ':00';
    });
    solarChartInstance.update('none');
  }

  // ───── EMERGENCY BUTTON ─────
  function initEmergencyButton() {
    const btn = document.getElementById('btnEmergency');
    btn.addEventListener('click', () => {
      const confirmed = confirm('⚠️ 確定要執行緊急停機嗎？\n此操作將停止所有能源系統運作。');
      if (confirmed) {
        alert('🛑 緊急停機指令已送出！\n（DEMO 模式 — 實際系統未連接）');
        state.logs.unshift({
          time: formatTime(new Date()),
          type: 'error',
          message: '🛑 緊急停機指令已執行',
          source: 'SYSTEM'
        });
        state.logCounts.error++;
        updateLogs();
      }
    });
  }

  // ───── MIXER ANIMATION ─────
  let mixerAngle = 0;
  function animateMixer() {
    mixerAngle = (mixerAngle + 1.5) % 360;
    const blade = document.getElementById('mixerBlade');
    if (blade) {
      blade.setAttribute('transform', `rotate(${mixerAngle} 320 200)`);
    }
    requestAnimationFrame(animateMixer);
  }

  // ───── GENAI SUMMARY ENGINE ─────
  let genaiUpdateCounter = 0;
  const GENAI_UPDATE_INTERVAL = 5; // update every N cycles (5 * 3s = 15s)
  let genaiTypingTimer = null;

  function generateAISummary() {
    const bio = state.biogas;
    const sol = state.solar;
    const ess = state.ess;
    const h2 = state.hydrogen;
    const aq = state.airQuality;
    const hour = new Date().getHours();

    const summaries = [];

    // Biogas-focused summaries
    if (bio.status === 'critical') {
      summaries.push(
        `⚠️ 消化槽運行異常：pH ${bio.pH.toFixed(2)} 偏離正常範圍，甲烷濃度 ${bio.ch4.toFixed(1)}%，建議立即檢視進料組成並啟動應急方案。健康度評分 ${bio.healthScore}/100。`,
        `🔴 系統警示｜厭氧消化槽健康度降至 ${bio.healthScore} 分，ORP 值 ${bio.orp.toFixed(0)} mV，H₂ 濃度 ${bio.h2.toFixed(0)} ppm。AI 建議優先排查進料品質與溫度控制系統。`,
        `⛔ 生質能子系統偵測到多項異常指標：pH ${bio.pH.toFixed(2)}、溫度 ${bio.temp.toFixed(1)}°C。系統已自動提升監控頻率，建議現場人員確認攪拌器與加溫系統運作狀態。`
      );
    } else if (bio.status === 'warning') {
      summaries.push(
        `⚡ 注意｜消化槽部分指標偏移：pH ${bio.pH.toFixed(2)}，CH₄ ${bio.ch4.toFixed(1)}%，ORP ${bio.orp.toFixed(0)} mV。目前健康度 ${bio.healthScore}/100，系統持續追蹤趨勢。`,
        `🟡 AI 分析｜生質能系統需關注：溫度 ${bio.temp.toFixed(1)}°C，氫氣濃度 ${bio.h2.toFixed(0)} ppm 有上升趨勢。建議觀察未來30分鐘數據變化後決定是否調整進料速率。`,
        `📊 運行提示｜厭氧消化效率略有波動，當前甲烷產率 ${bio.ch4.toFixed(1)}%，預計產氣量較昨日同期下降約 ${rand(3,12).toFixed(0)}%。AI 建議微調進料 C/N 比。`
      );
    } else {
      summaries.push(
        `✅ 案場運行正常｜消化槽健康度 ${bio.healthScore}/100，pH ${bio.pH.toFixed(2)}，CH₄ ${bio.ch4.toFixed(1)}%，產氣穩定。太陽能輸出 ${sol.power.toFixed(1)} kW，儲能 SOC ${ess.soc.toFixed(1)}%。微電網整體運行良好。`,
        `🟢 系統穩定運行中｜生質能產氣效率達 ${bio.ch4.toFixed(1)}%，消化槽溫度 ${bio.temp.toFixed(1)}°C 維持在最適區間。今日累計太陽能發電 ${sol.dailyTotal.toFixed(1)} kWh，減碳效益持續累積。`,
        `📈 AI 摘要｜全系統健康運轉。厭氧消化槽 ORP ${bio.orp.toFixed(0)} mV (正常)，H₂ ${bio.h2.toFixed(0)} ppm (安全)。氫燃料電池效率 ${h2.efficiency.toFixed(1)}%，儲能系統${ess.mode === 'charging' ? '充電中' : ess.mode === 'discharging' ? '放電中' : '待機'}。`
      );
    }

    // Add energy and air quality context
    if (sol.power > 30 && hour >= 9 && hour <= 15) {
      summaries.push(
        `☀️ 日照充沛｜太陽能系統輸出 ${sol.power.toFixed(1)} kW，今日累計 ${sol.dailyTotal.toFixed(1)} kWh。消化槽健康度 ${bio.healthScore}/100，pH ${bio.pH.toFixed(2)}，空氣品質 AQI ${aq.aqi}（${aq.aqi <= 50 ? '良好' : aq.aqi <= 100 ? '普通' : '注意'}）。`
      );
    }

    if (aq.aqi > 100) {
      summaries.push(
        `🌫️ 空品提醒｜案場 AQI ${aq.aqi}，PM2.5 達 ${aq.pm25.toFixed(1)} μg/m³。建議戶外作業人員配戴防護口罩。微電網系統持續穩定供電，消化槽健康度 ${bio.healthScore}/100。`
      );
    }

    if (ess.soc < 30) {
      summaries.push(
        `🔋 儲能警示｜ESS SOC 降至 ${ess.soc.toFixed(1)}%，${ess.mode === 'discharging' ? '正在放電 ' + ess.dischargePower.toFixed(1) + ' kW' : '建議啟動充電排程'}。AI 預估以目前負載需求，剩餘備用時間約 ${Math.round(ess.soc / 5)} 小時。`
      );
    }

    // Pick a random summary from candidates
    const summary = summaries[Math.floor(Math.random() * summaries.length)];
    typewriterEffect(summary);
  }

  function typewriterEffect(text) {
    const el = document.getElementById('genaiText');
    const cursor = document.querySelector('.genai-cursor');
    if (!el) return;

    // Clear any ongoing typing
    if (genaiTypingTimer) clearInterval(genaiTypingTimer);

    el.textContent = '';
    if (cursor) cursor.style.display = 'inline-block';
    let i = 0;

    genaiTypingTimer = setInterval(() => {
      if (i < text.length) {
        el.textContent += text.charAt(i);
        i++;
      } else {
        clearInterval(genaiTypingTimer);
        genaiTypingTimer = null;
        // Hide cursor after done typing
        setTimeout(() => {
          if (cursor) cursor.style.display = 'none';
        }, 2000);
      }
    }, 25); // 25ms per character — fast but readable

    // Update timestamp
    document.getElementById('genaiTime').textContent = formatTime(new Date());
  }

  // ───── MAIN UPDATE CYCLE ─────
  function updateAll() {
    generateMockData();
    generateLog();

    updateKPIs();
    updateBiogasPanel();
    updateSolarPanel();
    updateSolarChart();
    updateESSPanel();
    updateHydrogenPanel();
    updateAnimalHousePanel();
    updateAirQuality();
    updateLogs();

    // GenAI summary — update every N cycles
    genaiUpdateCounter++;
    if (genaiUpdateCounter >= GENAI_UPDATE_INTERVAL) {
      genaiUpdateCounter = 0;
      generateAISummary();
    }
  }

  // ───── INITIALIZATION ─────
  function init() {
    console.log('🟢 NCYU Smart Microgrid Dashboard — Initializing...');

    // Clock
    updateClock();
    setInterval(updateClock, CONFIG.clockInterval);

    // Initialize solar chart
    initSolarChart();

    // Emergency button
    initEmergencyButton();

    // AI Chat
    initAIChat();

    // Mixer animation
    animateMixer();

    // Initial data + first render
    generateMockData();
    generateLog();
    generateLog();
    generateLog();
    updateKPIs();
    updateBiogasPanel();
    updateSolarPanel();
    updateESSPanel();
    updateHydrogenPanel();
    updateAnimalHousePanel();
    updateAirQuality();
    updateLogs();

    // GenAI initial summary (after short delay)
    setTimeout(generateAISummary, 800);

    // Start update cycle
    setInterval(updateAll, CONFIG.updateInterval);

    console.log('🟢 Dashboard ready. Real-time updates every', CONFIG.updateInterval / 1000, 'seconds.');
  }

  // ───── AI CHAT SYSTEM ─────
  function initAIChat() {
    const fab = document.getElementById('aiChatFab');
    const dialog = document.getElementById('aiChatDialog');
    const closeBtn = document.getElementById('aiChatClose');
    const sendBtn = document.getElementById('chatSendBtn');
    const input = document.getElementById('chatInput');
    const chips = document.querySelectorAll('.chat-chip');

    // Toggle chat
    fab.addEventListener('click', () => {
      const isOpen = dialog.classList.toggle('open');
      fab.classList.toggle('active');
      if (isOpen && document.getElementById('chatMessages').children.length === 0) {
        // Welcome message
        addAIMessage('👋 你好！我是嘉大智慧微電網的 AI 助理。\n\n你可以詢問案場即時運行狀況，例如消化槽健康度、太陽能發電、儲能狀態、空氣品質等。\n\n請直接輸入問題，或點選下方快速提問。');
      }
      if (isOpen) setTimeout(() => input.focus(), 350);
    });

    closeBtn.addEventListener('click', () => {
      dialog.classList.remove('open');
      fab.classList.remove('active');
    });

    // Send message
    function sendMessage() {
      const text = input.value.trim();
      if (!text) return;
      addUserMessage(text);
      input.value = '';
      showTypingIndicator();
      setTimeout(() => {
        removeTypingIndicator();
        const response = generateChatResponse(text);
        addAIMessage(response);
      }, 800 + Math.random() * 1200);
    }

    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendMessage();
    });

    // Quick chips
    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        const q = chip.dataset.q;
        input.value = q;
        sendMessage();
      });
    });
  }

  function addUserMessage(text) {
    const container = document.getElementById('chatMessages');
    const time = formatTime(new Date());
    const msgEl = document.createElement('div');
    msgEl.className = 'chat-msg user';
    msgEl.innerHTML = `
      <div class="chat-msg-avatar">👤</div>
      <div class="chat-msg-bubble">${escapeHtml(text)}<span class="chat-msg-time">${time}</span></div>
    `;
    container.appendChild(msgEl);
    container.scrollTop = container.scrollHeight;
  }

  function addAIMessage(text) {
    const container = document.getElementById('chatMessages');
    const time = formatTime(new Date());
    const msgEl = document.createElement('div');
    msgEl.className = 'chat-msg ai';
    msgEl.innerHTML = `
      <div class="chat-msg-avatar">✦</div>
      <div class="chat-msg-bubble">${text.replace(/\n/g, '<br>')}<span class="chat-msg-time">Gemini · ${time}</span></div>
    `;
    container.appendChild(msgEl);
    container.scrollTop = container.scrollHeight;
  }

  function showTypingIndicator() {
    const container = document.getElementById('chatMessages');
    const typing = document.createElement('div');
    typing.className = 'chat-msg ai';
    typing.id = 'typingIndicator';
    typing.innerHTML = `
      <div class="chat-msg-avatar">✦</div>
      <div class="chat-msg-bubble"><div class="typing-indicator"><span></span><span></span><span></span></div></div>
    `;
    container.appendChild(typing);
    container.scrollTop = container.scrollHeight;
  }

  function removeTypingIndicator() {
    const el = document.getElementById('typingIndicator');
    if (el) el.remove();
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function generateChatResponse(question) {
    const bio = state.biogas;
    const sol = state.solar;
    const ess = state.ess;
    const h2 = state.hydrogen;
    const aq = state.airQuality;
    const q = question.toLowerCase();

    // Biogas / digester queries
    if (q.includes('消化槽') || q.includes('健康') || q.includes('ph') || q.includes('甲烷') || q.includes('生質能') || q.includes('沼氣')) {
      const statusLabel = bio.status === 'normal' ? '🟢 正常' : bio.status === 'warning' ? '🟡 注意' : '🔴 異常';
      return `<b>🧪 消化槽即時狀態</b><br><br>` +
        `健康度評分：<b>${bio.healthScore}/100</b> ${statusLabel}<br><br>` +
        `📋 各項指標：<br>` +
        `• pH 酸鹼值：<b>${bio.pH.toFixed(2)}</b>（正常 6.8-7.5）${bio.pH >= 6.8 && bio.pH <= 7.5 ? ' ✅' : ' ⚠️'}<br>` +
        `• 溫度：<b>${bio.temp.toFixed(1)}°C</b>（正常 35-38°C）${bio.temp >= 35 && bio.temp <= 38 ? ' ✅' : ' ⚠️'}<br>` +
        `• CH₄ 甲烷：<b>${bio.ch4.toFixed(1)}%</b>（正常 >60%）${bio.ch4 >= 60 ? ' ✅' : ' ⚠️'}<br>` +
        `• H₂ 氫氣：<b>${bio.h2.toFixed(0)} ppm</b>（正常 <100）${bio.h2 < 100 ? ' ✅' : ' ⚠️'}<br>` +
        `• ORP：<b>${bio.orp.toFixed(0)} mV</b>（正常 -300~-400）${bio.orp >= -400 && bio.orp <= -300 ? ' ✅' : ' ⚠️'}<br><br>` +
        (bio.status !== 'normal'
          ? `⚠️ <b>建議</b>：${bio.pH < 6.8 ? '目前 pH 偏低，建議檢查進料組成並適量添加鹼性緩衝劑。' : bio.ch4 < 60 ? '甲烷濃度偏低，建議確認進料C/N比並觀察產氣趨勢。' : '部分指標偏離最適範圍，建議持續觀察。'}`
          : `✅ 所有指標皆在正常範圍內，消化槽運行穩定。`);
    }

    // Solar queries
    if (q.includes('太陽能') || q.includes('太陽') || q.includes('solar') || q.includes('光電') || q.includes('日照')) {
      return `<b>☀️ 太陽能發電系統</b><br><br>` +
        `• 當前功率：<b>${sol.power.toFixed(1)} kW</b><br>` +
        `• 今日累計：<b>${sol.dailyTotal.toFixed(1)} kWh</b><br>` +
        `• 狀態：${sol.power > 20 ? '🟢 日照充沛，發電效率良好' : sol.power > 5 ? '🟡 日照一般，發電量中等' : '🌙 日照不足或夜間時段'}<br><br>` +
        `預估今日總發電量約 ${(sol.dailyTotal * 1.1).toFixed(0)} kWh，減碳效益約 ${(sol.dailyTotal * 0.5).toFixed(0)} kg CO₂。`;
    }

    // ESS queries
    if (q.includes('儲能') || q.includes('電池') || q.includes('soc') || q.includes('ess') || q.includes('充電') || q.includes('放電')) {
      const modeLabel = ess.mode === 'charging' ? '⚡ 充電中' : ess.mode === 'discharging' ? '🔋 放電中' : '— 待機';
      return `<b>🔋 儲能系統 (ESS)</b><br><br>` +
        `• SOC 電量：<b>${ess.soc.toFixed(1)}%</b><br>` +
        `• 運行模式：<b>${modeLabel}</b><br>` +
        `• 充電功率：<b>${ess.chargePower.toFixed(1)} kW</b><br>` +
        `• 放電功率：<b>${ess.dischargePower.toFixed(1)} kW</b><br><br>` +
        `${ess.soc < 30 ? '⚠️ SOC 偏低，建議優先安排充電排程。' : ess.soc > 80 ? '✅ 電量充沛，儲備電力充足。' : '✅ 電量適中，系統運行正常。'}` +
        `<br>預估備用供電時間約 <b>${Math.round(ess.soc / 5)} 小時</b>。`;
    }

    // Hydrogen queries
    if (q.includes('氫') || q.includes('燃料電池') || q.includes('h2') || q.includes('hydrogen') || q.includes('電堆')) {
      return `<b>⚡ 氫燃料電池系統</b><br><br>` +
        `• 發電功率：<b>${h2.power.toFixed(1)} kW</b><br>` +
        `• 氫氣壓力：<b>${h2.pressure.toFixed(1)} MPa</b><br>` +
        `• 電堆效率：<b>${h2.efficiency.toFixed(1)}%</b><br><br>` +
        `${h2.efficiency > 50 ? '✅ 電堆效率良好，系統運行穩定。' : '🟡 電堆效率偏低，建議檢查氫氣供應壓力。'}`;
    }

    // Air quality queries
    if (q.includes('空氣') || q.includes('aqi') || q.includes('pm2.5') || q.includes('pm10') || q.includes('品質') || q.includes('co2') || q.includes('voc')) {
      const aqiLabel = aq.aqi <= 50 ? '🟢 良好' : aq.aqi <= 100 ? '🟡 普通' : aq.aqi <= 150 ? '🟠 對敏感族群不健康' : '🔴 不良';
      return `<b>🌫️ 案場空氣品質</b><br><br>` +
        `• AQI 指數：<b>${aq.aqi}</b> ${aqiLabel}<br>` +
        `• PM2.5：<b>${aq.pm25.toFixed(1)} μg/m³</b>${aq.pm25 > 35 ? ' ⚠️' : ' ✅'}<br>` +
        `• PM10：<b>${aq.pm10.toFixed(1)} μg/m³</b>${aq.pm10 > 100 ? ' ⚠️' : ' ✅'}<br>` +
        `• CO₂：<b>${aq.co2.toFixed(0)} ppm</b>${aq.co2 > 600 ? ' ⚠️' : ' ✅'}<br>` +
        `• VOC：<b>${aq.voc.toFixed(2)} mg/m³</b>${aq.voc > 0.3 ? ' ⚠️' : ' ✅'}<br><br>` +
        `${aq.aqi > 100 ? '⚠️ 建議戶外作業人員配戴防護口罩，並注意案場通風狀況。' : '✅ 空氣品質良好，適合正常作業。'}`;
    }

    // Overview / general queries
    if (q.includes('整體') || q.includes('總覽') || q.includes('狀況') || q.includes('目前') || q.includes('運行') || q.includes('案場') || q.includes('怎麼樣')) {
      const totalPower = sol.power + h2.power + (bio.ch4 / 100 * 15);
      const statusEmoji = bio.status === 'normal' ? '🟢' : bio.status === 'warning' ? '🟡' : '🔴';
      return `<b>📊 案場運行總覽</b><br><br>` +
        `${statusEmoji} <b>系統狀態：${bio.status === 'normal' ? '運行正常' : bio.status === 'warning' ? '部分指標需注意' : '需即時處理'}</b><br><br>` +
        `⚡ 總發電功率：<b>${totalPower.toFixed(1)} kW</b><br>` +
        `🧪 消化槽健康：<b>${bio.healthScore}/100</b><br>` +
        `☀️ 太陽能：<b>${sol.power.toFixed(1)} kW</b>（今日 ${sol.dailyTotal.toFixed(1)} kWh）<br>` +
        `🔋 儲能 SOC：<b>${ess.soc.toFixed(1)}%</b>（${ess.mode === 'charging' ? '充電中' : ess.mode === 'discharging' ? '放電中' : '待機'}）<br>` +
        `⚡ 氫燃料電池：<b>${h2.power.toFixed(1)} kW</b>（效率 ${h2.efficiency.toFixed(1)}%）<br>` +
        `🌫️ 空氣品質 AQI：<b>${aq.aqi}</b><br><br>` +
        `🌱 今日累計減碳約 <b>${Math.round(sol.dailyTotal * 0.5 + totalPower * 0.02)} kg CO₂</b>`;
    }

    // Fallback — general helpful response
    return `感謝你的提問！以下是目前案場的快速摘要：<br><br>` +
      `• 消化槽健康度：<b>${bio.healthScore}/100</b><br>` +
      `• 總發電功率：<b>${(sol.power + h2.power + bio.ch4 / 100 * 15).toFixed(1)} kW</b><br>` +
      `• 儲能 SOC：<b>${ess.soc.toFixed(1)}%</b><br><br>` +
      `你可以進一步詢問特定系統，例如：<br>` +
      `📝 「消化槽健康狀況」「太陽能發電量」「空氣品質」等`;
  }

  // Boot
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
