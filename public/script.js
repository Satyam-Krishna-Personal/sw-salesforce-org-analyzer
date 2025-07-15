// Global variables
let accessToken = '';
let instanceUrl = '';
let reportId = '';

// Utility Functions
function showToast(message, type = 'info', duration = 3000) {
  const toastContainer = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  const icons = {
    info: 'fas fa-info-circle',
    success: 'fas fa-check-circle',
    error: 'fas fa-exclamation-circle',
    warning: 'fas fa-exclamation-triangle'
  };
  
  toast.innerHTML = `
    <i class="${icons[type]}"></i>
    <span>${message}</span>
  `;
  
  toastContainer.appendChild(toast);
  
  setTimeout(() => {
    toast.remove();
  }, duration);
}

function showLoading(show = true, text = 'Processing...') {
  const overlay = document.getElementById('loadingOverlay');
  const loadingText = document.querySelector('.loading-text');
  
  if (show) {
    loadingText.textContent = text;
    overlay.classList.remove('hidden');
  } else {
    overlay.classList.add('hidden');
  }
}

function showScreen(screenId) {
  // Hide all screens
  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.remove('active');
  });
  
  // Show target screen
  document.getElementById(screenId).classList.add('active');
}

function updateProgress(percentage, text) {
  const progressFill = document.getElementById('progressFill');
  const progressStatus = document.getElementById('analysisStatus');
  
  if (progressFill) {
    progressFill.style.width = percentage + '%';
  }
  
  if (progressStatus) {
    progressStatus.textContent = text;
  }
}

// Environment Selection Functions
function selectEnvironment(env) {
  const envName = env.charAt(0).toUpperCase() + env.slice(1);
  showToast(`${envName} environment is currently under development`, 'warning', 4000);
}

// Authentication Functions
async function loginHardcoded() {
  showLoading(true, 'Authenticating...');
  
  try {
    const response = await fetch('/api/manual-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    const result = await response.json();

    if (result.success) {
      accessToken = result.accessToken;
      instanceUrl = result.instanceUrl;

      // Update org info
      const orgInfo = document.getElementById('orgInfo');
      if (orgInfo) {
        orgInfo.innerHTML = `
          <strong>Connected to Org:</strong> ${result.orgId || 'Test Org'}
          <br>
          <strong>Instance:</strong> ${instanceUrl || 'Test Instance'}
        `;
      }

      showToast('Successfully authenticated to Salesforce!', 'success');
      showScreen('dashboardScreen');
    } else {
      showToast(`Login failed: ${result.message}`, 'error');
    }
  } catch (error) {
    showToast(`Authentication error: ${error.message}`, 'error');
  } finally {
    showLoading(false);
  }
}

// Dashboard Functions
function startCodeAnalysis() {
  showScreen('analysisScreen');
  updateProgress(0, 'Ready to start analysis');
}

// Analysis Functions
async function runFullScan() {
  if (!accessToken || !instanceUrl) {
    showToast('Please login first to run the analysis', 'error');
    return;
  }

  const scanButton = document.getElementById('scanButton');
  const originalText = scanButton.innerHTML;
  
  // Disable button and show loading state
  scanButton.disabled = true;
  scanButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Running Analysis...';
  
  // Progress simulation
  updateProgress(10, 'Initializing analysis...');
  
  try {
    // Simulate progress updates
    setTimeout(() => updateProgress(25, 'Connecting to Salesforce...'), 500);
    setTimeout(() => updateProgress(50, 'Retrieving metadata...'), 1000);
    setTimeout(() => updateProgress(75, 'Analyzing code quality...'), 1500);
    
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
      updateProgress(100, 'Analysis completed successfully!');
      reportId = result.sessionId;
      
      // Show results section
      document.getElementById('analysisResults').classList.remove('hidden');
      
      showToast('Code analysis completed successfully!', 'success');
      
      // Auto-navigate to report after a short delay
      setTimeout(() => {
        viewReport(reportId);
      }, 2000);
    } else {
      updateProgress(0, 'Analysis failed. Please try again.');
      showToast(result.message || 'Analysis failed', 'error', 10000);
    }
  } catch (error) {
    updateProgress(0, 'Analysis failed due to an error.');
    showToast(`Analysis error: ${error.message}`, 'error', 10000);
  } finally {
    // Re-enable button
    scanButton.disabled = false;
    scanButton.innerHTML = originalText;
  }
}

function viewReport(id = reportId) {
  if (!id || id === 'undefined') {
    showToast('Report ID is missing. Please run the analysis first.', 'error');
    return;
  }

  showScreen('reportScreen');
  
  const reportContainer = document.getElementById('reportContainer');
  reportContainer.innerHTML = `
    <div style="text-align: center; padding: 40px; color: #7f8c8d;">
      <div class="spinner" style="margin: 0 auto 20px;"></div>
      <p>Loading detailed report...</p>
    </div>
  `;

  // Simulate report loading
  setTimeout(() => {
    reportContainer.innerHTML = `
      <iframe src="/api/report/${id}" 
              style="width: 100%; height: 600px; border: none; border-radius: 10px;"
              onload="this.previousElementSibling?.remove()">
      </iframe>
    `;
  }, 1500);
}