const { Subject } = require('rxjs');
const path = require('path');
const fs = require('fs');
const { ensureDirectoryExists } = require('../utils/files');


const infoSubject = new Subject();
const warnSubject = new Subject();
const errorSubject = new Subject();
const debugSubject = new Subject();


function rotateLogs() {
    console.log('Rotating logs')
    const logFilePath = path.join(__dirname, '../logs/server.log');
    const timestamp = new Date().toISOString().replace(/:/g, '-'); 
    const prevLogFilePath = path.join(__dirname, `../logs/${timestamp}.prev.log`);

    if (fs.existsSync(logFilePath)) {
        fs.rename(logFilePath, prevLogFilePath, (err) => {
            if (err) {
                console.error('Error renaming log file', err);
            } else {
                console.log(`Log file rotated to ${prevLogFilePath}`);
            }
        });
    }
}
const logsDirectory = path.join(__dirname, '../logs')
ensureDirectoryExists(logsDirectory);
rotateLogs();

function writeLog(level, {message, options}) {
    const formattedMessage = `${new Date().toISOString()} [${level.toUpperCase()}] - ${message}\n`;
    if(options && options.console){
        console.log(formattedMessage)
    }
    fs.appendFile('logs/server.log', formattedMessage, (err) => {
        if (err) console.error('Error writing log to file', err);
    });
}

infoSubject.subscribe({
    next: (message) => writeLog('info', message),
    error: (err) => console.error('Info logging error', err)
});

warnSubject.subscribe({
    next: (message) => writeLog('warn', message),
    error: (err) => console.error('Warn logging error', err)
});

errorSubject.subscribe({
    next: (message) => writeLog('error', message),
    error: (err) => console.error('Error logging error', err)
});

debugSubject.subscribe({
    next: (message) => writeLog('debug', message),
    error: (err) => console.error('Debug logging error', err)
});

function logInfo(message, options) {
    infoSubject.next({message, options});
}

function logWarn(message, options) {
    warnSubject.next({message, options});
}

function logError(message, options) {
    errorSubject.next({message, options});
}

function logDebug(message, options) {
    debugSubject.next({ message, options });
}


const logger = {
    info: logInfo,
    warn: logWarn,
    error: logError,
    debug: logDebug
}

module.exports = logger


