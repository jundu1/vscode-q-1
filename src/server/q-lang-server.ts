import {
    TextDocuments, Diagnostic, DiagnosticSeverity, Location, Hover,
    InitializeParams, CompletionItem, TextDocumentPositionParams, TextDocumentSyncKind, InitializeResult, IConnection, Connection, ReferenceParams, ServerCapabilities, WorkspaceSymbolParams, SymbolInformation, DocumentHighlight, DocumentSymbolParams, DidChangeWatchedFilesParams, FileChangeType, MarkupKind, MarkupContent
} from 'vscode-languageserver';
import * as fs from 'fs';
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
        this.connection.onDefinition(this.onDefinition.bind(this));
        this.connection.onWorkspaceSymbol(this.onWorkspaceSymbol.bind(this))
        this.connection.onDidChangeWatchedFiles(this.onDidChangeWatchedFiles.bind(this));
        this.connection.onDocumentHighlight(this.onDocumentHighlight.bind(this))
        this.connection.onReferences(this.onReferences.bind(this))
        this.connection.onDocumentSymbol(this.onDocumentSymbol.bind(this));
        this.connection.onCompletion(this.onCompletion.bind(this));
        this.connection.onCompletionResolve(this.onCompletionResolve.bind(this))
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

    // todo - when add more rules, extract to a package
    private onDidChangeContent(change: any) {
        this.analyzer.analyze(change.document.uri, change.document)
        this.validateTextDocument(change.document);
    }

    private onDidChangeWatchedFiles(change: DidChangeWatchedFilesParams) {
        this.connection.console.log('Received file change event(s)');
        change.changes.forEach(event => {
            if (/.*\/src\/.*\.q/.test(event.uri)) {
                if (event.type === FileChangeType.Deleted) {
                    this.analyzer.remove(event.uri)
                } else {
                    const fileContent = fs.readFileSync(event.uri, 'utf8')
                    this.analyzer.analyze(event.uri, TextDocument.create(event.uri, 'q', 1, fileContent))
                }

            }
        })
    }

    // todo: symbol, local_identifier, global_identifier
    private onCompletion(params: TextDocumentPositionParams): CompletionItem[] {
        const word = this.getWordAtPoint({
            ...params,
            position: {
                line: params.position.line,
                // Go one character back to get completion on the current word
                character: Math.max(params.position.character - 1, 0),
            },
        })

        let symbols: string[] = [];
        let localId: string[] = [];
        let globalId: string[] = [];
        let completionItem: CompletionItem[] = [];
        // console.log(word?.text)

        if (word?.text.startsWith('.')) {
            completionItem = this.buildInFsRef.filter(item => item.label.startsWith(word.text));
            globalId = this.analyzer
                .getAllVariableSymbols().map(sym => sym.name).filter(id => id.startsWith('.'));
            new Set(globalId).forEach(id => completionItem.push(CompletionItem.create(id)))
            // } else if (word?.text.startsWith('`')) {
            //     symbols = this.analyzer
            //         .findSynNodeByType(params.textDocument.uri, 'constant_symbol').map(n => n.text.trim()).filter(s => s.startsWith(word.text))
            //     new Set(symbols).forEach(id => completionItem.push(CompletionItem.create(id)))
        } else {
            completionItem = this.buildInFsRef.filter(item => !item.label.startsWith('.'));
            localId = this.analyzer
                .findSynNodeByType(params.textDocument.uri, 'local_identifer').map(n => n.text.trim());
            new Set(localId).forEach(id => completionItem.push(CompletionItem.create(id)))
        }
        // console.log(completionItem)s
        return completionItem;
    }

    private async onCompletionResolve(
        item: CompletionItem,
    ): Promise<CompletionItem> {
        if (item.label.startsWith('.') || item.label.startsWith('`')) {
            item.insertText = item.label.slice(1);
        }
        return item
    }


    private onDefinition(params: TextDocumentPositionParams): Location[] {
        const word = this.getWordAtPoint(params)
        // this.logRequest('onDefinition', params, word);
        if (!word) {
            return []
        }
        return this.analyzer.findDefinition(word, params.textDocument.uri)
    }

    private onWorkspaceSymbol(params: WorkspaceSymbolParams): SymbolInformation[] {
        return this.analyzer.search(params.query)
    }

    private onDocumentHighlight(
        params: TextDocumentPositionParams,
    ): DocumentHighlight[] | null {
        const word = this.getWordAtPoint(params)
        // this.logRequest('onDocumentHighlight', params, word)
        if (!word) {
            return []
        }
        return this.analyzer.findSynNodeLocations(params.textDocument.uri, word)
            .map(syn => { return { range: syn.range } })
    }

    private onReferences(params: ReferenceParams): Location[] | null {
        const word = this.getWordAtPoint(params)
        // this.logRequest('onReferences', params, word)
        if (!word) {
            return null
        }
        return this.analyzer.findReferences(word, params.textDocument.uri)
    }

    // todo: limit to global and null container
    private onDocumentSymbol(params: DocumentSymbolParams): SymbolInformation[] {
        // this.connection.console.log(`onDocumentSymbol`)
        return this.analyzer.findSymbolsForFile(params.textDocument.uri)
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

        // this.logRequest('onHover', params, word)

        if (!word) {
            return null
        }

        let ref = this.buildInFsRef.filter(item => item.label === word.text)[0]

        if (ref) {
            const markupContent: MarkupContent = {
                kind: MarkupKind.PlainText,
                value: [ref.detail!, ref.documentation!].join('\n')
            }
            return { contents: markupContent }
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