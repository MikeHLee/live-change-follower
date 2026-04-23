import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { minimatch } from 'minimatch';
import ignore, { Ignore } from 'ignore';
import { ConfigurationManager } from './configuration';
import { debounce, Debouncer } from './debounce';

interface PendingChange {
    uri: vscode.Uri;
    ranges: vscode.Range[];
    timestamp: number;
}

export class ChangeFollower implements vscode.Disposable {
    private _isEnabled = false;
    private readonly disposables: vscode.Disposable[] = [];
    private readonly configManager: ConfigurationManager;
    private readonly pendingChanges: Map<string, PendingChange> = new Map();
    private processChangesDebouncer: Debouncer | undefined;
    private highlightDecorationType: vscode.TextEditorDecorationType | undefined;
    private activeHighlights: Map<string, NodeJS.Timeout> = new Map();
    private gitignoreCache: Map<string, Ignore> = new Map();
    private recentExternalChanges: Map<string, NodeJS.Timeout> = new Map();
    private recentFiles: string[] = [];
    private openedByUs: Set<string> = new Set();
    private static readonly EXTERNAL_CHANGE_WINDOW_MS = 2000;
    private readonly _onDidAutoDisable = new vscode.EventEmitter<void>();
    readonly onDidAutoDisable = this._onDidAutoDisable.event;

    constructor(configManager: ConfigurationManager) {
        this.configManager = configManager;
        this.setupHighlightDecoration();
        this.setupDebouncer();
    }

    get isEnabled(): boolean {
        return this._isEnabled;
    }

    toggle(): void {
        if (this._isEnabled) {
            this.disable();
        } else {
            this.enable();
        }
    }

    enable(): void {
        if (this._isEnabled) {
            return;
        }

        this._isEnabled = true;
        this.setupListeners();
        vscode.window.showInformationMessage('Live Change Follower: Follow mode enabled');
    }

    disable(silent = false): void {
        if (!this._isEnabled) {
            return;
        }

        this._isEnabled = false;
        this.clearListeners();
        this.pendingChanges.clear();
        this.clearAllHighlights();
        this.clearAllExternalChangeTracking();
        this.recentFiles = [];
        this.openedByUs.clear();
        if (!silent) {
            vscode.window.showInformationMessage('Live Change Follower: Follow mode disabled');
        }
    }

    onConfigurationChanged(): void {
        this.setupDebouncer();
        this.setupHighlightDecoration();
        this.gitignoreCache.clear();
    }

    private setupDebouncer(): void {
        this.processChangesDebouncer = debounce(
            () => this.processChanges(),
            this.configManager.debounceMs
        );
    }

    private setupHighlightDecoration(): void {
        this.highlightDecorationType?.dispose();
        this.highlightDecorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: new vscode.ThemeColor('diffEditor.insertedTextBackground'),
            isWholeLine: true
        });
    }

    private setupListeners(): void {
        // Listen for text document changes (edits to open documents)
        const textChangeListener = vscode.workspace.onDidChangeTextDocument((event) => {
            if (!this._isEnabled) {
                return;
            }
            this.handleTextDocumentChange(event);
        });

        // Listen for file creation
        const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*');
        
        const createListener = fileWatcher.onDidCreate((uri) => {
            if (!this._isEnabled) {
                return;
            }
            this.handleFileCreated(uri);
        });

        const changeListener = fileWatcher.onDidChange((uri) => {
            if (!this._isEnabled) {
                return;
            }
            this.handleFileChanged(uri);
        });

        this.disposables.push(textChangeListener, fileWatcher, createListener, changeListener);
    }

    private clearListeners(): void {
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables.length = 0;
    }

    private handleTextDocumentChange(event: vscode.TextDocumentChangeEvent): void {
        const uri = event.document.uri;

        // Skip non-file schemes
        if (uri.scheme !== 'file') {
            return;
        }

        // Skip if no content changes
        if (event.contentChanges.length === 0) {
            return;
        }

        // Detect manual edits: if the changed document is the active editor's document
        // and the change was NOT from an external file modification, the user is actively
        // editing. External changes are tracked via the file system watcher which fires
        // before VS Code reloads the document.
        if (this.configManager.disableOnManualEdit) {
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor && activeEditor.document.uri.toString() === uri.toString()) {
                const key = uri.toString();
                if (this.recentExternalChanges.has(key)) {
                    // Change originated from disk, not the user typing
                    this.clearExternalChangeTracking(key);
                } else {
                    this.disable(true);
                    this._onDidAutoDisable.fire();
                    vscode.window.showInformationMessage('Live Change Follower: Follow mode auto-disabled due to manual edit');
                    return;
                }
            }
        }

        // Check if file matches patterns
        if (!this.shouldFollowFile(uri)) {
            return;
        }

        // Convert content changes to ranges
        const ranges = event.contentChanges.map(change => {
            // For insertions/replacements, use the range after the change
            const startLine = change.range.start.line;
            const lineCount = change.text.split('\n').length;
            const endLine = startLine + lineCount - 1;
            return new vscode.Range(startLine, 0, endLine, 0);
        });

        this.queueChange(uri, ranges);
    }

    private handleFileCreated(uri: vscode.Uri): void {
        if (!this.shouldFollowFile(uri)) {
            return;
        }

        // Queue showing the new file at the beginning
        this.queueChange(uri, [new vscode.Range(0, 0, 0, 0)]);
    }

    private handleFileChanged(uri: vscode.Uri): void {
        // Track that this file was changed externally (on disk), so that when VS Code
        // reloads the document and fires onDidChangeTextDocument, we don't mistake
        // it for a manual user edit
        this.trackExternalChange(uri);

        // File changed externally - only handle if not already open
        const openDocument = vscode.workspace.textDocuments.find(
            doc => doc.uri.toString() === uri.toString()
        );

        if (openDocument) {
            // Already open, will be handled by onDidChangeTextDocument
            return;
        }

        if (!this.shouldFollowFile(uri)) {
            return;
        }

        // Queue showing the file (we don't know where the change is)
        this.queueChange(uri, [new vscode.Range(0, 0, 0, 0)]);
    }

    private shouldFollowFile(uri: vscode.Uri): boolean {
        const relativePath = vscode.workspace.asRelativePath(uri, false);

        // Check exclude patterns first
        for (const pattern of this.configManager.excludePatterns) {
            if (minimatch(relativePath, pattern, { dot: true })) {
                return false;
            }
        }

        // Check .gitignore if enabled
        if (this.configManager.respectGitignore && this.isIgnoredByGitignore(uri)) {
            return false;
        }

        // Check include patterns
        for (const pattern of this.configManager.includePatterns) {
            if (minimatch(relativePath, pattern, { dot: true })) {
                return true;
            }
        }

        return false;
    }

    private isIgnoredByGitignore(uri: vscode.Uri): boolean {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
        if (!workspaceFolder) {
            return false;
        }

        const workspaceRoot = workspaceFolder.uri.fsPath;
        const ig = this.getGitignore(workspaceRoot);
        if (!ig) {
            return false;
        }

        const relativePath = path.relative(workspaceRoot, uri.fsPath);
        // Normalize path separators for cross-platform compatibility
        const normalizedPath = relativePath.split(path.sep).join('/');
        return ig.ignores(normalizedPath);
    }

    private getGitignore(workspaceRoot: string): Ignore | undefined {
        if (this.gitignoreCache.has(workspaceRoot)) {
            return this.gitignoreCache.get(workspaceRoot);
        }

        const gitignorePath = path.join(workspaceRoot, '.gitignore');
        try {
            if (fs.existsSync(gitignorePath)) {
                const content = fs.readFileSync(gitignorePath, 'utf8');
                const ig = ignore().add(content);
                this.gitignoreCache.set(workspaceRoot, ig);
                return ig;
            }
        } catch {
            // Failed to read .gitignore, continue without it
        }

        return undefined;
    }

    private trackExternalChange(uri: vscode.Uri): void {
        const key = uri.toString();
        this.clearExternalChangeTracking(key);
        const timer = setTimeout(() => {
            this.recentExternalChanges.delete(key);
        }, ChangeFollower.EXTERNAL_CHANGE_WINDOW_MS);
        this.recentExternalChanges.set(key, timer);
    }

    private clearExternalChangeTracking(key: string): void {
        const existing = this.recentExternalChanges.get(key);
        if (existing) {
            clearTimeout(existing);
            this.recentExternalChanges.delete(key);
        }
    }

    private clearAllExternalChangeTracking(): void {
        for (const timer of this.recentExternalChanges.values()) {
            clearTimeout(timer);
        }
        this.recentExternalChanges.clear();
    }

    private queueChange(uri: vscode.Uri, ranges: vscode.Range[]): void {
        const key = uri.toString();
        const existing = this.pendingChanges.get(key);

        if (existing) {
            // Merge ranges
            existing.ranges.push(...ranges);
            existing.timestamp = Date.now();
        } else {
            this.pendingChanges.set(key, {
                uri,
                ranges,
                timestamp: Date.now()
            });
        }

        this.processChangesDebouncer?.call();
    }

    private async processChanges(): Promise<void> {
        if (!this._isEnabled || this.pendingChanges.size === 0) {
            return;
        }

        // Sort all pending changes by timestamp (most recent first)
        const allChanges = Array.from(this.pendingChanges.values())
            .sort((a, b) => b.timestamp - a.timestamp);

        // Clear pending changes
        this.pendingChanges.clear();

        if (allChanges.length === 0) {
            return;
        }

        const maxFiles = this.configManager.maxTrackedFiles;

        // Update recent files window with these new changes
        for (const change of allChanges) {
            this.updateRecentFiles(change.uri.toString());
        }

        // Show up to maxFiles files, prioritizing most recently changed
        // We show them in reverse (oldest first) so the most recent ends up focused/visible
        const changesToShow = allChanges.slice(0, maxFiles).reverse();

        for (const change of changesToShow) {
            if (!this._isEnabled) {
                return;
            }
            await this.showChange(change);
        }

        // Prune any editors beyond maxFiles window
        await this.pruneStaleEditors();
    }

    private updateRecentFiles(uriString: string): void {
        // Remove if already present
        const existingIdx = this.recentFiles.indexOf(uriString);
        if (existingIdx !== -1) {
            this.recentFiles.splice(existingIdx, 1);
        }
        // Add to front
        this.recentFiles.unshift(uriString);
        // Trim to max
        const max = this.configManager.maxTrackedFiles;
        if (this.recentFiles.length > max) {
            this.recentFiles = this.recentFiles.slice(0, max);
        }
    }

    private async pruneStaleEditors(): Promise<void> {
        const activeSet = new Set(this.recentFiles);
        // Close tab groups for files that the extension opened but are no longer in the recent window.
        // We only close editors we opened; track via openedByUs set.
        const editorsToClose: vscode.TextDocument[] = [];
        for (const uriString of this.openedByUs) {
            if (!activeSet.has(uriString)) {
                const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === uriString);
                if (doc) {
                    editorsToClose.push(doc);
                }
                this.openedByUs.delete(uriString);
            }
        }

        // We avoid auto-closing editors to not disrupt user; just stop tracking.
        // Closing tabs programmatically is intrusive; skip unless user requests it later.
    }

    private async showChange(change: PendingChange): Promise<void> {
        try {
            if (!this._isEnabled) {
                return;
            }

            const document = await vscode.workspace.openTextDocument(change.uri);
            
            if (!this._isEnabled) {
                return;
            }

            const viewColumn = this.configManager.getViewColumn();
            const editor = await vscode.window.showTextDocument(document, {
                preview: false,
                preserveFocus: true,
                viewColumn
            });

            this.openedByUs.add(change.uri.toString());

            if (!this._isEnabled || editor !== vscode.window.visibleTextEditors.find(e => e === editor)) {
                return;
            }

            const rangeToReveal = change.ranges.length > 0 
                ? change.ranges[change.ranges.length - 1]
                : new vscode.Range(0, 0, 0, 0);

            await new Promise(resolve => setTimeout(resolve, 0));
            editor.revealRange(rangeToReveal, vscode.TextEditorRevealType.InCenter);

            if (this.configManager.highlightDuration > 0 && this.highlightDecorationType) {
                this.applyHighlight(editor, change.ranges);
            }
        } catch (error) {
            console.log(`Live Change Follower: Could not open ${change.uri.fsPath}:`, error);
        }
    }

    private applyHighlight(editor: vscode.TextEditor, ranges: vscode.Range[]): void {
        if (!this.highlightDecorationType) {
            return;
        }

        const key = editor.document.uri.toString();

        // Clear existing highlight timer for this file
        const existingTimer = this.activeHighlights.get(key);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }

        // Apply highlight
        editor.setDecorations(this.highlightDecorationType, ranges);

        // Schedule removal
        const timer = setTimeout(() => {
            if (this.highlightDecorationType) {
                // Find the editor again as it might have changed
                const currentEditor = vscode.window.visibleTextEditors.find(
                    e => e.document.uri.toString() === key
                );
                if (currentEditor) {
                    currentEditor.setDecorations(this.highlightDecorationType, []);
                }
            }
            this.activeHighlights.delete(key);
        }, this.configManager.highlightDuration);

        this.activeHighlights.set(key, timer);
    }

    private clearAllHighlights(): void {
        for (const timer of this.activeHighlights.values()) {
            clearTimeout(timer);
        }
        this.activeHighlights.clear();

        if (this.highlightDecorationType) {
            for (const editor of vscode.window.visibleTextEditors) {
                editor.setDecorations(this.highlightDecorationType, []);
            }
        }
    }

    dispose(): void {
        this.disable();
        this.highlightDecorationType?.dispose();
        this._onDidAutoDisable.dispose();
        this.clearAllExternalChangeTracking();
        this.clearListeners();
    }
}
