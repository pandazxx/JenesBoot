import { definePlayerScenario } from "../types.js";
import { VesselType, DepthBand, NauticalSpeed } from "../../sim/combat/enums.js";

export default definePlayerScenario({
  id: "calm-merchant",
  title: "Calm Merchant",
  description:
    "A calm morning. A lone merchant on the horizon. Close at full speed and sink it before it flees.",
  seed: 1,
  scenario: VesselType.MERCHANT,
  initial: {
    playerDepth: DepthBand.SURFACE,
    playerNauticalSpeed: NauticalSpeed.FULL_AHEAD,
    playerHorizontalIntent: 1,
    enemyX: 450,
  },
});
