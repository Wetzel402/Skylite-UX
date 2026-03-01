---
title: Settings
parent: Usage
layout: default
nav_order: 2
permalink: /usage/settings/
---

# Settings

The Settings area in the app includes Users, Integrations, and client preferences (stored in your browser).

## Users

In **Settings > Users** you manage family members (or other users) that use the app. User data is stored on the server.

- **Add User**: Create a new user with name, optional email, profile color, or optional avatar.
- **Edit**: Change a user’s name, email, color, or avatar.
- **Delete**: Remove a user.

Profile colors are used to identify users on the calendar and in other views when you link events or items to them.

## Integrations

In **Settings > Integrations** you connect external or built-in services. Integration configuration is stored on the server.

- **Add Integration**: Choose the integration type and service, then enter credentials or options as required (e.g. iCal URL, API key, OAuth). Some integrations have a follow-up step (e.g. **Configure Shifts** for Shifts, **Select Calendars** for Google Calendar).
- **Edit**: Update an integration’s name, credentials, or options. For security, credential fields are blank when editing; enter new values to change them, or leave blank to keep existing credentials.
- **Delete**: Remove an integration.

For setup details per service (iCal, Google Calendar, Shifts, Mealie, Tandoor, etc.), see [Integrations]({{ '/integrations/' | relative_url }}).

## Client preferences

These options are stored in your browser only (in `localStorage`) and are not synced to the server.

- **Color mode**: Light, Dark (if unset by the user it follows the system setting).
- **Font**: System, Inclusive Sans, Noto Sans, EB Garamond, IBM Plex Mono, Ovo, or Handlee.
- **Default view**: The page you land on when opening the app—Calendar, Todo Lists, Shopping Lists, or Meal Planner.
- **Show week numbers**: Toggle to show or hide week numbers for shift events.
- **Notifications**: On or off. (this feature has not yet been implemented).
