const express = require('express');
const { exec } = require('child_process');
const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Store active sessions
const activeSessions = new Map();

// Utility function to execute commands
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

// Home page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Authenticate with Salesforce
app.post('/api/auth', async (req, res) => {
  const { username, loginUrl } = req.body;
  const sessionId = uuidv4();
  const projectPath = path.join(__dirname, 'projects', sessionId);
  
  try {
    // Create project directory
    await fs.ensureDir(projectPath);
    
    // Authenticate with Salesforce
    const authCommand = `sf org login web --instance-url ${loginUrl} --alias ${sessionId}`;
    const authResult = await executeCommand(authCommand, { cwd: projectPath });
    
    // Store session info
    activeSessions.set(sessionId, {
      username,
      loginUrl,
      projectPath,
      authenticated: true,
      timestamp: new Date()
    });
    
    res.json({
      success: true,
      sessionId,
      message: 'Successfully authenticated with Salesforce',
      authOutput: authResult.stdout
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Authentication failed',
      error: error.error || error.message,
      stderr: error.stderr
    });
  }
});

// Retrieve metadata using package.xml
app.post('/api/retrieve', async (req, res) => {
  const { sessionId, packageXml } = req.body;
  
  if (!activeSessions.has(sessionId)) {
    return res.status(400).json({ success: false, message: 'Invalid session' });
  }
  
  const session = activeSessions.get(sessionId);
  const projectPath = session.projectPath;
  
  try {
    // Create package.xml file
    const packageXmlPath = path.join(projectPath, 'package.xml');
    await fs.writeFile(packageXmlPath, packageXml);
    
    // Create SFDX project
    const projectInitCommand = `sf project generate --name salesforce-project`;
    await executeCommand(projectInitCommand, { cwd: projectPath });
    
    const sfProjectPath = path.join(projectPath, 'salesforce-project');
    
    // Retrieve metadata
    const retrieveCommand = `sf project retrieve start --manifest ../package.xml --target-org ${sessionId}`;
    const retrieveResult = await executeCommand(retrieveCommand, { cwd: sfProjectPath });
    
    // Update session
    session.retrieved = true;
    session.sfProjectPath = sfProjectPath;
    activeSessions.set(sessionId, session);
    
    res.json({
      success: true,
      message: 'Metadata retrieved successfully',
      output: retrieveResult.stdout
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Metadata retrieval failed',
      error: error.error || error.message,
      stderr: error.stderr
    });
  }
});

// Run Code Analyzer
app.post('/api/analyze', async (req, res) => {
  const { sessionId } = req.body;
  
  if (!activeSessions.has(sessionId)) {
    return res.status(400).json({ success: false, message: 'Invalid session' });
  }
  
  const session = activeSessions.get(sessionId);
  
  if (!session.retrieved) {
    return res.status(400).json({ success: false, message: 'No metadata retrieved yet' });
  }
  
  const sfProjectPath = session.sfProjectPath;
  const reportsPath = path.join(__dirname, 'reports');
  await fs.ensureDir(reportsPath);
  
  const reportFile = `CodeAnalyzerResults_${sessionId}.html`;
  const reportPath = path.join(reportsPath, reportFile);
  
  try {
    // Run Salesforce Code Analyzer
    const analyzeCommand = `sf scanner run --format html --outfile ${reportPath} --target force-app/main/default --projectdir force-app/main/default`;
    const analyzeResult = await executeCommand(analyzeCommand, { cwd: sfProjectPath });
    
    // Update session
    session.analyzed = true;
    session.reportPath = reportPath;
    session.reportFile = reportFile;
    activeSessions.set(sessionId, session);
    
    res.json({
      success: true,
      message: 'Code analysis completed successfully',
      reportUrl: `/api/report/${sessionId}`,
      output: analyzeResult.stdout
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Code analysis failed',
      error: error.error || error.message,
      stderr: error.stderr
    });
  }
});

// Serve analysis report
app.get('/api/report/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  
  if (!activeSessions.has(sessionId)) {
    return res.status(404).json({ success: false, message: 'Session not found' });
  }
  
  const session = activeSessions.get(sessionId);
  
  if (!session.analyzed || !session.reportPath) {
    return res.status(404).json({ success: false, message: 'Report not available' });
  }
  
  try {
    const reportExists = await fs.pathExists(session.reportPath);
    if (!reportExists) {
      return res.status(404).json({ success: false, message: 'Report file not found' });
    }
    
    res.sendFile(session.reportPath);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error serving report', error: error.message });
  }
});

// Get session status
app.get('/api/status/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  
  if (!activeSessions.has(sessionId)) {
    return res.status(404).json({ success: false, message: 'Session not found' });
  }
  
  const session = activeSessions.get(sessionId);
  res.json({
    success: true,
    session: {
      sessionId,
      username: session.username,
      authenticated: session.authenticated,
      retrieved: session.retrieved || false,
      analyzed: session.analyzed || false,
      reportUrl: session.analyzed ? `/api/report/${sessionId}` : null,
      timestamp: session.timestamp
    }
  });
});

// Clean up old sessions (run every hour)
setInterval(() => {
  const now = new Date();
  for (const [sessionId, session] of activeSessions.entries()) {
    const timeDiff = now - session.timestamp;
    if (timeDiff > 3600000) { // 1 hour
      fs.remove(session.projectPath).catch(console.error);
      if (session.reportPath) {
        fs.remove(session.reportPath).catch(console.error);
      }
      activeSessions.delete(sessionId);
    }
  }
}, 3600000);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});