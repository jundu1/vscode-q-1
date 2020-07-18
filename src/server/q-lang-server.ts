import {
    TextDocuments, Diagnostic, DiagnosticSeverity, Location, Hover,
    InitializeParams, CompletionItem, TextDocumentPositionParams, TextDocumentSyncKind, InitializeResult, IConnection, Connection, ReferenceParams, ServerCapabilities
} from 'vscode-languageserver';

import {
    TextDocument
} from 'vscode-languageserver-textdocument';
import getBuildInFsRef from './q-build-in-fs';
import { initializeParser } from './q-parser';
import QAnalyzer, { word } from './q-analyser';


export default class QLangServer {
    connection: IConnection;
    // Create a simple text document manager. The text document manager
    // supports full document sync only
    documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

    buildInFsRef: CompletionItem[] = [];

    private analyzer: QAnalyzer;

    private constructor(connection: IConnection, analyzer: QAnalyzer) {
        this.connection = connection;
        this.analyzer = analyzer;
        this.buildInFsRef = getBuildInFsRef();
        // Make the text document manager listen on the connection
        // for open, change and close text document events
        this.documents.listen(this.connection);

        this.documents.onDidChangeContent(this.onDidChangeContent.bind(this));

        this.connection.onHover(this.onHover.bind(this))
        this.connection.onDidChangeWatchedFiles(this.onDidChangeWatchedFiles.bind(this));
        // this.connection.onDocumentSymbol(this.onDocumentSymbol.bind(this));
        // this.connection.onDefinition(this.definitionProvider.handler);
        this.connection.onCompletion(this.onCompletion.bind(this));
        this.connection.onDefinition(this.onDefinition.bind(this));
    }

    public static async initialize(
        connection: Connection,
        { rootPath }: InitializeParams,
    ): Promise<QLangServer> {
        console.log(`Initializing q Lang Server at ${rootPath}`);
        const parser = await initializeParser()
        return QAnalyzer.fromRoot(connection, rootPath, parser).then(
            analyzer => { return new QLangServer(connection, analyzer) }
        )
    }


    public capabilities(): ServerCapabilities {
        return {
            // For now we're using full-sync even though tree-sitter has great support
            // for partial updates.
            textDocumentSync: TextDocumentSyncKind.Full,
            completionProvider: {
                resolveProvider: true,
            },
            hoverProvider: true,
            documentHighlightProvider: true,
            definitionProvider: true,
            documentSymbolProvider: true,
            workspaceSymbolProvider: true,
            referencesProvider: true,
        }
    }

    private onDidChangeContent(change: any) {
        this.analyzer.analyze(change.document.uri, change.document)
        this.validateTextDocument(change.document);
    }

    private onDidChangeWatchedFiles() {
        // here be dragons
        this.connection.console.log('We received an file change event');
    }

    private onCompletion(_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] {
        return this.buildInFsRef;
    }

    private onDefinition(_textDocumentPosition: TextDocumentPositionParams): Location[] {
        console.log(_textDocumentPosition.textDocument)
        console.log(_textDocumentPosition.position)
        return []
    }

    private validateTextDocument(textDocument: TextDocument): void {

        const text = textDocument.getText();
        const pattern = /^[}\])]/gm;
        let m: RegExpExecArray | null;

        let problems = 0;
        const diagnostics: Diagnostic[] = [];
        while (m = pattern.exec(text)) {
            problems++;
            const diagnostic: Diagnostic = {
                severity: DiagnosticSeverity.Error,
                range: {
                    start: textDocument.positionAt(m.index),
                    end: textDocument.positionAt(m.index + m[0].length)
                },
                message: `require a space before ${m[0]}`,
                source: 'q-lang-server'
            };
            diagnostic.relatedInformation = [
                {
                    location: {
                        uri: textDocument.uri,
                        range: Object.assign({}, diagnostic.range)
                    },
                    message: 'Multiline expressions'
                }
            ];
            diagnostics.push(diagnostic);
        }

        // Send the computed diagnostics to VSCode.
        this.connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
    }

    private async onHover(params: TextDocumentPositionParams): Promise<Hover | null> {
        const word = this.getWordAtPoint(params);
        const currentUri = params.textDocument.uri;

        this.logRequest('onHover', params, word)

        if (!word) {
            return null
        }

        let ref = this.buildInFsRef.filter(item => item.label === word.text)[0]

        if (ref) {
            return { contents: [ref.detail!] }
        }

        // let symbols: SymbolInformation[] = [];
        // symbols = this.analyzer.findSymbolsForFile(currentUri);
        // symbols = symbols.filter(
        //     sym =>
        //         sym.containerName === word.containerName && sym.location.range.start.line !== params.position.line)
        // if (word.containerName==='') {
        //     symbols.concat(
        //         this.analyzer.findSymbolsMatchingWord(true, word.text)
        //         .filter(sym=>sym.location.range.start.line!==params.position.line)
        //         );
        // }

        // if (symbols.length === 1) {
        //     return { contents: symbols[0] }
        // }

        return null
    }

    private getWordAtPoint(
        params: ReferenceParams | TextDocumentPositionParams,
    ): word | null {
        return this.analyzer.wordAtPoint(
            params.textDocument.uri,
            params.position.line,
            params.position.character,
        )
    }

    private logRequest(
        request: string,
        params: ReferenceParams | TextDocumentPositionParams,
        word?: word | null
    ) {
        const wordLog = word ? JSON.stringify(word) : 'null'
        this.connection.console.log(
            `${request} ${params.position.line}:${params.position.character} word=${wordLog}`,
        )
    }
}