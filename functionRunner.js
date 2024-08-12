process.on('message', (data) => {
    const { event, context, functionPath } = data;
    try {
        const func = require(functionPath);
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