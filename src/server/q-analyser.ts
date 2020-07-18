import * as fs from 'fs';
import FuzzySearch = require('fuzzy-search');
import { Connection, InitializeParams, TextDocument, SymbolInformation, SymbolKind, Diagnostic, DiagnosticSeverity, Location, Range } from 'vscode-languageserver'
import * as Parser from 'web-tree-sitter'

import * as CONFIG from './config'
import * as TreeSitterUtil from './util/tree-sitter'

import walkSync = require('walk-sync');
import { DocumentUri } from 'vscode-languageserver-textdocument'
import path = require('path');

type nameToSymbolInfo = Map<string, SymbolInformation[]>;
export type word = {
    type: string,
    text: string,
    containerName: string,
}
/**
 * The Analyzer analyze Abstract Syntax Trees of tree-sitter-q
 */
export default class QAnalyzer {
    public static async fromRoot(
        connection: Connection,
        rootPath: string | undefined | null,
        parser: Parser
    ): Promise<QAnalyzer> {
        const analyzer = new QAnalyzer(parser)

        if (rootPath) {
            const globPattern = CONFIG.GLOB_PATTERN;

            connection.console.log(
                `Analyzing files matching glob "${globPattern}" inside ${rootPath}`,
            )

            const lookupStartTime = Date.now()
            const getTimePassed = (): string =>
                `${(Date.now() - lookupStartTime) / 1000} seconds`

            const qSrcFiles = walkSync(rootPath, {
                directories: false,
                globs: [globPattern]
            });

            if (qSrcFiles.length == 0) {
                connection.window.showWarningMessage(
                    `Failed to find any q source files using the glob "${globPattern}". Some feature will not be available.`,
                )
            }

            connection.console.log(
                `Glob found ${qSrcFiles.length} files after ${getTimePassed()}`,
            )

            qSrcFiles.forEach((filepath: string) => {
                const fullPath = path.join(rootPath, filepath);
                const uri = `file://${fullPath}`

                connection.console.log(`Analyzing ${uri}`);
                try {
                    const fileContent = fs.readFileSync(fullPath, 'utf8')
                    analyzer.analyze(uri, TextDocument.create(uri, 'q', 1, fileContent))
                } catch (error) {
                    connection.console.warn(`Failed analyzing ${uri}. Error: ${error.message}`)
                }
            });

            connection.console.log(`Analyzing took ${getTimePassed()}`)
        }
        return analyzer
    }

    private parser: Parser

    private uriToTextDocument = new Map<string, TextDocument>();

    private uriToTree = new Map<DocumentUri, Parser.Tree>();

    private uriToFileContent = new Map<DocumentUri, string>();

    private uriToDefinition = new Map<DocumentUri, nameToSymbolInfo>();

    public constructor(parser: Parser) {
        this.parser = parser
    }

    /**
     * Find all the definition locations
     */
    public findDefinition(name: string): Location[] {
        const symbols: SymbolInformation[] = []
        this.uriToDefinition.forEach(nameToSymInfo => {
            symbols.concat(nameToSymInfo.get(name) || [])
        })
        return symbols.map(s => s.location)
    }

    /**
     * Find all the symbols matching the query using fuzzy search.
     */
    public search(query: string): SymbolInformation[] {
        const searcher = new FuzzySearch(this.getAllSymbols(), ['name'], {
            caseSensitive: true,
        })
        return searcher.search(query)
    }

    /**
     * Find all the reference locations
     */
    public findReferences(name: string): Location[] {
        const locations: Location[] = [];
        this.uriToTree.forEach((_, uri) => locations.concat(this.findOccurrences(uri, name)));
        return locations.flat();
    }

    /**
     * Find all occurrences of name in the given file.
     * It's currently not scope-aware.
     */
    public findOccurrences(uri: string, query: string): Location[] {
        const tree = this.uriToTree.get(uri)
        const content = this.uriToFileContent.get(uri)
        const locations: Location[] = []

        if (tree && content) {
            TreeSitterUtil.forEach(tree.rootNode, n => {
                let name: null | string = null
                let range: null | Range = null

                if (TreeSitterUtil.isReference(n)) {
                    const node = n.firstNamedChild || n
                    name = content.slice(node.startIndex, node.endIndex)
                    range = TreeSitterUtil.range(node)
                } else if (TreeSitterUtil.isDefinition(n)) {
                    const namedNode = n.firstNamedChild
                    if (namedNode) {
                        name = content.slice(namedNode.startIndex, namedNode.endIndex)
                        range = TreeSitterUtil.range(namedNode)
                    }
                }

                if (name === query && range !== null) {
                    locations.push(Location.create(uri, range))
                }
            })
        }
        return locations
    }

    /**
     * Find all symbol definitions in the given file.
     */
    public findSymbolsForFile(uri: string): SymbolInformation[] {
        const nameToSymInfos = this.uriToDefinition.get(uri)?.values()
        return nameToSymInfos ? Array.from(nameToSymInfos).flat() : []
    }

    /**
     * Find symbol completions for the given word.
     */
    public findSymbolsMatchingWord(
        exactMatch: boolean,
        word: string,
    ): SymbolInformation[] {
        const symbols: SymbolInformation[] = []

        this.uriToDefinition.forEach((nameToSymInfo) => {
            nameToSymInfo.forEach((syms, name) => {
                const match = exactMatch ? name === word : name.startsWith(word)
                if (match) {
                    symbols.concat(syms);
                }
            })
        })

        return symbols
    }

    /**
     * Analyze the given document, cache the tree-sitter AST, and iterate over the
     * tree to find declarations.
     * Returns all, if any, syntax errors that occurred while parsing the file.
     */
    public analyze(uri: DocumentUri, document: TextDocument): Diagnostic[] {
        const content = document.getText()

        const tree = this.parser.parse(content)

        this.uriToTextDocument.set(uri, document);
        this.uriToTree.set(uri, tree);
        this.uriToDefinition.set(uri, new Map<string, SymbolInformation[]>());
        this.uriToFileContent.set(uri, content)

        const problems: Diagnostic[] = []

        TreeSitterUtil.forEach(tree.rootNode, (n: Parser.SyntaxNode) => {
            if (n.type === 'ERROR') {
                problems.push(
                    Diagnostic.create(
                        TreeSitterUtil.range(n),
                        'Failed to parse expression',
                        DiagnosticSeverity.Error,
                    ),
                )
                return
            } else if (TreeSitterUtil.isDefinition(n)) {
                const named = n.firstChild
                if (named === null) {
                    return
                }
                const name = content.slice(named.startIndex, named.endIndex)
                const declarations = this.uriToDefinition.get(uri)?.get(name) || []

                const containerName = this.getContainerName(n) ?? '';

                declarations.push(
                    SymbolInformation.create(
                        name,
                        // only variable, may change to function/variable later
                        SymbolKind.Variable,
                        TreeSitterUtil.range(n),
                        uri,
                        containerName,
                    ),
                )

                this.uriToDefinition.get(uri)!.set(name, declarations);
            }
        })

        function findMissingNodes(node: Parser.SyntaxNode) {
            if (node.isMissing()) {
                problems.push(
                    Diagnostic.create(
                        TreeSitterUtil.range(node),
                        `Syntax error: expected "${node.type}" somewhere in the file`,
                        DiagnosticSeverity.Warning,
                    ),
                )
            } else if (node.hasError()) {
                node.children.forEach(findMissingNodes)
            }
        }

        findMissingNodes(tree.rootNode)

        return problems
    }

    /**
     * find its container, basically the function name
     * @param n
     * @param content
     */
    private getContainerName(n: Parser.SyntaxNode): string {
        const body = TreeSitterUtil.findParent(n, p => p.type === 'function_body');
        if (body?.parent?.type === 'expression_statement') {
            if (body?.parent?.parent?.type === 'assignment') {
                const assignment = body.parent.parent;
                // 2nd - right side is body itself
                if (assignment?.namedChild(1)?.firstNamedChild?.type === 'function_body') {
                    const functionNamed = assignment.firstNamedChild!;
                    return functionNamed.text.trim();
                }
            } else {
                return 'LAMBDA'
            }
        }
        return '';
    }

    /**
     * Find the full word at the given point.
     */
    public wordAtPoint(uri: string, line: number, column: number): word | null {
        const document = this.uriToTree.get(uri)

        if (!document?.rootNode) {
            return null
        }

        const node = document.rootNode.descendantForPosition({ row: line, column })

        if (!node || node.childCount > 0 || node.text.trim() === '') {
            return null
        }

        return {
            type: node.type,
            text: node.text.trim(),
            containerName: this.getContainerName(node)
        }
    }

    public getAllVariableSymbols(): SymbolInformation[] {
        return this.getAllSymbols().filter(symbol => symbol.kind === SymbolKind.Variable)
    }

    private getAllSymbols(): SymbolInformation[] {
        const symbols: SymbolInformation[] = []
        this.uriToDefinition.forEach((nameToSymInfo) => {
            nameToSymInfo.forEach((sym) => symbols.concat(sym));
        })
        return symbols
    }
}
