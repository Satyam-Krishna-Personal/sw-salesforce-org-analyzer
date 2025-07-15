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
    const projectPath = path.join(sessionPath, 'sfproject');
    const reportFile = `CodeAnalyzerResults_${sessionId}.html`;
    const reportPath = path.join(__dirname, 'reports', reportFile);

    try {
        console.log(`Creating directories for session: ${sessionId}`);
        await fs.ensureDir(sessionPath);
        await fs.ensureDir(path.join(__dirname, 'reports'));
        console.log(`✅ Directories created:
  - Session: ${sessionPath}
  - Reports: ${reportPath}`);

        // Step 1: Generate SFDX Project with correct command structure
        console.log('🔧 Generating SFDX project...');
        await executeCommand(`sf project generate --name sfproject --default-package-dir myapp --manifest`, { cwd: sessionPath });
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

        // Step 3: Generate comprehensive manifest to retrieve ALL metadata
        const manifestDir = path.join(projectPath, 'manifest');
        await fs.ensureDir(manifestDir);

        let manifestCreated = false;
        console.log('📝 Attempting to generate manifest from org...');
        try {
            // Generate manifest for all metadata types
            const manifestCmd = `sf project generate manifest --from-org ${sessionId}`;
            await executeCommand(manifestCmd, { cwd: projectPath });

            const manifestPath = path.join(projectPath, 'manifest', 'package.xml');
            manifestCreated = await fs.pathExists(manifestPath);
            console.log(`✅ Manifest generated: ${manifestCreated ? manifestPath : '❌ Not found'}`);
        } catch (manifestError) {
            console.log('❌ Manifest generation from org failed, will create comprehensive manifest');
            console.error(manifestError.message);
        }

        // Step 4: Fallback comprehensive manifest with all metadata types
        if (!manifestCreated) {
            console.log('🛠️ Creating comprehensive fallback manifest...');
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
    <types>
        <members>*</members>
        <name>Flow</name>
    </types>
    <types>
        <members>*</members>
        <name>CustomObject</name>
    </types>
    <types>
        <members>*</members>
        <name>CustomField</name>
    </types>
    <types>
        <members>*</members>
        <name>ValidationRule</name>
    </types>
    <types>
        <members>*</members>
        <name>WorkflowRule</name>
    </types>
    <types>
        <members>*</members>
        <name>PermissionSet</name>
    </types>
    <types>
        <members>*</members>
        <name>Profile</name>
    </types>
    <types>
        <members>*</members>
        <name>CustomTab</name>
    </types>
    <types>
        <members>*</members>
        <name>CustomApplication</name>
    </types>
    <types>
        <members>*</members>
        <name>Layout</name>
    </types>
    <types>
        <members>*</members>
        <name>Report</name>
    </types>
    <types>
        <members>*</members>
        <name>Dashboard</name>
    </types>
    <version>62.0</version>
</Package>`;
            const manifestPath = path.join(projectPath, 'manifest', 'package.xml');
            await fs.writeFile(manifestPath, customManifest);
            console.log(`✅ Comprehensive manifest file created at: ${manifestPath}`);
        }

        // Step 4: Retrieve ALL metadata using the auto-generated manifest
        console.log('📦 Retrieving complete metadata using auto-generated manifest...');
        const retrieveCmd = `sf project retrieve start --manifest manifest/package.xml --target-org ${sessionId}`;
        await executeCommand(retrieveCmd, { cwd: projectPath });
        console.log('✅ Complete metadata retrieval completed');

        // Step 5: Check myapp directory (default package directory)
        const myappPath = path.join(projectPath, 'myapp');
        const myappExists = await fs.pathExists(myappPath);
        console.log(`📁 Checking myapp directory: ${myappPath}`);

        if (!myappExists) {
            console.log('⚠️ myapp directory not found, checking force-app...');
            const forceAppPath = path.join(projectPath, 'force-app');
            const forceAppExists = await fs.pathExists(forceAppPath);
            
            if (!forceAppExists) {
                console.log('⚠️ force-app directory not found, trying alternative retrieve...');
                const altRetrieveCmd = `sf project retrieve start --source-dir myapp --target-org ${sessionId}`;
                try {
                    await executeCommand(altRetrieveCmd, { cwd: projectPath });
                    console.log('✅ Alternative metadata retrieve successful');
                } catch (altError) {
                    console.error('❌ Alternative retrieve also failed:', altError.message);
                    throw new Error(`No metadata retrieved. Org may not contain specified metadata types. Error: ${altError.message}`);
                }
            }
        }

        // Step 5.1: Determine the correct source directory
        let sourceDir = myappPath;
        let sourceDirExists = await fs.pathExists(myappPath);
        
        if (!sourceDirExists) {
            sourceDir = path.join(projectPath, 'force-app');
            sourceDirExists = await fs.pathExists(sourceDir);
        }

        if (!sourceDirExists) {
            throw new Error('❌ Neither myapp nor force-app directory exists after retrieval. Metadata might be missing.');
        }

        // Step 5.2: Size check
        const metadataSizeBytes = await getDirectorySize(sourceDir);
        const metadataSizeKB = (metadataSizeBytes / 1024).toFixed(2);
        console.log(`📊 Retrieved metadata size: ${metadataSizeKB} KB`);

        if (metadataSizeKB < 1) {
            throw new Error(`❌ Source directory is empty or too small. No metadata retrieved. Directory: ${sourceDir}`);
        }
        console.log(`✅ Source directory exists with size: ${metadataSizeKB} KB`);
        console.log(`📂 Metadata retrieved successfully at: ${sourceDir}`);

        // Step 6: Run code analyzer on ALL retrieved files
        console.log('🧪 Running code scan on ALL retrieved metadata...');
        
        // Get relative path for scanner command
        const relativeSourcePath = path.relative(projectPath, sourceDir);
        const scanCmd = `sf scanner run --format html --outfile "${reportPath}" --target "${relativeSourcePath}"`;
        
        console.log(`Scanner command: ${scanCmd}`);
        console.log(`Working directory: ${projectPath}`);
        
        await executeCommand(scanCmd, { cwd: projectPath });
        console.log(`✅ Code scan complete. Report generated at: ${reportPath}`);

        // Verify report was created
        const reportExists = await fs.pathExists(reportPath);
        if (!reportExists) {
            throw new Error(`❌ Report file was not created at: ${reportPath}`);
        }

        // Save session
        activeSessions.set(sessionId, {
            accessToken,
            instanceUrl,
            sessionId,
            sfProjectPath: projectPath,
            reportPath,
            reportFile,
            sourceDir,
            analyzed: true,
            timestamp: new Date()
        });

        res.json({
            success: true,
            sessionId,
            reportUrl: `/api/report/${sessionId}`,
            message: 'Code scan completed and report generated',
            metadataSize: `${metadataSizeKB} KB`,
            sourceDirectory: sourceDir
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