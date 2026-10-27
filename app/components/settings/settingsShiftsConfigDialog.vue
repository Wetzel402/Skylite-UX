<script setup lang="ts">
import type { DateValue } from "@internationalized/date";

import { getLocalTimeZone, parseDate } from "@internationalized/date";
import { isBefore } from "date-fns";

import type { Integration } from "~/types/database";

import { generateUniqueName, useShiftsData } from "~/composables/useIntegrations";
import { getDefaultDateToday } from "~/composables/useRecurrence";
import { useSyncManager } from "~/composables/useSyncManager";
import { useTimePicker } from "~/composables/useTimePicker";

const props = defineProps<{
  integration: Integration | null;
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

const { isWideLandscape, dialogPanelClass, dialogBarClass } = useAppLayout();
const panelClass = computed(() => dialogPanelClass("w-[min(42rem,calc(100vw-1rem))]"));

const { convert12To24, convert24To12, isSameTime } = useTimePicker();

type ShiftTemplateSlot = {
  dayIndex: number;
  startTime: string;
  endTime: string;
  label?: string | null;
  color?: string | null;
};

type ShiftTemplate = {
  id: string;
  label: string;
  description?: string;
};

const SHIFT_TEMPLATES: ShiftTemplate[] = [
  { id: "2-2-2", label: "2-2-2", description: "3 shift types, 2 days each, then 2 days off; defaults Early 5-1, Late 12-8, Nights 7-5" },
  { id: "4-on-3-off", label: "4 on 3 off", description: "4 working days then 3 off" },
  { id: "continental-2-2-3", label: "Continental 2-2-3", description: "3 shift types, #On/#Off; Day 9-5, Night 7-5, Midday 11-3, Off" },
  { id: "days-nights-off", label: "Days/Nights/Off", description: "2 shift types, #On/#Off. Edit counts for 4on/4off, 2-2-4, 4D/4N/4Off, 7D/7N/7Off, etc." },
  { id: "dupont", label: "DuPont", description: "4-week, 2 shift types (Days/Nights)" },
  { id: "nights-only", label: "Nights only", description: "#Nights, #Off; 4 Nights, 4 Off" },
  { id: "on-off", label: "On/Off", description: "1 shift type, #On/#Off. Edit counts for 2on/2off, 7on/7off, 14on/14off, etc." },
  { id: "custom", label: "Custom", description: "Build your own pattern" },
];

const DEFAULT_ROTATION_COLOR = "#06b6d4";

type ShiftIntervalPreset = {
  value: string;
  label: string;
  startTime: string | null;
  endTime: string | null;
  defaultColor?: string;
};

const SHIFT_INTERVAL_PRESETS: ShiftIntervalPreset[] = [
  { value: "early", label: "Early (5-1)", startTime: "05:00", endTime: "13:00", defaultColor: "#D4A017" },
  { value: "am", label: "AM (6-2)", startTime: "06:00", endTime: "14:00", defaultColor: "#DDAC24" },
  { value: "day-12hr", label: "Day (7-7)", startTime: "07:00", endTime: "19:00", defaultColor: "#A8A8A8" },
  { value: "long-day", label: "Long Day (7-9)", startTime: "07:00", endTime: "21:00", defaultColor: "#E4A8F2" },
  { value: "morning", label: "Morning (8-1)", startTime: "08:00", endTime: "13:00", defaultColor: "#C9A227" },
  { value: "day-9-17", label: "Days (9-5)", startTime: "09:00", endTime: "17:00", defaultColor: "#FDF2D0" },
  { value: "midday", label: "Midday (11-3)", startTime: "11:00", endTime: "15:00", defaultColor: "#B9E3F5" },
  { value: "late", label: "Late (12-8)", startTime: "12:00", endTime: "20:00", defaultColor: "#98F5AA" },
  { value: "evening", label: "Evening (1-5)", startTime: "13:00", endTime: "17:00", defaultColor: "#E57E3B" },
  { value: "swing", label: "Swing (2-10)", startTime: "14:00", endTime: "22:00", defaultColor: "#7AE892" },
  { value: "nights-7-5", label: "Nights (7-5)", startTime: "19:00", endTime: "05:00", defaultColor: "#7F8FF7" },
  { value: "night", label: "Night (7-7)", startTime: "19:00", endTime: "07:00", defaultColor: "#8B9AF8" },
  { value: "graveyard", label: "Graveyard (11-7)", startTime: "23:00", endTime: "07:00", defaultColor: "#6B7BED" },
  { value: "no-shift", label: "No shift", startTime: null, endTime: null, defaultColor: "#F5F5F5" },
  { value: "custom", label: "Custom", startTime: null, endTime: null },
];

type PatternSegment = {
  label: string;
  count: number;
  preset: string;
  color?: string | null;
};

const SEGMENT_DEFAULTS: Record<string, PatternSegment[]> = {
  "4-on-3-off": [
    { label: "Shift 1", count: 4, preset: "day-12hr" },
    { label: "OFF", count: 3, preset: "no-shift" },
  ],
  "2-2-2": [
    { label: "Shift 1", count: 2, preset: "early" },
    { label: "Shift 2", count: 2, preset: "late" },
    { label: "Shift 3", count: 2, preset: "nights-7-5" },
    { label: "OFF", count: 2, preset: "no-shift" },
  ],
  "on-off": [
    { label: "Shift 1", count: 4, preset: "day-12hr" },
    { label: "OFF", count: 4, preset: "no-shift" },
  ],
  "days-nights-off": [
    { label: "Shift 1", count: 4, preset: "day-9-17" },
    { label: "OFF", count: 4, preset: "no-shift" },
    { label: "Shift 2", count: 4, preset: "nights-7-5" },
    { label: "OFF", count: 4, preset: "no-shift" },
  ],
  "nights-only": [
    { label: "Shift 1", count: 4, preset: "nights-7-5" },
    { label: "OFF", count: 4, preset: "no-shift" },
  ],
  "continental-2-2-3": [
    { label: "Shift 1", count: 2, preset: "day-9-17" },
    { label: "OFF", count: 2, preset: "no-shift" },
    { label: "Shift 2", count: 2, preset: "nights-7-5" },
    { label: "Shift 3", count: 1, preset: "midday" },
  ],
  "dupont": [
    { label: "Nights", count: 4, preset: "nights-7-5" },
    { label: "OFF", count: 3, preset: "no-shift" },
    { label: "Days", count: 3, preset: "day-9-17" },
    { label: "OFF", count: 1, preset: "no-shift" },
    { label: "Nights", count: 3, preset: "nights-7-5" },
    { label: "OFF", count: 3, preset: "no-shift" },
    { label: "Days", count: 4, preset: "day-9-17" },
    { label: "OFF", count: 7, preset: "no-shift" },
  ],
  "custom": [
    { label: "Shift 1", count: 1, preset: "day-9-17" },
  ],
};

const customSegmentTimes = ref<Record<number, {
  startHour: number;
  startMinute: number;
  startAmPm: string;
  endHour: number;
  endMinute: number;
  endAmPm: string;
}>>({});

const hourOptions = computed(() => {
  const options = [];
  for (let hour = 1; hour <= 12; hour++) {
    options.push({ value: hour, label: hour.toString() });
  }
  return options;
});

const minuteOptions = computed(() => {
  const options = [];
  for (let minute = 0; minute < 60; minute += 5) {
    options.push({ value: minute, label: minute.toString().padStart(2, "0") });
  }
  return options;
});

const amPmOptions = [
  { value: "AM", label: "AM" },
  { value: "PM", label: "PM" },
];

function getPresetTimes(presetValue: string, segmentIndex?: number): { startTime: string; endTime: string } | null {
  if (presetValue === "custom" && segmentIndex !== undefined) {
    const customTimes = customSegmentTimes.value[segmentIndex];
    if (!customTimes)
      return null;
    const startHour24 = convert12To24(customTimes.startHour, customTimes.startAmPm);
    const endHour24 = convert12To24(customTimes.endHour, customTimes.endAmPm);
    const startTime = `${startHour24.toString().padStart(2, "0")}:${customTimes.startMinute.toString().padStart(2, "0")}`;
    const endTime = `${endHour24.toString().padStart(2, "0")}:${customTimes.endMinute.toString().padStart(2, "0")}`;
    return { startTime, endTime };
  }
  const preset = SHIFT_INTERVAL_PRESETS.find(p => p.value === presetValue);
  if (!preset?.startTime || !preset.endTime)
    return null;
  return { startTime: preset.startTime, endTime: preset.endTime };
}

const { triggerImmediateSync } = useSyncManager();

const integrationOwnerUserId = computed(() => {
  const user = props.integration?.settings as { user?: string[] } | undefined;
  return user?.user?.[0];
});

const templateSelectItems = computed(() =>
  SHIFT_TEMPLATES.map(t => ({ label: t.label, value: t.id })),
);

const selectedTemplateId = ref("");

const selectedTemplate = computed(() =>
  SHIFT_TEMPLATES.find(t => t.id === selectedTemplateId.value) ?? null,
);

const editingAssignmentId = ref<string | null>(null);

const showConfiguredList = computed(() =>
  isWideLandscape.value
    ? !editingAssignmentId.value
    : !selectedTemplateId.value || !!editingAssignmentId.value,
);

type EditingSlot = {
  id: string;
  dayIndex: number;
  startTime: string;
  endTime: string;
  label: string | null;
  color: string | null;
  order: number;
};
const editingRotationSlots = ref<EditingSlot[]>([]);

const formStartDate = ref<DateValue>(getDefaultDateToday() as DateValue);
const formEndDate = ref<DateValue | null>(null);

const shiftsData = useShiftsData(props.integration?.id ?? "none", {
  server: false,
  lazy: true,
  immediate: !!props.integration?.id,
});
const {
  data: rotationsData,
  refresh: refreshRotations,
  error: rotationsFetchError,
} = shiftsData.rotations;
const {
  data: assignmentsData,
  refresh: refreshAssignments,
  error: assignmentsFetchError,
} = shiftsData.assignments;

const rotations = computed(() => rotationsData.value ?? []);
const assignments = computed(() => assignmentsData.value ?? []);

watch(
  [() => props.isOpen, () => props.integration?.id],
  ([isOpen, id]) => {
    if (isOpen && id && (rotationsData.value == null || assignmentsData.value == null)) {
      refreshRotations();
      refreshAssignments();
    }
  },
  { immediate: true },
);

const error = ref<string | null>(null);
const displayError = computed(
  () => error.value
    ?? (rotationsFetchError.value ? (rotationsFetchError.value instanceof Error ? rotationsFetchError.value.message : "Failed to load rotations") : null)
    ?? (assignmentsFetchError.value ? (assignmentsFetchError.value instanceof Error ? assignmentsFetchError.value.message : "Failed to load assignments") : null),
);

const newRotationName = ref("");

const editableSegments = ref<PatternSegment[]>([]);

const isSegmentBasedTemplate = computed(() => {
  const id = selectedTemplateId.value;
  return id !== "" && id in SEGMENT_DEFAULTS;
});

const formStartDateValue = computed(() => formStartDate.value as DateValue | null);

const formEndDateValue = computed(() => formEndDate.value as DateValue | null);

const slotPresetSelectItems = computed(() =>
  SHIFT_INTERVAL_PRESETS.filter(p => p.value !== "no-shift").map(p => ({ label: p.label, value: p.value })),
);

function initEditableSegments() {
  const id = selectedTemplateId.value;
  const defaults = SEGMENT_DEFAULTS[id];
  editableSegments.value = defaults
    ? defaults.map(s => ({
        ...s,
        color: s.color ?? SHIFT_INTERVAL_PRESETS.find(p => p.value === s.preset)?.defaultColor ?? null,
      }))
    : [];
  const newCustomTimes: typeof customSegmentTimes.value = {};
  editableSegments.value.forEach((seg, idx) => {
    if (seg.preset === "custom" && !customSegmentTimes.value[idx]) {
      newCustomTimes[idx] = {
        startHour: 9,
        startMinute: 0,
        startAmPm: "AM",
        endHour: 5,
        endMinute: 0,
        endAmPm: "PM",
      };
    }
    else if (customSegmentTimes.value[idx]) {
      newCustomTimes[idx] = customSegmentTimes.value[idx]!;
    }
  });
  customSegmentTimes.value = newCustomTimes;
}

function clampSegmentCount(count: number): number {
  return Math.max(1, Math.min(99, Math.trunc(count)));
}

function formatTime12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const { hour, amPm } = convert24To12(h ?? 0);
  return m ? `${hour}:${String(m).padStart(2, "0")} ${amPm}` : `${hour} ${amPm}`;
}

function formatTimeRange(start: string, end: string): string {
  return `${formatTime12(start)} - ${formatTime12(end)}`;
}

const totalSegmentDays = computed(() =>
  editableSegments.value.reduce((sum, s) => sum + clampSegmentCount(s.count), 0),
);

function onStartDateSelect(value: DateValue | null) {
  if (value)
    formStartDate.value = value;
}

function segmentsToSlots(segments: PatternSegment[]): ShiftTemplateSlot[] {
  const slots: ShiftTemplateSlot[] = [];
  let dayIndex = 0;
  segments.forEach((seg, segmentIndex) => {
    const count = clampSegmentCount(seg.count);
    const times = seg.preset !== "no-shift" ? getPresetTimes(seg.preset, segmentIndex) : null;
    if (times) {
      const preset = SHIFT_INTERVAL_PRESETS.find(p => p.value === seg.preset);
      const slotColor = seg.color ?? preset?.defaultColor ?? DEFAULT_ROTATION_COLOR;
      for (let i = 0; i < count; i++) {
        slots.push({
          dayIndex: dayIndex + i,
          startTime: times.startTime,
          endTime: times.endTime,
          label: preset?.value === "custom" ? formatTimeRange(times.startTime, times.endTime) : preset?.label ?? null,
          color: slotColor,
        });
      }
    }
    dayIndex += count;
  });
  return slots;
}

function updateSegmentCount(index: number, value: number | string) {
  const count = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(count))
    return;
  const next = [...editableSegments.value];
  if (next[index])
    next[index] = { ...next[index]!, count: clampSegmentCount(count) };
  editableSegments.value = next;
}

function updateSegmentColor(index: number, color: string | null) {
  const next = [...editableSegments.value];
  if (next[index])
    next[index] = { ...next[index]!, color: color || null };
  editableSegments.value = next;
}

function updateSegmentPreset(index: number, preset: string) {
  const next = [...editableSegments.value];
  if (next[index]) {
    const presetObj = SHIFT_INTERVAL_PRESETS.find(p => p.value === preset);
    next[index] = {
      ...next[index]!,
      preset,
      color: presetObj?.defaultColor ?? null,
    };
  }
  editableSegments.value = next;
  if (preset === "custom" && !customSegmentTimes.value[index]) {
    customSegmentTimes.value = {
      ...customSegmentTimes.value,
      [index]: {
        startHour: 9,
        startMinute: 0,
        startAmPm: "AM",
        endHour: 5,
        endMinute: 0,
        endAmPm: "PM",
      },
    };
  }
}

function updateCustomSegmentTime(
  index: number,
  field: "startHour" | "startMinute" | "startAmPm" | "endHour" | "endMinute" | "endAmPm",
  value: number | string,
) {
  const current = customSegmentTimes.value[index];
  if (!current)
    return;
  customSegmentTimes.value = {
    ...customSegmentTimes.value,
    [index]: {
      ...current,
      [field]: value,
    },
  };
}

function addShiftSegment() {
  const shiftCount = editableSegments.value.filter(s => s.preset !== "no-shift").length + 1;
  editableSegments.value = [
    ...editableSegments.value,
    { label: `Shift ${shiftCount}`, count: 1, preset: "day-9-17" },
  ];
}

function addOffSegment() {
  editableSegments.value = [
    ...editableSegments.value,
    { label: "OFF", count: 1, preset: "no-shift" },
  ];
}

function removeSegment(index: number) {
  editableSegments.value = editableSegments.value.filter((_, i) => i !== index);
  const newCustomTimes: typeof customSegmentTimes.value = {};
  editableSegments.value.forEach((_, i) => {
    if (customSegmentTimes.value[i] !== undefined) {
      newCustomTimes[i] = customSegmentTimes.value[i]!;
    }
  });
  customSegmentTimes.value = newCustomTimes;
}

function validateSegments(): string | null {
  if (editableSegments.value.length === 0)
    return "Add at least one segment.";
  if (!editableSegments.value.some(s => s.preset !== "no-shift"))
    return "Add at least one shift.";
  for (let i = 0; i < editableSegments.value.length; i++) {
    const s = editableSegments.value[i]!;
    if (!Number.isInteger(s.count) || s.count < 1 || s.count > 99)
      return "Each segment count must be between 1 and 99.";
    if (s.preset === "custom") {
      const customTimes = customSegmentTimes.value[i];
      if (!customTimes)
        return `Custom times are required for segment "${s.label}".`;
      if (isSameTime(
        customTimes.startHour,
        customTimes.startMinute,
        customTimes.startAmPm,
        customTimes.endHour,
        customTimes.endMinute,
        customTimes.endAmPm,
      )) {
        return `Start and end time cannot be the same for segment "${s.label}".`;
      }
    }
  }
  return null;
}

function closeForm() {
  selectedTemplateId.value = "";
  newRotationName.value = "";
  editableSegments.value = [];
  customSegmentTimes.value = {};
  formStartDate.value = getDefaultDateToday();
  formEndDate.value = null;
  editingAssignmentId.value = null;
  editingRotationSlots.value = [];
  error.value = null;
}

watch(selectedTemplateId, () => {
  error.value = null;
  initEditableSegments();
});

function validateShiftForm(): string | null {
  if (!formStartDate.value)
    return "Start date is required.";
  if (formEndDate.value) {
    const startDateOnly = new Date(
      formStartDate.value.year,
      formStartDate.value.month - 1,
      formStartDate.value.day,
    );
    const endDateOnly = new Date(
      formEndDate.value.year,
      formEndDate.value.month - 1,
      formEndDate.value.day,
    );
    if (isBefore(endDateOnly, startDateOnly))
      return "End date cannot be before start date";
  }
  return null;
}

function toUtcMidnightIso(date: { year: number; month: number; day: number }): string {
  return new Date(Date.UTC(date.year, date.month - 1, date.day, 0, 0, 0, 0)).toISOString();
}

async function openEditForm(a: typeof assignments.value[0]) {
  editingAssignmentId.value = a.id;
  selectedTemplateId.value = "";
  newRotationName.value = a.shiftRotation.name;
  formStartDate.value = parseDate(new Date(a.startDate).toISOString().slice(0, 10));
  formEndDate.value = a.endDate
    ? parseDate(new Date(a.endDate).toISOString().slice(0, 10))
    : null;
  editingRotationSlots.value = [];
  const integrationId = props.integration?.id;
  if (integrationId) {
    const rotation = await $fetch<{ slots: EditingSlot[] }>(
      `/api/integrations/${integrationId}/shifts/rotations/${a.shiftRotationId}`,
    );
    editingRotationSlots.value = (rotation.slots ?? []).map(slot => ({
      id: slot.id,
      dayIndex: slot.dayIndex,
      startTime: slot.startTime,
      endTime: slot.endTime,
      label: slot.label ?? null,
      color: slot.color ?? null,
      order: slot.order,
    }));
  }
}

const editingSlotTypes = computed(() => {
  const slots = editingRotationSlots.value;
  const keyToIndices = new Map<string, number[]>();
  slots.forEach((slot, idx) => {
    const key = `${slot.label ?? ""}-${slot.startTime}-${slot.endTime}`;
    const list = keyToIndices.get(key) ?? [];
    list.push(idx);
    keyToIndices.set(key, list);
  });
  return Array.from(keyToIndices.entries()).map(([key, indices]) => {
    const first = slots[indices[0]!];
    return {
      key,
      label: first?.label ?? `Day ${(first?.dayIndex ?? 0) + 1} • ${first?.startTime}–${first?.endTime}`,
      startTime: first?.startTime ?? "",
      endTime: first?.endTime ?? "",
      color: first?.color ?? null,
      indices,
    };
  });
});

function updateEditingSlotTypeColor(typeIndex: number, color: string | null) {
  const type = editingSlotTypes.value[typeIndex];
  if (!type)
    return;
  const next = [...editingRotationSlots.value];
  for (const idx of type.indices) {
    if (next[idx])
      next[idx] = { ...next[idx]!, color: color ?? null };
  }
  editingRotationSlots.value = next;
}

async function saveConfiguredShift() {
  const integrationId = props.integration?.id;
  if (!integrationId) {
    error.value = "Integration not set.";
    return;
  }
  if (!selectedTemplateId.value && !editingAssignmentId.value) {
    error.value = "Select a shift pattern.";
    return;
  }
  const formError = validateShiftForm();
  if (formError) {
    error.value = formError;
    return;
  }
  if (!editingAssignmentId.value) {
    const segmentError = validateSegments();
    if (segmentError) {
      error.value = segmentError;
      return;
    }
  }
  try {
    error.value = null;
    const startD = formStartDate.value;
    const endD = formEndDate.value;
    if (editingAssignmentId.value) {
      const a = assignments.value.find(x => x.id === editingAssignmentId.value);
      if (!a)
        return;
      await $fetch(
        `/api/integrations/${integrationId}/shifts/rotations/${a.shiftRotationId}`,
        {
          method: "PUT",
          body: {
            name: newRotationName.value.trim() || a.shiftRotation.name,
            color: editingRotationSlots.value[0]?.color ?? a.shiftRotation.color ?? DEFAULT_ROTATION_COLOR,
            assignment: {
              id: a.id,
              startDate: toUtcMidnightIso(startD),
              endDate: endD ? toUtcMidnightIso(endD) : null,
            },
            slots: editingRotationSlots.value.map(slot => ({ id: slot.id, color: slot.color ?? null })),
          },
        },
      );
    }
    else {
      const template = selectedTemplate.value;
      const name = newRotationName.value.trim()
        || generateUniqueName(
          template?.label ?? "Custom",
          rotations.value.map(r => r.name),
        );
      const slots = segmentsToSlots(editableSegments.value);
      await $fetch(`/api/integrations/${integrationId}/shifts/rotations`, {
        method: "POST",
        body: {
          name,
          cycleDays: totalSegmentDays.value,
          color: slots[0]?.color ?? DEFAULT_ROTATION_COLOR,
          order: rotations.value.length,
          slots: slots.map((slot, i) => ({
            ...slot,
            label: slot.label ?? null,
            color: slot.color ?? null,
            order: i,
          })),
          assignment: {
            userId: integrationOwnerUserId.value ?? null,
            startDate: toUtcMidnightIso(startD),
            endDate: endD ? toUtcMidnightIso(endD) : null,
          },
        },
      });
    }
    await Promise.all([refreshRotations(), refreshAssignments()]);
    closeForm();
    await triggerImmediateSync("calendar", integrationId);
  }
  catch (e) {
    error.value = getFetchErrorMessage(e, "Failed to save shift");
  }
}

function getFetchErrorMessage(e: unknown, fallback: string): string {
  const data = (e as { data?: { message?: string } }).data;
  return data?.message ?? (e instanceof Error ? e.message : fallback);
}

async function deleteConfiguredShift(assignmentId: string) {
  if (!props.integration?.id)
    return;
  try {
    await $fetch(
      `/api/integrations/${props.integration.id}/shifts/assignments/${assignmentId}`,
      { method: "DELETE" },
    );
    await Promise.all([refreshRotations(), refreshAssignments()]);
    if (editingAssignmentId.value === assignmentId)
      closeForm();
    await triggerImmediateSync("calendar", props.integration.id);
  }
  catch (e) {
    error.value = getFetchErrorMessage(e, "Failed to delete shift");
  }
}
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-[100] flex items-center justify-center bg-black/50"
    @click="emit('close')"
  >
    <div
      class="flex flex-col overflow-hidden bg-default"
      :class="panelClass"
      @click.stop
    >
      <div
        class="shrink-0 flex items-center justify-between border-b border-default"
        :class="dialogBarClass"
      >
        <h3 class="text-base font-semibold leading-6">
          Configure Shifts – {{ integration?.name ?? "Integration" }}
        </h3>
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-lucide-x"
          aria-label="Close"
          @click="emit('close')"
        />
      </div>

      <div class="flex-1 min-h-0 overflow-y-auto p-4 space-y-6">
        <div v-if="displayError" class="bg-error/10 text-error rounded-md px-3 py-2 text-sm">
          {{ displayError }}
        </div>

        <div :class="{ 'grid grid-cols-2 gap-6 items-start': isWideLandscape }">
          <div v-if="!editingAssignmentId">
            <h4 class="font-medium text-highlighted mb-2">
              Add shift
            </h4>
            <div class="mb-4 p-4 rounded-lg border border-default space-y-4">
              <div class="space-y-2">
                <label class="block text-sm font-medium text-highlighted">Patterns</label>
                <USelect
                  v-model="selectedTemplateId"
                  :items="templateSelectItems"
                  placeholder="Select a shift pattern"
                  class="w-full"
                  :disabled="!!editingAssignmentId"
                />
                <p
                  v-if="selectedTemplate?.description && !editingAssignmentId"
                  class="text-sm text-muted"
                >
                  {{ selectedTemplate.description }}
                </p>
              </div>
              <template v-if="selectedTemplateId && !editingAssignmentId">
                <div class="space-y-2">
                  <label class="block text-sm font-medium text-highlighted">Starts</label>
                  <UPopover>
                    <UButton
                      color="neutral"
                      variant="subtle"
                      icon="i-lucide-calendar"
                      class="w-full justify-between"
                    >
                      <NuxtTime
                        v-if="formStartDate"
                        :datetime="formStartDate.toDate(getLocalTimeZone())"
                        year="numeric"
                        month="short"
                        day="numeric"
                      />
                      <span v-else>Select a date</span>
                    </UButton>
                    <template #content>
                      <GlobalDatePicker
                        :model-value="formStartDateValue"
                        @update:model-value="onStartDateSelect"
                      />
                    </template>
                  </UPopover>
                  <p class="text-sm text-muted">
                    The first day of the pattern.
                  </p>
                </div>
                <div
                  v-if="isSegmentBasedTemplate && editableSegments.length > 0"
                  class="space-y-3"
                >
                  <label class="block text-sm font-medium text-highlighted">Shifts</label>
                  <div class="@container space-y-2">
                    <div
                      v-for="(seg, idx) in editableSegments"
                      :key="idx"
                      class="grid grid-cols-[auto_auto_minmax(0,1fr)_auto] @sm:grid-cols-[72px_auto_auto_minmax(0,1fr)_auto_auto] items-center gap-2"
                    >
                      <span class="col-span-3 @sm:col-span-1 text-sm font-medium text-highlighted">{{ seg.label }}</span>
                      <UInput
                        :model-value="seg.count"
                        type="number"
                        min="1"
                        max="99"
                        step="1"
                        class="w-16 col-start-1 @sm:col-start-2"
                        @update:model-value="(v: number | string) => updateSegmentCount(idx, v)"
                      />
                      <span v-if="seg.preset !== 'no-shift'" class="text-muted">×</span>
                      <USelect
                        v-if="seg.preset !== 'no-shift'"
                        :model-value="seg.preset"
                        :items="slotPresetSelectItems"
                        option-attribute="label"
                        value-attribute="value"
                        class="w-full"
                        @update:model-value="(v: string) => updateSegmentPreset(idx, v)"
                      />
                      <UPopover v-if="seg.preset !== 'no-shift'">
                        <UButton
                          color="neutral"
                          variant="outline"
                          size="sm"
                          aria-label="Segment color"
                        >
                          <template #leading>
                            <span
                              :style="{
                                backgroundColor: seg.color ?? (SHIFT_INTERVAL_PRESETS.find(p => p.value === seg.preset)?.defaultColor ?? DEFAULT_ROTATION_COLOR),
                              }"
                              class="size-3 rounded-full"
                            />
                          </template>
                        </UButton>
                        <template #content>
                          <UColorPicker
                            :model-value="seg.color ?? (SHIFT_INTERVAL_PRESETS.find(p => p.value === seg.preset)?.defaultColor ?? DEFAULT_ROTATION_COLOR)"
                            class="p-2"
                            @update:model-value="(v: string | undefined) => updateSegmentColor(idx, v ?? null)"
                          />
                        </template>
                      </UPopover>
                      <UButton
                        v-if="selectedTemplateId === 'custom' && editableSegments.length > 1"
                        color="neutral"
                        variant="ghost"
                        size="xs"
                        icon="i-lucide-trash"
                        class="col-start-4 row-start-1 justify-self-end @sm:col-start-6"
                        :aria-label="`Remove ${seg.label}`"
                        @click="removeSegment(idx)"
                      />
                      <div
                        v-if="seg.preset === 'custom'"
                        class="col-span-4 @sm:col-span-6 flex flex-col gap-1 text-xs text-muted"
                      >
                        <div class="flex items-center gap-1">
                          <span class="w-9 shrink-0">Start:</span>
                          <USelect
                            :model-value="customSegmentTimes[idx]?.startHour ?? 9"
                            :items="hourOptions"
                            option-attribute="label"
                            value-attribute="value"
                            class="w-16"
                            @update:model-value="(v: number) => updateCustomSegmentTime(idx, 'startHour', v)"
                          />
                          <USelect
                            :model-value="customSegmentTimes[idx]?.startMinute ?? 0"
                            :items="minuteOptions"
                            option-attribute="label"
                            value-attribute="value"
                            class="w-16"
                            @update:model-value="(v: number) => updateCustomSegmentTime(idx, 'startMinute', v)"
                          />
                          <USelect
                            :model-value="customSegmentTimes[idx]?.startAmPm ?? 'AM'"
                            :items="amPmOptions"
                            option-attribute="label"
                            value-attribute="value"
                            class="w-20"
                            @update:model-value="(v: string) => updateCustomSegmentTime(idx, 'startAmPm', v)"
                          />
                        </div>
                        <div class="flex items-center gap-1">
                          <span class="w-9 shrink-0">End:</span>
                          <USelect
                            :model-value="customSegmentTimes[idx]?.endHour ?? 5"
                            :items="hourOptions"
                            option-attribute="label"
                            value-attribute="value"
                            class="w-16"
                            @update:model-value="(v: number) => updateCustomSegmentTime(idx, 'endHour', v)"
                          />
                          <USelect
                            :model-value="customSegmentTimes[idx]?.endMinute ?? 0"
                            :items="minuteOptions"
                            option-attribute="label"
                            value-attribute="value"
                            class="w-16"
                            @update:model-value="(v: number) => updateCustomSegmentTime(idx, 'endMinute', v)"
                          />
                          <USelect
                            :model-value="customSegmentTimes[idx]?.endAmPm ?? 'PM'"
                            :items="amPmOptions"
                            option-attribute="label"
                            value-attribute="value"
                            class="w-20"
                            @update:model-value="(v: string) => updateCustomSegmentTime(idx, 'endAmPm', v)"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                  <p class="text-sm text-muted">
                    Repeats every {{ totalSegmentDays }} {{ totalSegmentDays === 1 ? "day" : "days" }}.
                  </p>
                  <div
                    v-if="selectedTemplateId === 'custom'"
                    class="flex gap-2 flex-wrap"
                  >
                    <UButton
                      size="xs"
                      color="neutral"
                      variant="outline"
                      @click="addShiftSegment"
                    >
                      Add shift
                    </UButton>
                    <UButton
                      size="xs"
                      color="neutral"
                      variant="outline"
                      @click="addOffSegment"
                    >
                      Add off
                    </UButton>
                  </div>
                </div>
                <div class="space-y-2">
                  <label class="block text-sm font-medium text-highlighted">Pattern name</label>
                  <UInput
                    v-model="newRotationName"
                    placeholder="Pattern name"
                    class="w-full"
                  />
                  <p class="text-sm text-muted">
                    Optional: If not provided, a name will be generated.
                  </p>
                </div>
                <div class="space-y-2">
                  <label class="block text-sm font-medium text-highlighted">End date (optional)</label>
                  <div class="flex items-center gap-2">
                    <UPopover class="flex-1">
                      <UButton
                        color="neutral"
                        variant="subtle"
                        icon="i-lucide-calendar"
                        class="w-full justify-between"
                      >
                        <NuxtTime
                          v-if="formEndDate"
                          :datetime="formEndDate.toDate(getLocalTimeZone())"
                          year="numeric"
                          month="short"
                          day="numeric"
                        />
                        <span v-else>Select a date</span>
                      </UButton>
                      <template #content>
                        <GlobalDatePicker
                          :model-value="formEndDateValue"
                          @update:model-value="(value: DateValue | null) => { formEndDate = value; }"
                        />
                      </template>
                    </UPopover>
                    <UButton
                      v-if="formEndDate"
                      icon="i-lucide-x"
                      color="neutral"
                      variant="ghost"
                      size="sm"
                      aria-label="Clear end date"
                      @click="formEndDate = null"
                    />
                  </div>
                </div>
                <div class="flex gap-2">
                  <UButton size="sm" @click="saveConfiguredShift">
                    Save
                  </UButton>
                  <UButton
                    size="sm"
                    variant="ghost"
                    @click="closeForm"
                  >
                    Clear
                  </UButton>
                </div>
              </template>
            </div>
          </div>

          <div
            v-if="showConfiguredList"
            :class="{ 'col-start-2 row-start-1': isWideLandscape }"
          >
            <h4 class="font-medium text-highlighted mb-2">
              Configured shifts
            </h4>
            <div class="space-y-4">
              <div
                v-for="a in assignments"
                v-show="a.id !== editingAssignmentId"
                :key="a.id"
                class="flex items-center justify-between gap-3 p-4 rounded-lg border border-default"
              >
                <div class="flex flex-1 min-w-0 items-center gap-3">
                  <div
                    class="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                    :style="{
                      backgroundColor: a.shiftRotation.color ?? DEFAULT_ROTATION_COLOR,
                    }"
                  />
                  <div class="min-w-0">
                    <p class="font-medium text-highlighted truncate">
                      {{ a.shiftRotation.name }}
                    </p>
                    <p class="text-sm text-muted">
                      {{ new Date(a.startDate).toLocaleDateString(undefined, { timeZone: "UTC" }) }}
                      <template v-if="a.endDate">
                        – {{ new Date(a.endDate).toLocaleDateString(undefined, { timeZone: "UTC" }) }}
                      </template>
                      · {{ a.shiftRotation.cycleDays }}-day cycle
                    </p>
                  </div>
                </div>
                <div class="flex shrink-0 items-center gap-2">
                  <UButton
                    variant="ghost"
                    size="sm"
                    icon="i-lucide-edit"
                    :aria-label="`Edit ${a.shiftRotation.name}`"
                    @click="openEditForm(a)"
                  />
                  <UButton
                    variant="ghost"
                    size="sm"
                    color="error"
                    icon="i-lucide-trash"
                    :aria-label="`Delete ${a.shiftRotation.name}`"
                    @click="deleteConfiguredShift(a.id)"
                  />
                </div>
              </div>
              <p v-if="assignments.length === 0" class="text-muted text-sm py-2">
                No configured shifts yet. Select a pattern to add one.
              </p>
            </div>
          </div>
          <div
            v-if="editingAssignmentId"
            class="rounded-lg border border-default p-4"
            :class="isWideLandscape ? 'col-span-2 grid grid-cols-2 gap-x-6 gap-y-4 items-start' : 'mt-4 space-y-4'"
          >
            <h5
              class="font-medium text-highlighted"
              :class="{ 'col-span-2': isWideLandscape }"
            >
              Editing {{ newRotationName || 'pattern' }}
            </h5>
            <div class="space-y-2">
              <label class="block text-sm font-medium text-highlighted">Pattern name</label>
              <UInput
                v-model="newRotationName"
                placeholder="Pattern name"
                class="w-full"
              />
            </div>
            <div class="space-y-2">
              <label class="block text-sm font-medium text-highlighted">Starts</label>
              <UPopover>
                <UButton
                  color="neutral"
                  variant="subtle"
                  icon="i-lucide-calendar"
                  class="w-full justify-between"
                >
                  <NuxtTime
                    v-if="formStartDate"
                    :datetime="formStartDate.toDate(getLocalTimeZone())"
                    year="numeric"
                    month="short"
                    day="numeric"
                  />
                  <span v-else>Select a date</span>
                </UButton>
                <template #content>
                  <GlobalDatePicker
                    :model-value="formStartDateValue"
                    @update:model-value="onStartDateSelect"
                  />
                </template>
              </UPopover>
              <p class="text-sm text-muted">
                The first day of the pattern.
              </p>
            </div>
            <div
              v-if="editingSlotTypes.length > 0"
              class="space-y-3"
              :class="{ 'col-start-2 row-start-2 row-span-3': isWideLandscape }"
            >
              <label class="block text-sm font-medium text-highlighted">Slot colors</label>
              <div class="space-y-2">
                <div
                  v-for="(type, typeIdx) in editingSlotTypes"
                  :key="type.key"
                  class="flex flex-wrap items-center gap-2"
                >
                  <span class="text-sm font-medium text-highlighted min-w-[120px]">
                    {{ type.label || `${type.startTime}–${type.endTime}` }}
                  </span>
                  <UPopover>
                    <UButton
                      color="neutral"
                      variant="outline"
                      size="sm"
                      aria-label="Slot color"
                    >
                      <template #leading>
                        <span
                          :style="{
                            backgroundColor: type.color ?? DEFAULT_ROTATION_COLOR,
                          }"
                          class="size-3 rounded-full"
                        />
                      </template>
                    </UButton>
                    <template #content>
                      <UColorPicker
                        :model-value="type.color ?? DEFAULT_ROTATION_COLOR"
                        class="p-2"
                        @update:model-value="(v: string | undefined) => updateEditingSlotTypeColor(typeIdx, v ?? null)"
                      />
                    </template>
                  </UPopover>
                </div>
              </div>
            </div>
            <div class="space-y-2">
              <label class="block text-sm font-medium text-highlighted">End date (optional)</label>
              <div class="flex items-center gap-2">
                <UPopover class="flex-1">
                  <UButton
                    color="neutral"
                    variant="subtle"
                    icon="i-lucide-calendar"
                    class="w-full justify-between"
                  >
                    <NuxtTime
                      v-if="formEndDate"
                      :datetime="formEndDate.toDate(getLocalTimeZone())"
                      year="numeric"
                      month="short"
                      day="numeric"
                    />
                    <span v-else>Select a date</span>
                  </UButton>
                  <template #content>
                    <GlobalDatePicker
                      :model-value="formEndDateValue"
                      @update:model-value="(value: DateValue | null) => { formEndDate = value; }"
                    />
                  </template>
                </UPopover>
                <UButton
                  v-if="formEndDate"
                  icon="i-lucide-x"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  aria-label="Clear end date"
                  @click="formEndDate = null"
                />
              </div>
            </div>
            <div
              class="flex gap-2"
              :class="{ 'col-span-2': isWideLandscape }"
            >
              <UButton size="sm" @click="saveConfiguredShift">
                Save
              </UButton>
              <UButton
                size="sm"
                variant="ghost"
                @click="closeForm"
              >
                Cancel
              </UButton>
            </div>
          </div>
        </div>
      </div>

      <div
        class="shrink-0 border-t border-default"
        :class="dialogBarClass"
      >
        <UButton
          color="neutral"
          variant="ghost"
          @click="emit('close')"
        >
          Done
        </UButton>
      </div>
    </div>
  </div>
</template>
