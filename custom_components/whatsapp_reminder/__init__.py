"""WhatsApp Reminder Home Assistant integration."""

import voluptuous as vol

from homeassistant.const import CONF_URL
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .api import ReminderApi
from .const import CONF_API_KEY, DOMAIN, PLATFORMS
from .coordinator import ReminderCoordinator


async def async_setup_entry(hass, entry):
    api = ReminderApi(async_get_clientsession(hass), entry.data[CONF_URL], entry.data[CONF_API_KEY])
    coordinator = ReminderCoordinator(hass, api)
    await coordinator.async_config_entry_first_refresh()
    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = coordinator
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    async def select_coordinator(call):
        entry_id = call.data.get("config_entry_id")
        return hass.data[DOMAIN].get(entry_id) if entry_id else next(iter(hass.data[DOMAIN].values()))

    if not hass.services.has_service(DOMAIN, "create_reminder"):
        async def create_reminder(call):
            selected = await select_coordinator(call)
            payload = {key: value for key, value in call.data.items() if key != "config_entry_id"}
            await selected.api.create_reminder(payload)
            await selected.async_request_refresh()

        async def send_now(call):
            selected = await select_coordinator(call)
            await selected.api.send_now(call.data["reminder_id"])
            await selected.async_request_refresh()

        hass.services.async_register(
            DOMAIN,
            "create_reminder",
            create_reminder,
            schema=vol.Schema({
                vol.Optional("config_entry_id"): cv.string,
                vol.Required("numberId"): cv.string,
                vol.Required("recipient"): cv.string,
                vol.Required("message"): cv.string,
                vol.Required("triggerDateTime"): cv.string,
                vol.Optional("recurring", default=False): cv.boolean,
                vol.Optional("frequency", default="none"): vol.In(["none", "daily", "weekly", "monthly", "yearly"]),
            }),
        )
        hass.services.async_register(
            DOMAIN,
            "send_now",
            send_now,
            schema=vol.Schema({
                vol.Optional("config_entry_id"): cv.string,
                vol.Required("reminder_id"): cv.string,
            }),
        )
    return True


async def async_unload_entry(hass, entry):
    unloaded = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unloaded:
        hass.data[DOMAIN].pop(entry.entry_id)
        if not hass.data[DOMAIN]:
            hass.services.async_remove(DOMAIN, "create_reminder")
            hass.services.async_remove(DOMAIN, "send_now")
    return unloaded
