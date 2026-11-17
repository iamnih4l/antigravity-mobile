declare module 'vscode' {
  export interface ExtensionContext {
    subscriptions: { push(...items: any[]): void };
  }

  export enum ConfigurationTarget {
    Global = 1,
    Workspace = 2,
    WorkspaceFolder = 3,
  }

  export enum ViewColumn {
    Active = -1,
    Beside = -2,
    One = 1,
    Two = 2,
  }

  export namespace workspace {
    export interface WorkspaceConfiguration {
      get<T>(section: string): T | undefined;
      update(section: string, value: any, configurationTarget?: ConfigurationTarget | boolean): Thenable<void>;
    }
    export function getConfiguration(section?: string): WorkspaceConfiguration;
    export const workspaceFolders: readonly { name: string; uri: any }[] | undefined;
    export function asRelativePath(pathOrUri: string | any, includeWorkspaceFolder?: boolean): string;
    export function onDidSaveTextDocument(listener: (e: any) => any): any;
  }

  export enum StatusBarAlignment {
    Left = 1,
    Right = 2,
  }

  export interface StatusBarItem {
    text: string;
    tooltip?: string;
    command?: string;
    show(): void;
    hide(): void;
    dispose(): void;
  }

  export interface Webview {
    html: string;
    onDidReceiveMessage(listener: (e: any) => any): any;
  }

  export interface WebviewPanel {
    webview: Webview;
    reveal(viewColumn?: ViewColumn): void;
    dispose(): void;
    onDidDispose(listener: () => any): any;
  }

  export namespace window {
    export function onDidChangeActiveTextEditor(listener: (e: any) => any): any;
    export function onDidOpenTerminal(listener: (e: any) => any): any;
    export function onDidCloseTerminal(listener: (e: any) => any): any;
    export function showInformationMessage(message: string, ...items: any[]): Thenable<any>;
    export function showErrorMessage(message: string, ...items: any[]): Thenable<any>;
    export function showInputBox(options?: {
      prompt?: string;
      placeHolder?: string;
      value?: string;
      ignoreFocusOut?: boolean;
    }): Thenable<string | undefined>;
    export function createStatusBarItem(alignment?: StatusBarAlignment, priority?: number): StatusBarItem;
    export function createWebviewPanel(
      viewType: string,
      title: string,
      showOptions: ViewColumn | { viewColumn: ViewColumn; preserveFocus?: boolean },
      options?: { enableScripts?: boolean }
    ): WebviewPanel;
  }

  export namespace env {
    export const clipboard: {
      writeText(value: string): Thenable<void>;
      readText(): Thenable<string>;
    };
    export function openExternal(target: Uri): Thenable<boolean>;
  }

  export class Uri {
    static parse(value: string): Uri;
    static file(path: string): Uri;
    readonly fsPath: string;
  }

  export namespace languages {
    export function onDidChangeDiagnostics(listener: (e: { uris: readonly any[] }) => any): any;
    export function getDiagnostics(resource?: any): any[];
  }

  export enum DiagnosticSeverity {
    Error = 0,
    Warning = 1,
    Information = 2,
    Hint = 3,
  }

  export namespace commands {
    export function registerCommand(command: string, callback: (...args: any[]) => any): any;
  }

  export namespace lm {
    export function selectChatModels(selector?: any): Thenable<any[]>;
  }
}
