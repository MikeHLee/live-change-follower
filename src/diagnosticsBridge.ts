import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigurationManager } from './configuration';
import { debounce, Debouncer } from './debounce';

type Severity = 'error' | 'warning' | 'info' | 'hint';

interface DiagnosticOutput {
    line: number;
    column: number;
    endLine: number;
    endColumn: number;
    severity: Severity;
    message: string;
    source?: string;
    code?: string | number;
}

interface DiagnosticsFile {
    updatedAt: string;
    workspaceRoot: string;
    severitiesIncluded: Severity[];
    totals: {
        error: number;
        warning: number;
        info: number;
        hint: number;
    };
    files: Record<string, DiagnosticOutput[]>;
}

/**
 * Writes VS Code diagnostics (LSP/linter errors) to a JSON file so that
 * terminal-based coding agents can read them and fix issues they can't see.
 */
export class DiagnosticsBridge implements vscode.Disposable {
    private _isEnabled = false;
    private readonly configManager: ConfigurationManager;
    private readonly disposables: vscode.Disposable[] = [];
    private writeDebouncer: Debouncer | undefined;
    private lastWrittenPath: string | undefined;

    constructor(configManager: ConfigurationManager) {
        this.configManager = configManager;
        this.setupDebouncer();
    }

    get isEnabled(): boolean {
        return this._isEnabled;
    }

    enable(silent = false): void {
        if (this._isEnabled) {
            return;
        }
        this._isEnabled = true;
        this.setupListeners();
        // Write initial snapshot
        this.scheduleWrite();
        if (!silent) {
            vscode.window.showInformationMessage(
                `Live Change Follower: Diagnostics bridge enabled (${this.configManager.diagnosticsOutputPath})`
            );
        }
    }

    disable(silent = false): void {
        if (!this._isEnabled) {
            return;
        }
        this._isEnabled = false;
        this.clearListeners();
        this.writeDebouncer?.cancel();
        if (!silent) {
            vscode.window.showInformationMessage('Live Change Follower: Diagnostics bridge disabled');
        }
    }

    toggle(): void {
        if (this._isEnabled) {
            this.disable();
        } else {
            this.enable();
        }
    }

    /**
     * Force an immediate write of the current diagnostics state
     */
    async flush(): Promise<void> {
        this.writeDebouncer?.cancel();
        await this.writeDiagnostics();
    }

    onConfigurationChanged(): void {
        this.setupDebouncer();
        if (this._isEnabled) {
            this.scheduleWrite();
        }
    }

    private setupDebouncer(): void {
        this.writeDebouncer = debounce(
            () => this.writeDiagnostics(),
            this.configManager.diagnosticsDebounceMs
        );
    }

    private setupListeners(): void {
        const diagListener = vscode.languages.onDidChangeDiagnostics(() => {
            if (!this._isEnabled) {
                return;
            }
            this.scheduleWrite();
        });
        this.disposables.push(diagListener);
    }

    private clearListeners(): void {
        for (const d of this.disposables) {
            d.dispose();
        }
        this.disposables.length = 0;
    }

    private scheduleWrite(): void {
        this.writeDebouncer?.call();
    }

    private severityToString(sev: vscode.DiagnosticSeverity): Severity {
        switch (sev) {
            case vscode.DiagnosticSeverity.Error: return 'error';
            case vscode.DiagnosticSeverity.Warning: return 'warning';
            case vscode.DiagnosticSeverity.Information: return 'info';
            case vscode.DiagnosticSeverity.Hint: return 'hint';
            default: return 'info';
        }
    }

    private async writeDiagnostics(): Promise<void> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return;
        }

        const workspaceRoot = workspaceFolder.uri.fsPath;
        const outputPath = path.join(workspaceRoot, this.configManager.diagnosticsOutputPath);
        const allowedSeverities = new Set(this.configManager.diagnosticsSeverities);
        const includeSource = this.configManager.diagnosticsIncludeSource;

        const all = vscode.languages.getDiagnostics();
        const files: Record<string, DiagnosticOutput[]> = {};
        const totals = { error: 0, warning: 0, info: 0, hint: 0 };

        for (const [uri, diagnostics] of all) {
            if (uri.scheme !== 'file') {
                continue;
            }

            // Only include files within the workspace
            const relativePath = path.relative(workspaceRoot, uri.fsPath);
            if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
                continue;
            }

            const filtered: DiagnosticOutput[] = [];
            for (const d of diagnostics) {
                const sev = this.severityToString(d.severity);
                totals[sev]++;
                if (!allowedSeverities.has(sev)) {
                    continue;
                }

                const out: DiagnosticOutput = {
                    line: d.range.start.line + 1, // 1-indexed for human/agent readability
                    column: d.range.start.character + 1,
                    endLine: d.range.end.line + 1,
                    endColumn: d.range.end.character + 1,
                    severity: sev,
                    message: d.message
                };
                if (includeSource && d.source) {
                    out.source = d.source;
                }
                if (d.code !== undefined) {
                    out.code = typeof d.code === 'object' ? d.code.value : d.code;
                }
                filtered.push(out);
            }

            if (filtered.length > 0) {
                // Normalize path separators for cross-platform agent consumption
                const normalizedPath = relativePath.split(path.sep).join('/');
                files[normalizedPath] = filtered;
            }
        }

        const output: DiagnosticsFile = {
            updatedAt: new Date().toISOString(),
            workspaceRoot,
            severitiesIncluded: this.configManager.diagnosticsSeverities,
            totals,
            files
        };

        try {
            // Ensure output directory exists
            const outputDir = path.dirname(outputPath);
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }

            // Write atomically: write to temp file then rename
            const tmpPath = `${outputPath}.tmp`;
            fs.writeFileSync(tmpPath, JSON.stringify(output, null, 2), 'utf8');
            fs.renameSync(tmpPath, outputPath);
            this.lastWrittenPath = outputPath;
        } catch (error) {
            console.error('Live Change Follower: Failed to write diagnostics file:', error);
        }
    }

    dispose(): void {
        this.disable(true);
        this.writeDebouncer?.cancel();
    }
}
