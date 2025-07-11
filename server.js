const express = require('express');
const { exec } = require('child_process');
const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const bodyParser = require('body-parser');
const fetch = require('node-fetch'); // Ensure installed via: npm i node-fetch@2

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

const activeSessions = new Map();

// Utility: CLI command executor
const executeCommand = (command, options = {}) => {
    return new Promise((resolve, reject) => {
        exec(command, options, (error, stdout, stderr) => {
            if (error) {
                reject({ error: error.message, stderr });
            } else {
                resolve({ stdout, stderr });
            }
        });
    });
};

// Manual login using hardcoded credentials
app.post('/api/manual-login', async (req, res) => {
    const tokenUrl = 'https://page-app-9104--qa.sandbox.my.salesforce.com/services/oauth2/token';

    const params = new URLSearchParams();
    params.append('grant_type', 'password');
    params.append('client_id', '3MVG9b2K_4WHv18.bcIg.m3w_KNnwN4LXE0q4YvwTCG.hgPJ8rtcSWeLi33Dl6ZTf9cYNSGH2RpL8fx5BPMgq');
    params.append('client_secret', 'A39089634EAFB4DBD0787F1421D9424F27F27C0259165D51E4DAEBD9AC404D7C');
    params.append('username', 'satyam.tcc.qa@saasworx.ai');
    params.append('password', 'July@2025');

    try {
        const response = await fetch(tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params
        });

        const data = await response.json();
        if (data.access_token) {
            const sessionId = uuidv4();
            const session = {
                sessionId,
                accessToken: data.access_token,
                instanceUrl: data.instance_url,
                userId: data.id,
                orgId: data.id.split('/')[4],
                timestamp: new Date()
            };
            activeSessions.set(sessionId, session);
            res.json({ success: true, ...session });
        } else {
            res.status(401).json({ success: false, message: data.error_description || 'Token fetch failed' });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Run Analyzer automatically (metadata + scan)
app.post('/api/analyze', async (req, res) => {
    const { accessToken, instanceUrl } = req.body;
    if (!accessToken || !instanceUrl) {
        return res.status(400).json({ success: false, message: 'Access token or instance URL missing' });
    }

    const sessionId = uuidv4();
    const sessionPath = path.join(__dirname, 'projects', sessionId);
    const projectPath = path.join(sessionPath, 'salesforce-project');
    const reportFile = `CodeAnalyzerResults_${sessionId}.html`;
    const reportPath = path.join(__dirname, 'reports', reportFile);

    try {
        await fs.ensureDir(sessionPath);
        await fs.ensureDir(path.join(__dirname, 'reports'));

        // Step 1: Generate SFDX Project
        await executeCommand(`sf project generate --name salesforce-project`, { cwd: sessionPath });

        // Step 2: Authenticate using SF_ACCESS_TOKEN
        const loginCommand = `sf org login access-token --instance-url ${instanceUrl} --no-prompt --alias ${sessionId}`;
        await executeCommand(loginCommand, {
            cwd: projectPath,
            env: {
                ...process.env,
                SF_ACCESS_TOKEN: accessToken
            }
        });

        // Step 3: Try to generate manifest, if it fails, create a custom one
        const manifestDir = path.join(projectPath, 'manifest');
        await fs.ensureDir(manifestDir);

        let manifestCreated = false;

        try {
            const manifestCmd = `sf project generate manifest --from-org ${sessionId} --metadata ApexClass,ApexTrigger,LightningComponentBundle,AuraDefinitionBundle`;
            await executeCommand(manifestCmd, { cwd: projectPath });

            const manifestPath = path.join(projectPath, 'manifest', 'package.xml');
            manifestCreated = await fs.pathExists(manifestPath);
        } catch (manifestError) {
            console.log('Manifest generation failed, will create custom manifest:', manifestError.message);
        }

        // Step 4: If manifest wasn't created, create a custom one
        if (!manifestCreated) {
            const customManifest = `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>*</members>
        <name>ApexClass</name>
    </types>
    <types>
        <members>*</members>
        <name>ApexTrigger</name>
    </types>
    <types>
        <members>*</members>
        <name>LightningComponentBundle</name>
    </types>
    <types>
        <members>*</members>
        <name>AuraDefinitionBundle</name>
    </types>
    <version>62.0</version>
</Package>`;

            const manifestPath = path.join(projectPath, 'manifest', 'package.xml');
            await fs.writeFile(manifestPath, customManifest);
            console.log('Created custom manifest file');
        }

        // Step 5: Retrieve metadata using manifest
        const retrieveCmd = `sf project retrieve start --manifest manifest/package.xml --target-org ${sessionId}`;
        await executeCommand(retrieveCmd, { cwd: projectPath });

        // Step 6: Verify force-app directory exists before scanning
        const forceAppPath = path.join(projectPath, 'force-app');
        const forceAppExists = await fs.pathExists(forceAppPath);

        if (!forceAppExists) {
            // Try alternative retrieve approach
            console.log('No force-app directory found, trying alternative retrieve...');
            const altRetrieveCmd = `sf project retrieve start --source-dir force-app --target-org ${sessionId}`;
            try {
                await executeCommand(altRetrieveCmd, { cwd: projectPath });
            } catch (altError) {
                throw new Error(`No metadata retrieved. The org might not contain the specified metadata types. Error: ${altError.message}`);
            }
        }

        // Step 7: Final check and run scanner
        const finalForceAppCheck = await fs.pathExists(forceAppPath);
        if (!finalForceAppCheck) {
            throw new Error('Unable to retrieve any metadata from the org. Please ensure the org contains Apex classes, triggers, or Lightning components.');
        }

        const scanCmd = `sf scanner run --format html --outfile ${reportPath} --target force-app`;
        await executeCommand(scanCmd, { cwd: projectPath });

        // Save session info
        activeSessions.set(sessionId, {
            accessToken,
            instanceUrl,
            sessionId,
            sfProjectPath: projectPath,
            reportPath,
            reportFile,
            analyzed: true,
            timestamp: new Date()
        });

        // Response
        res.json({
            success: true,
            sessionId,
            reportUrl: `/api/report/${sessionId}`,
            message: 'Code scan completed and report generated'
        });

    } catch (err) {
        // Clean up on error
        try {
            if (await fs.pathExists(sessionPath)) {
                await fs.remove(sessionPath);
            }
        } catch (cleanupError) {
            console.error('Error during cleanup:', cleanupError);
        }

        res.status(500).json({
            success: false,
            message: 'Analyzer failed' + (err.error || err.message),
            error: err.error || err.message,
            stderr: err.stderr
        });
    }
});

// Serve report
app.get('/api/report/:sessionId', async (req, res) => {
    const session = activeSessions.get(req.params.sessionId);
    if (!session || !session.analyzed || !session.reportPath) {
        return res.status(404).json({ success: false, message: 'Report not available' });
    }
    const exists = await fs.pathExists(session.reportPath);
    if (!exists) {
        return res.status(404).json({ success: false, message: 'Report file not found' });
    }
    res.sendFile(session.reportPath);
});

// Cleanup old sessions
setInterval(() => {
    const now = new Date();
    for (const [sessionId, session] of activeSessions.entries()) {
        const age = now - session.timestamp;
        if (age > 60 * 60 * 1000) {
            fs.remove(session.sfProjectPath).catch(console.error);
            if (session.reportPath) fs.remove(session.reportPath).catch(console.error);
            activeSessions.delete(sessionId);
        }
    }
}, 60 * 60 * 1000);

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});