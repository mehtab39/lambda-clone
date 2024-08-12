const { fork } = require('child_process');
const path = require('path');
const fs = require('fs');
const logger = require('../lib/logger');
const functionDirectory = path.join(__dirname, '../functions');

const activeProcesses = new Set();

const invokeHandler = (req, res) => {
    try {
        const functionName = req.params.functionName;
        const functionPath = path.join(functionDirectory, `${functionName}.js`);

        if (!fs.existsSync(functionPath)) {
            return res.status(404).send('Function not found');
        }

        logger.debug(`Spawning child for function ${functionName}`)

        const child = fork(path.join(__dirname, 'functionRunner.js'), [], {
            env: { NODE_ENV: 'production' },
            stdio: ['pipe', 'pipe', 'pipe', 'ipc']
        });

        activeProcesses.add(child);

        const event = req.body.event || {};
        const context = { client_ip: req.ip };

        res.setHeader('Content-Type', 'text/plain');

        let isResponseEnded = false;

        child.stdout.on('data', (data) => {
            if (!isResponseEnded) {
                res.write(data);
            }
        });

        child.stderr.on('data', (data) => {
            if (!isResponseEnded) {
                res.write(data);
            }
        });

        child.on('message', (message) => {
            if (message.log) {
                if (!isResponseEnded) {
                    res.write(`LOG: ${message.log}\n`);
                }
            } else if (message.error) {
                if (!isResponseEnded) {
                    res.write(`ERROR: ${message.error}\n`);
                }
            } else if (message.result) {
                clearTimeout(timeout);
                if (!isResponseEnded) {
                    res.write(`RESULT: ${message.result.body || ''}\n`);
                    res.end();
                    isResponseEnded = true;
                }
            }
        });

        const timeout = setTimeout(() => {
            if (!isResponseEnded) {
                res.write(`ERROR: Function execution timeout\n`);
                res.end();
                isResponseEnded = true;
            }
            child.kill('SIGTERM');
        }, 5000);

        child.on('error', (error) => {
            clearTimeout(timeout);
            if (!isResponseEnded) {
                console.error('Child process error:', error);
                res.status(500).send('Internal server error');
                isResponseEnded = true;
            }
        });

        child.on('exit', () => {
            activeProcesses.delete(child);
        });

        child.send({ event, context, functionPath });
    } catch (err) {
        logger.error('Error serving /v1/invoke/:functionName', err.message);
        if (!isResponseEnded) {
            res.status(500).send('Internal server error');
        }
    }
};

module.exports = { invokeHandler, activeProcesses };
