'use strict';
import type * as vsc from 'vscode';
import { ZigExt } from './zigExt';

export async function activate(context: vsc.ExtensionContext): Promise<void> {
	return ZigExt.activate(context);
}
export async function deactivate(): Promise<void> {
  return ZigExt.deactivate();
}