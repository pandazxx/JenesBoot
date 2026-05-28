import { definePlayerScenario } from "../types.js";
import { DepthBand, SpeedSetting, SpeedDirection } from "../../sim/combat/types.js";

export default definePlayerScenario({
  id: "destroyer-encounter",
  title: "Destroyer Encounter",
  description:
    "A destroyer at long range, already turning toward you. Dive and run silent, or surface and fight — the choice is yours.",
  seed: 2,
  scenario: "destroyer_dive",
  initial: {
    playerDepth: DepthBand.PERISCOPE,
    playerSpeed: SpeedSetting.STANDARD,
    playerDirection: SpeedDirection.HOLD,
    enemyX: 750,
    enemyDirection: SpeedDirection.CLOSE,
  },
});
