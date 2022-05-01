'use strict';
import type * as vscode from 'vscode';
import { ZigExtServices } from './zigExt';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	const zigExtServices = new ZigExtServices(context);
	context.subscriptions.push(zigExtServices);
	return zigExtServices.activate();
}
export function deactivate() {} // eslint-disable-line @typescript-eslint/no-empty-function