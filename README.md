# q for Visual Studio Code
[![](https://img.shields.io/visual-studio-marketplace/v/jshinonome.vscode-q?color=blueviolet&style=flat)](https://marketplace.visualstudio.com/items?itemName=jshinonome.vscode-q)
[![](https://vsmarketplacebadge.apphb.com/downloads/jshinonome.vscode-q.svg?color=blue&style=flat)](https://marketplace.visualstudio.com/items?itemName=jshinonome.vscode-q)
[![](https://vsmarketplacebadge.apphb.com/installs/jshinonome.vscode-q.svg?color=success&style=flat)](https://marketplace.visualstudio.com/items?itemName=jshinonome.vscode-q)

This extension adds syntaxes for the q language to VS Code.
Recommend to use theme [dracula/visual-studio-code](https://marketplace.visualstudio.com/items?itemName=dracula-theme.theme-dracula)
See the [Changelog](https://github.com/jshinonome/vscode-q/blob/master/CHANGELOG.md) to know what has changed over the last few versions of this extension.

## Server Explorer
All q servers list in the q Server Explorer, and it is easy to switch to different server.

## Query Console(default)
Output just like q console to output channel. The console size is set to the same as q console. Use `system c rows columns` to change console size.
Call `kdb+/q ext: Toggle query mode` to switch Query View.
![query_console](media/demo/query_console.png)

## Query View
The query view is only optimized for querying table, and first run doesn't show table correctly. From the second run, table view should be normal. At least, you can send query to server now.
Call `kdb+/q ext: Toggle query mode` to switch Query Console.
![query_view](media/demo/query_view.png)

## Highlight Comment
Highlight `@p,@r` in comments, p stands for param, r stands for return.
![highlight_comment.png](media/demo/highlight_comment.png)

## Shortcuts
- ctrl+q: query current line
- ctrl+r: query selected line(s)

## Packages
Thanks to the following packages that makes this happen.
- [node-q](https://github.com/michaelwittig/node-q)
- [Bootstrap](https://getbootstrap.com/)
- [Tabulator](http://tabulator.info/)
- [jQuery](https://jquery.com/)

## Reference
I refer to the following repos for the first draft. Special thanks to [quintanar401/language-kdb-q](https://github.com/quintanar401/language-kdb-q), I had been using it for years.

- https://github.com/simongarland/vim
- https://github.com/quintanar401/language-kdb-q

## License
[MIT](https://github.com/jshinonome/vscode-q/blob/master/LICENSE)