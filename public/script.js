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

  // Update sidebar active state
  // This logic assumes specific DOM structure for sidebar navigation
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
    item.classList.remove('active');
  });

  if (screenId === 'environmentScreen') {
    // For environment screen, activate the first nav item (Production)
    const prodNavItem = document.querySelector('#environmentScreen .sidebar-nav .nav-item:nth-child(1)');
    if (prodNavItem) prodNavItem.classList.add('active');
  } else if (screenId === 'dashboardScreen') {
    // For dashboard screen, activate the 'Overview' nav item
    const dashboardOverviewNavItem = document.querySelector('#dashboardScreen .sidebar-nav .nav-item:nth-child(1)');
    if (dashboardOverviewNavItem) dashboardOverviewNavItem.classList.add('active');
  } else if (screenId === 'analysisScreen') {
    // For analysis screen, activate the 'Code Analysis' nav item
    const analysisCodeNavItem = document.querySelector('#analysisScreen .sidebar-nav .nav-item:nth-child(2)');
    if (analysisCodeNavItem) analysisCodeNavItem.classList.add('active');
  } else if (screenId === 'reportScreen') {
    // For report screen, activate the 'Current Report' nav item
    const reportCurrentNavItem = document.querySelector('#reportScreen .sidebar-nav .nav-item:nth-child(2)');
    if (reportCurrentNavItem) reportCurrentNavItem.classList.add('active');
  }
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
  // Use OAuth Web Server Flow for Production and Sandbox
  initiateSalesforceLogin(env);
}

// OAuth 2.0 Web Server Flow Initiation
function initiateSalesforceLogin(environment) {
  showLoading(true, `Redirecting to Salesforce ${environment} login...`);

  const authUrl = environment === 'production' ?
    'https://login.salesforce.com/services/oauth2/authorize' :
    'https://test.salesforce.com/services/oauth2/authorize';

  // IMPORTANT: This client_id must be associated with a Connected App in your Salesforce org.
  // The redirect_uri MUST be registered in that Connected App.
  // This client ID is from your server.js, ensure it matches your Connected App.
  const clientId = '3MVG9Kr5_mB04D14K2.EqeEs2caOInea.MU8T_VinMrIqGISwHSjpVCdEbHPlulLBIN4CD3Xir9g9x9Jqk6NC';
  const redirectUri = window.location.origin + '/oauth/callback'; 

  const state = btoa(JSON.stringify({ env: environment, originalPath: window.location.pathname })); // Encode state for security

  const loginUrl = `${authUrl}?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=api&state=${encodeURIComponent(state)}&prompt=login%20consent`;

  // Open Salesforce login in a new window/tab
  const loginWindow = window.open(loginUrl, '_blank', 'width=800,height=600,toolbar=0,menubar=0,location=0,status=0,scrollbars=0,resizable=1');

  // Listen for messages from the OAuth callback window
  // This listener is set up once and will handle the message when the OAuth flow completes
  window.addEventListener('message', (event) => {
    // Ensure the message is from the expected origin and contains the expected data
    if (event.origin === window.location.origin && event.data && event.data.type === 'oauthSuccess') {
      accessToken = event.data.accessToken;
      instanceUrl = event.data.instanceUrl;
      const orgId = event.data.orgId;

      // Update org info display
      const orgInfo = document.getElementById('orgInfo');
      if (orgInfo) {
        orgInfo.innerHTML = `
          <strong>Connected to Org:</strong> ${orgId || 'N/A'}
          <br>
          <strong>Instance:</strong> ${instanceUrl || 'N/A'}
        `;
      }

      showToast('Successfully authenticated to Salesforce!', 'success');
      showScreen('dashboardScreen');
      showLoading(false); // Hide loading overlay after successful login
    } else if (event.origin === window.location.origin && event.data && event.data.type === 'oauthError') {
      showToast(`Salesforce login failed: ${event.data.message}`, 'error');
      showLoading(false); // Hide loading overlay on error
    }
  }, { once: true }); // Listen once to prevent multiple handlers
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
    <div style="text-align: center; padding: 40px; color: var(--text-muted);">
      <div class="spinner" style="margin: 0 auto 20px;"></div>
      <p>Loading detailed report...</p>
    </div>
  `;

  // Simulate report loading
  setTimeout(() => {
    reportContainer.innerHTML = `
      <iframe src="/api/report/${id}"
              style="width: 100%; height: 600px; border: none; border-radius: var(--border-radius-sm);"
              onload="this.previousElementSibling?.remove()">
      </iframe>
    `;
  }, 1500);
}

// Initial screen load
document.addEventListener('DOMContentLoaded', () => {
  showScreen('environmentScreen');
});