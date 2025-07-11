let currentSessionId = '';

function showStatus(id, message, type = 'info') {
  document.getElementById(id).innerHTML = `<div class="status ${type}">${message}</div>`;
}

function showStep(stepNum) {
  for (let i = 1; i <= 3; i++) {
    document.getElementById(`step${i}`).classList.add('hidden');
  }
  document.getElementById(`step${stepNum}`).classList.remove('hidden');
}

async function loginHardcoded() {
  showStatus('loginStatus', 'Authenticating...', 'loading');

  try {
    const response = await fetch('/api/manual-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    const result = await response.json();

    if (result.success) {
      currentSessionId = result.sessionId;
      showStatus('loginStatus', `✅ Authenticated! Session ID: ${currentSessionId}`, 'success');
      showStep(2);
    } else {
      showStatus('loginStatus', `❌ Login failed: ${result.message}`, 'error');
    }
  } catch (error) {
    showStatus('loginStatus', `❌ Error: ${error.message}`, 'error');
  }
}

async function runFullScan() {
  showStatus('scanStatus', 'Running full scan: retrieving metadata & analyzing...', 'loading');

  if (!currentSessionId) {
    showStatus('scanStatus', 'Session ID missing. Please login first.', 'error');
    return;
  }

  try {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: currentSessionId })
    });

    const result = await response.json();

    if (result.success) {
      showStatus(
        'scanStatus',
        `✅ Scan completed. <a href="${result.reportUrl}" target="_blank">View Report</a>`,
        'success'
      );
      showStep(3);
    } else {
      showStatus('scanStatus', result.message || 'Scan failed', 'error');
    }
  } catch (error) {
    showStatus('scanStatus', `❌ Error: ${error.message}`, 'error');
  }
}

function viewReport() {
  const reportContainer = document.getElementById('reportContainer');
  reportContainer.innerHTML = `
    <p>Loading report...</p>
    <iframe src="/api/report/${currentSessionId}" class="report-frame" onload="this.previousElementSibling.style.display='none'"></iframe>
  `;
}