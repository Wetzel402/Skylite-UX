import type { H3Event } from "h3";

import { consola } from "consola";
import { defineNitroPlugin } from "nitropack/runtime/plugin";

import type { CalendarEvent } from "../../app/types/calendar";
import type { Integration, ShoppingListWithItemsAndCount, TodoWithUser } from "../../app/types/database";
import type {
  ServerCalendarIntegrationService,
  ServerShoppingIntegrationService,
  ServerTodoIntegrationService,
  ServerTypedIntegrationService,
} from "../../app/types/integrations";
import type { ConnectedClient, ServerSyncEvent, SyncInterval } from "../../app/types/sync";

import { integrationConfigs } from "../../app/integrations/integrationConfig";
import { createIntegrationService, registerIntegration } from "../../app/types/integrations";
import { setBroadcastFunction } from "../utils/broadcastHomeUpdate";

const syncIntervals = new Map<string, SyncInterval>();
const connectedClients = new Set<ConnectedClient>();
const integrationServices = new Map<string, ServerTypedIntegrationService>();

export default defineNitroPlugin(async (nitroApp) => {
  // Skip initialization during static generation (prevents hanging during 'nuxt generate')
  if (process.env.CAPACITOR_BUILD === "true" || process.env.prerender) {
    consola.info("Sync Manager: Skipping initialization (static generation mode)");
    return;
  }

  consola.start("Sync Manager: Initializing...");

  // Initialize home broadcast utility with our broadcast function
  setBroadcastFunction(broadcastToClients, () => connectedClients.size);

  integrationConfigs.forEach((config) => {
    registerIntegration(config);
  });
  consola.debug(`Sync Manager: Registered ${integrationConfigs.length} integrations for server-side sync`);

  setInterval(() => {
    const now = new Date();
    const disconnectedClients: ConnectedClient[] = [];

    connectedClients.forEach((client) => {
      if (now.getTime() - client.lastActivity.getTime() > 5 * 60 * 1000) {
        disconnectedClients.push(client);
      }
    });

    disconnectedClients.forEach((client) => {
      connectedClients.delete(client);
    });

    if (disconnectedClients.length > 0) {
      consola.info(`Sync Manager: Cleaned up ${disconnectedClients.length} disconnected clients`);
    }
  }, 60 * 1000);

  await initializeIntegrationSync();

  // Set up weather broadcast job
  await initializeWeatherBroadcast();

  nitroApp.hooks.hook("close", () => {
    consola.info("Sync Manager: Shutting down...");
    if (weatherInterval) clearInterval(weatherInterval);
    clearAllSyncIntervals();
  });
});

async function initializeIntegrationSync() {
  try {
    const prisma = await import("../../app/lib/prisma").then(m => m.default);
    const integrations = await prisma.integration.findMany({
      where: { enabled: true },
    });

    for (const integration of integrations) {
      await setupIntegrationSync(integration as Integration);
    }

    consola.debug(`Sync Manager: Initialized sync for ${integrations.length} integrations`);
  }
  catch (error) {
    consola.error("Sync Manager: Failed to initialize integration sync:", error);
  }
}

export async function setupIntegrationSync(integration: Integration, performImmediateSync = false) {
  try {
    const config = integrationConfigs.find(
      c => c.type === integration.type && c.service === integration.service,
    );

    if (!config) {
      consola.warn(`Sync Manager: No config found for integration ${integration.id} (${integration.type}:${integration.service})`);
      return;
    }

    clearIntegrationSync(integration.id);

    const service = await createIntegrationService(integration);
    if (!service) {
      consola.warn(`Sync Manager: Failed to create service for integration ${integration.id}`);
      return;
    }

    await service.initialize();
    integrationServices.set(integration.id, service as unknown as ServerTypedIntegrationService);

    if (performImmediateSync) {
      consola.debug(`Sync Manager: Performing immediate sync for integration ${integration.name} (${integration.id})`);
      await performIntegrationSync(integration, config, service as unknown as ServerTypedIntegrationService);
    }

    const interval = setInterval(async () => {
      await performIntegrationSync(integration, config, service as unknown as ServerTypedIntegrationService);
    }, config.syncInterval * 60 * 1000);

    syncIntervals.set(integration.id, {
      integrationId: integration.id,
      interval,
      lastSync: new Date(),
      config,
    });

    consola.debug(`Sync Manager: Set up sync for integration ${integration.name} (${integration.id}) - interval: ${config.syncInterval} minutes${performImmediateSync ? " with immediate sync" : ""}`);
  }
  catch (error) {
    consola.error(`Sync Manager: Failed to set up sync for integration ${integration.id}:`, error);
  }
}

async function performIntegrationSync(
  integration: Integration,
  config: typeof integrationConfigs[0],
  service: ServerTypedIntegrationService,
) {
  const syncStart = new Date();
  let success = false;
  let error: string | undefined;
  let data: CalendarEvent[] | ShoppingListWithItemsAndCount[] | TodoWithUser[] | null = null;

  try {
    consola.debug(`Sync Manager: Syncing integration ${integration.name} (${integration.id})...`);

    switch (integration.type) {
      case "calendar":
        data = await (service as ServerCalendarIntegrationService).getEvents();
        break;
      case "shopping":
        data = await (service as ServerShoppingIntegrationService).getShoppingLists();
        break;
      case "todo":
        data = await (service as ServerTodoIntegrationService).getTodos();
        break;
      case "tasks":
        // Tasks integrations are fetch-on-demand, not synced
        consola.debug(`Sync Manager: Skipping sync for tasks integration (fetch-on-demand)`);
        return;
      case "photos":
        // Photos integrations don't sync data, they're server-side only
        consola.debug(`Sync Manager: Skipping sync for photos integration (server-side only)`);
        return;
      default:
        consola.warn(`Sync Manager: Unknown integration type: ${integration.type}`);
        return;
    }

    success = true;
    consola.debug(`Sync Manager: Successfully synced integration ${integration.name} (${integration.id})`);
  }
  catch (err) {
    error = err instanceof Error ? err.message : String(err);
    const errObj = err as { code?: number; statusCode?: number };

    // Check if this is an authentication error (401)
    const isAuthError = errObj?.code === 401 || errObj?.statusCode === 401 || error?.includes("authentication expired") || error?.includes("Refresh token expired");

    if (isAuthError) {
      consola.warn(`Sync Manager: Integration ${integration.name} (${integration.id}) needs re-authorization. Disabling automatic sync.`);

      // Clear the sync interval to prevent continuous failed attempts
      clearIntegrationSync(integration.id);

      // Note: The API endpoint should have already marked the integration as needsReauth
      // We just stop trying to sync it automatically
    }
    else {
      consola.error(`Sync Manager: Failed to sync integration ${integration.name} (${integration.id}):`, err);
    }
  }
  finally {
    const syncInterval = syncIntervals.get(integration.id);
    if (syncInterval) {
      syncInterval.lastSync = syncStart;
    }

    const syncEvent: ServerSyncEvent = {
      type: "integration_sync",
      integrationId: integration.id,
      integrationType: integration.type,
      service: integration.service,
      data: data || [],
      timestamp: syncStart,
      success,
      error,
    };

    broadcastToClients(syncEvent);
  }
}

function broadcastToClients(event: ServerSyncEvent) {
  if (connectedClients.size === 0) {
    return;
  }

  const eventData = `data: ${JSON.stringify(event)}\n\n`;
  const disconnectedClients: ConnectedClient[] = [];

  connectedClients.forEach((client) => {
    try {
      client.lastActivity = new Date();

      client.event.node.res.write(eventData);
    }
    catch (err) {
      consola.warn("Sync Manager: Failed to send event to client, marking for cleanup:", err);
      disconnectedClients.push(client);
    }
  });

  disconnectedClients.forEach((client) => {
    connectedClients.delete(client);
  });
}

function clearIntegrationSync(integrationId: string) {
  const syncInterval = syncIntervals.get(integrationId);
  if (syncInterval) {
    clearInterval(syncInterval.interval);
    syncIntervals.delete(integrationId);
    integrationServices.delete(integrationId);
    consola.debug(`Sync Manager: Cleared sync for integration ${integrationId}`);
  }
}

function clearAllSyncIntervals() {
  syncIntervals.forEach((syncInterval) => {
    clearInterval(syncInterval.interval);
  });
  syncIntervals.clear();
  integrationServices.clear();
  connectedClients.clear();
  consola.debug("Sync Manager: Cleared all sync intervals");
}

export async function sendCachedSyncData(event: H3Event, integrationId: string, syncInterval: SyncInterval) {
  const prisma = await import("../../app/lib/prisma").then(m => m.default);
  const integration = await prisma.integration.findUnique({ where: { id: integrationId } });
  const service = integrationServices.get(integrationId);

  if (!integration || !service) {
    return;
  }

  try {
    let data: CalendarEvent[] | ShoppingListWithItemsAndCount[] | TodoWithUser[] | null = null;

    switch (integration.type) {
      case "calendar":
        data = await (service as ServerCalendarIntegrationService).getEvents();
        break;
      case "shopping":
        data = await (service as ServerShoppingIntegrationService).getShoppingLists();
        break;
      case "todo":
        data = await (service as ServerTodoIntegrationService).getTodos();
        break;
      case "tasks":
      case "photos":
        // Tasks and photos integrations are fetch-on-demand, not synced
        return;
    }

    if (data) {
      const syncEvent: ServerSyncEvent = {
        type: "integration_sync",
        integrationId: integration.id,
        integrationType: integration.type,
        service: integration.service,
        data,
        timestamp: syncInterval.lastSync,
        success: true,
      };

      event.node.res.write(`data: ${JSON.stringify(syncEvent)}\n\n`);
      consola.debug(`Sync Manager: Sent cached data for integration ${integration.name} (${integration.id}) to reconnecting client`);
    }
  }
  catch (error) {
    consola.error(`Sync Manager: Failed to send cached data for ${integrationId}:`, error);
  }
}

export function registerClient(event: H3Event) {
  const client: ConnectedClient = {
    event,
    lastActivity: new Date(),
  };
  connectedClients.add(client);
  consola.info(`Sync Manager: New client connected. Total clients: ${connectedClients.size}`);
}

export function unregisterClient(event: H3Event) {
  const clientToRemove = Array.from(connectedClients).find(
    client => client.event === event,
  );
  if (clientToRemove) {
    connectedClients.delete(clientToRemove);
    consola.info(`Sync Manager: Client disconnected. Total clients: ${connectedClients.size}`);
  }
}

let weatherInterval: NodeJS.Timeout | null = null;

async function initializeWeatherBroadcast() {
  try {
    const prisma = await import("../../app/lib/prisma").then(m => m.default);
    const homeSettings = await prisma.homeSettings.findFirst();

    if (!homeSettings?.weatherEnabled || !homeSettings.latitude || !homeSettings.longitude) {
      consola.debug("Sync Manager: Weather broadcast skipped (not configured)");
      return;
    }

    const refreshIntervalMs = (homeSettings.refreshInterval || 6.0) * 3600000;

    weatherInterval = setInterval(async () => {
      try {
        const latestSettings = await prisma.homeSettings.findFirst();
        if (!latestSettings?.weatherEnabled || !latestSettings.latitude || !latestSettings.longitude) {
          return;
        }
        await broadcastWeatherUpdate(latestSettings);
      }
      catch (error) {
        consola.error("Sync Manager: Weather interval callback failed:", error);
      }
    }, refreshIntervalMs);

    await broadcastWeatherUpdate(homeSettings);

    consola.debug(`Sync Manager: Weather broadcast initialized (interval: ${homeSettings.refreshInterval || 6} hours)`);
  }
  catch (error) {
    consola.error("Sync Manager: Failed to initialize weather broadcast:", error);
  }
}

async function broadcastWeatherUpdate(homeSettings: any) {
  if (connectedClients.size === 0) return;

  try {
    const https = await import("node:https");

    const params = new URLSearchParams({
      latitude: homeSettings.latitude.toString(),
      longitude: homeSettings.longitude.toString(),
      current: "temperature_2m,apparent_temperature,weather_code,is_day",
      daily: "temperature_2m_max,temperature_2m_min,weather_code",
      temperature_unit: homeSettings.temperatureUnit === "fahrenheit" ? "fahrenheit" : "celsius",
      timezone: "auto",
      forecast_days: "7",
    });

    const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;

    const weather: any = await new Promise((resolve, reject) => {
      const req = https.get(url, (res: any) => {
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          res.resume();
          clearTimeout(timeout);
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        let data = "";
        res.on("data", (chunk: string) => { data += chunk; });
        res.on("end", () => {
          clearTimeout(timeout);
          try { resolve(JSON.parse(data)); }
          catch (err) { reject(err); }
        });
      });
      const timeout = setTimeout(() => {
        req.destroy(new Error("Weather request timeout"));
      }, 30000);
      req.on("error", (err: Error) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    const getWeatherDescription = (code: number): string => {
      if (code === 0) return "Clear sky";
      if (code === 1) return "Mainly clear";
      if (code === 2) return "Partly cloudy";
      if (code === 3) return "Overcast";
      if (code >= 45 && code <= 48) return "Foggy";
      if (code >= 51 && code <= 57) return "Drizzle";
      if (code >= 61 && code <= 67) return "Rain";
      if (code >= 71 && code <= 77) return "Snow";
      if (code >= 80 && code <= 82) return "Rain showers";
      if (code >= 85 && code <= 86) return "Snow showers";
      if (code >= 95 && code <= 99) return "Thunderstorm";
      return "Unknown";
    };

    const dailyForecast = weather.daily.time.map((date: string, index: number) => ({
      date,
      tempMax: Math.round(weather.daily.temperature_2m_max[index]),
      tempMin: Math.round(weather.daily.temperature_2m_min[index]),
      weatherCode: weather.daily.weather_code[index],
      weatherDescription: getWeatherDescription(weather.daily.weather_code[index]),
    }));

    const weatherData = {
      temperature: Math.round(weather.current.temperature_2m),
      weatherCode: weather.current.weather_code,
      weatherDescription: getWeatherDescription(weather.current.weather_code),
      daily: dailyForecast,
    };

    broadcastToClients({
      type: "weather_update",
      data: weatherData,
      timestamp: new Date(),
      success: true,
    } as any);
    consola.debug("Sync Manager: Broadcast weather update");
  }
  catch (error) {
    consola.error("Sync Manager: Failed to fetch/broadcast weather:", error);
  }
}

export const syncManager = {
  setupIntegrationSync,
  clearIntegrationSync,
  clearAllSyncIntervals,
  registerClient,
  unregisterClient,
  getConnectedClientsCount: () => connectedClients.size,
  getActiveSyncIntervals: () => Array.from(syncIntervals.keys()),
  getSyncIntervals: () => syncIntervals,
  getIntegrationById: async (id: string) => {
    const prisma = await import("../../app/lib/prisma").then(m => m.default);
    return prisma.integration.findUnique({ where: { id } });
  },
};
