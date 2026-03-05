import { Question, Variant } from "@/types";

/**
 * Q1 - readiness/time commitment.
 * Used by Variant C as the landing question.
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
 * Follow-up for people who chose "positioned" - what kind of position?
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
 * Q2 - intent. Used by Variant C after Q1.
 */
export const questionTwo: Question = {
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
 * A and B have no questions (profile step and browse, respectively).
 * C has the full guided flow.
 */
export function getQuestionsForVariant(variant: Variant): Question[] {
  switch (variant) {
    case "A":
      return [];
    case "B":
      return [];
    case "C":
      return [questionOne, questionTwo];
  }
}
