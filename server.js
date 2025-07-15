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
    const projectPath = path.join(sessionPath, 'sfproject'); // note: name is now sfproject
    const reportFile = `CodeAnalyzerResults_${sessionId}.html`;
    const reportPath = path.join(__dirname, 'reports', reportFile);

    try {

        // Check if SF CLI is installed
        console.log('🔍 Checking installed Salesforce plugins...');
        try {
            const pluginsOutput = await executeCommand(`sf plugins`, { cwd: projectPath });
            console.log('📦 Installed SF Plugins:\n' + pluginsOutput);
        } catch (pluginErr) {
            console.error('⚠️ Failed to list SF plugins:', pluginErr.stderr || pluginErr.message || pluginErr);
        }

        await fs.ensureDir(sessionPath);
        await fs.ensureDir(path.join(__dirname, 'reports'));

        // Step 1: Generate SFDX Project with manifest
        console.log('🔧 Generating SFDX project with manifest...');
        await executeCommand(`sf project generate --name sfproject --default-package-dir myapp --manifest`, { cwd: sessionPath });
        console.log(`✅ SFDX project created at: ${projectPath}`);

        // Step 2: Authenticate with access token
        console.log('🔐 Authenticating org...');
        const loginCommand = `sf org login access-token --instance-url ${instanceUrl} --no-prompt --alias ${sessionId}`;
        await executeCommand(loginCommand, {
            cwd: projectPath,
            env: { ...process.env, SF_ACCESS_TOKEN: accessToken }
        });
        console.log(`✅ Authenticated with alias: ${sessionId}`);

        // Step 3: Retrieve metadata using generated manifest
        console.log('📦 Retrieving metadata using generated manifest...');
        const retrieveCmd = `sf project retrieve start --manifest manifest/package.xml --target-org ${sessionId}`;
        await executeCommand(retrieveCmd, { cwd: projectPath });
        console.log('✅ Metadata retrieval completed');

        // Step 4: Check metadata directory
        const defaultPath = path.join(projectPath, 'myapp', 'main', 'default');
        const metadataSize = await getDirectorySize(defaultPath);
        const metadataSizeKB = (metadataSize / 1024).toFixed(2);

        if (metadataSizeKB < 1) {
            throw new Error('❌ Retrieved metadata is empty or too small.');
        }

        console.log(`✅ Metadata directory size: ${metadataSizeKB} KB`);

        // Step 5: Run scanner
        console.log('🧪 Running code scan...');
        const scanCmd = `sf scanner run --format html --outfile "${reportPath}" --target "${path.join('myapp', 'main', 'default')}"`;
        try {
            const scanResult = await executeCommand(scanCmd, { cwd: projectPath });
            console.log(`✅ Code scan complete. Report at: ${reportPath}`);
            console.log(`🔎 Scanner output:\n${scanResult}`);
        } catch (scanErr) {
            console.error('❌ Scanner failed:', scanErr.stderr || scanErr.message || scanErr);
            throw new Error(`Scanner failed: ${scanErr.stderr || scanErr.message || scanErr}`);
        }

        // Save session
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

        res.json({
            success: true,
            sessionId,
            reportUrl: `/api/report/${sessionId}`,
            message: 'Code scan completed and report generated'
        });

    } catch (err) {
        try {
            if (await fs.pathExists(sessionPath)) {
                await fs.remove(sessionPath);
                console.log(`🧹 Cleaned up session: ${sessionPath}`);
            }
        } catch (cleanupErr) {
            console.error('Cleanup error:', cleanupErr);
        }
        const message = err?.message || err?.stderr || 'Unknown analyzer error';
        console.error('Analyzer failed:', message);
        res.status(500).json({
            success: false,
            message: 'Analyzer failed: ' + message,
            error: err,
            stderr: err?.stderr || ''
        });
    }
});

const getDirectorySize = async (dirPath) => {
    let totalSize = 0;

    const files = await fs.readdir(dirPath);

    for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stat = await fs.stat(filePath);

        if (stat.isDirectory()) {
            totalSize += await getDirectorySize(filePath); // recursive
        } else {
            totalSize += stat.size;
        }
    }

    return totalSize;
};


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