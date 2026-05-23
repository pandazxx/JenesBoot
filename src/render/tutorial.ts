/**
 * Tutorial step logic — pure TypeScript, no PixiJS, no DOM.
 *
 * Stubbed for the new combat API. The old tutorial was tightly coupled to
 * old CombatState fields (rooms, crew, scenario). This version provides a
 * no-op stub that always returns step 0 until tutorial logic is redesigned.
 */

export type TutorialStep = 0;

export const TUTORIAL_TEXT: Record<TutorialStep, string> = {
  0: "",
};
