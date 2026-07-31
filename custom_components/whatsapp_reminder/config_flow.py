"""Config flow for WhatsApp Reminder."""

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.const import CONF_URL
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .api import ReminderApi, ReminderApiError
from .const import CONF_API_KEY, DEFAULT_URL, DOMAIN


class WhatsAppReminderConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Configure an app user."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        errors = {}
        if user_input is not None:
            url = user_input[CONF_URL].rstrip("/")
            api = ReminderApi(async_get_clientsession(self.hass), url, user_input[CONF_API_KEY])
            try:
                profile = await api.validate()
            except ReminderApiError:
                errors["base"] = "cannot_connect"
            else:
                await self.async_set_unique_id(f"{url}:{profile['id']}")
                self._abort_if_unique_id_configured()
                return self.async_create_entry(
                    title=profile.get("displayName") or "WhatsApp Reminder",
                    data={CONF_URL: url, CONF_API_KEY: user_input[CONF_API_KEY]},
                )
        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_URL, default=DEFAULT_URL): str,
                    vol.Required(CONF_API_KEY): str,
                }
            ),
            errors=errors,
        )
