"""Reminder sensors."""

from datetime import datetime

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity

from .const import DOMAIN
from .entity import ReminderEntity


async def async_setup_entry(hass, entry, async_add_entities):
    coordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities([PendingSensor(coordinator, entry), NextSensor(coordinator, entry)])


class PendingSensor(ReminderEntity, SensorEntity):
    _attr_name = "Pending reminders"
    _attr_icon = "mdi:calendar-clock"

    def __init__(self, coordinator, entry):
        super().__init__(coordinator, entry)
        self._attr_unique_id = f"{entry.entry_id}_pending"

    @property
    def native_value(self):
        return sum(
            item["status"] == "pending" and not item.get("movedToDone", False)
            for item in self.coordinator.data["reminders"]
        )


class NextSensor(ReminderEntity, SensorEntity):
    _attr_name = "Next reminder"
    _attr_device_class = SensorDeviceClass.TIMESTAMP

    def __init__(self, coordinator, entry):
        super().__init__(coordinator, entry)
        self._attr_unique_id = f"{entry.entry_id}_next"

    @property
    def native_value(self):
        values = [
            item["triggerAt"] for item in self.coordinator.data["reminders"]
            if item["status"] == "pending" and not item.get("movedToDone", False)
        ]
        return datetime.fromisoformat(min(values).replace("Z", "+00:00")) if values else None
