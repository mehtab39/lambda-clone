const logger = require("../lib/logger");

function requestLogger(req, _, next) {
    logger.debug(`Request recieved Method:${req.method} ${req.originalUrl} - ${req.ip}`)
    next();
}
module.exports = requestLogger;