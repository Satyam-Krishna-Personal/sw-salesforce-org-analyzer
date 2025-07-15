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
        console.log(`Creating directories for session: ${sessionId}`);
        await fs.ensureDir(sessionPath);
        await fs.ensureDir(path.join(__dirname, 'reports'));
        console.log(`✅ Directories created:
  - Session: ${sessionPath}
  - Reports: ${reportPath}`);

        // Step 1: Generate SFDX Project
        console.log('🔧 Generating SFDX project...');
        await executeCommand(`sf project generate --name salesforce-project`, { cwd: sessionPath });
        console.log(`✅ SFDX project created at: ${projectPath}`);

        // Step 2: Authenticate using SF_ACCESS_TOKEN
        console.log('🔐 Authenticating org using access token...');
        const loginCommand = `sf org login access-token --instance-url ${instanceUrl} --no-prompt --alias ${sessionId}`;
        await executeCommand(loginCommand, {
            cwd: projectPath,
            env: {
                ...process.env,
                SF_ACCESS_TOKEN: accessToken
            }
        });
        console.log(`✅ Authenticated org: ${instanceUrl} using alias: ${sessionId}`);

        // Step 3: Generate manifest
        const manifestDir = path.join(projectPath, 'manifest');
        await fs.ensureDir(manifestDir);

        let manifestCreated = false;
        console.log('📝 Attempting to generate manifest from org...');
        try {
            const manifestCmd = `sf project generate manifest --from-org ${sessionId} --metadata ApexClass,ApexTrigger,LightningComponentBundle,AuraDefinitionBundle`;
            await executeCommand(manifestCmd, { cwd: projectPath });

            const manifestPath = path.join(projectPath, 'manifest', 'package.xml');
            manifestCreated = await fs.pathExists(manifestPath);
            console.log(`✅ Manifest generated: ${manifestCreated ? manifestPath : '❌ Not found'}`);
        } catch (manifestError) {
            console.log('❌ Manifest generation from org failed, will create custom manifest');
            console.error(manifestError.message);
        }

        // Step 4: Fallback custom manifest
        if (!manifestCreated) {
            console.log('🛠️ Creating custom fallback manifest...');
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
            console.log(`✅ Custom manifest file created at: ${manifestPath}`);
        }

        // Step 5: Retrieve metadata
        console.log('📦 Retrieving metadata using manifest...');
        const retrieveCmd = `sf project retrieve start --manifest manifest/package.xml --target-org ${sessionId}`;
        await executeCommand(retrieveCmd, { cwd: projectPath });
        console.log('✅ Metadata retrieval completed');

        // Step 6: Check force-app directory
        const forceAppPath = path.join(projectPath, 'force-app');
        const forceAppExists = await fs.pathExists(forceAppPath);
        console.log(`📁 Checking force-app directory: ${forceAppPath}`);

        if (!forceAppExists) {
            console.log('⚠️ force-app directory not found, trying alternative retrieve...');
            const altRetrieveCmd = `sf project retrieve start --source-dir force-app --target-org ${sessionId}`;
            try {
                await executeCommand(altRetrieveCmd, { cwd: projectPath });
                console.log('✅ Alternative metadata retrieve successful');
            } catch (altError) {
                console.error('❌ Alternative retrieve also failed:', altError.message);
                throw new Error(`No metadata retrieved. Org may not contain specified metadata types. Error: ${altError.message}`);
            }
        }

        // Step 6.1: Size check
        const finalForceAppCheck = await fs.pathExists(forceAppPath);
        if (!finalForceAppCheck) {
            throw new Error('❌ force-app directory still missing after retrieval. Metadata might be missing.');
        }
        
        const forceAppDefaultPath = path.join(forceAppPath, 'main', 'default');
        const metadataSizeBytes = await getDirectorySize(forceAppPath);
        const metadataSizeKB = (metadataSizeBytes / 1024).toFixed(2);
        console.log(`📊 Retrieved metadata size: ${metadataSizeKB} KB`);

        const forceAppDefaultPathMetadataSizeBytes = await getDirectorySize(forceAppDefaultPath);
        const forceAppDefaultPathMetadataSizeKB = (forceAppDefaultPathMetadataSizeBytes / 1024).toFixed(2);
        console.log(`📊 force-app/main/default metadata size: ${forceAppDefaultPathMetadataSizeKB} KB`);
        if (forceAppDefaultPathMetadataSizeKB < 1) {
            throw new Error('❌ force-app/main/default directory is empty or too small. No metadata retrieved.');
        }
        console.log(`✅ force-app/main/default directory exists with size: ${forceAppDefaultPathMetadataSizeKB} KB`);
        console.log(`📂 Metadata retrieved successfully at: ${forceAppPath}`)
        console.log(`📂 Metadata retrieved successfully at: ${forceAppDefaultPath}`);

        // Step 7: Run code analyzer
        console.log('🧪 Running code scan on retrieved metadata...');
        const scanCmd = `sf scanner run --format html --outfile ${reportPath} --target force-app\main\default`;
        await executeCommand(scanCmd, { cwd: projectPath });
        console.log(`✅ Code scan complete. Report generated at: ${reportPath}`);

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
        // Clean up on error
        try {
            if (await fs.pathExists(sessionPath)) {
                await fs.remove(sessionPath);
                console.log(`🧹 Cleaned up session directory: ${sessionPath}`);
            }
        } catch (cleanupError) {
            console.error('🛑 Error during cleanup:', cleanupError);
        }

        console.error('🚨 Analyzer failed:', err.message);
        res.status(500).json({
            success: false,
            message: 'Analyzer failed: ' + (err.error || err.message),
            error: err.error || err.message,
            stderr: err.stderr
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