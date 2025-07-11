const express = require('express');
const { exec } = require('child_process');
const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
app.use(bodyParser.json());

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Session store
const activeSessions = new Map();

// Utility: Run CLI commands
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

// Home route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Step 1: Start Salesforce login (returns auth URL)
app.post('/api/auth', async (req, res) => {
  const { loginUrl } = req.body;
  const sessionId = uuidv4();
  const projectPath = path.join(__dirname, 'projects', sessionId);
  await fs.ensureDir(projectPath);

  const alias = `org-${sessionId}`;
  const authUrlCommand = `sf org login web --instance-url ${loginUrl} --alias ${alias} --no-prompt --json`;

  try {
    const result = await executeCommand(authUrlCommand, { cwd: projectPath });
    const parsed = JSON.parse(result.stdout);

    if (parsed.status === 0 && parsed.result && parsed.result.authorizationUrl) {
      activeSessions.set(sessionId, {
        loginUrl,
        alias,
        projectPath,
        authenticated: false,
        timestamp: new Date()
      });

      res.json({
        success: true,
        sessionId,
        authUrl: parsed.result.authorizationUrl
      });
    } else {
      throw new Error('Failed to generate authorization URL');
    }
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Authentication URL generation failed',
      error: err.error || err.message,
      stderr: err.stderr
    });
  }
});

// Step 1b: Check Auth Status
app.get('/api/check-auth/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const session = activeSessions.get(sessionId);

  if (!session) return res.status(404).json({ success: false, message: 'Invalid session' });

  try {
    const command = `sf org display --target-org ${session.alias} --json`;
    const result = await executeCommand(command);
    const parsed = JSON.parse(result.stdout);

    if (parsed.status === 0 && parsed.result && parsed.result.username) {
      session.authenticated = true;
      session.username = parsed.result.username;
      activeSessions.set(sessionId, session);
      return res.json({ success: true, authenticated: true, username: session.username });
    }

    return res.json({ success: false, authenticated: false });
  } catch {
    return res.json({ success: false, authenticated: false });
  }
});

// Step 2: Retrieve Metadata
app.post('/api/retrieve', async (req, res) => {
  const { sessionId, packageXml } = req.body;

  if (!activeSessions.has(sessionId)) {
    return res.status(400).json({ success: false, message: 'Invalid session' });
  }

  const session = activeSessions.get(sessionId);
  const projectPath = session.projectPath;

  try {
    const packageXmlPath = path.join(projectPath, 'package.xml');
    await fs.writeFile(packageXmlPath, packageXml);

    const initCmd = `sf project generate --name salesforce-project`;
    await executeCommand(initCmd, { cwd: projectPath });

    const sfProjectPath = path.join(projectPath, 'salesforce-project');

    const retrieveCmd = `sf project retrieve start --manifest ../package.xml --target-org ${session.alias}`;
    const result = await executeCommand(retrieveCmd, { cwd: sfProjectPath });

    session.retrieved = true;
    session.sfProjectPath = sfProjectPath;
    activeSessions.set(sessionId, session);

    res.json({ success: true, message: 'Metadata retrieved', output: result.stdout });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Metadata retrieval failed',
      error: err.error || err.message,
      stderr: err.stderr
    });
  }
});

app.post('/api/manual-login', async (req, res) => {
  const tokenUrl = 'https://page-app-9104--qa.sandbox.my.salesforce.com/services/oauth2/token';

  const params = new URLSearchParams();
  params.append('grant_type', 'password');
  params.append('client_id', '3MVG9b2K_4WHv18.bcIg.m3w_KNnwN4LXE0q4YvwTCG.hgPJ8rtcSWeLi33Dl6ZTf9cYNSGH2RpL8fx5BPMgq');
  params.append('client_secret', 'A39089634EAFB4DBD0787F1421D9424F27F27C0259165D51E4DAEBD9AC404D7C');
  params.append('username', 'test.integration.user.qa@saasworx.ai');
  params.append('password', 'May@2025'); // Consider appending security token if needed

  try {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    });

    const data = await response.json();

    if (data.access_token) {
      res.json({
        success: true,
        accessToken: data.access_token,
        instanceUrl: data.instance_url,
        userId: data.id,
        orgId: data.id?.split('/')[4]
      });
    } else {
      res.status(401).json({ success: false, message: data.error_description || 'Token fetch failed' });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


// Step 3: Analyze Code
app.post('/api/analyze', async (req, res) => {
  const { sessionId } = req.body;

  if (!activeSessions.has(sessionId)) {
    return res.status(400).json({ success: false, message: 'Invalid session' });
  }

  const session = activeSessions.get(sessionId);
  if (!session.retrieved) {
    return res.status(400).json({ success: false, message: 'Metadata not retrieved' });
  }

  const sfProjectPath = session.sfProjectPath;
  const reportsDir = path.join(__dirname, 'reports');
  await fs.ensureDir(reportsDir);

  const reportFile = `CodeAnalyzerResults_${sessionId}.html`;
  const reportPath = path.join(reportsDir, reportFile);

  try {
    const analyzeCmd = `sf scanner run --format html --outfile ${reportPath} --target force-app/main/default --projectdir force-app/main/default`;
    const result = await executeCommand(analyzeCmd, { cwd: sfProjectPath });

    session.analyzed = true;
    session.reportPath = reportPath;
    session.reportFile = reportFile;
    activeSessions.set(sessionId, session);

    res.json({
      success: true,
      message: 'Analysis complete',
      reportUrl: `/api/report/${sessionId}`,
      output: result.stdout
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Code analysis failed',
      error: err.error || err.message,
      stderr: err.stderr
    });
  }
});

// Step 4: Serve Report
app.get('/api/report/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const session = activeSessions.get(sessionId);

  if (!session || !session.analyzed || !session.reportPath) {
    return res.status(404).json({ success: false, message: 'Report not available' });
  }

  const exists = await fs.pathExists(session.reportPath);
  if (!exists) return res.status(404).json({ success: false, message: 'Report file not found' });

  res.sendFile(session.reportPath);
});

// Session Status
app.get('/api/status/:sessionId', (req, res) => {
  const session = activeSessions.get(req.params.sessionId);
  if (!session) {
    return res.status(404).json({ success: false, message: 'Session not found' });
  }

  res.json({
    success: true,
    session: {
      sessionId: req.params.sessionId,
      username: session.username,
      authenticated: session.authenticated,
      retrieved: session.retrieved || false,
      analyzed: session.analyzed || false,
      reportUrl: session.analyzed ? `/api/report/${req.params.sessionId}` : null,
      timestamp: session.timestamp
    }
  });
});

app.post('/api/login', async (req, res) => {
  const { env } = req.body;
  const alias = env === 'prod' ? 'prod-org' : 'sandbox-org';

  // Trigger Salesforce CLI login command
  exec(`sf org login web --alias ${alias}`, (err, stdout, stderr) => {
    if (err) {
      console.error(`Login error: ${stderr}`);
      return res.status(500).json({ success: false, message: stderr });
    }

    console.log(`Login output: ${stdout}`);
    res.json({ success: true, message: stdout });
  });
});

// Auto-clean old sessions every hour
setInterval(() => {
  const now = new Date();
  for (const [sessionId, session] of activeSessions.entries()) {
    const age = now - session.timestamp;
    if (age > 60 * 60 * 1000) {
      fs.remove(session.projectPath).catch(console.error);
      if (session.reportPath) fs.remove(session.reportPath).catch(console.error);
      activeSessions.delete(sessionId);
    }
  }
}, 60 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});