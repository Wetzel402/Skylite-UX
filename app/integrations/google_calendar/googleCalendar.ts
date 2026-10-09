import consola from "consola";

import type { CalendarEvent } from "~/types/calendar";
import type {
  CalendarConfig,
  CalendarIntegrationService,
  IntegrationStatus,
  UserWithColor,
} from "~/types/integrations";

import { DEFAULT_LOCAL_EVENT_COLOR } from "~/types/global";
import { integrationRegistry } from "~/types/integrations";

import type { GoogleCalendarListItem } from "../../../server/integrations/google_calendar/types";

export class GoogleCalendarService implements CalendarIntegrationService {
  private integrationId: string;
  private clientId: string;
  private clientSecret: string;

  private status: IntegrationStatus = {
    isConnected: false,
    lastChecked: new Date(),
  };

  constructor(integrationId: string, clientId: string, clientSecret: string) {
    this.integrationId = integrationId;
    this.clientId = clientId;
    this.clientSecret = clientSecret;

    this.status.lastChecked = new Date();
  }

  async initialize(): Promise<void> {
    await this.validate();
  }

  async getAvailableCalendars(): Promise<CalendarConfig[]> {
    try {
      const result = await $fetch<{ calendars: GoogleCalendarListItem[] }>(
        "/api/integrations/google_calendar/calendars",
        { query: { integrationId: this.integrationId } },
      );
      return result.calendars.map(cal => ({
        id: cal.id,
        name: cal.summary,
        enabled: true,
        accessRole: cal.accessRole,
      }));
    }
    catch (error) {
      consola.error("GoogleCalendar: Failed to fetch calendars:", error);
      throw error;
    }
  }

  async validate(): Promise<boolean> {
    try {
      await $fetch<{ events: CalendarEvent[] }>(
        "/api/integrations/google_calendar/events",
        { query: { integrationId: this.integrationId } },
      );

      this.status = {
        isConnected: true,
        lastChecked: new Date(),
      };

      return true;
    }
    catch (error) {
      this.status = {
        isConnected: false,
        lastChecked: new Date(),
        error: error instanceof Error ? error.message : "Unknown error",
      };
      return false;
    }
  }

  async getStatus(): Promise<IntegrationStatus> {
    return this.status;
  }

  async testConnection(): Promise<boolean> {
    this.status = {
      isConnected: true,
      lastChecked: new Date(),
    };

    return true;
  }

  async getCapabilities(): Promise<string[]> {
    const config = integrationRegistry.get("calendar:google");
    return config?.capabilities || [];
  }

  async getEvents(): Promise<CalendarEvent[]> {
    const result = await $fetch<{
      events: CalendarEvent[];
      calendars: CalendarConfig[];
    }>("/api/integrations/google_calendar/events", {
      query: { integrationId: this.integrationId },
    });

    const calendars = result.calendars || [];
    let allUsers: UserWithColor[] = [];

    const needsUsers = calendars.some(
      cal => cal.useUserColors && cal.user && cal.user.length > 0,
    );

    if (needsUsers) {
      try {
        const users
          = await $fetch<{ id: string; name: string; color: string | null }[]>(
            "/api/users",
          );
        if (users) {
          allUsers = users;
        }
      }
      catch (error) {
        consola.warn(
          "GoogleCalendar: Failed to fetch users for Google Calendar integration:",
          error,
        );
      }
    }

    return result.events.map((event) => {
      const calendarConfig = calendars.find(c => c.id === event.calendarId);
      const eventColor
        = calendarConfig?.eventColor || DEFAULT_LOCAL_EVENT_COLOR;
      const useUserColors = calendarConfig?.useUserColors || false;
      const userIds = calendarConfig?.user || [];

      const users = allUsers.filter(u => userIds.includes(u.id));

      let color: string | string[] | undefined = eventColor;
      if (useUserColors && users.length > 0) {
        const userColors = users
          .map(u => u.color)
          .filter((color): color is string => color !== null);
        if (userColors.length > 0) {
          color = userColors.length === 1 ? userColors[0] : userColors;
        }
        else {
          color = eventColor;
        }
      }

      return {
        ...event,
        color,
        users: useUserColors ? users : undefined,
      };
    });
  }

  async updateEvent(
    eventId: string,
    eventData: Partial<CalendarEvent>,
  ): Promise<CalendarEvent> {
    try {
      const baseEventId = eventId.includes("-")
        ? eventId.split("-")[0]
        : eventId;

      const response = await $fetch<CalendarEvent>(
        `/api/integrations/google_calendar/events/${baseEventId}`,
        {
          method: "PUT",
          body: {
            integrationId: this.integrationId,
            calendarId: eventData.calendarId,
            ...eventData,
          },
        },
      );

      return response;
    }
    catch (error) {
      consola.error("GoogleCalendarService: Failed to update event:", error);
      throw error;
    }
  }

  async getEvent(eventId: string, calendarId?: string): Promise<CalendarEvent> {
    try {
      const baseEventId = eventId.includes("-")
        ? eventId.split("-")[0]
        : eventId;

      if (!calendarId) {
        consola.error("GoogleCalendarService: calendarId is required");
        throw new Error("calendarId is required");
      }

      const event = await $fetch<CalendarEvent>(
        `/api/integrations/google_calendar/events/${baseEventId}`,
        {
          query: {
            integrationId: this.integrationId,
            calendarId,
          },
        },
      );

      return event;
    }
    catch (error) {
      consola.error("GoogleCalendarService: Failed to fetch event:", error);
      throw error;
    }
  }

  async deleteEvent(eventId: string, calendarId?: string): Promise<void> {
    try {
      const baseEventId = eventId.includes("-")
        ? eventId.split("-")[0]
        : eventId;

      await $fetch(`/api/integrations/google_calendar/events/${baseEventId}`, {
        method: "DELETE",
        query: {
          integrationId: this.integrationId,
          calendarId,
        },
      });
    }
    catch (error) {
      consola.error("GoogleCalendarService: Failed to delete event:", error);
      throw error;
    }
  }

  async addEvent(
    calendarId: string,
    eventData: Partial<CalendarEvent>,
  ): Promise<CalendarEvent> {
    try {
      const response = await $fetch<CalendarEvent>(
        `/api/integrations/google_calendar/events`,
        {
          method: "POST",
          query: {
            integrationId: this.integrationId,
            calendarId,
          },
          body: eventData,
        },
      );

      return response;
    }
    catch (error) {
      consola.error("GoogleCalendarService: Failed to add event:", error);
      throw error;
    }
  }
}

export function createGoogleCalendarService(
  integrationId: string,
  clientId: string,
  clientSecret: string,
): GoogleCalendarService {
  return new GoogleCalendarService(integrationId, clientId, clientSecret);
}
