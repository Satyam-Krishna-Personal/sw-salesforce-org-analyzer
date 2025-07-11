const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Serve index.html and related files from /public

// Login with Salesforce CLI (web)
app.post('/api/login', (req, res) => {
    const { env } = req.body; // 'prod' or 'sandbox'
    const alias = env === 'prod' ? 'prod-org' : 'sandbox-org';

    const command = env === 'prod'
        ? `sf org login web --alias ${alias}`
        : `sf org login web --alias ${alias} --instance-url https://test.salesforce.com`;

    exec(command, (error, stdout, stderr) => {
        if (error) {
            return res.status(500).json({ success: false, message: stderr });
        }
        return res.json({ success: true, message: stdout });
    });
});

// Get Access Token and Org Info
app.post('/api/token', (req, res) => {
    const { alias } = req.body;

    exec(`sf org display --target-org ${alias} --verbose`, (err, stdout, stderr) => {
        if (err) {
            return res.status(500).json({ success: false, message: stderr });
        }

        // Optionally parse token details
        return res.json({ success: true, output: stdout });
    });
});

// Retrieve Metadata API
app.post('/api/retrieve', (req, res) => {
    const { alias, packageXml } = req.body;
    const tempDir = path.join(__dirname, 'tmp', alias);

    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }

    // Save package.xml
    fs.writeFileSync(path.join(tempDir, 'package.xml'), packageXml);

    const command = `sf project retrieve start --manifest ${path.join(tempDir, 'package.xml')} --target-org ${alias} --output-dir ${tempDir}/retrieved`;

    exec(command, (error, stdout, stderr) => {
        if (error) {
            return res.status(500).json({ success: false, message: stderr });
        }
        return res.json({ success: true, message: stdout });
    });
});

// Run Code Analyzer
app.post('/api/analyze', (req, res) => {
    const { alias } = req.body;
    const scanPath = path.join(__dirname, 'tmp', alias, 'retrieved');

    const command = `sf scanner run --target ${scanPath} --format html --outfile ${scanPath}/report.html`;

    exec(command, (error, stdout, stderr) => {
        if (error) {
            return res.status(500).json({ success: false, message: stderr });
        }
        return res.json({ success: true, message: stdout });
    });
});

// Serve Analysis Report
app.get('/api/report/:alias', (req, res) => {
    const { alias } = req.params;
    const reportPath = path.join(__dirname, 'tmp', alias, 'retrieved', 'report.html');

    if (!fs.existsSync(reportPath)) {
        return res.status(404).send('Report not found');
    }

    res.sendFile(reportPath);
});

// Default Port
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server started at http://localhost:${PORT}`);
});