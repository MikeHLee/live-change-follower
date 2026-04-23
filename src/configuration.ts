import * as vscode from 'vscode';

export type DiagnosticSeverity = 'error' | 'warning' | 'info' | 'hint';
export type OpenInColumn = 'active' | 'beside' | 'one' | 'two' | 'three';

export class ConfigurationManager {
    private config: vscode.WorkspaceConfiguration;

    constructor() {
        this.config = vscode.workspace.getConfiguration('liveChangeFollower');
    }

    reload(): void {
        this.config = vscode.workspace.getConfiguration('liveChangeFollower');
    }

    get enabled(): boolean {
        return this.config.get<boolean>('enabled', false);
    }

    get includePatterns(): string[] {
        return this.config.get<string[]>('includePatterns', ['**/*']);
    }

    get excludePatterns(): string[] {
        return this.config.get<string[]>('excludePatterns', [
            '**/node_modules/**',
            '**/.git/**',
            '**/out/**',
            '**/dist/**',
            '**/*.vsix'
        ]);
    }

    get disableOnManualEdit(): boolean {
        return this.config.get<boolean>('disableOnManualEdit', true);
    }

    get debounceMs(): number {
        return this.config.get<number>('debounceMs', 150);
    }

    get highlightDuration(): number {
        return this.config.get<number>('highlightDuration', 2000);
    }

    get respectGitignore(): boolean {
        return this.config.get<boolean>('respectGitignore', true);
    }

    get maxTrackedFiles(): number {
        const value = this.config.get<number>('maxTrackedFiles', 3);
        return Math.max(1, Math.min(10, value));
    }

    get openInColumn(): OpenInColumn {
        return this.config.get<OpenInColumn>('openInColumn', 'beside');
    }

    getViewColumn(): vscode.ViewColumn {
        switch (this.openInColumn) {
            case 'active': return vscode.ViewColumn.Active;
            case 'beside': return vscode.ViewColumn.Beside;
            case 'one': return vscode.ViewColumn.One;
            case 'two': return vscode.ViewColumn.Two;
            case 'three': return vscode.ViewColumn.Three;
            default: return vscode.ViewColumn.Beside;
        }
    }

    get recordingsPath(): string {
        return this.config.get<string>('recordingsPath', '.recordings');
    }

    get liveDelaySeconds(): number {
        return this.config.get<number>('liveDelaySeconds', 0);
    }

    get defaultPlaybackSpeed(): number {
        return this.config.get<number>('defaultPlaybackSpeed', 1);
    }

    // Diagnostics bridge settings
    get diagnosticsEnabled(): boolean {
        return this.config.get<boolean>('diagnosticsBridge.enabled', true);
    }

    get diagnosticsOutputPath(): string {
        return this.config.get<string>('diagnosticsBridge.outputPath', '.vscode/agent-diagnostics.json');
    }

    get diagnosticsSeverities(): DiagnosticSeverity[] {
        return this.config.get<DiagnosticSeverity[]>('diagnosticsBridge.severities', ['error', 'warning']);
    }

    get diagnosticsDebounceMs(): number {
        return this.config.get<number>('diagnosticsBridge.debounceMs', 500);
    }

    get diagnosticsIncludeSource(): boolean {
        return this.config.get<boolean>('diagnosticsBridge.includeSource', true);
    }
}
