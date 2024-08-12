const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { fork } = require('child_process');
const FunctionContext = require('./Entities/FunctionContext');

const app = express();
// Middleware to serve static files
app.use(express.static(path.join(__dirname, 'assets')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(bodyParser.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const functionDirectory = path.join(__dirname, 'functions');
const uploadDirectory = path.join(__dirname, 'uploads');


const upload = multer({ dest: uploadDirectory });

const ensureDirectoryExists = (dir) => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
};

ensureDirectoryExists(functionDirectory);
ensureDirectoryExists(uploadDirectory);


app.get('/v1/functions', (req, res) => {
    fs.readdir(functionDirectory, (err, files) => {
        if (err) return res.status(500).send('Error reading functions directory');
        const functions = files.map(file => path.basename(file, '.js'));
        res.json(functions);
    });
});

app.get('/client/functions', async (req, res) => {
    try {
        const files = await fs.promises.readdir(functionDirectory);
        const functions = files.map(file => path.basename(file, '.js'));
        const data = {
            functions,
        }
        res.render('functions', { data: data });
    } catch (err) {
        console.error('Error reading functions directory:', err);
        res.status(500).send('Error reading functions directory');
    }
});

app.get('/client/upload', (req, res) => {
    const functionContext = new FunctionContext();
    res.render('upload', { data: {functionContext} });
});

app.get('/client/update/:functionName', async (req, res) => {
    const { functionName } = req.params;
    const filePath = path.join(functionDirectory, `${functionName}.js`);
    try {
        const functionContent = await fs.promises.readFile(filePath, 'utf8');
        const functionContext = new FunctionContext(functionName, functionContent);
        res.render('upload', { data: {
            functionContext
        } });
    } catch (err) {
        console.error('Error reading file:', err);
        res.status(500).send('Error reading file');
    }
});
app.post('/v1/functions', upload.single('file'), (req, res) => {
    const functionName = req.body.functionName;
    const code = req.body.code;
    const uploadedFile = req.file;

    if (uploadedFile) {
        const tempPath = uploadedFile.path;
        const targetPath = path.join(functionDirectory, uploadedFile.originalname);

        fs.rename(tempPath, targetPath, (err) => {
            if (err) return res.status(500).send('Error saving uploaded file');
            res.redirect('/client/functions');
        });
    } else if (functionName && code) {
        const filePath = path.join(functionDirectory, `${functionName}.js`);

        fs.writeFile(filePath, code, (err) => {
            if (err) return res.status(500).send('Error saving function code');
            res.redirect('/client/functions');
        });
    } else {
        res.status(400).send('Either a file or function code with name is required');
    }
});


app.delete('/v1/functions/:functionName', (req, res) => {
    const functionName = req.params.functionName;
    const filePath = path.join(functionDirectory, `${functionName}.js`);

    if (!fs.existsSync(filePath)) return res.status(404).send('Function not found');

    fs.unlink(filePath, err => {
        if (err) return res.status(500).send('Error deleting function');
        res.send('Function deleted successfully');
    });
});

app.post('/v1/invoke/:functionName', (req, res) => {
    try{
        const functionName = req.params.functionName;
        const functionPath = path.join(functionDirectory, `${functionName}.js`);

        if (!fs.existsSync(functionPath)) {
            return res.status(404).send('Function not found');
        }

        const child = fork(path.join(__dirname, 'functionRunner.js'), [], {
            env: { NODE_ENV: 'production' },
            stdio: ['pipe', 'pipe', 'pipe', 'ipc'] // Ensure ipc is used for communication
        });

        const event = req.body.event || {};
        const context = { client_ip: req.ip };

        // Set the response headers for streaming
        res.setHeader('Content-Type', 'text/plain');

        let isResponseEnded = false;

        // Forward stdout and stderr to the client
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
                res.status(504).send('Function execution timed out');
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

        child.send({ event, context, functionPath });
    }catch(err){
        console.log('Error serving /v1/invoke/:functionName', err.message)
        if(!isResponseEnded){
            res.status(500).send('Internal server error');
        }
    }
});


app.listen(3000, () => {
    console.log('Server running on port 3000');
});
