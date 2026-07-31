"""Gateway connection sensor."""

from homeassistant.components.binary_sensor import BinarySensorDeviceClass, BinarySensorEntity

from .const import DOMAIN
from .entity import ReminderEntity


async def async_setup_entry(hass, entry, async_add_entities):
    coordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities([GatewaySensor(coordinator, entry)])


class GatewaySensor(ReminderEntity, BinarySensorEntity):
    _attr_name = "WhatsApp gateways"
    _attr_device_class = BinarySensorDeviceClass.CONNECTIVITY

    def __init__(self, coordinator, entry):
        super().__init__(coordinator, entry)
        self._attr_unique_id = f"{entry.entry_id}_gateways"

    @property
    def is_on(self):
        numbers = self.coordinator.data["numbers"]
        return bool(numbers) and all(item["status"] == "connected" for item in numbers)

    @property
    def extra_state_attributes(self):
        numbers = self.coordinator.data["numbers"]
        return {
            "connected": sum(item["status"] == "connected" for item in numbers),
            "total": len(numbers),
            "gateways": {
                item["label"]: {"gateway": item["gateway"], "status": item["status"]}
                for item in numbers
            },
        }
