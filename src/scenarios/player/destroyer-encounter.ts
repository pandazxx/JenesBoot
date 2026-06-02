import { definePlayerScenario } from "../types.js";
import { VesselType, DepthBand, NauticalSpeed } from "../../sim/combat/enums.js";

export default definePlayerScenario({
  id: "destroyer-encounter",
  title: "Destroyer Encounter",
  description:
    "A destroyer at long range, already turning toward you. Dive and run silent, or surface and fight — the choice is yours.",
  seed: 2,
  scenario: VesselType.DESTROYER,
  initial: {
    playerDepth: DepthBand.PERISCOPE,
    playerNauticalSpeed: NauticalSpeed.HALF_AHEAD,
    playerHorizontalIntent: 0,
    enemyX: 750,
    enemyHorizontalIntent: -1,
  },
});
