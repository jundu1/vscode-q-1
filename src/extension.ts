import { window, ExtensionContext, languages, IndentAction, commands, WebviewPanel, Range, StatusBarItem, StatusBarAlignment, TextDocument, TextEdit } from 'vscode';
import { QServerTreeProvider } from './q-server-tree';
import { QConn } from './q-conn';
import { QueryView } from './query-view';
import { qCfgInput } from './q-cfg-input';
import { QueryConsole } from './query-console';
import { QConnManager } from './q-conn-manager';
import { semanticTokensProvider } from './q-semantic-token';

let connStatusBar: StatusBarItem;
let modeStatusBar: StatusBarItem;

export function activate(context: ExtensionContext): void {

    // extra language configurations
    languages.setLanguageConfiguration('q', {
        onEnterRules: [
            {
                // eslint-disable-next-line no-useless-escape
                beforeText: /^(?!\s+).*[\(\[{].*$/,
                afterText: /^[)}\]]/,
                action: {
                    indentAction: IndentAction.None,
                    appendText: '\n '
                }
            },
            {
                // eslint-disable-next-line no-useless-escape
                beforeText: /^\s[)}\]];?$/,
                action: {
                    indentAction: IndentAction.Outdent
                }
            },
            {
                // eslint-disable-next-line no-useless-escape
                beforeText: /^\/.*$/,
                action: {
                    indentAction: IndentAction.None,
                    appendText: '/ '
                }
            }
        ]
    });

    // append space to start [,(,{
    languages.registerDocumentFormattingEditProvider('q', {
        provideDocumentFormattingEdits(document: TextDocument): TextEdit[] {
            const textEdit: TextEdit[] = [];
            for (let i = 0; i < document.lineCount; i++) {
                const line = document.lineAt(i);
                if (line.text.match('^[)\\]}]')) {
                    textEdit.push(TextEdit.insert(line.range.start, ' '));
                }

            }
            return textEdit;
        }
    });

    // status bar
    connStatusBar = window.createStatusBarItem(StatusBarAlignment.Left, 99);
    context.subscriptions.push(connStatusBar);
    updateConnStatus(undefined);
    connStatusBar.show();

    // status bar
    modeStatusBar = window.createStatusBarItem(StatusBarAlignment.Left, 100);
    context.subscriptions.push(modeStatusBar);
    updateModeStatus();
    modeStatusBar.show();


    commands.registerCommand(
        'qservers.updateStatusBar',
        name => updateConnStatus(name)
    );

    // q-server-explorer
    const qServers = new QServerTreeProvider();
    window.registerTreeDataProvider('qservers', qServers);

    commands.registerCommand(
        'qservers.refreshEntry', () => qServers.refresh());

    // q cfg input
    commands.registerCommand(
        'qservers.addEntry',
        async () => {
            const qcfg = await qCfgInput(undefined);
            qServers.qConnManager.addCfg(qcfg);
        });

    commands.registerCommand(
        'qservers.editEntry',
        async (qConn: QConn) => {
            const qcfg = await qCfgInput(qConn, false);
            qServers.qConnManager.addCfg(qcfg);

        });

    commands.registerCommand(
        'qservers.deleteEntry',
        (qConn: QConn) => {
            window.showInputBox(
                { prompt: `Confirm to Remove Server '${qConn.label}' (Y/n)` }
            ).then(value => {
                if (value === 'Y') {
                    qServers.qConnManager.removeCfg(qConn.label);

                }
            });
        });

    commands.registerCommand(
        'qservers.connect',
        label => {
            qServers.qConnManager.connect(label);
        });

    commands.registerCommand(
        'qservers.toggleMode',
        () => {
            QConnManager.toggleMode();
            if (QConnManager.consoleMode) {
                window.showInformationMessage('Switch to Query Console Mode');
                QueryView.currentPanel?.dispose();
            } else {
                window.showInformationMessage('Switch to Query View Mode');
                QueryConsole.current?.dispose();
            }
            updateModeStatus();
            updateConnStatusColor();
        });


    context.subscriptions.push(
        commands.registerCommand('queryview.start', () => {
            if (QueryView.currentPanel === undefined) {
                QueryView.createOrShow(context.extensionPath);
            }
        })
    );

    context.subscriptions.push(
        commands.registerCommand('queryconsole.start', () => {
            if (QueryConsole.current === undefined) {
                QueryConsole.createOrShow();
            }
        })
    );

    context.subscriptions.push(
        commands.registerCommand('qservers.queryCurrentLine', () => {
            const n = window.activeTextEditor?.selection.active.line;
            if (n !== undefined) {
                const query = window.activeTextEditor?.document.lineAt(n).text;
                if (query) {
                    qServers.qConnManager.sync(query);
                }
            }
        })
    );

    context.subscriptions.push(
        commands.registerCommand('qservers.querySelection', () => {
            const query = window.activeTextEditor?.document.getText(
                new Range(window.activeTextEditor.selection.start, window.activeTextEditor.selection.end)
            );
            if (query) {
                qServers.qConnManager.sync(query);
            }
        })
    );

    if (window.registerWebviewPanelSerializer) {
        // Make sure we register a serializer in activation event
        window.registerWebviewPanelSerializer(QueryView.viewType, {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            async deserializeWebviewPanel(webviewPanel: WebviewPanel) {
                QueryView.revive(webviewPanel, context.extensionPath);
            }
        });
    }

    context.subscriptions.push(semanticTokensProvider);

}

function updateConnStatus(name: string | undefined) {
    if (name) {
        if (QConnManager.consoleMode) {
            connStatusBar.text = name.toUpperCase();
            connStatusBar.color = '#FF79C6';
        } else {
            connStatusBar.text = name.toUpperCase();
            connStatusBar.color = '#8BE9FD';
        }
    } else {
        connStatusBar.text = 'Disconnected';
        connStatusBar.color = '#6272A4';
    }
}

function updateConnStatusColor() {
    if (QConnManager.consoleMode) {
        connStatusBar.color = '#FF79C6';
    } else {
        connStatusBar.color = '#8BE9FD';
    }
}

function updateModeStatus() {
    if (QConnManager.consoleMode) {
        modeStatusBar.text = '$(debug-console)';
        modeStatusBar.color = '#FF79C6';
    } else {
        modeStatusBar.text = '$(graph)';
        modeStatusBar.color = '#8BE9FD';
    }
}

export function deactivate(): void {
    QueryView.currentPanel?.dispose();
}
