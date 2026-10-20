import { r1Flags } from "@fitness-ai-app/config";

/**
 * Gym partners and creators/influencers are hidden for now (owner, 20 Oct
 * 2026: "as of now hide all gym, influencer modules, we later introduce
 * them"). While this is false the app shows no My Gym, gym card, gym
 * checklist step or gym/creator invite note, and doesn't link a gym code at
 * sign-up. Screens and API stay in place; see packages/config r1Flags.
 */
export const PARTNER_PROGRAMS_ENABLED: boolean = r1Flags.PARTNER_PROGRAMS_ENABLED;
