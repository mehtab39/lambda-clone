const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const multer = require('multer');;
const FunctionContext = require('./Entities/FunctionContext');
const lambda = require('./lambda/invokeHandler');
const logger = require('./lib/logger');
const requestLogger = require('./middlewares/log');
const { ensureDirectoryExists } = require('./utils/files');
const { expressMiddleware } = require('@apollo/server/express4');
const { graphqlServer } = require('./graphql/index');

const app = express();
// Middleware to serve static files
app.use(express.static(path.join(__dirname, 'assets')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(bodyParser.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(requestLogger);
graphqlServer.start().then(() => {
    app.use('/graphql', expressMiddleware(graphqlServer));
});


const functionDirectory = path.join(__dirname, 'functions');
const uploadDirectory = path.join(__dirname, 'uploads');


const upload = multer({ dest: uploadDirectory });


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


app.get('/v1/active-processes', (req, res) => {
    res.json({ count: lambda.activeProcesses.size });
});

app.post('/v1/invoke/:functionName', lambda.invokeHandler);

const PORT = 8000;
app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`, {console: true});
});
