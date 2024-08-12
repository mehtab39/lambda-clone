const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { fork } = require('child_process');

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
    res.render('upload', { data: null });
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
    const functionName = req.params.functionName;
    const functionPath = path.join(functionDirectory, `${functionName}.js`);

    if (!fs.existsSync(functionPath)) return res.status(404).send('Function not found');

    // Create a child process for the function
    const child = fork(path.join(__dirname, 'functionRunner.js'), [], {
        env: { NODE_ENV: 'production' },
        stdio: ['inherit', 'inherit', 'inherit', 'ipc'] // Ensure output is visible
    });

    const event = req.body.event || {};
    const context = {
        client_ip: req.ip
    };

    const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        res.status(504).send('Function execution timed out');
    }, 5000);

    child.on('message', (message) => {
        clearTimeout(timeout);
        if (message.error) {
            res.status(500).send(message.error);
        } else {
            res.status(message.result.statusCode || 200).send(message.result.body || '');
        }
    });

    child.send({ event, context, functionPath });

    child.on('error', (error) => {
        clearTimeout(timeout);
        console.error('Child process error:', error);
        res.status(500).send('Internal server error');
    });
});


app.listen(3000, () => {
    console.log('Server running on port 3000');
});
