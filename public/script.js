let accessToken = '';
let instanceUrl = '';
let reportId = '';

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
      accessToken = result.accessToken;
      instanceUrl = result.instanceUrl;

      showStatus('loginStatus', `✅ Authenticated! Org ID: ${result.orgId}`, 'success');
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

  if (!accessToken || !instanceUrl) {
    showStatus('scanStatus', 'Access token or instance URL missing. Please login first.', 'error');
    return;
  }

  try {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accessToken,
        instanceUrl
      })
    });

    const result = await response.json();

    if (result.success) {
      showStatus(
        'scanStatus',
        `✅ Scan completed. <a href="${result.reportUrl}" target="_blank">View Report</a>`,
        'success'
      );
      reportId = result.sessionId;
      showStep(3);
    } else {
      showStatus('scanStatus', result.message || 'Scan failed', 'error');
    }
  } catch (error) {
    showStatus('scanStatus', `❌ Error: ${error.message}`, 'error');
  }
}

function viewReport(reportId) {
  const reportContainer = document.getElementById('reportContainer');
  reportContainer.innerHTML = `
    <p id="loadingMsg">Loading report...</p>
    <iframe src="/api/report/${reportId}" class="report-frame" onload="document.getElementById('loadingMsg').style.display='none'"></iframe>
  `;
}