process.on('message', (data) => {
    const { event, context, functionPath } = data;
    try {
        const func = require(functionPath);

        context.stdout = (message) => {process.send({ log: message })};
        context.stderr = (message) => {process.send({ log: message })};

        func(event, context, (err, result) => {
            if (err) {
                process.send({ error: err.message });
            } else {
                process.send({ result });
            }
        });
    } catch (error) {
        process.send({ error: error.message });
    }
});