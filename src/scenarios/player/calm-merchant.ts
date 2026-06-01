import { definePlayerScenario } from "../types.js";
import { DepthBand, SpeedSetting, SpeedDirection } from "../../sim/combat/types.js";

export default definePlayerScenario({
  id: "calm-merchant",
  title: "Calm Merchant",
  description:
    "A calm morning. A lone merchant on the horizon. Assign your gunner and sink it before it flees.",
  seed: 1,
  scenario: "surface_battle",
  initial: {
    playerDepth: DepthBand.SURFACE,
    playerSpeed: SpeedSetting.AHEAD_FULL,
    playerDirection: SpeedDirection.HOLD,
    enemyX: 450,
  },
});
