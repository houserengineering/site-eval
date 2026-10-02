// Texture by feel: S.J. Thien (1979), "A flow diagram for teaching texture by feel analysis",
// J. Agronomic Education 8:54–55, as printed in the office copy
// (Office\Tools\Wastewater Tools\SEPTIC\SITE EVALUATION\texture-by-feel.pdf).
// The chart's yes/no chains for ribbon length and feel are folded into one three-way question each.

export type TextureStepId = 'ball' | 'tooDry' | 'tooWet' | 'ribbon' | 'length' | 'feelWeak' | 'feelMedium' | 'feelStrong';

export type TextureAnswer = { value: string; label: string } & ({ next: TextureStepId } | { result: string });

export interface TextureStep {
  /** What to do with the sample before answering (shown above the question). */
  instruction?: string;
  question: string;
  answers: TextureAnswer[];
}

const feel = (gritty: string, smooth: string, neither: string): TextureStep => ({
  instruction: 'Excessively wet a small pinch of soil in your palm and rub it with your forefinger.',
  question: 'How does it feel?',
  answers: [
    { value: 'gritty', label: 'Very gritty', result: gritty },
    { value: 'smooth', label: 'Very smooth', result: smooth },
    { value: 'neither', label: 'Neither predominates', result: neither },
  ],
});

export const TEXTURE_STEPS: Record<TextureStepId, TextureStep> = {
  ball: {
    instruction:
      'Place about 25 g of soil (a heaping tablespoon) in your palm. Add water drop by drop and knead to break down all aggregates, until it is plastic and moldable like moist putty.',
    question: 'Does the soil remain in a ball when squeezed?',
    answers: [
      { value: 'yes', label: 'Yes', next: 'ribbon' },
      { value: 'no', label: 'No', next: 'tooDry' },
    ],
  },
  tooDry: {
    question: 'Is the soil too dry?',
    answers: [
      { value: 'yes', label: 'Yes, add water', next: 'ball' },
      { value: 'no', label: 'No', next: 'tooWet' },
    ],
  },
  tooWet: {
    question: 'Is the soil too wet?',
    answers: [
      { value: 'yes', label: 'Yes, add dry soil', next: 'ball' },
      { value: 'no', label: 'No', result: 'SAND' },
    ],
  },
  ribbon: {
    instruction:
      'Hold the ball between thumb and forefinger and push it upward with your thumb into a ribbon of even thickness and width. Let it extend over your forefinger until it breaks under its own weight.',
    question: 'Does the soil form a ribbon?',
    answers: [
      { value: 'yes', label: 'Yes', next: 'length' },
      { value: 'no', label: 'No', result: 'LOAMY SAND' },
    ],
  },
  length: {
    question: 'How long is the ribbon before it breaks?',
    answers: [
      { value: 'weak', label: 'Weak: under 1 in (2.5 cm)', next: 'feelWeak' },
      { value: 'medium', label: 'Medium: 1–2 in (2.5–5 cm)', next: 'feelMedium' },
      { value: 'strong', label: 'Strong: 2 in (5 cm) or longer', next: 'feelStrong' },
    ],
  },
  feelWeak: feel('SANDY LOAM', 'SILT LOAM', 'LOAM'),
  feelMedium: feel('SANDY CLAY LOAM', 'SILTY CLAY LOAM', 'CLAY LOAM'),
  feelStrong: feel('SANDY CLAY', 'SILTY CLAY', 'CLAY'),
};

export const START: TextureStepId = 'ball';

/** Follow answers (by value) from the start; ends at a texture class or the step awaiting an answer. */
export function walk(answers: string[]): { result: string } | { at: TextureStepId } {
  let at: TextureStepId = START;
  for (const value of answers) {
    const step = TEXTURE_STEPS[at];
    const a = step.answers.find((x) => x.value === value);
    if (!a) throw new Error(`"${value}" is not an answer to: ${step.question}`);
    if ('result' in a) return { result: a.result };
    at = a.next;
  }
  return { at };
}
