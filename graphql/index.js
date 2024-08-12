const { ApolloServer } = require("@apollo/server");

const typeDefs = `
  type Query {
    functions: [String!]!
  }
`;

const resolvers = {
    Query: {
        functions: () => {
            return new Promise((resolve, reject) => {
                fs.readdir(functionDirectory, (err, files) => {
                    if (err) {
                        reject(new Error('Error reading functions directory'));
                    } else {
                        const functions = files.map(file => path.basename(file, '.js'));
                        resolve(functions);
                    }
                });
            });
        }
    }
};

const graphqlServer = new ApolloServer({
    typeDefs,
    resolvers,
});


module.exports = {
    graphqlServer,
}
