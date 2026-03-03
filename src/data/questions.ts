import { Question, Variant } from "@/types";

/**
 * Q1 is shared across all variants.
 * Reframed to focus on readiness level rather than time.
 * The "positioned" option triggers a follow-up question.
 */
export const questionOne: Question = {
  id: "readiness",
  question: "How much can you give to this?",
  options: [
    {
      id: "minutes",
      label: "A few minutes",
    },
    {
      id: "hours",
      label: "A few hours this month",
    },
    {
      id: "significant",
      label: "A significant part of my life",
    },
    {
      id: "positioned",
      label: "I'm in a unique position to help",
    },
  ],
};

/**
 * Follow-up for people who chose "positioned" — what kind of position?
 */
export const questionPositioned: Question = {
  id: "position_type",
  question: "What kind of position are you in?",
  options: [
    {
      id: "ai_tech",
      label: "I work in AI or tech",
    },
    {
      id: "policy_gov",
      label: "I work in policy or government",
    },
    {
      id: "audience_platform",
      label: "I have an audience or platform",
    },
    {
      id: "donor",
      label: "I can fund this work",
    },
    {
      id: "other",
      label: "Something else",
    },
  ],
};

/**
 * Variants B and D: intent-based Q2
 * Variant B also shows an optional profile link step after this.
 */
export const questionTwoD: Question = {
  id: "intent",
  question: "What would help you most right now?",
  options: [
    {
      id: "understand",
      label: "Understand the problem",
    },
    {
      id: "connect",
      label: "Find others who care about this",
    },
    {
      id: "impact",
      label: "Take action on something concrete",
    },
    {
      id: "do_part",
      label: "Just point me somewhere good",
    },
  ],
};

/**
 * Get the question sequence for a given variant.
 */
export function getQuestionsForVariant(variant: Variant): Question[] {
  switch (variant) {
    case "A":
      return [questionOne];
    case "B":
      return [questionOne, questionTwoD];
    case "D":
      return [questionOne, questionTwoD];
  }
}
