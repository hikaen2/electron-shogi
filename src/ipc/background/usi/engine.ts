import {
  getUSIEngineOptionCurrentValue,
  USIEngineOption,
  USIEngineOptions,
  USIEngineOptionType,
  USIHash,
  USIPonder,
} from "@/settings/usi";
import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import path from "path";
import { createInterface as readline, Interface as Readline } from "readline";
import { InfoCommand } from "@/store/usi";
import { getUSILogger } from "@/ipc/background/log";

export type EngineProcessOption = {
  setupOnly?: boolean;
  engineOptions?: USIEngineOption[];
};

export type TimeState = {
  btime: number;
  wtime: number;
  byoyomi: number;
  binc: number;
  winc: number;
};

export enum GameResult {
  WIN = "win",
  LOSE = "lose",
  DRAW = "draw",
}

function parseScoreMate(arg: string): number {
  switch (arg) {
    case "+":
      return +1;
    case "-":
      return -1;
    default:
      return Number(arg);
  }
}

function parseInfoCommand(args: string): InfoCommand {
  const result: InfoCommand = {};
  const s = args.split(" ");
  for (let i = 0; i < args.length; i += 1) {
    switch (s[i]) {
      case "depth":
        result.depth = Number(s[i + 1]);
        i += 1;
        break;
      case "seldepth":
        result.seldepth = Number(s[i + 1]);
        i += 1;
        break;
      case "time":
        result.timeMs = Number(s[i + 1]);
        i += 1;
        break;
      case "nodes":
        result.nodes = Number(s[i + 1]);
        i += 1;
        break;
      case "pv":
        result.pv = s.slice(i + 1);
        i = s.length;
        break;
      case "multipv":
        result.multipv = Number(s[i + 1]);
        i += 1;
        break;
      case "score":
        switch (s[i + 1]) {
          case "cp":
            result.scoreCP = Number(s[i + 2]);
            i += 2;
            break;
          case "mate":
            result.scoreMate = parseScoreMate(s[i + 2]);
            i += 2;
            break;
        }
        break;
      case "lowerbound":
        result.lowerbound = true;
        break;
      case "upperbound":
        result.upperbound = true;
        break;
      case "currmove":
        result.currmove = s[i + 1];
        i += 1;
        break;
      case "hashfull":
        result.hashfullPerMill = Number(s[i + 1]);
        i += 1;
        break;
      case "nps":
        result.nps = Number(s[i + 1]);
        i += 1;
        break;
      case "string":
        result.string = s.slice(i + 1).join(" ");
        i = s.length;
        break;
    }
  }
  return result;
}

type USIOKCallback = () => void;
type ReadyCallback = () => void;
type BestmoveCallback = (
  position: string,
  sfen: string,
  ponder?: string
) => void;
type InfoCallback = (position: string, info: InfoCommand) => void;

type ReservedGoCommand = {
  position: string;
  timeState?: TimeState;
  ponder: boolean;
};

function buildTimeOptions(timeState?: TimeState): string {
  if (!timeState) {
    return "infinite";
  }
  return (
    `btime ${timeState.btime} wtime ${timeState.wtime} ` +
    (timeState.binc !== 0 || timeState.winc !== 0
      ? `binc ${timeState.binc} winc ${timeState.winc}`
      : `byoyomi ${timeState.byoyomi}`)
  );
}

enum State {
  WaitingForReadyOK,
  Ready,
  WaitingForBestMove,
  Ponder,
  WaitingForPonderBestMove,
}

export class EngineProcess {
  private _path: string;
  private option: EngineProcessOption;
  private handle: ChildProcessWithoutNullStreams | null;
  private _name: string;
  private _author: string;
  private _options: USIEngineOptions;
  private state: State;
  private currentPosition: string;
  private reservedGoCommand?: ReservedGoCommand;
  private readline: Readline | null;
  private sessionID: number;
  usiOkCallback?: USIOKCallback;
  readyCallback?: ReadyCallback;
  bestMoveCallback?: BestmoveCallback;
  infoCallback?: InfoCallback;
  ponderInfoCallback?: InfoCallback;

  constructor(path: string, sessionID: number, option: EngineProcessOption) {
    this._path = path;
    this.option = option;
    this.handle = null;
    this._name = "NO NAME";
    this._author = "";
    this._options = {};
    this.state = State.WaitingForReadyOK;
    this.currentPosition = "";
    this.readline = null;
    this.sessionID = sessionID;
  }

  get path(): string {
    return this._path;
  }

  get name(): string {
    return this._name;
  }

  get author(): string {
    return this._author;
  }

  get engineOptions(): USIEngineOptions {
    return this._options;
  }

  on(event: "usiok", callback: USIOKCallback): void;
  on(event: "ready", callback: ReadyCallback): void;
  on(event: "bestmove", callback: BestmoveCallback): void;
  on(event: "info", callback: InfoCallback): void;
  on(event: "ponderInfo", callback: InfoCallback): void;
  on(
    event: string,
    callback: USIOKCallback | ReadyCallback | BestmoveCallback | InfoCallback
  ): void {
    switch (event) {
      case "usiok":
        this.usiOkCallback = callback as USIOKCallback;
        break;
      case "ready":
        this.readyCallback = callback as ReadyCallback;
        break;
      case "bestmove":
        this.bestMoveCallback = callback as BestmoveCallback;
        break;
      case "info":
        this.infoCallback = callback as InfoCallback;
        break;
      case "ponderInfo":
        this.ponderInfoCallback = callback as InfoCallback;
        break;
    }
  }

  launch(): void {
    getUSILogger().info(
      "sid=%d: launch: %s",
      this.sessionID,
      path.dirname(this.path)
    );
    this.handle = spawn(this.path, {
      cwd: path.dirname(this.path),
    });
    this.readline = readline(this.handle.stdout);
    this.readline.on("line", this.onReceive.bind(this));
    this.send("usi");
  }

  quit(): void {
    getUSILogger().info("sid=%d: quit USI engine", this.sessionID);
    if (!this.handle) {
      return;
    }
    const t = setTimeout(() => {
      if (!this.handle) {
        return;
      }
      this.handle.kill();
      this.handle = null;
    }, 5 * 1e3);
    this.handle.on("close", () => {
      clearTimeout(t);
      this.handle = null;
    });
    this.send("quit");
    if (this.readline) {
      this.readline.close();
    }
  }

  setOption(name: string, value?: string | number): void {
    if (value !== undefined) {
      this.send(`setoption name ${name} value ${value}`);
    } else {
      this.send(`setoption name ${name}`);
    }
  }

  go(position: string, timeState?: TimeState): void {
    if (
      position === this.currentPosition &&
      this.state === State.WaitingForBestMove
    ) {
      return;
    }
    this.reservedGoCommand = {
      position,
      timeState,
      ponder: false,
    };
    switch (this.state) {
      case State.Ready:
        this.sendReservedGoCommands();
        break;
      case State.WaitingForBestMove:
      case State.Ponder:
        this.stop();
        break;
    }
  }

  goPonder(position: string, timeState?: TimeState): void {
    if (position === this.currentPosition && this.state === State.Ponder) {
      return;
    }
    this.reservedGoCommand = {
      position,
      timeState,
      ponder: true,
    };
    switch (this.state) {
      case State.Ready:
        this.sendReservedGoCommands();
        break;
      case State.WaitingForBestMove:
      case State.Ponder:
        this.stop();
        break;
    }
  }

  ponderHit(): void {
    this.send("ponderhit");
    this.state = State.WaitingForBestMove;
  }

  stop(): void {
    this.send("stop");
    if (this.state === State.Ponder) {
      this.state = State.WaitingForPonderBestMove;
    }
  }

  gameover(gameResult: GameResult): void {
    this.send("gameover " + gameResult);
    this.state = State.Ready;
  }

  private sendReservedGoCommands(): void {
    if (!this.reservedGoCommand) {
      return;
    }
    this.send(this.reservedGoCommand.position);
    this.send(
      "go " +
        (this.reservedGoCommand.ponder ? "ponder " : "") +
        buildTimeOptions(this.reservedGoCommand.timeState)
    );
    this.currentPosition = this.reservedGoCommand.position;
    this.state = this.reservedGoCommand.ponder
      ? State.Ponder
      : State.WaitingForBestMove;
    this.reservedGoCommand = undefined;
  }

  private send(command: string): void {
    if (!this.handle) {
      return;
    }
    this.handle.stdin.write(`${command}\n`);
    getUSILogger().info("sid=%d: > %s", this.sessionID, command);
  }

  private onReceive(command: string): void {
    getUSILogger().info("sid=%d: < %s", this.sessionID, command);
    if (command.startsWith("id name ")) {
      this.onIDName(command.substring(8));
    } else if (command.startsWith("id author ")) {
      this.onIDAuthor(command.substring(10));
    } else if (command.startsWith("option ")) {
      this.onOption(command.substring(7));
    } else if (command === "usiok") {
      this.onUSIOk();
    } else if (command === "readyok") {
      this.onReadyOk();
    } else if (command.startsWith("bestmove ")) {
      this.onBestMove(command.substring(9));
    } else if (command.startsWith("info ")) {
      this.onInfo(command.substring(5));
    }
  }

  private onIDName(name: string): void {
    this._name = name;
  }

  private onIDAuthor(author: string): void {
    this._author = author;
  }

  private onOption(command: string): void {
    const args = command.split(" ");
    if (args.length < 4 || args[0] !== "name" || args[2] !== "type") {
      getUSILogger().error("sid=%d: invalid option command", this.sessionID);
      return;
    }
    const option: USIEngineOption = {
      name: args[1],
      type: args[3] as USIEngineOptionType,
      vars: [],
    };
    for (let i = 4; i + 1 < args.length; i = i + 1) {
      switch (args[i]) {
        case "default":
          option.default =
            option.type === "spin" ? Number(args[i + 1]) : args[i + 1];
          break;
        case "min":
          option.min = Number(args[i + 1]);
          break;
        case "max":
          option.max = Number(args[i + 1]);
          break;
        case "var":
          option.vars.push(args[i + 1]);
          break;
      }
    }
    this._options[option.name] = option;
  }

  private onUSIOk(): void {
    if (!this.engineOptions[USIHash]) {
      this.engineOptions[USIHash] = {
        name: USIHash,
        type: "spin",
        default: 32,
        vars: [],
      };
    }
    if (!this.engineOptions[USIPonder]) {
      this.engineOptions[USIPonder] = {
        name: USIPonder,
        type: "check",
        default: "true",
        vars: [],
      };
    }
    if (this.option.engineOptions) {
      this.option.engineOptions.forEach((option) => {
        const value = getUSIEngineOptionCurrentValue(option);
        if (value !== undefined) {
          this.setOption(option.name, value);
        }
      });
    }
    if (!this.option.setupOnly) {
      this.send("isready");
    }
    if (this.usiOkCallback) {
      this.usiOkCallback();
    }
  }

  private onReadyOk(): void {
    this.state = State.Ready;
    if (this.readyCallback) {
      this.readyCallback();
    }
    this.send("usinewgame");
    this.sendReservedGoCommands();
  }

  private onBestMove(args: string): void {
    if (this.bestMoveCallback && this.state === State.WaitingForBestMove) {
      const a = args.split(" ");
      const move = a[0];
      const ponder = (a.length >= 3 && a[1] === "ponder" && a[2]) || undefined;
      this.bestMoveCallback(this.currentPosition, move, ponder);
    }
    this.state = State.Ready;
    this.currentPosition = "";
    this.sendReservedGoCommands();
  }

  private onInfo(args: string): void {
    switch (this.state) {
      case State.WaitingForBestMove:
        if (this.infoCallback) {
          this.infoCallback(this.currentPosition, parseInfoCommand(args));
        }
        break;
      case State.Ponder:
      case State.WaitingForPonderBestMove:
        if (this.ponderInfoCallback) {
          this.ponderInfoCallback(this.currentPosition, parseInfoCommand(args));
        }
        break;
    }
  }
}
