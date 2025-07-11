let currentSessionId = null;
let currentStep = 1;

// Package.xml templates
const packageTemplates = {
    all: `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types><members>*</members><name>ApexClass</name></types>
    <types><members>*</members><name>ApexTrigger</name></types>
    <types><members>*</members><name>CustomObject</name></types>
    <types><members>*</members><name>Flow</name></types>
    <types><members>*</members><name>ValidationRule</name></types>
    <version>58.0</version>
</Package>`,
    apex: `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types><members>*</members><name>ApexClass</name></types>
    <types><members>*</members><name>ApexTrigger</name></types>
    <version>58.0</version>
</Package>`,
    flows: `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types><members>*</members><name>Flow</name></types>
    <types><members>*</members><name>Workflow</name></types>
    <version>58.0</version>
</Package>`,
    custom: `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types><members>*</members><name>CustomObject</name></types>
    <types><members>*</members><name>CustomField</name></types>
    <types><members>*</members><name>ValidationRule</name></types>
    <version>58.0</version>
</Package>`
};

// Select template for package.xml
function selectTemplate(templateType) {
    document.getElementById('packageXml').value = packageTemplates[templateType];
}

// Update the top step progress indicator
function updateStepIndicator(step) {
    for (let i = 1; i <= 4; i++) {
        const indicator = document.getElementById(`step${i}-indicator`);
        indicator.classList.remove('active', 'completed');
        if (i < step) {
            indicator.classList.add('completed');
        } else if (i === step) {
            indicator.classList.add('active');
        }
    }
}

// Show one step section at a time
function showStep(step) {
    for (let i = 1; i <= 4; i++) {
        document.getElementById(`step${i}`).classList.add('hidden');
    }
    document.getElementById(`step${step}`).classList.remove('hidden');
    currentStep = step;
    updateStepIndicator(step);
}

// Show status with styles
function showStatus(elementId, message, type = 'loading') {
    const statusElement = document.getElementById(elementId);
    statusElement.innerHTML = `<div class="status ${type}">${message}</div>`;
}

// Salesforce authentication using sf CLI - web-based flow
async function authenticate() {
    const username = document.getElementById('username').value;
    const loginUrl = document.getElementById('loginUrl').value;

    if (!username || !loginUrl) {
        showStatus('authStatus', 'Please fill in all fields', 'error');
        return;
    }

    showStatus('authStatus', 'Opening Salesforce login page. Please complete login...', 'loading');

    try {
        const response = await fetch(`/api/auth-url?loginUrl=${encodeURIComponent(loginUrl)}&username=${encodeURIComponent(username)}`);
        const result = await response.json();

        if (result.success && result.sessionId) {
            currentSessionId = result.sessionId;

            const authWindow = window.open(result.browserUrl, '_blank');
            showStatus('authStatus', 'Login window opened. Please complete the login there and return here.', 'success');

            // Optionally check login status after a delay (or via a "Continue" button)
        } else {
            showStatus('authStatus', `Authentication failed: ${result.message}`, 'error');
        }
    } catch (err) {
        showStatus('authStatus', `Error: ${err.message}`, 'error');
    }
}

// Retrieve metadata
async function retrieveMetadata() {
    const packageXml = document.getElementById('packageXml').value;

    if (!packageXml) {
        showStatus('retrieveStatus', 'Please provide package.xml content', 'error');
        return;
    }

    showStatus('retrieveStatus', 'Retrieving metadata from Salesforce... This may take a few minutes.', 'loading');

    try {
        const response = await fetch('/api/retrieve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId: currentSessionId, packageXml })
        });

        const result = await response.json();

        if (result.success) {
            showStatus('retrieveStatus', 'Metadata retrieved successfully!', 'success');
            setTimeout(() => showStep(3), 1500);
        } else {
            showStatus('retrieveStatus', `Metadata retrieval failed: ${result.message}`, 'error');
        }
    } catch (error) {
        showStatus('retrieveStatus', `Error: ${error.message}`, 'error');
    }
}

// Analyze code using Salesforce Code Analyzer
async function analyzeCode() {
    showStatus('analyzeStatus', 'Running code analysis... Please wait.', 'loading');

    try {
        const response = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId: currentSessionId })
        });

        const result = await response.json();

        if (result.success) {
            showStatus('analyzeStatus', 'Code analysis completed successfully!', 'success');
            setTimeout(() => showStep(4), 1500);
        } else {
            showStatus('analyzeStatus', `Code analysis failed: ${result.message}`, 'error');
        }
    } catch (error) {
        showStatus('analyzeStatus', `Error: ${error.message}`, 'error');
    }
}

// Load and show report
function viewReport() {
    const reportContainer = document.getElementById('reportContainer');
    const reportUrl = `/api/report/${currentSessionId}`;

    reportContainer.innerHTML = `
        <p>Loading report...</p>
        <iframe src="${reportUrl}" class="report-frame" onload="this.previousElementSibling.style.display='none'"></iframe>
    `;
}