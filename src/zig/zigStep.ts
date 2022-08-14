'use strict';
import * as os from 'os';
import * as vsc from 'vscode';
import * as cp from '../utils/cp';
import * as fs from '../utils/fs';
import { ScopedError } from '../utils/logging';
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
      case StepGroup.none: return "";
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
    return Promise.reject(
      ScopedError.make("Aborting build target fetch. No build.zig file found in workspace root.")
    );
  }

  try {
    const { stdout, stderr } = await cp.execFile(
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

    if (!strings.isWhiteSpace(stderr)) {
      return Promise.reject(
        ScopedError.make(`zig build errors\n${stderr}`)
      );
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
        default: !!dflt,
      })
    );
  }
  catch (e) {
    if (cp.isExecException(e)) {
      const cmd    = e.cmd    ? `  cmd   : ${e.cmd}`   : undefined;
      const code   = e.code   ? `  code  : ${e.code}`  : undefined;
      const signal = e.signal ? `  signal: ${e.signal}`: undefined;
      const stderr = types.isObject(e) && 'stderr' in e && types.isString(e['stderr'])
        ? `  errors: ${e['stderr']}`
        : undefined;
      const detail_msg = strings.filterJoin(os.EOL, [
        cmd,
        code,
        signal,
        stderr,
      ]);
      return Promise.reject(
        ScopedError.make(
          `zig build: finished with error(s)`,
          detail_msg,
          undefined,
          undefined,
          e.stack,
        )
      );
    }
    else {
      return Promise.reject(
        ScopedError.make(`zig build: finished with error(s)`, e)
      );
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
