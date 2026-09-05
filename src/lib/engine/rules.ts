/**
 * Default LPU scheduling rules — configurable policy layer.
 * Persisted in DB (SchedulingRules.config) and editable by Admins
 * through the Settings UI. The engine accepts any valid config.
 */
import { SchedulingRuleConfig } from './types';

export const DEFAULT_RULES: SchedulingRuleConfig = {
  // LPU teaching window 08:00 – 19:00, Mon–Sat (Sundays reserved for events only)
  dayStartMin: 8 * 60,
  dayEndMin: 19 * 60,
  allowedDays: [1, 2, 3, 4, 5, 6],
  standardSlots: [
    { startMin: 8 * 60, endMin: 9 * 60 },
    { startMin: 9 * 60, endMin: 10 * 60 },
    { startMin: 10 * 60, endMin: 11 * 60 },
    { startMin: 11 * 60, endMin: 12 * 60 },
    { startMin: 12 * 60 + 30, endMin: 13 * 60 + 30 },
    { startMin: 13 * 60 + 30, endMin: 14 * 60 + 30 },
    { startMin: 14 * 60 + 30, endMin: 15 * 60 + 30 },
    { startMin: 15 * 60 + 30, endMin: 16 * 60 + 30 },
    { startMin: 16 * 60 + 30, endMin: 17 * 60 + 30 },
    { startMin: 17 * 60 + 30, endMin: 18 * 60 + 30 },
  ],

  // Capacity
  capacityStrict: true,
  capacityTolerancePct: 70,

  // Faculty workload policy
  defaultMaxFacultyWeeklyHours: 20,
  minBreakBetweenClasses: 15,
  maxConsecutiveClasses: 3,

  // Student welfare
  maxDailyGapHours: 3,
  earlyClassStartMin: 9 * 60,
  lateClassEndMin: 18 * 60 + 30,

  // Room efficiency
  roomUtilizationThresholdPct: 1,
  largeRoomCapacity: 120,
  largeRoomMinFillPct: 50,

  // Movement between academic blocks
  maxBlockMovesPerDay: 3,

  // Examinations
  minGapBetweenExamsMin: 30,
  examVenueStrict: true,
};

export function mergeRules(override: Partial<SchedulingRuleConfig> | null | undefined): SchedulingRuleConfig {
  if (!override) return { ...DEFAULT_RULES };
  return { ...DEFAULT_RULES, ...override };
}
