'use strict';
import type * as vscode from 'vscode';
import { zig_ext } from './zigExt';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  return zig_ext.activate(context);
}
export function deactivate() {
  zig_ext.deactivate();
}