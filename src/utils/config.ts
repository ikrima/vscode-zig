'use strict';
import * as vsc from 'vscode';
import { deepCopy } from './objects';
import * as types from './types';
import { ScopedError } from './logging';
import { VariableResolver } from './vsc';

// Gets the config value `clangd.<key>`. Applies ${variable} substitutions.
export function getConfigSection<T>(
  section: string,
  scope?: vsc.ConfigurationScope | null,
  resolveVars?: ((rawConfig: T) => T) | null,
): T | undefined {
  const rawConfig = vsc.workspace.getConfiguration(undefined, scope).get<T>(section);
  if (!rawConfig) { return undefined; }
  const cfgData = deepCopy<T>(rawConfig);
  return resolveVars ? resolveVars(cfgData) : cfgData;
}

export interface ConfigSettings<T> {
  readonly cfgData: T;
  reloadCfg(): void;
}
export namespace ConfigSettings {
  export function create<T>(
    section: string,
    scope?: vsc.ConfigurationScope | null,
    resolveVars?: ((rawConfig: T) => T) | null,
  ): ConfigSettings<T> {
    return new ConfigSettingsData<T>(section, scope, resolveVars);
  }
}
class ConfigSettingsData<T> implements ConfigSettings<T> {
  protected _cfgData: T | undefined;
  constructor(
    protected section: string,
    protected scope?: vsc.ConfigurationScope | null,
    protected resolveVars?: ((rawConfig: T) => T) | null,
  ) { }

  get cfgData(): T {
    if (!this._cfgData) { this.reloadCfg(); }
    return this._cfgData!; // eslint-disable-line @typescript-eslint/no-non-null-assertion
  }

  public reloadCfg(): void {
    this._cfgData = getConfigSection<T>(this.section, this.scope, this.resolveVars);
    if (!types.isDefined(this._cfgData)) { throw ScopedError.make(`Could load config section ${this.section}`); }
  }
}

function defaultResolveVarsImpl<T>(varCtx: VariableResolver, val: T): T {
  if (types.isString(val)) {
    val = varCtx.resolveVars(val) as unknown as T;
  } else if (types.isArray(val)) {
    val = val.map((x) => defaultResolveVarsImpl(varCtx, x)) as unknown as T;
  }
  else if (types.isObject(val)) {
    const result: types.AnyObj = {};
    for (const [k, v] of Object.entries(val)) {
      result[k] = defaultResolveVarsImpl(varCtx, v);
    }
    val = result as T;
  }
  return val;
}

// Replacing placeholders in all strings e.g. https://code.visualstudio.com/docs/editor/variables-reference
export function defaultResolveVars<T>(val: T): T {
  return defaultResolveVarsImpl(new VariableResolver(), val);
}

// export function substitute<T>(val: T): T {
//   if (types.isString(val)) {
//     // If there's no replacement available, keep the placeholder
//     val = val.replace(/\$\{(.*?)\}/g, (match, name: string) => replacement(name) ?? match) as unknown as T;
//   } else if (types.isArray(val)) {
//     val = val.map((x) => substitute(x)) as unknown as T;
//   }
//   else if (types.isObject(val)) {
//     // Substitute values but not keys, so we don't deal with collisions.
//     const result: types.AnyObj = {};
//     for (const [k, v] of Object.entries(val)) {
//       result[k] = substitute(v);
//     }
//     val = result as T;
//   }
//   return val;
// }
// // Subset of substitution variables that are most likely to be useful e.g. https://code.visualstudio.com/docs/editor/variables-reference
// function replacement(name: string): string | undefined {
//   const workspaceRootPrefix = 'workspaceRoot';
//   const workspaceFolderPrefix = 'workspaceFolder';
//   const cwdPrefix = 'cwd';
//   const envPrefix = 'env:';
//   const configPrefix = 'config:';
//   const workspaceRoot = vsc.workspace.workspaceFolders?.[0];
//   const activeDocument = vsc.window.activeTextEditor?.document;
//   if (name === workspaceRootPrefix && workspaceRoot) { return path.normalize(workspaceRoot.uri.fsPath); }
//   if (name === workspaceFolderPrefix && activeDocument) { return path.dirname(activeDocument.uri.fsPath); }
//   if (name === cwdPrefix) { return plat.cwd(); }
//   if (name.startsWith(envPrefix)) { return plat.env[name.substring(envPrefix.length)] ?? ''; }
//   if (name.startsWith(configPrefix)) { return vsc.workspace.getConfiguration().get<string>(name.substring(configPrefix.length)); }
//   return undefined;
// }
