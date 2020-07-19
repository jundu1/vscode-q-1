import {
    CompletionItem, CompletionItemKind
} from 'vscode-languageserver';
import fs = require('fs');
import csvParser = require('csv-parser');
import path = require('path');

export default function getBuildInFsRef() {
    let buildInFs: CompletionItem[] = [];
    const csvPath = path.join(__dirname, '..', '..', 'resources', 'csv', 'build-in-fs.csv')
    fs.createReadStream(csvPath)
        .pipe(csvParser())
        .on('data', (data: CompletionItem) => {
            buildInFs.push(data);
        })
        .on('end', () => {
            console.log("Loaded build-in functions")
        });
    return buildInFs
}
