import QLangServer from './q-lang-server';
import { createConnection, IConnection, StreamMessageReader, StreamMessageWriter, InitializeParams, InitializeResult, ProposedFeatures } from 'vscode-languageserver';

const connection: IConnection = createConnection(ProposedFeatures.all)

connection.onInitialize(
    async (params: InitializeParams): Promise<InitializeResult> => {
        const server = await QLangServer.initialize(connection, params)
        return {
            capabilities: server.capabilities(),
        }
    },
)

connection.listen()
