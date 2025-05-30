'use strict';
import * as vsc from 'vscode';
import { ScopedError } from '../utils/dbg';
import * as fs from '../utils/fs';
import * as plat from '../utils/plat';
import * as process from '../utils/process';
import * as strings from '../utils/strings';
import * as types from '../utils/types';
import { extCfg } from '../zigExt';


export enum StepGroup {
  run = 0,
  test,
  build,
  tool,
  none,
}
export namespace StepGroup {
  export function toIcon(group: StepGroup): string {
    switch (group) {
      case StepGroup.run: return "$(play)";
      case StepGroup.test: return "$(beaker)";
      case StepGroup.build: return "$(package)";
      case StepGroup.tool: return "$(tools)";
      case StepGroup.none: return '';
    }
  }
  export function fromDesc(desc: string): StepGroup {
    return desc.startsWith("Run:") ? StepGroup.run
      : desc.startsWith("Test") ? StepGroup.test
        : desc.startsWith("Build:") ? StepGroup.build
          : desc.startsWith("Tool:") ? StepGroup.tool
            : StepGroup.none;
  }
}

export type ZigTestStep = {
  label?: string;
  buildArgs: {
    testSrcFile: string;
    mainPkgPath?: string | undefined;
  };
  runArgs: {
    debugLaunch?: boolean;
    testFilter?: string;
    cwd?: string;
  };
};

export type ZigBldStep = {
  name: string;
  desc: string;
  group: StepGroup;
  default: boolean;
};
const stepsRegEx = /\s+(?<name>\S+)\s(?<dflt>\(default\))?\s*(?<desc>[^\n]+)\n?/g;

export async function rawGetBuildSteps(): Promise<ZigBldStep[]> {
  const zig = extCfg.zig;
  if (!await fs.fileExists(zig.buildFile)) {
    return ScopedError.reject("Aborting build target fetch. No build.zig file found in workspace root.");
  }

  try {
    const { stdout, stderr } = await process.execFile(
      zig.binary,
      [
        "build",
        "--help",
        ...[`--build-file`, zig.buildFile],
      ],
      {
        encoding: 'utf8',
        cwd: zig.buildRootDir,
        shell: vsc.env.shell,
      }
    );

    if (strings.isNotBlank(stderr)) {
      return ScopedError.reject(`zig build errors\n${stderr}`);
    }
    const stepsIdx = stdout.indexOf("Steps:");
    const genOpIdx = stdout.indexOf("General Options:", stepsIdx);
    const stepsStr = stdout.substring(stepsIdx, genOpIdx);
    return Array.from(
      stepsStr.matchAll(stepsRegEx),
      ([_, name, dflt, desc]: RegExpMatchArray): ZigBldStep => ({
        name: name,
        desc: desc,
        group: StepGroup.fromDesc(desc),
        default: strings.isNotBlank(dflt),
      })
    );
  }
  catch (err) {
    if (process.isExecException(err)) {
      const detail_msg = strings.concatNotBlank(plat.eol, [
        err.cmd                                      ? `  cmd   : ${err.cmd}`    : undefined,
        err.code                                     ? `  code  : ${err.code}`   : undefined,
        err.signal                                   ? `  signal: ${err.signal}` : undefined,
        types.hasPropOf(err,'stderr',types.isString) ? `  errors: ${err.stderr}` : undefined,
      ]);
      return ScopedError.reject(
        `zig build: finished with error(s)`,
        detail_msg,
        undefined,
        undefined,
        err.stack);
    }
    else {
      return ScopedError.reject(`zig build: finished with error(s)`, err);
    }

  }
}

export async function rawPickBuildStep(bldSteps: Promise<ZigBldStep[]>): Promise<string | undefined> {
  type StepPickItem = { step: ZigBldStep } & vsc.QuickPickItem;
  const stepItems = bldSteps.then(steps => {
    return steps
      .sort((a, b) => a.group - b.group)
      .map<StepPickItem>(s => ({
        step: s,
        label: `${StepGroup.toIcon(s.group)} ${s.name}`,
        description: s.desc,
      }));
  });
  const picked = await vsc.window.showQuickPick(
    stepItems,
    {
      placeHolder: "Select the zig target to run",
      canPickMany: false,
      matchOnDescription: true,
    },
  );
  return picked?.step.name;
}
