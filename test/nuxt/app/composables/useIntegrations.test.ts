import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mockNuxtImport, registerEndpoint } from "@nuxt/test-utils/runtime";
import { createError } from "h3";

import type { Integration } from "~/types/database";

const testDate = new Date("2026-01-26T12:00:00Z");

const {
  consolaMock,
  mockUseNuxtData,
  mockRefreshNuxtData,
  integrationsDataRef,
  integrationServicesMap,
  mockCreateIntegrationService,
  mockTriggerImmediateSync,
} = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ref } = require("vue");
  const consola = {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  };
  const dataRef = ref([]);
  const store = new Map();
  store.set("integrations", dataRef);

  const useNuxtDataMock = vi.fn((key: string) => {
    if (!store.has(key)) {
      store.set(key, ref(null));
    }
    return { data: store.get(key)! };
  });

  const refreshNuxtDataMock = vi.fn(async (key: string) => {
    if (key === "integrations" && store.has(key)) {
      store.get(key)!.value = dataRef.value;
    }
    return undefined;
  });

  const integrationServices = new Map<string, unknown>();
  const createIntegrationServiceMock = vi.fn();
  const triggerImmediateSyncMock = vi.fn().mockResolvedValue(undefined);

  return {
    consolaMock: consola,
    mockUseNuxtData: useNuxtDataMock,
    mockRefreshNuxtData: refreshNuxtDataMock,
    integrationsDataRef: dataRef,
    integrationServicesMap: integrationServices,
    mockCreateIntegrationService: createIntegrationServiceMock,
    mockTriggerImmediateSync: triggerImmediateSyncMock,
  };
});

vi.mock("consola", () => ({
  consola: consolaMock,
}));

vi.mock("../../../../app/plugins/02.appInit", () => ({
  integrationServices: integrationServicesMap,
  default: vi.fn(),
}));

vi.mock("../../../../app/types/integrations", () => ({
  createIntegrationService: (...args: unknown[]) =>
    mockCreateIntegrationService(...args),
}));

mockNuxtImport("useNuxtData", () => mockUseNuxtData);
mockNuxtImport("refreshNuxtData", () => mockRefreshNuxtData);
mockNuxtImport("useSyncManager", () => () => ({
  triggerImmediateSync: mockTriggerImmediateSync,
}));

import { generateUniqueName, useIntegrations, useShiftsData } from "../../../../app/composables/useIntegrations";

describe("useIntegrations", () => {
  const mockIntegrations: Integration[] = [
    {
      id: "int-1",
      name: "Test Integration",
      type: "calendar",
      service: "ical",
      apiKey: null,
      baseUrl: null,
      icon: null,
      enabled: true,
      settings: null,
      createdAt: testDate,
      updatedAt: testDate,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    integrationsDataRef.value = [...mockIntegrations];
    integrationServicesMap.clear();
  });

  it("should return integrations from useNuxtData", () => {
    const { integrations } = useIntegrations();
    expect(integrations.value).toEqual(mockIntegrations);
  });

  it("should return empty array when integrations data is null", () => {
    integrationsDataRef.value = null;
    const { integrations } = useIntegrations();
    expect(integrations.value).toEqual([]);
  });

  it("should return multiple integrations when data has many items", () => {
    const many = [
      ...mockIntegrations,
      { ...mockIntegrations[0]!, id: "int-2", name: "Second" },
      { ...mockIntegrations[0]!, id: "int-3", name: "Third" },
    ];
    integrationsDataRef.value = many;
    const { integrations } = useIntegrations();
    expect(integrations.value).toHaveLength(3);
  });

  it("should have loading state", () => {
    const { loading } = useIntegrations();
    expect(loading.value).toBe(false);
  });

  it("should have error state", () => {
    const { error } = useIntegrations();
    expect(error.value).toBeNull();
  });

  describe("fetchIntegrations", () => {
    it("should call refreshNuxtData with integrations key", async () => {
      const { fetchIntegrations } = useIntegrations();
      await fetchIntegrations();
      expect(mockRefreshNuxtData).toHaveBeenCalledWith("integrations");
    });

    it("should call consola.error when refreshNuxtData rejects", async () => {
      mockRefreshNuxtData.mockRejectedValueOnce(new Error("network error"));
      const { fetchIntegrations } = useIntegrations();
      await fetchIntegrations();
      expect(consolaMock.error).toHaveBeenCalledWith(
        "Use Integrations: Error refreshing integrations:",
        expect.any(Error),
      );
    });
  });

  describe("initialized", () => {
    it("should be false when integrations array is empty", () => {
      integrationsDataRef.value = [];
      const { initialized } = useIntegrations();
      expect(initialized.value).toBe(false);
    });

    it("should be false when enabled integrations exist but services map has no ids", () => {
      const { initialized } = useIntegrations();
      expect(initialized.value).toBe(false);
    });

    it("should be true when all enabled integrations have a service in the map", () => {
      integrationServicesMap.set("int-1", {});
      const { initialized } = useIntegrations();
      expect(initialized.value).toBe(true);
    });

    it("should be false when one enabled integration has no service", () => {
      integrationsDataRef.value = [
        ...mockIntegrations,
        { ...mockIntegrations[0]!, id: "int-2", enabled: true },
      ];
      integrationServicesMap.set("int-1", {});
      const { initialized } = useIntegrations();
      expect(initialized.value).toBe(false);
    });
  });

  describe("servicesInitializing", () => {
    it("should be false when integrations array is empty", () => {
      integrationsDataRef.value = [];
      const { servicesInitializing } = useIntegrations();
      expect(servicesInitializing.value).toBe(false);
    });

    it("should be true when enabled integrations exist but not initialized", () => {
      const { servicesInitializing } = useIntegrations();
      expect(servicesInitializing.value).toBe(true);
    });

    it("should be false when initialized", () => {
      integrationServicesMap.set("int-1", {});
      const { servicesInitializing } = useIntegrations();
      expect(servicesInitializing.value).toBe(false);
    });
  });

  describe("getEnabledIntegrations", () => {
    it("should return empty array when not initialized", () => {
      const { getEnabledIntegrations } = useIntegrations();
      expect(getEnabledIntegrations.value).toEqual([]);
    });

    it("should return enabled integrations when initialized", () => {
      integrationServicesMap.set("int-1", {});
      const { getEnabledIntegrations } = useIntegrations();
      expect(getEnabledIntegrations.value).toHaveLength(1);
      expect(getEnabledIntegrations.value[0]?.id).toBe("int-1");
    });

    it("should exclude disabled integrations when initialized", () => {
      integrationsDataRef.value = [
        { ...mockIntegrations[0]!, id: "int-1", enabled: true },
        { ...mockIntegrations[0]!, id: "int-2", enabled: false },
      ];
      integrationServicesMap.set("int-1", {});
      const { getEnabledIntegrations } = useIntegrations();
      expect(getEnabledIntegrations.value).toHaveLength(1);
      expect(getEnabledIntegrations.value[0]?.id).toBe("int-1");
    });
  });

  describe("getIntegrationsByType", () => {
    it("should return empty array when not initialized", () => {
      const { getIntegrationsByType } = useIntegrations();
      expect(getIntegrationsByType("calendar")).toEqual([]);
    });

    it("should return integrations matching type when initialized", () => {
      integrationServicesMap.set("int-1", {});
      const { getIntegrationsByType } = useIntegrations();
      expect(getIntegrationsByType("calendar")).toHaveLength(1);
      expect(getIntegrationsByType("shopping")).toHaveLength(0);
    });
  });

  describe("getIntegrationByType", () => {
    it("should return undefined when not initialized", () => {
      const { getIntegrationByType } = useIntegrations();
      expect(getIntegrationByType("calendar")).toBeUndefined();
    });

    it("should return first matching integration when initialized", () => {
      integrationServicesMap.set("int-1", {});
      const { getIntegrationByType } = useIntegrations();
      expect(getIntegrationByType("calendar")?.id).toBe("int-1");
      expect(getIntegrationByType("shopping")).toBeUndefined();
    });
  });

  describe("getService", () => {
    it("should return service from integrationServices map", () => {
      const stub = { init: vi.fn() };
      integrationServicesMap.set("int-1", stub);
      const { getService } = useIntegrations();
      expect(getService("int-1")).toBe(stub);
      expect(getService("missing")).toBeUndefined();
    });
  });

  describe("reinitializeIntegration", () => {
    it("should set service when integration is enabled", async () => {
      const stub = { initialize: vi.fn().mockResolvedValue(undefined) };
      mockCreateIntegrationService.mockResolvedValue(stub);
      const { reinitializeIntegration } = useIntegrations();
      await reinitializeIntegration("int-1");
      expect(mockCreateIntegrationService).toHaveBeenCalledWith(
        expect.objectContaining({ id: "int-1" }),
      );
      expect(integrationServicesMap.get("int-1")).toBe(stub);
    });

    it("should delete service when integration is disabled", async () => {
      integrationsDataRef.value = [
        { ...mockIntegrations[0]!, id: "int-1", enabled: false },
      ];
      integrationServicesMap.set("int-1", {});
      const { reinitializeIntegration } = useIntegrations();
      await reinitializeIntegration("int-1");
      expect(integrationServicesMap.has("int-1")).toBe(false);
    });

    it("should do nothing when integration id not found", async () => {
      const { reinitializeIntegration } = useIntegrations();
      await reinitializeIntegration("non-existent");
      expect(mockCreateIntegrationService).not.toHaveBeenCalled();
    });
  });
});

describe("useShiftsData", () => {
  const cleanups: (() => void)[] = [];

  afterEach(() => {
    cleanups.splice(0).forEach(cleanup => cleanup());
    clearNuxtData();
  });

  it("loads rotations and assignments for the integration", async () => {
    cleanups.push(
      registerEndpoint("/api/integrations/int-shifts/shifts/rotations", () => [{ id: "rot-1" }]),
      registerEndpoint("/api/integrations/int-shifts/shifts/assignments", () => [{ id: "asg-1" }]),
    );

    const { rotations, assignments } = useShiftsData("int-shifts", { server: false });
    await Promise.all([rotations, assignments]);

    expect(rotations.data.value).toEqual([{ id: "rot-1" }]);
    expect(assignments.data.value).toEqual([{ id: "asg-1" }]);
  });

  it("does not fetch when immediate is false", async () => {
    const handler = vi.fn(() => []);
    cleanups.push(
      registerEndpoint("/api/integrations/int-idle/shifts/rotations", handler),
      registerEndpoint("/api/integrations/int-idle/shifts/assignments", handler),
    );

    const { rotations } = useShiftsData("int-idle", { server: false, immediate: false });
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(handler).not.toHaveBeenCalled();
    expect(rotations.data.value).toBeUndefined();
  });

  it("exposes fetch failures through error", async () => {
    cleanups.push(
      registerEndpoint("/api/integrations/int-bad/shifts/rotations", () => {
        throw createError({ statusCode: 500, statusMessage: "boom" });
      }),
      registerEndpoint("/api/integrations/int-bad/shifts/assignments", () => []),
    );

    const { rotations, assignments } = useShiftsData("int-bad", { server: false });
    await Promise.all([rotations, assignments]);

    expect(rotations.error.value).toBeTruthy();
    expect(assignments.error.value).toBeFalsy();
  });
});

describe("generateUniqueName", () => {
  it("returns the base name when it is free", () => {
    expect(generateUniqueName("iCal", ["Google"])).toBe("iCal");
  });

  it("appends (2) when the base name is taken", () => {
    expect(generateUniqueName("2-2-2", ["2-2-2"])).toBe("2-2-2 (2)");
  });

  it("fills the first gap", () => {
    expect(generateUniqueName("X", ["X", "X (3)"])).toBe("X (2)");
  });

  it("skips existing numbered duplicates", () => {
    expect(generateUniqueName("X", ["X", "X (2)", "X (3)"])).toBe("X (4)");
  });
});
