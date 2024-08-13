const path = require('path');
const fs = require('fs');
const functionDirectory = path.join(__dirname, '../functions');


process.on('message', (data) => {
    const { event, context, functionPath } = data;
    try {
        const func = require(functionPath);

        context.callstack = [functionPath]

        context.executeFunction = (childFuncName, childEvent) => {

            const childFuncPath = path.join(functionDirectory, `${childFuncName}.js`);

            if (!fs.existsSync(childFuncPath)) {
                throw new Error('Function not found')
            }

            if (context.callstack.includes(childFuncPath)){
                throw new Error('Recursion is not supported (Yet)!')
            }

            context.callstack.push(childFuncPath);

            const childFunc = require(childFuncPath);
            return new Promise((res, rej) => {
                return childFunc(childEvent, context, (err, result) => {
                   return  err ? rej(err) : res(result)
                });
            })
        }

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