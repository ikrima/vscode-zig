'use strict';
import * as vscode from 'vscode';
import { cp, fs, strings } from '../utils/common';
import { zig_cfg, zig_logger } from "../zigExt";


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
  const zig = zig_cfg.zig;
  if (!await fs.fileExists(zig.buildFile)) {
    zig_logger.error("Aborting build target fetch. No build.zig file found in workspace root.");
    return Promise.reject();
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
        shell: vscode.env.shell,
      }
    );

    if (!strings.isWhiteSpace(stderr)) {
      zig_logger.error(`zig build errors\n${stderr}`);
      return Promise.reject();
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
    zig_logger.error('zig build errors', e);
    return Promise.reject();
  }
}

export async function rawPickBuildStep(bldSteps: Promise<ZigBldStep[]>): Promise<string | undefined> {
  type StepPickItem = { step: ZigBldStep } & vscode.QuickPickItem;
  const stepItems = bldSteps.then(steps => {
    return steps
      .sort((a, b) => a.group - b.group)
      .map<StepPickItem>(s => ({
        step: s,
        label: `${StepGroup.toIcon(s.group)} ${s.name}`,
        description: s.desc,
      }));
  });
  const picked = await vscode.window.showQuickPick(
    stepItems,
    {
      placeHolder: "Select the zig target to run",
      canPickMany: false,
      matchOnDescription: true,
    },
  );
  return picked?.step.name;
}
