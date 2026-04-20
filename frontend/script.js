const API_BASE_URL = 'http://127.0.0.1:8000/api';

const preferenceSelect = document.getElementById('preference');
const findButton = document.getElementById('findButton');
const zonesList = document.getElementById('zonesList');
const recommendationContent = document.getElementById('recommendationContent');
const loading = document.getElementById('loading');
const errorMessage = document.getElementById('errorMessage');

function zoneTypeFromName(name) {
  const lowerName = name.toLowerCase();
  if (lowerName.includes('food')) {
    return 'food';
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
    return '<span class="zone-icon" aria-hidden="true">G</span>';
  }
  if (type === 'food') {
    return '<span class="zone-icon" aria-hidden="true">F</span>';
  }
  if (type === 'restroom') {
    return '<span class="zone-icon" aria-hidden="true">R</span>';
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
    </article>
  `;
}

function updateRecommendation(zones) {
  const bestZones = zones.filter((zone) => zone.score > 70).sort((a, b) => b.score - a.score);

  if (!bestZones.length) {
    recommendationContent.innerHTML = '<p class="muted">No zone crossed the recommendation threshold (> 70).</p>';
    return;
  }

  const topZone = bestZones[0];
  const otherZones = bestZones.slice(1);

  const topCardMarkup = `
    <article class="best-zone-card ${scoreClass(topZone.score)}">
      <p class="best-zone-label">Top Recommendation</p>
      <h3>${topZone.name}</h3>
      <p class="best-zone-meta">Crowd score: <strong>${topZone.score}%</strong> | Wait time: <strong>${topZone.waitTime} min</strong></p>
      <p class="best-zone-message">Use this zone for faster access and less waiting time</p>
    </article>
  `;

  const otherZoneMarkup = otherZones.length
    ? `<ul class="recommendation-list">${otherZones
        .map((zone) => `<li><strong>${zone.name}</strong> - ${zone.score}% score, ${zone.waitTime} min wait</li>`)
        .join('')}</ul>`
    : '';

  recommendationContent.innerHTML = `${topCardMarkup}${otherZoneMarkup}`;
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
  if (preference === 'Food') {
    return lowerName.includes('food');
  }
  if (preference === 'Restroom') {
    return lowerName.includes('restroom');
  }
  if (preference === 'Entry') {
    return lowerName.includes('gate');
  }
  return true;
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
    waitTime: zone.wait_time,
    score: 100 - zone.crowd_level,
    status: zone.crowd_level < 35 ? 'Low' : zone.crowd_level <= 70 ? 'Medium' : 'High'
  }));
}

function showLoading(isLoading) {
  loading.classList.toggle('hidden', !isLoading);
  findButton.disabled = isLoading;
  findButton.textContent = isLoading ? 'Finding...' : 'Find Best Zones';
}

async function loadZonesAndRecommendations() {
  const selectedPreference = preferenceSelect.value;

  showLoading(true);
  clearError();

  try {
    const [scoredZones, recommendedZones] = await Promise.all([
      getScoredZones(),
      getRecommendedZones()
    ]);

    const filteredScoredZones = scoredZones
      .filter((zone) => zoneMatchesPreference(zone.name, selectedPreference))
      .sort((a, b) => b.score - a.score);

    renderZones(filteredScoredZones);
    updateRecommendation(recommendedZones);
  } catch (error) {
    zonesList.innerHTML = '';
    recommendationContent.innerHTML = '<p class="muted">Recommendations unavailable.</p>';
    showError(error.message || 'Something went wrong while fetching zone data.');
  } finally {
    showLoading(false);
  }
}

findButton.addEventListener('click', loadZonesAndRecommendations);

loadZonesAndRecommendations();
