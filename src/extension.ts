'use strict';
import type * as vsc from 'vscode';
import { ZigExtServices } from './zigExt';

export function activate(context: vsc.ExtensionContext): void {
	const zigExtServices = new ZigExtServices(context);
	context.subscriptions.push(zigExtServices);
	zigExtServices.activate();
}
export function deactivate() { /*noop*/ }