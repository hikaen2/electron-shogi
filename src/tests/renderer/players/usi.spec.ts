import api, { API } from "@/renderer/ipc/api";
import { onUSIBestMove, onUSIInfo, USIPlayer } from "@/renderer/players/usi";
import { Record } from "electron-shogi-core";
import { timeLimitSetting } from "@/tests/mock/game";
import { usiEngineSettingWithPonder } from "@/tests/mock/usi";
import { Mocked } from "vitest";

vi.mock("@/renderer/ipc/api");

const mockAPI = api as Mocked<API>;

describe("usi", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("ponderHit", async () => {
    mockAPI.usiLaunch.mockResolvedValueOnce(100);
    mockAPI.usiGo.mockResolvedValueOnce();
    mockAPI.usiGoPonder.mockResolvedValueOnce();
    mockAPI.usiPonderHit.mockResolvedValueOnce();
    const usi1 = "position startpos moves 7g7f 3c3d";
    const usi2 = "position startpos moves 7g7f 3c3d 2g2f";
    const usi3 = "position startpos moves 7g7f 3c3d 2g2f 8c8d";
    const record1 = Record.newByUSI(usi1) as Record;
    const record2 = Record.newByUSI(usi2) as Record;
    const record3 = Record.newByUSI(usi3) as Record;
    const player = new USIPlayer(usiEngineSettingWithPonder, 10);
    try {
      await player.launch();
      const searchHandler = {
        onMove: vi.fn(),
        onResign: vi.fn(),
        onWin: vi.fn(),
        onError: vi.fn(),
      };
      await player.startSearch(record1, timeLimitSetting, 0, 0, searchHandler);
      expect(mockAPI.usiGo).toBeCalledWith(100, usi1, timeLimitSetting, 0, 0);
      onUSIBestMove(100, usi1, "2g2f", "8c8d");
      expect(searchHandler.onMove.mock.calls[0][0].usi).toBe("2g2f");
      await player.startPonder(record2, timeLimitSetting, 0, 0);
      expect(mockAPI.usiGoPonder).toBeCalled();
      onUSIInfo(100, usi3, {
        pv: ["2f2e", "8d8e"],
      });
      await player.startSearch(record3, timeLimitSetting, 0, 0, searchHandler);
      expect(mockAPI.usiPonderHit).toBeCalledWith(100);
      onUSIBestMove(100, usi3, "2f2e");
      expect(searchHandler.onMove.mock.calls[1][0].usi).toBe("2f2e");
      expect(searchHandler.onMove.mock.calls[1][1].pv[0].usi).toBe("8d8e");
    } finally {
      await player.close();
    }
  });

  it("illegalPonderMove", async () => {
    mockAPI.usiLaunch.mockResolvedValueOnce(100);
    mockAPI.usiGo.mockResolvedValueOnce();
    mockAPI.usiGoPonder.mockResolvedValueOnce();
    const usi1 = "position startpos moves 7g7f 3c3d";
    const usi2 = "position startpos moves 7g7f 3c3d 2g2f";
    const record1 = Record.newByUSI(usi1) as Record;
    const record2 = Record.newByUSI(usi2) as Record;
    const player = new USIPlayer(usiEngineSettingWithPonder, 10);
    try {
      await player.launch();
      const searchHandler = {
        onMove: vi.fn(),
        onResign: vi.fn(),
        onWin: vi.fn(),
        onError: vi.fn(),
      };
      await player.startSearch(record1, timeLimitSetting, 0, 0, searchHandler);
      expect(mockAPI.usiGo).toBeCalledWith(100, usi1, timeLimitSetting, 0, 0);
      onUSIBestMove(100, usi1, "2g2f", "4a3a");
      expect(searchHandler.onMove.mock.calls[0][0].usi).toBe("2g2f");
      await player.startPonder(record2, timeLimitSetting, 0, 0);
      expect(mockAPI.usiGoPonder).not.toBeCalled();
    } finally {
      await player.close();
    }
  });
});
