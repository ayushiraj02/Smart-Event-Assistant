// const API_BASE_URL = 'http://127.0.0.1:8000/api';
const API_BASE_URL = 'https://smart-event-assistant.onrender.com';

const findButton = document.getElementById('findButton');
const modeToggle = document.getElementById('modeToggle');
const zonesList = document.getElementById('zonesList');
const recommendationContent = document.getElementById('recommendationContent');
const loading = document.getElementById('loading');
const errorMessage = document.getElementById('errorMessage');
const alertBanner = document.getElementById('alertBanner');
const routeSuggestionText = document.getElementById('routeSuggestionText');
const metricTotalZones = document.getElementById('metricTotalZones');
const metricLeastCrowded = document.getElementById('metricLeastCrowded');
const metricAvgWait = document.getElementById('metricAvgWait');
const chatInput = document.getElementById('chatInput');
const chatButton = document.getElementById('chatButton');
const chatOutput = document.getElementById('chatOutput');

let activeMode = 'entry';
let refreshTimerId = null;

function zoneTypeFromName(name) {
  const lowerName = name.toLowerCase();
  if (lowerName.includes('food')) {
    return 'food';
  }
  if (lowerName.includes('exit')) {
    return 'exit';
  }
  if (lowerName.includes('restroom')) {
    return 'restroom';
  }
  if (lowerName.includes('gate')) {
    return 'gate';
  }
  return 'zone';
}

function zoneIconMarkup(type) {
  if (type === 'gate') {
    return '<span class="zone-icon" aria-hidden="true">GT</span>';
  }
  if (type === 'food') {
    return '<span class="zone-icon" aria-hidden="true">FD</span>';
  }
  if (type === 'exit') {
    return '<span class="zone-icon" aria-hidden="true">EX</span>';
  }
  return '<span class="zone-icon" aria-hidden="true">Z</span>';
}

function scoreClass(score) {
  if (score >= 70) {
    return 'score-green';
  }
  if (score >= 40) {
    return 'score-yellow';
  }
  return 'score-red';
}

function zoneCardMarkup(zone, index) {
  const safeStatus = (zone.status || 'Unknown').replace(' crowd', '');
  const zoneType = zoneTypeFromName(zone.name);
  const suggestedAction =
    zone.score >= 70
      ? 'Use this zone for faster access'
      : zone.score >= 40
        ? 'Moderate crowd, proceed with caution'
        : 'High congestion, consider alternatives';

  return `
    <article class="zone-card ${scoreClass(zone.score)}" style="animation-delay: ${index * 60}ms">
      <div class="zone-head">
        ${zoneIconMarkup(zoneType)}
        <h3 class="zone-name">${zone.name}</h3>
      </div>
      <div class="zone-meta">
        <span>Crowd score: <strong>${zone.score}%</strong></span>
        <span>Wait time: <strong>${zone.waitTime} min</strong></span>
      </div>
      <span class="status-pill status-${safeStatus.toLowerCase()}">${safeStatus} crowd</span>
      <p class="suggested-action">${suggestedAction}</p>
    </article>
  `;
}

function updateRecommendation(zones) {
  const topTwo = zones
    .filter((zone) => zone.score > 70)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);

  if (!topTwo.length) {
    recommendationContent.innerHTML = '<p class="muted">No zone crossed the recommendation threshold (> 70).</p>';
    return;
  }

  recommendationContent.innerHTML = `
    <div class="top-zone-grid">
      ${topTwo
        .map(
          (zone, idx) => `
            <article class="top-zone-card ${scoreClass(zone.score)}">
              <h4>#${idx + 1} ${zone.name}</h4>
              <p>Crowd score: <strong>${zone.score}%</strong> | Wait time: <strong>${zone.waitTime} min</strong></p>
              <p>Use this zone for faster access and less waiting time</p>
            </article>
          `
        )
        .join('')}
    </div>
  `;
}

function renderZones(zones) {
  zonesList.innerHTML = zones.map((zone, index) => zoneCardMarkup(zone, index)).join('');
}

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.classList.remove('hidden');
}

function clearError() {
  errorMessage.textContent = '';
  errorMessage.classList.add('hidden');
}

async function fetchJson(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json'
    },
    ...options
  });

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const data = await response.json();
      if (data && data.detail) {
        detail = data.detail;
      }
    } catch (error) {
      // Ignore JSON parsing errors and use status text fallback.
    }
    throw new Error(`API request failed: ${detail}`);
  }

  return response.json();
}

function zoneMatchesPreference(zoneName, preference) {
  const lowerName = zoneName.toLowerCase();
  if (preference === 'food') {
    return lowerName.includes('food');
  }
  if (preference === 'exit') {
    return lowerName.includes('exit');
  }
  if (preference === 'entry') {
    return lowerName.includes('gate');
  }
  return true;
}

function zoneCategory(zoneName) {
  const lowerName = zoneName.toLowerCase();
  if (lowerName.includes('gate')) {
    return 'entry';
  }
  if (lowerName.includes('food')) {
    return 'food';
  }
  if (lowerName.includes('exit')) {
    return 'exit';
  }
  return 'other';
}

function updateDashboard(zones) {
  metricTotalZones.textContent = String(zones.length);
  if (!zones.length) {
    metricLeastCrowded.textContent = '-';
    metricAvgWait.textContent = '0 min';
    return;
  }

  const leastCrowded = zones.reduce((least, zone) =>
    zone.crowdLevel < least.crowdLevel ? zone : least
  );
  const totalWait = zones.reduce((sum, zone) => sum + zone.waitTime, 0);
  const avgWait = Math.round((totalWait / zones.length) * 10) / 10;

  metricLeastCrowded.textContent = leastCrowded.name;
  metricAvgWait.textContent = `${avgWait} min`;
}

function updateAlerts(alertZones, mode) {
  const filteredAlerts = alertZones.filter((zone) => zoneMatchesPreference(zone.name, mode));
  if (!filteredAlerts.length) {
    alertBanner.textContent = '';
    alertBanner.classList.add('hidden');
    return;
  }

  const names = filteredAlerts.map((zone) => zone.name).join(', ');
  alertBanner.textContent = `⚠ This area is overcrowded, consider alternative routes: ${names}`;
  alertBanner.classList.remove('hidden');
}

function updateBestRoute(zones) {
  const bestByCategory = ['entry', 'food', 'exit'].map((category) => {
    const categoryZones = zones.filter((zone) => zoneCategory(zone.name) === category);
    if (!categoryZones.length) {
      return null;
    }
    return categoryZones.sort((a, b) => b.score - a.score)[0];
  });

  const routeNames = bestByCategory.map((zone) => zone && zone.name);
  if (routeNames.some((name) => !name)) {
    routeSuggestionText.textContent = 'Route suggestion unavailable.';
    return;
  }

  routeSuggestionText.textContent = `Use ${routeNames[0]} → ${routeNames[1]} → ${routeNames[2]}`;
}

async function getScoredZones() {
  const zones = await fetchJson('/zones');
  const scoreRequests = zones.map(async (zone) => {
    const scoreData = await fetchJson('/score', {
      method: 'POST',
      body: JSON.stringify({ zone_id: zone.id })
    });

    return {
      id: zone.id,
      name: zone.name,
      crowdLevel: zone.crowd_level,
      waitTime: zone.wait_time,
      score: scoreData.crowd_score,
      status: (scoreData.status || '').replace(' crowd', '')
    };
  });

  return Promise.all(scoreRequests);
}

async function getRecommendedZones() {
  const recommendData = await fetchJson('/recommend', {
    method: 'POST'
  });

  const recommended = recommendData.recommended_zones || [];

  return recommended.map((zone) => ({
    id: zone.id,
    name: zone.name,
    crowdLevel: zone.crowd_level,
    waitTime: zone.wait_time,
    score: 100 - zone.crowd_level,
    status: (100 - zone.crowd_level) > 70 ? 'Low' : (100 - zone.crowd_level) >= 40 ? 'Medium' : 'High'
  }));
}

async function getAlertZones() {
  const data = await fetchJson('/alerts');
  return data.overcrowded_zones || [];
}

function showLoading(isLoading) {
  loading.classList.toggle('hidden', !isLoading);
  findButton.disabled = isLoading;
  findButton.textContent = isLoading ? 'Finding...' : 'Refresh Insights';
}

async function loadZonesAndRecommendations(options = {}) {
  const { showLoader = true } = options;
  if (showLoader) {
    showLoading(true);
  }
  clearError();

  try {
    const [scoredZones, recommendedZones, alertZones] = await Promise.all([
      getScoredZones(),
      getRecommendedZones(),
      getAlertZones()
    ]);

    const filteredScoredZones = scoredZones
      .filter((zone) => zoneMatchesPreference(zone.name, activeMode))
      .sort((a, b) => b.score - a.score);

    const filteredRecommendedZones = recommendedZones
      .filter((zone) => zoneMatchesPreference(zone.name, activeMode))
      .sort((a, b) => b.score - a.score);

    updateDashboard(filteredScoredZones);
    updateAlerts(alertZones, activeMode);
    updateBestRoute(scoredZones);
    renderZones(filteredScoredZones);
    updateRecommendation(filteredRecommendedZones);
  } catch (error) {
    zonesList.innerHTML = '';
    recommendationContent.innerHTML = '<p class="muted">Recommendations unavailable.</p>';
    alertBanner.classList.add('hidden');
    showError(error.message || 'Something went wrong while fetching zone data.');
  } finally {
    if (showLoader) {
      showLoading(false);
    } else {
      loading.classList.add('hidden');
      findButton.disabled = false;
      findButton.textContent = 'Refresh Insights';
    }
  }
}

async function askAssistant() {
  const question = chatInput.value.trim();
  if (!question) {
    chatOutput.textContent = 'Please enter a question to continue.';
    return;
  }

  chatButton.disabled = true;
  chatButton.textContent = 'Thinking...';

  try {
    const response = await fetchJson('/chat', {
      method: 'POST',
      body: JSON.stringify({ question })
    });
    chatOutput.textContent = response.answer || 'No response available.';
  } catch (error) {
    chatOutput.textContent = error.message || 'Unable to fetch assistant response.';
  } finally {
    chatButton.disabled = false;
    chatButton.textContent = 'Ask';
  }
}

modeToggle.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement) || !target.dataset.mode) {
    return;
  }

  activeMode = target.dataset.mode;
  modeToggle.querySelectorAll('.mode-btn').forEach((btn) => btn.classList.remove('active'));
  target.classList.add('active');
  loadZonesAndRecommendations();
});

chatButton.addEventListener('click', askAssistant);
chatInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    askAssistant();
  }
});

findButton.addEventListener('click', loadZonesAndRecommendations);

function startAutoRefresh() {
  if (refreshTimerId) {
    window.clearInterval(refreshTimerId);
  }

  refreshTimerId = window.setInterval(() => {
    loadZonesAndRecommendations({ showLoader: false });
  }, 10000);
}

loadZonesAndRecommendations({ showLoader: true });
startAutoRefresh();
