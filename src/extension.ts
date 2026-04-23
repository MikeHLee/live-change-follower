import * as vscode from 'vscode';
import { ChangeFollower } from './changeFollower';
import { StatusBarManager, StatusBarMode } from './statusBar';
import { ConfigurationManager } from './configuration';
import { SessionRecorder } from './sessionRecorder';
import { RecordingPlayer } from './recordingPlayer';
import { LiveDelayBuffer } from './liveDelayBuffer';
import { TimelineWebviewProvider } from './timelineWebview';
import { DiagnosticsBridge } from './diagnosticsBridge';

let changeFollower: ChangeFollower | undefined;
let statusBarManager: StatusBarManager | undefined;
let configManager: ConfigurationManager | undefined;
let sessionRecorder: SessionRecorder | undefined;
let recordingPlayer: RecordingPlayer | undefined;
let liveDelayBuffer: LiveDelayBuffer | undefined;
let timelineProvider: TimelineWebviewProvider | undefined;
let diagnosticsBridge: DiagnosticsBridge | undefined;

export function activate(context: vscode.ExtensionContext): void {
    console.log('Live Change Follower is now active');

    configManager = new ConfigurationManager();
    statusBarManager = new StatusBarManager();
    changeFollower = new ChangeFollower(configManager);
    sessionRecorder = new SessionRecorder(configManager);
    recordingPlayer = new RecordingPlayer(configManager);
    liveDelayBuffer = new LiveDelayBuffer(configManager);
    timelineProvider = new TimelineWebviewProvider(context.extensionUri);
    diagnosticsBridge = new DiagnosticsBridge(configManager);

    timelineProvider.setPlayer(recordingPlayer);

    const timelineView = vscode.window.registerWebviewViewProvider(
        TimelineWebviewProvider.viewType,
        timelineProvider
    );

    const playerStateListener = recordingPlayer.onStateChange((state) => {
        if (state.state === 'stopped' && !sessionRecorder?.isRecording) {
            updateStatusBar();
        } else if (state.state === 'playing') {
            statusBarManager?.update('playing', {
                currentEvent: state.currentEventIndex,
                totalEvents: state.totalEvents,
                speed: state.speed
            });
        } else if (state.state === 'paused') {
            statusBarManager?.update('paused', {
                currentEvent: state.currentEventIndex,
                totalEvents: state.totalEvents,
                speed: state.speed
            });
        }
    });

    const toggleCommand = vscode.commands.registerCommand(
        'liveChangeFollower.toggle',
        () => {
            if (changeFollower) {
                changeFollower.toggle();
                updateStatusBar();
            }
        }
    );

    const enableCommand = vscode.commands.registerCommand(
        'liveChangeFollower.enable',
        () => {
            if (changeFollower) {
                changeFollower.enable();
                updateStatusBar();
            }
        }
    );

    const disableCommand = vscode.commands.registerCommand(
        'liveChangeFollower.disable',
        () => {
            if (changeFollower) {
                changeFollower.disable();
                updateStatusBar();
            }
        }
    );

    const startRecordingCommand = vscode.commands.registerCommand(
        'liveChangeFollower.startRecording',
        async () => {
            if (recordingPlayer?.state === 'playing') {
                vscode.window.showWarningMessage('Cannot record while playing');
                return;
            }
            const success = await sessionRecorder?.startRecording();
            if (success) {
                statusBarManager?.update('recording');
            }
        }
    );

    const stopRecordingCommand = vscode.commands.registerCommand(
        'liveChangeFollower.stopRecording',
        async () => {
            await sessionRecorder?.stopRecording();
            updateStatusBar();
        }
    );

    const openRecordingCommand = vscode.commands.registerCommand(
        'liveChangeFollower.openRecording',
        async () => {
            await recordingPlayer?.openRecording();
            vscode.commands.executeCommand('setContext', 'liveChangeFollower.hasRecording', recordingPlayer?.isLoaded);
        }
    );

    const playRecordingCommand = vscode.commands.registerCommand(
        'liveChangeFollower.playRecording',
        () => {
            if (sessionRecorder?.isRecording) {
                vscode.window.showWarningMessage('Cannot play while recording');
                return;
            }
            recordingPlayer?.play();
        }
    );

    const pausePlaybackCommand = vscode.commands.registerCommand(
        'liveChangeFollower.pausePlayback',
        () => {
            recordingPlayer?.pause();
        }
    );

    const stopPlaybackCommand = vscode.commands.registerCommand(
        'liveChangeFollower.stopPlayback',
        () => {
            recordingPlayer?.stop();
        }
    );

    const skipForwardCommand = vscode.commands.registerCommand(
        'liveChangeFollower.skipForward',
        () => {
            recordingPlayer?.skipForward();
        }
    );

    const skipBackwardCommand = vscode.commands.registerCommand(
        'liveChangeFollower.skipBackward',
        () => {
            recordingPlayer?.skipBackward();
        }
    );

    const speedUpCommand = vscode.commands.registerCommand(
        'liveChangeFollower.speedUp',
        () => {
            recordingPlayer?.speedUp();
        }
    );

    const slowDownCommand = vscode.commands.registerCommand(
        'liveChangeFollower.slowDown',
        () => {
            recordingPlayer?.slowDown();
        }
    );

    const toggleLiveDelayCommand = vscode.commands.registerCommand(
        'liveChangeFollower.toggleLiveDelay',
        () => {
            liveDelayBuffer?.toggle();
        }
    );

    const catchUpToLiveCommand = vscode.commands.registerCommand(
        'liveChangeFollower.catchUpToLive',
        () => {
            liveDelayBuffer?.catchUpToLive();
        }
    );

    const showTimelineCommand = vscode.commands.registerCommand(
        'liveChangeFollower.showTimeline',
        () => {
            vscode.commands.executeCommand('liveChangeFollower.timeline.focus');
        }
    );

    const toggleDiagnosticsBridgeCommand = vscode.commands.registerCommand(
        'liveChangeFollower.toggleDiagnosticsBridge',
        () => {
            diagnosticsBridge?.toggle();
            updateStatusBar();
        }
    );

    const flushDiagnosticsCommand = vscode.commands.registerCommand(
        'liveChangeFollower.flushDiagnostics',
        async () => {
            await diagnosticsBridge?.flush();
            vscode.window.showInformationMessage('Live Change Follower: Diagnostics flushed');
        }
    );

    const autoDisableListener = changeFollower.onDidAutoDisable(() => {
        updateStatusBar();
    });

    const configChangeListener = vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('liveChangeFollower')) {
            configManager?.reload();
            changeFollower?.onConfigurationChanged();
            diagnosticsBridge?.onConfigurationChanged();
        }
    });

    context.subscriptions.push(
        toggleCommand,
        enableCommand,
        disableCommand,
        startRecordingCommand,
        stopRecordingCommand,
        openRecordingCommand,
        playRecordingCommand,
        pausePlaybackCommand,
        stopPlaybackCommand,
        skipForwardCommand,
        skipBackwardCommand,
        speedUpCommand,
        slowDownCommand,
        toggleLiveDelayCommand,
        catchUpToLiveCommand,
        showTimelineCommand,
        toggleDiagnosticsBridgeCommand,
        flushDiagnosticsCommand,
        configChangeListener,
        autoDisableListener,
        playerStateListener,
        timelineView,
        statusBarManager,
        changeFollower,
        sessionRecorder,
        recordingPlayer,
        liveDelayBuffer,
        diagnosticsBridge
    );

    statusBarManager.setCommand('liveChangeFollower.toggle');

    if (configManager.enabled) {
        changeFollower.enable();
    }
    if (configManager.diagnosticsEnabled) {
        diagnosticsBridge.enable(true);
    }
    updateStatusBar();
}

function updateStatusBar(): void {
    if (!statusBarManager) {
        return;
    }

    let mode: StatusBarMode = 'idle';

    if (sessionRecorder?.isRecording) {
        mode = 'recording';
    } else if (recordingPlayer?.state === 'playing') {
        mode = 'playing';
    } else if (recordingPlayer?.state === 'paused') {
        mode = 'paused';
    } else if (changeFollower?.isEnabled) {
        mode = 'following';
    }

    if (mode === 'playing' || mode === 'paused') {
        statusBarManager.update(mode, {
            currentEvent: recordingPlayer?.currentIndex ?? 0,
            totalEvents: recordingPlayer?.totalEvents ?? 0,
            speed: recordingPlayer?.speed ?? 1
        });
    } else {
        statusBarManager.update(mode);
    }
}

export function deactivate(): void {
    changeFollower?.dispose();
    statusBarManager?.dispose();
    sessionRecorder?.dispose();
    recordingPlayer?.dispose();
    liveDelayBuffer?.dispose();
    timelineProvider?.dispose();
    diagnosticsBridge?.dispose();
    changeFollower = undefined;
    statusBarManager = undefined;
    configManager = undefined;
    sessionRecorder = undefined;
    recordingPlayer = undefined;
    liveDelayBuffer = undefined;
    timelineProvider = undefined;
    diagnosticsBridge = undefined;
}
