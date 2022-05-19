'use strict';
import type * as vscode from 'vscode';
import { ZigExtServices } from './zigExt';

export function activate(context: vscode.ExtensionContext): void {
	const zigExtServices = new ZigExtServices(context);
	context.subscriptions.push(zigExtServices);
	zigExtServices.activate();
}
export function deactivate() { /*noop*/ }