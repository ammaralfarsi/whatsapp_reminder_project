"""Shared entity base."""

from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN


class ReminderEntity(CoordinatorEntity):
    """Base entity tied to one config entry."""

    _attr_has_entity_name = True

    def __init__(self, coordinator, entry) -> None:
        super().__init__(coordinator)
        self._attr_device_info = {
            "identifiers": {(DOMAIN, entry.entry_id)},
            "name": entry.title,
            "manufacturer": "WhatsApp Reminder",
            "model": "Reminder Platform",
        }
