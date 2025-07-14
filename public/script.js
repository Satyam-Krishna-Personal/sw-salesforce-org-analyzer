// Global variables
let accessToken = '';
let instanceUrl = '';
let reportId = '';

// Utility Functions
function showToast(message, type = 'info', duration = 4000) {
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

  // Auto-remove toast after duration
  setTimeout(() => {
    toast.style.animation = 'fadeOut 0.3s ease-out';
    setTimeout(() => toast.remove(), 300);
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

  // Show target screen with animation
  const targetScreen = document.getElementById(screenId);
  targetScreen.classList.add('active');
}

function updateProgress(percentage, text) {
  const progressFill = document.getElementById('progressFill');
  const progressStatus = document.getElementById('analysisStatus');

  if (progressFill) {
    progressFill.style.width = `${percentage}%`;
    progressFill.style.backgroundColor = percentage === 100 ? 'var(--success-color)' : 'var(--primary-color)';
  }

  if (progressStatus) {
    progressStatus.textContent = text;
    progressStatus.style.color = percentage === 100 ? 'var(--success-color)' : 'var(--text-medium)';
  }
}

// Environment Selection Functions
function selectEnvironment(env) {
  const envName = env.charAt(0).toUpperCase() + env.slice(1);
  showToast(`${envName} environment is currently under development`, 'warning');
}

// Authentication Functions
async function loginHardcoded() {
  showLoading(true, 'Authenticating with Salesforce...');

  try {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Mock response
    const mockResponse = {
      success: true,
      accessToken: 'mock-access-token-12345',
      instanceUrl: 'https://test.salesforce.com',
      orgId: '00D3t0000008KXJEA2'
    };

    accessToken = mockResponse.accessToken;
    instanceUrl = mockResponse.instanceUrl;

    // Update org info
    const orgInfo = document.getElementById('orgInfo');
    if (orgInfo) {
      orgInfo.innerHTML = `
        <strong>Connected to Org:</strong> ${mockResponse.orgId}
        <br>
        <strong>Instance:</strong> ${mockResponse.instanceUrl}
      `;
    }

    showToast('Successfully authenticated with Salesforce!', 'success');
    showScreen('dashboardScreen');
  } catch (error) {
    showToast(`Authentication error: ${error.message || 'Failed to authenticate'}`, 'error');
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
    // Simulate analysis steps
    const steps = [
      { progress: 25, text: 'Connecting to Salesforce...' },
      { progress: 40, text: 'Retrieving metadata...' },
      { progress: 60, text: 'Scanning Apex classes...' },
      { progress: 75, text: 'Analyzing code quality...' },
      { progress: 90, text: 'Generating report...' }
    ];

    for (const step of steps) {
      await new Promise(resolve => setTimeout(resolve, 800));
      updateProgress(step.progress, step.text);
    }

    // Mock successful response
    updateProgress(100, 'Analysis completed successfully!');
    reportId = `report-${Date.now()}`;

    // Show results section
    const resultsSection = document.getElementById('analysisResults');
    resultsSection.classList.remove('hidden');

    showToast('Code analysis completed successfully!', 'success');

    // Auto-navigate to report after a short delay
    setTimeout(() => {
      viewReport(reportId);
    }, 1500);
  } catch (error) {
    updateProgress(0, 'Analysis failed. Please try again.');
    showToast(`Analysis error: ${error.message || 'Failed to complete analysis'}`, 'error');
  } finally {
    // Re-enable button
    scanButton.disabled = false;
    scanButton.innerHTML = originalText;
  }
}

function viewReport(id = reportId) {
  if (!id) {
    showToast('Report ID is missing. Please run the analysis first.', 'error');
    return;
  }

  showScreen('reportScreen');

  const reportContainer = document.getElementById('reportContainer');
  reportContainer.innerHTML = `
    <div class="text-center" style="padding: 3rem; color: var(--text-light);">
      <div class="spinner" style="margin: 0 auto 1.5rem;"></div>
      <p>Loading detailed report...</p>
    </div>
  `;

  // Simulate report loading
  setTimeout(() => {
    reportContainer.innerHTML = `
      <iframe src="/api/report/${id}" 
              style="width: 100%; height: 600px; border: none; border-radius: 0.5rem;"
              onload="this.previousElementSibling?.remove()">
      </iframe>
    `;
  }, 1800);
}

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
  // Add any initialization code here
});