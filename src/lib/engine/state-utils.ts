/**
 * State mutation utilities — apply ChangeSpec / simulation inputs to a
 * ScheduleState COPY. Never mutates the original (used by validator,
 * cascade analyzer, simulator and the apply-approval flow).
 */
import { ChangeSpec, EngineActivity, ScheduleState, SimulationChangeInput } from './types';
import { dayOfWeek } from './util';

export function cloneActivities(activities: EngineActivity[]): EngineActivity[] {
  return activities.map((a) => ({ ...a }));
}

/** Build a new ScheduleState with the given changes applied (deep-ish copy of activities). */
export function applyChangesToState(
  state: ScheduleState,
  changes: Array<ChangeSpec | SimulationChangeInput>
): ScheduleState {
  const activities = cloneActivities(state.activities);
  const roomById = new Map(state.rooms.map((r) => [r.id, r]));
  const roomByCode = new Map(state.rooms.map((r) => [r.code, r]));
  const facultyById = new Map(state.faculty.map((f) => [f.id, f]));
  const facultyByCode = new Map(state.faculty.map((f) => [f.code, f]));
  const actById = new Map(activities.map((a) => [a.id, a]));

  for (const ch of changes) {
    const act = actById.get(ch.activityId);
    if (!act) continue;
    switch (ch.field) {
      case 'roomId': {
        const room = roomById.get(String(ch.to ?? ch.value)) ?? roomByCode.get(String(ch.to ?? ch.value));
        if (room) {
          act.roomId = room.id;
          act.roomCode = room.code;
          act.blockId = room.blockId;
          act.blockCode = room.blockCode;
        }
        break;
      }
      case 'facultyId': {
        const fac = facultyById.get(String(ch.to ?? ch.value)) ?? facultyByCode.get(String(ch.to ?? ch.value));
        if (fac) {
          act.facultyId = fac.id;
          act.facultyName = fac.name;
        }
        break;
      }
      case 'date': {
        const d = String(ch.to ?? ch.value);
        act.date = d;
        act.dayOfWeek = dayOfWeek(d);
        break;
      }
      case 'startMin': {
        const v = Number(ch.to ?? ch.value);
        const dur = act.endMin - act.startMin;
        act.startMin = v;
        act.endMin = v + dur;
        break;
      }
      case 'endMin': {
        const v = Number(ch.to ?? ch.value);
        act.endMin = v;
        break;
      }
      default:
        break;
    }
  }

  return { ...state, activities };
}
