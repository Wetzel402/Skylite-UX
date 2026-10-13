---
title: Calendar
parent: Integrations
layout: default
nav_order: 4
permalink: /integrations/calendar/
---

# Calendar

Calendar integrations allow you to connect external calendar services to Skylite UX. You can view events from multiple calendars in a unified view, and depending on the integration, create, edit, and delete events.

## General Setup

1. In Skylite UX, go to **Settings > Integrations > Add Integration**
2. Select **Calendar** as the type and the service you are setting up
3. Configure:
   - **Credentials**: iCal URL, API key, OAuth client ID, etc.
   - **User**: Select which user(s) to link events to, or leave blank (optional)
   - **Event Color**: Choose a color for events from this calendar (optional)
   - **Use User Profile Colors**: Enable to use individual user profile colors instead of a single event color (optional)
4. Save the integration

---

## iCal

The iCal integration allows you to connect to any calendar that provides an iCal (`.ics`) feed URL. This is a read-only integration, meaning you can view events from the external calendar but cannot create, edit, or delete events through Skylite UX.

### Capabilities

- **Get events**: View events from the connected calendar feed

### Setup Instructions

1. Obtain the iCal feed URL from your calendar service
   - Common formats: `https://example.com/calendar.ics` or `webcal://example.com/calendar.ics`
   - Many calendar services provide iCal feed URLs in their settings
2. Follow the [general setup instructions](#general-setup) above.

---

## Google Calendar

The Google Calendar integration provides full two-way synchronization with your Google Calendar account. You can view, create, edit, and delete events, and select which calendars to sync.

### Capabilities

- **Get events**: View events from selected Google Calendars
- **Add events**: Create new events in Google Calendar
- **Edit events**: Modify existing events in Google Calendar
- **Delete events**: Remove events from Google Calendar
- **OAuth authentication**: Secure authentication using Google OAuth
- **Select calendars**: Choose which calendars to sync

### Setup Instructions

#### 1. Create Google OAuth Credentials

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google Calendar API:
   - Navigate to **APIs & Services > Library**
   - Search for "Google Calendar API"
   - Click **Enable**
4. Create OAuth 2.0 credentials:
   - Go to **APIs & Services > Credentials**
   - Click **Create Credentials > OAuth client ID**
   - If prompted, configure the OAuth consent screen first
   - Select **Web application** as the application type
   - Add authorized redirect URIs:
     - `http://localhost:3000/api/integrations/google_calendar/callback`
     - `http://myowndomain.com/api/integrations/google_calendar/callback`
   - Click **Create**
5. Copy the **Client ID** and **Client Secret**
6. Follow the [general setup instructions](#general-setup) above.
7. You will be redirected to Google to authorize the application
8. After authorization, you will be redirected back to Skylite UX. Configure:
   - Select which calendars to sync
   - Choose user(s) to link events to
   - Set calendar event color
   - Enable/disable user profile colors

---

### Troubleshooting

- **OAuth errors**: Ensure your redirect URI is correctly configured in Google Cloud Console
- **Calendar not appearing**: Verify the Google Calendar API is enabled in your Google Cloud project
- **Permission denied**: Check that you've granted the necessary permissions during OAuth authorization

---

## Shifts

The Shifts integration allows you to define repeating shift patterns (e.g. 2-2-2, 4 on 3 off, DuPont). A pattern is a sequence of shift and off days that repeats every N days, where N is the total length of the pattern. It does not need to be a whole number of weeks. Shift events then appear on the main calendar like other calendar integrations, allowing you to see your shifts at a glance.

### Capabilities

- **Get events**: View shift events

### Setup Instructions

1. Follow the [general setup instructions](#general-setup) above. Note: Shifts does not accept event/user color. Colors are defined per shift in the pattern.
2. After saving, the **Configure Shifts** dialog opens. You can reopen it any time from **Settings > Integrations** by editing the integration and choosing **Configure Shifts**.
3. Choose a pattern from **Patterns**, then fill in the form:
   - **Starts**: The first day of the pattern. Pick the date your first shift (or first day of the cycle) falls on.
   - **Shifts**: The segments that make up the pattern, in order. Each segment has a number of days and, for working segments, a shift type and color. The dialog shows how many days the pattern repeats over.
   - **Pattern name** (optional): A name is generated from the pattern if left blank.
   - **End date** (optional): Leave blank for a pattern that continues indefinitely.
4. Click **Save**. The shifts appear on the calendar after the next sync.

### Patterns

| Pattern | Default segments | Repeats every |
|---|---|---|
| 2-2-2 | 2 Early, 2 Late, 2 Nights, 2 off | 8 days |
| 4 on 3 off | 4 Day, 3 off | 7 days |
| Continental 2-2-3 | 2 Days, 2 off, 2 Nights, 1 Midday | 7 days |
| Days/Nights/Off | 4 Days, 4 off, 4 Nights, 4 off | 16 days |
| DuPont | 4 Nights, 3 off, 3 Days, 1 off, 3 Nights, 3 off, 4 Days, 7 off | 28 days |
| Nights only | 4 Nights, 4 off | 8 days |
| On/Off | 4 Day, 4 off | 8 days |
| Custom | Build your own with **Add shift** and **Add off** | Total of all segments |

Every pattern's day counts, shift types and colors can be changed before saving. For example, change On/Off to 7 on and 7 off for a 14-day pattern.

### Shift types and times

Each working segment uses a shift type such as Early (5am–1pm), Day (7am–7pm), Days (9am–5pm), Late (12pm–8pm), Nights (7pm–5am) or Graveyard (11pm–7am). Choose **Custom** to set your own start and end time for a segment.

Shifts appear as timed events on the calendar. A shift whose end time is earlier than its start time, such as a 7pm–7am night shift, ends the next morning. Times are in the app's timezone, set by `NUXT_PUBLIC_TZ` (see [Docker installation]({{ '/installation/docker/' | relative_url }})). A shift keeps its local start and end times across daylight saving changes.

### Editing and deleting

Configured shifts are listed under **Configured shifts** in the dialog.

- **Edit**: Change the pattern name, start date, end date and the color of each shift type. To change the segments themselves, delete the shift and add it again.
- **Delete**: Removes the shift and its pattern. Its events disappear from the calendar after the next sync.
